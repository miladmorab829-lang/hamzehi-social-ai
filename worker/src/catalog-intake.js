// Phase 22 — one reviewed step for adding a real product to the versioned catalog, instead of a dozen single JSON saves.
// A sheet holds one product: its attributes, configurations and prices per market, and at least one verified real photo.
// The catalog is LIVE: a product here is matched before the price list, and an approved price can be sent to a customer automatically.
// So preview never writes and shows the live effect, and apply needs the owner's confirmation and the hash of that exact preview.
// Nothing here invents data: placeholders are refused, a missing fact stays missing, and every write goes through saveKnowledgeVersion.
// Each save is live at once and apply is not one transaction, so preview must refuse everything a save would refuse: otherwise a sheet
// could stop halfway and leave a half-built product answering customers.
import { MARKET_CURRENCY, CURRENCY_RULES, canonicalCurrency } from "./autonomy-engine.js";

export const INTAKE_MAX_PRODUCTS = 5;
export const INTAKE_REQUIRED_ATTRIBUTES = Object.freeze(["size", "box_type", "lid_color", "base_color", "foam", "ribbon"]);
const SIZE_LWH = /^\d+(\.\d+)?x\d+(\.\d+)?x\d+(\.\d+)?$/;
const PLACEHOLDER = /<[^>]*>|\bTODO\b|\bTBD\b|\?\?|؟؟/i;

const issue = (field, code, message) => ({ field, code, message });
const sizeText = (v) => String(v ?? "").replace(/[×*]/g, "x").replace(/\s+/g, "");
const valueOf = (v) => (typeof v === "object" && v ? v.value : v);

