// PHASE 19.1 — lead intelligence: revenue score (0–100, explained, VERIFIED vs INFERRED, INSUFFICIENT_DATA), evidence-based sales
// pipeline and transition guard, per-market summary from real records, the /api/sales/intelligence integration and the dashboard section.
// Offline only: node:sqlite, no network, nothing sent, no Production access.
import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase19_1");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const imp=f=>import(pathToFileURL(path.join(SRC,f)).href);
const LS=await imp("lead-scoring.js"),LQ=await imp("lead-qualification.js"),DP=await imp("live-dashboard-page.js");
const NOW=Date.parse("2026-11-05T12:00:00Z"),iso=d=>new Date(NOW-d*86400000).toISOString();
const c=(lid,type,url,status="page_extracted")=>({lead_id:lid,contact_type:type,normalized_value:type+lid,evidence_status:status,evidence_url:url,created_at:iso(2)});
const verifiedMeta={source:"dataset_discovery",provider:"web",url:"https://zarin-gallery.ir/",evidence:"گالری طلا و جواهر زرین · فروش عمده · کالکشن اختصاصی",target_market:"IRAN",city:"تهران",type:"gold_fa",
  qualification:{buyer_in_title:true,local_domain:true},contact_enrichment_checked_at:iso(3)};
const lead=(id,stage="discovered")=>({id,name:"گالری زرین",stage,created_at:iso(20),updated_at:iso(1)});
const score=(m,contacts=[],act={},l=lead("L1"))=>{const p=LQ.leadQualification(l,m,contacts,act);return {p,s:LS.leadRevenueScore(p,l,m,act,{nowMs:NOW}),pl:null};};

