// Phase 23 — the owner's review of a held total. One row per held reply: what was calculated, the owner alert and its delivery state.
// An alert only tells the owner a reply is waiting. It approves nothing, and nothing here sends anything to a customer.
// A destination problem (group missing / not private / bot removed) is retried at most MAX_DESTINATION_ATTEMPTS times with growing
// pauses, then parked as destination_failed_final for the Dashboard (no notification storm, no endless getChat calls).
const MAX_DESTINATION_ATTEMPTS = 6, STALE_SENDING_MS = 10 * 60 * 1000;
const MAX_ALERT_ATTEMPTS = 3, ALERT_RETRY_MS = 15 * 60 * 1000, ALERT_TIMEOUT_MS = 5000, UNRESOLVED_AFTER_MS = 24 * 3600 * 1000;
const WAITING = ["draft", "pending_approval"], APPROVED = ["approved", "sending", "sent", "delivered"];
const ALERT_DELIVERED = "sent";
const ready = new WeakSet();

export async function ensureFinalQuoteStore(env) {
  if (ready.has(env.DB)) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS final_quote_reviews (outreach_id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
    market TEXT, product TEXT, quantity INTEGER, reason TEXT NOT NULL, snapshot_json TEXT, alert_status TEXT NOT NULL DEFAULT 'pending', alert_attempts INTEGER NOT NULL DEFAULT 0,
    alert_error TEXT, next_attempt_at TEXT, alert_sent_at TEXT, stale_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`).run();
  ready.add(env.DB);
}

const parseSnapshot = row => { try { return JSON.parse(row?.snapshot_json || "null"); } catch { return null; } };
// The figures in a text, whatever digits and separators it uses, in order of size.
export function draftFigures(text) {
  const latin = String(text || "").replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/(?<=[0-9])[٬,](?=[0-9])/g, "");
  return (latin.match(/[0-9]+(?:\.[0-9]+)?/g) || []).sort();
}

export async function recordFinalQuoteReview(env, { outreach, row, quote, at }) {
  await ensureFinalQuoteStore(env);
  const snapshot = quote ? { ...quote, figures: draftFigures(outreach.message) } : { figures: draftFigures(outreach.message) };
  await env.DB.prepare(`INSERT OR IGNORE INTO final_quote_reviews(outreach_id,lead_id,conversation_id,market,product,quantity,reason,snapshot_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .bind(outreach.id, row.lead_id, row.conversation_id, quote?.market || null, quote?.product || null, Number.isSafeInteger(quote?.quantity) ? quote.quantity : null, quote?.reason || "total_in_reply", JSON.stringify(snapshot), at, at).run();
}

// A chat the owner configured, checked before anything is sent. Only a private group: never a private chat (a chat with this bot is a
// customer's), a channel, a media vault or a group linked to a customer, and Telegram must confirm a group with no public name. getChat
// only reads. Any doubt means no alert. (Group messages are stored unlinked, so an unlinked row alone is no customer.)
export async function ownerAlertDestination(env, { check = true } = {}) {
  const id = String(env.OWNER_TELEGRAM_CHAT_ID || "").trim();
  if (!id) return { ok: false, reason: "destination_missing" };
  if (/^[1-9][0-9]{4,15}$/.test(id)) return { ok: false, reason: "destination_not_group" };
  if (!/^-[1-9][0-9]{4,15}$/.test(id)) return { ok: false, reason: "destination_invalid" };
  const system = [env.TELEGRAM_CHAT_ID, env.TELEGRAM_VAULT_CHAT_ID, env.TELEGRAM_VIDEO_VAULT_CHAT_ID, env.TELEGRAM_MEDIA_READY_CHAT_ID].map(x => String(x || "").trim());
  if (system.includes(id)) return { ok: false, reason: "destination_is_system_chat" };
  try {
    const customer = await env.DB.prepare("SELECT 1 x FROM inbox_messages WHERE lead_id IS NOT NULL AND provider_conversation_id=? LIMIT 1").bind(id).first();
    if (customer) return { ok: false, reason: "destination_is_customer_chat" };
    const vault = await env.DB.prepare("SELECT 1 x FROM telegram_media_sources WHERE chat_id=? LIMIT 1").bind(id).first();
    if (vault) return { ok: false, reason: "destination_is_system_chat" };
  } catch { return { ok: false, reason: "destination_unverified" }; }
  if (!check) return { ok: true, id };
  if (!env.TELEGRAM_BOT_TOKEN) return { ok: false, reason: "destination_unverified" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getChat`, { method: "POST", signal: AbortSignal.timeout(ALERT_TIMEOUT_MS), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: id }) });
    const chat = (await r.json().catch(() => null))?.result;
    const fits = ["group", "supergroup"].includes(chat?.type) && !chat?.username && !chat?.active_usernames?.length;
    return fits ? { ok: true, id } : { ok: false, reason: "destination_unverified" };
  } catch { return { ok: false, reason: "destination_unverified" }; }
}

// Reference only: no customer name, contact, message text or amount.
function alertText(r) {
  const market = r.market === "IRAN" ? "ایران" : r.market === "ARAB" ? "عراق" : "نامشخص";
  const reason = r.reason === "discounted_total" ? "جمع با تخفیف" : r.reason === "quantity_total" ? "جمع سفارش" : "مبلغ در پاسخ";
  return ["🔔 پاسخ قیمت منتظر تأیید شماست", `CRM: ${String(r.lead_id).slice(0, 8)}`, `بازار: ${market}`, `محصول: ${r.product || "نامشخص"}`, `تعداد: ${r.quantity ?? "نامشخص"}`, `دلیل: ${reason}`, `بررسی: داشبورد، بخش FINAL QUOTES، شناسه ${String(r.outreach_id).slice(0, 8)}`, "این پیام تأیید تجاری نیست و چیزی برای مشتری ارسال نکرده است."].join("\n");
}

// One alert per held reply. The row is claimed first, so two runs can never both send. A Telegram refusal may be retried a bounded number
// of times; a timeout has an unknown outcome and is never repeated.
export async function notifyFinalQuoteOwner(env, outreachId) {
  await ensureFinalQuoteStore(env);
  const row = await env.DB.prepare("SELECT r.*,o.status outreach_status FROM final_quote_reviews r LEFT JOIN lead_outreach o ON o.id=r.outreach_id WHERE r.outreach_id=? LIMIT 1").bind(outreachId).first();
  if (!row || !(["pending", "failed"].includes(row.alert_status) || String(row.alert_status).startsWith("destination_"))) return { sent: false, reason: "not_due" };
  const t = new Date().toISOString(), set = (status, extra = {}) => env.DB.prepare("UPDATE final_quote_reviews SET alert_status=?,alert_error=?,next_attempt_at=?,alert_sent_at=COALESCE(?,alert_sent_at),updated_at=? WHERE outreach_id=?").bind(status, extra.error || null, extra.next || null, extra.sent || null, t, outreachId).run();
  if (!WAITING.includes(row.outreach_status)) { await set("closed"); return { sent: false, reason: "not_waiting" }; }
  const dest = await ownerAlertDestination(env);
  if (!dest.ok) { await set(dest.reason); return { sent: false, reason: dest.reason }; }
  const claimed = await env.DB.prepare("UPDATE final_quote_reviews SET alert_status='sending',alert_attempts=alert_attempts+1,updated_at=? WHERE outreach_id=? AND alert_status=?").bind(t, outreachId, row.alert_status).run();
  if (!Number(claimed?.meta?.changes)) return { sent: false, reason: "already_claimed" };
  const attempts = Number(row.alert_attempts || 0) + 1;
  let response;
  try { response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: "POST", signal: AbortSignal.timeout(ALERT_TIMEOUT_MS), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: dest.id, text: alertText(row) }) }); }
  catch { await set("outcome_unknown", { error: "no_response" }); return { sent: false, reason: "outcome_unknown" }; }
  if (response.ok) { await set(ALERT_DELIVERED, { sent: t }); return { sent: true }; }
  const retry = (response.status === 429 || response.status >= 500) && attempts < MAX_ALERT_ATTEMPTS;
  await set(retry ? "failed" : "failed_final", { error: "telegram_http_" + response.status, next: retry ? new Date(Date.now() + ALERT_RETRY_MS * attempts).toISOString() : null });
  return { sent: false, reason: "telegram_http_" + response.status };
}

// Cron: only alerts that are due and still waiting. A delivered, unknown or finally failed alert is never touched, so no run repeats one.
export async function retryFinalQuoteAlerts(env, { limit = 5 } = {}) {
  await ensureFinalQuoteStore(env);
  const t = new Date().toISOString();
  const due = (await env.DB.prepare(`SELECT r.outreach_id FROM final_quote_reviews r JOIN lead_outreach o ON o.id=r.outreach_id WHERE o.status IN ('draft','pending_approval') AND ((r.alert_status='failed' AND r.next_attempt_at<=?) OR r.alert_status LIKE 'destination_%') ORDER BY r.created_at LIMIT ?`).bind(t, limit).all()).results || [];
  if (!due.length) return { due: 0, sent: 0 };
  // no destination yet: nothing to try, and the state on the dashboard already says so
  if (!(await ownerAlertDestination(env, { check: false })).ok) return { due: due.length, sent: 0 };
  let sent = 0;
  for (const x of due) if ((await notifyFinalQuoteOwner(env, x.outreach_id)).sent) sent++;
  return { due: due.length, sent };
}

// The figures behind a held reply must still be the approved ones when the owner approves or sends it. Never updated: a changed price makes
// the reply stale, and the owner rejects it. A held reply with no review row cannot be checked, so it is refused.
export async function finalQuoteFreshness(env, outreachId, { discountRule }) {
  await ensureFinalQuoteStore(env);
  const row = await env.DB.prepare("SELECT * FROM final_quote_reviews WHERE outreach_id=? LIMIT 1").bind(outreachId).first();
  if (!row) {
    const held = await env.DB.prepare("SELECT 1 x FROM lead_outreach WHERE id=? AND error_detail='final_quote_owner_approval' LIMIT 1").bind(outreachId).first();
    return held ? { current: false, reason: "final_quote_review_missing" } : { current: true };
  }
  const q = parseSnapshot(row), p = q?.price;
  const stale = async reason => { await env.DB.prepare("UPDATE final_quote_reviews SET stale_reason=?,updated_at=? WHERE outreach_id=?").bind(reason, new Date().toISOString(), outreachId).run(); return { current: false, reason: "final_quote_" + reason }; };
  if (!p) return stale("price_unverifiable");
  if (p.price_item) {
    const item = await env.DB.prepare("SELECT unit_price_minor,currency,version,active,effective_until FROM commercial_price_items WHERE id=? LIMIT 1").bind(p.price_item.id).first();
    if (!item || Number(item.active) !== 1 || (item.effective_until && item.effective_until <= new Date().toISOString())) return stale("price_retired");
    if (Number(item.version) !== Number(p.price_item.version) || Number(item.unit_price_minor) !== Number(p.unit_price_minor) || item.currency !== p.currency) return stale("price_changed");
  } else if (p.price_version) {
    const version = await env.DB.prepare("SELECT status FROM price_versions WHERE id=? LIMIT 1").bind(p.price_version.id).first();
    if (version?.status !== "current") return stale("price_changed");
  } else return stale("price_unverifiable");
  const rule = await discountRule(row.market), key = r => r ? [r.type, Number(r.value), r.min_quantity ?? null, r.id ?? null, r.version ?? null].join("|") : "";
  if (key(rule) !== key(q.rule)) return stale("discount_changed");
  return { current: true };
}

// An owner may reword a held reply, not change its figures: the order after acceptance is built on the calculated offer.
export async function finalQuoteEditAllowed(env, outreachId, message) {
  await ensureFinalQuoteStore(env);
  const row = await env.DB.prepare("SELECT snapshot_json FROM final_quote_reviews WHERE outreach_id=? LIMIT 1").bind(outreachId).first();
  if (!row) return true;
  return draftFigures(message).join("|") === (parseSnapshot(row)?.figures || []).join("|");
}

// A held reply of this lead still waiting for the owner.
export async function finalQuoteWaiting(env, leadId) {
  await ensureFinalQuoteStore(env);
  return !!(await env.DB.prepare("SELECT 1 x FROM final_quote_reviews r JOIN lead_outreach o ON o.id=r.outreach_id WHERE r.lead_id=? AND o.status IN ('draft','pending_approval','approved') LIMIT 1").bind(leadId).first());
}

// Owner dashboard: only held replies created by this gate (older drafts have no row here).
export async function listFinalQuotes(env, { limit = 100, verify = false } = {}) {
  await ensureFinalQuoteStore(env);
  const rows = (await env.DB.prepare(`SELECT r.outreach_id,r.lead_id,r.market,r.product,r.quantity,r.reason,r.snapshot_json,r.alert_status,r.alert_error,r.alert_attempts,r.alert_sent_at,r.stale_reason,r.created_at,o.status outreach_status FROM final_quote_reviews r LEFT JOIN lead_outreach o ON o.id=r.outreach_id ORDER BY r.created_at DESC LIMIT ?`).bind(limit).all()).results || [];
  const nowMs = Date.now();
  const items = rows.map(({ snapshot_json, ...r }) => {
    const p = parseSnapshot({ snapshot_json })?.price, waiting = WAITING.includes(r.outreach_status);
    const state = APPROVED.includes(r.outreach_status) ? "approved" : r.outreach_status === "rejected" ? "rejected" : !waiting || r.stale_reason || nowMs - Date.parse(r.created_at) > UNRESOLVED_AFTER_MS ? "unresolved" : "pending";
    return { ...r, state, currency: p?.currency || null, total_minor: p?.total ?? p?.total_minor ?? null, alert_delivered: r.alert_status === ALERT_DELIVERED };
  });
  const count = s => items.filter(x => x.state === s).length;
  const open = items.filter(x => ["pending", "unresolved"].includes(x.state));
  // a held reply that never got a review row cannot be approved; it must still be visible. Older rows beyond the page are counted too.
  const missing = Number((await env.DB.prepare("SELECT COUNT(*) n FROM lead_outreach o WHERE o.error_detail='final_quote_owner_approval' AND o.status IN ('draft','pending_approval') AND NOT EXISTS(SELECT 1 FROM final_quote_reviews r WHERE r.outreach_id=o.id)").first())?.n || 0);
  const total = Number((await env.DB.prepare("SELECT COUNT(*) n FROM final_quote_reviews").first())?.n || 0);
  // verify: the panel asks Telegram (getChat reads only); the approval counters do not
  const destination = await ownerAlertDestination(env, { check: verify });
  return { items, summary: { pending: count("pending"), approved: count("approved"), unresolved: count("unresolved"), rejected: count("rejected"), alerts_not_delivered: open.filter(x => !x.alert_delivered).length, missing_review: missing, not_listed: Math.max(0, total - items.length) }, owner_alert: { configured: destination.ok, reason: destination.reason || null } };
}

// ---- Owner escalation alerts (owner directive 2026-11-08). An escalation (a price exception, a payment claim, an order the owner must
// authorize, …) tells the owner group that a decision waits. One row per escalation, claimed before sending, so it is sent at most once;
// the same destination guard as above; reference only (no customer name, contact, message text or amount). It decides and sends nothing
// for the customer; a failure is recorded and the Dashboard stays the fallback.
const escalationReady = new WeakSet();
export async function ensureEscalationAlertStore(env) {
  if (escalationReady.has(env.DB)) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS owner_escalation_alerts (escalation_id TEXT PRIMARY KEY, lead_id TEXT, reason_code TEXT,
    alert_status TEXT NOT NULL DEFAULT 'pending', alert_attempts INTEGER NOT NULL DEFAULT 0, alert_error TEXT, next_attempt_at TEXT, alert_sent_at TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`).run();
  // the owner-facing details (customer, order, authoritative amounts, payment status, required action), fixed when the alert is created
  try { await env.DB.prepare("ALTER TABLE owner_escalation_alerts ADD COLUMN details_text TEXT").run(); } catch { /* already there */ }
  escalationReady.add(env.DB);
}
const ESCALATION_LABELS = { unsupported_price: "قیمت خارج از لیست تأییدشده", unusual_commercial_terms: "شرایط تجاری خاص", unclear_moq: "کمتر از حداقل سفارش",
  missing_business_knowledge: "اطلاعات تجاری ناقص", conflicting_business_knowledge: "اطلاعات تجاری متناقض", unauthorized_discount: "تخفیف خارج از قاعده",
  unusual_customization: "سفارشی‌سازی خاص", uncertain_production_capability: "امکان تولید", uncertain_production_time: "زمان تولید", uncertain_shipping: "ارسال",
  ambiguous_customer_identity: "هویت نامشخص مشتری", low_confidence_commercial_interpretation: "پیام تجاری نامشخص", unsupported_factual_claim: "پاسخ نیازمند بررسی",
  payment_claim: "ادعای پرداخت (تأیید واریز با شما)", payment_terms: "شرایط پرداخت", order_authorization: "مشتری پیشنهاد را پذیرفت (تأیید نهایی سفارش با شما)" };
// Alert keys that are a case of their own (no owner_escalations row): a payment claim and an accepted order awaiting authorization.
const OWN_CASE_KEY = /^(?:payment:|order-approval:)/;
function escalationAlertText(r) {
  // Owner directive 2026-11-08: the private owner group gets what it needs to act (built from stored records, never guessed).
  if (r.details_text) return ["🔔 اقدام مالک لازم است: " + (ESCALATION_LABELS[r.reason_code] || "تصمیم مالک"), String(r.details_text).slice(0, 3200),
    `داشبورد: بخش تأییدیه‌ها، شناسه ${String(r.escalation_id).replace(/^(?:owner-escalation-|payment:|order-approval:)/, "").slice(0, 8)}`, "این پیام تأیید نیست و چیزی برای مشتری ارسال نکرده است."].join("\n");
  return ["🔔 یک تصمیم منتظر شماست", `CRM: ${String(r.lead_id || "").slice(0, 8)}`, `موضوع: ${ESCALATION_LABELS[r.reason_code] || "تصمیم مالک"}`,
    `بررسی: داشبورد، بخش تأییدیه‌ها، شناسه ${String(r.escalation_id).replace(/^(?:owner-escalation-|payment:)/, "").slice(0, 8)}`, "این پیام تأیید نیست و چیزی برای مشتری ارسال نکرده است."].join("\n");
}
export async function recordEscalationAlert(env, { escalation_id, lead_id, reason_code, at, details = null }) {
  await ensureEscalationAlertStore(env);
  // INSERT OR IGNORE: one alert per case and stage — a repeated message about the same case never alerts again.
  const r = await env.DB.prepare("INSERT OR IGNORE INTO owner_escalation_alerts(escalation_id,lead_id,reason_code,details_text,created_at,updated_at) VALUES(?,?,?,?,?,?)").bind(escalation_id, lead_id || null, reason_code || null, details ? String(details).slice(0, 3200) : null, at, at).run();
  return { created: Number(r?.meta?.changes || 0) > 0 };
}
export async function notifyEscalationOwner(env, escalationId) {
  await ensureEscalationAlertStore(env);
  const row = await env.DB.prepare("SELECT a.*,e.status escalation_status FROM owner_escalation_alerts a LEFT JOIN owner_escalations e ON e.id=a.escalation_id WHERE a.escalation_id=? LIMIT 1").bind(escalationId).first();
  if (!row || !(["pending", "failed"].includes(row.alert_status) || String(row.alert_status).startsWith("destination_"))) return { sent: false, reason: "not_due" };
  const t = new Date().toISOString(), set = (status, extra = {}) => env.DB.prepare("UPDATE owner_escalation_alerts SET alert_status=?,alert_error=?,next_attempt_at=?,alert_sent_at=COALESCE(?,alert_sent_at),updated_at=? WHERE escalation_id=?").bind(status, extra.error || null, extra.next || null, extra.sent || null, t, escalationId).run();
  if (!OWN_CASE_KEY.test(String(escalationId)) && row.escalation_status !== "open") { await set("closed"); return { sent: false, reason: "not_open" }; }
  const dest = await ownerAlertDestination(env);
  if (!dest.ok) {
    const tries = Number(row.alert_attempts || 0) + 1, final = tries >= MAX_DESTINATION_ATTEMPTS;
    await env.DB.prepare("UPDATE owner_escalation_alerts SET alert_status=?,alert_error=?,alert_attempts=?,next_attempt_at=?,updated_at=? WHERE escalation_id=?").bind(final ? "destination_failed_final" : dest.reason, dest.reason, tries, final ? null : new Date(Date.now() + ALERT_RETRY_MS * tries).toISOString(), t, escalationId).run();
    return { sent: false, reason: dest.reason };
  }
  const claimed = await env.DB.prepare("UPDATE owner_escalation_alerts SET alert_status='sending',alert_attempts=alert_attempts+1,updated_at=? WHERE escalation_id=? AND alert_status=?").bind(t, escalationId, row.alert_status).run();
  if (!Number(claimed?.meta?.changes)) return { sent: false, reason: "already_claimed" };
  const attempts = Number(row.alert_attempts || 0) + 1;
  let response;
  try { response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: "POST", signal: AbortSignal.timeout(ALERT_TIMEOUT_MS), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: dest.id, text: escalationAlertText(row) }) }); }
  catch { await set("outcome_unknown", { error: "no_response" }); return { sent: false, reason: "outcome_unknown" }; }
  if (response.ok) { await set(ALERT_DELIVERED, { sent: t }); return { sent: true }; }
  // A 5xx may come after Telegram already delivered the message: ambiguous → outcome_unknown for the owner, never resent.
  if (response.status >= 500) { await set("outcome_unknown", { error: "telegram_http_" + response.status }); return { sent: false, reason: "outcome_unknown" }; }
  const retry = response.status === 429 && attempts < MAX_ALERT_ATTEMPTS;
  await set(retry ? "failed" : "failed_final", { error: "telegram_http_" + response.status, next: retry ? new Date(Date.now() + ALERT_RETRY_MS * attempts).toISOString() : null });
  return { sent: false, reason: "telegram_http_" + response.status };
}
// Cron: due escalation alerts of escalations still open. Delivered, unknown or finally failed alerts are never repeated.
export async function retryEscalationAlerts(env, { limit = 5 } = {}) {
  await ensureEscalationAlertStore(env);
  const t = new Date().toISOString();
  // (payment claims and accepted orders are their own case: retried the same bounded way; delivered / unknown / final never repeat)
  // A send that never finished (the Worker stopped after claiming it) is ambiguous: marked outcome_unknown for the owner, never resent.
  await env.DB.prepare("UPDATE owner_escalation_alerts SET alert_status='outcome_unknown',alert_error='send_not_completed',updated_at=? WHERE alert_status='sending' AND updated_at<?").bind(t, new Date(Date.now() - STALE_SENDING_MS).toISOString()).run();
  const due = (await env.DB.prepare(`SELECT a.escalation_id FROM owner_escalation_alerts a LEFT JOIN owner_escalations e ON e.id=a.escalation_id WHERE (e.status='open' OR a.escalation_id LIKE 'payment:%' OR a.escalation_id LIKE 'order-approval:%') AND (a.alert_status='failed' OR (a.alert_status LIKE 'destination_%' AND a.alert_status<>'destination_failed_final')) AND (a.next_attempt_at IS NULL OR a.next_attempt_at<=?) ORDER BY a.created_at LIMIT ?`).bind(t, limit).all()).results || [];
  if (!due.length) return { due: 0, sent: 0 };
  // Group unusable: no Telegram call per alert; each due alert just counts one attempt and is parked after MAX_DESTINATION_ATTEMPTS.
  const dest = await ownerAlertDestination(env, { check: false });
  if (!dest.ok) {
    for (const x of due) await env.DB.prepare("UPDATE owner_escalation_alerts SET alert_attempts=alert_attempts+1,alert_status=CASE WHEN alert_attempts+1>=? THEN 'destination_failed_final' ELSE ? END,alert_error=?,next_attempt_at=CASE WHEN alert_attempts+1>=? THEN NULL ELSE ? END,updated_at=? WHERE escalation_id=? AND alert_status NOT IN ('sent','sending','outcome_unknown','failed_final','destination_failed_final')").bind(MAX_DESTINATION_ATTEMPTS, dest.reason, dest.reason, MAX_DESTINATION_ATTEMPTS, new Date(Date.now() + ALERT_RETRY_MS).toISOString(), t, x.escalation_id).run();
    return { due: due.length, sent: 0, destination: dest.reason };
  }
  let sent = 0;
  for (const x of due) if ((await notifyEscalationOwner(env, x.escalation_id)).sent) sent++;
  return { due: due.length, sent };
}

// Owner-only Dashboard fallback: every owner alert that did not (certainly) reach the owner group, newest first. Read-only.
export async function listUndeliveredOwnerAlerts(env, { limit = 100 } = {}) {
  await ensureEscalationAlertStore(env);
  const rows = (await env.DB.prepare(`SELECT escalation_id,lead_id,reason_code,alert_status,alert_attempts,alert_error,next_attempt_at,created_at,updated_at FROM owner_escalation_alerts WHERE alert_status<>? ORDER BY created_at DESC LIMIT ?`).bind(ALERT_DELIVERED, Math.min(500, Math.max(1, limit))).all()).results || [];
  const by = {};for (const r of rows) by[r.alert_status] = (by[r.alert_status] || 0) + 1;
  return { items: rows, summary: { not_delivered: rows.length, by_status: by } };
}
