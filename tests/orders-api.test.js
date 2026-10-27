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
const L=require("../src/logic.js"); const {orderTotalsV2}=require("../lib/pricing.js");

const ADMIN=process.env.DATABASE_ADMIN_URL; const root=path.join(__dirname,"..");
const skip=!ADMIN?"no DATABASE_ADMIN_URL — run `npm run db:start`":!fs.existsSync(path.join(root,".next/BUILD_ID"))?"run `npm run build` first":false;
const dbName="lhd_api_"+crypto.randomBytes(4).toString("hex"); const PORT=3919; const base=`http://127.0.0.1:${PORT}`;
const urlFor=db=>{ const u=new URL(ADMIN); u.pathname="/"+db; return u.toString(); };
const ROLES=["admin","sale","store","accounting","crew","support"]; const uid={}; for(const r of ROLES) uid[r]=crypto.randomUUID();
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
    {cwd:root,stdio:["ignore","ignore","pipe"],env:{...process.env,DATABASE_URL:urlFor(dbName),LHD_AUTH:"dev",LHD_TRIAL_PINS:"",NEXT_TELEMETRY_DISABLED:"1"}});
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

test("store addition (Gene, 27 Oct): Store opens a linked job at Approve; it holds stock at once; Sales prices it, then Approve",{skip},async()=>{
  const j=ok(await api("sale","POST","/api/orders",{customerId:"10",jobTitle:"Urgent job",ship:"2026-11-20",ret:"2026-11-21"}));
  let r=ok(await api("sale","PUT",`/api/orders/${j.id}/lines`,{rev:0,lines:[{k:"a",t:1,pid:1,code:"M18",list:24000,qty:1,days:2}]})).rev;
  assert.equal((await api("store","POST",`/api/orders/${j.id}/store-addition`,{})).body.error,"wrong_status","only at Approve");
  r=ok(await api("sale","POST",`/api/orders/${j.id}/move`,{rev:r,to:"Order"})).rev; r=ok(await api("sale","POST",`/api/orders/${j.id}/move`,{rev:r,to:"Approve"})).rev;
  for(const who of ["sale","crew","accounting"]) assert.equal((await api(who,"POST",`/api/orders/${j.id}/store-addition`,{})).status,403,who);
  assert.equal((await api("store","POST","/api/orders/6900001/store-addition",{})).status,409,"not on legacy jobs");
  const a=ok(await api("store","POST",`/api/orders/${j.id}/store-addition`,{}),"create addition");
  let d=ok(await api("store","GET",`/api/orders/${a.id}`));
  assert.deepEqual([d.order.status,d.order.addition_of,d.order.customer_name,d.order.ship,d.order.job_title,d.additionOf.no],["Store Add",j.id,"Synthetic Films","2026-11-20","Urgent job — Store addition",j.no]);
  assert.deepEqual(ok(await api("sale","GET",`/api/orders/${j.id}`)).additions.map(x=>[x.no,x.status]),[[a.no,"Store Add"]]);
  assert.ok(ok(await api("sale","GET","/api/orders?status=open")).orders.some(o=>o.no===a.no&&o.addition_of===j.id),"listed with open jobs");
  // Store adds items but never prices: a price sent by Store is dropped; crew is refused
  assert.equal((await api("store","PUT",`/api/orders/${a.id}/lines`,{rev:0,lines:[{k:"g",t:5,code:"G01",list:3000,qty:1,days:1}]})).body.error,"store_items_only");
  const s1=ok(await api("store","PUT",`/api/orders/${a.id}/lines`,{rev:0,lines:[{k:"x",t:1,pid:1,code:"M18",list:24000,qty:1,days:2,disc:10,foc:true}]}),"store adds");
  assert.equal(s1.short,undefined,"2 in stock: the job holds 1, the addition 1");
  let line=ok(await api("admin","GET",`/api/orders/${a.id}`)).lines[0]; assert.deepEqual([line.list,line.disc,line.foc,line.qty],[0,0,false,1]);
  // it holds stock already: another job on the same dates can't confirm the last M18
  const o=ok(await api("sale","POST","/api/orders",{customerId:"10",jobTitle:"Other",ship:"2026-11-21",ret:"2026-11-22"}));
  ok(await api("sale","PUT",`/api/orders/${o.id}/lines`,{rev:0,lines:[{k:"a",t:1,pid:1,code:"M18",list:24000,qty:1,days:1}]}));
  const clash=await api("sale","POST",`/api/orders/${o.id}/move`,{rev:1,to:"Order"}); assert.equal(clash.body.error,"rClash"); assert.deepEqual(clash.body.issues,[{pid:1,short:1}]);
  // Store asking for more than is free is saved but flagged
  const s2=ok(await api("store","PUT",`/api/orders/${a.id}/lines`,{rev:s1.rev,lines:[{k:"x",t:1,pid:1,code:"M18",qty:2,days:2}]})); assert.deepEqual(s2.short,[{pid:1,short:1}]);
  r=ok(await api("store","PUT",`/api/orders/${a.id}/lines`,{rev:s2.rev,lines:[{k:"x",t:1,pid:1,code:"M18",qty:1,days:2}]})).rev;
  // only Sales/admin move it on, and only once every item has a price
  assert.equal((await api("store","POST",`/api/orders/${a.id}/move`,{rev:r,to:"Approve"})).body.error,"rRole");
  assert.equal((await api("sale","POST",`/api/orders/${a.id}/move`,{rev:r,to:"Approve"})).body.error,"rNeedPrices");
  assert.equal((await api("sale","POST",`/api/orders/${a.id}/move`,{rev:r,to:"Shipped"})).body.error,"rFlow");
  r=ok(await api("sale","PUT",`/api/orders/${a.id}/lines`,{rev:r,lines:[{k:"x",t:1,pid:1,code:"M18",list:24000,qty:1,days:2}]}),"sale prices").rev;
  r=ok(await api("store","PUT",`/api/orders/${a.id}/lines`,{rev:r,lines:[{k:"x",t:1,pid:1,code:"M18",list:1,qty:1,days:2,remark:"rush"}]})).rev;
  line=ok(await api("admin","GET",`/api/orders/${a.id}`)).lines[0]; assert.deepEqual([line.list,line.remark],[24000,"rush"],"Store's re-save keeps Sales' price");
  assert.equal(ok(await api("sale","POST",`/api/orders/${a.id}/move`,{rev:r,to:"Approve"})).status,"Approve");
  assert.equal((await api("store","PUT",`/api/orders/${a.id}/lines`,{rev:r+1,lines:[]})).status,403,"Store edits only while it is a Store Add");
  // a second addition can be cancelled by Store
  const b=ok(await api("store","POST",`/api/orders/${j.id}/store-addition`,{}));
  assert.equal(ok(await api("store","POST",`/api/orders/${b.id}/move`,{rev:0,to:"Cancel"})).status,"Cancel");
  assert.ok(ok(await api("admin","GET",`/api/orders/${j.id}`)).activity.filter(x=>x.action==="store_addition").length===2,"logged on the main job");
});

