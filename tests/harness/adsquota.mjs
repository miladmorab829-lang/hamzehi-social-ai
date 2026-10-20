// ADS RUN BUDGET — every real Ads execution (cron, admin Autopilot run/start, the autonomy ads task, manual discovery, auto-run,
// follow-up drafting) shares ONE atomic reservation: daily cap + 55-minute minimum interval, UTC reset. Read-only Ads routes never
// reserve. Local only: search engines, sites and OpenAI are in-process mocks; the worker's own URL is routed back into the test worker.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,J,done}=reporter("adsquota");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const W=await makeWorld({extraEnv:{OPENAI_API_KEY:"test-openai-not-real",PUBLIC_WORKER_BASE_URL:"https://w.test"}});const {q,dbrun,call}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
W.env.AUTONOMY_ORCHESTRATOR="on";
const AE=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+"?ads="+Math.random());await AE.autonomyMasterGate(W.env);
const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;
// external mocks
let search=0,site=0,openai=0;const inner=globalThis.fetch;
globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);
  if(s.startsWith("https://w.test/"))return W.run(new Request(s,o));
  if(/^https:\/\/www\.(google|bing)\.com\/search/.test(s)){search++;return new Response('<html><a href="https://shop.example/">فروشگاه طلا</a><a href="/url?q=https://shop.example/&sa=U">x</a></html>',{status:200,headers:{"Content-Type":"text/html"}});}
  if(s.startsWith("https://shop.example")){site++;return new Response('<html><title>گالری طلای نمونه</title><body>طلا و جواهر ایران — Iran gold jewelry. آدرس: تهران، خیابان نمونه. <a href="/contact">contact us</a></body></html>',{status:200,headers:{"Content-Type":"text/html"}});}
  if(s==="https://api.openai.com/v1/responses"){openai++;return new Response(JSON.stringify({output_text:"پیش‌نویس آزمایشی",output:[{type:"message",content:[{type:"output_text",text:"پیش‌نویس آزمایشی"}]}]}),{status:200,headers:{"Content-Type":"application/json"}});}
  return inner(u,o);};
const reservations=()=>q("SELECT COUNT(*) n FROM system_events WHERE type='ads_autopilot_reserved'")[0].n;
const setBudget=b=>dbrun("INSERT OR REPLACE INTO autonomy_controls(key,value,updated_at) VALUES('budgets',?,?)",[JSON.stringify(b),new Date().toISOString()]);
const clear=()=>{dbrun("DELETE FROM system_events WHERE type IN ('ads_autopilot_reserved','ads_run_deferred','ad_autopilot_run')");};
const tick=async()=>{const p=[];await WK.scheduled({cron:"*/15 * * * *"},W.env,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);};
const input={type:"gold",city:"تهران",extra:""};

await call("/api/ads/autopilot/status",null,"GET");   // creates system_kv like the dashboard does
// A1 manual first, then the cron tick inside 55 minutes → the cron is deferred (one shared reservation)
clear();dbrun("INSERT OR REPLACE INTO system_kv(key,value,updated_at) VALUES('ads_autopilot_config',?,?)",[JSON.stringify({enabled:true,...input}),new Date().toISOString()]);
{const m=await call("/api/ads/autopilot",input);const s0=search;await tick();
 ok("A1 a manual Autopilot run reserves the shared slot; the next cron tick inside 55 min is deferred and makes no search call",m.status===200&&!m.body.deferred&&reservations()===1&&search===s0&&q("SELECT COUNT(*) n FROM system_events WHERE type='ads_run_deferred'")[0].n>=1,[m.status,m.body?.deferred,reservations(),search-s0]);}
// A2 cron first, then manual → manual deferred with a clear 200 result
clear();{const s0=search;await tick();const ran=search>s0;const m=await call("/api/ads/autopilot",input);
 ok("A2 cron first, then a manual run: the manual request returns 200 {ok:true, deferred:true, reason:'ads_daily_limit'} and does nothing",ran&&m.status===200&&m.body.ok===true&&m.body.deferred===true&&m.body.reason==="ads_daily_limit"&&reservations()===1,[ran,m.status,m.body]);}
// A3 two simultaneous manual requests → exactly one runs
clear();{const s0=search;const [x,y]=await Promise.all([call("/api/ads/autopilot",input),call("/api/ads/autopilot",input)]);
 ok("A3 two simultaneous manual requests: exactly one reserves and runs, the other is deferred",[x,y].filter(r=>r.body.deferred).length===1&&reservations()===1,[x.body?.deferred,y.body?.deferred,reservations(),search-s0]);}
// A4 55-minute interval and A5 UTC reset (direct reservation with a fixed clock)
clear();setBudget({ads_runs_per_day:2});
{const d=new Date();d.setUTCHours(10,0,0,0);const t=d.getTime();
 const r1=await AE.reserveAdsAutopilotRun(W.env,t,"t"),r2=await AE.reserveAdsAutopilotRun(W.env,t+54*60000,"t"),r3=await AE.reserveAdsAutopilotRun(W.env,t+56*60000,"t"),r4=await AE.reserveAdsAutopilotRun(W.env,t+120*60000,"t");
 ok("A4 minimum interval: a run 54 min later is refused, 56 min later allowed; the daily cap (2) then refuses a third",r1&&!r2&&r3&&!r4,[r1,r2,r3,r4]);
 const next=new Date(d);next.setUTCDate(next.getUTCDate()+1);next.setUTCHours(0,5,0,0);
 ok("A5 UTC reset: the next UTC day starts with a fresh daily cap",await AE.reserveAdsAutopilotRun(W.env,next.getTime(),"t")===true,"");
 const m=new Date(next);m.setUTCDate(m.getUTCDate()+1);m.setUTCHours(6,40,0,0);const s1=await AE.reserveAdsAutopilotRun(W.env,m.getTime(),"autopilot_scheduled"),s2=await AE.reserveAdsAutopilotRun(W.env,m.getTime()+20*60000,"daily_followups",{spacing:false}),s3=await AE.reserveAdsAutopilotRun(W.env,m.getTime()+30*60000,"daily_followups",{spacing:false});
 ok("A5b the 07:00 follow-up sweep is not skipped by an Autopilot run 20 min earlier (no spacing), but still counts toward the daily cap (2)",s1&&s2&&!s3,[s1,s2,s3]);}
