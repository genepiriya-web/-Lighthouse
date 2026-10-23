// UI smoke tests: load the built page in jsdom with a fake window.claude runtime.
// They check the page boots, roles change what is shown, and every English string has Thai.
const test=require("node:test"); const assert=require("node:assert/strict");
const fs=require("fs"), path=require("path"); const {JSDOM}=require("jsdom");
const html=fs.readFileSync(path.join(__dirname,"../dist/app.html"),"utf8");

// Minimal in-memory stand-in for the artifact db: collections of docs, snapshot listeners, lease locks.
function fakeRuntime({admin=false,role=null,orders=[]}={}){
  const me={id:"u1",name:"Tester",avatarUrl:""};
  const data={orders:Object.fromEntries(orders.map(o=>[o.id,o])),team:role?{u1:{role}}:{},meta:{},catalog:{},kits:{},customers:{},crew:{},catalogEdits:{},customerEdits:{},repairs:{},lines:{}};
  const snap=(col,ids)=>({docs:ids.map(id=>({id,data:()=>data[col][id],exists:true}))});
  const query=(col,filter)=>{ const q={where:(f,op,v)=>query(col,d=>(op==="in"?v.includes(d[f]):d[f]===v)),limit:()=>q,orderBy:()=>q,
    get:async()=>snap(col,Object.keys(data[col]||{}).filter(id=>!filter||filter(data[col][id]))),
    onSnapshot:(cb)=>{ q.get().then(cb); return ()=>{}; } }; return q; };
  const db={collection:c=>query(c),doc:p=>{ const [c,id]=p.split("/"); return {get:async()=>({exists:!!data[c]?.[id],id,data:()=>data[c]?.[id]}),onSnapshot:(cb)=>{cb({exists:!!data[c]?.[id],data:()=>data[c]?.[id]});return()=>{};},set:async v=>{(data[c]=data[c]||{})[id]=v;},update:async v=>{Object.assign(data[c][id],v);},delete:async()=>{delete data[c][id];},acquire:async()=>({acquired:true})}; }};
  const user={me:async()=>me,canEdit:async()=>admin,can:async()=>true,profiles:async()=>({}),search:async()=>[]};
  return {use:async k=>({db,user,downloads:{save:async()=>{}}})[k]};
}
async function load(runtime){
  const dom=new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,beforeParse(w){ if(runtime) w.claude=runtime; w.requestAnimationFrame=cb=>setTimeout(cb,0); }});
  for(let i=0;i<20;i++) await new Promise(r=>setTimeout(r,10));
  return dom.window;
}
const ORDERS=[{id:"o1",no:"6909001",status:"Quote",jobTitle:"TVC Test",customerName:"Synthetic Co",ship:"2026-11-01",ret:"2026-11-02",totals:{sub:1000,extra:0,adj:0}}];

test("without the Claude runtime the page shows the offline banner",async()=>{
  const w=await load(null);
  assert.match(w.document.querySelector("#viewBody").textContent,/shared database isn't reachable/);
});

test("admin lands on Cockpit and sees Team and Settings tabs",async()=>{
  const w=await load(fakeRuntime({admin:true,orders:ORDERS}));
  const tabs=[...w.document.querySelectorAll("#tabs .tab")].map(b=>b.dataset.tab);
  assert.equal(tabs[0],"cockpit"); assert.ok(tabs.includes("team")&&tabs.includes("settings"));
});

test("sale sees the job list and Create order; store does not get Create order",async()=>{
  const ws=await load(fakeRuntime({role:"sale",orders:ORDERS}));
  assert.ok(ws.document.querySelector('[data-act="newOrder"]'));
  assert.match(ws.document.querySelector("#viewBody").textContent,/6909001/);
  const wt=await load(fakeRuntime({role:"store",orders:ORDERS}));
  assert.equal(wt.document.querySelector('[data-act="newOrder"]'),null);
  assert.ok(![...wt.document.querySelectorAll("#tabs .tab")].some(b=>b.dataset.tab==="cockpit"));
});

test("every English UI string has a Thai translation",()=>{
  const m=html.match(/const I18N=\{en:\{([\s\S]*?)\},\s*th:\{([\s\S]*?)\}\};/);
  assert.ok(m,"I18N block not found");
  const keys=s=>new Set([...s.matchAll(/(?:^|,|\n)\s*([A-Za-z_][\w]*):"/g)].map(x=>x[1]));
  const en=keys(m[1]), th=keys(m[2]);
  const missing=[...en].filter(k=>!th.has(k));
  assert.deepEqual(missing,[]);
});

test("built page matches the published snapshot byte for byte",()=>{
  const snap=fs.readFileSync(path.join(__dirname,"../snapshot/published.html"),"utf8");
  assert.equal(html,snap);
});
