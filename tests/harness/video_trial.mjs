// VIDEO TRIAL — Wan 2.6 Image-to-Video Flash through fal.ai, owner-approved clips only. Synthetic data; fal.ai, Telegram file
// downloads and the result CDN are mocked here, and every outbound call is counted. No real key, no paid call, no real video.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("video_trial");
const crashed=e=>{console.log("CRASH",String(e?.message||e).slice(0,200));try{done();}catch{}process.exit(1);};
process.on("uncaughtException",crashed);process.on("unhandledRejection",crashed);
const consoleOut=[];for(const k of ["log","warn","error","info"]){const o=console[k].bind(console);console[k]=(...a)=>{consoleOut.push(a.map(String).join(" "));o(...a);};}
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const V=await import(pathToFileURL(path.join(SRC,"video-trial.js")).href);
const KEY="fal-SENTINEL-7f3a:9c1e5b77d0aa",VAULT="-1007777";
const W=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on",FAL_KEY:KEY,TELEGRAM_VAULT_CHAT_ID:VAULT}});
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
for(const p of ["/api/autonomy/status","/api/agents/overview","/api/video-trial/sources"])await W.call(p,null,"GET");
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/phase25-delete-system/01-migration.sql"),"utf8"));
const {q,dbrun}=W,n=(sql,a=[])=>q(sql,a)[0].n,OLD="2026-10-01T00:00:00.000Z";
const media=(id,kind="vault",type="photo")=>dbrun("INSERT INTO telegram_media_sources(id,chat_id,chat_username,message_id,file_id,file_unique_id,media_type,caption,source_kind,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",[id,"-100","","m"+id,"FILE_"+id,"U"+id,type,"cap "+id,kind,OLD,OLD]);
for(const id of ["orig1","orig2","orig3","orig4","orig5","orig6","orig7","orig8","orig9","orig10","orig11","orig12"])media(id);
media("out1");dbrun("INSERT INTO media_vault_items(id,telegram_media_id,source_type,ai_status,parent_media_id,created_at,updated_at) VALUES('v1','out1','ai','done','orig1',?,?)",[OLD,OLD]);
media("out2");dbrun("INSERT INTO photo_autopilot_usage(id,source_media_id,cycle,used_at,output_media_id,status) VALUES('u1','orig2',1,?,'out2','used')",[OLD]);
media("cust1","customer");media("vid1","vault","video");media("hidden1");
dbrun("INSERT INTO cleanup_trash(id,section,record_id,op_id,prior_json,state,deleted_by,deleted_at) VALUES('tr1','vault','hidden1','op1','{}','trashed','admin',?)",[OLD]);

const BASE={};for(const t of ["weekly_video_autopilot","contents","lead_outreach","content_distribution"]){try{BASE[t]=n(`SELECT COUNT(*) n FROM ${t}`);}catch{}}
// --- mocked outside world: fal.ai queue, Telegram file download, fal result CDN ---
const FAL={submits:[],gets:[],submit:"ok",status:"IN_QUEUE",result:{video:{url:"https://v3.fal.media/files/abc/clip.mp4"}},cdn:[],cdnType:"video/mp4",cdnBytes:2048,fileSize:5000,getFile:"ok",bytes:"jpeg",sendChats:[]};
const JPEG=new Uint8Array([0xFF,0xD8,0xFF,0xE0,1,2,3,4,5,6,7,8,9,10,0xFF,0xD9]),MARK=btoa(String.fromCharCode(...JPEG)).slice(0,12);
const inner=globalThis.fetch,calls=[];
globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u),h={...(o.headers||{})};calls.push({url:s,auth:h.Authorization||h.authorization||null});
 if(s.startsWith("https://queue.fal.run/")){
  if((o.method||"GET")==="POST"){FAL.submits.push({url:s,auth:h.Authorization,body:JSON.parse(String(o.body||"{}")),redirect:o.redirect});const m=FAL.submit;
   if(m==="network")throw new TypeError("fetch failed");if(m==="timeout")throw Object.assign(new Error("t"),{name:"TimeoutError"});
   const st={ok:200,r400:400,r401:401,r402:402,r403:403,r422:422,a408:408,a429:429,a500:500,a503:503,redirect:302,noid:200,bad:200}[m]??200;
   const rid="req-"+(FAL.submits.length).toString().padStart(8,"0"),app="https://queue.fal.run/wan/v2.6/requests/"+rid;
   const body=m==="noid"?{status:"IN_QUEUE"}:m==="bad"?"{oops":m==="evilurls"?{request_id:rid,status_url:"https://evil.com/requests/x/status",response_url:"http://queue.fal.run/requests/x"}:{request_id:rid,status:"IN_QUEUE",status_url:app+"/status",response_url:app};
   return new Response(typeof body==="string"?body:JSON.stringify(body),{status:st,headers:{"Content-Type":"application/json"}});}
  FAL.gets.push({url:s,auth:h.Authorization});
  if(s.endsWith("/status"))return Response.json({status:FAL.status});
  return Response.json(FAL.result);}
 if(/\.fal\.media\//.test(s)){FAL.cdn.push({url:s,auth:h.Authorization||null,redirect:o.redirect});return new Response(new Uint8Array(FAL.cdnBytes),{status:200,headers:{"Content-Type":FAL.cdnType}});}
 if(/api\.telegram\.org\/bot[^/]+\/getFile/.test(s)){if(FAL.getFile==="fail")return new Response("x",{status:502});return Response.json({ok:true,result:{file_id:"x",file_path:"photos/p.jpg",file_size:FAL.fileSize}});}
 if(/api\.telegram\.org\/file\/bot/.test(s))return FAL.bytes==="text"?new Response("<html>not an image</html>",{status:200}):new Response(JPEG,{status:200});
 if(/api\.telegram\.org\/bot[^/]+\/send/.test(s))FAL.sendChats.push(o.body instanceof FormData?String(o.body.get("chat_id")):(()=>{try{return String(JSON.parse(String(o.body||"{}")).chat_id)}catch{return "?"}})());
 return inner(u,o);};
