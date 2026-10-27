// AGENT OPS STORE — Stage 2B. Durable run reports, deduplicated persistent alerts, the dead-letter queue, heartbeat and the owner
// approval queue for side-effect autonomy tasks. The tables come ONLY from owner-actions/agent-orchestrator-stage2b/
// 02-migration-draft.sql: this module never creates or alters a table. When they are missing it reports "not migrated" and every
// write is skipped, so the orchestrator falls back to its Stage 2A behaviour. All writes are best-effort and never throw into the
// caller; nothing here sends a message, approves anything by itself, or touches sales/CRM tables (approvals are kept out of
// owner_decisions on purpose).
import { redact, safeErrorText, ORCHESTRATOR_VERSION } from "./agent-orchestrator.js";

export const OPS_TABLES=Object.freeze(["agent_runs","agent_dead_letters","agent_alerts","agent_heartbeat","agent_approvals","agent_versions"]);
export const APPROVAL_TTL_MS=24*60*60*1000;
const iso=ms=>new Date(ms).toISOString();
const uid=()=>crypto.randomUUID();
const READY=new WeakMap();

// Probe each table with a zero-row read; a positive answer is cached per database, a negative one is re-checked next time.
export async function opsAvailable(env){
  if(!env?.DB)return false;
  if(READY.get(env.DB))return true;
  try{for(const t of OPS_TABLES)await env.DB.prepare(`SELECT * FROM ${t} LIMIT 0`).all();READY.set(env.DB,true);return true;}
  catch{return false;}
}

const FALLBACK={
  dead_letters:"Failed tasks keep status 'failed'; other tasks and the next scheduled run continue",
  budget_exhausted:"Remaining tasks stay queued for the next run",
  deadline_reached:"Remaining tasks stay queued for the next run",
  capability_blocked:"Financial or unknown actions wait in the owner approval queue; nothing is run without approval",
  invalid_task_graph:"No task was started in this run",
  orchestrator_error:"No task was started in this run",
  watchdog_missed:"Agents and customer replies continue; stuck-task, dead-letter and inactivity checks are paused until the Watchdog runs again"
};
// Phase 16.4: same staleness rule as the Watchdog's own heartbeat check (kept local: agent-watchdog.js imports this module).
const WATCHDOG_STALE_MS=35*60*1000;
// transient = seen once or briefly; sustained = still open after 3+ detections or 45+ min; recovered/acknowledged otherwise.
const SUSTAINED_MIN_OCCURRENCES=3,SUSTAINED_MIN_MS=45*60*1000;
export function incidentState(a){
  if(a?.recovery_state!=="open")return a?.recovery_state||"recovered";
  const span=Date.parse(a.last_seen_at)-Date.parse(a.first_seen_at);
  return Number(a.occurrences||0)>=SUSTAINED_MIN_OCCURRENCES||span>=SUSTAINED_MIN_MS?"sustained":"transient";
}

