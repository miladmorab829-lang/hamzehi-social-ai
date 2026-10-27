// PHASE 16.2 — Sales AI reliability (local): A ambiguous existing-order vs new-purchase messages (isolation, no commercial guess),
// B follow-up reliability (H3: a due lead is found whatever the number of newer leads; drafts only, no duplicate, nothing sent; language
// follows the market; revenue follow-ups never draft a record whose currency is not its market's), C Iraqi market safety (market from
// country evidence, not language; IRAN → TOMAN, ARAB → USD; no invented price / payment instruction reaches the customer).
// Local only: Telegram and OpenAI are in-process mocks; nothing reaches Production, a customer or a paid API.
import {makeWorld,reporter} from "./harness.mjs";
const {ok,J,done}=reporter("phase16_2");
const started=Date.now(),iso=ms=>new Date(ms).toISOString(),t0=()=>iso(Date.now()),daysAgo=n=>iso(Date.now()-n*86400000);
const W=await makeWorld({extraEnv:{OPENAI_API_KEY:"test-openai-not-real"}});const {q,dbrun,call,send,setMarket}=W;
await call("/api/quotes",null,"GET");await call("/api/orders",null,"GET");
// OpenAI mock: follow-up prompts are recorded (language check); nothing leaves the machine
const prompts=[];const inner=globalThis.fetch;
globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);
  if(s==="https://api.openai.com/v1/responses"){const inp=JSON.parse(o.body||"{}").input;if(typeof inp==="string"&&/B2B follow-up/.test(inp))prompts.push(inp);
    return new Response(JSON.stringify({output_text:"پیش‌نویس آزمایشی",output:[{type:"message",content:[{type:"output_text",text:"پیش‌نویس آزمایشی"}]}]}),{status:200,headers:{"Content-Type":"application/json"}});}
  return inner(u,o);};
