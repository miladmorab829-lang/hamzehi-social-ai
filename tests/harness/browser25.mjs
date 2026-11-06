// PHASE 25B — real Chrome (headless) against a local server with synthetic data: clicks through delete, confirm, Trash and restore at phone
// and desktop sizes. Local only. Emulated iPhone viewport: this is not a test on a real iPhone. Usage: CHROME=<path> node tests/harness/browser25.mjs [outDir]
import fs from "node:fs";import path from "node:path";import http from "node:http";import os from "node:os";import {spawn} from "node:child_process";import {fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("browser25");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const OUT=process.argv[2]||path.join(os.tmpdir(),"browser25");fs.mkdirSync(OUT,{recursive:true});
const CHROME=process.env.CHROME||"C:/Program Files/Google/Chrome/Application/chrome.exe";
if(!fs.existsSync(CHROME)){console.log("browser25 → SKIPPED: Chrome not found");process.exit(0);}
const T=new Date(Date.now()-40*86400000).toISOString();
const W=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on"}});const {q,dbrun,call,send}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
for(const p of ["/api/quotes","/api/si/knowledge/product","/api/owner-escalations","/api/leads/outreach","/api/content/pipeline"])await call(p,null,"GET");
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/phase25-delete-system/01-migration.sql"),"utf8"));
for(let i=1;i<=6;i++)dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",["bl"+i,"فروشگاه آزمایشی "+i,"c"+i,"discovered","normal",'{"target_market":"IRAN"}',T,T]);
dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES('bc','مشتری <b>واقعی</b>','c','customer','normal','{}',?,?)",[T,T]);
await send({id:8101,name:"Web",username:"uweb"},"سلام <img src=x onerror=window.__xss=1>");
for(let i=1;i<=3;i++)dbrun("INSERT INTO system_events VALUES(?,?,?,?,?,?)",["ev"+i,"scheduled_step_failed","error","خطای قدیمی "+i,"{}",T]);

const server=http.createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);
 const r=await W.run(new Request("https://w.test"+req.url,{method:req.method,headers:Object.fromEntries(Object.entries(req.headers).filter(([k])=>!["host","connection","content-length"].includes(k))),body:["GET","HEAD"].includes(req.method)?undefined:body}));
 res.writeHead(r.status,{"Content-Type":r.headers.get("Content-Type")||"text/plain"});res.end(Buffer.from(await r.arrayBuffer()));}catch(e){res.writeHead(500);res.end(String(e));}});
