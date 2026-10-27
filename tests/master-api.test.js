// M4 slice 3: catalog, customers, crew rates, team and settings — who may change what (as on the artifact), version
// checks, duplicate codes, privacy (tax IDs, crew costs), and that the importer never overwrites edits made in v2.
const test=require("node:test"); const assert=require("node:assert/strict");
const {startTestServer,skipReason}=require("./helpers/server"); const {importExport}=require("../scripts/import"); const {syntheticId}=require("./helpers/fixture");
const skip=skipReason(); let S;
test.before(async()=>{ if(!skip) S=await startTestServer(3923); });
test.after(async()=>{ if(S) await S.stop(); });
const ok=(r,what)=>{ assert.ok(r.status>=200&&r.status<300,`${what}: ${r.status} ${JSON.stringify(r.body)}`); return r.body; };
const lastActivity=async(entity,id)=>(await S.db.query("select * from activity where entity=$1 and entity_id=$2 order by id desc limit 1",[entity,String(id)])).rows[0];

test("catalog: admin/store add and edit; codes stay unique; packages checked",{skip},async()=>{
  const item={code:"LED-X",desc:"Synthetic LED panel",type:1,dept:1,price:1500,discountable:true,maxDisc:30,stock:4};
  assert.equal((await S.api("sale","POST","/api/catalog",item)).status,403);
  assert.equal((await S.api("crew","POST","/api/catalog",item)).status,403);
  assert.equal((await S.api("store","POST","/api/catalog",{...item,code:"cg"})).body.error,"code_taken","codes are unique, ignoring case");
  assert.equal((await S.api("store","POST","/api/catalog",{...item,type:5})).body.error,"bad_type");
  const {id}=ok(await S.api("store","POST","/api/catalog",{...item,kit:[[2,2,0]]}),"store adds"); assert.ok(id>=1000000);
  let p=ok(await S.api("sale","GET",`/api/catalog/${id}`)); assert.deepEqual([p.source,p.price,p.kit.map(k=>[k.id,k.ratio])],["v2",1500,[[2,2]]]);
  assert.equal((await S.api("admin","PATCH",`/api/catalog/${id}`,{updatedAt:p.updatedAt,kit:[[id,1,0]]})).body.error,"bad_kit");
  assert.equal((await S.api("admin","PATCH",`/api/catalog/${id}`,{updatedAt:p.updatedAt,kit:[[999999,1,0]]})).body.error,"bad_kit");
  ok(await S.api("admin","PATCH",`/api/catalog/${id}`,{updatedAt:p.updatedAt,price:1600,kit:[[2,2,0],[4,1,0]]}),"admin edits");
  const stale=await S.api("store","PATCH",`/api/catalog/${id}`,{updatedAt:p.updatedAt,stock:5}); assert.equal(stale.status,409); assert.equal(stale.body.error,"stale");
  p=ok(await S.api("store","GET",`/api/catalog/${id}`)); assert.equal(p.kit.length,2);
  const a=await lastActivity("product",id); assert.equal(a.actor_name,"Test admin"); assert.deepEqual(a.detail.changed.price,[1500,1600]); assert.ok(a.detail.kit);
});

test("catalog: editing an old-system item makes v2 its owner, so the importer leaves it alone",{skip},async()=>{
  const p=ok(await S.api("store","GET","/api/catalog/1"));
  assert.equal(p.source,"legacy");
  ok(await S.api("store","PATCH","/api/catalog/1",{updatedAt:p.updatedAt,stock:5}),"store updates stock");
  assert.equal((await lastActivity("product",1)).detail.tookOverFromLegacy,true);
  await importExport(S.db,S.fixture);
  const after=ok(await S.api("store","GET","/api/catalog/1")); assert.deepEqual([after.source,after.stock],["v2",5]);
});

test("customers: admin/sale add and edit; tax IDs validated, hidden from store/crew, never written to the log",{skip},async()=>{
  const tax=syntheticId(42);
  assert.equal((await S.api("store","POST","/api/customers",{name:"X"})).status,403);
  assert.equal((await S.api("sale","POST","/api/customers",{name:"Bad Tax Co",taxId:"123"})).body.error,"bad_tax_id");
  assert.equal((await S.api("sale","POST","/api/customers",{name:"Dup",code:"c10"})).body.error,"code_taken");
  const {id}=ok(await S.api("sale","POST","/api/customers",{name:"New Synthetic Studio",code:"C99",jobType:"FILM",defaultDisc:10,taxId:tax}),"sale adds");
  assert.equal(ok(await S.api("accounting","GET",`/api/customers/${id}`)).taxId,tax);
  for(const who of ["store","crew"]) assert.ok(!("taxId" in ok(await S.api(who,"GET",`/api/customers/${id}`))),`${who} saw a tax ID`);
  const logged=JSON.stringify((await S.db.query("select detail from activity where entity='customer'")).rows); assert.ok(!logged.includes(tax),"tax ID written to the activity log");
  const c=ok(await S.api("sale","GET",`/api/customers/${id}`));
  assert.equal((await S.api("accounting","PATCH",`/api/customers/${id}`,{updatedAt:c.updatedAt,name:"x"})).status,403,"accounting can't edit customers (artifact)");
  ok(await S.api("sale","PATCH",`/api/customers/${id}`,{updatedAt:c.updatedAt,taxId:""}),"remove tax ID");
  assert.equal(ok(await S.api("admin","GET",`/api/customers/${id}`)).taxId,null);
  assert.equal((await lastActivity("customer",id)).detail.taxId,"removed");
});

