// PHASE 25 — Trash and cleanup. Every action is two steps: a preview that fixes the record list, then an execute that re-checks each
// record inside the same transaction as the change. Default is reversible. Nothing here sends, retries, approves or resolves anything.
// Eligibility lives in SQL (`block`), so listing, preview and the final write use one definition and a stale selection cannot pass.
import { ensureFinalQuoteStore } from "./final-quote-review.js";

export const CLEANUP_OP_MAX = 200;
const WRITE_GROUP = 25, OP_TTL_MS = 5 * 60000, RUN_STALE_MS = 5 * 60000, PHRASE_FROM = 20, PAGE_MAX = 100;
const OPEN = "('draft','pending_approval','approved')", UNRESOLVED = "('sending','send_ambiguous')";
const held = lead => `EXISTS(SELECT 1 FROM final_quote_reviews r JOIN lead_outreach ho ON ho.id=r.outreach_id WHERE r.lead_id=${lead} AND ho.status IN ${OPEN})`;
const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
// A live pilot link is revoked only by the owner's reject; deleting around it would leave the link working.
const pilot = lead => `EXISTS(SELECT 1 FROM lead_campaign_codes pc WHERE pc.lead_id=${lead} AND pc.status='active' AND (pc.expires_at IS NULL OR pc.expires_at>${NOW_SQL}))`;
const iso = ms => new Date(ms).toISOString();
// An open escalation the owner set aside as a test artifact: the row stays open and carries no decision, Trash alone holds the mark.
const archivedEsc = id => `EXISTS(SELECT 1 FROM cleanup_trash ax WHERE ax.section='escalations' AND ax.record_id=${id} AND ax.state='trashed' AND json_extract(ax.prior_json,'$.test_artifact')=1)`;
const archivedDec = id => `EXISTS(SELECT 1 FROM cleanup_trash ax WHERE ax.section='decisions' AND ax.record_id=${id} AND ax.state='trashed' AND json_extract(ax.prior_json,'$.via_escalation') IS NOT NULL)`;
const TEST_QUIET_DAYS = 14;

// The dashboard errors view, kept in one place so the view and this section cannot drift apart.
export const ERROR_EVENTS_SQL = "(severity IN ('warning','error','critical') OR type LIKE '%fail%' OR type LIKE '%error%' OR type LIKE '%timeout%' OR type LIKE '%unavailable%' OR type LIKE '%blocked%' OR type LIKE '%refused%' OR type LIKE '%missing%')";

