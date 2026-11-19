// RG1 v2 (GV1 owner decision 2026-11-19 — see the v2 note below) — REPLY GATE CORRECTION: a Reply Author reply that fails as a WHOLE because of one unsupported sentence no longer stops the
// whole answer or opens an owner case for an ordinary question (turn_policy.may_handoff=false). SYNTHETIC reproductions of the reported
// failure classes (protected_context_unverified_speech / unverified_business_assertion after a successful author call); they are NOT the
// five real post-v597 events, whose rows were not readable from this session. Local only: in-memory SQLite, recording Telegram, scripted
// model (no paid call); synthetic customers; no network, no real messages. Protected commercial claims keep their owner case.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";import {createHash} from "node:crypto";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase51_reply_gate_rg1");
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
let uid=774000000;
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
// Every case: the primary places the approved-information slot (valid, not retained because the engine filled the slot), so the
// Reply Author runs; the author copies the protected part and adds ONE extra sentence of the class under test.
const PRIMARY=MODELS+" {{INFORMATION}}";
const authored=extra=>DA(PRIMARY,"product_info",{...MOQ_REQ,author:MODELS+" "+extra});
const caseRun=async(id,msg,extra)=>{const u=await start();const x=await turn(u,msg+" ("+id+")",authored(extra));const b=x.r.brain||{},ai=b.ai_brain||{};return {u,x,b,ai,cases:open(u)};};
const report=(id,c)=>console.log(id+" → "+JSON.stringify({author_rejection:c.ai.author_rejection&&{prose:c.ai.author_rejection.prose_issues,validation:c.ai.author_rejection.validation?.reason,context:c.ai.author_rejection.protected_context?.reason},stage:c.ai.authorship?.stage,dropped:c.ai.partial_delivery?.dropped,owner_case:c.ai.partial_delivery?.owner_case||null,nba:c.b.next_best_action,may_handoff:c.b.turn_policy?.may_handoff,status:status(c.x),open_cases:c.cases.length}));
// v2 (FINAL owner architecture decision «REMOVE GENERAL SALES REPLY VALIDATION», 2026-11-19 — GV1). v1 (sha256 910d28a7…) is preserved in
// reports/gv1-20261119/superseded/. Changed expectations, each with its policy reason and the matching safety check:
//  E1/E2/E6/P1 — every E-case carries a PROTECTED part (the approved MOQ text). Next to a protected commercial part only grounded speech
//    is allowed (protectedContextIssue stays a commercial-integrity control): the informational sentence is removed, never the reply.
//  E3/E4/E5 — the invented price / delivery time / discount existed only in the Reply Author's rewrite; it is still never sent, and the
//    delivered text is Claude's validated primary reply, so no owner decision is left (owner item 3). Safety: E3p — the same claim in
//    Claude's OWN reply is removed and its owner case is kept (D-004).
// E1 — informational product description next to the protected MOQ part: that sentence is removed, the reply is sent, no owner case
{const c=await caseRun("E1",LIVE_Q,"داخل همه این جعبه‌ها مخمل ضدآب و ضدخش داره.");report("E1",c);
 ok("E1 reply SENT with models + approved MOQ",status(c.x)==="sent"&&c.x.sent.length===1&&modelsAnswered(c.x.sent[0])&&c.x.sent[0].includes(RING_MOQ),{status:status(c.x),err:c.x.r.draft?.error_detail,sent:c.x.sent});
 ok("E1 the unsupported sentence next to the protected part is never sent",!c.x.sent.some(s=>/مخمل|ضدآب|ضدخش/.test(s)),c.x.sent);
 ok("E1 no owner escalation (may_handoff=false, informational sentence only)",c.cases.length===0&&c.b.next_best_action!=="ESCALATE_OWNER",{cases:c.cases,nba:c.b.next_best_action});}
// E2 — unverified sales speech next to a protected part (protected_context_unverified_speech class): removed, reply sent, no owner case
{const c=await caseRun("E2",LIVE_Q,"این جعبه‌ها پرفروش‌ترین و باکیفیت‌ترین جعبه‌های بازار هستن.");report("E2",c);
 ok("E2 reply SENT with the approved MOQ part unchanged",status(c.x)==="sent"&&c.x.sent.length===1&&c.x.sent[0].includes(RING_MOQ),{status:status(c.x),sent:c.x.sent});
 ok("E2 the unverified claim next to the protected part is never sent",!c.x.sent.some(s=>/پرفروش|باکیفیت/.test(s)),c.x.sent);
 ok("E2 no owner escalation",c.cases.length===0&&c.b.next_best_action!=="ESCALATE_OWNER",{cases:c.cases,nba:c.b.next_best_action});}
