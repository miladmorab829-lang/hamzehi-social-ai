// PHASE 16.16 — SALES-READY LEAD QUALIFICATION. The CRM ladder PLACE_DISCOVERED → IDENTITY_VERIFIED → CONTACT_VERIFIED →
// BUSINESS_QUALIFIED → SALES_READY → CONTACTED → OPPORTUNITY → CUSTOMER is computed from evidence on read; Google content never counts as
// independent evidence; demand is never invented; an IDs-only Places lead cannot get an outreach draft until the owner verifies it.
// Local only: Google Places and search engines are in-process mocks; no message is sent, no AI call is made.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase16_16qual");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const LQ=await import(pathToFileURL(path.join(SRC,"lead-qualification.js")).href);
const Q=(meta,contacts=[],stage="discovered")=>LQ.leadQualification({stage},meta,contacts);

// ---- pure ladder
const place={source:"ad_autopilot",provider:"google_places_ids",place_id:"ChIJAAAAAAAAAAAAAAAAAAAA1",target_market:"IRAN",city:"تبریز",lead_status:"provisional_place",qualification:{included_type:"jewelry_store",city:"تبریز",market:"IRAN"}};
const web={source:"ad_autopilot",target_market:"ARAB",city:"بغداد",url:"https://shop-iq.example/",evidence:"محل ذهب ومجوهرات في بغداد",qualification:{buyer_in_title:true,local_phone:true}};
ok("Q1 IDs-only Places lead = PLACE_DISCOVERED (no identity, no contact), demand unknown",Q(place).state==="PLACE_DISCOVERED"&&Q(place).packaging_demand==="unknown",Q(place));
ok("Q2 a Google provider_supplied contact never upgrades it (not independent)",Q(place,[{contact_type:"phone",evidence_status:"provider_supplied"}]).state==="PLACE_DISCOVERED");
ok("Q3 legacy manual Places lead with Google name/website is not IDENTITY_VERIFIED",Q({source:"customer_discovery",provider:"google_places",place_id:"ChIJx1234567890",name:"X",website:"https://x.example/",target_market:"IRAN",city:"تهران"}).state==="PLACE_DISCOVERED");
ok("Q4 web lead with its own website page + market + city + relevance = BUSINESS_QUALIFIED (no contact yet)",Q(web).state==="BUSINESS_QUALIFIED",Q(web));
ok("Q5 + a contact extracted from its OWN domain = SALES_READY; the same contact from another site is only CONTACT found → BUSINESS_QUALIFIED",Q(web,[{contact_type:"phone",evidence_status:"page_extracted",evidence_url:"https://shop-iq.example/contact"}]).state==="SALES_READY"&&Q(web,[{contact_type:"phone",evidence_status:"page_extracted",evidence_url:"https://directory.example/x"}]).state==="BUSINESS_QUALIFIED");
ok("Q6 identity + own-domain contact but unknown market = CONTACT_VERIFIED, never BUSINESS_QUALIFIED/SALES_READY",Q({...web,target_market:undefined,country:undefined},[{contact_type:"email",evidence_status:"page_extracted",evidence_url:"https://shop-iq.example/"}]).state==="CONTACT_VERIFIED");
ok("Q7 owner-confirmed identity + owner contact on a Places lead = SALES_READY",Q({...place,identity_verified:true,identity_source:"owner"},[{contact_type:"phone",evidence_status:"owner_confirmed"}]).state==="SALES_READY");
ok("Q8 owner-confirmed identity without contact = BUSINESS_QUALIFIED",Q({...place,identity_verified:true,identity_source:"owner"}).state==="BUSINESS_QUALIFIED");
ok("Q9 CRM stages map to CONTACTED / OPPORTUNITY / CUSTOMER when engagement is recorded (outreach, reply or inbound source)",Q({...web,last_outreach_at:"2026-10-01T00:00:00Z"},[],"contacted").state==="CONTACTED"&&Q({...web,last_reply_at:"2026-10-02T00:00:00Z"},[],"negotiation").state==="OPPORTUNITY"&&Q({source:"telegram_inbound"},[],"negotiation").state==="OPPORTUNITY"&&Q(place,[],"customer").state==="CUSTOMER");
ok("Q9b [Production finding] stage negotiation set without any contact is NOT an opportunity: evidence state kept + flagged",(()=>{const r=Q(web,[{contact_type:"phone",evidence_status:"page_extracted",evidence_url:"https://shop-iq.example/"}],"negotiation");return r.state==="SALES_READY"&&r.evidence.includes("crm_stage_unconfirmed:negotiation");})(),Q(web,[{contact_type:"phone",evidence_status:"page_extracted"}],"negotiation"));
ok("Q10 packaging demand stays 'unknown' for every non-customer state unless the owner recorded evidence",[Q(web,[{contact_type:"phone",evidence_status:"page_extracted"}]),Q(place)].every(x=>x.packaging_demand==="unknown")&&Q({...web,packaging_demand_evidence:"asked for 500 boxes"}).packaging_demand==="owner_recorded");
{const sr=Q(web,[{contact_type:"phone",evidence_status:"page_extracted",evidence_url:"https://shop-iq.example/"}]);
 ok("Q11 priority: Places-only stays low (≤25, tier D); a SALES_READY web lead is tier B (≥50) and never A without real intent",Q(place).priority_score<=25&&Q(place).tier==="D"&&sr.priority_score>=50&&sr.tier==="B",[Q(place).priority_score,sr.priority_score,sr.tier]);}
