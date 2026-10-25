// Level 1 bug reporting: reports keep their type and device details, and each one is announced once in Discord — without
// the staff member's text or any customer data, without pinging anyone, and without being lost when Discord is down.
// Discord here is a fake on 127.0.0.1 (accepted only under LHD_AUTH=dev; the real app only posts to discord.com webhooks).
const test=require("node:test"); const assert=require("node:assert/strict"); const http=require("node:http");
const {startTestServer,skipReason}=require("./helpers/server");
const skip=skipReason(); let S, fake; const PORT=3928, HOOK=3929; const got=[]; let down=false;
test.before(async()=>{ if(skip) return;
  fake=http.createServer((q,r)=>{ let b=""; q.on("data",d=>b+=d); q.on("end",()=>{ if(down){ r.writeHead(500).end(); return; } got.push({path:q.url,body:JSON.parse(b)}); r.writeHead(204).end(); }); });
  await new Promise(r=>fake.listen(HOOK,"127.0.0.1",r));
  S=await startTestServer(PORT,{env:{DISCORD_WEBHOOK_URL:`http://127.0.0.1:${HOOK}/api/webhooks/123/fake-token`,LHD_PUBLIC_URL:"http://192.168.1.20:3000/"}}); });
test.after(async()=>{ if(S) await S.stop(); if(fake) fake.close(); });
const row=async id=>(await S.db.query("select kind, meta, notified_at, notify_error, notify_tries from feedback where id=$1",[id])).rows[0];

test("a bug report is saved with its type and cleaned device details, then announced once without its text",{skip},async()=>{
  const meta={ua:"Mozilla/5.0 test",vw:390,vh:844,lang:"th",errors:Array.from({length:15},(_,i)=>"err "+i),cookie:"lhd_trial=secret",extra:{a:1}};
  const r=await S.api("store","POST","/api/feedback",{kind:"bug",page:"/store",text:"ลูกค้า บริษัท ABC — ปุ่มคืนของกดไม่ได้ @everyone",meta});
  assert.equal(r.status,201);
  const f=await row(r.body.id); assert.equal(f.kind,"bug"); assert.ok(f.notified_at,"sent"); assert.equal(f.notify_tries,1);
  assert.deepEqual(Object.keys(f.meta).sort(),["errors","lang","ua","vh","vw"],"only the known fields are kept");
  assert.deepEqual(f.meta.errors,Array.from({length:10},(_,i)=>"err "+(i+5)),"the last 10 errors");
  assert.equal(got.length,1); const m=got[0].body; assert.equal(got[0].path,"/api/webhooks/123/fake-token");
  assert.deepEqual(m.allowed_mentions,{parse:[]},"never pings anyone");
  const s=JSON.stringify(m); assert.ok(!s.includes("ABC")&&!s.includes("ปุ่ม")&&!s.includes("@everyone"),"the text stays in the app");
  assert.ok(!s.includes("Mozilla")&&!s.includes("err "),"device details stay in the app");
  assert.match(m.embeds[0].title,new RegExp(`Bug · #${r.body.id}$`)); assert.equal(m.embeds[0].url,`http://192.168.1.20:3000/feedback#f${r.body.id}`);
  assert.deepEqual(m.embeds[0].fields.map(x=>x.value),["/store","Test store"]);
});

test("an unknown type is filed as other; empty text is refused",{skip},async()=>{
  const r=await S.api("sale","POST","/api/feedback",{kind:"<script>",page:"/jobs",text:"x"}); assert.equal(r.status,201); assert.equal((await row(r.body.id)).kind,"other");
  assert.equal((await S.api("sale","POST","/api/feedback",{kind:"bug",text:" "})).status,422);
});

test("Discord down: the report is still saved; it goes out once, on the next report or when the admin opens the list",{skip},async()=>{
  down=true; const before=got.length;
  const a=await S.api("accounting","POST","/api/feedback",{kind:"idea",page:"/jobs",text:"one"}); assert.equal(a.status,201);
  let f=await row(a.body.id); assert.equal(f.notified_at,null); assert.equal(f.notify_error,"HTTP 500"); assert.equal(f.notify_tries,1);
  down=false; const list=await S.api("admin","GET","/api/feedback"); assert.equal(list.status,200); assert.equal(list.body.discord,true);
  f=await row(a.body.id); assert.ok(f.notified_at); assert.equal(f.notify_error,null);
  assert.equal(got.length,before+1); await S.api("admin","GET","/api/feedback"); assert.equal(got.length,before+1,"not sent twice");
  const shown=list.body.feedback.find(x=>x.id===a.body.id); assert.equal(shown.kind,"idea"); assert.equal(shown.notifyError,"HTTP 500","the list shows the state it was in when read");
});

test("at most 20 reports per person per hour",{skip},async()=>{
  const n=(await S.db.query("select count(*)::int n from feedback where user_id=$1",[S.uid.crew])).rows[0].n; assert.equal(n,0);
  for(let i=0;i<20;i++) assert.equal((await S.api("crew","POST","/api/feedback",{kind:"other",text:"r"+i})).status,201);
  const r=await S.api("crew","POST","/api/feedback",{kind:"other",text:"one more"}); assert.equal(r.status,429); assert.equal(r.body.error,"too_many_reports");
  assert.equal((await S.api("sale","POST","/api/feedback",{kind:"other",text:"others still can"})).status,201);
});
