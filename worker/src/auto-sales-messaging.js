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

// A customer's request to stop messages (Persian, Iraqi Arabic, English). Conservative: a match only stops automatic messages.
const OPT_OUT = [
  /(?:^|[\s،,.!؟?])(?:لغو|انصراف|استاپ)(?:$|[\s،,.!؟?])/u,
  /(?:دیگه|دیگر)\s*(?:پیام|مسیج)\s*(?:نده|ندهید|ندید|ندین|نفرست|نفرستید|نفرستین|نزن|نزنید|نزنین)/u,
  /(?:پیام|مسیج)\s*(?:نده|ندهید|ندید|ندین|نفرستید|نفرستین|نفرست)(?:$|[\s،,.!؟?])/u, /مزاحم\s*(?:نشو|نشوید|نشین|نشید)/u,
  /(?:^|[\s،,.!؟?])(?:توقف|كافي)(?:$|[\s،,.!؟?])/u, /(?:لا|ما)\s*(?:ترسل|ترسلون|تدزون|تراسل|تراسلون)/u, /بطل(?:وا)?\s*(?:رسائل|ترسلون|تدزون)?/u, /الغاء\s*الاشتراك/u,
  /\b(?:stop|unsubscribe|opt[\s-]?out)\b/i];
export function isOptOutMessage(text) {
  const t = String(text || "").normalize("NFKC").replace(/[يى]/g, "ی").toLowerCase();
  const raw = String(text || "").normalize("NFKC").toLowerCase();
  return OPT_OUT.some(re => re.test(t) || re.test(raw));
}
