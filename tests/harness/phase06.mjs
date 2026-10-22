// PHASE 06 — AGENT OPERATIONS & RELIABILITY: Watchdog unexpected-inactivity (infrastructure vs idle by design), alert retention,
// dead-letter retry eligibility, version/rollback readiness, deterministic per-agent quality and quota/cost exposure.
// Local only (node:sqlite stand-in for D1); nothing reaches Production, Telegram or a paid API.
import fs from "node:fs";import path from "node:path";import vm from "node:vm";import {fileURLToPath,pathToFileURL} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,J,done}=reporter("phase06");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const SRC=process.env.SRC||path.join(REPO,"worker/src");
const imp=f=>import(pathToFileURL(path.join(SRC,f)).href);
const {runWatchdog,deadLetterEligibility,EXPECTED_ACTIVITY}=await imp("agent-watchdog.js");
const {classifyAgent,outcomeRate}=await imp("agent-activity.js");
const W=await makeWorld();const {q,dbrun,call}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
await call("/api/autonomy/status",null,"GET");   // the Worker's own ensure() creates the autonomy tables
const NOW=Date.now(),ago=m=>new Date(NOW-m*60000).toISOString();let n=0;
const task=(m,a,st,at,err=null)=>dbrun("INSERT INTO autonomy_tasks(id,command_id,module,action,status,priority,payload_json,error,attempts,finished_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",["T"+(++n),"c",m,a,st,40,"{}",err,1,st==="queued"?null:at,at,at]);
const reset=()=>{for(const t of ["autonomy_tasks","agent_alerts","agent_heartbeat","agent_dead_letters","agent_versions","autonomy_action_controls"])dbrun(`DELETE FROM ${t}`);dbrun("DELETE FROM autonomy_controls WHERE key='modules'");};
const hb=min=>dbrun("INSERT OR REPLACE INTO agent_heartbeat(scheduler,last_run_id,last_finished_at,healthy) VALUES('autonomy','r',?,1)",[ago(min)]);
const wd=()=>runWatchdog(W.env,{nowMs:NOW,orchestratorOn:true});
const inactive=()=>q("SELECT agent,level,recovery_state FROM agent_alerts WHERE code='agent_inactive' ORDER BY agent");
// baseline: window covers 31 h, every agent has fresh status checks, photo completed 1 h ago, revenue last completed 3 h ago
const base=()=>{reset();hb(5);task("telegram","status","completed",ago(31*60+5));for(const k of [5,20,35])task("website","status","completed",ago(k));task("photo","photo_generate","completed",ago(60));task("revenue","funnel_snapshot","completed",ago(180));};

