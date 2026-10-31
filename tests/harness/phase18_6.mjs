// PHASE 18.6 — discovery activation readiness. Offline only: synthetic candidate files, an in-process R2-compatible store, mocked
// websites and robots.txt; nothing leaves the process, nothing is sent, uploaded or deployed, no Production resource is touched.
//  S*: master-switch strictness   M*: missing / unavailable / misconfigured store   I*: integrity, provenance, resumability
//  P*: Iran and Iraq pipelines independently (real cron → own-site check → Phase 18.1 ladder)   R*/D*: robots.txt and duplicates
//  G*: gates (autonomous qualification, owner approval before any send, no paid call)
import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase18_6");
const started=Date.now();
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const DD=await import(pathToFileURL(path.join(SRC,"dataset-discovery.js")).href);
const KEY="discovery/candidates-latest.json";
const rec=(id,o={})=>({market:"IRAN",dataset:"overture",record_id:id,license:"CDLA-Permissive-2.0",source_datasets:["meta"],name:"زرگری "+id,city:"Tehran",websites:[`https://${id}.ir/`],...o});
const file=(release,cands)=>({schema:DD.DISCOVERY_SCHEMA,release,candidates:cands});
// R2-compatible store: get/head with a content etag, read counters, optional failure modes.
const store=(doc,{getFail=false,headFail=false,textFail=false,key=KEY}={})=>{const s={gets:0,heads:0,doc};
  const body=()=>JSON.stringify(s.doc),etag=()=>"e"+[...body()].reduce((h,ch)=>(h*31+ch.charCodeAt(0))>>>0,7).toString(16);
  s.get=async k=>{s.gets++;if(getFail)throw new Error("R2 unavailable");return k===key?{size:body().length,etag:etag(),text:async()=>{if(textFail)throw new Error("stream reset");return body();}}:null;};
  s.head=async k=>{s.heads++;if(headFail)throw new Error("HEAD failed");return k===key?{etag:etag()}:null;};return s;};

// ---- websites and robots.txt (all in-process)
const page=(t,b)=>new Response(`<html><head><title>${t}</title></head><body>${b}</body></html>`,{status:200,headers:{"Content-Type":"text/html"}});
const SITES={
  "https://firuze-ds.ir/":()=>page("طلافروشی فیروزه","طلافروشی و زرگری فیروزه در تهران، فروش عمده. <a href=\"mailto:sales@firuze-ds.ir\">sales@firuze-ds.ir</a> تلفن 021-88776655"),
  "https://babil-ds.iq/":()=>page("مجوهرات بابل","محل ذهب ومجوهرات بابل في بغداد بالجملة <a href=\"mailto:info@babil-ds.iq\">info@babil-ds.iq</a> 07701234567"),
  "https://dup-ds.ir/":()=>page("طلافروشی دوپ","طلافروشی دوپ در تهران <a href=\"mailto:a@dup-ds.ir\">a@dup-ds.ir</a>"),
  "https://r404-ds.ir/":()=>page("طلافروشی چهار","طلافروشی چهار در تهران"),
  "https://ragent-ds.ir/":()=>page("طلافروشی ایجنت","طلافروشی ایجنت در تهران"),
  "https://rwild-ds.ir/":()=>page("طلافروشی وایلد","طلافروشی وایلد در تهران"),
  "https://rphp-ds.ir/index.php":()=>page("طلافروشی پی","طلافروشی پی در تهران"),
  "https://rnet-ds.ir/":()=>page("طلافروشی نت","طلافروشی نت در تهران"),
  "https://r503-ds.ir/":()=>page("طلافروشی سرور","طلافروشی سرور در تهران"),
  "https://flagoff-ds.ir/":()=>page("طلافروشی خاموش","طلافروشی خاموش در تهران")};
const ROBOTS={
  "https://ragent-ds.ir/robots.txt":()=>new Response("User-agent: BadBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\n",{status:200}),
  "https://rwild-ds.ir/robots.txt":()=>new Response("User-agent: *\nDisallow: /shop*\nDisallow: /*.php$\n",{status:200}),
  "https://rphp-ds.ir/robots.txt":()=>new Response("User-agent: *\nDisallow: /*.php$\n",{status:200}),
  "https://rnet-ds.ir/robots.txt":()=>{throw new TypeError("fetch failed");},
  "https://r503-ds.ir/robots.txt":()=>new Response("unavailable",{status:503})};
