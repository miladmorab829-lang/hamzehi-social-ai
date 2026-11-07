// Phase 19 — revenue scoring and sales pipeline, built ON TOP of the qualification profile (lead-qualification.js). Pure functions:
// no AI call, no network, no D1 write, no migration; computed on read and memoized per isolate by an input fingerprint.
//
// Rules:
//  - Only recorded facts count. Each point is labelled VERIFIED (own website / owner / CRM record) or INFERRED (dataset or Ads claim,
//    page wording that only suggests a need). Missing information is never scored as low value: a lead with too few known facts gets
//    band INSUFFICIENT_DATA instead of LOW.
//  - The pipeline stage is derived only from real CRM records (owner-approved outreach, sent outreach, inbound replies, quotes, orders).
//    Nothing here sends, approves, prices or orders anything; transitions are validated by canTransition() and need evidence.
//  - IRAN and ARAB are scored independently; money is never mixed (TOMAN / USD come from the market only).

export const SCORE_VERSION = "p19-v1";
// Owner's initial weights (Phase 19 instruction); kept in one place so they can be re-tuned after the real-data review.
export const SCORE_WEIGHTS = Object.freeze({ market_relevance: 30, b2b_fit: 25, contact_quality: 20, business_evidence: 15, data_quality: 10 });
export const SCORE_BANDS = Object.freeze([["VERY_HIGH", 80], ["HIGH", 60], ["REVIEW", 40], ["LOW", 0]]);
export const PIPELINE_STAGES = Object.freeze(["DISCOVERED", "QUALIFIED", "REVIEWED", "OWNER_APPROVED", "CONTACTED", "NEGOTIATION", "QUOTE", "ORDER"]);
export const PIPELINE_SIDE_STATES = Object.freeze(["DISQUALIFIED", "DUPLICATE", "NO_RESPONSE", "NEEDS_DATA"]);
export const MARKET_CURRENCY = Object.freeze({ IRAN: "TOMAN", ARAB: "USD" });
const DAY = 86400000;
const NO_RESPONSE_DAYS = 14;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const industryOf = meta => { const t = String(meta?.type || "").replace(/_(fa|ar)$/, ""); return t || "unknown"; };

// Compact, stable fingerprint of every input the score depends on (cache key; changes whenever evidence changes).
export function scoreInputKey(p = {}, lead = {}, meta = {}, activity = {}, nowMs = 0) {
  const parts = [SCORE_VERSION, lead.id, lead.stage, p.state, p.tier, p.identity?.status, p.contact?.status, (p.contact?.channels || []).join("+"), p.market,
    p.market_source, (p.packaging_signals || []).join("+"), p.packaging_demand, (p.missing || []).join("+"), meta.city || "", meta.type || "",
    meta.contact_enrichment_checked_at || meta.discovered_at || lead.created_at || "", activity.replied ? 1 : 0, activity.quote_requested ? 1 : 0,
    activity.quoted ? 1 : 0, activity.ordered ? 1 : 0, activity.outreach_status || "", activity.outreach_sent_at || "", activity.duplicate_of || "",
    Math.floor(nowMs / DAY), meta.source || "", meta.last_reply_at || "", meta.city_source || "", meta.dataset_verification?.checked_at || "", p.identity?.method || "",
    (p.evidence || []).join("+"), lead.updated_at || "", (activity.order_markets || []).join("+"), activity.order_confirmed ? 1 : 0, activity.quote_customer_request ? 1 : 0,
    activity.outreach_ever_sent ? 1 : 0, activity.outreach_approved_at || "", meta.data_class || "", String(meta.is_test ?? "")];
  return parts.join("|");
}
export function scoreFingerprint(p = {}, lead = {}, meta = {}, activity = {}, nowMs = 0) {
  let h = 2166136261; const s = scoreInputKey(p, lead, meta, activity, nowMs);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return SCORE_VERSION + ":" + h.toString(16);
}

