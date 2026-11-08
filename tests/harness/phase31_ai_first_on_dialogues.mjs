// PHASE 31 — AI-FIRST ON: full-path verification of real conversations (owner 2026-11-09). Telegram message → customer memory →
// Claude (provider anthropic, model claude-opus-5-5, mocked endpoint: no paid call) → validated answer → the exact text Telegram
// receives. Persian and Iraqi Arabic dialogues with advice, comparison, choice, negation, correction and memory follow-ups; plus
// opt-out, isolation and a money sentence inside an otherwise good answer. Local only.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase31_ai_first_on_dialogues");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const ORCH=fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8");
const MIG=fs.readFileSync(path.join(REPO,"owner-actions/phase25-delete-system/01-migration.sql"),"utf8");
const SA=await import(pathToFileURL(path.join(REPO,"worker/src/sales-ai-brain.js")).href);
const T="2026-10-01T00:00:00.000Z";
const L=`INSERT INTO commercial_price_items(id,product_key,product_name,sku,market,currency,unit_price_minor,moq,version,active,effective_from,effective_until,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
const W=await makeWorld({aiBrain:"on",extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on"}});W.d1.db.exec(ORCH);
for(const p of ["/api/quotes","/api/si/knowledge/product","/api/owner-escalations","/api/leads/outreach","/api/content/pipeline"])await W.call(p,null,"GET");W.d1.db.exec(MIG);
W.dbrun(L,["R1","k1","انگشتر کوچک · 5x5 · 3 تکه",null,"IRAN","TOMAN",66000,null,1,1,null,null,"admin",T,T,T]);
W.dbrun(L,["A1","a1","علبة خاتم صغيرة · 5x5x4 · ثلاث قطع",null,"ARAB","USD",60,null,1,1,null,null,"admin",T,T,T]);
let n=0;for(const c of ["مشکی سلفون","طلایی سلفون","سرمه‌ای سلفون"])await W.teach(`COLOR | ${c} | IRAN`,"IRAN","f"+(++n));for(const c of ["أسود","ذهبي","كحلي"])await W.teach(`COLOR | ${c} | ARAB`,"ARAB","a"+(++n));
const on=await W.call("/api/sales-ai-first",{mode:"on"},"POST");SA.resetSalesAiCooldown();
let uid=761000000;const customer=async(mk,first)=>{const u={id:++uid,name:"C",username:"c"+uid};await W.send(u,first);W.setMarket(u,mk);return u;};
const leadOf=u=>W.q("SELECT lead_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(u.id)])[0]?.lead_id;
const out=u=>W.tg.filter(x=>x.method==="sendMessage"&&(String(x.body).includes(`"chat_id":"${u.id}"`)||String(x.body).includes(`"chat_id":${u.id}`))).map(x=>JSON.parse(x.body).text);
const mem=(u,k)=>{const r=W.q("SELECT value_json FROM conversation_memory_facts WHERE lead_id=? AND memory_key=? AND status='active' ORDER BY created_at DESC LIMIT 1",[leadOf(u),k])[0];return r?JSON.parse(r.value_json):undefined;};
// (like the real schema: an interpretation is always present; the default reading is "other")
const INTERP=p=>({primary_intent:p||"other",product_key:null,reference:"none",requested_size:null,requested_color:[],requested_structure:null,requested_printing:null,quantity:null,ambiguity:"none",confidence:"high"});
const A=(reply,o={})=>({requests:o.requests||[],reply,reply_colors:o.colorsSaid||[],interpretation:INTERP(o.intent),facts:{colors:o.colors||[],color_parts:[],unknown_colors:[],color_statement:o.st||"none",negated_colors:o.neg||[]}});
const turns=[];
// one customer turn: Claude sees ctx; returns the reply; record whether exactly Claude's text reached Telegram
const say=async(u,msg,reply,o={})=>{let ctx=null;W.AI.script.set(msg,c=>{ctx=c;return A(reply,o);});const k=W.AI.requests.length,b=out(u).length;
  const r=await W.send(u,msg);const req=W.AI.requests.slice(k).find(x=>x.body?.messages);const sent=out(u).slice(b);
  const t={msg,r,ctx,sent,model:req?.body?.model||null,exact:sent.length===1&&sent[0]===reply,src:r.brain?.ai_brain?.reply_source,vis:r.outcome?.customer_visible,reason:r.outcome?.reason,act:r.action};turns.push(t);return t;};

ok("O0 AI-first switched ON through the owner route",on.body?.setting?.mode==="on",on.body);

// ---- Persian dialogue
{const u=await customer("iran","سلام");
 const t1=await say(u,"برای جعبه انگشتر نامزدی چی پیشنهاد می‌کنی؟","برای نامزدی، انگشتر کوچک سه‌تکه با مشکی سلفون حس رسمی و لوکسی می‌ده؛ اگه حال‌وهوای گرم‌تری بخواید طلایی سلفون هم عالیه. چند عدد لازم دارید؟",{requests:["product_info","color_recommendation"],colorsSaid:["مشکی سلفون","طلایی سلفون"]});
 ok("FA1 advice: Claude (anthropic / claude-opus-5-5) was called and EXACTLY its reply reached Telegram",t1.model==="claude-opus-5-5"&&t1.exact&&/^ai/.test(t1.src),[t1.model,t1.src,t1.vis,t1.sent]);
 ok("FA1 Claude's own recommendation is not stored as a choice",mem(u,"selected_colors")===undefined);
 const t2=await say(u,"مشکی سلفون بهتره یا سرمه‌ای سلفون؟","مشکی سلفون کلاسیک‌تر و رسمی‌تره، سرمه‌ای سلفون آرام‌تر و خاص‌تر. سلیقه‌تون بیشتر به کدوم نزدیکه؟",{st:"comparison",colorsSaid:["مشکی سلفون","سرمه‌ای سلفون"]});
 ok("FA2 comparison: Claude's answer sent exactly; nothing stored",t2.exact&&mem(u,"selected_colors")===undefined,[t2.src,t2.vis,t2.reason]);
 const t3=await say(u,"پس مشکی سلفون و طلایی سلفون رو انتخاب می‌کنم","عالیه، مشکی سلفون و طلایی سلفون انتخاب شما شد. چند عدد لازم دارید؟",{st:"choice",colors:["مشکی سلفون","طلایی سلفون"],colorsSaid:["مشکی سلفون","طلایی سلفون"]});
 ok("FA3 explicit choice stored and Claude's confirmation sent",t3.exact&&JSON.stringify(mem(u,"selected_colors"))===JSON.stringify(["مشکی سلفون","طلایی سلفون"]),[mem(u,"selected_colors"),t3.vis,t3.reason]);
 const t4=await say(u,"نه، طلایی نمی‌خوام، سرمه‌ای سلفون بذار","حتماً، طلایی سلفون رو برداشتم و سرمه‌ای سلفون گذاشتم؛ پس مشکی سلفون و سرمه‌ای سلفون.",{st:"correction",colors:["مشکی سلفون","سرمه‌ای سلفون"],neg:["طلایی سلفون"],colorsSaid:["طلایی سلفون","سرمه‌ای سلفون","مشکی سلفون"]});
 const s4=mem(u,"selected_colors")||[];
 ok("FA4 negation + correction: طلایی removed, سرمه‌ای added, Claude's reply sent",t4.exact&&s4.includes("مشکی سلفون")&&s4.includes("سرمه‌ای سلفون")&&!s4.includes("طلایی سلفون"),[s4,t4.vis,t4.reason]);
 const t5=await say(u,"رنگ‌هایی که انتخاب کردم یادت هست؟","بله، مشکی سلفون و سرمه‌ای سلفون رو انتخاب کردید.",{colorsSaid:["مشکی سلفون","سرمه‌ای سلفون"]});
 const ch=t5.ctx?.colors?.chosen||[];
 ok("FA5 memory follow-up: Claude receives the corrected choice from D1 (no stale colour) and its answer is sent",t5.exact&&ch.includes("سرمه‌ای سلفون")&&!ch.includes("طلایی سلفون"),[ch,t5.vis]);
 const t6=await say(u,"فعلاً قصد سفارش ندارم، فقط نظرت رو بگو این ترکیب برای هدیه خوبه؟","برای هدیه، مشکی سلفون با سرمه‌ای سلفون ترکیب شیک و آرامیه و حس باکلاسی می‌ده.",{colorsSaid:["مشکی سلفون","سرمه‌ای سلفون"]});
 ok("FA6 «سفارش» in a non-ordering message: Claude's answer sent (no commercial_owner, no reset hold, no canned text)",t6.exact&&t6.act!=="commercial_owner"&&t6.reason!=="reset_financial_owner",[t6.act,t6.vis,t6.reason]);
 const t7=await say(u,"ارزون‌ترین حالتش چقدر درمیاد؟","این ترکیب خیلی محبوبه. قیمتش ۴۰ هزار تومنه.",{requests:["price"]});
 ok("FA7 a price Claude invents never reaches Telegram (engine figures only)",!t7.sent.some(x=>/۴۰ هزار|40000|40 هزار/.test(x)),t7.sent);}

// ---- Iraqi Arabic dialogue
{const v=await customer("iraq","هلا");
 const a1=await say(v,"شنو تنصحني لعلبة خاتم خطوبة؟","للخطوبة أنصحك بعلبة خاتم صغيرة ثلاث قطع، والأسود ويا الذهبي يطلعون فخمين. شكد تحتاج؟",{requests:["product_info","color_recommendation"],colorsSaid:["أسود","ذهبي"]});
 ok("AR1 Iraqi advice: exactly Claude's reply sent",a1.exact&&/^ai/.test(a1.src),[a1.src,a1.vis,a1.reason,a1.sent]);
 const a2=await say(v,"الأسود أحسن لو الذهبي؟","الأسود رسمي وكلاسيكي، والذهبي يعطي فخامة ولمعة. على ذوقك شنو تحب أكثر؟",{st:"comparison",colorsSaid:["أسود","ذهبي"]});
 ok("AR2 Iraqi comparison: sent, nothing stored",a2.exact&&mem(v,"selected_colors")===undefined,[a2.vis,a2.reason,mem(v,"selected_colors")]);
 const a3=await say(v,"خلي الأسود","تمام، الأسود.",{st:"choice",colors:["أسود"],colorsSaid:["أسود"]});
 ok("AR3 Iraqi choice stored",a3.exact&&JSON.stringify(mem(v,"selected_colors"))===JSON.stringify(["أسود"]),[mem(v,"selected_colors"),a3.vis,a3.reason]);
 const a4=await say(v,"لا ما أريد الأسود، خليها ذهبي","ماشي، شلت الأسود وخليتها ذهبي.",{st:"correction",colors:["ذهبي"],neg:["أسود"],colorsSaid:["أسود","ذهبي"]});
 ok("AR4 Iraqi negation + correction: only ذهبي remains",a4.exact&&JSON.stringify(mem(v,"selected_colors"))===JSON.stringify(["ذهبي"]),[mem(v,"selected_colors"),a4.vis,a4.reason]);
 const a5=await say(v,"شنو اللون اللي اخترته؟","اخترت الذهبي.",{colorsSaid:["ذهبي"]});
 ok("AR5 Iraqi memory follow-up: Claude gets ذهبي (not أسود) and its reply is sent",a5.exact&&JSON.stringify(a5.ctx?.colors?.chosen)===JSON.stringify(["ذهبي"]),[a5.ctx?.colors?.chosen,a5.vis]);
 ok("ISO the Iraqi customer's Claude context carries none of the Persian customer's facts",!JSON.stringify(a5.ctx).includes("سرمه‌ای"),null);}

// ---- replies with catalog digits («3 تکه», «5x5»): a normal customer and a customer after an archive reset (like the owner's test lead)
{const u=await customer("iran","سلام");
 const d1=await say(u,"اندازه و مدلش چطوریه؟","انگشتر کوچک 3 تکه با سایز 5x5 ساخته می‌شه و برای انگشتر تکی عالیه.",{requests:["size","product_info"]});
 ok("DG1 Claude's reply with catalog digits (3 تکه, 5x5) is sent exactly",d1.exact,[d1.src,d1.vis,d1.reason,d1.r.brain?.ai_brain?.fallback,JSON.stringify(d1.r.brain?.ai_brain?.validator_rejection)]);
 const conv0=W.q("SELECT conversation_id c FROM inbox_messages WHERE lead_id=? LIMIT 1",[leadOf(u)])[0].c;
 W.dbrun("UPDATE inbox_messages SET created_at=? WHERE lead_id=?",[new Date(Date.now()-30*86400000).toISOString(),leadOf(u)]);
 const rq=(p,bd)=>W.run(new Request("https://w.test"+p,{method:"POST",headers:{Authorization:"Bearer tok","Content-Type":"application/json"},body:JSON.stringify(bd)})).then(r=>r.json());
 const pv=await rq("/api/cleanup/preview",{action:"trash",scope:"ids",section:"context",ids:[conv0]});if(pv.token)await rq("/api/cleanup/execute",{token:pv.token,confirm:pv.confirm_phrase||undefined});
 const d2=await say(u,"برای جعبه انگشتر کوچک چه رنگی پیشنهاد می‌کنی؟ فعلاً قصد سفارش ندارم","برای انگشتر کوچک 3 تکه با سایز 5x5، مشکی سلفون رسمی و طلایی سلفون گرم‌تره.",{requests:["color_recommendation"],colorsSaid:["مشکی سلفون","طلایی سلفون"]});
 ok("DG2 after an archive reset (owner's test-lead situation) the same kind of answer is still sent exactly",d2.r.brain?.context_reset===true&&d2.exact,[d2.r.brain?.context_reset,d2.src,d2.vis,d2.reason,d2.act]);}

// DG3 after the reset a larger figure (≥100) in Claude's reply is still held (no stale or invented amount slips through)
{const u=W.q("SELECT provider_sender_id s FROM inbox_messages ORDER BY created_at DESC LIMIT 1")[0];}
{const last=turns[turns.length-1];const u={id:Number(W.q("SELECT provider_sender_id s FROM inbox_messages WHERE id=?",[last.r.row.id])[0].s),name:"C",username:"c"};
 const d3=await say(u,"برای هدیه شرکتی چی خوبه؟","برای هدیه شرکتی معمولاً 500 عدد انگشتر کوچک 3 تکه سفارش می‌دن.",{requests:["product_info"]});
 ok("DG3 after a reset a figure of 100+ in Claude's reply is not sent automatically",!d3.sent.some(x=>/500/.test(x)),[d3.vis,d3.reason,d3.sent]);}

// DG4 after the reset, small numbers the customer typed cannot carry a discount, deposit or quantity commitment
{const last=turns[turns.length-1];const u={id:Number(W.q("SELECT provider_sender_id s FROM inbox_messages WHERE id=?",[last.r.row.id])[0].s),name:"C",username:"c"};
 const e1=await say(u,"می‌شه 10 درصد تخفیف بدید؟","حتماً، 10 درصد تخفیف براتون اعمال می‌کنم.",{requests:["discount"]});
 ok("DG4a an echoed «10 درصد تخفیف» is never sent",!e1.sent.some(x=>/10s*درصد|۱۰s*درصد/.test(x)),[e1.vis,e1.reason,e1.sent]);
 const e2=await say(u,"50 درصد پیش‌پرداخت بدم کافیه؟","بله، 50 درصد پیش‌پرداخت کافیه.",{requests:["payment"]});
 ok("DG4b an echoed «50 درصد پیش‌پرداخت» is never sent",!e2.sent.some(x=>/50s*درصد|۵۰s*درصد/.test(x)),[e2.vis,e2.reason,e2.sent]);
 const e3=await say(u,"30 عدد می‌خوام","حتماً، 30 عدد براتون ثبت کردم.",{requests:["provide_details"]});
 ok("DG4c an echoed quantity commitment «30 عدد … ثبت کردم» is never sent",!e3.sent.some(x=>/ثبت کردم/.test(x)),[e3.vis,e3.reason,e3.sent]);}

// ---- opt-out stays absolute in ON mode
{const u=await customer("iran","سلام");await W.send(u,"لطفاً دیگه پیام ندید");const t=await say(u,"سلام دوباره","سلام! در خدمتم.",{requests:["greeting"]});
 ok("OPT after opt-out even a valid Claude answer is not sent",t.sent.length===0&&t.vis!=="reply",[t.vis,t.reason]);}

// ---- delivery rate over the ordinary conversational turns of this file
{const conv=turns.filter(t=>!/^(FA7|OPT)/.test(t.msg)&&t.msg!=="ارزون‌ترین حالتش چقدر درمیاد؟"&&t.msg!=="سلام دوباره"&&!["برای هدیه شرکتی چی خوبه؟","می‌شه 10 درصد تخفیف بدید؟","50 درصد پیش‌پرداخت بدم کافیه؟","30 عدد می‌خوام"].includes(t.msg)),hit=conv.filter(t=>t.exact&&/^ai/.test(t.src)).length;
 ok(`Q exact Claude replies delivered on ordinary turns: ${hit}/${conv.length}`,hit===conv.length,conv.filter(t=>!(t.exact&&/^ai/.test(t.src))).map(t=>({m:t.msg.slice(0,30),src:t.src,vis:t.vis,reason:t.reason,act:t.act})));}
console.log("Q-DENOMINATOR",turns.length);process.exit(done()?1:0);