test("sales person comes from the list in settings (Gene, 27 Oct); a job keeps an older name it already has",{skip},async()=>{
  assert.deepEqual(ok(await api("crew","GET","/api/settings")).sales_people,["เชอร์รี่","เบนซ์","สอง"]);
  assert.equal((await api("sale","POST","/api/orders",{customerId:"10",jobTitle:"Sale pick",sale:"Nobody"})).body.error,"bad_sale");
  const j=ok(await api("sale","POST","/api/orders",{customerId:"10",jobTitle:"Sale pick",sale:"เบนซ์"}));
  assert.equal((await api("sale","PATCH",`/api/orders/${j.id}`,{rev:0,sale:"cherry"})).body.error,"bad_sale");
  const r=ok(await api("sale","PATCH",`/api/orders/${j.id}`,{rev:0,sale:"สอง"})).rev;
  ok(await api("sale","PATCH",`/api/orders/${j.id}`,{rev:r,sale:""}),"can be cleared");
});

test("support (Gene, 27 Oct): its own role with Sales' rights; me shows both",{skip},async()=>{
  const me=ok(await api("support","GET","/api/me")); assert.deepEqual([me.role,me.dept],["sale","support"]);
  const j=ok(await api("support","POST","/api/orders",{customerId:"10",jobTitle:"Support job",ship:"2026-12-01",ret:"2026-12-02"}),"support creates");
  let r=ok(await api("support","PATCH",`/api/orders/${j.id}`,{rev:0,useStart:"2026-12-01",useEnd:"2026-12-02"}),"usage dates").rev;
  r=ok(await api("support","PUT",`/api/orders/${j.id}/lines`,{rev:r,lines:[{k:"a",t:2,pid:2,code:"CG",list:150,qty:1,days:1}]})).rev;
  assert.equal(ok(await api("support","POST",`/api/orders/${j.id}/move`,{rev:r,to:"Order"})).status,"Order");
  assert.equal((await api("support","GET","/api/cockpit")).status,403,"not admin");
  ok(await api("admin","POST","/api/staff/invites",{email:"support.new@example.test",role:"support",name:"New Support"}),"invite as support");
  assert.equal((await api("admin","POST","/api/staff/invites",{email:"x@example.test",role:"boss"})).body.error,"bad_role");
});