ok("Q12 a contact type that cannot be reached (website only) does not count as a verified contact",Q(web,[{contact_type:"website",evidence_status:"page_extracted"}]).state==="BUSINESS_QUALIFIED");

// ---- integration: scheduled Places discovery → CRM overview → outreach guard → owner verification
const W=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on",GOOGLE_PLACES_API_KEY:"test-places-not-real",ADS_PLACES_DISCOVERY:"on"}});const {q,call}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
const AE=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+"?qual="+Math.random());await AE.autonomyMasterGate(W.env);
const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;
let openai=0;const inner=globalThis.fetch;
globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);
  if(s.startsWith("https://w.test/"))return W.run(new Request(s,o));
  if(s==="https://places.googleapis.com/v1/places:searchText"){const iq=JSON.parse(o.body||"{}").regionCode==="iq";
    return new Response(JSON.stringify({places:Array.from({length:12},(_,i)=>({id:(iq?"ChIJiqQUAL":"ChIJirQUAL")+String(i).padStart(12,"0")}))}),{status:200,headers:{"Content-Type":"application/json"}});}
  if(/^https:\/\/www\.(google|bing)\.com\/search/.test(s))return new Response("<html></html>",{status:200,headers:{"Content-Type":"text/html"}});
  if(s.startsWith("https://api.openai.com/"))openai++;
  return inner(u,o);};
const tick=async()=>{const p=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},W.env,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);};
await call("/api/ads/autopilot/status",null,"GET");
for(const market of ["IRAN","ARAB"])await call("/api/ads/markets/config",{market,enabled:true,city:"ALL",type:"gold",runs_per_day:24,owner_approved:true});
await tick();
const pl=q("SELECT id,notes FROM leads").filter(r=>JSON.parse(r.notes).provider==="google_places_ids");
ok("Q13 scheduler: one run per market keeps the 10-per-run cap (12 IDs returned → 10 + 10 stored)",pl.length===20,pl.length);
const ov=(await call("/api/leads/overview",null,"GET")).body;
ok("Q14 CRM overview reports the ladder: 20 PLACE_DISCOVERED, 0 SALES_READY/BUSINESS_QUALIFIED",ov.qualification?.PLACE_DISCOVERED===20&&ov.qualification.SALES_READY===0&&ov.qualification.BUSINESS_QUALIFIED===0,ov.qualification);
ok("Q15 no Places lead is in the overview's 'hot' list",!(ov.hot||[]).some(x=>pl.some(p=>p.id===x.id)));
const id=pl.find(r=>JSON.parse(r.notes).target_market==="IRAN").id;
const d1=await call("/api/leads/outreach-draft",{lead_id:id});
ok("Q16 outreach draft for an IDs-only lead is refused (409 lead_not_contactable) and no AI call is made",d1.status===409&&d1.body?.reason==="lead_not_contactable"&&openai===0,d1.body);
const p1=await call("/api/leads",{id,identity_verified:true,verified_contacts:[{contact_type:"phone",value:"+98 41 3555 0000"}]},"PATCH");
const ov2=(await call("/api/leads/overview",null,"GET")).body,me=(ov2.items||[]).find(x=>x.id===id);
ok("Q17 owner verifies identity + a contact → that lead becomes SALES_READY (owner_confirmed evidence), the other 19 stay PLACE_DISCOVERED",p1.status===200&&me?.qualification?.state==="SALES_READY"&&ov2.qualification.PLACE_DISCOVERED===19&&q("SELECT evidence_status FROM lead_contacts WHERE lead_id=?",[id])[0]?.evidence_status==="owner_confirmed",[p1.body,me?.qualification]);
const d2=await call("/api/leads/outreach-draft",{lead_id:id});
ok("Q18 after verification the draft is no longer refused as not contactable (here: no OpenAI key → 503); still draft-only, nothing sent",d2.body?.reason!=="lead_not_contactable"&&q("SELECT COUNT(*) n FROM lead_outreach WHERE status!='draft'")[0]?.n===0,d2.body);
ok("Q19 market isolation in the ladder: IRAN leads' market evidence stays IRAN, ARAB stays ARAB",(ov2.items||[]).filter(x=>x.meta?.provider==="google_places_ids").every(x=>x.qualification.evidence.includes("market:"+x.meta.target_market)||x.qualification.state==="PLACE_DISCOVERED"));
ok("Q20 historical rows are not rewritten by the ladder (computed on read: notes unchanged for untouched leads)",pl.filter(r=>r.id!==id).every(r=>q("SELECT notes FROM leads WHERE id=?",[r.id])[0].notes===r.notes));
ok("Q21 nothing left the in-process mocks; no customer message",W.offNet().length===0,W.offNet());
done();