// mode: status = col moves to 'trashed'; inbox/lead = existing inert value; conversation = its own messages are archived with it;
// dlq = dismissed through resolved_at; hide = the row is untouched and active views exclude it through cleanup_trash.
export const CLEANUP_SECTIONS = Object.freeze({
  inbox: { label: "پیام‌های Inbox", path: "/dashboard/sales", table: "inbox_messages", mode: "inbox", col: "status", value: "trashed", date: "t.created_at",
    active: "t.status<>'trashed'", title: "substr(COALESCE(t.message,''),1,90)", sub: "t.platform", state: "t.status", statuses: ["new", "handled", "pending", "archived"],
    block: `CASE WHEN EXISTS(SELECT 1 FROM lead_orders o WHERE o.acceptance_inbox_message_id=t.id) THEN 'has_order' WHEN EXISTS(SELECT 1 FROM lead_quotes q WHERE q.inbox_message_id=t.id) THEN 'has_quote' WHEN EXISTS(SELECT 1 FROM owner_escalations e WHERE e.source_message_id=t.id AND e.status='open' AND NOT ${archivedEsc("e.id")}) THEN 'open_escalation' WHEN EXISTS(SELECT 1 FROM lead_outreach o WHERE o.inbox_message_id=t.id AND o.status IN ('pending_approval','approved','sending','send_ambiguous')) THEN 'open_reply' WHEN t.lead_id IS NOT NULL AND ${held("t.lead_id")} THEN 'final_quote_review' END` },
  conversations: { label: "گفتگوها", path: "/dashboard/customers", table: "lead_conversations", mode: "conversation", date: "t.updated_at",
    active: "1=1", title: "COALESCE((SELECT l.name FROM leads l WHERE l.id=t.lead_id),'بدون نام')", sub: "t.platform", state: "t.status",
    block: `CASE WHEN EXISTS(SELECT 1 FROM lead_orders o WHERE o.conversation_id=t.id) THEN 'has_order' WHEN EXISTS(SELECT 1 FROM lead_quotes q WHERE q.conversation_id=t.id) THEN 'has_quote' WHEN EXISTS(SELECT 1 FROM owner_escalations e WHERE e.conversation_id=t.id AND e.status='open' AND NOT ${archivedEsc("e.id")}) THEN 'open_escalation' WHEN EXISTS(SELECT 1 FROM owner_decisions d WHERE d.conversation_id=t.id AND d.status='PENDING' AND NOT ${archivedDec("d.id")}) THEN 'pending_decision' WHEN EXISTS(SELECT 1 FROM lead_outreach o WHERE o.conversation_id=t.id AND o.status IN ('pending_approval','approved','sending','send_ambiguous')) THEN 'open_reply' WHEN ${held("t.lead_id")} THEN 'final_quote_review' END`,
    bulkBlock: "'needs_explicit_selection'" },
  leads: { label: "مشتریان و لیدها", path: "/dashboard/customers", table: "leads", mode: "lead", col: "stage", value: "archived", date: "t.created_at", markets: true,
    active: "t.stage NOT IN ('archived')", title: "t.name", sub: "t.contact", state: "t.stage", statuses: ["new", "discovered", "qualified", "contacted", "replied", "negotiation", "rejected"],
    block: `CASE WHEN t.stage IN ('customer','converted') THEN 'customer_record' WHEN EXISTS(SELECT 1 FROM lead_orders o WHERE o.lead_id=t.id) THEN 'has_order' WHEN EXISTS(SELECT 1 FROM lead_quotes q WHERE q.lead_id=t.id) THEN 'has_quote' WHEN EXISTS(SELECT 1 FROM owner_escalations e WHERE e.lead_id=t.id AND e.status='open') THEN 'open_escalation' WHEN EXISTS(SELECT 1 FROM owner_decisions d WHERE d.lead_id=t.id AND d.status='PENDING') THEN 'pending_decision' WHEN EXISTS(SELECT 1 FROM lead_outreach o WHERE o.lead_id=t.id AND o.status IN ('draft','pending_approval','approved','sending','send_ambiguous')) THEN 'open_outreach' WHEN ${held("t.id")} THEN 'final_quote_review' WHEN ${pilot("t.id")} THEN 'active_pilot_link' END`,
    // bulk reaches only leads nobody has talked to
    bulkBlock: "CASE WHEN t.stage NOT IN ('new','discovered') OR EXISTS(SELECT 1 FROM inbox_messages i WHERE i.lead_id=t.id) THEN 'needs_explicit_selection' END" },
  outreach: { label: "پیش‌نویس‌ها و پیام‌های ناموفق", path: "/dashboard/approvals", table: "lead_outreach", mode: "status", col: "status", value: "trashed", date: "t.created_at",
    active: "t.status IN ('draft','pending_approval','approved','failed','rejected')", title: "substr(COALESCE(t.message,''),1,90)", sub: "t.channel", state: "t.status", statuses: ["draft", "pending_approval", "approved", "failed", "rejected"],
    block: `CASE WHEN EXISTS(SELECT 1 FROM final_quote_reviews r WHERE r.outreach_id=t.id) THEN 'final_quote_review' WHEN EXISTS(SELECT 1 FROM lead_quotes q WHERE q.outreach_id=t.id) THEN 'has_quote' WHEN t.status='approved' AND ${pilot("t.lead_id")} THEN 'active_pilot_link' END`,
    // a draft that answers a customer message leaves that message without a reply: never in bulk
    bulkBlock: "CASE WHEN t.inbox_message_id IS NOT NULL THEN 'needs_explicit_selection' END",
    restoreBlock: "CASE WHEN EXISTS(SELECT 1 FROM leads l WHERE l.id=t.lead_id AND l.stage='archived') OR EXISTS(SELECT 1 FROM inbox_messages i WHERE i.id=t.inbox_message_id AND i.status='trashed') THEN 'parent_in_trash' END" },
  contents: { label: "محتوای تولیدشده", path: "/dashboard/content", table: "contents", mode: "status", col: "status", value: "trashed", date: "t.created_at",
    active: "t.status NOT IN ('published','trashed')", title: "COALESCE(t.topic,t.hook,'')", sub: "t.platform", state: "t.status", statuses: ["generated", "approved", "rejected", "draft"],
    block: "CASE WHEN EXISTS(SELECT 1 FROM content_distribution d WHERE d.content_id=t.id AND d.status IN ('queued','processing','published','ready')) THEN 'scheduled_or_published' WHEN EXISTS(SELECT 1 FROM calendar c WHERE c.content_id=t.id AND c.status IN ('planned','published')) THEN 'scheduled_or_published' END" },
  distribution: { label: "سابقه انتشار ناموفق", path: "/dashboard/content", table: "content_distribution", mode: "status", col: "status", value: "trashed", date: "t.updated_at",
    active: "t.status IN ('failed','manual_required')", title: "COALESCE((SELECT c.topic FROM contents c WHERE c.id=t.content_id),t.content_id)", sub: "t.target", state: "t.status", statuses: ["failed", "manual_required"],
    block: "CASE WHEN t.error LIKE 'OUTCOME_UNKNOWN%' THEN 'outcome_unknown' END" },
  calendar: { label: "تقویم", path: "/dashboard/content", table: "calendar", mode: "status", col: "status", value: "trashed", date: "t.planned_at",
    active: "t.status NOT IN ('published','trashed','publishing','processing')", title: "COALESCE((SELECT c.topic FROM contents c WHERE c.id=t.content_id),t.content_id)", sub: "t.planned_at", state: "t.status", statuses: ["planned", "failed"], block: "NULL",
    // a restored past date would publish on the next tick
    restoreBlock: `CASE WHEN json_extract(x.prior_json,'$.v')='planned' AND t.planned_at<=${NOW_SQL} THEN 'schedule_passed' END`,
    purge: { days: 30, block: "NULL" } },
  errors: { label: "خطاهای سیستم", path: "/dashboard/errors", table: "system_events", mode: "hide", date: "t.created_at",
    active: ERROR_EVENTS_SQL.replace(/\b(severity|type)\b/g, "t.$1"), title: "t.type", sub: "substr(COALESCE(t.message,''),1,90)", state: "t.severity", statuses: ["error", "warning", "critical", "info"], stateCol: "t.severity", block: "NULL",
    purge: { days: 30, block: "CASE WHEN t.severity='info' OR NOT (t.type LIKE '%\\_step\\_failed' ESCAPE '\\' OR t.type LIKE '%\\_timeout' ESCAPE '\\') THEN 'audit_evidence' END" } },
  tasks: { label: "خطای Cron و Task", path: "/dashboard/agents", table: "autonomy_tasks", mode: "hide", date: "COALESCE(t.finished_at,t.updated_at)",
    active: "t.status IN ('failed','blocked','queued','running')", title: "t.module||' / '||t.action", sub: "substr(COALESCE(t.error,''),1,90)", state: "t.status", statuses: ["failed", "blocked"],
    block: "CASE WHEN t.status IN ('queued','running') THEN 'job_active' WHEN EXISTS(SELECT 1 FROM agent_dead_letters d WHERE d.task_id=t.id AND d.resolved_at IS NULL) THEN 'open_dead_letter' END",
    purge: { days: 30, block: "CASE WHEN EXISTS(SELECT 1 FROM agent_dead_letters d WHERE d.task_id=t.id) OR EXISTS(SELECT 1 FROM agent_approvals a WHERE a.task_id=t.id) THEN 'linked_history' END" } },
  alerts: { label: "هشدارهای Watchdog", path: "/dashboard/agents", table: "agent_alerts", mode: "hide", date: "t.last_seen_at",
    active: "1=1", title: "t.code", sub: "t.agent", state: "t.recovery_state", statuses: ["open", "recovered"], stateCol: "t.recovery_state",
    block: "CASE WHEN t.recovery_state='open' THEN 'alert_active' END", purge: { days: 30, block: "NULL" } },
  retry: { label: "صف Retry", path: "/dashboard/agents", table: "retry_queue", mode: "hide", date: "t.updated_at",
    active: "1=1", title: "t.operation", sub: "substr(COALESCE(t.last_error,''),1,90)", state: "t.status", statuses: ["failed", "completed", "queued", "running"],
    block: "CASE WHEN t.status IN ('queued','running') THEN 'job_active' END", purge: { days: 30, block: "NULL" } },
  dlq: { label: "صف خطای نهایی (DLQ)", path: "/dashboard/agents", table: "agent_dead_letters", mode: "dlq", date: "t.created_at",
    active: "1=1", title: "t.agent", sub: "substr(COALESCE(t.error_redacted,''),1,90)", state: "CASE WHEN t.resolved_at IS NULL THEN 'open' ELSE 'resolved' END", statuses: [],
    block: "CASE WHEN EXISTS(SELECT 1 FROM autonomy_tasks k WHERE k.id=t.task_id AND k.status IN ('queued','running')) THEN 'job_active' END" },
  // A context reset: nothing is changed or deleted. The Trash row's time is a boundary; AI and automation read only what came after it.
  // Named conversations only. Orders and payments stay exactly as they are, so an order-linked conversation can be reset.
  context: { label: "بازنشانی زمینه گفتگو", path: "/dashboard/customers", table: "lead_conversations", mode: "hide", date: "t.updated_at", idsOnly: true,
    active: "1=1", title: "COALESCE((SELECT l.name FROM leads l WHERE l.id=t.lead_id),'بدون نام')", sub: "t.platform", state: "t.status", statuses: [],
    block: `CASE WHEN EXISTS(SELECT 1 FROM lead_outreach o WHERE o.conversation_id=t.id AND o.status IN ('pending_approval','approved','sending','send_ambiguous')) THEN 'open_reply'
      WHEN ${held("t.lead_id")} THEN 'final_quote_review' WHEN ${pilot("t.lead_id")} THEN 'active_pilot_link'
      WHEN EXISTS(SELECT 1 FROM inbox_messages i WHERE i.conversation_id=t.id AND i.created_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-${TEST_QUIET_DAYS} days')) THEN 'recent_customer_activity' END` },
  // Hidden from sales and search through the existing 'inactive' state. The R2 object and Telegram file stay: no purge here.
  gallery: { label: "گالری محصولات", path: "/dashboard/gallery", table: "visual_product_media", mode: "status", col: "candidate_status", value: "inactive", versioned: true, date: "t.created_at",
    active: "t.candidate_status IN ('candidate','verified','rejected')", title: "COALESCE((SELECT g.product_key FROM gallery_photo_specs g WHERE g.visual_media_id=t.id ORDER BY g.version DESC LIMIT 1),t.source_platform)", sub: "t.media_type", state: "t.candidate_status", statuses: ["candidate", "verified", "rejected"],
    block: "CASE WHEN EXISTS(SELECT 1 FROM lead_outreach_media m JOIN lead_outreach o ON o.id=m.outreach_id WHERE m.visual_media_id=t.id AND o.status IN ('draft','pending_approval','approved','sending','send_ambiguous')) THEN 'used_in_open_message' END" },
  vault: { label: "رسانه مخزن تلگرام", path: "/dashboard/media", table: "telegram_media_sources", mode: "hide", date: "t.created_at",
    active: "t.source_kind='vault'", title: "COALESCE(substr(t.caption,1,90),t.media_type)", sub: "t.media_type", state: "t.media_type", statuses: [],
    block: "CASE WHEN EXISTS(SELECT 1 FROM content_media c WHERE c.source_id=t.id) THEN 'used_by_content' WHEN EXISTS(SELECT 1 FROM visual_product_media v WHERE v.source_media_id=t.id OR v.source_file_unique_id=t.file_unique_id) THEN 'used_by_gallery' END" },
  escalations: { label: "ارجاع‌های مالک", path: "/dashboard/approvals", table: "owner_escalations", mode: "hide", date: "t.created_at",
    active: "1=1", title: "t.reason_code", sub: "t.channel", state: "t.status", statuses: ["open", "resolved"], block: "CASE WHEN t.status='open' THEN 'open_escalation' END",
    // Set aside as a test artifact: named records only. Anything with a live commercial link, or a customer still writing, stays with the owner.
    testBlock: `CASE WHEN t.status<>'open' THEN 'not_open' WHEN t.lead_id IS NULL OR t.conversation_id IS NULL THEN 'no_lead'
      WHEN NOT EXISTS(SELECT 1 FROM owner_decisions d WHERE d.owner_escalation_id=t.id AND d.status='PENDING') THEN 'no_pending_decision'
      WHEN EXISTS(SELECT 1 FROM lead_orders o WHERE o.lead_id=t.lead_id AND o.status<>'cancelled') THEN 'live_order'
      WHEN EXISTS(SELECT 1 FROM lead_orders o WHERE o.acceptance_inbox_message_id=t.source_message_id) THEN 'has_order'
      WHEN EXISTS(SELECT 1 FROM lead_quotes q WHERE q.lead_id=t.lead_id) THEN 'has_quote'
      WHEN EXISTS(SELECT 1 FROM owner_decisions d WHERE d.owner_escalation_id=t.id AND d.status='PENDING' AND (COALESCE(d.order_id,'')<>'' OR COALESCE(d.quote_id,'')<>'')) THEN 'commercial_link'
      WHEN EXISTS(SELECT 1 FROM lead_outreach o WHERE o.lead_id=t.lead_id AND o.status IN ('pending_approval','approved','sending','send_ambiguous')) THEN 'open_reply'
      WHEN ${held("t.lead_id")} THEN 'final_quote_review' WHEN ${pilot("t.lead_id")} THEN 'active_pilot_link'
      WHEN EXISTS(SELECT 1 FROM inbox_messages i WHERE i.lead_id=t.lead_id AND i.created_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-${TEST_QUIET_DAYS} days')) THEN 'recent_customer_activity' END`,
    restoreBlock: "CASE WHEN json_extract(x.prior_json,'$.test_artifact')=1 AND EXISTS(SELECT 1 FROM inbox_messages i WHERE i.id=t.source_message_id AND i.status='trashed') THEN 'message_in_trash' END" },
  decisions: { label: "تصمیم‌های مالک", path: "/dashboard/actions", table: "owner_decisions", mode: "hide", date: "t.created_at",
    active: "1=1", title: "t.decision_type", sub: "t.priority", state: "t.status", statuses: ["PENDING", "RESOLVED", "SUPERSEDED"], block: "CASE WHEN t.status='PENDING' THEN 'pending_decision' END",
    restoreBlock: "CASE WHEN json_extract(x.prior_json,'$.via_escalation') IS NOT NULL THEN 'restore_with_escalation' END" }
});

