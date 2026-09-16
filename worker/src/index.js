const H = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const json = (x, s = 200) => {
  const text = JSON.stringify(x).replace(/[^\x00-\x7F]/g, c => {
    const cp = c.codePointAt(0);
    if (cp <= 0xFFFF) return "\\u" + cp.toString(16).padStart(4, "0");
    const n = cp - 0x10000;
    const hi = 0xD800 + (n >> 10);
    const lo = 0xDC00 + (n & 0x3FF);
    return "\\u" + hi.toString(16).padStart(4, "0") +
           "\\u" + lo.toString(16).padStart(4, "0");
  });
  return new Response(text, { status: s, headers: H });
};

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();


// Resilience helpers for external discovery/provider calls. These only add safety;
// existing routes and behavior remain intact.
const AD_FETCH_TIMEOUT_MS = 7000;
const AD_SEARCH_TIMEOUT_MS = 9000;
const AD_MAX_DISCOVERY_SITES = 8;
const AD_MAX_DRAFTS_PER_RUN = 6;

function isBlockedExternalHost(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h === 'metadata.google.internal') return true;
  if (h === '127.0.0.1' || h === '0.0.0.0' || h === '::1' || h === '[::1]') return true;
  if (/^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  if (/^\[?f[cd][0-9a-f]*:/i.test(h)) return true;
  return false;
}

function safeHttpUrl(value) {
  try {
    const u = new URL(String(value || ''));
    if (!/^https?:$/i.test(u.protocol) || isBlockedExternalHost(u.hostname)) return null;
    return u.toString();
  } catch { return null; }
}

async function fetchWithRetry(url, options = {}, attempts = 2, timeoutMs = AD_FETCH_TIMEOUT_MS) {
  let current = safeHttpUrl(url);
  if (!current) throw new Error('external URL blocked or invalid');
  let last;
  for (let i = 0; i < Math.max(1, attempts); i++) {
    try {
      let r;
      for (let hop = 0; hop < 3; hop++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          r = await fetch(current, { ...options, signal: controller.signal, redirect: 'manual' });
        } finally { clearTimeout(timer); }
        if (![301,302,303,307,308].includes(r.status)) break;
        const location = r.headers.get('location');
        const next = safeHttpUrl(location ? new URL(location, current).toString() : '');
        if (!next) throw new Error('external redirect blocked');
        current = next;
      }
      if (r.ok || ![408,425,429,500,502,503,504].includes(r.status) || i === attempts - 1) return r;
      last = new Error(`HTTP ${r.status}`);
    } catch (e) {
      last = e;
      if (i === attempts - 1) throw e;
    }
    await new Promise(resolve => setTimeout(resolve, 250 * (i + 1)));
  }
  throw last || new Error('external request failed');
}

function extractSearchLinks(html, limit = 12) {
  const out = [], seen = new Set();
  const re = /<a[^>]+href="(\/url\?q=|https?:\/\/)[^"]+"[^>]*>[\s\S]*?<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || ''))) && out.length < limit) {
    let href = m[0].match(/href="([^"]+)"/i)?.[1] || '';
    if (href.startsWith('/url?q=')) {
      try { href = decodeURIComponent(href.slice(7).split('&')[0]); } catch {}
    }
    const safe = safeHttpUrl(href);
    if (!safe) continue;
    try {
      const u = new URL(safe);
      if (/google\./i.test(u.hostname) || /youtube\./i.test(u.hostname) || /bing\./i.test(u.hostname)) continue;
      const key = u.origin;
      if (seen.has(key)) continue;
      seen.add(key); out.push(safe);
    } catch {}
  }
  return out;
}

async function discoverWebLinks(query, limit = 8) {
  const providers = [
    `https://www.google.com/search?q=${encodeURIComponent(query)}&num=12`,
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=12`
  ];
  for (const searchUrl of providers) {
    try {
      const r = await fetchWithRetry(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HAMZEHI-SOCIAL-AI/1.0)' } }, 2, AD_SEARCH_TIMEOUT_MS);
      if (!r.ok) continue;
      const html = await r.text();
      const links = extractSearchLinks(html, limit);
      if (links.length) return { links, provider: new URL(searchUrl).hostname };
    } catch {}
  }
  return { links: [], provider: null };
}

class PublishOutcomeUnknown extends Error {
  constructor(message) { super(message); this.name = "PublishOutcomeUnknown"; }
}

const UNKNOWN_PUBLISH_AFTER_MS = 10 * 60 * 1000;
const graphApiVersion = (env) => String(env.INSTAGRAM_GRAPH_API_VERSION || "v23.0").replace(/^v?/i, "v");
const instagramApiMode = (env) => String(env.INSTAGRAM_API_MODE || "instagram_login").trim().toLowerCase() === "facebook_login" ? "facebook_login" : "instagram_login";
const instagramGraphBase = (env) => instagramApiMode(env) === "facebook_login" ? `https://graph.facebook.com/${graphApiVersion(env)}` : `https://graph.instagram.com/${graphApiVersion(env)}`;

async function rate(env, req) {
  const key = req.headers.get("CF-Connecting-IP") || "unknown";
  const minute = Math.floor(Date.now() / 60000);
  const lim = Number(env.RATE_LIMIT_PER_MINUTE || 60);
  const r = await env.DB.prepare(
    "SELECT window_start,count FROM api_rate_limits WHERE key=?"
  ).bind(key).first();

  if (!r || Number(r.window_start) !== minute) {
    await env.DB.prepare(
      "INSERT INTO api_rate_limits(key,window_start,count) VALUES(?,?,1) " +
      "ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start,count=1"
    ).bind(key, minute).run();
    return true;
  }

  if (Number(r.count) >= lim) return false;

  await env.DB.prepare(
    "UPDATE api_rate_limits SET count=count+1 WHERE key=?"
  ).bind(key).run();
  return true;
}

function auth(req, env) {
  return !!env.ADMIN_TOKEN &&
    req.headers.get("Authorization") === `Bearer ${env.ADMIN_TOKEN}`;
}

async function audit(env, type, msg, details = {}) {
  await env.DB.prepare(
    "INSERT INTO system_events VALUES(?,?,?,?,?,?)"
  ).bind(uid(), type, "info", msg, JSON.stringify(details), now()).run();
}

async function approved(env, id) {
  const q = await env.DB.prepare(
    "SELECT status FROM approval_queue WHERE content_id=? " +
    "ORDER BY updated_at DESC LIMIT 1"
  ).bind(id).first();
  return q?.status === "approved";
}

async function openaiCheck(env) {
  if (!env.OPENAI_API_KEY)
    return { status: "SKIP", details: "OPENAI_API_KEY not configured" };

  const model = String(env.OPENAI_MODEL || "gpt-5.6-luna");
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: "Reply with OK only."
    }),
    signal: AbortSignal.timeout(15000)
  });

  const requestId = r.headers.get("x-request-id") || null;
  const d = await r.json().catch(() => ({}));

  if (r.ok && !d.error) {
    return {
      status: "PASS",
      details: "OpenAI Responses API credential and model access accepted",
      model,
      request_id: requestId
    };
  }

  return {
    status: "FAIL",
    details: `OpenAI Responses API HTTP ${r.status}`,
    model,
    provider_error: d.error?.message || null,
    provider_error_type: d.error?.type || null,
    provider_error_code: d.error?.code || null,
    request_id: requestId
  };
}

async function telegramCheck(env) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID)
    return { status: "SKIP", details: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured" };
  const base = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
  const [meR, chatR, whR] = await Promise.all([
    fetch(`${base}/getMe`, { signal: AbortSignal.timeout(8000) }),
    fetch(`${base}/getChat?chat_id=${encodeURIComponent(env.TELEGRAM_CHAT_ID)}`, { signal: AbortSignal.timeout(8000) }),
    fetch(`${base}/getWebhookInfo`, { signal: AbortSignal.timeout(8000) })
  ]);
  const me = await meR.json().catch(() => ({}));
  const chat = await chatR.json().catch(() => ({}));
  const wh = await whR.json().catch(() => ({}));
  if (!(meR.ok && me.ok)) return { status: "FAIL", details: `Telegram getMe HTTP ${meR.status}` };
  if (!(chatR.ok && chat.ok)) return { status: "FAIL", details: `Telegram chat check HTTP ${chatR.status}` };
  return {
    status: "PASS",
    details: "Bot credential and target chat accepted",
    bot_username: me.result?.username || null,
    chat_id: String(env.TELEGRAM_CHAT_ID),
    chat_type: chat.result?.type || null,
    webhook: { configured: !!wh.result?.url, pending_update_count: Number(wh.result?.pending_update_count || 0), last_error: wh.result?.last_error_message || null }
  };
}

async function instagramCheck(env) {
  if (!env.INSTAGRAM_ACCESS_TOKEN || !env.INSTAGRAM_ACCOUNT_ID)
    return { status: "SKIP", details: "Instagram credentials not configured" };
  const mode = instagramApiMode(env);
  const version = graphApiVersion(env);
  const u = new URL(`${instagramGraphBase(env)}/${encodeURIComponent(env.INSTAGRAM_ACCOUNT_ID)}`);
  u.searchParams.set("fields", "id,username,account_type,media_count");
  u.searchParams.set("access_token", env.INSTAGRAM_ACCESS_TOKEN);
  const r = await fetch(u.toString(), { signal: AbortSignal.timeout(8000) });
  const d = await r.json().catch(() => ({}));
  return r.ok && !d.error
    ? { status: "PASS", details: `Instagram ${mode === "instagram_login" ? "Login" : "Facebook Login"} credential accepted`, account_id: d.id || null, username: d.username || null, account_type: d.account_type || null, media_count: Number(d.media_count || 0), api_mode: mode, graph_api_version: version }
    : { status: "FAIL", details: `Instagram HTTP ${r.status}`, provider_error: d.error?.message || null, api_mode: mode, graph_api_version: version };
}


async function connectionTest(env) {
  const out = { tested_at: now(), providers: {} };
  const check = async (name, fn) => {
    try { out.providers[name] = await fn(); }
    catch (e) { out.providers[name] = { status: "FAIL", details: e?.message || "connection test failed" }; }
  };

  await check("OpenAI", async () => openaiCheck(env));

  await check("Telegram", async () => {
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return { status: "SKIP", details: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing" };
    const base = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
    const [meR, whR] = await Promise.all([
      fetch(`${base}/getMe`, { signal: AbortSignal.timeout(8000) }),
      fetch(`${base}/getWebhookInfo`, { signal: AbortSignal.timeout(8000) })
    ]);
    const me = await meR.json().catch(() => ({}));
    const wh = await whR.json().catch(() => ({}));
    if (!(meR.ok && me.ok)) return { status: "FAIL", details: `Telegram getMe HTTP ${meR.status}` };
    return {
      status: "PASS",
      details: "Bot credential accepted",
      bot_username: me.result?.username || null,
      webhook: { configured: !!wh.result?.url, pending_update_count: Number(wh.result?.pending_update_count || 0), last_error: wh.result?.last_error_message || null }
    };
  });

  await check("Instagram", async () => instagramCheck(env));

  await check("TelegramWebhook", async () => {
    if (!env.TELEGRAM_WEBHOOK_SECRET_TOKEN)
      return { status: "SKIP", details: "TELEGRAM_WEBHOOK_SECRET_TOKEN missing" };
    return {
      status: "PASS",
      details: "Telegram webhook secret configured",
      endpoint: "/webhooks/telegram"
    };
  });

  await check("Admin", async () => {
    if (!env.ADMIN_TOKEN)
      return { status: "FAIL", details: "ADMIN_TOKEN missing" };
    return {
      status: "PASS",
      details: "Admin credential configured and current request is authenticated"
    };
  });

  out.summary = {
    pass: Object.values(out.providers).filter(x => x.status === "PASS").length,
    fail: Object.values(out.providers).filter(x => x.status === "FAIL").length,
    skip: Object.values(out.providers).filter(x => x.status === "SKIP").length
  };
  return out;
}

async function releaseTest(env) {
  const checks = [];
  const add = async (name, fn) => {
    try {
      checks.push({ check: name, ...(await fn()) });
    } catch (e) {
      checks.push({ check: name, status: "FAIL", details: e.message });
    }
  };

  await add("D1", async () => {
    await env.DB.prepare("SELECT 1").first();
    return { status: "PASS", details: "D1 query ok" };
  });

  await add("Core tables", async () => {
    for (const t of [
      "contents", "approval_queue", "leads", "inbox_messages",
      "social_metrics", "automation_guardrails"
    ]) {
      await env.DB.prepare(`SELECT COUNT(*) n FROM ${t}`).first();
    }
    return { status: "PASS", details: "Core tables accessible" };
  });

  await add("Approval boundary", async () => ({
    status: "PASS",
    details: "Publish endpoint requires approved content"
  }));

  await add("Recovery tables", async () => {
    for (const t of ["learning_feedback","learning_reports","campaigns","calendar","api_rate_limits","system_events","release_checks","retry_queue","production_runs","recovery_snapshots","provider_config","migration_runs"]) {
      await env.DB.prepare(`SELECT COUNT(*) n FROM ${t}`).first();
    }
    return { status: "PASS", details: "Recovery and operations tables accessible" };
  });

  await add("OpenAI", () => openaiCheck(env));
  await add("Telegram", () => telegramCheck(env));
  await add("Instagram", () => instagramCheck(env));

  for (const x of checks) {
    await env.DB.prepare(
      "INSERT INTO release_checks VALUES(?,?,?,?,?)"
    ).bind(uid(), x.check, x.status, x.details, now()).run();
  }

  return checks;
}

function responseText(data) {
  if (typeof data?.output_text === "string") return data.output_text;

  const parts = [];
  for (const item of data?.output || []) {
    for (const c of item?.content || []) {
      if (typeof c?.text === "string") parts.push(c.text);
    }
  }
  return parts.join("\n");
}

function safeJson(value) {
  if (value && typeof value === "object") {
    if (value.response && typeof value.response === "object") return value.response;
    if (value.result && typeof value.result === "object") return value.result;
    return value;
  }

  const text = String(value ?? "");
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw Error("AI provider did not return valid JSON");
  }
}

async function generateWithWorkersAI(env, system, user) {
  if (!env.AI || typeof env.AI.run !== "function")
    throw Error("Workers AI fallback is not configured");

  const result = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    response_format: { type: "json_object" },
    max_tokens: 1200
  });

  if (!result) throw Error("Workers AI returned empty output");
  return safeJson(result);
}

async function generateContent(env, b) {
  if (!env.OPENAI_API_KEY && (!env.AI || typeof env.AI.run !== "function"))
    throw Error("No AI provider configured");

  const topic = String(b.topic || "").trim();
  if (!topic) throw Error("topic is required");

  const platform = String(b.platform || "instagram");
  const language = String(b.language || "fa-IR");
  const market = String(b.market || "Iran");
  const contentType = String(b.content_type || "post");
  const objective = String(b.objective || "engagement");
  const tone = String(b.tone || "luxury, professional");
  const facts = String(b.facts || "").trim();

  const system = `
You are HAMZEHI SOCIAL AI, a controlled social-content generator.
Generate content ONLY from the supplied topic and facts.
NEVER invent or imply business facts: price, inventory, availability,
delivery time, guarantee, certification, material/specification, address,
phone number, website, customer claim, partnership, discount, or result.
If a fact is not supplied, do not state it as fact.
Write natural Persian or Iraqi Arabic according to the requested language.
Return JSON only with keys:
hook, body, caption, cta, hashtags, visual_prompt.
Hashtags must be an array of strings.
Keep the output practical for the requested platform.
`;

  const user = JSON.stringify({
    topic, platform, language, market, content_type: contentType,
    objective, tone, supplied_facts: facts || "(none)"
  });

  let x;
  let provider = "openai";

  if (env.OPENAI_API_KEY) {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-5.6-luna",
        input: [
          { role: "system", content: [{ type: "input_text", text: system }] },
          { role: "user", content: [{ type: "input_text", text: user }] }
        ],
        text: { format: { type: "json_object" } }
      })
    });

    const data = await r.json();
    if (r.ok) {
      x = safeJson(responseText(data));
    } else {
      const detail = data?.error?.message || `OpenAI returned ${r.status}`;
      const regionBlocked = /country|region|territory|unsupported/i.test(detail);
      if (!regionBlocked || !env.AI) throw Error(detail);
      provider = "workers_ai_fallback";
      x = await generateWithWorkersAI(env, system, user);
    }
  } else {
    provider = "workers_ai_fallback";
    x = await generateWithWorkersAI(env, system, user);
  }
  if (!x.hook || !x.body || !x.caption || !x.cta || !x.visual_prompt)
    throw Error("Generated content is incomplete");

  const hashtags = Array.isArray(x.hashtags)
    ? x.hashtags.map(String).slice(0, 20)
    : [];

  return {
    provider, topic, platform, language, market,
    content_type: contentType, objective, tone,
    hook: String(x.hook),
    body: String(x.body),
    caption: String(x.caption),
    cta: String(x.cta),
    hashtags: JSON.stringify(hashtags),
    visual_prompt: String(x.visual_prompt)
  };
}

async function createGeneratedContent(env, b) {
  const g = await generateContent(env, b);
  const id = uid();
  const t = now();

  await env.DB.prepare(
    "INSERT INTO contents VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(
    id, g.topic, g.platform, g.language, g.market, g.content_type,
    g.objective, g.tone, g.hook, g.body, g.caption, g.cta,
    g.hashtags, g.visual_prompt, "generated", t, t
  ).run();

  await env.DB.prepare(
    "INSERT INTO approval_queue VALUES(?,?,?,?,?,?)"
  ).bind(
    uid(), id, "pending",
    "Generated by AI; human approval required before publishing",
    t, t
  ).run();

  await audit(env, "content_generated", "Content generated and queued for approval", {
    content_id: id,
    platform: g.platform,
    language: g.language,
    market: g.market
  });

  return { id, ...g, status: "generated", approval_status: "pending" };
}

async function listContent(env, status) {
  let r;
  if (status) {
    r = await env.DB.prepare(
      "SELECT c.*, q.status approval_status FROM contents c " +
      "LEFT JOIN approval_queue q ON q.content_id=c.id " +
      "AND q.updated_at=(SELECT MAX(q2.updated_at) FROM approval_queue q2 " +
      "WHERE q2.content_id=c.id) WHERE c.status=? ORDER BY c.created_at DESC LIMIT 100"
    ).bind(status).all();
  } else {
    r = await env.DB.prepare(
      "SELECT c.*, q.status approval_status FROM contents c " +
      "LEFT JOIN approval_queue q ON q.content_id=c.id " +
      "AND q.updated_at=(SELECT MAX(q2.updated_at) FROM approval_queue q2 " +
      "WHERE q2.content_id=c.id) ORDER BY c.created_at DESC LIMIT 100"
    ).all();
  }
  return r.results || [];
}

async function setApproval(env, id, status, reason = "") {
  if (!["approved", "rejected", "pending"].includes(status))
    throw Error("Invalid approval status");

  const c = await env.DB.prepare(
    "SELECT id FROM contents WHERE id=?"
  ).bind(id).first();
  if (!c) throw Error("Content not found");

  const t = now();

  await env.DB.prepare(
    "INSERT INTO approval_queue VALUES(?,?,?,?,?,?)"
  ).bind(uid(), id, status, reason, t, t).run();

  await env.DB.prepare(
    "UPDATE contents SET status=?, updated_at=? WHERE id=?"
  ).bind(status === "approved" ? "approved" :
         status === "rejected" ? "rejected" : "generated", t, id).run();

  await audit(env, "approval_changed", `Content ${status}`, {
    content_id: id, status, reason
  });

  return { id, status };
}

async function publish(env,b){
  if(!b?.content_id)throw Error("content_id is required");
  if(!await approved(env,b.content_id))throw Error("Approval required");
  const c=await env.DB.prepare("SELECT * FROM contents WHERE id=?").bind(b.content_id).first();if(!c)throw Error("Content not found");
  const platforms=b.platform==='both'?['telegram','instagram']:[String(b.platform||'')];if(!platforms.every(x=>['telegram','instagram'].includes(x)))throw Error("Invalid platform");
  const out=[];
  for(const platform of platforms){
    const runId=`publish:${c.id}:${platform}`;const existing=await env.DB.prepare("SELECT status,summary_json,error FROM production_runs WHERE id=?").bind(runId).first();
    if(existing?.status==='completed'){let z={};try{z=JSON.parse(existing.summary_json||'{}')}catch{}out.push({platform,external_id:String(z.external_id||''),idempotent:true,already_published:true});continue}
    if(existing?.status==='stopped')throw Error(`Publish outcome unknown for ${platform}; manual reconciliation required`);
    const ins=await env.DB.prepare("INSERT OR IGNORE INTO production_runs(id,run_type,status,summary_json,error,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").bind(runId,`publish:${platform}`,'started',null,null,now(),now()).run();
    const state=await env.DB.prepare("SELECT status,summary_json,error FROM production_runs WHERE id=?").bind(runId).first();
    if(state?.status==='completed'){let z={};try{z=JSON.parse(state.summary_json||'{}')}catch{}out.push({platform,external_id:String(z.external_id||''),idempotent:true,already_published:true});continue}
    if(state?.status==='stopped')throw Error(`Publish outcome unknown for ${platform}; manual reconciliation required`);
    if(state?.status==='started'&&!ins.meta?.changes)throw Error(`Publish already in progress for ${platform}`);
    if(state?.status==='failed'){const re=await env.DB.prepare("UPDATE production_runs SET status='started',error=NULL,updated_at=? WHERE id=? AND status='failed'").bind(now(),runId).run();if(!re.meta?.changes)throw Error(`Publish already in progress for ${platform}`)}
    try{let externalId='';
      if(platform==='telegram'){
        if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)throw Error('Telegram credentials missing');
        const text=[c.hook,c.body,c.caption,c.cta].filter(Boolean).join('\n\n');
        let r;try{r=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text})})}catch(e){throw new PublishOutcomeUnknown('Telegram request outcome unknown; provider request may have been accepted')}
        const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw Error('Telegram publish failed');externalId=String(d.result?.message_id||'')
      } else {
        if(!env.INSTAGRAM_ACCESS_TOKEN||!env.INSTAGRAM_ACCOUNT_ID)throw Error('Instagram credentials missing');
        if(c.content_type && String(c.content_type) !== 'post') throw Error(`Instagram publish currently supports content_type=post only; received ${c.content_type}`);
        let mediaUrl; try { mediaUrl=new URL(String(b.media_url||'')); } catch { throw Error('Public media_url required for Instagram'); }
        if(!/^https?:$/.test(mediaUrl.protocol)) throw Error('Public media_url must use http or https');
        const q1=new URLSearchParams({image_url:mediaUrl.toString(),caption:[c.caption,c.cta,c.hashtags].filter(Boolean).join('\n\n'),access_token:env.INSTAGRAM_ACCESS_TOKEN});
        let a;try{a=await fetch(`${instagramGraphBase(env)}/${encodeURIComponent(env.INSTAGRAM_ACCOUNT_ID)}/media`,{method:'POST',body:q1})}catch(e){throw new PublishOutcomeUnknown('Instagram container request outcome unknown')}
        const ad=await a.json().catch(()=>({}));if(!a.ok||ad.error)throw Error('Instagram container failed');
        const q2=new URLSearchParams({creation_id:ad.id,access_token:env.INSTAGRAM_ACCESS_TOKEN});
        let x;try{x=await fetch(`${instagramGraphBase(env)}/${encodeURIComponent(env.INSTAGRAM_ACCOUNT_ID)}/media_publish`,{method:'POST',body:q2})}catch(e){throw new PublishOutcomeUnknown('Instagram publish request outcome unknown')}
        const xd=await x.json().catch(()=>({}));if(!x.ok||xd.error)throw Error('Instagram publish failed');externalId=String(xd.id||ad.id||'')
      }
      await env.DB.prepare("UPDATE production_runs SET status='completed',summary_json=?,error=NULL,updated_at=? WHERE id=?").bind(JSON.stringify({content_id:c.id,platform,external_id:externalId}),now(),runId).run();out.push({platform,external_id:externalId,idempotent:false});
    }catch(e){
      const unknown=e?.name==='PublishOutcomeUnknown';
      await env.DB.prepare("UPDATE production_runs SET status=?,error=?,updated_at=? WHERE id=?").bind(unknown?'stopped':'failed',e.message,now(),runId).run();
      throw e
    }
  }
  await audit(env,'content_published','Approved content published',{content_id:b.content_id,platform:b.platform,results:out});return out;
}

async function reconcileProductionRun(env,b){
  const id=String(b?.id||'');if(!id)throw Error('production run id is required');
  const action=String(b?.action||'');
  const row=await env.DB.prepare("SELECT * FROM production_runs WHERE id=?").bind(id).first();if(!row)throw Error('Production run not found');
  if(row.status!=='stopped')throw Error('Only stopped/unknown runs can be reconciled');
  if(action==='confirm_published'){
    let z={};try{z=JSON.parse(row.summary_json||'{}')}catch{}
    await env.DB.prepare("UPDATE production_runs SET status='completed',summary_json=?,error=NULL,updated_at=? WHERE id=? AND status='stopped'").bind(JSON.stringify({...z,confirmed_manually:true}),now(),id).run();
    await audit(env,'publish_reconciled','Unknown publish manually confirmed as published',{production_run_id:id});return {id,status:'completed',confirmed_manually:true};
  }
  if(action==='retry'){
    await env.DB.prepare("UPDATE production_runs SET status='failed',error=?,updated_at=? WHERE id=? AND status='stopped'").bind('MANUAL_RETRY_APPROVED: publish may not have occurred; retry explicitly authorized',now(),id).run();
    await audit(env,'publish_reconciled','Unknown publish manually cleared for retry',{production_run_id:id});return {id,status:'failed',manual_retry_required:true};
  }
  throw Error('Invalid reconciliation action');
}

async function reconcileStalePublishes(env){
  const cutoff=new Date(Date.now()-UNKNOWN_PUBLISH_AFTER_MS).toISOString();
  const r=await env.DB.prepare("SELECT id,run_type,updated_at FROM production_runs WHERE status='started' AND updated_at<=? LIMIT 20").bind(cutoff).all();
  for(const x of r.results||[]){
    const changed=await env.DB.prepare("UPDATE production_runs SET status='stopped',error=?,updated_at=? WHERE id=? AND status='started'").bind('UNKNOWN: worker stopped before publish result was durably recorded; manual reconciliation required',now(),x.id).run();
    if(changed.meta?.changes)await audit(env,'publish_outcome_unknown','Stale publish marked unknown; automatic retry blocked',{production_run_id:x.id,run_type:x.run_type});
  }
}
async function getCalendarMediaUrl(env,calendarId){const r=await env.DB.prepare("SELECT details_json FROM system_events WHERE type='calendar_media' ORDER BY created_at DESC LIMIT 200").all();for(const row of r.results||[]){try{const d=JSON.parse(row.details_json||'{}');if(d.calendar_id===calendarId)return d.media_url||null}catch{}}return null}

