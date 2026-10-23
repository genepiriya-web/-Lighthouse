// Loads an artifact db export (data/export: catalog, kits, customers, crew, meta, counters, orders, lines) into Postgres.
// Idempotent: running it twice leaves the same rows. One transaction: all or nothing.
// Never touches v2-owned rows (orders.owner = 'v2', products/customers.source = 'v2'). Never reads `secure` (crew IDs).
//   node scripts/import.js [export-dir]     (default data/export; DATABASE_URL from env or .env.local)
const fs=require("fs"), path=require("path"); const {Client}=require("pg");
require("./env");

const J=f=>JSON.parse(fs.readFileSync(f,"utf8"));
const docs=(dir,col)=>{ const d=path.join(dir,col); return fs.existsSync(d)?fs.readdirSync(d).filter(f=>f.endsWith(".json")).sort().map(f=>J(path.join(d,f))):[]; };
const num=v=>(v===""||v==null||isNaN(+v))?null:+v;
const n0=v=>num(v)??0;
const str=v=>(v==null||v==="")?null:String(v);
const date=v=>/^\d{4}-\d{2}-\d{2}/.test(String(v||""))?String(v).slice(0,10):null;
const DEPT={LIGHTING:1,GRIP:2,"GRIP&LIGHTING":3};
const dept=v=>num(v)??DEPT[String(v||"").replace(/\s+/g,"").toUpperCase()]??null;
const bool=v=>v===true||v===1||v==="1"||v==="true";

// Upsert rows (plain objects keyed by column) via json_populate_recordset. `guard` limits which existing rows may change.
async function upsert(c,table,key,rows,{guard}={}){
  if(!rows.length) return 0;
  const cols=Object.keys(rows[0]); const keys=[].concat(key);
  const set=cols.filter(k=>!keys.includes(k)).map(k=>`${k}=excluded.${k}`).join(",");
  const sql=`insert into ${table} (${cols.join(",")}) select ${cols.join(",")} from json_populate_recordset(null::${table}, $1)
    on conflict (${keys.join(",")}) do ${set?`update set ${set}${guard?` where ${guard}`:""}`:"nothing"}`;
  const r=await c.query(sql,[JSON.stringify(rows)]); return r.rowCount;
}

function readExport(dir){
  const catalog=docs(dir,"catalog").flatMap(d=>d.rows.map(r=>Object.fromEntries(d.cols.map((c,i)=>[c,r[i]]))));
  const kits=Object.assign({},...docs(dir,"kits").map(d=>d.kits||{}));
  const customers=docs(dir,"customers").flatMap(d=>d.rows||[]);
  const crew=docs(dir,"crew").flatMap(d=>d.rows||[]);
  const metaDir=path.join(dir,"meta"); const meta=f=>fs.existsSync(path.join(metaDir,f+".json"))?J(path.join(metaDir,f+".json")):null;
  const counterFile=path.join(dir,"counters","orders.json"); const counter=fs.existsSync(counterFile)?J(counterFile):null;
  const orders=docs(dir,"orders"); const linesDir=path.join(dir,"lines");
  const lines=Object.fromEntries(orders.map(o=>{ const f=path.join(linesDir,o.id+".json"); return [o.id,fs.existsSync(f)?(J(f).items||[]):[]]; }));
  return {catalog,kits,customers,crew,config:meta("config")||{},company:meta("company"),counter,orders,lines};
}

