// Phase 05 — per-agent activity for the Agent Control Center (READ-ONLY: SELECTs only, never writes, runs, retries or approves).
// A successful `status` task proves only that the scheduler reached the agent (liveness). Real activity is a completed non-status
// task or a work event the Worker already records (Ads/Content/Learning/Video autopilots, inbound messages). Missing data → UNKNOWN.
import { autonomyActionCapability, redact, AUTONOMY_UNIT_COST, AUTONOMY_PROVIDER } from "./agent-orchestrator.js";
import { WATCHDOG, EXPECTED_ACTIVITY, rowidFloor } from "./agent-watchdog.js";
import { ADS_MARKET_IDS, ADS_MARKETS, adsMarketKey, adsMarketConfig, adsMarketReadiness, normalizeAdsMarket } from "./ads-markets.js";

export const ACTIVITY_WINDOW_MS=48*3600*1000;
const SIGNAL_WINDOW_MS=60*86400000;
const CHANNELS={telegram:"telegram",whatsapp:"whatsapp",instagram:"instagram"};
// Work events per agent. ok = real work done; block = the latest outcome stops the agent until something changes.
const SIGNALS={
  ads:{ok:["ad_autopilot_run"],info:["ads_run_deferred"]},
  content:{ok:["auto_content_generated","content_generated"],info:["auto_pilot_cycle"]},
  media:{ok:["media_ai_video_generated","weekly_video_autopilot_kling_accepted","weekly_video_autopilot_shotstack_accepted"],
    block:["weekly_video_autopilot_kling_rejected","weekly_video_autopilot_shotstack_rejected","weekly_video_autopilot_failed","weekly_video_autopilot_reservation_conflict","weekly_video_autopilot_ineligible","weekly_video_autopilot_poll_error","weekly_video_autopilot_kling_submission_ambiguous","weekly_video_autopilot_shotstack_submission_ambiguous","media_ai_video_failed"]},
  photo:{ok:["photo_autopilot_completed"],fail:["photo_autopilot_error"]},
  learning:{ok:["analyze_optimize_cycle"]},
  crm:{ok:["customer_lead_discovery","telegram_inbound_lead_created","lead_order_candidate_created","lead_converted_to_customer"]},
  telegram:{ok:["inbound_outcome"]}
};
// Phase 06: how often real work is expected. Scheduler-planned work comes from the Watchdog's EXPECTED_ACTIVITY; the external
// autopilots are expected only while they are on / have been running (otherwise their silence is idle by design).
const EXTERNAL_EXPECTED_MS={ads:6*3600*1000,content:24*3600*1000,learning:24*3600*1000,media:8*86400000};
export const QUALITY_MIN_SAMPLES=3;
const ALL_TYPES=[...new Set(Object.values(SIGNALS).flatMap(s=>[...(s.ok||[]),...(s.info||[]),...(s.block||[]),...(s.fail||[])]))];
const ms=v=>{const t=Date.parse(String(v||""));return Number.isFinite(t)?t:null};
const later=(a,b)=>(ms(a)||0)>=(ms(b)||0)?a:b;
const json=v=>{try{return JSON.parse(v||"{}")||{}}catch{return {}}};

