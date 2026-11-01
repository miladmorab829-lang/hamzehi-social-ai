// Autonomous sales messaging (owner policy 2026-11-01): permitted, NON-financial follow-ups are sent without per-message approval, but
// only inside a conversation the customer opened on Telegram (their consent), with a recorded market, outside quiet hours, never after
// an opt-out, never twice, within per-run / per-day caps, and only while the owner's switch is ON (default OFF; emergency stop in the
// dashboard). Discovery leads (Overture/OSM, no conversation) never receive an automatic message: their first-contact drafts wait for the
// owner. Prices, discounts, quotes, payment terms, orders and unapproved product facts are never sent by this path.
// Pure helpers here; the scheduled runner lives in index.js and reuses the existing draft route, send function and failure backoff.

export const AUTO_MESSAGING_KEY = "auto_sales_messaging";
export const AUTO_POLICY_ACTOR = "auto_followup_policy";
export const AUTO_MESSAGING_DEFAULTS = Object.freeze({ enabled: false, followups: true, initial_drafts: true, per_run: 2, per_day: 10, local_start_hour: 10, local_end_hour: 20 });
// Market local time (fixed offsets, minutes): Iran UTC+3:30, Iraq UTC+3.
export const MARKET_UTC_OFFSET_MIN = Object.freeze({ IRAN: 210, ARAB: 180 });

export function autoMessagingSettings(raw) {
  let v = {}; try { v = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw || {}); } catch { v = {}; }
  if (!v || typeof v !== "object" || Array.isArray(v)) v = {};
  const int = (x, d, lo, hi) => { const n = Number(x); return Number.isInteger(n) && n >= lo && n <= hi ? n : d; };
  const D = AUTO_MESSAGING_DEFAULTS;
  return { enabled: v.enabled === true, followups: v.followups !== false, initial_drafts: v.initial_drafts !== false,
    per_run: int(v.per_run, D.per_run, 1, 5), per_day: int(v.per_day, D.per_day, 1, 30),
    local_start_hour: int(v.local_start_hour, D.local_start_hour, 0, 23), local_end_hour: int(v.local_end_hour, D.local_end_hour, 1, 24),
    updated_at: v.updated_at || null, updated_by: v.updated_by || null };
}

export function marketLocalHour(market, nowMs = Date.now()) {
  const off = MARKET_UTC_OFFSET_MIN[market]; if (off == null) return null;
  return new Date(nowMs + off * 60000).getUTCHours();
}
export function withinContactHours(market, settings, nowMs = Date.now()) {
  const h = marketLocalHour(market, nowMs); if (h == null) return false;
  return h >= settings.local_start_hour && h < settings.local_end_hour;
}

// ---- Customer opt-out classification (Phase 21.1) -------------------------------------------------------------------------------
// Runs ONLY on the customer's own inbound messages (inbox_messages). Three outcomes:
//   "opt_out" — an explicit stop request (at any message length): every automatic message stops and the owner's approve/send returns 409.
//   "review"  — possibly a stop request (a short message with a stop word, an ambiguous phrase, or an explicit phrase inside a long
//               technical text): automatic commercial messages wait for the owner; the owner may still answer the customer.
//   "none"    — no stop request. A stop word inside code, a quotation, a log line or a long technical explanation is NOT a request.
// Normalisation only unifies letter forms and spacing (Arabic/Persian yeh and kaf, alef forms, tatweel, diacritics, ZWNJ); the meaning
// of the text is never changed. Nothing here is stored, and no recorded opt-out is ever removed by this code.
// Rule-change boundary: the instant these rules FIRST ran on Production. index.js records it once (write-once system_kv row
// OPT_OUT_RULES_KEY, INSERT OR IGNORE — a later deploy never moves it). Every message received before it keeps the result the earlier
// rules gave it, so a deploy never re-judges messages that were already processed. No route, binding or request can change it.
export const OPT_OUT_RULES_ID = "phase21.1";
export const OPT_OUT_RULES_KEY = "opt_out_rules_boundary:" + OPT_OUT_RULES_ID;
export const OPT_OUT_ALL_LEGACY = "9999-12-31T23:59:59Z";   // boundary unknown → every message keeps its earlier result (safest)

