/** Pure server-side DPM calculations. No legacy delivered-status inference. */
export type WorkInterval={start:string;end:string};
export type Calendar={workingWeekdays:number[];workingIntervals:Record<string,WorkInterval[]>;exceptions:Record<string,{working:boolean;intervals:WorkInterval[]}>};
export type AcceptedReceipt={at:string;quantity:number};
export type PerformanceItem={id:number;quantity:number;receipts:AcceptedReceipt[]};
export type ApprovedImpact={start:string;end:string;admissibleMinutes:number;approved:boolean;evidenced:boolean};
export type PerformanceOrder={id:number;due:string;calendar:Calendar;items:PerformanceItem[];impacts:ApprovedImpact[];cancelled:boolean};
const DAY=86400000;
export function dateOnly(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(`${value}T00:00:00Z`))||new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value)throw new Error('Date civile invalide');
 return value;
}
export function tunisDay(instant:string){const time=new Date(instant);if(!Number.isFinite(time.getTime()))throw new Error('Instant invalide');return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Tunis',year:'numeric',month:'2-digit',day:'2-digit'}).format(time);}
function days(start:string,end:string){dateOnly(start);dateOnly(end);const first=Date.parse(`${start}T00:00Z`),last=Date.parse(`${end}T00:00Z`);if(last-first>DAY*36600)throw new Error('Période trop longue');const out:string[]=[];for(let t=first+DAY;t<=last;t+=DAY)out.push(new Date(t).toISOString().slice(0,10));return out;}
export function workingSpans(day:string,calendar:Calendar):WorkInterval[]{
 dateOnly(day);const exception=calendar.exceptions[day];if(exception)return exception.working?exception.intervals:[];
 const weekday=new Date(`${day}T00:00Z`).getUTCDay()||7;
 return calendar.workingWeekdays.includes(weekday)?calendar.workingIntervals[String(weekday)]??[]:[];
}
export function workingDays(start:string,end:string,calendar:Calendar){return days(start,end).filter(day=>workingSpans(day,calendar).length>0).length;}
function tunisMinute(day:string,time:string){
 const desired=Date.parse(`${day}T${time}:00Z`);
 let candidate=desired;
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Tunis',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 for(let step=0;step<2;step++){
  const p=Object.fromEntries(formatter.formatToParts(new Date(candidate)).map(part=>[part.type,part.value]));
  const represented=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute));
  candidate+=desired-represented;
 }
 return candidate;
}
function unionLength(spans:[number,number][]){let total=0,end=-Infinity;for(const [a,b]of spans.sort((x,y)=>x[0]-y[0])){if(b>end){total+=b-Math.max(a,end);end=b;}}return total;}
/** Impacts are proven RESIDUAL critical-path windows, not raw event stop times.
 * All simultaneous windows are unioned conservatively, even across paths.
 * Only full evidenced/approved windows with enough approved minutes are eligible;
 * partial authorizations without an exact residual window remain unqualified.
 */
export function excusedDays(start:string,end:string,calendar:Calendar,impacts:ApprovedImpact[]){
 let result=0;
 for(const day of days(start,end)){
  const schedule=workingSpans(day,calendar).map(span=>[tunisMinute(day,span.start),tunisMinute(day,span.end)] as [number,number]);
  const duration=schedule.reduce((n,[a,b])=>n+b-a,0);if(!duration)continue;
  const eligible=impacts.filter(i=>i.approved&&i.evidenced&&Date.parse(i.end)>Date.parse(i.start)&&i.admissibleMinutes*60000>=Date.parse(i.end)-Date.parse(i.start));
  const clips:[number,number][]=[];
  for(const impact of eligible)for(const [a,b]of schedule){const x=Math.max(a,Date.parse(impact.start)),y=Math.min(b,Date.parse(impact.end));if(y>x)clips.push([x,y]);}
  result+=Math.min(1,unionLength(clips)/duration);
 }
 return result;
}
export function itemCompletion(item:PerformanceItem,asOf:string){
 let accepted=0,completion:string|null=null,completionAt:string|null=null;
 for(const receipt of [...item.receipts].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))){
  if(tunisDay(receipt.at)>asOf)continue;
  if(!Number.isSafeInteger(receipt.quantity)||receipt.quantity<0)throw new Error('Quantité acceptée invalide');
  accepted+=receipt.quantity;if(completion===null&&accepted>=item.quantity){completion=tunisDay(receipt.at);completionAt=receipt.at;}
 }
 return {accepted,remaining:Math.max(0,item.quantity-accepted),completion,completionAt};
}
export function orderPerformance(order:PerformanceOrder,asOf:string){
 dateOnly(asOf);dateOnly(order.due);
 const items=order.items.filter(item=>item.quantity>0).map(item=>({id:item.id,...itemCompletion(item,asOf)}));
 const completion=items.length&&items.every(i=>i.completion)?items.map(i=>i.completion!).sort().at(-1)!:null;
 const eligible=!order.cancelled&&items.length>0&&order.due<=asOf;
 const end=completion??asOf;
 const gross=eligible?workingDays(order.due,end,order.calendar):0;
 const completionAt=completion?items.map(i=>i.completionAt!).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1)!:null;
 const residuals=completionAt?order.impacts.map(i=>({...i,end:new Date(Math.min(Date.parse(i.end),Date.parse(completionAt))).toISOString()})):order.impacts;
 const excused=eligible?Math.min(gross,excusedDays(order.due,end,order.calendar,residuals)):0;
 return {id:order.id,due:order.due,eligible,cancelled:order.cancelled,completion,items,gross,excused,net:Math.max(0,gross-excused),partial:!completion&&items.some(i=>i.accepted>0),onTime:completion!==null&&completion<=order.due};
}
export function performanceKpis(orders:ReturnType<typeof orderPerformance>[]){
 if(new Set(orders.map(o=>o.id)).size!==orders.length)throw new Error('Commandes dupliquées dans la consolidation');
 const due=orders.filter(o=>o.eligible),complete=due.filter(o=>o.completion),grossLate=complete.filter(o=>o.gross>0),allGrossLate=due.filter(o=>o.gross>0),netLate=due.filter(o=>o.net>0),onTime=complete.filter(o=>o.onTime);
 const ratio=(n:number,d:number)=>d?n/d*100:null;
 return {eligible:due.length,completed:complete.length,partials:due.filter(o=>o.partial).length,backlog:due.filter(o=>!o.completion&&o.gross>0).length,
 TRB:ratio(grossLate.length,due.length),TRM:ratio(netLate.length,due.length),OTD:ratio(onTime.length,complete.length),OTIF:ratio(onTime.length,due.length),
 meanGross:allGrossLate.length?allGrossLate.reduce((n,o)=>n+o.gross,0)/allGrossLate.length:null,meanNet:netLate.length?netLate.reduce((n,o)=>n+o.net,0)/netLate.length:null};
}
