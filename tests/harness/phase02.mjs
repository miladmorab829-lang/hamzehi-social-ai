// STAGE 3 PHASE 02 — watchdog, dead-letter recovery, agent versions, quality score, cost budgets. Local only: paid executors are
// mocks, Telegram/AI are the harness mocks, the Stage 2B migration is applied to the in-memory database only.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,J,done}=reporter("phase02");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const W=await makeWorld();const {q,dbrun}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
W.env.AUTONOMY_ORCHESTRATOR="on";
const v="?p2="+Math.random();
const AE=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+v);await AE.autonomyMasterGate(W.env);
const WD=await import(pathToFileURL(path.join(SRC,"agent-watchdog.js")).href);
const ST=await import(pathToFileURL(path.join(SRC,"agent-ops-store.js")).href);
const T0="2026-10-20T00:00:00.000Z",NOW=Date.now(),isoAgo=ms=>new Date(NOW-ms).toISOString();
const reset=()=>{for(const t of ["autonomy_tasks","autonomy_locks","autonomy_commands","agent_dead_letters","agent_alerts","agent_approvals","agent_heartbeat","agent_runs","agent_versions"])dbrun(`DELETE FROM ${t}`);
  dbrun("DELETE FROM autonomy_controls WHERE key IN ('quotas','budgets')");dbrun("DELETE FROM autonomy_events");
  dbrun("INSERT INTO autonomy_commands(id,raw_command,plan_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",["c","test",JSON.stringify({mode:"execute",tasks:[{module:"photo",action:"photo_generate"},{module:"content",action:"generate_and_queue"},{module:"crm",action:"lead_discovery"},{module:"website",action:"growth_scan"},{module:"revenue",action:"funnel_snapshot"},{module:"ads",action:"discover_opportunities"}]}),"queued",T0,T0]);};
let prio=1000;const add=(id,module,action,payload={},extra={})=>dbrun("INSERT INTO autonomy_tasks(id,command_id,module,action,status,priority,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",[id,"c",module,action,extra.status||"queued",prio--,JSON.stringify({id,...payload}),T0,T0]);
const row=id=>q("SELECT * FROM autonomy_tasks WHERE id=?",[id])[0];
const orch=(ex,limits={})=>AE.runTasksOrchestrated(W.env,new Request("https://w.test/x"),20,{executor:ex,limits});
const alerts=code=>q("SELECT * FROM agent_alerts WHERE scheduler='watchdog' AND code=?",[code]);
const failRead=async(env,req,t)=>{const e=new Error("upstream 502");e.retryable=false;throw e;};

// ---- watchdog
reset();dbrun("INSERT INTO agent_heartbeat(scheduler,last_run_id,last_finished_at,healthy) VALUES('autonomy','r0',?,1)",[isoAgo(2*3600*1000)]);
{const r=await WD.runWatchdog(W.env);const a=alerts("heartbeat_missed");
 ok("W1 a stale orchestrator heartbeat raises ONE critical watchdog alert with cause, fallback status and the watchdog's own heartbeat",r.ok&&a.length===1&&a[0].level==="critical"&&/No orchestrator run finished/.test(a[0].cause_redacted)&&/not affected/.test(a[0].fallback_status)&&q("SELECT healthy FROM agent_heartbeat WHERE scheduler='watchdog'")[0]?.healthy===0,[r,a]);
 await WD.runWatchdog(W.env);const b=alerts("heartbeat_missed");
 ok("W2 the same problem again is deduplicated: still one open alert, occurrences 2, history kept",b.length===1&&b[0].occurrences===2&&b[0].recovery_state==="open",b);
 dbrun("UPDATE agent_heartbeat SET last_finished_at=? WHERE scheduler='autonomy'",[new Date().toISOString()]);await WD.runWatchdog(W.env);const c=alerts("heartbeat_missed")[0];
 ok("W3 when the heartbeat is fresh again the alert is marked recovered but stays visible until the owner acknowledges it",c.recovery_state==="recovered"&&c.recovered_at&&!c.acknowledged_at,c);
 const hub=await (await W.run(new Request("https://w.test/dashboard"))).text();
 ok("W3b critical unacknowledged agent alerts are the only agent items on the main dashboard (existing rule), details stay in the Control Center",hub.includes('a.level==="critical"&&!a.acknowledged_at')&&!/id="agentOpsCosts"/.test(hub),"");}
reset();add("s1","website","growth_scan",{},{status:"running"});dbrun("UPDATE autonomy_tasks SET started_at=? WHERE id='s1'",[isoAgo(40*60*1000)]);add("s2","revenue","funnel_snapshot",{},{status:"running"});dbrun("UPDATE autonomy_tasks SET started_at=? WHERE id='s2'",[isoAgo(60*1000)]);
{await WD.runWatchdog(W.env);const a=alerts("task_stuck");
 ok("W4 a task running for 40 min raises a task_stuck warning naming that task; a task started 1 min ago is not reported",a.length===1&&a[0].agent==="autonomy:website"&&JSON.parse(a[0].affected_tasks_json).includes("s1")&&!JSON.parse(a[0].affected_tasks_json).includes("s2"),a);}
