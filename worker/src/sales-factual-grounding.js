// Conservative evidence scope for descriptive product claims. No I/O or commercial authority.
import {conversationKey} from './sales-conversation-author.js';
import {typedSpecifications} from './sales-reply-integrity.js';
import {isPlaceWord,shippingLexiconWord,shippingClaimAssessment,honestInformationGap,shippingSubParts,wordKnownIn,productionServiceOnly,nonCommittalClause,committalPortion,committalPortionLegacy} from './sales-shipping-grounding.js';
import {splitSalesReply,serviceQuestionField} from './sales-reply-composition.js';
import {maskPropositionScopes} from './sales-proposition-scope.js';
// Each punctuation/emoji-delimited piece carrying a no-charge word must be a production service only, and no later piece may extend
// it elliptically («الطباعة مجانية، والعلبة هم») (cv43c).
function freeClaimPiecesAreServices(sentence){
 const freeWord=/(?<!\p{L})(?:رایگان\p{L}*|مجان\p{L}*|ببلاش|بلاش|free)(?!\p{L})|بدون\s*(?:هیچ\s*)?(?:هزینه|کلفه|مقابل)/u;
 const pieces=String(sentence).split(/[،,؛;:!.؟?\p{Extended_Pictographic}]/u).map(p=>p.trim()).filter(Boolean);
 const idx=pieces.map((p,i)=>freeWord.test(normal(p))?i:-1).filter(i=>i>=0);
 if(!idx.length)return false;
 if(!idx.every(i=>productionServiceOnly(pieces[i])))return false;
 return !pieces.slice(idx[0]+1).some(p=>/(?<!\p{L})(?:هم|همینطور|همین\s*طور|همچنین|کذلک|ایضا|برضو|بعد|also|too)(?!\p{L})/u.test(normal(p))&&!productionServiceOnly(p));
}
// Colour VARIETY of print (cv46): «رنگ‌های مختلف/دلخواه», «رنگارنگ», «هر/همه/کل رنگ», «الألوان اللي تحبها», «بكل الالوان» in a
// printing sentence asserts multi-colour printing; the approved print colours are the foil set only. A denial is not a claim.
function multiColourPrint(part){
 const v=normal(part);
 const variety=/(?:رنگ|لون|الوان|رنگا)\p{L}*\s+(?:\p{L}+\s+){0,1}?(?:مختلف\p{L}*|متنوع\p{L}*|دلخواه\p{L}*|جورواجور|جور\s+واجور|متعدد\p{L}*|اللی\s+(?:ت|ی)?(?:حب|رید|عجب)\p{L}*|الی\s+(?:ت|ی)?(?:حب|رید|عجب)\p{L}*|حسب\s+(?:طلب|رغب)\p{L}*)|رنگا\s*رنگ|رنگارنگ|(?<!\p{L})(?:هر|همه|کل|بکل|بجمیع|جمیع)\s+(?:ی\s+)?(?:رنگ|لون|الوان)\p{L}*|چند\s*رنگ\p{L}*|چندرنگ\p{L}*|(?:متعدد|عده)\s+(?:ال)?الوان/u;
 return variety.test(v)&&!denial(v);
}
// Look-and-feel opinion words (cv48): style/mood, never quality, durability, material or capability.
function aestheticOpinionWord(w){
 const b=w.replace(/^(?:با|بال|ال|و)(?=\p{L}{3})/u,'').replace(/(?:ترین|تره|تر|یه|ه|ی|ای|ن|ین)$/u,'');
 return /^(?:کلاسیک|رسمی|رسم|شیک|آرام|ارام|خاص|گرم|سرد|شاد|ملایم|کلاس|دلنشین|مدرن|ساده|جذاب|قشنگ|زیبا|دخترون|پسرون|زنون|مردون|اسپرت|لطیف|چشمگیر|کلاسیکی|انیق|راقی|هادی|هادئ|ناعم|مرتب|حلو|ممیز|فخم|کلاسیکیه)$/u.test(b);
}
const normal=value=>conversationKey(value).replace(/\p{L}{33,}/gu,m=>m.slice(0,32)).replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim().split(' ').map(word=>word.length>4&&word.startsWith('ال')?word.slice(2):word).join(' ');
const includes=(text,term)=>(' '+normal(text)+' ').includes(' '+normal(term)+' ');
const entityOf=fact=>fact.entity_key||fact.collection?.split('|')[0]||null;
const modelLike=value=>/کشویی|تکه|تیکه|جرار|قطعتین|قطع|drawer|piece/u.test(normal(value));
export function claimEntities(text,options={}){
 const {facts=[],catalog=[],selectedProductKey=null}=options;
 const models=options._index?.models||[...new Set([...catalog.flatMap(c=>c.models||c.variants?.map(v=>v.configuration)||[]),...facts.map(entityOf).filter(value=>value&&modelLike(value))])];
 const products=options._index?.products||[...new Set([...catalog.map(c=>c.product),...facts.map(entityOf)].filter(value=>value&&normal(value)!=='global'))];
 const subjectKey=value=>normal(value).replace(/^مدل\s+/u,'');
 // "مدل کشویی" is a parent of "کشویی بگ‌دار", not a second product claim.
 const specific=list=>list.filter(name=>!list.some(other=>other!==name&&(subjectKey(other).length>subjectKey(name).length&&includes(subjectKey(other),subjectKey(name))||subjectKey(other)===subjectKey(name)&&normal(other).length<normal(name).length)));
 const found=specific(models.filter(name=>includes(text,name)));
 if(found.length)return found;
 const families=specific(products.filter(name=>includes(text,name)));if(families.length)return families;
 // A pronoun followed by an indefinite predicate continues the established
 // subject ("این مدل یه بگ ... داره"); it does not name a new model.
 if(/(?<!\p{L})(?:این|همین|آن|اون|هذا|هذه)\s+(?:مدل|جعبه|علبه|مودیل)\s+(?:یه|یک)(?!\p{L})/u.test(normal(text)))return [];
 if(/(?<!\p{L})(?:این|همین|ان|اون|هذا|هذه)\s+(?:مدل|جعبه|علبه|مودیل)\s+(?:احتمالا|ممکنه|می\s*تونه|می\s*تواند|برای|از نظر|گزینه|انتخاب)(?!\p{L})/u.test(normal(text)))return [];
 const explicit=normal(text).match(/(?:^|\s)(?:جعبه|مدل|علبه|مودیل)\s+(.+?)(?=\s+(?:از|با|دارای|دارد|داره|ساخته|بسته|باز|موجود|مصنوع|مجهز)|$)/u)?.[1];
 if(explicit&&!/^(?:از|با|دارای|ساخته|بسته|باز)(?:\s|$)/u.test(explicit))return [explicit];
 const selected=catalog.find(c=>c.key===selectedProductKey);return selected?[selected.product]:[];
}
export function factAppliesToEntity(fact,entity,options={}){
 const {catalog=[],facts=[]}=options;
 const own=entityOf(fact),scope=normal(own).replace(/^مدل\s+/u,'');if(own&&scope!=='global')return scope===normal(entity).replace(/^مدل\s+/u,'')||scope==='کشویی'&&normal(entity).startsWith('کشویی ')||fact.category==='availability'&&catalog.some(entry=>normal(entry.product)===scope&&(entry.models||[]).some(model=>normal(model)===normal(entity)))&&(fact.values||[]).some(value=>includes(value,entity));
 // A GLOBAL record that explicitly names a model is not a capability of all other models.
 const names=options._index?.models||[...new Set([...catalog.flatMap(c=>c.models||c.variants?.map(v=>v.configuration)||[]),...facts.map(entityOf).filter(value=>value&&modelLike(value))])];
 let named=options._index?.factModels.get(fact);
 if(!named){named=names.filter(name=>(fact.values||[]).some(value=>includes(value,name)));options._index?.factModels.set(fact,named);}
 return !named.length||named.some(name=>normal(name)===normal(entity));
}
const stop=new Set(('این آن اون همین مدل جعبه علبه برای در از به با و یا روی رو را هم نیز یک که است هست هستند باشد داره دارد داریم دارند داری می شود شده میشود میشه شده میتونید تونید توانید توانیم میتواند میتونه میشه انجام داد دادیم میدیم امکان امکانش پذیر قابلیت قابل ساخته بسته باز جنس بدنه مشتری خودش انتخاب کند میتوانید دارای شامل کنار بخش قسمت های ها ی مثلا مثل فقط علاوه بر بهش بهمون شما میتونیم میزنیم کرد کنید میکنیم کنیم میشه شده هر خودش خودشون مدلهای سایز اندازه ابعاد موجود موجوده متوفر متوفره موجوداست هذا هذه های فی من علی و او مع عندنا عدنا یمکن تگدر تکدر یصیر متاح مصنوع مزود یحتوی یمکنک نطبع نسوی علیها به بیها کدام چه اطلاعات تاییدشده ثبت شده فهرست فعلی دقیق').split(' '));
const risky=/اهن\s*ربا\p{L}*|متین\p{L}*|ضد\s*(?:ال)?(?:ماء|مای|رطوب\p{L}*|بلل)|ضد\s*اب|ضداب|اهنربا|مگنت|فوم|ریل|قفل|محافظ|مقاوم|ضربه|نفوذ|مغناطیس|مغناطیسی|اسفنج|حمایه|حمایة|مقاومه|عازل|سکه|سکک|waterproof|magnet\w*|foam|rails?|protect\w*|durab\w*/giu;
const affirmative=/(?<!\p{L})(?:است|هست|هستند|دارد|دارند|داره|داریم|دارای|موجوده|مناسبه|مناسب|تایید\s*شده|می\s*(?:شود|شه|شوند|تونه|تواند|تونیم|زنیم|کنیم)|یمکن|یناسب|ینفتح|تنفتح|یفتح|تفتح|ینغلق|تنغلق|مناسبه|مجهز|مصنوع|مزود|یحتوی|بیها|بیهه|عدنا|متوفر|موجود|has|have|is|are|supports?|fits?|suitable)(?!\p{L})/iu;
const gap=/(?:اطلاعات|توضیح|شرح|جزئیات|مکانیزم|معلومات|تفاصیل).*(?:ندارم|کافی ندار|کامل نیست|کامل ندار|مو واضح|مو کامله|ما عندی|نیست)|ما عندی.{0,30}(?:معلومات|تفاصیل|شرح)|(?:مناسب|قیاس|ابعاد|اندازه).*(?:مشخص|معلوم|روشن|تاییدشده) نیست|(?:مو|ما) متاکد\p{L}*.*(?:قیاس|یناسب)/u;
const uncertainFitFrame=value=>!affirmative.test(value.replace(/(?<!\p{L})(?:یناسب|مناسبه|مناسب)(?!\p{L})/gu,' '))&&(/^(?:مناسب بودن|قیاس|ابعاد|اندازه).*(?:مشخص|معلوم|روشن|تاییدشده) نیست$/u.test(value)||/^(?:(?:بس|بعدنا|هنوز)\s+)*(?:مو|ما) متاکد\p{L}*.*(?:قیاس|یناسب)/u.test(value));
const negativeFeature=value=>/(?:ندارد|ندارن|نداره|نیست|نمی\s*(?:شه|شود|تونه|توان)|ما\s*(?:تگدر|تکدر|یمکن|بیها|عدنا)|مو\s*(?:متوفر|موجود)|لا\s*یمکن)/u.test(normal(value));
function assertionClauses(text,options={}){
 return String(text||'').split(/(?<=[.!؟?؛;\n])\s+|\s+(?:ولی|اما|لکن|و?لكن(?:ها|ه|هم|هن)?|بس)\s+/u).flatMap(sentence=>{
  const clauses=[];
  for(const part of sentence.split(/[،,]/u)){
   const value=normal(part);
   // List continuations inherit their preceding predicate. Splitting "می‌شه طرح،
   // اطلاعات یا پترن ... چاپ کرد" must not hide an unsupported printing method.
   const separateQuestion=/[؟?]\s*$|^(?:چه|کدام|کدوم|چند|آیا|هل|شنو|كم|what|which|how)(?!\p{L})/iu.test(part.trim());
   const separateSubject=claimEntities(part,{...options,selectedProductKey:null}).length>0;
   const precedingGap=clauses.length&&gap.test(normal(clauses[clauses.length-1]));
   if(clauses.length&&!precedingGap&&!separateQuestion&&!separateSubject&&!affirmative.test(value)&&!negativeFeature(value)&&!gap.test(value))clauses[clauses.length-1]+='، '+part;
   else clauses.push(part);
  }
  return clauses;
 }).flatMap(clause=>{
  // Split a coordinated disclaimer/assertion, not ordinary lists of attributes.
  // A knowledge gap never exempts an independently asserted feature beside it.
  const parts=normal(clause).split(/\s+و\s*/u);
  return parts.length>1&&parts.some(part=>gap.test(part))&&parts.some(part=>!gap.test(part)&&(affirmative.test(part)||negativeFeature(part)))?parts:[clause];
 });
}
const epistemicAssertion=value=>value.replace(/((?:اطلاعات|جزئیات|معلومات|تفاصیل))\s+تایید\s*شده/gu,'$1').replace(/(رنگ(?: های)?|رنگهای)\s+موجود/gu,'$1');
export function isExclusiveKnowledgeGap(text){
 const clauses=assertionClauses(text);
 return clauses.length>0&&clauses.every(clause=>{const value=normal(clause);return gap.test(value)&&(!affirmative.test(epistemicAssertion(value))||uncertainFitFrame(value));});
}
const stem=word=>normal(word).replace(/^(?:ال)(?=.{3})/u,'').replace(/(.{3,})(?:هایی|های|شون|تون|تان|ها)$/u,'$1');
// Product-attribute concepts (what a box IS or HAS): printing/finish, colour wording, material/lining, stock.
// A clause speaking about one of them describes the product whatever its verb («انجام میدیم», «نطبعلك»,
// «احتمالاً … بشه»), so it is an assertion that needs approved evidence. This list names concepts, not
// the values the owner approved; every value the reply uses is checked against the approved facts.
const attributeConcept=/(?:(?<!\p{L})(?:رنگ|لون|اللون|بلون|colou?r)(?!\p{L})|چاپ|طبع|طباع|کوب|فویل|فويل|لوگو|شعار|برجسته|بارز|یووی|(?<!\p{L})uv(?!\p{L})|لمینت|سلفون|حکاکی|لیزر|رنگی|ملون|الوان|جنس|مقوا|کاغذ|کرافت|چرم|جلد|مخمل|پارچه|ساتن|حریر|چوب|خشب|فلز|معدن|پلاستیک|بلاستیک|اسفنج|روکش|آستر|بطان|مبطن|انبار|مخزن|موجودی|جاهز|جاهزه|full\s*colou?r|emboss|velvet|leather|wood|stock)/iu;
// A disclaimer about approval/knowledge («تأیید نشده», «مطمئن نیستم», «ما عندي معلومة مؤكدة») asserts no feature.
const epistemicDisclaimer=/تایید\s*(?:نشده|نشد|نکرده)|تاییدشده\s*(?:نیست|ندار)|تایید\s*شده\s*(?:نیست|ندار|داشته\s*باشم)|مطمئن\s*نیستم|اطمینان\s*ندارم|اطلاع(?:ات|ی)?\s*(?:دقیق\s*|کافی\s*|تاییدشده\s*)?ندارم|خبر\s*ندارم|نمی\s*دونم|نمیدونم|نمی\s*دانم|(?:مو|ما|غیر)\s*(?:موکد|مؤکد|متاکد|متأکد)|ما\s*عندی\s*(?:عنها\s*|عنه\s*)?(?:معلوم|تفاصیل|شی\s*موکد)|ما\s*اعرف|ما\s*ادری/u;
// Verb inflections are not product attributes (open vocabulary: no verb list to maintain for Persian
// present/continuous forms; Iraqi imperfect forms of the approved actions are recognised by their roots).
const verbLike=word=>!attributeValue.test(word)&&(/^(?:ن?می|نمی)(?!ان)\p{L}{2,}$/u.test(word)||/^(?:تون|توان|کن|خور|زن|خوا|بین|دون|گیر|ذار|کش|ساز|رس|فرست|گذار|بند)(?:م|ی|ه|یم|ید|ین|ن|ند)$/u.test(word)||/^(?:ب(?:فرست|گو|ذار|بین|نویس|فرما|گیر)\p{L}*|دز\p{L}*|ابعث\p{L}*|ارسل\p{L}*|شوف\p{L}*|(?:گول|قول)(?:لی|له|لک|ه|ی|ج)?)$/u.test(word))||/^(?:ب|ن)?(?:گذاشت|نوشت|کرد|شد|زد|داد|رفت)(?:ن|ه|یم|ید|ند)?$/u.test(word)||/^(?:ب|ن)?(?:زن|زنیم|زد|زدن|کن|کنیم|کرد|کردن|شه|شن|شد|بشه|باش|باشه|باشن|باشد|بزن|بده|بدیم|دیم|ده|دن|نشده|نشد)$/u.test(word)||/^(?:ن|ت|ی|ا)?(?:گدر|کدر|قدر|طبع|سوی|سوو|حط|خلی|ختار|کتب|ضیف|صیر|کون|نطبع|نطبعل|سویل)\p{L}{0,4}$/u.test(word);
const affirmativeExistence=value=>/(?<!\p{L})(?:داریم|داره|انجام\s*می\p{L}*|انجام\s*بدیم|می\s*زنیم|میزنیم|می\s*کنیم|میکنیم|میدیم|امکان\s*پذیره|نطبع\p{L}*|نسوی\p{L}*|متوفر\p{L}*|اکو|عدنا)(?!\p{L})/u.test(value);
// Discourse words that carry no product attribute (manner, certainty, the customer's own choice/space).
const discourseWords=new Set('برداشتم گذاشتم للخطوبه خطوبه الخطوبه نامزدی نامزدیتون عروسی زواج للزواج اقا آقا خانم اله الها الهم الک الج الا معتمد معتمده دنبال دنبالش دراورد درآورد دربیاد مغازه منکدر منگدر ومنکدر ومنگدر تره ترن ترم ترید ترسلی ترسلیلی ترسلنا پیش فرض پیشفرض تشیل تشیلین تشیلون وسطانی الوسطانی پیچ پیچی ورحمه بالنسبه خوشحالم اعتماد اعتمادتون نگرانش نگران اینجا همینجا بررسی ینراجع راجع پیشنهاده پیشنهادمه وکذلک کذلک بنفس هستن هستند مسطره مسطرة لحد ابلاغ الابلاغ استفسار ایده ایده‌ی راح فراح رح دا مسوول مسؤول للمسوول للمسؤول مسئول ببخشید ببخشیدا شرمنده عذر عذرخواهی قبلا قبلاً صوره صورته صورتها صورتک عکسش عکسشو فوتی فوت آورد اورد مساء صباح النور الخیر تحبین تحب اختیارچ اختیارک استخدامک بردن اوردن آوردن رسوندن رساندن فرستادن گذاشتن زدن کردن دیدن گرفتن دادن شدن بودن داشتن عندی بیه بیها فیه اکثر اقل اسماء احجام قیاسات صراحه بصراحه معلومه هنا هناک فما فمن بالضبط وغلا غلا سهلا تلغرام بالتلغرام تلگرام ایدی آیدی خواد میخواد یکی حالت بستگی غلط هسه هسع شنو شلون مشخصه جداست یاه یعنی مربوط مربوطه پرسش پرسشتون پرسشت شماست شمایید شمائه بعد قبل بضاعه بضاعتک بضاعتکم صبر صبرتون صبرت حوصله حوصلتون تواصل تواصلک لتواصلک تواصلکم لتواصلکم سوال سؤال سوالک سؤالک ثانی تسعیره تسعیر شاید احتمالا احتمالاً ممکنه ربما وکتاب حسابوکتاب حساب‌وکتاب مهمه مهم حق صادقانه راستش رک هیچ عدد عددی رقم تقریبی اشتباه خواهش کاش چطوری چطور مال ومن یشمل تشمل گفت گفتم گفتن تونستم فرستاده احب اعذرنی عذرا عذرا بیک بره وبره پسندم پسندید پسندیدی پسندیدید موثق مقایسه مقایسش تفاوت تفاوتشون تفاوتش فرق فرقش فرقشون مقارنه امکانات امکاناتش جزئیات جزییات تفاصیل چند چندتا سطح سطوح دیده کار بودن حساب منفصل منفصله ومنفصله جدا جداگانه ایران عراق العراق باشم باشیم مشخص معلوم هنوز پیام پیامتون پیامت تماس تماستون سوال سوالی سوالات سوالتون سوالاتتون کمک کمکتون راهنمایی خدمت خدمتتون خدمتم لطف لطفتون محبت محبتتون ممنون ممنونم مرسی متشکرم سپاس شکرا تسلم مشکور مشکوره قشنگیه قشنگی شیکیه جذابیه خوشگلیه انتخاب گزینه گزینهی خیار اختیار جزو جزء ضمن داخل درون توی مدلی اسمش اسمشو شیک شیکه شیکی قشنگ قشنگه زیبا زیباست جذاب جذابه جذابی لوکس لوکسه مرتب مرتبه جلوه جلوهدار دار حرفه حرفهای عالی عالیه خوشگل خوشگله دلنشین چشمگیر برازنده حلو حلوه حلوه فخم فخمه راقی راقیه انیق انیقه جمیل جمیله روعه زین زینه کشخه ناعم ناعمه شکل شکله ظاهر ظاهرش منظر درمیاد میاد یطلع تطلع برند برندتون برندتان لوگوتون اسم اسمتون علامه علامتک مارکه موکد مؤکد الموکد المؤکد موکده مؤکده صورت چیزی چیز مطمئنم مطمئن همیشه حتما حتمن کاملا دقیقا خیلی اینطوری اینجوری خیالتون راحت قشنگ واقعا خودتون انتخاب انتخابش انتخابتون سلیقه سلیقتون جا جای فضا کافی شرط شرطی صوره شی اکید اکیدا اختیار اختیارک گوه ضمن معمول معمولا عادتا خاطر بخاطر امکانیات امیل اید ایم اند اکو خوبیه خوبه چطوره واضح واضحه تکراری بزنید بزنین قشنگی قشنگه ترکیبی ترکیب کنتراست قطعیه اینه چیزی الان خود کدوم کدام نداره نداریم ندارن نیست نیستم نبود بدون وما خبر بقیه اختیاری اختیاریه اجباری اجباریه داخله داخلین زاید زایده زیاده خوش اومدین اومدید امدید هلا اهلا اهلین مرحبا تدلل تدللین نمی نمیشه شیشهتون شیشش قنینه قنینتک بطری انگشتر انگشترتون خاتم خاتمک عطر عطرتون ادکلن ساعت ساعتتون گردنبند سرویس محصول محصولتون منتج بضاعتک بگم بگی بگه بگیم بگید بگین بمونه بمونن بشیم بشه بشن بذارم بذاریم بذارید بیارم بیارید بیاد بپرسم بخوام بخواید بخواین بندازید ببینید ببینین یبقی ویبقی یخرب یصیر تصیر یکون تکون یطلع تطلع یعجبک خدمتیم درخدمتیم خوشحالیم ممنونیم متشکریم منتظریم مشتاقیم مخلصیم نوکریم بله اره آره ای اي نعم اکید ان شاء شاءالله انشاءالله الله همرنگ براند سایت بته دارین دارید داری خواستید خواستین خواستی تونید تونین بوم البوم مطابق واقعی براند سایت وبسایت موقع'.split(' '));
// cv58 CLOSED-CLASS words (finite grammar, not content): discourse markers, negation/coordination particles, manner adverbs of
// the customer's own action. Content words (attributes, materials, features, times, prices) are never added here.
for(const w of 'للعلم وللعلم بالمناسبه ترا تره یعنی یعنیه مو ومو وما فما ولا فلا وهم وهمین'.split(' '))discourseWords.add(w);
// Box-part names: «کف/ته/قاعده/زیر» = the approved «پایین», «درب/سر» = «بالا», «بدنه/جسم/میانی» = «وسط» (approved section names).
const PART_ALIAS={کف:'پایین',ته:'پایین',قاعده:'پایین',القاع:'پایین',القاعده:'پایین',الاسفل:'پایین',السفلی:'پایین',درب:'بالا',الغطاء:'بالا',غطاء:'بالا',الاعلی:'بالا',العلوی:'بالا',بدنه:'وسط',الجسم:'وسط',میانی:'وسط',الوسط:'وسط',الوسطانی:'وسط'};
// Photo words are gallery talk («۱۱ عکس واقعی … داریم») — but «چاپ عکس روی درب» is an unapproved print content.
const photoWords=/^(?:عکس|عکسهای|تصویر|تصاویر|صوره|صور)$/u;
// Asking the customer for information («بفرمایید برای چه محصولی…», «گلي شنو…») asserts nothing,
// unless the same clause also states an ability or existence.
const preferenceQuestion=value=>/(?:مدنظر\p{L}*|می\s*خوا\p{L}*|میخوا\p{L}*|دوست\s*دار\p{L}*|ترید\p{L}*|تحب\p{L}*|تحبین|تفضل\p{L}*|یعجب\p{L}*|عاجب\p{L}*|چی\s*دوست|شنو\s*ترید|اختیار\p{L}*\s*چی)/u.test(value)&&!/(?<!\p{L})(?:بزنیم|بزنم|نسوی\p{L}*|نطبع\p{L}*|می\s*زنیم|میزنیم|میدیم|داریم|عدنا|اکو|نکدر|نگدر|میتونیم|می\s*تونیم)(?!\p{L})/u.test(value);
const informationRequest=value=>/[؟?]\s*$/u.test(value)&&preferenceQuestion(value)||/(?<!\p{L})(?:بفرمایید|بفرمائید|بگید|بگین|بنویسید|بفرستید|بفرستین|گلی|قلی|گولی|دزلی|ابعثلی|احجیلی)(?!\p{L})/u.test(value)&&/(?<!\p{L})(?:چه|چی|کدوم|کدام|چند|چقدر|شنو|شگد|یا|ای)(?!\p{L})/u.test(value)&&!affirmativeExistence(value)&&!/امکان|می\s*شه|میشه|می\s*تونیم|نگدر|نکدر|یصیر|تصیر|شدنی|ممکن|مشکلی\s*ندار|ما\s*بیها\s*مشکله/u.test(value)&&!value.split(' ').some(word=>attributeValue.test(word));
// Printing context of a whole SENTENCE (comma-split clauses keep it): a printing head/technique, or a colloquial
// printing verb with a print object («لوگو رو زیر کف جعبه می‌زنیم», «نسويلك الشعار»).
const printObject=/(?<!\p{L})(?:ال)?(?:عباره|جمله|متن|نوشته|کتابه|نوار\p{L}*|روبان\p{L}*|ربان|شریط\p{L}*|لوگو\p{L}*|شعار\p{L}*|اسم\p{L}*|ادرس\p{L}*|آدرس\p{L}*|عنوان\p{L}*|طرح\p{L}*|نقش\p{L}*|پترن|اطلاعات|معلومات|تصمیم\p{L}*|برند\p{L}*|براند)(?!\p{L})/u;
const printVerb=/(?<!\p{L})(?:می\s*زن\p{L}*|میزن\p{L}*|بزن\p{L}*|زد\p{L}*|زده|کار\s*(?:کرد|میشه|می\s*شه|می\s*کنیم|میکنیم)|اجرا|درج|نسوی\p{L}*|نحط\p{L}*|نطبع\p{L}*|نکتب\p{L}*|نخلی\p{L}*|یطلع|یصیر\s*علی)(?!\p{L})/u;
export function printingSentence(text){const v=normal(text);return /چاپ|طبع|طباع|کوب|فویل|print/u.test(v)||printObject.test(v)&&printVerb.test(v)||classes(v,techniqueClass).length>0&&classes(v,surfaceClass).length>0;}
// Technique / surface classes for cross-record compatibility. A model NAME («کشویی بگ‌دار», «الجرارة ويا كيس»)
// is removed first: the bag in a model name is not a print surface.
const modelName=/کشویی\s*(?:با\s*)?(?:بگ|ساک)\s*(?:دار)?|(?:ال)?جر+اره\s*(?:مع|ویا|ویه|وی|و\s*یا|بال)?\s*(?:ال)?کیس|درج\s*(?:مع|ویا)?\s*(?:ال)?کیس/gu;
// Arabic proclitics («وتصميم», «والكيس», «بالذهبي») attach to the class word.
const techniqueClass=[['foil',/کوب|فویل|(?<!\p{L})(?:و|ب|ل|ف)?(?:ال)?(?:ذهبی|فضی|اسود|سوداء|سوده|ذهبیه|فضیه)\p{L}*/u],['design',/(?<!\p{L})(?:و|ب|ل|ف)?(?:ال)?(?:طرح|پترن|نقش|تصمیم|اطلاعات|معلومات)\p{L}*/u],['contact',/(?<!\p{L})(?:و|ب|ل|ف)?(?:ال)?(?:ادرس|آدرس|تلفن|شماره|اینستا\p{L}*|انستغرام|انستا|عنوان|هاتف|رقم)\p{L}*/u]];
const surfaceClass=[['lid',/(?<!\p{L})(?:و|ب|ل|ف)?(?:ال)?(?:درب|غطاء|غطا)(?!\p{L})|(?<=روی\s)در(?!\p{L})|(?<!\p{L})در(?=\s+(?:جعبه|علبه))/u],['body',/بدنه|میانی|(?<!\p{L})(?:و|ب|ل|ف)?(?:ال)?جسم|(?:ال)?اوسط/u],['bag',/(?<!\p{L})(?:و|ب|ل|ف)?(?:ال)?(?:بگ(?:دار|ها|های|هاش|ش|اش)?|ساک\p{L}*|کیس|بیرونی|خارجی)(?!\p{L})/u]];
const classes=(text,table)=>table.filter(([,re])=>re.test(text)).map(([name])=>name);
const printSegments=text=>String(text).split(/(?:به\s*شرط|بشرط|إذا\s*توفرت|اذا\s*توفرت|مع\s*الحفاظ)[^]*$/u)[0].split(/[،,؛;.!؟?\n\p{So}]+/u).filter(piece=>!(/(?:کلیشه|الکلیشه|صنع|ساخت|طراحی)/u.test(normal(piece))&&/(?:مشمول\p{L}*|رایگان\p{L}*|مجان\p{L}*|بسعر|قیمت|هزینه|کلفه)/u.test(normal(piece))&&!classes(normal(piece),surfaceClass).length)).filter(piece=>!(/^\s*(?:اگه|اگر|اذا|إذا|لو|به\s*شرط|بشرط|بحیث|البته\s*اگه)(?!\p{L})/u.test(piece)&&!classes(normal(piece),surfaceClass).length)).flatMap(piece=>normal(piece).replace(/(?<!\p{L})به\s*عنوان(?!\p{L})/gu,' ').replace(modelName,' ').split(/\s+و\s*(?=چاپ|طباع|طبع)|\s+(?=و?(?:ال)?طباع)|\s+و\s+(?=روی|علی|عل\s|درب|بدنه|بگ|غطا|کیس)|\s+و\s*(?=(?:طرح|پترن|نقش|اطلاعات|تصمیم|تصمیم)\s)/u).reduce((out,seg)=>{const prev=out[out.length-1];if(prev!==undefined&&classes(seg,surfaceClass).length&&!/^(?:و\s*)?(?:روی|علی|عل\s)/u.test(seg.trim())&&(!classes(seg,techniqueClass).length||classes(prev,surfaceClass).length&&!classes(prev,techniqueClass).length&&classes(seg.trim().split(/\s+/u)[0]||'',surfaceClass).length>0))out[out.length-1]=prev+' و '+seg;else out.push(seg);return out;},[])).filter(Boolean);
// A technique-only segment that STARTS a new printing item («چاپ طرح، …») carries forward to the next surface;
// a list continuation («…طلاکوب، نقره‌کوب یا مشکی‌کوب») belongs to the surfaces of the segment just before it.
const segmentPairs=(segments,onPair)=>{let pending=[],lastTech=[],prevSurf=[];for(const seg of segments){let t=classes(seg,techniqueClass);const sf=classes(seg,surfaceClass);if(!sf.length){if(t.length){if(prevSurf.length&&!/^(?:و\s*)?(?:چاپ|\p{L}{0,3}طباع|\p{L}{0,3}طبع|print)/u.test(seg.trim())){for(const a of t)for(const b of prevSurf){const r=onPair(a,b);if(r)return r;}}else{pending=[...new Set([...pending,...t])];prevSurf=[];}lastTech=t;}continue;}t=[...new Set([...(t.length?t:pending.length?[]:lastTech),...pending])];pending=[];prevSurf=sf;if(t.length)lastTech=t;for(const a of t)for(const b of sf){const r=onPair(a,b);if(r)return r;}}return null;};
const bagModel=/کشویی\s*(?:با\s*)?(?:بگ|ساک)\s*(?:دار)?|(?:ال)?جر+اره\s*(?:مع|ویا|ویه|وی|و\s*یا|بال)?\s*(?:ال)?کیس|درج\s*(?:مع|ویا)?\s*(?:ال)?کیس/u;
const otherModel=/(?<!\p{L})(?:\d|۲|۳|دو|سه|ثلاث|اثنین|اربع|چهار)\s*(?:تکه|قطع\p{L}*)|کشویی\s*(?!(?:با\s*)?(?:بگ|ساک))\p{L}+|(?:ال)?جر+اره\s*(?:ال)?(?:مائله|مایله|کج)|(?:همه|کل|تمام)\s*(?:ی\s*)?(?:ال)?(?:مدل|مودیل|موديل)\p{L}*|سه\s*تکه|۳\s*تکه|۲\s*تکه/u;
export function sentenceModel(text,inherited=null){
 const v=normal(text).replace(/(?<!\p{L})(?:مثل|مانند|عین|شبیه|همانند|همچون|زی|مثل|نفس|کما\s*فی)\s+(?:(?:ال)?(?:مدل|مودیل)\s+)?(?:\p{L}+\s+){1,3}/gu,m=>bagModel.test(m)||otherModel.test(m)?' ':m);
 const bag=bagModel.test(v),other=otherModel.test(v)||/(?<!\p{L})کشویی\s+یک(?!\p{L})/u.test(v);
 if(bag&&other)return 'mixed';if(bag)return 'bag';if(other)return 'other';return inherited;}
