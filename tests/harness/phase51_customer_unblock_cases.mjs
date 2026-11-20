// Owner directive «FINAL CUSTOMER CONVERSATION UNBLOCK» (2026-11-19): the two reported Production conversations, reproduced LOCALLY with
// anonymized synthetic customers and a SCRIPTED model (the real model output was not available: NOT a replay of the live model).
// Case 1 (inbox eb0916b5…, «کشویی بک دار سرویس چنده؟», live error catalog_configuration_mismatch): a price question whose product choice
//   is incomplete gets Claude's clarifying question, sent automatically, needsOwner=false, no owner case, no price.
// Case 2 (inbox 2e03eeb1…, ring-box models + minimum order): the approved answer is sent, needsOwner=false, no owner case.
// In-memory SQLite, recording Telegram, no network, no real messages.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";import {createHash} from "node:crypto";
import {makeWorld,reporter} from "./harness.mjs";
import {evaluationWorld} from "./phase51-evaluation-world.mjs";
const {ok,done}=reporter("phase51_customer_unblock_cases");
const num=t=>String(t||"").replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d));
// ---- Case 1: evaluation world (approved catalogue with «سرویس» and «نیم سرویس» products) ----
{const {W,client,sent}=await evaluationWorld();
 const I=o=>({primary_intent:"price",product_key:null,reference:"none",requested_size:null,requested_color:[],requested_structure:null,requested_printing:null,quantity:null,ambiguity:"ambiguous",confidence:"medium",...o});
 const dec=(reply,mode="browse")=>W.D({reply,requests:["price"],interpretation:I({}),semantics:{mode,quantity_role:"none",deal_reference:"none",repeat_requested:false},facts:{colors:[],color_parts:[],unknown_colors:[],color_statement:"none",negated_colors:[],quantity:null,destination:null,customer_name:null},acceptance:false,rejection:false,owner_escalation_needed:false,escalation_reason:null,missing_information:[]});
 const owners=row=>W.q("SELECT reason_code FROM owner_escalations WHERE source_message_id=? AND status='open'",[row.id]);
 const run=async(tag,reply,mode)=>{const u=await client("IRAN"),q="کشویی بک دار سرویس چنده؟ ("+tag+")";W.AI.script.set(q,ctx=>dec(ctx?.authoring?reply+"\n"+(ctx.authoring.required_parts||[]).join("\n"):reply,mode));const start=W.tg.length,r=await W.send(u,q);return {r,b:r.brain||{},texts:sent(u,start),owners:owners(r.row)};};
 const CLARIFY="منظورتون سرویس کامل کشویی بگ‌دار هست یا نیم‌سرویس کشویی بگ‌دار؟";
 for(const mode of ["browse","quote"]){const x=await run("C1-"+mode,CLARIFY,mode);
  ok("Case 1 ("+mode+"): Claude's clarifying question is sent automatically",x.texts.length===1&&x.texts[0]===CLARIFY&&x.r.draft?.status==="sent",{texts:x.texts,validation:x.b.validation,err:x.r.draft?.error_detail});
  ok("Case 1 ("+mode+"): ASK_REQUIRED_FIELD, needsOwner=false, no owner case",x.b.next_best_action==="ASK_REQUIRED_FIELD"&&x.b.needs_owner===false&&x.owners.length===0,{nba:x.b.next_best_action,needs_owner:x.b.needs_owner,owners:x.owners});
  ok("Case 1 ("+mode+"): no price or amount is sent",!x.texts.some(t=>/تومان|تومن|[0-9]{3,}/.test(num(t))),x.texts);}
 // the catalogue control itself is unchanged: an asserted off-list combination or an invented price is never sent
 // (FINAL STRUCTURAL FIX, item 4: instead of holding, the engine's own clarifying question replaces the rejected text)
 {const x=await run("C1-claim","سرویس کامل کشویی بگ‌دار داریم.");ok("Case 1 control: an asserted catalogue combination is never sent; a clarifying question is",x.texts.length===1&&!/داریم/.test(x.texts[0])&&/[؟?]/u.test(x.texts[0])&&x.owners.length===0,{texts:x.texts,owners:x.owners});}
 {const x=await run("C1-price","سرویس کشویی بگ‌دار هر عدد ۵۰ هزار تومنه.");ok("Case 1 control: an invented price is never sent",!x.texts.some(t=>/تومن|تومان|(?<![0-9])50(?![0-9])/.test(num(t))),x.texts);}
 // Live 043bf2da (FINAL STRUCTURAL FIX): the recorded decision conditions — mode=quote, ambiguity=structure, may_handoff=false,
 // pricing missing_attribute. Whatever the model writes, the turn takes the clarification route: a valid clarifying question, no price,
 // ASK_REQUIRED_FIELD, needsOwner=false, no owner case, no Reply Author.
 const decQ=reply=>W.D({reply,requests:["price"],interpretation:I({ambiguity:"structure"}),semantics:{mode:"quote",quantity_role:"none",deal_reference:"none",repeat_requested:false},facts:{colors:[],color_parts:[],unknown_colors:[],color_statement:"none",negated_colors:[],quantity:null,destination:null,customer_name:null},acceptance:false,rejection:false,owner_escalation_needed:false,escalation_reason:null,missing_information:[]});
 for(const [tag,reply] of [["correct question",CLARIFY],["claims an unidentified model","سرویس کامل کشویی بگ‌دار داریم و خیلی شیکه."],["price without enough information","سرویس کشویی بگ‌دار هر عدد ۵۰ هزار تومنه."]]){
  const u=await client("IRAN"),q="کشویی بک دار سرویس چنده؟ (043bf2da "+tag+")";W.AI.script.set(q,ctx=>decQ(ctx?.authoring?reply+"\n"+(ctx.authoring.required_parts||[]).join("\n"):reply));
  const start=W.tg.length,r=await W.send(u,q),b=r.brain||{},ai=b.ai_brain||{},texts=sent(u,start);
  ok("043bf2da ("+tag+"): recorded decision conditions reproduced",b.turn_policy?.mode==="quote"&&b.turn_policy?.ambiguity==="structure"&&b.turn_policy?.may_handoff===false&&b.sales_agent?.pricing_status==="missing_attribute",{policy:b.turn_policy,pricing:b.sales_agent?.pricing_status});
  ok("043bf2da ("+tag+"): one clarifying question is sent, no price",texts.length===1&&/[؟?]/u.test(texts[0])&&!/تومان|تومن|(?<![0-9])50(?![0-9])/.test(num(texts[0]))&&!/داریم/.test(texts[0])&&r.draft?.status==="sent",{texts,err:r.draft?.error_detail});
  ok("043bf2da ("+tag+"): clarification route — ASK_REQUIRED_FIELD, needsOwner=false, no owner case, no Reply Author",["ask_attribute","clarify_product"].includes(b.next_sales_action)&&b.next_best_action==="ASK_REQUIRED_FIELD"&&b.needs_owner===false&&owners(r.row).length===0&&!ai.author_call,{action:b.next_sales_action,nba:b.next_best_action,needs_owner:b.needs_owner,owners:owners(r.row),stage:ai.authorship?.stage});}
 ok("Case 1: no real network transport",W.offNet().length===0,W.offNet());}