// Persist one orchestrator report: the run row, its dead letters, the heartbeat, and the alert lifecycle (open → recovered →
// acknowledged). Returns {stored:boolean}.
export async function recordRun(env,scheduler,report,extra={}){
  try{
    if(!(await opsAvailable(env)))return {stored:false,reason:"not_migrated"};
    const t=report.finished_at||new Date().toISOString(),healthy=report.heartbeat?.healthy?1:0;
    const counts={...report.counts,...Object.fromEntries(Object.entries(extra).filter(([,v])=>typeof v==="number"))};
    await env.DB.prepare("INSERT OR IGNORE INTO agent_runs(run_id,scheduler,orchestrator_version,started_at,finished_at,duration_ms,counts_json,budget_spent,budget_limit,alert_codes_json,healthy) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .bind(report.run_id,scheduler,report.orchestrator_version,report.started_at,t,report.duration_ms,JSON.stringify(counts),report.budget?.spent??0,report.budget?.limit??0,JSON.stringify(report.alerts.map(a=>a.code)),healthy).run();
    // One open dead letter per task: a repeat failure of a task that is already waiting updates that row instead of adding another.
    for(const d of report.dead_letters){
      const upd=await env.DB.prepare("UPDATE agent_dead_letters SET run_id=?,agent_version=?,state=?,attempts=attempts+?,error_redacted=? WHERE task_id=? AND resolved_at IS NULL")
        .bind(report.run_id,d.version||null,d.state,d.attempts,safeErrorText(d.error),d.task_id).run();
      if(Number(upd?.meta?.changes||0)===0)await env.DB.prepare("INSERT INTO agent_dead_letters(id,run_id,task_id,agent,agent_version,state,attempts,error_redacted,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
        .bind(uid(),report.run_id,d.task_id,d.agent,d.version||null,d.state,d.attempts,safeErrorText(d.error),d.at||t).run();
    }
    await trackAgentVersions(env,report.agents,t);
    await env.DB.prepare("INSERT INTO agent_heartbeat(scheduler,last_run_id,last_finished_at,healthy) VALUES(?,?,?,?) ON CONFLICT(scheduler) DO UPDATE SET last_run_id=excluded.last_run_id,last_finished_at=excluded.last_finished_at,healthy=excluded.healthy")
      .bind(scheduler,report.run_id,t,healthy).run();
    // Alerts: dead letters are raised per agent (with the affected tasks); run-level warnings/criticals under "orchestrator".
    const raised=[];
    const byAgent=new Map();for(const d of report.dead_letters){const l=byAgent.get(d.agent)||[];l.push(d);byAgent.set(d.agent,l);}
    for(const [agent,list] of byAgent)raised.push({code:"dead_letters",agent,level:"warning",cause:list[list.length-1].error,tasks:list.map(d=>d.task_id)});
    for(const a of report.alerts)if(a.code!=="dead_letters"&&a.level!=="info")raised.push({code:a.code,agent:"orchestrator",level:a.level,cause:a.message,tasks:report.tasks.filter(x=>["budget_exhausted","deadline_reached","not_run"].includes(x.state)).map(x=>x.id)});
    for(const a of extra.blockedForApproval||[])raised.push({code:"capability_blocked",agent:a.agent,level:"info",cause:"Waiting for owner approval",tasks:[a.task_id]});
    // Phase 16.4: the orchestrator also watches the Watchdog (monitoring never depends on one component). Only a heartbeat that exists
    // and is stale counts (a fresh install without a Watchdog run is not an incident). Read-only; recovered by the normal lifecycle.
    try{const wd=await env.DB.prepare("SELECT last_finished_at FROM agent_heartbeat WHERE scheduler='watchdog'").first(),age=wd?Date.parse(t)-Date.parse(wd.last_finished_at):0;
      if(wd&&!(age<WATCHDOG_STALE_MS))raised.push({code:"watchdog_missed",agent:"watchdog",level:"critical",cause:`No Watchdog run finished for ${Number.isFinite(age)?Math.round(age/60000)+" min":"an unknown time"}`});}catch{}
    const raisedKeys=await raiseAlerts(env,scheduler,raised,report.run_id,t);
    // Recovery: an open alert whose cause did not recur in a healthy run is marked recovered; it stays visible until acknowledged.
    if(healthy)await recoverOpenAlerts(env,scheduler,raisedKeys,t);
    return {stored:true};
  }catch(error){return {stored:false,reason:"store_error",error:redact(error)};}
}

// Shared alert lifecycle (orchestrator runs and the watchdog): one OPEN row per (scheduler, code, agent); a repeat bumps occurrences,
// merges affected tasks and re-opens a recovered alert; history rows are never deleted. Returns the raised "code|agent" keys.
export async function raiseAlerts(env,scheduler,raised,runId,t){
  const keys=new Set();
  for(const a of raised){
    keys.add(`${a.code}|${a.agent}`);
    const fallback=a.fallback||FALLBACK[a.code]||null;
    const findOpen=()=>env.DB.prepare("SELECT id,affected_tasks_json FROM agent_alerts WHERE scheduler=? AND code=? AND agent=? AND acknowledged_at IS NULL LIMIT 1").bind(scheduler,a.code,a.agent).first();
    const bump=async open=>{
      let tasks=[];try{tasks=JSON.parse(open.affected_tasks_json||"[]")}catch{}
      tasks=[...new Set([...tasks,...(a.tasks||[])])].slice(-50);
      await env.DB.prepare("UPDATE agent_alerts SET level=?,cause_redacted=?,affected_tasks_json=?,fallback_status=?,recovery_state='open',recovered_at=NULL,last_run_id=?,last_seen_at=?,occurrences=occurrences+1 WHERE id=?")
        .bind(a.level,safeErrorText(a.cause),JSON.stringify(tasks),fallback,runId,t,open.id).run();
    };
    const open=await findOpen();
    if(open)await bump(open);
    else{
      // Phase 16.4: two overlapping runs (watchdog + orchestrator, or two ticks) can both find no open row; the open-alert unique index
      // then rejects the second INSERT. INSERT OR IGNORE + bump keeps one row and never throws (a throw used to abort the whole run,
      // including its heartbeat).
      const ins=await env.DB.prepare("INSERT OR IGNORE INTO agent_alerts(id,scheduler,code,agent,level,cause_redacted,affected_tasks_json,fallback_status,recovery_state,last_run_id,first_seen_at,last_seen_at,occurrences) VALUES(?,?,?,?,?,?,?,?,'open',?,?,?,1)")
        .bind(uid(),scheduler,a.code,a.agent,a.level,safeErrorText(a.cause),JSON.stringify((a.tasks||[]).slice(-50)),fallback,runId,t,t).run();
      if(!changed(ins)){const winner=await findOpen();if(winner)await bump(winner);}
    }
  }
  return keys;
}
export async function recoverOpenAlerts(env,scheduler,keepKeys,t){
  const opens=await env.DB.prepare("SELECT id,code,agent FROM agent_alerts WHERE scheduler=? AND acknowledged_at IS NULL AND recovery_state='open'").bind(scheduler).all();
  for(const o of opens.results||[])if(!keepKeys.has(`${o.code}|${o.agent}`))
    await env.DB.prepare("UPDATE agent_alerts SET recovery_state='recovered',recovered_at=? WHERE id=? AND recovery_state='open'").bind(t,o.id).run();
}

// Agent versions (agent_versions): the version each agent ran with becomes its ACTIVE row; the row it replaces becomes 'previous'
// (rollback reference). Code rollback itself stays an owner-approved Worker deploy; nothing here deploys or switches code.
export async function trackAgentVersions(env,agents={},t=new Date().toISOString()){
  for(const [agent,a] of Object.entries(agents||{})){
    const version=String((a.versions||[]).slice(-1)[0]||"");if(!version)continue;
    const cur=await env.DB.prepare("SELECT version FROM agent_versions WHERE agent=? AND status='active'").bind(agent).first();
    if(cur?.version===version)continue;
    const notes=JSON.stringify({orchestrator_version:ORCHESTRATOR_VERSION,source:"autonomy-engine"});
    await env.DB.batch([
      env.DB.prepare("UPDATE agent_versions SET status='previous' WHERE agent=? AND status='active'").bind(agent),
      env.DB.prepare("INSERT INTO agent_versions(agent,version,status,activated_at,activated_by,notes) VALUES(?,?,'active',?,'autonomy',?) ON CONFLICT(agent,version) DO UPDATE SET status='active',activated_at=excluded.activated_at,notes=excluded.notes").bind(agent,version,t,notes)
    ]);
  }
}

/* ------------------------------------------------------------------------------------------- owner approval queue */
// A side-effect task gets ONE live approval request (pending or approved) bound to its id and exact payload key.
export async function approvalForTask(env,{taskId,dedupKey,nowMs=Date.now()}){
  if(!(await opsAvailable(env)))return {available:false};
  // Unused approvals expire; expiry never approves anything.
  await env.DB.prepare("UPDATE agent_approvals SET status='expired' WHERE status='approved' AND expires_at IS NOT NULL AND expires_at<=?").bind(iso(nowMs)).run();
  const live=await env.DB.prepare("SELECT * FROM agent_approvals WHERE task_id=? AND status IN ('pending','approved') LIMIT 1").bind(taskId).first();
  if(live&&live.dedup_key!==dedupKey){   // the task changed since the request: the old request no longer covers it
    await env.DB.prepare("UPDATE agent_approvals SET status='expired',note='task payload changed' WHERE id=? AND status IN ('pending','approved')").bind(live.id).run();
    return {available:true,approval:null};
  }
  return {available:true,approval:live||null};
}
// Every owner/run transition below is ONE D1 batch (a transaction): the compare-and-set UPDATE stamps a per-request action_token,
// and the dependent UPDATE and the audit INSERT only apply WHERE EXISTS(row carrying THAT token). So the audit row exists if and
// only if this request's transition happened; a refused CAS writes nothing, and a failing audit insert rolls the transition back.
const AUDIT_SQL="INSERT INTO autonomy_events(id,type,module,message,meta_json,created_at) SELECT ?,?,NULL,?,?,? WHERE EXISTS(";
const auditStmt=(env,type,message,meta,t,guard,...guardBinds)=>env.DB.prepare(AUDIT_SQL+guard+")").bind(uid(),type,String(message).slice(0,300),JSON.stringify(meta).slice(0,2000),t,...guardBinds);
const changed=r=>Number(r?.meta?.changes||0)===1;
const actorOf=actor=>String(actor||"owner").slice(0,120);
const saveFailed=()=>({ok:false,status:500,error:"The change could not be saved; nothing was changed"});

export async function requestApproval(env,{taskId,module,action,dedupKey,capability,nowMs=Date.now()}){
  if(!(await opsAvailable(env)))return null;
  const id=uid(),t=iso(nowMs),tok=uid();
  try{
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO agent_approvals(id,task_id,module,action,dedup_key,capability,status,requested_at,action_token) VALUES(?,?,?,?,?,?,'pending',?,?)").bind(id,taskId,module,action,dedupKey,capability,t,tok),
      auditStmt(env,"agent_approval_requested",`Approval requested for ${module}:${action}`,{approval_id:id,task_id:taskId,module,action,capability},t,"SELECT 1 FROM agent_approvals WHERE id=? AND action_token=?",id,tok)
    ]);
  }catch{return null;}
  return await env.DB.prepare("SELECT * FROM agent_approvals WHERE task_id=? AND status IN ('pending','approved') LIMIT 1").bind(taskId).first();
}
// One-shot: the approval is consumed (approved → used) atomically BEFORE the task runs; only the run that consumes it may run.
export async function consumeApproval(env,{approvalId,taskId,dedupKey,nowMs=Date.now()}){
  const t=iso(nowMs),tok=uid();
  try{
    const res=await env.DB.batch([
      env.DB.prepare("UPDATE agent_approvals SET status='used',used_at=?,action_token=? WHERE id=? AND task_id=? AND dedup_key=? AND status='approved' AND (expires_at IS NULL OR expires_at>?)").bind(t,tok,approvalId,taskId,dedupKey,t),
      auditStmt(env,"agent_approval_used","Owner approval consumed by the scheduled run",{approval_id:approvalId,task_id:taskId},t,"SELECT 1 FROM agent_approvals WHERE id=? AND action_token=?",approvalId,tok)
    ]);
    return changed(res[0]);
  }catch{return false;}
}
// Owner decision (admin route only). APPROVE puts exactly that blocked task back in the queue; REJECT leaves it blocked.
export async function decideApproval(env,{id,decision,actor,nowMs=Date.now()}){
  if(!(await opsAvailable(env)))return {ok:false,status:503,error:"Agent ops tables are not migrated"};
  if(!["approve","reject"].includes(decision))return {ok:false,status:400,error:"decision must be approve or reject"};
  const a=await env.DB.prepare("SELECT * FROM agent_approvals WHERE id=?").bind(String(id||"")).first();
  if(!a)return {ok:false,status:404,error:"Approval not found"};
  if(a.status!=="pending"){const same=(decision==="approve"&&["approved","used"].includes(a.status))||(decision==="reject"&&a.status==="rejected");return same?{ok:true,idempotent:true,approval:a}:{ok:false,status:409,error:`Approval is already ${a.status}`};}
  const t=iso(nowMs),tok=uid(),status=decision==="approve"?"approved":"rejected",guard="SELECT 1 FROM agent_approvals WHERE id=? AND action_token=?";
  const stmts=[env.DB.prepare("UPDATE agent_approvals SET status=?,decided_at=?,decided_by=?,expires_at=?,action_token=? WHERE id=? AND status='pending'").bind(status,t,actorOf(actor),decision==="approve"?iso(nowMs+APPROVAL_TTL_MS):null,tok,a.id)];
  if(decision==="approve")stmts.push(env.DB.prepare(`UPDATE autonomy_tasks SET status='queued',error=NULL,updated_at=? WHERE id=? AND status='blocked' AND EXISTS(${guard})`).bind(t,a.task_id,a.id,tok));
  stmts.push(auditStmt(env,"agent_approval_decided",`Owner ${status} ${a.module}:${a.action}`,{approval_id:a.id,task_id:a.task_id,module:a.module,action:a.action,decision:status,actor:actorOf(actor)},t,guard,a.id,tok));
  let res;try{res=await env.DB.batch(stmts);}catch{return saveFailed();}
  if(!changed(res[0]))return {ok:false,status:409,error:"Approval changed concurrently; reload"};
  return {ok:true,approval:await env.DB.prepare("SELECT * FROM agent_approvals WHERE id=?").bind(a.id).first()};
}

