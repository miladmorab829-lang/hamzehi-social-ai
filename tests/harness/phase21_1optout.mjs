// PHASE 21.1 — customer opt-out classification. A real stop request (fa / Iraqi ar / en, short or inside a long message) stops every
// automatic message and the owner's send; a stop word inside code, a quotation, a log or a technical explanation does not; an
// ambiguous message waits for the owner (no automatic commercial message, owner not blocked); a result Production already applied
// before the release is kept until the owner reviews it. Synthetic data only; Telegram is the in-process mock.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase21_1optout");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const AM=await import(pathToFileURL(path.join(SRC,"auto-sales-messaging.js")).href);
const C=t=>AM.classifyOptOut(t).state;

// ---- K: classifier
const realStops=["STOP","stop","Stop please","STOP!!!","unsubscribe","لغو","توقف","بطل","استاپ",
  "لطفاً دیگه پیام ندید","دیگه به من پیام نده","پیام نفرستید","مزاحم نشید","منو از لیستتون حذف کنید","نمی‌خوام دیگه پیام تبلیغاتی بفرستید",
  "لا تراسلني","لا ترسلون بعد","لا ترسلي رسائل","بطلوا رسائل","الغاء الاشتراك","ما اريد رسائل","شيلوني من القائمة",
  "Please stop messaging me","Don't text me again","remove me from your list","I want to unsubscribe","no more messages please","unsubscribe me",
  "نمی‌خواهم پیام دریافت کنم","شماره منو حذف کنید","مزاحمم نشید","لا تبعثلي","وقف الرسائل","شيلني من القائمة","احذفني",
  "Don't send me anything","do not send me messages","leave me alone","remove my number","Please unsubscribe me, I will return to you later"];
ok("K1 explicit stop requests are recognised (Persian, Iraqi Arabic, English; STOP, unsubscribe)",realStops.every(t=>C(t)==="opt_out"),realStops.filter(t=>C(t)!=="opt_out"));
const longReal="سلام آقای حمزه‌ای، ممنون از توضیحات کامل‌تون درباره جعبه‌های جواهر. ما چند ماه پیش از شما خرید کرده بودیم و راضی بودیم، "
  +"ولی فعلاً برنامه خرید جدیدی نداریم و مغازه را هم داریم جابجا می‌کنیم. لطفاً دیگه پیام تبلیغاتی نفرستید. هر وقت لازم شد خودم پیام می‌دم. موفق باشید.";
const longRealEn="Hi, thanks for the catalogue you sent last month. We looked at it with my partner and decided to keep working with our current supplier "
  +"in Erbil for now because of the delivery times. I appreciate the effort, but please stop sending me these offers. Best regards, Ahmad";
const longAr="مرحبا اخي، شكرا على العرض والكتالوج اللي دزيتوه الشهر الماضي. احنا شفنا الاسعار وقارناها ويه الموردين بالسوق، والحقيقة هسه ما عدنا ميزانية للشراء "
  +"لان المحل راح نغلقه فترة للتصليحات، وبعدين نشوف شنو نحتاج للموسم الجاي. اذا احتجنا شي احنا نتواصل وياكم. الله يوفقكم وبالتوفيق بشغلكم، بس رجاءا لا تدزون رسائل بعد";
ok("K2 an explicit stop request inside a LONG ordinary message is recognised (Persian, Iraqi Arabic, English — not just short messages)",C(longReal)==="opt_out"&&C(longRealEn)==="opt_out"&&longAr.length>300&&C(longAr)==="opt_out",[C(longReal),C(longRealEn),C(longAr),longAr.length]);
const tech="Synthetic developer note about the order dashboard and the reply flow.\n\n1. The bot must stop repeating the greeting when the customer already answered.\n"
  +"2. Check worker/src/index.js and sales-brain.js: the inbound handler should stop the loop after the first reply.\n3. Add a regression test in tests/harness for the webhook.\n"
  +"Requirements:\n- never send prices without the owner\n- keep the D1 schema unchanged\n- the cron must not stop on a single failure\n".repeat(8);
