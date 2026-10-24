// Invite someone by email with a role — mainly for the very first admin, before anyone can use the Team screen.
// They join with that role the first time they sign in through Supabase with this email.
//   DATABASE_URL=… node scripts/invite.js gene@example.com admin "Gene"
const {Client}=require("pg"); require("./env");
const [email,role,name]=process.argv.slice(2);
if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!["admin","sale","store","accounting","crew"].includes(role)){ console.error('usage: node scripts/invite.js <email> <admin|sale|store|accounting|crew> ["Name"]'); process.exit(1); }
(async()=>{ const c=new Client({connectionString:process.env.DATABASE_URL}); await c.connect();
  try{ const r=await c.query(`insert into staff_invites (email, role, name) values (lower($1),$2,$3)
      on conflict (email) do update set role=excluded.role, name=excluded.name, invited_at=now() where staff_invites.used_at is null returning email`,[email,role,name||null]);
    console.log(r.rowCount?`invited ${email.toLowerCase()} as ${role}`:`${email.toLowerCase()} has already joined — change their role on the Team screen`); }
  finally { await c.end(); } })().catch(e=>{ console.error(e.message); process.exit(1); });
