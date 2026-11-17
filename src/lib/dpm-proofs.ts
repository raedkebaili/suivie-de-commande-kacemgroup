import { sql } from "drizzle-orm";
import { db } from "@/db";
import { dpmSchemaAvailable } from "./dpm-backup";
type Executor = Pick<typeof db, "execute">;
// A shared proof requires READ at every associated site. Unknown site stays
// global-only: lack of mapping must never broaden access.
const scopes = sql`
 SELECT c.proof_document_id AS id, coalesce(cd.factory_id,l.manufacturing_factory_id) AS factory_id FROM dpm_commitments c
 LEFT JOIN dpm_commitment_decisions cd ON cd.commitment_id=c.id
 LEFT JOIN dpm_delivery_lines l ON l.commitment_id=c.id WHERE c.proof_document_id IS NOT NULL
 UNION SELECT proof_document_id,factory_id FROM dpm_commitment_decisions
 UNION SELECT r.proof_document_id,l.manufacturing_factory_id FROM dpm_receipts r JOIN dpm_delivery_lines l ON l.id=r.line_id WHERE r.proof_document_id IS NOT NULL
 UNION SELECT r.proof_document_id,d.dispatch_factory_id FROM dpm_receipts r JOIN dpm_delivery_lines l ON l.id=r.line_id JOIN dpm_deliveries d ON d.id=l.delivery_id WHERE r.proof_document_id IS NOT NULL
 UNION SELECT i.proof_document_id,e.factory_id FROM dpm_event_impacts i JOIN dpm_events e ON e.id=i.event_id WHERE i.proof_document_id IS NOT NULL
 UNION SELECT proof_document_id,factory_id FROM dpm_milestones WHERE proof_document_id IS NOT NULL
 UNION SELECT proof_document_id,destination_factory_id FROM dpm_milestones WHERE proof_document_id IS NOT NULL AND destination_factory_id IS NOT NULL
 UNION SELECT (proof.value::text)::integer,e.factory_id FROM dpm_event_reviews r JOIN dpm_events e ON e.id=r.event_id
 CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.evidence_snapshot)='array' THEN r.evidence_snapshot ELSE '[]'::jsonb END) proof
 WHERE jsonb_typeof(proof.value)='number' AND proof.value::text ~ '^[1-9][0-9]{0,8}$'`;
export async function protectedDpmFileIds(tx:Executor=db):Promise<string[]> {
 if (!await dpmSchemaAvailable(tx)) return [];
 const rows=await tx.execute(sql`SELECT DISTINCT d.drive_file_id FROM drive_documents d JOIN (${scopes}) p ON p.id=d.id`);
 return rows.rows.map(r=>String(r.drive_file_id));
}
export async function hasDpmProofs(tx:Executor=db){return (await protectedDpmFileIds(tx)).length>0;}
export async function isDpmProofFile(fileId:string,tx:Executor=db){return (await protectedDpmFileIds(tx)).includes(fileId);}
export async function canReadDpmProofFile(fileId:string,userId:number,tx:Executor=db){
 if(!await dpmSchemaAvailable(tx))return true;
 const denied=await tx.execute(sql`SELECT EXISTS(SELECT 1 FROM drive_documents d JOIN (${scopes}) p ON p.id=d.id
 WHERE d.drive_file_id=${fileId} AND NOT EXISTS(SELECT 1 FROM dpm_grants g WHERE g.user_id=${userId} AND EXISTS(SELECT 1 FROM users WHERE id=g.user_id AND active) AND g.active AND g.capability='READ' AND (g.factory_id IS NULL OR g.factory_id=p.factory_id))) AS denied`);
 return !denied.rows[0]?.denied;
}
export class DpmProtectedFile extends Error {}
export type ParentReader=(id:string)=>Promise<string[]>;
// Follow ancestors of each PROOF (not all storage files). This protects parent
// folders without blocking unrelated files. Missing/unreadable ancestry fails closed.
export async function assertDpmMutationAllowed(targetId:string,parents:ParentReader,tx:Executor=db){
 const proofs=await protectedDpmFileIds(tx);
 for(const proof of proofs){
   const pending=[proof]; const seen=new Set<string>();
   while(pending.length){
     const id=pending.pop()!;
     if(id===targetId)throw new DpmProtectedFile("Fichier ou dossier associé à une preuve DPM protégée");
     if(seen.has(id))continue; seen.add(id);
     if(seen.size>128)throw new DpmProtectedFile("Arborescence de preuve trop profonde : opération refusée");
     let ancestors:string[];try{ancestors=await parents(id);}catch{throw new DpmProtectedFile("Impossible de vérifier l'arborescence des preuves DPM");}
     pending.push(...ancestors);
   }
 }
}
export async function verifyDpmDriveFiles(read:(id:string)=>Promise<{trashed?:boolean|null}>,tx:Executor=db){
 const results:{id:string;status:"present"|"missing_or_inaccessible"}[]=[];
 for(const id of await protectedDpmFileIds(tx)){
   try {const file=await read(id);results.push({id,status:file.trashed?"missing_or_inaccessible":"present"});}
   catch{results.push({id,status:"missing_or_inaccessible"});}
 }
 return results;
}
// Serialize remote mutations with DPM decisions, grants and backup/restore.
export async function withDpmStorageMutation<T>(targetId:string,parents:ParentReader,operation:()=>Promise<T>){
 return db.transaction(async tx=>{await tx.execute(sql`SELECT pg_advisory_xact_lock(746201,1)`);await assertDpmMutationAllowed(targetId,parents,tx);return operation();});
}