test("dates (Gene, 27 Oct): Store moves the return date from Quote up to Shipped, nothing else; a clash is reported",{skip},async()=>{
  const j=ok(await api("sale","POST","/api/orders",{customerId:"10",jobTitle:"Ret job",ship:"2026-11-03",ret:"2026-11-03"}));
  let r=ok(await api("sale","PUT",`/api/orders/${j.id}/lines`,{rev:0,lines:[{k:"a",t:1,pid:1,code:"M18",list:24000,qty:2,days:1}]})).rev;
  r=ok(await api("sale","POST",`/api/orders/${j.id}/move`,{rev:r,to:"Order"})).rev;
  for(const f of ["ship","useStart","useEnd","jobTitle"]) assert.equal((await api("store","PATCH",`/api/orders/${j.id}`,{rev:r,[f]:f==="jobTitle"?"x":"2026-11-03"})).status,403,f);
  assert.equal((await api("crew","PATCH",`/api/orders/${j.id}`,{rev:r,ret:"2026-11-04"})).status,403);
  // legacy 6900001 holds 3 of the 2 M18s on 1–2 Nov: moving this job's ship date onto 2 Nov is saved but reported short
  const s=await api("sale","PATCH",`/api/orders/${j.id}`,{rev:r,ship:"2026-11-02"}); assert.deepEqual(ok(s).short,[{pid:1,short:2}]);
  r=ok(await api("sale","PATCH",`/api/orders/${j.id}`,{rev:s.body.rev,ship:"2026-11-03"})).rev;
  r=ok(await api("store","PATCH",`/api/orders/${j.id}`,{rev:r,ret:"2026-11-05"}),"store extends").rev;
  assert.equal(ok(await api("admin","GET",`/api/orders/${j.id}`)).order.ret,"2026-11-05");
  assert.equal((await api("store","PATCH",`/api/orders/${j.id}`,{rev:r,ret:"2026-11-01"})).body.error,"badDates");
});

test("discounts on Equipment only (Gene, 27 Oct): a discount on any other type is saved as 0; copies drop them too",{skip},async()=>{
  const j=ok(await api("sale","POST","/api/orders",{customerId:"10",jobTitle:"Disc job"}));
  const lines=[{k:"e",t:1,pid:1,code:"M18",list:24000,qty:1,days:1,disc:20},{k:"a",t:2,pid:2,code:"CG",list:150,qty:2,days:1,disc:50},
    {k:"g",t:4,pid:3,code:"GEN",list:9000,qty:1,days:1,disc:10},{k:"c",t:5,code:"G01",list:3000,qty:1,days:1,disc:30}];
  ok(await api("sale","PUT",`/api/orders/${j.id}/lines`,{rev:0,lines}));
  const d=ok(await api("sale","GET",`/api/orders/${j.id}`));
  assert.deepEqual(d.lines.map(l=>[l.k,l.disc]),[["e",20],["a",0],["g",0],["c",0]]);
  assert.equal(d.order.totals.sub,L.r2(24000*0.8+300+9000+3000));
  // the extra discount % also comes off Equipment only (Gene, 27 Oct): 10% of 19,200, not of the whole 31,500
  const e=ok(await api("sale","PATCH",`/api/orders/${j.id}`,{rev:1,extraDisc:10}));
  const T=ok(await api("sale","GET",`/api/orders/${j.id}`)).order.totals; assert.equal(T.extra,1920); assert.equal(T.total,L.r2((31500-1920)*1.07));
  const cp=ok(await api("sale","POST","/api/orders/6900002/copy",{})); // legacy job: its lines carry no discount, nothing to drop
  assert.ok(ok(await api("sale","GET",`/api/orders/${cp.id}`)).lines.every(l=>l.t===1||!l.disc));
});

