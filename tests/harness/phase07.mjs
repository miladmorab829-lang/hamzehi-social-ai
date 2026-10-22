// PHASE 07 — TECHNICAL HEALTH & RELIABILITY: multidimensional health model, time-bounded rowid-floor reads (Watchdog + Control Center),
// demo-data labelling of the local preview, Persian error/next-action UI, security / Approval Gate and API compatibility.
// Local only (node:sqlite stand-in for D1); nothing reaches Production, Telegram or a paid API.
import fs from "node:fs";import path from "node:path";import vm from "node:vm";import {fileURLToPath,pathToFileURL} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,J,done}=reporter("phase07");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const SRC=process.env.SRC||path.join(REPO,"worker/src");
const imp=f=>import(pathToFileURL(path.join(SRC,f)).href);
const {healthModel,classifyAgent}=await imp("agent-activity.js");
const {rowidFloor,clearRowidFloorCache,runWatchdog}=await imp("agent-watchdog.js");
const W=await makeWorld();const {q,dbrun,call}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
await call("/api/autonomy/status",null,"GET");
const NOW=Date.now(),ago=m=>new Date(NOW-m*60000).toISOString();let n=0;
const task=(m,a,st,at,err=null)=>dbrun("INSERT INTO autonomy_tasks(id,command_id,module,action,status,priority,payload_json,error,attempts,finished_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",["T"+(++n),"c",m,a,st,40,"{}",err,1,st==="queued"?null:at,at,at]);
const hm=(x,nowMs=NOW)=>{const a={master:"on",module_enabled:true,last_run_at:ago(5),latest_task_status:"completed",tasks_available:true,queue:{queued:0,running:0},...x};return healthModel(a,classifyAgent(a,nowMs),nowMs)};

// ================= BLOCK 1 — health model (pure) =================
ok("H1 heartbeat OK but no real work → technical HEALTHY, activity IDLE (never ACTIVE from a status check alone)",(()=>{const r=hm({last_real_at:ago(10*1440)});return r.technical==="HEALTHY"&&r.activity==="IDLE"&&r.execution==="SUCCESS"})());
ok("H2 a channel never connected → connection NOT_CONNECTED, technical stays HEALTHY, activity IDLE, next action is the owner's decision",(()=>{const r=hm({channel:true,connected:false});return r.connection==="NOT_CONNECTED"&&r.technical==="HEALTHY"&&r.activity==="IDLE"&&r.next_action==="CHANNEL_NOT_CONNECTED"})());
ok("H3 owner-paused channel → PAUSED (not NOT_CONNECTED, not a failure)",(()=>{const r=hm({channel:true,connected:false,module_enabled:false});return r.connection==="PAUSED"&&r.technical==="HEALTHY"&&r.next_action==="MODULE_DISABLED"})());
ok("H4 internal agents have no external channel → NOT_APPLICABLE; channel with unknown inbound → UNKNOWN",hm({}).connection==="NOT_APPLICABLE"&&hm({channel:true,connected:null}).connection==="UNKNOWN");
ok("H5 technical: latest task failed or critical alert → FAILED; stale run / open DLQ / warning alert → DEGRADED; agent_inactive alone is not technical",
 hm({latest_task_status:"failed"}).technical==="FAILED"&&hm({alerts_open:[{level:"critical",code:"x"}]}).technical==="FAILED"&&hm({last_run_at:ago(50)}).technical==="DEGRADED"&&hm({dead_letters_open:1}).technical==="DEGRADED"&&hm({alerts_open:[{level:"warning",code:"agent_failing"}]}).technical==="DEGRADED"&&hm({alerts_open:[{level:"warning",code:"agent_inactive"}]}).technical==="HEALTHY");
