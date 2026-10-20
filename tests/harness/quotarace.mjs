// ATOMIC DAILY QUOTAS — the claim of a paid autonomy task is also its quota reservation (one D1 statement), so concurrent cron /
// admin / legacy runs, retries, timeouts and re-queued tasks can never exceed the daily cap. Local only; paid executors are mocks.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,J,done}=reporter("quotarace");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const W=await makeWorld();const {q,dbrun}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
W.env.AUTONOMY_ORCHESTRATOR="on";
const AE=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+"?qr="+Math.random());await AE.autonomyMasterGate(W.env);
const T0="2026-10-19T00:00:00.000Z",sleep=ms=>new Promise(r=>setTimeout(r,ms));
const reset=()=>{for(const t of ["autonomy_tasks","autonomy_locks","autonomy_commands","agent_dead_letters","agent_alerts","agent_approvals"])dbrun(`DELETE FROM ${t}`);
  dbrun("DELETE FROM autonomy_controls WHERE key='quotas'");
  dbrun("INSERT INTO autonomy_commands(id,raw_command,plan_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",["c","test",JSON.stringify({mode:"execute",tasks:[{module:"photo",action:"photo_generate"},{module:"revenue",action:"funnel_snapshot"},{module:"crm",action:"lead_discovery"}]}),"queued",T0,T0]);};
let prio=1000;const add=(id,module,action,payload={})=>dbrun("INSERT INTO autonomy_tasks(id,command_id,module,action,status,priority,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",[id,"c",module,action,"queued",prio--,JSON.stringify({id,...payload}),T0,T0]);
const row=id=>q("SELECT * FROM autonomy_tasks WHERE id=?",[id])[0];
const orch=(ex,limits={})=>AE.runTasksOrchestrated(W.env,new Request("https://w.test/x"),20,{executor:ex,limits});
const usedToday=(m,a)=>q("SELECT COALESCE(SUM(attempts),0) n FROM autonomy_tasks WHERE module=? AND action=? AND started_at>=?",[m,a,new Date(new Date().setUTCHours(0,0,0,0)).toISOString()])[0].n;
const tomorrow=()=>{const d=new Date();d.setUTCHours(24,0,0,0);return d.toISOString();};

// Q1 the claim itself enforces the cap: a concurrent instance uses the last photo unit AFTER this run planned (pre-check saw 0)
reset();add("r1","revenue","funnel_snapshot");add("p1","photo","photo_generate");
{let paid=0;const ex=async(env,req,t)=>{if(t.module==="revenue"){dbrun("INSERT INTO autonomy_tasks(id,command_id,module,action,status,priority,payload_json,attempts,started_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",["other-instance","c","photo","photo_generate","completed",1,"{}",1,new Date().toISOString(),T0,T0]);return {ok:true};}paid++;return {ok:true};};
 const r=await orch(ex,{concurrency:1});
 ok("Q1 a concurrent instance takes the last unit between planning and claim: the atomic claim refuses, the paid executor is never called, the task is deferred to the next UTC day",paid===0&&row("p1").status==="queued"&&row("p1").attempts===0&&row("p1").scheduled_at>=tomorrow()&&/Daily quota/.test(row("p1").error||"")&&usedToday("photo","photo_generate")===1,[paid,row("p1"),r]);
 ok("Q1b a quota refusal creates no approval request, no dead letter and no alert",q("SELECT COUNT(*) n FROM agent_approvals")[0].n===0&&q("SELECT COUNT(*) n FROM agent_dead_letters WHERE task_id='p1'")[0].n===0&&!q("SELECT 1 FROM agent_alerts WHERE affected_tasks_json LIKE '%p1%'").length,"");}
// Q2 cron (orchestrated) + admin route + legacy loop at the same time over three queued photo tasks: exactly one paid call
reset();add("p2","photo","photo_generate",{n:1});add("p3","photo","photo_generate",{n:2});add("p4","photo","photo_generate",{n:3});
{let paid=0;globalThis.__paidCalls=0;const ex=async()=>{paid++;await sleep(25);return {ok:true};};
 const legacyEnv={...W.env,AUTONOMY_ORCHESTRATOR:""};const realFetch=globalThis.fetch;
 // the admin route and the legacy loop use the real executeTask → photo autopilot self-call; count it at the network mock
 globalThis.fetch=async(u,o)=>{if(/\/api\/photo-autopilot\/run/.test(String(u?.url||u))){paid++;await sleep(25);return new Response(JSON.stringify({ok:true}),{status:200,headers:{"Content-Type":"application/json"}});}return realFetch(u,o);};
 await Promise.all([orch(ex),W.call("/api/autonomy/tasks/run",{}),AE.runTasks(legacyEnv,new Request("https://w.test/x"),20),orch(ex)]);
 globalThis.fetch=realFetch;
 const st=["p2","p3","p4"].map(id=>row(id).status);
 ok("Q2 four concurrent runs (2× cron-orchestrated, admin route, legacy loop) over 3 queued photo tasks make exactly ONE paid call; the others stay queued",paid===1&&st.filter(s=>s==="completed").length===1&&st.filter(s=>s==="queued").length===2&&usedToday("photo","photo_generate")===1,[paid,st]);
 ok("Q2b the invariant holds: attempts started today never exceed the cap, and nothing waits for owner approval",usedToday("photo","photo_generate")<=1&&q("SELECT COUNT(*) n FROM agent_approvals")[0].n===0,"");}
