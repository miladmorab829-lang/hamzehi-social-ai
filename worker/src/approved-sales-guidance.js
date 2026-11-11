import {ARAB_MOQ} from './commercial-policy.js';
import {ribbonFeeCurrent} from './optional-ribbon-fee.js';
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
export function serviceRibbonPrintQuestion(text){
 const n=String(text||"").normalize("NFKC").replace(/[يى]/g,"ی").replace(/ك/g,"ک").replace(/[ً-ٰٟ]/g,"");
 const ribbon="(?:روبان|ربان|شریط|نوار\\s*ساتن)",print="(?:چاپ|طلا[ ‌]*کوبی?|طباع[ةه]|طبع)";
 const direct=new RegExp(print+"[^.؟!،؛\\n]{0,35}(?:روی|رو|علی)\\s*(?:خود\\s*|نفس\\s*)?(?:ال)?"+ribbon,"u");
 const bare=new RegExp(print+"\\s*(?:خود\\s*)?(?:ال)?"+ribbon,"u");
 const reverse=new RegExp("(?:روی|علی)\\s*(?:خود\\s*|نفس\\s*)?(?:ال)?"+ribbon+"[^.؟!،؛\\n]{0,25}"+print,"u");
 const objectFirst=new RegExp("(?:ال)?"+ribbon+"\\s+(?:را\\s*)?"+print,"u");
 const surface=new RegExp("^(?:روی|رو|علی)\\s*(?:خود\\s*|نفس\\s*)?(?:ال)?"+ribbon,"u");
 const parts=n.split(/[.؟!،؛\n]|\s+(?:و\s*|ولی\s+|اما\s+|بل\s+|لکن\s+)(?=چاپ|طلا|روی|روبان|(?:ال)?(?:طباع|طبع|شریط)|(?:ما|لا)\s*أ?رید|أ?رید)/u);
 let printTopic=false;
 for(const part of parts){
  const candidate=direct.test(part)||bare.test(part)||reverse.test(part)||objectFirst.test(part)||printTopic&&surface.test(part.trim());
  const declined=/نمی[ ‌]*(?:خواهم|خوام|خواهیم|کنم|کنید|شود)|نشود|نباشد|نکن(?:ید|یم)?|(?:ما|لا)\s*(?:أرید|ارید|أطبع|اطبع|تطبع[\p{L}]*|یطبع[\p{L}]*)/u.test(part);
  if(candidate&&!declined)return true;
  if(new RegExp(print,"u").test(part))printTopic=true;
 }
 return false;
}
export function approvedServiceRequest(message){
 const t=norm(message);if(/سفارشم|سفارش من|سفارش قبلی|طلبی|طلبي|طلبنا|رهگیری|تتبع/iu.test(t))return null;
 const topics=[];
 // Printing on the ribbon is not the existing standard-lid service. Let the AI use scoped approved evidence.
 const ribbonPrinting=serviceRibbonPrintQuestion(t);
 if(ribbonPrinting)topics.push('ribbon_printing');
 const freightCharge=/(?:کارتن|کارتون|کرتون|كراتين|ارسال|باربری|حمل|شحن|نقل|توصیل|shipping|carton)/iu.test(t)&&MONEY.test(t);
 if(freightCharge&&!/قیمت|سعر|تخفیف|خصم|بیعانه|عربون|پرداخت|دفع|حساب|واریز|price|discount|deposit|payment|bank/iu.test(t))topics.push('shipping_payer');
 if(TIME.test(t)&&DELIVERY.test(t)||EXACT.test(t)&&DELIVERY.test(t))topics.push('timing');
 if(METHOD.test(t)&&DELIVERY.test(t))topics.push('method');
 if(/حداقل|اقل.*(?:کمیة|کمیه|عدد)|minimum|moq/iu.test(t))topics.push('moq');
 // A customer's logo is not itself a question about printing prices/capability. Only an actual print topic selects that policy.
 if(/چاپ(?!ی)|کوب|طباعة|طباعه|طبع/iu.test(t)&&(!ribbonPrinting||/درب|درپوش|غطاء/iu.test(t)))topics.push('lid');
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
// Only an approved shipping-payer policy may accompany delivery information.
// Rates, product pricing, discounts, deposits and payment instructions retain their gates.
function shippingTermsHaveOnlyPayerPolicy(value){
 const t=norm(value).replace(/[ً-ٰٟ]/g,"");
 if(/[$€£٪%]|تومان|ریال|دلار|دینار|\b(?:USD|TOMAN|IQD|IRR)\b|تخفیف|خصم|درصد|بیعانه|عربون|پیش[ ‌]*پرداخت|پرداخت|حساب|شماره\s*کارت|کارت[ ‌]*بانک|بطاقة|بطاقه|شبا|دفع|واریز|رایگان|مجانی|مجانا|مجانیة|\b(?:free|discount|deposit|payment|bank|iban)\b|(?<![\p{L}])حول(?![\p{L}])/iu.test(t))return false;
 const number="(?:[0-9۰-۹٠-٩]+(?:[.٫][0-9۰-۹٠-٩]+)?|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده|بیست|سی|چهل|پنجاه|شصت|هفتاد|هشتاد|نود|صد|هزار|میلیون|میلیارد|واحد|اثنان|اثنین|ثلاثة|أربعة|اربعة|خمسة|عشرة|عشرون|عشرین|ثلاثون|أربعون|خمسون|خمسین|ستون|سبعون|ثمانون|تسعون|مئة|مائة|ألف|الف|نصف|ربع|one|two|three|ten|twenty|fifty|hundred|thousand|million)";
 const duration=new RegExp(number+"(?:\\s*(?:تا|إلی|–|-|to)\\s*"+number+")?\\s*(?:روز|هفته|ماه|ساعت|دقیقه|یوم|أیام|ایام|أسبوع|اسبوع|شهر|ساعة|دقیقة|days?|weeks?|months?)","giu");
 const withoutTime=t.replace(/شهر\s*و\s*نصف/gu,"مدة").replace(duration,"مدة");
 if(/[0-9۰-۹٠-٩]/u.test(withoutTime)||new RegExp("(?<![\\p{L}])"+number+"(?![\\p{L}])","iu").test(withoutTime))return false;
 const faItem="(?:ارسال|کارتن|کارتون|(?:حمل|انتقال)(?:\\s*بار)?\\s*تا\\s*باربری|حمل\\s*(?:باربری\\s*)?تا\\s*مقصد)";
 const faList=faItem+"(?:\\s*(?:،|,|و)\\s*"+faItem+")*";
 const fa=new RegExp("^(?:در\\s*(?:ایران|عراق)(?:\\s*و\\s*(?:ایران|عراق))?\\s*[،,]?\\s*)?هزینه(?:[ ‌]*های)?\\s*"+faList+"\\s*بر\\s*عهده\\s*مشتری(?:\\s*و\\s*خارج\\s*از\\s*قیمت\\s*(?:خود\\s*)?جعبه)?\\s*است$","u");
 const arItem="(?:الشحن(?:\\s*إلی\\s*(?:الوجهة|المقصد))?|الکرتون|النقل\\s*إلی\\s*شرکة\\s*(?:الشحن|النقل))";
 const arList=arItem+"(?:\\s*[،,]?\\s*و\\s*"+arItem+")*";
 const ar=new RegExp("^(?:فی\\s*(?:إیران|ایران|العراق)(?:\\s*و\\s*(?:إیران|ایران|العراق))?\\s*[،,]?\\s*)?یتحمل\\s*الزبون\\s*أجور\\s*"+arList+"[،,]?\\s*و\\s*هی\\s*خارج\\s*سعر\\s*العلبة$","u");
 const unknown=/^(?:مبلغ\s*دقیق\s*بدون\s*مدرک\s*اعلام\s*نشود|لا\s*یذکر\s*مبلغ\s*غیر\s*موثق|مبلغ\s*دقیق\s*این\s*هزینه[‌ ]*ها\s*نیازمند\s*استعلام\s*معتبر\s*است|تحدید\s*المبلغ\s*الدقیق\s*یحتاج\s*استعلاما\s*موثوقا)$/u;
 // The financial exception accepts only the existing verified delivery sentences before its payer policy.
 // A shipping keyword alone must not exempt a new instruction to transfer money.
 const deliveryOnly=new Set([
  'ارسال در تهران با اسنپ یا وانت انجام می‌شود',
  'ارسال شهرستان با باربری و بسته‌بندی کارتنی انجام می‌شود',
  'المدة المعتادة للتسليم إلى العراق حوالي شهر ونصف، وهي تقديرية حسب وضع الطرق والحدود، وليست موعداً مضموناً'
 ].map(v=>norm(v).replace(/[ً-ٰٟ]/g,'')));
 let payer=false;
 for(const part of t.split(/[.!؟?\n؛;]/u).map(s=>s.trim()).filter(Boolean)){
  if(fa.test(part)||ar.test(part)){payer=true;continue;}
  if(payer&&unknown.test(part))continue;
  if(payer||MONEY.test(part)||/مبلغ|رسوم|مصاریف|تکالیف/iu.test(part))return false;
  if(!deliveryOnly.has(part))return false;
 }
 return payer;
}

function ribbonPrintingPolicyOnly(value){
 const parts=norm(value).replace(/[ً-ٰٟ]/g,"").split(/[.!؟?؛;\n]/u).map(p=>p.trim()).filter(Boolean);
 const fa=/^طلاکوب\s*سفارشی\s*روی\s*(?:خود\s*)?روبان\s*(?:امکان[ ‌]*پذیر\s*است\s*و\s*)?هزینه\s*(?:جدا|اضافی)\s*دارد$/u;
 const ar=/^(?:الطباعة\s*الذهبیة\s*المخصصة\s*علی\s*الشریط\s*(?:لها|إلها)|یمکن\s*تنفیذ\s*طباعة\s*ذهبیة\s*خاصة\s*علی\s*الشریط\s*نفسه\s*مقابل)\s*کلفة\s*(?:منفصلة|إضافیة)$/u;
 const unknown=/^(?:مبلغ\s*(?:دقیق\s*)?(?:در\s*اختیارم\s*نیست|بدون\s*تأیید\s*اعلام\s*نشود)|المبلغ\s*الدقیق\s*غیر\s*متوفر\s*عندی|لا\s*یذکر\s*مبلغ\s*غیر\s*معتمد)$/u;
 return parts.length>=1&&(fa.test(parts[0])||ar.test(parts[0]))&&parts.slice(1).every(p=>unknown.test(p));
}


export function selectApprovedGuidance(rows, {market, request, at = Date.now()}) {
  if (!request || !['IRAN','ARAB'].includes(market)) return null;
  // Iraq's current terms define duration, not a carrier/method. Do not answer a method question with that estimate.
  if(request.kind==='delivery'&&request.topic==='method'&&market!=='IRAN')return null;
  const eligible = rows.filter(r=>active(r,market,at));
  if(request.kind==='information'){
    const parts=[],facts=[],answered=[];
    for(const topic of request.topics||[]){
      if(topic==='ribbon_printing'){
        const matches=eligible.filter(r=>r.domain==='knowledge'&&r.attribute==='order_custom_ribbon_printing');
        if(matches.length===1){const fact=matches[0];let v;try{v=JSON.parse(fact.value_json);}catch{}
          const text=v?.value;
          if(v?.schema==='hamzehi.knowledge.v1'&&v.commercial===true&&['fact','rule'].includes(v.kind)&&!(v.conditions?.length||v.relation||v.effect)&&typeof text==='string'&&text.length<=200&&ribbonPrintingPolicyOnly(text)){parts.push(text.trim());facts.push({id:fact.id,version:fact.version,value_json:fact.value_json});answered.push(topic);}}
        continue;
      }
      if(topic==='shipping_payer'){
        const matches=eligible.filter(r=>r.domain==='shipping'&&r.attribute==='terms');
        if(matches.length===1){const fact=matches[0];let v;try{v=JSON.parse(fact.value_json);}catch{}
          if(typeof v==='string'&&v.trim()&&v.length<=2000&&shippingTermsHaveOnlyPayerPolicy(v)){parts.push(v.trim());facts.push({id:fact.id,version:fact.version,value_json:fact.value_json});answered.push(topic);}}
        continue;
      }
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
    if(parts.length&&missing.length){const names={ribbon_printing:['طلاکوب سفارشی روبان','الطباعة المخصّصة على الشريط'],shipping_payer:['مسئولیت هزینه حمل و کارتن','مسؤولية أجور النقل والكرتون'],timing:['زمان آماده‌سازی','مدة التجهيز'],method:['روش ارسال','طريقة الشحن'],moq:['حداقل سفارش','الحد الأدنى'],lid:['چاپ درب','طباعة الغطاء'],design:['طراحی و کلیشه','التصميم والكليشة'],contact:['اطلاعات زیر لوگو','معلومات تحت الشعار'],bag:['چاپ بدنه و بگ','طباعة الجسم والكيس']};parts.push(market==='IRAN'?`اطلاعات تأییدشدهٔ ${missing.map(t=>names[t]?.[0]).join(' و ')} در دسترسم نیست؛ نام مدل دقیق را می‌فرمایید؟`:`تفاصيل ${missing.map(t=>names[t]?.[1]).join(' و ')} غير واضحة عندي؛ شنو اسم الموديل بالضبط؟`);}
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
    if(typeof value!=='string'||!value.trim()||value.length>2000||(MONEY.test(norm(value))&&!(domain==='shipping'&&shippingTermsHaveOnlyPayerPolicy(value))))return null;
    // The first Iran timing sentence is the estimate; following owner notes are not customer prose.
    text=domain==='production'?value.trim().split(/(?<=[.!؟?])\s+/u)[0]:value.trim();
  }
  return {kind:request.kind,request,market,text,facts:[{id:fact.id,version:fact.version,value_json:fact.value_json}],insist:request.insist===true};
}
export async function loadApprovedGuidance(env, options) {
  if(!options.request)return null;
  const rows=(await env.DB.prepare("SELECT * FROM sales_knowledge_facts WHERE status='active' AND authority='owner_approved' AND entity_key='global' AND market=? AND ((domain='production' AND attribute='timing_rule') OR (domain='shipping' AND attribute='terms') OR (domain='quantity' AND attribute='quantity_rule') OR (domain='knowledge' AND attribute IN ('color_selection_website','included_services','included_services_lid_spec','lid_contact_layout','bag_drawer_print_surfaces','order_custom_ribbon_printing'))) ORDER BY id").bind(options.market).all()).results||[];
  return selectApprovedGuidance(rows,options);
}
export function maskApprovedGuidance(text, guidance) {
  // Only a single exact, approved segment is exempted. Anything added by the model still meets the ordinary validator.
  return guidance?.text && String(text).includes(guidance.text) ? String(text).replace(guidance.text,'') : text;
}
export async function approvedGuidanceCurrent(env, guidance) {
  if(guidance?.optional_ribbon_fee)return ribbonFeeCurrent(env,guidance);
  if(!guidance?.facts?.length)return false;
  const current=await loadApprovedGuidance(env,{market:guidance.market,request:guidance.request});
  return !!current && current.text===guidance.text && JSON.stringify(current.facts)===JSON.stringify(guidance.facts);
}
