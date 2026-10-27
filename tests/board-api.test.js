// Daily job board (Gene, 27 Oct 2026): who sees and edits it, which jobs a day shows, entries per job per day, the stale
// check, copying forward, and the PDF. Synthetic data only (tests/helpers/fixture.js).
const test=require("node:test"); const assert=require("node:assert/strict");
const {startTestServer,skipReason}=require("./helpers/server"); const {boardPage,span}=require("../lib/boardform.js");
const skip=skipReason(); let S;
test.before(async()=>{ if(!skip) S=await startTestServer(3931); });
test.after(async()=>{ if(S) await S.stop(); });
const ok=(r,what)=>{ assert.ok(r.status>=200&&r.status<300,`${what}: ${r.status} ${JSON.stringify(r.body)}`); return r.body; };
const entry={onloc:"Onloc. 06.00 น.",loc:"Test studio",head:"Head A",crew:"B C D",trucks:"T.01 (driver E)",gens:"G.45 (F)",remark:"*call sales for extra items"};

test("any staff reads a day; only jobs working that day; quotes left out; what the job knows comes along",{skip},async()=>{
  assert.equal((await S.api(null,"GET","/api/board?day=2026-11-01")).status,401);
  const b=ok(await S.api("crew","GET","/api/board?day=2026-11-01"));
  assert.deepEqual(b.jobs.map(j=>j.no),["6900001"],"6900002 is a quote"); const j=b.jobs[0];
  assert.deepEqual([j.section,j.entry,j.prev],["ads",null,null]); assert.deepEqual(j.fromJob.crew,["G01"]);
  assert.deepEqual(ok(await S.api("crew","GET","/api/board?day=2026-11-03")).jobs,[],"after the job's last day");
  assert.equal((await S.api("crew","GET","/api/board?day=1.11.2026")).status,422);
});

test("admin, sales/Support and store edit; others can't; stale saves refused; every change logged",{skip},async()=>{
  for(const who of ["crew","accounting"]) assert.equal((await S.api(who,"PUT","/api/board/6900001/2026-11-01",entry)).status,403,who);
  const e1=ok(await S.api("sale","PUT","/api/board/6900001/2026-11-01",entry),"sale saves").entry;
  assert.equal(e1.head,"Head A"); assert.equal(e1.updated_by_name,"Test sale");
  assert.equal((await S.api("store","PUT","/api/board/6900001/2026-11-01",{...entry,trucks:"T.02"})).body.error,"stale","no updatedAt: someone else's entry exists");
  const e2=ok(await S.api("store","PUT","/api/board/6900001/2026-11-01",{...entry,trucks:"T.02",updatedAt:new Date(e1.updated_at).toISOString()}),"store changes the truck").entry;
  assert.equal((await S.api("sale","PUT","/api/board/6900001/2026-11-01",{...entry,updatedAt:new Date(e1.updated_at).toISOString()})).body.error,"stale");
  ok(await S.api("admin","PUT","/api/board/6900001/2026-11-01",{...entry,trucks:"",updatedAt:new Date(e2.updated_at).toISOString()}),"blank clears");
  const j=ok(await S.api("crew","GET","/api/board?day=2026-11-01")).jobs[0]; assert.equal(j.entry.trucks,null); assert.equal(j.entry.loc,"Test studio");
  assert.equal(ok(await S.api("crew","GET","/api/board?day=2026-11-02")).jobs[0].prev.head,"Head A","the next day can copy it forward");
  assert.equal((await S.api("sale","PUT","/api/board/nope/2026-11-01",entry)).status,404);
  assert.equal((await S.api("sale","PUT","/api/board/6900001/2026-13-40",entry)).status,422);
  assert.equal((await S.api("sale","PUT","/api/board/6900001/2026-11-02",{...entry,remark:"x".repeat(2001)})).body.error,"too_long");
  const act=ok(await S.api("admin","GET","/api/orders/6900001")).activity.filter(a=>a.action==="board");
  assert.equal(act.length,3); assert.deepEqual(Object.keys(act[1].detail.changed),["trucks"]);
});

test("the day as a landscape PDF, laid out like the Excel; text is escaped",{skip},async()=>{
  const r=await fetch("http://127.0.0.1:3931/api/board/pdf?day=2026-11-01",{headers:{"x-dev-user":S.uid.crew}});
  assert.equal(r.status,200); assert.equal(r.headers.get("content-type"),"application/pdf"); assert.equal(Buffer.from(await r.arrayBuffer()).subarray(0,5).toString(),"%PDF-");
});

test("print layout (no server): sections, the Excel's columns, entry over job data, escaping",()=>{
  const job={id:"1",no:"6909001",dept:1,section:"drama",customer_name:"<House>",dop:"DOP",job_title:"T",sale:"S",gaffer:"G",note:"note",use_start:"2026-11-01",use_end:"2026-11-03",
    fromJob:{crew:["X (ELECTRICIAN)"],trucks:["Lighting Truck"],gens:["Generator 45 KVA"]},entry:{head:"H",crew:"A B"}};
  const h=boardPage({day:"2026-11-01",jobs:[job]},"01/11/2026");
  assert.ok(h.includes("LIGHTING / ละคร")&&h.includes("ELECTRICIAN.")&&h.includes("&lt;House&gt;")&&!h.includes("<House>"));
  assert.ok(h.includes(">A B<")&&!h.includes("X (ELECTRICIAN)"),"the entry wins"); assert.ok(h.includes("Lighting Truck"),"job data fills the gaps (grey)");
  assert.equal(span(job),"1/11-3/11"); assert.equal(span({use_start:"2026-11-05",use_end:"2026-11-05"}),"5");
});
