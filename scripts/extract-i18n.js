// Copies the artifact page's approved English/Thai strings (the I18N object in src/app.html) into lib/i18n.artifact.json,
// so the Next.js screens reuse them word for word. Re-run after changing strings in the artifact.
const fs=require("fs"), path=require("path"), vm=require("vm");
const html=fs.readFileSync(path.join(__dirname,"../src/app.html"),"utf8");
const m=html.match(/const I18N=(\{en:\{[\s\S]*?\},\s*th:\{[\s\S]*?\}\});/); if(!m) throw new Error("I18N block not found in src/app.html");
const I18N=vm.runInNewContext("("+m[1]+")");
fs.writeFileSync(path.join(__dirname,"../lib/i18n.artifact.json"),JSON.stringify(I18N,null,1)+"\n");
console.log(`lib/i18n.artifact.json: ${Object.keys(I18N.en).length} en, ${Object.keys(I18N.th).length} th`);