// ---- S: score
ok("S0 weights are the owner's initial weights and sum to 100",JSON.stringify(LS.SCORE_WEIGHTS)==='{"market_relevance":30,"b2b_fit":25,"contact_quality":20,"business_evidence":15,"data_quality":10}'&&Object.values(LS.SCORE_WEIGHTS).reduce((a,b)=>a+b)===100);
{const {p,s}=score(verifiedMeta,[c("L1","phone","https://zarin-gallery.ir/contact"),c("L1","instagram","https://zarin-gallery.ir/")]);
 ok("S1 verified own-site jewelry business with two verified channels scores VERY_HIGH/HIGH, every component within its maximum",s.score>=60&&["VERY_HIGH","HIGH"].includes(s.band)&&Object.values(s.components).every(x=>x.points>=0&&x.points<=x.max)&&s.score<=100,{score:s.score,band:s.band,state:p.state,r:s.reasons});
 ok("S2 each point is labelled: identity/contact/market are VERIFIED; page wording about packaging is INFERRED (never claimed as demand)",
   s.components.contact_quality.verified.length>0&&s.components.business_evidence.verified.length>0&&s.components.b2b_fit.inferred.some(x=>/wording/.test(x))&&s.components.b2b_fit.verified.length===0,s.components.b2b_fit);
 ok("S3 reproducible: same input → same score and fingerprint; the cache returns the same result",JSON.stringify(LS.leadRevenueScore(p,lead("L1"),verifiedMeta,{},{nowMs:NOW}))===JSON.stringify(s)
   &&LS.scoreFingerprint(p,lead("L1"),verifiedMeta,{},NOW)===LS.scoreFingerprint(p,lead("L1"),verifiedMeta,{},NOW)
   &&(()=>{LS.clearScoreCache();const a=LS.scoreLeadCached(p,lead("L1"),verifiedMeta,{},{nowMs:NOW}),b=LS.scoreLeadCached(p,lead("L1"),verifiedMeta,{},{nowMs:NOW});return a.cached===false&&b.cached===true&&a.score.score===b.score.score;})());
 const p2=LQ.leadQualification(lead("L1"),{...verifiedMeta,contact_enrichment_checked_at:iso(0)},[c("L1","phone","https://zarin-gallery.ir/contact")],{});
 ok("S4 the fingerprint changes when the evidence changes (cache is refreshed, never stale)",LS.scoreFingerprint(p,lead("L1"),verifiedMeta,{},NOW)!==LS.scoreFingerprint(p2,lead("L1"),{...verifiedMeta,contact_enrichment_checked_at:iso(0)},{},NOW));}
{const m={source:"ad_autopilot",provider:"google_places_ids",place_id:"ChIJabc",target_market:"ARAB",city:"بغداد",type:"gold_ar",lead_status:"provisional_place"};const {s}=score(m);
 ok("S5 a Google-ID-only lead is INSUFFICIENT_DATA (not LOW): missing information is not low value; its points are INFERRED",s.band==="INSUFFICIENT_DATA"&&s.insufficient_data===true&&s.components.business_evidence.inferred.length===1&&s.components.business_evidence.verified.length===0,s);}
{const {s}=score({source:"telegram_inbound"},[],{replied:true});
 ok("S6 a real conversation without a market is INSUFFICIENT_DATA (market needed for currency/prices), never LOW",s.band==="INSUFFICIENT_DATA"&&s.missing_facts.includes("market")&&s.components.contact_quality.verified.some(x=>/conversation/.test(x)),s);}
{const {s}=score({source:"telegram_inbound",market:"IRAN"},[],{replied:true,ordered:true,quote_requested:true,order_markets:["IRAN"]});
 ok("S7 a real customer with an order ranks high: B2B fit from the order record is VERIFIED (no website needed)",s.score>=60&&s.components.b2b_fit.points===25&&s.components.b2b_fit.verified.length===2,{score:s.score,c:s.components.b2b_fit});}
{const {s}=score({...verifiedMeta,evidence:"گالری طلا · تولید جعبه و چاپ جعبه"});
 ok("S8 a page that SELLS packaging gets no B2B-fit points (competitor/supplier)",s.components.b2b_fit.points===0&&s.components.b2b_fit.inferred.some(x=>/sells packaging/.test(x)));}
{const {s}=score(verifiedMeta,[],{},{...lead("L9"),stage:"rejected"});
 ok("S9 a rejected lead is EXCLUDED with score 0",s.band==="EXCLUDED"&&s.score===0&&s.excluded===true);}
{LS.clearScoreCache();const pa=LQ.leadQualification(lead("X1"),verifiedMeta,[],{}),pb=LQ.leadQualification(lead("X2"),verifiedMeta,[],{}),mb={...verifiedMeta,target_market:"ARAB",url:"https://zarin-gallery.iq/"},pc=LQ.leadQualification(lead("X1"),mb,[],{});
 const a=LS.scoreLeadCached(pa,lead("X1"),verifiedMeta,{},{nowMs:NOW}),b=LS.scoreLeadCached(pb,lead("X2"),verifiedMeta,{},{nowMs:NOW}),c2=LS.scoreLeadCached(pc,lead("X1"),mb,{},{nowMs:NOW});
 ok("S11 cache isolation: identical evidence on two different leads, or the same lead in another market, never shares a cache entry",a.fingerprint!==b.fingerprint&&b.cached===false&&a.fingerprint!==c2.fingerprint&&c2.cached===false&&a.score.currency==="TOMAN"&&(c2.score.currency===null||c2.score.currency==="USD"),{a:a.fingerprint,b:b.fingerprint,c:c2.fingerprint,cur:c2.score.currency});}
ok("S10 band thresholds: 80→VERY_HIGH, 60→HIGH, 40→REVIEW, 39→LOW",LS.SCORE_BANDS.map(b=>b.join(":")).join(",")==="VERY_HIGH:80,HIGH:60,REVIEW:40,LOW:0");