const responses=[];
const api=async(p,b,m="POST")=>{const r=await W.call(p,b,m);responses.push(JSON.stringify(r.body||{}));return r;};
const submits=()=>FAL.submits.length,clip=id=>q("SELECT * FROM video_trial_clips WHERE id=?",[id])[0];
const tick=async()=>{const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href+"?t="+Math.random())).default,ws=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},W.env,{waitUntil:p=>ws.push(p)});await Promise.allSettled(ws);};

// 1. which photos may be animated
{const r=await api("/api/video-trial/sources",null,"GET"),ids=(r.body.items||[]).map(x=>x.id).sort();
 ok("A1 only original vault photos are offered (no AI output, no Photo Autopilot output, no customer media, no video, no Trash)",ids.join()===["orig1","orig10","orig11","orig12","orig2","orig3","orig4","orig5","orig6","orig7","orig8","orig9"].join(),ids);
 const un=await W.run(new Request("https://w.test/api/video-trial/sources"));ok("A2 every route needs the admin login",un.status===401);
 for(const [p,m] of [["/api/video-trial/status","GET"],["/api/video-trial/preview","POST"],["/api/video-trial/execute","POST"],["/api/video-trial/redeliver","POST"]]){const x=await W.run(new Request("https://w.test"+p,{method:m,headers:{"Content-Type":"application/json"},body:m==="POST"?"{}":undefined}));ok("A2b "+p+" refuses without login",x.status===401);}
 const wm=await W.call("/api/video-trial/preview",null,"GET");ok("A2c a wrong method starts nothing",wm.status===404&&submits()===0);
 for(const id of ["out1","out2","cust1","vid1","hidden1","nope",""]){const p=await api("/api/video-trial/preview",{source_media_id:id});ok("A3 refused as a source: "+(id||"(empty)"),p.status===400&&p.body.error==="source_not_approved",p.body);}
 ok("A4 refusals start nothing",submits()===0&&n("SELECT COUNT(*) n FROM video_trial_clips")===0);}
// 2. the owner's two steps
let c1;{const p=await api("/api/video-trial/preview",{source_media_id:"orig1"});c1=p.body;
 ok("B1 preview shows price, budget, 720p 5 s, the checklist and a phrase",p.status===200&&c1.cost_usd===0.25&&c1.budget_left_usd===2&&c1.resolution==="720p"&&c1.duration_seconds===5&&c1.acceptance.length===7&&/^ساخت ویدیو \d{4}$/.test(c1.confirm_phrase),c1);
 ok("B2 a preview sends nothing to fal.ai",submits()===0);
 ok("B3 the token is stored only as a hash",!q("SELECT token_hash FROM video_trial_clips")[0].token_hash.includes(c1.token));
 const w=await api("/api/video-trial/execute",{token:c1.token,confirm:"ساخت ویدیو 0000"});ok("B4 a wrong phrase is refused and spends nothing",w.status===400&&w.body.error==="confirmation_mismatch"&&submits()===0&&clip(c1.clip_id).status==="previewed");
 const u=await api("/api/video-trial/execute",{token:"ffff",confirm:c1.confirm_phrase});ok("B5 an unknown token is refused",u.status===404&&submits()===0);
 const fa=c1.confirm_phrase.replace(/\d/g,d=>String.fromCharCode(0x06F0+Number(d)));
 const x=await api("/api/video-trial/execute",{token:c1.token,confirm:fa});
 ok("B6 the phrase typed with Persian digits is accepted; one clip submitted",x.status===200&&x.body.status==="submitted"&&submits()===1,x.body);
 const s=FAL.submits[0];
 ok("B7 the request goes to the approved endpoint only",s.url==="https://queue.fal.run/wan/v2.6/image-to-video/flash"&&s.redirect==="manual");
 ok("B8 settings: 720p, 5 s, no prompt rewriting, single shot, silent, fixed seed",s.body.resolution==="720p"&&s.body.duration==="5"&&s.body.enable_prompt_expansion===false&&s.body.multi_shots===false&&s.body.generate_audio===false&&Number.isInteger(s.body.seed));
 ok("B9 the fixed prompt keeps the box unchanged",s.body.prompt===V.VIDEO_TRIAL_PROMPT&&/same shape, proportions, edges, colors, materials, logo/.test(s.body.prompt)&&/changed logo/.test(s.body.negative_prompt)&&s.body.prompt.length<=1500&&s.body.negative_prompt.length<=500);
 ok("B10 the photo goes as a data URI, not as a public link",s.body.image_url.startsWith("data:image/jpeg;base64,")&&!/https?:/.test(s.body.image_url));
 ok("B11 the bot token and the proxy never reach fal.ai",!JSON.stringify(s.body).includes("api.telegram.org")&&!JSON.stringify(s.body).includes("/media/telegram"));
 ok("B12 the key goes only to fal.ai, in the expected header",s.auth===`Key ${KEY}`&&calls.filter(c=>c.auth&&String(c.auth).includes(KEY)).every(c=>c.url.startsWith("https://queue.fal.run/")));
 const again=await api("/api/video-trial/execute",{token:c1.token,confirm:c1.confirm_phrase});ok("B13 the same token cannot pay twice",again.status===404&&submits()===1,again.body);
 const p2=await api("/api/video-trial/preview",{source_media_id:"orig1"});ok("B14 one clip per photo",p2.status===409&&p2.body.error==="source_already_used");}
