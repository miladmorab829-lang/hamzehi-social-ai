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
<div class="command" style="margin-top:11px"><input id="command" class="input" placeholder="دستور عملیاتی یا دانش فروش را اینجا بنویس…"><button class="btn primary" onclick="sendCommand()">PLAN & EXECUTE</button></div>
<div class="examples">
<div class="example" onclick="setCmd('تلگرام را بررسی کن و مشتری‌های جدید را تحلیل کن')"><b>📥 Telegram + CRM</b><span>بررسی پیام و تحلیل مشتری</span></div>
<div class="example" onclick="setCmd('واتساپ را بررسی کن ولی فعلاً هیچ اقدامی انجام نده')"><b>🛑 WhatsApp observe</b><span>فقط مشاهده و عدم اقدام</span></div>
<div class="example" onclick="setCmd('اینستاگرام را متوقف کن و تبلیغات را بررسی کن')"><b>⛔ Instagram + Ads</b><span>کنترل ماژول و کشف فرصت</span></div>
<div class="example" onclick="setCmd('سایت و مشتری‌ها را بررسی کن و گزارش بده')"><b>🌐 Website + CRM</b><span>رصد رشد و مشتری</span></div>
<div class="example" onclick="setCmd('برای مدل X هم رنگ سرمه‌ای اضافه کن')"><b>📚 Sales Knowledge</b><span>پیشنهاد دانش فروش؛ بدون اعمال مستقیم</span></div>
</div>
<div id="commandStatus" class="hint" style="margin-top:10px">آماده دریافت دستور.</div>
</section>

<section class="card section" id="knowledgePanel">
<div class="title"><div><h2>📚 SALES KNOWLEDGE</h2><div class="hint">پیشنهاد ← بررسی مالک ← اعمال. افزودن اطلاعات، اطلاعات قبلی را حذف نمی‌کند. قیمت نهایی از Quote/Price List موجود می‌آید.</div></div><button class="btn" onclick="loadSalesKnowledge()">REFRESH</button></div>
<div class="grid4" style="margin-top:10px">
<select class="input" id="knowledgeOperation"><option>ADD</option><option>EXPAND</option><option>UPDATE</option><option>REPLACE</option><option>DEACTIVATE</option><option>DELETE</option></select>
<select class="input" id="knowledgeDomain" onchange="knowledgeAttributes()"></select><select class="input" id="knowledgeAttribute"></select>
<select class="input" id="knowledgeEntityType"><option value="model">Model</option><option value="product">Product</option><option value="business">Business</option></select>
<input class="input" id="knowledgeEntity" placeholder="Model / product identifier">
<select class="input" id="knowledgeMarket"><option>GLOBAL</option><option>IRAN</option><option>ARAB</option></select>
<input class="input" id="knowledgeFrom" placeholder="Effective from ISO (optional)"><input class="input" id="knowledgeUntil" placeholder="Effective until ISO (optional)">
</div>
<label class="hint" for="knowledgeValue">Typed JSON value: text in double quotes, integer, boolean, or null (unknown). Add each color/size separately.</label>
<textarea class="input" id="knowledgeValue" rows="2" placeholder='مثال: "navy"'></textarea>
<div id="knowledgeTarget" class="hint">ADD/EXPAND: no existing fact selected.</div>
<div class="tools"><button class="btn" onclick="clearKnowledgeTarget()">NEW FACT</button><button class="btn primary" onclick="proposeKnowledge()">PROPOSE ONLY</button></div>
<div id="knowledgeStatus" class="hint" role="status"></div>
<div class="tools"><button class="btn" onclick="knowledgeOffset=Math.max(0,knowledgeOffset-100);loadSalesKnowledge()">PREVIOUS PAGE</button><button class="btn" onclick="knowledgeOffset+=100;loadSalesKnowledge()">NEXT PAGE</button></div>
<div class="title"><h3>Owner Review · Old → Proposed</h3></div><div id="knowledgeRequests" class="rows"></div>
<div class="title"><h3>Knowledge · Current revisions</h3></div><div id="knowledgeFacts" class="rows"></div>
<div class="title"><h3>Revision History</h3></div><div id="knowledgeHistory" class="rows"></div>
<div class="tools"><button class="btn" onclick="loadKnowledgeHistory(-100)">PREVIOUS HISTORY</button><button class="btn" onclick="loadKnowledgeHistory(100)">NEXT HISTORY</button></div>
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
<div class="title"><div><h2>✅ CONTENT APPROVAL</h2><div class="hint">محتوای تولیدشده تا بررسی و تأیید انسانی منتشر نمی‌شود.</div></div><button class="btn" onclick="loadApprovals()">↻ REFRESH</button></div>
<div id="approvalStatus" class="hint" style="margin-top:9px">در انتظار دریافت…</div>
<div id="approvalItems" class="rows"></div>
</section>

<section class="card section">
<div class="title"><div><h2>✉️ OUTREACH APPROVAL</h2><div class="hint">پیش‌نویس مشتری فقط برای بررسی است؛ تأیید در این مرحله هیچ پیامی ارسال نمی‌کند.</div></div><button class="btn" onclick="loadOutreachApprovals()">↻ REFRESH</button></div>
<div id="outreachApprovalStatus" class="hint" style="margin-top:9px">در انتظار دریافت…</div>
<div id="outreachApprovalItems" class="rows"></div>
</section>

<section class="card section">
<div class="title"><div><h2>💬 NEGOTIATION INBOX</h2><div class="hint">پاسخ‌های لینک‌شده، نیت محدود و پیش‌نویس قابل ویرایش. تأیید به‌تنهایی ارسال نمی‌کند.</div></div><button class="btn" onclick="loadNegotiationInbox()">↻ REFRESH</button></div>
<div id="negotiationInboxStatus" class="hint" style="margin-top:9px">در انتظار دریافت…</div>
<div id="negotiationInboxItems" class="rows"></div>
</section>

<section class="card section">
<div class="title"><div><h2>🧾 QUOTE REQUESTS</h2><div class="hint">قیمت ایران فقط با تأیید مالک؛ قیمت عرب فقط از Price List فعال. NULL یعنی نامشخص و Quote ناقص قابل تأیید نیست.</div></div><button class="btn" onclick="loadQuotes()">↻ REFRESH</button></div>
<div id="quoteStatus" class="hint" style="margin-top:9px">در انتظار دریافت…</div><div id="quoteItems" class="rows"></div>
</section>
<section class="card section">
<div class="title"><div><h2>📦 ORDERS</h2><div class="hint">پذیرش Quote فقط Order Candidate می‌سازد؛ ثبت سفارش قطعی نیازمند تأیید صریح مالک است و به معنی پرداخت نیست.</div></div><button class="btn" onclick="loadOrders()">↻ REFRESH</button></div>
<div id="orderStatus" class="hint" style="margin-top:9px">در انتظار دریافت…</div><div id="orderItems" class="rows"></div>
</section>
<section class="card section">
<div class="title"><div><h2>💰 REVENUE SUMMARY · FOLLOW-UP QUEUE</h2><div class="hint">فقط داده ثبت‌شده؛ ارزها جمع زده نمی‌شوند. پیگیری‌ها فقط پیش‌نویس می‌سازند و ارسال نیازمند تأیید مالک است.</div></div><div class="tools"><button class="btn" onclick="runRevenueFollowupsUi()">CREATE MISSING DRAFTS</button><button class="btn" onclick="loadRevenueRecovery()">↻ REFRESH</button></div></div>
<div id="revenueSummary" class="rows" style="margin-top:9px"></div><div id="followupStatus" class="hint" style="margin-top:9px">در انتظار دریافت…</div><div id="followupItems" class="rows"></div>
</section>
<section class="card section" id="siSection">
<div class="title"><div><h2>🧭 OWNER DECISION CENTER</h2><div class="hint">AI فقط استخراج و پیشنهاد می‌کند؛ تصمیم، قیمت سفارشی و دانش تأییدشده با مالک است. هیچ پیامی خودکار ارسال نمی‌شود.</div></div><div class="tools"><select id="siDecisionFilter" class="input" onchange="siLoadDecisions()"><option>PENDING</option><option>RESOLVED</option><option>REJECTED</option><option>ALL</option></select><button class="btn" onclick="siLoadAll()">↻ REFRESH</button></div></div>
<div id="siDecisionLine" class="hint" style="margin-top:8px">در انتظار دریافت…</div><div id="siDecisions" class="rows"></div>
<div class="hint" style="margin-top:12px"><b>RECURRING KNOWLEDGE GAPS</b></div><div id="siGaps" class="rows"></div>
<div class="hint" style="margin-top:12px"><b>FAST / CUSTOM QUOTES · MARGIN</b></div><div id="siRequests" class="rows"></div>
<div class="hint" style="margin-top:12px"><b>MONEY AT STAKE</b></div><div id="siMoney" class="rows"></div>
</section>
<section class="card section" id="siKnowledgeSection">
<div class="title"><div><h2>📚 KNOWLEDGE MANAGEMENT</h2><div class="hint">هر تغییر یک نسخه جدید می‌سازد؛ نسخه قبلی در تاریخچه می‌ماند. ایران=TOMAN · عراق=USD (cents) قفل است.</div></div></div>
<div class="tools" style="margin-top:8px"><select id="siKind" class="input" onchange="siLoadKnowledge()"><option>product</option><option>attribute</option><option>configuration</option><option>compatibility</option><option>price</option><option>cost</option><option>setting</option></select><select id="siKStatus" class="input" onchange="siLoadKnowledge()"><option value="current">current</option><option value="all">history</option></select><input id="siKSearch" class="input" placeholder="search" onchange="siLoadKnowledge()"></div>
<textarea id="siKInput" class="input" style="margin-top:8px;min-height:110px" placeholder="JSON knowledge input"></textarea>
<div class="tools" style="margin-top:8px"><button class="btn" onclick="siTemplate()">TEMPLATE</button><button class="btn primary" onclick="siSaveKnowledge(false)">SAVE NEW VERSION</button><button class="btn" onclick="siSaveKnowledge(true)">UPDATE EXISTING</button></div>
<div id="siKLine" class="hint" style="margin-top:8px"></div><div id="siKnowledge" class="rows"></div>
<div class="hint" style="margin-top:12px"><b>REVENUE INTELLIGENCE · AI COST</b></div>
<div class="tools"><select id="siDim" class="input" onchange="siLoadIntel()"><option>market</option><option>lead_source</option><option>product_key</option><option>config_key</option><option>request_class</option><option>pricing_mode</option></select><button class="btn" onclick="siRebuildIntel()">REBUILD</button></div>
<div id="siIntel" class="rows"></div><div id="siAi" class="rows"></div>
</section>
<section class="card section">
<div class="title"><div><h2>🏷️ ARAB FIXED PRICE LIST</h2><div class="hint">هر تغییر قیمت یک Version جدید می‌سازد؛ هیچ قیمت پیش‌فرضی وجود ندارد.</div></div><button class="btn" onclick="loadPriceItems()">↻ REFRESH</button></div>
<div class="grid4" style="margin-top:10px"><input id="priceName" class="input" placeholder="Product name"><input id="priceKey" class="input" placeholder="Exact product key"><input id="priceSku" class="input" placeholder="SKU (optional)"><input id="priceCurrency" class="input" placeholder="Currency"><input id="priceUnit" class="input" inputmode="numeric" placeholder="Unit price minor units"><input id="priceMoq" class="input" inputmode="numeric" placeholder="MOQ (optional)"><input id="priceFrom" class="input" placeholder="Effective from ISO"><input id="priceUntil" class="input" placeholder="Effective until ISO"></div>
<div class="tools" style="margin-top:8px"><button class="btn primary" onclick="createPriceVersion()">ADD OWNER-APPROVED ITEM</button></div><div id="priceStatus" class="hint"></div><div id="priceItems" class="rows"></div>
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
<section class="card section">
  <div class="title">
    <div>
      <h2>📸 PHOTO AUTOPILOT</h2>
      <div class="hint">
        تولید روزانه یک تصویر جدید از عکس‌های واقعی Telegram Vault، بدون تکرار تا پایان Cycle.
      </div>
    </div>
    <span id="photoAutoState" class="tag">—</span>
  </div>

  <div class="grid4" style="margin-top:10px">
    <div class="row">
      <b>STATUS</b>
      <div id="photoStatus" class="muted">—</div>
    </div>

    <div class="row">
      <b>CYCLE</b>
      <div id="photoCycle" class="muted">—</div>
    </div>

    <div class="row">
      <b>USED / TOTAL</b>
      <div id="photoProgress" class="muted">—</div>
    </div>

    <div class="row">
      <b>TODAY</b>
      <div id="photoToday" class="muted">—</div>
    </div>
  </div>

  <div class="tools" style="margin-top:10px">
    <button class="btn primary" onclick="photoToggle(true)">▶ PHOTO ON</button>
    <button class="btn danger" onclick="photoToggle(false)">■ PHOTO OFF</button>
    <button class="btn" onclick="photoRunNow()">⚙ RUN NOW</button>
    <button class="btn" onclick="loadPhotoAutopilot()">↻ REFRESH</button>
  </div>

  <div id="photoActivity" class="hint" style="margin-top:10px">
    در انتظار وضعیت…
  </div>
