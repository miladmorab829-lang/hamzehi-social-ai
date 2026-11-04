// PHASE 22.3 — no live commercial value changes without the owner's bound approval: import price rows, commercial facts and rules, the bulk
// approve, sales-knowledge Apply, deposit and payment settings. confirm_commercial and approved_by prove nothing. Non-commercial knowledge
// imports keep working, and a refused attempt changes no data. Local only: in-process mocks, fake test products; nothing reaches Production.
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase22_3");
const W=await makeWorld({aiBrain:"off"});const {q,dbrun,call}=W;
await call("/api/quotes",null,"GET");await call("/api/si/knowledge/setting",null,"GET");await call("/api/sales-knowledge",null,"GET");
const T="2026-10-01T00:00:00.000Z";
const tables=()=>q("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").map(r=>r.name);
const skip=new Set(["api_rate_limits"]);
const snap=()=>JSON.stringify(tables().filter(n=>!skip.has(n)).map(n=>[n,q(`SELECT * FROM "${n}" ORDER BY rowid`)]));
const anon=(path,body)=>W.run(new Request("https://w.test"+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}));
const REVIEW="/api/owner-knowledge/items/review",BULK="/api/owner-knowledge/imports/approve-parsed";
const PRICE=(id,key,market,currency,unit,version=1,active=1,name="علبة اختبار")=>dbrun("INSERT INTO commercial_price_items(id,product_key,product_name,sku,market,currency,unit_price_minor,moq,version,active,effective_from,effective_until,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,key,name,null,market,currency,unit,null,version,active,null,null,"admin",T,T,T]);
const IMPORT=id=>dbrun("INSERT INTO owner_knowledge_imports(id,content_hash,client_request_id,market,status,summary_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",[id,"h-"+id,"c-"+id,"IRAN","analyzed","{}",T,T]);
let seq=0;
const ITEM=(imp,id,o={})=>{dbrun("INSERT INTO owner_knowledge_import_items(id,import_id,seq,item_type,parse_status,review_status,product_key,product_name,market,currency,price_minor,fact_domain,fact_attribute,fact_value_json,issues_json,history_json,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  [id,imp,++seq,o.type||"price_row",o.parse||"parsed",o.review||"pending_review",o.key??null,o.name??null,o.market||"IRAN",o.currency??null,o.price??null,o.domain??null,o.attr??null,o.value===undefined?null:JSON.stringify(o.value),"[]","[]",1,T,o.updated||T]);return id;};
const priceItem=(imp,id,key,price)=>ITEM(imp,id,{key,name:"علبة اختبار",currency:"TOMAN",price});
const live=key=>q("SELECT unit_price_minor u,version v,active a FROM commercial_price_items WHERE product_key=? ORDER BY version",[key]);
const item=id=>q("SELECT review_status s,version v,issues_json i,result_ref r FROM owner_knowledge_import_items WHERE id=?",[id])[0];
const preview=async(id,v=1)=>(await call(REVIEW+"/preview",{id,expected_version:v})).body;
const approve=(id,p,v=1,extra={})=>call(REVIEW,{id,action:"approve",expected_version:v,confirm_owner_approved:true,preview_hash:p.preview_hash,...extra});

// ---- unauthorized approval
IMPORT("I1");PRICE("P1","k1","IRAN","TOMAN",74800);priceItem("I1","A1","k1",88000);
{const before=snap();
 const a=await anon(REVIEW,{id:"A1",action:"approve",expected_version:1,confirm_commercial:true,confirm_owner_approved:true});
 const b=await anon(BULK,{import_id:"I1",confirm:true,confirm_owner_approved:true});
 const c=await anon(REVIEW+"/preview",{id:"A1",expected_version:1});
 const d=await anon("/api/sales-knowledge/preview",{id:"x"});
 ok("U1 every approval and preview route refuses a request with no admin token, whatever flags it carries",[a,b,c,d].every(r=>r.status===401),[a.status,b.status,c.status,d.status]);
 const wrong=await W.run(new Request("https://w.test"+REVIEW,{method:"POST",headers:{Authorization:"Bearer not-the-token","Content-Type":"application/json"},body:JSON.stringify({id:"A1",action:"approve",expected_version:1,confirm_commercial:true})}));
 ok("U2 a wrong token is refused too",wrong.status===401,wrong.status);
 const flag=await call(REVIEW,{id:"A1",action:"approve",expected_version:1,confirm_commercial:true});
 ok("U3 confirm_commercial alone cannot approve a price",flag.status===409&&flag.body.reason==="owner_approval_required",flag.body);
 const both=await call(REVIEW,{id:"A1",action:"approve",expected_version:1,confirm_commercial:true,confirm_owner_approved:true});
 ok("U4 a confirmation flag without the preview's hash cannot either",both.status===409,both.body);
 const made=await call(REVIEW,{id:"A1",action:"approve",expected_version:1,confirm_owner_approved:true,preview_hash:"0".repeat(64)});
 ok("U5 an invented hash is refused",made.status===409,made.body);
 const text=await call(REVIEW,{id:"A1",action:"approve",expected_version:1,confirm_owner_approved:"true",preview_hash:(await preview("A1")).preview_hash});
 ok("U6 the confirmation must be literal true",text.status===409,text.body);
 ok("U7 refused attempts change no row in any table",snap()===before);}

// ---- preview is read only and shows the live effect
{const before=snap(),p=await preview("A1");
 ok("V1 preview reports the live price it would replace and writes nothing",p.ok&&p.commercial&&p.effect==="price_replaced"&&p.current.unit_price_minor===74800&&p.proposed.price_minor===88000&&p.writes===0&&snap()===before,p);}

// ---- spoofed identity
{const p=await preview("A1");
 const r=await approve("A1",p,1,{approved_by:"someone-else",actor:"someone-else",reviewed_by:"someone-else"});
 const row=q("SELECT approved_by FROM commercial_price_items WHERE product_key='k1' AND version=2")[0];
 ok("L1 legitimate owner APPLY: the exact preview's hash applies the new price and keeps history",r.body.ok&&r.body.item.review_status==="applied"&&JSON.stringify(live("k1"))===JSON.stringify([{u:74800,v:1,a:0},{u:88000,v:2,a:1}]),[r.body,live("k1")]);
 ok("S1 approved_by in the request is ignored: import approval records the authenticated owner",row.approved_by==="admin"&&q("SELECT reviewed_by b FROM owner_knowledge_import_items WHERE id='A1'")[0].b==="admin",row);
 ok("L2 the approval is audited with its method",q("SELECT details_json d FROM system_events WHERE type='owner_knowledge_item_applied'").some(e=>JSON.parse(e.d).approval_method==="owner_preview"));
 const input={market:"IRAN",product_name:"علبة هوية",product_key:"k-id",currency:"TOMAN",unit_price_minor:1000,approved_by:"someone-else"};
 const pv=await call("/api/commercial-price-items/preview",input);
 const made=await call("/api/commercial-price-items",{...input,confirm_owner_approved:true,preview_hash:pv.body.preview_hash});
 ok("S2 the price list ignores approved_by from the request",made.body.ok&&made.body.item.approved_by==="admin",made.body);
 const noPreview=await call("/api/commercial-price-items",{...input,unit_price_minor:999,approved_by:"owner"});
 ok("S3 naming the owner in the request proves nothing",noPreview.status===409&&live("k-id").length===1,noPreview.body);}

// ---- stale preview
IMPORT("I2");PRICE("P2","k2","IRAN","TOMAN",5000);priceItem("I2","B1","k2",6000);
{const p=await preview("B1");dbrun("UPDATE commercial_price_items SET unit_price_minor=5500,updated_at=? WHERE id='P2'",[T.replace("2026","2027")]);
 const before=snap(),r=await approve("B1",p);
 ok("T1 a preview goes stale when the live price changes, and the stale attempt changes nothing",r.status===409&&/preview it again/.test(r.body.error)&&snap()===before,r.body);
 const p1=await preview("B1");const c=await call(REVIEW,{id:"B1",action:"correct",expected_version:1,corrections:{price_minor:7000}});
 const r2=await approve("B1",p1,2);
 ok("T2 a preview goes stale when the item is corrected",c.body.ok&&r2.status===409&&live("k2").length===1,r2.body);
 const k2=q("SELECT product_key k FROM owner_knowledge_import_items WHERE id='B1'")[0].k,p2=await preview("B1",2);PRICE("P2b",k2,"IRAN","TOMAN",5600,1,0);
 const r3=await approve("B1",p2,2);ok("T3 a preview goes stale when a new version lands, even an inactive one",r3.status===409,r3.body);
 const p3=await preview("B1",2),ok3=await approve("B1",p3,2);ok("T4 a fresh preview then works",ok3.body.ok&&q("SELECT unit_price_minor u FROM commercial_price_items WHERE product_key=? AND active=1",[k2])[0].u===7000,ok3.body);
 const old=await call(REVIEW+"/preview",{id:"B1",expected_version:1});ok("T5 preview refuses an out-of-date version",old.body.ok===false,old.body);}

// ---- bulk approval
IMPORT("I3");PRICE("P3","k3","IRAN","TOMAN",74800);PRICE("P4","k4","IRAN","TOMAN",1000);
priceItem("I3","C1","k3",88000);priceItem("I3","C2","k4",1000);priceItem("I3","C3","k5-new",2000);
ITEM("I3","C4",{type:"product_fact",name:"علبة حقيقة",domain:"size",attr:"available_size",value:"5x5"});
ITEM("I3","C5",{type:"rule",domain:"discount",attr:"rule",value:"10% above 1000"});
ITEM("I3","C6",{key:"k6",name:"بلا سعر"});
{const before=snap(),oldStyle=await call(BULK,{import_id:"I3",confirm_commercial:true});
 ok("K1 the old confirm_commercial bulk call is refused outright and changes nothing",oldStyle.status===400&&snap()===before,oldStyle.body);
 const pv=(await call(BULK+"/preview",{import_id:"I3"})).body,by=Object.fromEntries(pv.items.map(i=>[i.id,i]));
 ok("K2 bulk preview writes nothing and lists effect per item",pv.ok&&pv.writes===0&&snap()===before&&by.C2?.effect==="price_unchanged"&&by.C3?.effect==="price_new"&&by.C3.commercial===true,pv);
 ok("K3 a row that would replace a live price, and a rule, are not offered in bulk, even with no stored issue",!by.C1&&!by.C5&&pv.held.map(x=>x.id).sort().join()==="C1,C5",pv.held);
 const r=await call(BULK,{import_id:"I3",confirm:true,confirm_commercial:true});
 ok("K4 bulk without the owner's hashes applies only non-commercial items and adds no price",r.body.ok&&r.body.applied===3&&item("C2").s==="applied"&&item("C4").s==="applied"&&item("C6").s==="applied"&&live("k5-new").length===0&&item("C3").s==="pending_review"&&item("C3").v===1,r.body);
 ok("K5 the item that needs the owner is reported, and the live price it could not touch stays",r.body.held.some(x=>x.id==="C3"&&x.reason==="owner_preview_required")&&JSON.stringify(live("k3"))===JSON.stringify([{u:74800,v:1,a:1}]),r.body.held);
 const pv2=(await call(BULK+"/preview",{import_id:"I3"})).body,c3=pv2.items.find(i=>i.id==="C3");
 const stale=await call(BULK,{import_id:"I3",confirm:true,confirm_owner_approved:true,approved:[{id:"C3",item_hash:"f".repeat(64)}]});
 ok("K6 a wrong hash in bulk is refused for that item, untouched",stale.body.held.some(x=>x.id==="C3"&&x.reason==="stale_preview")&&item("C3").v===1&&live("k5-new").length===0,stale.body);
 const flagOnly=await call(BULK,{import_id:"I3",confirm:true,approved:[{id:"C3",item_hash:c3.item_hash}]});
 ok("K7 a hash without the owner's confirmation is not enough",flagOnly.body.held.some(x=>x.id==="C3")&&live("k5-new").length===0,flagOnly.body);
 const good=await call(BULK,{import_id:"I3",confirm:true,confirm_owner_approved:true,approved:[{id:"C3",item_hash:c3.item_hash}]});
 ok("K8 legitimate bulk APPLY with the previewed hash adds the new price",good.body.ok&&good.body.applied===1&&live("k5-new").length===1&&item("C3").s==="applied",good.body);
 const again=await call(BULK,{import_id:"I3",confirm:true,confirm_owner_approved:true,approved:[{id:"C3",item_hash:c3.item_hash}]});
 ok("K9 repeating the bulk call is idempotent",again.body.ok&&again.body.applied===0&&live("k5-new").length===1,again.body);}
IMPORT("I4");priceItem("I4","D1","k7",100);priceItem("I4","D2","k7",200);
{const pv=(await call(BULK+"/preview",{import_id:"I4"})).body;
 const r=await call(BULK,{import_id:"I4",confirm:true,confirm_owner_approved:true,approved:pv.items.map(i=>({id:i.id,item_hash:i.item_hash}))});
 ok("K10 two rows for one product cannot both go live from one preview: the second is stale, not applied",r.body.applied===1&&r.body.failed===1&&live("k7").length===1&&item("D2").s==="pending_review"&&item("D2").v===1,r.body);}
IMPORT("I5");PRICE("P5","k8","IRAN","TOMAN",300);priceItem("I5","E1","k8",300);
{const pv=(await call(BULK+"/preview",{import_id:"I5"})).body;dbrun("UPDATE commercial_price_items SET unit_price_minor=350 WHERE id='P5'");
 const r=await call(BULK,{import_id:"I5",confirm:true});
 ok("K11 a row that was unchanged at preview but differs now is not silently applied",pv.items[0].effect==="price_unchanged"&&item("E1").s==="pending_review"&&live("k8")[0].u===350&&JSON.stringify(live("k8"))===JSON.stringify([{u:350,v:1,a:1}]),r.body);}
IMPORT("I6");ITEM("I6","F1",{key:"k9",name:"علبة اختبار",currency:"TOMAN",price:900,review:"approved"});
{const before=snap(),r=await call(BULK,{import_id:"I6",confirm:true});
 ok("K12 an interrupted 'approved' item cannot resume a price without the owner's hash",r.body.held.some(x=>x.id==="F1"&&x.reason==="owner_preview_required")&&snap()===before,r.body);
 const pv=(await call(BULK+"/preview",{import_id:"I6"})).body,g=await call(BULK,{import_id:"I6",confirm:true,confirm_owner_approved:true,approved:pv.items.map(i=>({id:i.id,item_hash:i.item_hash}))});
 ok("K13 with it the interrupted item finishes once",g.body.applied===1&&live("k9").length===1&&item("F1").s==="applied",g.body);}

// ---- commercial facts
IMPORT("I7");
const R1=ITEM("I7","G1",{type:"rule",domain:"discount",attr:"rule",value:"5% above 2000"}),R2=ITEM("I7","G2",{type:"rule",domain:"quantity",attr:"quantity_rule",value:"minimum 500"});
const F1=ITEM("I7","G3",{type:"product_fact",name:"علبة حقيقة",domain:"size",attr:"available_size",value:"6x6"});
const facts=()=>q("SELECT COUNT(*) n FROM sales_knowledge_facts")[0].n,reqs=()=>q("SELECT COUNT(*) n FROM sales_knowledge_change_requests")[0].n;
{const before=snap(),a=await call(REVIEW,{id:R1,action:"approve",expected_version:1}),b=await call(REVIEW,{id:R1,action:"approve",expected_version:1,confirm_commercial:true});
 ok("C1 an imported discount rule, which used to need no confirmation at all, is refused without the owner's hash",a.status===409&&b.status===409&&snap()===before,[a.body,b.body]);
 const p=await preview(R1);ok("C2 preview marks it commercial and writes nothing",p.commercial&&p.effect==="commercial_fact"&&snap()===before,p);
 const n=facts(),r=await approve(R1,p);ok("C3 with the owner's approval the rule is applied",r.body.ok&&r.body.item.review_status==="applied"&&facts()===n+1,r.body);
 const p2=await preview(R2);dbrun("INSERT INTO sales_knowledge_facts(id,fact_key,domain,entity_type,entity_key,attribute,market,member_key,value_json,value_hash,version,status,authority,source_type,change_request_id,approved_by,approved_at,created_at,updated_at) VALUES('X1','x1','quantity','business','global','quantity_rule','IRAN','','\"other\"','hx',1,'active','owner_approved','owner_form','x-req','admin',?,?,?)",[T,T,T]);
 const before2=snap(),r2=await approve(R2,p2);ok("C4 a commercial fact preview goes stale when a live fact in that slot appears",r2.status===409&&snap()===before2,r2.body);
 const n2=reqs(),ok2=await call(REVIEW,{id:F1,action:"approve",expected_version:1});
 ok("C5 a non-commercial fact keeps working with no preview and no flag",ok2.body.ok&&ok2.body.item.review_status==="applied"&&reqs()===n2+1,ok2.body);}
{const body={id:"sk-commercial",operation:"ADD",domain:"shipping",entity_type:"business",entity_key:"global",attribute:"note",market:"GLOBAL",value:"free above 1000"};
 const fields=q("SELECT 1 x")&&(await call("/api/sales-knowledge",null,"GET")).body.fields,attr=Object.keys(fields.shipping||{})[0],kind=fields.shipping?.[attr];
 const p=await call("/api/sales-knowledge/propose",{...body,attribute:attr,value:kind==="number"?7:"free above 1000"});
 const row=q("SELECT * FROM sales_knowledge_change_requests WHERE id='sk-commercial'")[0];
 ok("C6 a commercial proposal is classed commercial",p.body.ok&&row?.sensitivity==="commercial",p.body);
 await call("/api/sales-knowledge/review",{id:row.id,decision:"approve",proposal_hash:row.proposal_hash,confirm_sensitive:true});
 const before=snap(),a=await call("/api/sales-knowledge/apply",{id:row.id,proposal_hash:row.proposal_hash,confirm_apply:true});
 ok("C7 sales-knowledge Apply of a commercial fact is refused without the preview, whatever confirm_apply says",a.status===409&&a.body.reason==="owner_approval_required"&&snap()===before,a.body);
 const pv=(await call("/api/sales-knowledge/preview",{id:row.id})).body;
 ok("C8 its preview writes nothing",pv.ok&&pv.requires_owner_approval&&pv.writes===0&&snap()===before,pv);
 const g=await call("/api/sales-knowledge/apply",{id:row.id,proposal_hash:row.proposal_hash,confirm_apply:true,confirm_owner_approved:true,preview_hash:pv.preview_hash});
 ok("C9 with the preview it applies",g.body.ok&&g.body.request.status==="applied",g.body);
 const again=await call("/api/sales-knowledge/apply",{id:row.id,proposal_hash:row.proposal_hash,confirm_apply:true});
 ok("C10 retrying an applied proposal stays idempotent",again.body.ok,again.body);}

// ---- deposit and payment settings
const K=k=>`/api/si/knowledge/${k}`;
{const dep={setting_key:"deposit_percent",scope:{market:"ARAB"},value:50},pay={setting_key:"payment_instructions",scope:{market:"ARAB"},value:"test only"};
 const count=()=>q("SELECT COUNT(*) n FROM business_settings")[0].n,n=count();
 const a=await call(K("setting"),{input:dep}),b=await call(K("setting"),{input:pay}),c=await call(K("setting"),{input:dep,confirm_commercial:true,approved_by:"owner"});
 ok("D1 deposit and payment settings cannot be saved without the owner's preview",[a,b,c].every(r=>r.body.ok===false)&&count()===n,[a.body,b.body,c.body]);
 const p=(await call(K("setting")+"/preview",{input:dep})).body;
 ok("D2 the preview requires owner approval and writes nothing",p.requires_owner_approval===true&&p.writes===0&&count()===n,p);
 const other=await call(K("setting"),{input:{...dep,value:60},confirm_owner_approved:true,preview_hash:p.preview_hash});
 ok("D3 a preview of 50% cannot be used to save 60%",other.body.ok===false&&count()===n,other.body);
 const g=await call(K("setting"),{input:dep,confirm_owner_approved:true,preview_hash:p.preview_hash});
 ok("D4 the previewed deposit saves",g.body.ok&&count()===n+1,g.body);
 const row=q("SELECT id FROM business_settings WHERE setting_key='deposit_percent' AND status='current'")[0];
 const r=await call(K("setting")+"/retire",{id:row.id});ok("D5 retiring a deposit needs the owner too",r.body.ok===false&&q("SELECT status FROM business_settings WHERE id=?",[row.id])[0].status==="current",r.body);}
{const D=(id,payload)=>dbrun("INSERT INTO owner_decisions(id,status,decision_type,fingerprint,market,product_key,question,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",[id,"PENDING","PAYMENT_TERMS","fp-"+id,"ARAB",null,"q",JSON.stringify(payload),T,T]);
 D("Z1",{resolution:"setting",setting_key:"deposit_percent",scope:{market:"ARAB"}});
 const n=q("SELECT COUNT(*) c FROM business_settings")[0].c,flat=await call("/api/si/decisions/resolve",{id:"Z1",action:"ANSWER",scope:"SAVE_AS_KNOWLEDGE",answer:{value:30}});
 ok("D6 a decision cannot save a deposit without the preview",flat.body.ok===false&&q("SELECT COUNT(*) c FROM business_settings")[0].c===n,flat.body);
 const pv=(await call("/api/si/decisions/preview",{id:"Z1",action:"ANSWER",scope:"SAVE_AS_KNOWLEDGE",answer:{value:30}})).body;
 const g=await call("/api/si/decisions/resolve",{id:"Z1",action:"ANSWER",scope:"SAVE_AS_KNOWLEDGE",answer:{value:30},confirm_owner_approved:true,preview_hash:pv.preview_hash});
 ok("D7 with the preview it saves, and a case-only answer still needs no preview",pv.writes_catalog===true&&g.body.ok,g.body);}

// ---- concurrent changes
IMPORT("I8");PRICE("P8","k10","IRAN","TOMAN",1000);priceItem("I8","H1","k10",1100);
{const p=await preview("H1"),[a,b]=await Promise.all([approve("H1",p),approve("H1",p)]);
 const act=q("SELECT COUNT(*) n FROM commercial_price_items WHERE product_key='k10' AND active=1")[0].n;
 ok("R1 the same approval sent twice at once makes one price version, and one live price",live("k10").length===2&&act===1&&item("H1").s==="applied",[a.body,b.body,live("k10")]);}
{PRICE("P9","k11","IRAN","TOMAN",2000);const input=u=>({market:"IRAN",product_name:"علبة اختبار",product_key:"k11",currency:"TOMAN",unit_price_minor:u,base_id:"P9"});
 const p1=(await call("/api/commercial-price-items/preview",input(2100))).body,p2=(await call("/api/commercial-price-items/preview",input(2200))).body;
 const [a,b]=await Promise.all([call("/api/commercial-price-items",{...input(2100),confirm_owner_approved:true,preview_hash:p1.preview_hash}),call("/api/commercial-price-items",{...input(2200),confirm_owner_approved:true,preview_hash:p2.preview_hash})]);
 const act=q("SELECT COUNT(*) n FROM commercial_price_items WHERE product_key='k11' AND active=1")[0].n;
 ok("R2 two different concurrent price changes cannot both go live",[a,b].filter(r=>r.body.ok).length===1&&act===1,[a.body,b.body,live("k11")]);}
{PRICE("P10","k12","IRAN","TOMAN",3000);const p=(await call("/api/commercial-price-items/activation/preview",{id:"P10",active:false})).body;
 dbrun("UPDATE commercial_price_items SET updated_at='2027-01-01T00:00:00.000Z' WHERE id='P10'");
 const r=await call("/api/commercial-price-items/activation",{method:"PATCH",id:"P10",active:false,confirm_owner_approved:true,preview_hash:p.preview_hash},"PATCH");
 ok("R3 a price activation preview goes stale",r.status===409&&live("k12")[0].a===1,r.body);}

{IMPORT("I10");PRICE("P11","k13","IRAN","TOMAN",4000);priceItem("I10","J1","k13",4100);
 const p=await preview("J1"),real=W.env.DB.batch.bind(W.env.DB);let injected=false;
 W.env.DB.batch=async s=>{if(!injected){injected=true;PRICE("P11b","k13","IRAN","TOMAN",4050,2,0);}return real(s);};
 const r=await approve("J1",p);W.env.DB.batch=real;
 const rows=live("k13"),it=q("SELECT review_status s,reviewed_by b,issues_json i FROM owner_knowledge_import_items WHERE id='J1'")[0];
 ok("R4 a version that lands in the last moment before the write stops the import: no third row, base price stays live",r.body.ok===false&&rows.length===2&&rows[0].a===1&&rows[0].u===4000,[r.body,rows]);
 ok("R5 the failed item returns to review, keeps no reviewer and records why",it.s==="pending_review"&&it.b===null&&/apply_failed/.test(it.i),it);}
{IMPORT("I11");priceItem("I11","M1","k14",100);priceItem("I11","M2","k15",200);
 const pv=(await call(BULK+"/preview",{import_id:"I11"})).body,[a,b]=pv.items;
 const r=await call(BULK,{import_id:"I11",confirm:true,confirm_owner_approved:true,approved:[{id:a.id,item_hash:b.item_hash},{id:b.id,item_hash:a.item_hash}]});
 ok("K14 hashes swapped between items are refused for both",r.body.applied===0&&r.body.held.filter(x=>x.reason==="stale_preview").length===2&&live("k14").length===0,r.body);}
{const before=q("SELECT COUNT(*) n FROM business_settings")[0].n,bad=await call(K("setting")+"/preview",{input:{setting_key:"deposit_percent",scope:{market:"IRAN"},value:150}});
 ok("D8 an out-of-range deposit is refused at preview",bad.body.ok===false&&q("SELECT COUNT(*) n FROM business_settings")[0].n===before,bad.body);
 const pa=(await call(K("setting")+"/preview",{input:{setting_key:"deposit_percent",scope:{market:"ARAB"},value:40}})).body;
 const cross=await call(K("setting"),{input:{setting_key:"deposit_percent",scope:{market:"IRAN"},value:40},confirm_owner_approved:true,preview_hash:pa.preview_hash});
 ok("D9 an approval for one market cannot save the other market",cross.body.ok===false,cross.body);}
{const D=(id,payload)=>dbrun("INSERT INTO owner_decisions(id,status,decision_type,fingerprint,market,product_key,question,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",[id,"PENDING","PAYMENT_TERMS","fp-"+id,"ARAB",null,"q",JSON.stringify(payload),T,T]);
 D("Z2",{resolution:"setting",setting_key:"deposit_percent",scope:{market:"ARAB"}});
 const a={id:"Z2",action:"ANSWER",scope:"SAVE_AS_KNOWLEDGE",answer:{value:20}},pv=(await call("/api/si/decisions/preview",a)).body;
 const input={setting_key:"deposit_percent",scope:{market:"ARAB"},value:25},p=(await call(K("setting")+"/preview",{input})).body;await call(K("setting"),{input,confirm_owner_approved:true,preview_hash:p.preview_hash});
 const r=await call("/api/si/decisions/resolve",{...a,confirm_owner_approved:true,preview_hash:pv.preview_hash});
 ok("X1 a decision preview goes stale when the live setting it would replace changes",r.body.ok===false&&q("SELECT status s FROM owner_decisions WHERE id='Z2'")[0].s==="PENDING"&&JSON.parse(q("SELECT value_json v FROM business_settings WHERE setting_key='deposit_percent' AND scope_key='market:ARAB' AND status='current'")[0].v)===25,r.body);}
{const fs=await import("node:fs"),src=fs.readFileSync(new URL("../../worker/src/index.js",import.meta.url),"utf8"),si=fs.readFileSync(new URL("../../worker/src/sales-intelligence.js",import.meta.url),"utf8");
 ok("S4 no route reads approved_by or confirm_commercial from a request body any more",!["b.approved_by","b?.approved_by","body.approved_by","confirm_commercial"].some(x=>(src+si).includes(x)));}

// ---- pending backlog
{IMPORT("I9");const shape=[];for(let i=0;i<116;i++)shape.push(priceItem("I9","pp"+i,"pk"+(i%7),1000+i));for(let i=0;i<74;i++)shape.push(ITEM("I9","pf"+i,{type:"product_fact",name:"علبة "+i,domain:"size",attr:"available_size",value:"5x"+i}));
 for(let i=0;i<6;i++)shape.push(ITEM("I9","pr"+i,{type:"rule",domain:"discount",attr:"rule",value:"r"+i}));for(let i=0;i<36;i++)shape.push(ITEM("I9","pu"+i,{type:"unparsed",parse:"ambiguous"}));
 const rows=()=>JSON.stringify(q("SELECT * FROM owner_knowledge_import_items WHERE import_id='I9' ORDER BY seq")),before=rows(),count=q("SELECT COUNT(*) n FROM owner_knowledge_import_items WHERE import_id='I9' AND review_status='pending_review'")[0].n;
 await call(BULK+"/preview",{import_id:"I9"});await call(BULK,{import_id:"I9",confirm_commercial:true});
 for(const id of ["pp0","pr0"])await call(REVIEW,{id,action:"approve",expected_version:1,confirm_commercial:true});
 ok("B1 a 232-item backlog is untouched by preview and by every refused approval",count===232&&rows()===before,count);}
done();