// Owner autonomy policy: an open request (pending/approved) for an action that no longer needs approval is closed as 'expired'
// by 'policy' with an audit row, and its blocked task goes back to the queue — one batch per request. Nothing is deleted, and
// requests that still need approval (needsApproval true: financial/unknown) are left exactly as they are.
export async function cancelObsoleteApprovals(env,{needsApproval,nowMs=Date.now()}){
  if(typeof needsApproval!=="function"||!(await opsAvailable(env)))return {cancelled:0};
  const open=(await env.DB.prepare("SELECT id,task_id,module,action,status FROM agent_approvals WHERE status IN ('pending','approved') LIMIT 200").all()).results||[];
  let cancelled=0;
  for(const a of open){
    if(needsApproval(a.module,a.action))continue;
    const t=iso(nowMs),tok=uid(),guard="SELECT 1 FROM agent_approvals WHERE id=? AND action_token=?";
    try{
      const res=await env.DB.batch([
        env.DB.prepare("UPDATE agent_approvals SET status='expired',decided_at=?,decided_by='policy',note=?,action_token=? WHERE id=? AND status IN ('pending','approved')").bind(t,"No approval needed: non-financial action (owner autonomy policy)",tok,a.id),
        env.DB.prepare(`UPDATE autonomy_tasks SET status='queued',error=NULL,updated_at=? WHERE id=? AND status='blocked' AND EXISTS(${guard})`).bind(t,a.task_id,a.id,tok),
        auditStmt(env,"agent_approval_cancelled",`Approval no longer needed for ${a.module}:${a.action}`,{approval_id:a.id,task_id:a.task_id,module:a.module,action:a.action,previous_status:a.status,actor:"policy"},t,guard,a.id,tok)
      ]);
      if(changed(res[0]))cancelled++;
    }catch{}
  }
  return {cancelled};
}

