// AGENT WATCHDOG — Stage 3. Runs in its own ctx.waitUntil on the */15 cron, before and independently of the autonomy scheduler: it only
// reads the ops tables (heartbeat, runs, tasks, dead letters, versions), raises/recovers alerts through the shared alert lifecycle and
// re-queues failed READ-ONLY tasks (allow-list, once per task per day). It never runs a task, never repeats a paid or draft side effect,
// never sends anything, never approves anything and never deploys or rolls back code. Every query is bounded.
import { raiseAlerts, recoverOpenAlerts, opsAvailable, autoRetryReadDeadLetter } from "./agent-ops-store.js";
import { AUTONOMY_ACTION_CAPABILITY, safeErrorText } from "./agent-orchestrator.js";

export const WATCHDOG=Object.freeze({heartbeatStaleMs:35*60*1000,stuckTaskMs:20*60*1000,deadLetterEscalateMs:24*3600*1000,maxAutoRetries:5,failingTasksPerDay:3,versionMinTasks:4});
const iso=ms=>new Date(ms).toISOString();
const dayStartOf=ms=>{const d=new Date(ms);d.setUTCHours(0,0,0,0);return d.toISOString();};
// Explicit allow-list of read-only actions that may be re-run automatically (never derived from names or payloads).
const AUTO_RETRY_READ=new Set(Object.entries(AUTONOMY_ACTION_CAPABILITY).filter(([,c])=>c==="read").map(([k])=>k));
const isAutoRetryable=(module,action)=>action==="status"||AUTO_RETRY_READ.has(`${module}:${action}`);

export async function runWatchdog(env,{nowMs=Date.now(),orchestratorOn=env?.AUTONOMY_ORCHESTRATOR==="on"}={}){
  if(!(await opsAvailable(env)))return {ok:false,reason:"not_migrated"};
  const t=iso(nowMs),day=dayStartOf(nowMs),raised=[],all=async(sql,...b)=>((await env.DB.prepare(sql).bind(...b).all()).results||[]);
  let master="on";try{master=(await env.DB.prepare("SELECT value FROM autonomy_controls WHERE key='master'").first())?.value||"on";}catch{}
  // 1. Missing heartbeat / unhealthy runs (only when the orchestrated scheduler is expected to run).
  if(orchestratorOn&&master==="on"){
    const hb=await env.DB.prepare("SELECT last_finished_at,healthy FROM agent_heartbeat WHERE scheduler='autonomy'").first();
    const age=hb?nowMs-Date.parse(hb.last_finished_at):Infinity;
    if(!(age<WATCHDOG.heartbeatStaleMs))raised.push({code:"heartbeat_missed",agent:"orchestrator",level:"critical",cause:hb?`No orchestrator run finished for ${Math.round(age/60000)} min`:"No orchestrator heartbeat recorded yet",
      fallback:"Queued tasks wait; customer replies, publishing gates and owner approvals are not affected"});
    const runs=await all("SELECT healthy FROM agent_runs WHERE scheduler='autonomy' ORDER BY started_at DESC LIMIT 3");
    if(runs.length===3&&runs.every(r=>Number(r.healthy)===0))raised.push({code:"runs_unhealthy",agent:"orchestrator",level:"critical",cause:"The last 3 orchestrator runs were unhealthy",fallback:"Failed tasks stay in the dead-letter queue; nothing is retried automatically except read-only checks"});
  }
  // 2. Stuck tasks (running far longer than any timeout).
  const stuck=await all("SELECT id,module FROM autonomy_tasks WHERE status='running' AND started_at<? LIMIT 50",iso(nowMs-WATCHDOG.stuckTaskMs));
  const byModule=new Map();for(const s of stuck){const l=byModule.get(s.module)||[];l.push(s.id);byModule.set(s.module,l);}
  for(const [m,ids] of byModule)raised.push({code:"task_stuck",agent:`autonomy:${m}`,level:"warning",cause:`${ids.length} task(s) running for more than ${WATCHDOG.stuckTaskMs/60000} min`,tasks:ids,fallback:"The module lock is released by the stale-lock recovery after 15 min; the task is not re-run automatically"});
  // 3. Repeated failures of one agent today.
  for(const f of await all("SELECT module,COUNT(*) n FROM autonomy_tasks WHERE status='failed' AND finished_at>=? GROUP BY module HAVING n>=? LIMIT 20",day,WATCHDOG.failingTasksPerDay))
    raised.push({code:"agent_failing",agent:`autonomy:${f.module}`,level:"warning",cause:`${f.n} failed task(s) today`,fallback:"Other agents continue; failed tasks are in the dead-letter queue"});
  // 4. Dead letters: bounded automatic recovery of read-only tasks; escalation (alert only, no approval) for old unrecoverable ones.
  let autoRetried=0;
  const open=await all("SELECT d.id,d.task_id,d.agent,d.created_at,t.module,t.action,t.status FROM agent_dead_letters d LEFT JOIN autonomy_tasks t ON t.id=d.task_id WHERE d.resolved_at IS NULL ORDER BY d.created_at ASC LIMIT 100");
  const stale=[];
  for(const d of open){
    if(d.status==="failed"&&isAutoRetryable(d.module,d.action)&&autoRetried<WATCHDOG.maxAutoRetries){if(await autoRetryReadDeadLetter(env,{id:d.id,taskId:d.task_id,agent:d.agent,dayStart:day,nowMs}))autoRetried++;continue;}
    if(nowMs-Date.parse(d.created_at)>WATCHDOG.deadLetterEscalateMs)stale.push(d);
  }
  const staleBy=new Map();for(const d of stale){const l=staleBy.get(d.agent)||[];l.push(d.task_id);staleBy.set(d.agent,l);}
  for(const [agent,ids] of staleBy)raised.push({code:"dead_letter_unresolved",agent,level:"warning",cause:`${ids.length} failed task(s) unresolved for more than 24 h (not retried automatically: paid, draft or not recoverable)`,tasks:ids,fallback:"Re-queue or dismiss in the Agent Control Center; paid work stays within the daily quota"});
  // 5. Unhealthy active agent version (rollback reference only; code rollback is an owner-approved Worker deploy).
  for(const v of await all("SELECT agent,version,activated_at FROM agent_versions WHERE status='active' AND activated_at>=? LIMIT 50",iso(nowMs-7*86400000))){
    const m=String(v.agent).replace(/^autonomy:/,"");
    const s=await env.DB.prepare("SELECT SUM(status='failed') f,SUM(status='completed') c FROM autonomy_tasks WHERE module=? AND finished_at>=?").bind(m,v.activated_at).first();
    const f=Number(s?.f||0),c=Number(s?.c||0);
    if(f+c>=WATCHDOG.versionMinTasks&&f/(f+c)>0.5){const prev=await env.DB.prepare("SELECT version FROM agent_versions WHERE agent=? AND status='previous' ORDER BY activated_at DESC LIMIT 1").bind(v.agent).first();
      raised.push({code:"version_unhealthy",agent:v.agent,level:"warning",cause:`Version ${v.version}: ${f} of ${f+c} tasks failed since activation`,fallback:prev?`Rollback reference: ${prev.version} (owner-approved deploy only)`:"No previous version recorded"});}
  }
  const keys=await raiseAlerts(env,"watchdog",raised,`watchdog-${t}`,t);
  await recoverOpenAlerts(env,"watchdog",keys,t);
  const healthy=raised.every(a=>a.level!=="critical")?1:0;
  await env.DB.prepare("INSERT INTO agent_heartbeat(scheduler,last_run_id,last_finished_at,healthy) VALUES('watchdog',?,?,?) ON CONFLICT(scheduler) DO UPDATE SET last_run_id=excluded.last_run_id,last_finished_at=excluded.last_finished_at,healthy=excluded.healthy").bind(`watchdog-${t}`,t,healthy).run();
  return {ok:true,alerts:raised.map(a=>a.code),auto_retried:autoRetried,healthy:!!healthy};
}

