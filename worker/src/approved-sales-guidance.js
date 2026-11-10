import {ARAB_MOQ} from './commercial-policy.js';
// Informational answers from active owner knowledge, separate from prices and order status.
const norm = value => String(value || '').normalize('NFKC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک');
const TIME = /زمان|مدت|چند\s*(?:روز|هفته|ماه)|طول\s*می|کی\s*(?:آماده|میرسه|می‌رسه|تحویل)|مدة|مده|وقت|متی|متى|delivery time|lead time/iu;
const DELIVERY = /ارسال|تحویل|آماده|سفارش|چاپ|توصیل|تسلیم|شحن|طلب|طباعة|shipping|delivery|production/iu;
const METHOD = /(?:تهران|شهرستان|باربری|اسنپ|وانت)|(?:چطور|چگونه|با چی).*(?:ارسال|میفرست)|(?:شلون|کیف).*(?:شحن|توصیل)/iu;
const EXACT = /دقیق|قطعی|تضمین|قول بده|سریع|زودتر|فوری|بالضبط|مضمون|تضمن|أسرع|اسرع|مستعجل|exact|guarantee|urgent|faster/iu;
const MONEY = /هزینه|کرایه|قیمت|تخفیف|بیعانه|پرداخت|سعر|کلفة|کلفه|اجور|أجور|خصم|عربون|دفع|price|cost|discount|payment/iu;
const COLOR = /رنگ|لون|ألوان|الوان|colour|color/iu;
const CHOOSE = /کجا|سایت|نمیدون|نمی‌دون|نمی دان|مطمئن نیست|ببینم|وين|وین|موقع|where|website|not sure/iu;
const PHOTO = /عکس|تصویر|صور|photo|image/iu;
export const INFORMATION_SLOT='{{INFORMATION}}';
export const serviceFinancialQuestion=message=>MONEY.test(norm(message))||/ثبتش|ثبت سفارش|سجل.*طلب|تایید.*پرداخت|تأیید.*پرداخت/iu.test(norm(message));
export function serviceFollowupPromise(text){
 const t=norm(text);
 if(/پیگیری|بررسی می[‌ ]?کن|خبر(?:تون|تان)? می|به[‌ ]?زودی.*می[‌ ]?فرست|أراجع|اراجع|أرجعلك|ارجعلك|راح.*أتأكد|راح.*اتأكد/iu.test(t))return true;
 // Inspect the actual customer-facing text even when the model omitted its escalation flag.
 const person=/همکار|مالک|مدیر|مدیریت|کارشناس|اپراتور|پشتیبان|مسؤول|مسئول|زمیل|الموظف|الإدارة|الادارة/iu;
 const handoff=/ارجاع|می[‌ ]?پرس|بپرس|صحبت|تماس|راهنمایی|پاسخ|جواب|هماهنگ|یجاوب|یساعد|تواصل|اسأل|أسأل|یرد|یفید|یحچي|یحچی/iu;
 return t.split(/[.!?؟\n؛;]/u).some(s=>person.test(s)&&handoff.test(s));
}
export function serviceCatalogQuestion(message){const t=norm(message);return /(?:چه|کدوم|کدام|شنو|شکو|شنهي|أي|ای)\s+(?:(?:نوع|انواع|أنواع)\s*)?(?:ال)?(?:مدل|مودیل|موديل|جعبه|علب)|(?:مدل|مودیل|موديل).*(?:دارید|دارین|عندکم|موجود|متوفر|معرفی)|نیم[‌\s]*(?:ست|سرویس)\s+چی\s+دار/iu.test(t);}
export function unverifiedServiceDetail(text,guidance){return !!guidance&&/(?:روز|هفته|ماه|یوم|يوم|أیام|ايام|أيام|اسبوع|أسبوع|شهر|ساعت|ساعة|ساعه|دقیقه|دقيقة|ارسال|تحویل|آماده|توصیل|توصل|تسلیم|جاهز|مضمون|ضمان|قطعی|تضمین|قول|فردا|امروز|باچر|باجر|بکرة|بکره|غدا|غداً|رایگان|مجانی|مجاني|مجانية|free|days?|weeks?|months?|tomorrow|today|guarantee|deliver|ready)/iu.test(norm(maskApprovedGuidance(text,guidance)));}
export function approvedServiceRequest(message){
 const t=norm(message);if(/سفارشم|سفارش من|سفارش قبلی|طلبی|طلبي|طلبنا|رهگیری|تتبع/iu.test(t))return null;
 const topics=[];
 if(TIME.test(t)&&DELIVERY.test(t)||EXACT.test(t)&&DELIVERY.test(t))topics.push('timing');
 if(METHOD.test(t)&&DELIVERY.test(t))topics.push('method');
 if(/حداقل|اقل.*(?:کمیة|کمیه|عدد)|minimum|moq/iu.test(t))topics.push('moq');
 // A customer's logo is not itself a question about printing prices/capability. Only an actual print topic selects that policy.
 if(/چاپ(?!ی)|کوب|طباعة|طباعه|طبع/iu.test(t))topics.push('lid');
 // Existing owner-approved design/cliche terms use the same exact-information route as printing; never exempt model-written
 // free-service claims. A mere mention of a design/logo is not a question about its cost.
 if(/طراحی|تصمیم|کلیش[هة]|design|clich[eé]/iu.test(t)&&(MONEY.test(t)||/بفلوس|رایگان|مجانی|مجاني|free|charge/iu.test(t)))topics.push('design');
 if(/آدرس|تلفن|اینستا|زیر لوگو|عنوان|هاتف|إنست|انست|تحت الشعار/iu.test(t))topics.push('contact');
 if(/بگ|بدنه|پترن|کيس|کیس|جسم|نقش/iu.test(t)&&/چاپ|کوب|لوگو|طبع|طباع|شعار/iu.test(t))topics.push('bag');
 return topics.length?{kind:'information',topics}:null;
}

