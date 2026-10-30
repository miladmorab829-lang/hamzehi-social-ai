// PHASE 17 — evidence rules of the CRM qualification layer (pure; ports the intent of the Phase 17 package tests
// phase17-evidence-and-metrics / phase17-sales-priority onto the integrated lead-qualification.js). No I/O.
import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {reporter} from "./harness.mjs";
const {ok,done}=reporter("phase17_evidence");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const LQ=await import(pathToFileURL(path.join(SRC,"lead-qualification.js")).href);
const Q=(meta,contacts=[],stage="discovered",activity={})=>LQ.leadQualification({stage},meta,contacts,activity);
const own={source:"ad_autopilot",target_market:"IRAN",city:"تبریز",url:"https://shop-ir.example/",evidence:"طلافروشی و جواهر در تبریز",qualification:{buyer_in_title:true,local_phone:true}};
const ownC=[{contact_type:"phone",evidence_status:"page_extracted",evidence_url:"https://shop-ir.example/contact"}];

// ---- identity provenance
ok("E1 provider google_places_ids with a third-party URL and page text is NOT independent identity",Q({...own,provider:"google_places_ids"}).identity.status!=="IDENTITY_VERIFIED"&&Q({...own,provider:"google_places_ids"}).identity.status!=="INDEPENDENT_IDENTITY_FOUND");
ok("E2 provider google_places (legacy manual path) with a website is NOT independent identity",Q({...own,provider:"google_places",place_id:"ChIJx0000000000"}).identity.status==="GOOGLE_DISCOVERED");
ok("E3 a Google-hosted 'website' (maps.google.com / googleusercontent) is never the business's own site",["https://maps.google.com/?cid=1","https://lh3.googleusercontent.com/x","https://www.google.com/maps/place/?q=place_id:ChIJ1"].every(u=>Q({...own,url:u}).identity.status==="NONE"));
ok("E4 directory / marketplace / social / blog-platform pages are not own sites",["https://divar.ir/v/1","https://www.instagram.com/shop","https://x.blogfa.com/","https://s.myshopify.com/","https://iq.opensooq.com/a"].every(u=>Q({...own,url:u}).identity.status==="NONE"));
ok("E5 own site WITHOUT a local signal or same-domain contact = INDEPENDENT_IDENTITY_FOUND only (not verified)",Q({...own,qualification:{buyer_in_title:true}}).identity.status==="INDEPENDENT_IDENTITY_FOUND");
ok("E6 own site + local phone on the page = IDENTITY_VERIFIED with method own_site_local_signal",Q(own).identity.status==="IDENTITY_VERIFIED"&&Q(own).identity.method==="own_site_local_signal");
ok("E7 owner-confirmed identity = IDENTITY_VERIFIED (confidence 100), even for a Places lead",(()=>{const r=Q({provider:"google_places_ids",place_id:"ChIJ1234567890",identity_verified:true,identity_source:"owner",target_market:"ARAB",city:"بغداد"});return r.identity.status==="IDENTITY_VERIFIED"&&r.identity.confidence===100;})());
ok("E8 identity_verified=true WITHOUT identity_source owner is ignored (no self-asserted verification)",Q({provider:"google_places_ids",place_id:"ChIJ1234567890",identity_verified:true}).identity.status==="GOOGLE_DISCOVERED");

// ---- contact provenance
ok("C1 same-domain page contact = CONTACT_VERIFIED",Q(own,ownC).contact.status==="CONTACT_VERIFIED");
ok("C2 a contact extracted on ANOTHER domain = CONTACT_CHANNEL_FOUND (not verified)",Q(own,[{contact_type:"phone",evidence_status:"page_extracted",evidence_url:"https://directory.example/x"}]).contact.status==="CONTACT_CHANNEL_FOUND");
ok("C3 a contact 'extracted' from a Google-hosted page is ignored entirely",Q(own,[{contact_type:"phone",evidence_status:"page_extracted",evidence_url:"https://www.google.com/maps/place/x"}]).contact.status==="NONE");
ok("C4 Google provider_supplied contacts never count",Q(own,[{contact_type:"phone",evidence_status:"provider_supplied",evidence_url:"https://shop-ir.example/"}]).contact.status==="NONE");
ok("C5 'website' is not a reachable channel",Q(own,[{contact_type:"website",evidence_status:"page_extracted",evidence_url:"https://shop-ir.example/"}]).contact.status==="NONE");
ok("C6 owner-confirmed contact = CONTACT_VERIFIED (confidence 100)",Q(own,[{contact_type:"email",evidence_status:"owner_confirmed"}]).contact.confidence===100);

