// PHASE 28 — the AI prose number gate must not read the verb «می‌ده» (gives) as the number ten (live 2026-11-08, inbox 76a92c21:
// fallback_reason prose:unapproved_number:10, the AI colour advice was replaced by the plain knowledge list). Local only: AI and
// Telegram are in-process mocks.
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase28_ai_verb_number");
const SA=await import("../../worker/src/sales-ai-brain.js");
const P=(t,allowed=[])=>SA.salesAiProseIssues(t,{allowedNumbers:allowed});
const clean=(t,allowed)=>P(t,allowed).length===0,num=(t,allowed)=>P(t,allowed).some(x=>/^unapproved_number|price_claim|moq_claim|money_number|currency|discount|duration_claim/.test(x));
const ASK="برای جعبه انگشتری چه ترکیب رنگی پیشنهاد می‌کنی؟ مثلاً طلایی و مشکی خوبه؟ دلیلش رو هم بگو.";
const GOLD="ترکیب طلایی و مشکی انتخاب خیلی خوبیه؛ مشکی سلفون پس‌زمینه‌ی رسمی و لوکسی می‌ده و طلاکوب روش برجسته‌تر دیده می‌شه، برای همین حس یه هدیه‌ی ارزشمند رو منتقل می‌کنه. اگه حال‌وهوای ملایم‌تری بخواید، سرمه‌ای سلفون با نقره‌کوب هم جلوه‌ی شیکی نشون می‌ده. کدوم سبک بیشتر به سلیقه‌تون نزدیکه؟";

// A/B — the reproducer and natural colour advice
ok("A1 the gold-and-black advice (with «می‌ده») has no prose issue",clean(GOLD),P(GOLD));
for(const t of ["طلاکوب روی مشکی خیلی خوب جواب می‌ده","این ترکیب جلوه می ده","نشون می‌ده که سلیقه دارید","سبز تیفانی حس تازگی نمی‌ده ولی شیکه","این رنگ به جعبه حالت شیک‌تری می‌دهد","بهتون پیشنهاد می‌دم"])ok("B1 verb form is not a number: "+t,clean(t),P(t));
// C — catalog dimensions stay grounded by the allowed numbers
ok("C1 «(۶x۶)» and «(۵x۵)» pass when 5 and 6 are grounded",clean("جعبه انگشتر بزرگ (۶x۶) یا کوچک (۵x۵)؟",[5,6]),P("جعبه انگشتر بزرگ (۶x۶) یا کوچک (۵x۵)؟",[5,6]));
ok("C2 the same sizes are rejected when not grounded",num("جعبه انگشتر بزرگ (۶x۶) یا کوچک (۵x۵)؟",[]));
// D — counting words in prose (below ten) are ordinary language; a real spoken ten is still a number
ok("D1 «یه ترکیب» / «سه بخش» are language, not figures",clean("یه ترکیب دیگه هم هست: سه بخش جعبه رو می‌تونید جدا رنگ کنید."));
ok("D2 a real «ده» is still a number («ده رنگ داریم»)",num("ده رنگ داریم"));
ok("D3 digit ten is still a number («۱۰ رنگ»)",num("۱۰ رنگ داریم"));
// E — prices, discounts, deposits, shipping amounts
for(const t of ["قیمتش ده هزار تومنه","ده درصد تخفیف می‌دیم","تخفیف ده درصدی می‌ده","پیش‌پرداخت پنجاه درصده","هزینه ارسال ده دلاره","هر عدد ۱۰ دلار","می‌ده ده هزار تومن","مبلغ کل بیست میلیون"])ok("E1 financial figure rejected: "+t,num(t),P(t));
// F — MOQ / quantity commitments
for(const t of ["حداقل سفارش ده عدده","حداقل ده تا باید بگیرید","ده روزه تحویل می‌دیم"])ok("F1 quantity / MOQ / time commitment rejected: "+t,num(t),P(t));

// A2 — end to end: the real reply path uses the AI answer (reply_source ai), not the legacy list
{const W=await makeWorld({aiBrain:"on"});SA.resetSalesAiCooldown();let uid=728000000;const u={id:++uid,name:"vb",username:"vb"+uid};
 await W.send(u,"سلام");W.setMarket(u,"iran");
 // (this local world has no approved colour knowledge, so the end-to-end answer names only the colours the customer gave)
 const E2E="ترکیب طلایی و مشکی انتخاب خیلی خوبیه؛ کنتراست بالایی داره و حس رسمی و لوکسی می‌ده. کدوم مدل جعبه مدنظرتونه؟";
 W.AI.script.set(ASK,()=>({requests:[],reply:E2E}));
 const r=await W.send(u,ASK);
 ok("A2 live scenario: the AI answer is used (reply_source ai, no prose fallback)",r.brain?.ai_brain?.reply_source==="ai"&&!r.brain?.ai_brain?.fallback_reason,[r.brain?.ai_brain?.reply_source,r.brain?.ai_brain?.fallback_reason,r.action]);
 ok("A3 the customer receives the AI wording, sent automatically",r.draft?.status==="sent"&&String(r.draft?.message||"").includes("حس رسمی و لوکسی می‌ده"),[r.draft?.status,String(r.draft?.message||"").slice(0,80)]);
 // E2 — the same path with an invented price still falls back (the gate is not weakened)
 const ASK2="طلایی و مشکی چند درمیاد؟";W.AI.script.set(ASK2,()=>({requests:[],reply:"ترکیب طلایی و مشکی حس لوکس می‌ده و هر عدد ده هزار تومن درمیاد."}));
 const r2=await W.send(u,ASK2);
 ok("E2 an AI reply with an invented price is never used",r2.brain?.ai_brain?.reply_source!=="ai"&&!String(r2.draft?.message||"").includes("ده هزار"),[r2.brain?.ai_brain?.reply_source,r2.brain?.ai_brain?.fallback_reason,String(r2.draft?.message||"").slice(0,80)]);}
process.exit(done()?1:0);
