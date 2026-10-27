// PHASE 16.4 — operational resilience (local): A watchdog / alert lifecycle (race-safe alert dedup, watchdog-of-watchdog, transient vs
// sustained incidents, overlapping runs), B retry queue (permanent failures fail at once, stale 'running' rows are failed for the owner
// and never replayed), C rollback eligibility (read-only, owner deploy only), D Sales-AI cost protection (provider cooldown after
// 429/401/403, optional output-token cap inactive by default, truncation and timeout fail closed).
// Local only: every provider is an in-process mock; nothing reaches Production, a customer or a paid API.
import fs from "node:fs";import path from "node:path";import {fileURLToPath,pathToFileURL} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,J,done}=reporter("phase16_4");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const imp=f=>import(pathToFileURL(path.join(SRC,f)).href);
const started=Date.now();
const {raiseAlerts,recordRun,incidentState,opsOverview}=await imp("agent-ops-store.js");
const {runWatchdog,rollbackEligibility}=await imp("agent-watchdog.js");
const AI=await imp("sales-ai-brain.js");
const W=await makeWorld();const {q,dbrun,call}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
await call("/api/autonomy/status",null,"GET");
const NOW=Date.now(),ago=m=>new Date(NOW-m*60000).toISOString();let n=0;
const task=(m,a,st,at)=>dbrun("INSERT INTO autonomy_tasks(id,command_id,module,action,status,priority,payload_json,error,attempts,started_at,finished_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",["T"+(++n),"c",m,a,st,40,"{}",null,1,at,st==="running"||st==="queued"?null:at,at,at]);
const report=(t,{healthy=true}={})=>({run_id:"run-"+(++n),orchestrator_version:"1.0.0",started_at:t,finished_at:t,duration_ms:10,counts:{},budget:{spent:0,limit:100},alerts:[],dead_letters:[],tasks:[],agents:{},heartbeat:{healthy}});

// ================= A. watchdog and alert lifecycle =================
{const t=ago(1),same={code:"agent_failing",agent:"autonomy:photo",level:"warning",cause:"x"};
 let threw=null;try{await Promise.all([1,2,3,4,5].map(()=>raiseAlerts(W.env,"watchdog",[same],"r",t)));}catch(e){threw=String(e?.message||e);}
 const rows=q("SELECT occurrences FROM agent_alerts WHERE code='agent_failing'");
 ok("A1 five OVERLAPPING raises of the same incident never throw and keep ONE open alert (all occurrences counted)",!threw&&rows.length===1&&rows[0].occurrences===5,[threw,rows]);
 dbrun("DELETE FROM agent_alerts");
 // overlapping watchdog runs with a stuck task: both finish and write the heartbeat
 task("photo","photo_generate","running",ago(40));
 const [w1,w2]=await Promise.all([runWatchdog(W.env,{nowMs:NOW}),runWatchdog(W.env,{nowMs:NOW})]);
 ok("A2 two overlapping Watchdog runs both complete, one task_stuck alert, heartbeat written",w1.ok&&w2.ok&&q("SELECT COUNT(*) n FROM agent_alerts WHERE code='task_stuck'")[0].n===1&&q("SELECT COUNT(*) n FROM agent_heartbeat WHERE scheduler='watchdog'")[0].n===1,[w1,w2]);
 // watchdog-of-watchdog: the orchestrator run raises watchdog_missed only when a watchdog heartbeat exists and is stale
 dbrun("DELETE FROM agent_heartbeat WHERE scheduler='watchdog'");await recordRun(W.env,"autonomy",report(new Date(NOW).toISOString()));
 ok("A3 no Watchdog heartbeat yet (fresh install) → no watchdog_missed alert",!q("SELECT 1 FROM agent_alerts WHERE code='watchdog_missed'").length);
 dbrun("INSERT INTO agent_heartbeat(scheduler,last_run_id,last_finished_at,healthy) VALUES('watchdog','w',?,1)",[ago(50)]);await recordRun(W.env,"autonomy",report(new Date(NOW).toISOString()));
 const wm=q("SELECT scheduler,agent,level,recovery_state,fallback_status FROM agent_alerts WHERE code='watchdog_missed'");
 ok("A4 a stale Watchdog (50 min) is detected INDEPENDENTLY by the orchestrator run: critical watchdog_missed with its fallback",wm.length===1&&wm[0].scheduler==="autonomy"&&wm[0].level==="critical"&&wm[0].recovery_state==="open"&&!!wm[0].fallback_status,wm);
 await recordRun(W.env,"autonomy",report(new Date(NOW+60000).toISOString()));
 ok("A5 the repeated detection is de-duplicated (one row, occurrences 2)",q("SELECT COUNT(*) n,MAX(occurrences) o FROM agent_alerts WHERE code='watchdog_missed'")[0].o===2);
 dbrun("UPDATE agent_heartbeat SET last_finished_at=? WHERE scheduler='watchdog'",[new Date(NOW).toISOString()]);await recordRun(W.env,"autonomy",report(new Date(NOW+120000).toISOString()));
 ok("A6 when the Watchdog runs again the alert is recovered by the existing lifecycle",q("SELECT recovery_state FROM agent_alerts WHERE code='watchdog_missed'")[0].recovery_state==="recovered");
 const base={recovery_state:"open",first_seen_at:ago(10),last_seen_at:ago(5)};
 ok("A7 incident state: one short detection is transient; 3+ detections or 45+ min open is sustained; a recovered alert is not open",
  incidentState({...base,occurrences:1})==="transient"&&incidentState({...base,occurrences:3})==="sustained"&&incidentState({...base,occurrences:1,first_seen_at:ago(60)})==="sustained"&&incidentState({recovery_state:"recovered"})==="recovered");
 const ov=await opsOverview(W.env,{nowMs:NOW});
 ok("A8 the ops overview labels every alert with its incident state (severity, agent, cause, fallback kept)",ov.alerts.length>0&&ov.alerts.every(a=>["transient","sustained","recovered"].includes(a.incident_state)&&a.level&&a.agent&&"fallback_status" in a),ov.alerts.map(a=>[a.code,a.incident_state]));}

