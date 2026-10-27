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
