
const TYPES=[{id:1,k:"EQUIPMENT"},{id:2,k:"ACCESSORIES"},{id:3,k:"EXPENDABLE"},{id:4,k:"TRANSPORT"},{id:5,k:"CREW"},{id:6,k:"SUBRENT"},{id:7,k:"FREELANCE"}];
const STOCKED_TYPES=[1,2,4];                 // physical items we own and can double-book
const STATUSES=["Quote","Order","Approve","Shipped","Returned","Draft INV"];
const BLOCKING=["Order","Approve","Shipped"];  // these hold stock; Quote only warns
const OPEN=["Quote","Order","Approve","Shipped","Returned"];
const r2=n=>Math.round((+n||0)*100)/100;
function pD(s){const [y,m,d]=String(s).slice(0,10).split("-").map(Number);return Date.UTC(y,m-1,d);}
function spanDays(a,b){ if(!a||!b) return 0; const n=Math.round((pD(b)-pD(a))/864e5)+1; return n>0?n:0; }
/* Daily: every calendar day counts. Weekly: each full week charges `dpw` days, leftover days charge up to `dpw`. */
function chargeDays(a,b,rentType,dpw){ const n=spanDays(a,b); if(rentType!=="Weekly"||!(+dpw>0)) return n; const w=Math.floor(n/7), rem=n%7; return w*(+dpw)+Math.min(rem,+dpw); }
/* Customer discount applies only to discountable items; maxDisc>0 caps it (0 = no cap, as in the old system). */
function defaultDisc(prod,custDisc){ if(!prod||!prod.discountable) return 0; const c=Math.max(0,Math.min(100,+custDisc||0)); return prod.maxDisc>0?Math.min(c,prod.maxDisc):c; }
function lineCalc(l){
  /* Package parts are usually free (list 0) but the old system lets a part carry its own price, e.g. cable guards inside a generator package. */
  const price=(l.foc||l.sb)?0:(+l.list||0);
  let amount=price*(+l.qty||0)*(+l.days||0);
  if(l.t===5||l.t===7) amount+= (+l.otRate||0)*(+l.ot||0)*(+l.qty||0);   // crew and freelance both bill OT
  amount=r2(amount);
  const d=Math.max(0,Math.min(100,+l.disc||0));
  const total=r2(amount*(1-d/100));
  return {amount,total,disc:r2(amount-total)};
}
function typeTotals(lines,t){ let list=0,disc=0,sub=0; for(const l of lines){ if(l.t!==t) continue; const c=lineCalc(l); list+=c.amount; disc+=c.disc; sub+=c.total; } return {list:r2(list),disc:r2(disc),sub:r2(sub)}; }
function orderTotals(lines,o){
  let list=0,disc=0,sub=0; for(const l of lines){ const c=lineCalc(l); list+=c.amount; disc+=c.disc; sub+=c.total; }
  list=r2(list); disc=r2(disc); sub=r2(sub);
  const xp=Math.max(0,Math.min(100,+(o&&o.extraDisc)||0)); const extra=r2(sub*xp/100);
  const ins=r2(+(o&&o.insurance)||0);
  const adj=r2(+(o&&o.adjust)||0);             // "Adjust Grand Total": a fixed amount added to (or taken off) the sub total
  const base=r2(sub-extra+adj+ins);
  const vat=(o&&o.tax==="Not Vat")?0:r2(base*0.07);
  return {list,disc,sub,extra,adj,ins,base,vat,total:r2(base+vat)};
}
/* How many units of each stocked product an order holds (children included). */
function usageOf(lines){ const m={}; for(const l of lines){ if(!STOCKED_TYPES.includes(l.t)||!l.pid) continue; m[l.pid]=(m[l.pid]||0)+(+l.qty||0); } return Object.entries(m).map(([p,q])=>[+p,q]); }
function overlaps(o,a,b,today){ if(!o.ship||!o.ret) return false; let e=o.ret; if(o.status==="Shipped"&&today&&e<today) e=today; return o.ship<=b&&e>=a; }
function bookedQty(pid,a,b,orders,exclId,today,statuses){ let n=0; for(const o of orders){ if(o.id===exclId||!(statuses||BLOCKING).includes(o.status)||!overlaps(o,a,b,today)) continue; for(const [p,q] of (o.usage||[])) if(p===pid) n+=q; } return n; }
/* Package: adding a parent adds children at qty×ratio, priced 0, linked by parent key. */
function expandKit(parentLine,kit,catalog,newKey){ return (kit||[]).map(([cid,ratio,price])=>{ const c=catalog.get(cid); return {k:newKey(),t:parentLine.t,pid:cid,code:c?c.code:"",desc:c?c.desc:"",list:+price||0,qty:(+parentLine.qty||0)*(+ratio||1),ratio:+ratio||1,days:parentLine.days,disc:0,foc:false,sb:false,start:parentLine.start,end:parentLine.end,parent:parentLine.k,remark:""}; }); }
function syncChildren(lines){ const byK=new Map(lines.map(l=>[l.k,l])); for(const l of lines){ if(!l.parent) continue; const p=byK.get(l.parent); if(!p) continue; l.qty=(+p.qty||0)*(+l.ratio||1); l.days=p.days; l.start=p.start; l.end=p.end; } return lines; }
/* Status rules. Returns null when allowed, else a reason key. */
const MOVES={Quote:["Order"],Order:["Approve","Quote"],Approve:["Shipped","Order"],Shipped:["Returned"],Returned:["Draft INV"]};
const MOVE_ROLES={"Quote>Order":["sale"],"Order>Quote":["sale"],"Order>Approve":["sale"],"Approve>Order":["sale"],"Approve>Shipped":["store"],"Shipped>Returned":["store"],"Returned>Draft INV":["accounting"]};
function moveCheck(role,o,to,lines,issues){
  if(to==="Cancel"){ if(!["Quote","Order","Approve"].includes(o.status)) return "rNoCancel"; return (role==="admin"||role==="sale")?null:"rRole"; }
  if(!(MOVES[o.status]||[]).includes(to)) return "rFlow";
  const key=o.status+">"+to; if(role!=="admin"&&!(MOVE_ROLES[key]||[]).includes(role)) return "rRole";
  if(to==="Order"||to==="Approve"){ if(!o.customerName) return "rNeedCust"; if(!o.ship||!o.ret) return "rNeedDates"; if(!lines.length) return "rNeedItems"; if(issues&&issues.length) return "rClash"; }
  if(to==="Shipped"){ if(lines.some(l=>STOCKED_TYPES.includes(l.t)&&(+l.out||0)<(+l.qty||0))) return "rCheckOut"; }
  if(to==="Returned"){ if(lines.some(l=>STOCKED_TYPES.includes(l.t)&&((+l.in||0)+(+l.lost||0))<(+l.out||0))) return "rCheckIn"; }
  return null;
}
function canEditLines(role,status){ if(role==="admin") return ["Quote","Order","Approve"].includes(status); if(role==="sale") return ["Quote","Order"].includes(status); return false; }
/* Order numbers follow the old system: 2-digit Thai year + 5-digit running number (e.g. 6902255). */
function orderNo(beYear2,seq){ return String(beYear2).padStart(2,"0")+String(seq).padStart(5,"0"); }
/* ---------- CEO cockpit: checks and figures over the synced jobs ---------- */
function addDays_(s,n){ const t=pD(s)+n*864e5; const d=new Date(t); return d.toISOString().slice(0,10); }
function eachDay(a,b,fn){ if(!a||!b||b<a) return; let d=a, guard=0; while(d<=b&&guard++<400){ fn(d); d=addDays_(d,1); } }
const netOf=o=>{ const t=o.totals||{}; return r2((+t.sub||0)-(+t.extra||0)+(+t.adj||0)); };
function diagnose(orders,linesById,cat,today,opt){
  opt=opt||{}; const horizon=addDays_(today,opt.horizonDays||90), staleDays=opt.staleDays||30;
  const P=[]; const add=(kind,sev,o,msg,extra)=>P.push({kind,sev,no:o?o.no:null,id:o?o.id:null,msg,...(extra||{})});
  const open=orders.filter(o=>OPEN.includes(o.status));
  // 1 overbooking: stocked items held by Order/Approve/Shipped jobs beyond stock, from today on
  const perDay={}; // pid -> date -> [qty, [nos]]
  for(const o of open){ if(!BLOCKING.includes(o.status)||!o.ship||!o.ret) continue; let s=o.ship<today?today:o.ship, e=o.ret; if(o.status==="Shipped"&&e<today) e=today; if(e>horizon) e=horizon;
    for(const [pid,q] of (o.usage||[])){ const pp=cat.get(+pid); if(pp&&/^hour\s/i.test(String(pp.desc||"").trim())) continue; /* fuel-hour items count hours, not units */ eachDay(s,e,d=>{ const m=(perDay[pid]=perDay[pid]||{}); const c=(m[d]=m[d]||[0,[]]); c[0]+=q; if(!c[1].includes(o.no)) c[1].push(o.no); }); } }
  for(const [pid,days] of Object.entries(perDay)){ const p=cat.get(+pid); const stock=p?(+p.stock||0):0; let worst=null, first=null, last=null;
    for(const [d,[q,nos]] of Object.entries(days)) if(q>stock){ if(!first||d<first) first=d; if(!last||d>last) last=d; if(!worst||q-stock>worst.over) worst={over:q-stock,nos,q}; }
    if(worst) add("overbook","high",null,"",{pid:+pid,code:p?p.code:String(pid),desc:p?p.desc:"",stock,need:worst.q,over:worst.over,from:first,to:last,nos:worst.nos}); }
  // 2 overdue returns, 3 stale jobs, 4 totals that disagree with the old system, 5 adjust used, 6 missing details
  for(const o of open){
    if(o.status==="Shipped"&&o.ret&&o.ret<today) add("overdue","high",o,"",{ret:o.ret,days:spanDays(o.ret,today)-1});
    const ageRef=o.ret||o.ship; if(["Order","Approve","Returned"].includes(o.status)&&ageRef&&spanDays(ageRef,today)-1>staleDays) add("stale","med",o,"",{ret:ageRef,days:spanDays(ageRef,today)-1,status:o.status});
    if(o.legacyTotals&&o.legacyTotals.sub!=null&&Math.abs((+o.legacyTotals.sub)-netOf(o))>0.05) add("mismatch","high",o,"",{legacy:+o.legacyTotals.sub,lines:netOf(o)});
    if(Math.abs(+o.adjust||0)>=1) add("adjust","low",o,"",{adjust:+o.adjust});
    if(["Order","Approve"].includes(o.status)){ const miss=[]; if(!o.sale) miss.push("sale"); if(!o.customerName) miss.push("customer"); if(!o.ship||!o.ret) miss.push("dates"); if(miss.length) add("missing","med",o,"",{miss}); }
  }
  // 7 discount rule breaks, 8 price changed from catalog
  for(const o of open){ const L=(linesById[o.id]||{}).items||[]; let over=[], price=[];
    for(const l of L){ if(l.parent||!l.pid||[5,7].includes(l.t)) continue; const p=cat.get(l.pid); if(!p) continue; const d=+l.disc||0;
      if(d>0&&!p.discountable) over.push({code:l.code,disc:d,rule:"no discount"}); else if(d>0&&p.maxDisc>0&&d>p.maxDisc) over.push({code:l.code,disc:d,rule:"max "+p.maxDisc+"%"});
      if(!l.foc&&!l.sb&&p.price>0&&Math.abs((+l.list||0)-p.price)>0.5) price.push({code:l.code,list:+l.list||0,catalog:p.price}); }
    if(over.length) add("discount","high",o,"",{lines:over});
    if(price.length) add("price","low",o,"",{lines:price}); }
  // 9 crew booked on two jobs the same day
  const crewDay={};
  for(const o of open){ if(!BLOCKING.includes(o.status)) continue; for(const l of ((linesById[o.id]||{}).items||[])){ if(!l.crewId||![5,7].includes(l.t)) continue; let s=l.start||o.useStart||o.ship, e=l.end||o.useEnd||o.ret; if(!s||!e) continue; if(e<today) continue; if(s<today) s=today;
    eachDay(s,e>horizon?horizon:e,d=>{ const k=l.crewId+"|"+d; const c=(crewDay[k]=crewDay[k]||{name:l.desc,nos:new Set()}); c.nos.add(o.no); }); } }
  const crewHits={}; for(const [k,v] of Object.entries(crewDay)){ if(v.nos.size<2) continue; const [cid,d]=k.split("|"); const key=cid+"|"+[...v.nos].sort().join(","); const h=(crewHits[key]=crewHits[key]||{crewId:cid,name:v.name,nos:[...v.nos].sort(),from:d,to:d}); if(d<h.from) h.from=d; if(d>h.to) h.to=d; }
  for(const h of Object.values(crewHits)) add("crew","high",null,"",h);
  // ---------- money ----------
  const M={quotes:{n:0,value:0},confirmed:{n:0,value:0},onRent:{n:0,value:0},toBill:{n:0,value:0},weeks:{},bySale:{},byCustomer:{}};
  const weekOf=s=>{ const t=pD(s); const dow=(new Date(t).getUTCDay()+6)%7; return new Date(t-dow*864e5).toISOString().slice(0,10); };
  for(const o of open){ const v=netOf(o);
    if(o.status==="Quote"){ if(o.ship&&o.ship>=today){ M.quotes.n++; M.quotes.value+=v; } continue; }
    if(o.status==="Order"||o.status==="Approve"){ M.confirmed.n++; M.confirmed.value+=v; if(o.ship&&o.ship>=today){ const w=weekOf(o.ship); M.weeks[w]=(M.weeks[w]||0)+v; } }
    if(o.status==="Shipped"){ M.onRent.n++; M.onRent.value+=v; }
    if(o.status==="Returned"){ M.toBill.n++; M.toBill.value+=v; }
    const sk=o.sale||"—"; const s=(M.bySale[sk]=M.bySale[sk]||{jobs:0,list:0,disc:0,net:0}); s.jobs++; s.list+=(+(o.totals||{}).list||0); s.disc+=(+(o.totals||{}).disc||0)+(+(o.totals||{}).extra||0)-(+(o.totals||{}).adj||0); s.net+=v;
    const ck=o.customerName||"—"; const c=(M.byCustomer[ck]=M.byCustomer[ck]||{jobs:0,net:0}); c.jobs++; c.net+=v; }
  for(const k of ["quotes","confirmed","onRent","toBill"]) M[k].value=r2(M[k].value);
  // ---------- assets ----------
  const earn={}, sub={}, used=new Set();
  for(const o of open){ if(o.status==="Quote") continue; for(const l of ((linesById[o.id]||{}).items||[])){ if(!l.pid) continue; const c=lineCalc(l);
      if(STOCKED_TYPES.includes(l.t)){ used.add(l.pid); if(!l.parent){ const e=(earn[l.pid]=earn[l.pid]||{code:l.code,desc:l.desc,net:0,jobs:new Set()}); e.net+=c.total; e.jobs.add(o.no); } }
      if(l.t===6&&!l.parent){ const s=(sub[l.code]=sub[l.code]||{code:l.code,desc:l.desc,net:0,jobs:new Set()}); s.net+=c.total; s.jobs.add(o.no); } } }
  const fix=a=>a.map(x=>({...x,net:r2(x.net),jobs:x.jobs.size})).sort((a,b)=>b.net-a.net);
  const idle=[...cat.values()].filter(p=>p.type===1&&(+p.stock||0)>0&&!used.has(p.id)&&p.price>0).sort((a,b)=>b.price-a.price);
  return {problems:P,money:M,assets:{top:fix(Object.values(earn)).slice(0,15),subrent:fix(Object.values(sub)).slice(0,15),idleCount:idle.length,idleTop:idle.slice(0,15).map(p=>({code:p.code,desc:p.desc,stock:p.stock,price:p.price}))}};
}
/*EXPORTS*/
// Everything above this marker is inlined into the page by scripts/build.js, byte for byte.
if(typeof module!=="undefined") module.exports={TYPES,STOCKED_TYPES,STATUSES,BLOCKING,OPEN,MOVES,MOVE_ROLES,r2,pD,spanDays,chargeDays,defaultDisc,lineCalc,typeTotals,orderTotals,usageOf,overlaps,bookedQty,expandKit,syncChildren,moveCheck,canEditLines,orderNo,addDays_,eachDay,netOf,diagnose};
