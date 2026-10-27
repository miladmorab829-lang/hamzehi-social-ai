// PHASE 16.3 — reliability, follow-up and sales safety (local): A follow-up idempotency under repeated / concurrent runs and no
// payment request without owner-approved terms, B realistic Sales-AI routing combinations (existing order + new product / status /
// several intents, unclear product, Iraqi city prefixes, mixed Iran–Iraq cities), C financial and market safeguards (TOMAN / USD,
// no inferred price, conversion, discount, deposit, cancellation or modification from a chat).
// Local only: Telegram and OpenAI are in-process mocks; nothing reaches Production, a customer or a paid API.
import {makeWorld,reporter} from "./harness.mjs";
const {ok,J,done}=reporter("phase16_3");
const started=Date.now(),iso=ms=>new Date(ms).toISOString(),t0=()=>iso(Date.now()),daysAgo=n=>iso(Date.now()-n*86400000);
const W=await makeWorld({extraEnv:{OPENAI_API_KEY:"test-openai-not-real"}});const {q,dbrun,call,send,setMarket}=W;
await call("/api/quotes",null,"GET");await call("/api/orders",null,"GET");
const prompts=[];const inner=globalThis.fetch;
globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);
  if(s==="https://api.openai.com/v1/responses"){const inp=JSON.parse(o.body||"{}").input;if(typeof inp==="string"&&/B2B follow-up/.test(inp))prompts.push(inp);
    return new Response(JSON.stringify({output_text:"پیش‌نویس آزمایشی",output:[{type:"message",content:[{type:"output_text",text:"پیش‌نویس آزمایشی"}]}]}),{status:200,headers:{"Content-Type":"application/json"}});}
  return inner(u,o);};
