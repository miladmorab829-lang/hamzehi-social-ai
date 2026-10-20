// AGENT ORCHESTRATOR — Stage 1 (local, bounded). A pure task-graph runner for the Worker's background autonomy tasks: no D1, no
// network, no imports, and NOT wired into any route, cron or the inbound customer path yet, so it cannot slow or change a customer
// reply. It runs independent tasks in parallel and dependent ones in order, with per-task timeouts, bounded retries, deduplication,
// hard resource limits and an Approval-Gate policy, and returns one run report that later stages persist and display (watchdog
// heartbeat, persistent alerts, Dead Letter Queue, per-agent version/quality counters, cost use). It never throws and never loops
// without a bound: every task is started at most (retries+1) times and the whole run stops at maxRunMs.

export const ORCHESTRATOR_VERSION="1.0.0";

// read = no writes · draft = writes something that still waits for owner approval · paid = non-financial work that spends on an
// approved external API (generation, Google Places), run autonomously but only within its daily quota (owner autonomy policy,
// 2026-10-19) · side_effect = financial/commercial decisions (prices, discounts, payments, binding commitments), customer sends,
// publishing, or anything unknown. side_effect never runs without a one-shot owner approval.
export const CAPABILITIES=Object.freeze(["read","draft","paid","side_effect"]);
// Deny by default: only "read" runs unless the caller explicitly allows "draft"/"paid"; "side_effect" can never be allowed here.
const ALLOWABLE=new Set(["read","draft","paid"]);

