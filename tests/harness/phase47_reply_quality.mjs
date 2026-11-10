import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeWorld,reporter} from './harness.mjs';
const {catalogClaimIssue}=await import(pathToFileURL(path.join(process.env.SRC||new URL('../../worker/src',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),'sales-reply-integrity.js')));
const {ok,done}=reporter('phase47_reply_quality');
const catalog=JSON.parse(fs.readFileSync(new URL('./fixtures/phase41-catalog.json',import.meta.url)));
const live=JSON.parse(fs.readFileSync(new URL('./fixtures/phase47-live-replies.json',import.meta.url)));
const approved=JSON.parse(fs.readFileSync(new URL('./fixtures/phase47-approved-knowledge.json',import.meta.url)));
const W=await makeWorld({aiBrain:'on',extraEnv:{PUBLIC_WORKER_BASE_URL:'https://w.test'}});
for(const p of ['/api/quotes','/api/si/knowledge/product','/api/owner-escalations','/api/leads/outreach'])await W.call(p,null,'GET');
await W.call('/api/sales-ai-first',{mode:'on'});
for(const [table,rows]of [['commercial_price_items',catalog.items],['business_settings',catalog.settings]])for(const r of rows){const k=Object.keys(r);W.dbrun(`INSERT INTO ${table}(${k.join(',')}) VALUES(${k.map(()=>'?').join(',')})`,Object.values(r));}
for(const color of ['سبز سلفون','سبز تیفانی سلفون'])await W.teach('COLOR | '+color+' | IRAN','IRAN',color);
for(const r of approved){const e=JSON.parse(r.value_json);const response=await W.call('/api/sales-knowledge/teach',{market:r.market,records:[{...e,operation:'ADD',typed:null,entity:{type:r.entity_key==='global'?'business':'product',key:r.entity_key},concept:r.attribute}]});if(response.status!==200)throw Error('Invalid knowledge fixture '+r.id);for(const p of W.q("SELECT id FROM sales_knowledge_change_requests WHERE status NOT IN ('applied','rejected')"))await W.approveK(p.id);}
const u={id:9470001,name:'Quality',username:'quality9470001'};await W.send(u,'سلام');W.setMarket(u,'iran');
const decision=(raw)=>W.D({...raw,semantics:{mode:'browse',quantity_role:'none',deal_reference:'none',repeat_requested:false},facts:{color_statement:raw.requests.includes('colors_available')?'question':'none'}});
const sent=()=>W.tg.filter(t=>t.method==='sendMessage').map(t=>JSON.parse(t.body)).filter(t=>String(t.chat_id)===String(u.id)).map(t=>t.text);
let generalCtx;
W.AI.script.set('سلام چه مدل جعبه هایی دارید و چه تفاوتی با هم دارند؟',c=>{generalCtx=c;return decision(live[0]);});
const first=await W.send(u,'سلام چه مدل جعبه هایی دارید و چه تفاوتی با هم دارند؟');
const badParts=(reply,catalog)=>reply.split(/[،؛]|(?<![0-9۰-۹٠-٩])[.!؟?]|[.!؟?](?![0-9۰-۹٠-٩])/u).filter(t=>catalogClaimIssue(t,catalog));
ok('Captured comparison keeps model and product clause ownership',catalogClaimIssue(live[0].reply,generalCtx.catalog)===null,badParts(live[0].reply,generalCtx.catalog));
ok('Current approved construction knowledge reaches a general model comparison',generalCtx.knowledge.some(k=>/۲ تکه|2 تکه/.test(k.about))&&generalCtx.knowledge.some(k=>/۳ تکه|3 تکه/.test(k.about))&&generalCtx.knowledge.some(k=>/کشویی/.test(k.about)),generalCtx.knowledge.map(k=>k.about));
ok('Captured comparison is not replaced wholesale with a bare family list',!sent().at(-1).includes('گزینه‌های فهرست فعلی')&&!first.brain.ai_brain.service_repair,{repair:first.brain.ai_brain.repaired,sent:sent().at(-1)});
ok('Approved bag-drawer printing feature survives the final validator',sent().at(-1).includes('چاپ')&&sent().at(-1).includes('بگِ لایهٔ بیرونی'),{repair:first.brain.ai_brain.repaired,sent:sent().at(-1)});
let ringCtx;W.AI.script.set('برای انگشتر جعبه سبز دارید؟چه مدل و سایزهایی موجوده؟',c=>{ringCtx=c;return decision(live[1]);});
const second=await W.send(u,'برای انگشتر جعبه سبز دارید؟چه مدل و سایزهایی موجوده؟');
ok('Captured first green response keeps each ring size with its own models',catalogClaimIssue(live[1].reply,ringCtx.catalog)===null,badParts(live[1].reply,ringCtx.catalog));
ok('First green-ring response delivers Claude current answer without asking retry',second.outcome?.customer_visible==='reply'&&sent().at(-1).includes('سبز سلفون')&&sent().at(-1).includes('5x5')&&sent().at(-1).includes('6x6')&&!/دوباره بپرسید|گزینه‌های فهرست فعلی/.test(sent().at(-1)),{outcome:second.outcome,reply:sent().at(-1),ai:second.brain.ai_brain});
ok('Topic change stays browse and does not store a recommendation as a choice',second.brain.turn_policy.mode==='browse'&&!second.brain.sales_agent.order_candidate_written&&!(second.brain.color_choice?.selected||[]).length&&!W.q('SELECT 1 FROM lead_orders').length);
const key=generalCtx.catalog.find(c=>c.product==='انگشتر کوچک').key;
for(const text of [
 'کشویی بگ‌دار برای (انگشتر کوچک 5x5 مدل 2 تکه) موجود است.',
 'کشویی بگ‌دار (انگشتر کوچک 5x5 مدل 2 تکه) موجود است.',
 'مدل 2 تکه موجود نیست (انگشتر کوچک 5x5: مدل‌های 2 تکه)',
 'کشویی بگ‌دار برای همین محصول موجود است (انگشتر کوچک 5x5: مدل‌های 2 تکه)',
 '12x12 برای (انگشتر کوچک مدل 2 تکه)',
 'کشویی روبان‌دار و کشویی کج (انگشتر کوچک 12x12: مدل 2 تکه)',
 'کشویی روبان‌دار و کشویی کج (انگشتر کوچک 5x5: مدل کشویی بگ‌دار)'
])ok('Unsupported attached/negative/preposed tuple remains rejected: '+text,!!catalogClaimIssue(text,generalCtx.catalog,key));
// Context-dependent mock: it cannot explain model-specific facts unless retrieval really supplied them.
const comparisons=['چه مدل جعبه‌هایی دارید و چه تفاوتی دارند؟','تفاوت مدل دو تکه با سه تکه چیست؟','فرق خانواده کشویی با سه تکه چیه؟'];
for(const [j,question]of comparisons.entries()){let c;W.AI.script.set(question,ctx=>{c=ctx;const feature=ctx.knowledge.find(k=>/۳ تکه|3 تکه/.test(k.about)&&k.value.includes('قسمت بالا، وسط و پایین'));const part=ctx.knowledge.find(k=>/۲ تکه|2 تکه/.test(k.about)&&k.value==='رویه');const drawer=ctx.knowledge.find(k=>/کشویی/.test(k.about)&&k.value==='داخل');const gaps=['درباره جزئیات بازشدن مدل‌های دو تکه، کشویی و مدل‌های کج هنوز اطلاعات کافی ندارم؛ چه ویژگی‌ای برای شما مهم‌تره؟','درباره مدل دو تکه و جزئیات بازشدن آن هنوز اطلاعات کافی ندارم تا مقایسه کامل‌تری بکنم.','برای توضیح کامل تفاوت مکانیزم کشویی با سه تکه هنوز اطلاعات کافی ندارم؛ کدام ویژگی برای شما مهم‌تره؟'];return decision({...live[0],reply:feature&&part&&drawer?`در مدل 3 تکه، ${feature.value} ${gaps[j]}`:'مدل‌ها را در سایت ببینید؛ کدام مدل را می‌پسندید؟'});});const result=await W.send(u,question);
 ok('Natural model comparison is grounded in context, with explicit knowledge gap: '+question,result.outcome?.customer_visible==='reply'&&sent().at(-1).includes('بالا، وسط و پایین')&&sent().at(-1).includes('اطلاعات کافی ندارم')&&!result.brain.needs_owner,{reply:sent().at(-1),fallback:result.brain.ai_brain.fallback});
}
// A fresh explicitly named product remains in scope alongside construction entities.
await W.call('/api/sales-knowledge/teach',{market:'IRAN',records:[{operation:'ADD',kind:'fact',entity:{type:'product',key:'آویز'},concept:'care',value:'روکش را خشک نگه دارید.',keywords:['تفاوت'],conditions:[],effect:null,relation:null}]});for(const p of W.q("SELECT id FROM sales_knowledge_change_requests WHERE status NOT IN ('applied','rejected')"))await W.approveK(p.id);
let mixed;const mixedQuestion='تفاوت مدل دو تکه آویز با سه تکه چیست؟';W.AI.script.set(mixedQuestion,c=>{mixed=c;return decision({...live[0],reply:'چه ویژگی‌ای برای شما مهم‌تره؟'});});await W.send(u,mixedQuestion);
ok('Explicit current family knowledge is retained in a construction comparison',mixed.knowledge.some(k=>k.about==='آویز')&&mixed.knowledge.some(k=>/۳ تکه|3 تکه/.test(k.about)));
const repeatQuestion='رنگ سبز برای انگشتر موجوده؟';W.AI.script.set(repeatQuestion,()=>decision(live[1]));const originalDelivery=await W.send(u,repeatQuestion);const repeated=await W.send(u,repeatQuestion);
ok('True-repeat control first delivered the validated answer',originalDelivery.outcome?.customer_visible==='reply',originalDelivery.outcome);
ok('An actually identical answer remains blocked by repetitive_reply',repeated.outcome?.reason==='repetitive_reply',repeated.outcome);
await W.send(u,'دیگه پیام نده');const sentCount=W.tg.length;await W.send(u,'برای انگشتر سبز دارید؟');
ok('Opt-out prevents later customer delivery and acknowledgements',W.tg.length===sentCount);
const ar={id:9470002,name:'QualityAR',username:'quality9470002'};await W.send(ar,'هلا');W.setMarket(ar,'iraq');let arCtx;
const arQuestion='شنو موديلات العلب وشنو الفرق بينها؟';W.AI.script.set(arQuestion,c=>{arCtx=c;const fact=c.knowledge.find(k=>k.value.includes('للعلبة الجرارة مع كيس'));return decision({...live[0],reply:fact?fact.value+' تفاصيل آلية الموديلات المائلة مو واضحة عندي؛ أي ميزة تهمك؟':'تفاصيل الموديلات مو واضحة عندي؛ أي موديلين تقصد؟'});});const arResult=await W.send(ar,arQuestion);
const arText=W.tg.filter(t=>t.method==='sendMessage').map(t=>JSON.parse(t.body)).filter(t=>String(t.chat_id)===String(ar.id)).at(-1)?.text||'';
ok('Arabic comparison uses its own approved feature and states missing details',arResult.outcome?.customer_visible==='reply'&&arText.includes('الكيس الخارجي')&&arText.includes('مو واضحة')&&!arResult.brain.needs_owner,arText);
ok('Arabic context never borrows Iran-only structural facts',arCtx.market==='ARAB'&&!arCtx.knowledge.some(k=>/مدل ۲|مدل ۳|^۳ تکه/.test(k.about)));
ok('No actual outbound network calls',W.offNet().length===0);
process.exit(done()?1:0);
