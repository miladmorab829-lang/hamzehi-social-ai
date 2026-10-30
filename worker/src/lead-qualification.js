// Lead qualification ladder (Phase 16.16, owner 2026-10-30). Computed on read from what the CRM already holds — no new table, no
// migration, no approval queue, and stored leads are never rewritten. Each state needs its own evidence; a Google Places ID alone stays
// PLACE_DISCOVERED. Google-provided content (Places names, provider_supplied contacts, Maps links) never counts as INDEPENDENT identity
// or contact evidence; a page of the business's own website (page_extracted) or the owner's own confirmation (owner_confirmed) does.
// Business category is relevance, not demand: packaging demand is "unknown" unless the owner recorded evidence of it.
import { leadMarketOf } from "./ads-markets.js";

export const QUALIFICATION_STATES=Object.freeze(["DISCOVERED","PLACE_DISCOVERED","IDENTITY_VERIFIED","CONTACT_VERIFIED","BUSINESS_QUALIFIED","SALES_READY","CONTACTED","OPPORTUNITY","CUSTOMER"]);
const INDEPENDENT_CONTACT=new Set(["page_extracted","owner_confirmed"]);
const REACHABLE_TYPES=new Set(["phone","email","whatsapp","telegram","instagram"]);
const GOOGLE_HOST=/(^|\.)(google\.[a-z.]+|goo\.gl|googleusercontent\.com|googleapis\.com)$/i;
const RELEVANCE=/طلا|زرگر|جواهر|مجوهرات|ذهب|صياغ|صائغ|gold|jewel/i;
const hostOf=v=>{try{return new URL(String(v||"")).hostname.toLowerCase();}catch{return "";}};

// lead: CRM row; meta: parsed notes; contacts: [{contact_type, evidence_status}] of THIS lead (lead_contacts).
export function leadQualification(lead={},meta={},contacts=[]){
  const stage=String(lead.stage||"new"),evidence=[];
  if(["customer","converted"].includes(stage))return {state:"CUSTOMER",fit_score:100,packaging_demand:"customer",evidence:["crm_stage_customer"]};
  // Independent identity: the business's own website was fetched and carried page evidence (web discovery), or the owner confirmed it.
  const site=meta.url||meta.website||"";const siteHost=hostOf(site);
  const ownSite=!!siteHost&&!GOOGLE_HOST.test(siteHost)&&meta.provider!=="google_places"&&!!meta.evidence;
  const ownerIdentity=meta.identity_verified===true&&meta.identity_source==="owner";
  const identity=ownSite||ownerIdentity;
  if(ownSite)evidence.push("own_website_page");if(ownerIdentity)evidence.push("owner_confirmed_identity");
  const indep=(contacts||[]).filter(c=>REACHABLE_TYPES.has(c.contact_type)&&INDEPENDENT_CONTACT.has(c.evidence_status));
  const contact=indep.length>0;if(contact)evidence.push("independent_contact:"+[...new Set(indep.map(c=>c.contact_type))].join("+"));
  const market=leadMarketOf(meta),marketKnown=market==="IRAN"||market==="ARAB";if(marketKnown)evidence.push("market:"+market);
  const relevant=!!(meta.qualification&&(meta.qualification.buyer_in_title!=null||meta.qualification.included_type))||RELEVANCE.test([meta.type,meta.evidence].filter(Boolean).join(" "));
  const business=identity&&marketKnown&&relevant&&!!meta.city;if(business)evidence.push("relevant_business_in_city");
  const demand=meta.packaging_demand_evidence?"owner_recorded":"unknown";
  const fit=Math.min(100,(marketKnown?20:0)+(meta.city?10:0)+(relevant?20:0)+(identity?20:0)+(contact?20:0)+(meta.qualification?.local_phone||meta.qualification?.local_domain?10:0));
  let state=meta.place_id&&!identity?"PLACE_DISCOVERED":identity?"IDENTITY_VERIFIED":"DISCOVERED";
  if(identity&&contact)state="CONTACT_VERIFIED";
  if(business)state=contact?"SALES_READY":"BUSINESS_QUALIFIED";
  // CONTACTED / OPPORTUNITY need evidence of real engagement: an inbound conversation, a recorded outreach or a reply. Older Ads code
  // moved drafted leads to "negotiation" without any contact (Production: 8 such leads); that stage alone is reported, not trusted.
  const engaged=!!(meta.last_outreach_at||meta.last_reply_at||/inbound/i.test(String(meta.source||"")));
  const engagedStage=["contacted","replied"].includes(stage)?"CONTACTED":["negotiation","quote","quoted","qualified_opportunity","opportunity"].includes(stage)?"OPPORTUNITY":null;
  if(engagedStage&&engaged)state=engagedStage;else if(engagedStage)evidence.push("crm_stage_unconfirmed:"+stage);
  return {state,fit_score:fit,packaging_demand:demand,evidence};
}
// Counts per state (dashboard / reports).
export function qualificationCounts(items){const c=Object.fromEntries(QUALIFICATION_STATES.map(s=>[s,0]));for(const x of items)c[x]=(c[x]||0)+1;return c;}
