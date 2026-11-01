// PHASE 18.5 — discovery data integrity and activation safety. Offline only: synthetic candidate files, an in-process R2-compatible
// store, mocked websites; nothing leaves the process, nothing is sent or deployed, no Production resource is touched.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase18_5");
const started=Date.now();
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const DD=await import(pathToFileURL(path.join(SRC,"dataset-discovery.js")).href);
const LQ=await import(pathToFileURL(path.join(SRC,"lead-qualification.js")).href);
const PF=await import(pathToFileURL(path.join(REPO,"scripts/release/preflight.mjs")).href);
const rec=(i,o={})=>({market:"IRAN",dataset:"overture",record_id:"r-"+String(i).padStart(3,"0"),license:"CDLA-Permissive-2.0",source_datasets:["meta"],name:"زرگری "+i,city:"Tehran",websites:[`https://s${i}.ir/`],...o});
const file=(release,cands)=>({schema:DD.DISCOVERY_SCHEMA,release,candidates:cands});
// R2-compatible in-process store: get/head with an etag per content; counts reads; can be told to fail.
const store=(doc,{fail=false,raw=null,size=null}={})=>{const s={gets:0,heads:0,fail,doc,raw,size};
  const body=()=>s.raw??JSON.stringify(s.doc),etag=()=>"e"+[...body()].reduce((h,ch)=>(h*31+ch.charCodeAt(0))>>>0,7).toString(16);
  s.get=async k=>{s.gets++;if(s.fail)throw new Error("R2 unavailable");return k==="discovery/candidates-latest.json"?{size:s.size??body().length,etag:etag(),text:async()=>body()}:null;};
  s.head=async k=>{s.heads++;if(s.fail)throw new Error("R2 unavailable");return k==="discovery/candidates-latest.json"?{etag:etag()}:null;};return s;};

// ---- F1-F5: malformed, oversized, over-limit, invalid release, missing list (file refused, never truncated)
{const S=DD.discoverySettings({DATASET_DISCOVERY:"on",DISCOVERY_BUCKET:{}});
 const r=async st=>DD.readCandidateFile(st,S);
 ok("F1 malformed JSON → invalid_json",(await r(store(null,{raw:"{not json"}))).reason==="invalid_json");
 ok("F2 oversized object (declared size > 5 MB) → file_too_large before download",(await r(store(file("2026-10-21.0",[rec(1)]),{size:6_000_000}))).reason==="file_too_large");
 ok("F3 more than 5,000 records → too_many_candidates (refused, not truncated)",(await r(store(file("2026-10-21.0",Array.from({length:5001},(_,i)=>rec(i)))))).reason==="too_many_candidates");
 ok("F4 release id must be YYYY-MM-DD.N (\"latest\", \"2026-10\" and path-like ids refused)",["latest","2026-10","../2026-10-21.0","2026-10-21.0;drop"].every(x=>DD.validateCandidateFile(file(x,[rec(1)])).reason==="release")&&DD.validateCandidateFile(file("2026-10-21.0",[rec(1)])).ok);
 ok("F5 schema mismatch / missing candidate list refused",DD.validateCandidateFile({schema:"other",release:"2026-10-21.0",candidates:[]}).reason==="schema"&&DD.validateCandidateFile({schema:DD.DISCOVERY_SCHEMA,release:"2026-10-21.0"}).reason==="candidates_missing");
 const v=DD.validateCandidateFile(file("2026-10-21.0",[rec(1),rec(1),rec(2,{websites:["https://x.ir/?ref=ChIJAbCdEfGhIjKl"]}),rec(3,{phones:["ChIJ0123456789ab"]})]));
 ok("F6 duplicate record id in a file counted once; a Google place-ID string anywhere in a record → google_origin",v.candidates.length===1&&v.rejected.duplicate_record===1&&v.rejected.google_origin===2,v.rejected);
 const a=DD.validateCandidateFile(file("2026-10-21.0",[rec(3),rec(1,{market:"ARAB",websites:["https://q1.iq/"]}),rec(2)])),b=DD.validateCandidateFile(file("2026-10-21.0",[rec(2),rec(3),rec(1,{market:"ARAB",websites:["https://q1.iq/"]})]));
 ok("F7 deterministic order: the same records in any file order give the same sorted list and the same content digest",JSON.stringify(a.candidates.map(c=>c.record_id+c.market))===JSON.stringify(b.candidates.map(c=>c.record_id+c.market))&&await DD.candidateDigest(a.candidates)===await DD.candidateDigest(b.candidates));}

