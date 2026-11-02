// Old-system sync converter (scripts/sync/convert.js): the shapes read on 27–28 Oct 2026, turned into the import format
// exactly as the 23 Oct sync did (checked then: 144 of 146 unchanged jobs identical; the other 2 were real edits).
// Synthetic data only.
const test=require("node:test"); const assert=require("node:assert/strict");
const fs=require("fs"),os=require("os"),path=require("path");
const {convert,orderOf,linesOf,statusOf,noOf,adjustOf}=require("../scripts/sync/convert.js");
const order={id:90001,orderId:"6909901",status:"Shipped",customerId:10,customerName:"Synthetic Films",jobTitle:"TVC T",jobType:"TVC",departmentId:1,billingAddress:"1 Test Rd",
  dop:"D",gaffer:null,remark:"note",salePersonName:"Test",type:"Daily",dpw:0,tax:"Vat",shipDate:"2026-10-27T00:00:00.000+0000",returnDate:"2026-10-28T00:00:00.000+0000",
  usageStart:"2026-10-27T00:00:00.000+0000",usageEnd:"2026-10-28T00:00:00.000+0000",footerId:9,remarkId:11,discountPercent:0,insuranceFree:0,listPrice:10000,discount:9000,
  subTotal:1000,vat:70,total:1070,revision:"016",createdDate:"2026-10-25T09:00:00.000+0000",createdBy:"Tester",updatedDate:"2026-10-26T09:00:00.000+0000"};
const items=[{id:5001,__type:1,productId:1,listPrice:24000,qty:2,day:2,discount:90.5,freeOfChange:false,standBy:true,usageDateStart:"2026-10-27T00:00:00.000+0000",usageDateEnd:"2026-10-28T00:00:00.000+0000",remark:"",
  productWrapper:{productCode:"M18",description:"Synthetic HMI",orderProductChildWrappers:[{productId:2,productCode:"CG",childDescription:"Cable guard",listPrice:0,quantity:8,discount:60,day:2}]}},
  {id:5002,__type:4,productId:3,listPrice:5000,qty:1,day:2,discount:null,freeOfChange:false,standBy:false,usageDateStart:null,usageDateEnd:null,remark:"",productWrapper:{productCode:"G45",orderProductChildWrappers:[]}}];
const crew=[{id:7001,__type:5,crewId:500,crewCode:"G01",crewName:"Test Person",position:"HEAD ELECTRICIAN",price:3000,qty:1,day:"2.0",ot:500,otHour:2,total:6000,usageDateStart:null,usageDateEnd:null,remark:"14+2"}];

test("status: named, or a leading Q marks a quote; the Q stays in the number (its own series: Q6700001 and 6700001 are different jobs)",()=>{
  assert.equal(statusOf({status:null,orderId:"Q6902172"}),"Quote"); assert.equal(noOf({orderId:"Q6902172"}),"Q6902172");
  assert.equal(statusOf({status:"Draft INV",orderId:"6900001"}),"Draft INV"); assert.throws(()=>statusOf({status:"Weird",orderId:"1"}));
});

test("order header and old totals; lines with package parts, discounts, standby and crew, as the 23 Oct sync wrote them",()=>{
  const o=orderOf(order,null);
  assert.deepEqual([o.id,o.no,o.legacyId,o.status,o.dept,o.ship,o.useEnd,o.note,o.sale,o.rev,o.footerId],["6909901","6909901",90001,"Shipped",1,"2026-10-27","2026-10-28","note","Test",16,"9"]);
  assert.deepEqual(o.legacyTotals,{list:10000,disc:9000,sub:1000,vat:70,total:1070});
  const L=linesOf(o,items,crew);
  assert.deepEqual(L.map(l=>l.k),["L5001","L5001c0","L5002","C7001"]);
  const [p,c,g,cr]=L;
  assert.deepEqual([p.disc,p.sb,p.out,p.in],[90.5,true,2,0],"Shipped: all out");
  assert.deepEqual([c.parent,c.qty,c.ratio,c.disc,c.sb,c.foc],["L5001",8,4,60,false,false],"parts never carry standby/FOC themselves");
  assert.equal(g.disc,0,"a missing discount is 0");
  assert.deepEqual([cr.t,cr.crewId,cr.desc,cr.days,cr.ot,cr.otRate,cr.legacyAmount,cr.disc],[5,"500","HEAD ELECTRICIAN · Test Person",2,2,500,6000,14.29]);
});