async function importExport(c,dir,{log=()=>{}}={}){
  const X=readExport(dir); const counts={}; const skipped={};
  await c.query("begin");
  try{
    await c.query("set local app.importer = 'on'");

    counts.positions=await upsert(c,"positions","id",(X.config.positions||[]).map(p=>({id:+p.id,code:str(p.code),name:String(p.name??""),dept:num(p.dept),sort:num(p.sort)})));
    // Crew rates also point at positions missing from the config list (often retired ones); their code and name ride
    // along on each rate. Add those, never overwriting a position the config list defines.
    const listed=new Set((X.config.positions||[]).map(p=>+p.id)); const extraPos=new Map();
    for(const r of X.crew) for(const p of (r.pos||[])) if(!listed.has(+p.pid)&&!extraPos.has(+p.pid)) extraPos.set(+p.pid,{id:+p.pid,code:str(p.code),name:String(p.name??"").trim()||String(p.code??p.pid),dept:dept(p.dept),sort:null});
    counts.positions_from_crew=extraPos.size?(await c.query(`insert into positions select * from json_populate_recordset(null::positions,$1) on conflict (id) do nothing`,[JSON.stringify([...extraPos.values()])])).rowCount:0;

    const products=X.catalog.map(p=>({id:+p.id,code:String(p.code??""),description:String(p.desc??""),dept:num(p.dept),type:+p.type,price:n0(p.price),
      discountable:bool(p.discountable),max_disc:n0(p.maxDisc),stock:Math.trunc(n0(p.stock)),one_hand:num(p.oneHand),damage_lost:num(p.damageLost),
      serial:str(p.serial),unit:str(p.unit),weight:num(p.weight),sort:num(p.sort),is_fuel_hour:/^hour\s/i.test(String(p.desc||"").trim()),source:"legacy",updated_at:new Date().toISOString()}));
    counts.products=await upsert(c,"products","id",products,{guard:"products.source = 'legacy'"});

    // Kits: replace each exported parent's part list. Parts pointing at unknown products are skipped and counted.
    const known=new Set((await c.query("select id from products")).rows.map(r=>r.id));
    const parents=Object.keys(X.kits).map(Number).filter(id=>known.has(id));
    await c.query("delete from kit_parts where parent_id = any($1::int[]) and parent_id in (select id from products where source='legacy')",[parents]);
    const parts=[]; const seen=new Set();
    for(const pid of parents) for(const [cid,ratio,price] of X.kits[pid]){ const k=pid+":"+cid;
      if(!known.has(+cid)){ skipped.kitPartUnknownProduct=(skipped.kitPartUnknownProduct||0)+1; continue; }
      if(seen.has(k)) { skipped.kitPartDuplicate=(skipped.kitPartDuplicate||0)+1; continue; } seen.add(k);
      parts.push({parent_id:pid,child_id:+cid,ratio:num(ratio)??1,price:n0(price)}); }
    counts.kit_parts=await upsert(c,"kit_parts",["parent_id","child_id"],parts);

    const cust=X.customers.map(r=>({id:String(r.id),code:str(r.code),name:String(r.name??"").trim()||"(no name)",job_type:str(String(r.type??"").trim()),
      default_disc:n0(r.disc),billing_addr:str(r.addr),phone:str(r.phone),fax:str(r.fax),source:"legacy",flagged_new:false,flag_note:null,updated_at:new Date().toISOString()}));
    counts.customers=await upsert(c,"customers","id",cust,{guard:"customers.source = 'legacy'"});
    const taxRows=X.customers.filter(r=>str(r.tax)).map(r=>({customer_id:String(r.id),tax_id:String(r.tax).trim()}));
    await c.query("delete from customer_tax_ids where customer_id = any($1::text[]) and not (customer_id = any($2::text[]))",[cust.map(r=>r.id),taxRows.map(r=>r.customer_id)]);
    counts.customer_tax_ids=await upsert(c,"customer_tax_ids","customer_id",taxRows);

    counts.crew=await upsert(c,"crew","id",X.crew.map(r=>({id:String(r.id),code:str(r.code),first_name:str(r.first),last_name:str(r.last),nick:str(r.nick),
      description:str(r.desc),enabled:r.enable==null?true:bool(r.enable),updated_at:new Date().toISOString()})));
    const crewIds=X.crew.map(r=>String(r.id));
    await c.query("delete from crew_rates where crew_id = any($1::text[])",[crewIds]); // costs cascade
    // Every rate row is kept (Gene, 23 Oct). The same position listed twice gets rate_no 1, 2, ... and needs_review.
    const rates=[], costs=[];
    for(const r of X.crew){ const per={}; for(const p of (r.pos||[])) per[p.pid]=(per[p.pid]||0)+1; const no={};
      for(const p of (r.pos||[])){ const n=no[p.pid]=(no[p.pid]||0)+1; const dup=per[p.pid]>1; if(dup&&n===1) counts.crew_rates_needing_review=(counts.crew_rates_needing_review||0)+per[p.pid];
        rates.push({crew_id:String(r.id),position_id:+p.pid,rate_no:n,needs_review:dup,dept:dept(p.dept),price:n0(p.price),price_ot:n0(p.priceOt),enabled:p.enable==null?true:bool(p.enable)});
        costs.push({crew_id:String(r.id),position_id:+p.pid,rate_no:n,cost:n0(p.cost),cost_ot:n0(p.costOt)}); } }
    counts.crew_rates=await upsert(c,"crew_rates",["crew_id","position_id","rate_no"],rates);
    counts.crew_rate_costs=await upsert(c,"crew_rate_costs",["crew_id","position_id","rate_no"],costs);

    const settings=["remarks","footers","sales"].filter(k=>X.config[k]).map(k=>({key:k,value:X.config[k],updated_at:new Date().toISOString()}));
    if(X.company) settings.push({key:"company",value:X.company,updated_at:new Date().toISOString()});
    counts.settings=await upsert(c,"settings","key",settings);

    if(X.counter&&X.counter.be!=null){
      await c.query("insert into order_counters(be_year,seq) values ($1,$2) on conflict (be_year) do update set seq = greatest(order_counters.seq, excluded.seq)",[+X.counter.be,+X.counter.seq]);
      counts.order_counters=1; }

    // Jobs pointing at a customer missing from the customer list: create that customer from the job's details and flag it
    // as new (Gene, 23 Oct). Insert-only, so a person's later edits or un-flagging are never overwritten.
    let custIds=new Set((await c.query("select id from customers")).rows.map(r=>r.id));
    const missing=new Map();
    for(const o of X.orders){ const cid=o.customerId==null?null:String(o.customerId); if(cid&&!custIds.has(cid)&&!missing.has(cid))
      missing.set(cid,{id:cid,code:null,name:String(o.customerName??"").trim()||"(no name)",job_type:str(o.jobType),default_disc:0,billing_addr:str(o.billing),phone:str(o.phone),fax:str(o.fax),
        source:"legacy",flagged_new:true,flag_note:`Created by import: job ${o.no} refers to customer ${cid}, which is not in the old system's customer list. Check the details.`,updated_at:new Date().toISOString()}); }
    if(missing.size){ const r=await c.query(`insert into customers select * from json_populate_recordset(null::customers,$1) on conflict (id) do nothing`,[JSON.stringify([...missing.values()])]);
      counts.customers_flagged_new=r.rowCount; custIds=new Set((await c.query("select id from customers")).rows.map(r=>r.id)); }

    // Orders: legacy only. A v2 order with the same id is left alone and reported.
    const orders=X.orders.map(o=>{ const cid=o.customerId==null?null:String(o.customerId);
      return {id:String(o.id),no:String(o.no),owner:"legacy",legacy_id:str(o.legacyId),status:o.status,customer_id:cid&&custIds.has(cid)?cid:null,customer_name:str(o.customerName),
        job_title:str(o.jobTitle),job_type:str(o.jobType),dept:num(o.dept),billing:str(o.billing),phone:str(o.phone),fax:str(o.fax),contact:str(o.contact),contact_phone:str(o.contactPhone),
        dop:str(o.dop),pm:str(o.pm),gaffer:str(o.gaffer),key_grip:str(o.keyGrip),note:str(o.note),sale:str(o.sale),rent_type:o.rentType==="Weekly"?"Weekly":"Daily",dpw:num(o.dpw),
        tax:o.tax==="Not Vat"?"Not Vat":"Vat",ship:date(o.ship),ret:date(o.ret),use_start:date(o.useStart),use_end:date(o.useEnd),footer_id:str(o.footerId),remark_id:str(o.remarkId),
        extra_disc:n0(o.extraDisc),insurance:n0(o.insurance),adjust:n0(o.adjust),totals:o.totals??null,usage:o.usage??null,legacy_totals:o.legacyTotals??null,rev:Math.trunc(n0(o.rev)),
        created_at:o.createdAt||new Date().toISOString(),created_by:null,created_by_name:str(o.createdByName),updated_at:o.updatedAt||o.createdAt||new Date().toISOString(),updated_by:null}; });
    const v2Clash=(await c.query("select id from orders where owner='v2' and (id = any($1::text[]) or no = any($2::text[]))",[orders.map(o=>o.id),orders.map(o=>o.no)])).rows.map(r=>r.id);
    if(v2Clash.length) skipped.orderOwnedByV2=v2Clash.length;
    const legacyOrders=orders.filter(o=>!v2Clash.includes(o.id));
    counts.orders=await upsert(c,"orders","id",legacyOrders,{guard:"orders.owner = 'legacy'"});

    const ids=legacyOrders.map(o=>o.id);
    await c.query("delete from order_lines where order_id = any($1::text[])",[ids]);
    const lines=[];
    for(const id of ids){ const ks=new Set();
      (X.lines[id]||[]).forEach((l,i)=>{ let k=String(l.k||("i"+i)); if(ks.has(k)){ skipped.lineKeyDuplicate=(skipped.lineKeyDuplicate||0)+1; k=k+"~"+i; } ks.add(k);
        lines.push({order_id:id,k,sort:i,t:+l.t,pid:num(l.pid),code:str(l.code),description:str(l.desc),list:n0(l.list),qty:n0(l.qty),days:n0(l.days),disc:n0(l.disc),
          foc:bool(l.foc),sb:bool(l.sb),ot:num(l.ot),ot_rate:num(l.otRate),ratio:num(l.ratio),parent_k:str(l.parent),start_date:date(l.start),end_date:date(l.end),
          out_qty:n0(l.out),in_qty:n0(l.in),dmg:n0(l.dmg),lost:n0(l.lost),repaired:bool(l.repaired),crew_id:str(l.crewId),remark:str(l.remark),legacy_amount:num(l.legacyAmount)}); }); }
    for(let i=0;i<lines.length;i+=2000) counts.order_lines=(counts.order_lines||0)+await upsert(c,"order_lines",["order_id","k"],lines.slice(i,i+2000));

    // History from the artifact's per-order log. Artifact user ids aren't Supabase users, so actor stays null.
    const acts=[];
    for(const o of X.orders) if(!v2Clash.includes(String(o.id))) (o.log||[]).forEach((e,i)=>acts.push({at:e.at,actor:null,actor_name:str(e.byName),entity:"order",entity_id:String(o.id),
      action:String(e.a||"unknown"),detail:{from:"artifact",to:e.to??undefined,note:e.note??undefined},source_key:`artifact:${o.id}:${i}:${e.at}`}));
    counts.activity_new=acts.length?(await c.query(`insert into activity (at,actor,actor_name,entity,entity_id,action,detail,source_key)
      select at,actor,actor_name,entity,entity_id,action,detail,source_key from json_populate_recordset(null::activity,$1) on conflict (source_key) do nothing`,[JSON.stringify(acts)])).rowCount:0;

    await c.query("insert into import_runs(source,counts) values ($1,$2)",[path.basename(path.resolve(dir)),{counts,skipped}]);
    await c.query("commit");
  } catch(e){ await c.query("rollback"); throw e; }
  log(JSON.stringify({counts,skipped},null,1));
  return {counts,skipped};
}
module.exports={importExport,readExport};

if(require.main===module){
  const dir=process.argv[2]||path.join(__dirname,"../data/export");
  if(!process.env.DATABASE_URL){ console.error("DATABASE_URL not set (run `node scripts/db.js start`)"); process.exit(1); }
  const c=new Client({connectionString:process.env.DATABASE_URL});
  c.connect().then(()=>importExport(c,dir,{log:console.log})).then(()=>c.end()).catch(e=>{ console.error(e.message); c.end(); process.exit(1); });
}
