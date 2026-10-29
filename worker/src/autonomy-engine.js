import { runAgentGraph, autonomyActionCapability, autonomyTaskDedupKey, autonomyDailyQuota, AUTONOMY_DAILY_QUOTAS, AUTONOMY_UNIT_COST, AUTONOMY_PROVIDER, autonomyBudgets, ORCHESTRATOR_VERSION, redact, safeErrorText } from "./agent-orchestrator.js";
import { recordRun, approvalForTask, requestApproval, consumeApproval, decideApproval, acknowledgeAlert, resolveDeadLetter, opsOverview, cancelObsoleteApprovals } from "./agent-ops-store.js";
import { bearerMatches } from "./secure-compare.js";
import { qualitySummary, versionSummary, rollbackEligibility, deadLetterEligibility } from "./agent-watchdog.js";
import { agentActivitySummary } from "./agent-activity.js";
const now=()=>new Date().toISOString();
const uid=()=>crypto.randomUUID();

export const MODULES=[
  "telegram","whatsapp","instagram","website","crm",
 "ads","content","media","photo","learning","revenue"
];
const DEFAULTS=Object.fromEntries(MODULES.map(x=>[x,true]));

const ACTIONS={
  telegram:["status","inbox_scan","inbox_reply"],
  whatsapp:["status","inbox_scan"],
  instagram:["status","health_and_leads"],
  website:["status","growth_scan"],
  crm:["status","lead_intelligence","lead_discovery"],
  ads:["status","discover_opportunities"],
  content:["status","generate_and_queue"],
  media:["status","video_generate"],
  photo:["status","photo_generate"],
  learning:["status","run"],
  revenue:["status","funnel_snapshot"]
};
const OBSERVE_ALLOWED_ACTIONS=new Set([
  ...MODULES.map(module=>`${module}:status`),
  "telegram:inbox_scan",
  "whatsapp:inbox_scan",
  "instagram:health_and_leads",
  "website:growth_scan",
  "crm:lead_intelligence",
  "revenue:funnel_snapshot"
]);
const DRAFT_ALLOWED_ACTIONS=new Set([
  ...OBSERVE_ALLOWED_ACTIONS,
  "telegram:inbox_reply",
  "crm:lead_discovery",
  "ads:discover_opportunities",
  "content:generate_and_queue",
  "media:video_generate",
  "photo:photo_generate"
]);
// Keep publishing outside the no-publish action policy, including future actions.
const PUBLISH_ACTIONS=new Set([
  "telegram:publish",
  "whatsapp:publish",
  "instagram:publish",
  "content:publish"
]);
const NO_PUBLISH_ALLOWED_ACTIONS=new Set(
  MODULES.flatMap(module=>ACTIONS[module].map(action=>`${module}:${action}`))
    .filter(action=>!PUBLISH_ACTIONS.has(action))
);