// A model-like phrase («کشویی یک‌دار», «کشویی دوبل», «جرارة ذهبية الحافة») that is not a catalogue/approved model is an
// invented product. Function words, verbs and attribute vocabulary after the head are not part of a model name.
function unknownModelPhrase(text,models){
 // cv58b: a plural/possessive ending written apart («کشویی‌هامون», «کشویی‌های بازدارمون») belongs to the head; the NEXT word is checked.
 const v=normal(text).replace(/(?<!\p{L})(کشویی|جراره|درج) (?:هامون|هاتون|هاشون|هایی|های|ها|مون|تون)(?!\p{L})/gu,'$1'),known=(models||[]).map(normal);
 for(const m of v.matchAll(/(?<!\p{L})(کشویی|جراره|درج)\s+(\p{L}+)/gu)){
  const head=m[1],next=m[2];
  if(/^(?:هم|رو|را|که|و|یا|با|از|برای|به|در|تو|توی|هست|هستش|داره|داریم|داره|میشه|ها|ای|مدل|بگ|ساک|کج|روبان|مع|ویا|وی|ال|هی|هو|بیها|فیها|علیها|عدنا|تنطبع|ینطبع|بالکیس|کیس|مائله|مایله|شریط|بشریط|بالشریط|من|علی|الی|ب|تکون|یکون)$/u.test(next))continue;
  if(verbLike(next)||attributeValue.test(next)||colourName.test(next)||printSurface.test(next)||attributeHead.test(next))continue;
  if(known.some(k=>k.startsWith(head+' '+next)||k.startsWith(head+next)))continue;
  return head+' '+next;
 }
 return null;
}
export function printingPairIssue(sentence,facts,model=null){
 sentence=String(sentence).replace(/[^.!؟?\n،,؛;]*[؟?]/gu,' ').split(/(?<=[.!؟?\n؛;\p{Extended_Pictographic}])|(?<!\p{L})(?=(?:ولی|اما|بس|لکن)(?!\p{L}))/u).filter(piece=>piece.trim()&&!epistemicFrame.test(normal(piece))&&!nonCommittalClause(piece)).join(' ');
 const allowed=new Set();
 for(const fact of facts)for(const value of fact.values||[]){const scoped=bagModel.test(normal(value));if(scoped&&model!=='bag')continue;segmentPairs(printSegments(value),(a,b)=>{allowed.add(a+'|'+b);return null;});
  // A record about ONE surface («طباعة غطاء العلبة مجانية؛ يختار الزبون الطباعة الذهبية …») pairs every technique it names
  // with that surface, even across its own clause boundary. Multi-surface records keep segment-level pairing.
  for(const seg of printSegments(value))if(/چاپ|طبع|طباع|ینطبع|تنطبع|نطبع/u.test(seg))for(const sf of classes(seg,surfaceClass))allowed.add('print|'+sf);
  {const segs=printSegments(value),surf=[...new Set(segs.flatMap(seg=>classes(seg,surfaceClass)))];if(surf.length===1)for(const t of new Set(segs.flatMap(seg=>classes(seg,techniqueClass))))allowed.add(t+'|'+surf[0]);}}
 const segs=printSegments(sentence),pairIssue=segmentPairs(segs,(a,b)=>allowed.has(a+'|'+b)?null:a+'|'+b);if(pairIssue)return pairIssue;
 // A print verb on a surface with no technique named («تنطبع على الكيس الخارجي») still claims printing on that surface.
 for(const seg of segs){if(printNegated(seg)||!/چاپ|طبع|طباع|ینطبع|تنطبع|نطبع|می\s*خوره|میخوره|میزن|می\s*زن|بزن|زد|نسوی|ینسوی/u.test(seg))continue;
  for(const s of classes(seg,surfaceClass))if(![...allowed].some(p=>p.endsWith('|'+s)))return 'print|'+s;}
 return null;
}
// A sentence that asserts something about the BUSINESS — a first-person-plural action («میزنیم», «نطيك», «حجزنا»),
// a result/state of the order or product («آماده‌ست», «موجوده», «میرسه», «تكفي», «حله», «انحجز»), or a Latin-script
// term («full color», «Tipax») — is accepted only when it is POSITIVELY grounded: every content word is approved wording
// (facts or catalogue) and at least one approved content word is present. Ordinary talk, questions back to the customer,
// honest disclaimers and qualified suggestions are not business assertions.
// A conditional's protasis («اگه بخواید», «إذا تحب») is not an assertion, but its apodosis is: only the words up to and
// including the protasis verb (at most six words) are removed; everything after it stays in the assertion core.
// Tag / rhetorical questions («… پرفروش‌ترینه، نه؟», «می‌دونستید …؟», «خبر دارید که …؟», «… صح؟») assert their host clause.
export function rhetoricalHost(text){
 const t=String(text).trim();if(!/[؟?]\s*$/u.test(t))return null;
 if(/(?<!\p{L})(?:چه|چی|چیه|کدوم|کدام|کجا|کی|چند|چطور|چطوری|چرا|آیا|ایا|شنو|شلون|وین|شگد|شکد|منو|هل|لیش|متی|اشکد|کم)(?!\p{L})/u.test(normal(t)))return null;
 const tag=t.replace(/(?:[،,]\s*|\s+)(?:نه|درسته|مگه\s*نه|مگر\s*نه|صح|مو|مو\s*صح|لو\s*لا|صحیح|ها|ماشی|اوکی)\s*[؟?!]*\s*$/u,'');
 const lead=t.replace(/^\s*(?:می\s*دونستید|میدونستید|می‌دونستید|می\s*دونستی|میدونستی|خبر\s*دارید|خبر\s*داری|تعرف|تعرفین|تدری|تدرین|شفت|شفتی)\s*(?:که|ان|انو|اینکه)?\s*/u,'');
 const lead2=t.replace(/[،,]\s*(?:می\s*دونستید|میدونستید|می‌دونستید|میدونستی|تعرف|تدری)\s*[؟?]*\s*$/u,'');
 const host=tag!==t?tag:lead!==t?lead.replace(/[؟?]\s*$/u,''):lead2!==t?lead2:null;
 return host;
}
function stripProtasis(match){
 const words=match.trim().split(/\s+/u);let end=-1;
 for(let i=1;i<words.length&&i<=7;i++){const w=normal(words[i]);if(w&&(verbLike(w)||arabicVerbForm(w)||/^\p{L}{2,}(?:ید|ین)$/u.test(w)&&!/ترین$/u.test(w)||/^(?:باشه|نباشه|بشه|نشه|شد|بود|باشن|دارید|دارین|داری|داره|بودیم|بودم|بودید|بودن|باشیم|باشم|باشید)$/u.test(w)||/^ن?\p{L}{2,}(?:ته|ده)$/u.test(w)&&!/^(?:شده)$/u.test(w)||/^(?:ب|بی|نی|نخ|بخ)\p{L}*(?:ید|ین|ی|ه|م|یم|ن)$|^(?:ت|ی|ا|ن)?(?:حب|حبی|ر[یی]د|تر[یی]د|بی|تبی|حبیت|ردت|اردت|صار|تحتاج|احتجت)\p{L}*$/u.test(w))){end=i;break;}}
 // an auxiliary right after the protasis verb («نگفته بودیم», «رسیده باشه») belongs to the protasis (cv24)
 while(end>=0&&end+1<words.length&&/^(?:بود|بودیم|بودم|بودید|بودن|باشه|باشیم|باشم|باشید|باشن|است|هست|شد|شده|شدیم)$/u.test(normal(words[end+1])))end++;
 // no verb found: only the marker and its first word are protasis; the rest is evaluated
 if(end<0)return ' '+words.slice(2).join(' ');
 // a coordinated condition («اگه جا باشه و طرح شلوغ نشه») continues the protasis up to its own subjunctive verb
 while(end+1<words.length&&/^و\p{L}{3,}/u.test(normal(words[end+1]))&&arabicVerbForm(normal(words[end+1]).slice(1)))end++;
 let k=end+1;while(k<words.length&&/^(?:و|یا|او)$/u.test(words[k])){let j=k+1,found=-1;for(;j<words.length&&j<=k+5;j++){const w=normal(words[j]);if(/^(?:ن|ب)\p{L}*ه$|^(?:باشه|نباشه|بشه|نشه|باشن|نباشن|شد|نشد|صار|ماصار)$|^(?:ی|ت)\p{L}+$/u.test(w)&&verbLike(w)||/^(?:باشه|نباشه|بشه|نشه|باشن|نباشن)$/u.test(w)||arabicVerbForm(w.replace(/^و(?=\p{L}{3})/u,''))){found=j;break;}}if(found<0)break;end=found;k=found+1;}
 return ' '+words.slice(end+1).join(' ');
}
// Requests to the customer («اسمش رو بفرستید», «دزلي الصورة», «سایت رو ببینید») ask for information; they assert nothing
// about the business. A request that also states a capability («می‌تونید … انتخاب کنید», «تكدر تختار») is NOT a request.
// Information-exchange acts addressed to the customer's case (checking, asking, needing measurements) are not business facts.
const infoAct=/(?<!\p{L})هماهنگ\s*(?:می\s*|می‌)?(?:کنیم|کنم|میکنیم|میکنم)(?!\p{L})|(?<!\p{L})(?:از\s*)?(?:ال)?(?:مدیر|صاحب\p{L}*|مسئول\p{L}*)\s*(?:\p{L}+\s+){0,2}?(?:می\s*پرسم|میپرسم|بپرسم|اسال\p{L}*|اسأل\p{L}*|نسال\p{L}*|نسأل\p{L}*|اراجع\p{L}*|نراجع\p{L}*)(?!\p{L})|(?<!\p{L})(?:اکدر|اگدر|اقدر|نکدر|نگدر)?\s*(?:اسال|اسأل|نسال|نسأل|اراجع|نراجع)\s*(?:ال)?(?:مدیر|صاحب\p{L}*)(?!\p{L})|(?<!\p{L})(?:\p{L}+\s+){0,4}(?:برای\s*بررسی\s*)?(?:بهش|به\s*مدیر|به\s*همکارم)\s*(?:منتقل|اطلاع)\s*(?:می\s*)?(?:کنم|میکنم|بدم|میدم)(?!\p{L})|(?<!\p{L})(?:\p{L}+\s+){0,3}(?:را|رو)\s+(?:بررسی|چک|پیگیری|استعلام)\s*(?:می\s*|می‌)?(?:کنیم|کنم|میکنیم|میکنم)(?!\p{L})|(?<!\p{L})(?:آنی|انی|اني|آني|انا|من)\s+(?:حاضر\p{L}*|بخدمتک\p{L}*|در\s*خدمتم)(?!\p{L})|(?<!\p{L})(?:حتی\s*|تا\s*|عشان\s*)?(?:نعرف|نشوف|نتاکد|نتأكد|ببینیم|بدونیم|مطمئن\s*بشیم)\s*(?:اذا|إذا|لو|ان|که|آیا|ایا)?\s*(?:\p{L}+\s+){0,5}?(?:تناسب|یناسب|تدخل|یدخل|تکفی|یکفی|جا\s*میشه|جا\s*بشه|جا\s*می\s*شه|میشه|بشه)(?!\p{L})|(?<!\p{L})(?:بررسی|چک|نگاه|پیگیری\s*سوال)\s*(?:می\s*|می‌)?(?:کنیم|کنم|میکنیم|میکنم)(?!\p{L})|(?<!\p{L})(?:نتاکد|نتأكد|نتأکد|نشوف|نراجع|نعرف|نسال|نسأل|اتاکد|اتأكد|اشوف)\p{L}*(?!\p{L})|(?<!\p{L})(?:نحتاج|احتاج|محتاج\p{L}*|لازم\s*(?:دارم|داریم)|نیاز\s*(?:دارم|داریم))(?!\p{L})(?:\s+(?:ال)?(?:طول|عرض|ارتفاع|قطر|ابعاد|قیاس\p{L}*|مقاس\p{L}*|حجم|صوره|صورت|عکس|اسم|عدد|کمیه|تعداد|ادرس|عنوان|مدینه|شهر|و|والطول|والعرض|والقطر|والارتفاع)(?!\p{L}))*/gu;
// Iraqi imperfect / imperative / future verb forms («تشوف», «يروح», «ادخل», «نرسلها», «راح يوصل», «دزلي») carry their meaning
// in the clause's nouns; the verb itself is not a business noun. Noun templates that share the prefix letters are excluded.
const arabicVerbForm=w=>{
 if(/^(?:ال|بال|وال|لل|فال)/u.test(w)||attributeValue.test(w)||colourName.test(w)||printSurface.test(w)||attributeHead.test(w))return false;
 const v=w.replace(/^(?:و|ف)(?=\p{L}{4})/u,'').replace(/^(?:را|رح|دا|ح|ب)(?=[یتنا]\p{L}{2})/u,'');
 if(/^ت\p{L}{2}ی\p{L}(?:ه|ات)?$|^ا\p{L}{2}ا\p{L}$|^(?:اکثر|احسن|افضل|اقوی|اقل|ارخص|اغلی|اکبر|اصغر|اطول|اجمل|احلی|اسرع|اقرب|ابعد)$|^ت\p{L}ا\p{L}{2}$|^م\p{L}+/u.test(v))return false;
 if(/^(?:ب|ل)?(?:یوم|یومین|ایام|اسبوع|اسبوعین|ساعه|ساعات|ساعتین|شهر|سنه|ناس|ناتی|ناتئ|نافر)$/u.test(w.replace(/^(?:و|ف)/u,'')))return false;
 return /^(?:ی|ت|ن|ا)\p{L}{3,4}(?:ون|ین|وها|وه|ه|ها|ک|ج|کم|ی|لی|لک|لج|نا|هم|ونه|ونها)?$/u.test(v)||/^(?:دز|ابعت|ابعث|ارسل|شوف|گول|کول|خلی|اختار|اکتب|تعال)\p{L}*$/u.test(v);
};
// Proposition split: punctuation, contrast connectors, and «و/وَ» or Iraqi «و» that joins two predicates. Coordinated nouns stay
// together only as far as they share one predicate; splitting them never removes a word from evaluation.
function propositionsOf(text){
 return String(text).split(/[،,؛;:]|(?<!\p{L})(?:ولی|اما|بس|لکن|لاکن|بلکه|منتها|ولکن)(?=\s)|\s+و\s+|\s+(?:که|چون|چونکه|زیرا|لان|لأن|اللی|الی)\s+|\s+(?=هم\s+\p{L}+\s+\p{L}*\s*(?:\p{L}+\s+){0,3}هم\s)|(?<=\p{L})\s+(?=هم\s+(?:روی|علی|عل|رو)\s)/u).flatMap(piece=>{
  // attached «و» + VERB starts a new proposition («ما نطبع على الكيس ونطبع على القاع»); «واضح/والا/وانت» are not split.
  const words=piece.trim().split(/\s+/u),out=[[]];
  for(const w of words){const rest=w.replace(/^و/u,''),n=normal(rest);if(out[out.length-1].length&&/^و\p{L}{3,}/u.test(w)&&(/^(?:می|نمی)\p{L}{2,}/u.test(rest)||verbLike(n)||arabicVerbForm(n)))out.push([rest]);else out[out.length-1].push(w);}
  return out.map(ws=>ws.join(' '));
 }).map(x=>x.trim()).filter(Boolean);
}
// A proposition is a business claim when it carries a business anchor: a business trigger (handled by the caller), attribute
// vocabulary (technique, surface, material/attribute head, colour), a product/model mention, a money/time/stock/shipping concept,
// or a nominal predicate with a copula about something («مخمله», «ليذر», «محکمه»). Courtesy, thanks, greetings, instructions
// and meta talk carry none.
const businessAnchor=v=>v.split(' ').some(w=>attributeValue.test(w)||colourName.test(w)||printSurface.test(w)||attributeHead.test(w)||modelLike(w)||/^(?:جنس|روکش|بدنه|مقوا|کاغذ|چوب|چرم|پارچه|فلز|پلاستیک|شیشه|ماده|ماد|قماش|جلد|ورق|کارتون|اسفنج|سفنج|فوم|مخمل|ساتن|آستر|استر|بطانه)\p{L}*$/u.test(w))
 ||/(?<!\p{L})(?:ما|مو|لا|ولا)\s*(?:تروح|یروح|تبهت|یبهت|ینمسح|تنمسح|تتغیر)|(?:نمی\s*پره|نمیپره|پاک\s*نمیشه|ماندگار|همیشگی)/u.test(v)
 ||/(?<!\p{L})(?:ال|هال|ها|این|اون|هذا|هذه)?(?:مدل|مودیل|موديل|عمده|عمده\s*فروشی|جمله|بالجمله|کمیه|تیراژ|سفارش|طلب|بازار|سوق)\p{L}*(?!\p{L})/u.test(v)
 ||/(?<!\p{L})(?:ساخته|ساخت|درست\s*شده|مصنوع\p{L}*|مسوی\p{L}*|مسوا\p{L}*|بسته\s*می\s*شه|بسته\s*میشه|یتسکر|ینسد|قفل\p{L}*|دکمه\p{L}*|زیپ|مگنت|آهنربا|اهنربا|مغناطیس|چسب\p{L}*|لایه\p{L}*|آستر\p{L}*|استر\p{L}*)(?!\p{L})/u.test(v)
 ||/(?<!\p{L})(?:قیمت|سعر|هزینه|کلفه|اجور|کرایه|تخفیف|خصم|بیعانه|عربون|پرداخت|دفع|تومن|تومان|دینار|دلار|موجود|متوفر|ستوک|انبار|مخزن|زمان|مده|موعد|روز|یوم|هفته|اسبوع|ارسال|شحن|باربری|تحویل|توصیل|تضمین|ضمان|بیمه|تامین|تعویض|مرجوع|برگشت|ضد|دوام|کیفیت|جوده)\p{L}*(?!\p{L})/u.test(v)
 ||/(?<!\p{L})\p{L}{3,}(?:ه|ست|است|هست|ـه)(?!\p{L})/u.test(v)&&/(?<!\p{L})(?:جنس|روکش|بدنه|داخل|بیرون|درب|کف|دیواره|غطا|جسم|علب|جعب|کیس|بگ)\p{L}*/u.test(v);
