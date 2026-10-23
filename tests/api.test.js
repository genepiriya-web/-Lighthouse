// Server/client agreement: start the built Next.js app and price jobs through POST /api/totals.
// The server must return exactly what src/logic.js returns in-process (which is what the browser runs).
// Needs `npm run build` first. Uses data/parity.json when present, else synthetic cases only.
const test=require("node:test"); const assert=require("node:assert/strict");
const {spawn}=require("node:child_process"); const fs=require("fs"), path=require("path");
const L=require("../src/logic.js");
const root=path.join(__dirname,".."); const PORT=3917; const base=`http://127.0.0.1:${PORT}`;
const parityFile=path.join(root,"data/parity.json");
const SYNTHETIC=[
  {no:"locked",lines:[{t:1,list:24000,qty:3,days:2,disc:60}],order:{tax:"Vat"}},
  {no:"crew-ot",lines:[{t:5,list:3000,qty:2,days:1.5,ot:3,otRate:400},{t:7,list:2500,qty:1,days:1,ot:2,otRate:300,disc:10}],order:{tax:"Not Vat",insurance:500}},
  {no:"extras",lines:[{t:1,list:10000,qty:1,days:1,disc:10},{t:2,list:500,qty:4,days:1,foc:true}],order:{extraDisc:5,adjust:-50,insurance:1000}},
];
let srv;
test.before(async()=>{
  if(!fs.existsSync(path.join(root,".next/BUILD_ID"))) throw new Error("run `npm run build` before `npm run test:api`");
  srv=spawn(process.execPath,[require.resolve("next/dist/bin/next"),"start","-p",String(PORT),"-H","127.0.0.1"],{cwd:root,stdio:"ignore"});
  for(let i=0;i<100;i++){ try{ const r=await fetch(base+"/api/totals",{method:"POST",body:"{}"}); if(r.status) return; }catch{} await new Promise(r=>setTimeout(r,150)); }
  throw new Error("next start did not come up");
});
test.after(()=>{ if(srv) srv.kill(); });

const post=body=>fetch(base+"/api/totals",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});

test("server totals equal in-process logic on synthetic cases",async()=>{
  for(const c of SYNTHETIC){ const r=await post(c); assert.equal(r.status,200);
    const j=await r.json(); assert.deepEqual(j.totals,L.orderTotals(c.lines,c.order),c.no); assert.deepEqual(j.lines,c.lines.map(L.lineCalc),c.no); }
});

test("server totals equal the old system on every parity job",{skip:fs.existsSync(parityFile)?false:"data/parity.json not present"},async()=>{
  const jobs=JSON.parse(fs.readFileSync(parityFile,"utf8")); const bad=[];
  for(const j of jobs){ const r=await post({lines:j.lines,order:j.order}); const {totals:T}=await r.json();
    if(Math.abs(L.r2(T.sub-T.extra+T.adj)-j.legacy.sub)>0.05||Math.abs(T.total-j.legacy.total)>0.05) bad.push(j.no); }
  assert.deepEqual(bad,[],`${jobs.length-bad.length}/${jobs.length} match via the API`);
});

test("bad input is refused with 400",async()=>{
  assert.equal((await post({lines:"nope"})).status,400);
  assert.equal((await fetch(base+"/api/totals",{method:"POST",body:"{not json"})).status,400);
});
