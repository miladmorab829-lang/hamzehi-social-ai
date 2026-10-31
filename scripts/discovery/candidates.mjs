// Phase 18.4 — pure normalizer: raw Overture / OSM rows → one candidate file (schema hamzehi.discovery.candidates/1). No network, no
// writes. The SAME validation as the Worker (worker/src/dataset-discovery.js) decides what is kept, so the file never carries a record
// the Worker would refuse (Google origin, disabled source for the market, no own website, wrong-market domain, missing license).
import fs from "node:fs";
import { DISCOVERY_SCHEMA, DISCOVERY_SOURCES, DATASET_ATTRIBUTION, RELEASE_ID, validateCandidate, candidatesContentHash, nameTokens } from "../../worker/src/dataset-discovery.js";

// Phase 18.11 (G-1/G-2): the FILE release id and the Overture SOURCE release are separate. Before, one --release value was both the
// Overture S3 path and the file id, so a second file from the same Overture release (new OSM extract, other limits) could not get the
// new id the Worker requires (2026-10-21.1 does not exist on S3). Both ids now use the Worker's own RELEASE_ID rule (N ≤ 3 digits).
export function extractionPlan({ release, overtureRelease } = {}) {
  const r = String(release || ""), o = String(overtureRelease || release || "");
  if (!RELEASE_ID.test(r)) return { ok: false, error: "--release must be YYYY-MM-DD.N (N: 1-3 digits), a NEW id for every new file" };
  if (!RELEASE_ID.test(o)) return { ok: false, error: "--overture-release must be an Overture release id YYYY-MM-DD.N" };
  return { ok: true, release: r, overtureRelease: o,
    overtureS3: `s3://overturemaps-us-west-2/release/${o}/theme=places/type=place/*`,
    rawOvertureFile: `raw-overture-${o}.json`, candidateFile: `candidates-${r}.json` };
}
// Crash-safe write: a reader (or --resume) sees either the old file or the complete new one, never a partial one.
export function writeFileAtomic(file, data) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data); fs.renameSync(tmp, file);
}
// Integrity: SHA-256 of the exact serialized candidate list; the Worker refuses a file whose list no longer matches (corruption,
// truncation, hand edits). Older files without the field are still accepted (recorded as integrity "unsigned").
export async function sealCandidateFile(doc) {
  return { ...doc, content_sha256: await candidatesContentHash(doc.candidates) };
}

// Overture per-source licenses (docs.overturemaps.org/attribution, 2026): Foursquare Apache-2.0, AllThePlaces CC0-1.0, all other
// contributors (Meta, Microsoft, PinMeTo, BrightQuery, …) CDLA-Permissive-2.0.
export function overtureLicense(datasets = [], explicit = []) {
  const e = explicit.find(Boolean); if (e && /cdla|apache|cc0/i.test(e)) return /apache/i.test(e) ? "Apache-2.0" : /cc0/i.test(e) ? "CC0-1.0" : "CDLA-Permissive-2.0";
  // Phase 18.13: Overture lists itself ("Overture") next to the real contributor, e.g. ["Foursquare","Overture"]. That pseudo-source is
  // ignored; before, every Foursquare record was labelled CDLA and lost the Apache-2.0 / Foursquare-notice obligation. A record that
  // mixes Foursquare with other contributors carries Apache-2.0, the license with the stricter notice duty.
  const d = datasets.map(x => String(x).toLowerCase()).filter(x => x && x !== "overture");
  return d.length && d.some(x => x.includes("foursquare")) ? "Apache-2.0" : d.length && d.every(x => x.includes("alltheplaces")) ? "CC0-1.0" : "CDLA-Permissive-2.0";
}
const marketOfCountry = cc => cc === "IR" ? "IRAN" : cc === "IQ" ? "ARAB" : null;
const tagsOf = t => Array.isArray(t) ? Object.fromEntries(t.map(x => [x.key, x.value])) : (t || {});

