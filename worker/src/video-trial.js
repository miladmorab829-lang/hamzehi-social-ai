// VIDEO TRIAL — owner-approved image-to-video clips through fal.ai (Wan 2.6 Image-to-Video Flash).
// A bounded trial, not a recurring job: there is no scheduler task and no weekly provider. Every paid clip needs a fresh owner
// preview and a typed confirmation; the cron step only polls clips that the owner already started and never submits anything.
//
// Money safety, in order:
//   1. Preview (owner, admin auth): the source must be an approved original vault photo; returns a single-use token and a phrase.
//   2. Execute (owner, admin auth): the token and phrase are checked; ONE conditional UPDATE then claims the clip only while the
//      trial budget, the three-clip total cap and "one clip per source photo" still hold. A partial unique index enforces the last one too.
//   3. One request to fal.ai. A definite refusal before acceptance costs nothing (budget released). Anything unclear is
//      "ambiguous": it keeps its budget and is never sent again automatically.
// FAL_KEY is read only here and goes only to the fal API host; it is never stored, logged or returned.

export const VIDEO_TRIAL = Object.freeze({
  model: "wan/v2.6/image-to-video/flash",
  resolution: "720p",
  duration: "5",
  max_clips: 3,              // owner rule: at most three trial clips in total, one per distinct approved photo
  clip_cents: 25,            // owner's expected base cost per clip (USD cents); fal publishes no fixed per-clip price
  budget_cents: 200,         // owner's trial ceiling: $2
  token_ttl_ms: 10 * 60 * 1000,
  poll_max_ms: 24 * 3600 * 1000,
  max_source_bytes: 8 * 1024 * 1024,
  max_video_bytes: 45 * 1024 * 1024,   // under Telegram's 50 MB bot upload limit and well inside Worker memory
  request_timeout_ms: 30000
});
const ALLOWED_MODELS = new Set([VIDEO_TRIAL.model]);
const FAL_API = "https://queue.fal.run/";
// The jewelry box must stay exactly as photographed: fixed prompt, no prompt rewriting, no multi-shot.
export const VIDEO_TRIAL_PROMPT = "Static studio product video of the exact jewelry box shown in the image. Very slow, subtle camera push-in with soft, even lighting. Keep the box exactly as photographed: same shape, proportions, edges, colors, materials, logo, printing and every detail. The box does not open, move, rotate, bend or change. No new objects, no text, no people, no hands.";
export const VIDEO_TRIAL_NEGATIVE = "deformation, morphing, warping, melting, bending, opening lid, rotating box, changed shape, changed proportions, changed logo, distorted text, color shift, recolor, extra objects, extra boxes, text overlay, watermark, hands, people, flicker, blur, low quality";
export const VIDEO_TRIAL_ACCEPTANCE = Object.freeze([
  "Outline and proportions of the box match the source photo in the first, middle and last frame",
  "Colors and materials are unchanged (no recolor, no new texture)",
  "Logo and printing are intact and readable, not warped",
  "Nothing is added: no extra boxes, objects, text, hands or people",
  "Motion is a slow, steady camera move with no flicker, melting or morphing",
  "The clip fits the intended channel (frame ratio follows the source photo; silent by design)",
  "The trial is at most three clips, one per distinct source photo. Judge all three: all must pass; one failure means the provider is not accepted for product video"
]);
const BILLABLE = "('submitting','submitted','completed','delivering','delivered','delivery_failed','ambiguous','failed')";

const nowIso = (ms = Date.now()) => new Date(ms).toISOString();
const err = (status, error, extra = {}) => Object.assign(Error(error), { httpStatus: status, payload: { ok: false, error, ...extra } });
async function sha256Hex(text) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text))); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
const randomHex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(x => x.toString(16).padStart(2, "0")).join("");
// Persian/Arabic letters and digits are normalised so the owner can type the phrase with either keyboard.
export const normalizeVideoPhrase = s => String(s || "").normalize("NFKC").replace(/[يى]/g, "ی").replace(/ك/g, "ک")
  .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0)).replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/\s+/g, " ").trim();

