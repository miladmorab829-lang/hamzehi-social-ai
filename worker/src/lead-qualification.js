// Lead qualification and sales intelligence (Phase 16.16 ladder, extended in Phase 17). Computed on read from what the CRM already
// holds — no new table, no migration, no approval queue, and stored leads are never rewritten.
//
// Evidence rules:
//  - Google Places content (IDs, Maps links, provider_supplied contacts, the legacy manual Places path) is NEVER independent evidence.
//  - Independent identity = a page of the business's OWN website fetched by web discovery (INDEPENDENT_IDENTITY_FOUND); it is
//    VERIFIED when that site also carries a local signal (.ir/.iq domain or a local phone on the page) or a contact extracted from the
//    SAME domain, or when the owner confirmed it himself.
//  - Contact FOUND = a reachable channel extracted from a web page; VERIFIED = extracted from the business's own domain, or owner-confirmed.
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
const hostOf=v=>{try{return new URL(String(v||"")).hostname.toLowerCase().replace(/^www\./,"");}catch{return "";}};
// Contact host must be the site host or one of its subdomains (never a parent domain).
const sameSite=(contactHost,site)=>!!contactHost&&!!site&&(contactHost===site||contactHost.endsWith("."+site));

// lead: CRM row; meta: parsed notes; contacts: [{contact_type, evidence_status, evidence_url?}] of THIS lead;
// activity (optional, from CRM tables): {replied, quote_requested, quoted, ordered, outreach_status, outreach_rejected_at}.
export function leadQualification(lead={},meta={},contacts=[],activity={}){
  const stage=String(lead.stage||"new"),evidence=[],missing=[];
  const site=meta.url||meta.website||"",siteHost=hostOf(site);
  const ownSite=!!siteHost&&!GOOGLE_HOST.test(siteHost)&&!NOT_OWN_SITE.test(siteHost+".")&&!GOOGLE_PROVIDER.test(String(meta.provider||""))&&!!meta.evidence;
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
  const market=leadMarketOf(meta),marketKnown=market==="IRAN"||market==="ARAB";if(marketKnown)evidence.push("market:"+market);else if(market==="CONFLICT")evidence.push("market_conflict");
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
  const rejected=["rejected","archived"].includes(stage)||!!meta.rejected_reason;
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
  const nba=nextBestAction({state,identity,contact,tier,engaged,activity,marketKnown,relevant,ownSite,meta});
  return {state,tier,priority_score:Math.max(0,Math.min(100,priority)),fit_score:Math.max(0,Math.min(100,priority)),sub_scores:sub,
    identity:{status:identity,confidence:identityConf,method:identityMethod,source:identityMethod==="google_place_id"?"google_places":identityMethod?.startsWith("own_site")?siteHost:identityMethod?"owner":null,
      verified_at:ownerIdentity?meta.identity_verified_at||null:null,refresh_days:identity==="GOOGLE_DISCOVERED"?null:30},
    contact:{status:contact,confidence:contactConf,channels:[...new Set(reach.map(c=>c.contact_type))],outreach_authorized:false},
    packaging_demand:demand,packaging_signals:fitSignals,market:marketKnown?market:null,evidence,missing,
    improvable_automatically:identity==="INDEPENDENT_IDENTITY_FOUND"||(ownSite&&contact!=="CONTACT_VERIFIED"),next_action:nba};
}