ok("K3 a long technical text that mentions 'stop' is NOT a stop request",C(tech)==="none",AM.classifyOptOut(tech));
const code1="I tried this and got an error:\n```\nif (cmd === 'stop') { bot.stop(); }\nconsole.log('stop')\n```\nwhat should I do?";
const code2="the button `STOP` is not working on the dashboard",quote1="my friend told me: \"stop buying from them\" but I want 50 boxes",quote2="> STOP\nprice for 50 boxes?",
  log1="2026-11-01T10:00:00Z ERROR: worker stop requested\nhow much is the ring box?";
const codeFa="کد: `stop` کار نمی‌کند، چرا؟",quoteAr='قال لي صديقي "لا ترسل" بس اريد 50 علبة',quoteFa='دوستم گفت «دیگه پیام نده» ولی من ۵۰ تا جعبه می‌خوام';
const K4=[code1,code2,quote1,quote2,log1,codeFa,quoteAr,quoteFa];
ok("K4 'stop' inside code, inline code, a quotation, a quoted line or a log line is NOT a stop request (en, fa, ar)",K4.every(t=>C(t)==="none"),K4.map(C));
ok("K4b a message that is ONLY a quoted/inline-code stop word is held for review — never silently ignored",C('"STOP"')==="review"&&C("`STOP`")==="review"&&C("«لغو»")==="review");
const amb=["enough","stop it with the prices","بس کن","کافیه دیگه","دیگه نفرستید","ما ترسلون بعد","کافی",
  "Hello, I keep getting these offers from your company every day on my phone, please stop","هر روز از شما پیام تبلیغاتی میگیرم لطفا متوقف کنید"];
ok("K5b short clear commands count as stop requests (ok stop / please stop / بسه دیگه)",C("ok stop")==="opt_out"&&C("please stop")==="opt_out"&&C("بسه دیگه")==="opt_out");
const buy=["لغو سفارش","stop the order","ما ترسلون الصور؟","ما ترسلون للعراق؟","Is 100 pieces enough?","این مقدار کافی است؟","بس هسه","بس شكرا","Can you stop the price at 500?","لا ترسل الطلب قبل ما ادفع","توقف کنید؟ هنوز سفارش ثبت نشده"];
ok("K5c buyer messages about orders, delivery questions and quantities do not stop contact (none)",buy.every(t=>C(t)==="none"),buy.map(t=>[t,C(t)]));
ok("K5 ambiguous messages are flagged for the owner's review (no automatic message), never a hard opt-out",amb.every(t=>C(t)==="review"),amb.map(t=>[t,C(t)]));
const normal=["سلام، جعبه جواهر مشکی دارید؟","قیمت جعبه انگشتر چنده؟","شنو عدكم علب ذهب؟","I want 200 boxes","I'll stop by your shop tomorrow","the bus stop near your store","hello, send me the catalogue"];
ok("K6 normal sales messages are not stop requests (no false stop)",normal.every(t=>C(t)==="none"),normal.map(t=>[t,C(t)]));
ok("K7 normalisation keeps the meaning: Arabic/Persian letter forms, diacritics, ZWNJ and tatweel do not hide a request",
  C("لا تراسلنى")==="opt_out"&&C("لا تُراسِلني")==="opt_out"&&C("دیگه پیام نـــده")==="opt_out"&&C("الغاء الإشتراك")==="opt_out"&&C("ＳＴＯＰ")==="opt_out");
ok("K8 a customer's explicit request inside a long technical text is a HARD opt-out (owner policy: explicit = definitive)",
  C(tech+"\nAlso: please stop messaging me on this number.")==="opt_out"&&C(tech+"\nلطفاً دیگه به من پیام ندید.")==="opt_out");
