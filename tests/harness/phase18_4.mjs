// PHASE 18.4 — open-dataset discovery engine (Overture IRAN+IRAQ, OSM IRAN only). Offline only: synthetic businesses, every website,
// the candidate store (R2-compatible) and all providers are in-process mocks; nothing leaves the process, nothing is sent or deployed.
//  U*: pure rules (dataset-discovery.js, candidates.mjs)   E*: the real Worker cron (ingest → own-site check → Phase 18.1 ladder)
import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase18_4");
const started=Date.now();
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const DD=await import(pathToFileURL(path.join(SRC,"dataset-discovery.js")).href);
const LQ=await import(pathToFileURL(path.join(SRC,"lead-qualification.js")).href);
const NC=await import(pathToFileURL(path.join(REPO,"scripts/discovery/candidates.mjs")).href);
const cand=(o)=>({market:"IRAN",dataset:"overture",record_id:"ov-"+Math.random().toString(36).slice(2,8),license:"CDLA-Permissive-2.0",source_datasets:["meta"],name:"x",city:null,websites:[],...o});

// ---- U1: candidate validation (sources per market, Google isolation, own website, wrong market, license)
{const V=c=>DD.validateCandidate(cand(c));
 ok("U1a Iran Overture and Iran OSM accepted; Iraq Overture accepted",V({websites:["https://a.ir/"]}).ok&&V({dataset:"osm",license:"ODbL-1.0",websites:["https://b.ir/"]}).ok&&V({market:"ARAB",websites:["https://c.iq/"]}).ok);
 ok("U1b Iraq OSM refused (source_disabled_for_market); unknown dataset/market refused",V({market:"ARAB",dataset:"osm",license:"ODbL-1.0",websites:["https://d.iq/"]}).reason==="source_disabled_for_market"&&V({dataset:"brave",websites:["https://e.ir/"]}).reason==="unknown_dataset"&&V({market:"UAE",websites:["https://f.ae/"]}).reason==="market_not_allowed");
 ok("U1c Google isolation: place_id, Google provider/dataset or any Google URL → google_origin",["place_id","provider","source_datasets","websites"].every(k=>V(k==="place_id"?{place_id:"ChIJx",websites:["https://g.ir/"]}:k==="provider"?{provider:"google_places",websites:["https://g.ir/"]}:k==="source_datasets"?{source_datasets:["google"],websites:["https://g.ir/"]}:{websites:["https://g.page/shop"]}).reason==="google_origin"));
 ok("U1d social/directory-only website → no_own_website; .ir site in an Iraq record → wrong_market_domain; missing license refused",V({websites:["https://instagram.com/shop"]}).reason==="no_own_website"&&V({market:"ARAB",websites:["https://h.ir/"]}).reason==="wrong_market_domain"&&V({license:"",websites:["https://i.ir/"]}).reason==="missing_or_unknown_license");}

// ---- U2: business-name consistency (pilot cases)
{const C=(n,t,h,x="")=>DD.nameConsistency(n,{title:t,host:h,text:x}).consistent;
 ok("U2a consistent: Latin name in host (Manda Gold → mandagold.ir), Arabic name in title (مجوهرات طيبة → شركة بريق طيبة)",C("Manda Gold Jewellery","صفحه اصلی - ماندا گلد","mandagold.ir")&&C("مجوهرات طيبة","شركة بريق طيبة للذهب والمجوهرات","bareeq-taiba.com.iq"));
 ok("U2b the three pilot mismatches are detected (city names and trade words never count as a match)",!C("Dorrise Shiraz Gold and Jewelry","گنجینه طلای شاران - Sharan Gold","sharangold.com")&&!C("مجوهرات سيد حسين","شركة الركن الذهبي – استيراد المصوغات","alrukn-golden.com.iq")&&!C("صياغة ومجوهرات العبيدي","شركة عماد سالم ابراهيم","emadsalem.com.iq"));
 ok("U2c a name made only of generic words is NOT treated as confirmed",!C("طلا و جواهر","گالری طلا و جواهر","x.ir"));
 ok("U2d city resolution restricted to the market (Tehran/Tehrān/شهر تهران → تهران; Baghdad never an IRAN city)",DD.resolveMarketCity("Tehran","IRAN")==="تهران"&&DD.resolveMarketCity("Tehrān","IRAN")==="تهران"&&DD.resolveMarketCity("شهر تهران","IRAN")==="تهران"&&DD.resolveMarketCity("Baghdad","IRAN")===null&&DD.resolveMarketCity("بغداد","ARAB")==="بغداد");}