// ---- P: pipeline (records only) and transition guard
{const p=LQ.leadQualification(lead("P1"),verifiedMeta,[c("P1","phone","https://zarin-gallery.ir/contact")],{}),st=a=>LS.pipelineStage(p,lead("P1"),verifiedMeta,a,null,{nowMs:NOW});
 ok("P1 stages follow records: qualified → draft=REVIEWED → approved=OWNER_APPROVED → sent=CONTACTED → reply=NEGOTIATION → approved quote=QUOTE → order=ORDER",
   st({}).stage==="QUALIFIED"&&st({outreach_status:"draft"}).stage==="REVIEWED"&&st({outreach_status:"approved"}).stage==="OWNER_APPROVED"&&st({outreach_status:"sent"}).stage==="CONTACTED"
   &&st({outreach_status:"sent",replied:true}).stage==="NEGOTIATION"&&st({outreach_status:"sent",replied:true,quoted:true}).stage==="QUOTE"&&st({outreach_status:"sent",replied:true,quoted:true,ordered:true}).stage==="ORDER");
 ok("P2 sent 15 days ago without reply → side state NO_RESPONSE; duplicate → DUPLICATE",st({outreach_status:"sent",outreach_sent_at:iso(15)}).side_state==="NO_RESPONSE"&&st({outreach_status:"sent",outreach_sent_at:iso(3)}).side_state===null&&st({duplicate_of:"X"}).side_state==="DUPLICATE");
 const crm=LS.pipelineStage(p,{...lead("P1"),stage:"negotiation"},verifiedMeta,{},null,{nowMs:NOW});
 ok("P3 a CRM stage 'negotiation' without contact evidence is NOT trusted (stage stays QUALIFIED and the gap is reported)",crm.stage==="QUALIFIED"&&crm.evidence.some(e=>/crm_stage_without_contact_evidence/.test(e)),crm);
 ok("P4 an order without a quote record is not counted as a quote in the funnel flags",(()=>{const f=st({ordered:true}).flags;return f.order===true&&f.quote===false;})());}
{const T=LS.canTransition;
 ok("P5 transition guard: CONTACTED needs a real contact event; OWNER_APPROVED needs an owner approval; QUOTE an approved quote; ORDER a real order",
   !T("OWNER_APPROVED","CONTACTED",{}).ok&&T("OWNER_APPROVED","CONTACTED",{contact_event_id:"e1"}).ok&&!T("REVIEWED","OWNER_APPROVED",{}).ok&&T("REVIEWED","OWNER_APPROVED",{owner_approval_id:"a1"}).ok
   &&!T("NEGOTIATION","QUOTE",{}).ok&&T("NEGOTIATION","QUOTE",{approved_quote_id:"q1"}).ok&&!T("QUOTE","ORDER",{}).ok&&T("QUOTE","ORDER",{order_id:"o1"}).ok);
 ok("P6 no skipping (QUALIFIED→CONTACTED without an inbound message), no going back, DUPLICATE needs the original lead",!T("QUALIFIED","CONTACTED",{contact_event_id:"e"}).ok&&T("QUALIFIED","CONTACTED",{inbound:true,inbound_message_id:"m1"}).ok
   &&!T("ORDER","QUOTE",{approved_quote_id:"q"}).ok&&!T("QUALIFIED","DUPLICATE",{}).ok&&T("QUALIFIED","DUPLICATE",{duplicate_of:"L0"}).ok&&T("DISCOVERED","NEEDS_DATA",{}).ok);}

// ---- R: strict record rules (salesLeadActivity strict fields)
{const p=LQ.leadQualification(lead("R1"),verifiedMeta,[c("R1","phone","https://zarin-gallery.ir/contact")],{}),st=a=>LS.pipelineStage(p,lead("R1"),verifiedMeta,{strict_activity:true,...a},null,{nowMs:NOW});
 ok("R1 an order that is not confirmed yet is NOT the ORDER stage (reported as order_not_confirmed_yet); a confirmed one is",st({ordered:true}).stage!=="ORDER"&&st({ordered:true}).evidence.includes("order_not_confirmed_yet")&&st({ordered:true,order_confirmed:true}).stage==="ORDER");
 ok("R2 a quote row that did not come from the customer's own message does not create NEGOTIATION",st({quote_requested:true}).stage==="QUALIFIED"&&st({quote_customer_request:true}).stage==="NEGOTIATION");
 ok("R3 owner approval is the recorded approved_at, never inferred: a send without it is flagged as an anomaly and not counted as owner-approved",
   st({outreach_status:"sent",outreach_ever_sent:true}).evidence.includes("anomaly:sent_without_recorded_owner_approval")&&st({outreach_status:"sent",outreach_ever_sent:true}).flags.owner_approved===false
   &&st({outreach_status:"approved",outreach_approved_at:iso(1)}).stage==="OWNER_APPROVED");
 ok("R4 a newer draft after a real send keeps the lead CONTACTED (a real send is never undone)",st({outreach_status:"draft",outreach_ever_sent:true,outreach_approved_at:iso(5)}).stage==="CONTACTED");
 const pg=LQ.leadQualification(lead("R5"),{source:"ad_autopilot",provider:"google_places_ids",place_id:"ChIJz",target_market:"IRAN"},[],{});
 ok("R5 an outreach draft for an unqualified (Google-only) lead is shown as an anomaly, not as a normal step",LS.pipelineStage(pg,lead("R5"),{},{strict_activity:true,outreach_status:"draft"},null,{nowMs:NOW}).evidence.includes("anomaly:outreach_record_ahead_of_qualification"));
 const tm={...verifiedMeta,data_class:"test"},pt=LQ.leadQualification(lead("R6"),tm,[],{}),ts=LS.leadRevenueScore(pt,lead("R6"),tm,{ordered:true,order_confirmed:true},{nowMs:NOW});
 ok("R6 a CRM test record (data_class=test) is EXCLUDED from scoring and from the funnel",ts.band==="EXCLUDED"&&ts.test_record===true&&Object.keys(LS.pipelineStage(pt,lead("R6"),tm,{strict_activity:true,order_confirmed:true},ts,{nowMs:NOW}).flags).length===0);
 ok("R7 duplicates stay visible on the lead but are left out of the funnel counts",Object.keys(st({duplicate_of:"X",order_confirmed:true}).flags).length===0&&st({duplicate_of:"X"}).side_state==="DUPLICATE");}

