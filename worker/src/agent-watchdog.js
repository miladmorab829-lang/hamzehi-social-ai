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
// Phase 06: work the scheduler itself plans for an agent (autonomy-engine runAutonomyScheduled). Only these can be "unexpectedly
// inactive"; every other agent action runs on an owner command, so silence there is idle by design, not a failure.
export const EXPECTED_ACTIVITY=Object.freeze({
  "revenue:funnel_snapshot":Object.freeze({everyMs:2*3600*1000,level:"warning"}),   // planned every */15 cycle
  "photo:photo_generate":Object.freeze({everyMs:30*3600*1000,level:"info"})          // once per UTC day inside its quota
});
// Phase 07: time-bounded range reads without an index or migration. Rows are appended with created_at = insert time, so rowid order
// follows created_at; a binary search over rowid (each probe is a primary-key B-tree seek) finds the first row of a time window.
// Only the rows inside the window are read afterwards (no full-table scan, no fixed row cap that can miss a long window).
const ROWID_TABLES=new Set(["autonomy_tasks","system_events"]);
const FLOOR_CACHE=new Map(),FLOOR_TTL_MS=10*60*1000,FLOOR_MAX_PROBES=64;
export const RANGE_MAX_ROWS=60000;   // a window larger than this is not scanned: no conclusion instead of an expensive read
export function clearRowidFloorCache(){FLOOR_CACHE.clear();}
// → {floor: first rowid with created_at >= sinceIso (or max+1 when none), min, max, covered: the table holds rows older than sinceIso}
export async function rowidFloor(env,table,sinceIso,{nowMs=Date.now()}={}){
  if(!ROWID_TABLES.has(table))throw new Error("rowidFloor: table not allowed");
  const key=`${table}|${sinceIso.slice(0,15)}`,hit=FLOOR_CACHE.get(key);   // bucket: 10-minute resolution of the window start
  const b=await env.DB.prepare(`SELECT MIN(rowid) n,MAX(rowid) m FROM ${table}`).first();
  const min=Number(b?.n),max=Number(b?.m);
  if(!Number.isFinite(min)||!Number.isFinite(max)||b?.m==null)return {floor:null,min:null,max:null,covered:false,oldest_at:null};
  const probe=async r=>await env.DB.prepare(`SELECT rowid r,created_at c FROM ${table} WHERE rowid>=? ORDER BY rowid LIMIT 1`).bind(r).first();
  const first=await probe(min),covered=!!first&&String(first.c)<sinceIso,oldest_at=first?String(first.c):null;
  // only the floor is cached (MIN/MAX/coverage are re-read: cheap); a cached floor outside the current range is discarded
  if(hit&&nowMs-hit.at<FLOOR_TTL_MS&&hit.db===env.DB&&hit.floor>=min&&hit.floor<=max+1)return {floor:hit.floor,min,max,covered,oldest_at};
  let lo=min,hi=max,cand=null,probes=0;
  while(lo<=hi&&probes++<FLOOR_MAX_PROBES){const mid=Math.floor((lo+hi)/2),row=await probe(mid);
    if(!row){hi=mid-1;continue;}
    if(String(row.c)>=sinceIso){cand=Number(row.r);hi=mid-1;}else lo=Number(row.r)+1;}
  const v={floor:cand??max+1,min,max,covered,oldest_at};
  FLOOR_CACHE.set(key,{at:nowMs,db:env.DB,floor:v.floor});if(FLOOR_CACHE.size>32)FLOOR_CACHE.delete(FLOOR_CACHE.keys().next().value);
  return v;
}
// Retry eligibility of one dead letter (display only; the rules are the ones the Watchdog and resolveDeadLetter already apply).
export function deadLetterEligibility({module,action,task_status,resolved_at}){
  const capability=module&&action?(action==="status"?"read":AUTONOMY_ACTION_CAPABILITY[`${module}:${action}`]||"side_effect"):null;
  const failed=task_status==="failed",open=!resolved_at;
  return {capability,auto_retry:open&&failed&&!!module&&isAutoRetryable(module,action),owner_requeue:open&&failed,
    note:!open?"resolved":!failed?(task_status?`task is ${task_status}; nothing to re-queue`:"task not found"):
      capability==="read"?"read-only: the Watchdog re-queues it automatically (max once per task per day)":
      capability==="paid"?"owner re-queue only; counts against the daily quota and cost budget":
      capability==="draft"?"owner re-queue only; the output still waits for owner approval":
      "owner re-queue only; still needs the one-time owner approval before it runs"};
}

