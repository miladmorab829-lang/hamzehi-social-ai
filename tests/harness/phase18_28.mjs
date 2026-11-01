// PHASE 18.28 — P1 phone-confirmed identity link for dataset leads; P2 bounded, idempotent retirement of legacy dataset leads whose URL
// is not an own website. Offline only: node:sqlite, mocked websites; nothing sent.
import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase18_28");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const DD=await import(pathToFileURL(path.join(SRC,"dataset-discovery.js")).href);
const LQ=await import(pathToFileURL(path.join(SRC,"lead-qualification.js")).href);

// ---- U: verification rule (pure)
const claims=(o={})=>({name:"مجوهرات سيد حسين",city:"Baghdad",phones:["+9647818345660"],emails:["hussainalyakooby86@gmail.com"],trusted:false,...o});
const V=(c,text,host="alrukn-golden.com.iq",title="شركة الركن الذهبي")=>DD.verifyDatasetSite({target_market:"ARAB",dataset_claims:c},{title,text:"شركة الركن الذهبي للذهب والمجوهرات "+text,host,url:"https://"+host+"/"},"2026-11-01T02:00:00.000Z");
{const a=V(claims(),"للتواصل: 0781 834 5660").patch.dataset_verification,r=V(claims(),"للتواصل: 0781 834 5660");
 ok("U1 legitimate trading-name difference + dataset phone published on the own site → identity_link phone_match, claims trusted, website name kept, provenance (matched_phone, link_checked_at)",
   a.result==="verified_site"&&a.name_consistent===false&&a.identity_link==="phone_match"&&a.dataset_claims_trusted===true&&a.matched_phone==="+9647818345660"&&!!a.link_checked_at&&a.evidence_url==="https://alrukn-golden.com.iq/"&&r.name==="شركة الركن الذهبي",a);
 ok("U1b the dataset city is used only through the confirmed link (city_source dataset_confirmed_by_phone)",r.patch.city==="بغداد"&&a.city_source==="dataset_confirmed_by_phone",{city:r.patch.city,src:a.city_source});
 const fmts=["+964 781 834 5660","009647818345660","٠٧٨١٨٣٤٥٦٦٠","(0781) 834-5660","+٩٦٤٧٨١٨٣٤٥٦٦٠"];
 ok("U2 Persian/Arabic-Indic digits and international/national formats all normalize to the same number",fmts.every(f=>V(claims(),"هاتف "+f).patch.dataset_verification.identity_link==="phone_match"),fmts.map(f=>[f,V(claims(),"هاتف "+f).patch.dataset_verification.phone_link_refused||"ok"]));
 const conf=V(claims({emails:["zeniraq@zendiamond.com"]}),"هاتف 07818345660").patch.dataset_verification;
 ok("U3 mixed-up record (a non-webmail dataset e-mail on ANOTHER domain) → no link even with a phone match (dataset_email_on_other_domain)",conf.identity_link===null&&conf.dataset_claims_trusted===false&&conf.phone_link_refused==="dataset_email_on_other_domain",conf);
 const own=V(claims({emails:["info@alrukn-golden.com.iq"]}),"هاتف 07818345660").patch.dataset_verification;
 ok("U3b an e-mail on the site's own domain is not a contradiction",own.identity_link==="phone_match");
 const nos=V(claims(),"هاتف 07801112233").patch.dataset_verification;
 ok("U4 the dataset phone is not on the site (another number) → no link (dataset_phone_not_on_site); cross-domain matches are impossible by construction",nos.identity_link===null&&nos.phone_link_refused==="dataset_phone_not_on_site");
 const cc=V(claims({city:"Basra"}),"فرعنا في بغداد هاتف 07818345660").patch.dataset_verification;
 ok("U5 contradictory city (dataset Basra, page names Baghdad) → no link (city_conflict)",cc.identity_link===null&&cc.phone_link_refused==="city_conflict",cc);
 const bad=V(claims({phones:["+98 21 8877 6655","07818"]}),"هاتف 07818345660 +982188776655").patch.dataset_verification;
 ok("U6 no valid own-market dataset phone (an Iranian number in an Iraq record, a fragment) → no link (no_valid_dataset_phone)",bad.identity_link===null&&bad.phone_link_refused==="no_valid_dataset_phone",bad);
 const emb=V(claims(),"رقم الفاتورة 9997818345660123").patch.dataset_verification;
 ok("U7 the digits buried inside a longer number do not count as a published phone",emb.identity_link===null,emb);
 const nm=V(claims({name:"شركة الركن الذهبي للمجوهرات"}),"هاتف 07818345660").patch.dataset_verification;
 ok("U8 a name match keeps working as before (identity_link name_match)",nm.name_consistent===true&&nm.identity_link==="name_match");}