// ================= BLOCK 1 — Watchdog: unexpected inactivity =================
base();let r=await wd();
ok("W1 scheduled work overdue while the scheduler is healthy → one agent_inactive warning for revenue (photo is fine)",J(inactive())===J([{agent:"autonomy:revenue",level:"warning",recovery_state:"open"}])&&r.alerts.includes("agent_inactive"),[r,inactive()]);
await wd();
ok("W2 a repeated detection is de-duplicated (one open row, occurrences 2)",q("SELECT COUNT(*) n,MAX(occurrences) o FROM agent_alerts WHERE code='agent_inactive'")[0].o===2&&q("SELECT COUNT(*) n FROM agent_alerts WHERE code='agent_inactive'")[0].n===1);
task("revenue","funnel_snapshot","completed",ago(1));await wd();
ok("W3 when the work completes again the alert is recovered by the existing lifecycle",J(inactive())===J([{agent:"autonomy:revenue",level:"warning",recovery_state:"recovered"}]),inactive());
base();dbrun("UPDATE agent_heartbeat SET last_finished_at=? WHERE scheduler='autonomy'",[ago(40)]);r=await wd();
ok("W4 stale heartbeat = infrastructure: heartbeat_missed only, no agent_inactive (not raised twice)",r.alerts.includes("heartbeat_missed")&&!r.alerts.includes("agent_inactive"),r);
base();dbrun("INSERT OR REPLACE INTO autonomy_controls(key,value,updated_at) VALUES('modules',?,?)",[JSON.stringify({revenue:false}),ago(1)]);r=await wd();
ok("W5 a module disabled by the owner is idle on purpose → no agent_inactive",!r.alerts.includes("agent_inactive"),r);
base();dbrun("INSERT INTO autonomy_action_controls(module,action,enabled,updated_at) VALUES('revenue','funnel_snapshot',0,?)",[ago(1)]);r=await wd();
ok("W6 an action disabled by the owner → no agent_inactive",!r.alerts.includes("agent_inactive"),r);
reset();hb(5);task("website","status","completed",ago(30));r=await wd();
ok("W7 the bounded task window does not cover the period → no conclusion, no alert",!r.alerts.includes("agent_inactive"),r);
base();dbrun("DELETE FROM autonomy_tasks WHERE module='photo'");task("revenue","funnel_snapshot","completed",ago(2));r=await wd();
ok("W8 photo with no completion in 30 h → info-level agent_inactive (never critical)",J(inactive())===J([{agent:"autonomy:photo",level:"info",recovery_state:"open"}]),inactive());
base();dbrun("DELETE FROM autonomy_tasks WHERE module='photo'");task("revenue","funnel_snapshot","completed",ago(2));task("photo","photo_generate","queued",ago(600));r=await wd();
ok("W9 a photo task waiting in the queue (deferred by its quota) is not inactivity",!r.alerts.includes("agent_inactive"),r);
ok("W10 expectations cover only scheduler-planned work (revenue, photo)",J(Object.keys(EXPECTED_ACTIVITY).sort())===J(["photo:photo_generate","revenue:funnel_snapshot"]));
base();r=await wd();
ok("W11 the Watchdog never re-runs or queues work for an inactive agent (no new queued task, no command)",q("SELECT COUNT(*) n FROM autonomy_tasks WHERE status='queued'")[0].n===0&&q("SELECT COUNT(*) n FROM autonomy_commands")[0].n===0);

