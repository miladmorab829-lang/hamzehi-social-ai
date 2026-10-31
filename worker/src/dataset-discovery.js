// Phase 18.4 — independent jewelry-business discovery from open datasets (Overture Maps Places for IRAN and IRAQ, OpenStreetMap for
// IRAN only; Phase 18.3 pilot). OFF unless DATASET_DISCOVERY="on" AND a candidate store (R2-compatible DISCOVERY_BUCKET) is bound.
//
// Evidence rules (on top of lead-qualification.js):
//  - A candidate is only a POINTER to a business website. Its name, city, phones, socials and emails are dataset CLAIMS, stored apart
//    (meta.dataset_claims, trusted:false) and never used as identity or contact evidence; they are never written to lead_contacts.
//  - Identity comes from the business's OWN fetched website (existing own-site enrichment + the Phase 18.1 ladder). The dataset name and
//    city are used only when the website confirms the name; otherwise the website's business name is kept and the city must appear on the
//    website itself.
//  - Google: no Google field is accepted; a candidate whose domain already belongs to ANY existing lead (Google-origin, Telegram
//    customer, earlier discovery) is skipped — existing CRM records are never merged into or modified.
//  - No AI call, no paid request, no outbound message, no approval row.
import { ADS_TARGET_CITIES, adsNormalizeText } from "./ads-markets.js";
import { independentWebsiteHost, informationSite } from "./lead-qualification.js";

export const DISCOVERY_SCHEMA = "hamzehi.discovery.candidates/1";
// Approved source strategy (Phase 18.3): IRAQ OSM disabled (2% own-site coverage), Brave not used, Google never used.
export const DISCOVERY_SOURCES = Object.freeze({ IRAN: Object.freeze(["overture", "osm"]), ARAB: Object.freeze(["overture"]) });
export const DATASET_LICENSES = Object.freeze({ overture: ["CDLA-Permissive-2.0", "Apache-2.0", "CC0-1.0"], osm: ["ODbL-1.0"] });
// Dashboard attribution text — prepared for owner approval, not shown anywhere yet.
export const DATASET_ATTRIBUTION = Object.freeze({
  en: "Business discovery data: Overture Maps Foundation (overturemaps.org) — Data from Meta, Microsoft and other Overture sources (CDLA Permissive 2.0); Foursquare data © 2024 Foursquare Labs, Inc. (Apache 2.0, transformed to the Overture schema). © OpenStreetMap contributors (ODbL 1.0), Iran only.",
  fa: "داده‌های کشف کسب‌وکار: Overture Maps Foundation (داده از Meta، Microsoft و سایر منابع Overture، مجوز CDLA Permissive 2.0؛ داده Foursquare © 2024 Foursquare Labs, Inc.، Apache 2.0) و © مشارکت‌کنندگان OpenStreetMap (ODbL 1.0)، فقط ایران."
});
const GOOGLE_TEXT = /google|goo\.gl|g\.page|googleusercontent|maps\.app/i;
const clampInt = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.floor(n))) : d; };

export function discoverySettings(env = {}) {
  return {
    enabled: env.DATASET_DISCOVERY === "on" && !!env.DISCOVERY_BUCKET,
    flag: env.DATASET_DISCOVERY === "on", store_bound: !!env.DISCOVERY_BUCKET,
    key: String(env.DATASET_DISCOVERY_KEY || "discovery/candidates-latest.json").slice(0, 200),
    ingest_per_run: { IRAN: clampInt(env.DATASET_DISCOVERY_IRAN_PER_RUN, 3, 0, 20), ARAB: clampInt(env.DATASET_DISCOVERY_ARAB_PER_RUN, 3, 0, 20) },
    daily_cap: { IRAN: clampInt(env.DATASET_DISCOVERY_IRAN_DAILY_CAP, 40, 0, 200), ARAB: clampInt(env.DATASET_DISCOVERY_ARAB_DAILY_CAP, 40, 0, 200) },
    verify_per_run: clampInt(env.DATASET_DISCOVERY_VERIFY_PER_RUN, 2, 1, 6),
    max_file_bytes: 5_000_000, max_candidates: 5000, fail_limit: 2
  };
}

