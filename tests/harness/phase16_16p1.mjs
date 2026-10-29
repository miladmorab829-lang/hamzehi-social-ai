// PHASE 16.16-P1 — D-P1 weekly video prompt length. Kling omni-video rejects any multi_prompt storyboard prompt over 512 characters
// (Production 2026-W41/W43/W44: HTTP 400 "multiPrompt[0].prompt: size must be between 0 and 512"). The prompt builder now assembles
// each shot prompt by priority inside the limit; the weekly autopilot keeps its schedule, its one-job-per-week reservation and its
// rejection handling. Local only: Kling is an in-process mock (no paid call); in-memory D1; nothing leaves the machine.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,J,done}=reporter("phase16_16p1");
const started=Date.now();
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const KP=await import(pathToFileURL(path.join(SRC,"kling-prompt.js")).href);
const {buildKlingShotPrompt:build,klingShotPromptProblem:problem,clipPromptText:clip,KLING_SHOT_PROMPT_MAX:MAX,KLING_SHOT_PROMPT_BUDGET:BUDGET,KLING_PROMPT_IDENTITY:ID,KLING_PROMPT_OUTPUT:OUT,KLING_PROMPT_STYLE:STYLE}=KP;
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
async function world(){
  const W=await makeWorld({aiBrain:"off",extraEnv:{KLING_API_KEY:"kling-test-not-real",AUTONOMY_ORCHESTRATOR:"on",PUBLIC_WORKER_BASE_URL:"https://w.test"}});
  W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
  const AE=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+"?p1="+Math.random());await AE.autonomyMasterGate(W.env);
  await W.call("/api/autonomy/action",{module:"photo",action:"photo_generate",enabled:false});
  // Kling mock + self-routing, installed on top of the harness's own (offline) fetch for this world
  const inner=globalThis.fetch;
  globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);
    if(s.startsWith("https://w.test/"))return W.run(new Request(s,o));
    if(s.startsWith("https://api-singapore.klingai.com/")){
      if((o.method||"GET")==="POST"){const body=JSON.parse(String(o.body||"{}"));kling.push(body);
        if(klingMode==="reject")return new Response(JSON.stringify({code:1201,message:"multiPrompt[0].prompt: size must be between 0 and 512"}),{status:400});
        return new Response(JSON.stringify({code:0,data:{task_id:`kling-task-${kling.length}`,task_status:"submitted"}}),{status:200});}
      return new Response(JSON.stringify({code:0,data:{task_id:"kling-task-1",task_status:"processing"}}),{status:200});}
    return inner(u,o);};
  return W;}
const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;
const kling=[];let klingMode="accept";
const tick=async W=>{const p=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},W.env,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);};
{const W=await world();seedWeek(W,6);
 await tick(W);
 const row=W.q("SELECT week_id,status,task_id FROM weekly_video_autopilot")[0]||{};
 const body=kling[0]||{},mp=body.multi_prompt||[];
 ok("P15 autonomous weekly step submits ONE Kling job on the real scheduled path (no owner approval, no new gate)",kling.length===1&&row.status!=="kling_rejected"&&W.q("SELECT COUNT(*) n FROM agent_approvals")[0].n===0,{kling:kling.length,row});
 ok("P16 the submitted job has 6 storyboard prompts, each ≤ 512 characters and valid (the Production 400 cannot recur)",mp.length===6&&mp.every(x=>x.prompt.length<=MAX&&problem(x.prompt)===null),mp.map(x=>x.prompt.length));
 ok("P17 every storyboard prompt carries the product identity and output constraints; shot durations and model unchanged",mp.every(x=>x.prompt.includes(ID)&&x.prompt.includes(OUT))&&body.model_name==="kling-v3-omni"&&body.duration==="12"&&mp.reduce((s,x)=>s+Number(x.duration),0)===12,{model:body.model_name,duration:body.duration,d:mp.map(x=>x.duration)});
 ok("P18 the week's job is persisted with the Kling task id",row.task_id==="kling-task-1",row);
 const before=kling.length;await tick(W);await tick(W);
 ok("P19 no duplicate video job: two more scheduled ticks in the same week submit nothing (weekly reservation)",kling.length===before,kling.length-before);
 ok("P20 no scheduled step failed",W.q("SELECT COUNT(*) n FROM system_events WHERE type='scheduled_step_failed'")[0].n===0,W.q("SELECT details_json FROM system_events WHERE type='scheduled_step_failed'"));}
{const W=await world();seedWeek(W,3);klingMode="reject";const k0=kling.length;
 await tick(W);
 const row=W.q("SELECT status FROM weekly_video_autopilot")[0]||{};
 const ev=W.q("SELECT details_json FROM system_events WHERE type='weekly_video_autopilot_kling_rejected'").map(r=>JSON.parse(r.details_json));
 ok("P21 a provider rejection is still classified 'kling_rejected' with the provider's message (useful error), recorded once",row.status==="kling_rejected"&&ev.length===1&&/512/.test(ev[0].error)&&ev[0].http_status===400,{row,ev});
 await tick(W);
 ok("P22 a rejected week is not resubmitted automatically (deterministic rejection, no repeated spend)",kling.length===k0+1,kling.length-k0);
 ok("P23 nothing left the machine except the in-process mocks",!W.offNet().filter(u=>!u.startsWith("https://api-singapore.klingai.com/")).length,W.offNet());}

console.log(`phase16_16p1 time ${((Date.now()-started)/1000).toFixed(1)} s`);
process.exit(done()?1:0);