// Shown in the dashboard instead of a delete control.
export const CLEANUP_PROTECTED = Object.freeze([
  { key: "payments", label: "پرداخت‌ها", reason: "مدرک مالی؛ تغییرناپذیر و فقط با ثبت برگشت اصلاح می‌شود." },
  { key: "orders", label: "سفارش‌ها و پیش‌نویس سفارش", reason: "مدرک سفارش؛ وضعیت پیش‌نویس در سیستم وجود ندارد و سفارش فقط لغو می‌شود." },
  { key: "sent", label: "پیام‌های ارسال‌شده", reason: "سابقه ارسال واقعی و مانع ارسال تکراری است." },
  { key: "approval_queue", label: "صف تأیید", reason: "سابقه تأیید حفظ می‌شود. برای حذف، خود محتوا را در بخش «محتوای تولیدشده» حذف کنید." },
  { key: "prices", label: "قیمت‌ها و تاریخچه قیمت", reason: "تاریخچه تجاری؛ تغییرناپذیر است." },
  { key: "knowledge", label: "دانش فروش و حافظه گفتگو", reason: "دانش تأییدشده کسب‌وکار؛ تغییرناپذیر است." },
  { key: "ai_ledger", label: "مصرف AI و گزارش اجرای عامل‌ها", reason: "شواهد کنترل هزینه و تشخیص خطا است." },
  { key: "audit", label: "رکوردهای Audit و امنیت", reason: "مدرک امنیتی است و با پاک‌سازی عادی حذف نمی‌شود." },
  { key: "notifications", label: "اعلان‌های مالک", reason: "جدول جدایی ندارد؛ وضعیت اعلان قیمت نهایی بخشی از سابقه تأیید است. هشدارها در بخش Watchdog هستند." },
  { key: "media_files", label: "فایل‌های R2 و تلگرام", reason: "حذف دائمی فایل مجوز جدا لازم دارد. حذف در این صفحه فقط عکس را از فروش و جستجو کنار می‌گذارد." }
]);

const httpError = (status, error, extra = {}) => Object.assign(new Error(error), { status, extra });
const blockExpr = (s, scope, purge, test) => test ? s.testBlock : purge ? s.purge.block : (scope === "filter" || scope === "section") && s.bulkBlock ? `COALESCE(${s.block},${s.bulkBlock})` : s.block;
const notTrashed = key => `NOT EXISTS(SELECT 1 FROM cleanup_trash ct WHERE ct.section='${key}' AND ct.record_id=t.id AND ct.state='trashed')`;
const stateCol = s => s.stateCol || (s.col ? "t." + s.col : "t.status");
const rows = async (env, sql, binds = []) => (await env.DB.prepare(sql).bind(...binds).all()).results || [];

async function storeReady(env) {
  try { await env.DB.prepare("SELECT 1 FROM cleanup_trash LIMIT 1").first(); await env.DB.prepare("SELECT 1 FROM cleanup_ops LIMIT 1").first(); return true; } catch { return false; }
}
async function requireStore(env) {
  if (!(await storeReady(env))) throw httpError(503, "migration_required");
  await ensureFinalQuoteStore(env);
}

