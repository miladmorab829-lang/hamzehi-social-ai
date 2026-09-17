/**
 * V9.3 REAL DASHBOARD PAGE
 * Uses the existing Worker API routes. No credentials are stored.
 * This module replaces only the dashboard presentation layer.
 */
export function liveDashboardHtml() {
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HAMZEHI SOCIAL AI — Live Control Center</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0b0d10;color:#eef1f5}
.wrap{max-width:1500px;margin:auto;padding:18px}.top{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
h1{font-size:22px;margin:0}.muted{color:#9aa3ad;font-size:13px}.bar{display:flex;gap:8px;flex-wrap:wrap}.btn{border:1px solid #303740;background:#151a20;color:#fff;border-radius:10px;padding:9px 13px;cursor:pointer}.btn:hover{background:#20262d}
input{background:#11161b;color:#fff;border:1px solid #303740;border-radius:9px;padding:9px;min-width:230px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin-top:14px}.card{background:#11151a;border:1px solid #252c34;border-radius:15px;padding:14px}.wide{grid-column:1/-1}.title{font-weight:700;margin-bottom:8px}.value{font-size:28px;font-weight:800}.ok{color:#73e6a4}.bad{color:#ff8c8c}.warn{color:#ffd36a}
pre{white-space:pre-wrap;overflow:auto;max-height:340px;background:#0a0d10;border-radius:10px;padding:10px;font-size:12px}.status{font-size:13px;min-height:20px}
table{width:100%;border-collapse:collapse;font-size:12px}td,th{border-bottom:1px solid #252c34;padding:7px;text-align:right}
.badge{display:inline-block;border:1px solid #39414a;border-radius:999px;padding:3px 7px;margin:2px;font-size:11px}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div><h1>HAMZEHI SOCIAL AI — Live Control Center</h1><div class="muted">اتصال مستقیم به Worker موجود · بدون Worker جدید</div></div>
    <div class="bar">
      <input id="token" type="password" placeholder="ADMIN TOKEN">
      <button class="btn" onclick="saveToken()">ذخیره محلی توکن</button>
      <button class="btn" onclick="refreshAll()">↻ بروزرسانی همه</button>
    </div>
  </div>

  <div class="grid">
    <div class="card"><div class="title">Worker Health</div><div id="health" class="status">در حال بررسی…</div></div>
    <div class="card"><div class="title">D1 / Recovery</div><div id="recovery" class="status">—</div></div>
    <div class="card"><div class="title">Providers</div><div id="providers" class="status">—</div></div>
    <div class="card"><div class="title">Content</div><div id="content" class="value">—</div></div>
    <div class="card"><div class="title">Leads</div><div id="leads" class="value">—</div></div>
    <div class="card"><div class="title">Metrics Rows</div><div id="metrics" class="value">—</div></div>
    <div class="card"><div class="title">Retry Queue</div><div id="retry" class="value">—</div></div>
    <div class="card"><div class="title">Production Runs</div><div id="runs" class="value">—</div></div>
  </div>

  <div class="grid">
    <div class="card wide"><div class="title">Operations Snapshot</div><div id="ops" class="status">—</div></div>
    <div class="card"><div class="title">Approval / Release</div><div id="release" class="status">—</div></div>
    <div class="card"><div class="title">System Events</div><div id="events" class="status">—</div></div>
    <div class="card"><div class="title">Learning</div><div id="learning" class="status">—</div></div>
    <div class="card"><div class="title">Website Growth</div><div id="growth" class="status">—</div></div>
    <div class="card wide"><div class="title">Latest Leads</div><div id="leadTable">—</div></div>
    <div class="card wide"><div class="title">Latest Metrics</div><div id="metricTable">—</div></div>
    <div class="card wide"><div class="title">Raw Diagnostic</div><pre id="raw">—</pre></div>
  </div>
</div>

<script>
const KEY="hamzehi_admin_token_v93";
const $=id=>document.getElementById(id);
$("token").value=localStorage.getItem(KEY)||"";
function saveToken(){localStorage.setItem(KEY,$("token").value); refreshAll();}
function headers(){const t=$("token").value.trim();return t?{"Authorization":"Bearer "+t,"Content-Type":"application/json"}:{"Content-Type":"application/json"};}
async function api(path,opts={}){
  const r=await fetch(path,{...opts,headers:{...headers(),...(opts.headers||{})}});
  const text=await r.text(); let d; try{d=JSON.parse(text)}catch{d={raw:text}};
  if(!r.ok) throw new Error((d&&d.error)||("HTTP "+r.status));
  return d;
}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
function set(id,html,cls=""){ $(id).innerHTML=html; if(cls) $(id).className="status "+cls; }
function table(items,cols){
  if(!Array.isArray(items)||!items.length)return "<span class='muted'>داده‌ای وجود ندارد</span>";
  return "<table><thead><tr>"+cols.map(c=>"<th>"+esc(c[1])+"</th>").join("")+"</tr></thead><tbody>"+
    items.slice(0,15).map(x=>"<tr>"+cols.map(c=>"<td>"+esc(typeof c[0]==="function"?c[0](x):x[c[0]])+"</td>").join("")+"</tr>").join("")+
    "</tbody></table>";
}
async function loadHealth(){
  try{const d=await api("/api/health");set("health","<b class='ok'>ONLINE</b><br>version: "+esc(d.version)+"<br>production: "+esc(d.production)+"<br>approval: "+esc(d.approval_required));return d}
  catch(e){set("health","<b class='bad'>ERROR</b> "+esc(e.message),"bad");throw e}
}
async function loadRecovery(){
  try{const d=await api("/api/recovery/validate");set("recovery",d.ok?"<b class='ok'>PASS</b>":"<b class='bad'>BLOCKED</b><br>"+esc((d.missing||[]).join(", ")));return d}
  catch(e){set("recovery","<b class='warn'>AUTH/ERROR</b><br>"+esc(e.message));}
}
async function loadSettings(){
  try{const d=await api("/api/settings");const p=d.providers||{};set("providers",Object.entries(p).map(([k,v])=>"<span class='badge'>"+esc(k)+": "+(v.configured?"READY":"OFF")+"</span>").join(""));return d}
  catch(e){set("providers",esc(e.message));}
}
async function loadContent(){try{const d=await api("/api/content");set("content",""+(d.items||[]).length);return d}catch(e){set("content","ERR","bad")}}
async function loadLeads(){
  try{const d=await api("/api/leads/overview");const m=d.metrics||d;set("leads",""+(m.total??m.total_leads??0));$("leadTable").innerHTML=table(d.items||d.leads||[],[["name","نام"],["stage","مرحله"],["priority","اولویت"],["score","امتیاز"]]);return d}
  catch(e){set("leads","ERR","bad");$("leadTable").textContent=e.message;}
}
async function loadMetrics(){try{const d=await api("/api/metrics");set("metrics",""+(d.items||[]).length);$("metricTable").innerHTML=table(d.items||[],[["metric_date","date"],["platform","platform"],["impressions","impressions"],["engagements","engagements"],["leads","leads"],["conversions","conversions"]]);return d}catch(e){set("metrics","ERR","bad")}}
async function loadRetry(){try{const d=await api("/api/retry");set("retry",""+(d.items||[]).length);return d}catch(e){set("retry","ERR","bad")}}
async function loadRuns(){try{const d=await api("/api/production/runs");set("runs",""+(d.items||[]).length);return d}catch(e){set("runs","ERR","bad")}}
async function loadRelease(){try{const d=await api("/api/release/checks");const pass=(d.items||[]).filter(x=>x.status==="PASS").length;set("release",pass+" PASS / "+(d.items||[]).length+" checks");return d}catch(e){set("release",esc(e.message))}}
async function loadEvents(){try{const d=await api("/api/system/events");set("events",(d.items||[]).slice(0,5).map(x=>"<div>"+esc(x.severity)+" · "+esc(x.type)+"</div>").join("")||"بدون رویداد");return d}catch(e){set("events",esc(e.message))}}
async function loadLearning(){try{const d=await api("/api/learning/status");set("learning","<b class='ok'>READY</b><pre>"+esc(JSON.stringify(d,null,2))+"</pre>");return d}catch(e){set("learning",esc(e.message))}}
async function loadGrowth(){try{const d=await api("/api/website/growth");set("growth","<pre>"+esc(JSON.stringify(d,null,2))+"</pre>");return d}catch(e){set("growth",esc(e.message))}}
async function refreshAll(){
  const results={};
  for(const fn of [loadHealth,loadRecovery,loadSettings,loadContent,loadLeads,loadMetrics,loadRetry,loadRuns,loadRelease,loadEvents,loadLearning,loadGrowth]){
    try{results[fn.name]=await fn()}catch(e){results[fn.name]={error:e.message}}
  }
  $("ops").innerHTML="<b>Live API calls completed:</b> "+Object.keys(results).length+
    "<br><span class='muted'>این پنل فقط APIهای موجود Worker را مصرف می‌کند؛ هیچ deploy/secret/DNS/R2 action از این صفحه انجام نمی‌شود.</span>";
  $("raw").textContent=JSON.stringify(results,null,2);
}
refreshAll();
</script>
</body>
</html>`;
}