</section>
</div>
</section>
<section class="card section">
  <div class="title">
    <div>
      <h2>🎬 VIDEO AUTOPILOT</h2>
      <div class="hint">
        تولید هفتگی یک ویدیوی تبلیغاتی از عکس‌های واقعی همان هفته، با سناریوی خودکار.
      </div>
    </div>
    <span id="videoAutoState" class="tag">—</span>
  </div>

  <div class="grid4" style="margin-top:10px">
    <div class="row">
      <b>STATUS</b>
      <div id="videoStatus" class="muted">—</div>
    </div>

    <div class="row">
      <b>CYCLE</b>
      <div id="videoCycle" class="muted">—</div>
    </div>

    <div class="row">
      <b>USED / TOTAL</b>
      <div id="videoProgress" class="muted">—</div>
    </div>

    <div class="row">
      <b>TODAY</b>
      <div id="videoToday" class="muted">—</div>
    </div>
  </div>

  <div class="tools" style="margin-top:10px">
    <button class="btn primary" onclick="videoToggle(true)">▶ VIDEO ON</button>
    <button class="btn danger" onclick="videoToggle(false)">■ VIDEO OFF</button>
    <button class="btn" disabled title="Run Now هنوز فعال نشده">⚙ RUN NOW</button>
    <button class="btn" onclick="loadVideoAutopilot()">↻ REFRESH</button>
  </div>

  <div id="videoActivity" class="hint" style="margin-top:10px">
    در انتظار وضعیت…
  </div>
  <div class="grid2" style="margin-top:10px">
    <div class="row">
      <b>Current Week</b>
      <div id="videoCurrentWeek" class="muted" style="margin-top:6px">—</div>
    </div>
    <div class="row">
      <b>Last Successful Week</b>
      <div id="videoLastSuccessfulWeek" class="muted" style="margin-top:6px">—</div>
    </div>
  </div>
</section>
<section class="grid2 section">
<div class="card">
<div class="title">
<h2>📋 LIVE TASK MANAGER</h2>
<span id="taskCount" class="tag">—</span>
</div>
<div id="tasks" class="rows">—</div>
</div>

<div class="card">
<div class="title">
<h2>🧠 BUSINESS BRAIN</h2>
<button class="btn" onclick="loadBrain()">↻</button>
</div>

<div id="brain" class="row" style="margin-top:9px">
در انتظار داده…
</div>

<div class="title" style="margin-top:14px">
<h2>🕒 LIVE ACTIVITY</h2>
<span class="tag">RECENT</span>
</div>