// ---- M: per-market summary from records
{const mk=(market,band,flags,contact="NONE")=>({market,contact_status:contact,score:{band},pipeline:{stage:"DISCOVERED",side_state:null,index:0,flags}});
 const S=LS.revenueSummary([mk("IRAN","HIGH",{qualified:true,contacted:true,negotiation:true,order:true},"CONTACT_VERIFIED"),mk("IRAN","INSUFFICIENT_DATA",{}),mk("ARAB","VERY_HIGH",{qualified:true,owner_approved:true,draft_for_owner:false})]);
 ok("M1 markets are separate with their own currency (IRAN TOMAN, ARAB USD) and counts",S.IRAN.currency==="TOMAN"&&S.ARAB.currency==="USD"&&S.IRAN.discovered===2&&S.ARAB.discovered===1&&S.IRAN.high_priority===1&&S.ARAB.high_priority===1);
 ok("M2 conversion is computed only from records and carries its counts; no denominator → null (never an invented rate)",S.IRAN.conversion.contacted_to_negotiation.percent===100&&S.IRAN.conversion.contacted_to_negotiation.denominator===1&&S.ARAB.conversion.contacted_to_negotiation.percent===null&&S.IRAN.quotes===0);}

// ---- A: API integration (real worker, in-memory D1) — read-only, no network
const W=await makeWorld({});const {q,dbrun,call}=W;const t=new Date().toISOString();
const ins=(id,name,stage,notes)=>dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",[id,name,notes.url||"",stage,"normal",JSON.stringify(notes),t,t]);
const con=(lid,type,value,url)=>dbrun("INSERT INTO lead_contacts(id,lead_id,contact_type,raw_value,normalized_value,evidence_status,source,evidence_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",[lid+":"+type,lid,type,value,value,"page_extracted","test",url,t,t]);
ins("ir-1","گالری زرین","discovered",{...verifiedMeta,contact_enrichment_checked_at:t});con("ir-1","phone","+982100000001","https://zarin-gallery.ir/contact");
ins("iq-1","مجوهرات الرافدين","discovered",{source:"dataset_discovery",provider:"web",url:"https://rafidain-gold.iq/",evidence:"مجوهرات الرافدين ذهب بالجملة",target_market:"ARAB",city:"بغداد",type:"gold_ar",qualification:{buyer_in_title:true,local_domain:true},contact_enrichment_checked_at:t});
con("iq-1","phone","+9647700000001","https://rafidain-gold.iq/");
ins("g-1","طلافروشی در تهران (Google Maps) · #abc123","discovered",{source:"ad_autopilot",provider:"google_places_ids",place_id:"ChIJx",target_market:"IRAN",city:"تهران",type:"gold_fa",lead_status:"provisional_place"});
const before=JSON.stringify(q("SELECT id,stage,notes,updated_at FROM leads ORDER BY id")),evBefore=q("SELECT COUNT(*) n FROM system_events")[0].n,tablesBefore=q("SELECT COUNT(*) n FROM sqlite_master")[0].n;
const base=(await call("/api/sales/intelligence?limit=50",null,"GET")).body,r=(await call("/api/sales/intelligence?sort=score&limit=50",null,"GET")).body;
ok("A1 the default response keeps its ranking (Phase 17 order; the Google-ID-only lead stays excluded as before) and now also carries lead_score + pipeline per item",base.ok&&base.items.length===2&&!base.items.some(i=>i.id==="g-1")&&base.items.every(i=>i.lead_score&&i.pipeline&&typeof i.priority_score==="number"),base.items?.map(i=>i.name));
ok("A2 sort=score ranks by the revenue score; each item explains its score (components, reasons, verified/inferred, missing facts)",r.items.length===2&&r.items[0].lead_score.score>=r.items[1].lead_score.score&&r.items.every(i=>i.lead_score.reasons.length&&i.lead_score.components.contact_quality&&Array.isArray(i.lead_score.missing_facts)));
ok("A3 per-market revenue summary is separate (IRAN TOMAN / ARAB USD) and the scoring metadata lists weights, bands and pipeline",r.markets.IRAN.revenue.currency==="TOMAN"&&r.markets.ARAB.revenue.currency==="USD"&&r.markets.IRAN.revenue.discovered===2&&r.markets.ARAB.revenue.discovered===1&&r.scoring.weights.market_relevance===30&&r.scoring.pipeline.length===8);
const fb=(await call("/api/sales/intelligence?sort=score&band=INSUFFICIENT_DATA",null,"GET")).body,fm=(await call("/api/sales/intelligence?sort=score&market=ARAB",null,"GET")).body,fi=(await call("/api/sales/intelligence?sort=score&industry=gold",null,"GET")).body;
const fs2=(await call("/api/sales/intelligence?sort=score&stage=NEEDS_DATA",null,"GET")).body,bad=(await call("/api/sales/intelligence?sort=score&band=DROP%20TABLE&stage=x'",null,"GET")).body;
ok("A4 filters: band (INSUFFICIENT_DATA shows the Google-ID lead), market, industry, CRM/pipeline stage; invalid filter values are ignored",
  fb.items.length===1&&fb.items[0].id==="g-1"&&fm.items.every(i=>i.market==="ARAB")&&fm.items.length===1&&fi.items.length===2&&fs2.items.some(i=>i.id==="g-1")&&bad.ok&&bad.items.length===2,{fb:fb.items?.map(i=>i.id),fm:fm.items?.length,fi:fi.items?.length,fs2:fs2.items?.map(i=>i.id)});