function explicitPlanConstraints(raw){
 const text=String(raw||"").toLowerCase();
 let mode=null;
 if(/\b(?:only\s+observe|observe\s+only|read[- ]only)\b|(?:فقط|صرفا|صرفاً)\s*(?:مشاهده|بررسی|نظارت)/i.test(text))mode="observe";
 else if(/\b(?:draft\s+only|only\s+draft)\b|(?:فقط|صرفا|صرفاً)\s*پیش[\u200c ]?نویس/i.test(text))mode="draft";
 const noPublish=/\b(?:no\s+publish(?:ing)?|(?:do\s+not|don['’]?t|dont|never)\s+publish(?:ing)?|publish\s+nothing)\b|(?:بدون\s+انتشار|عدم\s+انتشار|منتشر\s+نکن|انتشار\s+نده)/i.test(text);
 return {mode,noPublish};
}

function applyPlanSafety(plan,raw){
 const constraints=explicitPlanConstraints(raw);
 const planMode=plan.mode==="no_publish"?"execute":plan.mode;
 const mode=constraints.mode||(["observe","draft","execute"].includes(planMode)?planMode:"execute");
 const noPublish=constraints.noPublish||plan.no_publish===true||plan.mode==="no_publish"||mode==="draft";
 const blockedModules=new Set();
 const addBlockedModule=value=>{
  const module=String(value||"").trim().toLowerCase();
  if(MODULES.includes(module))blockedModules.add(module);
 };
 for(const item of Array.isArray(plan.blocked_modules)?plan.blocked_modules:[]){
  addBlockedModule(typeof item==="string"?item:item?.module);
 }
 const blockedActions=new Set();
 const addBlockedAction=(module,action)=>{
  const m=String(module||"").trim().toLowerCase();
  const a=String(action||"").trim().toLowerCase();
  if(ACTIONS[m]?.includes(a))blockedActions.add(`${m}:${a}`);
  else if(MODULES.includes(m))blockedModules.add(m);
 };
 for(const item of Array.isArray(plan.blocked_actions)?plan.blocked_actions:[]){
  if(typeof item==="string"){
   const match=item.trim().match(/^([a-z_]+)\s*[:/.]\s*([a-z_]+)$/i);
   if(match){addBlockedAction(match[1],match[2]);continue;}
   for(const module of MODULES)if(ACTIONS[module].includes(item.trim()))addBlockedAction(module,item.trim());
   continue;
  }
  if(!item||typeof item!=="object")continue;
  const module=String(item.module||"").trim().toLowerCase();
  const actions=Array.isArray(item.actions)?item.actions:[item.action];
  if(!actions.some(action=>String(action||"").trim()))addBlockedModule(module);
  for(const action of actions)if(action)addBlockedAction(module,action);
 }
 const tasks=(Array.isArray(plan.tasks)?plan.tasks:[]).filter(task=>{
  if(!task||!MODULES.includes(task.module)||!ACTIONS[task.module]?.includes(task.action))return false;
  const key=`${task.module}:${task.action}`;
  if(blockedModules.has(task.module)||blockedActions.has(key)||noPublish&&!NO_PUBLISH_ALLOWED_ACTIONS.has(key))return false;
  if(mode==="observe"&&!OBSERVE_ALLOWED_ACTIONS.has(key))return false;
  if(mode==="draft"&&!DRAFT_ALLOWED_ACTIONS.has(key))return false;
  return true;
 });
 return {...plan,mode,no_publish:noPublish,blocked_modules:[...blockedModules],blocked_actions:[...blockedActions].map(key=>{const [module,action]=key.split(":");return {module,action}}),tasks};
}

// The master gate is checked on every inbound auto-reply: the idempotent DDL below runs once per isolate per database, not per
// call. A failed setup is not memoised, so the next call simply retries it.
const ENSURED=new WeakMap();
async function ensure(env){
 let ready=ENSURED.get(env.DB);
 if(!ready){ready=ensureNow(env).catch(error=>{ENSURED.delete(env.DB);throw error;});ENSURED.set(env.DB,ready);}
 return ready;
}
async function ensureNow(env){
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS autonomy_controls(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)`).run();
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS autonomy_commands(id TEXT PRIMARY KEY,raw_command TEXT NOT NULL,plan_json TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`).run();
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS autonomy_tasks(id TEXT PRIMARY KEY,command_id TEXT NOT NULL,module TEXT NOT NULL,action TEXT NOT NULL,status TEXT NOT NULL,priority INTEGER NOT NULL DEFAULT 50,payload_json TEXT,result_json TEXT,error TEXT,attempts INTEGER NOT NULL DEFAULT 0,scheduled_at TEXT,started_at TEXT,finished_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`).run();
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS autonomy_locks(module TEXT PRIMARY KEY,task_id TEXT NOT NULL,locked_at TEXT NOT NULL)`).run();
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS autonomy_action_controls(module TEXT NOT NULL,action TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,PRIMARY KEY(module,action))`).run();
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS autonomy_events(id TEXT PRIMARY KEY,type TEXT NOT NULL,module TEXT,message TEXT,meta_json TEXT,created_at TEXT NOT NULL)`).run();
}

async function getKV(env,key){const r=await env.DB.prepare("SELECT value FROM autonomy_controls WHERE key=?").bind(key).first();return r?.value??null}
async function setKV(env,key,value){await env.DB.prepare("INSERT OR REPLACE INTO autonomy_controls(key,value,updated_at) VALUES(?,?,?)").bind(key,String(value),now()).run()}
export async function autonomyMasterGate(env){await ensure(env);const v=await getKV(env,"master");return v===null||v==="on"}
async function controls(env){
 await ensure(env);
 let master=await getKV(env,"master");if(!master)master="on";
 const mods={...DEFAULTS};try{Object.assign(mods,JSON.parse(await getKV(env,"modules")||"{}"))}catch{}
 return {master,modules:mods};
}
async function event(env,type,module,message,meta={}){try{await env.DB.prepare("INSERT INTO autonomy_events VALUES(?,?,?,?,?,?)").bind(uid(),type,module||null,message||"",JSON.stringify(meta),now()).run()}catch{}}

function fallbackPlan(raw){
 const s=String(raw||"").toLowerCase(),tasks=[];
 const add=(module,action,payload={},priority=50)=>tasks.push({module,action,payload,priority});
 const aliases={telegram:["telegram","تلگرام"],whatsapp:["whatsapp","واتساپ"],instagram:["instagram","اینستاگرام","اینستا"],website:["website","وبسایت","سایت"],crm:["crm","مشتری","لید"],ads:["ads","تبلیغ","اسپانسر","رپورتاژ"],content:["content","محتوا","پست","استوری"],media:["media","ویدیو","ویدیوی","video"],photo:["photo","عکس","تصویر"],learning:["learning","یادگیری"],revenue:["revenue","درآمد","فروش"]};
 const blocked=new Set();
 for(const [module,names] of Object.entries(aliases))for(const name of names){
   const escaped=name;
   if(new RegExp(`(?:نه|بدون|نکن|متوقف|غیرفعال|لغو|نمی\\s*خواهم|don['’]?t|do not|no|off|block|stop)[^\\n]{0,50}${escaped}|${escaped}[^\\n]{0,35}(?:نه|نکن|متوقف|غیرفعال|لغو|نمی\\s*خواهم|don['’]?t|do not|off|block|stop)`).test(s))blocked.add(module);
 }
 if(/تلگرام|telegram/.test(s))add("telegram",/جواب|پاسخ|reply/.test(s)?"inbox_reply":"inbox_scan",{},90);
 if(/واتساپ|whatsapp/.test(s))add("whatsapp","inbox_scan",{},85);
 if(/اینستاگرام|instagram|اینستا/.test(s))add("instagram","health_and_leads",{},70);
 if(/وبسایت|website|سایت/.test(s))add("website","growth_scan",{},70);
 if(/مشتری|مشتری جدید|customer|lead discovery|crm|لید/.test(s))add("crm","lead_discovery",{},90);
 if(/تبلیغ|اسپانسر|ads|advertis|رپورتاژ/.test(s))add("ads","discover_opportunities",{},85);
 if(/محتوا|content|پست|استوری|story/.test(s))add("content","generate_and_queue",{platform:"telegram",market:"iran_iraq"},70);
 if(/ویدیو|ویدیوی|video|wan\s*2\.7|i2v|image[- ]to[- ]video/.test(s))add("media","video_generate",{},95);
  if(/یادگیری|learn|بهینه|optimi/.test(s))add("learning","run",{},55);
 if(/درآمد|فروش|revenue|پول/.test(s))add("revenue","funnel_snapshot",{},90);
 if(/همه|all|فعالیت|شروع|start/.test(s))for(const m of MODULES)if(!tasks.some(x=>x.module===m))add(m,m==="learning"?"run":"status",{},40);
 for(let i=tasks.length-1;i>=0;i--)if(blocked.has(tasks[i].module))tasks.splice(i,1);
 if(!tasks.length&&!blocked.size)add("revenue","funnel_snapshot",{},30);
 return applyPlanSafety({goal:"Execute the user's requested business activity with verification and learning",tasks,blocked_modules:[...blocked],source:"fallback"},raw);
}
function extractJson(text){
 const t=String(text||"").trim().replace(/^```(?:json)?/i,"").replace(/```$/,"").trim();
 try{return JSON.parse(t)}catch{}
 const a=t.indexOf("{"),b=t.lastIndexOf("}");if(a>=0&&b>a)try{return JSON.parse(t.slice(a,b+1))}catch{}
 return null;
}
async function aiPlan(env,raw){
 if(!env.OPENAI_API_KEY)return fallbackPlan(raw);
 const catalog=MODULES.map(m=>`${m}: ${ACTIONS[m].join(",")}`).join("\n");
 const prompt=`You are the planning brain of HAMZEHI SOCIAL AI.
Convert the user's Persian/English command into a SAFE executable plan.
Only use these modules/actions:
${catalog}
Rules:
- Never invent an action.
- Respect explicit OFF, BLOCK, STOP, DON'T, ONLY OBSERVE, DRAFT ONLY, or NO PUBLISH instructions.
- If the user says a channel should not act, do not create tasks for it.
- Keep modules independent; do not create cross-module dependencies unless the user explicitly requests analysis using another module's data.
- Publishing or external customer replies are sensitive: prefer observation/draft unless the user explicitly asks for execution and the existing backend supports it.
- Return JSON only: {"goal":"...","mode":"observe|draft|execute","no_publish":false,"tasks":[{"module":"...","action":"...","payload":{},"priority":50}],"blocked_modules":["module"],"blocked_actions":[{"module":"module","action":"action"}]}
User command: ${raw}`;
 try{
  const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:env.OPENAI_MODEL||"gpt-5.6-luna",input:prompt})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(`AI planner HTTP ${r.status}`);
  const text=d.output_text||((d.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||"").join(""));
  const p=extractJson(text);if(!p||!Array.isArray(p.tasks))throw new Error("AI planner returned invalid plan");
  const inferredBlocked=fallbackPlan(raw).blocked_modules||[];
  return applyPlanSafety({...p,source:"ai",blocked_modules:[...(Array.isArray(p.blocked_modules)?p.blocked_modules:[]),...inferredBlocked]},raw);
 }catch(e){const p=fallbackPlan(raw);p.planner_error=safeErrorText(e);return p}
}
async function actionEnabled(env,module,action){
 const r=await env.DB.prepare("SELECT enabled FROM autonomy_action_controls WHERE module=? AND action=?").bind(module,action).first();
 return r===null||Number(r.enabled)!==0;
}
async function callSelf(req,env,path,method="GET",body){
  const base=String(
    env.PUBLIC_WORKER_BASE_URL ||
    "https://hamzehi-social-ai.miladmorab829.workers.dev"
  ).replace(/\/$/,'');

  const url=new URL(base);
  url.pathname=path;
  url.search="";

  const headers={
    Authorization:`Bearer ${env.ADMIN_TOKEN}`
  };

  if(body){
    headers["Content-Type"]="application/json";
  }

  const r=await fetch(url,{
    method,
    headers,
    body:body?JSON.stringify(body):undefined
  });

  const responseText=await r.text();

  await event(env,"autonomy_self_call_diagnostic","self","Self-call diagnostic",{
    path,
    method,
    url:url.toString(),
    status:r.status,
    ok:r.ok,
    response:responseText.slice(0,1000)
  });

  let data;
  try{
    data=JSON.parse(responseText);
  }catch{
    data={
      ok:false,
      error:`HTTP ${r.status}`,
      response_text:responseText.slice(0,1000)
    };
  }

  return {
    status:r.status,
    data
  };
}
async function checkedSelfCall(req,env,path,method="GET",body){
 const r=await callSelf(req,env,path,method,body);
 if(r.status>=300||r.data?.ok===false)throw new Error(r.data?.error||`Self-call failed (HTTP ${r.status})`);
 return r.data;
}
// Shared canonical labels only. Revenue reporting remains on the existing
// funnel path until the separately deferred payment/revenue integration.
export const CURRENCY_RULES={TOMAN:{market:"IRAN",exponent:0,input_hint:"Enter amount in whole Toman"},USD:{market:"ARAB",exponent:2,input_hint:"Enter amount in US cents (100 = $1.00)"}};
export const MARKET_CURRENCY={IRAN:"TOMAN",ARAB:"USD"};
const CURRENCY_ALIASES={TOMAN:"TOMAN",TOMANS:"TOMAN",IRT:"TOMAN","تومان":"TOMAN","تومن":"TOMAN",USD:"USD","US$":"USD","$":"USD","دلار":"USD","دولار":"USD"};
export function canonicalCurrency(value){const raw=String(value??"").normalize("NFKC").trim();if(!raw)return null;return CURRENCY_ALIASES[raw]||CURRENCY_ALIASES[raw.toUpperCase()]||raw.toUpperCase().slice(0,12);}
async function revenue(env){
 const r=await env.DB.prepare("SELECT stage,COUNT(*) n FROM leads GROUP BY stage").all(),f={};
 for(const x of r.results||[])f[x.stage]=Number(x.n||0);
 const o=await env.DB.prepare("SELECT COUNT(*) n FROM leads WHERE stage IN ('qualified','contacted','replied','negotiation')").first();
 const c=await env.DB.prepare("SELECT COUNT(*) n FROM leads WHERE stage IN ('customer','converted')").first();
 return {ok:true,funnel:f,opportunities:Number(o?.n||0),conversions:Number(c?.n||0),money:{status:"not_available",reason:"No verified revenue amount field is present in the current data model"}};
}
async function executeTask(env,req,t){
 const p=JSON.parse(t.payload_json||"{}");
 if(t.action==="status")return {ok:true,module:t.module,mode:"observed"};
 if(t.module==="media"&&t.action==="video_generate"){
  const r=await callSelf(
    req,
    env,
    "/api/video-autopilot/run",
    "POST",
    {}
  );

  if(r.status>=300||r.data?.ok===false){
    throw new Error(
      r.data?.error||
      `Video generation request failed (HTTP ${r.status})`
    );
  }

  return {
    ok:true,
    result:r.data?.result||r.data
  };
}
if(t.module==="photo"&&t.action==="photo_generate"){
  const r=await callSelf(
    req,
    env,
    "/api/photo-autopilot/run",
    "POST",
    {}
  );

  if(r.status>=300||r.data?.ok===false){
    throw new Error(
      r.data?.error||
      `Photo Autopilot request failed (HTTP ${r.status})`
    );
  }

  return {
    ok:true,
    result:r.data
  };
}
  if(t.module==="telegram"&&t.action==="inbox_scan")return await checkedSelfCall(req,env,"/api/inbox");
 if(t.module==="telegram"&&t.action==="inbox_reply"){const data=await checkedSelfCall(req,env,"/api/inbox");return {ok:true,mode:"reply_queue",items:data.items||[],note:"Reply drafts are queued; no external send is performed by this action."}}
 if(t.module==="content"&&t.action==="generate_and_queue")return await checkedSelfCall(req,env,"/api/content/automation/run","POST",{platform:p.platform||"telegram",market:p.market||"iran_iraq"});
 if(t.module==="ads"&&t.action==="discover_opportunities")return await checkedSelfCall(req,env,"/api/ads/autopilot","POST",p);
 if(t.module==="learning"&&t.action==="run")return await checkedSelfCall(req,env,"/api/learning/run","POST",{});
 if(t.module==="crm"&&t.action==="lead_intelligence")return await checkedSelfCall(req,env,"/api/ads/intelligence");
 if(t.module==="crm"&&t.action==="lead_discovery")return await checkedSelfCall(req,env,"/api/crm/lead-discovery","POST",p);
  if(t.module==="website"&&t.action==="growth_scan")return await checkedSelfCall(req,env,"/api/website/growth");
 if(t.module==="revenue"&&t.action==="funnel_snapshot")return await revenue(env);
 if(t.module==="instagram"&&t.action==="health_and_leads")return await checkedSelfCall(req,env,"/api/settings");
 if(t.module==="whatsapp"&&t.action==="inbox_scan")return await checkedSelfCall(req,env,"/api/inbox");
 throw new Error("Unsupported autonomous action");
}
async function acquire(env,module,taskId){
 const r=await env.DB.prepare("INSERT OR IGNORE INTO autonomy_locks(module,task_id,locked_at) VALUES(?,?,?)").bind(module,taskId,now()).run();
 return Number(r.meta?.changes||0)===1;
}
async function release(env,module,taskId){
 await env.DB.prepare("DELETE FROM autonomy_locks WHERE module=? AND task_id=?").bind(module,taskId).run();
}

