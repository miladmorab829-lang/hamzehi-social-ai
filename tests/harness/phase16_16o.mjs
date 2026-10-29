// PHASE 16.16-O — FINAL AGENT VALIDATION: autonomous operations simulation on the real orchestrator, Watchdog and ops store.
// (1) real scheduled cycles (real planner + real executors for the 11 modules); (2) injected faults through the orchestrator's
// executor seam: timeout, transient dependency failure, unavailable agent, failing draft, duplicate delivery, concurrent runs;
// (3) Watchdog recovery and dead-letter handling; (4) normal work continues; (5) financial / customer-message gates unchanged.
// Local only: in-memory D1; Telegram / OpenAI / search are in-process mocks; nothing leaves the machine; no paid call.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,J,done}=reporter("phase16_16o");
const started=Date.now();
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const W=await makeWorld({aiBrain:"off",extraEnv:{AUTONOMY_ORCHESTRATOR:"on",PUBLIC_WORKER_BASE_URL:"https://w.test"}});const {q,dbrun,call}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
const AE=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+"?p16o="+Math.random());await AE.autonomyMasterGate(W.env);
const WD=await import(pathToFileURL(path.join(SRC,"agent-watchdog.js")).href);
const ORCH=await import(pathToFileURL(path.join(SRC,"agent-orchestrator.js")).href);
const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;
const inner=globalThis.fetch;globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);if(s.startsWith("https://w.test/"))return W.run(new Request(s,o));return inner(u,o);};
const tick=async()=>{const p=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},W.env,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);};
const customerSends=()=>W.tg.filter(x=>/^send(Message|Photo|Video|MediaGroup|Document)$/.test(x.method)).length;
const metrics={};

// ---- 1. real scheduled cycles (photo_generate is a paid daily task with its own test, phototimeout; switched off here by the
// owner control so this run spends nothing — every other module runs its real executor)
{const off=await call("/api/autonomy/action",{module:"photo",action:"photo_generate",enabled:false});
 const sends0=customerSends(),cycles=[];
 for(let i=0;i<2;i++){const before=new Set(q("SELECT id FROM autonomy_tasks").map(r=>r.id));const t0=Date.now();await tick();const ms=Date.now()-t0;
  const rows=q("SELECT id,module,action,status,attempts,started_at,finished_at FROM autonomy_tasks").filter(r=>!before.has(r.id));cycles.push({ms,rows});}
 const all=cycles.flatMap(c=>c.rows),done_=all.filter(r=>r.status==="completed");
 const modules=new Set(done_.map(r=>r.module));
 metrics.real_cycles={cycles:cycles.length,tasks:all.length,completed:done_.length,failed:all.filter(r=>r.status==="failed").length,blocked:all.filter(r=>r.status==="blocked").length,
   success_rate:all.length?Math.round(done_.length*1000/all.length)/10:null,retries:all.reduce((s,r)=>s+Math.max(0,Number(r.attempts)-1),0),cycle_ms:cycles.map(c=>c.ms),
   task_ms_max:Math.max(0,...done_.map(r=>Date.parse(r.finished_at)-Date.parse(r.started_at))),modules:[...modules].sort()};
 ok("O1 owner switched the paid photo action off through the normal control (no new gate)",off.status===200,off.body);
 ok("O2 two real cron cycles plan and run the enabled agents: 11 modules (10 status + revenue funnel), 100 % completed, 0 failed, 0 blocked",
   metrics.real_cycles.tasks>=22&&metrics.real_cycles.completed===metrics.real_cycles.tasks&&modules.size===11,metrics.real_cycles);
 const hb=q("SELECT healthy FROM agent_heartbeat WHERE scheduler='autonomy'")[0],runs=q("SELECT healthy FROM agent_runs WHERE scheduler='autonomy'");
 ok("O3 orchestrator heartbeat healthy and every run recorded healthy",hb?.healthy===1&&runs.length>=2&&runs.every(r=>r.healthy===1),{hb,runs});
 ok("O4 no owner intervention needed: no approval request, no blocked task",q("SELECT COUNT(*) n FROM agent_approvals")[0].n===0&&metrics.real_cycles.blocked===0);
 ok("O5 no customer-facing Telegram send during autonomous cycles",customerSends()===sends0,customerSends()-sends0);}

