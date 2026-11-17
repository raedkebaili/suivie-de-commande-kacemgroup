import { NextRequest,NextResponse } from 'next/server';
import { getUserFromHeaders } from '@/lib/auth';
import { db } from '@/db';
import { dpmSchemaAvailable } from '@/lib/dpm-backup';
import { loadDpmReport,DpmReportDenied } from '@/lib/dpm-report';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 if(process.env.DPM_ENABLED!=='true')return NextResponse.json({error:'DPM non activé. Migration contrôlée et habilitations nécessaires.'},{status:503});
 const user=await getUserFromHeaders(request);if(!user)return NextResponse.json({error:'Non authentifié'},{status:401});
 try{
  if(!await dpmSchemaAvailable(db))return NextResponse.json({error:'Schéma DPM absent. Aucune migration automatique effectuée.'},{status:503});
  return NextResponse.json(await loadDpmReport(user,new URL(request.url).searchParams),{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){
  if(error instanceof DpmReportDenied)return NextResponse.json({error:error.message},{status:403});
  if(error instanceof Error&&['Date civile invalide','Période inversée','Site invalide','Période trop longue'].includes(error.message))return NextResponse.json({error:error.message},{status:400});
  console.error('DPM report failed',error);return NextResponse.json({error:'Rapport DPM indisponible. Aucun indicateur de remplacement calculé.'},{status:500});
 }
}