export function videoTrialModel(env) {
  const m = String(env?.FAL_VIDEO_MODEL || VIDEO_TRIAL.model).trim();
  if (!ALLOWED_MODELS.has(m)) throw err(503, "video_model_not_allowed");
  return m;
}
const falKey = env => String(env?.FAL_KEY || "").trim();
export const videoTrialConfigured = env => !!falKey(env);

export async function ensureVideoTrialStore(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS video_trial_clips (
    id TEXT PRIMARY KEY, source_media_id TEXT NOT NULL, token_hash TEXT UNIQUE, phrase TEXT, expires_at TEXT,
    status TEXT NOT NULL CHECK(status IN ('previewed','submitting','submitted','completed','delivering','delivered','delivery_failed','rejected','ambiguous','failed','expired','cancelled')),
    billable INTEGER NOT NULL DEFAULT 0, cost_cents INTEGER NOT NULL, model TEXT NOT NULL, resolution TEXT NOT NULL, duration TEXT NOT NULL, seed INTEGER NOT NULL,
    request_id TEXT, status_url TEXT, response_url TEXT, video_url TEXT, error_category TEXT, vault_message_id TEXT, vault_chat_id TEXT, created_by TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, claimed_at TEXT, submitted_at TEXT, finished_at TEXT)`).run();
  // one billable clip per source photo, enforced by the database as well as by the claim
  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_video_trial_one_per_source ON video_trial_clips(source_media_id) WHERE status IN ${BILLABLE}`).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_video_trial_status ON video_trial_clips(status)").run();
}

// The same rule Photo Autopilot uses for its originals: a vault photo, not hidden by Cleanup, with no parent (not an AI output),
// and never recorded as a Photo Autopilot output.
export async function approvedVideoSources(env, { hiddenSql = "", id = null, limit = 60 } = {}) {
  const r = await env.DB.prepare(`SELECT m.id,m.caption,m.created_at FROM telegram_media_sources m LEFT JOIN media_vault_items v ON v.telegram_media_id=m.id
    WHERE m.source_kind='vault' AND m.media_type='photo'${hiddenSql}
      AND (v.parent_media_id IS NULL OR v.parent_media_id='')
      AND NOT EXISTS(SELECT 1 FROM photo_autopilot_usage u WHERE u.output_media_id=m.id)
      ${id ? "AND m.id=?" : ""} ORDER BY m.created_at DESC LIMIT ?`).bind(...(id ? [id, limit] : [limit])).all();
  return r.results || [];
}

