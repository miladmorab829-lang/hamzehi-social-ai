// Read-only semantic checks for informational shipping policy. This module does
// not calculate freight, authorize dispatch, select a carrier or grant terms.
import {conversationKey} from './sales-conversation-author.js';
import {maskPropositionScopes} from './sales-proposition-scope.js';
// «می ده» is joined into «میده» so the bare «ده» (also the number ten) never becomes a
// known word; the payer patterns accept both spellings.
const key=value=>conversationKey(value).replace(/\p{L}{33,}/gu,m=>m.slice(0,32)).replace(/(?<![\p{L}])[اأنیت]?نقل\p{L}*\s+(?:[\p{L}]+\s+)?(?:اله|إله|الیه|إليه|لیه|لصاحب\p{L}*|للمدیر|للمدير|الی\s+(?:صاحب|المدیر|المدير)\p{L}*|إلى\s+(?:صاحب|المدير)\p{L}*)(?![\p{L}])/gu,' اراجع صاحب ').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/(?<!\p{L})می (ده|دهد|دن|دهند|دید|دین|دهید|دیم|دهیم)(?!\p{L})/gu,'می$1').replace(/(?<=\p{L}) (?:ی|ای)(?= |$)/gu,'')
 // Idiom «به کارتون بیاد» (useful to you) is not a carton («کارتون»).
 .replace(/(?<!\p{L})به\s*کار(?:تون|تان|ت|شون)\s*(?:ب|می\s*)?(?:یاد|اد|خوره|خورد)(?!\p{L})/gu,'مفید').replace(/\s+/g,' ').trim();
// «شهرستان» (route classification) is evaluated here rather than by legacy checks that
// read the substring «شهر» as the Arabic word for month.
const shipping=/ارسال|باربری|اسنپ|وانت|تیپاکس|پست|حمل|کارتن|کارتون|شحن|توصیل|توصل|یوصل|نقل|کرتون|شهرستان|تسلیم|(?<!\p{L})[نتی]رسل\p{L}*|فرستیم|برید|dhl|aramex|fedex|(?<!\p{L})(?:ups|tnt)(?!\p{L})|ارامکس|courier|express|اکسپرس|shipping|freight|carrier|delivery/iu;
const charge=/هزینه|کرایه|مبلغ|اجور|کلفه|کلفت|کلفتة|تکلفه|مصاریف|رسوم|cost|charge|fee|amount/iu;
const prohibited=/[0-9۰-۹٠-٩$€£%٪]|تومان|تومن|ریال|دلار|دولار|دینار|درهم|رایگان|مجانی|مجانا|ببلاش|بلاش|بیعانه|عربون|واریز|حساب بانکی|شماره کارت|تخفیف|خصم|قسط|(?:پرداخت|دفع).{0,15}(?:شد|شده|تایید|تاکید|وصول)|(?<!\p{L})(?:ادفع|حول|free|paid|payment|discount|deposit|usd|toman|iqd|irr)(?!\p{L})/iu;
// cv58 (A10-046): a duration unit may carry an Arabic proclitic preposition/article («بأسبوع ونص», «باليومين», «لأسبوعين») or be a
// dual/plural; numeric or spoken, approximate or exact, it is the same time proposition.
const time=/(?<!\p{L})(?!بروز)(?!(?:ب|ل|بال|لل|ال|و|ف)(?:ساعت|ساعه))(?:ب|ل|بال|لل|ال|و|ف)?(?:روز|روزه|هفته|ماه|ساعت|یوم|یومین|ایام|اسبوع|اسبوعین|اسابیع|ساعه|ساعتین|ساعات|شهرین|اشهر|فردا|امروز|پس فردا|باچر|باجر|غدا|بکره|tomorrow|today|days?|weeks?|months?|hours?)(?!\p{L})|(?<!\p{L})(?:ب|خلال\s*)شهر(?!\p{L})/iu;
// «ساعت/الساعة» is also the WATCH product: an hour counts only with a number or a duration word before it.
export const durationUnit=/(?<!\p{L})(?!بروز)(?:\d+\s*)?(?:ب|ل|بال|لل|ال|و|ف)?(?:روز|روزه|هفته|ماه|یوم|یومین|ایام|اسبوع\p{L}*|اسابیع|شهرین|اشهر|day|days|week\p{L}*|month\p{L}*|hour\p{L}*)(?!\p{L})|(?<!\p{L})(?:ب|خلال\s*)شهر(?!\p{L})|(?:\d+|یک|یه|دو|سه|چند|کم|خلال|ظرف|بعد|کمتر\s*از|اقل\s*من)\s*(?:ساعت|ساعه|ساعتین|ساعات)(?!\p{L})|(?<!\p{L})ساعتین(?!\p{L})/u;
// Verb forms too («نضمنلك التسليم», «یضمنونه»): only an approved non-guarantee, removed before this test, is exempt.
const guarantee=/تضمین|تضمینی|مضمون|ضمان|قطعی|قول|حتما|همیشه|guarantee|promise|(?<!\p{L})[نایت]ضمن\p{L}*/iu;
// A no-charge statement may name ONLY production services (printing/design/cliché), never the box, order,
// price or freight («چاپ لوگو و جعبه رایگانه», «والطلبية كلها بدون كلفة» are not the approved fact).
export function productionServiceOnly(text){
 const v=key(text).replace(/(?:بسعر|ضمن\s*سعر|سعر|قیمت|بقیمت)\s*(?:خود\s*)?(?:ال)?(?:علبه|جعبه)/gu,' ').replace(/(?:درب|در|روی|غطاء|الغطاء|علی)\s*(?:ال)?(?:جعبه|علبه)/gu,' ');
 return /(?<!\p{L})(?:و|ال|وال|بال)?(?:چاپ|طراحی|کلیشه|طباع|تصمیم|کلیش|لوگو|شعار|ذهبی|فضی|اسود)\p{L}*|کوب/u.test(v)&&!/(?<!\p{L})(?:و|ال|وال|بال)?(?:سفارش\p{L}*|طلب\p{L}*|جعبه\p{L}*|علب\p{L}*|باکس|بسته\p{L}*|روبان\p{L}*|ربان\p{L}*|شریط\p{L}*|نوار\p{L}*|order\p{L}*|box\p{L}*|ارسال|باربری|حمل|کرایه|شحن|نقل|توصیل|تحویل|کارتن|کرتون)(?!\p{L})/u.test(v);
}
// «ندارم» / «ما عندي» are a knowledge gap only when the missing thing is KNOWLEDGE
// (information, a figure, the exact amount); «هیچ هزینه‌ای ندارم» is a free-shipping claim.
const gap=/نمی\s*(?:دونم|دانم|تونم\s*بگم|توانم\s*بگویم)|(?:اطلاع|اطلاعات|اطلاعاتی|جزئیات|رقم|رقمی|عدد|عددی|مبلغ\s*دقیق|مبلغش\s*رو|دقیقش\s*رو|اطلاع\s*دقیقی|رقم\s*دقیقی)\s*(?:\p{L}+\s+){0,2}?ندارم|نامشخص|(?:مشخص|معلوم|روشن)\s*نیست|نیازمند\s*استعلام|باید(?:\s*جدا)?\s*استعلام|استعلام\s*(?:بشه|شود)|(?:با|بعد\s*از)\s*استعلام\s*(?:مشخص|معلوم)\s*(?:می\s*)?(?:شه|شود)|نیاز\s*به\s*استعلام|استعلام\s*(?:معتبر\s*)?(?:لازم|لازمه)|نمی\s*شه\s*گفت|ما\s*عندی\s*(?:رقم|معلومات|تفاصیل|مبلغ|فکره)|ما\s*(?:اعرف|اکدر|اقدر|اگدر|نذکر|اذکر)|مو\s*(?:معروف|محدد|ماکد)|یحتاج\s*(?:تسعیر\p{L}*|استعلام|استفسار)|لازم\s*نستعلم|needs?\s*(?:a\s*)?(?:quote|inquiry)|unknown/iu;
const asserted=/رایگان|مجانی|ببلاش|بلاش|تضمین|ضمان|حتما|می\s*(?:دیم|دهیم|فرستیم)|ارسال\s*(?:شد|شده)|تم\s*الشحن|نوصل|راح\s*یوصل|shipped|guaranteed/iu;
const uncertainSubject=/مبلغ|مبلغش|رقم|هزینه|کرایه|زمان|مدت|موعد|وقت|اجور|کلفه|تفاصیل|دقیق|قیاس|اندازه|ابعاد|تناسب|مناسب بودن|fit|amount|time|detail/iu;
const lexicalAliases={رقم:'مبلغ',رقمش:'مبلغش',دقیقش:'دقیق',کرایه:'هزینه',شماست:'شما',لابادان:'ابادان',علیک:'علی',استفسار:'استعلام',رسیدن:'تحویل',الوصول:'تحویل',بعده:'بعدنا',فبعده:'بعدنا',معروف:'مشخص',روشن:'مشخص'};
const wordKey=word=>lexicalAliases[word]||word;
const uncertaintyWords=new Set(('مبلغ مبلغش دقیق دقیقش هزینه هزینهها کرایه ارسال حمل باربری کارتن زمان مدت قطعی تحویل قیمت فعلی رو را الان هنوز نمی دونم نمیدونم نمی دانم نمیدانم ندارم نمی تونم نمیتونم بگم بگویم نامشخص مشخص معلوم نیست است نیازمند استعلام باید بشه بشود شود معتبر و اطلاعات اطلاعاتی کافی درباره تناسب اندازه ابعاد محصول شیشه عطر این جعبه مناسب بودن اش هنوزش در دسترس ما عندی اعرف کلفه اجور شحن الشحن للشحن المبلغ الدقیق بالضبط هسه بعدنی مو معروف محدد ماکد یحتاج استعلام موثوق لازم نستعلم وقت موعد معلومات تفاصیل').split(' '));
uncertaintyWords.add('بعدنا');
uncertaintyWords.add('جدا');
// Modal/subjunctive and past forms of "an inquiry is needed" («باید استعلام بگیریم»،
// «باید استعلام کرد»). The indicative «می‌گیریم/می‌گیرم» (we/I will get) is deliberately
// absent: that is a follow-up promise, not a statement of a knowledge gap.
for(const word of ('بگیریم بگیرم بگیرید بگیرن گرفت گرفته کرد کنیم بکنیم کنید فعلا اکدر اقدر احدد احددها '+
 'انتقال بار مقصد ایران عراق دقیقا حتی نیاز به داره لازمه گفت میشه شه طوری همینطوری تقریبی عدد عددی جزئیات بیشتر بیشترش پرداخت نحوه چطوری چطور کی انجام بهتون اذکرلک اذکر انطیک انطیه نذکر غیر موثق مضبوط اگدر اگوله اقول').split(' '))uncertaintyWords.add(word);
// Words that cannot state a shipping proposition: clitics left as separate tokens by
// ZWNJ splitting (هزینه‌ی، هزینه‌اش، جعبه‌ها، هزینه‌تون), connectives, courtesy and forms
// of address. First-person "our/us" forms (ـمون، ـمان، ـنا) are deliberately absent so a
// business-payer statement can never be normalised into a known word.
const functionWords=new Set(('ی ای اش ش ها های هایی تون تان '+
 'پس مثل مثلا مانند چون چونکه زیرا ولی اما البته ضمنا همچنین یعنی که اگر اگه دیگه دیگر درواقع واقع راستش خب ببینید ببین بله اره اینکه '+
 'متاسفانه خوشبختانه عزیزم عزیز جان دوست قربان قربانت لطفا ممنون مرسی سپاس متشکرم خدمتتون خدمت عرض '+
 'توی تو واسه برا بابت درباره مورد اساس براساس همون همین اون اونا اینا شماها '+
 'هلا اهلا اهلین حبیبی حبیبتی عیونی عینی اغاتی تدلل بس شوف طبعا لان یکون تکون طریق بواسطه هو هی هذا هذه '+
 // answer particles, Iraqi demonstratives/relatives, quantifiers over the SAME approved costs
 // Scope words that NARROW a claim («فقط», «بس», «حتی», «بقیه», «سایر») and the polarity
 // word «نه» are deliberately absent: «فقط کارتن با شماست» implies the rest is not.
 'هم ست هاست اینو اینم اونو نعم ای بله اللی های هاذ هذنی هذنه کلها کل مع صراحه بصراحه منها ان انه طور همینطور شکل قدر کلا لطفتون افهمک '+
 // greetings that a splitter left attached, and «what I can tell you is that…»
 'سلام درود وقت وقتتون بخیر اگدر اکدر اگوله اقوله اکوله والله پای می').split(' '));