// ---- L: ladder
{const base={provider:"dataset",url:"https://alrukn-golden.com.iq/",evidence:"شركة الركن الذهبي للذهب والمجوهرات بغداد",target_market:"ARAB",city:"بغداد",type:"gold_ar",
   qualification:{local_domain:true,local_phone:true,buyer_in_title:true}};
 const pc=[{contact_type:"phone",evidence_status:"page_extracted",evidence_url:"https://alrukn-golden.com.iq/"}];
 const linked=LQ.leadQualification({name:"شركة الركن الذهبي",stage:"discovered"},{...base,dataset_verification:{result:"verified_site",name_consistent:false,identity_link:"phone_match"}},pc,{});
 const unl=LQ.leadQualification({name:"شركة الركن الذهبي",stage:"discovered"},{...base,dataset_verification:{result:"verified_site",name_consistent:false,identity_link:null}},pc,{});
 ok("L1 phone link + own-site contact + local signals + city → IDENTITY_VERIFIED, CONTACT_VERIFIED, SALES_READY (next step needs owner approval before any send)",
   linked.identity.status==="IDENTITY_VERIFIED"&&linked.contact.status==="CONTACT_VERIFIED"&&linked.state==="SALES_READY"&&linked.next_action.authorization==="owner_approval_before_send",{s:linked.state,i:linked.identity,c:linked.contact.status,n:linked.next_action});
 ok("L2 the same lead WITHOUT the link stays INDEPENDENT_IDENTITY_FOUND (unchanged rule)",unl.identity.status==="INDEPENDENT_IDENTITY_FOUND"&&unl.state!=="SALES_READY");
 const noc=LQ.leadQualification({name:"x",stage:"discovered"},{...base,dataset_verification:{result:"verified_site",identity_link:"phone_match"}},[],{});
 ok("L3 never promoted from a dataset contact alone: with the link but no contact published on the site → not SALES_READY, contact NONE",noc.state!=="SALES_READY"&&noc.contact.status==="NONE",{s:noc.state,c:noc.contact.status});
 const q=LQ.leadQualification({name:"x",stage:"replied"},{...base,dataset_verification:{identity_link:"phone_match"}},pc,{replied:true,quote_requested:true});
 ok("L4 financial gate unchanged: a quote request still escalates to the owner",q.next_action.action==="ESCALATE_FINANCIAL_DECISION"&&q.next_action.authorization==="owner_decision");}

// ---- C / R: real cron
const W=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on"}});const {q,dbrun}=W;
const inner=globalThis.fetch,fetched=[];
const page=(t,b)=>new Response(`<html><head><title>${t}</title></head><body>${b}</body></html>`,{status:200,headers:{"Content-Type":"text/html"}});
const SITES={"https://alrukn-ds.com.iq/":()=>page("شركة الركن الذهبي","شركة الركن الذهبي للذهب والمجوهرات — اتصل بنا 0781 834 5660 <a href=\"mailto:info@alrukn-ds.com.iq\">info@alrukn-ds.com.iq</a>"),
  "https://shared-ds.iq/":()=>page("شركة النجمة الذهبية","شركة النجمة الذهبية للذهب والمجوهرات هاتف 0770 999 8877 <a href=\"mailto:a@shared-ds.iq\">a@shared-ds.iq</a>"),
  "https://rukn2-ds.com.iq/":()=>page("شركة الركن الثاني","شركة الركن الثاني للذهب والمجوهرات — هاتف 0781 222 3344"),
  "https://normal-ds.iq/":()=>page("مجوهرات الفرات","مجوهرات الفرات في بغداد")};
globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);if(s.startsWith("https://w.test/"))return W.run(new Request(s,o));
  if(/places\.googleapis|api\.openai|api\.anthropic|brave/.test(s))throw new Error("paid call attempted");
  if(/\/robots\.txt$/.test(s))return new Response("",{status:404});if(SITES[s]){fetched.push(s);return SITES[s]();}
  if(/^https:\/\/[a-z0-9.-]+\//.test(s)&&!/w\.test/.test(s)){fetched.push(s);return new Response("",{status:404});}
  return inner(u,o);};