<div id="timeline" class="rows timeline">—</div>
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
<div class="card">
<div class="title">
<div><h2>🎯 OPPORTUNITIES</h2><span class="tag">LEADS</span></div>
<span class="tag">AD AUTOPILOT</span>
</div>
<div class="tools" style="margin-top:9px">
<button class="btn" onclick="previewAdAutopilot()">🔎 PREVIEW</button>
<button class="btn danger" onclick="deleteSelectedAdAutopilot()">🗑️ DELETE SELECTED</button>
<button class="btn danger" onclick="deleteAllAdAutopilot()">🗑️ DELETE ALL</button>
</div>
<div id="adCleanupStatus" class="hint" style="margin-top:8px">برای بررسی رکوردهای Ads Autopilot روی PREVIEW بزن.</div>
<div id="opportunities" class="rows">—</div>
<div id="adAutopilotPreview" class="rows" style="margin-top:9px">—</div>
</div>
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
const DASHBOARD_REQUEST_TIMEOUT_MS=10000;
async function api(path,opt={}){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),DASHBOARD_REQUEST_TIMEOUT_MS);
 try{
  const r=await fetch(path,{...opt,signal:controller.signal,headers:{...hdr(),...(opt.headers||{}),...(opt.body?{"Content-Type":"application/json"}:{})}});
  const d=await r.json().catch(()=>null);
  if(!d||typeof d!=="object")return {ok:false,error:"Invalid JSON response",status:r.status};
  if(!r.ok)return {...d,ok:false,error:d.error||("Request failed (HTTP "+r.status+")"),status:r.status};
  return d;
 }catch(e){
  const timedOut=e?.name==="AbortError"||e?.name==="TimeoutError";
  return {ok:false,error:timedOut?"Request timed out after 10 seconds":String(e?.message||"Connection request failed")};
 }finally{
  clearTimeout(timer);
 }
}
function setCmd(x){$("command").value=x}
function rows(a,fn){return (a||[]).slice(0,15).map(x=>"<div class='row'>"+fn(x)+"</div>").join("")||"<div class='hint'>داده‌ای وجود ندارد.</div>"}
async function loadApprovals(){
 const status=$("approvalStatus"),list=$("approvalItems");
 status.textContent="در حال دریافت صف تأیید…";
 try{
  const response=await fetch("/api/content?status=generated",{headers:hdr(),cache:"no-store"});
  const d=await response.json().catch(()=>({ok:false,error:"Invalid JSON"}));
  if(!response.ok||!d||d.ok===false)throw Error(d?.error||("Approval queue unavailable (HTTP "+response.status+")"));
  const items=(d.items||[]).filter(x=>x.approval_status==="pending");
  status.textContent=items.length+" مورد در انتظار بررسی انسانی است.";
  list.innerHTML=items.length?items.map(x=>"<div class='row'><b>"+esc(x.topic||x.id)+"</b><div class='mini'>"+esc(x.language||"")+" · "+esc(x.market||"")+" · "+esc(x.platform||"")+"</div><div style='margin-top:6px;white-space:pre-wrap'>"+esc(x.caption||x.body||"(محتوا خالی است)")+"</div><div class='tools' style='margin-top:8px'><button class='btn primary' onclick='setContentApproval(&quot;"+esc(x.id)+"&quot;,&quot;approved&quot;)'>APPROVE</button><button class='btn danger' onclick='setContentApproval(&quot;"+esc(x.id)+"&quot;,&quot;rejected&quot;)'>REJECT</button></div></div>").join(""):"<div class='hint'>محتوای در انتظار تأیید وجود ندارد.</div>";
 }catch(e){status.innerHTML="<span class='bad'>✕ "+esc(e.message)+"</span>";list.innerHTML=""}
}
async function setContentApproval(id,status){
 const message=status==="approved"?"Approved from live dashboard":"Rejected from live dashboard";
 const d=await api("/api/content/approve",{method:"POST",body:JSON.stringify({content_id:id,status,reason:message})});
 if(!d.ok){$("approvalStatus").innerHTML="<span class='bad'>✕ "+esc(d.error||"Approval update failed")+"</span>";return}
 $("approvalStatus").textContent=status==="approved"?"محتوا تأیید شد و طبق تقویم انتشار صف‌بندی شد.":"محتوا رد شد.";
 await loadApprovals();
}
async function loadOutreachApprovals(){
 const status=$("outreachApprovalStatus"),list=$("outreachApprovalItems");
 status.textContent="در حال دریافت پیش‌نویس‌های ارتباط…";
 const d=await api("/api/leads/outreach");
 if(!d.ok){status.innerHTML="<span class='bad'>✕ "+esc(d.error||"Outreach queue unavailable")+"</span>";list.innerHTML="";return}
 const items=(d.items||[]).filter(x=>["draft","pending_approval","approved","rejected","sending","sent","send_failed","send_ambiguous"].includes(x.status));
 status.textContent=items.filter(x=>x.status==="pending_approval").length+" مورد در انتظار تأیید · ارسال فقط با دکمه SEND انجام می‌شود.";
 list.innerHTML=items.length?items.map(x=>"<div class='row'><b>"+esc(x.lead_name||x.lead_id)+"</b><div class='mini'>"+esc(x.channel)+" · "+esc(x.recipient)+" · "+esc(x.language)+" · "+esc(x.status)+"</div><div class='mini'>"+(x.channel==="telegram"?(x.telegram_sendable?"<span class='ok'>SENDABLE</span>":"<span class='bad'>NOT SENDABLE</span>")+" · ":"")+"Evidence: "+esc(x.evidence_status||"legacy/manual")+" · "+esc(x.contact_source||"")+"</div><div style='margin-top:6px;white-space:pre-wrap'>"+esc(x.message)+"</div><div class='tools' style='margin-top:8px'>"+(x.status==="draft"?"<button class='btn' onclick='setOutreachStatus(&quot;"+esc(x.id)+"&quot;,&quot;submit&quot;)'>SUBMIT FOR REVIEW</button>":"")+(x.status==="pending_approval"?"<button class='btn primary' onclick='setOutreachStatus(&quot;"+esc(x.id)+"&quot;,&quot;approve&quot;)'>APPROVE</button><button class='btn danger' onclick='setOutreachStatus(&quot;"+esc(x.id)+"&quot;,&quot;reject&quot;)'>REJECT</button>":"")+(x.status==="approved"&&x.channel==="telegram"&&x.telegram_sendable?"<button class='btn primary' onclick='sendTelegramOutreach(&quot;"+esc(x.id)+"&quot;)'>SEND</button>":"")+"</div></div>").join(""):"<div class='hint'>پیش‌نویس ارتباطی وجود ندارد.</div>";
}
async function setOutreachStatus(id,action){
 const d=await api("/api/leads/outreach/transition",{method:"POST",body:JSON.stringify({id,action})});
 if(!d.ok){$("outreachApprovalStatus").innerHTML="<span class='bad'>✕ "+esc(d.error||"Outreach update failed")+"</span>";return}
 $("outreachApprovalStatus").textContent=d.status==="approved"?"تأیید ثبت شد؛ هیچ پیامی ارسال نشد.":"وضعیت ثبت شد: "+d.status;
 await Promise.all([loadOutreachApprovals(),loadNegotiationInbox()]);
}
async function sendTelegramOutreach(id){
 const d=await api("/api/leads/outreach/send-telegram",{method:"POST",body:JSON.stringify({id})});
 if(!d.ok){$("outreachApprovalStatus").innerHTML="<span class='bad'>✕ "+esc(d.error||"Telegram send failed")+"</span>";await loadOutreachApprovals();return}
 $("outreachApprovalStatus").innerHTML="<span class='ok'>✓ پیام تأییدشده ارسال و ثبت شد.</span>";
 await loadOutreachApprovals();
}
async function loadNegotiationInbox(){
 const status=$("negotiationInboxStatus"),list=$("negotiationInboxItems");
 status.textContent="در حال دریافت پاسخ‌های مشتری…";
 const d=await api("/api/inbox");
 if(!d.ok){status.innerHTML="<span class='bad'>✕ "+esc(d.error||"Inbox unavailable")+"</span>";list.innerHTML="";return}
 const items=(d.items||[]).filter(x=>x.platform==="telegram");
 status.textContent=items.filter(x=>x.lead_id&&x.conversation_id).length+" پیام لینک‌شده · پیام ناشناس بدون پیش‌نویس باقی می‌ماند.";
 list.innerHTML=items.length?items.map(x=>{
  const linked=!!(x.lead_id&&x.conversation_id),draftId="neg-draft-"+String(x.id),state=x.outreach_status||"none";
  const controls=!linked?"<span class='warn'>UNLINKED — NO DRAFT</span>":!x.outreach_id?"<button class='btn' onclick='generateNegotiationDraft(&quot;"+esc(x.id)+"&quot;)'>GENERATE DRAFT</button>":state==="draft"?"<button class='btn' onclick='saveNegotiationDraft(&quot;"+esc(x.outreach_id)+"&quot;,&quot;"+esc(draftId)+"&quot;)'>SAVE DRAFT</button><button class='btn' onclick='setOutreachStatus(&quot;"+esc(x.outreach_id)+"&quot;,&quot;submit&quot;)'>SUBMIT FOR APPROVAL</button>":state==="pending_approval"?"<button class='btn primary' onclick='setOutreachStatus(&quot;"+esc(x.outreach_id)+"&quot;,&quot;approve&quot;)'>APPROVE</button><button class='btn danger' onclick='setOutreachStatus(&quot;"+esc(x.outreach_id)+"&quot;,&quot;reject&quot;)'>REJECT</button>":state==="approved"?"<span class='ok'>APPROVED — SEND فقط از بخش Outreach Approval</span>":"<span class='tag'>"+esc(state)+"</span>";
  return "<div class='row'><b>"+esc(x.lead_name||x.sender||"Unknown")+"</b><div class='mini'>Intent: "+esc(x.category||"other")+" · Conversation: "+esc(x.conversation_id||"—")+" · Draft: "+esc(state)+"</div><div style='margin-top:6px;white-space:pre-wrap'>"+esc(x.message||"")+"</div>"+(x.outreach_id?"<textarea id='"+esc(draftId)+"' class='input' style='margin-top:8px;min-height:100px'>"+esc(x.outreach_message||x.reply_suggestion||"")+"</textarea>":"<div class='hint' style='margin-top:7px'>Suggested reply: "+esc(x.reply_suggestion||"—")+"</div>")+"<div class='tools' style='margin-top:8px'>"+controls+"</div></div>";
 }).join(""):"<div class='hint'>پیامی وجود ندارد.</div>";
}
async function generateNegotiationDraft(id){
 const d=await api("/api/inbox/negotiation-draft",{method:"POST",body:JSON.stringify({id})});
 if(!d.ok){$("negotiationInboxStatus").innerHTML="<span class='bad'>✕ "+esc(d.error||"Draft generation failed")+"</span>";return}
 await Promise.all([loadNegotiationInbox(),loadOutreachApprovals()]);
}
async function saveNegotiationDraft(id,inputId){
 const message=$(inputId)?.value?.trim()||"";
 const d=await api("/api/leads/outreach/draft",{method:"PATCH",body:JSON.stringify({id,message})});
 if(!d.ok){$("negotiationInboxStatus").innerHTML="<span class='bad'>✕ "+esc(d.error||"Draft save failed")+"</span>";return}
 $("negotiationInboxStatus").innerHTML="<span class='ok'>✓ پیش‌نویس ذخیره شد؛ هیچ پیامی ارسال نشد.</span>";
 await Promise.all([loadNegotiationInbox(),loadOutreachApprovals()]);
}
let knowledgeFields={},knowledgeFacts=[],knowledgeRequests=[],knowledgeTarget=null,knowledgeBusy=false,knowledgeProposalId=null,knowledgeOffset=0,knowledgeHistoryKey=null,knowledgeHistoryOffset=0;
function knowledgeAttributes(){const fields=knowledgeFields[$("knowledgeDomain").value]||{};$("knowledgeAttribute").innerHTML=Object.keys(fields).map(x=>"<option>"+esc(x)+"</option>").join("")}
function clearKnowledgeTarget(){knowledgeTarget=null;knowledgeProposalId=null;$("knowledgeOperation").value="ADD";$("knowledgeTarget").textContent="ADD/EXPAND: no existing fact selected."}
function knowledgeFactCard(x){return "<div class='row'><b>"+esc(x.entity_key)+" · "+esc(x.attribute)+" · v"+esc(x.version)+"</b><div>"+esc(x.status)+" · "+esc(x.market)+" · "+esc(x.authority)+"</div><pre style='white-space:pre-wrap'>"+esc(x.value_json)+"</pre><small>"+esc(x.approved_by)+" · "+esc(x.approved_at)+" · Request "+esc(x.change_request_id)+"</small></div>"}
async function loadSalesKnowledge(){
 const status=$("knowledgeStatus");status.textContent="Loading knowledge…";
 try{
  const d=await api("/api/sales-knowledge?offset="+knowledgeOffset);if(!d.ok)throw Error(d.error||"Knowledge unavailable");
  knowledgeFields=d.fields||{};knowledgeFacts=d.facts||[];knowledgeRequests=d.requests||[];
  const selected=$("knowledgeDomain").value;$("knowledgeDomain").innerHTML=Object.keys(knowledgeFields).map(x=>"<option>"+esc(x)+"</option>").join("");
  if(knowledgeFields[selected])$("knowledgeDomain").value=selected;knowledgeAttributes();
  $("knowledgeFacts").innerHTML=knowledgeFacts.map((x,i)=>knowledgeFactCard(x)+"<div class='tools'><button class='btn' data-knowledge='history' data-index='"+i+"'>HISTORY</button>"+(x.status!=="tombstoned"?"<button class='btn' data-knowledge='target' data-index='"+i+"'>SELECT EXACT REVISION</button>":"")+"</div>").join("")||"<div class='hint'>No approved knowledge yet.</div>";
  $("knowledgeRequests").innerHTML=knowledgeRequests.map((x,i)=>"<div class='row'><b>"+esc(x.operation)+" · "+esc(x.entity_key)+" · "+esc(x.attribute)+"</b><div>"+esc(x.status)+" · "+esc(x.sensitivity)+" · "+esc(x.market)+"</div><div>Old:</div><pre style='white-space:pre-wrap'>"+esc(x.old_value_json??"(no previous fact)")+"</pre><div>Proposed:</div><pre style='white-space:pre-wrap'>"+esc(x.new_value_json)+"</pre><div>"+esc(x.conflict_json)+"</div><small>Target "+esc(x.target_fact_id||"none")+" / v"+esc(x.target_version??"—")+" · "+esc(x.effective_from||"no start")+" → "+esc(x.effective_until||"no end")+" · Reviewed "+esc(x.reviewed_by||"—")+" "+esc(x.reviewed_at||"")+"</small><div class='tools'>"+(x.status==="pending_review"?"<button class='btn' data-knowledge='approve' data-index='"+i+"'>REVIEW & APPROVE</button>":"")+(["pending_review","conflict"].includes(x.status)?"<button class='btn danger' data-knowledge='reject' data-index='"+i+"'>REJECT</button>":"")+(x.status==="approved"?"<button class='btn primary' data-knowledge='apply' data-index='"+i+"'>APPLY REVIEWED CHANGE</button>":"")+"</div></div>").join("")||"<div class='hint'>No proposals.</div>";
  status.textContent="Page "+(knowledgeOffset/100+1)+". Review alone does not apply a change.";
 }catch(e){status.textContent=e.message}
}
async function loadKnowledgeHistory(delta=0){
 if(!knowledgeHistoryKey)return;
 knowledgeHistoryOffset=Math.max(0,knowledgeHistoryOffset+delta);
 try{const d=await api("/api/sales-knowledge?fact_key="+encodeURIComponent(knowledgeHistoryKey)+"&offset="+knowledgeHistoryOffset);if(!d.ok)throw Error(d.error);$("knowledgeHistory").innerHTML=d.facts.map(knowledgeFactCard).join("")||"<div class='hint'>No more revisions.</div>"}catch(e){$("knowledgeStatus").textContent=e.message}
}
async function proposeKnowledge(){
 if(knowledgeBusy)return;knowledgeBusy=true;
 try{
  const operation=$("knowledgeOperation").value,retiring=["DELETE","DEACTIVATE"].includes(operation);
  const body={id:knowledgeProposalId||crypto.randomUUID(),operation,domain:$("knowledgeDomain").value,attribute:$("knowledgeAttribute").value,entity_type:$("knowledgeEntityType").value,entity_key:$("knowledgeEntity").value,market:$("knowledgeMarket").value,effective_from:$("knowledgeFrom").value||null,effective_until:$("knowledgeUntil").value||null};
  if(!retiring)body.value=JSON.parse($("knowledgeValue").value);
  if(!["ADD","EXPAND"].includes(operation)){if(!knowledgeTarget)throw Error("Select an exact revision first");body.target_fact_id=knowledgeTarget.id;body.target_version=knowledgeTarget.version}
  knowledgeProposalId=body.id;
  const d=await api("/api/sales-knowledge/propose",{method:"POST",body:JSON.stringify(body)});if(!d.ok)throw Error(d.error);
  knowledgeProposalId=null;await loadSalesKnowledge();$("knowledgeStatus").textContent="Proposal saved: "+d.request.status;
 }catch(e){$("knowledgeStatus").textContent=e.message}finally{knowledgeBusy=false}
}
$("knowledgePanel").addEventListener("input",()=>{knowledgeProposalId=null});
$("knowledgePanel").addEventListener("click",async event=>{
 const button=event.target.closest("[data-knowledge]");if(!button||knowledgeBusy)return;
 const action=button.dataset.knowledge,index=Number(button.dataset.index);
 if(action==="target"){
  const x=knowledgeFacts[index];if(!x)return;knowledgeTarget=x;knowledgeProposalId=null;
  $("knowledgeOperation").value="UPDATE";$("knowledgeDomain").value=x.domain;knowledgeAttributes();$("knowledgeAttribute").value=x.attribute;$("knowledgeEntityType").value=x.entity_type;$("knowledgeEntity").value=x.entity_key;$("knowledgeMarket").value=x.market;$("knowledgeValue").value=x.value_json;$("knowledgeFrom").value=x.effective_from||"";$("knowledgeUntil").value=x.effective_until||"";$("knowledgeTarget").textContent="Exact target: "+x.id+" / v"+x.version;return;
 }
 knowledgeBusy=true;button.disabled=true;
 try{
  if(action==="history"){
   knowledgeHistoryKey=knowledgeFacts[index].fact_key;knowledgeHistoryOffset=0;await loadKnowledgeHistory();return;
  }
  const x=knowledgeRequests[index];if(!x)return;
  if(!confirm(action==="apply"?"Apply this reviewed change? History will be preserved.":action==="approve"?"Confirm the displayed old/proposed values and their business authority?":"Reject this proposal?"))return;
  const body=action==="apply"?{id:x.id,proposal_hash:x.proposal_hash,confirm_apply:true}:{id:x.id,proposal_hash:x.proposal_hash,decision:action,confirm_sensitive:x.sensitivity==="commercial"};
  const d=await api("/api/sales-knowledge/"+(action==="apply"?"apply":"review"),{method:"POST",body:JSON.stringify(body)});if(!d.ok)throw Error(d.error);
  await loadSalesKnowledge();
 }catch(e){$("knowledgeStatus").textContent=e.message}finally{knowledgeBusy=false;button.disabled=false}
});
function qv(id,name){return $("q-"+name+"-"+id)?.value??""}
function nullableNumber(v){const x=String(v).trim();return x===""?null:Number(x)}
async function loadQuotes(){
 const status=$("quoteStatus"),list=$("quoteItems");status.textContent="در حال دریافت Quoteها…";const d=await api("/api/quotes");if(!d.ok){status.innerHTML="<span class='bad'>✕ "+esc(d.error||"Quotes unavailable")+"</span>";list.innerHTML="";return}
 const items=d.items||[];status.textContent=items.length+" Quote · تأیید به‌تنهایی ارسال نمی‌کند.";
 list.innerHTML=items.length?items.map(q=>{const id=esc(q.id),missing=(q.readiness?.missing||[]).join(", ");return "<div class='row'><b>"+esc(q.lead_name||q.lead_id)+"</b><div class='mini'>"+esc(q.status)+" · Market: "+esc(q.market||"UNKNOWN")+" ("+esc(q.market_source||"—")+") · Price source: "+esc(q.price_item_id?"price-list v"+q.price_item_version:q.pricing_mode||"—")+"</div><div class='mini bad'>Missing: "+esc(missing||"none")+"</div><div class='grid4' style='margin-top:8px'><select id='q-market-"+id+"' class='input'><option value=''>Market review</option><option value='IRAN' "+(q.market==="IRAN"?"selected":"")+">IRAN</option><option value='ARAB' "+(q.market==="ARAB"?"selected":"")+">ARAB</option></select><input id='q-product-"+id+"' class='input' placeholder='Product' value='"+esc(q.product||"")+"'><input id='q-quantity-"+id+"' class='input' placeholder='Quantity' value='"+esc(q.quantity??"")+"'><input id='q-priceitem-"+id+"' class='input' placeholder='Exact price item ID' value='"+esc(q.price_item_id||"")+"'><input id='q-currency-"+id+"' class='input' placeholder='Currency (Iran owner)' value='"+esc(q.currency||"")+"'><input id='q-unit-"+id+"' class='input' placeholder='Unit minor (Iran owner)' value='"+esc(q.unit_price_minor??"")+"'><input id='q-discount-"+id+"' class='input' placeholder='Discount minor' value='"+esc(q.discount_minor??"")+"'><input id='q-shipping-"+id+"' class='input' placeholder='Shipping minor' value='"+esc(q.shipping_minor??"")+"'><input id='q-tax-"+id+"' class='input' placeholder='Tax minor' value='"+esc(q.tax_minor??"")+"'><input id='q-fees-"+id+"' class='input' placeholder='Other fees minor' value='"+esc(q.other_fees_minor??"")+"'><input id='q-moq-"+id+"' class='input' placeholder='MOQ (Iran owner)' value='"+esc(q.moq??"")+"'><input id='q-payment-"+id+"' class='input' placeholder='Payment terms' value='"+esc(q.payment_terms||"")+"'><input id='q-delivery-"+id+"' class='input' placeholder='Delivery terms' value='"+esc(q.delivery_terms||"")+"'><input class='input' disabled value='Subtotal: "+esc(q.subtotal_minor??"UNKNOWN")+"'><input class='input' disabled value='Total: "+esc(q.total_minor??"UNKNOWN")+"'></div><textarea id='q-text-"+id+"' class='input' style='margin-top:8px;min-height:90px' placeholder='Owner-approved customer quote text'>"+esc(q.approved_quote_text||"")+"</textarea><div class='tools' style='margin-top:8px'>"+(["draft","needs_details","requires_owner_review","waiting_for_owner_price","waiting_for_price_match","quote_ready"].includes(q.status)?"<button class='btn' onclick='saveQuote(&quot;"+id+"&quot;)'>SAVE</button>":"")+(q.status==="quote_ready"?"<button class='btn' onclick='quoteTransition(&quot;"+id+"&quot;,&quot;submit&quot;)'>SUBMIT FOR APPROVAL</button>":"")+(q.status==="pending_approval"?"<button class='btn primary' onclick='quoteTransition(&quot;"+id+"&quot;,&quot;approve&quot;)'>APPROVE</button><button class='btn danger' onclick='quoteTransition(&quot;"+id+"&quot;,&quot;reject&quot;)'>REJECT</button>":"")+(q.status==="approved"?"<span class='ok'>APPROVED — SEND فقط از Outreach Approval</span>":"")+(q.status==="sent"?"<select id='q-accept-"+id+"' class='input'><option value=''>Customer acceptance message…</option></select><button class='btn' onclick='loadAcceptanceCandidates(&quot;"+id+"&quot;)'>LOAD REPLIES</button><button class='btn primary' onclick='acceptQuoteUi(&quot;"+id+"&quot;)'>ACCEPT</button>":"")+"</div></div>"}).join(""):"<div class='hint'>Quote وجود ندارد.</div>";
}
async function saveQuote(id){const body={id,market:qv(id,"market"),product:qv(id,"product"),quantity:nullableNumber(qv(id,"quantity")),price_item_id:qv(id,"priceitem")||null,currency:qv(id,"currency"),unit_price_minor:nullableNumber(qv(id,"unit")),discount_minor:nullableNumber(qv(id,"discount")),shipping_minor:nullableNumber(qv(id,"shipping")),tax_minor:nullableNumber(qv(id,"tax")),other_fees_minor:nullableNumber(qv(id,"fees")),moq:nullableNumber(qv(id,"moq")),payment_terms:qv(id,"payment"),delivery_terms:qv(id,"delivery"),approved_quote_text:qv(id,"text")};const d=await api("/api/quotes",{method:"PATCH",body:JSON.stringify(body)});$("quoteStatus").innerHTML=d.ok?"<span class='ok'>✓ Quote ذخیره شد؛ ارسال انجام نشد.</span>":"<span class='bad'>✕ "+esc(d.error)+"</span>";await loadQuotes()}
async function quoteTransition(id,action){const d=await api("/api/quotes/transition",{method:"POST",body:JSON.stringify({id,action})});$("quoteStatus").innerHTML=d.ok?"<span class='ok'>✓ "+esc(d.quote.status)+" · ارسال انجام نشد.</span>":"<span class='bad'>✕ "+esc(d.error)+"</span>";await Promise.all([loadQuotes(),loadOutreachApprovals()])}
async function loadAcceptanceCandidates(id){const d=await api("/api/quotes/acceptance-candidates?id="+encodeURIComponent(id)),sel=$("q-accept-"+id);if(!d.ok){$("quoteStatus").innerHTML="<span class='bad'>✕ "+esc(d.error)+"</span>";return}sel.innerHTML="<option value=''>"+(d.items.length?"Customer acceptance message…":"No customer reply after quote")+"</option>"+d.items.map(m=>"<option value='"+esc(m.id)+"'>"+esc(String(m.created_at).slice(0,16))+" · "+esc(String(m.message||"").slice(0,80))+"</option>").join("")}
async function acceptQuoteUi(id){const inbox=$("q-accept-"+id)?.value||"";if(!inbox){$("quoteStatus").innerHTML="<span class='bad'>✕ Select the customer's acceptance message first.</span>";return}if(!confirm("Record customer acceptance from the selected message? This creates an order candidate (not a confirmed order)."))return;const d=await api("/api/quotes/transition",{method:"POST",body:JSON.stringify({id,action:"accept",inbox_message_id:inbox})});await Promise.all([loadQuotes(),loadOrders()]);$("quoteStatus").innerHTML=d.ok?"<span class='ok'>✓ accepted · order candidate "+esc(d.order?.order_number||"")+"</span>":"<span class='bad'>✕ "+esc(d.error)+"</span>"}
async function loadOrders(){
 const status=$("orderStatus"),list=$("orderItems");status.textContent="در حال دریافت سفارش‌ها…";const d=await api("/api/orders");
 if(!d.ok){status.innerHTML="<span class='bad'>✕ "+esc(d.error||"Orders unavailable")+"</span>";list.innerHTML="";return}
 const items=d.items||[];status.textContent=items.length+" Order · تأیید سفارش به معنی پرداخت یا درآمد نیست.";
 list.innerHTML=items.length?items.map(o=>{const id=esc(o.id),canConfirm=o.status==="order_candidate",canCancel=o.status==="order_candidate"||o.status==="confirmed",canPay=o.status==="confirmed"||o.status==="partially_paid",f=o.financials||{},cur=esc(o.currency),hint=esc(o.currency_input_hint||"");return "<div class='row'><b>"+esc(o.order_number)+" · "+esc(o.lead_name||o.lead_id)+"</b><div class='mini'>Status: "+esc(o.status)+" · Quote: "+esc(o.quote_id)+" · Market: "+esc(o.market||"—")+"</div><div class='mini'>"+esc(o.product)+" · Qty "+esc(o.quantity)+" · "+esc(o.currency)+" "+esc(o.total_minor??"UNKNOWN")+"</div><div class='mini'>Customization: "+esc(o.customization||"—")+" · Destination: "+esc(o.destination||"—")+"</div><div class='mini'>Acceptance: "+esc(o.acceptance_source||"—")+" · Inbox "+esc(o.acceptance_inbox_message_id||"—")+" · "+esc(o.customer_accepted_at||"—")+"</div><div class='mini'>Paid: "+cur+" "+esc(f.paid_minor??0)+" / "+esc(f.total_minor??"UNKNOWN")+" · Outstanding: "+esc(f.outstanding_minor??"UNKNOWN")+" · Profit: "+(f.profit_minor===null||f.profit_minor===undefined?"UNKNOWN (missing: "+esc((f.missing_costs||[]).join(", "))+")":esc(f.profit_minor)+(f.profit_realized?" · realized":" · expected"))+"</div>"+(o.status!=="cancelled"?"<div class='grid4' style='margin-top:8px'><input id='o-unitcost-"+id+"' class='input' placeholder='Unit cost · "+hint+"' title='"+hint+"' value='"+esc(o.unit_cost_minor??"")+"'><input id='o-shipcost-"+id+"' class='input' placeholder='Shipping cost · "+hint+"' title='"+hint+"' value='"+esc(o.shipping_cost_minor??"")+"'><input id='o-othercost-"+id+"' class='input' placeholder='Other cost · "+hint+"' title='"+hint+"' value='"+esc(o.other_cost_minor??"")+"'><button class='btn' onclick='saveOrderCosts(&quot;"+id+"&quot;)'>SAVE COSTS</button></div>":"")+(canPay?"<div class='grid4' style='margin-top:8px'><select id='o-kind-"+id+"' class='input'><option value='deposit'>deposit</option><option value='partial'>partial</option><option value='full'>full</option></select><input id='o-amount-"+id+"' class='input' placeholder='"+cur+" · "+hint+"' title='"+hint+"'><select id='o-method-"+id+"' class='input'><option value='bank_transfer'>bank_transfer</option><option value='card_to_card'>card_to_card</option><option value='cash'>cash</option><option value='exchange_hawala'>exchange_hawala</option><option value='other'>other</option></select><input id='o-ref-"+id+"' class='input' placeholder='Payment reference / receipt no.'></div>":"")+(o.carrier||o.tracking_reference?"<div class='mini'>Carrier: "+esc(o.carrier||"—")+" · Tracking: "+esc(o.tracking_reference||"—")+" · Shipped: "+esc(o.shipped_at||"—")+" · Delivered: "+esc(o.delivered_at||"—")+"</div>":"")+(o.update_drafts?"<div class='mini'>Customer update drafts (Outreach Approval): "+esc(o.update_drafts)+"</div>":"")+(o.status==="paid"?"<div class='grid4' style='margin-top:8px'><input id='o-carrier-"+id+"' class='input' placeholder='Carrier'><input id='o-tracking-"+id+"' class='input' placeholder='Tracking reference'><input id='o-shippedat-"+id+"' class='input' type='date' title='Shipment date'></div>":"")+(o.status==="shipped"?"<div class='grid4' style='margin-top:8px'><input id='o-deliveredat-"+id+"' class='input' type='date' title='Delivery date'></div>":"")+"<div class='tools' style='margin-top:8px'>"+(canConfirm?"<button class='btn primary' onclick='orderTransition(&quot;"+id+"&quot;,&quot;confirm&quot;)'>CONFIRM ORDER</button>":"")+(canPay?"<button class='btn primary' onclick='recordOrderPaymentUi(&quot;"+id+"&quot;,&quot;"+cur+"&quot;)'>RECORD PAYMENT</button>":"")+(o.status==="paid"?"<button class='btn primary' onclick='orderTransition(&quot;"+id+"&quot;,&quot;ship&quot;)'>SHIP</button>":"")+(o.status==="shipped"?"<button class='btn primary' onclick='orderTransition(&quot;"+id+"&quot;,&quot;fulfill&quot;)'>MARK DELIVERED</button>":"")+(canCancel?"<button class='btn danger' onclick='orderTransition(&quot;"+id+"&quot;,&quot;cancel&quot;)'>CANCEL ORDER</button>":"")+(Number(f.paid_minor||0)||o.status==="partially_paid"||o.status==="paid"?"<button class='btn' onclick='loadOrderPayments(&quot;"+id+"&quot;,&quot;"+esc(o.status)+"&quot;)'>PAYMENTS</button>":"")+"</div><div id='o-payments-"+id+"'></div></div>"}).join(""):"<div class='hint'>Order Candidate وجود ندارد.</div>";
}
async function orderTransition(id,action){let reason=null;if(action==="cancel"){reason=prompt("Cancellation reason");if(reason===null)return;if(!reason.trim()){$("orderStatus").innerHTML="<span class='bad'>✕ Cancellation reason is required.</span>";return}}const d=await api("/api/orders/transition",{method:"POST",body:JSON.stringify({id,action,reason,carrier:ov(id,"carrier").trim(),tracking_reference:ov(id,"tracking").trim(),shipped_at:ov(id,"shippedat"),delivered_at:ov(id,"deliveredat")})});$("orderStatus").innerHTML=d.ok?"<span class='ok'>✓ "+esc(d.order.status)+" · هیچ وضعیت پرداختی ایجاد نشد.</span>":"<span class='bad'>✕ "+esc(d.error)+"</span>";await loadOrders()}
function ov(id,name){return $("o-"+name+"-"+id)?.value??""}
function siJ(x){return esc(JSON.stringify(x??null))}
function siMoneyText(cur,m){return m===null||m===undefined?"UNKNOWN":esc(cur||"")+" "+esc(m)}
async function siLoadAll(){await Promise.all([siLoadDecisions(),siLoadGaps(),siLoadRequests(),siLoadMoney(),siLoadKnowledge(),siLoadIntel()])}
async function siLoadDecisions(){const st=$("siDecisionFilter")?.value||"PENDING",d=await api("/api/si/decisions?status="+encodeURIComponent(st)),box=$("siDecisions");if(!box)return;if(!d.ok){$("siDecisionLine").innerHTML="<span class='bad'>✕ "+esc(d.error)+"</span>";box.innerHTML="";return}
 const items=d.items||[];$("siDecisionLine").textContent=items.length+" decision · "+st;
 box.innerHTML=items.map(x=>{const id=esc(x.id),pending=x.status==="PENDING";return "<div class='row'><b>"+esc(x.decision_type)+" · P"+esc(x.priority)+"</b> <span class='mini'>"+esc(x.status)+" · "+esc(x.market||"—")+" · "+esc(x.product_key||"—")+"</span><div>"+esc(x.question)+"</div><div class='mini'>Known: "+siJ(x.known)+"</div>"+(x.missing?.length?"<div class='mini bad'>Missing: "+siJ(x.missing)+"</div>":"")+(x.conflicting?.length?"<div class='mini bad'>Conflicts: "+siJ(x.conflicting)+"</div>":"")+(x.recommendation?"<div class='mini'>AI recommendation: "+esc(x.recommendation)+"</div>":"")+(x.risk?"<div class='mini'>Risk: "+esc(x.risk)+"</div>":"")+(pending?"<div class='grid4' style='margin-top:6px'><input id='si-ans-"+id+"' class='input' placeholder='Answer: value or JSON e.g. {&quot;unit_price_minor&quot;:12500}'><input id='si-note-"+id+"' class='input' placeholder='Owner note'><select id='si-scope-"+id+"' class='input'><option value='CASE_ONLY'>CASE ONLY</option><option value='SAVE_AS_KNOWLEDGE'>SAVE AS KNOWLEDGE</option><option value='UPDATE_EXISTING'>UPDATE EXISTING</option><option value='NEW_VERSION'>CREATE NEW VERSION</option></select></div><div class='tools' style='margin-top:6px'><button class='btn primary' onclick='siResolve(&quot;"+id+"&quot;,&quot;APPROVE&quot;)'>APPROVE</button><button class='btn' onclick='siResolve(&quot;"+id+"&quot;,&quot;ANSWER&quot;)'>ANSWER</button><button class='btn danger' onclick='siResolve(&quot;"+id+"&quot;,&quot;REJECT&quot;)'>REJECT</button><button class='btn' onclick='siHistory(&quot;"+id+"&quot;)'>HISTORY</button></div>":"<div class='mini'>Owner: "+esc(x.owner_decision||"—")+" · "+esc(x.knowledge_action||"—")+" · "+esc(x.resulting_ref||"")+" · "+esc(x.owner_note||"")+"</div>")+"<div id='si-hist-"+id+"' class='mini'></div></div>"}).join("")||"<div class='hint'>تصمیم معلقی وجود ندارد.</div>"}
