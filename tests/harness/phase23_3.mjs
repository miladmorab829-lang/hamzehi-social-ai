// Phase 23 — owner alert for held quotes, dashboard visibility and stale figures. Local only: Telegram is a recording mock, no real chat.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase23_3");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const FQ=await import(pathToFileURL(path.join(REPO,"worker/src/final-quote-review.js")).href);
const OWNER="-100555123456";
const T="2026-10-01T00:00:00.000Z",L=`INSERT INTO commercial_price_items(id,product_key,product_name,sku,market,currency,unit_price_minor,moq,version,active,effective_from,effective_until,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
const world=async(extra={})=>{const W=await makeWorld({aiBrain:"off",extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",...extra}});await W.call("/api/quotes",null,"GET");await W.call("/api/si/knowledge/product",null,"GET");
 W.dbrun("CREATE TABLE IF NOT EXISTS telegram_media_sources(id TEXT PRIMARY KEY,chat_id TEXT NOT NULL,chat_username TEXT,message_id TEXT NOT NULL,file_id TEXT NOT NULL,file_unique_id TEXT,media_type TEXT,caption TEXT,source_kind TEXT,created_at TEXT,updated_at TEXT)");
 W.dbrun(L,["R1","k1","انگشتر کوچک · 5x5 · 3 تکه",null,"IRAN","TOMAN",66000,null,1,1,null,null,"admin",T,T,T]);
 W.dbrun(L,["A1","a1","علبة خاتم صغيرة · 5x5x4 · ثلاث قطع",null,"ARAB","USD",60,null,1,1,null,null,"admin",T,T,T]);
 W.dbrun("INSERT INTO business_settings(id,setting_key,scope_key,value_json,version,status,approved_by,approved_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)",["ds","discount_rule","market:ARAB",JSON.stringify({type:"percent_bp",value:1000,min_quantity:1001}),1,"current","owner",T,T]);return W;};
let id=733000000;const customer=async(W,mk)=>{const u={id:++id,name:"Sara Customer",username:"secret_user"+id};await W.send(u,"سلام");W.setMarket(u,mk);return u;};
const IR=n=>`قیمت انگشتر کوچک 3 تکه برای ${n} عدد چنده؟`,IQ=n=>`بكم علبة خاتم صغيرة ثلاث قطع؟ أريد ${n}`;
const toOwner=W=>W.tg.filter(x=>x.method==="sendMessage"&&String(x.body).includes(`"chat_id":"${OWNER}"`)).map(x=>JSON.parse(x.body).text);
const review=(W,o)=>W.q("SELECT * FROM final_quote_reviews WHERE outreach_id=?",[o])[0];
const cron=W=>FQ.retryFinalQuoteAlerts(W.env,{limit:5});
const fq=async W=>(await W.call("/api/final-quotes",null,"GET")).body;

// Creation and content
{const W=await world({OWNER_TELEGRAM_CHAT_ID:OWNER});const u=await customer(W,"iran");const r=await W.send(u,IR(1000));const a=toOwner(W);
 ok("N1 a held quote sends one owner alert",a.length===1&&review(W,r.draft.id)?.alert_status==="sent",{a,s:review(W,r.draft.id)?.alert_status});
 ok("N2 it carries CRM reference, market, product, quantity, reason and dashboard reference",/CRM: /.test(a[0])&&/ایران/.test(a[0])&&/انگشتر کوچک/.test(a[0])&&/1000/.test(a[0])&&/جمع با تخفیف/.test(a[0])&&a[0].includes(r.draft.id.slice(0,8)),a[0]);
 ok("N3 it has no customer name, username, Telegram id, message text or amount",!/Sara|secret_user/.test(a[0])&&!a[0].includes(String(u.id))&&!/چنده/.test(a[0])&&!/۵۹٬۴۰۰|59400000|تومان/.test(a[0]),a[0]);
 ok("N4 it says it is no commercial approval, and the draft stays unapproved",/تأیید تجاری نیست/.test(a[0])&&W.q("SELECT status,approved_by FROM lead_outreach WHERE id=?",[r.draft.id])[0].status==="draft"&&!W.q("SELECT approved_by FROM lead_outreach WHERE id=?",[r.draft.id])[0].approved_by);
 ok("N5 an audit event records it",W.q("SELECT COUNT(*) n FROM system_events WHERE type='final_quote_owner_alert'")[0].n===1);
 await W.send(u,IR(1000));await W.send(u,"ثبتش کن");ok("D1 the same pending quote is not alerted again",toOwner(W).length===1,toOwner(W).length);
 for(let i=0;i<4;i++)await cron(W);ok("D2 no cron run repeats a delivered alert",toOwner(W).length===1,toOwner(W).length);
 const m={message_id:99000001,date:Math.floor(Date.now()/1000),from:{id:u.id,is_bot:false,first_name:u.name,username:u.username},chat:{id:u.id,type:"private"},text:IR(3000)};
 await W.post({update_id:99000001,message:m});const n=toOwner(W).length;await W.post({update_id:99000001,message:m});
 ok("D3 a changed quantity is one new decision, and a redelivery adds nothing",n===2&&toOwner(W).length===2,{n,after:toOwner(W).length});
 const d=await fq(W);ok("V1 the dashboard API counts the pending quote and the superseded one",d.summary.pending===1&&d.summary.rejected===1&&d.owner_alert.configured===true&&!JSON.stringify(d).includes(OWNER),d.summary);}
{const W=await world({OWNER_TELEGRAM_CHAT_ID:OWNER});const u=await customer(W,"iraq");await W.send(u,IQ(1001));const a=toOwner(W);
 ok("M1 an Iraq alert names Iraq and never Iran",a.length===1&&/عراق/.test(a[0])&&!/ایران/.test(a[0]),a);}

// Destination rules
for(const [label,env,state] of [["missing",{},"destination_missing"],["malformed",{OWNER_TELEGRAM_CHAT_ID:"@owner"},"destination_invalid"],["the public channel",{OWNER_TELEGRAM_CHAT_ID:OWNER,TELEGRAM_CHAT_ID:OWNER},"destination_is_system_chat"],["the media vault",{OWNER_TELEGRAM_CHAT_ID:OWNER,TELEGRAM_VAULT_CHAT_ID:OWNER},"destination_is_system_chat"]]){
 const W=await world(env);const u=await customer(W,"iran");const before=W.tg.length;const r=await W.send(u,IR(1000));const s=W.tg.slice(before).filter(x=>x.method==="sendMessage");
 ok(`T1 destination ${label}: no alert, only the customer's acknowledgement, state ${state}`,s.length===1&&String(s[0].body).includes(String(u.id))&&review(W,r.draft.id)?.alert_status===state,{n:s.length,st:review(W,r.draft.id)?.alert_status});
 ok(`T2 destination ${label}: the quote is still held`,r.draft.status==="draft");}
