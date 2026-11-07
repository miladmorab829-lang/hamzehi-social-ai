// FINAL ACCEPTANCE — Cleanup "مشاهده بخش" must MOVE THE VIEWPORT to the chosen list, in real headless Chrome with real mouse clicks.
// Measures window.scrollY before/after and the on-screen box of the list header and its first row against the sticky app bar, at
// phone and desktop sizes, long and short pages, several sections, instant and slow list loading. Usage: node tests/harness/browser_cleanup_scroll.mjs
import fs from "node:fs";import path from "node:path";import http from "node:http";import os from "node:os";import {spawn} from "node:child_process";import {fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("browser_cleanup_scroll");
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

// more rows for long pages; the inbox list is the long one, tasks the short one
for(let i=9;i<=45;i++)fill("autonomy_tasks",{id:"tf"+i,module:"content",action:"generate_and_queue",status:"failed",error:"old failure "+i,created_at:OLD,updated_at:OLD,finished_at:OLD});
for(let i=41;i<=60;i++)fill("inbox_messages",{id:"ub"+i,platform:"telegram",lead_id:null,conversation_id:null,provider_sender_id:null,message:"پیام بدون فرستنده "+i,status:"new",created_at:OLD,updated_at:OLD});
await go("/dashboard");const KEY=await ev("typeof KEY==='string'?KEY:''");await ev(`localStorage.setItem(${JSON.stringify(KEY)},"tok")`);
// what the owner sees: scroll offset, sticky bar bottom, list header and first list row on screen
const M=()=>ev(`(()=>{const bar=document.querySelector('.appbar'),ab=bar?Math.max(0,bar.getBoundingClientRect().bottom):0,h=document.getElementById('clStatusLine').getBoundingClientRect(),r=document.querySelector('#clItems .row'),rb=r?r.getBoundingClientRect():null;
 return {y:Math.round(scrollY),ih:innerHeight,bar:Math.round(ab),hdr:Math.round(h.top),row:rb?Math.round(rb.top):null,rowB:rb?Math.round(rb.bottom):null,max:document.documentElement.scrollHeight-innerHeight}})()`);
const loaded=sec=>`document.getElementById('clSection').value===${JSON.stringify(sec)}&&/مورد/.test(document.getElementById('clStatusLine').textContent)&&!document.getElementById('clItems').classList.contains('clWaiting')`;
const pick=async sec=>{await ev(`(()=>{const s=document.getElementById('clSection');s.value=${JSON.stringify(sec)};s.dispatchEvent(new Event('change'))})()`);return until(loaded(sec),10000)};
// wait until the page has stopped moving (scrollY unchanged for 400 ms), at most 5 s: measure the final position, not a frame of an animation
const settle=async()=>{await sleep(600);let last=null,same=0;const t=Date.now();while(Date.now()-t<5000){const y=await ev("scrollY");same=y===last?same+1:0;last=y;if(same>=4)return;await sleep(100);}};
const visible=m=>m.row!==null&&m.hdr>=m.bar-1&&m.row>=m.bar-1&&m.rowB<=m.ih+1&&m.row<m.ih-20;
// Engine modes. "native": this Chrome. "webkit": like Safari/WebKit (iPhone, Telegram in-app on iOS) a running smooth scroll stops
// when the page content changes, which is exactly what loading the list does. "nosmooth": smooth scroll requests are ignored.
// "inertia": real wheel input keeps arriving for 0.45 s after the click (trackpad momentum), which stops a smooth scroll in Chrome.
const MODE={native:"",inertia:"",
 webkit:"(()=>{const p=document.getElementById('cleanupPanel');new MutationObserver(()=>{scrollTo({left:scrollX,top:scrollY,behavior:'instant'})}).observe(p,{childList:true,characterData:true,subtree:true})})()",
 nosmooth:"(()=>{const sm=o=>o&&typeof o==='object'&&o.behavior==='smooth';const w=window.scrollTo.bind(window),e=Element.prototype.scrollIntoView;window.scrollTo=window.scroll=function(a,b){if(sm(a))return;return arguments.length>1?w(a,b):w(a)};Element.prototype.scrollIntoView=function(o){if(sm(o))return;return e.call(this,o)}})()"};
const CASES=[];
for(const mode of ["native","webkit","nosmooth","inertia"])
 for(const [vn,w,h,mobile] of (mode==="inertia"?[["desktop",1280,800,false]]:[["phone",390,844,true],["desktop",1280,800,false],["phone-small",360,640,true]]))
  for(const [from,to] of (vn==="phone-small"?[["inbox","tasks"]]:[["inbox","tasks"],["tasks","inbox"]]))
   for(const delay of (mode==="native"?[0,300,900,2500]:mode==="inertia"?[0,300,900]:[0,900,2500]))CASES.push({mode,vn,w,h,mobile,from,to,delay});
CASES.push({mode:"native",vn:"desktop-tall",w:1280,h:2400,mobile:false,from:"tasks",to:"inbox",delay:900,short:true});
CASES.push({mode:"webkit",vn:"desktop-tall",w:1280,h:2400,mobile:false,from:"tasks",to:"inbox",delay:900,short:true});
CASES.push({mode:"native",vn:"phone reduced-motion",w:390,h:844,mobile:true,from:"inbox",to:"tasks",delay:900,reduce:true});
// optional split for low-memory machines: SCROLL_MODES=native,webkit runs only those modes; SCROLL_NO_EXTRAS=1 skips the extra scenarios
const ONLY=(process.env.SCROLL_MODES||"").split(",").filter(Boolean),EXTRAS=!process.env.SCROLL_NO_EXTRAS;
if(ONLY.length)CASES.splice(0,CASES.length,...CASES.filter(c=>ONLY.includes(c.mode)));
let lastSize="";
for(const c of CASES){const tag=`[${c.mode}] ${c.vn} ${c.from}→${c.to} delay ${c.delay}ms`;
 await cdp("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:c.reduce?"reduce":""}]},S);const sz=c.w+"x"+c.h;if(sz!==lastSize){await size(c.w,c.h,c.mobile);lastSize=sz;}
 await go("/dashboard/cleanup");await until("/مورد/.test(document.getElementById('clStatusLine').textContent)",10000);
 if(!(await pick(c.from))){ok(tag+" setup",false);continue}
 await realClick("#clTest");await until("document.querySelectorAll('[data-open]').length===2",10000);
 await ev("scrollTo(0,document.documentElement.scrollHeight)");await sleep(250);
 await ev(`document.querySelector('[data-open=${c.to}]').scrollIntoView({block:'center'})`);await sleep(250);
 const m0=await M();const off=!visible(m0);if(MODE[c.mode])await ev(MODE[c.mode]);
 await ev("(()=>{window.__clk=0;window.__lw=0;addEventListener('mousedown',()=>{window.__clk=performance.now()},{once:true});addEventListener('wheel',()=>{window.__lw=performance.now()},{passive:true})})()");
 if(c.delay)rules.push({re:new RegExp("section="+c.to),method:"GET",mode:"delay",ms:c.delay,times:1});
 await ev("(()=>{window.__tr=[];const t0=performance.now();const f=()=>{window.__tr.push([Math.round(performance.now()-t0),Math.round(scrollY),document.documentElement.scrollHeight]);if(performance.now()-t0<4000)requestAnimationFrame(f)};requestAnimationFrame(f)})()");
 await realClick(`[data-open=${c.to}]`,"center");
 if(c.mode==="inertia"){const t=Date.now();while(Date.now()-t<450){await cdp("Input.dispatchMouseEvent",{type:"mouseWheel",x:200,y:400,deltaX:0,deltaY:30},S);await sleep(30);}}
 // let any smooth scroll finish after the rows arrive
 await until(loaded(c.to),c.delay+8000);await settle();const m1=await M();
 ok(tag+" section selected and loaded",await ev(loaded(c.to)));
 if(c.mode==="inertia")ok(tag+" precondition: all momentum input reached the page within 1.1 s of the click",await ev("window.__lw>0&&window.__lw-window.__clk<1100"),await ev("Math.round(window.__lw-window.__clk)"));
 if(!c.short)ok(tag+" precondition: list was off screen before the click",off,m0);
 ok(tag+" VIEWPORT MOVED (scrollY changed)",c.short?true:Math.abs(m1.y-m0.y)>40,{before:m0.y,after:m1.y});
 ok(tag+" list header and first row visible below the sticky bar",visible(m1),m1);
 c.res={m0,m1,trace:await ev("(window.__tr||[]).filter((x,i,a)=>i===0||x[1]!==a[i-1][1]||x[2]!==a[i-1][2])")};
}
// the owner scrolls away on purpose after arriving: the page must not pull them back
if(EXTRAS){await size(1280,800,false);await go("/dashboard/cleanup");await until("/مورد/.test(document.getElementById('clStatusLine').textContent)",10000);await pick("inbox");
 await realClick("#clTest");await until("document.querySelectorAll('[data-open]').length===2",10000);await ev("scrollTo(0,document.documentElement.scrollHeight)");await sleep(250);
 await realClick("[data-open=tasks]");await until(loaded("tasks"),9000);await sleep(1500);const a=await M();
 for(let i=0;i<12;i++){await cdp("Input.dispatchMouseEvent",{type:"mouseWheel",x:200,y:400,deltaX:0,deltaY:100},S);await sleep(40);}await sleep(1800);const b=await M();
 ok("U1 a later owner scroll is not undone",visible(a)&&b.y>=a.y+600,{arrived:a.y,after:b.y});}
// a failed list load: the error line with its retry button must still come on screen (WebKit-like engine)
if(EXTRAS){await size(390,844,true);await go("/dashboard/cleanup");await until("/مورد/.test(document.getElementById('clStatusLine').textContent)",10000);await pick("inbox");
 await realClick("#clTest");await until("document.querySelectorAll('[data-open]').length===2",10000);await ev("scrollTo(0,document.documentElement.scrollHeight)");await sleep(250);
 await ev("document.querySelector('[data-open=tasks]').scrollIntoView({block:'center'})");await sleep(200);const m0=await M();await ev(MODE.webkit);
 rules.push({re:/section=tasks/,method:"GET",mode:"status",status:500,times:6});await realClick("[data-open=tasks]");
 await until("/✕/.test(document.getElementById('clStatusLine').textContent)",12000);await settle();const m1=await M();rules.forEach(x=>{if(String(x.re).includes("tasks"))x.times=0});
 ok("F1 failed load: the error line is on screen below the sticky bar",Math.abs(m1.y-m0.y)>40&&m1.hdr>=m1.bar-1&&m1.hdr<m1.ih*0.5&&await ev("/✕/.test(document.getElementById('clStatusLine').textContent)"),{m0,m1});}
// from the Trash view: switches back to the active list and shows it (WebKit-like engine)
if(EXTRAS){await size(1280,800,false);await go("/dashboard/cleanup");await until("/مورد/.test(document.getElementById('clStatusLine').textContent)",10000);await pick("inbox");
 await ev("(()=>{const v=document.getElementById('clView');v.value='trash';v.dispatchEvent(new Event('change'))})()");await until("document.getElementById('clStatusLine').textContent.includes('سطل زباله')",8000);
 await realClick("#clTest");await until("document.querySelectorAll('[data-open]').length===2",10000);await ev("scrollTo(0,document.documentElement.scrollHeight)");await sleep(250);
 const m0=await M();await ev(MODE.webkit);rules.push({re:/section=tasks/,method:"GET",mode:"delay",ms:700,times:1});await realClick("[data-open=tasks]");
 await until(loaded("tasks"),9000);await settle();const m1=await M();
 ok("T1 from Trash: active list shown and on screen",await ev("document.getElementById('clView').value==='active'")&&Math.abs(m1.y-m0.y)>40&&visible(m1),{m0,m1});}
// repeated clicks: same section again after scrolling away, then a different section
if(EXTRAS){await size(390,844,true);await go("/dashboard/cleanup");await until("/مورد/.test(document.getElementById('clStatusLine').textContent)",10000);await pick("inbox");
 await realClick("#clTest");await until("document.querySelectorAll('[data-open]').length===2",10000);
 await ev(MODE.webkit);
 for(const [i,sec] of [[1,"tasks"],[2,"tasks"],[3,"inbox"],[4,"tasks"]]){
  await ev("scrollTo(0,document.documentElement.scrollHeight)");await sleep(250);await ev(`document.querySelector('[data-open=${sec}]').scrollIntoView({block:'center'})`);await sleep(200);
  const m0=await M();rules.push({re:new RegExp("section="+sec),method:"GET",mode:"delay",ms:700,times:1});
  await realClick(`[data-open=${sec}]`);await until(loaded(sec),9000);await settle();const m1=await M();
  ok(`[webkit] repeat ${i} (${sec}) viewport moved and list visible`,Math.abs(m1.y-m0.y)>40&&visible(m1),{m0,m1});}
}
const errs=events.filter(e=>e.method==="Runtime.exceptionThrown").map(e=>e.params?.exceptionDetails?.exception?.description||e.params?.exceptionDetails?.text);
ok("B1 no script error in the whole run",errs.length===0,errs.slice(0,3));
ok("B2 no Telegram call",W.tg.length===0,W.tg.length);
ok("B3 no cleanup write was sent",log.filter(x=>x.m==="POST"&&x.u.startsWith("/api/cleanup/")).length===0);
if(process.env.SCROLL_DUMP)fs.writeFileSync(process.env.SCROLL_DUMP,JSON.stringify(CASES,null,1));
try{ws.close();chrome.kill();server.close();}catch{}
done();process.exit(0);