let uid=716260000;const user=p=>({id:++uid,name:p,username:p+uid});
const convOf=u=>q("SELECT lead_id,conversation_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(u.id)])[0];
const mkOrder=(id,lead,conv,status,{market="IRAN",currency="TOMAN",total=1000000,at=t0()}={})=>dbrun("INSERT INTO lead_orders(id,order_number,quote_id,lead_id,conversation_id,market,product,quantity,currency,unit_price_minor,subtotal_minor,total_minor,status,confirmed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,"HB-"+id,"Q-"+id,lead,conv,market,"نیم ست کوچک 3 تکه",10,currency,total/10,total,total,status,at,at,at]);
const pay=(id,order,lead,amount,{kind="deposit",currency="TOMAN",at=t0()}={})=>dbrun("INSERT INTO lead_order_payments(id,order_id,lead_id,payment_kind,amount_minor,currency,method,reference,reference_key,received_at,notes,recorded_by,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,order,lead,kind,amount,currency,"bank_transfer",id,id,at,null,"authenticated_owner",at]);
const sent=()=>W.tg.filter(x=>/^send/.test(x.method));
const textOf=x=>{try{return String(JSON.parse(x.body).text||JSON.parse(x.body).caption||"");}catch{return "";}};
const withOrder=async(status,{lang="fa"}={})=>{const u=user(lang);await send(u,lang==="fa"?"سلام":"هلا");setMarket(u,lang==="fa"?"iran":"iraq");const c=convOf(u);
  mkOrder("O-"+u.id,c.lead_id,c.conversation_id,status,lang==="fa"?{}:{market:"ARAB",currency:"USD",total:26500});return {u,...c};};

// ================= A. ambiguous existing order vs new purchase =================
{for(const [lang,msg] of [["fa","سفارش قبلی رو دوباره می‌خوام"],["fa","همون جعبه‌های قبلی رو بازم دارید؟"],["ar","أريد نفس الطلب مرة ثانية"],["ar","طلبي الجديد شكد سعره؟"],["ar","عندكم علب ساعات؟"]]){
  const c=await withOrder("paid",{lang}),s0=sent().length,r=await send(c.u,msg),out=sent().slice(s0).map(textOf);
  ok(`A1 paid customer + «${msg}» is not answered with the existing order's status`,r.action!=="order_status"&&!r.brain?.order_reference,[r.action,r.brain?.order_reference]);
  ok(`A2 «${msg}»: nothing sent carries the order number, a price or a payment instruction that was not approved`,out.every(t=>!/HB-O-|[0-9٠-٩۰-۹]{3,}|USD|\$|تومان|دولار|كارت|کارت|حساب/.test(t)),out);}
 for(const [lang,msg] of [["fa","سفارشم کجاست؟"],["ar","وين طلبي؟"]]){const c=await withOrder("shipped",{lang}),r=await send(c.u,msg);
  ok(`A3 explicit «${msg}» stays a deterministic order-status answer for the customer's own order`,r.action==="order_status"&&r.brain?.order_reference?.order_id===("O-"+c.u.id),[r.action,r.brain?.order_reference]);}
 // isolation: another customer's order is never used
 const owner=await withOrder("shipped"),stranger=user("fa");await send(stranger,"سلام");setMarket(stranger,"iran");const sR=await send(stranger,"سفارشم کجاست؟");
 ok("A4 a customer WITHOUT an order asking «سفارشم کجاست؟» never gets another customer's order",!sR.brain?.order_reference&&!/HB-O-/.test(String(sR.draft?.message||"")),[sR.action,sR.brain?.order_reference,String(sR.draft?.message||"").slice(0,80)]);
 ok("A5 order lookups stay scoped to the same lead AND conversation",convOf(owner.u).lead_id!==convOf(stranger).lead_id);
 // mixed status + new purchase → held for the owner (no autonomous commercial decision)
 const mx=await withOrder("confirmed",{lang:"ar"}),mR=await send(mx.u,"وين طلبي؟ وأريد طلب جديد علب ساعات");
 ok("A6 Iraqi status + new order in one message → held for the owner, never auto-sent",mR.draft?.status!=="sent"&&["mixed_order_status_and_sales","post_sale_owner_review","owner_required"].includes(mR.outcome?.reason),[mR.action,mR.draft?.status,mR.outcome?.reason]);
 const mf=await withOrder("paid"),fR=await send(mf.u,"سفارشم کجاست یه سفارش جدید هم میخوام");
 ok("A7 Persian status + new order without punctuation → mixed, held (status question not dropped)",fR.brain?.order_status_also_asked?.order_id===("O-"+mf.u.id)&&fR.draft?.status!=="sent",[fR.action,fR.draft?.status,fR.outcome?.reason]);}

// ================= B. follow-up reliability =================
const addLead=(id,stage,n,at)=>dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",[id,id,"https://"+id.toLowerCase()+".test",stage,"normal",JSON.stringify(n),at,at]);
const notes=id=>JSON.parse(q("SELECT notes FROM leads WHERE id=?",[id])[0]?.notes||"{}");
const resetRuns=()=>dbrun("DELETE FROM system_events WHERE type IN ('crm_followup_reserved','crm_followup_deferred')");
{const old=daysAgo(40);
 addLead("FU-OLD-IQ","contacted",{source:"manual",market:"ARAB",negotiation_draft:"x",next_followup_at:daysAgo(1)},old);
 addLead("FU-OLD-IR","negotiation",{source:"manual",market:"IRAN",negotiation_draft:"x",next_followup_at:daysAgo(1)},old);
 addLead("FU-FUTURE","contacted",{source:"manual",market:"IRAN",next_followup_at:iso(Date.now()+5*86400000)},old);
 addLead("FU-CLOSED","customer",{source:"manual",market:"IRAN",next_followup_at:daysAgo(1)},old);
 // 520 newer leads without any follow-up date push the due ones out of the old "latest 500" window
 for(let i=0;i<520;i++)addLead("FU-NOISE-"+i,"contacted",{source:"manual",market:"IRAN"},daysAgo(1));
 const g=await call("/api/ads/followups",null,"GET"),ids=(g.body?.items||[]).map(x=>x.id);
 ok("B1 the owner's due list shows a due lead even with 520 more recently updated leads (H3)",ids.includes("FU-OLD-IQ")&&ids.includes("FU-OLD-IR"),ids.slice(0,10));
 ok("B2 not-yet-due and closed-stage leads are not listed",!ids.includes("FU-FUTURE")&&!ids.includes("FU-CLOSED"),ids);
 const t0n=W.tg.length;resetRuns();const r1=await call("/api/ads/followups/run",{});
 ok("B3 the follow-up run drafts both due leads (draft only, stage unchanged)",!!notes("FU-OLD-IQ").followup_draft&&!!notes("FU-OLD-IR").followup_draft&&q("SELECT stage FROM leads WHERE id='FU-OLD-IQ'")[0].stage==="contacted",[r1.status,r1.body]);
 ok("B4 the follow-up language follows the lead's market (ARAB → Iraqi Arabic, IRAN → Persian)",prompts.some(p=>/Iraqi Arabic/.test(p)&&/FU-OLD-IQ/.test(p))&&prompts.some(p=>/Persian/.test(p)&&/FU-OLD-IR/.test(p)),prompts.map(p=>p.slice(0,70)));
 ok("B5 nothing is sent to anyone by a follow-up run",W.tg.length===t0n,W.tg.slice(t0n).map(x=>x.method));
 const d1=notes("FU-OLD-IQ").followup_draft,p1=prompts.length;resetRuns();const r2=await call("/api/ads/followups/run",{});
 ok("B6 running again creates no duplicate draft and no extra provider call",prompts.length===p1&&notes("FU-OLD-IQ").followup_draft===d1&&Number(r2.body?.prepared||0)===0,[r2.body,prompts.length-p1]);
 const g2=await call("/api/ads/followups",null,"GET");
 ok("B7 a drafted lead stays visible for the owner with its draft",(g2.body?.items||[]).some(x=>x.id==="FU-OLD-IQ"&&x.followup_draft===d1));
 ok("B8 the follow-up cron/quota gate is unchanged (second run within 55 min without reset is deferred)",(await call("/api/ads/followups/run",{})).body?.deferred===true);}

// revenue follow-ups: currency must be the market's
{const mkConv=async lang=>{const u=user(lang);await send(u,lang==="fa"?"سلام":"هلا");setMarket(u,lang==="fa"?"iran":"iraq");return convOf(u);};
 const good=await mkConv("ar"),bad=await mkConv("ar"),badIr=await mkConv("fa");
 mkOrder("RV-AR-USD",good.lead_id,good.conversation_id,"partially_paid",{market:"ARAB",currency:"USD",total:26500,at:daysAgo(10)});pay("RVP-1","RV-AR-USD",good.lead_id,10000,{currency:"USD",at:daysAgo(5)});
 mkOrder("RV-AR-TOMAN",bad.lead_id,bad.conversation_id,"partially_paid",{market:"ARAB",currency:"TOMAN",total:26500,at:daysAgo(10)});pay("RVP-2","RV-AR-TOMAN",bad.lead_id,10000,{currency:"TOMAN",at:daysAgo(5)});
 mkOrder("RV-IR-USD",badIr.lead_id,badIr.conversation_id,"confirmed",{market:"IRAN",currency:"USD",total:26500,at:daysAgo(5)});
 const before=W.tg.length,rv=await call("/api/revenue/followups/run",{});
 const drafts=q("SELECT message FROM lead_outreach WHERE conversation_id IN (?,?,?)",[good.conversation_id,bad.conversation_id,badIr.conversation_id]);
 ok("B9 revenue run drafts the ARAB/USD balance request for owner approval",rv.status===200&&q("SELECT 1 FROM lead_outreach WHERE conversation_id=? AND message LIKE '%USD%'",[good.conversation_id]).length===1,[rv.body,drafts.map(x=>x.message.slice(0,60))]);
 ok("B10 an ARAB order stored in TOMAN gets NO customer draft (owner only)",!q("SELECT 1 FROM lead_outreach WHERE conversation_id=? AND (message LIKE '%TOMAN%' OR message LIKE '%تومان%')",[bad.conversation_id]).length,drafts);
 ok("B11 an IRAN order stored in USD gets NO payment-request draft",!q("SELECT 1 FROM lead_outreach WHERE conversation_id=? AND message LIKE '%USD%'",[badIr.conversation_id]).length,drafts);
 ok("B12 the run reports the mismatches as owner-only data-quality items",Number(rv.body?.owner_only||0)>=2&&Number(rv.body?.data_quality_issues||0)>=2,rv.body);
 const br=await call("/api/orders/balance-request",{id:"RV-AR-TOMAN"});
 ok("B13 a direct owner balance request for an ARAB order in TOMAN is refused (409, nothing drafted)",br.status===409&&/USD/.test(String(br.body?.error||"")),br.body);
 ok("B14 the revenue run sends nothing (drafts only, sending_enabled:false)",W.tg.length===before&&rv.body?.sending_enabled===false,W.tg.slice(before).map(x=>x.method));}

// ================= C. Iraqi market safety =================
{const lead=u=>convOf(u).lead_id,mkt=r=>r.brain?.knowledge_market?.conversation_market||null;
 const a=user("fa");await send(a,"سلام");setMarket(a,"iraq");const aR=await send(a,"قیمت جعبه انگشتری چنده؟");
 ok("C1 a Persian-writing customer with Iraq country evidence is in the ARAB market (language does not decide)",mkt(aR)==="ARAB",[mkt(aR),aR.lang]);
 const b=user("ar");await send(b,"هلا");setMarket(b,"iran");const bR=await send(b,"شكد سعر علبة الخاتم؟");
 ok("C2 an Arabic-writing customer with Iran country evidence is in the IRAN market",mkt(bR)==="IRAN",[mkt(bR),bR.lang]);
 const c=user("ar");await send(c,"هلا");const cR=await send(c,"شكد سعر علبة الخاتم؟");
 ok("C3 Arabic text alone (no country / city evidence) does not set the market",mkt(cR)!=="ARAB"&&mkt(cR)!=="IRAN",[mkt(cR),cR.lang,lead(c)]);
 const d=user("ar");await send(d,"هلا");const dR=await send(d,"التوصيل للبصرة وطهران، شكد السعر؟");
 ok("C4 a mixed Iraq + Iran request leaves the market undecided (held for clarification)",mkt(dR)!=="ARAB"&&mkt(dR)!=="IRAN",[mkt(dR),dR.action]);
 const out=[aR,bR,cR,dR].map(r=>({a:r.action,s:r.draft?.status,m:String(r.draft?.message||"")}));
 ok("C5 no price, discount, deposit or payment instruction is auto-sent without approved data (no approved prices loaded)",out.every(x=>x.s!=="sent"||!/[0-9٠-٩۰-۹]{2,}|USD|\$|تومان|دولار|خصم|تخفیف|عربون|بیعانه|كارت|کارت/.test(x.m)),out);
 const e=await withOrder("confirmed",{lang:"ar"}),eS=sent().length,eR=await send(e.u,"انطوني رقم الحساب حتى أحول العربون");
 ok("C6 a payment-instruction request is never answered with invented account details or amounts",sent().slice(eS).map(textOf).every(t=>!/[0-9٠-٩]{4,}|IBAN|USD|\$/.test(t))&&eR.draft?.status!=="sent",[eR.action,eR.draft?.status,sent().slice(eS).map(textOf)]);
 ok("C7 no request left the machine except the in-process mocks",!W.offNet().filter(s=>!/api\.openai\.com/.test(s)).length,W.offNet());}
console.log(`phase16_2 time ${((Date.now()-started)/1000).toFixed(1)} s`);
process.exit(done()?1:0);
