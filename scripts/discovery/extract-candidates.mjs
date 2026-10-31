// Phase 18.4 — LOCAL candidate extraction (owner's PC). Bounded and resumable; it never uploads anything and never touches the CRM.
//
//   node scripts/discovery/extract-candidates.mjs --release 2026-10-21.0 --out <dir> --osm-iran <iran-latest.osm.pbf>
//        [--max-per-market 500] [--min-confidence 0] [--resume] [--duckdb <folder containing node_modules/@duckdb/node-api>]
//
// Steps (each written to <dir> and recorded in <dir>/extract-state.json, so --resume skips finished steps):
//   1. overture   Overture Maps Places (anonymous public S3, no account, no cost): jewelry/gold places with country IR or IQ.
//   2. osm_iran   Geofabrik iran-latest.osm.pbf read locally (shop=jewelry|gold, craft=jeweller|goldsmith). IRAQ OSM is disabled.
//   3. normalize  candidates-<release>.json via scripts/discovery/candidates.mjs (same validation as the Worker).
// Uploading the file to R2 is a separate, owner-approved step; this script only prints the command.
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module"; import { pathToFileURL } from "node:url";
import { normalizeCandidates } from "./candidates.mjs";

const arg = (k, d = null) => { const i = process.argv.indexOf("--" + k); return i > 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : true) : d; };
const release = arg("release"), out = arg("out"), osmIran = arg("osm-iran"), resume = !!arg("resume");
const maxPerMarket = Math.max(1, Math.min(5000, Number(arg("max-per-market", 500)) || 500)), minConfidence = Math.max(0, Math.min(1, Number(arg("min-confidence", 0)) || 0));
if (!/^\d{4}-\d{2}-\d{2}\.\d+$/.test(String(release || "")) || !out) { console.error("usage: --release YYYY-MM-DD.N --out <dir> [--osm-iran <pbf>] [--resume]"); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
const stateFile = path.join(out, "extract-state.json");
const state = resume && fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : { release, steps: {} };
if (state.release !== release) { console.error(`state is for release ${state.release}; use a new --out or drop --resume`); process.exit(2); }
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 1));
const done = (step, file) => resume && state.steps[step]?.done && fs.existsSync(path.join(out, file));

async function duckdb(extensions) {
  const base = arg("duckdb") || process.env.DUCKDB_NODE_API_DIR || process.cwd();
  let mod; try { mod = await import(pathToFileURL(createRequire(path.join(path.resolve(String(base)), "noop.js")).resolve("@duckdb/node-api")).href); }
  catch { console.error("@duckdb/node-api not found. Install it in a separate tools folder (npm i @duckdb/node-api) and pass --duckdb <that folder>."); process.exit(3); }
  const c = await (await mod.DuckDBInstance.create(":memory:")).connect();
  for (const e of extensions) { await c.run(`INSTALL ${e}`); await c.run(`LOAD ${e}`); }
  await c.run("SET s3_region='us-west-2'"); await c.run("SET enable_progress_bar=false");
  return c;
}
const step = async (name, file, fn) => {
  if (done(name, file)) { console.log(`skip ${name} (resume, ${state.steps[name].rows} rows)`); return JSON.parse(fs.readFileSync(path.join(out, file), "utf8")); }
  const t0 = Date.now(); const rows = await fn(); fs.writeFileSync(path.join(out, file), JSON.stringify(rows));
  state.steps[name] = { done: true, rows: Array.isArray(rows) ? rows.length : rows?.candidates?.length ?? null, seconds: Math.round((Date.now() - t0) / 1000), at: new Date().toISOString() }; save();
  console.log(`${name}: ${state.steps[name].rows} rows in ${state.steps[name].seconds}s`); return rows;
};

const overture = await step("overture", `raw-overture-${release}.json`, async () => {
  const c = await duckdb(["httpfs"]);
  // bbox covers Iran + Iraq; the country column decides the market (no geographic guessing); category filter = jewelry/gold.
  const r = await c.runAndReadAll(`SELECT id, names.primary AS name, basic_category, taxonomy.primary AS tax, websites, socials, emails, phones,
      addresses[1].country AS country, addresses[1].locality AS locality, addresses[1].region AS region, confidence, operating_status,
      list_transform(sources, s -> s.dataset) AS src, list_transform(sources, s -> s.license) AS lic
    FROM read_parquet('s3://overturemaps-us-west-2/release/${release}/theme=places/type=place/*', hive_partitioning=1)
    WHERE bbox.xmin BETWEEN 38.7 AND 63.4 AND bbox.ymin BETWEEN 25.0 AND 40.0 AND addresses[1].country IN ('IR','IQ')
      AND (lower(coalesce(basic_category,'')) LIKE '%jewel%' OR lower(coalesce(taxonomy.primary,'')) LIKE '%jewel%' OR lower(coalesce(taxonomy.primary,'')) LIKE '%gold%'
        OR list_contains(taxonomy.hierarchy,'jewelry_store'))`);
  return r.getRowObjectsJson();
});
const osmRows = osmIran ? await step("osm_iran", "raw-osm-iran.json", async () => {
  const c = await duckdb(["spatial"]);
  const r = await c.runAndReadAll(`SELECT kind, id, tags FROM ST_ReadOSM('${path.resolve(String(osmIran)).replace(/\\/g, "/").replace(/'/g, "''")}')
    WHERE tags IS NOT NULL AND (tags['shop'] IN ('jewelry','gold') OR tags['craft'] IN ('jeweller','goldsmith'))`);
  return r.getRowObjectsJson();
}) : [];
const file = `candidates-${release}.json`;
const doc = await step("normalize", file, async () => normalizeCandidates({ overture, osm: { IRAN: osmRows } }, { release, maxPerMarket, minConfidence }));
console.log(JSON.stringify(doc.counts));
console.log(`\nCandidate file: ${path.join(out, file)}\nUpload (OWNER APPROVAL REQUIRED, not run by this script):\n  npx wrangler r2 object put <bucket>/discovery/candidates-latest.json --file "${path.join(out, file)}" --remote`);
