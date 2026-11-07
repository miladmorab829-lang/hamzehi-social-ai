// PHASE 25I — an owner-confirmed test order. Classification is one guarded write on the lead; nothing financial changes and the Worker
// has no route that can write it. Every exclusion has a control: a real order that keeps counting. Synthetic data only.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase25_4");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const MIG=fs.readFileSync(path.join(REPO,"owner-actions/phase25-delete-system/01-migration.sql"),"utf8");
const ORCH=fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8");
const {cleanupContextFrom,cleanupContextFromMessage,cleanupLeadContextFrom,CONTEXT_UNKNOWN}=await import(pathToFileURL(path.join(SRC,"cleanup-center.js")).href);
const OLD=new Date(Date.now()-30*86400000).toISOString(),ORDER_ASK="سفارشم کجاست؟";
const TS="strftime('%Y-%m-%dT%H:%M:%fZ','now')";

// The operation the owner authorizes later, word for word. The ids are the only difference from the Production statements.
const classifySql=(lead,order)=>[`UPDATE leads SET notes=json_set(notes,'$.data_class','test','$.test_order_classification',json_object('order_id','${order}','confirmed_by','owner','confirmed_at',${TS},'reason','owner_confirmed_synthetic_order'))
 WHERE id='${lead}' AND json_valid(notes) AND json_extract(notes,'$.data_class') IS NULL AND json_extract(notes,'$.test_order_classification') IS NULL
 AND EXISTS(SELECT 1 FROM lead_orders o WHERE o.id='${order}' AND o.lead_id=leads.id AND o.status='paid' AND o.shipped_at IS NULL AND o.delivered_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM lead_orders x WHERE x.lead_id=leads.id AND x.id<>'${order}' AND x.status<>'cancelled')
 AND NOT EXISTS(SELECT 1 FROM lead_order_payments p WHERE p.lead_id=leads.id AND p.order_id<>'${order}')`,
 `INSERT OR IGNORE INTO system_events(id,type,severity,message,details_json,created_at) SELECT 'test-order-classified:${order}:'||json_extract(notes,'$.test_order_classification.confirmed_at'),'test_order_classified','info','Owner confirmed a test order; financial records unchanged',json_object('order_id','${order}','lead_id','${lead}'),${TS}
 FROM leads WHERE id='${lead}' AND json_valid(notes) AND json_extract(notes,'$.test_order_classification.order_id')='${order}'`];
const restoreSql=(lead,order)=>[`INSERT OR IGNORE INTO system_events(id,type,severity,message,details_json,created_at) SELECT 'test-order-restored:${order}:'||json_extract(notes,'$.test_order_classification.confirmed_at'),'test_order_classification_removed','info','Owner removed a test order classification',json_object('order_id','${order}','lead_id','${lead}'),${TS}
 FROM leads WHERE id='${lead}' AND json_valid(notes) AND json_extract(notes,'$.test_order_classification.order_id')='${order}'`,
 `UPDATE leads SET notes=json_remove(notes,'$.data_class','$.test_order_classification') WHERE id='${lead}' AND json_valid(notes) AND json_extract(notes,'$.test_order_classification.order_id')='${order}'`];
const batch=(W,sqls)=>W.env.DB.batch(sqls.map(s=>W.env.DB.prepare(s)));
const classify=async(W,a,order=a.o)=>Number((await batch(W,classifySql(a.l,order)))[0].meta?.changes||0);
const unclassify=async(W,a,order=a.o)=>Number((await batch(W,restoreSql(a.l,order)))[1].meta?.changes||0);