// E3–E5 — commercial claim invented only by the Reply Author: never sent; Claude's validated primary is delivered; no owner decision left
for(const [id,extra,forbidden] of [["E3","قیمت هر عدد هم ۵۰ هزار تومنه.",s=>/تومن|تومان|(?<![\d])50(?!\d)/.test(num(s))],["E4","سفارش‌ها ظرف ۷ روز کاری آماده و ارسال میشن.",s=>/روز|(?<![\d])7(?!\d)/.test(num(s))],["E5","برای سفارش اول ۲۰٪ تخفیف داریم و نصفش رو الان واریز کنید.",s=>/تخفیف|واریز|٪|%/.test(s)]]){
 const c=await caseRun(id,LIVE_Q,extra);report(id,c);
 ok(id+" the invented commercial claim is never sent",!c.x.sent.some(forbidden),c.x.sent);
 ok(id+" GV1: the author failure does not destroy the valid first reply (models + approved MOQ sent)",status(c.x)==="sent"&&c.x.sent.length===1&&modelsAnswered(c.x.sent[0])&&c.x.sent[0].includes(RING_MOQ),{status:status(c.x),sent:c.x.sent,stage:c.ai.authorship?.stage});
 ok(id+" GV1: no owner case — the claim was never in the delivered reply and nothing commercial is left open",c.cases.length===0,c.cases);}
// E3p — the invented price is in the model's OWN first reply (and the author repeats it): removed, never sent, the owner case is KEPT (D-004)
{const u=await start();const x=await turn(u,LIVE_Q+" (E3p)",DA(MODELS+" قیمت هر عدد هم ۵۰ هزار تومنه. {{INFORMATION}}","product_info",{...MOQ_REQ}));
 ok("E3p the invented price is never sent",!x.sent.some(s=>/تومن|تومان|(?<![\d])50(?!\d)/.test(num(s))),x.sent);
 ok("E3p the verified rest (models + approved MOQ) is sent",status(x)==="sent"&&x.sent.length===1&&modelsAnswered(x.sent[0])&&x.sent[0].includes(RING_MOQ),{status:status(x),sent:x.sent});
 ok("E3p a price removed from the model's own reply keeps the owner case",open(u).length===1,open(u));}
// E6 — the author reply is only an informational claim + the protected part: the claim is never sent, the valid first reply is, no owner case
{const u=await start();const x=await turn(u,LIVE_Q+" (E6)",DA(PRIMARY,"product_info",{...MOQ_REQ,author:"همه این مدل‌ها ضدآب و ضدخش هستن."}));const ai=x.r.brain?.ai_brain||{};
 ok("E6 GV1: the reply is sent with the approved MOQ part",status(x)==="sent"&&x.sent.length===1&&x.sent[0].includes(RING_MOQ),{status:status(x),sent:x.sent});
 ok("E6 the unsupported sentence is never sent",!x.sent.some(s=>/ضدآب|ضدخش/.test(s)),x.sent);
 ok("E6 no owner escalation",open(u).length===0,open(u));}
// E7 — the author itself asks for the owner → its claim is not used (its own path)
{const u=await start();const msg=LIVE_Q+" (E7)";const base=authored("داخلش مخمل ضدآب داره.");
 const x=await turn(u,msg,ctx=>{const d=base(ctx);return ctx?.authoring?{...d,owner_escalation_needed:true,escalation_reason:"missing_knowledge",missing_information:["جنس داخل جعبه"]}:d;});
 ok("E7 the unsupported sentence is never sent",!x.sent.some(s=>/مخمل|ضدآب/.test(s)),x.sent);}
// P — protected flows unchanged: quote mode is not salvaged by RG1; no AI figure reaches the customer
{const u=await start();const x=await turn(u,"قیمت انگشتر کوچک 3 تکه برای 1000 عدد چنده؟ (P1)",DA("برای ۱۰۰۰ عدد: {{COMMERCIAL}}","price",{mode:"quote",interp:{product_key:"list:انگشتر کوچک",quantity:1000},requests:["price"],qrole:"order_count",author:"برای ۱۰۰۰ عدد: داخلش مخمل ضدآب داره."}));
 ok("P1 a quote turn never takes the RG1 sentence repair",x.r.brain?.ai_brain?.authorship?.stage!=="author_sentence_repair",x.r.brain?.ai_brain?.authorship);
 ok("P1 GV1: any figure sent is the exact engine document",x.sent.length<=1&&x.sent.every(s=>!/تومان/.test(s)||s.includes("هر عدد ۶۶٬۰۰۰ تومان")),x.sent);}
