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
// Phase 18.21: owner approval of the attribution text. The release gate (phase18_21) refuses a configuration with
// DATASET_DISCOVERY="on" while this is false. Set it to true only together with the owner-approved text (PHASE-18-16 §B2).
// Kept separate from DATASET_ATTRIBUTION so extractor output (which embeds that object) stays byte-reproducible.
// Approved by the owner on 2026-11-01 (instruction: apply the prepared Overture / Foursquare / OSM attribution, PHASE-18-16 §B2).
export const DATASET_ATTRIBUTION_APPROVED = true;
// Dashboard attribution text (the sales-intelligence "data sources" card shows it whenever dataset leads exist).
export const DATASET_ATTRIBUTION = Object.freeze({
  en: "Business discovery data: Overture Maps Foundation (overturemaps.org), Places theme, release 2026-10-21.0. Data from Meta and Microsoft, available under CDLA Permissive 2.0 (cdla.dev/permissive-2-0). Data from AllThePlaces, available under CC0 1.0. Copyright 2024 Foursquare Labs, Inc. All rights reserved. Available under Apache 2.0 (apache.org/licenses/LICENSE-2.0). Foursquare data was transformed to the Overture schema. Notice: https://opensource.foursquare.com/places-notice-txt/ Iran only: © OpenStreetMap contributors (https://www.openstreetmap.org/copyright), available under the Open Database License (ODbL 1.0). Business names and contact details are verified on each business's own website before use.",
  fa: "داده‌های کشف کسب‌وکار: بنیاد Overture Maps (overturemaps.org)، بخش Places، نسخه 2026-10-21.0. داده از Meta و Microsoft تحت مجوز CDLA Permissive 2.0. داده از AllThePlaces تحت مجوز CC0 1.0. Copyright 2024 Foursquare Labs, Inc. All rights reserved. تحت مجوز Apache 2.0. داده Foursquare به ساختار Overture تبدیل شده است. اطلاعیه: https://opensource.foursquare.com/places-notice-txt/ فقط ایران: © OpenStreetMap contributors (https://www.openstreetmap.org/copyright)، تحت مجوز Open Database License (ODbL 1.0). نام و اطلاعات تماس هر کسب‌وکار پیش از استفاده در وب‌سایت خود آن کسب‌وکار تأیید می‌شود."
});
const GOOGLE_TEXT = /google|goo\.gl|g\.page|googleusercontent|maps\.app/i;
const clampInt = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.floor(n))) : d; };

export function discoverySettings(env = {}) {
  const ingest_per_run = { IRAN: clampInt(env.DATASET_DISCOVERY_IRAN_PER_RUN, 3, 0, 20), ARAB: clampInt(env.DATASET_DISCOVERY_ARAB_PER_RUN, 3, 0, 20) };
  const daily_cap = { IRAN: clampInt(env.DATASET_DISCOVERY_IRAN_DAILY_CAP, 40, 0, 200), ARAB: clampInt(env.DATASET_DISCOVERY_ARAB_DAILY_CAP, 40, 0, 200) };
  return {
    enabled: env.DATASET_DISCOVERY === "on" && !!env.DISCOVERY_BUCKET,
    flag: env.DATASET_DISCOVERY === "on", store_bound: !!env.DISCOVERY_BUCKET,
    key: String(env.DATASET_DISCOVERY_KEY || "discovery/candidates-latest.json").slice(0, 200),
    ingest_per_run, daily_cap,
    // Phase 18.17: a market with a per-run OR daily limit of 0 is DISABLED as a whole — no imports AND no website checks of its
    // already-imported dataset leads (e.g. switching to Iraq-only after Iran leads exist stops all fetching of Iranian sites).
    markets: { IRAN: ingest_per_run.IRAN > 0 && daily_cap.IRAN > 0, ARAB: ingest_per_run.ARAB > 0 && daily_cap.ARAB > 0 },
    verify_per_run: clampInt(env.DATASET_DISCOVERY_VERIFY_PER_RUN, 2, 1, 6),
    max_file_bytes: 5_000_000, max_candidates: 5000, fail_limit: 2
  };
}

