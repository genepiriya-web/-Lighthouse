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

test("hide discount (net, Gene 27 Oct): no discount shown anywhere in the detail; net unit prices; same totals as with discount",()=>{
  const h=Q.quoteForm(order,lines,"net",x); const G=L.orderTotals(lines,order); const det=h.slice(h.indexOf("<table class=\"det\""));
  for(const w of ["Disc%","Discount:","Amount:",">Discount<","List Price"]) assert.ok(!det.includes(w),`net view shows ${w}`);
  assert.ok(h.includes(`${fmt(G.total)} Baht`)&&h.includes(`${fmt(G.vat)} Baht`),"same VAT and grand total as with discount");
  for(const ty of L.TYPES) assert.ok(h.includes(fmt(L.typeTotals(lines,ty.id).sub)));
  assert.ok(det.includes(">3,300.00<"),"Sky Panel 22,000 at 85% off shows as 3,300.00 a day");
  assert.ok(det.includes(">2,700.00<")&&det.includes(">450.00<"),"crew day rate and OT rate after the crew line's 10%");
  const sb=Q.quoteForm(order,[{k:"s",t:1,desc:"Sky Panel SET",list:22000,qty:1,days:2,disc:85,sb:true}],"net",x);
  assert.ok(sb.includes("Price : 3,300.00")&&!sb.includes("22,000"),"a standby line's price is net too, so the full price never shows");
  assert.equal(Q.pdfName(order,"net"),"6909001-016-quotation-net.pdf");
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

test("store item list and crew job sheet (Gene, 27 Oct): everything but prices; one write-in row per person per day",()=>{
  const prices=[...new Set(lines.flatMap(l=>[l.list,l.otRate]).filter(v=>+v>0).map(fmt))];
  const it=Q.itemSheet(order,lines,x), job=Q.jobSheet(order,lines,x);
  for(const h of [it,job]){ for(const p of prices) assert.ok(!h.includes(p),`price ${p} shows`); assert.ok(!/Baht|Price|Disc|Total/.test(h.replace(/<style>[\s\S]*?<\/style>/,""))); }
  assert.ok(it.includes(">Item List<")&&it.includes("Stand By")&&it.includes(">S360<")&&it.includes("Test Person"),"items, codes, standby and crew names are there");
  assert.ok(job.includes(">Job Sheet<")&&job.includes("On Location")&&job.includes("OT (hr.)"));
  assert.equal((job.match(/____ : ____<\/td><td class="c">____ : ____/g)||[]).length,1*2+3*2,"1 head × 2 days + 3 electricians × 2 days");
  assert.equal((job.match(/<tbody class="person">/g)||[]).length,4,"one block per person (qty 3 → 3 people)");
  assert.ok(!Q.jobSheet({...order,jobTitle:"<b onclick=x>"},[{k:"c",t:5,desc:"<script>",qty:1,days:1}],x).match(/<script|<b onclick/));
  assert.equal(Q.pdfName(order,true,"items"),"6909001-016-item-list.pdf"); assert.equal(Q.pdfName(order,true,"job"),"6909001-016-job-sheet.pdf");
});
