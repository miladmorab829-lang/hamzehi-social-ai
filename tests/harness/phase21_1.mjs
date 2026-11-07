// PHASE 21.1 — autonomous sales messaging (owner policy 2026-11-01): permitted, non-financial follow-ups are SENT automatically only inside
// customer-opened Telegram conversations with a recorded market, within contact hours, never after an opt-out, never twice, within caps,
// and only while the owner's switch is ON (default OFF, emergency stop). Discovery leads only get drafts for the owner. Synthetic data only;
// Telegram is the in-process mock; nothing reaches a real customer.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase21_1");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const imp=f=>import(pathToFileURL(path.join(SRC,f)).href);
const AM=await imp("auto-sales-messaging.js"),DP=await imp("live-dashboard-page.js");
const PRICE=new RegExp(fs.readFileSync(path.join(SRC,"index.js"),"utf8").match(/const OUTREACH_PRICE_TERMS=\/(.*)\/iu;/)[1],"iu");

// ---- U: pure helpers
ok("U1 opt-out is recognised in Persian, Iraqi Arabic and English",["لطفاً دیگه پیام ندید","لغو","مزاحم نشوید","توقف","لا ترسلون بعد","بطلوا رسائل","STOP please","unsubscribe"].every(AM.isOptOutMessage));
ok("U2 normal sales messages are not opt-outs",!["سلام، جعبه جواهر مشکی دارید؟","قیمت جعبه انگشتر چنده؟","شنو عدكم علب ذهب؟","I want 200 boxes"].some(AM.isOptOutMessage));
{const s=AM.autoMessagingSettings(null);ok("U3 default settings: OFF, caps 2/run 10/day, contact hours 10–20 local",s.enabled===false&&s.per_run===2&&s.per_day===10&&s.local_start_hour===10&&s.local_end_hour===20);
 const t=Date.parse("2026-11-12T05:00:00Z");ok("U4 contact hours by market local time (Iran UTC+3:30, Iraq UTC+3)",AM.marketLocalHour("IRAN",t)===8&&AM.marketLocalHour("ARAB",t)===8&&!AM.withinContactHours("IRAN",s,t)&&AM.withinContactHours("ARAB",s,Date.parse("2026-11-12T08:00:00Z")));}

