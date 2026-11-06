// PHASE 25 — dashboard controls for Trash and cleanup. One engine (window.CL) on every page: a row control and a list bar used inside the
// existing lists, and a bottom sheet for preview, confirmation and Trash. Rows use escaped text and data attributes, never inline handlers.
export const CLEANUP_PANEL_HTML = `<section class="card section" id="cleanupPanel">
<div class="title"><div><h2>🗑 پاک‌سازی و سطل زباله</h2><div class="hint">حذف عادی برگشت‌پذیر است و مورد به سطل زباله می‌رود. پیش از هر حذف تعداد و اثر آن نمایش داده می‌شود.</div></div></div>
<div id="clNotice" class="hint" style="margin-top:8px"></div>
<div class="clTools">
<select id="clSection" class="input" aria-label="بخش"></select>
<select id="clView" class="input" aria-label="نما"><option value="active">موارد فعال</option><option value="trash">سطل زباله</option></select>
<select id="clOlder" class="input" aria-label="قدیمی‌تر از"><option value="">همه تاریخ‌ها</option><option value="7">قدیمی‌تر از ۷ روز</option><option value="30">قدیمی‌تر از ۳۰ روز</option><option value="90">قدیمی‌تر از ۹۰ روز</option></select>
<select id="clStatus" class="input" aria-label="وضعیت"></select>
<select id="clMarket" class="input" aria-label="بازار" hidden><option value="">همه بازارها</option><option value="IRAN">ایران</option><option value="ARAB">عراق</option></select>
</div>
<div class="clTools">
<label class="btn clCheck"><input type="checkbox" id="clAll"> انتخاب همه موارد نمایش‌داده‌شده</label>
<button class="btn" id="clSelected" type="button">حذف انتخاب‌شده‌ها</button>
<select id="clScope" class="input" aria-label="دامنه حذف همه"><option value="page">صفحه فعلی</option><option value="filter">نتایج فیلتر فعلی</option><option value="section">کل موارد مجاز این بخش</option></select>
<button class="btn" id="clDeleteAll" type="button">حذف همه</button>
</div>
<div class="clTools">
<button class="btn" id="clOldErrors" type="button">پاک‌سازی خطاهای قدیمی</button>
<button class="btn" id="clTest" type="button">پاک‌سازی داده‌های آزمایشی</button>
</div>
<div id="clStatusLine" class="hint" style="margin-top:9px">در انتظار دریافت…</div>
<div id="clItems" class="rows"></div>
<div class="clTools"><button class="btn" id="clPrev" type="button">قبلی</button><button class="btn" id="clNext" type="button">بعدی</button></div>
<div id="clTestPanel" hidden></div>
<h3 style="font-size:14px;margin:16px 0 6px">موارد محافظت‌شده</h3>
<div id="clProtected" class="rows"></div>
</section>`;

