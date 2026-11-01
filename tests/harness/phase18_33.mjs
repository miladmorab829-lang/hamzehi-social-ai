// PHASE 18.33 — market isolation (owner instruction 2026-11-01): an IRAN failure never stops IRAQ and vice versa (dataset discovery and
// Ads), per-market counters/backoff/alerts, no Google Places call for IRAN (Maps Prohibited Territory), Iran-Ads suspension rollback.
// Offline only: node:sqlite, mocked network, nothing sent.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase18_33");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const imp=f=>import(pathToFileURL(path.join(SRC,f)).href);
const DD=await imp("dataset-discovery.js"),MI=await imp("market-isolation.js"),PB=await imp("places-budget.js"),AM=await imp("ads-markets.js"),WD=await imp("agent-watchdog.js");

// ---- a small sealed candidate file: 3 IRAN + 3 ARAB records
const cand=(m,i)=>({market:m,dataset:"overture",record_id:`${m}-${i}`,name:m==="IRAN"?`طلافروشی نمونه ${i} زرین`:`مجوهرات نموذج ${i} الذهبية`,city:m==="IRAN"?"تهران":"بغداد",
  url:`https://${m.toLowerCase()}-shop${i}.${m==="IRAN"?"ir":"iq"}/`,websites:[`https://${m.toLowerCase()}-shop${i}.${m==="IRAN"?"ir":"iq"}/`],host:`${m.toLowerCase()}-shop${i}.${m==="IRAN"?"ir":"iq"}`,phones:[],socials:[],emails:[],category:"jewelry_store",confidence:0.9,
  license:"CDLA-Permissive-2.0",source_datasets:["meta"]});
const candidates=[1,2,3,4,5,6,7,8].flatMap(i=>[cand("IRAN",i),cand("ARAB",i)]);
const doc={schema:DD.DISCOVERY_SCHEMA,release:"2026-11-09.0",generated_at:"2026-11-09T00:00:00Z",candidates};
doc.content_sha256=await DD.candidatesContentHash(candidates);
let raw=JSON.stringify(doc);const RAW0=raw;const st={gets:0,get:async()=>{st.gets++;return {size:raw.length,etag:"E"+raw.length,text:async()=>raw};},head:async()=>({etag:"E"+raw.length})};

