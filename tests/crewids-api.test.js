// M5: crew national IDs. Synthetic, checksum-valid IDs only. Checks that IDs are admin-only, encrypted at rest, never in
// logs or ordinary responses, every full view logged, and that client links expire, can be revoked, run out, and never
// hand IDs to a plain GET (chat-app link previews).
process.env.CREW_ID_KEY=require("crypto").randomBytes(32).toString("base64"); // a throwaway key for this run
const test=require("node:test"); const assert=require("node:assert/strict");
const {startTestServer,skipReason}=require("./helpers/server"); const {syntheticId}=require("./helpers/fixture");
const skip=skipReason(); let S; const PORT=3925; const base=`http://127.0.0.1:${PORT}`;
test.before(async()=>{ if(!skip) S=await startTestServer(PORT); });
test.after(async()=>{ if(S) await S.stop(); });
const ok=(r,what)=>{ assert.ok(r.status>=200&&r.status<300,`${what}: ${r.status} ${JSON.stringify(r.body)}`); return r.body; };
const ID=syntheticId(500); const FMT=`${ID[0]}-${ID.slice(1,5)}-${ID.slice(5,10)}-${ID.slice(10,12)}-${ID[12]}`;
const noId=(x,where)=>{ const s=typeof x==="string"?x:JSON.stringify(x); assert.ok(!s.includes(ID)&&!s.includes(FMT),`national ID leaked in ${where}`); };
const share=async(path,method="GET")=>{ const r=await fetch(base+path,{method}); return {status:r.status,headers:r.headers,text:await r.text()}; };

test("only admin can touch crew IDs, through every endpoint",{skip},async()=>{
  for(const who of ["sale","store","accounting","crew"]){
    for(const [m,p,b] of [["GET","/api/crew-ids"],["POST","/api/crew-ids/import",{text:"G01,"+ID,save:true}],["POST","/api/crew-ids/500/reveal",{}],["DELETE","/api/crew-ids/500"],
      ["GET","/api/orders/6900001/crew"],["GET","/api/orders/6900001/crew-links"],["POST","/api/orders/6900001/crew-links",{recipient:"x",hours:1}],["POST","/api/crew-links/x/revoke",{}]])
      assert.equal((await S.api(who,m,p,b)).status,403,`${who} ${m} ${p}`);
  }
});

test("import: preview then save; matched by code; checksum and unknown crew refused; IDs never echoed",{skip},async()=>{
  const bad=ID.slice(0,12)+String((+ID[12]+1)%10);
  const text=`code,national id\nG01,${ID}\nG01x,${ID}\nTest Gaffer,${bad}\njust-one-column`;
  const pre=ok(await S.api("admin","POST","/api/crew-ids/import",{text,save:false}));
  assert.equal(pre.saved,0); assert.equal(pre.ready,1); noId(pre,"import preview");
  assert.deepEqual(pre.rows.map(r=>[r.key,r.ok,r.why??null]),[["G01",true,null],["G01x",false,"nomatch"],["Test Gaffer",false,"checksum"],["just-one-column",false,"cols"]]);
  assert.equal(pre.rows[0].masked,`x-xxxx-xxxxx-${ID.slice(10,12)}-${ID[12]}`);
  assert.equal((await S.db.query("select count(*) from crew_national_ids")).rows[0].count,"0","preview stores nothing");
  const saved=ok(await S.api("admin","POST","/api/crew-ids/import",{text,save:true})); assert.equal(saved.saved,1); noId(saved,"import result");
});

test("at rest: encrypted, only the last 3 digits in clear; no client role can read the table, admin included",{skip},async()=>{
  const row=(await S.db.query("select * from crew_national_ids where crew_id='500'")).rows[0];
  assert.match(row.cipher,/^v1:/); assert.equal(row.last3,ID.slice(-3)); noId(row,"crew_national_ids row");
  await S.db.query("begin");
  try{ await S.db.query("set local role authenticated"); await S.db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:S.uid.admin})]);
    await assert.rejects(S.db.query("select * from crew_national_ids"),/permission denied/);
  } finally { await S.db.query("rollback"); }
  assert.deepEqual(ok(await S.api("admin","GET","/api/crew-ids")).masked,{"500":`x-xxxx-xxxxx-${ID.slice(10,12)}-${ID[12]}`});
});

test("reveal: admin sees the full ID; every view is logged without the ID",{skip},async()=>{
  for(let i=0;i<2;i++) assert.equal(ok(await S.api("admin","POST","/api/crew-ids/500/reveal",{})).id,FMT);
  const v=(await S.db.query("select actor_name, detail from activity where entity='crew_id' and entity_id='500' and action='viewed'")).rows;
  assert.equal(v.length,2); assert.equal(v[0].actor_name,"Test admin");
  noId((await S.db.query("select detail from activity")).rows,"activity log");
  const crew=ok(await S.api("admin","GET","/api/orders/6900001/crew")).crew; assert.deepEqual(crew.map(c=>[c.crewId,c.position,c.masked!=null]),[["500","G01",true]]); noId(crew,"job crew");
});

