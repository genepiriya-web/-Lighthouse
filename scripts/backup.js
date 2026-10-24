// Encrypted logical backups of the v2 database (flaw 3, layer 2 — in addition to Supabase's own backups).
//
// A backup holds every public table's rows (as JSON), the list of migrations it was taken at, the product-id sequence,
// and a fingerprint per table. It is gzipped and encrypted with AES-256-GCM under BACKUP_KEY, a key kept apart from the
// database. Crew national IDs stay encrypted inside it under CREW_ID_KEY as well.
// Restore = run the same migrations on an empty database, load the rows in dependency order, reset sequences, then
// compare every table's fingerprint with the one recorded at backup time.
//
//   node scripts/backup.js create [--out data/backups]          (DATABASE_URL)
//   node scripts/backup.js verify <file>                        restore into a throwaway database, compare, drop it
//   node scripts/backup.js restore <file> --url <empty-db-url>  restore for real (refuses a database that has data)
const fs=require("fs"), path=require("path"), zlib=require("zlib"), crypto=require("crypto"); const {Client}=require("pg");
require("./env"); const {migrate}=require("./migrate");

// Load order respects foreign keys. Every public table must be listed: create() refuses to run if one is missing.
const TABLES=["staff","positions","products","kit_parts","customers","customer_tax_ids","crew","crew_rates","crew_rate_costs","settings",
  "order_counters","orders","order_lines","repairs","activity","import_runs","crew_national_ids","crew_id_links","staff_invites"];
const MAGIC="LHDBK1";

function backupKey(){ const k=Buffer.from(process.env.BACKUP_KEY??"","base64"); if(k.length!==32) throw new Error("BACKUP_KEY must be 32 bytes, base64 (separate from CREW_ID_KEY)"); return k; }
const keyId=k=>crypto.createHash("sha256").update(k).digest("hex").slice(0,12); // tells you which key a file needs, reveals nothing

async function fingerprint(c,t){ return (await c.query(`select count(*)::int n, md5(coalesce(string_agg(to_jsonb(r)::text, '|' order by to_jsonb(r)::text), '')) h from ${t} r`)).rows[0]; }

async function tablesInDb(c){ return (await c.query("select tablename from pg_tables where schemaname='public' order by 1")).rows.map(r=>r.tablename); }

async function create(url,outDir){
  const k=backupKey(); const c=new Client({connectionString:url}); await c.connect();
  try{
    await c.query("begin isolation level repeatable read read only"); // one consistent snapshot
    const missing=(await tablesInDb(c)).filter(t=>!TABLES.includes(t));
    if(missing.length) throw new Error(`tables not covered by the backup list: ${missing.join(", ")} — add them to TABLES in load order`);
    const migrations=(await c.query("select name from _migrations.applied order by name")).rows.map(r=>r.name);
    const seq=(await c.query("select last_value, is_called from product_v2_id")).rows[0];
    const tables={}, prints={};
    for(const t of TABLES){ tables[t]=(await c.query(`select to_jsonb(r) j from ${t} r`)).rows.map(r=>r.j); prints[t]=await fingerprint(c,t); }
    await c.query("commit");
    const createdAt=new Date().toISOString();
    const body=zlib.gzipSync(Buffer.from(JSON.stringify({format:MAGIC,createdAt,migrations,sequences:{product_v2_id:seq},tables,prints})));
    const iv=crypto.randomBytes(12); const ci=crypto.createCipheriv("aes-256-gcm",k,iv); const ct=Buffer.concat([ci.update(body),ci.final()]);
    const header=JSON.stringify({format:MAGIC,createdAt,keyId:keyId(k),migrations:migrations.length,rows:Object.fromEntries(Object.entries(prints).map(([t,p])=>[t,p.n]))});
    fs.mkdirSync(outDir,{recursive:true});
    const file=path.join(outDir,`lighthouse-${createdAt.replace(/[:.]/g,"-")}.lhdbk`);
    fs.writeFileSync(file,Buffer.concat([Buffer.from(header+"\n"),iv,ci.getAuthTag(),ct]),{mode:0o600});
    return {file,createdAt,rows:Object.fromEntries(Object.entries(prints).map(([t,p])=>[t,p.n]))};
  } catch(e){ await c.query("rollback").catch(()=>{}); throw e; } finally { await c.end(); }
}