// For existing views: hides trashed rows once the store exists; before the migration the view works as it did.
export async function cleanupHiddenSql(env, section, idExpr) {
  if (!CLEANUP_SECTIONS[section] || !/^[a-z_.]+$/.test(idExpr)) return "";
  try { await env.DB.prepare("SELECT 1 FROM cleanup_trash LIMIT 1").first(); } catch { return ""; }
  return ` AND NOT EXISTS(SELECT 1 FROM cleanup_trash ct WHERE ct.section='${section}' AND ct.record_id=${idExpr} AND ct.state='trashed')`;
}

// Only a deliberate test archive hides an OPEN record. Any other Trash row on a record that is open again leaves it visible and in force.
const SET_ASIDE = { escalations: ["'$.test_artifact'"], decisions: ["'$.via_escalation'"] };
export function cleanupSetAsideClause(section, idExpr) {
  if (!SET_ASIDE[section] || !/^[a-z_.]+$/.test(idExpr)) return "";
  return ` AND NOT EXISTS(SELECT 1 FROM cleanup_trash ct WHERE ct.section='${section}' AND ct.record_id=${idExpr} AND ct.state='trashed' AND json_extract(ct.prior_json,${SET_ASIDE[section][0]}) IS NOT NULL)`;
}
export async function cleanupSetAsideSql(env, section, idExpr) {
  try { await env.DB.prepare("SELECT 1 FROM cleanup_trash LIMIT 1").first(); } catch { return ""; }
  return cleanupSetAsideClause(section, idExpr);
}
// The context boundary of a conversation: the latest reset or archive. Everything at or before it no longer exists for AI and automation.
// '' = no boundary. A read that fails hides everything and stops sends (CONTEXT_UNKNOWN sorts after any date); a store that does not
// exist yet means nothing was ever reset.
export const CONTEXT_UNKNOWN = "9999";
const contextRead = async (env, sql, id) => {
  try { return (await env.DB.prepare(sql).bind(String(id || "")).first())?.m || ""; }
  catch (e) { return /no such table/i.test(String(e?.message || e)) ? "" : CONTEXT_UNKNOWN; }
};
const CONTEXT_ROWS = "FROM cleanup_trash WHERE section IN ('context','conversations') AND state='trashed' AND record_id";
// An owner-confirmed test order is a boundary too, from the moment of the classification: its lead's earlier context is test data.
// Only this named record counts. A lead that merely carries the old test flag has no boundary.
const TEST_ORDER_FROM = "CASE WHEN json_valid(l.notes) THEN CASE WHEN json_extract(l.notes,'$.data_class')='test' THEN json_extract(l.notes,'$.test_order_classification.confirmed_at') END END";
const contextFrom = (rows, leadWhere) => `WITH k(id) AS (SELECT ?) SELECT MAX(m) m FROM (SELECT deleted_at m ${rows} UNION ALL SELECT ${TEST_ORDER_FROM} m FROM leads l WHERE ${leadWhere})`;
export const cleanupContextFrom = (env, conversationId) => contextRead(env, contextFrom(`${CONTEXT_ROWS}=(SELECT id FROM k)`, "l.id=(SELECT lead_id FROM lead_conversations WHERE id=(SELECT id FROM k))"), conversationId);
export const cleanupContextFromMessage = (env, inboxId) => contextRead(env, contextFrom(`${CONTEXT_ROWS}=(SELECT conversation_id FROM inbox_messages WHERE id=(SELECT id FROM k))`, "l.id=(SELECT lead_id FROM lead_conversations WHERE id=(SELECT conversation_id FROM inbox_messages WHERE id=(SELECT id FROM k)))"), inboxId);
export const cleanupLeadContextFrom = (env, leadId) => contextRead(env, contextFrom(`${CONTEXT_ROWS} IN (SELECT id FROM lead_conversations WHERE lead_id=(SELECT id FROM k))`, "l.id=(SELECT id FROM k)"), leadId);
// Why a lead's follow-ups are stopped, for the owner: archived test escalations stay open by design.
export async function cleanupArchivedTestSummary(env) {
  try {
    const r = await env.DB.prepare("SELECT COUNT(*) n,COUNT(DISTINCT e.lead_id) leads FROM cleanup_trash ct JOIN owner_escalations e ON e.id=ct.record_id WHERE ct.section='escalations' AND ct.state='trashed' AND json_extract(ct.prior_json,'$.test_artifact')=1").first();
    // replies a reset held for the owner: without this count they would wait unseen among the drafts
    const h = await env.DB.prepare("SELECT COUNT(*) n FROM lead_outreach WHERE status='draft' AND error_detail='reset_financial_owner'").first();
    return { count: Number(r?.n || 0), leads: Number(r?.leads || 0), held: Number(h?.n || 0) };
  } catch { return { count: 0, leads: 0, held: 0 }; }
}
// A set-aside escalation cannot be answered: the owner restores it first, so no decision is ever recorded on a hidden record.
export async function cleanupEscalationArchived(env, id) {
  try { return !!(await env.DB.prepare("SELECT 1 x FROM cleanup_trash WHERE section='escalations' AND record_id=? AND state='trashed' AND json_extract(prior_json,'$.test_artifact')=1 LIMIT 1").bind(String(id || "")).first()); }
  catch { return false; }
}

function section(key) {
  const s = Object.prototype.hasOwnProperty.call(CLEANUP_SECTIONS, key) ? CLEANUP_SECTIONS[key] : null;
  if (!s) throw httpError(404, "unknown_section");
  return s;
}
// Only whitelisted filters reach SQL, always as bound values.
function filterSql(s, f = {}, nowMs, dateExpr = s.date) {
  const parts = [], binds = [], used = {}, days = Number(f.older_than_days);
  if (f.older_than_days !== undefined && f.older_than_days !== null && f.older_than_days !== "") {
    if (!Number.isInteger(days) || days < 0 || days > 3650) throw httpError(400, "invalid_filter");
    parts.push(`${dateExpr}<?`); binds.push(iso(nowMs - days * 86400000)); used.older_than_days = days;
  }
  if (f.status) {
    if (!s.statuses.includes(String(f.status))) throw httpError(400, "invalid_filter");
    parts.push(`${stateCol(s)}=?`); binds.push(String(f.status)); used.status = String(f.status);
  }
  if (f.market) {
    const m = String(f.market).toUpperCase();
    if (!s.markets || !["IRAN", "ARAB"].includes(m)) throw httpError(400, "invalid_filter");
    parts.push("json_valid(t.notes) AND upper(COALESCE(json_extract(t.notes,'$.target_market'),json_extract(t.notes,'$.market'),''))=?"); binds.push(m); used.market = m;
  }
  return { sql: parts.length ? " AND " + parts.join(" AND ") : "", binds, used };
}
const activeFrom = (key, s) => `FROM ${s.table} t WHERE ${s.active} AND ${notTrashed(key)}`;
const trashFrom = (key, s) => `FROM cleanup_trash x JOIN ${s.table} t ON t.id=x.record_id WHERE x.section='${key}' AND x.state='trashed'`;
function restoreBlockSql(s) {
  const changed = s.mode === "hide" ? "NULL" : s.mode === "dlq" ? "CASE WHEN json_extract(x.prior_json,'$.open')=1 AND COALESCE(t.resolution,'')<>'dismissed' THEN 'changed_since_delete' END" : s.mode === "conversation" ? "NULL" : `CASE WHEN t.${s.col}<>'${s.value}' THEN 'changed_since_delete' END`;
  return `COALESCE(${changed},${s.restoreBlock || "NULL"})`;
}
const purgeBlockSql = s => `COALESCE(CASE WHEN x.deleted_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-${Number(s.purge.days)} days') THEN 'retention_active' END,${s.block},${s.purge.block})`;

