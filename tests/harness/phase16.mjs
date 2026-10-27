// PHASE 16.1 — sales hardening (local): S1 an existing order never hijacks a new sales question (explicit status only; status + sales
// → held for the owner), B2 Iraqi city prefixes / conjunctions and mixed Iran–Iraq destinations, E2 safe order cancellation (no cancel
// after payment / shipment / contradictory ledger; atomic against a concurrent payment; owner-only), quote safeguards and side effects.
// Local only: Telegram and AI are in-process mocks; nothing reaches Production, a customer or a paid API.
import {makeWorld,reporter} from "./harness.mjs";
const {ok,J,done}=reporter("phase16");
const started=Date.now(),t0=()=>new Date().toISOString();
const W=await makeWorld({});const {q,dbrun,call,send,setMarket}=W;
await call("/api/quotes",null,"GET");await call("/api/orders",null,"GET");
let uid=716160000;const user=p=>({id:++uid,name:p,username:p+uid});
const convOf=u=>q("SELECT lead_id,conversation_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(u.id)])[0];
const mkOrder=(id,lead,conv,status,{market="IRAN",currency="TOMAN",total=1000000}={})=>dbrun("INSERT INTO lead_orders(id,order_number,quote_id,lead_id,conversation_id,market,product,quantity,currency,unit_price_minor,subtotal_minor,total_minor,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,"HB-"+id,"Q-"+id,lead,conv,market,"نیم ست کوچک 3 تکه",10,currency,total/10,total,total,status,t0(),t0()]);
const pay=(id,order,lead,amount,{kind="deposit",currency="TOMAN",ref=null}={})=>dbrun("INSERT INTO lead_order_payments(id,order_id,lead_id,payment_kind,amount_minor,currency,method,reference,reference_key,received_at,notes,recorded_by,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,order,lead,kind,amount,currency,"bank_transfer",ref||id,ref||id,t0(),null,"authenticated_owner",t0()]);
// a customer with an order in the given state
const withOrder=async(status,{lang="fa",greet}={})=>{const u=user(lang);await send(u,greet||(lang==="fa"?"سلام":"هلا"));setMarket(u,lang==="fa"?"iran":"iraq");const c=convOf(u);
  mkOrder("O-"+u.id,c.lead_id,c.conversation_id,status,lang==="fa"?{}:{market:"ARAB",currency:"USD",total:26500});return {u,...c};};
const sent=()=>W.tg.filter(x=>/^send/.test(x.method));

// ================= A. existing-order routing (S1) =================
{const cases=[["A1 explicit «سفارشم کجاست؟» → order status","سفارشم کجاست؟",true],["A2 «سفارشم ارسال شده؟» → order status","سفارشم ارسال شده؟",true],
  ["A3 a price question of a customer with a PAID order goes to the sales path (not status)","قیمت جعبه انگشتری ۳ تکه چنده؟",false],
  ["A4 a discount / quantity question goes to the sales path with the existing negotiation policy","برای ۵۰۰ عدد تخفیف دارید؟",false],
  ["A5 «یه سفارش جدید می‌خوام» starts a new sales conversation (no status reply)","یه سفارش جدید می‌خوام",false],
  ["A6 a product question («جعبه ساعت دارید؟») is a sales question","جعبه ساعت دارید؟",false],
  ["A7 a greeting of a paid customer is not answered with the order status","سلام",false]];
 for(const [label,msg,status] of cases){const c=await withOrder("paid");const r=await send(c.u,msg);
  ok(label,(r.action==="order_status")===status&&(status||!/HB-O-/.test(String(r.draft?.message||""))),[r.action,String(r.draft?.message||"").slice(0,90)]);}
 const m=await withOrder("paid"),s0=sent().length,mx=await send(m.u,"سفارشم کجاست؟ یه قیمت هم برای جعبه ساعت بدید");
 ok("A8 status + new price in ONE message: the sales path answers, the order reference is kept (order_status_also_asked) and the draft is HELD for the owner (neither intent dropped)",
  mx.action!=="order_status"&&mx.brain?.order_status_also_asked?.order_id===("O-"+m.u.id)&&mx.draft?.status!=="sent"&&mx.outcome?.reason==="mixed_order_status_and_sales",[mx.action,mx.brain?.order_status_also_asked,mx.draft?.status,mx.outcome?.reason]);
 ok("A9 the held mixed message gets exactly ONE neutral acknowledgement (no order data, no price auto-sent)",sent().slice(s0).length===1&&!!mx.ack&&sent().slice(s0).every(x=>!/HB-O-|[0-9]{3,}/.test(JSON.parse(x.body).text||"")),[mx.ack,sent().slice(s0).map(x=>x.body.slice(0,120))]);
 // review fixes: an open-order customer's unclassified message keeps the owner review it had before (Approval Gate not loosened)
 for(const [st,msg] of [["confirmed","شماره کارت رو بفرستید"],["shipped","باشه"],["paid","سلام"]]){const c=await withOrder(st),b0=sent().length,r=await send(c.u,msg);
  ok(`A17 ${st} order + «${msg}» (no status, no sales signal) → drafted by the sales path but HELD for the owner, one acknowledgement`,r.action!=="order_status"&&r.draft?.status!=="sent"&&r.outcome?.reason!==undefined&&sent().slice(b0).length<=1&&r.brain?.post_sale_review===true,[r.action,r.draft?.status,r.outcome?.reason,r.brain?.post_sale_review]);}
 const ac=await withOrder("confirmed",{lang:"ar"}),acR=await send(ac.u,"متى تجهزون الطلب؟");
 ok("A18 «متى تجهزون الطلب؟» is an explicit status question",acR.action==="order_status",acR.action);
 const fl=await withOrder("paid"),flR=await send(fl.u,"سفارش دیگه کی میرسه؟");
 ok("A19 «سفارش دیگه کی میرسه؟» («دیگه» = filler) is a status question, not a new order",flR.action==="order_status",flR.action);
 for(const msg of ["سفارش کیفیتش چطوره؟","سفارش ارسال میکنید عراق؟","سفارش آماده دارید؟","کی میرسه اگه الان سفارش بدم؟"]){const c=await withOrder("paid"),r=await send(c.u,msg);
  ok(`A20 «${msg}» is not an explicit status question (no false positive)`,r.action!=="order_status",r.action);}
 const tp=await withOrder("confirmed"),tpR=await send(tp.u,"میشه ۳۰ درصد پیش پرداخت بدم؟");
 ok("A21 payment-terms question of a confirmed-order customer still reaches the owner terms path (payment_terms_owner), not auto-sent",tpR.draft?.status!=="sent"&&["payment_terms_owner","payment_terms","wait_for_owner"].includes(tpR.action),[tpR.action,tpR.draft?.status]);
 for(const [msg,status] of [["وين طلبي؟",true],["طلبي وصل؟",true],["أريد طلب جديد",false],["بكم علبة الخاتم؟ أريد 100",false]]){const c=await withOrder("confirmed",{lang:"ar"});const r=await send(c.u,msg);
  ok(`A10 Iraqi Arabic «${msg}» with a confirmed order → ${status?"order status":"sales path"}`,(r.action==="order_status")===status,[r.action,r.lang]);}
 const n=user("nn");await send(n,"سلام");const no=await send(n,"سفارشم کجاست؟");
 ok("A11 a status question WITHOUT any order does not crash and never invents an order",no.action!=="order_status"&&!!no.brain&&!/HB-/.test(String(no.draft?.message||"")),[no.action]);
 const f=await withOrder("fulfilled"),fNew=await send(f.u,"یه سفارش جدید می‌خوام"),fSt=await send(f.u,"سفارشم کجاست؟");
 ok("A12 fulfilled order: a new order request is sales, an explicit status question is still answered as status",fNew.action!=="order_status"&&fSt.action==="order_status",[fNew.action,fSt.action]);
 const st=await withOrder("paid"),stR=await send(st.u,"سفارشم کجاست؟");
 ok("A13 an order-status reply stays owner-reviewed (not auto-sent) exactly as before",stR.draft?.status!=="sent",stR.draft?.status);
 const leads=q("SELECT provider_sender_id s,COUNT(DISTINCT lead_id) n FROM inbox_messages GROUP BY provider_sender_id HAVING n>1");
 ok("A14 CRM identity preserved: every sender maps to exactly one lead (no duplicate leads from the new routing)",!leads.length,leads);}
{// Sales AI continuation (mocked provider; no network)
 const W2=await makeWorld({aiBrain:"on"});await W2.call("/api/quotes",null,"GET");await W2.call("/api/orders",null,"GET");
 W2.AI.fallback=()=>({requests:[],reply:"حتماً، بفرمایید چه مدل جعبه‌ای مدنظرتونه؟"});
 const u={id:716169001,name:"ai",username:"ai_p"};await W2.send(u,"سلام");W2.setMarket(u,"iran");const c=W2.q("SELECT lead_id,conversation_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(u.id)])[0];
 W2.dbrun("INSERT INTO lead_orders(id,order_number,quote_id,lead_id,conversation_id,market,product,quantity,currency,unit_price_minor,subtotal_minor,total_minor,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",["O-AI","HB-O-AI","Q-AI",c.lead_id,c.conversation_id,"IRAN","x",1,"TOMAN",1,1,1,"paid",t0(),t0()]);
 const a0=W2.AI.calls.length,r=await W2.send(u,"یه جعبه ساعت چرمی برای فروشگاهم می‌خوام");
 ok("A15 with SALES_AI_BRAIN on, a paid customer's new product request reaches the Sales AI gateway (one mocked call), not the status path",r.action!=="order_status"&&W2.AI.calls.length===a0+1,[r.action,W2.AI.calls.length-a0]);
 const a1=W2.AI.calls.length,s=await W2.send(u,"سفارشم کجاست؟");
 ok("A16 an explicit status question makes NO provider call (deterministic, no extra cost)",s.action==="order_status"&&W2.AI.calls.length===a1,[s.action,W2.AI.calls.length-a1]);
 W2.AI.script.set("نزلها 30% وأوكيه",()=>({requests:["discount"],reply:"تمام، نعطيك خصم 30% والسعر يصير 1.75 دولار للقطعة",facts:{product:"علبة خاتم",quantity:100}}));
 W2.dbrun("INSERT INTO commercial_price_items(id,product_key,product_name,sku,market,currency,unit_price_minor,moq,version,active,effective_from,effective_until,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",["PI-A","ring box","علبة خاتم",null,"ARAB","USD",250,50,1,1,null,null,"owner",t0(),t0(),t0()]);
 const g={id:716169002,name:"g",username:"g_p"};await W2.send(g,"هلا");W2.setMarket(g,"iraq");await W2.send(g,"بكم علبة الخاتم؟ أريد 100");const tg0=W2.tg.length,ds=await W2.send(g,"نزلها 30% وأوكيه");
 ok("D7 no fabricated discount: the AI's 30% / 1.75 is never sent to the customer (an approved-price restatement may be)",!W2.tg.slice(tg0).some(x=>/1\.75|30%/.test(x.body)),[ds.action,ds.draft?.status]);
 ok("E5a AI world: no request left the machine except the two in-process mocks",!W2.offNet().length,W2.offNet());}

// ================= B. language and market (B2) =================
const mem=(u,key)=>{const c=convOf(u);const r=q("SELECT value_json FROM conversation_memory_facts WHERE lead_id=? AND memory_key=? AND status='active' ORDER BY created_at DESC LIMIT 1",[c.lead_id,key])[0];return r?JSON.parse(r.value_json):null;};
const mkt=r=>r.brain?.knowledge_market?.conversation_market||null;
{const one=async(first,msg)=>{const u=user("b");await send(u,first);const r=await send(u,msg);return {u,r};};
 const fa=await one("سلام","ارسال به تهران");
 ok("B1 Persian + Iran city → IRAN market, Persian reply",mem(fa.u,"destination")==="تهران"&&mkt(fa.r)==="IRAN"&&fa.r.lang==="Persian",[mem(fa.u,"destination"),mkt(fa.r),fa.r.lang]);
 const ar=await one("هلا","التوصيل للبصرة");
 ok("B2 Arabic + Iraqi city with prefix → ARAB market, Iraqi Arabic reply",mem(ar.u,"destination")==="البصرة"&&mkt(ar.r)==="ARAB"&&ar.r.lang==="Iraqi Arabic",[mem(ar.u,"destination"),mkt(ar.r),ar.r.lang]);
 const faIq=await one("سلام","ارسال به بغداد");
 ok("B3 Persian speaker shipping to Iraq → ARAB market (language never decides the market)",mem(faIq.u,"destination")==="بغداد"&&mkt(faIq.r)==="ARAB",[mem(faIq.u,"destination"),mkt(faIq.r)]);
 const arIr=await one("هلا","التوصيل إلى طهران");
 ok("B4 Arabic speaker shipping to Iran → IRAN market",mkt(arIr.r)==="IRAN",[mem(arIr.u,"destination"),mkt(arIr.r)]);
 for(const [msg,city] of [["التوصيل للرمادي","الرمادي"],["التوصيل بالبصرة","البصرة"],["للبصرة","البصرة"],["بالفلوجة","الفلوجة"],["لبغداد","بغداد"],["التوصيل في بغداد","بغداد"],["إلى النجف","النجف"],["والبصرة","البصرة"],["ولبغداد","بغداد"]]){
  const x=await one("هلا",msg);ok(`B5 «${msg}» → destination ${city}, market ARAB`,mem(x.u,"destination")===city&&mkt(x.r)==="ARAB",[mem(x.u,"destination"),mkt(x.r)]);}
 const mix=await one("هلا","التوصيل للبصرة وطهران");
 ok("B6 a mixed Iran + Iraq destination is NOT stored; the market stays undecided (clarification instead of a guess)",mem(mix.u,"destination")===null&&mkt(mix.r)!=="ARAB"&&mkt(mix.r)!=="IRAN",[mem(mix.u,"destination"),mkt(mix.r)]);
 const org=await one("هلا","الشحن من ايران لبغداد كم يوم؟");
 ok("B6b an ORIGIN («من ايران») does not make the destination mixed: destination بغداد is kept; «من ايران» is also customer-country evidence (Phase 14.1 rule) → the conflict goes to the owner, never a guessed IRAN market",mem(org.u,"destination")==="بغداد"&&mkt(org.r)!=="IRAN",[mem(org.u,"destination"),mkt(org.r)]);
 const cor=await one("هلا","مو طهران، البصرة");
 ok("B7 an explicit correction between countries still takes the last city (Phase 14 behaviour kept)",mem(cor.u,"destination")==="البصرة",mem(cor.u,"destination"));
 for(const msg of ["نحن عراقيين","انا عراقي","هلا شلونك"]){const x=await one("هلا",msg);
  ok(`B8 «${msg}»: no country, no destination, no market (Arabic / «عراقي» alone is not proof)`,mem(x.u,"customer_country")===null&&mem(x.u,"destination")===null&&mkt(x.r)!=="ARAB",[mem(x.u,"customer_country"),mkt(x.r)]);}
 const c=await one("هلا","العراق");
 ok("B9 country only («العراق») = market evidence (ARAB) but no delivery city is invented",mem(c.u,"customer_country")==="العراق"&&mem(c.u,"destination")===null&&mkt(c.r)==="ARAB",[mem(c.u,"customer_country"),mem(c.u,"destination"),mkt(c.r)]);
 for(const msg of ["متجر بغداد للذهب","بالفعل اريد اسأل","عندي فلوس","والله زين"]){const x=await one("هلا",msg);
  ok(`B10 false positive guard «${msg}» → no destination`,mem(x.u,"destination")===null,mem(x.u,"destination"));}
 const pq=await one("هلا","التوصيل للبصرة");
 ok("B11 Iraqi conversation keeps Iraqi Arabic style and USD market (no TOMAN)",pq.r.lang==="Iraqi Arabic"&&!/تومان|TOMAN/.test(String(pq.r.draft?.message||"")),[pq.r.lang,pq.r.draft?.message]);}

// ================= C. cancellation (E2) =================
const cancel=(id,auth=true)=>auth?call("/api/orders/transition",{id,action:"cancel",reason:"test reason"}):W.run(new Request("https://w.test/api/orders/transition",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,action:"cancel",reason:"x"})}));
const st=id=>q("SELECT status FROM lead_orders WHERE id=?",[id])[0]?.status;
const payRows=()=>J(q("SELECT id,order_id,payment_kind,amount_minor FROM lead_order_payments ORDER BY id"));
{mkOrder("C-CONF","L-C","CV-C","confirmed");mkOrder("C-CAND","L-C","CV-C2","order_candidate");
 const r1=await cancel("C-CONF"),r2=await cancel("C-CAND");
 ok("C1 an unpaid confirmed order can be cancelled by the owner",r1.status===200&&st("C-CONF")==="cancelled",[r1.status,r1.body]);
 ok("C2 an order candidate can be cancelled",r2.status===200&&st("C-CAND")==="cancelled",[r2.status,r2.body]);
 mkOrder("C-PAID","L-C","CV-C3","paid");pay("P-1","C-PAID","L-C",1000000,{kind:"full"});
 mkOrder("C-PART","L-C","CV-C4","partially_paid");pay("P-2","C-PART","L-C",400000);
 mkOrder("C-SHIP","L-C","CV-C5","shipped");pay("P-3","C-SHIP","L-C",1000000,{kind:"full"});
 mkOrder("C-FUL","L-C","CV-C6","fulfilled");pay("P-4","C-FUL","L-C",1000000,{kind:"full"});
 mkOrder("C-CONTRA","L-C","CV-C7","confirmed");pay("P-5","C-CONTRA","L-C",300000);
 const before=payRows();
 for(const [id,label,reason] of [["C-PAID","C3 a PAID order","payment_recorded"],["C-PART","C4 a partially paid order","payment_recorded"],["C-SHIP","C5 a shipped order","order_shipped"],["C-FUL","C6 a fulfilled order","order_shipped"],["C-CONTRA","C7 a contradictory state (confirmed but a payment is recorded)","payment_state_contradictory"]]){
  const s0=st(id),r=await cancel(id);
  ok(`${label} cannot be cancelled: explicit blocked status (${reason}), order unchanged`,r.status===409&&r.body?.blocked===true&&r.body?.blocked_reason===reason&&st(id)===s0,[r.status,r.body]);}
 ok("C8 no payment was deleted, reversed or added by any refused cancellation (ledger identical)",payRows()===before);
 mkOrder("C-REV","L-C","CV-C8","confirmed");pay("P-6","C-REV","L-C",500000);pay("P-6R","C-REV","L-C",-500000,{kind:"reversal",ref:"reversal:P-6"});
 const rv=await cancel("C-REV");
 ok("C9 after the owner reversed every payment (ledger nets to zero) the order can be cancelled and BOTH ledger rows are preserved",rv.status===200&&st("C-REV")==="cancelled"&&q("SELECT COUNT(*) n FROM lead_order_payments WHERE order_id='C-REV'")[0].n===2,[rv.status,rv.body]);
 mkOrder("C-RACE","L-C","CV-C9","confirmed");
 // a payment lands between the ledger check and the UPDATE: the guarded UPDATE must refuse
 const orig=W.env.DB.prepare.bind(W.env.DB);let injected=false;
 W.env.DB.prepare=sql=>{const s=orig(sql);if(!injected&&/COUNT\(\*\) AS n,COALESCE\(SUM\(amount_minor\),0\) AS net FROM lead_order_payments/.test(sql)){const b=s.bind.bind(s);s.bind=(...a)=>{const x=b(...a),f=x.first.bind(x);x.first=async()=>{const r=await f();injected=true;pay("P-RACE","C-RACE","L-C",200000);return r;};return x;};}return s;};
 const race=await cancel("C-RACE");W.env.DB.prepare=orig;
 ok("C10 concurrency: a payment recorded during the cancellation makes it fail (atomic guard in the UPDATE); the order stays confirmed",injected&&race.status===409&&race.body?.blocked_reason==="order_changed_concurrently"&&st("C-RACE")==="confirmed",[injected,race.status,race.body,st("C-RACE")]);
 mkOrder("C-DUP","L-C","CV-C10","confirmed");const [d1,d2]=await Promise.all([cancel("C-DUP"),cancel("C-DUP")]);
 ok("C11 two simultaneous cancellations: the order ends cancelled once, both calls answer consistently, one audit event",st("C-DUP")==="cancelled"&&[d1,d2].every(x=>x.status===200)&&q("SELECT COUNT(*) n FROM system_events WHERE type='lead_order_cancelled' AND details_json LIKE '%C-DUP%'")[0].n===1,[d1.status,d2.status]);
 mkOrder("C-AUTH","L-C","CV-C11","confirmed");const na=await cancel("C-AUTH",false);
 ok("C12 cancellation without the owner token is refused (401) and changes nothing",na.status===401&&st("C-AUTH")==="confirmed",na.status);
 const rc=await call("/api/orders/transition",{id:"C-AUTH",action:"cancel",reason:""});
 ok("C13 a cancellation reason is still required",rc.status===409&&st("C-AUTH")==="confirmed",rc.body);
 const again=await cancel("C-CONF");
 ok("C14 cancelling an already cancelled order stays idempotent (no error, no change)",again.status===200&&st("C-CONF")==="cancelled",again.status);}

// ================= D. quote safeguards =================
{dbrun("INSERT INTO commercial_price_items(id,product_key,product_name,sku,market,currency,unit_price_minor,moq,version,active,effective_from,effective_until,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",["PI-1","ring box","علبة خاتم",null,"ARAB","USD",250,50,1,1,null,null,"owner",t0(),t0(),t0()]);
 dbrun("INSERT INTO commercial_price_items(id,product_key,product_name,sku,market,currency,unit_price_minor,moq,version,active,effective_from,effective_until,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",["PI-T","toman box","Toman box",null,"ARAB","TOMAN",500000,1,1,1,null,null,"owner",t0(),t0(),t0()]);
 const iq=async msg=>{const u=user("q");await send(u,"هلا");setMarket(u,"iraq");return await send(u,msg);};
 const nums=r=>(String(r.draft?.message||"").match(/[0-9]+(?:\.[0-9]+)?/g)||[]);
 const ap=await iq("بكم علبة الخاتم؟ أريد 100");
 ok("D1 approved product + quantity → the exact approved USD price is answered (2.50 / 250.00)",ap.action==="answer_price"&&/2\.50/.test(ap.draft?.message||"")&&/250\.00/.test(ap.draft?.message||""),[ap.action,ap.draft?.message]);
 const un=await iq("بكم علبة ساعة ذهبية فاخرة؟ أريد 100");
 ok("D2 unknown product → no price is sent (only the customer's own quantity may appear)",un.draft?.status!=="sent"||nums(un).every(n=>n==="100"),[un.action,un.draft?.status,un.draft?.message]);
 const mq=await iq("بكم علبة الخاتم؟");
 ok("D3 missing quantity → no invented total (only approved numbers: unit price / MOQ)",nums(mq).every(n=>["2.50","50","2","250.00","125.00"].includes(n)),[mq.action,mq.draft?.message]);
 const cu=await iq("أريد علبة بتصميم خاص وشعار ذهبي مطبوع، بكم؟");
 ok("D4 custom / unspecified product → no fabricated price (held or a targeted question)",cu.draft?.status!=="sent"||!nums(cu).length,[cu.action,cu.draft?.status,cu.draft?.message]);
 const tm=await iq("بكم Toman box؟ أريد 20");
 ok("D5 a price row in the wrong currency for the market (TOMAN in ARAB) is never used or converted",!/500000|5000|تومان/.test(String(tm.draft?.message||""))||tm.draft?.status!=="sent",[tm.action,tm.draft?.message]);
 const fa=user("qf");await send(fa,"سلام");setMarket(fa,"iran");const fr=await send(fa,"قیمت جعبه انگشتری ۳ تکه چنده؟");
 ok("D6 IRAN without an approved price for the product → a targeted question / owner path, no number invented",fr.draft?.status!=="sent"||!(String(fr.draft?.message||"").match(/[0-9۰-۹]{2,}/)),[fr.action,fr.draft?.message]);}

// ================= E. side effects =================
{const leads=q("SELECT provider_sender_id s,COUNT(DISTINCT lead_id) n FROM inbox_messages GROUP BY provider_sender_id HAVING n>1");
 ok("E1 no duplicate leads across the whole run",!leads.length,leads);
 const autoOrders=q("SELECT id,status FROM lead_orders WHERE id LIKE 'O-%' AND status NOT IN ('paid','confirmed','fulfilled','shipped')");
 ok("E2 no order created by the tests' messages changed status (no unauthorized confirmation / cancellation from a chat)",!autoOrders.length,autoOrders);
 ok("E3 no order was confirmed by a customer message (only candidates may be created from chats)",!q("SELECT 1 FROM lead_orders WHERE confirmed_by IS NOT NULL AND id NOT LIKE 'C-%' AND id NOT LIKE 'O-%'").length);
 ok("E4 no implicit payment reversal anywhere (only the test's own reversal row exists)",q("SELECT COUNT(*) n FROM lead_order_payments WHERE payment_kind='reversal'")[0].n===1);
 const bad=sent().filter(x=>{let b={};try{b=JSON.parse(x.body);}catch{}return !(Number(b.chat_id)>=716160000&&Number(b.chat_id)<716170000);});
 ok("E5 every Telegram send went only to a test customer's own private chat",!bad.length,bad.slice(0,3));
 ok("E6 no request left the machine except the in-process mocks",!W.offNet().length,W.offNet());}
console.log(`phase16 time ${((Date.now()-started)/1000).toFixed(1)} s`);
process.exit(done()?1:0);
