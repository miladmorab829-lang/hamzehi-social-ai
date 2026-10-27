// PHASE 16.5 — integration, stress and release readiness (local): A cross-component failure isolation (AI failure modes never corrupt
// customer state or bypass the order / approval gates; background work never blocks a reply), B bounded concurrency (duplicate webhook
// delivery, simultaneous updates and lead creation, repeated owner approvals, concurrent scheduler + inbound), E security (malformed
// payloads, wrong webhook secret, admin-only boundaries, cross-customer isolation, no secret in logs), D local timings (informational).
// Local only: Telegram and the AI provider are in-process mocks; nothing reaches Production, a customer or a paid API.
import {makeWorld,reporter} from "./harness.mjs";
const {ok,J,done}=reporter("phase16_5");
const started=Date.now(),t0=()=>new Date().toISOString();
const W=await makeWorld({aiBrain:"on"});const {q,dbrun,call,send,setMarket,post,AI}=W;
await call("/api/quotes",null,"GET");await call("/api/orders",null,"GET");
let uid=716560000,upd=900000,mid=500000;const user=p=>({id:++uid,name:p,username:p+uid});
const convOf=u=>q("SELECT lead_id,conversation_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(u.id)])[0];
const sent=()=>W.tg.filter(x=>/^send/.test(x.method));
const chatOf=x=>{try{return Number(JSON.parse(x.body).chat_id);}catch{return null;}};
const textOf=x=>{try{const b=JSON.parse(x.body);return String(b.text||b.caption||"");}catch{return "";}};
const update=(u,text,{updateId=++upd,messageId=++mid,chat}={})=>({update_id:updateId,message:{message_id:messageId,date:Math.floor(Date.now()/1000),from:{id:u.id,is_bot:false,first_name:u.name,username:u.username},chat:chat||{id:u.id,type:"private",username:u.username,first_name:u.name},text}});
const mkOrder=(id,lead,conv,status,{market="IRAN",currency="TOMAN",total=1000000}={})=>dbrun("INSERT INTO lead_orders(id,order_number,quote_id,lead_id,conversation_id,market,product,quantity,currency,unit_price_minor,subtotal_minor,total_minor,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,"HB-"+id,"Q-"+id,lead,conv,market,"نیم ست کوچک 3 تکه",10,currency,total/10,total,total,status,t0(),t0()]);
const validJson=s=>{if(s==null)return true;try{JSON.parse(s);return true;}catch{return false;}};
const MONEY=/[0-9٠-٩۰-۹]{3,}|USD|\$|تومان|دولار/;

// ================= A. failure isolation across components =================
{const modes=[["http500",{status:"http500"}],["badjson",{status:"badjson"}],["max_tokens",{status:"max_tokens"}],["refusal",{status:"refusal"}],["network",{fail:true}],["timeout",{delay:7000}]];
 for(const [label,m] of modes){Object.assign(AI,{status:null,fail:false,delay:0},m);
  const u=user("a");await send(u,"سلام");setMarket(u,"iran");const s0=sent().length,t=Date.now(),r=await send(u,"قیمت جعبه انگشتری ۳ تکه برای ۱۰۰ عدد چنده؟"),ms=Date.now()-t;
  const c=convOf(u),facts=q("SELECT value_json FROM conversation_memory_facts WHERE lead_id=?",[c.lead_id]),lead=q("SELECT notes FROM leads WHERE id=?",[c.lead_id])[0];
  const out=sent().slice(s0).map(textOf);
  ok(`A1 AI ${label}: the brain records the provider failure and falls back deterministically (no AI prose used)`,!!r.brain&&r.brain.ai_brain?.used!==true&&!!r.brain.next_sales_action,[r.brain?.ai_brain?.error,r.brain?.ai_brain?.fallback,r.action]);
  ok(`A2 AI ${label}: customer state stays valid (memory facts and lead notes are well-formed JSON)`,facts.every(f=>validJson(f.value_json))&&validJson(lead?.notes),facts.length);
  ok(`A3 AI ${label}: nothing with an unapproved price / amount reaches the customer`,out.every(x=>!MONEY.test(x)),out);
  ok(`A4 AI ${label}: the customer is handled within the bounded AI timeout (<${label==="timeout"?"9":"4"} s)`,ms<(label==="timeout"?9000:4000),ms);}
 Object.assign(AI,{status:"http500",fail:false,delay:0});
 const u=user("o");await send(u,"سلام");setMarket(u,"iran");const c=convOf(u);mkOrder("O5-"+u.id,c.lead_id,c.conversation_id,"confirmed");
 const r=await send(u,"شماره کارت رو بفرستید");
 ok("A5 AI failure + an open order: the post-sale owner hold still applies (gate not bypassed by the fallback)",r.draft?.status!=="sent"&&r.brain?.post_sale_review===true,[r.draft?.status,r.outcome?.reason,r.brain?.post_sale_review]);
 Object.assign(AI,{status:null,fail:false,delay:0});
 // provider 429 across customers: the first message reaches the provider, the next ones skip it (cooldown) and stay deterministic
 const SA=await import("../../worker/src/sales-ai-brain.js");SA.resetSalesAiCooldown();
 const inner=globalThis.fetch;let hits=0;globalThis.fetch=async(u,o={})=>{if(String(u?.url||u)==="https://api.anthropic.com/v1/messages"){hits++;return new Response("{}",{status:429});}return inner(u,o);};
 const cs=[user("q1"),user("q2"),user("q3")],rr=[];for(const x of cs){await send(x,"سلام");setMarket(x,"iran");}hits=0;SA.resetSalesAiCooldown();
 for(const x of cs)rr.push(await send(x,"قیمت جعبه ساعت چنده؟"));globalThis.fetch=inner;SA.resetSalesAiCooldown();
 ok("A7 provider 429: only the FIRST customer message calls the provider; the next ones skip it (provider_cooldown) and are still handled deterministically",hits===1&&rr[0].brain?.ai_brain?.error==="provider_http_429"&&rr.slice(1).every(r=>r.brain?.ai_brain?.error==="provider_cooldown"&&!!r.brain?.next_sales_action),[hits,rr.map(r=>r.brain?.ai_brain?.error)]);
 // a failing background step never blocks inbound handling: scheduled tick with a broken watchdog store runs beside a customer message
 const WK=(await import("../../worker/src/index.js")).default,p=[];W.d1.db.exec("DROP TABLE IF EXISTS agent_heartbeat");
 const u2=user("bg");const [_,r2]=await Promise.all([WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},W.env,{waitUntil:x=>p.push(x)}),send(u2,"سلام")]);await Promise.allSettled(p);
 ok("A6 a scheduled tick with failing background work runs beside an inbound message: the customer is still handled",!!r2.row&&!!r2.brain,[!!r2.row,r2.action]);}

