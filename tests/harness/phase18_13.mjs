// PHASE 18.13 — sealed dataset preparation rules: Overture per-source license inference, registrable website hosts, ambiguous
// names, and a full interrupted import of a sealed multi-market file. Offline only: synthetic rows, in-process store, node:sqlite.
import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase18_13");
const started=Date.now();
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const DD=await import(pathToFileURL(path.join(SRC,"dataset-discovery.js")).href);
const NC=await import(pathToFileURL(path.join(REPO,"scripts/discovery/candidates.mjs")).href);
const ov=(id,o={})=>({id,name:"طلافروشی "+id,websites:[`https://${id}.ir/`],country:"IR",locality:"Tehran",src:["meta","Overture"],confidence:0.9,...o});

// ---- L: Overture license per source (the "Overture" pseudo-source is ignored)
{const L=NC.overtureLicense;
 ok("L1 Foursquare+Overture → Apache-2.0 (before: CDLA, losing the Foursquare notice duty); AllThePlaces+Overture → CC0-1.0; Meta+Overture → CDLA",
   L(["Foursquare","Overture"])==="Apache-2.0"&&L(["AllThePlaces","Overture"])==="CC0-1.0"&&L(["meta","Overture"])==="CDLA-Permissive-2.0"&&L(["Microsoft","Overture"])==="CDLA-Permissive-2.0");
 ok("L2 mixed Meta+Foursquare → Apache-2.0 (stricter notice); no source → CDLA default; an explicit license wins",
   L(["meta","Foursquare","Overture"])==="Apache-2.0"&&L([])==="CDLA-Permissive-2.0"&&L(["Overture"])==="CDLA-Permissive-2.0"&&L(["Foursquare"],["CC0-1.0"])==="CC0-1.0");
 const doc=NC.normalizeCandidates({overture:[ov("fsq1",{src:["Foursquare","Overture"]}),ov("atp1",{src:["AllThePlaces","Overture"]})]},{release:"2026-11-01.0",generatedAt:"t"});
 ok("L3 the license reaches the candidate record (and so the lead's provenance)",doc.candidates.find(c=>c.record_id==="fsq1")?.license==="Apache-2.0"&&doc.candidates.find(c=>c.record_id==="atp1")?.license==="CC0-1.0",doc.candidates.map(c=>[c.record_id,c.license]));}

// ---- V: registrable website hosts (shared rule: extractor and Worker)
{const V=u=>DD.validateCandidate({market:"IRAN",dataset:"overture",record_id:"x",license:"CDLA-Permissive-2.0",websites:[u]});
 const bad=["https://https//www.instagram.com/isun_gold","https://gezelbash_gold","http://@boosaliki_gold_jewelry","http://erfan_jewely","https://localhost/","https://shop-.ir/","https://shop.123/"];
 ok("V1 the four pilot social handles typed as websites, and other non-registrable hosts, are refused (invalid_website_host or no_own_website)",
   bad.every(u=>!V(u).ok&&["invalid_website_host","no_own_website"].includes(V(u).reason)),bad.map(u=>[u,V(u).reason]));
 const good=["https://zarin.ir/","http://www.shop.co.uk/fa","https://xn--mgbaam7a8h.ir/","https://my-gold.jewelry/","https://a1.com"];
 ok("V2 normal hosts still pass: .ir, .co.uk (multi-label), punycode (IDN), new gTLD, short labels",good.every(u=>V(u).ok),good.map(u=>[u,V(u).reason]));}

// ---- N: ambiguous names are not shipped (identity could never be confirmed by the website)
{const doc=NC.normalizeCandidates({overture:[ov("n1",{name:"م گالری"}),ov("n2",{name:"H&Y Jewellery"}),ov("n3",{name:"طلافروشی زرین"}),ov("n4",{name:""})]},{release:"2026-11-01.0",generatedAt:"t"});
 ok("N1 names made only of trade words / short tokens, or empty, → ambiguous_name (counted, not shipped); a distinctive name is kept",
   doc.counts.dropped.ambiguous_name===3&&doc.candidates.length===1&&doc.candidates[0].record_id==="n3",doc.counts);
 ok("N2 the Worker itself still accepts such a record from an older file (no silent change for already-published files)",DD.validateCandidate({market:"IRAN",dataset:"overture",record_id:"x",license:"CDLA-Permissive-2.0",name:"م گالری",websites:["https://mg.ir/"]}).ok);}