export const CLEANUP_SCRIPT = `<style>
.clTools{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.clTools .input{flex:1 1 150px;min-width:0}.clCheck{display:inline-flex;align-items:center;gap:6px}
.clBar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0}.clBar .btn{min-height:42px;padding:6px 10px;font-size:12px}
.clRowCtl{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 6px}.clRowCtl .btn{min-height:40px;padding:5px 10px;font-size:12px}.clRowCtl label{display:inline-flex;align-items:center;gap:6px;min-height:40px;font-size:12px;color:var(--muted)}
.clPick{width:20px;height:20px}.clRowCtl,.clBar .clMore{display:none}body.clManage .clRowCtl{display:flex}body.clManage .clBar .clMore{display:inline-flex}
.clLock{font-size:11px;color:var(--muted);border:1px solid var(--line2);border-radius:999px;padding:1px 8px}
#clSheet{position:fixed;inset:0;z-index:9999;background:rgba(17,24,39,.45);display:flex;align-items:flex-end;justify-content:center}
#clSheet[hidden]{display:none}#clSheetBox{background:#fff;width:100%;max-width:560px;max-height:85vh;overflow:auto;border-radius:16px 16px 0 0;padding:16px;padding-bottom:calc(16px + env(safe-area-inset-bottom))}
@media(min-width:700px){#clSheet{align-items:center}#clSheetBox{border-radius:16px}}
.clWarn{background:var(--badbg);border:1px solid #fecaca;color:var(--bad);border-radius:10px;padding:8px 10px;margin-top:8px;font-size:13px}
.clKind{font-size:11px;border-radius:999px;padding:1px 8px;border:1px solid var(--line2)}.clKind.live{color:var(--bad);border-color:#fecaca;background:var(--badbg)}
</style><script>
window.CL=(function(){
 const REASON={open_reply:"پاسخ باز یا در حال ارسال دارد",final_quote_review:"قیمت نهایی منتظر مالک است",has_order:"به سفارش وصل است و مدرک سفارش حفظ می‌شود",has_quote:"به پیش‌فاکتور وصل است",open_escalation:"ارجاع باز دارد؛ اول آن را حل کنید",pending_decision:"تصمیم در انتظار دارد؛ اول آن را حل کنید",customer_record:"مشتری واقعی است",open_outreach:"پیام باز دارد؛ اول آن را حذف کنید",active_pilot_link:"لینک فعال دارد؛ اول پیام را رد کنید",linked_history:"سابقه اجرا یا تأیید دارد",needs_explicit_selection:"با مشتری ارتباط دارد؛ فقط با انتخاب تک‌تک قابل حذف است",scheduled_or_published:"زمان‌بندی یا منتشر شده است",outcome_unknown:"نتیجه ارسال نامعلوم است",job_active:"در حال اجراست",open_dead_letter:"مورد باز DLQ دارد",alert_active:"هشدار هنوز فعال است",parent_in_trash:"مورد اصلی آن در سطل زباله است؛ اول آن را بازیابی کنید",schedule_passed:"زمان برنامه گذشته است و بازیابی باعث انتشار فوری می‌شود",changed_since_delete:"بعد از حذف تغییر کرده است",retention_active:"دوره نگهداری تمام نشده است",audit_evidence:"مدرک Audit یا امنیت است",not_purgeable:"حذف دائمی برای این بخش مجاز نیست",used_in_open_message:"در پیام باز استفاده شده است",used_by_content:"در محتوا استفاده شده است",used_by_gallery:"عکس این فایل در گالری است",r2_requires_authorization:"حذف فایل از R2 مجوز جدا لازم دارد"};
 const ERR={migration_required:"سیستم سطل زباله هنوز روی پایگاه داده فعال نشده است.",section_busy:"عملیات دیگری روی این بخش در حال اجراست.",operation_running:"این عملیات قبلاً شروع شده است.",preview_expired:"پیش‌نمایش منقضی شد؛ دوباره تلاش کنید.",confirmation_mismatch:"عبارت تأیید درست نیست.",filter_required:"اول یک فیلتر انتخاب کنید."};
 const WARN={linked_drafts:"پیش‌نویس‌های این پیام هم به سطل زباله می‌روند و ارسال‌نشدنی می‌شوند.",memory_hidden:"اطلاعات برداشت‌شده از این پیام از حافظه AI کنار می‌رود.",followup_scheduled:"این مشتری پیگیری زمان‌بندی‌شده دارد.",unanswered_message:"پیام مشتری بدون پاسخ می‌ماند. برای پاسخ دادن باید همین پیش‌نویس را بازیابی کنید.",no_reply_after_restore:"بازیابی هیچ پیامی را خودکار ارسال نمی‌کند و پیگیری خودکار این مشتری تا ۷ روز متوقف می‌ماند."};
 const IMPACT={drafts:"پیش‌نویس",pending_replies:"پاسخ در انتظار",open_escalations:"ارجاع باز",pending_decisions:"تصمیم در انتظار",quotes:"پیش‌فاکتور",orders:"سفارش",memory_facts:"اطلاعات حافظه",followups:"پیگیری زمان‌بندی‌شده",messages:"پیام"};
 const ACT={trash:"انتقال به سطل زباله",restore:"بازیابی",purge:"حذف دائمی"},CAP={page:"موارد نمایش‌داده‌شده",ids:"موارد انتخاب‌شده",filter:"نتایج فیلتر فعلی",section:"کل موارد مجاز این بخش"};
 const RELOAD={inbox:"loadNegotiationInbox",outreach:"loadOutreachApprovals",contents:"loadApprovals",errors:"loadErrorsCenter",tasks:"loadErrorsCenter",retry:"loadErrorsCenter",escalations:"loadOwnerEscalations",leads:"loadLeadsList",dlq:"loadAgentOps",alerts:"loadAgentOps",gallery:"loadGallery"};
 const st={busy:false,pending:null,after:null};
 const h=v=>String(v==null?"":v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
 const fa=e=>ERR[e]||e||"خطا";
 function sheet(){let s=document.getElementById("clSheet");if(!s){s=document.createElement("div");s.id="clSheet";s.hidden=true;s.innerHTML="<div id='clSheetBox' role='dialog' aria-modal='true'></div>";document.body.appendChild(s);s.addEventListener("click",e=>{if(e.target===s)close()})}return s}
 function show(html){const s=sheet();document.getElementById("clSheetBox").innerHTML=html;s.hidden=false}
 function close(){st.pending=null;const s=document.getElementById("clSheet");if(s)s.hidden=true}
 const closeBtn=t=>"<button class='btn' data-cl='close' type='button'>"+t+"</button>";
 function rowCtl(sec,id,locked){if(locked)return "<div class='clRowCtl'><span class='clLock'>محافظت‌شده: "+h(locked)+"</span></div>";return "<div class='clRowCtl'><label><input type='checkbox' class='clPick' data-sec='"+h(sec)+"' value='"+h(id)+"'> انتخاب</label><button class='btn' type='button' data-cl='one' data-sec='"+h(sec)+"' data-id='"+h(id)+"'>حذف</button></div>"}
 function bar(sec){const s=h(sec);return "<div class='clBar' data-sec='"+s+"'><button class='btn' type='button' data-cl='manage'>مدیریت و حذف</button><label class='btn clCheck clMore'><input type='checkbox' data-cl='all' data-sec='"+s+"'> انتخاب همه</label><button class='btn clMore' type='button' data-cl='selected' data-sec='"+s+"'>حذف انتخاب‌شده‌ها</button><button class='btn clMore' type='button' data-cl='everything' data-sec='"+s+"'>حذف همه موارد مجاز</button><button class='btn' type='button' data-cl='trash' data-sec='"+s+"'>سطل زباله</button></div>"}
 const picks=sec=>Array.from(document.querySelectorAll(".clPick[data-sec='"+sec+"']"));
 async function preview(sec,action,scope,ids,filter,after){
  if(st.busy)return;st.busy=true;st.after=after||null;show("<div class='hint'>در حال محاسبه اثر حذف…</div>");
  const d=await apiRequest("/api/cleanup/preview",{method:"POST",body:JSON.stringify({section:sec,action,scope,ids,filter})});st.busy=false;
  if(!d.ok){show("<div class='bad'>✕ "+h(fa(d.error))+"</div>"+closeBtn("بستن"));return}
  const m=d.summary,bl=Object.keys(m.blocked||{}).map(k=>"<div class='mini warn'>"+h(m.blocked[k])+" مورد: "+h(REASON[k]||k)+"</div>").join("");
  const imp=Object.keys(m.impact||{}).filter(k=>m.impact[k]).map(k=>h(IMPACT[k]||k)+": "+h(m.impact[k])).join(" · ");
  const warn=(m.warnings||[]).map(k=>"<div class='clWarn'>"+h(WARN[k]||k)+"</div>").join("");
  const states=Object.keys(m.by_state||{}).map(k=>h(k)+": "+h(m.by_state[k])).join(" · ");
  st.pending=d.token?{token:d.token,sec}:null;
  show("<b>"+h(ACT[action])+" · "+h(m.label)+"</b><div class='mini'>دامنه: "+h(CAP[scope])+"</div><div style='margin-top:6px'>این عملیات: <b>"+h(d.count)+"</b> مورد از "+h(m.eligible)+" مورد مجاز</div>"
   +(m.remaining?"<div class='mini'>"+h(m.remaining)+" مورد برای مرحله بعد می‌ماند.</div>":"")+(m.not_available?"<div class='mini warn'>"+h(m.not_available)+" مورد محافظت‌شده است و حذف نمی‌شود.</div>":"")+(states?"<div class='mini'>"+states+"</div>":"")+(imp?"<div class='mini' style='margin-top:6px'>موارد مرتبط: "+imp+"</div>":"")+warn+bl
   +(action==="purge"?"<div class='clWarn'>این کار برگشت‌پذیر نیست.</div>":"")
   +(d.token?(d.confirm_phrase?"<div class='mini' style='margin-top:8px'>برای تأیید بنویسید: <b>"+h(d.confirm_phrase)+"</b></div><input id='clPhrase' class='input' autocomplete='off' style='width:100%;margin-top:4px'>":"")+"<div class='clTools'><button class='btn' id='clGo' data-cl='go' type='button'>"+h(ACT[action])+"</button>"+closeBtn("انصراف")+"</div>":"<div class='mini' style='margin-top:8px'>موردی برای این عملیات مجاز نیست.</div><div class='clTools'>"+closeBtn("بستن")+"</div>"));
 }
 async function go(){
  if(!st.pending||st.busy)return;st.busy=true;const b=document.getElementById("clGo");if(b)b.disabled=true;
  const p=document.getElementById("clPhrase"),sec=st.pending.sec,d=await apiRequest("/api/cleanup/execute",{method:"POST",body:JSON.stringify({token:st.pending.token,confirm:p?p.value:undefined})});st.busy=false;
  if(!d.ok){if(b)b.disabled=false;document.getElementById("clSheetBox").insertAdjacentHTML("beforeend","<div class='bad mini'>✕ "+h(fa(d.error))+"</div>");return}
  const r=d.result||{};st.pending=null;show("<div class='ok'>✓ انجام شد: "+h(r.done)+" مورد"+(r.skipped?" · "+h(r.skipped)+" مورد تغییر کرده بود و رد شد":"")+"</div><div class='clTools'>"+closeBtn("بستن")+"</div>");
  const fn=RELOAD[sec];try{if(st.after)await st.after();else if(fn&&typeof window[fn]==="function")await window[fn]()}catch(e){}
 }
 function askScope(sec){const n=picks(sec).length;show("<b>حذف همه موارد مجاز</b><div class='mini'>دامنه را انتخاب کنید. موارد محافظت‌شده در هر حالت حذف نمی‌شوند.</div><div class='clTools'><button class='btn' type='button' data-cl='scopeVisible' data-sec='"+h(sec)+"'>فقط موارد نمایش‌داده‌شده ("+h(n)+")</button><button class='btn' type='button' data-cl='scopeSection' data-sec='"+h(sec)+"'>کل موارد مجاز این بخش</button>"+closeBtn("انصراف")+"</div>")}
 async function openTrash(sec,canPurge){
  show("<div class='hint'>در حال دریافت سطل زباله…</div>");
  const d=await apiRequest("/api/cleanup/items?"+new URLSearchParams({section:sec,view:"trash",limit:50}).toString());
  if(!d.ok){show("<div class='bad'>✕ "+h(fa(d.error))+"</div>"+closeBtn("بستن"));return}
  const rows=(d.items||[]).map(x=>"<div class='row'><b>"+h(x.title||"—")+"</b><div class='mini'>"+h(x.sub||"")+" · حذف: "+h(String(x.deleted_at||"").slice(0,10))+"</div>"+(x.block?"<div class='mini warn'>"+h(REASON[x.block]||x.block)+"</div>":"")+"<div class='clTools'><button class='btn' type='button' data-cl='restore' data-sec='"+h(sec)+"' data-id='"+h(x.id)+"'"+(x.block?" disabled":"")+">بازیابی</button>"+(x.purge_block==="not_purgeable"?"":"<button class='btn' type='button' data-cl='purge' data-sec='"+h(sec)+"' data-id='"+h(x.id)+"'"+(x.purge_block?" disabled":"")+">حذف دائمی</button>")+"</div>"+(x.purge_block&&x.purge_block!=="not_purgeable"?"<div class='mini muted'>"+h(REASON[x.purge_block]||x.purge_block)+"</div>":"")+"</div>").join("");
  show("<b>سطل زباله</b> <span class='mini'>"+h(d.total)+" مورد</span><div class='rows'>"+(rows||"<div class='row muted'>سطل زباله خالی است.</div>")+"</div><div class='clTools'>"+closeBtn("بستن")+"</div>");
 }
 document.addEventListener("click",e=>{const b=e.target.closest("[data-cl]");if(!b)return;const a=b.dataset.cl,sec=b.dataset.sec;
  if(a==="close")close();else if(a==="go")go();else if(a==="manage")document.body.classList.toggle("clManage");
  else if(a==="one")preview(sec,"trash","ids",[b.dataset.id]);
  else if(a==="selected"){const ids=picks(sec).filter(x=>x.checked).map(x=>x.value);if(!ids.length)show("<div>موردی انتخاب نشده است.</div><div class='clTools'>"+closeBtn("بستن")+"</div>");else preview(sec,"trash","ids",ids)}
  else if(a==="everything")askScope(sec);
  else if(a==="scopeVisible")preview(sec,"trash","page",picks(sec).slice(0,200).map(x=>x.value));
  else if(a==="scopeSection")preview(sec,"trash","section");
  else if(a==="trash")openTrash(sec);
  else if(a==="restore")preview(sec,"restore","ids",[b.dataset.id]);
  else if(a==="purge")preview(sec,"purge","ids",[b.dataset.id]);});
 document.addEventListener("change",e=>{const t=e.target;if(t.dataset&&t.dataset.cl==="all")picks(t.dataset.sec).forEach(x=>{x.checked=t.checked})});
 return {rowCtl,bar,preview,REASON,ERR,fa,openTrash};
})();
</script>`;

