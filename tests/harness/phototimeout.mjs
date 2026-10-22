// PHASE 11.2C — PHOTO TIMEOUT: per-task orchestrator timeout (photo 55 s, clamped to the 60 s hard limit) and a bounded OpenAI image call
// (45 s) that ends in the Photo Autopilot error path (daily lock released, error audited, no usage, no image) instead of an abandoned
// request with a stuck lock. Local only: Telegram file calls and OpenAI are in-process mocks; no image is generated and nothing is sent.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,J,done}=reporter("phototimeout");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const W=await makeWorld({extraEnv:{OPENAI_API_KEY:"test-openai-not-real",PUBLIC_WORKER_BASE_URL:"https://w.test"}});const {q,dbrun,call}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
W.env.AUTONOMY_ORCHESTRATOR="on";
const OR=await import(pathToFileURL(path.join(SRC,"agent-orchestrator.js")).href);
const AE=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+"?pt="+Math.random());await AE.autonomyMasterGate(W.env);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// ================= BLOCK 1 — orchestrator per-task timeout =================
{const L={timeoutMs:30000};
 const e=[OR.effectiveTimeoutMs({timeoutMs:55000},L),OR.effectiveTimeoutMs({},L),OR.effectiveTimeoutMs({timeoutMs:10_000_000},L),OR.effectiveTimeoutMs({timeoutMs:-5},L),OR.effectiveTimeoutMs({timeoutMs:"x"},L),OR.effectiveTimeoutMs({timeoutMs:undefined},L)];
 ok("T1 effective timeout: own value wins, clamped to the 60 s hard limit; missing/invalid → the run default",J(e)===J([55000,30000,OR.HARD_LIMITS.timeoutMs,30000,30000,30000])&&OR.HARD_LIMITS.timeoutMs===60000,e);
 const mk=(id,ms,own)=>({id,agent:"t:"+id,version:"v",capability:"read",after:[],cost:1,retryable:false,...(own?{timeoutMs:own}:{}),run:async()=>{await sleep(ms);return id;}});
 const {report}=await OR.runAgentGraph([mk("own_long",150,400),mk("default",150),mk("own_short",300,80)],{timeoutMs:50,allowCapabilities:["read"],runId:"t"});
 const st=Object.fromEntries(report.tasks.map(t=>[t.id,[t.state,t.error||null]]));
 ok("T2 runAgentGraph: a task with its own longer timeout succeeds where the default (50 ms) times out; the error names the effective limit",st.own_long[0]==="succeeded"&&st.default[0]==="timed_out"&&/after 50 ms/.test(st.default[1])&&st.own_short[0]==="timed_out"&&/after 80 ms/.test(st.own_short[1]),st);}

// ================= BLOCK 2 — autonomy engine wiring =================
{const m=AE.AUTONOMY_TASK_TIMEOUT_MS;
 ok("T3 only photo:photo_generate gets a longer timeout (55 s: above the 26–28 s healthy runs, below the 60 s hard limit)",J(Object.keys(m))===J(["photo:photo_generate"])&&m["photo:photo_generate"]===55000&&m["photo:photo_generate"]<=OR.HARD_LIMITS.timeoutMs,m);
 const t0="2026-10-22T00:00:00.000Z";
 dbrun("INSERT INTO autonomy_commands(id,raw_command,plan_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",["c1","t",JSON.stringify({mode:"execute",tasks:[{module:"photo",action:"photo_generate"},{module:"telegram",action:"status"}]}),"queued",t0,t0]);
 for(const [id,mod,act] of [["p1","photo","photo_generate"],["s1","telegram","status"]])dbrun("INSERT INTO autonomy_tasks(id,command_id,module,action,status,priority,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",[id,"c1",mod,act,"queued",80,"{}",t0,t0]);
 const seen={};const executor=async(env,req,t,{signal}={})=>{seen[t.id]=!!signal;await sleep(150);return {ok:true,mode:"test"};};
 await AE.runTasksOrchestrated(W.env,new Request("https://w.test/x"),20,{executor,limits:{timeoutMs:50,retries:0}});
 const rows=Object.fromEntries(q("SELECT id,status,error FROM autonomy_tasks WHERE id IN ('p1','s1')").map(r=>[r.id,[r.status,r.error]]));
 ok("T4 runTasksOrchestrated: with a 50 ms run default, the photo task (own 55 s limit) completes while a default task with the same 150 ms work times out",rows.p1?.[0]==="completed"&&rows.s1?.[0]==="failed"&&/Timed out/.test(rows.s1?.[1]||"")&&seen.p1===true,rows);
 ok("T5 the paid photo task ran exactly once (attempts 1): a longer limit adds no retry",q("SELECT attempts FROM autonomy_tasks WHERE id='p1'")[0].attempts===1,q("SELECT attempts FROM autonomy_tasks WHERE id='p1'"));}