async function recoverStaleLocks(env,maxAgeMs=15*60*1000){
 const cutoff=Date.now()-maxAgeMs;
 const rows=await env.DB.prepare(
  "SELECT l.module,l.task_id,l.locked_at,t.status FROM autonomy_locks l LEFT JOIN autonomy_tasks t ON t.id=l.task_id"
 ).all();

 let recovered=0;

 for(const row of rows.results||[]){
  const lockedAt=Date.parse(row.locked_at||"");
  if(!Number.isFinite(lockedAt)||lockedAt>cutoff)continue;
  // An old lock whose task is no longer running (finished, failed, re-queued or deleted) is a leftover: release it so the module
  // is not stalled forever (seen in Production since 2026-09-29). Only the lock row is removed; the task row is not touched.
  if(row.status!=="running"){
   const d=await env.DB.prepare("DELETE FROM autonomy_locks WHERE module=? AND task_id=? AND locked_at=?").bind(row.module,row.task_id,row.locked_at).run();
   if(Number(d.meta?.changes||0)===1){recovered++;await event(env,"orphan_lock_released",row.module,"Released a leftover autonomy lock",{task_id:row.task_id,locked_at:row.locked_at,task_status:row.status||null});}
   continue;
  }

  const t=now();
  const ageMs=Math.max(0,Date.now()-lockedAt);

  const r=await env.DB.prepare(
   "UPDATE autonomy_tasks SET status='failed',error=?,finished_at=?,updated_at=? WHERE id=? AND status='running'"
  ).bind(
   "Stale autonomous lock recovered automatically",
   t,
   t,
   row.task_id
  ).run();

  if(Number(r.meta?.changes||0)!==1)continue;

  await env.DB.prepare(
   "DELETE FROM autonomy_locks WHERE module=? AND task_id=?"
  ).bind(row.module,row.task_id).run();

  recovered++;

  await event(
   env,
   "stale_lock_recovered",
   row.module,
   "Recovered stale autonomous lock",
   {
    task_id:row.task_id,
    locked_at:row.locked_at,
    age_ms:ageMs
   }
  );
 }

 return recovered;
}
function taskAllowedByParentPlan(task){
 let plan;
 try{plan=JSON.parse(String(task.parent_plan_json||""))}catch{return false}
 if(!plan||typeof plan!=="object"||!Array.isArray(plan.tasks))return false;
 const plannedTask=plan.tasks.find(item=>item?.module===task.module&&item?.action===task.action);
 if(!plannedTask)return false;
 return applyPlanSafety(
  {...plan,tasks:[plannedTask]},
  String(task.parent_raw_command||"")
 ).tasks.length===1;
}

