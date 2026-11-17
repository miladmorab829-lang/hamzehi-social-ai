// cv58b — PROPOSITION-SCOPE LAYER, CLOSED-CONTENT version (replaces the reverted cv57 layer and the first cv58 draft, which the
// independent reviewers broke with presuppositions, exceptives, purpose clauses and open spans: 135/312 adversarial unsafe accepted).
//
// A non-committal operator governs ONLY its own proposition. Kinds:
//   NEG    refused commitment / confirmation   «نمی‌تونم X رو تأیید کنم», «ما أگدر أأكدلك …», «X ما نگدر نضمنه»
//   KNOW   knowledge gap                        «درباره X اطلاعات ندارم», «ما عندي معلومة مؤكدة عن X»
//   OWNER  decision referred to the owner       «X فقط با نظر مدیره», «X يقرره صاحب الشغل بس»
//   RELAY  forwarding to the owner              «تا درخواستتون رو به صاحب کار برسونم», «وأعرضها عليه»
// SAFETY PRINCIPLE (closed content): a span is removed from validation only if EVERY word in it is
//   (a) a word of the operator itself, (b) a closed-class function word, or (c) a noun from a closed list of PROTECTED TOPICS
//   (discount, price, cost, time, delivery, payment, order, colour, model, size, insurance, … — the things the assistant may not
//   commit to). Any verb, adjective, number, exceptive («إلا/غير/جز»), relative clause, unknown word or committing word inside the
//   candidate span cancels it: the clause is then left untouched and validated exactly as before (fail closed). So a removed span
//   can never carry a predicate — it can only NAME a protected topic and say that the assistant cannot confirm / does not know /
//   leaves it to the owner.
// Spans never cross punctuation, emoji, dashes/bullets, contrast words («ولی/اما/بس/لكن»), or a coordinating «و».

const nk=t=>String(t||'').normalize('NFKC').toLowerCase().replace(/[‌‍ـ]/gu,'').replace(/[ً-ٰٟ]/gu,'')
 .replace(/[يى]/gu,'ی').replace(/ك/gu,'ک').replace(/[أإآٱ]/gu,'ا').replace(/ؤ/gu,'و').replace(/ئ/gu,'ی').replace(/[ةۀ]/gu,'ه')
 .replace(/[۰-۹]/gu,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/gu,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[^\p{L}\p{N}.]/gu,'');
export const scopeKey=nk;

