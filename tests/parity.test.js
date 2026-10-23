// Parity: v2 totals must equal the old system's totals on real jobs.
// Fixtures are NOT in git (they hold real amounts). Build data/parity.json with scripts/make-parity.js from an artifact db export.
// Format: [{ "no", "status", "order": {rentType,dpw,extraDisc,insurance,adjust,tax}, "lines": [{t,list,qty,days,disc,foc,sb,ot,otRate,legacyAmount,...}], "legacy": {list,disc,sub,vat,total} }]
// Pricing fields only: no customer names, phones, crew codes or national IDs.
const test=require("node:test"); const assert=require("node:assert/strict");
const fs=require("fs"), path=require("path"); const L=require("../src/logic.js");
const file=path.join(__dirname,"../data/parity.json");
const jobs=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,"utf8")):null;
const skip=jobs?false:"data/parity.json not present — run scripts/make-parity.js on an artifact db export";
const MIN_JOBS=200; // the 23 Oct 2026 export has 209; a much smaller file means a broken export, not a pass

test("parity: order sub total and VAT total match the old system",{skip},()=>{
  assert.ok(jobs.length>=MIN_JOBS,`only ${jobs.length} jobs in data/parity.json`);
  const bad=[];
  for(const j of jobs){ const T=L.orderTotals(j.lines,j.order); const net=L.r2(T.sub-T.extra+T.adj);
    if(Math.abs(net-j.legacy.sub)>0.05||(j.legacy.total!=null&&Math.abs(T.total-j.legacy.total)>0.05)) bad.push(`${j.no}: v2 ${net}/${T.total} vs old ${j.legacy.sub}/${j.legacy.total}`); }
  assert.deepEqual(bad,[],`${jobs.length-bad.length}/${jobs.length} match`);
});

test("parity: every line's total matches the old system's line amount",{skip},()=>{
  const bad=[]; let n=0;
  for(const j of jobs) for(const l of j.lines){ if(l.legacyAmount==null) continue; n++;
    const c=L.lineCalc(l); if(Math.abs(c.total-l.legacyAmount)>0.05) bad.push(`${j.no} ${l.code}: v2 ${c.total} vs old ${l.legacyAmount}`); }
  assert.ok(n>0,"no lines carry legacyAmount");
  assert.deepEqual(bad,[],`${n-bad.length}/${n} lines match`);
});
