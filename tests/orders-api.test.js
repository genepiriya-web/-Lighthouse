// M3 end-to-end: the built Next.js app against a throwaway Postgres, called over HTTP as each role.
// Proves the acceptance criteria: roles enforced server-side (store can't change prices or move Quote→Order),
// status guards (customer, dates, items, stock clash, check-out, check-in), optimistic version check, legacy jobs
// read-only, and an activity entry (who, when, what) for every change.
// Needs `npm run build` and a local Postgres (`npm run db:start`). Synthetic data only.
const test=require("node:test"); const assert=require("node:assert/strict");
const {spawn}=require("node:child_process"); const fs=require("fs"), os=require("os"), path=require("path"), crypto=require("crypto");
const {Client}=require("pg");
require("../scripts/env");
const {migrate}=require("../scripts/migrate"); const {importExport}=require("../scripts/import"); const {writeFixture}=require("./helpers/fixture");
const L=require("../src/logic.js");

const ADMIN=process.env.DATABASE_ADMIN_URL; const root=path.join(__dirname,"..");
const skip=!ADMIN?"no DATABASE_ADMIN_URL — run `npm run db:start`":!fs.existsSync(path.join(root,".next/BUILD_ID"))?"run `npm run build` first":false;
const dbName="lhd_api_"+crypto.randomBytes(4).toString("hex"); const PORT=3919; const base=`http://127.0.0.1:${PORT}`;
const urlFor=db=>{ const u=new URL(ADMIN); u.pathname="/"+db; return u.toString(); };
const ROLES=["admin","sale","store","accounting","crew"]; const uid={}; for(const r of ROLES) uid[r]=crypto.randomUUID();
const NOT_STAFF=crypto.randomUUID(), INACTIVE=crypto.randomUUID();
let admin, srv; const fixture=fs.mkdtempSync(path.join(os.tmpdir(),"lhd-api-"));
let writes=0; // successful writes on the main job, to check every one left an activity row

test.before(async()=>{ if(skip) return;
  admin=new Client({connectionString:ADMIN}); await admin.connect(); await admin.query(`create database ${dbName}`);
  await migrate(urlFor(dbName),{log:()=>{}}); writeFixture(fixture);
  const c=new Client({connectionString:urlFor(dbName)}); await c.connect();
  await importExport(c,fixture);
  await c.query("insert into staff(user_id,display_name,role,active) select * from unnest($1::uuid[],$2::text[],$3::text[],$4::bool[])",
    [[...ROLES.map(r=>uid[r]),INACTIVE],[...ROLES.map(r=>"Test "+r),"Gone"],[...ROLES,"sale"],[...ROLES.map(()=>true),false]]);
  await c.end();
  srv=spawn(process.execPath,[require.resolve("next/dist/bin/next"),"start","-p",String(PORT),"-H","127.0.0.1"],
    {cwd:root,stdio:["ignore","ignore","pipe"],env:{...process.env,DATABASE_URL:urlFor(dbName),LHD_AUTH:"dev",NEXT_TELEMETRY_DISABLED:"1"}});
  srv.stderr.on("data",d=>{ if(process.env.DEBUG_API) process.stderr.write(d); });
  for(let i=0;i<100;i++){ try{ await fetch(base+"/api/me"); return; }catch{} await new Promise(r=>setTimeout(r,150)); }
  throw new Error("next start did not come up");
});
test.after(async()=>{ if(skip) return; if(srv) srv.kill(); await new Promise(r=>setTimeout(r,300));
  await admin.query(`drop database if exists ${dbName} with (force)`); await admin.end(); fs.rmSync(fixture,{recursive:true,force:true}); });