// Background autonomy tasks through the bounded orchestrator (Stage 2A). OFF unless the Worker var AUTONOMY_ORCHESTRATOR is
// exactly "on"; when OFF, runTasks below runs the original sequential loop unchanged. Customer replies never pass through here
// (runTasks is reached only from the cron and the admin /api/autonomy/tasks/run route).
// Version of this engine as recorded per agent in agent_versions (bump on behaviour changes; rollback reference for the owner).
export const AUTONOMY_ENGINE_VERSION=`autonomy-engine@${ORCHESTRATOR_VERSION}+stage3.2`;
// Phase 11.2C: per-action task timeouts (ms) above the 30 s default. Photo generation (Telegram download + OpenAI image edit) took
// 26–28 s on healthy days and timed out at 30 s on 2026-10-22; its OpenAI call is bounded at 45 s inside the Worker so a slow call fails
// through the photo error path (daily lock released, error audited) before this outer limit. Capped by HARD_LIMITS (60 s).
export const AUTONOMY_TASK_TIMEOUT_MS=Object.freeze({"photo:photo_generate":55000});
function orchestratorEnabled(env){return env?.AUTONOMY_ORCHESTRATOR==="on"}
// Owner autonomy policy (2026-10-19): paid non-financial actions run without approval, but at most their daily quota per UTC day
// (every started attempt counts, failed ones too). Over quota the task is deferred to the next UTC day, never run and never dropped.
async function quotaOverrides(env){try{const v=JSON.parse(await getKV(env,"quotas")||"{}");return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}catch{return {}}}
const utcDayStart=(ms=Date.now())=>{const d=new Date(ms);d.setUTCHours(0,0,0,0);return d.toISOString()};
const nextUtcDay=(ms=Date.now())=>{const d=new Date(ms);d.setUTCHours(24,0,0,0);return d.toISOString()};
// Quota use = every attempt started today (UTC) for this module:action, whatever the row's status now (running, completed, failed,
// or re-queued after a failure) — conservative: an attempt that may have reached the paid API is never forgotten.
async function quotaUsed(env,module,action){const r=await env.DB.prepare("SELECT COALESCE(SUM(attempts),0) n FROM autonomy_tasks WHERE module=? AND action=? AND started_at>=?").bind(module,action,utcDayStart()).first();return Number(r?.n||0)}
// Atomic claim, one D1 statement: queued → running. For a paid action the same statement also reserves one unit of the daily quota —
// it only matches while the attempts started today stay below the cap. D1 runs each statement atomically on a single writer, so
// concurrent cron runs, admin runs, retries and re-queued tasks on any Worker instance can never consume the same remaining quota.
async function claimTask(env,t,token,cap,budgets=null){
 if(cap==null){const r=await env.DB.prepare("UPDATE autonomy_tasks SET status='running',started_at=?,attempts=attempts+1,updated_at=? WHERE id=? AND status='queued'").bind(token,now(),t.id).run();return Number(r.meta?.changes||0)===1;}
 // Paid: the same statement also checks the daily cost budgets (all paid work today, and this action's provider).
 const key=`${t.module}:${t.action}`,cost=AUTONOMY_UNIT_COST[key]??50,provider=AUTONOMY_PROVIDER[key]||"other",b=budgets||autonomyBudgets({});
 const providerCap=b.providers[provider]??0,providerKeys=PAID_KEYS.filter(k=>AUTONOMY_PROVIDER[k]===provider).map(k=>`'${k}'`).join(",")||"''";
 const r=await env.DB.prepare(`UPDATE autonomy_tasks SET status='running',started_at=?,attempts=attempts+1,updated_at=? WHERE id=? AND status='queued'
   AND (SELECT COALESCE(SUM(q.attempts),0) FROM autonomy_tasks q WHERE q.module=? AND q.action=? AND q.started_at>=?)<?
   AND (SELECT COALESCE(SUM(c.attempts*${COST_CASE}),0) FROM autonomy_tasks c WHERE c.started_at>=?)+?<=?
   AND (SELECT COALESCE(SUM(c.attempts*${COST_CASE}),0) FROM autonomy_tasks c WHERE c.started_at>=? AND c.module||':'||c.action IN (${providerKeys}))+?<=?`)
  .bind(token,now(),t.id,t.module,t.action,utcDayStart(),cap,utcDayStart(),cost,b.daily_units,utcDayStart(),cost,providerCap).run();
 return Number(r.meta?.changes||0)===1;
}
// Cost units per paid module:action (constants only, never request data, so they can be inlined in SQL).
const PAID_KEYS=Object.keys(AUTONOMY_UNIT_COST);
const COST_CASE="(CASE c.module||':'||c.action "+PAID_KEYS.map(k=>`WHEN '${k}' THEN ${Number(AUTONOMY_UNIT_COST[k])}`).join(" ")+" ELSE 0 END)";
async function budgetOverrides(env){try{const v=JSON.parse(await getKV(env,"budgets")||"{}");return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}catch{return {}}}
// Ads daily run budget, shared by EVERY real Ads execution (cron, admin Autopilot run/start, the autonomy ads task, manual discovery,
// auto-run and follow-up drafting): one atomic reservation row per run — at most ads_runs_per_day per UTC day and at most one per
// 55 min, across all entry points and Worker instances. Reserved before any external call and never released, so a retry, timeout
// or concurrent request can never run Ads twice. Read-only Ads routes never reserve.
// The Ads daily run cap (owner budget override or default). Since Phase 09.7 it is the MAXIMUM an owner may set as one market's daily
// discovery limit; it is no longer a counter shared between IRAN, ARAB and CRM follow-ups.
export async function adsGlobalRunCap(env){return autonomyBudgets(await budgetOverrides(env)).ads_runs_per_day;}
// Phase 09.7: three independent daily quotas, each with its own counter, 55-minute spacing and UTC-day reset:
//   ADS_IRAN_DISCOVERY / ADS_IRAQ_DISCOVERY — {market, marketCap}: rows 'ads_autopilot_reserved' tagged with that market only;
//   CRM_FOLLOWUP — reserveCrmFollowupRun(): rows 'crm_followup_reserved'.
// None of them counts or blocks the others. The market is matched with instr() on the JSON written here (no JSON parsing of other rows).
export async function reserveAdsAutopilotRun(env,nowMs=Date.now(),source="scheduled",{spacing=true,market=null,marketCap=null}={}){
  const cap=autonomyBudgets(await budgetOverrides(env)).ads_runs_per_day,d=new Date(nowMs);d.setUTCHours(0,0,0,0);
  if(market){
    if(!["IRAN","ARAB"].includes(market)||!Number.isInteger(marketCap)||marketCap<1)return false;
    const tag=`"market":"${market}"`,since=new Date(nowMs-55*60*1000).toISOString();
    const r=await env.DB.prepare("INSERT INTO system_events(id,type,severity,message,details_json,created_at) SELECT ?,'ads_autopilot_reserved','info','Ads run reserved (daily budget)',?,? WHERE (SELECT COUNT(*) FROM system_events WHERE type='ads_autopilot_reserved' AND created_at>=? AND instr(details_json,?)>0)<? "+(spacing?"AND NOT EXISTS(SELECT 1 FROM system_events WHERE type='ads_autopilot_reserved' AND created_at>? AND instr(details_json,?)>0)":"AND ?<>'' AND ?<>''"))
      .bind(uid(),JSON.stringify({quota:market==="IRAN"?"ADS_IRAN_DISCOVERY":"ADS_IRAQ_DISCOVERY",market,market_cap:marketCap,source:String(source).slice(0,40)}),new Date(nowMs).toISOString(),d.toISOString(),tag,marketCap,since,tag).run();
    return Number(r?.meta?.changes||0)===1;
  }
  const r=await env.DB.prepare("INSERT INTO system_events(id,type,severity,message,details_json,created_at) SELECT ?,'ads_autopilot_reserved','info','Ads Autopilot run reserved (daily budget)',?,? WHERE (SELECT COUNT(*) FROM system_events WHERE type='ads_autopilot_reserved' AND created_at>=?)<? "+(spacing?"AND NOT EXISTS(SELECT 1 FROM system_events WHERE type='ads_autopilot_reserved' AND created_at>?)":"AND ?<>''"))
    .bind(uid(),JSON.stringify({cap,source:String(source).slice(0,40)}),new Date(nowMs).toISOString(),d.toISOString(),cap,new Date(nowMs-55*60*1000).toISOString()).run();
  return Number(r?.meta?.changes||0)===1;
}
// CRM_FOLLOWUP quota (Phase 09.7): one reservation per follow-up drafting run (15-minute path, 07:00 sweep, owner button); at most
// crm_followups_per_day per UTC day and — unless spacing is off (07:00 sweep) — one per 55 minutes. Ads discovery rows never count here.
export async function crmFollowupCap(env){return autonomyBudgets(await budgetOverrides(env)).crm_followups_per_day;}
export async function adsDraftDailyCap(env){return autonomyBudgets(await budgetOverrides(env)).ads_drafts_per_day;}
export async function reserveCrmFollowupRun(env,nowMs=Date.now(),source="scheduled",{spacing=true}={}){
  const cap=autonomyBudgets(await budgetOverrides(env)).crm_followups_per_day,d=new Date(nowMs);d.setUTCHours(0,0,0,0);
  if(!Number.isInteger(cap)||cap<1)return false;
  const r=await env.DB.prepare("INSERT INTO system_events(id,type,severity,message,details_json,created_at) SELECT ?,'crm_followup_reserved','info','CRM follow-up run reserved (daily quota)',?,? WHERE (SELECT COUNT(*) FROM system_events WHERE type='crm_followup_reserved' AND created_at>=?)<? "+(spacing?"AND NOT EXISTS(SELECT 1 FROM system_events WHERE type='crm_followup_reserved' AND created_at>?)":"AND ?<>''"))
    .bind(uid(),JSON.stringify({quota:"CRM_FOLLOWUP",cap,source:String(source).slice(0,40)}),new Date(nowMs).toISOString(),d.toISOString(),cap,new Date(nowMs-55*60*1000).toISOString()).run();
  return Number(r?.meta?.changes||0)===1;
}
// Today's spend in cost units (global and per provider) against the budgets, plus Ads Autopilot runs (Agent Control Center).
export async function costSummary(env){
 const b=autonomyBudgets(await budgetOverrides(env)),day=utcDayStart();
 const rows=(await env.DB.prepare("SELECT module,action,COALESCE(SUM(attempts),0) n FROM autonomy_tasks WHERE started_at>=? GROUP BY module,action").bind(day).all()).results||[];
 const providers=Object.fromEntries(Object.keys(b.providers).map(p=>[p,{used:0,budget:b.providers[p]}]));let used=0;
 for(const r of rows){const k=`${r.module}:${r.action}`;if(!(k in AUTONOMY_UNIT_COST))continue;const u=Number(r.n)*AUTONOMY_UNIT_COST[k];used+=u;const p=AUTONOMY_PROVIDER[k];if(providers[p])providers[p].used+=u;}
 let adsRuns=0;const byMarket={IRAN:0,ARAB:0};try{const a=await env.DB.prepare("SELECT COUNT(*) n,SUM(instr(details_json,'\"market\":\"IRAN\"')>0) ir,SUM(instr(details_json,'\"market\":\"ARAB\"')>0) ar FROM system_events WHERE type='ads_autopilot_reserved' AND created_at>=?").bind(day).first();adsRuns=Number(a?.n||0);byMarket.IRAN=Number(a?.ir||0);byMarket.ARAB=Number(a?.ar||0);}catch{}
 let crmRuns=0;try{crmRuns=Number((await env.DB.prepare("SELECT COUNT(*) n FROM system_events WHERE type='crm_followup_reserved' AND created_at>=?").bind(day).first())?.n||0)}catch{}
 return {units:{used,budget:b.daily_units},providers,ads_autopilot:{runs_today:adsRuns,runs_per_day:b.ads_runs_per_day,by_market:byMarket},crm_followups:{runs_today:crmRuns,runs_per_day:b.crm_followups_per_day}};
}
// A claim refused while the row is still queued means the quota was taken by a concurrent run: defer it (no approval, no failure).
async function stillQueued(env,id){return (await env.DB.prepare("SELECT status FROM autonomy_tasks WHERE id=?").bind(id).first())?.status==="queued"}
async function deferForQuota(env,t,cap){ // cap = the daily quota; the same deferral covers a reached cost budget
 const r=await env.DB.prepare("UPDATE autonomy_tasks SET scheduled_at=?,error=?,updated_at=? WHERE id=? AND status='queued'").bind(nextUtcDay(),`Daily quota or cost budget reached (quota ${cap}/day); runs again after 00:00 UTC`,now(),t.id).run();
 if(Number(r.meta?.changes||0)===1)await event(env,"task_deferred_quota",t.module,`Daily quota reached: ${t.action}`,{task_id:t.id,quota:cap});
}
// Channel publishing health for the Agent Control Center (7 days, read-only): failed / manual-required distributions with redacted
// errors. Owner-approved content is published by the existing cron queue; nothing here publishes, retries or approves anything.
export async function publishingSummary(env,{nowMs=Date.now()}={}){
 const since=new Date(nowMs-7*86400000).toISOString();
 // Marketing-vault sender allow-list (group vaults): configured / missing / invalid and refused media in 7 days. IDs are never shown.
 const raw=String(env.TELEGRAM_VAULT_SENDER_IDS||"").trim(),ids=raw?raw.split(/[\s,]+/).filter(Boolean):[];
 const allowList=!ids.length?"missing":ids.every(x=>/^[1-9]\d{4,14}$/.test(x)&&x!=="777000"&&x!=="1087968824")?"configured":"invalid";
 let rejected=0;try{rejected=Number((await env.DB.prepare("SELECT COUNT(*) n FROM system_events WHERE type='vault_media_rejected' AND created_at>=?").bind(since).first())?.n||0);}catch{}
 const vault={sender_allow_list:allowList,senders:allowList==="configured"?ids.length:0,rejected_7d:rejected};
 try{
  const counts=(await env.DB.prepare("SELECT target,status,COUNT(*) n FROM content_distribution WHERE updated_at>=? GROUP BY target,status").bind(since).all()).results||[];
  const problems=((await env.DB.prepare("SELECT content_id,target,status,error,updated_at FROM content_distribution WHERE status IN ('failed','manual_required') AND updated_at>=? ORDER BY updated_at DESC LIMIT 10").bind(since).all()).results||[])
   .map(r=>({...r,error:safeErrorText(r.error||"",200)}));
  return {available:true,counts,problems,vault};
 }catch{return {available:false,vault};}
}
// Today's use of every paid action against its quota (Agent Control Center).
export async function autonomyQuotaSummary(env){
 const o=await quotaOverrides(env),out=[];
 for(const key of Object.keys(AUTONOMY_DAILY_QUOTAS)){const [m,a]=key.split(":");out.push({action:key,used_today:await quotaUsed(env,m,a),daily_quota:autonomyDailyQuota(m,a,o)});}
 return out;
}
const ORCHESTRATOR_EVENT_MAX=4000;
export async function runTasksOrchestrated(env,req,limit=20,{executor=executeTask,limits={},capabilityOf=autonomyActionCapability}={}){
 const c=await controls(env);if(c.master!=="on")return {ok:true,paused:true,executed:0,failed:0,blocked:0,orchestrator:true};
 // Open approval requests for actions that no longer need approval are closed (audited) and their tasks re-queued.
 await cancelObsoleteApprovals(env,{needsApproval:(m,a)=>capabilityOf(m,a)==="side_effect"}).catch(()=>null);
 await recoverStaleLocks(env);
 const qo=await quotaOverrides(env),budgets=autonomyBudgets(await budgetOverrides(env)),quotaInRun=new Map(),quotaRefused=new Map();
 const rows=await env.DB.prepare("SELECT t.*,c.plan_json AS parent_plan_json,c.raw_command AS parent_raw_command FROM autonomy_tasks t LEFT JOIN autonomy_commands c ON c.id=t.command_id WHERE t.status='queued' AND (t.scheduled_at IS NULL OR t.scheduled_at<=?) ORDER BY t.priority DESC,t.created_at ASC LIMIT ?").bind(now(),limit).all();
 let executed=0,failed=0,blocked=0,requeued=0;
 const tasks=[],lastByModule=new Map(),seen=new Map(),claims=new Map(),lockBusy=new Map(),approvedTasks=new Map(),blockedForApproval=[];
 const block=async(t,reason,meta={})=>{const r=await env.DB.prepare("UPDATE autonomy_tasks SET status='blocked',error=?,updated_at=? WHERE id=? AND status='queued'").bind(reason,now(),t.id).run();if(Number(r.meta?.changes||0)===1){blocked++;await event(env,"task_blocked",t.module,`Task blocked: ${t.action}`,{task_id:t.id,...meta});}};
 for(const t of rows.results||[]){
  if(!taskAllowedByParentPlan(t)){await block(t,"Blocked by parent plan policy");continue;}
  if(c.modules[t.module]===false||!(await actionEnabled(env,t.module,t.action))){await block(t,"Blocked by module/action control");continue;}
  // Deny by default: an action that can spend or act outside (or is unknown) waits for the owner instead of running.
  const capability=capabilityOf(t.module,t.action);
  let payload={};try{payload=JSON.parse(t.payload_json||"{}")}catch{}
  const key=autonomyTaskDedupKey(t.module,t.action,payload);
  if(capability==="side_effect"){
   // Only an owner-approved, unexpired approval for THIS task and payload lets it run (once); otherwise it waits in the approval
   // queue (when the Stage 2B tables exist) and stays blocked. Nothing is approved automatically.
   const ap=await approvalForTask(env,{taskId:t.id,dedupKey:key}).catch(()=>({available:false}));
   if(ap.available&&ap.approval?.status==="approved")approvedTasks.set(t.id,{approvalId:ap.approval.id,dedupKey:key});
   else{
    let reason="Requires owner approval (orchestrator policy): this action can spend or act externally";
    if(ap.available){const pending=ap.approval||await requestApproval(env,{taskId:t.id,module:t.module,action:t.action,dedupKey:key,capability}).catch(()=>null);
     if(pending)reason=`Waiting for owner approval in the agent approval queue (${pending.id})`;blockedForApproval.push({agent:`autonomy:${t.module}`,task_id:t.id});}
    await block(t,reason,{capability});continue;
   }
  }
  if(seen.has(key)){await block(t,`Duplicate of task ${seen.get(key)} in this run`);continue;}
  if(capability==="paid"){
   const qk=`${t.module}:${t.action}`,cap=autonomyDailyQuota(t.module,t.action,qo);
   if(!quotaInRun.has(qk))quotaInRun.set(qk,await quotaUsed(env,t.module,t.action));
   if(quotaInRun.get(qk)>=cap){await deferForQuota(env,t,cap);continue;}
   quotaInRun.set(qk,quotaInRun.get(qk)+1);
  }
  seen.set(key,t.id);
  // Same-module tasks run one after another (ordering only), so the module lock is never contended inside one run.
  const prev=lastByModule.get(t.module);lastByModule.set(t.module,t.id);
  tasks.push({id:t.id,agent:`autonomy:${t.module}`,version:AUTONOMY_ENGINE_VERSION,capability,after:prev?[prev]:[],cost:capability==="paid"?5:1,
   timeoutMs:AUTONOMY_TASK_TIMEOUT_MS[`${t.module}:${t.action}`],
   // only reads are retried: a retried draft or paid call could duplicate work or spend twice
   retryable:capability==="read",
   run:async ctx=>{
    if(!(await acquire(env,t.module,t.id))){lockBusy.set(t.id,ctx.attempt);const e=new Error("module lock busy");e.retryable=false;throw e;}
    try{
     // A real claim: only the run that moves the row (queued → running) executes it; the token marks rows THIS run owns.
     const token=claims.get(t.id)||now();
     const cap=capability==="paid"?autonomyDailyQuota(t.module,t.action,qo):null;
     const claimed=ctx.attempt===1
      ?await claimTask(env,t,token,cap,budgets)
      :Number((await env.DB.prepare("UPDATE autonomy_tasks SET attempts=attempts+1,updated_at=? WHERE id=? AND status='running' AND started_at=?").bind(now(),t.id,token).run()).meta?.changes||0)===1;
     if(!claimed){
      if(cap!=null&&ctx.attempt===1&&await stillQueued(env,t.id)){quotaRefused.set(t.id,cap);const e=new Error("daily quota reserved by a concurrent run");e.retryable=false;throw e;}
      const e=new Error("task already claimed by another run");e.retryable=false;e.notClaimed=true;throw e;
     }
     claims.set(t.id,token);
     // One-shot: the owner's approval is consumed atomically before the side effect starts; a used/expired one stops it here.
     const approval=approvedTasks.get(t.id);
     if(approval&&!(await consumeApproval(env,{approvalId:approval.approvalId,taskId:t.id,dedupKey:approval.dedupKey}))){const e=new Error("Owner approval is no longer valid (used or expired)");e.retryable=false;throw e;}
     return await executor(env,req,t,{signal:ctx.signal});
    }finally{await release(env,t.module,t.id)}
   }});
 }
 const {report,outputs}=await runAgentGraph(tasks,{...limits,allowCapabilities:["read","draft","paid"],approvedTaskIds:[...approvedTasks.keys()],runId:`autonomy-${uid()}`});
 for(const r of report.tasks){
  const t=(rows.results||[]).find(x=>x.id===r.id),token=claims.get(r.id);
  if(!token){if(quotaRefused.has(r.id))await deferForQuota(env,{id:r.id,module:t?.module,action:t?.action},quotaRefused.get(r.id));requeued++;continue;}   // never claimed by this run (lock busy, quota taken concurrently, not started, limits) — left queued (quota: deferred to the next UTC day)
  if(r.state==="succeeded"){
   const u=await env.DB.prepare("UPDATE autonomy_tasks SET status='completed',error=NULL,result_json=?,finished_at=?,updated_at=? WHERE id=? AND status='running' AND started_at=?").bind(JSON.stringify(outputs[r.id]??null).slice(0,50000),now(),now(),r.id,token).run();
   if(Number(u.meta?.changes||0)===1){executed++;await event(env,"task_completed",t?.module,`Completed: ${t?.action}`,{task_id:r.id});}
  }else{
   const msg=r.state==="timed_out"||lockBusy.get(r.id)>1?"Timed out — the underlying request may still finish; not retried":safeErrorText(r.error);
   const u=await env.DB.prepare("UPDATE autonomy_tasks SET status='failed',error=?,finished_at=?,updated_at=? WHERE id=? AND status='running' AND started_at=?").bind(msg,now(),now(),r.id,token).run();
   if(Number(u.meta?.changes||0)===1){failed++;await event(env,"task_failed",t?.module,`Failed: ${t?.action}`,{task_id:r.id,error:msg});}
  }
 }
 // Only work this run actually claimed can be a failure: a quota/budget refusal, a busy module lock or a task another run claimed
 // was never executed here, so it stays out of the dead-letter queue and its alerts (the row is left queued / deferred).
 report.dead_letters=report.dead_letters.filter(d=>claims.has(d.task_id));
 // One allow-listed, size-capped run summary in the existing events table (no task payloads, outputs or error text).
 const summary={run_id:report.run_id,orchestrator_version:report.orchestrator_version,duration_ms:report.duration_ms,counts:report.counts,budget:report.budget,
  alerts:report.alerts.map(a=>({level:a.level,code:a.code})),dead_letters:report.dead_letters.map(d=>({task_id:d.task_id,state:d.state,attempts:d.attempts})),
  executed,failed,blocked,requeued};
 let meta=JSON.stringify(summary);if(meta.length>ORCHESTRATOR_EVENT_MAX)meta=JSON.stringify({...summary,dead_letters:summary.dead_letters.slice(0,20),truncated:true}).slice(0,ORCHESTRATOR_EVENT_MAX);
 try{await env.DB.prepare("INSERT INTO autonomy_events VALUES(?,?,?,?,?,?)").bind(uid(),"orchestrator_run",null,`Orchestrated run: ${executed} completed, ${failed} failed, ${blocked} blocked, ${requeued} left queued`,meta,now()).run()}catch{}
 // Durable run report, dead letters, heartbeat and alert lifecycle (Stage 2B tables; skipped when they are not migrated).
 const stored=await recordRun(env,"autonomy",report,{executed,failed,blocked,requeued,blockedForApproval});
 return {ok:true,executed,failed,blocked,requeued,paused:false,orchestrator:true,run_id:report.run_id,stored:stored.stored};
}

