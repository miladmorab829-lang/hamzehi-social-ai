// Replay actual observed provider text and multi-question regressions, through the real outbound path. No external calls.
import fs from 'node:fs';import {makeWorld,reporter} from './harness.mjs';
import {serviceCompanionParts,splitSalesReply} from '../../worker/src/sales-reply-composition.js';
import {approvedServiceRequest,serviceCatalogQuestion,serviceFollowupPromise} from '../../worker/src/approved-sales-guidance.js';
const {ok,done}=reporter('phase39_conversation_quality');
const W=await makeWorld({aiBrain:'on',extraEnv:{PUBLIC_WORKER_BASE_URL:'https://w.test',AUTONOMY_ORCHESTRATOR:'on'}});
W.d1.db.exec(fs.readFileSync(new URL('../../owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql',import.meta.url),'utf8'));
for(const p of ['/api/quotes','/api/si/knowledge/product','/api/owner-escalations','/api/leads/outreach','/api/content/pipeline'])await W.call(p,null,'GET');await W.call('/api/sales-ai-first',{mode:'on'});
const policies=[['IRAN','production','timing_rule','زمان سفارش چاپی ایران ۲ تا ۳ هفته است.'],['ARAB','shipping','terms','المدة المعتادة للتسليم إلى العراق حوالي شهر ونصف، وهي تقديرية حسب وضع الطرق والحدود، وليست موعداً مضموناً.'],['IRAN','knowledge','included_services_lid_spec',{schema:'hamzehi.knowledge.v1',kind:'capability',commercial:false,conditions:[],keywords:['چاپ درب'],labels:{fa:'چاپ درب'},priority:50,value:'چاپ طلاکوب، نقره‌کوب یا مشکی‌کوب روی درب رایگان است.'}]];
let n=0;for(const [market,domain,attribute,value]of policies){const id='quality-'+(++n);await W.call('/api/sales-knowledge/propose',{id,operation:'ADD',market,domain,attribute,value,entity_type:'business',entity_key:'global'});await W.approveK(id);}
await W.teach('COLOR | مشکی سلفون | IRAN','IRAN','quality-black');
let uid=884400000;
const interp=primary_intent=>({primary_intent,product_key:null,reference:'none',requested_size:null,requested_color:[],requested_structure:null,requested_printing:null,quantity:null,ambiguity:'none',confidence:'high'});
const turn=async(u,message,reply,{requests=['other'],intent='other',owner=false,escalationReason='missing_knowledge'}={})=>{W.AI.script.set(message,()=>W.D({reply,requests,interpretation:interp(intent),owner_escalation_needed:owner,escalation_reason:owner?escalationReason:null,facts:{color_statement:'none',negated_colors:[]}}));const k=W.tg.length,r=await W.send(u,message);const sent=W.tg.slice(k).filter(x=>x.method==='sendMessage').map(x=>JSON.parse(x.body)).filter(x=>String(x.chat_id)===String(u.id)).map(x=>x.text).join('\n');return {r,sent};};
const fresh=async market=>{const u={id:++uid,name:'TEST',username:'quality'+uid};await turn(u,'سلام','سلام، خوش اومدید. چه کمکی از دستم برمیاد؟',{intent:'greeting',requests:['greeting']});if(market)W.setMarket(u,market);return u;};
const brief=x=>({sent:x.sent,action:x.r.action,reason:x.r.outcome?.reason,validation:x.r.brain?.validation,ai:x.r.brain?.ai_brain});
{
 const u={id:++uid,name:'TEST',username:'quality'+uid};
 const x=await turn(u,'/start','سلام، به همزه‌ای باکس خوش اومدید 🌸 ما جعبه‌های کادویی و جواهرات سفارشی برای کسب‌وکارها تولید می‌کنیم. بفرمایید دنبال چه نوع جعبه‌ای هستید؟',{intent:'greeting',requests:['greeting']});
 ok('Observed production greeting retains a greeting after unsupported assertion is removed',x.sent.startsWith('سلام')&&x.sent.includes('چه نوع جعبه')&&!x.sent.includes('تولید می‌کنیم'),brief(x));
}
{
 const u=await fresh('iran');let x=await turn(u,'چاپ روی درب رایگانه؟ لوگوم را همینجا بفرستم؟','سلام 🌸 {{INFORMATION}} بله، تصویر لوگو را همین‌جا بفرستید.',{requests:['printing'],intent:'printing'});
 ok('Two questions both answered: approved printing plus safe logo submission',x.sent.includes('روی درب رایگان')&&x.sent.includes('تصویر لوگو را همین‌جا بفرستید')&&x.r.brain?.needs_owner===false,brief(x));
 x=await turn(u,'لوگو را بعدا می‌فرستم؛ فعلا چه رنگی دارید؟','رنگ‌های استاندارد: مشکی سلفون.',{requests:['colors_available'],intent:'colors_available'});
 ok('Deferred logo mention does not replace the current color answer with printing policy',x.sent==='رنگ‌های استاندارد: مشکی سلفون.'&&!x.r.brain?.approved_guidance,brief(x));
 x=await turn(u,'ممنون، چاپ روی درب رایگانه؟','خواهش می‌کنم. {{INFORMATION}}',{requests:['printing'],intent:'printing'});
 ok('A polite repeated policy question does not falsely say the new turn was already answered',x.sent.includes('خواهش')&&x.sent.includes('روی درب رایگان')&&x.r.outcome?.reason!=='repetitive_reply',brief(x));
}
{
 const u=await fresh('iran');const x=await turn(u,'چاپ روی درب و رنگ‌ها چطور است؟','{{INFORMATION}} رنگ‌های استاندارد: مشکی سلفون.',{requests:['printing','colors_available'],intent:'printing'});
 ok('Printing and approved colors are both answered',x.sent.includes('روی درب رایگان')&&x.sent.includes('رنگ‌های استاندارد: مشکی سلفون'),brief(x));
}
{
 const u=await fresh('iran');await turn(u,'جعبه دستبند میخوام','متوجه شدم.',{requests:['provide_details'],intent:'provide_details'});
 const x=await turn(u,'زمان سفارش چاپی چقدر است؟','{{INFORMATION}} کدام مدل را می‌پسندید؟',{requests:['production_time']});
 ok('Previously stated product does not trigger another generic model question',x.sent.includes('۲ تا ۳ هفته')&&!x.sent.includes('کدام مدل'),brief(x));
}
{
 const u=await fresh('iran');const x=await turn(u,'چاپ روی درب و بگ چطور است؟ لوگو را همینجا بفرستم؟','سلام، روی بگ هم بدون هزینه است. {{INFORMATION}} تصویر لوگو را همین‌جا ارسال کنید.',{requests:['printing'],intent:'printing'});
 ok('Unsafe free-bag claim is dropped while harmless logo submission survives',x.sent.includes('روی درب رایگان')&&x.sent.includes('تصویر لوگو را همین‌جا ارسال کنید')&&!x.sent.includes('بدون هزینه'),brief(x));
}
{
 const u=await fresh('iran');const x=await turn(u,'چاپ روی بگ هم رایگانه؟','بله، روی بگ هم بدون هزینه است.',{requests:['printing'],intent:'printing'});
 ok('Bare yes cannot survive rejection of a free-bag claim',!/^بله|^حتما|^چشم/u.test(x.sent)&&!x.sent.includes('بدون هزینه'),brief(x));
}
{
 const u=await fresh('iraq');const x=await turn(u,'شكد مدة التوصيل؟','هلا، باچر توصلك. {{INFORMATION}} أي موديل تفضّل؟',{requests:['shipping'],intent:'shipping'});
 ok('Iraqi courtesy and useful next question survive while false delivery promise is removed',x.sent.includes('هلا')&&x.sent.includes('شهر ونصف')&&x.sent.includes('أي موديل تفضّل')&&!x.sent.includes('باچر'),brief(x));
}
{
 const u=await fresh();const x=await turn(u,'سلام، چه مدل‌هایی برای نیم ست دارید؟','سلام، خیلی خوش اومدید 🌸 مدل‌ها رو بررسی می‌کنم و براتون می‌فرستم. چند عدد لازم دارید؟',{requests:['greeting','product_info'],intent:'product_info',owner:true});
 ok('Market clarification retains courtesy and does not ask quantity before market',x.sent.startsWith('سلام')&&/ایران.*عراق/.test(x.sent)&&!x.sent.includes('چند عدد')&&!x.r.brain?.needs_owner,brief(x));
}
for(const text of ['بله، روی بگ هم بدون هزینه است.','حتماً. فردا آماده است.','أكيد. الموعد مضمون.','تمام، تم تأكيد الدفع.','روی بگ هم بدون هزینه است.','چاپ بدنه بدون پرداخت اضافه است.','غداً جاهز.','الموعد مضمون.','پرداخت شما تأیید شد.','قیمت یک تومان است.','تصویر لوگو را همین‌جا ارسال کنید و رایگان چاپ می‌کنیم.']){
 const p=serviceCompanionParts(text,{message:'لوگو و چاپ؟'});ok('Unapproved assertion cannot enter through conversational companion: '+text,!p.opening&&!p.answers.length&&!p.question,p);
}
for(const reply of ['همکارم راهنماییتون می‌کنه.','از مالک می‌پرسم.','با مدیریت تماس بگیرید.','المسؤول یجاوبک.']){
 const u=await fresh(reply.includes('المسؤول')?'iraq':'iran');const x=await turn(u,'روبان مخمل برای این مدل دارید؟',reply);
 ok('Nonfinancial handoff is removed even when model flag is false: '+reply,x.r.brain?.needs_owner===false&&x.sent.length>0&&!x.sent.includes(reply)&&!serviceFollowupPromise(x.sent),brief(x));
}
ok('A staff introduction alone is not a referral',!serviceFollowupPromise('من همکار فروش هستم. چه مدلی می‌خواید؟'));
{
 const u=await fresh('iran');const x=await turn(u,'چاپ روی درب رایگانه و بیعانه لازم نیست؟','سلام، بیعانه لازم نیست. {{INFORMATION}}',{requests:['printing','payment'],intent:'payment'});
 ok('Mixed deposit question keeps approved printing and denies unapproved waiver without owner work',x.sent.includes('روی درب رایگان')&&/پیش‌پرداخت|بیعانه/.test(x.sent)&&!/بیعانه لازم نیست|ثبت شد/.test(x.sent)&&x.r.brain?.needs_owner===false,brief(x));
 const before=W.q('SELECT * FROM owner_escalations WHERE lead_id=?',[x.r.brain.lead_id]);
 ok('Deposit policy question creates no owner case, order or payment',before.length===0&&W.q('SELECT count(*) n FROM lead_orders WHERE lead_id=?',[x.r.brain.lead_id])[0].n===0,before.map(e=>({reason:e.reason_code,status:e.status})));
 const next=await turn(u,'بدون بیعانه می‌خوام','بله، بدون بیعانه انجام می‌دهیم.',{requests:['payment'],intent:'payment'});
 ok('Following zero-deposit clarification does not approve terms or create an owner case',W.q('SELECT count(*) n FROM owner_escalations WHERE lead_id=?',[x.r.brain.lead_id])[0].n===0&&!next.sent.includes('بدون بیعانه انجام')&&next.sent.length>0,brief(next));
}
{
 const u=await fresh('iran');const first=await turn(u,'تخفیف ویژه می‌خوام','درخواست تخفیف نیاز به تأیید مدیر دارد.',{requests:['discount'],intent:'discount',owner:true,escalationReason:'unapproved_terms'});
 const lead=first.r.brain.lead_id,prior=W.q('SELECT * FROM owner_escalations WHERE lead_id=?',[lead]);
 const x=await turn(u,'چاپ روی درب رایگانه و بیعانه لازم نیست؟','سلام، بیعانه لازم نیست. {{INFORMATION}}',{requests:['printing','payment'],intent:'payment'});
 const after=W.q('SELECT * FROM owner_escalations WHERE lead_id=?',[lead]);
 ok('Separate discount and waiver questions stay autonomous without granting concessions',prior.length===0&&after.length===0&&!x.r.brain?.owner_topic&&!/بیعانه لازم نیست|بدون بیعانه انجام/.test(x.sent),{prior:prior.map(e=>e.context_summary),after:after.map(e=>e.context_summary),reply:brief(x)});
 const again=await turn(u,'چاپ روی درب رایگانه و بیعانه لازم نیست؟','{{INFORMATION}}',{requests:['printing','payment'],intent:'payment'});
 ok('Repeating the mixed waiver request still creates no financial case',W.q('SELECT count(*) n FROM owner_escalations WHERE lead_id=?',[lead])[0].n===0&&!again.r.brain?.needs_owner,brief(again));
}
const known=serviceCompanionParts('چند عدد لازم دارید؟',{quantity:300});ok('Known quantity is not asked again',known.question===null);
for(const message of ['لوگو ندارم.','لوگو را فرستادم.','لوگو را بعداً می‌فرستم.'])ok('Logo submission is not repeated from background statement: '+message,serviceCompanionParts('تصویر لوگو را همین‌جا بفرستید.',{message}).answers.length===0);
ok('Logo/background mention is not a print-policy request',approvedServiceRequest('لوگو را بعدا می‌فرستم؛ فعلا چه رنگی دارید؟')===null);
ok('Arabic catalog phrasings remain understood',serviceCatalogQuestion('شكو موديلات عندكم؟')&&serviceCatalogQuestion('شنو أنواع العلب؟'));
ok('Greeting can be split away from unsupported business assertion',splitSalesReply('سلام، تولید یک‌روزه داریم. چه مدلی؟')[0]==='سلام،');
ok('No real external calls',W.offNet().length===0,W.offNet());
process.exitCode=done()?1:0;
