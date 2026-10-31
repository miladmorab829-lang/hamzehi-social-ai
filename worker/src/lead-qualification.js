// Lead qualification and sales intelligence (Phase 16.16 ladder, extended in Phase 17). Computed on read from what the CRM already
// holds — no new table, no migration, no approval queue, and stored leads are never rewritten.
//
// Evidence rules:
//  - Google Places content (IDs, Maps links, provider_supplied contacts, the legacy manual Places path) is NEVER independent evidence.
//  - Independent identity = a page of the business's OWN website fetched by web discovery (INDEPENDENT_IDENTITY_FOUND); it is
//    VERIFIED when that site also carries a local signal (.ir/.iq domain or a local phone on the page) or a contact extracted from the
//    SAME domain, or when the owner confirmed it himself.
//  - Contact FOUND = a reachable channel extracted from a web page; VERIFIED = extracted from the business's own domain, or owner-confirmed.
//  - Phase 18.1: price/news information sites and later copies of a known own-site identity are excluded automatically; a lead with no
//    market takes the market of its own orders/quotes; contactability is never marketing permission; no routine step needs the owner.
//  - Category is relevance, not demand. Packaging fit comes only from wording on the business's own page; commercial intent only from
//    real activity (replies, quote requests, quotes, orders) or owner-recorded demand. Nothing is guessed.
import { leadMarketOf } from "./ads-markets.js";
// Phase 17 validated candidate (2026-10-30): the identity/contact decisions below are made by its provenance guards.
import { verifyIdentityEvidence, verifyContactEvidence } from "./phase17-evidence.js";

export const QUALIFICATION_STATES=Object.freeze(["DISCOVERED","PLACE_DISCOVERED","INDEPENDENT_IDENTITY_FOUND","IDENTITY_VERIFIED","CONTACT_CHANNEL_FOUND",
  "CONTACT_VERIFIED","BUSINESS_QUALIFIED","SALES_READY","CONTACTED","OPPORTUNITY","CUSTOMER","REJECTED"]);
export const PRIORITY_TIERS=Object.freeze(["A","B","C","D","REJECTED"]);
const INDEPENDENT_CONTACT=new Set(["page_extracted","owner_confirmed"]);
const REACHABLE_TYPES=new Set(["phone","email","whatsapp","telegram","instagram"]);
const GOOGLE_HOST=/(^|\.)(google\.[a-z.]+|goo\.gl|g\.page|g\.co|googleusercontent\.com|googleapis\.com)$/i;
const RELEVANCE=/طلا|زرگر|جواهر|مجوهرات|ذهب|صياغ|صائغ|gold|jewel/i;
// Own-page wording that suggests a packaging buyer (weak signals, distinct groups counted once; never proof of demand).
const PACKAGING_SIGNALS=[["wholesale",/عمده|فروش عمده|جملة|بالجملة|wholesale/i],["manufacturer",/تولیدی|کارگاه|مصنع|ورشة|manufactur|workshop/i],
  ["brand_collection",/کالکشن|برند اختصاصی|ماركتنا|تشكيلة|collection|our brand/i],["luxury",/لوکس|بوتیک|فاخر|بوتيك|luxury|boutique/i],
  ["gift_packaging",/جعبه هدیه|بسته\s*بندی|علبة هدية|تغليف|gift box|packaging/i],["custom",/سفارشی|طراحی اختصاصی|تصميم خاص|حسب الطلب|custom|bespoke/i]];
