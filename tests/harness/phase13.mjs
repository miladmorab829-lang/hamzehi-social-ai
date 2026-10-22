// PHASE 13.1 — Owner Action Center: one read-only, prioritized queue of everything waiting on the owner (escalations, decisions,
// order candidates, unpaid / partial orders, owner-wait and unanswered quotes, message drafts, quiet conversations, reorders, high-priority
// leads). Checks: aggregation + dedupe, deterministic P0–P3, REAL / TEST / UNKNOWN money separation, IRAN-TOMAN / ARAB-USD integrity,
// owner-only access, NO side effects (no write, no send), stable sort + pagination, filters, empty / error states, bounded cost, UI.
// Local only: fixtures are inserted straight into the in-memory D1; nothing reaches Production or a customer.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,J,done}=reporter("phase13");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const DAY=86400000,ago=(d,h=0)=>new Date(Date.now()-d*DAY-h*3600000).toISOString();
const ensureStores=async W=>{for(const p of ["/api/owner-escalations","/api/si/decisions?status=PENDING","/api/quotes","/api/orders"])await W.call(p,null,"GET");};
// insert with every NOT NULL column filled (fixture values win); keeps fixtures independent of unrelated columns
const insert=(W,table,row)=>{const cols=W.q(`SELECT name,"notnull" nn,dflt_value d,type FROM pragma_table_info('${table}')`);const r={...row};
  for(const c of cols)if(r[c.name]===undefined&&c.nn&&c.d===null)r[c.name]=/INT/i.test(c.type)?0:(c.name.endsWith("_at")?ago(0):c.name==="fingerprint"?"fp-"+Math.random():"x");
  const k=Object.keys(r).filter(n=>cols.some(c=>c.name===n));W.dbrun(`INSERT INTO ${table}(${k.join(",")}) VALUES(${k.map(()=>"?").join(",")})`,k.map(n=>r[n]));};
const lead=(W,id,{notes={},stage="negotiation",priority="normal",at=ago(30)}={})=>insert(W,"leads",{id,name:"Lead "+id,contact:"c-"+id,stage,priority,notes:typeof notes==="string"?notes:JSON.stringify(notes),created_at:at,updated_at:at});
const inbox=(W,id,leadId,at)=>insert(W,"inbox_messages",{id,platform:"telegram",external_id:id,sender:"s",message:"m",category:"sales",priority:"normal",status:"new",created_at:at,updated_at:at,lead_id:leadId,conversation_id:"conv-"+leadId,provider_sender_id:"ps-"+leadId});
const outreach=(W,id,leadId,status,at,language="Persian")=>insert(W,"lead_outreach",{id,lead_id:leadId,conversation_id:"conv-"+leadId,channel:"telegram",recipient:"r",message:"m",language,status,sent_at:status==="sent"||status==="delivered"?at:null,created_at:at,updated_at:at});
const order=(W,id,leadId,market,currency,status,total,{created=ago(20),accepted=null,confirmed=null,delivered=null}={})=>insert(W,"lead_orders",{id,order_number:"HB-"+id,quote_id:"q-"+id,lead_id:leadId,conversation_id:"conv-"+leadId,market,product:"box",quantity:100,currency,unit_price_minor:Math.round(total/100),subtotal_minor:total,total_minor:total,status,customer_accepted_at:accepted,confirmed_at:confirmed,delivered_at:delivered,created_at:created,updated_at:confirmed||created});
const pay=(W,id,orderId,leadId,amount,currency,at)=>insert(W,"lead_order_payments",{id,order_id:orderId,lead_id:leadId,payment_kind:"partial",amount_minor:amount,currency,method:"exchange_hawala",reference:id,reference_key:id,received_at:at,recorded_by:"owner",recorded_at:at});
const quote=(W,id,leadId,market,currency,status,total,{at=ago(5),sent=null}={})=>insert(W,"lead_quotes",{id,lead_id:leadId,conversation_id:"conv-"+leadId,market,currency,product:"box",quantity:100,total_minor:total,status,sent_at:sent,created_at:at,updated_at:at});
const esc=(W,id,leadId,reason,at)=>insert(W,"owner_escalations",{id,escalation_key:"k-"+id,lead_id:leadId,conversation_id:"conv-"+leadId,channel:"telegram",reason_code:reason,status:"open",version:1,created_at:at,updated_at:at});
const dec=(W,id,type,{lead=null,order=null,escalation=null,market=null,at=ago(1)}={})=>insert(W,"owner_decisions",{id,status:"PENDING",priority:20,decision_type:type,fingerprint:"fp-"+id,lead_id:lead,market,order_id:order,owner_escalation_id:escalation,created_at:at,updated_at:at});
const AC=(W,qs="")=>W.call("/api/owner/action-center"+(qs?"?"+qs:""),null,"GET");