const fetched=[],paid=[];let inner=null,cur=null;
const mockFetch=async(u,o={})=>{const s=String(u?.url||u);
  if(s.startsWith("https://w.test/"))return cur.run(new Request(s,o));
  if(/places\.googleapis\.com|api\.openai\.com|api\.anthropic\.com|brave/.test(s)){paid.push(s);return new Response("{}",{status:500});}
  if(ROBOTS[s])return ROBOTS[s]();
  if(/\/robots\.txt$/.test(s))return new Response("",{status:404});
  if(SITES[s]){fetched.push(s);return SITES[s]();}
  if(/^https:\/\/[a-z0-9.-]+\.(ir|iq)\//.test(s)){fetched.push(s);return new Response("",{status:404});}
  if(/^https:\/\/www\.(google|bing)\.com\/search/.test(s))return new Response("<html></html>",{status:200,headers:{"Content-Type":"text/html"}});
  return (cur?.inner||inner)(u,o);};
// makeWorld installs its own fetch recorder each time: keep it underneath this mock (per world), as in phase18_4.
const world=async env=>{const w=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on",...env}});
  w.inner=globalThis.fetch;if(inner)globalThis.fetch=mockFetch;
  w.dbrun("CREATE TABLE IF NOT EXISTS lead_identities (identity_key TEXT PRIMARY KEY, identity_type TEXT NOT NULL, normalized_value TEXT NOT NULL, lead_id TEXT NOT NULL, source TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");return w;};
const W1=await world({});cur=W1;
inner=globalThis.fetch;globalThis.fetch=mockFetch;
const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;
const tick=async(w,env=w.env)=>{cur=w;const p=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},env,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);};
const ds=w=>w.q("SELECT * FROM leads").map(r=>({...r,meta:JSON.parse(r.notes||"{}")})).filter(r=>r.meta.provider==="dataset");
const ev=(w,t)=>w.q("SELECT COUNT(*) n FROM system_events WHERE type=?",[t])[0]?.n||0;
const intel=async(w,l)=>{cur=w;return l&&(await w.call("/api/leads/intelligence?id="+encodeURIComponent(l.id),null,"GET")).body?.item;};
const helpers={identities:({meta})=>[{identity_type:"domain",identity_key:"domain:"+new URL(meta.url).hostname.replace(/^www\./,"")}],
  upsert:async(env,{name,meta})=>{const id="h-"+meta.dataset_record.release+"-"+meta.dataset_record.record_id,t=new Date().toISOString();
    W1.dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",[id,name,meta.url,"discovered","low",JSON.stringify(meta),t,t]);
    W1.dbrun("INSERT INTO lead_identities VALUES(?,?,?,?,?,?,?)",["domain:"+new URL(meta.url).hostname.replace(/^www\./,""),"domain","x",id,"dataset_discovery",t,t]);return {created:true,id};}};
const ing=(st,o={})=>DD.ingestDatasetCandidates({...W1.env,DATASET_DISCOVERY:"on",...o},{settings:DD.discoverySettings({DATASET_DISCOVERY:"on",DISCOVERY_BUCKET:st,...o}),store:st,helpers});

// ---- S: only the exact value "on" activates discovery; DATASET_DISCOVERY="off" is inert even with a bound bucket
{const vals=["off","OFF","ON","On","true","1","yes","enabled"," on","on ","",undefined,null];
 const st=store(file("2026-11-01.0",[rec("s1")]));let anyEnabled=false,anyCreated=false;
 for(const v of vals){const env={...W1.env,DATASET_DISCOVERY:v,DISCOVERY_BUCKET:st};if(DD.discoverySettings(env).enabled)anyEnabled=true;
   const r=await DD.ingestDatasetCandidates(env,{store:st,helpers});if(!r.skipped||r.reason!=="disabled")anyCreated=true;}
 ok("S1 13 near-miss values (\"OFF\", \"ON\", \"true\", \"1\", \" on\", \"\", unset …) never enable discovery and never read the bucket — only the exact string \"on\" does",!anyEnabled&&!anyCreated&&st.gets===0&&st.heads===0&&DD.discoverySettings({DATASET_DISCOVERY:"on",DISCOVERY_BUCKET:st}).enabled,{gets:st.gets});
 const t=new Date().toISOString();
 W1.dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",["ds-flagoff","طلافروشی خاموش","https://flagoff-ds.ir/","discovered","low",
   JSON.stringify({provider:"dataset",source:"overture_places",url:"https://flagoff-ds.ir/",website:"https://flagoff-ds.ir/",target_market:"IRAN",type:"gold_fa",dataset_record:{dataset:"overture",record_id:"fo",release:"2026-10-30.0",license:"CDLA-Permissive-2.0"},dataset_claims:{name:"طلافروشی خاموش",city:"Tehran",trusted:false}}),t,t]);
 fetched.length=0;const st2=store(file("2026-11-01.1",[rec("s2")]));
 await tick(W1,{...W1.env,DATASET_DISCOVERY:"off",DISCOVERY_BUCKET:st2});
 ok("S2 real cron with the prepared Production state (bucket bound, DATASET_DISCOVERY=\"off\"): bucket not read, no import, no audit, no dataset website fetched",
   st2.gets===0&&st2.heads===0&&ds(W1).length===1&&ev(W1,"dataset_discovery_ingested")===0&&!fetched.includes("https://flagoff-ds.ir/"),{gets:st2.gets,fetched});}