// The existing autonomy actions (autonomy-engine.js ACTIONS / executeTask) by capability. None of them is financial: nothing in
// ACTIONS sends to customers, publishes, or touches prices, discounts, quotes, orders or payments (those gates live in index.js).
export const AUTONOMY_ACTION_CAPABILITY=Object.freeze({
  "telegram:inbox_scan":"read","whatsapp:inbox_scan":"read","instagram:health_and_leads":"read","website:growth_scan":"read",
  "crm:lead_intelligence":"read","revenue:funnel_snapshot":"read",
  "telegram:inbox_reply":"draft","ads:discover_opportunities":"draft","learning:run":"draft",
  "media:video_generate":"paid","photo:photo_generate":"paid","content:generate_and_queue":"paid","crm:lead_discovery":"paid"
});
// Daily caps (UTC day, every started attempt counts, failed ones included) for paid actions. The owner can lower or raise them in
// autonomy_controls key "quotas" (JSON {"module:action":n}); a missing or invalid value falls back to these, never to unlimited.
// photo/video also keep their own internal locks (photo 1/day, video 1/ISO week); content matches the default 12-hour interval.
export const AUTONOMY_DAILY_QUOTAS=Object.freeze({"photo:photo_generate":1,"media:video_generate":1,"content:generate_and_queue":2,"crm:lead_discovery":2});
export const QUOTA_MAX=50;
// Daily cost budgets (Stage 3, relative units ≈ one text-model call). Enforced atomically in the task claim together with the quota.
// Defaults sit well above what the default quotas can spend (about 2× headroom), so they only stop runaway use; the owner can lower them in
// autonomy_controls key "budgets" ({"daily_units":n,"providers":{"openai":n,...},"ads_runs_per_day":n}). Ads Autopilot has its own
// run cap (separate reserve) so it can neither starve nor be starved by the paid autonomy tasks.
export const AUTONOMY_UNIT_COST=Object.freeze({"photo:photo_generate":8,"media:video_generate":40,"content:generate_and_queue":9,"crm:lead_discovery":16});
export const AUTONOMY_PROVIDER=Object.freeze({"photo:photo_generate":"openai","media:video_generate":"video","content:generate_and_queue":"openai","crm:lead_discovery":"google_places"});
export const DEFAULT_BUDGETS=Object.freeze({daily_units:240,providers:Object.freeze({openai:120,video:80,google_places:64}),ads_runs_per_day:24});
export function autonomyBudgets(overrides={}){
  const n=(v,base,max)=>Number.isInteger(v)&&v>=0?Math.min(v,max):base,o=overrides&&typeof overrides==="object"?overrides:{};
  const providers={};for(const [p,base] of Object.entries(DEFAULT_BUDGETS.providers))providers[p]=n(o.providers?.[p],base,10000);
  return {daily_units:n(o.daily_units,DEFAULT_BUDGETS.daily_units,10000),providers,ads_runs_per_day:n(o.ads_runs_per_day,DEFAULT_BUDGETS.ads_runs_per_day,96)};
}
export function autonomyDailyQuota(module,action,overrides={}){
  const key=`${module}:${action}`,base=AUTONOMY_DAILY_QUOTAS[key]??0,v=overrides?.[key];
  return Number.isInteger(v)&&v>=0?Math.min(v,QUOTA_MAX):base;
}
export function autonomyActionCapability(module,action){
  if(action==="status")return "read";
  return AUTONOMY_ACTION_CAPABILITY[`${module}:${action}`]||"side_effect";   // unknown actions are refused, never guessed as safe
}
// Stable idempotency key for one unit of work: the same module, action and payload run once per orchestrator run.
export function autonomyTaskDedupKey(module,action,payload){
  const stable=v=>v===null||typeof v!=="object"?JSON.stringify(v??null):Array.isArray(v)?`[${v.map(stable).join(",")}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
  return `${module}:${action}:${stable(payload)}`;
}

// Defaults sized for a 15-minute cron on Workers; callers may lower them, and nothing can raise them above HARD_LIMITS.
export const DEFAULT_LIMITS=Object.freeze({concurrency:3,timeoutMs:30000,retries:2,backoffMs:500,maxTasks:20,maxRunMs:300000,budgetUnits:100});
export const HARD_LIMITS=Object.freeze({concurrency:6,timeoutMs:60000,retries:3,backoffMs:5000,maxTasks:50,maxRunMs:600000,budgetUnits:1000});

export const TASK_STATES=Object.freeze(["succeeded","failed","timed_out","skipped_dependency","blocked_policy","deduplicated","budget_exhausted","deadline_reached","not_run"]);

// Errors that leave the orchestrator never carry credentials, card numbers, phone numbers or chat identifiers. Over-redaction is
// accepted; a redaction failure yields a placeholder instead of the raw text.
const REDACTIONS=[
  [/Bearer\s+[A-Za-z0-9._~+\/=-]+/gi,"Bearer [REDACTED]"],
  [/\b(?:Authorization|Cookie|Set-Cookie)\s*:\s*[^\n]+/gi,"[REDACTED_HEADER]"],
  [/\bbot\d{6,12}:[A-Za-z0-9_-]{30,}/g,"bot[REDACTED]"],
  [/\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/g,"[REDACTED_BOT_TOKEN]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,"[REDACTED_JWT]"],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}|\bAIza[0-9A-Za-z_-]{20,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bxox[abprs]-[A-Za-z0-9-]{10,}/g,"[REDACTED_KEY]"],
  [/([?&](?:key|token|api_key|apikey|access_token|secret)=)[^&\s]+/gi,"$1[REDACTED]"],
  [/\b(api[_-]?key|access[_-]?token|token|secret|password|authorization|admin_token|[a-z_]*_(?:secret|key))\b\s*[:=]\s*["']?[^\s"',;]+/gi,"$1=[REDACTED]"],
  [/\b(chat_id|chatId|chat|from_id|recipient|phone)\b\s*[:=]\s*["']?[+-]?\d+/gi,"$1=[REDACTED]"],
  [/\b(?:\d[ -]?){13,19}\b/g,"[REDACTED_NUMBER]"],
  [/\+?\b\d{9,12}\b/g,"[REDACTED_NUMBER]"],
  [/\b[A-Fa-f0-9]{32,}\b|\b[A-Za-z0-9+\/]{40,}={0,2}/g,"[REDACTED_BLOB]"]
];
export function redact(value,max=500){
  try{
    let s=typeof value==="string"?value:value instanceof Error?value.message:value?.message!=null?String(value.message):String(value??"");
    for(const [re,rep] of REDACTIONS)s=s.replace(re,rep);
    return s.length>max?s.slice(0,max)+"…":s;
  }catch{return "[redacted-error]";}
}
// For anything persisted or shown on the dashboard: redact(), plus customer free text removed — Persian/Arabic-script runs and
// quoted strings become [text], Persian/Arabic digits are normalised first so phone numbers with separators are masked too.
export function safeErrorText(value,max=300){
  try{
    let s=redact(value,4000).replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    s=s.replace(/\+?\d[\d\s().-]{6,}\d/g,"[REDACTED_NUMBER]")
       .replace(/"[^"\n]{0,200}"|'[^'\n]{0,200}'|«[^»\n]{0,200}»/g,"[text]")
       .replace(/[؀-ۿݐ-ݿ‌ﭐ-﷿ﹰ-﻿]+(?:[\s\d.,،!?:;-]+[؀-ۿݐ-ݿ‌ﭐ-﷿ﹰ-﻿]+)*/g,"[text]");
    return s.length>max?s.slice(0,max)+"…":s;
  }catch{return "[redacted-error]";}
}

function clampLimits(options={}){
  const out={};
  for(const k of Object.keys(DEFAULT_LIMITS)){
    const v=Number(options[k]);
    out[k]=Number.isFinite(v)&&v>=0?Math.min(Math.floor(v),HARD_LIMITS[k]):DEFAULT_LIMITS[k];
  }
  out.concurrency=Math.max(1,out.concurrency);out.timeoutMs=Math.max(1,out.timeoutMs);out.maxRunMs=Math.max(1,out.maxRunMs);
  return out;
}

// Structural checks before anything runs: unique ids, known dependencies, known capability, a run() function, and no cycles.
export function validateTaskGraph(tasks){
  const problems=[],byId=new Map();
  if(!Array.isArray(tasks))return {ok:false,problems:["tasks must be an array"],order:[]};
  for(const t of tasks){
    const id=String(t?.id??"").trim();
    if(!id){problems.push("task without id");continue;}
    if(byId.has(id)){problems.push(`duplicate task id ${id}`);continue;}
    if(typeof t.run!=="function")problems.push(`task ${id} has no run()`);
    if(!CAPABILITIES.includes(t.capability))problems.push(`task ${id} has unknown capability ${String(t.capability)}`);
    byId.set(id,t);
  }
  const links=t=>[...(t.deps||[]),...(t.after||[])];
  for(const t of byId.values())for(const d of links(t))if(!byId.has(d))problems.push(`task ${t.id} depends on unknown task ${d}`);
  // Kahn's algorithm: whatever cannot be ordered is part of a cycle.
  const indeg=new Map([...byId.keys()].map(id=>[id,0])),next=new Map([...byId.keys()].map(id=>[id,[]]));
  for(const t of byId.values())for(const d of new Set(links(t)))if(byId.has(d)){indeg.set(t.id,indeg.get(t.id)+1);next.get(d).push(t.id);}
  const queue=[...byId.keys()].filter(id=>indeg.get(id)===0),order=[];
  while(queue.length){const id=queue.shift();order.push(id);for(const n of next.get(id)){indeg.set(n,indeg.get(n)-1);if(indeg.get(n)===0)queue.push(n);}}
  if(order.length!==byId.size)problems.push(`dependency cycle among ${[...byId.keys()].filter(id=>!order.includes(id)).join(", ")}`);
  return {ok:problems.length===0,problems,order};
}

const sleep=(ms,signal)=>new Promise(resolve=>{const t=setTimeout(resolve,ms);signal?.addEventListener?.("abort",()=>{clearTimeout(t);resolve();},{once:true});});

// One attempt with a hard timeout: the task gets an AbortSignal and the attempt settles at timeoutMs whether or not the task honours it.
async function attempt(task,ctx,timeoutMs){
  const controller=new AbortController();let timer;
  const timeout=new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve({timedOut:true});},timeoutMs);});
  try{
    const work=Promise.resolve().then(()=>task.run({...ctx,signal:controller.signal})).then(value=>({value}),error=>({error}));
    return await Promise.race([work,timeout]);
  }finally{clearTimeout(timer);}
}

/**
 * Run a task graph. Each task: {id, agent, version, capability, deps?, after?, dedupKey?, cost?, retryable?, run(ctx)} — deps must
 * succeed first (a failed dependency skips the task); after only orders the task behind others, whatever their outcome.
 * ctx = {signal, attempt, results (outputs of succeeded dependencies), runId}. Options: limits (see DEFAULT_LIMITS), allowCapabilities (default ["read"]; "draft" must be explicit), approvedTaskIds (side_effect tasks the owner approved, one-shot), runId, now().
 * Returns {report, outputs}: report is redacted and safe to persist or display; outputs (raw task results) stay in memory. Never throws.
 */
export async function runAgentGraph(tasks,options={}){
  const now=typeof options.now==="function"?options.now:()=>Date.now();
  const limits=clampLimits(options),runId=String(options.runId||`run-${now()}`),started=now(),results={};
  const allowed=new Set((Array.isArray(options.allowCapabilities)?options.allowCapabilities:["read"]).filter(c=>ALLOWABLE.has(c)));
  // The only way a side_effect task runs: the caller names it in approvedTaskIds after consuming its one-shot owner approval.
  const approvedIds=new Set((Array.isArray(options.approvedTaskIds)?options.approvedTaskIds:[]).map(String));
  const report={ok:false,orchestrator_version:ORCHESTRATOR_VERSION,run_id:runId,started_at:new Date(started).toISOString(),finished_at:null,duration_ms:0,
    limits,tasks:[],counts:{},dead_letters:[],alerts:[],budget:{limit:limits.budgetUnits,spent:0},agents:{},heartbeat:null};
  const finish=()=>{
    const end=now();report.finished_at=new Date(end).toISOString();report.duration_ms=end-started;
    for(const s of TASK_STATES)report.counts[s]=report.tasks.filter(t=>t.state===s).length;
    for(const t of report.tasks){
      const a=report.agents[t.agent]||(report.agents[t.agent]={versions:[],runs:0,succeeded:0,failed:0,success_rate:null});
      if(t.version&&!a.versions.includes(t.version))a.versions.push(t.version);
      if(["succeeded","failed","timed_out"].includes(t.state)){a.runs++;if(t.state==="succeeded")a.succeeded++;else a.failed++;}
    }
    for(const a of Object.values(report.agents))a.success_rate=a.runs?Math.round(a.succeeded*1000/a.runs)/10:null;
    report.ok=report.alerts.every(a=>a.level!=="critical")&&report.dead_letters.length===0;
    report.heartbeat={at:report.finished_at,run_id:runId,healthy:report.alerts.every(a=>a.level!=="critical")};
    return report;
  };
  try{
    const graph=validateTaskGraph(tasks);
    if(!graph.ok){report.alerts.push({level:"critical",code:"invalid_task_graph",message:redact(graph.problems.join("; "),600)});return {report:finish(),outputs:{}};}
    const byId=new Map(tasks.map(t=>[String(t.id),t])),entries=new Map(),canonical=new Map(),seenKeys=new Map();
    for(const id of graph.order){
      const t=byId.get(id);
      const e={id,agent:String(t.agent||"unknown"),version:String(t.version||""),capability:t.capability,state:null,attempts:0,duration_ms:0,cost:0,error:null};
      entries.set(id,e);report.tasks.push(e);
      if(!allowed.has(t.capability)&&!(t.capability==="side_effect"&&approvedIds.has(id))){e.state="blocked_policy";e.error=t.capability==="side_effect"?"side_effect tasks need the owner Approval Gate; never run by the orchestrator":`capability ${t.capability} not allowed for this run`;continue;}
      const key=t.dedupKey==null?null:String(t.dedupKey);
      if(key!==null&&seenKeys.has(key)){e.state="deduplicated";canonical.set(id,seenKeys.get(key));continue;}
      if(key!==null)seenKeys.set(key,id);
    }
    if(report.tasks.some(e=>e.state==="blocked_policy"))report.alerts.push({level:"info",code:"capability_blocked",message:"Some tasks were not run: their capability is not allowed (financial or unknown actions always need owner approval)"});
    const settledOk=id=>{const c=canonical.get(id)||id,e=entries.get(c);return e?.state==="succeeded";};
    const isSettled=id=>{const c=canonical.get(id)||id,e=entries.get(c);return e?.state!==null&&e?.state!==undefined;};
    let started_count=0,stopReason=null;
    const inflight=new Map();
    const pending=()=>report.tasks.filter(e=>e.state===null&&!inflight.has(e.id));
    const runTask=async e=>{
      const t=byId.get(e.id),t0=now(),depResults={};
      for(const d of t.deps||[]){const c=canonical.get(d)||d;depResults[d]=results[c];}
      const maxAttempts=limits.retries+1;let last=null;
      for(let n=1;n<=maxAttempts;n++){
        e.attempts=n;
        const remaining=limits.maxRunMs-(now()-started);
        if(remaining<=0){last={deadline:true};break;}
        const r=await attempt(t,{attempt:n,results:depResults,runId},Math.min(limits.timeoutMs,remaining));
        if(!r.timedOut&&!("error" in r)){e.state="succeeded";results[e.id]=r.value;last=null;break;}
        last=r;
        const retryable=t.retryable!==false&&(r.timedOut||r.error?.retryable!==false);   // a non-retryable task is never re-run, not even after a timeout
        if(!retryable||n===maxAttempts)break;
        const wait=Math.min(limits.backoffMs*2**(n-1),HARD_LIMITS.backoffMs,Math.max(0,limits.maxRunMs-(now()-started)-1));
        if(wait>0)await sleep(wait);
      }
      if(last){
        e.state=last.deadline?"deadline_reached":last.timedOut?"timed_out":"failed";
        e.error=last.deadline?"run deadline reached before this attempt":last.timedOut?`timed out after ${limits.timeoutMs} ms`:redact(last.error);
        if(e.state!=="deadline_reached")report.dead_letters.push({task_id:e.id,agent:e.agent,version:e.version,state:e.state,attempts:e.attempts,error:e.error,at:new Date(now()).toISOString()});
      }
      e.duration_ms=now()-t0;
    };
    // Scheduler: bounded by the number of tasks — each pass either starts a task, settles one, or ends the run.
    for(let guard=0;guard<=report.tasks.length*2+2;guard++){
      if(now()-started>=limits.maxRunMs&&!stopReason)stopReason="deadline_reached";
      for(const e of pending()){
        const t=byId.get(e.id),deps=t.deps||[],after=t.after||[];
        if(deps.some(d=>isSettled(d)&&!settledOk(d))){e.state="skipped_dependency";e.error="a dependency did not succeed";continue;}
        if(!deps.every(isSettled)||!after.every(isSettled))continue;
        if(stopReason){e.state=stopReason;continue;}
        if(inflight.size>=limits.concurrency)break;
        if(started_count>=limits.maxTasks){e.state="budget_exhausted";e.error=`maxTasks ${limits.maxTasks} reached`;continue;}
        const cost=Math.max(0,Number(t.cost??1)||0);
        if(report.budget.spent+cost>limits.budgetUnits){e.state="budget_exhausted";e.error=`budget ${limits.budgetUnits} units reached`;continue;}
        report.budget.spent+=cost;e.cost=cost;started_count++;
        inflight.set(e.id,runTask(e).catch(err=>{e.state="failed";e.error=redact(err);}).finally(()=>inflight.delete(e.id)));
      }
      if(!inflight.size){
        // Nothing running and nothing startable: whatever is still waiting can never start (its dependency ended unsuccessfully
        // through a state set above, or the run stopped).
        const left=pending();if(!left.length)break;
        if(left.every(e=>![...(byId.get(e.id).deps||[]),...(byId.get(e.id).after||[])].every(isSettled))){for(const e of left){e.state=stopReason||"not_run";}break;}
        continue;
      }
      await Promise.race(inflight.values());
    }
    for(const e of report.tasks)if(e.state===null){e.state="not_run";}
    if(report.dead_letters.length)report.alerts.push({level:"warning",code:"dead_letters",message:`${report.dead_letters.length} task(s) failed after their retries`});
    if(report.tasks.some(e=>e.state==="budget_exhausted"))report.alerts.push({level:"warning",code:"budget_exhausted",message:"Resource limit reached; remaining tasks were not started"});
    if(report.tasks.some(e=>e.state==="deadline_reached"))report.alerts.push({level:"warning",code:"deadline_reached",message:`Run stopped at ${limits.maxRunMs} ms`});
    return {report:finish(),outputs:results};
  }catch(error){
    report.alerts.push({level:"critical",code:"orchestrator_error",message:redact(error)});
    return {report:finish(),outputs:results};
  }
}
