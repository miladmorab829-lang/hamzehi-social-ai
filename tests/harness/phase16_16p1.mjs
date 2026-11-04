// PHASE 16.16-P1 — D-P1 weekly video prompt length, and the provider-neutral weekly pipeline that replaced Kling. A provider once rejected any
// storyboard prompt over 512 characters (Production 2026-W41/W43/W44: HTTP 400 "multiPrompt[0].prompt: size must be between 0 and 512"). The prompt
// builder assembles each shot prompt by priority inside that limit. With no provider selected the weekly step spends nothing; with one, it keeps its
// one-job-per-week reservation and rejection handling. Local only: the provider is an in-process fake; in-memory D1; nothing leaves the machine.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,J,done}=reporter("phase16_16p1");
const started=Date.now();
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const KP=await import(pathToFileURL(path.join(SRC,"weekly-video-prompt.js")).href);
const {buildWeeklyShotPrompt:build,weeklyShotPromptProblem:problem,clipPromptText:clip,WEEKLY_SHOT_PROMPT_MAX:MAX,WEEKLY_SHOT_PROMPT_BUDGET:BUDGET,WEEKLY_PROMPT_IDENTITY:ID,WEEKLY_PROMPT_OUTPUT:OUT,WEEKLY_PROMPT_STYLE:STYLE}=KP;
const brokenSurrogate=s=>/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

// The production inputs (worker/src/index.js buildWeeklyVideoCreativeBrief): 5 concept stories and 3 shot directions.
const STORIES=["A refined visual reveal of the real HAMZEHI BOX product through a sequence of premium luxury scenes.",
  "A cinematic presentation showing the product identity through elegant transitions and controlled camera movement.",
  "A sophisticated jewelry presentation focused on detail, atmosphere and premium packaging.",
  "A premium boutique-style visual journey presenting the real product in an exclusive environment.",
  "A dramatic luxury campaign built around controlled light, shadows, reflections and the real product."];
const DIRECTIONS=["Opening hero shot with slow cinematic camera movement.","Closing premium product shot with clean composition.","Elegant cinematic transition preserving exact product identity."];

// ---- reproduction: the builder as it was at bf101c4 (copied verbatim) exceeds 512 for EVERY production input
{const oldBuild=(shot,brief)=>[String(shot.direction||''),String(brief.story||''),'Preserve the exact real HAMZEHI BOX product identity from the referenced image.',
  'Preserve proportions, colors, materials and recognizable product details.','Premium luxury commercial cinematography.','Elegant controlled camera movement and refined lighting.',
  'No voice-over, no dialogue, no subtitles.','Use instrumental luxury cinematic music only. No vocals, no speech, no narration, no spoken words, no dialogue.',
  'End-card text is handled separately; do not generate text inside the scene.'].filter(Boolean).join(' ');
 const lens=STORIES.flatMap(story=>DIRECTIONS.map(direction=>oldBuild({direction},{story}).length));
 ok("P1 [reproduction] the previous builder produced 594–640-character prompts for all 15 production inputs — always over 512 (every week rejected)",lens.every(n=>n>MAX),[Math.min(...lens),Math.max(...lens)]);}