ok("K8b a sentence that describes what a bot/system should do is held for review, not a hard opt-out",
  C(tech+"\n- the bot should stop messaging me twice when I answer")==="review"&&C(tech+"\nربات باید وقتی جواب دادم دیگه پیام نده")==="review");
{const own=["اگر ممکنه دیگه پیام نفرستید","باید دیگه به من پیام ندید","اذا سمحت لا ترسل لي رسائل","لازم ما تدزون لي رسائل بعد"],
   ownTech=["- remove my number","1. do not contact me","stop messaging me on this app","stop sending me test messages"].map(l=>tech+"\n"+l),
   reported=["العميل كتب: لا ترسل لي رسائل","مشتری نوشته دیگه پیام نده","the customer wrote: stop messaging me"];
 ok("K10 a customer's own request stays a HARD opt-out even with polite/conditional words or as a list item in a technical text",
   [...own,...ownTech].every(t=>C(t)==="opt_out"),[...own,...ownTech].map(t=>[t.slice(-40),C(t)]));
 ok("K11 reported speech (someone else's words, unquoted) is held for review, never a hard opt-out",reported.every(t=>C(t)==="review"),reported.map(t=>[t,C(t)]));}
{let worst=0;for(const w of ["مزاحم","پیام","لیست","اشتراک","شماره","stop","لا","دیگه","بس"])for(const sep of [""," "]){const v=(w+sep).repeat(Math.ceil(50000/(w.length+sep.length)));const t=performance.now();C(v);worst=Math.max(worst,performance.now()-t);}
 ok("K9 no slow pattern: 18 adversarial 50,000-character inputs are each classified in < 500 ms (Telegram max is 4,096)",worst<500,worst);}

// ---- L: per-customer state
const T=(d)=>new Date(Date.parse("2026-11-10T12:00:00Z")-d*86400000).toISOString();
const BOUNDARY="2026-11-05T00:00:00Z",st=rows=>AM.optOutStateFromMessages(rows,{cutoff:BOUNDARY});
ok("L1 repeated messages: a STOP among later normal questions still stops (newest first); repeated STOPs stay one opt-out",
  st([{id:"3",message:"price?",created_at:T(0)},{id:"2",message:"STOP",created_at:T(1)},{id:"1",message:"hi",created_at:T(2)}]).opted_out===true
  &&st([{id:"2",message:"STOP",created_at:T(0)},{id:"1",message:"STOP",created_at:T(1)}]).message_id==="2");
ok("L2 a technical text after the release is not an opt-out; an earlier (pre-release) result is KEPT until the owner reviews it",
  st([{id:"t",message:tech,created_at:T(0)}]).opted_out===false
  &&(()=>{const s=st([{id:"old",message:tech,created_at:"2026-10-07T11:29:36Z"}]);return s.opted_out===true&&s.review===true&&s.legacy===true;})());
ok("L3 ambiguous → review only (owner not blocked)",(()=>{const s=st([{id:"a",message:"enough",created_at:T(0)}]);return s.opted_out===false&&s.review===true;})());
ok("L4 a later friendly message never lifts an earlier stop request (only the owner can)",st([{id:"2",message:"yes send prices please",created_at:T(0)},{id:"1",message:"لا تراسلني",created_at:T(1)}]).opted_out===true);
ok("L5 with no known boundary every message keeps its earlier result (safest default)",
  AM.optOutStateFromMessages([{id:"t",message:tech,created_at:"2027-01-01T00:00:00Z"}]).opted_out===true);

