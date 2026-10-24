// Staff trial on the office Wi-Fi: one PIN per department (LHD_TRIAL_PINS). The PIN is the only way in and decides who
// you are; ids in headers/cookies are ignored; wrong PINs are limited; /api/me reports the trial; feedback reaches admins.
const test=require("node:test"); const assert=require("node:assert/strict");
const {startTestServer,skipReason}=require("./helpers/server");
const skip=skipReason(); let S; const PORT=3927; const base=`http://127.0.0.1:${PORT}`;
const PINS={sale:"111222",store:"333444",support:"555666",accounting:"777888",admin:"999000"};
const ACCT={admin:"00000000-0000-4000-8000-000000000001",sale:"00000000-0000-4000-8000-000000000002",store:"00000000-0000-4000-8000-000000000003",accounting:"00000000-0000-4000-8000-000000000004",support:"00000000-0000-4000-8000-000000000006"};
const NAMES={admin:["ผู้ดูแล (CEO)","admin"],sale:["ฝ่ายขาย","sale"],store:["สโตร์","store"],accounting:["บัญชี","accounting"],support:["ซัพพอร์ต","sale"]};
test.before(async()=>{ if(skip) return; S=await startTestServer(PORT,{env:{LHD_TRIAL_PINS:JSON.stringify(PINS)}});
  for(const [d,id] of Object.entries(ACCT)) await S.db.query("insert into staff(user_id,display_name,role) values ($1,$2,$3)",[id,"ทดลอง · "+NAMES[d][0],NAMES[d][1]]); });
test.after(async()=>{ if(S) await S.stop(); });
async function req(method,path,{cookie,body,headers={}}={}){ const h={...headers}; if(cookie) h.cookie=cookie; if(body){ h["content-type"]="application/json"; }
  const r=await fetch(base+path,{method,headers:h,body:body&&JSON.stringify(body)}); let j=null; try{ j=await r.json(); }catch{} return {status:r.status,body:j,setCookie:r.headers.get("set-cookie")}; }
const signIn=async pin=>{ const r=await req("POST","/api/dev/pin",{body:{pin}}); assert.equal(r.status,200,JSON.stringify(r.body)); return {dept:r.body.dept,cookie:r.setCookie.split(";")[0],raw:r.setCookie}; };
const jar={};

test("without a PIN nothing opens — no picker, no API, staff-id headers and cookies ignored",{skip},async()=>{
  assert.equal((await req("GET","/api/dev/staff")).body.error,"pin_required");
  assert.equal((await req("GET","/api/orders",{headers:{"x-dev-user":ACCT.admin}})).body.error,"pin_required");
  assert.equal((await req("GET","/api/me",{cookie:`lhd_dev_user=${ACCT.admin}`})).body.error,"pin_required");
});

test("each department's PIN signs in as that department, and only that one",{skip},async()=>{
  for(const d of Object.keys(PINS)){ const s=await signIn(PINS[d]); jar[d]=s.cookie;
    assert.equal(s.dept,d); assert.match(s.raw,/^lhd_trial=[a-z]+\.[^;]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=43200$/);
    const me=(await req("GET","/api/me",{cookie:s.cookie})).body; assert.deepEqual([me.name,me.role,me.trial],["ทดลอง · "+NAMES[d][0],NAMES[d][1],true],d); }
  // the PIN decides who you are: a Sales sign-in plus an admin id in a header is still Sales
  assert.equal((await req("GET","/api/me",{cookie:jar.sale,headers:{"x-dev-user":ACCT.admin}})).body.role,"sale");
  assert.equal((await req("GET","/api/staff",{cookie:jar.sale})).status,403,"Sales can't open Team");
  assert.equal((await req("GET","/api/staff",{cookie:jar.admin})).status,200,"System admin can");
  assert.equal((await req("GET","/api/cockpit",{cookie:jar.support})).status,403,"Support isn't admin");
  assert.equal((await req("POST","/api/orders",{cookie:jar.support,body:{customerId:"10",jobTitle:"Support trial job"}})).status,201,"Support can create jobs like Sales");
});

test("a changed or swapped cookie is refused; signing out clears it",{skip},async()=>{
  const [dept,sig]=jar.sale.slice("lhd_trial=".length).split(".");
  assert.equal((await req("GET","/api/me",{cookie:`lhd_trial=admin.${sig}`})).body.error,"pin_required","sale signature reused for admin");
  assert.equal((await req("GET","/api/me",{cookie:`lhd_trial=${dept}.x${sig.slice(1)}`})).body.error,"pin_required");
  const out=await req("DELETE","/api/dev/pin",{cookie:jar.sale}); assert.match(out.setCookie,/^lhd_trial=; .*Max-Age=0$/);
});

test("feedback: anyone sends from a page; only the System admin PIN reads it",{skip},async()=>{
  assert.equal((await req("POST","/api/feedback",{cookie:jar.store,body:{page:"/store",text:"  "}})).status,422);
  assert.equal((await req("POST","/api/feedback",{cookie:jar.store,body:{page:"/store",text:"Overdue list should show the phone number"}})).status,201);
  assert.equal((await req("GET","/api/feedback",{cookie:jar.store})).status,403);
  const list=(await req("GET","/api/feedback",{cookie:jar.admin})).body.feedback; assert.deepEqual([list[0].userName,list[0].page],["ทดลอง · สโตร์","/store"]);
});

test("wrong PINs: after 10 in 10 minutes even a right one is refused",{skip},async()=>{
  for(let i=0;i<10;i++) assert.equal((await req("POST","/api/dev/pin",{body:{pin:"123123"}})).body.error,"wrong_pin");
  const r=await req("POST","/api/dev/pin",{body:{pin:PINS.sale}}); assert.equal(r.status,429); assert.equal(r.body.error,"too_many_tries");
});