export async function cleanupOverview(env) {
  const ready = await storeReady(env), sections = [];
  if (ready) await ensureFinalQuoteStore(env);
  for (const [key, s] of Object.entries(CLEANUP_SECTIONS)) {
    let active = null, trash = null;
    if (ready) {
      active = Number((await env.DB.prepare(`SELECT COUNT(*) n ${activeFrom(key, s)}`).first())?.n || 0);
      trash = Number((await env.DB.prepare(`SELECT COUNT(*) n ${trashFrom(key, s)}`).first())?.n || 0);
    }
    sections.push({ key, label: s.label, path: s.path, active, trash, statuses: s.statuses, markets: !!s.markets, purge: !!s.purge, purge_days: s.purge?.days ?? null });
  }
  return { ok: true, ready, op_max: CLEANUP_OP_MAX, sections, protected: CLEANUP_PROTECTED };
}

export async function cleanupItems(env, p, nowMs = Date.now()) {
  await requireStore(env);
  const key = String(p.section || ""), s = section(key), view = p.view === "trash" ? "trash" : "active";
  const limit = Math.min(PAGE_MAX, Math.max(1, Number(p.limit) || 50)), offset = Math.max(0, Number(p.offset) || 0);
  const f = filterSql(s, p, nowMs, view === "trash" ? "x.deleted_at" : s.date);
  const cols = `t.id AS id,${s.title} AS title,${s.sub} AS sub,${s.date} AS at,${s.state} AS state${s.testBlock && view !== "trash" ? `,${s.testBlock} AS test_block` : ""}`;
  const sql = view === "trash"
    ? `SELECT ${cols},x.deleted_at,json_extract(x.prior_json,'$.test_artifact') AS test_artifact,${restoreBlockSql(s)} AS block,${s.purge ? purgeBlockSql(s) : "'not_purgeable'"} AS purge_block ${trashFrom(key, s)}${f.sql} ORDER BY x.deleted_at DESC LIMIT ? OFFSET ?`
    : `SELECT ${cols},${s.block} AS block ${activeFrom(key, s)}${f.sql} ORDER BY at DESC LIMIT ? OFFSET ?`;
  const total = Number((await env.DB.prepare(`SELECT COUNT(*) n ${view === "trash" ? trashFrom(key, s) : activeFrom(key, s)}${f.sql}`).bind(...f.binds).first())?.n || 0);
  return { ok: true, section: key, view, total, limit, offset, items: await rows(env, sql, [...f.binds, limit, offset]) };
}

const chunk = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };
const phraseOf = (action, n) => (action === "purge" ? "حذف دائمی " : action === "restore" ? "بازیابی " : "حذف ") + n + " مورد";
// Persian digits and spacing typed on a phone must not fail a correct confirmation.
const normalizePhrase = v => String(v || "").replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/‌/g, " ").replace(/\s+/g, " ").trim();

// What else a delete touches, shown before the owner confirms. Counts only.
async function impactOf(env, key, action, ids) {
  const out = { impact: {}, warnings: [] };
  if (!ids.length || !["inbox", "conversations", "outreach", "leads", "escalations", "context"].includes(key)) return out;
  const count = async (sqlFor) => { let n = 0; for (const part of chunk(ids, 90)) { const q = part.map(() => "?").join(","); n += Number((await env.DB.prepare(sqlFor(q)).bind(...part).first())?.n || 0); } return n; };
  const scheduled = q => `SELECT COUNT(*) n FROM leads l WHERE json_valid(l.notes) AND json_extract(l.notes,'$.next_followup_at') IS NOT NULL AND l.id IN (${q})`;
  if (key === "inbox") {
    out.impact.drafts = await count(q => `SELECT COUNT(*) n FROM lead_outreach WHERE status='draft' AND inbox_message_id IN (${q})`);
    out.impact.pending_replies = await count(q => `SELECT COUNT(*) n FROM lead_outreach WHERE status IN ('pending_approval','approved','sending','send_ambiguous') AND inbox_message_id IN (${q})`);
    out.impact.memory_facts = await count(q => `SELECT COUNT(*) n FROM conversation_memory_facts WHERE status='active' AND source_message_id IN (${q})`);
    out.impact.open_escalations = await count(q => `SELECT COUNT(*) n FROM owner_escalations e WHERE e.status='open' AND NOT ${archivedEsc("e.id")} AND e.source_message_id IN (${q})`);
    out.impact.pending_decisions = await count(q => `SELECT COUNT(*) n FROM owner_decisions d JOIN owner_escalations e ON e.id=d.owner_escalation_id WHERE d.status='PENDING' AND NOT ${archivedEsc("e.id")} AND e.source_message_id IN (${q})`);
    out.impact.followups = await count(q => scheduled(`SELECT lead_id FROM inbox_messages WHERE id IN (${q})`));
  } else if (key === "conversations") {
    out.impact.messages = await count(q => `SELECT COUNT(*) n FROM inbox_messages WHERE status<>'trashed' AND conversation_id IN (${q})`);
    out.impact.drafts = await count(q => `SELECT COUNT(*) n FROM lead_outreach WHERE status='draft' AND conversation_id IN (${q})`);
    out.impact.memory_facts = await count(q => `SELECT COUNT(*) n FROM conversation_memory_facts WHERE status='active' AND conversation_id IN (${q})`);
    out.impact.followups = await count(q => scheduled(`SELECT lead_id FROM lead_conversations WHERE id IN (${q})`));
  } else if (key === "leads") {
    out.impact.followups = await count(scheduled);
  } else if (key === "context") {
    out.impact.memory_facts = await count(q => `SELECT COUNT(*) n FROM conversation_memory_facts WHERE status='active' AND conversation_id IN (${q})`);
  } else if (key === "escalations") {
    out.impact.pending_decisions = await count(q => `SELECT COUNT(*) n FROM owner_decisions WHERE status='PENDING' AND owner_escalation_id IN (${q})`);
  } else {
    const unanswered = await count(q => `SELECT COUNT(*) n FROM lead_outreach o JOIN inbox_messages i ON i.id=o.inbox_message_id WHERE o.id IN (${q}) AND NOT EXISTS(SELECT 1 FROM lead_outreach s WHERE s.lead_id=o.lead_id AND s.status IN ('sent','delivered') AND s.created_at>=i.created_at)`);
    if (action === "trash" && unanswered) { out.impact.unanswered = unanswered; out.warnings.push("unanswered_message"); }
  }
  if (action === "trash") {
    if (out.impact.drafts) out.warnings.push("linked_drafts");
    if (out.impact.memory_facts) out.warnings.push("memory_hidden");
    if (out.impact.followups) out.warnings.push("followup_scheduled");
  }
  if (action === "restore") out.warnings.push(key === "context" ? "context_returns" : "no_reply_after_restore");
  return out;
}

