// M4 slice 4: the Cockpit (admin) and job documents over HTTP.
const test=require("node:test"); const assert=require("node:assert/strict");
const {startTestServer,skipReason}=require("./helpers/server"); const L=require("../src/logic.js");
const skip=skipReason(); let S;
test.before(async()=>{ if(!skip) S=await startTestServer(3924); });
test.after(async()=>{ if(S) await S.stop(); });
const ok=(r,what)=>{ assert.ok(r.status>=200&&r.status<300,`${what}: ${r.status} ${JSON.stringify(r.body)}`); return r.body; };
async function raw(who,p){ const r=await fetch(`http://127.0.0.1:3924${p}`,{headers:who?{"x-dev-user":S.uid[who]}:{}}); return {status:r.status,headers:r.headers,text:await r.text()}; }

test("cockpit: admin only; runs logic.js diagnose over legacy and v2 jobs",{skip},async()=>{
  for(const who of ["sale","store","accounting","crew"]) assert.equal((await S.api(who,"GET","/api/cockpit")).status,403,who);
  const R=ok(await S.api("admin","GET","/api/cockpit?today=2026-10-25"));
  const ob=R.problems.find(p=>p.kind==="overbook"); assert.ok(ob,"legacy 6900001 holds 3 of the 2 M18s");
  assert.deepEqual([ob.code,ob.stock,ob.need,ob.from,ob.to],["M18",2,3,"2026-11-01","2026-11-02"]);
  const mm=R.problems.find(p=>p.kind==="mismatch"); assert.equal(mm,undefined,"fixture legacy totals match their lines");
  assert.equal(R.money.confirmed.n,1); assert.equal(R.money.quotes.n,1);
  assert.equal(R.owners["6900001"].owner,"legacy"); assert.ok(R.asOf,"data-as-of comes from the last import");
  // the date pin only moves "today"; with today after the return date, nothing is overbooked any more
  assert.equal(ok(await S.api("admin","GET","/api/cockpit?today=2026-12-01")).problems.filter(p=>p.kind==="overbook").length,0);
});

test("documents: any staff downloads; same totals as logic.js; legacy jobs too; locked-down preview",{skip},async()=>{
  assert.equal((await raw(null,"/api/orders/6900001/document")).status,401);
  const d=await raw("crew","/api/orders/6900001/document?kind=quote&disc=1");
  assert.equal(d.status,200); assert.match(d.headers.get("content-type"),/text\/html/);
  assert.equal(d.headers.get("content-disposition"),'attachment; filename="6900001-quotation.html"');
  assert.match(d.headers.get("content-security-policy"),/default-src 'none'/);
  const lines=ok(await S.api("admin","GET","/api/orders/6900001")).lines; const G=L.orderTotals(lines,{extraDisc:5,tax:"Vat"});
  assert.ok(d.text.includes(G.total.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})),"total on the quotation");
  assert.ok(d.text.includes("Synthetic Films")&&d.text.includes("QUOTATION"));
  const items=await raw("store","/api/orders/6900001/document?kind=items&inline=1");
  assert.match(items.headers.get("content-disposition"),/^inline; filename="6900001-item-list.html"/); assert.ok(!items.text.includes("Sub total"),"item list has no prices");
  assert.equal((await raw("store","/api/orders/6900001/document?kind=invoice")).status,422);
  assert.equal((await raw("store","/api/orders/nope/document")).status,404);
});

test("PDFs (paper form): quotation in 3 views, store item list, crew job sheet; any staff; revision in the name",{skip},async()=>{
  assert.equal((await raw(null,"/api/orders/6900001/document?format=pdf")).status,401);
  const r=await fetch("http://127.0.0.1:3924/api/orders/6900001/document?kind=quote&disc=1&format=pdf",{headers:{"x-dev-user":S.uid.crew}});
  assert.equal(r.status,200); assert.equal(r.headers.get("content-type"),"application/pdf");
  assert.match(r.headers.get("content-disposition"),/^attachment; filename="6900001-\d{3}-quotation\.pdf"$/);
  const b=Buffer.from(await r.arrayBuffer()); assert.equal(b.subarray(0,5).toString(),"%PDF-"); assert.ok(b.length>5000);
  const nod=await fetch("http://127.0.0.1:3924/api/orders/6900001/document?disc=0&format=pdf&inline=1",{headers:{"x-dev-user":S.uid.store}});
  assert.match(nod.headers.get("content-disposition"),/^inline; filename="6900001-\d{3}-quotation-nodisc\.pdf"$/); await nod.arrayBuffer();
  const net=await fetch("http://127.0.0.1:3924/api/orders/6900001/document?disc=net&format=pdf",{headers:{"x-dev-user":S.uid.sale}});
  assert.match(net.headers.get("content-disposition"),/filename="6900001-\d{3}-quotation-net\.pdf"$/); assert.equal(Buffer.from(await net.arrayBuffer()).subarray(0,5).toString(),"%PDF-");
  for(const [kind,file] of [["items","item-list"],["job","job-sheet"]]){ // store's list and the crew job sheet: no prices, any staff
    const r=await fetch(`http://127.0.0.1:3924/api/orders/6900001/document?kind=${kind}&format=pdf`,{headers:{"x-dev-user":S.uid.store}});
    assert.equal(r.status,200,kind); assert.match(r.headers.get("content-disposition"),new RegExp(`filename="6900001-\\d{3}-${file}\\.pdf"$`));
    assert.equal(Buffer.from(await r.arrayBuffer()).subarray(0,5).toString(),"%PDF-"); }
  assert.equal((await raw("store","/api/orders/6900001/document?kind=job")).status,422,"the job sheet is a PDF only");
  assert.equal((await raw("store","/api/orders/6900001/document?kind=draft&format=pdf")).status,422);
  assert.equal((await raw("store","/api/orders/nope/document?format=pdf")).status,404);
});