// A page that SELLS packaging is a competitor or supplier, not a buyer.
const PACKAGING_SELLER=/جعبه\s*سازی|تولید جعبه|ساخت جعبه|فروش جعبه|چاپ جعبه|مصنع علب|صناعة علب|طباعة علب|بيع علب|packaging supplier|box supplier|box manufacturer/i;
// Directories, marketplaces, blog/shop platforms and social sites are not "the business's own website" (CRM review: a directory page used
// as the start URL must not become independent identity evidence).
const NOT_OWN_SITE=/(^|\.)(divar|sheypoor|torob|digikala|basalam|emalls|okala|blogfa|blogsky|persianblog|wixsite|myshopify|instagram|facebook|linkedin|youtube|opensooq|dubizzle|yellowpages|olx|alibaba|amazon|t\.me|wa\.me|wikipedia|linktr\.ee|wordpress|blogspot|business\.site|tiktok|x\.com|twitter|telegram\.me|pinterest|snapchat|threads|github\.io|pages\.dev|netlify\.app|vercel\.app)\./i;
// Every Google Places provider variant (google_places, google_places_ids, …) is Google-originated, never independent.
const GOOGLE_PROVIDER=/^google_places/i;
// Phase 18.1: a gold/metal price or news page (rate ticker) is an information site, not a jewelry seller. Decided on the page title,
// so a shop that merely shows a price widget is not affected; a title with a shop word ("گالری", "مجوهرات", "shop", …) is never one.
const INFORMATION_SITE=/سعر\s*(?:ال)?ذهب|[أا]سعار\s*(?:ال)?(?:ذهب|معادن)|قیمت\s*(?:لحظه\s*‌?\s*ای\s*)?(?:طلا|سکه)|نرخ\s*(?:طلا|سکه)|gold\s*(?:price|rate)s?|price\s*of\s*gold|live\s*gold/i;
// "محل" (shop) only as a whole word: it is also inside "المحلية" ("local", as in "local currencies" on rate tickers).
const SHOP_TITLE=/طلافروشی|زرگری|جواهری|جواهرفروشی|گالری|فروشگاه|تولیدی|کارگاه|مجوهرات|صياغة|صائغ|(?<![؀-ۿ])محل(?![؀-ۿ])|ورشة|معرض|jewell?ery|jewell?er|goldsmith|boutique|shop|store/i;
// Phase 18.1: another country's domain is not attributed to an Ads target market from the run alone (wrong-market record).
const FOREIGN_CC=/\.(ae|sa|eg|om|kw|qa|bh|jo|lb|sy|ye|tr|af|pk|az|am|ma|dz|tn|ly|sd)$/i;
export function informationSite(lead={},meta={}){const t=String(lead.name||meta.title||"");return INFORMATION_SITE.test(t)&&!SHOP_TITLE.test(t);}
// Phase 18.4: the business's own website host, or "" for Google, directory, marketplace and social hosts (shared with dataset discovery).
export function independentWebsiteHost(url){const h=hostOf(/^https?:/i.test(String(url||""))?url:"https://"+String(url||""));return !!h&&!GOOGLE_HOST.test(h)&&!NOT_OWN_SITE.test(h+".")?h:"";}
// Phase 18.4: a site on the OTHER target market's domain (.ir for an Iraq lead, .iq for an Iran lead).
const OTHER_MARKET_CC={IRAN:/\.iq$/i,ARAB:/\.ir$/i};
const hostOf=v=>{try{return new URL(String(v||"")).hostname.toLowerCase().replace(/^www\./,"");}catch{return "";}};
// Phase 17.1: a Google-originated lead (provisional flag, a place ID or any Places provider variant). Its stored name, address, phone
// and website are Google content: they never authorize a first contact or a draft without an independent contact.
export function googleOriginLead(meta={}){
  return meta.lead_status==="provisional_place"||!!meta.place_id||GOOGLE_PROVIDER.test(String(meta.provider||""))||GOOGLE_PROVIDER.test(String(meta.source||""));
}
// An independent contact row: owner-confirmed, or extracted from a page that is not Google-hosted.
export function independentContact(c={}){
  return INDEPENDENT_CONTACT.has(c.evidence_status)&&!(c.evidence_status==="page_extracted"&&GOOGLE_HOST.test(hostOf(c.evidence_url)));
}
// Contact host must be the site host or one of its subdomains (never a parent domain).
const sameSite=(contactHost,site)=>!!contactHost&&!!site&&(contactHost===site||contactHost.endsWith("."+site));

