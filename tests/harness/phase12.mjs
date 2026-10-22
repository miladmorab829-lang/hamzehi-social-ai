// PHASE 12.1 — SALES RELIABILITY & REVENUE RECOVERY: content distribution safety (revision-bound approval, atomic claim, unknown
// outcomes, no duplicate retry), revenue follow-ups (3/2/3/30 days, drafts only), currency integrity (IRAN TOMAN / ARAB USD), the
// owner-approved sales autonomy boundaries, and bounded transports. Local only: Telegram, OpenAI and the AI model are in-process
// mocks; every phone / chat id is a fake test value; nothing reaches Production or a real customer.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,J,done}=reporter("phase12");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const CHANNEL="@hb_test_channel";
const W=await makeWorld({aiBrain:"on",extraEnv:{TELEGRAM_CHAT_ID:CHANNEL,OPENAI_API_KEY:"test-openai-not-real",PUBLIC_WORKER_BASE_URL:"https://w.test"}});const {q,dbrun,call,send,setMarket,AI,TG}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
W.env.AUTONOMY_ORCHESTRATOR="on";
const AE=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+"?p12="+Math.random());await AE.autonomyMasterGate(W.env);
const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;
// transport probe: records whether each Telegram request carries an AbortSignal; `hang` makes ONE channel post wait until aborted
// Phase 12.3: `tgMode` makes the NEXT public channel post answer with an ambiguous response ("5xx", "badbody" = unreadable 200,
// "slowbody" = headers then a body that never completes until the 15 s abort); `sends` records every send body that left the worker
const harnessFetch=globalThis.fetch;let signals=[],hang=false,tgMode=null;const sends=[];
globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);
  if(/api\.telegram\.org/.test(s)&&/\/send(Message|Photo|Video)$/.test(s)){signals.push(!!o.signal);sends.push(String(o.body||""));
    if(tgMode&&String(o.body||"").includes(CHANNEL)){const m=tgMode;tgMode=null;
      if(m==="5xx")return new Response("Bad Gateway",{status:502});
      if(m==="badbody")return new Response("<html>proxy error</html>",{status:200});
      if(m==="slowbody"){const keep=setTimeout(()=>{},40000);return new Response(new ReadableStream({start(c){o.signal?.addEventListener("abort",()=>{clearTimeout(keep);c.error(new DOMException("timed out","TimeoutError"));});}}),{status:200,headers:{"Content-Type":"application/json"}});}}
    // AbortSignal.timeout's timer is unref'd in Node: a ref'd keep-alive (cleared on abort) stops the event loop exiting mid-test;
    // without a signal the 40 s keep-alive fails the test instead of hanging it
    if(hang){hang=false;return await new Promise((_,rej)=>{const keep=setTimeout(()=>rej(new Error("no abort signal")),40000);
      o.signal?.addEventListener("abort",()=>{clearTimeout(keep);rej(new DOMException("timed out","TimeoutError"));});});}}
  return harnessFetch(u,o);};