const W=await makeWorld({});const {q,dbrun}=W;await W.call("/api/autonomy/status",null,"GET");
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
dbrun("CREATE TABLE IF NOT EXISTS lead_identities (identity_key TEXT PRIMARY KEY, identity_type TEXT NOT NULL, normalized_value TEXT NOT NULL, lead_id TEXT NOT NULL, source TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
const host=u=>new URL(u).hostname;
let failMarket=null;const calls={IRAN:0,ARAB:0};
const helpers={identities:({meta})=>[{identity_type:"domain",identity_key:"domain:"+host(meta.url)}],
  upsert:async(e,{name,meta})=>{calls[meta.target_market]++;if(failMarket===meta.target_market)throw new Error("simulated "+failMarket+" failure");
    const id="L-"+meta.dataset_record.record_id,t=new Date().toISOString();
    dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",[id,name,meta.url,"discovered","low",JSON.stringify(meta),t,t]);
    dbrun("INSERT INTO lead_identities VALUES(?,?,?,?,?,?,?)",["domain:"+host(meta.url),"domain","x",id,"t",t,t]);return {created:true,id};}};
const ENV={...W.env,DATASET_DISCOVERY:"on",DATASET_DISCOVERY_IRAN_PER_RUN:"1",DATASET_DISCOVERY_ARAB_PER_RUN:"1",DATASET_DISCOVERY_IRAN_DAILY_CAP:"10",DATASET_DISCOVERY_ARAB_DAILY_CAP:"10"};
let clock=Date.parse("2026-11-09T08:00:00.000Z");const at=ms=>()=>new Date(ms).toISOString();
const run=()=>{DD.resetCandidateFileCache();return DD.ingestDatasetCandidates(ENV,{settings:DD.discoverySettings({...ENV,DISCOVERY_BUCKET:st}),store:st,helpers,now:at(clock)});};
const kv=k=>q("SELECT value FROM system_kv WHERE key=?",[k])[0]?.value;
const count=m=>q("SELECT COUNT(*) n FROM leads WHERE json_extract(notes,'$.target_market')=?",[m])[0].n;
const tickMin=n=>{clock+=n*60000;};

// ---- I1/I2: one market fails, the other still imports in the same run
failMarket="IRAN";let r=await run();
ok("I1 an IRAN failure does not stop IRAQ: Iraq imports its 1 lead in the same run; the Iran error is recorded per market",
  count("ARAB")===1&&count("IRAN")===0&&r.errors?.IRAN&&!r.errors?.ARAB&&r.created.ARAB===1,r);
ok("I1b the failed Iran record is retried later (Iran cursor not advanced); Iraq cursor advanced",kv("dataset_discovery:cursor:2026-11-09.0:IRAN")==="0"&&kv("dataset_discovery:cursor:2026-11-09.0:ARAB")==="1");
ok("I1c daily counters stay separate: day:IRAN untouched, day:ARAB = 1",kv("dataset_discovery:day:2026-11-09:IRAN")===undefined&&kv("dataset_discovery:day:2026-11-09:ARAB")==="1");
failMarket="ARAB";tickMin(15);r=await run();
ok("I2 an IRAQ failure does not stop IRAN (Iran imports 1, Iraq records its error)",count("IRAN")===1&&count("ARAB")===1&&r.errors?.ARAB&&!r.errors?.IRAN,r);
try{ok("I2b the Iran success cleared Iran's failure state; Iraq's failure is counted on its own",JSON.parse(kv(MI.marketFailKey("dataset","IRAN"))).count===0&&JSON.parse(kv(MI.marketFailKey("dataset","ARAB"))).count===1);}catch(e){ok("I2b",false,String(e)+" "+JSON.stringify(q("SELECT key,value FROM system_kv WHERE key LIKE 'market_fail%'")));}

// ---- I3: repeated failures back off (no repeated work), alert raised, other market unaffected, then recovery
for(let i=0;i<2;i++){tickMin(15);await run();}
const f3=JSON.parse(kv(MI.marketFailKey("dataset","ARAB")));
ok("I3 after 3 consecutive Iraq failures a backoff starts (retry after 1 h)",f3.count===3&&Date.parse(f3.retry_after)-clock===3600000,f3);
const before=calls.ARAB;tickMin(15);r=await run();
ok("I3b during backoff Iraq is not attempted at all (no record touched), Iran keeps importing",calls.ARAB===before&&r.backoff?.ARAB&&r.created.IRAN===1,r);
const ev=q("SELECT COUNT(*) n FROM system_events WHERE type='dataset_market_failed' AND severity='warning'")[0].n;
ok("I3c failures are visible on the dashboard as warning events, at most one per market per hour (no flood)",ev>=1&&ev<=2,ev);
ok("I3d the Watchdog input lists the failing market (dataset:ARAB) and not Iran",JSON.stringify((await MI.failingMarkets(W.env)).map(f=>f.scope+":"+f.market))==='["dataset:ARAB"]');
let wd=null;try{wd=await WD.runWatchdog(W.env,{nowMs:clock,orchestratorOn:true});}catch(e){wd={error:String(e)};}
const alerts=q("SELECT code,agent FROM agent_alerts WHERE code='market_failing'");
ok("I3e the Watchdog raises one 'market_failing' alert for dataset:ARAB",alerts.length===1&&alerts[0].agent==="dataset:ARAB",{wd,alerts});
failMarket=null;tickMin(61);r=await run();
ok("I3f after the backoff the market is retried; success clears its state and it imports again",r.created.ARAB===1&&JSON.parse(kv(MI.marketFailKey("dataset","ARAB"))).count===0,r);
try{await WD.runWatchdog(W.env,{nowMs:clock,orchestratorOn:true});}catch{}
ok("I3g the Watchdog recovers the alert once the market succeeds",q("SELECT recovery_state FROM agent_alerts WHERE code='market_failing'").every(x=>x.recovery_state==="recovered"),q("SELECT * FROM agent_alerts WHERE code='market_failing'"));
ok("I4 no duplicates: every imported domain is distinct and one lead per record",q("SELECT COUNT(*) n FROM leads")[0].n===q("SELECT COUNT(DISTINCT contact) n FROM leads")[0].n);

// ---- I5: a broken shared file backs off instead of being downloaded every tick
raw=raw.replace("طلافروشی نمونه 3","طلافروشی دستکاری 3");const g0=st.gets;
for(let i=0;i<3;i++){tickMin(15);r=await run();}
const g1=st.gets;tickMin(15);r=await run();
ok("I5 a corrupted file is refused (content_hash_mismatch) and after 3 failures it is not downloaded again until the backoff ends",g1-g0===3&&st.gets===g1&&r.reason==="backoff",{g0,g1,gets:st.gets,r});

// ---- B: backoff ladder, both markets failing, Ads-scope backoff
{const E={DB:W.env.DB},t0=Date.parse("2026-11-10T00:00:00Z"),steps=[];
 for(let i=1;i<=9;i++){const f=await MI.recordMarketFailure(E,"ads","TEST",new Error("Bearer secret123 boom"),t0);steps.push(f.retry_after?(Date.parse(f.retry_after)-t0)/3600000:0);}
 ok("B1 backoff ladder: none for failures 1-2, then 1 h, 2 h, 4 h … capped at 24 h",JSON.stringify(steps)==="[0,0,1,2,4,8,16,24,24]",steps);
 ok("B1b stored error text is redacted (no bearer value in state or event)",!q("SELECT value FROM system_kv WHERE key='market_fail:ads:TEST'")[0].value.includes("secret123")&&!q("SELECT details_json d FROM system_events WHERE type='ads_market_failed'").some(r=>r.d.includes("secret123")));
 ok("B2 Ads scope backs off on its own key; another market is not affected",(await MI.marketBackoff(E,"ads","TEST",t0)).skip===true&&(await MI.marketBackoff(E,"ads","ARAB",t0)).skip===false);
 await MI.clearMarketFailure(E,"ads","TEST",t0);ok("B3 a success clears the state",(await MI.marketBackoff(E,"ads","TEST",t0)).skip===false);}
{raw=RAW0;await MI.clearMarketFailure(W.env,"dataset","FILE",clock);failMarket="BOTH";const both=helpers.upsert;helpers.upsert=async(e,a)=>{calls[a.meta.target_market]++;throw new Error("simulated failure "+a.meta.target_market);};
 tickMin(15);const rb=await run();helpers.upsert=both;failMarket=null;
 ok("B4 both markets failing in one run: each error is recorded separately, nothing is imported, nothing crashes",rb.errors?.IRAN&&rb.errors?.ARAB&&rb.created.IRAN===0&&rb.created.ARAB===0,rb);
 tickMin(15);const rc=await run();ok("B5 the next healthy run imports in both markets again",rc.created.IRAN===1&&rc.created.ARAB===1,rc);}

// ---- P: Google Places guard
{const fetches=[];const env={...W.env,GOOGLE_PLACES_API_KEY:"k",ADS_PLACES_DISCOVERY:"on"};
 const fx=async(u,o)=>{fetches.push(JSON.parse(o.body).locationRestriction?1:1);return new Response(JSON.stringify({places:[{id:"ChIJ"+"a".repeat(20)}]}),{status:200,headers:{"Content-Type":"application/json"}});};
 const led0=q("SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE '%places%'")[0].n;
 const ri=await PB.placesIdsOnlySearch(env,{market:"IRAN",city:"تهران",fetchImpl:fx});
 ok("P1 Places is never called for IRAN: refused before the key, budget reservation and request (market_blocked)",ri.ok===false&&ri.reason==="market_blocked"&&fetches.length===0,ri);
 const ra=await PB.placesIdsOnlySearch(env,{market:"ARAB",city:"بغداد",fetchImpl:fx});
 ok("P2 Places still works for IRAQ (ARAB)",ra.reason!=="market_blocked"&&fetches.length===1,{ra,fetches});
 ok("P3 the policy list contains only IRAN",JSON.stringify(Object.keys(PB.PLACES_BLOCKED_MARKETS))==='["IRAN"]'&&!PB.placesMarketBlocked("ARAB")&&PB.placesMarketBlocked("iran"));}

// ---- R: Iran-Ads suspension and its rollback (exact Production values from the backup)
{const B=path.join(REPO,"backups/ads-iran-suspend-20261101T1311Z");
 const rows=f=>{const s=fs.readFileSync(path.join(B,f),"utf8");return JSON.parse(s.slice(s.indexOf("[")))[0].results;};
 if(fs.existsSync(B)){
  const after=rows("ads_market-after.json"),before=rows("ads_market-before.json"),val=(rs,k)=>rs.find(x=>x.key===k).value;
  const rd=v=>AM.adsMarketReadiness(AM.adsMarketConfig("X",v),Infinity);
  ok("R1 the suspended Production row reads as DISABLED for Iran; Iraq's row is ready",rd(val(after,"ads_market:IRAN")).codes.includes("ADS_MARKET_DISABLED")&&rd(val(after,"ads_market:ARAB")).ready);
  const rb=fs.readFileSync(path.join(B,"ROLLBACK.sql"),"utf8").match(/value='([^']+)'/)[1];
  ok("R2 ROLLBACK.sql restores exactly the previous Iran row (ready again)",rb===val(before,"ads_market:IRAN")&&rd(rb).ready);
 } else ok("R1 backup present",false,B);}