test("header vs money permissions follow the artifact: accounting edits fees, not job details",{skip},async()=>{
  const j=ok(await api("sale","POST","/api/orders",{customerId:"10",jobTitle:"Money job"}));
  ok(await api("sale","PUT",`/api/orders/${j.id}/lines`,{rev:0,lines:[{k:"a",t:2,pid:2,list:150,qty:4,days:1}]}));
  assert.equal((await api("accounting","PATCH",`/api/orders/${j.id}`,{rev:1,jobTitle:"renamed"})).status,403);
  ok(await api("accounting","PATCH",`/api/orders/${j.id}`,{rev:1,insurance:500,extraDisc:150}));
  const o=ok(await api("admin","GET",`/api/orders/${j.id}`)).order;
  assert.equal(o.extra_disc,100,"extra discount clamps to 100% as on the artifact"); assert.equal(o.totals.ins,500);
  // v2 job: the extra discount only comes off Equipment (Gene, 27 Oct), and this job has none, so nothing comes off
  assert.deepEqual(o.totals,orderTotalsV2([{t:2,list:150,qty:4,days:1}],{extraDisc:100,insurance:500,tax:"Vat",owner:"v2"})); assert.equal(o.totals.extra,0);
  assert.equal((await api("crew","PATCH",`/api/orders/${j.id}`,{rev:2,note:"x"})).status,403);
  assert.equal((await api("sale","PATCH",`/api/orders/${j.id}`,{rev:2,totals:{}})).body.error,"unknown_fields");
});