// 3. outcomes of the single submit (unit): exactly one call each, never retried
{FAL.submit="evilurls";const r=await V.falSubmit(W.env,"wan/v2.6/image-to-video/flash",{prompt:"x"});ok("C0 request URLs off the fal queue host are ignored",r.outcome==="accepted"&&r.status_url===null&&r.response_url===null);
 for(const bad of ["https://evil.com/requests/a","http://queue.fal.run/requests/a","https://u@queue.fal.run/requests/a","https://queue.fal.run:8443/requests/a","https://queue.fal.run.evil.com/requests/a"])ok("C0b refused request URL: "+bad,!V.falQueueUrlOk(bad));
 ok("C0c the real form is accepted",V.falQueueUrlOk("https://queue.fal.run/wan/v2.6/requests/abc/status"));FAL.submit="ok";}
for(const [m,want] of [["r400","rejected"],["r401","rejected"],["r402","rejected"],["r403","rejected"],["r422","rejected"],["a408","ambiguous"],["a429","ambiguous"],["a500","ambiguous"],["a503","ambiguous"],["redirect","ambiguous"],["noid","ambiguous"],["bad","ambiguous"],["network","ambiguous"],["timeout","ambiguous"],["ok","accepted"]]){
 FAL.submit=m;const b=submits(),r=await V.falSubmit(W.env,"wan/v2.6/image-to-video/flash",{prompt:"x"});ok("C1 "+m+" → "+want+", one call",r.outcome===want&&submits()===b+1,r);}
FAL.submit="ok";
// rejected: nothing charged, the photo can be tried again; ambiguous: budget kept, never re-sent
{FAL.submit="r422";const p=(await api("/api/video-trial/preview",{source_media_id:"orig2"})).body,x=await api("/api/video-trial/execute",{token:p.token,confirm:p.confirm_phrase});
 ok("C2 a refused clip is not charged and frees its photo",x.body.status==="rejected"&&x.body.charged===false&&clip(p.clip_id).billable===0&&(await api("/api/video-trial/preview",{source_media_id:"orig2"})).status===200);
 FAL.submit="a503";const p3=(await api("/api/video-trial/preview",{source_media_id:"orig3"})).body,b=submits(),y=await api("/api/video-trial/execute",{token:p3.token,confirm:p3.confirm_phrase});
 ok("C3 an unclear outcome keeps its cost and is not retried",y.body.status==="ambiguous"&&y.body.retried===false&&clip(p3.clip_id).billable===1&&submits()===b+1);
 await tick();await tick();ok("C4 later ticks never re-send it",submits()===b+1&&clip(p3.clip_id).status==="ambiguous");FAL.submit="ok";}
// 4. polling and delivery to the private vault only, exactly once
{await tick();ok("D1 still queued: nothing delivered",clip(c1.clip_id).status==="submitted"&&!W.tg.some(t=>t.method==="sendVideo"));
 FAL.status="COMPLETED";const s0=submits();await tick();const c=clip(c1.clip_id),sv=W.tg.filter(t=>t.method==="sendVideo");
 ok("D2 a finished clip is delivered once to the video vault",c.status==="delivered"&&sv.length===1&&c.vault_message_id,c);
 ok("D3 the result was downloaded without any credential",FAL.cdn.length===1&&FAL.cdn[0].auth===null&&FAL.cdn[0].redirect==="manual");
 ok("D4 polling never submits",submits()===s0);
 ok("D4b polling used the status and result URLs fal returned",FAL.gets.some(g=>g.url.startsWith("https://queue.fal.run/wan/v2.6/requests/")&&g.url.endsWith("/status"))&&FAL.gets.some(g=>/\/wan\/v2\.6\/requests\/req-[0-9]+$/.test(g.url)));
 await tick();ok("D5 a second tick sends nothing more",W.tg.filter(t=>t.method==="sendVideo").length===1);
 ok("D6 the temporary result link is not kept",clip(c1.clip_id).video_url===null);
 // two polls racing on the same finished clip: the conditional state change lets only one of them send it
 dbrun("UPDATE video_trial_clips SET status='completed',video_url='https://v3.fal.media/files/abc/clip.mp4',vault_message_id=NULL WHERE id=?",[c1.clip_id]);
 const before=W.tg.filter(t=>t.method==="sendVideo").length;
 await Promise.all([V.pollVideoTrial(W.env,{vaultChatId:VAULT}),V.pollVideoTrial(W.env,{vaultChatId:VAULT}),V.pollVideoTrial(W.env,{vaultChatId:VAULT})]);
 ok("D7 three racing polls deliver the clip exactly once",W.tg.filter(t=>t.method==="sendVideo").length===before+1&&clip(c1.clip_id).status==="delivered",W.tg.filter(t=>t.method==="sendVideo").length-before);}
