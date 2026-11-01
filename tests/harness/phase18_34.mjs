// PHASE 18.34 — market safety completion (owner instruction 2026-11-01): Google Places blocked for IRAN on EVERY real path (Ads, manual
// CRM discovery, budget layer), Iran-Ads suspension survives dashboard saves (explicit, owner-approved, per-market lift/suspend), the
// Watchdog alert lifecycle per market (merge, history, recovery, acknowledgement, redaction), and a slow Iran Ads run no longer delays
// Iraq. Offline only: node:sqlite, mocked network, nothing sent; no Production access.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase18_34");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const imp=f=>import(pathToFileURL(path.join(SRC,f)).href);
const MI=await imp("market-isolation.js"),PB=await imp("places-budget.js"),WD=await imp("agent-watchdog.js"),OPS=await imp("agent-ops-store.js");
const KV="CREATE TABLE IF NOT EXISTS system_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)";
const json=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{"Content-Type":"application/json"}});
const html=()=>new Response("<html></html>",{status:200,headers:{"Content-Type":"text/html"}});

// ---------------------------------------------------------------- C: manual CRM discovery path
const places=[];let mock=null;
const W=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on",GOOGLE_PLACES_API_KEY:"k",ADS_PLACES_DISCOVERY:"on"}});
const {q,dbrun,call}=W;dbrun(KV);
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));await call("/api/autonomy/status",null,"GET");
mock=async(u,o={})=>{const s=String(u?.url||u);
  if(s.startsWith("https://places.googleapis.com/")){const b=JSON.parse(o.body||"{}");places.push({lang:b.languageCode,region:b.regionCode||null});return json({places:[]});}
  if(/api\.openai|api\.anthropic/.test(s))throw new Error("paid AI call attempted");
  if(s.startsWith("https://w.test/"))return W.run(new Request(s,o));
  if(/^https:\/\/(www\.|html\.)?(google|bing|duckduckgo)\./.test(s))return html();
  return new Response("",{status:404});};
globalThis.fetch=mock;
const crm=await call("/api/crm/lead-discovery",{type:"gold"});
ok("C1 manual CRM discovery (gold, both markets): Google Places is requested for Iraq (ar) only — never for Iran (fa)",places.length>=1&&places.every(p=>p.lang==="ar"),{places,status:crm.status});
const resv=q("SELECT details_json d FROM system_events WHERE type='places_reserved'").map(r=>JSON.parse(r.d));
ok("C2 no Places budget is reserved for Iran on the CRM path; Iraq's reservation carries market ARAB",resv.length>=1&&resv.every(x=>x.market==="ARAB"),resv);
const diag=JSON.stringify(crm.body?.discovery_diagnostics||crm.body?.summary?.discovery_diagnostics||crm.body||{});
ok("C3 the Iran CRM group reports the Places step as blocked (market_blocked), not as an error",/market_blocked/.test(diag),diag.slice(0,400));
{const al=["ir","iran","ایران"];const ra=await Promise.all(al.map(m=>PB.reservePlacesRequest(W.env,{sku:"pro",purpose:"t",market:m})));
 const n0=places.length,si=await Promise.all([...al,null,"XX"].map(m=>PB.placesIdsOnlySearch(W.env,{market:m,city:"تهران",fetchImpl:mock})));
 ok("C5 aliases of Iran (ir / iran / ایران) are blocked too, and a missing/unknown market never reaches Google (fail closed)",ra.every(x=>x.reserved===false&&x.reason==="market_blocked")&&si.every(x=>x.ok===false&&x.blocked===true)&&places.length===n0,{ra,si:si.map(x=>x.reason)});
 const sec=await MI.recordMarketFailure(W.env,"ads","SECTEST",new Error("fetch failed key "+["AI","za","SyA","1234567890abcdefghijklmnopqrstuvw"].join("")+" and "+["sk","-abcdefghijklmnopqrstu"].join("")));
 ok("C6 bare Google API keys and sk- style keys are redacted from stored errors",!/AIzaSy|sk-abcdef/.test(sec.error)&&/redacted/.test(sec.error),sec.error);
 const r1=await PB.reservePlacesRequest(W.env,{sku:"pro",purpose:"t",market:"IRAN"}),r2=await PB.reservePlacesRequest(W.env,{sku:"pro",purpose:"t",market:"ARAB"});
 ok("C4 budget layer: a reservation for IRAN is refused (market_blocked) before any spend; ARAB is reserved",r1.reserved===false&&r1.reason==="market_blocked"&&r2.reserved===true,{r1,r2});}

