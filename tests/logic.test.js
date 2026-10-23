// Unit tests for src/logic.js. These numbers are the spec: change them only with Gene's approval.
const test=require("node:test"); const assert=require("node:assert/strict");
const L=require("../src/logic.js");

test("spanDays counts both ends; bad or reversed ranges are 0",()=>{
  assert.equal(L.spanDays("2026-10-01","2026-10-01"),1);
  assert.equal(L.spanDays("2026-10-01","2026-10-03"),3);
  assert.equal(L.spanDays("2026-10-03","2026-10-01"),0);
  assert.equal(L.spanDays("","2026-10-01"),0);
  assert.equal(L.spanDays("2026-02-27","2026-03-02"),4); // across month end, no DST in Thailand but UTC math anyway
});

test("chargeDays: Daily charges every day; Weekly charges dpw per full week and caps leftovers at dpw (rule unconfirmed)",()=>{
  assert.equal(L.chargeDays("2026-10-01","2026-10-10","Daily",5),10);
  assert.equal(L.chargeDays("2026-10-01","2026-10-10","Weekly",5),8);   // 1 week → 5, 3 leftover → 3
  assert.equal(L.chargeDays("2026-10-01","2026-10-13","Weekly",5),10);  // 1 week → 5, 6 leftover → capped 5
  assert.equal(L.chargeDays("2026-10-01","2026-10-14","Weekly",5),10);  // 2 weeks
  assert.equal(L.chargeDays("2026-10-01","2026-10-10","Weekly",0),10);  // no dpw → falls back to Daily
});

test("defaultDisc: only discountable items, capped by maxDisc when maxDisc > 0",()=>{
  assert.equal(L.defaultDisc({discountable:0,maxDisc:0},30),0);
  assert.equal(L.defaultDisc({discountable:1,maxDisc:0},30),30);
  assert.equal(L.defaultDisc({discountable:1,maxDisc:20},30),20);
  assert.equal(L.defaultDisc({discountable:1,maxDisc:0},150),100);
  assert.equal(L.defaultDisc(null,30),0);
});

test("lineCalc: locked case MAX1 24,000 × 3 × 2 days at 60% = 57,600",()=>{
  assert.deepEqual(L.lineCalc({t:1,list:24000,qty:3,days:2,disc:60}),{amount:144000,total:57600,disc:86400});
});

test("lineCalc: FOC and Standby price at 0; discount clamps to 0–100",()=>{
  assert.equal(L.lineCalc({t:1,list:1000,qty:2,days:3,foc:true}).total,0);
  assert.equal(L.lineCalc({t:1,list:1000,qty:2,days:3,sb:true}).total,0);
  assert.equal(L.lineCalc({t:1,list:1000,qty:1,days:1,disc:150}).total,0);
  assert.equal(L.lineCalc({t:1,list:1000,qty:1,days:1,disc:-10}).total,1000);
});

test("lineCalc: crew (5) and freelance (7) add OT × rate × qty; equipment ignores OT; half days allowed",()=>{
  assert.equal(L.lineCalc({t:5,list:3000,qty:2,days:1.5,ot:3,otRate:400}).amount,3000*2*1.5+400*3*2);
  assert.equal(L.lineCalc({t:7,list:2500,qty:1,days:1,ot:2,otRate:300}).amount,3100);
  assert.equal(L.lineCalc({t:1,list:2500,qty:1,days:1,ot:2,otRate:300}).amount,2500);
});

test("orderTotals: locked case adds VAT 7% → 61,632",()=>{
  const T=L.orderTotals([{t:1,list:24000,qty:3,days:2,disc:60}],{tax:"Vat"});
  assert.equal(T.sub,57600); assert.equal(T.vat,4032); assert.equal(T.total,61632);
});