test("convert writes orders, lines and meta; closed jobs keep their lines and take the old system's status",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"lhd-sync-"));
  fs.mkdirSync(path.join(dir,"orders")); fs.mkdirSync(path.join(dir,"lines"));
  fs.writeFileSync(path.join(dir,"orders/6909902.json"),JSON.stringify({id:"6909902",no:"6909902",legacyId:90002,status:"Order"}));
  const s=convert({run:"20261028T1100",at:"2026-10-28T04:00:00Z",orders:[order],items:{90001:items},crew:{90001:crew},detail:{90002:{orderId:"6909902",status:"Draft INV",updatedDate:"2026-10-27T00:00:00Z"}}},dir);
  assert.deepEqual(s,{open:1,newJobs:1,changed:0,closed:1,lines:4,adjusted:[],storeAddGap:[],mismatched:["6909901"]},"synthetic old totals far from the lines: left unadjusted");
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,"orders/6909902.json"))).status,"Draft INV");
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,"lines/6909901.json"))).items.length,4);
  assert.match(JSON.parse(fs.readFileSync(path.join(dir,"meta/sync.json"))).note,/1 new, 0 refreshed, 1 re-checked/);
  fs.rmSync(dir,{recursive:true,force:true});
});

test("adjust (PLAN L8): a gap up to max(฿1,000, 2%) becomes the adjust; a bigger one stays visible",()=>{
  const lines=[{k:"a",t:1,list:1000,qty:1,days:1,disc:0}]; // v2 sub 1,000
  const o=sub=>({extraDisc:0,insurance:0,tax:"Vat",legacyTotals:{sub}});
  assert.equal(adjustOf(o(1080),lines),80); assert.equal(adjustOf(o(999.99),lines),-0.01);
  assert.equal(adjustOf(o(2000),lines),1000); assert.equal(adjustOf(o(2000.01),lines),null);
  const big=[{k:"a",t:1,list:100000,qty:1,days:1,disc:0}];
  assert.equal(adjustOf(o(102000),big),2000,"2% of 102,000 is over ฿1,000"); assert.equal(adjustOf(o(105000),big),null);
});

test("store-added lines missing from the old total (old system doesn't redo totals when Store adds): no adjust, listed apart",()=>{
  const o=sub=>({extraDisc:0,insurance:0,tax:"Vat",legacyTotals:{sub}});
  const lines=[{k:"a",t:1,list:1000,qty:1,days:1,disc:0},{k:"b",t:1,list:320,qty:1,days:1,disc:0,remark:"Store Add"}];
  assert.equal(adjustOf(o(1000),lines),"storeAdd","v2 higher by the store line: lines are right");
  assert.equal(adjustOf(o(1000),[lines[0],{...lines[1],remark:"",storeAdd:true}]),"storeAdd","the old system's flag counts too");
  assert.equal(adjustOf(o(1400),lines),80,"old total higher: not a missing store line, normal rule");
  assert.equal(adjustOf(o(1000),[lines[0],{...lines[1],remark:""}]),-320,"no store lines: normal rule");
});

test("history: a Q quote and a job with the same digits, and one number given to two old jobs, each keep their own file",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"lhd-sync-"));
  const job={...order,id:91001,orderId:"6700001",status:"Draft INV"}, quote={...order,id:91002,orderId:"Q6700001",status:null};
  const twinA={...order,id:91003,orderId:"6701680",status:"Draft INV"}, twinB={...order,id:91004,orderId:"6701680",status:"Cancel"};
  const pull=os=>({run:"h",at:"2026-11-03T00:00:00Z",orders:os,items:{},crew:{},detail:{}});
  const s=convert([pull([job,quote,twinA]),pull([twinB])],dir);
  const files=fs.readdirSync(path.join(dir,"orders")).sort();
  assert.deepEqual(files,["6700001.json","6701680-91004.json","6701680.json","Q6700001.json"]);
  const read=f=>JSON.parse(fs.readFileSync(path.join(dir,"orders",f)));
  assert.deepEqual([read("6701680.json").legacyId,read("6701680-91004.json").legacyId,read("6701680-91004.json").no],[91003,91004,"6701680-91004"]);
  assert.equal(read("Q6700001.json").status,"Quote");
  assert.equal(s.newJobs,4); assert.match(JSON.parse(fs.readFileSync(path.join(dir,"meta/sync.json"))).note,/run h, h: 4 new/);
  convert([pull([twinB,twinA,job,quote])],dir); // again, in another order: same files, nothing new
  assert.deepEqual(fs.readdirSync(path.join(dir,"orders")).sort(),files);
  fs.rmSync(dir,{recursive:true,force:true});
});