// Pure classification (unit-tested). Returns the activity status, the separate liveness ("health") and the reasons for both.
export function classifyAgent(a,nowMs=Date.now()){
  const reasons=[];
  const lastRun=ms(a.last_run_at),real=ms(a.last_real_at);
  let health="UNKNOWN";
  if(lastRun!=null){
    if(a.latest_task_status==="failed")health="FAILING";
    else if(nowMs-lastRun>WATCHDOG.heartbeatStaleMs)health="STALE";
    else health="HEALTHY";
  }
  if((a.alerts_open||[]).some(x=>x.level==="critical"))health="FAILING";
  if(a.master&&a.master!=="on")reasons.push(`Master is ${a.master}`);
  if(a.module_enabled===false)reasons.push("Module disabled in controls");
  for(const x of a.actions_disabled||[])reasons.push(`Action ${x} disabled`);
  for(const x of a.blocked_reasons||[])reasons.push(x);
  if(Number(a.dead_letters_open||0)>0)reasons.push(`${a.dead_letters_open} unresolved dead-letter task(s)`);
  for(const x of a.alerts_open||[])if(x.level==="critical")reasons.push(`Critical alert: ${x.code}`);
  let status;
  if(a.connected===false)status="NOT_CONNECTED";
  else if(reasons.length)status="BLOCKED";
  else if(real!=null&&nowMs-real<=ACTIVITY_WINDOW_MS)status="ACTIVE";
  else if(lastRun!=null)status="IDLE";
  else status="UNKNOWN";
  if(status!=="IDLE")return {status,health,reasons};
  // Phase 06: why it is idle. INFRASTRUCTURE = the scheduler is not reaching it; UNEXPECTED = expected work is overdue; else by design.
  const exp=Number(a.expected_every_ms||0);
  const idle_kind=health==="STALE"||health==="FAILING"?"INFRASTRUCTURE":exp>0&&(real==null||nowMs-real>exp)?"UNEXPECTED":"BY_DESIGN";
  return {status,health,reasons,idle_kind};
}
// Phase 07 — multidimensional health model (pure, unit-tested). Four separate answers, never inferred from one another:
//  technical  HEALTHY | DEGRADED | FAILED | UNKNOWN          does the scheduler reach it and do its tasks succeed?
//  connection CONNECTED | NOT_CONNECTED | PAUSED | UNKNOWN | NOT_APPLICABLE (internal agents have no external channel)
//  activity   ACTIVE | IDLE | BLOCKED | UNKNOWN              real work (never a successful status check alone)
//  execution  SUCCESS | FAILED | RUNNING | NOT_SCHEDULED | UNKNOWN   the latest task / queue state
// A disconnected or owner-paused channel is never a technical failure; agent_inactive is operational, not technical.
export function healthModel(a,c,nowMs=Date.now()){
  const lastRun=ms(a.last_run_at),alerts=a.alerts_open||[];
  let technical="UNKNOWN";
  if(lastRun!=null){
    if(a.latest_task_status==="failed"||alerts.some(x=>x.level==="critical"))technical="FAILED";
    else if(nowMs-lastRun>WATCHDOG.heartbeatStaleMs||Number(a.dead_letters_open||0)>0||alerts.some(x=>x.level==="warning"&&x.code!=="agent_inactive"))technical="DEGRADED";
    else technical="HEALTHY";
  }
  const paused=(a.master&&a.master!=="on")||a.module_enabled===false;
  const connection=!a.channel?"NOT_APPLICABLE":paused?"PAUSED":a.connected===true?"CONNECTED":a.connected===false?"NOT_CONNECTED":"UNKNOWN";
  const activity=c.status==="NOT_CONNECTED"?"IDLE":c.status;
  const q=a.queue;
  const execution=!a.tasks_available?"UNKNOWN":q&&(q.running>0||q.queued>0)?"RUNNING":a.latest_task_status==="completed"?"SUCCESS":a.latest_task_status==="failed"||a.latest_task_status==="blocked"?"FAILED":a.latest_task_status?"UNKNOWN":"NOT_SCHEDULED";
  const codes=[];
  if(a.master&&a.master!=="on")codes.push("MASTER_OFF");
  if(a.module_enabled===false)codes.push("MODULE_DISABLED");
  if((a.actions_disabled||[]).length)codes.push("ACTION_DISABLED");
  for(const x of a.blocked_codes||[])codes.push(x);
  if(Number(a.dead_letters_open||0)>0)codes.push("DLQ_OPEN");
  if(alerts.some(x=>x.level==="critical"))codes.push("CRITICAL_ALERT");
  if(lastRun!=null&&nowMs-lastRun>WATCHDOG.heartbeatStaleMs)codes.push("SCHEDULER_STALE");
  if(a.latest_task_status==="failed")codes.push("LAST_TASK_FAILED");
  if(connection==="NOT_CONNECTED")codes.push("CHANNEL_NOT_CONNECTED");
  if(c.idle_kind==="UNEXPECTED")codes.push("EXPECTED_WORK_OVERDUE");
  if(Number(a.pending_review||0)>0)codes.push("OWNER_REVIEW_PENDING");
  // first matching code decides the recommended next action (UI translates the code; nothing is executed from here)
  const order=["MASTER_OFF","MODULE_DISABLED","ACTION_DISABLED","CRITICAL_ALERT","SCHEDULER_STALE","ADS_CITY_EMPTY","ADS_MARKET_INCOMPLETE","MEDIA_PROVIDER_BLOCKED","DLQ_OPEN","LAST_TASK_FAILED","OWNER_REVIEW_PENDING","CHANNEL_NOT_CONNECTED","EXPECTED_WORK_OVERDUE"];
  const next_action=order.find(x=>codes.includes(x))||(technical==="UNKNOWN"&&activity==="UNKNOWN"?"NO_DATA":"NONE");
  return {technical,connection,activity,execution,reason_codes:codes,next_action};
}
// Deterministic success rate from recorded task outcomes (no AI). Fewer than QUALITY_MIN_SAMPLES finished tasks → null, never a guess.
export function outcomeRate(rows){
  const c=rows.filter(r=>r.status==="completed").reduce((s,r)=>s+Number(r.n7||0),0),bad=rows.filter(r=>r.status==="failed"||r.status==="blocked").reduce((s,r)=>s+Number(r.n7||0),0);
  return {samples:c+bad,success_pct:c+bad>=QUALITY_MIN_SAMPLES?Math.round(c*1000/(c+bad))/10:null,missing:c+bad===0?"NO_FINISHED_TASKS":c+bad<QUALITY_MIN_SAMPLES?"BELOW_MIN_SAMPLES":null};
}

