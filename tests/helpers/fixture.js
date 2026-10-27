// Shared synthetic fixture: an artifact-db-style export with made-up products, customers, crew and two legacy jobs.
// No real data. The one national-ID-shaped value is generated with a valid Thai checksum.
const fs=require("fs"), path=require("path");

// Synthetic national ID with a valid Thai checksum (never a real person's).
function syntheticId(seed){ const d=String(1000000000000+((seed*7919)%899999999999)).slice(0,12).split("").map(Number); d[0]=d[0]||1;
  const s=d.reduce((a,x,i)=>a+x*(13-i),0); return d.join("")+String((11-s%11)%10); }

function writeFixture(dir){
  const w=(rel,obj)=>{ const f=path.join(dir,rel); fs.mkdirSync(path.dirname(f),{recursive:true}); fs.writeFileSync(f,JSON.stringify(obj)); };
  const cols=["id","code","desc","dept","type","price","discountable","maxDisc","stock","oneHand","damageLost","serial","unit","weight","sort"];
  w("catalog/c0.json",{cols,rows:[[1,"M18","Synthetic HMI 18K",1,1,24000,1,0,2,2,0,"","SET",null,1.1],[2,"CG","Cable guard",2,2,150,0,0,10,10,0,"","PC",null,1.2],
    [3,"GEN","Generator package",1,4,9000,1,20,1,1,0,"","SET",null,2],[4,"HR1","Hour fuel",1,4,800,0,0,99,99,0,"","HR",null,3],
    [5,"G45","Generator 45 KVA (T1) G45",1,4,5000,1,0,1,1,0,"","SET",null,4],[6,"HG45","Hour Gasoline 45 KVA",1,4,300,0,0,99,99,0,"","HR",null,5]]});
  w("kits/k0.json",{kits:{3:[[2,4,150],[1,1],[999,1]]}});
  w("customers/k0.json",{rows:[{id:10,code:"C10",name:"Synthetic Films",type:"TVC",disc:20,addr:"1 Test Rd",phone:"000",fax:"",tax:syntheticId(1)},
    {id:11,code:"C11",name:"Example Studio",type:"FILM ",disc:0,addr:"",phone:"",fax:"",tax:""}]});
  w("crew/r0.json",{rows:[{id:500,code:"G01",first:"Test",last:"Gaffer",nick:"T",desc:"",enable:1,pos:[{pid:7,dept:"LIGHTING",price:3000,priceOt:400,cost:2000,costOt:300,enable:1,code:"GF",name:"Gaffer"},
    {pid:8,dept:"GRIP",price:2500,priceOt:300,cost:1800,costOt:250,enable:1,code:"KG",name:"Key grip"},{pid:8,dept:"GRIP",price:1,priceOt:1,cost:1,costOt:1,enable:1,code:"KG",name:"Key grip"}]}]});
  w("meta/config.json",{positions:[{id:7,code:"GF",name:"Gaffer",dept:1,sort:1.5}],remarks:[{id:"r1",name:"Std",html:"<p>x</p>",def:1}],footers:[],sales:[{code:"S1",nick:"Aom",name:"Sale One"}],staff:{}});
  w("counters/orders.json",{be:69,seq:9000});
  const order=(id,status,extra)=>({id,no:id,legacyId:"L"+id,status,customerId:10,customerName:"Synthetic Films",jobTitle:"TVC "+id,ship:"2026-11-01",ret:"2026-11-02",
    rentType:"Daily",tax:"Vat",createdAt:"2026-10-01T09:00:00.000+0000",log:[{a:"created",at:"2026-10-01T09:00:00.000Z",by:"u_x",byName:"Tester"}],...extra});
  w("orders/6900001.json",order("6900001","Order",{extraDisc:5,legacyTotals:{sub:58330},usage:[[1,3]]}));
  w("orders/6900002.json",order("6900002","Quote",{customerId:404}));
  w("lines/6900001.json",{items:[{k:"a",t:1,pid:1,code:"M18",list:24000,qty:3,days:2,disc:60,legacyAmount:57600},{k:"b",t:5,crewId:500,code:"G01",list:3000,qty:1,days:1,ot:2,otRate:400}]});
  w("lines/6900002.json",{items:[{k:"a",t:4,pid:3,list:9000,qty:1,days:1},{k:"c1",t:4,pid:2,list:150,qty:4,days:1,parent:"a"}]});
}

module.exports={writeFixture,syntheticId};
