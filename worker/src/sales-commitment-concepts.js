// cv58b — COMMITMENT CONCEPTS that hold whatever disclaimer, deferral or refusal surrounds them (independent review D/A/B, cv58).
// Each concept is a proposition type the assistant may never assert; it is checked on the RAW clause (not the masked / committal
// portion), because the danger is exactly a claim hidden next to an honest phrase. Only an explicit negation of the claim itself
// («نداریم», «ماکو», «ما نسوي», «نمی‌زنیم», «موجود نیست») exempts a never-approved item.
const norm=t=>String(t||'').normalize('NFKC').toLowerCase().replace(/[‌‍ـ]/gu,' ').replace(/[ً-ٰٟ]/gu,'')
 .replace(/[يى]/gu,'ی').replace(/ك/gu,'ک').replace(/[أإآٱ]/gu,'ا').replace(/ؤ/gu,'و').replace(/ئ/gu,'ی').replace(/[ةۀ]/gu,'ه').replace(/\s+/gu,' ');
const B='(?<!\\p{L})',E='(?!\\p{L})';
// 1. Never-approved techniques / materials / features / models (spec: "NOT approved, never stated anywhere").
const NEVER=new RegExp(B+'(?:و|ف|ب|بال|ال|لل)?(?:چاپ\\s*دیجیتال|full\\s*colou?r|چرم\\p{L}*|جلد(?:ی|یه)?|الجلد|مخمل\\p{L}*|قطیف\\p{L}*|چوب\\p{L}*|چوبی|خشب\\p{L}*|فوم|اسفنج\\p{L}*|مگنت\\p{L}*|اهنربا|مغناطیس\\p{L}*|مغناط\\p{L}*|بازدار|یکدار|یک\\s*دار|ضد\\s*اب|ضداب|ضد\\s*الماء|مقاوم\\s*للماء)'+E,'u');
const MIRROR=/(?:آینه|آیینه|آيينه|آينه|ایینه|مرآة|مراية|مرايه|مرآه|مرایه)/u;
// printing-technique words are never-approved only in a PRINTING context («علبة ملونة» = a coloured box; «فایل دیجیتال» = a file)
const PRINT_ONLY=/(?<!\p{L})(?:و|ف|ب|بال|ال|لل)?(?:دیجیتال|دیجیتالی|تمام\s*رنگی|فول\s*کالر|ملون\p{L}*|الملون\p{L}*|uv|یووی|برجسته|بارز\p{L}*|سه\s*بعدی|ثلاثی\s*الابعاد)(?!\p{L})/u;
const PRINT_CTX=/(?<!\p{L})(?:و|ف|ب|بال|ال)?(?:چاپ\p{L}*|طباع\p{L}*|طبع\p{L}*|نطبع\p{L}*|کوب\p{L}*|print\p{L}*)(?!\p{L})/u;
const MATERIAL_EXTRA=/(?<!\p{L})(?:و|ف|ب|بال|ال)?(?:فلز\p{L}*|فلزی|معدن\p{L}*|پلکسی|بلکسی|ساتن|ابریشم\p{L}*|حریر\p{L}*|شیشه\s*ای|زجاج\p{L}*|پلاستیک\p{L}*|بلاستیک\p{L}*|اکریلیک\p{L}*)(?!\p{L})/u;  // raw text: «آینه» normalises to «اینه» (= «این است»)
const NEVER_NEGATED=/(?<!\p{L})(?:نداریم|ندارن|نداره|نیست|نیستن|نمی\s*زنیم|نمیزنیم|نمی\s*کنیم|نمیکنیم|ماکو|ما\s*(?:عدنا|نسوی|نطبع|یصیر|نکدر|نگدر|اکو|متوفر|موجود)|مو\s*(?:موجود|متوفر|ممکن)|لا\s*(?:یوجد|نطبع|نسوی)|غیر\s*(?:موجود|متوفر|ممکن)|جزو\s+\p{L}+\s+نیست|تایید\s*(?:شده|نشده)\s*نیست|approved\s*not)(?!\p{L})/u;
// 2. Owner approval reported or predicted (dialect forms included).
const OWNER_WORD='(?:مدیر\\p{L}*|صاحب\\s*(?:ال)?(?:شغل|کار|محل)|صاحبکار|مالک\\p{L}*|(?:ال)?اداره|المدیر|الاستاذ|الحجی)';
const OWNER_PREDICT=new RegExp(B+'(?:و|ف)?(?:اکید|اکیدا|حتما|حتمی|قطعا|اکیده|معمولا|غالبا|عاده|عادتا|احتمالا|اکثرا|اغلب)'+E+'(?:\\s+\\p{L}+){0,3}?\\s+(?:راح\\s+|رح\\s+|می\\s*)?(?:یوافق|توافق|یقبل|تقبل|یمشی\\p{L}*|یرضی|قبول\\s*(?:می\\s*)?(?:کنه|کنن|میکنه)|موافقت\\s*(?:می\\s*)?(?:کنه|میکنه)|مشکلی\\s*(?:ندارن|نداره|نداشته)|مشکل\\s*(?:ندارن|نداره)|اوکی\\s*(?:می\\s*)?(?:ده|دن))'+E,'u');
const OWNER_DONE=new RegExp(OWNER_WORD+'(?:\\s+\\p{L}+){0,3}?\\s+(?:مشاها|مشاهه|مشیها|مشی\\p{L}*|ماشیها|وافق\\p{L}*|قبلها|قبله|گبلها|گبله|کبلها|راضی\\p{L}*|قبول\\s*کرد\\p{L}*|اوکی\\s*(?:داد|کرد)\\p{L}*|موافقت\\s*کرد\\p{L}*|تایید\\s*کرد\\p{L}*|اجازه\\s*داد\\p{L}*)'+E+'|'+B+'(?:مشاها|مشاهالک|مشاهالج|مشیهالک)'+E,'u');
// 3. Order / shipment / payment STATUS («طلبك تأكد», «طلبيتك بالطريق», «سفارشتون رفته تو نوبت تولید»).
const STATUS=new RegExp(B+'(?:و|ف)?(?:ال)?(?:طلب\\p{L}*|سفارش\\p{L}*|اوردر\\p{L}*|شحن(?:ه|تک|تکم)|بار(?:تون|ت|تان|ش)|بسته(?:تون|ت)|طلبی\\p{L}*)(?:\\s+(?:تون|تان|ت|ش|ها|های))?\\s+(?:\\p{L}+\\s+){0,4}?(?:تاکد|تاکدت|انقبل|انقبلت|تثبت|تثبتت|انحجز|انحجزت|بالطریق|بالدرب|طلع(?:ت)?|اندز(?:ت)?|انشحن(?:ت)?|وصل(?:ت)?|رفته\\s+(?:تو|توی)\\s+(?:نوبت|تولید)|تو\\s+نوبت\\p{L}*|در\\s+(?:حال|دست)\\s+(?:تولید|ساخت|ارسال)|توی\\s+راه\\p{L}*|تو\\s+راه\\p{L}*|بار\\s+زده\\s+شد|ارسال\\s+شد\\p{L}*|ثبت\\s+شد\\p{L}*|قطعی\\s+شد\\p{L}*|قطعی\\p{L}*|نهایی\\p{L}*|مثبت|موکد|مؤکد|تثبیت\\s+شد\\p{L}*)'+E,'u');
// the negation must govern the STATUS itself («طلبك ما تأكد», «هنوز ثبت نشده»), not another proposition in the same segment
const STATUS_NEG=/(?<!\p{L})(?:نه|ما|مو|لا|هنوز|بعده?|لسه|نمی\s*\p{L}+)\s+(?:\p{L}+\s+){0,1}?(?:تاکد|انقبل|تثبت|انحجز|طلع|اندز|انشحن|وصل|ثبت|قطعی|نهایی|ارسال)\p{L}*|(?:ثبت|قطعی|ارسال|تایید|تولید)\s*(?:نشده|نشد|نمیشه)|(?<!\p{L})(?:ما\s+(?:اعرف|ادری)|مو\s+متاکد\p{L}*|نمی\s*دونم|نمیدونم|مطمین\s+نیستم)\s+(?:\p{L}+\s+){0,2}?(?:اذا|ان|که|اینکه|ایا)/u;
const STATUS_HEDGE=/(?<!\p{L})(?:اگه|اگر|اذا|لو|بعد\s+ما|وقتی|من\s+ما|بمجرد)(?!\p{L})/u;
// 4. Exceptive / comparative after a refusal turns it into an assertion («ما نضمن إلا التسليم لباب البيت», «ما أوعدك بأقل من أسبوع»).
// «غير» before a participle/adjective is a negated adjective («غير موثّق», «غير مؤكد»), not an exceptive.
// (review A2) only after a REFUSED confirmation/promise/guarantee verb — «ما نطبع غير على الغطاء» (we print only on the lid) is the
// approved fact, not an exceptive commitment; «قبل از اینکه» is not a comparative.
const EXC_VERB='(?:(?:اگدر|اکدر|اقدر|نگدر|نکدر)\\s+)?(?:ااکد\\p{L}*|اکد\\p{L}*|اوعد\\p{L}*|اضمن\\p{L}*|نضمن\\p{L}*|اگول\\p{L}*|اکول\\p{L}*|اثبت\\p{L}*)';
const EXCEPTIVE=new RegExp('(?<!\\p{L})[وف]?(?:ما|مو|لا)\\s+'+EXC_VERB+'\\s+(?:\\p{L}+\\s+){0,1}?(?:(?:الا|جز|سوی)\\s+\\p{L}{2,}|غیر\\s+(?!(?:موثق|موکد|مؤکد|معتمد|متوفر|موجود|ممکن|مضمون|مسموح|معلوم|مفهوم|مناسب|دقیق|صحیح|رسمی|واضح|کافی)\\p{L}*)\\p{L}{2,})|(?<!\\p{L})(?:نمی\\s*تونم|نمیتونم)\\s+(?:\\p{L}+\\s+){0,2}?(?:قول\\s*بدم|تضمین\\s*کنم|تایید\\s*کنم|بگم)\\s+(?:به\\s+)?(?:جز|غیر\\s+از)\\s+\\p{L}{2,}|(?<!\\p{L})(?:[وف]?(?:ما|مو|لا)\\s+'+EXC_VERB+'|(?:نمی\\s*تونم|نمیتونم)\\s+(?:قول\\s*بدم|تضمین\\s*کنم))\\s+(?:\\p{L}+\\s+){0,1}?(?:ب)?(?:اقل|اکثر|کمتر|بیشتر|زودتر|دیرتر)\\s+(?:من|از)\\s+\\p{L}+','u');
// 5. Popularity / best-seller.
const POPULAR=/(?<!\p{L})(?:اکثر|الاکثر|اکتر)\s+(?:\p{L}+\s+){0,1}?(?:ینطلب|مطلوب|طلبا|مبیعا|یبیع|ینباع|یمشی|ماشی)(?!\p{L})|(?<!\p{L})(?:ینطلب|مطلوب)\s+(?:هوایه|کلش|اکثر|بالسوک)(?!\p{L})|(?<!\p{L})(?:پرفروش\p{L}*|محبوب\p{L}*|پرطرفدار\p{L}*|بیشترین\s+(?:فروش|سفارش|طرفدار))(?!\p{L})/u;
// 6. Our own fleet / courier («پیک‌مون», «سائقنا», «سيارتنا»).
const OWN_FLEET=/(?<!\p{L})(?:پیک(?:\s*(?:ها|های))?\s*(?:مون|خودمون)|ماشین(?:\s*ها)?\s*(?:مون|خودمون)|راننده(?:\s*ها)?\s*(?:مون|خودمون)|رانندمون|سایقنا|سائقنا|سیارتنا|مندوبنا|دلیفریمون|(?:ال)?(?:مندوب|سایق|سیاره|دلفری)\s+(?:مالنا|مالتنا|التابع\s+النا))(?!\p{L})/u;
// 7. Door delivery named as the service, with no negation in the clause («تحویل درب منزل – …», «توصيل لباب البيت»).
const DOOR_NP=/(?<!\p{L})(?:تحویل|ارسال|توصیل|تسلیم)\s+(?:\p{L}+\s+){0,1}?(?:درب|دم\s*در|در)\s*(?:ی\s*)?(?:منزل|خونه|خانه|مغازه)\p{L}*|(?<!\p{L})(?:ال)?(?:توصیل|تسلیم)\s+(?:لل|ل|الی\s*|لحد\s*)(?:ال)?(?:باب|بیت|محل)\p{L}*/u;
const DOOR_NEG=/(?<!\p{L})(?:و|ف)?(?:نمی\p{L}*|نه|نیست|ندار\p{L}*|نداریم|ما|مو|لا|غیر|بدون|ماکو|منقدر|منگدر)(?!\p{L})/u;
// 8. Fit with «جا میده» («جعبه سرویس گردنبند شما رو جا میده»).
const FIT_GIVES=/(?<!\p{L})جا\s*(?:می\s*)?(?:ده|دن|میده|میدن)(?!\p{L})/u;
// ---- cv58c (black-box round 2): idiomatic claims with no keyword ----
// 9. Account / payment settled («حسابتون صافه», «حسابك مسدد/خالص», «تسویه‌اید», «ما مطلوب منك شي»).
const ACCOUNT=/(?<!\p{L})(?:حساب\p{L}*|طلب\p{L}*|بدهی\p{L}*|بقیه\s*پول\p{L}*)\s+(?:\p{L}+\s+){0,2}?(?:صاف\p{L}*|صافی|مسدد\p{L}*|خالص\p{L}*|تسویه\p{L}*|کامل\s*(?:شد|شده|ه)|واصل\p{L}*|مدفوع\p{L}*)(?!\p{L})|(?<!\p{L})(?:تسویه\s*(?:اید|این|ست|ه|ایم|شد\p{L}*)|ما\s+(?:مطلوب|علیک|علیج)\s+(?:\p{L}+\s+){0,1}?شی|چیزی\s+(?:نمونده|نمیمونه)\s+(?:که\s+)?(?:بدید|بدین|پرداخت))(?!\p{L})/u;
// 10. Stock idioms («باقي شوية», «بقت كم وحدة», «قربت تخلص», «لحگ نفسك», «چندتا بیشتر نمونده»).
const STOCK=/(?<!\p{L})(?:باقی|بقت|بقی|بقیت|ظلت|ضلت|ظل|ضل)\s+(?:\p{L}+\s+){0,1}?(?:شویه|شوی|کم|قلیل\p{L}*|حبات|وحده|وحدات|قطع)(?!\p{L})|(?<!\p{L})(?:قربت|خلصت|راح\s+تخلص|تخلص)\s+(?:\p{L}+\s+){0,1}?(?:الکمیه|الموجود|المخزون|بقت|قلیله)|(?<!\p{L})لحگ\s+(?:نفسک|نفسج|نفسکم)|(?<!\p{L})(?:چند\s*تا|تعداد\s+کمی)\s+(?:\p{L}+\s+){0,1}?(?:بیشتر\s+)?(?:نمونده|مونده|باقی\s*مونده)(?!\p{L})/u;
// 11. A calendar date with a completion verb («الخميس الجاي تخلص», «بعد العطلة تطلع», «أول الشهر الجاي تكمل»).
const CALENDAR='(?:السبت|الاحد|الاثنین|الثلاثا|الثلاثاء|الاربعا|الاربعاء|الخمیس|الجمعه|شنبه|یکشنبه|دوشنبه|سه\\s*شنبه|چهارشنبه|پنجشنبه|جمعه|(?:ال)?جای|الجاي|العطله|العید|عید|نوروز|محرم|رمضان|اول\\s+(?:ال)?شهر|آخر\\s+(?:ال)?شهر|اخر\\s+(?:ال)?شهر|اول\\s+ماه|آخر\\s+ماه|اخر\\s+ماه|آخر\\s+هفته|اخر\\s+هفته|اول\\s+هفته|هفته\\s+(?:بعد|دیگه|آینده)|الاسبوع\\s+الجای|الشهر\\s+الجای)';
const COMPLETE='(?:تخلص|یخلص|تطلع|یطلع|تکمل|یکمل|تجهز|یجهز|توصل|یوصل|توصلک|نسلم\\p{L}*|نطلع\\p{L}*|نخلص\\p{L}*|اماده\\s*(?:می\\s*)?(?:شه|ست|است)|تحویل\\s*(?:می\\s*)?(?:شه|دیم)|میرسه|می\\s*رسه|ارسال\\s*(?:می\\s*)?(?:شه|کنیم))';
const CAL_CLAIM=new RegExp('(?<!\\p{L})'+CALENDAR+'(?:\\s+\\p{L}+){0,3}?\\s+'+COMPLETE+'(?!\\p{L})|(?<!\\p{L})'+COMPLETE+'(?:\\s+\\p{L}+){0,3}?\\s+'+CALENDAR+'(?!\\p{L})|(?<!\\p{L})(?:بعد|قبل)\\s+(?:ال)?(?:عطله|عید|العید)\\s+(?:\\p{L}+\\s+){0,2}?'+COMPLETE,'u');
// 12. Owner "no objection" / habitual acceptance («ما عنده مانع», «راضي وما يمانع», «مخالفتی نداره», «همیشه راه میاد»).
const OWNER_OK=new RegExp(OWNER_WORD+'(?:\\s+\\p{L}+){0,3}?\\s+(?:ما\\s*(?:عنده|عدّه|عدا)\\s*مانع|ماعنده\\s*مانع|ما\\s*یمانع|راضی|موافق|مخالفتی\\s*(?:نداره|ندارن)|مشکلی\\s*(?:نداره|ندارن)|اوکیه|اکی\\s*ه|حرفی\\s*نداره|(?:همیشه|معمولا|غالبا|دایما|دائما)\\s+(?:\\S+\\s+){0,5}?(?:راه\\s*(?:می\\s*)?(?:اد|یاد|میاد)|کنار\\s*(?:می\\s*)?(?:اد|یاد|میاد)|قبول\\s*(?:می\\s*)?(?:کنه|کنن)|یوافق|یمشی\\p{L}*))(?!\\p{L})','u');
// 13. Payment terms as reassurance («بعداً هم حساب کنید اشکال نداره», «مو مستعجلين على الفلوس», «براحتك بالدفع»).
const PAY_LATER=/(?<!\p{L})(?:بعدا|بعدن|بعدین|بعد|هر\s*وقت|هروقت|وقت\s*تحویل|بعد\s*از\s*(?:تحویل|فروش))\s+(?:\p{L}+\s+){0,2}?(?:حساب|پرداخت|تسویه|واریز)\s*(?:کنید|کنین|کن|بکنید|کردید|بدید|بدین)(?!\p{L})|(?<!\p{L})(?:مو|ما)\s+مستعجلین\s+(?:\p{L}+\s+){0,1}?(?:ال)?(?:فلوس|دفع|حساب|مبلغ)|(?<!\p{L})(?:براحتک|علی\s*راحتک|علی\s*کیفک)\s+(?:\p{L}+\s+){0,1}?(?:ب|بال)?(?:الدفع|دفع|فلوس|الفلوس|حساب)|(?<!\p{L})(?:ادفع|تدفع|ادفعها|تدفعها)\s+(?:\p{L}+\s+){0,1}?(?:من\s+(?:ت|ی)?بیع|بعدین|بعد\s+ما)/u;
// 14. Comparative discount without a number («یه کم ارزون‌تر درمیاد», «تطلعلك أرخص», «براتون حساب می‌کنیم»).
const CHEAPER=/(?<!\p{L})(?:ارزون\s*تر|ارزانتر|ارزان\s*تر|ارزونتر|ارخص|ارخصلک|ارخصلج|کمتر|اقل)\s+(?:\p{L}+\s+){0,1}?(?:درمیاد|در\s*میاد|میشه|می\s*شه|تطلع|تطلعلک|یطلع|یصیر|تصیر|حساب\s*می\s*کنیم|حساب\s*میکنیم|نحسبلک|نحسبها)(?!\p{L})|(?<!\p{L})(?:تطلعلک|تطلعلج|یطلعلک|درمیاد|میشه)\s+(?:\p{L}+\s+){0,1}?(?:ارخص|ارزون\s*تر|ارزونتر|کمتر|اقل)(?!\p{L})/u;
// 15. Coverage / door delivery presupposed through a relative clause («التأمين اللي على شحنتك», «التوصيل للبيت اللي راح يصير»).
const PRESUPPOSED=/(?<!\p{L})(?:ال)?(?:تامین|تأمین|بیمه|ضمان|ضمانت|تعویض|التعویض|جبران|توصیل|تحویل|تسلیم)\p{L}*\s+(?:(?:ل|لل|الی|تا|به|درب|دم)\s*\p{L}+\s+)?(?:اللی|الی|الذی|که|مال)\s+(?:\p{L}+\s+){0,2}?(?:علی|علیه|راح|رح|حی|یصیر|یکون|میشه|داره|دارید|هست|شحنتک|بارتون|طلبک|سفارشتون)/u;
// 16. Fit with «enters» verbs («تخش», «يخش», «میرن توش», «می‌ره داخلش»).
const FIT_ENTERS=/(?<!\p{L})(?:تخش|یخش|تخشش|یخشش|تفوت|یفوت|میرن\s+توش|میره\s+توش|می\s*ره\s+توش|می\s*رن\s+توش|میرن\s+داخلش|میره\s+داخلش|جا\s*میشن|جا\s*می\s*شن)(?!\p{L})/u;
// 17. Mechanical / physical features and "nothing happens to it" resistance (not in any approved fact).
const FEATURE=/(?<!\p{L})(?:لولا\p{L}*|قفل\p{L}*|دستگیره\p{L}*|ریل\p{L}*|فنر\p{L}*|زیپ\p{L}*|سحاب|مفصل\p{L}*|کلیک\p{L}*|مغلاق\p{L}*|سکه\s*ای)(?!\p{L})|(?<!\p{L})(?:نرم|راحت|روان|بسهوله|بسهولة)\s+(?:\p{L}+\s+){0,1}?(?:باز\s*(?:و|او)\s*بسته|ینفتح|ینسد|ینغلق)|باز\s*(?:و|او)\s*بسته\s*(?:می\s*)?(?:شه|میشه)\s+(?:\p{L}+\s+){0,1}?(?:راحت|نرم|بی\s*صدا)|گیر\s*(?:نمی\s*کنه|نمیکنه)|(?:بارون|باران|آب|اب|المطر|الماي|الماء|سرما|گرما|البرد|الحر)\s+(?:\p{L}+\s+){0,2}?(?:بخوره|بخوره|تصیبها|یصیبها)?\s*(?:\p{L}+\s+){0,1}?(?:چیزیش\s*نمیشه|چیزی\s*نمیشه|طوریش\s*نمیشه|ما\s*یصیرلها\s*شی|ما\s*یصیر\s*بیها\s*شی|ما\s*یأثر|ما\s*یاثر|ما\s*تتاثر|ما\s*تتأثر)/u;
// 18. Popularity from what customers buy («مشتری‌ها بیشتر ۳ تکه کج رو می‌خرن», «أغلب الزباين ياخذون …»).
const BUYERS=/(?<!\p{L})(?:مشتری\p{L}*|مشتریا|خریدار\p{L}*|(?:ال)?زبائن|(?:ال)?زباین|(?:ال)?ناس|اغلب\s+\p{L}+|اکثر\s+\p{L}+|همه)\s+(?:\S+\s+){0,7}?(?:می\s*خرن|میخرن|می\s*گیرن|میگیرن|سفارش\s*(?:می\s*)?دن|انتخاب\s*(?:می\s*)?کنن|میپسندن|یشترون|یاخذون|یطلبون|یختارون|یحبون|ینطونه)(?!\p{L})/u;
const UNCERTAIN=/(?<!\p{L})(?:مطمین\s+نیستم|نمی\s*دونم|نمیدونم|ما\s+اعرف|ما\s+ادری|مو\s+متاکد\p{L}*|یا\s+نه|لو\s+لا|او\s+لا)(?!\p{L})/u;