test("orderTotals: extra discount on sub, then adjust and insurance before VAT (VAT on insurance unconfirmed)",()=>{
  const lines=[{t:1,list:10000,qty:1,days:1,disc:10},{t:2,list:500,qty:4,days:1}]; // 9,000 + 2,000
  const T=L.orderTotals(lines,{extraDisc:5,insurance:1000,adjust:-50});
  assert.equal(T.list,12000); assert.equal(T.disc,1000); assert.equal(T.sub,11000);
  assert.equal(T.extra,550); assert.equal(T.base,11000-550-50+1000); assert.equal(T.vat,L.r2(11400*0.07)); assert.equal(T.total,L.r2(11400*1.07));
});

test("orderTotals: Not Vat has no VAT; rounding is per line then per total",()=>{
  const T=L.orderTotals([{t:1,list:333.335,qty:1,days:1}],{tax:"Not Vat"});
  assert.equal(T.vat,0); assert.equal(T.total,T.base);
  assert.equal(L.lineCalc({t:1,list:100,qty:1,days:1,disc:33.333}).total,66.67);
});

test("typeTotals splits by item type",()=>{
  const lines=[{t:1,list:100,qty:1,days:1},{t:5,list:50,qty:1,days:1},{t:1,list:10,qty:2,days:1,disc:50}];
  assert.deepEqual(L.typeTotals(lines,1),{list:120,disc:10,sub:110});
});

test("usageOf counts stocked types only (1,2,4), children included",()=>{
  const u=L.usageOf([{t:1,pid:7,qty:2},{t:1,pid:7,qty:1,parent:"a"},{t:2,pid:8,qty:4},{t:3,pid:9,qty:5},{t:5,pid:10,qty:1},{t:4,pid:11,qty:1}]);
  assert.deepEqual(u.sort((a,b)=>a[0]-b[0]),[[7,3],[8,4],[11,1]]);
});

test("bookedQty: only Order/Approve/Shipped block; overdue Shipped holds stock until today",()=>{
  const orders=[
    {id:"a",status:"Order",ship:"2026-10-10",ret:"2026-10-12",usage:[[1,2]]},
    {id:"b",status:"Quote",ship:"2026-10-10",ret:"2026-10-12",usage:[[1,5]]},
    {id:"c",status:"Shipped",ship:"2026-10-01",ret:"2026-10-05",usage:[[1,1]]},
    {id:"d",status:"Draft INV",ship:"2026-10-10",ret:"2026-10-12",usage:[[1,9]]},
  ];
  assert.equal(L.bookedQty(1,"2026-10-11","2026-10-11",orders,null,"2026-10-11"),3); // a + overdue c
  assert.equal(L.bookedQty(1,"2026-10-11","2026-10-11",orders,null,"2026-10-04"),2); // c not overdue yet
  assert.equal(L.bookedQty(1,"2026-10-11","2026-10-11",orders,"a","2026-10-11"),1);  // exclude self
});

test("expandKit + syncChildren: children follow parent qty × ratio, days and dates; can carry own price",()=>{
  const cat=new Map([[2,{code:"CG",desc:"Cable guard"}],[3,{code:"DC",desc:"Distro"}]]);
  let n=0; const parent={k:"p",t:1,pid:1,qty:2,days:3,start:"2026-10-01",end:"2026-10-03"};
  const kids=L.expandKit(parent,[[2,4,150],[3,1]],cat,()=>"k"+(++n));
  assert.equal(kids[0].qty,8); assert.equal(kids[0].list,150); assert.equal(kids[1].list,0); assert.equal(kids[1].parent,"p");
  parent.qty=3; parent.days=5; L.syncChildren([parent,...kids]);
  assert.equal(kids[0].qty,12); assert.equal(kids[1].days,5);
});

test("moveCheck: flow and role table",()=>{
  const o={status:"Quote",customerName:"X",ship:"2026-10-01",ret:"2026-10-02"}; const lines=[{t:1,qty:1}];
  assert.equal(L.moveCheck("sale",o,"Order",lines,[]),null);
  assert.equal(L.moveCheck("store",o,"Order",lines,[]),"rRole");
  assert.equal(L.moveCheck("sale",o,"Approve",lines,[]),"rFlow");
  assert.equal(L.moveCheck("admin",{...o,status:"Approve"},"Shipped",[],[]),null);
  assert.equal(L.moveCheck("sale",{...o,status:"Approve"},"Shipped",[],[]),"rRole");
  assert.equal(L.moveCheck("accounting",{...o,status:"Returned"},"Draft INV",[],[]),null);
  assert.equal(L.moveCheck("store",{...o,status:"Returned"},"Draft INV",[],[]),"rRole");
});