// Words that refer to the customer (second-person clitic: «طلبك», «لذوقك», «على كيفك», «شیشه‌تون») are customer-side; attribute,
// colour and money words keep being checked even with a clitic.
const customerSideWord=(w,markets=[])=>(/(?:تون|تان)$/u.test(w)||(markets||[]).includes('ARAB')&&/(?:ک|ج|کم)$/u.test(w))&&w.length>=4&&!/^(?:محکم|خاکی|اکریلیک|مشکی|کوچک|کوچیک|نازک|شیک|باریک|تاریک|کلاسیک|پلاستیک|الاستیک|فیبرک|متالیک|شفاف|براق)/u.test(w)&&!attributeValue.test(w)&&!colourName.test(w)&&!printSurface.test(w)&&!/(?:قیمت|سعر|هزینه|کلف|اجور|تخفیف|خصم|عربون|بیعانه|پول|فلوس)/u.test(w);
// Approved "free" wording of the included production services (design, printing, plate) — only inside such a sentence.
const freeWord=/^(?:ببلاش|بلاش|بلا|مجان\p{L}*|رایگان\p{L}*|پولی|هزینه\p{L}*|کلفه|زایده|زیاده|اضافیه|اضافی|بدون|داخله|مشموله|مشمول)$/u;
// A print segment is a denial only when the print verb itself is negated («چاپ رنگی نداریم», «ما نطبع على الكيس»).
const printNegated=v=>/(?:نمی|نمي|ما|مو|لا|بدون)\s*(?:\p{L}+\s+){0,1}?(?:چاپ|طبع|ینطبع|تنطبع|نطبع|میخوره|می\s*خوره|میزن|می\s*زن|بزن|زد)|(?:چاپ|طباع|طبع)\p{L}*\s*(?:\p{L}+\s+){0,2}?(?:نمیشه|نمی\s*شه|نداره|نداریم|ندارن|نمیخوره|نمی\s*خوره|ماکو|مو\s*ممکن|ما\s*یصیر|غیر\s*ممکن)/u.test(normal(v));
// H4: «۲ تکه رو هم می‌تونیم», «والقطعتين هم نكدر» — another model + «هم» + an ability verb inherits an unstated capability.
const ellipticTransfer=v=>/(?<!\p{L})و?(?:مدل\s*)?(?:\d|۲|۳|دو|سه|ثلاث|قطعتین|کشویی\s*\p{L}+|جراره\s*\p{L}+|\p{L}+\s*تکه|ال?قطعتین|ثلاث\s*قطع)\s*(?:\p{L}+\s+){0,1}?(?:رو|را)?\s*هم\s*(?:می\s*)?(?:تونیم|میتونیم|شه|میشه|نکدر|نگدر|یصیر|یمکن|ممکن|اوکیه)(?!\p{L})/u.test(v);
const shippingTopic=/(?<!\p{L})(?:ارسال\p{L}*|باربری\p{L}*|حمل|کرایه\p{L}*|کارتن\p{L}*|بار|استعلام\p{L}*|اسنپ|وانت|شحن|الشحن|نقل|اجور\p{L}*|کرتون|توصیل|مقصد|شهرستان\p{L}*)(?!\p{L})/u;
// cv58: a proposition whose agent is the customer — Iraqi second-person modal/verb («تگدر/تكدر/تقدر/تحب/تريد/تختار/تشوف…»),
// imperative to the customer, Persian 2pl verb («می‌تونید/ببینید/بفرستید/انتخاب کنید»), the customer's possession as subject
// («انگشترتون/ساعتك»), or «الزبون/زبائنك/مشتری‌هاتون» as subject.
// A «you can …» modal («تگدر تتابع الشحنة», «می‌تونید … انتخاب کنید») OFFERS our capability and is NOT customer-directed (cv58 review).
// cv58b (review A/B/D): imperatives/requests to the customer only; never a «you can …» modal, never a possessive guess, and never
// when the proposition also says what a product HAS / CONTAINS / IS AVAILABLE («ببینید کشویی کج دستگیره هم داره»).
const customerDirected=v=>(/(?<!\p{L})و?(?:دزلی|دزلنا|دزها|گلی|گولی|خبرنی|بلغنی|ارسلی|ارسللی|اختار\p{L}*)(?!\p{L})|(?<!\p{L})(?:بفرستید|بفرستین|بگید|بگین|بنویسید|بفرمایید)(?!\p{L})|(?<!\p{L})(?:ال)?(?:زبون|زبائن|زباین|عمیل)\p{L}*\s+یتواصل\s+ویاک/u.test(v))&&!/(?<!\p{L})(?:داره|دارن|داری|داریم|هست|هستش|است|عنده|عندها|بیه|بیها|فیه|فیها|اکو|عدنا|عندنا|موجود\p{L}*|متوفر\p{L}*|یجی|تجی|میاد|میشه|ینطبع|تنطبع|نطبع|نسوی|میزنیم|داخلش|جوه|جواها)(?!\p{L})/u.test(v);
const requestSentence=v=>/(?<!\p{L}|می\s|نمی\s)ب\p{L}{1,8}(?<!تر)(?:ید|ین)(?!\p{L})|(?<!\p{L})(?:بفرست|بگو|ببین|دزلی|دزلنا|دز|ترسلی|ترسلیلی|ترسلنا|ارسل\p{L}*|ابعث\p{L}*|ابعثلی|شوف|شوفی|گلی|کلی|خبرنی|خبرینی|لطفا|لطفاً|رجاء)(?!\p{L})/u.test(v)&&!/(?<!\p{L})(?:می\s*تون\p{L}*|میتون\p{L}*|می\s*شه|میشه|تکدر|تگدر|تقدر|یمکن|نکدر|نگدر|داریم|عدنا|میزنیم|می\s*زنیم|نسوی|نطبع)(?!\p{L})/u.test(v)&&!businessAssertion(v.replace(infoAct,' '));
// A negated proposition («چاپ تمام‌رنگی نداریم», «ما نطبع على الكيس») may DENY an unapproved capability: its capability
// vocabulary needs no approval. Every other content word still must be approved (a negation never licenses
// «بهترین کیفیت بازار … رقیب نداریم»).
const denial=v=>/(?<!\p{L})و?(?:منکدر|منگدر|منقدر)(?!\p{L})/u.test(v)||/(?<!\p{L})و?(?:ما|مو|لا)\s+ن(?:ضمن|طبع|سوی|کدر|گدر|عرف|وصل|رسل|شحن|حجز|سلم|وفر|عطی|طی|قبل|بدل|رجع|عوض|حسب|اخذ|کتب)\p{L}*/u.test(v)||[...v.matchAll(/(?<!\p{L})و?(?:ما|مو|لا)\s+([نیت]\p{L}{2,})/gu)].some(m=>verbLike(m[1]))||/(?<!\p{L})(?:تایید\s*نشده|تاییدشده\s*نیست|تایید\s*نمیشه|مو\s*موکد|مو\s*معتمد|غیر\s*معتمد|ما\s*معتمد|ندار\p{L}*|نمی\s*\p{L}+|نمی\p{L}+|نیست\p{L}*|نمیشه|نمی\s*شه|ماکو|ما\s*(?:عدنا|نطبع|نسوی|ینطبع|یصیر|نکدر|نگدر|یمکن|اکو|بیها|فیها)|مو\s*(?:موجود|متوفر|ممکن)|لا\s*(?:یوجد|نطبع|نسوی)|غیر\s*(?:موجود|متوفر|ممکن))(?!\p{L})/u.test(v);
const denialClaimWord=/(?:(?:^|ضد)(?:آب|اب)|ماء|مای|رطوب|رطوبت|نم|اثر|خش|خراش|حرار|گرما|آفتاب|شمس|رنگ\s*پس|یرشح|نفوذ|سوک|مثله|مثلها|نظیر|لنگه|همتا|کیفیت|بازار|سوق|رقیب|رقبا|کس|احد|مثل|ترین|افضل|احسن|سالم|اسیب|آسیب|خراب|کسر|ینکسر|تنکسر|عیب|ایراد|تضمین|ضمانت|دوام|محکم|قوی|اقوی|رایگان|مجان|ببلاش|حساب|فلوس|پول|هزینه|کلفه|اجور)/u;
const denialVocabulary=w=>!denialClaimWord.test(w)||attributeValue.test(w)||colourName.test(w)||printSurface.test(w)||attributeHead.test(w)||/^(?:رنگی|رنگیه|تمام|تمامرنگی|فول|کالر|ملون|ملونه|لیست|فهرست|اسم|مدلی|مدل|موديل|مودیل)$/u.test(w);
// Information-exchange vocabulary of a purpose clause («تا دقیق‌تر بررسی کنیم», «عشان نتأكد») — anything else in a purpose clause
// («که لوگوتون سه بعدی دیده بشه») is a claim and stays in the assertion core.
const infoExchange=/^(?:دقیق|دقیقتر|دقیق‌تر|بررسی|راهنمایی|راهنماییتون|کمک|کمکتون|مطمئن|بهتر|بهتری|درست|درستی|صحیح|راحت|راحتتر|نتاکد|نشوف|نعرف|نساعد\p{L}*|اساعد\p{L}*|نقارن|بالضبط|زین|احسن|اکثر|هم|با|رو|را|شما|شمارو|خودتون|ای|یه|یک|اینو|این|اون|ان|لک|الک|بیها)$/u;
function purposeKeep(match){const words=normal(match).split(' ').filter(Boolean).slice(1);return words.every(w=>infoExchange.test(w)||neutral1(w)||verbLike(w))?' ':' '+match.replace(/^\s*\p{L}+/u,' ')+' ';}
const neutral1=w=>w.length<3||discourseWords.has(w);
// Disclaimed-topic nouns inside an epistemic frame are the object of the uncertainty, not a claim.
const disclaimedTopicWords=/(?<!\p{L})(?:تیپاکس|پست|بیمه|تامین|ضمان|جبران|خسارت|زمان|وقت|مده|مدت|موعد|تحویل|توصیل|رسیدن|وصول|ارسال|شحن|قیمت|سعر|تخفیف|خصم|هزینه|کلفه|اجور|مبلغ|موجودی|موجود|اماده|آماده|جاهز|ابعاد|اندازه|قیاس|سایز|جنس|ماده|مقاومت|دوام|تناسب|مدل\p{L}*|موديل\p{L}*|مودیل\p{L}*|برجسته\s*کردن|اکثر|الاکثر|طلب|مبیع\p{L}*|پرفروش\p{L}*)(?!\p{L})/gu;
function dropEpistemicTopic(v){
 const m=v.match(epistemicFrame);if(!m)return v;
 const before=v.slice(0,m.index).trim().split(/\s+/u).filter(Boolean),after=v.slice(m.index+m[0].length).trim().split(/\s+/u).filter(Boolean);
 const stop=w=>/^(?:و|یا|او|ولی|اما|بس)$/u.test(w)||(verbLike(w)&&!/(?:ن|دن|تن)$/u.test(w))||/(?<!\p{L})(?:\p{L}{2,}یم|ن\p{L}{2,})$/u.test(w)&&verbLike(w);
 const embedded=before.findIndex(w=>/^(?:اینکه|ایا|اذا|لو)$/u.test(w));if(embedded>=0&&before.length-embedded<=12)return [...before.slice(0,embedded),...after].join(' ');
 let i=before.length;while(i>0&&before.length-i<8&&!(stop(before[i-1])&&!(/^(?:و|یا|او)$/u.test(before[i-1])&&i>=2&&!stop(before[i-2]))))i--;
 // a speech-act frame («نمی‌تونم بگم», «ما أگدر أگول») takes its complement directly; other frames through an introducer
 const speech=/(?:بگم|بدم|اعلام|تایید|قول|تضمین|اذکر|اگول|اکول|احدد|اوعد\p{L}*)$/u.test(m[0].trim())||/(?:معلوم\p{L}*|تفاصیل|اطلاع\p{L}*|خبر|تاکید|علم|رقم)$/u.test(m[0].trim());
 let q=0;while(q<after.length&&q<3&&/^(?:کافی\p{L}*|کافیه|دقیق\p{L}*|موکد\p{L}*|مضبوط\p{L}*|معتمد\p{L}*|تاییدشده\p{L}*|مفصل\p{L}*|کامل\p{L}*|واضح\p{L}*|بیشتر\p{L}*|زیاد)$/u.test(after[q]))q++;
 if(q){before.push(...after.splice(0,q).map(()=>'') );}
 let j=0;
 if(after.length&&speech&&!/^(?:و|ولی|اما|بس)$/u.test(after[0])){while(j<after.length&&j<12&&!verbLike(after[j])&&!/^(?:و|ولی|اما|بس)$/u.test(after[j]))j++;if(j<after.length&&verbLike(after[j]))j++;if(after[j]==='یا'&&/^(?:نه|لا)$/u.test(after[j+1]||''))j+=2;}
 else if(after.length&&/^(?:عن|حول|بخصوص|ان|اذا|لو|که|اینکه|درباره\p{L}*|راجع|من|رو|را|یا|چقدر|چی|شنو|شگد|کدوم|حتی|حتى|عشان|علمود|تا|کی)$/u.test(after[0])){j=1;let verbSeen=false;const isVerb=w=>verbLike(w)||/^(?:(?:ن?می|ب|ن)\p{L}{2,}(?:ید|ین)|دار(?:ید|ین|ی|م)|داشت\p{L}*)$/u.test(w);while(j<after.length&&j<12&&!(verbSeen&&/^(?:و)$/u.test(after[j]))&&!(stop(after[j])&&!(/^(?:و|یا|او)$/u.test(after[j])&&j+1<after.length&&!stop(after[j+1])))){if(isVerb(after[j]))verbSeen=true;j++;}}
 return [...before.slice(0,i),...after.slice(j)].join(' ').replace(/(?<!\p{L})(?:اینکه|که|چقدر|چی|چه|کدوم|کدام|شنو|شگد|یا\s*نه|او\s*لا|لو\s*لا)(?!\p{L})/gu,' ').replace(disclaimedTopicWords,' ');
}
export function assertionCore(text){
 text=String(text).normalize('NFKC').replace(/(?:https?:\/\/)?(?:www\.)?hamzehibox\.com\S*/giu,' ').replace(/(?<!\p{L})(?:به\s+روی\s+ماه\p{L}*|ارادت\p{L}*|صباح\s+(?:الخير|النور|الخیر)|مساء\s+(?:الخير|النور|الخیر)|هلا\s+و\s*غلا|هلا\s+والله)(?!\p{L})/gu,' ').replace(/(?<!\p{L})(ال)?غطا(?!\p{L}|ء)/gu,'$1غطاء').replace(/(?<!\p{L})(ال)?سود[ةه](?!\p{L})/gu,'$1سوداء').replace(/(?<!\p{L})ويه(?!\p{L})/gu,'ويا').replace(/(?<!\p{L})کوچیک(?!\p{L})/gu,'کوچک').replace(/(?<!\p{L})(?:حجمها|حجمه|قیاسها|قیاسه|قياسها|قياسه)(?!\p{L})/gu,'قیاس').replace(/(?<![\p{L}])(?:لا|ما)\s*(?:ت|ی)?شیل(?:ین|ون)?\s*هم(?![\p{L}])|(?<![\p{L}])(?:لا|ما)\s*(?:ت|ی)?شيل(?:ين|ون)?\s*هم(?![\p{L}])/gu,' ').replace(/[يى]/gu,'ی').replace(/ك/gu,'ک').replace(/[أإ]/gu,'ا').replace(/[ً-ٰٟ]/gu,'').replace(/^\s*(?:yes|ok|okay|hi|hello)(?![a-z])\s*[!,.،]*/iu,' ').replace(/\{\{(?:INFORMATION|COMMERCIAL)\}\}/gu,' ').replace(/https?:\/\/\S+|www\.\S+|hamzehibox\.com\S*/giu,' ').replace(/‌/gu,' ');
 const lead=String(text).match(/^\s*((?:\p{L}+\s+){1,3}?)[\p{Extended_Pictographic}\p{So}]+\s*/u);
 if(lead&&(normal(lead[1]).split(' ').length===1||/(?<!\p{L})(?:سلام|درود|هلا|اهلا|مرحبا|جان|خانم|آقا|اقا|عزیزم|عزیز|عیونی|حبیبی|حبیبتی|بیج|بیک|اخی|اغاتی|استاذ|حجی|ابو|ام|دکتر|مهندس)(?!\p{L})/u.test(normal(lead[1])))&&!businessAssertion(normal(lead[1]))&&!normal(lead[1]).split(' ').some(w=>verbLike(w)||attributeValue.test(w)||colourName.test(w)||attributeHead.test(w)))text=String(text).slice(lead[0].length);
 return String(text)
  .replace(/^\s*(?:آقا|اقا|خانم|آقای|اقای|استاذ|حجی|ابو|ام)\s+\p{L}+(?=\s*[.!،,\p{So}\p{Extended_Pictographic}]|\s*$)/u,' ')
  .replace(/^\s*(?:\p{L}+\s+)?(?:جان|خانم|آقا|اقا|عزیزم|عزیز|عیونی|عینی|حبیبی|حبیبتی|بیج|بیک|خیی|اخی|اغاتی|خیه|استاذ|حجی|ابو\s+\p{L}+|ام\s+\p{L}+)(?!\p{L})[\s\p{So}\p{Sk}\p{Extended_Pictographic}،,!]*/u,' ')
  .replace(/(?<!\p{L})(?:آقا|اقا|خانم|استاذ|حجی|ابو|ام)\s+\p{L}+(?=\s*[.!،,\p{So}\p{Extended_Pictographic}]|\s*$)/gu,' ')
  .replace(/(?<!\p{L})\p{L}+\s+(?:جان|خانم|خان)(?!\p{L})|(?<!\p{L})(?:آقای|اقای|خانم)\s+\p{L}+/gu,' ')
  .replace(/^\s*(?:هلا|اهلا|اهلین|مرحبا|سلام|هلو)(?:\s+و?\s*(?:غلا|مرحبا|اهلین|سهلا))?\s+\p{L}+(?=\s*[\p{So}\p{Extended_Pictographic}،,!])/u,' ')
  .replace(/(?<!\p{L})(?:ابو|ام)\s+\p{L}+(?=\s*[\p{So}\p{Extended_Pictographic}،,!.])|(?<!\p{L})(?:خیی|خیه|اخی|اخوی|بیج|بیک|عیونی|عیني|حجی|حجیه)(?!\p{L})/gu,' ')
  .replace(/(?<!\p{L})(?:عزیزم|عزیز|عیونی|حبیبی|حبیبتی|اغاتی|جان)(?=\s*[\p{So}\p{Sk}\p{Extended_Pictographic}،,!.]|\s*$)/gu,' ')
  .replace(/^\s*(?:سلام|درود|هلا|اهلا|اهلین|مرحبا|هلو|صباح\s*الخیر|مساء\s*الخیر)(?:\s+(?:و\s*)?(?:عیونی|حبیبی|عزیزم|اغاتی|بیک|بیج|بیکم|اهلین|وقت\s*بخیر|خوش\s*اومدین))?(?!\p{L})[\s\p{So}\p{Sk}\p{Extended_Pictographic}،,!]*/u,' ')
  .replace(/(?:به\s*شرط(?:ی|ه)?\s*(?:که)?|بشرط|(?<!\p{L})(?:اگه|اگر|اذا|إذا|لو|حتی|حتى|بحیث)(?!\p{L}))[^،,؛;.!؟?\n]*/gu,stripProtasis)
  .replace(/(?<!\p{L})(?:تا|کی|که|عشان|علمود)\s+(?:\p{L}+\s+){0,5}?(?:کنیم|کنم|بشه|بشیم|بدیم|بگیم|ببینیم|بفرستیم|نشوف\p{L}*|نکدر\p{L}*|نگدر\p{L}*|اکدر\p{L}*|اگدر\p{L}*|نقارن\p{L}*|نتاکد\p{L}*|نعرف\p{L}*)(?!\p{L})[^،,؛;.!؟?\n]*/gu,purposeKeep);
}
// Fit predicates about the customer's own item («اندازه‌ست», «کافیه», «جا می‌شه», «تكفي/تلبس/تشيل») are grounded only by
// approved wording that states the same fit — never by catalogue sizes alone.
const fitPredicate=/(?<!\p{L})(?:(?:ی|ت)?دخل(?:ه|ها)?\s*(?:\p{L}+\s+){0,1}?(?:ب)?(?:ال)?(?:علب\p{L}*|جعب\p{L}*|داخل)|(?:ی|ت)?سع(?:ها|ه|هم)?|میره\s*توش|می\s*ره\s*توش|اندازه\s*(?:ی\s*)?(?:همین|این)\s*جعب\p{L}*|جا\s*داره|جاداره|جا\s*دارن|یساع\p{L}*|تساع\p{L}*|کافیه|کافی\s*(?:است|هست)|قرار\s*(?:می\s*)?(?:گیر\p{L}*)|(?:توی|تو|داخل)\s+(?:\p{L}+\s+){0,4}?(?:راحت\s+)?(?:می\s*)?(?:ره|رن|جا\s*(?:می\s*)?گیره)(?!\p{L})|(?:می\s*)?ره\s*(?:داخل|تو|توی)\p{L}*|(?:ی|ت)(?:دخل|صیر)\p{L}*\s+(?:ب|بال|في|فی|داخل)\p{L}*|تکفی(?:ه|ها|هم|ک|کم)?|یکفی(?:ه|ها|هم|ک|کم)?|(?:ی|ت)دخل(?:ه|ها)?\s+(?:عادی|زین|تمام|بسهوله|بالضبط|اوکی|مضبوط|بیها)|تلبس|یلبس|تشیل|یشیل|تسع|یسع|تساع|یساع|جا\s*(?:می\s*)?(?:شه|گیره)|جامیشه|اندازهست|اندازه\s*(?:ست|است|هست|میشه|درمیاد|میاد))(?!\p{L})/u;
const epistemicFrame=/(?:دست|بید)\s*(?:من|ما|انا|احنا)\s*(?:نیست|مو|ما|لیس)|نمی\s*خوام\s*(?:\p{L}+\s+){0,5}?(?:بدم|بگم|قول\s*بدم)|(?:هنوز\s*)?(?:مشخص|معلوم|روشن)\s*نیست|در\s*دسترس(?:م|مون|ما)?\s*نیست|مو\s*کامل\p{L}*\s*(?:ب)?(?:ال)?معلومات\p{L}*|(?:بعدنا|بعد|لحد\s*هسه)\s*(?:مو|ما)\s*متاکد\p{L}*|غیر\s*محدد|مو\s*محدد|نمی\s*(?:دونم|دانم)|نمیدونم|نمی\s*(?:تونم|توانم)\s*(?:\p{L}+\s+){0,3}?(?:بگم|بدم|اعلام|تایید|قطعی|قول|تضمین|مطمئن)|(?:ما|مو)\s*(?:اگدر|اکدر|اقدر|اکول|اگول)\s*(?:\p{L}+\s+){0,2}?(?:اذکر|اگول|اکول|احدد|اعطی|انطی|اوعد\p{L}*)|مطم(?:ی|ئ)?ن\s*(?:نیستم|نیستیم|بشیم|بشم|شیم)|(?:اطلاع|اطلاعات|خبر)\p{L}*\s*(?:\p{L}+\s+){0,10}?ندارم|یا\s*نه(?!\p{L})|(?:ما|مو)\s*(?:اعرف|ادری|متاکد\p{L}*|اگدر\s*اوعد\p{L}*|اکدر\s*اوعد\p{L}*)|ما\s*عندی\s*(?:\p{L}+\s+){0,2}?(?:معلوم\p{L}*|خبر|فکره|تفاصیل|تاکید|علم|رقم)|(?<!\p{L})بدونیم(?!\p{L})|قطعی\p{L}*\s*(?:\p{L}+\s+){0,1}?ندارم|ندارم\s*که\s*(?:بگم|قول)|باید\s*(?:\p{L}+\s+){0,2}?(?:ببینیم|چک\s*کنیم|بررسی\s*کنیم)|برای\s*اینکه\s*مطم/u;
const ownerDeferral=/(?:[یت]?(?:قرر|حدد|حسم)\p{L}*|قرار\p{L}*|بید|عند|لل|ل|الی)\s*(?:\p{L}+\s+){0,1}?(?:ال)?(?:مسوول|مسؤول|مسئول|مدیر|صاحب\s*(?:ال)?شغل|صاحب\p{L}*|اداره)(?:\s*(?:وحده|بس|فقط))?|(?:تایید|تصمیم|نظر)\s*(?:ی\s*)?(?:مدیر|صاحب|مالک)\p{L}*(?:\s*مجموعه\p{L}*)?\s*(?:لازمه|لازم\s*است|میخواد|نیاز\p{L}*|داره)|(?:مدیر|صاحب|مالک|المدیر|الاستاذ|الاداره)\p{L}*(?:\s*مجموعه\p{L}*)?\s*(?:\p{L}+\s+){0,2}?(?:تعیین|مشخص|تایید|تصمیم|یحدد|یقرر|یوافق|یثبت)\s*(?:می\s*)?(?:کنه|کند|میکنه|بگیره|میگیره|بکنه)?|(?<!\p{L})(?:با|بید|عند|دست)\s*(?:ی\s*)?(?:مدیر|صاحب|مالک|المدیر|الاستاذ)\p{L}*(?:\s*مجموعه\p{L}*)?|(?:نیاز|احتیاج|لازم|یحتاج|تحتاج)\s*(?:به\s*)?(?:تایید|موافقت|موافقه)\s*(?:\p{L}+\s+){0,1}?(?:مدیر|صاحب|مالک|المدیر)\p{L}*(?:\s*مجموعه\p{L}*)?(?:\s*(?:داره|دارد))?|(?:باید|لازمه)\s*(?:\p{L}+\s+){0,1}?(?:مدیر|صاحب|مالک)\p{L}*(?:\s*مجموعه\p{L}*)?\s*(?:تایید|مشخص|تعیین)\s*(?:کنه|کند)|تصمیم\p{L}*\s*(?:\p{L}+\s+){0,1}?با\s*(?:مدیر|صاحب)\p{L}*/u;
const deferredTopic=/(?<!\p{L})(?:و|ف|ب)?(?:ال)?(?:عربون|موعد|مواعید|قبول|لون|الوان|سعر|خصم|دفع|تاکید|توقیت|اسعار|الاسعار|والاسعار|خصومات|الخصومات|والخصومات|مواعید|المواعید|شغل|الشغل|النهائی|نهائی|طلبک|وهذا|فهذا|هذا|استثنایی|تایید|قیمت|پرداخت|سفارش|ثبت|زمان|تولید|هزینه|تخفیف|استثنا|نهایی|مبلغ|سعر|خصم|طلب|دفع|موعد|وقت|رنگ\s*خارج\s*از\s*لیست|خارج\s*از\s*لیست|لیست)\p{L}*(?!\p{L})/gu;
const businessAssertion=value=>{
 const v=value.replace(/https?\s*\S*|www\s+\S+(?:\s+\S+){0,2}|hamzehibox(?:\s+com)?/giu,' ');
 return /(?<!\p{L}|(?:نمی|نه|ما|مو)\s|(?:باید|بایست|لازمه|بهتره)\s(?:\p{L}+\s){0,2})(?!(?:در)?(?:خدمتیم|ممنونیم|خوشحالیم|منتظریم|متشکریم|مشتاقیم|مخلصیم|نوکریم)(?!\p{L}))(?!ن(?:می|د|یست|کرد|زد|خواه|ساخت|فرست|گیر|دار|بود)\p{L})(?:می\s*)?\p{L}{2,}یم(?!\p{L})/u.test(v)&&!/(?<!\p{L})(?:قدیم|تیم|تنظیم|تقدیم|مستقیم|عظیم|کریم|رحیم|حکیم|مریم|تسلیم|تصمیم|تعمیم|ترمیم|نسیم|سلیم)(?!\p{L})/u.test(v)
  ||/(?<!\p{L}|(?:ما|مو|لا)\s)و?ن(?:طی|بدل|عوض|رسل|سوی|بدی|وصل|شحن|حجز|طبع|خلی|جهز|حط|کتب|جیب|بعث|سلم|خلص|رجع|ضیف|سجل|ثبت|نزل|خفض|حسب|شیل|فصل|ضمن|کفی|وفر|عطی|سو|دز)\p{L}*/u.test(v)
  ||/(?<!\p{L})(?!(?:اینا|اونا|همینا|همونا|اینجا|اونجا|کجا|تنها|بنا|مبنا|معنا|سینا|مینا|رعنا|عدنا|احنا|هنا|انا|اهلنا|الدنیا|دنیا|معنا|حسنا)(?!\p{L}))\p{L}{2,}نا(?:ه|ها|ک|لک|لج|کم)?(?!\p{L})/u.test(v)
  ||/(?<!\p{L}|(?:انی|آنی|اني|آني|انا|من)\s)(?!حاضرم(?!\p{L}))(?:اماده\p{L}*|آماده\p{L}*|حاضر\p{L}*|جاهز\p{L}*|موجود\p{L}*|متوفر\p{L}*|تموم|دستتون\p{L}*|دستت\p{L}*|دستک|میرسه|می\s*رسه|برسه|رسید|یوصل\p{L}*|توصل\p{L}*|تکفی|تلبس|تشیل|حله|اوکی\p{L}*|شروع|صار|انحجز|تثبت|تنفیذ|بالتنفیذ|بالدور|مومن\p{L}*|مامن\p{L}*|قطعی\p{L}*|ثبت|اشانتیون|هدیه|کادو|رند\p{L}*|ورقه|تراول|تومن|دلار|علینا|با\s*ما(?:ست)?|جا\s*میشه|جا\s*می\s*شه|میشه\s*براتون|براتون\s*میشه)(?!\p{L})/u.test(v)
  ||/(?<!\p{L}|(?:ما|مو)\s)(?:عدنا|عندنا)(?!\p{L})/u.test(v)
  ||/(?<!\p{L})(?:فردا|پس\s*فردا|امروز|امشب|هفته\p{L}*|روز|روزه|روزه\p{L}+|ساعت\p{L}*|باچر|بکره|عقبه|یوم|یومین|بیوم\p{L}*|ایام|اسبوع\p{L}*|ساعه|ساعات)(?!\p{L})/u.test(v)
  ||/(?<!\p{L})(?:بهش|توش|داخلش|زیرش|بیها|بیه|فیها|فیه|علیها|بداخلها|جواها|جوا)(?!\p{L})|(?<!\p{L})(?:جنس|ماده|مادت|عمق|ارتفاع|طول|عرض|ضخامت|وزن|بدن|قماش|بطان|بطانت|حجم|مقاومت|لون)(?:ش|اش|ها|ه)(?!\p{L})|(?<!\p{L})بدنه(?!\p{L})/u.test(v)
  ||fitPredicate.test(v)
  ||/[a-z]{2,}/iu.test(v.replace(/(?<![a-z])(?:yes|ok|okay|hi|hello|thanks|thank\s*you|please|welcome|sure)(?![a-z])/giu,' '));
};
function ungroundedAttributeTerms(clause,subjects,facts,options){
 // cv58: a Persian verb/compound split by a ZWNJ («می‌مونه», «امکان‌پذیره») is ONE word, not a verb prefix plus an unknown token.
 let content=normal(typedSpecifications(clause).scalar).replace(/(?<!\p{L})(ن?می) (?=\p{L}{2})/gu,'$1').replace(/(?<=\p{L}{3}) (پذیر(?:ه|ی|ند|ن)?)(?!\p{L})/gu,'$1');
 if(/چاپ|طبع/u.test(content))content=content.replace(/((?:طرح|اطلاعات|پترن)\s+)دلخواه(?:تون|تان|شون)?(?!\p{L})/gu,'$1');
 // Only a known catalogue/knowledge entity is a subject. A free-text guess («جعبه و دیواره‌های کناری …»)
 // is content to be grounded, never removed from the check.
 const catalog=options.catalog||[],entityFacts=options.facts||facts;
 const named=new Set([...(options._index?.models||[...catalog.flatMap(c=>c.models||c.variants?.map(v=>v.configuration)||[]),...entityFacts.map(entityOf).filter(value=>value&&modelLike(value))]),...(options._index?.products||[...catalog.map(c=>c.product),...entityFacts.map(entityOf)].filter(value=>value&&normal(value)!=='global'))].map(normal));
 subjects=subjects.map(subject=>subject&&named.has(normal(subject))?subject:null);
 for(const subject of subjects)if(subject)content=content.replaceAll(normal(subject),' ');
 const scope=subjects.some(Boolean)?facts.filter(fact=>fact.fromCatalog||subjects.some(subject=>subject&&factAppliesToEntity(fact,subject,options))):facts;
 const tokens=new Set(scope.flatMap(fact=>(fact.values||[]).flatMap(value=>normal(value).split(' ').map(stem))));
 // Approved words also count in their Arabic masculine/unmarked form («ذهبیه» → «ذهبی») and Persian ezafe form («لوگوی» → «لوگو»).
 for(const token of [...tokens])for(const ending of ['یه','ه','ی'])if(token.length-ending.length>=3&&token.endsWith(ending))tokens.add(token.slice(0,-ending.length));
 // Arabic colour adjectives: feminine faʿlāʾ ↔ masculine afʿal («سوداء» ↔ «اسود», «بیضاء» ↔ «ابیض»).
 for(const token of [...tokens]){const m=token.match(/^(?:ال)?(\p{L}{3})اء$/u);if(m)tokens.add('ا'+m[1]);}
 // Arabic proclitics on the evidence side («بسعر العلبة» evidences «سعر»).
 for(const token of [...tokens])for(const clitic of ['بال','وال','لل','ال','ب','ل','و'])if(token.startsWith(clitic)&&token.length-clitic.length>=3)tokens.add(token.slice(clitic.length));
 for(const token of [...tokens])if(token.endsWith('ء'))tokens.add(token.slice(0,-1));
 const derived=word=>{const w=word.replace(/ء$/u,'');return ['یی','ای','ایی'].some(suffix=>{if(!w.endsWith(suffix))return false;const base=w.slice(0,-suffix.length);return base.length>=3&&[...tokens].some(token=>token!==base&&token.startsWith(base)&&token.length-base.length<=4);});};
 // Colour-PRINTING words are never grounded by the colour word «رنگ» («رنگی» ≠ «رنگ»): they need their exact token.
 const strictValue=/^(?:و?(?:تمام\s*)?رنگی|و?ملون\p{L}*|بال?الوان|کالر|فول)$/u;
 const known=word=>strictValue.test(word)?tokens.has(word):(word.length>=4&&[...tokens].some(token=>token.startsWith(word)&&token.length-word.length<=3))||wordKnownIn(word,tokens)||wordKnownIn(word.replace(/^و/u,''),tokens)||wordKnownIn(word.replace(/ء$/u,''),tokens)||[...tokens].some(token=>token.length>=4&&word.startsWith(token)&&word.length-token.length<=3)||derived(word);
 // A word carrying the customer's/our possessive («برندتونه», «عطرتون») or an Iraqi second-person object
 // («تهمک», «یعجبک») is about the customer, not a product attribute value. A final «ی» is an adjective
 // («زیتونی», «لیمونی»), not a possessive.
 const personal=word=>!attributeValue.test(word)&&(/\p{L}{2,}(?:تون|تان|شون|مون)(?:ه|و)?$/u.test(word)||/^[تینا]\p{L}{2,5}(?:ک|کم|ج)$/u.test(word));
 const neutralOne=word=>word.length<3&&!attributeValue.test(word)&&!printSurface.test(word)||stop.has(word)||preferenceWords.has(word)||discourseWords.has(word)||personal(word)||/^\d+$/.test(word)||slotFiller.has(word)||photoWords.test(word)&&!printingContext;
 const neutral=word=>neutralOne(word)||!attributeValue.test(word)&&!colourName.test(word)&&neutralOne(word.replace(/^(?:وال|بال|و|ال)(?=\p{L}{3})/u,''));
 const words=content.split(' ').map(stem).filter(Boolean).filter((word,index,all)=>!(/^دلخواه\p{L}*$/u.test(word)&&index>0&&/^(?:چاپ|طباعه|طرح|اطلاعات|پترن|لوگو|اسم|نقش|تصمیم|عباره)\p{L}*$/u.test(all[index-1]))),missing=new Set();
 const printingContext=!!options.printingSentence||words.some(word=>/^(?:چاپ\p{L}*|\p{L}{0,3}طبع\p{L}*|\p{L}{0,3}طباع\p{L}*|print\p{L}*)$/u.test(word)||/کوب/u.test(word));
 // Open vocabulary with grounded attribute SLOTS: ordinary words (names, verbs, dialect, politeness) are free;
 // what must be approved is (1) every attribute-value word (material, technique, finish, surface, stock),
 // (2) the one or two content words that fill a printing/material head («چاپ X», «طباعة X», «جنس X»), and
 // (3) in an existence clause, the noun phrase right before «داریم/موجود/متوفر/عدنا».
 // A proclitic/suffix-reduced form that is itself approved or neutral (cv50d); reduction adds no evidence of its own.
 // cv58: proclitic CHAINS («و+لل+علم», «و+ال+الوان», «ف+بال») and the «‑پذیر» predicate suffix («امکان‌پذیره» → «امکان») reduce
 // too; a reduction only ever reaches an already-known or neutral word, so it adds no evidence of its own.
 const morphKnown=w=>{const forms=new Set();const base=w.replace(/^(?:وال|بال|لل|و|ب|ف)(?=\p{L}{3})/u,'');const base2=base.replace(/^(?:وال|بال|لل|ال|ب|ل)(?=\p{L}{3})/u,'');const base3=w.replace(/پذیر(?:ه|ی|ند|ن)?$/u,'');for(const x of [w,base,base2,base3]){forms.add(x);const m=x.match(/^(\p{L}{3,}?)(?:هامونن|هامونه|هامون|هاتون|هاشون|هایی|های|ها|اتنا|اتکم|اتها|ات|ینا|نا|کم|مون|تون|شون|ای|ی|ه|ن)$/u);if(m)forms.add(m[1]);}forms.delete(w);return [...forms].some(v=>v.length>=3&&(known(v)||neutral(v)));};
 const check=word=>{if(!printObject.test(word)&&!neutral(word)&&!verbLike(word)&&!verbLike(word.replace(/^و/u,''))&&!known(word))missing.add(word);};
 // A value word (technique, finish, metal, material, print location in a printing clause, photo in a printing
 // clause) is ALWAYS grounded: no filler/discourse/verb/possessive filter can hide it.
 const force=word=>{if(!known(word))missing.add(word);};
 // Colour names: exact approved tokens only (no prefix/derivation from foil words or model names).
 const colourTokens=new Set(scope.filter(fact=>!fact.fromCatalog&&fact.category!=='availability').flatMap(fact=>(fact.values||[]).flatMap(value=>normal(value).split(' '))));
 const colourKnown=word=>{const w=word.replace(/^(?:وال|بال|و|ال)(?=\p{L}{3})/u,'');return colourTokens.has(word)||colourTokens.has(w)||[...colourTokens].some(t=>t===w+'ه'||t===w+'یه'||w===t+'ه');};
 const capabilityTokens=new Set(scope.filter(fact=>fact.category==='capability').flatMap(fact=>(fact.values||[]).flatMap(value=>normal(value).replace(modelName,' ').split(' ').map(stem))));
 const catalogOnly=word=>{const fromFacts=new Set(scope.filter(fact=>!fact.fromCatalog&&fact.category!=='availability').flatMap(fact=>(fact.values||[]).flatMap(value=>normal(value).split(' ').map(stem))));return !wordKnownIn(word,fromFacts);};
 // Words of the approved record TEXT itself (owner-taught sentences such as care instructions), never catalogue strings (cv44).
 const approvedTextTokens=new Set(scope.filter(fact=>!fact.fromCatalog&&(typeof fact.raw_text==='string'||fact.source==='approved_knowledge'&&Array.isArray(fact.values)&&fact.values.length>2)).flatMap(fact=>normal(typeof fact.raw_text==='string'?fact.raw_text:fact.values.slice(2).filter(v=>typeof v==='string').join(' ')).split(' ').map(stem)));
 // cv58: the owner-approved ribbon rule («چاپ روی روبان اختیاری است و هزینه‌اش را مدیر تعیین می‌کند») — a ribbon surface stated
 // together with its optional/owner-priced status restates that rule (the same exemption the assertion pass already applies).
 const ribbonRule=/اختیار\p{L}*|یحدد\p{L}*|تحدد\p{L}*|صاحب|مدیر/u.test(content);
 const forceSurface=word=>{if(ribbonRule&&/^(?:ال|بال|و|ب)?(?:شریط|روبان|ربان)\p{L}*$/u.test(word))return;if(!wordKnownIn(word,capabilityTokens)&&!wordKnownIn(word.replace(/ء$/u,''),capabilityTokens))missing.add(word);};
 // Surfaces («کف», «دیواره», «جوانب») are print-location values only when the clause is about printing; as part
 // names in a colour sentence («درب و کف یه رنگ») they paraphrase the approved top/bottom sections.
 const printing=printingContext;
 words.forEach((word,index)=>{
  if(colourName.test(word)&&!((index===0||/^(?:هلا|اهلا|اهلین|مرحبا|هله|یا)$/u.test(words[index-1]||''))&&/^(?:بیج|بیک|بیکم)$/u.test(word))&&!colourKnown(word))missing.add(word);
  if(attributeValue.test(word)||printing&&(photoWords.test(word)||/^و?(?:تمام)?رنگی$/u.test(word)))force(word);
  if(printing&&printSurface.test(word))forceSurface(word);
  if(printing&&/^زیر$/u.test(word)&&/^(?:جعبه|علبه|کار|بسته)/u.test(words[index+1]||''))missing.add('زیر '+(words[index+1]||''));
  // «مسی‌کوب» is written «مسی کوب»: the word before a «کوب» token is the foil colour.
  if(word==='کوب'&&index>0)force(words[index-1]);
  // Persian verb-final printing («طرح روی ساک بیرونی چاپ بشه»): the object/location slot precedes the head.
  const nextWord=words[index+1];
  if(attributeHead.test(word)&&/^(?:چاپ|print)/u.test(word)&&(!nextWord||verbLike(nextWord)||/^(?:بشه|میشه|شه|بشن|کنیم|کرد|کنید|زد|زده|شده|شود|میشن|بزنیم)$/u.test(nextWord))){let filled=0;for(let prev=index-1;prev>=0&&prev>=index-5&&filled<3;prev--){const w=words[prev];if(verbLike(w)||attributeHead.test(w))break;if(neutral(w))continue;filled++;check(w);}}
  if(attributeHead.test(word)){const width=/^(?:جنس|روکش|آستر|استر|بطانه|مصنوع)/u.test(word)?2:1;let filled=0;for(let next=index+1;next<words.length&&next<=index+4&&filled<width;next++){const w=words[next];if(verbLike(w)||verbLike(w.replace(/^و/u,''))||slotEnd.test(w))break;if(neutral(w)||w.startsWith(word.slice(0,3)))continue;filled++;check(w);if(!missing.has(w)&&!neutral(w)&&!verbLike(w)&&!wordKnownIn(w,capabilityTokens)&&!colourKnown(w)&&catalogOnly(w)&&!wordKnownIn(w,approvedTextTokens))missing.add(w);}}
 });
 if(options.strictAll){
  {const fitText=facts.filter(f=>!f.fromCatalog&&f.category!=='size').map(f=>normal(JSON.stringify(f.values||[])+' '+(f.raw_text||''))).join(' ');
   const fitHits=normal(content).match(new RegExp(fitPredicate.source,'gu'))||[];
   for(const hit of fitHits)if(!(' '+fitText+' ').includes(' '+hit+' '))missing.add(hit);}
  // cv58: in a colour-section sentence (colour words, no printing), a box-part synonym is the approved section name; in a
  // printing sentence it stays a print-surface value (forced above). A dimension noun without any number states no value.
  // only the approved top/bottom pairing («درب و کف یه رنگ»), never an interior part («کف داخلش رنگ مشکیه»)
  const colourSection=!printingContext&&/(?<!\p{L})(?:رنگ\p{L}*|لون|الوان|الالوان|همرنگ|یکرنگ|یه\s+رنگ)(?!\p{L})/u.test(content)&&/(?<!\p{L})(?:درب|بالا|الغطاء|غطاء)(?!\p{L})/u.test(content)&&!/(?<!\p{L})(?:داخل\p{L}*|جوه|جواها|بطانه|استر|آستر)(?!\p{L})/u.test(content);
  const partKnown=w=>colourSection&&PART_ALIAS[w]&&known(PART_ALIAS[w]);
  const dimensionWord=w=>!/[0-9۰-۹٠-٩]/u.test(String(clause))&&/^(?:و|ال|وال)?(?:طول|عرض|ارتفاع|قطر|عمق|ابعاد|اندازه|قیاس|مقاس|حجم)(?:ش|ها|ه|ک|ج)?$/u.test(w);
  const bodyContext=/(?<!\p{L})(?:بدنه|جسم)\p{L}*/u.test(content)&&facts.some(f=>/میانی|اوسط/u.test(JSON.stringify(f.values||[])));
  const ribbonOptional=/اختیار\p{L}*|یحدد\p{L}*|صاحب|مدیر/u.test(content);
  for(const w of words)if(!partKnown(w)&&!dimensionWord(w)&&!(bodyContext&&/^(?:وسط|وسطی|وسطانی|الوسطانی|میانه)$/u.test(w))&&!(ribbonOptional&&/^(?:شریط|الشریط|روبان|ربان)\p{L}*$/u.test(w))&&!(options.denial&&denialVocabulary(w))&&!(options.shippingLexicon&&shippingLexiconWord(w))&&!isPlaceWord(w)&&!neutral(w)&&!(w.replace(/(?:ش|اش|تون|تان|ت)$/u,'').length>=3&&neutral(w.replace(/(?:ش|اش|تون|تان|ت)$/u,'')))&&!verbLike(w)&&!verbLike(w.replace(/^و/u,''))&&!((options.markets||[]).includes('ARAB')&&arabicVerbForm(w))&&!(/^(?:(?:ن?می|ب|ن)\p{L}{2,}(?:ید|ین)|(?:داشت|خواست|گفت|دید|کرد|فرستاد|داد|بود|شد|زد|پرسید|گرفت)(?:ید|ین|ی))$/u.test(w)&&!/(?:ترین|سفید|تولید|خرید)$/u.test(w))&&!/^\d/u.test(w)&&!known(w)&&!known(w.replace(/(?:ش|اش|تون|تان|ت)$/u,''))&&!known(w.replace(/(?:هایی|های|ها|ای)$/u,''))&&!(/^ساک/u.test(w)&&known(w.replace(/^ساک/u,'بگ')))&&!(attributeHead.test(w.replace(/(?:هایی|های|ها|ای)$/u,''))&&facts.some(f=>!f.fromCatalog))&&!(/[0-9۰-۹٠-٩]/u.test(String(clause))&&/^(?:قیاس|مقاس|سایز|اندازه|ابعاد|ابعادش|قیاسه|قیاسها|مقاسه|مقاسها)$/u.test(w))&&!printObject.test(w)&&!morphKnown(w))missing.add(w);
  if(options.requireAnchor!==false&&!subjects.some(Boolean)&&!/\d/u.test(content)&&!words.some(w=>!neutral(w)&&!verbLike(w)&&!/^\d/u.test(w)&&known(w))&&!words.some(w=>attributeHead.test(w.replace(/(?:ها|های|هاى|ش|اش)$/u,''))&&facts.some(f=>!f.fromCatalog)))missing.add('∅');
 }
 if(options.existence){const at0=words.findIndex(word=>/^(?:داریم|داره|دارن|موجود\p{L}*|متوفر\p{L}*|یتوفر|تتوفر|عدنا|اکو)$/u.test(word));const needs=at0>=0&&(/^(?:داره|دارن)$/u.test(words[at0])&&words.slice(Math.max(0,at0-5),at0).some(w=>/^(?:نیاز|احتیاج|بستگی|لزوم|ربط|فرق|اشکال|مشکل|لازم|جا|فضا)$/u.test(w))||words.slice(Math.max(0,at0-3),at0).some(w=>/^(?:لازم|بشرط|شرط|اذا|لو|اگه|اگر|حتی|یجب|تکون|یکون|لازمه)$/u.test(w)));const at=needs?-1:at0;if(at>0){let filled=0;for(let prev=at-1;prev>=0&&prev>=at-6&&filled<4;prev--){const w=words[prev];if(neutral(w)||verbLike(w))continue;filled++;check(w);}}
  // Iraqi existence is verb-first: the variants FOLLOW «عدنا/اکو/یتوفر».
  if(at>=0&&/^(?:عدنا|اکو|یتوفر|تتوفر|متوفر\p{L}*)$/u.test(words[at])){let filled=0;for(let next=at+1;next<words.length&&next<=at+5&&filled<3;next++){const w=words[next];if(verbLike(w))break;if(neutral(w))continue;filled++;check(w);}}}
 return [...missing].filter(w=>!(ribbonRule&&/^(?:ال|بال|و|ب)?(?:شریط|روبان|ربان)\p{L}*$/u.test(w)));
}
// Fillers inside an attribute slot («چاپ روی درب», «طباعة على الغطاء») — prepositions and articles only.
// A predicate ends an attribute slot («چاپ هزینه‌ای نداره», «الطباعة … كلها داخلة»).
const slotEnd=/^(?:رایگان\p{L}*|مجانی\p{L}*|مجان\p{L}*|مفت\p{L}*|ببلاش|نمی|است|هست|میشه|شده|شود|کرد|کنید|که|تا|اگه|اگر|ولی|اما|نداره|ندارد|نیست|داره|داریم|کلها|کله|مشموله|داخله|ضمن|بیها|ما|مو|لا|میخوره|خوره|میاد|درمیاد|انجام)$/u;
const slotFiller=new Set('هزینه هزینهای قیمت کلفه سعر اضافه بیشتر مدل مودیل مودیلات مدلها اسم صوره قسمتها باید بایست لازم لازمه میتونه ممکن یمکن کامل روی رو را به صورت بصورت هم با از در و یا برای بر روش علی علیه علیها علیهم فوق فوگ عل بال ال کل هر یک یه بخش جزء جز قطعه قسمت تکه موجود موجودی متوفره متوفر استاندارد دیگه دیگر ثانی متفاوت مختلف لیست فهرست خارج بروح بروحه بروحها وحده لوحده جدا جداگانه بعدین وبعدین'.split(' '));
// Heads whose following words name the approved variant; values that ARE attribute claims by themselves.
// A colour head («رنگ X», «اللون X») names the colour: an unlisted one («البنفسجي الغامق») is an invented variant.
const attributeHead=/^(?:چاپ\p{L}*|\p{L}{0,3}طبع\p{L}*|\p{L}{0,3}طباع\p{L}*|جنس\p{L}*|روکش\p{L}*|آستر|استر|بطانه|مصنوع\p{L}*|print\p{L}*|رنگ|لون|colou?r)$/u;
const printSurface=/^(?:نوار\p{L}*|زیرش|زیرشم|زیرشون|پایین|بالا|وسط|بالشت\p{L}*|مخده|وساده|روبان(?:ش|ها|هاش)?|ربان\p{L}*|شریط\p{L}*|کف|ته|دیواره\p{L}*|کناری|کناره\p{L}*|بغل|لبه\p{L}*|گوشه\p{L}*|دسته\p{L}*|روبان|ربان|شریط|جوانب|جانب\p{L}*|حواف|حافه|کعب|القاع|قاع|قاعده|القاعده|(?:ال)?داخل(?:ش|ی|یش)?|پشت|ظهر|کل)$/u;
// Values: printing techniques, finishes, metals/foil colours, materials, stock. Colour NAMES are handled by the
// colour-head slot and the existence check; these words make a feature claim on their own.
// Colour names form a closed semantic class; a named colour must be an approved colour of this market.
const colourName=/^(?:و|ال|وال|بال)?(?:قرمز|سرخ|ابی|سبز|زرد|نارنجی|بنفش|صورتی|سفید|سیاه|طوسی|خاکستری|قهوه\s*ای|قهوهای|کرم|کرمی|بژ|سرمه\s*ای|سرمهای|سورمهای|لاجوردی|فیروزه\s*ای|فیروزهای|یاسی|زرشکی|عنابی|زیتونی|طلایی|نقره\s*ای|نقرهای|شیری|صدفی|ارغوانی|گلبهی|نباتی|لیمویی|نعنایی|بادمجونی|بادمجانی|کالباسی|سبزابی|سبز\s*ابی|یشمی|مسی|مسیرنگ|احمر|حمراء|ازرق|زرقاء|اخضر|خضراء|اصفر|صفراء|برتقالی|بنفسجی|وردی|ابیض|بیضاء|رمادی|رصاصی|بنی|جوزی|بیج|کحلی|سمائی|فیروزی|خمری|نیلی|لیلکی|موف|شمپانی|نهدی|red|blue|green|yellow|orange|purple|pink|white|grey|gray|brown|beige|navy|turquoise|olive|maroon)$/u;
const attributeValue=/ناتی|ناتئ|نافر|غائر|غایر|برآمده|برامده|محدب|مقعر|سه\s*بعدی|ثلاثی\s*الابعاد|کوب|فویل|فول|کالر|برجسته|بارز|یووی|^uv$|لمینت|سلفون|حکاکی|محفور|حفر|لیزر|ملون|^بال?الوان$|دیجیتال|افست|سیلک|هولوگرام|متالیک|میناکاری|تطریز|گلدوزی|گالینگور\p{L}*|ام\s*دی\s*اف|mdf|پلکسی\p{L}*|ترمه\p{L}*|اسپات|^پرس$|ابریشم\p{L}*|قماش|ساتان|قطیفه|حریر|اسفنج|ضد\s*ماء|^ماء$|رطوب\p{L}*|^(?:مس|مسی|نحاس\p{L}*|برنز\p{L}*|برونز\p{L}*|رزگلد|رزگولد|روزگولد|گلد|گولد|گولدن|سیلور|کاپر|copper|bronze|rose|silver|gold|وردی|مات|براق\p{L}*|مطفی|لامع\p{L}*|عیار|طلق|پنجره)$|چرم|جلد|مخمل|پارچه|ساتن|حریر|چوب|خشب|فلز|معدن|پلاستیک|بلاستیک|مقوا|کاغذ|کرافت|اسفنج|فوم|انبار|مخزن|موجودی|جاهز|emboss|velvet|leather|wood|foil|stock/u;
// Ordinary language that names no product attribute (shared by the slot check and the legacy description check).
function ordinaryWord(word){
 if(attributeValue.test(word)||colourName.test(word)||risky.test(word)){risky.lastIndex=0;return false;}risky.lastIndex=0;
 const bare=word.replace(/^(?:وال|بال|و|ال)(?=\p{L}{3})/u,'');
 return [word,bare].some(w=>/^(?:تون|توان|کن|خور|زن|ش|ر|خوا|گ|بین|دون|دان|یار|گیر|ذار|بر|کش|ساز|رس|فرست|دار|گذار|بند|بیند|اند)(?:م|ی|ه|یم|ید|ین|ن|ند|د)$/u.test(w)||stop.has(w)||preferenceWords.has(w)||discourseWords.has(w)||slotFiller.has(w)||verbLike(w)||/\p{L}{2,}(?:تون|تان|شون|مون)(?:ه|و)?$/u.test(w)||/^[تینا]\p{L}{2,5}(?:ک|کم|ج)$/u.test(w)||/^ب(?:خوا|ذار|نداز|ین|گیر|فرست|زن|ریز|کن|ش|بین|گو)\p{L}*$/u.test(w));
}
const preferenceWords=new Set(('اطمینان قطعی ندارم ولی با توجه به اطلاعاتی که داریم این همین مدل احتمالا انتخاب گزینه مناسبیه مناسب خوبی خوب شیک شیکتر زیبا زیباتر ظاهر سلیقه سلیقهتون به نظرم نظر من پیشنهاد اولیه اولیهام اولیهامم میتونه می تواند باشه باشد میشه اگر اگه برای شما براتون بخواید مهم مهمه از بین اینها اون ان هم و یا رو را میکنم می کنم ترجیح میدم می دهم توصیه برندسازی برنددار طراحی ترکیب رنگ بهتر حس ساده سادهتر جلوه داشته باشه بسته بندی نوع عطر عطرتون انصحک اقتراحی اولی مبدیی حسب المعلومات المتوفره من ناحیه شکل یمکن یکون خیار مناسب اذا ترید احلی برايي برأيي قد ممكن').split(' '));
const pureUncertainty=value=>/^(?:اطمینان قطعی ندارم|اطلاعاتم کامل نیست|این مورد هنوز دقیق تایید نشده|این مورد هنوز تایید نشده|مو متاکد|بعدنی مو متاکد)$/u.test(normal(value));
function qualifiedPreference(text,subjects,options){
 const value=normal(text);
 if(!/احتمالا|به نظرم|پیشنهاد اولیه|می\s*تونه|می\s*تواند|مبدیی|اقتراحی|یمکن|برايي|ممکن/u.test(value)||!/انتخاب|گزینه|پیشنهاد|ترجیح|توصیه|انصح|اقتراح|خیار/u.test(value))return false;
 if(!subjects.length||typedSpecifications(text).dimensions.length||/[0-9۰-۹٠-٩]/u.test(text)||/اندازه|ابعاد|سایز|قیاس|مقاس|فوم|اهنربا|مگنت|محافظ|ضربه|جنس|چرم|مقوا|مکانیزم|موجود|متوفر|قیمت|هزینه|تخفیف|بیعانه|پرداخت|ارسال|تحویل|شحن|عربون|خصم|سعر|دفع/u.test(value))return false;
 // Option 2 (open vocabulary): evaluative wording is free. What stays closed is any FACTUAL
 // content: no feature/protection term (risky), no fit/size/stock/price/shipping (above), and
 // any stated reason («چون…», «از نظر…», «به خاطر…») must reuse a term of the subject's own
 // approved fact — an invented reason cannot ride along a hedge.
 risky.lastIndex=0;if(risky.test(value))return false;
 // A hedge never carries an unapproved attribute value («با چاپ تمام‌رنگی گزینه خوبیه»).
 if(attributeConcept.test(value)&&ungroundedAttributeTerms(text,subjects,options.facts.filter(fact=>['capability','material','color','availability'].includes(fact.category)),options).length)return false;
 // Superlative / popularity / durability / luxury claims are not approved product facts.
 if(/پرفروش|محبوب|بهترین|لوکس|دوام|ماندگار|بادوام|کیفیت\s*(?:بالا|عالی)|درجه\s*یک|ممتاز|الافضل|الاکثر\s*مبیعا|best|luxury|durab/u.test(value))return false;
 const subjectFacts=subjects.map(subject=>options.facts.filter(fact=>['capability','material','color'].includes(fact.category)&&factAppliesToEntity(fact,subject,options)&&(fact.values||[]).length));
 if(subjectFacts.some(list=>!list.length))return false;
 const reason=value.match(/(?:چون|چونکه|به\s*خاطر|بخاطر|به\s*دلیل|از\s*نظر|از\s*لحاظ|لان|لانه|بسبب|من\s*ناحیه)\s+(.+)$/u)?.[1];
 if(reason){
  let reasonText=reason;for(const subject of subjects)reasonText=reasonText.replaceAll(normal(subject),' ');
  const approved=new Set(subjectFacts.flat().flatMap(fact=>(fact.values||[]).flatMap(v=>normal(v).split(' ')).filter(word=>word.length>=3)));
  const content=reasonText.split(' ').filter(word=>word.length>=3&&!preferenceWords.has(word)&&!stop.has(word));
  // Every content word of the reason must be an approved term (or the customer's own brand);
  // one approved word can no longer carry invented ones along.
  const neutral=/^(?:برند|برندتون|برندتان|لوگو|لوگوتون|ظاهر|امکان|نظر|طرح|اسم|علامه|ماركه)$/u;
  if(content.length&&!content.every(word=>neutral.test(word)||approved.has(word)||approved.has(word.replace(/(?:ها|های|ش|اش|تون|ی)$/u,''))))return false;
 }
 return true;
}
export function informationalClaimAssessment(text,options={}){
 const facts=(options.authoritativeFacts||[]).filter(fact=>!options.markets?.length||!fact.market||options.markets.includes(fact.market));
 const shipping=shippingClaimAssessment(text,{...options,authoritativeFacts:facts});
 if(shipping.applicable)return shipping;
 if(pureUncertainty(text)||honestInformationGap(text))return {applicable:true,valid:true,kind:'explicit_uncertainty',sources:[]};
 const subjects=claimEntities(text,{facts,catalog:options.catalog||[],selectedProductKey:options.selectedProductKey});
 if(qualifiedPreference(text,subjects,{facts,catalog:options.catalog||[]}))return {applicable:true,valid:true,kind:'qualified_recommendation',sources:[]};
 return {applicable:false,valid:true};
}
export function informationalClaims(text,options={}){
 const context={};
 return splitSalesReply(text).map(clause=>({text:clause,assessment:informationalClaimAssessment(clause,{...options,context})}));
}
for(const word of 'پیشنهاد توصیه ترجیح اولیه میکنم کنم دهم بین وجود تایید مودیل چون بنابراین دلیل همین منظور مدنظر درخواست خواسته نظر ظاهر شیک زیبایی امکانش میتونید داشته باشید بله سلام مثلا طباعة طباعه طلبتها اللي تخص اقتراح اقتراحي انصح انصحک اول من ناحیه حتی اذا لان'.split(' '))stop.add(word);
// Discourse/preference words carry no material, mechanism or commercial authority.
for(const word of 'دلیلش اینه عنوان'.split(' '))stop.add(word);
export function productAssertionIssue(text,{authoritativeFacts=[],catalog=[],selectedProductKey=null,requireEvidence=false,markets=[],shippingPolicyChecks=true,engineDocument=false}={}){
 const facts=authoritativeFacts,options={facts,catalog,selectedProductKey,_index:{models:[...new Set([...catalog.flatMap(c=>c.models||c.variants?.map(v=>v.configuration)||[]),...facts.map(entityOf).filter(value=>value&&modelLike(value))])],products:[...new Set([...catalog.map(c=>c.product),...facts.map(entityOf)].filter(value=>value&&normal(value)!=='global'))],factModels:new WeakMap()}};let previous=[],explicitScope=false;
 // Build polarity and scope indexes once per validation. Nothing is cached across
 // turns/customers, and a source that changes gets a new independent validation.
 const eligibleByPolarity=[false,true].map(negative=>facts.filter(fact=>['capability','material','availability','color','size'].includes(fact.category)).map(fact=>({...fact,values:(fact.values||[]).filter(value=>negativeFeature(value)===negative)})));
 const eligibleAll=facts.filter(fact=>['capability','material','availability','color','size'].includes(fact.category));
 const productParts=[],shippingContext={},shippingPart=new Set();
 for(const sentence of splitSalesReply(text)){
  const shipping=shippingPolicyChecks?shippingClaimAssessment(sentence,{authoritativeFacts:facts,markets,context:shippingContext,destination:facts.find(f=>f.source==='customer_stated'&&f.category==='destination')?.values?.[0]}):null;
  // A valid shipping sentence no longer shields its non-shipping parts: a product claim
  // joined to it («… و کشویی کج برای عطر مناسبه») is still checked as a product claim.
  if(shipping?.applicable){if(!shipping.valid)return shipping;for(const part of shippingSubParts(sentence)){if(honestInformationGap(part))continue;if(!shippingClaimAssessment(part,{authoritativeFacts:facts,markets,context:{...shippingContext}}).applicable)productParts.push(part);else shippingPart.add(part);}}else productParts.push(sentence);
 }
 let attributeTopic=false;
 const sentenceOf=clause=>{const c=normal(clause);return productParts.find(part=>normal(part).includes(c))||clause;};
 // Reply-level product topic: an existence clause in a reply about colours/printing/models is a product claim.
 const replyTopic=productParts.some(part=>{const v=normal(part);return attributeConcept.test(v)||modelLike(v)||/(?<!\p{L})(?:رنگ\p{L}*|لون|الوان|الالوان|colou?rs?)(?!\p{L})/u.test(v);});
 // Cross-record compatibility: a technique may be paired with a surface only as one approved record segment pairs them.
 const printFacts=facts.filter(fact=>['capability','availability'].includes(fact.category)&&(!markets.length||!fact.market||markets.includes(fact.market)));
 {let model=selectedProductKey&&/بگ|کیس/u.test(normal(selectedProductKey))?'bag':null;for(const part of productParts){model=sentenceModel(part,model);if(!printingSentence(part)||nonCommittalClause(part))continue;if(multiColourPrint(part))return {valid:false,reason:'unsupported_printing_combination',unsupported_values:['multicolour_print']};const pair=printingPairIssue(part,printFacts,model);if(pair)return {valid:false,reason:'unsupported_printing_combination',unsupported_values:[pair]};}}
 // Positive grounding of business assertions, sentence by sentence (shipping-valid sentences are already grounded).
 {const catalogFacts=[...eligibleAll,...catalog.map(entry=>({entity_key:'global',fromCatalog:true,values:[JSON.stringify(entry)]})),...facts.filter(f=>f.source==='customer_stated'&&f.category==='destination').map(f=>({...f,fromCatalog:true}))];
  const shippingFacts=[...catalogFacts,...facts.filter(f=>f.category==='shipping'&&f.source==='approved_knowledge'&&(!markets.length||!f.market||markets.includes(f.market))),...facts.filter(f=>f.source==='customer_stated'&&f.category==='destination')];
  for(const part of engineDocument?[]:[...productParts,...shippingPart]){
   if(nonCommittalClause(part))continue;
   // Segments (punctuation / contrast connectors) that are an explicit epistemic frame assert nothing and are dropped;
   // owner-deferral segments keep their content but the deferral phrase and the deferred topic are not business facts.
   const segments=assertionCore(committalPortionLegacy(maskPropositionScopes(part)).replace(infoAct,' ').replace(/(?<!\p{L})ساک(?=\p{L}*)/gu,'بگ')).split(/[،,؛;:]|(?<!\p{L})(?:ولی|اما|بس|لکن|لاکن|بلکه|منتها|ولکن)(?!\p{L})/u)
    .filter(seg=>!nonCommittalClause(seg))
    .map(seg=>{let v=normal(seg);if(!epistemicFrame.test(v))return seg;for(let k=0;k<4&&epistemicFrame.test(v);k++)v=dropEpistemicTopic(v);return v;})
    .map(seg=>ownerDeferral.test(normal(seg))?normal(seg).replace(new RegExp(ownerDeferral.source,'gu'),' ').replace(deferredTopic,' '):seg);
   let committal=segments.join('، ').replace(infoAct,' '),v=normal(committal);if(!v.trim()||!v.replace(/\s+/gu,''))continue;
   if(rhetoricalHost(committal)!==null){const host=rhetoricalHost(committal);if(host.trim()){const hv=normal(host);const hm=ungroundedAttributeTerms(host,[null],shippingFacts,{...options,markets,strictAll:true,shippingLexicon:shippingTopic.test(hv),requireAnchor:businessAssertion(hv),denial:denial(hv)}).filter(w=>!(denial(hv)&&denialVocabulary(w)));if(hm.length)return {valid:false,reason:'unverified_business_assertion',unsupported_values:hm.slice(0,8)};}continue;}
   // Only the interrogative clause is exempt; declarative clauses before it are still claims (C1).
   if(/[؟?]\s*$/u.test(String(committal).trim())&&!/(?<!\p{L})(?:می\s*|ب)?\p{L}{2,}یم(?!\p{L})|(?<!\p{L})و?ن(?:طی|سوی|طبع|رسل|بدل|عوض)\p{L}*/u.test(v)){const rest=String(committal).replace(/[^،,؛;.!\n]*[؟?]\s*$/u,' ');if(!normal(rest).trim())continue;committal=rest;v=normal(rest);}
   // DEFAULT-ASSERT: every remaining declarative sentence is an evidence-bearing statement. A business trigger additionally
   // requires at least one approved content word; requests to the customer are not statements.
   const triggered=businessAssertion(v);
   if(!denial(v)&&/(?<!\p{L})(?:همین|همون|همان)\s*(?:\p{L}+\s+){0,1}?(?:امکان|امکانات|چاپ|حالت|ویژگی|قابلیت|کار|طرح|مدل|شرایط)\p{L}*|(?<!\p{L})(?:هم\s*همینطور|همینطوره|همین\s*طور|نفس\s*(?:ال)?(?:شی|طباعه|خاصیه|امکانیه|شغل)|کذلک|هم\s*نفس)(?!\p{L})/u.test(v)&&(claimEntities(committal,{...options,selectedProductKey:null}).length||modelLike(v)))return {valid:false,reason:'unsupported_capability_transfer',unsupported_values:[v.slice(0,40)]};
   if(!denial(v)&&!/[؟?]\s*$/u.test(String(committal).trim())){const invented=unknownModelPhrase(committal,options._index.models);if(invented)return {valid:false,reason:'unsupported_product_variant',unsupported_values:[invented]};}
   if(!triggered&&requestSentence(v))continue;
   // PROPOSITIONS: each coordinated / contrasted clause is its own claim. A negation, a hedge or an anchor belongs to the
   // proposition that carries it, never to its neighbours («روکشش مخمله و مقوای معمولی نیست» = two propositions).
   const sentenceSubjects=claimEntities(committal,{...options,selectedProductKey:null});
   const productionFree=productionServiceOnly(part);
   for(const prop of propositionsOf(committal)){
    const pv=normal(prop);if(!pv.trim())continue;
    // cv58 CUSTOMER-DIRECTED proposition: its subject/agent is the customer («تگدر تشوف الموديلات», «اسم و جمله رو بفرستید»,
    // «اگه انگشترتون نگین درشت داره», «حتى الزبون يتواصل وياك»). It asserts nothing about our business, so its ordinary words
    // are not grounded against the closed vocabulary. Attribute values in it (colours, techniques, surfaces, materials) are
    // still force-checked below by the attribute-slot pass, and any business trigger (1pl verb, time, stock, fit, price…) keeps it.
    if(customerDirected(pv)&&!businessAssertion(pv)&&!pv.split(' ').some(w=>attributeValue.test(w)||colourName.test(w)))continue;
    const propTriggered=businessAssertion(pv),subjects=claimEntities(prop,{...options,selectedProductKey:null});
    if(ellipticTransfer(pv)&&!denial(pv))return {valid:false,reason:'unsupported_capability_transfer',unsupported_values:[pv.slice(0,40)]};
    {const m=pv.match(/(?<!\p{L})(?:از|من)\s+((?:\p{L}+\s+){0,2}?\p{L}+)\s+(?:ساخته|درست|مصنوع\p{L}*|مسوی\p{L}*|مسوا\p{L}*|تولید)(?!\p{L})/u);
     if(m&&!denial(pv)){const approved=normal(facts.filter(f=>f.source==='approved_knowledge').map(f=>JSON.stringify(f.values||[])+' '+(f.raw_text||'')).join(' '));
      const material=m[1].split(' ').filter(w=>w.length>=3&&!/^(?:یه|یک|نوع|جنس|ماده|مواد|خیلی|بسیار|کاملا)$/u.test(w));
      const absent=material.filter(w=>!approved.includes(w));if(absent.length)return {valid:false,reason:'unverified_business_assertion',unsupported_values:absent.slice(0,8)};}}
    const anchored=propTriggered||subjects.length>0||businessAnchor(pv);
    // Multi-word attribute values are a claim wherever they appear in the proposition (cv55).
    {const multi=[...pv.matchAll(/سه\s+بعدی|ثلاثی\s+(?:ال)?ابعاد|ضد\s+(?:ال)?ماء|ضد\s+آب|ضد\s+اب|ضد\s+خش|ضد\s+ضربه|فول\s+کالر|تمام\s+رنگی|ام\s+دی\s+اف/gu)].map(m=>m[0]);
     if(multi.length&&!denial(pv)){const approved=normal(facts.filter(f=>f.source==='approved_knowledge').map(f=>JSON.stringify(f.values||[])+' '+(f.raw_text||'')).join(' '));const absent=multi.filter(m=>!approved.includes(normal(m)));if(absent.length)return {valid:false,reason:'unverified_business_assertion',unsupported_values:absent.slice(0,4)};}}
    if(!anchored)continue;
    const approvedColourWords=new Set(facts.filter(f=>f.category==='color'&&f.source==='approved_knowledge').flatMap(f=>normal((f.values||[]).filter(v=>typeof v==='string').join(' ')).split(' ')).filter(x=>x.length>=3));
    // Bare yes-confirmations («إي موجود», «بله داریم») may borrow the sibling proposition's anchor; nothing else may (H3).
    const neg=denial(pv),bareYes=/^(?:ای|ایوه|اي|بله|آره|اره|نعم|اکید|اکیده)\s+\p{L}+$/u.test(pv.trim()),sentenceAnchored=bareYes&&propositionsOf(committal).some(p=>p!==prop&&(claimEntities(p,{...options,selectedProductKey:null}).length||businessAnchor(normal(p))));
    const missing=ungroundedAttributeTerms(prop,subjects.length?subjects:sentenceSubjects.length?sentenceSubjects:[null],shippingFacts,{...options,markets,strictAll:true,shippingLexicon:shippingPart.has(part)||shippingTopic.test(pv)||shippingTopic.test(v),requireAnchor:anchored&&propTriggered&&!shippingPart.has(part)&&!subjects.length&&!sentenceAnchored&&!(/(?<!\p{L})(?:بفرستید|بفرستین|بفرست|بگید|بگین|بنویسید|دزلی|دزلنا|ابعثلی|ترسلی|ترسلیلی|ارسلی|گلی|گولی|قولی)(?!\p{L})/u.test(pv)&&/\p{L}{3,}(?:تون|تان|ک|کم)(?!\p{L})/u.test(pv)),denial:neg})
     .filter(w=>!(neg&&denialVocabulary(w))&&!(/^(?:هدیه|للهدیه|هدیهی|الهدیه|∅)$/u.test(w)&&/^(?:(?:برای|بعنوان|به\s+عنوان)\s+(?:هدیه|نامزدی|عروسی|تولد|عید)|لل?(?:هدیه|خطوبه|زواج|عید))$/u.test(pv.trim()))&&!(/^(?:هدیه|للهدیه|هدیهی|الهدیه)$/u.test(w)&&/(?<!\p{L})(?:برای|بعنوان|به\s+عنوان|مثل|ک)\s+هدیه|(?<!\p{L})للهدیه/u.test(pv)&&!/(?<!\p{L})(?:می\s*دیم|میدیم|میدم|بدیم|میذاریم|میزاریم|میگذاریم|کنارش|اضافه|نطی\p{L}*|نعطی\p{L}*|نضیف\p{L}*|نحط\p{L}*|ویا|مع|ببلاش|بلاش|مجان\p{L}*|رایگان\p{L}*|هم)(?!\p{L})/u.test(pv))&&!(w==='تر'&&/\u200cتر(?!\p{L})/u.test(prop))&&!(aestheticOpinionWord(w)&&(pv.split(' ').some(x=>colourName.test(x)||approvedColourWords.has(x))||/(?<!\p{L})(?:به\s+نظرم|بنظرم|نظرم|پیشنهاد\p{L}*|سلیقه\p{L}*|حس|برای\s+هدیه|للهدیه|بالنسبه\s+الی|حسب\s+ذوق\p{L}*|ذوقک)(?!\p{L})/u.test(pv)))&&!(/^احسن$/u.test(w)&&/احسن\s+(?:شی|شیء|حل|طریقه|خیار|اشی)(?!\p{L})/u.test(pv))&&!customerSideWord(w,markets)&&!(productionFree&&freeWord.test(w))
      &&!(/^(?:وسط|وسطی|وسطانی|میانه)$/u.test(w)&&/(?<!\p{L})(?:بدنه|جسم)\p{L}*/u.test(pv+' '+v)&&facts.some(f=>/میانی|اوسط/u.test(JSON.stringify(f.values||[]))))
      &&!(/^شیشه/u.test(w)&&/شیشه\s*(?:ی\s*)?(?:عطر|ادکلن|شما|مشتری)|شیشه(?:تون|ات|ت|شون)|عطرتون|عطرت/u.test(pv+' '+v))
      &&!(/^(?:شریط|روبان|ربان)\p{L}*$/u.test(w)&&/اختیار\p{L}*|یحدد\p{L}*|صاحب|مدیر/u.test(pv+' '+v)));
    if(missing.length)return {valid:false,reason:'unverified_business_assertion',unsupported_values:missing.slice(0,8)};
   }
  }}
 // PD90 continuation: an engine document (fixed engine template — order document, list-derived price reply, acceptance
 // acknowledgement) skips this product-description prose pass as it skips the assertion pass above; the shipping, printing-pair,
 // catalog and numeric checks still apply to it.
 for(const rawClause of engineDocument?[]:assertionClauses(productParts.join('\n'),options)){
  const entities=claimEntities(rawClause,{...options,selectedProductKey:null});
  if(entities.length){previous=entities;explicitScope=true;}
  if(!entities.length&&/(?<!\p{L})(?:این|همین|ان|اون)\s+(?:دو|چند|همه)\s+مدل/u.test(normal(rawClause))){previous=[];explicitScope=true;}
  if(nonCommittalClause(rawClause))continue;
  const clause=committalPortionLegacy(maskPropositionScopes(rawClause));if(!clause.trim()||!/\p{L}{2,}/u.test(clause))continue;
  const subjects=entities.length?entities:explicitScope?previous:claimEntities(clause,options);
  const normalized=normal(clause),risk=[...normalized.matchAll(risky)].map(match=>normal(match[0]));
  if((pureUncertainty(clause)||honestInformationGap(clause))&&!risk.length)continue;
  if(qualifiedPreference(clause,subjects,options))continue;
  const assertion=epistemicAssertion(normalized);
  if(gap.test(normalized)&&!affirmative.test(assertion))continue;
  // Presence and absence are different facts. Token overlap with "does not have
  // foam" can never ground "has foam", or the opposite.
  const negative=negativeFeature(normalized);
  const eligible=eligibleByPolarity[Number(negative)];
  for(const term of risk)for(const subject of subjects.length?subjects:[null]){
   if(!eligible.some(fact=>factAppliesToEntity(fact,subject,options)&&(fact.values||[]).some(value=>includes(value,term))))return {valid:false,reason:'unsupported_product_feature',unsupported_values:[term]};
  }
  // Open-vocabulary attribute assertion: any clause about printing/finish/material/lining/stock is checked
  // against approved facts (of its subject, or of any approved product fact when no model is named),
  // whatever verb, hedge or word order carries it. A pure approval/knowledge disclaimer is not an assertion.
  // The slot check is ADDED to the existing checks below (dimensions, mechanism, availability, commercial
  // terms); a clause that passes it still goes through them.
  // An OFFER phrased as a question («لوگو رو روی دیواره‌ها هم بزنیم؟», «تحب نسويلك روز گولد؟») asserts the capability;
  // only a genuine request for the customer's information is exempt.
  const question=/[؟?]\s*$/u.test(clause.trim());let attributeNow=false;
  const sentencePrinting=printingSentence(sentenceOf(clause));
  // NEGATED existence of an unapproved value («چاپ رنگی روی درب نداریم», «ماكو طباعة ملونة») under-claims; it
  // creates no capability or commitment, so value grounding does not apply to it.
  const negatedExistence=/(?<!\p{L})(?:نداریم|ندارن|نیست|نیستن|نمی\s*زنیم|نمیزنیم|نمی\s*کنیم|نمیکنیم|نمی\s*شه|نمیشه|نمی\s*تونیم|نمیتونیم|انجام\s*نمی\p{L}*|ماکو|ما\s*عدنا|ما\s*نسوی\p{L}*|ما\s*نطبع\p{L}*|ما\s*یصیر|ما\s*تصیر|لا\s*یوجد|مو\s*متوفر\p{L}*)(?!\p{L})/u.test(normalized.split(/\s(?:که|چون|زیرا|لان|اللی)\s/u)[0])&&!affirmativeExistence(normalized.replace(/(?<!\p{L})(?:ما|مو|لا)\s+\p{L}+/gu,' '));
  if(!negatedExistence&&!informationRequest(normalized)&&!(question&&preferenceQuestion(normalized))&&(attributeConcept.test(normalized)||normalized.split(' ').some(word=>attributeValue.test(word)||colourName.test(word))||sentencePrinting&&normalized.split(' ').some(word=>printSurface.test(stem(word))))&&!(epistemicDisclaimer.test(normalized)&&!affirmativeExistence(normalized))){
   const missing=ungroundedAttributeTerms(clause,subjects.length?subjects:[null],eligibleAll,{...options,printingSentence:sentencePrinting});
   if(missing.length)return {valid:false,reason:'unsupported_product_attribute',unsupported_values:missing.slice(0,8)};
   attributeNow=true;
  }
  // A no-charge claim may cover only the approved production services («چاپ لوگو و جعبه رایگانه» is not approved).
  if(/(?<!\p{L})(?:رایگان\p{L}*|مجان\p{L}*|ببلاش|بلاش|free)(?!\p{L})|بدون\s*(?:هیچ\s*)?(?:هزینه|کلفه|مقابل)/u.test(normalized)&&!negativeFeature(normalized)&&!productionServiceOnly(sentenceOf(clause))&&!freeClaimPiecesAreServices(sentenceOf(clause)))return {valid:false,reason:'unapproved_free_claim'};
  // Existence wording is a product claim only about a named product or right after a product-attribute
  // clause («طلاکوب داریم، رزگلد هم داریم»); «نیاز به استعلام داره» is not a product variant.
  const productTopic=subjects.length>0||attributeTopic||attributeNow||modelLike(normalized)||replyTopic&&/(?<!\p{L})(?:داریم|عدنا|اکو|یتوفر|تتوفر|موجود\p{L}*|متوفر\p{L}*|هم\s+هست)(?!\p{L})/u.test(normalized);attributeTopic=attributeNow;
  if(!requireEvidence&&/قیمت|هزینه|تخفیف|بیعانه|پرداخت|حداقل|سعر|کلفه|خصم|عربون|الحد الادنی|\b(?:price|discount|deposit|moq)\b/u.test(normalized))continue;
  // Existence/offer of an unnamed variant («صورتی پاستلی هم داریم») must use approved wording or the
  // catalogue's own names; catalogue tuples (sizes/constructions) keep their relational check.
  // («رنگ‌های موجود» / «الألوان المتوفرة» refer to the approved set; they assert no new member.)
  // cv58b: an existence word that is itself NEGATED («ما موجود», «موجود نیست»), or inside a condition about the customer's own item
  // («اگه انگشترتون نگین درشت داره»), asserts no variant of ours. Only the existence word's own polarity/condition counts (review B).
  if(!requireEvidence&&!question&&productTopic&&!/(?<!\p{L})(?:ما|مو|لا|غیر)\s+(?:موجود|متوفر)\p{L}*|(?:موجود|متوفر)\p{L}*\s+(?:نیست|ماکو)|(?:اگه|اگر|اذا|لو)\s+\p{L}{2,}(?:تون|تان|ک|کم)\s+(?:\p{L}+\s+){0,3}?(?:داره|عنده|بیه)(?!\p{L})/u.test(normalized)&&/(?<!\p{L})(?:داریم|داره|دارن|(?<!(?:های|ها|ال\p{L}+)\s)(?:موجود\p{L}*|متوفر\p{L}*)|یتوفر|تتوفر|عدنا|اکو|هم\s+هست)(?!\p{L})/u.test(normalized)){
   const catalogFacts=[...eligibleAll,...catalog.map(entry=>({entity_key:'global',fromCatalog:true,values:[JSON.stringify(entry)]}))];
   const missing=ungroundedAttributeTerms(clause,subjects.length?subjects:[null],catalogFacts,{...options,existence:true}).filter(word=>!/^(?:مدل|مدلهای|انواع|نوع|سایز|سایزهای|اندازه|رنگ|رنگهای|الوان|لون|قیاس|قیاسات|مقاس|مقاسات|ابعاد)$/u.test(word));
   if(missing.length)return {valid:false,reason:'unsupported_product_variant',unsupported_values:missing.slice(0,8)};
  }
  // Catalog tuples are already checked relationally, including every claimed size
  // and construction. Do not reinterpret their natural list headings as features.
  if(!requireEvidence&&/موجود|متوفر|داریم|عدنا/u.test(normalized)&&!/(?:چاپ|طبع|جنس|ساخته|مصنوع|بسته|باز|مجهز|مزود|مناسب|یناسب|عطر)/u.test(normalized))continue;
  if(!subjects.length||!affirmative.test(normalized)&&!negative&&!requireEvidence||uncertainFitFrame(normalized)&&!risk.length)continue;
  // Ordinary inventory tuples, colours and sizes keep their existing typed/category
  // validation. Descriptive construction assertions need evidence of their attributes.
  if(!requireEvidence&&!modelLike(subjects.join(' '))&&!/ساخته|جنس|مصنوع|بسته|باز|دارای|مجهز|مزود|مناسب|یناسب|عطر|fits?|suitable/u.test(normalized))continue;
  let content=normal(typedSpecifications(clause).scalar).replace(/(?<!\p{L})(ن?می) (?=\p{L}{2})/gu,'$1').replace(/(?<=\p{L}{3}) (پذیر(?:ه|ی|ند|ن)?)(?!\p{L})/gu,'$1');
  // A customer's desired design is not a new printing method or a custom size.
  // Keep "دلخواه" factual everywhere except as this evidenced design modifier.
  if(/چاپ|طبع/u.test(normalized))content=content.replace(/((?:طرح|اطلاعات|پترن)\s+)دلخواه(?:تون|تان|شون)?(?!\p{L})/gu,'$1');
  for(const subject of subjects)content=content.replaceAll(normal(subject),' ');
  const terms=[...new Set(content.split(' ').map(stem).filter(word=>word.length>=3&&!stop.has(word)&&!/^\d+$/.test(word)))];
  for(const subject of subjects){
   const sources=eligible.filter(fact=>factAppliesToEntity(fact,subject,options));
   const tokens=new Set(sources.flatMap(fact=>(fact.values||[]).flatMap(value=>normal(value).split(' ').map(stem))));
   // cv58: a copula/«‑پذیر» predicate form of a known or ordinary word («قابل انتخابه», «امکان‌پذیره») adds no new attribute.
   const bare=term=>term.replace(/پذیر(?:ه|ی|ند|ن)?$/u,'').replace(/(?<=\p{L}{5})(?:ه|ست)$/u,'');
   const missing=terms.filter(term=>!tokens.has(term)&&!tokens.has(term.replace(/(?:یش|اش|ش)$/u,''))&&!stop.has(term)&&!ordinaryWord(term)&&!(bare(term)!==term&&(tokens.has(bare(term))||ordinaryWord(bare(term))||stop.has(bare(term)))));
   if(missing.length)return {valid:false,reason:'unsupported_product_description',unsupported_values:missing.slice(0,8)};
  }
 }
 return {valid:true};
}