// ================= BLOCK 2 — dead-letter retry eligibility =================
const e=deadLetterEligibility;
ok("D1 read task failed → automatic Watchdog retry allowed",e({module:"crm",action:"lead_intelligence",task_status:"failed"}).auto_retry===true&&e({module:"crm",action:"lead_intelligence",task_status:"failed"}).capability==="read");
const pd=e({module:"photo",action:"photo_generate",task_status:"failed"}),dr=e({module:"telegram",action:"inbox_reply",task_status:"failed"}),sx=e({module:"x",action:"pay",task_status:"failed"});
ok("D2 paid, draft (customer-facing reply) and unknown/financial actions are never retried automatically; owner re-queue only",!pd.auto_retry&&pd.owner_requeue&&/quota/.test(pd.note)&&!dr.auto_retry&&dr.capability==="draft"&&/approval/.test(dr.note)&&!sx.auto_retry&&sx.capability==="side_effect"&&/approval/.test(sx.note),[pd,dr,sx]);
ok("D3 resolved letters, or tasks no longer failed/missing, are not re-queueable",!e({module:"crm",action:"lead_intelligence",task_status:"failed",resolved_at:ago(1)}).owner_requeue&&!e({module:"photo",action:"photo_generate",task_status:"completed"}).owner_requeue&&e({}).note==="task not found");
reset();task("photo","photo_generate","failed",ago(90),"boom");task("crm","lead_intelligence","completed",ago(80));
const dl=(id,tid,agent,resolved=null)=>dbrun("INSERT INTO agent_dead_letters(id,run_id,task_id,agent,state,attempts,error_redacted,created_at,resolved_at,resolution) VALUES(?,?,?,?,?,?,?,?,?,?)",[id,"r",tid,agent,"failed",1,"boom",ago(90),resolved,resolved?"dismissed":null]);
dl("DL-00000001","T"+(n-1),"autonomy:photo");dl("DL-00000002","T"+n,"autonomy:crm");dl("DL-00000003","T"+(n-1),"autonomy:photo",ago(5));
dbrun("INSERT INTO agent_alerts(id,scheduler,code,agent,level,cause_redacted,recovery_state,first_seen_at,last_seen_at,acknowledged_at) VALUES(?,?,?,?,?,?,?,?,?,?)",["AL-old-open","watchdog","agent_failing","autonomy:photo","warning","x","open",ago(20*1440),ago(10*1440),ago(9*1440)]);
dbrun("INSERT INTO agent_alerts(id,scheduler,code,agent,level,cause_redacted,recovery_state,first_seen_at,last_seen_at,acknowledged_at) VALUES(?,?,?,?,?,?,?,?,?,?)",["AL-old-done","watchdog","task_stuck","autonomy:ads","warning","x","recovered",ago(20*1440),ago(10*1440),ago(9*1440)]);
const ov=(await call("/api/autonomy/agents/overview",null,"GET")).body||{};
const byId=Object.fromEntries((ov.dead_letters||[]).map(x=>[x.id,x]));
ok("D4 overview: each dead letter carries the task's module/action and eligibility; existing fields unchanged",byId["DL-00000001"]?.task_action==="photo_generate"&&byId["DL-00000001"].eligibility.owner_requeue===true&&byId["DL-00000001"].eligibility.auto_retry===false&&byId["DL-00000002"]?.eligibility.owner_requeue===false&&byId["DL-00000001"].error_redacted==="boom"&&"heartbeat" in ov&&"quotas" in ov,ov.dead_letters);
ok("D5 open-DLQ summary per agent (resolved letters excluded)",J(ov.dead_letter_summary)===J({"autonomy:photo":{open:1,auto_retry:0,owner_only:1},"autonomy:crm":{open:1,auto_retry:0,owner_only:1}}),ov.dead_letter_summary);
ok("A1 an acknowledged but unrecovered alert older than 7 days stays listed; an acknowledged+recovered one ages out",(ov.alerts||[]).some(a=>a.id==="AL-old-open")&&!(ov.alerts||[]).some(a=>a.id==="AL-old-done"),(ov.alerts||[]).map(a=>a.id));