// ================= BLOCK 3 — Photo Autopilot: bounded OpenAI call → clean error path =================
let editCalls=0,editSignal=null,mode="timeout";const inner=globalThis.fetch;
globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);
  if(/api\.telegram\.org\/bot[^/]+\/getFile/.test(s))return new Response(JSON.stringify({ok:true,result:{file_path:"photos/fake.jpg"}}),{status:200,headers:{"Content-Type":"application/json"}});
  if(/api\.telegram\.org\/file\/bot/.test(s))return new Response(new Uint8Array([0xFF,0xD8,0xFF,0xE0,1,2,3,4]),{status:200,headers:{"Content-Type":"image/jpeg"}});
  if(s==="https://api.openai.com/v1/images/edits"){editCalls++;editSignal=o.signal||null;
    if(mode==="timeout"){if(!o.signal)return new Response("{}",{status:599});const e=new DOMException("The operation was aborted due to timeout","TimeoutError");throw e;}   // simulate the 45 s bound firing
    return new Response(JSON.stringify({error:{message:"test refusal"}}),{status:400,headers:{"Content-Type":"application/json"}});}
  return inner(u,o);};
{await call("/api/photo-autopilot/status",null,"GET");   // creates the media/photo tables like the dashboard does
 const now=new Date().toISOString();
 dbrun("INSERT INTO telegram_media_sources(id,chat_id,chat_username,message_id,file_id,file_unique_id,media_type,caption,source_kind,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",["SRC-1","-100","vault","1","fake-file-id","fake-unique-1","photo","test","vault",now,now]);
 const today=new Date().toISOString().slice(0,10),u0=q("SELECT COUNT(*) n FROM photo_autopilot_usage")[0].n,tg0=W.tg.filter(x=>/^send/.test(x.method)).length;
 const r=await call("/api/photo-autopilot/run",{});
 const lock=q("SELECT status FROM photo_autopilot_daily_lock WHERE date=?",[today]);
 const err=q("SELECT details_json FROM system_events WHERE type='photo_autopilot_error' ORDER BY created_at DESC LIMIT 1")[0];
 ok("T6 Photo Autopilot passes a bounded signal to the OpenAI image call (one call, not retried)",editCalls===1&&!!editSignal&&typeof editSignal.aborted==="boolean",[editCalls,!!editSignal]);
 ok("T7 when the bound fires: the request fails cleanly, the daily lock is RELEASED (not left 'reserved'), the error is audited with the timeout, no usage row, no image, nothing sent",r.status>=400&&lock.length===0&&/timed out after 45000 ms/.test(err?.details_json||"")&&q("SELECT COUNT(*) n FROM photo_autopilot_usage")[0].n===u0&&!q("SELECT 1 FROM media_vault_items WHERE source_type='ai_edit'").length&&W.tg.filter(x=>/^send/.test(x.method)).length===tg0,[r.status,lock,(err?.details_json||"").slice(0,120)]);
 // a released lock lets the next attempt run (no stuck 'reserved' row blocking it for an hour)
 mode="refusal";const r2=await call("/api/photo-autopilot/run",{});
 ok("T8 after a released lock the next attempt runs at once (no 'photo_generation_in_progress' block); a provider refusal also takes the same clean path",editCalls===2&&r2.status>=400&&q("SELECT status FROM photo_autopilot_daily_lock WHERE date=?",[today]).length===0,[editCalls,r2.status]);
 // file_unique_id dedup is untouched: the same source is still the selected (unused) one, nothing was marked used
 ok("T9 Telegram vault dedup by file_unique_id unchanged: no usage recorded for the failed source, so it stays eligible exactly once",q("SELECT COUNT(*) n FROM photo_autopilot_usage WHERE source_media_id='SRC-1'")[0].n===0,"");}
ok("ISOLATION only in-process mocks were called (no real Telegram file, OpenAI or network)",W.offNet().every(u=>/api\.telegram\.org|api\.openai\.com|w\.test/.test(u)),W.offNet().filter(u=>!/api\.telegram\.org|api\.openai\.com|w\.test/.test(u)));
process.exit(done()?1:0);
