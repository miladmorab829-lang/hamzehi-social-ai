// PHASE 18.1 — autonomous, evidence-based lead qualification. Offline only: synthetic businesses, every site and provider is an
// in-process mock, nothing leaves the process, no message is sent, no paid Places/AI call is made, nothing is deployed.
//  U*: pure qualification rules (lead-qualification.js)   E*: the real Worker (cron enrichment + /api/sales/intelligence + CRM)
import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase18_1");
const started=Date.now();
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const LQ=await import(pathToFileURL(path.join(SRC,"lead-qualification.js")).href);
const Q=(name,meta,contacts=[],stage="discovered",activity={})=>LQ.leadQualification({name,stage,created_at:"2026-10-01T00:00:00.000Z"},meta,contacts,activity);
const mail=(host,extra={})=>({contact_type:"email",evidence_status:"page_extracted",evidence_url:`https://${host}/contact`,created_at:"2026-10-02T00:00:00.000Z",...extra});
const shop=(host,over={})=>({source:"ad_autopilot",url:`https://${host}/`,evidence:"طلافروشی و زرگری، فروش عمده و کالکشن برند در تهران",target_market:"IRAN",city:"تهران",type:"gold_fa",qualification:{buyer_in_title:true},...over});
const NON_FIN_OWNER=a=>a.authorization==="owner_action";

// ---- U1-U3: information sites (gold-price tickers) are excluded and never become verified identities
{const r=Q("سعر الذهب اليوم: أسعار الذهب المباشرة بالدولار",{source:"ad_autopilot",url:"https://goldoilprice.com/",evidence:"سعر الذهب اليوم مباشر",type:"gold_ar"},[mail("goldoilprice.com")],"negotiation");
 ok("U1 gold-price news site (own domain + same-domain email, old 'negotiation' stage) → REJECTED information_site, identity not verified, tier REJECTED, archived autonomously",
  r.state==="REJECTED"&&r.rejection_reason==="information_site"&&r.identity.status!=="IDENTITY_VERIFIED"&&r.tier==="REJECTED"&&r.next_action.action==="ARCHIVE_IRRELEVANT"&&r.next_action.autonomous===true,{s:r.state,rr:r.rejection_reason,i:r.identity.status,na:r.next_action});
 for(const t of ["أسعار المعادن اليوم 2026 | الذهب والفضة والنحاس مباشر","اسعار الذهب في الامارات","قیمت طلا امروز","نرخ سکه و طلا","Live gold price today"])
  if(!LQ.informationSite({name:t}))ok("U2 information title detected: "+t,false);
 ok("U2 all price/news title variants (Arabic, Persian, English) are information sites",["أسعار المعادن اليوم 2026 | الذهب والفضة والنحاس مباشر","اسعار الذهب في الامارات","قیمت طلا امروز","نرخ سکه و طلا","Live gold price today"].every(t=>LQ.informationSite({name:t})));
 ok("U2b 'المحلية' (local) inside a ticker title is not the shop word 'محل'; a real 'محل ذهب' title is still a shop",LQ.informationSite({name:"سعر الذهب اليوم: أسعار الذهب المباشرة بالدولار والعملات المحلية"})&&!LQ.informationSite({name:"محل ذهب الرافدين | أسعار الذهب"}));
 const s=Q("گالری طلای زرین | قیمت طلا امروز",shop("zarin.ir"),[mail("zarin.ir")]);
 ok("U3 a real shop whose title also shows the gold price is NOT an information site and verifies normally (SALES_READY)",!LQ.informationSite({name:"گالری طلای زرین | قیمت طلا امروز"})&&s.state==="SALES_READY",{s:s.state});
 ok("U3b enrichment candidate: shop yes, information site no",LQ.ownSiteCandidate(shop("zarin.ir"),{name:"طلافروشی زرین"})===true&&LQ.ownSiteCandidate({url:"https://goldoilprice.com/",evidence:"x"},{name:"سعر الذهب اليوم"})===false);}