ok("E9 Google short hosts (g.page, g.co) and shared hosting parents (github.io, pages.dev, netlify.app) are never own sites",["https://x.g.page/","https://g.co/kgs/1","https://shop.github.io/","https://shop.pages.dev/","https://shop.netlify.app/"].every(u=>Q({...own,url:u}).identity.status==="NONE"));
ok("C7 a contact on the PARENT domain of the site (example vs shop.example) is not the business's own domain; a subdomain of the site is",Q({...own,url:"https://shop.example.com/",qualification:{buyer_in_title:true,local_phone:true}},[{contact_type:"email",evidence_status:"page_extracted",evidence_url:"https://example.com/contact"}]).contact.status==="CONTACT_CHANNEL_FOUND"&&Q(own,[{contact_type:"email",evidence_status:"page_extracted",evidence_url:"https://www.shop-ir.example/contact"}]).contact.status==="CONTACT_VERIFIED");
ok("C8 a lookalike domain (evilshop-ir.example vs shop-ir.example) is never treated as the business's own domain",Q(own,[{contact_type:"email",evidence_status:"page_extracted",evidence_url:"https://evilshop-ir.example/contact"}]).contact.status==="CONTACT_CHANNEL_FOUND");

// ---- market / ambiguity
ok("M1 a lead whose country and Ads market disagree (CONFLICT) is never BUSINESS_QUALIFIED and is flagged",(()=>{const r=Q({...own,country:"العراق",target_market:"IRAN"},ownC);return !["BUSINESS_QUALIFIED","SALES_READY"].includes(r.state)&&r.evidence.includes("market_conflict");})());
ok("M2 two similar-name businesses evaluate independently (no shared state, distinct markets)",(()=>{const a=Q({...own,url:"https://goldstar.ir/"}),b=Q({...own,url:"https://goldstar.iq/",target_market:"ARAB",city:"بغداد"});return a.market==="IRAN"&&b.market==="ARAB";})());
ok("M3 evaluation is pure: inputs are not mutated",(()=>{const m=JSON.parse(JSON.stringify(own)),c=JSON.parse(JSON.stringify(ownC));Q(m,c,"discovered",{replied:true});return JSON.stringify(m)===JSON.stringify(own)&&JSON.stringify(c)===JSON.stringify(ownC);})());

// ---- priority / intent
const rich={...own,evidence:"طلافروشی لوکس، فروش عمده، تولیدی و کالکشن برند، جعبه هدیه سفارشی در تبریز"};
ok("P1 strong packaging wording + verified contact but NO real intent = tier B (never A), demand unknown",(()=>{const r=Q(rich,ownC);return r.tier==="B"&&r.sub_scores.packaging_fit>=12&&r.packaging_demand==="unknown";})());
ok("P2 the same prospect with a real reply + quote request = tier A, intent from activity",(()=>{const r=Q({...rich,last_reply_at:"2026-10-29T00:00:00Z"},ownC,"replied",{replied:true,quote_requested:true});return r.tier==="A"&&r.sub_scores.commercial_intent>0;})());
ok("P3 a page that SELLS packaging scores 0 packaging fit (supplier/competitor, not a buyer)",Q({...own,evidence:"تولید جعبه و چاپ جعبه جواهرات، فروش عمده"},ownC).sub_scores.packaging_fit===0);
ok("P4 jewelry category alone never yields intent or tier A",Q({...own,evidence:"طلا جواهر زرگری طلا جواهر"},ownC).sub_scores.commercial_intent===0&&Q({...own,evidence:"طلا جواهر"},ownC).tier!=="A");
ok("P5 quote request without an approved quote → ESCALATE_FINANCIAL_DECISION (owner decision, not autonomous)",(()=>{const n=Q({source:"telegram_inbound",target_market:"IRAN",city:"تبریز"},[],"replied",{replied:true,quote_requested:true}).next_action;return n.action==="ESCALATE_FINANCIAL_DECISION"&&n.autonomous===false;})());
ok("P6 SALES_READY next action is a DRAFT on owner request; no action is ever pre-authorized to send",(()=>{const r=Q(own,ownC);return r.next_action.action==="PREPARE_OUTREACH_DRAFT"&&r.contact.outreach_authorized===false&&r.next_action.authorization==="owner_approval_before_send";})());
ok("P7 rejected / archived leads → REJECTED tier, priority 0, ARCHIVE_IRRELEVANT",(()=>{const r=Q(own,ownC,"rejected");return r.tier==="REJECTED"&&r.priority_score===0&&r.next_action.action==="ARCHIVE_IRRELEVANT";})());
ok("P8 scores stay within 0–100 for arbitrary inputs",[Q({}),Q(rich,ownC,"customer"),Q({evidence:"x".repeat(5000),url:"https://a.b/"},[],"negotiation",{replied:true,quote_requested:true,quoted:true,ordered:true})].every(r=>r.priority_score>=0&&r.priority_score<=100));
done();