// ---- builder
{const all=STORIES.flatMap(story=>DIRECTIONS.map(direction=>({p:build({direction},{story}),direction,story})));
 ok("P2 normal: all 15 production inputs fit (≤ 500, below the 512 limit) and pass the boundary check",all.every(x=>x.p.length<=BUDGET&&problem(x.p)===null),all.map(x=>x.p.length));
 ok("P3 normal: nothing is cut for production inputs — direction, story, identity, style and output constraints all present in full",all.every(x=>x.p.includes(x.direction)&&x.p.includes(x.story)&&x.p.includes(ID)&&x.p.includes(STYLE)&&x.p.includes(OUT)&&!x.p.includes("…")));
 const exact=build({direction:"x".repeat(MAX)},{story:"y".repeat(MAX)},MAX);
 ok("P4 exactly at the provider limit: with the full 512 budget the prompt is at most 512 and valid",exact.length<=MAX&&problem(exact)===null,exact.length);
 ok("P5 boundary check: exactly 512 accepted, 513 refused, empty / whitespace refused",problem("a".repeat(512))===null&&/limit 512/.test(problem("a".repeat(513)))&&problem("")==="empty prompt"&&problem("   \n ")==="empty prompt");
 ok("P6 clip: text already at the budget is returned unchanged; one more character is shortened with an ellipsis",clip("a".repeat(100),100)==="a".repeat(100)&&clip("a".repeat(101),100).length<=100&&clip("a".repeat(101),100).endsWith("…"));
 const long=build({direction:"Opening hero shot "+"with slow cinematic camera movement ".repeat(40)},{story:"A refined reveal ".repeat(300)});
 ok("P7 overlength: very long direction and story → ≤ 500, identity and output constraints kept whole",long.length<=BUDGET&&long.includes(ID)&&long.includes(OUT)&&problem(long)===null,long.length);
 const longStory=build({direction:DIRECTIONS[0]},{story:"A refined reveal ".repeat(300)});
 ok("P8 priority: a long story is shortened (…) while the direction and brand style stay whole; a huge direction keeps its start and the story yields entirely",
   longStory.length<=BUDGET&&longStory.includes(DIRECTIONS[0])&&longStory.includes(STYLE)&&longStory.includes("A refined reveal")&&longStory.includes("…")
   &&long.startsWith("Opening hero shot")&&!long.includes("A refined reveal"),[longStory.length,long.slice(0,60)]);
 const fa=build({direction:"نمای افتتاحیه با حرکت آرام دوربین 🎥 و نور طلایی"},{story:"معرفی لوکس جعبه جواهر حمزه‌ای باکس — "+"قصه‌ای سینمایی از جزئیات و ظرافت ✨💎 ".repeat(30)});
 const ar=build({direction:"لقطة افتتاحية فاخرة بحركة كاميرا بطيئة"},{story:"عرض فاخر لعلبة المجوهرات 💍 "+"بإضاءة ذهبية ناعمة وتفاصيل دقيقة ".repeat(25)});
 ok("P9 Persian + emoji: within the limit, no broken surrogate, direction kept, mandatory text kept",fa.length<=BUDGET&&!brokenSurrogate(fa)&&fa.startsWith("نمای افتتاحیه")&&fa.includes(ID)&&fa.includes(OUT)&&problem(fa)===null,fa.length);
 ok("P10 Arabic + emoji: within the limit, no broken surrogate, mandatory text kept",ar.length<=BUDGET&&!brokenSurrogate(ar)&&ar.includes(ID)&&ar.includes(OUT)&&problem(ar)===null,ar.length);
 const emoji=clip("💎".repeat(60),11);
 ok("P11 a surrogate pair is never split when shortening",!brokenSurrogate(emoji)&&emoji.length<=11,[emoji,emoji.length]);
 const bare=[build({},{}),build(null,null),build({direction:"   "},{story:"\n\t "})];
 ok("P12 missing / null / whitespace-only optional fields → still a valid prompt with product identity, style and output constraints",bare.every(p=>p===`${ID} ${STYLE} ${OUT}`&&problem(p)===null),bare);
 ok("P13 mandatory product identity and output constraints are never shortened, whatever the input",[long,fa,ar,exact,...bare].every(p=>p.includes(ID)&&p.includes(OUT)));
 ok("P14 deterministic: the same input always gives the same prompt",build({direction:DIRECTIONS[0]},{story:STORIES[1]})===build({direction:DIRECTIONS[0]},{story:STORIES[1]}));}