// ---- Case 2: world with the exact owner-approved MOQ fact (same seeds as phase51_reply_gate_rg1) ----
{const REPO=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
 const SA=await import(pathToFileURL(path.join(REPO,"worker/src/sales-ai-brain.js")).href);
 const W=await makeWorld({aiBrain:"on",extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on",OWNER_TELEGRAM_CHAT_ID:"-100555123456"}});
 W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
 for(const p of ["/api/quotes","/api/si/knowledge/product","/api/owner-escalations","/api/leads/outreach","/api/content/pipeline"])await W.call(p,null,"GET");
 W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/phase25-delete-system/01-migration.sql"),"utf8"));
 const T="2026-10-01T00:00:00.000Z",L="INSERT INTO commercial_price_items(id,product_key,product_name,sku,market,currency,unit_price_minor,moq,version,active,effective_from,effective_until,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
 let n=0;for(const [name,price] of [["انگشتر کوچک · 5x5 · 2 تکه",60000],["انگشتر کوچک · 5x5 · 3 تکه",66000],["انگشتر کوچک · 5x5 · کشویی کج",70000],["انگشتر کوچک · 5x5 · کشویی بگ‌دار",90000],["انگشتر بزرگ · 7x7 · 3 تکه",80000]])W.dbrun(L,["R"+(++n),"k"+n,name,null,"IRAN","TOMAN",price,null,1,1,null,null,"admin",T,T,T]);
 const MOQ_TEXT="فقط ایران: در پنج مدل فعلی غیر از کشویی بگ‌دار، حداقل سفارش از هر سایز ۳۰۰ عدد است؛ نیم‌سرویس و سرویس هرکدام ۱۰۰ عدد. کشویی بگ‌دار در هر سایز موجود حداقل ۵۰۰ عدد است. حداقل هر سایز مستقل است؛ به مدل جدید تعمیم داده نشود. حداقل عراق همان ۵۰۰ عدد می‌ماند.";
 W.dbrun("INSERT INTO sales_knowledge_facts(id,fact_key,domain,entity_type,entity_key,attribute,market,member_key,value_json,value_hash,version,status,authority,source_type,change_request_id,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",["knowledge-fact-owner-telegram-20261109-03","moq-iran","quantity","business","global","quantity_rule","IRAN","",JSON.stringify(MOQ_TEXT),createHash("sha256").update(JSON.stringify(MOQ_TEXT)).digest("hex"),1,"active","owner_approved","owner_form","owner-telegram-20261109-03","admin",T,T,T]);
 if(!(await W.call("/api/sales-ai-first",{mode:"on",allowlist:[]},"POST")).body?.ok)throw Error("AI-FIRST not set");
 const D=(reply,requests)=>ctx=>({requests,reply:ctx?.authoring?[reply,...(ctx.authoring.required_parts||[])].join("\n"):reply,reply_colors:[],acceptance:false,interpretation:{primary_intent:"product_info",product_key:null,reference:"none",requested_size:null,requested_color:[],requested_structure:null,requested_printing:null,quantity:null,ambiguity:"none",confidence:"high"},semantics:{mode:"browse",quantity_role:"none",deal_reference:"none",repeat_requested:false},facts:{colors:[],color_parts:[],unknown_colors:[],color_statement:"none",negated_colors:[],quantity:null,destination:null,customer_name:null}});
 let uid=775000000;const out=u=>W.tg.filter(x=>x.method==="sendMessage"&&String(x.body).includes(String(u.id))).map(x=>{try{return JSON.parse(x.body).text||"";}catch{return "";}});
 const leadOf=u=>W.q("SELECT lead_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(u.id)])[0]?.lead_id;
 const turn=async(u,msg,dec)=>{W.AI.script.set(msg,dec);SA.resetSalesAiCooldown?.();const b=out(u).length;const r=await W.send(u,msg);return {r,sent:out(u).slice(b)};};
 const MODELS="جعبه انگشتر رو در مدل‌های ۲ تکه، ۳ تکه، کشویی کج و کشویی بگ‌دار داریم.",RING_MOQ="حداقل سفارش جعبه انگشتر از هر سایز: در مدل‌های ۲ تکه، ۳ تکه، ۳ تکه کج، کشویی کج و کشویی روبان‌دار ۳۰۰ عدد و در مدل کشویی بگ‌دار ۵۰۰ عدد.";
 for(const [tag,reply] of [["slot",MODELS+" {{INFORMATION}}"],["own-moq-wording",MODELS+" حداقل سفارش در این مدل‌ها ۳۰۰ عدد و در کشویی بگ‌دار ۵۰۰ عدد است."]]){
  const u={id:++uid,name:"C2 "+uid,username:"c2"+uid};await turn(u,"سلام",D("سلام، بفرمایید.",["greeting"]));W.setMarket(u,"iran");
  const x=await turn(u,"سلام برای انگشتری جعبه چه مدل هایی دارید؟حداقل تعداد سفارش چقدره؟ ("+tag+")",D(reply,["product_info","moq"]));const b=x.r.brain||{};
  ok("Case 2 ("+tag+"): models + the exact approved minimum order are sent",x.r.draft?.status==="sent"&&x.sent.length===1&&x.sent[0].includes("کشویی بگ‌دار داریم")&&x.sent[0].includes(RING_MOQ),{sent:x.sent,err:x.r.draft?.error_detail});
  ok("Case 2 ("+tag+"): needsOwner=false, no owner case",b.needs_owner===false&&!W.q("SELECT id FROM owner_escalations WHERE lead_id=? AND status='open'",[leadOf(u)]).length,{needs_owner:b.needs_owner,reason:b.needs_owner_reason});}
 ok("Case 2: no real network transport",W.offNet().length===0,W.offNet());}
process.exitCode=done()?1:0;
