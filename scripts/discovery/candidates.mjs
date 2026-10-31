// Phase 18.4 — pure normalizer: raw Overture / OSM rows → one candidate file (schema hamzehi.discovery.candidates/1). No network, no
// writes. The SAME validation as the Worker (worker/src/dataset-discovery.js) decides what is kept, so the file never carries a record
// the Worker would refuse (Google origin, disabled source for the market, no own website, wrong-market domain, missing license).
import { DISCOVERY_SCHEMA, DISCOVERY_SOURCES, DATASET_ATTRIBUTION, validateCandidate } from "../../worker/src/dataset-discovery.js";

// Overture per-source licenses (docs.overturemaps.org/attribution, 2026): Foursquare Apache-2.0, AllThePlaces CC0-1.0, all other
// contributors (Meta, Microsoft, PinMeTo, BrightQuery, …) CDLA-Permissive-2.0.
export function overtureLicense(datasets = [], explicit = []) {
  const e = explicit.find(Boolean); if (e && /cdla|apache|cc0/i.test(e)) return /apache/i.test(e) ? "Apache-2.0" : /cc0/i.test(e) ? "CC0-1.0" : "CDLA-Permissive-2.0";
  const d = datasets.map(x => String(x).toLowerCase());
  return d.length && d.every(x => x.includes("foursquare")) ? "Apache-2.0" : d.length && d.every(x => x.includes("alltheplaces")) ? "CC0-1.0" : "CDLA-Permissive-2.0";
}
const marketOfCountry = cc => cc === "IR" ? "IRAN" : cc === "IQ" ? "ARAB" : null;
const tagsOf = t => Array.isArray(t) ? Object.fromEntries(t.map(x => [x.key, x.value])) : (t || {});

// overture: rows from the extractor query (id, name, websites, socials, emails, phones, country, locality, region, confidence,
// operating_status, src[] datasets, lic[] licenses, tax/basic_category); osm: {IRAN:[{kind,id,tags}]} (IRAQ OSM is disabled).
export function normalizeCandidates({ overture = [], osm = {} } = {}, { release, generatedAt = new Date().toISOString(), maxPerMarket = 500, minConfidence = 0 } = {}) {
  const raw = [], dropped = {}, drop = r => { dropped[r] = (dropped[r] || 0) + 1; };
  for (const r of overture) {
    const market = marketOfCountry(r.country); if (!market) { drop("no_target_country"); continue; }
    if (/closed/i.test(String(r.operating_status || ""))) { drop("closed"); continue; }
    if (Number(r.confidence || 0) < minConfidence) { drop("low_confidence"); continue; }
    raw.push({ market, dataset: "overture", record_id: String(r.id || ""), license: overtureLicense(r.src || [], r.lic || []), source_datasets: r.src || [],
      name: r.name || "", city: r.locality || r.region || null, websites: r.websites || [], socials: r.socials || [], emails: r.emails || [], phones: r.phones || [],
      category: r.tax || r.basic_category || null, confidence: r.confidence ?? null });
  }
  for (const market of Object.keys(osm)) for (const r of osm[market] || []) {
    if (!DISCOVERY_SOURCES[market]?.includes("osm")) { drop("source_disabled_for_market"); continue; }
    const t = tagsOf(r.tags), g = k => t[k] || "";
    raw.push({ market, dataset: "osm", record_id: `${r.kind}/${r.id}`, license: "ODbL-1.0", source_datasets: ["OpenStreetMap"],
      name: g("name") || g("name:fa") || g("name:ar") || g("name:en"), city: g("addr:city") || null,
      websites: [g("website"), g("contact:website"), g("url")].filter(Boolean), socials: [g("contact:instagram"), g("contact:telegram"), g("contact:facebook")].filter(Boolean),
      emails: [g("email"), g("contact:email")].filter(Boolean), phones: [g("phone"), g("contact:phone"), g("contact:mobile")].filter(Boolean).flatMap(p => p.split(/[;,]/)),
      category: g("shop") || g("craft") || null, confidence: null });
  }
  // Overture first, then OSM; one record per own-site host; bounded per market.
  const seen = new Set(), per = { IRAN: 0, ARAB: 0 }, candidates = [];
  for (const c of raw) {
    const v = validateCandidate(c); if (!v.ok) { drop(v.reason); continue; }
    if (seen.has(v.candidate.host)) { drop("duplicate_host"); continue; }
    if (per[c.market] >= maxPerMarket) { drop("market_limit"); continue; }
    seen.add(v.candidate.host); per[c.market]++;
    const { host, ...keep } = v.candidate; candidates.push({ ...keep, websites: [v.candidate.url], url: undefined });
  }
  return { schema: DISCOVERY_SCHEMA, release, generated_at: generatedAt, sources_enabled: DISCOVERY_SOURCES, attribution: DATASET_ATTRIBUTION,
    licenses: { overture: "CDLA-Permissive-2.0 / Apache-2.0 (Foursquare) / CC0-1.0 (AllThePlaces) per record", osm: "ODbL-1.0 (internal use only; never publish a derived database)" },
    counts: { input: raw.length, kept: candidates.length, per_market: per, dropped }, candidates };
}