// Quality (no AI calls, computed only when the Control Center asks): scores 0-100 from existing outcomes, this week vs last week.
export async function qualitySummary(env,{nowMs=Date.now()}={}){
  const w0=iso(nowMs-7*86400000),w1=iso(nowMs-14*86400000);
  const one=async(sql,...b)=>{try{return await env.DB.prepare(sql).bind(...b).first()||{};}catch{return {};}};
  const pct=(good,total)=>total?Math.round(good*100/total):null;
  const window=async(from,to)=>{
    const tasks=await one("SELECT SUM(status='completed') c,SUM(status='failed') f FROM autonomy_tasks WHERE finished_at>=? AND finished_at<?",from,to);
    const runs=await one("SELECT SUM(healthy) h,COUNT(*) n FROM agent_runs WHERE started_at>=? AND started_at<?",from,to);
    const content=await one("SELECT SUM(type='content_auto_approved') a,SUM(type='content_auto_approve_held') h FROM system_events WHERE created_at>=? AND created_at<? AND type IN ('content_auto_approved','content_auto_approve_held')",from,to);
    const owner=await one("SELECT SUM(status='approved') a,SUM(status='rejected') r FROM approval_queue WHERE created_at>=? AND created_at<?",from,to);
    const crm=await one("SELECT COUNT(*) n FROM system_events WHERE type='lead_identity_conflict' AND created_at>=? AND created_at<?",from,to);
    return {reliability:pct(Number(tasks.c||0),Number(tasks.c||0)+Number(tasks.f||0)),run_health:pct(Number(runs.h||0),Number(runs.n||0)),
      content_routine_rate:pct(Number(content.a||0),Number(content.a||0)+Number(content.h||0)),owner_acceptance:pct(Number(owner.a||0),Number(owner.a||0)+Number(owner.r||0)),
      crm_identity_conflicts:Number(crm.n||0)};
  };
  const now=iso(nowMs),cur=await window(w0,now),prev=await window(w1,w0);
  const trend={};for(const k of Object.keys(cur))trend[k]=cur[k]==null||prev[k]==null?null:cur[k]-prev[k];
  let recurring=[];try{recurring=((await env.DB.prepare("SELECT module,action,substr(COALESCE(error,''),1,80) e,COUNT(*) n FROM autonomy_tasks WHERE status='failed' AND finished_at>=? GROUP BY module,action,e ORDER BY n DESC LIMIT 5").bind(w0).all()).results||[]).map(r=>({action:`${r.module}:${r.action}`,count:r.n,error:safeErrorText(r.e,120)}));}catch{}
  return {window_days:7,current:cur,previous:prev,trend,recurring_problems:recurring};
}

// Active and previous version per agent (rollback readiness).
export async function versionSummary(env){
  try{return ((await env.DB.prepare("SELECT agent,version,status,activated_at FROM agent_versions WHERE status IN ('active','previous') ORDER BY agent,status,activated_at DESC LIMIT 100").all()).results||[]);}catch{return [];}
}
