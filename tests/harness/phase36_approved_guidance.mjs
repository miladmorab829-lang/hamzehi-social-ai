// Local only: real Worker routing and outbound gates, mocked AI and Telegram.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {makeWorld,reporter} from './harness.mjs';
import {approvedGuidanceRequest,selectApprovedGuidance,maskApprovedGuidance,approvedGuidanceCurrent} from '../../worker/src/approved-sales-guidance.js';
import {salesAiProseIssues} from '../../worker/src/sales-ai-brain.js';
import {moqPolicy} from '../../worker/src/commercial-policy.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');const {ok,done}=reporter('phase36_approved_guidance');
const W=await makeWorld({aiBrain:'on',extraEnv:{PUBLIC_WORKER_BASE_URL:'https://w.test',AUTONOMY_ORCHESTRATOR:'on'}});
W.d1.db.exec(fs.readFileSync(path.join(root,'owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql'),'utf8'));
for(const p of ['/api/quotes','/api/si/knowledge/product','/api/owner-escalations','/api/leads/outreach','/api/content/pipeline'])await W.call(p,null,'GET');
W.d1.db.exec(fs.readFileSync(path.join(root,'owner-actions/phase25-delete-system/01-migration.sql'),'utf8'));
await W.call('/api/sales-ai-first',{mode:'on'});
const policy=[
 ['IRAN','production','timing_rule','زمان سفارش چاپی ایران ۲ تا ۳ هفته است. زمان قطعیِ تأییدنشده وعده داده نشود.'],
 ['IRAN','shipping','terms','ارسال در تهران با اسنپ یا وانت انجام می‌شود. ارسال شهرستان با باربری و بسته‌بندی کارتنی انجام می‌شود.'],
 ['ARAB','shipping','terms','المدة المعتادة للتسليم إلى العراق حوالي شهر ونصف، وهي تقديرية حسب وضع الطرق والحدود، وليست موعداً مضموناً.'],
 ...['IRAN','ARAB'].map(m=>[m,'knowledge','color_selection_website',{schema:'hamzehi.knowledge.v1',kind:'rule',priority:50,conditions:[],keywords:['رنگ','لون','سایت'],labels:{fa:'انتخاب رنگ',ar:'اختيار اللون'},value:'برای انتخاب رنگ به https://www.hamzehibox.com مراجعه کنید و انتخاب را در تلگرام بفرستید.'}])
];
let id=0;for(const [market,domain,attribute,value]of policy){const key='guidance-test-'+(++id);const r=await W.call('/api/sales-knowledge/propose',{id:key,operation:'ADD',domain,attribute,market,value,entity_type:'business',entity_key:'global'});if(!r.body.ok)throw Error(JSON.stringify(r));await W.approveK(key);}
let uid=880000000;const customer=async market=>{const u={id:++uid,name:'TEST',username:'test'+uid};await W.send(u,market==='iran'?'سلام':'هلا');W.setMarket(u,market);return u;};
const say=async(u,msg,requests=[],reply='حتماً.')=>{W.AI.script.set(msg,()=>W.D({reply,requests,interpretation:{primary_intent:'other',product_key:null,reference:'none',requested_size:null,requested_color:[],requested_structure:null,requested_printing:null,quantity:null,ambiguity:'none',confidence:'high'},facts:{color_statement:'none',negated_colors:[]}}));const start=W.tg.length,r=await W.send(u,msg);const sent=W.tg.slice(start).filter(x=>x.method==='sendMessage').map(x=>JSON.parse(x.body)).filter(x=>String(x.chat_id)===String(u.id)).map(x=>x.text);return {r,sent,text:sent.join(' ')};};
const fa=await customer('iran');
let r=await say(fa,'سفارش چاپی چند هفته طول می‌کشد؟',[], 'یک روزه تحویل می‌دهیم.');
ok('Iran owner estimate passes the complete outbound gate; invented faster promise does not',/۲ تا ۳ هفته/.test(r.text)&&!r.text.includes('یک روزه'),r);
r=await say(fa,'تهران چطور ارسال می‌کنید؟',['shipping']);ok('Tehran method is read from approved terms',/اسنپ|وانت/.test(r.text),r);
const county=await customer('iran');r=await say(county,'شهرستان چطور ارسال می‌کنید؟',['shipping']);ok('County shipping includes carrier and cartons',/باربری/.test(r.text)&&/کارتنی/.test(r.text),r);
const ar=await customer('iraq');r=await say(ar,'شكد مدة التوصيل للعراق؟',['shipping'],'خلال يوم واحد.');ok('Iraq approximate estimate reaches Telegram',r.text.includes('حوالي شهر ونصف')&&!r.text.includes('يوم واحد'),r);
r=await say(ar,'أريده أسرع، الموعد بالضبط شنو؟',['shipping']);ok('Exact-date insistence keeps estimate and continues details without nonfinancial owner referral',!r.r.brain?.needs_owner&&!r.text.includes('أستعلم')&&r.text.includes('شهر ونصف')&&/نوع|الكمية|المقاس/.test(r.text),r);
const ownerCount=()=>W.q("SELECT count(*) n FROM owner_escalations WHERE reason_code='uncertain_shipping'")[0].n;
ok('Nonfinancial delivery creates no owner inquiry',ownerCount()===0,ownerCount());
r=await say(ar,'ضروري، الموعد بالضبط؟',['shipping']);ok('Repeated inquiry does not create an owner decision',ownerCount()===0,ownerCount());
r=await say(ar,'بالضبط، أريده أسرع',['shipping']);ok('Third inquiry preserves delivery topic without commercial decision',ownerCount()===0&&r.r.action==='answer_delivery',r);
r=await say(ar,'أحتاج 500 علبة خاتم',['product_info']);ok('Next order detail is not frozen by delivery inquiry',r.sent.length>0&&!['wait_for_owner','commercial_owner'].includes(r.r.action),r);
const fcolor=await customer('iran');r=await say(fcolor,'برای انتخاب رنگ مطمئن نیستم، رنگ و مدل را کجا ببینم؟',['product_info']);ok('Persian color navigation beats broad gallery trigger',r.text.includes('https://www.hamzehibox.com')&&r.r.action==='answer_color_selection',r);
const acolor=await customer('iraq');r=await say(acolor,'وين أختار لون وموديل العلبة؟',['product_info']);ok('Arabic color navigation uses approved website',r.text.includes('https://www.hamzehibox.com'),r);
r=await say(fcolor,'عکس رنگ‌های جعبه را بفرست',['product_info']);ok('Explicit photo request remains a gallery request',r.r.action==='visual',r);
r=await say(fcolor,'عکس رنگ آبی رو میخوام ببینم',['product_info']);ok('Want-to-see-photo stays in gallery without a send verb',r.r.action==='visual',r);
ok('Existing-order timing is not a generic delivery estimate',approvedGuidanceRequest('سفارشم کی تحویل میشه؟')===null&&approvedGuidanceRequest('متى توصل طلبي؟')===null);
ok('Money+delivery never enters informational selector',approvedGuidanceRequest('قیمت با ارسال چقدر است؟')===null);
ok('A plain acknowledgement after a timing answer does not request another inquiry',approvedGuidanceRequest('حتماً، ممنون',[],{kind:'delivery'})===null);
ok('Explicit known color choice is not website navigation',approvedGuidanceRequest('رنگ مشکی سلفون را انتخاب کردم')===null);
ok('Explicit unknown color choice is not website navigation',approvedGuidanceRequest('رنگ بنفش را انتخاب کردم')===null);
ok('AI duration guard remains unchanged',salesAiProseIssues('تا ۲ روز تحویل می‌دهیم.').length>0);
const raw=W.q("SELECT * FROM sales_knowledge_facts WHERE domain='production'")[0],req={kind:'delivery',topic:'timing',insist:false};
const select=rows=>selectApprovedGuidance(rows,{market:'IRAN',request:req,at:Date.parse('2026-11-09T15:00:00Z')});
ok('Missing facts fail closed',select([])===null);ok('Wrong market fails closed',select([{...raw,market:'ARAB'}])===null);
ok('Inactive facts fail closed',select([{...raw,status:'inactive'}])===null);ok('Unapproved facts fail closed',select([{...raw,authority:'unapproved'}])===null);
ok('Future facts fail closed',select([{...raw,effective_from:'2027-01-01T00:00:00Z'}])===null);ok('Expired facts fail closed',select([{...raw,effective_until:'2025-01-01T00:00:00Z'}])===null);
ok('Conflicting active facts fail closed',select([raw,{...raw,id:'other'}])===null);
ok('Iraq duration is not used as a shipping method',selectApprovedGuidance(W.q("SELECT * FROM sales_knowledge_facts WHERE market='ARAB'"),{market:'ARAB',request:{kind:'delivery',topic:'method'}})===null);
const selected=select([raw]);ok('Only exact approved fragment is masked',maskApprovedGuidance(selected.text+' قیمت 999',selected)===' قیمت 999');
ok('Live send revalidation requires current exact revision',await approvedGuidanceCurrent(W.env,selected));
ok('Changed revision rejected',!await approvedGuidanceCurrent(W.env,{...selected,facts:[{...selected.facts[0],version:999}]}));
const resetUser=await customer('iran');const lead=W.q('SELECT lead_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1',[String(resetUser.id)])[0].lead_id;
const conv=W.q('SELECT conversation_id FROM inbox_messages WHERE lead_id=? LIMIT 1',[lead])[0].conversation_id;
W.dbrun('UPDATE inbox_messages SET created_at=? WHERE lead_id=?',[new Date(Date.now()-30*86400000).toISOString(),lead]);
const preview=await W.call('/api/cleanup/preview',{action:'trash',scope:'ids',section:'context',ids:[conv]});
if(!preview.body?.token)throw Error('Reset preview failed '+JSON.stringify(preview));
await W.call('/api/cleanup/execute',{token:preview.body.token,confirm:preview.body.confirm_phrase||undefined});
r=await say(resetUser,'سفارش چاپی ایران چند هفته طول می‌کشد؟',['shipping']);ok('Fresh approved timing works after archived conversation reset',r.r.brain?.context_reset===true&&/۲ تا ۳ هفته/.test(r.text),r);
r=await say(resetUser,'رنگ را کجا ببینم؟',['product_info']);ok('Website guidance works after archived conversation reset',r.text.includes('hamzehibox.com'),r);
await W.call('/api/sales-knowledge/propose',{id:'guidance-owner-stop',operation:'ADD',domain:'knowledge',entity_type:'business',entity_key:'global',attribute:'special_route_constraint',market:'IRAN',value:{schema:'hamzehi.knowledge.v1',kind:'prohibition',priority:50,conditions:[{field:'message',op:'contains',value:'مسیر ویژه'}],keywords:['مسیر ویژه'],labels:{fa:'محدودیت مسیر'},value:'مسیر ویژه نیازمند بررسی مالک است.'}});await W.approveK('guidance-owner-stop');
const stopped=await customer('iran');r=await say(stopped,'زمان ارسال از مسیر ویژه چند هفته است؟',['shipping']);ok('Applicable owner prohibition is not bypassed by delivery estimate',!r.r.brain?.approved_guidance&&!r.text.includes('۲ تا ۳ هفته'),r);
await W.teach('COLOR | مشکی سلفون | IRAN','IRAN','guidance-colors-black');
const special=await customer('iran');r=await say(special,'رنگ بنفش را انتخاب کردم، کجا ببینم؟',['product_info']);ok('Unapproved color keeps owner path rather than navigation',r.r.action!=='answer_color_selection'&&!r.r.brain?.approved_guidance,r);
for(const [market,product,configuration,n]of [['IRAN','انگشتر کوچک','2 تکه',300],['IRAN','نیم سرویس','3 تکه',100],['IRAN','سرویس 20x20','3 تکه',100],['IRAN','نیم سرویس','کشویی بگ‌دار',500],['ARAB','علبة خاتم صغيرة','ثلاث قطع',500]])ok('MOQ unchanged '+market+' '+product+' '+configuration,moqPolicy({market,product,configuration}).moq===n);
ok('No real external calls',W.offNet().length===0,W.offNet());
process.exitCode=done()?1:0;