// ---- world: real D1 (node:sqlite), real Worker cron, simple helpers for direct ingestion calls
const W=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on"}});const {q,dbrun}=W;
const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;
dbrun("CREATE TABLE IF NOT EXISTS lead_identities (identity_key TEXT PRIMARY KEY, identity_type TEXT NOT NULL, normalized_value TEXT NOT NULL, lead_id TEXT NOT NULL, source TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
let failAt=null,calls=0;
const helpers={identities:({meta})=>[{identity_type:"domain",identity_key:"domain:"+new URL(meta.url).hostname.replace(/^www\./,"")}],
  upsert:async(env,{name,meta})=>{calls++;if(failAt&&calls===failAt)throw new Error("D1 write failed");const id="ds-"+meta.dataset_record.record_id+"-"+meta.target_market,t=new Date().toISOString();
    dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",[id,name,meta.url,"discovered","low",JSON.stringify(meta),t,t]);
    dbrun("INSERT INTO lead_identities VALUES(?,?,?,?,?,?,?)",["domain:"+new URL(meta.url).hostname.replace(/^www\./,""),"domain","x",id,"dataset_discovery",t,t]);return {created:true,id};}};
const on={...W.env,DATASET_DISCOVERY:"on"},S=o=>DD.discoverySettings({...on,DISCOVERY_BUCKET:{},...o});
const dsLeads=()=>q("SELECT id,notes FROM leads").filter(r=>/"provider":"dataset"/.test(r.notes));
const ing=(st,o={},settings=S(o))=>DD.ingestDatasetCandidates({...on,...o},{settings,store:st,helpers});

// ---- F8: interrupted import resumes without skipped or duplicated records
{const st=store(file("2026-10-22.0",Array.from({length:6},(_,i)=>rec(10+i))));failAt=3;calls=0;
 const r1=await ing(st,{DATASET_DISCOVERY_IRAN_PER_RUN:"6"});
 ok("F8a a write failure on the 3rd record stops the run safely: 2 created, cursor saved at the failing record (2), error reported",r1.ok===false&&r1.created.IRAN===2&&r1.cursor.IRAN===2&&/D1 write failed/.test(r1.error)&&dsLeads().length===2,r1);
 failAt=null;const r2=await ing(st,{DATASET_DISCOVERY_IRAN_PER_RUN:"6"});
 const ids=dsLeads().map(r=>JSON.parse(r.notes).dataset_record.record_id).sort();
 ok("F8b resume creates the remaining 4 — all 6 exactly once, none skipped",r2.ok&&r2.created.IRAN===4&&r2.done.IRAN&&ids.length===6&&new Set(ids).size===6&&ids[0]==="r-010"&&ids[5]==="r-015",{r2,ids});}

// ---- F9: content change under an existing release id is refused; a new release id proceeds
{const n0=dsLeads().length,st=store(file("2026-10-22.0",[rec(10),rec(99)]));
 const r=await ing(st);
 ok("F9a a different file under an already-used release id → release_content_changed, nothing created",r.ok===false&&r.reason==="release_content_changed"&&dsLeads().length===n0,r);
 st.doc=file("2026-10-23.0",[rec(10),rec(99)]);const r2=await ing(st);
 ok("F9b the same content under a NEW release id is accepted; the already-known domain is skipped (no duplicate), the new one created",r2.ok&&r2.created.IRAN===1&&r2.skipped.identity_exists===1&&dsLeads().length===n0+1,r2);}

// ---- F10: completed file is only HEAD-checked afterwards (no download / parse per tick)
{const st=store(file("2026-10-24.0",[rec(200)]));await ing(st);const g=st.gets;
 const r=await ing(st),r3=await ing(st);
 ok("F10 after completion later ticks only HEAD the object (no GET), until its content (etag) changes",r.skipped&&r.reason==="complete"&&r3.reason==="complete"&&st.gets===g&&st.heads>=3,{gets:st.gets,heads:st.heads});
 st.doc=file("2026-10-25.0",[rec(200),rec(201)]);const r4=await ing(st);
 ok("F10b a new file (new etag) is downloaded again and only its new record is created",r4.ok&&r4.created.IRAN===1&&st.gets===g+1,r4);}

// ---- F11: dependency failure (store down) → safe stop, CRM intact, recovery on the next tick
{const before=JSON.stringify(q("SELECT id,notes FROM leads ORDER BY id")),st=store(file("2026-10-26.0",[rec(300)]),{fail:true});
 const r=await ing(st);
 ok("F11a store unavailable → ok:false store_unavailable, no lead or CRM row changed",r.ok===false&&r.reason==="store_unavailable"&&JSON.stringify(q("SELECT id,notes FROM leads ORDER BY id"))===before,r);
 st.fail=false;const r2=await ing(st);ok("F11b recovers by itself on the next run",r2.ok&&r2.created.IRAN===1);}

// ---- F12: market isolation and caps
{const st=store(file("2026-10-27.0",[...Array.from({length:5},(_,i)=>rec(400+i)),...Array.from({length:5},(_,i)=>rec(500+i,{market:"ARAB",websites:[`https://q${i}.iq/`]})),rec(600,{market:"ARAB",dataset:"osm",license:"ODbL-1.0",websites:["https://o.iq/"]})]));
 const r=await ing(st,{DATASET_DISCOVERY_IRAN_PER_RUN:"0",DATASET_DISCOVERY_ARAB_PER_RUN:"2"});
 ok("F12 a market at 0 never blocks the other; Iraq OSM refused in the file; per-run cap respected",r.created.IRAN===0&&r.created.ARAB===2&&r.rejected_in_file.source_disabled_for_market===1&&r.cursor.IRAN===0,r);}

// ---- F13-F16: activation safety through the real cron
const page=(t,b)=>new Response(`<html><head><title>${t}</title></head><body>${b}</body></html>`,{status:200,headers:{"Content-Type":"text/html"}});
const fetched=[];const inner=globalThis.fetch;
globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);if(s.startsWith("https://w.test/"))return W.run(new Request(s,o));
  if(/places\.googleapis|api\.openai|api\.anthropic|brave/.test(s))throw new Error("paid call attempted: "+s);
  if(/\/robots\.txt$/.test(s))return new Response("",{status:404});
  if(s==="https://slow-ds.ir/"){fetched.push(s);const e=new Error("The operation was aborted due to timeout");e.name="TimeoutError";throw e;}
  if(s==="https://pending-ds.ir/"){fetched.push(s);return page("طلافروشی پندینگ","طلافروشی پندینگ در تهران");}
  if(/^https:\/\/www\.(google|bing)\.com\/search/.test(s))return new Response("<html></html>",{status:200,headers:{"Content-Type":"text/html"}});
  if(/^https:\/\/[a-z0-9.-]+\.(ir|iq)\//.test(s)){fetched.push(s);return new Response("",{status:404});}
  return inner(u,o);};
