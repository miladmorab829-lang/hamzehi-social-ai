// Phase 20 — sales conversion: a deterministic plan per lead (business profile, packaging-need evidence, wholesale priority, next action,
// follow-up state) and a template draft in the market's language. Built on the Phase 19 score/pipeline and the existing qualification
// (its next action decides when a first contact is due); pure functions — no AI call, no network, no D1 write. Drafts are PREVIEWS: one is
// stored only when the owner asks (existing /api/leads/outreach-draft with engine:"template"), and nothing is ever sent without the
// owner's approval (existing outreach flow).
//
// Never invented: prices, discounts, stock, delivery, payment terms, product specifications, product names or claims about the business
// (no "manufacturer", no "gallery"): the draft names only the brand and its line of business; a purchase probability is never stated as
// fact; a photo is offered only when an owner-verified gallery photo exists.

export const CONVERSION_VERSION = "p20-v2";
// Existing intervals only (no new rule): REVENUE_FOLLOWUP_DAYS in index.js (quote 3, reorder 30 — a test guards against drift) and the
// released Phase 19 no-response threshold (14 days). An owner-set next_followup_at always wins.
export const FOLLOWUP_RULES = Object.freeze({ first_contact_no_reply_days: 14, quote_no_reply_days: 3, reorder_days: 30, max_unanswered_followups: 2 });
export const BRAND = "HAMZEHI BOX";
const BRAND_TXT = "⁨" + BRAND + "⁩"; // isolated Latin brand inside right-to-left text
const DAY = 86400000;
const iso = ms => new Date(ms).toISOString();
export const DRAFT_MODES = Object.freeze(["initial", "followup", "quote_followup", "conversation"]);
// Revenue order of actions (closest to cash first; warm conversations before cold first contacts).
export const ACTION_RANK = Object.freeze({ SERVICE_EXISTING_ORDER: 1, ESCALATE_FINANCIAL_DECISION: 2, CONTINUE_CONVERSATION: 3, SET_MARKET: 3, SEND_APPROVED_MESSAGE: 4,
  OWNER_REVIEW_DRAFT: 5, PREPARE_FOLLOW_UP_DRAFT: 6, PREPARE_FIRST_CONTACT_DRAFT: 7, WAIT: 8, STOP_FOLLOW_UP: 9, COMPLETE_DATA: 10, NONE: 11 });

// Product-fit phrases about OUR boxes (never a statement about the customer's business).
const FIT_FA = { wholesale: "سفارش‌های عمده", brand_collection: "کالکشن‌های اختصاصی", luxury: "محصولات لوکس", gift_packaging: "بسته‌بندی هدیه", manufacturer: "کارگاه‌ها و تولیدکنندگان" };
const FIT_AR = { wholesale: "الطلبات بالجملة", brand_collection: "التشكيلات الخاصة", luxury: "المنتجات الفاخرة", gift_packaging: "تغليف الهدايا", manufacturer: "الورش والمصانع" };
// Scraped names/cities never carry links, handles, e-mail addresses or control characters into a customer message.
export function cleanDraftText(v, max) {
  const raw = String(v || ""), s = raw.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, " ").replace(/(https?:\/\/|www\.)\S+/gi, " ")
    .replace(/\S+@\S+/g, " ").replace(/@\w+/g, " ").replace(/\b[a-z0-9-]+\.(com|net|org|ir|iq|info|shop|store|online)\b\S*/gi, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return { text: s, changed: s !== raw.replace(/\s+/g, " ").trim().slice(0, max) };
}

