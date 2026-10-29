// PHASE 16.11 — security, reliability and staging-isolation regression (local): S a complete auth sweep over EVERY route found in
// worker/src (no token / wrong token, GET and POST: no 2xx except the public allowlist, no 5xx, no Telegram / AI call, no data row
// written outside the bounded public telemetry), T admin-token edge cases, P payment-ledger integrity under concurrency (the 16.11
// fix: two concurrent payments with different references can no longer overpay an order), C Sales-AI cooldown for 403 and none
// for 5xx, G the staging profile (staging vars, NO secrets, no R2 / AI binding, autonomy master off) makes no outbound call at all.
// Local only: Telegram and the AI provider are in-process mocks; nothing reaches Production, staging, a customer or a paid API.
import fs from "node:fs";import path from "node:path";import {fileURLToPath,pathToFileURL} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,J,done}=reporter("phase16_11");
const started=Date.now(),t0=()=>new Date().toISOString();
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const SRC=process.env.SRC||path.join(REPO,"worker/src");
const STAGE2B=fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8");

// ================= S. auth sweep over every route in the source =================
{const W=await makeWorld({aiBrain:"on"});W.d1.db.exec(STAGE2B);
 const src=fs.readdirSync(SRC).filter(f=>f.endsWith(".js")).map(f=>fs.readFileSync(path.join(SRC,f),"utf8")).join("\n");
 const exact=[...new Set([...src.matchAll(/pathname *=== *["']([^"']+)["']/g)].map(m=>m[1]))].filter(r=>r.startsWith("/"));
 // prefix-routed handlers get representative sub-paths
 const prefixed=["/api/autonomy/agents/overview","/api/autonomy/status","/api/autonomy/command","/api/gallery","/api/gallery/image","/api/leads/first-contact/approve",
   "/api/owner-knowledge/imports","/api/sales-knowledge","/api/sales-knowledge/propose","/api/sales-knowledge/apply","/api/sales-knowledge/teach","/api/si/x","/dashboard/sales"];
 const routes=[...new Set([...exact,...prefixed])];
 // intentionally public: the static dashboard shell (data still needs the token), health, and the public website feed
 const PUBLIC_GET=new Set(["/dashboard","/dashboard.js","/dashboard/sales","/api/health","/api/site/content"]);
 // bounded public telemetry: rate-limit counters, ONE rejection event per reason per minute, the public website tracker table
 const ALLOWED_ROWS=new Set(["api_rate_limits","system_events"]);
 const snap=()=>Object.fromEntries(W.q("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").map(r=>[r.name,W.q(`SELECT COUNT(*) n FROM "${r.name}"`)[0].n]));
 const bad2xx=[],fivexx=[],rowWrites=[],sideCalls=[];let calls=0;
 for(const r of routes)for(const method of ["GET","POST"])for(const authz of [null,"Bearer wrong-token"]){
   const b=snap(),tg0=W.tg.length,ai0=W.AI.requests.length,h={"Content-Type":"application/json"};if(authz)h.Authorization=authz;
   const res=await W.run(new Request("https://w.test"+r,{method,headers:h,body:method==="POST"?JSON.stringify({id:"x",order_id:"x",lead_id:"x",command:"price list",text:"x",update_id:1}):undefined}));calls++;
   const a=snap(),key=`${method} ${r}${authz?" (wrong token)":""}`;
   if(res.status>=200&&res.status<300&&!(method==="GET"&&PUBLIC_GET.has(r)))bad2xx.push([key,res.status]);
   if(res.status>=500)fivexx.push([key,res.status]);
   for(const t of Object.keys(a))if(t in b&&a[t]>b[t]&&!ALLOWED_ROWS.has(t))rowWrites.push([key,t,a[t]-b[t]]);
   if(W.tg.length!==tg0||W.AI.requests.length!==ai0)sideCalls.push([key,W.tg.length-tg0,W.AI.requests.length-ai0]);}
 ok(`S1 auth sweep covered every route in worker/src (${routes.length} routes, ${calls} calls)`,routes.length>=150&&calls===routes.length*4,routes.length);
 ok("S2 no route answers 2xx without a valid admin token, except the public allowlist (dashboard shell, health, site feed)",!bad2xx.length,bad2xx);
 // deliberate fail-closed: the Instagram webhook answers 503 "secrets not configured" before reading the body when unconfigured
 const igClosed=fivexx.filter(([k,s])=>/^POST \/webhooks\/instagram/.test(k)&&s===503),realFive=fivexx.filter(x=>!igClosed.includes(x));
 ok("S3 no unauthenticated call fails with a 5xx (fails safely)",!realFive.length,realFive);
 const ig=await W.run(new Request("https://w.test/webhooks/instagram",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}));let igBody=null;try{igBody=await ig.json();}catch{}
 ok("S3b …the only 503 is the Instagram webhook refusing deliberately while its secrets are not configured (nothing processed)",ig.status===503&&/not configured/.test(igBody?.error||"")&&W.q("SELECT COUNT(*) n FROM inbox_messages WHERE platform='instagram'")[0].n===0,[ig.status,igBody]);
 ok("S4 no unauthenticated call writes a data row (only rate-limit counters and bounded rejection events)",!rowWrites.length,rowWrites);
 ok("S5 no unauthenticated call reaches Telegram or the AI provider",!sideCalls.length,sideCalls);
 const rej=W.q("SELECT id FROM system_events WHERE type='telegram_webhook_rejected'");
 ok("S6 rejected webhook deliveries are logged at most once per reason per minute (deterministic id, no write amplification)",rej.length<=2&&new Set(rej.map(x=>x.id)).size===rej.length,rej);
 // the public website tracker is the only public data write: size-capped
 const big=await W.run(new Request("https://w.test/api/website/track",{method:"POST",headers:{"Content-Type":"application/json","content-length":"5000"},body:JSON.stringify({x:"a".repeat(4000)})}));
 ok("S7 the public website tracker refuses an oversized payload (413)",big.status===413,big.status);}