// 0–100 revenue score with an explanation per component. p = leadQualification() profile of this lead.
export function leadRevenueScore(p = {}, lead = {}, meta = {}, activity = {}, { nowMs = Date.now() } = {}) {
  const W = SCORE_WEIGHTS, comp = {};
  const add = (key, points, why, kind) => { const c = comp[key] || (comp[key] = { points: 0, max: W[key], verified: [], inferred: [] }); c.points += points; c[kind === "verified" ? "verified" : "inferred"].push(why); };
  const missing = new Set(p.missing || []), relevant = !missing.has("business_relevance"), market = p.market;
  const ownSite = ["IDENTITY_VERIFIED", "INDEPENDENT_IDENTITY_FOUND"].includes(p.identity?.status);
  const inbound = /inbound/i.test(String(meta.source || ""));
  const engaged = !!(activity.replied || activity.quote_requested || activity.quoted || activity.ordered || meta.last_reply_at || inbound);
  const buyer = !!(activity.ordered || activity.quoted || activity.quote_requested); // a real packaging purchase / quote on record

  // 1. Target-market relevance (30): jewelry relevance 18, market 6, city 6.
  comp.market_relevance = { points: 0, max: W.market_relevance, verified: [], inferred: [] };
  if (buyer && !relevant) add("market_relevance", 18, "packaging purchase/quote on record (real customer of our boxes)", "verified");
  else if (relevant) add("market_relevance", ownSite || engaged ? 18 : 9, ownSite ? "jewelry relevance on the business's own website" : engaged ? "jewelry relevance from a real conversation" : "jewelry category from the discovery source (claim)", ownSite || engaged ? "verified" : "inferred");
  if (market) add("market_relevance", 6, "market " + market + " (" + (p.market_source || "recorded") + ")", ["owner", "country_evidence", "order_record"].includes(p.market_source) ? "verified" : "inferred");
  if (meta.city) add("market_relevance", 6, "city " + meta.city, meta.city_source === "dataset_confirmed_by_phone" || ownSite ? "verified" : "inferred");

  // 2. Wholesale / B2B fit (25): real demand 15 (owner-recorded or customer activity), own-page packaging wording 4 each up to 10.
  comp.b2b_fit = { points: 0, max: W.b2b_fit, verified: [], inferred: [] };
  if (p.packaging_demand === "owner_recorded") add("b2b_fit", 15, "packaging demand recorded by the owner", "verified");
  else if (p.packaging_demand === "customer_activity") add("b2b_fit", 15, "quote request / quote / order on record", "verified");
  if (activity.ordered) add("b2b_fit", 10, "existing order: repeat-purchase potential", "verified");
  const sig = (p.packaging_signals || []).slice(0, 3);
  if (sig.length) add("b2b_fit", Math.min(10, sig.length * 4), "own-page wording suggests packaging need: " + sig.join(", "), "inferred");
  if ((p.evidence || []).includes("packaging_seller_page")) { comp.b2b_fit.points = 0; comp.b2b_fit.inferred.push("page sells packaging (competitor/supplier, not a buyer)"); }

  // 3. Contact quality (20): verified business contact 16 (+4 for a second channel type); unverified channel 8 (+2).
  comp.contact_quality = { points: 0, max: W.contact_quality, verified: [], inferred: [] };
  const ch = p.contact?.channels || [];
  if (p.contact?.status === "CONTACT_VERIFIED") add("contact_quality", 16 + (ch.length > 1 ? 4 : 0), "verified business contact: " + ch.join("+"), "verified");
  else if (p.contact?.status === "CONTACT_CHANNEL_FOUND") add("contact_quality", 8 + (ch.length > 1 ? 2 : 0), "contact found but not verified: " + ch.join("+"), "inferred");
  if ((inbound || activity.replied) && comp.contact_quality.points < 16) { comp.contact_quality.points = 16; comp.contact_quality.verified.push("live conversation channel (the customer wrote to us)"); }

  // 4. Evidence of a real business (15): verified identity 12 (owner-confirmed 15), own site found 6, Google ID only 2.
  comp.business_evidence = { points: 0, max: W.business_evidence, verified: [], inferred: [] };
  const id = p.identity || {};
  if (id.status === "IDENTITY_VERIFIED") add("business_evidence", id.method === "owner_confirmed" ? 15 : 12, "identity verified (" + id.method + ")", "verified");
  else if (id.status === "INDEPENDENT_IDENTITY_FOUND") add("business_evidence", 6, "own website found, identity not yet confirmed", "inferred");
  else if (id.status === "GOOGLE_DISCOVERED") add("business_evidence", 2, "Google place ID only (provisional)", "inferred");
  if (engaged && comp.business_evidence.points < 12) { comp.business_evidence.points = 12; comp.business_evidence.verified.push("real customer interaction on record"); }

  // 5. Data quality and freshness (10): last check ≤ 30 days 5 (≤ 90 days 3); completeness of market, city, website, contact (5).
  comp.data_quality = { points: 0, max: W.data_quality, verified: [], inferred: [] };
  const seen = Date.parse(meta.contact_enrichment_checked_at || meta.dataset_verification?.checked_at || meta.discovered_at || lead.updated_at || lead.created_at || "");
  const age = Number.isFinite(seen) ? Math.floor((nowMs - seen) / DAY) : null;
  if (age !== null && age <= 30) add("data_quality", 5, "evidence checked " + age + " day(s) ago", "verified");
  else if (age !== null && age <= 90) add("data_quality", 3, "evidence checked " + age + " day(s) ago", "verified");
  const known = { market: !!market, city: !!meta.city, website: ownSite, contact: (p.contact?.status || "NONE") !== "NONE" || inbound || !!activity.replied, relevance: relevant || buyer };
  const knownCount = Object.values(known).filter(Boolean).length;
  add("data_quality", Math.round(Object.entries(known).filter(([k, v]) => v && k !== "relevance").length * 1.25), "known: " + Object.keys(known).filter(k => known[k]).join(", "), "verified");
  for (const k of Object.keys(comp)) comp[k].points = clamp(comp[k].points, 0, comp[k].max);

  let score = Object.values(comp).reduce((a, c) => a + c.points, 0);
  const testRecord = isTestLead(meta), excluded = p.state === "REJECTED" || testRecord;
  if (excluded) score = 0;
  score = clamp(Math.round(score), 0, 100);
  // Missing facts are not low value: too few known facts (and no real interaction) → INSUFFICIENT_DATA, not LOW.
  // A live conversation without a market is also "needs data" (the market decides currency and prices), never LOW.
  const insufficient = !excluded && (engaged ? !market : (knownCount < 3 || !["IDENTITY_VERIFIED", "INDEPENDENT_IDENTITY_FOUND"].includes(id.status)));
  const band = excluded ? "EXCLUDED" : insufficient ? "INSUFFICIENT_DATA" : (SCORE_BANDS.find(([, min]) => score >= min) || ["LOW"])[0];
  const missingFacts = Object.keys(known).filter(k => !known[k]);
  const reasons = Object.entries(comp).sort((a, b) => b[1].points - a[1].points).filter(([, c]) => c.points > 0)
    .map(([k, c]) => k + " " + c.points + "/" + c.max);
  return { version: SCORE_VERSION, score, band, excluded, test_record: testRecord, insufficient_data: insufficient, components: comp, known_facts: known, missing_facts: missingFacts,
    data_age_days: age, reasons, industry: industryOf(meta), currency: MARKET_CURRENCY[market] || null };
}