// Template drafts (no price, no amount, no product claim). mode: initial | followup | quote_followup | conversation.
export function buildConversionDraft({ market, mode = "initial", name = "", city = "", signals = [], galleryIds = [] } = {}) {
  const N = cleanDraftText(name, 60), C = cleanDraftText(city, 40), n = N.text, c = C.text, photo = galleryIds.length > 0;
  const fit = signals.filter(s => FIT_FA[s]).slice(0, 2);
  // INITIAL_OUTREACH = the first introduction (no earlier contact); FOLLOW_UP = after a real contact or event (send, quote, reply).
  const base = { brand: BRAND, mode, kind: mode === "initial" ? "INITIAL_OUTREACH" : "FOLLOW_UP", prices_included: false, attachments_suggested: galleryIds.slice(0, 2), input_cleaned: N.changed || C.changed };
  if (market === "IRAN") {
    const hello = n ? `سلام و وقت بخیر خدمت مجموعه ${n}.` : "سلام و وقت بخیر.";
    const offer = photo ? " در صورت تمایل، تصویر نمونه جعبه‌ها را برای‌تان می‌فرستم." : "";
    const fitTxt = fit.length ? ` جعبه‌های ما برای ${fit.map(s => FIT_FA[s]).join(" و ")} هم مناسب است.` : "";
    const text = mode === "followup"
      ? `${hello} پیرو پیام قبلی از ${BRAND_TXT}، خواستم بپرسم آیا برای بسته‌بندی طلا و جواهرات‌تان نیازی هست که بتوانیم کمک کنیم؟${offer}`
      : mode === "quote_followup"
        ? `${hello} پیرو پیش‌فاکتوری که از طرف ${BRAND_TXT} خدمت‌تان ارسال شد، خواستم بپرسم آیا سؤالی دارید یا اطلاعات تکمیلی لازم است؟`
        : mode === "conversation"
          ? `${hello} از ${BRAND_TXT} برای ادامه گفتگوی قبلی پیام می‌دهم. اگر نوع و تعداد جعبه مورد نیازتان را بفرمایید، اطلاعات تکمیلی را برای بررسی آماده می‌کنیم.`
          : `${hello} از تیم ${BRAND_TXT} برای آشنایی پیام می‌دهم؛ ما در زمینه جعبه‌های لوکس جواهرات و بسته‌بندی هدیه فعالیت می‌کنیم.${fitTxt} به نظرمان جعبه‌های ما می‌تواند برای کسب‌وکار شما${c ? " در " + c : ""} مناسب باشد. در حال حاضر برای بسته‌بندی محصولات‌تان از چه نوع جعبه‌ای استفاده می‌کنید؟${offer}`;
    return { ...base, language: "Persian", currency: "TOMAN", text };
  }
  if (market === "ARAB") {
    const hello = n ? `هلا بيكم، تحية طيبة لـ${n}.` : "هلا بيكم، تحية طيبة.";
    const offer = photo ? " إذا تحبون نرسلكم صور نماذج من علبنا." : "";
    const fitTxt = fit.length ? ` علبنا تناسب أيضاً ${fit.map(s => FIT_AR[s]).join(" و")}.` : "";
    const text = mode === "followup"
      ? `${hello} حبيت أتابع وياكم رسالتنا السابقة من ${BRAND_TXT}. إذا عدكم حاجة لعلب مجوهرات أو تغليف هدايا، نتشرف نساعدكم.${offer}`
      : mode === "quote_followup"
        ? `${hello} حبيت أتابع وياكم بخصوص العرض اللي وصلكم من ${BRAND_TXT}، إذا عدكم أي سؤال أو تحتاجون معلومات إضافية.`
        : mode === "conversation"
          ? `${hello} وياكم ${BRAND_TXT} حتى نكمّل حديثنا السابق. إذا تگولون لنا نوع العلب والكمية اللي تحتاجونها، نجهّزلكم المعلومات التفصيلية حتى تشوفونها.`
          : `${hello} وياكم فريق ${BRAND_TXT}، متخصصين بعلب المجوهرات الفاخرة وتغليف الهدايا.${fitTxt} نعتقد علبنا تناسب شغلكم${c ? " في " + c : ""}. شنو نوع العلب اللي تستخدمونها هسه لمجوهراتكم؟${offer}`;
    return { ...base, language: "Iraqi Arabic", currency: "USD", text };
  }
  return null; // no market → no draft (the market decides language and currency)
}