// Watchdog recovery of ONE dead-lettered READ task (the caller checks the capability allow-list). One D1 batch (a transaction):
// the dead letter is resolved as 'retried' by 'watchdog' only if no automatic retry of this task was audited today, the failed task
// goes back to the queue, and the audit row is written — so overlapping watchdog runs can never requeue a task twice in a day.
export async function autoRetryReadDeadLetter(env,{id,taskId,agent,dayStart,nowMs=Date.now()}){
  const t=iso(nowMs),tok=uid(),guard="SELECT 1 FROM agent_dead_letters WHERE id=? AND action_token=?",mark=`%"task_id":${JSON.stringify(String(taskId))}%`;
  try{
    const res=await env.DB.batch([
      env.DB.prepare("UPDATE agent_dead_letters SET resolved_at=?,resolved_by='watchdog',resolution='retried',action_token=? WHERE id=? AND resolved_at IS NULL AND NOT EXISTS(SELECT 1 FROM autonomy_events WHERE type='agent_dead_letter_auto_retried' AND created_at>=? AND meta_json LIKE ?)").bind(t,tok,id,dayStart,mark),
      env.DB.prepare(`UPDATE autonomy_tasks SET status='queued',error=NULL,updated_at=? WHERE id=? AND status='failed' AND EXISTS(${guard})`).bind(t,taskId,id,tok),
      auditStmt(env,"agent_dead_letter_auto_retried","Watchdog re-queued a failed read-only task (once per day)",{dead_letter_id:id,task_id:String(taskId),agent,actor:"watchdog"},t,guard,id,tok)
    ]);
    return changed(res[0]);
  }catch{return false;}
}