// One candidate record → normalized candidate, or a rejection reason. Pure; shared with the local extractor (scripts/discovery).
export function validateCandidate(c) {
  if (!c || typeof c !== "object") return { ok: false, reason: "invalid" };
  // Phase 18.11: list fields are read defensively (a scalar or null in a hand-made file is refused or ignored, never thrown).
  const L = v => Array.isArray(v) ? v : [];
  const market = c.market === "IRAN" || c.market === "ARAB" ? c.market : null;
  if (!market) return { ok: false, reason: "market_not_allowed" };
  const dataset = c.dataset === "overture" || c.dataset === "osm" ? c.dataset : null;
  if (!dataset) return { ok: false, reason: "unknown_dataset" };
  if (!DISCOVERY_SOURCES[market].includes(dataset)) return { ok: false, reason: "source_disabled_for_market" };
  if (!c.record_id || typeof c.record_id !== "string") return { ok: false, reason: "missing_record_id" };
  if (!c.license || !DATASET_LICENSES[dataset].includes(c.license)) return { ok: false, reason: "missing_or_unknown_license" };
  // Google isolation: no place id, no Google provider/dataset, no Google URL anywhere in the record.
  // Phase 18.5: a Google place-ID string anywhere in the record (ChIJ…/GhIJ…/EhIJ… forms) is Google origin too.
  if (c.place_id || /^google/i.test(String(c.provider || "")) || L(c.source_datasets).some(s => /google/i.test(String(s))) || /\b[CGE]hIJ[\w-]{10,}/.test(JSON.stringify(c))
    || [...L(c.websites), ...L(c.socials)].some(u => GOOGLE_TEXT.test(String(u)))) return { ok: false, reason: "google_origin" };
  const site = L(c.websites).map(u => ({ u: String(u).trim(), h: independentWebsiteHost(u) })).find(x => x.h);
  if (!site) return { ok: false, reason: "no_own_website" };
  // Phase 18.13: a real registrable host — at least two DNS labels, letters/digits/hyphens only, an alphabetic or punycode TLD. Pilot
  // data held social handles typed as websites ("http://@shop_gold", "https://https//www.instagram.com/x") that parsed as hosts.
  const labels = site.h.split(".");
  if (labels.length < 2 || !labels.every(l => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(l)) || !/^(?:[a-z]{2,24}|xn--[a-z0-9-]{2,59})$/.test(labels[labels.length - 1]))
    return { ok: false, reason: "invalid_website_host" };
  if ((market === "ARAB" && /\.ir$/i.test(site.h)) || (market === "IRAN" && /\.iq$/i.test(site.h))) return { ok: false, reason: "wrong_market_domain" };
  const url = /^https?:\/\//i.test(site.u) ? site.u : "https://" + site.u;
  try { const p = new URL(url); if (!/^https?:$/.test(p.protocol)) return { ok: false, reason: "bad_url" }; } catch { return { ok: false, reason: "bad_url" }; }
  const s = v => String(v || "").replace(/\s+/g, " ").trim();
  return { ok: true, candidate: { market, dataset, record_id: s(c.record_id).slice(0, 120), license: c.license, source_datasets: L(c.source_datasets).map(x => s(x).slice(0, 40)).slice(0, 8),
    name: s(c.name).slice(0, 160), city: s(c.city).slice(0, 80) || null, url: url.slice(0, 300), host: site.h, category: s(c.category).slice(0, 60) || null,
    phones: L(c.phones).map(s).filter(Boolean).slice(0, 5), socials: L(c.socials).map(s).filter(Boolean).slice(0, 5), emails: L(c.emails).map(s).filter(Boolean).slice(0, 5),
    confidence: Number.isFinite(Number(c.confidence)) ? Number(c.confidence) : null } };
}