export async function cleanupPreview(env, b, actor, nowMs = Date.now()) {
  await requireStore(env);
  const key = String(b?.section || ""), s = section(key), action = String(b?.action || ""), scope = String(b?.scope || "");
  if (!["trash", "restore", "purge"].includes(action)) throw httpError(400, "invalid_action");
  if (!["ids", "page", "filter", "section"].includes(scope)) throw httpError(400, "invalid_scope");
  if (action === "purge" && !s.purge) throw httpError(409, "not_purgeable");
  const test = b?.test_artifact === true;
  if (test && !(s.testBlock && action === "trash" && scope === "ids")) throw httpError(400, "test_artifact_not_allowed");
  if (s.idsOnly && action === "trash" && scope !== "ids") throw httpError(400, "named_records_only");
  const fromAction = action === "trash" ? activeFrom(key, s) : trashFrom(key, s);
  const block = action === "trash" ? blockExpr(s, scope, false, test) : action === "restore" ? restoreBlockSql(s) : purgeBlockSql(s);
  const select = `SELECT t.id AS id,${s.state} AS state,${block} AS block ${fromAction}`;
  let found = [], f = { sql: "", binds: [], used: {} }, requested = 0;
  if (scope === "ids" || scope === "page") {
    const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map(String).filter(Boolean))];
    if (!ids.length) throw httpError(400, "ids_required");
    if (ids.length > CLEANUP_OP_MAX) throw httpError(400, "too_many_ids");
    requested = ids.length;
    for (const part of chunk(ids, 90)) found.push(...await rows(env, `${select} AND t.id IN (${part.map(() => "?").join(",")})`, part));
  } else {
    if (scope === "filter") {
      f = filterSql(s, b.filter || {}, nowMs, action === "trash" ? s.date : "x.deleted_at");
      if (!Object.keys(f.used).length) throw httpError(400, "filter_required");
    }
    found = await rows(env, `${select}${f.sql} LIMIT 5000`, f.binds);
    requested = found.length;
  }
  const eligible = found.filter(r => r.block === null || r.block === undefined), blocked = {}, byState = {};
  for (const r of found) { if (r.block) blocked[r.block] = (blocked[r.block] || 0) + 1; else byState[r.state] = (byState[r.state] || 0) + 1; }
  const ids = eligible.slice(0, CLEANUP_OP_MAX).map(r => r.id), count = ids.length;
  const summary = { section: key, label: s.label, action, scope, ...(test ? { test_artifact: true } : {}), filter: f.used, requested, eligible: eligible.length, this_run: count, remaining: eligible.length - count, not_available: requested - found.length, blocked, by_state: byState, ...await impactOf(env, key, action, ids) };
  if (!count) return { ok: true, token: null, count: 0, confirm_phrase: null, summary };
  const reset = key === "context" && action === "trash", needsPhrase = test || reset || action === "purge" || scope === "filter" || scope === "section" || count >= PHRASE_FROM || ["leads", "conversations"].includes(key);
  const phrase = test ? "بایگانی تست " + count + " مورد" : reset ? "بازنشانی گفتگو " + count + " مورد" : needsPhrase ? phraseOf(action, count) : null, token = crypto.randomUUID(), t = iso(nowMs);
  await env.DB.prepare("INSERT INTO cleanup_ops(id,section,action,scope,filter_json,record_ids_json,summary_json,confirm_phrase,status,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,'previewed',?,?,?)")
    .bind(token, key, action, scope, JSON.stringify(f.used), JSON.stringify(ids), JSON.stringify(summary), phrase, String(actor), t, iso(nowMs + OP_TTL_MS)).run();
  return { ok: true, token, count, confirm_phrase: phrase, expires_at: iso(nowMs + OP_TTL_MS), summary };
}

function trashStatements(env, key, s, id, opId, actor, t, scope, test) {
  const tid = crypto.randomUUID(), P = (q, ...v) => env.DB.prepare(q).bind(...v);
  const prior = test ? "json_object('test_artifact',1,'v',t.status,'version',t.version)" : s.mode === "conversation" ? "json_object('inbox',json((SELECT json_group_array(json_object('id',i.id,'s',i.status)) FROM inbox_messages i WHERE i.conversation_id=t.id AND i.status<>'trashed')),'drafts',json((SELECT json_group_array(o.id) FROM lead_outreach o WHERE o.conversation_id=t.id AND o.status='draft')))"
    : s.mode === "inbox" ? "json_object('v',t.status,'drafts',json((SELECT json_group_array(o.id) FROM lead_outreach o WHERE o.inbox_message_id=t.id AND o.status='draft')))"
    : s.mode === "dlq" ? "json_object('open',CASE WHEN t.resolved_at IS NULL THEN 1 ELSE 0 END)"
    : s.col ? `json_object('v',t.${s.col})` : "'{}'";
  const out = [P(`INSERT OR IGNORE INTO cleanup_trash(id,section,record_id,op_id,prior_json,state,deleted_by,deleted_at) SELECT ?,?,t.id,?,${prior},'trashed',?,? FROM ${s.table} t WHERE t.id=? AND ${s.active} AND ${notTrashed(key)} AND (${blockExpr(s, scope, false, test)}) IS NULL`, tid, key, opId, actor, t, id)];
  const guard = "EXISTS(SELECT 1 FROM cleanup_trash c WHERE c.id=?)";
  // its pending decision goes with it, untouched: still PENDING, no answer recorded. Only this row's restore brings it back.
  if (test) out.push(P(`INSERT OR IGNORE INTO cleanup_trash(id,section,record_id,op_id,prior_json,state,deleted_by,deleted_at) SELECT lower(hex(randomblob(16))),'decisions',d.id,?,json_object('via_escalation',?),'trashed',?,? FROM owner_decisions d WHERE d.owner_escalation_id=? AND d.status='PENDING' AND ${guard}`, opId, id, actor, t, id, tid));
  if (s.mode === "status" || s.mode === "lead") out.push(P(`UPDATE ${s.table} SET ${s.col}=?,updated_at=?${s.versioned ? ",version=version+1" : ""} WHERE id=? AND ${guard}`, s.value, t, id, tid));
  // a draft never outlives its message: it moves to Trash with it, so it cannot be approved or sent on its own
  else if (s.mode === "inbox") out.push(P(`UPDATE inbox_messages SET status='trashed',updated_at=? WHERE id=? AND ${guard}`, t, id, tid), P(`UPDATE lead_outreach SET status='trashed',updated_at=? WHERE inbox_message_id=? AND status='draft' AND ${guard}`, t, id, tid));
  else if (s.mode === "conversation") out.push(P(`UPDATE inbox_messages SET status='trashed',updated_at=? WHERE conversation_id=? AND status<>'trashed' AND ${guard}`, t, id, tid), P(`UPDATE lead_outreach SET status='trashed',updated_at=? WHERE conversation_id=? AND status='draft' AND ${guard}`, t, id, tid));
  else if (s.mode === "dlq") out.push(P(`UPDATE agent_dead_letters SET resolved_at=?,resolved_by=?,resolution='dismissed' WHERE id=? AND resolved_at IS NULL AND ${guard}`, t, actor, id, tid));
  return out;
}
function restoreStatements(env, key, s, row, actor, t) {
  const P = (q, ...v) => env.DB.prepare(q).bind(...v), prior = JSON.parse(row.prior_json || "{}");
  const out = [P(`UPDATE cleanup_trash SET state='restored',restored_by=?,restored_at=? WHERE id=? AND state='trashed' AND EXISTS(SELECT 1 FROM cleanup_trash x JOIN ${s.table} t ON t.id=x.record_id WHERE x.id=? AND (${restoreBlockSql(s)}) IS NULL)`, actor, t, row.trash_id, row.trash_id)];
  const guard = "EXISTS(SELECT 1 FROM cleanup_trash c WHERE c.id=? AND c.state='restored' AND c.restored_at=?)";
  if (prior.test_artifact) out.push(P(`UPDATE cleanup_trash SET state='restored',restored_by=?,restored_at=? WHERE section='decisions' AND state='trashed' AND json_extract(prior_json,'$.via_escalation')=? AND ${guard}`, actor, t, row.id, row.trash_id, t));
  if (s.mode === "status" && key === "outreach") {
    // A commercial approval never comes back from Trash: an approved row returns as a draft and needs a fresh approval.
    out.push(P(`UPDATE lead_outreach SET status=?,approved_at=CASE WHEN ?='approved' THEN NULL ELSE approved_at END,approved_by=CASE WHEN ?='approved' THEN NULL ELSE approved_by END,updated_at=? WHERE id=? AND status='trashed' AND ${guard}`, prior.v === "approved" ? "draft" : prior.v, prior.v, prior.v, t, row.id, row.trash_id, t));
  } else if (s.mode === "status" || s.mode === "lead") out.push(P(`UPDATE ${s.table} SET ${s.col}=?,updated_at=?${s.versioned ? ",version=version+1" : ""} WHERE id=? AND ${s.col}=? AND ${guard}`, prior.v, t, row.id, s.value, row.trash_id, t));
  else if (s.mode === "inbox") out.push(P(`UPDATE inbox_messages SET status=?,updated_at=? WHERE id=? AND status='trashed' AND ${guard}`, prior.v, t, row.id, row.trash_id, t));
  else if (s.mode === "conversation") { const list = JSON.stringify(prior.inbox || []); out.push(P(`UPDATE inbox_messages SET status=(SELECT json_extract(j.value,'$.s') FROM json_each(?) j WHERE json_extract(j.value,'$.id')=inbox_messages.id),updated_at=? WHERE status='trashed' AND id IN (SELECT json_extract(j.value,'$.id') FROM json_each(?) j) AND ${guard}`, list, t, list, row.trash_id, t)); }
  // its drafts return as drafts: nothing is approved and nothing is sent
  if (s.mode === "inbox" || s.mode === "conversation") out.push(P(`UPDATE lead_outreach SET status='draft',updated_at=? WHERE status='trashed' AND id IN (SELECT value FROM json_each(?)) AND ${guard}`, t, JSON.stringify(prior.drafts || []), row.trash_id, t));
  else if (s.mode === "dlq" && prior.open === 1) out.push(P(`UPDATE agent_dead_letters SET resolved_at=NULL,resolved_by=NULL,resolution=NULL WHERE id=? AND resolution='dismissed' AND ${guard}`, row.id, row.trash_id, t));
  return out;
}
function purgeStatements(env, s, row, actor, t) {
  const P = (q, ...v) => env.DB.prepare(q).bind(...v);
  return [
    P(`UPDATE cleanup_trash SET state='purged',purged_by=?,purged_at=?,prior_json='{}' WHERE id=? AND state='trashed' AND EXISTS(SELECT 1 FROM cleanup_trash x JOIN ${s.table} t ON t.id=x.record_id WHERE x.id=? AND (${purgeBlockSql(s)}) IS NULL)`, actor, t, row.trash_id, row.trash_id),
    P(`DELETE FROM ${s.table} WHERE id=? AND EXISTS(SELECT 1 FROM cleanup_trash c WHERE c.id=? AND c.state='purged' AND c.purged_at=?)`, row.id, row.trash_id, t)
  ];
}

