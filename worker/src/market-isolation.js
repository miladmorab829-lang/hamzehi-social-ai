// Market isolation (2026-11-01, owner instruction): a failure in one market (IRAN or ARAB) never stops the other. Each market's failures
// are counted separately in system_kv ("market_fail:<scope>:<MARKET>", scope = "dataset" | "ads"). After MARKET_FAIL_BACKOFF_AFTER
// consecutive failures the market is retried with exponential backoff (1 h, 2 h, 4 h … max 24 h), so a persistent error cannot cause
// repeated downloads, paid calls or quota use. The first success clears the state. Each failure is also written as a warning event
// (one per scope/market/hour) for the dashboard; the Watchdog raises a per-market alert from the same state (agent-watchdog.js).
export const MARKET_FAIL_BACKOFF_AFTER = 3;
export const MARKET_FAIL_MAX_BACKOFF_MS = 24 * 3600 * 1000;
export const marketFailKey = (scope, market) => `market_fail:${scope}:${market}`;

const kvGet = async (env, key) => { try { return (await env.DB.prepare("SELECT value FROM system_kv WHERE key=?").bind(key).first())?.value ?? null; } catch { return null; } };
const kvPut = (env, key, value, t) => env.DB.prepare("INSERT INTO system_kv(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(key, value, t).run();

export async function readMarketFailure(env, scope, market) {
  const raw = await kvGet(env, marketFailKey(scope, market)); if (!raw) return null;
  try { const v = JSON.parse(raw); return v && typeof v === "object" && Number(v.count) > 0 ? v : null; } catch { return null; }
}

// {skip:true, retry_after} while a failing market is cooling down; otherwise {skip:false}.
export async function marketBackoff(env, scope, market, nowMs = Date.now()) {
  const f = await readMarketFailure(env, scope, market);
  if (f && f.count >= MARKET_FAIL_BACKOFF_AFTER && Date.parse(f.retry_after || "") > nowMs) return { skip: true, retry_after: f.retry_after, count: f.count };
  return { skip: false };
}

export async function recordMarketFailure(env, scope, market, error, nowMs = Date.now()) {
  const t = new Date(nowMs).toISOString(), prev = await readMarketFailure(env, scope, market), count = (prev?.count || 0) + 1;
  // Stored error text is redacted (bearer values, bot tokens, keys) before it reaches system_kv, system_events or a Watchdog alert.
  const msg = String(error?.message || error || "unknown_error").replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]").replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[redacted]")
    .replace(/([?&](?:key|token|api_key|access_token)=)[^&\s]+/gi, "$1[redacted]").replace(/\b(api[_-]?key|access[_-]?token|token|secret)\s*[=:]\s*[^\s,;&]+/gi, "$1=[redacted]")
    .replace(/\bAIza[0-9A-Za-z_-]{30,}/g, "[redacted-google-key]").replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}/g, "[redacted-key]")
    .replace(/\s+/g, " ").slice(0, 200);
  const retry_after = count >= MARKET_FAIL_BACKOFF_AFTER ? new Date(nowMs + Math.min(3600 * 1000 * 2 ** (count - MARKET_FAIL_BACKOFF_AFTER), MARKET_FAIL_MAX_BACKOFF_MS)).toISOString() : null;
  const state = { scope, market, count, error: msg, first_at: prev?.first_at || t, last_at: t, retry_after,
    impact: `${scope === "ads" ? "Ads" : "Dataset discovery"} for ${market} paused${retry_after ? " until " + retry_after : " until the next tick"}`,
    fallback: "The other market continues; no paid call and nothing sent while this market fails or backs off" };
  const fp = [...msg].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(16);
  try { await kvPut(env, marketFailKey(scope, market), JSON.stringify(state), t); } catch {}
  try {
    await env.DB.prepare("INSERT OR IGNORE INTO system_events(id,type,severity,message,details_json,created_at) VALUES(?,?,'warning',?,?,?)")
      .bind(`market-fail:${scope}:${market}:${t.slice(0, 13)}:${fp}`, `${scope}_market_failed`, `${scope === "ads" ? "Ads" : "Dataset discovery"} run failed for market ${market}; the other market continues`, JSON.stringify(state), t).run();
  } catch {}
  return state;
}

export async function clearMarketFailure(env, scope, market, nowMs = Date.now()) {
  if (!(await readMarketFailure(env, scope, market))) return false;
  const t = new Date(nowMs).toISOString(), prev = await readMarketFailure(env, scope, market);
  try { await kvPut(env, marketFailKey(scope, market), JSON.stringify({ scope, market, count: 0, recovered_at: t, last_failure: { count: prev.count, first_at: prev.first_at, last_at: prev.last_at, error: prev.error } }), t); } catch {}
  try {
    await env.DB.prepare("INSERT OR IGNORE INTO system_events(id,type,severity,message,details_json,created_at) VALUES(?,?,'info',?,?,?)")
      .bind(`market-recovered:${scope}:${market}:${t}`, `${scope}_market_recovered`, `${scope === "ads" ? "Ads" : "Dataset discovery"} for market ${market} recovered after ${prev.count} failure(s)`, JSON.stringify({ scope, market, recovered_at: t, failures: prev.count, first_at: prev.first_at, last_error: prev.error }), t).run();
  } catch {}
  return true;
}

// Watchdog input: every market currently at or above the backoff threshold.
export async function failingMarkets(env) {
  try {
    const rows = (await env.DB.prepare("SELECT key,value FROM system_kv WHERE key LIKE 'market_fail:%' LIMIT 20").all()).results || [];
    return rows.map(r => { try { return JSON.parse(r.value); } catch { return null; } }).filter(f => f && Number(f.count) >= MARKET_FAIL_BACKOFF_AFTER);
  } catch { return []; }
}