// ---- U4-U5: Google-only leads stay provisional; Google content is never independent proof
{const p=Q("طلافروشی در تبریز (Google Maps) · #abc123",{source:"ad_autopilot",provider:"google_places_ids",place_id:"ChIJx",target_market:"IRAN",country:"IR",city:"تبریز",lead_status:"provisional_place"});
 ok("U4 Places ID only → PLACE_DISCOVERED, tier D, no contact, next action AWAIT_INDEPENDENT_EVIDENCE (autonomous, no owner step)",p.state==="PLACE_DISCOVERED"&&p.tier==="D"&&p.contact.status==="NONE"&&p.next_action.action==="AWAIT_INDEPENDENT_EVIDENCE"&&p.next_action.autonomous===true&&p.next_action.authorization==="not_required",p.next_action);
 const u=Q("طلافروشی در اربیل (Google Maps)",{source:"ad_autopilot",provider:"google_places_ids",place_id:"ChIJy",target_market:"ARAB",city:"أربيل"});
 ok("U4b an UNFLAGGED IDs-only row (no lead_status) is still PLACE_DISCOVERED",u.state==="PLACE_DISCOVERED"&&u.identity.status==="GOOGLE_DISCOVERED");
 const g=Q("مجوهرات ادم",{source:"customer_discovery",provider:"google_places",place_id:"ChIJz",url:"https://adam-jewel.iq/",website:"https://adam-jewel.iq/",evidence:"مجوهرات",target_market:"ARAB",city:"بغداد"},
  [{contact_type:"phone",evidence_status:"provider_supplied",evidence_url:null},mail("maps.google.com")]);
 ok("U5 legacy Google row with a Google-supplied website, provider phone and a Google-hosted 'page' email → not verified, no contact, stays provisional",g.state==="PLACE_DISCOVERED"&&g.identity.status==="GOOGLE_DISCOVERED"&&g.contact.status==="NONE",{s:g.state,i:g.identity,c:g.contact});}

// ---- U6-U7: legitimate progression and uncertain identity
{const a=Q("طلافروشی زرین",shop("zarin.ir",{discovered_at:"2026-10-01T00:00:00.000Z"}));
 ok("U6a own site, no contact yet → not SALES_READY; the next step is autonomous enrichment, never an owner action",["INDEPENDENT_IDENTITY_FOUND","IDENTITY_VERIFIED","BUSINESS_QUALIFIED"].includes(a.state)&&a.next_action.autonomous===true&&!NON_FIN_OWNER(a.next_action),{s:a.state,na:a.next_action});
 const b=Q("طلافروشی زرین",shop("zarin.ir",{discovered_at:"2026-10-01T00:00:00.000Z",contact_enrichment_checked_at:"2026-10-03T00:00:00.000Z"}),[mail("zarin.ir")]);
 ok("U6b same-domain email → IDENTITY + CONTACT verified, SALES_READY tier B, with no owner step",b.state==="SALES_READY"&&b.tier==="B"&&b.identity.status==="IDENTITY_VERIFIED"&&b.contact.status==="CONTACT_VERIFIED",{s:b.state,t:b.tier});
 ok("U6c contactability 'verified' is NOT marketing permission: outreach_authorized false, marketing_permission not_established, outreach needs owner approval",b.contact.contactability==="verified"&&b.contact.outreach_authorized===false&&b.contact.marketing_permission==="not_established"&&b.contact.outreach_requires==="owner_approval"&&b.next_action.authorization==="owner_approval_before_send",b.contact);
 ok("U6d provenance: identity source URL + timestamps, contact evidence URL + observed_at + verified flag, market source",b.provenance.identity.source_url==="https://zarin.ir/"&&b.provenance.identity.observed_at==="2026-10-01T00:00:00.000Z"&&b.provenance.identity.last_checked_at==="2026-10-03T00:00:00.000Z"
  &&b.provenance.contacts[0].evidence_url==="https://zarin.ir/contact"&&b.provenance.contacts[0].observed_at==="2026-10-02T00:00:00.000Z"&&b.provenance.contacts[0].verified===true&&b.provenance.market.source==="ads_target"&&b.identity.verified_at==="2026-10-03T00:00:00.000Z",b.provenance);
 const c=Q("زرگری نمونه",shop("zargar-sample.com",{evidence:"زرگری در تهران"}),[mail("other-domain.com")]);
 ok("U7 uncertain identity (generic domain, contact on ANOTHER domain) → not verified, not SALES_READY, next step autonomous verification",c.identity.status==="INDEPENDENT_IDENTITY_FOUND"&&c.state!=="SALES_READY"&&c.contact.status!=="CONTACT_VERIFIED"&&c.next_action.autonomous===true,{s:c.state,i:c.identity.status,c:c.contact.status,na:c.next_action});}

