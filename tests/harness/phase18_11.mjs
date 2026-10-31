// PHASE 18.11 — extractor G-1/G-2, file integrity seal, malformed input, parse cache, Persian/Arabic-Indic digits, gates.
// Offline only: synthetic rows and websites, in-process R2-compatible store, the real extractor script spawned without DuckDB
// (it stops before any network step); nothing leaves the process, nothing is sent, uploaded or deployed.
import fs from "node:fs";import os from "node:os";import path from "node:path";import {spawnSync} from "node:child_process";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase18_11");
const started=Date.now();
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const DD=await import(pathToFileURL(path.join(SRC,"dataset-discovery.js")).href);
const LQ=await import(pathToFileURL(path.join(SRC,"lead-qualification.js")).href);
const NC=await import(pathToFileURL(path.join(REPO,"scripts/discovery/candidates.mjs")).href);
const EXTRACT=path.join(REPO,"scripts/discovery/extract-candidates.mjs");
const KEY="discovery/candidates-latest.json";
const ov=(id,o={})=>({id,name:"زرگری نگار "+id,websites:[`https://${id}.ir/`],country:"IR",locality:"Tehran",src:["meta"],lic:["CDLA-Permissive-2.0"],confidence:0.9,...o});
const store=(doc,{raw=null}={})=>{const s={gets:0,heads:0,doc,raw};const body=()=>s.raw??JSON.stringify(s.doc),etag=()=>"e"+[...body()].reduce((h,ch)=>(h*31+ch.charCodeAt(0))>>>0,7).toString(16);
  s.get=async k=>{s.gets++;return k===KEY?{size:body().length,etag:etag(),text:async()=>body()}:null;};s.head=async k=>{s.heads++;return k===KEY?{etag:etag()}:null;};return s;};
const S=o=>DD.discoverySettings({DATASET_DISCOVERY:"on",DISCOVERY_BUCKET:{},...o});
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"p1811-"));
const run=args=>spawnSync(process.execPath,[EXTRACT,...args],{encoding:"utf8",timeout:60000,cwd:tmp,env:{...process.env,DUCKDB_NODE_API_DIR:tmp}});

// ---- G: extractor release plan (G-1 file id vs Overture source release; G-2 same id rule as the Worker)
{const p=NC.extractionPlan({release:"2026-11-01.0",overtureRelease:"2026-10-21.0"}),d=NC.extractionPlan({release:"2026-10-21.0"});
 ok("G1 G-1: a NEW file release id over the SAME Overture release — S3 path and raw file use the Overture release, the candidate file the new id",
   p.ok&&p.overtureS3==="s3://overturemaps-us-west-2/release/2026-10-21.0/theme=places/type=place/*"&&p.rawOvertureFile==="raw-overture-2026-10-21.0.json"&&p.candidateFile==="candidates-2026-11-01.0.json",p);
 ok("G2 backward compatible: without --overture-release both are the --release value (previous behaviour)",d.ok&&d.overtureRelease==="2026-10-21.0"&&d.candidateFile==="candidates-2026-10-21.0.json");
 const bad=["2026-10-21.1234","2026-10-21","latest","../2026-10-21.0",""].map(r=>NC.extractionPlan({release:r}).ok);
 ok("G3 G-2: the extractor refuses exactly what the Worker refuses (4-digit suffix, no suffix, 'latest', path-like, empty); a bad Overture release is refused too",
   bad.every(x=>x===false)&&!DD.RELEASE_ID.test("2026-10-21.1234")&&!NC.extractionPlan({release:"2026-11-01.0",overtureRelease:"x"}).ok);
 const r1=run(["--release","2026-10-21.1234","--out",path.join(tmp,"o1")]);
 ok("G4 real extractor CLI: an invalid --release exits 2 with the rule in the message, before creating anything",r1.status===2&&/1-3 digits/.test(r1.stderr)&&!fs.existsSync(path.join(tmp,"o1")),{s:r1.status,e:r1.stderr.slice(0,200)});
 const o2=path.join(tmp,"o2");fs.mkdirSync(o2);fs.writeFileSync(path.join(o2,"extract-state.json"),JSON.stringify({release:"2026-11-01.0",overture_release:"2026-10-21.0",steps:{}}));
 const r2=run(["--release","2026-11-01.0","--overture-release","2026-09-17.0","--out",o2,"--resume"]);
 ok("G5 --resume with a different Overture source release than the saved state is refused (no mixing of two sources in one file)",r2.status===2&&/overture 2026-10-21.0/.test(r2.stderr),{s:r2.status,e:r2.stderr.slice(0,200)});
 const r3=run(["--release","2026-11-01.0","--overture-release","2026-10-21.0","--out",path.join(tmp,"o3")]);
 const st3=path.join(tmp,"o3","extract-state.json");
 ok("G6 a valid plan without DuckDB stops at the first network step (exit 3); no partial candidate file and no temp files are left behind",
   r3.status===3&&!fs.existsSync(path.join(tmp,"o3","candidates-2026-11-01.0.json"))&&fs.readdirSync(path.join(tmp,"o3")).every(f=>!/\.tmp-/.test(f))&&(!fs.existsSync(st3)||!!JSON.parse(fs.readFileSync(st3,"utf8"))),{s:r3.status,f:fs.readdirSync(path.join(tmp,"o3"))});}