function siAnswer(id){const raw=($("si-ans-"+id)?.value||"").trim();if(!raw)return {};if(raw.startsWith("{")){try{return JSON.parse(raw)}catch(e){return null}}return {value:raw}}
async function siResolve(id,action){const answer=siAnswer(id);if(answer===null){$("siDecisionLine").innerHTML="<span class='bad'>✕ Answer JSON is invalid.</span>";return}const scope=$("si-scope-"+id)?.value||"CASE_ONLY";
 if(scope!=="CASE_ONLY"&&action!=="REJECT"&&!confirm("Save this as reusable approved knowledge ("+scope+")? Case-only decisions never become global rules."))return;
 const d=await api("/api/si/decisions/resolve",{method:"POST",body:JSON.stringify({id,action,scope,answer,note:$("si-note-"+id)?.value||""})});await siLoadAll();$("siDecisionLine").innerHTML=d.ok?"<span class='ok'>✓ "+esc(d.decision?.status)+" · "+esc(d.effect?.knowledge_action||"")+"</span>":"<span class='bad'>✕ "+esc(d.error)+"</span>"}
async function siHistory(id){const d=await api("/api/si/decisions/"+encodeURIComponent(id)+"/history"),b=$("si-hist-"+id);if(b)b.innerHTML=d.ok?(d.items||[]).map(h=>esc(String(h.created_at).slice(0,16))+" · "+esc(h.type)).join(" | ")||"—":esc(d.error)}
async function siLoadGaps(){const d=await api("/api/si/gaps"),box=$("siGaps");if(!box)return;box.innerHTML=d.ok?(d.items||[]).slice(0,20).map(g=>"<div class='row'><b>"+esc(g.decision_type)+" · "+esc(g.status)+"</b><div class='mini'>"+esc(g.product_key||"—")+" · "+esc(g.attribute_key||"")+" "+esc(g.value_text||"")+" · "+esc(g.occurrences)+"x · leads "+esc((JSON.parse(g.lead_ids_json||"[]")).length)+"</div></div>").join("")||"<div class='hint'>—</div>":"<span class='bad'>✕ "+esc(d.error)+"</span>"}
async function siLoadRequests(){const d=await api("/api/si/requests"),box=$("siRequests");if(!box)return;if(!d.ok){box.innerHTML="<span class='bad'>✕ "+esc(d.error)+"</span>";return}
 box.innerHTML=(d.items||[]).slice(0,30).map(r=>{const id=esc(r.id),m=r.margin||{};return "<div class='row'><b>"+esc(r.request_class||"—")+" · "+esc(r.product_key||r.product_text||"?")+" · "+esc(r.market||"?")+" · qty "+esc(r.quantity??"?")+"</b><div class='mini'>Config: "+esc(r.matched_config_key||"—")+" · Requirements: "+siJ(Object.fromEntries(Object.entries(r.requirements||{}).map(([k,v])=>[k,v.value])))+"</div>"+(r.missing?.length?"<div class='mini bad'>Missing: "+siJ(r.missing)+"</div>":"")+(r.custom_reasons?.length?"<div class='mini'>Custom: "+siJ(r.custom_reasons)+"</div>":"")+"<div class='mini'>Quote: "+esc(r.quote_status||"none")+" · "+esc(r.pricing_mode||"—")+" · unit "+siMoneyText(r.currency,r.unit_price_minor)+" · total "+siMoneyText(r.currency,r.total_minor)+" · price v"+esc(r.price_version??"—")+" tier "+esc(r.quantity_min??"—")+"-"+esc(r.quantity_max??"∞")+"</div><div class='mini'>Margin: "+(m.status==="KNOWN"?siMoneyText(m.currency,m.margin_minor)+" ("+esc(m.margin_bp===null?"n/a":(m.margin_bp/100).toFixed(2)+"%")+")"+(m.warning?" · <span class='bad'>"+esc(m.warning)+"</span>":""):"UNKNOWN · COST DATA REQUIRED "+siJ(m.missing_components||[]))+" · cost "+siMoneyText(m.currency,m.cost_minor)+"</div><div class='tools'><button class='btn' onclick='siProcess(&quot;"+id+"&quot;)'>RE-PREPARE</button><button class='btn' onclick='siResetRequest(&quot;"+id+"&quot;)'>RESET FOR NEW PURCHASE</button></div></div>"}).join("")||"<div class='hint'>درخواستی وجود ندارد.</div>"}
