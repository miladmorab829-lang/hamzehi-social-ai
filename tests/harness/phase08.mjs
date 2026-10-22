// PHASE 08 — RELEASE READINESS: Watchdog monitoring coverage (per-expectation coverage, SQL aggregation, visible coverage gaps),
// fail-closed activity reads, API compatibility of the Phase 05–07 endpoints, and release-safety checks (auth, test token isolation).
// Local only (node:sqlite stand-in for D1); nothing reaches Production, Telegram or a paid API.
import fs from "node:fs";import path from "node:path";import {fileURLToPath,pathToFileURL} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,J,done}=reporter("phase08");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const SRC=process.env.SRC||path.join(REPO,"worker/src");
const imp=f=>import(pathToFileURL(path.join(SRC,f)).href);
const {agentActivitySummary}=await imp("agent-activity.js");
const {clearRowidFloorCache,runWatchdog,RANGE_MAX_ROWS}=await imp("agent-watchdog.js");
const W=await makeWorld();const {q,dbrun,call}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
await call("/api/autonomy/status",null,"GET");
const NOW=Date.now(),ago=m=>new Date(NOW-m*60000).toISOString();let n=0;
const task=(m,a,st,at,fin=at)=>dbrun("INSERT INTO autonomy_tasks(id,command_id,module,action,status,priority,payload_json,attempts,finished_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",["T"+(++n),"c",m,a,st,40,"{}",1,st==="queued"?null:fin,at,at]);
const hb=m=>dbrun("INSERT OR REPLACE INTO agent_heartbeat(scheduler,last_run_id,last_finished_at,healthy) VALUES('autonomy','r',?,1)",[ago(m)]);
const reset=()=>{W.d1.db.exec("DELETE FROM autonomy_tasks;DELETE FROM agent_alerts;DELETE FROM agent_heartbeat");clearRowidFloorCache();};
const wd=(env=W.env)=>{clearRowidFloorCache();return runWatchdog(env,{nowMs:NOW,orchestratorOn:true});};
const alerts=code=>q("SELECT agent,level,recovery_state,cause_redacted c FROM agent_alerts WHERE code=? ORDER BY agent",[code]);

// ================= BLOCK 1 — Watchdog monitoring coverage =================
reset();hb(5);let r=await wd();
ok("C1 no task history → coverage NO_HISTORY, no agent_inactive and no coverage-gap alert (new install is not a failure)",r.inactivity_coverage.state==="NO_HISTORY"&&!r.alerts.includes("agent_inactive")&&!r.alerts.includes("monitoring_coverage_gap"),r);
reset();hb(5);task("revenue","funnel_snapshot","completed",ago(180));r=await wd();
ok("C2 3 h of history: revenue (2 h window) is checked and flagged, photo (30 h window) is skipped as history_shorter_than_window → PARTIAL",
 r.inactivity_coverage.state==="PARTIAL"&&J(r.inactivity_coverage.checked)===J(["revenue:funnel_snapshot"])&&r.inactivity_coverage.skipped.some(s=>s.key==="photo:photo_generate"&&s.reason==="history_shorter_than_window")&&J(alerts("agent_inactive").map(a=>a.agent))===J(["autonomy:revenue"]),r);
// ordering: the row inserted last (highest rowid) finished EARLIER; the newest completion must still win
reset();hb(5);task("website","status","completed",ago(40*60));task("photo","photo_generate","completed",ago(60));task("revenue","funnel_snapshot","completed",ago(150),ago(150));task("revenue","funnel_snapshot","completed",ago(140),ago(400));r=await wd();
ok("C3 'last completion' is MAX(finished time), not row order: alert names the 150-min completion, not the later-inserted 400-min one (date part is redacted by the alert store)",(alerts("agent_inactive")[0]?.c||"").includes(ago(150).slice(10))&&!(alerts("agent_inactive")[0]?.c||"").includes(ago(400).slice(10)),alerts("agent_inactive"));
reset();hb(5);task("website","status","completed",ago(40*60));task("revenue","funnel_snapshot","completed",ago(30));task("revenue","funnel_snapshot","completed",ago(20),ago(300));task("photo","photo_generate","queued",ago(10));r=await wd();
ok("C4 a recent completion inserted before an older-finishing row → no false agent_inactive; queued photo is not inactivity; COVERED",!r.alerts.includes("agent_inactive")&&r.inactivity_coverage.state==="COVERED"&&r.inactivity_coverage.checked.length===2,r);
// window larger than the bounded-read limit → visible info alert instead of silence; nothing marked failed
{const ins=W.d1.db.prepare("INSERT INTO autonomy_tasks(id,command_id,module,action,status,priority,payload_json,attempts,finished_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)");
 W.d1.db.exec("BEGIN");for(let i=0;i<=RANGE_MAX_ROWS;i++){const at=new Date(NOW-29*3600000+i*1000).toISOString();ins.run("BULK"+i,"c","website","status","completed",40,"{}",1,at,at,at);}W.d1.db.exec("COMMIT");}