// ================= T. admin-token edge cases =================
{const W=await makeWorld({aiBrain:"off"});
 const st=async(h)=>(await W.run(new Request("https://w.test/api/orders",{method:"GET",headers:h}))).status;
 const variants={"Bearer tokX":{Authorization:"Bearer tokX"},"Bearer to":{Authorization:"Bearer to"},"tok (no scheme)":{Authorization:"tok"},
   "Basic tok":{Authorization:"Basic tok"},"Bearer (empty)":{Authorization:"Bearer "},"Bearer tok,tok":{Authorization:"Bearer tok,tok"},"X-Admin-Token header":{"X-Admin-Token":"tok"}};
 const res={};for(const [k,h] of Object.entries(variants))res[k]=await st(h);
 ok("T1 near-miss admin tokens (prefix, suffix, no scheme, Basic, empty, doubled, other header) are all refused",Object.values(res).every(s=>s===401||s===403),res);
 ok("T2 the exact admin token is accepted (control)",(await st({Authorization:"Bearer tok"}))===200);
 const before=W.env.ADMIN_TOKEN;delete W.env.ADMIN_TOKEN;
 const unset={};for(const h of ["Bearer ","Bearer undefined","Bearer null","Bearer tok"])unset[h]=await st({Authorization:h});
 const ag=(await W.run(new Request("https://w.test/api/autonomy/agents/overview",{headers:{Authorization:"Bearer undefined"}}))).status;
 W.env.ADMIN_TOKEN=before;
 ok("T3 with ADMIN_TOKEN unset (staging) NO bearer value opens an admin route, incl. 'undefined' / 'null' / empty",Object.values(unset).every(s=>s===401||s===403)&&(ag===401||ag===403),[unset,ag]);}