async function siProcess(id){const d=await api("/api/si/requests/"+encodeURIComponent(id)+"/process",{method:"POST",body:"{}"});await siLoadAll();if(!d.ok)$("siDecisionLine").innerHTML="<span class='bad'>✕ "+esc(d.error)+"</span>"}
async function siResetRequest(id){if(!confirm("Reset this sales request (requirements and case-only overrides) for a new purchase?"))return;await api("/api/si/requests/"+encodeURIComponent(id)+"/reset",{method:"POST",body:"{}"});await siLoadAll()}
async function siLoadMoney(){const d=await api("/api/si/money-at-stake"),box=$("siMoney");if(!box)return;if(!d.ok){box.innerHTML="<span class='bad'>✕ "+esc(d.error)+"</span>";return}
 box.innerHTML="<div class='mini'>Pending decisions: "+esc((d.pending_decisions||[]).map(x=>x.decision_type+" "+x.n).join(" · ")||"0")+"</div><div class='mini'>Quotes awaiting owner: "+esc((d.quotes_awaiting_owner||[]).length)+" · quote value "+siJ(d.quote_value_by_currency)+"</div><div class='mini'>Awaiting payment: "+esc((d.orders_awaiting_payment||[]).length)+" · partial balances "+esc((d.partial_balances||[]).length)+" · outstanding "+siJ(d.outstanding_by_currency)+"</div><div class='mini'>Margin warnings: "+esc((d.margin_warnings||[]).length)+" · stalled owner items "+esc((d.stalled_commercial||[]).length)+" · repeat opportunities "+esc((d.repeat_opportunities||[]).length)+"</div>"}