test("special prices (Gene, 23 Oct): sales may set them, but the CEO must confirm before Shipped",{skip},async()=>{
  // Fixture catalog: M18 (1) ฿24,000, discountable, no cap, stock 2 · CG (2) ฿150, not discountable · GEN (3) ฿9,000, max 20%, stock 1.
  const j=ok(await api("sale","POST","/api/orders",{customerId:"10",jobTitle:"Special price job",ship:"2026-12-20",ret:"2026-12-21"}));
  // Discounts are on Equipment lines only (Gene, 27 Oct), so the discount cases use type 1.
  const lines=[{k:"a",t:1,pid:1,code:"M18",list:20000,qty:1,days:1},{k:"b",t:1,pid:2,code:"CG",list:150,qty:4,days:1,disc:5},
    {k:"c",t:1,pid:3,code:"GEN",list:9000,qty:1,days:1,disc:25},{k:"p",t:1,pid:2,code:"CG",list:0,qty:4,days:1,parent:"c"},
    {k:"f",t:2,pid:2,code:"CG",list:150,qty:1,days:1,foc:true},{k:"g",t:5,code:"G01",list:1,qty:1,days:1,crewId:"500"}];
  let s=ok(await api("sale","PUT",`/api/orders/${j.id}/lines`,{rev:0,lines}),"sale saves special prices");
  assert.deepEqual(s.needsCeo.map(b=>[b.k,b.rule,b.value,b.limit]),[["a","below_catalog",20000,24000],["b","no_discount",5,0],["c","over_max_disc",25,20]]);
  let r=s.rev;
  r=ok(await api("sale","POST",`/api/orders/${j.id}/move`,{rev:r,to:"Order"})).rev;
  r=ok(await api("sale","POST",`/api/orders/${j.id}/move`,{rev:r,to:"Approve"})).rev;
  r=ok(await api("store","POST",`/api/orders/${j.id}/checkout`,{rev:r,all:true})).rev;
  let x=await api("store","POST",`/api/orders/${j.id}/move`,{rev:r,to:"Shipped"});
  assert.equal(x.status,422); assert.equal(x.body.error,"rPriceApproval"); assert.equal(x.body.breaks.length,3);
  for(const who of ["sale","store","accounting","crew"]) assert.equal((await api(who,"POST",`/api/orders/${j.id}/approve-prices`,{rev:r})).status,403,who);
  assert.equal(ok(await api("store","GET",`/api/orders/${j.id}`)).needsCeo.length,3);
  r=ok(await api("admin","POST",`/api/orders/${j.id}/approve-prices`,{rev:r}),"CEO confirms").rev;
  const d=ok(await api("store","GET",`/api/orders/${j.id}`)); assert.deepEqual(d.needsCeo,[]);
  assert.equal(d.order.price_approval.by_name,"Test admin");
  const act=d.activity.at(-1); assert.deepEqual([act.action,act.actor_name,act.detail.breaks.length],["prices_approved","Test admin",3]);
  assert.equal((await api("admin","POST",`/api/orders/${j.id}/approve-prices`,{rev:r})).body.error,"nothing_to_approve");
  // Admin edits at Approve: an untouched approved line stays approved; changing an approved price needs the CEO again.
  r=ok(await api("admin","PUT",`/api/orders/${j.id}/lines`,{rev:r,lines:lines.map(l=>l.k==="g"?{...l,qty:2}:l)})).rev;
  assert.deepEqual(ok(await api("store","GET",`/api/orders/${j.id}`)).needsCeo,[]);
  s=ok(await api("admin","PUT",`/api/orders/${j.id}/lines`,{rev:r,lines:lines.map(l=>l.k==="a"?{...l,list:18000}:l)})); r=s.rev;
  assert.deepEqual(s.needsCeo.map(b=>[b.k,b.value]),[["a",18000]]);
  assert.equal((await api("store","POST",`/api/orders/${j.id}/move`,{rev:r,to:"Shipped"})).body.error,"rPriceApproval");
  r=ok(await api("admin","POST",`/api/orders/${j.id}/approve-prices`,{rev:r})).rev;
  assert.equal(ok(await api("store","POST",`/api/orders/${j.id}/move`,{rev:r,to:"Shipped"}),"ships after CEO").status,"Shipped");
  assert.equal((await api("admin","POST",`/api/orders/${j.id}/approve-prices`,{rev:r+1})).body.error,"wrong_status");
});