// Financial facts cannot be contradicted by free surrounding speech. Outside the
// protected blocks admit neutral introductions or positive source-grounded product
// descriptions only. Unknown speech acts are held, rather than interpreted as consent.
export function protectedContextIssue(prose,{authoritativeFacts=[],catalog=[],selectedProductKey=null,requireProductExplanation=false,markets=[],offerQuantities=[]}={}){
 if(/```|~~~|<\/?(?:s|del|strike|blockquote|code)|^[ \t]*>/imu.test(prose))return {valid:false,reason:'protected_context_markup'};
 const negative=/(?<!\p{L})(?:نه|نیست|نباید|منتفی|خلاف|برعکس|نمی\p{L}*|ندار\p{L}*|بدون|لا|مو|ما|لیس\p{L}*|غیر|not|no|never|ignore|disregard|opposite)(?!\p{L})/u;
 let grounded=false;
 const facts=authoritativeFacts.filter(fact=>!markets.length||!fact.market||markets.includes(fact.market));
 let previous=[];const shippingContext={};
 for(const raw of splitSalesReply(prose)){
  const text=normal(raw);
  if(serviceQuestionField(raw))continue;
  if(pureUncertainty(raw))return {valid:false,reason:'protected_context_uncertainty_target_missing'};
  const assessment=informationalClaimAssessment(raw,{authoritativeFacts:facts,catalog,selectedProductKey,markets,context:shippingContext});
  if(assessment.applicable){if(!assessment.valid)return assessment;continue;}
  if(negative.test(text))return {valid:false,reason:'protected_context_negation'};
  // PD90 continuation: Iraqi/Arabic courtesy words and bare affirmatives carry no claim either («تسلم», «مشکور», «تمام», «اکید»).
  // Removing the affirmatives silenced valid offers (probe P1/P2); a concession request + «حتماً!» is not delivered anyway (probe P3).
  if(/^(?:سلام(?: علیکم)?|درود|هلا(?: بیک)?|مرحبا|ممنون(?:م)?|شکرا|در خدمتم|تسلم|تسلمین|مشکور|تمام|اکید|عالیه|حتما)$/u.test(text))continue;
  // PD90: an introduction that only restates the quantity the protected engine offer itself states («برای ۱۰۰۰ عدد:», «لـ ١٠٠١ قطعة:»,
  // «حتماً، ۲۰۰۰ عدد.») is neutral. Any other number (a quantity the offer was not computed for) stays unverified speech.
  {const q=text.match(/^(?:(?:حتما|حتمن|باشه|چشم|تمام|اکید|عالیه|اوکی)\s+)?(?:(?:برای|واسه|لـ*|للـ*)\s*)?(\d+)\s*(?:عدد|تا|تایی|دونه|قطعه|علبه|جعبه|حبه)?$/u);
   // Only the quantity the protected offer was computed for (supplied by the engine as offerQuantities), never any other figure
   // of the pricing evidence (unit price fragments, MOQ, percentages).
   if(q&&offerQuantities.map(n=>String(n)).includes(String(Number(q[1]))))continue;}
  const introWords=new Set('این اینها اطلاعات مربوط به پرسش سوال سوالتون درخواست شما شماست خدمت جزئیات درخواستی های هاي هذه معلومات تخص استفسارک طلبک طلبك تفاصيل'.split(' '));
  if(text.split(' ').map(stem).every(word=>introWords.has(word)||['است','هست','اینه','هستند','ست'].includes(word)))continue;
  const explicit=claimEntities(raw,{facts,catalog,selectedProductKey:null});
  if(explicit.length)previous=explicit;
  const subjects=explicit.length?explicit:previous.length?previous:claimEntities(raw,{facts,catalog,selectedProductKey});
  const source=facts.some(fact=>['capability','availability','material'].includes(fact.category)&&(!requireProductExplanation||fact.category==='capability')&&subjects.some(subject=>factAppliesToEntity(fact,subject,{facts,catalog}))&&(()=>{
   const tokens=new Set((fact.values||[]).flatMap(value=>normal(value).split(' ').map(stem)));return text.split(' ').filter(word=>word.length>=3&&!stop.has(word)&&tokens.has(stem(word))).length>=(fact.category==='availability'?1:3);
  })());
  if(!subjects.length||!source||!productAssertionIssue((explicit.length?'':subjects.join(' و ')+' ')+raw,{authoritativeFacts:facts,catalog,selectedProductKey,requireEvidence:true}).valid)return {valid:false,reason:'protected_context_unverified_speech'};
  grounded=true;
 }
 return requireProductExplanation&&!grounded?{valid:false,reason:'service_explanation_missing'}:{valid:true};
}