const SI_TEMPLATES={product:{name:"",family:"",aliases:[]},attribute:{product_key:"",attribute_key:"",label:"",attribute_kind:"color",value_type:"enum",required:true,commercial_critical:true,allowed_values:[{value:"",aliases:[]}],question_fa:"",question_ar:"",priority:10},configuration:{product_key:"",market:"*",attributes:{},label:""},compatibility:{scope:{product_key:""},attributes:{},verdict:"approved"},price:{market:"IRAN",product_key:"",config_key:"",quantity_min:null,quantity_max:null,unit_price_minor:null,moq:null},cost:{market:"IRAN",product_key:"",config_key:"*",quantity_min:1,quantity_max:null,component:"",basis:"per_unit",amount_minor:null},setting:{setting_key:"",scope:{market:"IRAN"},value:null}};
function siTemplate(){$("siKInput").value=JSON.stringify(SI_TEMPLATES[$("siKind").value]||{},null,1)}
async function siLoadKnowledge(){const kind=$("siKind")?.value||"product",d=await api("/api/si/knowledge/"+kind+"?status="+encodeURIComponent($("siKStatus")?.value||"current")+"&search="+encodeURIComponent($("siKSearch")?.value||"")),box=$("siKnowledge");if(!box)return;if(!d.ok){$("siKLine").innerHTML="<span class='bad'>✕ "+esc(d.error)+"</span>";box.innerHTML="";return}
 $("siKLine").textContent=(d.items||[]).length+" "+kind;box.innerHTML=(d.items||[]).map(x=>{const {id,approved_by,approved_at,created_at,source_decision_id,...rest}=x;return "<div class='row'><b>"+esc(kind)+" v"+esc(x.version)+" · "+esc(x.status)+"</b><div class='mini'>"+siJ(rest)+"</div><div class='mini'>approved "+esc(approved_by)+" · "+esc(String(approved_at||"").slice(0,16))+(source_decision_id?" · decision "+esc(source_decision_id):"")+"</div>"+(x.status==="current"?"<div class='tools'><button class='btn danger' onclick='siRetire(&quot;"+esc(kind)+"&quot;,&quot;"+esc(id)+"&quot;)'>RETIRE</button></div>":"")+"</div>"}).join("")||"<div class='hint'>دانشی ثبت نشده است.</div>"}
async function siSaveKnowledge(expectExisting){let input;try{input=JSON.parse($("siKInput").value||"{}")}catch(e){$("siKLine").innerHTML="<span class='bad'>✕ Invalid JSON</span>";return}const kind=$("siKind").value;
 const d=await api("/api/si/knowledge/"+kind,{method:"POST",body:JSON.stringify({input,expect_existing:expectExisting})});await siLoadKnowledge();$("siKLine").innerHTML=d.ok?"<span class='ok'>✓ "+(d.idempotent?"unchanged":"version "+esc(d.row?.version)+" saved")+"</span>":"<span class='bad'>✕ "+esc(d.error)+"</span>"}
async function siRetire(kind,id){if(!confirm("Retire this current knowledge? History is kept."))return;const d=await api("/api/si/knowledge/"+kind+"/retire",{method:"POST",body:JSON.stringify({id})});await siLoadKnowledge();if(!d.ok)$("siKLine").innerHTML="<span class='bad'>✕ "+esc(d.error)+"</span>"}
async function siLoadIntel(){const dim=$("siDim")?.value||"market",d=await api("/api/si/intelligence?dimension="+encodeURIComponent(dim)),a=await api("/api/si/ai-usage"),box=$("siIntel"),ab=$("siAi");if(!box)return;
 box.innerHTML=d.ok?(d.items||[]).map(r=>"<div class='mini'>"+esc(r.bucket)+" · "+esc(r.currency)+(r.legacy_currency?" LEGACY":"")+" · orders "+esc(r.orders)+" · paid "+esc(r.paid_orders)+" · received "+esc(r.paid_minor)+" · profit "+esc(r.profit_known_orders?r.profit_minor:"UNKNOWN")+" · repeat "+esc(r.repeat_orders)+"</div>").join("")||"<div class='hint'>REBUILD to compute attribution.</div>":"<span class='bad'>✕ "+esc(d.error)+"</span>";
 if(ab)ab.innerHTML=a.ok?(a.items||[]).map(r=>"<div class='mini'>AI · "+esc(r.module)+"/"+esc(r.task)+" · "+esc(r.model||"?")+" · calls "+esc(r.calls)+" · tokens "+esc(r.input_tokens??"?")+"/"+esc(r.output_tokens??"?")+" · cost "+(r.cost_status==="unknown"?"UNKNOWN":esc(r.cost_currency)+" "+esc(r.cost_minor))+"</div>").join("")||"<div class='hint'>No AI usage recorded yet.</div>":""}
async function siRebuildIntel(){await api("/api/si/intelligence",{method:"POST",body:"{}"});await siLoadIntel()}
async function loadRevenueRecovery(){const s=await api("/api/revenue/summary"),f=await api("/api/revenue/followups");
 $("revenueSummary").innerHTML=s.ok?(Object.entries(s.by_currency||{}).map(([c,x])=>"<div class='row'><b>"+esc(c)+"</b>"+(x.legacy_currency?" <span class='bad'>LEGACY · not converted</span>":"")+"<div class='mini'>Received: "+esc(x.received_minor)+" · Outstanding: "+esc(x.outstanding_minor)+" · Realized profit: "+esc(x.realized_profit_minor??"UNKNOWN")+(x.paid_orders_missing_costs?" ("+esc(x.paid_orders_missing_costs)+" paid orders missing costs)":"")+"</div><div class='mini'>Quotes "+esc(x.quotes)+" · Orders "+esc(x.orders)+" · Paid "+esc(x.paid)+" · Fulfilled "+esc(x.fulfilled)+"</div></div>").join("")||"<div class='hint'>هنوز درآمدی ثبت نشده است.</div>")+"<div class='mini'>Repeat customers: "+esc(s.counts?.repeat_customers??0)+" · USD amounts in cents · TOMAN amounts in whole Toman</div>":"<span class='bad'>✕ "+esc(s.error)+"</span>";
 if(!f.ok){$("followupStatus").innerHTML="<span class='bad'>✕ "+esc(f.error)+"</span>";$("followupItems").innerHTML="";return}
 const items=f.items||[];$("followupStatus").textContent=items.length+" مورد پیگیری · ارسال خودکار انجام نمی‌شود.";
 $("followupItems").innerHTML=items.map(x=>"<div class='row'><b>"+esc(x.kind)+" · "+esc(x.lead_name||x.lead_id)+"</b><div class='mini'>"+esc(x.item_type)+" "+esc(x.item_id)+" · "+esc(x.age_days??"—")+" days · "+(x.audience==="owner"?"OWNER ACTION":"Draft: "+esc(x.draft_outreach_id||"not created yet (Outreach Approval)"))+(x.outstanding_minor!==undefined?" · Outstanding "+esc(x.currency)+" "+esc(x.outstanding_minor):"")+"</div></div>").join("")||"<div class='hint'>مورد معوقی وجود ندارد.</div>"}
