// Adds one made-up staff member per role to the local database so the screens can be used with LHD_AUTH=dev.
// Test values only (fixed UUIDs, "Dev …" names). Refuses to run against a database that isn't on this machine.
//   node scripts/dev-staff.js
const {Client}=require("pg"); require("./env");
const url=process.env.DATABASE_URL; const host=url&&new URL(url).hostname;
if(!["127.0.0.1","localhost","::1"].includes(host)){ console.error("refusing: DATABASE_URL is not local"); process.exit(1); }
const STAFF=[["admin","Dev Admin (CEO)"],["sale","Dev Sale"],["store","Dev Store"],["accounting","Dev Accounting"],["crew","Dev Crew manager"]]
  .map(([role,name],i)=>({id:`00000000-0000-4000-8000-00000000000${i+1}`,role,name}));
(async()=>{ const c=new Client({connectionString:url}); await c.connect();
  for(const s of STAFF) await c.query(`insert into staff(user_id,display_name,role) values ($1,$2,$3)
    on conflict (user_id) do update set display_name=excluded.display_name, role=excluded.role, active=true`,[s.id,s.name,s.role]);
  await c.end(); console.log(`dev staff ready: ${STAFF.map(s=>s.role).join(", ")}`); })().catch(e=>{ console.error(e.message); process.exit(1); });