ok("H6 no task data at all → technical/activity UNKNOWN, execution NOT_SCHEDULED; task source unavailable → execution UNKNOWN; next action NO_DATA",
 (()=>{const a={master:"on",module_enabled:true,tasks_available:true,queue:{queued:0,running:0}},r=healthModel(a,classifyAgent(a,NOW),NOW);const b={...a,tasks_available:false,queue:null},r2=healthModel(b,classifyAgent(b,NOW),NOW);return r.technical==="UNKNOWN"&&r.activity==="UNKNOWN"&&r.execution==="NOT_SCHEDULED"&&r.next_action==="NO_DATA"&&r2.execution==="UNKNOWN"})());
ok("H7 execution: queued/running → RUNNING; blocked task → FAILED",hm({queue:{queued:1,running:0}}).execution==="RUNNING"&&hm({queue:{queued:0,running:1}}).execution==="RUNNING"&&hm({latest_task_status:"blocked"}).execution==="FAILED");
ok("H8 reason codes and next action are deterministic and ordered (Ads city before DLQ; master first)",
 J(hm({blocked_codes:["ADS_CITY_EMPTY"],dead_letters_open:2,last_real_at:ago(10)}).reason_codes)===J(["ADS_CITY_EMPTY","DLQ_OPEN"])&&hm({blocked_codes:["ADS_CITY_EMPTY"],dead_letters_open:2}).next_action==="ADS_CITY_EMPTY"&&hm({master:"paused",blocked_codes:["ADS_CITY_EMPTY"]}).next_action==="MASTER_OFF"&&hm({last_real_at:ago(10)}).next_action==="NONE");
ok("H9 overdue scheduled work → EXPECTED_WORK_OVERDUE (operational), still technical HEALTHY",(()=>{const r=hm({last_real_at:ago(3*1440),expected_every_ms:2*3600e3});return r.reason_codes.includes("EXPECTED_WORK_OVERDUE")&&r.technical==="HEALTHY"&&r.next_action==="EXPECTED_WORK_OVERDUE"})());

// ================= BLOCK 2 — rowid floor (bounded time-range reads) =================
// 30 000 old rows (90 → 61 days ago) then 600 recent rows (last 30 h): the floor must land on the first recent row
{const ins=W.d1.db.prepare("INSERT INTO autonomy_tasks(id,command_id,module,action,status,priority,payload_json,attempts,finished_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)");
 W.d1.db.exec("BEGIN");for(let i=0;i<30000;i++){const at=new Date(NOW-90*86400000+i*86400000/1000).toISOString();ins.run("OLD"+i,"c","website","status","completed",40,"{}",1,at,at,at);}
 for(let i=0;i<600;i++){const at=new Date(NOW-30*3600000+i*180000).toISOString();ins.run("NEW"+i,"c",i%2?"website":"revenue",i%2?"status":"funnel_snapshot","completed",40,"{}",1,at,at,at);}W.d1.db.exec("COMMIT");}