// Bounded read: a handful of grouped SELECTs over existing tables; every query is optional (failure → that field is null/UNKNOWN).
export async function agentActivitySummary(env,{modules,actions,controls,quotas=null,versions=null,nowMs=Date.now()}){
  const q=async(sql,...b)=>{try{return (await env.DB.prepare(sql).bind(...b).all()).results||[]}catch{return null}};
  const since7=new Date(nowMs-7*86400000).toISOString(),sinceSig=new Date(nowMs-SIGNAL_WINDOW_MS).toISOString();
  // Phase 07: read only the last 60 days of tasks/events (rowid floor; no index or migration needed). Cost stays flat as tables grow.
  // Phase 08: a failed floor lookup makes that source UNKNOWN instead of falling back to a full-table scan from rowid 0.
  const floor=async t=>{try{const f=await rowidFloor(env,t,sinceSig,{nowMs});return f.floor??0}catch{return null}};
  const [taskFloor,eventFloor]=await Promise.all([floor("autonomy_tasks"),floor("system_events")]);
  const [taskRows,failRows,locks,inbox,events,alerts,dead,actionOff,kv]=await Promise.all([
    taskFloor==null?null:q("SELECT module,action,status,COUNT(*) n,SUM(created_at>=?) n7,MAX(COALESCE(finished_at,updated_at)) last FROM autonomy_tasks WHERE rowid>=? GROUP BY module,action,status LIMIT 500",since7,taskFloor),
    taskFloor==null?null:q("SELECT module,MAX(updated_at) at,substr(error,1,300) error FROM autonomy_tasks WHERE rowid>=? AND status='failed' GROUP BY module LIMIT 50",taskFloor),
    q("SELECT module,locked_at FROM autonomy_locks LIMIT 50"),
    q("SELECT platform,COUNT(*) n,MAX(created_at) last FROM inbox_messages GROUP BY platform LIMIT 20"),
    eventFloor==null?null:q(`SELECT type,COUNT(*) n,MAX(created_at) last,substr(details_json,1,800) d FROM system_events WHERE rowid>=? AND created_at>=? AND type IN (${ALL_TYPES.map(()=>"?").join(",")}) GROUP BY type LIMIT 60`,eventFloor,sinceSig,...ALL_TYPES),
    q("SELECT agent,level,code,last_seen_at,occurrences,recovery_state,fallback_status FROM agent_alerts WHERE acknowledged_at IS NULL LIMIT 100"),
    q("SELECT agent,COUNT(*) n FROM agent_dead_letters WHERE resolved_at IS NULL GROUP BY agent LIMIT 50"),
    q("SELECT module,action FROM autonomy_action_controls WHERE enabled=0 LIMIT 100"),
    q("SELECT key,value FROM system_kv WHERE key IN ('ads_autopilot_config','auto_pilot_config','ads_market:IRAN','ads_market:ARAB') LIMIT 5")
  ]);
  const ev=Object.fromEntries((events||[]).map(e=>[e.type,e]));
  const kvMap=Object.fromEntries((kv||[]).map(r=>[r.key,json(r.value)]));
  const agents=modules.map(m=>{
    const rows=(taskRows||[]).filter(r=>r.module===m);
    const latest=rows.reduce((x,r)=>!x||(ms(r.last)||0)>(ms(x.last)||0)?r:x,null);
    const statusRows=rows.filter(r=>r.action==="status"),realRows=rows.filter(r=>r.action!=="status"&&r.status==="completed");
    const count=(st,key)=>rows.filter(r=>r.status===st).reduce((s,r)=>s+Number(r[key]||0),0);
    let lastReal=null;
    for(const r of realRows)if(!lastReal||(ms(r.last)||0)>(ms(lastReal.at)||0))lastReal={source:`task ${r.action}`,at:r.last};
    const sig=SIGNALS[m]||{},detail={};
    for(const t of sig.ok||[]){const e=ev[t];if(e&&(!lastReal||(ms(e.last)||0)>(ms(lastReal.at)||0)))lastReal={source:`event ${t}`,at:e.last};}
    const blocked=[],blockedCodes=[];
    if(m==="ads"){
      const run=ev.ad_autopilot_run,d=json(run?.d);
      if(run)Object.assign(detail,{last_run_found:Number(d.found||0),last_run_drafted:Number(d.drafted||0),last_run_errors:Number(d.errors||0),last_run_market:normalizeAdsMarket(d.market)});
      if(ev.ads_run_deferred)detail.last_deferred_at=ev.ads_run_deferred.last;
      // Phase 09.4: two independent markets (a missing row = disabled). The legacy single-market row no longer runs anything.
      const markets={};
      for(const mk of ADS_MARKET_IDS){
        const c=adsMarketConfig(mk,kvMap[adsMarketKey(mk)]),r=adsMarketReadiness(c),label=mk==="ARAB"?"IRAQ (ARAB)":mk;
        markets[mk]={enabled:c.enabled,city:c.city||null,runs_per_day:c.runs_per_day,ready:r.ready,codes:r.codes,language:ADS_MARKETS[mk].language,currency:ADS_MARKETS[mk].currency};
        if(c.enabled&&!c.city){blocked.push("Ads target city is empty for "+label);if(!blockedCodes.includes("ADS_CITY_EMPTY"))blockedCodes.push("ADS_CITY_EMPTY");}
        else if(c.enabled&&!r.ready){blocked.push("Ads market "+label+" is enabled but incomplete ("+r.codes.join(", ")+")");if(!blockedCodes.includes("ADS_MARKET_INCOMPLETE"))blockedCodes.push("ADS_MARKET_INCOMPLETE");}
      }
      detail.markets=markets;detail.autopilot=Object.values(markets).some(x=>x.enabled)?"on":"off";
      detail.target_city=Object.values(markets).find(x=>x.enabled&&x.city)?.city||null;
      const legacy=kvMap.ads_autopilot_config;detail.legacy_config=legacy?{enabled:!!legacy.enabled,city:String(legacy.city||"").trim()||null,active:false}:null;
    }
    if(m==="content"){const c=ev.auto_pilot_cycle,d=json(c?.d);if(c){detail.pending_review=d.pending_review??null;detail.last_cycle_hold=d.hold_reason||null;detail.last_cycle_at=c.last;}
      const cfg=kvMap.auto_pilot_config;detail.autopilot=cfg?(cfg.enabled?"on":"off"):"UNKNOWN";}
    if(m==="media"){
      const okAt=(sig.ok||[]).map(t=>ev[t]?.last).reduce(later,null);
      const blk=(sig.block||[]).map(t=>ev[t]&&{t,...ev[t]}).filter(Boolean).reduce((x,e)=>!x||(ms(e.last)||0)>(ms(x.last)||0)?e:x,null);
      if(blk&&(ms(blk.last)||0)>(ms(okAt)||0)){const d=json(blk.d);blocked.push(redact(`${blk.t}${d.reason?`: ${d.reason}`:""}${d.error?`: ${d.error}`:""}`,240));blockedCodes.push("MEDIA_PROVIDER_BLOCKED");detail.blocked_since=blk.last;}
    }
    if(m==="photo"&&ev.photo_autopilot_error)detail.last_error_event_at=ev.photo_autopilot_error.last;
    let connected=null,inboundDetail=null;
    if(CHANNELS[m]&&inbox){const r=inbox.find(x=>x.platform===CHANNELS[m]);connected=r?true:false;inboundDetail={messages:Number(r?.n||0),last_at:r?.last||null};
      if(r&&(!lastReal||(ms(r.last)||0)>(ms(lastReal.at)||0)))lastReal={source:"inbound message",at:r.last};}
    const fail=(failRows||[]).find(r=>r.module===m);
    const lock=(locks||[]).find(r=>r.module===m);
    const alertsOpen=(alerts||[]).filter(a=>a.agent===`autonomy:${m}`||a.agent===m).map(a=>({level:a.level,code:a.code,last_seen_at:a.last_seen_at}));
    const deadOpen=(dead||[]).filter(d=>d.agent===`autonomy:${m}`||d.agent===m).reduce((s,d)=>s+Number(d.n||0),0);
    const off=(actionOff||[]).filter(r=>r.module===m).map(r=>r.action);
    let expected=null;
    for(const [k,e] of Object.entries(EXPECTED_ACTIVITY))if(k.startsWith(m+":")&&!off.includes(k.slice(m.length+1)))expected=e.everyMs;
    if(EXTERNAL_EXPECTED_MS[m]&&(m==="ads"||m==="content"?detail.autopilot==="on":(sig.ok||[]).concat(sig.block||[]).some(t=>ev[t])))expected=EXTERNAL_EXPECTED_MS[m];
    const vs=(versions||[]).filter(v=>v.agent===`autonomy:${m}`||v.agent===m),act=vs.find(v=>v.status==="active"),prev=vs.find(v=>v.status==="previous");
    const paid=(actions?.[m]||[]).filter(a=>AUTONOMY_UNIT_COST[`${m}:${a}`]!=null).map(a=>{const qq=(quotas||[]).find(x=>x.action===`${m}:${a}`);return {action:a,unit_cost:AUTONOMY_UNIT_COST[`${m}:${a}`],provider:AUTONOMY_PROVIDER[`${m}:${a}`]||null,used_today:qq?qq.used_today:null,daily_quota:qq?qq.daily_quota:null}});
    const base={
      agent:m,
      master:controls?.master??null,module_enabled:controls?.modules?.[m]!==false,actions_disabled:off,
      last_run_at:latest?.last||null,latest_task_action:latest?.action||null,latest_task_status:latest?.status||null,
      last_status_check_at:statusRows.reduce((x,r)=>later(x,r.last),null),
      last_success_at:rows.filter(r=>r.status==="completed").reduce((x,r)=>later(x,r.last),null),
      last_real_at:lastReal?.at||null,last_real_source:lastReal?.source||null,
      counts_7d:taskRows?{completed:count("completed","n7"),failed:count("failed","n7"),blocked:count("blocked","n7")}:null,
      counts_all:taskRows?{completed:count("completed","n"),failed:count("failed","n")}:null,   // within the 60-day history window
      queue:taskRows?{queued:count("queued","n"),running:count("running","n"),locked_since:lock?.locked_at||null}:null,
      last_failure:fail?{at:fail.at,error:redact(fail.error||"",200)}:null,
      alerts_open:alerts?alertsOpen:null,dead_letters_open:dead?deadOpen:null,
      connected,channel:!!CHANNELS[m],inbound:inboundDetail,detail,blocked_reasons:blocked,blocked_codes:blockedCodes,tasks_available:!!taskRows,pending_review:m==="content"?detail.pending_review??null:null,
      approvals:(actions?.[m]||[]).map(a=>({action:a,capability:autonomyActionCapability(m,a)})),
      expected_every_ms:expected,
      quality_7d:taskRows?{real:outcomeRate(rows.filter(r=>r.action!=="status")),status_checks:outcomeRate(statusRows),min_samples:QUALITY_MIN_SAMPLES}:null,
      cost:{paid_actions:paid,billing:"NOT AVAILABLE (units are internal budget units, not invoices)"},
      version:versions?{active:act?.version||null,activated_at:act?.activated_at||null,previous:prev?.version||null,rollback_ready:!!prev,rollback:prev?"Rollback reference recorded; rollback is an owner-approved Worker deploy":"No previous version recorded"}:null
    };
    const cls=classifyAgent(base,nowMs);
    return {...base,...cls,...healthModel(base,cls,nowMs)};
  });
  const missing=[["autonomy_tasks",taskRows],["system_events",events],["inbox_messages",inbox],["agent_alerts",alerts],["agent_dead_letters",dead],["system_kv",kv]].filter(([,v])=>v===null).map(([k])=>k);
  // Phase 07: freshness = age of the newest recorded agent run (UNKNOWN when there is none); never inferred from the request time.
  const newest=agents.reduce((x,a)=>later(x,a.last_run_at),null),age=ms(newest)!=null?Math.max(0,Math.round((nowMs-ms(newest))/60000)):null;
  const freshness={newest_run_at:newest,age_minutes:age,state:age==null?"UNKNOWN":age*60000>WATCHDOG.heartbeatStaleMs?"STALE":"FRESH"};
  return {ok:true,generated_at:new Date(nowMs).toISOString(),activity_window_hours:ACTIVITY_WINDOW_MS/3600000,stale_after_minutes:WATCHDOG.heartbeatStaleMs/60000,history_window_days:SIGNAL_WINDOW_MS/86400000,freshness,unavailable_sources:missing,agents};
}
