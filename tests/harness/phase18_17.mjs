// PHASE 18.17 — a market disabled by its limits (per-run or daily = 0) gets no imports AND no website checks of its already-imported
// dataset leads (Iraq-only mode after Iran leads exist). Offline only: node:sqlite, mocked websites, nothing sent.
import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase18_17");
const started=Date.now();
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const DD=await import(pathToFileURL(path.join(SRC,"dataset-discovery.js")).href);

// ---- M1: settings
{const M=e=>DD.discoverySettings(e).markets;
 ok("M1 both markets enabled by default; a 0 per-run OR a 0 daily limit disables only that market; an unset limit keeps its default",
   JSON.stringify(M({}))==='{"IRAN":true,"ARAB":true}'&&JSON.stringify(M({DATASET_DISCOVERY_IRAN_PER_RUN:"0"}))==='{"IRAN":false,"ARAB":true}'
   &&JSON.stringify(M({DATASET_DISCOVERY_IRAN_DAILY_CAP:"0"}))==='{"IRAN":false,"ARAB":true}'&&JSON.stringify(M({DATASET_DISCOVERY_ARAB_PER_RUN:"0",DATASET_DISCOVERY_ARAB_DAILY_CAP:"0"}))==='{"IRAN":true,"ARAB":false}');}

// ---- M2-M4: real cron, one pending dataset lead per market
const fetched=[];let inner=null;
const page=t=>new Response(`<html><head><title>${t}</title></head><body>${t} طلا ذهب</body></html>`,{status:200,headers:{"Content-Type":"text/html"}});
const W=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on"}});const {q,dbrun}=W;
inner=globalThis.fetch;globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);if(s.startsWith("https://w.test/"))return W.run(new Request(s,o));
  if(/places\.googleapis|api\.openai|api\.anthropic|brave/.test(s))throw new Error("paid call attempted");
  if(/\/robots\.txt$/.test(s))return new Response("",{status:404});
  if(s==="https://iran-m.ir/"){fetched.push("IRAN");return page("طلافروشی ماهرخ");}
  if(s==="https://iraq-m.iq/"){fetched.push("ARAB");return page("مجوهرات الرافدين");}
  if(/^https:\/\/[a-z0-9.-]+\.(ir|iq)\//.test(s))return new Response("",{status:404});
  if(/^https:\/\/www\.(google|bing)\.com\/search/.test(s))return new Response("<html></html>",{status:200,headers:{"Content-Type":"text/html"}});
  return inner(u,o);};
const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;
const tick=async env=>{const p=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},env,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);};
const lead=(id,market,url,name)=>{const t=new Date().toISOString();dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",[id,name,url,"discovered","low",
  JSON.stringify({provider:"dataset",source:"overture_places",url,website:url,target_market:market,type:market==="ARAB"?"gold_ar":"gold_fa",dataset_record:{dataset:"overture",record_id:id,release:"2026-11-08.0",license:"CDLA-Permissive-2.0"},dataset_claims:{name,city:null,trusted:false}}),t,t]);};
lead("m-ir","IRAN","https://iran-m.ir/","طلافروشی ماهرخ");lead("m-iq","ARAB","https://iraq-m.iq/","مجوهرات الرافدين");
const reset=()=>{dbrun("UPDATE leads SET notes=json_remove(notes,'$.contact_enrichment_checked_at','$.dataset_verification') WHERE id IN ('m-ir','m-iq')");dbrun("DELETE FROM lead_contacts WHERE lead_id IN ('m-ir','m-iq')");fetched.length=0;};
const base={...W.env,DATASET_DISCOVERY:"on",DATASET_DISCOVERY_VERIFY_PER_RUN:"6"};
reset();await tick({...base,DATASET_DISCOVERY_IRAN_PER_RUN:"0",DATASET_DISCOVERY_IRAN_DAILY_CAP:"0"});
ok("M2 Iraq-only (IRAN limits 0): the existing Iranian dataset lead's website is NOT fetched; the Iraqi one is",!fetched.includes("IRAN")&&fetched.includes("ARAB"),fetched);
ok("M2b the Iranian lead keeps no check stamp (it stays pending, nothing recorded as a failure)",!JSON.parse(q("SELECT notes FROM leads WHERE id='m-ir'")[0].notes).contact_enrichment_checked_at);
reset();await tick({...base,DATASET_DISCOVERY_IRAN_DAILY_CAP:"0"});
ok("M3 a daily cap of 0 alone also disables the market's website checks",!fetched.includes("IRAN")&&fetched.includes("ARAB"),fetched);
reset();await tick(base);
ok("M4 both markets enabled again: both pending leads are checked",fetched.includes("IRAN")&&fetched.includes("ARAB"),fetched);
reset();await tick({...base,DATASET_DISCOVERY_IRAN_PER_RUN:"0",DATASET_DISCOVERY_ARAB_PER_RUN:"0"});
ok("M5 both markets disabled by limits: no dataset website is fetched at all",!fetched.length,fetched);
ok("M6 nothing sent, no outreach row",!q("SELECT 1 FROM lead_outreach").length&&!W.tg.some(x=>/^send/.test(x.method)));
console.log(`phase18_17 time ${((Date.now()-started)/1000).toFixed(1)} s`);
process.exit(done()?1:0);