// The Cleanup page itself: filters, paging and the test-data view. Only on /dashboard/cleanup.
export const CLEANUP_PAGE_SCRIPT = `<script>
(function(){
 const st={sections:[],items:[],offset:0,limit:50,total:0};
 const E=id=>document.getElementById(id),cur=()=>st.sections.find(s=>s.key===E("clSection").value),view=()=>E("clView").value;
 const LIVE=["alert_active","job_active","open_dead_letter"],OPS=["errors","tasks","alerts","retry","dlq"];
 function filter(){const f={};if(E("clOlder").value)f.older_than_days=Number(E("clOlder").value);if(E("clStatus").value)f.status=E("clStatus").value;if(!E("clMarket").hidden&&E("clMarket").value)f.market=E("clMarket").value;return f}
 function renderStatus(){const s=cur();E("clStatus").innerHTML='<option value="">همه وضعیت‌ها</option>'+((s&&s.statuses)||[]).map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join("");E("clMarket").hidden=!(s&&s.markets)}
 function controls(){const t=view()==="trash";E("clSelected").textContent=t?"بازیابی انتخاب‌شده‌ها":"حذف انتخاب‌شده‌ها";E("clDeleteAll").textContent=t?"بازیابی همه":"حذف همه"}
 async function loadList(){
  const s=cur();if(!s)return;controls();E("clAll").checked=false;E("clStatusLine").textContent="در انتظار دریافت…";
  const d=await apiRequest("/api/cleanup/items?"+new URLSearchParams({section:s.key,view:view(),limit:st.limit,offset:st.offset,...filter()}).toString());
  if(!d.ok){E("clStatusLine").innerHTML="<span class='bad'>✕ "+esc(CL.fa(d.error))+"</span>";E("clItems").innerHTML="";return}
  st.items=d.items||[];st.total=d.total||0;
  E("clStatusLine").textContent=s.label+" · "+(view()==="trash"?"سطل زباله":"فعال")+" · "+st.total+" مورد · نمایش "+(st.total?st.offset+1:0)+" تا "+(st.offset+st.items.length);
  E("clItems").innerHTML=st.items.length?st.items.map(rowHtml).join(""):"<div class='row muted'>موردی نیست.</div>";
  E("clPrev").disabled=st.offset<=0;E("clNext").disabled=st.offset+st.items.length>=st.total;
 }
 function rowHtml(x){
  const t=view()==="trash",blocked=!!x.block,live=LIVE.includes(x.block)||x.state==="open";
  const acts=t?"<button class='btn' data-pg='restore' data-id='"+esc(x.id)+"'"+(blocked?" disabled":"")+">بازیابی</button>"+(cur().purge?"<button class='btn' data-pg='purge' data-id='"+esc(x.id)+"'"+(x.purge_block?" disabled":"")+">حذف دائمی</button>":""):"<button class='btn' data-pg='trash' data-id='"+esc(x.id)+"'"+(blocked?" disabled":"")+">حذف</button>";
  const why=blocked?"<div class='warn mini'>"+esc(CL.REASON[x.block]||x.block)+"</div>":(t&&x.purge_block&&cur().purge?"<div class='muted mini'>"+esc(CL.REASON[x.purge_block]||x.purge_block)+"</div>":"");
  return "<div class='row'><label style='display:flex;gap:8px;align-items:flex-start'><input type='checkbox' class='clPick' data-sec='page' value='"+esc(x.id)+"'"+(blocked?" disabled":"")+"><span><b>"+esc(x.title||"—")+"</b>"+(OPS.includes(cur().key)?" <span class='clKind"+(live?" live":"")+"'>"+(live?"فعال":"تاریخی")+"</span>":"")+"<div class='mini muted'>"+esc(x.sub||"")+" · "+esc(x.state||"")+" · "+esc(String(x.at||"").slice(0,10))+"</div>"+why+"</span></label><div class='clTools'>"+acts+"</div></div>";
 }
 const picked=()=>Array.from(document.querySelectorAll(".clPick[data-sec='page']:checked")).map(x=>x.value);
 const after=async()=>{await loadOverview();await loadList()};
 const pv=(a,sc,ids,f)=>CL.preview(cur().key,a,sc,ids,f,after);
 async function loadTest(){
  const p=E("clTestPanel");p.hidden=false;p.innerHTML="<div class='hint'>در حال بررسی…</div>";
  const d=await apiRequest("/api/cleanup/test-candidates");if(!d.ok){p.innerHTML="<span class='bad'>✕ "+esc(CL.fa(d.error))+"</span>";return}
  const SIG={programming_prompt:"متن برنامه‌نویسی در پیام",explicit_test_wording:"عبارت تست در پیام",owner_named_test_customer:"مشتری آزمایشی اعلام‌شده توسط مالک"};
  const G={no_sender_or_conversation:"پیام بدون فرستنده و گفتگو",failed_over_7_days_ago:"Task شکست‌خورده قدیمی‌تر از ۷ روز"};
  p.innerHTML="<h3 style='font-size:14px;margin:14px 0 6px'>نامزدهای داده آزمایشی</h3><div class='hint'>هیچ موردی خودکار حذف نمی‌شود. هر مورد را خودتان انتخاب کنید.</div><div class='rows'>"
   +((d.items||[]).map(x=>"<div class='row'><b>"+esc(x.name||"—")+"</b> <span class='mini muted'>"+esc(x.stage)+"</span><div class='mini'>دلیل: "+(x.signals.length?x.signals.map(s=>esc(SIG[s.code]||s.code)+" ("+esc(s.count)+")").join("، "):"شواهد کافی نیست")+"</div><div class='mini muted'>"+esc(x.linked.messages)+" پیام · "+esc(x.linked.outreach)+" خروجی · "+esc(x.linked.orders)+" سفارش · "+esc(x.linked.open_escalations)+" ارجاع باز</div>"+(x.blocked_by?"<div class='mini warn'>مسدود: "+esc(CL.REASON[x.blocked_by]||x.blocked_by)+"</div>":"")+(x.can_archive?"<button class='btn' data-test-lead='"+esc(x.id)+"'>انتخاب برای حذف</button>":"")+"</div>").join("")||"<div class='row muted'>نامزدی با شواهد کافی نیست.</div>")
   +((d.groups||[]).map(g=>"<div class='row'>"+esc(G[g.reason]||g.reason)+": <b>"+esc(g.count)+"</b> <button class='btn' data-open='"+esc(g.section)+"'>مشاهده بخش</button></div>").join(""))+"</div>";
 }
 async function loadOverview(){
  const d=await apiRequest("/api/cleanup/sections");
  if(!d.ok){E("clStatusLine").innerHTML="<span class='bad'>✕ "+esc(d.error||"خطا")+"</span>";return false}
  const q=new URLSearchParams(location.search),keep=E("clSection").value||q.get("section");st.sections=d.sections||[];
  E("clSection").innerHTML=st.sections.map(s=>"<option value='"+esc(s.key)+"'>"+esc(s.label)+(s.active===null?"":" ("+esc(s.active)+" · سطل زباله "+esc(s.trash)+")")+"</option>").join("");if(keep&&st.sections.some(s=>s.key===keep))E("clSection").value=keep;
  E("clProtected").innerHTML=(d.protected||[]).map(p=>"<div class='row'><b>"+esc(p.label)+"</b><div class='mini muted'>"+esc(p.reason)+"</div></div>").join("");
  E("clNotice").textContent=d.ready?"":CL.ERR.migration_required;return true;
 }
 function bind(){
  ["clSection","clView"].forEach(id=>E(id).addEventListener("change",()=>{st.offset=0;if(id==="clSection")renderStatus();loadList()}));
  ["clOlder","clStatus","clMarket"].forEach(id=>E(id).addEventListener("change",()=>{st.offset=0;loadList()}));
  E("clAll").addEventListener("change",e=>document.querySelectorAll(".clPick[data-sec='page']:not(:disabled)").forEach(x=>{x.checked=e.target.checked}));
  E("clPrev").addEventListener("click",()=>{st.offset=Math.max(0,st.offset-st.limit);loadList()});E("clNext").addEventListener("click",()=>{st.offset+=st.limit;loadList()});
  E("clSelected").addEventListener("click",()=>{const ids=picked();if(ids.length)pv(view()==="trash"?"restore":"trash","ids",ids)});
  E("clDeleteAll").addEventListener("click",()=>{const sc=E("clScope").value,a=view()==="trash"?"restore":"trash";if(sc==="page")pv(a,"page",st.items.filter(x=>!x.block).map(x=>x.id));else pv(a,sc,undefined,sc==="filter"?filter():undefined)});
  E("clOldErrors").addEventListener("click",async()=>{E("clSection").value="errors";E("clView").value="active";E("clOlder").value="30";renderStatus();st.offset=0;await loadList();pv("trash","filter",undefined,{older_than_days:30})});
  E("clTest").addEventListener("click",loadTest);
  E("cleanupPanel").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;
   if(b.dataset.pg)pv(b.dataset.pg,"ids",[b.dataset.id]);
   else if(b.dataset.testLead)CL.preview("leads","trash","ids",[b.dataset.testLead],undefined,after);
   else if(b.dataset.open){E("clSection").value=b.dataset.open;renderStatus();st.offset=0;loadList()}});
 }
 window.loadCleanup=async function(){if(!st.bound){st.bound=true;bind()}if(await loadOverview()){const v=new URLSearchParams(location.search).get("view");if(v==="trash")E("clView").value="trash";renderStatus();await loadList()}};
})();
</script>`;