// ================= world with a full fixture set =================
const W=await makeWorld({});await ensureStores(W);
lead(W,"L-REAL",{notes:{data_class:"real",country:"العراق"}});lead(W,"L-TEST",{notes:{is_test:true}});lead(W,"L-UNK",{notes:{country:"العراق"}});
lead(W,"L-WAIT",{notes:{country:"ایران"}});lead(W,"L-QUIET");lead(W,"L-FRESH");lead(W,"L-HIGH",{priority:"high",notes:{discovered_at:ago(20)}});lead(W,"L-RE",{stage:"customer"});lead(W,"L-BAD",{notes:"{not json"});
// A: escalation + its mirrored decision (one item), two knowledge escalations (fresh / 8 days), payment claim, learning rules
esc(W,"E1","L-UNK","unsupported_price",ago(10));dec(W,"D-E1","ESCALATION_UNSUPPORTED_PRICE",{lead:"L-UNK",escalation:"E1",market:"ARAB",at:ago(10)});
esc(W,"E2","L-REAL","missing_business_knowledge",ago(2));esc(W,"E3","L-REAL","missing_business_knowledge",ago(8));
dec(W,"D-PAY","PAYMENT_VERIFICATION",{lead:"L-REAL",market:"ARAB",at:ago(0,2)});
dec(W,"D-LR-OLD","LEARNING_RULE",{at:ago(20)});dec(W,"D-LR-NEW","LEARNING_RULE",{at:ago(3)});
// B: candidate (+ its decision), unpaid 15 d (UNKNOWN, ARAB), unpaid 1 d (REAL, IRAN), partial (REAL), test unpaid, paid w/o payments, healthy paid
order(W,"O1","L-REAL","ARAB","USD","order_candidate",26500,{accepted:ago(1,3)});dec(W,"D-O1","ORDER_CANDIDATE_APPROVAL",{lead:"L-REAL",order:"O1",market:"ARAB",at:ago(1,3)});
order(W,"O2","L-UNK","ARAB","USD","confirmed",26500,{confirmed:ago(15)});
order(W,"O3","L-REAL","IRAN","TOMAN","confirmed",5000000,{confirmed:ago(1)});
order(W,"O4","L-REAL","IRAN","TOMAN","partially_paid",1000000,{confirmed:ago(10)});pay(W,"P4","O4","L-REAL",400000,"TOMAN",ago(5));
order(W,"O5","L-TEST","IRAN","TOMAN","confirmed",7000000,{confirmed:ago(5)});
order(W,"O6","L-REAL","IRAN","TOMAN","paid",2000000,{confirmed:ago(9)});
order(W,"O7","L-REAL","IRAN","TOMAN","paid",3000000,{confirmed:ago(9)});pay(W,"P7","O7","L-REAL",3000000,"TOMAN",ago(8));
order(W,"O8","L-RE","ARAB","USD","fulfilled",50000,{confirmed:ago(60),delivered:ago(40),created:ago(61)});pay(W,"P8","O8","L-RE",50000,"USD",ago(45));
// quotes: owner price wait (P1) and a sent quote without reply (3+ days)
inbox(W,"I-UNK-1","L-UNK",ago(9));quote(W,"Q1","L-UNK","IRAN","TOMAN","waiting_for_owner_price",null,{at:ago(4)});quote(W,"Q2","L-UNK","ARAB","USD","sent",30000,{at:ago(6),sent:ago(5)});
// C: 3 held replies for one lead (one item), one follow-up draft (separate item)
for(const i of [1,2,3])outreach(W,"R-"+i,"L-WAIT","draft",ago(6-i));outreach(W,"sales-draft-X","L-REAL","draft",ago(1),"Iraqi Arabic");
// conversations: unanswered (customer wrote last), quiet negotiation (5 d), fresh answered (no item), malformed notes lead (unanswered)
inbox(W,"I-Q","L-QUIET",ago(6));outreach(W,"S-Q","L-QUIET","sent",ago(5));
inbox(W,"I-F","L-FRESH",ago(1,2));outreach(W,"S-F","L-FRESH","sent",ago(1));
inbox(W,"I-B1","L-BAD",ago(4));outreach(W,"S-B","L-BAD","sent",ago(4,-1));inbox(W,"I-B2","L-BAD",ago(2));