// ================= P. payment-ledger integrity =================
{const W=await makeWorld({aiBrain:"off"});await W.call("/api/orders",null,"GET");
 const u={id:991100,name:"pay",username:"pay991100"};await W.send(u,"سلام");
 const c=W.q("SELECT lead_id,conversation_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(u.id)])[0];
 const mk=(id,total,{status="confirmed",market="IRAN",currency="TOMAN"}={})=>W.dbrun("INSERT INTO lead_orders(id,order_number,quote_id,lead_id,conversation_id,market,product,quantity,currency,unit_price_minor,subtotal_minor,total_minor,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,"HB-"+id,"Q-"+id,c.lead_id,c.conversation_id,market,"نیم ست کوچک 3 تکه",1,currency,total,total,total,status,t0(),t0()]);
 const pay=(order,ref,amount,kind="partial",currency="TOMAN",method="card_to_card")=>W.call("/api/orders/payments",{order_id:order,payment_kind:kind,method,amount_minor:amount,currency,reference:ref});
 const rows=o=>W.q("SELECT id,reference,amount_minor,payment_kind FROM lead_order_payments WHERE order_id=? ORDER BY rowid",[o]);
 const status=o=>W.q("SELECT status FROM lead_orders WHERE id=?",[o])[0]?.status;
 const tg0=W.tg.length;
 mk("P1",1000);
 const race=await Promise.all([pay("P1","REF-A",600),pay("P1","REF-B",600)]);
 const paid1=rows("P1").reduce((s,r)=>s+r.amount_minor,0);
 ok("P1 [16.11 FIX] two concurrent partial payments with different references cannot overpay: one recorded, the other refused (409 conflict)",paid1===600&&race.filter(r=>r.status===200).length===1&&race.some(r=>r.status===409),[race.map(r=>[r.status,r.body?.error]),rows("P1")]);
 ok("P1b …the order stays partially_paid (no false 'paid')",status("P1")==="partially_paid",status("P1"));
 const retry=await pay("P1","REF-B",400);
 ok("P2 after the conflict the owner can record the real remaining balance; the order becomes paid exactly at its total",retry.status===200&&rows("P1").reduce((s,r)=>s+r.amount_minor,0)===1000&&status("P1")==="paid",[retry.status,retry.body?.error,rows("P1")]);
 mk("P3",1000);const same=await Promise.all([pay("P3","SAME-REF",300),pay("P3","SAME-REF",300)]);
 ok("P3 the SAME reference posted twice concurrently → one payment row (idempotent / unique), nothing doubled",rows("P3").length===1&&rows("P3")[0].amount_minor===300,[same.map(r=>[r.status,r.body?.error,r.body?.idempotent]),rows("P3")]);
 const again=await pay("P3","SAME-REF",300);
 ok("P4 re-posting a recorded reference with the same facts is idempotent (no second row)",again.status===200&&rows("P3").length===1,[again.status,again.body]);
 const diff=await pay("P3","SAME-REF",350);
 ok("P5 the same reference with a DIFFERENT amount is refused and changes nothing",diff.status>=400&&rows("P3").length===1,[diff.status,diff.body?.error]);
 mk("P6",1000);const fulls=await Promise.all([pay("P6","FULL-A",1000,"full"),pay("P6","FULL-B",1000,"full")]);
 ok("P6 two concurrent FULL payments with different references → exactly one recorded",rows("P6").length===1&&status("P6")==="paid",[fulls.map(r=>r.status),rows("P6")]);
 mk("P7",1000);const deps=await Promise.all([pay("P7","DEP-A",300,"deposit"),pay("P7","DEP-B",300,"deposit")]);
 ok("P7 two concurrent deposits → only one deposit is recorded",rows("P7").length===1,[deps.map(r=>[r.status,r.body?.error]),rows("P7")]);
 const wrongCur=await pay("P7","USD-1",100,"partial","USD");
 ok("P8 a payment in another currency than the order (USD on a TOMAN order) is refused",wrongCur.status>=400&&rows("P7").length===1,[wrongCur.status,wrongCur.body?.error]);
 const over=await pay("P7","OVER-1",800);
 ok("P9 a payment above the outstanding balance is refused",over.status>=400&&rows("P7").reduce((s,r)=>s+r.amount_minor,0)===300,[over.status,over.body?.error]);
 for(const [id,st] of [["P10a","cancelled"],["P10b","draft"],["P10c","shipped"]])mk(id,1000,{status:st});
 const closed=await Promise.all(["P10a","P10b","P10c"].map(o=>pay(o,"X-"+o,100)));
 ok("P10 payments on cancelled / draft / shipped orders are refused",closed.every(r=>r.status>=400)&&["P10a","P10b","P10c"].every(o=>!rows(o).length),closed.map(r=>[r.status,r.body?.error]));
 const unauth=await W.run(new Request("https://w.test/api/orders/payments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({order_id:"P7",payment_kind:"partial",method:"cash",amount_minor:100,currency:"TOMAN",reference:"NOAUTH"})}));
 ok("P11 recording a payment without the admin token is refused and records nothing",unauth.status===401&&!rows("P7").some(r=>r.reference==="NOAUTH"),unauth.status);
 const pid=rows("P7")[0].id;const revs=await Promise.all([W.call("/api/orders/payments/reverse",{payment_id:pid,reason:"test"}),W.call("/api/orders/payments/reverse",{payment_id:pid,reason:"test"})]);
 const revRows=W.q("SELECT id FROM lead_order_payments WHERE order_id='P7' AND payment_kind='reversal'");
 ok("P12 two concurrent reversals of one payment → exactly one reversal row, ledger back to 0",revRows.length===1&&rows("P7").reduce((s,r)=>s+r.amount_minor,0)===0,[revs.map(r=>[r.status,r.body?.error]),revRows.length]);
 mk("P13",500,{market:"ARAB",currency:"USD"});const arab=await pay("P13","ARAB-1",500,"full","USD","exchange_hawala");
 const sentPay=W.tg.slice(tg0).filter(x=>/^send/.test(x.method));
 ok("P13 recording payments (incl. an ARAB order becoming fully paid) sends NOTHING to the customer automatically",arab.status===200&&!sentPay.length,[arab.status,sentPay.map(x=>x.method)]);}

// ================= C. Sales-AI cooldown: 403 cools down, 5xx does not =================
{const W=await makeWorld({aiBrain:"on"});const {send,setMarket}=W;
 const SA=await import(pathToFileURL(path.join(SRC,"sales-ai-brain.js")).href);
 const inner=globalThis.fetch;let hits=0,code=403;
 globalThis.fetch=async(u,o={})=>{if(String(u?.url||u)==="https://api.anthropic.com/v1/messages"){hits++;return new Response("{}",{status:code});}return inner(u,o);};
 const mkUsers=p=>[1,2,3].map(i=>({id:992000+p*10+i,name:"c"+i,username:"c"+p+i}));
 const run=async(us)=>{for(const x of us){await send(x,"سلام");setMarket(x,"iran");}hits=0;SA.resetSalesAiCooldown();const out=[];for(const x of us)out.push(await send(x,"قیمت جعبه ساعت چنده؟"));return out;};
 code=403;const r403=await run(mkUsers(1));const h403=hits;
 ok("C1 provider 403: only the first message calls the provider, the next ones skip it (provider_cooldown) — no retry, no other provider",h403===1&&r403.slice(1).every(r=>r.brain?.ai_brain?.error==="provider_cooldown"),[h403,r403.map(r=>r.brain?.ai_brain?.error)]);
 ok("C2 …403 cools down for 120 s (same as 401)",SA.SALES_AI_COOLDOWN_MS[403]===120000&&SA.salesAiCooldownUntil("anthropic")>Date.now()+100000,SA.salesAiCooldownUntil("anthropic")-Date.now());
 code=500;const r500=await run(mkUsers(2));const h500=hits;
 ok("C3 provider 500: NO cooldown — every message still tries the provider once and falls back deterministically",h500===3&&r500.every(r=>r.brain?.ai_brain?.used!==true&&!!r.brain?.next_sales_action),[h500,r500.map(r=>r.brain?.ai_brain?.error)]);
 globalThis.fetch=inner;SA.resetSalesAiCooldown();
 const MONEY=/[0-9٠-٩۰-۹]{3,}|USD|\$|تومان|دولار/;
 ok("C4 no unapproved amount reached any customer during the provider failures",W.tg.filter(x=>/^send/.test(x.method)).every(x=>{try{return !MONEY.test(String(JSON.parse(x.body).text||""));}catch{return true;}}));}

// ================= G. staging profile: no secrets, no outbound =================
{const W=await makeWorld({aiBrain:"off",extraEnv:{HAMZEHI_ENVIRONMENT:"staging",SALES_AI_PROVIDER:"anthropic",ANTHROPIC_MODEL:"claude-opus-5-5",SALES_AI_TIMEOUT_MS:"15000",
   SALES_AI_MAX_OUTPUT_TOKENS:"800",AUTONOMY_ORCHESTRATOR:"on",AUTO_AI_MEDIA_ENABLED:"false",SALES_AI_UNDERSTANDING:"off",RATE_LIMIT_PER_MINUTE:"30"}});
 for(const k of ["ADMIN_TOKEN","TELEGRAM_BOT_TOKEN","TELEGRAM_WEBHOOK_SECRET_TOKEN","GALLERY_BUCKET","AI"])delete W.env[k];
 W.d1.db.exec(STAGE2B);
 W.d1.db.exec("CREATE TABLE IF NOT EXISTS autonomy_controls(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL);INSERT OR REPLACE INTO autonomy_controls(key,value,updated_at) VALUES('master','off','2026-10-28T00:00:00Z');");
 const upd={update_id:1,message:{message_id:1,date:Math.floor(Date.now()/1000),from:{id:5,is_bot:false,first_name:"x"},chat:{id:5,type:"private"},text:"قیمت؟"}};
 const hooks=[];for(const s of ["","guess","sec"])hooks.push((await W.run(new Request("https://w.test/webhooks/telegram",{method:"POST",headers:{"Content-Type":"application/json",...(s?{"X-Telegram-Bot-Api-Secret-Token":s}:{})},body:JSON.stringify(upd)}))).status);
 // Phase 16.16-A: a staging Worker without its own secret now answers 503 "not configured" (was 401 via a D1-generated secret)
 ok("G1 staging without a webhook secret refuses every Telegram delivery (none, guessed, harness secret) and stores nothing",hooks.every(s=>s===503)&&W.q("SELECT COUNT(*) n FROM inbox_messages")[0].n===0&&
   !W.q("SELECT name FROM sqlite_master WHERE type='table' AND name='system_kv'").concat().some(()=>W.q("SELECT COUNT(*) n FROM system_kv WHERE key='telegram_webhook_secret'")[0].n>0),hooks);
 const mod=await import(pathToFileURL(path.join(SRC,"index.js")).href+"?g="+Math.random());
 for(const cron of ["*/15 * * * *","0 7 * * *"]){const pend=[];await mod.default.scheduled({cron,scheduledTime:Date.now()},W.env,{waitUntil:p=>pend.push(p)});await Promise.allSettled(pend);}
 ok("G2 both cron schedules with master off run no autonomy task and no failed step",W.q("SELECT COUNT(*) n FROM autonomy_tasks")[0].n===0&&W.q("SELECT COUNT(*) n FROM system_events WHERE type='scheduled_step_failed'")[0].n===0);
 ok("G3 the staging profile makes ZERO outbound calls (no Telegram, no AI, nothing else)",W.net.length===0&&W.AI.requests.length===0,W.net);
 ok("G4 no lead, order, payment or outreach row exists",W.q("SELECT (SELECT COUNT(*) FROM leads)+(SELECT COUNT(*) FROM lead_orders)+(SELECT COUNT(*) FROM lead_order_payments)+(SELECT COUNT(*) FROM lead_outreach) n")[0].n===0);}

console.log(`phase16_11 time ${((Date.now()-started)/1000).toFixed(1)} s`);
process.exit(done()?1:0);
