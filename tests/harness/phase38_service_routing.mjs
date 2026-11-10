// Reproduce the owner's actual catalog dialogue with mocked providers and in-memory D1 only.
import fs from 'node:fs';import {makeWorld,reporter} from './harness.mjs';
import {approvedGuidanceCurrent,serviceFinancialQuestion,selectApprovedGuidance} from '../../worker/src/approved-sales-guidance.js';
const {ok,done}=reporter('phase38_service_routing');
const W=await makeWorld({aiBrain:'on',extraEnv:{PUBLIC_WORKER_BASE_URL:'https://w.test',AUTONOMY_ORCHESTRATOR:'on'}});
W.d1.db.exec(fs.readFileSync(new URL('../../owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql',import.meta.url),'utf8'));
for(const p of ['/api/quotes','/api/si/knowledge/product','/api/owner-escalations','/api/leads/outreach','/api/content/pipeline'])await W.call(p,null,'GET');
await W.call('/api/sales-ai-first',{mode:'on'});
const t=new Date().toISOString();
for(const [id,name,market,currency]of [['half','نیم ست کوچک · 8x8 · 3 تکه','IRAN','TOMAN'],['ring','انگشتر کوچک · 5x5 · 3 تکه','IRAN','TOMAN'],['arab','علبة خاتم صغيرة · 5x5x4 · ثلاث قطع','ARAB','USD']])W.dbrun('INSERT INTO commercial_price_items(id,product_key,product_name,market,currency,unit_price_minor,version,active,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,66000,1,1,?,?,?,?)',[id,id,name,market,currency,'test',t,t,t]);
const policies=[['IRAN','production','timing_rule','زمان سفارش چاپی ایران ۲ تا ۳ هفته است. زمان قطعی وعده داده نشود.'],['IRAN','shipping','terms','ارسال در تهران با اسنپ یا وانت انجام می‌شود. ارسال شهرستان با باربری و بسته‌بندی کارتنی انجام می‌شود.'],['ARAB','shipping','terms','المدة المعتادة للتسليم إلى العراق حوالي شهر ونصف، وهي تقديرية حسب وضع الطرق والحدود، وليست موعداً مضموناً.'],['IRAN','quantity','quantity_rule','در ایران حداقل هر سایز ۳۰۰ عدد، نیم‌سرویس و سرویس ۱۰۰ عدد، کشویی بگ‌دار هر سایز ۵۰۰ عدد است.'],['IRAN','knowledge','included_services_lid_spec',{schema:'hamzehi.knowledge.v1',kind:'capability',commercial:false,conditions:[],value:'چاپ طلاکوب، نقره‌کوب یا مشکی‌کوب روی درب رایگان است.'}],['IRAN','knowledge','color_selection_website',{schema:'hamzehi.knowledge.v1',kind:'rule',commercial:false,conditions:[],value:'انتخاب رنگ در https://www.hamzehibox.com'}]];
let seq=0;for(const [market,domain,attribute,value]of policies){const id='service-'+(++seq);await W.call('/api/sales-knowledge/propose',{id,operation:'ADD',domain,attribute,market,value:typeof value==='object'?{keywords:[],labels:{},priority:50,...value}:value,entity_type:'business',entity_key:'global'});await W.approveK(id);}
let uid=889900000;
const user=()=>({id:++uid,name:'TEST',username:'service'+uid});
const interpretation=primary_intent=>({primary_intent,product_key:null,reference:'none',requested_size:null,requested_color:[],requested_structure:null,requested_printing:null,quantity:null,ambiguity:'none',confidence:'high'});
const turn=async(u,message,{reply='حتماً.',requests=['product_info'],intent='product_info',owner=false,facts={}}={})=>{
 let ctx;W.AI.script.set(message,c=>{ctx=c;return W.D({reply,requests,owner_escalation_needed:owner,escalation_reason:owner?'missing_knowledge':null,interpretation:interpretation(intent),facts:{color_statement:'none',negated_colors:[],...facts}});});
 const start=W.tg.length,r=await W.send(u,message);const sent=W.tg.slice(start).filter(x=>x.method==='sendMessage').map(x=>JSON.parse(x.body)).filter(x=>String(x.chat_id)===String(u.id)).map(x=>x.text).join('\n');if(!r.brain)console.log('MISSING BRAIN',message,W.q('SELECT type,details_json FROM system_events ORDER BY created_at DESC LIMIT 4'));return {r,sent,ctx};};