const world=async({ai=false}={})=>{const W=await makeWorld({aiBrain:ai?"on":"off",extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on"}});W.d1.db.exec(ORCH);
 for(const p of ["/api/quotes","/api/si/knowledge/product","/api/owner-escalations","/api/leads/outreach","/api/content/pipeline","/api/orders"])await W.call(p,null,"GET");W.d1.db.exec(MIG);
 W.old=async(id,country="iran",text="سلام")=>{const u={id,name:"U"+id,username:"u"+id};await W.send(u,text);W.setMarket(u,country);const r=W.q("SELECT id,lead_id l,conversation_id c FROM inbox_messages WHERE provider_sender_id=? ORDER BY created_at LIMIT 1",[String(id)])[0];
  W.dbrun("UPDATE inbox_messages SET created_at=? WHERE lead_id=?",[OLD,r.l]);W.dbrun("UPDATE lead_outreach SET status='sent',sent_at=?,created_at=? WHERE lead_id=?",[OLD,OLD,r.l]);return {...r,u};};
 W.order=(r,status,{total=5000,market="IRAN",currency="TOMAN",sfx="o"}={})=>{const cols=W.q("SELECT name,\"notnull\" nn,dflt_value d,type FROM pragma_table_info('lead_orders')").filter(c=>c.nn&&c.d===null),o={id:"ord"+r.u.id+sfx,lead_id:r.l,conversation_id:r.c,status,market,currency,total_minor:total,acceptance_inbox_message_id:sfx==="o"?r.id:null,created_at:OLD,updated_at:OLD};
  for(const c of cols)if(!(c.name in o))o[c.name]=/INT|REAL/.test(c.type)?1:"x"+r.u.id+sfx;const k=Object.keys(o);W.dbrun(`INSERT INTO lead_orders(${k.join(",")}) VALUES(${k.map(()=>"?").join(",")})`,k.map(x=>o[x]));return o.id;};
 W.pay=(r,order,amount,currency="TOMAN",sfx="1")=>W.dbrun("INSERT INTO lead_order_payments(id,order_id,lead_id,payment_kind,amount_minor,currency,method,reference,reference_key,recorded_by,recorded_at) VALUES(?,?,?,'full',?,?,'bank_transfer',?,?,'owner',?)",["pay"+order+sfx,order,r.l,amount,currency,"r"+sfx,"r"+sfx,OLD]);
 W.fact=(r,key,value)=>{const fc=W.q("SELECT name,\"notnull\" nn,dflt_value d,type FROM pragma_table_info('conversation_memory_facts')").filter(c=>c.nn&&c.d===null),f={id:"f-"+key+"-"+r.id,lead_id:r.l,conversation_id:r.c,source_message_id:r.id,memory_key:key,value_json:value,status:"active",created_at:OLD,updated_at:OLD};
  for(const c of fc)if(!(c.name in f))f[c.name]=/INT|REAL/.test(c.type)?1:"x";const k=Object.keys(f);W.dbrun(`INSERT INTO conversation_memory_facts(${k.join(",")}) VALUES(${k.map(()=>"?").join(",")})`,k.map(x=>f[x]));};
 W.trashRow=(id,c)=>{const cols=W.q("SELECT name,\"notnull\" nn,dflt_value d,type FROM pragma_table_info('cleanup_trash')").filter(k=>k.nn&&k.d===null),t={id,section:"context",record_id:c,state:"trashed",deleted_at:"2099-01-01T00:00:00.000Z",prior_json:"{}"};for(const k of cols)if(!(k.name in t))t[k.name]=/INT|REAL/.test(k.type)?1:"x";const ks=Object.keys(t);W.dbrun(`INSERT INTO cleanup_trash(${ks.join(",")}) VALUES(${ks.map(()=>"?").join(",")})`,ks.map(k=>t[k]));};
 return W;};
// three customers: the test order on `a` (with a cancelled one, like the real case), and two real orders in two markets
const three=async(W,base)=>{const a=await W.old(base+1),b=await W.old(base+2),c=await W.old(base+3,"iraq");
 a.o=W.order(a,"paid",{total:5000});W.pay(a,a.o,2500,"TOMAN","1");W.pay(a,a.o,2500,"TOMAN","2");a.x=W.order(a,"cancelled",{total:9000,sfx:"x"});
 b.o=W.order(b,"paid",{total:3000});W.pay(b,b.o,3000);c.o=W.order(c,"paid",{total:700,market:"ARAB",currency:"USD"});W.pay(c,c.o,700,"USD");
 for(const r of [a,b,c])W.dbrun("UPDATE leads SET stage='customer',notes=json_set(notes,'$.ad_target',1) WHERE id=?",[r.l]);return {a,b,c};};
const get=async(W,p)=>(await W.call(p,null,"GET")).body;
const metrics=async W=>{const si=await get(W,"/api/sales/intelligence"),cv=await get(W,"/api/sales/conversion"),fn=await get(W,"/api/leads/funnel"),au=await get(W,"/api/autonomy/revenue"),ad=await get(W,"/api/ads/overview"),ov=await get(W,"/api/leads/overview"),ai=await get(W,"/api/ads/intelligence"),as=await get(W,"/api/ads/autopilot/status");
 const m=k=>si.markets[k],s=k=>cv.conversion.summary[k];
 return {iran_orders:m("IRAN").orders,iran_value:m("IRAN").order_value_minor,iran_paid:m("IRAN").payments_received_minor,iran_outstanding:m("IRAN").outstanding_minor,iran_customers:m("IRAN").customers,iran_leads:m("IRAN").leads,iran_funnel_orders:m("IRAN").revenue.orders,iran_discovered:m("IRAN").revenue.discovered,
  arab_orders:m("ARAB").orders,arab_value:m("ARAB").order_value_minor,arab_paid:m("ARAB").payments_received_minor,conv_received:s("IRAN").revenue.received_minor,conv_orders:s("IRAN").confirmed_orders,
  funnel_paid:fn.evidence.paid,funnel_ordered:fn.evidence.ordered,funnel_leads:fn.total_leads,funnel_reconciled:fn.reconciled,auto_conversions:au.conversions,auto_customers:au.funnel.customer||0,ad_customers:ad.metrics.customers,ov_converted:ov.converted,ov_contacted:ov.contacted,ov_total:ov.total,ov_stage:ov.stages.customer||0,ov_state:ov.qualification.CUSTOMER,ov_tiers:Object.values(ov.tiers).reduce((x,y)=>x+y,0),ov_priorities:Object.values(ov.priorities).reduce((x,y)=>x+y,0),ov_test:ov.test_records.leads,ms_iran:ov.market_summary.IRAN.customers,ms_arab:ov.market_summary.ARAB.customers,ai_customer:ai.funnel.customer,ai_total:ai.metrics.total,as_customers:as.metrics.customers,ad_iran:ad.by_market.IRAN?.customers||0,ad_arab:ad.by_market.ARAB?.customers||0,test:m("IRAN").test_records};};
const hash=(W,tables)=>JSON.stringify(tables.map(t=>W.q(`SELECT * FROM ${t} ORDER BY id`)));
const EVIDENCE=["lead_orders","lead_order_payments","inbox_messages","owner_decisions","owner_escalations","lead_outreach"];
const n=(W,sql,a=[])=>W.q(sql,a)[0].n;
const sends=(W,id)=>W.tg.filter(x=>{if(x.method!=="sendMessage")return false;try{return String(JSON.parse(x.body).chat_id)===String(id);}catch{return false;}}).length;

// 1. before and after, every report, with real controls
{const W=await world();const {a,b,c}=await three(W,20000);const before=await metrics(W);
 ok("A1 control: before classification the test order counts",before.iran_orders===2&&before.iran_value===8000&&before.iran_paid===8000&&before.iran_customers===2&&before.funnel_paid===3&&before.auto_conversions===3&&before.ad_customers===3&&before.ov_converted===3,before);
 const orders0=(await get(W,"/api/orders")).items;ok("A2 control: no order is marked as test yet",orders0.every(o=>Number(o.test_record)===0),orders0.map(o=>o.test_record));
 const ev0=hash(W,EVIDENCE),notes0=W.q("SELECT notes,stage,name,contact,updated_at FROM leads WHERE id=?",[a.l])[0];
 const other0=JSON.stringify(W.q("SELECT * FROM leads WHERE id IN (?,?)",[b.l,c.l])),sys0=W.q("SELECT id FROM system_events").length;
 ok("A3 the write changes exactly one row",await classify(W,a)===1);
 const after=await metrics(W);
 ok("A4 order value and count exclude it, the real order stays",after.iran_orders===1&&after.iran_value===3000,after);
 ok("A5 received excludes it, the real payment stays",after.iran_paid===3000&&after.conv_received===3000,after);
 ok("A7 the cancelled order did not come back",after.iran_orders===1);
 ok("A8 the other market is untouched",after.arab_orders===1&&after.arab_value===700&&after.arab_paid===700,after);
 ok("A9 customer counts exclude it",after.iran_customers===1&&after.auto_customers===2&&after.auto_conversions===2&&after.ad_customers===2&&after.ov_converted===2,after);
 ok("A10 market lead count excludes it",after.iran_leads===before.iran_leads-1,after);
 ok("A11 funnel excludes it and still reconciles",after.funnel_paid===2&&after.funnel_ordered===before.funnel_ordered-1&&after.funnel_leads===before.funnel_leads-1&&after.funnel_reconciled===true,after);
 ok("A12 conversion metrics exclude it",after.ov_contacted===before.ov_contacted-1&&after.conv_orders===before.conv_orders-1,{b:before.conv_orders,a:after.conv_orders});
 ok("A12a the market revenue summary excludes the lead and its order",after.iran_discovered===before.iran_discovered-1&&after.iran_funnel_orders===before.iran_funnel_orders-1,{b:before.iran_funnel_orders,a:after.iran_funnel_orders});
 ok("A12b the CRM overview agrees with itself",after.ov_total===before.ov_total-1&&after.ov_stage===before.ov_stage-1&&after.ov_state===before.ov_state-1&&after.ov_tiers===before.ov_tiers-1&&after.ov_priorities===before.ov_priorities-1&&after.ov_test===1,after);
 ok("A12c the market summary excludes it, the other market stays",after.ms_iran===before.ms_iran-1&&after.ms_arab===before.ms_arab&&before.ms_arab===1,{b:before.ms_iran,a:after.ms_iran,arab:after.ms_arab});
 ok("A12d the ads intelligence funnel excludes it",after.ai_customer===before.ai_customer-1&&after.ai_total===before.ai_total-1,{b:before.ai_customer,a:after.ai_customer});
 ok("A12e the ads status count excludes it",after.as_customers===before.as_customers-1,{b:before.as_customers,a:after.as_customers});
 ok("A12f the per-market ad figure excludes it, the other market stays",after.ad_iran===before.ad_iran-1&&after.ad_arab===before.ad_arab&&before.ad_iran===2,{b:before.ad_iran,a:after.ad_iran});
 ok("A13 the excluded amount stays visible, on its own",after.test.leads===1&&after.test.orders===1&&after.test.order_value_minor===5000&&after.test.payments_recorded_minor===5000,after.test);
 const orders=(await get(W,"/api/orders")).items;ok("A14 the order stays listed, marked as test, with its paid amount",orders.find(o=>o.id===a.o)?.test_record===1&&orders.find(o=>o.id===a.o)?.paid_minor===5000&&orders.find(o=>o.id===a.o)?.status==="paid",orders.find(o=>o.id===a.o));
 ok("A15 only that lead's orders are marked",orders.find(o=>o.id===b.o)?.test_record===0&&orders.find(o=>o.id===c.o)?.test_record===0);
 ok("E1 orders, payments, messages, decisions, escalations and outreach are byte-identical",hash(W,EVIDENCE)===ev0);
 const l=W.q("SELECT notes,stage,name,contact FROM leads WHERE id=?",[a.l])[0],m0=JSON.parse(notes0.notes),m1=JSON.parse(l.notes);
 ok("E2 the lead keeps its stage, name and contact",l.stage===notes0.stage&&l.name===notes0.name&&l.contact===notes0.contact);
 ok("E3 every earlier note survives",Object.keys(m0).every(k=>JSON.stringify(m0[k])===JSON.stringify(m1[k])),m1);
 ok("E4 only the two classification keys were added",Object.keys(m1).filter(k=>!(k in m0)).sort().join()==="data_class,test_order_classification",Object.keys(m1));
 ok("E5 the record names the order, the owner and the time",m1.test_order_classification.order_id===a.o&&m1.test_order_classification.confirmed_by==="owner"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(m1.test_order_classification.confirmed_at),m1.test_order_classification);
 ok("E6 other leads are byte-identical",JSON.stringify(W.q("SELECT * FROM leads WHERE id IN (?,?)",[b.l,c.l]))===other0);
 ok("E7 one audit row was added",W.q("SELECT id FROM system_events").length===sys0+1&&n(W,"SELECT COUNT(*) n FROM system_events WHERE type='test_order_classified' AND details_json LIKE ?",["%"+a.o+"%"])===1);
 let blocked=0;try{W.dbrun("DELETE FROM lead_order_payments WHERE order_id=?",[a.o]);}catch{blocked++;}try{W.dbrun("UPDATE lead_order_payments SET amount_minor=0 WHERE order_id=?",[a.o]);}catch{blocked++;}ok("E8 payments stay append-only",blocked===2,blocked);

 // 2. restore and reclassification
 ok("R1 the restore changes exactly one row",await unclassify(W,a)===1);
 ok("R2 every metric returns exactly",JSON.stringify(await metrics(W))===JSON.stringify({...before,test:{...before.test}}),await metrics(W));
 ok("R3 the notes return exactly",JSON.stringify(JSON.parse(W.q("SELECT notes FROM leads WHERE id=?",[a.l])[0].notes))===JSON.stringify(m0));
 ok("R3a the row returns byte for byte, with its old update time",JSON.stringify(W.q("SELECT notes,stage,name,contact,updated_at FROM leads WHERE id=?",[a.l])[0])===JSON.stringify(notes0),W.q("SELECT notes,updated_at FROM leads WHERE id=?",[a.l])[0]);
 ok("R4 the evidence stays byte-identical",hash(W,EVIDENCE)===ev0);
 ok("R5 the restore is audited and the first audit row stays",n(W,"SELECT COUNT(*) n FROM system_events WHERE type='test_order_classification_removed'")===1&&n(W,"SELECT COUNT(*) n FROM system_events WHERE type='test_order_classified'")===1);
 ok("R6 a second restore changes nothing",await unclassify(W,a)===0&&n(W,"SELECT COUNT(*) n FROM system_events WHERE type='test_order_classification_removed'")===1);
 await new Promise(z=>setTimeout(z,5));
 ok("R7 it can be classified again",await classify(W,a)===1&&(await metrics(W)).iran_paid===3000);
 ok("R8 with its own audit row",n(W,"SELECT COUNT(*) n FROM system_events WHERE type='test_order_classified'")===2);}

// 3. snapshot
{const W=await world();const {a,b,c}=await three(W,20100);const src=()=>hash(W,["lead_orders","lead_order_payments"]),s0=src();
 const rows=()=>W.q("SELECT order_id o FROM revenue_attribution ORDER BY order_id").map(x=>x.o),paid=async()=>{const i=(await get(W,"/api/si/intelligence?dimension=market")).items;return Object.fromEntries(i.map(x=>[x.bucket,x.paid_minor]));};
 const rebuild=()=>W.call("/api/si/intelligence",{}).then(r=>r.body);
 await rebuild();ok("S1 control: a rebuild before classification holds the order",rows().includes(a.o),rows());
 ok("S2 control: and the report shows it",(await paid()).IRAN===8000,await paid());
 const cc=W.q("SELECT name,\"notnull\" nn,dflt_value d,type FROM pragma_table_info('draft_corrections')").filter(k=>k.nn&&k.d===null);for(const [x,pk] of [[a,"pa"],[b,"pb"]]){const o={outreach_id:"oc"+pk,lead_id:x.l,market:"IRAN",product_key:pk,change_kind:"tone",created_at:OLD,updated_at:OLD};for(const k of cc)if(!(k.name in o))o[k.name]=/INT|REAL/.test(k.type)?1:"x";const ks=Object.keys(o);W.dbrun(`INSERT INTO draft_corrections(${ks.join(",")}) VALUES(${ks.map(()=>"?").join(",")})`,ks.map(k=>o[k]));}
 const led=async()=>Object.fromEntries(((await get(W,"/api/si/corrections")).items||[]).map(x=>[x.product_key,x.led_to_paid]));const l0=await led();ok("S2a control: the corrections report counts both as paid",l0.pa===1&&l0.pb===1,l0);
 await classify(W,a);const l1=await led();ok("S2b a test order no longer counts as a paid outcome, the real one does",l1.pa===0&&l1.pb===1,l1);ok("S3 the old snapshot no longer reports it, without a rebuild",(await paid()).IRAN===3000,await paid());
 ok("S4 real orders stay in that report",(await paid()).ARAB===700,await paid());
 const r=await rebuild();ok("S5 a rebuild removes the row",!rows().includes(a.o)&&rows().includes(b.o)&&rows().includes(c.o)&&r.excluded_removed>=1,{r,rows:rows()});
 await rebuild();ok("S6 another rebuild does not bring it back",!rows().includes(a.o));
 ok("S7 orders and payments are unchanged by the rebuilds",src()===s0);
 await unclassify(W,a);await rebuild();ok("S8 after a restore a rebuild holds it again",rows().includes(a.o)&&(await paid()).IRAN===8000,rows());
 ok("S9 the source is still unchanged",src()===s0);}

// 4. the classification is a context boundary: no test context reaches a new reply, for that lead only
{const W=await world({ai:true});const mk=async(id,w)=>{const r=await W.old(id,"iran",w+"INBOUND");W.dbrun("UPDATE lead_outreach SET message=? WHERE lead_id=?",[w+"REPLY",r.l]);W.fact(r,"destination",JSON.stringify(w+"DEST"));W.fact(r,"customer_name",JSON.stringify(w+"NAME"));r.o=W.order(r,"paid");W.pay(r,r.o,5000);return r;};
 const live=await mk(20201,"ZZLIVE"),gone=await mk(20202,"ZZTEST");await classify(W,gone);
 const turn=async r=>{const k=W.AI.requests.length,x=await W.send(r.u,"جعبه جواهر دارید؟");return {p:JSON.stringify(W.AI.requests.slice(k).map(y=>y.body)),x};};const a=await turn(live),b=await turn(gone);
 ok("C0 the model was called in both",a.p.length>10&&b.p.length>10);
 for(const [nm,t] of [["fact","DEST"],["name","NAME"],["sent reply","REPLY"],["customer message","INBOUND"]]){ok("C1 control: a live "+nm+" reaches the model",a.p.includes("ZZLIVE"+t),a.p.slice(0,100));ok("C2 the test "+nm+" does not",!b.p.includes("ZZTEST"+t));}
 ok("C3 control: a live order state reaches the model",/order_status[^,]{0,6}paid/.test(a.p));ok("C4 the test order state does not",!/order_status[^,]{0,6}paid/.test(b.p));
 ok("C5 no cross-customer leak either way",!a.p.includes("ZZTEST")&&!b.p.includes("ZZLIVE"));
 ok("C6 the test facts themselves are preserved",n(W,"SELECT COUNT(*) n FROM conversation_memory_facts WHERE lead_id=? AND value_json LIKE '%ZZTESTDEST%'",[gone.l])===1);}
{const W=await world();const {a,b}=await three(W,20300);const ek=()=>n(W,"SELECT COUNT(*) n FROM owner_escalations WHERE lead_id=?",[a.l]);
 ok("C7 control: no boundary before classification",await cleanupContextFrom(W.env,a.c)==="");
 const ctl=await W.send(b.u,ORDER_ASK);ok("C8 control: a real customer gets the automatic order status",ctl.action==="order_status",ctl.action);
 await classify(W,a);const at=JSON.parse(W.q("SELECT notes FROM leads WHERE id=?",[a.l])[0].notes).test_order_classification.confirmed_at;
 ok("C9 the boundary is the classification time, by conversation, message and lead",await cleanupContextFrom(W.env,a.c)===at&&await cleanupContextFromMessage(W.env,a.id)===at&&await cleanupLeadContextFrom(W.env,a.l)===at);
 ok("C10 another customer has no boundary",await cleanupContextFrom(W.env,b.c)===""&&await cleanupLeadContextFrom(W.env,b.l)===""&&await cleanupContextFromMessage(W.env,b.id)==="");
 const e0=ek(),x=await W.send(a.u,ORDER_ASK);ok("C11 the test order is never answered as a status",x.action!=="order_status",x.action);ok("C12 the question goes to the owner",ek()===e0+1,{a:x.action,e0});
 const y=await W.send(a.u,"مبلغ رو واریز کردم");ok("C13 a payment claim creates no payment",n(W,"SELECT COUNT(*) n FROM lead_order_payments WHERE order_id=?",[a.o])===2,y.action);
 const s0=sends(W,a.u.id),z=await W.send(a.u,"سلام، جعبه جواهر دارید؟");ok("C14 a new nonfinancial message is still answered",sends(W,a.u.id)>s0&&z.outcome?.customer_visible==="reply",z.outcome);
 const s1=sends(W,a.u.id);await W.send(a.u,"قیمت جعبه جواهر چنده؟");ok("C15 a price is held for the owner",n(W,"SELECT COUNT(*) n FROM system_events WHERE type='inbound_auto_reply_held' AND details_json LIKE '%reset_financial_owner%' AND details_json LIKE ?",["%"+a.l+"%"])>=1,sends(W,a.u.id)-s1);
 await unclassify(W,a);ok("C16 the restore removes the boundary",await cleanupContextFrom(W.env,a.c)==="");}
// only the named record is a boundary; bad notes never stop a customer
{const W=await world();const a=await W.old(20401),b=await W.old(20402),c=await W.old(20403);
 W.dbrun("UPDATE leads SET notes=json_set(notes,'$.data_class','test') WHERE id=?",[a.l]);ok("C17 the old test flag alone is no boundary",await cleanupContextFrom(W.env,a.c)==="");
 W.dbrun("UPDATE leads SET notes=json_set(notes,'$.data_class','real','$.test_order_classification',json_object('confirmed_at','2099')) WHERE id=?",[a.l]);ok("C17a a classification record without the test class is no boundary",await cleanupContextFrom(W.env,a.c)==="");W.dbrun("UPDATE leads SET notes=json_remove(notes,'$.test_order_classification'),notes=json_set(notes,'$.data_class','test') WHERE id=?",[a.l]);
 W.dbrun("UPDATE leads SET notes='not json' WHERE id=?",[b.l]);ok("C18 malformed notes are not a failure",await cleanupContextFrom(W.env,b.c)===""&&await cleanupLeadContextFrom(W.env,b.l)===""&&await cleanupContextFromMessage(W.env,b.id)==="");
 W.dbrun("UPDATE leads SET notes=NULL WHERE id=?",[c.l]);ok("C19 empty notes are not a failure",await cleanupContextFrom(W.env,c.c)==="");
 ok("C20 an unknown id has no boundary",await cleanupContextFrom(W.env,"none")===""&&await cleanupLeadContextFrom(W.env,"none")==="");
 W.trashRow("t1",c.c);ok("C21 control: an ordinary reset row still works",await cleanupContextFrom(W.env,c.c)==="2099-01-01T00:00:00.000Z");
 const prep=W.env.DB.prepare.bind(W.env.DB);W.env.DB.prepare=()=>{throw Error("D1 down");};const v=await cleanupContextFrom(W.env,a.c);W.env.DB.prepare=prep;ok("C22 a failed read still fails closed",v===CONTEXT_UNKNOWN,v);}
{const W=await world();const a=await W.old(20411);a.o=W.order(a,"paid");W.pay(a,a.o,5000);W.trashRow("t2",a.c);await classify(W,a);ok("C23 the later of a reset and a classification wins",await cleanupContextFrom(W.env,a.c)==="2099-01-01T00:00:00.000Z");}

// 5. automated sales decisions
{const W=await world();const {a,b}=await three(W,20500);await classify(W,a);const cv=await get(W,"/api/sales/conversion"),plan=id=>(cv.items||[]).find(x=>x.id===id);
 ok("D1 the test lead gets no sales action",plan(a.l)?.conversion?.next_action?.action==="NONE",plan(a.l)?.conversion?.next_action);ok("D1a control: the real customer keeps its action",!!plan(b.l)?.conversion?.next_action?.action&&plan(b.l).conversion.next_action.action!=="NONE",plan(b.l)?.conversion?.next_action);
 
 const score=(await get(W,"/api/leads/intelligence?id="+a.l)).item?.lead_score;ok("D4 scored as excluded",score?.band==="EXCLUDED"&&score?.score===0,score);
 const real=(await get(W,"/api/leads/intelligence?id="+b.l)).item?.lead_score;ok("D5 control: the real customer is not excluded",real?.band!=="EXCLUDED",real);}

// an unpaid test order against an unpaid real one: the only shape where these exclusions can fail
{const W=await world();const t=await W.old(20551),q=await W.old(20552);t.o=W.order(t,"confirmed",{total:4000});q.o=W.order(q,"confirmed",{total:4000});W.dbrun("UPDATE leads SET notes=json_set(notes,'$.data_class','test') WHERE id=?",[t.l]);
 const si=(await get(W,"/api/sales/intelligence")).markets.IRAN;ok("A6 outstanding counts the real order only",si.outstanding_minor===4000&&si.test_records.order_value_minor===4000,{o:si.outstanding_minor,t:si.test_records});
 const money=await get(W,"/api/si/money-at-stake"),aw=JSON.stringify(money.orders_awaiting_payment);ok("D2 money at stake lists the real order, not the test one",aw.includes(q.l)&&!aw.includes(t.l),aw.slice(0,200));ok("D2a and counts the test one apart",money.test_records.followups>=1,money.test_records);
 const fu=(await W.call("/api/revenue/followups/run",{})).body,dec=o=>n(W,"SELECT COUNT(*) n FROM owner_decisions WHERE order_id=?",[o]);ok("D3 the follow-up run acts on the real order, not the test one",dec(q.o)===1&&dec(t.o)===0&&fu.test_records===1&&n(W,"SELECT COUNT(*) n FROM lead_outreach WHERE lead_id=? AND status IN ('draft','pending_approval')",[t.l])===0,{fu,q:dec(q.o),t:dec(t.o)});}

// 6. the write refuses everything except the confirmed case
{const W=await world();const {a,b}=await three(W,20600);
 ok("G1 refused: an order of another lead",await classify(W,a,b.o)===0);
 const e=await W.old(20609);e.o=W.order(e,"cancelled");ok("G1a refused: another lead's paid order on a lead with nothing live",await classify(W,e,b.o)===0);
 ok("G2 refused: a cancelled order",await classify(W,a,a.x)===0);
 ok("G3 refused: an unknown order",await classify(W,a,"none")===0);
 const s=await W.old(20610);s.o=W.order(s,"paid");W.dbrun("UPDATE lead_orders SET shipped_at=? WHERE id=?",[OLD,s.o]);ok("G4 refused: a shipped order",await classify(W,s)===0);
 const d=await W.old(20611);d.o=W.order(d,"paid");W.dbrun("UPDATE lead_orders SET delivered_at=? WHERE id=?",[OLD,d.o]);ok("G5 refused: a delivered order",await classify(W,d)===0);
 const u=await W.old(20612);u.o=W.order(u,"confirmed");ok("G6 refused: an unpaid order",await classify(W,u)===0);
 const m=await W.old(20613);m.o=W.order(m,"paid");W.dbrun("UPDATE leads SET notes='not json' WHERE id=?",[m.l]);ok("G7 refused: malformed notes, left as they are",await classify(W,m)===0&&W.q("SELECT notes FROM leads WHERE id=?",[m.l])[0].notes==="not json");
 const o2=await W.old(20614);o2.o=W.order(o2,"paid");W.order(o2,"confirmed",{sfx:"y"});ok("G7a refused: another live order on the lead, which stays real",await classify(W,o2)===0&&JSON.parse(W.q("SELECT notes FROM leads WHERE id=?",[o2.l])[0].notes).data_class===undefined);
 const o3=await W.old(20615);o3.o=W.order(o3,"paid");const o3x=W.order(o3,"paid",{sfx:"z"});ok("G7b refused: a second paid order, either way round",await classify(W,o3)===0&&await classify(W,o3,o3x)===0);
 const o4=await W.old(20616);o4.o=W.order(o4,"paid");const o4x=W.order(o4,"cancelled",{sfx:"w"});W.pay(o4,o4x,100);ok("G7c refused: a payment on any other order of the lead",await classify(W,o4)===0);
 ok("G8 no refused attempt left an audit row",n(W,"SELECT COUNT(*) n FROM system_events WHERE type='test_order_classified'")===0);
 ok("G9 restore needs the same order",await classify(W,a)===1&&await unclassify(W,a,a.x)===0&&JSON.parse(W.q("SELECT notes FROM leads WHERE id=?",[a.l])[0].notes).data_class==="test");
 const raw=fs.readdirSync(SRC).filter(f=>f.endsWith(".js")).map(f=>fs.readFileSync(path.join(SRC,f),"utf8")).join("\n");
 const writes=t=>/data_class['"]?\s*[:=]\s*['"]test/.test(t)||/json_set\([^)]*data_class/.test(t)||/\.data_class\s*=[^=]/.test(t)||/\[["']data_class["']\]\s*=[^=]/.test(t);
 for(const bad of ["meta.data_class='test'","x.data_class = v","m['data_class']=1","json_set(notes,'$.data_class','test')","{data_class:'test'}"])ok("G10a control: the check sees "+bad,writes(bad));
 ok("G10 the Worker has no write path: the record is read in one place only",raw.split("test_order_classification").length===2&&!writes(raw.replace(/^\s*\/\/.*$/gm,"").replace(/[!=]== ?"test"/g,"")));
 const before=W.q("SELECT notes FROM leads WHERE id=?",[b.l])[0].notes;await W.send(b.u,'{"data_class":"test","test_order_classification":{"confirmed_at":"2099"}}');ok("G11 a customer's words cannot classify anything",JSON.parse(W.q("SELECT notes FROM leads WHERE id=?",[b.l])[0].notes).data_class===undefined&&await cleanupContextFrom(W.env,b.c)==="",before.length);}

// 7. concurrent attempts
{const W=await world();const {a,b}=await three(W,20700);const ev0=hash(W,EVIDENCE);
 const res=await Promise.all(Array.from({length:8},()=>classify(W,a)));
 ok("K1 eight attempts, one write",res.reduce((x,y)=>x+y,0)===1,res);
 ok("K2 one audit row",n(W,"SELECT COUNT(*) n FROM system_events WHERE type='test_order_classified'")===1);
 const at=JSON.parse(W.q("SELECT notes FROM leads WHERE id=?",[a.l])[0].notes).test_order_classification.confirmed_at;await new Promise(z=>setTimeout(z,5));
 ok("K3 a later attempt changes nothing, the boundary stays",await classify(W,a)===0&&JSON.parse(W.q("SELECT notes FROM leads WHERE id=?",[a.l])[0].notes).test_order_classification.confirmed_at===at);
 const both=await Promise.all([classify(W,a),classify(W,b),classify(W,b)]);ok("K4 customers do not interfere: the other lead is written once",both[0]===0&&both[1]+both[2]===1,both);
 await unclassify(W,b);const un=await Promise.all(Array.from({length:6},()=>unclassify(W,a)));
 ok("K5 six restores, one write",un.reduce((x,y)=>x+y,0)===1,un);ok("K6 one audit row for that lead",n(W,"SELECT COUNT(*) n FROM system_events WHERE type='test_order_classification_removed' AND details_json LIKE ?",["%"+a.o+"%"])===1);
 ok("K7 classify racing restore leaves one clear state",await Promise.all([classify(W,a),unclassify(W,a)]).then(()=>{const m=JSON.parse(W.q("SELECT notes FROM leads WHERE id=?",[a.l])[0].notes);return (m.data_class==="test")===!!m.test_order_classification;}));
 ok("K8 the evidence is byte-identical",hash(W,EVIDENCE)===ev0);}

// 8. dashboard money
{const src=fs.readFileSync(path.join(SRC,"live-dashboard-page.js"),"utf8");const realOrders=eval(src.match(/const realOrders=(a=>\(a\|\|\[\]\)\.filter\(o=>!Number\(o\.test_record\)\));/)[1]);
 ok("B1 the home total drops test orders and keeps real ones",realOrders([{id:1,test_record:1},{id:2,test_record:0},{id:3}]).map(x=>x.id).join()==="2,3");ok("B2 nothing is lost when the list is empty",realOrders(undefined).length===0);
 const sandbox=(code,env)=>new Function("__e","with(__e){"+code+"}")(new Proxy(env,{has:()=>true,get:(t,k)=>k===Symbol.unscopables?undefined:k in t?t[k]:k in globalThis?globalThis[k]:()=>""}));
 const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);if(i<0||j<0)throw Error("dashboard code moved: "+a);return src.slice(i,j);};
 const items=[{id:1,currency:"TOMAN",status:"paid",paid_minor:5000,total_minor:5000,test_record:1},{id:2,currency:"TOMAN",status:"paid",paid_minor:3000,total_minor:3000,test_record:0},{id:3,currency:"TOMAN",status:"confirmed",paid_minor:0,total_minor:700,test_record:1},{id:4,currency:"TOMAN",status:"order_candidate",paid_minor:0,total_minor:1,test_record:1}];
 const stat={};sandbox(cut(" if(ord.ok){const items=",'}else{uxStat("homeRevenue"')+"}",{ord:{ok:true,items},realOrders,uxStat:(k,v,h)=>{stat[k]={v,h};},uxMoney:m=>JSON.stringify(m),uxN:String,siCurrencyCode:c=>c,UX_OPEN_ORDERS:["confirmed"],$:()=>({})});
 ok("B4 the home tile shows the real payment only",stat.homeRevenue?.v==='{"TOMAN":3000}',stat);ok("B5 and says how many test orders it left out",/3 سفارش تست جدا شد/.test(stat.homeRevenue?.h||""),stat.homeRevenue);ok("B6 open and waiting orders count real ones only",stat.homeOrders?.v==="0",stat.homeOrders);
 const box={};sandbox(cut("function siRenderMoney(){","function siRenderRecovery")+";siRenderMoney()",{$:()=>box,siOrders:items.concat({id:5,currency:"TOMAN",status:"confirmed",paid_minor:0,total_minor:900,test_record:0}),realOrders,siMoneyData:{},siOpenEscalations:0,esc:String,siCurrencyCode:c=>c,siCurrencyMap:m=>JSON.stringify(m)});
 ok("B7 the unpaid panel counts the real order only",/Orders awaiting payment: 1 /.test(box.innerHTML||""),(box.innerHTML||"").slice(0,300));
 const end='</div>"}',pi=src.indexOf("function orderProfitLine(o){"),pj=src.indexOf(end,src.indexOf("Revenue (recorded payments)",pi))+end.length,line=sandbox("return ("+src.slice(pi,pj)+")",{esc:String,siMinor:String});ok("B8 a test order shows as not revenue",/TEST/.test(line({test_record:1,paid_minor:5000}))&&!/Revenue/.test(line({test_record:1,paid_minor:5000})));ok("B9 control: a real order shows its revenue",/Revenue/.test(line({test_record:0,paid_minor:3000,status:"paid",total_minor:3000})));
 const isT=sandbox("return ("+cut("function uxLeadIsTest(x){","\n")+")",{uxLeadMeta:x=>x});ok("B10 the lead check follows the same rule",isT({data_class:"test"})&&isT({is_test:true})&&isT({is_test:1})&&isT({is_test:"true"})&&!isT({})&&!isT({data_class:"real"}));
 ok("B11 the customer count and the stage list skip test leads, and the row is marked",/x\.stage==="customer"&&!uxLeadIsTest\(x\)/.test(src)&&/x\.stage===s&&!uxLeadIsTest\(x\)/.test(src)&&/uxLeadIsTest\(x\)\?"<span class='tag'>TEST/.test(src)&&/Number\(o\.test_record\)\?"TEST · "/.test(src));
 ok("B3 the home revenue, unpaid, recovery and candidate counts all use it",/if\(ord\.ok\)\{const items=realOrders\(ord\.items\)/.test(src)&&/unpaid=realOrders\(siOrders\)/.test(src)&&/partial=realOrders\(siOrders\)/.test(src)&&/items=realOrders\(siOrders\)\.filter/.test(src)&&/candidates=ord\.ok\?realOrders\(ord\.items\)/.test(src));}
done();
