// PHASE 30 — AI-FIRST final stabilization (owner directive 2026-11-08): explicit colour placement per catalog part, replacement and
// negation of earlier choices, labelled colours inside questions, size correction, the owner-only financial chain without a deposit,
// duplicate acceptance, Iran / Iraq currency separation, and owner-alert reliability (invalid group, bounded retries, ambiguous sends,
// Dashboard fallback). Local only: Claude, Telegram and D1 are in-process mocks; nothing real is sent.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase30_ai_first_stabilization");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const ORCH=fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8");
const MIG=fs.readFileSync(path.join(REPO,"owner-actions/phase25-delete-system/01-migration.sql"),"utf8");
const SA=await import(pathToFileURL(path.join(REPO,"worker/src/sales-ai-brain.js")).href);
const FQ=await import(pathToFileURL(path.join(REPO,"worker/src/final-quote-review.js")).href);
const OWNER="-100555123456",T="2026-10-01T00:00:00.000Z";
const L=`INSERT INTO commercial_price_items(id,product_key,product_name,sku,market,currency,unit_price_minor,moq,version,active,effective_from,effective_until,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
const S="INSERT INTO business_settings(id,setting_key,scope_key,value_json,version,status,approved_by,approved_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)";
const FA=["مشکی سلفون","طلایی سلفون","سرمه‌ای سلفون"];
const world=async({mode="on",owner=OWNER}={})=>{
  const W=await makeWorld({aiBrain:"on",extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on",OWNER_TELEGRAM_CHAT_ID:owner}});W.d1.db.exec(ORCH);
  for(const p of ["/api/quotes","/api/si/knowledge/product","/api/owner-escalations","/api/leads/outreach","/api/content/pipeline"])await W.call(p,null,"GET");W.d1.db.exec(MIG);
  W.dbrun("CREATE TABLE IF NOT EXISTS telegram_media_sources(id TEXT PRIMARY KEY,chat_id TEXT NOT NULL,chat_username TEXT,message_id TEXT NOT NULL,file_id TEXT NOT NULL,file_unique_id TEXT,media_type TEXT,caption TEXT,source_kind TEXT,created_at TEXT,updated_at TEXT)");
  W.dbrun(L,["R1","k1","انگشتر کوچک · 5x5 · 3 تکه",null,"IRAN","TOMAN",66000,null,1,1,null,null,"admin",T,T,T]);
  W.dbrun(L,["R2","k2","انگشتر بزرگ · 6x6 · 3 تکه",null,"IRAN","TOMAN",80000,null,1,1,null,null,"admin",T,T,T]);
  W.dbrun(L,["R3","k3","انگشتر کشویی · 6x6 · کشویی",null,"IRAN","TOMAN",90000,null,1,1,null,null,"admin",T,T,T]);
  W.dbrun(L,["A1","a1","علبة خاتم صغيرة · 5x5x4 · ثلاث قطع",null,"ARAB","USD",60,null,1,1,null,null,"admin",T,T,T]);
  W.dbrun(S,["dpi","deposit_percent","market:IRAN","50",1,"current","owner",T,T]);W.dbrun(S,["dpa","deposit_percent","market:ARAB","50",1,"current","owner",T,T]);
  let n=0;for(const c of FA)await W.teach(`COLOR | ${c} | IRAN`,"IRAN","c"+(++n));
  const set=await W.call("/api/sales-ai-first",{mode},"POST");if(!set.body?.ok)throw Error("mode");SA.resetSalesAiCooldown();return W;};
let uid=751000000;const customer=async(W,mk="iran")=>{const u={id:++uid,name:"Nazanin",username:"naz"+uid};await W.send(u,mk==="iran"?"سلام":"هلا");W.setMarket(u,mk);return u;};
const leadOf=(W,u)=>W.q("SELECT lead_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(u.id)])[0]?.lead_id;
const out=(W,u)=>W.tg.filter(x=>x.method==="sendMessage"&&(String(x.body).includes(`"chat_id":"${u.id}"`)||String(x.body).includes(`"chat_id":${u.id}`))).map(x=>{try{return JSON.parse(x.body).text||"";}catch{return "";}});
const toOwner=W=>W.tg.filter(x=>x.method==="sendMessage"&&String(x.body).includes(`"chat_id":"${OWNER}"`)).map(x=>JSON.parse(x.body).text);
const mem=(W,u,k)=>{const r=W.q("SELECT value_json FROM conversation_memory_facts WHERE lead_id=? AND memory_key=? AND status='active' ORDER BY created_at DESC LIMIT 1",[leadOf(W,u),k])[0];return r?JSON.parse(r.value_json):undefined;};
const A=(reply,o={})=>()=>({requests:o.requests||[],reply,reply_colors:o.reply_colors||[],acceptance:!!o.acceptance,owner_escalation_needed:!!o.escalate,escalation_reason:o.escalate||null,interpretation:o.interp||null,
  facts:{colors:o.colors||[],color_parts:o.parts||[],unknown_colors:[],color_statement:o.statement||"none",negated_colors:o.negated||[],quantity:o.quantity??null,product:o.product||null,model:o.model||null,size:o.size||null}});
const turn=async(W,u,msg,dec)=>{if(dec)W.AI.script.set(msg,dec);const b=out(W,u).length;const r=await W.send(u,msg);return {...r,texts:out(W,u).slice(b)};};
const aiSent=r=>/^ai/.test(String(r.brain?.ai_brain?.reply_source||""))&&r.outcome?.customer_visible==="reply";
const num=t=>String(t||"").replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[٬,]/g,"");

const W=await world();

// ---- colour placement, replacement, negation (Claude's structured reading + the catalog's own parts)
{const u=await customer(W);
 await turn(W,u,"جعبه انگشتر کشویی رو برای هدیه می‌خوام",A("جعبه انگشتر کشویی انتخاب خیلی شیکیه؛ بیرون و داخلش رو می‌تونید جدا رنگ کنید.",{requests:["product_info"]}));
 const r1=await turn(W,u,"برای بیرونی مشکی سلفون و داخل طلایی سلفون رو انتخاب کردم",A("عالیه؛ بیرونی مشکی سلفون و داخل طلایی سلفون.",{statement:"choice",parts:[{part:"بیرونی",color:"مشکی سلفون"},{part:"داخل",color:"طلایی سلفون"}],reply_colors:["مشکی سلفون","طلایی سلفون"]}));
 ok("P1 an explicit placement on the catalog's own parts is stored per part",JSON.stringify(mem(W,u,"color_parts"))===JSON.stringify({"بیرونی":"مشکی سلفون","داخل":"طلایی سلفون"}),mem(W,u,"color_parts"));
 ok("P1 Claude's reply for it is sent",aiSent(r1),[r1.brain?.ai_brain?.reply_source,r1.brain?.ai_brain?.fallback,r1.outcome]);
 const r2=await turn(W,u,"نه، داخل طلایی نمی‌خوام، داخل سرمه‌ای می‌خوام",A("حتماً، داخل سرمه‌ای سلفون شد و بیرونی همون مشکی سلفون.",{statement:"correction",parts:[{part:"داخل",color:"سرمه‌ای سلفون"}],negated:["طلایی سلفون"],reply_colors:["سرمه‌ای سلفون","مشکی سلفون"]}));
 const p2=mem(W,u,"color_parts")||{},s2=mem(W,u,"selected_colors")||[];
 ok("P2 a negated part colour is superseded by the new explicit one; the other part stays",p2["داخل"]==="سرمه‌ای سلفون"&&p2["بیرونی"]==="مشکی سلفون"&&!s2.includes("طلایی سلفون"),[p2,s2]);
 const hist=W.q("SELECT COUNT(*) n FROM conversation_memory_facts WHERE lead_id=? AND memory_key='color_parts'",[leadOf(W,u)])[0].n;
 ok("P2 the earlier placement is kept as history (audit trail), not overwritten in place",hist>=2,hist);
 await turn(W,u,"اگه بیرونش طلایی باشه چطور میشه؟",A("بیرونی طلایی سلفون خیلی پرزرق‌وبرق می‌شه؛ مشکی سلفون رسمی‌تره.",{statement:"hypothetical",parts:[{part:"بیرونی",color:"طلایی سلفون"}],reply_colors:["طلایی سلفون","مشکی سلفون"]}));
 ok("P3 a hypothetical placement changes nothing",(mem(W,u,"color_parts")||{})["بیرونی"]==="مشکی سلفون",mem(W,u,"color_parts"));
 await turn(W,u,"مشکی نمی‌خوام اصلاً",A("باشه، مشکی سلفون رو برداشتم؛ برای بیرونی چه رنگی دوست دارید؟",{statement:"negation",negated:["مشکی سلفون"],reply_colors:["مشکی سلفون"]}));
 const p4=mem(W,u,"color_parts")||{},s4=mem(W,u,"selected_colors")||[];
 ok("P4 a plain negation removes that colour from every part and from the selection",!Object.values(p4).includes("مشکی سلفون")&&!s4.includes("مشکی سلفون"),[p4,s4]);}
{const u=await customer(W);
 await turn(W,u,"جعبه انگشتر کوچک 3 تکه می‌خوام",A("انگشتر کوچک سه‌تکه انتخاب خوبیه.",{requests:["product_info"]}));
 const r=await turn(W,u,"بیرونی مشکی سلفون و داخل طلایی سلفون رو انتخاب کردم",A("این مدل سه‌تکه‌ست (بالا، وسط، پایین)؛ کدوم قسمت مشکی سلفون باشه و کدوم طلایی سلفون؟",{statement:"choice",parts:[{part:"بیرونی",color:"مشکی سلفون"},{part:"داخل",color:"طلایی سلفون"}],reply_colors:["مشکی سلفون","طلایی سلفون"]}));
 ok("P5 a placement on parts this model does not have is NOT stored (no invented compatibility); Claude's question is sent",mem(W,u,"color_parts")===undefined&&mem(W,u,"selected_colors")===undefined&&r.brain?.ai_brain?.colour_parts_unsupported===true&&aiSent(r),[mem(W,u,"color_parts"),mem(W,u,"selected_colors"),r.outcome]);}
{const u=await customer(W);const r=await turn(W,u,"رنگ بیرونی مشکی سلفون خوبه یا سرمه‌ای؟",A("هر دو شیکن؛ مشکی سلفون رسمی‌تره و سرمه‌ای سلفون آرام‌تر.",{statement:"comparison",reply_colors:["مشکی سلفون","سرمه‌ای سلفون"]}));
 ok("P6 a labelled colour inside a question is not captured as the exterior colour",mem(W,u,"exterior_color")===undefined&&aiSent(r),[mem(W,u,"exterior_color"),r.outcome]);
 const W0=await world({mode:"off"});const v=await customer(W0);await turn(W0,v,"رنگ بیرونی مشکی سلفون خوبه یا سرمه‌ای؟",A("هر دو شیکن.",{statement:"comparison"}));
 ok("P6 (before / off) the same message is captured as today — the fix is AI-first only",mem(W0,v,"exterior_color")!==undefined,mem(W0,v,"exterior_color"));}

// ---- size correction (product configuration) with engine pricing
{const W2=await world();const u=await customer(W2);
 await turn(W2,u,"قیمت انگشتر کوچک 3 تکه برای 1000 عدد چنده؟",A("برای ۱۰۰۰ عدد انگشتر کوچک: {{COMMERCIAL}}",{quantity:1000,requests:["price"]}));
 const r=await turn(W2,u,"نه ببخشید، انگشتر بزرگ 3 تکه رو می‌خوام؛ قیمتش برای همون 1000 عدد چند میشه؟",A("حتماً، انگشتر بزرگ سه‌تکه برای ۱۰۰۰ عدد: {{COMMERCIAL}}",{quantity:1000,product:"انگشتر بزرگ",size:"6x6",requests:["price","correction"]}));
 const t=num(r.texts.join(" "));
 ok("Z1 a size correction re-prices the NEW configuration from the engine (6x6: 80,000 each), never the old one",/80000/.test(t)&&!/66000/.test(t)&&r.outcome?.customer_visible==="reply",[r.texts,r.outcome]);}

// ---- financial chain: acceptance without deposit, customer «finalise», owner verification and finalisation, duplicates, currencies
{const W3=await world();const u=await customer(W3);
 await turn(W3,u,"قیمت انگشتر کوچک 3 تکه برای 1500 عدد چنده؟",A("برای ۱۵۰۰ عدد: {{COMMERCIAL}}",{quantity:1500,requests:["price"]}));
 const o0=toOwner(W3).length;
 await turn(W3,u,"قبوله، همین رو سفارش میدم",A("ممنونم! {{COMMERCIAL}}",{acceptance:true,requests:["acceptance"]}));
 await turn(W3,u,"قبوله دیگه، ثبتش کنید",A("ممنونم! {{COMMERCIAL}}",{acceptance:true,requests:["acceptance"]}));
 const orders=W3.q("SELECT * FROM lead_orders WHERE lead_id=?",[leadOf(W3,u)]),order=orders[0];
 ok("F1 acceptance without a deposit = ONE pending order candidate, not paid, not released",orders.length===1&&order.status==="order_candidate"&&!W3.q("SELECT 1 FROM lead_order_payments WHERE order_id=?",[order.id]).length,orders.map(o=>o.status));
 ok("F6 a repeated acceptance creates no second order and no second owner alert",toOwner(W3).slice(o0).filter(t=>/تأیید نهایی سفارش/.test(t)).length===1,toOwner(W3).slice(o0));
 const f=await turn(W3,u,"سفارشم رو نهایی کنید لطفاً",A("درخواست نهایی‌سازی رو به همکارم می‌سپارم؛ تأیید نهایی با مدیر فروشه.",{requests:["acceptance"]}));
 ok("F2 a customer's «finalise it» with no deposit leaves the order pending and is never told it is final",W3.q("SELECT status FROM lead_orders WHERE id=?",[order.id])[0].status==="order_candidate"&&!f.texts.some(t=>/نهایی شد|تأیید شد/.test(t)),[f.action,f.texts]);
 const c=await turn(W3,u,"بیعانه رو کارت به کارت کردم",A("ممنون، به همکارم اطلاع می‌دم بررسی کنه.",{requests:["payment"]}));
 ok("F3 a deposit claim is pending verification: no payment row, no confirmation to the customer",!W3.q("SELECT 1 FROM lead_order_payments WHERE order_id=?",[order.id]).length&&!c.texts.some(t=>/تأیید شد|دریافت شد/.test(t)),c.texts);
 const noAuthC=await W3.run(new Request("https://w.test/api/orders/transition",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:order.id,action:"confirm"})}));
 const conf=await W3.call("/api/orders/transition",{id:order.id,action:"confirm"});
 const st=W3.q("SELECT status FROM lead_orders WHERE id=?",[order.id])[0].status,aud=W3.q("SELECT COUNT(*) n FROM system_events WHERE type='lead_order_confirmed' AND details_json LIKE ?",["%"+order.id+"%"])[0].n;
 ok("F5 only the authenticated owner finalises: state moves on and an audit record is written",noAuthC.status===401&&st!=="order_candidate"&&aud>=1,[noAuthC.status,st,aud,conf.body?.ok]);
 const dep=Math.ceil(order.total_minor*50/100);
 const noAuth=await W3.run(new Request("https://w.test/api/orders/payments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({order_id:order.id,payment_kind:"deposit",method:"card_to_card",amount_minor:dep,currency:"TOMAN",reference:"X"})}));
 const pay=await W3.call("/api/orders/payments",{order_id:order.id,payment_kind:"deposit",method:"card_to_card",amount_minor:dep,currency:"TOMAN",reference:"REF-"+uid});
 ok("F4 only the authenticated owner action records a verified payment",noAuth.status===401&&W3.q("SELECT COUNT(*) n FROM lead_order_payments WHERE order_id=?",[order.id])[0].n===1,[noAuth.status,pay.body?.ok]);
 const o1=toOwner(W3).length;const upd={update_id:99100001,message:{message_id:990001,date:Math.floor(Date.now()/1000),from:{id:u.id,is_bot:false,first_name:u.name,username:u.username},chat:{id:u.id,type:"private",username:u.username,first_name:u.name},text:"واریز دوم رو هم زدم"}};
 W3.AI.script.set("واریز دوم رو هم زدم",A("ممنون، به همکارم اطلاع می‌دم.",{requests:["payment"]}));await W3.post(upd);await W3.post(upd);
 ok("F6 a duplicated webhook of a payment claim yields at most one owner alert and no payment row",toOwner(W3).slice(o1).filter(t=>/ادعای پرداخت/.test(t)).length<=1&&W3.q("SELECT COUNT(*) n FROM lead_order_payments WHERE order_id=?",[order.id])[0].n===1,toOwner(W3).slice(o1));
 const iq=await customer(W3,"iraq");await turn(W3,iq,"بكم علبة خاتم صغيرة ثلاث قطع؟ أريد 1500",A("لـ ١٥٠٠ قطعة: {{COMMERCIAL}}",{quantity:1500,requests:["price"]}));
 const oi=toOwner(W3).length;await turn(W3,iq,"تمام موافق، سجلها",A("شكراً! {{COMMERCIAL}}",{acceptance:true,requests:["acceptance"]}));
 const ior=W3.q("SELECT currency,total_minor FROM lead_orders WHERE lead_id=?",[leadOf(W3,iq)])[0],ial=toOwner(W3).slice(oi).join("\n");
 ok("F7 Iraq stays USD end to end (order and owner alert), Iran stays TOMAN; no cross-contamination",ior?.currency==="USD"&&/\$/.test(ial)&&!/تومان/.test(ial)&&order.currency==="TOMAN",[ior,ial.slice(0,200)]);}

// ---- owner alert reliability (no real Telegram): invalid group, bounded retries, ambiguous sends, Dashboard list
{const W4=await world({owner:"123456789"});const u=await customer(W4);const r=await turn(W4,u,"بیعانه رو واریز کردم",A("ممنون، بررسی می‌شه.",{requests:["payment"]}));
 const row=()=>W4.q("SELECT alert_status s,alert_attempts n FROM owner_escalation_alerts ORDER BY created_at DESC LIMIT 1")[0];
 ok("R1 an invalid owner destination sends nothing to Telegram and is recorded; the customer path is unaffected",/^destination_/.test(row()?.s)&&!W4.tg.some(x=>x.method==="sendMessage"&&String(x.body).includes("123456789"))&&!!r.outcome,[row(),r.outcome?.customer_visible]);
 for(let i=0;i<10;i++){W4.dbrun("UPDATE owner_escalation_alerts SET next_attempt_at=?",[new Date(Date.now()-1000).toISOString()]);await FQ.retryEscalationAlerts(W4.env,{limit:5});}
 ok("R2 destination retries are bounded and then parked (destination_failed_final), never an endless loop",row()?.s==="destination_failed_final"&&row()?.n<=6,row());
 const list=await W4.call("/api/owner-alerts",null,"GET"),un=await W4.run(new Request("https://w.test/api/owner-alerts"));
 ok("R3 undelivered alerts stay visible to the owner on the Dashboard list (owner-only)",list.body?.summary?.not_delivered>=1&&un.status===401,[list.body?.summary,un.status]);
 ok("R4 a failed alert approved nothing (no payment recorded, nothing confirmed)",!W4.q("SELECT 1 FROM lead_order_payments").length,null);}
{const W5=await world();const u=await customer(W5);W5.TG.mode="ok";
 const inner=globalThis.fetch;globalThis.fetch=async(url,o={})=>{if(/sendMessage/.test(String(url?.url||url))&&String(o.body||"").includes(OWNER)){inner(url,o);throw new TypeError("network cut after send (test)");}return inner(url,o);};
 await turn(W5,u,"بیعانه رو واریز کردم",A("ممنون، بررسی می‌شه.",{requests:["payment"]}));globalThis.fetch=inner;
 const a=W5.q("SELECT alert_status s FROM owner_escalation_alerts ORDER BY created_at DESC LIMIT 1")[0];
 const sends=()=>W5.tg.filter(x=>x.method==="sendMessage"&&String(x.body).includes(OWNER)).length,n0=sends();
 for(let i=0;i<3;i++){W5.dbrun("UPDATE owner_escalation_alerts SET next_attempt_at=?",[new Date(Date.now()-1000).toISOString()]);await FQ.retryEscalationAlerts(W5.env,{limit:5});}
 ok("R5 an ambiguous send (network cut, maybe accepted) is outcome_unknown and NEVER resent blindly",a?.s==="outcome_unknown"&&sends()===n0,[a,n0,sends()]);
 W5.dbrun("INSERT INTO owner_escalation_alerts(escalation_id,lead_id,reason_code,alert_status,alert_attempts,created_at,updated_at) VALUES('payment:stale',?,'payment_claim','sending',1,?,?)",[leadOf(W5,u),"2026-11-01T00:00:00.000Z","2026-11-01T00:00:00.000Z"]);
 await FQ.retryEscalationAlerts(W5.env,{limit:5});
 ok("R6 a send that never finished (stuck in «sending») becomes outcome_unknown for the owner, not a resend",W5.q("SELECT alert_status s FROM owner_escalation_alerts WHERE escalation_id='payment:stale'")[0].s==="outcome_unknown"&&sends()===n0,null);}
process.exit(done()?1:0);