const snap=()=>J({tables:W.q("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map(t=>[t.name,W.q(`SELECT COUNT(*) n FROM "${t.name}"`)[0].n])})+"|"+W.tg.length;
const before=snap(),r0=await AC(W,"limit=100"),d=r0.body||{},items=d.items||[],by=Object.fromEntries(items.map(x=>[x.key,x]));
ok("A1 the queue answers (200, read_only) and every source is readable",r0.status===200&&d.ok===true&&d.read_only===true&&Object.values(d.sources||{}).every(s=>s.ok),[r0.status,d.sources]);
ok("A2 dedupe: an escalation and its mirrored owner decision are ONE item (decision attached as related); keys are unique",!!by["escalation:E1"]&&!by["decision:D-E1"]&&by["escalation:E1"].related.some(x=>x.id==="D-E1")&&new Set(items.map(x=>x.key)).size===items.length,by["escalation:E1"]);
ok("A3 dedupe: an order candidate and its ORDER_CANDIDATE_APPROVAL decision are ONE order item",!!by["order:O1"]&&!by["decision:D-O1"]&&by["order:O1"].related.some(x=>x.id==="D-O1"),by["order:O1"]);
ok("A4 three unsent drafts of one lead are ONE 'awaiting owner approval' item (count 3, not a reply: no customer message); the follow-up draft is its own item",by["outreach:awaiting_owner_approval:L-WAIT"]?.count===3&&/پیام تماس/.test(by["outreach:awaiting_owner_approval:L-WAIT"]?.next_action||"")&&/پیگیری/.test(by["outreach:awaiting_owner_approval:L-REAL"]?.next_action||""),[by["outreach:awaiting_owner_approval:L-WAIT"]?.count,!!by["followup_draft:L-REAL"]]);
const want={"decision:D-PAY":"P0","integrity:O6":"P0","order:O1":"P1","escalation:E1":"P1","order:O2":"P1","order:O4":"P1","quote:Q1":"P1","escalation:E3":"P1","order:O3":"P2","escalation:E2":"P2",
  "quote_no_reply:Q2":"P2","outreach:awaiting_owner_approval:L-WAIT":"P2","outreach:awaiting_owner_approval:L-REAL":"P2","conversation:L-QUIET":"P2","decision:D-LR-OLD":"P2","decision:D-LR-NEW":"P3","reorder:O8":"P3","lead:L-HIGH":"P3","order:O5":"P3"};
const wrong=Object.entries(want).filter(([k,p])=>by[k]?.priority!==p).map(([k,p])=>[k,p,by[k]?.priority||"missing"]);
ok("P1 deterministic priorities: payment claim / payment integrity P0; candidate, pricing, overdue payment P1; age bumps P2≥7d→P1 and P3≥14d→P2; TEST always P3",!wrong.length,wrong);
ok("P2 an unanswered customer message (customer wrote last) is P1; a quiet negotiation is P2; an answered fresh conversation is not listed",by["conversation:L-BAD"]?.kind==="customer_waiting"&&by["conversation:L-BAD"].priority==="P1"&&by["conversation:L-QUIET"]?.kind==="stalled_negotiation"&&!by["conversation:L-FRESH"],[by["conversation:L-BAD"],by["conversation:L-QUIET"]?.kind]);
ok("P3 a healthy paid order (payments = total) is not an action; a lead with an open item is not double-listed as a conversation",!by["order:O7"]&&!by["integrity:O7"]&&!by["conversation:L-REAL"]&&!by["conversation:L-UNK"]&&!by["conversation:L-WAIT"],"");
ok("C1 REAL / TEST / UNKNOWN come only from evidence: data_class real → REAL, is_test → TEST, nothing / malformed notes → UNKNOWN",by["order:O3"].classification==="REAL"&&by["order:O5"].classification==="TEST"&&by["order:O2"].classification==="UNKNOWN"&&by["conversation:L-BAD"].classification==="UNKNOWN",[by["order:O3"].classification,by["order:O5"].classification,by["order:O2"].classification]);
const mo=d.summary?.money_outstanding||{};
ok("C2 money: verified only from REAL records (TOMAN 5,000,000 + 600,000), UNKNOWN reported separately as unverified (USD 26,500), TEST apart (TOMAN 7,000,000); never summed across currencies",
  J(mo.verified_by_currency)===J({TOMAN:5600000})&&J(mo.unverified_by_currency)===J({USD:26500})&&J(mo.test_by_currency)===J({TOMAN:7000000}),mo);
ok("C3 currency integrity: every IRAN money item is TOMAN, every ARAB money item is USD; items without a record currency carry none (nothing invented)",
  items.filter(x=>x.currency).every(x=>(x.market==="IRAN"&&x.currency==="TOMAN")||(x.market==="ARAB"&&x.currency==="USD"))&&by["escalation:E1"].currency===null&&by["lead:L-HIGH"].currency===null,items.filter(x=>x.currency).map(x=>[x.key,x.market,x.currency]));
ok("C4 amounts come only from the record: outstanding = total − payments (O4 600,000), unpaid = total (O2 26,500), quote = its total (Q2 30,000)",by["order:O4"].amount_minor===600000&&by["order:O2"].amount_minor===26500&&by["quote_no_reply:Q2"].amount_minor===30000,"");
ok("C5 no customer personal data in the response (no names, contacts or message text)",!/Lead L-|c-L-|"message"|"contact"|"name"/.test(J(d)),"");
// access + side effects
const noAuth=await W.run(new Request("https://w.test/api/owner/action-center",{method:"GET"}));
ok("S1 owner-only: no token → 401; invalid filter values → 400",noAuth.status===401&&(await AC(W,"priority=P9")).status===400&&(await AC(W,"market=MARS")).status===400,noAuth.status);
for(let i=0;i<5;i++)await AC(W,"priority=P1");
ok("S2 no side effects: after 7 calls every table row count is identical and no Telegram call / customer message was made",snap()===before,"");
ok("S3 the code path has no write / send: the module contains no INSERT / UPDATE / DELETE / CREATE / fetch",(()=>{const src=require_src();return !/\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/.test(src.replace(/\/\/.*$/mg,""))&&!/\bfetch\(/.test(src);})(),"");
// sorting + pagination + filters
const r1=(await AC(W,"limit=100")).body.items.map(x=>x.key),pages=[];for(let off=0;off<r1.length;off+=4)pages.push(...(await AC(W,`limit=4&offset=${off}`)).body.items.map(x=>x.key));
const rank=x=>["P0","P1","P2","P3"].indexOf(x.priority),mono=items.every((x,i)=>!i||rank(items[i-1])<rank(x)||(rank(items[i-1])===rank(x)&&(items[i-1].age_days??-1)>=(x.age_days??-1)));
ok("O1 stable sort: identical order on repeat calls; priority ascending, oldest first inside a priority",J(r1)===J(items.map(x=>x.key))&&mono,"");
ok("O2 pagination: pages of 4 concatenate to exactly the full list (no gap, no duplicate)",J(pages)===J(r1),[pages.length,r1.length]);
const fP=(await AC(W,"priority=P1&limit=100")).body,fC=(await AC(W,"category=payment&limit=100")).body,fM=(await AC(W,"market=ARAB&limit=100")).body,fS=(await AC(W,"status=draft&limit=100")).body;
ok("O3 filters: priority / category / market / status each return only matching items, and the summary still covers everything",fP.items.every(x=>x.priority==="P1")&&fP.total_filtered===items.filter(x=>x.priority==="P1").length&&fC.items.every(x=>x.category==="payment")&&fM.items.every(x=>x.market==="ARAB")&&fS.items.every(x=>x.status==="draft")&&fS.total_filtered===2&&fP.summary.total===items.length,[fP.total_filtered,fC.total_filtered,fM.total_filtered,fS.total_filtered]);
ok("O4 summary counts match the items (total, P0/P1/P2/P3)",d.summary.total===items.length&&["P0","P1","P2","P3"].every(p=>d.summary.by_priority[p]===items.filter(x=>x.priority===p).length),d.summary.by_priority);

// ================= empty + error states =================
const E=await makeWorld({});await ensureStores(E);const e0=(await AC(E)).body;
ok("E1 empty state: no records → ok, total 0, no items",e0.ok===true&&e0.summary.total===0&&e0.items.length===0,e0.summary);
const F=await makeWorld({});F.d1.db.exec("DROP TABLE IF EXISTS owner_escalations");const hadEsc=()=>F.q("SELECT COUNT(*) n FROM sqlite_master WHERE name='owner_escalations'")[0].n;const esc0=hadEsc(),f0=await AC(F);
ok("E2 error state: a missing table is reported as an unavailable source (200, other sources still served) and is NOT created by the read",f0.status===200&&f0.body.ok===true&&(esc0?true:f0.body.sources.owner_escalations?.ok===false)&&hadEsc()===esc0,[esc0,f0.body.sources]);

// ================= bounded cost =================
const B=await makeWorld({});await ensureStores(B);
B.d1.db.exec("BEGIN");for(let i=0;i<2000;i++){lead(B,"BL-"+i,{priority:i%7?"normal":"high"});if(i%2===0){inbox(B,"BI-"+i,"BL-"+i,ago(5));inbox(B,"BJ-"+i,"BL-"+i,ago(4));}if(i%3===0)outreach(B,"BD-"+i,"BL-"+i,"draft",ago(3));if(i%4===0)esc(B,"BE-"+i,"BL-"+i,"unclear_moq",ago(i%30));}B.d1.db.exec("COMMIT");
const t0=Date.now(),b0=(await AC(B,"limit=100")).body,took=Date.now()-t0;
ok("B1 bounded: 2,000 leads / 2,000 messages / 667 drafts / 500 escalations — one call answers fast and every source read is capped at 200 rows and truncation is MEASURED (escalations 200 of 500 → incomplete; orders complete)",b0.ok&&took<3000&&Object.values(b0.sources).every(s=>s.count<=200)&&b0.sources.owner_escalations.total===500&&b0.sources.owner_escalations.complete===false&&b0.sources.lead_orders.complete===true&&b0.coverage.status==="PARTIAL"&&b0.summary.exact===false&&b0.items.length<=100,[took+"ms",b0.sources,b0.summary.total]);
ok("B2 page size is capped (limit 1000 → 100)",(await AC(B,"limit=1000")).body.items.length===100,"");

// ================= dashboard UI =================
const UI=await import(pathToFileURL(path.join(SRC,"live-dashboard-page.js")).href);
const page=UI.liveDashboardHtml("actions"),appr=UI.liveDashboardHtml("approvals"),js=page.slice(page.lastIndexOf("<script>")+8,page.lastIndexOf("</script>"));
let parses=true;try{new Function(js);}catch{parses=false;}
// the Owner Action Center block ends at the NEXT section marker (Phase 14 placed the Telegram loader after it)
const oacStart=js.indexOf("// ---- Phase 13.1 Owner Action Center"),oacJs=js.slice(oacStart,js.indexOf("// ---- ",oacStart+10));
ok("U1 the Owner Action Center has its own page (/dashboard/actions) and leads the approvals page; the page script parses",UI.dashboardRoute("/dashboard/actions")==="actions"&&page.includes('id="oacItems"')&&appr.indexOf('id="oacItems"')>-1&&appr.indexOf('id="oacItems"')<appr.indexOf('id="approvalsOverview"')&&parses,"");
ok("U2 the UI only READS: its code calls GET /api/owner/action-center and nothing else (no POST / PATCH, no other endpoint), and it is not in the polling groups",
  /api\("\/api\/owner\/action-center\?"/.test(oacJs)&&!/method\s*:/.test(oacJs)&&(oacJs.match(/api\(/g)||[]).length===1&&!/loadOwnerActions/.test(js.slice(js.indexOf("const DASHBOARD_POLL_GROUPS"),js.indexOf("async function refreshTick"))),"");
ok("U3 filters for priority, category, market and status, pagination, P0/P1 and verified/unverified money are on the page",["oacPri","oacCat","oacMkt","oacSt","oacPrev","oacNext"].every(id=>page.includes(`id="${id}"`))&&/P0 فوری/.test(oacJs)&&/تأییدنشده/.test(oacJs),"");
// ================= Phase 13.1B — the eight audit findings =================
// statement recorder + D1 bound-parameter limit simulator (a statement with more than 100 "?" fails like D1)
const recorder=Wx=>{const log=[],orig=Wx.env.DB.prepare.bind(Wx.env.DB);Wx.env.DB.prepare=sql=>{log.push(String(sql));if((String(sql).match(/\?/g)||[]).length>100)throw new Error("too many SQL variables (D1 limit simulation)");return orig(sql);};return log;};
const RATE=/api_rate_limits/,WRITE=/^\s*(WITH[\s\S]*?\)\s*)?(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)\b/i;
{// FIX 1 — truncation must never hide urgent items; coverage is measured and disclosed
 const T=await makeWorld({});await ensureStores(T);lead(T,"T-L");
 T.d1.db.exec("BEGIN");
 for(let i=0;i<250;i++)dec(T,"T-LR-"+i,"LEARNING_RULE",{at:ago(30,i%20)});                  // 250 old low-priority decisions
 for(let i=0;i<230;i++)esc(T,"T-K-"+i,"T-L","missing_business_knowledge",ago(8+i%5));         // 230 aged (P2→P1) escalations
 for(let i=0;i<210;i++)order(T,"T-O-"+i,"T-L","IRAN","TOMAN","confirmed",1000,{confirmed:ago(0,5),created:ago(1)});   // 210 fresh unpaid
 T.d1.db.exec("COMMIT");
 dec(T,"T-PAY","PAYMENT_VERIFICATION",{lead:"T-L",at:ago(0,1)});esc(T,"T-PRICE","T-L","unsupported_price",ago(0,1));
 order(T,"T-INT","T-L","IRAN","TOMAN","cancelled",5000,{created:ago(0,1)});pay(T,"T-INTP","T-INT","T-L",5000,"TOMAN",ago(0,1));
 const t=(await AC(T,"limit=100")).body,keys=new Set((await AC(T,"priority=P0&limit=100")).body.items.map(x=>x.key));
 const allKeys=[];for(let off=0;off<t.total_filtered;off+=100)allKeys.push(...(await AC(T,"limit=100&offset="+off)).body.items.map(x=>x.key));
 ok("X1 FIX1 a NEW P0 payment claim behind 250 older decisions, a new P0 payment-integrity order behind 210 older orders, and a new P1 price escalation behind 230 aged ones are all listed",keys.has("decision:T-PAY")&&keys.has("integrity:T-INT")&&allKeys.includes("escalation:T-PRICE"),[...keys]);
 ok("X2 FIX1 truncation is measured and disclosed: coverage PARTIAL, counts flagged inexact, truncated sources named (escalations 230+1, decisions 251, orders 211)",t.coverage.status==="PARTIAL"&&t.coverage.exact===false&&t.summary.exact===false&&["owner_escalations","owner_decisions","lead_orders"].every(k=>t.coverage.truncated_sources.includes(k))&&t.sources.owner_decisions.total===251&&t.sources.lead_orders.total===211,t.coverage);
 ok("X3 FIX1 urgent coverage: more urgent rows than the cap (231 aged / P1 escalations) is reported as urgent PARTIAL, never as complete",t.coverage.urgent==="PARTIAL"&&t.coverage.urgent_truncated_sources.includes("owner_escalations")&&t.sources.owner_decisions.urgent_complete===true,[t.coverage.urgent,t.sources.owner_escalations]);
 const U=await makeWorld({});await ensureStores(U);lead(U,"U-L");U.d1.db.exec("BEGIN");for(let i=0;i<205;i++)dec(U,"U-PAY-"+i,"PAYMENT_VERIFICATION",{lead:"U-L",at:ago(0,i%10)});U.d1.db.exec("COMMIT");
 const u=(await AC(U,"limit=1")).body;
 ok("X4 FIX1 more P0 rows than any cap (205 payment claims): P0 count is shown as a lower bound (exact=false, urgent PARTIAL) — never as a definitive number",u.summary.by_priority.P0===200&&u.summary.exact===false&&u.coverage.urgent==="PARTIAL",[u.summary.by_priority,u.coverage]);
 ok("X5 FIX1 the main fixture world (no source over its cap, all tables present) is COMPLETE with exact counts",d.coverage?.status==="COMPLETE"&&d.summary.exact===true&&d.coverage.urgent==="COMPLETE",[d.coverage]);}
{// FIX 2 + FIX 3 + FIX 8 — one bounded pass, zero schema / data writes, D1 parameter limit respected
 const Z=await makeWorld({});await ensureStores(Z);const log=recorder(Z);
 Z.d1.db.exec("BEGIN");for(let i=0;i<150;i++){lead(Z,"Z-"+i,{notes:i===140?{data_class:"real"}:{},stage:"customer"});order(Z,"Z-O-"+i,"Z-"+i,"ARAB","USD","fulfilled",1000,{confirmed:ago(80),delivered:ago(40),created:ago(81)});pay(Z,"Z-P-"+i,"Z-O-"+i,"Z-"+i,1000,"USD",ago(45));}Z.d1.db.exec("COMMIT");
 log.length=0;const z=await AC(Z,"limit=100"),zb=z.body;
 ok("X6 FIX8 150 reorder leads: classification is read in bounded batches (no statement over 100 parameters), no source fails, REAL found for the 141st lead",z.status===200&&zb.coverage.status!=="UNKNOWN"&&!zb.sources.lead_classification&&log.every(q=>(q.match(/\?/g)||[]).length<=100)&&(await AC(Z,"limit=100&offset=100")).body.items.concat(zb.items).some(x=>x.key==="reorder:Z-O-140"&&x.classification==="REAL"),[zb.coverage,log.filter(q=>(q.match(/\?/g)||[]).length>100).length]);
 ok("X7 FIX3 the Action Center read path (module + detector) issues NO schema or data write — every statement is a SELECT / WITH … SELECT (only the Worker's pre-existing global API rate-limit counter writes, before routing)",log.filter(q=>!RATE.test(q)).length>0&&!log.filter(q=>!RATE.test(q)).some(q=>WRITE.test(q))&&log.filter(q=>WRITE.test(q)).every(q=>RATE.test(q)),log.filter(q=>WRITE.test(q)&&!RATE.test(q)).map(q=>q.slice(0,60)));
 const fresh=await makeWorld({});await ensureStores(fresh);fresh.d1.db.exec("DROP TABLE IF EXISTS owner_escalations");fresh.d1.db.exec("DROP TABLE IF EXISTS lead_quotes");const before13=fresh.q("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map(x=>x.name).join(",");const fr=await AC(fresh);
 ok("X8 FIX3 tables missing (owner_escalations, lead_quotes): the GET creates nothing (schema unchanged), reports UNKNOWN coverage naming the failed sources, still serves the others",fr.status===200&&fresh.q("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map(x=>x.name).join(",")===before13&&fr.body.coverage.status==="UNKNOWN"&&["owner_escalations","lead_quotes","revenue_detector"].every(k=>fr.body.coverage.failed_sources.includes(k))&&fr.body.sources.lead_orders.ok===true,[fr.body.coverage]);
 ok("X5b FIX1 a missing source makes coverage UNKNOWN (never COMPLETE) and counts inexact",fr.body.coverage.status==="UNKNOWN"&&fr.body.summary.exact===false&&fr.body.coverage.urgent==="UNKNOWN","");
 const BB=await makeWorld({});await ensureStores(BB);const blog=recorder(BB);BB.d1.db.exec("BEGIN");for(let i=0;i<1500;i++){lead(BB,"BB-"+i);for(let k=0;k<4;k++)inbox(BB,"BB-"+i+"-"+k,"BB-"+i,ago(5,k));}BB.d1.db.exec("COMMIT");
 blog.length=0;const c0=Date.now(),bb=(await AC(BB,"limit=100")).body,cms=Date.now()-c0;const conv=blog.find(q=>/WITH inb AS/.test(q))||"";
 ok("X9 FIX2 conversations: ONE grouped pass (no per-lead correlated scan of inbox_messages), bounded statement count, fast on 1,500 leads × 4 messages",!!conv&&!/\(SELECT MAX\(i\.created_at\) FROM inbox_messages i WHERE i\.lead_id=l\.id\)/.test(conv)&&blog.length<=12&&cms<3000&&bb.sources.conversations.total===1500,[blog.length+" statements",cms+"ms",bb.sources.conversations]);}
{// FIX 4 + FIX 5 — real contact = sent / delivered; outgoing states are told apart
 const V=await makeWorld({});await ensureStores(V);
 lead(V,"V-DEL",{priority:"high"});outreach(V,"V-DEL-1","V-DEL","delivered",ago(2));
 lead(V,"V-DRAFT",{priority:"high"});outreach(V,"V-DR-1","V-DRAFT","draft",ago(2));
 lead(V,"V-NONE",{priority:"high"});
 lead(V,"V-ANS");inbox(V,"V-ANS-I","V-ANS",ago(2));outreach(V,"V-ANS-O","V-ANS","delivered",ago(1));
 lead(V,"V-REPLY");inbox(V,"V-RE-I","V-REPLY",ago(1));insert(V,"lead_outreach",{id:"V-RE-D",lead_id:"V-REPLY",conversation_id:"conv-V-REPLY",channel:"telegram",recipient:"r",message:"m",language:"Persian",status:"draft",inbox_message_id:"V-RE-I",created_at:ago(1),updated_at:ago(1)});
 lead(V,"V-APP");outreach(V,"V-APP-1","V-APP","approved",ago(1));
 lead(V,"V-FAIL");outreach(V,"V-FAIL-1","V-FAIL","send_failed",ago(1));
 lead(V,"V-AMB");outreach(V,"V-AMB-1","V-AMB","send_ambiguous",ago(1));
 lead(V,"V-STUCK");outreach(V,"V-ST-1","V-STUCK","sending",ago(0,3));
 lead(V,"V-SENT");outreach(V,"V-SENT-1","V-SENT","sent",ago(1));
 const v=Object.fromEntries((await AC(V,"limit=100")).body.items.map(x=>[x.key,x]));
 ok("X10 FIX4 a 'delivered' first contact counts as contact (no 'never contacted' item); a draft is NOT contact; a never-contacted high-priority lead is listed",!v["lead:V-DEL"]&&!!v["lead:V-NONE"]&&!!v["outreach:awaiting_owner_approval:V-DRAFT"]&&!v["lead:V-DRAFT"],Object.keys(v));
 ok("X11 FIX4 a customer message answered by a 'delivered' message is not 'waiting'",!v["conversation:V-ANS"],v["conversation:V-ANS"]);
 ok("X12 FIX5 outgoing states are distinct: awaiting approval (reply to a customer message), approved not sent, delivery failed P1, outcome unknown P1, stuck send → unknown P1; a sent message is no draft item",
   /پاسخ به پیام مشتری/.test(v["outreach:awaiting_owner_approval:V-REPLY"]?.next_action||"")&&v["outreach:awaiting_owner_approval:V-REPLY"]?.flags.includes("customer_waiting")&&!!v["outreach:approved_not_sent:V-APP"]&&v["outreach:delivery_failed:V-FAIL"]?.priority==="P1"&&v["outreach:delivery_unknown:V-AMB"]?.priority==="P1"&&v["outreach:delivery_unknown:V-STUCK"]?.priority==="P1"&&!Object.keys(v).some(k=>k.endsWith(":V-SENT")&&k.startsWith("outreach:")),
   Object.keys(v).filter(k=>k.startsWith("outreach:")));
 ok("X13 FIX5 the 'customer is waiting' wording appears only for a reply to an actual customer message",Object.values(v).filter(x=>/پاسخ به پیام مشتری/.test(x.next_action||"")).every(x=>x.lead_id==="V-REPLY"),"");}
{// FIX 6 — shipped / fulfilled with a balance, paid integrity, stale status; mixed currencies stay separate
 const O=await makeWorld({});await ensureStores(O);lead(O,"O-L",{notes:{data_class:"real"}});
 order(O,"S1","O-L","ARAB","USD","shipped",100000,{confirmed:ago(10)});pay(O,"S1P","S1","O-L",40000,"USD",ago(9));
 order(O,"S2","O-L","IRAN","TOMAN","fulfilled",900000,{confirmed:ago(20)});pay(O,"S2P","S2","O-L",900000,"TOMAN",ago(19));
 order(O,"S3","O-L","ARAB","USD","shipped",100000,{confirmed:ago(10)});pay(O,"S3P","S3","O-L",150000,"USD",ago(9));
 order(O,"S4","O-L","IRAN","TOMAN","partially_paid",500000,{confirmed:ago(10)});pay(O,"S4P","S4","O-L",500000,"TOMAN",ago(9));
 order(O,"S5","O-L","IRAN","TOMAN","fulfilled",700000,{confirmed:ago(30)});pay(O,"S5P","S5","O-L",200000,"TOMAN",ago(29));
 const ob=(await AC(O,"limit=100")).body,o=Object.fromEntries(ob.items.map(x=>[x.key,x]));
 ok("X14 FIX6 a shipped order with an unpaid balance is a P1 receivable (60,000 USD outstanding); a fully paid fulfilled order is not listed",o["order:S1"]?.kind==="balance_after_shipping"&&o["order:S1"].priority==="P1"&&o["order:S1"].amount_minor===60000&&!o["order:S2"]&&!o["integrity:S2"],o["order:S1"]);
 ok("X15 FIX6 overpayment on a shipped order is P0 payment integrity; a fully paid order still marked partially_paid is a P2 bookkeeping item without money",o["integrity:S3"]?.priority==="P0"&&o["integrity:S3"].reason==="payments_exceed_total"&&o["order:S4"]?.kind==="status_out_of_date"&&o["order:S4"].amount_minor===null,[o["integrity:S3"],o["order:S4"]]);
 ok("X16 FIX6 per-currency separation: verified outstanding USD 60,000 and TOMAN 500,000 are reported apart (never summed)",ob.summary.money_outstanding.verified_by_currency.USD===60000&&ob.summary.money_outstanding.verified_by_currency.TOMAN===500000&&Object.keys(ob.summary.money_outstanding.verified_by_currency).length===2,ob.summary.money_outstanding);}
{// FIX 7 — merging keeps the most urgent priority and every owner action
 const M=await makeWorld({});await ensureStores(M);lead(M,"M-L");lead(M,"M-W");lead(M,"M-T",{notes:{is_test:true}});
 esc(M,"M-E","M-L","missing_business_knowledge",ago(1));dec(M,"M-D","PAYMENT_VERIFICATION",{lead:"M-L",escalation:"M-E",at:ago(1)});
 order(M,"M-O","M-L","ARAB","USD","order_candidate",20000,{accepted:ago(0,2)});dec(M,"M-D1","ORDER_CANDIDATE_APPROVAL",{lead:"M-L",order:"M-O",at:ago(0,2)});insert(M,"owner_decisions",{id:"M-D2",status:"PENDING",priority:20,decision_type:"ORDER_CANDIDATE_APPROVAL",fingerprint:"fp-M-D2",lead_id:"M-L",order_id:"M-O",created_at:ago(0,1),updated_at:ago(0,1)});
 dec(M,"M-KC","KNOWLEDGE_CONFLICT",{lead:"M-W",at:ago(1)});inbox(M,"M-W-I","M-W",ago(0,3));
 dec(M,"M-TK","KNOWLEDGE_CONFLICT",{lead:"M-T",at:ago(1)});inbox(M,"M-T-I","M-T",ago(0,3));
 const mb=(await AC(M,"limit=100")).body,m=Object.fromEntries(mb.items.map(x=>[x.key,x]));
 ok("X17 FIX7 an escalation merged with a more urgent mirrored decision keeps the HIGHER priority (P0) — one item, decision attached",m["escalation:M-E"]?.priority==="P0"&&m["escalation:M-E"].related.some(r=>r.id==="M-D")&&!m["decision:M-D"],m["escalation:M-E"]);
 ok("X18 FIX7 two pending approval decisions for one order candidate: both are kept on the one order item (none dropped)",["M-D1","M-D2"].every(id=>m["order:M-O"]?.related.some(r=>r.id===id))&&!m["decision:M-D1"]&&!m["decision:M-D2"],m["order:M-O"]?.related);
 ok("X19 FIX7 a lead with a low-priority (P3) item AND an unanswered customer message: no duplicate row, the item carries 'customer waiting' and is raised to P1; a TEST lead stays P3",m["decision:M-KC"]?.flags.includes("customer_waiting")&&m["decision:M-KC"].priority==="P1"&&!m["conversation:M-W"]&&m["decision:M-TK"]?.priority==="P3"&&mb.summary.customer_waiting>=1,[m["decision:M-KC"],m["decision:M-TK"]?.priority]);}
{// dashboard: banner, lower-bound counters, honest empty state (pure helpers evaluated from the page script)
 const H=new Function("uxN","esc",js.slice(js.indexOf("function oacCnt"),js.indexOf("async function loadOwnerActions"))+";return {oacCnt,oacCoverageHtml,oacEmptyText};")(n=>String(n),x=>String(x));
 const part={coverage:{status:"PARTIAL",urgent:"COMPLETE",exact:false,failed_sources:[],truncated_sources:["owner_escalations"]},summary:{total:0}},unk={coverage:{status:"UNKNOWN",urgent:"UNKNOWN",exact:false,failed_sources:["lead_orders"],truncated_sources:[]},summary:{total:0}},full={coverage:{status:"COMPLETE",urgent:"COMPLETE",exact:true},summary:{total:0}};
 ok("X20 dashboard: counts show «≥» unless exact; a banner appears for PARTIAL (warn) and UNKNOWN / urgent-partial (bad, names the source); no banner when COMPLETE",H.oacCnt(5,false)==="≥5"&&H.oacCnt(5,true)==="5"&&/فهرست کامل نیست/.test(H.oacCoverageHtml(part))&&/اقدام فوری/.test(H.oacCoverageHtml(unk))&&/lead_orders/.test(H.oacCoverageHtml(unk))&&H.oacCoverageHtml(full)==="","");
 ok("X21 dashboard: 'no open actions' is shown ONLY when coverage is COMPLETE; incomplete coverage with zero items says it is not an all-clear",/اقدام بازی منتظر مالک نیست/.test(H.oacEmptyText(full))&&/کامل نیست/.test(H.oacEmptyText(part))&&/کامل نیست/.test(H.oacEmptyText(unk))&&!/اقدام بازی منتظر/.test(H.oacEmptyText(unk)),"");}
ok("ISOLATION only in-process mocks were called",W.offNet().every(u=>/api\.telegram\.org|api\.anthropic\.com|api\.openai\.com|w\.test/.test(u)),"");
function require_src(){return fs.readFileSync(path.join(SRC,"owner-action-center.js"),"utf8");}
process.exit(done()?1:0);