/* ------------------------------------------------------------------------------------------- owner actions on alerts / DLQ */
export async function acknowledgeAlert(env,{id,actor,nowMs=Date.now()}){
  if(!(await opsAvailable(env)))return {ok:false,status:503,error:"Agent ops tables are not migrated"};
  const alertId=String(id||""),t=iso(nowMs),tok=uid();
  let res;try{res=await env.DB.batch([
    env.DB.prepare("UPDATE agent_alerts SET acknowledged_at=?,acknowledged_by=?,action_token=? WHERE id=? AND acknowledged_at IS NULL").bind(t,actorOf(actor),tok,alertId),
    auditStmt(env,"agent_alert_acknowledged","Owner acknowledged an agent alert",{alert_id:alertId,actor:actorOf(actor)},t,"SELECT 1 FROM agent_alerts WHERE id=? AND action_token=?",alertId,tok)
  ]);}catch{return saveFailed();}
  if(changed(res[0]))return {ok:true};
  const a=await env.DB.prepare("SELECT acknowledged_at FROM agent_alerts WHERE id=?").bind(alertId).first();
  return a?{ok:true,idempotent:true}:{ok:false,status:404,error:"Alert not found"};
}
// dismiss: record that the owner saw it; requeue: put the failed autonomy task back in the queue (owner's choice). A requeued
// side-effect task still needs a NEW owner approval before it can run again (its previous approval was consumed).
export async function resolveDeadLetter(env,{id,resolution,actor,nowMs=Date.now()}){
  if(!(await opsAvailable(env)))return {ok:false,status:503,error:"Agent ops tables are not migrated"};
  if(!["dismissed","retried"].includes(resolution))return {ok:false,status:400,error:"resolution must be dismissed or retried"};
  const d=await env.DB.prepare("SELECT * FROM agent_dead_letters WHERE id=?").bind(String(id||"")).first();
  if(!d)return {ok:false,status:404,error:"Dead letter not found"};
  if(d.resolved_at)return d.resolution===resolution?{ok:true,idempotent:true}:{ok:false,status:409,error:`Already ${d.resolution}`};
  const t=iso(nowMs),tok=uid(),guard="SELECT 1 FROM agent_dead_letters WHERE id=? AND action_token=?";
  const stmts=[env.DB.prepare("UPDATE agent_dead_letters SET resolved_at=?,resolved_by=?,resolution=?,action_token=? WHERE id=? AND resolved_at IS NULL").bind(t,actorOf(actor),resolution,tok,d.id)];
  if(resolution==="retried")stmts.push(env.DB.prepare(`UPDATE autonomy_tasks SET status='queued',error=NULL,updated_at=? WHERE id=? AND status='failed' AND EXISTS(${guard})`).bind(t,d.task_id,d.id,tok));
  stmts.push(auditStmt(env,"agent_dead_letter_resolved",`Owner ${resolution} a dead-letter task`,{dead_letter_id:d.id,task_id:d.task_id,agent:d.agent,resolution,actor:actorOf(actor)},t,guard,d.id,tok));
  let res;try{res=await env.DB.batch(stmts);}catch{return saveFailed();}
  if(!changed(res[0]))return {ok:false,status:409,error:"Dead letter changed concurrently; reload"};
  return {ok:true};
}