test("jobs at catalog prices ship without the CEO",{skip},async()=>{
  const j=ok(await api("sale","POST","/api/orders",{customerId:"10",jobTitle:"Catalog price job",ship:"2026-12-24",ret:"2026-12-25"}));
  let r=ok(await api("sale","PUT",`/api/orders/${j.id}/lines`,{rev:0,lines:[{k:"a",t:1,pid:1,code:"M18",list:24000,qty:1,days:1,disc:70},{k:"c",t:4,pid:3,code:"GEN",list:9500,qty:1,days:1,disc:20}]})).rev;
  for(const to of ["Order","Approve"]) r=ok(await api("sale","POST",`/api/orders/${j.id}/move`,{rev:r,to})).rev;
  r=ok(await api("store","POST",`/api/orders/${j.id}/checkout`,{rev:r,all:true})).rev;
  ok(await api("store","POST",`/api/orders/${j.id}/move`,{rev:r,to:"Shipped"}),"ships");
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

test("crew picker: rates by position, repeated positions flagged, department filter, never the cost",{skip},async()=>{
  const all=ok(await api("sale","GET","/api/crew?q=Test")).crew;
  assert.deepEqual(all.map(r=>[r.positionId,r.rateNo,r.price,r.priceOt,r.needsReview]).sort(),[[7,1,3000,400,false],[8,1,2500,300,true],[8,2,1,1,true]]);
  for(const r of all) for(const k of Object.keys(r)) assert.ok(!/cost/i.test(k),`crew lookup leaked ${k}`);
  assert.equal(all.find(r=>r.positionId===7).posName,"Gaffer");
  assert.deepEqual(ok(await api("sale","GET","/api/crew?q=Test&dept=2")).crew.map(r=>r.positionId),[8,8]);
});

test("copy: any job (legacy too) becomes a new v2 quote with counts reset; sale/admin only",{skip},async()=>{
  const r0=await rev("6900001");
  assert.equal((await api("store","POST","/api/orders/6900001/copy",{})).status,403);
  const c=ok(await api("sale","POST","/api/orders/6900001/copy",{}),"copy legacy");
  const d=ok(await api("sale","GET",`/api/orders/${c.id}`));
  assert.deepEqual([d.order.owner,d.order.status,d.order.rev,d.order.customer_name,d.order.extra_disc],["v2","Quote",0,"Synthetic Films",5]);
  assert.equal(d.lines.length,2); for(const l of d.lines) assert.deepEqual([l.out,l.in,l.dmg,l.lost,l.repaired],[0,0,0,0,false]);
  assert.equal(d.order.totals.total,orderTotalsV2(d.lines,{extraDisc:5,tax:"Vat",owner:"v2"}).total,"the copy is a v2 job, so v2 totals");
  assert.equal(d.activity[0].detail.copiedFrom,"6900001");
  assert.equal(await rev("6900001"),r0,"copying must not touch the legacy job");
});

test("repairs: damaged items at check-in become tickets once; store/admin manage them",{skip},async()=>{
  const j=ok(await api("sale","POST","/api/orders",{customerId:"10",jobTitle:"Repair job",ship:"2026-12-27",ret:"2026-12-28"}));
  let r=ok(await api("sale","PUT",`/api/orders/${j.id}/lines`,{rev:0,lines:[{k:"a",t:1,pid:1,code:"M18",desc:"HMI",list:24000,qty:1,days:1}]})).rev;
  for(const to of ["Order","Approve"]) r=ok(await api("sale","POST",`/api/orders/${j.id}/move`,{rev:r,to})).rev;
  r=ok(await api("store","POST",`/api/orders/${j.id}/checkout`,{rev:r,all:true})).rev;
  assert.equal((await api("store","POST",`/api/orders/${j.id}/repairs`,{rev:r})).body.error,"wrong_status");
  r=ok(await api("store","POST",`/api/orders/${j.id}/move`,{rev:r,to:"Shipped"})).rev;
  assert.equal((await api("store","POST",`/api/orders/${j.id}/repairs`,{rev:r})).body.error,"nothing_to_repair");
  r=ok(await api("store","POST",`/api/orders/${j.id}/checkin`,{rev:r,lines:[{k:"a",in:1,dmg:1}]})).rev;
  assert.equal((await api("sale","POST",`/api/orders/${j.id}/repairs`,{rev:r})).status,403);
  const sent=ok(await api("store","POST",`/api/orders/${j.id}/repairs`,{rev:r}),"send to repair"); r=sent.rev; assert.equal(sent.tickets,1);
  assert.equal((await api("store","POST",`/api/orders/${j.id}/repairs`,{rev:r})).body.error,"nothing_to_repair","each damaged line is sent once");
  const d=ok(await api("store","GET",`/api/orders/${j.id}`)); assert.equal(d.lines[0].repaired,true); assert.equal(d.activity.at(-1).action,"repair_sent");
  const t=ok(await api("crew","GET","/api/repairs?status=wait")).repairs.find(x=>x.orderId===j.id);
  assert.deepEqual([t.code,t.qty,t.status,t.orderNo],["M18",1,"wait",j.no]);
  assert.equal((await api("sale","PATCH",`/api/repairs/${t.id}`,{status:"doing"})).status,403);
  assert.equal((await api("store","PATCH",`/api/repairs/${t.id}`,{status:"broken"})).body.error,"bad_status");
  ok(await api("store","PATCH",`/api/repairs/${t.id}`,{status:"doing",note:"Lamp cracked"}));
  const after=ok(await api("store","GET","/api/repairs")).repairs.find(x=>x.id===t.id); assert.deepEqual([after.status,after.note],["doing","Lamp cracked"]);
});