reset();
{const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;dbrun("DELETE FROM agent_heartbeat");
 globalThis.__FAIL_SQL=/FROM autonomy_tasks t LEFT JOIN autonomy_commands/;const p=[];
 await WK.scheduled({cron:"*/15 * * * *"},W.env,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);globalThis.__FAIL_SQL=null;
 ok("W5 with the operational scheduler failing, the watchdog still runs independently (own heartbeat written) and flags the missing orchestrator heartbeat",!!q("SELECT 1 FROM agent_heartbeat WHERE scheduler='watchdog'").length&&alerts("heartbeat_missed").length===1,q("SELECT * FROM agent_heartbeat"));}
// ---- dead letters
reset();add("r1","website","growth_scan");
{await orch(failRead);dbrun("UPDATE autonomy_tasks SET status='queued' WHERE id='r1'");await orch(failRead);const dl=q("SELECT * FROM agent_dead_letters WHERE task_id='r1'");
 ok("D1 the same task failing again updates its open dead letter instead of adding a second one",dl.length===1&&dl[0].attempts>=2&&!dl[0].resolved_at,dl);
 const r=await WD.runWatchdog(W.env);const d=q("SELECT * FROM agent_dead_letters WHERE task_id='r1'")[0];
 ok("D2 the watchdog re-queues the failed READ-only task once (dead letter resolved 'retried' by 'watchdog', audited)",r.auto_retried===1&&row("r1").status==="queued"&&d.resolution==="retried"&&d.resolved_by==="watchdog"&&q("SELECT COUNT(*) n FROM autonomy_events WHERE type='agent_dead_letter_auto_retried'")[0].n===1,[r,row("r1").status,d]);
 await orch(failRead);await WD.runWatchdog(W.env);
 ok("D2b a second failure the same day is NOT re-queued again (one automatic retry per task per day)",row("r1").status==="failed"&&q("SELECT COUNT(*) n FROM autonomy_events WHERE type='agent_dead_letter_auto_retried'")[0].n===1&&q("SELECT COUNT(*) n FROM agent_dead_letters WHERE task_id='r1' AND resolved_at IS NULL")[0].n===1,row("r1").status);}
reset();add("p1","photo","photo_generate");
{let calls=0;await orch(async()=>{calls++;const e=new Error("provider 500");e.retryable=false;throw e;});
 dbrun("UPDATE agent_dead_letters SET created_at=? WHERE task_id='p1'",[isoAgo(30*3600*1000)]);await WD.runWatchdog(W.env);
 ok("D3 a failed PAID task is never re-queued automatically (no repeated paid side effect)",calls===1&&row("p1").status==="failed"&&!q("SELECT 1 FROM autonomy_events WHERE type='agent_dead_letter_auto_retried'").length,[calls,row("p1").status]);
 const a=alerts("dead_letter_unresolved");
 ok("D4 an unrecoverable failure older than 24 h is escalated as a warning alert (no approval request)",a.length===1&&JSON.parse(a[0].affected_tasks_json).includes("p1")&&q("SELECT COUNT(*) n FROM agent_approvals")[0].n===0,a);}
// ---- versions
reset();add("w1","website","growth_scan");
{await orch(async()=>({ok:true}));const act=q("SELECT * FROM agent_versions WHERE agent='autonomy:website'");
 ok("V1 each agent that ran has exactly one ACTIVE version row (the engine version)",act.length===1&&act[0].status==="active"&&act[0].version===AE.AUTONOMY_ENGINE_VERSION&&JSON.parse(act[0].notes).orchestrator_version,act);
 await ST.trackAgentVersions(W.env,{"autonomy:website":{versions:["autonomy-engine@test-next"]}});const rows=q("SELECT version,status FROM agent_versions WHERE agent='autonomy:website' ORDER BY status");
 add("a0","ads","discover_opportunities");await orch(async()=>({ok:true}));await ST.trackAgentVersions(W.env,{"autonomy:ads":{versions:["autonomy-engine@ads-next"]}});
 ok("V2 a new version becomes active and the old one is kept as 'previous' (rollback reference); still one active row",rows.filter(r=>r.status==="active").length===1&&rows.some(r=>r.status==="previous"&&r.version===AE.AUTONOMY_ENGINE_VERSION),rows);
 for(let i=0;i<5;i++){add("f"+i,"ads","discover_opportunities",{i});}await orch(failRead);
 dbrun("UPDATE agent_versions SET activated_at=? WHERE agent='autonomy:ads' AND status='active'",[isoAgo(3600*1000)]);   // the failures happened after this version was activated
 await WD.runWatchdog(W.env);const a=alerts("version_unhealthy");
 ok("V3 an unhealthy active version raises version_unhealthy with the previous version as rollback reference (no automatic deploy)",a.length===1&&/Rollback reference: autonomy-engine@/.test(a[0].fallback_status),a);}