// ---- 2. injected faults through the orchestrator's executor seam (same claim / lock / dead-letter / alert code as Production)
const PLAN_GOAL="Run a safe scheduled autonomy check using only enabled modules";
const enqueue=items=>{const cid="cmd-"+Math.random().toString(36).slice(2,10),t=new Date().toISOString();
  const plan={goal:PLAN_GOAL,mode:"execute",source:"scheduled",tasks:items.map(x=>({module:x.module,action:x.action,payload:x.payload||{},priority:50}))};
  dbrun("INSERT INTO autonomy_commands VALUES(?,?,?,?,?,?)",[cid,"Scheduled autonomy cycle",JSON.stringify(plan),"queued",t,t]);
  return items.map((x,i)=>{const id=`${x.tag}-${Math.random().toString(36).slice(2,8)}`;
    dbrun("INSERT INTO autonomy_tasks(id,command_id,module,action,status,priority,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",[id,cid,x.module,x.action,"queued",50-i,JSON.stringify(x.payload||{}),t,t]);return id;});};
const calls=new Map(),bump=id=>calls.set(id,(calls.get(id)||0)+1);
const req=()=>new Request("https://internal.local/api/autonomy/tasks/run",{method:"POST",headers:{Authorization:"Bearer tok"},body:"{}"});
const LIM={timeoutMs:250,backoffMs:10,retries:2};
const task=id=>q("SELECT status,attempts,error FROM autonomy_tasks WHERE id=?",[id])[0]||{};
const flaky=new Set();   // tasks that fail on their first call only
const behaviour=new Map();// id → "hang" | "down" | "fail"
const executor=async(env,r,t,{signal})=>{bump(t.id);const b=behaviour.get(t.id);
  if(b==="hang")return await new Promise((_,rej)=>{const keep=setTimeout(()=>rej(new Error("no abort")),20000);signal?.addEventListener("abort",()=>{clearTimeout(keep);rej(new DOMException("timed out","TimeoutError"));});});
  if(b==="down")throw new Error("agent unavailable: upstream connection refused");
  if(b==="fail")throw new Error("draft generation failed");
  if(flaky.has(t.id)&&calls.get(t.id)===1)throw new Error("temporary dependency failure (503)");
  return {ok:true,module:t.module,action:t.action};};
let F;
{const sends0=customerSends();
 const ids=enqueue([{tag:"TO",module:"website",action:"status"},{tag:"TR",module:"whatsapp",action:"status"},{tag:"DN",module:"instagram",action:"status"},
   {tag:"DR",module:"learning",action:"run"},{tag:"DUP1",module:"revenue",action:"funnel_snapshot"},{tag:"DUP2",module:"revenue",action:"funnel_snapshot"},
   {tag:"OK1",module:"crm",action:"status"},{tag:"OK2",module:"telegram",action:"status"},{tag:"OK3",module:"ads",action:"status"}]);
 F=Object.fromEntries(ids.map(id=>[id.split("-")[0],id]));
 behaviour.set(F.TO,"hang");flaky.add(F.TR);behaviour.set(F.DN,"down");behaviour.set(F.DR,"fail");
 const t0=Date.now();const r=await AE.runTasksOrchestrated(W.env,req(),50,{executor,limits:LIM});metrics.fault_run_ms=Date.now()-t0;
 metrics.fault_run={executed:r.executed,failed:r.failed,blocked:r.blocked,requeued:r.requeued,tasks:Object.fromEntries(Object.entries(F).map(([k,id])=>[k,{...task(id),calls:calls.get(id)||0}]))};
 ok("O6 TIMEOUT: a hanging read agent is abandoned at its timeout, retried within the limit (3 attempts) and then failed — never hangs the run",
   task(F.TO).status==="failed"&&/Timed out/.test(task(F.TO).error||"")&&calls.get(F.TO)===3&&metrics.fault_run_ms<5000,metrics.fault_run.tasks.TO);
 ok("O7 TRANSIENT dependency failure: the read task is retried automatically and completes (2 calls, no owner action)",task(F.TR).status==="completed"&&calls.get(F.TR)===2,metrics.fault_run.tasks.TR);
 ok("O8 UNAVAILABLE agent: bounded retries (exactly 3 calls) then failed into the dead-letter queue",task(F.DN).status==="failed"&&calls.get(F.DN)===3,metrics.fault_run.tasks.DN);
 ok("O9 a failing DRAFT task is never retried (1 call: a retried draft could duplicate work)",task(F.DR).status==="failed"&&calls.get(F.DR)===1,metrics.fault_run.tasks.DR);
 ok("O10 DUPLICATE delivery of the same job: executed once, the copy is blocked as a duplicate",(calls.get(F.DUP1)||0)+(calls.get(F.DUP2)||0)===1
   &&[task(F.DUP1).status,task(F.DUP2).status].sort().join()==="blocked,completed"&&/Duplicate of task/.test(task(F.DUP1).error||task(F.DUP2).error||""),[task(F.DUP1),task(F.DUP2)]);
 ok("O11 healthy agents in the same run are unaffected by the faults (crm, telegram, ads completed once each)",["OK1","OK2","OK3"].every(k=>task(F[k]).status==="completed"&&calls.get(F[k])===1));
 const dl=q("SELECT task_id,agent,state,attempts FROM agent_dead_letters WHERE resolved_at IS NULL");
 ok("O12 dead-letter queue holds exactly the three failed tasks (timeout, unavailable, draft), with agent and attempts",
   [F.TO,F.DN,F.DR].every(id=>dl.some(d=>d.task_id===id))&&dl.length===3&&dl.find(d=>d.task_id===F.TO)?.state==="timed_out",dl);
 const al=q("SELECT code,agent,level FROM agent_alerts WHERE recovery_state='open'");
 ok("O13 one dead_letters WARNING alert per affected agent (website, instagram, learning) — visible, nothing paused",
   ["autonomy:website","autonomy:instagram","autonomy:learning"].every(a=>al.some(x=>x.code==="dead_letters"&&x.agent===a&&x.level==="warning")),al);
 ok("O14 the run stays bounded and nothing was sent to a customer",customerSends()===sends0);}