// ---- U8: wrong-market record
{const w=Q("مجوهرات دبي",{source:"ad_autopilot",url:"https://dubai-gold.ae/",evidence:"محل ذهب ومجوهرات",target_market:"ARAB",city:"بغداد",type:"gold_ar",qualification:{buyer_in_title:true}},[mail("dubai-gold.ae")]);
 ok("U8 a foreign-domain (.ae) site attributed only by the Iraq run → market CONFLICT (not ARAB), never BUSINESS_QUALIFIED/SALES_READY; next step autonomous (not owner)",w.market===null&&w.evidence.includes("foreign_domain")&&!["BUSINESS_QUALIFIED","SALES_READY"].includes(w.state)&&!NON_FIN_OWNER(w.next_action),{m:w.market,s:w.state,na:w.next_action});
 const o=Q("مجوهرات دبي",{source:"ad_autopilot",url:"https://dubai-gold.ae/",evidence:"x",market:"ARAB",city:"بغداد"});
 ok("U8b an owner-set market is respected even on a foreign domain",o.market==="ARAB");}

// ---- U9: duplicates
{const L=(id,url,created,stage="discovered")=>({id,stage,created_at:created,notes:JSON.stringify({url,evidence:"x"})});
 const leads=[L("d2","https://www.zarin.ir/shop","2026-10-05"),L("d1","https://zarin.ir/","2026-10-01"),L("d3","https://zarin.ir/","2026-10-06"),L("g1","https://zarin.ir/","2026-09-01"),
  {id:"g1",stage:"discovered",created_at:"2026-09-01",notes:JSON.stringify({provider:"google_places",place_id:"ChIJq",url:"https://zarin.ir/",evidence:"x"})}];
 const act=new Map([["d3",{replied:true}]]),dm=LQ.leadDuplicateMap(leads.slice(0,3).concat(leads[4]),act);
 ok("U9a duplicate map: earliest own-site lead kept (d1); later same host incl. www/path variant marked (d2→d1); engaged copy (d3) and Google rows never marked",dm.get("d2")==="d1"&&!dm.has("d1")&&!dm.has("d3")&&!dm.has("g1"),[...dm]);
 const r=Q("طلافروشی زرین",shop("zarin.ir"),[mail("zarin.ir")],"discovered",{duplicate_of:"d1"});
 ok("U9b a duplicate never counts as a second qualified business: REJECTED duplicate_identity, archived autonomously",r.state==="REJECTED"&&r.rejection_reason==="duplicate_identity"&&r.next_action.autonomous===true&&r.evidence.includes("duplicate_of:d1"),{s:r.state,rr:r.rejection_reason});}