// ---- A: atomic checkpoint write
{const f=path.join(tmp,"state.json");NC.writeFileAtomic(f,JSON.stringify({a:1}));NC.writeFileAtomic(f,JSON.stringify({a:2,big:"x".repeat(100000)}));
 ok("A1 atomic write replaces the file in one step (complete content, no temp file left)",JSON.parse(fs.readFileSync(f,"utf8")).a===2&&!fs.readdirSync(tmp).some(x=>/state\.json\.tmp-/.test(x)));}

// ---- N: deterministic normalization, malformed input, conservation, Iraq OSM, Google, cross-market duplicates
{const rows=[ov("a1"),ov("a2",{country:"IQ",locality:"Baghdad",websites:["https://a2.iq/"]}),ov("a3",{websites:["https://maps.app.goo.gl/x"]}),ov("a4",{src:["google"]}),
   ov("a5",{websites:["https://shared.com/"]}),ov("a6",{country:"IQ",websites:["https://www.shared.com/fa"]}),ov("a7",{country:"AE"}),ov("a8",{operating_status:"permanently_closed"})];
 const osm={IRAN:[{kind:"node",id:1,tags:{shop:"jewelry",name:"طلای یکتا",website:"https://o1.ir/"}},null],ARAB:[{kind:"node",id:2,tags:{shop:"jewelry",website:"https://o2.iq/"}}]};
 const bad=[null,7,"x",{id:"m1",name:"طلافروشی مهتاب",country:"IR",websites:"https://m1.ir/",src:"meta",phones:"+98 21 1"},{id:"",country:"IR",websites:["https://m2.ir/"]}];
 let threw=null,doc,doc2;
 try{doc=NC.normalizeCandidates({overture:[...rows,...bad],osm},{release:"2026-11-01.0",overtureRelease:"2026-10-21.0",generatedAt:"t1"});
     doc2=NC.normalizeCandidates({overture:[...bad,...rows].reverse(),osm},{release:"2026-11-01.0",overtureRelease:"2026-10-21.0",generatedAt:"t2"});}catch(e){threw=e;}
 const total=rows.length+bad.length+osm.IRAN.length+osm.ARAB.length,sum=doc?doc.counts.kept+Object.values(doc.counts.dropped).reduce((a,b)=>a+b,0):-1;
 ok("N1 malformed rows (null, number, string, scalar lists, empty id) never throw; each is counted: invalid_row / missing_record_id; a scalar website still works",
   !threw&&doc.counts.dropped.invalid_row===4&&doc.counts.dropped.missing_record_id===1&&doc.candidates.some(c=>c.record_id==="m1"&&c.websites[0]==="https://m1.ir/"),threw?String(threw):doc.counts);
 ok("N2 no candidate silently lost: every input row is either kept or counted under a drop reason ("+total+" rows)",sum===total,{sum,total,c:doc?.counts});
 ok("N3 Iraq OSM permanently excluded (source_disabled_for_market); Google URL and Google source dataset → google_origin; non-target country and closed places dropped",
   doc.counts.dropped.source_disabled_for_market===1&&doc.counts.dropped.google_origin===2&&doc.counts.dropped.no_target_country===1&&doc.counts.dropped.closed===1
   &&!doc.candidates.some(c=>c.market==="ARAB"&&c.dataset==="osm"),doc.counts.dropped);
 ok("N4 one business host listed in both markets (shared.com, www/path variant) is kept ONCE across markets (duplicate_host)",doc.candidates.filter(c=>/shared\.com/.test(c.websites[0])).length===1&&doc.counts.dropped.duplicate_host===1);
 ok("N5 deterministic: input order and generated_at do not change the candidate list (identical JSON); source release recorded",
   JSON.stringify(doc.candidates)===JSON.stringify(doc2.candidates)&&doc.source_releases.overture==="2026-10-21.0"&&doc.release==="2026-11-01.0");
 const per=Object.fromEntries(["IRAN","ARAB"].map(m=>[m,doc.candidates.filter(c=>c.market===m).length]));
 ok("N6 market from the record's country only (IR→IRAN, IQ→ARAB), per-record license and source kept",per.IRAN>=3&&per.ARAB>=1&&doc.candidates.every(c=>c.license&&Array.isArray(c.source_datasets)),per);
 // Worker side: a hand-made file with scalars and nulls where lists belong is refused record by record, never thrown
 let wthrew=null,wv;try{wv=DD.validateCandidateFile({schema:DD.DISCOVERY_SCHEMA,release:"2026-11-01.0",candidates:[{market:"IRAN",dataset:"overture",record_id:"w1",license:"CDLA-Permissive-2.0",websites:"https://w1.ir/",source_datasets:null,phones:"x"},null,5]});}catch(e){wthrew=e;}
 ok("N7 Worker: scalar/null list fields and non-object records in a file are refused or ignored without throwing (a throw would fail every cron tick)",!wthrew&&wv.ok&&wv.rejected.invalid===2&&wv.rejected.no_own_website===1,wthrew?String(wthrew):wv.rejected);

 // ---- H: integrity seal
 const sealed=await NC.sealCandidateFile(doc),rd=st=>DD.readCandidateFile(st,S());
 const okSeal=await rd(store(sealed));
 const tampered=JSON.parse(JSON.stringify(sealed));tampered.candidates[0].name="changed";
 const truncated=JSON.parse(JSON.stringify(sealed));truncated.candidates.pop();
 ok("H1 sealed file (content_sha256 of the candidate list) is accepted and reported integrity 'sealed'",okSeal.ok&&okSeal.integrity==="sealed"&&/^[0-9a-f]{64}$/.test(sealed.content_sha256),okSeal.reason);
 ok("H2 a changed record or a truncated list under the seal → content_hash_mismatch, nothing read",(await rd(store(tampered))).reason==="content_hash_mismatch"&&(await rd(store(truncated))).reason==="content_hash_mismatch");
 ok("H3 a non-string or empty seal is refused; an unsealed (Phase 18.3 pilot format) file is still accepted as 'unsealed'",
   (await rd(store({...sealed,content_sha256:123}))).reason==="content_hash_mismatch"&&(await rd(store({...sealed,content_sha256:""}))).reason==="content_hash_mismatch"&&(await rd(store(doc))).integrity==="unsealed");
 ok("H4 the seal is stable: re-sealing the same content gives the same hash; the per-release digest is unchanged by sealing",
   (await NC.sealCandidateFile(doc2)).content_sha256===sealed.content_sha256&&okSeal.digest===(await rd(store(doc))).digest);}