// Possessive/copular endings and Arabic proclitics that change neither the actor nor the
// claim. No first-person ending is listed (see above).
const endings=['هایی','های','ها','تون','تان','اش','ش','یه','ه','ست','ی','کم','ک','ج'];
const proclitics=['وبال','فبال','بال','وال','فال','لل','ال','ف','ب','ل'];
function knownWord(word,set){
 const has=w=>set.has(w)||set.has(wordKey(w))||functionWords.has(w);
 if(has(word)||word.startsWith('و')&&has(word.slice(1)))return true;
 const stem=w=>w.length>=2&&(has(w)||endings.some(e=>w.endsWith(e)&&w.length-e.length>=2&&has(w.slice(0,-e.length))));
 if(word.startsWith('و')&&word.length>=4&&stem(word.slice(1)))return true;
 if(endings.some(e=>word.endsWith(e)&&word.length-e.length>=2&&has(word.slice(0,-e.length))))return true;
 return proclitics.some(p=>word.startsWith(p)&&word.length-p.length>=3&&stem(word.slice(p.length)));
}
function wordsKnown(value,set){return value.split(' ').filter(Boolean).every(word=>knownWord(word,set));}
// A NON-COMMITTAL clause mentions a protected topic only to disclaim it: the speaker does not know / cannot confirm or
// promise it, or says the owner decides it («دربارهٔ بیمه اطلاعات تأییدشده ندارم», «تخفیف رو فقط مدیر تعیین می‌کنه»,
// «ما نكدر نضمن التوصيل لباب البيت», «الخصم يقرره المدير بس»). It asserts no business fact, so no commitment detector may
// read it as a commitment. It is strict: no amount, no existence/ability/offer predicate, no completed approval
// («مدیر تأیید کرده»), no positive guarantee; a contrast clause («… ولی بیمه داریم») must be non-committal on its own.
const knowledgeDisclaimer=/(?<!\p{L})تایید(?:ی|یه)?\s*(?:\p{L}+\s+){0,1}?ندارم(?!\p{L})|(?<!\p{L})ما\s*عندی\s*(?:\p{L}+\s+){0,1}?تاکید(?!\p{L})|(?<!\p{L})ماکو\s*(?:عندی|عدنا|عندنا)(?!\p{L})|(?:اطلاع\p{L}*|خبر|معلوم\p{L}*|جواب|رقم\p{L}*|عدد\p{L}*|تفاصیل|شی|چیز\p{L}*|مبلغ\p{L}*|قیمتی|نرخی)\s*(?:\p{L}+\s+){0,3}?(?:ندارم|نداریم)(?!\p{L})|(?<!\p{L})[وف]?(?:ما|مو)\s*(?:عندی|عدنا|عندنا)\s*(?:\p{L}+\s+){0,5}?(?:معلوم\p{L}*|موکد\p{L}*|مؤکد\p{L}*|موثق\p{L}*|اکید\p{L}*|تفاصیل|شی\s*(?:موکد|مؤکد|اکید|موثق))|مطم(?:ی|ئ)?ن\s*نیستم|(?<!\p{L})(?:ما|مو)\s*(?:متاکد|متأکد)\p{L}*|نمی\s*(?:دونم|دانم)|(?<!\p{L})ما\s*(?:اعرف|ادری)(?!\p{L})/u;
const promiseDisclaimer=/(?<!\p{L})و?(?:ما|مو|لا)\s*(?:[انتی]?ضمن\p{L}*|مضمون\p{L}*|ینضمن\p{L}*)|تضمین\s*(?:نمی\p{L}*|نمیکنیم|نمیشه)|تضمینی\s*(?:نیست|نداره)|قول\s*(?:نمی\s*دم|نمیدم|نمی\s*دیم|نمیدیم)|(?:نمی\s*(?:تونم|توانم|تونیم|توانیم)|(?<!\p{L})[وف]?ما\s*(?:[انت]?(?:گدر|کدر|قدر)|ن(?:گدر|کدر|قدر))|(?<!\p{L})و?من(?:گدر|کدر))\s*(?:\p{L}+\s+){0,3}?(?:قول|تایید|تأیید|تضمین|ضمان|[انت]?ضمن\p{L}*|[اان]?[اأ]?کد\p{L}*|ااکد\p{L}*|[انت]?وعد\p{L}*|بگم|[اان]?گول\p{L}*|[اان]?ذکر\p{L}*|[اان]?حدد\p{L}*|تعهد|عدد|رقم|مبلغ|بدم|بدیم|اعمال\s*کنم|انجام\s*بدم|[اان]?نطی\p{L}*|[اان]?عطی\p{L}*|[اان]?سوی\p{L}*)/u;
const ownerDecides=/(?:(?:با|به|طبق|منوط\s*به)\s*(?:تصمیم|تایید|تأیید|نظر|اجازه)\s*(?:ی\s*)?(?:\p{L}+\s+){0,1}?(?:مدیر|مالک|صاحب|المدیر)\p{L}*|(?<!\p{L})(?:مدیر|مالک|صاحب|المدیر|المالک|الاداره|owner|manager)\p{L}*\s*(?:\p{L}+\s+){0,4}?(?:تعیین|تصمیم|مشخص|بررسی|تایید|تأیید|[یت]قرر\p{L}*|[یت]حدد\p{L}*|یشوف\p{L}*|decid\p{L}*|determin\p{L}*)(?:\s*(?:می\s*)?(?:کنه|کند|کنند|کنن|شه|شود|گیره|گیرد|میکنه|میشه|میگیره))?|(?:تعیین|تصمیم|بررسی|تایید|تأیید|قرار|شرایط|موافقه|الموافقه)\p{L}*\s*(?:\p{L}+\s+){0,4}?(?:با|دست|بید|عند|یقرر\p{L}*|یقرره\p{L}*|یقررها\p{L}*)\s*(?:\p{L}+\s+){0,1}?(?:مدیر|مالک|صاحب|المدیر|المالک|الاداره)\p{L}*)/u;
const ownerDefers=/(?<!\p{L})(?:با|دست|بید|عند|بإید)\s*(?:ی\s*)?(?:مدیر|مالک|صاحب|المدیر|المالک|الاستاذ|استاذ)\p{L}*(?:\s*(?:مجموعه|کار|الشغل)\p{L}*)?|(?:باید|لازمه)\s*(?:\p{L}+\s+){0,1}?(?:مدیر|مالک|صاحب)\p{L}*\s*(?:\p{L}+\s+){0,2}?(?:نظر\s*بده|تصمیم\s*بگیره|بگه|تایید\s*کنه|مشخص\s*کنه)|(?:مدیر|مالک|صاحب\s*مجموعه)\p{L}*\s*(?:\p{L}+\s+){0,1}?(?:میگه|می\s*گه|تعیین\s*می\s*کنه)|(?:دست|با|بید|عند)\s*(?:من|انا|ای)\s*(?:نیست|مو|ما|لیس)|(?:مو|ما)\s*(?:بیدی|بایدی|عندی\s*صلاحیه)/u;
// Iraqi verb-first owner decision («يقررها المدير», «يحددها صاحب الشغل»).
const ownerDecidesVerbFirst=/(?<!\p{L})(?:[یت]قرر\p{L}*|[یت]حدد\p{L}*|یشوف\p{L}*|یوافق\p{L}*|تقرره\p{L}*)\s*(?:\p{L}+\s+){0,1}?(?:ال)?(?:مدیر|مالک|صاحب|اداره)\p{L}*/u;
const committalPredicate=/[0-9۰-۹٠-٩$€£%٪]|(?<!\p{L})و?(?:هی|هو|هم)\s+\p{L}{3,}|(?<!\p{L})می\s*(?!دونم|دانم|تونم|توانم|تونیم)\p{L}{2,}|(?<!\p{L})(?:است|هست|هستن|هستند|میشه|میره|میاد|داره|دارن|بشه|باشه)(?!\p{L})|(?<!\p{L})(?:اکید|أكيد|اكيد|مضمون|سلیم|سالم|یوصل\p{L}*|توصل\p{L}*|میرسه|میرسد|خبرتون|خبرت|اطلاع\s*می|پیگیری|پیگیر|ابلغ\p{L}*|اخبرک|ابشرک|راه\s*میایم|کنار\s*میایم)(?!\p{L})|(?<!\p{L})(?:داریم|عدنا|اکو|متوفر\p{L}*|یتوفر|میدیم|می\s*دیم|می\s*کنیم|میکنیم|می\s*زنیم|میزنیم|انجام\s*می\p{L}*|نسوی\p{L}*|نسویل\p{L}*|نطبع\p{L}*|نضمن(?:لک|لج|لکم)?|اضمنلک|تصیر|یصیر|میشه|می\s*شه|رایگان\p{L}*|مجان\p{L}*|ببلاش|بلاش|(?:تایید|تأیید|قبول|ثبت|دریافت|واریز|ارسال|تحویل|اوکی|اماده|آماده|انجام)\s*(?:\p{L}+\s+){0,1}?(?:شد|شده|کرد|کرده|کردیم|داد|داده|دادیم)|وصل\p{L}*|استلمنا|تثبت|انقبل|اوکی|ok|وافق\p{L}*|موافق(?:ه|ت)?\s*(?:کرد|کرده|هست|است)|سمح\p{L}*|حتما|حتمن|قطعا|اکیدا|درصد|تخفیف\s*(?:می|داریم|میدیم|بدیم)|بیمه\s*(?:است|هست|داره|داریم))(?!\p{L})/u;
const contrast=/(?<!\p{L})(?:ولی|اما|لکن\p{L}*|لاکن\p{L}*|بس(?=\s+\p{L}+\s+\p{L}+)|but)(?!\p{L})/u;
// pre-cv57 clause-level portion, used by the factual-grounding pass
export function committalPortionLegacy(text){
 const pieces=String(text).split(/[،,؛;\p{Extended_Pictographic}]|\s+(?=و\s*(?:ما|مو|لا|نمی|اطلاع|درباره|راجع|عن)\s)|(?<!\p{L})(?:ولی|اما|بس|لکن|لاکن|ولکن|منتها)(?!\p{L})/u).map(piece=>piece.trim()).filter(Boolean);
 return pieces.length>1?pieces.filter(piece=>!nonCommittalClause(piece)).join('، '):String(text);
}
// cv58: clause-level portion, then the strict proposition-scope layer removes ONLY the spans a non-committal operator governs
// (sales-proposition-scope.js). Everything else in the clause is still validated.
export function committalPortion(text){ return committalPortionLegacy(maskPropositionScopes(text)); }
// ALLOW-LIST: after the disclaimer phrase itself is removed, every remaining word must be a topic introducer, a function or
// courtesy word, a speech-act word of the disclaimer («بگم», «قول بدم», «أذكرلك»), or a NOUN naming the protected topic that
// is being disclaimed. Any other word — a past participle («شده», «پذیرفته»), a nominal predicate («با ماست», «علينا»,
// «لازم»), a completed owner decision («مدیر تعیین کرده»), a positive verb — makes the clause committal. (Reviewer E F1.)
const disclaimerAllowed=new Set(('جلوی جلو دم درب درباره دربارهی راجع به در مورد بخصوص خصوص بالنسبه بالنسبة عن حول من ال و یا او این اون همین هذا هذه هذی رو را که هم من انا شما فعلا الان هسه هسع حالیا بالضبط دقیق دقیقی دقیقا کافی کافیه تاییدشده تاییدشدهای نهایی دقیقش بدون دون مستند سند وصول وصل نفسه نفس بالضبط موکد مؤکد موکده مؤکده موثق موثقه اکید ای ی ها های هایی راستش صادقانه بصراحه صراحه والله متاسفانه متأسفانه عزیزم عیونی عینی حبیبی خیی اخی اغاتی جان خانم اقا البته ببخشید اسف عذرا هنا اینجا الحین شی چیزی هیچ هیچی خبری اطلاعی دقیقه بالتفصیل تفصیل تفاصیل بگم بگیم بدم بدیم بهتون بهت بهش کنم کنیم بخوام بخوایم اشتباه راهنمایی قولی عددی رقمی رقم عدد اکولک اگولک اکلک اگلک انطیک اذکرلک اذکر اوعدک اوعدج اوعدکم احددلک اگول اکول اقول اقدر اگدر اکدر نکدر نگدر ما مو لا ولا حتی فقط بس تنها خود خودشون صاحب مجموعه مجموعهست الشغل الادارة اداره').split(' '));
const disclaimedTopic=/^(?:اکثر|الاکثر|طلب|طلبا|مبیع|مبیعا|پرفروش|پرفروشترین|محبوب|محبوبترین|کیفیت|جوده|مقایسه|مقارنه|رقبا|رقیب|غیرنا|بقیه|دیگران|سوق|بازار|بیمه|بیمهی|تامین|جبران|خسارت|خساره|تعویض|ضمان|تخفیف|تخفیض|خصم|قیمت|قیمتها|سعر|مبلغ|مبلغش|هزینه|هزینهها|کلفه|اجور|اجوره|کرایه|کرایهش|پرداخت|دفع|بیعانه|عربون|شرایط|شروط|طریقه|روش|قسط|اقساط|فاکتور|فاتوره|تحویل|توصیل|تسلیم|درب|منزل|خونه|مغازه|محل|باب|بیت|عنوان|ارسال|شحن|حمل|نقل|بار|بضاعه|باربری|تیپاکس|پست|پیشتاز|dhl|aramex|اسنپ|وانت|سیاره|خاصه|جوی|طیاره|شرکه|زمان|وقت|مده|مدت|تاریخ|تولید|انتاج|تصنیع|تجهیز|نوبت|موجودی|انبار|مخزن|جنس|ماده|مواد|داخل|ابعاد|اندازه|اندازهی|سایز|قیاس|مقاس|ارتفاع|طول|عرض|قطر|تناسب|چاپ|طباعه|رنگی|تمام|فول|کالر|ملونه|ملون|الوان|دیجیتال|برجسته|بارزه|یووی|لیزری|هولوگرامی|مخمل|فوم|اسفنج|مگنت|اهنربا|مغناطیس|ضد|اب|ماء|استثنا|استثنایی|ثبت|نهایی|سفارش|طلب|طلبیه|درخواست|رنگ|لون|کف|دیواره|دیوارهها|کناری|روبان|ربان|شریط|نوار|مدل|مودیل|جعبه|جعبهها|علبه|علب|شیشه|قنینه|عطر|بطری|ساعت|انگشتر|خاتم|کرج|نوع|انواع|موضوع|مورد|بخش|قسمت|اینها|ذلک|هالشی)$/u;
function disclaimerWordAllowed(word){
 const bare=word.replace(/^(?:وال|بال|لل|و|ال|ب|ل)(?=\p{L}{2})/u,'');
 return [word,bare,bare.replace(/(?:تون|تان|ش|ک|ج|کم|ها|های)$/u,'')].some(w=>disclaimerAllowed.has(w)||disclaimedTopic.test(w));
}
const ownerDecidesPresent=new RegExp(ownerDecides.source.replace(/\(\?:\\s\*\(\?:می\\s\*\)\?\(\?:کنه\|کند\|کنند\|کنن\|شه\|شود\|گیره\|گیرد\|میکنه\|میشه\|میگیره\)\)\?/u,'(?:\\s*(?:می\\s*)?(?:کنه|کند|کنند|کنن|شه|شود|گیره|گیرد|میکنه|میشه|میگیره|بگیره|کنه|بده|بگه|میگه))'),'u');
// The topic of a negated knowledge/confirmation act is not asserted (cv50b); a commitment inside it is.
function epistemicTopicResidue(words){
 const content=words.filter(word=>word.length>=2&&!disclaimerWordAllowed(word));
 if(content.length>10)return false;
 // A verb clause in the residue is a second assertion (cv50e): Arabic imperfect/coordinated verbs, Persian finite verbs.
 if(content.some(word=>/^و?(?:ن|ی|ت|ا)\p{L}{2,}$/u.test(word)&&/^و?(?:ن|ی|ت)(?:ضمن|طبع|سوی|وصل|رسل|شحن|بدل|عوض|رجع|حمل|دفع|عطی|نطی|حط|ضیف|جیب|سلم|خلی|کدر|گدر|قدر|صیر|کون|بقی)\p{L}*$/u.test(word)||/^(?:می|نمی)\p{L}{2,}(?:یم|ه|ن|د)$/u.test(word)))return false;
 if(words.some(word=>word==='و')||content.some(word=>/(?:تر|تره|ترین|ترن|ترینه)$/u.test(word)&&word.length>4||/^(?:ارخص|احسن|افضل|اقوی|اقل|اکثر|اغلی|اجود|ابرک|امتن)$/u.test(word)))return false;
 const introduced=words.some(word=>/^(?:عن|حول|بخصوص|درباره\p{L}*|راجع|مورد|اذا|إذا|اگه|اگر|که|ایا|آیا|لو|هل)$/u.test(word));
 if(!introduced&&content.some(word=>/^(?:و|ال|وال)?(?:چرم|جلد|مخمل|پارچه|ساتن|حریر|چوب|خشب|فلز|پلاستیک|بلاستیک|مقوا|کاغذ|کرافت|اسفنج|فوم|طبیعی|طبیعیه|اصلی|اصل|ضد|مقاوم|محکم)\p{L}*$/u.test(word)))return false;
 return !content.some(word=>/^(?:و)?(?:رایگان\p{L}*|مجان\p{L}*|ببلاش|بلاش|علینا|علیک\p{L}*|علیکم|مضمون\p{L}*|تضمین\s*شده|ثبت|ثبتش|تثبت\p{L}*|انقبل|انحجز|تایید\s*شد|شد|شده|شدن|موجود\p{L}*|متوفر\p{L}*|جاهز\p{L}*|حاضر\p{L}*|داریم|عدنا|عندنا|اکو|هست|است|هستن|میشه|نوصل\p{L}*|نرسل\p{L}*|نشحن\p{L}*|نطبع\p{L}*|نسوی\p{L}*|نبدل\p{L}*|نعوض\p{L}*|نرجع\p{L}*|نتحمل\p{L}*|ندفع\p{L}*|میدیم|میفرستیم|میرسه|میرسونیم|میکنیم|میزنیم|میاریم|لان|لأن|چون|چونکه|زیرا|بس|ولی|اما|لکن|ولکن|بلکه|یعنی)$/u.test(word));
}
export function nonCommittalClause(text){
 const value=key(text);if(!value)return false;
 const parts=value.split(contrast).map(part=>part.trim()).filter(Boolean);
 return parts.every(part=>{
  if(/[0-9۰-۹٠-٩$€£%٪]/u.test(part))return false;
  const markers=[knowledgeDisclaimer,promiseDisclaimer,ownerDecidesPresent,ownerDecidesVerbFirst,ownerDefers];
  if(!markers.some(re=>re.test(part)))return false;
  let rest=part.replace(/(?<!\p{L})تایید\s*شده(\p{L}*)/gu,'تاییدشده$1').replace(/(?:(?<!\p{L})(?:اینکه|که\s*ایا|ایا|اذا|لو)\s*)?(?:\p{L}+\s+){0,6}?(?:میشه|می\s*شه|هست|داره|تدخل|یدخل|یصیر|تکفی)\s*(?:یا\s*نه|لو\s*لا|او\s*لا)?(?=\s*(?:رو|را)?\s*(?:نمی|نمیدونم|ما\s*اعرف|ما\s*ادری|مو\s*متاکد|مطمئن\s*نیستم))/gu,' ');for(const re of markers)rest=rest.replace(new RegExp(re.source,'gu'),' ');
  const residue=rest.split(/\s+/u).filter(Boolean);
  return residue.every(word=>word.length<2||disclaimerWordAllowed(word));
 });
}
export function honestInformationGap(text){
 if(nonCommittalClause(text))return true;
 const value=key(text);
 // The target may be unknown (for example insurance). Only this complete
 // knowledge-gap speech act is exempt; no assertion may precede/follow it.
 const targeted=value.match(/^(?:(?:ولی|اما|البته)\s+)?(?:درباره|راجع به|در مورد)\s+(.{1,100}?)(?:\s+(?:الان|فعلا|هنوز))?\s+(?:اطلاعات|جزئیات|اطلاع)(?:\s+(?:دقیق|دقیقی|کافی|بیشتری|تایید\s*شده))*\s+ندارم(?:\s+که\s+(?:بهتون\s+)?بگم)?$/u)?.[1];
 if(targeted&&!prohibited.test(value)&&!/(?<!\p{L})(?:است|هست|دارد|داره|داره|داریم|مناسبه|مناسب|موجود|میشه|می|شد|شود|هستند|بیها|متوفر)(?!\p{L})/u.test(targeted))return true;
 return uncertainSubject.test(value)&&gap.test(value)&&wordsKnown(value,uncertaintyWords)&&!prohibited.test(value)&&!asserted.test(value)&&!payerOf(value);
}
// Loss, damage, refund or insurance coverage is an owner-level commercial undertaking. No
// approved knowledge grants it, so any sentence that ASSERTS such coverage — by us, by a
// carrier, or passively («جبران می‌شه», «بیمه است») — is rejected wherever it appears,
// with or without a shipping word. The only permitted mention is an explicit knowledge
// gap («درباره‌ی بیمه‌ی حمل اطلاعاتی ندارم»), which asserts nothing.
// Each concept is tied to a LOSS/MONEY object, so «رنگ رو عوض کنیم» (change a colour) or
// «لطفتون رو جبران کنیم» (return a courtesy) is ordinary conversation, not coverage.
const lossConcept=/(?<!\p{L}|(?:ما|مو|غیر|لا)\s)و?(?:مومن|مامن)(?:ه|ة)?(?!\p{L})|(?<!\p{L})[نیت]?عوض(?:ک|کم|ج|کی|کن)(?!\p{L})|(?:اگه|اگر)\s*(?:\p{L}+\s+){0,3}?(?:شد|افتاد|اومد|پیش\s*اومد)\s*(?:\p{L}+\s+){0,1}?(?:با\s*ما|گردن\s*ما|پای\s*ما|به\s*عهده\s*(?:ی\s*)?ما)(?!\p{L})|(?:اذا|لو)\s*(?:\p{L}+\s+){0,3}?(?:صار|حصل|انکسر|تکسر|خرب)\p{L}*\s*(?:\p{L}+\s+){0,2}?(?:علینا|برقبتنا|نتحمل\p{L}*)|جبران\s*(?:\p{L}+\s+){0,2}?(?:خسارت|ضرر|اسیب|اسیبی|اسیبها|شکستگی|هزینه|پول|وجه)|(?:خسارت|ضرر|اسیب|شکستگی)\p{L}*\s*(?:\p{L}+\s+){0,3}?جبران|غرامت|تاوان|بازپرداخت|عودت\s*(?:وجه|پول)|برگشت\s*(?:وجه|پول)|پس\s*(?:دادن|می\s*دیم|میدیم|می\s*دهیم)\s*(?:پول|وجه|مبلغ)|بیمه|خسارت|refund|compensat|reimburs|insur|(?<!\p{L})(?:ن|ی|ت|و)?عوض\p{L}*\s*(?:\p{L}+\s+){0,2}?(?:التالف|المکسور|الخراب|الضرر|الخساره|خسارتک|خسارتج)|(?:اذا|لو)\s*(?:\p{L}+\s+){0,3}?(?:تضرر|انکسر|تکسر|خرب)\p{L}*\s*(?:\p{L}+\s+){0,2}?(?:ن|و)?عوض|تعویض\s*(?:ال)?(?:تالف|خراب)|(?<!\p{L})نرجع\p{L}*\s*(?:ال)?(?:فلوس|مبلغ|پاره|پیسه|فرق)|(?:کسر|تلف|ضرر|خراب|تضرر|انکسر)\p{L}*\s*(?:\p{L}+\s+){0,3}?(?:ن|ت|ی)?عوض|(?:تفاوت|مابه\s*التفاوت|اضافه)\p{L}*\s*(?:\p{L}+\s+){0,2}?(?:پس|برمی|بر\s*می|برگشت)|ضمان\s*(?:ال)?(?:وصول|سلامه|تلف)/iu;
export function nonAssertiveUncertainty(text){const v=key(text);return (uncertaintyFrame.test(v)||uncertainSpeech.test(v))&&!prohibited.test(v)&&!outcomeCommitment(text)&&!sentenceRisk(text,text)&&!payerOf(v);}
export function compensationCommitment(text){
 if(nonCommittalClause(text))return false;
 text=committalPortion(text);
 const value=key(text);
 if(!lossConcept.test(value))return false;
 return !honestInformationGap(text);
}
// Speech that explicitly frames something as unknown («نمی‌تونم بگم … جا می‌شه یا نه»)
// asserts nothing; it is checked before the outcome categories below.
const uncertaintyFrame=/نمی\s*(?:دونم|دانم|تونم\s*(?:بگم|تضمین|قول)|توانم)|اطلاع\p{L}*\s*(?:\p{L}+\s+){0,2}ندارم|(?:مشخص|معلوم|روشن)\s*نیست|یا\s*نه\s*$|مطم(?:ی|ئ)?ن\s*نیستم|(?:ما|مو)\s*متاکد|ما\s*(?:اعرف|اکدر|اگدر|اقدر)|ما\s*عندی\s*(?:رقم|معلومات|تفاصیل|فکره|مبلغ\s*(?:ال)?(?:دقیق|مضبوط|موثق))|مو\s*(?:متاکد|معروف|محدد)|غیر\s*معروف|unknown|not\s*sure/u;
// A stated ABSENCE of a cost («هزینه‌ای نداره»، «ما عندي أجور»، «بلا أجور») is a free-shipping
// claim, never an uncertainty. «… مشخص/معلوم نیست» (not yet known) is not absence.
const costAbsence=/(?:هزینه|کرایه|اجور|کلفه|پول|مصاریف)\p{L}*\s*(?:\p{L}+\s+){0,2}?(?:نداره|ندارد|نداریم|نمی\s*خواد|نمیخواد|نمی\s*گیریم|نمیگیریم)(?!\p{L})|(?:ما\s*عندی|ما\s*عدنا|ما\s*علیها|ما\s*بیها|ماکو|بدون|بلا|بلاش)\s*(?:\p{L}+\s+){0,1}?(?:ال)?(?:اجور|کلفه|هزینه|کرایه|مصاریف|فلوس)/u;
// Outcome commitments no approved knowledge grants (independent of any shipping word):
// a promised arrival/delivery outcome, an assurance of no damage or safe arrival, a
// capacity/fit claim, or the business taking (a share of) a cost.
const arrivalPromise=/(?:به\s*دست\s*(?:تون|ت|شون)?|دستتون)\s*(?:می\s*)?(?:رسه|رسد|رسن)|(?<!\p{L})(?:می\s*)?(?:رسه|رسد)\s*(?:به\s*دست|دستتون|قبل|سر\s*موقع|به\s*موقع)|(?:قبل\s*از|پیش\s*از|سر|تا)\s*\p{L}*\s*(?:مراسم|عروسی|عقد|جشن|عید|نمایشگاه)\p{L}*\s*(?:\p{L}+\s+){0,3}(?:می\s*)?(?:رسه|رسد|میرسه|تحویل)|(?<!\p{L})(?:ی|ت|ن|راح\s*ی|راح\s*ت|راح\s*ن)?(?:وصل|وصلک|وصلج|وصلکم|وصلها)\s*(?:قبل|بوقت|علی\s*الوقت|سالم)|(?:will|gonna)\s+(?:arrive|reach)/u;
const outcomeAssurance=/(?:هیچ\s*)?(?:اسیبی|اسیب|شکستگی|ضربه\p{L}*|خرابی)\s*(?:\p{L}+\s+){0,2}(?:نمی\s*)?(?:بینه|بیند|خوره|خورد|نمیاد|پیش\s*نمیاد)|سالم\s*(?:می\s*)?(?:رسه|رسد|میرسه|تحویل)|خیال\s*(?:تون|تان|ت)?\s*راحت\s*(?:\p{L}+\s+){0,4}?(?:اسیب|سالم|شکست|خراب|ضربه)|(?:ما|مو|لا)\s*(?:ی|ت)(?:تضرر|نکسر|تکسر|خرب)|(?:ی|ت)?وصل\p{L}*\s*سالم|اکید\s*(?:ی|ت)?وصل|(?:arrive|reach)\w*\s+safe|no\s+damage/u;
const fitClaim=/(?:شیشه|عطر|بطری|قنینه|بطل)\p{L}*\s*(?:\p{L}+\s+){0,6}?(?:دقیقا\s*|کاملا\s*)?(?:اندازه\s*(?:است|ست|هست|ه)|اندازست|اندازس|فیت)(?!\p{L})|(?:ت|ی)(?:لبس|اخذ|سع)\p{L}*\s*(?:\p{L}+\s+){0,1}?(?:ال)?(?:قنینه|قنانی|بطل|زجاج)|(?:مناسب|یناسب|تناسب)\p{L}*\s*(?:\p{L}+\s+){0,2}?(?:برای\s*|ل)?(?:شیشه|عطر|بطری|قنینه|بطل|زجاج)|(?:برای|واسه)\s*(?:شیشه|عطر|بطری)\p{L}*\s*(?:\p{L}+\s+){0,2}?مناسب|جا\s*(?:ی\s*)?(?:داره|دارن|دارد|دارند|می\s*شه|میشه|می\s*شن|میگیره|می\s*گیره)|(?:می\s*)?خوره\s*(?:بهش|به\s*شیشه)|(?:شیشه|عطر|بطری)\p{L}*\s*(?:\p{L}+\s+){0,5}?جا\s*(?:می\s*)?(?:شه|شود|میشود|میشه|میگیره)|جای\s*(?:\p{L}+\s+){0,1}?(?:شیشه|عطر|بطری|انگشتر|ساعت|قنینه|بطل)\p{L}*\s*(?:\p{L}+\s+){0,2}?(?:داره|دارن|دارد)|اندازه\s*(?:ی\s*)?(?:شیشه|عطر|بطری)|(?<!\p{L})(?:ی|ت)?(?:سع|اخذ|کفی|ناسب)(?:ها|ه)?\s*(?:ال)?(?:قنینه|قناني|بطل|شیشه|زجاج)|fits?\s+(?:the\s+)?(?:bottle|perfume)|room\s+for/u;
const businessCostShare=/(?<!\p{L})(?:ن(?:تقاسم|تشارک|تحمل|دفع)\p{L}*|علینا|علی\s*حسابنا)(?!\p{L})|(?:نص|نصف|نیمی|نیم)\s*(?:ش|اش|ها|ه)?\s*(?:با|علی|به\s*عهده)\s*(?:ما|نا|خودمون)|(?:نص|نصف)\s*علینا|(?:هزینه|کرایه|پول|اجور|کلفه)\p{L}*\s*(?:\p{L}+\s+){0,3}(?:(?:به\s*)?عهده\s*(?:ی\s*)?ما|با\s*ما(?:ست)?|با\s*خودمون|رو\s*ما\s*(?:می\s*)?(?:دیم|پردازیم))(?!\p{L})|we(?:'ll| will)?\s+(?:split|share|cover|pay)/u;
// Objects that make the outcome speech commercial: a shipment, a container's contents, a cost.
const shipmentObject=/بار|سفارش|جعبه|کارتن|محموله|بسته|علب|طلب|شحن|بضاع|کرتون|ارسال|باربری|order|parcel|box/u;
const containedObject=/شیشه|عطر|بطری|انگشتر|ساعت|قنینه|قنانی|بطل|زجاج|خاتم|bottle|perfume|ring|watch/u;
const costObject=/هزینه|کرایه|پول|مبلغ|اجور|کلفه|کلفت|شحن|نقل|کرتون|کارتن|سعر|فلوس|نص|نصف|نیم|cost|fee|price|shipping|freight/u;
// Explicit outcome forms that need no separate object: the verb itself names arrival/money.
const safeArrival=/سالم\s*(?:\p{L}+\s+){0,4}?(?:می\s*)?(?:رسه|رسد|رسن|میرسه|میرسن)|(?:اسیب|شکستگی|ضربه|خرابی)\p{L}*\s*(?:\p{L}+\s+){0,1}?نمی\s*(?:بینه|بینن|بیند|خوره|خورن)|(?:مشکل|شکستگی|اسیب|ضربه|خرابی)\p{L}*\s*پیش\s*نمیاد/u;
// Relative/magnitude statements about a cost («کمتر از خود جعبه‌ها درمیاد», «زیاد نمی‌شه»،
// «أرخص من») state an amount without a number. Checked when the reply talks about cost.
const costMagnitude=/(?:کمتر|بیشتر|ارزون\p{L}*|گرون\p{L}*|ارزان\p{L}*|گران\p{L}*)\s*(?:از|تر)|زیاد\s*(?:نمی\s*شه|نمیشه|نیست|نمیاد|درنمیاد)|ناچیز|خیلی\s*(?:کم|پایین|زیاد)|مقرون\s*به\s*صرفه|نصف\s*(?:قیمت|جعبه)|(?<!\p{L})(?:اقل|اکثر|ارخص|اغلی)\s*من|رخیص\p{L}*|غالی\p{L}*|شی\s*بسیط|مو\s*هوایه|cheaper|less\s+than|more\s+than|not\s+much|(?<!\p{L})(?:یه|یک|دو|سه|چند|نیم)\s*(?:تا\s*)?(?:تراول|چوب|تومن|تومان|هزاری|ملیون|میلیون|دفتر|ورقه)\p{L}*|(?<!\p{L})تراول\p{L}*|(?<!\p{L})(?:ورقه|ورقتین|دفتر|دفترین)\s*(?:\p{L}+\s+){0,1}?(?:دینار|بس|فقط|وحده)?(?!\p{L})/u;
// Any means of transport outside the approved Snap/van/freight-company routes.
const carrierMeans=/(?<!\p{L})(?:اتوبوس|قطار|هواپیما|هوایی|پیک|الوپیک|چاپار|پیشتاز|تیپاکس|پست|کشتی|بحری|طیاره|جوا|جوی|dhl|aramex|fedex|courier)(?!\p{L})/iu;
const sendVerb=/فرست|ارسال|می\s*بریم|بفرستیم|میره|نرسل|ترسل|یرسل|نشحن|شحن|نوصل|توصیل|send|ship/u;
const speedPromise=/(?:فوری|فورا|سریع|زود|همین\s*امروز)\s*(?:\p{L}+\s+){0,2}?(?:راه\s*می\s*افت\p{L}*|ارسال|فرستاد\p{L}*|میره|می\s*ره|یطلع|ینرسل|نرسل)/u;
const paymentReceived=/(?:پول|وجه|مبلغ|پرداخت|واریزی|حواله|فلوس)\p{L}*\s*(?:\p{L}+\s+){0,3}?(?:به\s*دست\p{L}*\s*)?(?:رسید|رسیده|اومد|اومده|وصلت|وصلنا|استلمنا)(?!\p{L})|استلمنا\s*(?:ال)?(?:فلوس|مبلغ|حواله)|(?<!\p{L})(?:وصل|وصلت|وصلنا|اجا|اجت|استلمت|استلمنا|نزل|نزلت)\s*(?:ال)?(?:تحویل|حواله|فلوس|مبلغ|عربون|دفعه|مقدم|واصل)\p{L}*|(?<!\p{L})(?:ال)?(?:تحویل|عربون|دفعه|مقدم)\p{L}*\s*(?:\p{L}+\s+){0,2}?(?:وصل|وصلت|وصلنا|اجا|اجت|نزل|نزلت|استلمناه|استلمناها)(?!\p{L})|(?:بیعانه|واریزی|کارت\s*به\s*کارت)\p{L}*\s*(?:\p{L}+\s+){0,2}?(?:رسید|نشست|اومد|دریافت\s*شد)(?!\p{L})/u;
const refundPromise=/(?:پول|وجه|مبلغ|فلوس)\p{L}*\s*(?:\p{L}+\s+){0,2}?(?:بر\s*می\s*گرد\p{L}*|برمیگرد\p{L}*|پس\s*داده\s*(?:می\s*)?(?:شه|شود)|ترجع\p{L}*|نرجع\p{L}*)/u;
const evenSplit=/نصف\s*نصف|نصفه\s*نصفه|نصف‌نصف|مناصفه|(?<!\p{L})بالنص(?!\p{L})|شریکی|فیفتی|نص\s*بنص|split/u;
const shareTaken=/(?:نصف|نیم|بخش|قسمت|مقدار|سهم)\p{L}*\s*(?:\p{L}+\s+){0,3}?(?:ما|خودمون|خودمان)\s*(?:\p{L}+\s+){0,2}?(?:حساب|پرداخت|می\s*دیم|میدیم|می\s*دهیم|می\s*کنیم|تقبل)/u;
const followupPromise=/پیگیری\s*(?:می\s*)?(?:کنم|کنیم)|خبر\s*(?:تون|تان|ت)?\s*(?:می\s*)?(?:کنم|کنیم|دم|دیم|میدم|میدیم)|بهتون\s*(?:اطلاع|خبر)\s*(?:می\s*)?(?:دم|دیم)|(?<!\p{L})(?:ا|أ)?رجعلک|راح\s*(?:ا|أ|ن)?(?:رد|رجع|بلغ)\p{L}*|نبلغک|i\s*will\s*(?:follow\s*up|get\s*back)/u;
// OPTION 2 — sentence-level semantic risk for EVERY sentence of a reply (not only sentences that
// look like shipping talk). Each field is a construction (who/what + commitment), not a phrase list.
const damageEvent=/(?:اسیب|خسارت|شکست|بشکن|شکسته|خراب|ضربه|تلف|انکسر|تنکسر|ینکسر|تکسر|انکسرت|تضرر|تتضرر|خربت|damage|broken|break)\p{L}*/u;
const remedyVerb=/(?:عوض|بدل|تعویض|جایگزین|جبران|پس\s*(?:می\s*)?(?:دیم|گیریم)|برمی\s*گرد|نعوض|نبدل|نرجع|نصلح|replace|refund)\p{L}*/u;
const businessActor=/(?<!\p{L})(?:ما|خودمون|خودمان|شرکت|احنا|نحن|الشرکه|المحل)(?!\p{L})|(?:می\s*)?\p{L}+یم(?!\p{L})|(?<!\p{L})ن(?:عوض|بدل|رجع|صلح|تحمل|دفع|ضمن|راعی)\p{L}*/u;
const trackRecord=/(?:تا\s*حالا|تا\s*الان|هیچ\s*وقت|هیچوقت|عمر\p{L}*|ابدا|(?<!\p{L})ابد(?!\p{L})|ولا\s*مره|never|ever)\s*(?:\p{L}+\s+){0,5}?(?:اسیب|خراب|شکست|انکسر|انکسرت|تکسر|تضرر|خربت|مشکل|دیر|تاخ\p{L}*|تتاخر|یتاخر|late)/u;
const rhetoricalAssurance=/(?:مگه|مگر|معقول|شلون|وین)\s*(?:\p{L}+\s+){0,6}?(?:خراب|شکسته|اسیب|ینکسر|تنکسر|یتضرر|یضیع|گم\s*بشه|دیر|یتاخر)/u;
const firstPersonDispatch=/(?:فرستادیم|سپردیم|ارسال\s*کردیم|تحویل\s*(?:باربری\s*)?دادیم|بار\s*زدیم|سلمنا\p{L}*|دزینا\p{L}*|رسلنا\p{L}*|شحنا\p{L}*|طلعنا\p{L}*)/u;
const payOnArrival=/پس\s*کرایه|پسکرایه|(?:دفع|تدفع|ادفع|پرداخت|بدید|بدین|حساب)\p{L}*\s*(?:\p{L}+\s+){0,4}?(?:لما|من|عند|موقع|وقتی|هنگام|بعد\s*از)\s*(?:\p{L}+\s+){0,1}?(?:یوصل|توصل|وصل|تستلم|استلام|رسید|برسه|برسد|تحویل)/u;
const discountEuphemism=/(?:قیمت|مبلغ|سعر|حساب)\p{L}*\s*(?:\p{L}+\s+){0,4}?(?:راه\s*میای?م|کنار\s*میای?م|یه\s*کاری\s*می\s*کنیم|یه\s*جوری\s*(?:\p{L}+\s+){0,1}?(?:میای?م|می\s*کنیم|حل)|هوا(?:ت|تون|ی\s*شما)\s*رو\s*دار|نتفاهم|نتفق|نشوفلک\s*حل|نتساهل|نراضی\p{L}*)|(?:راه\s*میای?م|کنار\s*میای?م|نتفاهم|نتساهل)\s*(?:\p{L}+\s+){0,3}?(?:قیمت|سعر|مبلغ)|(?<!\p{L})و?(?:نراعی\p{L}*|راعیناک|مراعات\p{L}*|نخصم\p{L}*|نطیح\p{L}*|کم\s*می\s*کنیم|میایم\s*پایین|یه\s*چیزی\s*کم|نخفض\p{L}*|بسعر\s*خاص|قیمت\s*ویژه)/u;
const anaphoricBusinessPayer=/(?:با|پای|گردن)\s*(?:ما|خودمون)(?:ه|ست)?\s*$|(?<!\p{L})(?:علینا|علی\s*حسابنا|علی\s*کیسنا)(?!\p{L})|(?:بقیه|باقی|الباقی)\p{L}*\s*(?:\p{L}+\s+){0,1}?(?:با|پای|علی|گردن)\s*(?:ما|نا|خودمون)/u;
const latinCommitment=/\b(?:ma|khodemoon)\s+(?:midim|mipardazim|hesab\s+mikonim)\b|\b(?:rayegan|mojood|mojoodi|takhfif|zemanat|khesarat|farda|bimeh)\b|\bfree\s+(?:shipping|delivery)\b/iu;
const vehicleMeans=/(?<!\p{L})[بلو]?(?:سیار|ماشین|سیاره|بالسیاره|ماشین|سایق|سائق|راننده|شلامجه|الشلامجه|شلمچه|زرباطیه|مهران|منفذ)\p{L}*/u;
const transportVerb=/فرست|ارسال|بار\s*(?:می\s*)?(?:کنیم|زنیم)|نحمل|نرسل|ترسل|یرسل|یجیب|نوصل|نشحن|شحن|توصیل|عن\s*طریق|ویا|مع/u;
const insuranceArabic=/(?<!\p{L})(?:مومن|مؤمن|موءمن|مومنه|مؤمنه|تامین|التامین|مضمونه)(?!\p{L})/u;
export function sentenceRisk(clause,reply){
 if(nonCommittalClause(clause))return null;
 const raw=committalPortion(clause),value=key(raw),whole=key(reply);
 const question=/[؟?]\s*$/u.test(raw)&&!rhetoricalAssurance.test(value);
 // A question back to the customer asserts nothing, EXCEPT when it carries an owner-only fact (a time, a route, a
 // dimension, an approval, a payment/order status): «تجهز بأربع أيام، يناسبك؟» still states the production time.
 if(question&&!/تولید|تصنیع|انتاج|اماده|جاهز|[تینا]?جهز|تخلص|(?:از\s*مسیر|ترمینال|منفذ|یمر|تمر)|(?:ارتفاع|طول|عرض|قطر|عمق)\p{L}*\s*\S*\s*[0-9۰-۹٠-٩]|[0-9۰-۹٠-٩]\s*(?:سم|سانت|cm)|مدیر|المدیر|حواله|واریز|طلب\p{L}*\s*(?:تثبت|انقبل)/u.test(value))return null;
 // Route detail («بار از مسیر زنجان می‌ره», «يمر عبر منفذ …», «از ترمینال جنوب») is not in any approved shipping
 // record (they state method and payer only), so naming a path/terminal/border crossing is an invented commitment.
 if(/(?<!\p{L})(?:از\s*مسیر|از\s*راه|مسیرش|مسیر\s*(?:بار|ارسال)|ترمینال|گمرک|مرز|یمر|تمر|منفذ|عن\s*طریق(?!\s*(?:شرک|نقل|الشحن|شحن))|از\s*طریق(?!\s*(?:باربری|اسنپ|وانت))|via|route)(?!\p{L})/u.test(value)&&!honestInformationGap(raw))return 'route_detail_claim';
 // A named carrier/vehicle outside the approved methods («با چاپار هم میشه») in a reply about shipping is an
 // unapproved method even when its own sentence has no shipping word.
 if(carrierLexicon.test(value)&&shipping.test(whole)&&!honestInformationGap(raw)&&!uncertaintyFrame.test(value)&&!/(?<!\p{L})(?:ما|مو|نه|نمی\p{L}*|ندار\p{L}*|لا)(?!\p{L})/u.test(value))return 'unapproved_carrier';
 // A completed or affirmed owner decision («مدیر از قبل اوکی داده», «المدير وافق», «مدیر تأیید کرده») is owner authority
 // the AI cannot report; «مدیر باید تأیید کنه» / «تصمیمش با مدیره» (future, deferral) remain allowed.
 if(/(?<!\p{L})(?:مدیر|مالک|صاحب\s*(?:مجموعه|کار|الشغل|المحل)|(?:ال)?مدیر|(?:ال)?مالک|(?:ال)?اداره|(?:ال)?استاذ|(?:ال)?معلم|(?:ال)?حجی|(?:ال)?حاج|رئیس|(?:ال)?ریس|owner|manager|boss)\p{L}*\s*(?:\p{L}+\s+){0,5}?(?:(?:اوکی|اوكي|ok|okay|تایید|تأیید|قبول|موافقت|اجازه|امضا)\s*(?:\p{L}+\s+){0,1}?(?:کرده|کرد|داده|داد|شده|زده|کردن|دادن)|گفت(?:ن|ه|ند|نش)?(?!\p{L})|فرمود\p{L}*|(?:قال|گال|کال)(?:ت|و|لی|لنا)?(?!\p{L})|وافق\p{L}*|سمح\p{L}*|قبل(?:ها|ه|ت)?(?!\p{L})|موافق(?:ه|ت)?\s*(?:کرده|است|هست|ه)?(?!\p{L})|اوکی|اوكي|(?<!\p{L})ok(?!\p{L}))/u.test(value)&&!/(?<!\p{L})(?:باید|بایست|لازم|نیاز|اگه|اگر|اذا|لو|حتی|تا)(?!\p{L})/u.test(value))return 'owner_approval_claim';
 // Hand-over at the customer's place or into the customer's hand, whatever the subject (cv43): «السائق يجيبها لمحلك»,
 // «تتسلّم بباب محلك», «ينطيك العلب», «ينزلها للطابق الثاني», «راننده در خونه‌تون رو می‌زنه», «خودش میاد سراغتون».
 if(!/(?<!\p{L})(?:مکتب|کراج|گراج|فرع|ترمینال|انبار\s*باربری|دفتر\s*باربری)\p{L}*/u.test(value)&&!honestInformationGap(raw)&&!uncertaintyFrame.test(value)&&!/(?<!\p{L})(?:ما|مو|لا|مش)\s+(?:\p{L}+\s+){0,1}?و?(?:ی|ت|ن|ا)?(?:جیب|سلم|نطی|نزل|وصل|تسلم|ستلم|ضمن|کدر)|(?<!\p{L})(?:نمی\p{L}*|نه|نیست|نداریم|مضمون|نضمن|تضمین\p{L}*)(?!\p{L})/u.test(value)){
  const customerPlace=/(?<!\p{L})(?:لل|ل|بال|ب|فی\s+(?:ال)?|الی\s+(?:ال)?|لباب\s+(?:ال)?)(?:محل|دکان|بیت|باب|عنوان|طابق|بنایه|عماره)\p{L}*(?!\s*(?:ال)?(?:شرکه|نقل|شحن|کراج|گراج)|\s*(?:عدنا|عندنا|مالنا|مالتنا))|(?<!\p{L})(?:دم|درب|جلوی)\s*(?:ی\s*)?(?:خونه|مغازه|منزل|محل|خانه|دفتر|شرکت)\p{L}*|(?<!\p{L})در\s*(?:ی\s*)?(?:خونه|مغازه|منزل|محل|خانه|دفتر|شرکت)\s*(?:تون|تان|ت|شما)(?!\p{L})|(?<!\p{L})سراغ\s*(?:تون|تان|ت|شما)(?!\p{L})/u;
  const handOver=/(?<!\p{L})و?(?:ی|ت|ن)?(?:جیب|سلم|نطی|نزل|وصل|تسلم|ستلم)\p{L}*|(?<!\p{L})(?:میار|میاد|میده|میدن|میدیم|می\s*زنه|میزنه|تحویل|میرسون|میبر)\p{L}*/u;
  const intoHand=/(?<!\p{L})و?(?:ی|ت)(?:سلم|نطی|جیب)(?:ک|کم|ج|لک|لکم|لج)(?!\p{L})|(?<!\p{L})ب(?:ای|ا)د(?:ه|ک|کم)(?!\p{L})|(?<!\p{L})بیدک(?!\p{L})/u;
  if((customerPlace.test(value)&&handOver.test(value))||intoHand.test(value))return 'door_delivery_promise';
 }
 // The business paying freight with an attached «و» or an explicit «إحنا» (cv43): «وندفع إحنا نص الأجور», «ونطلع إحنا كلفة الشحن».
 if((/(?<!\p{L})(?<!(?:ما|مو|لا|لن)\s)و?ن(?:دفع|تحمل|تکفل|غطی)\p{L}*\s+(?:(?:احنا|نحن)\s+)?(?:\p{L}+\s+){0,1}?(?:ال)?(?:اجور|کلفه|کلفت|مصاریف|شحن|نقل|فلوس|نص|نصف|کل)\p{L}*|(?<!\p{L})(?<!(?:ما|مو|لا|لن)\s)و?نطلع\p{L}*\s+(?:(?:احنا|نحن)\s+)?(?:\p{L}+\s+){0,1}?(?:ال)?(?:اجور|کلفه|کلفت|مصاریف)\p{L}*/u.test(value)||(/(?<!\p{L})(?<!(?:ما|مو|لا|لن)\s)و?ن(?:دفع|تحمل|طلع|تکفل)\p{L}*\s+(?:احنا|نحن)(?!\p{L})|(?<!\p{L})و?(?:احنا|نحن)\s+(?:\p{L}+\s+){0,1}?و?ن(?:دفع|تحمل|تکفل)\p{L}*/u.test(value)&&/(?<!\p{L})(?:ال)?(?:اجور|کلفه|کلفت|مصاریف|شحن|نقل|فلوس|حساب|کرتون|کارتون|نص|نصف)\p{L}*|(?<!\p{L})و?ن(?:دفع|تحمل|تکفل)(?:ها|هن|هم|ه)(?!\p{L})/u.test(value)))&&!honestInformationGap(raw)&&!uncertaintyFrame.test(value))return 'business_cost_commitment';
 // Payment collected at hand-over, or inspect-then-pay (cv43): «السائق ياخذ منك الفلوس من يسلمك», «تفحصها قدام السائق وبعدين تدفع».
 if((/(?<!\p{L})(?:ی|ت|ن)?(?:اخذ|ستلم|قبض)\p{L}*\s+(?:منک|منکم|منج)\s+(?:ال)?(?:فلوس|مبلغ|حساب|پاره|بیزات|مصاری|اجور)/u.test(value)
   ||(/(?<!\p{L})و?(?:ت|ا|ن|ی)دفع\p{L}*|(?<!\p{L})تحاسب\p{L}*|پرداخت\s*(?:می\s*)?(?:کنید|کنین|کنی)|پول\s*(?:\p{L}+\s+){0,1}?(?:میدید|میدین|بدید|بدین)/u.test(value)&&/(?<!\p{L})(?:من|لما|بعد\s*ما|عند\s*ما|اول\s*ما)\s+(?:ت|ی)?(?:وصل|سلم|ستلم|تسلم)\p{L}*|(?<!\p{L})و?(?:ت|ی|ن)(?:فحص|فتح)\p{L}*|(?:موقع|وقت|بعد\s*از|هنگام)\s*(?:ی\s*)?(?:تحویل|رسیدن|دریافت)|وقتی\s*(?:\p{L}+\s+){0,1}?(?:رسید|دستتون|دستت|تحویل)/u.test(value)))
   &&!honestInformationGap(raw)&&!uncertaintyFrame.test(value))return 'payment_term_claim';
 // Popularity / social proof as a concept (cv55): customers, people or everyone + like / prefer / order a lot.
 if(/(?<!\p{L})(?:مشتری\p{L}*|مشتریا|خیلیا|خیلی\s*ها|همه|مردم|الناس|الزبائن|الزباین|الزبون|الکل|کل\s*(?:الناس|الزبائن|المحلات))\s+(?:\p{L}+\s+){0,3}?(?:دوست\s*(?:دار|دارن|دارند|داره)|خوش\s*(?:شون|شان)\s*میاد|می\s*پسند\p{L}*|میپسند\p{L}*|استقبال|سفارش\s*(?:می\s*)?(?:دن|دهند)|می\s*خرن|میخرن|(?:ی|ت)حب\p{L}*|(?:ی|ت)طلب\p{L}*|(?:ی|ت)شتر\p{L}*|عاجب\p{L}*|ماشی\s*علیه|راهی)(?!\p{L})/u.test(value)&&!honestInformationGap(raw)&&!/[؟?]\s*$/u.test(String(raw)))return 'marketing_claim';
 // cv57 concepts (BLIND-9 leaks, generalised):
 // implicit no-loss / no-damage assurance to the customer («هیچ ضرری متوجه شما نمیشه», «ما راح تخسر شي», «ما يصيرلك ضرر»);
 if(!honestInformationGap(raw)&&!/[؟?]\s*$/u.test(String(raw))&&(/(?<!\p{L})(?:هیچ\s+)?(?:ضرر|خسارت|زیان|اسیب|آسیب)\p{L}*\s+(?:\p{L}+\s+){0,3}?(?:نمی\s*شه|نمیشه|نمی\s*بین\p{L}*|نمیبین\p{L}*|نمی\s*خور\p{L}*|نمیخور\p{L}*|نمی\s*رسه|نمیرسه|نمی\s*کنید|نمیکنید|نداره|نداری\p{L}*|نیست)(?!\p{L})|(?<!\p{L})(?:ماکو|ما\s+اکو)\s+(?:ای\s+)?(?:خساره|ضرر)|(?<!\p{L})(?:ما|مو|لا)\s+(?:راح\s+)?(?:ت|ی)(?:خسر|تضرر)\p{L}*|(?<!\p{L})(?:ما|مو)\s+(?:راح\s+)?(?:ی|ت)صیر\p{L}*\s+(?:\p{L}+\s+){0,1}?(?:ضرر|خساره)/u.test(value)))return 'compensation_commitment';
 // water / moisture / heat damage behaviour stated in either polarity («تخرب إذا وصلها ماي», «با آب خراب میشه»);
 if(!honestInformationGap(raw)&&!/[؟?]\s*$/u.test(String(raw))&&(/(?<!\p{L})(?:ی|ت)?(?:خرب|تلف|نتفخ|تشرب|ترطب|تعفن|تشقق)\p{L}*\s+(?:\p{L}+\s+){0,3}?(?:ال)?(?:مای|ماء|میه|می|رطوب\p{L}*|حرار\p{L}*|شمس)(?!\p{L})|(?:ال)?(?:مای|ماء|میه|رطوب\p{L}*)\s+(?:\p{L}+\s+){0,3}?(?:ی|ت)?(?:خرب|تلف|نتفخ|تشرب)\p{L}*|(?:آب|اب|رطوبت|نم|گرما|افتاب|آفتاب)\s+(?:\p{L}+\s+){0,3}?(?:خراب|باد|تاب|ورم|کج)\s*(?:می\s*)?(?:شه|کنه|میشه|میکنه)(?!\p{L})|(?:خیس|تر|نم)\s*(?:بشه|شه|بخوره)\s+(?:\p{L}+\s+){0,2}?(?:خراب|باد|تاب)\s*(?:می\s*)?(?:شه|میشه)|(?:اذا|لو)\s+(?:ت|ی)(?:بلل|بتل|ترطب)\p{L}*\s+(?:ت|ی)(?:تلف|خرب)\p{L}*|(?<!\p{L})(?:ال)?(?:سرما|گرما|آفتاب|افتاب|آب|اب|رطوبت|بارون|باران|برف|حرارت|برد|حر|شمس|مطر|رطوبه|حراره|بروده|ثلج)(?:ش|ها|ه)?(?!\p{L})\s+(?:\p{L}+\s+){0,4}?(?<!\p{L})(?:آسیب|اسیب|صدمه|ضرر|خرابی|خراب|یضر|تضر|یتضرر|تتضرر|یخرب|تخرب|یاثر|تاثر|تاثیر)\p{L}*|(?<!\p{L})(?:آسیب|اسیب|صدمه|ضرر)\p{L}*\s+(?:\p{L}+\s+){0,3}?(?:ال)?(?:سرما|گرما|آفتاب|افتاب|رطوبت|باران|برف|حرارت|برد|شمس|مطر|رطوبه|حراره|بروده)(?!\p{L})/u.test(value))&&!uncertaintyFrame.test(value)&&!/(?<!\p{L})(?:یا\s+نه|او\s+لا|لو\s+لا)(?!\p{L})/u.test(value))return 'water_resistance_claim';
 // cv57f: «no waiting / no delay» assurance («معطل نمی‌مونید», «ما راح تنتظر», «ما يتأخر عليك») and a prediction of the owner's decision
 // («باید مدیر تایید کنه، که حتماً قبول می‌کنه», «أكيد يوافق»): both are owner-only commitments.
 if(!honestInformationGap(raw)&&!/[؟?]\s*$/u.test(String(raw))&&/(?<!\p{L})(?:معطل|منتظر|انتظار|تاخیر|دیر)\p{L}*\s*(?:\p{L}+\s+){0,1}?(?:نمی\s*مون\p{L}*|نمیمون\p{L}*|نمی\s*شید|نمیشید|نمی\s*کشه|نمیکشه|نداره|نداریم|نمیشه|نمی\s*شه|نخواهید)|(?<!\p{L})(?:ما|مو|لا)\s+(?:راح\s+)?(?:ت|ی)(?:نتظر|تاخر|تأخر|طول)\p{L}*|(?<!\p{L})(?:بدون|بلا)\s+(?:ای\s+)?(?:تاخیر|انتظار|معطلی)(?!\p{L})(?=.*(?:ارسال|تحویل|رسیدن|بار|توصیل|یوصل|تولید|اماده|جاهز|شحن))|(?<!\p{L})معطل\p{L}*\s+(?:نمی\s*کنیم|نمیکنیم)|(?<!\p{L})(?:ما|مو)\s+(?:ن|ا)(?:عطل|خر)\p{L}*/u.test(value))return 'delivery_outcome_promise';
 if(!honestInformationGap(raw)&&!/[؟?]\s*$/u.test(String(raw))&&(/(?<!\p{L})(?:حتما|حتماً|قطعا|قطعاً|مطمئنا|اکید|اکیدا|اکیده|اکیدج|بالتاکید|معمولا|معمولاً|غالبا|غالباً|احتمالا|به\s+احتمال\s+زیاد)\s+(?:\p{L}+\s+){0,2}?(?:قبول\s*(?:می\s*)?(?:کنه|کنن|میکنه|میکنن)|موافقت\s*(?:می\s*)?(?:کنه|میکنه)|اوکی\s*(?:می\s*)?(?:ده|میده)|ی?وافق\p{L}*|ی?قبل\p{L}*|یرضی|مخالفتی\s*نداره|مشکلی\s*نداره)(?!\p{L})/u.test(value)||/(?:مدیر|المدیر|صاحب)\p{L}*\s+(?:\p{L}+\s+){0,2}?(?:غالبا|معمولا|اکید|اکیدا|حتما)\s+(?:ی?وافق\p{L}*|قبول\p{L}*|مشکلی\s*نداره)/u.test(value))&&!/(?<!\p{L})(?:لازم\p{L}*|باید|نیاز|محتاج|یحتاج|لازمه)(?!\p{L})/u.test(value))return 'owner_approval_claim';
 // an off-list / brand-specific colour accepted without owner approval («رنگ اختصاصی برندتون رو هم مشکلی نیست، میزنیم»);
 if(!honestInformationGap(raw)&&!/[؟?]\s*$/u.test(String(raw))&&/(?<!\p{L})(?:رنگ|لون|اللون)\p{L}*\s+(?:\p{L}+\s+){0,2}?(?:اختصاصی|دلخواه|سفارشی|خاص|مخصوص|برند\p{L}*|خارج\s+از\s+(?:لیست|فهرست)|غیر\s*(?:موجود|استاندارد)|پنتون|بانتون|pantone|کد|الخاص\p{L}*|خارج\s+القائمه|مو\s+موجود)/u.test(value)&&/(?<!\p{L})(?:مشکلی\s*نیست|مشکل\s*نداره|می\s*زنیم\p{L}*|میزنیم\p{L}*|درست\s*(?:می\s*)?کنیم|انجام\s*(?:می\s*)?دیم|اجرا\s*(?:می\s*)?کنیم|میشه|می\s*سازیم|میسازیم|ماکو\s*مشکله|اوکی|حاضر\p{L}*)(?!\p{L})|(?<!\p{L})(?<!(?:ما|مو|لا)\s)(?:نسوی\p{L}*|نطبع\p{L}*|یصیر|نکدر|نگدر)(?!\p{L})/u.test(value)&&!/(?<!\p{L})(?:ما|مو|لا)\s+(?:\p{L}+\s+){0,1}?(?:نکدر|نگدر|نسوی|نطبع|یصیر|نقدر)/u.test(value)&&!/(?:مدیر|مالک|صاحب|المدیر)\p{L}*\s+(?:\p{L}+\s+){0,3}?(?:تایید|تأیید|موافق\p{L}*|یوافق\p{L}*|یقرر\p{L}*|تصمیم|بررسی)|(?:تایید|تأیید|موافقه)\s+(?:\p{L}+\s+){0,2}?(?:مدیر|مالک|صاحب)/u.test(value))return 'owner_approval_claim';
 // Door delivery in any word order («با وانت میاریمش دم در», «میاد دم در خونه‌تون»): owner-only.
 if(/(?<!\p{L})(?:دم|جلوی|جلو)\s*(?:ی\s*)?(?:در|درب)(?!\p{L})|(?<!\p{L})(?:دم|جلوی|درب|در)\s*(?:ی\s*)?(?:خونه|منزل|مغازه|محل|شرکت|دفتر|اداره)\p{L}*|(?<!\p{L})(?:تا|به)\s*(?:خود\s*)?(?:خونه|منزل|مغازه|فروشگاه|دفتر|شرکت|کارگاه|انبار|محل\s*کار|ادرس|آدرس)\p{L}*|(?<!\p{L})(?:ل|الی\s*|لحد\s*|لباب\s*)(?:ال)?(?:(?:محل|دکان|بیت|مخزن|معمل|عنوان|مکتب)\p{L}*|شرکه\p{L}*(?!\s*(?:ال)?(?:شحن|نقل|بضائع))|شرکت(?:ک|کم|ج|کن)(?!\p{L}))/u.test(value)&&/(?:میار|میاد|می\s*اد|می\s*یار|تحویل|میرسه|می\s*رسه|برسه|میبر|می\s*بر|میفرست|بفرست|ارسال|توصیل|یوصل|نوصل)\p{L}*/u.test(value)&&!/(?<!\p{L})(?:نمی\p{L}*|نه|ما|مو|لا|نیست|نداریم)(?!\p{L})/u.test(value)&&!honestInformationGap(raw))return 'door_delivery_promise';
 if(/(?<!\p{L})(?:دست\s*ساز\p{L}*|دستساز\p{L}*|هند\s*مید|handmade|hand\s*made|یدوی\p{L}*|شغل\s*ید|صنع\s*ید|صادراتی|بازیافت\p{L}*|ارگانیک|دوستدار\s*محیط|صدیق\s*للبیئه|اوریجینال|اصل\s*اصل|وارداتی|ایتالیایی|ترکیه\s*ای|مستورد)(?!\p{L})/u.test(value)&&!honestInformationGap(raw))return 'unsupported_marketing_claim';
 if(/(?:از\s*همه|از\s*بقیه|از\s*بازار|تو\s*بازار|توی\s*بازار|من\s*(?:ال)?سوک|من\s*(?:ال)?کل|من\s*غیرنا|بالسوک)\s*(?:\p{L}+\s+){0,2}?(?<!\p{L})(?:\p{L}+\s?تر(?:ه|ی|ین)?(?!\p{L})|ارخص|اقل|احسن|افضل|اقوی|اغلی|نیست|ماکو)|(?:\p{L}+\s?تر|ارخص|اقل|احسن|افضل)\s*(?:از|من)\s*(?:همه|بقیه|بازار|سوک|السوک|الکل|غیرنا|رقبا)/u.test(value)&&!honestInformationGap(raw))return 'marketing_claim';
 if(/(?:باربری|اسنپ|وانت|شرکه|شرکت|نقل|ناقل|carrier)\p{L}*\s*(?:\p{L}+\s+){0,1}?(?<!\p{L})(?:معتبر|مطمئن|امن|درجه\s*یک|حرفه\s*ای|موثوق\p{L}*|زین\p{L}*|امین\p{L}*|بیمه\p{L}*|با\s*تجربه|خبره)(?!\p{L})/u.test(value)&&!/استعلام\s*معتبر/u.test(value)&&!honestInformationGap(raw))return 'unsupported_shipping_policy_claim';
 if(/(?:علیه|علیها|علی\s*حسابی|علیه\s*هم)\s*تدلل|قابل\s*(?:شما|تونو|ت)?\s*(?:رو\s*)?نداره|قابلی\s*نداره|ما\s*یسوی\s*شی|هدیه\s*(?:منا|منی|من\s*ما|از\s*طرف\s*ما)|مهمون\s*ما|(?:رو|را)\s*(?:دیگه\s*)?حساب\s*نمی\s*کنیم|حساب\s*نمیکنیم|ما\s*نحسب\p{L}*|بلا\s*فلوس|ببلاش\s*الک/u.test(value)&&!productionServiceOnly(raw))return 'unapproved_free_service';
 if(/(?<!\p{L})(?:رو\s*دست|حرف|لنگه|نظیر|همتا|رقیب)\s*(?:\p{L}+\s+){0,1}?(?<!\p{L})(?:نداره|ندارد|ندارن|نداریم|نیست)(?!\p{L})|(?<!\p{L})(?:ماکو|ما\s*اکو|محد|ما\s*بیه)\s*(?:\p{L}+\s+){0,2}?(?<!\p{L})(?:مثله|مثلها|مثلهم|مثلنا|زیه|زیها|زینا)(?!\p{L})|(?<!\p{L})(?:ماله|مالها)\s*(?:ثانی|مثیل|شبیه)/u.test(value)&&!honestInformationGap(raw))return 'marketing_claim';
 // Water / moisture / wear resistance in Persian, also phrased negatively («آب بهش اثر نمیکنه», «ضد آبه»).
 if(/(?<!\p{L})(?<!(?:اذا|إذا|لو|هل|اگه|اگر|ایا|آیا|شنو|شلون|ببینم)\s+)و?(?:ی|ت|ن)?(?:تحمل|قاوم|صمد|تصمد|یصمد)\p{L}*\s+(?:\p{L}+\s+){0,1}?(?:ب|ل|من|ویا)?\s*(?:ال)?(?:مای|ماء|میه|مي|رطوب\p{L}*|حرار\p{L}*|حر|شمس|مطر|عرق)(?!\p{L})|(?:در\s*برابر|جلوی|مقابل)\s+(?:آب|اب|رطوبت|نم|گرما|حرارت|آفتاب|افتاب)\s+(?:\p{L}+\s+){0,1}?(?:مقاوم|مقاومه|مقاومت|دوام|تحمل)\p{L}*|(?:آب|اب|رطوبت|نم|گرما|حرارت)\s+(?:رو|را)?\s*(?:تحمل|طاقت)\s*(?:می\s*)?(?:کنه|میکنه|داره|میاره)(?!\p{L})/u.test(value)&&!honestInformationGap(raw)&&!uncertaintyFrame.test(value)&&!/(?<!\p{L})(?:یا\s+نه|او\s+لا|لو\s+لا)(?!\p{L})/u.test(value)&&!/[؟?]\s*$/u.test(String(raw)))return 'water_resistance_claim';
 if(/(?<!\p{L})(?:ما|مو|لا|ولا)\s+(?:\p{L}+\s+){0,1}?(?:ی|ت|ن)?(?:تاثر|تأثر|تضرر|خرب|تلف|نتفخ|ینتفخ|تنتفخ|تشرب|یشرب|ترطب|تعفن|تتعفن)\p{L}*\s+(?:\p{L}+\s+){0,1}?(?:ب|من|ویا)?\s*(?:ال)?(?:مای|ماء|ما|میه|مي|رطوب\p{L}*|حرار\p{L}*|حر|شمس|مطر|عرق|ندی)(?!\p{L})|(?<!\p{L})(?:آب|اب|رطوبت|نم|گرما|حرارت|آفتاب|افتاب|عرق)\s+(?:\p{L}+\s+){0,2}?(?:اثر\s*(?:نمی\s*ذاره|نمیذاره|نداره|نمی\s*کنه|نمیکنه)|خراب\s*(?:ش\s*)?(?:نمی\s*کنه|نمیکنه)|کاری\s*(?:ش\s*)?(?:نمی\s*کنه|نمیکنه|نداره))|(?:با|از|زیر)\s+(?:آب|اب|رطوبت|نم|گرما|آفتاب|افتاب)\s+(?:\p{L}+\s+){0,1}?(?:خراب|تاب|باد|ورم|کج)\s*(?:نمی\s*شه|نمیشه|نمی\s*کنه|نمیکنه|برنمیداره|بر\s*نمی\s*داره)(?!\p{L})|(?<!\p{L})(?:خیس|تر)\s*(?:نمی\s*شه|نمیشه|نمی\s*شود|نمیشود|نمیشن|نمی\s*شن)(?!\p{L})|(?<!\p{L})(?:ما|مو)\s*(?:ی|ت)(?:تبلل|بتل|نبل|ترطب)\p{L}*|(?<!\p{L})(?:آب|اب|رطوبت|نم|خیسی|عرق)\s*(?:\p{L}+\s+){0,2}?(?<!\p{L})(?:اثر|نفوذ|خراب\p{L}*|آسیب|اسیب)\s*(?:\p{L}+\s+){0,1}?(?:نمی\s*کنه|نمیکنه|نمی\s*کند|نمیشه|نمی\s*شه|نمی\s*زنه|نمیزنه|نداره|نمیرسونه)|ضد\s*(?:آب|اب|رطوبت|خش)|ضدآب|واترپروف|waterproof/u.test(value)&&!honestInformationGap(raw))return 'water_resistance_claim';
 // Readiness / stock / production-started claims («موجودة وحاضرة», «آماده‌ست», «رفت برای چاپ», «انطبعت») are owner-only facts.
 if(/(?<!\p{L}|(?:انی|آنی|انا|من|شما)\s)و?(?:حاضر|حاضره|جاهز|جاهزه|جاهزین|اماده\s*(?:است|ست|اس|هست)|آماده\s*(?:است|ست|اس|هست)|امادس|آمادس|امادست|آمادست|ستوک|استوک|بالمخزن|تو\s*انبار|موجوده\s*(?:\p{L}+\s+){0,1}?(?:حاضر|جاهز))(?!\p{L})|(?:رفت|رفتن|دادیم|دادمش|فرستادیم)\s*(?:برای\s*)?(?:چاپ|تولید|ساخت|کارگاه)|(?<!\p{L})(?:نبدی|نبدا|نبلش|نشتغل|راح\s*نبدی|هسه\s*نبدی)\s*(?:ب|ب\s*)?(?:ال)?(?:تصمیم|شغل|طباعه|انتاج|تصنیع|طلب\p{L}*)|(?:شروع|استارت)\s*(?:می\s*)?(?:کنیم|میکنیم|می‌کنیم)\s*(?:به\s*)?(?:طراحی|تولید|چاپ|ساخت|کار)|(?:میریم|می\s*ریم)\s*(?:سراغ|برای)\s*(?:طراحی|تولید|چاپ|ساخت)|(?:انطبع|ینطبع\s*هسه|دخل\s*(?:ال)?(?:انتاج|طباعه|تصنیع)|بدینا\s*(?:بال)?(?:شغل|طباعه|انتاج))/u.test(value)&&!honestInformationGap(raw))return 'unverified_product_or_stock_claim';
 if(/(?:ال)?ناس\s*(?:\p{L}+\s+){0,1}?(?:تموت|یموتون|تحب|یحبون|تاخذ|یاخذون|تطلب|یطلبون)|(?:تموت|یموتون)\s*علی|میمیرن\s*براش|عاشقش\s*(?:میشن|هستن)|همه\s*عاشقش/u.test(value)&&!honestInformationGap(raw))return 'marketing_claim';
 // Durability / fade / wear resistance, also negated («وما تروح ولا تبهت أبد», «رنگش نمی‌پره», «پاک نمیشه», «ما ینمسح»).
 if(/(?<!\p{L})(?:ما|مو|لا|ولا)\s*(?:ت|ی)?(?:بهت|نمسح|مسح|تقشر|قشر|تغیر|خرب|تلف|تشقق|روح\s*لون\p{L}*)\p{L}*|(?<!\p{L})(?:ما|مو|ولا)\s*(?:تروح|یروح)\s*(?:ولا|و\s*لا)\s*(?:ت|ی)?(?:بهت|نمسح|تغیر)\p{L}*|(?:رنگ\p{L}*|چاپ\p{L}*|طلا\p{L}*|لون\p{L}*)\s*(?:\p{L}+\s+){0,1}?(?:نمی\s*پره|نمیپره|پاک\s*نمی\s*شه|پاک\s*نمیشه|کمرنگ\s*نمی\p{L}*|نمی\s*ره|نمیره|خراب\s*نمی\p{L}*|ثابته|ثابت\s*می\s*مونه)|(?<!\p{L})(?:ماندگار\p{L}*|همیشگی|تا\s*ابد|طول\s*عمر)(?!\p{L})/u.test(value)&&!honestInformationGap(raw))return 'unsupported_marketing_claim';
 // Deadline before ANY event noun with an arrival/readiness predicate («تكون واصلة قبل الافتتاح»).
 if(/(?<!\p{L})(?:قبل|لحد|الی|تا|قبل\s*از)\s*(?:ال)?\p{L}{3,}/u.test(value)&&/(?<!\p{L})و?(?:واصل\p{L}*|توصل\p{L}*|یوصل\p{L}*|تلحک|تلحگ|یلحک|میرسه|می\s*رسه|برسه|دستتون|دستت|عندک|تکون\s*عند\p{L}*|جاهز\p{L}*|حاضر\p{L}*|اماده\p{L}*|آماده\p{L}*)(?!\p{L})/u.test(value)&&/(?<!\p{L})(?:قبل|لحد)\s*(?:ال)?(?!ما\b)\p{L}{3,}/u.test(value)&&!honestInformationGap(raw)&&!uncertaintyFrame.test(value))return 'delivery_time_claim';
 if(/(?<!\p{L})(?:شیک|قشنگ|زیبا|جذاب|خاص|شکیل|چشمگیر)\s*تر(?:ه|ین|ینه|ن)?(?!\p{L})/u.test(value)&&!/(?<!\p{L})(?:رنگ|لون|مشکی|سفید|سرمه\s*ای|طلایی|نقره\s*ای|قرمز|ابی|سبز|صورتی|کرم|قهوه\s*ای|بنفش|زرشکی|طوسی|یاسی|سلفون|اسود|ابیض|احمر|ازرق|اخضر|وردی|ذهبی|فضی|رصاصی|کحلی|سماوی|بنی)\p{L}*/u.test(value)&&!honestInformationGap(raw))return 'unsupported_marketing_claim';
 if(/(?<!\p{L})(?:حرفه(?:\s*ای)?|حرفهای|لوکس|محکم|قوی|مقاوم|باکیفیت|با\s*کیفیت|مرغوب)\s*تر(?:ه|ین|ینه|ن)?(?!\p{L})|(?<!\p{L})(?:افخم|اقوی|اجمل|احلی|ارقی|امتن|اشیک)(?!\p{L})/u.test(value)&&!honestInformationGap(raw))return 'unsupported_marketing_claim';
 // Popularity by "everyone / all shops use it" («الكل ياخذها», «كل محلات الذهب بالعراق عليها», «همه طلافروشی‌ها اینو می‌برن»).
 if(/(?<!\p{L})(?:الکل|کلهم|الجمیع|کل\s*الناس|همه|همگی)\s*(?:\p{L}+\s+){0,1}?(?<!\p{L})(?:یاخذ\p{L}*|یشتر\p{L}*|یطلب\p{L}*|علیها|علیه|میخر\p{L}*|میبر\p{L}*|سفارش\s*می\s*دن|سفارش\s*میدن|استفاده\s*می\s*کنن)|(?<!\p{L})(?:کل|همه\s*ی?)\s*(?:ال)?(?:محلات|محل|مغازه\p{L}*|طلافروش\p{L}*|صاغه|زباین|مشتری\p{L}*)\s*(?:\p{L}+\s+){0,4}?(?<!\p{L})(?:علیها|علیه|یاخذ\p{L}*|میبر\p{L}*|ازش\s*استفاده|ماخذی\p{L}*)/u.test(value)&&!honestInformationGap(raw))return 'marketing_claim';
 if(/(?<!\p{L})(?:همه|کل|تمام|جمیع|کلها|کلش)\s*(?:ی\s*)?(?:ال)?(?:مدل|مودیل|علب|جعب|سایز|رنگ|الوان|قیاس)\p{L}*\s*(?:\p{L}+\s+){0,1}?(?:موجود|متوفر|حاضر|جاهز)\p{L}*/u.test(value)&&!honestInformationGap(raw))return 'unverified_product_or_stock_claim';
 if(/کهنه\s*(?:نمی\s*شه|نمیشه|نمی\s*شن|نمیشن)|رنگ\s*پس\s*نمی\s*ده|رنگ\s*پس\s*نمیده|(?:ما|مو)\s*(?:ی|ت)?(?:عتق|قدم|بلی)\p{L}*/u.test(value)&&!honestInformationGap(raw))return 'unsupported_marketing_claim';
 // Delay / breakage / on-time promises, also negated («ما نتأخر عليك», «دیر نمیشه», «ما تنكسر بالطريق», «تو راه نمی‌شکنه», «تجيك بوقتها»).
 if(/(?<!\p{L})(?:ما|مو|لا)\s*(?:ن|ی|ت)?(?:تاخر|تأخر)\p{L}*|دیر\s*(?:نمی\s*شه|نمیشه|نمیکنیم|نمی\s*کنیم|نمیرسه)|(?:ما|مو|لا)\s*(?:ت|ی)?(?:نکسر|تکسر|کسر)\p{L}*|(?:نمی\s*شکن\p{L}*|نمیشکن\p{L}*|سالم\s*(?:می\s*)?(?:رسه|میرسه))|(?:بوقتها|بوقته|بالوقت|به\s*موقع|سر\s*وقت)(?!\p{L})/u.test(value)&&!honestInformationGap(raw)&&!uncertaintyFrame.test(value))return 'delivery_outcome_promise';
 // "On the house" and "included in the price" for anything other than the included production services.
 if((/(?:علی\s*حساب\s*(?:ال)?(?:محل|شرکه|شغل|ادار\p{L}*)|علی\s*حسابنا|علی\s*حسابی|بحسابنا|ضمن\s*(?:ال)?سعر|داخل\s*(?:ب)?(?:ال)?سعر|مشمول\p{L}*\s*(?:ب)?(?:ال)?سعر|جزو\s*قیمت|توی\s*قیمت|تو\s*قیمت)/u.test(value))&&!productionServiceOnly(raw)&&!/(?<!\p{L})(?:نیست|مو|ما|غیر|خارج|بره|برّه|جدا|نمی\s*شه|نمیشه|نمی\s*شود|نمیشود|نمی\s*کنیم|نمیکنیم|نمیاد|نمی\s*اد|لا|لیس)(?!\p{L})/u.test(value)&&!honestInformationGap(raw))return 'unapproved_free_service';
 // Popularity, price level, owner-approval prediction.
 if(/عاشق\p{L}*\s*(?:شن|ن|هستن|میشن)|عاشقشن|(?:رخیص|ارخص|ارزون|ارزان)\p{L}*\s*(?:هوایه|کلش|خیلی|جدا)|(?:هوایه|کلش|خیلی)\s*(?:رخیص|ارزون|ارزان)\p{L}*|(?:مدیر|المدیر|صاحب\p{L}*|الاستاذ)\s*(?:\p{L}+\s+){0,2}?(?:حتما|حتماً|اکید|اکیدا|اکیداً|اکیدن|بدون\s*شک)\s*(?:\p{L}+\s+){0,1}?(?:قبول|موافق|یوافق|یقبل|اوکی|تایید)\p{L}*/u.test(value)&&!honestInformationGap(raw))return 'marketing_claim';
 if(/(?<!\p{L})(?:استرداد\s*(?:ال)?(?:وجه|مبلغ|فلوس)|بازگشت\s*(?:وجه|پول)|ضمانت\s*(?:بازگشت|برگشت)|گارانتی\p{L}*|(?:ضمان|کفاله)\s*(?:استرجاع|استرداد|سنه|سنتین|شهر))(?!\p{L})/u.test(value)&&!honestInformationGap(raw)&&!uncertaintyFrame.test(value))return 'compensation_commitment';
 // Semantic refund / money-back / replacement promise, any word order and polarity: a money or goods object plus a "comes back /
 // is not lost / we return / we replace" predicate, or a dissatisfaction condition with such a predicate («پولتون نمی‌سوزه، کامل
 // برمی‌گرده», «پولت هدر نمی‌ره», «فلوسك ما تروح», «إذا ما عجبتك نرجعلك فلوسك»).
 {const money=/(?<!\p{L})(?:پول\p{L}*|وجه\p{L}*|مبلغ\p{L}*|هزینه\p{L}*|فلوس\p{L}*|المبلغ|مبلغک|حق\s*ت|بیعانه\p{L}*|عربون\p{L}*)(?!\p{L})/u,
   back=/(?<!\p{L})(?:بر\s*می\s*گرد\p{L}*|برمیگرد\p{L}*|برگرد\p{L}*|برگشت\p{L}*|پس\s*(?:می\s*)?(?:دیم|دهیم|میدیم|بدیم|می‌دیم|میگیرید|میدم)|برمی\s*گردون\p{L}*|برمیگردون\p{L}*|نمی\s*سوز\p{L}*|نمیسوز\p{L}*|نسوز\p{L}*|هدر\s*نمی\p{L}*|هدر\s*نمیره|ضایع\s*نمی\p{L}*|از\s*دست\s*نمی\p{L}*|(?:ت|ی)?رجع\p{L}*|نرجع\p{L}*|نرد\p{L}*|نعید\p{L}*|ما\s*(?:تروح|یروح|تضیع|یضیع)|کامل\s*(?:برمی|پس|ترجع)|\p{L}{0,3}(?:سترجع|سترد)\p{L}*|استرجاع\p{L}*|استرداد\p{L}*|بازگشت|برگشت)(?!\p{L})/u,
   unhappy=/(?:اگه|اگر|اذا|لو)\s*(?:\p{L}+\s+){0,3}?(?:نپسند\p{L}*|راضی\s*نبود\p{L}*|خوشتون\s*نیومد|خوشت\s*نیومد|ما\s*عجب\p{L}*|ما\s*حب\p{L}*|مو\s*راضی)/u;
  const preProduction=/(?<!\p{L})قبل\s*(?:از\s*)?(?:ال)?(?:طباعه|چاپ|تولید|انتاج|تصنیع|ساخت|التصمیم|طراحی\s*نهایی)(?!\p{L})/u.test(value);
  if((money.test(value)&&back.test(value))||(!preProduction&&unhappy.test(value)&&(back.test(value)||/(?:عوض|تعویض|نبدل|نستبدل|بدل)\p{L}*/u.test(value))))return 'compensation_commitment';}
 // Market superiority, competitor comparison and social proof by place are business facts no record approves. A superlative
 // that qualifies the CUSTOMER'S choice («به نظرم بهترین گزینه برای شما …») is a recommendation, not a market claim.
 if(/(?<!\p{L})(?:بهترین|برترین|بی\s*رقیب|بی\s*نظیر|رقیب\p{L}*|شماره\s*(?:یک|1)|نمبر\s*وان|number\s*one|the\s*best|best\s*quality|(?:ال)?افضل|(?:ال)?اقوی|(?:ال)?اول\s*ب(?:ال)?(?:عراق|سوک|بلد|ایران)|رقم\s*(?:واحد|1))(?!\p{L})|(?:هیچ|ماکو|محد|ما\s*اکو)\s*(?:\p{L}+\s+){0,3}?(?<!\p{L})(?:مثل\s*ما|مثلنا|زینا|مثل\s*کار\s*ما)|(?:کل|همه\s*ی?|بیشتر|اکثر|معظم)\s*(?:ال)?(?:محلات|مغازه\p{L}*|طلافروش\p{L}*|صاغه|زباین|الناس|مشتری\p{L}*)\s*(?:\p{L}+\s+){0,5}?(?<!\p{L})(?:ماخذی\p{L}*|یاخذ\p{L}*|می\s*بر\p{L}*|میبر\p{L}*|میخر\p{L}*|می\s*خر\p{L}*|راضی\p{L}*|یشترو\p{L}*|یشترون\p{L}*|خذو\p{L}*)|اکثر\s*شی\s*(?:ین|ی|ت)\p{L}+|(?:ین|ی|ت)باع\s*(?:\p{L}+\s+){0,1}?(?<!\p{L})(?:هوایه|بالعراق|اکثر)|(?:ین|ی)طلب\s*هوایه|هوایه\s*(?:\p{L}+\s+){0,1}?(?:ین|ی|ت)(?:طلب|باع|شتر\p{L}*)\p{L}*|(?:تعیش|یعیش|تعمر|یعمر)\s*(?:\p{L}+\s+){0,1}?(?<!\p{L})(?:سنین|سنوات)/u.test(value)&&!/(?:بهترین|افضل|احسن)\s*(?:\p{L}+\s+){0,1}?(?:گزینه|انتخاب|خیار|اختیار|کار|راه|حل|طریقه|شی)/u.test(value)&&!honestInformationGap(raw))return 'marketing_claim';
 // A deadline tied to an event or a span («قبل العيد», «تا عید دستتونه», «خلال اسبوع تكون عندك») is a delivery-time commitment.
 if(/(?<!\p{L})(?:قبل|بعد|تا|لحد|الی|ل|لل)\s*(?:از\s*)?(?:ال)?(?:عید\p{L}*|نوروز|رمضان|محرم|یلدا|عرس\p{L}*|عروسی\p{L}*|مناسب[هت]\p{L}*|خطوب[هت]\p{L}*|تولد\p{L}*|نامزدی\p{L}*|جمعه|خمیس)(?!\p{L})|(?<!\p{L})(?:عید|العید|نوروز|عرس|العرس|عروسی)\s*(?:\p{L}+\s+){0,1}?(?<!\p{L})(?:دستتون|دستت|میرسه|می\s*رسه|عندک|تلحک)|(?:تلحک|تلحگ|یلحک|یلحگ|توصل|یوصل|میرسه|می\s*رسه|برسه)\s*(?:\p{L}+\s+){0,2}?(?<!\p{L})(?:ال)?(?:عید|نوروز|عرس|عروسی|مناسب[هت]|خطوب[هت])(?!\p{L})|(?<!\p{L})ب(?:یوم|یومین|اسبوع|اسبوعین|ساعه|ساعتین|شهر)(?!\p{L})|(?:خلال|ظرف|بحدود|حدود|تقریبا|تقریباً)\s*(?:\p{L}+\s+){0,1}?(?<!\p{L})(?:اسبوع\p{L}*|یوم|یومین|ایام|شهر|هفته|روز|ماه)/u.test(value)&&/(?:تلحک|تلحگ|یلحک|توصل|یوصل|تکون\s*عند|یکون\s*عند|عندک|میرسه|می\s*رسه|برسه|دستتون|دستت|تحویل|میاد|میاره|اماده|آماده|جاهز|تخلص|نسلم|نرسل|نشحن|تطلع|اکید|ان\s*شاء|انشاء|نگران)/u.test(value)&&!honestInformationGap(raw)&&!uncertaintyFrame.test(value))return 'delivery_time_claim';
 // Hospitality idioms for "free" on a shipping/packing cost («کارتن رو مهمونتون می‌کنیم», «الكرتون خليه علينا، هدية»).
 if(/(?:مهمون\p{L}*|هدیه\p{L}*|هدی[هت]|کادو\p{L}*|اشانتیون|ببلاش|بلاش|مجان\p{L}*|رایگان\p{L}*|خلیه\s*علینا|علی\s*حسابنا|حساب\s*نمی\s*کنیم|حساب\s*نمیکنیم|ما\s*نحسب\p{L}*|ما\s*ناخذ\p{L}*)/u.test(value)&&/(?:کارتن|کرتون|انتقال|نقل|کرایه|ارسال|شحن|اجور|باربری|بسته\s*بندی|تغلیف|حمل)/u.test(value)&&!/(?<!\p{L})(?:نیست|نمیشه|مو|لیس|غیر|نه)(?!\p{L})/u.test(value)&&!honestInformationGap(raw))return 'business_cost_commitment';
 // Arrival/readiness timing without a number («فردا می‌رسه», «زود می‌رسه», «سریع آماده‌ش می‌کنیم», «زیاد طول نمی‌کشه»).
 if(/(?<!\p{L})(?:فردا\p{L}*|پس\s*فردا|امروز|امشب|زود|سریع|فوری|فورا|همون\s*روز|همین\s*هفته|باچر|بکره|اسرع|بسرعه|طول\s*نمی\s*کشه|طول\s*نمیکشه|معطل\s*نمی)(?!\p{L})/u.test(value)&&/(?:رس|رسه|میرسه|اماده|آماده|تولید|ارسال|میفرست|بفرست|تحویل|دستتون|دستت|حرکت|یوصل|توصل|یجهز|جاهز|نشحن|طول|معطل)/u.test(value)&&!honestInformationGap(raw))return 'delivery_time_claim';
 // Returns/exchange («اگه پسندتون نبود پس می‌گیریم», «نرجعه»): owner-only.
 if(/پس\s*(?:می\s*)?گیریم|پسش\s*می\s*گیریم|مرجوع\p{L}*|عودت|نرجع\p{L}*|نبدل\p{L}*|نستبدل\p{L}*|تعویض\s*می\s*کنیم/u.test(value)&&!/(?<!\p{L})(?:نمی\p{L}*|ما|مو|لا)\s*(?:پس|نرجع|نبدل)/u.test(value))return 'compensation_commitment';
 // Popularity / social proof («بیشتر مشتری‌ها این رو سفارش میدن», «هواية زباين يختارونه», «الأكثر طلباً») is a business
 // fact no record approves.
 if(/(?<!\p{L})(?:اکثر|بیشتر|اغلب|خیلی\s*از|همه\s*ی?|هوایه|هوای|معظم|اکثریه)\s*(?:ی\s*)?(?:مشتری(?:ها|هامون|ای|ا|ان|های)|خریدار(?:ها|ان)|زبای?ن|زباین|الزبائن|الزباین|الناس|عملاء|عملائنا)(?!\p{L})|پرفروش|محبوب\s*ترین|محبوبترین|(?:ال)?اکثر\s*(?:طلب|مبیع)\p{L}*|most\s+(?:customers|people|popular)|best\s*sell\p{L}*/u.test(value))return 'marketing_claim';
 // Stock / readiness now is an owner-only availability fact («همیشه موجوده», «همین الان موجوده», «جاهز هسه»).
 if(/(?:موجود|متوفر|اماده|آماده|جاهز|حاضر)\p{L}*/u.test(value)&&/(?<!\p{L})(?:همیشه|الان|همین\s*الان|فوری|فورا|هسه|هسع|دائما|دایما|حالا|همین\s*حالا|always|now)(?!\p{L})/u.test(value)&&!/(?<!\p{L})(?:نیست|ماکو|مو|نمی\p{L}*|ندار\p{L}*)(?!\p{L})/u.test(value))return 'stock_claim';
 // Water/moisture resistance is a product feature no record approves («العلبة ما يدخلها مي», «آب توش نمیره»).
 if(/(?<!\p{L})(?:ما|مو|لا)\s*(?:[یت])?(?:دخل|نفذ|تاثر|اثر)\p{L}*\s*(?:\p{L}+\s+){0,2}?(?:مای|ماء|الماء|المای|می|المی|رطوب\p{L}*)(?!\p{L})|(?<!\p{L})(?:مای|ماء|الماء|المای|رطوب\p{L}*)\s*(?:\p{L}+\s+){0,3}?(?:ما|مو|لا)\s*(?:[یت])?(?:دخل|نفذ|اثر|تاثر)|ضد\s*(?:ال)?(?:ماء|مای|می|رطوب\p{L}*|بلل)|(?<!\p{L})ا?ب\s*(?:\p{L}+\s+){0,2}?(?:نمی\s*ره|نمیره|نفوذ\s*نمی|اثر\s*نداره|خرابش\s*نمی)|(?:رطوبت|نم)\s*(?:\p{L}+\s+){0,2}?(?:اثر\s*نداره|نمی\s*گیره|خراب\s*نمی)|ضد\s*(?:اب|رطوبت|نم)(?!\p{L})/u.test(value))return 'unsupported_product_feature';
 // Production/readiness duration («التصنيع ياخذ تقريباً أسبوعين», «تولیدش یه هفته طول می‌کشه») is owner-only
 // in any sentence, hedged or not; an honest «زمان تولید رو نمی‌دونم» stays allowed.
 if(/تولید|تصنیع|انتاج|ساخت|اماده|جاهز|اجهز|نجهز|تجهز|یجهز|اماد|تخلص|یخلص|حاضر|(?<!\p{L})[یتن]طلع\p{L}*|(?<!\p{L})[یتن]سلم\p{L}*|(?<!\p{L})[یتن]اخذ(?!\p{L})|(?<!\p{L})[یت]اخذ\s*وقت|طول\s*(?:می\s*)?کش|کار\s*(?:می\s*)?بر|وقت\s*(?:می\s*)?بر|میکشه|میبره/u.test(value)&&durationUnit.test(value)&&!honestInformationGap(raw))return 'production_time_commitment';
 // Payment received / order confirmed are owner-only facts in any language form («وصلتنا الحوالة», «طلبك تثبت»).
 if(/(?<!\p{L})(?:وصل\p{L}*|استلمنا|استلمت|رسید|دریافت\s*شد|دریافت\s*کردیم|نشست|واریز\s*شد)(?!\p{L})/u.test(value)&&/(?:حواله|حوالة|فلوس|مبلغ|واریز|پول|فیش|پرداخت|دفع|عربون|بیعانه|payment)/u.test(value)&&!/[؟?]\s*$/u.test(raw))return 'payment_confirmation';
 if(/(?<!\p{L})(?:ال)?طلب\p{L}*\s*(?:\p{L}+\s+){0,2}?(?:تثبت|انقبل|انحجز|تاکد|تأکد|اتسجل|تسجل|ثبتناه|قبلناه)(?!\p{L})|(?:تم|صار)\s*(?:تثبیت|قبول|حجز|تاکید)\s*(?:ال)?طلب/u.test(value))return 'order_commitment';
 // A dimension with a unit, or a dimension noun with a number («ارتفاعها ٣ سم», «ارتفاعش حدوداً ۳ سانتیه»), is not an
 // approved catalogue size (sizes are named NxM); a number allowed elsewhere must not carry it through.
 if((/[0-9۰-۹٠-٩]+(?:[.,٫][0-9۰-۹٠-٩]+)?\s*(?:سم|سنتی\p{L}*|سانت\p{L}*|cm|میلی\p{L}*|ملم|mm|متر|اینچ|inch)(?!\p{L})/u.test(value)||/(?:ارتفاع|طول|عرض|قطر|عمق|ضخامت|سمک|سماک\p{L}*|height|depth|width)\p{L}*\s*(?:\p{L}+\s+){0,3}?(?:[0-9۰-۹٠-٩]|یک|دو|سه|چهار|پنج|شش|هفت|هشت|ده|واحد|اثنین|ثلاث\p{L}*|اربع\p{L}*|خمس\p{L}*)(?!\p{L})/u.test(value))&&!/[؟?]\s*$/u.test(raw)&&!honestInformationGap(raw)&&!/(?<!\p{L})(?:بفرست\p{L}*|بگید|بگین|دزلی|دزیلی|گلی|ابعثلی)(?!\p{L})/u.test(value))return 'dimension_claim';
 // Departure/dispatch timing stays a commitment under a hedge («احتمالاً همین هفته بار حرکت کنه»).
 if(/حرکت|راه\s*(?:می\s*)?(?:افت|افته|بیفت|میفت)\p{L}*|ارسال\s*(?:می\s*)?(?:شه|شود|کنیم)|بفرستیم|می\s*فرستیم|(?<!\p{L})(?:ی|ت|ن)(?:طلع|نشحن|نرسل|شحن)\p{L}*/u.test(value)&&/(?<!\p{L})(?:امروز|فردا|پس\s*فردا|هفته|ماه|روز|ساعت|باچر|باجر|غدا|اسبوع|یوم|الیوم|هالاسبوع)(?!\p{L})/u.test(value))return 'dispatch_timing_claim';
 // A complete knowledge-gap statement («درباره‌ی جبران خسارت اطلاعات دقیقی ندارم») asserts nothing.
 if(honestInformationGap(raw))return null;
 if(uncertaintyFrame.test(value)&&!damageEvent.test(value))return null;
 if(damageEvent.test(value)&&remedyVerb.test(value))return 'compensation_commitment';
 // Arrival timing stays a promise under a hedge («فکر کنم تا عید برسه»، «زودتر … می‌رسه»).
 if(/(?:ب|می\s*)?(?:رسه|رسد|رسن)(?!\p{L})|(?<!\p{L})(?:ی|ت|ن)وصل\p{L}*/u.test(value)&&/(?<!\p{L})(?:تا|قبل|زودتر|سریع|فوری|اسرع|بسرعه|خلال|عید|نوروز|اخر|اول|before|soon|fast)(?!\p{L})|مطم(?:ی|ئ)?نا|حتما|قطعا|اکیدا|بالتاکید|اکید|بالضمان|definitely|for\s*sure/u.test(value))return 'delivery_outcome_promise';
 // Stock sufficiency, delivered-price inclusion.
 if(/موجودی\s*(?:\p{L}+\s+){0,1}?(?:کافی|زیاد|داریم|هست)|به\s*اندازه\s*کافی\s*داریم|(?<!\p{L})عدنا\s*(?:کمیه|ستوک|هوایه|وایدی)|in\s*stock/u.test(value))return 'stock_claim';
 if(/قیمت\s*(?:\p{L}+\s+){0,2}?(?:تحویل\s*(?:درب|دم|تا|در)|با\s*ارسال|درب\s*باربری)/u.test(value))return 'shipping_included_in_price';
 if(carrierLexicon.test(value)&&transportVerb.test(value))return 'unapproved_carrier';
 if(damageEvent.test(value)&&/(?:پای|گردن|با|علی)\s*(?:ما|نا|خودمون)|علینا/u.test(value))return 'compensation_commitment';
 if(insuranceArabic.test(value)&&!/ما\s*(?:اعرف|ادری)/u.test(value))return 'compensation_commitment';
 if(trackRecord.test(value)||rhetoricalAssurance.test(value))return 'damage_or_safety_assurance';
 if(firstPersonDispatch.test(value))return 'dispatch_status_claim';
 if(payOnArrival.test(value))return 'payment_term_claim';
 if(discountEuphemism.test(value))return 'discount';
 // Factual marketing claims (popularity, durability, lifetime) are not approved product facts.
 if(/پرفروش|محبوب\s*ترین|الاکثر\s*مبیعا|(?<!\p{L})(?:دوام|بادوام)(?!\p{L})|ماندگار\p{L}*\s*(?:بالا|زیاد)|چند\s*ساله|سال\s*ها\s*(?:دوام|سالم)|عمر\s*طولانی|یعیش\s*سنین|best\s*-?seller|long\s*-?lasting|durable/u.test(value))return 'unsupported_marketing_claim';
 if(/مهم(?:ا|و)ن\s*(?:ما|خودمون)|(?<!\p{L})(?:هدیه|کادو)\s*(?:\p{L}+\s+){0,1}?(?:ما|از\s*طرف\s*ما)|علی\s*حسابنا|هدیه\s*منا|مجانا/u.test(value)&&(costObject.test(whole)||/کارتن|بسته\s*بندی|کرتون/u.test(value)))return 'free_shipping_claim';
 if(/ته\s*کشید|تموم\s*شده|شارژ\s*(?:می\s*)?(?:شه|شود)|موجود\s*(?:می\s*)?(?:شه|شود)|(?<!\p{L})(?:خلصت|نفذت|نفذ|راح\s*یتوفر)(?!\p{L})/u.test(value))return 'stock_claim';
 if(/(?:ربع|ثلث|نص|نصف|یک\s*سوم|یه\s*سوم)\s*(?:ال)?(?:سعر|قیمت)|اندازه\s*(?:ی\s*)?(?:یک|یه)\s*\p{L}+\s*(?:\p{L}+\s+){0,1}?(?:در\s*می\s*(?:اد|اید)|درمیاد|میشه)/u.test(value)&&costObject.test(whole))return 'cost_magnitude_claim';
 if(/(?:اسرع|ارخص|افضل|زودتر|سریعتر|ارزونتر)\s*(?:\p{L}+\s+){0,1}?(?:من|از)\s*(?:غیرنا|بقیه|دیگران|الباقین|همه)/u.test(value))return 'comparative_service_claim';
 if(/(?<!\p{L})شرکه\s+(?!نقل|شحن|الشحن|النقل|نقل\s*بضائع)(?:ال)?\p{L}+\s+(?:لل|ال)?(?:نقل|شحن)/u.test(value))return 'unapproved_carrier';
 if(latinCommitment.test(raw))return 'latin_script_commitment';
 if(vehicleMeans.test(value)&&transportVerb.test(value))return 'unapproved_carrier';
 if(costObject.test(whole)&&anaphoricBusinessPayer.test(value))return 'business_cost_commitment';
 return null;
}
// A clause-level magnitude claim is only meaningful in a reply that discusses a cost.
export function costMagnitudeClaim(clause,reply){
 const value=key(clause);
 // Cost context includes a quote/inquiry and a comparison against the box or its price
 // («دقیقش استعلام می‌خواد ولی کمتر از خود جعبه‌ها درمیاد»).
 const context=costObject.test(key(reply))||/استعلام|استفسار|(?:کمتر|بیشتر|ارزون\p{L}*|گرون\p{L}*|اقل|اکثر|ارخص)\s*(?:\p{L}+\s+){0,1}?(?:از\s*)?(?:خود\s*)?(?:جعبه|قیمت|علبه|سعر)/u.test(key(reply));
 return costMagnitude.test(value)&&context&&!/[؟?]\s*$/u.test(String(clause));
}
// OPTION 2 — semantic risk fields that no approved shipping record grants. They run on every
// applicable clause BEFORE any acceptance, so open vocabulary never opens fabrication.
const carrierLexicon=/(?<!\p{L})(?:بال|وبال|ال|ب)?(?:ماشین\s*خودمون|خودروی\s*خودمون|ماشینمون|سیارتنا|سیاره\s*خاصه|پیک|الوپیک|اتوبوس|قطار|هواپیما|هوایی|کشتی|چاپار|ماهکس|پیشتاز|تاکسی|تکسی|کابتن|uber|careem|طیاره|جوا|جوی|بحری)(?!\p{L})/u;
const productRisk=/ضد\s*اب|ضداب|فوم|مقاوم|محکم|ضربه\s*گیر|حباب|موجود|متوفر|عندنا\s*(?:ال)?(?:علب|کمیه)|سایز|ابعاد|اندازه|قیاس|مقاس|جا\s*(?:می\s*شه|میشه|داره)|مناسب\s*(?:شیشه|عطر|بطری)|برای\s*عطر\s*مناسب|باز\s*می\s*شه|باز\s*میشه|باز\s*می\s*شود|درب\s*مغناطیس/u;
const narrowing=/(?<!\p{L})(?:فقط|تنها|بس|بقیه|سایر|الباقی|الباقیه)(?!\p{L})/u;
const uncertainSpeech=/تا\s*استعلام|(?:پاسخ|جواب)\s*(?:\p{L}+\s+){0,1}?ندارم|نمی\s*خوا\p{L}*\s*(?:\p{L}+\s+){0,1}?حدسی|(?<!\p{L})(?:حدس|تقریب|حدود|احتمال|دقیق)\p{L}*\s*(?:\p{L}+\s+){0,3}?(?:نمی|بدون\s*استعلام)|بدون\s*استعلام|قبل\s*از\s*استعلام|(?:اعتذر|احب|اقدر|اگدر|اکدر)\s*(?:\p{L}+\s+){0,2}?(?:اذکر|احدد|اقول|اگول|انطی)/u;
function riskField(raw,value,uncertain){
 const k=outcomeCommitment(raw)||(compensationCommitment(raw)?'compensation_commitment':null);if(k)return k;
 if(costAbsence.test(value))return 'free_shipping_claim';
 // Service-quality / satisfaction / reliability claims are not in any approved shipping record.
 // («استعلام معتبر» is the approved wording and is not a quality claim.)
 if(/استاندارد|راضی|رضایت|موثوق|حرفه\s*ای|با\s*کیفیت|بهترین|پرفروش|محبوب|ممتاز|درجه\s*یک|امن\s*ترین|مطمئن\s*ترین|reliable|trusted|best/u.test(value.replace(/استعلام\s*معتبر/gu,' ')))return 'unsupported_service_quality_claim';
 // Spelled-out numbers state an amount, a quantity or a duration exactly like digits do.
 // (Persian «نه» = "no" and the clitic «ست» are deliberately not read as numbers.)
 if(/(?<!\p{L})(?:دو|سه|چهار|پنج|شش|شیش|هفت|هشت|ده|یازده|دوازده|بیست|سی|چهل|پنجاه|شصت|هفتاد|هشتاد|نود|صد|دویست|سیصد|چهارصد|پانصد|پونصد|هزار|میلیون|میلیارد|اثنین|ثنین|ثلاث|ثلاثه|اربع|اربعه|خمس|خمسه|سبع|سبعه|ثمان|ثمانیه|تسع|تسعه|عشر|عشره|عشرین|میه|مئه|میتین|الف|الاف|ملیون|نص\s*ملیون)(?!\p{L})/u.test(countWordsRemoved(value)))return 'unsupported_number';
 if(carrierLexicon.test(value))return 'unapproved_carrier';
 // Product/stock risk is judged per part: a hedge exempts only the part that carries it.
 if(shippingSubParts(raw).some(part=>{const v=key(part);return productRisk.test(v)&&!(gap.test(v)||uncertaintyFrame.test(v)||uncertainSpeech.test(v));}))return 'unverified_product_or_stock_claim';
 const scoped=value.replace(/^بس\s+/u,'').replace(/(?:مثل\s*)?(?:بقیه|سایر)\s*(?:ی\s*)?(?:شهرستان|شهر)\p{L}*/gu,' ').replace(/(?<!\p{L})فقط\s*(?:اینو|این\s*رو)\s*(?:هم\s*)?(?:بدونید|بگم|در\s*نظر)/gu,' ');
 if(narrowing.test(scoped)&&(payerOf(value)||excludedFromPrice(value)))return 'payer_scope_narrowed';
 return null;
}
// A hedge exempts only its own part: every other SHIPPING part joined by «و/ولی/اما/بس/لكن»
// must be a valid shipping statement or another hedge. Non-shipping parts (a qualified product
// suggestion) are not exempted here — they are handed to the product validator, which receives
// them as separate parts (see shippingSubParts and productAssertionIssue).
export function shippingSubParts(text){return String(text).split(/[،,]|\s+(?:و|ولی|اما|ولکن|لكن|لکن|بس)\s+/u).map(part=>part.trim()).filter(Boolean);}
function hedgeCovers(text,options){
 const parts=shippingSubParts(text);
 if(parts.length<2)return true;
 return parts.every(part=>{const v=key(part);if(gap.test(v)||uncertaintyFrame.test(v)||uncertainSpeech.test(v)||honestInformationGap(part))return true;const a=shippingClaimAssessment(part,{...options,context:{...(options.context||{})}});return !a.applicable||a.valid;});
}
export function outcomeCommitment(text){
 if(nonCommittalClause(text))return null;
 text=committalPortion(text);
 const value=key(text);
 // A question back to the customer commits to nothing.
 if(/[؟?]\s*$/u.test(String(text)))return null;
 if(paymentReceived.test(value))return 'payment_received_claim';
 if(carrierMeans.test(value)&&sendVerb.test(value)&&!uncertaintyFrame.test(value))return 'unapproved_carrier';
 // Door/address delivery is not approved (Iraq policy states it is NOT guaranteed); only an
 // explicit "not guaranteed / I can't promise" frame may mention it.
 if(/(?:تا|به)\s*(?:(?:دم|جلوی|درب|در)\s*(?:ی\s*)?){1,2}(?:خونه|منزل|مغازه|خانه|محل\s*کار)\p{L}*|(?:دم|جلوی|درب|در)\s*(?:ی\s*)?(?:خونه|منزل|مغازه|خانه)\p{L}*\s*(?:\p{L}+\s+){0,1}?(?:تحویل|میاد|میاره|می\s*اره|می\s*اورد|میرسه)|(?:لحد|الی\s*حد|لباب|الی\s*باب)\s*(?:ال)?(?:بیت|محل|باب)\p{L}*|باب\s*(?:ال)?بیت|(?<!\p{L})لعند(?:ک|ج|کم)(?!\p{L})|(?:یجیب|نجیب|یوصل|نوصل)\p{L}*\s*(?:ل|الی\s*)?عند(?:ک|ج|کم)|home\s*delivery|to\s+your\s+door/u.test(value)&&!/(?:نمی|ما|مو|لا|غیر)\s*(?:\p{L}+\s+){0,1}?(?:تضمین|مضمون|[یاتن]ضمن|[انتی][گک]در|[انتی]قدر|تونم|تونیم)|ندارم|نمی\s*دونم/u.test(value))return 'door_delivery_promise';
 // Payment instruments/timing are payment terms the model never sets.
 if(/زین\s*کاش|زين\s*كاش|کی\s*کارت|ماستر\s*کارت|اسیا\s*حواله|اسیاسیل|(?:پرداخت|تسویه)\s*(?:\p{L}+\s+){0,1}?(?:در\s*محل|موقع\s*تحویل|هنگام\s*تحویل|بعد\s*از\s*تحویل)|(?:عند|من)\s*(?:ال)?(?:استلام|تستلم)|cash\s*on\s*delivery|\bcod\b/u.test(value)
  // «کاش» is Persian "I wish"; only an Arabic clause reads it as cash.
  ||!persianClause(value)&&/(?<!\p{L})(?:کاش|نقدا|نقد)(?!\p{L})/u.test(value))return 'payment_term_claim';
 // «قیمت با ارسال»، «شامل ارسال»، «يشمل الشحن»، «واصل»: the box price is said to include delivery.
 if(!/(?:شامل|با\s*احتساب)\s*(?:هزینه\s*)?(?:ارسال|حمل|کرایه)\s*(?:\p{L}+\s+){0,1}?(?:نیست|نمی\p{L}*|نشده|نمیشه)|(?<!\p{L})(?:ما|لا|مو)\s*یشمل/u.test(value)&&/قیمت\s*(?:\p{L}+\s+){0,3}?با\s*(?:هزینه\s*)?ارسال|(?:شامل|با\s*احتساب)\s*(?:هزینه\s*)?(?:ارسال|حمل|کرایه)|ارسال\s*(?:هم\s*)?(?:توشه|تو\s*قیمت\p{L}*|حساب\s*شده)|یشمل\s*(?:ال)?(?:شحن|توصیل)|(?<!\p{L})واصل(?!\p{L})|delivered\s+price|including\s+(?:shipping|delivery)/u.test(value))return 'shipping_included_in_price';
 // Dispatch/delivery STATUS of this customer's order («سفارش شما فرستاده است», «تم شحن الطلب»).
 if(/(?:سفارش|بار|بسته|محموله|جعبه|طلب|بضاع|شحنه)\p{L}*\s*(?:\p{L}+\s+){0,5}?(?:فرستاده\s*(?:شد|شده|است|ایم|شدن)|ارسال\s*(?:شد|شده|کردیم)|تحویل\s*(?:شد|شده)|راه\s*افتاد\p{L}*)(?!\p{L})|(?:تم|صار)\s*(?:ال)?(?:شحن|ارسال|تسلیم|توصیل)|(?<!\p{L})(?:انرسل|انشحن|انشحنت|طلعت)(?!\p{L})/u.test(value))return 'dispatch_status_claim';
 if(refundPromise.test(value)&&!uncertaintyFrame.test(value))return 'refund_commitment';
 if(shareTaken.test(value)||evenSplit.test(value)&&costObject.test(value))return 'business_cost_commitment';
 if(followupPromise.test(value))return 'followup_promise';
 // An arrival with an assurance or time anchor is a delivery promise whatever the object.
 const anchored=/حتما|اکید|مطمئن|تضمین|قبل\s*از|پیش\s*از|سر\s*موقع|به\s*موقع|بوقت|علی\s*الوقت|قبل/u.test(value);
 const kind=(arrivalPromise.test(value)||speedPromise.test(value))&&(shipmentObject.test(value)||anchored)?'delivery_outcome_promise':safeArrival.test(value)||outcomeAssurance.test(value)&&shipmentObject.test(value)?'damage_or_safety_assurance':fitClaim.test(value)&&containedObject.test(value)&&!/یا\s*نه|بفرستید|بفرستین|بگید|بفرمایید|ارسل\p{L}*|دز\p{L}*|ببینیم/u.test(value)?'unverified_fit_claim':businessCostShare.test(value)&&costObject.test(value)?'business_cost_commitment':null;
 if(!kind)return null;
 // A business cost/assurance is never excused by a hedge; only an explicit "I can't say /
 // don't know" frame makes arrival or fit speech non-assertive.
 if(kind!=='business_cost_commitment'&&(uncertaintyFrame.test(value)||honestInformationGap(text)))return null;
 return kind;
}
const methodPatterns=[['freight',/باربری|شرکه\s*(?:شحن|نقل)|freight\s*carrier/iu],['snap',/اسنپ|snap/iu],['van',/وانت|pickup/iu],['tipax',/تیپاکس|tipax/iu],['post',/(?<!\p{L})(?:بال|ب|ال)?(?:پست|برید|post)(?!\p{L})/iu],['courier',/dhl|aramex|fedex|(?<!\p{L})(?:ups|tnt)(?!\p{L})|ارامکس|courier|express|اکسپرس/iu],['air',/هوایی|(?<!\p{L})جوی(?!\p{L})|\bair\b/iu],['ground',/زمینی|(?<!\p{L})بری(?!\p{L})|\bground\b/iu]];
function payerOf(text){
 const customer=customerPays(text),business=businessPays(text);
 // Negators are whole words: «لا» inside «الاجور» (the costs) is not a negation.
 if(customer&&/(?:عهده\s*مشتری|با\s*(?:خودتون|مشتری|شما)).{0,8}(?:نیست|نبود|نمی)|(?:علی\s*(?:ال)?زبون).{0,8}(?<!\p{L})(?:مو|لیس)(?!\p{L})|(?<!\p{L})(?:نباید|نمی\s*تواند|لا|مو|لیس)(?!\p{L}).{0,30}(?:عهده\s*مشتری|با\s*(?:خودتون|مشتری|شما)|یتحمل.{0,8}زبون|علی.{0,8}زبون)/u.test(text))return 'negated_customer';
 if(business&&/(?:عهده\s*(?:ما|فروشنده|شرکت)|با\s*(?:ما|فروشنده|شرکت)|علینا).{0,8}(?:نیست|نبود|نمی|(?<!\p{L})(?:مو|لیس)(?!\p{L}))|(?<!\p{L})(?:نباید|نمی\s*تواند|لا|مو|لیس)(?!\p{L}).{0,30}(?:عهده\s*(?:ما|فروشنده|شرکت)|با\s*(?:ما|فروشنده|شرکت)|علینا)/u.test(text))return 'negated_business';
 return customer&&business?'conflicting':customer?'customer':business?'business':null;
}
// Grammatical person decides the payer: a second-person pay verb addresses the customer,
// a first-person-plural one is the business; a third-person verb needs its own subject.
// Iraqi تتحمل/تدفع is also third-person feminine, so a business subject beside it makes the
// payer conflicting (rejected) instead of customer.
const customerPayVerb=/پرداخت\s*(?:می\s*)?(?:کنید|کنین|کنی)(?!\p{L})|(?<!\p{L})(?:می\s*|ب)?(?:پردازید|پردازین)(?!\p{L})|(?<!\p{L})(?:می\s*(?:دید|دین|دهید)|بدید|بدین|بدهید)(?!\p{L})|(?<!\p{L})(?:تتحمل|تدفع)(?:ه|ها|ون|ین|ی)?(?!\p{L})|علی\s*حساب(?:ک|کم|ج)(?!\p{L})/u;
const businessPayVerb=/پرداخت\s*(?:می\s*)?کنیم(?!\p{L})|(?<!\p{L})(?:می\s*|ب)?پردازیم(?!\p{L})|(?<!\p{L})(?:می\s*(?:دیم|دهیم)|بدیم|بدهیم)(?!\p{L})|(?:تقبل|قبول)\s*(?:می\s*)?کنیم(?!\p{L})|عهده\s*(?:می\s*)?گیریم|(?<!\p{L})(?:نتحمل|ندفع)\p{L}*|(?<!\p{L})علینا(?!\p{L})|علی\s*حسابنا|(?:(?<!\p{L})ما|خودمون|خودمان|شرکت|فروشنده|الشرکه|شرکتنا|احنا|نحن|المحل|المعمل)(?:\s+\S+){0,3}?\s+(?:پرداخت\s*(?:می\s*)?(?:کنه|کند)|می\s*(?:پردازه|پردازد|ده|دهد)|تتحمل|تدفع|یتحمل|یدفع)\p{L}*(?!\p{L})/u;
function customerPays(text){
 return /(?:جزو|جز)\s*(?:ی\s*)?(?:هزینه|مخارج)\p{L}*\s*(?:ی\s*)?(?:مشتری|خودتون|شما|خریدار)|(?:با|عهده|گردن|حساب|پای)\s*(?:خود\s*)?(?:خودتون|خودتان|مشتری|شما)|(?:بر\s*)?عهده\s*(?:خود\s*)?مشتری|مشتری.{0,16}پرداخت\s*می\s*کند|(?:اجور|کلفه|کلفت|تکلفه|مصاریف|شحن|نقل|کرتون|کارتون|رسوم).{0,22}(?:علی\s*(?:زبون|الزبون)|علیک|علیکم|علیج)(?!\p{L})|(?:زبون|الزبون).{0,18}(?:یتحمل|علیه|یدفع)|یتحمل.{0,15}(?:زبون|الزبون)|customer\s*pays/iu.test(text)
  ||customerPayVerb.test(text)
  ||/(?:مشتری|خریدار)(?:\s+\S+){0,3}?\s+(?:پرداخت\s*(?:می\s*)?(?:کنه|کند|کنن|کنند)|می\s*(?:پردازه|پردازد|ده|دهد|دن|دهند))(?!\p{L})/u.test(text)
  ||/(?:اجور|کلفه|کلفت|تکلفه|مصاریف|شحن|نقل|کرتون|کارتون|رسوم).{0,22}(?:علیج)(?!\p{L})/u.test(text);
}
// The business as payer in any word order: «تتحملها الشركة» (verb first), «على الشركة»،
// «مال ما / پای ما / مال شرکت».
const businessSubject='(?:ال)?(?:شرکه|محل|معمل|بایع|بائع)|شرکتنا|احنا|نحن';
const businessPayAnyOrder=new RegExp('(?<!\\p{L})و?(?:ت|ی)(?:تحمل|دفع)\\p{L}*\\s+(?:\\S+\\s+){0,2}?(?:'+businessSubject+')(?!\\p{L})|علی\\s*(?:'+businessSubject+')(?!\\p{L})|(?:مال|پای|گردن)\\s*(?:ی\\s*)?(?:ما|خودمون|خودمان|شرکت|فروشنده|مجموعه)(?!\\p{L})','u');
// «با خودمونه», «مهمون ما», «نتكفل» — the business taking the cost.
const businessPossessive=/(?<!\p{L})(?:با|به\s*عهده|گردن)\s*(?:ی\s*)?خودمون\p{L}*|مهمون\s*(?:ما|خودمون)|(?<!\p{L})نتکفل\p{L}*|علی\s*کیسنا/u;
function businessPays(text){return businessPossessive.test(text)||/(?:با|عهده|گردن|حساب)\s*(?:ما|فروشنده|شرکت)|(?:شحن|نقل|اجور).{0,20}علینا|we\s*pay|seller\s*pays/iu.test(text)||businessPayVerb.test(text)||businessPayAnyOrder.test(text);}
const costNoun='(?:هزینه|کرایه|ارسال|حمل|کارتن|باربری)';
function exclusionProse(text){
 return text.replace(/(?:داخل|جزو|جز|شامل|در|توی|تو)\s*(?:خود\s*)?(?:قیمت|مبلغ|پول)\s*(?:خود\s*)?(?:جعبه|محصول)(?:\s*ها)?\s*(?:(?:حساب|محاسبه|لحاظ)\s*)?(?:نیست|نیستن|نمی\s*شه|نمیشه|نمی\s*شود|نمیشود|نمی\s*اد|نمیاد|نمی\s*اید|نشده)/gu,'خارج از قیمت جعبه است')
  .replace(new RegExp('(?:قیمت|مبلغ)\\s*(?:خود\\s*)?(?:جعبه|محصول)(?:\\s*ها)?\\s*شامل\\s*'+costNoun+'(?:\\s*(?:و|یا)?\\s*'+costNoun+')*\\s*(?:نیست|نمی\\s*شه|نمیشه|نمی\\s*شود|نمیشود)','gu'),'هزینه خارج از قیمت جعبه است')
  .replace(/(?:روی|به)\s*(?:خود\s*)?(?:قیمت|مبلغ)\s*(?:خود\s*)?جعبه(?:\s*ها)?\s*اضافه\s*(?:می\s*)?(?:شه|شود|میشه|میشود)/gu,'خارج از قیمت جعبه است')
  .replace(/(?:مو|ما|لیس|لیست|غیر)\s*(?:داخل|داخله|ضمن|محسوب|محسوبه|مشمول|مشموله)\s*(?:ب|فی|ویا|ویه|مع)?\s*(?:ال)?(?:سعر|ثمن)(?:\s*(?:ال)?علبه)?/gu,'خارج سعر العلبه')
  .replace(/مو\s*ضمن\s*سعر\s*(?:ال)?علبه/gu,'خارج سعر العلبه')
  .replace(/(?:از|با)\s*(?:قیمت|مبلغ)\s*(?:خود\s*)?(?:جعبه|محصول)(?:\s*ها)?\s*(?:جداست|جدا\s*(?:است|هست|ه)|جداگانه\s*(?:است|هست|ه)?)/gu,'خارج از قیمت جعبه است')
  .replace(/(?:ارسال|حمل|کرایه|هزینه\s*(?:ی\s*)?(?:ارسال|حمل))\p{L}*\s*(?:هم\s*)?جدا\s*(?:حساب|محاسبه)\s*(?:می\s*)?(?:شه|شود|میشه|میشود|میشن|می\s*شن)/gu,'هزینه ارسال جدا از قیمت جعبه است')
  .replace(/سعر\s*(?:ال)?علبه\s*شی\s*(?:و\s*)?(?:ال)?(?:شحن|اجور)\p{L}*\s*شی\s*ثانی/gu,'اجور الشحن خارج سعر العلبه')
  // Iraqi «برّه السعر» (outside the price) and «سعر العلبة ما يشمل أ ولا ب» (the box price
  // includes neither) are the same exclusion; «ولا» there only joins the excluded items.
  .replace(/(?<!\p{L})و?بره\s*(?:من\s*)?(?:ال)?سعر/gu,'خارج سعر')
  .replace(/(?:ال)?سعر\s*(?:ال)?علبه\s*(?:ما|لا|مو)\s*یشمل((?:\s+\S+)*)/gu,(m,rest)=>'خارج سعر العلبه'+rest.replace(/(?<!\p{L})ولا(?!\p{L})/gu,'و'));
}
// Grammatical/address material that names no business fact: «سارا جان»، «آقا رضا».
const addressTerms=/(?<!\p{L})(?:اقا|خانم|اغای|اغا)\s+\p{L}+|\p{L}+\s+(?:جان|جون|خانم)(?!\p{L})/gu;
// After exclusionProse has turned negated inclusion into exclusion, any remaining
// "inside the box price" wording is a positive inclusion claim. Every approved shipping
// source excludes these costs, so such a claim can never ride along a valid payer clause.
function includedInPrice(value){
 return new RegExp('(?:جزو|جز|شامل|داخل|توی|تو|در)\\s*(?:خود\\s*)?(?:قیمت|مبلغ|پول)\\s*(?:خود\\s*)?(?:جعبه|محصول)|(?:قیمت|مبلغ)\\s*(?:خود\\s*)?(?:جعبه|محصول)(?:\\s*ها)?\\s*شامل\\s*'+costNoun+'|(?<!\\p{L})(?:ضمن|داخل|داخله|محسوب|محسوبه|مشمول|مشموله)\\s*(?:ب|فی|ویا|ویه|مع)?\\s*(?:ال)?(?:سعر|ثمن)|(?:ال)?سعر\\s*(?:ال)?علبه\\s*(?:یشمل|شامل)|included\\s+in','u').test(value)
  // «با / رو / از قیمت جعبه حساب می‌شه»، «با قیمت جعبه پرداخت کنید»، «مع سعر العلبه»:
  // the cost travels WITH the box price. «جدا/خارج از قیمت» is exclusion, not this.
  ||/(?<!(?:جدا|جدای|خارج|بیرون)\s*)(?<!\p{L})(?:با|رو|روی|از)\s*(?:خود\s*)?قیمت\s*(?:خود\s*)?(?:جعبه|محصول)(?:\s*ها)?\s*(?:\p{L}+\s+){0,2}?(?:حساب|محاسبه|پرداخت|است|هست|میشه|می\s*شه|ه)(?!\p{L})|(?<!\p{L})و?(?:مع|ویا|ویه)\s*(?:ال)?سعر/u.test(value);
}
// Arabic شهر is a month; Persian شهر is a city. Only a non-Persian clause reads it as time.
const arabicMonth=/(?<!\p{L})(?:شهر|شهرین|اشهر)(?!\p{L})/u;
// «این» is not a marker: Arabic «أين/وين» normalises to the same letters.
// Counting words used as counts («سه تا هزینه», «هر سه», «ثلاث أشياء») state no amount.
const countWordsRemoved=value=>value.replace(/(?<!\p{L})(?:هر\s+)?(?:دو|سه|چهار|پنج|شش|شیش|هفت|هشت|اثنین|ثنین|ثلاث|ثلاثه|اربع|اربعه|خمس|خمسه)\s*(?:تا|عدد|مورد|نوع|بخش|قسمت|هزینه|چیز|مدل|سایز|رنگ|حالت|شرط|اشیاء|اشیا|انواع|اجور|مصاریف|اشیاء)(?!\p{L})|(?<!\p{L})هر\s+(?:دو|سه|چهار)(?!\p{L})/gu,' ');
const persianClause=value=>/[پچژگ]|(?<!\p{L})(?:است|هست|می|نمی|را|رو|برای|که|با|از|شما|خودتون|هزینه)(?!\p{L})/u.test(value);
// Immediacy («الان»، «فوری»، «همین حالا»، «هسه») in a policy clause is a dispatch/timing or
// stock claim; honest gaps («الان نمی‌دونم») were accepted before this check runs.
const immediacy=/(?<!\p{L})(?:الان|الآن|فوری|فورا|حالا|هسه|هسا|هسع|now|immediately|asap)(?!\p{L})/u;
const nowDisclaimer=/(?<!\p{L})(?:الان|فعلا|فعلاً|هسه|هسع|حالیا)\s*(?:\p{L}+\s+){0,2}?(?:نمی\p{L}*|ندارم|نداریم|ما\s*عندی|ماکو|ما\s*اعرف|ما\s*[انت]?(?:گدر|کدر))/gu;
const timeClaim=raw=>{const value=raw.replace(nowDisclaimer,' ');return time.test(value)||immediacy.test(value)||arabicMonth.test(value)&&!persianClause(value);};
function shippingFacts({authoritativeFacts=[],markets=[]}={}){
 const allowed=new Set(markets);
 return authoritativeFacts.filter(fact=>fact.category==='shipping'&&fact.source==='approved_knowledge'&&typeof fact.id==='string'&&fact.id&&Number.isSafeInteger(Number(fact.version))&&Number(fact.version)>0&&(!fact.status||fact.status==='active')&&(!fact.authority||fact.authority==='owner_approved')&&(fact.market==='GLOBAL'||allowed.has(fact.market))&&(!fact.entity_key||key(fact.entity_key)==='global'));
}
// «هزینه ارسال جداست» (the shipping cost is separate) is the same exclusion with the
// price left implicit.
function excludedFromPrice(text){const value=exclusionProse(text);return !/(?:خارج|جدا).{0,25}(?:نیست|نمی باشد)|(?:خارج|منفصله).{0,25}(?:مو|لیس)/u.test(value)&&(/(?:خارج|جدا|جداگانه|جداست|جدای|بیرون|برون)\s*(?:از)?.{0,16}(?:قیمت|حساب|پول)|(?:بره|برّه|بره\s*من|خارج\s*عن)\s*(?:ال)?(?:سعر|ثمن|حساب)|(?<!\p{L})(?:مو|ما|غیر|لیس|مش)\s*(?:داخل|ضمن|من\s*ضمن|محسوب\p{L}*)\s*(?:ب|في|فی)?\s*(?:ال)?(?:سعر|ثمن|حساب)|(?:داخل|جزو)\s*(?:ی\s*)?(?:قیمت|سعر)\s*(?:\p{L}+\s+){0,1}?(?:نیست|مو)(?!\p{L})|(?:منفصل|منفصله|خارج).{0,18}(?:سعر|ثمن)|not\s*included|separate\s*from/iu.test(value)||new RegExp(costNoun+'(?:\\s+\\S+){0,2}?\\s+(?:جداست|جداگانه\\s*است|جدا\\s*(?:است|هست))(?!\\p{L})','u').test(value));}
// Only connective/pronominal words are ignored. New business attributes, carriers,
// insurance or service promises cannot hide behind a matching payer proposition.
const policyWords=new Set(('همه همش همشون همگی کلها کلش کلهن ست است هسته یکون تکون یصیر تصیر واسه برا لل بیرون برون جدای بره مو داخل ضمن پول پولش خرج بردن خودتونه پای گردن برای ارسال به ابادان تهران این توضیحات رو در نظر بگیرید یعنی چون جزو شهرستان شهرستانها شهرستان ها حساب می شه میشه می شن میشن میشود میشوند می شود شوند میشند شرایطش اینطوره هزینه هزینهها هزینههای هزینهٔ کرایه حمل کارتن کارتنی کارتون انتقال بار تا باربری مقصد بر عهده مشتری مشتریه خودتونه خودتون شما با ما است هست هستش هستند جدا جداست جداگانه از قیمت خود جعبه جعبهها جعبه ها داخل بسته بندی انجام طبق سیاست ایران عراق مبلغ دقیق اینها الان بگم باید استعلام بشه معتبر لازم نیازمند و یا هم که برایتون براتون نمیتونم نمی تونم میتونم نیست مشخص نامشخص نیستند محاسبه محاسبهش کرد برعهده اطلاعات مربوط سوال شماست درخواستی اجور الشحن شحن علی الزبون زبون منفصله عن سعر العلبه علبه المبلغ مبلغ الدقیق دقیق یحتاج استعلام موثوق ما عندی بعدنا مو نعرف حالیا الی کرتون النقل شرکه نقل محافظات متحمل یتحمل هی خارج پرداخت کند').split(' '));
policyWords.add('را');
// Conversational forms of the same approved predicates (customer/third-person pay verbs,
// send/pack auxiliaries) and neutral nouns. First-person-plural pay verbs are absent and
// are independently detected as a business payer above.
const conversationalPolicyWords=new Set(('کنید کنین کنه کنن کنند کنیم پردازید پردازین بپردازید بپردازین پردازه پردازد میده میدهد میدن میدهند میدید میدین میدهید بدید بدین بدهید '+
 'فرستیم فرستن فرسته میره میرن تتحمل تتحمله تتحملها تتحملون تدفع تدفعه تدفعها تدفعون یدفع خریدار شهر استان شرکت محصول '+
 'رسوندن رساندن پول روال بخواید بخواین داشته باشید بدونید باشه یصیر تصیر یتحملها یتحمله نیاز داره').split(' '));
function understoodWords(value,source){
 // Approved source words are also known without their Arabic article/preposition
 // («للعنوان» → «عنوان»), so «لعنوانك» reuses the same approved noun.
 const sourceWords=source.split(' ').flatMap(word=>[word,...proclitics.filter(p=>word.startsWith(p)&&word.length-p.length>=3).map(p=>word.slice(p.length))]);
 const known=new Set([...policyWords,...conversationalPolicyWords,...sourceWords]);
 // Recognized place names are judged by the route-scope rules, not as vocabulary.
 // «(مثل) بقیه‌ی/سایر شهرستان‌ها» is a route phrase; «فقط اینو بدونید/بگم که» is discourse
 // ("just so you know"). A bare «فقط» elsewhere still narrows the claim and stays unknown.
 return wordsKnown(value.replace(/(?:مثل\s*)?(?:بقیه|سایر)\s*(?:ی\s*)?(?:شهرستان|شهر)\p{L}*(?:\s*ها)?/gu,' شهرستان ').replace(/(?<!\p{L})فقط\s*(?:اینو|این\s*رو|این\s*را)\s*(?:هم\s*)?(?:بدونید|بدانید|بگم|در\s*نظر\s*داشته\s*باشید)(?:\s*که)?/gu,' ').replace(addressTerms,' ').replace(new RegExp(iranRegional.source,'gu'),' ').replace(new RegExp(iraqPlaces.source,'gu'),' ').replace(/(?<!\p{L})تهران(?!\p{L})/gu,' ').replace(/\s+/g,' ').trim(),known);
}
// Route scope. The approved Iran policy splits Tehran from «شهرستان», i.e. every other city,
// so a named non-Tehran Iranian city is regional; Iraqi places are the Iraq route.
const iranRegional=/(?<!\p{L})(?:ابادان|خرمشهر|مشهد|اصفهان|شیراز|تبریز|کرج|قم|اهواز|کرمانشاه|رشت|یزد|کرمان|همدان|ارومیه|زاهدان|ساری|بندرعباس|بندر عباس|قزوین|کیش|گرگان|بوشهر|سنندج|گرگان|زنجان|اردبیل|بیرجند|سمنان|خرم اباد|خرماباد|یاسوج|شهرکرد|ایلام|بجنورد|دزفول|کاشان|نیشابور|سبزوار|قشم|چابهار)(?!\p{L})/u;
const regionalWords=/در\s*غیر\s*این\s*صورت|وگرنه|غیر\s*از\s*تهران|خارج\s*از\s*تهران|شهرستان|(?<!\p{L})استان|محافظات|شهر\s*(?:های|ها|ای)\s*(?:دیگه|دیگر)|(?:سایر|بقیه)\s*(?:ی\s*)?شهر/u;
const iraqPlaces=/(?<!\p{L})(?:[وفبل]|لل|بال|وال)?(?:ال)?(?:عراق|بغداد|بصره|نجف|کربلا|کربلاء|اربیل|موصل|سلیمانیه|دهوک|کرکوک|حله|ناصریه|عماره|دیوانیه|کوت|رمادی|فلوجه|سماوه|میسان|انبار|دیالی|واسط|ذیs*قار|تکریت|بعقوبه|سامراء|سامرا|زبیر|زاخو)(?!\p{L})/u;
// A single word that the routing classifier recognises as a place (Iranian city, Iraqi place, «شهرستان»).
export function isPlaceWord(word){return !/\s/u.test(String(word).trim())&&placeOf(String(word))!==null;}
function placeOf(value){
 const regional=regionalWords.test(value)||iranRegional.test(value);
 if(/تهران/u.test(value))return regional?'mixed':'tehran';
 return regional?'regional':iraqPlaces.test(value)?'iraq':null;
}
function sourceSupportsMethod(source,method,place,raw=source){
 const sourceMethods=methodPatterns.filter(([,pattern])=>pattern.test(source)).map(([name])=>name);
 if(!sourceMethods.includes(method))return false;
 // Polarity is read per clause of the raw approved text: a negation in a neighbouring
 // clause («…شركة الشحن، … لا يُذكر مبلغ») does not negate this method. A method needs at
 // least one non-negated source clause that names it.
 const pattern=methodPatterns.find(([name])=>name===method)?.[1];
 if(!String(raw).split(/[.!؟?؛;\n،,]+/u).map(key).some(clause=>pattern.test(clause)&&!/(?<!\p{L})(?:نمی\p{L}*|ندار\p{L}*|نیست|نباید|لا|لیس\p{L}*|مو|ما\s*عدنا)(?!\p{L})/u.test(clause)))return false;
 if(method==='snap'||method==='van')return place==='tehran'&&/تهران.{0,55}(?:اسنپ|وانت)/u.test(source);
 if(method==='freight')return place==='regional'&&/شهرستان.{0,65}باربری/u.test(source)||place==='regional'&&/محافظات.{0,65}(?:شرکه|نقل|شحن)/u.test(source)||place==='iraq'&&/عراق.{0,40}شرکه\s*(?:نقل|شحن)|شرکه\s*(?:نقل|شحن).{0,40}عراق/u.test(source);
 // Other methods need their own explicit regional evidence, never generic overlap.
 return place==='regional'&&/شهرستان|محافظات/u.test(source)&&!/(?:تهران|بغداد)/u.test(source);
}
// «نه متاسفانه،», «لا عيوني،», «بصراحة لا،» answer the customer's question; they do not negate the following clause.
// «فقط/حتماً در جریان باشید که», «بله حتماً» are discourse openers, not guarantees.
function shippingDiscourse(text){
 return String(text).replace(/^(?:[^،,.!؟?\n]{0,25}?[\p{So}\p{Sk}،,!]\s*)?(?:(?:بصراحه|بصراحة|راستش|والله)\s+)?(?:نه|لا|نخیر|na|no)(?:\s+\p{L}+)?\s*[،,!:]\s*/u,'')
  .replace(/(?<!\p{L})(?:فقط|حتما|حتماً|لطفا|لطفاً)\s*(?:در\s*جریان\s*باشی(?:د|ن)|در\s*نظر\s*داشته\s*باشی(?:د|ن)|بدونی(?:د|ن)|بدون|اینو\s*بدونی(?:د|ن)|توجه\s*داشته\s*باشی(?:د|ن))(?:\s*که)?/gu,' ')
  .replace(/^[\s\p{So}\p{Sk}]*(?:بله|آره|اره|ای|إي|نعم|ایه)\s+(?:حتما|حتماً|البته|اکید|أكيد|اكيد|طبعا|طبعاً)\s*[،,!]?\s*/u,'')
  // cv58: «الزبون يوصلك / زبائنك يوصلولك» = the customer CONTACTS you (a person reaching the shop owner), not a shipment arriving.
  .replace(/(?<!\p{L})((?:ال)?(?:زبون|زبائن|زباین|زباين|عمیل|عميل|عملاء|ناس|مشتری|مشتري)\p{L}*)\s+(?:ی|ي|ت)وصل(?:ون|و)?(?:ک|ك|کم|كم|ج|لک|لك|لکم|لكم|لج)(?!\p{L})/gu,'$1 يتواصل وياك');
}
export function shippingClaimAssessment(text,options={}){
 text=shippingDiscourse(maskPropositionScopes(text));
 // Iraqi «وانت» is «and you» («وانت تختار»), not the Persian pickup van; only a Persian clause can name the van.
 const value=persianClause(key(text))?key(text):key(text).replace(/(?<!\p{L})وانت(?!\p{L})/gu,'و انت');
 // Draft-local route scope: callers pass one context object per reply, so a clause
 // inherits the place most recently stated earlier in that same reply (for example a
 // packing sentence right after «آبادان جزو شهرستان‌هاست»). A clause's own place wins.
 if(!shipping.test(value)&&!charge.test(value)){const own=placeOf(value);
  // «آبادان هم همین‌طوره» after a route claim re-asserts THAT route for a new place.
  if(own&&options.context?.methodPlace&&/همین\s*طور|همینطور|به\s*همین\s*شکل|کذلک|نفس\s*الشی/u.test(value)&&own!==options.context.methodPlace)return {applicable:true,valid:false,kind:'unsupported_assertion',reason:'route_anaphora_mismatch'};
  if(options.context&&own)options.context.place=own;return {applicable:false,valid:true};}
 // «هزینه چاپ، طراحی و کلیشه رایگانه» prices a production service, not freight: it is grounded by the
 // product/service validators against the approved included-services fact. Any freight word keeps it here.
 // Whole words only: «چاپار» is a courier, not printing.
 if(!shipping.test(value)&&/(?<!\p{L})(?:چاپ(?:ش|ی|ها)?|طراحی\p{L}{0,2}|کلیشه\p{L}{0,2}|(?:ال)?طباع\p{L}*|(?:وال|ال|و)?تصمیم|(?:وال|ال|و)?کلیش\p{L}*|لوگو\p{L}*|(?:ال)?شعار\p{L}*|\p{L}*کوب|(?:ال)?(?:ذهبی|فضی|اسود)\p{L}*)(?!\p{L})/u.test(value)&&!carrierLexicon.test(value)&&!vehicleMeans.test(value)&&(!charge.test(value)&&!/رایگان|مجان|ببلاش|بلاش|free/u.test(value)||productionServiceOnly(text)))return {applicable:false,valid:true};
 // Requesting a logo/photo upload is not a freight-policy assertion. Return it to
 // the ordinary product/prose validators rather than exempting its other claims.
 if(!charge.test(value)&&/فایل|عکس|تصویر|لوگو|صوره|شعار|تصمیم|(?:ال)?اسم|الموقع|موقع|hamzehibox/u.test(value)&&/بفرستید|بفرستین|ارسال\s*کنید|ارسل|دز|ترسل\p{L}*|ابعث\p{L}*/u.test(value)&&!/باربری|وانت|اسنپ|تیپاکس|پست|شحن|حمل/u.test(value))return {applicable:false,valid:true};
 const fail=reason=>({applicable:true,valid:false,kind:'unsupported_assertion',reason});
 // A question is non-assertive only when it carries no commercial content: an OFFER phrased as
 // a question («با تیپاکس بفرستیم؟», «کرایه رو ما حساب کنیم؟») is still a commitment.
 if(/[؟?]\s*$/u.test(String(text))&&!prohibited.test(value)&&!guarantee.test(value)&&!timeClaim(value)&&!outcomeCommitment(text)&&!sentenceRisk(text,text)&&!payerOf(value)&&!businessPays(value)&&!/حساب\s*(?:می\s*)?کنیم|نتحمل|ندفع|علینا/u.test(value)&&!methodPatterns.some(([,pattern])=>pattern.test(value))&&!carrierLexicon.test(value)&&!vehicleMeans.test(value)&&!discountEuphemism.test(value)&&!/(?:دم|جلوی|درب|در)\s*(?:ی\s*)?(?:خونه|منزل|مغازه)|لبیت|لباب|لعند/u.test(value))return {applicable:false,valid:true};
 // The whole clause is judged first, so a list of costs sharing ONE predicate
 // («هزینه‌ی کارتن، انتقال بار و کرایه‌ی باربری … با خودتونه») is not cut into
 // predicate-less fragments. Only if the whole clause fails is it split into
 // propositions, each of which must then stand on its own; every check still runs on
 // each unit, so the split never relaxes anything.
 const saved=options.context?{...options.context}:null;
 const whole=singleShippingClause(text,value,options,fail);
 if(whole.valid)return whole;
 // Hierarchical: sentence boundaries first (each sentence recurses whole-first); only a
 // single sentence is split at «و» before a new route/cost proposition.
 const sentences=String(text).split(/[.!؟?؛;\n]+/u).map(part=>part.trim()).filter(Boolean);
 const propositions=sentences.length>1?sentences:String(text).split(/[،,]\s*(?=و)|[،,]\s*(?=(?:برای\s*|به\s*)?(?:شهرستان|تهران|بقیه|سایر))|\s+و\s+(?=(?:(?:برای|در|به)\s*)?(?:تهران|شهرستان|ابادان)|(?:ارسال|حمل)\s+(?:تهران|شهرستان)|هزینه|کرایه|اجور)|(?<!(?:أجور|اجور|كلفة|مصاريف)\s+\p{L}+)\s+(?=و(?:ال)?(?:أجور|اجور|أجوره|اجوره|كلفة|کلفه|كلفته|مصاريف|برّا|برا|بره|خارج)(?!\p{L}))/u).map(part=>part.trim()).filter(Boolean);
 if(propositions.length<2)return whole;
 if(options.context){for(const name of Object.keys(options.context))delete options.context[name];Object.assign(options.context,saved);}
 const checked=propositions.map(part=>shippingClaimAssessment(part,options));
 // A non-shipping part is allowed only when it is a complete honest knowledge gap.
 if(checked.some((part,index)=>!part.applicable&&!honestInformationGap(propositions[index])))return fail('mixed_shipping_claim_requires_separate_validation');
 const invalid=checked.find(part=>!part.valid);if(invalid)return invalid;
 return {applicable:true,valid:true,kind:'approved_fact',sources:checked.flatMap(part=>part.sources||[])};
}
function singleShippingClause(text,rawValue,options,fail){
 // «این هزینه‌ها رایگان حساب نمی‌شه» (these costs are not free) restates the approved
 // payer; a positive «رایگان» is still a prohibited financial claim below.
 // A leading answer particle («نه،» «بله،» «إي،») answers the customer's question; it is
 // not part of the proposition. Any other «نه» stays a negation below.
 const answered=/^\s*(?:نه|بله|اره|آره|ای|إي|اي|نعم|لا)\s*[،,!.؛:]/u.test(String(text));
 const value=(answered?rawValue.replace(/^(?:نه|بله|اره|ای|نعم|لا)\s+/u,''):rawValue)
  .replace(/(?<!\p{L})رایگان\s*(?:حساب\s*)?(?:نمی\s*شه|نمیشه|نمی\s*شود|نمیشود|نیست|نیستن)(?!\p{L})/gu,'بر عهده مشتری است')
  .replace(/(?<!\p{L})(?:مو|مش|لیس|غیر)\s*(?:ب)?(?:بلاش|ببلاش|مجانی|مجانا|مجانیه|مجان)(?!\p{L})/gu,'علی الزبون')
  // Only the passive general «… فرستاده می‌شه» (is sent) is the policy's method predicate;
  // «فرستاده است / شد» (has been sent) stays unknown and is rejected.
  .replace(/(?<!\p{L})فرستاده\s*(?:می\s*)?(?:شه|شن|میشه|میشن|شود|میشود)(?!\p{L})/gu,'ارسال میشود');
 if(prohibited.test(value))return fail('unsupported_shipping_financial_claim');
 if(honestInformationGap(value))return {applicable:true,valid:true,kind:'explicit_uncertainty',sources:[]};
 const facts=shippingFacts(options);
 // An approved NON-guarantee («لا يُضمن التسليم المباشر … دون مستند») may be repeated in
 // negated form («ما مضمون», «ما أگدر أضمنلك»). Any positive guarantee still fails.
 const approvedNonGuarantee=facts.some(fact=>/(?:لا|مو|غیر)\s*یضمن|تضمین\s*نمی/u.test(key((fact.values||[]).join(' '))));
 const nonGuarantee=/(?<!\p{L})(?:و?(?:ما|مو|لا|غیر)\s*(?:[انت]?(?:گدر|کدر|قدر)\s*)?|و?من(?:گدر|کدر)\s*)(?:مضمون\p{L}*|ین?ضمن\p{L}*|تن?ضمن\p{L}*|اضمن\p{L}*|نضمن\p{L}*)(?!\p{L})/gu;
 const statesNonGuarantee=approvedNonGuarantee&&nonGuarantee.test(value);
 const checkedValue=statesNonGuarantee?value.replace(nonGuarantee,' ').replace(/(?<!\p{L})(?:ب)?دون\s*مستند(?!\p{L})/gu,' ').replace(/\s+/g,' ').trim():value;
 if(guarantee.test(checkedValue)||timeClaim(checkedValue))return fail('unsupported_shipping_commitment');
 const semanticValue=exclusionProse(checkedValue);
 const negation=/(?<!\p{L})(?:نیست|نیستن|نباید|منتفی|نمی\p{L}*|ندار\p{L}*|بدون|نه|لا|مو|لیس\p{L}*|not|never)(?!\p{L})/u;
 const uncertain=gap.test(semanticValue)||uncertaintyFrame.test(semanticValue)||uncertainSpeech.test(semanticValue);
 const riskKind=riskField(String(text),semanticValue,uncertain);if(riskKind)return fail(riskKind);
 // Negation contradicts policy only when it attaches to an approved proposition; inside an
 // honest-unknown frame («بدون استعلام نمی‌تونم بگم») it is not a contradiction.
 const propositionNegated=/(?:عهده|با|گردن|پای|علی|حساب)\s*(?:\p{L}+\s+){0,2}?(?:مشتری|خودتون|شما|زبون|الزبون)\s*(?:\p{L}+\s+){0,1}?(?:نیست|نمی|نه|مو|لیس)|(?:نیست|نمی\p{L}*|نه|مو|لیس|لا)\s*(?:\p{L}+\s+){0,2}?(?:عهده|علی|با)\s*(?:\p{L}+\s+){0,1}?(?:مشتری|خودتون|شما|زبون|الزبون)|(?:باربری|اسنپ|وانت|کارتن|شرکه)\s*(?:\p{L}+\s+){0,3}?(?:نمی\p{L}*|نیست|نداریم|مو)/u.test(semanticValue);
 if(negation.test(semanticValue)&&(propositionNegated||!uncertain))return fail('shipping_policy_contradiction');
 if(uncertain&&!payerOf(semanticValue)&&!methodPatterns.some(([,pattern])=>pattern.test(semanticValue))&&!excludedFromPrice(semanticValue)){
  if(!hedgeCovers(text,options))return fail('hedge_does_not_cover_other_claims');
  return {applicable:true,valid:true,kind:'explicit_uncertainty',sources:[]};
 }
 // Iraqi «ما» negates a following verb/preposition («ما على الزبون», «ما تدفع»), while
 // Persian «ما» means "we"; only a non-Persian clause reads it as negation. Honest
 // knowledge gaps («ما أعرف») were already accepted above.
 if(!persianClause(semanticValue)&&/(?<!\p{L})(?:ما|مش|ماکو|مافی)(?!\p{L})/u.test(semanticValue))return fail('shipping_policy_contradiction');
 if(!facts.length)return fail('shipping_policy_not_verified');
 if(includedInPrice(semanticValue)&&!facts.some(fact=>includedInPrice(exclusionProse(key((fact.values||[]).join(' '))))))return fail('shipping_price_inclusion_contradiction');
 // These introductions/questions assert no business capability. An assertion
 // followed by a question cannot use this exemption.
 if(/^(?:برای ارسال به (?:ابادان|تهران) (?:این )?توضیحات رو در نظر بگیرید|این توضیحات رو در نظر بگیرید)$/u.test(value))return {applicable:true,valid:true,kind:'neutral_context',sources:[]};
 // «… هم همین‌طور» (likewise) refers to the payer stated earlier in this reply.
 let payer=payerOf(value);
 if(!payer&&options.context?.payer&&/همین\s*طور|به\s*همین\s*شکل|کذلک|نفس\s*الشی/u.test(value))payer=options.context.payer;
 if(payer==='conflicting')return fail('conflicting_shipping_payer');
 // A method claim is a means of delivery («با باربری», «عن طريق شركة نقل»). The same words
 // inside a COST phrase of the approved policy («انتقال بار تا باربری», «کرایه‌ی باربری»،
 // «النقل لشركة الشحن») name a cost, not a route, and do not need a route in scope.
 const methodValue=value.replace(/(?<!\p{L})(?:هزینه|کرایه)(?:\s*های?)?\s+(?:کارتن|کارتون|بسته\s*بندی)\s+و\s+باربری(?!\p{L})/gu,' ').replace(/(?<!\p{L})(?:تا|کرایه|حمل|هزینه|انتقال\s*(?:بار\s*)?(?:به|تا))\s+باربری(?!\p{L})/gu,' ').replace(/(?:ال)?نقل\s*(?:ل|الی\s*)(?:ال)?شرکه\s*(?:ال)?شحن|(?<!\p{L})(?:لشرکه|للشرکه)(?:\s*(?:ال)?شحن)?/gu,' ');
 const methods=methodPatterns.filter(([,pattern])=>pattern.test(methodValue)).map(([name])=>name);
 const abadan=/ابادان/u.test(value);
 // A country outside the conversation market is allowed only when an in-scope approved
 // source itself names it («في إيران والعراق …»).
 const sourceNames=country=>facts.some(fact=>country.test(key((fact.values||[]).join(' '))));
 if(/عراق/u.test(value)&&!options.markets?.includes('ARAB')&&!sourceNames(/عراق/u)||/ایران/u.test(value)&&!options.markets?.includes('IRAN')&&!sourceNames(/ایران/u))return fail('shipping_market_scope_mismatch');
 const outside=options.markets?.includes('IRAN')?['بغداد','اربیل','کربلا','نجف','بصره'].filter(city=>value.includes(city)):options.markets?.includes('ARAB')?['تهران','ابادان'].filter(city=>value.includes(city)):[];
 if(outside.some(city=>!facts.some(fact=>(fact.values||[]).some(v=>key(v).includes(city)))))return fail('shipping_destination_outside_market');
 // Own place, else the place inherited earlier in this reply, else the customer's stated
 // destination, else (Iraq market only) the Iraq route itself. Tehran together with a
 // regional place in one clause stays ambiguous.
 const destinationKey=options.destination?key(options.destination):null;
 const tehranAlias=/(?<!\p{L})(?:تهران|طهران|tehran|teheran|ونک|پاسداران|سعادت\s*اباد|نیاوران|تجریش|شهرک\s*غرب|پونک|نارمک|پیروزی|افسریه|اکباتان)(?!\p{L})/iu;
 const destinationLooksLikeCity=destinationKey&&!/\s/u.test(destinationKey.trim())&&/^\p{L}{3,}$/u.test(destinationKey.trim());
 const destinationPlaceEarly=destinationKey?(tehranAlias.test(destinationKey)?'tehran':placeOf(destinationKey)||(options.markets?.includes('ARAB')&&!options.markets?.includes('IRAN')?'iraq':null)):null;
 const ownPlace=(tehranAlias.test(value)&&!placeOf(value)?'tehran':placeOf(value))||(destinationLooksLikeCity&&!tehranAlias.test(destinationKey)&&options.markets?.includes('IRAN')&&value.includes(destinationKey)?'regional':null),inherited=options.context?.place;
 if(options.context&&ownPlace)options.context.place=ownPlace;
 if(ownPlace==='mixed')return fail('ambiguous_shipping_route_scope');
 const destinationPlace=destinationPlaceEarly;
 const marketPlace=options.markets?.includes('ARAB')&&!options.markets?.includes('IRAN')?'iraq':null;
 // A method sentence without its own place («ارسال شما با اسنپ انجام میشه») must not borrow
 // an earlier place that contradicts the customer's own stated destination.
 if(!ownPlace&&methods.length&&inherited&&inherited!=='mixed'&&destinationPlace&&destinationPlace!=='mixed'&&inherited!==destinationPlace)return fail('route_conflicts_with_customer_destination');
 const place=ownPlace||(inherited!=='mixed'&&inherited)||(destinationPlace!=='mixed'&&destinationPlace)||marketPlace||null;
 if(options.context&&methods.length&&place)options.context.methodPlace=place;
 for(const fact of facts){
  const source=key((fact.values||[]).join(' '));
  if(payer&&payerOf(source)!==payer)continue;
  if(excludedFromPrice(value)&&!excludedFromPrice(source))continue;
  // Clause polarity is read from the original approved text when the caller kept it
  // (normalized values have no punctuation); otherwise the whole text is one clause.
  if(methods.length&&methods.some(method=>!sourceSupportsMethod(source,method,place,typeof fact.raw_text==='string'?fact.raw_text:(fact.values||[]).join('\n'))))continue;
  if(/کارتن|کارتون|کرتون|کارتنی/u.test(value)&&!/کارتن|کارتون|کرتون|کارتنی/u.test(source))continue;
  // «the exact amount needs a valid quote» in any wording («فقط بعد از استعلام معتبر می‌شه گفت», «يحتاج تسعيرة»)
  // restates the approved amount-unknown proposition when the record itself says so; a figure never does.
  // It must speak about the EXACT amount and change nothing («از قیمت کم میشه» is a price claim, not a deferral).
  const deferred=charge.test(value)&&/استعلام|تسعیر\p{L}*|موثق|معتبر|عرض\s*سعر|quote/u.test(value)&&/مبلغ|رقم|عدد|دقیق|بالضبط|مقدار/u.test(value)&&!/(?<!\p{L})(?:کم|کمتر|کسر|تخفیف|خصم|ینقص|نقص|اقل|ارخص|ارزون\p{L}*|زیاد|بیشتر|اکثر|اضافه|برگشت|یرجع|refund)(?!\p{L})/u.test(value)&&!/[0-9۰-۹٠-٩]/u.test(value)&&/استعلام|موثق/u.test(source);
  const inquiry=gap.test(value)&&charge.test(value)||deferred;
  // There must be a recognized proposition, not merely a matching category.
  // Route classification («شیراز جزو شهرستان‌هاست») is the policy's own Tehran/شهرستان split.
  const classification=(abadan||iranRegional.test(value))&&/(?:جزو|جز)\s*(?:ی\s*)?شهرستان|شهرستان\s*(?:ها\s*)?(?:حساب|محسوب)|شهرستانی/u.test(value);
  // Carton packaging restated on its own is the approved record's packaging proposition (cv53).
  const packaging=/(?:بسته\s*بندی|کارتن\s*بندی|کارتنی|کارتن\s*(?:می\s*)?کنیم|بالکرتون|بکرتون)/u.test(value)&&/کارتنی|کارتن|کرتون|کارتون/u.test(source)&&!/[0-9]/u.test(value);
  const recognized=!!payer||methods.length>0||inquiry||excludedFromPrice(value)||classification||statesNonGuarantee||packaging;
  if(!recognized)continue;
  // An operational action outside the approved method/payer propositions remains
  // blocked even when a shipping fact exists.
  if(/ثبت|تایید سفارش|بیمه|جبران|مسوولیت خسارت|بیمه|insured|refund|compensation/u.test(value))continue;
  if(options.context&&payer)options.context.payer=payer;
  return {applicable:true,valid:true,kind:'approved_fact',sources:[{id:fact.id||null,version:fact.version||null,market:fact.market}],propositions:{payer,methods,excluded_from_price:excludedFromPrice(value),amount_unknown:inquiry}};
 }
 return {...fail('unsupported_shipping_policy_claim'),unsupported_values:value.split(' ').filter(word=>!policyWords.has(word)&&!facts.some(fact=>key((fact.values||[]).join(' ')).split(' ').includes(word))).slice(0,8)};
}
// Shared with the product-attribute check: a reply word is known when it is an approved source word
// (after Arabic proclitics/article and Persian/Arabic endings are removed) or a discourse/function word.
export function shippingLexiconWord(word){return !/^(?:معتبر|مطمئن|امن|سریع|بهترین|موثوق|زین|امین)$/u.test(word)&&(policyWords.has(word)||conversationalPolicyWords.has(word));}
export function wordKnownIn(word,set){return knownWord(word,set)||conversationalPolicyWords.has(word);}
// Diagnostic only (tests/tools): the words a candidate disclaimer leaves after its marker phrases are removed.
export function nonCommittalResidue(text){const value=key(text);const markers=[knowledgeDisclaimer,promiseDisclaimer,ownerDecidesPresent,ownerDecidesVerbFirst,ownerDefers];return value.split(contrast).map(part=>{let rest=part;for(const re of markers)rest=rest.replace(new RegExp(re.source,'gu'),' ');return {marker:markers.map(re=>re.test(part)),blocked:rest.split(/\s+/u).filter(Boolean).filter(word=>!disclaimerWordAllowed(word))};});}