// 5. failures while polling, time limit, missing vault, hostile result link (module, injected clock)
{const mk=async(src,extra={})=>{const p=await V.videoTrialPreview(W.env,{source_media_id:src});await V.videoTrialExecute(W.env,{token:p.token,confirm:p.confirm_phrase});return p.clip_id;};
 FAL.status="FAILED";const a=await mk("orig2");await V.pollVideoTrial(W.env,{vaultChatId:VAULT});ok("E1 a provider failure ends the clip and does not resubmit",clip(a).status==="failed"&&clip(a).error_category==="provider_failed"&&clip(a).billable===1);
 FAL.status="IN_PROGRESS";dbrun("UPDATE video_trial_clips SET status='submitted',error_category=NULL,submitted_at=? WHERE id=?",[new Date(Date.now()-25*3600e3).toISOString(),a]);
 await V.pollVideoTrial(W.env,{vaultChatId:VAULT});ok("E2 after 24 h a clip still running is closed as failed",clip(a).status==="failed"&&clip(a).error_category==="poll_timeout");
 FAL.status="COMPLETED";dbrun("UPDATE video_trial_clips SET status='submitted',error_category=NULL,submitted_at=? WHERE id=?",[new Date().toISOString(),a]);const t0=W.tg.length;
 await V.pollVideoTrial(W.env,{vaultChatId:""});ok("E3 without a video vault nothing is sent anywhere",clip(a).status==="delivery_failed"&&clip(a).error_category==="vault_not_configured"&&W.tg.length===t0);
 for(const bad of ["http://v3.fal.media/x.mp4","https://fal.media.evil.com/x.mp4","https://evil.com/fal.media/x.mp4","https://user@v3.fal.media/x.mp4","https://v3.fal.media:8443/x.mp4","javascript:alert(1)","",null])ok("E4 result link refused: "+bad,!V.videoResultUrlOk(bad));
 ok("E5 the real CDN form is accepted",V.videoResultUrlOk("https://v3.fal.media/files/x/clip.mp4"));
 dbrun("UPDATE video_trial_clips SET status='submitted',video_url=NULL WHERE id=?",[a]);FAL.result={video:{url:"https://evil.com/x.mp4"}};const cdn0=FAL.cdn.length;
 await V.pollVideoTrial(W.env,{vaultChatId:VAULT});ok("E6 a completed clip pointing outside fal is not downloaded",clip(a).status==="failed"&&clip(a).error_category==="result_url_not_allowed"&&FAL.cdn.length===cdn0);
 FAL.result={video:{url:"https://v3.fal.media/files/abc/clip.mp4"}};FAL.cdnType="text/html";dbrun("UPDATE video_trial_clips SET status='submitted' WHERE id=?",[a]);
 await V.pollVideoTrial(W.env,{vaultChatId:VAULT});ok("E7 a result that is not mp4 is not delivered",clip(a).status==="delivery_failed"&&clip(a).error_category==="result_not_mp4");
 const rd=await V.videoTrialRedeliver(W.env,{clip_id:a}).catch(e=>e.payload||{});ok("E7b a failed delivery can be sent again by the owner, at no charge",rd.status==="completed"&&rd.charged===false&&clip(a).status==="completed");
 const rd2=await V.videoTrialRedeliver(W.env,{clip_id:a}).catch(e=>e.payload);ok("E7c only a failed delivery can be re-sent",rd2?.error==="not_redeliverable");dbrun("UPDATE video_trial_clips SET status='delivery_failed' WHERE id=?",[a]);
 FAL.cdnType="video/mp4";FAL.cdnBytes=V.VIDEO_TRIAL.max_video_bytes+1;dbrun("UPDATE video_trial_clips SET status='submitted' WHERE id=?",[a]);
 await V.pollVideoTrial(W.env,{vaultChatId:VAULT});ok("E8 an oversized result is not delivered",clip(a).status==="delivery_failed"&&clip(a).error_category==="result_too_large");FAL.cdnBytes=2048;
 {const v0=FAL.sendChats.length;await V.videoTrialRedeliver(W.env,{clip_id:a});await V.pollVideoTrial(W.env,{vaultChatId:VAULT});await V.pollVideoTrial(W.env,{vaultChatId:VAULT});
  ok("E10 a redelivered clip reaches the vault exactly once",FAL.sendChats.length===v0+1&&clip(a).status==="delivered");}
 dbrun("UPDATE video_trial_clips SET status='ambiguous',request_id=NULL WHERE id=?",[a]);const g0=FAL.gets.length;await V.pollVideoTrial(W.env,{vaultChatId:VAULT});ok("E9 a clip with no provider id is never polled",FAL.gets.length===g0);}