let uid=716360000;const user=p=>({id:++uid,name:p,username:p+uid});
const convOf=u=>q("SELECT lead_id,conversation_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(u.id)])[0];
const mkOrder=(id,lead,conv,status,{market="IRAN",currency="TOMAN",total=1000000,at=t0()}={})=>dbrun("INSERT INTO lead_orders(id,order_number,quote_id,lead_id,conversation_id,market,product,quantity,currency,unit_price_minor,subtotal_minor,total_minor,status,confirmed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,"HB-"+id,"Q-"+id,lead,conv,market,"نیم ست کوچک 3 تکه",10,currency,total/10,total,total,status,at,at,at]);
const pay=(id,order,lead,amount,{kind="deposit",currency="TOMAN",at=t0()}={})=>dbrun("INSERT INTO lead_order_payments(id,order_id,lead_id,payment_kind,amount_minor,currency,method,reference,reference_key,received_at,notes,recorded_by,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,order,lead,kind,amount,currency,"bank_transfer",id,id,at,null,"authenticated_owner",at]);
const sent=()=>W.tg.filter(x=>/^send/.test(x.method));
const textOf=x=>{try{const b=JSON.parse(x.body);return String(b.text||b.caption||"");}catch{return "";}};
const mem=(u,key)=>{const c=convOf(u);const r=q("SELECT value_json FROM conversation_memory_facts WHERE lead_id=? AND memory_key=? AND status='active' ORDER BY created_at DESC LIMIT 1",[c.lead_id,key])[0];return r?JSON.parse(r.value_json):null;};
const mkt=r=>r.brain?.knowledge_market?.conversation_market||null;
const newConv=async(lang,country)=>{const u=user(lang);await send(u,lang==="fa"?"سلام":"هلا");if(country)setMarket(u,country);return {u,...convOf(u)};};
const withOrder=async(status,{lang="fa"}={})=>{const c=await newConv(lang,lang==="fa"?"iran":"iraq");
  mkOrder("O-"+c.u.id,c.lead_id,c.conversation_id,status,lang==="fa"?{}:{market:"ARAB",currency:"USD",total:26500});return c;};
// what reached the customer for one message (sent replies only)
const say=async(u,msg)=>{const s0=sent().length,r=await send(u,msg);return {...r,out:sent().slice(s0).map(textOf)};};
const MONEY=/[0-9٠-٩۰-۹]{2,}|USD|\$|تومان|دولار|دينار/;

// ================= A. follow-up idempotency and terms =================
{const a=await newConv("ar","iraq"),b=await newConv("fa","iran"),c=await newConv("ar","iraq");
 mkOrder("FA-BAL",a.lead_id,a.conversation_id,"partially_paid",{market:"ARAB",currency:"USD",total:26500,at:daysAgo(10)});pay("FAP-1","FA-BAL",a.lead_id,10000,{currency:"USD",at:daysAgo(5)});
 mkOrder("FA-REO",b.lead_id,b.conversation_id,"fulfilled",{at:daysAgo(40)});
 mkOrder("FA-UNP",c.lead_id,c.conversation_id,"confirmed",{market:"ARAB",currency:"USD",total:26500,at:daysAgo(5)});
 const convs=[a,b,c].map(x=>x.conversation_id),rows=()=>q(`SELECT id,conversation_id,language,message FROM lead_outreach WHERE conversation_id IN (?,?,?) AND status='draft'`,convs);
 const tg0=W.tg.length,runs=await Promise.all([1,2,3].map(()=>call("/api/revenue/followups/run",{})));
 const after1=rows();
 ok("A1 three CONCURRENT revenue follow-up runs create at most one draft per record (no duplicate)",runs.every(r=>r.status===200)&&after1.filter(x=>x.conversation_id===a.conversation_id).length===1&&after1.filter(x=>x.conversation_id===b.conversation_id).length===1,[after1.map(x=>[x.conversation_id.slice(-6),x.message.slice(0,30)]),runs.map(r=>r.body?.drafts_created)]);
 const again=await call("/api/revenue/followups/run",{});
 ok("A2 a repeated run reports already-prepared and adds nothing",rows().length===after1.length&&Number(again.body?.drafts_created||0)===0&&Number(again.body?.already_prepared||0)>=2,again.body);
 ok("A3 language follows the market: ARAB balance in Iraqi Arabic, IRAN reorder in Persian",after1.some(x=>x.conversation_id===a.conversation_id&&x.language==="Iraqi Arabic"&&/USD/.test(x.message))&&after1.some(x=>x.conversation_id===b.conversation_id&&x.language==="Persian"&&!/[A-Za-z]/.test(x.message)),after1.map(x=>[x.language,x.message.slice(0,40)]));
 ok("A4 no payment request is drafted for an unpaid order when no owner-approved payment terms exist (owner decision instead)",!after1.some(x=>x.conversation_id===c.conversation_id)&&Number(runs[0].body?.owner_decisions||0)+Number(runs[1].body?.owner_decisions||0)+Number(runs[2].body?.owner_decisions||0)+Number(again.body?.owner_decisions||0)>=1,[runs.map(r=>r.body),again.body]);
 ok("A5 follow-up runs never send anything",W.tg.length===tg0,W.tg.slice(tg0).map(x=>x.method));
 // CRM follow-ups: scheduled tick and owner button at the same time → one draft, never sent
 const addLead=(id,stage,n,at)=>dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",[id,id,"https://"+id.toLowerCase()+".test",stage,"normal",JSON.stringify(n),at,at]);
 addLead("FU3-A","contacted",{source:"manual",market:"ARAB",negotiation_draft:"x",next_followup_at:daysAgo(1)},daysAgo(20));
 const WK=(await import("../../worker/src/index.js")).default,p=[];
 const p0=prompts.length,tg1=W.tg.length;
 await Promise.all([WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},W.env,{waitUntil:x=>p.push(x)}),call("/api/ads/followups/run",{}),call("/api/ads/followups/run",{})]);await Promise.allSettled(p);
 const n=JSON.parse(q("SELECT notes FROM leads WHERE id='FU3-A'")[0].notes);
 ok("A6 concurrent scheduled + manual CRM follow-up runs leave ONE draft and use at most one provider call for the lead",!!n.followup_draft&&prompts.slice(p0).filter(x=>/FU3-A/.test(x)).length<=1,[prompts.length-p0,n.followup_status]);
 ok("A7 the CRM follow-up stays a draft: the lead stage is unchanged and nothing is sent",q("SELECT stage FROM leads WHERE id='FU3-A'")[0].stage==="contacted"&&W.tg.length===tg1);
 const resetRuns=()=>dbrun("DELETE FROM system_events WHERE type IN ('crm_followup_reserved','crm_followup_deferred')"),notes=()=>JSON.parse(q("SELECT notes FROM leads WHERE id='FU3-A'")[0].notes);
 const first=notes().followup_draft,same=await call("/api/leads",{id:"FU3-A",next_followup_at:notes().followup_at},"PATCH");
 ok("A8 re-saving the already drafted follow-up date keeps the draft (no reset, no re-draft)",same.status===200&&notes().followup_draft===first&&!notes().followup_history,notes());
 const due=daysAgo(0.01);await call("/api/leads",{id:"FU3-A",next_followup_at:due},"PATCH");
 ok("A9 the owner scheduling a NEW follow-up date archives the previous draft",!notes().followup_draft&&notes().followup_history?.[0]?.draft===first&&notes().next_followup_at===due,notes());
 resetRuns();const p1=prompts.length;await call("/api/ads/followups/run",{});
 ok("A10 the next run drafts the new follow-up once (before 16.3 it was skipped forever)",!!notes().followup_draft&&prompts.length-p1===1,[prompts.length-p1,notes().followup_status]);
 resetRuns();const p2=prompts.length;await call("/api/ads/followups/run",{});
 ok("A11 a further run does not draft it again",prompts.length===p2&&notes().followup_history.length===1);}

// ================= B. Sales-AI routing combinations =================
dbrun("INSERT INTO commercial_price_items(id,product_key,product_name,sku,market,currency,unit_price_minor,moq,version,active,effective_from,effective_until,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",["PI3-1","ring box","علبة خاتم",null,"ARAB","USD",250,50,1,1,null,null,"owner",t0(),t0(),t0()]);
{const m1=await withOrder("confirmed",{lang:"ar"}),r1=await say(m1.u,"طلبي وصل؟ وكم سعر علب العطور؟");
 ok("B1 Iraqi status + new product price in one message → held for the owner (both intents kept)",!!r1.brain?.order_status_also_asked&&r1.draft?.status!=="sent",[r1.action,r1.draft?.status,r1.outcome?.reason]);
 const m2=await withOrder("paid"),r2=await say(m2.u,"سلام، جعبه ساعت دارید؟ سفارش قبلی‌مون هم رسید ممنون");
 ok("B2 thanks for a delivered order + a new product question → sales path, no order status reply",r2.action!=="order_status"&&!r2.out.some(t=>/HB-O-/.test(t)),[r2.action,r2.out]);
 const m3=await withOrder("shipped",{lang:"ar"}),r3=await say(m3.u,"وين وصلت الشحنة؟");
 ok("B3 «وين وصلت الشحنة؟» on a shipped order → order status or held, never a sales reply",r3.action==="order_status"||r3.draft?.status!=="sent",[r3.action,r3.draft?.status,r3.out]);
 const m4=await newConv("ar","iraq"),r4=await say(m4.u,"أريد علب");
 ok("B4 an unclear product («أريد علب») asks for details, no price or quote is sent",!/^(quote|answer_price)$/.test(String(r4.action))&&r4.out.every(t=>!MONEY.test(t)),[r4.action,r4.out]);
 const m5=await newConv("ar"),r5=await say(m5.u,"أريد التوصيل لكربلاء");
 ok("B5 «لكربلاء» → destination كربلاء, ARAB market",mem(m5.u,"destination")==="كربلاء"&&mkt(r5)==="ARAB",[mem(m5.u,"destination"),mkt(r5)]);
 const m6=await newConv("ar"),r6=await say(m6.u,"وبالنجف عدنا فرع، التوصيل للنجف");
 ok("B6 «وبالنجف … للنجف» → destination النجف, ARAB",mem(m6.u,"destination")==="النجف"&&mkt(r6)==="ARAB",[mem(m6.u,"destination"),mkt(r6)]);
 for(const [lang,msg] of [["ar","عندي محل ببغداد وفرع بطهران، التوصيل للاثنين"],["fa","ارسال به مشهد و بصره"],["ar","ship to Erbil and Shiraz"],["fa","یه سری برای تهران میخوام یه سری برای بغداد"]]){
  const m=await newConv(lang),r=await say(m.u,msg);
  ok(`B7 mixed Iran + Iraq places «${msg}» → market undecided, no destination guessed`,mkt(r)!=="ARAB"&&mkt(r)!=="IRAN",[mkt(r),mem(m.u,"destination"),r.action]);}
 for(const [msg,city] of [["أريد التوصيل لبغداد بسرعة","بغداد"],["التوصيل للبصرة بليز","البصرة"]]){const m=await newConv("ar"),r=await say(m.u,msg);
  ok(`B9 a single Iraqi city with ordinary «ب/ل» words around it «${msg}» stays ${city} (no false mixed-market)`,mem(m.u,"destination")===city&&mkt(r)==="ARAB",[mem(m.u,"destination"),mkt(r)]);}
 const mt=await newConv("ar"),rt=await say(mt.u,"التوصيل لطهران");
 ok("B10 «لطهران» alone is never taken as an Iraqi (ARAB) destination",mkt(rt)!=="ARAB",[mkt(rt),mem(mt.u,"destination")]);
 const m8=await newConv("ar","iraq"),r8=await say(m8.u,"بكم علبة الخاتم؟ أريد 100 وشكد التوصيل لكربلاء؟");
 ok("B8 several intents (price + quantity + delivery) → only the approved USD price, never TOMAN or a shipping price",r8.out.every(t=>!/تومان|TOMAN/.test(t))&&r8.out.every(t=>(t.match(/[0-9]+(?:\.[0-9]+)?/g)||[]).every(n=>["2.50","250.00","100","250"].includes(n))),[r8.action,r8.out]);}

// ================= C. financial and market safeguards =================
{const i1=await newConv("fa","iran"),c1=await say(i1.u,"قیمت جعبه انگشتری برای ۱۰۰ عدد چنده؟");
 ok("C1 IRAN customer + a product priced only for ARAB (USD) → no USD price, no converted TOMAN price",c1.out.every(t=>!/USD|\$|2\.50|250|تومان/.test(t)),[c1.action,c1.out]);
 const i2=await newConv("ar","iraq"),c2=await say(i2.u,"ممكن خصم 20% إذا أخذت 1000؟");
 ok("C2 a discount request is never granted by the AI (no discount figure sent)",c2.out.every(t=>!/خصم\s*[0-9٠-٩]|[0-9٠-٩]+\s*%|تخفيض/.test(t)||/20%|1000/.test(t)&&!/نعم|اكيد|أكيد|تمام/.test(t)),[c2.action,c2.out]);
 const i3=await newConv("ar","iraq"),c3=await say(i3.u,"شكد العربون؟ وشلون أحول؟");
 ok("C3 a deposit / transfer question with no approved terms → no deposit amount, percent or account sent",c3.out.every(t=>!/[0-9٠-٩]|IBAN|حساب\s*رقم/.test(t)),[c3.action,c3.out]);
 const o4=await withOrder("confirmed",{lang:"ar"}),before=J(q("SELECT status,quantity,total_minor,currency FROM lead_orders WHERE id=?",["O-"+o4.u.id])),c4=await say(o4.u,"الغي الطلب");await say(o4.u,"غير الكمية الى 500 وخلي السعر 2 دولار");
 ok("C4 a chat «cancel» / «change quantity and price» never changes the order",J(q("SELECT status,quantity,total_minor,currency FROM lead_orders WHERE id=?",["O-"+o4.u.id]))===before,[before,c4.action]);
 ok("C5 no order was cancelled, confirmed or re-priced by any customer message in this suite",!q("SELECT 1 FROM lead_orders WHERE (status='cancelled' OR confirmed_by IS NOT NULL) AND id LIKE 'O-%'").length);
 const all=W.tg.filter(x=>/^send/.test(x.method));
 ok("C6 every Telegram send went only to a test customer's own private chat",all.every(x=>{try{const n=Number(JSON.parse(x.body).chat_id);return n>716360000&&n<716370000;}catch{return false;}}));
 ok("C7 no request left the machine except the in-process mocks",!W.offNet().filter(s=>!/api\.openai\.com/.test(s)).length,W.offNet());}
console.log(`phase16_3 time ${((Date.now()-started)/1000).toFixed(1)} s`);
process.exit(done()?1:0);