// ---- U3: website verification decisions
{const meta=(o={})=>({target_market:"IRAN",dataset_claims:{name:"طلافروشی زرین",city:"Tehran",phones:["+982100000000"]},...o});
 const ok1=DD.verifyDatasetSite(meta(),{title:"طلافروشی زرین",text:"طلافروشی زرین در تهران، فروش عمده. 021-88776655",host:"zarin.ir"});
 ok("U3a name confirmed → dataset name + city trusted (city_source dataset_confirmed_by_name), local signals from the page",!ok1.rejected_reason&&ok1.name==="طلافروشی زرین"&&ok1.patch.city==="تهران"&&ok1.patch.dataset_verification.dataset_claims_trusted===true&&ok1.patch.dataset_verification.city_source==="dataset_confirmed_by_name"&&ok1.patch.qualification.local_domain===true,ok1);
 const mm=DD.verifyDatasetSite(meta({dataset_claims:{name:"Dorrise Shiraz Gold",city:"Shiraz"}}),{title:"گنجینه طلای شاران - Sharan Gold",text:"طلا و جواهر",host:"sharan.com"});
 ok("U3b name contradicted → website name kept, dataset city NOT used (none on the page → null), claims untrusted",!mm.rejected_reason&&/شاران/.test(mm.name)&&mm.patch.city===null&&mm.patch.dataset_verification.dataset_claims_trusted===false,mm);
 const mc=DD.verifyDatasetSite(meta({dataset_claims:{name:"Dorrise Shiraz Gold",city:"Shiraz"}}),{title:"گنجینه طلای شاران",text:"گالری طلا در مشهد",host:"sharan.com"});
 ok("U3c name contradicted but the website names its own city → city from the website (city_source website)",mc.patch.city==="مشهد"&&mc.patch.dataset_verification.city_source==="website");
 ok("U3d information-only, unrelated and wrong-market websites are rejected",DD.verifyDatasetSite(meta(),{title:"قیمت طلا امروز",text:"نرخ طلا و سکه",host:"r.com"}).rejected_reason==="information_site"
  &&DD.verifyDatasetSite(meta(),{title:"نمایشگاه خودرو",text:"فروش خودرو",host:"c.ir"}).rejected_reason==="unrelated_website"
  &&DD.verifyDatasetSite(meta({target_market:"ARAB",dataset_claims:{name:"مجوهرات"}}),{title:"مجوهرات النور",text:"ذهب هاتف +98 21 2222 3333",host:"w.com"}).rejected_reason==="wrong_market");}

// ---- U4: local extractor normalizer (same validation as the Worker; licensing metadata)
{const doc=NC.normalizeCandidates({overture:[{id:"o1",name:"گالری الف",country:"IR",locality:"Tehran",websites:["https://alef.ir"],src:["meta"]},{id:"o2",name:"شركة",country:"IQ",websites:["https://g.page/x"],src:["meta"]},
   {id:"o3",name:"مجوهرات",country:"IQ",websites:["https://jw.iq/"],src:["Foursquare"]},{id:"o4",name:"closed",country:"IR",websites:["https://cl.ir"],operating_status:"permanently_closed",src:["meta"]},{id:"o5",name:"dup",country:"IR",websites:["https://www.alef.ir/x"],src:["meta"]}],
   osm:{IRAN:[{kind:"node",id:1,tags:[{key:"name",value:"زرگری ب"},{key:"website",value:"be.ir"},{key:"shop",value:"jewelry"}]}],ARAB:[{kind:"node",id:2,tags:{name:"x",website:"https://q.iq"}}]}},{release:"2026-10-21.0",generatedAt:"2026-10-31T00:00:00.000Z"});
 ok("U4a file schema, release, attribution (Overture + © OpenStreetMap) and per-record license (Meta CDLA, Foursquare Apache, OSM ODbL)",doc.schema===DD.DISCOVERY_SCHEMA&&doc.release==="2026-10-21.0"&&/OpenStreetMap/.test(doc.attribution.en)&&/Overture/.test(doc.attribution.en)
  &&doc.candidates.find(c=>c.record_id==="o1")?.license==="CDLA-Permissive-2.0"&&doc.candidates.find(c=>c.record_id==="o3")?.license==="Apache-2.0"&&doc.candidates.find(c=>c.dataset==="osm")?.license==="ODbL-1.0",doc.candidates);
 ok("U4b dropped: Google URL, closed place, duplicate host (www/path), Iraq OSM; kept 3 (Iran Overture, Iraq Overture, Iran OSM)",doc.counts.kept===3&&doc.counts.dropped.google_origin===1&&doc.counts.dropped.closed===1&&doc.counts.dropped.duplicate_host===1&&doc.counts.dropped.source_disabled_for_market===1,doc.counts);
 const re=DD.validateCandidateFile(doc);ok("U4c the Worker accepts every record the extractor kept",re.ok&&re.candidates.length===3&&!Object.keys(re.rejected).length,re);}