// ---- A: real cron tick — Ads market isolation and no Places request for Iran
{const W2=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on",GOOGLE_PLACES_API_KEY:"k",ADS_PLACES_DISCOVERY:"on"}});
 const t=new Date().toISOString();W2.dbrun("CREATE TABLE IF NOT EXISTS system_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
 for(const m of ["IRAN","ARAB"])W2.dbrun("INSERT OR REPLACE INTO system_kv(key,value,updated_at) VALUES(?,?,?)",[`ads_market:${m}`,JSON.stringify({enabled:true,city:m==="IRAN"?"تهران":"بغداد",type:"gold",extra:"",runs_per_day:24,approved_by:"owner"}),t]);
 const places=[];const inner=globalThis.fetch;
 const mockFetch=async(u,o={})=>{const s=String(u?.url||u);
   if(s.startsWith("https://places.googleapis.com/")){places.push(JSON.parse(o.body).regionCode);return new Response(JSON.stringify({places:[]}),{status:200,headers:{"Content-Type":"application/json"}});}
   if(/api\.openai|api\.anthropic/.test(s))throw new Error("paid AI call attempted");
   if(/^https:\/\/(www\.)?(google|bing|duckduckgo|html\.duckduckgo)\./.test(s))return new Response("<html></html>",{status:200,headers:{"Content-Type":"text/html"}});
   if(s.startsWith("https://w.test/"))return W2.run(new Request(s,o));
   return new Response("",{status:404});};globalThis.fetch=mockFetch;
 const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;
 const tick=async env=>{const p=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},env,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);};
 await tick(W2.env);
 ok("A1 in a real cron tick with both Ads markets enabled, Google Places is requested for Iraq only (regionCode iq), never for Iran",places.length>=1&&places.every(c=>c==="iq"),places);
 // Make the IRAN Ads run throw (its market-gate read fails) and check Iraq still runs in the same tick.
 const W3=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on",GOOGLE_PLACES_API_KEY:"k",ADS_PLACES_DISCOVERY:"on"}});W3.dbrun("CREATE TABLE IF NOT EXISTS system_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
 for(const m of ["IRAN","ARAB"])W3.dbrun("INSERT OR REPLACE INTO system_kv(key,value,updated_at) VALUES(?,?,?)",[`ads_market:${m}`,JSON.stringify({enabled:true,city:m==="IRAN"?"تهران":"بغداد",type:"gold",extra:"",runs_per_day:24,approved_by:"owner"}),t]);
 globalThis.fetch=mockFetch;let thrown=0;const DB3=W3.env.DB,orig3=DB3.prepare.bind(DB3);
 DB3.prepare=sql=>{const st=orig3(sql);if(/ads|autopilot/i.test(sql)){const ob=st.bind.bind(st);st.bind=(...a)=>{if(a.some(x=>String(x).includes("IRAN"))){thrown++;throw new Error("simulated IRAN Ads failure");}return ob(...a);};}return st;};
 places.length=0;await tick(W3.env);DB3.prepare=orig3;
 const af=W3.q("SELECT value FROM system_kv WHERE key='market_fail:ads:IRAN'")[0]?.value;
 ok("A2 an IRAN Ads failure is isolated: it is recorded for Iran (dashboard + Watchdog state) and Iraq's Ads run still happens in that tick",
   thrown>=1&&af&&JSON.parse(af).count===1&&places.includes("iq"),{thrown,af,places,ev:W3.q("SELECT type,substr(details_json,1,200) d FROM system_events ORDER BY created_at DESC LIMIT 6")});
 globalThis.fetch=inner;}

done();