const PUNCT=/^[.،,؛;:!?؟…\-–—•·|/\\*→~=+"“”]+$/u;
const CONTRAST=new Set(['ولی','اما','لکن','ولکن','لاکن','بل','بلکه','منتها','but','however','لیکن','البته','ضمنا','فقط']);

// (c) PROTECTED TOPIC nouns (bare forms; prefixes ال/لل/بال/ب/ل/و and possessive/plural/ezafe suffixes are allowed around them)
const TOPIC_STEMS='تخفیف|تخفیفات|قیمت|قیمتها|نرخ|هزینه|هزینهها|کرایه|مبلغ|رقم|عدد|زمان|مدت|تاریخ|موعد|مواعید|وقت|تحویل|ارسال|رسیدن|تولید|ساخت|پرداخت|تسویه|نحوه|روش|طریقه|شرایط|شروط|بیعانه|پیشپرداخت|سفارش|سفارشات|قبول|تایید|تاکید|ثبت|بیمه|خسارت|خساره|جبران|ضمانت|ضمان|ضرر|تعویض|تعویض|استثنا|استثنایی|استثناء|رنگ|لون|الوان|مدل|مودیل|موديل|سایز|قیاس|مقاس|اندازه|ابعاد|جنس|چاپ|طباعه|روبان|شریط|شریطه|درب|منزل|خونه|خانه|مقصد|باربری|پست|بريد|برید|پیک|ترمینال|کارتن|کرتون|بسته|بستهبندی|بار|شحنه|شحن|نقل|توصیل|تسلیم|استلام|وصول|دفع|دفعه|حواله|عربون|خصم|خصومات|اسعار|سعر|کلفه|اجور|انتاج|تصنیع|طلب|طلبیه|کمیه|تثبیت|تعویض|مسیولیه|وکیل|مکان|مخزن|بیت|باب|عنوان|محل|تحمل|ماء|مای|رطوبه|رطوبت|اب|حراره|گرما|سرما|عرض|دقیق|تفاصیل|جزییات|درخواست|سوال|سوال|موضوع|قضیه|جای|جا|شهر|محافظه|مسیر|علبه|جعبه|قطعه|تکه';
// (review A2 S-A) no predicate adjectives in the list and NO copula suffix («‑ه/‑یه/‑ست»): «قطعیه», «کامله», «تأییده» are predicates.
// Allowed suffixes: ezafe «ی», plural «ها/های/هایی/ات», possessive «ش/اش/تون/تان/ک/کم/ج».
const TOPIC_RE=new RegExp('^(?:و|ف)?(?:ال|لل|بال|ب|ل)?(?:'+TOPIC_STEMS+')(?:ی|ها|های|هایی|ش|اش|تون|تان|ک|کم|ج|ات)?$','u');
// (b) closed-class function words (no verbs, no adjectives, no exceptives)
const FUNC_RE=/^(?:دیگه|دیگر|اخری|تا|چطوری|چطور|کی|چقدر|کجا|چه|کدوم|شلون|شوکت|متی|شکد|وین|شی|بشی|اشی|شیء|چیزی|چیز|حاجه|راه|و|یا|او|رو|را|من|انا|انی|این|اون|همین|همون|هذا|هذه|هذی|هاذا|هاي|های|ای|ایی|ی|کل|هر|از|به|در|تو|توی|برای|مستند|سند|ل|لل|الی|عن|حول|بخصوص|بالنسبه|درباره|دربارهی|مورد|راجع|فی|هم|الان|فعلا|حالا|هسه|هسع|هنا|اینجا|بالضبط|خود|خودش|شما|شمارو|تون|خودتون|انت|انتی|حضرتک|جنابک|عیونی|عزیزم|حبیبی|متاسفانه|للاسف|بصراحه|راستش|صادقانه|والله)$/u;
// (review A2 S-B) privative/comitative/«على» phrases carry commitments («بلا كلفة», «على المحل», «مع الضمان»): never closed content.
// «بدون/دون مستند» is the approved Iraqi delivery wording and is accepted only as that pair (checked in spanOk).
// (review A2) a granted-benefit noun with the customer's possessive («تخفیف‌تون», «خصمك», «تعويضك», «بیمه‌تون») presupposes the benefit
const BENEFIT_POSS=/^(?:و|ف)?(?:ال|لل|بال|ب|ل)?(?:تخفیف|تخفیفات|خصم|خصومات|جبران|خسارت|خساره|تعویض|ضمان|ضمانت|بیمه|تامین|استثنا|استثناء|عربون|بیعانه|سفارش|طلب|طلبیه|حواله|دفعه|منزل|خونه|بیت|محل|مخزن)(?:تون|تان|ک|کم|ج)$/u;
const contentOk=k=>(TOPIC_RE.test(k)&&!BENEFIT_POSS.test(k))||FUNC_RE.test(k);
// Attributive adjectives only right after their head noun (never predicative): «قیمت نهایی», «السعر النهائي», «التسليم المباشر».
const ATTRIB=(ks,i)=>/^(?:نهایی|النهایی)$/u.test(ks[i])&&/^(?:ال)?(?:قیمت|سعر|مبلغ|تصمیم|قرار|حساب|اسعار|قیمتها)$/u.test(ks[i-1]||'')||ks[i]==='المباشر'&&/^(?:ال)?(?:تسلیم|توصیل)$/u.test(ks[i-1]||'');
const spanOk=(ks,i)=>contentOk(ks[i])||ATTRIB(ks,i)||/^(?:بدون|دون)$/u.test(ks[i])&&/^(?:مستند|سند)$/u.test(ks[i+1]||'');
// an attached coordinator «و/ف» (not a word that merely starts with «و»: «وقت», «وزن», «وسط», «وصول», «وکیل», «واریز», «وانت» …)
const WAW_WORD=/^(?:وقت\p{L}*|وزن\p{L}*|وسط\p{L}*|ورق\p{L}*|وانت|ویژه|وصول|وکیل\p{L}*|واریز\p{L}*|وجه|وضع\p{L}*|وارد\p{L}*|ورود|وسیله|وسایل|وجود|فقط|فعلا|فوری|فرق)$/u;
const isConj=k=>/^[وف]\p{L}{2,}/u.test(k)&&!WAW_WORD.test(k);
const INTRODUCER=/^(?:و|ف)?(?:درباره\p{L}*|راجع|بخصوص|خصوص|بالنسبه|عن|حول|موضوع|قضیه)$/u;
const COMPLEMENTIZER=/^(?:اذا|لو|ان|عن|علی|حول|بخصوص|درباره\p{L}*|راجع|اینکه|ایا)$/u;
const WHETHER_TAIL=/^(?:یا|نه|لا|او|لو)$/u;

// ---------- operators (space-joined token keys; generic slots accept ONLY topic/function words) ----------
const SLOT='(?:\\S+\\s+)';            // slot tokens are re-checked with contentOk after matching (see opMatches)
const OWNER_N='(?:مدیر(?:ه|ش|مون|ان)?|مدیرمجموعه|صاحب\\s*کار(?:ه|ش)?|صاحبکار(?:ه|ش)?|مالک(?:ه|ش)?|صاحب\\s*(?:ال)?شغل|صاحب\\s*(?:ال)?محل|(?:ال)?اداره|المدیر|(?:ال)?مسوول|(?:ال)?مسیول)';
const OPS=[
 ['KNOW','(?:اطلاع|اطلاعات|اطلاعی|اطلاعاتی|خبر|خبری|تاییدیه|جزییات|مبلغی|عددی|رقمی|قیمتی)(?:\\s+(?:دقیق|دقیقی|قطعی|کافی|تاییدشده|تاییدشدهای|بیشتری))*\\s+ندارم'],
 ['KNOW','(?:مطمین|مطمئن)\\s+(?:نیستم|نیستیم)|نمیدونم|نمیدانم|(?:دقیق|الان)\\s+نمیدونم'],
 ['KNOW','[وف]?(?:ما|مو)\\s+عندی\\s+(?:معلومه|معلومات|تاکید|خبر|علم|رقم|مده|موعد|شی|اشی|تفاصیل|سعر)(?:\\s+(?:موکده|موکد|اکیده|مضبوطه|دقیقه|دقیق|مثبته))?(?:\\s+(?:اگدر|اکدر|اقدر)\\s+(?:اوعدک|ااکدلک|اکدلک|اگولک|اکولک)(?:\\s+(?:بیه|بی|بیها))?)?'],
 ['KNOW','[وف]?(?:ما|مو)\\s+(?:اعرف|ادری|متاکد|متاکده|متاکدین)'],
 ['NEG','نمیتون(?:م|یم)\\s+'+SLOT+'{0,4}?(?:قول\\s+بدم|قولی\\s+بدم|تایید\\s+کنم|تاییدش\\s+کنم|تضمین\\s+کنم|قطعی\\s+کنم|قطعی\\s+بگم|دقیق\\s+بگم|بگم|اعلام\\s+کنم|ثبت\\s+کنم|قبول\\s+کنم|بدم)(?:\\s+یا\\s+(?:بگم|قول\\s+بدم|تایید\\s+کنم))?'],
 ['NEG','(?:قول|تضمین)\\s+(?:نمیدم|نمیدیم|نمیکنم|نمیکنیم)'],
 ['NEG','نمیخوا(?:م|یم)\\s+(?:قول\\s+بدم|اشتباه\\s+بگم|چیزی\\s+بگم)'],
 ['NEG','[وف]?(?:ما|مو)\\s+(?:احب|ارید|ابی)\\s+(?:اعطیک|انطیک|اگولک|اکولک|اقولک|اوعدک)'],
 ['NEG','[وف]?(?:ما|مو|لا)\\s+(?:اگدر|اکدر|اقدر|نگدر|نکدر|نقدر)\\s+(?:ااکد|اکد|اوعد|اضمن|نضمن|اثبت|اگول|اکول|اقول|اعطی|انطی|احدد|نحدد)\\p{L}*'],
 ['NEG','[وف]?(?:ما|لا|مو)\\s+(?:نضمن|اضمن|اوعد|نوعد)\\p{L}*'],
 ['OWNER','(?:تصمیم(?:ش|اش)?|انتخاب(?:ش)?|تعیین(?:ش)?)?\\s*(?:فقط\\s+)?با\\s+(?:نظر\\s+|تایید\\s+|تصمیم\\s+)?'+OWNER_N+'(?:\\s+مجموعه(?:ه|ست)?)?'],
 ['OWNER',OWNER_N+'(?:\\s+مجموعه)?\\s+(?:تعیین|مشخص|تصمیم)\\s+(?:میکنه|میکنن|میگیره|کنه)'],
 ['OWNER','(?:فقط\\s+)?با\\s+(?:نظر\\s+|تایید\\s+)?'+OWNER_N+'\\s+(?:مشخص|تعیین)\\s+(?:میشه|میشن)'],
 ['OWNER','(?:باید|لازمه)\\s+'+OWNER_N+'\\s+(?:تصمیم|تایید|مشخص)\\s+(?:بگیره|کنه)'],
 ['OWNER','[یت](?:قرر|حدد|حسم)(?:ه|ها|هم)?\\s+'+OWNER_N+'(?:\\s+(?:بس|وحده))?'],
 ['OWNER','(?:یرجع|ترجع)\\s+(?:ل|لل|الی)\\s*'+OWNER_N+'|(?:یرجع|ترجع)\\s+ل'+OWNER_N],
 ['OWNER','(?:بید|عند)\\s+'+OWNER_N+'(?:\\s+(?:بس|وحده))?'],
];
const OPRE=OPS.map(([type,src])=>[type,new RegExp('(?<=^|\\s)(?:'+src+')(?=\\s|$)','gu')]);
// fixed words that may appear inside an operator match (everything else in an operator match must be topic/function)
const OP_WORDS=/^(?:نمیتونم|نمیتونیم|قول|قولی|بدم|بدیم|تایید|تاییدش|تضمین|قطعی|دقیق|بگم|اعلام|ثبت|قبول|کنم|یا|نمیدم|نمیدیم|نمیکنم|نمیکنیم|نمیخوام|نمیخوایم|اشتباه|چیزی|اطلاع|اطلاعات|اطلاعی|اطلاعاتی|خبر|خبری|تاییدیه|جزییات|مبلغی|عددی|رقمی|قیمتی|دقیقی|کافی|تاییدشده|تاییدشدهای|بیشتری|ندارم|مطمین|مطمئن|نیستم|نیستیم|نمیدونم|نمیدانم|الان|ما|مو|لا|وما|فما|ومو|ولا|عندی|معلومه|معلومات|تاکید|علم|رقم|مده|موعد|شی|اشی|تفاصیل|سعر|موکده|موکد|اکیده|مضبوطه|دقیقه|مثبته|اعرف|ادری|متاکد|متاکده|متاکدین|احب|ارید|ابی|اعطیک|انطیک|اگولک|اکولک|اقولک|اوعدک|اگدر|اکدر|اقدر|نگدر|نکدر|نقدر|ااکد\p{L}*|اکد\p{L}*|اوعد\p{L}*|اضمن\p{L}*|نضمن\p{L}*|اثبت\p{L}*|اگول\p{L}*|اکول\p{L}*|اقول\p{L}*|اعطی\p{L}*|انطی\p{L}*|احدد\p{L}*|نحدد\p{L}*|نوعد\p{L}*|تصمیم|تصمیمش|تصمیماش|انتخاب|انتخابش|تعیین|تعیینش|فقط|با|نظر|مدیر|مدیره|مدیرش|مدیرمون|مدیران|مدیرمجموعه|صاحب|کار|کاره|کارش|صاحبکار|صاحبکاره|مالک|مالکه|شغل|الشغل|محل|المحل|اداره|الاداره|المدیر|مسوول|المسوول|مسیول|المسیول|مجموعه|مجموعهست|مشخص|میکنه|میکنن|میگیره|کنه|میشه|میشن|باید|لازمه|بگیره|بس|وحده|یرجع|ترجع|ل|لل|الی|بید|عند|بیه|بی|بیها|[یت](?:قرر|حدد|حسم)(?:ه|ها|هم)?)$/u;
const opWord=k=>OP_WORDS.test(k)||OP_WORDS.test(k.replace(/^(?:لل|ل|ب|و)(?=\p{L}{3})/u,''));
// Event verbs allowed ONLY inside an explicit subordinate «اینکه … رو» / «إذا …» clause of a denial or knowledge gap, and only
// together with closed content (no committing word, no number): «اینکه بار تا در خونه برسه رو نمی‌تونم تأیید کنم».
const EVENT_VERB=/^(?:بشه|باشه|برسه|میرسه|میشه|انجام|یوصل|توصل|یوصلک|توصلک|تدخل|یدخل|تتحمل|یتحمل|تصیر|یصیر|تجی|یجی|تشیل|یشیل)$/u;
const EXCEPTIVE=/^(?:الا|غیر|جز|سوی|بس|فقط|الی)$/u;
const SPEECH_END=/(?:بگم|کنم|اگول\p{L}*|اکول\p{L}*|اقول\p{L}*|ااکد\p{L}*|اکد\p{L}*|اوعد\p{L}*|اثبت\p{L}*|اضمن\p{L}*|نضمن\p{L}*|اعطی\p{L}*|انطی\p{L}*)$/u;
// RELAY: the speaker forwards to the owner. First-person forwarding verbs; the span is closed-content and ENDS at the verb (an
// optional closed tail «تا بررسی کنه / حتى يشوفها» only).
const RELAY_VERB=/^(?:بفرستم|میفرستم|برسونم|میرسونم|برسانم|بپرسم|میپرسم|اعرض(?:ها|ه|هم)?(?:علیه|اله)?|واعرض(?:ها|ه|هم)?|اسال(?:ه)?|واسال(?:ه)?|اسیل\p{L}*|ارفع(?:ها|ه)?|ابلغ(?:ه)?|اوصل(?:ها|ه)?(?:اله)?|واوصل(?:ها|ه)?)$/u;
const RELAY_LIGHT=/^(?:هماهنگ|چک|مطرح)$/u, RELAY_1SG=/^(?:کنم|میکنم|بکنم)$/u;
const OWNER_TOKEN=/^(?:ب|ل|لل|و|بال|وال)?(?:مدیر(?:ه|ش|مون)?|صاحب|صاحبکار|مالک|(?:ال)?اداره|(?:ال)?مسوول|(?:ال)?مسیول|الشغل|شغل|کار|المدیر)$/u;
const RELAY_OBJ=/^(?:و)?(?:ال)?(?:درخواست|سوال|سوالک|سوالکم|سوالتون|درخواستتون|جزییات|تفاصیل|کمیه|عدد|تعداد|مدل|موديل|مودیل|رنگ|لون|عکس|صوره|اسم|پیام|طلب|طلبک|طلبکم|طلبیه|سفارش|سفارشتون|مشخصات|اطلاعات|اطلاعاتتون|موضوع|قیاس|ابعاد|اندازه|نوع|طباعه|چاپ|الطباعه)(?:ه|ها|ش|تون|ک|کم)?$/u;
const RELAY_TAIL=/^(?:تا|حتی|بررسی|چک|کنه|کنن|بکنه|یشوف\p{L}*|یراجع\p{L}*|یقرر|نشوف|ویاه|ویاک|علیه|اله|بهش|براش|ازش)$/u;

function tokenize(text){
 const toks=[];const re=/[\p{L}\p{M}\p{N}‌‍ـ]+(?:[.,٫٬][\p{N}]+)*|\S/gu;let m;
 while((m=re.exec(text))){const raw=m[0];toks.push({raw,start:m.index,end:m.index+raw.length,k:nk(raw)});}
 for(let i=0;i<toks.length-1;i++){if(/^(?:ن?می)$/u.test(toks[i].k)&&/^\p{L}/u.test(toks[i+1].k)&&!/\n/u.test(text.slice(toks[i].end,toks[i+1].start))){toks[i]={raw:text.slice(toks[i].start,toks[i+1].end),start:toks[i].start,end:toks[i+1].end,k:toks[i].k+toks[i+1].k};toks.splice(i+1,1);}}
 return toks;
}
function clausesOf(text){
 const toks=tokenize(text),clauses=[];let cur=[],depth=0;
 // a bracket only groups if it is closed later in the text (an unclosed «(» never disables comma boundaries)
 const closes=i=>toks.slice(i+1).some(t=>/^[)\]»}]$/u.test(t.raw));
 for(let i=0;i<toks.length;i++){
  const t=toks[i];const nl=i>0&&/\n/u.test(text.slice(toks[i-1].end,t.start));
  if(nl){if(cur.length)clauses.push(cur);cur=[];clauses.push(null);depth=0;}
  if(/^[(\[«{]$/u.test(t.raw)){if(closes(i))depth++;continue;}
  if(/^[)\]»}]$/u.test(t.raw)){depth=Math.max(0,depth-1);continue;}
  const boundary=PUNCT.test(t.raw)&&!(t.raw==='.'&&/\d$/u.test(toks[i-1]?.raw||'')&&/^\d/u.test(toks[i+1]?.raw||''))&&!(depth>0&&/^[،,]$/u.test(t.raw))
   ||!t.k&&/\p{Extended_Pictographic}|\p{So}/u.test(t.raw)||CONTRAST.has(t.k)&&!(t.k==='فقط'&&/^(?:با|بید|عند|صاحب|مدیر\p{L}*|المدیر)$/u.test(toks[i+1]?.k||''))||t.k==='بس'&&toks[i+1]?.k;
  if(boundary){if(cur.length)clauses.push(cur);cur=[];clauses.push(null);continue;}
  if(!t.k)continue;
  cur.push(t);
 }
 if(cur.length)clauses.push(cur);
 return clauses;
}
function opMatches(clause){
 const s=clause.map(t=>t.k).join(' '),starts=[];let pos=0;for(const t of clause){starts.push(pos);pos+=t.k.length+1;}
 const out=[];
 for(const [type,re] of OPRE){re.lastIndex=0;let m;while((m=re.exec(s))){
  const lead=m[0].match(/^\s*/u)[0].length,a=starts.indexOf(m.index+lead),endOff=m.index+m[0].length;let b=-1;for(let i=0;i<clause.length;i++)if(starts[i]+clause[i].k.length===endOff)b=i;
  if(a>=0&&b>=a)out.push({type,a,b});if(m[0].length===0)re.lastIndex++;}}
 out.sort((x,y)=>x.a-y.a||y.b-x.b);const kept=[];for(const o of out)if(!kept.some(k=>o.a>=k.a&&o.b<=k.b))kept.push(o);
 // every word of an operator match is an operator word or closed content (no quantities, no comparatives, no adjectives)
 return kept.filter(o=>clause.slice(o.a,o.b+1).every(t=>opWord(t.k)||contentOk(t.k))&&!clause.slice(o.a,o.b+1).some(t=>/(?:تون|تان|ک|کم)$/u.test(t.k)&&/^(?:مدیر|مسوول|مسیول|مالک|صاحب)/u.test(t.k)));
}
// Fronted topic: the WHOLE pre-operator part of the clause (or from a topic introducer, or from the last coordinating «و») must be
// closed content; otherwise nothing is scoped.
// refused (NEG) objects may carry the customer's possessive («التسليم المباشر لمخزنك ما نگدر نضمنه»): the possession is what is refused
function backward(clause,a,neg=false){
 if(a===0)return 0;
 // (review A2 S-C) an operator written with an attached coordinator («وما أگدر», «فما عندي») starts its own conjunct
 if(/^[وف](?:ما|مو|لا)$/u.test(clause[a].k))return a;
 let i=a-1;
 while(i>=0){const k=clause[i].k;
  // «X و Y OP» is ONE coordinated topic only when X is a SINGLE topic noun at the clause start («تخفیف و قیمت نهایی»); otherwise
  // «و»/«چون» starts a new conjunct and the operator governs only what follows it
  if(k==='و'&&i===1&&TOPIC_RE.test(clause[0].k)){return 0;}
  if(k==='و'||/^(?:چون|چونکه|زیرا|لان|لانه|لانی|عشان)$/u.test(k))return i+1;
  if(k==='فقط'){i--;continue;}                               // «X رو فقط صاحب کار …» (a boundary elsewhere)
  // an ATTACHED «و» starts the operator's conjunct; the scan never continues into the previous conjunct, which may be a verbless
  // claim («التسليم مباشر لباب بيتك والسعر يحدده صاحب الشغل»)
  // (only a SINGLE topic noun before it may join: «الخصم والأسعار …», never a verbless clause «التسليم مباشر لباب بيتك والسعر …»)
  if(isConj(k)&&contentOk(k))return i===1&&TOPIC_RE.test(clause[0].k)?0:i;
  if(INTRODUCER.test(k))return i;
  if(i===0&&clause[i+1]?.k==='مورد'&&k==='در')return 0;
  if(!spanOk(clause.map(t=>t.k),i)&&!(neg&&TOPIC_RE.test(k)))return null;
  i--;}
 return 0;
}
function forward(clause,o){
 // returns the last index governed by the operator, or null if the following words are an unscoped proposition
 let j=o.b+1;if(j>=clause.length)return o.b;
 const next=clause[j].k;
 // a new proposition after a coordinating «و» / causal connective is outside the scope (validated as usual)
 if(next==='و'||isConj(next)&&!COMPLEMENTIZER.test(next)||/^(?:چون|چونکه|زیرا|لان|لانه|عشان|تا|حتی)$/u.test(next))return o.b;
 const speech=o.type==='NEG'&&SPEECH_END.test(clause[o.b].k);
 if(!COMPLEMENTIZER.test(next)&&!speech&&!(o.type==='KNOW'&&INTRODUCER.test(next))&&!(o.type==='OWNER'&&/^(?:بس|وحده)$/u.test(next)))return null;
 // A WHETHER-question complement («… راح يوافق لو لا», «… إذا تدخل او لا», «… میشه یا نه») asserts nothing whatever its verb;
 // it is accepted when it closes with a whether-tail and holds no exceptive («إلا/غير/جز») and no number.
 // (review A2 S-D) the whether-complement itself is closed content: topic/function words, event verbs and owner-decision verbs only
 // (no possessive presupposition «مالتنا/‑مون», no relative «اللي/که», no exceptive, no number, no foreign words).
 const tailAt=(()=>{for(let x=j;x<clause.length-1;x++)if(/^(?:لو|او|یا)$/u.test(clause[x].k)&&/^(?:لا|نه)$/u.test(clause[x+1].k))return x+1;return -1;})();
 const OWNER_DECIDE=/^(?:راح|رح|یوافق|توافق|یقبل|تقبل|یرضی|میکنه|قبول|موافقت|تایید|کنه|میده|بده)$/u;
 if(tailAt>0&&clause.slice(j,tailAt+1).every((t,i2)=>contentOk(t.k)||COMPLEMENTIZER.test(t.k)||WHETHER_TAIL.test(t.k)||EVENT_VERB.test(t.k)||OWNER_DECIDE.test(t.k))&&clause.slice(tailAt+1).every(t=>contentOk(t.k)))return clause.length-1;
 // (review A2 S-G) event verbs only after a whether/that complementizer, never after a topic preposition («عن/على/حول/بخصوص»)
 const sub=/^(?:اذا|لو|ان|اینکه|ایا)$/u.test(next);
 let k=j;const ks=clause.map(t=>t.k);
 while(k<clause.length){const w=clause[k].k;
  if(w==='و'&&k>j)break;                                   // «… عن الضرر والتعويض» is fine; «… و + new clause» is checked below
  if(!(spanOk(ks,k)||/^(?:مستند|سند)$/u.test(w)&&/^(?:بدون|دون)$/u.test(ks[k-1]||'')||COMPLEMENTIZER.test(w)||WHETHER_TAIL.test(w)||sub&&EVENT_VERB.test(w)))return null;
  k++;}
 if(k<clause.length){const rest=clause.slice(k+1);if(!rest.length||!rest.every(t=>contentOk(t.k)))return k-1;}
 return k-1;
}
function relayScope(clause){
 const ks=clause.map(t=>t.k);
 const verbAt=ks.findIndex((k,i)=>RELAY_VERB.test(k)||RELAY_LIGHT.test(k)&&RELAY_1SG.test(ks[i+1]||''));
 if(verbAt<0)return null;
 // (review A2 S-E) «کار/شغل» alone means "work": it names the owner only right after «صاحب»
 const isOwner=i=>OWNER_TOKEN.test(ks[i])&&(!/^(?:کار|شغل|الشغل)$/u.test(ks[i])||/^(?:صاحب|لصاحب)$/u.test(ks[i-1]||''));
 const ownerAt=ks.findIndex((k,i)=>isOwner(i));
 if(ownerAt<0&&!/(?:علیه|اله)$/u.test(ks[verbAt])&&!ks.some(k=>/^(?:علیه|اله)$/u.test(k)))return null;
 // the relay clause starts at a purpose marker / «و»-joined relay verb, or at the clause start
 let start=ks.findIndex(k=>/^(?:تا|حتی|علمود|عشان)$/u.test(k));
 if(start<0||start>verbAt)start=/^و/u.test(ks[verbAt])?verbAt:0;
 // everything between start and the verb: closed content, owner words, recipient pronouns, relay objects, digits as quantities
 for(let i=start;i<verbAt;i++){const k=ks[i];if(i===start&&/^(?:تا|حتی|علمود|عشان)$/u.test(k))continue;
  if(k==='و'||isConj(k)&&!RELAY_OBJ.test(k))return null;   // no coordinated (possibly predicative) conjunct before the verb
  if(!(contentOk(k)||/^(?:اگدر|اکدر|اقدر|راح|رح|اول|بعدین|میتونم)$/u.test(k)||isOwner(i)||/^(?:صاحب|لصاحب)$/u.test(k)||RELAY_OBJ.test(k)||/^(?:علیه|اله|بهش|براش|ازش|ویاه|لصاحب|لمدیر|للمدیر|للاداره)$/u.test(k)||/^\d+$/u.test(k)))return null;}
 // after the verb: only the light-verb, owner/recipient words and the closed tail («تا بررسی کنه», «حتى يشوفها»)
 let end=RELAY_LIGHT.test(ks[verbAt])?verbAt+1:verbAt;
 for(let i=end+1;i<ks.length;i++){const k=ks[i];if(isOwner(i)||/^(?:صاحب|لصاحب)$/u.test(k)||RELAY_TAIL.test(k)||FUNC_RE.test(k)||RELAY_OBJ.test(k)||/^(?:لصاحب|لمدیر|للمدیر|للاداره)$/u.test(k))end=i;else return null;}
 return [start,end];
}
export function propositionScopes(text){
 const src=String(text||''),clauses=clausesOf(src),scopes=[];
 for(let c=0;c<clauses.length;c++){const clause=clauses[c];if(!clause)continue;
  for(const o of opMatches(clause)){
   let a=backward(clause,o.a,o.type==='NEG'),b=forward(clause,o);
   // «اینکه X رو [من] OP»: an explicit fronted subordinate clause — only with closed content inside
   const ks=clause.map(t=>t.k);const ink=ks.lastIndexOf('اینکه',o.a);
   if(a===null&&ink>=0&&/^(?:رو|را)$/u.test(ks[o.a-1]==='من'?ks[o.a-2]:ks[o.a-1])&&ks.slice(ink+1,o.a).every(k=>contentOk(k)||EVENT_VERB.test(k))){const pre=ink===0?0:backward(clause,ink);if(pre!==null)a=pre;}
   if(a===null||b===null)continue;
   // An OWNER referral of a customer-premises service («زمان تحویل درب منزل‌تون با مدیره») presupposes that service: not scoped.
   if(o.type==='OWNER'&&clause.slice(a,b+1).some(t=>/^(?:و|ف)?(?:ال|لل|بال|ب|ل)?(?:درب|منزل|خونه|خانه|باب|بیت|عنوان|محل|مخزن|مباشر)(?:ه|ی|ش|تون|تان|ک|کم|ج)?$/u.test(t.k)))continue;
   // «در مورد X، OP» / «بخصوص X، OP»: a fronted topic phrase alone in the previous comma clause (closed content only)
   if(a===0&&clause.slice(0,o.a).every(t=>/^(?:من|انا|انی)$/u.test(t.k))){const prev=clauses[c-1]===null?clauses[c-2]:null;
    if(prev&&prev.length&&prev.length<=10){const pk=prev.map(t=>t.k);
     if((INTRODUCER.test(pk[0])||pk[0]==='در'&&pk[1]==='مورد'||pk[0]==='اینکه')&&pk.slice(pk[0]==='در'?2:1).every(k=>contentOk(k)||pk[0]==='اینکه'&&EVENT_VERB.test(k)))scopes.push({start:prev[0].start,end:prev[prev.length-1].end,type:o.type,fronted:true});}}
   scopes.push({start:clause[a].start,end:clause[b].end,type:o.type});
  }
  const r=relayScope(clause);if(r)scopes.push({start:clause[r[0]].start,end:clause[r[1]].end,type:'RELAY'});
 }
 return scopes;
}
export function maskPropositionScopes(text){
 const src=String(text||''),scopes=propositionScopes(src).sort((x,y)=>x.start-y.start);
 if(!scopes.length)return src;
 let out='',pos=0;for(const s of scopes){if(s.end<=pos)continue;out+=src.slice(pos,Math.max(pos,s.start))+' ';pos=Math.max(pos,s.end);}
 return (out+src.slice(pos)).replace(/[ \t]{2,}/gu,' ');
}