// Follow-up state from records only. activity: outreach_ever_sent, outreach_sent_at, outreach_sent_count, outreach_status, replied, quoted,
// quote_sent_at, order_confirmed. A send after the basis date (quote, owner date) means that follow-up already happened: no duplicate.
export function followUpState(lead = {}, meta = {}, activity = {}, { nowMs = Date.now() } = {}) {
  const sentCount = Number(activity.outreach_sent_count || (activity.outreach_ever_sent ? 1 : 0));
  const lastSent = Date.parse(activity.outreach_sent_at || "");
  const openDraft = ["draft", "pending_approval"].includes(activity.outreach_status);
  const owner = meta.next_followup_at && Number.isFinite(Date.parse(meta.next_followup_at)) ? meta.next_followup_at : null;
  const R = (status, due_at, basis) => ({ status, due_at, sent_count: sentCount, basis });
  const sentAfter = t => Number.isFinite(lastSent) && Number.isFinite(t) && lastSent >= t;
  if (openDraft) return R("draft_waiting_for_owner", null, "open_outreach_draft");
  if (activity.outreach_status === "approved") return R("approved_not_sent", null, "owner_approved_outreach");
  if (owner) {
    if (sentAfter(Date.parse(owner))) return R("followed_up", null, "sent_after_owner_date");
    return R(Date.parse(owner) <= nowMs ? "due" : "scheduled", owner, "owner_schedule");
  }
  if (activity.quoted && !activity.order_confirmed && activity.quote_sent_at) {
    const q = Date.parse(activity.quote_sent_at);
    if (sentAfter(q)) return R("followed_up", null, "quote_follow_up_already_sent");
    const due = q + FOLLOWUP_RULES.quote_no_reply_days * DAY;
    return R(due <= nowMs ? "due" : "scheduled", iso(due), "quote_no_reply_3_days");
  }
  if (activity.replied) return R("conversation_active", null, "customer_replied");
  if (!sentCount) return R("none", null, "no_outreach_sent");
  if (Math.max(0, sentCount - 1) >= FOLLOWUP_RULES.max_unanswered_followups) return R("exhausted", null, "max_unanswered_followups");
  if (!Number.isFinite(lastSent)) return R("unknown", null, "send_time_missing");
  const due = lastSent + FOLLOWUP_RULES.first_contact_no_reply_days * DAY;
  return R(due <= nowMs ? "due" : "scheduled", iso(due), "no_reply_14_days");
}

// The plan for one lead. p = leadQualification profile, s = {score, pipeline} from lead-scoring.js.
export function conversionPlan(lead = {}, meta = {}, p = {}, s = {}, activity = {}, { nowMs = Date.now(), galleryIds = [] } = {}) {
  const score = s.score || {}, pipe = s.pipeline || {}, market = p.market || null, qa = p.next_action?.action || null;
  const signals = p.packaging_signals || [];
  // Packaging need: evidence level, never a certainty.
  const need = p.packaging_demand === "customer_activity" ? { level: "demonstrated", basis: "quote request / quote / order on record" }
    : p.packaging_demand === "owner_recorded" ? { level: "owner_recorded", basis: "packaging demand recorded by the owner" }
    : signals.length ? { level: "possible", basis: "own-website wording only: " + signals.join(", ") }
    : { level: "unknown", basis: "no packaging evidence yet" };
  const wholesale = activity.order_confirmed || p.packaging_demand === "customer_activity" ? "high (real purchase activity)"
    : signals.some(x => ["wholesale", "manufacturer"].includes(x)) ? "medium (wholesale/manufacturing wording, unconfirmed)"
    : score.band === "INSUFFICIENT_DATA" ? "unknown" : "normal";
  const fu = followUpState(lead, meta, activity, { nowMs });
  const A = (action, reason, extra = {}) => ({ action, reason, owner_decision: false, rank: ACTION_RANK[action] ?? 99, ...extra });
  let next, draftMode = null;
  if (pipe.side_state === "DUPLICATE" || pipe.side_state === "DISQUALIFIED" || score.band === "EXCLUDED") next = A("NONE", "excluded: " + (pipe.side_state || "rejected"));
  else if (pipe.stage === "ORDER") next = A("SERVICE_EXISTING_ORDER", "confirmed order: follow the existing order/payment flow; repeat-order check after " + FOLLOWUP_RULES.reorder_days + " days");
  else if (activity.quote_requested && !activity.quoted) next = A("ESCALATE_FINANCIAL_DECISION", "customer asked for a price: the owner prepares/approves the quote", { owner_decision: true });
  else if (!market) next = A("SET_MARKET", "market unknown: language, currency and prices depend on it (owner records it; never guessed)", { owner_decision: true });
  else if (pipe.stage === "QUOTE") next = fu.status === "due" ? (draftMode = "quote_followup", A("PREPARE_FOLLOW_UP_DRAFT", "quote without reply for " + FOLLOWUP_RULES.quote_no_reply_days + " days"))
    : A("WAIT", fu.status === "followed_up" ? "quote follow-up already sent; waiting for a reply" : "quote sent; follow-up at " + fu.due_at);
  else if (fu.status === "draft_waiting_for_owner") next = A("OWNER_REVIEW_DRAFT", "a draft is waiting for the owner's approval", { owner_decision: true });
  else if (pipe.stage === "NEGOTIATION" || fu.status === "conversation_active") { draftMode = "conversation"; next = A("CONTINUE_CONVERSATION", "customer replied: prepare the next message for owner review"); }
  else if (pipe.stage === "OWNER_APPROVED") next = A("SEND_APPROVED_MESSAGE", "already approved by the owner: send it through the existing approved channel (no new decision)");
  else if (pipe.stage === "CONTACTED") next = fu.status === "due" ? (draftMode = "followup", A("PREPARE_FOLLOW_UP_DRAFT", fu.basis === "owner_schedule" ? "owner-scheduled follow-up is due" : "no reply after " + FOLLOWUP_RULES.first_contact_no_reply_days + " days"))
    : fu.status === "exhausted" ? A("STOP_FOLLOW_UP", "two follow-ups without reply: no further automatic suggestion") : A("WAIT", fu.status === "followed_up" ? "follow-up already sent; waiting for a reply" : "waiting for a reply; follow-up at " + fu.due_at);
  else if (qa === "NO_ACTION_REQUIRED") next = A("NONE", "the owner rejected the last outreach draft; nothing is re-suggested");
  // First contact only when the existing qualification says so (verified identity + contact, relevant business, market known).
  // …and the business is QUALIFIED in the pipeline (relevant business with a known city), so a lead missing its city waits for data.
  else if (qa === "PREPARE_OUTREACH_DRAFT" && pipe.stage === "QUALIFIED") { draftMode = "initial"; next = A("PREPARE_FIRST_CONTACT_DRAFT", "verified business with a verified contact; first contact needs the owner's approval"); }
  else if (score.band === "INSUFFICIENT_DATA") next = A("COMPLETE_DATA", "missing: " + (score.missing_facts || []).join(", "));
  else next = A("COMPLETE_DATA", "not yet ready for contact: " + ((p.missing || []).join(", ") || qa || "qualification incomplete"));
  const draft = draftMode ? buildConversionDraft({ market, mode: draftMode, name: lead.name, city: meta.city, signals, galleryIds }) : null;
  // Ready for the owner's review is NOT ready to send: every send needs the owner's explicit approval, and a compliance screening
  // (sanctions/SDN) that the system has no record of is listed as a blocker, never assumed.
  const send_readiness = { ready_for_owner_review: !!draft, ready_to_send: false,
    blockers: draft ? ["owner_approval_required", ...(meta.compliance_screened_at ? [] : ["compliance_screening_not_recorded"])] : [next.action === "NONE" ? "excluded" : "no_draft_for_this_action"] };
  return { version: CONVERSION_VERSION, market, currency: market === "IRAN" ? "TOMAN" : market === "ARAB" ? "USD" : null, business: { industry: score.industry || null, city: meta.city || null, source: meta.source || null },
    packaging_need: need, wholesale_priority: wholesale, follow_up: fu, next_action: next, qualification_action: qa, draft, send_readiness, send_requires: "owner_approval" };
}

