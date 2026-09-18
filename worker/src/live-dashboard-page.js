/**
 * HAMZEHI SOCIAL AI — V9.4 Professional Persian Operations Dashboard
 * Presentation layer only. Uses existing Worker API routes.
 * No Worker/route/secret/DNS/R2 changes.
 */
export function liveDashboardHtml() {
return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#080b10">
<title>HAMZEHI SOCIAL AI — مرکز فرمان</title>
<style>
:root{color-scheme:dark;--bg:#080b10;--panel:#10151d;--panel2:#151b24;--line:#27313d;--text:#eef3f8;--muted:#8e9aa8;--ok:#62e6a0;--warn:#ffd166;--bad:#ff7d88;--accent:#8fb8ff;--shadow:0 14px 40px #0007}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:radial-gradient(1000px 500px at 80% -10%,#1a2940 0,#080b10 55%);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Tahoma,Arial,sans-serif}
button,input,select{font:inherit}.app{display:flex;min-height:100vh}.side{position:sticky;top:0;height:100vh;width:250px;padding:20px 14px;background:#0c1118eF;border-left:1px solid var(--line);backdrop-filter:blur(18px);z-index:5}.brand{padding:10px 10px 18px;border-bottom:1px solid var(--line);margin-bottom:12px}.brand b{display:block;font-size:18px}.brand span{display:block;color:var(--muted);font-size:11px;margin-top:5px}.nav button{width:100%;text-align:right;border:1px solid transparent;background:transparent;color:#cbd3dd;border-radius:11px;padding:10px 12px;margin:3px 0;cursor:pointer}.nav button:hover,.nav button.active{background:var(--panel2);border-color:var(--line);color:#fff}.main{flex:1;min-width:0;padding:22px;max-width:1700px;margin:auto}.top{display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap}.eyebrow{font-size:10px;letter-spacing:1.5px;color:#8fb8ff;font-weight:800;margin-bottom:5px}.command-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}.command-card{background:linear-gradient(180deg,#151d29,#10151c);border:1px solid #2a3746;border-radius:14px;padding:12px}.command-card span{display:block;color:#8794a3;font-size:11px}.command-card b{display:block;font-size:18px;margin-top:4px}.command-card small{display:block;color:#667281;font-size:10px;margin-top:3px}.pipeline-card{overflow:hidden}.pipeline{display:flex;align-items:stretch;gap:7px;overflow:auto;padding:3px 2px 8px}.pipeline>div{min-width:118px;border:1px solid #2a3541;background:#0d131a;border-radius:12px;padding:10px}.pipeline b{display:inline-flex;width:24px;height:24px;align-items:center;justify-content:center;border-radius:8px;background:#172334;color:#9fc2ff;font-size:11px}.pipeline span{display:block;font-weight:750;font-size:12px;margin-top:7px}.pipeline small{display:block;color:#778391;font-size:10px;margin-top:3px}.pipeline i{align-self:center;color:#536172;font-style:normal}.title h1{font-size:25px;margin:0 0 5px}.title p{margin:0;color:var(--muted);font-size:13px}.tools{display:flex;gap:8px;flex-wrap:wrap}.input,.btn{background:var(--panel);border:1px solid var(--line);color:#fff;border-radius:10px;padding:10px 12px}.input{min-width:250px}.btn{cursor:pointer}.btn:hover{background:#1b232d}.btn.primary{border-color:#405d8a;background:#16243a}.btn.danger{border-color:#70404a}.section{margin-top:22px;scroll-margin-top:15px}.section-head{display:flex;justify-content:space-between;align-items:end;gap:10px;margin-bottom:10px}.section-head h2{font-size:17px;margin:0}.hint{color:var(--muted);font-size:12px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.card{background:linear-gradient(180deg,#121821,#0e131a);border:1px solid var(--line);border-radius:16px;padding:15px;box-shadow:var(--shadow);min-width:0}.stat .label{color:var(--muted);font-size:12px}.stat .num{font-size:30px;font-weight:800;margin-top:7px}.status{font-size:13px;line-height:1.8}.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}.muted{color:var(--muted)}.wide{grid-column:1/-1}.half{grid-column:span 2}.cards2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{border:1px solid var(--line);background:#0b1016;border-radius:999px;padding:5px 9px;font-size:11px;color:#cdd6df}.chip.ok{border-color:#285b46}.chip.bad{border-color:#6b3940}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:12px}table{width:100%;border-collapse:collapse;min-width:680px;font-size:12px}th,td{padding:10px;border-bottom:1px solid #202832;text-align:right;vertical-align:top}th{color:#aab5c2;background:#0d1218;position:sticky;top:0}tr:hover td{background:#111820}.row-actions{display:flex;gap:6px;flex-wrap:wrap}.mini{padding:6px 8px;font-size:11px;border-radius:8px}.empty{padding:25px;text-align:center;color:var(--muted)}pre{white-space:pre-wrap;word-break:break-word;max-height:360px;overflow:auto;background:#080c11;border:1px solid #1d252e;border-radius:11px;padding:12px;font-size:11px;direction:ltr;text-align:left}.progress{height:7px;background:#202733;border-radius:99px;overflow:hidden}.progress i{display:block;height:100%;background:var(--accent);width:0}.toast{position:fixed;bottom:18px;left:18px;right:18px;max-width:520px;margin:auto;padding:12px 14px;border:1px solid var(--line);background:#10161fF5;border-radius:12px;display:none;z-index:20}.mobile-nav{display:none}.search{width:100%;margin:8px 0 12px}
@media(max-width:1050px){.grid{grid-template-columns:repeat(2,1fr)}.side{width:210px}.command-strip{grid-template-columns:repeat(2,1fr)}}
@media(max-width:760px){.command-strip{grid-template-columns:1fr 1fr}.pipeline{padding-bottom:12px}.app{display:block}.side{display:none}.main{padding:14px 12px 78px}.grid,.cards2{grid-template-columns:1fr}.half{grid-column:auto}.mobile-nav{display:flex;position:fixed;bottom:0;left:0;right:0;background:#0b1017F5;border-top:1px solid var(--line);z-index:10;overflow:auto}.mobile-nav button{flex:1;min-width:105px;border:0;background:transparent;color:#b8c2ce;padding:12px 8px;font-size:11px}.mobile-nav button.active{color:#fff;background:#151c25}.input{min-width:0;width:100%}.top{align-items:stretch}.tools{width:100%}.tools .btn{flex:1}}
</style>
</head>
<body>
<div class="app">
<aside class="side">
  <div class="brand"><b>HAMZEHI SOCIAL AI</b><span>مرکز فرمان و نظارت عملیاتی · V9.4</span></div>
  <nav class="nav">
    <button class="active" data-go="overview">🏠 نمای کلی</button>
    <button data-go="telegram">✈️ تلگرام و صندوق ورودی</button>
    <button data-go="content">✍️ محتوا و انتشار</button>
    <button data-go="crm">👤 مشتری و سرنخ فروش</button>
    <button data-go="calendar">📅 تقویم و کمپین</button>
    <button data-go="analytics">📊 آمار و رشد</button>
    <button data-go="operations">⚙️ عملیات و خطا</button>
    <button data-go="audit">🧾 گزارش فعالیت</button>
    <button data-go="diagnostic">🩺 عیب‌یابی فنی</button>
  </nav>
</aside>
<main class="main">
<header class="top">
  <div class="title">
    <div class="eyebrow">HAMZEHI SOCIAL AI · OPERATION CENTER</div>
    <h1>مرکز فرمان سیستم خودکار</h1>
    <p>سیستم کارهای روزمره را خودش جلو می‌برد؛ تو فقط وضعیت، خروجی، خطاها و مواردی را که نیاز به تصمیم انسانی دارند می‌بینی.</p>
  </div>
  <div class="tools">
    <input id="token" class="input" type="password" placeholder="توکن مدیریت (فقط روی این دستگاه)">
    <button class="btn" id="save">ذخیره محلی</button>
    <button class="btn primary" id="refresh">↻ بروزرسانی</button>
  </div>
</header>
<div class="command-strip">
  <div class="command-card"><span>وضعیت سیستم</span><b id="overallState">در حال بررسی…</b><small id="lastRefresh">—</small></div>
  <div class="command-card"><span>نیازمند توجه</span><b id="attentionCount">—</b><small>بر اساس داده‌های زنده</small></div>
  <div class="command-card"><span>چرخه خودکار</span><b>۱۰ مرحله</b><small>برنامه‌ریزی تا بهینه‌سازی</small></div>
  <div class="command-card"><span>هدف معماری</span><b>۹۵٪ خودکار</b><small>این عدد «هدف طراحی» است، نه درصد اندازه‌گیری‌شده</small></div>
</div>

<section id="overview" class="section">
<div class="section-head"><div><h2>وضعیت لحظه‌ای</h2><div class="hint">اطلاعات از APIهای واقعی Worker خوانده می‌شود.</div></div></div>
<div class="grid">
  <div class="card stat"><div class="label">وضعیت Worker</div><div id="health" class="status">در حال بررسی…</div></div>
  <div class="card stat"><div class="label">پایگاه داده و بازیابی</div><div id="recovery" class="status">—</div></div>
  <div class="card stat"><div class="label">تأیید انتشار</div><div id="release" class="status">—</div></div>
  <div class="card stat"><div class="label">یادگیری خودکار</div><div id="learning" class="status">—</div></div>
  <div class="card stat"><div class="label">محتوا</div><div id="contentCount" class="num">—</div></div>
  <div class="card stat"><div class="label">سرنخ‌های فروش</div><div id="leadCount" class="num">—</div></div>
  <div class="card stat"><div class="label">پیام‌های ورودی</div><div id="inboxCount" class="num">—</div></div>
  <div class="card stat"><div class="label">کارهای در صف خطا</div><div id="retryCount" class="num">—</div></div>
</div>
<div class="cards2 section">
  <div class="card">
    <div class="section-head"><div><h2>اتصال سرویس‌ها</h2><div class="hint">وضعیت تنظیمات سرویس‌ها؛ «آماده» با «تست موفق» یکی نیست.</div></div></div>
    <div id="providers" class="chips">—</div>
  </div>
  <div class="card">
    <div class="section-head"><div><h2>نیازمند توجه</h2><div class="hint">فقط مواردی که از داده‌های واقعی پنل قابل تشخیص‌اند.</div></div></div>
    <div id="attentionList" class="status">—</div>
  </div>
</div>
<div class="card section pipeline-card">
  <div class="section-head"><div><h2>سیستم دقیقاً چه کار می‌کند؟</h2><div class="hint">این نقشه، ترتیب معماری چرخه محتوا را ساده و قابل فهم نشان می‌دهد.</div></div></div>
  <div class="pipeline">
    <div><b>۱</b><span>برنامه‌ریزی</span><small>هدف و موضوع</small></div>
    <i>←</i><div><b>۲</b><span>تولید</span><small>محتوا با AI</small></div>
    <i>←</i><div><b>۳</b><span>اعتبارسنجی</span><small>کنترل داده</small></div>
    <i>←</i><div><b>۴</b><span>ذخیره</span><small>ثبت در D1</small></div>
    <i>←</i><div><b>۵</b><span>تأیید</span><small>مرز انسانی</small></div>
    <i>←</i><div><b>۶</b><span>زمان‌بندی</span><small>تقویم</small></div>
    <i>←</i><div><b>۷</b><span>انتشار</span><small>کانال مجاز</small></div>
    <i>←</i><div><b>۸</b><span>راستی‌آزمایی</span><small>نتیجه انتشار</small></div>
    <i>←</i><div><b>۹</b><span>تحلیل</span><small>داده عملکرد</small></div>
    <i>←</i><div><b>۱۰</b><span>بهینه‌سازی</span><small>یادگیری</small></div>
  </div>
</div>
<div class="card section">
  <div class="section-head"><div><h2>خلاصه عملیات</h2><div class="hint">جمع‌بندی انسانی؛ برای فهم سریع، نه جایگزین لاگ فنی.</div></div></div>
  <div id="summary" class="status">—</div>
</div>
</section>

<section id="telegram" class="section">
<div class="section-head"><div><h2>✈️ تلگرام و صندوق ورودی</h2><div class="hint">پیام‌هایی که Worker دریافت کرده، وضعیت رسیدگی و زمان دریافت.</div></div><button class="btn mini" data-load="inbox">بروزرسانی</button></div>
<div class="card"><input id="inboxSearch" class="input search" placeholder="جست‌وجو در فرستنده، متن پیام، شناسه…"><div id="inboxTable">در حال بارگذاری…</div></div>
</section>

<section id="content" class="section">
<div class="section-head"><div><h2>✍️ محتوا، تأیید و انتشار</h2><div class="hint">مسیر محتوا: برنامه‌ریزی → تولید → بررسی → تأیید → زمان‌بندی → انتشار → تحلیل.</div></div><button class="btn mini" data-load="content">بروزرسانی</button></div>
<div class="card"><input id="contentSearch" class="input search" placeholder="جست‌وجوی موضوع، پلتفرم یا وضعیت…"><div id="contentTable">در حال بارگذاری…</div></div>
</section>

<section id="crm" class="section">
<div class="section-head"><div><h2>👤 مشتری و سرنخ فروش</h2><div class="hint">مراحل ارتباط، اولویت، امتیاز و اطلاعات ثبت‌شده.</div></div><button class="btn mini" data-load="leads">بروزرسانی</button></div>
<div class="card"><input id="leadSearch" class="input search" placeholder="جست‌وجوی نام، تماس، مرحله یا یادداشت…"><div id="leadTable">در حال بارگذاری…</div></div>
</section>

<section id="calendar" class="section">
<div class="section-head"><div><h2>📅 تقویم و کمپین</h2><div class="hint">زمان‌بندی محتوا و وضعیت کمپین‌ها.</div></div></div>
<div class="cards2">
 <div class="card"><h2>تقویم محتوا</h2><div id="calendarTable">در حال بارگذاری…</div></div>
 <div class="card"><h2>کمپین‌ها</h2><div id="campaignTable">در حال بارگذاری…</div></div>
</div>
</section>

<section id="analytics" class="section">
<div class="section-head"><div><h2>📊 آمار و رشد</h2><div class="hint">اعداد خام و گزارش رشد؛ بدون ساختن عدد فرضی.</div></div></div>
<div class="cards2">
 <div class="card"><h2>شاخص‌های شبکه‌های اجتماعی</h2><div id="metricsTable">در حال بارگذاری…</div></div>
 <div class="card"><h2>رشد وب‌سایت</h2><div id="growth">در حال بارگذاری…</div></div>
</div>
</section>

<section id="operations" class="section">
<div class="section-head"><div><h2>⚙️ عملیات، صف خطا و بازیابی</h2><div class="hint">برای هر خطا باید علت، وضعیت تلاش مجدد و نتیجه قابل مشاهده باشد.</div></div></div>
<div class="cards2">
 <div class="card"><h2>صف Retry</h2><div id="retryTable">در حال بارگذاری…</div></div>
 <div class="card"><h2>اجراهای تولید</h2><div id="runsTable">در حال بارگذاری…</div></div>
</div>
</section>

<section id="audit" class="section">
<div class="section-head"><div><h2>🧾 گزارش فعالیت سیستم</h2><div class="hint">آخرین رویدادهای ثبت‌شده در system_events.</div></div><button class="btn mini" data-load="events">بروزرسانی</button></div>
<div class="card"><div id="eventsTable">در حال بارگذاری…</div></div>
</section>

<section id="diagnostic" class="section">
<div class="section-head"><div><h2>🩺 عیب‌یابی فنی</h2><div class="hint">داده خام برای بررسی دقیق؛ بدون نمایش Secretها.</div></div></div>
<div class="card"><pre id="raw">—</pre></div>
</section>
</main>
</div>
<div id="toast" class="toast"></div>
<div class="mobile-nav">
<button class="active" data-go="overview">خانه</button><button data-go="telegram">تلگرام</button><button data-go="content">محتوا</button><button data-go="crm">فروش</button><button data-go="operations">عملیات</button>
</div>
<script>
const KEY="hamzehi_admin_token_v94";
const $=id=>document.getElementById(id);
$("token").value=localStorage.getItem(KEY)||"";
let cache={inbox:[],content:[],leads:[],calendar:[],campaigns:[],metrics:[],retry:[],runs:[],events:[]};
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
function toast(s){const t=$("toast");t.textContent=s;t.style.display="block";clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.style.display="none",2800);}
function headers(){const t=$("token").value.trim();return t?{"Authorization":"Bearer "+t,"Content-Type":"application/json"}:{"Content-Type":"application/json"};}
async function api(path,opts={}){const r=await fetch(path,{...opts,headers:{...headers(),...(opts.headers||{})}});const tx=await r.text();let d;try{d=JSON.parse(tx)}catch{d={raw:tx}}if(!r.ok)throw Error(d?.error||("HTTP "+r.status));return d;}
function arr(d,...keys){for(const k of keys)if(Array.isArray(d?.[k]))return d[k];return[];}
function val(x,...keys){for(const k of keys){if(x?.[k]!==undefined&&x?.[k]!==null)return x[k]}return"";}
function fmt(v){if(!v)return"—";try{return new Date(v).toLocaleString("fa-IR",{dateStyle:"short",timeStyle:"short"})}catch{return v}}
function table(items,cols,actions){if(!items.length)return"<div class='empty'>داده‌ای برای نمایش وجود ندارد.</div>";return"<div class='table-wrap'><table><thead><tr>"+cols.map(c=>"<th>"+esc(c[1])+"</th>").join("")+(actions?"<th>عملیات</th>":"")+"</tr></thead><tbody>"+items.slice(0,200).map(x=>"<tr>"+cols.map(c=>"<td>"+esc(typeof c[0]==="function"?c[0](x):val(x,c[0]))+"</td>").join("")+(actions?"<td><div class='row-actions'>"+actions(x)+"</div></td>":"")+"</tr>").join("")+"</tbody></table></div>";}
function set(id,h){$(id).innerHTML=h}
async function loadHealth(){try{const d=await api("/api/health");set("health","<b class='ok'>● آنلاین</b><br><span class='muted'>نسخه: "+esc(d.version)+"<br>محیط تولید: "+(d.production?"بله":"خیر")+"<br>تأیید انتشار: "+(d.approval_required?"فعال":"غیرفعال")+"</span>");return d}catch(e){set("health","<b class='bad'>● خطا</b><br>"+esc(e.message));throw e}}
async function loadRecovery(){try{const d=await api("/api/recovery/validate");set("recovery",d.ok?"<b class='ok'>● سالم</b>":"<b class='bad'>● مسدود</b>");return d}catch(e){set("recovery","<b class='warn'>احراز هویت/خطا</b><br>"+esc(e.message));return{error:e.message}}}
async function loadSettings(){try{const d=await api("/api/settings");const p=d.providers||{};set("providers",Object.entries(p).map(([k,v])=>"<span class='chip "+(v.configured?"ok":"bad")+"'>"+esc(k)+" · "+(v.configured?"آماده":"تنظیم نشده")+"</span>").join("")||"<span class='muted'>اطلاعاتی برنگشت.</span>");return d}catch(e){set("providers","<span class='bad'>"+esc(e.message)+"</span>");return{error:e.message}}}
async function loadContent(){try{const d=await api("/api/content");cache.content=arr(d,"items");$("contentCount").textContent=cache.content.length;renderContent();return d}catch(e){$("contentCount").textContent="ERR";set("contentTable","خطا: "+esc(e.message));return{error:e.message}}}
function renderContent(){const q=$("contentSearch").value.trim().toLowerCase();const a=cache.content.filter(x=>JSON.stringify(x).toLowerCase().includes(q));set("contentTable",table(a,[["title","عنوان"],["platform","پلتفرم"],["status","وضعیت"],[x=>fmt(val(x,"created_at","updated_at")),"تاریخ"]],x=>"<span class='muted'>شناسه: "+esc(x.id||"")+"</span>"))}
async function loadInbox(){try{const d=await api("/api/inbox");cache.inbox=arr(d,"items");$("inboxCount").textContent=cache.inbox.length;renderInbox();return d}catch(e){$("inboxCount").textContent="ERR";set("inboxTable","خطا: "+esc(e.message));return{error:e.message}}}
function renderInbox(){const q=$("inboxSearch").value.trim().toLowerCase();const a=cache.inbox.filter(x=>JSON.stringify(x).toLowerCase().includes(q));set("inboxTable",table(a,[["platform","کانال"],[x=>val(x,"sender_name","from_name","sender","username"),"فرستنده"],[x=>val(x,"text","message","body","content"),"پیام"],["status","وضعیت"],[x=>fmt(val(x,"created_at","received_at","updated_at")),"دریافت"]],x=>"<span class='muted'>"+esc(x.id||"")+"</span>"))}
async function loadLeads(){try{const d=await api("/api/leads");cache.leads=arr(d,"items");$("leadCount").textContent=cache.leads.length;renderLeads();return d}catch(e){$("leadCount").textContent="ERR";set("leadTable","خطا: "+esc(e.message));return{error:e.message}}}
function leadScore(x){if(x?.score!==undefined&&x?.score!==null)return x.score;try{const n=JSON.parse(x?.notes||"{}");return n.score??"—"}catch{return"—"}}
function renderLeads(){const q=$("leadSearch").value.trim().toLowerCase();const a=cache.leads.filter(x=>JSON.stringify(x).toLowerCase().includes(q));set("leadTable",table(a,[["name","نام"],["contact","تماس/آدرس"],["stage","مرحله"],["priority","اولویت"],[leadScore,"امتیاز"],[x=>fmt(val(x,"updated_at","created_at")),"آخرین تغییر"]],x=>"<span class='muted'>"+esc(x.id||"")+"</span>"))}
async function loadCalendar(){try{const d=await api("/api/calendar");cache.calendar=arr(d,"items");set("calendarTable",table(cache.calendar,[["planned_at","زمان"],["content_id","شناسه محتوا"],["status","وضعیت"],["campaign_id","کمپین"]]));return d}catch(e){set("calendarTable","خطا: "+esc(e.message));return{error:e.message}}}
async function loadCampaigns(){try{const d=await api("/api/campaigns");cache.campaigns=arr(d,"items");set("campaignTable",table(cache.campaigns,[["name","نام"],["goal","هدف"],["audience","مخاطب"],["status","وضعیت"],[x=>fmt(x.created_at),"ایجاد"]]));return d}catch(e){set("campaignTable","خطا: "+esc(e.message));return{error:e.message}}}
async function loadMetrics(){try{const d=await api("/api/metrics");cache.metrics=arr(d,"items");set("metricsTable",table(cache.metrics,[["metric_date","تاریخ"],["platform","پلتفرم"],["impressions","نمایش"],["engagements","تعامل"],["leads","سرنخ"],["conversions","تبدیل"]]));return d}catch(e){set("metricsTable","خطا: "+esc(e.message));return{error:e.message}}}
async function loadGrowth(){try{const d=await api("/api/website/growth");set("growth","<pre>"+esc(JSON.stringify(d,null,2))+"</pre>");return d}catch(e){set("growth","<span class='bad'>"+esc(e.message)+"</span>");return{error:e.message}}}
async function loadRetry(){try{const d=await api("/api/retry");cache.retry=arr(d,"items");$("retryCount").textContent=cache.retry.length;set("retryTable",table(cache.retry,[["type","نوع"],["status","وضعیت"],[x=>val(x,"attempts","retry_count"),"تلاش"],[x=>fmt(val(x,"next_attempt_at","updated_at","created_at")),"زمان بعدی"]]));return d}catch(e){$("retryCount").textContent="ERR";set("retryTable","خطا: "+esc(e.message));return{error:e.message}}}
async function loadRuns(){try{const d=await api("/api/production/runs");cache.runs=arr(d,"items");set("runsTable",table(cache.runs,[["status","وضعیت"],["stage","مرحله"],[x=>fmt(val(x,"started_at","created_at")),"شروع"],[x=>fmt(val(x,"finished_at","updated_at")),"پایان"]]));return d}catch(e){set("runsTable","خطا: "+esc(e.message));return{error:e.message}}}
async function loadRelease(){try{const d=await api("/api/release/checks");const a=arr(d,"items");const pass=a.filter(x=>String(x.status).toUpperCase()==="PASS").length;set("release","<b class='"+(pass===a.length?"ok":"warn")+"'>"+pass+" مورد موفق</b><br><span class='muted'>از "+a.length+" بررسی ثبت‌شده</span>");return d}catch(e){set("release","<span class='bad'>"+esc(e.message)+"</span>");return{error:e.message}}}
async function loadEvents(){try{const d=await api("/api/system/events");cache.events=arr(d,"items");set("eventsTable",table(cache.events,[["severity","سطح"],["type","نوع رویداد"],["message","شرح"],[x=>fmt(x.created_at),"زمان"]]));return d}catch(e){set("eventsTable","خطا: "+esc(e.message));return{error:e.message}}}
async function loadLearning(){try{const d=await api("/api/learning/status");set("learning",d.enabled?"<b class='ok'>● فعال</b><br><span class='muted'>دوره: "+esc(val(d,"interval_hours"))+" ساعت</span>":"<b class='warn'>غیرفعال</b>");return d}catch(e){set("learning","<span class='bad'>خطا</span>");return{error:e.message}}}
async function refreshAll(){
  const out={};const fns=[loadHealth,loadRecovery,loadSettings,loadContent,loadInbox,loadLeads,loadCalendar,loadCampaigns,loadMetrics,loadGrowth,loadRetry,loadRuns,loadRelease,loadEvents,loadLearning];
  for(const fn of fns){try{out[fn.name]=await fn()}catch(e){out[fn.name]={error:e.message}}}
  const ok=Object.values(out).filter(x=>x&&!x.error).length;
  const retryN=cache.retry.length;
  const missingProviders=Object.values(out.loadSettings?.providers||{}).filter(x=>x && x.configured===false).length;
  const attention=(retryN?1:0)+(missingProviders?1:0)+(out.loadRecovery?.error?1:0);
  $("attentionCount").textContent=attention;
  $("overallState").textContent=attention?"نیازمند توجه":"عملیات عادی";
  $("overallState").className=attention?"warn":"ok";
  $("lastRefresh").textContent="آخرین بروزرسانی: "+new Date().toLocaleTimeString("fa-IR");
  set("attentionList",attention
    ? "<b class='warn'>"+attention+" مورد قابل بررسی</b><br><span class='muted'>"+(retryN?"صف Retry دارای مورد است. ":"")+(missingProviders?"یک یا چند Provider تنظیم نشده است. ":"")+(out.loadRecovery?.error?"بازیابی/احراز هویت پاسخ کامل نداده است. ":"")+"</span>"
    : "<b class='ok'>✓ مورد فوری قابل تشخیص نیست</b><br><span class='muted'>وضعیت بر اساس داده‌های فعلی APIها محاسبه شد.</span>");
  set("summary","<b>"+ok+" بخش از "+fns.length+" بخش</b> با API زنده پاسخ دادند.<br><span class='muted'>این صفحه فقط APIهای موجود Worker را مصرف می‌کند و هیچ deploy، Secret، DNS یا R2 انجام نمی‌دهد.</span>");
  $("raw").textContent=JSON.stringify(out,null,2);toast("داده‌های زنده بروزرسانی شد");
}
function go(id){document.getElementById(id)?.scrollIntoView({behavior:"smooth",block:"start"});document.querySelectorAll("[data-go]").forEach(b=>b.classList.toggle("active",b.dataset.go===id));}
document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
$("save").onclick=()=>{localStorage.setItem(KEY,$("token").value.trim());toast("توکن فقط روی همین دستگاه ذخیره شد.");refreshAll()};
$("refresh").onclick=refreshAll;
document.querySelectorAll("[data-load]").forEach(b=>b.onclick=()=>{const m={inbox:loadInbox,content:loadContent,leads:loadLeads,events:loadEvents};m[b.dataset.load]?.()});
$("inboxSearch").oninput=renderInbox;$("contentSearch").oninput=renderContent;$("leadSearch").oninput=renderLeads;
refreshAll();
</script>
</body>
</html>`;
}