/* ------------------------------------------------------------------------------------------- dashboard reads */
export async function opsOverview(env,{nowMs=Date.now()}={}){
  if(!(await opsAvailable(env)))return {available:false,reason:"Agent ops tables are not migrated (owner-actions/agent-orchestrator-stage2b)"};
  const all=async(sql,...b)=>((await env.DB.prepare(sql).bind(...b).all()).results||[]);
  const since7=iso(nowMs-7*86400000);
  // Phase 06: an acknowledged alert that is still unrecovered stays listed until it is recovered (never ages out of the view).
  const alerts=(await all("SELECT * FROM agent_alerts WHERE acknowledged_at IS NULL OR recovery_state='open' OR last_seen_at>=? ORDER BY acknowledged_at IS NOT NULL, CASE level WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, last_seen_at DESC LIMIT 100",since7))
    .map(a=>({...a,affected_tasks:(()=>{try{return JSON.parse(a.affected_tasks_json||"[]")}catch{return []}})(),incident_state:incidentState(a)}));
  const heartbeat=await all("SELECT * FROM agent_heartbeat");
  const runs=await all("SELECT * FROM agent_runs WHERE started_at>=? ORDER BY started_at DESC LIMIT 500",since7);
  const approvals=await all("SELECT id,task_id,module,action,capability,status,requested_at,decided_at,decided_by,expires_at,used_at,note FROM agent_approvals WHERE status IN ('pending','approved') OR requested_at>=? ORDER BY status='pending' DESC, requested_at DESC LIMIT 100",since7);
  // Phase 06: the failed task's module/action/status (primary-key join) so the Control Center can show retry eligibility.
  const deadLetters=await all("SELECT d.*,t.module AS task_module,t.action AS task_action,t.status AS task_status FROM agent_dead_letters d LEFT JOIN autonomy_tasks t ON t.id=d.task_id WHERE d.resolved_at IS NULL OR d.created_at>=? ORDER BY d.resolved_at IS NOT NULL, d.created_at DESC LIMIT 100",since7);
  // Resource and cost use (7 days): budget %, runs over 80 % of budget, units per completed task, outcome mix, run durations.
  const parse=r=>{try{return JSON.parse(r.counts_json||"{}")}catch{return {}}};
  const spent=runs.reduce((s,r)=>s+Number(r.budget_spent||0),0),limit=runs.reduce((s,r)=>s+Number(r.budget_limit||0),0);
  const outcome={};for(const r of runs)for(const [k,v] of Object.entries(parse(r)))outcome[k]=(outcome[k]||0)+Number(v||0);
  const completed=outcome.succeeded||0,durations=runs.map(r=>Number(r.duration_ms||0)).sort((a,b)=>a-b);
  const usage={runs:runs.length,budget_spent:spent,budget_limit:limit,budget_used_pct:limit?Math.round(spent*1000/limit)/10:null,
    last_run_budget_pct:runs[0]&&runs[0].budget_limit?Math.round(runs[0].budget_spent*1000/runs[0].budget_limit)/10:null,
    runs_over_80pct:runs.filter(r=>r.budget_limit&&r.budget_spent/r.budget_limit>0.8).length,
    units_per_completed_task:completed?Math.round(spent*100/completed)/100:null,outcome,
    duration_median_ms:durations.length?durations[Math.floor((durations.length-1)/2)]:null,duration_max_ms:durations.length?durations[durations.length-1]:null};
  return {available:true,alerts,heartbeat,approvals,dead_letters:deadLetters,usage,recent_runs:runs.slice(0,20)};
}
