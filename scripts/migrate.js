// Applies supabase/migrations/*.sql in name order to DATABASE_URL, each once, each in its own transaction.
// On plain Postgres it first applies supabase/local-shim.sql (roles, auth.uid(), default grants) to a database that
// lacks auth.uid(); on Supabase that already exists.
// On Supabase itself prefer `supabase db push`; this runner is for local dev and tests.
//   node scripts/migrate.js            (uses DATABASE_URL from env or .env.local)
const fs=require("fs"), path=require("path"); const {Client}=require("pg");
require("./env");

async function migrate(connectionString,{log=console.log}={}){
  const c=new Client({connectionString}); await c.connect();
  try{
    const hasAuth=(await c.query("select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='auth' and p.proname='uid'")).rowCount>0;
    if(!hasAuth){ await c.query(fs.readFileSync(path.join(__dirname,"../supabase/local-shim.sql"),"utf8")); log("applied local-shim.sql"); }
    await c.query("create schema if not exists _migrations; create table if not exists _migrations.applied(name text primary key, at timestamptz not null default now())");
    const done=new Set((await c.query("select name from _migrations.applied")).rows.map(r=>r.name));
    const dir=path.join(__dirname,"../supabase/migrations");
    for(const f of fs.readdirSync(dir).filter(f=>f.endsWith(".sql")).sort()){
      if(done.has(f)) continue;
      await c.query("begin");
      try{ await c.query(fs.readFileSync(path.join(dir,f),"utf8")); await c.query("insert into _migrations.applied(name) values ($1)",[f]); await c.query("commit"); log("applied "+f); }
      catch(e){ await c.query("rollback"); throw new Error(`${f}: ${e.message}`); }
    }
  } finally { await c.end(); }
}
module.exports={migrate};
if(require.main===module){
  if(!process.env.DATABASE_URL){ console.error("DATABASE_URL not set (run `node scripts/db.js start` first)"); process.exit(1); }
  migrate(process.env.DATABASE_URL).catch(e=>{ console.error(e.message); process.exit(1); });
}