clearRowidFloorCache();let probes=0;const real=W.env.DB.prepare.bind(W.env.DB);
const countingEnv={DB:{prepare:s=>{if(/WHERE rowid>=\? ORDER BY rowid LIMIT 1/.test(s))probes++;return real(s)}}};
const f=await rowidFloor(countingEnv,"autonomy_tasks",new Date(NOW-31*3600000).toISOString(),{nowMs:NOW});
const firstNew=q("SELECT rowid r FROM autonomy_tasks WHERE id='NEW0'")[0].r;
ok("R1 binary search finds the exact first row of the window on 30 600 rows in ≤ 40 primary-key probes",f.floor===firstNew&&f.covered===true&&probes<=40,{f,firstNew,probes});
probes=0;const f2=await rowidFloor(countingEnv,"autonomy_tasks",new Date(NOW-31*3600000).toISOString(),{nowMs:NOW+60000});
ok("R2 the floor is cached (10 min): a second lookup needs only the coverage probe",f2.floor===firstNew&&probes<=1,{probes});
const none=await rowidFloor(W.env,"autonomy_tasks",new Date(NOW+3600000).toISOString(),{nowMs:NOW});
ok("R3 a window in the future → floor = max+1 (nothing to read); only allow-listed tables",none.floor===none.max+1&&await rowidFloor(W.env,"leads","x").then(()=>false,()=>true));
// Watchdog over a 30 h window that the old 2000-row cap could not cover: revenue completed 1 h ago → no false agent_inactive
dbrun("INSERT OR REPLACE INTO agent_heartbeat(scheduler,last_run_id,last_finished_at,healthy) VALUES('autonomy','r',?,1)",[ago(5)]);
for(let i=0;i<2500;i++)task("website","status","completed",ago(60-i*0.02));task("revenue","funnel_snapshot","completed",ago(61));task("photo","photo_generate","completed",ago(62));
clearRowidFloorCache();let r=await runWatchdog(W.env,{nowMs:NOW,orchestratorOn:true});
ok("R4 Watchdog reads the full 30 h window via the floor: with 2 500+ newer rows no false agent_inactive",!r.alerts.includes("agent_inactive"),r);
// activity endpoint: rows older than the 60-day window are excluded (bounded read), response stays fast
const t0=performance.now();const A=(await call("/api/autonomy/agents/activity",null,"GET")).body||{};const dt=performance.now()-t0;
const web=(A.agents||[]).find(a=>a.agent==="website");
ok("R5 activity endpoint excludes rows older than 60 days (30 000 old rows not counted) and answers in < 1.5 s locally",web&&web.counts_all.completed<30000&&A.history_window_days===60&&dt<1500,{counts:web?.counts_all,dt:Math.round(dt)});
ok("R6 every agent carries the 4 dimensions + next action + last success; freshness reported",(A.agents||[]).length===11&&A.agents.every(a=>a.technical&&a.connection&&a.activity&&a.execution&&a.next_action&&"last_success_at" in a)&&["FRESH","STALE","UNKNOWN"].includes(A.freshness?.state),A.freshness);
ok("R7 API compatibility: Phase 05/06 fields are still present",A.agents.every(a=>"status" in a&&"health" in a&&"reasons" in a&&"quality_7d" in a&&"cost" in a&&"version" in a&&"counts_7d" in a&&"queue" in a));

// ================= BLOCK 3 — dashboard UI, demo labelling =================
const html=await (await W.run(new Request("https://w.test/dashboard/agents"))).text(),script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join("\n");
let parses=true;try{new vm.Script(script)}catch{parses=false}
ok("U1 page renders, script parses; production HTML has NO demo banner and no test token",parses&&!/DEMO DATA/.test(html)&&!/توکن تستی/.test(html));
{const src=script.slice(script.indexOf("const AC_META="),script.indexOf("function acRender(){"));const ctx={};vm.createContext(ctx);
 vm.runInContext('function esc(x){return String(x??"").replace(/[&<>"\']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",\'"\':"&quot;","\'":"&#39;"}[m]))}'+src.replace(/let acData=null,acFilter="ALL";/,"")+";this.card=acCard;this.err=acErr;",ctx);
 const card=ctx.card({agent:"ads",status:"BLOCKED",technical:"HEALTHY",connection:"NOT_APPLICABLE",activity:"BLOCKED",execution:"SUCCESS",reason_codes:["ADS_CITY_EMPTY"],next_action:"ADS_CITY_EMPTY",detail:{autopilot:"on",target_city:null},quality_7d:{real:{samples:0,success_pct:null,missing:"NO_FINISHED_TASKS"},status_checks:{samples:9,success_pct:100}},approvals:[],last_run_at:ago(5)});
 ok("U2 card shows 4 labelled dimensions, Persian reason + next action, missing-data explanation and expandable technical codes",/فنی: سالم/.test(card)&&/اتصال: داخلی/.test(card)&&/فعالیت: مسدود/.test(card)&&/اجرا: موفق/.test(card)&&/شهر هدف تبلیغات تعیین نشده/.test(card)&&/اقدام پیشنهادی:<\/b> یک شهر معتبر/.test(card)&&/هنوز کاری در ۷ روز گذشته تمام نشده/.test(card)&&/<details><summary class='hint'>جزئیات فنی<\/summary><pre>[\s\S]*ADS_CITY_EMPTY/.test(card),card);
 const e401=ctx.err({ok:false,status:401,error:"Unauthorized"});
 ok("U3 API errors in Persian with the raw code kept in technical details (401 → login hint)",/ابتدا با توکن مدیر وارد شوید/.test(e401)&&/HTTP 401 · Unauthorized/.test(e401)&&/خطای سرور/.test(ctx.err({status:503,error:"x"}))&&/بیش از حد طول کشید/.test(ctx.err({error:"Request timed out after 10 seconds"})));}