ok("A5 read-only: no lead, table or event was written by scoring; nothing left the process",JSON.stringify(q("SELECT id,stage,notes,updated_at FROM leads ORDER BY id"))===before&&q("SELECT COUNT(*) n FROM system_events")[0].n===evBefore&&q("SELECT COUNT(*) n FROM sqlite_master")[0].n===tablesBefore&&W.offNet().length===0,W.offNet());
const un=await W.run(new Request("https://w.test/api/sales/intelligence?sort=score"));
ok("A6 the endpoint still requires authentication",un.status===401);

// ---- D: dashboard
{const html=DP.liveDashboardHtml(DP.dashboardRoute("/dashboard/customers")),js=html.slice(html.lastIndexOf("<script>")+8).replace(/<\/script><\/body><\/html>$/,"");
 let parses=true;try{new Function(js);}catch{parses=false;}
 ok("D1 the Customers page has the lead-prioritization section with market / industry / score / CRM-status filters, after Sales intelligence",html.includes('id="leadPriorityPanel"')&&["lp_market","lp_industry","lp_band","lp_stage"].every(k=>html.includes('id="'+k+'"'))&&html.indexOf("salesIntelPanel")<html.indexOf("leadPriorityPanel")&&parses);
 ok("D2 Errors and Owner Decisions/approvals pages are unchanged (no prioritization section there)",!DP.liveDashboardHtml(DP.dashboardRoute("/dashboard/errors")).includes("leadPriorityPanel")&&!DP.liveDashboardHtml(DP.dashboardRoute("/dashboard/approvals")).includes("leadPriorityPanel"));
 ok("D3 the section only reads (GET) — it has no send/approve/price action",/function loadLeadPriority/.test(html)&&!/leadPriority[^;]{0,200}method:"POST"/.test(html));}
done();