// ---- end to end: the autonomous weekly video step on the real scheduled path, Kling mocked
const seedWeek=(W,n)=>{const t=new Date(Date.now()-3600e3).toISOString();
  W.d1.db.exec("CREATE TABLE IF NOT EXISTS photo_autopilot_usage (id TEXT PRIMARY KEY, source_media_id TEXT NOT NULL, cycle INTEGER NOT NULL, used_at TEXT NOT NULL, output_media_id TEXT, scene_prompt TEXT, status TEXT NOT NULL DEFAULT 'used', UNIQUE(source_media_id,cycle))");
  W.d1.db.exec("CREATE TABLE IF NOT EXISTS telegram_media_sources (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, chat_username TEXT, message_id TEXT NOT NULL, file_id TEXT NOT NULL, file_unique_id TEXT, media_type TEXT NOT NULL, caption TEXT, source_kind TEXT NOT NULL DEFAULT 'archive', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(chat_id,message_id,file_id))");
  for(let i=1;i<=n;i++){W.dbrun("INSERT INTO telegram_media_sources(id,chat_id,message_id,file_id,media_type,caption,source_kind,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",[`OUT-${i}`,"@vault",String(i),`file-${i}`,"photo","",'vault',t,t]);
    W.dbrun("INSERT INTO photo_autopilot_usage(id,source_media_id,cycle,used_at,output_media_id,scene_prompt,status) VALUES(?,?,?,?,?,?,?)",[`U-${i}`,`SRC-${i}`,1,t,`OUT-${i}`,"صحنه لوکس با نور طلایی و بازتاب "+"جزئیات ".repeat(80),"completed"]);}};
const PV=await import(pathToFileURL(path.join(SRC,"weekly-video-provider.js")).href);
async function world(extra={}){
  const W=await makeWorld({aiBrain:"off",extraEnv:{AUTONOMY_ORCHESTRATOR:"on",PUBLIC_WORKER_BASE_URL:"https://w.test",SHOTSTACK_API_KEY:"shotstack-test-not-real",...extra}});
  W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
  const AE=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+"?p1="+Math.random());await AE.autonomyMasterGate(W.env);
  await W.call("/api/autonomy/action",{module:"photo",action:"photo_generate",enabled:false});
  const inner=globalThis.fetch;
  globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);
    if(s.startsWith("https://w.test/"))return W.run(new Request(s,o));
    if(/klingai\.com/.test(s)){klingCalls.push(s);return new Response("{}",{status:500});}
    if(s.startsWith("https://api.shotstack.io/")&&(o.method||"GET")==="GET"){shotstackPolls.push(s);return new Response(JSON.stringify({success:true,response:{status:"rendering"}}),{status:200});}
    if(s.startsWith("https://api.shotstack.io/")&&(o.method||"GET")==="POST"){shotstack.push(JSON.parse(String(o.body||"{}")));return new Response(JSON.stringify({success:true,response:{id:"render-1"}}),{status:201});}
    return inner(u,o);};
  return W;}
const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;
const klingCalls=[],shotstack=[],shotstackPolls=[],jobs=[];let mode="accept",pollResult={status:"processing"};
PV.registerWeeklyVideoAdapter("test-video",{
  submit:async(env,job)=>{jobs.push(job);
    if(mode==="reject")throw PV.weeklyVideoSubmissionError("prompt refused by provider",{outcome:"rejected",http_status:400,response_category:"http_rejection",external_task_id:job.external_task_id});
    if(mode==="crash")throw Error("connection reset after send");
    if(mode==="no-task")return {http_status:200};
    return {task_id:"task-"+jobs.length,http_status:200,model:"test-model"};},
  poll:async()=>pollResult});
const tick=async W=>{const p=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},W.env,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);};
const stepFails=W=>W.q("SELECT COUNT(*) n FROM system_events WHERE type='scheduled_step_failed'")[0].n;
const LEGACY=[["2026-W01","kling_rejected"],["2026-W02","kling_submission_ambiguous"],["2026-W03","failed"]];
const seedLegacy=W=>{for(const [w,s] of LEGACY)W.dbrun("INSERT INTO weekly_video_autopilot(week_id,task_id,status,source_media_ids,scenario_json,music_id,output_media_id,caption,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",[w,null,s,'["OLD"]',"{}","","","","2026-01-01T00:00:00.000Z","2026-01-01T00:00:00.000Z"]);};