// One candidate record → normalized candidate, or a rejection reason. Pure; shared with the local extractor (scripts/discovery).
export function validateCandidate(c) {
  if (!c || typeof c !== "object") return { ok: false, reason: "invalid" };
  const market = c.market === "IRAN" || c.market === "ARAB" ? c.market : null;
  if (!market) return { ok: false, reason: "market_not_allowed" };
  const dataset = c.dataset === "overture" || c.dataset === "osm" ? c.dataset : null;
  if (!dataset) return { ok: false, reason: "unknown_dataset" };
  if (!DISCOVERY_SOURCES[market].includes(dataset)) return { ok: false, reason: "source_disabled_for_market" };
  if (!c.record_id || typeof c.record_id !== "string") return { ok: false, reason: "missing_record_id" };
  if (!c.license || !DATASET_LICENSES[dataset].includes(c.license)) return { ok: false, reason: "missing_or_unknown_license" };
  // Google isolation: no place id, no Google provider/dataset, no Google URL anywhere in the record.
  if (c.place_id || /^google/i.test(String(c.provider || "")) || (c.source_datasets || []).some(s => /google/i.test(String(s)))
    || [...(c.websites || []), ...(c.socials || [])].some(u => GOOGLE_TEXT.test(String(u)))) return { ok: false, reason: "google_origin" };
  const site = (c.websites || []).map(u => ({ u: String(u).trim(), h: independentWebsiteHost(u) })).find(x => x.h);
  if (!site) return { ok: false, reason: "no_own_website" };
  if ((market === "ARAB" && /\.ir$/i.test(site.h)) || (market === "IRAN" && /\.iq$/i.test(site.h))) return { ok: false, reason: "wrong_market_domain" };
  const url = /^https?:\/\//i.test(site.u) ? site.u : "https://" + site.u;
  try { const p = new URL(url); if (!/^https?:$/.test(p.protocol)) return { ok: false, reason: "bad_url" }; } catch { return { ok: false, reason: "bad_url" }; }
  const s = v => String(v || "").replace(/\s+/g, " ").trim();
  return { ok: true, candidate: { market, dataset, record_id: s(c.record_id).slice(0, 120), license: c.license, source_datasets: (c.source_datasets || []).map(x => s(x).slice(0, 40)).slice(0, 8),
    name: s(c.name).slice(0, 160), city: s(c.city).slice(0, 80) || null, url: url.slice(0, 300), host: site.h, category: s(c.category).slice(0, 60) || null,
    phones: (c.phones || []).map(s).filter(Boolean).slice(0, 5), socials: (c.socials || []).map(s).filter(Boolean).slice(0, 5), emails: (c.emails || []).map(s).filter(Boolean).slice(0, 5),
    confidence: Number.isFinite(Number(c.confidence)) ? Number(c.confidence) : null } };
}

export function validateCandidateFile(doc, settings = discoverySettings({})) {
  if (!doc || doc.schema !== DISCOVERY_SCHEMA) return { ok: false, reason: "schema" };
  if (!doc.release || typeof doc.release !== "string") return { ok: false, reason: "release" };
  const list = Array.isArray(doc.candidates) ? doc.candidates.slice(0, settings.max_candidates) : [];
  const rejected = {}, candidates = [];
  for (const c of list) { const v = validateCandidate(c); if (v.ok) candidates.push(v.candidate); else rejected[v.reason] = (rejected[v.reason] || 0) + 1; }
  return { ok: true, release: String(doc.release).slice(0, 40), candidates, rejected, truncated: (doc.candidates || []).length > list.length };
}

// ---- business-name consistency (dataset name vs. the website itself)
const fold = s => adsNormalizeText(String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "")).replace(/[ئؤ]/g, "و").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
// Generic trade words, legal forms and city names never prove that two names are the same business.
const GENERIC = new Set(["طلا", "طلای", "طلاجات", "طلافروشی", "زرگری", "زرگر", "جواهر", "جواهری", "جواهرات", "جواهرفروشی", "گالری", "فروشگاه", "شرکت", "تولیدی", "کارگاه", "و",
  "مجوهرات", "ذهب", "صياغة", "صائغ", "شركة", "محل", "معرض", "ورشة", "للذهب", "والمجوهرات", "ومجوهرات", "والذهب", "وذهب", "تجارة", "من", "في", "مصوغات", "سبائك",
  "gold", "jewelry", "jewellery", "jewelers", "jewellers", "jewels", "jewel", "gallery", "galleria", "shop", "store", "co", "company", "group", "the", "and", "of", "official", "website", "home", "online"]
  .map(w => fold(w)).flatMap(w => [w, w.replace(/^ال/, "")]));
