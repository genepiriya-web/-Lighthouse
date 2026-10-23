// Throwaway database for the browser tests: lhd_e2e, rebuilt from the synthetic fixture each run, dropped afterwards.
//   node e2e/db.js setup | teardown
const fs=require("fs"), os=require("os"), path=require("path"); const {Client}=require("pg");
require("../scripts/env");
const {migrate}=require("../scripts/migrate"); const {importExport}=require("../scripts/import"); const {writeFixture}=require("../tests/helpers/fixture");
const ADMIN=process.env.DATABASE_ADMIN_URL; const NAME="lhd_e2e";
const url=()=>{ const u=new URL(ADMIN); u.pathname="/"+NAME; return u.toString(); };
const STAFF=[["admin","Dev Admin (CEO)"],["sale","Dev Sale"],["store","Dev Store"],["accounting","Dev Accounting"],["crew","Dev Crew manager"]]
  .map(([role,name],i)=>[`00000000-0000-4000-8000-00000000000${i+1}`,name,role]);

async function setup(){
  const a=new Client({connectionString:ADMIN}); await a.connect();
  await a.query(`drop database if exists ${NAME} with (force)`); await a.query(`create database ${NAME}`); await a.end();
  await migrate(url(),{log:()=>{}});
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"lhd-e2e-")); writeFixture(dir);
  const c=new Client({connectionString:url()}); await c.connect(); await importExport(c,dir);
  for(const s of STAFF) await c.query("insert into staff(user_id,display_name,role) values ($1,$2,$3)",s);
  await c.end(); fs.rmSync(dir,{recursive:true,force:true});
}
async function teardown(){ const a=new Client({connectionString:ADMIN}); await a.connect(); await a.query(`drop database if exists ${NAME} with (force)`); await a.end(); }
module.exports={url,NAME,STAFF};
if(require.main===module){ if(!ADMIN){ console.error("no DATABASE_ADMIN_URL — run `npm run db:start`"); process.exit(1); }
  (process.argv[2]==="teardown"?teardown():setup()).then(()=>console.log(`e2e database ${process.argv[2]||"setup"} done`)).catch(e=>{ console.error(e.message); process.exit(1); }); }