// overture: rows from the extractor query (id, name, websites, socials, emails, phones, country, locality, region, confidence,
// operating_status, src[] datasets, lic[] licenses, tax/basic_category); osm: {IRAN:[{kind,id,tags}]} (IRAQ OSM is disabled).
export function normalizeCandidates({ overture = [], osm = {} } = {}, { release, overtureRelease = null, generatedAt = new Date().toISOString(), maxPerMarket = 500, minConfidence = 0 } = {}) {
  const raw = [], dropped = {}, drop = r => { dropped[r] = (dropped[r] || 0) + 1; };
  // Phase 18.11: malformed input is counted, never thrown — a null row or a scalar where a list is expected no longer aborts the run.
  const list = v => Array.isArray(v) ? v.filter(x => x != null && x !== "") : v != null && v !== "" ? [v] : [];
  for (const r of Array.isArray(overture) ? overture : []) {
    if (!r || typeof r !== "object") { drop("invalid_row"); continue; }
    const market = marketOfCountry(r.country); if (!market) { drop("no_target_country"); continue; }
    if (/closed/i.test(String(r.operating_status || ""))) { drop("closed"); continue; }
    if (Number(r.confidence || 0) < minConfidence) { drop("low_confidence"); continue; }
    raw.push({ market, dataset: "overture", record_id: String(r.id || ""), license: overtureLicense(list(r.src), list(r.lic)), source_datasets: list(r.src),
      name: r.name || "", city: r.locality || r.region || null, websites: list(r.websites), socials: list(r.socials), emails: list(r.emails), phones: list(r.phones),
      category: r.tax || r.basic_category || null, confidence: r.confidence ?? null });
  }
  for (const market of Object.keys(osm || {})) for (const r of Array.isArray(osm[market]) ? osm[market] : []) {
    if (!DISCOVERY_SOURCES[market]?.includes("osm")) { drop("source_disabled_for_market"); continue; }
    if (!r || typeof r !== "object") { drop("invalid_row"); continue; }
    const t = tagsOf(r.tags), g = k => t[k] || "";
    raw.push({ market, dataset: "osm", record_id: `${r.kind}/${r.id}`, license: "ODbL-1.0", source_datasets: ["OpenStreetMap"],
      name: g("name") || g("name:fa") || g("name:ar") || g("name:en"), city: g("addr:city") || null,
      websites: [g("website"), g("contact:website"), g("url")].filter(Boolean), socials: [g("contact:instagram"), g("contact:telegram"), g("contact:facebook")].filter(Boolean),
      emails: [g("email"), g("contact:email")].filter(Boolean), phones: [g("phone"), g("contact:phone"), g("contact:mobile")].filter(Boolean).flatMap(p => p.split(/[;,]/)),
      category: g("shop") || g("craft") || null, confidence: null });
  }
  // Overture first, then OSM; one record per own-site host; bounded per market.
  // Phase 18.11: a fixed order BEFORE de-duplication and the per-market limit (dataset, then market, then record id). DuckDB returns
  // rows in no guaranteed order, so before this the record kept for a shared host — and which records fell under the limit — could
  // change between two runs of the same release.
  const rank = c => (c.dataset === "overture" ? "0" : "1") + "|" + c.market + "|" + c.record_id;
  raw.sort((a, b) => rank(a) < rank(b) ? -1 : rank(a) > rank(b) ? 1 : 0);
  const seen = new Set(), per = { IRAN: 0, ARAB: 0 }, candidates = [];
  for (const c of raw) {
    const v = validateCandidate(c); if (!v.ok) { drop(v.reason); continue; }
    // Phase 18.13: a name made only of trade words / city names ("م گالری", "H&Y Jewellery") can never be confirmed by the business's
    // own website, so the lead could never verify its identity; it is not shipped (counted as ambiguous_name).
    if (!nameTokens(v.candidate.name).length) { drop("ambiguous_name"); continue; }
    if (seen.has(v.candidate.host)) { drop("duplicate_host"); continue; }
    if (per[c.market] >= maxPerMarket) { drop("market_limit"); continue; }
    seen.add(v.candidate.host); per[c.market]++;
    const { host, ...keep } = v.candidate; candidates.push({ ...keep, websites: [v.candidate.url], url: undefined });
  }
  // Phase 18.5: deterministic order (market, dataset, record id) — the same order the Worker uses for its cursors.
  const k = c => c.market + "|" + c.dataset + "|" + c.record_id; candidates.sort((a, b) => k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0);
  return { schema: DISCOVERY_SCHEMA, release, generated_at: generatedAt, source_releases: { overture: overtureRelease || release },
    sources_enabled: DISCOVERY_SOURCES, attribution: DATASET_ATTRIBUTION,
    licenses: { overture: "CDLA-Permissive-2.0 / Apache-2.0 (Foursquare) / CC0-1.0 (AllThePlaces) per record", osm: "ODbL-1.0 (internal use only; never publish a derived database)" },
    counts: { input: raw.length, kept: candidates.length, per_market: per, dropped }, candidates };
}
