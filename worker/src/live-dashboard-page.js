export function liveDashboardHtml(){
return `<!doctype html><html lang="fa" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HAMZEHI SOCIAL AI · Command Center</title>
<style>
:root{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#06080d;color:#eef2f7}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 80% -10%,#1c2943 0,#090d15 42%,#06080d 100%);min-height:100vh}
.wrap{max-width:1500px;margin:auto;padding:18px}.top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}
.ey{font-size:10px;letter-spacing:.22em;color:#8793a7}.brand{font-size:30px;font-weight:900;margin:6px 0}.sub{font-size:12px;color:#9ba7ba;line-height:1.9}.pill{border:1px solid #2b374b;background:#0b111a;border-radius:999px;padding:8px 12px;white-space:nowrap}
.ok{color:#7ae1ad}.warn{color:#ffd278}.bad{color:#ff8796}.muted{color:#7f8b9f}.section{margin-top:13px}.card{background:rgba(11,16,24,.94);border:1px solid #202b3b;border-radius:17px;padding:15px;box-shadow:0 16px 50px rgba(0,0,0,.2)}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.grid2{display:grid;grid-template-columns:1.25fr .75fr;gap:12px}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.k{font-size:10px;letter-spacing:.08em;color:#8793a6}.num{font-size:27px;font-weight:900;margin-top:5px}.title{display:flex;justify-content:space-between;gap:12px;align-items:center}.title h2{font-size:16px;margin:0}.hint{font-size:11px;color:#8793a6;line-height:1.8}
.tools{display:flex;flex-wrap:wrap;gap:7px}.btn{border:1px solid #2a3648;background:#111823;color:#eef2f6;border-radius:10px;padding:9px 12px;cursor:pointer;font-weight:700}.btn:hover{border-color:#68768d}.primary{background:#e9edf4;color:#070a0f}.danger{border-color:#713342}.input{width:100%;background:#080d15;color:#fff;border:1px solid #2b3749;border-radius:11px;padding:12px;outline:none}
.command{display:grid;grid-template-columns:1fr auto;gap:8px}.examples{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:9px}.example{border:1px solid #202c3c;border-radius:10px;padding:9px;background:#0a0f17;cursor:pointer}.example b{font-size:11px;display:block}.example span{font-size:10px;color:#7f8b9f}
.channels{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.channel{min-height:165px;position:relative}.channel .head{display:flex;justify-content:space-between;align-items:center}.channel .state{font-size:10px;border:1px solid #293548;border-radius:999px;padding:4px 7px}.channel h3{margin:9px 0 4px;font-size:15px}.channel p{margin:0;font-size:10px;color:#7f8b9f;line-height:1.7}.channel .actions{display:flex;gap:6px;margin-top:12px}.mini{font-size:10px;color:#8b97a9}.switch{accent-color:#dce5f2}
.rows{display:grid;gap:6px;margin-top:9px}.row{border:1px solid #202b3b;border-radius:10px;padding:8px;background:#090e16;font-size:11px;line-height:1.7}.row small{display:block;color:#69758a;font-size:9px}.tag{display:inline-block;border:1px solid #293548;border-radius:999px;padding:3px 7px;font-size:9px;margin:2px}
.progress{height:7px;background:#1b2432;border-radius:99px;overflow:hidden;margin-top:8px}.progress i{display:block;height:100%;background:#d7e0ef;width:0}
.timeline{max-height:360px;overflow:auto}.dangerbox{border-color:#5d2b36}.footer{text-align:center;padding:24px 0;color:#667287;font-size:10px}
@media(max-width:1050px){.channels{grid-template-columns:repeat(2,1fr)}.grid4{grid-template-columns:repeat(2,1fr)}.grid3{grid-template-columns:1fr}.grid2{grid-template-columns:1fr}.examples{grid-template-columns:repeat(2,1fr)}}
@media(max-width:560px){.wrap{padding:10px}.top{flex-direction:column}.brand{font-size:24px}.channels,.grid4,.examples{grid-template-columns:1fr}.command{grid-template-columns:1fr}}
</style></head><body><div class="wrap">

<header class="top">
<div><div class="ey">HAMZEHI SOCIAL AI · OPERATION CENTER</div><div class="brand">AUTONOMOUS BUSINESS OS</div>
<div class="sub">مرکز فرمان و نظارت؛ دستور می‌دهی، سیستم Plan می‌سازد، Task ایجاد می‌کند، اجرا را ثبت می‌کند و وضعیت هر بخش را نشان می‌دهد.</div></div>
<div class="pill" id="masterState">CONNECTING…</div>
</header>

<section class="grid4 section">
<div class="card"><div class="k">MASTER</div><div class="num" id="masterValue">—</div><div class="hint">وضعیت کنترل مرکزی</div></div>
<div class="card"><div class="k">AUTONOMY</div><div class="num" id="autoRate">—</div><div class="hint">نرخ واقعی از Taskهای ثبت‌شده</div><div class="progress"><i id="autoBar"></i></div></div>
<div class="card"><div class="k">OPEN OPPORTUNITIES</div><div class="num" id="opp">—</div><div class="hint">فرصت‌های واقعی CRM</div></div>
<div class="card"><div class="k">CONVERSIONS</div><div class="num" id="conv">—</div><div class="hint">Customer / Converted</div></div>
</section>

<section class="card section">
<div class="title"><div><h2>🤖 AI COMMAND CENTER</h2><div class="hint">فرمان طبیعی بنویس. نمونه: «تلگرام را بررسی کن، ولی اینستاگرام را فعلاً متوقف کن و فرصت‌های تبلیغاتی را پیدا کن.»</div></div><span class="tag">ADMIN CONTROLLED</span></div>
<div class="command" style="margin-top:11px"><input id="command" class="input" placeholder="دستور عملیاتی خودت را اینجا بنویس…"><button class="btn primary" onclick="sendCommand()">PLAN & EXECUTE</button></div>
<div class="examples">
<div class="example" onclick="setCmd('تلگرام را بررسی کن و مشتری‌های جدید را تحلیل کن')"><b>📥 Telegram + CRM</b><span>بررسی پیام و تحلیل مشتری</span></div>
<div class="example" onclick="setCmd('واتساپ را بررسی کن ولی فعلاً هیچ اقدامی انجام نده')"><b>🛑 WhatsApp observe</b><span>فقط مشاهده و عدم اقدام</span></div>
<div class="example" onclick="setCmd('اینستاگرام را متوقف کن و تبلیغات را بررسی کن')"><b>⛔ Instagram + Ads</b><span>کنترل ماژول و کشف فرصت</span></div>
<div class="example" onclick="setCmd('سایت و مشتری‌ها را بررسی کن و گزارش بده')"><b>🌐 Website + CRM</b><span>رصد رشد و مشتری</span></div>
</div>
<div id="commandStatus" class="hint" style="margin-top:10px">آماده دریافت دستور.</div>
</section>

<section class="card section" id="authPanel">
<div class="title"><div><h2>🔐 ADMIN TOKEN</h2><div class="hint">اتصال امن پنل به Worker</div></div><span id="tokenState" class="tag">NOT SET</span></div>
<div class="hint" style="margin-top:8px">توکن فقط روی همین مرورگر در localStorage ذخیره می‌شود و در صفحه به‌صورت مخفی نگه داشته می‌شود.</div>
<div class="command" style="margin-top:10px">
<input id="adminTokenInput" class="input" type="password" autocomplete="off" placeholder="Admin Token را اینجا وارد کن">
<div class="tools"><button class="btn primary" onclick="saveToken()">SAVE TOKEN</button><button class="btn danger" onclick="clearToken()">CLEAR</button></div>
</div>
<div id="tokenStatus" class="hint" style="margin-top:8px">وضعیت: توکن وارد نشده است.</div>
</section>

<section class="card section">
<div class="title"><div><h2>🎛️ MASTER CONTROL</h2><div class="hint">کنترل فوری کل صف Autonomous. توقف، اجرای Taskهای آماده را کنترل می‌کند.</div></div><button class="btn" onclick="refreshAll()">↻ REFRESH</button></div>
<div class="tools" style="margin-top:10px">
<button class="btn primary" onclick="masterAction('on')">▶ START ALL</button>
<button class="btn" onclick="masterAction('pause')">Ⅱ PAUSE ALL</button>
<button class="btn danger" onclick="masterAction('stop')">■ STOP ALL</button>
<button class="btn danger" onclick="masterAction('emergency_stop')">🚨 EMERGENCY STOP</button>
<button class="btn" onclick="runTasks()">⚙ RUN DUE TASKS</button>
</div>
<div id="masterHelp" class="hint" style="margin-top:9px">START = روشن · PAUSE = توقف موقت صف · STOP/EMERGENCY = خاموشی صف Autonomous. وضعیت واقعی بعد از پاسخ API نمایش داده می‌شود.</div>
</section>

<section class="section">
<div class="title"><div><h2>📡 CHANNEL CONTROL · کنترل مستقل کانال‌ها</h2><div class="hint">هر کانال جداگانه قابل روشن/خاموش‌کردن است. OFF یعنی Taskهای آن ماژول در Executor جدید مسدود می‌شوند.</div></div></div>
<div class="channels" style="margin-top:9px">
<div class="card channel"><div class="head"><span class="tag">CHANNEL</span><span id="telegramState" class="state">—</span></div><h3>✈️ Telegram</h3><p>Inbox، پاسخ/پیش‌نویس و مسیر محتوای Telegram.</p><div class="actions"><button class="btn" onclick="moduleToggle('telegram',true)">ON</button><button class="btn danger" onclick="moduleToggle('telegram',false)">OFF / BLOCK</button></div></div>
<div class="card channel"><div class="head"><span class="tag">CHANNEL</span><span id="whatsappState" class="state">—</span></div><h3>🟢 WhatsApp</h3><p>رصد Inbox و عملیات ماژول WhatsApp از مسیر Worker.</p><div class="actions"><button class="btn" onclick="moduleToggle('whatsapp',true)">ON</button><button class="btn danger" onclick="moduleToggle('whatsapp',false)">OFF / BLOCK</button></div></div>
<div class="card channel"><div class="head"><span class="tag">CHANNEL</span><span id="instagramState" class="state">—</span></div><h3>◎ Instagram</h3><p>Health و Lead intelligence؛ وضعیت Provider جداگانه قابل مشاهده است.</p><div class="actions"><button class="btn" onclick="moduleToggle('instagram',true)">ON</button><button class="btn danger" onclick="moduleToggle('instagram',false)">OFF / BLOCK</button></div></div>
<div class="card channel"><div class="head"><span class="tag">CHANNEL</span><span id="websiteState" class="state">—</span></div><h3>🌐 Website</h3><p>Growth scan و پایش رشد وب‌سایت از API موجود.</p><div class="actions"><button class="btn" onclick="moduleToggle('website',true)">ON</button><button class="btn danger" onclick="moduleToggle('website',false)">OFF / BLOCK</button></div></div>
</div>
</section>

<section class="card section">
<div class="title">
<div>
<h2>🔎 AUTONOMY DIAGNOSTIC</h2>
<div class="hint">خواندن مستقیم وضعیت واقعی Queue، Lock و Content Module از /api/autonomy/status</div>
</div>
<button class="btn" onclick="loadDiagnostic()">↻ CHECK</button>
</div>

<div class="grid3" style="margin-top:10px">
<div class="row">
<b>MASTER</b>
<div id="diagMaster" class="muted">—</div>
</div>

<div class="row">
<b>CONTENT MODULE</b>
<div id="diagContent" class="muted">—</div>
</div>

<div class="row">
<b>TASK COUNTS</b>
<div id="diagTasks" class="muted">—</div>
</div>
</div>

<div class="row" style="margin-top:9px">
<b>ACTIVE LOCKS</b>
<div id="diagLocks" class="muted" style="margin-top:6px">در انتظار بررسی…</div>
</div>
<div class="row" style="margin-top:9px">
<b>🔍 LOCKED CONTENT TASK</b>
<div id="diagLockedTask" class="muted" style="margin-top:6px">
در انتظار بررسی…
</div>
</div>
<div id="diagStatus" class="hint" style="margin-top:8px">
هنوز بررسی نشده است.
</div>
</section>
<section class="grid3 section">
<div class="card"><div class="title"><h2>💰 REVENUE</h2><span class="tag">REAL CRM</span></div><div id="revenue" class="rows">—</div></div>
<div class="card"><div class="title"><h2>🎯 OPPORTUNITIES</h2><span class="tag">LEADS</span></div><div id="opportunities" class="rows">—</div></div>
<div class="card dangerbox"><div class="title"><h2>🚨 ERRORS & RECOVERY</h2><button class="btn" onclick="loadErrors()">↻</button></div><div id="errors" class="rows">—</div></div>
</section>

<section class="card section">
<div class="title"><h2>🛡️ SAFETY GATE</h2><span class="tag ok">ACTIVE</span></div>
<div class="hint" style="margin-top:8px">این پنل وضعیت و کنترل‌های واقعی V10 را نمایش می‌دهد. پرداخت، قرارداد، Secret، DNS، R2 و Deploy از این UI قابل دستکاری نیستند. عملیات بیرونی نیازمند مجوز باید همچنان Gate داشته باشند.</div>
<div id="safety" class="row" style="margin-top:9px">در انتظار پاسخ Worker…</div>
</section>

<div class="footer">HAMZEHI SOCIAL AI · V10 Professional Operation Center · Real backend state · No fake metrics · No external libraries</div>

<script>
const A="/api/autonomy",KEY="hamzehi_admin_token",$=id=>document.getElementById(id);
function esc(x){return String(x??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function token(){return localStorage.getItem(KEY)||""}
function hdr(){const t=token();return t?{"Authorization":"Bearer "+t}:{}}
function updateTokenUI(){
 const t=token(), state=$("tokenState"), status=$("tokenStatus");
 if(t){state.textContent="SET";state.className="tag ok";status.innerHTML="<span class='ok'>✓ توکن ذخیره شده و آماده اتصال به Worker است.</span>";}
 else{state.textContent="NOT SET";state.className="tag";status.textContent="وضعیت: توکن وارد نشده است.";}
}
function saveToken(){
 const v=$("adminTokenInput").value.trim();
 if(!v){$("tokenStatus").innerHTML="<span class='bad'>✕ توکن خالی است.</span>";return;}
 localStorage.setItem(KEY,v);
 $("adminTokenInput").value="";
 updateTokenUI();
 refreshAll();
}
function clearToken(){
 localStorage.removeItem(KEY);
 $("adminTokenInput").value="";
 updateTokenUI();
 $("commandStatus").innerHTML="<span class='warn'>توکن پاک شد. برای اتصال دوباره، Admin Token را وارد کن.</span>";
}
async function api(path,opt={}){const r=await fetch(path,{...opt,headers:{...hdr(),...(opt.headers||{}),...(opt.body?{"Content-Type":"application/json"}:{})}});return await r.json().catch(()=>({ok:false,error:"Invalid JSON"}))}
function setCmd(x){$("command").value=x}
function rows(a,fn){return (a||[]).slice(0,15).map(x=>"<div class='row'>"+fn(x)+"</div>").join("")||"<div class='hint'>داده‌ای وجود ندارد.</div>"}
async function loadDiagnostic(){
 const d=await api(A+"/status");
const taskData=await api(A+"/tasks");
 if(!d.ok){
  $("diagStatus").innerHTML="<span class='bad'>✕ "+esc(d.error||"Unable to read autonomy status")+"</span>";
  $("diagMaster").textContent="—";
  $("diagContent").textContent="—";
  $("diagTasks").textContent="—";
  $("diagLocks").textContent="—";
  return;
}

const lockedTaskId=(d.active_locks||[]).find(x=>x.module==="content")?.task_id||"";

const lockedTask=(taskData.items||[]).find(x=>x.id===lockedTaskId);

$("diagLockedTask").innerHTML=lockedTask
  ? "<b>MODULE:</b> "+esc(lockedTask.module)+
    " · <b>ACTION:</b> "+esc(lockedTask.action)+
    "<br><b>STATUS:</b> "+esc(lockedTask.status)+
    " · <b>ATTEMPTS:</b> "+esc(lockedTask.attempts)+
    "<br><b>STARTED:</b> "+esc(lockedTask.started_at||"—")+
    "<br><b>UPDATED:</b> "+esc(lockedTask.updated_at||"—")+
    "<br><b>COMMAND:</b> "+esc(lockedTask.command_id||"—")+
    (lockedTask.error
      ? "<br><span class='bad'><b>ERROR:</b> "+esc(lockedTask.error)+"</span>"
      : "")+
    (lockedTask.result_json
      ? "<br><span class='muted'><b>RESULT:</b> "+esc(lockedTask.result_json)+"</span>"
      : "")
  : "<span class='warn'>Task مربوط به Lock پیدا نشد.</span>";

const master=d.controls?.master||"—";
 const master=d.controls?.master||"—";
 const contentEnabled=d.controls?.modules?.content!==false;
 const tasks=d.tasks||{};
 const locks=d.active_locks||[];

 $("diagMaster").textContent=String(master).toUpperCase();

 $("diagContent").innerHTML=contentEnabled
  ? "<span class='ok'>ON</span>"
  : "<span class='bad'>OFF / BLOCK</span>";

 $("diagTasks").innerHTML=
  "queued: "+esc(tasks.queued??0)+
  " · running: "+esc(tasks.running??0)+
  " · completed: "+esc(tasks.completed??0)+
  " · failed: "+esc(tasks.failed??0)+
  " · blocked: "+esc(tasks.blocked??0);

 if(!locks.length){
  $("diagLocks").innerHTML="<span class='ok'>NO ACTIVE LOCKS</span>";
 }else{
  $("diagLocks").innerHTML=locks.map(x=>
   "<div style='margin-bottom:6px'>"+
   "<b>"+esc(x.module)+"</b>"+
   " · task: "+esc(x.task_id)+
   "<br><small>"+esc(x.locked_at||"")+"</small>"+
   "</div>"
  ).join("");
 }

 $("diagStatus").innerHTML=
  "<span class='ok'>✓ وضعیت واقعی از /api/autonomy/status خوانده شد.</span>";
}
async function loadStatus(){
 const d=await api(A+"/status");if(!d.ok){$("masterState").textContent="AUTH / API ERROR";$("masterState").className="pill bad";return}
 const c=d.controls||{},m=c.master||"—";$("masterState").textContent="MASTER: "+m.toUpperCase();$("masterState").className="pill "+(m==="on"?"ok":m==="paused"?"warn":"bad");$("masterValue").textContent=m.toUpperCase();
 $("opp").textContent=d.revenue?.opportunities??0;$("conv").textContent=d.revenue?.conversions??0;
 const mt=await api(A+"/metrics");if(mt.ok){$("autoRate").textContent=(mt.autonomous_rate??0)+"%";$("autoBar").style.width=Math.min(100,mt.autonomous_rate||0)+"%"}
 const mods=c.modules||{};for(const k of ["telegram","whatsapp","instagram","website"]){const e=$(k+"State"),on=mods[k]!==false;e.textContent=on?"ON":"OFF / BLOCK";e.className="state "+(on?"ok":"bad")}
}
async function masterAction(action){$("masterHelp").textContent="در حال اجرای "+action+"…";const d=await api(A+"/master",{method:"POST",body:JSON.stringify({action})});$("masterHelp").innerHTML=d.ok?"<span class='ok'>✓ MASTER → "+esc(action)+" · وضعیت ثبت شد.</span>":"<span class='bad'>✕ "+esc(d.error||"unknown")+"</span>";await refreshAll()}
async function moduleToggle(module,enabled){const d=await api(A+"/module",{method:"POST",body:JSON.stringify({module,enabled})});if(!d.ok)alert(d.error||"خطا");await loadStatus()}
async function sendCommand(){const raw=$("command").value.trim();if(!raw)return;$("commandStatus").textContent="در حال ساخت Plan و Task…";const d=await api(A+"/command",{method:"POST",body:JSON.stringify({command:raw})});$("commandStatus").innerHTML=d.ok?"<span class='ok'>✓ فرمان ثبت شد · "+esc(d.command_id)+" · "+(d.plan?.tasks?.length||0)+" Task ساخته شد.</span>":"<span class='bad'>✕ "+esc(d.error||"unknown")+"</span>";if(d.ok){await runTasks()}}
async function runTasks(){$("commandStatus").textContent="در حال اجرای Taskهای آماده…";const d=await api(A+"/tasks/run",{method:"POST",body:"{}"});$("commandStatus").innerHTML=d.ok?"<span class='ok'>✓ اجرا: "+d.executed+" · خطا: "+d.failed+(d.paused?" · PAUSED":"")+"</span>":"<span class='bad'>✕ "+esc(d.error||"unknown")+"</span>";await refreshAll()}
async function loadTasks(){
 const d=await api(A+"/tasks");
 if(d.ok){
  $("taskCount").textContent=(d.items||[]).length+" recent";
  $("tasks").innerHTML=rows(d.items,x=>{
   let result="";
   if(x.result_json){
    try{
     const r=JSON.parse(x.result_json);
     result="<br><span class='muted'>RESULT: "+esc(JSON.stringify(r))+"</span>";
    }catch{
     result="<br><span class='muted'>RESULT: "+esc(x.result_json)+"</span>";
    }
   }
   return esc(x.module+" / "+x.action)+" · "+esc(x.status)
    +(x.error?"<br><span class='bad'>"+esc(x.error)+"</span>":"")
    +result
    +"<small>"+esc(x.updated_at)+"</small>";
  })
 }
}
async function loadBrain(){const d=await api(A+"/brain");if(!d.ok)return;$("brain").textContent=d.brain?.mission||"—";$("timeline").innerHTML=rows(d.brain?.timeline,x=>esc((x.type||"event")+" · "+(x.message||""))+"<small>"+esc(x.created_at)+"</small>")}
async function loadRevenue(){const d=await api(A+"/revenue");$("revenue").innerHTML=d.ok?rows(Object.entries(d.funnel||{}).map(([k,v])=>({k,v})),x=>esc(x.k)+" · "+esc(x.v)):"—"}
async function loadOpp(){const d=await api(A+"/opportunities");$("opportunities").innerHTML=d.ok?rows(d.items,x=>esc(x.name||x.contact||x.id)+" · "+esc(x.stage||"new")+" · "+esc(x.priority||"normal")):"—"}
async function loadErrors(){const d=await api(A+"/errors");const a=[...(d.tasks||[]),...(d.retries||[])];$("errors").innerHTML=d.ok?rows(a,x=>"<span class='bad'>"+esc(x.error||x.last_error||x.operation||"—")+"</span><small>"+esc(x.updated_at||"")+"</small>"):"—"}
async function loadSafety(){const d=await api("/api/settings");$("safety").textContent=d.ok?"Settings API پاسخ داد · وضعیت Gate از Worker موجود است.":"Settings API در دسترس نیست."}
async function refreshAll(){await loadStatus();await Promise.all([loadTasks(),loadBrain(),loadRevenue(),loadOpp(),loadErrors(),loadSafety()])}
updateTokenUI();refreshAll();loadDiagnostic();setInterval(refreshAll,15000);
</script></body></html>`;
}