// ================= B. bounded concurrency =================
{const u=user("dup"),up=update(u,"سلام");const s0=sent().length;
 const rs=await Promise.all([1,2,3].map(()=>post(up)));
 ok("B1 the SAME webhook update delivered 3× concurrently → one inbox row, at most one reply, every delivery answered 200",rs.every(r=>r.status===200)&&q("SELECT COUNT(*) n FROM inbox_messages WHERE provider_sender_id=?",[String(u.id)])[0].n===1&&sent().slice(s0).filter(x=>chatOf(x)===u.id).length<=1,[rs.map(r=>r.status),q("SELECT COUNT(*) n FROM inbox_messages WHERE provider_sender_id=?",[String(u.id)])[0].n]);
 const u2=user("redeliver"),m=++mid;await post(update(u2,"هلا",{messageId:m}));await post(update(u2,"هلا",{messageId:m}));
 ok("B2 the same Telegram message under a NEW update_id (redelivery) is not processed twice",q("SELECT COUNT(*) n FROM inbox_messages WHERE provider_sender_id=?",[String(u2.id)])[0].n===1);
 const many=[1,2,3,4,5,6].map(i=>user("c"+i)),s1=sent().length;await Promise.all(many.map((x,i)=>post(update(x,i%2?"سلام":"هلا"))));
 const leads=many.map(x=>convOf(x)?.lead_id);
 ok("B3 six customers at once → six separate leads, each reply only to its own chat",new Set(leads).size===6&&leads.every(Boolean)&&sent().slice(s1).every(x=>many.some(y=>y.id===chatOf(x))),leads);
 const same=user("burst");await Promise.all(["سلام","قیمت جعبه ساعت چنده؟","برای ۲۰۰ عدد"].map(t=>post(update(same,t))));
 const ids=q("SELECT DISTINCT lead_id,conversation_id FROM inbox_messages WHERE provider_sender_id=?",[String(same.id)]);
 ok("B4 one new customer sending 3 messages at once → ONE lead and ONE conversation (no duplicate lead creation)",ids.length===1&&q("SELECT COUNT(*) n FROM inbox_messages WHERE provider_sender_id=?",[String(same.id)])[0].n===3,ids);
 const contacts=q("SELECT COUNT(*) n FROM lead_contacts WHERE normalized_value=? OR raw_value=?",[String(same.id),String(same.id)])[0]?.n;
 ok("B5 …and no duplicate contact identity for that customer",!contacts||contacts<=1,contacts);
 // repeated owner approvals of one draft
 const ap=user("appr");await send(ap,"سلام");setMarket(ap,"iran");const c=convOf(ap);
 const did="o-test-"+ap.id;dbrun("INSERT INTO lead_outreach(id,lead_id,conversation_id,channel,recipient,message,language,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",[did,c.lead_id,c.conversation_id,"telegram",String(ap.id),"سلام، پیامتون رسید.","Persian","draft",t0(),t0()]);
 await W.transition(did,"submit");const s2=sent().length,apps=await Promise.all([1,2,3].map(()=>W.transition(did,"approve")));
 const st=q("SELECT status FROM lead_outreach WHERE id=?",[did])[0]?.status;
 ok("B6 three concurrent owner approvals of one draft → one approved state, no error storm, nothing sent by approval itself",apps.every(r=>r.status===200||r.status===409)&&apps.some(r=>r.body?.ok)&&["approved","sent"].includes(st)&&sent().slice(s2).filter(x=>chatOf(x)===ap.id).length<=1,[apps.map(r=>[r.status,r.body?.idempotent||r.body?.error]),st]);
 const ev=q("SELECT COUNT(*) n FROM system_events WHERE type LIKE '%outreach%approv%' AND details_json LIKE ?",[`%${did}%`])[0].n;
 ok("B7 the approval is audited once (no duplicate approval event)",ev<=1,ev);}