// 6. money limits: the three-clip total cap and the $2 budget, both checked inside the claim
// test fixture only: marks the clips of earlier sections as not counted, so each later guard is tested on its own
const retire=()=>dbrun("UPDATE video_trial_clips SET billable=0 WHERE billable=1");
{const day=Date.now(),b0=submits();
 ok("F0 three paid clips have been started so far",n("SELECT COUNT(*) n FROM video_trial_clips WHERE billable=1")===3);
 const cap=await V.videoTrialPreview(W.env,{source_media_id:"orig4"}).catch(e=>e.payload);ok("F1 the three-clip total cap stops a fourth clip, before any call",cap?.error==="trial_clip_limit_reached"&&submits()===b0,cap);
 const tomorrow=day+86400e3,cap2=await V.videoTrialPreview(W.env,{source_media_id:"orig4",nowMs:tomorrow+30*86400e3}).catch(e=>e.payload);
 ok("F1b the cap is for the whole trial, not per day",cap2?.error==="trial_clip_limit_reached");
 retire();
 const p=await V.videoTrialPreview(W.env,{source_media_id:"orig4",nowMs:tomorrow});ok("F2 with clips left, a preview is allowed",p.ok===true);
 dbrun("INSERT INTO video_trial_clips(id,source_media_id,status,billable,cost_cents,model,resolution,duration,seed,created_at,updated_at,claimed_at) VALUES('spend','orig9','delivered',1,190,'m','720p','5',1,?,?,?)",[OLD,OLD,OLD]);
 const r=await V.videoTrialExecute(W.env,{token:p.token,confirm:p.confirm_phrase,nowMs:tomorrow}).catch(e=>e.payload);
 ok("F3 a claim that would pass the $2 ceiling is refused with no call",r?.error==="claim_refused"&&r.reason==="trial_budget_exhausted"&&submits()===b0,r);
 const pv=await V.videoTrialPreview(W.env,{source_media_id:"orig5",nowMs:tomorrow}).catch(e=>e.payload);ok("F4 a preview is refused once the budget is spent",pv?.error==="trial_budget_exhausted");
 dbrun("DELETE FROM video_trial_clips WHERE id='spend'");
 const st=(await api("/api/video-trial/status",null,"GET")).body;ok("F5 status shows budget, cap and that nothing recurs",st.budget_usd===2&&st.clip_usd===0.25&&st.recurring===false&&st.max_clips===3&&typeof st.clips_left==="number"&&st.daily_max===undefined&&st.configured===true);}
// 7. expiry, configuration, model allowlist, oversized source
{const p=await V.videoTrialPreview(W.env,{source_media_id:"orig5",nowMs:Date.now()+2*86400e3}),late=Date.now()+2*86400e3+11*60e3,b=submits();
 const r=await V.videoTrialExecute(W.env,{token:p.token,confirm:p.confirm_phrase,nowMs:late}).catch(e=>e.payload);ok("G1 an expired preview cannot be used",r?.error==="preview_expired"&&submits()===b);
 const key=W.env.FAL_KEY;W.env.FAL_KEY="";const nk=await api("/api/video-trial/preview",{source_media_id:"orig5"});ok("G2 without FAL_KEY nothing can start",nk.status===503&&nk.body.error==="video_provider_not_configured");W.env.FAL_KEY=key;
 W.env.FAL_VIDEO_MODEL="fal-ai/kling-video/v2.1/pro/image-to-video";const nm=await api("/api/video-trial/preview",{source_media_id:"orig5"});ok("G3 another (dearer) model is refused",nm.status===503&&nm.body.error==="video_model_not_allowed"&&submits()===b);delete W.env.FAL_VIDEO_MODEL;
 FAL.fileSize=V.VIDEO_TRIAL.max_source_bytes+1;const big=await V.videoTrialPreview(W.env,{source_media_id:"orig5",nowMs:Date.now()+3*86400e3});
 const rb=await V.videoTrialExecute(W.env,{token:big.token,confirm:big.confirm_phrase,nowMs:Date.now()+3*86400e3}).catch(e=>e.payload);
 ok("G4 an oversized photo is refused before fal.ai, with no charge",rb?.error==="source_too_large"&&rb.charged===false&&submits()===b&&clip(big.clip_id).billable===0);FAL.fileSize=5000;
 dbrun("INSERT INTO cleanup_trash(id,section,record_id,op_id,prior_json,state,deleted_by,deleted_at) VALUES('tr2','vault','orig5','op2','{}','trashed','admin',?)",[OLD]);
 const hp=await V.videoTrialPreview(W.env,{source_media_id:"orig4",nowMs:Date.now()+4*86400e3});dbrun("INSERT INTO cleanup_trash(id,section,record_id,op_id,prior_json,state,deleted_by,deleted_at) VALUES('tr3','vault','orig4','op3','{}','trashed','admin',?)",[OLD]);
 const hx=await api("/api/video-trial/execute",{token:hp.token,confirm:hp.confirm_phrase});ok("G5 a photo moved to Trash after the preview is refused at execute",hx.status===400&&hx.body.error==="source_not_approved"&&submits()===b);}
