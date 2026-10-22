// PHASE 14 — operational readiness (local): Telegram delivery evidence + owner-only inbound health (no webhook change), scheduled-step
// isolation, revenue attribution accuracy (test leads / cancelled orders / partial-paid profit), Sales Brain fixes ("no printing" is a
// preference, not a rejection; Iraq / Iran cities; first-message script language) and dashboard readiness. Local only: Telegram,
// AI and OpenAI are in-process mocks; nothing reaches Production or a customer.
import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,J,done}=reporter("phase14");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const DAY=86400000,ago=(d,h=0)=>new Date(Date.now()-d*DAY-h*3600000).toISOString();
const W=await makeWorld({extraEnv:{TELEGRAM_CHAT_ID:"@hb_test_channel",PUBLIC_WORKER_BASE_URL:"https://w.test"}});const {q,dbrun,call,send,setMarket}=W;
W.d1.db.exec((await import("node:fs")).readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
W.env.AUTONOMY_ORCHESTRATOR="on";
const AE=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+"?p14="+Math.random());await AE.autonomyMasterGate(W.env);
const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;
const hook=(secret,body)=>W.run(new Request("https://w.test/webhooks/telegram",{method:"POST",headers:{"Content-Type":"application/json","X-Telegram-Bot-Api-Secret-Token":secret},body}));
const rejections=()=>q("SELECT id,details_json FROM system_events WHERE type='telegram_webhook_rejected' ORDER BY id");
const health=(live=false)=>call("/api/telegram/inbound-health"+(live?"?live=1":""),null,"GET");