// ================= E. security boundaries =================
{const s0=sent().length,bad=[null,{},{update_id:1},{update_id:2,message:{}},{update_id:3,message:{message_id:1,chat:{id:1}}},{update_id:4,message:{message_id:2,from:{id:5},chat:{id:5,type:"private"},text:"x".repeat(50000)}},
  {update_id:5,message:{message_id:3,from:{id:6,is_bot:true},chat:{id:6,type:"private"},text:"bot"}},{update_id:6,edited_message:{message_id:4,from:{id:7},chat:{id:7,type:"private"},text:"edit"}}];
 const codes=[];for(const b of bad){const r=await W.run(new Request("https://w.test/webhooks/telegram",{method:"POST",headers:{"Content-Type":"application/json","X-Telegram-Bot-Api-Secret-Token":"sec"},body:b===null?"{not json":JSON.stringify(b)}));codes.push(r.status);}
 ok("E1 malformed / partial / oversized / bot / edited Telegram payloads never crash the webhook (no 5xx)",codes.every(c=>c<500),codes);
 ok("E2 …and the invalid ones (no sender / bot sender) trigger no customer send (an oversized human message or an unseen edit is a normal message)",sent().slice(s0).every(x=>![1,6].includes(chatOf(x))),sent().slice(s0).map(chatOf));
 const ed=user("edit"),em=++mid;await post(update(ed,"سلام",{messageId:em}));const se=sent().length;
 await post({update_id:++upd,edited_message:{message_id:em,date:Math.floor(Date.now()/1000),edit_date:Math.floor(Date.now()/1000),from:{id:ed.id,is_bot:false,first_name:ed.name},chat:{id:ed.id,type:"private"},text:"سلام، قیمت؟"}});
 ok("E2b editing an already processed message is not processed again (no second inbox row, no second reply)",q("SELECT COUNT(*) n FROM inbox_messages WHERE provider_sender_id=?",[String(ed.id)])[0].n===1&&!sent().slice(se).some(x=>chatOf(x)===ed.id));
 const u=user("sec"),wrong=await W.run(new Request("https://w.test/webhooks/telegram",{method:"POST",headers:{"Content-Type":"application/json","X-Telegram-Bot-Api-Secret-Token":"WRONG"},body:JSON.stringify(update(u,"سلام"))}));
 ok("E3 a webhook with a wrong secret is refused and nothing is stored",wrong.status>=400&&!q("SELECT 1 FROM inbox_messages WHERE provider_sender_id=?",[String(u.id)]).length,wrong.status);
 const anon=async(p,m="POST",body={})=>(await W.run(new Request("https://w.test"+p,{method:m,headers:{"Content-Type":"application/json"},body:m==="GET"?undefined:JSON.stringify(body)}))).status;
 const admin=[["/api/orders/transition","POST",{id:"x",action:"cancel",reason:"r"}],["/api/orders/payments","POST",{order_id:"x"}],["/api/orders/balance-request","POST",{id:"x"}],["/api/revenue/followups/run","POST"],
  ["/api/ads/followups/run","POST"],["/api/ads/followups","GET"],["/api/leads","PATCH",{id:"x",stage:"customer"}],["/api/leads/outreach/transition","POST",{id:"x",action:"approve"}],["/api/autonomy/agents/overview","GET"],
  ["/api/orders","GET"],["/api/quotes","GET"],["/api/si/decisions/resolve","POST",{id:"x",action:"approve"}],["/api/sales-knowledge/review","POST",{id:"x",decision:"approve"}]];
 const res=[];for(const [p,m,b] of admin)res.push([p,await anon(p,m,b)]);
 ok("E4 every owner / admin endpoint refuses an unauthenticated call (401/403)",res.every(([,s])=>s===401||s===403),res.filter(([,s])=>s!==401&&s!==403));
 const bearer=await W.run(new Request("https://w.test/api/orders",{headers:{Authorization:"Bearer tok-wrong"}}));
 ok("E5 a wrong admin token is refused",bearer.status===401||bearer.status===403,bearer.status);
 // cross-customer isolation: customer B never receives customer A's order or name
 const a=user("iso_a"),b=user("iso_b");await send(a,"سلام");setMarket(a,"iran");const ca=convOf(a);mkOrder("ISO-"+a.id,ca.lead_id,ca.conversation_id,"shipped");
 await send(b,"سلام");setMarket(b,"iran");const sb=sent().length;await send(b,"سفارشم کجاست؟ HB-ISO-"+a.id);
 const toB=sent().slice(sb).filter(x=>chatOf(x)===b.id).map(textOf);
 ok("E6 a customer quoting ANOTHER customer's order number gets no data of that order",toB.every(t=>!t.includes("HB-ISO-"+a.id+" ")&&!/shipped|ارسال شد/.test(t)),toB);
 ok("E7 order rows were not mutated by any customer message in this suite",!q("SELECT 1 FROM lead_orders WHERE status='cancelled' OR confirmed_by IS NOT NULL").length&&!q("SELECT 1 FROM lead_order_payments").length);
 const logs=J(q("SELECT details_json,message FROM system_events"))+J(q("SELECT * FROM autonomy_events"));
 ok("E8 no secret appears in any log table (bot token, webhook secret, AI key, admin token)",!/bot-test|test-key-not-real|"sec"|Bearer tok/.test(logs),(logs.match(/.{20}(bot-test|test-key-not-real|Bearer tok).{20}/)||[])[0]);}

// ================= D. local timings (informational, not production figures) =================
{const N=10,users=[...Array(N)].map((_,i)=>user("perf"+i)),h0=process.memoryUsage().heapUsed;const t=Date.now();for(const x of users)await send(x,"سلام");const per=(Date.now()-t)/N;
 const {runWatchdog}=await import("../../worker/src/agent-watchdog.js");const tw=Date.now();await runWatchdog(W.env).catch(()=>null);const wdMs=Date.now()-tw;
 const heapMb=Math.round((process.memoryUsage().heapUsed-h0)/1048576*10)/10;
 console.log(`phase16_5 local timings: inbound+brain ${per.toFixed(0)} ms/msg (n=${N}, mock AI, includes harness ageing), watchdog ${wdMs} ms, heap delta ${heapMb} MB`);
 ok("D1 local inbound handling stays bounded in the mock world (<1500 ms/msg)",per<1500,per);}
ok("Z1 no request left the machine except the in-process mocks",!W.offNet().length,W.offNet());
console.log(`phase16_5 time ${((Date.now()-started)/1000).toFixed(1)} s`);
process.exit(done()?1:0);