// One evidence-grounded next action. Never sends anything: outreach and anything financial stay behind the owner's approval.
export function nextBestAction(x){
  const A=(action,reason,{prereq=[],timing="now",autonomous=false,authorization="not_required"}={})=>({action,reason,prerequisites:prereq,priority:x.tier,timing,authorization,autonomous});
  if(x.state==="REJECTED")return A("ARCHIVE_IRRELEVANT","Lead was rejected or archived",{timing:"none"});
  if(x.activity?.quote_requested&&!x.activity?.quoted)return A("ESCALATE_FINANCIAL_DECISION","Customer asked for a price/quote: route it to the existing quote approval flow (owner decides prices and terms)",{authorization:"owner_decision"});
  if(x.state==="CUSTOMER")return A("FOLLOW_UP_EXISTING_CONVERSATION","Existing customer: reorder or service follow-up from CRM memory",{timing:"per_follow_up_schedule",authorization:"owner_approval_before_send"});
  if(x.state==="CONTACTED"||x.state==="OPPORTUNITY")return A("FOLLOW_UP_EXISTING_CONVERSATION","Conversation in progress",{timing:"per_follow_up_schedule",authorization:"owner_approval_before_send"});
  if(x.state==="PLACE_DISCOVERED")return A("WAIT_FOR_VERIFICATION","Only a Google place ID: no independent name or contact; owner verifies it on Google Maps",{prereq:["independent_identity","contact_channel"],timing:"when_owner_reviews",authorization:"owner_action"});
  if(x.state==="DISCOVERED")return A("FIND_INDEPENDENT_IDENTITY","No independent identity evidence yet",{prereq:["independent_identity"],autonomous:true,timing:"next_discovery_cycle"});
  if(x.identity==="INDEPENDENT_IDENTITY_FOUND")return A("VERIFY_OFFICIAL_CONTACT","Own website found; identity becomes verified with a contact on the same domain or a local signal",{prereq:["identity_verification"],autonomous:x.ownSite,timing:"next_enrichment_run"});
  if(x.contact!=="CONTACT_VERIFIED")return A("VERIFY_OFFICIAL_CONTACT","Identity verified but no verified business contact",{prereq:["contact_verification"],autonomous:x.ownSite,timing:"next_enrichment_run"});
  if(!x.marketKnown||!x.relevant)return A("REASSESS_BUSINESS_FIT","Contact verified but market or jewelry relevance is not established",{prereq:[!x.marketKnown?"market":null,!x.relevant?"business_relevance":null].filter(Boolean),timing:"when_owner_reviews",authorization:"owner_action"});
  const os=x.activity?.outreach_status;
  if(x.activity?.outreach_rejected_at&&!os)return A("NO_ACTION_REQUIRED","Owner rejected the last outreach draft; nothing is re-sent automatically",{timing:"none",authorization:"owner_decision"});
  if(os==="draft"||os==="pending_approval"||os==="approved")return A("AWAIT_OUTREACH_AUTHORIZATION","An outreach draft is waiting for the owner",{timing:"when_owner_reviews",authorization:"owner_approval_before_send"});
  if(os==="sent"||os==="delivered")return A("FOLLOW_UP_EXISTING_CONVERSATION","Outreach sent; wait for a reply",{timing:"per_follow_up_schedule",authorization:"owner_approval_before_send"});
  return A("PREPARE_OUTREACH_DRAFT","Verified identity and contact, relevant business in a known market",{prereq:["owner_requests_draft"],timing:"when_owner_reviews",authorization:"owner_approval_before_send"});
}
// A lead whose own website can be checked again for contacts (own site, not Google, not a directory/marketplace, no Places-only lead).
export function ownSiteCandidate(meta={}){
  const h=hostOf(meta.url||meta.website||"");
  return !!h&&!GOOGLE_HOST.test(h)&&!NOT_OWN_SITE.test(h+".")&&!GOOGLE_PROVIDER.test(String(meta.provider||""))&&!!meta.evidence;
}
// Counts per state (dashboard / reports).
export function qualificationCounts(items){const c=Object.fromEntries(QUALIFICATION_STATES.map(s=>[s,0]));for(const x of items)c[x]=(c[x]||0)+1;return c;}
export function tierCounts(items){const c=Object.fromEntries(PRIORITY_TIERS.map(s=>[s,0]));for(const x of items)c[x]=(c[x]||0)+1;return c;}