// ================= Telegram delivery evidence (no webhook change) =================
{const r1=await hook("wrong-secret",JSON.stringify({update_id:1})),r2=await hook("wrong-secret",JSON.stringify({update_id:2})),r3=await hook("other",JSON.stringify({update_id:3}));
 ok("T1 a delivery with a wrong secret is still refused (401) and now leaves evidence — at most ONE row per reason per minute (3 rejections → 1 row, no payload)",[r1,r2,r3].every(r=>r.status===401)&&rejections().length===1&&JSON.parse(rejections()[0].details_json).reason==="secret_mismatch"&&!/update_id/.test(rejections()[0].details_json),rejections());
 const secret=W.env.TELEGRAM_WEBHOOK_SECRET_TOKEN||q("SELECT value FROM system_kv WHERE key='telegram_webhook_secret'")[0]?.value;
 const bad=await hook(secret,"{not json");
 ok("T2 an authenticated delivery with invalid JSON is refused (400) and recorded as invalid_json",bad.status===400&&rejections().some(x=>/invalid_json/.test(x.details_json)),rejections().map(x=>x.id));
 const kvv=()=>{try{return q("SELECT value FROM system_kv WHERE key='telegram_webhook_last_accepted'")[0]?.value||null;}catch{return null;}};const before=kvv();
 const u={id:714000001,name:"Tg",username:"tg_ok"};const s1=await send(u,"سلام");
 const after=kvv();
 ok("T3 an accepted delivery updates the single 'last accepted' timestamp and the normal pipeline still runs (inbox row + reply decision)",!!after&&after!==before&&!!s1.row,[before,after,!!s1.row]);}
{const noAuth=await W.run(new Request("https://w.test/api/telegram/inbound-health"));
 ok("T4 inbound health is owner-only (401 without token)",noAuth.status===401,noAuth.status);
 const h=(await health()).body;
 // (14.1 review rule) rejections FOLLOWED by a valid delivery are reported but are not a delivery failure; F3 covers FAILED
 ok("T5 recent rejections are surfaced as evidence (count + reason) from D1 only, no external call without live=1",h.ok&&h.live_checked===false&&h.evidence.rejections_24h>=1&&h.reasons.some(x=>/unauthenticated requests were rejected/.test(x))&&h.status!=="FAILED"&&h.configured.bot_token===true&&h.configured.public_channel===true,[h.status,h.reasons,h.evidence]);
 dbrun("DELETE FROM system_events WHERE type='telegram_webhook_rejected'");
 const h2=(await health()).body;
 ok("T6 without rejections and with a recent accepted delivery the status is READY (evidence-based)",h2.status==="READY",[h2.status,h2.reasons]);
 dbrun("UPDATE system_kv SET value=? WHERE key='telegram_webhook_last_accepted'",[ago(20)]);dbrun("UPDATE inbox_messages SET created_at=?",[ago(20)]);
 const h3=(await health()).body;
 ok("T7 no delivery for 7+ days and no live check → NOT_VERIFIED (zero traffic is not called a failure)",h3.status==="NOT_VERIFIED",[h3.status,h3.reasons]);
 // live check: getWebhookInfo (read-only) mocked
 const orig=globalThis.fetch;let calls=[];
 const withWebhook=async(result,fn)=>{globalThis.fetch=async(u,o)=>{const s=String(u?.url||u);if(/\/getWebhookInfo$/.test(s)){calls.push(s.replace(/bot[^/]+/,"bot<redacted>"));return new Response(JSON.stringify({ok:true,result}),{status:200,headers:{"Content-Type":"application/json"}});}if(/setWebhook|deleteWebhook/.test(s))throw new Error("webhook change attempted");return orig(u,o);};try{return await fn();}finally{globalThis.fetch=orig;}};
 const reg=q("SELECT details_json FROM system_events WHERE type='telegram_webhook_configured' ORDER BY created_at DESC LIMIT 1")[0];
 if(!reg)dbrun("INSERT INTO system_events VALUES(?,?,?,?,?,?)",["reg-1","telegram_webhook_configured","info","x",JSON.stringify({url:"https://w.test/webhooks/telegram"}),ago(30)]);
 const live1=(await withWebhook({url:"https://w.test/webhooks/telegram",pending_update_count:0},()=>health(true))).body;
 ok("T8 live check (read-only getWebhookInfo): URL is this Worker, no error, no traffic for 7+ days → NO_TRAFFIC; only non-secret fields are returned",live1.status==="NO_TRAFFIC"&&live1.live_checked&&live1.webhook.matches_this_worker===true&&!J(live1).includes(String(W.env.TELEGRAM_BOT_TOKEN))&&!/getWebhookInfo|\/bot/.test(J(live1))&&calls.length===1,[live1.status,live1.webhook]);
 const live2=(await withWebhook({url:"https://elsewhere.example/hook",pending_update_count:7},()=>health(true))).body;
 ok("T9 live check: webhook pointing elsewhere → MISCONFIGURED (host only, no path secrets)",live2.status==="MISCONFIGURED"&&live2.webhook.matches_this_worker===false&&live2.webhook.url_host==="elsewhere.example",[live2.status,live2.webhook]);
 const live3=(await withWebhook({url:"",pending_update_count:0},()=>health(true))).body;
 ok("T10 live check: no webhook registered → MISCONFIGURED",live3.status==="MISCONFIGURED"&&live3.webhook.url_set===false,[live3.status]);
 const live4=(await withWebhook({url:"https://w.test/webhooks/telegram",pending_update_count:3,last_error_date:Math.floor(Date.now()/1000)-600,last_error_message:"Wrong response from the webhook: 401 Unauthorized"},()=>health(true))).body;
 ok("T11 live check: Telegram reports a recent delivery error → FAILED with the error text (bounded)",live4.status==="FAILED"&&/401/.test(live4.webhook.last_error_message)&&live4.webhook.pending_update_count===3,[live4.status,live4.webhook]);
 const tok=W.env.TELEGRAM_BOT_TOKEN;delete W.env.TELEGRAM_BOT_TOKEN;const mis=(await health()).body;W.env.TELEGRAM_BOT_TOKEN=tok;
 ok("T12 no bot token → MISCONFIGURED; the health check never attempts a webhook change",mis.status==="MISCONFIGURED"&&mis.configured.bot_token===false,mis.status);}

