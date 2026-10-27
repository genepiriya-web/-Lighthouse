// Paper-form quotation (lib/quoteform.js): its money must be logic.js's, the same as the HTML quotation (lib/docs.js),
// and nothing from a job or template may reach the page unescaped. Synthetic data only.
const test=require("node:test"); const assert=require("node:assert/strict");
const Q=require("../lib/quoteform.js"); const D=require("../lib/docs.js"); const L=require("../src/logic.js");
const fmt=n=>(+n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});

const order={no:"6909001",rev:16,customerName:"Synthetic Films <Co>",billing:"1 Test Rd",phone:"000",fax:"001",contact:"Ann",jobTitle:"TVC & Friends",jobType:"TVC",
  ship:"2026-11-01",ret:"2026-11-02",useStart:"2026-11-01",useEnd:"2026-11-02",dop:"DOP",sale:"Aom",tax:"Vat",extraDisc:5,insurance:500,adjust:-20,remarkId:"r1"};
const lines=[{k:"a",t:1,code:"S360",desc:"Sky Panel SET",list:22000,qty:1,days:2,disc:85},{k:"a1",t:1,desc:"Snap bag",list:0,qty:1,days:2,parent:"a"},
  {k:"b",t:1,desc:"Sky Panel SET",list:22000,qty:1,days:2,sb:true},{k:"b1",t:1,desc:"Snap bag",list:0,qty:1,days:2,sb:true,parent:"b"},
  {k:"c",t:2,desc:"Lighting package",list:3000,qty:1,days:2},{k:"d",t:4,desc:"Lighting Truck",list:3500,qty:1,days:2},
  {k:"g",t:5,desc:"HEAD ELECTRICIAN · Test Person",list:3000,otRate:500,ot:2,qty:1,days:2,disc:10},{k:"h",t:5,desc:"ELECTRICIAN TVC 1500",list:1500,otRate:250,ot:0,qty:3,days:2}];
const remarks=[{id:"r1",html:"<p onclick='x'>Pay in <b>30 days</b></p><script>alert(1)</script>"}];
const x={remarks,printedAt:"27/10/2026 14:05:00",printedBy:"Aom",customerCode:"T001"};

test("with discount: grand total, VAT and each type are logic.js's, the same as the HTML quotation",()=>{
  const h=Q.quoteForm(order,lines,true,x); const G=L.orderTotals(lines,order);
  for(const v of [G.sub,G.extra,G.vat,G.total]) assert.ok(h.includes(fmt(v)),`missing ${fmt(v)}`);
  for(const ty of L.TYPES) assert.ok(h.includes(fmt(L.typeTotals(lines,ty.id).sub)));
  assert.ok(D.docBody(order,lines,"quote",true,{today:"2026-10-27"}).includes(`<b>${fmt(G.total)}</b>`),"both documents print the same total");
});

test("without discount: list prices plus insurance, VAT on that, exactly as lib/docs.js prints it",()=>{
  const G=L.orderTotals(lines,order); const base=G.list+G.ins; const tot=Math.round((base+Math.round(base*7)/100)*100)/100;
  const h=Q.quoteForm(order,lines,false,x);
  assert.ok(h.includes(`${fmt(tot)} Baht`)); assert.ok(D.docBody(order,lines,"quote",false,{today:"2026-10-27"}).includes(`<b>${fmt(tot)}</b>`));
  assert.ok(!h.includes("Disc%"),"no discount columns");
});

test("paper-form details: standby rows, package parts unnumbered, crew name/position, Not Vat",()=>{
  const h=Q.quoteForm(order,lines,true,x);
  assert.ok(h.includes("StandBy : 1<br>Price : 22,000.00")); assert.ok(h.includes(">Stand By<"));
  assert.deepEqual(Q.crewName({desc:"HEAD ELECTRICIAN · Test Person"}),{name:"Test Person",pos:"HEAD ELECTRICIAN"});
  assert.deepEqual(Q.crewName({desc:"ELECTRICIAN TVC 1500"}),{name:"ELECTRICIAN TVC 1500",pos:""});
  assert.deepEqual(Q.rowsOf(lines,1).map(l=>l.k),["a","a1","b","b1"]);
  assert.ok(h.includes("T001-Synthetic Films &lt;Co&gt;")&&h.includes("Revision :<br>016")&&h.includes("Print By : Aom"));
  assert.ok(h.includes("Approval Signature/Hirer"));
  const nv=Q.quoteForm({...order,tax:"Not Vat"},lines,true,x); assert.ok(!nv.includes("Vat Value"));
  assert.equal(Q.pdfName(order,true),"6909001-016-quotation.pdf"); assert.equal(Q.pdfName(order,false),"6909001-016-quotation-nodisc.pdf");
});

test("job text is escaped and templates go through the sanitiser; no scripts or handlers survive",()=>{
  const h=Q.quoteForm({...order,jobTitle:"<img src=x onerror=alert(1)>"},[{k:"z",t:1,desc:"<script>x</script>",list:1,qty:1,days:1}],true,x);
  assert.ok(!/<(script|img)\b/i.test(h)&&!/<[^>]*\son\w+=/i.test(h)); assert.ok(h.includes("&lt;img src=x onerror=alert(1)&gt;")); assert.ok(h.includes("<p>Pay in <b>30 days</b></p>"));
  assert.ok(!Q.quoteForm(order,lines,true,{...x,logo:'x" onload="y'}).includes('" onload="'));
});