// ---- no provider selected (the state this release ships in)
{const W=await world({KLING_API_KEY:"left-on-the-worker"});seedWeek(W,6);await tick(W);seedLegacy(W);
 const before=JSON.stringify(W.q("SELECT * FROM weekly_video_autopilot ORDER BY week_id"));
 await tick(W);await tick(W);
 const ev=W.q("SELECT details_json FROM system_events WHERE type='weekly_video_autopilot_ineligible'").map(r=>JSON.parse(r.details_json));
 ok("P15 no provider: the week is NOT reserved, so a provider chosen later can still run it",W.q("SELECT COUNT(*) n FROM weekly_video_autopilot WHERE week_id NOT LIKE '2026-W0_'")[0].n===0);
 ok("P16 no provider: the reason is recorded once per week, not on every tick",ev.length===1&&ev[0].reason==="video_provider_not_selected",ev);
 ok("P17 no provider: no adapter call, no Kling or Shotstack call even with KLING_API_KEY still on the Worker, no scheduled step failed",jobs.length===0&&klingCalls.length===0&&shotstack.length===0&&stepFails(W)===0,[jobs.length,klingCalls,shotstack.length,stepFails(W)]);
 ok("P17b the other scheduled tasks in the same chain still run: the autopilot cycle is recorded on every tick",W.q("SELECT COUNT(*) n FROM system_events WHERE type='auto_pilot_cycle'")[0].n>=3,W.q("SELECT COUNT(*) n FROM system_events WHERE type='auto_pilot_cycle'")[0].n);
 W.dbrun("INSERT INTO system_events(id,type,severity,message,details_json,created_at) VALUES(?,?,?,?,?,?)",["old-kling","weekly_video_autopilot_kling_rejected","info","old",JSON.stringify({week_id:"2026-W01",error:"old rejection"}),"2026-01-01T00:00:00.000Z"]);
 const status=await W.call("/api/video-autopilot/status",null,"GET"),activity=await W.call("/api/video-autopilot/activity",null,"GET");
 ok("P18b existing video history stays readable: status and activity work, and old Kling events are still listed",status.body.ok!==false&&activity.body.ok!==false&&JSON.stringify(activity.body).includes("kling_rejected"),[status.status,activity.status]);
 ok("P18 history is preserved: old Kling rows are unchanged after more ticks",JSON.stringify(W.q("SELECT * FROM weekly_video_autopilot ORDER BY week_id"))===before);
 W.dbrun("INSERT INTO weekly_video_autopilot(week_id,task_id,status,source_media_ids,scenario_json,music_id,output_media_id,caption,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",["2026-W04","old-task","generating",'["OLD"]',"{}","","","","2026-01-02T00:00:00.000Z","2026-01-02T00:00:00.000Z"]);
 await tick(W);await tick(W);
 const row=W.q("SELECT status,task_id,updated_at FROM weekly_video_autopilot WHERE week_id='2026-W04'")[0];
 ok("P19 a job still marked generating with no provider to poll stays untouched and is reported once, without a failure",row.status==="generating"&&row.task_id==="old-task"&&row.updated_at==="2026-01-02T00:00:00.000Z"&&stepFails(W)===0&&W.q("SELECT COUNT(*) n FROM system_events WHERE type='weekly_video_autopilot_ineligible' AND details_json LIKE '%poll:video_provider_not_selected%'")[0].n===1,row);
 W.env.WEEKLY_VIDEO_PROVIDER="not-registered";await tick(W);
 ok("P20 an unknown provider name behaves as no provider",jobs.length===0&&stepFails(W)===0,stepFails(W));}

// ---- Shotstack is not touched: with no video provider, a render already in progress is still followed through Shotstack
{const W=await world();await tick(W);W.dbrun("INSERT INTO weekly_video_autopilot(week_id,task_id,shotstack_task_id,status,source_media_ids,scenario_json,music_id,output_media_id,caption,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",["2026-W05","old-task","render-in-progress","compositing",'["OLD"]',"{}","","","","2026-01-03T00:00:00.000Z","2026-01-03T00:00:00.000Z"]);
 const before=shotstackPolls.length;await tick(W);
 ok("P20b with no video provider, a Shotstack render in progress is still polled through Shotstack, with no failure",shotstackPolls.length>before&&shotstackPolls.at(-1).includes("render-in-progress")&&W.q("SELECT status FROM weekly_video_autopilot WHERE week_id='2026-W05'")[0].status==="compositing"&&stepFails(W)===0,[shotstackPolls.length-before,stepFails(W)]);}