// ================= scheduled-step isolation =================
{const origPrepare=W.env.DB.prepare.bind(W.env.DB);
 W.env.DB.prepare=sql=>{if(/ai_call_flights/.test(String(sql))&&/DELETE|UPDATE/i.test(String(sql)))throw new Error("simulated D1 failure (purge)");return origPrepare(sql);};
 const tick=async()=>{const p=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},W.env,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);};
 const hb0=q("SELECT last_finished_at FROM agent_heartbeat WHERE scheduler='watchdog'")[0]?.last_finished_at||null;
 await tick();await tick();W.env.DB.prepare=origPrepare;
 const fails=q("SELECT id,details_json FROM system_events WHERE type='scheduled_step_failed'");
 const hb1=q("SELECT last_finished_at FROM agent_heartbeat WHERE scheduler='watchdog'")[0]?.last_finished_at||null;
 ok("S1 a failing scheduled step (purge) is recorded once per hour (2 ticks → 1 row, sanitized) instead of being swallowed",fails.length===1&&JSON.parse(fails[0].details_json).step==="purge_ai_call_flights"&&/simulated D1 failure/.test(fails[0].details_json),fails);
 ok("S2 the other steps still run in the same tick (watchdog heartbeat advanced)",!!hb1&&hb1!==hb0,[hb0,hb1]);}

