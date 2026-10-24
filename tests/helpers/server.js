// Starts the built app on a throwaway database loaded with the synthetic fixture and one staff member per role.
// Returns an `api(role, method, path, body)` helper. Needs `npm run build` and a local Postgres.
const {spawn}=require("node:child_process"); const fs=require("fs"), os=require("os"), path=require("path"), crypto=require("crypto");
const {Client}=require("pg");
require("../../scripts/env");
const {migrate}=require("../../scripts/migrate"); const {importExport}=require("../../scripts/import"); const {writeFixture}=require("./fixture");

const ADMIN=process.env.DATABASE_ADMIN_URL; const root=path.join(__dirname,"../..");
const skipReason=()=>!ADMIN?"no DATABASE_ADMIN_URL — run `npm run db:start`":!fs.existsSync(path.join(root,".next/BUILD_ID"))?"run `npm run build` first":false;
const ROLES=["admin","sale","store","accounting","crew"];

async function startTestServer(port,{env={}}={}){
  const dbName="lhd_t_"+crypto.randomBytes(4).toString("hex"); const u=new URL(ADMIN); u.pathname="/"+dbName; const url=u.toString();
  const admin=new Client({connectionString:ADMIN}); await admin.connect(); await admin.query(`create database ${dbName}`);
  await migrate(url,{log:()=>{}}); const fixture=fs.mkdtempSync(path.join(os.tmpdir(),"lhd-t-")); writeFixture(fixture);
  const db=new Client({connectionString:url}); await db.connect(); await importExport(db,fixture);
  const uid={}; for(const r of ROLES) uid[r]=crypto.randomUUID();
  for(const r of ROLES) await db.query("insert into staff(user_id,display_name,role) values ($1,$2,$3)",[uid[r],"Test "+r,r]);
  const srv=spawn(process.execPath,[require.resolve("next/dist/bin/next"),"start","-p",String(port),"-H","127.0.0.1"],
    {cwd:root,stdio:["ignore","ignore",process.env.DEBUG_API?"inherit":"ignore"],env:{...process.env,DATABASE_URL:url,LHD_AUTH:"dev",LHD_TRIAL_PINS:"",NEXT_TELEMETRY_DISABLED:"1",...env}});
  const base=`http://127.0.0.1:${port}`;
  for(let i=0;;i++){ try{ await fetch(base+"/api/totals",{method:"POST",body:"{}"}); break; }catch{ if(i>100) throw new Error("next start did not come up"); await new Promise(r=>setTimeout(r,150)); } }
  async function api(who,method,p,body){
    const headers={"content-type":"application/json"}; if(who) headers["x-dev-user"]=uid[who]||who;
    const r=await fetch(base+p,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    let json=null; try{ json=await r.json(); }catch{} return {status:r.status,body:json};
  }
  async function stop(){ srv.kill(); await new Promise(r=>setTimeout(r,300)); await db.end(); await admin.query(`drop database if exists ${dbName} with (force)`); await admin.end(); fs.rmSync(fixture,{recursive:true,force:true}); }
  return {api,uid,db,fixture,stop};
}
module.exports={startTestServer,skipReason,ROLES};