// lead: CRM row; meta: parsed notes; contacts: [{contact_type, evidence_status, evidence_url?}] of THIS lead;
// activity (optional, from CRM tables): {replied, quote_requested, quoted, ordered, outreach_status, outreach_rejected_at}.
export function leadQualification(lead={},meta={},contacts=[],activity={}){
  const stage=String(lead.stage||"new"),evidence=[],missing=[];
  const site=meta.url||meta.website||"",siteHost=hostOf(site);
  const infoSite=informationSite(lead,meta);
  const ownSite=!!siteHost&&!GOOGLE_HOST.test(siteHost)&&!NOT_OWN_SITE.test(siteHost+".")&&!GOOGLE_PROVIDER.test(String(meta.provider||""))&&!!meta.evidence&&!infoSite;
  const ownerIdentity=meta.identity_verified===true&&meta.identity_source==="owner";
  const q=meta.qualification||{};
  // A contact "extracted" from a Google-hosted page is Google content, not independent evidence (Phase 17 package guard).
  const reach=(contacts||[]).filter(c=>REACHABLE_TYPES.has(c.contact_type)&&INDEPENDENT_CONTACT.has(c.evidence_status)&&!(c.evidence_status==="page_extracted"&&GOOGLE_HOST.test(hostOf(c.evidence_url))));
  const ownDomainContact=reach.some(c=>c.evidence_status==="page_extracted"&&sameSite(hostOf(c.evidence_url),siteHost));
  const ownerContact=reach.some(c=>c.evidence_status==="owner_confirmed");
  // ---- identity
  let identity="NONE",identityConf=0,identityMethod=null;
  if(ownerIdentity){identity="IDENTITY_VERIFIED";identityConf=100;identityMethod="owner_confirmed";}
  else if(ownSite&&verifyIdentityEvidence({provider:String(meta.provider||""),url:site,identitySource:"official_business_website",evidenceSource:"page_extracted",
      businessDomainConfirmed:!!(q.local_domain||q.local_phone||ownDomainContact),verifiedBusinessDomain:siteHost}).verified){identity="IDENTITY_VERIFIED";identityConf=80;identityMethod=ownDomainContact?"own_site_contact":"own_site_local_signal";}
  else if(ownSite){identity="INDEPENDENT_IDENTITY_FOUND";identityConf=50;identityMethod="own_site_page";}
  else if(meta.place_id){identity="GOOGLE_DISCOVERED";identityConf=10;identityMethod="google_place_id";}
  // Phase 18.4 QA: a dataset candidate is verified only when its website CONFIRMS the dataset business name. A site that merely loads
  // (even with local signals, its own contacts or a city of its own) under another name stays unconfirmed; only the owner can confirm it.
  const datasetNameUnconfirmed=meta.provider==="dataset"&&!ownerIdentity&&meta.dataset_verification?.name_consistent!==true;
  if(datasetNameUnconfirmed&&identity==="IDENTITY_VERIFIED"){identity="INDEPENDENT_IDENTITY_FOUND";identityConf=50;identityMethod="own_site_page";evidence.push("dataset_name_unconfirmed");}
  if(identityMethod)evidence.push("identity:"+identityMethod);
  // ---- contact
  let contact="NONE",contactConf=0;
  // Each independent contact is checked by the candidate guard: verified identity, reachable channel, owner-confirmed or published on the
  // business's OWN verified domain (evidence_url host must match the site host).
  const verifiedContacts=identity==="IDENTITY_VERIFIED"?reach.filter(c=>verifyContactEvidence({identityVerified:true,source:c.evidence_status==="owner_confirmed"?"owner_confirmed":"official_business_website",
      channel:c.contact_type,evidenceUrl:c.evidence_url||"",isBusinessPublished:true,verifiedBusinessDomain:siteHost}).verified):[];
  if(verifiedContacts.length){contact="CONTACT_VERIFIED";contactConf=verifiedContacts.some(c=>c.evidence_status==="owner_confirmed")?100:80;}
  else if(reach.length){contact="CONTACT_CHANNEL_FOUND";contactConf=40;}
  if(reach.length)evidence.push("contact:"+[...new Set(reach.map(c=>c.contact_type))].join("+")+(contact==="CONTACT_VERIFIED"?":verified":":unverified"));
  // ---- business relevance / market
  // Phase 18.1: market source is recorded. A lead without one takes the market of its OWN orders/quotes (a recorded CRM fact, never a
  // guess from language); two different order markets are a conflict. A target market on a foreign-domain site is a conflict too.
  let market=leadMarketOf(meta),marketSource=leadMarketOf({market:meta.market})!=="UNKNOWN"?"owner":leadMarketOf({country:meta.country})!=="UNKNOWN"?"country_evidence":market==="UNKNOWN"?null:"ads_target";
  if(marketSource==="ads_target"&&(FOREIGN_CC.test(siteHost)||OTHER_MARKET_CC[market]?.test(siteHost))){market="CONFLICT";evidence.push("foreign_domain");}
  const orderMarkets=[...new Set((activity.order_markets||[]).filter(m=>m==="IRAN"||m==="ARAB"))];
  if(market==="UNKNOWN"&&orderMarkets.length===1){market=orderMarkets[0];marketSource="order_record";}else if(market==="UNKNOWN"&&orderMarkets.length>1)market="CONFLICT";
  const marketKnown=market==="IRAN"||market==="ARAB";if(marketKnown)evidence.push("market:"+market+(marketSource==="order_record"?":order_record":""));else if(market==="CONFLICT")evidence.push("market_conflict");
  const relevant=!!(q.buyer_in_title===true||q.included_type)||RELEVANCE.test([meta.type,meta.evidence].filter(Boolean).join(" "));
  const verifiedId=identity==="IDENTITY_VERIFIED";
  const business=verifiedId&&marketKnown&&relevant&&!!meta.city;if(business)evidence.push("relevant_business_in_city");
  // ---- packaging fit (own page only)
  const page=ownSite?String(meta.evidence||""):"";
  const seller=PACKAGING_SELLER.test(page);
  const fitSignals=seller?[]:PACKAGING_SIGNALS.filter(([,re])=>re.test(page)).map(([k])=>k);
  if(seller)evidence.push("packaging_seller_page");if(fitSignals.length)evidence.push("packaging_signals:"+fitSignals.join("+"));
  // ---- real engagement / intent
  const engaged=!!(meta.last_outreach_at||meta.last_reply_at||/inbound/i.test(String(meta.source||""))||activity.replied);
  const demand=meta.packaging_demand_evidence?"owner_recorded":activity.quote_requested||activity.quoted||activity.ordered?"customer_activity":"unknown";
  // ---- state ladder
  // Phase 18.1: information sites and later copies of an already-known own-site identity are excluded automatically (computed on read,
  // reversible, nothing stored); a lead with real engagement or a customer stage is never excluded this way.
  // Phase 18.4: a dataset-discovered lead rejected by its own website check (unreachable, unrelated, wrong market, …) is excluded the same way.
  const autoExclusion=engaged||["customer","converted"].includes(stage)?null:infoSite?"information_site":activity.duplicate_of?"duplicate_identity"
    :meta.provider==="dataset"&&meta.rejected_reason?String(meta.rejected_reason).slice(0,40):null;
  const rejected=["rejected","archived"].includes(stage)||!!meta.rejected_reason||!!autoExclusion;
  if(infoSite)evidence.push("information_site");if(activity.duplicate_of)evidence.push("duplicate_of:"+activity.duplicate_of);
  let state;
  if(["customer","converted"].includes(stage))state="CUSTOMER";
  else if(rejected)state="REJECTED";
  else{
    state=identity==="IDENTITY_VERIFIED"?"IDENTITY_VERIFIED":identity==="INDEPENDENT_IDENTITY_FOUND"?"INDEPENDENT_IDENTITY_FOUND":meta.place_id?"PLACE_DISCOVERED":"DISCOVERED";
    if(contact!=="NONE"&&identity!=="NONE"&&identity!=="GOOGLE_DISCOVERED")state=contact==="CONTACT_VERIFIED"?"CONTACT_VERIFIED":(verifiedId?"CONTACT_CHANNEL_FOUND":state);
    if(ownerContact&&ownerIdentity)state="CONTACT_VERIFIED";
    if(business)state=contact==="CONTACT_VERIFIED"?"SALES_READY":"BUSINESS_QUALIFIED";
    // CONTACTED / OPPORTUNITY need real engagement (older Ads code set "negotiation" without any contact).
    const engagedStage=["contacted","replied"].includes(stage)?"CONTACTED":["negotiation","quote","quoted","qualified_opportunity","opportunity"].includes(stage)?"OPPORTUNITY":null;
    if(engagedStage&&engaged)state=engagedStage;else if(engagedStage)evidence.push("crm_stage_unconfirmed:"+stage);
    if(!engagedStage&&engaged&&(activity.quote_requested||activity.quoted))state="OPPORTUNITY";
  }
  // ---- sub-scores (weights: identity 15, contact 20, relevance 15, packaging 15, intent 25, readiness 10)
  const sub={identity_confidence:Math.round(identityConf*0.15),contact_confidence:Math.round(contactConf*0.20),
    business_relevance:(relevant?8:0)+(marketKnown?4:0)+(meta.city?3:0),
    packaging_fit:Math.min(15,fitSignals.length*4),
    commercial_intent:state==="CUSTOMER"?25:Math.min(25,(activity.replied||meta.last_reply_at?8:0)+(activity.quote_requested?6:0)+(activity.quoted?4:0)+(activity.ordered?7:0)+(meta.packaging_demand_evidence?8:0)),
    sales_readiness:(contact==="CONTACT_VERIFIED"?6:0)+(marketKnown?2:0)+(activity.outreach_rejected_at?0:2)};
  let priority=Object.values(sub).reduce((a,b)=>a+b,0);
  // ---- tier by evidence gates (the score ranks leads inside a tier):
  //  A = verified identity + verified contact (or a live conversation) + REAL commercial intent; B = verified identity + verified contact,
  //  relevant business; C = relevant business with incomplete verification; D = raw discovery / uncertain identity.
  const relevantBusiness=relevant&&marketKnown;
  const realIntent=!!(activity.replied||meta.last_reply_at||activity.quote_requested||activity.quoted||activity.ordered);
  let tier;
  if(state==="REJECTED"){tier="REJECTED";priority=0;}
  else if(state==="CUSTOMER")tier="A";
  else if(realIntent&&(engaged||(verifiedId&&contact==="CONTACT_VERIFIED")))tier="A";
  else if(verifiedId&&contact==="CONTACT_VERIFIED"&&relevantBusiness)tier="B";
  else if((verifiedId||identity==="INDEPENDENT_IDENTITY_FOUND"||engaged)&&relevant)tier="C";
  else tier="D";
  // ---- what is missing
  if(identity==="NONE"||identity==="GOOGLE_DISCOVERED")missing.push("independent_identity");else if(identity==="INDEPENDENT_IDENTITY_FOUND")missing.push("identity_verification");
  if(contact==="NONE")missing.push("contact_channel");else if(contact==="CONTACT_CHANNEL_FOUND")missing.push("contact_verification");
  if(!marketKnown)missing.push("market");if(!meta.city)missing.push("city");if(!relevant)missing.push("business_relevance");
  if(demand==="unknown"&&state!=="CUSTOMER")missing.push("packaging_demand_evidence");
  if(datasetNameUnconfirmed&&ownSite)missing.push("dataset_name_confirmation");
  const nba=nextBestAction({state,identity,contact,tier,engaged,activity,marketKnown,relevant,ownSite,meta,autoExclusion,datasetNameUnconfirmed:datasetNameUnconfirmed&&ownSite});
  // Phase 18.1 provenance: where each decision came from and when it was observed (CRM timestamps only; nothing is invented).
  const provenance={identity:{method:identityMethod,source_url:ownSite?site:null,observed_at:meta.discovered_at||lead.created_at||null,last_checked_at:meta.contact_enrichment_checked_at||null},
    contacts:reach.map(c=>({type:c.contact_type,evidence_status:c.evidence_status,evidence_url:c.evidence_url||null,observed_at:c.created_at||null,
      verified:verifiedContacts.includes(c)})),market:{market:marketKnown?market:market==="CONFLICT"?"CONFLICT":null,source:marketKnown?marketSource:null},
    // Phase 18.4: open-dataset origin (record, release, license, attribution) and whether its claims were confirmed by the website.
    source:meta.dataset_record?{...meta.dataset_record,claims_trusted:meta.dataset_verification?.dataset_claims_trusted===true,checked_at:meta.dataset_verification?.checked_at||null}:null};
  return {state,tier,priority_score:Math.max(0,Math.min(100,priority)),fit_score:Math.max(0,Math.min(100,priority)),sub_scores:sub,
    identity:{status:identity,confidence:identityConf,method:identityMethod,source:identityMethod==="google_place_id"?"google_places":identityMethod?.startsWith("own_site")?siteHost:identityMethod?"owner":null,
      verified_at:ownerIdentity?meta.identity_verified_at||null:identity==="IDENTITY_VERIFIED"?(meta.contact_enrichment_checked_at||meta.discovered_at||lead.created_at||null):null,refresh_days:identity==="GOOGLE_DISCOVERED"?null:30},
    // Contactability (a verified business channel exists) is NOT permission to market: outreach always needs the owner's approval.
    contact:{status:contact,confidence:contactConf,channels:[...new Set(reach.map(c=>c.contact_type))],outreach_authorized:false,
      contactability:contact==="CONTACT_VERIFIED"?"verified":contact==="CONTACT_CHANNEL_FOUND"?"unverified":"none",marketing_permission:"not_established",outreach_requires:"owner_approval"},
    rejection_reason:state==="REJECTED"?(autoExclusion||"crm_rejected"):null,market_source:marketKnown?marketSource:null,provenance,
    packaging_demand:demand,packaging_signals:fitSignals,market:marketKnown?market:null,evidence,missing,
    improvable_automatically:identity==="INDEPENDENT_IDENTITY_FOUND"||(ownSite&&contact!=="CONTACT_VERIFIED"),next_action:nba};
}