const tick=async env=>{const p=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},env,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);};
{const st=store(file("2026-10-28.0",[rec(700)]));
 await tick({...W.env,DISCOVERY_BUCKET:st});
 ok("F13 a bound bucket alone never runs discovery (flag absent): the store is not even read",st.gets===0&&st.heads===0);
 await tick({...W.env,DATASET_DISCOVERY:"off",DISCOVERY_BUCKET:st});
 ok("F13b DATASET_DISCOVERY=\"off\" (the prepared Production value) is equally inert",st.gets===0&&st.heads===0);
 await tick({...W.env,DATASET_DISCOVERY:"on",DISCOVERY_BUCKET:"hamzehi-discovery"});
 ok("F14 an invalid binding (not an R2 object) is rejected safely: no error, nothing created",!dsLeads().some(r=>/r-700/.test(r.notes)));
 const t=new Date().toISOString(),pend={provider:"dataset",source:"overture_places",url:"https://pending-ds.ir/",website:"https://pending-ds.ir/",target_market:"IRAN",type:"gold_fa",dataset_record:{dataset:"overture",record_id:"p1",release:"2026-10-28.0",license:"CDLA-Permissive-2.0"},dataset_claims:{name:"طلافروشی پندینگ",city:"Tehran",trusted:false}};
 dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",["ds-pending","طلافروشی پندینگ","https://pending-ds.ir/","discovered","low",JSON.stringify(pend),t,t]);
 dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",["ds-slow","طلای کند","https://slow-ds.ir/","discovered","low",JSON.stringify({...pend,url:"https://slow-ds.ir/",website:"https://slow-ds.ir/",dataset_record:{...pend.dataset_record,record_id:"p2"}}),t,t]);
 fetched.length=0;await tick({...W.env,DATASET_DISCOVERY:"off"});
 ok("F15 switching discovery off stops website checks of already-imported dataset leads at once (no manual step)",!fetched.length&&!JSON.parse(q("SELECT notes FROM leads WHERE id='ds-pending'")[0].notes).dataset_verification);
 await tick({...W.env,DATASET_DISCOVERY:"on",DATASET_DISCOVERY_VERIFY_PER_RUN:"6"});
 const mp=JSON.parse(q("SELECT notes FROM leads WHERE id='ds-pending'")[0].notes),ms=JSON.parse(q("SELECT notes FROM leads WHERE id='ds-slow'")[0].notes);
 ok("F16a when on again: the pending lead is verified with explicit identity provenance (evidence_url, identity_basis, checked_at)",mp.dataset_verification?.result==="verified_site"&&mp.dataset_verification.evidence_url==="https://pending-ds.ir/"&&mp.dataset_verification.identity_basis==="own_website_page"&&!!mp.dataset_verification.checked_at,mp.dataset_verification);
 ok("F16b a website timeout is a bounded, counted failure (not rejected yet, no crash)",ms.dataset_fetch_failures===1&&!ms.rejected_reason&&fetched.includes("https://slow-ds.ir/"),ms);}

