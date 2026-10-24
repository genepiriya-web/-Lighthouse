// Staff trial on the office Wi-Fi: with LHD_TRIAL_PIN set, nothing is reachable without the PIN (header or cookie),
// wrong PINs are limited, /api/me reports the trial, and the Feedback button's notes reach admins only.
const test=require("node:test"); const assert=require("node:assert/strict");
const {startTestServer,skipReason}=require("./helpers/server");
const skip=skipReason(); let S; const PORT=3927; const base=`http://127.0.0.1:${PORT}`; const PIN="246810";
test.before(async()=>{ if(!skip) S=await startTestServer(PORT,{env:{LHD_TRIAL_PIN:PIN}}); });
test.after(async()=>{ if(S) await S.stop(); });
let jar="";
async function req(method,path,{who,body,cookie=jar}={}){ const h={}; if(who) h["x-dev-user"]=S.uid[who]; if(cookie) h.cookie=cookie; if(body){ h["content-type"]="application/json"; }
  const r=await fetch(base+path,{method,headers:h,body:body&&JSON.stringify(body)}); const sc=r.headers.get("set-cookie"); let j=null; try{ j=await r.json(); }catch{} return {status:r.status,body:j,setCookie:sc}; }

test("without the PIN nothing opens — not the staff list, not the API, not even with a staff id header",{skip},async()=>{
  assert.equal((await req("GET","/api/dev/staff")).body.error,"pin_required");
  assert.equal((await req("GET","/api/orders",{who:"admin"})).body.error,"pin_required");
  assert.equal((await req("GET","/api/me",{who:"sale",cookie:"lhd_trial=forged"})).body.error,"pin_required");
});

test("the right PIN sets an httpOnly cookie; then sign-in works and the trial is flagged",{skip},async()=>{
  assert.equal((await req("POST","/api/dev/pin",{body:{pin:"000000"}})).body.error,"wrong_pin");
  const r=await req("POST","/api/dev/pin",{body:{pin:PIN}}); assert.equal(r.status,200);
  assert.match(r.setCookie,/^lhd_trial=[^;]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=43200$/); jar=r.setCookie.split(";")[0];
  assert.equal((await req("GET","/api/dev/staff")).body.staff.length,5);
  const me=await req("GET","/api/me",{who:"sale"}); assert.equal(me.status,200); assert.equal(me.body.trial,true);
});

test("feedback: anyone sends from a page; only admins read and mark it",{skip},async()=>{
  assert.equal((await req("POST","/api/feedback",{who:"store",body:{page:"/store",text:"  "}})).status,422);
  assert.equal((await req("POST","/api/feedback",{who:"store",body:{page:"/store",text:"Overdue list should show the phone number"}})).status,201);
  assert.equal((await req("GET","/api/feedback",{who:"store"})).status,403);
  const list=(await req("GET","/api/feedback",{who:"admin"})).body.feedback; assert.deepEqual([list[0].userName,list[0].role,list[0].page,list[0].status],["Test store","store","/store","new"]);
  assert.equal((await req("PATCH",`/api/feedback/${list[0].id}`,{who:"sale",body:{status:"seen"}})).status,403);
  assert.equal((await req("PATCH",`/api/feedback/${list[0].id}`,{who:"admin",body:{status:"done"}})).status,200);
});

test("wrong PINs: after 10 in 10 minutes even the right one is refused",{skip},async()=>{
  for(let i=0;i<10;i++) assert.equal((await req("POST","/api/dev/pin",{body:{pin:"111111"},cookie:""})).body.error,"wrong_pin");
  const r=await req("POST","/api/dev/pin",{body:{pin:PIN},cookie:""}); assert.equal(r.status,429); assert.equal(r.body.error,"too_many_tries");
});