// Owner actions and dashboard reads for the agent ops store (admin only: handleAutonomy authenticates before routing here).
// Decisions only change state: nothing is executed inline, nothing is approved automatically.
const OPS_ID=/^[A-Za-z0-9-]{8,64}$/,OPS_BODY_MAX=4096,NO_STORE={"Cache-Control":"no-store"};
async function handleAgentOps(env,req,u){
 const reply=(body,status=200)=>Response.json(body,{status,headers:NO_STORE});
 try{
  const p=u.pathname.slice("/api/autonomy/agents/".length);
  if(p==="overview"){if(req.method!=="GET")return reply({ok:false,error:"Method not allowed"},405);const ov=await opsOverview(env);
   // Phase 06 (additive): retry eligibility per dead letter + open-DLQ summary per agent; the existing fields are unchanged.
   if(Array.isArray(ov.dead_letters)){ov.dead_letters=ov.dead_letters.map(x=>({...x,eligibility:deadLetterEligibility({module:x.task_module,action:x.task_action,task_status:x.task_status,resolved_at:x.resolved_at})}));
    const by={};for(const x of ov.dead_letters)if(!x.resolved_at){const s=by[x.agent]||(by[x.agent]={open:0,auto_retry:0,owner_only:0});s.open++;x.eligibility.auto_retry?s.auto_retry++:s.owner_only++;}ov.dead_letter_summary=by;}
   return reply({ok:true,orchestrator_enabled:orchestratorEnabled(env),...ov,quotas:await autonomyQuotaSummary(env).catch(()=>[]),costs:await costSummary(env).catch(()=>null),quality:await qualitySummary(env).catch(()=>null),versions:await versionSummary(env).catch(()=>[]),rollback:await rollbackEligibility(env).catch(()=>[]),publishing:await publishingSummary(env)});}
  // Phase 05: per-agent activity for the Agent Control Center (read-only SELECTs; never runs, retries or approves anything).
  if(p==="activity"){if(req.method!=="GET")return reply({ok:false,error:"Method not allowed"},405);return reply(await agentActivitySummary(env,{modules:MODULES,actions:ACTIONS,controls:await controls(env),quotas:await autonomyQuotaSummary(env).catch(()=>null),versions:await versionSummary(env)}));}
  if(!["approvals/decide","alerts/ack","dead-letters/resolve"].includes(p))return reply({ok:false,error:"Not found"},404);
  if(req.method!=="POST")return reply({ok:false,error:"Method not allowed"},405);
  const raw=await req.text();if(raw.length>OPS_BODY_MAX)return reply({ok:false,error:"Request body too large"},413);
  let b;try{b=JSON.parse(raw||"{}")}catch{return reply({ok:false,error:"Invalid JSON"},400)}
  if(!b||typeof b!=="object"||Array.isArray(b))return reply({ok:false,error:"Invalid body"},400);
  const id=String(b.id??"");if(!OPS_ID.test(id))return reply({ok:false,error:"Invalid id"},400);
  const actor="owner-admin";let r,action;
  if(p==="approvals/decide"){
   action=String(b.decision||"");
   // With the orchestrator off the original sequential loop would run a re-queued side effect without the gate: refuse.
   if(!orchestratorEnabled(env))r={ok:false,status:409,error:"Approvals are accepted only while the orchestrator is enabled"};
   else r=await decideApproval(env,{id,decision:action,actor});
  }else if(p==="alerts/ack"){action="acknowledge";r=await acknowledgeAlert(env,{id,actor});}
  else{action=String(b.resolution||"");r=await resolveDeadLetter(env,{id,resolution:action,actor});}
  // Successful transitions are audited inside their own batch; refused and no-op attempts are recorded here (best effort).
  if(!r.ok||r.idempotent)await event(env,"agent_ops_action",null,`Owner ${p} ${action}: ${r.ok?(r.idempotent?"no change":"done"):"refused"}`,{target:id,route:p,action:action.slice(0,20),ok:!!r.ok,idempotent:!!r.idempotent,error:r.ok?null:redact(r.error,200),orchestrator_enabled:orchestratorEnabled(env)});
  return reply(r.ok?{ok:true,idempotent:!!r.idempotent,approval:r.approval||undefined}:{ok:false,error:r.error},r.ok?200:(r.status||400));
 }catch(error){return reply({ok:false,error:"Agent ops request failed"},500);}
}

