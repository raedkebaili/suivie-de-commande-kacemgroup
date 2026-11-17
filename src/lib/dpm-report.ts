import { and,eq } from 'drizzle-orm';
import { db } from '@/db';
import { orders,orderItems,clients,dpmGrants,dpmCommitments,dpmCommitmentDecisions,dpmCalendars,dpmCalendarDays,dpmDeliveries,dpmDeliveryLines,dpmReceipts,dpmEventImpacts,dpmEvents } from '@/db/schema';
import { dateOnly,tunisDay,orderPerformance,performanceKpis,type Calendar,type PerformanceOrder } from './dpm-performance';
import { agencyScopeForUser } from './agency-access';
import type { UserPayload } from './auth';
export class DpmReportDenied extends Error {}
export async function loadDpmReport(user:UserPayload,query:URLSearchParams){
 const to=dateOnly(query.get('to')||tunisDay(new Date().toISOString()));
 const from=dateOnly(query.get('from')||`${to.slice(0,7)}-01`);
 if(from>to)throw new Error('Période inversée');
 const site=query.get('site')?Number(query.get('site')):null;
 if(site!==null&&(!Number.isSafeInteger(site)||site<=0))throw new Error('Site invalide');
 const grants=await db.select().from(dpmGrants).where(and(eq(dpmGrants.userId,user.id),eq(dpmGrants.active,true),eq(dpmGrants.capability,'READ')));
 const global=grants.some(g=>g.factoryId===null),allowed=new Set(grants.map(g=>g.factoryId));
 if(!grants.length||(site!==null&&!global&&!allowed.has(site)))throw new DpmReportDenied('Habilitation READ explicite requise');
 const agencyIds=await agencyScopeForUser(user);
 // One repeatable snapshot for facts, receipts, decisions and calendar versions.
 return db.transaction(async tx=>{
  const [contracts,decisions,calendars,exceptions,shipments,lines,receipts,impacts,events,orderRows,itemRows,clientRows]=await Promise.all([
   tx.select().from(dpmCommitments),tx.select().from(dpmCommitmentDecisions),tx.select().from(dpmCalendars),tx.select().from(dpmCalendarDays),tx.select().from(dpmDeliveries),tx.select().from(dpmDeliveryLines),tx.select().from(dpmReceipts),tx.select().from(dpmEventImpacts),tx.select().from(dpmEvents),tx.select().from(orders),tx.select().from(orderItems),tx.select().from(clients),
  ]);
  const approved=new Set(decisions.filter(d=>d.decision==='APPROVED').map(d=>d.commitmentId));
  const current=new Map<number,typeof contracts[number]>();
  for(const c of contracts)if(c.decision==='APPROVED'||approved.has(c.id)){const old=current.get(c.orderId);if(!old||c.version>old.version)current.set(c.orderId,c);}
  const corrected=new Set(receipts.map(r=>r.correctionOfId).filter(id=>id!==null));
  const results:ReturnType<typeof orderPerformance>[]=[],rows:({number:string;client:string;sites:number[]}&ReturnType<typeof orderPerformance>)[]=[];
  const unqualified:{orderId:number;number:string;reason:string}[]=[];
  for(const c of current.values()){
   const order=orderRows.find(o=>o.id===c.orderId);if(!order||(agencyIds&&!agencyIds.includes(order.agencyId)))continue;
   const ownLines=lines.filter(l=>shipments.some(s=>s.id===l.deliveryId&&s.orderId===c.orderId));
   const sites=new Set<number>();if(c.approvalFactoryId)sites.add(c.approvalFactoryId);
   for(const l of ownLines){sites.add(l.manufacturingFactoryId);sites.add(shipments.find(s=>s.id===l.deliveryId)!.dispatchFactoryId);}
   for(const i of impacts.filter(i=>i.orderId===c.orderId)){const e=events.find(e=>e.id===i.eventId);if(e)sites.add(e.factoryId);}
   if(!global&&(!sites.size||[...sites].some(id=>!allowed.has(id))))continue; // Never leak a whole multisite order from one portion.
   if(site!==null&&!sites.has(site))continue;
   if(c.confirmedDueDate<from||c.confirmedDueDate>to)continue;
   const fail=(reason:string)=>unqualified.push({orderId:order.id,number:order.orderNumber,reason});
   const calendar=calendars.find(v=>v.id===c.calendarId);
   if(!calendar?.publishedAt||calendar.timezone!=='Africa/Tunis'){fail('Calendrier tunisien publié manquant');continue;}
   const days=exceptions.filter(d=>d.calendarId===calendar.id);
   if(days.some(d=>!d.validatedAt)){fail('Exception de calendrier non validée');continue;}
   const schedule:Calendar={workingWeekdays:calendar.workingWeekdays,workingIntervals:calendar.workingIntervals as Calendar['workingIntervals'],exceptions:Object.fromEntries(days.map(d=>[d.day,{working:d.working,intervals:d.intervals as Calendar['workingIntervals'][string]}]))};
   const agreed=c.agreedItems as {itemId:number;quantity:number}[];
   const actualItems=itemRows.filter(i=>i.orderId===order.id&&i.quantity>0);
   if(actualItems.length!==agreed.length||agreed.some(a=>!actualItems.some(i=>i.id===a.itemId&&i.quantity===a.quantity))){fail('Quantités actuelles différentes de l’engagement : révision requise');continue;}
   const items=agreed.map(a=>{
    const ids=ownLines.filter(l=>l.itemId===a.itemId).map(l=>l.id);
    return {id:a.itemId,quantity:a.quantity,receipts:receipts.filter(r=>ids.includes(r.lineId)&&!corrected.has(r.id)&&r.status!=='PENDING'&&r.validatedAt&&r.proofDocumentId).map(r=>({at:r.receivedAt,quantity:r.acceptedQty}))};
   });
   if(items.some(i=>i.receipts.reduce((n,r)=>n+r.quantity,0)>(actualItems.find(a=>a.id===i.id)?.deliveredQty??0))){fail('Réception supérieure au cumul expédié actuel : correction à analyser');continue;}
   const cancelled=order.status==='ANNULEE'||order.productionStatus==='ANNULEE';
   if(cancelled&&!order.cancelReason?.trim()){fail('Annulation non documentée');continue;}
   const input:PerformanceOrder={id:order.id,due:c.confirmedDueDate,calendar:schedule,items,cancelled,impacts:impacts.filter(i=>i.orderId===order.id&&i.commitmentId===c.id).map(i=>({start:i.startsAt,end:i.endsAt,admissibleMinutes:i.admissibleMinutes,approved:['APPROVED','PARTIAL'].includes(i.decision)&&Boolean(i.validatedAt),evidenced:Boolean(i.proofDocumentId)}))};
   const result=orderPerformance(input,to);results.push(result);rows.push({...result,number:order.orderNumber,client:clientRows.find(v=>v.id===order.clientId)?.name??'',sites:[...sites]});
  }
  return {from,to,kpis:performanceKpis(results),rows,unqualified,bySite:[...new Set(rows.flatMap(r=>r.sites))].map(id=>({id,...performanceKpis(rows.filter(r=>r.sites.includes(id)))})),notice:'Réceptions acceptées uniquement. Sites non additifs ; consolidation par commandes distinctes. Impacts partiels sans fenêtre résiduelle entièrement approuvée non déduits.'};
 },{isolationLevel:'repeatable read'});
}