test("client link: GET shows no personal data and counts nothing; POST shows IDs, counts and logs; limits hold",{skip},async()=>{
  assert.equal((await S.api("admin","POST","/api/orders/6900001/crew-links",{recipient:"",hours:24})).body.error,"recipient_required");
  assert.equal((await S.api("admin","POST","/api/orders/6900001/crew-links",{recipient:"Prod X",hours:500})).body.error,"bad_hours");
  assert.equal((await S.api("admin","POST","/api/orders/6900002/crew-links",{recipient:"Prod X",hours:24})).body.error,"noCrewOnJob");
  const L=ok(await S.api("admin","POST","/api/orders/6900001/crew-links",{recipient:"Prod X location manager",hours:24,maxViews:2}),"create link");
  const token=L.path.split("/").pop(); assert.ok(token.length>=40);
  noId((await S.db.query("select * from crew_id_links")).rows,"links table"); assert.ok(!JSON.stringify((await S.db.query("select * from crew_id_links")).rows).includes(token),"token stored in clear");

  const g=await share(L.path); assert.equal(g.status,200); noId(g.text,"link GET page"); assert.match(g.text,/TVC 6900001/); assert.match(g.text,/<form method="post">/);
  assert.equal(g.headers.get("cache-control"),"no-store, max-age=0"); assert.match(g.headers.get("x-robots-tag"),/noindex/); assert.equal(g.headers.get("referrer-policy"),"no-referrer");
  assert.equal(ok(await S.api("admin","GET","/api/orders/6900001/crew-links")).links[0].views,0,"a GET (link preview) must not use a view");

  const p=await share(L.path,"POST"); assert.equal(p.status,200); assert.ok(p.text.includes(FMT),"full ID on the opened list"); assert.match(p.text,/Test Gaffer/);
  const opened=(await S.db.query("select actor, actor_name, detail from activity where action='crew_link_opened'")).rows;
  assert.equal(opened.length,1); assert.equal(opened[0].actor,null); assert.equal(opened[0].actor_name,"client link"); assert.equal(opened[0].detail.recipient,"Prod X location manager");
  assert.equal((await share(L.path,"POST")).status,200);
  assert.equal((await share(L.path,"POST")).status,410,"view limit reached");
  const links=ok(await S.api("admin","GET","/api/orders/6900001/crew-links")).links; assert.deepEqual([links[0].views,links[0].state],[2,"used_up"]);
  noId((await S.db.query("select detail from activity")).rows,"activity log");
});

test("client link: masked links, revoke, expiry and made-up tokens",{skip},async()=>{
  const M=ok(await S.api("admin","POST","/api/orders/6900001/crew-links",{recipient:"Masked one",hours:1,show:"masked"}));
  const mt=await share(M.path,"POST"); noId(mt.text,"masked link"); assert.ok(mt.text.includes(`x-xxxx-xxxxx-${ID.slice(10,12)}-${ID[12]}`));
  const R=ok(await S.api("admin","POST","/api/orders/6900001/crew-links",{recipient:"Revoke me",hours:24}));
  ok(await S.api("admin","POST",`/api/crew-links/${R.linkId}/revoke`,{}));
  assert.equal((await share(R.path)).status,410); assert.equal((await share(R.path,"POST")).status,410);
  const E=ok(await S.api("admin","POST","/api/orders/6900001/crew-links",{recipient:"Expire me",hours:1}));
  await S.db.query("update crew_id_links set expires_at = now() - interval '1 minute' where id=$1",[E.linkId]);
  assert.equal((await share(E.path,"POST")).status,410);
  for(const t of ["nope","A".repeat(43),"../../api/me"]) assert.ok([404,410].includes((await share(`/share/crew/${encodeURIComponent(t)}`)).status),t);
  const acts=(await S.db.query("select action from activity where entity='order' and entity_id='6900001' and action like 'crew_link%' order by id")).rows.map(r=>r.action);
  assert.ok(acts.includes("crew_link_revoked")&&acts.filter(a=>a==="crew_link_created").length===4);
});

test("remove: admin deletes an ID; it's gone and the removal is logged",{skip},async()=>{
  ok(await S.api("admin","DELETE","/api/crew-ids/500"));
  assert.equal((await S.api("admin","POST","/api/crew-ids/500/reveal",{})).status,404);
  assert.equal((await S.db.query("select count(*) from activity where entity='crew_id' and action='removed'")).rows[0].count,"1");
});
