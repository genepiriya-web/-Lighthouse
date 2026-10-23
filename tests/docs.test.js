// Documents: lib/docs.js must produce exactly what the artifact page's docBody() produces (run inside the built page
// with jsdom), and its template sanitiser must only ever let plain text tags through.
const test=require("node:test"); const assert=require("node:assert/strict");
const fs=require("fs"), path=require("path"); const {JSDOM}=require("jsdom");
const D=require("../lib/docs.js"); const L=require("../src/logic.js");
const html=fs.readFileSync(path.join(__dirname,"../dist/app.html"),"utf8");

const order={no:"6909001",rev:3,customerName:"Synthetic Films <Co>",billing:"1 Test Rd",phone:"000",contact:"Ann",contactPhone:"111",jobTitle:"TVC & Friends",jobType:"TVC",dept:1,
  ship:"2026-11-01",ret:"2026-11-02",useStart:"2026-11-01",useEnd:"2026-11-02",dop:"DOP",sale:"Aom",tax:"Vat",extraDisc:5,insurance:500,adjust:-20,remarkId:"r1",footerId:"f1"};
const lines=[{k:"a",t:1,pid:1,code:"M18",desc:"HMI 18K",list:24000,qty:3,days:2,disc:60},{k:"c1",t:1,pid:2,code:"CG",desc:"Cable guard",list:0,qty:4,days:2,parent:"a"},
  {k:"b",t:2,pid:3,code:"STD",desc:"Stand",list:150,qty:2,days:2,foc:true},{k:"g",t:5,code:"GF",desc:"Gaffer · Test",list:3000,qty:1,days:1.5,ot:2,otRate:400,disc:10}];
const company={name:"Lighthouse Film Service",tax:"0105555555555",addr:"Bangkok"};
const remarks=[{id:"r1",name:"Std",html:"<p>Payment <b>30 days</b> &amp; terms</p>"}], footers=[{id:"f1",name:"F",html:"<div>Thank you<br>ขอบคุณ</div>"}];

function artifactDoc(o,ls,kind,disc){
  const dom=new JSDOM(html,{runScripts:"dangerously"}); const w=dom.window;
  w.__o=o; w.__l=ls; w.__cfg={company,remarks,footers};
  return { html: w.eval(`Object.assign(S.cfg,window.__cfg); docBody(window.__o, window.__l, ${JSON.stringify(kind)}, ${disc})`), today: w.eval("today()") };
}

for(const kind of ["quote","draft","items"]) for(const disc of [true,false]){ if(kind==="items"&&!disc) continue;
  test(`${kind}${disc?"":" without discount"} matches the artifact exactly`,()=>{
    const a=artifactDoc(order,lines,kind,disc);
    assert.equal(D.docBody(order,lines,kind,disc,{company,remarks,footers,today:a.today}),a.html);
  });
}

test("with-discount totals are logic.js orderTotals; without-discount uses list prices + insurance, VAT on that",()=>{
  const G=L.orderTotals(lines,order); const fmt=n=>n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
  assert.ok(D.docBody(order,lines,"quote",true,{today:"2026-10-23"}).includes(`<b>${fmt(G.total)}</b>`));
  const base=G.list+G.ins; const nod=Math.round((base+Math.round(base*7)/100)*100)/100;
  assert.ok(D.docBody(order,lines,"quote",false,{today:"2026-10-23"}).includes(`<b>${fmt(nod)}</b>`));
});

test("sanitiser keeps plain text tags only; scripts, attributes and handlers never survive",()=>{
  assert.equal(D.sanitizeHtml("<p class=x onclick='y'>Hi <b>there</b></p>"),"<p>Hi <b>there</b></p>");
  assert.equal(D.sanitizeHtml("<script>alert(1)</script>ok"),"alert(1)ok");
  assert.equal(D.sanitizeHtml('<img src=x onerror="alert(1)">x'),"x");
  assert.equal(D.sanitizeHtml('<a href="javascript:alert(1)">link</a>'),"link");
  assert.equal(D.sanitizeHtml("a <!-- hidden --> b"),"a  b");
  assert.equal(D.sanitizeHtml("Tom & Jerry &amp; co < 5"),"Tom &amp; Jerry &amp; co &lt; 5");
  assert.equal(D.sanitizeHtml("<div>x<br/>y</div>"),"<div>x<br>y</div>");
  for(const bad of ["<svg onload=alert(1)>","<iframe src=//x>","<style>*{}</style>","<b onmouseover=x>t</b>","<<script>script>"]) assert.doesNotMatch(D.sanitizeHtml(bad),/<(?!\/?(p|br|b|strong|i|em|u|ul|ol|li|span|div)>)/i,bad);
});

test("file name and wrapper as the artifact saved them",()=>{
  assert.equal(D.docName(order,"quote",false),"6909001-quotation-nodisc.html"); assert.equal(D.docName(order,"items",false),"6909001-item-list.html");
  assert.match(D.docFile(order,lines,"draft",true,{today:"2026-10-23"}),/^<!doctype html><html><head><meta charset="utf-8"><title>6909001<\/title>/);
});