// ---- 3. concurrent runs over the same queue (two Workers / two ticks): every task executes exactly once
{const ids=enqueue(["telegram","whatsapp","website","crm","ads","content"].map(m=>({tag:"CC",module:m,action:"status"})));
 const [a,b]=await Promise.all([AE.runTasksOrchestrated(W.env,req(),50,{executor,limits:LIM}),AE.runTasksOrchestrated(W.env,req(),50,{executor,limits:LIM})]);
 metrics.concurrent={run_a:{executed:a.executed,requeued:a.requeued},run_b:{executed:b.executed,requeued:b.requeued},calls:ids.map(id=>calls.get(id)||0)};
 ok("O15 two concurrent runs: each of 6 tasks executed exactly once (0 duplicate executions), all completed",ids.every(id=>calls.get(id)===1&&task(id).status==="completed")&&a.executed+b.executed===6,metrics.concurrent);}

// ---- 4. Watchdog: automatic recovery of read dead letters; drafts stay for the owner; heartbeat healthy
{const r=await WD.runWatchdog(W.env);
 metrics.watchdog={alerts:r.alerts,auto_retried:r.auto_retried,healthy:r.healthy,TO:task(F.TO).status,DN:task(F.DN).status,DR:task(F.DR).status};
 ok("O16 Watchdog re-queues the failed READ tasks automatically (timeout + unavailable = 2), no owner action",r.ok&&r.auto_retried===2&&task(F.TO).status==="queued"&&task(F.DN).status==="queued",metrics.watchdog);
 ok("O17 the failed DRAFT task is not auto-retried (owner re-queue only, by design)",task(F.DR).status==="failed");
 ok("O18 Watchdog stays healthy (only warnings) and writes its heartbeat",r.healthy===true&&q("SELECT healthy FROM agent_heartbeat WHERE scheduler='watchdog'")[0]?.healthy===1);
 // recovery: the dependency is back
 behaviour.delete(F.TO);behaviour.delete(F.DN);
 const rr=await AE.runTasksOrchestrated(W.env,req(),50,{executor,limits:LIM});
 metrics.recovery={executed:rr.executed,failed:rr.failed,TO:task(F.TO),DN:task(F.DN)};
 ok("O19 after recovery the re-queued tasks complete on the next run without intervention",task(F.TO).status==="completed"&&task(F.DN).status==="completed"&&rr.failed===0,metrics.recovery);
 const r2=await WD.runWatchdog(W.env,{nowMs:Date.now()+60000});
 const open=q("SELECT code,agent FROM agent_alerts WHERE recovery_state='open' AND code='dead_letters'");
 metrics.after_recovery={open_dead_letter_alerts:open,open_dead_letters:q("SELECT task_id FROM agent_dead_letters WHERE resolved_at IS NULL").map(x=>x.task_id)};
 ok("O20 recovered agents' dead letters are resolved; only the draft (learning) stays open for the owner",
   !metrics.after_recovery.open_dead_letters.includes(F.TO)&&!metrics.after_recovery.open_dead_letters.includes(F.DN)&&metrics.after_recovery.open_dead_letters.includes(F.DR),metrics.after_recovery);
 ok("O21 the auto-retry is bounded: a second Watchdog pass does not re-queue anything again",r2.auto_retried===0,r2);}

