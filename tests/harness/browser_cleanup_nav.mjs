// FINAL STABILIZATION — Cleanup page: "مشاهده بخش" navigation, request failures and cleanup-write safety, in real headless Chrome
// with real mouse clicks at phone and desktop sizes. Local server with synthetic data; failures are injected at the local server
// (dropped connection = the browser's "Failed to fetch", delays, HTTP 401/403/500). Usage: node tests/harness/browser_cleanup_nav.mjs
import fs from "node:fs";import path from "node:path";import http from "node:http";import os from "node:os";import {spawn} from "node:child_process";import {fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("browser_cleanup_nav");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const CHROME=process.env.CHROME||"C:/Program Files/Google/Chrome/Application/chrome.exe";
if(!fs.existsSync(CHROME)){console.log("browser_cleanup_nav → SKIPPED: Chrome not found");process.exit(0);}
const OLD=new Date(Date.now()-40*86400000).toISOString();
const W=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on"}});const {q,dbrun,call}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
for(const p of ["/api/quotes","/api/si/knowledge/product","/api/owner-escalations","/api/leads/outreach","/api/content/pipeline","/api/autonomy/status","/api/autonomy/tasks","/api/retry-queue","/api/agents/overview","/api/photo-autopilot/status","/api/media-vault"])await call(p,null,"GET");
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/phase25-delete-system/01-migration.sql"),"utf8"));
const fill=(t,o)=>{for(const c of q(`SELECT name,"notnull" nn,dflt_value d,type FROM pragma_table_info('${t}')`).filter(k=>k.nn&&k.d===null))if(!(c.name in o))o[c.name]=/INT|REAL/.test(c.type)?1:"x"+o.id;const k=Object.keys(o);dbrun(`INSERT INTO ${t}(${k.join(",")}) VALUES(${k.map(()=>"?").join(",")})`,k.map(x=>o[x]));};
for(let i=1;i<=40;i++)fill("inbox_messages",{id:"ub"+i,platform:"telegram",lead_id:null,conversation_id:null,provider_sender_id:null,message:"پیام بدون فرستنده "+i,status:"new",created_at:OLD,updated_at:OLD});
for(let i=1;i<=8;i++)fill("autonomy_tasks",{id:"tf"+i,module:"content",action:"generate_and_queue",status:"failed",error:"old failure "+i,created_at:OLD,updated_at:OLD,finished_at:OLD});
let rq=0;try{q("SELECT 1 FROM retry_queue LIMIT 1");rq=1;}catch{}
if(rq)for(let i=1;i<=3;i++)fill("retry_queue",{id:"rq"+i,operation:"calendar_publish",status:"failed",last_error:"old",created_at:OLD,updated_at:OLD});

// the local server, with injectable failures: {re, method, mode:'drop'|'dropAfter'|'status'|'delay', status, ms, times}
const rules=[],log=[];
// Connection: close on every answer: Chrome silently re-sends a request whose REUSED keep-alive socket closes without an answer,
// which would hide the failure under test. A fresh socket per request makes a dropped connection a real "Failed to fetch".
const server=http.createServer(async(req,res)=>{try{res.setHeader("Connection","close");const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);log.push({m:req.method,u:req.url,t:Date.now()});
 const rule=rules.find(r=>r.times>0&&r.re.test(req.url)&&(!r.method||r.method===req.method));if(rule)rule.times--;
 if(rule?.mode==="drop"){req.socket.destroy();return}
 if(rule?.mode==="status"){res.writeHead(rule.status,{"Content-Type":"application/json"});res.end(JSON.stringify({ok:false,error:rule.error||(rule.status===401?"Unauthorized":"injected "+rule.status)}));return}
 if(rule?.mode==="delay")await new Promise(r=>setTimeout(r,rule.ms));
 const r=await W.run(new Request("https://w.test"+req.url,{method:req.method,headers:Object.fromEntries(Object.entries(req.headers).filter(([k])=>!["host","connection","content-length"].includes(k))),body:["GET","HEAD"].includes(req.method)?undefined:body}));
 if(rule?.mode==="dropAfter"){await r.arrayBuffer();req.socket.destroy();return}
 res.writeHead(r.status,{"Content-Type":r.headers.get("Content-Type")||"text/plain"});res.end(Buffer.from(await r.arrayBuffer()));}catch(e){try{res.writeHead(500);res.end(String(e));}catch{}}});