// ================= revenue attribution accuracy =================
{await call("/api/orders",null,"GET");await call("/api/si/decisions?status=PENDING",null,"GET");
 const lead=(id,notes)=>dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",[id,"L","c","customer","normal",JSON.stringify(notes),ago(30),ago(30)]);
 lead("RV-REAL",{source:"telegram_inbound"});lead("RV-TEST",{is_test:true});
 const order=(id,leadId,status,total,costs=null)=>dbrun("INSERT INTO lead_orders(id,order_number,quote_id,lead_id,conversation_id,market,product,quantity,currency,unit_price_minor,subtotal_minor,total_minor,status,unit_cost_minor,shipping_cost_minor,other_cost_minor,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,"HB-"+id,"q-"+id,leadId,"c-"+leadId,"ARAB","box",10,"USD",total/10,total,total,status,costs?costs[0]:null,costs?costs[1]:null,costs?costs[2]:null,ago(10),ago(5)]);
 const pay=(id,o,l,amt)=>dbrun("INSERT INTO lead_order_payments(id,order_id,lead_id,payment_kind,amount_minor,currency,method,reference,reference_key,received_at,recorded_by,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",[id,o,l,"full",amt,"USD","exchange_hawala",id,id,ago(5),"owner",ago(5)]);
 order("RV-1","RV-REAL","paid",10000,[500,1000,0]);pay("RVP-1","RV-1","RV-REAL",10000);
 order("RV-2","RV-TEST","paid",70000,[500,1000,0]);pay("RVP-2","RV-2","RV-TEST",70000);
 order("RV-3","RV-REAL","cancelled",30000);
 order("RV-4","RV-REAL","shipped",20000,[500,1000,0]);pay("RVP-4","RV-4","RV-REAL",8000);
 // a stale row of the test order from an earlier rebuild must disappear
 const SI=await import(pathToFileURL(path.join(SRC,"sales-intelligence.js")).href);
 const rb=await call("/api/si/intelligence",{},"POST");
 const rows=q("SELECT order_id,paid_minor,profit_minor,order_status FROM revenue_attribution ORDER BY order_id");
 ok("R1 revenue attribution excludes the TEST lead's order and the CANCELLED order (only real, non-cancelled orders remain)",J(rows.map(r=>r.order_id))===J(["RV-1","RV-4"]),[rb.status,rows]);
 ok("R2 profit only for fully paid orders: RV-1 = 10,000 − (5,000 + 1,000) = 4,000; shipped with an open balance (RV-4) has NO profit",rows.find(r=>r.order_id==="RV-1")?.profit_minor===4000&&rows.find(r=>r.order_id==="RV-4")?.profit_minor===null,rows);
 dbrun("INSERT OR REPLACE INTO revenue_attribution(order_id,lead_id,market,currency,lead_source,request_class,product_key,config_key,quantity,quote_id,price_version_id,pricing_mode,discount_minor,total_minor,paid_minor,profit_minor,order_status,repeat_index,created_at,updated_at) VALUES('RV-2','RV-TEST','ARAB','USD','x','legacy','box',NULL,10,NULL,NULL,NULL,0,70000,70000,NULL,'paid',0,?,?)",[ago(1),ago(1)]);
 await call("/api/si/intelligence",{},"POST");
 ok("R3 a stale snapshot row of an excluded (test) order is removed on rebuild; source orders and payments are untouched",!q("SELECT 1 FROM revenue_attribution WHERE order_id='RV-2'").length&&q("SELECT COUNT(*) n FROM lead_orders WHERE id LIKE 'RV-%'")[0].n===4&&q("SELECT COUNT(*) n FROM lead_order_payments WHERE id LIKE 'RVP-%'")[0].n===3,"");}

// ================= Sales Brain =================
{const u={id:714100001,name:"Pa",username:"pa_np"};await send(u,"سلام");setMarket(u,"iran");
 const r=await send(u,"نمیخوام چاپ");
 ok("B1 «نمیخوام چاپ» (no printing) is NOT a deal rejection",r.action!=="acknowledge_rejection"&&r.brain?.negotiation_intent!=="rejected",[r.action,r.brain?.negotiation_intent]);
 const facts=q("SELECT * FROM conversation_memory_facts WHERE lead_id=(SELECT lead_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1)",[String(u.id)]);
 ok("B2 the preference is remembered as printing = none (never as a printing method)",facts.some(f=>J(f).includes("printing")&&J(f).includes("none"))&&!facts.some(f=>J(f).includes("نمیخوام")&&J(f).includes("printing")),facts.map(f=>[f.fact_key,f.value_text||f.value||f.fact_value]));
 for(const t of ["چاپ نمی‌خواهم","بدون چاپ لطفا"]){const v={id:714100002+Math.floor(Math.random()*1e5),name:"P",username:"p"+Math.random()};await send(v,"سلام");setMarket(v,"iran");const x=await send(v,t);
   ok(`B3 «${t}» is not a rejection`,x.action!=="acknowledge_rejection",[x.action]);}
 for(const t of ["ما نريد طباعة","بدون طباعة"]){const v={id:714200000+Math.floor(Math.random()*1e5),name:"A",username:"a"+Math.random()};await send(v,"هلا");setMarket(v,"iraq");const x=await send(v,t);
   ok(`B4 «${t}» is not a rejection`,x.action!=="acknowledge_rejection",[x.action]);}
 for(const t of ["نمیخوام","منصرف شدم","لا شكرا"]){const v={id:714300000+Math.floor(Math.random()*1e5),name:"R",username:"r"+Math.random()};await send(v,"سلام");const x=await send(v,t);
   ok(`B5 a true rejection «${t}» is still a rejection`,x.action==="acknowledge_rejection"||x.brain?.negotiation_intent==="rejected",[x.action,x.brain?.negotiation_intent]);}
 const ia={id:714400001,name:"Iq",username:"iq_lang"};const fl=await send(ia,"شگد سعر العلبة");
 ok("B6 first message «شگد سعر العلبة» (Iraqi, contains گ) is detected as Iraqi Arabic, not Persian",fl.lang==="Iraqi Arabic"||fl.brain?.detected_language==="Iraqi Arabic",[fl.lang,fl.brain?.detected_language]);
 const fa={id:714400002,name:"Fa",username:"fa_lang"};const ff=await send(fa,"قیمت جعبه چنده");
 ok("B7 «قیمت جعبه چنده» stays Persian",ff.lang==="Persian"||ff.brain?.detected_language==="Persian",[ff.lang]);
 const src=(await import("node:fs")).readFileSync(path.join(SRC,"index.js"),"utf8"),c=new RegExp(src.match(/const CUSTOMER_DESTINATION_CITY=\/(.*)\/iu;/)[1],"iu"),iraq=new RegExp(src.match(/\["iraq",\/(.*?)\/iu\]\]/)[1],"iu");
 ok("B8 new Iraqi cities are recognised as destinations and map to Iraq (الرمادي، الفلوجة، تكريت، زاخو، Sulaymaniyah, «Iraqi»)",["الى الرمادي","في الفلوجة","تكريت","زاخو","to Sulaymaniyah"].every(t=>c.test(t))&&["الرمادي","Iraqi"].every(t=>iraq.test(t)),"");
 ok("B9 ambiguous common nouns are NOT added as cities (واسط، بابل، كوت)",!["واسط","بابل","كوت"].some(t=>new RegExp("^(?:"+src.match(/const CUSTOMER_DESTINATION_CITY=\/\(\?<!\[\\p\{L\}\]\)\((.*)\)\(\?!\[\\p\{L\}\]\)\/iu;/)[1]+")$","iu").test(t)),"");}

