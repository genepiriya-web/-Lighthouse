// v2 job totals (lib/pricing.js, Gene 27 Oct 2026): extra discount % on the Equipment sub total only; old-system jobs and
// the artifact page keep logic.js's formula. Synthetic data only.
const test=require("node:test"); const assert=require("node:assert/strict");
const {orderTotalsV2}=require("../lib/pricing.js"); const L=require("../src/logic.js");
const D=require("../lib/docs.js"); const Q=require("../lib/quoteform.js");
const fmt=n=>(+n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const lines=[{k:"e",t:1,list:10000,qty:1,days:2,disc:20},{k:"a",t:2,list:500,qty:2,days:2},{k:"c",t:5,list:3000,qty:1,days:2,ot:2,otRate:500}];
const money={extraDisc:10,insurance:300,adjust:-50,tax:"Vat"};

test("old-system jobs, and orders with no owner (the artifact page), keep logic.js's totals exactly",()=>{
  assert.deepEqual(orderTotalsV2(lines,{...money,owner:"legacy"}),L.orderTotals(lines,money));
  assert.deepEqual(orderTotalsV2(lines,money),L.orderTotals(lines,money));
});

test("v2 jobs: the extra discount comes off the Equipment sub total only; VAT and total follow",()=>{
  const G=orderTotalsV2(lines,{...money,owner:"v2"}); const sub=16000+2000+7000;
  assert.equal(G.sub,sub); assert.equal(G.extra,1600,"10% of Equipment's 16,000, not of 25,000");
  assert.equal(G.base,sub-1600-50+300); assert.equal(G.vat,L.r2(G.base*0.07)); assert.equal(G.total,L.r2(G.base+G.vat));
  assert.equal(orderTotalsV2(lines,{...money,owner:"v2",tax:"Not Vat"}).vat,0);
  assert.equal(orderTotalsV2(lines.slice(1),{...money,owner:"v2"}).extra,0,"no Equipment, nothing to take off");
});

test("the HTML quotation and the PDF form print the same v2 total",()=>{
  const o={no:"6909001",owner:"v2",customerName:"Synthetic",jobTitle:"T",...money}; const G=orderTotalsV2(lines,o);
  assert.ok(D.docBody(o,lines,"quote",true,{today:"2026-10-27"}).includes(`<b>${fmt(G.total)}</b>`));
  assert.ok(Q.quoteForm(o,lines,"disc",{}).includes(`${fmt(G.total)} Baht`)&&Q.quoteForm(o,lines,"disc",{}).includes(`-${fmt(G.extra)} Baht`));
});

test("generator fuel by size (Gene, 27 Oct): match the Hour Gasoline item with the same KVA; nothing for other items",()=>{
  const {kvaOf,isGeneratorDesc,fuelItemFor,isFuelDesc}=require("../lib/pricing.js");
  const items=[{id:1,desc:"Hour  Gasoline 45  KVA.",price:300},{id:2,desc:"Hour Gasoline 60 KVA ",price:360},{id:3,desc:"Hour Gasoline 183KVA ",price:1000},{id:4,desc:"Re-Fuel Service Charge",price:1500},{id:5,desc:"Hour Gasoline 125 KVA",price:700}];
  assert.equal(kvaOf("Generator 45 KVA (1564) G16"),45); assert.equal(kvaOf("Generator 125KVA (97-8459) G6"),125); assert.equal(kvaOf("Cable Guard"),null);
  assert.ok(isGeneratorDesc("Generator 270 KVA.(96-7592) G12")&&isGeneratorDesc("Ultra Silent Generator 150 KVA."));
  assert.ok(!isGeneratorDesc("Mini Generator 3 KVA")&&!isGeneratorDesc("Generator Driver - Test")&&!isGeneratorDesc("Adapter for Gen 7KVA"));
  assert.equal(fuelItemFor("Generator 45 KVA (1564) G16",items).price,300); assert.equal(fuelItemFor("Generator 183 KVA (96-6876) G9",items).price,1000);
  assert.equal(fuelItemFor("Ultra Silent Generator 150 KVA.",items).price,700,"150 KVA uses the 125 KVA rate for now (Gene, 27 Oct)");
  assert.equal(fuelItemFor("Ultra Silent Generator 150 KVA.",items.filter(x=>x.id!==5)),null,"and nothing when that isn't there either");
  assert.equal(fuelItemFor("Ultra Silent Generator 150 KVA.",[...items,{id:6,desc:"Hour Gasoline 150 KVA",price:800}]).price,800,"its own item wins once the catalog has one");
  assert.equal(fuelItemFor("Generator 300 KVA",items),null,"other sizes without a rate: nothing guessed");
  assert.ok(isFuelDesc("Hour Gasoline 60 KVA")&&!isFuelDesc("Re-Fuel Service Charge"));
});