// ---- provider selected (in-process fake)
{const W=await world({WEEKLY_VIDEO_PROVIDER:"test-video"});seedWeek(W,6);
 await tick(W);
 const row=W.q("SELECT week_id,status,task_id FROM weekly_video_autopilot")[0]||{},job=jobs[0]||{},shots=job.shots||[];
 ok("P21 the weekly step submits ONE job on the real scheduled path (no owner approval, no new gate)",jobs.length===1&&W.q("SELECT COUNT(*) n FROM agent_approvals")[0].n===0,jobs.length);
 ok("P22 every shot is bound to its own source image, and the six images are all different",shots.length===6&&new Set(shots.map(x=>x.image_url)).size===6&&shots.every(x=>x.source_media_id&&x.image_url.includes(x.source_media_id)),shots.map(x=>x.image_url));
 ok("P23 every prompt is valid, ≤ 512, and carries the product identity (foam, ribbons, background) and output constraints",shots.every(x=>x.prompt.length<=MAX&&problem(x.prompt)===null&&x.prompt.includes(ID)&&x.prompt.includes(OUT))&&/foam, ribbons/.test(ID)&&/background/.test(ID),shots.map(x=>x.prompt.length));
 ok("P24 the week's job is persisted with the task id",row.status==="generating"&&row.task_id==="task-1",row);
 const before=jobs.length;await tick(W);await tick(W);
 ok("P25 no duplicate video job: two more ticks in the same week submit nothing",jobs.length===before,jobs.length-before);
 pollResult={status:"completed",video_url:"https://video.test/out.mp4",duration:12};await tick(W);
 const done2=W.q("SELECT status,shotstack_task_id FROM weekly_video_autopilot")[0];
 ok("P26 a completed video goes on to the existing Shotstack composition with its URL",done2.status==="compositing"&&done2.shotstack_task_id==="render-1"&&JSON.stringify(shotstack[0]||{}).includes("https://video.test/out.mp4"),[done2,shotstack.length]);
 ok("P27 no scheduled step failed",stepFails(W)===0,W.q("SELECT details_json FROM system_events WHERE type='scheduled_step_failed'"));
 pollResult={status:"processing"};}
{const W=await world({WEEKLY_VIDEO_PROVIDER:"test-video"});seedWeek(W,3);pollResult={status:"failed",status_message:"moderation"};await tick(W);
 ok("P28 a provider failure ends the week as failed with the provider's message",W.q("SELECT status FROM weekly_video_autopilot")[0].status==="failed"&&/moderation/.test(W.q("SELECT details_json FROM system_events WHERE type='weekly_video_autopilot_failed'")[0]?.details_json||""));
 pollResult={status:"processing"};}
{const W=await world({WEEKLY_VIDEO_PROVIDER:"test-video"});seedWeek(W,3);mode="reject";const j0=jobs.length;
 await tick(W);
 const row=W.q("SELECT status FROM weekly_video_autopilot")[0]||{};
 const ev=W.q("SELECT details_json FROM system_events WHERE type='weekly_video_autopilot_provider_rejected'").map(r=>JSON.parse(r.details_json));
 ok("P29 a definite rejection is classified video_rejected with the provider's message, recorded once",row.status==="video_rejected"&&ev.length===1&&/refused/.test(ev[0].error)&&ev[0].http_status===400,[row,ev]);
 await tick(W);
 ok("P30 a rejected week is not resubmitted (no repeated spend)",jobs.length===j0+1,jobs.length-j0);}