const pv=fs.readFileSync(path.join(REPO,"tests/harness/preview-server.mjs"),"utf8");
ok("U4 the local preview labels demo data (banner + [DEMO] title + X-Data-Source header), binds 127.0.0.1 and blocks outbound",/DEMO DATA/.test(pv)&&/\[DEMO\]/.test(pv)&&/x-data-source/.test(pv)&&/listen\(PORT,"127\.0\.0\.1"/.test(pv)&&/blocked in local preview/.test(pv));
const poll=(script.match(/const DASHBOARD_POLL_GROUPS=\[[\s\S]*?\n\];/)||[""])[0];
ok("U5 no new polling (activity/overview not polled)",poll.length>0&&!/loadAgentCenter|loadAgentOps|loadHubAgents|agents\/(activity|overview)/.test(poll));

// ================= BLOCK 4 — security & Approval Gate =================
const raw=(p,o={})=>W.run(new Request("https://w.test"+p,o));
const st=[];for(const [p,m] of [["/api/autonomy/agents/activity","GET"],["/api/autonomy/agents/overview","GET"],["/api/autonomy/agents/alerts/ack","POST"],["/api/autonomy/agents/dead-letters/resolve","POST"],["/api/autonomy/agents/approvals/decide","POST"],["/api/autonomy/status","GET"],["/api/autonomy/master","POST"]])
 st.push((await raw(p,{method:m,headers:{"CF-Connecting-IP":"198.51.100."+st.length,Authorization:"Bearer wrong-token","Content-Type":"application/json"},body:m==="POST"?"{}":undefined})).status);
ok("S1 every agent/owner endpoint refuses a wrong token with 401",st.every(s=>s===401),st);
ok("S2 activity rejects POST (405) — read-only",(await call("/api/autonomy/agents/activity",{},"POST")).status===405);
const src=["agent-activity.js","agent-watchdog.js","agent-ops-store.js","autonomy-engine.js","live-dashboard-page.js"].map(f=>fs.readFileSync(path.join(SRC,f),"utf8")).join("\n");
ok("S3 no test token, demo bypass or hard-coded credential in Worker code",!/["']tok["']/.test(src)&&!/DEMO DATA|x-data-source/i.test(src)&&!/Bearer [A-Za-z0-9]{8,}/.test(src));
const before=J(q("SELECT (SELECT COUNT(*) FROM autonomy_tasks WHERE status='queued') a,(SELECT COUNT(*) FROM approval_queue) b,(SELECT COUNT(*) FROM agent_approvals WHERE status='approved') c"));
await call("/api/autonomy/agents/activity",null,"GET");await call("/api/autonomy/agents/overview",null,"GET");clearRowidFloorCache();await runWatchdog(W.env,{nowMs:NOW,orchestratorOn:true});
ok("S4 monitoring reads + Watchdog queue nothing, approve nothing and send nothing (Approval Gate untouched)",J(q("SELECT (SELECT COUNT(*) FROM autonomy_tasks WHERE status='queued') a,(SELECT COUNT(*) FROM approval_queue) b,(SELECT COUNT(*) FROM agent_approvals WHERE status='approved') c"))===before&&!W.tg.some(x=>/^send/.test(x.method)),before);
const A2=(await call("/api/autonomy/agents/activity",null,"GET")).body;
ok("S5 responses carry no secrets (bot token, webhook secret, admin token)",!/bot-test|"sec"|Bearer/.test(J(A2)));
done();