export function priceText(currency, minor) {
  const code = canonicalCurrency(currency), rule = CURRENCY_RULES[code], amount = Number(minor);
  if (!rule || !Number.isSafeInteger(amount)) return null;
  const s = String(amount).padStart(rule.exponent + 1, "0");
  const whole = (rule.exponent ? s.slice(0, -rule.exponent) : s).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${whole}${rule.exponent ? "." + s.slice(-rule.exponent) : ""} ${code}`;
}

// Checks one sheet without any database access. Issues block; warnings are for the owner to read.
export function validateProductSheet(sheet, { normKey, normText, systemKeys = new Set() }) {
  const issues = [], warnings = [], s = sheet && typeof sheet === "object" ? sheet : {};
  if (PLACEHOLDER.test(JSON.stringify(s))) issues.push(issue("sheet", "placeholder", "جای‌خالی پر نشده است؛ فقط اطلاعات واقعی وارد کنید"));
  if (!String(s.product?.name || "").trim() || !normKey(s.product?.product_key || s.product?.name)) issues.push(issue("product.name", "required", "نام محصول لازم است"));
  if (s.product?.aliases !== undefined && !Array.isArray(s.product.aliases)) issues.push(issue("product.aliases", "format", "نام‌های دیگر باید فهرست باشد"));

  const attributes = Array.isArray(s.attributes) ? s.attributes : [], byKey = new Map();
  for (const a of attributes) {
    const key = normKey(a?.attribute_key || a?.label);
    if (!key) { issues.push(issue("attributes", "key_required", "هر ویژگی یک attribute_key لازم دارد")); continue; }
    if (byKey.has(key)) issues.push(issue(`attributes.${key}`, "duplicate", `ویژگی ${key} دو بار آمده است`));
    if (systemKeys.has(key)) issues.push(issue(`attributes.${key}`, "system_key", `${key} ویژگی محصول نیست`));
    if (a.priority !== undefined && !Number.isSafeInteger(Number(a.priority))) issues.push(issue(`attributes.${key}`, "priority", "priority باید عدد صحیح باشد"));
    const list = Array.isArray(a.allowed_values) ? a.allowed_values : [], values = list.map(v => normText(valueOf(v))).filter(Boolean);
    const accepted = new Set([...values, ...list.flatMap(v => (Array.isArray(v?.aliases) ? v.aliases : []).map(normText))]);
    const enumType = !["number", "text"].includes(a.value_type);
    if (enumType && !values.length) issues.push(issue(`attributes.${key}`, "no_values", `برای ${key} مقدار تأییدشده لازم است`));
    byKey.set(key, { ...a, key, values, accepted, enumType, critical: !(a.commercial_critical === false || a.commercial_critical === 0) });
  }
  for (const key of INTAKE_REQUIRED_ATTRIBUTES) {
    const a = byKey.get(key);
    if (!a) issues.push(issue(`attributes.${key}`, "required", `ویژگی ${key} وارد نشده است`));
  }
  for (const v of byKey.get("size")?.values || []) if (!SIZE_LWH.test(sizeText(v))) issues.push(issue("attributes.size", "size_format", `اندازه «${v}» باید طول×عرض×ارتفاع باشد، مثل 13x16x10`));

  for (const a of byKey.values()) if (a.critical && INTAKE_REQUIRED_ATTRIBUTES.includes(a.key) && a.key !== "size" && a.key !== "box_type")
    warnings.push(issue(`attributes.${a.key}`, "critical_question", `${a.key} قبل از اعلام قیمت از مشتری پرسیده می‌شود؛ فقط اگر قیمت را تغییر می‌دهد آن را قیمت‌ساز بگذارید`));
  const configurations = Array.isArray(s.configurations) ? s.configurations : [], configs = new Map(), identities = [];
  if (!configurations.length) issues.push(issue("configurations", "required", "حداقل یک پیکربندی لازم است"));
  for (const c of configurations) {
    const ref = String(c?.key || "").trim(), market = String(c?.market || "*").toUpperCase(), given = c?.attributes || {};
    if (!ref) { issues.push(issue("configurations", "key_required", "هر پیکربندی یک key لازم دارد")); continue; }
    if (configs.has(ref)) issues.push(issue(`configurations.${ref}`, "duplicate", "key تکراری است"));
    if (market !== "*" && !MARKET_CURRENCY[market]) issues.push(issue(`configurations.${ref}`, "market", "بازار باید IRAN یا ARAB یا * باشد"));
    configs.set(ref, market);
    const identity = [...byKey.values()].filter(a => a.critical).map(a => `${a.key}=${normText(given[a.key])}`).sort().join("|");
    if (identities.some(x => x.identity === identity && (x.market === market || x.market === "*" || market === "*"))) issues.push(issue(`configurations.${ref}`, "duplicate_config", "این پیکربندی با یکی دیگر یکی است؛ فقط ویژگی‌های قیمت‌ساز آن را متمایز می‌کنند"));
    identities.push({ identity, market });
    for (const a of byKey.values()) if (a.critical && (given[a.key] === undefined || given[a.key] === null || given[a.key] === ""))
      issues.push(issue(`configurations.${ref}.${a.key}`, "required", `پیکربندی باید ${a.key} را مشخص کند`));
    for (const [k, v] of Object.entries(given)) {
      const a = byKey.get(normKey(k));
      if (!a) issues.push(issue(`configurations.${ref}.${k}`, "unknown_attribute", `ویژگی ناشناخته: ${k}`));
      else if (!a.critical) issues.push(issue(`configurations.${ref}.${k}`, "not_price_attribute", `${a.key} قیمت‌ساز نیست و نباید در پیکربندی بیاید`));
      else if (a.enumType && !a.accepted.has(normText(v))) issues.push(issue(`configurations.${ref}.${k}`, "value_not_approved", `مقدار «${v}» در فهرست ${a.key} نیست`));
    }
  }

  const prices = Array.isArray(s.prices) ? s.prices : [], perConfig = new Map();
  if (!prices.length) issues.push(issue("prices", "required", "حداقل یک قیمت لازم است"));
  prices.forEach((p, i) => {
    const field = `prices[${i}]`, market = String(p?.market || "").toUpperCase(), required = MARKET_CURRENCY[market], ref = String(p?.config || "").trim();
    if (!required) { issues.push(issue(field, "market", "بازار باید IRAN یا ARAB باشد")); return; }
    if (!p.currency || canonicalCurrency(p.currency) !== required) issues.push(issue(field, "currency", `ارز ${market} باید ${required} باشد؛ قیمت هر بازار جدا وارد می‌شود و تبدیل نمی‌شود`));
    if (!configs.has(ref)) issues.push(issue(field, "config", `پیکربندی «${ref}» پیدا نشد`));
    else if (configs.get(ref) !== "*" && configs.get(ref) !== market) issues.push(issue(field, "config_market", `پیکربندی «${ref}» برای بازار ${market} نیست`));
    const minor = Number(p.unit_price_minor);
    if (!Number.isSafeInteger(minor) || minor < 1) issues.push(issue(field, "price", "قیمت باید عدد صحیح مثبت باشد (ایران: تومان، عراق: سنت)"));
    else if (market === "ARAB" && minor >= 100000) warnings.push(issue(field, "price_scale", `این یعنی ${priceText("USD", minor)}؛ قیمت عراق به سنت است`));
    else if (market === "IRAN" && minor < 1000) warnings.push(issue(field, "price_scale", `این یعنی ${priceText("TOMAN", minor)}؛ قیمت ایران به تومان است`));
    const min = p.quantity_min ?? 1, max = p.quantity_max ?? null;
    if (!Number.isSafeInteger(Number(min)) || Number(min) < 1 || (max !== null && (!Number.isSafeInteger(Number(max)) || Number(max) < Number(min)))) issues.push(issue(field, "quantity", "بازه‌ی تعداد نامعتبر است"));
    if (p.moq === undefined || p.moq === null || p.moq === "") warnings.push(issue(field, "moq_missing", "حداقل سفارش مشخص نشده است"));
    else if (!Number.isSafeInteger(Number(p.moq)) || Number(p.moq) < 1) issues.push(issue(field, "moq", "حداقل سفارش باید عدد صحیح مثبت باشد"));
    for (const d of ["effective_from", "effective_until"]) if (p[d] && !Number.isFinite(Date.parse(p[d]))) issues.push(issue(field, "date", `تاریخ ${d} نامعتبر است`));
    const k = `${market}|${ref}`; (perConfig.get(k) || perConfig.set(k, []).get(k)).push({ min: Number(min), max: max === null ? Infinity : Number(max), field });
  });
  for (const rows of perConfig.values()) {
    rows.sort((a, b) => a.min - b.min);
    for (let i = 1; i < rows.length; i++) if (rows[i].min <= rows[i - 1].max) issues.push(issue(rows[i].field, "tier_overlap", "بازه‌های تعداد روی هم افتاده‌اند"));
  }
  for (const market of Object.keys(MARKET_CURRENCY)) if (!prices.some(p => String(p?.market || "").toUpperCase() === market))
    warnings.push(issue("prices", "market_not_priced", `برای ${market} قیمتی وارد نشده است`));

  if (!(Array.isArray(s.photo_media_ids) && s.photo_media_ids.length)) issues.push(issue("photo_media_ids", "required", "حداقل یک عکس واقعی تأییدشده لازم است"));
  return { issues, warnings, sizes: (byKey.get("size")?.values || []).map(sizeText) };
}

async function checkPhotos(env, sheet, sizes, { first }) {
  const issues = [], warnings = [];
  for (const id of Array.isArray(sheet?.photo_media_ids) ? sheet.photo_media_ids : []) {
    const m = await first(env, `SELECT v.media_type,v.candidate_status,v.verified_real_product,v.generated_detected,g.size AS spec_size
      FROM visual_product_media v LEFT JOIN gallery_photo_specs g ON g.visual_media_id=v.id AND g.status='approved' WHERE v.id=? LIMIT 1`, String(id));
    const field = `photo_media_ids.${id}`;
    if (!m) { issues.push(issue(field, "photo_not_found", "این عکس در گالری نیست")); continue; }
    if (m.media_type !== "photo" || m.candidate_status !== "verified" || Number(m.verified_real_product) !== 1 || Number(m.generated_detected) !== 0)
      issues.push(issue(field, "photo_not_verified", "فقط عکس واقعی تأییدشده پذیرفته می‌شود؛ عکس ساخته‌شده با AI قبول نیست"));
    if (m.spec_size === null) issues.push(issue(field, "photo_no_spec", "این عکس کارت مشخصات تأییدشده ندارد"));
    else if (m.spec_size && !sizes.some(size => size === sizeText(m.spec_size) || size.startsWith(sizeText(m.spec_size) + "x")))
      issues.push(issue(field, "photo_size_mismatch", `اندازه‌ی عکس (${m.spec_size}) با اندازه‌های این محصول یکی نیست`));
  }
  return { issues, warnings };
}

// What applying would change for customers. Read only.
async function liveEffect(env, sheet, { first, all, normKey, normText }) {
  const name = String(sheet?.product?.name || "").trim(), key = normKey(sheet?.product?.product_key || name);
  const names = new Set([name, ...(Array.isArray(sheet?.product?.aliases) ? sheet.product.aliases : [])].map(normText).filter(Boolean));
  const out = [];
  for (const market of Object.keys(MARKET_CURRENCY)) {
    const rows = (await all(env, "SELECT product_name,unit_price_minor,currency FROM commercial_price_items WHERE market=? AND active=1", market))
      .filter(r => names.has(normText(String(r.product_name || "").split(" · ")[0])));
    const next = (Array.isArray(sheet?.prices) ? sheet.prices : []).filter(p => String(p?.market || "").toUpperCase() === market);
    const configCount = (Array.isArray(sheet?.configurations) ? sheet.configurations : []).filter(x => ["*", market].includes(String(x?.market || "*").toUpperCase())).length;
    const exactName = rows.some(r => normText(String(r.product_name || "").split(" · ")[0]) === normText(name));
    if (next.length) out.push({ market, overrides_price_list_rows: rows.length, uncovered_list_rows: Math.max(0, rows.length - configCount), list_fallback: exactName, current_list: rows.slice(0, 6).map(r => ({ product: r.product_name, price: priceText(r.currency, r.unit_price_minor) })),
      new_prices: next.map(p => ({ config: p.config, quantity_min: p.quantity_min ?? 1, quantity_max: p.quantity_max ?? null, moq: p.moq ?? null, price: priceText(p.currency, p.unit_price_minor) })) });
  }
  const existing = key ? await first(env, "SELECT version FROM product_catalog WHERE product_key=? AND status='current' LIMIT 1", key) : null;
  return { product_key: key, existing_version: existing?.version ?? null, markets: out };
}

// The hash an owner's approval is bound to: what will change and the live state it was shown against, so any later change makes it stale.
export async function ownerChangeHash(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}
const previewDigest = (sheets, products) => ownerChangeHash({ sheets, effects: products.map(p => p.live_effect) });

export async function previewProductSheets(env, sheets, tools) {
  if (!Array.isArray(sheets) || !sheets.length) throw Error("products must be a non-empty list");
  if (sheets.length > INTAKE_MAX_PRODUCTS) throw Error(`At most ${INTAKE_MAX_PRODUCTS} products per intake`);
  const tierPolicy = await tools.first(env, "SELECT id FROM business_settings WHERE setting_key='quantity_tier_policy' AND status='current' LIMIT 1");
  const products = [];
  for (const sheet of sheets) {
    const v = validateProductSheet(sheet, tools), photos = await checkPhotos(env, sheet, v.sizes, tools);
    const effect = await liveEffect(env, sheet, tools);
    const warnings = [...v.warnings, ...photos.warnings], prices = Array.isArray(sheet?.prices) ? sheet.prices : [];
    for (const m of effect.markets) {
      if (m.uncovered_list_rows) warnings.push(issue(`live_effect.${m.market}`, m.list_fallback ? "list_variants_uncovered" : "list_variants_lost", m.list_fallback
        ? `${m.uncovered_list_rows} مدل از Price List در ${m.market} در این برگه نیست؛ همان قیمت قدیمی می‌ماند`
        : `${m.uncovered_list_rows} مدل از Price List در ${m.market} پوشش داده نشده و نام یکی نیست: برای آن‌ها قیمت خودکار نمی‌آید و به مالک ارجاع می‌شود`));
    }
    if (effect.existing_version !== null) warnings.push(issue("product", "existing_product", "این محصول در کاتالوگ هست؛ پله‌ها و پیکربندی‌های قدیمی خودکار حذف نمی‌شوند"));
    const seen = new Set();
    for (const p of prices) { const k = `${p?.market}|${p?.config}`; if (seen.has(k) && !tierPolicy) warnings.push(issue("prices", "tier_policy_missing", "چند پله‌ی قیمت بدون سیاست پله‌ای: مشتری به مالک ارجاع می‌شود")); seen.add(k); }
    products.push({ name: String(sheet?.product?.name || ""), issues: [...v.issues, ...photos.issues], warnings, live_effect: effect });
  }
  const names = products.map(p => tools.normKey(p.name)).filter(Boolean);
  if (new Set(names).size !== names.length) products[0].issues.push(issue("products", "duplicate", "یک محصول دو بار آمده است"));
  return { ready: products.every(p => !p.issues.length), preview_hash: await previewDigest(sheets, products), products, writes: 0 };
}

export async function applyProductSheets(env, sheets, { confirm_owner_approved, preview_hash, actor }, tools) {
  if (confirm_owner_approved !== true) throw Error("confirm_owner_approved is required");
  const preview = await previewProductSheets(env, sheets, tools);
  if (!preview_hash || preview_hash !== preview.preview_hash) throw Error("This is not what was previewed, or live prices changed since; preview it again");
  if (!preview.ready) throw Error("The sheet has unresolved issues; preview it again");
  const save = (kind, input) => tools.saveKnowledgeVersion(env, kind, input, { actor, approval: { method: "catalog_intake", ref: preview_hash } }), applied = [];
  for (const sheet of sheets) {
    try {
      const product = await save("product", sheet.product), product_key = product.row.product_key, configKeys = new Map();
      for (const a of sheet.attributes) await save("attribute", { ...a, product_key, required: a.required !== false });
      for (const c of sheet.configurations) configKeys.set(String(c.key).trim(), (await save("configuration", { product_key, market: c.market || "*", attributes: c.attributes || {}, label: c.label })).row.config_key);
      for (const p of sheet.prices) await save("price", { ...p, product_key, config_key: configKeys.get(String(p.config).trim()) });
      applied.push({ product_key, attributes: sheet.attributes.length, configurations: sheet.configurations.length, prices: sheet.prices.length });
    } catch (error) {
      // Saves are live as they happen: the owner must know exactly where it stopped. Applying the same sheet again finishes it.
      return { ok: false, applied, failed_product: String(sheet.product?.name || ""), error: `Stopped part-way: ${String(error?.message || error)}. Fix it and apply again.`, preview_hash };
    }
  }
  return { ok: true, applied, preview_hash };
}