await new Promise(r=>server.listen(0,"127.0.0.1",r));const BASE=`http://127.0.0.1:${server.address().port}`;
const profile=fs.mkdtempSync(path.join(os.tmpdir(),"cdp-"));
const chrome=spawn(CHROME,["--headless=new","--disable-gpu","--no-first-run","--remote-debugging-port=0","--user-data-dir="+profile,"about:blank"],{stdio:["ignore","ignore","pipe"]});
const wsUrl=await new Promise((res,rej)=>{let b="";chrome.stderr.on("data",d=>{b+=d;const m=b.match(/ws:\/\/[^\s]+/);if(m)res(m[0]);});setTimeout(()=>rej(Error("chrome did not start")),20000);});
const ws=new WebSocket(wsUrl);await new Promise(r=>ws.addEventListener("open",r));
let seq=0;const wait=new Map(),events=[];ws.addEventListener("message",e=>{const m=JSON.parse(e.data);if(m.id&&wait.has(m.id)){wait.get(m.id)(m);wait.delete(m.id);}else events.push(m);});
const cdp=(method,params={},sessionId)=>new Promise(r=>{const id=++seq;wait.set(id,r);ws.send(JSON.stringify({id,method,params,sessionId}));});
const {result:{targetId}}=await cdp("Target.createTarget",{url:"about:blank"});const {result:{sessionId:S}}=await cdp("Target.attachToTarget",{targetId,flatten:true});
await cdp("Page.enable",{},S);await cdp("Runtime.enable",{},S);
const ev=async expr=>{const r=await cdp("Runtime.evaluate",{expression:expr,awaitPromise:true,returnByValue:true},S);if(r.result?.exceptionDetails)throw Error(JSON.stringify(r.result.exceptionDetails).slice(0,300));return r.result?.result?.value;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(expr,ms=8000)=>{const t=Date.now();while(Date.now()-t<ms){if(await ev(expr).catch(()=>false))return true;await sleep(100);}return false;};
const go=async p=>{await cdp("Page.navigate",{url:BASE+p},S);await until("document.readyState==='complete'");};
// a real mouse click at the element's centre, after bringing it on screen the way the owner would
const realClick=async(sel,block="center")=>{const r=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:${JSON.stringify(block)}});const b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2}})()`);
 if(!r)return false;await sleep(150);const p={x:r.x,y:r.y,button:"left",clickCount:1};await cdp("Input.dispatchMouseEvent",{type:"mouseMoved",...p},S);await cdp("Input.dispatchMouseEvent",{type:"mousePressed",...p},S);await cdp("Input.dispatchMouseEvent",{type:"mouseReleased",...p},S);return true;};
const items=sec=>log.filter(x=>x.m==="GET"&&x.u.startsWith("/api/cleanup/items?")&&x.u.includes("section="+sec)).length;
const posts=p=>log.filter(x=>x.m==="POST"&&x.u===p).length;
const line=()=>ev("document.getElementById('clStatusLine').textContent");
const size=(w,h,mobile)=>cdp("Emulation.setDeviceMetricsOverride",{width:w,height:h,deviceScaleFactor:mobile?2:1,mobile},S);

await go("/dashboard");const KEY=await ev("typeof KEY==='string'?KEY:''");await ev(`localStorage.setItem(${JSON.stringify(KEY)},"tok")`);
for(const [vn,w,h,mobile] of [["iphone",390,844,true],["desktop",1280,800,false]]){
 await size(w,h,mobile);await go("/dashboard/cleanup");ok(vn+" N0 the page loads its list",await until("/مورد/.test(document.getElementById('clStatusLine').textContent)",10000),await line());
 await realClick("#clTest");ok(vn+" N1 the test-data panel opens with its section buttons",await until("document.querySelectorAll('[data-open]').length===2",10000));
 await ev("scrollTo(0,document.documentElement.scrollHeight)");await sleep(200);await until("!!document.querySelector('[data-open=tasks]')",8000);await ev("document.querySelector('[data-open=tasks]').scrollIntoView({block:'center'})");
 ok(vn+" N3a precondition: before the click the list header is off screen",await ev("(()=>{const b=document.getElementById('clStatusLine').getBoundingClientRect();return b.bottom<0||b.top>innerHeight*0.6})()"),await ev("document.getElementById('clStatusLine').getBoundingClientRect().top"));
 const watchFlash="(()=>{window.__fl=0;const x=document.getElementById('clItems');if(window.__flo)window.__flo.disconnect();window.__flo=new MutationObserver(()=>{if(x.classList.contains('clFlash'))window.__fl=1});window.__flo.observe(x,{attributes:true,attributeFilter:['class']})})()";
 await ev(watchFlash);const before=items("tasks");await realClick("[data-open='tasks']");
 ok(vn+" N2 the section is selected at once",await ev("document.getElementById('clSection').value==='tasks'&&document.getElementById('clView').value==='active'"));
 ok(vn+" N3 its records load",await until("document.getElementById('clStatusLine').textContent.includes('خطای Cron و Task')&&document.querySelectorAll('#clItems .row').length>=8",10000),await line());
 ok(vn+" N4 the list header is scrolled into view",await until("(()=>{const b=document.getElementById('clStatusLine').getBoundingClientRect();return b.top>=0&&b.top<innerHeight*0.6})()",4000),await ev("document.getElementById('clStatusLine').getBoundingClientRect().top"));
 ok(vn+" N5 the list is visibly marked",await until("window.__fl===1",5000));
 ok(vn+" N6 exactly one list request",items("tasks")===before+1,items("tasks")-before);
 ok(vn+" N7 no sideways scroll",await ev("document.documentElement.scrollWidth-document.documentElement.clientWidth")<=0);
 await sleep(1700);await ev(watchFlash);const b2=items("tasks");await realClick("[data-open='tasks']");
 ok(vn+" N8 clicking the shown section again scrolls and marks without a new request",await until("window.__fl===1",5000)&&items("tasks")===b2);
 await ev("(()=>{const v=document.getElementById('clView');v.value='trash';v.dispatchEvent(new Event('change'))})()");await until("document.getElementById('clStatusLine').textContent.includes('سطل زباله')",8000);await sleep(900);
 await realClick("[data-open='tasks']");ok(vn+" N2b from the Trash view it switches back to the active list",await until("document.getElementById('clView').value==='active'&&document.getElementById('clStatusLine').textContent.includes('فعال')",8000),await line());
 rules.push({re:/section=inbox/,method:"GET",mode:"delay",ms:1200,times:1});const b3=items("inbox");
 await realClick("[data-open='inbox']");await realClick("[data-open='inbox']");await realClick("[data-open='inbox']");
 ok(vn+" N9 repeated clicks while loading send one request",await until("document.getElementById('clStatusLine').textContent.includes('پیام‌های Inbox')&&/مورد/.test(document.getElementById('clStatusLine').textContent)",6000)&&items("inbox")===b3+1,items("inbox")-b3);
}
// stale answers: a slow reply for the previous section never replaces the current one
{await size(1280,800,false);await go("/dashboard/cleanup");await until("/مورد/.test(document.getElementById('clStatusLine').textContent)",10000);
 await ev("(()=>{const s=document.getElementById('clSection');s.value='tasks';s.dispatchEvent(new Event('change'))})()");await until("document.getElementById('clStatusLine').textContent.includes('خطای Cron و Task')&&/مورد/.test(document.getElementById('clStatusLine').textContent)",8000);
 await until("document.querySelectorAll('#clItems .clPick:not(:disabled)').length>0",6000);await ev("document.querySelector('#clItems .clPick:not(:disabled)').click()");
 rules.push({re:/section=inbox/,method:"GET",mode:"delay",ms:3500,times:1});
 await ev("(()=>{const s=document.getElementById('clSection');s.value='inbox';s.dispatchEvent(new Event('change'))})()");await sleep(150);
 ok("R0 while the next section loads, the previous rows are faded and not clickable",await ev("document.getElementById('clItems').classList.contains('clWaiting')&&getComputedStyle(document.getElementById('clItems')).pointerEvents==='none'"));
 const pv0=posts("/api/cleanup/preview");await ev("(()=>{const b=document.querySelector('#clItems [data-pg=trash]');if(b){b.focus();b.click()}})()");
 await realClick("#clSelected");await realClick("#clDeleteAll");await sleep(300);
 ok("R0b ticked rows of the previous view are unticked and the bulk buttons send nothing",posts("/api/cleanup/preview")===pv0&&await ev("document.querySelectorAll('.clPick[data-sec=page]:checked').length===0&&(!document.getElementById('clSheet')||document.getElementById('clSheet').hidden)"));
 await ev("(()=>{const s=document.getElementById('clSection');s.value='tasks';s.dispatchEvent(new Event('change'))})()");
 await sleep(4200);ok("R1b the rows are clickable again once loaded",await ev("!document.getElementById('clItems').classList.contains('clWaiting')"));ok("R1 after a fast switch the newer section stays on screen",(await line()).includes("خطای Cron و Task")&&await ev("[...document.querySelectorAll('#clItems .row b')].some(b=>b.textContent.includes('content / generate_and_queue'))")&&!(await ev("[...document.querySelectorAll('#clItems .row b')].some(b=>b.textContent.includes('پیام بدون فرستنده'))")),await line());}
// ISOLATED GUARDS — each test puts the partner guard out of play, so the guard under test is the only thing that can pass it.
// 1. The sequence number alone. Abort makes the replaced request return "aborted"; only the sequence check stops that answer from
//    ending the loading state of the newer request. Observable: the newer list must stay in its loading state.
{await go("/dashboard/cleanup");await until("/مورد/.test(document.getElementById('clStatusLine').textContent)",10000);
 await ev("(()=>{const s=document.getElementById('clSection');s.value='tasks';s.dispatchEvent(new Event('change'))})()");await until("document.getElementById('clStatusLine').textContent.includes('خطای Cron و Task')&&/مورد/.test(document.getElementById('clStatusLine').textContent)",8000);
 rules.push({re:/section=inbox/,method:"GET",mode:"delay",ms:2500,times:1});rules.push({re:new RegExp("section="+(rq?"retry":"errors")),method:"GET",mode:"delay",ms:2500,times:1});
 await ev("(()=>{const s=document.getElementById('clSection');s.value='inbox';s.dispatchEvent(new Event('change'))})()");await sleep(200);
 await ev(`(()=>{const s=document.getElementById('clSection');s.value=${JSON.stringify(rq?"retry":"errors")};s.dispatchEvent(new Event('change'))})()`);await sleep(400);
 ok("S1 a replaced request cannot end the newer request's loading state (sequence check alone)",await ev("document.getElementById('clItems').classList.contains('clWaiting')&&document.getElementById('clItems').getAttribute('aria-busy')==='true'"));
 await until("/مورد/.test(document.getElementById('clStatusLine').textContent)",8000);}
// 2. Abort alone. The sequence check already drops a stale answer, so abort's own job is to stop the replaced request's retries.
//    Observable: a section whose reads keep failing is asked only once after the owner moved on.
{const old=rq?"retry":"errors";rules.push({re:new RegExp("section="+old),method:"GET",mode:"drop",times:3});const b=items(old);
 await ev(`(()=>{const s=document.getElementById('clSection');s.value=${JSON.stringify(old)};s.dispatchEvent(new Event('change'))})()`);await sleep(150);
 await ev("(()=>{const s=document.getElementById('clSection');s.value='tasks';s.dispatchEvent(new Event('change'))})()");await sleep(2500);
 ok("S2 a replaced request stops retrying (abort alone)",items(old)===b+1,items(old)-b);rules.forEach(x=>{if(String(x.re).includes(old))x.times=0});
 await until("document.getElementById('clStatusLine').textContent.includes('خطای Cron و Task')&&/مورد/.test(document.getElementById('clStatusLine').textContent)",8000);}
// 3. Delete-all while loading, with a scope the page guard does not cover: only the loading guard can refuse it.
{rules.push({re:/section=inbox/,method:"GET",mode:"delay",ms:2500,times:1});await ev("document.getElementById('clScope').value='section'");
 await ev("(()=>{const s=document.getElementById('clSection');s.value='inbox';s.dispatchEvent(new Event('change'))})()");await sleep(200);const p0=posts("/api/cleanup/preview");
 await ev("document.getElementById('clDeleteAll').click()");await sleep(300);
 ok("S3 delete-all for the whole section is refused while the section loads (loading guard alone)",posts("/api/cleanup/preview")===p0,posts("/api/cleanup/preview")-p0);
 await ev("document.querySelector(\"[data-cl='close']\")?.click()"); await ev("document.getElementById('clScope').value='page'");await until("/مورد/.test(document.getElementById('clStatusLine').textContent)",8000);}
// 4. View Section clicked again while loading, through an enabled copy of the button: only the de-duplication can refuse it.
{await realClick("#clTest");await until("document.querySelectorAll('[data-open]').length===2",10000);
 rules.push({re:/section=tasks/,method:"GET",mode:"delay",ms:2000,times:1});
 await ev("(()=>{const s=document.getElementById('clSection');s.value='inbox';s.dispatchEvent(new Event('change'))})()");await until("document.getElementById('clStatusLine').textContent.includes('پیام‌های Inbox')&&/مورد/.test(document.getElementById('clStatusLine').textContent)",8000);
 const b=items("tasks");await ev("document.querySelector('[data-open=tasks]').click()");await sleep(150);
 await ev("(()=>{const o=document.querySelector('[data-open=tasks]'),c=o.cloneNode(true);c.disabled=false;c.id='isoCopy';o.after(c);c.click();c.click()})()");await sleep(2600);
 ok("S4 a second click while that section loads sends no request (de-duplication alone)",items("tasks")===b+1,items("tasks")-b);await ev("document.getElementById('isoCopy')?.remove()");}
// a dropped connection ("Failed to fetch"): bounded retries for reads, Persian text, a retry button, and no wrong list
{const sec=rq?"retry":"errors";rules.push({re:new RegExp("section="+sec),method:"GET",mode:"drop",times:3});const b=items(sec);
 let seenAttempt=false;const watch=(async()=>{const t=Date.now();while(Date.now()-t<9000&&!seenAttempt){seenAttempt=/تلاش [23۲۳] از ۳/.test(await line().catch(()=>""));await sleep(60);}})();
 await ev(`(()=>{const s=document.getElementById('clSection');s.value=${JSON.stringify(sec)};s.dispatchEvent(new Event('change'))})()`);
 await watch;ok("F1 Persian message for a dropped connection",await until("document.getElementById('clStatusLine').textContent.includes('ارتباط با سرور برقرار نشد')",12000),await line());
 ok("F1b the attempt count was shown while retrying",seenAttempt);
 ok("F2 the read was tried 3 times, no more",items(sec)===b+3,items(sec)-b);
 ok("F3 a retry button is offered",await ev("!!document.querySelector('#clStatusLine [data-retry=list]')"));
 ok("F4 the previous section's list is not left under this section",await ev("document.querySelectorAll('#clItems .row').length===0"));
 {const p0=posts("/api/cleanup/preview");await ev("document.getElementById('clScope').value='page'");await realClick("#clDeleteAll");await sleep(400);
  ok("F4b after a failed load, delete-all for the page sends nothing",posts("/api/cleanup/preview")===p0&&await ev("!document.getElementById('clSheet')||document.getElementById('clSheet').hidden"),posts("/api/cleanup/preview")-p0);}
 const bf=items(sec);await realClick("#clStatusLine [data-retry=list]");ok("F5 retry loads the section",await until("/مورد/.test(document.getElementById('clStatusLine').textContent)&&!document.querySelector('#clStatusLine [data-retry]')",8000),{line:await line(),reqs:items(sec)-bf,rules:rules.filter(x=>x.times>0).map(x=>String(x.re)+x.mode+x.times)});
 // positive control: with the list on screen, "delete all" opens a preview for exactly this section, for each scope
 for(const sc of ["page","filter","section"]){const p0=posts("/api/cleanup/preview");await ev(`document.getElementById("clScope").value=${JSON.stringify(sc)}`);await realClick("#clDeleteAll");
  ok("F5"+sc[0]+" delete-all ("+sc+") opens a preview of this section (filter scope with no filter is refused, as designed)",await until(`!!document.getElementById('clSheetBox')&&!document.getElementById('clSheet').hidden&&(${JSON.stringify(sc)}==='filter'?/فیلتر/.test(document.getElementById('clSheetBox').textContent):/انتقال به سطل زباله/.test(document.getElementById('clSheetBox').textContent))`,8000)&&posts("/api/cleanup/preview")===p0+1,posts("/api/cleanup/preview")-p0);
  await realClick("[data-cl='close']");await sleep(250);}
 await ev("document.getElementById('clScope').value='page'");
 rules.push({re:new RegExp("section="+sec),method:"GET",mode:"drop",times:1});const b2=items(sec);await ev("document.getElementById('clView').dispatchEvent(new Event('change'))");
 ok("F6 a single dropped read heals by itself",await until("/مورد/.test(document.getElementById('clStatusLine').textContent)",8000)&&items(sec)===b2+2,items(sec)-b2);
 rules.push({re:new RegExp("section="+sec),method:"GET",mode:"drop",times:3});await realClick("#clPrev");await ev("document.getElementById('clOlder').dispatchEvent(new Event('change'))");
 ok("F7 a failed refresh of the same view keeps the last list, marked as old",await until("document.getElementById('clStatusLine').textContent.includes('فهرست قبلی')",12000)&&await ev("document.querySelectorAll('#clItems .row').length>0&&document.getElementById('clItems').classList.contains('clStale')"),await line());
 await realClick("#clStatusLine [data-retry=list]");ok("F8 retry clears the old mark",await until("!document.getElementById('clItems').classList.contains('clStale')&&/مورد/.test(document.getElementById('clStatusLine').textContent)",8000));}
// HTTP errors: 401 and 403 are not retried; 500 is retried and then explained
for(const [st,word,n] of [[401,"ورود مدیر لازم است",1],[403,"مجاز نیست",1],[500,"خطای سرور (HTTP 500)",3]]){
 rules.push({re:/section=inbox/,method:"GET",mode:"status",status:st,times:n});const b=items("inbox");
 await ev("(()=>{const s=document.getElementById('clSection');s.value='inbox';s.dispatchEvent(new Event('change'))})()");
 ok("H"+st+" Persian message",await until(`document.getElementById('clStatusLine').textContent.includes(${JSON.stringify(word)})`,10000),await line());
 ok("H"+st+" attempts: "+n,items("inbox")===b+n,items("inbox")-b);await realClick("#clStatusLine [data-retry=list]");await until("/مورد/.test(document.getElementById('clStatusLine').textContent)",8000);}
{rules.push({re:/section=inbox/,method:"GET",mode:"status",status:429,times:1});const b=items("inbox");
 await ev("(()=>{const s=document.getElementById('clSection');s.value='inbox';s.dispatchEvent(new Event('change'))})()");
 ok("H429 a rate-limited read is tried again and succeeds",await until("document.getElementById('clStatusLine').textContent.includes('پیام‌های Inbox')&&/مورد/.test(document.getElementById('clStatusLine').textContent)",8000)&&items("inbox")===b+2,items("inbox")-b);}
// the test-data panel and the first page load: Persian message and their own retry
{rules.push({re:/^\/api\/cleanup\/test-candidates/,method:"GET",mode:"drop",times:3});await realClick("#clTest");
 ok("L1 the test-data panel explains a failure and offers a retry",await until("!!document.querySelector('#clTestPanel [data-retry=test]')&&document.getElementById('clTestPanel').textContent.includes('ارتباط با سرور')",12000));
 await realClick("#clTestPanel [data-retry=test]");ok("L2 its retry loads the panel",await until("document.querySelectorAll('[data-open]').length===2",8000));
 rules.push({re:/^\/api\/cleanup\/sections/,method:"GET",mode:"drop",times:3});await go("/dashboard/cleanup");
 ok("L3 a failed first load explains itself and offers a retry",await until("!!document.querySelector('#clStatusLine [data-retry=all]')",15000),await line());
 await realClick("#clStatusLine [data-retry=all]");ok("L4 its retry loads the page",await until("/مورد/.test(document.getElementById('clStatusLine').textContent)",10000),await line());}
// timeout: one slow answer past the 10-second limit, then a normal one
{rules.push({re:/section=tasks/,method:"GET",mode:"delay",ms:10600,times:1});const b=items("tasks");
 await ev("(()=>{const s=document.getElementById('clSection');s.value='tasks';s.dispatchEvent(new Event('change'))})()");
 ok("T1 a timed-out read is tried again and the list arrives",await until("document.getElementById('clStatusLine').textContent.includes('خطای Cron و Task')&&/مورد/.test(document.getElementById('clStatusLine').textContent)",16000)&&items("tasks")===b+2,items("tasks")-b);}
// cleanup writes: never repeated automatically, never executed twice. At phone size, through the bottom sheet.
await size(390,844,true);await go("/dashboard/cleanup");await until("/مورد/.test(document.getElementById('clStatusLine').textContent)",10000);
{const trash=()=>q("SELECT COUNT(*) n FROM cleanup_trash WHERE state='trashed'")[0].n;
 const pick=async()=>{if(await ev("document.getElementById('clSection').value")!=="inbox"||await ev("document.getElementById('clView').value")!=="active"){await ev("(()=>{const s=document.getElementById('clSection');s.value='inbox';document.getElementById('clView').value='active';s.dispatchEvent(new Event('change'))})()");await sleep(300);}await until("document.querySelectorAll('#clItems .clPick:not(:disabled)').length>0",8000);await ev("(()=>{document.querySelectorAll('#clItems .clPick').forEach(x=>{x.checked=false});document.querySelector('#clItems .clPick:not(:disabled)').checked=true})()");await realClick("#clSelected");return await until("!!document.getElementById('clGo')",8000);};
 ok("P0 a preview opens",await pick());const t0=trash(),e0=posts("/api/cleanup/execute");
 rules.push({re:/^\/api\/cleanup\/execute$/,method:"POST",mode:"drop",times:1});await realClick("#clGo");
 ok("P1 a dropped write says the outcome is unknown, in Persian",await until("document.getElementById('clSheetBox').textContent.includes('نتیجه این عملیات معلوم نیست')",8000));
 await sleep(1500);ok("P2 the write was sent once, not retried",posts("/api/cleanup/execute")===e0+1&&trash()===t0,{p:posts("/api/cleanup/execute")-e0,t:trash()-t0});
 await realClick("#clGo");ok("P3 the owner's second confirm completes it once",await until("document.getElementById('clSheetBox').textContent.includes('انجام شد')",8000)&&trash()===t0+1);
 await realClick("[data-cl='close']");await until("!document.getElementById('clSheet')||document.getElementById('clSheet').hidden",3000);
 ok("P4 a second preview opens",await pick());const t1=trash(),e1=posts("/api/cleanup/execute");
 rules.push({re:/^\/api\/cleanup\/execute$/,method:"POST",mode:"dropAfter",times:1});await realClick("#clGo");
 await until("document.getElementById('clSheetBox').textContent.includes('نتیجه این عملیات معلوم نیست')",8000);ok("P5 a write that ran but lost its answer is not repeated automatically",posts("/api/cleanup/execute")===e1+1&&trash()===t1+1);
 await realClick("#clGo");ok("P6 confirming again reports it done and changes nothing more",await until("document.getElementById('clSheetBox').textContent.includes('انجام شد')",8000)&&trash()===t1+1);
 await realClick("[data-cl='close']");await sleep(300);
 ok("P7 a third preview opens",await pick());const t2=trash(),e2=posts("/api/cleanup/execute");
 await ev("(()=>{const b=document.getElementById('clGo');b.click();b.click();b.click()})()");await until("document.getElementById('clSheetBox').textContent.includes('انجام شد')",8000);await sleep(500);
 ok("P8 three fast clicks send one write",posts("/api/cleanup/execute")===e2+1&&trash()===t2+1,{p:posts("/api/cleanup/execute")-e2});
 await realClick("[data-cl='close']");
 ok("P9 a fourth preview opens",await pick());const t3=trash(),e3=posts("/api/cleanup/execute");
 rules.push({re:/^\/api\/cleanup\/execute$/,method:"POST",mode:"delay",ms:10600,times:1});await realClick("#clGo");
 ok("P10 a write that times out says the outcome is unknown",await until("document.getElementById('clSheetBox').textContent.includes('نتیجه این عملیات معلوم نیست')",15000));
 await sleep(1200);ok("P11 it was sent once and ran once on the server",posts("/api/cleanup/execute")===e3+1&&trash()===t3+1,{p:posts("/api/cleanup/execute")-e3,t:trash()-t3});
 await realClick("#clGo");ok("P12 confirming again reports it done, no second run",await until("document.getElementById('clSheetBox').textContent.includes('انجام شد')",8000)&&trash()===t3+1);await realClick("[data-cl='close']");await sleep(300);
 ok("P13 a fifth preview opens",await pick());const t4=trash(),e4=posts("/api/cleanup/execute");
 rules.push({re:/^\/api\/cleanup\/execute$/,method:"POST",mode:"status",status:500,times:1});await realClick("#clGo");
 ok("P14 an HTTP 500 on a write is explained and not retried",await until("document.getElementById('clSheetBox').textContent.includes('خطای سرور (HTTP 500)')",8000)&&posts("/api/cleanup/execute")===e4+1&&trash()===t4);
 await realClick("#clGo");ok("P15 the owner's confirm then completes it once",await until("document.getElementById('clSheetBox').textContent.includes('انجام شد')",8000)&&trash()===t4+1);await realClick("[data-cl='close']");await sleep(300);
 ok("P17a a sixth preview opens",await pick());rules.push({re:/^\/api\/cleanup\/execute$/,method:"POST",mode:"status",status:409,error:"operation_failed",times:1});await realClick("#clGo");
 ok("P17 a failed operation says, in Persian, to take a new preview",await until("document.getElementById('clSheetBox').textContent.includes('این عملیات کامل نشد')",8000));await realClick("[data-cl='close']");await sleep(300);
 rules.push({re:/^\/api\/cleanup\/preview$/,method:"POST",mode:"status",status:401,times:1});const pv1=posts("/api/cleanup/preview");
 await ev("(()=>{document.querySelectorAll('#clItems .clPick').forEach(x=>{x.checked=false});document.querySelector('#clItems .clPick:not(:disabled)').checked=true})()");await realClick("#clSelected");
 ok("P16 a 401 on a preview says the admin login is needed, and is not retried",await until("document.getElementById('clSheetBox')?.textContent.includes('ورود مدیر لازم است')",8000)&&posts("/api/cleanup/preview")===pv1+1);await realClick("[data-cl='close']");
 await sleep(300);ok("S5a a preview opens",await pick());const t5=trash(),e5=posts("/api/cleanup/execute");rules.push({re:/^\/api\/cleanup\/execute$/,method:"POST",mode:"delay",ms:800,times:1});
 await ev("(()=>{const g=document.getElementById('clGo');g.click();const c=g.cloneNode(true);c.disabled=false;c.id='isoGo';g.after(c);c.click();c.click()})()");
 await until("document.getElementById('clSheetBox').textContent.includes('انجام شد')",8000);await sleep(500);
 ok("S5 a second confirm while the first runs sends nothing (busy flag alone)",posts("/api/cleanup/execute")===e5+1&&trash()===t5+1,{p:posts("/api/cleanup/execute")-e5,t:trash()-t5});
 await realClick("[data-cl='close']");
 // Trash and Restore still work
 await ev("(()=>{const v=document.getElementById('clView');v.value='trash';v.dispatchEvent(new Event('change'))})()");
 ok("TR1 Trash lists them",await until("document.getElementById('clStatusLine').textContent.includes('سطل زباله')&&document.querySelectorAll('#clItems [data-pg=restore]').length>=1",8000));
 const tr=trash();await realClick("#clItems [data-pg=restore]");await until("!!document.getElementById('clGo')",8000);await realClick("#clGo");
 ok("TR2 one item is restored",await until("document.getElementById('clSheetBox').textContent.includes('انجام شد')",8000)&&trash()===tr-1);await realClick("[data-cl='close']");}
const errs=events.filter(e=>e.method==="Runtime.exceptionThrown").map(e=>e.params?.exceptionDetails?.exception?.description||e.params?.exceptionDetails?.text);
ok("B1 no script error in the whole run",errs.length===0,errs.slice(0,3));
ok("B2 no Telegram call",W.tg.length===0,W.tg.length);
try{ws.close();chrome.kill();server.close();}catch{}
done();process.exit(0);