// ---- U10: market attribution for existing Telegram customers (recorded CRM evidence only)
{const tg={source:"telegram_inbound"};
 const c=Q("M L",tg,[],"customer",{replied:true,ordered:true,order_markets:["IRAN"]});
 ok("U10a Telegram customer without a market in its notes takes the market of its own order: IRAN, market_source order_record",c.state==="CUSTOMER"&&c.market==="IRAN"&&c.market_source==="order_record"&&c.provenance.market.source==="order_record",{m:c.market,src:c.market_source});
 const n=Q("milad",tg,[],"replied",{replied:true});
 ok("U10b no order/quote → market stays unknown (nothing inferred from language or name)",n.market===null&&n.market_source===null);
 const x=Q("mixed",tg,[],"negotiation",{replied:true,order_markets:["IRAN","ARAB"]});
 ok("U10c orders in two markets → conflict, market not guessed",x.market===null&&x.evidence.includes("market_conflict"));
 const ow=Q("owner-set",{...tg,market:"ARAB"},[],"negotiation",{replied:true,order_markets:["IRAN"]});
 ok("U10d an owner-set market always wins over order evidence",ow.market==="ARAB"&&ow.market_source==="owner");}

// ---- U11-U12: financial gate kept; no non-financial owner step anywhere
{const f=Q("mil",{source:"telegram_inbound"},[],"negotiation",{replied:true,quote_requested:true,order_markets:["ARAB"]});
 ok("U11 a price/quote request still escalates to the OWNER (financial decision), never autonomous",f.next_action.action==="ESCALATE_FINANCIAL_DECISION"&&f.next_action.authorization==="owner_decision"&&f.next_action.autonomous===false,f.next_action);
 const samples=[Q("x",{}),Q("p",{provider:"google_places_ids",place_id:"P"}),Q("s",shop("a.ir")),Q("s",shop("a.ir"),[mail("a.ir")]),Q("w",{url:"https://w.ae/",evidence:"مجوهرات",target_market:"ARAB",city:"بغداد"},[mail("w.ae")]),
  Q("n",shop("b.com",{city:null}),[mail("b.com")]),Q("سعر الذهب اليوم",{url:"https://g.com/",evidence:"x"})];
 ok("U12 no next action across all non-financial states asks for a routine owner action (owner_action authorization removed)",samples.every(s=>!NON_FIN_OWNER(s.next_action)),samples.map(s=>[s.state,s.next_action.action,s.next_action.authorization]));}

// ---- E: the real Worker, offline
const W=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on"}});const {q,dbrun,call}=W;
const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;
const page=(title,body)=>new Response(`<html><head><title>${title}</title></head><body>${body}</body></html>`,{status:200,headers:{"Content-Type":"text/html"}});
const SITES={"https://zarin-e2e.ir/":()=>page("طلافروشی زرین","طلافروشی و زرگری در تهران، فروش عمده. <a href=\"mailto:sales@zarin-e2e.ir\">sales@zarin-e2e.ir</a> تلفن 02188776655"),
  "https://dhahab-e2e.iq/":()=>page("مجوهرات الذهب","محل ذهب ومجوهرات في بغداد بالجملة <a href=\"mailto:info@dhahab-e2e.iq\">info@dhahab-e2e.iq</a>"),
  "https://goldprice-e2e.com/":()=>page("سعر الذهب اليوم","سعر الذهب اليوم مباشر <a href=\"mailto:ads@goldprice-e2e.com\">ads@goldprice-e2e.com</a>")};
const fetched=[],inner=globalThis.fetch,paid=[];
globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);
  if(/places\.googleapis\.com|api\.openai\.com|api\.anthropic\.com/.test(s)){paid.push(s);return new Response("{}",{status:500});}
  if(/\/robots\.txt$/.test(s))return new Response("",{status:404});
  const k=Object.keys(SITES).find(k=>s.startsWith(k));if(k){fetched.push(s);return SITES[k]();}
  if(/^https:\/\/www\.(google|bing)\.com\/search/.test(s))return new Response("<html></html>",{status:200,headers:{"Content-Type":"text/html"}});
  return inner(u,o);};
