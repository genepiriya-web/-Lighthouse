// Local Postgres 17 for development, from the embedded-postgres npm binaries (no Homebrew/Docker needed).
// Data lives in .pgdata/ (git-ignored). Listens on 127.0.0.1 only. The superuser password is generated once
// and written to .env.local (git-ignored): DATABASE_URL (app database `lighthouse`) and DATABASE_ADMIN_URL (`postgres`,
// used to create/drop databases).
//   node scripts/db.js start | stop | status | url
const fs=require("fs"), path=require("path"), crypto=require("crypto"); const {execFileSync}=require("child_process");
const root=path.join(__dirname,".."); const dataDir=path.join(root,".pgdata"); const envFile=path.join(root,".env.local");
const PORT=Number(process.env.PGPORT_LOCAL||54329);
const bin=name=>path.join(root,"node_modules/@embedded-postgres",`${process.platform}-${process.arch}`,"native/bin",name);
const run=(name,args,opts={})=>execFileSync(bin(name),args,{stdio:"inherit",...opts});

function readEnv(){ if(!fs.existsSync(envFile)) return {}; return Object.fromEntries(fs.readFileSync(envFile,"utf8").split("\n").filter(l=>l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1)])); }
function writeEnv(kv){ const cur={...readEnv(),...kv}; fs.writeFileSync(envFile,Object.entries(cur).map(([k,v])=>`${k}=${v}`).join("\n")+"\n",{mode:0o600}); }

function init(){
  if(fs.existsSync(path.join(dataDir,"PG_VERSION"))) return;
  const pw=crypto.randomBytes(18).toString("base64url"); const pwFile=path.join(root,".pgpass.tmp");
  fs.writeFileSync(pwFile,pw,{mode:0o600});
  try{ run("initdb",["-D",dataDir,"-U","postgres","--auth=scram-sha-256","--pwfile",pwFile,"-E","UTF8","--locale=C"],{stdio:"ignore"}); }
  finally{ fs.rmSync(pwFile,{force:true}); }
  fs.appendFileSync(path.join(dataDir,"postgresql.conf"),`\nlisten_addresses = '127.0.0.1'\nport = ${PORT}\nunix_socket_directories = ''\n`);
  writeEnv({DATABASE_URL:`postgres://postgres:${pw}@127.0.0.1:${PORT}/lighthouse`,DATABASE_ADMIN_URL:`postgres://postgres:${pw}@127.0.0.1:${PORT}/postgres`});
  console.log("initialised .pgdata and wrote DATABASE_URL to .env.local");
}
const status=()=>{ try{ execFileSync(bin("pg_ctl"),["-D",dataDir,"status"],{stdio:"ignore"}); return true; }catch{ return false; } };

const cmd=process.argv[2];
async function ensureDb(){ const {Client}=require("pg"); const c=new Client({connectionString:readEnv().DATABASE_ADMIN_URL}); await c.connect();
  try{ if(!(await c.query("select 1 from pg_database where datname='lighthouse'")).rowCount) { await c.query("create database lighthouse"); console.log("created database lighthouse"); } } finally { await c.end(); } }
if(cmd==="start"){ init(); if(status()) console.log("already running"); else run("pg_ctl",["-D",dataDir,"-l",path.join(dataDir,"server.log"),"-w","start"],{stdio:"ignore"}); console.log(`postgres on 127.0.0.1:${PORT}`); ensureDb().catch(e=>{console.error(e.message);process.exit(1);}); }
else if(cmd==="stop"){ if(status()) run("pg_ctl",["-D",dataDir,"-w","stop"],{stdio:"ignore"}); console.log("stopped"); }
else if(cmd==="status"){ console.log(status()?"running":"stopped"); }
else if(cmd==="url"){ console.log(readEnv().DATABASE_URL||""); }
else { console.error("usage: node scripts/db.js start|stop|status|url"); process.exit(1); }