export async function cleanupExecute(env, b, actor, nowMs = Date.now()) {
  await requireStore(env);
  const token = String(b?.token || "");
  if (!token) throw httpError(400, "token_required");
  const op = await env.DB.prepare("SELECT * FROM cleanup_ops WHERE id=?").bind(token).first();
  if (!op) throw httpError(404, "unknown_token");
  if (op.status === "done") return { ok: true, idempotent: true, result: JSON.parse(op.result_json || "{}") };
  if (op.status === "running") throw httpError(409, "operation_running");
  if (op.status === "failed") throw httpError(409, "operation_failed");
  const t = iso(nowMs);
  if (op.expires_at <= t) throw httpError(410, "preview_expired");
  if (op.confirm_phrase && normalizePhrase(b?.confirm) !== normalizePhrase(op.confirm_phrase)) throw httpError(400, "confirmation_mismatch", { confirm_phrase: op.confirm_phrase });
  await env.DB.prepare("UPDATE cleanup_ops SET status='failed',finished_at=?,result_json='{\"error\":\"stale_run\"}' WHERE status='running' AND started_at<?").bind(t, iso(nowMs - RUN_STALE_MS)).run();
  let claimed = null;
  try { claimed = await env.DB.prepare("UPDATE cleanup_ops SET status='running',started_at=? WHERE id=? AND status='previewed'").bind(t, token).run(); }
  catch { throw httpError(409, "section_busy"); }
  if (!claimed?.meta?.changes) throw httpError(409, "operation_running");
  const key = op.section, s = section(key), ids = JSON.parse(op.record_ids_json || "[]"), test = !!JSON.parse(op.summary_json || "{}").test_artifact, result = { section: key, action: op.action, scope: op.scope, ...(test ? { test_artifact: true } : {}), requested: ids.length, done: 0, skipped: 0 };
  try {
    let trashRows = new Map();
    if (op.action !== "trash") for (const part of chunk(ids, 90)) for (const r of await rows(env, `SELECT id AS trash_id,record_id AS id,prior_json FROM cleanup_trash WHERE section=? AND state='trashed' AND record_id IN (${part.map(() => "?").join(",")})`, [key, ...part])) trashRows.set(r.id, r);
    for (const part of chunk(ids, WRITE_GROUP)) {
      const flat = [], heads = [];
      for (const id of part) {
        const row = trashRows.get(id);
        if (op.action !== "trash" && !row) { result.skipped++; continue; }
        heads.push(flat.length);
        flat.push(...(op.action === "trash" ? trashStatements(env, key, s, id, token, String(actor), t, op.scope, test) : op.action === "restore" ? restoreStatements(env, key, s, row, String(actor), t) : purgeStatements(env, s, row, String(actor), t)));
      }
      if (!flat.length) continue;
      const r = await env.DB.batch(flat);
      for (const i of heads) { if (r?.[i]?.meta?.changes) result.done++; else result.skipped++; }
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE cleanup_ops SET status='done',finished_at=?,result_json=? WHERE id=?").bind(t, JSON.stringify(result), token),
      // counts and ids of the operation only: no customer text
      env.DB.prepare("INSERT INTO system_events VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(), "cleanup_executed", "info", "Dashboard cleanup executed", JSON.stringify({ op_id: token, actor: String(actor), ...result }), t)
    ]);
    return { ok: true, result };
  } catch (e) {
    await env.DB.prepare("UPDATE cleanup_ops SET status='failed',finished_at=?,result_json=? WHERE id=?").bind(t, JSON.stringify({ ...result, error: "execution_failed" }), token).run().catch(() => {});
    throw httpError(500, "execution_failed", { result });
  }
}