const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;
const ENV={...W.env,DATASET_DISCOVERY:"on",DISCOVERY_BUCKET:{get:async()=>null,head:async()=>null},DATASET_DISCOVERY_VERIFY_PER_RUN:"6",DATASET_DISCOVERY_IRAN_PER_RUN:"0",DATASET_DISCOVERY_IRAN_DAILY_CAP:"0"};
const tick=async()=>{const p=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},ENV,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);};
const t=new Date().toISOString();
const lead=(id,url,o={},stage="discovered")=>dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",[id,id,url,stage,"low",
  JSON.stringify({provider:"dataset",source:"overture_places",url,website:url,target_market:"ARAB",type:"gold_ar",dataset_record:{dataset:"overture",record_id:id,release:"2026-11-01.2",license:"CDLA-Permissive-2.0"},dataset_claims:claims({phones:["+96477"+String(8e7+[...id].reduce((h,c)=>(h*31+c.charCodeAt(0))%1e7,7)).slice(-8)]}),...o}),t,t]);
const M=id=>JSON.parse(q("SELECT notes FROM leads WHERE id=?",[id])[0].notes);
lead("c-rukn","https://alrukn-ds.com.iq/",{dataset_claims:claims()});
lead("c-shared","https://shared-ds.iq/",{dataset_claims:claims({name:"مجوهرات الحاج",phones:["+9647709998877"]})});
dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",["other","Other shop","","discovered","low",JSON.stringify({source:"telegram_inbound"}),t,t]);
dbrun("INSERT INTO lead_contacts(id,lead_id,contact_type,raw_value,normalized_value,source,evidence_status,created_at,updated_at) VALUES('oc1','other','phone','07709998877','+9647709998877','telegram','owner_confirmed',?,?)",[t,t]);
// P2 fixtures: legacy dataset links, a customer-stage dataset lead with a link, a non-dataset lead with a link, and a normal pending lead
lead("r-deep","https://deeplink.qi.iq/3488020275848554/seller/5363");lead("r-fb","http://fb.me/goldalsarmd");lead("r-bio","http://bio.link/laperle");
lead("r-cust","https://wsend.co/9647838036670",{},"customer");
dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",["r-ads","Ads lead","https://bio.link/x","discovered","low",JSON.stringify({source:"ad_autopilot",url:"https://bio.link/x",target_market:"ARAB"}),t,t]);
lead("r-normal","https://normal-ds.iq/");
for(let i=0;i<12;i++)lead("r-bulk"+i,"https://unit.link/shop"+i);
const before={cust:M("r-cust"),ads:q("SELECT notes FROM leads WHERE id='r-ads'")[0].notes,other:q("SELECT notes FROM leads WHERE id='other'")[0].notes};
await tick();
{const mr=M("c-rukn"),cs=q("SELECT * FROM lead_contacts WHERE lead_id='c-rukn'"),p=LQ.leadQualification({name:q("SELECT name FROM leads WHERE id='c-rukn'")[0].name,stage:"discovered"},mr,cs,{});
 ok("C1 through the real cron: the alrukn-like site is linked by phone, its published phone and e-mail are stored as own-site contacts, and the lead reaches SALES_READY",
   mr.dataset_verification.identity_link==="phone_match"&&cs.some(c=>c.contact_type==="phone"&&c.normalized_value==="+9647818345660"&&c.evidence_status==="page_extracted")&&p.state==="SALES_READY",{dv:mr.dataset_verification,state:p.state,ident:p.identity.status});
 const ms=M("c-shared"),ps=LQ.leadQualification({name:"x",stage:"discovered"},ms,q("SELECT * FROM lead_contacts WHERE lead_id='c-shared'"),{});
 ok("C2 phone reuse: the matched number already belongs to ANOTHER lead → link refused (phone_shared_with_other_lead), identity stays unconfirmed",
   ms.dataset_verification.identity_link===null&&ms.dataset_verification.phone_link_refused==="phone_shared_with_other_lead"&&ms.dataset_verification.dataset_claims_trusted===false&&ps.state!=="SALES_READY",ms.dataset_verification);}
{const retired=["r-deep","r-fb","r-bio"].map(M);
 ok("R1 legacy dataset leads on a deep link / fb.me / bio.link → rejected no_own_website (rule recorded), never fetched, rows kept",
   retired.every(m=>m.rejected_reason==="no_own_website"&&m.dataset_verification?.rule==="not_an_own_website_link"&&!!m.dataset_verification?.checked_at)&&!fetched.some(u=>/deeplink|fb\.me|bio\.link|unit\.link|wsend/.test(u))&&q("SELECT COUNT(*) n FROM leads WHERE id IN ('r-deep','r-fb','r-bio')")[0].n===3,retired.map(m=>m.rejected_reason));
 ok("R2 out of scope, untouched byte-for-byte: a customer-stage dataset lead, a non-dataset (Ads) lead with a link, and a Telegram lead",
   JSON.stringify(M("r-cust"))===JSON.stringify(before.cust)&&q("SELECT notes FROM leads WHERE id='r-ads'")[0].notes===before.ads&&q("SELECT notes FROM leads WHERE id='other'")[0].notes===before.other);
 const bulk=()=>Array.from({length:12},(_,i)=>M("r-bulk"+i)).filter(m=>m.rejected_reason==="no_own_website").length;
 ok("R3 bounded: at most 10 retirements per run (3 named + 7 of the 12 bulk ones in the first run)",bulk()===7,bulk());
 await tick();
 ok("R4 the next run finishes the remaining ones (12 of 12)",bulk()===12,bulk());
 const snap=JSON.stringify(q("SELECT id,notes FROM leads WHERE id LIKE 'r-%' ORDER BY id"));await tick();
 ok("R5 idempotent: a further run changes nothing",JSON.stringify(q("SELECT id,notes FROM leads WHERE id LIKE 'r-%' ORDER BY id"))===snap);
 const pr=LQ.leadQualification({name:"x",stage:"discovered"},M("r-deep"),[],{});
 ok("R6 the ladder shows the retired lead as REJECTED (reason no_own_website); a normal pending lead was checked as usual",pr.state==="REJECTED"&&pr.rejection_reason==="no_own_website"&&fetched.includes("https://normal-ds.iq/"),{s:pr.state,r:pr.rejection_reason});}