// Per-market conversion KPIs from records only (markets = salesIntelligence().markets; plans = [{market, plan}] for ALL listed-filter leads).
export function conversionSummary(markets = {}, plans = []) {
  const out = {};
  for (const mk of ["IRAN", "ARAB"]) {
    const m = markets[mk] || {}, r = m.revenue || {}, xs = plans.filter(x => x.market === mk);
    const by = k => xs.filter(x => x.plan.next_action.action === k).length;
    out[mk] = { currency: m.currency || (mk === "IRAN" ? "TOMAN" : "USD"), high_priority: r.high_priority ?? 0, contacts_real: r.contacted ?? 0, quote_requests: m.quote_requests ?? 0,
      confirmed_orders: r.orders ?? 0, conversion: r.conversion || null, revenue: { order_value_minor: m.order_value_minor ?? 0, received_minor: m.payments_received_minor ?? 0, outstanding_minor: m.outstanding_minor ?? 0 },
      drafts_waiting_for_owner: m.outreach?.awaiting_owner ?? 0, drafts_ready_to_prepare: by("PREPARE_FIRST_CONTACT_DRAFT") + by("PREPARE_FOLLOW_UP_DRAFT") + by("CONTINUE_CONVERSATION"),
      follow_ups: { due: xs.filter(x => x.plan.follow_up.status === "due").length, scheduled: xs.filter(x => x.plan.follow_up.status === "scheduled").length, exhausted: xs.filter(x => x.plan.follow_up.status === "exhausted").length },
      owner_decisions: xs.filter(x => x.plan.next_action.owner_decision).length, needs_data: by("COMPLETE_DATA") };
  }
  out.NO_MARKET = { set_market: plans.filter(x => !x.market && x.plan.next_action.action === "SET_MARKET").length };
  return out;
}