// ---- world
const W=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on"}});const {q,dbrun,call,send,setMarket,TG}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
const AE=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+"?a="+Math.random());await AE.autonomyMasterGate(W.env);
const IDX=await import(pathToFileURL(path.join(SRC,"index.js")).href+"?r="+Math.random());
const run=(nowMs)=>IDX.runAutoSalesMessaging(W.env,{nowMs,internalFetch:r=>W.run(new Request(r.url.replace("https://internal.local","https://w.test"),r))});
const NOW=Date.now(),inHours=(mk)=>{for(let h=0;h<48;h++){const t=NOW+h*3600000;if(AM.withinContactHours(mk,AM.autoMessagingSettings(null),t))return t;}return NOW;};
const tIR=inHours("IRAN"),ago=d=>new Date(NOW-d*86400000).toISOString();
const sends=()=>W.tg.filter(x=>x.method==="sendMessage");
let uid=7000;const customer=async(name,text,market,{silentDays=15}={})=>{const u={id:++uid,name,username:"u"+uid};await send(u,text);if(market)setMarket(u,market);
  const lid=q("SELECT lead_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(u.id)])[0].lead_id;
  // history: the customer wrote 16 days ago, our last message went out 15 days ago, nothing since (a silent customer)
  dbrun("UPDATE inbox_messages SET created_at=? WHERE lead_id=?",[ago(silentDays+1),lid]);
  const c=q("SELECT id FROM lead_contacts WHERE lead_id=? AND contact_type='telegram' LIMIT 1",[lid])[0]||q("SELECT id FROM lead_contacts WHERE lead_id=? LIMIT 1",[lid])[0];
  dbrun("DELETE FROM lead_outreach WHERE lead_id=?",[lid]);
  dbrun("INSERT INTO lead_outreach(id,lead_id,contact_id,channel,recipient,message,language,status,approved_at,approved_by,sent_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",["prev-"+lid,lid,c?.id||null,"telegram",String(u.id),"earlier reply","Persian","sent",ago(silentDays),"admin",ago(silentDays),ago(silentDays),ago(silentDays)]);
  return {u,lid};};
const before=sends().length;
const A=await customer("Customer Iran","سلام، جعبه جواهر می‌خواهم","iran");
const B=await customer("Customer OptOut","سلام",'iran');await send(B.u,"لطفاً دیگه پیام ندید");dbrun("UPDATE inbox_messages SET created_at=? WHERE lead_id=?",[ago(16),B.lid]);
// (any bot acknowledgement is moved back too, so B's follow-up is DUE and only the runner's own opt-out check can stop it)
dbrun("UPDATE lead_outreach SET sent_at=?,approved_at=?,created_at=?,updated_at=? WHERE lead_id=? AND status='sent'",[ago(15),ago(15),ago(15),ago(15),B.lid]);
// Phase 26: the stop request itself is no longer answered automatically — its draft is HELD (customer_opted_out). That held draft is
// removed here so the follow-up stays DUE and R2b still proves the runner's own opt-out check.
const heldB=dbrun("DELETE FROM lead_outreach WHERE lead_id=? AND status='draft' AND error_detail='customer_opted_out'",[B.lid]).changes;
ok("R0 Phase 26: the inbound reply to the stop request was held, not sent",heldB===1&&q("SELECT COUNT(*) n FROM lead_outreach WHERE lead_id=? AND approved_by IN ('inbound_auto_policy','inbound_ack_policy')",[B.lid])[0].n===0,heldB);
const C=await customer("Customer NoMarket","hello",null);
const D=await customer("Customer Quote","سلام","iran");dbrun("INSERT INTO lead_quotes(id,lead_id,conversation_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",["qq-1",D.lid,"conv-x","requested",ago(15),ago(15)]);
const E=await customer("Customer OldDraft","سلام","iran");dbrun("INSERT INTO lead_outreach(id,lead_id,channel,recipient,message,language,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",["old-draft-E",E.lid,"telegram","x","old text","Persian","draft",ago(2),ago(2)]);
dbrun("INSERT INTO lead_outreach(id,lead_id,channel,recipient,message,language,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",["rej-A",E.lid,"telegram","x","rejected text","Persian","rejected",ago(20),ago(20)]);
const rejBefore=q("SELECT COUNT(*) n FROM lead_outreach WHERE status='rejected'")[0].n;
const baseline=sends().length;

// ---- S: switch
const r0=await run(tIR);
ok("S1 OFF by default: nothing prepared or sent",r0.skipped==="disabled"&&sends().length===baseline);
const e403=await call("/api/sales/auto-messaging",{enabled:true});
ok("S2 turning it ON needs the owner's explicit approval (403 without owner_approved)",e403.status===403);
const on=await call("/api/sales/auto-messaging",{enabled:true,owner_approved:true,local_start_hour:0,local_end_hour:24});
ok("S3 the owner switches it ON (recorded and audited)",on.body?.settings?.enabled===true&&q("SELECT COUNT(*) n FROM system_events WHERE type='auto_sales_messaging_enabled'")[0].n===1);

// ---- R: a real run
const r1=await run(tIR);const sent=q("SELECT lead_id,status,message,approved_by FROM lead_outreach WHERE approved_by=?",[AM.AUTO_POLICY_ACTOR]);
ok("R1 exactly the eligible silent Iran customer gets ONE automatic follow-up (sent through Telegram, Persian, brand, no price)",
  r1.sent===1&&sent.length===1&&sent[0].lead_id===A.lid&&sent[0].status==="sent"&&sent[0].message.includes("HAMZEHI BOX")&&!PRICE.test(sent[0].message)&&sends().length===baseline+1,[r1,sent]);
const plans=(await call("/api/sales/conversion?limit=100",null,"GET")).body.items,act=id=>plans.find(i=>i.id===id)?.conversion?.next_action.action;
ok("R2 opt-out, unknown market, financial flow and an older open draft never get an automatic send; the old draft stays a draft",
  !sent.some(x=>[B.lid,C.lid,D.lid,E.lid].includes(x.lead_id))&&q("SELECT status FROM lead_outreach WHERE id='old-draft-E'")[0].status==="draft"
  &&act(C.lid)==="SET_MARKET"&&act(D.lid)==="ESCALATE_FINANCIAL_DECISION"&&act(E.lid)==="OWNER_REVIEW_DRAFT",[r1,act(B.lid),act(C.lid),act(D.lid),act(E.lid)]);
ok("R2b an opted-out customer whose follow-up is due is stopped by the runner itself (customer_opted_out)",act(B.lid)==="PREPARE_FOLLOW_UP_DRAFT"&&r1.skipped.customer_opted_out===1,[act(B.lid),r1]);
const r2=await run(tIR+60000);
ok("R3 no duplicate: the next run sends nothing to the same customer",r2.sent===0&&q("SELECT COUNT(*) n FROM lead_outreach WHERE approved_by=?",[AM.AUTO_POLICY_ACTOR])[0].n===1,r2);
ok("R4 a seeded rejected draft stays rejected and the older draft was not sent by the automation",rejBefore>=1&&q("SELECT status FROM lead_outreach WHERE id='rej-A'")[0].status==="rejected"&&q("SELECT COUNT(*) n FROM lead_outreach WHERE status='rejected'")[0].n===rejBefore&&q("SELECT status FROM lead_outreach WHERE id='old-draft-E'")[0].status==="draft");

// ---- H: hours, caps, failures, stop
const F=await customer("Customer Night","سلام","iran");
const night=(()=>{for(let h=0;h<48;h++){const t=NOW+h*3600000;if(!AM.withinContactHours("IRAN",AM.autoMessagingSettings(null),t))return t;}})();
await call("/api/sales/auto-messaging",{local_start_hour:10,local_end_hour:20});
const r3=await run(night);
ok("H1 outside the market's contact hours nothing is sent (outside_contact_hours)",r3.sent===0&&(r3.skipped.outside_contact_hours||0)>=1,r3);
const G1=await customer("Customer G1","سلام","iraq"),G2=await customer("Customer G2","سلام","iraq"),G3=await customer("Customer G3","سلام","iraq");
await call("/api/sales/auto-messaging",{local_start_hour:0,local_end_hour:24,per_run:2});
TG.mode="reject";const r4=await run(tIR+120000);TG.mode="ok";
ok("H2 per-run cap and failure handling: a Telegram rejection is recorded (send_failed + failure state), never retried in the same window",
  r4.failed>=1&&q("SELECT COUNT(*) n FROM lead_outreach WHERE approved_by=? AND status='send_failed'",[AM.AUTO_POLICY_ACTOR])[0].n===r4.failed&&!!q("SELECT value FROM system_kv WHERE key='market_fail:autofu:IRAN' OR key='market_fail:autofu:ARAB'")[0]&&(r4.sent+r4.failed)<=2,r4);
const r5=await run(tIR+180000);
ok("H3 the failed lead is not retried in the same follow-up window (lock), so no message storm",!q("SELECT lead_id FROM lead_outreach WHERE approved_by=? GROUP BY lead_id HAVING COUNT(*)>1",[AM.AUTO_POLICY_ACTOR]).length,r5);
const stop=await call("/api/sales/auto-messaging",{enabled:false});const s0=sends().length;const r6=await run(tIR+240000);
ok("H4 emergency stop (no approval needed) stops every automatic send immediately",stop.body?.settings?.enabled===false&&r6.skipped==="disabled"&&sends().length===s0);
await call("/api/sales/auto-messaging",{enabled:true,owner_approved:true});const envOff={...W.env,AUTO_SALES_MESSAGING:"off"};
const r7=await IDX.runAutoSalesMessaging(envOff,{nowMs:tIR,internalFetch:r=>W.run(r)});
ok("H5 an environment override AUTO_SALES_MESSAGING=off also stops it",r7.skipped==="disabled");
// H6: a definitive rejection is retried ONCE, not before 1 hour; an ambiguous outcome / a second failure is never retried
const failedLeads=q("SELECT DISTINCT lead_id FROM lead_outreach WHERE approved_by=? AND status='send_failed'",[AM.AUTO_POLICY_ACTOR]).map(x=>x.lead_id);
const r9=await run(tIR+2*3600000);const after=failedLeads.map(l=>q("SELECT status FROM lead_outreach WHERE lead_id=? AND approved_by=? ORDER BY created_at",[l,AM.AUTO_POLICY_ACTOR]).map(x=>x.status));
const r10=await run(tIR+4*3600000);
ok("H6 a definitive Telegram rejection gets exactly one later retry (≥1 h); never a third attempt",failedLeads.length>=1&&after.every(s=>s.length===2&&s[1]==="sent")&&r10.sent===0
  &&!q("SELECT lead_id FROM lead_outreach WHERE approved_by=? GROUP BY lead_id HAVING COUNT(*)>2",[AM.AUTO_POLICY_ACTOR]).length,[failedLeads,after,r9,r10]);
// Q1: the customer answered after our last message → the inbound flow handles it, no automatic follow-up
const Q=await customer("Customer Replied","سلام","iran");dbrun("UPDATE inbox_messages SET created_at=? WHERE lead_id=?",[ago(14),Q.lid]);
// Q2: recipient binding — the only contact is a phone number, not the customer's private Telegram chat
const P=await customer("Customer PhoneOnly","سلام","iran");dbrun("DELETE FROM lead_contacts WHERE lead_id=?",[P.lid]);
dbrun("INSERT INTO lead_contacts(id,lead_id,contact_type,raw_value,normalized_value,evidence_status,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",["p-ph",P.lid,"phone","+989120000001","+989120000001","page_extracted","test",ago(20),ago(20)]);
const s2=sends().length;const r11=await run(tIR+6*3600000);
ok("Q1 a customer who replied after our last message gets no automatic follow-up",!q("SELECT 1 FROM lead_outreach WHERE lead_id=? AND approved_by=?",[Q.lid,AM.AUTO_POLICY_ACTOR]).length,r11);
ok("Q2 a follow-up is never sent unless the recipient is the customer's own private Telegram chat; nothing stays auto-approved",!q("SELECT 1 FROM lead_outreach WHERE lead_id=? AND approved_by=?",[P.lid,AM.AUTO_POLICY_ACTOR]).length&&!q("SELECT 1 FROM lead_outreach WHERE status='approved' AND approved_by=?",[AM.AUTO_POLICY_ACTOR]).length&&sends().length===s2,[r11,q("SELECT status,channel,contact_id FROM lead_outreach WHERE lead_id=?",[P.lid])]);

// ---- O: owner path also respects opt-out; discovery leads only get drafts
dbrun("INSERT INTO lead_outreach(id,lead_id,channel,recipient,message,language,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",["owner-B",B.lid,"telegram","x","سلام","Persian","pending_approval",ago(0),ago(0)]);
const ob=await call("/api/leads/outreach/transition",{id:"owner-B",action:"approve"});
ok("O1 the owner cannot approve a message to a customer who asked to stop (409 customer_opted_out)",ob.status===409&&ob.body?.reason==="customer_opted_out",[ob.status,ob.body?.reason]);
const t=new Date().toISOString();
dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",["disc-1","گالری نمونه","https://sample-disc.ir/","discovered","normal",JSON.stringify({source:"dataset_discovery",provider:"web",url:"https://sample-disc.ir/",evidence:"گالری طلا و جواهر نمونه",target_market:"IRAN",city:"تهران",type:"gold_fa",qualification:{buyer_in_title:true,local_domain:true},contact_enrichment_checked_at:t}),t,t]);
dbrun("INSERT INTO lead_contacts(id,lead_id,contact_type,raw_value,normalized_value,evidence_status,source,evidence_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",["disc-1:phone","disc-1","phone","+982100000009","+982100000009","page_extracted","test","https://sample-disc.ir/contact",t,t]);
const s1=sends().length;const r8=await run(tIR+300000);
const dd=q("SELECT status,approved_by FROM lead_outreach WHERE lead_id='disc-1'");
ok("O2 a discovery lead (no conversation, no consent) gets a first-contact DRAFT for the owner — never an automatic message",r8.drafts>=1&&dd.length===1&&dd[0].status==="draft"&&!dd[0].approved_by&&sends().length===s1,[r8,dd]);
ok("O3 no lead was moved to 'contacted' without a real send, and no Google Places or AI call was made",q("SELECT COUNT(*) n FROM leads WHERE id='disc-1' AND stage='contacted'")[0].n===0&&!W.offNet().some(u=>/places\.googleapis|api\.openai/.test(u)));

// ---- D: status API and dashboard
const st=(await call("/api/sales/auto-messaging",null,"GET")).body;
ok("D1 status shows the switch, today's counts, failures and catalogue completeness (missing items listed, nothing invented)",st.ok&&typeof st.today.auto_sent==="number"&&st.catalog&&st.catalog.complete===false&&st.catalog.missing.includes("products"),st.catalog);
ok("D2 the status endpoint requires authentication",(await W.run(new Request("https://w.test/api/sales/auto-messaging"))).status===401);
{const html=DP.liveDashboardHtml(DP.dashboardRoute("/dashboard/customers")),js=html.slice(html.lastIndexOf("<script>")+8).replace(/<\/script><\/body><\/html>$/,"");let parses=true;try{new Function(js);}catch{parses=false;}
 ok("D3 the Customers page shows the auto-messaging card with the owner switch and emergency stop; the script parses",html.includes('id="salesConvAuto"')&&/توقف اضطراری ارسال خودکار/.test(html)&&parses);}
done();