test("moveCheck: guards for customer, dates, items, stock clash",()=>{
  const base={status:"Quote",customerName:"X",ship:"2026-10-01",ret:"2026-10-02"}; const lines=[{t:1,qty:1}];
  assert.equal(L.moveCheck("sale",{...base,customerName:""},"Order",lines,[]),"rNeedCust");
  assert.equal(L.moveCheck("sale",{...base,ret:""},"Order",lines,[]),"rNeedDates");
  assert.equal(L.moveCheck("sale",base,"Order",[],[]),"rNeedItems");
  assert.equal(L.moveCheck("sale",base,"Order",lines,[{pid:1,short:1}]),"rClash");
});

test("moveCheck: Shipped needs every stocked line checked out; Returned needs in + lost ≥ out",()=>{
  const o={status:"Approve"};
  assert.equal(L.moveCheck("store",o,"Shipped",[{t:1,qty:2,out:1},{t:5,qty:1}],[]),"rCheckOut");
  assert.equal(L.moveCheck("store",o,"Shipped",[{t:1,qty:2,out:2},{t:3,qty:9}],[]),null);
  const s={status:"Shipped"};
  assert.equal(L.moveCheck("store",s,"Returned",[{t:1,out:2,in:1}],[]),"rCheckIn");
  assert.equal(L.moveCheck("store",s,"Returned",[{t:1,out:2,in:1,lost:1}],[]),null);
});

test("moveCheck: Cancel only from Quote/Order/Approve, by admin or sale",()=>{
  assert.equal(L.moveCheck("sale",{status:"Order"},"Cancel",[],[]),null);
  assert.equal(L.moveCheck("store",{status:"Order"},"Cancel",[],[]),"rRole");
  assert.equal(L.moveCheck("admin",{status:"Shipped"},"Cancel",[],[]),"rNoCancel");
});

test("canEditLines: sale on Quote/Order, admin also on Approve, nobody else",()=>{
  assert.equal(L.canEditLines("sale","Order"),true); assert.equal(L.canEditLines("sale","Approve"),false);
  assert.equal(L.canEditLines("admin","Approve"),true); assert.equal(L.canEditLines("admin","Shipped"),false);
  assert.equal(L.canEditLines("store","Quote"),false);
});

test("orderNo: 2-digit Buddhist year + 5-digit sequence",()=>{
  assert.equal(L.orderNo(69,2255),"6902255"); assert.equal(L.orderNo(69,9001),"6909001"); assert.equal(L.orderNo(7,1),"0700001");
});

test("diagnose: flags overbook, overdue, mismatch and discount breaks",()=>{
  const cat=new Map([[1,{id:1,code:"M18",desc:"M18",stock:1,price:5000,discountable:0,maxDisc:0,type:1}]]);
  const orders=[
    {id:"a",no:"6900001",status:"Order",ship:"2026-10-20",ret:"2026-10-22",usage:[[1,1]],totals:{sub:5000,extra:0,adj:0},legacyTotals:{sub:4000},sale:"A",customerName:"C"},
    {id:"b",no:"6900002",status:"Shipped",ship:"2026-10-10",ret:"2026-10-15",usage:[[1,1]],totals:{sub:0,extra:0,adj:0},sale:"A",customerName:"C"},
  ];
  const lines={a:{items:[{t:1,pid:1,code:"M18",list:5000,qty:1,days:1,disc:10}]}};
  const R=L.diagnose(orders,lines,cat,"2026-10-20");
  const kinds=R.problems.map(p=>p.kind).sort();
  assert.deepEqual(kinds,["discount","mismatch","overbook","overdue"]);
});