async function budgetState(env, ms) {
  const r = await env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN billable=1 THEN cost_cents END),0) spent,
    COALESCE(SUM(CASE WHEN billable=1 THEN 1 ELSE 0 END),0) clips FROM video_trial_clips`).first();
  const spent = Number(r?.spent || 0), clips = Number(r?.clips || 0);
  return { spent_cents: spent, left_cents: VIDEO_TRIAL.budget_cents - spent, clips_used: clips, clips_left: VIDEO_TRIAL.max_clips - clips };
}

export async function videoTrialPreview(env, { source_media_id, actor = "admin", hiddenSql = "", nowMs = Date.now() } = {}) {
  if (!videoTrialConfigured(env)) throw err(503, "video_provider_not_configured");
  const model = videoTrialModel(env);
  await ensureVideoTrialStore(env);
  const id = String(source_media_id || "").trim();
  if (!id || !(await approvedVideoSources(env, { hiddenSql, id, limit: 1 })).length) throw err(400, "source_not_approved");
  if (await env.DB.prepare(`SELECT 1 FROM video_trial_clips WHERE source_media_id=? AND status IN ${BILLABLE} LIMIT 1`).bind(id).first()) throw err(409, "source_already_used");
  const b = await budgetState(env, nowMs);
  if (b.left_cents < VIDEO_TRIAL.clip_cents) throw err(409, "trial_budget_exhausted", { budget: b });
  if (b.clips_left <= 0) throw err(409, "trial_clip_limit_reached", { budget: b });
  const token = randomHex(24), code = String(parseInt((await sha256Hex(token)).slice(0, 6), 16) % 9000 + 1000);
  const phrase = `ساخت ویدیو ${code}`, clipId = crypto.randomUUID(), t = nowIso(nowMs), expires = nowIso(nowMs + VIDEO_TRIAL.token_ttl_ms);
  await env.DB.prepare(`INSERT INTO video_trial_clips(id,source_media_id,token_hash,phrase,expires_at,status,billable,cost_cents,model,resolution,duration,seed,created_by,created_at,updated_at)
    VALUES(?,?,?,?,?,'previewed',0,?,?,?,?,?,?,?,?)`).bind(clipId, id, await sha256Hex(token), phrase, expires, VIDEO_TRIAL.clip_cents, model,
    VIDEO_TRIAL.resolution, VIDEO_TRIAL.duration, parseInt(clipId.replace(/-/g, "").slice(0, 7), 16), String(actor).slice(0, 60), t, t).run();
  return { ok: true, clip_id: clipId, token, confirm_phrase: phrase, expires_at: expires, source_media_id: id, model, resolution: VIDEO_TRIAL.resolution,
    duration_seconds: Number(VIDEO_TRIAL.duration), cost_usd: VIDEO_TRIAL.clip_cents / 100, budget_left_usd: b.left_cents / 100,
    acceptance: VIDEO_TRIAL_ACCEPTANCE, sends_to: "private_telegram_video_vault_only" };
}

// The source photo, fetched by the Worker itself and sent to fal.ai as a data URI: no public link to the photo ever leaves the system.
async function sourceDataUri(env, mediaId) {
  const row = await env.DB.prepare("SELECT file_id FROM telegram_media_sources WHERE id=?").bind(mediaId).first();
  if (!row?.file_id || !env.TELEGRAM_BOT_TOKEN) throw err(502, "source_unavailable");
  const f = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(row.file_id)}`, { signal: AbortSignal.timeout(15000) });
  const fd = await f.json().catch(() => null), path = fd?.result?.file_path;
  if (!f.ok || !path) throw err(502, "source_unavailable");
  if (Number(fd.result.file_size || 0) > VIDEO_TRIAL.max_source_bytes) throw err(413, "source_too_large");
  const img = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${path}`, { signal: AbortSignal.timeout(20000) });
  if (!img.ok) throw err(502, "source_unavailable");
  const bytes = new Uint8Array(await img.arrayBuffer());
  if (!bytes.length || bytes.length > VIDEO_TRIAL.max_source_bytes) throw err(413, "source_too_large");
  const mime = bytes[0] === 0x89 ? "image/png" : bytes[0] === 0x52 && bytes[8] === 0x57 ? "image/webp" : bytes[0] === 0xFF ? "image/jpeg" : null;
  if (!mime) throw err(415, "source_not_image");
  let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}

// One HTTP call to fal.ai. Returns {outcome:'accepted'|'rejected'|'ambiguous', request_id?, category}. Never throws, never retries.
export async function falSubmit(env, model, input) {
  let r;
  try { r = await fetch(FAL_API + model, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(VIDEO_TRIAL.request_timeout_ms),
    headers: { Authorization: `Key ${falKey(env)}`, "Content-Type": "application/json" }, body: JSON.stringify(input) }); }
  catch (e) { return { outcome: "ambiguous", category: e?.name === "TimeoutError" || e?.name === "AbortError" ? "timeout" : "network_error" }; }
  const s = r.status;
  if (s >= 300 && s < 400) return { outcome: "ambiguous", category: "redirect", http_status: s };
  if ([400, 401, 402, 403, 404, 422].includes(s)) return { outcome: "rejected", category: `http_${s}`, http_status: s };
  if (s === 408 || s === 429 || s >= 500 || s < 200 || s >= 300) return { outcome: "ambiguous", category: `http_${s}`, http_status: s };
  const d = await r.json().catch(() => null), id = String(d?.request_id || "").trim();
  if (!/^[A-Za-z0-9-]{8,80}$/.test(id)) return { outcome: "ambiguous", category: "no_request_id", http_status: s };
  // fal returns the exact status and result URLs of the job; they are used only if they stay on the fal queue host
  return { outcome: "accepted", request_id: id, http_status: s, status_url: falQueueUrlOk(d?.status_url) ? d.status_url : null, response_url: falQueueUrlOk(d?.response_url) ? d.response_url : null };
}

export async function videoTrialExecute(env, { token, confirm, hiddenSql = "", audit = null, nowMs = Date.now() } = {}) {
  if (!videoTrialConfigured(env)) throw err(503, "video_provider_not_configured");
  const model = videoTrialModel(env);
  await ensureVideoTrialStore(env);
  const row = await env.DB.prepare("SELECT * FROM video_trial_clips WHERE token_hash=?").bind(await sha256Hex(String(token || ""))).first();
  if (!row) throw err(404, "unknown_token");
  if (row.status !== "previewed") throw err(409, "token_already_used", { status: row.status });
  if (row.expires_at <= nowIso(nowMs)) throw err(410, "preview_expired");
  if (normalizeVideoPhrase(confirm) !== normalizeVideoPhrase(row.phrase)) throw err(400, "confirmation_mismatch", { confirm_phrase: row.phrase });
  // checked again at execute: a photo hidden or changed since the preview is refused before any claim
  if (!(await approvedVideoSources(env, { hiddenSql, id: row.source_media_id, limit: 1 })).length) {
    await env.DB.prepare("UPDATE video_trial_clips SET status='cancelled',error_category='source_not_approved',updated_at=? WHERE id=? AND status='previewed'").bind(nowIso(nowMs), row.id).run();
    throw err(400, "source_not_approved");
  }
  // THE claim: one statement. Budget, the three-clip total cap, one clip per source and the single-use token are all checked here.
  const t = nowIso(nowMs);
  let claimed;
  try {
    claimed = await env.DB.prepare(`UPDATE video_trial_clips SET status='submitting',billable=1,claimed_at=?,updated_at=?,token_hash=NULL
      WHERE id=? AND status='previewed' AND expires_at>?
        AND (SELECT COALESCE(SUM(cost_cents),0) FROM video_trial_clips WHERE billable=1)+cost_cents<=?
        AND (SELECT COUNT(*) FROM video_trial_clips WHERE billable=1)<?
        AND NOT EXISTS(SELECT 1 FROM video_trial_clips c WHERE c.billable=1 AND c.source_media_id=? AND c.id<>?)`)
      .bind(t, t, row.id, t, VIDEO_TRIAL.budget_cents, VIDEO_TRIAL.max_clips, row.source_media_id, row.id).run();
  } catch { throw err(409, "claim_refused", { reason: "source_already_used" }); }
  if (!Number(claimed?.meta?.changes || 0)) {
    const b = await budgetState(env, nowMs);
    throw err(409, "claim_refused", { reason: b.left_cents < row.cost_cents ? "trial_budget_exhausted" : b.clips_left <= 0 ? "trial_clip_limit_reached" : "already_claimed_or_used", budget: b });
  }
  if (audit) await audit(env, "video_trial_submitting", "Owner-approved trial video clip is being submitted", { clip_id: row.id, source_media_id: row.source_media_id, model, cost_cents: row.cost_cents }).catch(() => {});
  const finish = (status, extra = {}) => env.DB.prepare(`UPDATE video_trial_clips SET status=?,billable=?,error_category=?,request_id=COALESCE(?,request_id),status_url=COALESCE(?,status_url),response_url=COALESCE(?,response_url),submitted_at=COALESCE(?,submitted_at),finished_at=?,updated_at=? WHERE id=? AND status='submitting'`)
    .bind(status, status === "rejected" ? 0 : 1, extra.category || null, extra.request_id || null, extra.status_url || null, extra.response_url || null, extra.submitted_at || null, ["rejected", "ambiguous"].includes(status) ? nowIso() : null, nowIso(), row.id).run();
  let image;
  try { image = await sourceDataUri(env, row.source_media_id); }
  catch (e) { await finish("rejected", { category: e?.payload?.error || "source_unavailable" }); throw err(e?.httpStatus || 502, e?.payload?.error || "source_unavailable", { charged: false }); }
  const res = await falSubmit(env, model, { prompt: VIDEO_TRIAL_PROMPT, negative_prompt: VIDEO_TRIAL_NEGATIVE, image_url: image,
    resolution: row.resolution, duration: row.duration, seed: row.seed, enable_prompt_expansion: false, multi_shots: false, generate_audio: false });
  image = null;
  if (res.outcome === "accepted") {
    let saved = false;
    for (let i = 0; i < 3 && !saved; i++) { try { await finish("submitted", { request_id: res.request_id, status_url: res.status_url, response_url: res.response_url, submitted_at: nowIso() }); saved = true; } catch { /* retry the write only, never the paid call */ } }
    if (!saved) {
      if (audit) await audit(env, "video_trial_request_id_unsaved", "Trial clip was accepted (and may be billed) but its provider id could not be saved; it is never sent again", { clip_id: row.id, request_id: res.request_id }).catch(() => {});
      return { ok: false, clip_id: row.id, status: "submitting", error: "request_id_unsaved", charged: "unknown", retried: false, request_id: res.request_id };
    }
    if (audit) await audit(env, "video_trial_submitted", "Trial video clip accepted by the provider", { clip_id: row.id, model }).catch(() => {});
    return { ok: true, clip_id: row.id, status: "submitted" };
  }
  await finish(res.outcome, { category: res.category });
  if (audit) await audit(env, res.outcome === "rejected" ? "video_trial_rejected" : "video_trial_ambiguous",
    res.outcome === "rejected" ? "Provider refused the trial clip; nothing was charged" : "Trial clip outcome unknown; it is never sent again automatically",
    { clip_id: row.id, category: res.category }).catch(() => {});
  return { ok: false, clip_id: row.id, status: res.outcome, error: res.outcome === "rejected" ? "provider_rejected" : "outcome_unknown",
    category: res.category, charged: res.outcome === "rejected" ? false : "unknown", retried: false };
}

const FAL_MEDIA = h => h === "fal.media" || h.endsWith(".fal.media");
// Request URLs returned by fal: https on queue.fal.run only, default port, no credentials in the URL.
export function falQueueUrlOk(raw) {
  let u; try { u = new URL(String(raw || "")); } catch { return false; }
  return u.protocol === "https:" && !u.username && !u.password && (u.port === "" || u.port === "443") && u.hostname.toLowerCase() === "queue.fal.run" && u.pathname.includes("/requests/");
}
export function videoResultUrlOk(raw) {
  let u; try { u = new URL(String(raw || "")); } catch { return false; }
  return u.protocol === "https:" && !u.username && !u.password && (u.port === "" || u.port === "443") && FAL_MEDIA(u.hostname.toLowerCase());
}
async function falGet(env, url) {
  try { const r = await fetch(url, { headers: { Authorization: `Key ${falKey(env)}` }, redirect: "manual", signal: AbortSignal.timeout(VIDEO_TRIAL.request_timeout_ms) });
    if (!r.ok) return null; return await r.json().catch(() => null); } catch { return null; }
}
// Download from the result CDN without any credential, refusing redirects, wrong types and anything over the size cap.
async function downloadVideo(url) {
  if (!videoResultUrlOk(url)) throw err(502, "result_url_not_allowed");
  const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(60000) });
  if (r.status !== 200) throw err(502, "result_download_failed");
  if (!/^video\/mp4\b/i.test(String(r.headers.get("content-type") || ""))) throw err(502, "result_not_mp4");
  const len = Number(r.headers.get("content-length") || 0);
  if (len > VIDEO_TRIAL.max_video_bytes) throw err(502, "result_too_large");
  const reader = r.body.getReader(), parts = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > VIDEO_TRIAL.max_video_bytes) { try { await reader.cancel(); } catch {} throw err(502, "result_too_large"); } parts.push(value); }
  return new Blob(parts, { type: "video/mp4" });
}

// Cron step: polls clips the owner already started. Never submits. Silent when there is nothing to do.
export async function pollVideoTrial(env, { vaultChatId, audit = null, nowMs = Date.now(), limit = 10 } = {}) {
  let rows;
  try { rows = (await env.DB.prepare("SELECT * FROM video_trial_clips WHERE status IN ('submitted','completed') ORDER BY updated_at LIMIT ?").bind(limit).all()).results || []; }
  catch (e) { if (/no such table/i.test(String(e?.message || e))) return { polled: 0 }; throw e; }
  if (!rows.length || !videoTrialConfigured(env)) return { polled: 0 };
  let model; try { model = videoTrialModel(env); } catch { return { polled: 0 }; }
  const out = { polled: 0, completed: 0, delivered: 0, failed: 0 };
  for (const row of rows) {
    out.polled++;
    if (row.status === "submitted") {
      if (!row.request_id) continue;
      if (nowMs - Date.parse(row.submitted_at || row.updated_at) > VIDEO_TRIAL.poll_max_ms) {
        await env.DB.prepare("UPDATE video_trial_clips SET status='failed',error_category='poll_timeout',finished_at=?,updated_at=? WHERE id=? AND status='submitted'").bind(nowIso(nowMs), nowIso(nowMs), row.id).run(); out.failed++; continue;
      }
      const base = `${FAL_API}${model}/requests/${encodeURIComponent(row.request_id)}`;
      const statusUrl = falQueueUrlOk(row.status_url) ? row.status_url : `${base}/status`, resultUrl = falQueueUrlOk(row.response_url) ? row.response_url : base;
      const st = await falGet(env, statusUrl), s = String(st?.status || "").toUpperCase();
      if (s === "FAILED" || s === "ERROR" || s === "CANCELLED") { await env.DB.prepare("UPDATE video_trial_clips SET status='failed',error_category='provider_failed',finished_at=?,updated_at=? WHERE id=? AND status='submitted'").bind(nowIso(nowMs), nowIso(nowMs), row.id).run(); out.failed++; continue; }
      if (s !== "COMPLETED") continue;
      const result = await falGet(env, resultUrl), url = result?.video?.url;
      if (!url || !videoResultUrlOk(url)) { await env.DB.prepare("UPDATE video_trial_clips SET status='failed',error_category=?,finished_at=?,updated_at=? WHERE id=? AND status='submitted'").bind(url ? "result_url_not_allowed" : "no_video_url", nowIso(nowMs), nowIso(nowMs), row.id).run(); out.failed++; continue; }
      await env.DB.prepare("UPDATE video_trial_clips SET status='completed',video_url=?,updated_at=? WHERE id=? AND status='submitted'").bind(url, nowIso(nowMs), row.id).run();
      row.status = "completed"; row.video_url = url; out.completed++;
    }
    // Delivery: exactly one winner moves completed → delivering; a crash leaves 'delivering' for the owner, never re-sent.
    const chat = String(vaultChatId || "").trim();
    if (!chat) { await env.DB.prepare("UPDATE video_trial_clips SET status='delivery_failed',error_category='vault_not_configured',updated_at=? WHERE id=? AND status='completed'").bind(nowIso(nowMs), row.id).run(); continue; }
    const won = await env.DB.prepare("UPDATE video_trial_clips SET status='delivering',updated_at=? WHERE id=? AND status='completed'").bind(nowIso(nowMs), row.id).run();
    if (!Number(won?.meta?.changes || 0)) continue;
    try {
      const blob = await downloadVideo(row.video_url), fd = new FormData();
      fd.append("chat_id", chat); fd.append("video", blob, `trial-${row.id.slice(0, 8)}.mp4`);
      fd.append("caption", `${VIDEO_TRIAL_CAPTION_PREFIX} · ${row.resolution} · ${row.duration} ثانیه · فقط برای بررسی مالک؛ منتشر نشده است.`);
      const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendVideo`, { method: "POST", body: fd, signal: AbortSignal.timeout(60000) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.ok) throw err(502, "vault_send_failed");
      await env.DB.prepare("UPDATE video_trial_clips SET status='delivered',vault_message_id=?,vault_chat_id=?,video_url=NULL,finished_at=?,updated_at=? WHERE id=? AND status='delivering'").bind(String(d.result?.message_id || ""), String(d.result?.chat?.id ?? chat), nowIso(nowMs), nowIso(nowMs), row.id).run();
      out.delivered++;
      if (audit) await audit(env, "video_trial_delivered", "Trial video clip delivered to the private video vault", { clip_id: row.id }).catch(() => {});
    } catch (e) {
      await env.DB.prepare("UPDATE video_trial_clips SET status='delivery_failed',error_category=?,updated_at=? WHERE id=? AND status='delivering'").bind(String(e?.payload?.error || "delivery_error").slice(0, 60), nowIso(nowMs), row.id).run();
    }
  }
  return out;
}