const CITY_WORDS = new Set(Object.values(ADS_TARGET_CITIES).flat(2).map(fold).flatMap(x => x.split(" ")));
export function nameTokens(name) {
  return [...new Set(fold(name).split(" ").map(t => t.replace(/^ال(?=\S{3,})/, "")).filter(t => t.length >= 3 && !GENERIC.has(t) && !CITY_WORDS.has(t) && !/^\d+$/.test(t)))];
}
// Consistent when a distinctive token of the dataset name appears in the site's title, host or opening text (Latin tokens also in the host).
export function nameConsistency(datasetName, { title = "", text = "", host = "" } = {}) {
  const tokens = nameTokens(datasetName);
  const hay = " " + fold(title + " " + String(text).slice(0, 600)) + " ", h = String(host).toLowerCase().replace(/[^a-z0-9]/g, "");
  const matched = tokens.filter(t => hay.includes(" " + t + " ") || hay.includes(" ال" + t + " ") || (/^[a-z0-9]+$/.test(t) && t.length >= 4 && h.includes(t)));
  return { consistent: matched.length > 0, matched, dataset_tokens: tokens };
}
// Canonical target city for a free-text value (dataset locality or page text), restricted to the market's own list.
export function resolveMarketCity(value, market) {
  const v = " " + fold(value) + " ";
  for (const names of ADS_TARGET_CITIES[market] || []) if (names.some(n => { const f = fold(n); return f && v.includes(" " + f + " "); })) return names[0];
  return null;
}
const OTHER_MARKET_PHONE = { IRAN: /(\+|00)964[\s-]?7\d{2}|(^|\D)07[3-9]\d[\s-]?\d{3}[\s-]?\d{4}/, ARAB: /(\+|00)98[\s-]?(9\d{2}|[1-8]\d)/ };
const OWN_MARKET_PHONE = { IRAN: /(\+|00)98[\s-]?(9\d{2}|[1-8]\d)|(^|\D)0(9\d{2}|[1-8]\d)[\s-]?\d{3,4}[\s-]?\d{4}|[۰-۹]{10,}/, ARAB: /(\+|00)964[\s-]?7\d{2}|(^|\D)07[3-9]\d[\s-]?\d{3}[\s-]?\d{4}/ };
const JEWELRY = /طلا|زرگر|جواهر|مجوهرات|ذهب|صياغ|صائغ|مصوغات|سبائك|gold|jewel|diamond|الماس|ألماس|سکه/i;

