import { describe,it,expect } from 'vitest';
import { workingDays,orderPerformance,performanceKpis,excusedDays,type Calendar,type PerformanceOrder } from '../dpm-performance';
// Explicit SYNTHETIC four-hour shifts. Not a seeded production calendar.
const calendar:Calendar={workingWeekdays:[1,2,3,4,5,6],workingIntervals:Object.fromEntries([1,2,3,4,5,6].map(d=>[String(d),[{start:'08:00',end:'12:00'}]])),exceptions:{}};
const receipt=(quantity:number,day:string)=>({quantity,at:`${day}T11:00:00+01:00`});
const base=():PerformanceOrder=>({id:1,due:'2026-10-15',calendar,items:[{id:1,quantity:10,receipts:[]}],impacts:[],cancelled:false});
const run=(o:PerformanceOrder)=>orderPerformance(o,'2026-10-17');
const impact=(approved:boolean)=>({start:'2026-10-16T08:00:00+01:00',end:'2026-10-16T12:00:00+01:00',admissibleMinutes:240,approved,evidenced:true});
describe('18 mandatory DPM KPI scenarios',()=>{
 it('01 completed on time',()=>{const o=base();o.items[0].receipts=[receipt(10,o.due)];const p=run(o);expect(p.gross).toBe(0);expect(performanceKpis([p]).OTIF).toBe(100);});
 it('02 completed late',()=>{const o=base();o.items[0].receipts=[receipt(10,'2026-10-17')];expect(run(o).gross).toBe(2);expect(performanceKpis([run(o)]).TRB).toBe(100);});
 it('03 completed early',()=>{const o=base();o.items[0].receipts=[receipt(10,'2026-10-14')];expect(run(o).gross).toBe(0);expect(run(o).onTime).toBe(true);});
 it('04 open overdue',()=>{const k=performanceKpis([run(base())]);expect(k.backlog).toBe(1);expect(k.TRB).toBe(0);expect(k.TRM).toBe(100);});
 it('05 open not yet due',()=>{const o=base();o.due='2026-10-20';expect(run(o).eligible).toBe(false);expect(performanceKpis([run(o)]).TRM).toBeNull();});
 it('06 partial on time is not full',()=>{const o=base();o.items[0].receipts=[receipt(4,o.due)];expect(run(o).partial).toBe(true);expect(run(o).completion).toBeNull();expect(performanceKpis([run(o)]).OTIF).toBe(0);});
 it('07 partial late remains overdue',()=>{const o=base();o.items[0].receipts=[receipt(4,'2026-10-17')];expect(run(o).gross).toBe(2);expect(run(o).items[0].remaining).toBe(6);});
 it('08 partials complete at final accepted receipt',()=>{const o=base();o.items[0].receipts=[receipt(4,o.due),receipt(6,'2026-10-17')];expect(run(o).completion).toBe('2026-10-17');expect(run(o).gross).toBe(2);});
 it('09 evidenced approved external power residual deducts',()=>{const o=base();o.impacts=[impact(true)];expect(run(o).net).toBe(1);});
 it('10 unapproved power residual never deducts',()=>{const o=base();o.impacts=[impact(false)];expect(run(o).net).toBe(2);});
 it('11 internal failure not automatically excused',()=>{const o=base();o.impacts=[{...impact(false),evidenced:false}];expect(run(o).net).toBe(2);});
 it('12 simultaneous approved residuals union without double counting',()=>{const o=base();o.impacts=[impact(true),impact(true)];expect(run(o).excused).toBe(1);expect(run(o).net).toBe(1);});
 it('13 approved revised contractual due independent of order date',()=>{const o=base();o.due='2026-10-17';o.items[0].receipts=[receipt(10,'2026-10-17')];expect(run(o).gross).toBe(0);});
 it('14 documented cancelled order excluded',()=>{const o=base();o.cancelled=true;expect(performanceKpis([run(o)]).eligible).toBe(0);});
 it('15 multisite articles cannot offset each other with surplus',()=>{const o=base();o.items=[{id:1,quantity:10,receipts:[receipt(15,o.due)]},{id:2,quantity:5,receipts:[]}];expect(run(o).completion).toBeNull();expect(()=>performanceKpis([run(o),run(o)])).toThrow('dupliquées');});
 it('16 holiday and Sunday excluded; starting day excluded',()=>{const c={...calendar,exceptions:{'2026-10-16':{working:false,intervals:[]}}};expect(workingDays('2026-10-15','2026-10-19',c)).toBe(2);});
 it('17 shared event affects distinct orders without averaging site rates',()=>{const a=base(),b=base();b.id=2;a.impacts=[impact(true)];b.impacts=[impact(true)];expect(performanceKpis([run(a),run(b)]).eligible).toBe(2);expect(run(a).net).toBe(1);expect(run(b).net).toBe(1);});
 it('18 empty denominators are N/A and unsupported partial authorizations not guessed',()=>{expect(performanceKpis([]).OTD).toBeNull();expect(performanceKpis([]).meanGross).toBeNull();expect(excusedDays('2026-10-15','2026-10-17',calendar,[{...impact(true),admissibleMinutes:120}])).toBe(0);});
});