// ---- F17-F18: existing Google-only leads stay provisional; repeated runs create no duplicate opportunities
{const t=new Date().toISOString();for(let i=0;i<3;i++)dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",["gp"+i,`طلافروشی در تبریز (Google Maps) · #${i}`,"","discovered","low",JSON.stringify({provider:"google_places_ids",place_id:"ChIJgp000000000"+i,target_market:"IRAN",country:"IR",city:"تبریز",lead_status:"provisional_place"}),t,t]);
 const st=store(file("2026-10-29.0",[rec(800),rec(801)]));for(let i=0;i<4;i++)await ing(st);
 const gp=q("SELECT * FROM leads WHERE id LIKE 'gp%'").map(l=>LQ.leadQualification(l,JSON.parse(l.notes),[],{}));
 ok("F17 Google IDs-only leads remain PLACE_DISCOVERED, untouched, while dataset ingestion runs",gp.length===3&&gp.every(p=>p.state==="PLACE_DISCOVERED"&&p.contact.status==="NONE"));
 ok("F18 four repeated runs of the same file create each lead exactly once",dsLeads().filter(r=>/r-80[01]/.test(r.notes)).length===2);}

// ---- F19: wrangler.toml is in one of the two safe states: pre-activation (no bucket, no var: 23 bindings) or prepared (bucket + "off": 25)
{const exp=PF.expectedFromToml(fs.readFileSync(path.join(REPO,"worker/wrangler.toml"),"utf8")),db=exp.r2.find(r=>r.binding==="DISCOVERY_BUCKET");
 ok("F19 wrangler.toml: either no DISCOVERY_BUCKET and no DATASET_DISCOVERY (inert), or DISCOVERY_BUCKET=hamzehi-discovery (separate from hamzehi-gallery) with DATASET_DISCOVERY=\"off\" — or \"on\" only with owner-approved attribution (Phase 18 activation); Telegram/Ads/orchestrator vars unchanged",
  (db?db.bucket_name==="hamzehi-discovery"&&(exp.vars.DATASET_DISCOVERY==="off"||(exp.vars.DATASET_DISCOVERY==="on"&&DD.DATASET_ATTRIBUTION_APPROVED===true)):exp.vars.DATASET_DISCOVERY===undefined)&&exp.r2.find(r=>r.binding==="GALLERY_BUCKET")?.bucket_name==="hamzehi-gallery"
  &&exp.vars.AUTONOMY_ORCHESTRATOR==="on"&&exp.vars.ADS_PLACES_DISCOVERY==="on"&&exp.vars.ADS_PLACES_MONTHLY_BUDGET_USD==="10"&&exp.vars.SALES_AI_BRAIN==="on"&&exp.vars.TELEGRAM_VAULT_CHAT_ID==="@mhboxgroup",exp);}
// ---- F21: enrichment window is not starved by Google rows (Production has ~300 Places rows refreshed by every Ads run)
{const old=new Date(Date.now()-30*86400e3).toISOString(),t=new Date().toISOString();
 for(let i=0;i<320;i++)dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",["gq"+i,"g","","discovered","low",JSON.stringify({provider:"google_places_ids",place_id:"ChIJq"+i,target_market:"IRAN",city:"تهران",website:"https://g"+i+".ir/"}),t,t]);
 const m={provider:"dataset",source:"overture_places",url:"https://pending2-ds.ir/",website:"https://pending2-ds.ir/",target_market:"IRAN",type:"gold_fa",dataset_record:{dataset:"overture",record_id:"p3",release:"2026-10-28.0",license:"CDLA-Permissive-2.0"},dataset_claims:{name:"طلافروشی پندینگ",city:"Tehran",trusted:false}};
 dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",["ds-old","old","https://pending2-ds.ir/","discovered","low",JSON.stringify(m),old,old]);
 // isolate the question: every other dataset candidate already has a fresh check stamp, only the Google rows compete with ds-old
 dbrun("UPDATE leads SET notes=json_set(notes,'$.contact_enrichment_checked_at',?) WHERE id<>'ds-old' AND json_extract(notes,'$.provider')='dataset'",[t]);
 fetched.length=0;await tick({...W.env,DATASET_DISCOVERY:"on"});
 ok("F21 320 newer Google rows (with Google-supplied websites) do not crowd out an older dataset candidate: it is checked in the next tick, no Google row is fetched",fetched.includes("https://pending2-ds.ir/")&&!fetched.some(u=>/https:\/\/g\d+\.ir/.test(u)),fetched);}
ok("F20 no outreach, approval or escalation row; nothing sent",!q("SELECT 1 FROM lead_outreach").length&&!W.tg.some(x=>/^send/.test(x.method)));

console.log(`phase18_5 time ${((Date.now()-started)/1000).toFixed(1)} s`);
process.exit(done()?1:0);
