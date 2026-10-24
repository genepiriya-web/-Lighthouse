// Backups (flaw 3): encrypted logical backup → restore into an empty database → every table identical, and the restored
// database keeps working (sequences, guards). Synthetic data only; throwaway databases.
const test=require("node:test"); const assert=require("node:assert/strict");
const fs=require("fs"), os=require("os"), path=require("path"), crypto=require("crypto"); const {Client}=require("pg");
require("../scripts/env");
process.env.BACKUP_KEY=crypto.randomBytes(32).toString("base64"); // throwaway key for this run
const {migrate}=require("../scripts/migrate"); const {importExport}=require("../scripts/import"); const {writeFixture}=require("./helpers/fixture");
const B=require("../scripts/backup");
const ADMIN=process.env.DATABASE_ADMIN_URL; const skip=ADMIN?false:"no DATABASE_ADMIN_URL — run `npm run db:start`";
const made=[]; const dir=fs.mkdtempSync(path.join(os.tmpdir(),"lhd-bk-"));
const url=n=>{ const u=new URL(ADMIN); u.pathname="/"+n; return u.toString(); };
async function newDb(){ const n="lhd_bk_"+crypto.randomBytes(4).toString("hex"); const a=new Client({connectionString:ADMIN}); await a.connect(); await a.query(`create database ${n}`); await a.end(); made.push(n); return url(n); }
async function q(u,sql,args){ const c=new Client({connectionString:u}); await c.connect(); try{ return (await c.query(sql,args)).rows; } finally { await c.end(); } }
let SRC, FILE;
test.before(async()=>{ if(skip) return;
  SRC=await newDb(); await migrate(SRC,{log:()=>{}}); const fx=path.join(dir,"fx"); writeFixture(fx);
  const c=new Client({connectionString:SRC}); await c.connect(); await importExport(c,fx);
  await c.query("insert into staff(user_id,display_name,role) values ($1,'Bk admin','admin')",[crypto.randomUUID()]);
  await c.query("begin"); await c.query("set local role service_role");
  await c.query("insert into orders(id,no,owner,status,customer_name) values ('6909001','6909001','v2','Quote','Synthetic Films')");
  await c.query("insert into activity(entity,entity_id,action) values ('order','6909001','created')");
  await c.query("select nextval('product_v2_id')"); await c.query("commit");
  await c.query("insert into crew_national_ids(crew_id,cipher,last3) values ('500','v1:AAAA:BBBB:CCCC','123')");
  await c.end();
});
test.after(async()=>{ if(skip) return; const a=new Client({connectionString:ADMIN}); await a.connect(); for(const n of made) await a.query(`drop database if exists ${n} with (force)`); await a.end(); fs.rmSync(dir,{recursive:true,force:true}); });

test("backup is encrypted: no readable personal data in the file, only counts in the header",{skip},async()=>{
  const r=await B.create(SRC,dir); FILE=r.file;
  const raw=fs.readFileSync(FILE); assert.ok(!raw.includes("Synthetic Films")&&!raw.includes("v1:AAAA"),"plain data in the backup file");
  const header=JSON.parse(raw.subarray(0,raw.indexOf(10)).toString()); assert.deepEqual(Object.keys(header).sort(),["createdAt","format","keyId","migrations","rows"]);
  assert.equal(header.rows.orders,3); assert.equal((fs.statSync(FILE).mode&0o777).toString(8),"600");
});

test("restore into an empty database gives identical tables, and the database keeps working",{skip},async()=>{
  const DST=await newDb(); const r=await B.restore(FILE,DST);
  assert.equal(r.ok,true,JSON.stringify(r.report)); for(const t of B.TABLES) assert.equal(r.report[t].match,true,t);
  const maxId=(await q(DST,"select max(id)::int m from activity"))[0].m;
  const next=await q(DST,"begin; set local role service_role; insert into activity(entity,action) values ('order','after_restore') returning id; commit;").catch(e=>e);
  const ids=(await q(DST,"select id from activity where action='after_restore'")); assert.equal(ids.length,1); assert.ok(ids[0].id>maxId,"activity ids continue after restore");
  const srcNext=(await q(SRC,"select last_value::int v from product_v2_id"))[0].v; const dstNext=(await q(DST,"select nextval('product_v2_id')::int v"))[0].v; assert.equal(dstNext,srcNext+1);
  assert.match((await q(DST,"select next_order_no() n"))[0].n,/^\d{7}$/);
  await assert.rejects(q(DST,"begin; set local role service_role; update orders set note='x' where owner='legacy';"),/read-only/,"legacy guard survives the restore");
  await assert.rejects(q(DST,"update activity set action='x'"),/append-only/,"append-only log survives the restore");
  void next;
});

test("refusals: wrong key, damaged file, non-empty target, and a table the backup doesn't know about",{skip},async()=>{
  const good=process.env.BACKUP_KEY; process.env.BACKUP_KEY=crypto.randomBytes(32).toString("base64");
  await assert.rejects(B.restore(FILE,await newDb()),/different BACKUP_KEY/); process.env.BACKUP_KEY=good;
  const bad=path.join(dir,"bad.lhdbk"); const buf=Buffer.from(fs.readFileSync(FILE)); buf[buf.length-10]^=0xff; fs.writeFileSync(bad,buf);
  await assert.rejects(B.restore(bad,await newDb()),/damaged or was changed/);
  await assert.rejects(B.restore(FILE,SRC),/already has data/);
  const X=await newDb(); await migrate(X,{log:()=>{}}); await q(X,"create table stray(id int)");
  await assert.rejects(B.create(X,dir),/not covered by the backup list: stray/);
});

test("verify(): restores into a throwaway database, compares, and drops it",{skip},async()=>{
  const before=(await q(ADMIN,"select count(*)::int n from pg_database where datname like 'lhd_verify_%'"))[0].n;
  const r=await B.verify(FILE,ADMIN); assert.equal(r.ok,true);
  assert.equal((await q(ADMIN,"select count(*)::int n from pg_database where datname like 'lhd_verify_%'"))[0].n,before);
});
