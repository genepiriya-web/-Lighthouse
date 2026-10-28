// Old-system sync converter (scripts/sync/convert.js): the shapes read on 27–28 Oct 2026, turned into the import format
// exactly as the 23 Oct sync did (checked then: 144 of 146 unchanged jobs identical; the other 2 were real edits).
// Synthetic data only.
const test=require("node:test"); const assert=require("node:assert/strict");
const fs=require("fs"),os=require("os"),path=require("path");
const {convert,orderOf,linesOf,statusOf,noOf}=require("../scripts/sync/convert.js");
const order={id:90001,orderId:"6909901",status:"Shipped",customerId:10,customerName:"Synthetic Films",jobTitle:"TVC T",jobType:"TVC",departmentId:1,billingAddress:"1 Test Rd",
  dop:"D",gaffer:null,remark:"note",salePersonName:"Test",type:"Daily",dpw:0,tax:"Vat",shipDate:"2026-10-27T00:00:00.000+0000",returnDate:"2026-10-28T00:00:00.000+0000",
  usageStart:"2026-10-27T00:00:00.000+0000",usageEnd:"2026-10-28T00:00:00.000+0000",footerId:9,remarkId:11,discountPercent:0,insuranceFree:0,listPrice:10000,discount:9000,
  subTotal:1000,vat:70,total:1070,revision:"016",createdDate:"2026-10-25T09:00:00.000+0000",createdBy:"Tester",updatedDate:"2026-10-26T09:00:00.000+0000"};
const items=[{id:5001,__type:1,productId:1,listPrice:24000,qty:2,day:2,discount:90.5,freeOfChange:false,standBy:true,usageDateStart:"2026-10-27T00:00:00.000+0000",usageDateEnd:"2026-10-28T00:00:00.000+0000",remark:"",
  productWrapper:{productCode:"M18",description:"Synthetic HMI",orderProductChildWrappers:[{productId:2,productCode:"CG",childDescription:"Cable guard",listPrice:0,quantity:8,discount:60,day:2}]}},
  {id:5002,__type:4,productId:3,listPrice:5000,qty:1,day:2,discount:null,freeOfChange:false,standBy:false,usageDateStart:null,usageDateEnd:null,remark:"",productWrapper:{productCode:"G45",orderProductChildWrappers:[]}}];
const crew=[{id:7001,__type:5,crewId:500,crewCode:"G01",crewName:"Test Person",position:"HEAD ELECTRICIAN",price:3000,qty:1,day:"2.0",ot:500,otHour:2,total:6000,usageDateStart:null,usageDateEnd:null,remark:"14+2"}];

test("status: named, or a leading Q marks a quote; numbers lose the Q",()=>{
  assert.equal(statusOf({status:null,orderId:"Q6902172"}),"Quote"); assert.equal(noOf({orderId:"Q6902172"}),"6902172");
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
  assert.deepEqual(s,{open:1,newJobs:1,changed:0,closed:1,lines:4});
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,"orders/6909902.json"))).status,"Draft INV");
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,"lines/6909901.json"))).items.length,4);
  assert.match(JSON.parse(fs.readFileSync(path.join(dir,"meta/sync.json"))).note,/1 new, 0 refreshed, 1 re-checked/);
  fs.rmSync(dir,{recursive:true,force:true});
});