// ---- GV1 checklist (owner item 5). Synthetic, scripted model; NOT replays of the three Production events (their model text is not available).
// G1 — an ordinary question about models: the model's reply is sent as written, without a second authoring pass, no owner case
{const u=await start();const q="سلام، جعبه انگشتر چه مدل‌هایی دارید؟ (G1)";const reply=MODELS+" مدل کشویی بگ‌دار برای هدیه خیلی شیک و جذابه.";
 const x=await turn(u,q,DA(reply,"product_info",{requests:["product_info"]}));const ai=x.r.brain?.ai_brain||{};
 ok("G1 the model's own reply is sent unchanged",status(x)==="sent"&&x.sent.length===1&&x.sent[0]===reply,{status:status(x),sent:x.sent,err:x.r.draft?.error_detail});
 ok("G1 no second authoring pass (stage primary)",ai.authorship?.stage==="primary"&&!ai.author_call,ai.authorship);
 ok("G1 no owner case",open(u).length===0,open(u));}
// G2 — owner item 2 (read-only informational checks): with NO protected part in the reply, an unsupported product-description sentence
// is sent as the model wrote it, the finding is recorded in ai_brain.advisory, and no owner case is opened (changed expectation, owner decision).
{const u=await start();const q="جعبه انگشتر چه مدل‌هایی دارید؟ (G2)";const reply=MODELS+" داخل همه این جعبه‌ها مخمل ضدآب و ضدخش داره.";
 const x=await turn(u,q,DA(reply,"product_info",{requests:["product_info"]}));const ai=x.r.brain?.ai_brain||{};
 ok("G2 the reply is sent as written",status(x)==="sent"&&x.sent.length===1&&x.sent[0]===reply,{status:status(x),sent:x.sent,err:x.r.draft?.error_detail});
 ok("G2 the informational finding is recorded read-only (ai_brain.advisory)",(ai.advisory||[]).some(a=>a.codes?.length),ai.advisory);
 ok("G2 no owner case",open(u).length===0,open(u));}
// G3 — a multi-part question with one part not in approved knowledge: the known part is answered, the unknown is said honestly, no hold
{const u=await start();const q="جعبه انگشتر چه مدل‌هایی دارید و داخلش چه جنسیه؟ (G3)";const reply=MODELS+" درباره جنس داخل جعبه اطلاعات دقیقی ندارم؛ اگه عکس یا نمونه‌ای مد نظرتونه بفرستید.";
 const x=await turn(u,q,DA(reply,"product_info",{requests:["product_info","material"]}));
 ok("G3 the multi-part question is answered, not left unanswered",status(x)==="sent"&&x.sent.length===1&&modelsAnswered(x.sent[0])&&/اطلاعات دقیقی ندارم/.test(x.sent[0]),{status:status(x),sent:x.sent,err:x.r.draft?.error_detail});
 ok("G3 no owner case for an honestly stated unknown",open(u).length===0,open(u));}
// G4 — the second Reply Author fails (provider error): the valid first reply is still delivered, no owner case
{const u=await start();const base=DA(PRIMARY,"product_info",{...MOQ_REQ});
 const x=await turn(u,LIVE_Q+" (G4)",ctx=>{if(ctx?.authoring)throw Error("author provider unavailable (synthetic)");return base(ctx);});const ai=x.r.brain?.ai_brain||{};
 ok("G4 the author call really failed",!!ai.author_call?.error||!!ai.provider_failure,{author_call:ai.author_call,provider_failure:ai.provider_failure});
 ok("G4 the first reply (models + approved MOQ) is delivered",status(x)==="sent"&&x.sent.length===1&&modelsAnswered(x.sent[0])&&x.sent[0].includes(RING_MOQ),{status:status(x),sent:x.sent,err:x.r.draft?.error_detail});
 ok("G4 a Reply Author failure alone opens no owner case",open(u).length===0,open(u));}
// G6 — order registration / payment confirmation in the model's own words is never sent
{const u=await start();const x=await turn(u,"سلام، جعبه انگشتر چه مدل‌هایی دارید؟ (G6)",DA(MODELS+" سفارش شما ثبت شد و پرداخت شما تأیید شده است.","product_info",{requests:["product_info"]}));
 ok("G6 no order registration or payment confirmation is sent",!x.sent.some(s=>/ثبت شد|تأیید شده|تایید شده/.test(s)),x.sent);
 ok("G6 the verified rest is still answered",x.sent.length===1&&modelsAnswered(x.sent[0]),{status:status(x),sent:x.sent});}
process.exitCode=done()?1:0;