// Q3 a paid task that times out counts against the quota and is not retried; the next one waits
reset();add("t1","photo","photo_generate",{n:1});
{let paid=0;await orch(()=>{paid++;return new Promise(()=>{});},{timeoutMs:30,retries:3,backoffMs:1});
 add("t2","photo","photo_generate",{n:2});await orch(async()=>{paid++;return {ok:true};});
 ok("Q3 a timed-out paid call is called once (no retry), counts as used, and the next photo task is deferred instead of spending again",paid===1&&row("t1").status==="failed"&&row("t1").attempts===1&&row("t2").status==="queued"&&row("t2").scheduled_at>=tomorrow(),[paid,row("t1").status,row("t1").attempts,row("t2")]);}
// Q4 re-queueing a failed paid task through the dead-letter queue cannot exceed the cap
{dbrun("UPDATE autonomy_tasks SET status='failed' WHERE id='t2'");const dl=q("SELECT id FROM agent_dead_letters WHERE task_id='t1'")[0];
 const rq=dl?await W.call("/api/autonomy/agents/dead-letters/resolve",{id:dl.id,resolution:"retried"}):{body:{ok:false}};let paid=0;
 await orch(async()=>{paid++;return {ok:true};});
 ok("Q4 a dead-letter requeue of the timed-out task is accepted, but the run does not spend again today (its earlier attempt still counts)",rq.body.ok&&paid===0&&row("t1").status==="queued"&&row("t1").scheduled_at>=tomorrow()&&usedToday("photo","photo_generate")===1,[rq.body,paid,row("t1")]);}
// Q5 UTC reset: yesterday's attempts do not count
{dbrun("UPDATE autonomy_tasks SET started_at=?,scheduled_at=NULL WHERE id='t1'",[new Date(Date.now()-86400000*1.5).toISOString()]);let paid=0;
 dbrun("DELETE FROM autonomy_locks");   // the hung Q3 request has settled (its lock is released, as in B8)
 await orch(async()=>{paid++;return {ok:true};});
 ok("Q5 after the UTC day changes (yesterday's attempt) the re-queued task runs once",paid===1&&row("t1").status==="completed",[paid,row("t1")]);}
// Q6 owner-configured limit and the default
reset();dbrun("INSERT OR REPLACE INTO autonomy_controls(key,value,updated_at) VALUES('quotas',?,?)",[JSON.stringify({"crm:lead_discovery":3}),T0]);
for(let i=1;i<=4;i++)add("l"+i,"crm","lead_discovery",{i});
{let paid=0;await orch(async()=>{paid++;return {ok:true};});
 ok("Q6 an owner limit of 3 lead discoveries/day allows exactly 3; the 4th is deferred",paid===3&&row("l4").status==="queued"&&row("l4").scheduled_at>=tomorrow(),[paid,row("l4")]);
 dbrun("DELETE FROM autonomy_controls WHERE key='quotas'");add("l5","crm","lead_discovery",{i:5});await orch(async()=>{paid++;return {ok:true};});
 ok("Q6b without the owner limit the default (2/day) applies again: nothing more runs today",paid===3&&row("l5").status==="queued",paid);}
// Q7 legacy loop alone also uses the atomic claim
reset();add("g1","photo","photo_generate",{n:1});add("g2","photo","photo_generate",{n:2});
{const legacyEnv={...W.env,AUTONOMY_ORCHESTRATOR:""};const realFetch=globalThis.fetch;let paid=0;
 globalThis.fetch=async(u,o)=>{if(/\/api\/photo-autopilot\/run/.test(String(u?.url||u))){paid++;return new Response(JSON.stringify({ok:true}),{status:200,headers:{"Content-Type":"application/json"}});}return realFetch(u,o);};
 await AE.runTasks(legacyEnv,new Request("https://w.test/x"),20);globalThis.fetch=realFetch;
 ok("Q7 the legacy loop (orchestrator OFF) spends at most the cap too: one photo call, the second task deferred",paid===1&&[row("g1").status,row("g2").status].sort().join()==="completed,queued",[paid,row("g1").status,row("g2").status]);}
// Q8 read tasks keep their retries; no paid task is retried
reset();add("w1","revenue","funnel_snapshot");
{let n=0;await orch(async()=>{n++;if(n===1)throw new Error("transient");return {ok:true};},{backoffMs:1});
 ok("Q8 a read task is still retried after a transient error (only paid/draft work is never retried)",n===2&&row("w1").status==="completed",[n,row("w1").status]);}
process.exit(done()?1:0);
