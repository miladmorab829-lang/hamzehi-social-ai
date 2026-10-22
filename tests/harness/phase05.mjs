// PHASE 05 — AGENT CONTROL CENTER: per-agent activity endpoint (read-only), status vs liveness classification, dashboard pages and
// Watchdog alert de-duplication. Local only (node:sqlite stand-in for D1); nothing reaches Production, Telegram or a paid API.
import fs from "node:fs";import path from "node:path";import vm from "node:vm";import {fileURLToPath,pathToFileURL} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,J,done}=reporter("phase05");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const SRC=process.env.SRC||path.join(REPO,"worker/src");
const {classifyAgent,ACTIVITY_WINDOW_MS}=await import(pathToFileURL(path.join(SRC,"agent-activity.js")).href);
const W=await makeWorld();const {q,dbrun,call}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
const NOW=Date.now(),ago=m=>new Date(NOW-m*60000).toISOString();

// ================= BLOCK 1 — classification (pure) =================
{const live={master:"on",module_enabled:true,last_run_at:ago(5),latest_task_status:"completed"};
 const c=(x,n=NOW)=>classifyAgent({...live,...x},n);
 ok("C1 a recent real task → ACTIVE + HEALTHY",J(c({last_real_at:ago(60)}))===J({status:"ACTIVE",health:"HEALTHY",reasons:[]}),c({last_real_at:ago(60)}));
 ok("C2 only successful status checks (real work 10 days ago) → IDLE, still HEALTHY: liveness is not activity",c({last_real_at:ago(14400)}).status==="IDLE"&&c({last_real_at:ago(14400)}).health==="HEALTHY"&&c({}).status==="IDLE");
 ok("C3 real work exactly at the 48 h edge is ACTIVE, one minute later IDLE",c({last_real_at:new Date(NOW-ACTIVITY_WINDOW_MS).toISOString()}).status==="ACTIVE"&&c({last_real_at:new Date(NOW-ACTIVITY_WINDOW_MS-60000).toISOString()}).status==="IDLE");
 const b=c({last_real_at:ago(10),module_enabled:false,actions_disabled:["run"],blocked_reasons:["x"],dead_letters_open:2});
 ok("C4 disabled module/action, a blocking signal or open dead letters → BLOCKED with every reason listed",b.status==="BLOCKED"&&b.reasons.length===4,b);
 const cr=c({last_real_at:ago(10),alerts_open:[{level:"critical",code:"runs_unhealthy"},{level:"warning",code:"agent_failing"}]});
 ok("C5 a critical alert → BLOCKED + FAILING; a warning alone does not block",cr.status==="BLOCKED"&&cr.health==="FAILING"&&c({last_real_at:ago(10),alerts_open:[{level:"warning",code:"w"}]}).status==="ACTIVE",cr);
 ok("C6 a channel with no inbound ever → NOT_CONNECTED (even if its status checks succeed)",c({connected:false,last_real_at:ago(10)}).status==="NOT_CONNECTED");
 ok("C7 no task ever → UNKNOWN status and UNKNOWN health",J(classifyAgent({master:"on",module_enabled:true}))===J({status:"UNKNOWN",health:"UNKNOWN",reasons:[]}));
 ok("C8 last run older than the 35 min watchdog threshold → STALE; latest task failed → FAILING",c({last_run_at:ago(40)}).health==="STALE"&&c({latest_task_status:"failed"}).health==="FAILING");
 ok("C9 Master paused → BLOCKED with the reason",c({master:"paused",last_real_at:ago(5)}).status==="BLOCKED"&&c({master:"paused"}).reasons[0]==="Master is paused");
}

