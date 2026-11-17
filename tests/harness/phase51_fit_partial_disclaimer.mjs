// cv50–cv54 regressions (Persian and Iraqi Arabic), local only:
// (1) fit/capacity: an affirmative fit answer to a fit question is a claim whatever product, size label, quantity or similar product is
//     named; honest uncertainty and requests for dimensions are allowed;
// (2) C3: a partial must answer an asked topic or state it pending; greetings/unrelated facts are not answers;
// (3) epistemic disclaimers cover only their own topic; commitments smuggled into them stay claims;
// (4) commercial authority override (F5).
import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {reporter} from "./harness.mjs";
const {ok,done}=reporter("phase51_fit_partial_disclaimer");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const A=await import(pathToFileURL(path.join(SRC,"sales-conversation-author.js")).href);
const S=await import(pathToFileURL(path.join(SRC,"sales-shipping-grounding.js")).href);
const BR=await import(pathToFileURL(path.join(SRC,"sales-ai-brain.js")).href);
const fit=(q,r)=>A.conversationReplyCoverage(r,A.conversationRequestPlan(q,[]),{});
for(const [q,r] of [
 ["عندي قنينة عطر 50 مل، تدخل بالعلبة؟","إي تدخل عادي بالعلبة."],
 ["ساعتي كبيرة، علبة الساعة تساعها؟","أكيد تساعها، القياس 8x8."],
 ["کم حبة خاتم تشيل علبة الطقم؟","علبة الطقم تشيل أربع خواتم."],
 ["شیشه عطر ۱۰۰ میلی من تو کشویی جا میشه؟","بله، توی کشویی بگ‌دار راحت جا میشه."],
 ["دستبندم پهنه، تو جعبه دستبند جا داره؟","آره، دستبند کشیده ۵x۲۲ جا داره."],
 ["انگشتر نگین‌دار تو انگشتر کوچیک جا میشه؟","انگشتر کوچک ۵x۵ برای انگشترهای نگین‌دار کاملاً مناسبه."],
])ok("Affirmative fit answer is a claim: "+r,fit(q,r).reason==="unverified_fit_claim",fit(q,r));
for(const [q,r] of [
 ["عندي قنينة عطر 50 مل، تدخل بالعلبة؟","ما أكدر أأكدلك إذا تدخل بدون ما أعرف قياس القنينة، دزلي الطول والعرض."],
 ["ساعتم تو جعبه ساعتی جا میشه؟","جعبه ساعتی بالشت‌دار ۸x۸ داریم؛ ولی بدون اندازه ساعتتون نمی‌تونم مطمئن بگم جا میشه."],
 ["شیشه عطرم تو کدوم جعبه جا میشه؟","به نظرم کشویی بگ‌دار رو ببینید؛ ابعاد شیشه رو بفرستید تا دقیق بگم."],
])ok("Honest fit uncertainty is allowed: "+r,fit(q,r).valid===true,fit(q,r));
const part=(q,t)=>A.partialTopicCoverage(q,t)?.ok;
ok("C3: greeting-only partial does not answer",part("چه رنگی برای سه تکه پیشنهاد میدید؟","سلام، ولی انتخاب نهایی با خودتونه")===false);
ok("C3: unrelated fact does not answer",part("جعبه کشویی بگ‌دار ضد آبه؟","این جعبه با چاپ طلاکوب روی درب ارائه می‌شود.")===false);
ok("C3: one of two topics answered and the other silently dropped",part("هزینه چاپ روبان چنده؟ چاپ درب رایگانه؟","چاپ درب رایگانه.")===false);
ok("C3: answered topic plus explicit pending topic is a valid partial",part("هزینه چاپ روبان چنده؟ چاپ درب رایگانه؟","هزینه روبان رو مدیر تعیین می‌کنه؛ چاپ درب رایگانه.")===true);
ok("C3: Iraqi pending topic",part("طباعة الشريطة مجانية؟","طباعة الشريطة كلفتها يحددها صاحب الشغل.")===true);
// cv56 DECISION: the disclaimer-residue route was reverted (it let commitments ride on a disclaimer). These honest disclaimers are
// therefore committal again — KNOWN OVER-BLOCKING, recorded here so the trade-off stays visible; the span-based redesign is pending.
for(const t of ["ما عندي معلومة مؤكدة عن التعويض أو مسؤولية الشحنة","ما أكدر أأكد استلام الدفع","مطمئن نیستم صورتی جزو رنگ‌ها باشه"])ok("KNOWN over-blocking after cv56 revert (residue route disabled): "+t,S.nonCommittalClause(t)===false);
ok("Allow-list disclaimer still non-committal: فما أكدر أكلك رقم",S.nonCommittalClause("فما أكدر أكلك رقم")===true);
for(const t of ["ما عندي معلومة مؤكدة لأن البضاعة جاهزة","ما أكدر أأكد بس نوصلها باچر","ما نضمن اللون ونضمن الجلد طبيعي","نمی‌دونم ولی بیمه هست","مطمئن نیستم ولی ثبت شد"])ok("Commitment smuggled into a disclaimer stays committal: "+t,S.nonCommittalClause(t)===false);
for(const t of ["قیمت قبلی اشتباه بود.","السعر اللي كلتلك قبل غلط."])ok("Commercial authority override: "+t,BR.salesAiProseIssues(t,{allowedNumbers:[]}).includes("protected_authority_override"));
ok("Self-correction of a model name is allowed",!BR.salesAiProseIssues("ببخشید، اسم مدل رو اشتباه نوشتم؛ سه تکه کج درسته.",{allowedNumbers:[]}).includes("protected_authority_override"));
for(const t of ["روبانش پولی نیست.","ما ناخذ عليها فلوس."])ok("Charge denial is a free claim: "+t,BR.salesAiProseIssues(t,{allowedNumbers:[]}).includes("unapproved_free_service"));
ok("Approved free lid printing stays allowed",!BR.salesAiProseIssues("چاپ لوگو پولی نیست.",{allowedNumbers:[]}).includes("unapproved_free_service"));
// cv57k: the word-deleting proposition-scope layer was REVERTED after independent review (unsafe bypasses). Honest deferrals it would
// have accepted are recorded as KNOWN OVER-BLOCKING (next session: detector-span suppression design); the rest stay accepted.
const P=t=>BR.salesAiProseIssues(t,{allowedNumbers:[]});
for(const t of ["چاپ روی روبان یه گزینه اختیاریه و هزینه‌ش رو مدیر مجموعه تعیین می‌کنه؛ من مبلغی ندارم که بگم.","بصراحة ما عندي معلومة مؤكدة إذا العلبة تتحمل الماي أو لا، فما أگدر أوعدك.","سلام، درباره تحویل تا درب منزل اطلاعات تأییدشده‌ای ندارم.","الشحن للعراق عبر شركة نقل بضائع، وما نكدر نضمن التسليم المباشر لباب البيت.","مو متأكدين إن قياسها يناسب قنينة عطرك."])ok("Honest deferral/uncertainty accepted: "+t,P(t).length===0,P(t));
// cv58: the strict proposition-scope layer (sales-proposition-scope.js) accepts these honest deferrals (formerly KNOWN over-blocking).
for(const t of ["الخصم والأسعار يقررها صاحب الشغل بس، آني ما أگدر أوعدك بشي.","تخفیف و قیمت نهایی فقط با نظر مدیر مشخص میشه و من نمیتونم قولی بدم.","زمان دقیق رسیدن بار رو نمی‌تونم بگم چون اطلاع تأییدشده‌ای ندارم.","تخفیف رو من نمی‌تونم بدم و تصمیمش فقط با مدیر مجموعه‌ست."])ok("cv58 honest deferral accepted (scope layer): "+t,P(t).length===0,P(t));
// cv58b closed-content scope: a committing word («رایگان») can never be part of a removed span — this honest denial stays rejected.
ok("KNOWN over-blocking (cv58b closed content): رایگان بودن ارسال رو نمی‌تونم تأیید کنم.",P("رایگان بودن ارسال رو نمی‌تونم تأیید کنم.").length>0);
for(const t of ["اطلاع دقیقی ندارم، هزینه باربری رو خودمون پرداخت می‌کنیم.","ما عندي معلومة مؤكدة الكرتون والنقل على حسابنا.","مطمئن نیستم، قیمت قبلی اشتباه بود.","نمی‌دونم ولی بیمه هست.","مطمئن نیستم، ولی ارسال رایگانه.","ما عندي معلومة مؤكدة اذا تحب نوصلها لباب البيت.","ما عندي معلومة مؤكدة اذا العلبة جاهزة، بس تتحمل الماي.","مطمئن نیستم چقدر لازم دارید و قیمت‌هامون از همه پایین‌تره.","تخفیف رو من نمی‌تونم بدم ولی ده درصد کم میکنیم."])ok("Claim beside a disclaimer stays a claim: "+t,P(t).length>0,P(t));
// cv57 BLIND-9 leak concepts, generalised (both languages)
for(const t of ["سلام، نگران نباشید، هیچ ضرری متوجه شما نمیشه.","ما راح تخسر شي عيوني."])ok("Implicit no-loss assurance is a compensation commitment: "+t,P(t).includes("compensation_commitment"),P(t));
for(const t of ["للأسف تخرب إذا وصلها ماي، فخليها بمكان ناشف.","با آب خراب میشه، خشک نگهش دارید."])ok("Water damage behaviour is a claim: "+t,P(t).includes("water_resistance_claim"),P(t));
for(const t of ["رنگ اختصاصی برندتون رو هم مشکلی نیست، میزنیم براتون.","لون البراند الخاص مالتك نطبعه عادي."])ok("Off-list colour acceptance is an owner-only commitment: "+t,P(t).length>0,P(t));
ok("Off-list colour deferred to the owner is allowed",P("رنگ خارج از لیست نیاز به تأیید مدیر داره.").length===0,P("رنگ خارج از لیست نیاز به تأیید مدیر داره."));
for(const t of ["نگران نباشید، معطل نمی‌مونید.","باید مدیر تایید کنه، که حتماً قبول می‌کنه."])ok("Delay assurance / owner prediction is a commitment: "+t,P(t).length>0,P(t));
// cv58 proposition scope: an operator governs only its own proposition; every smuggled commitment survives the mask.
const SC=await import(pathToFileURL(path.join(SRC,"sales-proposition-scope.js")).href);
for(const [t,keep] of [["ما عندي معلومة مؤكدة لأن البضاعة جاهزة","جاهزة"],["ما أكدر أأكد بس نوصلها باچر","نوصلها باچر"],["ما نضمن اللون ونضمن الجلد طبيعي","ونضمن الجلد طبيعي"],["نمی‌دونم ولی بیمه هست","بیمه هست"],["مطمئن نیستم ولی ثبت شد","ثبت شد"],["اطلاع دقیقی ندارم، هزینه باربری رو خودمون پرداخت می‌کنیم.","خودمون پرداخت"],["ما عندي معلومة مؤكدة الكرتون والنقل على حسابنا.","على حسابنا"],["مطمئن نیستم، ولی ارسال رایگانه.","ارسال رایگانه"],["ما عندي معلومة مؤكدة اذا تحب نوصلها لباب البيت.","نوصلها لباب البيت"],["ما عندي معلومة مؤكدة اذا العلبة جاهزة، بس تتحمل الماي.","تتحمل الماي"],["تخفیف رو من نمی‌تونم بدم ولی ده درصد کم میکنیم.","ده درصد کم میکنیم"],["سفارشتون قطعیه فقط تأیید مدیر لازمه","سفارشتون قطعیه"],["بالنسبة للعربون واصل وما عندي تفاصيل","واصل"],["الشحن مجاني ما عندي معلومة","الشحن مجاني"],["نوصلها لبابك ما نگدر نضمنه","نوصلها لبابك"],["بیمه داره نمی‌دونم","بیمه داره"],["الكرتون على حسابنا ما أگدر أأكد","على حسابنا"],["سفارش شما ثبت شده و تصمیم نهایی با مدیره","ثبت شده"],["هزینه ارسال با ماست، تصمیمش با مدیره","با ماست"],["ما أگدر أوعدك، الشحن علينا","الشحن علينا"],["الدفعة واصلة، يرجع لصاحب الشغل التأكيد","واصلة"],["پول رسیده، تأیید نهایی با مدیره","پول رسیده"],["ارسال رایگان رو مدیر تعیین میکنه","ارسال رایگان"],["التوصيل لباب البيت مضمون يقرره صاحب الشغل","مضمون"]])ok("cv58 scope keeps the smuggled commitment: "+t,SC.maskPropositionScopes(t).includes(keep),SC.maskPropositionScopes(t));
// cv58b closed content: «خاص» (an adjective) cannot be inside a removed span — this honest refusal stays unscoped (known over-block).
ok("KNOW over-block (cv58b closed content): «باربری خاص شما» refusal is not scoped",/\p{L}{3,}/u.test(SC.maskPropositionScopes("اینکه بار به باربری خاص شما تحویل بشه رو من نمی‌تونم قول بدم")));
for(const t of ["التسليم المباشر لمخزنك ما نگدر نضمنه بدون مستند","وبخصوص الضرر أو التعويض ما عندي شي مؤكد أگدر أوعدك بيه","اینکه تحویل از ترمینال باربری باشه یا جای دیگه، من اطلاعات تأییدشده ندارم و نمی‌تونم تحویل درب منزل رو قول بدم","الخصومات وطريقة الدفع يقررها صاحب الشغل بس"])ok("cv58 scope removes a complete non-committal proposition: "+t,!/\p{L}{3,}/u.test(SC.maskPropositionScopes(t).replace(/(?<!\p{L})(?:و|بس)(?!\p{L})/gu,'')),SC.maskPropositionScopes(t));
// cv58 A10-046 class: a duration in words or with an attached preposition is a production/delivery time claim.
for(const t of ["مواعيد الإنتاج يحددها صاحب الشغل، بس عادةً الشغل يخلص بأسبوع ونص.","الطلبية تجهز باليومين","الشغل يطلع خلال شهر","معمولاً کار یه هفته و نیم طول می‌کشه","الشحنة توصلك بأسبوعين إن شاء الله"])ok("cv58 time claim in words detected: "+t,P(t).some(x=>/time|duration|delivery/u.test(x)),P(t));
ok("cv58 honest unknown production time accepted",P("مواعيد الإنتاج يحددها صاحب الشغل وما عندي مدة مؤكدة.").length===0,P("مواعيد الإنتاج يحددها صاحب الشغل وما عندي مدة مؤكدة."));
// cv58 door rule: «لشركة الشحن» (the carrier) is not the customer's premises; the customer's company is.
ok("cv58 carrier company is not door delivery",!P("الإرسال للعراق يكون عن طريق شركة نقل بضائع، وأجور الشحن والكرتون ونقل البضاعة لشركة الشحن على الزبون.").includes("door_delivery_promise"));
for(const t of ["نوصلها لشركتك بنفسنا.","السائق يوصلها لشركتكم."])ok("cv58 delivery to the customer's company is a door promise: "+t,P(t).includes("door_delivery_promise"),P(t));
done();process.exit(0);
