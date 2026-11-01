// Phase 19 — offline evaluation of the revenue score on a READ-ONLY snapshot of Production CRM tables (wrangler d1 execute --json exports).
// Usage: node scripts/phase19/evaluate-leads.mjs <snapshot-dir> [--now ISO] [--json out.json]
// Reads files only; makes no network call and writes nothing except the optional --json output.
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL, fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."), SRC = path.join(REPO, "worker/src");
const LQ = await import(pathToFileURL(path.join(SRC, "lead-qualification.js")).href), LS = await import(pathToFileURL(path.join(SRC, "lead-scoring.js")).href);
const [dir, ...rest] = process.argv.slice(2); if (!dir) { console.error("snapshot dir required"); process.exit(2); }
const arg = k => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : null; };
const nowMs = Date.parse(arg("--now") || fs.readFileSync(path.join(dir, "EXPORTED_AT.txt"), "utf8").trim());
const load = f => { const s = fs.readFileSync(path.join(dir, f + ".json"), "utf8"); return JSON.parse(s.slice(s.indexOf("[")))[0].results; };
const parse = l => { try { return l.notes ? JSON.parse(l.notes) : {}; } catch { return {}; } };
const leads = load("leads"), act = new Map(), get = id => { if (!act.has(id)) act.set(id, {}); return act.get(id); };
// Same activity rules as salesLeadActivity() in worker/src/index.js.
for (const r of load("inbox")) get(r.lead_id).replied = true;
for (const r of load("lead_quotes")) { const a = get(r.lead_id); a.quote_requested = true; if (["approved", "sent", "accepted"].includes(r.status)) a.quoted = true; }
for (const r of load("lead_orders")) if (!["cancelled", "order_candidate"].includes(r.status)) get(r.lead_id).ordered = true;
for (const r of [...load("lead_quotes"), ...load("lead_orders")]) if (r.market) { const a = get(r.lead_id); a.order_markets = a.order_markets || []; if (!a.order_markets.includes(r.market)) a.order_markets.push(r.market); }
for (const r of load("lead_orders")) if (["confirmed", "partially_paid", "paid", "shipped", "fulfilled", "delivered"].includes(r.status)) get(r.lead_id).order_confirmed = true;
for (const r of load("lead_outreach")) { const a = get(r.lead_id);
  if (["sent", "delivered"].includes(r.status)) { a.outreach_ever_sent = true; const ts = r.sent_at || r.updated_at; if (ts && (!a.outreach_sent_at || ts > a.outreach_sent_at)) a.outreach_sent_at = ts; }
  if (r.approved_at && (!a.outreach_approved_at || r.approved_at > a.outreach_approved_at)) a.outreach_approved_at = r.approved_at;
  if (r.status === "rejected") a.outreach_rejected_at = r.updated_at; else a.outreach_status = r.status; }
// lead_quotes snapshot has no inbox_message_id column; 0 quote rows exist, so quote_customer_request stays unset.
const contacts = new Map(); for (const c of load("lead_contacts")) if (["page_extracted", "owner_confirmed"].includes(c.evidence_status)) { if (!contacts.has(c.lead_id)) contacts.set(c.lead_id, []); contacts.get(c.lead_id).push(c); }
const dups = LQ.leadDuplicateMap(leads, act, parse, contacts);
const items = leads.map(l => { const m = parse(l), a = { ...(act.get(l.id) || {}), duplicate_of: dups.get(l.id) || null, strict_activity: true };
  const p = LQ.leadQualification(l, m, contacts.get(l.id) || [], a), s = LS.scoreLeadCached(p, l, m, a, { nowMs });
  return { id: l.id, name: l.name, market: p.market, city: m.city || null, source: m.source || null, provider: m.provider || null, industry: s.score.industry,
    state: p.state, tier: p.tier, contact_status: p.contact.status, channels: p.contact.channels, identity: p.identity.status, score: s.score, pipeline: s.pipeline,
    next_action: p.next_action?.action, crm_stage: l.stage }; });
const summary = LS.revenueSummary(items);
const by = (k, xs = items) => xs.reduce((o, x) => { const v = typeof k === "function" ? k(x) : x[k]; o[v] = (o[v] || 0) + 1; return o; }, {});
const top = items.filter(x => ["VERY_HIGH", "HIGH"].includes(x.score.band)).sort((a, b) => b.score.score - a.score.score);
const evaluable = items.filter(x => (x.market === "IRAN" || x.market === "ARAB") && !["INSUFFICIENT_DATA", "EXCLUDED"].includes(x.score.band));
const report = { now: new Date(nowMs).toISOString(), total: items.length, by_market: by("market"), by_band: by(x => x.score.band), by_market_band: by(x => (x.market || "NONE") + ":" + x.score.band),
  by_pipeline: by(x => (x.market || "NONE") + ":" + x.pipeline.stage + (x.pipeline.side_state ? "/" + x.pipeline.side_state : "")), by_source: by(x => (x.market || "NONE") + ":" + (x.provider || x.source || "?")),
  evaluable: { IRAN: evaluable.filter(x => x.market === "IRAN").length, ARAB: evaluable.filter(x => x.market === "ARAB").length },
  score_histogram: by(x => x.score.excluded ? "excluded" : String(Math.floor(x.score.score / 10) * 10)),
  summary, top: top.map(x => ({ id: x.id, name: x.name, market: x.market, city: x.city, score: x.score.score, band: x.score.band, reasons: x.score.reasons,
    verified: Object.values(x.score.components).flatMap(c => c.verified), inferred: Object.values(x.score.components).flatMap(c => c.inferred), pipeline: x.pipeline, next_action: x.next_action })),
  reviews: items.filter(x => x.score.band === "REVIEW").map(x => ({ name: x.name, market: x.market, score: x.score.score, reasons: x.score.reasons, missing: x.score.missing_facts })) };
// The report holds customer data: it may be written outside the repository or under the ignored backups/ folder only.
const out = arg("--json");
if (out) { const abs = path.resolve(out), rel = path.relative(REPO, abs);
  if (!rel.startsWith("..") && !path.isAbsolute(rel) && !/^backups[\\/]/.test(rel)) { console.error("refused: --json must be outside the repository or under backups/ (customer data)"); process.exit(3); }
  fs.writeFileSync(abs, JSON.stringify(report, null, 1)); }
console.log(JSON.stringify({ total: report.total, by_market: report.by_market, by_market_band: report.by_market_band, evaluable: report.evaluable, histogram: report.score_histogram, top: report.top.length }, null, 0));
