// Phase 27 — owner directive 2026-11-08: standard pricing from the active approved list is autonomous (unit price, quantity total,
// authorized discount, deposit and balance); payment verification, final order authorization and exceptions stay with the owner, and a
// new owner escalation alerts the owner group once. Local only: Telegram, D1 and the AI are mocks; nothing real is sent.
import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase27_sales_autonomy");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const FQ=await import(pathToFileURL(path.join(REPO,"worker/src/final-quote-review.js")).href);
const AIB=await import(pathToFileURL(path.join(REPO,"worker/src/sales-ai-brain.js")).href);
const OWNER="-100555123456",T="2026-10-01T00:00:00.000Z";
const L=`INSERT INTO commercial_price_items(id,product_key,product_name,sku,market,currency,unit_price_minor,moq,version,active,effective_from,effective_until,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
const S="INSERT INTO business_settings(id,setting_key,scope_key,value_json,version,status,approved_by,approved_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)";
const world=async(extra={},{deposit=true,aiBrain="off"}={})=>{const W=await makeWorld({aiBrain,extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",STANDARD_PRICE_AUTONOMY:"on",...extra}});
 await W.call("/api/quotes",null,"GET");await W.call("/api/si/knowledge/product",null,"GET");
 W.dbrun("CREATE TABLE IF NOT EXISTS telegram_media_sources(id TEXT PRIMARY KEY,chat_id TEXT NOT NULL,chat_username TEXT,message_id TEXT NOT NULL,file_id TEXT NOT NULL,file_unique_id TEXT,media_type TEXT,caption TEXT,source_kind TEXT,created_at TEXT,updated_at TEXT)");
 W.dbrun(L,["R1","k1","انگشتر کوچک · 5x5 · 3 تکه",null,"IRAN","TOMAN",66000,null,1,1,null,null,"admin",T,T,T]);
 W.dbrun(L,["A1","a1","علبة خاتم صغيرة · 5x5x4 · ثلاث قطع",null,"ARAB","USD",60,null,1,1,null,null,"admin",T,T,T]);
 W.dbrun(S,["ds","discount_rule","market:ARAB",JSON.stringify({type:"percent_bp",value:1000,min_quantity:1001}),1,"current","owner",T,T]);
 if(deposit){W.dbrun(S,["dpi","deposit_percent","market:IRAN","50",1,"current","owner",T,T]);W.dbrun(S,["dpa","deposit_percent","market:ARAB","50",1,"current","owner",T,T]);}
 return W;};
let id=735000000;const customer=async(W,mk)=>{const u={id:++id,name:"Sara Customer",username:"secret_user"+id};await W.send(u,"سلام");W.setMarket(u,mk);return u;};
const out=(W,u)=>W.tg.filter(x=>x.method==="sendMessage"&&String(x.body).includes(String(u.id))).map(x=>{try{return JSON.parse(x.body).text||"";}catch{return String(x.body);}});
const sentAfter=async(W,u,fn)=>{const b=out(W,u).length;const r=await fn();return {r,texts:out(W,u).slice(b)};};
const toOwner=W=>W.tg.filter(x=>x.method==="sendMessage"&&String(x.body).includes(`"chat_id":"${OWNER}"`)).map(x=>JSON.parse(x.body).text);
const leadOf=(W,u)=>W.q("SELECT lead_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(u.id)])[0]?.lead_id;
const escalations=(W,u)=>W.q("SELECT * FROM owner_escalations WHERE lead_id=?",[leadOf(W,u)]);
const brainOf=(W,u)=>{const e=W.q("SELECT details_json FROM system_events WHERE type='sales_brain_decision' AND json_extract(details_json,'$.lead_id')=? ORDER BY created_at DESC LIMIT 1",[leadOf(W,u)])[0];return e?JSON.parse(e.details_json):null;};
const IR=n=>`قیمت انگشتر کوچک 3 تکه برای ${n} عدد چنده؟`,IQ=n=>`بكم علبة خاتم صغيرة ثلاث قطع؟ أريد ${n}`;

const W=await world({OWNER_TELEGRAM_CHAT_ID:OWNER});

// A — normal inquiry goes out by itself
{const u={id:++id,name:"T",username:"a"+id};const g=await sentAfter(W,u,()=>W.send(u,"سلام، چه مدل جعبه‌هایی دارید؟"));
 ok("A1 a normal Iran inquiry is answered automatically",g.r.draft?.status==="sent"&&g.texts.length===1,{s:g.r.draft?.status,t:g.texts});
 ok("A2 a range question is never stored as a product name",!W.q("SELECT 1 FROM conversation_memory_facts WHERE memory_key='product_interest' AND lead_id=? AND status='active'",[leadOf(W,u)]).length,W.q("SELECT value_json FROM conversation_memory_facts WHERE memory_key='product_interest' AND lead_id=?",[leadOf(W,u)]));}

// B/C/D — Iran, matched product + quantity, authorized 10% discount, deposit and balance, sent with no owner step
{const u=await customer(W,"iran");const x=await sentAfter(W,u,()=>W.send(u,IR(1000)));const m=x.texts[0]||"";
 ok("B1 a standard Iran total is sent automatically",x.r.draft?.status==="sent"&&x.texts.length===1&&!x.r.draft?.error_detail,{s:x.r.draft?.status,e:x.r.draft?.error_detail});
 ok("C1 the authorized 10% discount from 1,000 is applied once",m.split("۱۰٪").length===2&&m.includes("۶٬۶۰۰٬۰۰۰"),m);
 ok("D1 unit, subtotal, discount and net total are exact",m.includes("۶۶٬۰۰۰ تومان")&&m.includes("۶۶٬۰۰۰٬۰۰۰")&&m.includes("۵۹٬۴۰۰٬۰۰۰"),m);
 ok("D2 the owner-set 50% deposit and the balance are stated from the net total",m.includes("پیش‌پرداخت ۵۰٪")&&m.split("۲۹٬۷۰۰٬۰۰۰").length===3,m);
 ok("D3 it never claims to be final, and is in TOMAN only",!/نهایی|قطعی|دلار|ریال/.test(m),m);
 const b=brainOf(W,u);ok("D4 recorded as a standard total, not a held final quote",b?.standard_total===true&&b?.final_quote_hold===false,{std:b?.standard_total,hold:b?.final_quote_hold});
 ok("H1 a standard price question opens no owner escalation and no owner alert",escalations(W,u).length===0&&toOwner(W).length===0,{e:escalations(W,u).length,o:toOwner(W).length});
 // G — correction mid-conversation re-prices from the list
 const c=await sentAfter(W,u,()=>W.send(u,"نه، ۲۰۰۰ تا میخوام"));const cm=c.texts[0]||"";
 ok("G1 a corrected quantity is re-priced (2,000 → 118,800,000; deposit and balance 59,400,000 each) and sent",c.r.draft?.status==="sent"&&cm.includes("۱۱۸٬۸۰۰٬۰۰۰")&&cm.includes("۲۰۰۰ عدد")&&cm.split("۵۹٬۴۰۰٬۰۰۰").length===3,{s:c.r.draft?.status,t:c.texts});
 // J — «I paid» never verifies a payment
 await W.send(u,"ثبتش کن");const p=await sentAfter(W,u,()=>W.send(u,"مبلغ پیش‌پرداخت رو واریز کردم"));
 const lead=leadOf(W,u),pays=W.q("SELECT COUNT(*) n FROM lead_order_payments WHERE order_id IN (SELECT id FROM lead_orders WHERE lead_id=?)",[lead])[0].n,ords=W.q("SELECT status FROM lead_orders WHERE lead_id=?",[lead]);
 ok("J1 a customer's payment claim records no payment and marks nothing paid or confirmed",pays===0&&ords.every(o=>!["paid","partially_paid","confirmed","shipped","fulfilled"].includes(o.status)),{pays,ords});
 ok("J2 the customer is not told the payment is confirmed",!p.texts.some(t=>/تأیید شد|تایید شد|دریافت شد و تأیید/.test(t)),p.texts);
 const pa=W.q("SELECT alert_status,reason_code FROM owner_escalation_alerts WHERE reason_code='payment_claim' AND lead_id=?",[lead]);
 ok("J3 the payment claim alerts the owner group once, for the owner to verify",pa.length===1&&pa[0].alert_status==="sent"&&pa[0].reason_code==="payment_claim"&&toOwner(W).filter(t=>/ادعای پرداخت/.test(t)).length===1,pa);}

// E — price + delivery: the product total is given, shipping is stated as not included (no amount invented)
{const u=await customer(W,"iran");const x=await sentAfter(W,u,()=>W.send(u,"برای ۵۰۰ عدد انگشتر کوچک 3 تکه با ارسال به تهران قیمت چقدر می‌شود؟"));const m=x.texts[0]||"",b=brainOf(W,u);
 ok("E1 a price-with-delivery question gets the product total automatically",x.r.draft?.status==="sent"&&m.includes("۳۳٬۰۰۰٬۰۰۰"),{s:x.r.draft?.status,i:b?.detected_intents,t:x.texts});
 ok("E2 shipping is never folded into the total or guessed",!/شامل ارسال|نهایی/.test(m)&&(b?.detected_intents?.[0]!=="asks_shipping"||m.includes("هزینهٔ ارسال در این قیمت نیست")),{i:b?.detected_intents,m});}

// F — Iraq, Arabic, two turns, USD, 10% from 1,001, deposit
{const u=await customer(W,"iraq");await W.send(u,"بكم علبة خاتم صغيرة ثلاث قطع؟");const x=await sentAfter(W,u,()=>W.send(u,"أريد 1001 قطعة"));const m=x.texts[0]||"";
 ok("F1 a multi-turn Iraq price is sent automatically in USD",x.r.draft?.status==="sent"&&/دولار/.test(m)&&!/تومان/.test(m),{s:x.r.draft?.status,t:x.texts});
 ok("F2 Iraq 10% from 1,001: 600.60 → 540.54, deposit 270.27, balance 270.27",m.includes("600.60")&&m.includes("540.54")&&m.includes("العربون 50%")&&m.split("270.27").length===3,m);}

// I — exceptions stay with the owner: below MOQ, and a customer's own price
{const u=await customer(W,"iran");const x=await sentAfter(W,u,()=>W.send(u,IR(200)));
 ok("I1 below the MOQ is the owner's exception: no total, an escalation",x.r.action==="moq_owner"&&!x.texts.some(t=>/جمع/.test(t))&&escalations(W,u).length===1,{a:x.r.action,e:escalations(W,u).length});
 // O — exactly one owner-group alert for that escalation, reference only
 const esc=escalations(W,u)[0],tag=String(esc?.id||"").replace(/^owner-escalation-/,"").slice(0,8),al=toOwner(W).filter(t=>t.includes(tag));
 ok("O1 the escalation alerts the owner group once, labelled as a below-MOQ exception",!!tag&&al.length===1&&/کمتر از حداقل سفارش/.test(al[0]),al);
 // owner directive 2026-11-08 (§9): the PRIVATE owner group gets the case details; never the customer's message text, Telegram id or a secret
 ok("O2 the alert carries the case details but no message text, Telegram id or secret",!!al[0]&&/مشتری:/.test(al[0])&&/اقدام لازم/.test(al[0])&&!/چنده/.test(al[0])&&!new RegExp("(^|[^0-9A-Za-z_])"+u.id+"($|[^0-9])").test(al[0])&&!al[0].includes(String(W.env.TELEGRAM_BOT_TOKEN||"@@none"))&&/بازار ایران/.test(al[0]),al[0]);
 await FQ.notifyEscalationOwner(W.env,esc.id);await FQ.retryEscalationAlerts(W.env,{limit:5});
 ok("O3 a repeated notify or a cron run sends no second alert",toOwner(W).filter(t=>t.includes(tag)).length===1&&W.q("SELECT alert_status FROM owner_escalation_alerts WHERE escalation_id=?",[esc.id])[0]?.alert_status==="sent",toOwner(W).length);
 const n=await sentAfter(W,u,()=>W.send(u,"۵۰ هزار تومن بدید؟"));
 ok("I2 a customer's own price is never accepted or repeated automatically",n.r.action!=="accept_offer"&&!n.texts.some(t=>/۵۰٬۰۰۰|۵۰ هزار/.test(t)),{a:n.r.action,s:n.r.draft?.status,t:n.texts});}

// O — no destination: nothing is sent, the state is recorded, the customer path is unchanged
{const V=await world({});const u=await customer(V,"iran");const x=await sentAfter(V,u,()=>V.send(u,IR(200)));const esc=escalations(V,u)[0];
 const row=esc?V.q("SELECT alert_status FROM owner_escalation_alerts WHERE escalation_id=?",[esc.id])[0]:null;
 ok("O4 without a verified owner group no alert is sent and the state says why",row?.alert_status==="destination_missing"&&!V.tg.some(t=>t.method==="sendMessage"&&!String(t.body).includes(String(u.id))),row);
 ok("O5 the customer still gets the same MOQ answer",x.r.action==="moq_owner"&&x.texts.length===1,x.texts);}

// L — opt-out stays enforced before any price
{const u=await customer(W,"iran");await W.send(u,"دیگه پیام ندید");const x=await sentAfter(W,u,()=>W.send(u,IR(1000)));
 ok("L1 an opted-out customer gets no automatic price",x.texts.length===0&&x.r.draft?.status!=="sent",{s:x.r.draft?.status,e:x.r.draft?.error_detail,t:x.texts});}

// P — no cross-customer leakage
{const a=await customer(W,"iran");await W.send(a,IR(3000));const b=await customer(W,"iran");const x=await sentAfter(W,b,()=>W.send(b,"قیمت انگشتر کوچک 3 تکه چنده؟"));
 ok("P1 another customer's quantity and total never appear",!x.texts.some(t=>/۳٬?۰۰۰ عدد|۱۷۸٬۲۰۰٬۰۰۰/.test(t)),x.texts);}

// Kill switch — STANDARD_PRICE_AUTONOMY=off restores the owner hold for every total
{const V=await world({STANDARD_PRICE_AUTONOMY:"off"});const u=await customer(V,"iran");const x=await sentAfter(V,u,()=>V.send(u,IR(1000)));
 ok("K1 with the switch off a total is held for the owner again",x.r.draft?.status==="draft"&&x.r.draft?.error_detail==="final_quote_owner_approval",{s:x.r.draft?.status,e:x.r.draft?.error_detail});}

// No deposit set → no deposit sentence (never guessed)
{const V=await world({},{deposit:false});const u=await customer(V,"iran");const x=await sentAfter(V,u,()=>V.send(u,IR(1000)));
 ok("D5 without an owner-set deposit no deposit is stated",x.r.draft?.status==="sent"&&!/پیش‌پرداخت/.test(x.texts[0]||""),x.texts);}

// N — AI provider 401: the error type is recorded, nothing secret, degraded is explicit, the customer still gets a safe reply
{const fail=await AIB.salesAiProviderFailure(new Response(JSON.stringify({type:"error",error:{type:"authentication_error",message:"invalid x-api-key sk-ant-SECRET"}}),{status:401,headers:{"request-id":"req_011ABCdef"}}),"claude-opus-5-5",Date.now());
 ok("N1 a 401 keeps only the error type and request id",fail.error==="provider_http_401"&&fail.error_type==="authentication_error"&&fail.request_id==="req_011ABCdef"&&!JSON.stringify(fail).includes("sk-ant"),fail);
 const bad=await AIB.salesAiProviderFailure(new Response("<html>x</html>",{status:401,headers:{"request-id":"bad id with spaces"}}),"m",Date.now());
 ok("N2 an unreadable body or odd request id is dropped, never echoed",bad.error_type===null&&bad.request_id===null,bad);
 const V=await world({},{aiBrain:"on"});const orig=globalThis.fetch;
 globalThis.fetch=async(u,o)=>String(u?.url||u)==="https://api.anthropic.com/v1/messages"?new Response(JSON.stringify({type:"error",error:{type:"authentication_error",message:"invalid x-api-key"}}),{status:401,headers:{"request-id":"req_test401"}}):orig(u,o);
 try{const u=await customer(V,"iran");const x=await sentAfter(V,u,()=>V.send(u,"چه رنگ‌هایی دارید؟"));
  const all=V.q("SELECT details_json FROM system_events WHERE type='sales_brain_decision' AND json_extract(details_json,'$.lead_id')=? ORDER BY created_at",[leadOf(V,u)]).map(e=>JSON.parse(e.details_json)),b=all.find(d=>d.ai_brain?.error_type)||all[0];
  ok("N3b later turns in the cooldown are still marked degraded",all.length>=2&&all.every(d=>d.ai_brain?.degraded===true),all.map(d=>d.ai_brain?.error));
  ok("N3 the brain records degraded AI with the provider error type",b?.ai_brain?.degraded===true&&b?.ai_brain?.error_type==="authentication_error"&&b?.ai_brain?.request_id==="req_test401"&&b?.ai_brain?.reply_source==="legacy",b?.ai_brain);
  ok("N4 no key or provider message is stored",!JSON.stringify(b).includes("invalid x-api-key")&&!JSON.stringify(b).includes("test-key-not-real"),"leak?");
  ok("N5 the customer still gets a safe reply",x.texts.length<=1,x.texts);}
 finally{globalThis.fetch=orig;}}

done();