// A customer who writes to a lead in Trash brings it back: the lead returns to its stage and the normal inbound flow continues.
export async function cleanupReviveLead(env, leadId, nowMs = Date.now()) {
  try {
    const row = await env.DB.prepare("SELECT id,prior_json FROM cleanup_trash WHERE section='leads' AND record_id=? AND state='trashed' LIMIT 1").bind(String(leadId || "")).first();
    if (!row) return false;
    const t = iso(nowMs), prior = JSON.parse(row.prior_json || "{}");
    const r = await env.DB.batch([
      env.DB.prepare("UPDATE cleanup_trash SET state='restored',restored_by='customer_inbound',restored_at=? WHERE id=? AND state='trashed'").bind(t, row.id),
      env.DB.prepare("UPDATE leads SET stage=?,updated_at=? WHERE id=? AND stage='archived' AND EXISTS(SELECT 1 FROM cleanup_trash c WHERE c.id=? AND c.state='restored')").bind(prior.v, t, String(leadId), row.id),
      env.DB.prepare("INSERT INTO system_events VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(), "cleanup_lead_revived", "info", "A customer message brought a lead back from Trash", JSON.stringify({ lead_id: String(leadId) }), t)
    ]);
    return !!r?.[0]?.meta?.changes;
  } catch { return false; }
}

// A restored lead must not get an automatic follow-up that was due while it was in Trash: the owner looks at it first.
export async function cleanupRecentlyRestored(env, leadId, nowMs = Date.now(), days = 7) {
  try {
    const row = await env.DB.prepare(`SELECT 1 x FROM cleanup_trash c WHERE c.state='restored' AND c.restored_by<>'customer_inbound' AND c.restored_at>=? AND (
      (c.section='leads' AND c.record_id=?) OR (c.section IN ('conversations','context') AND c.record_id IN (SELECT id FROM lead_conversations WHERE lead_id=?)) OR (c.section='inbox' AND c.record_id IN (SELECT id FROM inbox_messages WHERE lead_id=?))) LIMIT 1`).bind(iso(nowMs - days * 86400000), String(leadId), String(leadId), String(leadId)).first();
    return !!row;
  } catch { return await storeReady(env); }
}

// ---- Test data. Evidence only: a name alone is never enough, and nothing here changes a record.
const PROGRAMMING = /```|\b(?:console\.log|function\s*\(|def\s+\w+\(|import\s+\w+|select\s+.+\s+from|python|javascript|typescript|html|css|sql|regex|json|api\s*key|system\s*prompt|prompt)\b/i;
const TEST_WORD = /(?:^|[^\p{L}])(?:test|testing|qa|تست|آزمایش|آزمایشی)(?:$|[^\p{L}])/iu;
export function classifyTestEvidence({ name = "", messages = [], paidOrders = 0 } = {}) {
  const prog = messages.filter(m => PROGRAMMING.test(String(m || ""))).length, word = messages.filter(m => TEST_WORD.test(String(m || ""))).length;
  const signals = [];
  if (prog) signals.push({ code: "programming_prompt", count: prog });
  if (word) signals.push({ code: "explicit_test_wording", count: word });
  const ownerNamed = String(name).trim().toLowerCase() === "mil";
  if (ownerNamed && signals.length) signals.push({ code: "owner_named_test_customer", count: 1 });
  // two independent signals, and a paying customer is never a candidate by wording
  const candidate = signals.length >= 2 && !paidOrders;
  return { candidate, signals, owner_named: ownerNamed, manual_only: true, reason_blocked: paidOrders ? "paid_order" : null };
}

export async function cleanupTestCandidates(env, nowMs = Date.now()) {
  await requireStore(env);
  const leads = await rows(env, "SELECT l.id,l.name,l.stage FROM leads l WHERE EXISTS(SELECT 1 FROM inbox_messages i WHERE i.lead_id=l.id) AND l.stage<>'archived' LIMIT 100");
  const s = CLEANUP_SECTIONS.leads, out = [];
  for (const l of leads) {
    const msgs = (await rows(env, "SELECT message FROM inbox_messages WHERE lead_id=? ORDER BY created_at DESC LIMIT 200", [l.id])).map(r => r.message);
    const paid = Number((await env.DB.prepare("SELECT COUNT(*) n FROM lead_orders WHERE lead_id=? AND status NOT IN ('cancelled')").bind(l.id).first())?.n || 0);
    const c = classifyTestEvidence({ name: l.name, messages: msgs, paidOrders: paid });
    if (!c.candidate && !c.owner_named) continue;
    const blockRow = await env.DB.prepare(`SELECT ${s.block} AS block FROM leads t WHERE t.id=?`).bind(l.id).first();
    const n = async q => Number((await env.DB.prepare(q).bind(l.id).first())?.n || 0);
    out.push({ kind: "lead", id: l.id, name: l.name, stage: l.stage, candidate: c.candidate, owner_named: c.owner_named, signals: c.signals, blocked_by: blockRow?.block || c.reason_blocked || null,
      can_archive: c.candidate && !blockRow?.block, manual_only: true,
      linked: { messages: msgs.length, outreach: await n("SELECT COUNT(*) n FROM lead_outreach WHERE lead_id=?"), open_drafts: await n("SELECT COUNT(*) n FROM lead_outreach WHERE lead_id=? AND status IN ('draft','pending_approval','approved')"), orders: await n("SELECT COUNT(*) n FROM lead_orders WHERE lead_id=?"), open_escalations: await n("SELECT COUNT(*) n FROM owner_escalations WHERE lead_id=? AND status='open'") } });
  }
  const unlinked = Number((await env.DB.prepare("SELECT COUNT(*) n FROM inbox_messages WHERE lead_id IS NULL AND conversation_id IS NULL AND COALESCE(provider_sender_id,'')='' AND status<>'trashed'").first())?.n || 0);
  const obsolete = Number((await env.DB.prepare(`SELECT COUNT(*) n FROM autonomy_tasks t WHERE t.status='failed' AND COALESCE(t.finished_at,t.updated_at)<? AND ${notTrashed("tasks")}`).bind(iso(nowMs - 7 * 86400000)).first())?.n || 0);
  return { ok: true, items: out, groups: [
    { kind: "inbox_without_sender", section: "inbox", count: unlinked, reason: "no_sender_or_conversation" },
    { kind: "obsolete_failed_tasks", section: "tasks", count: obsolete, reason: "failed_over_7_days_ago" }
  ] };
}

export async function handleCleanup(req, env, u, actor = "admin") {
  try {
    const p = u.pathname, body = req.method === "POST" ? await req.json().catch(() => null) : null;
    if (req.method === "POST" && (!body || typeof body !== "object")) return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
    if (p === "/api/cleanup/sections" && req.method === "GET") return Response.json(await cleanupOverview(env));
    if (p === "/api/cleanup/items" && req.method === "GET") return Response.json(await cleanupItems(env, Object.fromEntries(u.searchParams)));
    if (p === "/api/cleanup/test-candidates" && req.method === "GET") return Response.json(await cleanupTestCandidates(env));
    if (p === "/api/cleanup/preview" && req.method === "POST") return Response.json(await cleanupPreview(env, body, actor));
    if (p === "/api/cleanup/execute" && req.method === "POST") return Response.json(await cleanupExecute(env, body, actor));
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  } catch (e) {
    if (e?.status) return Response.json({ ok: false, error: e.message, ...e.extra }, { status: e.status });
    console.error("cleanup_failed", String(e?.message || e).slice(0, 200));
    return Response.json({ ok: false, error: "cleanup_failed" }, { status: 500 });
  }
}