await new Promise(r=>server.listen(0,"127.0.0.1",r));const PORT=server.address().port,BASE=`http://127.0.0.1:${PORT}`;

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
const until=async(expr,ms=8000)=>{const t=Date.now();while(Date.now()-t<ms){if(await ev(expr).catch(()=>false))return true;await sleep(120);}return false;};
const size=(w,h,mobile)=>cdp("Emulation.setDeviceMetricsOverride",{width:w,height:h,deviceScaleFactor:mobile?2:1,mobile},S);
const go=async p=>{await cdp("Page.navigate",{url:BASE+p},S);await until("document.readyState==='complete'");};
const shot=async name=>{const r=await cdp("Page.captureScreenshot",{format:"png"},S);fs.writeFileSync(path.join(OUT,name+".png"),Buffer.from(r.result.data,"base64"));};
// the list re-renders on its refresh timer, so wait for the element and report a click that found nothing
const click=async sel=>{const js=`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;e.click();return true})()`;const t=Date.now();while(Date.now()-t<6000){if(await ev(js))return true;await sleep(100);}console.log("CLICK_MISS",sel);return false;};
const overflow=()=>ev("document.documentElement.scrollWidth-document.documentElement.clientWidth");
const tap=sel=>ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 0;const r=e.getBoundingClientRect();return Math.round(r.height)})()`);

await go("/dashboard");const KEY=await ev("typeof KEY==='string'?KEY:''");await ev(`localStorage.setItem(${JSON.stringify(KEY)},"tok")`);
ok("B0 the page script exposes its token key",!!KEY);

for(const [name,w,h,mobile] of [["iphone",390,844,true],["desktop",1280,900,false]]){
 await size(w,h,mobile);
 await go("/dashboard/cleanup?section=leads");await until("!!document.querySelector('#clItems .row')");
 ok(name+" 1 cleanup list renders",await until("document.querySelectorAll('#clItems .row').length>0"));
 ok(name+" 2 no sideways scroll on the page",(await overflow())<=1,await overflow());
 await shot(name+"-cleanup");
 const before=await ev("document.querySelectorAll('#clItems .row').length");
 ok(name+" 3 a protected row shows its reason and no active button",await ev("[...document.querySelectorAll('#clItems .row')].some(r=>r.textContent.includes('مشتری واقعی است')&&r.querySelector('button[data-pg]').disabled)"));
 await click("#clItems .row button[data-pg='trash']:not([disabled])");
 ok(name+" 4 the sheet opens with the phrase",await until("!document.getElementById('clSheet').hidden&&!!document.getElementById('clPhrase')"));
 await shot(name+"-sheet");
 ok(name+" 5 sheet buttons are tap-sized",(await tap("#clGo"))>=40,await tap("#clGo"));
 await click("#clGo");ok(name+" 6 no phrase, no delete",await until("document.getElementById('clSheetBox').textContent.includes('عبارت تأیید درست نیست')"));
 const phrase=await ev("document.querySelector('#clSheetBox b:nth-of-type(2)')?.textContent||[...document.querySelectorAll('#clSheetBox b')].pop().textContent");
 await ev(`document.getElementById('clPhrase').value=${JSON.stringify(phrase)}`);await click("#clGo");
 ok(name+" 7 confirmed delete finishes",await until("document.getElementById('clSheetBox').textContent.includes('انجام شد')"));
 await click("[data-cl='close']");
 ok(name+" 8 the row left the list",await until(`document.querySelectorAll('#clItems .row').length===${before-1}`));
 await ev("document.getElementById('clView').value='trash';document.getElementById('clView').dispatchEvent(new Event('change'))");
 ok(name+" 9 Trash shows it",await until("document.querySelectorAll('#clItems button[data-pg=\"restore\"]').length>=1"));
 await click("#clItems button[data-pg='restore']");await until("!!document.getElementById('clSheetBox')&&document.getElementById('clSheetBox').textContent.includes('بازیابی هیچ پیامی را خودکار ارسال نمی‌کند')");
 const ph2=await ev("[...document.querySelectorAll('#clSheetBox b')].pop().textContent");if(await ev("!!document.getElementById('clPhrase')"))await ev(`document.getElementById('clPhrase').value=${JSON.stringify(ph2)}`);
 await click("#clGo");ok(name+" 10 restore finishes",await until("document.getElementById('clSheetBox').textContent.includes('انجام شد')"));await click("[data-cl='close']");
 // inside an existing list
 await go("/dashboard/sales");
 ok(name+" 11 inbox list carries the controls",await until("!!document.querySelector('#negotiationInboxItems .clBar')&&!!document.querySelector(\"#negotiationInboxItems [data-cl='one']\")"));
 ok(name+" 12 customer text shows as text and is not executed",await ev("window.__xss===undefined&&document.getElementById('negotiationInboxItems').textContent.includes('onerror=window.__xss')&&!document.querySelector('#negotiationInboxItems img[src=\"x\"]')"));
 ok(name+" 12b row controls stay out of the way until asked for",await ev("getComputedStyle(document.querySelector('#negotiationInboxItems .clRowCtl')).display==='none'"));
 await click("#negotiationInboxItems [data-cl='manage']");ok(name+" 12c the switch shows them",await ev("getComputedStyle(document.querySelector('#negotiationInboxItems .clRowCtl')).display!=='none'"));
 ok(name+" 13 no sideways scroll in the list",(await overflow())<=1,await overflow());
 await shot(name+"-inbox");
 await ev("document.querySelector(\"#negotiationInboxItems [data-cl='trash']\").scrollIntoView()");await click("#negotiationInboxItems [data-cl='trash']");
 ok(name+" 14 Trash opens in place",await until("document.getElementById('clSheetBox').textContent.includes('سطل زباله')"));await click("[data-cl='close']");
 await click("#negotiationInboxItems [data-cl='everything']");
 ok(name+" 15 delete all asks for the scope",await until("document.getElementById('clSheetBox').textContent.includes('کل موارد مجاز این بخش')"));await click("[data-cl='close']");
 // a real delete from inside the list, and its restore from Trash in the same place
 const rows0=await ev("document.querySelectorAll(\"#negotiationInboxItems [data-cl='one']\").length");await click("#negotiationInboxItems [data-cl='one']");await until("!!document.getElementById('clGo')");await click("#clGo");
 ok(name+" 15b a list row can be deleted in place",await until("document.getElementById('clSheetBox').textContent.includes('انجام شد')"));await click("[data-cl='close']");
 ok(name+" 15c and it leaves the list",await until(`document.querySelectorAll("#negotiationInboxItems [data-cl='one']").length===${rows0-1}`));
 await click("#negotiationInboxItems [data-cl='trash']");await until("!!document.querySelector(\"#clSheetBox [data-cl='restore']\")");await click("#clSheetBox [data-cl='restore']");await until("!!document.getElementById('clGo')");await click("#clGo");
 ok(name+" 15d restore works from the list",await until("document.getElementById('clSheetBox').textContent.includes('انجام شد')"));await click("[data-cl='close']");
 await go("/dashboard/customers");
 ok(name+" 16 leads list carries the controls",await until("!!document.querySelector(\"#leadsListItems [data-cl='one']\")",10000));
 ok(name+" 16b a customer row has no delete button",await ev("[...document.querySelectorAll('#leadsListItems .row')].some(r=>r.textContent.includes('محافظت‌شده')&&!r.querySelector(\"[data-cl='one']\"))"));
 await go("/dashboard/errors");
 ok(name+" 17 errors list carries the controls",await until("!!document.querySelector(\"#errorsCenterItems [data-cl='selected']\")",10000));
}
const errs=events.filter(e=>e.method==="Runtime.exceptionThrown").map(e=>e.params?.exceptionDetails?.exception?.description||e.params?.exceptionDetails?.text);
ok("B9 no script error in the whole run",errs.length===0,errs.slice(0,3));
ok("B10 no Telegram call from the clicks",W.tg.filter(x=>String(x.body||"").includes("lead")).length===0);
try{ws.close();chrome.kill();server.close();}catch{}
done();process.exit(0);