// ---- world: real D1, real cron, real identity/upsert helpers
const page=(t,b)=>new Response(`<html><head><title>${t}</title></head><body>${b}</body></html>`,{status:200,headers:{"Content-Type":"text/html"}});
const SITES={
  "https://rafidain-ds.iq/":()=>page("صاغة الرافدين","صاغة الرافدين للذهب في بغداد — للتواصل: ٠٧٧٠١٢٣٤٥٦٧"),
  "https://firuze2-ds.ir/":()=>page("زیورآلات فیروزه","زیورآلات و طلای فیروزه در تهران تلفن ۰۹۱۲۳۴۵۶۷۸۹ <a href=\"tel:۰۹۳۵۱۱۱۲۲۳۳\">تماس</a>"),
  "https://cross-ds.com/":()=>page("طلافروشی کراس","طلافروشی، واتساپ +٩٦٤ ٧٧٠ ١٢٣ ٤٥٦٧")};
const fetched=[],paid=[];let cur=null;
const mock=async(u,o={})=>{const s=String(u?.url||u);if(s.startsWith("https://w.test/"))return cur.run(new Request(s,o));
  if(/places\.googleapis|api\.openai|api\.anthropic|brave/.test(s)){paid.push(s);return new Response("{}",{status:500});}
  if(/\/robots\.txt$/.test(s))return new Response("",{status:404});if(SITES[s]){fetched.push(s);return SITES[s]();}
  if(/^https:\/\/[a-z0-9.-]+\.(ir|iq)\//.test(s))return new Response("",{status:404});
  if(/^https:\/\/www\.(google|bing)\.com\/search/.test(s))return new Response("<html></html>",{status:200,headers:{"Content-Type":"text/html"}});
  return cur.inner(u,o);};
const world=async env=>{const w=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on",DATASET_DISCOVERY_VERIFY_PER_RUN:"6",...env}});
  w.inner=globalThis.fetch;globalThis.fetch=mock;w.dbrun("CREATE TABLE IF NOT EXISTS lead_identities (identity_key TEXT PRIMARY KEY, identity_type TEXT NOT NULL, normalized_value TEXT NOT NULL, lead_id TEXT NOT NULL, source TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");return w;};
const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;
const tick=async w=>{cur=w;const p=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},w.env,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);};
const ds=w=>w.q("SELECT * FROM leads").map(r=>({...r,meta:JSON.parse(r.notes||"{}")})).filter(r=>r.meta.provider==="dataset");
const intel=async(w,l)=>{cur=w;return (await w.call("/api/leads/intelligence?id="+encodeURIComponent(l.id),null,"GET")).body?.item;};
const rec=(id,o={})=>({market:"IRAN",dataset:"overture",record_id:id,license:"CDLA-Permissive-2.0",source_datasets:["meta"],name:"x",city:"Tehran",websites:[`https://${id}.ir/`],...o});
const file=(release,c)=>({schema:DD.DISCOVERY_SCHEMA,release,candidates:c});