const t0=()=>new Date().toISOString();
const tick=async()=>{const p=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},W.env,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);};
const channelPosts=()=>W.tg.filter(x=>/^send(Message|Photo|Video)$/.test(x.method)&&x.body.includes(CHANNEL));
const dist=(id,target="telegram")=>q("SELECT status,error,external_id FROM content_distribution WHERE content_id=? AND target=?",[id,target])[0]||{};
const mkContent=(id,body)=>dbrun("INSERT INTO contents(id,topic,platform,language,market,content_type,objective,tone,hook,body,caption,cta,hashtags,visual_prompt,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,"t","telegram","fa","IRAN","post","awareness","warm","hook "+id,body,"caption "+id,"cta",null,null,"generated",t0(),t0()]);
const approve=async(id,status="approved")=>{const r=await call("/api/content/approve",{content_id:id,status});dbrun("UPDATE content_distribution SET planned_at=NULL WHERE content_id=?",[id]);dbrun("DELETE FROM calendar WHERE content_id=?",[id]);return r;};

// ================= BLOCK C — content distribution safety =================
{mkContent("C-A","approved text A");const r=await approve("C-A");
 const p0=channelPosts().length;await tick();
 ok("C1 an approved revision is published exactly once to the channel; the approval stores the revision hash; the shared publish run is completed",r.status===200&&dist("C-A").status==="published"&&channelPosts().length===p0+1&&q("SELECT COUNT(*) n FROM content_approval_revisions WHERE content_id='C-A'")[0].n===1&&q("SELECT status FROM production_runs WHERE id='publish:C-A:telegram'")[0]?.status==="completed",[dist("C-A"),channelPosts().length-p0]);
 ok("C2 WhatsApp stays unconnected: its row is manual_required, no WhatsApp request and no retry entry",dist("C-A","whatsapp").status==="manual_required"&&!W.net.some(u=>/graph\.facebook\.com/.test(u))&&q("SELECT COUNT(*) n FROM retry_queue WHERE payload_json LIKE '%C-A%'")[0].n===0,dist("C-A","whatsapp"));
 mkContent("C-B","approved then revoked");await approve("C-B");await call("/api/content/approve",{content_id:"C-B",status:"rejected"});
 const p1=channelPosts().length;await tick();
 ok("C3 approval revoked after queueing: nothing is sent; the row is held (awaiting_approval: approval_not_active)",dist("C-B").status==="awaiting_approval"&&/approval_not_active/.test(dist("C-B").error||"")&&channelPosts().length===p1,dist("C-B"));
 mkContent("C-D","original body");await approve("C-D");dbrun("UPDATE contents SET body='edited after approval' WHERE id='C-D'");
 const p2=channelPosts().length;await tick();
 ok("C4 content edited after approval: blocked (content_changed_since_approval), nothing sent",dist("C-D").status==="awaiting_approval"&&/content_changed_since_approval/.test(dist("C-D").error||"")&&channelPosts().length===p2,dist("C-D"));
 await approve("C-D");const p3=channelPosts().length;await tick();const last=channelPosts().at(-1);
 ok("C5 after the owner re-approves, the EDITED revision (exactly what was approved) is published once",dist("C-D").status==="published"&&channelPosts().length===p3+1&&/edited after approval/.test(last?.body||""),[dist("C-D"),channelPosts().length-p3]);
 mkContent("C-M","media added later");await approve("C-M");
 dbrun("INSERT INTO content_media(id,content_id,source_type,source_id,media_type,media_url,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",["CM-1","C-M","telegram","SRC-X","photo",null,"ready",t0(),t0()]);
 const p4=channelPosts().length;await tick();
 ok("C6 media attached after approval changes the revision: held for a new approval, nothing sent",dist("C-M").status==="awaiting_approval"&&/content_changed_since_approval/.test(dist("C-M").error||"")&&channelPosts().length===p4,dist("C-M"));
 // a legacy approval (written before Phase 12.1, no stored revision) is never auto-published
 mkContent("C-L","legacy approval");dbrun("INSERT INTO approval_queue VALUES(?,?,?,?,?,?)",["AQ-L","C-L","approved","legacy",t0(),t0()]);
 dbrun("INSERT INTO content_distribution(id,content_id,target,status,planned_at,external_id,error,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",["D-L","C-L","telegram","queued",null,null,null,t0(),t0()]);
 const p5=channelPosts().length;await tick();
 ok("C7 a legacy approval without a stored revision is held (approval_revision_missing): historical items are not auto-published",dist("C-L").status==="awaiting_approval"&&/approval_revision_missing/.test(dist("C-L").error||"")&&channelPosts().length===p5,dist("C-L"));
 // concurrent workers
 mkContent("C-E","concurrency");await approve("C-E");const p6=channelPosts().length;await Promise.all([tick(),tick()]);
 ok("C8 two concurrent workers: the content is posted exactly once",dist("C-E").status==="published"&&channelPosts().filter(x=>x.body.includes("concurrency")).length===1&&channelPosts().length===p6+1,[channelPosts().length-p6,dist("C-E")]);
 // a retry entry for an already-published row never re-sends
 const dA=q("SELECT id FROM content_distribution WHERE content_id='C-A' AND target='telegram'")[0].id;
 dbrun("INSERT INTO retry_queue VALUES(?,?,?,?,?,?,?,?,?,?)",["RQ-A","content_distribution",JSON.stringify({distribution_id:dA,content_id:"C-A",target:"telegram"}),0,3,"queued",null,"x",t0(),t0()]);
 const p7=channelPosts().length;await tick();
 ok("C9 a duplicate retry of a published row does not republish (retry completed, no channel post)",channelPosts().length===p7&&q("SELECT status FROM retry_queue WHERE id='RQ-A'")[0].status==="completed"&&dist("C-A").status==="published",q("SELECT status,last_error FROM retry_queue WHERE id='RQ-A'"));
 // definite failure → retry → exactly one successful post
 mkContent("C-F","definite failure");await approve("C-F");TG.before=(m)=>/^send(Message|Photo)$/.test(m)?"reject":null;await tick();TG.before=null;
 const rqF=q("SELECT id,status FROM retry_queue WHERE payload_json LIKE '%\"C-F\"%'");
 ok("C10 a definite provider rejection → failed + one retry entry (retryable)",dist("C-F").status==="failed"&&rqF.length===1&&q("SELECT status FROM production_runs WHERE id='publish:C-F:telegram'")[0]?.status==="failed",[dist("C-F"),rqF]);
 dbrun("UPDATE retry_queue SET next_attempt_at=NULL WHERE id=?",[rqF[0]?.id]);const p8=channelPosts().length;await tick();
 ok("C11 the retry publishes once through the guarded path; a second retry pass sends nothing",dist("C-F").status==="published"&&channelPosts().length===p8+1&&q("SELECT status FROM retry_queue WHERE id=?",[rqF[0]?.id])[0].status==="completed",[dist("C-F"),channelPosts().length-p8]);
 // unknown outcome → never retried blindly
 mkContent("C-G","unknown outcome");await approve("C-G");TG.before=(m)=>/^send(Message|Photo)$/.test(m)?"throw":null;await tick();TG.before=null;
 const g1=W.tg.filter(x=>x.body.includes("unknown outcome")).length;await tick();await tick();
 ok("C12 network error on the public post → manual_required (OUTCOME_UNKNOWN, owner reconciliation; Phase 12.3), run 'stopped', NO retry entry, never re-sent on later ticks",dist("C-G").status==="manual_required"&&/^OUTCOME_UNKNOWN: /.test(dist("C-G").error||"")&&q("SELECT COUNT(*) n FROM system_events WHERE type='content_distribution_outcome_unknown' AND details_json LIKE '%C-G%'")[0].n===1&&q("SELECT status FROM production_runs WHERE id='publish:C-G:telegram'")[0]?.status==="stopped"&&q("SELECT COUNT(*) n FROM retry_queue WHERE payload_json LIKE '%\"C-G\"%'")[0].n===0&&W.tg.filter(x=>x.body.includes("unknown outcome")).length===g1,[dist("C-G"),g1]);
 // a worker that died after starting the send: the stale claim becomes send_unknown, not queued again
 mkContent("C-H","stale claim");await approve("C-H");const old=new Date(Date.now()-20*60000).toISOString();
 dbrun("UPDATE content_distribution SET status='processing',updated_at=? WHERE content_id='C-H' AND target='telegram'",[old]);
 dbrun("INSERT INTO production_runs(id,run_type,status,summary_json,error,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",["publish:C-H:telegram","publish:telegram","started",null,null,old,old]);
 const h0=W.tg.filter(x=>x.body.includes("stale claim")).length;await tick();
 ok("C13 a stale 'processing' row whose send had started becomes manual_required (OUTCOME_UNKNOWN; Phase 12.3) and is not re-sent",dist("C-H").status==="manual_required"&&/^OUTCOME_UNKNOWN: /.test(dist("C-H").error||"")&&W.tg.filter(x=>x.body.includes("stale claim")).length===h0,dist("C-H"));
 // missing destination (G-02): manual_required, no retry loop, nothing sent
 const saved=W.env.TELEGRAM_CHAT_ID;delete W.env.TELEGRAM_CHAT_ID;mkContent("C-J","no destination");await approve("C-J");const pj=W.tg.length;await tick();W.env.TELEGRAM_CHAT_ID=saved;
 ok("C14 no TELEGRAM_CHAT_ID: manual_required (owner-verified destination needed), no retry entry, no Telegram call",dist("C-J").status==="manual_required"&&/TELEGRAM_CHAT_ID/.test(dist("C-J").error||"")&&q("SELECT COUNT(*) n FROM retry_queue WHERE payload_json LIKE '%\"C-J\"%'")[0].n===0&&!W.tg.slice(pj).some(x=>x.body.includes("no destination")),dist("C-J"));
 ok("D1 every channel post carried a bounded AbortSignal",signals.length>0&&signals.every(Boolean),signals);
 mkContent("C-T","hanging provider");await approve("C-T");hang=true;const s0=Date.now();await tick();const took=Date.now()-s0;
 ok("D2 a hanging provider is cut at the 15 s bound → manual_required OUTCOME_UNKNOWN (no blind retry; Phase 12.3), the worker does not hang",dist("C-T").status==="manual_required"&&/^OUTCOME_UNKNOWN: /.test(dist("C-T").error||"")&&took<30000&&q("SELECT COUNT(*) n FROM retry_queue WHERE payload_json LIKE '%\"C-T\"%'")[0].n===0,[dist("C-T"),took]);}

// ================= BLOCK S — owner-approved sales autonomy boundaries (live inbound path) =================
await call("/api/quotes",null,"GET");   // creates the quote / price stores like the dashboard does
dbrun("INSERT INTO commercial_price_items(id,product_key,product_name,sku,market,currency,unit_price_minor,moq,version,active,effective_from,effective_until,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",["PI-1","ring box","علبة خاتم",null,"ARAB","USD",250,50,1,1,null,null,"owner",t0(),t0(),t0()]);
const show=r=>({action:r.action,status:r.draft?.status,by:r.draft?.approved_by||null,msg:String(r.draft?.message||"").slice(0,120)});
{const u={id:705200001,name:"Ali",username:"ali_s"};await send(u,"هلا");setMarket(u,"iraq");
 const pr=await send(u,"بكم علبة الخاتم؟ أريد 100");
 ok("S1 an approved price is sent automatically (owner-approved autonomy): exact approved unit price and total in USD",pr.action==="answer_price"&&pr.draft?.status==="sent"&&pr.draft?.approved_by==="inbound_auto_policy"&&/2\.50/.test(pr.draft.message)&&/250\.00/.test(pr.draft.message),show(pr));
 AI.script.set("نزلها 30% وأوكيه",()=>({requests:["discount"],reply:"تمام، نعطيك خصم 30% والسعر يصير 1.75 دولار للقطعة",facts:{product:"علبة خاتم",quantity:100}}));
 const tg0=W.tg.filter(x=>/^send/.test(x.method)).length,ds=await send(u,"نزلها 30% وأوكيه");
 ok("S2 a discount outside the approved rule is rejected: the AI's 30% / 1.75 is never sent; the reply is held for the owner",ds.draft?.status!=="sent"&&!/1\.75|30%/.test(String(ds.draft?.message||""))&&!W.tg.filter(x=>/^send/.test(x.method)).slice(tg0).some(x=>/1\.75|30%/.test(x.body)),show(ds));
 const ac=await send(u,"تمام موافق، سجل الطلب 100 قطعة");const orders=q("SELECT status FROM lead_orders");
 ok("S3 customer acceptance creates only an order CANDIDATE plus an owner decision; nothing is confirmed automatically; the reply says it is not final",ac.action==="accept_offer"&&orders.length===1&&orders[0].status==="order_candidate"&&q("SELECT COUNT(*) n FROM owner_decisions WHERE decision_type='ORDER_CANDIDATE_APPROVAL' AND status='PENDING'")[0].n===1&&!q("SELECT 1 FROM lead_orders WHERE status IN ('confirmed','paid')").length,[show(ac),orders]);
 const pi=await send(u,"شلون أدفع؟");
 ok("S4 payment information is sent only as the owner-authorized line (no fabricated account / card / phone digits)",pi.draft?.status==="sent"&&!/[0-9]{6,}/.test(String(pi.draft?.message||"")),show(pi));
 const pay0=q("SELECT COUNT(*) n FROM lead_order_payments")[0].n,cl=await send(u,"حولت المبلغ كامل");
 ok("S5 a customer's payment claim never records a payment or changes the order; it goes to the owner (not auto-sent)",q("SELECT COUNT(*) n FROM lead_order_payments")[0].n===pay0&&q("SELECT status FROM lead_orders")[0].status==="order_candidate"&&cl.draft?.status!=="sent",show(cl));
 const oid=q("SELECT id FROM lead_orders")[0].id,noAuth=await W.run(new Request("https://w.test/api/orders/transition",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:oid,action:"confirm"})}));
 ok("S6 final order confirmation is owner-only (the confirm route refuses a request without the owner token)",noAuth.status===401&&q("SELECT status FROM lead_orders WHERE id=?",[oid])[0].status==="order_candidate",noAuth.status);}
{// a discount INSIDE the owner-approved rule is applied automatically
 dbrun("INSERT INTO business_settings(id,setting_key,scope_key,value_json,version,status,approved_by,approved_at,source_decision_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",["BS-D","discount_rule","market:ARAB",JSON.stringify({type:"percent_bp",value:1000,min_quantity:100}),1,"current","owner",t0(),null,t0()]);
 const u={id:705200002,name:"Omar",username:"omar_s"};await send(u,"هلا");setMarket(u,"iraq");const pr=await send(u,"بكم علبة الخاتم؟ أريد 100");
 ok("S7 a discount within the owner-approved rule (10% from 100 pcs) is sent automatically with the grounded total 225.00 USD",pr.draft?.status==="sent"&&/225\.00/.test(pr.draft?.message||"")&&!/250\.00 دولار\.?$/.test(pr.draft?.message||""),show(pr));
 /* business_settings history is append-only (trigger); later blocks use quantities below min_quantity */}