// ---- 5. repeated failures of one agent today → agent_failing alert; other agents keep working
{const ids=enqueue([1,2,3].map(n=>({tag:"RF",module:"media",action:"status",payload:{n}})));for(const id of ids)behaviour.set(id,"down");
 const ok1=enqueue([{tag:"AFTER",module:"crm",action:"status",payload:{after:1}}]);
 await AE.runTasksOrchestrated(W.env,req(),50,{executor,limits:{...LIM,retries:0}});
 const r=await WD.runWatchdog(W.env,{nowMs:Date.now()+120000});
 ok("O22 three failures of one agent in a day raise agent_failing (warning) for that agent only",r.alerts.includes("agent_failing")&&q("SELECT COUNT(*) n FROM agent_alerts WHERE code='agent_failing' AND agent='autonomy:media'")[0].n===1,r.alerts);
 ok("O23 other agents continue in the same run (crm completed)",task(ok1[0]).status==="completed");
 for(const id of ids)behaviour.delete(id);
 // The same Watchdog pass re-queued the three failed READ tasks (once per task per day). The planner adds a new cycle only when the
 // queue is empty, so the next real tick finishes the recovered work first (real executor, dependency back) and the tick after it
 // plans and runs the full cycle again.
 const requeued=ids.every(id=>task(id).status==="queued");
 await tick();const recovered=ids.every(id=>task(id).status==="completed");
 const cyc0=q("SELECT COUNT(*) n FROM autonomy_tasks WHERE status='completed'")[0].n;await tick();const fresh=q("SELECT COUNT(*) n FROM autonomy_tasks WHERE status='completed'")[0].n-cyc0;
 metrics.post_fault_ticks={requeued_by_watchdog:requeued,recovered_next_tick:recovered,fresh_cycle_completed:fresh};
 ok("O24 after the faults the REAL cron path recovers the re-queued work, then runs a full fresh cycle (11 tasks) autonomously",requeued&&recovered&&fresh>=11,metrics.post_fault_ticks);}

// ---- 6. authorization boundaries unchanged
{const caps=ORCH.AUTONOMY_ACTION_CAPABILITY;
 ok("O25 no orchestrator action is financial or customer-sending (none named price/quote/order/payment/discount/send/publish)",!Object.keys(caps).some(k=>/price|quote|order|payment|discount|send|publish/i.test(k)),Object.keys(caps));
 ok("O26 deny by default: an unknown action is classified side_effect (owner approval), drafts stay drafts",ORCH.autonomyActionCapability("telegram","broadcast_send")==="side_effect"&&caps["telegram:inbox_reply"]==="draft");
 const [unk]=enqueue([{tag:"UNK",module:"telegram",action:"broadcast_send"}]);const before=calls.get(unk)||0;
 await AE.runTasksOrchestrated(W.env,req(),50,{executor,limits:LIM});
 ok("O27 an unknown/side-effect action injected into the queue is never executed (blocked, executor not called)",task(unk).status==="blocked"&&(calls.get(unk)||0)===before,task(unk));
 const s=await call("/api/leads/outreach/send-telegram",{outreach_id:"does-not-exist"});
 ok("O28 the customer-send route still requires an approved outreach (refused for a non-approved id, nothing sent)",s.status>=400&&customerSends()===0,[s.status,s.body]);}

// ---- 7. owner dashboard visibility
{const ov=await call("/api/autonomy/agents/overview",null,"GET");
 const b=ov.body||{};
 ok("O29 Agent Control Center overview: orchestrator enabled, heartbeats, open alerts and dead letters with retry eligibility",
   ov.status===200&&b.orchestrator_enabled===true&&Array.isArray(b.alerts)&&b.alerts.length>0&&Array.isArray(b.dead_letters)&&b.dead_letters.every(d=>d.eligibility)&&b.dead_letter_summary,
   {status:ov.status,keys:Object.keys(b)});
 ok("O30 no request left the machine except the in-process mocks",!W.offNet().length,W.offNet());}

const allTasks=q("SELECT status,attempts FROM autonomy_tasks");
metrics.totals={tasks:allTasks.length,completed:allTasks.filter(r=>r.status==="completed").length,failed:allTasks.filter(r=>r.status==="failed").length,
  blocked:allTasks.filter(r=>r.status==="blocked").length,queued:allTasks.filter(r=>r.status==="queued").length,owner_approval_requests:q("SELECT COUNT(*) n FROM agent_approvals")[0].n,
  executor_calls:[...calls.values()].reduce((a,b)=>a+b,0)};
console.log("METRICS "+J(metrics));
console.log(`phase16_16o time ${((Date.now()-started)/1000).toFixed(1)} s`);
process.exit(done()?1:0);