// One evidence-grounded next action. Never sends anything: outreach and anything financial stay behind the owner's approval.
export function nextBestAction(x){
  const A=(action,reason,{prereq=[],timing="now",autonomous=false,authorization="not_required"}={})=>({action,reason,prerequisites:prereq,priority:x.tier,timing,authorization,autonomous});
  if(x.state==="REJECTED")return A("ARCHIVE_IRRELEVANT",x.autoExclusion==="information_site"?"Price/news information site, not a jewelry business: excluded automatically"
    :x.autoExclusion==="duplicate_identity"?"Same own-site identity as an earlier lead: the earlier lead is kept"
    :x.autoExclusion?"Website check excluded this dataset candidate ("+x.autoExclusion+")":"Lead was rejected or archived",{timing:"none",autonomous:!!x.autoExclusion});
  if(x.activity?.quote_requested&&!x.activity?.quoted)return A("ESCALATE_FINANCIAL_DECISION","Customer asked for a price/quote: route it to the existing quote approval flow (owner decides prices and terms)",{authorization:"owner_decision"});
  if(x.state==="CUSTOMER")return A("FOLLOW_UP_EXISTING_CONVERSATION","Existing customer: reorder or service follow-up from CRM memory",{timing:"per_follow_up_schedule",authorization:"owner_approval_before_send"});
  if(x.state==="CONTACTED"||x.state==="OPPORTUNITY")return A("FOLLOW_UP_EXISTING_CONVERSATION","Conversation in progress",{timing:"per_follow_up_schedule",authorization:"owner_approval_before_send"});
  // Phase 18.1: no routine owner step. A Google-only lead stays provisional (never contactable) while independent web discovery for its
  // city continues automatically; it advances only through an independent own-site lead or an owner-confirmed identity (optional).
  if(x.state==="PLACE_DISCOVERED")return A("AWAIT_INDEPENDENT_EVIDENCE","Only a Google place ID: stays provisional and never contactable; independent discovery for this city continues automatically",{prereq:["independent_identity","contact_channel"],autonomous:true,timing:"next_discovery_cycle"});
  if(x.state==="DISCOVERED")return A("FIND_INDEPENDENT_IDENTITY","No independent identity evidence yet",{prereq:["independent_identity"],autonomous:true,timing:"next_discovery_cycle"});
  if(x.datasetNameUnconfirmed)return A("AWAIT_INDEPENDENT_EVIDENCE","The website's business name differs from the dataset record: identity stays unconfirmed and the lead is excluded from outreach (owner confirmation is optional, never queued)",{prereq:["dataset_name_confirmation"],autonomous:true,timing:"next_discovery_cycle"});
  if(x.identity==="INDEPENDENT_IDENTITY_FOUND")return A("VERIFY_OFFICIAL_CONTACT","Own website found; identity becomes verified with a contact on the same domain or a local signal",{prereq:["identity_verification"],autonomous:x.ownSite,timing:"next_enrichment_run"});
  if(x.contact!=="CONTACT_VERIFIED")return A("VERIFY_OFFICIAL_CONTACT","Identity verified but no verified business contact",{prereq:["contact_verification"],autonomous:x.ownSite,timing:"next_enrichment_run"});
  if(!x.marketKnown||!x.relevant)return A("REASSESS_BUSINESS_FIT","Contact verified but market or jewelry relevance is not established: excluded from outreach while evidence gathering continues",{prereq:[!x.marketKnown?"market":null,!x.relevant?"business_relevance":null].filter(Boolean),autonomous:true,timing:"next_enrichment_run"});
  const os=x.activity?.outreach_status;
  if(x.activity?.outreach_rejected_at&&!os)return A("NO_ACTION_REQUIRED","Owner rejected the last outreach draft; nothing is re-sent automatically",{timing:"none",authorization:"owner_decision"});
  if(os==="draft"||os==="pending_approval"||os==="approved")return A("AWAIT_OUTREACH_AUTHORIZATION","An outreach draft is waiting for the owner",{timing:"when_owner_reviews",authorization:"owner_approval_before_send"});
  if(os==="sent"||os==="delivered")return A("FOLLOW_UP_EXISTING_CONVERSATION","Outreach sent; wait for a reply",{timing:"per_follow_up_schedule",authorization:"owner_approval_before_send"});
  return A("PREPARE_OUTREACH_DRAFT","Verified identity and contact, relevant business in a known market",{prereq:["owner_requests_draft"],timing:"when_owner_reviews",authorization:"owner_approval_before_send"});
}
// A lead whose own website can be checked again for contacts (own site, not Google, not a directory/marketplace, no Places-only lead).
export function ownSiteCandidate(meta={},lead={}){
  const h=hostOf(meta.url||meta.website||"");
  return !!h&&!GOOGLE_HOST.test(h)&&!NOT_OWN_SITE.test(h+".")&&!GOOGLE_PROVIDER.test(String(meta.provider||""))&&!!meta.evidence&&!informationSite(lead,meta);
}
// Phase 18.1: own-site identities seen more than once. The earliest lead per site host is kept; a later lead with the same host and no
// engagement of its own is marked duplicate_of the earliest. Google-provider rows are never part of this (their sites are Google content).
// Phase 18.4: across DIFFERENT domains, two own-site leads are one business when they share a channel published on their own pages
// (phone, email, Instagram, Telegram, WhatsApp from lead_contacts with evidence page_extracted/owner_confirmed) — never a dataset claim.
const DUP_CHANNELS=new Set(["phone","email","instagram","telegram","whatsapp"]);
export function leadDuplicateMap(leads=[],act=new Map(),parse=x=>x?.notes?JSON.parse(x.notes):{},contacts=new Map()){
  const first=new Map(),dup=new Map();
  for(const l of [...leads].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))||String(a.id).localeCompare(String(b.id)))){
    let m={};try{m=parse(l)||{};}catch{}
    if(GOOGLE_PROVIDER.test(String(m.provider||""))||m.place_id)continue;
    const h=hostOf(m.url||m.website||"");if(!h||GOOGLE_HOST.test(h)||NOT_OWN_SITE.test(h+"."))continue;
    const keys=["host:"+h,...(contacts.get(l.id)||[]).filter(c=>DUP_CHANNELS.has(c.contact_type)&&INDEPENDENT_CONTACT.has(c.evidence_status)&&c.normalized_value)
      .map(c=>"ch:"+c.contact_type+":"+String(c.normalized_value).toLowerCase())];
    const a=act.get(l.id)||{},hit=keys.map(k=>first.get(k)).find(Boolean);
    if(hit&&hit!==l.id&&!a.replied&&!a.quote_requested&&!a.ordered&&!["customer","converted"].includes(String(l.stage||"")))dup.set(l.id,hit);
    else for(const k of keys)if(!first.has(k))first.set(k,l.id);
  }
  return dup;
}
// Counts per state (dashboard / reports).
export function qualificationCounts(items){const c=Object.fromEntries(QUALIFICATION_STATES.map(s=>[s,0]));for(const x of items)c[x]=(c[x]||0)+1;return c;}
export function tierCounts(items){const c=Object.fromEntries(PRIORITY_TIERS.map(s=>[s,0]));for(const x of items)c[x]=(c[x]||0)+1;return c;}