// ---- U5: settings — off by default, bounded limits
{const s0=DD.discoverySettings({}),s1=DD.discoverySettings({DATASET_DISCOVERY:"on"}),s2=DD.discoverySettings({DATASET_DISCOVERY:"on",DISCOVERY_BUCKET:{},DATASET_DISCOVERY_IRAN_PER_RUN:"999",DATASET_DISCOVERY_ARAB_DAILY_CAP:"-5",DATASET_DISCOVERY_VERIFY_PER_RUN:"100"});
 ok("U5 disabled without the flag AND without a bound store; limits clamped (per run ≤20, daily ≥0, verify ≤6); defaults 3/run, 40/day, 2 checks/run",!s0.enabled&&!s1.enabled&&s2.enabled&&s2.ingest_per_run.IRAN===20&&s2.daily_cap.ARAB===0&&s2.verify_per_run===6&&s0.ingest_per_run.ARAB===3&&s0.daily_cap.IRAN===40&&s0.verify_per_run===2);}

// ---- Q1-Q3 (QA): an unconfirmed dataset name is never a verified identity, whatever the website shows
{const own=(nc,o={})=>({provider:"dataset",url:"https://site.ir/",evidence:"طلا و جواهر در تهران",target_market:"IRAN",city:"تهران",qualification:{local_domain:true,local_phone:true},
   dataset_verification:{result:"verified_site",name_consistent:nc},...o});
 const ct=[{contact_type:"email",evidence_status:"page_extracted",evidence_url:"https://site.ir/contact"}];
 const un=LQ.leadQualification({name:"گنجینه طلای شاران",stage:"discovered"},own(false),ct),cf=LQ.leadQualification({name:"طلافروشی زرین",stage:"discovered"},own(true),ct);
 ok("Q1 name NOT confirmed + local domain + local phone + own-domain contact + website city → still INDEPENDENT_IDENTITY_FOUND (not verified, not SALES_READY), contact not verified, autonomous AWAIT_INDEPENDENT_EVIDENCE",
  un.identity.status==="INDEPENDENT_IDENTITY_FOUND"&&un.state!=="SALES_READY"&&un.contact.status!=="CONTACT_VERIFIED"&&un.evidence.includes("dataset_name_unconfirmed")&&un.missing.includes("dataset_name_confirmation")
  &&un.next_action.action==="AWAIT_INDEPENDENT_EVIDENCE"&&un.next_action.autonomous===true&&un.next_action.authorization==="not_required",{s:un.state,i:un.identity,na:un.next_action});
 ok("Q1b the same evidence WITH a confirmed name → SALES_READY (the rule only blocks unconfirmed names)",cf.state==="SALES_READY");
 const nv=LQ.leadQualification({name:"x",stage:"discovered"},own(undefined),ct);
 ok("Q2 no recorded name check at all (missing dataset_verification flag) → treated as unconfirmed",nv.identity.status!=="IDENTITY_VERIFIED"&&nv.state!=="SALES_READY");
 const ow=LQ.leadQualification({name:"x",stage:"discovered"},own(false,{identity_verified:true,identity_source:"owner"}),[{contact_type:"phone",evidence_status:"owner_confirmed"}]);
 ok("Q3 an owner-confirmed identity (optional, never queued) can still verify such a lead",ow.identity.status==="IDENTITY_VERIFIED");
 ok("Q3b a name without any distinctive token (e.g. 'H&Y Jewellery') is never confirmed",!DD.nameConsistency("H&Y Jewellery",{title:"Home - H&Y Jewellery, Erbil, Iraq",host:"hy.jewelry"}).consistent);}

