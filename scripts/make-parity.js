// Builds data/parity.json from an artifact db export (orders/<id>.json + lines/<id>.json).
// Keeps pricing fields only. Never copies names, phones, notes, crew codes or the secure collection.
// Usage: node scripts/make-parity.js <export-dir>
const fs=require("fs"), path=require("path");
const src=process.argv[2]; if(!src) { console.error("usage: node scripts/make-parity.js <export-dir>"); process.exit(1); }
const pick=(o,ks)=>Object.fromEntries(ks.filter(k=>o[k]!==undefined).map(k=>[k,o[k]]));
const out=[];
for(const f of fs.readdirSync(path.join(src,"orders")).sort()){
  const o=JSON.parse(fs.readFileSync(path.join(src,"orders",f),"utf8"));
  if(!o.legacyTotals||o.legacyTotals.sub==null) continue;
  const lf=path.join(src,"lines",f); const items=fs.existsSync(lf)?(JSON.parse(fs.readFileSync(lf,"utf8")).items||[]):[];
  out.push({no:o.no,status:o.status,order:pick(o,["rentType","dpw","extraDisc","insurance","adjust","tax"]),
    lines:items.map(l=>({...pick(l,["t","pid","code","list","qty","days","disc","foc","sb","ot","otRate","legacyAmount"]),parent:l.parent?true:undefined})),
    legacy:pick(o.legacyTotals,["list","disc","sub","vat","total"])});
}
fs.mkdirSync(path.join(__dirname,"../data"),{recursive:true});
fs.writeFileSync(path.join(__dirname,"../data/parity.json"),JSON.stringify(out));
console.log(`wrote data/parity.json: ${out.length} jobs`);