// Destination: a private group only
const joinGroup=async(W,id=OWNER)=>{const chat={id:Number(id),type:"supergroup",title:"Owner alerts"};const m={date:Math.floor(Date.now()/1000),from:{id:55512345,is_bot:false,first_name:"Owner"},chat};await W.post({update_id:880001,message:{...m,message_id:880001,new_chat_members:[{id:999,is_bot:true,first_name:"bot"}]}});await W.post({update_id:880002,message:{...m,message_id:880002,text:"/hamzehi_owner_setup"}});};
{const W=await world({OWNER_TELEGRAM_CHAT_ID:OWNER});await joinGroup(W);const rows=W.q("SELECT lead_id FROM inbox_messages WHERE provider_conversation_id=?",[OWNER]);
 ok("G1 a real private group with only unlinked rows is accepted",rows.length===2&&rows.every(r=>!r.lead_id)&&(await FQ.ownerAlertDestination(W.env)).ok===true,rows);
 ok("G1b the bot neither answers the group nor creates a lead",W.q("SELECT COUNT(*) n FROM leads")[0].n===0&&!W.tg.some(x=>/^send/.test(x.method)));
 const u=await customer(W,"iran");const r=await W.send(u,IR(1000));ok("G1c and it receives the alert for a held quote",toOwner(W).length===1&&review(W,r.draft.id).alert_status==="sent",toOwner(W).length);}
{const W=await world({OWNER_TELEGRAM_CHAT_ID:OWNER});const u=await customer(W,"iran");await joinGroup(W);const lead=W.q("SELECT lead_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(u.id)])[0].lead_id;W.dbrun("UPDATE inbox_messages SET lead_id=? WHERE provider_conversation_id=?",[lead,OWNER]);
 const b=toOwner(W).length,r=await W.send(u,IR(1000));ok("G2 a group with a row linked to a customer is refused",review(W,r.draft.id)?.alert_status==="destination_is_customer_chat"&&toOwner(W).length===b,review(W,r.draft.id)?.alert_status);}
{const P="55512345",W=await world({OWNER_TELEGRAM_CHAT_ID:P});W.dbrun("INSERT INTO inbox_messages(id,platform,provider_conversation_id,provider_sender_id,message,category,created_at,updated_at) SELECT 'unl1','telegram',?,?,'x','other',?,? WHERE NOT EXISTS(SELECT 1 FROM inbox_messages WHERE id='unl1')",[P,P,T,T]);
 const u=await customer(W,"iran");const r=await W.send(u,IR(1000));ok("G3 a private chat with an unlinked row is refused, and nothing goes to it",review(W,r.draft.id)?.alert_status==="destination_not_group"&&!W.tg.some(x=>String(x.body).includes('"chat_id":"'+P+'"')),review(W,r.draft.id)?.alert_status);}
{const W=await world({OWNER_TELEGRAM_CHAT_ID:"55512345"});const c={id:55512345,name:"X",username:"x"};await W.send(c,"سلام");const u=await customer(W,"iran");const r=await W.send(u,IR(1000));
 ok("G4 a private customer chat is refused",review(W,r.draft.id)?.alert_status==="destination_not_group",review(W,r.draft.id)?.alert_status);}
for(const [label,chat] of [["a public group by username",{username:"public_group"}],["a public group by active usernames",{active_usernames:["public_group"]}],["a channel",{type:"channel"}],["a private chat answer for a group id",{type:"private"}]]){
 const W=await world({OWNER_TELEGRAM_CHAT_ID:OWNER});W.TG.chat=chat;const u=await customer(W,"iran");const r=await W.send(u,IR(1000));
 ok("G5 Telegram says "+label+": refused, no alert",review(W,r.draft.id)?.alert_status==="destination_unverified"&&toOwner(W).length===0,review(W,r.draft.id)?.alert_status);}
{const W=await world({OWNER_TELEGRAM_CHAT_ID:OWNER});W.dbrun("INSERT INTO telegram_media_sources(id,chat_id,chat_username,message_id,file_id,file_unique_id,media_type,caption,source_kind,created_at,updated_at) VALUES('v1',?,'vault',1,'f','u','photo','','channel',?,?)",[OWNER,T,T]);const u=await customer(W,"iran");const r=await W.send(u,IR(1000));
 ok("G6 a chat that is a media source is refused",review(W,r.draft.id)?.alert_status==="destination_is_system_chat"&&toOwner(W).length===0,review(W,r.draft.id)?.alert_status);}
{const W=await world({OWNER_TELEGRAM_CHAT_ID:OWNER});const b=W.tg.length;const d=await fq(W);const calls=W.tg.slice(b).map(x=>x.method);
 ok("G7 the dashboard check asks Telegram with getChat only and sends nothing",d.owner_alert.configured===true&&calls.includes("getChat")&&!calls.some(m=>/^send/.test(m))&&!JSON.stringify(d).includes(OWNER),calls);
 W.TG.chat={username:"public_group"};const e=await fq(W);ok("G7b and it shows an unverified destination",e.owner_alert.configured===false&&e.owner_alert.reason==="destination_unverified",e.owner_alert);}
{const W=await world();const u=await customer(W,"iran");const r=await W.send(u,IR(1000));for(let i=0;i<3;i++)await cron(W);
 ok("T5 with no destination, cron calls Telegram for nothing",review(W,r.draft.id).alert_attempts===0,review(W,r.draft.id).alert_attempts);
 W.env.OWNER_TELEGRAM_CHAT_ID=OWNER;await cron(W);await cron(W);ok("T6 once the owner sets it, the waiting quote gets exactly one alert",toOwner(W).length===1&&review(W,r.draft.id).alert_status==="sent",toOwner(W).length);}

// Failures
{const W=await world({OWNER_TELEGRAM_CHAT_ID:OWNER});const u=await customer(W,"iran");
 W.TG.before=m=>m==="getChat"?(W.__owner=true,null):(m==="sendMessage"&&W.__owner?(W.__owner=false,"throw"):null);
 const r=await W.send(u,IR(1000));const n=W.tg.filter(x=>x.method==="sendMessage").length;W.TG.before=null;
 ok("R1 a timeout is recorded as unknown; the customer flow is unaffected",review(W,r.draft.id)?.alert_status==="outcome_unknown"&&r.draft.status==="draft",review(W,r.draft.id)?.alert_status);
 for(let i=0;i<3;i++)await cron(W);ok("R2 an unknown outcome is never repeated",n>0&&review(W,r.draft.id).alert_attempts===1&&W.tg.filter(x=>x.method==="sendMessage").length===n,n);
 const d=await fq(W);ok("R3 the dashboard shows the alert was not delivered",d.summary.alerts_not_delivered===1,d.summary);}
{const W=await world({OWNER_TELEGRAM_CHAT_ID:OWNER});const u=await customer(W,"iran");
 W.TG.before=m=>m==="getChat"?(W.__owner=true,null):(m==="sendMessage"&&W.__owner?(W.__owner=false,"reject"):null);
 const r=await W.send(u,IR(1000));W.TG.before=null;const n=W.tg.filter(x=>x.method==="sendMessage").length;for(let i=0;i<3;i++)await cron(W);
 ok("R4 a Telegram refusal (400) is final and not retried",review(W,r.draft.id)?.alert_status==="failed_final"&&review(W,r.draft.id).alert_attempts===1&&W.tg.filter(x=>x.method==="sendMessage").length===n,review(W,r.draft.id)?.alert_status);}
{const W=await world({OWNER_TELEGRAM_CHAT_ID:OWNER});const u=await customer(W,"iran");const r=await W.send(u,IR(1000));const past=new Date(Date.now()-1000).toISOString();
 W.dbrun("UPDATE final_quote_reviews SET alert_status='failed',alert_attempts=1,next_attempt_at=? WHERE outreach_id=?",[past,r.draft.id]);await cron(W);await cron(W);
 ok("R5 a retryable failure is retried once when due",toOwner(W).length===2&&review(W,r.draft.id).alert_status==="sent",toOwner(W).length);
 W.dbrun("UPDATE final_quote_reviews SET alert_status='failed',next_attempt_at=? WHERE outreach_id=?",[new Date(Date.now()+60000).toISOString(),r.draft.id]);await cron(W);ok("R6 not before it is due",toOwner(W).length===2);
 W.dbrun("UPDATE final_quote_reviews SET alert_status='failed',next_attempt_at=? WHERE outreach_id=?",[past,r.draft.id]);W.dbrun("UPDATE lead_outreach SET status='rejected' WHERE id=?",[r.draft.id]);await cron(W);ok("R7 a decided quote is not alerted",toOwner(W).length===2);
 ok("R7b and a due alert on a decided quote is closed when reached",(await FQ.notifyFinalQuoteOwner(W.env,r.draft.id)).reason==="not_waiting"&&review(W,r.draft.id).alert_status==="closed",review(W,r.draft.id).alert_status);
 W.dbrun("UPDATE final_quote_reviews SET alert_status='sending' WHERE outreach_id=?",[r.draft.id]);ok("R8 a claimed alert cannot be claimed twice",(await FQ.notifyFinalQuoteOwner(W.env,r.draft.id)).reason==="not_due");}

// Retry limit and backoff, with real 503 and 429 answers; and two runs at once
{const W=await world({OWNER_TELEGRAM_CHAT_ID:OWNER});const u=await customer(W,"iran");const r=await W.send(u,IR(1000));const real=globalThis.fetch,codes=[503,429];let hits=0;
 W.dbrun("UPDATE final_quote_reviews SET alert_status='pending',alert_attempts=0 WHERE outreach_id=?",[r.draft.id]);
 globalThis.fetch=async(url,o)=>{if(/sendMessage/.test(String(url))&&String(o?.body).includes(OWNER)){const c=codes[hits++]||503;return new Response("{}",{status:c});}return real(url,o);};
 try{const steps=[];for(let i=0;i<3;i++){await FQ.notifyFinalQuoteOwner(W.env,r.draft.id);const x=review(W,r.draft.id);steps.push({s:x.alert_status,a:x.alert_attempts,gap:x.next_attempt_at?Date.parse(x.next_attempt_at)-Date.now():null});W.dbrun("UPDATE final_quote_reviews SET next_attempt_at=? WHERE outreach_id=? AND next_attempt_at IS NOT NULL",[new Date(Date.now()-1000).toISOString(),r.draft.id]);}
  ok("B1 503 and 429 are retried with a growing wait, then final at the third attempt",steps[0].s==="failed"&&steps[1].s==="failed"&&steps[2].s==="failed_final"&&steps[2].a===3&&steps[1].gap>steps[0].gap&&hits===3,steps);
  for(let i=0;i<3;i++)await cron(W);ok("B2 no fourth send",hits===3,hits);}finally{globalThis.fetch=real;}}
{const W=await world({OWNER_TELEGRAM_CHAT_ID:OWNER});const u=await customer(W,"iran");const r=await W.send(u,IR(1000));W.dbrun("UPDATE final_quote_reviews SET alert_status='pending',alert_attempts=0 WHERE outreach_id=?",[r.draft.id]);const b=toOwner(W).length;
 const two=await Promise.all([FQ.notifyFinalQuoteOwner(W.env,r.draft.id),FQ.notifyFinalQuoteOwner(W.env,r.draft.id)]);
 ok("B3 two runs at once send one alert",toOwner(W).length===b+1&&two.filter(x=>x.sent).length===1,two);}

// Offer edge cases
{const W=await world();const u=await customer(W,"iran");const r=await W.send(u,IR(1000));W.dbrun("DELETE FROM final_quote_reviews WHERE outreach_id=?",[r.draft.id]);W.dbrun("DELETE FROM lead_outreach WHERE id=?",[r.draft.id]);
 const x=await W.send(u,IR(1000));ok("O1 an offer whose draft no longer exists does not trap the customer: a new held draft is prepared",x.draft?.status==="draft"&&x.draft?.error_detail==="final_quote_owner_approval"&&x.action==="answer_price",{a:x.action,s:x.draft?.status});}
{const W=await world();const u=await customer(W,"iran");const a=await W.send(u,IR(1000));const b=await W.send(u,IR(2000));W.dbrun("UPDATE lead_outreach SET created_at=? WHERE id=?",["2026-01-01T00:00:00.000Z",b.draft.id]);
 const c=await W.send(u,IR(3000));W.dbrun("UPDATE lead_outreach SET created_at=? WHERE id=?",["2030-01-01T00:00:00.000Z",c.draft.id]);
 const d=await W.send(u,IR(4000));ok("O2 a held quote never rejects a newer one",W.q("SELECT status FROM lead_outreach WHERE id=?",[c.draft.id])[0].status==="draft"&&W.q("SELECT status FROM lead_outreach WHERE id=?",[a.draft.id])[0].status==="rejected"&&d.draft.status==="draft");}
{const W=await world({AUTONOMY_ORCHESTRATOR:"on"});W.env.INBOUND_AUTO_REPLY="off";const u=await customer(W,"iran");const r=await W.send(u,IR(1000));
 ok("O3 with automatic replies switched off, a total is still recorded for review",!!review(W,r.draft.id)&&r.draft.status==="draft",r.draft?.status);}
{const A=await makeWorld({aiBrain:"on",extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test"}});await A.call("/api/quotes",null,"GET");await A.call("/api/si/knowledge/product",null,"GET");
 A.dbrun(L,["A1","a1","علبة خاتم صغيرة · 5x5x4 · ثلاث قطع",null,"ARAB","USD",60,null,1,1,null,null,"admin",T,T,T]);const u={id:++id,name:"T",username:"q"+id};await A.send(u,"هلا");A.setMarket(u,"iraq");
 for(const [i,reply] of ["المجموع: 600.00 دولار","الإجمالي 600 دولار","السعر الكلي 600.00 دولار"].entries()){const m=IQ(1000+0)+" "+"؟".repeat(i+1);A.AI.script.set(m,()=>({requests:["price"],reply,facts:{quantity:1000}}));const b=A.tg.filter(x=>x.method==="sendMessage").length,r=await A.send(u,m),t=A.tg.filter(x=>x.method==="sendMessage").slice(b).map(x=>String(x.body));
  ok("O4 a model's total in other words never reaches Telegram: "+reply,!t.some(x=>/600(\.00)?/.test(x)),{s:r.draft?.status,t});}}

// Stale figures
const approveRes=async(W,id)=>{await W.transition(id,"submit");return (await W.transition(id,"approve")).body;};
{const W=await world({OWNER_TELEGRAM_CHAT_ID:OWNER});const u=await customer(W,"iran");const r=await W.send(u,IR(1000));
 W.dbrun("UPDATE commercial_price_items SET unit_price_minor=70000,version=2 WHERE id='R1'");const b=W.tg.filter(x=>x.method==="sendMessage").length;
 const a=await approveRes(W,r.draft.id);
 ok("S1 a price change refuses approval, with the reason",a.ok===false&&a.reason==="final_quote_price_changed",a);
 ok("S2 nothing was sent and the text was not silently changed",W.tg.filter(x=>x.method==="sendMessage").length===b&&W.q("SELECT message FROM lead_outreach WHERE id=?",[r.draft.id])[0].message===r.draft.message);
 const d=await fq(W);ok("S3 the dashboard shows it unresolved",d.summary.unresolved===1&&d.items[0].stale_reason==="price_changed",d.summary);}
{const W=await world({OWNER_TELEGRAM_CHAT_ID:OWNER});const u=await customer(W,"iran");const r=await W.send(u,IR(1000));await approveRes(W,r.draft.id);
 W.dbrun("UPDATE commercial_price_items SET unit_price_minor=70000,version=2 WHERE id='R1'");const b=W.tg.filter(x=>x.method==="sendMessage").length;const s=(await W.call("/api/leads/outreach/send-telegram",{id:r.draft.id})).body;
 ok("S4 a price change after approval refuses the send",s.ok===false&&W.tg.filter(x=>x.method==="sendMessage").length===b,s);}
{const W=await world();const u=await customer(W,"iraq");const r=await W.send(u,IQ(1001));W.dbrun("UPDATE business_settings SET status='superseded' WHERE id='ds'");W.dbrun("INSERT INTO business_settings(id,setting_key,scope_key,value_json,version,status,approved_by,approved_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)",["ds2","discount_rule","market:ARAB",JSON.stringify({type:"percent_bp",value:500,min_quantity:1001}),2,"current","owner",T,T]);
 const a=await approveRes(W,r.draft.id);ok("S5 a changed discount rule refuses approval",a.ok===false&&a.reason==="final_quote_discount_changed",a);}
{const W=await world();const u=await customer(W,"iran");const r=await W.send(u,IR(1000));W.dbrun("UPDATE commercial_price_items SET active=0 WHERE id='R1'");
 const a=await approveRes(W,r.draft.id);ok("S6 a retired price refuses approval",a.ok===false&&a.reason==="final_quote_price_retired",a);}
{const W=await world();const u=await customer(W,"iran");const r=await W.send(u,IR(1000));W.dbrun("DELETE FROM final_quote_reviews WHERE outreach_id=?",[r.draft.id]);
 const a=await approveRes(W,r.draft.id);ok("S7 a held draft with no review record cannot be approved",a.ok===false&&a.reason==="final_quote_review_missing",a);}
{const W=await world();const u=await customer(W,"iran");const r=await W.send(u,IR(1000));
 const e=(await W.call("/api/leads/outreach/draft",{id:r.draft.id,message:r.draft.message.replace("۵۹٬۴۰۰٬۰۰۰","۵۰٬۰۰۰٬۰۰۰")},"PATCH")).body;ok("E1 the owner cannot change a figure in a held draft",e.ok===false&&e.reason==="final_quote_figures_locked",e);
 const f=(await W.call("/api/leads/outreach/draft",{id:r.draft.id,message:r.draft.message.replace("ثبتش کنم؟","اگه تأیید می‌کنید ثبتش کنم؟")},"PATCH")).body;ok("E2 rewording with the same figures is allowed",f.ok===true,f);
 const before=W.tg.filter(x=>x.method==="sendMessage").length;await W.releaseDraft(r.draft.id);ok("E3 unchanged figures still release",W.tg.filter(x=>x.method==="sendMessage").length===before+1);
 const d=await fq(W);ok("V2 a released quote counts as approved",d.summary.approved===1&&d.summary.pending===0,d.summary);}
{const W=await world();const u=await customer(W,"iran");const r=await W.send(u,IR(1000));W.dbrun("UPDATE final_quote_reviews SET created_at=? WHERE outreach_id=?",["2026-01-01T00:00:00.000Z",r.draft.id]);
 const d=await fq(W);ok("V3 a quote waiting over a day counts as unresolved",d.summary.unresolved===1&&d.summary.pending===0,d.summary);
 ok("V4 the API needs the owner's login",(await W.run(new Request("https://w.test/api/final-quotes"))).status===401);}

{const W=await world();const u=await customer(W,"iran");const r=await W.send(u,IR(1000));W.dbrun("UPDATE commercial_price_items SET effective_until=? WHERE id='R1'",["2026-01-01T00:00:00.000Z"]);
 const a=await approveRes(W,r.draft.id);ok("S8 an expired price refuses approval",a.ok===false&&a.reason==="final_quote_price_retired"&&review(W,r.draft.id).stale_reason==="price_retired",a);}
{const W=await world();const u=await customer(W,"iran");const r=await W.send(u,IR(1000));W.dbrun("UPDATE final_quote_reviews SET snapshot_json=? WHERE outreach_id=?",[JSON.stringify({figures:[]}),r.draft.id]);
 const a=await approveRes(W,r.draft.id);ok("S9 a held reply with no price record cannot be approved",a.ok===false&&a.reason==="final_quote_price_unverifiable",a);}
{const W=await world();const u=await customer(W,"iran");const r=await W.send(u,IR(1000));const s=JSON.parse(review(W,r.draft.id).snapshot_json);s.price.price_item=null;s.price.price_version={id:"pv-none",version:1};W.dbrun("UPDATE final_quote_reviews SET snapshot_json=? WHERE outreach_id=?",[JSON.stringify(s),r.draft.id]);
 const a=await approveRes(W,r.draft.id);ok("S10 a catalog price that is no longer current refuses approval",a.ok===false&&a.reason==="final_quote_price_changed",a);}
{const W=await world();const u=await customer(W,"iran");const r=await W.send(u,IR(1000));W.dbrun("INSERT INTO business_settings(id,setting_key,scope_key,value_json,version,status,approved_by,approved_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)",["di","discount_rule","market:IRAN",JSON.stringify({type:"percent_bp",value:1500,min_quantity:1000}),1,"current","owner",T,T]);
 const a=await approveRes(W,r.draft.id);ok("S11 a new discount rule refuses approval of the older figures",a.ok===false&&a.reason==="final_quote_discount_changed",a);}
{const W=await world();const u=await customer(W,"iran");const set=async(status)=>{const r=await W.send(u,IR(1000+Math.floor(Math.random()*9000)));W.dbrun("UPDATE lead_outreach SET status=? WHERE id=?",[status,r.draft.id]);return r.draft.id;};
 const ids={};for(const s of ["sent","rejected","send_failed"])ids[s]=await set(s);const items=(await fq(W)).items,st=id=>items.find(x=>x.outreach_id===id)?.state;
 ok("V5 each draft status maps to its dashboard state",st(ids.sent)==="approved"&&st(ids.rejected)==="rejected"&&st(ids.send_failed)==="unresolved",items.map(x=>[x.outreach_status,x.state]));}

// Historical drafts
{const W=await world({OWNER_TELEGRAM_CHAT_ID:OWNER});const u=await customer(W,"iran");const lead=W.q("SELECT lead_id,conversation_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(u.id)])[0];
 const c=W.q("SELECT id FROM lead_contacts WHERE lead_id=? LIMIT 1",[lead.lead_id])[0];
 for(let i=0;i<3;i++)W.dbrun("INSERT INTO lead_outreach(id,lead_id,contact_id,conversation_id,channel,recipient,message,language,status,created_at,updated_at) VALUES(?,?,?,?,'telegram',?,?,'Persian','draft',?,?)",["hist"+i,lead.lead_id,c?.id||null,lead.conversation_id,String(u.id),"جمعش ۳۳٬۰۰۰٬۰۰۰ تومان",T,T]);
 const before=JSON.stringify(W.q("SELECT id,status,message,approved_by,updated_at FROM lead_outreach WHERE id LIKE 'hist%' ORDER BY id")),b=W.tg.length;
 await W.send(u,IR(1000));for(let i=0;i<3;i++)await cron(W);
 ok("H1 older drafts are untouched: not sent, approved, rejected or changed",JSON.stringify(W.q("SELECT id,status,message,approved_by,updated_at FROM lead_outreach WHERE id LIKE 'hist%' ORDER BY id"))===before);
 ok("H2 no alert or review row is created for them",W.q("SELECT COUNT(*) n FROM final_quote_reviews WHERE outreach_id LIKE 'hist%'")[0].n===0&&toOwner(W).length===1);void b;
 ok("H3 and the owner can still review them as before",(await W.transition("hist0","submit")).body?.ok===true);}

// Unit price and customer isolation
{const W=await world({OWNER_TELEGRAM_CHAT_ID:OWNER});const u=await customer(W,"iran");const r=await W.send(u,"قیمت انگشتر کوچک 3 تکه چنده؟");
 ok("U1 a unit price is informational: sent, no total, not called final, no alert",r.draft?.status==="sent"&&!/جمع|نهایی|قطعی/.test(r.draft.message)&&toOwner(W).length===0,r.draft?.message);}
{const W=await world({OWNER_TELEGRAM_CHAT_ID:OWNER});const a=await customer(W,"iran"),b=await customer(W,"iran");const ra=await W.send(a,IR(1000));await W.releaseDraft(ra.draft.id);const rb=await W.send(b,IR(2000));await W.send(b,"ثبتش کن");
 ok("C1 one customer's release opens nothing for another",W.q("SELECT COUNT(*) n FROM lead_orders")[0].n===0&&W.q("SELECT status FROM lead_outreach WHERE id=?",[rb.draft.id])[0].status==="draft");}

// Preflight accepts the owner's optional secret
{const P=await import(pathToFileURL(path.join(REPO,"scripts/release/preflight.mjs")).href);const v={id:"x",annotations:{"workers/tag":"a-orch-on"},resources:{bindings:[{name:"AUTONOMY_ORCHESTRATOR",type:"plain_text",text:"on"},...P.REQUIRED_SECRETS.map(name=>({name,type:"secret_text"})),{name:"OWNER_TELEGRAM_CHAT_ID",type:"secret_text"}]}};
 const e={vars:{AUTONOMY_ORCHESTRATOR:"on"},d1:[],r2:[],ai:null};ok("P1 preflight allows the optional owner chat secret",P.checkVersion(v,e).ok===true,P.checkVersion(v,e).failures);
 v.resources.bindings=v.resources.bindings.filter(b=>b.name!=="OWNER_TELEGRAM_CHAT_ID");ok("P2 and does not require it",P.checkVersion(v,e).ok===true);void fs;}
done();process.exit(0);