for(const [m,label] of [["crash","an adapter crash"],["no-task","an accepted response without a task id"]]){const W=await world({WEEKLY_VIDEO_PROVIDER:"test-video"});seedWeek(W,3);mode=m;const j0=jobs.length;
 await tick(W);await tick(W);
 ok("P31 "+label+" is ambiguous and is never retried (the job may have been billed)",W.q("SELECT status FROM weekly_video_autopilot")[0].status==="video_submission_ambiguous"&&jobs.length===j0+1&&W.q("SELECT COUNT(*) n FROM system_events WHERE type='weekly_video_autopilot_provider_submission_ambiguous'")[0].n===1,W.q("SELECT status FROM weekly_video_autopilot"));}
mode="accept";
{const W=await world({WEEKLY_VIDEO_PROVIDER:"test-video"});seedWeek(W,3);const j0=jobs.length,orig=W.env.DB.prepare.bind(W.env.DB);
 let fails=3;   // the three persistence attempts fail; the recovery write after them succeeds
 W.env.DB.prepare=sql=>{if(fails>0&&/SET status=\?, task_id=\?, updated_at=\?/.test(String(sql))){fails--;throw new Error("simulated D1 failure");}return orig(sql);};
 await tick(W);W.env.DB.prepare=orig;await tick(W);
 const row=W.q("SELECT status,task_id FROM weekly_video_autopilot")[0]||{};
 const ev=W.q("SELECT details_json FROM system_events WHERE type='weekly_video_autopilot_provider_submission_ambiguous'").map(r=>JSON.parse(r.details_json));
 ok("P35 accepted by the provider but the task id cannot be saved: ambiguous, task id kept, never retried",row.status==="video_submission_ambiguous"&&row.task_id===`task-${j0+1}`&&jobs.length===j0+1&&ev.length===1&&ev[0].stage==="provider_task_persistence",[row,ev]);}

// ---- Kling is gone from the code; what remains only reads history
{const all=fs.readdirSync(SRC).filter(f=>f.endsWith(".js")).map(f=>[f,fs.readFileSync(path.join(SRC,f),"utf8")]);
 ok("P32 no Kling client, endpoint, API path, model or key is left in worker/src",!all.some(([,s])=>/klingai|omni-video|kling-v3|KLING_API_KEY|createKling|getKling/.test(s)),all.filter(([,s])=>/klingai\.com|KLING_API_KEY/.test(s)).map(x=>x[0]));
 const idx=all.find(([f])=>f==="index.js")[1].split("\n").filter(l=>/kling/i.test(l));
 ok("P33 index.js mentions Kling only in the two read-only history lists (8 event names)",idx.length===8&&idx.every(l=>/^\s*'weekly_video_autopilot_kling_[a-z_]+',$/.test(l)),idx);
 const UI=await import(pathToFileURL(path.join(SRC,"live-dashboard-page.js")).href+"?p1ui="+Date.now());const page=UI.liveDashboardHtml("media")+String(UI.dashboardScript?.()||"");
 const ui=all.find(([f])=>f==="live-dashboard-page.js")[1];
 ok("P34 the dashboard shows the new statuses and can still label old Kling rows",/video_rejected:"Video Rejected"/.test(ui)&&/kling_rejected:"Kling Rejected"/.test(ui)&&!/Kling\/Shotstack/.test(ui)&&!/Kling task:/.test(ui)&&typeof page==="string");}

ok("P35a across every world in this suite, with and without a provider, no request reached Kling",klingCalls.length===0,klingCalls);
{const SRCFILES=fs.readdirSync(SRC).filter(f=>f.endsWith(".js")).map(f=>fs.readFileSync(path.join(SRC,f),"utf8")).join("\n");
 ok("P35b the Shotstack client and key are still in place, and the OpenAI image edit call is unchanged",/https:\/\/api\.shotstack\.io\/edit\/stage\/render/.test(SRCFILES)&&/env\.SHOTSTACK_API_KEY/.test(SRCFILES)&&/createShotstackWeeklyEndCardTask/.test(SRCFILES)&&/api\.openai\.com\/v1\/images\/edits/.test(SRCFILES));}

console.log(`phase16_16p1 time ${((Date.now()-started)/1000).toFixed(1)} s`);
process.exit(done()?1:0);
