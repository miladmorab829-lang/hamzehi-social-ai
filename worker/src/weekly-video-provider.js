// Weekly video provider seam. The weekly pipeline (photo pool → brief → one job per week → composition → vault) does not depend on
// any vendor; a provider plugs in here as an adapter and is selected by the WEEKLY_VIDEO_PROVIDER var.
// No adapter is registered: Kling was removed and the replacement needs an owner decision on model and cost. While none is selected
// the pipeline stops before it reserves the week or makes any paid call.
//
// Adapter contract:
//   submit(env,job) → {task_id, http_status?, model?}
//     job = {week_id, external_task_id, shots:[{order, source_media_id, image_url, prompt, duration_seconds}]}
//     A definite refusal throws weeklyVideoSubmissionError(msg,{outcome:"rejected",...}). Any other failure counts as ambiguous and
//     the week is never retried automatically, because the provider may have accepted (and billed) the job.
//   poll(env,task_id) → {status:"processing"|"completed"|"failed", video_url?, duration?, status_message?}
const ADAPTERS = new Map();

export function registerWeeklyVideoAdapter(id, adapter) {
  const key = String(id || "").trim().toLowerCase();
  if (!key || typeof adapter?.submit !== "function" || typeof adapter?.poll !== "function") throw Error("Invalid weekly video adapter");
  ADAPTERS.set(key, adapter);
}

export function weeklyVideoAdapter(env) {
  return ADAPTERS.get(String(env?.WEEKLY_VIDEO_PROVIDER || "").trim().toLowerCase()) || null;
}

export function weeklyVideoSubmissionError(message, details = {}) {
  const error = message instanceof Error ? message : Error(String(message ?? "Weekly video submission failed"));
  error.video_submission = {
    outcome: details.outcome === "rejected" ? "rejected" : "ambiguous",
    http_status: Number.isInteger(details.http_status) ? details.http_status : null,
    response_category: String(details.response_category || "unknown"),
    external_task_id: String(details.external_task_id || ""),
    task_id: String(details.task_id || "")
  };
  return error;
}