// ---------------------------------------------------------------- S: suspension survives dashboard saves
const PROD_IRAN=JSON.parse(JSON.parse(fs.readFileSync(path.join(REPO,"backups/ads-iran-suspend-20261101T1311Z/ads_market-after.json"),"utf8").replace(/^[^\[]*/,""))[0].results.find(r=>r.key==="ads_market:IRAN").value);
const ARAB0={enabled:true,city:"ALL",type:"gold",extra:"",runs_per_day:24,approved_by:"owner",approved_at:"2026-10-30T09:27:28.541Z"};
const t0=new Date().toISOString();
dbrun("INSERT OR REPLACE INTO system_kv(key,value,updated_at) VALUES(?,?,?)",["ads_market:IRAN",JSON.stringify(PROD_IRAN),t0]);
dbrun("INSERT OR REPLACE INTO system_kv(key,value,updated_at) VALUES(?,?,?)",["ads_market:ARAB",JSON.stringify(ARAB0),t0]);
const row=m=>JSON.parse(q("SELECT value FROM system_kv WHERE key=?",["ads_market:"+m])[0].value);
let r=await call("/api/ads/markets/config",{market:"IRAN",city:"تهران",enabled:false});
ok("S1 a dashboard save of the suspended Iran market (city change, still disabled) keeps the suspension and its reason/time/actor",r.status===200&&row("IRAN").suspended_reason===PROD_IRAN.suspended_reason&&row("IRAN").suspended_at===PROD_IRAN.suspended_at&&row("IRAN").suspended_by==="owner"&&row("IRAN").city==="تهران"&&row("IRAN").enabled===false,[r.status,row("IRAN")]);
const before=JSON.stringify(row("IRAN"));
r=await call("/api/ads/markets/config",{market:"IRAN",enabled:true,owner_approved:true});
ok("S2 enabling a suspended market without an explicit lift is refused (409 ads_market_suspended) and changes nothing",r.status===409&&r.body?.reason==="ads_market_suspended"&&JSON.stringify(row("IRAN"))===before,[r.status,r.body?.reason]);
r=await call("/api/ads/markets/config",{market:"ARAB",city:"بغداد",enabled:true,owner_approved:true});
ok("S3 saving the Iraq market works as before and never touches the Iran row",r.status===200&&row("ARAB").city==="بغداد"&&row("ARAB").enabled===true&&!row("ARAB").suspended&&JSON.stringify(row("IRAN"))===before,r.status);
r=await call("/api/ads/autopilot/stop",{});
ok("S4 the 'stop all Ads' button disables Iraq and keeps Iran's suspension record",r.status===200&&row("ARAB").enabled===false&&row("IRAN").suspended_reason===PROD_IRAN.suspended_reason&&row("IRAN").enabled===false,[row("IRAN"),row("ARAB").enabled]);
const st=(await call("/api/ads/markets",null,"GET")).body;
ok("S5 the dashboard status shows the suspension (reason and time)",JSON.stringify(st).includes(PROD_IRAN.suspended_reason)&&JSON.stringify(st).includes(PROD_IRAN.suspended_at),JSON.stringify(st).slice(0,300));
r=await call("/api/ads/markets/config",{market:"IRAN",lift_suspension:true,enabled:true,city:"ALL",runs_per_day:24});
ok("S6 lifting needs explicit owner approval (403 without owner_approved; row unchanged)",r.status===403&&row("IRAN").suspended_reason===PROD_IRAN.suspended_reason,r.status);
r=await call("/api/ads/markets/config",{market:"IRAN",lift_suspension:true,enabled:true,city:"ALL",runs_per_day:24,owner_approved:true});
const lifted=row("IRAN"),ev=q("SELECT details_json d FROM system_events WHERE type='ads_market_suspension_lifted'").map(x=>JSON.parse(x.d));
ok("S7 an explicit owner-approved lift enables Iran, removes the suspension and keeps a traceable history (lifted at/by/reason + audit before/after)",
  r.status===200&&lifted.enabled===true&&!lifted.suspended_reason&&lifted.suspension_lifted_by==="owner"&&lifted.suspension_lifted_reason===PROD_IRAN.suspended_reason&&ev.length===1&&ev[0].before.suspended===true&&ev[0].after.suspended===false,[lifted,ev]);
r=await call("/api/ads/markets/config",{market:"IRAN",suspend:true,suspended_reason:"google_maps_prohibited_territory_iran"});
const ev2=q("SELECT details_json d FROM system_events WHERE type='ads_market_suspended'").map(x=>JSON.parse(x.d));
ok("S8 an explicit suspend (no approval needed — it disables) affects only that market and is audited",r.status===200&&row("IRAN").enabled===false&&row("IRAN").suspended_reason==="google_maps_prohibited_territory_iran"&&ev2.length===1&&row("ARAB").suspended!==true,[row("IRAN"),ev2]);

// ---------------------------------------------------------------- A: alert lifecycle per market (Watchdog)
{const E=W.env;let now=Date.parse("2026-11-12T08:00:00Z");const wd=async()=>{await WD.runWatchdog(E,{nowMs:now,orchestratorOn:false});};
 const al=a=>q("SELECT * FROM agent_alerts WHERE code='market_failing' AND agent=? ORDER BY first_seen_at",[a]);
 for(let i=0;i<3;i++){await MI.recordMarketFailure(E,"dataset","IRAN",new Error("Iran DB timeout token=abc123SECRET"),now);await MI.recordMarketFailure(E,"dataset","ARAB",new Error("Iraq store unavailable"),now);now+=15*60000;}
 await wd();
 ok("A1 Iran and Iraq failures raise two independent alerts (dataset:IRAN, dataset:ARAB), each with cause, fallback and severity",al("dataset:IRAN").length===1&&al("dataset:ARAB").length===1&&al("dataset:IRAN")[0].level==="warning"&&!!al("dataset:IRAN")[0].fallback_status&&/Iran DB timeout/.test(al("dataset:IRAN")[0].cause_redacted),q("SELECT code,agent,level FROM agent_alerts"));
 ok("A2 secrets are redacted in the alert, the failure state and the events (the redacted text is present)",/redacted/.test(al("dataset:IRAN")[0].cause_redacted+JSON.stringify(q("SELECT value FROM system_kv WHERE key='market_fail:dataset:IRAN'")))&&!/abc123SECRET/.test(JSON.stringify(q("SELECT * FROM agent_alerts")))&&!/abc123SECRET/.test(JSON.stringify(q("SELECT * FROM system_kv WHERE key LIKE 'market_fail:%'")))&&!/abc123SECRET/.test(JSON.stringify(q("SELECT * FROM system_events WHERE type LIKE '%market_failed'"))));
 await MI.recordMarketFailure(E,"dataset","IRAN",new Error("Iran DB timeout token=abc123SECRET"),now);await wd();now+=60000;
 ok("A3 a repeated identical failure is merged into the same alert (occurrences grow, no new row)",al("dataset:IRAN").length===1&&al("dataset:IRAN")[0].occurrences>=2,al("dataset:IRAN")[0]?.occurrences);
 const evI=()=>q("SELECT id,details_json d FROM system_events WHERE type='dataset_market_failed' AND id LIKE 'market-fail:dataset:IRAN:%'");
 const nSame=evI().length;await MI.recordMarketFailure(E,"dataset","IRAN",new Error("Iran DB timeout token=abc123SECRET"),now);
 const nSame2=evI().length;await MI.recordMarketFailure(E,"dataset","IRAN",new Error("Iran cursor read failed"),now);
 ok("A4 identical errors in the same hour are one event; a DIFFERENT error is kept as its own event (history not lost)",nSame2===nSame&&evI().length===nSame+1,[nSame,nSame2,evI().length]);
 ok("A5 each failure event records severity, time, cause, impact and fallback",evI().length>=2&&evI().every(e=>{const d=JSON.parse(e.d);return d.error&&d.impact&&d.fallback&&d.last_at;})&&q("SELECT severity FROM system_events WHERE type='dataset_market_failed'").every(x=>x.severity==="warning"));
 await MI.clearMarketFailure(E,"dataset","ARAB",now);await wd();
 const a=al("dataset:ARAB")[0],rec=q("SELECT details_json d FROM system_events WHERE type='dataset_market_recovered'").map(x=>JSON.parse(x.d));
 ok("A6 after a successful Iraq run its alert is marked recovered (time recorded) but stays unacknowledged and visible; Iran's alert stays open",
   a.recovery_state==="recovered"&&!!a.recovered_at&&a.acknowledged_at==null&&al("dataset:IRAN")[0].recovery_state==="open",[a,al("dataset:IRAN")[0]?.recovery_state]);
 ok("A7 the recovery is recorded as an event with the failure history (count, first time, last error)",rec.length===1&&rec[0].market==="ARAB"&&rec[0].failures===3&&rec[0].first_at&&/Iraq store/.test(rec[0].last_error),rec);
 for(let i=0;i<3;i++){await MI.recordMarketFailure(E,"dataset","ARAB",new Error("Iraq store unavailable"),now);now+=60000;}
 await wd();
 ok("A8 a recurrence before the owner acknowledges re-opens the SAME alert (no duplicate, history kept)",al("dataset:ARAB").length===1&&al("dataset:ARAB")[0].recovery_state==="open"&&al("dataset:ARAB")[0].occurrences>=2,al("dataset:ARAB"));
 const ack=await OPS.acknowledgeAlert(E,{id:al("dataset:ARAB")[0].id,actor:"owner",nowMs:now});
 await MI.clearMarketFailure(E,"dataset","ARAB",now);for(let i=0;i<3;i++){await MI.recordMarketFailure(E,"dataset","ARAB",new Error("Iraq store unavailable"),now);now+=60000;}await wd();
 const rows=al("dataset:ARAB");
 ok("A9 after the owner acknowledges, the old alert is kept as history and a new failure opens a new alert",ack.ok===true&&rows.length===2&&!!rows[0].acknowledged_at&&rows[1].acknowledged_at==null&&rows[1].recovery_state==="open",rows.map(x=>({ack:x.acknowledged_at,st:x.recovery_state})));
 ok("A10 Iran's alert was never affected by Iraq's recovery or acknowledgement",al("dataset:IRAN").length===1&&al("dataset:IRAN")[0].acknowledged_at==null&&al("dataset:IRAN")[0].recovery_state==="open");}

// ---------------------------------------------------------------- P: a slow Iran Ads run does not delay Iraq
{const W2=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on",GOOGLE_PLACES_API_KEY:"k",ADS_PLACES_DISCOVERY:"on"}});W2.dbrun(KV);
 const t=new Date().toISOString();
 for(const m of ["IRAN","ARAB"])W2.dbrun("INSERT OR REPLACE INTO system_kv(key,value,updated_at) VALUES(?,?,?)",[`ads_market:${m}`,JSON.stringify({enabled:true,city:m==="IRAN"?"تهران":"بغداد",type:"gold",extra:"",runs_per_day:24,approved_by:"owner"}),t]);
 let iranSearchesDone=0,iranSearches=0,iraqPlacesBeforeIranDone=null;
 globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);
   if(s.startsWith("https://places.googleapis.com/")){const b=JSON.parse(o.body||"{}");if(b.regionCode==="iq"&&iraqPlacesBeforeIranDone===null)iraqPlacesBeforeIranDone=iranSearches>0&&iranSearchesDone===0;places.push({region:b.regionCode});return json({places:[]});}
   if(/api\.openai|api\.anthropic/.test(s))throw new Error("paid AI call attempted");
   if(/^https:\/\/(www\.|html\.)?(google|bing|duckduckgo)\./.test(s)){const dq=decodeURIComponent(s);
     if(/طلافروشی|زرگری|تهران/.test(dq)){iranSearches++;await new Promise(res=>setTimeout(res,400));iranSearchesDone++;}return html();}
   if(s.startsWith("https://w.test/"))return W2.run(new Request(s,o));
   return new Response("",{status:404});};
 const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;
 const p=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},W2.env,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);
 const runs=W2.q("SELECT details_json d FROM system_events WHERE type='ad_autopilot_run'").map(x=>JSON.parse(x.d).market);
 ok("P1 with a slow Iran Ads run (search answers delayed), Iraq's run starts and reaches Places before Iran's searches finish (parallel markets)",iraqPlacesBeforeIranDone===true&&runs.includes("IRAN")&&runs.includes("ARAB"),{iraqPlacesBeforeIranDone,iranSearches,runs});
 const resv2=W2.q("SELECT details_json d FROM system_events WHERE type='ads_autopilot_reserved'").map(x=>JSON.parse(x.d).market);
 ok("P2 each market reserved exactly one Ads run of its own quota (parallel runs never share or exceed a quota)",resv2.filter(m=>m==="IRAN").length===1&&resv2.filter(m=>m==="ARAB").length===1,resv2);}