// ================= BLOCK R — revenue follow-ups =================
{const day=86400000,ago=n=>new Date(Date.now()-n*day).toISOString();
 const mkLead=async(u,country)=>{await send(u,"سلام");setMarket(u,country);const r=q("SELECT lead_id,conversation_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(u.id)])[0];return r;};
 const A=await mkLead({id:705300001,name:"A",username:"rev_a"},"iraq"),B=await mkLead({id:705300002,name:"B",username:"rev_b"},"iran"),C=await mkLead({id:705300003,name:"C",username:"rev_c"},"iraq"),T=await mkLead({id:705300004,name:"T",username:"rev_t"},"iran");
 dbrun("UPDATE leads SET notes=json_set(COALESCE(notes,'{}'),'$.data_class','test') WHERE id=?",[T.lead_id]);
 W.age(6*86400);   // every customer message is now 6 days old (no reply after the quotes below)
 const quote=(id,lead,sentDays)=>dbrun("INSERT INTO lead_quotes(id,lead_id,conversation_id,market,currency,product,quantity,unit_price_minor,subtotal_minor,total_minor,status,sent_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,lead.lead_id,lead.conversation_id,"ARAB","USD","علبة خاتم",100,250,25000,25000,"sent",ago(sentDays),ago(sentDays),ago(sentDays)]);
 quote("Q-DUE",A,4);quote("Q-NEW",A,2);
 let n=0;const order=(id,lead,market,currency,status,{confirmedDays=null,deliveredDays=null,total=100000}={})=>dbrun("INSERT INTO lead_orders(id,order_number,quote_id,lead_id,conversation_id,market,product,quantity,currency,unit_price_minor,subtotal_minor,total_minor,payment_terms,status,confirmed_at,delivered_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
   [id,"HB-T-"+(++n),"q-"+id,lead.lead_id,lead.conversation_id,market,"علبة خاتم",100,currency,total/100,total,total,"full",status,confirmedDays===null?null:ago(confirmedDays),deliveredDays===null?null:ago(deliveredDays),ago(40),ago(Math.min(confirmedDays??40,deliveredDays??40))]);
 order("O-UNPAID",B,"IRAN","TOMAN","confirmed",{confirmedDays:3,total:5000000});order("O-FRESH",B,"IRAN","TOMAN","confirmed",{confirmedDays:1,total:5000000});
 order("O-PART",A,"ARAB","USD","partially_paid",{confirmedDays:10,total:100000});
 dbrun("INSERT INTO lead_order_payments(id,order_id,lead_id,payment_kind,amount_minor,currency,method,reference,reference_key,received_at,notes,recorded_by,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",["P-1","O-PART",A.lead_id,"deposit",40000,"USD","exchange_hawala","r1","r1",ago(4),null,"owner",ago(4)]);
 order("O-DONE",C,"ARAB","USD","fulfilled",{confirmedDays:60,deliveredDays:35});
 order("O-TEST",T,"IRAN","TOMAN","confirmed",{confirmedDays:5,total:7000000});
 const hist=J(q("SELECT id,status,total_minor,currency FROM lead_orders ORDER BY id"))+J(q("SELECT * FROM lead_order_payments ORDER BY id"));
 const items=(await call("/api/si/money-at-stake",null,"GET")).body||{};
 ok("R1 detection: unpaid confirmed order ≥2 days (not the 1-day one), open balance ≥3 days (outstanding 600.00 USD), repeat order ≥30 days; outstanding per currency (never summed); the TEST order is excluded from real money and reported separately (Phase 12.3)",
   J((items.orders_awaiting_payment||[]).map(x=>x.ref_id).sort())===J(["O-UNPAID"])&&items.test_records?.followups===1&&items.test_records?.outstanding_by_currency?.TOMAN===7000000&&J((items.partial_balances||[]).map(x=>[x.ref_id,x.outstanding_minor,x.currency]))===J([["O-PART",60000,"USD"]])&&J((items.repeat_opportunities||[]).map(x=>x.ref_id))===J(["O-DONE"])&&items.outstanding_by_currency?.USD===60000&&items.outstanding_by_currency?.TOMAN===5000000,
   [items.orders_awaiting_payment?.map(x=>x.ref_id),items.partial_balances,items.repeat_opportunities?.map(x=>x.ref_id),items.outstanding_by_currency]);
 const tgBefore=W.tg.filter(x=>/^send/.test(x.method)).length,out0=q("SELECT COUNT(*) n FROM lead_outreach")[0].n;
 const run1=(await call("/api/revenue/followups/run",{})).body||{};
 const drafts=q("SELECT lead_id,status,language,message FROM lead_outreach WHERE id LIKE 'sales-draft-%' ORDER BY created_at");
 const qd=drafts.find(d=>d.lead_id===A.lead_id&&/عرض السعر/.test(d.message)),rd=drafts.find(d=>d.lead_id===C.lead_id);
 ok("R2 quote follow-up (3 days) → one Iraqi-Arabic draft for the due quote only; repeat-order (30 days) → one Iraqi-Arabic draft; drafts contain no numbers",!!qd&&qd.language==="Iraqi Arabic"&&!/[0-9]/.test(qd.message)&&!!rd&&rd.language==="Iraqi Arabic"&&!/[0-9]/.test(rd.message)&&run1.by_kind?.quote_no_reply===1,[run1,drafts.map(d=>[d.language,d.message.slice(0,40)])]);
 ok("R3 every follow-up is a DRAFT for owner approval: nothing was sent, sending_enabled is false",W.tg.filter(x=>/^send/.test(x.method)).length===tgBefore&&drafts.every(d=>d.status==="draft")&&run1.sending_enabled===false,[run1.sending_enabled,drafts.map(d=>d.status)]);
 ok("R4 test-marked lead is reported but never drafted; history (orders, payments) is unchanged",run1.test_records===1&&!q("SELECT 1 FROM lead_outreach WHERE lead_id=? AND id LIKE 'sales-draft-%'",[T.lead_id]).length&&J(q("SELECT id,status,total_minor,currency FROM lead_orders ORDER BY id"))+J(q("SELECT * FROM lead_order_payments ORDER BY id"))===hist,run1);
 const out1=q("SELECT COUNT(*) n FROM lead_outreach")[0].n,run2=(await call("/api/revenue/followups/run",{})).body||{};
 ok("R5 running the owner button again creates no duplicate draft",q("SELECT COUNT(*) n FROM lead_outreach")[0].n===out1&&run2.drafts_created===0,[run1.drafts_created,run2.drafts_created,out1-out0]);
 ok("R6 thresholds are the approved ones (3 / 2 / 3 / 30 days)",J((items.orders_awaiting_payment||[]).concat(items.partial_balances||[],items.repeat_opportunities||[]).map(x=>[x.kind,x.threshold_days]).sort())===J([["balance_open",3],["order_unpaid",2],["reorder",30]]),"");}

// ================= BLOCK M — currency integrity =================
{const bad1=await call("/api/commercial-price-items",{market:"ARAB",product_name:"Gift box",product_key:"gift box",currency:"TOMAN",unit_price_minor:100});
 const bad2=await call("/api/commercial-price-items",{market:"IRAN",product_name:"Gift box",product_key:"gift box",currency:"USD",unit_price_minor:100});
 const good=await call("/api/commercial-price-items",{market:"ARAB",product_name:"Gift box",product_key:"gift box",currency:"USD",unit_price_minor:300,moq:10});
 ok("M1 price versions: ARAB (Iraq) must be USD and IRAN must be TOMAN (400 otherwise); a correct ARAB USD price is created",bad1.status===400&&/USD/.test(bad1.body?.error||"")&&bad2.status===400&&good.status===200,[bad1.status,bad2.status,good.status]);
 const L=q("SELECT lead_id,conversation_id FROM inbox_messages LIMIT 1")[0];
 const qrow=(id,market,currency,status="draft",extra={})=>dbrun("INSERT INTO lead_quotes(id,lead_id,conversation_id,market,currency,product,quantity,unit_price_minor,status,pricing_mode,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",[id,L.lead_id,L.conversation_id,market,currency,extra.product||"Gift box",extra.quantity??20,extra.unit??null,status,extra.mode??null,t0(),t0()]);
 qrow("QM-IR","IRAN",null);const e1=await call("/api/quotes",{id:"QM-IR",market:"IRAN",currency:"USD",unit_price_minor:900000},"PATCH");
 ok("M2 owner edit of an IRAN quote to USD is refused (400) and the stored quote is unchanged",e1.status===400&&/TOMAN/.test(e1.body?.error||"")&&q("SELECT currency,unit_price_minor FROM lead_quotes WHERE id='QM-IR'")[0].currency===null,[e1.status,e1.body?.error]);
 const e2=await call("/api/quotes",{id:"QM-IR",market:"IRAN",unit_price_minor:900000},"PATCH");
 ok("M3 an IRAN owner edit without a currency takes the market rule (TOMAN), never another currency",e2.status===200&&q("SELECT currency FROM lead_quotes WHERE id='QM-IR'")[0].currency==="TOMAN",[e2.status,e2.body?.error]);
 qrow("QM-HIST","IRAN","USD");const e3=await call("/api/quotes",{id:"QM-HIST",market:"IRAN",unit_price_minor:900000},"PATCH");
 ok("M4 a historical IRAN quote carrying USD is not silently relabelled: the edit is refused until the owner sets TOMAN explicitly (row preserved)",e3.status===400&&q("SELECT currency FROM lead_quotes WHERE id='QM-HIST'")[0].currency==="USD",[e3.status,e3.body?.error]);
 dbrun("INSERT INTO commercial_price_items(id,product_key,product_name,sku,market,currency,unit_price_minor,moq,version,active,effective_from,effective_until,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",["PI-TOMAN","toman-box","Toman box",null,"ARAB","TOMAN",500000,1,1,1,null,null,"owner",t0(),t0(),t0()]);
 qrow("QM-AR","ARAB",null,"draft",{product:"Toman box"});const e4=await call("/api/quotes",{id:"QM-AR",market:"ARAB",product:"Toman box"},"PATCH");const ar=q("SELECT status,currency,unit_price_minor,price_item_id FROM lead_quotes WHERE id='QM-AR'")[0];
 ok("M5 Iraq quote: a non-USD price row is never used → requires_owner_review, no price or currency copied",e4.status===200&&ar.status==="requires_owner_review"&&ar.price_item_id===null&&ar.unit_price_minor===null&&ar.currency===null,ar);
 qrow("QM-MIX","ARAB","TOMAN","quote_ready",{unit:300,mode:"fixed_list"});const sub=await call("/api/quotes/transition",{id:"QM-MIX",action:"submit"});
 ok("M6 a stored ARAB quote in TOMAN can never pass readiness (currency_market_mismatch) and is not converted",sub.status===409&&/currency_market_mismatch/.test(sub.body?.error||"")&&q("SELECT currency,status FROM lead_quotes WHERE id='QM-MIX'")[0].currency==="TOMAN",[sub.status,sub.body?.error]);
 qrow("QM-UNK",null,null);const e5=await call("/api/quotes",{id:"QM-UNK",product:"Gift box"},"PATCH");
 ok("M7 unknown market: no market and no currency are invented",e5.status===200&&q("SELECT market,currency FROM lead_quotes WHERE id='QM-UNK'")[0].market===null&&q("SELECT currency FROM lead_quotes WHERE id='QM-UNK'")[0].currency===null,[e5.status,q("SELECT market,currency,status FROM lead_quotes WHERE id='QM-UNK'")]);}

// ================= BLOCK X — Phase 12.3 release blockers (A-1, A-2, R-1, R-2, C-1, 90-day lookback) =================
const run=id=>q("SELECT status FROM production_runs WHERE id=?",[id])[0]?.status;
const sentFor=txt=>sends.filter(b=>b.includes(txt)).length;
const pub=(id)=>call("/api/publish",{content_id:id,platform:"telegram"});
const noRetry=id=>q("SELECT COUNT(*) n FROM retry_queue WHERE payload_json LIKE ?",[`%"${id}"%`])[0].n===0;
{// ---- A-1: the exact approved revision, re-checked at the final boundary (queue + calendar publish paths) ----
 mkContent("X-P1","calendar original");await approve("X-P1");dbrun("UPDATE content_distribution SET status='published' WHERE content_id='X-P1'");
 dbrun("UPDATE contents SET body='calendar edited after approval' WHERE id='X-P1'");const p0=sentFor("calendar");const r1=await pub("X-P1");
 ok("X1 calendar publish (/api/publish): content edited after approval is refused (content_changed_since_approval); nothing is sent",r1.body?.ok!==true&&/content_changed_since_approval/.test(r1.body?.error||"")&&sentFor("calendar")===p0,[r1.status,r1.body?.error]);
 mkContent("X-P2","calendar media race");await approve("X-P2");dbrun("UPDATE content_distribution SET status='published' WHERE content_id='X-P2'");
 dbrun("INSERT INTO content_media(id,content_id,source_type,source_id,media_type,media_url,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",["XM-2","X-P2","telegram","SRC-X2","photo",null,"ready",t0(),t0()]);
 const r2=await pub("X-P2");
 ok("X2 calendar publish: media attached after approval is refused; the unapproved photo is never sent",r2.body?.ok!==true&&/content_changed_since_approval/.test(r2.body?.error||"")&&sentFor("SRC-X2")===0,[r2.body?.error]);
 // approval-to-send race: the content is edited / the approval is revoked WHILE the private Ready copy is being sent
 W.env.TELEGRAM_MEDIA_READY_CHAT_ID="-100777000";
 for(const [id,label,mutate] of [["X-R1","edit",()=>dbrun("UPDATE contents SET body='edited mid-send' WHERE id='X-R1'")],["X-R2","revoke",()=>dbrun("INSERT INTO approval_queue VALUES(?,?,?,?,?,?)",["AQ-X-R2","X-R2","rejected","owner",new Date(Date.now()+1000).toISOString(),new Date(Date.now()+1000).toISOString()])]]){
   mkContent(id,"race "+label);dbrun("INSERT INTO content_media(id,content_id,source_type,source_id,media_type,media_url,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",["XM-"+id,id,"telegram","SRC-"+id,"photo",null,"ready",t0(),t0()]);await approve(id);
   let fired=false;TG.after=(m)=>{if(!fired&&/^sendPhoto$/.test(m)){fired=true;mutate();}};const c0=channelPosts().length;await tick();TG.after=null;
   ok(`X3 approval-to-send race (${label} during the Ready copy): the final gate blocks the public post (awaiting_approval), nothing reaches the channel`,fired&&dist(id).status==="awaiting_approval"&&channelPosts().length===c0&&!channelPosts().some(x=>x.body.includes(id)),[fired,dist(id)]);}
 delete W.env.TELEGRAM_MEDIA_READY_CHAT_ID;
 // concurrency: the queue worker and the calendar publish race for the same approved content
 mkContent("X-C","concurrent paths");await approve("X-C");const cc=sentFor("concurrent paths");
 const [,rc]=await Promise.all([tick(),pub("X-C")]);await tick();
 ok("X4 queue tick + calendar publish at the same time (+ a later tick): the content reaches the channel exactly once",sentFor("concurrent paths")-cc===1&&run("publish:X-C:telegram")==="completed",[sentFor("concurrent paths")-cc,run("publish:X-C:telegram"),dist("X-C"),rc.body?.error||"ok"]);}
{// ---- A-2: ambiguous outcomes after dispatch are UNKNOWN (manual_required), never retried blindly ----
 for(const [id,mode] of [["X-5","5xx"],["X-B","badbody"],["X-S","slowbody"]]){
   mkContent(id,"ambiguous "+mode);await approve(id);tgMode=mode;await tick();tgMode=null;const n1=sentFor("ambiguous "+mode);await tick();await tick();
   ok(`X5 queue: ${mode==="5xx"?"HTTP 502":mode==="badbody"?"unreadable 200 response":"body timeout after headers"} → manual_required OUTCOME_UNKNOWN, run 'stopped', no retry entry, no second send on later ticks`,dist(id).status==="manual_required"&&/^OUTCOME_UNKNOWN: /.test(dist(id).error||"")&&run(`publish:${id}:telegram`)==="stopped"&&noRetry(id)&&n1===1&&sentFor("ambiguous "+mode)===1,[dist(id),run(`publish:${id}:telegram`),n1,sentFor("ambiguous "+mode)]);}
 // the post went out but recording it failed (simulated D1 error on the completion write)
 mkContent("X-D","db failure after send");await approve("X-D");
 W.d1.db.exec("CREATE TRIGGER x_fail_complete BEFORE UPDATE OF status ON production_runs WHEN NEW.status='completed' AND NEW.id='publish:X-D:telegram' BEGIN SELECT RAISE(ABORT,'simulated D1 failure'); END;");
 await tick();W.d1.db.exec("DROP TRIGGER x_fail_complete");const d1=sentFor("db failure after send");await tick();await tick();
 ok("X6 DB failure after a successful send: manual_required with an auditable 'could not be recorded' reason, run never 'failed', no retry, never re-posted",dist("X-D").status==="manual_required"&&/could not be recorded/.test(dist("X-D").error||"")&&run("publish:X-D:telegram")==="stopped"&&noRetry("X-D")&&d1===1&&sentFor("db failure after send")===1,[dist("X-D"),run("publish:X-D:telegram"),d1]);
 // calendar path: before 12.3 PublishOutcomeUnknown was undefined (ReferenceError → 'failed' → retry → duplicate)
 for(const [id,how] of [["X-N","network"],["X-G","5xx"]]){
   mkContent(id,"calendar ambiguous "+how);await approve(id);dbrun("UPDATE content_distribution SET status='published' WHERE content_id=?",[id]);
   if(how==="network")TG.before=(m)=>/^sendMessage$/.test(m)?"throw":null;else tgMode="5xx";
   const a=await pub(id);TG.before=null;tgMode=null;const b2=await pub(id);
   ok(`X7 calendar publish (${how}): unknown outcome → run 'stopped' (not 'failed'), a second publish is refused, sent once`,a.body?.ok!==true&&run(`publish:${id}:telegram`)==="stopped"&&b2.body?.ok!==true&&/outcome unknown/i.test(b2.body?.error||"")&&sentFor("calendar ambiguous "+how)===1,[a.body?.error,run(`publish:${id}:telegram`),b2.body?.error]);}
 const rec=await call("/api/production/reconcile",{id:"publish:X-N:telegram",action:"confirm_published"}),again=await pub("X-N");
 ok("X8 recovery preserved: the owner confirms the unknown publish (reconcile) → completed; a later publish is idempotent and sends nothing",rec.status===200&&run("publish:X-N:telegram")==="completed"&&again.body?.ok===true&&again.body.results?.[0]?.already_published===true&&sentFor("calendar ambiguous network")===1,[rec.status,again.body]);
 mkContent("X-4","definite rejection");await approve("X-4");TG.before=(m)=>/^sendMessage$/.test(m)?"reject":null;await tick();TG.before=null;
 ok("X9 a definite 4xx rejection is still a 'failed' + one retry entry (only explicit rejections are retryable)",dist("X-4").status==="failed"&&!noRetry("X-4")&&run("publish:X-4:telegram")==="failed",[dist("X-4"),run("publish:X-4:telegram")]);}
{// ---- R-1 / R-2 / lookback ----
 const day=86400000,ago=n=>new Date(Date.now()-n*day).toISOString();
 const mk=async(id,country)=>{const u={id,name:"L"+id,username:"lx"+id};await send(u,"سلام");setMarket(u,country);const r=q("SELECT lead_id,conversation_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(id)])[0];dbrun("UPDATE inbox_messages SET created_at=? WHERE lead_id=?",[ago(200),r.lead_id]);return r;};
 const M=await mk(705400001,"iraq"),O=await mk(705400002,"iraq"),T2=await mk(705400003,"iraq");
 dbrun("UPDATE leads SET notes='{broken json' WHERE id=?",[M.lead_id]);dbrun("UPDATE leads SET notes=json_set(COALESCE(notes,'{}'),'$.is_test',json('true')) WHERE id=?",[T2.lead_id]);
 let k=0;const order=(id,L,days,total)=>dbrun("INSERT INTO lead_orders(id,order_number,quote_id,lead_id,conversation_id,market,product,quantity,currency,unit_price_minor,subtotal_minor,total_minor,payment_terms,status,confirmed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,"HB-X-"+(++k),"qx-"+id,L.lead_id,L.conversation_id,"ARAB","علبة خاتم",100,"USD",total/100,total,total,"full","confirmed",ago(days),ago(days),ago(days)]);
 order("O-MAL",M,3,11100);order("O-OLD",O,100,22200);order("O-T2",T2,3,33300);
 const quote=(id,L,days,status="sent",total=25000)=>dbrun("INSERT INTO lead_quotes(id,lead_id,conversation_id,market,currency,product,quantity,unit_price_minor,subtotal_minor,total_minor,status,sent_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,L.lead_id,L.conversation_id,"ARAB","USD","علبة خاتم",100,250,total,total,status,status==="sent"?ago(days):null,ago(days),ago(days)]);
 quote("Q-OLD",O,120);quote("Q-RECENT",O,4);quote("Q-TESTREADY",T2,1,"quote_ready",9999900);
 const ms=await call("/api/si/money-at-stake",null,"GET"),m=ms.body||{};
 const ids=(m.orders_awaiting_payment||[]).map(x=>x.ref_id),mal=(m.orders_awaiting_payment||[]).find(x=>x.ref_id==="O-MAL");
 ok("X10 R-2 a lead with malformed notes JSON does not break money-at-stake (200); its order is listed, flagged lead_notes_invalid, owner-only",ms.status===200&&!!mal&&mal.data_quality==="lead_notes_invalid"&&mal.audience==="owner"&&m.data_quality?.lead_notes_invalid>=1,[ms.status,mal,m.data_quality]);
 ok("X11 R-1 test records (is_test lead: unpaid order + 99,999 USD quote) are excluded from every real-money total and reported separately",!ids.includes("O-T2")&&!(m.quotes_awaiting_owner||[]).some(x=>x.id==="Q-TESTREADY")&&!((m.quote_value_by_currency?.USD||0)>=9999900)&&m.test_records?.quotes>=1&&m.test_records?.outstanding_by_currency?.USD>=33300&&!(m.stalled_commercial||[]).some(x=>x.ref_id==="O-T2"),[ids,m.quote_value_by_currency,m.test_records]);
 ok("X12 detection for reports is not limited by the lookback: the 100-day unpaid order still counts as real money at stake",ids.includes("O-OLD")&&(m.outstanding_by_currency?.USD||0)>=22200+11100,[ids,m.outstanding_by_currency]);
 const ev0=q("SELECT COUNT(*) n FROM system_events WHERE type='revenue_followup_data_quality'")[0].n,rr=await call("/api/revenue/followups/run",{}),r=rr.body||{};
 const has=key=>q("SELECT COUNT(*) n FROM system_events WHERE id LIKE ?",[`%${key}%`])[0].n>0;
 const dqe=q("SELECT details_json FROM system_events WHERE type='revenue_followup_data_quality' ORDER BY rowid DESC LIMIT 1")[0];const dqd=dqe?JSON.parse(dqe.details_json):{};
 ok("X13 R-2 the follow-up run completes (200) despite the malformed record: it is skipped for drafting, counted, and ONE bounded diagnostic (≤ 20 lead ids) is audited",rr.status===200&&r.data_quality_issues>=1&&!q("SELECT 1 FROM lead_outreach WHERE lead_id=? AND id LIKE 'sales-draft-%'",[M.lead_id]).length&&q("SELECT COUNT(*) n FROM system_events WHERE type='revenue_followup_data_quality'")[0].n===ev0+1&&Array.isArray(dqd.lead_ids)&&dqd.lead_ids.length<=20&&dqd.lead_ids.includes(M.lead_id),[rr.status,r,dqd]);
 ok("X14 90-day lookback for NEW follow-ups only: the 4-day quote gets a draft, the 120-day quote and the 100-day unpaid order get none; thresholds unchanged (3/2/3/30)",r.lookback_days===90&&has("revenue-followup:quote_no_reply:Q-RECENT")&&!has("revenue-followup:quote_no_reply:Q-OLD")&&!q("SELECT 1 FROM owner_decisions WHERE order_id='O-OLD'").length&&!q("SELECT 1 FROM lead_outreach WHERE lead_id=? AND message LIKE '%HB-X-2%'",[O.lead_id]).length,[r.by_kind,has("Q-RECENT"),has("Q-OLD")]);
 ok("X15 drafts only: no Telegram message to any customer from the follow-up run; sending_enabled false",r.sending_enabled===false&&!q("SELECT 1 FROM lead_outreach WHERE status<>'draft' AND id LIKE 'sales-draft-%'").length,r.sending_enabled);
 ok("X16 history unchanged: no order or quote was deleted or rewritten by detection",q("SELECT COUNT(*) n FROM lead_orders WHERE id IN ('O-MAL','O-OLD','O-T2') AND status='confirmed'")[0].n===3&&q("SELECT COUNT(*) n FROM lead_quotes WHERE id IN ('Q-OLD','Q-RECENT') AND status='sent'")[0].n===2,"");}
{// ---- C-1: stored amounts are never relabelled to another currency ----
 const L=q("SELECT lead_id,conversation_id FROM inbox_messages LIMIT 1")[0];
 const qx=(id,market,currency,unit,extra={})=>dbrun("INSERT INTO lead_quotes(id,lead_id,conversation_id,market,currency,product,quantity,unit_price_minor,discount_minor,shipping_minor,status,pricing_mode,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,L.lead_id,L.conversation_id,market,currency,extra.product||"Gift box",20,unit,extra.discount??null,extra.shipping??null,"draft",null,t0(),t0()]);
 const row=id=>q("SELECT market,currency,unit_price_minor,discount_minor,shipping_minor FROM lead_quotes WHERE id=?",[id])[0];
 const patch=b=>call("/api/quotes",b,"PATCH");
 qx("QX-1","IRAN","USD",1000);const before=J(row("QX-1"));
 const a1=await patch({id:"QX-1",market:"IRAN",currency:""}),a2=await patch({id:"QX-1",market:"IRAN",currency:null}),a3=await patch({id:"QX-1",market:"IRAN",currency:"TOMAN"});
 ok("X17 C-1 historical USD quote: currency '' / null / bare 'TOMAN' without re-entered amounts are all refused (400); amounts and currency unchanged",[a1,a2,a3].every(x=>x.status===400)&&J(row("QX-1"))===before,[a1.body?.error,a2.body?.error,a3.body?.error,row("QX-1")]);
 ok("X18 C-1 every refused relabel is audited for the owner (quote_currency_change_refused)",q("SELECT COUNT(*) n FROM system_events WHERE type='quote_currency_change_refused' AND details_json LIKE '%QX-1%'")[0].n===3,"");
 const a4=await patch({id:"QX-1",market:"IRAN",currency:"TOMAN",unit_price_minor:900000});
 ok("X19 C-1 an explicit owner conversion (currency TOMAN + re-entered TOMAN amount) is accepted",a4.status===200&&row("QX-1").currency==="TOMAN"&&row("QX-1").unit_price_minor===900000,[a4.status,a4.body?.error,row("QX-1")]);
 qx("QX-2","ARAB","USD",300,{shipping:500});const b2=J(row("QX-2"));
 const c1=await patch({id:"QX-2",market:"IRAN",currency:"TOMAN",unit_price_minor:800000});
 ok("X20 C-1 market switch ARAB→IRAN keeping a USD shipping fee is refused (fee would be relabelled TOMAN); row unchanged",c1.status===400&&/shipping_minor/.test(c1.body?.error||"")&&J(row("QX-2"))===b2,[c1.status,c1.body?.error]);
 const c2=await patch({id:"QX-2",market:"IRAN",currency:"TOMAN",unit_price_minor:800000,shipping_minor:200000});
 ok("X21 C-1 the same switch with every amount re-entered in TOMAN is accepted",c2.status===200&&J(row("QX-2"))===J({market:"IRAN",currency:"TOMAN",unit_price_minor:800000,discount_minor:null,shipping_minor:200000}),[c2.status,c2.body?.error,row("QX-2")]);
 qx("QX-3","IRAN","TOMAN",900000,{discount:50000});const b3=J(row("QX-3"));
 const d1=await patch({id:"QX-3",market:"ARAB",product:"Gift box"});
 ok("X22 C-1 market switch IRAN→ARAB (approved USD price row) keeping a TOMAN discount is refused without currency=USD and a re-entered discount; row unchanged",d1.status===400&&J(row("QX-3"))===b3,[d1.status,d1.body?.error]);
 const d2=await patch({id:"QX-3",market:"ARAB",product:"Gift box",currency:"USD",discount_minor:0});
 ok("X23 C-1 with currency=USD named and the discount re-entered, the quote takes the approved USD price (300) — nothing converted",d2.status===200&&row("QX-3").currency==="USD"&&row("QX-3").unit_price_minor===300&&row("QX-3").discount_minor===0,[d2.status,d2.body?.error,row("QX-3")]);}

ok("ISOLATION only in-process mocks were called (Telegram, AI model, OpenAI, worker self-calls)",W.offNet().every(u=>/api\.telegram\.org|api\.anthropic\.com|api\.openai\.com|w\.test/.test(u)),W.offNet().filter(u=>!/api\.telegram\.org|api\.anthropic\.com|api\.openai\.com|w\.test/.test(u)).slice(0,5));
process.exit(done()?1:0);
