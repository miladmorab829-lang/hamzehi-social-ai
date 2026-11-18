// MOQ1 — LIVE MOQ FAILURE (Production 2026-11-18T17:16:15Z, inbox bfebeb48…): an ordinary Iran question about the ring-box models
// and the minimum order was held as ESCALATE_OWNER (validation moq_claim → author unverified_business_assertion /
// protected_context_unverified_speech, may_handoff=false, answer_coverage valid, customer_visible=none) although the owner-approved MOQ
// fact answers it. Required now: the verified models answer + the EXACT approved MOQ fact reach the customer (status sent), no owner
// case for this ordinary question, an invented/misbound minimum never reaches the customer, a model with no approved MOQ rule gets no
// invented number and the conversation continues; opt-out, duplicate replay, price/discount and Iraq scope are unchanged.
// The customer text and the model's wording are a faithful RECONSTRUCTION (the production row was not readable from this session); the
// approved MOQ text is the exact owner-approved fact (knowledge-fact-owner-telegram-20261109-03). Local only: in-memory SQLite,
// recording Telegram, scripted model; the reply-author call repeats the model's own MOQ wording (the bounded rewrite FAILS, the
// production case). Synthetic customers and data only; no network, no real messages.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";import {createHash} from "node:crypto";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase51_moq_live_failure");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const SRC=process.env.SRC||path.join(REPO,"worker/src");
const SA=await import(pathToFileURL(path.join(SRC,"sales-ai-brain.js")).href);
const ORCH=fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8");
const MIG=fs.readFileSync(path.join(REPO,"owner-actions/phase25-delete-system/01-migration.sql"),"utf8");
const OWNER="-100555123456",T="2026-10-01T00:00:00.000Z";
const L=`INSERT INTO commercial_price_items(id,product_key,product_name,sku,market,currency,unit_price_minor,moq,version,active,effective_from,effective_until,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
const KF="INSERT INTO sales_knowledge_facts(id,fact_key,domain,entity_type,entity_key,attribute,market,member_key,value_json,value_hash,version,status,authority,source_type,change_request_id,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
const S="INSERT INTO business_settings(id,setting_key,scope_key,value_json,version,status,approved_by,approved_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)";
// the exact owner-approved MOQ fact (PHASE50-KNOWLEDGE-IRAN.json, FACT:knowledge-fact-owner-telegram-20261109-03)
const MOQ_TEXT="فقط ایران: در پنج مدل فعلی غیر از کشویی بگ‌دار، حداقل سفارش از هر سایز ۳۰۰ عدد است؛ نیم‌سرویس و سرویس هرکدام ۱۰۰ عدد. کشویی بگ‌دار در هر سایز موجود حداقل ۵۰۰ عدد است. حداقل هر سایز مستقل است؛ به مدل جدید تعمیم داده نشود. حداقل عراق همان ۵۰۰ عدد می‌ماند.";
// MOQ2: what the customer sees for a ring-box minimum question — the approved minimums in customer-facing form (no internal notes)
const RING_MOQ="حداقل سفارش جعبه انگشتر از هر سایز: در مدل‌های ۲ تکه، ۳ تکه، ۳ تکه کج، کشویی کج و کشویی روبان‌دار ۳۰۰ عدد و در مدل کشویی بگ‌دار ۵۰۰ عدد.";
const INTERNAL=/تعمیم|فقط ایران|عراق|پنج مدل|حداقل هر سایز مستقل/u;
const LIMIT="برای این مشخصات، عدد قابل اتکایی در اختیارم نیست که دقیق راهنمایی‌تون کنم.";
const W=await makeWorld({aiBrain:"on",extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on",OWNER_TELEGRAM_CHAT_ID:OWNER}});W.d1.db.exec(ORCH);
for(const p of ["/api/quotes","/api/si/knowledge/product","/api/owner-escalations","/api/leads/outreach","/api/content/pipeline"])await W.call(p,null,"GET");W.d1.db.exec(MIG);
// approved catalog: ring boxes (current models of the MOQ rule) + a box with NO approved MOQ rule (جعبه عطر) + one Iraq row
let n=0;for(const [name,price] of [["انگشتر کوچک · 5x5 · 2 تکه",60000],["انگشتر کوچک · 5x5 · 3 تکه",66000],["انگشتر کوچک · 5x5 · کشویی کج",70000],["انگشتر کوچک · 5x5 · کشویی بگ‌دار",90000],["انگشتر بزرگ · 7x7 · 3 تکه",80000],["جعبه عطر · 10x10 · 2 تکه",95000]])W.dbrun(L,["R"+(++n),"k"+n,name,null,"IRAN","TOMAN",price,null,1,1,null,null,"admin",T,T,T]);
W.dbrun(L,["A1","a1","علبة خاتم صغيرة · 5x5x4 · ثلاث قطع",null,"ARAB","USD",60,null,1,1,null,null,"admin",T,T,T]);
W.dbrun(S,["di","discount_rule","market:IRAN",JSON.stringify({type:"percent_bp",value:1000,min_quantity:1000}),1,"current","owner",T,T]);
W.dbrun(S,["dpi","deposit_percent","market:IRAN","50",1,"current","owner",T,T]);
W.dbrun(KF,["knowledge-fact-owner-telegram-20261109-03","moq-iran","quantity","business","global","quantity_rule","IRAN","",JSON.stringify(MOQ_TEXT),createHash("sha256").update(JSON.stringify(MOQ_TEXT)).digest("hex"),1,"active","owner_approved","owner_form","owner-telegram-20261109-03","admin",T,T,T]);
if(!(await W.call("/api/sales-ai-first",{mode:"on",allowlist:[]},"POST")).body?.ok)throw Error("AI-FIRST not set");
const I=(intent,o={})=>({primary_intent:intent,product_key:null,reference:"none",requested_size:null,requested_color:[],requested_structure:null,requested_printing:null,quantity:null,ambiguity:"none",confidence:"high",...o});
// DA: primary decision `reply`; the reply-author call (ctx.authoring) repeats the model's own prose + the protected parts (rewrite fails).
// `author` (optional) replaces the author pass with a compliant author: its own text + the protected parts copied exactly.
const DA=(reply,intent,o={})=>(ctx)=>({requests:o.requests||[],reply:ctx?.authoring?[o.author??reply,...(ctx.authoring.required_parts||[])].filter(Boolean).join("\n"):reply,reply_colors:[],acceptance:false,interpretation:I(intent,o.interp||{}),
  semantics:{mode:o.mode||"browse",quantity_role:o.qrole||"none",deal_reference:"none",repeat_requested:false},
  facts:{colors:[],color_parts:[],unknown_colors:[],color_statement:"none",negated_colors:[],quantity:o.interp?.quantity??null,destination:null,customer_name:null}});
let uid=773000000;
const out=u=>W.tg.filter(x=>x.method==="sendMessage"&&(String(x.body).includes(`"chat_id":"${u.id}"`)||String(x.body).includes(`"chat_id":${u.id}`))).map(x=>{try{return JSON.parse(x.body).text||"";}catch{return "";}});
const leadOf=u=>W.q("SELECT lead_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(u.id)])[0]?.lead_id;
const open=u=>W.q("SELECT reason_code,unresolved_question FROM owner_escalations WHERE lead_id=? AND status='open'",[leadOf(u)]);
const num=t=>String(t||"").replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d));
const turn=async(u,msg,dec)=>{if(dec)W.AI.script.set(msg,dec);SA.resetSalesAiCooldown?.();const b=out(u).length;const r=await W.send(u,msg);return {r,sent:out(u).slice(b)};};
const start=async(market="IRAN")=>{const u={id:++uid,name:"Case "+uid,username:"case"+uid};await turn(u,market==="IRAN"?"سلام":"هلا",DA(market==="IRAN"?"سلام، بفرمایید.":"هلا بيك.","greeting"));W.setMarket(u,market==="IRAN"?"iran":"iraq");return u;};
const status=x=>x.r.draft?.status||null;
const MODELS="جعبه انگشتر رو در مدل‌های ۲ تکه، ۳ تکه، کشویی کج و کشویی بگ‌دار داریم.";
const modelsAnswered=s=>/۲ تکه/.test(s)&&/۳ تکه/.test(s)&&/کشویی بگ‌دار داریم/.test(s);
const LIVE_Q="سلام، جعبه انگشتر چه مدل‌هایی دارید؟ حداقل سفارشتون چقدره؟";
const MOQ_REQ={requests:["product_info","moq"]};
// ---- L1: the live case (the model words the approved minimum itself; the author repeats it, i.e. the rewrite FAILS) ----
{const u=await start();const x=await turn(u,LIVE_Q,DA(MODELS+" حداقل سفارش از هر سایز ۳۰۰ عدده و برای کشویی بگ‌دار ۵۰۰ عدد.","product_info",MOQ_REQ));const b=x.r.brain||{},ai=b.ai_brain||{};
 ok("L1 reproduces the live signature: primary MOQ wording rejected (moq_claim), may_handoff=false",ai.repaired?.dropped?.includes("moq_claim")&&b.turn_policy?.may_handoff===false,{repaired:ai.repaired,may_handoff:b.turn_policy?.may_handoff});
 ok("L1 the reply is actually SENT (draft status sent, one customer message)",status(x)==="sent"&&x.sent.length===1,{status:status(x),err:x.r.draft?.error_detail,sent:x.sent});
 ok("L1 the models part is delivered",x.sent.length===1&&modelsAnswered(x.sent[0]),x.sent);
 ok("L1 the minimum order is answered with the approved minimums in customer-facing form",x.sent.length===1&&x.sent[0].includes(RING_MOQ),x.sent);
 ok("L1 no internal knowledge-base wording reaches the customer",!x.sent.some(s=>INTERNAL.test(s)),x.sent);
 ok("L1 no contradictory «no reliable number» sentence",!x.sent.some(s=>s.includes(LIMIT)),x.sent);
 ok("L1 no owner case for this ordinary question",open(u).length===0,open(u));
 ok("L1 decision is not ESCALATE_OWNER and the reply is verified",b.next_best_action!=="ESCALATE_OWNER"&&b.needs_owner===false&&ai.authorship?.verified===true,{nba:b.next_best_action,needs_owner:b.needs_owner,authorship:ai.authorship});
 ok("L1 the model's own MOQ wording never reaches the customer (only the approved text carries the numbers)",!x.sent.some(s=>/عدده/.test(s)),x.sent);
 ok("L1 the approved MOQ fact is traceable in the decision (approved_guidance fact id)",(b.approved_guidance?.facts||[]).some(f=>f.id==="knowledge-fact-owner-telegram-20261109-03"),b.approved_guidance?.facts);}
// ---- L2: compliant author (copies the protected part exactly) ----
{const u=await start();const x=await turn(u,LIVE_Q+" (L2)",DA(MODELS+" حداقل سفارش از هر سایز ۳۰۰ عدده.","product_info",{...MOQ_REQ,author:MODELS}));
 ok("L2 sent with models + approved MOQ (customer-facing)",status(x)==="sent"&&x.sent.length===1&&modelsAnswered(x.sent[0])&&x.sent[0].includes(RING_MOQ),{status:status(x),sent:x.sent});
 ok("L2 no contradictory «no reliable number» sentence",!x.sent.some(s=>s.includes(LIMIT)),x.sent);
 ok("L2 no owner case",open(u).length===0,open(u));}
// ---- L3: the model places the approved-information slot ({{INFORMATION}}) as instructed; compliant author ----
{const u=await start();const x=await turn(u,LIVE_Q+" (L3)",DA(MODELS+" {{INFORMATION}}","product_info",{...MOQ_REQ,author:MODELS}));
 ok("L3 slot reply sent with models + approved MOQ (customer-facing), no owner case",status(x)==="sent"&&x.sent.length===1&&modelsAnswered(x.sent[0])&&x.sent[0].includes(RING_MOQ)&&open(u).length===0,{status:status(x),sent:x.sent,cases:open(u)});}
// ---- F1/F2: an invented or misbound minimum never reaches the customer ----
{const u=await start();const x=await turn(u,LIVE_Q+" (F1)",DA(MODELS+" حداقل سفارش ۵۰ عدده.","product_info",MOQ_REQ));
 ok("F1 invented minimum (50) never sent",!x.sent.some(s=>/(?<![\d])50(?!\d)/.test(num(s))),x.sent);
 ok("F1 the customer still gets the models + approved MOQ",x.sent.length===1&&modelsAnswered(x.sent[0])&&x.sent[0].includes(RING_MOQ),x.sent);
 ok("F1 an invented commercial number keeps the owner case",open(u).length===1,open(u));}
{const u=await start();const x=await turn(u,LIVE_Q+" (F2)",DA(MODELS+" حداقل سفارش کشویی بگ‌دار ۱۰۰ عدده.","product_info",MOQ_REQ));
 ok("F2 misbound minimum (bag-drawer 100) never sent",!x.sent.some(s=>/کشویی بگ‌دار ۱۰۰/.test(s)),x.sent);
 ok("F2 the customer gets the approved MOQ instead",x.sent.length===1&&x.sent[0].includes(RING_MOQ),x.sent);}
// ---- F3: unit check — the validator still rejects any MOQ wording in model prose (no paraphrase becomes authority) ----
ok("F3 model-worded MOQ is still moq_claim (grounded or not)",SA.salesAiProseIssues("حداقل سفارش از هر سایز ۳۰۰ عدده.",{allowedNumbers:[300]}).includes("moq_claim")&&SA.salesAiProseIssues("حداقل سفارش ۵۰ عدده.",{allowedNumbers:[50]}).includes("moq_claim"));
// ---- U1/U2: a model with NO approved MOQ rule (جعبه عطر): no invented number, the conversation continues ----
for(const [id,reply] of [["U1","جعبه عطر رو در مدل ۲ تکه داریم. حداقل سفارش جعبه عطر ۳۰۰ عدده."],["U2","جعبه عطر رو در مدل ۲ تکه داریم. حداقل سفارش تأییدشده‌ای برای جعبه عطر در اختیارم نیست."]]){
 const u=await start();const x=await turn(u,"سلام، حداقل سفارش جعبه عطر چقدره؟ ("+id+")",DA(reply,"product_info",{requests:["product_info","moq"]}));
 ok(id+" a reply is sent (conversation not stopped)",status(x)==="sent"&&x.sent.length===1,{status:status(x),err:x.r.draft?.error_detail,sent:x.sent});
 ok(id+" no minimum is stated for the unknown model",!x.sent.some(s=>s.split(/[.\n؛]/u).some(c=>/عطر/.test(c)&&/حداقل|عدد/.test(c)&&/[0-9۰-۹]/.test(c))),x.sent);
 ok(id+" the reply says the number is not available",x.sent.some(s=>s.includes(LIMIT)),x.sent);}
// ---- P1: opt-out — an opted-out customer asking the same question receives nothing ----
{const u={id:++uid,name:"Case "+uid,username:"case"+uid};await turn(u,"لطفاً دیگه پیام ندید",DA("باشه.","other"));W.setMarket(u,"iran");
 const x=await turn(u,LIVE_Q+" (P1)",DA(MODELS+" حداقل سفارش از هر سایز ۳۰۰ عدده.","product_info",MOQ_REQ));
 ok("P1 opted-out customer receives nothing",out(u).length===0,out(u));ok("P1 hold recorded as the opt-out",x.r.draft?.error_detail==="customer_opted_out",x.r.draft);}
// ---- P2: duplicate replay — the same update replayed sends nothing more ----
{const u=await start();const msg=LIVE_Q+" (P2)";const x=await turn(u,msg,DA(MODELS+" حداقل سفارش از هر سایز ۳۰۰ عدده.","product_info",MOQ_REQ));
 const before=out(u).length;await W.post({update_id:9300000+uid,message:{message_id:Number(x.r.row.external_id.split(":").at(-1)),date:Math.floor(Date.now()/1000),from:{id:u.id,is_bot:false,first_name:u.name},chat:{id:u.id,type:"private"},text:msg}});
 ok("P2 answered once",x.sent.length===1,x.sent);ok("P2 replayed update sends nothing",out(u).length===before,out(u));}
// ---- P3/P4: price or discount asked with the minimum → not the MOQ information route; nothing granted ----
{const u=await start();const x=await turn(u,"قیمت و حداقل سفارش انگشتر کوچک 3 تکه برای 1000 عدد چنده؟",DA("برای ۱۰۰۰ عدد: {{COMMERCIAL}}","price",{mode:"quote",interp:{product_key:"list:انگشتر کوچک",quantity:1000},requests:["price","moq"],qrole:"order_count"}));const ai=x.r.brain?.ai_brain||{};
 ok("P3 price+MOQ turn does not take the MOQ information route",ai.partial_delivery?.owner_case!=="not_needed:answered_by_approved_moq"&&x.r.brain?.turn_policy?.mode==="quote",{pd:ai.partial_delivery,mode:x.r.brain?.turn_policy?.mode});
 ok("P3 any automatically sent total carries D-016 provenance",!x.sent.some(s=>/(?<![\d.])59400000(?!\d)/.test(num(s).replace(/[٬,]/g,"")))||x.r.brain?.standard_total===true&&!!x.r.brain?.standard_offer_authority,{sent:x.sent});}
{const u=await start();const x=await turn(u,"جعبه انگشتر چه مدل‌هایی دارید؟ حداقل سفارش چنده؟ ۲۰٪ تخفیف هم میدید؟",DA(MODELS+" حداقل سفارش از هر سایز ۳۰۰ عدده. تخفیف ۲۰٪ هم میدیم.","product_info",{requests:["product_info","moq","discount"]}));
 ok("P4 no 20% discount ever sent",!x.sent.some(s=>/20\s*(?:%|درصد)|۲۰\s*(?:٪|%|درصد)|بیست\s*درصد/.test(s)),x.sent);
 ok("P4 discount+MOQ turn does not take the MOQ information route",x.r.brain?.ai_brain?.partial_delivery?.owner_case!=="not_needed:answered_by_approved_moq",x.r.brain?.ai_brain?.partial_delivery);}
// ---- P5: payment asked with the minimum → no payment terms from the model, not the MOQ route ----
{const u=await start();const x=await turn(u,"حداقل سفارش جعبه انگشتر چنده؟ پرداختش چطوریه؟",DA(MODELS+" حداقل سفارش از هر سایز ۳۰۰ عدده. نصفش رو الان واریز کنید بقیه موقع تحویل.","product_info",{requests:["product_info","moq","payment"]}));
 ok("P5 no model-written payment instruction sent",!x.sent.some(s=>/واریز کنید|موقع تحویل/.test(s)),x.sent);
 ok("P5 payment+MOQ turn does not take the MOQ information route",x.r.brain?.ai_brain?.partial_delivery?.owner_case!=="not_needed:answered_by_approved_moq",x.r.brain?.ai_brain?.partial_delivery);}
// ---- P6: Iraq — the Iran-only MOQ fact never reaches an Iraq customer ----
{const u=await start("ARAB");const x=await turn(u,"شكد أقل كمية للطلب لعلب الخواتم؟",DA("علب الخواتم عدنا بثلاث قطع. أقل كمية 300 قطعة.","product_info",{requests:["product_info","moq"]}));
 ok("P6 the Iran MOQ fact is never sent to Iraq",!x.sent.some(s=>INTERNAL.test(s)||/(?<![\d])300(?!\d)/.test(num(s))),x.sent);}
// ---- REAL: the exact live message (bfebeb48…) with the real Iran catalog snapshot (fixtures/phase41-catalog.json, captured from
// Production 2026-11-09), the real approved knowledge rows (fixtures/phase47-approved-knowledge.json) and the real MOQ fact. Customer
// identity is synthetic (anonymised). The model wording is scripted (no paid call): the primary words the minimum itself, as in
// Production; R-A: the author repeats it (rewrite fails, the production case); R-B: a compliant author.
{const read=f=>JSON.parse(fs.readFileSync(path.join(REPO,"tests/harness/fixtures",f),"utf8").replace(/^﻿/,""));
 const catalog=read("phase41-catalog.json"),approved=read("phase47-approved-knowledge.json");
 const R=await makeWorld({aiBrain:"on",extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on",OWNER_TELEGRAM_CHAT_ID:OWNER}});R.d1.db.exec(ORCH);
 for(const p of ["/api/quotes","/api/si/knowledge/product","/api/owner-escalations","/api/leads/outreach","/api/content/pipeline"])await R.call(p,null,"GET");R.d1.db.exec(MIG);
 for(const [table,rows] of [["commercial_price_items",catalog.items],["business_settings",catalog.settings]])for(const row of rows){const k=Object.keys(row);R.dbrun(`INSERT INTO ${table}(${k.join(",")}) VALUES(${k.map(()=>"?").join(",")})`,Object.values(row));}
 for(const row of approved){const value=JSON.parse(row.value_json);await R.call("/api/sales-knowledge/teach",{market:row.market,records:[{...value,operation:"ADD",typed:null,entity:{type:row.entity_key==="global"?"business":"product",key:row.entity_key},concept:row.attribute}]});for(const x of R.q("SELECT id FROM sales_knowledge_change_requests WHERE status NOT IN ('applied','rejected')"))await R.approveK(x.id);}
 R.dbrun(KF,["knowledge-fact-owner-telegram-20261109-03","moq-iran","quantity","business","global","quantity_rule","IRAN","",JSON.stringify(MOQ_TEXT),createHash("sha256").update(JSON.stringify(MOQ_TEXT)).digest("hex"),1,"active","owner_approved","owner_form","owner-telegram-20261109-03","admin",T,T,T]);
 if(!(await R.call("/api/sales-ai-first",{mode:"on",allowlist:[]},"POST")).body?.ok)throw Error("AI-FIRST not set");
 const rOut=u=>R.tg.filter(x=>x.method==="sendMessage"&&(String(x.body).includes(`"chat_id":"${u.id}"`)||String(x.body).includes(`"chat_id":${u.id}`))).map(x=>{try{return JSON.parse(x.body).text||"";}catch{return "";}});
 const rLead=u=>R.q("SELECT lead_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(u.id)])[0]?.lead_id;
 const rOpen=u=>R.q("SELECT reason_code FROM owner_escalations WHERE lead_id=? AND status='open'",[rLead(u)]);
 const rTurn=async(u,msg,dec)=>{R.AI.script.set(msg,(ctx)=>{const d=dec(ctx);return d;});SA.resetSalesAiCooldown?.();const b=rOut(u).length;const r=await R.send(u,msg);return {r,sent:rOut(u).slice(b)};};
 const LIVE="سلام، برای انگشتر جعبه چه مدل‌هایی دارید؟ حداقل تعداد سفارش چقدره؟";
 const PRIMARY="سلام! برای جعبه انگشتر این مدل‌ها رو داریم: ۲ تکه، ۳ تکه، ۳ تکه کج، کشویی کج، کشویی روبان‌دار و کشویی بگ‌دار. حداقل سفارش از هر سایز ۳۰۰ عدده و برای کشویی بگ‌دار ۵۰۰ عدد.";
 const MODELS_ONLY="سلام! برای جعبه انگشتر این مدل‌ها رو داریم: ۲ تکه، ۳ تکه، ۳ تکه کج، کشویی کج، کشویی روبان‌دار و کشویی بگ‌دار.";
 const realDec=author=>ctx=>({requests:["product_info","moq"],reply:ctx?.authoring?[author??PRIMARY,...(ctx.authoring.required_parts||[])].join("\n"):PRIMARY,reply_colors:[],acceptance:false,interpretation:I("product_info"),
  semantics:{mode:"browse",quantity_role:"none",deal_reference:"none",repeat_requested:false},facts:{colors:[],color_parts:[],unknown_colors:[],color_statement:"none",negated_colors:[],quantity:null,destination:null,customer_name:null}});
 for(const [id,author] of [["R-A",null],["R-B",MODELS_ONLY]]){
  const u={id:++uid,name:"Anon "+uid,username:"anon"+uid};await rTurn(u,"سلام",()=>({...realDec(null)({}),requests:["greeting"],reply:"سلام، بفرمایید.",interpretation:I("greeting")}));R.setMarket(u,"iran");
  const msg=id==="R-A"?LIVE:LIVE+" ";const x=await rTurn(u,msg,realDec(author));const b=x.r.brain||{};
  const outcome=R.q("SELECT details_json FROM system_events WHERE id=?",["inbound-outcome:"+x.r.row.id])[0];const visible=outcome?JSON.parse(outcome.details_json).customer_visible:null;
  if(id==="R-A")console.log("FINAL CUSTOMER REPLY ("+id+"):\n"+(x.sent[0]||"<none>"));
  ok(id+" exact live message: reply SENT (draft sent, customer_visible=reply)",x.r.draft?.status==="sent"&&visible==="reply"&&x.sent.length===1,{status:x.r.draft?.status,err:x.r.draft?.error_detail,visible,sent:x.sent});
  ok(id+" approved ring-box models introduced",x.sent.length===1&&/۲ تکه/.test(x.sent[0])&&/کشویی روبان‌دار/.test(x.sent[0])&&/کشویی بگ‌دار/.test(x.sent[0]),x.sent);
  ok(id+" unapproved models (D-009 بازدار / یک‌دار) never offered",!x.sent.some(s=>/بازدار|یک‌دار|یکدار/.test(s)),x.sent);
  ok(id+" minimum explained per approved model group (customer-facing)",x.sent.length===1&&x.sent[0].includes(RING_MOQ),x.sent);
  ok(id+" no internal knowledge-base wording",!x.sent.some(s=>INTERNAL.test(s)),x.sent);
  ok(id+" every number in the reply is an approved model name or approved minimum",x.sent.every(s=>(num(s).match(/[0-9]+/g)||[]).every(v=>["2","3","300","500"].includes(v))),x.sent);
  ok(id+" no owner escalation for this ordinary question",rOpen(u).length===0&&b.next_best_action!=="ESCALATE_OWNER"&&b.needs_owner===false,{cases:rOpen(u),nba:b.next_best_action});
  ok(id+" MOQ traceable to the approved fact",(b.approved_guidance?.facts||[]).some(f=>f.id==="knowledge-fact-owner-telegram-20261109-03"),b.approved_guidance?.facts);}
 // unit: customer-facing rendering is bound to the approved fact (fail closed on disagreement) and to the market
 const G=await import(pathToFileURL(path.join(SRC,"approved-sales-guidance.js")).href);
 const cmt=typeof G.customerMoqText==="function"?G.customerMoqText:()=>undefined,fams=typeof G.moqFamilies==="function"?G.moqFamilies:()=>[];
 ok("G1 a fact whose minimum disagrees with the approved policy is not shown (fail closed)",cmt(MOQ_TEXT.replace("۳۰۰","۲۵۰"),{market:"IRAN",families:["ring"]})===null);
 ok("G2 the Iran fact is never rendered for Iraq",cmt(MOQ_TEXT,{market:"ARAB",families:["ring"]})===null);
 ok("G3 no family named → every approved group, still no internal wording",(t=>!!t&&t.includes("نیم‌سرویس و سرویس از هر سایز ۱۰۰ عدد")&&!INTERNAL.test(t))(cmt(MOQ_TEXT,{market:"IRAN",families:[]})));
 ok("G4 a half-service question shows the 100 group, not the ring line",(t=>!!t&&/۱۰۰ عدد/.test(t)&&!/انگشتر/.test(t))(cmt(MOQ_TEXT,{market:"IRAN",families:fams("حداقل سفارش نیم سرویس چنده؟")})));}
process.exitCode=done()?1:0;