// ================= BLOCK 3 — per-agent quality, cost, version, idle kind =================
ok("Q1 outcome rate is deterministic and null below the minimum sample (never a fabricated score)",J(outcomeRate([{status:"completed",n7:3},{status:"failed",n7:1}]))===J({samples:4,success_pct:75,missing:null})&&J(outcomeRate([{status:"completed",n7:2}]))===J({samples:2,success_pct:null,missing:"BELOW_MIN_SAMPLES"})&&outcomeRate([]).success_pct===null&&outcomeRate([]).missing==="NO_FINISHED_TASKS");
const live={master:"on",module_enabled:true,last_run_at:ago(5),latest_task_status:"completed"};
ok("Q2 idle kind: overdue expected work → UNEXPECTED; no expectation → BY_DESIGN; scheduler not reaching it → INFRASTRUCTURE",classifyAgent({...live,last_real_at:ago(3*1440),expected_every_ms:2*3600e3},NOW).idle_kind==="UNEXPECTED"&&classifyAgent({...live,last_real_at:ago(3*1440)},NOW).idle_kind==="BY_DESIGN"&&classifyAgent({...live,last_run_at:ago(50)},NOW).idle_kind==="INFRASTRUCTURE"&&classifyAgent({...live,last_real_at:ago(10)},NOW).idle_kind===undefined);
ok("Q3 a weekly agent idle for 3 days is still BY_DESIGN (expected every 8 days)",classifyAgent({...live,last_real_at:ago(3*1440),expected_every_ms:8*86400e3},NOW).idle_kind==="BY_DESIGN");
reset();hb(5);for(const k of [5,20,35,50])task("revenue","funnel_snapshot","completed",ago(k));task("revenue","funnel_snapshot","failed",ago(65),"x");
task("website","status","completed",ago(5));task("website","growth_scan","completed",ago(5*1440));task("photo","photo_generate","completed",ago(60));
dbrun("INSERT INTO agent_versions(agent,version,status,activated_at) VALUES(?,?,?,?),(?,?,?,?),(?,?,?,?)",["autonomy:photo","v2","active",ago(100),"autonomy:photo","v1","previous",ago(5000),"autonomy:revenue","v2","active",ago(100)]);
const A=(await call("/api/autonomy/agents/activity",null,"GET")).body||{},by=Object.fromEntries((A.agents||[]).map(a=>[a.agent,a]));
ok("Q4 revenue real-work success 80% over 5 finished tasks; website has too few samples → null",by.revenue?.quality_7d.real.success_pct===80&&by.revenue.quality_7d.real.samples===5&&by.website?.quality_7d.real.success_pct===null&&by.website.quality_7d.status_checks.samples===1,[by.revenue?.quality_7d,by.website?.quality_7d]);
const pc=by.photo?.cost.paid_actions[0];
ok("Q5 paid actions expose unit cost, provider and today's quota use from the existing quota store; billing NOT AVAILABLE",pc?.action==="photo_generate"&&pc.unit_cost===8&&pc.provider==="openai"&&Number.isInteger(pc.used_today)&&pc.daily_quota>=1&&/NOT AVAILABLE/.test(by.photo.cost.billing)&&by.website.cost.paid_actions.length===0,by.photo?.cost);
ok("Q6 version: photo has a rollback reference (ready); revenue has none (not ready); never executed",by.photo?.version.rollback_ready===true&&by.photo.version.previous==="v1"&&by.revenue?.version.rollback_ready===false&&by.revenue.version.active==="v2"&&/No previous/.test(by.revenue.version.rollback),[by.photo?.version,by.revenue?.version]);
ok("Q7 website idle 5 days with no scheduled expectation → IDLE · BY_DESIGN",by.website?.status==="IDLE"&&by.website.idle_kind==="BY_DESIGN"&&by.website.expected_every_ms===null,by.website);

// ================= BLOCK 4 — dashboard =================
const html=await (await W.run(new Request("https://w.test/dashboard/agents"))).text(),script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join("\n");
let parses=true;try{new vm.Script(script)}catch{parses=false}
ok("U1 /dashboard/agents still renders and its script parses",parses&&html.includes("agentCenterGrid")&&html.includes("agentOpsDead"));
{const src=script.slice(script.indexOf("function acVersionsHtml("),script.indexOf("// Watchdog alerts: one row per agent+code"));const ctx={};vm.createContext(ctx);
 vm.runInContext('function esc(x){return String(x??"").replace(/[&<>"\']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",\'"\':"&quot;","\'":"&#39;"}[m]))}'+src+";this.f=acVersionsHtml;",ctx);
 const h=ctx.f([{agent:"autonomy:photo",version:"v2",status:"active"},{agent:"autonomy:photo",version:"v1",status:"previous"},{agent:"autonomy:ads",version:"v2",status:"active"}],[{code:"version_unhealthy",agent:"autonomy:ads",recovery_state:"open"}]);
 ok("U2 versions view: rollback readiness per agent, unhealthy version flagged, informational only (no rollback control)",/آماده Rollback: 1/.test(h)&&/نسخه ناسالم: 1/.test(h)&&/مرجع v1/.test(h)&&!/<button/.test(h)&&/اطلاعات نسخه ثبت نشده/.test(ctx.f([],[])),h);}
const poll=(script.match(/const DASHBOARD_POLL_GROUPS=\[[\s\S]*?\n\];/)||[""])[0];
ok("U3 no new polling: overview/activity are still not in the 15 s poll groups",poll.length>0&&!/loadAgentCenter|loadAgentOps|agents\/(activity|overview)/.test(poll));
done();
