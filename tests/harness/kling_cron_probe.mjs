// Before/after probe for the Kling patch: runs the same scheduled ticks and the same photo run, and prints every external host called and
// every event type recorded, so the code before and after the patch can be compared. Local only: every provider is an in-process mock.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld} from "./harness.mjs";
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const W=await makeWorld({aiBrain:"off",extraEnv:{KLING_API_KEY:"test-not-real",OPENAI_API_KEY:"test-not-real",SHOTSTACK_API_KEY:"test-not-real",AUTONOMY_ORCHESTRATOR:"on",PUBLIC_WORKER_BASE_URL:"https://w.test",TELEGRAM_VAULT_CHAT_ID:"@vault_test",TELEGRAM_VIDEO_VAULT_CHAT_ID:"@vault_test"}});
const {q,dbrun,call}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
const AE=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+"?probe="+Math.random());await AE.autonomyMasterGate(W.env);
const hosts={},hit=h=>{hosts[h]=(hosts[h]||0)+1;};
const PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const J=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{"Content-Type":"application/json"}});
const inner=globalThis.fetch;
globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u),m=o.method||u?.method||"GET";
  if(s.startsWith("https://w.test/"))return W.run(new Request(s,o));
  if(/klingai\.com/.test(s)){hit("kling "+m);return m==="POST"?J({code:0,data:{task_id:"k1",task_status:"submitted"}}):J({code:0,data:{task_id:"k1",task_status:"succeed",task_result:{videos:[{url:"https://video.test/k.mp4",duration:12}]}}});}
  if(/api\.shotstack\.io/.test(s)){hit("shotstack "+m);return m==="POST"?J({success:true,response:{id:"r1"}},201):J({success:true,response:{status:"rendering"}});}
  if(s==="https://api.openai.com/v1/images/edits"){hit("openai images");return J({data:[{b64_json:PNG}]});}
  if(/api\.openai\.com/.test(s)){hit("openai text");return J({output_text:"test",output:[{content:[{type:"output_text",text:"test"}]}]});}
  if(/api\.telegram\.org\/bot[^/]+\/getFile/.test(s))return J({ok:true,result:{file_path:"photos/fake.jpg"}});
  if(/api\.telegram\.org\/file\/bot/.test(s))return new Response(new Uint8Array([0xFF,0xD8,0xFF,0xE0,1,2,3,4]),{status:200,headers:{"Content-Type":"image/jpeg"}});
  return inner(u,o);};
const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;
const tick=async cron=>{const p=[];await WK.scheduled({cron,scheduledTime:Date.now()},W.env,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);};
await call("/api/photo-autopilot/status",null,"GET");
const t=new Date(Date.now()-3600e3).toISOString();
for(let i=1;i<=6;i++){dbrun("INSERT INTO telegram_media_sources(id,chat_id,message_id,file_id,media_type,caption,source_kind,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",[`OUT-${i}`,"@vault",String(i),`file-${i}`,"photo","",'vault',t,t]);
  dbrun("INSERT INTO photo_autopilot_usage(id,source_media_id,cycle,used_at,output_media_id,scene_prompt,status) VALUES(?,?,?,?,?,?,?)",[`U-${i}`,`SRC-${i}`,1,t,`OUT-${i}`,"scene","completed"]);}
dbrun("INSERT INTO telegram_media_sources(id,chat_id,chat_username,message_id,file_id,file_unique_id,media_type,caption,source_kind,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",["SRC-NEW","-100","vault","99","fake-file","uniq-99","photo","",'vault',t,t]);
const mediaBefore=JSON.stringify(q("SELECT id,file_id,media_type,source_kind FROM telegram_media_sources WHERE id LIKE 'OUT-%' ORDER BY id"));
await tick("*/15 * * * *");await tick("*/15 * * * *");await tick("0 7 * * *");await tick("*/15 * * * *");
const photo=await call("/api/photo-autopilot/run",{});
if(process.env.PROBE_DEBUG)console.error(JSON.stringify(q("SELECT type,substr(details_json,1,300) d FROM system_events WHERE type LIKE '%error%' OR type LIKE '%failed%'")),JSON.stringify(photo.body).slice(0,300));
const events=[...new Set(q("SELECT type FROM system_events").map(r=>r.type))].sort();
console.log(JSON.stringify({hosts:Object.fromEntries(Object.entries(hosts).sort()),events,photo_status:photo.status,photo_usage:q("SELECT COUNT(*) n FROM photo_autopilot_usage WHERE status='completed'")[0].n,step_failures:q("SELECT details_json FROM system_events WHERE type='scheduled_step_failed'").map(r=>JSON.parse(r.details_json).step),video_rows:q("SELECT status FROM weekly_video_autopilot").map(r=>r.status),media_unchanged:mediaBefore===JSON.stringify(q("SELECT id,file_id,media_type,source_kind FROM telegram_media_sources WHERE id LIKE 'OUT-%' ORDER BY id"))},null,1));
process.exit(0);