// ---- X: one-time re-verification of dataset leads verified BEFORE the phone-link rule (Production's alrukn lead)
{const pre={checked_at:t,final_host:"alrukn-ds.com.iq",evidence_url:"https://alrukn-ds.com.iq/",identity_basis:"own_website_page",result:"verified_site",name_consistent:false,matched_tokens:[],dataset_claims_trusted:false,city_source:null};
 lead("x-pre","https://rukn2-ds.com.iq/",{dataset_claims:claims({phones:["+9647812223344"]}),dataset_verification:{...pre,final_host:"rukn2-ds.com.iq",evidence_url:"https://rukn2-ds.com.iq/"},contact_enrichment_checked_at:t,contact_enrichment_result:"checked:3",evidence:"شركة الركن الذهبي"});
 dbrun("INSERT INTO lead_contacts(id,lead_id,contact_type,raw_value,normalized_value,source,evidence_status,evidence_url,created_at,updated_at) VALUES('xc1','x-pre','instagram','jewelerysh','jewelerysh','own_site_enrichment','page_extracted','https://rukn2-ds.com.iq/',?,?)",[t,t]);
 lead("x-down","https://down-ds.iq/",{dataset_verification:{...pre,final_host:"down-ds.iq",evidence_url:"https://down-ds.iq/"},contact_enrichment_checked_at:t,evidence:"x"});
 fetched.length=0;await tick();
 const mx=M("x-pre"),px=LQ.leadQualification({name:"x",stage:"discovered"},mx,q("SELECT * FROM lead_contacts WHERE lead_id='x-pre'"),{});
 ok("X1 a lead verified before the rule (name unconfirmed, contacts on file, checked minutes ago) gets ONE re-check: phone link applied → SALES_READY",
   fetched.filter(u=>u==="https://rukn2-ds.com.iq/").length>=1&&mx.dataset_verification.identity_link==="phone_match"&&px.state==="SALES_READY",{dv:mx.dataset_verification,s:px.state});
 const md=M("x-down");
 ok("X2 a failed re-check is closed (identity_link null, recheck_fetch_failed) and NOT counted as a failure (no rejection of a verified lead)",
   md.dataset_verification.identity_link===null&&md.dataset_verification.phone_link_refused==="recheck_fetch_failed"&&!md.dataset_fetch_failures&&!md.rejected_reason,md.dataset_verification);
 fetched.length=0;await tick();
 ok("X3 never re-checked again afterwards (both leads have an identity_link field now)",!fetched.some(u=>/rukn2-ds|down-ds/.test(u)),fetched);}
ok("G1 nothing sent, no outreach row, no paid call",!q("SELECT 1 FROM lead_outreach").length&&!W.tg.some(x=>/^send/.test(x.method)));
process.exit(done()?1:0);