// ---- E: the real Worker
const page=(title,body)=>new Response(`<html><head><title>${title}</title></head><body>${body}</body></html>`,{status:200,headers:{"Content-Type":"text/html"}});
const SITES={
  "https://zarin-ds.ir/":()=>page("طلافروشی زرین","طلافروشی و زرگری در تهران، فروش عمده و کالکشن. <a href=\"mailto:sales@zarin-ds.ir\">sales@zarin-ds.ir</a> تلفن 021-88776655"),
  "https://sharan-ds.com/":()=>page("گنجینه طلای شاران - Sharan Gold","گالری طلا و جواهر <a href=\"mailto:info@sharan-ds.com\">info@sharan-ds.com</a> 021-55443322"),
  "https://mahan-osm.ir/":()=>page("طلاجات ماهان","طلا و جواهر ماهان در مشهد <a href=\"mailto:hi@mahan-osm.ir\">hi@mahan-osm.ir</a>"),
  "https://dhahab-ds.iq/":()=>page("مجوهرات الذهب الأحمر","محل ذهب ومجوهرات في بغداد بالجملة <a href=\"mailto:info@dhahab-ds.iq\">info@dhahab-ds.iq</a> 07701234567"),
  "https://gohar-ds.ir/":()=>page("گالری گوهربین","جواهرات گوهربین تهران <a href=\"tel:+982122223333\">تماس</a> <a href=\"mailto:a@gohar-ds.ir\">a@gohar-ds.ir</a>"),
  "https://gohar-ds.com/":()=>page("Goharbin Jewelry گوهربین","جواهرات گوهربین تهران <a href=\"tel:+982122223333\">call</a> <a href=\"mailto:b@gohar-ds.com\">b@gohar-ds.com</a>"),
  "https://goldrate-ds.com/":()=>page("قیمت طلا امروز","نرخ لحظه ای طلا و سکه"),
  "https://cars-ds.ir/":()=>page("نمایشگاه خودرو","فروش خودرو و لوازم یدکی"),
  "https://wrong-ds.com/":()=>page("مجوهرات النور","ذهب ومجوهرات هاتف +98 21 2222 3333"),
  "https://nocontact-ds.ir/":()=>page("زرگری بی‌تماس","زرگری در تهران"),
  // QA: a mismatched site that shows its own city, local phone and own-domain email (was promotable before the QA fix)
  "https://sharan2-ds.ir/":()=>page("گالری طلای نگار","گالری طلا و جواهر در مشهد 051-33445566 <a href=\"mailto:info@sharan2-ds.ir\">info@sharan2-ds.ir</a>"),
  // QA robots path rules: the start path is disallowed / the contact page is disallowed
  "https://robopath-ds.ir/fa/":()=>page("طلافروشی روبو","طلافروشی روبو در تهران <a href=\"mailto:a@robopath-ds.ir\">a@robopath-ds.ir</a>"),
  "https://robocontact-ds.ir/":()=>page("طلافروشی کنتکت","طلافروشی کنتکت در تهران <a href=\"/contact\">تماس</a>"),
  "https://robocontact-ds.ir/contact":()=>page("تماس","<a href=\"mailto:x@robocontact-ds.ir\">x@robocontact-ds.ir</a>")};