// ---- quality
{const off0=W.offNet().length;const qs=await WD.qualitySummary(W.env);
 ok("Q1 the quality score is computed from stored outcomes only (no network/AI call): reliability %, run health, recurring problems with redacted errors",W.offNet().length===off0&&typeof qs.current.reliability==="number"&&qs.current.reliability<100&&qs.recurring_problems.length>=1&&qs.recurring_problems[0].action==="ads:discover_opportunities",qs);}
// ---- cost budgets
reset();dbrun("INSERT OR REPLACE INTO autonomy_controls(key,value,updated_at) VALUES('budgets',?,?)",[JSON.stringify({daily_units:10}),T0]);
add("b1","photo","photo_generate");add("b2","content","generate_and_queue");
{let calls=0;const ex=async()=>{calls++;await new Promise(r=>setTimeout(r,20));return {ok:true};};
 await Promise.all([orch(ex),orch(ex)]);
 ok("C1 a global daily budget of 10 units: of photo (8) + content (9) only one paid call runs, even with two concurrent runs; the other is deferred",calls===1&&[row("b1").status,row("b2").status].sort().join()==="completed,queued"&&q("SELECT COUNT(*) n FROM agent_dead_letters")[0].n===0&&q("SELECT COUNT(*) n FROM agent_approvals")[0].n===0,[calls,row("b1").status,row("b2").status]);}
reset();dbrun("INSERT OR REPLACE INTO autonomy_controls(key,value,updated_at) VALUES('budgets',?,?)",[JSON.stringify({providers:{openai:8}}),T0]);
add("c1","photo","photo_generate");add("c2","content","generate_and_queue");add("c3","crm","lead_discovery");
{let calls=0;await orch(async()=>{calls++;return {ok:true};});
 ok("C2 a provider budget (openai 8): the photo (openai 8) runs, content (openai 9) is deferred, lead discovery (google_places) still runs",calls===2&&row("c1").status==="completed"&&row("c2").status==="queued"&&row("c3").status==="completed",[calls,row("c1").status,row("c2").status,row("c3").status]);
 const cs=await AE.costSummary(W.env);
 ok("C2b the cost summary shows today's units against the budgets (global and per provider)",cs.providers.openai.used===8&&cs.providers.openai.budget===8&&cs.providers.google_places.used===16&&cs.units.used===24,cs);}
reset();dbrun("INSERT OR REPLACE INTO autonomy_controls(key,value,updated_at) VALUES('budgets',?,?)",[JSON.stringify({ads_runs_per_day:2}),T0]);dbrun("DELETE FROM system_events WHERE type='ads_autopilot_reserved'");
{const base=new Date();base.setUTCHours(1,0,0,0);const t=base.getTime();
 const [a,b]=await Promise.all([AE.reserveAdsAutopilotRun(W.env,t),AE.reserveAdsAutopilotRun(W.env,t)]);
 const c=await AE.reserveAdsAutopilotRun(W.env,t+60*60*1000),d=await AE.reserveAdsAutopilotRun(W.env,t+2*60*60*1000);
 ok("C3 Ads Autopilot runs are reserved atomically: two simultaneous ticks reserve once, one more after an hour, then the daily cap (2) refuses",[a,b].filter(Boolean).length===1&&c===true&&d===false,[a,b,c,d]);}
reset();dbrun("INSERT OR REPLACE INTO autonomy_controls(key,value,updated_at) VALUES('budgets',?,?)",[JSON.stringify({daily_units:0,providers:{openai:0,video:0,google_places:0},ads_runs_per_day:0}),T0]);
{const u={id:605000101,name:"Bud",username:"bud1"};await W.send(u,"سلام، قیمت جعبه نیم ست چنده؟");
 const ib=q("SELECT * FROM inbox_messages WHERE provider_sender_id=?",[String(u.id)]);const dr=ib.length?q("SELECT * FROM lead_outreach WHERE inbox_message_id=?",[ib[0].id]):[];
 ok("C4 with every budget at zero a customer message is still stored and answered/drafted as before (budgets never touch the sales path)",ib.length===1&&(dr.length>=1||W.tg.some(x=>/sendMessage/.test(x.method)&&x.body.includes(String(u.id)))),[ib.length,dr.length]);}
ok("ISOLATION no external network call",W.offNet().length===0,W.offNet());
process.exit(done()?1:0);
