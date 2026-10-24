// Staff trial on the office Wi-Fi, from this Mac: `npm run trial`
//   * starts the local database and applies migrations
//   * builds the app if it hasn't been built
//   * keeps one trial PIN in .trial-pin (git-ignored, read only by this launcher so tests and `npm run dev` stay unlocked)
//     — say it out loud in the meeting, don't write it on the screen
//   * serves the app to phones on the same Wi-Fi (test sign-in, PIN-locked) and prints the address to open
//   * keeps the Mac awake while it runs (macOS `caffeinate`); Ctrl+C stops everything
// The old system is never touched: v2 only reads copies of its data.
const fs=require("fs"), os=require("os"), path=require("path"), crypto=require("crypto"); const {spawn,execFileSync}=require("child_process");
const root=path.join(__dirname,".."); const PORT=Number(process.env.TRIAL_PORT||3000);
const pinFile=path.join(root,".trial-pin");
const sh=(cmd,args,opts={})=>execFileSync(cmd,args,{cwd:root,stdio:"inherit",...opts});

sh(process.execPath,["scripts/db.js","start"]);
sh(process.execPath,["scripts/migrate.js"]);
require("./env");
let pin=fs.existsSync(pinFile)?fs.readFileSync(pinFile,"utf8").trim():"";
if(!/^\d{4,8}$/.test(pin)){ pin=String(crypto.randomInt(100000,1000000)); fs.writeFileSync(pinFile,pin+"\n",{mode:0o600}); console.log("made a new trial PIN and saved it in .trial-pin"); }
if(!fs.existsSync(path.join(root,".next/BUILD_ID"))){ console.log("building the app (first time only, about a minute)…"); sh("npm",["run","build"],{env:{...process.env,NEXT_TELEMETRY_DISABLED:"1"}}); }

const ips=Object.values(os.networkInterfaces()).flat().filter(i=>i&&i.family==="IPv4"&&!i.internal).map(i=>i.address);
const app=spawn(process.execPath,[require.resolve("next/dist/bin/next"),"start","-H","0.0.0.0","-p",String(PORT)],
  {cwd:root,stdio:["ignore","inherit","inherit"],env:{...process.env,LHD_AUTH:"dev",LHD_TRIAL_PIN:pin,NEXT_TELEMETRY_DISABLED:"1"}});
let awake=null; if(process.platform==="darwin") awake=spawn("caffeinate",["-i","-w",String(app.pid)],{stdio:"ignore"});

console.log(`\n  Lighthouse Dispatch — staff trial (ทดลองใช้)\n`);
console.log(`  Open on phones connected to the same Wi-Fi:`);
for(const ip of ips) console.log(`    http://${ip}:${PORT}/dev-login`);
console.log(`  On this Mac: http://localhost:${PORT}/dev-login`);
console.log(`\n  Trial PIN: ${pin}   (say it in the meeting; to change it, delete .trial-pin and start again)`);
console.log(`  If macOS asks whether "node" may accept incoming connections, choose Allow.`);
console.log(`  Ctrl+C to stop.\n`);

const stop=()=>{ app.kill(); if(awake) awake.kill(); };
process.on("SIGINT",stop); process.on("SIGTERM",stop);
app.on("exit",code=>process.exit(code??0));