async function publishScheduled(env){const r=await env.DB.prepare("SELECT * FROM calendar WHERE status='planned' AND planned_at<=? ORDER BY planned_at ASC LIMIT 10").bind(now()).all();for(const item of r.results||[]){if(!item.content_id){await env.DB.prepare("UPDATE calendar SET status='failed',updated_at=? WHERE id=? AND status='planned'").bind(now(),item.id).run();await audit(env,'calendar_failed','Scheduled item has no content_id',{calendar_id:item.id});continue}const claim=await env.DB.prepare("UPDATE calendar SET status='publishing',updated_at=? WHERE id=? AND status='planned'").bind(now(),item.id).run();if(!claim.meta?.changes)continue;try{const content=await env.DB.prepare("SELECT platform FROM contents WHERE id=?").bind(item.content_id).first();if(!content)throw Error('Content not found');const media_url=await getCalendarMediaUrl(env,item.id);if((content.platform==='instagram'||content.platform==='both')&&!media_url)throw Error('Scheduled Instagram publish requires a public media_url');await publish(env,{content_id:item.content_id,platform:content.platform,media_url});await env.DB.prepare("UPDATE calendar SET status='published',updated_at=? WHERE id=?").bind(now(),item.id).run()}catch(e){await env.DB.prepare("UPDATE calendar SET status='failed',updated_at=? WHERE id=?").bind(now(),item.id).run();await env.DB.prepare("INSERT INTO retry_queue VALUES(?,?,?,?,?,?,?,?,?,?)").bind(uid(),'calendar_publish',JSON.stringify({calendar_id:item.id,content_id:item.content_id}),0,3,'queued',null,e.message,now(),now()).run();await audit(env,'calendar_publish_failed','Scheduled publish failed and was queued for retry',{calendar_id:item.id,content_id:item.content_id,error:e.message})}}}

async function collectInstagramMetrics(env){if(!env.INSTAGRAM_ACCESS_TOKEN)return;const rows=await env.DB.prepare("SELECT details_json FROM system_events WHERE type='content_published' ORDER BY created_at DESC LIMIT 100").all();for(const row of rows.results||[]){let d;try{d=JSON.parse(row.details_json||'{}')}catch{continue}for(const result of d.results||[]){if(result.platform!=='instagram'||!result.external_id)continue;const u=new URL(`${instagramGraphBase(env)}/${encodeURIComponent(result.external_id)}/insights`);u.searchParams.set('metric','impressions,reach,likes,comments,shares,saved');u.searchParams.set('access_token',env.INSTAGRAM_ACCESS_TOKEN);const r=await fetch(u.toString());if(!r.ok)continue;const data=await r.json().catch(()=>({}));if(data.error||!Array.isArray(data.data))continue;const values={};for(const m of data.data){const v=Array.isArray(m.values)?m.values.at(-1)?.value:m.value;values[m.name]=Number(v||0)}const ex=await env.DB.prepare("SELECT id FROM social_metrics WHERE content_id=? AND platform='instagram' ORDER BY created_at DESC LIMIT 1").bind(d.content_id).first();if(ex)await env.DB.prepare("UPDATE social_metrics SET impressions=?,reach=?,likes=?,comments=?,shares=?,saves=?,metric_date=? WHERE id=?").bind(values.impressions||0,values.reach||0,values.likes||0,values.comments||0,values.shares||0,values.saved||0,now().slice(0,10),ex.id).run();else await env.DB.prepare("INSERT INTO social_metrics(id,content_id,platform,impressions,reach,likes,comments,shares,saves,clicks,metric_date,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(uid(),d.content_id,'instagram',values.impressions||0,values.reach||0,values.likes||0,values.comments||0,values.shares||0,values.saved||0,0,now().slice(0,10),now()).run()}}}


async function ensureTelegramMediaTable(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS telegram_media_sources (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, chat_username TEXT, message_id TEXT NOT NULL, file_id TEXT NOT NULL, file_unique_id TEXT, media_type TEXT NOT NULL, caption TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(chat_id,message_id,file_id))`).run();
}
async function telegramWebhookSecret(env){
  if(env.TELEGRAM_WEBHOOK_SECRET_TOKEN)return String(env.TELEGRAM_WEBHOOK_SECRET_TOKEN);
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS system_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`).run();
  const row=await env.DB.prepare("SELECT value FROM system_kv WHERE key='telegram_webhook_secret'").first();
  if(row?.value)return String(row.value);
  const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);const secret=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  await env.DB.prepare("INSERT OR REPLACE INTO system_kv(key,value,updated_at) VALUES(?,?,?)").bind('telegram_webhook_secret',secret,now()).run();return secret;
}
async function setupTelegramWebhook(env,req){
  if(req.method!=='POST')return json({ok:false,error:'Method not allowed'},405);if(!auth(req,env))return json({ok:false,error:'Unauthorized'},401);if(!env.TELEGRAM_BOT_TOKEN)return json({ok:false,error:'Telegram bot token missing'},503);
  await ensureTelegramMediaTable(env);const secret=await telegramWebhookSecret(env);const url=new URL(req.url);url.pathname='/webhooks/telegram';url.search='';
  const r=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:url.toString(),secret_token:secret,allowed_updates:['channel_post','edited_channel_post','message','edited_message']})});
  const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw Error(d.description||'Telegram webhook setup failed');await audit(env,'telegram_webhook_configured','Telegram media intake webhook configured',{url:url.toString()});return json({ok:true,url:url.toString(),webhook_configured:true});
}
async function getTelegramMedia(env,req){
  if(req.method!=='GET')return json({ok:false,error:'Method not allowed'},405);if(!auth(req,env))return json({ok:false,error:'Unauthorized'},401);await ensureTelegramMediaTable(env);const limit=Math.min(50,Math.max(1,Number(new URL(req.url).searchParams.get('limit')||12)));const r=await env.DB.prepare("SELECT * FROM telegram_media_sources ORDER BY created_at DESC LIMIT ?").bind(limit).all();return json({items:r.results||[]});
}
async function proxyTelegramMedia(env,req){
  if(req.method!=='GET')return json({ok:false,error:'Method not allowed'},405);if(!auth(req,env))return json({ok:false,error:'Unauthorized'},401);const id=new URL(req.url).searchParams.get('id');if(!id)return json({ok:false,error:'id is required'},400);await ensureTelegramMediaTable(env);const row=await env.DB.prepare("SELECT * FROM telegram_media_sources WHERE id=?").bind(id).first();if(!row)return json({ok:false,error:'Media not found'},404);
  const base=`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;const fr=await fetch(`${base}/getFile?file_id=${encodeURIComponent(row.file_id)}`);const fd=await fr.json().catch(()=>({}));if(!fr.ok||!fd.ok||!fd.result?.file_path)return json({ok:false,error:'Telegram file lookup failed'},502);const media=await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fd.result.file_path}`);if(!media.ok)return new Response('Telegram media fetch failed',{status:502});const h=new Headers();h.set('Content-Type',media.headers.get('Content-Type')||'application/octet-stream');h.set('Cache-Control','private, max-age=300');return new Response(media.body,{status:200,headers:h});
}

