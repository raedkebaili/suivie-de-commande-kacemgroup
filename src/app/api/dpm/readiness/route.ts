import { NextRequest,NextResponse } from 'next/server';
import { db } from '@/db';
import { getUserFromHeaders } from '@/lib/auth';
import { inspectDpmReadiness } from '@/lib/dpm-readiness';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const user=await getUserFromHeaders(request);
 if(!user||user.role!=='superadmin')return NextResponse.json({error:'Accès refusé'},{status:403});
 try{return NextResponse.json(await inspectDpmReadiness(db),{headers:{'Cache-Control':'private, no-store'}});}
 catch{return NextResponse.json({error:'Diagnostic indisponible. Aucune migration exécutée.'},{status:503});}
}