// The website check for one dataset lead. Input: the lead's notes and the fetched page; output: notes patch + optional rejection.
export function verifyDatasetSite(meta = {}, page = {}, at = new Date().toISOString()) {
  const market = meta.target_market === "ARAB" ? "ARAB" : "IRAN", claims = meta.dataset_claims || {};
  const title = String(page.title || "").replace(/\s+/g, " ").trim().slice(0, 160), text = String(page.text || "").replace(/\s+/g, " ").trim();
  const base = { checked_at: at, final_host: page.host || null };
  if (informationSite({ name: title })) return { rejected_reason: "information_site", patch: { dataset_verification: { ...base, result: "information_site" } } };
  if (!JEWELRY.test(title + " " + text.slice(0, 4000))) return { rejected_reason: "unrelated_website", patch: { dataset_verification: { ...base, result: "unrelated_website" } } };
  const own = OWN_MARKET_PHONE[market].test(text), other = OTHER_MARKET_PHONE[market].test(text), ownTld = market === "IRAN" ? /\.ir$/i.test(page.host || "") : /\.iq$/i.test(page.host || "");
  if (other && !own && !ownTld) return { rejected_reason: "wrong_market", patch: { dataset_verification: { ...base, result: "wrong_market" } } };
  const nc = nameConsistency(claims.name, { title, text, host: page.host });
  const datasetCity = nc.consistent ? resolveMarketCity(claims.city, market) : null, pageCity = resolveMarketCity(title + " " + text.slice(0, 6000), market);
  const city = datasetCity || pageCity;
  const name = nc.consistent && claims.name ? claims.name : (title.split(/\s[|–\-:—]\s|&#8211;/)[0] || title).trim().slice(0, 140) || claims.name || "";
  return { rejected_reason: null, name, patch: {
    evidence: (title + " " + text).slice(0, 1500), city: city || null,
    qualification: { ...(meta.qualification || {}), local_domain: ownTld, local_phone: own, buyer_in_title: JEWELRY.test(title) || undefined },
    dataset_verification: { ...base, result: "verified_site", name_consistent: nc.consistent, matched_tokens: nc.matched.slice(0, 5), dataset_claims_trusted: nc.consistent,
      city_source: datasetCity ? "dataset_confirmed_by_name" : pageCity ? "website" : null } } };
}

// Read the candidate file from an R2-compatible store ({get(key) → {text()}|null}); bounded size.
export async function readCandidateFile(store, settings) {
  if (!store?.get) return { ok: false, reason: "no_store" };
  const obj = await store.get(settings.key); if (!obj) return { ok: false, reason: "no_candidate_file" };
  if (Number(obj.size || 0) > settings.max_file_bytes) return { ok: false, reason: "file_too_large" };
  const raw = await obj.text(); if (raw.length > settings.max_file_bytes) return { ok: false, reason: "file_too_large" };
  let doc; try { doc = JSON.parse(raw); } catch { return { ok: false, reason: "invalid_json" }; }
  return validateCandidateFile(doc, settings);
}

// Bounded, resumable ingestion: a cursor per release and a per-market daily cap in system_kv. Each new candidate becomes ONE new lead
// (stage discovered) — a domain already known to any lead is skipped, never merged. helpers: {upsert, identities} from index.js.
export async function ingestDatasetCandidates(env, { settings = discoverySettings(env), store = env.DISCOVERY_BUCKET, helpers, now = () => new Date().toISOString() } = {}) {
  if (env.DATASET_DISCOVERY !== "on") return { ok: true, skipped: true, reason: "disabled" };
  if (!store?.get) return { ok: true, skipped: true, reason: "no_store" };
  const file = await readCandidateFile(store, settings); if (!file.ok) return { ok: false, reason: file.reason };
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS system_kv (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)").run();
  const kv = async k => (await env.DB.prepare("SELECT value FROM system_kv WHERE key=?").bind(k).first())?.value;
  const put = (k, v) => env.DB.prepare("INSERT INTO system_kv(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(k, String(v), now()).run();
  const day = now().slice(0, 10), out = { ok: true, release: file.release, total: file.candidates.length, created: { IRAN: 0, ARAB: 0 }, cursor: {}, done: {}, skipped: {}, rejected_in_file: file.rejected };
  const skip = r => { out.skipped[r] = (out.skipped[r] || 0) + 1; };
  // One cursor per market and release, so a market at its limit never holds the other back and a restart resumes where it stopped.
  for (const market of ["IRAN", "ARAB"]) {
    const list = file.candidates.filter(c => c.market === market), cursorKey = `dataset_discovery:cursor:${file.release}:${market}`, dayKey = `dataset_discovery:day:${day}:${market}`;
    let cursor = Number(await kv(cursorKey) || 0); const used = Number(await kv(dayKey) || 0);
    const full = () => out.created[market] >= settings.ingest_per_run[market] || used + out.created[market] >= settings.daily_cap[market];
    while (cursor < list.length && !full()) {
    const c = list[cursor];
    cursor++;
    const meta = { source: c.dataset === "overture" ? "overture_places" : "osm", provider: "dataset", url: c.url, website: c.url, target_market: c.market,
      type: c.market === "ARAB" ? "gold_ar" : "gold_fa", discovered_at: now(), updated_by: "dataset_discovery",
      dataset_record: { dataset: c.dataset, record_id: c.record_id, release: file.release, license: c.license, sources: c.source_datasets, attribution: c.dataset === "osm" ? "© OpenStreetMap contributors (ODbL 1.0)" : "Overture Maps Foundation" },
      dataset_claims: { name: c.name, city: c.city, phones: c.phones, socials: c.socials, emails: c.emails, category: c.category, confidence: c.confidence, trusted: false } };
    const ids = helpers.identities({ meta: { url: c.url } }).filter(x => x.identity_type === "domain");
    if (!ids.length) { skip("no_domain_identity"); continue; }
    const known = await env.DB.prepare(`SELECT lead_id FROM lead_identities WHERE identity_key IN (${ids.map(() => "?").join(",")}) LIMIT 1`).bind(...ids.map(x => x.identity_key)).first().catch(() => null);
    if (known) { skip("identity_exists"); continue; }
    const saved = await helpers.upsert(env, { name: c.name || c.host, contact: c.url, stage: "discovered", priority: "low", source: "dataset_discovery", meta });
    if (saved?.conflict) { skip("identity_conflict"); continue; }
    if (saved?.created) out.created[c.market]++; else skip("not_created");
    }
    await put(cursorKey, cursor);
    if (out.created[market]) await put(dayKey, used + out.created[market]);
    out.cursor[market] = cursor; out.done[market] = cursor >= list.length;
  }
  return out;
}