// Phase 18.5: release ids are Overture-style "YYYY-MM-DD.N" (same rule as the extractor); a file over the record limit is refused, never
// truncated; valid records are put in a deterministic order (market, dataset, record id), so the cursor never depends on file order.
export const RELEASE_ID = /^\d{4}-\d{2}-\d{2}\.\d{1,3}$/;
export function validateCandidateFile(doc, settings = discoverySettings({})) {
  if (!doc || typeof doc !== "object" || doc.schema !== DISCOVERY_SCHEMA) return { ok: false, reason: "schema" };
  if (typeof doc.release !== "string" || !RELEASE_ID.test(doc.release)) return { ok: false, reason: "release" };
  if (!Array.isArray(doc.candidates)) return { ok: false, reason: "candidates_missing" };
  if (doc.candidates.length > settings.max_candidates) return { ok: false, reason: "too_many_candidates" };
  const rejected = {}, candidates = [], seen = new Set();
  for (const c of doc.candidates) {
    const v = validateCandidate(c); if (!v.ok) { rejected[v.reason] = (rejected[v.reason] || 0) + 1; continue; }
    const key = v.candidate.market + "|" + v.candidate.dataset + "|" + v.candidate.record_id;
    if (seen.has(key)) { rejected.duplicate_record = (rejected.duplicate_record || 0) + 1; continue; }
    seen.add(key); candidates.push(v.candidate);
  }
  candidates.sort((a, b) => (a.market + "|" + a.dataset + "|" + a.record_id) < (b.market + "|" + b.dataset + "|" + b.record_id) ? -1 : 1);
  return { ok: true, release: doc.release, candidates, rejected };
}
const sha256Hex = async text => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, "0")).join("");
// SHA-256 of the canonical (sorted, validated) candidate list — identifies the CONTENT of a release.
export async function candidateDigest(candidates) {
  return sha256Hex(JSON.stringify(candidates.map(c => [c.market, c.dataset, c.record_id, c.url, c.name, c.city])));
}
// Phase 18.11: file integrity seal — SHA-256 of the serialized raw candidate list, written by the extractor (content_sha256).
export async function candidatesContentHash(candidates) { return sha256Hex(JSON.stringify(candidates || [])); }
// Persian (۰-۹) and Arabic-Indic (٠-٩) digits → ASCII, so Iranian and Iraqi pages are read the same way as Latin-digit pages.
export const latinDigits = s => String(s || "").replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));

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
// Phase 18.11: + صاغة (Iraqi goldsmiths) and زیورآلات/زيورآلات (Persian jewellery), both common on own-site titles.
const JEWELRY = /طلا|زرگر|جواهر|مجوهرات|ذهب|صياغ|صائغ|صاغة|مصوغات|سبائك|زیورآلات|زيورآلات|gold|jewel|diamond|الماس|ألماس|سکه/i;