// ---- C: parse cache (cost) — an in-progress import does not re-download the file on a warm isolate
{const W=await world({});cur=W;DD.resetCandidateFileCache();
 const helpers={identities:({meta})=>[{identity_type:"domain",identity_key:"domain:"+new URL(meta.url).hostname}],upsert:async(env,{name,meta})=>{const id="c-"+meta.dataset_record.record_id,t=new Date().toISOString();
   W.dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",[id,name,meta.url,"discovered","low",JSON.stringify(meta),t,t]);
   W.dbrun("INSERT INTO lead_identities VALUES(?,?,?,?,?,?,?)",["domain:"+new URL(meta.url).hostname,"domain","x",id,"t",t,t]);return {created:true,id};}};
 const st=store(await NC.sealCandidateFile(file("2026-11-02.0",["c1","c2","c3","c4"].map(x=>rec(x)))));
 const ing=()=>DD.ingestDatasetCandidates({...W.env,DATASET_DISCOVERY:"on",DATASET_DISCOVERY_IRAN_PER_RUN:"1"},{settings:S({DATASET_DISCOVERY_IRAN_PER_RUN:"1"}),store:st,helpers});
 const r1=await ing(),r2=await ing(),r3=await ing();
 ok("C1 while a release is being imported, later ticks reuse the parsed file (1 GET for 3 ticks), still one record per tick, integrity 'sealed'",
   r1.ok&&!r1.cached&&r2.cached&&r3.cached&&st.gets===1&&r1.created.IRAN+r2.created.IRAN+r3.created.IRAN===3&&r1.integrity==="sealed",{gets:st.gets,r2});
 st.doc=await NC.sealCandidateFile(file("2026-11-03.0",["c1","c2","c3","c4","c5"].map(x=>rec(x))));const r4=await ing();
 ok("C2 a new object (new etag) is downloaded again at once (no stale cache)",!r4.cached&&st.gets===2&&r4.release==="2026-11-03.0",r4);
 const r5=await ing(),r6=await ing(),g=st.gets,r7=await ing();
 ok("C3 after completion the cache is dropped and only HEAD is used (no GET)",r6.ok&&(r6.reason==="complete"||r6.done?.IRAN)&&r7.reason==="complete"&&st.gets===g,{r5,r6,r7,gets:st.gets});
 // same Overture source, two file releases (G-1 end-to-end): the second file is accepted, known domains skipped, nothing duplicated
 const n=ds(W).length;st.doc=await NC.sealCandidateFile(file("2026-11-04.0",["c1","c2","c9"].map(x=>rec(x))));
 const r8=await DD.ingestDatasetCandidates({...W.env,DATASET_DISCOVERY:"on"},{settings:S(),store:st,helpers});
 ok("C4 G-1 end-to-end: a second file with a new release id is imported; the 2 known domains are skipped, 1 new lead, no duplicate",r8.ok&&r8.created.IRAN===1&&r8.skipped.identity_exists===2&&ds(W).length===n+1,r8);}