dbrun("DELETE FROM system_events WHERE type='ads_autopilot_reserved' AND created_at>?",[new Date().toISOString()]);
// A6 every other real Ads executor is gated; read-only routes are free
clear();setBudget({ads_runs_per_day:24});
{await call("/api/ads/autopilot",input);const n0=reservations(),s0=search,o0=openai;
 const d=await call("/api/ads/discover",{type:"gold",city:"تهران"}),ar=await call("/api/ads/auto-run",input),f=await call("/api/ads/followups/run",{});
 ok("A6 manual discovery, auto-run and follow-up drafting share the same budget: all deferred inside the interval, no search, site or OpenAI call",[d,ar,f].every(r=>r.status===200&&r.body.deferred===true)&&search===s0&&openai===o0&&reservations()===n0,[d.body,ar.body?.deferred,f.body?.deferred]);
 const ro=[await call("/api/ads/autopilot/status",null,"GET"),await call("/api/ads/preflight",null,"GET"),await call("/api/ads/overview",null,"GET"),await call("/api/ads/targets",null,"GET"),await call("/api/ads/followups",null,"GET")];
 ok("A6b read-only Ads routes (status, preflight, overview, targets, follow-up list) never consume the budget",ro.every(r=>r.status<500)&&reservations()===n0,ro.map(r=>r.status));}
// A7 the autonomy ads task hitting the limit completes as deferred (no dead letter, no approval, not retried)
{dbrun("DELETE FROM autonomy_tasks");dbrun("DELETE FROM autonomy_commands");
 dbrun("INSERT INTO autonomy_commands(id,raw_command,plan_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",["c","test",JSON.stringify({mode:"execute",tasks:[{module:"ads",action:"discover_opportunities"}]}),"queued","2026-10-20T00:00:00.000Z","2026-10-20T00:00:00.000Z"]);
 dbrun("INSERT INTO autonomy_tasks(id,command_id,module,action,status,priority,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",["ad1","c","ads","discover_opportunities","queued",500,JSON.stringify(input),"2026-10-20T00:00:00.000Z","2026-10-20T00:00:00.000Z"]);
 const s0=search;await AE.runTasksOrchestrated(W.env,new Request("https://w.test/x"),20);const t=q("SELECT * FROM autonomy_tasks WHERE id='ad1'")[0];
 ok("A7 the autonomy ads task inside the interval completes with a deferred result: no Ads call, no dead letter, no approval",t.status==="completed"&&/"deferred":true/.test(t.result_json||"")&&search===s0&&!q("SELECT 1 FROM agent_dead_letters WHERE task_id='ad1'").length&&q("SELECT COUNT(*) n FROM agent_approvals")[0].n===0,[t.status,(t.result_json||"").slice(0,120)]);}
// A8 CRM protection: an Ads run that re-finds a customer's website never re-drafts or re-stages that lead
clear();
{const now="2026-10-01T00:00:00.000Z";
 // the site was already found by A1-A3; the owner has since turned that lead into a customer with their own notes
 const ids=q("SELECT DISTINCT lead_id FROM lead_identities WHERE identity_key LIKE '%shop.example%'").map(r=>r.lead_id);
 ok("A8a the earlier Ads runs created exactly one lead for the site (dedup across runs)",ids.length===1,ids);
 dbrun("UPDATE leads SET id='L-CUST' WHERE id=?",[ids[0]]);dbrun("UPDATE lead_identities SET lead_id='L-CUST' WHERE lead_id=?",[ids[0]]);
 dbrun("UPDATE leads SET stage='customer',notes=?,updated_at=? WHERE id='L-CUST'",[JSON.stringify({manual_notes:"مشتری فعلی"}),now]);
 const before=q("SELECT stage,notes,updated_at FROM leads WHERE id='L-CUST'")[0],s0=search;const r=await call("/api/ads/auto-run",input);const after=q("SELECT stage,notes,updated_at FROM leads WHERE id='L-CUST'")[0];
 ok("A8 an Ads auto-run that finds a customer's site again leaves that customer lead's stage, notes and timestamp untouched",r.status===200&&search>s0&&after.stage==="customer"&&after.notes===before.notes&&after.updated_at===before.updated_at,[r.body?.deferred,search-s0,after.stage]);}
ok("A9 nothing was sent to Telegram by any Ads path (drafts only)",!W.tg.some(x=>/^send/.test(x.method)),W.tg.map(x=>x.method));
ok("ISOLATION only in-process mocks were called (search, sites and OpenAI mocked; no real network)",W.offNet().every(u=>/google\.com|bing\.com|shop\.example|api\.openai\.com|w\.test/.test(u)),W.offNet().filter(u=>!/google\.com|bing\.com|shop\.example|api\.openai\.com|w\.test/.test(u)));
process.exit(done()?1:0);