test("customers: flagged-new review — list them first, mark checked, still importable; edits survive re-import",{skip},async()=>{
  const flagged=ok(await S.api("sale","GET","/api/customers?flagged=1")).customers; assert.deepEqual(flagged.map(c=>c.id),["404"]);
  const c=ok(await S.api("sale","GET","/api/customers/404")); assert.match(c.flagNote,/6900002/); assert.equal(c.jobs[0].no,"6900002");
  assert.equal((await S.api("sale","PATCH","/api/customers/404",{updatedAt:c.updatedAt,flaggedNew:true})).body.error,"bad_flag");
  ok(await S.api("sale","PATCH","/api/customers/404",{updatedAt:c.updatedAt,flaggedNew:false}),"mark checked");
  const after=ok(await S.api("sale","GET","/api/customers/404")); assert.deepEqual([after.flaggedNew,after.source],[false,"legacy"],"checking only clears the flag");
  assert.equal((await lastActivity("customer","404")).action,"checked");
  // An old-system customer edited in v2 keeps its v2 name and tax ID through a re-import.
  const c10=ok(await S.api("admin","GET","/api/customers/10")); const tax=syntheticId(7);
  ok(await S.api("sale","PATCH","/api/customers/10",{updatedAt:c10.updatedAt,name:"Synthetic Films (renamed)",taxId:tax}));
  await importExport(S.db,S.fixture);
  const c10b=ok(await S.api("admin","GET","/api/customers/10")); assert.deepEqual([c10b.name,c10b.taxId,c10b.source],["Synthetic Films (renamed)",tax,"v2"]);
});

test("crew rates: view only; cost shown to admin and crew manager only (Gene, Q15)",{skip},async()=>{
  for(const who of ["admin","crew"]){ const r=ok(await S.api(who,"GET","/api/crew-rates?q=Test")).rates; assert.equal(r.length,3); assert.ok(r.every(x=>"cost" in x),who); }
  for(const who of ["sale","store","accounting"]){ const r=ok(await S.api(who,"GET","/api/crew-rates?q=Test")).rates; assert.ok(r.every(x=>Object.keys(x).every(k=>!/cost/i.test(k))),who); }
  const r=ok(await S.api("crew","GET","/api/crew-rates?q=Test")).rates; assert.deepEqual(r.filter(x=>x.needsReview).map(x=>x.rateNo),[1,2],"repeated rates listed first, flagged");
});

test("team: admin changes roles or switches people off — never themself; the change takes effect at once",{skip},async()=>{
  assert.equal((await S.api("sale","GET","/api/staff")).status,403);
  const staff=ok(await S.api("admin","GET","/api/staff")).staff; assert.equal(staff.length,5);
  assert.equal((await S.api("admin","PATCH",`/api/staff/${S.uid.admin}`,{role:"sale"})).body.error,"not_yourself");
  assert.equal((await S.api("admin","PATCH",`/api/staff/${S.uid.store}`,{role:"boss"})).body.error,"bad_role");
  assert.equal((await S.api("sale","PATCH",`/api/staff/${S.uid.store}`,{role:"admin"})).status,403);
  ok(await S.api("admin","PATCH",`/api/staff/${S.uid.crew}`,{active:false}),"switch off");
  assert.equal((await S.api("crew","GET","/api/orders")).body.error,"not_staff");
  ok(await S.api("admin","PATCH",`/api/staff/${S.uid.crew}`,{active:true}));
  assert.equal(ok(await S.api("crew","GET","/api/me")).role,"crew");
  assert.deepEqual((await lastActivity("staff",S.uid.crew)).detail.changed.active,[false,true]);
});

test("settings: everyone reads; only admin changes company details on documents",{skip},async()=>{
  const s=ok(await S.api("crew","GET","/api/settings")); assert.equal(s.remarks.length,1);
  assert.equal((await S.api("sale","PUT","/api/settings/company",{name:"X"})).status,403);
  assert.equal((await S.api("admin","PUT","/api/settings/company",{name:"Lighthouse",tax:"12"})).body.error,"bad_tax_id");
  const tax=syntheticId(3);
  ok(await S.api("admin","PUT","/api/settings/company",{name:"Lighthouse Film Service (test)",tax,addr:"1 Synthetic Rd"}));
  assert.deepEqual(ok(await S.api("store","GET","/api/settings")).company,{name:"Lighthouse Film Service (test)",tax,addr:"1 Synthetic Rd"});
});

test("item picker: a GRIP&LIGHTING (3) job searches both departments; a LIGHTING/GRIP job its own plus shared items",{skip},async()=>{
  const codes=async q=>ok(await S.api("sale","GET",`/api/products?${q}`)).products.map(p=>p.code);
  assert.ok((await codes("type=1&q=M18&dept=3")).includes("M18"),"dept 3 job finds a LIGHTING item");
  assert.ok((await codes("type=1&q=M18&dept=1")).includes("M18"));
  assert.ok(!(await codes("type=1&q=M18&dept=2")).includes("M18"),"GRIP job doesn't see a LIGHTING-only item");
  assert.ok((await codes("type=1&q=m")).includes("M18"),"one letter is enough, any case");
});