// The website check for one dataset lead. Input: the lead's notes and the fetched page; output: notes patch + optional rejection.
export function verifyDatasetSite(meta = {}, page = {}, at = new Date().toISOString()) {
  const market = meta.target_market === "ARAB" ? "ARAB" : "IRAN", claims = meta.dataset_claims || {};
  // Phase 18.11: page digits normalized first — Iraqi sites often write 07xx numbers in Arabic-Indic digits, Iranian ones in Persian.
  const title = String(page.title || "").replace(/\s+/g, " ").trim().slice(0, 160), text = latinDigits(page.text).replace(/\s+/g, " ").trim();
  // Phase 18.5 provenance: the exact page that served as identity evidence, and the basis of the decision.
  const base = { checked_at: at, final_host: page.host || null, evidence_url: page.url || null, identity_basis: "own_website_page" };
  if (informationSite({ name: title })) return { rejected_reason: "information_site", patch: { dataset_verification: { ...base, result: "information_site" } } };
  if (!JEWELRY.test(title + " " + text.slice(0, 4000))) return { rejected_reason: "unrelated_website", patch: { dataset_verification: { ...base, result: "unrelated_website" } } };
  const own = OWN_MARKET_PHONE[market].test(text), other = OTHER_MARKET_PHONE[market].test(text), ownTld = market === "IRAN" ? /\.ir$/i.test(page.host || "") : /\.iq$/i.test(page.host || "");
  if (other && !own && !ownTld) return { rejected_reason: "wrong_market", patch: { dataset_verification: { ...base, result: "wrong_market" } } };
  const nc = nameConsistency(claims.name, { title, text, host: page.host });
  // Phase 18.28 (P1): a trading-name difference is confirmed by a PHONE instead — the dataset's phone must be published on THIS site
  // (so never cross-domain), be a valid own-market number, and nothing may contradict the link (a non-webmail dataset e-mail on another
  // domain = conflated record; a different city named by the page). The website's own name is kept; only the record↔site link is trusted.
  const link = nc.consistent ? null : phoneCorroboration(claims, { text, host: page.host, market });
  const confirmed = nc.consistent || !!link;
  const pageCity = resolveMarketCity(title + " " + text.slice(0, 6000), market);
  const datasetCity = confirmed ? resolveMarketCity(claims.city, market) : null;
  const city = nc.consistent ? (datasetCity || pageCity) : (pageCity || datasetCity);
  const name = nc.consistent && claims.name ? claims.name : (title.split(/\s[|–\-:—]\s|&#8211;/)[0] || title).trim().slice(0, 140) || claims.name || "";
  return { rejected_reason: null, name, patch: {
    evidence: (title + " " + text).slice(0, 1500), city: city || null,
    qualification: { ...(meta.qualification || {}), local_domain: ownTld, local_phone: own, buyer_in_title: JEWELRY.test(title) || undefined },
    dataset_verification: { ...base, result: "verified_site", name_consistent: nc.consistent, matched_tokens: nc.matched.slice(0, 5), dataset_claims_trusted: confirmed,
      identity_link: nc.consistent ? "name_match" : link ? "phone_match" : null, ...(link ? { matched_phone: link.phone, link_checked_at: at } : {}),
      ...(!nc.consistent && !link && (claims.phones || []).length ? { phone_link_refused: phoneCorroboration(claims, { text, host: page.host, market, explain: true }).reason } : {}),
      city_source: city && city === datasetCity && (nc.consistent || !pageCity) ? (nc.consistent ? "dataset_confirmed_by_name" : "dataset_confirmed_by_phone") : pageCity ? "website" : null } } };
}

// Phase 18.28 (P1) helpers. National significant number: IRAQ mobiles 7XXXXXXXXX; IRAN 10-digit numbers (mobile 9…, landline 1–8…).
const WEBMAIL = /(^|\.)(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|aol|mail|ymail|protonmail|yandex|msn)\.[a-z.]+$/i;
export function nationalPhone(value, market) {
  let d = latinDigits(value).replace(/\D/g, "");
  if (market === "ARAB") { d = d.replace(/^(00)?964/, "").replace(/^0/, ""); return /^7\d{9}$/.test(d) ? d : null; }
  d = d.replace(/^(00)?98/, "").replace(/^0/, ""); return /^[1-9]\d{9}$/.test(d) ? d : null;
}
export function phoneCorroboration(claims = {}, { text = "", host = "", market = "ARAB", explain = false } = {}) {
  const no = reason => explain ? { reason } : null;
  const wanted = [...new Set((Array.isArray(claims.phones) ? claims.phones : []).map(p => nationalPhone(p, market)).filter(Boolean))];
  if (!wanted.length) return no("no_valid_dataset_phone");
  // phone tokens on the page (digits with spaces/dashes/dots, optional +/00 prefix), normalized the same way
  const onPage = new Set((latinDigits(text).match(/(?:\+|00)?\d[\d\s.\-()]{7,18}\d/g) || []).map(t => nationalPhone(t, market)).filter(Boolean));
  const hit = wanted.find(p => onPage.has(p));
  if (!hit) return no("dataset_phone_not_on_site");
  const h = String(host || "").toLowerCase().replace(/^www\./, "");
  const foreignMail = (Array.isArray(claims.emails) ? claims.emails : []).map(e => String(e).split("@")[1]?.toLowerCase().trim()).filter(Boolean)
    .some(d => !WEBMAIL.test(d) && d !== h && !h.endsWith("." + d) && !d.endsWith("." + h));
  if (foreignMail) return no("dataset_email_on_other_domain");
  const dc = resolveMarketCity(claims.city, market), pc = resolveMarketCity(text.slice(0, 6000), market);
  if (dc && pc && dc !== pc) return no("city_conflict");
  return { phone: (market === "ARAB" ? "+964" : "+98") + hit };
}

// Read the candidate file from an R2-compatible store ({get(key) → {text()}|null}); bounded size.
export async function readCandidateFile(store, settings) {
  if (typeof store?.get !== "function") return { ok: false, reason: "no_store" };
  let obj; try { obj = await store.get(settings.key); } catch { return { ok: false, reason: "store_unavailable" }; }
  if (!obj) return { ok: false, reason: "no_candidate_file" };
  if (Number(obj.size || 0) > settings.max_file_bytes) return { ok: false, reason: "file_too_large" };
  let raw; try { raw = await obj.text(); } catch { return { ok: false, reason: "store_unavailable" }; }
  if (raw.length > settings.max_file_bytes) return { ok: false, reason: "file_too_large" };
  let doc; try { doc = JSON.parse(raw); } catch { return { ok: false, reason: "invalid_json" }; }
  // Phase 18.11: a sealed file (content_sha256 from the extractor) must still match its seal — corruption, truncation or a hand edit
  // is refused before any record is read. Unsealed files (Phase 18.3 pilot format) remain accepted and are reported as such.
  let integrity = "unsealed";
  if (doc && typeof doc === "object" && doc.content_sha256 !== undefined) {
    if (typeof doc.content_sha256 !== "string" || !Array.isArray(doc.candidates) || await candidatesContentHash(doc.candidates) !== doc.content_sha256.toLowerCase())
      return { ok: false, reason: "content_hash_mismatch" };
    integrity = "sealed";
  }
  const v = validateCandidateFile(doc, settings); if (!v.ok) return v;
  return { ...v, integrity, etag: obj.etag || obj.httpEtag || null, digest: await candidateDigest(v.candidates) };
}
// Phase 18.11 cost: the parsed, validated file is kept per isolate (one entry, keyed by object key + etag). While a release is still
// being imported (3 per market per tick), later ticks on a warm isolate reuse it instead of downloading and parsing up to 5 MB again.
let PARSED_FILE = null;
export function resetCandidateFileCache() { PARSED_FILE = null; }

// Bounded, resumable ingestion: a cursor per release and a per-market daily cap in system_kv. Each new candidate becomes ONE new lead
// (stage discovered) — a domain already known to any lead is skipped, never merged. helpers: {upsert, identities} from index.js.
export async function ingestDatasetCandidates(env, { settings = discoverySettings(env), store = env.DISCOVERY_BUCKET, helpers, now = () => new Date().toISOString() } = {}) {
  if (env.DATASET_DISCOVERY !== "on") return { ok: true, skipped: true, reason: "disabled" };
  if (typeof store?.get !== "function") return { ok: true, skipped: true, reason: "no_store" };
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS system_kv (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)").run();
  const kv = async k => (await env.DB.prepare("SELECT value FROM system_kv WHERE key=?").bind(k).first())?.value;
  const put = (k, v) => env.DB.prepare("INSERT INTO system_kv(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(k, String(v), now()).run();
  // Phase 18.5 cost: once a file is fully ingested, later ticks only HEAD it (no download/parse) until its etag changes.
  let headTag = null;
  if (typeof store.head === "function") { try { const h = await store.head(settings.key); headTag = h?.etag || h?.httpEtag || null; if (headTag && await kv("dataset_discovery:complete:" + headTag)) { PARSED_FILE = null; return { ok: true, skipped: true, reason: "complete" }; } } catch {} }
  const cached = headTag && PARSED_FILE && PARSED_FILE.key === settings.key && PARSED_FILE.etag === headTag && PARSED_FILE.max === settings.max_candidates ? PARSED_FILE.file : null;
  const file = cached || await readCandidateFile(store, settings); if (!file.ok) return { ok: false, reason: file.reason };
  if (!cached) PARSED_FILE = file.etag ? { key: settings.key, etag: file.etag, max: settings.max_candidates, file } : null;
  // Phase 18.5 integrity: a release id is bound to its content. A different file under an already-used release id is refused (its cursor
  // positions would point at other records); a new extraction must use a new release id.
  const digestKey = "dataset_discovery:digest:" + file.release, knownDigest = await kv(digestKey);
  if (knownDigest && knownDigest !== file.digest) return { ok: false, reason: "release_content_changed", release: file.release };
  if (!knownDigest) await put(digestKey, file.digest);
  const day = now().slice(0, 10), out = { ok: true, release: file.release, digest: file.digest, integrity: file.integrity, cached: !!cached, total: file.candidates.length, created: { IRAN: 0, ARAB: 0 }, cursor: {}, done: {}, skipped: {}, rejected_in_file: file.rejected };
  const skip = r => { out.skipped[r] = (out.skipped[r] || 0) + 1; };
  // One cursor per market and release, so a market at its limit never holds the other back and a restart resumes where it stopped.
  for (const market of ["IRAN", "ARAB"]) {
    const list = file.candidates.filter(c => c.market === market), cursorKey = `dataset_discovery:cursor:${file.release}:${market}`, dayKey = `dataset_discovery:day:${day}:${market}`;
    let cursor = Number(await kv(cursorKey) || 0); const used = Number(await kv(dayKey) || 0);
    const full = () => out.created[market] >= settings.ingest_per_run[market] || used + out.created[market] >= settings.daily_cap[market];
    // Phase 18.5: progress is saved even when a run fails midway (finally); a record whose lead was created just before a failure is
    // skipped on resume by its domain identity, so nothing is duplicated or lost.
    try {
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
    } catch (e) {
      // the failing record is retried next tick (cursor points at it); everything before it is kept
      cursor = Math.max(0, cursor - 1); out.ok = false; out.error = String(e?.message || e).slice(0, 200);
    } finally {
      await put(cursorKey, cursor).catch(() => {});
      if (out.created[market]) await put(dayKey, used + out.created[market]).catch(() => {});
      out.cursor[market] = cursor; out.done[market] = cursor >= list.length;
    }
    if (!out.ok) break;
  }
  if (out.ok && out.done.IRAN && out.done.ARAB && file.etag) { await put("dataset_discovery:complete:" + file.etag, file.digest); PARSED_FILE = null; }
  return out;
}
