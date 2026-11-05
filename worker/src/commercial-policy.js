// Phase 23 — the owner-approved MOQ and discount policy, in one place. Pure: no database, no network, no customer text.
// It decides the MOQ of a line and adds up its amounts; prices still come only from the approved rows passed in.
// Identity is matched against verified names only: a historical or unknown label is never mapped to a model, it goes to the owner.
// A quantity is never counted across sizes, and each line gets at most one discount rule.
import { MARKET_CURRENCY, canonicalCurrency } from "./autonomy-engine.js";

export const COMMERCIAL_POLICY_VERSION = "phase23.1";

const key = v => String(v ?? "").normalize("NFKC").replace(/[ً-ْـ]/g, "").replace(/‌/g, "").replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[×*]/g, "x").replace(/\s+/g, " ").trim();
const keys = list => new Set(list.map(key));

export const IRAN_MOQ = Object.freeze({ standard: 300, half_service: 100, full_service: 100, bag_drawer: 500 });
export const ARAB_MOQ = Object.freeze({ standard: 500 });

// نیم ست is not نیم سرویس: every owner list keeps them as separate products of different sizes, and nothing verifies the three نیم ست
// sizes as half-service, so they are standard. سرویس and سرویس 20x20 are both the one 20x20 size.
const IRAN_CLASS = new Map([
  ...["انگشتر کوچک", "انگشتر بزرگ", "آویز", "دستبند کشیده", "ساعتی بالشت‌دار", "نیم ست کوچک", "نیم ست بزرگ", "نیم ست مربع"].map(n => [key(n), "standard"]),
  ...["نیم سرویس", "نیم‌سرویس"].map(n => [key(n), "half_service"]),
  ...["سرویس", "سرویس 20x20"].map(n => [key(n), "full_service"])
]);
const IRAN_CONFIGURATIONS = keys(["2 تکه", "3 تکه", "3 تکه کج", "کشویی کج", "کشویی روبان‌دار", "کشویی بگ‌دار"]);
const IRAN_BAG_DRAWER = key("کشویی بگ‌دار");
// The owner confirmed these are not real approved models. They are never mapped to another model.
const UNVERIFIED_CONFIGURATIONS = keys(["کشویی یک‌دار", "کشویی بازدار"]);

const ARAB_PRODUCTS = keys(["علبة خاتم صغيرة", "علبة خاتم كبيرة", "علبة ساعة", "علبة سوار طويلة", "علبة طقم مجوهرات 20×20", "علبة قلادة", "علبة نصف طقم صغيرة", "علبة نصف طقم كبيرة", "علبة نصف طقم مجوهرات", "علبة نصف طقم مربعة"]);
const ARAB_CONFIGURATIONS = keys(["قطعتين", "ثلاث قطع", "ثلاث قطع مائلة", "جرّارة مائلة", "جرّارة مع شريط", "جرّارة مع كيس"]);

export const isUnverifiedConfiguration = c => UNVERIFIED_CONFIGURATIONS.has(key(c));
// «أقل من 500» / «کمتر از ۳۰۰» names a limit, not a quantity: taken as a quantity it would equal the MOQ and pass.
const LESS_THAN = /(?:[أا]قل|[أا]دن[ىي])\s+من\s+[0-9۰-۹٠-٩]|کمتر\s+از\s+[0-9۰-۹٠-٩]|زیر\s+[0-9۰-۹٠-٩]|less\s+than\s+[0-9]|under\s+[0-9]/iu;
export const statesLessThanQuantity = text => LESS_THAN.test(String(text ?? "").normalize("NFKC"));
export const marketStandardMoq = market => (market === "IRAN" ? IRAN_MOQ : market === "ARAB" ? ARAB_MOQ : {}).standard ?? null;

// The Iran rule is the owner's own: 10% from 1,000 units of the same size. An approved discount_rule setting replaces it, never adds to it.
export function commercialDefaultDiscount(market) {
  return market === "IRAN" ? { type: "percent_bp", value: 1000, min_quantity: 1000, scope: "same_size", id: `policy:${COMMERCIAL_POLICY_VERSION}:iran-discount`, version: 1 } : null;
}