// 7b. each claim guard on its own, and the paid call's write-back
{const D=k=>Date.now()+k*86400e3;
 const p=await V.videoTrialPreview(W.env,{source_media_id:"orig6",nowMs:D(5)}),b=submits();
 // the claim is held back briefly, so BOTH executes pass the token lookup and the status pre-check before either claims:
 // only the claim's own status condition can stop the second one
 const prep0=W.env.DB.prepare.bind(W.env.DB);W.env.DB.prepare=sql=>{const st=prep0(sql);if(!/^UPDATE video_trial_clips SET status='submitting'/.test(sql))return st;
  return {bind:(...a)=>{const b=st.bind(...a);return {run:async()=>{await new Promise(z=>setTimeout(z,40));return b.run();}};}};};
 const res=await Promise.all([V.videoTrialExecute(W.env,{token:p.token,confirm:p.confirm_phrase,nowMs:D(5)}).catch(e=>e.payload),V.videoTrialExecute(W.env,{token:p.token,confirm:p.confirm_phrase,nowMs:D(5)}).catch(e=>e.payload)]);
 W.env.DB.prepare=prep0;
 ok("B15 two executes racing with one token pay once (the claim's own guard)",submits()===b+1&&res.filter(x=>x?.status==="submitted").length===1,res.map(x=>x?.status||x?.error));
 const p1=await V.videoTrialPreview(W.env,{source_media_id:"orig7",nowMs:D(6)}),p2=await V.videoTrialPreview(W.env,{source_media_id:"orig7",nowMs:D(6)}),b2=submits();
 await V.videoTrialExecute(W.env,{token:p1.token,confirm:p1.confirm_phrase,nowMs:D(6)});const x2=await V.videoTrialExecute(W.env,{token:p2.token,confirm:p2.confirm_phrase,nowMs:D(6)}).catch(e=>e.payload);
 ok("B16 a second preview of the same photo cannot pay (the claim's own one-per-photo check)",submits()===b2+1&&x2?.error==="claim_refused"&&x2.reason==="already_claimed_or_used",x2);
 let idx=false;try{dbrun("UPDATE video_trial_clips SET status='submitted',billable=1 WHERE id=?",[p2.clip_id]);}catch{idx=true;}ok("B16b the database index alone also refuses a second paid clip of one photo",idx);
 const p3=await V.videoTrialPreview(W.env,{source_media_id:"orig8",nowMs:D(7)});
 for(const k of [1,2,3])dbrun("INSERT INTO video_trial_clips(id,source_media_id,status,billable,cost_cents,model,resolution,duration,seed,created_at,updated_at,claimed_at) VALUES(?,?,'delivered',1,0,'m','720p','5',1,?,?,?)",["fill"+k,"fx"+k,OLD,OLD,new Date(D(7)).toISOString()]);
 const b3=submits(),x3=await V.videoTrialExecute(W.env,{token:p3.token,confirm:p3.confirm_phrase,nowMs:D(7)}).catch(e=>e.payload);
 ok("F6 the claim alone enforces the three-clip cap (clips started after the preview)",x3?.error==="claim_refused"&&x3.reason==="trial_clip_limit_reached"&&submits()===b3,x3);
 dbrun("DELETE FROM video_trial_clips WHERE id IN ('fill1','fill2','fill3')");retire();
 const prep=W.env.DB.prepare.bind(W.env.DB);let fails=1;W.env.DB.prepare=sql=>{if(/SET status=\?,billable=\?,error_category=\?/.test(sql)&&fails-->0){const st=prep(sql);return {bind:(...a)=>({run:async()=>{throw Error("D1 busy (test)")}})};}return prep(sql);};
 const p4=await V.videoTrialPreview(W.env,{source_media_id:"orig9",nowMs:D(8)}),b4=submits(),x4=await V.videoTrialExecute(W.env,{token:p4.token,confirm:p4.confirm_phrase,nowMs:D(8)});
 ok("R1 a failed write of the provider id is retried (the write only), and the clip is polled normally",x4.status==="submitted"&&clip(p4.clip_id).request_id&&submits()===b4+1);
 fails=99;const p5=await V.videoTrialPreview(W.env,{source_media_id:"orig10",nowMs:D(9)}),b5=submits();const aud=(env,type,msg,d)=>env.DB.prepare("INSERT INTO system_events VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),type,"warning",msg,JSON.stringify(d),new Date().toISOString()).run();
 const x5=await V.videoTrialExecute(W.env,{token:p5.token,confirm:p5.confirm_phrase,nowMs:D(9),audit:aud});W.env.DB.prepare=prep;
 ok("R2 if the id can never be saved: no second paid call, and the owner gets the id",x5.error==="request_id_unsaved"&&x5.retried===false&&submits()===b5+1&&n("SELECT COUNT(*) n FROM system_events WHERE type='video_trial_request_id_unsaved' AND details_json LIKE ?",["%"+x5.request_id+"%"])===1);
 const st=await V.videoTrialStatus(W.env,{nowMs:D(9)+11*60e3});ok("R3 the status shows that clip as stuck",st.items.some(i=>i.id===p5.clip_id&&i.status==="submitting"&&i.stuck===true));
 FAL.getFile="fail";const p6=await V.videoTrialPreview(W.env,{source_media_id:"orig11",nowMs:D(10)}),b6=submits(),x6=await V.videoTrialExecute(W.env,{token:p6.token,confirm:p6.confirm_phrase,nowMs:D(10)}).catch(e=>e.payload);FAL.getFile="ok";
 ok("R4 a Telegram download failure stops before fal.ai, with no charge",x6?.charged===false&&submits()===b6&&clip(p6.clip_id).billable===0);
 FAL.bytes="text";const p7=await V.videoTrialPreview(W.env,{source_media_id:"orig12",nowMs:D(11)}),x7=await V.videoTrialExecute(W.env,{token:p7.token,confirm:p7.confirm_phrase,nowMs:D(11)}).catch(e=>e.payload);FAL.bytes="jpeg";
 ok("R5 a source that is not an image stops before fal.ai, with no charge",x7?.error==="source_not_image"&&x7.charged===false&&submits()===b6);}
// 8. nothing recurs, and the key is never exposed
{const src=fs.readdirSync(SRC).filter(f=>f.endsWith(".js")&&f!=="video-trial.js").map(f=>fs.readFileSync(path.join(SRC,f),"utf8")).join("\n");
 ok("H1 no scheduler task, quota or weekly adapter exists for trial clips",!/video_trial/.test(fs.readFileSync(path.join(SRC,"agent-orchestrator.js"),"utf8")+fs.readFileSync(path.join(SRC,"autonomy-engine.js"),"utf8"))&&!/registerWeeklyVideoAdapter\(\s*["'`]/.test(src));
 ok("H2 the cron only polls (the poll step has no submit call)",!/falSubmit|videoTrialExecute/.test(V.pollVideoTrial.toString()));
 const b=submits();dbrun("INSERT INTO video_trial_clips(id,source_media_id,token_hash,phrase,expires_at,status,billable,cost_cents,model,resolution,duration,seed,created_at,updated_at) VALUES('pv','orig9','h','p',?,'previewed',0,25,'wan/v2.6/image-to-video/flash','720p','5',1,?,?)",[new Date(Date.now()+60e3).toISOString(),OLD,OLD]);
 await tick();ok("H3 an unconfirmed preview is never sent by the cron",submits()===b&&clip("pv").status==="previewed");
 const rows=JSON.stringify(q("SELECT * FROM video_trial_clips")),ev=JSON.stringify(q("SELECT * FROM system_events")),tgb=JSON.stringify(W.tg),all=rows+ev+tgb+responses.join("");
 ok("H4 FAL_KEY appears in no row, event, response or Telegram message",!all.includes(KEY)&&!all.includes("SENTINEL-7f3a"));
 ok("H5 the photo bytes appear in no row, event or response",!all.includes(MARK));
 // the delivered clip, as the Telegram webhook would store it in the vault, is kept out of content and marketing
 {const del=q("SELECT vault_message_id m,vault_chat_id c FROM video_trial_clips WHERE status='delivered' AND vault_message_id IS NOT NULL LIMIT 1")[0];
  dbrun("INSERT INTO telegram_media_sources(id,chat_id,chat_username,message_id,file_id,file_unique_id,media_type,caption,source_kind,created_at,updated_at) VALUES('trialv',?,'',?,'FV','UFV','video','trial','vault',?,?)",[del.c,del.m,new Date().toISOString(),new Date().toISOString()]);
  media("realvid","vault","video");
  const hid=await V.videoTrialHiddenSql(W.env,"telegram_media_sources.id"),vis=q("SELECT id FROM telegram_media_sources WHERE source_kind='vault' AND media_type='video'"+hid).map(x=>x.id);
  ok("H11 a delivered trial clip is hidden from the vault media picker; other vault videos stay",!vis.includes("trialv")&&vis.includes("realvid"),vis);
  ok("H11b the delivery recorded the vault chat",del.c===VAULT);
  dbrun("INSERT INTO telegram_media_sources(id,chat_id,chat_username,message_id,file_id,file_unique_id,media_type,caption,source_kind,created_at,updated_at) VALUES('lostv',?,'','99999','FL','UFL','video',?,'vault',?,?)",[VAULT,V.VIDEO_TRIAL_CAPTION_PREFIX+" · 720p · 5 ثانیه",new Date().toISOString(),new Date().toISOString()]);
  const vis2=q("SELECT id FROM telegram_media_sources WHERE source_kind='vault' AND media_type='video'"+hid).map(x=>x.id);
  ok("H11e a trial clip whose Telegram reply was lost (no id recorded) is still hidden by its fixed caption; other videos stay",!vis2.includes("lostv")&&vis2.includes("realvid"),vis2);
  const W3=await makeWorld({});ok("H11c with no trial table the filter adds nothing",(await V.videoTrialHiddenSql(W3.env,"telegram_media_sources.id"))==="");
  const isrc=fs.readFileSync(path.join(SRC,"index.js"),"utf8");
  ok("H11d both the content picker and the marketing-media check apply it",(isrc.match(/await videoTrialHiddenSql\(env,"telegram_media_sources\.id"\)/g)||[]).length===2);
  dbrun("DELETE FROM telegram_media_sources WHERE id IN ('trialv','realvid','lostv')");}
 ok("H7 every clip was sent to the private vault chat only",FAL.sendChats.length>0&&FAL.sendChats.every(c=>c===VAULT),FAL.sendChats);
 ok("H8 nothing touched content, outreach or the weekly video rows",["weekly_video_autopilot","contents","lead_outreach","content_distribution"].every(t=>{try{return n(`SELECT COUNT(*) n FROM ${t}`)===(BASE[t]??0);}catch{return true;}}));
 ok("H9 the key is never printed to the console",!consoleOut.join("\n").includes(KEY));
 ok("H10 the Telegram bot token is in no row, event, response or fal request",!all.includes("bot-test")&&!JSON.stringify(FAL.submits).includes("bot-test"));
 ok("H6 audit events exist for submit and delivery, with no secret",n("SELECT COUNT(*) n FROM system_events WHERE type IN ('video_trial_submitting','video_trial_submitted','video_trial_delivered')")>=3);}
// 9. an empty system stays silent, and the preflight guards
{const W2=await makeWorld({extraEnv:{FAL_KEY:KEY}});const c0=calls.length;const r=await V.pollVideoTrial(W2.env,{vaultChatId:VAULT});
 ok("I1 with no trial table the poll makes no call and writes nothing",r.polled===0&&calls.length===c0&&n.call(null,"SELECT 1 n")===1);
 const P=await import(pathToFileURL(path.join(REPO,"scripts/release/preflight.mjs")).href);
 ok("I2 FAL_KEY is an optional secret",P.OPTIONAL_SECRETS.includes("FAL_KEY")&&!P.REQUIRED_SECRETS.includes("FAL_KEY"));
 const exp={vars:{FAL_KEY:"x"},d1:[],r2:[],ai:null},v={id:"x",annotations:{"workers/tag":"t-orch-on"},resources:{bindings:[{name:"AUTONOMY_ORCHESTRATOR",type:"plain_text",text:"on"},{name:"FAL_KEY",type:"plain_text",text:"x"}]}};
 const res=P.checkVersion(v,exp,{requiredSecrets:[]});ok("I3 preflight fails if FAL_KEY is a plain variable",!res.ok&&res.failures.some(f=>/FAL_KEY/.test(f)));
 const res2=P.checkVersion({...v,resources:{bindings:[{name:"AUTONOMY_ORCHESTRATOR",type:"plain_text",text:"on"},{name:"WEEKLY_VIDEO_PROVIDER",type:"plain_text",text:"fal"}]}},{vars:{},d1:[],r2:[],ai:null},{requiredSecrets:[]});
 ok("I4 preflight fails if a weekly video provider is switched on",!res2.ok&&res2.failures.some(f=>/WEEKLY_VIDEO_PROVIDER/.test(f)));}
// 10. disabled by default: without FAL_KEY, importing the module, the ordinary cron and every route create no table and call no provider
{const W4=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on",TELEGRAM_VAULT_CHAT_ID:VAULT}});
 const tbl=()=>W4.q("SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE 'video_trial%'")[0].n,c0=calls.filter(c=>/fal\.(run|media|ai)/.test(c.url)).length;
 await import(pathToFileURL(path.join(SRC,"video-trial.js")).href+"?d="+Math.random());
 const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href+"?d="+Math.random())).default,ws=[];
 await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},W4.env,{waitUntil:p=>ws.push(p)});await Promise.allSettled(ws);
 const r1=await W4.call("/api/video-trial/status",null,"GET"),r2=await W4.call("/api/video-trial/sources",null,"GET"),
  r3=await W4.call("/api/video-trial/preview",{source_media_id:"x"}),r4=await W4.call("/api/video-trial/execute",{token:"t",confirm:"c"}),r5=await W4.call("/api/video-trial/redeliver",{clip_id:"x"});
 ok("I5 without FAL_KEY: import, cron, status, sources, preview, execute and redeliver create no table",tbl()===0,[r1.status,r2.status,r3.status,r4.status,r5.status]);
 ok("I6 without FAL_KEY the paid routes refuse with 503 and redeliver finds nothing",r3.status===503&&r4.status===503&&r5.status===409&&r1.status===200);
 ok("I7 without FAL_KEY no fal.ai host is ever called",calls.filter(c=>/fal\.(run|media|ai)/.test(c.url)).length===c0);}
done();