// ---- M: startup with the flag on but the bucket missing, unavailable or misconfigured — always a safe no-op, never a cron failure
{const r=async(st,o)=>DD.readCandidateFile(st,DD.discoverySettings({DATASET_DISCOVERY:"on",DISCOVERY_BUCKET:st,...o}));
 const good=file("2026-11-02.0",[rec("m1")]);
 ok("M1 bucket bound but no candidate file yet → no_candidate_file; a wrong DATASET_DISCOVERY_KEY → no_candidate_file",(await r(store(good,{key:"other.json"}))).reason==="no_candidate_file"&&(await r(store(good),{DATASET_DISCOVERY_KEY:"discovery/typo.json"})).reason==="no_candidate_file");
 ok("M2 body stream failure → store_unavailable (no partial parse)",(await r(store(good,{textFail:true}))).reason==="store_unavailable");
 const nb=[undefined,null,"hamzehi-discovery",{},{get:"x"}].map(b=>DD.discoverySettings({DATASET_DISCOVERY:"on",DISCOVERY_BUCKET:b}));
 const ni=await Promise.all(["hamzehi-discovery",{},{get:"x"}].map(b=>DD.ingestDatasetCandidates({...W1.env,DATASET_DISCOVERY:"on",DISCOVERY_BUCKET:b},{helpers})));
 ok("M3 binding missing → disabled; binding present but not an R2 object (string / {} / get not a function) → skipped no_store, nothing created",!nb[0].enabled&&!nb[1].enabled&&ni.every(x=>x.skipped&&x.reason==="no_store"));
 const n0=ds(W1).length,hf=store(file("2026-11-02.1",[rec("m4")]),{headFail:true});const rh=await ing(hf);
 ok("M4 a failing HEAD does not block the import (falls back to GET); the record is created once",rh.ok&&rh.created.IRAN===1&&hf.gets===1&&ds(W1).length===n0+1,rh);
 const re=await ing(store(file("2026-11-02.2",[])));
 ok("M5 an empty but valid file → ok, 0 created, both markets done",re.ok&&re.total===0&&re.done.IRAN&&re.done.ARAB&&re.created.IRAN===0,re);
 // real cron, flag on, store throwing: the tick finishes, other cron work (own-site check) still runs, no scheduled-error event
 W1.dbrun("UPDATE leads SET notes=json_remove(notes,'$.contact_enrichment_checked_at') WHERE id='ds-flagoff'");
 fetched.length=0;const errs0=ev(W1,"ad_autopilot_scheduled_error");
 await tick(W1,{...W1.env,DATASET_DISCOVERY:"on",DISCOVERY_BUCKET:store(good,{getFail:true,headFail:true})});
 ok("M6 real cron with the bucket unavailable: no scheduled-error event, nothing imported, and the dataset website check of an existing lead still runs",ev(W1,"ad_autopilot_scheduled_error")===errs0&&ds(W1).length===n0+1&&fetched.includes("https://flagoff-ds.ir/"),{fetched});}