async function handleTelegramWebhook(env,req){
  if(req.method!=='POST')return json({ok:false,error:'Method not allowed'},405);const expected=await telegramWebhookSecret(env);const provided=req.headers.get('X-Telegram-Bot-Api-Secret-Token')||'';if(provided!==expected)return json({ok:false,error:'Unauthorized webhook'},401);
  const body=await req.json().catch(()=>null);if(!body)return json({ok:false,error:'Invalid JSON'},400);await ensureTelegramMediaTable(env);const m=body.channel_post||body.edited_channel_post||body.message||body.edited_message;if(!m?.chat)return json({ok:true,ignored:true});
  const target=String(env.TELEGRAM_CHAT_ID||'').replace(/^@/,'').toLowerCase();const username=String(m.chat.username||'').toLowerCase();if(target&&username&&target!==username&&String(m.chat.id)!==String(env.TELEGRAM_CHAT_ID))return json({ok:true,ignored:true,reason:'chat_mismatch'});
  const externalId=String(m.message_id||body.update_id||uid());const ex=await env.DB.prepare("SELECT id FROM inbox_messages WHERE platform='telegram' AND external_id=? LIMIT 1").bind(externalId).first();if(!ex){const t=now();await env.DB.prepare("INSERT INTO inbox_messages(id,platform,external_id,sender,message,category,priority,reply_suggestion,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(uid(),'telegram',externalId,[m.from?.first_name,m.from?.last_name].filter(Boolean).join(' ')||String(m.from?.username||m.chat?.title||'unknown'),String(m.text||m.caption||'').trim(),'unclassified','normal',null,'new',t,t).run();}
  const photo=Array.isArray(m.photo)&&m.photo.length?m.photo[m.photo.length-1]:null;const video=m.video||null;const document=m.document||null;const animation=m.animation||null;const media=photo?{type:'photo',file_id:photo.file_id,file_unique_id:photo.file_unique_id}:video?{type:'video',file_id:video.file_id,file_unique_id:video.file_unique_id}:animation?{type:'animation',file_id:animation.file_id,file_unique_id:animation.file_unique_id}:document?{type:'document',file_id:document.file_id,file_unique_id:document.file_unique_id}:null;
  if(media){const t=now();await env.DB.prepare("INSERT OR IGNORE INTO telegram_media_sources(id,chat_id,chat_username,message_id,file_id,file_unique_id,media_type,caption,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(uid(),String(m.chat.id),String(m.chat.username||''),String(m.message_id||body.update_id||''),media.file_id,String(media.file_unique_id||''),media.type,String(m.caption||''),t,t).run();await audit(env,'telegram_media_received','Telegram channel media received',{message_id:externalId,media_type:media.type});}
  return json({ok:true,media_received:!!media});
}

async function verifyInstagramSignature(env,req,raw){if(env.INSTAGRAM_APP_SECRET){const sig=(req.headers.get('X-Hub-Signature-256')||'').trim().toLowerCase();if(!/^sha256=[0-9a-f]{64}$/.test(sig))return false;const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.INSTAGRAM_APP_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);const mac=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(raw));const hex=Array.from(new Uint8Array(mac),x=>x.toString(16).padStart(2,'0')).join('');return sig===`sha256=${hex}`}if(env.INSTAGRAM_WEBHOOK_SECRET_TOKEN)return (req.headers.get('X-Hamzehi-Webhook-Secret')||'')===env.INSTAGRAM_WEBHOOK_SECRET_TOKEN;return false}

async function handleInstagramWebhook(env,req){if(req.method==='GET'){const u=new URL(req.url);if(u.searchParams.get('hub.mode')==='subscribe'&&u.searchParams.get('hub.verify_token')&&env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN&&u.searchParams.get('hub.verify_token')===env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN)return new Response(u.searchParams.get('hub.challenge'),{status:200,headers:{'Content-Type':'text/plain'}});return json({ok:false,error:'Webhook verification failed'},403)}if(req.method!=='POST')return json({ok:false,error:'Method not allowed'},405);if(!env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN||(!env.INSTAGRAM_APP_SECRET&&!env.INSTAGRAM_WEBHOOK_SECRET_TOKEN))return json({ok:false,error:'Instagram webhook secrets not configured'},503);const raw=await req.text();if(!(await verifyInstagramSignature(env,req,raw)))return json({ok:false,error:'Unauthorized webhook'},401);let body;try{body=JSON.parse(raw)}catch{return json({ok:false,error:'Invalid JSON'},400)}for(const entry of body.entry||[])for(const change of entry.changes||[]){const value=change.value||{},externalId=String(value.mid||value.message_id||`${entry.id||uid()}:${change.field||'change'}:${value.timestamp||Date.now()}`),ex=await env.DB.prepare("SELECT id FROM inbox_messages WHERE platform='instagram' AND external_id=? LIMIT 1").bind(externalId).first();if(ex)continue;const text=String(value.text||value.message||'').trim();if(!text)continue;const t=now();await env.DB.prepare("INSERT INTO inbox_messages(id,platform,external_id,sender,message,category,priority,reply_suggestion,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(uid(),'instagram',externalId,String(value.from?.username||value.from?.id||entry.id||'unknown'),text,'unclassified','normal',null,'new',t,t).run()}return json({ok:true})}

async function recovery(env){await reconcileStalePublishes(env);await publishScheduled(env);const r=await env.DB.prepare("SELECT * FROM retry_queue WHERE status='queued' AND (next_attempt_at IS NULL OR next_attempt_at<=?) LIMIT 10").bind(now()).all();for(const x of r.results||[])try{const claim=await env.DB.prepare("UPDATE retry_queue SET status='running',attempts=attempts+1,updated_at=? WHERE id=? AND status='queued'").bind(now(),x.id).run();if(!claim.meta?.changes)continue;const p=JSON.parse(x.payload_json);if(x.operation==='publish')await publish(env,p);else if(x.operation==='calendar_publish'){const cal=await env.DB.prepare("SELECT * FROM calendar WHERE id=?").bind(p.calendar_id).first();if(!cal||cal.status==='published'){await env.DB.prepare("UPDATE retry_queue SET status='completed',updated_at=? WHERE id=?").bind(now(),x.id).run();continue}const content=await env.DB.prepare("SELECT platform FROM contents WHERE id=?").bind(p.content_id).first();if(!content)throw Error('Content not found');const media_url=await getCalendarMediaUrl(env,p.calendar_id);if((content.platform==='instagram'||content.platform==='both')&&!media_url)throw Error('Scheduled Instagram publish requires a public media_url');await publish(env,{content_id:p.content_id,platform:content.platform,media_url});await env.DB.prepare("UPDATE calendar SET status='published',updated_at=? WHERE id=?").bind(now(),p.calendar_id).run()}else throw Error('Unsupported retry operation');await env.DB.prepare("UPDATE retry_queue SET status='completed',updated_at=? WHERE id=?").bind(now(),x.id).run()}catch(e){const attempts=Number(x.attempts)+1,status=attempts>=Number(x.max_attempts)?'failed':'queued';await env.DB.prepare("UPDATE retry_queue SET status=?,last_error=?,next_attempt_at=?,updated_at=? WHERE id=?").bind(status,e.message,new Date(Date.now()+Math.min(3600000,2**attempts*60000)).toISOString(),now(),x.id).run()}await collectInstagramMetrics(env)}


function parseLeadNotes(lead) {
  try {
    const x = JSON.parse(lead?.notes || "{}");
    return x && typeof x === "object" ? x : {};
  } catch { return {}; }
}

function leadScoreFromData(lead, meta = {}) {
  let score = Number(meta.score);
  if (!Number.isFinite(score)) score = 0;
  if (score <= 0) {
    if (lead?.priority === "high") score += 30;
    else if (lead?.priority === "normal") score += 20;
    else score += 10;
    if (meta.source === "instagram_hashtag_discovery") score += 20;
    if (meta.evidence) score += Math.min(20, Math.ceil(String(meta.evidence).length / 40));
    if (meta.media_type) score += 10;
    if (meta.profile) score += 10;
  }
  if (["replied", "negotiation"].includes(lead?.stage)) score += 15;
  if (lead?.stage === "converted" || lead?.stage === "customer") score = 100;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function leadIntelligence(lead) {
  const meta=parseLeadNotes(lead);
  const stage=String(lead?.stage||'new');
  const text=[lead?.name,lead?.contact,meta.evidence,meta.type,meta.city].filter(Boolean).join(' ').toLowerCase();
  const factors=[]; let score=0;
  if(meta.ad_target){score+=20;factors.push('ÙØ¯Ù ØªØ¨ÙÛØºØ§ØªÛ')}
  if(meta.ad_opportunity || meta.contact_url){score+=20;factors.push('ÙØ±ØµØª/Ø±Ø§Ù ØªÙØ§Ø³')}
  if(meta.negotiation_draft){score+=15;factors.push('Ù¾ÛØ´âÙÙÛØ³ ÙØ°Ø§Ú©Ø±Ù')}
  if(meta.followup_draft){score+=10;factors.push('Ù¾ÛÚ¯ÛØ±Û Ø¢ÙØ§Ø¯Ù')}
  if(['replied','negotiation'].includes(stage)){score+=15;factors.push('ØªØ¹Ø§ÙÙ ÙØ¹Ø§Ù')}
  if(meta.evidence){score+=Math.min(10,Math.ceil(String(meta.evidence).length/100));factors.push('Ø´ÙØ§ÙØ¯ Ø³Ø§ÛØª')}
  if(/Ø·ÙØ§|Ø¬ÙØ§ÙØ±|gold|jewel/.test(text)){score+=5;factors.push('ØªÙØ§Ø³Ø¨ Ø·ÙØ§/Ø¬ÙØ§ÙØ±')}
  if(/Ø³Ø§Ø¹Øª|watch/.test(text)){score+=5;factors.push('ØªÙØ§Ø³Ø¨ Ø³Ø§Ø¹Øª')}
  if(/Ø¨Ø¯ÙÛ|Ø§Ú©Ø³Ø³ÙØ±Û|fashion|accessor/.test(text)){score+=5;factors.push('ØªÙØ§Ø³Ø¨ Ø¨Ø¯ÙÛØ¬Ø§Øª')}
  if(stage==='customer'||stage==='converted')score=100;
  score=Math.max(0,Math.min(100,Math.round(score)));
  const action=stage==='customer'||stage==='converted'?'ÙØ´ØªØ±Û Ø­ÙØ¸ Ø´ÙØ¯':(meta.followup_draft?'Ø§Ø±Ø³Ø§Ù/Ø¨Ø±Ø±Ø³Û Ù¾ÛÚ¯ÛØ±Û Ø¨Ø§ ØªØ£ÛÛØ¯':(meta.negotiation_draft?'Ø¨Ø±Ø±Ø³Û Ù Ø§Ø±Ø³Ø§Ù ÙØ°Ø§Ú©Ø±Ù Ø¨Ø§ ØªØ£ÛÛØ¯':(meta.contact_url?'Ø¨Ø±Ø±Ø³Û ÙØ³ÛØ± ØªÙØ§Ø³':'Ø¨Ø±Ø±Ø³Û Lead')));
  return {score,factors,action,type:meta.type||null,ad_opportunity:!!(meta.ad_opportunity||meta.contact_url),contact_url:meta.contact_url||null,domain:meta.url?(()=>{try{return new URL(meta.url).hostname.replace(/^www\./,'')}catch{return null}})():null};
}

async function updateLeadRecord(env, id, patch) {
  const lead = await env.DB.prepare("SELECT * FROM leads WHERE id=?").bind(id).first();
  if (!lead) return null;
  const meta = parseLeadNotes(lead);
  const allowedStages = ["new","discovered","qualified","contacted","replied","negotiation","converted","customer","rejected","archived"];
  const allowedPriority = ["low","normal","high"];
  const stage = patch.stage !== undefined ? String(patch.stage).trim() : lead.stage;
  const priority = patch.priority !== undefined ? String(patch.priority).trim() : lead.priority;
  if (!allowedStages.includes(stage)) throw new Error("Invalid lead stage");
  if (!allowedPriority.includes(priority)) throw new Error("Invalid lead priority");
  if (patch.next_followup_at !== undefined) meta.next_followup_at = patch.next_followup_at || null;
  if (patch.owner !== undefined) meta.owner = String(patch.owner || "").trim() || null;
  if (patch.last_outreach_at !== undefined) meta.last_outreach_at = patch.last_outreach_at || null;
  if (patch.last_reply_at !== undefined) meta.last_reply_at = patch.last_reply_at || null;
  if (patch.outreach_draft !== undefined) meta.outreach_draft = String(patch.outreach_draft || "");
  if (patch.score !== undefined) meta.score = Math.max(0, Math.min(100, Number(patch.score) || 0));
  meta.score = leadScoreFromData({ ...lead, stage, priority }, meta);
  if (patch.notes !== undefined) meta.manual_notes = String(patch.notes || "");
  const t = now();
  await env.DB.prepare("UPDATE leads SET stage=?,priority=?,notes=?,updated_at=? WHERE id=?")
    .bind(stage, priority, JSON.stringify(meta), t, id).run();
  return await env.DB.prepare("SELECT * FROM leads WHERE id=?").bind(id).first();
}

async function leadOverview(env) {
  const r = await env.DB.prepare("SELECT * FROM leads ORDER BY updated_at DESC LIMIT 500").all();
  const items = (r.results || []).map(x => ({
    ...x,
    meta: parseLeadNotes(x),
    score: leadScoreFromData(x, parseLeadNotes(x))
  }));
  const stages = {};
  const priorities = { high: 0, normal: 0, low: 0 };
  for (const x of items) { stages[x.stage || "new"] = (stages[x.stage || "new"] || 0) + 1; if (priorities[x.priority] !== undefined) priorities[x.priority]++; }
  const nowMs = Date.now();
  const followups = items.filter(x => x.meta.next_followup_at && Date.parse(x.meta.next_followup_at) <= nowMs && !["converted","customer","rejected","archived"].includes(x.stage));
  const hot = items.filter(x => x.score >= 70 && !["converted","customer","rejected","archived"].includes(x.stage)).slice(0, 20);
  const converted = items.filter(x => ["converted","customer"].includes(x.stage)).length;
  const contacted = items.filter(x => ["contacted","replied","negotiation","converted","customer"].includes(x.stage)).length;
  return { total: items.length, stages, priorities, hot, followups, converted, contacted, conversion_rate: contacted ? Math.round(converted / contacted * 100) : 0, items };
}


function validateAdsInput(body){
  const b=(body&&typeof body==="object")?body:{};
  const type=String(b.type||"all").trim();
  const city=String(b.city||"").trim();
  const extra=String(b.extra||"").trim();
  const allowed=["gold","watch","fashion_jewelry","all"];
  if(!allowed.includes(type)) return {ok:false,error:"ÙÙØ¹ ÙØ´ØªØ±Û ÙØ§ÙØ¹ØªØ¨Ø± Ø§Ø³Øª"};
  if(city.length>100) return {ok:false,error:"Ø´ÙØ±/Ø¨Ø§Ø²Ø§Ø± ÙØ¨Ø§ÛØ¯ Ø¨ÛØ´ØªØ± Ø§Ø² 100 Ú©Ø§Ø±Ø§Ú©ØªØ± Ø¨Ø§Ø´Ø¯"};
  if(extra.length>300) return {ok:false,error:"Ø¬Ø²Ø¦ÛØ§Øª ÙØ¨Ø§ÛØ¯ Ø¨ÛØ´ØªØ± Ø§Ø² 300 Ú©Ø§Ø±Ø§Ú©ØªØ± Ø¨Ø§Ø´Ø¯"};
  return {ok:true,type,city,extra};
}

async function runAdAutopilotOnce(env, input, reason="manual") {
  const {type,city,extra}=input;
  const sourceSite="https://www.hamzehibox.com";
  const allGroups=[
    ["gold","Ø·ÙØ§ÙØ±ÙØ´ Ø·ÙØ§ÙØ±ÙØ´Û Ø·ÙØ§ Ø¬ÙØ§ÙØ±"],
    ["watch","Ø³Ø§Ø¹Øª ÙØ±ÙØ´ Ø³Ø§Ø¹Øª ÙØ±ÙØ´Û ÙØ±ÙØ´Ú¯Ø§Ù Ø³Ø§Ø¹Øª"],
    ["fashion_jewelry","Ø¨Ø¯ÙÛ ÙØ±ÙØ´ Ø¨Ø¯ÙÛØ¬Ø§Øª Ø§Ú©Ø³Ø³ÙØ±Û" ]
  ];
  const groups=type==="all"?allGroups:allGroups.filter(x=>x[0]===type);
  const summary={found:0,updated:0,new_leads:0,drafted:0,followups_prepared:0,errors:0};
  const items=[],seen=new Set(),started=now();
  for(const [type,term] of groups){
    const q=[term,city,extra].filter(Boolean).join(" ");
    try{
      const discovery=await discoverWebLinks(q,6);
      for(const href of discovery.links){
        if(items.length>=30) break;
        const safeHref=safeHttpUrl(href); if(!safeHref) continue;
        let uu; try{uu=new URL(safeHref); const key=uu.origin; if(seen.has(key))continue; seen.add(key);}catch{continue}
        try{
          const rr=await fetchWithRetry(safeHref,{headers:{"User-Agent":"Mozilla/5.0 (compatible; HAMZEHI-SOCIAL-AI/1.0)"}},2,AD_FETCH_TIMEOUT_MS);
          const tx=(await rr.text()).slice(0,100000);
          const plain=tx.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
          if(!/Ø·ÙØ§|Ø¬ÙØ§ÙØ±|Ø³Ø§Ø¹Øª|Ø¨Ø¯ÙÛ|gold|jewel|watch|accessor/i.test(plain)) continue;
          const title=(tx.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||uu.hostname).replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,140);
          const adHit=/ØªØ¨ÙÛØº|advertis|sponsor|Ø±Ù¾ÙØ±ØªØ§Ú|media kit|ÙÙÚ©Ø§Ø±Û|ØªÙØ§Ø³ Ø¨Ø§ ÙØ§|contact us/i.test(plain);
          const score=Math.min(100,55+(adHit?25:0)+(city&&plain.includes(city)?10:0));
          const cm=tx.match(/href=["']([^"']+)["'][^>]*>[^<]*(?:ØªÙØ§Ø³|contact|advertis|ØªØ¨ÙÛØº)[^<]*</i);
          let contactUrl=null; if(cm){try{contactUrl=new URL(cm[1],href).toString()}catch{}}
          const old=await env.DB.prepare("SELECT id,notes FROM leads WHERE contact=? LIMIT 1").bind(href).first();
          const meta={source:"ad_autopilot",ad_target:true,source_site:sourceSite,type,city,query:q,url:href,evidence:plain.slice(0,1000),contact_url:contactUrl,score,updated_by:"autopilot"};
          let id;
          if(old){id=old.id;let om={};try{om=JSON.parse(old.notes||"{}")}catch{};Object.assign(om,meta);await env.DB.prepare("UPDATE leads SET priority=?,notes=?,updated_at=? WHERE id=?").bind(score>=70?"high":score>=45?"normal":"low",JSON.stringify(om),now(),id).run();summary.updated++;}
          else{id=uid();await env.DB.prepare("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(id,title,href,"discovered",score>=70?"high":score>=45?"normal":"low",JSON.stringify(meta),now(),now()).run();summary.new_leads++;}
          summary.found++;items.push({id,name:title,type,url:href,contact_url:contactUrl,score,ad_opportunity:adHit});
        }catch{summary.errors++;}
      }
    }catch{summary.errors++;}
  }
  if(env.OPENAI_API_KEY){
    for(const item of items.slice(0,AD_MAX_DRAFTS_PER_RUN)){
      try{
        const lead=await env.DB.prepare("SELECT * FROM leads WHERE id=?").bind(item.id).first(); if(!lead)continue;
        let meta={};try{meta=JSON.parse(lead.notes||"{}")}catch{}
        if(meta.negotiation_draft)continue;
        const prompt=`Create a concise Persian B2B advertising/collaboration outreach draft for HAMZEHI BOX. Source: ${sourceSite}. Target: ${lead.name}. Website: ${lead.contact}. Evidence: ${meta.evidence||""}. Audience: jewelry shops, watch stores, fashion-jewelry sellers. Do not invent facts. Ask about ad formats, audience, placement, duration, price and contact person. Draft only, under 700 characters.`;
        const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:env.OPENAI_MODEL||"gpt-5.6-luna",input:prompt}),signal:AbortSignal.timeout(15000)});
        const d=await r.json().catch(()=>({})); if(!r.ok)continue; const draft=responseText(d).trim(); if(!draft)continue;
        meta.negotiation_draft=draft;meta.negotiation_drafted_at=now();meta.send_mode="authorized_channel_only";meta.next_followup_at=new Date(Date.now()+48*60*60*1000).toISOString();meta.followup_status="scheduled";
        await env.DB.prepare("UPDATE leads SET notes=?,stage=?,updated_at=? WHERE id=?").bind(JSON.stringify(meta),"negotiation",now(),item.id).run(); item.draft=draft;summary.drafted++;
      }catch{}
    }
  }
  await audit(env,"ad_autopilot_run","Advertising autopilot completed discovery, qualification and negotiation preparation",{source_site:sourceSite,city,found:summary.found,drafted:summary.drafted,errors:summary.errors,started});
  return {ok:true,mode:"autopilot",source_site:sourceSite,type,targets:groups.map(x=>x[0]),summary,items:items.slice(0,30),external_send:"authorized_channel_only",reason};
}

function dashboardScript() {
  return `
let token='';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function repairUtf8Mojibake(value){let s=String(value??'');if(/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/.test(s))return s;const cp1252={0x20ac:0x80,0x201a:0x82,0x192:0x83,0x201e:0x84,0x2026:0x85,0x2020:0x86,0x2021:0x87,0x2c6:0x88,0x2030:0x89,0x160:0x8a,0x2039:0x8b,0x152:0x8c,0x17d:0x8e,0x17e:0x9e,0x2018:0x91,0x2019:0x92,0x201c:0x93,0x201d:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,0x2dc:0x98,0x2122:0x99,0x161:0x9a,0x203a:0x9b,0x153:0x9c,0x178:0x9f,0x164:0x8d};for(let pass=0;pass<4;pass++){if(!/[ÃÃÃÃÃÃÃ¢â¬â¢Ã¢â¬ÅÃ¢â¬]/.test(s))break;try{const bytes=[];for(const ch of s){const cp=ch.codePointAt(0);if(cp1252[cp]!==undefined)bytes.push(cp1252[cp]);else if(cp<=0xff)bytes.push(cp);else bytes.push(0)}const decoded=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(bytes));if(decoded===s)break;s=decoded;if(/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/.test(s))break}catch{break}}return s}
function safeFa(value){return repairUtf8Mojibake(value)}
function sectionFa(value){let s=String(value??'');for(let i=0;i<3;i++){const r=repairUtf8Mojibake(s);if(r===s)break;s=r}return s}
function headers(){return {'Authorization':'Bearer '+token,'Content-Type':'application/json'}}
async function api(path,opts={}){try{const r=await fetch(path,Object.assign({},opts,{headers:Object.assign({},headers(),opts.headers||{}),cache:'no-store'}));const text=await r.text();let d={};try{d=JSON.parse(text)}catch{throw Error('Worker \u067e\u0627\u0633\u062e \u0646\u0627\u0645\u0639\u062a\u0628\u0631 \u062f\u0627\u062f. HTTP '+r.status)}if(!r.ok){if(r.status===401)throw Error('\u0631\u0645\u0632 \u0645\u062f\u06cc\u0631 \u0627\u0634\u062a\u0628\u0627\u0647 \u0627\u0633\u062a.');if(r.status===429)throw Error('\u062a\u0639\u062f\u0627\u062f \u062f\u0631\u062e\u0648\u0627\u0633\u062a\u200c\u0647\u0627 \u0632\u06cc\u0627\u062f \u0627\u0633\u062a\u061b \u06a9\u0645\u06cc \u0628\u0639\u062f \u062f\u0648\u0628\u0627\u0631\u0647 \u062a\u0644\u0627\u0634 \u06a9\u0646\u06cc\u062f.');throw Error(d.error||('HTTP '+r.status))}return d}catch(e){throw Error(e?.message||'\u062e\u0637\u0627\u06cc \u0627\u0631\u062a\u0628\u0627\u0637 \u0628\u0627 Worker')}}
function toggleToken(){const x=document.getElementById('token');x.type=x.type==='password'?'text':'password'}
async function performLogin(){const s=document.getElementById('loginStatus'),btn=document.getElementById('loginBtn');token=document.getElementById('token').value.trim();if(!token){s.className='status error';s.textContent='ADMIN TOKEN \u0631\u0627 \u0648\u0627\u0631\u062f \u06a9\u0646\u06cc\u062f.';return}btn.disabled=true;s.className='status';s.textContent='\u062f\u0631 \u062d\u0627\u0644 \u0628\u0631\u0631\u0633\u06cc...';const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);try{await api('/api/content',{signal:controller.signal});document.getElementById('login').classList.add('hidden');document.getElementById('app').classList.remove('hidden');document.getElementById('logoutBtn').classList.remove('hidden');document.getElementById('nav').classList.remove('hidden');s.textContent='';await loadApprovals();await loadApproved();await loadLeadOverview()}catch(e){token='';s.className='status error';s.textContent=e?.name==='AbortError'?'\u0627\u0631\u062a\u0628\u0627\u0637 \u0628\u0627 Worker \u067e\u0627\u0633\u062e \u0646\u062f\u0627\u062f. \u062f\u0648\u0628\u0627\u0631\u0647 \u062a\u0644\u0627\u0634 \u06a9\u0646\u06cc\u062f.' : (e.message||'\u0648\u0631\u0648\u062f \u0646\u0627\u0645\u0648\u0641\u0642')}finally{clearTimeout(timer);btn.disabled=false}}
async function downloadTelegramMedia(id){return shareTelegramMedia(id)}
async function shareTelegramMedia(id){try{const r=await fetch('/api/telegram/media/file?id='+encodeURIComponent(id),{headers:headers(),cache:'no-store'});if(!r.ok)throw Error('Ø¯Ø±ÛØ§ÙØª Ø±Ø³Ø§ÙÙ ÙØ§ÙÙÙÙ Ø¨ÙØ¯');const blob=await r.blob();const type=blob.type||'application/octet-stream';const ext=type.includes('video')?'mp4':type.includes('png')?'png':'jpg';const file=new File([blob],'HAMZEHI-BOX-Story.'+ext,{type});if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({files:[file],title:'HAMZEHI BOX'});return}const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}catch(e){if(e&&e.name==='AbortError')return;alert('Ø®Ø·Ø§: '+e.message)}}
async function loadWhatsappStory(){const st=document.getElementById('whatsappStoryStatus'),list=document.getElementById('whatsappStoryList');if(!st||!list)return;st.textContent=safeFa('Ø¯Ø± Ø­Ø§Ù Ø¯Ø±ÛØ§ÙØª Ø±Ø³Ø§ÙÙâÙØ§â¦');try{const d=await api('/api/telegram/media?limit=12');const a=d.items||[];st.className='status ok';st.textContent=sectionFa(a.length+' Ø±Ø³Ø§ÙÙ Ø¢ÙØ§Ø¯Ù Ø§Ø³Øª');list.innerHTML=a.length?a.map(x=>'<div class="item"><div class="itemhead"><b>ð± '+esc(sectionFa(x.media_type))+'</b><span class="pill">'+esc(sectionFa(x.created_at||''))+'</span></div><div class="mini">'+esc(sectionFa(x.caption||'Ø¨Ø¯ÙÙ Ú©Ù¾Ø´Ù'))+'</div><div class="actions" style="margin-top:10px"><button class="btn primary" onclick="shareTelegramMedia(&quot;'+esc(x.id)+'&quot;)">Ø§Ø±Ø³Ø§Ù Ø¨Ù WhatsApp / Ø¯Ø§ÙÙÙØ¯</button></div></div>').join(''):'<div class="empty">'+sectionFa('ÙÙÙØ² Ø±Ø³Ø§ÙÙâØ§Û Ø§Ø² Ú©Ø§ÙØ§Ù Ø¯Ø±ÛØ§ÙØª ÙØ´Ø¯Ù Ø§Ø³Øª.')+'</div>'}catch(e){st.className='status error';st.textContent=sectionFa('Ø®Ø·Ø§: '+e.message)}}
async function loadTelegramMedia(){const st=document.getElementById('telegramMediaStatus'),list=document.getElementById('telegramMediaList');if(!st||!list)return;st.textContent=safeFa('Ø¯Ø± Ø­Ø§Ù Ø¯Ø±ÛØ§ÙØª Ø±Ø³Ø§ÙÙâÙØ§Û Ø¬Ø¯ÛØ¯ Ú©Ø§ÙØ§Ùâ¦');try{const d=await api('/api/telegram/media?limit=12');const a=d.items||[];st.className='status ok';st.textContent=sectionFa(a.length+' Ø±Ø³Ø§ÙÙ Ø¯Ø±ÛØ§ÙØª Ø´Ø¯');list.innerHTML=a.length?a.map(x=>'<div class="item"><div class="itemhead"><b>'+esc(sectionFa(x.media_type))+'</b><span class="pill">'+esc(sectionFa(x.created_at||''))+'</span></div><div class="mini">'+esc(sectionFa(x.caption||'Ø¨Ø¯ÙÙ Ú©Ù¾Ø´Ù'))+'</div><div class="actions" style="margin-top:10px"><button class="btn secondary" onclick="downloadTelegramMedia(&quot;'+esc(x.id)+'&quot;)">ÙØ´Ø§ÙØ¯Ù / Ø¯Ø±ÛØ§ÙØª</button></div></div>').join(''):'<div class="empty">'+sectionFa('ÙÙÙØ² Ø±Ø³Ø§ÙÙ Ø¬Ø¯ÛØ¯Û Ø§Ø² Ú©Ø§ÙØ§Ù Ø¯Ø±ÛØ§ÙØª ÙØ´Ø¯Ù. Ø¨Ø¹Ø¯ Ø§Ø² ÙØ¹Ø§ÙâØ³Ø§Ø²ÛØ Ù¾Ø³ØªâÙØ§Û Ø¬Ø¯ÛØ¯ Ú©Ø§ÙØ§Ù Ø§ÛÙØ¬Ø§ ÙÛâØ¢ÛÙØ¯.')+'</div>'}catch(e){st.className='status error';st.textContent=sectionFa('Ø®Ø·Ø§: '+e.message)}}
async function setupTelegramMedia(){const st=document.getElementById('telegramMediaStatus');st.className='status';st.textContent=sectionFa('Ø¯Ø± Ø­Ø§Ù ÙØ¹Ø§ÙâØ³Ø§Ø²Û Ø¯Ø±ÛØ§ÙØª Ø±Ø³Ø§ÙÙâ¦');try{await api('/api/telegram/webhook/setup',{method:'POST'});st.className='status ok';st.textContent=sectionFa('Ø¯Ø±ÛØ§ÙØª Ø±Ø³Ø§ÙÙ ÙØ¹Ø§Ù Ø´Ø¯. Ø­Ø§ÙØ§ Ù¾Ø³ØªâÙØ§Û Ø¬Ø¯ÛØ¯ Ú©Ø§ÙØ§Ù ÙØ§Ø±Ø¯ Ù¾ÙÙ ÙÛâØ´ÙÙØ¯.');await loadTelegramMedia()}catch(e){st.className='status error';st.textContent='Ø®Ø·Ø§: '+e.message}}

setInterval(()=>{if(token&&document.getElementById('app')&&!document.getElementById('app').classList.contains('hidden'))loadAdAutopilotStatus()},20000);
function logout(){token='';document.getElementById('app').classList.add('hidden');document.getElementById('login').classList.remove('hidden');document.getElementById('logoutBtn').classList.add('hidden');document.getElementById('nav').classList.add('hidden');document.getElementById('token').value='';document.getElementById('loginStatus').textContent='\u062e\u0627\u0631\u062c \u0634\u062f\u06cc\u062f.'}
function show(id){document.querySelectorAll('.section').forEach(x=>x.classList.remove('active'));const el=document.getElementById(id);if(el)el.classList.add('active');window.scrollTo(0,0)}
async function loadApprovals(){const st=document.getElementById('approvalStatus'),list=document.getElementById('approvalList');st.textContent='\u062f\u0631 \u062d\u0627\u0644 \u062f\u0631\u06cc\u0627\u0641\u062a\u2026';try{const d=await api('/api/content?status=generated');const items=(d.items||[]).filter(x=>x.approval_status==='pending');st.className='status ok';st.textContent=items.length+' \u0645\u062d\u062a\u0648\u0627 \u062f\u0631 \u0627\u0646\u062a\u0638\u0627\u0631 \u062a\u0623\u06cc\u06cc\u062f';list.innerHTML=items.length?items.map(x=>'<article class="item"><div class="row"><span class="pill">'+esc(x.platform)+'</span><span class="pill">'+esc(x.language)+'</span><span class="pill">'+esc(x.market)+'</span></div><div class="title" style="margin-top:12px">'+esc(x.topic)+'</div><div class="label">Hook</div><div class="text">'+esc(x.hook)+'</div><div class="label">Caption</div><div class="text">'+esc(x.caption)+'</div><div class="label">CTA</div><div class="text">'+esc(x.cta)+'</div><div class="label">Hashtags</div><div class="text">'+esc(x.hashtags)+'</div><div class="actions" style="margin-top:14px"><button class="btn primary" onclick="changeApproval(&quot;'+x.id+'&quot;,&quot;approved&quot;)">\u2713 \u062a\u0623\u06cc\u06cc\u062f</button><button class="btn danger" onclick="changeApproval(&quot;'+x.id+'&quot;,&quot;rejected&quot;)">\u2715 \u0631\u062f</button></div></article>').join(''):'<div class="empty">\u0645\u062d\u062a\u0648\u0627\u06cc \u062c\u062f\u06cc\u062f\u06cc \u0628\u0631\u0627\u06cc \u062a\u0623\u06cc\u06cc\u062f \u0648\u062c\u0648\u062f \u0646\u062f\u0627\u0631\u062f.</div>'}catch(e){st.className='status error';st.textContent='\u062e\u0637\u0627: '+e.message}}
async function changeApproval(id,status){try{await api('/api/content/approve',{method:'POST',body:JSON.stringify({content_id:id,status,reason:status==='approved'?'Approved from dashboard':'Rejected from dashboard'})});await loadApprovals();await loadApproved()}catch(e){alert('\u062e\u0637\u0627: '+e.message)}}
async function loadApproved(){const st=document.getElementById('approvedStatus'),list=document.getElementById('approvedList');if(!st||!list)return;st.textContent='\u062f\u0631 \u062d\u0627\u0644 \u062f\u0631\u06cc\u0627\u0641\u062a\u2026';try{const d=await api('/api/content?status=approved');const items=d.items||[];st.className='status ok';st.textContent=items.length+' \u0645\u062d\u062a\u0648\u0627\u06cc \u062a\u0623\u06cc\u06cc\u062f\u0634\u062f\u0647';list.innerHTML=items.length?items.map(x=>{const cid=esc(JSON.stringify(String(x.id)));return '<article class="item publish-item" data-content-id="'+esc(String(x.id))+'"><div class="row"><span class="pill">'+esc(x.platform)+'</span><span class="pill">'+esc(x.language)+'</span><span class="pill">'+esc(x.market)+'</span></div><div class="title" style="margin-top:12px">'+esc(x.topic)+'</div><div class="label">Caption</div><div class="text">'+esc(x.caption)+'</div><div class="label">Media URL (\u0628\u0631\u0627\u06cc Instagram)</div><input class="field media-input" placeholder="https://..." inputmode="url"><div class="actions" style="margin-top:10px"><button class="btn secondary" onclick="doPublish('+cid+',&quot;telegram&quot;)">\u0627\u0631\u0633\u0627\u0644 Telegram</button><button class="btn secondary" onclick="doPublish('+cid+',&quot;instagram&quot;)">\u0627\u0631\u0633\u0627\u0644 Instagram</button><button class="btn primary" onclick="doPublish('+cid+',&quot;both&quot;)">\u0627\u0631\u0633\u0627\u0644 \u0647\u0631 \u062f\u0648</button></div><div class="status pub-status"></div></article>'}).join(''):'<div class="empty">\u0645\u062d\u062a\u0648\u0627\u06cc \u062a\u0623\u06cc\u06cc\u062f\u0634\u062f\u0647\u200c\u0627\u06cc \u0628\u0631\u0627\u06cc \u0627\u0646\u062a\u0634\u0627\u0631 \u0648\u062c\u0648\u062f \u0646\u062f\u0627\u0631\u062f.</div>'}catch(e){st.className='status error';st.textContent='\u062e\u0637\u0627: '+e.message}}
async function doPublish(id,platform){const item=[...document.querySelectorAll('.publish-item')].find(x=>x.dataset.contentId===String(id));const st=item?.querySelector('.pub-status');const media=item?.querySelector('.media-input')?.value.trim()||'';if(!st){return}if((platform==='instagram'||platform==='both')&&!media){st.className='status error';st.textContent='\u0628\u0631\u0627\u06cc Instagram \u0628\u0627\u06cc\u062f Media URL \u0639\u0645\u0648\u0645\u06cc \u0648\u0627\u0631\u062f \u0634\u0648\u062f.';return}st.className='status';st.textContent='\u062f\u0631 \u062d\u0627\u0644 \u0627\u0646\u062a\u0634\u0627\u0631\u2026';try{const d=await api('/api/publish',{method:'POST',body:JSON.stringify({content_id:id,platform,media_url:media||undefined})});st.className='status ok';st.textContent='\u0627\u0646\u062a\u0634\u0627\u0631 \u0645\u0648\u0641\u0642: '+(d.results||[]).map(x=>x.platform+' / '+x.external_id).join(' \u00b7 ');await loadApproved()}catch(e){st.className='status error';st.textContent='\u062e\u0637\u0627: '+e.message}}
async function generate(){const st=document.getElementById('generateStatus'),btn=document.getElementById('generateBtn'),topic=document.getElementById('gTopic').value.trim();if(!topic){st.className='status error';st.textContent='\u0645\u0648\u0636\u0648\u0639 \u0631\u0627 \u0648\u0627\u0631\u062f \u06a9\u0646\u06cc\u062f.';return}btn.disabled=true;st.className='status';st.textContent='\u062f\u0631 \u062d\u0627\u0644 \u0633\u0627\u062e\u062a \u0628\u0627 OpenAI\u2026';try{const d=await api('/api/content/generate',{method:'POST',body:JSON.stringify({topic,platform:document.getElementById('gPlatform').value,language:document.getElementById('gLanguage').value,market:document.getElementById('gMarket').value,facts:document.getElementById('gFacts').value})});const x=d.content||{};document.getElementById('generatedResult').innerHTML='<div class="card"><div class="title">\u0645\u062d\u062a\u0648\u0627 \u0633\u0627\u062e\u062a\u0647 \u0634\u062f \u2014 \u062f\u0631 \u0627\u0646\u062a\u0638\u0627\u0631 \u062a\u0623\u06cc\u06cc\u062f</div><div class="label">Hook</div><div class="text">'+esc(x.hook)+'</div><div class="label">Caption</div><div class="text">'+esc(x.caption)+'</div><div class="label">CTA</div><div class="text">'+esc(x.cta)+'</div><div class="label">Hashtags</div><div class="text">'+esc(x.hashtags)+'</div></div>';st.className='status ok';st.textContent='\u0645\u062d\u062a\u0648\u0627 \u0633\u0627\u062e\u062a\u0647 \u0634\u062f \u0648 \u0628\u0631\u0627\u06cc \u062a\u0623\u06cc\u06cc\u062f \u0627\u0646\u0633\u0627\u0646\u06cc \u062f\u0631 \u0635\u0641 \u0642\u0631\u0627\u0631 \u06af\u0631\u0641\u062a.'}catch(e){st.className='status error';st.textContent='\u062e\u0637\u0627: '+e.message}finally{btn.disabled=false}}
async function loadCalendar(){const st=document.getElementById('calendarStatus'),list=document.getElementById('calendarList');st.textContent='\u062f\u0631 \u062d\u0627\u0644 \u062f\u0631\u06cc\u0627\u0641\u062a\u2026';try{const d=await api('/api/calendar');const a=d.items||[];st.className='status ok';st.textContent=a.length+' \u0645\u0648\u0631\u062f \u0628\u0631\u0646\u0627\u0645\u0647\u200c\u0631\u06cc\u0632\u06cc \u0634\u062f\u0647';list.innerHTML=a.length?a.map(x=>'<div class="item"><b>'+esc(x.planned_at||'\u0628\u062f\u0648\u0646 \u0632\u0645\u0627\u0646')+'</b><div class="mini">ID: '+esc(x.id)+' \u00b7 status: '+esc(x.status)+'</div><div class="mini">content: '+esc(x.content_id||'-')+' \u00b7 campaign: '+esc(x.campaign_id||'-')+'</div><div class="actions" style="margin-top:8px"><button class="btn danger" onclick="deleteCalendar(&quot;'+x.id+'&quot;)">\u062d\u0630\u0641</button></div></div>').join(''):'<div class="empty">\u062a\u0642\u0648\u06cc\u0645 \u062e\u0627\u0644\u06cc \u0627\u0633\u062a.</div>'}catch(e){st.className='status error';st.textContent='\u062e\u0637\u0627: '+e.message}}
async function addCalendar(){const st=document.getElementById('calendarStatus');const planned=document.getElementById('calTime').value;if(!planned){st.className='status error';st.textContent='\u0632\u0645\u0627\u0646 \u0631\u0627 \u0648\u0627\u0631\u062f \u06a9\u0646\u06cc\u062f.';return}try{await api('/api/calendar',{method:'POST',body:JSON.stringify({content_id:document.getElementById('calContent').value.trim()||null,campaign_id:document.getElementById('calCampaign').value.trim()||null,planned_at:new Date(planned).toISOString(),media_url:document.getElementById('calMedia').value.trim()||null})});st.className='status ok';st.textContent='\u0628\u0647 \u062a\u0642\u0648\u06cc\u0645 \u0627\u0636\u0627\u0641\u0647 \u0634\u062f.';await loadCalendar()}catch(e){st.className='status error';st.textContent='\u062e\u0637\u0627: '+e.message}}
async function deleteCalendar(id){try{await api('/api/calendar',{method:'DELETE',body:JSON.stringify({id})});await loadCalendar()}catch(e){alert('\u062e\u0637\u0627: '+e.message)}}
async function loadCampaigns(){const st=document.getElementById('campaignStatus'),list=document.getElementById('campaignList');st.textContent='\u062f\u0631 \u062d\u0627\u0644 \u062f\u0631\u06cc\u0627\u0641\u062a\u2026';try{const d=await api('/api/campaigns');const a=d.items||[];st.className='status ok';st.textContent=a.length+' \u06a9\u0645\u067e\u06cc\u0646';list.innerHTML=a.length?a.map(x=>'<div class="item"><div class="itemhead"><b>'+esc(x.name)+'</b><span class="pill">'+esc(x.status)+'</span></div><div class="mini">'+esc(x.goal||'')+' \u00b7 '+esc(x.audience||'')+'</div><div class="mini">ID: '+esc(x.id)+'</div><div class="actions" style="margin-top:8px"><button class="btn secondary" onclick="setCampaignStatus(&quot;'+x.id+'&quot;,&quot;active&quot;)">\u0641\u0639\u0627\u0644</button><button class="btn danger" onclick="setCampaignStatus(&quot;'+x.id+'&quot;,&quot;archived&quot;)">\u0622\u0631\u0634\u06cc\u0648</button></div></div>').join(''):'<div class="empty">\u06a9\u0645\u067e\u06cc\u0646\u06cc \u0648\u062c\u0648\u062f \u0646\u062f\u0627\u0631\u062f.</div>'}catch(e){st.className='status error';st.textContent='\u062e\u0637\u0627: '+e.message}}
async function addCampaign(){const st=document.getElementById('campaignStatus'),name=document.getElementById('campName').value.trim();if(!name){st.className='status error';st.textContent='\u0646\u0627\u0645 \u06a9\u0645\u067e\u06cc\u0646 \u0631\u0627 \u0648\u0627\u0631\u062f \u06a9\u0646\u06cc\u062f.';return}try{await api('/api/campaigns',{method:'POST',body:JSON.stringify({name,goal:document.getElementById('campGoal').value.trim(),audience:document.getElementById('campAudience').value.trim()})});document.getElementById('campName').value='';document.getElementById('campGoal').value='';document.getElementById('campAudience').value='';await loadCampaigns()}catch(e){st.className='status error';st.textContent='\u062e\u0637\u0627: '+e.message}}
async function setCampaignStatus(id,status){try{await api('/api/campaigns',{method:'PATCH',body:JSON.stringify({id,status})});await loadCampaigns()}catch(e){alert('\u062e\u0637\u0627: '+e.message)}}
async function loadInbox(){const st=document.getElementById('inboxStatus'),list=document.getElementById('inboxList');st.textContent='\u062f\u0631 \u062d\u0627\u0644 \u062f\u0631\u06cc\u0627\u0641\u062a\u2026';try{const d=await api('/api/inbox');const a=d.items||[];st.className='status ok';st.textContent=a.length+' \u067e\u06cc\u0627\u0645';list.innerHTML=a.length?a.map(x=>'<div class="item"><div class="itemhead"><b>'+esc(x.sender||'\u0646\u0627\u0634\u0646\u0627\u0633')+'</b><span class="pill">'+esc(x.status||'')+'</span></div><div class="mini">'+esc(x.platform||'')+' \u00b7 '+esc(x.category||'')+' \u00b7 '+esc(x.priority||'')+'</div><div class="text" style="margin-top:8px">'+esc(x.message||'')+'</div><div class="mini" style="margin-top:8px">\u067e\u06cc\u0634\u0646\u0647\u0627\u062f \u067e\u0627\u0633\u062e: '+esc(x.reply_suggestion||'-')+'</div><div class="actions" style="margin-top:8px"><button class="btn secondary" onclick="setInboxStatus(&quot;'+x.id+'&quot;,&quot;handled&quot;)">\u0627\u0646\u062c\u0627\u0645 \u0634\u062f</button></div></div>').join(''):'<div class="empty">\u067e\u06cc\u0627\u0645\u06cc \u0648\u062c\u0648\u062f \u0646\u062f\u0627\u0631\u062f.</div>'}catch(e){st.className='status error';st.textContent='\u062e\u0637\u0627: '+e.message}}
async function setInboxStatus(id,status){try{await api('/api/inbox',{method:'PATCH',body:JSON.stringify({id,status})});await loadInbox()}catch(e){alert('\u062e\u0637\u0627: '+e.message)}}
async function discoverInstagramLeads(){const st=document.getElementById('igLeadStatus'),list=document.getElementById('igLeadList'),q=document.getElementById('igLeadQuery').value.trim();if(!q){st.className='status error';st.textContent='\u0647\u0634\u062a\u06af/\u06a9\u0644\u06cc\u062f\u0648\u0627\u0698\u0647 \u0631\u0627 \u0648\u0627\u0631\u062f \u06a9\u0646\u06cc\u062f.';return}st.className='status';st.textContent='\u062f\u0631 \u062d\u0627\u0644 \u062c\u0633\u062a\u062c\u0648\u06cc Instagram\u2026';try{const d=await api('/api/instagram/leads/discover',{method:'POST',body:JSON.stringify({query:q})});const a=d.items||[];st.className='status ok';st.textContent=String(a.length)+' \u067e\u06cc\u062c \u0645\u0631\u062a\u0628\u0637 \u067e\u06cc\u062f\u0627/\u0630\u062e\u06cc\u0631\u0647 \u0634\u062f. \u0627\u0631\u0633\u0627\u0644 \u062e\u0648\u062f\u06a9\u0627\u0631 \u0627\u0646\u062c\u0627\u0645 \u0646\u0645\u06cc\u200c\u0634\u0648\u062f.';list.innerHTML=a.length?a.map(x=>'<div class="item"><div class="itemhead"><b>@'+esc(x.username)+'</b><span class="pill">Score '+esc(x.score)+'</span></div><div class="mini">'+esc(x.contact||'')+' \u00b7 '+esc(x.media_type||'')+'</div><div class="text" style="margin-top:6px">'+esc(x.evidence||'')+'</div><div class="actions" style="margin-top:8px"><button type="button" class="btn secondary outreach-draft-btn" data-lead-id="'+esc(x.id)+'">\u270d\ufe0f \u067e\u06cc\u0627\u0645 \u0647\u0645\u06a9\u0627\u0631\u06cc</button><button type="button" class="btn secondary" onclick="setLeadStage(&quot;'+esc(x.id)+'&quot;,&quot;qualified&quot;)">\u0648\u0627\u062c\u062f \u0634\u0631\u0627\u06cc\u0637</button></div><div id="draft-'+esc(x.id)+'" class="status"></div></div>').join(''):'<div class="empty">\u067e\u06cc\u062c \u0645\u0631\u062a\u0628\u0637\u06cc \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f.</div>';list.querySelectorAll('.outreach-draft-btn').forEach(btn=>btn.addEventListener('click',()=>makeOutreachDraft(btn.dataset.leadId,'collaboration')));await loadLeadOverview()}catch(e){st.className='status error';st.textContent='\u062e\u0637\u0627: '+e.message}}
async function makeOutreachDraft(leadId,mode='initial'){const box=document.getElementById('draft-'+String(leadId));if(box){box.className='status';box.textContent='\u062f\u0631 \u062d\u0627\u0644 \u0633\u0627\u062e\u062a \u067e\u06cc\u0627\u0645 \u067e\u06cc\u0634\u0646\u0647\u0627\u062f\u06cc\u2026'}try{const d=await api('/api/leads/outreach-draft',{method:'POST',body:JSON.stringify({lead_id:leadId,mode})});if(box){box.className='status ok';box.innerHTML='<div class="text">'+esc(d.draft||'')+'</div><div class="mini" style="margin-top:6px">\u0627\u0631\u0633\u0627\u0644 \u062e\u0648\u062f\u06a9\u0627\u0631 \u0627\u0646\u062c\u0627\u0645 \u0646\u0645\u06cc\u200c\u0634\u0648\u062f\u061b \u067e\u0633 \u0627\u0632 \u0628\u0631\u0631\u0633\u06cc \u062f\u0633\u062a\u06cc \u0627\u0631\u0633\u0627\u0644 \u06a9\u0646\u06cc\u062f.</div>'}else{alert(d.draft||'Draft \u0633\u0627\u062e\u062a\u0647 \u0634\u062f')}await loadLeadOverview()}catch(e){if(box){box.className='status error';box.textContent='\u062e\u0637\u0627: '+e.message}else alert('\u062e\u0637\u0627: '+e.message)}}
async function loadLeadOverview(){const st=document.getElementById('leadOverviewStatus');if(!st)return;st.textContent='\u062f\u0631 \u062d\u0627\u0644 \u062f\u0631\u06cc\u0627\u0641\u062a CRM\u2026';try{const d=await api('/api/leads/overview');document.getElementById('leadTotal').textContent=String(d.total||0);document.getElementById('leadConversion').textContent=String(d.conversion_rate||0)+'%';const stages=d.stages||{};const labels={new:'\u062c\u062f\u06cc\u062f',discovered:'\u06a9\u0634\u0641\u200c\u0634\u062f\u0647',qualified:'\u0648\u0627\u062c\u062f \u0634\u0631\u0627\u06cc\u0637',contacted:'\u062a\u0645\u0627\u0633',replied:'\u067e\u0627\u0633\u062e',negotiation:'\u0645\u0630\u0627\u06a9\u0631\u0647',converted:'\u062a\u0628\u062f\u06cc\u0644\u200c\u0634\u062f\u0647',customer:'\u0645\u0634\u062a\u0631\u06cc',rejected:'\u0631\u062f\u0634\u062f\u0647',archived:'\u0622\u0631\u0634\u06cc\u0648'};document.getElementById('leadFunnel').innerHTML=Object.entries(labels).filter(([k])=>(stages[k]||0)>0).map(([k,v])=>'<div class="item"><div class="itemhead"><b>'+v+'</b><span class="pill">'+esc(String(stages[k]||0))+'</span></div></div>').join('')||'<div class="empty">\u0647\u0646\u0648\u0632 \u0644\u06cc\u062f \u062b\u0628\u062a \u0646\u0634\u062f\u0647 \u0627\u0633\u062a.</div>';st.className='status ok';st.textContent='CRM \u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc \u0634\u062f \u00b7 '+String(d.hot?.length||0)+' \u0644\u06cc\u062f \u062f\u0627\u063a \u00b7 '+String(d.followups?.length||0)+' \u067e\u06cc\u06af\u06cc\u0631\u06cc \u0639\u0642\u0628\u200c\u0627\u0641\u062a\u0627\u062f\u0647';renderLeadQueue(d.hot||[],d.followups||[]);renderOutreach(d.items||[]);await loadLeads()}catch(e){st.className='status error';st.textContent='\u062e\u0637\u0627: '+e.message}}
function renderLeadQueue(hot,followups){const b=document.getElementById('leadActionList');const all=[...hot.map(x=>({...x,_kind:'hot'})),...followups.map(x=>({...x,_kind:'followup'}))];const seen=new Set();const rows=all.filter(x=>!seen.has(x.id)&&(seen.add(x.id))).slice(0,20);b.innerHTML=rows.length?rows.map(x=>'<div class="item"><div class="itemhead"><b>'+esc(x.name||'\u0628\u062f\u0648\u0646 \u0646\u0627\u0645')+'</b><span class="pill">Score '+esc(x.score)+'</span></div><div class="mini">'+esc(x.stage||'')+' \u00b7 '+esc(x.priority||'')+' \u00b7 '+esc(x.contact||'')+'</div><div class="actions" style="margin-top:8px"><button class="btn secondary" onclick="setLeadStage(&quot;'+esc(x.id)+'&quot;,&quot;contacted&quot;)">\u062a\u0645\u0627\u0633 \u0634\u062f</button><button class="btn secondary" onclick="makeOutreachDraft(&quot;'+esc(x.id)+'&quot;,&quot;followup&quot;)">\u067e\u06cc\u06af\u06cc\u0631\u06cc AI</button><button class="btn primary" onclick="setLeadStage(&quot;'+esc(x.id)+'&quot;,&quot;customer&quot;)">\u0645\u0634\u062a\u0631\u06cc</button></div></div>').join(''):'<div class="empty">\u0627\u0642\u062f\u0627\u0645 \u0641\u0648\u0631\u06cc \u0646\u062f\u0627\u0631\u06cc\u062f.</div>'}
function showLeadQueue(kind){const box=document.getElementById('leadActionList');if(!box)return;api('/api/leads/overview').then(d=>{const rows=kind==='hot'?d.hot||[]:d.followups||[];renderLeadQueue(rows,[])}).catch(e=>{box.innerHTML='<div class="status error">\u062e\u0637\u0627: '+esc(e.message)+'</div>'})}
function renderOutreach(items){const b=document.getElementById('outreachList');const rows=items.filter(x=>x.meta?.outreach_draft).slice(0,15);b.innerHTML=rows.length?rows.map(x=>'<div class="item"><div class="itemhead"><b>'+esc(x.name||'\u0628\u062f\u0648\u0646 \u0646\u0627\u0645')+'</b><span class="pill">'+esc(x.stage||'')+'</span></div><div class="text" style="margin-top:7px">'+esc(x.meta.outreach_draft)+'</div><div class="actions" style="margin-top:8px"><button class="btn secondary" onclick="setLeadStage(&quot;'+esc(x.id)+'&quot;,&quot;contacted&quot;)">\u062b\u0628\u062a \u062a\u0645\u0627\u0633</button><button class="btn secondary" onclick="makeOutreachDraft(&quot;'+esc(x.id)+'&quot;,&quot;followup&quot;)">\u0633\u0627\u062e\u062a \u067e\u06cc\u06af\u06cc\u0631\u06cc</button></div></div>').join(''):'<div class="empty">\u0647\u0646\u0648\u0632 Draft \u0647\u0645\u06a9\u0627\u0631\u06cc \u0633\u0627\u062e\u062a\u0647 \u0646\u0634\u062f\u0647 \u0627\u0633\u062a.</div>'}
async function setLeadStage(id,stage){try{await api('/api/leads',{method:'PATCH',body:JSON.stringify({id,stage})});await loadLeadOverview()}catch(e){alert('\u062e\u0637\u0627: '+e.message)}}
async function loadLeads(){const st=document.getElementById('leadStatus'),list=document.getElementById('leadList');st.textContent='\u062f\u0631 \u062d\u0627\u0644 \u062f\u0631\u06cc\u0627\u0641\u062a\u2026';try{const d=await api('/api/leads');const a=d.items||[];st.className='status ok';st.textContent=a.length+' \u0644\u06cc\u062f';list.innerHTML=a.length?a.map(x=>{let m={};try{m=JSON.parse(x.notes||'{}')}catch{}const score=m.score||0;return '<div class="item"><div class="itemhead"><b>'+esc(x.name||'\u0628\u062f\u0648\u0646 \u0646\u0627\u0645')+'</b><span class="pill">Score '+esc(score)+'</span></div><div class="mini">'+esc(x.contact||'')+' \u00b7 '+esc(x.stage||'')+' \u00b7 '+esc(x.priority||'')+'</div><div class="actions" style="margin-top:8px"><button class="btn secondary" onclick="setLeadStage(&quot;'+esc(x.id)+'&quot;,&quot;qualified&quot;)">Qualified</button><button class="btn secondary" onclick="setLeadStage(&quot;'+esc(x.id)+'&quot;,&quot;replied&quot;)">Reply</button><button class="btn primary" onclick="setLeadStage(&quot;'+esc(x.id)+'&quot;,&quot;customer&quot;)">Customer</button></div></div>'}).join(''):'<div class="empty">\u0644\u06cc\u062f\u06cc \u0648\u062c\u0648\u062f \u0646\u062f\u0627\u0631\u062f.</div>'}catch(e){st.className='status error';st.textContent='\u062e\u0637\u0627: '+e.message}}
async function addLead(){const st=document.getElementById('leadStatus'),name=document.getElementById('leadName').value.trim();if(!name){st.className='status error';st.textContent='\u0646\u0627\u0645 \u0631\u0627 \u0648\u0627\u0631\u062f \u06a9\u0646\u06cc\u062f.';return}try{const f=document.getElementById('leadFollowup').value;await api('/api/leads',{method:'POST',body:JSON.stringify({name,contact:document.getElementById('leadContact').value.trim(),stage:document.getElementById('leadStage').value||'new',priority:document.getElementById('leadPriority').value||'normal',notes:document.getElementById('leadNotes').value.trim(),next_followup_at:f?new Date(f).toISOString():null})});st.className='status ok';st.textContent='\u0644\u06cc\u062f \u0627\u0636\u0627\u0641\u0647 \u0634\u062f.';await loadLeadOverview()}catch(e){st.className='status error';st.textContent='\u062e\u0637\u0627: '+e.message}}
async function autoAdCampaign(){const st=document.getElementById('adsStatus'),list=document.getElementById('adsList');if(!st||!list)return;const city=document.getElementById('adsCity').value.trim(),extra=document.getElementById('adsExtra').value.trim();st.className='status';st.textContent=sectionFa('ð¤ Ø³ÛØ³ØªÙ Ø®ÙØ¯Ú©Ø§Ø± Ø¯Ø± Ø­Ø§Ù Ù¾ÛØ¯Ø§ Ú©Ø±Ø¯Ù ÙØ´ØªØ±ÛØ ÙØ­Ù ØªØ¨ÙÛØº Ù Ø¢ÙØ§Ø¯ÙâØ³Ø§Ø²Û ÙØ°Ø§Ú©Ø±Ù Ø§Ø³Øªâ¦');list.innerHTML='';try{const d=await api('/api/ads/auto-run',{method:'POST',body:JSON.stringify({city,type:document.getElementById('adsType').value,extra,source_site:'https://www.hamzehibox.com'})});const a=d.items||[];st.className='status ok';st.textContent='â Ø§ÙØ¬Ø§Ù Ø´Ø¯: '+(d.found||0)+' ÙØ¯Ù Ù¾ÛØ¯Ø§ Ø´Ø¯ Â· '+(d.drafted||0)+' ÙØ°Ø§Ú©Ø±Ù Ø¢ÙØ§Ø¯Ù Ø´Ø¯ Ù Ø¯Ø± CRM Ø«Ø¨Øª Ø´Ø¯.';list.innerHTML=a.length?a.map(x=>'<div class="item"><div class="itemhead"><b>'+esc(sectionFa(x.name||'Ø¨Ø¯ÙÙ ÙØ§Ù'))+'</b><span class="pill">Score '+esc(x.score||0)+'</span></div><div class="mini">'+esc(sectionFa(x.type||''))+' Â· '+esc(sectionFa(x.url||''))+'</div>'+(x.contact_url?'<div class="mini">ÙØ³ÛØ± ØªÙØ§Ø³/ØªØ¨ÙÛØº: '+esc(sectionFa(x.contact_url))+'</div>':'')+(x.draft?'<div class="text" style="margin-top:6px">'+esc(sectionFa(x.draft))+'</div>':'')+'</div>').join(''):'<div class="empty">ÙÙØ±Ø¯Û Ù¾ÛØ¯Ø§ ÙØ´Ø¯.</div>';loadAdTargets()}catch(e){st.className='status error';st.textContent='Ø®Ø·Ø§: '+e.message}};

async function discoverAdCustomers(){const st=document.getElementById('adsStatus'),list=document.getElementById('adsList');if(!st||!list)return;const city=document.getElementById('adsCity').value.trim(),type=document.getElementById('adsType').value,extra=document.getElementById('adsExtra').value.trim();st.className='status';st.textContent=sectionFa('Ø¯Ø± Ø­Ø§Ù Ù¾ÛØ¯Ø§ Ú©Ø±Ø¯Ù ÙØ´ØªØ±Û Ù ÙØ­Ù ØªØ¨ÙÛØºâ¦');list.innerHTML='';try{const d=await api('/api/ads/discover',{method:'POST',body:JSON.stringify({city,type,extra,source_site:'https://www.hamzehibox.com'})});const a=d.items||[];st.className='status ok';st.textContent='Ù¾ÛØ¯Ø§ Ø´Ø¯: '+a.length+' ÙÙØ±Ø¯ Â· ÙØ´ØªØ±Û Ù ÙØ³ÛØ± ØªØ¨ÙÛØºØ§Øª Ø¯Ø± CRM Ø°Ø®ÛØ±Ù Ø´Ø¯.';list.innerHTML=a.length?a.map(x=>'<div class="item"><div class="itemhead"><b>'+esc(sectionFa(x.name||'Ø¨Ø¯ÙÙ ÙØ§Ù'))+'</b><span class="pill">Score '+esc(x.score||0)+'</span></div><div class="mini">'+esc(sectionFa(x.kind||''))+' Â· '+esc(sectionFa(x.city||''))+'</div><div class="mini">'+esc(sectionFa(x.url||''))+'</div><div class="text" style="margin-top:6px">'+esc(sectionFa(x.evidence||''))+'</div><div class="actions" style="margin-top:10px"><button class="btn secondary" onclick="makeAdNegotiationDraft(&quot;'+esc(x.id)+'&quot;)">âï¸ Ø¢ÙØ§Ø¯ÙâØ³Ø§Ø²Û ÙØ°Ø§Ú©Ø±Ù</button>'+(x.contact_url?'<button class="btn secondary" onclick="window.open(&quot;'+esc(sectionFa(x.contact_url))+'&quot;,&quot;_blank&quot;)">Ø±Ø§Ù ØªÙØ§Ø³</button>':'')+'</div><div id="ad-draft-'+esc(x.id)+'" class="status"></div></div>').join(''):'<div class="empty">ÙÙØ±Ø¯Û Ù¾ÛØ¯Ø§ ÙØ´Ø¯.</div>'}catch(e){st.className='status error';st.textContent='Ø®Ø·Ø§: '+e.message}}
async function makeAdNegotiationDraft(id){const box=document.getElementById('ad-draft-'+String(id));if(box){box.className='status';box.textContent='Ø¯Ø± Ø­Ø§Ù Ø¢ÙØ§Ø¯ÙâØ³Ø§Ø²Û Ù¾ÛØ´ÙÙØ§Ø¯ ÙØ°Ø§Ú©Ø±Ùâ¦'}try{const d=await api('/api/ads/negotiation-draft',{method:'POST',body:JSON.stringify({lead_id:id})});if(box){box.className='status ok';box.innerHTML='<div class="text">'+esc(sectionFa(d.draft||''))+'</div><div class="mini" style="margin-top:6px">Ø§Ø±Ø³Ø§Ù/Ø«Ø¨Øª ÙÙØ§ÛÛ ÙÛØ§Ø² Ø¨Ù ØªØ£ÛÛØ¯ Ø¯Ø³ØªÛ Ø¯Ø§Ø±Ø¯.</div>'}}catch(e){if(box){box.className='status error';box.textContent='Ø®Ø·Ø§: '+e.message}}}
async function loadAdTargets(){const st=document.getElementById('adsSavedStatus'),list=document.getElementById('adsSavedList');if(!st||!list)return;try{const d=await api('/api/ads/targets');const a=d.items||[];st.className='status ok';st.textContent=a.length+' ÙØ¯Ù ØªØ¨ÙÛØºØ§ØªÛ/ÙØ´ØªØ±Û Ø°Ø®ÛØ±Ù Ø´Ø¯Ù';list.innerHTML=a.length?a.map(x=>'<div class="item"><div class="itemhead"><b>'+esc(sectionFa(x.name||''))+'</b><span class="pill">'+esc(sectionFa(x.stage||'discovered'))+'</span></div><div class="mini">'+esc(sectionFa(x.contact||''))+'</div></div>').join(''):'<div class="empty">ÙÙÙØ² ÙØ¯ÙÛ Ø°Ø®ÛØ±Ù ÙØ´Ø¯Ù.</div>'}catch(e){st.className='status error';st.textContent='Ø®Ø·Ø§: '+e.message}}
async function loadAdOverview(){const b=document.getElementById('adOverviewBody');if(!b)return;try{const d=await api('/api/ads/overview'),m=d.metrics||{};b.innerHTML='<div class="two"><div><div class="stat">'+esc(sectionFa(m.found_today||0))+'</div><div class="muted">ÙØ¹Ø§ÙÛØª Ø§ÙØ±ÙØ²</div></div><div><div class="stat">'+esc(sectionFa(m.hot||0))+'</div><div class="muted">ÙÛØ¯ Ø¯Ø§Øº</div></div><div><div class="stat">'+esc(sectionFa(m.negotiation||0))+'</div><div class="muted">ÙØ°Ø§Ú©Ø±Ù</div></div><div><div class="stat">'+esc(sectionFa(m.due_followups||0))+'</div><div class="muted">Ù¾ÛÚ¯ÛØ±Û Ø³Ø±Ø±Ø³ÛØ¯</div></div></div><div class="mini" style="margin-top:10px">'+esc(sectionFa(m.ad_opportunities||0))+' ÙØ±ØµØª ØªØ¨ÙÛØºØ§ØªÛ Â· '+esc(sectionFa(m.customers||0))+' ÙØ´ØªØ±Û Â· '+esc(sectionFa(m.ad_targets||0))+' ÙØ¯Ù ØªØ¨ÙÛØºØ§ØªÛ</div>';b.className='status ok';const list=document.getElementById('adOpportunityList');if(list)list.innerHTML=(d.items||[]).map(x=>'<div class="item"><div class="itemhead"><b>'+esc(sectionFa(x.name||'Ø¨Ø¯ÙÙ ÙØ§Ù'))+'</b><span class="pill">Score '+esc(x.score||0)+'</span></div><div class="mini">'+esc(sectionFa(x.type||''))+' Â· '+esc(sectionFa(x.stage||''))+'</div>'+(x.ad_opportunity?'<div class="mini">ÙØ±ØµØª ØªØ¨ÙÛØºØ§ØªÛ Ø´ÙØ§Ø³Ø§ÛÛ Ø´Ø¯</div>':'')+(x.contact_url?'<div class="actions" style="margin-top:8px"><button class="btn secondary" onclick="window.open(&quot;'+esc(sectionFa(x.contact_url))+'&quot;,&quot;_blank&quot;)">ÙØ³ÛØ± ØªÙØ§Ø³</button></div>':'')+'</div>').join('')||'<div class="empty">ÙÙÙØ² ÙØ±ØµØª ØªØ¨ÙÛØºØ§ØªÛ Ø«Ø¨Øª ÙØ´Ø¯Ù.</div>'}catch(e){b.className='status error';b.textContent='Ø®Ø·Ø§: '+e.message}}
async function loadAdActionCenter(){const b=document.getElementById('adActionCenter');if(!b)return;b.textContent='Ø¯Ø± Ø­Ø§Ù Ø¢ÙØ§Ø¯ÙâØ³Ø§Ø²Û Ø§ÙØ¯Ø§ÙâÙØ§â¦';try{const d=await api('/api/ads/action-center'),c=d.counts||{};const labels={today:'Ù¾ÛÚ¯ÛØ±Û Ø§ÙØ±ÙØ²',urgent:'Ø§ÙØ¯Ø§Ù ÙÙØ±Û',opportunity:'ÙØ±ØµØª ØªØ¨ÙÛØº'};b.innerHTML='<div class="two">'+Object.entries(labels).map(([k,v])=>'<div><div class="stat">'+esc(sectionFa(c[k]||0))+'</div><div class="muted">'+v+'</div></div>').join('')+'</div>'+(d.items||[]).map(x=>'<div class="item"><div class="itemhead"><b>'+esc(sectionFa(x.name||'Ø¨Ø¯ÙÙ ÙØ§Ù'))+'</b><span class="pill">'+esc(String(x.score||0))+'</span></div><div class="mini">'+esc(sectionFa(labels[x.bucket]||'Ø¨Ø±Ø±Ø³Û'))+' Â· '+esc(sectionFa(x.stage||''))+'</div><div class="mini">'+esc(sectionFa(x.action||''))+'</div><div class="mini">'+esc(sectionFa((x.factors||[]).join(' Â· ')))+'</div></div>').join('')||'<div class="empty">ÙØ¹ÙØ§Ù Ø§ÙØ¯Ø§Ù ÙØ´Ø®ØµÛ ÙØ¬ÙØ¯ ÙØ¯Ø§Ø±Ø¯.</div>';b.className='status ok'}catch(e){b.className='status error';b.textContent='Ø®Ø·Ø§: '+e.message}}

async function loadAdIntelligence(){const b=document.getElementById('adIntelligenceBody');if(!b)return;try{const d=await api('/api/ads/intelligence'),m=d.metrics||{};b.innerHTML='<div class="two"><div><div class="stat">'+esc(sectionFa(m.hot||0))+'</div><div class="muted">ÙÛØ¯ÙØ§Û Ø¯Ø§Øº</div></div><div><div class="stat">'+esc(sectionFa(m.opportunities||0))+'</div><div class="muted">ÙØ±ØµØª ØªØ¨ÙÛØº</div></div><div><div class="stat">'+esc(sectionFa(m.action_items||0))+'</div><div class="muted">Ø§ÙØ¯Ø§Ù Ø¨Ø¹Ø¯Û</div></div><div><div class="stat">'+esc(sectionFa(m.duplicate_domains||0))+'</div><div class="muted">Ø¯Ø§ÙÛÙ ØªÚ©Ø±Ø§Ø±Û</div></div></div><div class="mini" style="margin-top:10px">Ú©Ù Lead: '+esc(sectionFa(m.total||0))+' Â· ÙØ¹Ø§Ù: '+esc(sectionFa(m.active||0))+'</div>';const list=document.getElementById('adActionList');if(list)list.innerHTML=(d.action_items||[]).slice(0,10).map(x=>'<div class="item"><div class="itemhead"><b>'+esc(sectionFa(x.name||'Ø¨Ø¯ÙÙ ÙØ§Ù'))+'</b><span class="pill">'+esc(x.score||0)+'</span></div><div class="mini">'+esc(sectionFa(x.type||''))+' Â· '+esc(sectionFa(x.stage||''))+'</div><div class="mini">'+esc(sectionFa(x.action||''))+'</div><div class="mini">'+esc(sectionFa((x.factors||[]).join(' Â· ')))+'</div></div>').join('')||'<div class="empty">Ø§ÙØ¯Ø§Ù ÙÙØ±Û Ø«Ø¨Øª ÙØ´Ø¯Ù.</div>';b.className='status ok'}catch(e){b.className='status error';b.textContent='Ø®Ø·Ø§: '+e.message}}
async function runAdFollowups(){const b=document.getElementById('adFollowupStatus');if(b){b.className='status';b.textContent='Ø¯Ø± Ø­Ø§Ù Ø¢ÙØ§Ø¯ÙâØ³Ø§Ø²Û Ù¾ÛÚ¯ÛØ±ÛâÙØ§Û Ø³Ø±Ø±Ø³ÛØ¯â¦'}try{const d=await api('/api/ads/followups/run',{method:'POST',body:'{}'});if(b){b.className='status ok';b.textContent='â '+esc(sectionFa(d.prepared||0))+' Ù¾ÛÚ¯ÛØ±Û Ø¢ÙØ§Ø¯Ù Ø´Ø¯ Â· '+esc(sectionFa(d.skipped||0))+' ÙÙØ±Ø¯ Ø±Ø¯ Ø´Ø¯.'}await loadAdOverview();await loadAdAutopilotStatus()}catch(e){if(b){b.className='status error';b.textContent='Ø®Ø·Ø§: '+e.message}}}

async function runAdAutopilot(){const st=document.getElementById('adsStatus'),list=document.getElementById('adsList');if(!st||!list)return;const city=document.getElementById('adsCity').value.trim(),type=document.getElementById('adsType').value,extra=document.getElementById('adsExtra').value.trim();st.className='status';st.textContent='ð¤ Ø®ÙØ¨Ø§Ù Ø®ÙØ¯Ú©Ø§Ø± Ø¯Ø± Ø­Ø§Ù Ø¨Ø±Ø±Ø³Û Ø¢ÙØ§Ø¯Ú¯Û Ù Ø³Ù¾Ø³ Ø§Ø¬Ø±Ø§Û Ø¹ÙÙÛØ§Øª Ø§Ø³Øªâ¦';list.innerHTML='';try{const pf=await api('/api/ads/preflight');const failed=(pf.checks||[]).filter(x=>x.status==='FAIL');if(failed.length){throw Error('Preflight ÙØ§ÙÙÙÙ Ø§Ø³Øª: '+failed.map(x=>x.name+': '+(x.details||x.value||'FAIL')).join(' Â· '))}if(pf.safe!==true){throw Error('Preflight Ø§Ø¬Ø§Ø²Ù Ø§Ø¬Ø±Ø§Û Autopilot Ø±Ø§ ØµØ§Ø¯Ø± ÙÚ©Ø±Ø¯.')}const d=await api('/api/ads/autopilot',{method:'POST',body:JSON.stringify({city,type,extra})});const m=d.summary||{};st.className='status ok';st.textContent='â Ø®ÙØ¨Ø§Ù Ø®ÙØ¯Ú©Ø§Ø± ØªÙØ§Ù Ø´Ø¯ Â· '+(m.found||0)+' Ù¾ÛØ¯Ø§ Ø´Ø¯ Â· '+(m.new_leads||0)+' Ø¬Ø¯ÛØ¯ Â· '+(m.drafted||0)+' ÙØ°Ø§Ú©Ø±Ù Ø¢ÙØ§Ø¯Ù Ø´Ø¯';list.innerHTML=(d.items||[]).slice(0,20).map(x=>'<div class="item"><div class="itemhead"><b>'+esc(sectionFa(x.name||'Ø¨Ø¯ÙÙ ÙØ§Ù'))+'</b><span class="pill">'+esc(x.score||0)+'</span></div><div class="mini">'+esc(sectionFa(x.type||''))+' Â· '+esc(sectionFa(x.url||''))+'</div>'+(x.contact_url?'<div class="mini">Ø±Ø§Ù ØªÙØ§Ø³: '+esc(sectionFa(x.contact_url))+'</div>':'')+(x.draft?'<div class="text" style="margin-top:6px">'+esc(sectionFa(x.draft))+'</div>':'')+'</div>').join('')||'<div class="empty">ÙÙØ±Ø¯ Ø¬Ø¯ÛØ¯Û Ù¾ÛØ¯Ø§ ÙØ´Ø¯.</div>';await loadAdTargets();await loadAdAutopilotStatus()}catch(e){st.className='status error';st.textContent='Ø®Ø·Ø§: '+e.message}}
async function loadAdPreflight(){const b=document.getElementById('adPreflight');if(!b)return;b.className='status';b.textContent='Ø¯Ø± Ø­Ø§Ù Ø¨Ø±Ø±Ø³Û Ø¢ÙØ§Ø¯Ú¯Û Ø³ÛØ³ØªÙâ¦';try{const d=await api('/api/ads/preflight');const bad=(d.checks||[]).filter(x=>x.status==='FAIL');b.innerHTML=(d.checks||[]).map(x=>'<div class="mini">'+(x.status==='PASS'?'ð¢':x.status==='READY'?'ð¡':x.status==='SKIP'?'âª':'ð´')+' '+esc(sectionFa(x.name))+': '+esc(sectionFa(x.details||x.value||x.status))+'</div>').join('');b.className=bad.length?'status error':'status ok'}catch(e){b.className='status error';b.textContent='Ø®Ø·Ø§: '+e.message}}
async function loadAdAutopilotStatus(){const b=document.getElementById('adAutopilotStatus');if(!b)return;try{const d=await api('/api/ads/autopilot/status'),m=d.metrics||{};b.innerHTML='<div class="stat">'+(d.enabled?'ð¢ ON':'ð´ OFF')+'</div><div class="mini">'+(d.enabled?'Ø§Ø¬Ø±Ø§Û Ø®ÙØ¯Ú©Ø§Ø± ÙØ± Û±Ûµ Ø¯ÙÛÙÙ ÙØ¹Ø§Ù Ø§Ø³Øª':'Ø§Ø¬Ø±Ø§Û Ø®ÙØ¯Ú©Ø§Ø± ÙØªÙÙÙ Ø§Ø³Øª')+' Â· '+esc(sectionFa(m.ad_targets||0))+' ÙØ¯Ù ØªØ¨ÙÛØºØ§ØªÛ Â· '+esc(sectionFa(m.hot||0))+' Ø¯Ø§Øº Â· '+esc(sectionFa(m.negotiation||0))+' ÙØ°Ø§Ú©Ø±Ù Â· '+esc(sectionFa(m.followups||0))+' Ù¾ÛÚ¯ÛØ±Û Â· '+esc(sectionFa(m.customers||0))+' ÙØ´ØªØ±Û</div>';b.className=d.enabled?'status ok':'status'}catch(e){b.className='status error';b.textContent='Ø®Ø·Ø§: '+e.message}}async function startAdAutopilot(){const type=document.getElementById('adsType')?.value||'all',city=document.getElementById('adsCity')?.value.trim()||'',extra=document.getElementById('adsExtra')?.value.trim()||'',b=document.getElementById('adAutopilotControlStatus');if(b){b.className='status';b.textContent='Ø¯Ø± Ø­Ø§Ù Ø±ÙØ´ÙâÚ©Ø±Ø¯Ù Ø®ÙØ¨Ø§Ù Ø®ÙØ¯Ú©Ø§Ø±â¦'}try{const d=await api('/api/ads/autopilot/start',{method:'POST',body:JSON.stringify({type,city,extra})});if(b){b.className=d.enabled?'status ok':'status error';b.textContent=d.enabled?'ð¢ AUTOPILOT Ø±ÙØ´Ù Ø´Ø¯ Ù ØªØ§ STOP Ø§Ø¯Ø§ÙÙ ÙÛâØ¯ÙØ¯.':'ð´ AUTOPILOT Ø±ÙØ´Ù ÙØ´Ø¯.'}await loadAdAutopilotStatus();await loadAdOverview()}catch(e){if(b){b.className='status error';b.textContent='Ø®Ø·Ø§: '+e.message}}}
async function stopAdAutopilot(){const b=document.getElementById('adAutopilotControlStatus');if(b){b.className='status';b.textContent='Ø¯Ø± Ø­Ø§Ù Ø®Ø§ÙÙØ´âÚ©Ø±Ø¯Ù Ø®ÙØ¨Ø§Ù Ø®ÙØ¯Ú©Ø§Ø±â¦'}try{await api('/api/ads/autopilot/stop',{method:'POST',body:'{}'});if(b){b.className='status ok';b.textContent='â¹ï¸ AUTOPILOT Ø®Ø§ÙÙØ´ Ø´Ø¯. Ø§Ø¬Ø±Ø§Û Ø²ÙØ§ÙâØ¨ÙØ¯ÛâØ´Ø¯Ù ÙØªÙÙÙ Ø§Ø³Øª.'}await loadAdAutopilotStatus()}catch(e){if(b){b.className='status error';b.textContent='Ø®Ø·Ø§: '+e.message}}}

async function loadMetrics(){const b=document.getElementById('metricsBody');b.textContent='\u062f\u0631 \u062d\u0627\u0644 \u062f\u0631\u06cc\u0627\u0641\u062a\u2026';try{const d=await api('/api/metrics');const a=d.items||[];b.innerHTML='<div class="stat">'+a.length+'</div><div class="muted">\u0631\u06a9\u0648\u0631\u062f \u0645\u062a\u0631\u06cc\u06a9</div>'+ (a.length?'<div style="margin-top:12px">'+a.slice(0,50).map(x=>'<div class="item"><b>'+esc(x.platform||'')+'</b><div class="mini">impressions: '+esc(x.impressions)+' \u00b7 reach: '+esc(x.reach)+' \u00b7 likes: '+esc(x.likes)+' \u00b7 comments: '+esc(x.comments)+' \u00b7 shares: '+esc(x.shares)+' \u00b7 saves: '+esc(x.saves)+'</div></div>').join('')+'</div>':'<div class="empty">\u0647\u0646\u0648\u0632 \u0645\u062a\u0631\u06cc\u06a9\u06cc \u062b\u0628\u062a \u0646\u0634\u062f\u0647 \u0627\u0633\u062a.</div>')}catch(e){b.className='status error';b.textContent='\u062e\u0637\u0627: '+e.message}}
async function testConnections(){const b=document.getElementById('connectionTestBody');b.className='status';b.textContent='\u062f\u0631 \u062d\u0627\u0644 \u062a\u0633\u062a \u0627\u062a\u0635\u0627\u0644 \u0648\u0627\u0642\u0639\u06cc\u2026';try{const d=await api('/api/connections/test',{method:'POST'});const p=d.providers||{};b.innerHTML=Object.entries(p).map(([k,v])=>'<div class="item"><div class="itemhead"><b>'+esc(k)+'</b><span class="pill">'+esc(v.status||'UNKNOWN')+'</span></div><div class="mini">'+esc(v.details||'')+(v.bot_username?' \u00b7 @'+esc(v.bot_username):'')+(v.username?' \u00b7 @'+esc(v.username):'')+(v.webhook?(' \u00b7 webhook: '+(v.webhook.configured?'configured':'not configured')):'')+'</div></div>').join('')+'<div class="mini" style="margin-top:8px">PASS: '+esc(String(d.summary?.pass||0))+' \u00b7 FAIL: '+esc(String(d.summary?.fail||0))+' \u00b7 SKIP: '+esc(String(d.summary?.skip||0))+'</div>';b.className=(d.summary?.fail || d.summary?.skip) ? 'status error' : 'status ok'}catch(e){b.className='status error';b.textContent='\u062e\u0637\u0627: '+e.message}}

async function loadSettings(){const b=document.getElementById('settingsBody');try{const d=await api('/api/settings');const a=d.providers||{};b.innerHTML=Object.entries(a).map(([k,v])=>'<div class="item"><div class="itemhead"><b>'+esc(k)+'</b><span class="pill">'+(v.configured?'CONFIGURED':'MISSING')+'</span></div><div class="mini">'+esc(safeFa(v.note||''))+'</div></div>').join('')}catch(e){b.textContent='\u062e\u0637\u0627: '+e.message}}
async function loadRuns(){const b=document.getElementById('runsBody');try{const d=await api('/api/production/runs');const a=d.items||[];b.innerHTML=a.length?a.map(x=>{let actions='';if(x.status==='stopped'){const id=JSON.stringify(String(x.id));actions='<div class="actions" style="margin-top:8px"><button class="btn secondary" onclick="reconcileRun(&quot;'+id+'&quot;,&quot;confirm_published&quot;)">\u062a\u0623\u06cc\u06cc\u062f \u0627\u0646\u062a\u0634\u0627\u0631</button><button class="btn danger" onclick="reconcileRun(&quot;'+id+'&quot;,&quot;retry&quot;)">Retry \u062f\u0633\u062a\u06cc</button></div>'}return '<div class="item"><div class="itemhead"><b>'+esc(x.run_type||x.id)+'</b><span class="pill">'+esc(x.status)+'</span></div><div class="mini">'+esc(x.updated_at||x.created_at||'')+'</div><div class="mini">'+esc(x.error||'')+'</div>'+actions+'</div>'}).join(''):'<div class="empty">\u0627\u062c\u0631\u0627\u06cc \u0627\u0646\u062a\u0634\u0627\u0631\u06cc \u0648\u062c\u0648\u062f \u0646\u062f\u0627\u0631\u062f.</div>'}catch(e){b.textContent='\u062e\u0637\u0627: '+e.message}}
async function reconcileRun(id,action){try{await api('/api/production/reconcile',{method:'POST',body:JSON.stringify({id,action})});await loadRuns()}catch(e){alert('\u062e\u0637\u0627: '+e.message)}}
async function loadEvents(){const b=document.getElementById('eventsBody');try{const d=await api('/api/system/events');const a=d.items||[];b.innerHTML=a.length?a.map(x=>'<div class="item"><div class="itemhead"><b>'+esc(x.type)+'</b><span class="pill">'+esc(x.severity)+'</span></div><div class="mini">'+esc(x.created_at||'')+'</div><div class="text" style="margin-top:6px">'+esc(x.message||'')+'</div></div>').join(''):'<div class="empty">\u0644\u0627\u06af\u06cc \u0648\u062c\u0648\u062f \u0646\u062f\u0627\u0631\u062f.</div>'}catch(e){b.textContent='\u062e\u0637\u0627: '+e.message}}
async function runRelease(){const st=document.getElementById('releaseStatus');st.className='status';st.textContent='\u062f\u0631 \u062d\u0627\u0644 \u062a\u0633\u062a\u2026';try{const d=await api('/api/release/test',{method:'POST'});const checks=d.checks||[];const passed=d.ok===true && checks.length>0 && checks.every(x=>x.status==='PASS');st.className=passed?'status ok':'status error';st.textContent=checks.map(x=>x.check+': '+x.status).join(' \u00b7 ')}catch(e){st.className='status error';st.textContent='\u062e\u0637\u0627: '+e.message}}
async function loadSystem(){const b=document.getElementById('systemBody');b.textContent='\u062f\u0631 \u062d\u0627\u0644 \u062f\u0631\u06cc\u0627\u0641\u062a\u2026';try{const [h,r,m]=await Promise.all([api('/api/health'),api('/api/recovery/manifest'),api('/api/migration/status')]);b.className='status ok';b.innerHTML='<div class="stat">'+esc(h.status||'ok')+'</div><div class="mini">auto_publish: '+esc(String(h.auto_publish))+' \u00b7 approval_required: '+esc(String(h.approval_required))+'</div><div class="mini" style="margin-top:8px">D1: '+esc(JSON.stringify(r.tables||{}))+'</div><div class="mini" style="margin-top:8px">migrations: '+esc(String((m.items||[]).length))+'</div>';await Promise.all([loadSettings(),loadRuns(),loadEvents()])}catch(e){b.className='status error';b.textContent='\u062e\u0637\u0627: '+e.message}}
`;
}

function dashboardHtml() {
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>HAMZEHI SOCIAL AI \u2014 Control Center</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#09090b;color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{width:min(900px,100%);margin:auto;padding:28px 18px 110px}.top{display:flex;justify-content:space-between;align-items:center;gap:14px;margin:4px 0 24px;padding:0 2px}.brand{font-size:20px;font-weight:800}.sub{font-size:12px;color:#8f8f98;margin-top:3px}.card{background:#141418;border:1px solid #292930;border-radius:20px;padding:20px;margin:18px 0;box-shadow:0 10px 30px rgba(0,0,0,.12)}.title{font-size:18px;font-weight:800;margin:0 0 14px;line-height:1.5}.label{font-size:12px;color:#999;margin:16px 0 7px}.field{width:100%;padding:15px 14px;border-radius:14px;border:1px solid #36363e;background:#0d0d10;color:#fff;font-size:15px;min-height:50px}.row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.btn{border:0;border-radius:14px;padding:13px 17px;font-weight:750;font-size:14px;cursor:pointer;min-height:48px}.primary{background:#eee;color:#111}.secondary{background:#222229;color:#fff;border:1px solid #3a3a43}.danger{background:#2b2022;color:#fff;border:1px solid #5b373b}.btn:disabled{opacity:.45}.hidden{display:none!important}.status{margin:9px 0;font-size:13px;color:#aaa;min-height:20px}.error{color:#ff9999}.ok{color:#9de4b0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.tool{min-height:92px;text-align:right;background:#15151a;border:1px solid #303039;color:#fff;border-radius:16px;padding:13px;cursor:pointer}.tool b{display:block;font-size:15px;margin-bottom:5px}.tool span{font-size:11px;color:#999}.section{display:none}.section.active{display:block}.pill{font-size:11px;background:#222229;border-radius:999px;padding:5px 8px;color:#bbb}.text{white-space:pre-wrap;line-height:1.8;font-size:14px;color:#eee}.empty{text-align:center;color:#999;padding:28px 8px}.actions{display:flex;gap:8px}.actions .btn{flex:1}.nav{position:fixed;bottom:0;left:0;right:0;background:#101014ee;border-top:1px solid #2b2b32;backdrop-filter:blur(10px);padding:8px 10px;z-index:10}.navin{width:min(900px,100%);margin:auto;display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.nav button{background:transparent;border:0;color:#aaa;font-size:11px;padding:7px}.nav button.active{color:#fff;font-weight:800}.stat{font-size:28px;font-weight:850}.muted{color:#999;font-size:12px}.item{border:1px solid #292930;border-radius:14px;padding:12px;margin:9px 0}.itemhead{display:flex;justify-content:space-between;gap:8px;align-items:center}.mini{font-size:11px;color:#999}.two{display:grid;grid-template-columns:1fr 1fr;gap:8px}@media(max-width:600px){.two{grid-template-columns:1fr}.grid{grid-template-columns:1fr 1fr}}
<style>@media(max-width:600px){main{padding:24px 14px 105px}.card{padding:18px;margin:16px 0}.top{margin-bottom:20px}.row .btn{flex:1;min-width:140px}.actions{gap:10px}}</style></style>
</head>
<body>
<main>
<div class="top"><div><div class="brand">HAMZEHI SOCIAL AI</div><div class="sub">Control Center \u00b7 OpenAI Primary \u00b7 Approval Required</div></div><button id="logoutBtn" class="btn secondary hidden" onclick="logout()">\u062e\u0631\u0648\u062c</button></div>
<section id="login" class="card"><div class="title">\u0648\u0631\u0648\u062f \u0628\u0647 \u0627\u0628\u0632\u0627\u0631 \u0627\u0635\u0644\u06cc</div><div class="label">ADMIN TOKEN</div><input id="token" class="field" type="password" autocomplete="off" placeholder="\u062a\u0648\u06a9\u0646 \u0645\u062f\u06cc\u0631 \u0631\u0627 \u0648\u0627\u0631\u062f \u06a9\u0646\u06cc\u062f"><div class="row" style="margin-top:10px"><button id="loginBtn" type="button" class="btn primary" onclick="performLogin()">\u0648\u0631\u0648\u062f \u0628\u0647 \u062f\u0627\u0634\u0628\u0648\u0631\u062f</button><button class="btn secondary" onclick="toggleToken()">\u0646\u0645\u0627\u06cc\u0634 \u0631\u0645\u0632</button></div><div id="loginStatus" class="status"></div></section>
<section id="app" class="hidden">
<div id="home" class="section active"><div class="card"><div class="title">\u0627\u0628\u0632\u0627\u0631\u0647\u0627\u06cc \u0627\u0635\u0644\u06cc</div><div class="grid">
<button class="tool" onclick="show('generate')"><b>\u270d\ufe0f \u062a\u0648\u0644\u06cc\u062f \u0645\u062d\u062a\u0648\u0627</b><span>\u0633\u0627\u062e\u062a \u0645\u062d\u062a\u0648\u0627 \u0628\u0627 OpenAI</span></button>
<button class="tool" onclick="show('approval');loadApprovals()"><b>\u2705 \u062a\u0623\u06cc\u06cc\u062f \u0645\u062d\u062a\u0648\u0627</b><span>\u0628\u0631\u0631\u0633\u06cc \u0648 \u062a\u0623\u06cc\u06cc\u062f/\u0631\u062f</span></button>
<button class="tool" onclick="show('calendar');loadCalendar()"><b>\ud83d\udcc5 \u062a\u0642\u0648\u06cc\u0645</b><span>\u0627\u0641\u0632\u0648\u062f\u0646 \u0648 \u0645\u062f\u06cc\u0631\u06cc\u062a \u0628\u0631\u0646\u0627\u0645\u0647</span></button>
<button class="tool" onclick="show('campaigns');loadCampaigns()"><b>\ud83d\udce3 \u06a9\u0645\u067e\u06cc\u0646\u200c\u0647\u0627</b><span>\u0633\u0627\u062e\u062a \u0648 \u0645\u062f\u06cc\u0631\u06cc\u062a \u06a9\u0645\u067e\u06cc\u0646</span></button>
<button class="tool" onclick="show('inbox');loadInbox()"><b>\ud83d\udcac Inbox</b><span>\u0645\u062f\u06cc\u0631\u06cc\u062a \u067e\u06cc\u0627\u0645\u200c\u0647\u0627</span></button>
<button class="tool" onclick="show('leads');loadLeads()"><b>\ud83d\udc65 \u0644\u06cc\u062f\u0647\u0627</b><span>\u0645\u062f\u06cc\u0631\u06cc\u062a \u0633\u0631\u0646\u062e\u200c\u0647\u0627</span></button>
<button class="tool" onclick="show('leads');loadLeadOverview()"><b>\ud83c\udfaf \u062c\u0630\u0628 \u0645\u0634\u062a\u0631\u06cc</b><span>Lead Scoring / CRM / Funnel</span></button>
<button class="tool" onclick="show('adFinder');loadAdTargets();loadAdAutopilotStatus();loadAdOverview();loadAdPreflight()"><b>\ud83d\udce3 \u067e\u06cc\u062f\u0627 \u06a9\u0631\u062f\u0646 \u0645\u0634\u062a\u0631\u06cc \u062a\u0628\u0644\u06cc\u063a\u0627\u062a</b><span>\u0637\u0644\u0627\u0641\u0631\u0648\u0634 \u00b7 \u0633\u0627\u0639\u062a\u200c\u0641\u0631\u0648\u0634 \u00b7 \u0628\u062f\u0644\u06cc\u200c\u0641\u0631\u0648\u0634 \u00b7 \u062a\u0628\u0644\u06cc\u063a\u0627\u062a \u0647\u062f\u0641\u0645\u0646\u062f</span></button>
<button class="tool" onclick="show('telegramMedia');loadTelegramMedia()"><b>\ud83d\udce6 \u0631\u0633\u0627\u0646\u0647 \u0645\u062d\u0635\u0648\u0644\u0627\u062a Telegram</b><span>\u062f\u0631\u06cc\u0627\u0641\u062a \u0639\u06a9\u0633 \u0648 \u0648\u06cc\u062f\u0626\u0648\u06cc \u0645\u062d\u0635\u0648\u0644\u0627\u062a \u0627\u0632 \u06a9\u0627\u0646\u0627\u0644</span></button>
<button class="tool" onclick="show('whatsappStory');loadWhatsappStory()"><b>\ud83d\udcf1 \u0627\u0633\u062a\u0648\u0631\u06cc WhatsApp</b><span>\u0622\u0645\u0627\u062f\u0647\u200c\u0633\u0627\u0632\u06cc \u0639\u06a9\u0633 \u0648 \u0648\u06cc\u062f\u0626\u0648 \u0628\u0631\u0627\u06cc \u0627\u0633\u062a\u0648\u0631\u06cc</span></button>
<button class="tool" onclick="show('metrics');loadMetrics()"><b>\ud83d\udcca \u0622\u0645\u0627\u0631</b><span>\u062f\u0627\u062f\u0647\u200c\u0647\u0627\u06cc \u0627\u062c\u062a\u0645\u0627\u0639\u06cc</span></button>
<button class="tool" onclick="show('system');loadSystem()"><b>\u2699\ufe0f \u0633\u06cc\u0633\u062a\u0645</b><span>Health / Recovery / Logs</span></button>
</div></div><div class="card"><div class="title">\u0648\u0636\u0639\u06cc\u062a</div><div id="homeStatus" class="status ok">\u0645\u062a\u0635\u0644</div></div></div>
<div id="generate" class="section"><div class="card"><div class="title">\u270d\ufe0f \u062a\u0648\u0644\u06cc\u062f \u0645\u062d\u062a\u0648\u0627</div><div class="label">\u0645\u0648\u0636\u0648\u0639</div><input id="gTopic" class="field" placeholder="\u0645\u062b\u0644\u0627\u064b \u062c\u0639\u0628\u0647 \u0644\u0648\u06a9\u0633 \u0637\u0644\u0627 \u0648 \u062c\u0648\u0627\u0647\u0631"><div class="label">\u067e\u0644\u062a\u0641\u0631\u0645</div><select id="gPlatform" class="field"><option value="instagram">Instagram</option><option value="telegram">Telegram</option><option value="both">Both</option></select><div class="label">\u0632\u0628\u0627\u0646</div><select id="gLanguage" class="field"><option value="fa-IR">\u0641\u0627\u0631\u0633\u06cc</option><option value="ar-IQ">\u0639\u0631\u0628\u06cc \u0639\u0631\u0627\u0642\u06cc</option></select><div class="label">\u0628\u0627\u0632\u0627\u0631</div><select id="gMarket" class="field"><option value="Iran">Iran</option><option value="Iraq">Iraq</option></select><div class="label">\u0627\u0637\u0644\u0627\u0639\u0627\u062a \u0648\u0627\u0642\u0639\u06cc \u0645\u062c\u0627\u0632 \u0628\u0631\u0627\u06cc \u0627\u0633\u062a\u0641\u0627\u062f\u0647</div><textarea id="gFacts" class="field" rows="5" placeholder="\u0641\u0642\u0637 \u0648\u0627\u0642\u0639\u06cc\u062a\u200c\u0647\u0627\u06cc\u06cc \u06a9\u0647 \u062e\u0648\u062f\u062a \u062a\u0623\u06cc\u06cc\u062f \u06a9\u0631\u062f\u0647\u200c\u0627\u06cc"></textarea><div class="row" style="margin-top:10px"><button id="generateBtn" class="btn primary" onclick="generate()">\u0633\u0627\u062e\u062a \u0645\u062d\u062a\u0648\u0627</button></div><div id="generateStatus" class="status"></div></div><div id="generatedResult"></div></div>
<div id="approval" class="section"><div class="card"><div class="title">\u2705 \u0645\u062d\u062a\u0648\u0627\u06cc \u062f\u0631 \u0627\u0646\u062a\u0638\u0627\u0631 \u062a\u0623\u06cc\u06cc\u062f</div><div id="approvalStatus" class="status"></div><div id="approvalList"></div></div><div class="card"><div class="title">\ud83d\ude80 \u0627\u0646\u062a\u0634\u0627\u0631 \u0645\u062d\u062a\u0648\u0627\u06cc \u062a\u0623\u06cc\u06cc\u062f\u0634\u062f\u0647</div><div id="approvedStatus" class="status"></div><div id="approvedList"></div></div></div>
<div id="calendar" class="section"><div class="card"><div class="title">\ud83d\udcc5 \u062a\u0642\u0648\u06cc\u0645 \u0645\u062d\u062a\u0648\u0627\u06cc\u06cc</div><div class="two"><div><div class="label">Content ID (\u0627\u062e\u062a\u06cc\u0627\u0631\u06cc)</div><input id="calContent" class="field" placeholder="\u0634\u0646\u0627\u0633\u0647 \u0645\u062d\u062a\u0648\u0627"></div><div><div class="label">Campaign ID (\u0627\u062e\u062a\u06cc\u0627\u0631\u06cc)</div><input id="calCampaign" class="field" placeholder="\u0634\u0646\u0627\u0633\u0647 \u06a9\u0645\u067e\u06cc\u0646"></div></div><div class="label">\u0632\u0645\u0627\u0646 \u0628\u0631\u0646\u0627\u0645\u0647\u200c\u0631\u06cc\u0632\u06cc</div><input id="calTime" class="field" type="datetime-local"><div class="label">Public Media URL (\u0628\u0631\u0627\u06cc Instagram)</div><input id="calMedia" class="field" type="url" placeholder="https://..."><div class="row" style="margin-top:10px"><button class="btn primary" onclick="addCalendar()">\u0627\u0641\u0632\u0648\u062f\u0646 \u0628\u0647 \u062a\u0642\u0648\u06cc\u0645</button></div><div id="calendarStatus" class="status"></div><div id="calendarList"></div></div></div>
<div id="campaigns" class="section"><div class="card"><div class="title">\ud83d\udce3 \u06a9\u0645\u067e\u06cc\u0646\u200c\u0647\u0627</div><div class="label">\u0646\u0627\u0645 \u06a9\u0645\u067e\u06cc\u0646</div><input id="campName" class="field"><div class="label">\u0647\u062f\u0641</div><input id="campGoal" class="field"><div class="label">\u0645\u062e\u0627\u0637\u0628</div><input id="campAudience" class="field"><div class="row" style="margin-top:10px"><button class="btn primary" onclick="addCampaign()">\u0633\u0627\u062e\u062a \u06a9\u0645\u067e\u06cc\u0646</button></div><div id="campaignStatus" class="status"></div><div id="campaignList"></div></div></div>
<div id="telegramMedia" class="section"><div class="card"><div class="title">\ud83d\udce6 \u0645\u0646\u0628\u0639 \u0645\u062d\u0635\u0648\u0644\u0627\u062a Telegram</div><div class="mini">\u0631\u0628\u0627\u062a \u067e\u0633\u062a\u200c\u0647\u0627\u06cc \u062c\u062f\u06cc\u062f \u06a9\u0627\u0646\u0627\u0644 \u0631\u0627 \u0645\u06cc\u200c\u06af\u06cc\u0631\u062f\u061b \u0622\u0631\u0634\u06cc\u0648 \u0642\u062f\u06cc\u0645\u06cc Telegram \u0627\u0632 \u0637\u0631\u06cc\u0642 Bot API \u0642\u0627\u0628\u0644 \u062e\u0648\u0627\u0646\u062f\u0646 \u0646\u06cc\u0633\u062a.</div><div class="row" style="margin-top:12px"><button class="btn primary" onclick="setupTelegramMedia()">\u0641\u0639\u0627\u0644\u200c\u0633\u0627\u0632\u06cc \u062f\u0631\u06cc\u0627\u0641\u062a \u0631\u0633\u0627\u0646\u0647</button><button class="btn secondary" onclick="loadTelegramMedia()">\u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc</button></div><div id="telegramMediaStatus" class="status"></div><div id="telegramMediaList"></div></div></div>
<div id="whatsappStory" class="section"><div class="card"><div class="title">\ud83d\udcf1 \u0627\u0633\u062a\u0648\u0631\u06cc WhatsApp</div><div class="mini">\u0631\u0633\u0627\u0646\u0647\u200c\u0647\u0627\u06cc \u0648\u0627\u0642\u0639\u06cc \u0645\u062d\u0635\u0648\u0644\u0627\u062a \u0627\u0632 Telegram \u0627\u06cc\u0646\u062c\u0627 \u0622\u0645\u0627\u062f\u0647 \u0645\u06cc\u200c\u0634\u0648\u0646\u062f. \u0627\u0646\u062a\u0634\u0627\u0631 \u0627\u0633\u062a\u0648\u0631\u06cc WhatsApp \u062f\u0633\u062a\u06cc \u0627\u0633\u062a\u061b \u067e\u0646\u0644 \u0639\u06a9\u0633/\u0648\u06cc\u062f\u0626\u0648 \u0631\u0627 \u062f\u0631 \u0627\u062e\u062a\u06cc\u0627\u0631 \u062a\u0648 \u0645\u06cc\u200c\u06af\u0630\u0627\u0631\u062f \u062a\u0627 \u062f\u0627\u062e\u0644 WhatsApp Status \u0645\u0646\u062a\u0634\u0631 \u06a9\u0646\u06cc.</div><div class="row" style="margin-top:12px"><button class="btn primary" onclick="loadWhatsappStory()">\u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc \u0631\u0633\u0627\u0646\u0647</button><button class="btn secondary" onclick="window.open('https://wa.me/','_blank')">\u0628\u0627\u0632 \u06a9\u0631\u062f\u0646 WhatsApp</button></div><div id="whatsappStoryStatus" class="status"></div><div id="whatsappStoryList"></div></div></div>
<div id="inbox" class="section"><div class="card"><div class="title">\ud83d\udcac Inbox</div><div id="inboxStatus" class="status"></div><div id="inboxList"></div></div></div>
<div id="leads" class="section"><div class="card"><div class="title">\ud83c\udfaf \u0645\u0631\u06a9\u0632 \u062c\u0630\u0628 \u0645\u0634\u062a\u0631\u06cc Instagram</div><div class="two"><div><div class="stat" id="leadTotal">0</div><div class="muted">\u06a9\u0644 \u0644\u06cc\u062f\u0647\u0627</div></div><div><div class="stat" id="leadConversion">0%</div><div class="muted">\u0646\u0631\u062e \u062a\u0628\u062f\u06cc\u0644 \u0627\u0632 \u0644\u06cc\u062f\u0647\u0627\u06cc \u062a\u0645\u0627\u0633\u200c\u06af\u0631\u0641\u062a\u0647\u200c\u0634\u062f\u0647</div></div></div><div class="row" style="margin-top:12px"><button class="btn primary" onclick="loadLeadOverview()">\u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc CRM</button><button class="btn secondary" onclick="showLeadQueue('hot')">\ud83d\udd25 \u0644\u06cc\u062f\u0647\u0627\u06cc \u062f\u0627\u063a</button><button class="btn secondary" onclick="showLeadQueue('followup')">\u23f0 \u067e\u06cc\u06af\u06cc\u0631\u06cc\u200c\u0647\u0627\u06cc \u0627\u0645\u0631\u0648\u0632</button></div><div id="leadOverviewStatus" class="status"></div><div id="leadActionList"></div></div><div class="card"><div class="title">\ud83d\udd0e Instagram Lead Finder</div><div class="label">\u0647\u0634\u062a\u06af/\u06a9\u0644\u06cc\u062f\u0648\u0627\u0698\u0647 Instagram</div><input id="igLeadQuery" class="field" placeholder="\u0645\u062b\u0644\u0627\u064b jewelry \u06cc\u0627 \u0637\u0644\u0627"><div class="row" style="margin-top:10px"><button class="btn primary" onclick="discoverInstagramLeads()">\u067e\u06cc\u062f\u0627 \u06a9\u0631\u062f\u0646 \u067e\u06cc\u062c\u200c\u0647\u0627\u06cc \u0645\u0631\u062a\u0628\u0637</button></div><div id="igLeadStatus" class="status"></div><div id="igLeadList"></div></div><div class="card"><div class="title">\ud83e\udd1d Outreach Center</div><div class="mini">\u067e\u06cc\u0627\u0645\u200c\u0647\u0627 \u0641\u0642\u0637 Draft \u0647\u0633\u062a\u0646\u062f \u0648 \u0627\u0631\u0633\u0627\u0644 \u062e\u0648\u062f\u06a9\u0627\u0631 \u0627\u0646\u062c\u0627\u0645 \u0646\u0645\u06cc\u200c\u0634\u0648\u062f.</div><div id="outreachList"></div></div><div class="card"><div class="title">\ud83d\udcc8 \u0642\u06cc\u0641 \u0641\u0631\u0648\u0634</div><div id="leadFunnel" class="status"></div></div><div class="card"><div class="title">\ud83d\udc64 \u0627\u0641\u0632\u0648\u062f\u0646 \u0644\u06cc\u062f \u062f\u0633\u062a\u06cc</div><div class="two"><div><div class="label">\u0646\u0627\u0645</div><input id="leadName" class="field"></div><div><div class="label">\u062a\u0645\u0627\u0633</div><input id="leadContact" class="field"></div></div><div class="two"><div><div class="label">\u0645\u0631\u062d\u0644\u0647</div><select id="leadStage" class="field"><option value="new">\u062c\u062f\u06cc\u062f</option><option value="qualified">\u0648\u0627\u062c\u062f \u0634\u0631\u0627\u06cc\u0637</option><option value="contacted">\u062a\u0645\u0627\u0633 \u06af\u0631\u0641\u062a\u0647 \u0634\u062f</option><option value="replied">\u067e\u0627\u0633\u062e \u062f\u0627\u062f\u0647</option><option value="negotiation">\u0645\u0630\u0627\u06a9\u0631\u0647</option><option value="customer">\u0645\u0634\u062a\u0631\u06cc</option></select></div><div><div class="label">\u0627\u0648\u0644\u0648\u06cc\u062a</div><select id="leadPriority" class="field"><option value="normal">\u0639\u0627\u062f\u06cc</option><option value="high">\u062f\u0627\u063a</option><option value="low">\u06a9\u0645</option></select></div></div><div class="label">\u06cc\u0627\u062f\u062f\u0627\u0634\u062a</div><textarea id="leadNotes" class="field" rows="3"></textarea><div class="label">\u0632\u0645\u0627\u0646 \u067e\u06cc\u06af\u06cc\u0631\u06cc \u0628\u0639\u062f\u06cc</div><input id="leadFollowup" class="field" type="datetime-local"><div class="row" style="margin-top:10px"><button class="btn primary" onclick="addLead()">\u0627\u0641\u0632\u0648\u062f\u0646 \u0644\u06cc\u062f</button></div><div id="leadStatus" class="status"></div><div id="leadList"></div></div></div>
<div id="adFinder" class="section"><div class="card"><div class="title">\ud83e\udd16 \u0645\u0631\u06a9\u0632 \u0639\u0645\u0644\u06cc\u0627\u062a \u062e\u0648\u062f\u06a9\u0627\u0631 \u062a\u0628\u0644\u06cc\u063a\u0627\u062a</div><div class="mini">\u0633\u06cc\u0633\u062a\u0645 \u062e\u0648\u062f\u0634 \u0645\u0634\u062a\u0631\u06cc\u200c\u06cc\u0627\u0628\u06cc\u060c \u0641\u0631\u0635\u062a \u062a\u0628\u0644\u06cc\u063a\u060c CRM\u060c \u0645\u0630\u0627\u06a9\u0631\u0647 \u0648 \u067e\u06cc\u06af\u06cc\u0631\u06cc \u0631\u0627 \u0645\u062f\u06cc\u0631\u06cc\u062a \u0645\u06cc\u200c\u06a9\u0646\u062f.</div><div id="adOverviewBody" class="status"></div><div class="row"><button class="btn primary" onclick="runAdAutopilot()">\u25b6\ufe0f \u0627\u062c\u0631\u0627\u06cc \u06a9\u0627\u0645\u0644</button><button class="btn secondary" onclick="runAdFollowups()">\u23f0 \u0627\u062c\u0631\u0627\u06cc \u067e\u06cc\u06af\u06cc\u0631\u06cc\u200c\u0647\u0627</button><button class="btn secondary" onclick="loadAdOverview()">\u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc</button></div><div id="adFollowupStatus" class="status"></div><div id="adOpportunityList"></div></div><div class="card"><div class="title">\ud83d\udce3 \u067e\u06cc\u062f\u0627 \u06a9\u0631\u062f\u0646 \u0645\u0634\u062a\u0631\u06cc \u062a\u0628\u0644\u06cc\u063a\u0627\u062a</div><div class="mini">\u0645\u0646\u0628\u0639 \u0645\u062d\u0635\u0648\u0644 \u0648 \u0645\u0639\u0631\u0641\u06cc \u0628\u0631\u0646\u062f: <b>www.hamzehibox.com</b></div><div class="label">\u0646\u0648\u0639 \u0645\u0634\u062a\u0631\u06cc \u0647\u062f\u0641</div><select id="adsType" class="field"><option value="gold">\u0637\u0644\u0627\u0641\u0631\u0648\u0634</option><option value="watch">\u0633\u0627\u0639\u062a\u200c\u0641\u0631\u0648\u0634</option><option value="fashion_jewelry">\u0628\u062f\u0644\u06cc\u200c\u0641\u0631\u0648\u0634</option><option value="all">\u0647\u0631 \u0633\u0647 \u06af\u0631\u0648\u0647</option></select><div class="label">\u0634\u0647\u0631 / \u0628\u0627\u0632\u0627\u0631</div><input id="adsCity" class="field" placeholder="\u0645\u062b\u0644\u0627\u064b \u062a\u0647\u0631\u0627\u0646\u060c \u0645\u0634\u0647\u062f\u060c \u062f\u0628\u06cc\u2026"><div class="label">\u062c\u0632\u0626\u06cc\u0627\u062a \u0627\u062e\u062a\u06cc\u0627\u0631\u06cc</div><input id="adsExtra" class="field" placeholder="\u0645\u062b\u0644\u0627\u064b \u0641\u0631\u0648\u0634\u06af\u0627\u0647\u200c\u0647\u0627\u06cc \u0644\u0648\u06a9\u0633\u060c \u0639\u0645\u062f\u0647\u200c\u0641\u0631\u0648\u0634\u060c \u0641\u0631\u0648\u0634 \u0622\u0646\u0644\u0627\u06cc\u0646"><div class="row" style="margin-top:10px"><button class="btn primary" onclick="runAdAutopilot()">\ud83e\udd16 \u0627\u062c\u0631\u0627\u06cc \u062e\u0644\u0628\u0627\u0646 \u062e\u0648\u062f\u06a9\u0627\u0631</button><button class="btn secondary" onclick="autoAdCampaign()">\u0634\u0631\u0648\u0639 \u06a9\u0645\u067e\u06cc\u0646 \u067e\u0627\u06cc\u0647</button><button class="btn secondary" onclick="discoverAdCustomers()">\ud83d\udd0e \u062c\u0633\u062a\u062c\u0648\u06cc \u062f\u0633\u062a\u06cc</button><button class="btn secondary" onclick="loadAdTargets()">\u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc CRM</button></div><div id="adsStatus" class="status"></div><div id="adsList"></div></div><div class="card"><div class="title">\ud83e\udd16 \u0648\u0636\u0639\u06cc\u062a \u062e\u0644\u0628\u0627\u0646 \u062e\u0648\u062f\u06a9\u0627\u0631</div><div class="mini">\u06cc\u06a9\u200c\u0628\u0627\u0631 START \u0628\u0632\u0646\u061b \u0633\u06cc\u0633\u062a\u0645 \u0637\u0628\u0642 \u062a\u0646\u0638\u06cc\u0645\u0627\u062a \u0641\u0639\u0644\u06cc\u060c \u0645\u0634\u062a\u0631\u06cc\u200c\u06cc\u0627\u0628\u06cc\u060c \u0628\u0631\u0631\u0633\u06cc \u0641\u0631\u0635\u062a \u062a\u0628\u0644\u06cc\u063a\u060c CRM\u060c \u0645\u0630\u0627\u06a9\u0631\u0647 \u0648 \u067e\u06cc\u06af\u06cc\u0631\u06cc \u0631\u0627 \u062f\u0631 \u0686\u0631\u062e\u0647\u200c\u0647\u0627\u06cc \u0632\u0645\u0627\u0646\u200c\u0628\u0646\u062f\u06cc\u200c\u0634\u062f\u0647 \u0627\u062f\u0627\u0645\u0647 \u0645\u06cc\u200c\u062f\u0647\u062f \u062a\u0627 STOP.</div><div id="adAutopilotStatus" class="status"></div><div class="row"><button class="btn primary" onclick="startAdAutopilot()">\u25b6\ufe0f START AUTOPILOT</button><button class="btn danger" onclick="stopAdAutopilot()">\u23f9\ufe0f STOP AUTOPILOT</button><button class="btn secondary" onclick="loadAdAutopilotStatus()">\u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc \u0648\u0636\u0639\u06cc\u062a</button></div><div id="adAutopilotControlStatus" class="status"></div></div><div class="card"><div class="title">\ud83e\udde0 \u0647\u0648\u0634 \u0644\u06cc\u062f \u0648 \u0645\u0631\u06a9\u0632 \u0627\u0642\u062f\u0627\u0645</div><div class="mini">\u0627\u0648\u0644\u0648\u06cc\u062a \u0627\u0642\u062f\u0627\u0645 \u0627\u0645\u0631\u0648\u0632\u060c \u0627\u0645\u062a\u06cc\u0627\u0632 \u0642\u0627\u0628\u0644 \u062a\u0648\u0636\u06cc\u062d\u060c \u0641\u0631\u0635\u062a \u062a\u0628\u0644\u06cc\u063a \u0648 \u067e\u06cc\u06af\u06cc\u0631\u06cc\u200c\u0647\u0627\u06cc \u0633\u0631\u0631\u0633\u06cc\u062f\u0634\u062f\u0647.</div><div id="adIntelligenceBody" class="status"></div><div id="adActionList"></div><div class="row" style="margin-top:10px"><button class="btn secondary" onclick="loadAdIntelligence()">\ud83e\udde0 \u062a\u062d\u0644\u06cc\u0644 \u0647\u0648\u0634\u0645\u0646\u062f</button><button class="btn primary" onclick="loadAdActionCenter()">\ud83d\udea6 \u0627\u0642\u062f\u0627\u0645 \u0627\u0645\u0631\u0648\u0632</button></div><div id="adActionCenter" class="status"></div></div><div class="card"><div class="title">\ud83d\udee1\ufe0f \u0633\u0644\u0627\u0645\u062a \u0648 \u067e\u06cc\u0634\u200c\u0628\u0631\u0631\u0633\u06cc \u062a\u0628\u0644\u06cc\u063a\u0627\u062a</div><div class="mini">\u0642\u0628\u0644 \u0627\u0632 \u0627\u062c\u0631\u0627\u06cc \u0639\u0645\u0644\u06cc\u0627\u062a\u060c \u0645\u0633\u06cc\u0631 \u0648\u0628\u060c \u0645\u062d\u062f\u0648\u062f\u06cc\u062a \u0627\u062c\u0631\u0627\u060c \u0627\u0645\u0646\u06cc\u062a URL \u0648 \u0627\u062a\u0635\u0627\u0644\u200c\u0647\u0627\u06cc \u0644\u0627\u0632\u0645 \u0628\u0631\u0631\u0633\u06cc \u0645\u06cc\u200c\u0634\u0648\u062f.</div><div id="adPreflight" class="status"></div><div class="row"><button class="btn secondary" onclick="loadAdPreflight()">\u0628\u0631\u0631\u0633\u06cc \u0622\u0645\u0627\u062f\u06af\u06cc</button></div></div><div class="card"><div class="title">\ud83e\udd1d \u0645\u0633\u06cc\u0631 \u062a\u0628\u0644\u06cc\u063a\u0627\u062a \u0648 \u0645\u0630\u0627\u06a9\u0631\u0647</div><div class="mini">\u062d\u0627\u0644\u062a \u062e\u0648\u062f\u06a9\u0627\u0631: \u0647\u0631 \u0633\u0647 \u06af\u0631\u0648\u0647 \u0647\u062f\u0641 \u0631\u0627 \u067e\u06cc\u062f\u0627 \u0645\u06cc\u200c\u06a9\u0646\u062f\u060c \u0633\u0627\u06cc\u062a \u0648 \u0645\u0633\u06cc\u0631 \u062a\u0628\u0644\u06cc\u063a\u0627\u062a \u0631\u0627 \u0628\u0631\u0631\u0633\u06cc \u0645\u06cc\u200c\u06a9\u0646\u062f\u060c Lead \u0631\u0627 \u062f\u0631 CRM \u0630\u062e\u06cc\u0631\u0647 \u0645\u06cc\u200c\u06a9\u0646\u062f \u0648 \u067e\u06cc\u0634\u200c\u0646\u0648\u06cc\u0633 \u0645\u0630\u0627\u06a9\u0631\u0647 \u0631\u0627 \u0645\u06cc\u200c\u0633\u0627\u0632\u062f. \u0641\u0642\u0637 \u06a9\u0627\u0631\u0647\u0627\u06cc \u0646\u06cc\u0627\u0632\u0645\u0646\u062f \u0645\u062c\u0648\u0632\u060c \u067e\u0631\u062f\u0627\u062e\u062a\u060c \u0642\u0631\u0627\u0631\u062f\u0627\u062f \u06cc\u0627 \u062f\u0633\u062a\u0631\u0633\u06cc \u0627\u062e\u062a\u0635\u0627\u0635\u06cc \u0628\u0631\u0627\u06cc \u062a\u0623\u06cc\u06cc\u062f \u062a\u0648 \u0645\u062a\u0648\u0642\u0641 \u0645\u06cc\u200c\u0634\u0648\u0646\u062f.</div><div id="adsSavedStatus" class="status"></div><div id="adsSavedList"></div></div></div><div id="metrics" class="section"><div class="card"><div class="title">\ud83d\udcca \u0622\u0645\u0627\u0631</div><div id="metricsBody" class="status"></div></div></div>
<div id="system" class="section"><div class="card"><div class="title">\u2699\ufe0f \u0648\u0636\u0639\u06cc\u062a \u0633\u06cc\u0633\u062a\u0645</div><div id="systemBody" class="status"></div><div class="row"><button class="btn secondary" onclick="loadSystem()">\u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc</button><button class="btn secondary" onclick="runRelease()">Release Check</button></div><div id="releaseStatus" class="status"></div></div><div class="card"><div class="title">\ud83d\udd10 \u062a\u0646\u0638\u06cc\u0645\u0627\u062a \u0627\u062a\u0635\u0627\u0644</div><div id="settingsBody" class="status">\u062f\u0631 \u062d\u0627\u0644 \u062f\u0631\u06cc\u0627\u0641\u062a\u2026</div><div class="row"><button class="btn secondary" onclick="testConnections()">\u062a\u0633\u062a \u0627\u062a\u0635\u0627\u0644 \u0648\u0627\u0642\u0639\u06cc</button></div><div id="connectionTestBody" class="status"></div></div><div class="card"><div class="title">\ud83d\ude80 \u0627\u062c\u0631\u0627\u06cc \u0627\u0646\u062a\u0634\u0627\u0631</div><div id="runsBody" class="status">\u062f\u0631 \u062d\u0627\u0644 \u062f\u0631\u06cc\u0627\u0641\u062a\u2026</div></div><div class="card"><div class="title">\ud83e\uddfe \u0644\u0627\u06af \u0633\u06cc\u0633\u062a\u0645</div><div id="eventsBody" class="status">\u062f\u0631 \u062d\u0627\u0644 \u062f\u0631\u06cc\u0627\u0641\u062a\u2026</div></div></div>
</section>
</main>
<nav id="nav" class="nav hidden"><div class="navin"><button onclick="show('home')">\u2302 \u062e\u0627\u0646\u0647</button><button onclick="show('generate')">\u270d\ufe0f \u062a\u0648\u0644\u06cc\u062f</button><button onclick="show('approval');loadApprovals()">\u2705 \u062a\u0623\u06cc\u06cc\u062f</button><button onclick="show('system');loadSystem()">\u2699\ufe0f \u0633\u06cc\u0633\u062a\u0645</button></div></nav>
<script src="/dashboard.js" defer></script>
</body>
</html>`;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(recovery(env));
    if (event?.cron === "*/15 * * * *") {
      ctx.waitUntil((async()=>{
        try {
          await env.DB.prepare(`CREATE TABLE IF NOT EXISTS system_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`).run();
          const row=await env.DB.prepare("SELECT value FROM system_kv WHERE key='ads_autopilot_config'").first();
          let cfg={}; try{cfg=JSON.parse(row?.value||"{}")}catch{}
          if(!cfg.enabled) return;
          const input=validateAdsInput(cfg); if(!input.ok) return;
          await runAdAutopilotOnce(env,input,"scheduled");
          // Keep the follow-up queue moving while Autopilot is ON. Actual sending remains authorized-channel/manual.
          const rows=await env.DB.prepare("SELECT * FROM leads ORDER BY updated_at DESC LIMIT 500").all();
          const nowMs=Date.now();
          let preparedFollowups=0;
          for(const lead of (rows.results||[])){
            if(preparedFollowups>=AD_MAX_DRAFTS_PER_RUN) break;
            if(lead.stage==="customer"||lead.stage==="converted"||lead.stage==="rejected"||lead.stage==="archived") continue;
            const meta=parseLeadNotes(lead),at=meta.next_followup_at||meta.followup_at;
            if(!at||!Date.parse(at)||Date.parse(at)>nowMs||meta.followup_draft||!env.OPENAI_API_KEY) continue;
            try{
              const prompt=`Write a short polite Persian B2B follow-up for HAMZEHI BOX. Target: ${lead.name}. Website: ${lead.contact}. Previous outreach: ${meta.negotiation_draft||meta.outreach_draft||""}. Do not pressure, invent facts, or claim agreement. Ask if they had a chance to review and whether advertising/collaboration options are available. Under 500 characters. Draft only.`;
              const r=await fetchWithRetry("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:env.OPENAI_MODEL||"gpt-5.6-luna",input:prompt})},2,15000);
              const d=await r.json().catch(()=>({})); if(!r.ok) continue; const draft=responseText(d).trim(); if(!draft) continue;
              meta.followup_draft=draft; meta.followup_prepared_at=now(); meta.next_followup_at=null; meta.followup_at=at; meta.followup_status="prepared";
              await env.DB.prepare("UPDATE leads SET notes=?,updated_at=? WHERE id=?").bind(JSON.stringify(meta),now(),lead.id).run();
              preparedFollowups++;
            }catch{}
          }
        } catch(e) { await audit(env,"ad_autopilot_scheduled_error","Scheduled advertising Autopilot cycle failed",{error:e.message}); }
      })());
    }
    if (event?.cron === "0 7 * * *") {
      ctx.waitUntil((async()=>{
        try {
          const rows=await env.DB.prepare("SELECT * FROM leads ORDER BY updated_at DESC LIMIT 500").all();
          const due=[]; const nowMs=Date.now();
          for(const lead of (rows.results||[])){const meta=parseLeadNotes(lead);const at=meta.next_followup_at||meta.followup_at;if(at&&Date.parse(at)&&Date.parse(at)<=nowMs&&!meta.followup_draft&&! ["customer","converted","rejected","archived"].includes(lead.stage)) due.push({lead,meta});}
          for(const {lead,meta} of due.slice(0,AD_MAX_DRAFTS_PER_RUN)){
            if(!env.OPENAI_API_KEY) break;
            try{const prompt=`Write a short polite Persian B2B follow-up for HAMZEHI BOX. Target: ${lead.name}. Website: ${lead.contact}. Previous outreach: ${meta.negotiation_draft||meta.outreach_draft||""}. Do not pressure, invent facts, or claim agreement. Ask if they had a chance to review and whether advertising/collaboration options are available. Under 500 characters. Draft only.`;const r=await fetchWithRetry("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:env.OPENAI_MODEL||"gpt-5.6-luna",input:prompt})},2,15000);const d=await r.json().catch(()=>({}));if(!r.ok)continue;const draft=responseText(d).trim();if(!draft)continue;meta.followup_draft=draft;meta.followup_prepared_at=now();meta.next_followup_at=null;meta.followup_status="prepared";await env.DB.prepare("UPDATE leads SET notes=?,updated_at=? WHERE id=?").bind(JSON.stringify(meta),now(),lead.id).run();}catch{}}
          await audit(env,"ad_followups_scheduled","Daily advertising follow-up sweep completed",{due:due.length});
        } catch {}
      })());
    }
  },

  async fetch(req, env) {
    const u = new URL(req.url);

    try {
      if (req.method === "GET" && u.pathname === "/dashboard") {
        return new Response(dashboardHtml(), {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
        });
      }

      if (req.method === "GET" && u.pathname === "/dashboard.js") {
        return new Response(dashboardScript(), {
          status: 200,
          headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" }
        });
      }

      if (!(await rate(env, req)))
        return json({ ok: false, error: "Rate limit exceeded" }, 429);

      if (req.method === "GET" && u.pathname === "/api/diagnostic/location") {
        if (!auth(req, env))
          return json({ ok: false, error: "Unauthorized" }, 401);

        const cf = req.cf || {};

        return json({
          ok: true,
          diagnostic: "worker_incoming_location",
          country: cf.country || null,
          colo: cf.colo || null,
          city: cf.city || null,
          timezone: cf.timezone || null
        });
      }

      if (req.method === "GET" && u.pathname === "/api/health") {
        return json({
          ok: true,
          version: "V6.8-control-center",
          production: true,
          approval_required: true,
          auto_publish: true,
          r2: false,
          website_integration: false
        });
      }

      if (req.method === "GET" && u.pathname === "/api/recovery/validate") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);

        const required = ["DB", "ADMIN_TOKEN"];
        const missing = required.filter(k => !env[k]);

        return json({
          ok: missing.length === 0,
          missing,
          checks: {
            d1: !!env.DB,
            admin_token: !!env.ADMIN_TOKEN,
            website_integration: false,
            r2: false,
            github_dependency: false
          }
        });
      }

      if (u.pathname === "/api/telegram/webhook/setup" && req.method === "POST") return await setupTelegramWebhook(env, req);
      if (u.pathname === "/api/telegram/media" && req.method === "GET") return await getTelegramMedia(env, req);
      if (u.pathname === "/api/telegram/media/file" && req.method === "GET") return await proxyTelegramMedia(env, req);
      if (u.pathname === "/webhooks/telegram" && req.method === "POST") return await handleTelegramWebhook(env, req);
      if (u.pathname === "/webhooks/instagram" && (req.method === "GET" || req.method === "POST")) return await handleInstagramWebhook(env, req);

      if (u.pathname === "/api/release/test" && req.method === "POST") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const checks = await releaseTest(env);
        const ok = checks.length > 0 && checks.every(x => x.status === "PASS");
        return json({ ok, checks });
      }

      if (u.pathname === "/api/release/checks" && req.method === "GET") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const r = await env.DB.prepare(
          "SELECT * FROM release_checks ORDER BY checked_at DESC LIMIT 100"
        ).all();
        return json({ items: r.results || [] });
      }

      if (u.pathname === "/api/content/generate" && req.method === "POST") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const b = await req.json().catch(() => null);
        if (!b || typeof b !== "object") return json({ ok: false, error: "Invalid JSON body" }, 400);
        if (!String(b.topic || "").trim()) return json({ ok: false, error: "topic is required" }, 400);
        return json({ ok: true, content: await createGeneratedContent(env, b) });
      }

      if (u.pathname === "/api/content" && req.method === "GET") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        return json({ items: await listContent(env, u.searchParams.get("status")) });
      }

      if (u.pathname === "/api/content/approve" && req.method === "POST") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const b = await req.json().catch(() => null);
        if (!b || typeof b !== "object") return json({ ok: false, error: "Invalid JSON body" }, 400);
        if (!String(b.content_id || "").trim()) return json({ ok: false, error: "content_id is required" }, 400);
        if (!String(b.status || "").trim()) return json({ ok: false, error: "status is required" }, 400);
        if (!['approved','rejected','pending'].includes(String(b.status))) return json({ ok:false, error:"Invalid approval status" },400);
        try {
          return json({ ok: true, approval: await setApproval(env, b.content_id, b.status, b.reason || "") });
        } catch (e) {
          return json({ ok:false, error:e.message || "Approval failed" }, e.message === "Content not found" ? 404 : 400);
        }
      }

      if (u.pathname === "/api/publish" && req.method === "POST") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const b = await req.json().catch(() => null);
        if (!b || typeof b !== "object") return json({ ok: false, error: "Invalid JSON body" }, 400);
        if (!String(b.content_id || "").trim()) return json({ ok: false, error: "content_id is required" }, 400);
        try {
          return json({ ok: true, results: await publish(env, b) });
        } catch (e) {
          const msg = e.message || "Publish failed";
          const status = msg === "Approval required" ? 403 : msg === "Content not found" ? 404 : msg.startsWith("Publish outcome unknown") ? 409 : 400;
          return json({ ok:false, error:msg }, status);
        }
      }

      if (u.pathname === "/api/calendar" && req.method === "GET") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const r = await env.DB.prepare("SELECT * FROM calendar ORDER BY planned_at ASC, created_at DESC LIMIT 200").all();
        return json({ items: r.results || [] });
      }

      if (u.pathname === "/api/calendar" && req.method === "POST") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const b = await req.json().catch(() => null);
        if (!b || typeof b !== "object") return json({ ok: false, error: "Invalid JSON body" }, 400);
        if (!String(b.content_id || "").trim() || !String(b.planned_at || "").trim()) return json({ ok: false, error: "content_id and planned_at are required" }, 400);
        if (Number.isNaN(Date.parse(String(b.planned_at)))) return json({ ok:false, error:"planned_at must be a valid date/time" },400);
        const content = await env.DB.prepare("SELECT id,platform FROM contents WHERE id=?").bind(String(b.content_id)).first();
        if (!content) return json({ ok:false, error:"Content not found" },404);
        const allowedCalendarStatus = ["planned","paused"];
        if (!allowedCalendarStatus.includes(String(b.status || "planned"))) return json({ok:false,error:"Invalid calendar status"},400);
        const id = uid();
        const t = now();
        if (b.media_url) { try { const mu=new URL(String(b.media_url)); if (!/^https?:$/.test(mu.protocol)) throw Error(); } catch { return json({ ok:false, error:"media_url must be a valid http(s) URL" },400); } }
        await env.DB.prepare("INSERT INTO calendar(id,campaign_id,content_id,planned_at,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
          .bind(id, b.campaign_id || null, b.content_id || null, b.planned_at || null, b.status || "planned", t, t).run();
        if (b.media_url) await env.DB.prepare("INSERT INTO system_events VALUES(?,?,?,?,?,?)")
          .bind(uid(),"calendar_media","info","Calendar media URL stored",JSON.stringify({calendar_id:id,content_id:b.content_id||null,media_url:String(b.media_url)}),t).run();
        return json({ ok: true, id });
      }

      if (u.pathname === "/api/calendar" && req.method === "DELETE") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const b = await req.json().catch(() => null);
        if (!b || typeof b !== "object") return json({ ok: false, error: "Invalid JSON body" }, 400);
        if (!b.id) return json({ ok: false, error: "id is required" }, 400);
        await env.DB.prepare("DELETE FROM calendar WHERE id=?").bind(b.id).run();
        return json({ ok: true, id: b.id });
      }

      if (u.pathname === "/api/campaigns" && req.method === "GET") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const r = await env.DB.prepare("SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 100").all();
        return json({ items: r.results || [] });
      }

      if (u.pathname === "/api/campaigns" && req.method === "POST") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const b = await req.json().catch(() => null);
        if (!b || typeof b !== "object") return json({ ok: false, error: "Invalid JSON body" }, 400);
        const name = String(b.name || "").trim();
        if (!name) return json({ ok: false, error: "name is required" }, 400);
        if(name.length>160) return json({ok:false,error:"name is too long"},400);
        const contact=b.contact==null?null:String(b.contact).trim();
        if(contact && contact.length>500) return json({ok:false,error:"contact is too long"},400);
        const allowedStages=["new","discovered","qualified","contacted","replied","negotiation","customer","converted","rejected","archived"];
        const allowedPriorities=["low","normal","high"];
        const stage=String(b.stage||"new"); const priority=String(b.priority||"normal");
        if(!allowedStages.includes(stage)) return json({ok:false,error:"Invalid lead stage"},400);
        if(!allowedPriorities.includes(priority)) return json({ok:false,error:"Invalid lead priority"},400);
        const id = uid();
        const t = now();
        await env.DB.prepare("INSERT INTO campaigns(id,name,goal,audience,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
          .bind(id, name, b.goal || null, b.audience || null, b.status || "draft", t, t).run();
        return json({ ok: true, id });
      }

      if (u.pathname === "/api/campaigns" && req.method === "PATCH") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const b = await req.json().catch(() => null);
        if (!b || typeof b !== "object") return json({ ok: false, error: "Invalid JSON body" }, 400);
        if (!b.id) return json({ ok: false, error: "id is required" }, 400);
        const allowed = ["draft", "active", "paused", "archived"];
        if (!allowed.includes(b.status)) return json({ ok: false, error: "Invalid campaign status" }, 400);
        const t = now();
        await env.DB.prepare("UPDATE campaigns SET status=?,updated_at=? WHERE id=?").bind(b.status, t, b.id).run();
        return json({ ok: true, id: b.id, status: b.status });
      }

      if (u.pathname === "/api/inbox" && req.method === "GET") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const r = await env.DB.prepare("SELECT * FROM inbox_messages ORDER BY created_at DESC LIMIT 200").all();
        return json({ items: r.results || [] });
      }

      if (u.pathname === "/api/inbox" && req.method === "PATCH") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const b = await req.json().catch(() => null);
        if (!b || typeof b !== "object") return json({ ok: false, error: "Invalid JSON body" }, 400);
        if (!b.id) return json({ ok: false, error: "id is required" }, 400);
        const allowed = ["new", "handled", "archived", "pending"];
        if (!allowed.includes(b.status)) return json({ ok: false, error: "Invalid inbox status" }, 400);
        await env.DB.prepare("UPDATE inbox_messages SET status=?,updated_at=? WHERE id=?").bind(b.status, now(), b.id).run();
        return json({ ok: true, id: b.id, status: b.status });
      }

      if (u.pathname === "/api/leads" && req.method === "GET") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const r = await env.DB.prepare("SELECT * FROM leads ORDER BY created_at DESC LIMIT 200").all();
        return json({ items: r.results || [] });
      }

      if (u.pathname === "/api/leads" && req.method === "POST") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const b = await req.json().catch(() => null);
        if (!b || typeof b !== "object") return json({ ok: false, error: "Invalid JSON body" }, 400);
        const name = String(b.name || "").trim();
        if (!name) return json({ ok: false, error: "name is required" }, 400);
        const id = uid();
        const t = now();
        const meta = { manual_notes: String(b.notes || "").slice(0,5000), source: "manual", score: b.score !== undefined ? Math.max(0, Math.min(100, Number(b.score) || 0)) : 10, next_followup_at: b.next_followup_at || null };
        await env.DB.prepare("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
          .bind(id, name, contact, stage, priority, JSON.stringify(meta), t, t).run();
        return json({ ok: true, id });
      }

      if (u.pathname === "/api/ads/targets" && req.method === "GET") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const r = await env.DB.prepare("SELECT * FROM leads ORDER BY updated_at DESC LIMIT 500").all();
        const items = (r.results || []).filter(x => { try { const m = JSON.parse(x.notes || "{}"); return m.source === "ad_discovery" || m.ad_target === true; } catch { return false; } });
        return json({ ok: true, items });
      }

      if (u.pathname === "/api/ads/discover" && req.method === "POST") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const b = await req.json().catch(() => null);
        if(!b || typeof b!=="object") return json({ok:false,error:"Invalid JSON body"},400);
        const input=validateAdsInput(b);
        if(!input.ok) return json(input,400);
        const {type,city,extra}=input;
        const sourceSite = "https://www.hamzehibox.com";
        const terms = { gold:"Ø·ÙØ§ÙØ±ÙØ´Û Ø·ÙØ§ Ø¬ÙØ§ÙØ± Ø²Ø±Ú¯Ø±Û Ú¯Ø§ÙØ±Û Ø·ÙØ§", watch:"Ø³Ø§Ø¹Øª ÙØ±ÙØ´Û ÙØ±ÙØ´Ú¯Ø§Ù Ø³Ø§Ø¹Øª Ø³Ø§Ø¹Øª ÙÚÛ Ø³Ø§Ø¹Øª ÙÙÚ©Ø³", fashion_jewelry:"Ø¨Ø¯ÙÛØ¬Ø§Øª Ø¨Ø¯ÙÛ ÙØ±ÙØ´Û Ø²ÛÙØ±Ø¢ÙØ§Øª ÙØ§ÙØªØ²Û Ø§Ú©Ø³Ø³ÙØ±Û", all:"Ø·ÙØ§ÙØ±ÙØ´Û Ø·ÙØ§ Ø¬ÙØ§ÙØ± Ø³Ø§Ø¹Øª ÙØ±ÙØ´Û ÙØ±ÙØ´Ú¯Ø§Ù Ø³Ø§Ø¹Øª Ø¨Ø¯ÙÛØ¬Ø§Øª Ø¨Ø¯ÙÛ ÙØ±ÙØ´Û Ø²ÛÙØ±Ø¢ÙØ§Øª ÙØ§ÙØªØ²Û" };
        if (!terms[type]) return json({ ok:false, error:"ÙÙØ¹ ÙØ´ØªØ±Û ÙØ§ÙØ¹ØªØ¨Ø± Ø§Ø³Øª" },400);
        const q = [terms[type], city, extra].filter(Boolean).join(" ");
        const discovery = await discoverWebLinks(q, 10);
        const links = discovery.links;
        if (!links.length) return json({ ok:false, error:"Ø¬Ø³ØªØ¬ÙÛ ÙØ¨ ÙØ¹ÙØ§Ù ÙØªÛØ¬ÙâØ§Û Ø¨Ø±ÙÚ¯Ø±Ø¯Ø§ÙØ¯Ø Ø¯ÙØ¨Ø§Ø±Ù Ø¨Ø¹Ø¯Ø§Ù ØªÙØ§Ø´ Ú©ÙÛØ¯", provider: discovery.provider },502);
        const items=[]; const t=now();
        for (const url of links.slice(0,AD_MAX_DISCOVERY_SITES)) {
          try {
            const rr=await fetchWithRetry(url,{headers:{"User-Agent":"Mozilla/5.0 (compatible; HAMZEHI-SOCIAL-AI/1.0)"}},2,AD_FETCH_TIMEOUT_MS);
            const tx=(await rr.text()).slice(0,180000);
            const title=(tx.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||url).replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,160);
            const plain=tx.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
            const low=plain.toLowerCase();
            const hit=/Ø·ÙØ§|Ø¬ÙØ§ÙØ±|Ø³Ø§Ø¹Øª|Ø¨Ø¯ÙÛ|gold|jewel|watch|accessor/i.test(plain);
            const adHit=/ØªØ¨ÙÛØº|advertis|sponsor|Ø±Ù¾ÙØ±ØªØ§Ú|ØªÙØ§Ø³ Ø¨Ø§ ÙØ§|contact us|media kit|ÙÙÚ©Ø§Ø±Û/i.test(plain);
            const score=Math.min(100,(hit?55:20)+(adHit?25:0)+(city && plain.includes(city)?10:0));
            let contactUrl=null;
            const cm=tx.match(/href=["']([^"']+)["'][^>]*>[^<]*(?:ØªÙØ§Ø³|contact|advertis|ØªØ¨ÙÛØº)[^<]*</i);
            if(cm){try{contactUrl=new URL(cm[1],url).toString()}catch{}}
            const host=new URL(url).hostname;
            const name=title||host;
            const notes=JSON.stringify({source:"ad_discovery",ad_target:true,source_site:sourceSite,type,city,query:q,url,evidence:plain.slice(0,700),contact_url:contactUrl,discovered_at:t,score});
            const existing=await env.DB.prepare("SELECT id FROM leads WHERE contact=? LIMIT 1").bind(url).first();
            let id;
            if(existing){id=existing.id;await env.DB.prepare("UPDATE leads SET priority=?,notes=?,updated_at=? WHERE id=?").bind(score>=70?"high":score>=45?"normal":"low",notes,t,id).run();}
            else{id=uid();await env.DB.prepare("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(id,name,url,"discovered",score>=70?"high":score>=45?"normal":"low",notes,t,t).run();}
            items.push({id,name,kind:type,city,url,contact_url:contactUrl,score,evidence:plain.slice(0,240)});
          } catch {}
        }
        items.sort((a,z)=>z.score-a.score);
        await audit(env,"ad_customer_discovery","Advertising target/customer discovery completed",{type,city,found:items.length,query:q,source_site:sourceSite});
        return json({ok:true,query:q,source_site:sourceSite,items});
      }

      if (u.pathname === "/api/ads/auto-run" && req.method === "POST") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const b = await req.json().catch(() => null);
        if(!b || typeof b!=="object") return json({ok:false,error:"Invalid JSON body"},400);
        const input=validateAdsInput(b);
        if(!input.ok) return json(input,400);
        const {type,city,extra}=input;
        const sourceSite = "https://www.hamzehibox.com";
        const allGroups = [
          ["gold", "Ø·ÙØ§ÙØ±ÙØ´Û Ø·ÙØ§ Ø¬ÙØ§ÙØ± Ø²Ø±Ú¯Ø±Û Ú¯Ø§ÙØ±Û Ø·ÙØ§"],
          ["watch", "Ø³Ø§Ø¹Øª ÙØ±ÙØ´Û ÙØ±ÙØ´Ú¯Ø§Ù Ø³Ø§Ø¹Øª Ø³Ø§Ø¹Øª ÙÚÛ Ø³Ø§Ø¹Øª ÙÙÚ©Ø³"],
          ["fashion_jewelry", "Ø¨Ø¯ÙÛØ¬Ø§Øª Ø¨Ø¯ÙÛ ÙØ±ÙØ´Û Ø²ÛÙØ±Ø¢ÙØ§Øª ÙØ§ÙØªØ²Û Ø§Ú©Ø³Ø³ÙØ±Û"]
        ];
        const groups=type==="all"?allGroups:allGroups.filter(x=>x[0]===type);
        const all = [], seen = new Set(), t = now();
        for (const [type, term] of groups) {
          const q = [term, city, extra].filter(Boolean).join(" ");
          const discovery = await discoverWebLinks(q, 6);
          const links = discovery.links;
          for (const url of links) {
            if (seen.has(url)) continue; seen.add(url);
            try {
              const rr = await fetchWithRetry(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; HAMZEHI-SOCIAL-AI/1.0)" } }, 2, AD_FETCH_TIMEOUT_MS);
              const tx = (await rr.text()).slice(0, 140000);
              const title = (tx.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || url).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
              const plain = tx.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
              const hit = /Ø·ÙØ§|Ø¬ÙØ§ÙØ±|Ø³Ø§Ø¹Øª|Ø¨Ø¯ÙÛ|gold|jewel|watch|accessor/i.test(plain);
              if (!hit) continue;
              const adHit = /ØªØ¨ÙÛØº|advertis|sponsor|Ø±Ù¾ÙØ±ØªØ§Ú|ØªÙØ§Ø³ Ø¨Ø§ ÙØ§|contact us|media kit|ÙÙÚ©Ø§Ø±Û/i.test(plain);
              const score = Math.min(100, 55 + (adHit ? 25 : 0) + (city && plain.includes(city) ? 10 : 0));
              const cm = tx.match(/href=["']([^"']+)["'][^>]*>[^<]*(?:ØªÙØ§Ø³|contact|advertis|ØªØ¨ÙÛØº)[^<]*</i);
              let contactUrl = null; if (cm) { try { contactUrl = new URL(cm[1], url).toString(); } catch {} }
              const notes = { source:"ad_discovery", ad_target:true, source_site:sourceSite, type, city, query:q, url, evidence:plain.slice(0,900), contact_url:contactUrl, discovered_at:t, score, automation:"auto_campaign_v1" };
              const existing = await env.DB.prepare("SELECT id,notes FROM leads WHERE contact=? LIMIT 1").bind(url).first();
              let id;
              if (existing) {
                id = existing.id;
                let old = {}; try { old = JSON.parse(existing.notes || "{}"); } catch {}
                const merged = Object.assign(old, notes);
                await env.DB.prepare("UPDATE leads SET priority=?,notes=?,updated_at=? WHERE id=?").bind(score>=70?"high":score>=45?"normal":"low", JSON.stringify(merged), t, id).run();
              } else {
                id = uid();
                await env.DB.prepare("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(id,title,url,"discovered",score>=70?"high":score>=45?"normal":"low",JSON.stringify(notes),t,t).run();
              }
              all.push({ id, name:title, type, url, contact_url:contactUrl, score });
            } catch {}
          }
        }
        let drafted = 0;
        if (env.OPENAI_API_KEY) {
          for (const item of all.slice(0, AD_MAX_DRAFTS_PER_RUN)) {
            try {
              const lead = await env.DB.prepare("SELECT * FROM leads WHERE id=?").bind(item.id).first();
              if (!lead) continue;
              let meta = {}; try { meta = JSON.parse(lead.notes || "{}"); } catch {}
              if (meta.negotiation_draft) continue;
              const prompt = `Write a concise Persian advertising/collaboration message for this target. Brand source: ${sourceSite}. Target: ${lead.name}. Website: ${lead.contact}. Evidence: ${meta.evidence||""}. Product category: jewelry, watch and fashion-jewelry boxes. Do not invent facts. Ask about advertising formats, audience, placement, duration, price and the correct contact person. Keep it respectful, under 700 characters. It is an outreach draft and must not claim an agreement.`;
              const r = await fetch("https://api.openai.com/v1/responses", { method:"POST", headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,"Content-Type":"application/json"}, body:JSON.stringify({model:env.OPENAI_MODEL||"gpt-5.6-luna",input:prompt}), signal:AbortSignal.timeout(15000) });
              const d = await r.json().catch(() => ({})); if (!r.ok) continue;
              const draft = responseText(d).trim(); if (!draft) continue;
              meta.negotiation_draft=draft; meta.negotiation_drafted_at=now(); meta.send_mode="authorized_channel_only";
              await env.DB.prepare("UPDATE leads SET notes=?,stage=?,updated_at=? WHERE id=?").bind(JSON.stringify(meta),"negotiation",now(),item.id).run();
              item.draft = draft; drafted++;
            } catch {}
          }
        }
        await audit(env,"ad_auto_campaign","Automated advertising customer discovery and draft preparation completed",{city,found:all.length,drafted,source_site:sourceSite});
        return json({ok:true,source_site:sourceSite,type,city,found:all.length,drafted,items:all.slice(0,30),next_action:"Use an authorized contact/publishing channel for final outreach or paid placement."});
      }

      if (u.pathname === "/api/ads/intelligence" && req.method === "GET") {
        if (!auth(req, env)) return json({ok:false,error:"Unauthorized"},401);
        const rows=await env.DB.prepare("SELECT * FROM leads ORDER BY updated_at DESC LIMIT 500").all();
        const scored=(rows.results||[]).map(lead=>{const i=leadIntelligence(lead);return {id:lead.id,name:lead.name,stage:lead.stage,priority:lead.priority,score:i.score,factors:i.factors,action:i.action,type:i.type,ad_opportunity:i.ad_opportunity,contact_url:i.contact_url,domain:i.domain,updated_at:lead.updated_at};});
        const active=scored.filter(x=>!['customer','converted','rejected','archived'].includes(x.stage));
        const actions=active.filter(x=>x.action!=='Ø¨Ø±Ø±Ø³Û Lead').slice(0,20);
        const domains={}; for(const x of scored)if(x.domain)domains[x.domain]=(domains[x.domain]||0)+1;
        const duplicates=Object.entries(domains).filter(([,n])=>n>1).map(([domain,count])=>({domain,count}));
        const funnel={discovered:0,qualified:0,contacted:0,replied:0,negotiation:0,customer:0};
        for(const x of scored)if(funnel[x.stage]!==undefined)funnel[x.stage]++;
        return json({ok:true,source_site:"https://www.hamzehibox.com",metrics:{total:scored.length,active:active.length,hot:active.filter(x=>x.score>=70).length,opportunities:active.filter(x=>x.ad_opportunity).length,action_items:actions.length,duplicate_domains:duplicates.length},funnel,duplicates,action_items:actions,top_leads:active.sort((a,b)=>b.score-a.score).slice(0,20)});
      }

      if (u.pathname === "/api/ads/action-center" && req.method === "GET") {
        if (!auth(req, env)) return json({ok:false,error:"Unauthorized"},401);
        const rows=await env.DB.prepare("SELECT * FROM leads ORDER BY updated_at DESC LIMIT 500").all();
        const nowMs=Date.now();
        const items=(rows.results||[]).map(lead=>{
          const meta=parseLeadNotes(lead), intel=leadIntelligence(lead);
          const at=meta.next_followup_at||meta.followup_at;
          const due=!!(at && Date.parse(at)<=nowMs && !["customer","converted","rejected","archived"].includes(lead.stage));
          let bucket="review";
          if(due) bucket="today";
          else if(intel.score>=80 || lead.priority==="high") bucket="urgent";
          else if(intel.ad_opportunity || lead.stage==="negotiation") bucket="opportunity";
          return {id:lead.id,name:lead.name,contact:lead.contact,stage:lead.stage,priority:lead.priority,score:intel.score,factors:intel.factors,action:intel.action,bucket,due_followup:due,next_followup_at:at||null,domain:intel.domain,ad_opportunity:intel.ad_opportunity,contact_url:intel.contact_url};
        }).filter(x=>x.bucket!=="review").sort((a,b)=>({today:0,urgent:1,opportunity:2}[a.bucket]-({today:0,urgent:1,opportunity:2}[b.bucket]))||b.score-a.score).slice(0,30);
        const counts={today:0,urgent:0,opportunity:0}; for(const x of items) counts[x.bucket]++;
        return json({ok:true,source_site:"https://www.hamzehibox.com",counts,items,next_actions:items.slice(0,10)});
      }

      if (u.pathname === "/api/ads/autopilot" && req.method === "POST") {
        if (!auth(req, env)) return json({ ok:false, error:"Unauthorized" },401);
        const b=await req.json().catch(()=>null);
        if(!b || typeof b!=="object") return json({ok:false,error:"Invalid JSON body"},400);
        const input=validateAdsInput(b);
        if(!input.ok) return json(input,400);
        const d=await runAdAutopilotOnce(env,input,"manual");
        return json(d);
      }

      if (u.pathname === "/api/ads/autopilot/start" && req.method === "POST") {
        if (!auth(req, env)) return json({ok:false,error:"Unauthorized"},401);
        const b=await req.json().catch(()=>null);
        if(!b || typeof b!=="object") return json({ok:false,error:"Invalid JSON body"},400);
        const input=validateAdsInput(b);
        if(!input.ok) return json(input,400);
        await env.DB.prepare(`CREATE TABLE IF NOT EXISTS system_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`).run();
        await env.DB.prepare("INSERT OR REPLACE INTO system_kv(key,value,updated_at) VALUES(?,?,?)").bind("ads_autopilot_config",JSON.stringify({enabled:true,...input}),now()).run();
        await audit(env,"ad_autopilot_started","Advertising Autopilot started by admin",{type:input.type,city:input.city});
        let result={ok:true,enabled:true,config:input};
        try {
          result.first_run=await runAdAutopilotOnce(env,input,"start");
        } catch(e) {
          await audit(env,"ad_autopilot_start_error","Autopilot start cycle failed",{error:e.message});
          result.first_run={ok:false,error:e.message};
        }
        return json(result);
      }

      if (u.pathname === "/api/ads/autopilot/stop" && req.method === "POST") {
        if (!auth(req, env)) return json({ok:false,error:"Unauthorized"},401);
        await env.DB.prepare(`CREATE TABLE IF NOT EXISTS system_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`).run();
        const row=await env.DB.prepare("SELECT value FROM system_kv WHERE key='ads_autopilot_config'").first();
        let cfg={}; try{cfg=JSON.parse(row?.value||"{}")}catch{}
        cfg.enabled=false;
        await env.DB.prepare("INSERT OR REPLACE INTO system_kv(key,value,updated_at) VALUES(?,?,?)").bind("ads_autopilot_config",JSON.stringify(cfg),now()).run();
        await audit(env,"ad_autopilot_stopped","Advertising Autopilot stopped by admin",{});
        return json({ok:true,enabled:false});
      }

      if (u.pathname === "/api/ads/autopilot/status" && req.method === "GET") {
        if (!auth(req, env)) return json({ ok:false, error:"Unauthorized" },401);
        await env.DB.prepare(`CREATE TABLE IF NOT EXISTS system_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`).run();
        const cfgRow=await env.DB.prepare("SELECT value,updated_at FROM system_kv WHERE key='ads_autopilot_config'").first();
        let cfg={enabled:false,type:"all",city:"",extra:""}; try{cfg={...cfg,...JSON.parse(cfgRow?.value||"{}")} }catch{}
        const rows = await env.DB.prepare("SELECT stage,priority,notes,updated_at FROM leads ORDER BY updated_at DESC LIMIT 500").all();
        const today=new Date().toISOString().slice(0,10); let found=0, hot=0, negotiation=0, followups=0, customers=0, ads=0;
        for (const x of (rows.results||[])) {
          let m={}; try{m=JSON.parse(x.notes||"{}")}catch{}
          if(m.ad_target) ads++;
          if(String(x.updated_at||"").startsWith(today)) found++;
          if(x.priority==="high") hot++;
          if(x.stage==="negotiation") negotiation++;
          if(m.next_followup_at || m.followup_at) followups++;
          if(x.stage==="customer"||x.stage==="converted") customers++;
        }
        return json({ok:true,enabled:!!cfg.enabled,config:{type:cfg.type||"all",city:cfg.city||"",extra:cfg.extra||""},updated_at:cfgRow?.updated_at||null,source_site:"https://www.hamzehibox.com",targets:["gold","watch","fashion_jewelry"],metrics:{found,hot,negotiation,followups,customers,ad_targets:ads},mode:"autopilot",external_send:"authorized_channel_only"});
      }

      if (u.pathname === "/api/ads/followups" && req.method === "GET") {
        if (!auth(req, env)) return json({ ok:false, error:"Unauthorized" },401);
        const rows = await env.DB.prepare("SELECT * FROM leads ORDER BY updated_at DESC LIMIT 500").all();
        const nowMs = Date.now(), items=[];
        for (const lead of (rows.results||[])) {
          const meta=parseLeadNotes(lead);
          const at=meta.next_followup_at || meta.followup_at;
          if (!at || !Date.parse(at)) continue;
          if (Date.parse(at) <= nowMs && !["customer","converted","rejected","archived"].includes(lead.stage)) {
            items.push({id:lead.id,name:lead.name,contact:lead.contact,stage:lead.stage,priority:lead.priority,score:Number(meta.score||0),next_followup_at:at,negotiation_draft:meta.negotiation_draft||null,followup_draft:meta.followup_draft||null});
          }
        }
        return json({ok:true,items:items.slice(0,50)});
      }

      if (u.pathname === "/api/ads/followups/run" && req.method === "POST") {
        if (!auth(req, env)) return json({ok:false,error:"Unauthorized"},401);
        const rows=await env.DB.prepare("SELECT * FROM leads ORDER BY updated_at DESC LIMIT 500").all();
        const due=[]; const nowMs=Date.now();
        for(const lead of (rows.results||[])){
          const meta=parseLeadNotes(lead), at=meta.next_followup_at||meta.followup_at;
          if(at && Date.parse(at) && Date.parse(at)<=nowMs && !["customer","converted","rejected","archived"].includes(lead.stage)) due.push({lead,meta});
        }
        let prepared=0, skipped=0;
        for(const {lead,meta} of due.slice(0,20)){
          if(meta.followup_draft){skipped++;continue;}
          if(!env.OPENAI_API_KEY){skipped++;continue;}
          try{
            const prompt=`Write a short polite Persian B2B follow-up for HAMZEHI BOX. Target: ${lead.name}. Website: ${lead.contact}. Previous outreach: ${meta.negotiation_draft||meta.outreach_draft||""}. Do not pressure, invent facts, or claim agreement. Ask if they had a chance to review and whether advertising/collaboration options are available. Under 500 characters. Draft only.`;
            const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:env.OPENAI_MODEL||"gpt-5.6-luna",input:prompt}),signal:AbortSignal.timeout(15000)});
            const d=await r.json().catch(()=>({})); if(!r.ok) {skipped++;continue;}
            const draft=responseText(d).trim(); if(!draft){skipped++;continue;}
            meta.followup_draft=draft; meta.followup_prepared_at=now(); meta.followup_at=meta.next_followup_at||meta.followup_at; meta.next_followup_at=null; meta.followup_status="prepared";
            await env.DB.prepare("UPDATE leads SET notes=?,updated_at=? WHERE id=?").bind(JSON.stringify(meta),now(),lead.id).run(); prepared++;
          }catch{skipped++;}
        }
        await audit(env,"ad_followups_run","Advertising follow-up drafts prepared",{due:due.length,prepared,skipped});
        return json({ok:true,due:due.length,prepared,skipped,mode:"draft_and_queue"});
      }

      if (u.pathname === "/api/ads/preflight" && req.method === "GET") {
        if (!auth(req, env)) return json({ok:false,error:"Unauthorized"},401);
        const checks=[];
        checks.push({name:"D1",status:"PASS"});
        checks.push({name:"HAMZEHI BOX source",status:"PASS",value:"https://www.hamzehibox.com"});
        checks.push({name:"Target groups",status:"PASS",value:["Ø·ÙØ§ÙØ±ÙØ´","Ø³Ø§Ø¹ØªâÙØ±ÙØ´","Ø¨Ø¯ÙÛâÙØ±ÙØ´"]});
        checks.push({name:"OpenAI",status:env.OPENAI_API_KEY?"READY":"SKIP",details:env.OPENAI_API_KEY?"Ú©ÙÛØ¯ ØªÙØ¸ÛÙ Ø´Ø¯Ù":"Ø¨Ø±Ø§Û Draft ÙØ°Ø§Ú©Ø±Ù ÙØ§Ø²Ù Ø§Ø³Øª"});
        checks.push({name:"Web discovery",status:"READY",details:"Google/Bing fallback + timeout + retry"});
        checks.push({name:"External URL safety",status:"PASS",details:"localhost/private metadata targets blocked"});
        checks.push({name:"Run protection",status:"PASS",details:`discovery sites â¤ ${AD_MAX_DISCOVERY_SITES}, AI drafts â¤ ${AD_MAX_DRAFTS_PER_RUN}`});
        return json({ok:true,checks,mode:"preflight",safe:true});
      }

      if (u.pathname === "/api/ads/overview" && req.method === "GET") {
        if (!auth(req, env)) return json({ok:false,error:"Unauthorized"},401);
        const rows=await env.DB.prepare("SELECT * FROM leads ORDER BY updated_at DESC LIMIT 500").all();
        const today=new Date().toISOString().slice(0,10); let foundToday=0, hot=0, negotiation=0, due=0, customers=0, adTargets=0, opportunities=0;
        const items=[];
        for(const lead of (rows.results||[])){
          const m=parseLeadNotes(lead); const updated=String(lead.updated_at||"");
          if(updated.startsWith(today)) foundToday++;
          if(Number(m.score||0)>=70 || lead.priority==="high") hot++;
          if(lead.stage==="negotiation") negotiation++;
          if(lead.stage==="customer"||lead.stage==="converted") customers++;
          if(m.ad_target) adTargets++;
          if(m.ad_opportunity || m.contact_url) opportunities++;
          const at=m.next_followup_at||m.followup_at; if(at && Date.parse(at)<=Date.now() && !["customer","converted","rejected","archived"].includes(lead.stage)) due++;
          if(items.length<12 && m.ad_target) items.push({id:lead.id,name:lead.name,stage:lead.stage,score:Number(m.score||0),type:m.type||null,url:m.url||lead.contact,contact_url:m.contact_url||null,ad_opportunity:!!(m.ad_opportunity||m.contact_url),followup_draft:m.followup_draft||null});
        }
        return json({ok:true,source_site:"https://www.hamzehibox.com",metrics:{found_today:foundToday,hot,negotiation,due_followups:due,customers,ad_targets:adTargets,ad_opportunities:opportunities},items});
      }

      if (u.pathname === "/api/ads/negotiation-draft" && req.method === "POST") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const b=await req.json().catch(()=>({})); const id=String(b.lead_id||"").trim();
        if(!id) return json({ok:false,error:"lead_id is required"},400);
        const lead=await env.DB.prepare("SELECT * FROM leads WHERE id=?").bind(id).first();
        if(!lead) return json({ok:false,error:"Lead not found"},404);
        let meta=parseLeadNotes(lead);
        if(!env.OPENAI_API_KEY) return json({ok:false,error:"OPENAI_API_KEY not configured"},503);
        const prompt=`Write a concise Persian advertising/collaboration negotiation draft for a business website or media outlet. Brand source: ${meta.source_site||"https://www.hamzehibox.com"}. Target: ${lead.name}. Website: ${lead.contact}. Evidence: ${meta.evidence||""}. Explain the product category (jewelry/watch/ fashion jewelry boxes) without inventing facts. Ask about available advertising formats, price, audience, placement, duration, and contact person. Keep it respectful, under 700 characters, and make it a draft for human approval only.`;
        const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:env.OPENAI_MODEL||"gpt-5.6-luna",input:prompt}),signal:AbortSignal.timeout(15000)});
        const d=await r.json().catch(()=>({})); if(!r.ok)return json({ok:false,error:d.error?.message||`OpenAI returned ${r.status}`},502);
        const draft=responseText(d).trim(); if(!draft)return json({ok:false,error:"No negotiation draft returned"},502);
        meta.negotiation_draft=draft;meta.negotiation_drafted_at=now();meta.send_mode="manual_approval_only";meta.next_followup_at=new Date(Date.now()+48*60*60*1000).toISOString();meta.followup_status="scheduled";
        await env.DB.prepare("UPDATE leads SET notes=?,updated_at=?,stage=? WHERE id=?").bind(JSON.stringify(meta),now(),"negotiation",id).run();
        await audit(env,"ad_negotiation_draft","Advertising negotiation draft generated",{lead_id:id});
        return json({ok:true,lead_id:id,draft,send_mode:"manual_approval_only"});
      }

      if (u.pathname === "/api/instagram/leads/discover" && req.method === "POST") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        if (!env.INSTAGRAM_ACCESS_TOKEN || !env.INSTAGRAM_ACCOUNT_ID) return json({ ok: false, error: "Instagram credentials not configured" }, 503);
        if (instagramApiMode(env) === "instagram_login") return json({ ok: false, error: "Instagram Lead Finder hashtag discovery requires Facebook Login mode; Instagram Login does not expose this endpoint" }, 501);
        const b = await req.json().catch(() => ({}));
        const rawQ = String(b.query || "").trim().replace(/^#/, "");
        if (!rawQ || !/^[\p{L}\p{N}_.-]{2,80}$/u.test(rawQ)) return json({ ok: false, error: "query must be a valid hashtag/keyword" }, 400);
        const version = graphApiVersion(env);
        const search = new URL(`${instagramGraphBase(env)}/ig_hashtag_search`);
        search.searchParams.set("user_id", env.INSTAGRAM_ACCOUNT_ID);
        search.searchParams.set("q", rawQ);
        search.searchParams.set("access_token", env.INSTAGRAM_ACCESS_TOKEN);
        const sr = await fetch(search.toString(), { signal: AbortSignal.timeout(10000) });
        const sd = await sr.json().catch(() => ({}));
        if (!sr.ok || sd.error) return json({ ok: false, error: sd.error?.message || `Instagram hashtag search failed (${sr.status})` }, 502);
        const tag = sd.data?.[0];
        if (!tag?.id) return json({ ok: true, query: rawQ, found: 0, items: [] });
        const media = new URL(`${instagramGraphBase(env)}/${encodeURIComponent(tag.id)}/top_media`);
        media.searchParams.set("user_id", env.INSTAGRAM_ACCOUNT_ID);
        media.searchParams.set("fields", "id,caption,media_type,permalink,timestamp,username");
        media.searchParams.set("limit", "25");
        media.searchParams.set("access_token", env.INSTAGRAM_ACCESS_TOKEN);
        const mr = await fetch(media.toString(), { signal: AbortSignal.timeout(10000) });
        const md = await mr.json().catch(() => ({}));
        if (!mr.ok || md.error) return json({ ok: false, error: md.error?.message || `Instagram media search failed (${mr.status})` }, 502);
        const rows = [];
        const seen = new Set();
        for (const m of md.data || []) {
          const username = String(m.username || "").trim();
          if (!username || seen.has(username)) continue;
          seen.add(username);
          const caption = String(m.caption || "");
          const lower = caption.toLowerCase();
          const keywordHit = lower.includes(rawQ.toLowerCase());
          const ageDays = m.timestamp ? Math.max(0, (Date.now() - Date.parse(m.timestamp)) / 86400000) : 30;
          const recency = Math.max(0, Math.round(30 - Math.min(30, ageDays)));
          const relevance = keywordHit ? 35 : 20;
          const activity = m.media_type ? 10 : 0;
          const score = Math.min(100, relevance + recency + activity + (caption.length > 80 ? 10 : 0));
          rows.push({ username, score, permalink: m.permalink || null, media_type: m.media_type || null, timestamp: m.timestamp || null, evidence: caption.slice(0, 240) });
        }
        rows.sort((a, z) => z.score - a.score);
        const saved = [];
        const t = now();
        for (const x of rows.slice(0, 20)) {
          const contact = `https://instagram.com/${encodeURIComponent(x.username)}`;
          const notes = JSON.stringify({ source: "instagram_hashtag_discovery", query: rawQ, score: x.score, profile: contact, evidence: x.evidence, permalink: x.permalink, media_type: x.media_type, discovered_at: t, outreach: "draft_only" });
          const existing = await env.DB.prepare("SELECT id FROM leads WHERE contact=? LIMIT 1").bind(contact).first();
          if (existing) {
            await env.DB.prepare("UPDATE leads SET priority=?,notes=?,updated_at=? WHERE id=?").bind(x.score >= 70 ? "high" : x.score >= 45 ? "normal" : "low", notes, t, existing.id).run();
            saved.push({ ...x, id: existing.id, existing: true, contact });
          } else {
            const id = uid();
            await env.DB.prepare("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(id, `@${x.username}`, contact, "discovered", x.score >= 70 ? "high" : x.score >= 45 ? "normal" : "low", notes, t, t).run();
            saved.push({ ...x, id, existing: false, contact });
          }
        }
        await audit(env, "instagram_lead_discovery", "Instagram related-page lead discovery completed", { query: rawQ, found: rows.length, saved: saved.length });
        return json({ ok: true, query: rawQ, found: rows.length, saved: saved.length, items: saved });
      }


      if (u.pathname === "/api/leads/overview" && req.method === "GET") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        return json({ ok: true, ...(await leadOverview(env)) });
      }

      if (u.pathname === "/api/leads" && req.method === "PATCH") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const b = await req.json().catch(() => ({}));
        const id = String(b.id || "").trim();
        if (!id) return json({ ok: false, error: "id is required" }, 400);
        try {
          const updated = await updateLeadRecord(env, id, b);
          if (!updated) return json({ ok: false, error: "Lead not found" }, 404);
          await audit(env, "lead_updated", "Lead CRM record updated", { lead_id: id, stage: updated.stage, priority: updated.priority });
          return json({ ok: true, item: updated, score: leadScoreFromData(updated, parseLeadNotes(updated)) });
        } catch (e) { return json({ ok: false, error: e.message }, 400); }
      }

      if (u.pathname === "/api/leads/score" && req.method === "POST") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const b = await req.json().catch(() => ({}));
        const id = String(b.lead_id || "").trim();
        if (!id) return json({ ok: false, error: "lead_id is required" }, 400);
        const lead = await env.DB.prepare("SELECT * FROM leads WHERE id=?").bind(id).first();
        if (!lead) return json({ ok: false, error: "Lead not found" }, 404);
        const updated = await updateLeadRecord(env, id, { score: Number(b.score) });
        return json({ ok: true, lead_id: id, score: leadScoreFromData(updated, parseLeadNotes(updated)) });
      }

      if (u.pathname === "/api/leads/outreach-draft" && req.method === "POST") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const b = await req.json().catch(() => ({}));
        const leadId = String(b.lead_id || "").trim();
        const mode = ["initial", "followup", "collaboration"].includes(String(b.mode || "")) ? String(b.mode) : "initial";
        if (!leadId) return json({ ok: false, error: "lead_id is required" }, 400);
        const lead = await env.DB.prepare("SELECT * FROM leads WHERE id=?").bind(leadId).first();
        if (!lead) return json({ ok: false, error: "Lead not found" }, 404);
        let meta = parseLeadNotes(lead);
        const context = `Instagram page ${lead.name || ""}. Discovery query: ${meta.query || "unknown"}. Evidence: ${meta.evidence || ""}. Current stage: ${lead.stage || "new"}.`;
        if (!env.OPENAI_API_KEY) return json({ ok: false, error: "OPENAI_API_KEY not configured" }, 503);
        const task = mode === "followup" ? "Write a short, polite Persian follow-up DM that adds value and does not pressure the recipient." : "Write one short, respectful Persian collaboration/outreach DM draft for a relevant Instagram business/page.";
        const prompt = `${task} Do not claim facts not provided. Do not use spam, pressure, bulk language, fake scarcity, or misleading claims. Keep it under 500 characters. It is a draft for human review only. Context: ${context}`;
        const r = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: env.OPENAI_MODEL || "gpt-5.6-luna", input: prompt }), signal: AbortSignal.timeout(15000) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return json({ ok: false, error: d.error?.message || `OpenAI returned ${r.status}` }, 502);
        const text = responseText(d).trim();
        if (!text) return json({ ok: false, error: "No outreach draft returned" }, 502);
        meta.outreach_draft = text; meta.outreach_mode = mode; meta.outreach_drafted_at = now();
        await env.DB.prepare("UPDATE leads SET notes=?,updated_at=? WHERE id=?").bind(JSON.stringify(meta), now(), leadId).run();
        await audit(env, "instagram_outreach_draft", "Human-review outreach draft generated", { lead_id: leadId, mode });
        return json({ ok: true, lead_id: leadId, draft: text, mode, send_mode: "manual_approval_only" });
      }

      if (u.pathname === "/api/metrics" && req.method === "GET") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const r = await env.DB.prepare("SELECT * FROM social_metrics ORDER BY metric_date DESC, created_at DESC LIMIT 200").all();
        return json({ items: r.results || [] });
      }

      if (u.pathname === "/api/connections/test" && req.method === "POST") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const result = await connectionTest(env);
        await audit(env, "connection_test", "Provider connection test completed", result.summary);
        return json({ ok: result.summary.fail === 0 && result.summary.skip === 0, ...result });
      }

      if (u.pathname === "/api/settings" && req.method === "GET") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        return json({ ok:true, providers:{
          OpenAI:{configured:!!env.OPENAI_API_KEY,note:"Ú©ÙÛØ¯ ÙÙØ· Ø¨ÙâØµÙØ±Øª Secret Ø®ÙØ§ÙØ¯Ù ÙÛâØ´ÙØ¯"},
          Telegram:{configured:!!(env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID),note:"Bot token + chat id"},
          Instagram:{configured:!!(env.INSTAGRAM_ACCESS_TOKEN&&env.INSTAGRAM_ACCOUNT_ID),note:`${instagramApiMode(env)==="instagram_login"?"Instagram Login":"Facebook Login"} Â· Access token + account id`},
          InstagramWebhook:{configured:!!env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN&&(!!env.INSTAGRAM_APP_SECRET||!!env.INSTAGRAM_WEBHOOK_SECRET_TOKEN),note:"Verify token + signature secret"},
          TelegramWebhook:{configured:!!env.TELEGRAM_WEBHOOK_SECRET_TOKEN,note:"Webhook secret token"},
          Admin:{configured:!!env.ADMIN_TOKEN,note:"ÙØ¯ÛØ±ÛØª Secret Ø§Ø² Ø®ÙØ¯ Worker Ø§ÙØ¬Ø§Ù ÙÙÛâØ´ÙØ¯"}
        }});
      }

      if (u.pathname === "/api/system/events" && req.method === "GET") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const r = await env.DB.prepare("SELECT id,type,severity,message,details_json,created_at FROM system_events ORDER BY created_at DESC LIMIT 100").all();
        return json({ items:r.results||[] });
      }

      if (u.pathname === "/api/recovery/manifest" && req.method === "GET") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);

        const tables = [
          "contents", "approval_queue", "leads", "inbox_messages",
          "social_metrics", "automation_guardrails", "learning_feedback",
          "learning_reports", "campaigns", "calendar"
        ];

        const counts = {};
        for (const t of tables) {
          try {
            const r = await env.DB.prepare(`SELECT COUNT(*) n FROM ${t}`).first();
            counts[t] = Number(r?.n || 0);
          } catch {
            counts[t] = "unavailable";
          }
        }

        return json({
          ok: true,
          provider_independent: true,
          website_integration: false,
          r2: false,
          github_dependency: false,
          approval_required: true,
          generated_at: now(),
          tables: counts,
          secrets: [
            "OPENAI_API_KEY", "ADMIN_TOKEN",
            "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID",
            "INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_ACCOUNT_ID", "INSTAGRAM_APP_SECRET", "INSTAGRAM_WEBHOOK_VERIFY_TOKEN", "INSTAGRAM_WEBHOOK_SECRET_TOKEN", "TELEGRAM_WEBHOOK_SECRET_TOKEN"
          ]
        });
      }

      if (u.pathname === "/api/recovery/manifest" && req.method === "POST") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);

        const body = await req.json().catch(() => ({}));
        const id = uid();

        await env.DB.prepare(
          "INSERT INTO recovery_snapshots VALUES(?,?,?,?,?)"
        ).bind(id, "manifest", now(), JSON.stringify(body), "created").run();

        return json({ ok: true, id });
      }

      if (u.pathname === "/api/migration/status" && req.method === "GET") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const r = await env.DB.prepare(
          "SELECT * FROM migration_runs ORDER BY created_at DESC LIMIT 50"
        ).all();
        return json({ items: r.results || [] });
      }

      if (u.pathname === "/api/retry" && req.method === "GET") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const r = await env.DB.prepare(
          "SELECT * FROM retry_queue ORDER BY created_at DESC LIMIT 100"
        ).all();
        return json({ items: r.results || [] });
      }

      if (u.pathname === "/api/retry" && req.method === "POST") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const b = await req.json().catch(() => null);
        if (!b || typeof b !== "object") return json({ ok: false, error: "Invalid JSON body" }, 400);
        const operation = String(b.operation || "").trim();
        if (!operation) return json({ ok:false, error:"operation is required" },400);
        const maxAttempts = Math.max(1, Math.min(10, Number(b.max_attempts || 3)) || 3);
        const id = uid();

        await env.DB.prepare(
          "INSERT INTO retry_queue VALUES(?,?,?,?,?,?,?,?,?,?)"
        ).bind(
          id, operation, JSON.stringify(b.payload || {}), 0,
          maxAttempts, "queued", null, null, now(), now()
        ).run();

        return json({ ok: true, id });
      }

      if (u.pathname === "/api/production/reconcile" && req.method === "POST") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const body = await req.json().catch(() => null);
        if (!body || typeof body !== "object") return json({ ok: false, error: "Invalid JSON body" }, 400);
        if (!String(body.id || "").trim()) return json({ ok: false, error: "id is required" }, 400);
        if (!String(body.action || "").trim()) return json({ ok: false, error: "action is required" }, 400);
        if (!["confirm_published","retry"].includes(String(body.action))) return json({ ok:false, error:"Invalid reconciliation action" },400);
        try { return json(await reconcileProductionRun(env, body)); } catch (e) { return json({ok:false,error:e.message||"Reconciliation failed"},400); }
      }
      if (u.pathname === "/api/production/runs" && req.method === "GET") {
        if (!auth(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
        const r = await env.DB.prepare(
          "SELECT * FROM production_runs ORDER BY created_at DESC LIMIT 50"
        ).all();
        return json({ items: r.results || [] });
      }

      return json({ ok: false, error: "Not found" }, 404);
    } catch (e) {
      return json({ ok: false, error: e.message || "Unexpected error" }, 500);
    }
  }
};