const noOwner=x=>x.r.brain?.needs_owner===false&&!/پیگیری|خبرتون|بررسی می|أراجع|ارجعلك/.test(x.sent);
const brief=x=>({action:x.r.action,sent:x.sent,owner:x.r.brain?.needs_owner,reason:x.r.outcome?.reason,validation:x.r.brain?.validation,market:x.ctx?.market,...(!x.r.brain?{errors:W.q("SELECT type,details_json FROM system_events WHERE severity='error' ORDER BY created_at DESC LIMIT 2")}:{} )});
const u=user();await turn(u,'/start',{intent:'greeting',requests:['greeting']});
let x=await turn(u,'سلام، چه مدل جعبه هایی برای نیم ست موجود دارید',{owner:true,reply:'مدل‌ها را بررسی می‌کنم و خبرتون می‌دم.'});
ok('Exact live question asks Iran/Iraq before quantity, sends reply and creates no owner referral',noOwner(x)&&/ایران.*عراق/.test(x.sent)&&x.ctx.market===null,brief(x));
x=await turn(u,'سیصد عدد',{owner:true,reply:'سیصد عدد رو یادداشت کردم. مدل‌ها رو بررسی می‌کنم.',intent:'provide_details',facts:{quantity:300}});
ok('Quantity does not erase the pending catalog question or guess market',noOwner(x)&&/ایران.*عراق/.test(x.sent)&&x.r.brain?.catalog_pending,brief(x));
x=await turn(u,'ایران',{owner:true,reply:'به‌زودی مدل‌ها را می‌فرستم.',intent:'provide_details'});
ok('Clarified Iran resumes original half-set catalog question',noOwner(x)&&/نیم ست کوچک/.test(x.sent)&&/3 تکه/.test(x.sent)&&!/انگشتر کوچک/.test(x.sent),brief(x));
ok('No nonfinancial escalation was persisted across the live sequence',W.q('SELECT count(*) n FROM owner_escalations')[0].n===0);
x=await turn(u,'حداقل سفارش و زمان سفارش چاپی چقدر است؟',{reply:'{{INFORMATION}}'});
ok('MOQ plus delivery are both answered using approved facts',/۳۰۰/.test(x.sent)&&/۱۰۰/.test(x.sent)&&/۵۰۰/.test(x.sent)&&/۲ تا ۳ هفته/.test(x.sent)&&noOwner(x),brief(x));
ok('Relevant complete policy is present before the AI call',x.ctx.knowledge.some(k=>k.topic==='approved_information'&&k.value.includes('۲ تا ۳ هفته')&&k.value.includes('۵۰۰')));
x=await turn(u,'چاپ روی درب رایگان است؟',{reply:'{{INFORMATION}}',requests:['printing'],intent:'printing'});
ok('Printing scope stays on lid, without claiming bag or body free',x.sent.includes('روی درب رایگان')&&!/بگ|بدنه/.test(x.sent)&&noOwner(x),brief(x));
await W.teach('COLOR | مشکی سلفون | IRAN','IRAN','service-colour');
x=await turn(u,'رنگ بنفش را انتخاب کردم',{owner:true,reply:'این رنگ را بررسی می‌کنم.',requests:['choose_colors'],intent:'color_choice',facts:{color_statement:'choice',unknown_colors:['بنفش']}});
ok('Unknown color uses approved website without confirming availability or owner referral',x.sent.includes('hamzehibox.com')&&noOwner(x),brief(x));
x=await turn(u,'روبان مخمل هم میشه؟',{owner:true,reply:'از مالک می‌پرسم و خبرتون می‌دم.',requests:['ribbon']});
ok('Unknown capability asks a precise clarification without fictitious follow-up',x.sent.length>0&&noOwner(x)&&!/امکان.*دارد|موجود است/.test(x.sent),brief(x));
for(const status of ['confirmed','fulfilled']){
 const v=user();await turn(v,'سلام ایران');W.setMarket(v,'iran');const r=W.q('SELECT lead_id,conversation_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1',[String(v.id)])[0];
 W.dbrun("INSERT INTO lead_orders(id,order_number,quote_id,lead_id,conversation_id,product,quantity,currency,total_minor,status,market,created_at,updated_at) VALUES(?,?,?,?,?,'old',300,'TOMAN',10000,?,'IRAN',?,?)",['old-'+status,'old-'+status,'q-'+status,r.lead_id,r.conversation_id,status,t,t]);
 x=await turn(v,'برای سفارش جدید چاپی زمان تحویل چقدر است؟',{reply:'{{INFORMATION}}',requests:['production_time']});
 ok('Old '+status+' order does not block a new general timing question',x.sent.includes('۲ تا ۳ هفته')&&noOwner(x)&&!x.r.brain?.post_sale_review,brief(x));
}
const a=user();await turn(a,'هلا');W.setMarket(a,'iraq');x=await turn(a,'شنو موديلات العلب عندكم؟',{owner:true,reply:'راح أراجع وأرجعلك.'});
ok('Iraqi catalog remains isolated from Iran',x.sent.includes('علبة خاتم صغيرة')&&!x.sent.includes('نیم ست کوچک')&&noOwner(x),brief(x));
W.AI.fail=true;x=await turn(a,'شكد مدة التوصيل للعراق؟',{requests:['shipping']});W.AI.fail=false;
ok('Provider failure still sends approved Iraq estimate without owner referral',x.sent.includes('شهر ونصف')&&noOwner(x),brief(x));
const financeUser=user();await turn(financeUser,'سلام',{intent:'greeting',requests:['greeting']});W.setMarket(financeUser,'iran');
x=await turn(financeUser,'قیمت جعبه مدل فضایی نایاب چقدر است؟',{owner:true,reply:'{{COMMERCIAL}}',requests:['price'],intent:'price'});
ok('Price uncertainty stays autonomous without an invented amount',x.r.brain?.needs_owner===false&&x.sent.length>0&&!/[0-9۰-۹٠-٩].*(?:تومان|دولار)/.test(x.sent),brief(x));
ok('Price mixed with free printing is still financial',serviceFinancialQuestion('قیمت جعبه و چاپ رایگان چقدر است؟'));
const fresh=async country=>{const u=user();await turn(u,'سلام',{intent:'greeting',requests:['greeting']});if(country)W.setMarket(u,country);return u;};
for(const falseFree of ['روی بگ هم بدون هزینه است.','چاپ روی بدنه هم بدون پرداخت اضافه است.']){const v=await fresh('iran');x=await turn(v,'چاپ روی درب و بگ چطور است؟',{reply:falseFree,requests:['printing'],intent:'printing'});ok('Lid-only free printing cannot extend to other surfaces: '+falseFree,x.sent.includes('روی درب رایگان')&&!x.sent.includes(falseFree)&&noOwner(x),brief(x));}
{
 const v=await fresh('iran');x=await turn(v,'چه مدل نیم ست دارید و چاپ روی دربش رایگانه؟',{owner:true,reply:'{{INFORMATION}}'});
 ok('Mixed catalog and printing both reach the customer',x.sent.includes('نیم ست کوچک')&&x.sent.includes('روی درب رایگان')&&noOwner(x),brief(x));
 x=await turn(v,'قیمت نیم ست کوچک و زمان تحویل سفارش چاپی چقدر است؟',{reply:'{{COMMERCIAL}} {{INFORMATION}}',requests:['price','production_time'],intent:'price'});
 ok('Financial plus timing retains the approved timing and the independent price flow',x.r.brain?.draft_customer_reply?.includes('۲ تا ۳ هفته')&&!x.r.brain?.draft_customer_reply?.includes('{{INFORMATION}}')&&['answer_price','ask_attribute','clarify_product','price_owner'].includes(x.r.action),brief(x));
}
{
 const v=await fresh();x=await turn(v,'حداقل سفارش و زمان تحویل سفارش چاپی چقدر است؟',{owner:true,reply:'بررسی می‌کنم.'});
 ok('Unknown-market policy question asks market without owner referral',/ایران.*عراق/.test(x.sent)&&noOwner(x),brief(x));
 x=await turn(v,'ایران',{reply:'{{INFORMATION}}',intent:'provide_details'});
 ok('Market answer resumes both MOQ and timing question',x.sent.includes('۳۰۰')&&x.sent.includes('۲ تا ۳ هفته')&&noOwner(x),brief(x));
}
{
 const v=await fresh();await turn(v,'چه مدل نیم ست دارید؟',{owner:true,reply:'بررسی می‌کنم.'});
 await turn(v,'برای فروشگاه خودم می‌خوام',{owner:true,reply:'پیگیری می‌کنم.',intent:'provide_details'});
 x=await turn(v,'ایران',{owner:true,reply:'پیگیری می‌کنم.',intent:'provide_details'});
 ok('Intervening detail does not erase the unanswered catalog question',x.sent.includes('نیم ست کوچک')&&noOwner(x),brief(x));
}
{
 const v=await fresh('iraq');x=await turn(v,'شنو اقل كمية ومدة التوصيل للعراق؟',{reply:'{{INFORMATION}}',requests:['moq','shipping']});
 ok('Mixed Iraqi MOQ and timing preserves 500 and approximate duration',x.sent.includes('500')&&x.sent.includes('شهر ونصف')&&noOwner(x),brief(x));
 const w=await fresh('iraq');x=await turn(w,'شكد مدة التوصيل للعراق؟',{reply:'خلال يوم واحد.',requests:['shipping']});
 ok('Written-out invented Arabic duration is rejected outside approved segment',x.sent.includes('شهر ونصف')&&!x.sent.includes('يوم واحد')&&noOwner(x),brief(x));
 for(const promise of ['باچر توصلك.','بكرة عندك.','غداً جاهز.','الموعد مضمون.']){const w=await fresh('iraq');x=await turn(w,'شكد مدة التوصيل للعراق؟',{reply:promise,requests:['shipping']});ok('Unsupported promise never reaches customer: '+promise,x.sent.includes('شهر ونصف')&&!x.sent.includes(promise)&&noOwner(x),brief(x));}
}
{
 const v=await fresh('iran');x=await turn(v,'زمان تحویل سفارش چاپی چقدر است؟',{reply:'{{INFORMATION}}'});
 const g=x.r.brain?.approved_guidance;ok('Information revision initially revalidates',!!g&&await approvedGuidanceCurrent(W.env,g));
 const rows=W.q("SELECT * FROM sales_knowledge_facts WHERE domain='production' AND market='IRAN'");
 W.dbrun("UPDATE sales_knowledge_facts SET status='superseded' WHERE domain='production' AND market='IRAN'");
 ok('Superseded information revision cannot pass the send recheck',!!g&&!await approvedGuidanceCurrent(W.env,g));
 const partial=selectApprovedGuidance(rows,{market:'IRAN',request:{kind:'information',topics:['timing','lid']}});
 ok('Missing topic is explicit instead of silently omitted',partial?.missing_topics.includes('lid')&&partial.text.includes('چاپ درب'));
 const conflict=selectApprovedGuidance([...rows,{...rows[0],id:'conflict'}],{market:'IRAN',request:{kind:'information',topics:['timing']}});
 ok('Conflicting information has no privileged segment',conflict===null);
}
ok('No real external calls',W.offNet().length===0,W.offNet());
process.exitCode=done()?1:0;