// ---- Sales pipeline: DISCOVERED → QUALIFIED → REVIEWED → OWNER_APPROVED → CONTACTED → NEGOTIATION → QUOTE → ORDER (+ side states).
// Derived from records only. activity: {outreach_status, outreach_sent_at, replied, quote_requested, quoted, ordered, duplicate_of}.
export function pipelineStage(p = {}, lead = {}, meta = {}, activity = {}, score = null, { nowMs = Date.now() } = {}) {
  const ev = [];
  let stage = "DISCOVERED";
  if (["BUSINESS_QUALIFIED", "SALES_READY", "CONTACTED", "OPPORTUNITY", "CUSTOMER"].includes(p.state)) { stage = "QUALIFIED"; ev.push("qualification:" + p.state); }
  const os = activity.outreach_status || null;
  // Strict fields from salesLeadActivity (fall back to the older flags only when the strict ones are absent, e.g. offline evaluation).
  const strict = activity.strict_activity === true;
  const sent = strict ? !!activity.outreach_ever_sent : (os === "sent" || os === "delivered");
  const approved = strict ? !!activity.outreach_approved_at : (os === "approved" || sent);
  const customerAsked = strict ? !!activity.quote_customer_request : !!activity.quote_requested;
  const orderConfirmed = strict ? !!activity.order_confirmed : !!activity.ordered;
  if (os === "draft" || os === "pending_approval") { stage = "REVIEWED"; ev.push("outreach_draft_waiting_for_owner"); }
  if (approved && !sent) { stage = "OWNER_APPROVED"; ev.push("outreach_approved_by_owner"); }
  // "inbound" = the customer wrote to us (no outreach involved); "outreach_sent" = an owner-approved message went out.
  const inbound = /inbound/i.test(String(meta.source || "")) || !!activity.replied;
  if (sent || inbound) { stage = "CONTACTED"; ev.push(sent ? "outreach_sent" : "inbound_conversation"); }
  if (sent && !approved) ev.push("anomaly:sent_without_recorded_owner_approval");
  if (activity.replied || customerAsked) { stage = "NEGOTIATION"; ev.push(customerAsked ? "customer_quote_request" : "customer_replied"); }
  if (activity.quoted) { stage = "QUOTE"; ev.push("quote_approved_or_sent"); }
  if (orderConfirmed) { stage = "ORDER"; ev.push("confirmed_order_on_record"); } else if (activity.ordered) ev.push("order_not_confirmed_yet");
  if (["REVIEWED", "OWNER_APPROVED"].includes(stage) && !["BUSINESS_QUALIFIED", "SALES_READY"].includes(p.state)) ev.push("anomaly:outreach_record_ahead_of_qualification");
  // Side states (the main stage is kept for history).
  let side = null;
  if (activity.duplicate_of) side = "DUPLICATE";
  else if (p.state === "REJECTED" || score?.test_record) side = "DISQUALIFIED";
  else if (stage === "CONTACTED" && sent && !activity.replied && activity.outreach_sent_at && nowMs - Date.parse(activity.outreach_sent_at) > NO_RESPONSE_DAYS * DAY) side = "NO_RESPONSE";
  else if (score?.band === "INSUFFICIENT_DATA" && ["DISCOVERED", "QUALIFIED"].includes(stage)) side = "NEEDS_DATA";
  // A CRM stage that claims more than the records show is reported, never trusted.
  if (["contacted", "replied", "negotiation", "quote", "quoted", "opportunity", "customer", "converted"].includes(String(lead.stage || "")) && PIPELINE_STAGES.indexOf(stage) < PIPELINE_STAGES.indexOf("CONTACTED"))
    ev.push("crm_stage_without_contact_evidence:" + lead.stage);
  // Funnel flags: each one is set only by its own record (an order without a quote record is NOT counted as a quote).
  // Leads in a DUPLICATE / DISQUALIFIED side state are left out of the funnel (their records stay visible on the lead itself).
  const inFunnel = side !== "DUPLICATE" && side !== "DISQUALIFIED";
  const flags = inFunnel ? { qualified: ["BUSINESS_QUALIFIED", "SALES_READY", "CONTACTED", "OPPORTUNITY", "CUSTOMER"].includes(p.state), draft_for_owner: os === "draft" || os === "pending_approval",
    owner_approved: approved, contacted: sent || inbound, negotiation: !!(activity.replied || customerAsked), quote: !!activity.quoted, order: orderConfirmed } : {};
  return { stage, side_state: side, evidence: ev, index: PIPELINE_STAGES.indexOf(stage), flags };
}