const ROBOTS={"https://robopath-ds.ir/robots.txt":"User-agent: *\nDisallow: /fa/\n","https://robocontact-ds.ir/robots.txt":"User-agent: *\nDisallow: /contact\nAllow: /\n"};
const fetched=[],paid=[];let inner=null;
const mockFetch=async(u,o={})=>{const s=String(u?.url||u);
  if(s.startsWith("https://w.test/"))return W.run(new Request(s,o));
  if(/places\.googleapis\.com|api\.openai\.com|api\.anthropic\.com|search\.brave\.com|api\.search\.brave/.test(s)){paid.push(s);return new Response("{}",{status:500});}
  if(/^https:\/\/dead-ds\.ir/.test(s)){fetched.push(s);throw new TypeError("fetch failed");}
  if(ROBOTS[s])return new Response(ROBOTS[s],{status:200});
  if(/\/robots\.txt$/.test(s))return new Response("",{status:404});
  const k=Object.keys(SITES).find(k=>s===k);if(k){fetched.push(s);return SITES[k]();}
  if(Object.keys(SITES).some(k=>s.startsWith(k)))return new Response("",{status:404});
  if(/^https:\/\/www\.(google|bing)\.com\/search/.test(s))return new Response("<html></html>",{status:200,headers:{"Content-Type":"text/html"}});
  return inner(u,o);};
const FILE={schema:DD.DISCOVERY_SCHEMA,release:"2026-10-21.0",candidates:[
  cand({record_id:"ov-zarin",name:"طلافروشی زرین",city:"Tehran",websites:["https://zarin-ds.ir/"],phones:["+982188776655"]}),
  cand({record_id:"ov-sharan",name:"Dorrise Shiraz Gold and Jewelry",city:"Shiraz",websites:["https://sharan-ds.com/"],phones:["+987100000000"]}),
  cand({record_id:"node/77",dataset:"osm",license:"ODbL-1.0",source_datasets:["OpenStreetMap"],name:"طلاجات ماهان",city:"Mashhad",websites:["https://mahan-osm.ir/"]}),
  cand({record_id:"ov-gohar-ir",name:"گالری گوهربین",city:"Tehran",websites:["https://gohar-ds.ir/"]}),
  cand({record_id:"ov-gohar-com",name:"Goharbin",city:"Tehran",websites:["https://gohar-ds.com/"]}),
  cand({record_id:"ov-dead",name:"طلای مرده",city:"Tehran",websites:["https://dead-ds.ir/"]}),
  cand({record_id:"ov-rate",name:"طلای نرخ",city:"Tehran",websites:["https://goldrate-ds.com/"]}),
  cand({record_id:"ov-cars",name:"زرگری خودرو",city:"Tehran",websites:["https://cars-ds.ir/"]}),
  cand({record_id:"ov-nocontact",name:"زرگری بی‌تماس",city:"Tehran",websites:["https://nocontact-ds.ir/"],phones:["+982100000000"],emails:["claim@nocontact-ds.ir"]}),
  cand({record_id:"ov-legacy",name:"legacy",city:"Tehran",websites:["https://legacy-ds.ir/"]}),
  cand({record_id:"ov-sharan2",name:"Dorrise Mashhad Gold",city:"Mashhad",websites:["https://sharan2-ds.ir/"]}),
  cand({record_id:"ov-robopath",name:"طلافروشی روبو",city:"Tehran",websites:["https://robopath-ds.ir/fa/"]}),
  cand({record_id:"ov-robocontact",name:"طلافروشی کنتکت",city:"Tehran",websites:["https://robocontact-ds.ir/"]}),
  cand({market:"ARAB",record_id:"ov-dhahab",name:"مجوهرات الذهب الأحمر",city:"Baghdad",websites:["https://dhahab-ds.iq/"]}),
  cand({market:"ARAB",record_id:"ov-wrong",name:"مجوهرات النور",city:"Baghdad",websites:["https://wrong-ds.com/"]}),
  cand({market:"ARAB",dataset:"osm",license:"ODbL-1.0",record_id:"node/88",name:"iraq osm",websites:["https://iqosm.iq/"]}),
  cand({market:"ARAB",record_id:"ov-gpage",name:"g",websites:["https://g.page/x"]}),
  cand({market:"ARAB",record_id:"ov-irdomain",name:"ir in iraq",websites:["https://wrongcc.ir/"]})]};