async function runRevenueFollowupsUi(){const d=await api("/api/revenue/followups/run",{method:"POST",body:"{}"});await Promise.all([loadRevenueRecovery(),loadOutreachApprovals()]);$("followupStatus").innerHTML=d.ok?"<span class='ok'>✓ "+esc(d.drafts_created)+" draft created · "+esc(d.already_drafted)+" already drafted · "+esc(d.skipped_no_contact)+" no contact</span>":"<span class='bad'>✕ "+esc(d.error)+"</span>"}
async function recordOrderPaymentUi(id,currency){const kind=ov(id,"kind"),amount=nullableNumber(ov(id,"amount")),method=ov(id,"method"),reference=ov(id,"ref").trim();if(!confirm("Record "+kind+" payment "+currency+" "+amount+" via "+method+" (ref "+reference+")? Payment records cannot be edited or deleted."))return;const d=await api("/api/orders/payment",{method:"POST",body:JSON.stringify({order_id:id,payment_kind:kind,amount_minor:amount,currency,method,reference})});$("orderStatus").innerHTML=d.ok?"<span class='ok'>✓ "+esc(d.order.status)+(d.idempotent?" · already recorded":"")+"</span>":"<span class='bad'>✕ "+esc(d.error)+"</span>";await loadOrders()}
async function loadOrderPayments(id,status){const d=await api("/api/orders/payments?order_id="+encodeURIComponent(id)),box=$("o-payments-"+id);if(!box)return;if(!d.ok){box.innerHTML="<span class='bad'>✕ "+esc(d.error)+"</span>";return}const canReverse=status==="partially_paid"||status==="paid";box.innerHTML=(d.items||[]).map(p=>{const rev=p.payment_kind==="reversal",done=!!p.reversed_by;return "<div class='mini'"+(rev||done?" style='text-decoration:"+(done?"line-through":"none")+"'":"")+">"+(rev?"↩ REVERSAL of "+esc(p.reference)+" · ":"")+esc(p.payment_kind)+" · "+esc(p.currency)+" "+esc(p.amount_minor)+" · "+esc(p.method)+" · ref "+esc(rev?"—":p.reference)+" · "+esc(String(p.recorded_at||"").slice(0,16))+" · "+esc(p.recorded_by)+(rev?" · reason: "+esc(p.notes||""):"")+(done?" · REVERSED":"")+(!rev&&!done&&canReverse?" <button class='btn danger' onclick='reversePaymentUi(&quot;"+esc(p.id)+"&quot;,&quot;"+id+"&quot;)'>REVERSE PAYMENT</button>":"")+"</div>"}).join("")||"<div class='hint'>No payments.</div>"}
async function reversePaymentUi(paymentId,orderId){const reason=prompt("Reversal reason (required)");if(reason===null)return;if(!reason.trim()){$("orderStatus").innerHTML="<span class='bad'>✕ Reversal reason is required.</span>";return}if(!confirm("Reverse this payment? The original stays in the ledger and a linked reversal entry is added. No customer message is sent."))return;const d=await api("/api/orders/payment/reverse",{method:"POST",body:JSON.stringify({payment_id:paymentId,reason})});await loadOrders();$("orderStatus").innerHTML=d.ok?"<span class='ok'>✓ "+(d.idempotent?"already reversed":"reversed")+" · order "+esc(d.order?.status||"")+"</span>":"<span class='bad'>✕ "+esc(d.error)+"</span>"}
async function saveOrderCosts(id){const d=await api("/api/orders/costs",{method:"POST",body:JSON.stringify({id,unit_cost_minor:nullableNumber(ov(id,"unitcost")),shipping_cost_minor:nullableNumber(ov(id,"shipcost")),other_cost_minor:nullableNumber(ov(id,"othercost"))})});$("orderStatus").innerHTML=d.ok?"<span class='ok'>✓ Costs saved · Profit: "+esc(d.financials.profit_minor??"UNKNOWN")+"</span>":"<span class='bad'>✕ "+esc(d.error)+"</span>";await loadOrders()}
let priceVersionBaseId="",priceItemCache={};
async function loadPriceItems(){const d=await api("/api/commercial-price-items"),list=$("priceItems");if(!d.ok){$("priceStatus").innerHTML="<span class='bad'>✕ "+esc(d.error)+"</span>";list.innerHTML="";return}priceItemCache=Object.fromEntries((d.items||[]).map(x=>[x.id,x]));list.innerHTML=(d.items||[]).map(x=>"<div class='row'><b>"+esc(x.product_name)+" · v"+esc(x.version)+"</b><div class='mini'>"+esc(x.product_key)+" · SKU "+esc(x.sku||"—")+" · "+esc(x.currency)+" "+esc(x.unit_price_minor)+" · MOQ "+esc(x.moq??"—")+" · "+(x.active?"ACTIVE":"INACTIVE")+"</div><div class='tools'><button class='btn' onclick='preparePriceVersion(&quot;"+esc(x.id)+"&quot;)'>NEW VERSION</button><button class='btn' onclick='togglePrice(&quot;"+esc(x.id)+"&quot;,"+(!x.active)+")'>"+(x.active?"DEACTIVATE":"ACTIVATE")+"</button></div></div>").join("")||"<div class='hint'>Price item وجود ندارد.</div>"}
async function createPriceVersion(){const body={base_id:priceVersionBaseId||undefined,product_name:$("priceName").value.trim(),product_key:$("priceKey").value.trim(),sku:$("priceSku").value.trim(),currency:$("priceCurrency").value.trim(),unit_price_minor:nullableNumber($("priceUnit").value),moq:nullableNumber($("priceMoq").value),effective_from:$("priceFrom").value.trim()||null,effective_until:$("priceUntil").value.trim()||null};const d=await api("/api/commercial-price-items",{method:"POST",body:JSON.stringify(body)});if(d.ok)priceVersionBaseId="";$("priceStatus").innerHTML=d.ok?"<span class='ok'>✓ Version جدید ثبت شد.</span>":"<span class='bad'>✕ "+esc(d.error)+"</span>";await loadPriceItems()}
function preparePriceVersion(id){const x=priceItemCache[id];if(!x)return;priceVersionBaseId=id;$("priceName").value=x.product_name||"";$("priceKey").value=x.product_key||"";$("priceSku").value=x.sku||"";$("priceCurrency").value=x.currency||"";$("priceUnit").value="";$("priceMoq").value=x.moq??"";$("priceFrom").value="";$("priceUntil").value="";$("priceStatus").textContent="قیمت جدید را وارد و سپس ADD را بزنید؛ رکورد قبلی تغییر نمی‌کند."}
async function togglePrice(id,active){const d=await api("/api/commercial-price-items/activation",{method:"PATCH",body:JSON.stringify({id,active})});$("priceStatus").innerHTML=d.ok?"<span class='ok'>✓ وضعیت ثبت شد.</span>":"<span class='bad'>✕ "+esc(d.error)+"</span>";await loadPriceItems()}
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
  await loadPhotoAutopilot();
await loadVideoAutopilot();
}
async function loadPhotoAutopilot(){
  const d=await api("/api/photo-autopilot/status");

  if(!d.ok){
    $("photoAutoState").textContent="ERROR";
    $("photoAutoState").className="tag bad";
    $("photoActivity").innerHTML=
      "<span class='bad'>✕ "+esc(d.error||"Photo API error")+"</span>";
    return;
  }

  const on=d.enabled!==false;

  $("photoAutoState").textContent=on?"ON":"OFF";
  $("photoAutoState").className="tag "+(on?"ok":"bad");

  $("photoStatus").innerHTML=
    on
      ? "<span class='ok'>ENABLED</span>"
      : "<span class='bad'>DISABLED</span>";

  $("photoCycle").textContent=String(d.cycle??"—");

  $("photoProgress").textContent=
    String(d.used_in_cycle??0)+" / "+String(d.total_source_photos??0)+
    " · remaining: "+String(d.remaining_in_cycle??0);

  $("photoToday").innerHTML=d.generated_today
    ? "<span class='ok'>GENERATED</span>"
    : "<span class='muted'>NOT GENERATED</span>";

  if(d.today){
    $("photoActivity").innerHTML=
      "<span class='ok'>✓ TODAY</span>"+
      " · source: "+esc(d.today.source_media_id||"—")+
      " · output: "+esc(d.today.output_media_id||"—")+
      " · cycle: "+esc(d.today.cycle??"—");
  }else{
    $("photoActivity").textContent="امروز هنوز تصویری تولید نشده است.";
  }
}
async function loadVideoAutopilot(){
  const d=await api("/api/video-autopilot/status");

  if(!d.ok){
    $("videoAutoState").textContent="ERROR";
    $("videoAutoState").className="tag bad";
    $("videoStatus").innerHTML=
      "<span class='bad'>✕ "+esc(d.error||"Video API error")+"</span>";
    $("videoActivity").textContent="خطا در دریافت وضعیت Video Autopilot.";
    return;
  }

  const on=d.enabled!==false;
  const videoStatusLabels={
    kling_submitting:"Kling Submitting",
    kling_rejected:"Kling Rejected",
    kling_submission_ambiguous:"Kling Submission Ambiguous — DO NOT RETRY",
    generating:"Generating"
  };
  const statusLabel=status=>videoStatusLabels[String(status||"")]||String(status||"idle");

  $("videoAutoState").textContent=on?"ON":"OFF";
  $("videoAutoState").className="tag "+(on?"ok":"bad");

  $("videoStatus").innerHTML=
    on
      ? "<span class='ok'>ENABLED</span>"
      : "<span class='bad'>DISABLED</span>";

  $("videoCycle").textContent=d.week_id||"—";

  $("videoProgress").textContent=
    statusLabel(d.status);

  $("videoToday").innerHTML=
    d.status==="video_ready"
      ? "<span class='ok'>READY</span>"
      : "<span class='muted'>NOT READY</span>";

  const currentWeek=d.current_week;
  if(currentWeek && typeof currentWeek==="object"){
    const sourceIds=Array.isArray(currentWeek.source_media_ids)
      ? currentWeek.source_media_ids.map(esc).join(", ")
      : "";
    const error=currentWeek.error && typeof currentWeek.error==="object"
      ? currentWeek.error
      : null;
    const eventText=error
      ? "<div><b>Kling submission"+(error.stage?" ("+esc(error.stage)+")":"")+":</b> "+
        (error.message?esc(error.message):esc(error.event_type||"Recorded"))+
        (error.http_status!==null&&error.http_status!==undefined?" · HTTP "+esc(error.http_status):"")+
        (error.response_category?" · "+esc(error.response_category):"")+
        (error.external_task_id?" · external: "+esc(error.external_task_id):"")+
        (error.retry_forbidden?" · <span class='bad'>DO NOT RETRY</span>":"")+
        (error.created_at?" · "+esc(error.created_at):"")+"</div>"
      : "";
    $("videoCurrentWeek").innerHTML=
      "<div>Week: "+esc(currentWeek.week_id||"—")+"</div>"+
      "<div>Status: "+esc(currentWeek.exists?statusLabel(currentWeek.status):"No weekly row")+"</div>"+
      "<div>Reservation: "+(currentWeek.reservation_exists?"Present":"Not present")+"</div>"+
      (sourceIds?"<div>Selected source IDs: "+sourceIds+"</div>":"")+
      (currentWeek.task_id?"<div>Kling task: "+esc(currentWeek.task_id)+"</div>":"")+
      (currentWeek.shotstack_task_id?"<div>Shotstack render: "+esc(currentWeek.shotstack_task_id)+"</div>":"")+
      (currentWeek.output_media_id?"<div>Output: "+esc(currentWeek.output_media_id)+"</div>":"")+
      (currentWeek.created_at?"<div>Created: "+esc(currentWeek.created_at)+"</div>":"")+
      (currentWeek.updated_at?"<div>Updated: "+esc(currentWeek.updated_at)+"</div>":"")+
      (currentWeek.caption?"<div>Caption: "+esc(currentWeek.caption)+"</div>":"")+
      eventText;
  }else{
    $("videoCurrentWeek").textContent="Current-week details unavailable.";
  }

  const lastWeek=d.last_successful_week;
  if(lastWeek && typeof lastWeek==="object"){
    const sourceIds=Array.isArray(lastWeek.source_media_ids)
      ? lastWeek.source_media_ids.map(esc).join(", ")
      : "";
    $("videoLastSuccessfulWeek").innerHTML=
      "<div>Week: "+esc(lastWeek.week_id||"—")+"</div>"+
      "<div>Status: "+esc(lastWeek.status||"—")+"</div>"+
      (lastWeek.completed_at?"<div>Completed: "+esc(lastWeek.completed_at)+"</div>":"")+
      (lastWeek.output_media_id?"<div>Output: "+esc(lastWeek.output_media_id)+"</div>":"")+
      (lastWeek.caption?"<div>Caption: "+esc(lastWeek.caption)+"</div>":"")+
      (sourceIds?"<div>Selected source IDs: "+sourceIds+"</div>":"")+
      (lastWeek.task_id?"<div>Kling task: "+esc(lastWeek.task_id)+"</div>":"")+
      (lastWeek.shotstack_task_id?"<div>Shotstack render: "+esc(lastWeek.shotstack_task_id)+"</div>":"")+
      (lastWeek.created_at?"<div>Created: "+esc(lastWeek.created_at)+"</div>":"")+
      (lastWeek.updated_at?"<div>Updated: "+esc(lastWeek.updated_at)+"</div>":"");
  }else{
    $("videoLastSuccessfulWeek").textContent="No successful weekly video is recorded.";
  }

  const activity=await api("/api/video-autopilot/activity");

  if(activity.ok && Array.isArray(activity.activities) && activity.activities.length){
    const latest=activity.activities[0];

    let details={};

    try{
      details=JSON.parse(latest.details||"{}");
    }catch{}

    const error=details.error
      ? "<br><span class='bad'>ERROR: "+esc(details.error)+"</span>"
      : "";

    $("videoActivity").innerHTML=
      "<span class='ok'>✓ WEEK</span>"+
      " · "+esc(d.week_id||"—")+
      " · status: "+esc(d.status||"idle")+
      "<br><span class='muted'>"+
      esc(latest.message||latest.type||"Latest activity")+
      "</span>"+
      error;
  }else{
    $("videoActivity").innerHTML=
      "<span class='ok'>✓ WEEK</span>"+
      " · "+esc(d.week_id||"—")+
      " · status: "+esc(d.status||"idle");
  }
}