export function approvedGuidanceRequest(message, previous = [], previousGuidance = null) {
  const text = norm(message), recent = previous.slice(0, 2).map(norm).join(' ');
  if (MONEY.test(text)) return null;
  // A general estimate must never masquerade as the status of this customer's existing order.
  if(/سفارشم|سفارش من|سفارش قبلی|طلبی|طلبي|طلبنا|my order|our order|رهگیری|تتبع|tracking/iu.test(text))return null;
  const timing = TIME.test(text) && DELIVERY.test(text);
  const insist = EXACT.test(text) && (DELIVERY.test(text) || TIME.test(recent) && DELIVERY.test(recent) || previousGuidance?.kind==='delivery');
  if (timing || insist) return {kind:'delivery', topic:'timing', insist};
  if (METHOD.test(text) && DELIVERY.test(text)) return {kind:'delivery', topic:'method', insist:false};
  if (COLOR.test(text) && CHOOSE.test(text) && !PHOTO.test(text)) return {kind:'color'};
  return null;
}
function active(row, market, at) {
  return row.status === 'active' && row.authority === 'owner_approved' && row.market === market && row.entity_key === 'global'
    && (!row.effective_from || Number.isFinite(Date.parse(row.effective_from)) && Date.parse(row.effective_from) <= at)
    && (!row.effective_until || Number.isFinite(Date.parse(row.effective_until)) && Date.parse(row.effective_until) > at);
}
export function selectApprovedGuidance(rows, {market, request, at = Date.now()}) {
  if (!request || !['IRAN','ARAB'].includes(market)) return null;
  // Iraq's current terms define duration, not a carrier/method. Do not answer a method question with that estimate.
  if(request.kind==='delivery'&&request.topic==='method'&&market!=='IRAN')return null;
  const eligible = rows.filter(r=>active(r,market,at));
  if(request.kind==='information'){
    const parts=[],facts=[],answered=[];
    for(const topic of request.topics||[]){
      if(topic==='timing'||topic==='method'){
        const g=selectApprovedGuidance(rows,{market,request:{kind:'delivery',topic,insist:false},at});if(g){parts.push(g.text);facts.push(...g.facts);answered.push(topic);}continue;
      }
      const spec={moq:['quantity','quantity_rule'],lid:['knowledge','included_services_lid_spec'],design:['knowledge','included_services'],contact:['knowledge','lid_contact_layout'],bag:['knowledge','bag_drawer_print_surfaces']}[topic];if(!spec||topic==='moq'&&market!=='IRAN')continue;
      const matches=eligible.filter(r=>r.domain===spec[0]&&r.attribute===spec[1]);if(matches.length!==1)continue;
      const fact=matches[0];let v;try{v=JSON.parse(fact.value_json);}catch{continue;}
      if(spec[0]==='knowledge'){if(v?.schema!=='hamzehi.knowledge.v1'||v.conditions?.length||v.relation||v.effect||v.commercial!==false)continue;v=v.value;}
      if(typeof v!=='string'||!v.trim()||v.length>2000)continue;
      // A newer specific printing scope accompanies the generic services fact. If that scope is conflicting/conditional/invalid,
      // do not disclose the generic fact alone and accidentally broaden it.
      const needsLid=topic==='design'&&rows.some(r=>r.status==='active'&&r.authority==='owner_approved'&&r.market===market&&r.entity_key==='global'&&r.domain==='knowledge'&&r.attribute==='included_services_lid_spec');
      const lid=needsLid?selectApprovedGuidance(rows,{market,request:{kind:'information',topics:['lid']},at}):null;
      if(needsLid&&!lid)continue;
      parts.push(v.trim());facts.push({id:fact.id,version:fact.version,value_json:fact.value_json});answered.push(topic);
      if(lid){parts.push(lid.text);facts.push(...lid.facts);}
    }
    // Iraq's existing universal minimum stays under the same deterministic commercial policy; no price data is changed.
    if(parts.length&&market==='ARAB'&&request.topics.includes('moq')){const m=ARAB_MOQ.standard;if(Number.isSafeInteger(m)){parts.push(`الحد الأدنى لكل قياس ${m} قطعة.`);answered.push('moq');}}
    const missing=(request.topics||[]).filter(t=>!answered.includes(t));
    if(parts.length&&missing.length){const names={timing:['زمان آماده‌سازی','مدة التجهيز'],method:['روش ارسال','طريقة الشحن'],moq:['حداقل سفارش','الحد الأدنى'],lid:['چاپ درب','طباعة الغطاء'],design:['طراحی و کلیشه','التصميم والكليشة'],contact:['اطلاعات زیر لوگو','معلومات تحت الشعار'],bag:['چاپ بدنه و بگ','طباعة الجسم والكيس']};parts.push(market==='IRAN'?`اطلاعات تأییدشدهٔ ${missing.map(t=>names[t]?.[0]).join(' و ')} در دسترسم نیست؛ نام مدل دقیق را می‌فرمایید؟`:`تفاصيل ${missing.map(t=>names[t]?.[1]).join(' و ')} غير واضحة عندي؛ شنو اسم الموديل بالضبط؟`);}
    return parts.length?{kind:'information',request,market,text:[...new Set(parts)].join('\n'),facts,missing_topics:missing,insist:false}:null;
  }
  const domain = request.kind === 'color' ? 'knowledge' : market === 'IRAN' && request.topic === 'timing' ? 'production' : 'shipping';
  const attribute = request.kind === 'color' ? 'color_selection_website' : domain === 'production' ? 'timing_rule' : 'terms';
  const matches = eligible.filter(r=>r.domain===domain && r.attribute===attribute);
  if (matches.length!==1) return null;
  const fact=matches[0]; let value;
  try { value=JSON.parse(fact.value_json); } catch { return null; }
  let text;
  if (request.kind==='color') {
    if(value?.schema!=='hamzehi.knowledge.v1'||value.conditions?.length||value.relation||value.effect||typeof value.value!=='string')return null;
    if(!value.value.includes('https://www.hamzehibox.com'))return null;
    text=market==='IRAN'
      ? 'برای انتخاب رنگ و مدل به https://www.hamzehibox.com مراجعه کنید و نام یا تصویر انتخابتان را در تلگرام بفرستید تا ادامه بدهیم.'
      : 'لاختيار اللون والموديل تفضل إلى https://www.hamzehibox.com وأرسل اسم أو صورة اختيارك في تلغرام حتى نكمل.';
  } else {
    if(typeof value!=='string'||!value.trim()||value.length>2000||MONEY.test(norm(value)))return null;
    // The first Iran timing sentence is the estimate; following owner notes are not customer prose.
    text=domain==='production'?value.trim().split(/(?<=[.!؟?])\s+/u)[0]:value.trim();
  }
  return {kind:request.kind,request,market,text,facts:[{id:fact.id,version:fact.version,value_json:fact.value_json}],insist:request.insist===true};
}
export async function loadApprovedGuidance(env, options) {
  if(!options.request)return null;
  const rows=(await env.DB.prepare("SELECT * FROM sales_knowledge_facts WHERE status='active' AND authority='owner_approved' AND entity_key='global' AND market=? AND ((domain='production' AND attribute='timing_rule') OR (domain='shipping' AND attribute='terms') OR (domain='quantity' AND attribute='quantity_rule') OR (domain='knowledge' AND attribute IN ('color_selection_website','included_services','included_services_lid_spec','lid_contact_layout','bag_drawer_print_surfaces'))) ORDER BY id").bind(options.market).all()).results||[];
  return selectApprovedGuidance(rows,options);
}
export function maskApprovedGuidance(text, guidance) {
  // Only a single exact, approved segment is exempted. Anything added by the model still meets the ordinary validator.
  return guidance?.text && String(text).includes(guidance.text) ? String(text).replace(guidance.text,'') : text;
}
export async function approvedGuidanceCurrent(env, guidance) {
  if(!guidance?.facts?.length)return false;
  const current=await loadApprovedGuidance(env,{market:guidance.market,request:guidance.request});
  return !!current && current.text===guidance.text && JSON.stringify(current.facts)===JSON.stringify(guidance.facts);
}
