// LOCAL DASHBOARD PREVIEW (offline). Runs the real Worker code on the harness (node:sqlite) with DEMO data only.
// • Binds to 127.0.0.1 only · test admin token "tok" (harness value, not a credential) · no cron
// • Every outbound request is refused (Telegram/AI are the harness in-process mocks) · Production D1, secrets and paid APIs are never used
// • Every HTML page gets a DEMO DATA banner and every response an X-Data-Source: demo header, so sample values are never mistaken for
//   Production values. The banner is injected here, in the preview only — the Worker code has no demo flag or auth bypass.
// Usage (from tests/harness):  node preview-server.mjs [port=8799]
import http from "node:http";import fs from "node:fs";import path from "node:path";import {fileURLToPath} from "node:url";
import {makeWorld} from "./harness.mjs";
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const PORT=Number(process.argv[2]||8799);
const W=await makeWorld();const {dbrun,q}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
const mocked=globalThis.fetch,blocked=[];
globalThis.fetch=async(u,o)=>{const s=String(u?.url||u);if(/^https:\/\/api\.(telegram\.org|anthropic\.com)\//.test(s))return mocked(u,o);blocked.push(s.slice(0,80));return new Response(JSON.stringify({ok:false,error:"blocked in local preview"}),{status:503,headers:{"Content-Type":"application/json"}});};
// ---- DEMO data (shaped like the 2026-10-21 audit; not real) ----
const NOW=Date.now(),ago=m=>new Date(NOW-m*60000).toISOString();let n=0;
await W.run(new Request("https://w.test/api/autonomy/status",{headers:{Authorization:"Bearer tok"}}));
const task=(m,a,st,at,err=null)=>dbrun("INSERT INTO autonomy_tasks(id,command_id,module,action,status,priority,payload_json,error,attempts,finished_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",["T"+(++n),"c",m,a,st,40,"{}",err,1,st==="queued"?null:at,at,at]);
const evt=(t,at,d)=>dbrun("INSERT INTO system_events(id,type,severity,message,details_json,created_at) VALUES(?,?,?,?,?,?)",["E"+(++n),t,"info","demo",JSON.stringify(d||{}),at]);
task("website","growth_scan","completed",ago(26*1440));task("learning","run","completed",ago(26*1440));task("crm","lead_intelligence","completed",ago(26*1440));task("telegram","inbox_scan","completed",ago(26*1440));
task("ads","discover_opportunities","failed",ago(26*1440),"demo old failure");task("photo","photo_generate","failed",ago(24*1440),"Unsupported Telegram image MIME type: application/octet-stream");
task("photo","photo_generate","completed",ago(1400));task("photo","photo_generate","failed",ago(120),"demo paid failure");const paidT="T"+n;task("crm","lead_intelligence","failed",ago(110),"demo read failure");const readT="T"+n;
for(const k of [37,22,7]){for(const m of ["telegram","whatsapp","instagram","website","crm","ads","content","media","photo","learning"])task(m,"status","completed",ago(k));task("revenue","funnel_snapshot","completed",ago(k));}
evt("media_ai_video_generated",ago(25*1440),{});evt("inbound_outcome",ago(13*1440),{});evt("weekly_video_autopilot_kling_rejected",ago(3*1440),{error:"multiPrompt[0].prompt: size must be between 0 and 512"});
evt("photo_autopilot_completed",ago(1400),{});evt("auto_content_generated",ago(300),{});evt("analyze_optimize_cycle",ago(70),{samples:3});evt("ad_autopilot_run",ago(80),{found:3,drafted:1,errors:0,city:""});
evt("ads_run_deferred",ago(7),{});evt("auto_pilot_cycle",ago(7),{pending_review:63,hold_reason:"nothing_generated"});
dbrun("INSERT INTO inbox_messages(id,platform,sender,message,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",["M1","telegram","demo","demo","new",ago(13*1440),ago(13*1440)]);
W.d1.db.exec("CREATE TABLE IF NOT EXISTS system_kv(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)");
dbrun("INSERT OR REPLACE INTO system_kv(key,value,updated_at) VALUES(?,?,?)",["ads_autopilot_config",JSON.stringify({enabled:true,type:"gold",city:""}),ago(1)]);
const al=(id,agent,code,level,st,ack,occ,cause,fb)=>dbrun("INSERT INTO agent_alerts(id,scheduler,code,agent,level,cause_redacted,affected_tasks_json,fallback_status,recovery_state,recovered_at,first_seen_at,last_seen_at,occurrences,acknowledged_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,"watchdog",code,agent,level,cause,JSON.stringify(["T5","T6"]),fb,st,st==="recovered"?ago(1000):null,ago(3000),ago(st==="open"?20:1100),occ,ack]);
al("AL-demo-1","autonomy:photo","agent_failing","warning","open",null,3,"3 failed task(s) today (demo)","Other agents continue; failed tasks are in the dead-letter queue");
al("AL-demo-2","autonomy:photo","agent_failing","warning","recovered",ago(900),5,"demo history","Other agents continue");
al("AL-demo-3","orchestrator","heartbeat_stale","critical","open",ago(10),1,"Heartbeat older than 35 min (demo)","Queued tasks wait; customer replies, publishing gates and owner approvals are not affected");
const dl=(id,tid,agent)=>dbrun("INSERT INTO agent_dead_letters(id,run_id,task_id,agent,state,attempts,error_redacted,created_at) VALUES(?,?,?,?,?,?,?,?)",[id,"r",tid,agent,"failed",1,"demo failure (redacted)",ago(100)]);
dl("DL-demo-0001",paidT,"autonomy:photo");dl("DL-demo-0002",readT,"autonomy:crm");
for(const m of ["telegram","whatsapp","instagram","website","crm","ads","content","media","photo","learning","revenue"])dbrun("INSERT INTO agent_versions(agent,version,status,activated_at) VALUES(?,?,?,?)",["autonomy:"+m,"autonomy-engine@1.0.0+stage3.2","active",ago(2*1440)]);
dbrun("INSERT INTO agent_versions(agent,version,status,activated_at) VALUES(?,?,?,?)",["autonomy:photo","autonomy-engine@1.0.0+stage3.1","previous",ago(9*1440)]);
dbrun("INSERT OR REPLACE INTO agent_heartbeat(scheduler,last_run_id,last_finished_at,healthy) VALUES('autonomy','r',?,1),('watchdog','w',?,1)",[ago(7),ago(7)]);
// ---- HTTP bridge (127.0.0.1 only) ----
const BANNER="<div role='alert' style='position:sticky;top:0;z-index:60;background:#b45309;color:#fff;font-weight:800;text-align:center;padding:8px 12px;font-size:13px'>⚠️ DEMO DATA — پیش‌نمایش محلی با داده نمونه. هیچ عددی واقعی یا مربوط به Production نیست. (توکن تستی: tok)</div>";
http.createServer(async(req,res)=>{try{const body=["GET","HEAD"].includes(req.method)?undefined:await new Promise(r=>{const c=[];req.on("data",x=>c.push(x));req.on("end",()=>r(Buffer.concat(c)))});
  const r=await W.run(new Request("https://w.test"+req.url,{method:req.method,headers:req.headers,body}));
  const h={};r.headers.forEach((v,k)=>{h[k]=v});if(r.status>=300&&r.status<400&&h.location)h.location=h.location.replace("https://w.test","");
  h["x-data-source"]="demo";let buf=Buffer.from(await r.arrayBuffer());
  if(String(h["content-type"]||"").includes("text/html")){buf=Buffer.from(buf.toString("utf8").replace("<body>","<body>"+BANNER).replace("<title>","<title>[DEMO] "));delete h["content-length"];}
  res.writeHead(r.status,h);res.end(buf);}catch(e){res.writeHead(500);res.end("preview error: "+e.message)}
}).listen(PORT,"127.0.0.1",()=>console.log(`PREVIEW READY http://127.0.0.1:${PORT}/dashboard/agents (DEMO data · admin token: tok) · tasks ${q("SELECT COUNT(*) n FROM autonomy_tasks")[0].n}`));
setInterval(()=>{if(blocked.length)console.log("blocked outbound:",blocked.splice(0).join(" | "))},10000);