async function videoToggle(enabled){
  const d=await api("/api/video-autopilot/toggle",{
    method:"POST",
    body:JSON.stringify({enabled})
  });

  if(!d.ok){
    alert(d.error||"Video Autopilot toggle failed");
    return;
  }

  await loadVideoAutopilot();
  await loadStatus();
}
async function photoToggle(enabled){
  const d=await api("/api/photo-autopilot/toggle",{
    method:"POST",
    body:JSON.stringify({enabled})
  });

  if(!d.ok){
    alert(d.error||"Photo Autopilot toggle failed");
    return;
  }

  await loadPhotoAutopilot();
  await loadStatus();
}

async function photoRunNow(){
  $("photoActivity").textContent="در حال اجرای Photo Autopilot…";

  const d=await api("/api/photo-autopilot/run",{
    method:"POST",
    body:"{}"
  });

  if(d.ok){
    $("photoActivity").innerHTML=
      d.skipped
        ? d.reason==="photo_generation_in_progress"
          ? "<span class='warn'>⚠ تولید تصویر امروز در حال اجرا است.</span>"
          : "<span class='warn'>⚠ امروز قبلاً اجرا شده است.</span>"
        : "<span class='ok'>✓ Photo Autopilot اجرا شد.</span>";

    await loadPhotoAutopilot();
    await loadBrain();
  }else{
    $("photoActivity").innerHTML=
      "<span class='bad'>✕ "+esc(d.error||"Photo Autopilot failed")+"</span>";
  }
}
async function masterAction(action){$("masterHelp").textContent="در حال اجرای "+action+"…";const d=await api(A+"/master",{method:"POST",body:JSON.stringify({action})});$("masterHelp").innerHTML=d.ok?"<span class='ok'>✓ MASTER → "+esc(action)+" · وضعیت ثبت شد.</span>":"<span class='bad'>✕ "+esc(d.error||"unknown")+"</span>";await refreshAll()}
async function moduleToggle(module,enabled){const d=await api(A+"/module",{method:"POST",body:JSON.stringify({module,enabled})});if(!d.ok)alert(d.error||"خطا");await loadStatus()}
let commandRequestId=null;
async function sendCommand(){
 const raw=$("command").value.trim();
 if(!raw){
  $("commandStatus").innerHTML="<span class='warn'>لطفاً ابتدا دستور را وارد کنید.</span>";
  return;
 }
 commandRequestId=commandRequestId||("cmd-"+crypto.randomUUID());
 $("commandStatus").textContent="در حال تحلیل فرمان…";
 const d=await api(A+"/command",{method:"POST",body:JSON.stringify({command:raw,command_id:commandRequestId})});
 if(d.knowledge_router){
  const x=d.interpretation||{},request=d.request||{};
  const detail="Intent: "+esc(x.intent||"—")+" · "+esc(x.operation||"—")+" · "+esc(x.domain||"—")+" / "+esc(x.attribute||"—")+" · "+esc(x.market||"—");
  const review=d.change_request_id?" <a href='#knowledgePanel'>OPEN KNOWLEDGE REVIEW</a>":"";
  $("commandStatus").innerHTML=d.ok?"<span class='ok'>✓ "+esc(d.message||"Knowledge command handled")+"</span><div class='mini'>"+detail+" · Request: "+esc(d.change_request_id||"clarification")+review+"</div>":"<span class='bad'>✕ "+esc(d.error||"Knowledge command failed")+"</span>";
  commandRequestId=null;
  if(d.ok&&d.change_request_id)await loadSalesKnowledge();
  return;
 }
 $("commandStatus").innerHTML=d.ok
  ?"<span class='ok'>✓ فرمان ثبت شد · "+esc(d.command_id)+" · "+(d.plan?.tasks?.length||0)+" Task ساخته شد.</span>"
  :"<span class='bad'>✕ "+esc(d.error||"unknown")+"</span>";
 commandRequestId=null;
 if(d.ok){await runTasks()}
}
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
async function loadBrain(){
  const [d,photo]=await Promise.all([
    api(A+"/brain"),
    api("/api/photo-autopilot/activity")
  ]);

  if(!d.ok)return;

  $("brain").textContent=d.brain?.mission||"—";

  const base=d.brain?.timeline||[];

  const photoEvents=photo.ok
    ? (photo.activities||[]).map(x=>({
        type:x.type||"photo",
        message:x.message||"Photo Autopilot",
        created_at:x.created_at||""
      }))
    : [];

  const timeline=[...base,...photoEvents]
    .sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")))
    .slice(0,30);

  $("timeline").innerHTML=rows(
    timeline,
    x=>esc((x.type||"event")+" · "+(x.message||""))+
      "<small>"+esc(x.created_at||"")+"</small>"
  );
}
async function loadRevenue(){const d=await api(A+"/revenue");$("revenue").innerHTML=d.ok?rows(Object.entries(d.funnel||{}).map(([k,v])=>({k,v})),x=>esc(x.k)+" · "+esc(x.v)):"—"}
let adAutopilotItems=[];

function renderAdAutopilotItems(items){
 adAutopilotItems=Array.isArray(items)?items:[];

 $("adAutopilotPreview").innerHTML=adAutopilotItems.length
  ?adAutopilotItems.map((x,i)=>{
    let meta={};

    try{
      meta=typeof x.notes==="string"
        ?JSON.parse(x.notes||"{}")
        :(x.notes||{});
    }catch{}

    const telegramUrl=String(meta.telegram_url||"").trim();
    const telegramUsername=String(meta.telegram_username||"").trim();

    const telegramButton=telegramUrl
      ?"<div class='tools' style='margin-top:7px'>"+
        "<a class='btn' target='_blank' rel='noopener noreferrer' href='"+
        esc(telegramUrl)+
        "'>✈️ Telegram"+
        (telegramUsername?" @"+esc(telegramUsername):"")+
        "</a>"+
        "</div>"
      :"";

    return
      "<div class='row'>"+
      "<label style='display:flex;gap:8px;align-items:flex-start'>"+
      "<input type='checkbox' class='adCleanupCheck' data-id='"+
      esc(x.id||"")+
      "' style='margin-top:5px'>"+
      "<span>"+
      "<b>"+esc(x.name||x.contact||x.id||"—")+"</b>"+
      " · "+esc(x.stage||"new")+
      " · "+esc(x.priority||"normal")+
      "<small>"+
      esc(x.type||"")+" · "+
      esc(x.city||"")+" · "+
      esc(x.id||"")+
      "</small>"+
      telegramButton+
      "</span></label></div>";
   }).join("")
  :"—";
}

async function previewAdAutopilot(){
 $("adCleanupStatus").textContent="در حال بررسی رکوردهای Ads Autopilot…";
 const d=await api(A+"/ad-autopilot-cleanup",{
  method:"POST",
  body:JSON.stringify({mode:"preview"})
 });
 if(!d.ok){
  $("adCleanupStatus").innerHTML="<span class='bad'>✕ "+esc(d.error||"Preview failed")+"</span>";
  return;
 }
 renderAdAutopilotItems(d.items||[]);
 $("adCleanupStatus").innerHTML="<span class='ok'>✓ "+esc(d.count||0)+" رکورد قابل حذف پیدا شد.</span>";
}

async function deleteSelectedAdAutopilot(){
 const ids=[...document.querySelectorAll(".adCleanupCheck:checked")]
  .map(x=>x.dataset.id)
  .filter(Boolean);

 if(!ids.length){
  $("adCleanupStatus").innerHTML="<span class='warn'>اول رکوردهای موردنظر را انتخاب کن.</span>";
  return;
 }

 if(!confirm("آیا "+ids.length+" رکورد انتخاب‌شده Ads Autopilot حذف شود؟"))return;

 $("adCleanupStatus").textContent="در حال حذف رکوردهای انتخاب‌شده…";

 const d=await api(A+"/ad-autopilot-cleanup",{
  method:"POST",
  body:JSON.stringify({
   mode:"delete",
   ids,
   confirm:"DELETE_AD_AUTOPILOT"
  })
 });

 if(!d.ok){
  $("adCleanupStatus").innerHTML="<span class='bad'>✕ "+esc(d.error||"Delete failed")+"</span>";
  return;
 }

 $("adCleanupStatus").innerHTML="<span class='ok'>✓ "+esc(d.deleted||0)+" رکورد حذف شد.</span>";
 await loadOpp();
}

async function deleteAllAdAutopilot(){
 const preview=await api(A+"/ad-autopilot-cleanup",{
  method:"POST",
  body:JSON.stringify({mode:"preview"})
 });

 if(!preview.ok){
  $("adCleanupStatus").innerHTML="<span class='bad'>✕ "+esc(preview.error||"Preview failed")+"</span>";
  return;
 }

 const count=Number(preview.count||0);

 if(!count){
  $("adCleanupStatus").innerHTML="<span class='warn'>رکورد قابل حذف وجود ندارد.</span>";
  renderAdAutopilotItems([]);
  return;
 }

 if(!confirm("⚠️ تعداد "+count+" رکورد Ads Autopilot قابل حذف است. همه حذف شوند؟"))return;

 $("adCleanupStatus").textContent="در حال حذف همه رکوردهای Ads Autopilot…";

 const d=await api(A+"/ad-autopilot-cleanup",{
  method:"POST",
  body:JSON.stringify({
   mode:"delete",
   all:true,
   confirm:"DELETE_AD_AUTOPILOT"
  })
 });

 if(!d.ok){
  $("adCleanupStatus").innerHTML="<span class='bad'>✕ "+esc(d.error||"Delete failed")+"</span>";
  return;
 }

 $("adCleanupStatus").innerHTML="<span class='ok'>✓ "+esc(d.deleted||0)+" رکورد حذف شد.</span>";
 renderAdAutopilotItems([]);
 await loadOpp();
}

async function loadOpp(){
 const d=await api(A+"/opportunities");
 $("opportunities").innerHTML=d.ok
  ?rows(d.items,x=>esc(x.name||x.contact||x.id)+" · "+esc(x.stage||"new")+" · "+esc(x.priority||"normal"))
  :"—";
}
 
async function loadErrors(){const d=await api(A+"/errors");const a=[...(d.tasks||[]),...(d.retries||[])];$("errors").innerHTML=d.ok?rows(a,x=>"<span class='bad'>"+esc(x.error||x.last_error||x.operation||"—")+"</span><small>"+esc(x.updated_at||"")+"</small>"):"—"}
async function loadSafety(){const d=await api("/api/settings");$("safety").textContent=d.ok?"Settings API پاسخ داد · وضعیت Gate از Worker موجود است.":"Settings API در دسترس نیست."}
let refreshInProgress=false;
async function refreshAll(){
 if(refreshInProgress)return;
 refreshInProgress=true;
 try{
  await loadStatus();
  await Promise.all([loadTasks(),loadBrain(),loadRevenue(),loadOpp(),loadErrors(),loadSafety(),loadApprovals(),loadOutreachApprovals(),loadNegotiationInbox(),loadQuotes(),loadOrders(),loadRevenueRecovery(),siLoadAll(),loadPriceItems(),loadSalesKnowledge()]);
 }catch(e){
  $("masterState").textContent="DASHBOARD ERROR";
  $("masterState").className="pill bad";
 }finally{
  if($("masterState").textContent==="CONNECTING…"){
   $("masterState").textContent="AUTH / API ERROR";
   $("masterState").className="pill bad";
  }
  refreshInProgress=false;
 }
}
updateTokenUI();refreshAll();loadDiagnostic();setInterval(refreshAll,15000);
</script></body></html>`;
}