export function commitmentConceptIssues(text){
 const issues=[];
 // the owner may be named in an earlier segment («تصمیمش با مدیره، ولی معمولاً … مشکلی ندارن»)
 const ownerInText=new RegExp(OWNER_WORD,'u').test(norm(text));
 // (review A2) segments also end at contrast words, so a negation in one conjunct never exempts a claim in the other
 for(const raw of String(text||'').split(/(?<=[.!؟?\n؛;])|[،,→~=+"“”]|\s[-–—•]\s|\s(?=(?:ولی|اما|بس|لکن|لكن|ولكن|ولکن|بل|بلکه)\s)/u)){
  const v=norm(raw);if(!v.trim())continue;
  // a question back to the customer is exempt only if nothing precedes the question in the same segment that asserts a status
  const question=/[؟?]\s*$/u.test(raw.trim());
  // an honest knowledge gap ABOUT a never-approved item is allowed only if nothing presupposes we have it («…مالتنا», «داریم», «اكو»)
  const gapOnly=UNCERTAIN.test(v)||/(?<!\p{L})(?:اطلاع\p{L}*|اطلاعات\p{L}*|خبر\p{L}*)\s+(?:\p{L}+\s+){0,2}?ندارم|(?:ما|مو)\s+عندی\s+(?:\p{L}+\s+){0,1}?(?:معلومه|معلومات|تاکید|خبر)/u.test(v);
  const presupposed=/(?<!\p{L})(?:مالتنا|مالنا|عدنا|عندنا|اکو|داریم|داره|دارن|موجود\p{L}*|متوفر\p{L}*|هست|هستن)(?!\p{L})|\p{L}{2,}(?:مون|نا)(?!\p{L})/u.test(v);
  const neverHit=NEVER.test(v)||MIRROR.test(raw)||MATERIAL_EXTRA.test(v)||PRINT_ONLY.test(v)&&PRINT_CTX.test(v)&&!/(?<!\p{L})(?:فایل|ملف|نسخه|عکس|صوره)\s+(?:\p{L}+\s+){0,1}?دیجیتال/u.test(v);
  if(neverHit&&!NEVER_NEGATED.test(v)&&!question&&!(gapOnly&&!presupposed))issues.push('never_approved_feature');
  // a prediction needs the OWNER as its subject («أكيد يمشي، دز الصورة» is not about the owner)
  if(OWNER_PREDICT.test(v)&&!question&&(ownerInText||/(?<!\p{L})(?:یوافق|توافق|موافقت)/u.test(v))||OWNER_DONE.test(v))issues.push('owner_approval_claim');
  // status: no question exemption (a status before «تحب أدزلك رقم التتبع؟» is still asserted); the status verb itself must not be negated
  if(STATUS.test(v)&&!STATUS_HEDGE.test(v)&&!STATUS_NEG.test(v))issues.push('order_status_claim');
  // an exceptive that only restates the owner's authority («… غير إن صاحب الشغل هو اللي يحدد السعر») commits to nothing
  if(EXCEPTIVE.test(v)&&!(new RegExp(OWNER_WORD,'u').test(v)&&/(?<!\p{L})(?:یحدد|یقرر|تعیین|مشخص|تصمیم|یرجع)\p{L}*/u.test(v)))issues.push('exceptive_commitment');
  // door delivery PRESUPPOSED by the customer's premises («زمان ارسال تا خود منزل‌تون», «موعد التوصيل لبيتك») unless it is refused
  if(/(?<!\p{L})(?:تا|به|درب|دم\s*در|لحد|ل|لل)\s*(?:خود\s+)?(?:منزل|خونه|خانه|مغازه|بیت|باب\s*بیت)(?:تون|تان|ت|ک|کم|ج)(?!\p{L})|(?<!\p{L})(?:تا|به)\s+خود\s+(?:منزل|خونه|خانه|مغازه)/u.test(v)&&!/(?<!\p{L})(?:نمی\s*تونم\s+(?:\p{L}+\s+){0,3}?(?:قول|تضمین|تایید)|نداریم|انجام\s*نمیشه|[وف]?ما\s+(?:نگدر|نکدر|نقدر)\s+(?:نضمن|نوصل)|[وف]?ما\s+(?:نضمن|نوصل)|غیر\s+ممکن)/u.test(v))issues.push('door_delivery_promise');
  // guarantee / full compensation presupposed («تجي ويا الضمان», «التعويض الكامل»), discount implied by «بیشتر»
  if(/(?<!\p{L})(?:ویا|ویه|مع|ب|بال)\s*(?:ال)?(?:ضمان|ضمانت|تامین|بیمه|کفاله|گارانتی)(?!\p{L})|(?:ال)?(?:تعویض|جبران|خسارت|خساره|تامین|بیمه|ضمان)\p{L}*\s+(?:ال)?کامل\p{L}*/u.test(v)&&!NEVER_NEGATED.test(v))issues.push('presupposed_commitment');
  if(/(?<!\p{L})(?:تخفیف|خصم)\p{L}*\s+(?:بیشتر\p{L}*|اکثر|اکتر|زیاده|اضافی|ثانی)(?!\p{L})/u.test(v))issues.push('discount_claim');
  const unsureAny=UNCERTAIN.test(v)||/(?<!\p{L})(?:اطلاع\p{L}*|اطلاعات\p{L}*)\s+(?:\p{L}+\s+){0,3}?ندارم|(?:ما|مو)\s+عندی\s+(?:\p{L}+\s+){0,1}?(?:معلوم\p{L}*|تاکید|خبر)/u.test(v);
  if(POPULAR.test(v)&&!unsureAny)issues.push('popularity_claim');
  if(OWN_FLEET.test(v))issues.push('own_fleet_claim');
  // door delivery: exempt when negated, or when only NAMED as the topic of a question to the owner / a knowledge gap
  if(DOOR_NP.test(v)&&!DOOR_NEG.test(v)&&!question&&!/(?<!\p{L})(?:درباره|راجع|بخصوص|عن|حول|در\s+مورد)\s/u.test(v)&&!/(?<!\p{L})(?:بپرسم|میپرسم|اسال\p{L}*|اسیل\p{L}*|اعرض\p{L}*)(?!\p{L})/u.test(v))issues.push('door_delivery_promise');
  if(FIT_GIVES.test(v)&&!UNCERTAIN.test(v)&&!question&&!/(?<!\p{L})(?:اگه|اگر|اذا|لو|به\s*شرط)(?!\p{L})/u.test(v))issues.push('unverified_fit_claim');
  const negOrUnsure=UNCERTAIN.test(v)||/(?<!\p{L})(?:نمی\s*تونم|نمیتونم|نمی\s*دونم|ما\s+اعرف|ما\s+ادری|ما\s+عندی|اطلاع\p{L}*\s+(?:\p{L}+\s+){0,2}?ندارم)(?!\p{L})/u.test(v);
  if(ACCOUNT.test(v)&&!question&&!negOrUnsure)issues.push('payment_status_claim');
  if(STOCK.test(v)&&!question&&!negOrUnsure)issues.push('stock_claim');
  if(CAL_CLAIM.test(v)&&!question&&!negOrUnsure)issues.push('delivery_time_claim');
  if(OWNER_OK.test(v)&&!question)issues.push('owner_approval_claim');
  if(PAY_LATER.test(v)&&!question)issues.push('payment_terms_claim');
  if(CHEAPER.test(v)&&!question&&!negOrUnsure)issues.push('discount_claim');
  if(PRESUPPOSED.test(v))issues.push('presupposed_commitment');
  if(FIT_ENTERS.test(v)&&!question&&!negOrUnsure)issues.push('unverified_fit_claim');
  if(FEATURE.test(v)&&!question&&!negOrUnsure&&!NEVER_NEGATED.test(v))issues.push('never_approved_feature');
  if(BUYERS.test(v)&&!question&&!negOrUnsure)issues.push('popularity_claim');
 }
 return [...new Set(issues)];
}
