// M6 sign-in, in production mode (no dev sign-in), against a fake Supabase that publishes a key list and answers the
// legacy /auth/v1/user check. Covers: token verification, invites on first sign-in, refusals, cookie vs header (CSRF).
const test=require("node:test"); const assert=require("node:assert/strict"); const http=require("node:http"); const crypto=require("node:crypto");
const {startTestServer,skipReason}=require("./helpers/server");
const skip=skipReason(); let S, fake, jose, key, otherKey; const PORT=3926, FAKE=3991; const SB=`http://127.0.0.1:${FAKE}`; const ISS=`${SB}/auth/v1`;
const hsUsers=new Map(); // legacy-token → user, as Supabase's /auth/v1/user would answer

test.before(async()=>{ if(skip) return;
  jose=await import("jose");
  key=await jose.generateKeyPair("ES256",{extractable:true}); otherKey=await jose.generateKeyPair("ES256");
  const jwk={...(await jose.exportJWK(key.publicKey)),kid:"k1",alg:"ES256",use:"sig"};
  fake=http.createServer((req,res)=>{
    if(req.url==="/auth/v1/.well-known/jwks.json"){ res.setHeader("content-type","application/json"); return res.end(JSON.stringify({keys:[jwk]})); }
    if(req.url==="/auth/v1/user"){ const u=hsUsers.get((req.headers.authorization||"").slice(7)); if(!u||req.headers.apikey!=="pk_test"){ res.statusCode=401; return res.end("{}"); } return res.end(JSON.stringify(u)); }
    res.statusCode=404; res.end();
  }); await new Promise(r=>fake.listen(FAKE,"127.0.0.1",r));
  S=await startTestServer(PORT,{env:{LHD_AUTH:"",SUPABASE_URL:SB,SUPABASE_PUBLISHABLE_KEY:"pk_test"}});
});
test.after(async()=>{ if(S) await S.stop(); if(fake) fake.close(); });

const sign=(claims,{k=key.privateKey,kid="k1",iss=ISS,exp="10m"}={})=>new jose.SignJWT({role:"authenticated",aud:"authenticated",...claims}).setProtectedHeader({alg:"ES256",kid}).setIssuer(iss).setIssuedAt().setExpirationTime(exp).sign(k);
const call=async(token,method="GET",path="/api/me",{cookie,body}={})=>{ const h={}; if(token) h.authorization=`Bearer ${token}`; if(cookie) h.cookie=cookie; if(body){ h["content-type"]="application/json"; }
  const r=await fetch(`http://127.0.0.1:${PORT}${path}`,{method,headers:h,body:body&&JSON.stringify(body)}); let j=null; try{ j=await r.json(); }catch{} return {status:r.status,body:j}; };

test("valid Supabase token for a staff member → signed in; dev sign-in is off",{skip},async()=>{
  const r=await call(await sign({sub:S.uid.admin,email:"admin@example.test"})); assert.equal(r.status,200); assert.equal(r.body.role,"admin");
  assert.equal((await S.api("admin","GET","/api/me")).status,401,"x-dev-user must be ignored outside dev mode");
});

test("refused: no token, garbage, expired, wrong issuer, wrong key, unknown key id, not 'authenticated', alg none",{skip},async()=>{
  const sub=S.uid.admin;
  for(const [what,tok] of [["none",null],["garbage","abc.def.ghi"],["expired",await sign({sub},{exp:Math.floor(Date.now()/1000)-60})],["issuer",await sign({sub},{iss:"https://evil.example/auth/v1"})],
    ["key",await sign({sub},{k:otherKey.privateKey})],["kid",await sign({sub},{kid:"nope"})],["role",await sign({sub,role:"anon"})],
    ["alg none",Buffer.from('{"alg":"none"}').toString("base64url")+"."+Buffer.from(JSON.stringify({sub,role:"authenticated",iss:ISS})).toString("base64url")+"."]])
    assert.equal((await call(tok)).status,401,what);
});

test("invites: an invited, verified email joins with its role on first sign-in, once",{skip},async()=>{
  const admin=await sign({sub:S.uid.admin,email:"admin@example.test"}); const newId=crypto.randomUUID();
  const stranger=await sign({sub:newId,email:"new.store@example.test"});
  assert.equal((await call(stranger)).body.error,"not_staff","not invited yet");
  assert.equal((await call(await sign({sub:S.uid.sale}),"POST","/api/staff/invites",{body:{email:"x@example.test",role:"store"}})).status,403,"only admin invites");
  assert.equal((await call(admin,"POST","/api/staff/invites",{body:{email:"not-an-email",role:"store"}})).body.error,"bad_email");
  assert.equal((await call(admin,"POST","/api/staff/invites",{body:{email:"New.Store@Example.test",role:"store",name:"New Store"}})).status,201);
  const unverified=await sign({sub:crypto.randomUUID(),email:"new.store@example.test",user_metadata:{email_verified:false}});
  assert.equal((await call(unverified)).body.error,"not_staff","an unverified email can't claim an invite");
  const me=await call(stranger); assert.equal(me.status,200); assert.deepEqual([me.body.role,me.body.name],["store","New Store"]);
  const inv=(await call(admin,"GET","/api/staff/invites")).body.invites.find(i=>i.email==="new.store@example.test"); assert.ok(inv.usedAt);
  assert.equal((await call(await sign({sub:crypto.randomUUID(),email:"new.store@example.test"}))).body.error,"not_staff","an invite is used once");
  assert.equal((await call(admin,"POST","/api/staff/invites",{body:{email:"new.store@example.test",role:"admin"}})).body.error,"already_joined");
  assert.equal((await S.db.query("select count(*) from activity where entity='staff' and action='joined'")).rows[0].count,"1");
});

test("legacy HS256 tokens are checked with Supabase's /auth/v1/user, not locally",{skip},async()=>{
  const hs=await new jose.SignJWT({sub:S.uid.crew}).setProtectedHeader({alg:"HS256"}).sign(new TextEncoder().encode("any-secret-the-server-never-sees"));
  assert.equal((await call(hs)).status,401,"unknown to Supabase");
  hsUsers.set(hs,{id:S.uid.crew,email:"crew@example.test",email_confirmed_at:new Date().toISOString()});
  const r=await call(hs); assert.equal(r.status,200); assert.equal(r.body.role,"crew");
});

test("cookie signs in page reads only; changes need the header (no CSRF through the cookie)",{skip},async()=>{
  const tok=await sign({sub:S.uid.sale,email:"sale@example.test"}); const cookie=`lhd_at=${tok}`;
  assert.equal((await call(null,"GET","/api/me",{cookie})).status,200);
  assert.equal((await call(null,"POST","/api/orders",{cookie,body:{customerId:"10",jobTitle:"csrf"}})).status,401);
  assert.equal((await call(tok,"POST","/api/orders",{body:{customerId:"10",jobTitle:"with header"}})).status,201);
});