// A delivered trial clip arrives in the vault chat and the Telegram webhook stores it like any vault video. It is only for the
// owner's review, so it must never be picked for content or pass the marketing-media check. "" when no trial table exists yet.
// Fixed caption prefix of every trial delivery. It also hides a clip whose Telegram reply was lost (no message id recorded).
export const VIDEO_TRIAL_CAPTION_PREFIX = "ویدیوی آزمایشی Wan 2.6 Flash";
export async function videoTrialHiddenSql(env, idExpr) {
  if (!/^[a-z_.]+$/.test(String(idExpr || ""))) return "";
  try { await env.DB.prepare("SELECT 1 FROM video_trial_clips LIMIT 1").first(); } catch { return ""; }
  return ` AND NOT EXISTS(SELECT 1 FROM video_trial_clips vt JOIN telegram_media_sources vm ON vm.id=${idExpr} WHERE vt.vault_message_id IS NOT NULL AND vt.vault_message_id<>'' AND vt.vault_message_id=vm.message_id AND (vt.vault_chat_id IS NULL OR vt.vault_chat_id=vm.chat_id))`
    + ` AND NOT EXISTS(SELECT 1 FROM telegram_media_sources vc WHERE vc.id=${idExpr} AND vc.media_type='video' AND substr(COALESCE(vc.caption,''),1,${VIDEO_TRIAL_CAPTION_PREFIX.length})='${VIDEO_TRIAL_CAPTION_PREFIX}')`;
}
// Never creates the trial table: with no table there is nothing to redeliver.
export async function videoTrialRedeliver(env, { clip_id, nowMs = Date.now() } = {}) {
  let r;
  try { r = await env.DB.prepare("UPDATE video_trial_clips SET status='completed',error_category=NULL,updated_at=? WHERE id=? AND status='delivery_failed' AND video_url IS NOT NULL").bind(nowIso(nowMs), String(clip_id || "")).run(); }
  catch (e) { if (/no such table/i.test(String(e?.message || e))) throw err(409, "not_redeliverable"); throw e; }
  if (!Number(r?.meta?.changes || 0)) throw err(409, "not_redeliverable");
  return { ok: true, clip_id: String(clip_id), status: "completed", charged: false, note: "the next poll sends it to the private video vault" };
}
export async function videoTrialStatus(env, { nowMs = Date.now() } = {}) {
  let items = [];
  try { items = ((await env.DB.prepare("SELECT id,source_media_id,status,billable,cost_cents,model,resolution,duration,request_id,error_category,vault_message_id,created_at,updated_at,submitted_at,finished_at FROM video_trial_clips WHERE status<>'previewed' ORDER BY created_at DESC LIMIT 50").all()).results || [])
      .map(x => ({ ...x, stuck: (x.status === "submitting" && nowMs - Date.parse(x.updated_at) > 10 * 60000) || (x.status === "delivering" && nowMs - Date.parse(x.updated_at) > 30 * 60000), redeliverable: x.status === "delivery_failed" })); }
  catch (e) { if (!/no such table/i.test(String(e?.message || e))) throw e; }
  let budget = { spent_cents: 0, left_cents: VIDEO_TRIAL.budget_cents, clips_used: 0, clips_left: VIDEO_TRIAL.max_clips };
  try { budget = await budgetState(env, nowMs); } catch {}
  return { ok: true, configured: videoTrialConfigured(env), model: VIDEO_TRIAL.model, resolution: VIDEO_TRIAL.resolution, duration_seconds: Number(VIDEO_TRIAL.duration),
    clip_usd: VIDEO_TRIAL.clip_cents / 100, budget_usd: VIDEO_TRIAL.budget_cents / 100, spent_usd: budget.spent_cents / 100, left_usd: budget.left_cents / 100,
    max_clips: VIDEO_TRIAL.max_clips, clips_used: budget.clips_used, clips_left: budget.clips_left, recurring: false, acceptance: VIDEO_TRIAL_ACCEPTANCE, items };
}