export function normalizeOptOutText(text) {
  return String(text || "").normalize("NFKC")
    .replace(/[ً-ْٰـ]/g, "")                 // Arabic diacritics and tatweel
    .replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه")
    .replace(/[‌‍‎‏؜ ]/g, " ")      // ZWNJ, bidi marks, nbsp → space
    .toLowerCase();
}
// Keep only the customer's own words: drop fenced/inline code, quotations, URLs and quoted (>) lines. Whole code/log LINES are dropped
// only in a technical text (in an ordinary chat message a line with "return", "update" or ";" is still the customer's words).
const CODE_OR_LOG_LINE = /[{};]|=>|::|\b(?:const|let|var|function|return|import|export|select|insert|update|console\.|await|async)\b|^\s*(?:at\s+\S+\s*\(|\d{4}-\d\d-\d\d[t\s]\d|\[\d{1,2}:\d\d|#{1,6}\s|\$\s|>>>|(?:error|warn|warning|info|debug|trace)\s*[:\]])|\b[\w-]+\.(?:js|mjs|cjs|ts|json|sql|md|toml|py|sh|html|css|log)\b|(?:^|\s)(?:\/[\w.-]+){2,}|[a-z]:\\/i;
const LOG_LINE = /^\s*(?:at\s+\S+\s*\(|\d{4}-\d\d-\d\d[t\s]\d|\[\d{1,2}:\d\d|(?:error|warn|warning|info|debug|trace)\s*[:\]])/i;
export function customerProse(text, technical = isTechnicalText(text)) {
  const s = normalizeOptOutText(text)
    .replace(/```[\s\S]*?(?:```|$)/g, "\n").replace(/`[^`\n]*`/g, " ")
    .replace(/"[^"\n]{0,500}"|“[^”\n]{0,500}”|«[^»\n]{0,500}»/g, " ")
    .replace(/https?:\/\/\S+|www\.\S+/g, " ");
  return s.split(/\r?\n/).filter(l => !/^\s*>/.test(l) && !LOG_LINE.test(l) && !(technical && CODE_OR_LOG_LINE.test(l))).join("\n");
}
const TECH_MARKERS = [/```/, /`[^`\n]+`/, /\b[\w-]+\.(?:js|mjs|ts|json|sql|md|toml|py)\b/i,
  /\b(?:api|worker|d1|r2|cron|regex|webhook|endpoint|deploy|commit|function|database|json|backend|frontend|prompt|bug|fix)\b/i,
  /^\s*#{1,6}\s/m, /^\s*(?:[-*]|\d+[.)])\s+\S/m, /[{}<>[\]]/, /(?:^|\s)(?:\/[\w.-]+){2,}/];
export function isTechnicalText(text) {
  const raw = String(text || "");
  return raw.length > 400 && TECH_MARKERS.filter(re => re.test(raw)).length >= 2;
}
const B = "(?:^|[\\s،,.!؟?؛:()\\-])", E = "(?=$|[\\s،,.!؟?؛:()\\-])";
const AR_SEND = "(?:ترسل|ترسلون|تدز|تدزون|تراسل|تراسلون|تتواصل|تتواصلون|تبعث|تبعثون|تبعت|تبعتون)";
// Explicit stop requests: they count at any message length (inside a long technical text → owner review instead).
const EXPLICIT = [
  // Persian
  /(?:دیگه|دیگر)\s*(?:به\s*من\s*|بهم\s*)?(?:پیام|مسیج|پیامک|تبلیغ)\S{0,4}\s*(?:تبلیغاتی\s*|تبلیغی\s*)?(?:نده|ندهید|ندید|ندین|نفرست|نفرستید|نفرستین|نزن|نزنید|نزنین)/,
  new RegExp(B + "(?:پیام|مسیج|پیامک)\\S{0,4}\\s*(?:تبلیغاتی\\s*|تبلیغی\\s*)?(?:نده|ندهید|ندید|ندین|نفرستید|نفرستین|نفرست)" + E),
  /مزاحم\S{0,4}\s*(?:نشو|نشوید|نشین|نشید|نشوین)/,
  /از\s*لیست\S{0,4}\s*(?:حذف|پاک)\s*(?:کن|کنید|کنین)/,
  /شماره\s*(?:منو|مرا|من\s*را|ام|م)?\s*(?:رو\s*|را\s*)?(?:حذف|پاک)\s*(?:کن|کنید|کنین)/,
  /(?:عضویت|اشتراک)\S{0,4}\s*(?:رو|را)?\s*لغو\s*(?:کن|کنید|کنین)/,
  /نمی\s*خوا(?:ه)?(?:م|یم)\s*(?:دیگه\s*)?(?:پیام|مسیج|تبلیغ)\S{0,4}\s*(?:\S{1,15}\s*)?(?:بدی|بدید|بدین|بفرستی|بفرستید|بفرستین|بگیرم|دریافت)/,
  // Iraqi Arabic / Arabic
  new RegExp(B + "لا\\s*" + AR_SEND + "(?:ی|نی|لی|ونی|ون|وا)?\\s*(?:بعد|رسائل|رساله|مره\\s*ثانیه|ابدا|ابدن)?\\s*(?:$|[.!،؟?]|شکرا|رجاء|لو\\s*سمحت)"),
  new RegExp(B + "لا\\s*" + AR_SEND + "(?:ی|نی|لی|ونی|ون|وا)?\\s*(?:بعد|رسائل|ابدا|ابدن)" + E),
  new RegExp(B + "(?:لا|ما)\\s*" + AR_SEND + "(?:ی|نی|لی|ونی|ون|وا)?\\s*(?:لی|لنا|الی)?\\s*(?:رسائل|مسجات|رساله)(?:\\s*(?:بعد|ابدا|ابدن))?(?!\\s*[?؟])" + E),
  /(?:الغاء|الغی|الغوا)\s*(?:ال)?اشتراک/, /بطل(?:وا)?\s*(?:رسائل|ترسلون|تدزون|تراسلونی|مراسلات)/,
  /(?:^|\s)(?:وقف|اوقف|وقفوا)\s*(?:ال)?(?:رسائل|مراسلات)/,
  /ما\s*(?:ارید|اریده|احتاج|ابی|ابغی)\s*(?:رسائل|مراسلات|رساله)/, /شیلو?(?:نی|ا\s*رقمی)\s*من/, /(?:^|\s)احذفو?نی/, /(?:کافی|بس)\s*(?:رسائل|ترسلون|تدزون)/,
  // English
  /\bunsubscribe\s+(?:me|us)\b/, /\bi\s+(?:want|would\s+like)\s+to\s+(?:unsubscribe|opt\s*-?\s*out)\b/, /\bopt\s*-?\s*(?:me|us)\s+out\b/,
  /\bstop\s+(?:messaging|texting|contacting|spamming|bothering|writing\s+to)\s+(?:me|us)\b/, /\bstop\s+(?:sending|send)\s+(?:me|us)\b/,
  /\b(?:do\s*n[o']?t|never)\s+(?:message|text|contact|write\s+to)\s+(?:me|us)\b/,
  /\b(?:do\s*n[o']?t|never)\s+send\s+me\s+(?:anything|any\s+(?:more\s+)?(?:messages|offers|texts)|messages|offers|texts)\b/,
  /\bno\s+more\s+(?:messages|texts|offers)\b/, /\bleave\s+me\s+alone\b/, /\b(?:remove|delete)\s+my\s+(?:number|contact)\b/,
  /\bremove\s+me\s+from\s+(?:your|the|this)\s+(?:list|contacts?)\b/, /\btake\s+me\s+off\s+(?:your|the|this)\s+list\b/];
// Stop words that only count when they ARE the whole message ("STOP", "stop please", "لغو", "توقف", "بطل").
const STOP_WORD = /^(?:stop|unsubscribe|optout|opt-out|quit|لغو|انصراف|استاپ|توقف|بطل|بطلوا|بسه)$/;
const FILLER = /^(?:please|pls|plz|thanks|thank|you|thx|ok|okay|now|it|this|sir|madam|all|لطفا|ممنون|مرسی|ممنونم|دیگه|دیگر|همین|الان|عزیزم|رجاء|رجاءا|شکرا|یا|اخی|حبیبی|خلاص|هسه|هسع|هلا)$/;
// Possible stop requests → automatic messages wait for the owner (the owner is never blocked by these).
//  - anywhere in an ordinary message: "please stop", "stop it", «متوقف کنید», «بس کن», «کافیه دیگه», «دیگه نفرستید»
const SOFT_ANY_LENGTH = [/\bplease\s+stop\b|\bstop\s+(?:please|it|this|that)\b/, /(?:متوقف|قطع)\s*(?:ش\s*)?(?:کنید|کنین|کن)/, /(?:^|\s)بس\s*(?:کن|کنید|کنین)(?=$|\s|[.!،])/,
  /کافیه\s*دیگه/, /(?:دیگه|دیگر)\s*(?:چیزی\s*)?(?:نفرستید|نفرستین|نفرست)/];
//  - in a short message (≤ 12 words) that is not a question and not about an order
const SOFT_SHORT = [new RegExp(B + "(?:لا|ما)\\s*" + AR_SEND),
  /(?<!\b(?:bus|non|one|pit|full)[\s-])\bstop\b(?!\s+(?:by|at|in|over|for))/, /\benough\b/, new RegExp(B + "(?:لغو|انصراف|استاپ|توقف|کافی|کافیه|بطل|بسه)" + E)];
const ORDER_CONTEXT = /\b(?:order|orders|production|delivery|shipment|payment|price)\b|سفارش|تولید|تحویل|پرداخت|قیمت|طلب|الطلب|طلبیه|البضاعه|التوصیل|الدفع|السعر/;
const QUESTION = /[?؟]/;
// In a technical text, a line whose SUBJECT is the bot/system ("the bot should stop messaging me") describes behaviour, not a request.
const DESCRIBES_SYSTEM = /\b(?:the\s+)?(?:bot|system|code|function|script|program|cron|worker)\s+(?:should|must|will|shall|needs?\s+to|has\s+to|can|keeps?)\b|(?:ربات|سیستم|برنامه|کد)\s*(?:باید|نباید|میتونه|می\s*تونه|بتونه|داره)|(?:البوت|النظام|البرنامج)\s*(?:لازم|یجب|راح|یلزم|کاعد|دا)/;
// Reported speech ("the customer wrote: …", «مشتری نوشته …», «العميل كتب …») quotes someone else: held for review, never a hard opt-out.
const REPORTED_SPEECH = /\b(?:customer|user|client|buyer|someone|he|she|they)\s+(?:said|wrote|says|writes|asked|told\s+(?:me|us))\b|(?:مشتری|کاربر|خریدار|یکی)\s*(?:نوشته|گفته|گفت|نوشت)|(?:العمیل|الزبون|المستخدم|واحد)\s*(?:کتب|قال|یقول|گال)/;

export function classifyOptOut(text) {
  const raw = String(text || ""); if (!raw.trim()) return { state: "none", reason: "empty" };
  const technical = isTechnicalText(raw); let prose = customerProse(raw, technical), quotedOnly = false;
  // the whole message was a quotation / inline code (e.g. "STOP" in quotes): judge it, but only as a possible request
  if (!/[\p{L}\p{N}]/u.test(prose)) { prose = normalizeOptOutText(raw).replace(/[`"“”«»]/g, " "); quotedOnly = true; }
  if (EXPLICIT.some(re => re.test(prose))) {
    if (quotedOnly) return { state: "review", reason: "quoted_stop_request" };
    // a line that IS the customer's request is a hard opt-out (any length, technical or not); a line that only reports someone
    // else's words, or (in a technical text) describes what a bot/system should do, is held for the owner's review
    const reqLines = prose.split("\n").filter(l => EXPLICIT.some(re => re.test(l)));
    const own = reqLines.filter(l => !REPORTED_SPEECH.test(l) && !(technical && DESCRIBES_SYSTEM.test(l)));
    if (own.length || !reqLines.length) return { state: "opt_out", reason: "explicit_request" };
    return { state: "review", reason: reqLines.some(l => REPORTED_SPEECH.test(l)) ? "reported_speech" : "explicit_phrase_describing_system" };
  }
  const words = prose.replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter(Boolean);
  const content = words.filter(w => !FILLER.test(w));
  if (content.length && content.length <= 3 && content.every(w => STOP_WORD.test(w))) return quotedOnly ? { state: "review", reason: "quoted_stop_request" } : { state: "opt_out", reason: "stop_command" };
  if (technical) return { state: "none", reason: "technical_text" };
  if (SOFT_ANY_LENGTH.some(re => re.test(prose))) return { state: "review", reason: "possible_stop_request" };
  if (words.length <= 12 && !QUESTION.test(prose) && !ORDER_CONTEXT.test(prose) && SOFT_SHORT.some(re => re.test(prose))) return { state: "review", reason: "possible_stop_request" };
  return { state: "none", reason: "no_stop_request" };
}
export function isOptOutMessage(text) { return classifyOptOut(text).state === "opt_out"; }

// The pre-21.1 rules, kept ONLY so that a result Production already applied (messages received before the rule-change boundary) is
// preserved until the owner records a review decision: a code change never silently lifts an opt-out.
const LEGACY_OPT_OUT = [
  /(?:^|[\s،,.!؟?])(?:لغو|انصراف|استاپ)(?:$|[\s،,.!؟?])/u,
  /(?:دیگه|دیگر)\s*(?:پیام|مسیج)\s*(?:نده|ندهید|ندید|ندین|نفرست|نفرستید|نفرستین|نزن|نزنید|نزنین)/u,
  /(?:پیام|مسیج)\s*(?:نده|ندهید|ندید|ندین|نفرستید|نفرستین|نفرست)(?:$|[\s،,.!؟?])/u, /مزاحم\s*(?:نشو|نشوید|نشین|نشید)/u,
  /(?:^|[\s،,.!؟?])(?:توقف|كافي)(?:$|[\s،,.!؟?])/u, /(?:لا|ما)\s*(?:ترسل|ترسلون|تدزون|تراسل|تراسلون)/u, /بطل(?:وا)?\s*(?:رسائل|ترسلون|تدزون)?/u, /الغاء\s*الاشتراك/u,
  /\b(?:stop|unsubscribe|opt[\s-]?out)\b/i];
export function legacyOptOutMatch(text) {
  const t = String(text || "").normalize("NFKC").replace(/[يى]/g, "ی").toLowerCase(), raw = String(text || "").normalize("NFKC").toLowerCase();
  return LEGACY_OPT_OUT.some(re => re.test(t) || re.test(raw));
}
// Opt-out state of ONE customer from their own inbound messages ({id,message,created_at}, newest first).
export function optOutStateFromMessages(rows = [], { cutoff = OPT_OUT_ALL_LEGACY } = {}) {
  let review = null;
  for (const r of rows) {
    const c = classifyOptOut(r.message), old = String(r.created_at || "") < cutoff;
    // (an older message that the new rules flag is only ever MORE protection; it is labelled so the owner can see it)
    if (c.state === "opt_out") return { opted_out: true, review: false, reason: c.reason, message_id: r.id || null, at: r.created_at || null, ...(old ? { new_rules_on_old_message: true } : {}) };
    if (old && legacyOptOutMatch(r.message))
      return { opted_out: true, review: true, legacy: true, reason: "earlier_classification_kept_until_owner_review", message_id: r.id || null, at: r.created_at || null };
    if (c.state === "review" && !review) review = { opted_out: false, review: true, reason: c.reason, message_id: r.id || null, at: r.created_at || null, ...(old ? { new_rules_on_old_message: true } : {}) };
  }
  return review || { opted_out: false, review: false };
}