const bucket=(doc)=>({get:async k=>k==="discovery/candidates-latest.json"?{size:JSON.stringify(doc).length,text:async()=>JSON.stringify(doc)}:null});
const W=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on",DATASET_DISCOVERY:"on",DISCOVERY_BUCKET:bucket(FILE),DATASET_DISCOVERY_VERIFY_PER_RUN:"6"}});const {q,dbrun,call}=W;
inner=globalThis.fetch;globalThis.fetch=mockFetch; // installed after the world, so the harness recorder stays underneath (as in phase18_1)
const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;
const tick=async(w=W)=>{const p=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},w.env,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);};
const T=new Date(Date.now()-86400e3).toISOString();
// existing CRM: a Google-origin legacy lead owning legacy-ds.ir, and a Telegram customer with an order
dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",["g-legacy","Legacy Google","https://legacy-ds.ir/","discovered","low",JSON.stringify({source:"customer_discovery",provider:"google_places",place_id:"ChIJlegacy",website:"https://legacy-ds.ir/"}),T,T]);
dbrun("CREATE TABLE IF NOT EXISTS lead_identities (identity_key TEXT PRIMARY KEY, identity_type TEXT NOT NULL, normalized_value TEXT NOT NULL, lead_id TEXT NOT NULL, source TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
dbrun("INSERT INTO lead_identities VALUES('domain:legacy-ds.ir','domain','legacy-ds.ir','g-legacy','customer_discovery',?,?)",[T,T]);
dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",["tg-cust","M L","","customer","normal",JSON.stringify({source:"telegram_inbound"}),T,T]);
dbrun("INSERT INTO lead_orders(id,order_number,quote_id,lead_id,conversation_id,market,product,quantity,currency,total_minor,status,created_at,updated_at) VALUES('o1','HB-1','q1','tg-cust','c1','IRAN','box',700,'TOMAN',56210000,'paid',?,?)",[T,T]);
const snapExisting=()=>JSON.stringify(q("SELECT id,name,stage,notes FROM leads WHERE id IN ('g-legacy','tg-cust') ORDER BY id"));const before=snapExisting();
const cnt=t=>{try{return q(`SELECT COUNT(*) n FROM ${t}`)[0].n;}catch{return 0;}};const appr0=[cnt("approval_queue"),cnt("agent_approvals"),cnt("owner_escalations")];
const ds=()=>q("SELECT * FROM leads").map(r=>({...r,meta:JSON.parse(r.notes||"{}")})).filter(r=>r.meta.provider==="dataset");

await tick();
const afterOne=ds();
ok("E1 bounded ingestion: first tick creates at most 3 per market (IRAN 3, ARAB ≤3), stage 'discovered', provider dataset, no city/contacts from the dataset",afterOne.filter(l=>l.meta.target_market==="IRAN").length===3&&afterOne.filter(l=>l.meta.target_market==="ARAB").length<=3
  &&afterOne.every(l=>l.stage==="discovered"&&!q("SELECT 1 FROM lead_contacts WHERE lead_id=? AND source NOT IN ('own_site_enrichment','ad_autopilot')",[l.id]).length),afterOne.map(l=>[l.meta.target_market,l.meta.dataset_record.record_id]));
for(let i=0;i<6;i++)await tick();
const L=id=>ds().find(l=>l.meta.dataset_record.record_id===id),intel=async l=>l&&(await call("/api/leads/intelligence?id="+encodeURIComponent(l.id),null,"GET")).body?.item;
const all=ds();
ok("E2 resumable cursor per market: every eligible candidate ingested exactly once (IRAN 12 + ARAB 2), file rejects counted (Iraq OSM, Google URL, .ir in Iraq), legacy domain skipped",all.length===14&&new Set(all.map(l=>l.meta.dataset_record.record_id)).size===14
  &&q("SELECT value FROM system_kv WHERE key='dataset_discovery:cursor:2026-10-21.0:IRAN'")[0]?.value==="13"&&q("SELECT value FROM system_kv WHERE key='dataset_discovery:cursor:2026-10-21.0:ARAB'")[0]?.value==="2",all.map(l=>l.meta.dataset_record.record_id));
const [iZ,iS,iM,iQ,iG1,iG2,iN]=await Promise.all(["ov-zarin","ov-sharan","node/77","ov-dhahab","ov-gohar-ir","ov-gohar-com","ov-nocontact"].map(id=>intel(L(id))));
ok("E3 Iran Overture: name confirmed by the site → SALES_READY, market IRAN, city from the dataset (confirmed), verified own-domain contact, no owner step",iZ?.state==="SALES_READY"&&iZ.market==="IRAN"&&iZ.city==="تهران"&&iZ.contact.status==="CONTACT_VERIFIED"&&iZ.next_action.authorization==="owner_approval_before_send",iZ&&{s:iZ.state,c:iZ.city,m:iZ.market});
ok("E4 Iran OSM: SALES_READY in IRAN with ODbL license and OSM attribution in provenance",iM?.state==="SALES_READY"&&iM.provenance?.source?.license==="ODbL-1.0"&&/OpenStreetMap/.test(iM.provenance.source.attribution),iM&&{s:iM.state,src:iM.provenance?.source});
ok("E5 Iraq Overture: SALES_READY in ARAB (USD market), Overture CDLA license in provenance",iQ?.state==="SALES_READY"&&iQ.market==="ARAB"&&iQ.provenance?.source?.license==="CDLA-Permissive-2.0"&&iQ.provenance.source.claims_trusted===true,iQ&&{s:iQ.state,m:iQ.market});
const mS=L("ov-sharan");
ok("E6 name mismatch: lead renamed to the website's business, dataset city (Shiraz) NOT used, claims untrusted → identity unconfirmed, not SALES_READY, autonomous AWAIT_INDEPENDENT_EVIDENCE",/شاران/.test(mS.name)&&!mS.meta.city&&mS.meta.dataset_verification.dataset_claims_trusted===false
  &&iS.identity.status!=="IDENTITY_VERIFIED"&&iS.state!=="SALES_READY"&&iS.next_action.action==="AWAIT_INDEPENDENT_EVIDENCE"&&iS.next_action.authorization==="not_required",{n:mS.name,c:mS.meta.city,s:iS?.state,na:iS?.next_action});
{const i2=await intel(L("ov-sharan2"));
 ok("E6b QA: mismatched site WITH its own city, local phone and own-domain email is NOT promoted (website loading + website city never substitute for identity confirmation)",L("ov-sharan2").meta.city==="مشهد"&&i2?.identity.status==="INDEPENDENT_IDENTITY_FOUND"&&i2.state!=="SALES_READY"&&i2.contact.status!=="CONTACT_VERIFIED",i2&&{s:i2.state,i:i2.identity.status,c:i2.contact.status});}
ok("E6c QA robots path rules: a disallowed start path (/fa/) is never fetched; a disallowed /contact page is never fetched",!fetched.includes("https://robopath-ds.ir/fa/")&&L("ov-robopath").meta.dataset_fetch_failures===1
  &&fetched.includes("https://robocontact-ds.ir/")&&!fetched.includes("https://robocontact-ds.ir/contact")&&(await intel(L("ov-robocontact"))).contact.status==="NONE",{f:fetched.filter(u=>/robo/.test(u)),m:L("ov-robopath").meta.contact_enrichment_result});
ok("E7 duplicate business on two domains (same phone published on both own sites) → the later one REJECTED duplicate_identity",[iG1,iG2].filter(x=>x?.state==="REJECTED"&&x.rejection_reason==="duplicate_identity").length===1&&[iG1,iG2].some(x=>x?.state==="SALES_READY"),[iG1?.state,iG2?.state,iG2?.evidence]);
ok("E8 information-only, unrelated and wrong-market sites rejected automatically (REJECTED, autonomous archive)",["ov-rate","ov-cars","ov-wrong"].every(id=>{const l=L(id);return l?.meta.rejected_reason&&l.meta.provider==="dataset";})
  &&L("ov-rate").meta.rejected_reason==="information_site"&&L("ov-cars").meta.rejected_reason==="unrelated_website"&&L("ov-wrong").meta.rejected_reason==="wrong_market");
{const nid=L("ov-nocontact").id,rows=q("SELECT contact_type,normalized_value FROM lead_contacts WHERE lead_id=?",[nid]);
 ok("E9 invalid contact evidence: dataset phone/email claims are never stored as contacts (only the site URL itself); a site with no published contact stays contact NONE",iN?.contact.status==="NONE"
  &&!rows.some(r=>["phone","email","whatsapp","telegram","instagram"].includes(r.contact_type))&&!rows.some(r=>/2100000000|claim@/.test(r.normalized_value))&&L("ov-nocontact").meta.dataset_claims.phones[0]==="+982100000000"&&L("ov-nocontact").meta.dataset_claims.trusted===false,{c:iN?.contact,rows});}
const dead=L("ov-dead");
ok("E10a unreachable site: first failure counted, not yet rejected",dead.meta.dataset_fetch_failures===1&&!dead.meta.rejected_reason,dead.meta);
dbrun("UPDATE leads SET notes=json_set(notes,'$.contact_enrichment_checked_at',?) WHERE id=?",[new Date(Date.now()-15*86400e3).toISOString(),dead.id]);await tick();
ok("E10b second failure (14 days later) → REJECTED unreachable_website",L("ov-dead").meta.rejected_reason==="unreachable_website"&&(await intel(L("ov-dead"))).state==="REJECTED");
ok("E11 Google isolation + CRM intact: the Google-origin lead owning a candidate's domain and the Telegram customer are byte-for-byte unchanged; no candidate became a Google lead",snapExisting()===before&&!L("ov-legacy")&&ds().every(l=>!l.meta.place_id&&!/^google/.test(String(l.meta.provider))));
const SI=(await call("/api/sales/intelligence?limit=200",null,"GET")).body;
ok("E12 per-market funnel: IRAN SALES_READY 3 (zarin, OSM, one Goharbin) + Telegram customer kept; ARAB SALES_READY 1; currencies TOMAN/USD",SI.markets.IRAN.sales_ready===3&&SI.markets.IRAN.customers===1&&SI.markets.ARAB.sales_ready===1&&SI.markets.IRAN.currency==="TOMAN"&&SI.markets.ARAB.currency==="USD",{IR:[SI.markets.IRAN.sales_ready,SI.markets.IRAN.customers],AR:SI.markets.ARAB.sales_ready});
ok("E13 autonomous and gated: no approval/escalation/outreach row, nothing sent, no paid/AI/Brave/Places call; one audit row per ingestion tick",JSON.stringify([cnt("approval_queue"),cnt("agent_approvals"),cnt("owner_escalations")])===JSON.stringify(appr0)&&cnt("lead_outreach")===0&&!W.tg.some(x=>/^send/.test(x.method))&&!paid.length
  &&q("SELECT COUNT(*) n FROM system_events WHERE type='dataset_discovery_ingested'")[0].n>=1,{paid,o:cnt("lead_outreach")});
const nI=ds().length;await tick();
ok("E14 re-running after completion creates nothing (cursor done, domains known)",ds().length===nI);
// financial gate unchanged for a dataset lead that later asks for a price
{const f=LQ.leadQualification({name:"x",stage:"replied"},{provider:"dataset",url:"https://zarin-ds.ir/",evidence:"طلا",target_market:"IRAN",city:"تهران"},[],{replied:true,quote_requested:true});
 ok("E15 a dataset lead that requests a quote still escalates to the owner (financial decision)",f.next_action.action==="ESCALATE_FINANCIAL_DECISION"&&f.next_action.authorization==="owner_decision");}

// ---- E16-E17: disabled by default; daily cap
{const W2=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",DISCOVERY_BUCKET:bucket(FILE)}});await tick(W2);
 ok("E16 without DATASET_DISCOVERY=on nothing is read or created (even with a bound store)",!W2.q("SELECT notes FROM leads").some(r=>/"provider":"dataset"/.test(r.notes)));
 const W3=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",DATASET_DISCOVERY:"on",DISCOVERY_BUCKET:bucket(FILE),DATASET_DISCOVERY_IRAN_DAILY_CAP:"2",DATASET_DISCOVERY_ARAB_DAILY_CAP:"1"}});for(let i=0;i<4;i++)await tick(W3);
 const r3=W3.q("SELECT notes FROM leads").map(r=>JSON.parse(r.notes||"{}")).filter(m=>m.provider==="dataset");
 ok("E17 per-market daily cap respected across ticks (IRAN 2, ARAB 1)",r3.filter(m=>m.target_market==="IRAN").length===2&&r3.filter(m=>m.target_market==="ARAB").length===1,r3.map(m=>m.target_market));}
ok("E18 no request left the process except in-process mocks",!W.offNet().length,W.offNet());

console.log(`phase18_4 time ${((Date.now()-started)/1000).toFixed(1)} s`);
process.exit(done()?1:0);
