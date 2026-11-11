// Offline engineering tests: captured provider replies + adversarial scripted providers.
// Telegram is recorded in memory. These results never certify current live AI quality.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeWorld, reporter} from './harness.mjs';
const source = process.env.SRC || path.resolve('worker/src');
const {validateSalesBrainDraft, salesAiFirstReply} = await import(pathToFileURL(path.join(source, 'index.js')));
const {informationalEntities, protectedReplyProse} = await import(pathToFileURL(path.join(source, 'sales-conversation-author.js')));
const {resetSalesAiCooldown, salesAiProseIssues} = await import(pathToFileURL(path.join(source, 'sales-ai-brain.js')));
const {unverifiedServiceDetail} = await import(pathToFileURL(path.join(source, 'approved-sales-guidance.js')));
const {replyKey} = await import(pathToFileURL(path.join(source, 'sales-reply-integrity.js')));
const read = file => JSON.parse(fs.readFileSync(new URL(file, import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
const {ok, done} = reporter('phase51_conversation');
const catalog = read('./fixtures/phase41-catalog.json');
const captured = read('./fixtures/phase47-live-replies.json');
const approved = read('./fixtures/phase47-approved-knowledge.json');
const W = await makeWorld({aiBrain:'on', extraEnv:{PUBLIC_WORKER_BASE_URL:'https://w.test'}});
for (const endpoint of ['/api/quotes','/api/si/knowledge/product','/api/owner-escalations','/api/leads/outreach']) await W.call(endpoint, null, 'GET');
await W.call('/api/sales-ai-first', {mode:'on'});
for (const [table, rows] of [['commercial_price_items',[...catalog.items,...read('./fixtures/phase44-approved-iraq-rows.json')]], ['business_settings',catalog.settings]]) for (const row of rows) {
  const keys=Object.keys(row);W.dbrun(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?')})`,Object.values(row));
}
for (const color of ['سبز سلفون','سبز تیفانی سلفون']) await W.teach('COLOR | '+color+' | IRAN','IRAN',color);
for (const row of approved) {
  const value=JSON.parse(row.value_json);
  await W.call('/api/sales-knowledge/teach',{market:row.market,records:[{...value,operation:'ADD',typed:null,entity:{type:row.entity_key==='global'?'business':'product',key:row.entity_key},concept:row.attribute}]});
  for (const pending of W.q("SELECT id FROM sales_knowledge_change_requests WHERE status NOT IN ('applied','rejected')")) await W.approveK(pending.id);
}
let uid=9511000;
const client=async(market='IRAN')=>{const user={id:++uid,name:'Local51',username:'local51'+uid};await W.send(user,market==='IRAN'?'سلام':'هلا');W.setMarket(user,market==='IRAN'?'iran':'iraq');return user;};
const decision=(raw={})=>W.D({requests:['product_info'],interpretation:captured[0].interpretation,semantics:{mode:'browse',quantity_role:'none',deal_reference:'none',repeat_requested:false},...raw,facts:{color_statement:'none',negated_colors:[],...raw.facts}});
const sent=(user,start=0)=>W.tg.slice(start).filter(t=>t.method==='sendMessage').map(t=>JSON.parse(t.body)).filter(t=>String(t.chat_id)===String(user.id)).map(t=>t.text);
const evidence=[];

// The two already versioned real Telegram failures: replays use their captured actual
// model output, assert exact delivered content, and do not treat HTTP status as success.
for (const [index,question] of ['سلام چه مدل جعبه هایی دارید و چه تفاوتی با هم دارند؟','برای انگشتر جعبه سبز دارید؟چه مدل و سایزهایی موجوده؟'].entries()) {
  const user=await client();let context;W.AI.script.set(question,c=>{context=c;return decision(captured[index]);});
  const start=W.tg.length,calls=W.AI.requests.length,result=await W.send(user,question),texts=sent(user,start);
  const exact=texts.length===1&&texts[0]===captured[index].reply;
  ok('Captured Telegram failure '+(index+1)+' preserves actual AI wording exactly',exact,{outcome:result.outcome,texts,authorship:result.brain?.ai_brain?.authorship,rejection:result.brain?.ai_brain?.author_rejection,validation:result.brain?.validation});
  ok('Captured replay '+(index+1)+' has verified AI provenance and one primary call',salesAiFirstReply(result.brain)&&W.AI.requests.length-calls===1,{authorship:result.brain?.ai_brain?.authorship,rejection:result.brain?.ai_brain?.author_rejection});
  ok('Captured replay '+(index+1)+' has no order, price or quantity side effect',!result.brain?.sales_agent?.order_candidate_written&&!result.brain?.customer_known_facts?.requested_quantity);
  evidence.push({kind:'captured_provider_output_replay',question,expected:captured[index].reply,delivered:texts,exact,knowledge:context?.knowledge,outcome:result.outcome});
}

for (const sourceName of ['ai_service_policy','ai_policy_fallback','ai_custom','approved_optional_service','legacy']) ok('Fixed/unknown source is never AI-authored: '+sourceName,!salesAiFirstReply({ai_first:'on',validation:{valid:true},ai_brain:{reply_source:sourceName,authorship:{verified:true}}}));
ok('Even the ai label needs verified provenance',!salesAiFirstReply({ai_first:'on',validation:{valid:true},ai_brain:{reply_source:'ai'}}));
ok('Protected facts cannot disappear or duplicate',protectedReplyProse('سلام. approved approved',['approved'])===null&&protectedReplyProse('سلام.',['approved'])===null);

const records=[
  {entity_key:'انگشتر کوچک',concept:'care',envelope:{value:'روکش را خشک نگه دارید.'}},
  {entity_key:'انگشتر بزرگ',concept:'care',envelope:{value:'روکش را خشک نگه دارید.'}},
  {entity_key:'انگشتر کوچک',concept:'alias',envelope:{value:'رینگ ریز'}},
  {entity_key:'علبة خاتم صغيرة',concept:'alias',envelope:{value:'علبة محبس ناعمة'}}
];
ok('Generic Persian product family retrieves both informational candidates',informationalEntities(records,'برای انگشتر چه ویژگی‌هایی دارید؟',[{product:'انگشتر کوچک'},{product:'انگشتر بزرگ'}]).length===2);
ok('Owner-taught Persian alias retrieves its knowledge entity',informationalEntities(records,'رینگ ریز را توضیح میدی؟').includes('انگشتر کوچک'));
ok('Iraqi Arabic alias handles article and Arabic letter forms',informationalEntities(records,'شنو مواصفات علبة المحبس الناعمة؟').includes('علبة خاتم صغيرة'));
ok('An unrelated question never borrows the previous product',informationalEntities(records,'برای گردنبند چه دارید؟').length===0);
for(const [market,entity,alias,care,question] of [
  ['IRAN','انگشتر کوچک','رینگ ریز','روکش را خشک نگه دارید.','روش نگهداری رینگ ریز چیه؟'],
  ['ARAB','علبة خاتم صغيرة','علبة محبس ناعمة','خلي العلبة بمكان جاف.','شلون أحافظ على علبة المحبس الناعمة؟']
]){
  for(const [concept,value] of [['alias',alias],['care',care]]){
    const result=await W.call('/api/sales-knowledge/teach',{market,records:[{operation:'ADD',kind:'fact',entity:{type:'product',key:entity},concept,value,keywords:[],conditions:[],effect:null,relation:null}]});
    if(!result.body.ok)throw Error('Knowledge fixture rejected');
    for(const row of W.q("SELECT id FROM sales_knowledge_change_requests WHERE status NOT IN ('applied','rejected')"))await W.approveK(row.id);
  }
  const hasCare=c=>c.knowledge.some(k=>replyKey(k.about)===replyKey(entity)&&k.value===care);
  let context;const user=await client(market);W.AI.script.set(question,c=>{context=c;return decision({reply:hasCare(c)?care:'جزئیات تأییدشده در دسترسم نیست.',owner_escalation_needed:!hasCare(c),escalation_reason:'missing_knowledge'});});
  const start=W.tg.length,r=await W.send(user,question);
  ok('Real retrieval pipeline supplies the taught alias and product fact '+market,hasCare(context)&&sent(user,start)[0]===care&&salesAiFirstReply(r.brain),{knowledge:context.knowledge,authorship:r.brain?.ai_brain?.authorship,outcome:r.outcome});
  ok('Informational alias retrieval never selects an order '+market,!r.brain.sales_agent.order_candidate_written);
  W.AI.script.set(question,c=>{const source=c.knowledge.find(k=>replyKey(k.about)===replyKey(entity)&&k.value===care);const selected=r.brain.ai_brain.knowledge_context.selected.find(k=>W.q('SELECT attribute FROM sales_knowledge_facts WHERE id=?',[k.id])[0]?.attribute==='care');if(source&&selected)W.dbrun("UPDATE sales_knowledge_facts SET status='superseded' WHERE id=?",[selected.id]);return decision({reply:care});});
  const freshnessStart=W.tg.length,stale=await W.send(user,question);
  ok('Send-time knowledge revocation opens owner review '+market,sent(user,freshnessStart).length===0&&!!W.q("SELECT id FROM owner_escalations WHERE source_message_id=? AND status='open'",[stale.row.id])[0],stale.outcome);
}

const relationalCatalog=[{key:'small',product:'انگشتر کوچک',variants:[{size:'5x5',configuration:'2 تکه'}],models:['2 تکه'],sizes:['5x5']}];
const facts=[{category:'availability',values:['انگشتر کوچک','2 تکه'],market:'IRAN'},{category:'size',values:['5x5'],market:'IRAN'}];
for (const text of ['انگشتر کوچک سایز 5x5 مدل 2 تکه موجوده.','بله، مدل 2 تکه برای انگشتر کوچک با سایز 5x5 موجود است.','انگشتر کوچک مدل دو تکه با ابعاد ۵ در ۵ موجوده.']) ok('Natural accurate catalog wording passes: '+text,validateSalesBrainDraft(text,{catalog:relationalCatalog,authoritativeFacts:facts,markets:['IRAN']}).valid,validateSalesBrainDraft(text,{catalog:relationalCatalog,authoritativeFacts:facts,markets:['IRAN']}));
const decimalCatalog=[{key:'pendant',product:'آویز',variants:[{size:'5x7.5',configuration:'2 تکه'}]}];
ok('Grounded decimal dimensions in natural Persian remain intact',validateSalesBrainDraft('آویز با سایز ۵ در ۷٫۵ موجوده.',{catalog:decimalCatalog,authoritativeFacts:[{category:'availability',values:['آویز']},{category:'size',values:['5x7.5']}]}).valid);
for(const [text,valid] of [['علبة خاتم صغيرة قياس ٥ في ٥ متوفرة.',true],['علبة خاتم صغيرة قياس ٥ في ٧ متوفرة.',false]])ok('Iraqi Arabic dimension phrase retains exact factual validation: '+text,validateSalesBrainDraft(text,{catalog:[{product:'علبة خاتم صغيرة',variants:[{size:'5x5',configuration:'قطعتين'}]}],authoritativeFacts:[{category:'availability',values:['علبة خاتم صغيرة']},{category:'size',values:['5x5']}]}).valid===valid);
ok('A destination question is not a shipping promise',!unverifiedServiceDetail('برای ارسال، کدوم شهر مدنظرتونه؟',{text:'ارسال شهرستان با باربری انجام می‌شود.'}));
ok('Logo upload instruction is not a delivery promise',!unverifiedServiceDetail('فایل لوگو رو همین‌جا ارسال کنید.',{text:'چاپ تک‌رنگ استاندارد درب داخل قیمت پایه است.'}));
ok('Invented shipping deadline still fails',unverifiedServiceDetail('ارسال فردا تضمین می‌شود.',{text:'ارسال شهرستان با باربری انجام می‌شود.'}));
ok('Approved information wording is not mistaken for order registration',!salesAiProseIssues('مدل 2 تکه: بخش مستقل ثبت‌شده در اطلاعات تأییدشده، رویه است.',{allowedNumbers:[2]}).includes('order_commitment'));
for(const reply of ['سفارش 2 تکه شما ثبت شد.','سفارش شما در فهرست تأیید شده ثبت شد.','واریز شما ثبت شده در اطلاعات ماست.'])ok('Actual order/payment confirmation remains prohibited: '+reply,salesAiProseIssues(reply,{allowedNumbers:[2]}).some(issue=>['order_commitment','payment_claim'].includes(issue)));
const namedCatalog=[{product:'علبة طقم مجوهرات 20×20',variants:[{size:'20x20x20',configuration:'ثلاث قطع'}]}];
ok('Dimensions inside an exact approved label do not reject its true variant',validateSalesBrainDraft('علبة طقم مجوهرات 20×20، المقاس 20x20x20 متوفر.',{catalog:namedCatalog,authoritativeFacts:[{category:'size',values:['20x20x20']},{category:'availability',values:['علبة طقم مجوهرات 20×20']}]}).valid);
ok('A different asserted dimension still fails for the same label',!validateSalesBrainDraft('علبة طقم مجوهرات 20×20 مقاس 99x99 متوفر.',{catalog:namedCatalog,authoritativeFacts:[{category:'size',values:['20x20x20']}]}).valid);
for (const text of ['انگشتر کوچک 6x6 مدل 2 تکه موجوده.','انگشتر کوچک 5x5 مدل 3 تکه موجوده.','انگشتر کوچک ۵ در ۵ مدل سه تکه موجوده.','جعبه چوبی موجود است.','قیمت 999 تومان است.']) ok('Unsupported size/model/material/price stays blocked: '+text,!validateSalesBrainDraft(text,{catalog:relationalCatalog,authoritativeFacts:facts,markets:['IRAN']}).valid);

// Optional service facts keep their approved scope/rates. The whole customer reply
// must come from the provider; engine-only disclosures cannot win final authorship.
for (const request of read('../../reports/phase50d/PHASE50D-IMPORT-PACKAGE.json').batches.flatMap(batch=>batch.requests).filter(request=>request.payload.domain==='optional_service')) {
  const proposed=await W.call('/api/sales-knowledge/propose',request.payload);if(!proposed.body.ok)throw Error('Optional fee fixture rejected');await W.approveK(request.payload.id);
}
for (const market of ['IRAN','ARAB']) {
  const price=W.q('SELECT * FROM commercial_price_items WHERE id=?',[market==='IRAN'?'c9308cdd-fae4-4ca2-a94f-68e22462bdbd':'06b13df3-84b1-4ad3-b68f-48898f2b74cc'])[0];
  const name=price.product_name.split(' · ').join(' '),user=await client(market);
  const question=market==='IRAN'?`برای 1000 جعبه ${name} چاپ سفارشی روی روبان می خواهم`:`أريد طباعة على الشريط لـ 1000 علبة ${name}`;
  const opening=market==='IRAN'?'چاپ سفارشی روی روبان کشویی بگ‌دار انجام می‌شه.':'الطباعة المخصصة على الشريط تخص الجرّارة مع كيس.';
  let authored;W.AI.script.set(question,c=>{if(c.authoring){authored=opening+'\n'+c.authoring.required_parts.join('\n');return decision({reply:authored});}return decision({reply:market==='IRAN'?'سلام، چاپ موردنظرتون روی روبانه.':'هلا بيك، تقصد الطباعة على الشريط.'});});
  const start=W.tg.length,result=await W.send(user,question),texts=sent(user,start);
  ok('O11 keeps complete provider-authored reply '+market,texts.length===1&&texts[0]===authored&&texts[0].startsWith(opening)&&salesAiFirstReply(result.brain),{texts,authored,ai:result.brain?.ai_brain,outcome:result.outcome});
  ok('O11 retains scoped disclosure, exact rate and owner payment limit '+market,(texts[0]||'').includes(market==='IRAN'?'6000 تومان':'0.30 USD')&&(texts[0]||'').includes(market==='IRAN'?'مجوز پرداخت نیست':'ليس إذناً بالدفع'));
  W.AI.script.set(question,c=>decision({reply:c.authoring?opening+'\n'+c.authoring.required_parts.join('\n').replace(market==='IRAN'?'6000 تومان':'0.30 USD',market==='IRAN'?'5000 تومان':'0.20 USD'):'سلام، توضیح خدمت موردنظرتون رو می‌گم.'}));
  const rejectedStart=W.tg.length,rejected=await W.send(user,question);
  ok('Final author cannot alter the approved O11 rate '+market,sent(user,rejectedStart).length===0&&!salesAiFirstReply(rejected.brain)&&rejected.brain.needs_owner===true,{authorship:rejected.brain.ai_brain.authorship,outcome:rejected.outcome});
}

for (const [market,question,reply] of [
  ['IRAN','سلام، برای انتخاب مدل راهنمایی می‌کنی؟','سلام! چه ویژگی‌ای براتون مهم‌تره تا از مدل‌های تأییدشده راهنمایی‌تون کنم؟'],
  ['ARAB','هلا، شنو تنصحني حتى أختار الموديل؟','هلا بيك! شنو الميزة اللي تهمك أكثر بالعلبة حتى أگدر أساعدك بالاختيار؟']
]) {
  const user=await client(market);W.AI.script.set(question,()=>decision({reply}));const start=W.tg.length,r=await W.send(user,question);
  ok('Natural conversation remains exact '+market,sent(user,start)[0]===reply&&salesAiFirstReply(r.brain),{sent:sent(user,start),brain:r.brain?.ai_brain});
}

for (const failure of ['http500','badjson','max_tokens','timeout']) {
  resetSalesAiCooldown();const user=await client(),question='برای این محصول توضیح دقیق لازم دارم '+failure;
  W.env.SALES_AI_TIMEOUT_MS='1000';W.AI.status=failure==='timeout'?null:failure;W.AI.delay=failure==='timeout'?1500:0;
  const calls=W.AI.requests.length,start=W.tg.length,r=await W.send(user,question);W.AI.status=null;W.AI.delay=0;
  const ownerCase=W.q("SELECT id FROM owner_escalations WHERE source_message_id=? AND status='open'",[r.row.id])[0];
  ok('Failed provider opens controlled owner case without canned customer message: '+failure,sent(user,start).length===0&&r.brain?.needs_owner===true&&!!ownerCase,{outcome:r.outcome,authorship:r.brain?.ai_brain?.authorship,ownerCase});
  ok('Provider failure makes one bounded call, no paid retry: '+failure,W.AI.requests.length-calls===1);
}
for(const timeout of [false,true]){
  const user=await client(),question='اندازه‌های دقیق این محصول رو می‌پرسم '+timeout;
  W.AI.script.set(question,c=>{if(timeout&&!c.authoring)W.AI.delay=1500;return decision({reply:'سلام!'});});
  W.env.SALES_AI_TIMEOUT_MS='1000';const calls=W.AI.requests.length,start=W.tg.length,r=await W.send(user,question);W.AI.delay=0;
  ok('HTTP success with only a greeting / final-author timeout cannot count as an answer '+timeout,sent(user,start).length===0&&!salesAiFirstReply(r.brain)&&r.brain.needs_owner===true&&!!W.q("SELECT id FROM owner_escalations WHERE source_message_id=? AND status='open'",[r.row.id])[0],{outcome:r.outcome,authorship:r.brain.ai_brain.authorship});
  ok('Final author pass is bounded without another retry '+timeout,W.AI.requests.length-calls===2);
}
const user=await client(),question='برای انتخاب مدل یک سؤال دارم';W.AI.script.set(question,()=>decision({reply:'چه ویژگی‌ای از جعبه براتون مهم‌تره؟'}));W.TG.mode='throw';let start=W.tg.length;const ambiguous=await W.send(user,question);W.TG.mode='ok';
ok('Ambiguous Telegram send is not declared delivered',ambiguous.outcome?.customer_visible==='none'&&W.q("SELECT status FROM lead_outreach WHERE inbox_message_id=?",[ambiguous.row.id])[0]?.status==='send_ambiguous',ambiguous.outcome);
const count=W.tg.length,calls=W.AI.requests.length;
await W.post({update_id:99999999,message:{message_id:Number(String(ambiguous.row.external_id).split(':').at(-1)),date:Math.floor(Date.now()/1000),from:{id:user.id,is_bot:false,first_name:user.name,username:user.username},chat:{id:user.id,type:'private'},text:question}});
ok('Duplicate webhook never retries an ambiguous delivery',W.tg.length===count&&W.AI.requests.length===calls);
await W.send(user,'دیگه پیام نده');start=W.tg.length;await W.send(user,question);ok('Opt-out keeps all fallback and authoring deliveries silent',W.tg.length===start);
ok('No outbound network escapes the in-memory AI/Telegram mocks',W.offNet().length===0);
ok('No order/payment was created by informational tests',!W.q('SELECT 1 FROM lead_orders').length&&!W.q('SELECT 1 FROM lead_order_payments').length);
if(process.env.PHASE51_EVIDENCE)fs.writeFileSync(process.env.PHASE51_EVIDENCE,JSON.stringify({mode:'OFFLINE_CAPTURED_REPLAY_AND_SCRIPTED_FAULTS',live_model_verified:false,evidence},null,2));
process.exitCode=done()?1:0;