// ================= B. retry queue =================
{const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;
 const tick=async()=>{const p=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},W.env,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);};
 const rq=(id,op,payload,status="queued",updated=new Date().toISOString())=>dbrun("INSERT INTO retry_queue VALUES(?,?,?,?,?,?,?,?,?,?)",[id,op,JSON.stringify(payload),0,3,status,null,"x",updated,updated]);
 rq("RQ-UNSUP","bogus_operation",{});rq("RQ-BADPAY","video_generation",{});
 rq("RQ-STALE","content_distribution",{distribution_id:"D-X",target:"telegram"},"running",ago(40));rq("RQ-FRESH","content_distribution",{distribution_id:"D-Y",target:"telegram"},"running",ago(5));
 const tg0=W.tg.length;await tick();
 const row=id=>q("SELECT status,attempts,last_error,next_attempt_at FROM retry_queue WHERE id=?",[id])[0];
 ok("B1 an unsupported operation fails at the FIRST attempt as permanent (no further retries scheduled)",row("RQ-UNSUP").status==="failed"&&row("RQ-UNSUP").attempts===1&&/^permanent:/.test(row("RQ-UNSUP").last_error)&&row("RQ-UNSUP").next_attempt_at===null,row("RQ-UNSUP"));
 ok("B2 an incomplete payload is a permanent failure too",row("RQ-BADPAY").status==="failed"&&/^permanent:/.test(row("RQ-BADPAY").last_error),row("RQ-BADPAY"));
 ok("B3 a row stuck 'running' for 40 min is failed for owner review and NOT re-run (attempts unchanged, nothing sent)",row("RQ-STALE").status==="failed"&&/stale_running/.test(row("RQ-STALE").last_error)&&row("RQ-STALE").attempts===0&&W.tg.length===tg0,row("RQ-STALE"));
 ok("B4 a row running for only 5 min is left alone",row("RQ-FRESH").status==="running",row("RQ-FRESH"));
 await tick();
 ok("B5 a second tick does not touch the failed rows again (idempotent)",row("RQ-UNSUP").attempts===1&&row("RQ-STALE").attempts===0);}

// ================= C. rollback eligibility =================
{dbrun("DELETE FROM agent_versions");dbrun("DELETE FROM autonomy_tasks");
 const ver=(agent,v,status,at)=>dbrun("INSERT INTO agent_versions(agent,version,status,activated_at,activated_by,notes) VALUES(?,?,?,?,?,?)",[agent,v,status,at,"test","{}"]);
 ver("autonomy:photo","p1","previous",ago(600));ver("autonomy:photo","p2","active",ago(100));for(let i=0;i<4;i++)task("photo","photo_generate","completed",ago(300+i));task("photo","photo_generate","failed",ago(310));
 ver("autonomy:content","c1","previous",ago(600));ver("autonomy:content","c2","active",ago(100));for(let i=0;i<4;i++)task("content","generate_and_queue","failed",ago(300+i));task("content","generate_and_queue","completed",ago(320));
 ver("autonomy:crm","k1","previous",ago(600));ver("autonomy:crm","k2","active",ago(100));task("crm","lead_discovery","completed",ago(300));
 ver("autonomy:media","m1","active",ago(100));
 const vs0=J(q("SELECT * FROM agent_versions ORDER BY agent,version"));
 const r=Object.fromEntries((await rollbackEligibility(W.env)).map(x=>[x.agent,x]));
 ok("C1 a previous version with a healthy record is eligible (4 of 5 succeeded), owner deploy only",r["autonomy:photo"]?.eligible===true&&r["autonomy:photo"].previous_version==="p1"&&r["autonomy:photo"].action==="owner_approved_worker_deploy_only",r["autonomy:photo"]);
 ok("C2 a previous version that mostly failed is NOT eligible",r["autonomy:content"]?.eligible===false&&r["autonomy:content"].reason==="previous_version_unhealthy",r["autonomy:content"]);
 ok("C3 too little history → not eligible (insufficient_history)",r["autonomy:crm"]?.eligible===false&&r["autonomy:crm"].reason==="insufficient_history",r["autonomy:crm"]);
 ok("C4 no previous version → not eligible",r["autonomy:media"]?.eligible===false&&r["autonomy:media"].reason==="no_previous_version",r["autonomy:media"]);
 ok("C5 the eligibility check changes no version row (read-only, no rollback performed)",J(q("SELECT * FROM agent_versions ORDER BY agent,version"))===vs0);
 const ov=await call("/api/autonomy/agents/overview",null,"GET");
 ok("C6 the Agent Control Center overview carries the rollback eligibility list",Array.isArray(ov.body?.rollback)&&ov.body.rollback.some(x=>x.agent==="autonomy:photo"&&x.eligible===true),[ov.status,ov.body?.rollback]);}