// ---- B: the rule-change boundary is the instant the new rules FIRST ran (write-once); older messages are never re-judged
{const W0=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on"}});
 W0.d1.db.exec("CREATE TABLE IF NOT EXISTS system_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");   // exists on Production
 const I0=await import(pathToFileURL(path.join(SRC,"index.js")).href+"?b="+Math.random());
 const k=()=>W0.q("SELECT value FROM system_kv WHERE key=?",[AM.OPT_OUT_RULES_KEY]);
 const before=k().length;await I0.runAutoSalesMessaging(W0.env,{});const v1=k()[0]?.value;
 const I1=await import(pathToFileURL(path.join(SRC,"index.js")).href+"?b2="+Math.random());   // a later deploy (fresh isolate)
 await new Promise(r=>setTimeout(r,20));await I1.runAutoSalesMessaging(W0.env,{});const v2=k()[0]?.value;
 ok("B1 the first run records the boundary once (rules phase21.1); a later deploy/isolate never moves it",before===0&&!!v1&&v1===v2&&JSON.parse(v1).rules==="phase21.1"&&Math.abs(Date.parse(JSON.parse(v1).since)-Date.now())<60000,[v1,v2]);
 // legacy-like history: an old technical message with "stop", received BEFORE the boundary → its earlier result (opt-out) is kept
 const u={id:9901,name:"Legacy customer",username:"lg9901"};await W0.send(u,tech);W0.setMarket(u,"iran");
 const lid=W0.q("SELECT lead_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",["9901"])[0].lead_id;
 W0.dbrun("UPDATE inbox_messages SET created_at=? WHERE lead_id=?",["2026-10-07T11:29:36Z",lid]);
 W0.dbrun("INSERT INTO lead_outreach(id,lead_id,channel,recipient,message,language,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",["own-lg",lid,"telegram","9901","سلام","Persian","pending_approval","2026-11-01T00:00:00Z","2026-11-01T00:00:00Z"]);
 const r=await W0.call("/api/leads/outreach/transition",{id:"own-lg",action:"approve"}),ov0=(await W0.call("/api/sales/auto-messaging",null,"GET")).body.opt_out;
 ok("B2 a pre-boundary result is preserved after the new deploy: still opted out (owner 409), listed as legacy pending owner review",
   r.status===409&&r.body?.reason==="customer_opted_out"&&ov0.opted_out.some(x=>x.lead_id===lid&&x.legacy)&&ov0.legacy_pending_owner_review>=1&&ov0.rules_since===JSON.parse(v1).since,[r.status,r.body?.reason,ov0]);
 // corrupt boundary row → never rewritten, every message keeps its earlier result (fresh isolate, no cache)
 W0.dbrun("UPDATE system_kv SET value='garbage' WHERE key=?",[AM.OPT_OUT_RULES_KEY]);
 const I2=await import(pathToFileURL(path.join(SRC,"index.js")).href+"?b3="+Math.random());await I2.runAutoSalesMessaging(W0.env,{});
 W0.dbrun("UPDATE lead_outreach SET status='pending_approval' WHERE id='own-lg'");
 const r3=await W0.call("/api/leads/outreach/transition",{id:"own-lg",action:"approve"});
 ok("B3 a corrupt boundary row is not rewritten and the earlier opt-out is still kept (safest reading)",k()[0]?.value==="garbage"&&r3.status===409&&r3.body?.reason==="customer_opted_out",[k(),r3.status]);
 // boundary unreadable (table missing / D1 error) → still kept
 W0.d1.db.exec("ALTER TABLE system_kv RENAME TO system_kv_off");
 const I3=await import(pathToFileURL(path.join(SRC,"index.js")).href+"?b4="+Math.random());await I3.runAutoSalesMessaging(W0.env,{}).catch(()=>{});
 const r4=await W0.call("/api/leads/outreach/transition",{id:"own-lg",action:"approve"});
 W0.d1.db.exec("ALTER TABLE system_kv_off RENAME TO system_kv");
 ok("B4 if the boundary cannot be read at all, the earlier opt-out is still kept (409)",r4.status===409&&r4.body?.reason==="customer_opted_out",[r4.status,r4.body?.reason]);}

