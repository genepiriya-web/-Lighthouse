// Loads .env.local (git-ignored) into process.env without overriding values already set.
const fs=require("fs"), path=require("path");
const file=path.join(__dirname,"../.env.local");
if(fs.existsSync(file)) for(const line of fs.readFileSync(file,"utf8").split("\n")){
  const i=line.indexOf("="); if(i<1||line.startsWith("#")) continue;
  const k=line.slice(0,i).trim(); if(process.env[k]===undefined) process.env[k]=line.slice(i+1).trim();
}
module.exports=process.env;