r=await wd();
ok("C5 more than RANGE_MAX_ROWS rows in the window → WINDOW_TOO_LARGE + one info monitoring_coverage_gap (agent 'watchdog'), no agent_inactive, heartbeat healthy",
 r.inactivity_coverage.state==="WINDOW_TOO_LARGE"&&J(alerts("monitoring_coverage_gap").map(a=>[a.agent,a.level,a.recovery_state]))===J([["watchdog","info","open"]])&&!r.alerts.includes("agent_inactive")&&r.healthy===true,r.inactivity_coverage);
r=await wd();
ok("C6 a repeated coverage gap is de-duplicated (one row, occurrences 2)",q("SELECT COUNT(*) n,MAX(occurrences) o FROM agent_alerts WHERE code='monitoring_coverage_gap'")[0].o===2&&q("SELECT COUNT(*) n FROM agent_alerts WHERE code='monitoring_coverage_gap'")[0].n===1);
dbrun("DELETE FROM autonomy_tasks WHERE id LIKE 'BULK%'");r=await wd();
ok("C7 when coverage returns the gap alert is recovered by the existing lifecycle",r.inactivity_coverage.state==="COVERED"&&alerts("monitoring_coverage_gap")[0]?.recovery_state==="recovered",alerts("monitoring_coverage_gap"));
// a failing range read → ERROR + gap alert; the other Watchdog checks still run
const real=W.env.DB.prepare.bind(W.env.DB);
const brokenEnv={...W.env,DB:{...W.env.DB,prepare:s=>{if(/MIN\(rowid\)/.test(s)&&/autonomy_tasks/.test(s))throw new Error("D1_ERROR: simulated");return real(s)},batch:(...a)=>W.env.DB.batch(...a)}};
dbrun("DELETE FROM agent_alerts");task("crm","lead_intelligence","running",ago(60));dbrun("UPDATE autonomy_tasks SET started_at=? WHERE id=?",[ago(60),"T"+n]);
r=await wd(brokenEnv);
ok("C8 a failing range read → coverage ERROR + monitoring_coverage_gap; stuck-task check still runs (failure isolation)",r.ok&&r.inactivity_coverage.state==="ERROR"&&r.alerts.includes("monitoring_coverage_gap")&&r.alerts.includes("task_stuck"),r);
r=await runWatchdog(W.env,{nowMs:NOW,orchestratorOn:false});
ok("C9 orchestrator off → coverage NOT_RUN (reported, not silently skipped); stale heartbeat → NOT_RUN heartbeat_stale",r.inactivity_coverage.state==="NOT_RUN"&&await (async()=>{hb(90);const x=await wd();return x.inactivity_coverage.reason==="heartbeat_stale"})(),r.inactivity_coverage);

// ================= BLOCK 2 — activity endpoint: fail closed + API compatibility =================
let rowidReads=0;
const brokenEnv2={...W.env,DB:{...W.env.DB,prepare:s=>{if(/MIN\(rowid\)/.test(s))throw new Error("simulated");if(/WHERE rowid>=\?/.test(s)&&!/LIMIT 1$/.test(s))rowidReads++;return real(s)}}};
const AX=await agentActivitySummary(brokenEnv2,{modules:["revenue","photo"],actions:{},controls:{master:"on",modules:{}},nowMs:NOW});
ok("A1 rowid floor lookup fails → tasks/events become UNKNOWN (unavailable_sources), no fallback full-table scan from rowid 0",rowidReads===0&&AX.unavailable_sources.includes("autonomy_tasks")&&AX.unavailable_sources.includes("system_events")&&AX.agents.every(a=>a.tasks_available===false),{rowidReads,u:AX.unavailable_sources});
hb(5);const A=(await call("/api/autonomy/agents/activity",null,"GET"));
const TOP=["ok","generated_at","activity_window_hours","stale_after_minutes","history_window_days","freshness","unavailable_sources","agents"];
const PER=["agent","status","health","reasons","technical","connection","activity","execution","reason_codes","next_action","last_run_at","last_real_at","counts_7d","queue","alerts_open","dead_letters_open","version","quality_7d","cost"];
ok("A2 activity API keeps the Phase 05–07 contract: 200, all top-level keys, 11 agents with every per-agent field",A.status===200&&TOP.every(k=>k in A.body)&&A.body.agents.length===11&&A.body.agents.every(a=>PER.every(k=>k in a)),TOP.filter(k=>!(k in (A.body||{}))));
const O=await call("/api/autonomy/agents/overview",null,"GET");
ok("A3 overview API keeps its fields (alerts, dead_letters, quotas, versions, quality) and the additive dead_letter_summary",O.status===200&&["ok","orchestrator_enabled","alerts","dead_letters","quotas","versions","quality"].every(k=>k in O.body)&&"dead_letter_summary" in O.body,Object.keys(O.body||{}));
ok("A4 a Watchdog-level coverage alert never lands on an agent card (agent 'watchdog' is not one of the 11 runtime agents)",A.body.agents.every(a=>!(a.alerts_open||[]).some(x=>x.code==="monitoring_coverage_gap")));