function open(file){
  const buf=fs.readFileSync(file); const nl=buf.indexOf(10); if(nl<0) throw new Error("not a Lighthouse backup");
  const header=JSON.parse(buf.subarray(0,nl).toString()); if(header.format!==MAGIC) throw new Error("not a Lighthouse backup");
  const k=backupKey(); if(header.keyId!==keyId(k)) throw new Error(`this backup was made with a different BACKUP_KEY (key id ${header.keyId})`);
  const iv=buf.subarray(nl+1,nl+13), tag=buf.subarray(nl+13,nl+29), ct=buf.subarray(nl+29);
  const d=crypto.createDecipheriv("aes-256-gcm",k,iv); d.setAuthTag(tag);
  let plain; try{ plain=Buffer.concat([d.update(ct),d.final()]); }catch{ throw new Error("backup file is damaged or was changed (integrity check failed)"); }
  return JSON.parse(zlib.gunzipSync(plain).toString());
}

async function restore(file,url){
  const B=open(file);
  const available=fs.readdirSync(path.join(__dirname,"../supabase/migrations")).filter(f=>f.endsWith(".sql")).sort();
  const unknown=B.migrations.filter(m=>!available.includes(m)); if(unknown.length) throw new Error(`backup needs migrations this code doesn't have: ${unknown.join(", ")}`);
  const c=new Client({connectionString:url}); await c.connect();
  try{
    const has=(await c.query("select to_regclass('public.orders') is not null x")).rows[0].x;
    if(has&&(await c.query("select (select count(*) from orders)+(select count(*) from products) n")).rows[0].n>0) throw new Error("target database already has data — restore only into an empty database");
  } finally { await c.end(); }
  await migrate(url,{log:()=>{},only:B.migrations});
  const t=new Client({connectionString:url}); await t.connect();
  try{
    await t.query("begin");
    await t.query("set local app.importer = 'on'"); // legacy jobs may be written back by their owner, as by the importer
    for(const name of TABLES){ const rows=B.tables[name]||[];
      for(let i=0;i<rows.length;i+=2000) await t.query(`insert into ${name} overriding system value select * from jsonb_populate_recordset(null::${name}, $1::jsonb)`,[JSON.stringify(rows.slice(i,i+2000))]); }
    for(const [tab,col] of [["activity","id"],["import_runs","id"]])
      await t.query(`select setval(pg_get_serial_sequence('${tab}','${col}'), greatest((select coalesce(max(${col}),0) from ${tab}),1), (select count(*)>0 from ${tab}))`);
    const s=B.sequences.product_v2_id; await t.query("select setval('product_v2_id',$1,$2)",[s.last_value,s.is_called]);
    await t.query("commit");
    const report={}; let ok=true;
    for(const name of TABLES){ const p=await fingerprint(t,name); const same=p.n===B.prints[name].n&&p.h===B.prints[name].h; if(!same) ok=false; report[name]={rows:p.n,match:same}; }
    return {ok,createdAt:B.createdAt,report};
  } catch(e){ await t.query("rollback").catch(()=>{}); throw e; } finally { await t.end(); }
}

/** Restore into a throwaway database on the same server, compare every table, drop it. */
async function verify(file,adminUrl){
  const name="lhd_verify_"+crypto.randomBytes(4).toString("hex"); const u=new URL(adminUrl); u.pathname="/"+name;
  const a=new Client({connectionString:adminUrl}); await a.connect(); await a.query(`create database ${name}`);
  try{ return await restore(file,u.toString()); } finally { await a.query(`drop database if exists ${name} with (force)`); await a.end(); }
}

module.exports={create,open,restore,verify,TABLES};

if(require.main===module){
  const [cmd,arg]=process.argv.slice(2); const flag=k=>{ const i=process.argv.indexOf(k); return i>0?process.argv[i+1]:undefined; };
  const run=async()=>{
    if(cmd==="create"){ const r=await create(process.env.DATABASE_URL,flag("--out")||path.join(__dirname,"../data/backups")); console.log(`backup written: ${r.file}`); console.log(JSON.stringify(r.rows)); }
    else if(cmd==="verify"){ const r=await verify(arg,process.env.DATABASE_ADMIN_URL); console.log(JSON.stringify(r,null,1)); if(!r.ok) process.exit(2); }
    else if(cmd==="restore"){ const url=flag("--url"); if(!url) throw new Error("--url <empty database> is required"); const r=await restore(arg,url); console.log(JSON.stringify(r,null,1)); if(!r.ok) process.exit(2); }
    else { console.error("usage: node scripts/backup.js create [--out dir] | verify <file> | restore <file> --url <empty-db-url>"); process.exit(1); }
  };
  run().catch(e=>{ console.error(e.message); process.exit(1); });
}
