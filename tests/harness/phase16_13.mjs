// PHASE 16.13 — final integration: order-lifecycle invariants under concurrency (the 16.13 fix: a payment reversal racing a
// shipment can no longer leave a SHIPPED order with a reversed / unpaid ledger), the other concurrent financial transitions
// (cancel ↔ payment, reversal ↔ new payment, double confirm, double ship) and the per-message AI call budget (one provider call
// per customer message; duplicate / redelivered updates cost nothing). Local only: Telegram and the AI provider are in-process mocks.
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase16_13");
const started=Date.now(),t0=()=>new Date().toISOString(),today=()=>new Date().toISOString().slice(0,10);

// ================= O. order lifecycle under concurrency =================
{const W=await makeWorld({aiBrain:"off"});await W.call("/api/orders",null,"GET");
 const u={id:995100,name:"o",username:"o995100"};await W.send(u,"سلام");
 const c=W.q("SELECT lead_id,conversation_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(u.id)])[0];
 const mk=(id,status="confirmed",total=1000)=>W.dbrun("INSERT INTO lead_orders(id,order_number,quote_id,lead_id,conversation_id,market,product,quantity,currency,unit_price_minor,subtotal_minor,total_minor,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,"HB-"+id,"Q-"+id,c.lead_id,c.conversation_id,"IRAN","نیم ست کوچک 3 تکه",1,"TOMAN",total,total,total,status,t0(),t0()]);
 const pay=(o,ref,amount,kind="partial")=>W.call("/api/orders/payments",{order_id:o,payment_kind:kind,method:"cash",amount_minor:amount,currency:"TOMAN",reference:ref});
 const rev=pid=>W.call("/api/orders/payments/reverse",{payment_id:pid,reason:"test"});
 const ship=o=>W.call("/api/orders/transition",{id:o,action:"ship",carrier:"x",tracking_reference:"T-"+o,shipped_at:today()});
 const tr=(o,action,extra={})=>W.call("/api/orders/transition",{id:o,action,...extra});
 const st=o=>W.q("SELECT status FROM lead_orders WHERE id=?",[o])[0]?.status,net=o=>W.q("SELECT COALESCE(SUM(amount_minor),0) n FROM lead_order_payments WHERE order_id=?",[o])[0].n;
 const firstPay=o=>W.q("SELECT id FROM lead_order_payments WHERE order_id=? AND payment_kind!='reversal' ORDER BY rowid LIMIT 1",[o])[0]?.id;
 // the status must always agree with the ledger (paid ⇔ net = total; shipped/fulfilled ⇒ net = total; cancelled ⇒ net = 0)
 const consistent=(o,total=1000)=>{const s=st(o),n=net(o);return (s==="shipped"||s==="fulfilled"||s==="paid")?n===total:s==="partially_paid"?(n>0&&n<total):s==="cancelled"?n===0:(s==="confirmed"||s==="order_candidate")?n===0:false;};
 const tg0=W.tg.length;

 for(const [label,order,shipFirst] of [["ship first","R1a",true],["reversal first","R1b",false]]){mk(order);await pay(order,"FULL-"+order,1000,"full");const pid=firstPay(order);
   const rs=shipFirst?await Promise.all([ship(order),rev(pid)]):await Promise.all([rev(pid),ship(order)]);
   ok(`R1 [16.13 FIX] reversal racing a shipment (${label}): the order is never left shipped with a reversed ledger`,consistent(order)&&!(st(order)==="shipped"&&net(order)!==1000),[rs.map(r=>[r.status,r.body?.error]),st(order),net(order)]);}
 mk("R2");await pay("R2","FULL-R2",1000,"full");await ship("R2");const late=await rev(firstPay("R2"));
 ok("R2 reversing a payment of an already shipped order is refused (ledger and status unchanged)",late.status>=400&&st("R2")==="shipped"&&net("R2")===1000,[late.status,late.body?.error]);
 mk("R3");await pay("R3","P-600",600);const pid3=firstPay("R3");
 const r3=await Promise.all([rev(pid3),pay("R3","P-400",400)]);
 ok("R3 a reversal racing a new payment keeps the ledger consistent with the status (no overpayment, no false 'paid')",consistent("R3")&&net("R3")<=1000,[r3.map(r=>[r.status,r.body?.error]),st("R3"),net("R3")]);
 for(const [label,order,cancelFirst] of [["cancel first","R4a",true],["payment first","R4b",false]]){mk(order);
   const cancel=()=>tr(order,"cancel",{reason:"test"}),p=()=>pay(order,"C-"+order,300);
   const rs=cancelFirst?await Promise.all([cancel(),p()]):await Promise.all([p(),cancel()]);
   ok(`R4 cancellation racing a payment (${label}): never a cancelled order with money on its ledger`,consistent(order)&&!(st(order)==="cancelled"&&net(order)!==0),[rs.map(r=>[r.status,r.body?.error]),st(order),net(order)]);}
 mk("R5","order_candidate");const r5=await Promise.all([tr("R5","confirm"),tr("R5","confirm"),tr("R5","confirm")]);
 ok("R5 three concurrent owner confirmations → confirmed once, no error storm, no payment row",st("R5")==="confirmed"&&r5.every(r=>r.status===200)&&net("R5")===0,[r5.map(r=>[r.status,r.body?.error]),st("R5")]);
 mk("R6");await pay("R6","FULL-R6",1000,"full");const r6=await Promise.all([ship("R6"),ship("R6")]);
 ok("R6 two concurrent shipments of one paid order → shipped once, ledger untouched",st("R6")==="shipped"&&net("R6")===1000&&r6.some(r=>r.status===200),[r6.map(r=>[r.status,r.body?.error])]);
 const dupOrder=(()=>{try{mk("R7");W.dbrun("INSERT INTO lead_orders(id,order_number,quote_id,lead_id,conversation_id,market,product,quantity,currency,unit_price_minor,subtotal_minor,total_minor,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",["R7-dup","HB-R7-dup","Q-R7",c.lead_id,c.conversation_id,"IRAN","x",1,"TOMAN",1,1,1,"order_candidate",t0(),t0()]);return "inserted";}catch(e){return "refused";}})();
 ok("R7 one quote can never carry two orders (unique quote_id)",dupOrder==="refused",dupOrder);
 const sent=W.tg.slice(tg0).filter(x=>/^send/.test(x.method));
 ok("R8 none of these owner-side financial transitions sent anything to the customer",!sent.length,sent.map(x=>x.method));}

// ================= A. per-message AI call budget =================
{const W=await makeWorld({aiBrain:"on"});W.AI.fallback=()=>({requests:["price"],reply:"سلام"});
 const u={id:995200,name:"a",username:"a995200"};await W.send(u,"سلام");W.setMarket(u,"iran");
 let n0=W.AI.requests.length;await W.send(u,"قیمت جعبه ساعت چنده؟");
 ok("A1 one customer message costs at most ONE provider call (no repeated AI calls by the orchestration)",W.AI.requests.length-n0===1,W.AI.requests.length-n0);
 const upd={update_id:995299,message:{message_id:9999,date:Math.floor(Date.now()/1000),from:{id:u.id,is_bot:false,first_name:"a",username:u.username},chat:{id:u.id,type:"private",username:u.username,first_name:"a"},text:"جعبه انگشتری دارید؟"}};
 n0=W.AI.requests.length;await Promise.all([W.post(upd),W.post(upd),W.post(upd)]);
 ok("A2 the same update delivered 3× concurrently → one inbox row and ONE provider call",W.AI.requests.length-n0===1&&W.q("SELECT COUNT(*) n FROM inbox_messages WHERE external_id=?",[u.id+":9999"])[0].n===1,W.AI.requests.length-n0);
 n0=W.AI.requests.length;await W.post({...upd,update_id:995300});
 ok("A3 a redelivery of that message under a new update_id costs NO provider call",W.AI.requests.length===n0,W.AI.requests.length-n0);
 ok("A4 no request left the machine except the in-process mocks",!W.offNet().length,W.offNet());}

console.log(`phase16_13 time ${((Date.now()-started)/1000).toFixed(1)} s`);
process.exit(done()?1:0);