// ---- I: integrity, provenance, resumability across releases
{const A=file("2026-11-03.0",["i1","i2","i3","i4"].map(x=>rec(x))),stA=store(A);
 const r1=await ing(stA,{DATASET_DISCOVERY_IRAN_PER_RUN:"2"});
 const digest=W1.q("SELECT value FROM system_kv WHERE key='dataset_discovery:digest:2026-11-03.0'")[0]?.value,v=DD.validateCandidateFile(A);
 const l=ds(W1).find(x=>x.meta.dataset_record.record_id==="i1")?.meta;
 ok("I1 release content digest recorded (= SHA-256 of the canonical list); each lead carries dataset, record id, release, license, sources and attribution; claims untrusted",
   r1.ok&&r1.created.IRAN===2&&digest===await DD.candidateDigest(v.candidates)&&digest===r1.digest&&/^[0-9a-f]{64}$/.test(digest)
   &&l?.dataset_record.release==="2026-11-03.0"&&l.dataset_record.license==="CDLA-Permissive-2.0"&&l.dataset_record.sources[0]==="meta"&&/Overture/.test(l.dataset_record.attribution)&&l.dataset_claims.trusted===false&&l.updated_by==="dataset_discovery",l);
 // a newer release arrives before A finished: it starts its own cursor, skips the domains A already created, never duplicates
 const B=file("2026-11-04.0",["i1","i2","i3","i4","i5"].map(x=>rec(x))),stB=store(B);const rB=await ing(stB,{DATASET_DISCOVERY_IRAN_PER_RUN:"10"});
 const ids=ds(W1).map(x=>x.meta.dataset_record.record_id).filter(x=>/^i\d$/.test(x));
 ok("I2 a new release mid-way: own cursor from 0, the 2 domains already imported are skipped, the 3 others created once; release A's cursor is preserved",
   rB.ok&&rB.created.IRAN===3&&rB.skipped.identity_exists===2&&ids.length===5&&new Set(ids).size===5&&W1.q("SELECT value FROM system_kv WHERE key='dataset_discovery:cursor:2026-11-03.0:IRAN'")[0]?.value==="2",{rB,ids});
 const rA=await ing(stA,{DATASET_DISCOVERY_IRAN_PER_RUN:"10"});
 ok("I3 resuming the older release afterwards creates nothing new (all its domains known) and completes",rA.ok&&rA.created.IRAN===0&&rA.done.IRAN&&ds(W1).filter(x=>/^i\d$/.test(x.meta.dataset_record.record_id)).length===5,rA);
 const tam=file("2026-11-03.0",["i1","i2","i3","i9"].map(x=>rec(x)));const rT=await ing(store(tam));
 ok("I4 a re-uploaded file with changed content under the same release id is refused (release_content_changed)",rT.ok===false&&rT.reason==="release_content_changed",rT);}

// ---- P: Iran and Iraq pipelines, each in its own world, each with a single-market file, through the real cron
const pipe=async(cands)=>{const st=store(file("2026-11-05.0",cands));const w=await world({DATASET_DISCOVERY:"on",DISCOVERY_BUCKET:st,DATASET_DISCOVERY_VERIFY_PER_RUN:"6"});
  for(let i=0;i<3;i++)await tick(w);return w;};
{const WI=await pipe([rec("p-firuze",{name:"طلافروشی فیروزه",websites:["https://www.firuze-ds.ir/fa"]}),rec("node/901",{dataset:"osm",license:"ODbL-1.0",source_datasets:["OpenStreetMap"],name:"طلافروشی فیروزه",websites:["https://firuze-ds.ir/"]})]);
 const L=ds(WI),it=await intel(WI,L[0]);
 ok("P1 Iran-only file: only IRAN leads; the Iran business is verified from its own site → SALES_READY in IRAN, the same business listed in Overture and OSM (www./path) imported once",
   L.length===1&&L.every(x=>x.meta.target_market==="IRAN")&&it?.state==="SALES_READY"&&it.market==="IRAN"&&it.contact.status==="CONTACT_VERIFIED"
   &&WI.q("SELECT value FROM system_kv WHERE key='dataset_discovery:cursor:2026-11-05.0:ARAB'")[0]?.value==="0",{n:L.length,s:it?.state});
 ok("P1b Iran qualification stays autonomous: next step needs owner approval only before a send; no approval/outreach row; nothing sent",
   it?.next_action?.authorization==="owner_approval_before_send"&&!WI.q("SELECT 1 FROM lead_outreach").length&&!WI.tg.some(x=>/^send/.test(x.method)));
 const WQ=await pipe([rec("q-babil",{market:"ARAB",name:"مجوهرات بابل",city:"Baghdad",websites:["https://babil-ds.iq/"]}),rec("node/902",{market:"ARAB",dataset:"osm",license:"ODbL-1.0",websites:["https://osm-ds.iq/"]})]);
 const Q=ds(WQ),iq=await intel(WQ,Q[0]);
 ok("P2 Iraq-only file: only ARAB leads (Iraq OSM refused in the file); verified → SALES_READY in ARAB; no IRAN record touched",
   Q.length===1&&Q[0].meta.target_market==="ARAB"&&iq?.state==="SALES_READY"&&iq.market==="ARAB"&&WQ.q("SELECT value FROM system_kv WHERE key='dataset_discovery:cursor:2026-11-05.0:IRAN'")[0]?.value==="0",{n:Q.length,s:iq?.state});
 const SI=(cur=WQ,(await WQ.call("/api/sales/intelligence?limit=50",null,"GET")).body);
 ok("P2b Iraq funnel in USD, Iran funnel empty in that world (markets fully independent)",SI.markets.ARAB.sales_ready===1&&SI.markets.ARAB.currency==="USD"&&(SI.markets.IRAN.sales_ready||0)===0);}