// ---- D: Persian / Arabic-Indic digits (Iraq and Iran own sites), through the real cron and contact store
{const W=await world({DATASET_DISCOVERY:"on",DISCOVERY_BUCKET:store(file("2026-11-05.0",[
   rec("q-rafidain",{market:"ARAB",name:"صاغة الرافدين",city:"Baghdad",websites:["https://rafidain-ds.iq/"]}),
   rec("i-firuze2",{name:"زیورآلات فیروزه",websites:["https://firuze2-ds.ir/"]}),
   rec("i-cross",{name:"طلافروشی کراس",websites:["https://cross-ds.com/"]})]))});
 DD.resetCandidateFileCache();for(let i=0;i<2;i++)await tick(W);
 const L=id=>ds(W).find(l=>l.meta.dataset_record.record_id===id),ph=id=>W.q("SELECT normalized_value FROM lead_contacts WHERE lead_id=? AND contact_type='phone'",[L(id).id]).map(r=>r.normalized_value);
 const q=L("q-rafidain"),f=L("i-firuze2"),c=L("i-cross");
 ok("D1 Iraq: an own site that names itself 'صاغة' (goldsmiths) with an Arabic-Indic 07xx number is accepted; local phone detected; the number is stored as a page-extracted contact",
   q?.meta.dataset_verification?.result==="verified_site"&&q.meta.qualification.local_phone===true&&ph("q-rafidain").some(v=>/7701234567/.test(v)),{v:q?.meta.dataset_verification,ph:q&&ph("q-rafidain")});
 ok("D2 Iran: 'زیورآلات' title accepted; Persian-digit mobile in text and Persian-digit tel: link both stored (before: dropped by an ASCII-only \\D)",
   f?.meta.dataset_verification?.result==="verified_site"&&f.meta.qualification.local_phone===true&&ph("i-firuze2").some(v=>/9123456789/.test(v))&&ph("i-firuze2").some(v=>/9351112233/.test(v)),{ph:f&&ph("i-firuze2")});
 ok("D3 market mismatch read through local digits: an IRAN-listed non-.ir site showing only an Iraqi +964 number in Arabic-Indic digits is rejected wrong_market (a bare 07xx number stays ambiguous: Iranian area codes 07x share that shape)",c?.meta.rejected_reason==="wrong_market",c?.meta.contact_enrichment_result);
 const iq=await intel(W,q),irn=await intel(W,f);
 ok("D4 markets and currencies stay correct: the Iraq lead is ARAB, the Iran lead IRAN; no owner step except approval before any send",
   iq?.market==="ARAB"&&irn?.market==="IRAN"&&[iq,irn].every(x=>!x.next_action||x.next_action.authorization!=="owner_decision"||x.next_action.action!=="ESCALATE_FINANCIAL_DECISION"),{iq:iq&&[iq.market,iq.state,iq.next_action],ir:irn&&[irn.market,irn.state]});
 const SI=(cur=W,(await W.call("/api/sales/intelligence?limit=50",null,"GET")).body);
 ok("D5 funnel currencies unchanged: IRAN TOMAN, ARAB USD",SI.markets.IRAN.currency==="TOMAN"&&SI.markets.ARAB.currency==="USD");
 // gates
 const fin=LQ.leadQualification({name:"x",stage:"replied"},{provider:"dataset",url:"https://rafidain-ds.iq/",evidence:"ذهب",target_market:"ARAB",city:"بغداد"},[],{replied:true,quote_requested:true});
 ok("D6 financial gate: a dataset lead asking for a quote escalates to the owner; discovery created no approval or outreach row and sent nothing; no paid call",
   fin.next_action.action==="ESCALATE_FINANCIAL_DECISION"&&fin.next_action.authorization==="owner_decision"&&!W.q("SELECT 1 FROM lead_outreach").length&&!W.tg.some(x=>/^send/.test(x.method))&&!paid.length,{na:fin.next_action,paid});
 // switch off: the same bound bucket is not read at all
 const st=store(file("2026-11-06.0",[rec("off1")]));await tick({...W,env:{...W.env,DATASET_DISCOVERY:"off",DISCOVERY_BUCKET:st}});
 ok("D7 DATASET_DISCOVERY=\"off\" with a bound bucket: not read, nothing imported",st.gets===0&&st.heads===0&&!ds(W).some(l=>l.meta.dataset_record.record_id==="off1"));}

fs.rmSync(tmp,{recursive:true,force:true});
console.log(`phase18_11 time ${((Date.now()-started)/1000).toFixed(1)} s`);
process.exit(done()?1:0);