// Transition guard for any future write path (and the dashboard): a move is allowed only one step forward with its required evidence,
// or into a side state. Nothing here performs the move. evidence: {owner_approval_id, contact_event_id, reply_event_id, quote_id (approved),
// order_id (real order)}.
const REQUIRED = { QUALIFIED: "qualification", REVIEWED: "outreach_draft_id", OWNER_APPROVED: "owner_approval_id", CONTACTED: "contact_event_id",
  NEGOTIATION: "reply_event_id", QUOTE: "approved_quote_id", ORDER: "order_id" };
export function canTransition(from, to, evidence = {}) {
  if (PIPELINE_SIDE_STATES.includes(to)) return to === "DUPLICATE" && !evidence.duplicate_of ? { ok: false, reason: "duplicate_of_required" } : { ok: true };
  const a = PIPELINE_STAGES.indexOf(from), b = PIPELINE_STAGES.indexOf(to);
  if (a < 0 || b < 0) return { ok: false, reason: "unknown_stage" };
  if (b <= a) return { ok: false, reason: "no_backward_or_same_stage" };
  if (b !== a + 1 && !(from === "QUALIFIED" && to === "CONTACTED" && evidence.inbound)) return { ok: false, reason: "one_step_at_a_time" };
  const need = REQUIRED[to];
  if (to === "QUALIFIED") return evidence.qualified === true ? { ok: true } : { ok: false, reason: "qualification_required" };
  if (to === "CONTACTED" && evidence.inbound) return evidence.inbound_message_id ? { ok: true } : { ok: false, reason: "inbound_message_id_required" };
  return evidence[need] ? { ok: true } : { ok: false, reason: need + "_required" };
}