export async function runWatchdog(env,{nowMs=Date.now(),orchestratorOn=env?.AUTONOMY_ORCHESTRATOR==="on"}={}){
  if(!(await opsAvailable(env)))return {ok:false,reason:"not_migrated"};
  const t=iso(nowMs),day=dayStartOf(nowMs),raised=[],all=async(sql,...b)=>((await env.DB.prepare(sql).bind(...b).all()).results||[]);
  let coverage={state:"NOT_RUN",reason:"orchestrator_off_or_paused"};
  let master="on";try{master=(await env.DB.prepare("SELECT value FROM autonomy_controls WHERE key='master'").first())?.value||"on";}catch{}
  // 0. Phase 16.16-N: a version built without AUTONOMY_ORCHESTRATOR=on (e.g. an automatic build) falls back to the legacy task loop
  // with no heartbeat coverage, and nothing said so. Detection only (warning): nothing is paused, blocked or re-routed.
  if(!orchestratorOn)raised.push({code:"orchestrator_flag_off",agent:"orchestrator",level:"warning",cause:"AUTONOMY_ORCHESTRATOR is not \"on\" in the running Worker version: background tasks use the legacy loop without heartbeat coverage",
    fallback:"Tasks still run on the legacy loop; customer replies and owner approval gates are unaffected. Deploy a version with AUTONOMY_ORCHESTRATOR=on"});
  // 1. Missing heartbeat / unhealthy runs (only when the orchestrated scheduler is expected to run).
  if(orchestratorOn&&master==="on"){
    const hb=await env.DB.prepare("SELECT last_finished_at,healthy FROM agent_heartbeat WHERE scheduler='autonomy'").first();
    const age=hb?nowMs-Date.parse(hb.last_finished_at):Infinity;
    if(!(age<WATCHDOG.heartbeatStaleMs))raised.push({code:"heartbeat_missed",agent:"orchestrator",level:"critical",cause:hb?`No orchestrator run finished for ${Math.round(age/60000)} min`:"No orchestrator heartbeat recorded yet",
      fallback:"Queued tasks wait; customer replies, publishing gates and owner approvals are not affected"});
    const runs=await all("SELECT healthy FROM agent_runs WHERE scheduler='autonomy' ORDER BY started_at DESC LIMIT 3");
    if(runs.length===3&&runs.every(r=>Number(r.healthy)===0))raised.push({code:"runs_unhealthy",agent:"orchestrator",level:"critical",cause:"The last 3 orchestrator runs were unhealthy",fallback:"Failed tasks stay in the dead-letter queue; nothing is retried automatically except read-only checks"});
    // 1b. Unexpected inactivity (Phase 06): scheduled work missing although the scheduler itself is healthy. With a stale heartbeat
    // the cause is infrastructure (heartbeat_missed above), so this is not raised twice. Disabled modules/actions are idle on purpose.
    if(age<WATCHDOG.heartbeatStaleMs){const ui=await unexpectedInactivity(env,nowMs);raised.push(...ui.alerts);coverage=ui.coverage;}
    else coverage={state:"NOT_RUN",reason:"heartbeat_stale"};
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
  return {ok:true,alerts:raised.map(a=>a.code),auto_retried:autoRetried,healthy:!!healthy,inactivity_coverage:coverage};
}

// Phase 08: per-expectation coverage + aggregation in SQL. The result says what was checked, so a skipped check is never silent:
// {alerts, coverage:{state COVERED|PARTIAL|NO_HISTORY|WINDOW_TOO_LARGE|ERROR, checked:[key], skipped:[{key,reason}], rows?}}.
// Only WINDOW_TOO_LARGE and ERROR raise monitoring_coverage_gap (info, agent "watchdog"); a short history is normal and only reported.
const ROWID_SLACK_MS=15*60*1000;   // read 15 min more than the window: tolerates small created_at/rowid order differences (clock skew)
const coverageGap=(cause)=>({code:"monitoring_coverage_gap",agent:"watchdog",level:"info",cause,
  fallback:"The other Watchdog checks (heartbeat, stuck tasks, failures, dead letters, versions) still run; no agent is marked failed"});
async function unexpectedInactivity(env,nowMs){
  const out=[],coverage={state:"COVERED",checked:[],skipped:[]};
  try{
    let modules={};try{modules=JSON.parse((await env.DB.prepare("SELECT value FROM autonomy_controls WHERE key='modules'").first())?.value||"{}")||{};}catch{}
    const longest=Math.max(...Object.values(EXPECTED_ACTIVITY).map(e=>e.everyMs));
    const fl=await rowidFloor(env,"autonomy_tasks",iso(nowMs-longest-ROWID_SLACK_MS),{nowMs});
    if(fl.floor==null)return {alerts:out,coverage:{state:"NO_HISTORY",checked:[],skipped:Object.keys(EXPECTED_ACTIVITY).map(key=>({key,reason:"no_tasks"}))}};
    const rows=fl.max-fl.floor+1;
    if(rows>RANGE_MAX_ROWS){out.push(coverageGap(`Inactivity check skipped: ${rows} task rows in the last ${Math.round(longest/3600000)} h exceed the ${RANGE_MAX_ROWS} bounded-read limit`));
      return {alerts:out,coverage:{state:"WINDOW_TOO_LARGE",checked:[],skipped:Object.keys(EXPECTED_ACTIVITY).map(key=>({key,reason:"window_too_large"})),rows}};}
    for(const [key,exp] of Object.entries(EXPECTED_ACTIVITY)){
      const [m,a]=key.split(":");
      if(modules[m]===false){coverage.skipped.push({key,reason:"module_disabled"});continue;}
      const off=await env.DB.prepare("SELECT enabled FROM autonomy_action_controls WHERE module=? AND action=?").bind(m,a).first().catch(()=>null);
      if(off&&Number(off.enabled)===0){coverage.skipped.push({key,reason:"action_disabled"});continue;}
      const since=iso(nowMs-exp.everyMs);
      // per expectation: the recorded history must reach back before this window, otherwise no conclusion (new install / short history)
      if(!(fl.oldest_at&&fl.oldest_at<since)){coverage.skipped.push({key,reason:"history_shorter_than_window"});continue;}
      // aggregated in SQL (constant memory); the latest completion is MAX(time), not row order
      const s=await env.DB.prepare("SELECT SUM(status IN ('queued','running')) p,SUM(status='completed' AND COALESCE(finished_at,created_at)>=?) ok,MAX(CASE WHEN status='completed' THEN COALESCE(finished_at,created_at) END) last FROM autonomy_tasks WHERE rowid>=? AND module=? AND action=?").bind(since,fl.floor,m,a).first();
      coverage.checked.push(key);
      if(Number(s?.p||0)>0||Number(s?.ok||0)>0)continue;
      out.push({code:"agent_inactive",agent:`autonomy:${m}`,level:exp.level,
        cause:`No completed ${key} for more than ${Math.round(exp.everyMs/3600000)} h while the scheduler is healthy${s?.last?` (last ${s.last})`:""}`,
        fallback:"Other agents continue; nothing is re-run automatically. Check the module's quota, inputs and recent failures"});
    }
    if(coverage.skipped.some(x=>x.reason==="history_shorter_than_window"))coverage.state="PARTIAL";
  }catch(e){
    out.push(coverageGap(`Inactivity check failed: ${safeErrorText(e,120)}`));
    return {alerts:out,coverage:{state:"ERROR",checked:coverage.checked,skipped:coverage.skipped}};
  }
  return {alerts:out,coverage};
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

// Phase 16.4: explicit rollback eligibility per agent (read-only). The previous version qualifies only with recorded evidence: at
// least versionMinTasks finished tasks while it was active and at most half of them failed. Nothing is switched here — a code
// rollback stays an owner-approved Worker deploy; this is the auditable reference the owner decides on.
export async function rollbackEligibility(env){
  const rows=(await env.DB.prepare("SELECT agent,version,status,activated_at FROM agent_versions WHERE status IN ('active','previous') ORDER BY agent,activated_at DESC LIMIT 200").all()).results||[];
  const out=[];
  for(const active of rows.filter(r=>r.status==="active")){
    const prev=rows.find(r=>r.agent===active.agent&&r.status==="previous"&&r.activated_at<=active.activated_at);
    const base={agent:active.agent,active_version:active.version,previous_version:prev?.version||null,action:"owner_approved_worker_deploy_only"};
    if(!prev){out.push({...base,eligible:false,reason:"no_previous_version"});continue;}
    const m=String(active.agent).replace(/^autonomy:/,"");
    const s=await env.DB.prepare("SELECT SUM(status='failed') f,SUM(status='completed') c FROM autonomy_tasks WHERE module=? AND finished_at>=? AND finished_at<?").bind(m,prev.activated_at,active.activated_at).first();
    const f=Number(s?.f||0),c=Number(s?.c||0),evidence={finished:f+c,failed:f,window:{from:prev.activated_at,to:active.activated_at}};
    if(f+c<WATCHDOG.versionMinTasks)out.push({...base,eligible:false,reason:"insufficient_history",evidence});
    else if(f/(f+c)>0.5)out.push({...base,eligible:false,reason:"previous_version_unhealthy",evidence});
    else out.push({...base,eligible:true,reason:"previous_version_healthy",evidence});
  }
  return out;
}

// Active and previous version per agent (rollback readiness).
export async function versionSummary(env){
  try{return ((await env.DB.prepare("SELECT agent,version,status,activated_at FROM agent_versions WHERE status IN ('active','previous') ORDER BY agent,status,activated_at DESC LIMIT 100").all()).results||[]);}catch{return [];}
}
