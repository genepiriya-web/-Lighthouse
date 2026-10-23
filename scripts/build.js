// Builds dist/app.html (the single-page Artifact) from src/app.html + src/logic.js.
const fs=require("fs"), path=require("path");
const root=path.join(__dirname,"..");
const shell=fs.readFileSync(path.join(root,"src/app.html"),"utf8");
const logic=fs.readFileSync(path.join(root,"src/logic.js"),"utf8").split("/*EXPORTS*/")[0];
if(!shell.includes("/*@@LOGIC@@*/")) throw new Error("src/app.html is missing the /*@@LOGIC@@*/ slot");
fs.mkdirSync(path.join(root,"dist"),{recursive:true});
fs.writeFileSync(path.join(root,"dist/app.html"),shell.replace("/*@@LOGIC@@*/",()=>logic));
console.log("built dist/app.html");