// ================= BLOCK 2 — endpoint on a Production-shaped fixture =================
let n=0;const task=(module,action,status,at,error=null)=>dbrun("INSERT INTO autonomy_tasks(id,command_id,module,action,status,priority,payload_json,error,attempts,finished_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",["T"+(++n),"c",module,action,status,40,"{}",error,1,at,at,at]);
const evt=(type,at,details)=>dbrun("INSERT INTO system_events(id,type,severity,message,details_json,created_at) VALUES(?,?,?,?,?,?)",["E"+(++n),type,"info","m",JSON.stringify(details||{}),at]);
await call("/api/autonomy/status",null,"GET");   // creates the autonomy tables through the Worker's own ensure()
for(const m of ["telegram","whatsapp","instagram","website","crm","ads","content","media","photo","learning"])task(m,"status","completed",ago(7));
task("revenue","funnel_snapshot","completed",ago(7));
task("photo","photo_generate","completed",ago(600));task("photo","photo_generate","failed",ago(30*1440),"Unsupported Telegram image MIME type: application/octet-stream");
task("website","growth_scan","completed",ago(26*1440));task("learning","run","completed",ago(26*1440));
evt("analyze_optimize_cycle",ago(120),{samples:3});
evt("ad_autopilot_run",ago(80),{found:3,drafted:1,errors:0,city:""});
evt("auto_content_generated",ago(300),{});evt("auto_pilot_cycle",ago(7),{pending_review:63,hold_reason:"nothing_generated"});
evt("media_ai_video_generated",ago(25*1440),{});evt("weekly_video_autopilot_kling_rejected",ago(3*1440),{error:"multiPrompt[0].prompt: size must be between 0 and 512"});
dbrun("INSERT INTO inbox_messages(id,platform,sender,message,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",["M1","telegram","s","hello","new",ago(13*1440),ago(13*1440)]);
W.d1.db.exec("CREATE TABLE IF NOT EXISTS system_kv(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)");
// Phase 09.4: an enabled market without a city (hand-written row; the API never stores one) must still surface as BLOCKED
dbrun("INSERT OR REPLACE INTO system_kv(key,value,updated_at) VALUES(?,?,?)",["ads_market:ARAB",JSON.stringify({enabled:true,type:"gold",city:"",runs_per_day:4}),ago(1)]);
const counts=()=>J(["autonomy_tasks","system_events","inbox_messages","system_kv","agent_alerts","agent_dead_letters","autonomy_commands"].map(t=>q(`SELECT COUNT(*) n FROM ${t}`)[0].n));
const before=counts();
const r=await call("/api/autonomy/agents/activity",null,"GET");const A=r.body||{},by=Object.fromEntries((A.agents||[]).map(a=>[a.agent,a]));
ok("E1 GET returns all 11 runtime agents with status + health, no unavailable source",r.status===200&&A.ok===true&&(A.agents||[]).length===11&&A.agents.every(a=>a.status&&a.health)&&(A.unavailable_sources||[]).length===0,A);
ok("E2 revenue (funnel_snapshot this cycle) → ACTIVE",by.revenue?.status==="ACTIVE"&&by.revenue.last_real_source==="task funnel_snapshot",by.revenue);
ok("E3 website: successful status checks, real work 26 days ago → IDLE + HEALTHY",by.website?.status==="IDLE"&&by.website.health==="HEALTHY"&&/growth_scan/.test(by.website.last_real_source),by.website);
ok("E4 learning counts its external analyze cycle as real work → ACTIVE",by.learning?.status==="ACTIVE"&&by.learning.last_real_source==="event analyze_optimize_cycle",by.learning);
ok("E5 ads: Autopilot on with an empty city → BLOCKED with the reason; last run figures shown",by.ads?.status==="BLOCKED"&&/city is empty/.test(by.ads.reasons.join())&&by.ads.detail.last_run_found===3&&by.ads.detail.target_city===null,by.ads);
ok("E6 media: Kling rejection newer than the last generated video → BLOCKED, reason redacted text",by.media?.status==="BLOCKED"&&/kling_rejected.*512/.test(by.media.reasons.join()),by.media);
ok("E7 whatsapp/instagram with no inbound ever → NOT_CONNECTED; telegram has inbound so it is connected (IDLE)",by.whatsapp?.status==="NOT_CONNECTED"&&by.instagram?.status==="NOT_CONNECTED"&&by.telegram?.connected===true&&by.telegram.status==="IDLE"&&by.telegram.inbound.messages===1,[by.whatsapp,by.telegram]);
ok("E8 photo: a 30-day-old failure does not block today's work; failure kept visible",by.photo?.status==="ACTIVE"&&by.photo.last_failure&&/MIME/.test(by.photo.last_failure.error)&&by.photo.counts_all.failed===1,by.photo);
ok("E9 content shows the owner-approval backlog; approvals list capabilities (paid/draft/read) per action",by.content?.detail.pending_review===63&&by.content.approvals.some(x=>x.action==="generate_and_queue"&&x.capability==="paid")&&by.telegram.approvals.some(x=>x.action==="inbox_reply"&&x.capability==="draft"),by.content);
ok("E10 the endpoint writes nothing (row counts of every touched table unchanged)",counts()===before,[before,counts()]);
const noAuth=await W.run(new Request("https://w.test/api/autonomy/agents/activity"));
const post=await call("/api/autonomy/agents/activity",{},"POST");
ok("E11 without the admin token → 401; POST → 405",noAuth.status===401&&post.status===405,[noAuth.status,post.status]);
ok("E12 the response carries no secrets (no bot token, webhook secret or admin token)",!/bot-test|"sec"|\btok\b/.test(J(A)));
// a critical open alert and an unresolved dead letter on one agent are reflected on its card
dbrun("INSERT INTO agent_alerts(id,scheduler,code,agent,level,cause_redacted,recovery_state,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?,?,?,?)",["AL1","watchdog","agent_failing","autonomy:revenue","critical","x","open",ago(3),ago(1)]);
const r2=(await call("/api/autonomy/agents/activity",null,"GET")).body,rev=r2.agents.find(a=>a.agent==="revenue");
ok("E13 a critical open alert turns revenue BLOCKED + FAILING with the alert listed",rev.status==="BLOCKED"&&rev.health==="FAILING"&&rev.alerts_open[0].code==="agent_failing",rev);

