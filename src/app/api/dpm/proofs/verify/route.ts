import { dpmOperationalReady } from "@/lib/dpm-readiness";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getUserFromHeaders } from "@/lib/auth";
import { getDriveClient } from "@/lib/google-drive";
import { verifyDpmDriveFiles } from "@/lib/dpm-proofs";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest){
 if(process.env.DPM_CONFIGURATION_ENABLED!=="true")return NextResponse.json({error:"Module non activé"},{status:404});
 const user=await getUserFromHeaders(request);
 if(!user||user.role!=="superadmin")return NextResponse.json({error:"Accès refusé"},{status:403});
 if(!await dpmOperationalReady(db))return NextResponse.json({error:"Protections SQL DPM incomplètes"},{status:503});
 const grants=await db.execute(sql`SELECT id FROM dpm_grants WHERE user_id=${user.id} AND active AND capability='READ' AND factory_id IS NULL LIMIT 1`);
 if(!grants.rows.length)return NextResponse.json({error:"READ global explicite requis pour la recette des preuves"},{status:403});
 try{
  const {drive}=await getDriveClient();
  const files=await verifyDpmDriveFiles(async fileId=>(await drive.files.get({fileId,fields:'id,trashed'})).data);
  return NextResponse.json({checkedAt:new Date().toISOString(),ok:files.every(f=>f.status==='present'),files});
 }catch{return NextResponse.json({error:"Vérification Drive indisponible : recette non démontrée"},{status:503});}
}
