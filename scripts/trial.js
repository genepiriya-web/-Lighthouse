// Staff trial on the office Wi-Fi, from this Mac: `npm run trial`
//   * starts the local database and applies migrations
//   * builds the app if it hasn't been built
//   * keeps one PIN per department in .trial-pins.json (git-ignored, read only by this launcher so tests and `npm run dev`
//     stay unlocked). Each PIN signs in as that department's trial account; tell each team only its own PIN.
//   * serves the app to phones on the same Wi-Fi (test sign-in, PIN-locked) and prints the address to open
//   * keeps the Mac awake while it runs (macOS `caffeinate`); Ctrl+C stops everything
// The old system is never touched: v2 only reads copies of its data.
const fs=require("fs"), os=require("os"), path=require("path"), crypto=require("crypto"); const {spawn,execFileSync}=require("child_process");
const root=path.join(__dirname,".."); const PORT=Number(process.env.TRIAL_PORT||3000);
const pinFile=path.join(root,".trial-pins.json");
const DEPTS=[["sale","ฝ่ายขาย · Sales"],["store","ฝ่ายสโตร์ · Store"],["support","ฝ่าย Support"],["accounting","ฝ่ายบัญชี · Accounting"],["admin","ฝ่ายบริหาร · System admin"]];
const sh=(cmd,args,opts={})=>execFileSync(cmd,args,{cwd:root,stdio:"inherit",...opts});

sh(process.execPath,["scripts/db.js","start"]);
sh(process.execPath,["scripts/migrate.js"]);
require("./env");
sh(process.execPath,["scripts/dev-staff.js"]); // trial accounts, Support included
let pins={}; try{ pins=JSON.parse(fs.readFileSync(pinFile,"utf8")); }catch{ /* first run */ }
const ok=DEPTS.every(([d])=>/^\d{6}$/.test(pins[d]||""))&&new Set(DEPTS.map(([d])=>pins[d])).size===DEPTS.length;
if(!ok){ const used=new Set(); pins={};
  for(const [d] of DEPTS){ let p; do{ p=String(crypto.randomInt(100000,1000000)); }while(used.has(p)); used.add(p); pins[d]=p; }
  fs.writeFileSync(pinFile,JSON.stringify(pins,null,1)+"\n",{mode:0o600}); console.log("made new department PINs and saved them in .trial-pins.json"); }
fs.rmSync(path.join(root,".trial-pin"),{force:true}); // the old single PIN is no longer used
if(!fs.existsSync(path.join(root,".next/BUILD_ID"))){ console.log("building the app (first time only, about a minute)…"); sh("npm",["run","build"],{env:{...process.env,NEXT_TELEMETRY_DISABLED:"1"}}); }

const ips=Object.values(os.networkInterfaces()).flat().filter(i=>i&&i.family==="IPv4"&&!i.internal).map(i=>i.address);
const app=spawn(process.execPath,[require.resolve("next/dist/bin/next"),"start","-H","0.0.0.0","-p",String(PORT)],
  {cwd:root,stdio:["ignore","inherit","inherit"],env:{...process.env,LHD_AUTH:"dev",LHD_TRIAL_PINS:JSON.stringify(pins),NEXT_TELEMETRY_DISABLED:"1"}});
let awake=null; if(process.platform==="darwin") awake=spawn("caffeinate",["-i","-w",String(app.pid)],{stdio:"ignore"});

console.log(`\n  Lighthouse Dispatch — staff trial (ทดลองใช้)\n`);
console.log(`  Open on phones connected to the same Wi-Fi:`);
for(const ip of ips) console.log(`    http://${ip}:${PORT}/dev-login`);
console.log(`  On this Mac: http://localhost:${PORT}/dev-login`);
console.log(`\n  PIN for each department (tell each team only its own; for new PINs delete .trial-pins.json and start again):`);
for(const [d,label] of DEPTS) console.log(`    ${pins[d]}   ${label}`);
console.log(`  If macOS asks whether "node" may accept incoming connections, choose Allow.`);
console.log(`  Ctrl+C to stop.\n`);

const stop=()=>{ app.kill(); if(awake) awake.kill(); };
process.on("SIGINT",stop); process.on("SIGTERM",stop);
app.on("exit",code=>process.exit(code??0));