// ---------------------------------------------------------------- R: the real scheduler with the Production suspension rows
{const W3=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on",GOOGLE_PLACES_API_KEY:"k",ADS_PLACES_DISCOVERY:"on"}});W3.dbrun(KV);
 const t=new Date().toISOString();W3.dbrun("INSERT OR REPLACE INTO system_kv(key,value,updated_at) VALUES(?,?,?)",["ads_market:IRAN",JSON.stringify(PROD_IRAN),t]);
 W3.dbrun("INSERT OR REPLACE INTO system_kv(key,value,updated_at) VALUES(?,?,?)",["ads_market:ARAB",JSON.stringify(ARAB0),t]);
 const pl=[];globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);if(s.startsWith("https://places.googleapis.com/")){pl.push(JSON.parse(o.body||"{}").regionCode||JSON.parse(o.body||"{}").languageCode);return json({places:[]});}
   if(/api.openai|api.anthropic/.test(s))throw new Error("paid AI call attempted");if(s.startsWith("https://w.test/"))return W3.run(new Request(s,o));return html();};
 const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;const p=[];
 await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},W3.env,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);
 const ev=m=>W3.q("SELECT type,details_json d FROM system_events WHERE type IN ('ads_autopilot_reserved','ad_autopilot_run','ads_run_deferred')").filter(x=>JSON.parse(x.d).market===m).map(x=>x.type);
 ok("R1 real scheduler with the exact Production rows: the suspended Iran market reserves nothing, runs nothing and calls no Places; Iraq reserves and runs with Places (iq)",
   ev("IRAN").length===0&&ev("ARAB").includes("ads_autopilot_reserved")&&ev("ARAB").includes("ad_autopilot_run")&&pl.length>=1&&pl.every(c=>c==="iq"),{IRAN:ev("IRAN"),ARAB:ev("ARAB"),pl});}

done();