// ================= dashboard =================
{const UI=await import(pathToFileURL(path.join(SRC,"live-dashboard-page.js")).href+"?p14="+Date.now());
 const ch=UI.liveDashboardHtml("channels"),hub=UI.liveDashboardHtml("hub"),more=UI.liveDashboardHtml("more"),ag=UI.liveDashboardHtml("agents");
 const js=ch.slice(ch.lastIndexOf("<script>")+8,ch.lastIndexOf("</script>"));let parses=true;try{new Function(js);}catch{parses=false;}
 ok("D1 Owner Action Center is discoverable: 'more' menu link + hub fold; Telegram readiness card on channels and agents pages; script parses",more.includes('href="/dashboard/actions"')&&hub.includes('id="oacItems"')&&ch.includes('id="tgHealthBody"')&&ag.includes('id="tgHealthBody"')&&parses,"");
 const tgJs=js.slice(js.indexOf("// ---- Phase 14 Telegram readiness"),js.indexOf("// ---- customers"));
 ok("D2 the Telegram card only READS (one GET to /api/telegram/inbound-health, no POST, no webhook setup call) and is not polled",(tgJs.match(/api\(/g)||[]).length===1&&!/method\s*:|webhook\/setup/.test(tgJs)&&!/loadTelegramHealth/.test(js.slice(js.indexOf("const DASHBOARD_POLL_GROUPS"),js.indexOf("async function refreshTick"))),"");
 ok("D3 agent cards show the last error and, per open alert, repeats / recovery / fallback / owner-ack state",/\["آخرین خطا"/.test(js)&&/بازیابی شده/.test(js)&&/منتظر تأیید مالک/.test(js),"");}
// ================= Phase 14.1 — Iraq market detection, price requests, review fixes =================
{const V=await makeWorld({aiBrain:"on",extraEnv:{TELEGRAM_CHAT_ID:"@hb_test_channel",PUBLIC_WORKER_BASE_URL:"https://w.test"}});
 V.d1.db.exec((await import("node:fs")).readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
 V.env.AUTONOMY_ORCHESTRATOR="on";const AE2=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+"?p141="+Math.random());await AE2.autonomyMasterGate(V.env);
 await V.call("/api/quotes",null,"GET");const t0=new Date().toISOString();
 V.dbrun("INSERT INTO commercial_price_items(id,product_key,product_name,sku,market,currency,unit_price_minor,moq,version,active,effective_from,effective_until,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",["PI-141","ring box","علبة خاتم",null,"ARAB","USD",250,50,1,1,null,null,"owner",t0,t0,t0]);
 const mem=(u,key)=>V.q("SELECT value_json FROM conversation_memory_facts WHERE status='active' AND memory_key=? AND lead_id=(SELECT lead_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1)",[key,String(u.id)]).map(r=>JSON.parse(r.value_json));
 // country only → market evidence, no delivery city
 const a={id:714500001,name:"Iq",username:"iq_country"};await V.send(a,"هلا");await V.send(a,"احنا من العراق");
 ok("I1 explicit «العراق» is remembered as the customer's COUNTRY (market evidence), and NOT as a delivery city",J(mem(a,"customer_country"))===J(["العراق"])&&mem(a,"destination").length===0,[mem(a,"customer_country"),mem(a,"destination")]);
 const ap=await V.send(a,"بكم علبة الخاتم؟ أريد 100");
 ok("I2 with only the country known, a price question gets the APPROVED ARAB price in USD (2.50 / 250.00), auto-sent within authority",ap.action==="answer_price"&&ap.draft?.status==="sent"&&/2\.50/.test(ap.draft?.message||"")&&/250\.00/.test(ap.draft?.message||""),[ap.action,ap.draft?.status,String(ap.draft?.message||"").slice(0,90)]);
 // prefixes and ambiguity
 const b={id:714500002,name:"Iq2",username:"iq_prefix"};await V.send(b,"هلا");await V.send(b,"التوصيل للرمادي");
 ok("I3 attached prefix «للرمادي» (to Ramadi) is recognised as the destination city الرمادي",J(mem(b,"destination"))===J(["الرمادي"]),mem(b,"destination"));
 const c={id:714500003,name:"Iq3",username:"iq_in"};await V.send(c,"هلا");await V.send(c,"احنا بالفلوجة");
 ok("I4 «بالفلوجة» (in Fallujah) is recognised as الفلوجة",J(mem(c,"destination"))===J(["الفلوجة"]),mem(c,"destination"));
 const d={id:714500004,name:"Mix",username:"iq_both"};await V.send(d,"سلام");await V.send(d,"از ایران و العراق");
 ok("I5 naming both Iran and Iraq is ambiguous → no country, no market invented",mem(d,"customer_country").length===0,mem(d,"customer_country"));
 const e={id:714500005,name:"Adj",username:"iq_adj"};await V.send(e,"هلا");await V.send(e,"عندي متجر عراقي");
 ok("I6 the adjective «عراقي» is not a country name (no market from it); language alone never sets the market",mem(e,"customer_country").length===0,mem(e,"customer_country"));
 const f={id:714500006,name:"Ir",username:"ir_country"};await V.send(f,"سلام");await V.send(f,"از ایران هستم");
 ok("I7 Persian «ایران» → customer_country ایران (IRAN evidence preserved)",J(mem(f,"customer_country"))===J(["ایران"]),mem(f,"customer_country"));
 // price requests («عرض سعر»)
 const g={id:714500007,name:"Q",username:"iq_quote"};await V.send(g,"هلا");V.setMarket(g,"iraq");
 const q1=await V.send(g,"أريد عرض سعر لـ 100 علبة خاتم");
 ok("P1 «عرض سعر» with product + quantity and an approved price → the approved USD price is answered automatically (no owner approval needed within authority)",q1.action==="answer_price"&&q1.draft?.status==="sent"&&/250\.00/.test(q1.draft?.message||""),[q1.action,q1.draft?.status]);
 const h={id:714500008,name:"Q2",username:"iq_quote2"};await V.send(h,"هلا");V.setMarket(h,"iraq");
 const q2=await V.send(h,"أريد عرض سعر");
 ok("P2 «عرض سعر» with nothing known → requirements are gathered (ask product), not escalated to the owner",["ask_product","ask_quantity","price_discovery","clarify_product","ask_details","welcome"].includes(q2.action)&&q2.brain?.needs_owner!==true,[q2.action,q2.brain?.needs_owner]);
 V.dbrun("INSERT INTO commercial_price_items(id,product_key,product_name,sku,market,currency,unit_price_minor,moq,version,active,effective_from,effective_until,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",["PI-141-T","toman box","Toman box",null,"ARAB","TOMAN",500000,1,1,1,null,null,"owner",t0,t0,t0]);
 const k={id:714500009,name:"Q3",username:"iq_quote3"};await V.send(k,"هلا");V.setMarket(k,"iraq");
 const q3=await V.send(k,"أريد عرض سعر لـ 20 Toman box");
 ok("P3 a price request for a product without an approved USD price never invents or converts a price (no 'sent' price; owner path)",q3.draft?.status!=="sent"||!/[0-9]/.test(q3.draft?.message||""),[q3.action,q3.draft?.status]);
 const oid=V.q("SELECT id FROM lead_orders LIMIT 1")[0]?.id||"none";
 const conf=await V.run(new Request("https://w.test/api/orders/transition",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:oid,action:"confirm"})}));
 ok("P4 final order confirmation stays owner-only (401 without the owner token)",conf.status===401,conf.status);
 // review fix: a real rejection with an object still rejects
 const r={id:714500010,name:"R",username:"fa_rej"};await V.send(r,"سلام");const rr=await V.send(r,"نمی‌خوام بخرم");
 ok("F1 «نمی‌خوام بخرم» (I don't want to buy) is still a rejection (broad rule kept; only 'no printing' is stripped)",rr.action==="acknowledge_rejection"||rr.brain?.negotiation_intent==="rejected",[rr.action,rr.brain?.negotiation_intent]);}
{// review fix: rejected requests followed by a valid delivery do not make Telegram health FAILED
 dbrun("INSERT OR IGNORE INTO system_events VALUES(?,?,?,?,?,?)",["tg-webhook-reject:secret_mismatch:"+new Date(Date.now()-3600000).toISOString().slice(0,16),"telegram_webhook_rejected","warning","x",JSON.stringify({reason:"secret_mismatch"}),new Date(Date.now()-3600000).toISOString()]);
 dbrun("UPDATE system_kv SET value=? WHERE key='telegram_webhook_last_accepted'",[new Date().toISOString()]);
 const hh=(await health()).body;
 ok("F2 rejected requests followed by a valid Telegram delivery are reported (not from Telegram) but do NOT set FAILED",hh.status!=="FAILED"&&hh.reasons.some(x=>/unauthenticated requests were rejected/.test(x)),[hh.status,hh.reasons]);
 dbrun("UPDATE system_kv SET value=? WHERE key='telegram_webhook_last_accepted'",[new Date(Date.now()-2*3600000).toISOString()]);
 const h2=(await health()).body;
 ok("F3 rejections with NO valid delivery after them → FAILED",h2.status==="FAILED",[h2.status,h2.reasons]);
 dbrun("DELETE FROM system_events WHERE type='telegram_webhook_rejected'");}
{// review fix: the autopilot chain stops at its first failure (paid weekly-video steps never run after a sibling failed); recorded once
 const origPrepare=W.env.DB.prepare.bind(W.env.DB);
 W.env.DB.prepare=sql=>{if(/CREATE TABLE IF NOT EXISTS website_events/i.test(String(sql)))throw new Error("simulated chain failure");return origPrepare(sql);};
 const before=q("SELECT COUNT(*) n FROM system_events WHERE type='auto_pilot_cycle'")[0].n;
 const env2=Object.assign({},W.env);   // fresh env object: the store "ensure once" memo is per env, so the injected failure fires
 const p=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},env2,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);W.env.DB.prepare=origPrepare;
 const ev=q("SELECT details_json FROM system_events WHERE type='scheduled_step_failed' AND details_json LIKE '%website_growth_store%'");
 ok("F4 a failure early in the autopilot chain is recorded and STOPS the rest of that chain (no auto_pilot_cycle run after it), as before Phase 14",ev.length===1&&q("SELECT COUNT(*) n FROM system_events WHERE type='auto_pilot_cycle'")[0].n===before,[ev.length,before]);}
{const UI2=await import(pathToFileURL(path.join(SRC,"live-dashboard-page.js")).href+"?p141="+Date.now());const js2=UI2.liveDashboardHtml("agents");
 ok("D4 agent cards state the per-agent heartbeat limitation instead of implying data that does not exist",/heartbeat جداگانهٔ هر عامل پیاده‌سازی نشده/.test(js2),"");}
ok("ISOLATION only in-process mocks were called",W.offNet().every(u=>/api\.telegram\.org|api\.anthropic\.com|api\.openai\.com|w\.test/.test(u)),W.offNet().filter(u=>!/api\.telegram\.org|api\.anthropic\.com|api\.openai\.com|w\.test/.test(u)).slice(0,5));
process.exit(done()?1:0);