// ================= BLOCK 3 — dashboard pages =================
const page=async p=>(await W.run(new Request("https://w.test"+p))).text();
const agentsHtml=await page("/dashboard/agents"),hubHtml=await page("/dashboard");
const script=h=>[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join("\n");
let parses=true,perr="";try{new vm.Script(script(agentsHtml))}catch(e){parses=false;perr=e.message}
ok("D1 /dashboard/agents renders the control center before the existing ops panel and its script parses",agentsHtml.includes('id="agentCenterGrid"')&&agentsHtml.indexOf("agentCenterPanel")<agentsHtml.indexOf("agentOpsPanel")&&parses,perr);
ok("D2 the hub shows the agent summary card; existing hub stats unchanged",hubHtml.includes('id="hubAgents"')&&hubHtml.includes('id="homeStats"'));
const poll=(script(agentsHtml).match(/const DASHBOARD_POLL_GROUPS=\[[\s\S]*?\n\];/)||[""])[0];
ok("D3 the activity endpoint is not polled (absent from the 15 s poll groups)",poll.length>0&&!/loadAgentCenter|loadHubAgents|agents\/activity/.test(poll));
ok("D4 no new auto-approve/publish/send call in the control center code",!/agentCenter[\s\S]{0,40}(approve|publish|send)/i.test(script(agentsHtml).slice(script(agentsHtml).indexOf("const AC_META"),script(agentsHtml).indexOf("async function loadDiagnostic"))));

// ================= BLOCK 4 — Watchdog alert de-duplication (client function in a sandbox) =================
{const s=script(agentsHtml),src=s.slice(s.indexOf("function acAlertsHtml("),s.indexOf("async function loadDiagnostic"));
 const ctx={};vm.createContext(ctx);vm.runInContext('function esc(x){return String(x??"").replace(/[&<>"\']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",\'"\':"&quot;","\'":"&#39;"}[m]))}'+src+";this.f=acAlertsHtml;",ctx);
 const al=[{id:"a1",agent:"autonomy:photo",code:"agent_failing",level:"warning",occurrences:2,first_seen_at:ago(60),last_seen_at:ago(5),recovery_state:"open",cause_redacted:"3 failed",affected_tasks:["t1","t2"],fallback_status:"Other agents continue"},
  {id:"a0",agent:"autonomy:photo",code:"agent_failing",level:"warning",occurrences:4,first_seen_at:ago(3000),last_seen_at:ago(2900),recovery_state:"recovered",recovered_at:ago(2800),acknowledged_at:ago(2700),affected_tasks:[]},
  {id:"a2",agent:"orchestrator",code:"heartbeat_stale",level:"critical",occurrences:1,first_seen_at:ago(40),last_seen_at:ago(40),recovery_state:"open",acknowledged_at:ago(20),affected_tasks:[]},
  {id:"a3",agent:"autonomy:ads",code:"task_stuck",level:"info",occurrences:1,first_seen_at:ago(900),last_seen_at:ago(900),recovery_state:"recovered",recovered_at:ago(800),acknowledged_at:ago(700),affected_tasks:[]}];
 const h=ctx.f(al),openPart=h.split("<details")[0];
 ok("W1 repeated alerts of one agent+code are one row with summed occurrences and a history count",(openPart.match(/agent_failing/g)||[]).length===1&&/×6/.test(openPart)&&/\+1 سابقه/.test(openPart),h);
 ok("W2 an acknowledged but unrecovered alert stays in the open list (never silently hidden); critical sorted first",openPart.includes("heartbeat_stale")&&openPart.indexOf("heartbeat_stale")<openPart.indexOf("agent_failing")&&!/ACKNOWLEDGE<\/button>[\s\S]*heartbeat_stale/.test(openPart.split("agent_failing")[0]),h);
 ok("W3 summary counts open alerts, affected agents and severities; recovered+acknowledged go to the collapsible history",/باز\/دیده‌نشده: 2/.test(h)&&/عامل‌های درگیر: 2/.test(h)&&/critical 1/.test(h)&&/warning 1/.test(h)&&h.includes("<details")&&h.split("<details")[1].includes("task_stuck"),h);
 ok("W4 cause, impact, fallback, recovery and owner-acknowledgement state are shown; ACK button only when unacknowledged",openPart.includes("3 failed")&&openPart.includes("اثر: 2 task")&&openPart.includes("Other agents continue")&&openPart.includes("دیده نشده")&&(openPart.match(/ACKNOWLEDGE/g)||[]).length===1,h);
}
done();