// ---- R: interrupted import of a sealed two-market file, resumed to completion; exactly-once; HEAD-only afterwards; tamper refused
{const rows=[...Array.from({length:40},(_,i)=>ov("ir"+i)),...Array.from({length:15},(_,i)=>ov("iq"+i,{country:"IQ",locality:"Baghdad",websites:[`https://iq${i}.iq/`]}))];
 const doc=await NC.sealCandidateFile(NC.normalizeCandidates({overture:rows},{release:"2026-11-07.0",overtureRelease:"2026-10-21.0",generatedAt:"t"}));
 const W=await makeWorld({});const {q,dbrun}=W;
 dbrun("CREATE TABLE IF NOT EXISTS lead_identities (identity_key TEXT PRIMARY KEY, identity_type TEXT NOT NULL, normalized_value TEXT NOT NULL, lead_id TEXT NOT NULL, source TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
 let calls=0,failAt=new Set([7,23]);
 const helpers={identities:({meta})=>[{identity_type:"domain",identity_key:"domain:"+new URL(meta.url).hostname}],
   upsert:async(env,{name,meta})=>{calls++;if(failAt.has(calls))throw new Error("D1 write failed");const id="r-"+meta.dataset_record.record_id,t=new Date().toISOString();
     dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",[id,name,meta.url,"discovered","low",JSON.stringify(meta),t,t]);
     dbrun("INSERT INTO lead_identities VALUES(?,?,?,?,?,?,?)",["domain:"+new URL(meta.url).hostname,"domain","x",id,"t",t,t]);return {created:true,id};}};
 const body=JSON.stringify(doc);let fail=false;const st={gets:0,heads:0,get:async k=>{st.gets++;if(fail)throw new Error("down");return {size:body.length,etag:"E1",text:async()=>body};},head:async()=>{st.heads++;if(fail)throw new Error("down");return {etag:"E1"};}};
 const env={...W.env,DATASET_DISCOVERY:"on",DATASET_DISCOVERY_IRAN_PER_RUN:"8",DATASET_DISCOVERY_ARAB_PER_RUN:"8",DATASET_DISCOVERY_IRAN_DAILY_CAP:"200",DATASET_DISCOVERY_ARAB_DAILY_CAP:"200"};
 const S=DD.discoverySettings({...env,DISCOVERY_BUCKET:st});DD.resetCandidateFileCache();
 const log=[];for(let i=0;i<20;i++){if(i===3)fail=true;if(i===4)fail=false;const r=await DD.ingestDatasetCandidates(env,{settings:S,store:st,helpers});log.push(r.reason||(r.ok?"ok":"err:"+r.error));if(r.reason==="complete")break;}
 const ids=q("SELECT id FROM leads WHERE id LIKE 'r-%'").map(r=>r.id);
 ok("R1 two write failures and one store outage mid-import: resumed to completion, all 55 records (40 IRAN + 15 ARAB) imported exactly once",
   ids.length===55&&new Set(ids).size===55&&log.includes("store_unavailable")&&log.filter(x=>/^err:/.test(x)).length===2&&log[log.length-1]==="complete",{n:ids.length,log});
 ok("R2 final cursors match the file (IRAN 40, ARAB 15); the release digest and completion marker are recorded",
   q("SELECT value FROM system_kv WHERE key='dataset_discovery:cursor:2026-11-07.0:IRAN'")[0]?.value==="40"&&q("SELECT value FROM system_kv WHERE key='dataset_discovery:cursor:2026-11-07.0:ARAB'")[0]?.value==="15"
   &&!!q("SELECT value FROM system_kv WHERE key='dataset_discovery:complete:E1'")[0]&&!!q("SELECT value FROM system_kv WHERE key='dataset_discovery:digest:2026-11-07.0'")[0]);
 const g=st.gets;const again=await DD.ingestDatasetCandidates(env,{settings:S,store:st,helpers});
 ok("R3 after completion: HEAD only, no GET, nothing created",again.reason==="complete"&&st.gets===g&&q("SELECT COUNT(*) n FROM leads WHERE id LIKE 'r-%'")[0].n===55);
 const t=JSON.parse(body);t.candidates[0].name="tampered";const tb=JSON.stringify(t);
 const r=await DD.readCandidateFile({get:async()=>({size:tb.length,etag:"E2",text:async()=>tb})},S);
 ok("R4 the same sealed file with one edited record is refused before import (content_hash_mismatch)",r.reason==="content_hash_mismatch");}

console.log(`phase18_13 time ${((Date.now()-started)/1000).toFixed(1)} s`);
process.exit(done()?1:0);
