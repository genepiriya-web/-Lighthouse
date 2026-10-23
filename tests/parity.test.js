// Parity: v2 totals must equal the old system's totals on real jobs.
// Fixtures are NOT in git (they hold customer names and amounts). Put an export at data/parity.json:
//   [{ "no": "6902255", "order": {...header incl. extraDisc, insurance, adjust, tax}, "lines": [...], "legacy": {"sub": 0, "total": 0} }]
// No crew national IDs belong in this file.
const test=require("node:test"); const assert=require("node:assert/strict");
const fs=require("fs"), path=require("path"); const L=require("../src/logic.js");
const file=path.join(__dirname,"../data/parity.json");
const jobs=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,"utf8")):null;

test("parity with old-system totals",{skip:jobs?false:"data/parity.json not present — export it from the artifact db (needs Gene's OK)"},()=>{
  const bad=[];
  for(const j of jobs){ const T=L.orderTotals(j.lines,j.order); const net=L.r2(T.sub-T.extra+T.adj);
    if(Math.abs(net-j.legacy.sub)>0.05||(j.legacy.total!=null&&Math.abs(T.total-j.legacy.total)>0.05)) bad.push(`${j.no}: v2 ${net}/${T.total} vs old ${j.legacy.sub}/${j.legacy.total}`); }
  assert.deepEqual(bad,[],`${jobs.length-bad.length}/${jobs.length} match`);
});