// ================= BLOCK 3 — release safety =================
const raw=(p,h={},method="GET")=>W.run(new Request("https://w.test"+p,{method,headers:h}));
ok("S1 privileged agent endpoints: no token → 401, wrong token → 401, POST to the read-only activity route → 405",
 (await raw("/api/autonomy/agents/activity")).status===401&&(await raw("/api/autonomy/agents/overview",{Authorization:"Bearer wrong"})).status===401&&(await raw("/api/autonomy/agents/activity",{Authorization:"Bearer tok"},"POST")).status===405);
const saved=W.env.ADMIN_TOKEN;W.env.ADMIN_TOKEN="fixture-admin-value-not-a-secret-91827";
const tokRes=(await raw("/api/autonomy/agents/activity",{Authorization:"Bearer tok"})).status;
const html=await (await raw("/dashboard/agents")).text();
W.env.ADMIN_TOKEN=undefined;const noTok=(await raw("/api/autonomy/agents/activity",{Authorization:"Bearer tok"})).status;W.env.ADMIN_TOKEN=saved;
ok("S2 the preview token 'tok' is not a bypass: with another ADMIN_TOKEN it gets 401, and with no ADMIN_TOKEN configured every call is 401",tokRes===401&&noTok===401,{tokRes,noTok});
ok("S3 the dashboard HTML never embeds the admin token value",!html.includes("fixture-admin-value-not-a-secret-91827")&&html.length>1000);
const srcFiles=fs.readdirSync(SRC).filter(f=>f.endsWith(".js"));
const srcHits=srcFiles.filter(f=>{const s=fs.readFileSync(path.join(SRC,f),"utf8");return /["'`]Bearer tok["'`]|ADMIN_TOKEN\s*[:=]\s*["'`]tok["'`]|tests\/harness|preview-server|DEMO DATA/.test(s)});
ok("S4 no Worker source references the test token, the harness or the DEMO preview",srcHits.length===0,srcHits);
const toml=fs.readFileSync(path.join(REPO,"worker/wrangler.toml"),"utf8");
ok("S5 wrangler.toml: Worker 'hamzehi-social-ai', the verified D1 id, no ADMIN_TOKEN/secret in [vars] (secrets stay Worker secrets)",/^name = "hamzehi-social-ai"/m.test(toml)&&toml.includes("40b272c5-e368-4c33-8a41-7c63db98d7e8")&&!/^\s*(ADMIN_TOKEN|TELEGRAM_BOT_TOKEN|ANTHROPIC_API_KEY|OPENAI_API_KEY)\s*=/m.test(toml));
const prev=fs.readFileSync(path.join(REPO,"tests/harness/preview-server.mjs"),"utf8");
ok("S6 the local preview binds to 127.0.0.1 only, refuses outbound requests and labels every page DEMO",/\.listen\(PORT,"127\.0\.0\.1"/.test(prev)&&/blocked in local preview/.test(prev)&&/x-data-source/.test(prev)&&/DEMO DATA/.test(prev));
const gate=J(q("SELECT (SELECT COUNT(*) FROM approval_queue) a,(SELECT COUNT(*) FROM agent_approvals WHERE status='approved') b,(SELECT COUNT(*) FROM autonomy_tasks WHERE status='queued' AND action!='status') c"));
await wd();await call("/api/autonomy/agents/activity",null,"GET");await call("/api/autonomy/agents/overview",null,"GET");
ok("S7 Watchdog + monitoring reads queue no work, approve nothing and add nothing to the owner approval queue",J(q("SELECT (SELECT COUNT(*) FROM approval_queue) a,(SELECT COUNT(*) FROM agent_approvals WHERE status='approved') b,(SELECT COUNT(*) FROM autonomy_tasks WHERE status='queued' AND action!='status') c"))===gate);
ok("S8 responses carry no secrets (bot token, webhook secret, admin token)",!/bot-test|"sec"|Bearer/.test(J(A.body))&&!/bot-test|"sec"|Bearer/.test(J(O.body)));
done();
