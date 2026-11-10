// Owner-authorized isolated regressions. Real Worker and D1 schema; model and Telegram are in-process mocks.
// The mock answers ONLY from the captured context, so a missing fact cannot pass with a scripted correct reply.
import {makeWorld,reporter} from './harness.mjs';
import {pathToFileURL} from 'node:url';
const {buildSalesAiInput,SALES_AI_BUDGET}=await import(process.env.AI_GATEWAY?pathToFileURL(process.env.AI_GATEWAY).href:'../../worker/src/sales-ai-brain.js');
const {ok,done}=reporter('phase43_knowledge_recovery');
const complete=JSON.stringify({when:[{field:'material',op:'=',value:'velvet'}],then:{care:'Keep dry. '.repeat(32)+'Never use solvent.'}});
const bounded=JSON.parse(buildSalesAiInput({message:'How should velvet be cleaned?',knowledge:[{topic:'care',about:'drawer',value:complete}]}).slice(9));
ok('K1 structured knowledge is complete, including its final restriction',bounded.knowledge[0]?.value===complete,bounded.knowledge[0]);
const large=buildSalesAiInput({message:'care?',catalog:Array.from({length:30},(_,i)=>({product:'Product '+i,sizes:['5x5']})),knowledge:Array.from({length:24},(_,i)=>({topic:'care',about:'box',value:('approved fact '+i+' ').repeat(60)})),recent:Array.from({length:12},()=>({from:'customer',text:'history '.repeat(70)}))});
ok('K2 complete facts still respect the existing total input budget',large.length<=SALES_AI_BUDGET.total_chars,large.length);
const oversized=JSON.parse(buildSalesAiInput({message:'care?',knowledge:[{topic:'long',about:'box',value:'restriction '.repeat(2000)},{topic:'care',about:'box',value:'Keep dry.'}]}).slice(9));
ok('K14 an oversized record is omitted whole without losing another complete fact',oversized.knowledge.length===1&&oversized.knowledge[0].value==='Keep dry.',oversized.knowledge.map(k=>({topic:k.topic,chars:k.value.length})));
const W=await makeWorld({aiBrain:'on',extraEnv:{PUBLIC_WORKER_BASE_URL:'https://w.test'}});
await W.call('/api/quotes',null,'GET');await W.call('/api/si/knowledge/product',null,'GET');
await W.call('/api/sales-ai-first',{mode:'on'},'POST');
const record=(key,concept,value,keywords=[])=>({operation:'ADD',kind:'fact',typed:null,entity:{type:key==='global'?'business':'product',key},concept,value,keywords,labels:{},conditions:[],effect:null,relation:null});
const teach=async(market,records)=>{const r=await W.call('/api/sales-knowledge/teach',{market,records});if(r.status!==200)throw Error('teach failed '+JSON.stringify(r));for(const x of W.q("SELECT id FROM sales_knowledge_change_requests WHERE status NOT IN ('applied','rejected')"))await W.approveK(x.id);};
const left='روکش سه تکه کاغذی است.',right='روکش کشویی مخملی است.',care='برای نگهداری، سطح جعبه با دستمال خشک تمیز شود.';
await teach('IRAN',[record('سه تکه','material',left,['روکش','جنس','تفاوت']),record('کشویی','material',right,['روکش','جنس','تفاوت']),record('global','care_instructions',care,['نگهداری'])]);
// Force the requested approved fact behind 24 unrelated, newer approved records.
await teach('IRAN',Array.from({length:25},(_,i)=>record('global','note_'+i,'اطلاعات عمومی تأییدشده '+String.fromCharCode(97+i),['یادداشت'])));
ok('K0 requested fact is older than the first 24 unrelated active facts',!W.q("SELECT attribute FROM sales_knowledge_facts WHERE status='active' AND market='IRAN' ORDER BY created_at DESC LIMIT 24").some(r=>r.attribute==='care_instructions'));
const iraqOnly='العراق فقط: الغلاف قطني.';await teach('ARAB',[record('global','material',iraqOnly,['روکش','جنس','تفاوت','نگهداری'])]);
let seq=821000000;
const user=async(market='iran')=>{const u={id:++seq,name:'KnowledgeTest',username:'knowledge'+seq};await W.send(u,'سلام');W.setMarket(u,market);return u;};
const sent=u=>W.tg.filter(t=>t.method==='sendMessage'&&String(t.body).includes(String(u.id))).map(t=>JSON.parse(t.body).text);
const interp={primary_intent:'product_info',product_key:null,reference:'none',requested_size:null,requested_color:[],requested_structure:null,requested_printing:null,quantity:null,ambiguity:'none',confidence:'high'};
const ask=async(u,message,required,reply)=>{let captured=null;const before=sent(u).length;W.AI.script.set(message,c=>{captured=c;const has=required.every(value=>c.knowledge.some(k=>k.value===value));return {requests:['product_info'],interpretation:interp,semantics:{mode:'browse',quantity_role:'none',deal_reference:'none',repeat_requested:false},owner_escalation_needed:!has,escalation_reason:has?null:'missing_knowledge',missing_information:has?[]:['approved facts'],reply:has?reply:'اطلاعات کافی درباره این مورد ندارم؛ کدام ویژگی مدنظرتان است؟'};});const r=await W.send(u,message);return {r,ctx:captured,sent:sent(u).slice(before)};};
{
 const u=await user();const reply='سه تکه روکش کاغذی دارد و کشویی روکش مخملی دارد.';
 const a=await ask(u,'تفاوت روکش سه تکه با کشویی چیست؟',[left,right],reply);
 ok('K3 both explicitly compared products reach Claude with separate labels',a.ctx?.knowledge.some(k=>k.about==='سه تکه'&&k.value===left)&&a.ctx?.knowledge.some(k=>k.about==='کشویی'&&k.value===right),a.ctx?.knowledge);
 ok('K4 context-grounded comparison reaches final Telegram without owner referral',a.sent.length===1&&a.sent[0]===reply&&!a.r.brain?.needs_owner,[a.r.action,a.r.brain?.needs_owner,a.r.outcome,a.sent]);
 ok('K5 informational comparison never selects or prices an arbitrary product',!a.r.brain?.sales_agent?.product_match?.product_key&&a.r.brain?.sales_agent?.price_snapshot==null&&a.r.brain?.sales_agent?.order_candidate==null&&!a.r.brain?.sales_agent?.order_candidate_written&&!W.q('SELECT id FROM lead_orders').length,a.r.brain?.sales_agent);
 ok('K6 no other-market fact enters this customer context',!JSON.stringify(a.ctx?.knowledge).includes(iraqOnly));
}
{
 const u=await user();const a=await ask(u,'روش نگهداری جعبه چیست؟',[care],care);
 ok('K7 relevant older fact survives the first-24 budget',a.ctx?.knowledge.some(k=>k.value===care),a.ctx?.knowledge.map(k=>k.topic));
 ok('K8 recovered fact reaches Telegram rather than an unnecessary owner hold',a.sent.length===1&&a.sent[0]===care&&!a.r.brain?.needs_owner,[a.r.action,a.r.brain?.needs_owner,a.r.outcome,a.sent]);
}
{
 const u=await user();const a=await ask(u,'روکش ضدحریق دارید؟',['not an approved fact'],'must never send');
 ok('K9 genuinely absent capability gets truthful clarification without nonpayment owner work',a.r.brain?.needs_owner===false&&!a.sent.includes('must never send')&&a.sent.length===1&&!/بررسی می|خبرتون|مالک|مدیر/u.test(a.sent[0]),[a.r.action,a.r.brain?.needs_owner,a.sent]);
}
{
 const u=await user();const msg='پرداخت کردم، دریافت وجه را تأیید کنید.';W.AI.script.set(msg,()=>({requests:['payment'],interpretation:{...interp,primary_intent:'payment'},reply:'پیامتان را برای بررسی دریافت وجه به مسئول مربوط می‌رسانم.'}));const a=await W.send(u,msg);
 ok('K10 payment confirmation still requires the owner',a.brain?.needs_owner===true&&a.action==='payment_claim_unmatched',[a.action,a.brain?.needs_owner]);
 ok('K11 no payment was recorded by a conversation',W.q('SELECT id FROM lead_order_payments').length===0);
}
ok('K12 AI-FIRST stays on',(await W.call('/api/sales-ai-first',null,'GET')).body?.setting?.mode==='on');
ok('K13 all model and delivery requests stayed inside local mocks',W.offNet().length===0,W.offNet());
process.exit(done()?1:0);