// ================= D. Sales-AI cost protection =================
{const inner=globalThis.fetch;let calls=[],mode="429";
 globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);if(!/api\.openai\.com|api\.anthropic\.com/.test(s))return inner(u,o);calls.push({url:s,body:JSON.parse(o.body||"{}")});
  if(mode==="429")return new Response("{}",{status:429});if(mode==="401")return new Response("{}",{status:401});
  if(mode==="incomplete")return new Response(JSON.stringify({status:"incomplete",output:[]}),{status:200});
  if(mode==="hang")return await new Promise((_,rej)=>o.signal?.addEventListener("abort",()=>rej(Object.assign(new Error("aborted"),{name:"AbortError"}))));
  return new Response(JSON.stringify({output_text:"{}"}),{status:200});};
 const env={OPENAI_API_KEY:"test-not-real",SALES_AI_PROVIDER:"openai"},call1=(e=env,extra={})=>AI.callSalesAi(e,{instructions:"i",input:"x",...extra});
 AI.resetSalesAiCooldown();const a=await call1(),b=await call1(),c=await call1();
 ok("D1 after a 429 the next calls skip the provider (provider_cooldown, no request) — no retry, no other provider",a.error==="provider_http_429"&&b.error==="provider_cooldown"&&c.error==="provider_cooldown"&&calls.length===1&&calls.every(x=>/openai/.test(x.url)),[a.error,b.error,calls.length]);
 const later=await call1(env,{nowMs:Date.now()+AI.SALES_AI_COOLDOWN_MS[429]+1000});
 ok("D2 after the cooldown the provider is tried again",later.error==="provider_http_429"&&calls.length===2,[later.error,calls.length]);
 AI.resetSalesAiCooldown();calls=[];mode="401";await call1();await call1();
 ok("D3 a 401 (key / quota exhausted) also cools down, for longer",calls.length===1&&AI.salesAiCooldownUntil("openai")-Date.now()>60000);
 AI.resetSalesAiCooldown();calls=[];mode="429";const off={...env,SALES_AI_PROVIDER_COOLDOWN:"off"};await call1(off);await call1(off);
 ok("D4 SALES_AI_PROVIDER_COOLDOWN=off restores the previous behaviour (every call goes out)",calls.length===2);
 AI.resetSalesAiCooldown();calls=[];mode="ok";await call1();
 ok("D5 by default no output-token cap is sent (inactive until the owner sets one)",!("max_output_tokens" in calls[0].body),calls[0].body);
 calls=[];await call1({...env,SALES_AI_MAX_OUTPUT_TOKENS:"999999"});await call1({...env,SALES_AI_MAX_OUTPUT_TOKENS:"10"});
 ok("D6 a configured cap is bounded (≤16000, ≥256)",calls[0].body.max_output_tokens===16000&&calls[1].body.max_output_tokens===256,calls.map(x=>x.body.max_output_tokens));
 calls=[];mode="incomplete";const inc=await call1();
 ok("D7 a truncated (incomplete) answer fails closed as provider_truncated",inc.ok===false&&inc.error==="provider_truncated",inc);
 mode="hang";const t0=Date.now(),to=await call1(env,{timeoutMs:1000});
 ok("D8 a hanging provider is abandoned at the timeout (provider_timeout, no cooldown)",to.error==="provider_timeout"&&Date.now()-t0<3000&&AI.salesAiCooldownUntil("openai")===0,[to.error,Date.now()-t0]);
 AI.resetSalesAiCooldown();globalThis.fetch=inner;}
ok("E1 no request left the machine except the in-process mocks",!W.offNet().length,W.offNet());
console.log(`phase16_4 time ${((Date.now()-started)/1000).toFixed(1)} s`);
process.exit(done()?1:0);