// Memoized scoring for the API (bounded per-isolate cache keyed by the input fingerprint).
const CACHE = new Map(); const CACHE_MAX = 5000;
export function scoreLeadCached(p, lead, meta, activity, opts = {}) {
  // The Map key is the full input string (no hash collision can return another lead's result); the short fingerprint is for display.
  const nowMs = opts.nowMs ?? Date.now(), key = scoreInputKey(p, lead, meta, activity, nowMs);
  const hit = CACHE.get(key); if (hit) return { ...hit, cached: true };
  const score = deepFreeze(leadRevenueScore(p, lead, meta, activity, { nowMs })), pipeline = deepFreeze(pipelineStage(p, lead, meta, activity, score, { nowMs }));
  const out = { fingerprint: scoreFingerprint(p, lead, meta, activity, nowMs), score, pipeline };
  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(key, out);
  return { ...out, cached: false };
}
export function clearScoreCache() { CACHE.clear(); }
// Cached results are shared between requests, so they are frozen (no caller can alter a cached score).
function deepFreeze(o) { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; }
// A lead the CRM marks as test data (notes.data_class = "test" or notes.is_test), the same convention as the revenue follow-ups.
export const isTestLead = meta => meta?.data_class === "test" || meta?.is_test === true || meta?.is_test === 1 || meta?.is_test === "true";
// Phase 12.3: test-lead detection that never parses a malformed notes value (a non-JSON value is "not test", flagged separately).
export const leadTestFlagSql = a => `COALESCE(CASE WHEN ${a}.notes IS NULL OR TRIM(${a}.notes)='' OR NOT json_valid(${a}.notes) THEN 0 ELSE (json_extract(${a}.notes,'$.data_class')='test' OR json_extract(${a}.notes,'$.is_test') IN (1,'true')) END,0)`;

// Per-market summary from scored items [{market, score:{band,…}, pipeline:{stage,side_state}, contact_status}] — counts only, real records.
export function revenueSummary(items = []) {
  const out = {};
  for (const mk of ["IRAN", "ARAB"]) {
    const xs = items.filter(x => x.market === mk);
    const bands = Object.fromEntries(["VERY_HIGH", "HIGH", "REVIEW", "LOW", "INSUFFICIENT_DATA", "EXCLUDED"].map(b => [b, xs.filter(x => x.score.band === b).length]));
    const stages = Object.fromEntries(PIPELINE_STAGES.map(s => [s, xs.filter(x => x.pipeline.stage === s).length]));
    const side = Object.fromEntries(PIPELINE_SIDE_STATES.map(s => [s, xs.filter(x => x.pipeline.side_state === s).length]));
    const n = f => xs.filter(x => x.pipeline.flags?.[f]).length, rate = (a, b) => ({ numerator: a, denominator: b, percent: b ? Math.round(a / b * 100) : null });
    const contacted = n("contacted");
    out[mk] = { currency: MARKET_CURRENCY[mk], discovered: xs.length, qualified: n("qualified"), with_contact: xs.filter(x => (x.contact_status && x.contact_status !== "NONE") || x.pipeline.flags?.contacted).length,
      high_priority: bands.VERY_HIGH + bands.HIGH, bands, stages, side_states: side,
      awaiting_owner: n("draft_for_owner"), owner_approved: n("owner_approved"), contacted, negotiation: n("negotiation"), quotes: n("quote"), orders: n("order"),
      // Conversion only from real records, with its counts; percent is null when there is nothing to divide by (never an invented rate).
      conversion: { contacted_to_negotiation: rate(n("negotiation"), contacted), negotiation_to_order: rate(xs.filter(x => x.pipeline.flags?.negotiation && x.pipeline.flags?.order).length, n("negotiation")) } };
  }
  return out;
}