// ---- R/D: robots.txt and duplicates through the real cron (own-site check)
{const W2=await world({DATASET_DISCOVERY:"on",DISCOVERY_BUCKET:store(file("2026-11-06.9",[])),DATASET_DISCOVERY_VERIFY_PER_RUN:"6"}),t=new Date().toISOString();
 const add=(id,url)=>W2.dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",[id,id,url,"discovered","low",
   JSON.stringify({provider:"dataset",source:"overture_places",url,website:url,target_market:"IRAN",type:"gold_fa",dataset_record:{dataset:"overture",record_id:id,release:"2026-11-06.0",license:"CDLA-Permissive-2.0"},dataset_claims:{name:id,city:"Tehran",trusted:false}}),t,t]);
 add("r404","https://r404-ds.ir/");add("ragent","https://ragent-ds.ir/");add("rwild","https://rwild-ds.ir/");add("rphp","https://rphp-ds.ir/index.php");add("rnet","https://rnet-ds.ir/");add("r503","https://r503-ds.ir/");
 fetched.length=0;await tick(W2);
 const M=id=>JSON.parse(W2.q("SELECT notes FROM leads WHERE id=?",[id])[0].notes);
 ok("R1 robots.txt 404 → allowed and fetched; rules for another user-agent only (BadBot) do not apply to us",fetched.includes("https://r404-ds.ir/")&&fetched.includes("https://ragent-ds.ir/"),fetched);
 ok("R2 wildcard and $ rules: \"Disallow: /*.php$\" blocks /index.php; \"/shop*\" and \"/*.php$\" leave \"/\" allowed",!fetched.includes("https://rphp-ds.ir/index.php")&&fetched.includes("https://rwild-ds.ir/")&&/^robots_disallow/.test(M("rphp").contact_enrichment_result),fetched);
 ok("R3 Phase 18.6 fix: robots.txt unreachable (network error) → complete disallow (RFC 9309): site not fetched, recorded robots_unreachable, a bounded failure, not rejected yet",
   !fetched.includes("https://rnet-ds.ir/")&&/^robots_unreachable/.test(M("rnet").contact_enrichment_result)&&M("rnet").dataset_fetch_failures===1&&!M("rnet").rejected_reason,M("rnet"));
 ok("R4 robots.txt 5xx → complete disallow, not fetched",!fetched.includes("https://r503-ds.ir/")&&/^robots_disallow/.test(M("r503").contact_enrichment_result));
 W2.dbrun("UPDATE leads SET notes=json_set(notes,'$.contact_enrichment_checked_at',?) WHERE id='rnet'",[new Date(Date.now()-15*86400e3).toISOString()]);await tick(W2);
 ok("R5 still unreachable 14 days later → REJECTED unreachable_website (never fetched)",M("rnet").rejected_reason==="unreachable_website"&&!fetched.includes("https://rnet-ds.ir/"),M("rnet"));
 // duplicates: four spellings of one host in one file through the REAL identity + upsert path
 const st=store(file("2026-11-07.0",[rec("d1",{websites:["https://dup-ds.ir/"]}),rec("d2",{websites:["http://www.dup-ds.ir/about"]}),rec("d3",{websites:["https://WWW.Dup-DS.ir"]}),rec("d4",{dataset:"osm",license:"ODbL-1.0",websites:["dup-ds.ir/fa/"]})]));
 await tick(W2,{...W2.env,DISCOVERY_BUCKET:st,DATASET_DISCOVERY_IRAN_PER_RUN:"10"});
 const dups=ds(W2).filter(x=>/dup-ds/i.test(x.meta.url));
 ok("D1 one business under four URL spellings (http/https, www, case, path) in one file → exactly one lead",dups.length===1,dups.map(x=>x.meta.url));}

ok("G1 whole suite: no paid / AI / Brave / Places request; nothing sent; no outreach row",!paid.length&&!W1.q("SELECT 1 FROM lead_outreach").length&&!W1.tg.some(x=>/^send/.test(x.method)),paid);
console.log(`phase18_6 time ${((Date.now()-started)/1000).toFixed(1)} s`);
process.exit(done()?1:0);