async function api(who,method,p,body){
  const headers={"content-type":"application/json"}; if(who) headers["x-dev-user"]=uid[who]||who;
  const r=await fetch(base+p,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  let json=null; try{ json=await r.json(); }catch{} return {status:r.status,body:json};
}
const rev=async id=>(await api("admin","GET",`/api/orders/${id}`)).body.order.rev;
const ok=(r,what)=>{ assert.ok(r.status>=200&&r.status<300,`${what}: ${r.status} ${JSON.stringify(r.body)}`); return r.body; };
const BE2=String((new Date().getFullYear()+543)%100).padStart(2,"0");
let main; // the job most tests walk through its life

test("auth: signed out → 401, not staff or inactive → 403, any staff can read",{skip},async()=>{
  assert.equal((await api(null,"GET","/api/orders")).status,401);
  assert.equal((await api(NOT_STAFF,"GET","/api/orders")).body.error,"not_staff");
  assert.equal((await api(INACTIVE,"GET","/api/orders")).status,403);
  const r=ok(await api("store","GET","/api/orders?status=open"),"store list");
  assert.deepEqual(r.orders.map(o=>o.no).sort(),["6900001","6900002"]);
  assert.equal(ok(await api("crew","GET","/api/me")).role,"crew");
});

test("create: sale/admin only; customer and title required; number from the database; customer details filled by id",{skip},async()=>{
  assert.equal((await api("store","POST","/api/orders",{customerId:"10",jobTitle:"x"})).status,403);
  assert.equal((await api("sale","POST","/api/orders",{jobTitle:"x"})).body.error,"needCust");
  assert.equal((await api("sale","POST","/api/orders",{customerId:"10"})).body.error,"needTitle");
  assert.equal((await api("sale","POST","/api/orders",{customerId:"10",jobTitle:"x",ship:"2026-12-05",ret:"2026-12-01"})).body.error,"badDates");
  main=ok(await api("sale","POST","/api/orders",{customerId:"10",jobTitle:"TVC Synthetic",ship:"2026-12-01",ret:"2026-12-02",tax:"Vat"}),"create"); writes++;
  assert.match(main.no,new RegExp(`^${BE2}\\d{5}$`)); if(BE2==="69") assert.ok(+main.no>=6909001);
  const d=ok(await api("store","GET",`/api/orders/${main.id}`)).order;
  assert.deepEqual([d.owner,d.status,d.rev,d.customer_name,d.billing,d.created_by_name],["v2","Quote",0,"Synthetic Films","1 Test Rd","Test sale"]);
});

test("roles: store and crew can't change items or prices; sale can, and totals are computed by the server",{skip},async()=>{
  const lines=[{k:"a",t:1,pid:1,code:"M18",desc:"HMI",list:24000,qty:1,days:2,disc:60},{k:"g",t:5,code:"G01",desc:"Gaffer",list:3000,qty:1,days:1,ot:2,otRate:400,crewId:"500"}];
  for(const who of ["store","crew","accounting"]) assert.equal((await api(who,"PUT",`/api/orders/${main.id}/lines`,{rev:0,lines})).status,403,who);
  assert.equal((await api("store","PATCH",`/api/orders/${main.id}`,{rev:0,extraDisc:50})).status,403);
  const r=ok(await api("sale","PUT",`/api/orders/${main.id}/lines`,{rev:0,lines,totals:{total:1}}),"sale lines"); writes++;
  assert.equal(r.rev,1);
  const d=ok(await api("store","GET",`/api/orders/${main.id}`));
  assert.deepEqual(d.order.totals,L.orderTotals(lines,{tax:"Vat"}));
  assert.equal(d.order.totals.total,L.r2((19200+3800)*1.07));
  assert.deepEqual(d.order.usage,[[1,1]]);
});

test("roles: store can't move Quote→Order through the API",{skip},async()=>{
  const r=await api("store","POST",`/api/orders/${main.id}/move`,{rev:1,to:"Order"});
  assert.equal(r.status,403); assert.equal(r.body.error,"rRole");
  assert.equal(ok(await api("admin","GET",`/api/orders/${main.id}`)).order.status,"Quote");
});

test("version check: two saves from the same rev → one wins, the other gets 409 stale",{skip},async()=>{
  const lines=[{k:"a",t:1,pid:1,code:"M18",list:24000,qty:1,days:2,disc:60},{k:"g",t:5,code:"G01",list:3000,qty:1,days:1,ot:2,otRate:400,crewId:"500"}];
  const [a,b]=await Promise.all([api("sale","PUT",`/api/orders/${main.id}/lines`,{rev:1,lines}),api("admin","PATCH",`/api/orders/${main.id}`,{rev:1,note:"from admin"})]);
  assert.deepEqual([a.status,b.status].sort(),[200,409]); writes++;
  const loser=a.status===409?a:b; assert.equal(loser.body.error,"stale"); assert.equal(loser.body.currentRev,2);
  assert.equal(await rev(main.id),2);
  assert.equal((await api("sale","PATCH",`/api/orders/${main.id}`,{note:"no rev"})).body.error,"rev_required");
});

test("guards: customer, dates, items and stock clash are checked on the server",{skip},async()=>{
  const j=ok(await api("sale","POST","/api/orders",{customerId:"10",jobTitle:"Guard job"}));
  assert.equal((await api("sale","POST",`/api/orders/${j.id}/move`,{rev:0,to:"Order"})).body.error,"rNeedDates");
  ok(await api("sale","PATCH",`/api/orders/${j.id}`,{rev:0,ship:"2026-11-01",ret:"2026-11-02"}));
  assert.equal((await api("sale","POST",`/api/orders/${j.id}/move`,{rev:1,to:"Order"})).body.error,"rNeedItems");
  ok(await api("sale","PUT",`/api/orders/${j.id}/lines`,{rev:1,lines:[{k:"a",t:1,pid:1,code:"M18",list:24000,qty:1,days:1}]}));
  ok(await api("sale","PATCH",`/api/orders/${j.id}`,{rev:2,customerName:""}));
  assert.equal((await api("sale","POST",`/api/orders/${j.id}/move`,{rev:3,to:"Order"})).body.error,"rNeedCust");
  ok(await api("sale","PATCH",`/api/orders/${j.id}`,{rev:3,customerName:"Synthetic Films"}));
  // Legacy job 6900001 (status Order) holds 3 of the 2 M18s on 1–2 Nov: v2 can't book one more on those dates.
  const clash=await api("sale","POST",`/api/orders/${j.id}/move`,{rev:4,to:"Order"});
  assert.equal(clash.status,422); assert.equal(clash.body.error,"rClash"); assert.deepEqual(clash.body.issues,[{pid:1,short:1}]);
  ok(await api("sale","PATCH",`/api/orders/${j.id}`,{rev:4,ship:"2026-11-10",ret:"2026-11-11"}));
  assert.equal(ok(await api("sale","POST",`/api/orders/${j.id}/move`,{rev:5,to:"Order"})).status,"Order");
  assert.equal((await api("sale","POST",`/api/orders/${j.id}/move`,{rev:6,to:"Shipped"})).body.error,"rFlow");
});

test("store flow: check-out before Shipped, check-in before Returned, each step by the right role",{skip},async()=>{
  const id=main.id; let r=await rev(id);
  r=ok(await api("sale","POST",`/api/orders/${id}/move`,{rev:r,to:"Order"})).rev; writes++;
  r=ok(await api("sale","POST",`/api/orders/${id}/move`,{rev:r,to:"Approve"})).rev; writes++;
  assert.equal((await api("sale","PUT",`/api/orders/${id}/lines`,{rev:r,lines:[]})).status,403,"sale can't edit items at Approve");
  assert.equal((await api("sale","POST",`/api/orders/${id}/checkout`,{rev:r,all:true})).status,403);
  assert.equal((await api("store","POST",`/api/orders/${id}/checkout`,{rev:r,lines:[{k:"a",out:2}]})).body.error,"over_qty");
  assert.equal((await api("store","POST",`/api/orders/${id}/checkout`,{rev:r,lines:[{k:"g",out:1}]})).body.error,"not_stocked");
  assert.equal((await api("store","POST",`/api/orders/${id}/move`,{rev:r,to:"Shipped"})).body.error,"rCheckOut");
  assert.equal((await api("store","POST",`/api/orders/${id}/checkin`,{rev:r,all:true})).body.error,"wrong_status");
  r=ok(await api("store","POST",`/api/orders/${id}/checkout`,{rev:r,all:true})).rev; writes++;
  assert.equal((await api("sale","POST",`/api/orders/${id}/move`,{rev:r,to:"Shipped"})).body.error,"rRole");
  r=ok(await api("store","POST",`/api/orders/${id}/move`,{rev:r,to:"Shipped"})).rev; writes++;
  assert.equal((await api("store","POST",`/api/orders/${id}/move`,{rev:r,to:"Returned"})).body.error,"rCheckIn");
  assert.equal((await api("store","POST",`/api/orders/${id}/checkin`,{rev:r,lines:[{k:"a",in:1,dmg:2}]})).body.error,"dmg_over_in");
  assert.equal((await api("store","POST",`/api/orders/${id}/checkin`,{rev:r,lines:[{k:"a",in:1,lost:1}]})).body.error,"over_out");
  assert.equal((await api("store","POST",`/api/orders/${id}/checkin`,{rev:r,lines:[{k:"a",out:0}]})).body.error,"wrong_fields");
  r=ok(await api("store","POST",`/api/orders/${id}/checkin`,{rev:r,lines:[{k:"a",in:1,dmg:1}]})).rev; writes++;
  r=ok(await api("store","POST",`/api/orders/${id}/move`,{rev:r,to:"Returned"})).rev; writes++;
  assert.equal((await api("store","POST",`/api/orders/${id}/move`,{rev:r,to:"Draft INV"})).body.error,"rRole");
  r=ok(await api("accounting","POST",`/api/orders/${id}/move`,{rev:r,to:"Draft INV"})).rev; writes++;
  assert.equal((await api("accounting","PATCH",`/api/orders/${id}`,{rev:r,insurance:100})).status,403,"no money edits on Draft INV");
  const line=ok(await api("admin","GET",`/api/orders/${id}`)).lines.find(l=>l.k==="a");
  assert.deepEqual([line.out,line.in,line.dmg,line.lost],[1,1,1,0]);
});

test("header vs money permissions follow the artifact: accounting edits fees, not job details",{skip},async()=>{
  const j=ok(await api("sale","POST","/api/orders",{customerId:"10",jobTitle:"Money job"}));
  ok(await api("sale","PUT",`/api/orders/${j.id}/lines`,{rev:0,lines:[{k:"a",t:2,pid:2,list:150,qty:4,days:1}]}));
  assert.equal((await api("accounting","PATCH",`/api/orders/${j.id}`,{rev:1,jobTitle:"renamed"})).status,403);
  ok(await api("accounting","PATCH",`/api/orders/${j.id}`,{rev:1,insurance:500,extraDisc:150}));
  const o=ok(await api("admin","GET",`/api/orders/${j.id}`)).order;
  assert.equal(o.extra_disc,100,"extra discount clamps to 100% as on the artifact"); assert.equal(o.totals.ins,500);
  assert.deepEqual(o.totals,L.orderTotals([{t:2,list:150,qty:4,days:1}],{extraDisc:100,insurance:500,tax:"Vat"}));
  assert.equal((await api("crew","PATCH",`/api/orders/${j.id}`,{rev:2,note:"x"})).status,403);
  assert.equal((await api("sale","PATCH",`/api/orders/${j.id}`,{rev:2,totals:{}})).body.error,"unknown_fields");
});

test("price rule (Gene, Q21b): below catalog or over the discount limit needs an admin",{skip},async()=>{
  // Fixture catalog: M18 (1) ฿24,000, discountable, no cap · CG (2) ฿150, not discountable · GEN (3) ฿9,000, max 20%.
  const j=ok(await api("sale","POST","/api/orders",{customerId:"10",jobTitle:"Price rule job"})); let r=0;
  const put=(who,lines)=>api(who,"PUT",`/api/orders/${j.id}/lines`,{rev:r,lines});
  const rule=async(lines,expect)=>{ const x=await put("sale",lines); assert.equal(x.status,403,JSON.stringify(x.body)); assert.equal(x.body.error,"price_rule");
    assert.deepEqual(x.body.breaks.map(b=>[b.k,b.rule,b.value,b.limit]),expect); };
  await rule([{k:"a",t:1,pid:1,code:"M18",list:20000,qty:1,days:1}],[["a","below_catalog",20000,24000]]);
  await rule([{k:"b",t:2,pid:2,code:"CG",list:150,qty:4,days:1,disc:5}],[["b","no_discount",5,0]]);
  await rule([{k:"c",t:4,pid:3,code:"GEN",list:9000,qty:1,days:1,disc:25}],[["c","over_max_disc",25,20]]);
  await rule([{k:"a",t:1,pid:1,list:1,qty:1,days:1},{k:"c",t:4,pid:3,list:8000,qty:1,days:1,disc:30}],[["a","below_catalog",1,24000],["c","below_catalog",8000,9000],["c","over_max_disc",30,20]]);
  // Allowed for sale: at or above catalog, within the limit, no-cap items, FOC, kit parts, crew lines.
  const fine=[{k:"a",t:1,pid:1,code:"M18",list:26000,qty:1,days:1,disc:70},{k:"c",t:4,pid:3,code:"GEN",list:9000,qty:1,days:1,disc:20},
    {k:"p",t:2,pid:2,code:"CG",list:0,qty:4,days:1,parent:"c"},{k:"f",t:2,pid:2,code:"CG",list:150,qty:1,days:1,foc:true},
    {k:"g",t:5,code:"G01",list:1,qty:1,days:1,crewId:"500"},{k:"x",t:6,code:"SUB",list:5,qty:1,days:1}];
  r=ok(await put("sale",fine),"sale within rules").rev;
  // An admin may break it; the override is recorded with the change.
  const adminLines=fine.map(l=>l.k==="c"?{...l,list:7000,disc:35}:l);
  r=ok(await put("admin",adminLines),"admin override").rev;
  const act=ok(await api("admin","GET",`/api/orders/${j.id}`)).activity.at(-1);
  assert.equal(act.actor_name,"Test admin"); assert.deepEqual(act.detail.overrides.map(b=>[b.k,b.rule]),[["c","below_catalog"],["c","over_max_disc"]]);
  // Sale can still edit other lines without touching the admin-approved one...
  r=ok(await put("sale",adminLines.map(l=>l.k==="a"?{...l,qty:2}:l)),"sale edits around the override").rev;
  // ...but changing the approved line again needs an admin.
  await rule(adminLines.map(l=>l.k==="c"?{...l,disc:36}:l),[["c","below_catalog",7000,9000],["c","over_max_disc",36,20]]);
  // Turning a kit part into a normal line is a change too.
  await rule(adminLines.map(l=>l.k==="p"?{...l,parent:undefined}:l),[["p","below_catalog",0,150]]);
});

test("legacy jobs are read-only through every endpoint",{skip},async()=>{
  const r0=await rev("6900001");
  for(const [m,p,b] of [["PATCH","",{note:"x"}],["PUT","/lines",{lines:[]}],["POST","/move",{to:"Approve"}],["POST","/fix-status",{to:"Cancel",reason:"test"}],["POST","/checkout",{all:true}]]){
    const r=await api("admin",m,`/api/orders/6900001${p}`,{rev:r0,...b}); assert.equal(r.status,409,`${m} ${p}`); assert.equal(r.body.error,"legacy_read_only"); }
  assert.equal(await rev("6900001"),r0);
});

test("fix-status: admin only, needs a reason, logged as its own action",{skip},async()=>{
  const r=await rev(main.id);
  assert.equal((await api("sale","POST",`/api/orders/${main.id}/fix-status`,{rev:r,to:"Returned",reason:"typo"})).status,403);
  assert.equal((await api("admin","POST",`/api/orders/${main.id}/fix-status`,{rev:r,to:"Returned"})).body.error,"reason_required");
  ok(await api("admin","POST",`/api/orders/${main.id}/fix-status`,{rev:r,to:"Returned",reason:"Billed on wrong job"})); writes++;
  const a=ok(await api("admin","GET",`/api/orders/${main.id}`)).activity.at(-1);
  assert.deepEqual([a.action,a.actor_name,a.detail.reason,a.detail.from,a.detail.to],["status_fix","Test admin","Billed on wrong job","Draft INV","Returned"]);
});

test("activity: one entry per successful change, with who, when and what",{skip},async()=>{
  const {activity,order}=ok(await api("admin","GET",`/api/orders/${main.id}`));
  assert.equal(activity.length,writes); assert.equal(order.rev,writes-1);
  for(const a of activity){ assert.ok(a.actor_name&&a.at&&a.action,JSON.stringify(a)); assert.ok(!isNaN(Date.parse(a.at))); }
  assert.deepEqual(activity.map(a=>a.action),["created","items","items","status","status","checkout","status","checkin","status","status","status_fix"]);
  const items=activity[1].detail; assert.deepEqual(items.added.map(x=>x.k),["a","g"]);
  const out=activity.find(a=>a.action==="checkout").detail.changed; assert.deepEqual(out,{a:{out:[0,1]}});
});