const review = (reason, extra = {}) => ({ status: "review", moq: null, rule: null, review_reason: reason, ...extra });

// The MOQ of one line. An MOQ on the approved price row is the owner's explicit value; identity is still checked first.
export function moqPolicy({ market, product, configuration, rowMoq = null }) {
  if (!MARKET_CURRENCY[market]) return review("market_unknown");
  if (isUnverifiedConfiguration(configuration)) return review("model_identity_unverified");
  const explicit = Number(rowMoq);
  if (Number.isSafeInteger(explicit) && explicit > 0) return { status: "ok", moq: explicit, rule: "price_row" };
  const p = key(product), c = key(configuration);
  if (market === "ARAB") return ARAB_PRODUCTS.has(p) && ARAB_CONFIGURATIONS.has(c) ? { status: "ok", moq: ARAB_MOQ.standard, rule: "standard" } : review("model_unknown");
  if (!IRAN_CONFIGURATIONS.has(c)) return review("model_unknown");
  if (!IRAN_CLASS.has(p)) return review("model_unknown");
  if (c === IRAN_BAG_DRAWER) return { status: "ok", moq: IRAN_MOQ.bag_drawer, rule: "bag_drawer" };   // overrides every size class
  const cls = IRAN_CLASS.get(p);
  return { status: "ok", moq: IRAN_MOQ[cls], rule: cls };
}

function discountFor(rule, subtotal, lineQuantity, sizeQuantity) {
  if (!rule || !(Number(rule.value) > 0) || subtotal === null) return null;
  const counted = rule.scope === "same_size" ? sizeQuantity : lineQuantity;
  if (rule.min_quantity && counted < rule.min_quantity) return null;
  const amount = rule.type === "percent_bp" ? Math.floor(subtotal * rule.value / 10000) : rule.value;
  return { type: rule.type, value: rule.value, amount_minor: Math.min(amount, subtotal), rule_id: rule.id, rule_version: rule.version };
}

// Evaluates the lines of one deal. Quantities add up only inside one size (bag-drawer lines count apart for their own MOQ);
// a line with no known size is never added to another line.
export function evaluateOrderLines(lines, { discountRule = null } = {}) {
  const rows = lines.map((line, i) => {
    const q = Number.isSafeInteger(line.quantity) && line.quantity > 0 ? line.quantity : null;
    return { line, q, sizeKey: line.size ? `size:${key(line.size)}` : `line:${i}`, policy: moqPolicy({ market: line.market, product: line.product, configuration: line.configuration, rowMoq: line.row_moq }) };
  });
  const totals = new Map(), add = (k, q) => totals.set(k, (totals.get(k) || 0) + (q || 0)), moqKey = r => `${r.sizeKey}|${r.policy.rule === "bag_drawer" ? "bag" : "other"}`;
  for (const r of rows) { add(r.sizeKey, r.q); add(moqKey(r), r.q); }
  return rows.map(r => {
    const { line, q, policy } = r, unit = Number(line.unit_price_minor);
    const base = { moq: policy.moq, moq_rule: policy.rule, quantity: q, size_quantity: q === null ? null : totals.get(r.sizeKey) };
    if (canonicalCurrency(line.currency) !== MARKET_CURRENCY[line.market]) return { ...base, status: "currency_conflict" };
    if (policy.status === "review") return { ...base, status: "owner_review", review_reason: policy.review_reason };
    if (q !== null && policy.moq && totals.get(moqKey(r)) < policy.moq) return { ...base, status: "under_moq" };
    const subtotal = q === null ? null : unit * q;
    if (subtotal !== null && !Number.isSafeInteger(subtotal)) return { ...base, status: "overflow" };
    const discount = discountFor(discountRule, subtotal, q, base.size_quantity);
    return { ...base, status: "priced", unit_price_minor: unit, subtotal_minor: subtotal, discount, total_minor: subtotal === null ? null : subtotal - (discount?.amount_minor || 0) };
  });
}