const tick=async()=>{const p=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},W.env,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);};
const t0=new Date(Date.now()-3600e3).toISOString(),ins=(id,name,stage,meta,at=t0)=>dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",[id,name,meta.url||"",stage,"normal",JSON.stringify(meta),at,at]);
ins("e-shop","طلافروشی زرین","discovered",{source:"ad_autopilot",url:"https://zarin-e2e.ir/",evidence:"طلافروشی و زرگری در تهران، فروش عمده",target_market:"IRAN",city:"تهران",type:"gold_fa",qualification:{buyer_in_title:true}});
ins("e-iq","مجوهرات الذهب","discovered",{source:"ad_autopilot",url:"https://dhahab-e2e.iq/",evidence:"محل ذهب ومجوهرات في بغداد بالجملة",target_market:"ARAB",city:"بغداد",type:"gold_ar",qualification:{buyer_in_title:true}});
ins("e-info","سعر الذهب اليوم","negotiation",{source:"ad_autopilot",url:"https://goldprice-e2e.com/",evidence:"سعر الذهب اليوم",type:"gold_ar"},new Date().toISOString());
ins("e-dup","طلافروشی زرین (copy)","discovered",{source:"ad_autopilot",url:"https://www.zarin-e2e.ir/",evidence:"طلافروشی",target_market:"IRAN",city:"تهران",type:"gold_fa",qualification:{buyer_in_title:true}},new Date().toISOString());
ins("e-place","طلافروشی در تبریز (Google Maps) · #e2e001","discovered",{source:"ad_autopilot",provider:"google_places_ids",place_id:"ChIJe2e001",target_market:"IRAN",country:"IR",city:"تبریز"});
ins("e-tg","M L","customer",{source:"telegram_inbound"});
ins("e-tg2","mil","negotiation",{source:"telegram_inbound"});
const T=new Date().toISOString(),order=(id,lead,mk,cur,total,status)=>dbrun("INSERT INTO lead_orders(id,order_number,quote_id,lead_id,conversation_id,market,product,quantity,currency,total_minor,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,"HB-"+id,"q-"+id,lead,"c-"+lead,mk,"box",700,cur,total,status,T,T]);
order("o1","e-tg","IRAN","TOMAN",56210000,"paid");order("o2","e-tg2","ARAB","USD",26500,"confirmed");
dbrun("INSERT INTO inbox_messages(id,platform,external_id,sender,message,status,created_at,updated_at,lead_id) VALUES('in1','telegram','x1','M L','سلام','new',?,?,'e-tg'),('in2','telegram','x2','mil','مرحبا','new',?,?,'e-tg2')",[T,T,T,T]);
const cnt=t=>{try{return q(`SELECT COUNT(*) n FROM ${t}`)[0].n;}catch{return 0;}};
const approvals0=[cnt("approval_queue"),cnt("agent_approvals"),cnt("owner_escalations")],out0=cnt("lead_outreach");
for(let i=0;i<3;i++)await tick();
const intel=async id=>(await call("/api/leads/intelligence?id="+encodeURIComponent(id),null,"GET")).body?.item;
const [iS,iQ,iI,iD,iP,iT]=[await intel("e-shop"),await intel("e-iq"),await intel("e-info"),await intel("e-dup"),await intel("e-place"),await intel("e-tg")];
ok("E1 autonomous: the scheduled enrichment fetched both own shop sites and stored their same-domain emails (no owner call)",fetched.includes("https://zarin-e2e.ir/")&&fetched.includes("https://dhahab-e2e.iq/")
  &&q("SELECT COUNT(*) n FROM lead_contacts WHERE lead_id IN ('e-shop','e-iq') AND contact_type='email' AND source='own_site_enrichment'")[0].n===2,{fetched});
ok("E2 Iran shop → SALES_READY (market IRAN), Iraq shop → SALES_READY (market ARAB), both with verified contact and provenance",iS?.state==="SALES_READY"&&iS.market==="IRAN"&&iQ?.state==="SALES_READY"&&iQ.market==="ARAB"
  &&iS.contact.status==="CONTACT_VERIFIED"&&!!iS.identity.verified_at,{s:[iS?.state,iS?.market],q:[iQ?.state,iQ?.market]});
ok("E3 the information site is never fetched by enrichment and is REJECTED information_site (its old 'negotiation' stage no longer counts)",!fetched.some(u=>u.includes("goldprice-e2e"))&&iI?.state==="REJECTED"&&iI.tier==="REJECTED",{s:iI?.state,f:fetched});
ok("E4 the www-variant copy of the Iran shop is a duplicate of the earlier lead, not a second qualified business",iD?.state==="REJECTED"&&(iD.evidence||[]).includes("duplicate_of:e-shop"),iD&&{s:iD.state,e:iD.evidence});
ok("E5 the Google-only lead stays PLACE_DISCOVERED and is never fetched or contactable",iP?.state==="PLACE_DISCOVERED"&&iP.contact.status==="NONE"&&iP.next_action.action==="AWAIT_INDEPENDENT_EVIDENCE");
const SI=(await call("/api/sales/intelligence?limit=200",null,"GET")).body;
ok("E6 market report: the Telegram customer counts as an IRAN customer and the ARAB opportunity in ARAB (from their own orders); sales-ready counted per market",SI.markets.IRAN.customers===1&&SI.markets.ARAB.in_conversation===1&&SI.markets.IRAN.sales_ready===1&&SI.markets.ARAB.sales_ready===1,
  {IR:[SI.markets.IRAN.customers,SI.markets.IRAN.sales_ready],AR:[SI.markets.ARAB.in_conversation,SI.markets.ARAB.sales_ready],nm:SI.leads_without_market});
ok("E7 revenue stays separated: IRAN order value in TOMAN (56,210,000), ARAB in USD (26,500 minor); never summed",SI.markets.IRAN.currency==="TOMAN"&&SI.markets.IRAN.payments_received_minor===0&&SI.markets.IRAN.order_value_minor===56210000&&SI.markets.ARAB.currency==="USD"&&SI.markets.ARAB.order_value_minor===26500,
  {IR:SI.markets.IRAN,AR:{c:SI.markets.ARAB.currency,v:SI.markets.ARAB.order_value_minor}});
ok("E8 market_source is order_record for the Telegram customer (recorded CRM evidence), shown with provenance",iT?.market==="IRAN"&&iT.market_source==="order_record",iT&&{m:iT.market,src:iT.market_source});
const ov=(await call("/api/leads/overview",null,"GET")).body;const ovT=(ov?.items||[]).find(x=>x.id==="e-tg");
ok("E9 the CRM lead overview agrees with sales intelligence (same market and state for the Telegram customer and the duplicate)",ovT?.qualification?.market==="IRAN"&&ov.items.find(x=>x.id==="e-dup")?.qualification?.state==="REJECTED"&&ov.market_summary!=null,ovT?.qualification&&{m:ovT.qualification.market});
ok("E10 no approval, escalation or outreach row was created, nothing was sent, and no paid Places/AI call was made",
  JSON.stringify([cnt("approval_queue"),cnt("agent_approvals"),cnt("owner_escalations")])===JSON.stringify(approvals0)&&cnt("lead_outreach")===out0&&!W.tg.some(x=>/^send/.test(x.method))&&!paid.length,
  {a:[approvals0,[cnt("approval_queue"),cnt("agent_approvals"),cnt("owner_escalations")]],o:[out0,cnt("lead_outreach")],paid});
ok("E11 stored leads are never rewritten by qualification (stage of the information site and the duplicate unchanged; only the enrichment stamp is added)",q("SELECT stage FROM leads WHERE id='e-info'")[0].stage==="negotiation"&&q("SELECT stage FROM leads WHERE id='e-dup'")[0].stage==="discovered");

console.log(`phase18_1 time ${((Date.now()-started)/1000).toFixed(1)} s`);
process.exit(done()?1:0);
