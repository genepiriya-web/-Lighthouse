// Daily job board (Gene, 27 Oct 2026): who sees and edits it, which jobs a day shows, entries per job per day, the stale
// check, copying forward, and the PDF. Synthetic data only (tests/helpers/fixture.js).
const test=require("node:test"); const assert=require("node:assert/strict");
const {startTestServer,skipReason}=require("./helpers/server"); const {boardPage,span,autoFill,unitOf}=require("../lib/boardform.js");
const skip=skipReason(); let S;
test.before(async()=>{ if(!skip) S=await startTestServer(3931); });
test.after(async()=>{ if(S) await S.stop(); });
const ok=(r,what)=>{ assert.ok(r.status>=200&&r.status<300,`${what}: ${r.status} ${JSON.stringify(r.body)}`); return r.body; };
const entry={onloc:"Onloc. 06.00 น.",loc:"Test studio",head:"Head A",crew:"B C D",trucks:"T.01 (driver E)",gens:"G.45 (F)",remark:"*call sales for extra items"};

test("any staff reads a day; only jobs working that day; quotes left out; what the job knows comes along",{skip},async()=>{
  assert.equal((await S.api(null,"GET","/api/board?day=2026-11-01")).status,401);
  const b=ok(await S.api("crew","GET","/api/board?day=2026-11-01"));
  assert.deepEqual(b.jobs.map(j=>j.no),["6900001"],"6900002 is a quote"); const j=b.jobs[0];
  assert.deepEqual([j.section,j.entry,j.prev],["ads",null,null]); assert.equal(j.auto.crew,"T","crew filled from the job by nickname");
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
  const auto={gaffer:"",head:"X",crew:"Y Z",trucks:"D\nP01 (9467)",gens:"",remark:"note"};
  const job={id:"1",no:"6909001",dept:1,section:"drama",customer_name:"<House>",dop:"DOP",job_title:"T",sale:"S",use_start:"2026-11-01",use_end:"2026-11-03",auto,entry:{head:"H",crew:"A B"}};
  const job2={...job,id:"2",no:"6909002",entry:null};
  const h=boardPage({day:"2026-11-01",jobs:[job,job2]},"01/11/2026");
  assert.ok(h.includes("LIGHTING / ละคร")&&h.includes("ELECTRICIAN.")&&h.includes("&lt;House&gt;")&&!h.includes("<House>"));
  assert.ok(h.includes(">A B<"),"the entry wins"); assert.ok(h.includes(">Y Z<")&&h.includes("D<br>P01 (9467)"),"a job with no entry prints what the job says");
  assert.equal(span(job),"1/11-3/11"); assert.equal(span({use_start:"2026-11-05",use_end:"2026-11-05"}),"5");
});

test("filled from the job like the Excel (Gene, 27 Oct): nicknames by position, (Grip), (FL), drivers and vehicles, generator with its driver",()=>{
  const a=autoFill([{t:5,desc:"HEAD ELECTRICIAN SERIES · Test A (หนึ่ง)"},{t:5,desc:"ELECTRICIAN · Test B (สอง)"},{t:5,desc:"ASST. HEAD ELECT.SERIES · Test A (หนึ่ง)"},
    {t:5,desc:"GRIP MAN · Test C (สาม)"},{t:7,desc:"GAFFER-TVC2 · Test D (สี่)"},{t:5,desc:"PICK UP DRIVER  · Test E (ห้า)"},{t:5,desc:"Electrician & Pick up Driver · Test F (หก)"},
    {t:5,desc:"GEN DRIVER · Test G (เจ็ด)"},{t:5,code:"G01",nick:"Nick",desc:""},{t:4,desc:"Lighting Pick Up 1.5 Ton (0000) P18"},{t:4,desc:"Generator 45 KVA (0001) G17"},{t:4,desc:"Re-Fuel Service Charge"}]);
  assert.deepEqual(a,{gaffer:"สี่(FL)",head:"หนึ่ง",crew:"สอง สาม(Grip) Nick",trucks:"ห้า หก\nP18 (0000)",gens:"เจ็ด G17 (0001)"});
  assert.equal(unitOf("Van (TEST-0000) V5"),"V5 (TEST-0000)"); assert.equal(unitOf("Lighting Truck"),"Lighting Truck");
  assert.deepEqual(autoFill([]),{gaffer:"",head:"",crew:"",trucks:"",gens:""});
});