export async function runTasks(env,req,limit=20){
 if(orchestratorEnabled(env))return await runTasksOrchestrated(env,req,limit);
 const c=await controls(env);if(c.master!=="on")return {ok:true,paused:true,executed:0,failed:0,blocked:0};
 await recoverStaleLocks(env);
  const rows=await env.DB.prepare("SELECT t.*,c.plan_json AS parent_plan_json,c.raw_command AS parent_raw_command FROM autonomy_tasks t LEFT JOIN autonomy_commands c ON c.id=t.command_id WHERE t.status='queued' AND (t.scheduled_at IS NULL OR t.scheduled_at<=?) ORDER BY t.priority DESC,t.created_at ASC LIMIT ?").bind(now(),limit).all();
 let executed=0,failed=0,blocked=0;
 for(const t of rows.results||[]){
  if(!taskAllowedByParentPlan(t)){
   await env.DB.prepare("UPDATE autonomy_tasks SET status='blocked',error=?,updated_at=? WHERE id=? AND status='queued'").bind("Blocked by parent plan policy",now(),t.id).run();
   blocked++;await event(env,"task_blocked",t.module,`Task blocked by parent plan: ${t.action}`,{task_id:t.id});continue;
  }
  if(c.modules[t.module]===false||!(await actionEnabled(env,t.module,t.action))){
   await env.DB.prepare("UPDATE autonomy_tasks SET status='blocked',error=?,updated_at=? WHERE id=?").bind("Blocked by module/action control",now(),t.id).run();blocked++;await event(env,"task_blocked",t.module,`Task blocked: ${t.action}`);continue;
  }
  // Same daily quota for paid actions on this path (spending stays within budget whatever the orchestrator flag says).
  const cap=autonomyActionCapability(t.module,t.action)==="paid"?autonomyDailyQuota(t.module,t.action,await quotaOverrides(env)):null;
  if(cap!=null&&(await quotaUsed(env,t.module,t.action))>=cap){await deferForQuota(env,t,cap);continue;}
  if(!(await acquire(env,t.module,t.id)))continue;
  // The claim is the atomic quota reservation; a refused claim never executes (another run took the row or the last quota unit).
  if(!(await claimTask(env,t,now(),cap,cap==null?null:autonomyBudgets(await budgetOverrides(env))))){await release(env,t.module,t.id);if(cap!=null&&await stillQueued(env,t.id))await deferForQuota(env,t,cap);continue;}
  try{
   const result=await executeTask(env,req,t);
   await env.DB.prepare("UPDATE autonomy_tasks SET status='completed',error=NULL,result_json=?,finished_at=?,updated_at=? WHERE id=? AND status='running'").bind(JSON.stringify(result).slice(0,50000),now(),now(),t.id).run();
   executed++;await event(env,"task_completed",t.module,`Completed: ${t.action}`,{task_id:t.id});
  }catch(e){
   failed++;await env.DB.prepare("UPDATE autonomy_tasks SET status='failed',error=?,finished_at=?,updated_at=? WHERE id=?").bind(safeErrorText(e,2000),now(),now(),t.id).run();
   await event(env,"task_failed",t.module,`Failed: ${t.action}`,{task_id:t.id,error:safeErrorText(e)});
  }finally{await release(env,t.module,t.id)}
 }
 return {ok:true,executed,failed,blocked,paused:false};
}
// Bounded failed-auth throttle for the agent admin routes ONLY (/api/autonomy/agents/*); every other route — and customer traffic —
// is untouched. Per isolate, per CF-Connecting-IP (requests without it are not throttled rather than sharing one bucket): 10 wrong
// tokens in 5 minutes block that IP for the rest of the window (429 + Retry-After, the token is not even checked); a correct token
// clears the counter. The map holds at most 1000 IPs and evicts the oldest. A legitimate owner on the same IP as the attacker waits
// at most 5 minutes; other IPs are never affected. Nothing is written to D1.
const AGENT_AUTH={windowMs:5*60*1000,max:10,keys:1000,fails:new Map()};
function agentAuthWait(ip,nowMs){
 const e=AGENT_AUTH.fails.get(ip);if(!e)return 0;
 if(nowMs-e.start>=AGENT_AUTH.windowMs){AGENT_AUTH.fails.delete(ip);return 0;}
 return e.count>=AGENT_AUTH.max?Math.max(1,Math.ceil((e.start+AGENT_AUTH.windowMs-nowMs)/1000)):0;
}
function agentAuthFailed(ip,nowMs){
 let e=AGENT_AUTH.fails.get(ip);
 if(!e||nowMs-e.start>=AGENT_AUTH.windowMs){
  AGENT_AUTH.fails.delete(ip);
  while(AGENT_AUTH.fails.size>=AGENT_AUTH.keys)AGENT_AUTH.fails.delete(AGENT_AUTH.fails.keys().next().value);
  e={start:nowMs,count:0};AGENT_AUTH.fails.set(ip,e);
 }
 e.count++;
}
export async function handleAutonomy(env,req){
 if(!["GET","POST"].includes(req.method))return new Response("Method not allowed",{status:405});
 const agentRoute=new URL(req.url).pathname.startsWith("/api/autonomy/agents/"),clientIp=agentRoute?req.headers.get("CF-Connecting-IP"):null;
 if(clientIp){const wait=agentAuthWait(clientIp,Date.now());if(wait)return Response.json({ok:false,error:"Too many failed attempts; try again later"},{status:429,headers:{"Retry-After":String(wait),"Cache-Control":"no-store"}});}
 if(!env.ADMIN_TOKEN||!bearerMatches(req.headers.get("Authorization"),env.ADMIN_TOKEN)){if(clientIp)agentAuthFailed(clientIp,Date.now());return Response.json({ok:false,error:"Unauthorized"},{status:401});}
 if(clientIp)AGENT_AUTH.fails.delete(clientIp);
 const u=new URL(req.url);await ensure(env);
 if(u.pathname.startsWith("/api/autonomy/agents/"))return await handleAgentOps(env,req,u);
 if(u.pathname==="/api/autonomy/status"){
   const c=await controls(env),counts=await env.DB.prepare("SELECT status,COUNT(*) n FROM autonomy_tasks GROUP BY status").all(),tasks={};
  for(const x of counts.results||[])tasks[x.status]=Number(x.n||0);
  const locks=await env.DB.prepare("SELECT module,task_id,locked_at FROM autonomy_locks").all();
  return Response.json({ok:true,controls:c,tasks,revenue:await revenue(env),active_locks:locks.results||[],fresh_at:now(),architecture:{global_master_gate:true,independent_module_queues:true,independent_module_locks:true,action_gates:true}});
 }
 if(u.pathname==="/api/autonomy/master"&&req.method==="POST"){
  const b=await req.json().catch(()=>({})),a=["on","pause","stop","emergency_stop"].includes(b.action)?b.action:"on";
  await setKV(env,"master",a==="on"?"on":a==="pause"?"paused":"off");await event(env,"master_changed",null,`Master changed to ${a}`);
  return Response.json({ok:true,master:a==="on"?"on":a==="pause"?"paused":"off",action:a});
 }
 if(u.pathname==="/api/autonomy/ad-autopilot-cleanup"&&req.method==="POST"){
  const b=await req.json().catch(()=>({}));
  const mode=String(b.mode||"preview");

  const rows=await env.DB.prepare(
   "SELECT id,name,contact,stage,priority,notes,created_at,updated_at FROM leads WHERE stage NOT IN ('customer','converted','rejected','archived') AND notes LIKE '%\"source\":\"ad_autopilot\"%' ORDER BY updated_at DESC"
  ).all();

  const candidates=[];

  for(const x of rows.results||[]){
   let m=null;
   try{m=JSON.parse(x.notes||"{}")}catch{}

   if(m?.source!=="ad_autopilot")continue;

   candidates.push({
    id:x.id,
    name:x.name,
    contact:x.contact,
    stage:x.stage,
    priority:x.priority,
    source:m.source,
    type:m.type||null,
    city:m.city||null,
    url:m.url||null,
    created_at:x.created_at,
    updated_at:x.updated_at
   });
  }

  if(mode==="preview"){
   return Response.json({
    ok:true,
    mode:"preview",
    count:candidates.length,
    items:candidates.slice(0,200)
   });
  }

  if(mode!=="delete"){
 return Response.json({
  ok:false,
  error:"mode must be preview or delete"
 },{status:400});
}

if(b.confirm!=="DELETE_AD_AUTOPILOT"){
 return Response.json({
  ok:false,
  error:"Explicit confirmation required",
  required:"DELETE_AD_AUTOPILOT",
  count:candidates.length
 },{status:400});
}

const ids=Array.isArray(b.ids)
 ?b.ids.map(x=>String(x||"").trim()).filter(Boolean)
 :[];

const deleteAll=b.all===true;

if(!deleteAll&&!ids.length){
 return Response.json({
  ok:false,
  error:"No records selected"
 },{status:400});
}

const target=deleteAll
 ?candidates
 :candidates.filter(x=>ids.includes(String(x.id)));

let deleted=0;

for(const x of target){
 const r=await env.DB.prepare(
  "DELETE FROM leads WHERE id=? AND stage NOT IN ('customer','converted','rejected','archived')"
 ).bind(x.id).run();

 deleted+=Number(r.meta?.changes||0);
}

await event(
 env,
 "ad_autopilot_cleanup",
 "ads",
 "Deleted Ads Autopilot opportunity records",
 {
  requested:target.length,
  deleted,
  mode:deleteAll?"all":"selected"
 }
);

return Response.json({
 ok:true,
 mode:deleteAll?"all":"selected",
 requested:target.length,
 deleted
});
 }
  if(u.pathname==="/api/autonomy/module"&&req.method==="POST"){
  const b=await req.json().catch(()=>({})),m=String(b.module||"");if(!MODULES.includes(m))return Response.json({ok:false,error:"Unknown module"},{status:400});
  const c=await controls(env);c.modules[m]=!!b.enabled;await setKV(env,"modules",JSON.stringify(c.modules));await event(env,"module_changed",m,`${m} ${b.enabled?"enabled":"disabled"}`);
  return Response.json({ok:true,module:m,enabled:c.modules[m]});
 }
 if(u.pathname==="/api/autonomy/action"&&req.method==="POST"){
  const b=await req.json().catch(()=>({})),m=String(b.module||""),a=String(b.action||"");if(!MODULES.includes(m)||!ACTIONS[m]?.includes(a))return Response.json({ok:false,error:"Unknown module/action"},{status:400});
  const enabled=b.enabled!==false;await env.DB.prepare("INSERT OR REPLACE INTO autonomy_action_controls(module,action,enabled,updated_at) VALUES(?,?,?,?)").bind(m,a,enabled?1:0,now()).run();await event(env,"action_changed",m,`${a} ${enabled?"enabled":"disabled"}`);return Response.json({ok:true,module:m,action:a,enabled});
 }
 if(u.pathname==="/api/autonomy/command"&&req.method==="POST"){
  const b=await req.json().catch(()=>({})),raw=String(b.command||"").trim();if(!raw)return Response.json({ok:false,error:"command is required"},{status:400});
  const plan=await aiPlan(env,raw),cid=uid(),t=now();
  await env.DB.prepare("INSERT INTO autonomy_commands VALUES(?,?,?,?,?,?)").bind(cid,raw,JSON.stringify(plan),"queued",t,t).run();
  for(const x of plan.tasks||[])await env.DB.prepare("INSERT INTO autonomy_tasks(id,command_id,module,action,status,priority,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(uid(),cid,x.module,x.action,"queued",Number(x.priority||50),JSON.stringify(x.payload||{}),t,t).run();
  await event(env,"command_planned",null,`Command planned: ${raw}`,{command_id:cid,source:plan.source,task_count:(plan.tasks||[]).length});
  return Response.json({ok:true,command_id:cid,plan,status:"queued"});
 }
 if(u.pathname==="/api/autonomy/tasks")return Response.json({ok:true,items:(await env.DB.prepare("SELECT * FROM autonomy_tasks ORDER BY created_at DESC LIMIT 100").all()).results||[]});
 if(u.pathname==="/api/autonomy/tasks/run"&&req.method==="POST")return Response.json(await runTasks(env,req,20));
 if(u.pathname==="/api/autonomy/brain"){
  const c=await controls(env),events=await env.DB.prepare("SELECT * FROM autonomy_events ORDER BY created_at DESC LIMIT 30").all(),tasks=await env.DB.prepare("SELECT module,action,status,priority,error,updated_at FROM autonomy_tasks ORDER BY updated_at DESC LIMIT 30").all();
  return Response.json({ok:true,brain:{mission:"Operate independently until MASTER OFF; observe, plan, execute allowed work, verify results and learn.",controls:c,revenue:await revenue(env),active_tasks:tasks.results||[],timeline:events.results||[]}});
 }
 if(u.pathname==="/api/autonomy/opportunities"){
 const r=await env.DB.prepare("SELECT id,name,contact,stage,priority,notes,updated_at FROM leads WHERE stage NOT IN ('customer','converted','rejected','archived') AND (notes LIKE '%\"source\":\"ad_autopilot\"%'OR notes LIKE '%\"source\":\"customer_discovery\"%' OR notes LIKE '%\"source\":\"instagram_hashtag_discovery\"%' OR notes LIKE '%\"ad_opportunity\":true%' OR notes LIKE '%\"contact_url\":\"http%') ORDER BY updated_at DESC LIMIT 200").all();
 const spam=/porn|porno|xxx|sex|adult|camgirl|escort|casino|betting|قمار|شرط‌بندی|مراهنات|إباحية|جنس|مواعدة/i;
 const market=/طلا|جواهر|زرگر|گالری|مجوهرات|ذهب|صياغ|صائغ|ساعت|ساعات|watch|بدلیجات|بدلی|زیورآلات|اکسسوری|اكسسوارات|حلي|accessor/i;
 const items=(r.results||[]).filter(x=>{
  let m={};try{m=JSON.parse(x.notes||"{}")}catch{}
  const text=[x.name,x.contact,m.type,m.evidence,m.url].filter(Boolean).join(" ");
  return !spam.test(text)&&market.test(text);
 }).slice(0,50);
 return Response.json({ok:true,items});
}
 if(u.pathname==="/api/autonomy/revenue")return Response.json(await revenue(env));
 if(u.pathname==="/api/autonomy/errors"){
  const r=await env.DB.prepare("SELECT * FROM retry_queue ORDER BY updated_at DESC LIMIT 50").all(),t=await env.DB.prepare("SELECT * FROM autonomy_tasks WHERE status='failed' ORDER BY updated_at DESC LIMIT 50").all();return Response.json({ok:true,retries:r.results||[],tasks:t.results||[]});
 }
 if(u.pathname==="/api/autonomy/metrics"){
  const r=await env.DB.prepare("SELECT status,COUNT(*) n FROM autonomy_tasks GROUP BY status").all(),x=Object.fromEntries((r.results||[]).map(v=>[v.status,Number(v.n||0)])),total=(x.completed||0)+(x.failed||0)+(x.blocked||0),rate=total?Math.round((x.completed||0)/total*100):0;
  return Response.json({ok:true,total,completed:x.completed||0,failed:x.failed||0,blocked:x.blocked||0,autonomous_rate:rate,target:98,definition:"completed / completed+failed+blocked"});
 }
 return Response.json({ok:false,error:"Not found"},{status:404});
}
export async function runAutonomyScheduled(env,req){
 try{
  if(!(await autonomyMasterGate(env)))
   return {ok:true,paused:true,executed:0,planned:0,reason:"MASTER_OFF"};

  await ensure(env);

  const c=await controls(env);

  const queued=await env.DB
   .prepare("SELECT COUNT(*) n FROM autonomy_tasks WHERE status='queued' AND (scheduled_at IS NULL OR scheduled_at<=?)")
   .bind(now())
   .first();

  let planned=0;

  if(Number(queued?.n||0)===0){

   const cid=uid();
   const t=now();

   const plan={
    goal:"Run a safe scheduled autonomy check using only enabled modules",
    mode:"execute",
    source:"scheduled",
    tasks:[]
   };

   const add=(module,action,priority)=>{
    plan.tasks.push({
     module,
     action,
     payload:{},
     priority
    });
   };

   if(
    c.modules.revenue!==false &&
    await actionEnabled(env,"revenue","funnel_snapshot")
   ){
    add("revenue","funnel_snapshot",90);
   }
if(
  c.modules.photo!==false &&
  await actionEnabled(env,"photo","photo_generate")
){
  const today=new Date().toISOString().slice(0,10);

  const usedToday=await env.DB.prepare(
    "SELECT id FROM photo_autopilot_usage WHERE substr(used_at,1,10)=? LIMIT 1"
  ).bind(today).first();

  // No new photo task while one is still waiting (e.g. deferred by its quota) or today's quota is already used.
  const photoWaiting=await env.DB.prepare("SELECT id FROM autonomy_tasks WHERE module='photo' AND action='photo_generate' AND status='queued' LIMIT 1").first();
  if(!usedToday&&!photoWaiting&&(await quotaUsed(env,"photo","photo_generate"))<autonomyDailyQuota("photo","photo_generate",await quotaOverrides(env))){
    add("photo","photo_generate",85);
  }
}
   for(const m of MODULES){

    if(m==="revenue" || c.modules[m]===false)
     continue;

    if(await actionEnabled(env,m,"status"))
     add(m,"status",40);
   }

   if(plan.tasks.length){

    await env.DB
     .prepare("INSERT INTO autonomy_commands VALUES(?,?,?,?,?,?)")
     .bind(
      cid,
      "Scheduled autonomy cycle",
      JSON.stringify(plan),
      "queued",
      t,
      t
     )
     .run();

    for(const x of plan.tasks){

     await env.DB
      .prepare("INSERT INTO autonomy_tasks(id,command_id,module,action,status,priority,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .bind(
       uid(),
       cid,
       x.module,
       x.action,
       "queued",
       x.priority,
       "{}",
       t,
       t
      )
      .run();
    }

    await event(
     env,
     "command_planned",
     null,
     "Scheduled autonomy cycle",
     {
      command_id:cid,
      source:"scheduled",
      task_count:plan.tasks.length
     }
    );

    planned=plan.tasks.length;
   }
  }

  const result=await runTasks(env,req,20);

  return {
   ...result,
   planned
  };

 }catch(e){
  return {
   ok:false,
   error:safeErrorText(e)
  };
 }
}