// ---- R: end-to-end with the runner (switch ON)
// the boundary row is placed before the synthetic history so the NEW rules run end-to-end (legacy behaviour: L2, B2)
const W=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on"}});const {q,dbrun,call,send,setMarket}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
W.d1.db.exec("CREATE TABLE IF NOT EXISTS system_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
dbrun("INSERT INTO system_kv(key,value,updated_at) VALUES(?,?,?)",[AM.OPT_OUT_RULES_KEY,JSON.stringify({since:"2026-01-01T00:00:00Z",rules:AM.OPT_OUT_RULES_ID}),"2026-01-01T00:00:00Z"]);
const AE=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+"?a="+Math.random());await AE.autonomyMasterGate(W.env);
const IDX=await import(pathToFileURL(path.join(SRC,"index.js")).href+"?r="+Math.random());
const NOW=Date.now(),run=(nowMs)=>IDX.runAutoSalesMessaging(W.env,{nowMs,internalFetch:r=>W.run(new Request(r.url.replace("https://internal.local","https://w.test"),r))});
const ago=d=>new Date(NOW-d*86400000).toISOString();
let uid=8100;const customer=async(name,lastText)=>{const u={id:++uid,name,username:"o"+uid};await send(u,"سلام، جعبه می‌خواهم");setMarket(u,"iran");
  const lid=q("SELECT lead_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(u.id)])[0].lead_id;
  dbrun("UPDATE inbox_messages SET created_at=? WHERE lead_id=?",[ago(16),lid]);
  if(lastText!=null)dbrun("INSERT INTO inbox_messages(id,platform,external_id,sender,message,category,priority,status,lead_id,provider_sender_id,provider_conversation_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ["m-"+uid,"telegram","x-"+uid,name,lastText,"unclassified","normal","new",lid,String(u.id),String(u.id),ago(15.5),ago(15.5)]);
  const c=q("SELECT id FROM lead_contacts WHERE lead_id=? AND contact_type='telegram' LIMIT 1",[lid])[0];
  dbrun("DELETE FROM lead_outreach WHERE lead_id=?",[lid]);
  // our last message went out after their last message, 15 days ago → a follow-up is due (unless something stops it)
  const sentAt=ago(15);
  dbrun("INSERT INTO lead_outreach(id,lead_id,contact_id,channel,recipient,message,language,status,approved_at,approved_by,sent_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",["prev-"+lid,lid,c?.id||null,"telegram",String(u.id),"earlier reply","Persian","sent",sentAt,"admin",sentAt,sentAt,sentAt]);
  return {u,lid};};
await call("/api/sales/auto-messaging",{enabled:true,owner_approved:true,local_start_hour:0,local_end_hour:24,per_run:5});
const autoRows=lid=>q("SELECT status FROM lead_outreach WHERE lead_id=? AND approved_by=?",[lid,AM.AUTO_POLICY_ACTOR]);
const P=await customer("Tech text customer",tech),S=await customer("Real stop customer","لطفاً دیگه پیام ندید"),A=await customer("Ambiguous customer","enough");
const due=NOW;
const r1=await run(due);
ok("R1 a customer whose only 'stop' was inside a technical text still receives the permitted follow-up (no false stop)",autoRows(P.lid).some(x=>x.status==="sent"),[r1,autoRows(P.lid)]);
ok("R2 a real stop request blocks every automatic message",autoRows(S.lid).length===0&&(r1.skipped.customer_opted_out||0)>=1,r1);
ok("R3 an ambiguous message → no automatic message (opt_out_needs_review) …",autoRows(A.lid).length===0&&(r1.skipped.opt_out_needs_review||0)>=1,r1);
dbrun("INSERT INTO lead_outreach(id,lead_id,channel,recipient,message,language,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",["own-A",A.lid,"telegram",String(A.u.id),"سلام","Persian","pending_approval",ago(0),ago(0)]);
dbrun("INSERT INTO lead_outreach(id,lead_id,channel,recipient,message,language,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",["own-S",S.lid,"telegram",String(S.u.id),"سلام","Persian","pending_approval",ago(0),ago(0)]);
const oa=await call("/api/leads/outreach/transition",{id:"own-A",action:"approve"}),os=await call("/api/leads/outreach/transition",{id:"own-S",action:"approve"});
ok("R4 … but the owner can still answer the ambiguous customer, while a real opt-out returns 409 to the owner too",oa.body?.reason!=="customer_opted_out"&&os.status===409&&os.body?.reason==="customer_opted_out",[oa.status,oa.body?.reason,os.status,os.body?.reason]);
// stop request AFTER the automation has already sent: the next due follow-up is never sent
const Z=await customer("Control customer","ممنون، فعلاً بررسی می‌کنیم");
const age=(lid,days)=>{const t=ago(days);dbrun("UPDATE lead_outreach SET sent_at=?,approved_at=?,created_at=?,updated_at=? WHERE lead_id=? AND status='sent'",[t,t,t,t,lid]);};
await send(P.u,"STOP");dbrun("UPDATE inbox_messages SET created_at=? WHERE lead_id=? AND message='STOP'",[ago(15.2),P.lid]);
// timeline: our earlier reply (15.6 d) → their STOP (15.2 d) → our automatic follow-up (15 d); the bot's own acknowledgement of the STOP is
// removed so the follow-up count is not exhausted — the next follow-up is DUE and only the runner's opt-out check can stop it
dbrun("DELETE FROM lead_outreach WHERE lead_id=? AND status='sent' AND id<>? AND COALESCE(approved_by,'')<>?",[P.lid,"prev-"+P.lid,AM.AUTO_POLICY_ACTOR]);
// Phase 26: the STOP itself is no longer answered automatically — its draft is HELD (customer_opted_out); removed the same way
const heldP=dbrun("DELETE FROM lead_outreach WHERE lead_id=? AND status='draft' AND error_detail='customer_opted_out'",[P.lid]).changes;
ok("R4z Phase 26: the inbound reply to the STOP was held, not sent",heldP===1,heldP);
age(P.lid,15);dbrun("UPDATE lead_outreach SET sent_at=?,approved_at=?,created_at=? WHERE id=?",[ago(15.6),ago(15.6),ago(15.6),"prev-"+P.lid]);
const before=autoRows(P.lid).length,r2=await run(due+60000);
dbrun("INSERT INTO lead_outreach(id,lead_id,channel,recipient,message,language,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",["own-P",P.lid,"telegram",String(P.u.id),"سلام","Persian","pending_approval",ago(0),ago(0)]);
const op=await call("/api/leads/outreach/transition",{id:"own-P",action:"approve"});
ok("R5 a STOP received after the automation was ON and had already sent → no further automatic message, and the owner is stopped too (409)",
  before>=1&&autoRows(P.lid).length===before&&(r2.skipped.customer_opted_out||0)>=1&&op.status===409&&op.body?.reason==="customer_opted_out",[before,autoRows(P.lid),r2,op.status]);
ok("R5b control: the same timeline WITHOUT a stop request is sent in that same run (R5 is not vacuous)",autoRows(Z.lid).some(x=>x.status==="sent"),[r2,autoRows(Z.lid)]);
{dbrun("DELETE FROM lead_outreach WHERE id='own-P'");   // (the owner's refused draft from R5 would otherwise hold this lead for the owner)
 const IDX2=await import(pathToFileURL(path.join(SRC,"index.js")).href+"?redeploy="+Math.random());   // a new deploy / fresh isolate
 const n0=autoRows(P.lid).length,r9=await IDX2.runAutoSalesMessaging(W.env,{nowMs:due+120000,internalFetch:r=>W.run(new Request(r.url.replace("https://internal.local","https://w.test"),r))});
 ok("R5d after a redeploy (fresh isolate) the stopped customer still gets nothing (no repeat send)",autoRows(P.lid).length===n0&&(r9.skipped.customer_opted_out||0)>=1,r9);}
const pid=String(P.u.id),dup="dup-"+P.lid;
dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",[dup,"same person, second lead","tg","new","normal","{}",ago(1),ago(1)]);
dbrun("INSERT INTO inbox_messages(id,platform,external_id,sender,message,category,priority,status,lead_id,provider_sender_id,provider_conversation_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",["dupm","telegram","x-dup","dup","سلام","unclassified","normal","new",dup,pid,pid,ago(1),ago(1)]);
dbrun("UPDATE leads SET notes=(SELECT notes FROM leads WHERE id=?) WHERE id=?",[P.lid,dup]);   // same recorded market as the first lead
dbrun("INSERT INTO lead_outreach(id,lead_id,channel,recipient,message,language,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",["own-dup",dup,"telegram",pid,"سلام","Persian","pending_approval",ago(0),ago(0)]);
const od=await call("/api/leads/outreach/transition",{id:"own-dup",action:"approve"});
ok("R5c the same Telegram sender under a second lead keeps the stop request (409)",od.status===409&&od.body?.reason==="customer_opted_out",[od.status,od.body?.reason]);
const ov=(await call("/api/sales/auto-messaging",null,"GET")).body.opt_out;
ok("R6 the status shows confirmed opt-outs and conversations needing review (read-only)",ov.opted_out.some(x=>x.lead_id===S.lid)&&ov.opted_out.some(x=>x.lead_id===P.lid)&&ov.needs_review.some(x=>x.lead_id===A.lid),ov);
ok("R7 no Places/AI call was made",!W.offNet().some(u=>/places\.googleapis|api\.openai|anthropic/.test(u)));
done();
