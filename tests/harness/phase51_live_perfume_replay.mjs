// Exact normalized Production decisions, replayed locally. No live model or Telegram call.
import fs from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {reporter} from './harness.mjs';
import {evaluationWorld} from './phase51-evaluation-world.mjs';
import {salesAiFirstReply,validateSalesBrainDraft} from '../../worker/src/index.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/phase51-live-perfume-9e3f21bd.json',import.meta.url),'utf8'));
const report=reporter('phase51_live_perfume_replay'),assertions=[],observations=[];
const ok=(label,pass,detail)=>{assertions.push({label,pass:!!pass,...(!pass?{detail}:{})});report.ok(label,pass,detail);};
let {W,client,sent}=await evaluationWorld();
const worlds=[W];
// The incident's selected native printing facts are absent from evaluationWorld's
// smaller generic fixture. Add their captured approved rows only to local SQLite.
function seedNativePrinting(){for(const fact of fixture.approved_printing_methods){
 const t=new Date().toISOString();
 W.dbrun("INSERT INTO sales_knowledge_facts(id,fact_key,domain,entity_type,entity_key,attribute,market,member_key,value_json,value_hash,version,status,authority,source_type,change_request_id,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[fact.id,'incident-'+fact.id,fact.domain,'business',fact.entity_key,fact.attribute,fact.market,'',fact.value_json,createHash('sha256').update(fact.value_json).digest('hex'),fact.version,fact.status,fact.authority,'local_captured_fixture','incident-local-'+fact.id,'captured-owner-approval',t,t,t]);
}}
seedNativePrinting();
let originalFetch=globalThis.fetch;
async function freshWorld(){({W,client,sent}=await evaluationWorld());worlds.push(W);seedNativePrinting();originalFetch=globalThis.fetch;}
const expectHold=process.env.PHASE51_EXPECT_INCIDENT_HOLD==='1';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const prices=()=>hash(W.q('SELECT * FROM commercial_price_items ORDER BY id'));
const owners=id=>W.q("SELECT id,reason_code FROM owner_escalations WHERE source_message_id=? AND status='open'",[id]);
const snapshot=()=>({prices:prices(),orders:W.q('SELECT * FROM lead_orders'),payments:W.q('SELECT * FROM lead_order_payments')});
async function replay(key,{reply=fixture.author.decision.reply,primary=fixture.primary.decision,author=fixture.author.decision,expect=!expectHold}={}){
 const user=await client('IRAN'),start=W.tg.length,before=snapshot(),calls=[];
 globalThis.fetch=async(u,o={})=>{
  const url=String(u?.url||u);
  if(url!=='https://api.anthropic.com/v1/messages')return originalFetch(u,o);
  if(o.headers?.['x-api-key']!=='test-key-not-real')throw Error('Non-test credential rejected');
  const body=JSON.parse(String(o.body)),ctx=JSON.parse(body.messages[0].content.replace(/^CONTEXT:\n/u,''));
  if(ctx.message!==fixture.question||calls.length>=2)throw Error('Unexpected extra provider request');
  const stage=ctx.authoring?'author':'primary';
  if(calls.some(c=>c.stage===stage))throw Error('Duplicate inference stage');
  const capture=structuredClone(stage==='author'?author:primary);
  if(stage==='author')capture.reply=reply;
  calls.push({stage,decision:capture,selected_context:ctx.knowledge,required_parts:ctx.authoring?.required_parts});
  return new Response(JSON.stringify({model:fixture.provider,stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(capture)}]}),{headers:{'Content-Type':'application/json'}});
 };
 let r;try{r=await W.send(user,fixture.question);}finally{globalThis.fetch=originalFetch;}
 const texts=sent(user,start),ownerCases=owners(r.row.id),detail={validation:r.brain?.validation,rejection:r.brain?.ai_brain?.author_rejection,outcome:r.outcome,stages:calls.map(c=>c.stage)};
 ok(key+': final-author stage reached from captured primary',calls.some(c=>c.stage==='author'),detail);
 if(reply===fixture.author.decision.reply){
  ok(key+': final-author normalized decision is the unchanged live capture',isDeepStrictEqual(calls.find(c=>c.stage==='author')?.decision,fixture.author.decision),detail);
 }
 ok(key+': delivery decision matches expectation',expect?texts.length===1&&texts[0]===reply:texts.length===0,detail);
 ok(key+': closed AI authorship matches delivery',salesAiFirstReply(r.brain)===expect,detail);
 ok(key+': durable owner review is held only when necessary',expect?ownerCases.length===0:ownerCases.length===1,detail);
 ok(key+': financial source/order/payment state unchanged',isDeepStrictEqual(before,snapshot()),detail);
 ok(key+': no canned acknowledgement',!r.ack,detail);
 ok(key+': final-author destination does not become customer evidence',!W.q("SELECT 1 FROM conversation_memory_facts WHERE source_message_id=? AND fact_type IN ('destination','customer_name')",[r.row.id]).length,detail);
 if(expect){
  ok(key+': draft and durable outcome prove customer transport',r.draft?.status==='sent'&&r.draft?.message===reply&&r.outcome?.customer_visible==='reply',detail);
  ok(key+': correlated positive delivery receipt exists',Number(r.draft.provider_message_id)>0&&String(r.draft.provider_conversation_id)===String(user.id),r.draft);
 }else if(key==='captured incident'){
  const v=r.brain?.ai_brain?.author_rejection?.validation;
  ok(key+': reproduces exact Production printing rejection',v?.reason===fixture.expected_baseline_rejection.reason&&v?.claim_category==='printing'&&isDeepStrictEqual(v?.unsupported_values,['چاپ'])&&r.outcome?.reason==='ai_reply_unavailable',detail);
 }
 observations.push({key,question:fixture.question,kind:'CAPTURED_NORMALIZED_MODEL_REPLAY_MOCK_TRANSPORT',calls,final_texts:texts,owner_cases:ownerCases,...detail});
 return r;
}
await replay('captured incident');
if(!expectHold){
 const catalog=[{key:'old-selected',product:'نیم ست مربع',models:['کشویی بگ‌دار','کشویی کج','کشویی روبان‌دار']}];
 const bag=fixture.approved_facts.find(f=>f.attribute==='bag_drawer_print_surfaces');
 const facts=[{category:'capability',entity_key:bag.entity_key,market:bag.market,values:[JSON.parse(bag.value_json).value]},...fixture.approved_printing_methods.map(f=>({category:'capability',entity_key:f.entity_key,market:f.market,values:[JSON.parse(f.value_json)]})),{category:'size',entity_key:'نیم ست مربع',market:'IRAN',values:['8x8']}];
 const scope={authoritativeFacts:facts,catalog,markets:['IRAN','GLOBAL'],selectedProductKey:'old-selected'};
 const withParent=validateSalesBrainDraft(fixture.author.decision.reply,{...scope,authoritativeFacts:[...facts,{category:'capability',entity_key:'مدل کشویی',market:'IRAN',values:['داخل']}]});
 ok('Generic model prefix is not a second model beside the named bag-drawer',withParent.valid,withParent);
 const availabilityScope={...scope,authoritativeFacts:[...facts,{category:'availability',entity_key:'نیم ست مربع',market:'IRAN',values:catalog[0].models}]};
 for(const [text,expect]of [['کشویی بگ‌دار موجود است.',true],['مدل ناشناخته در انبار موجود است.',false]]){const checked=validateSalesBrainDraft(text,availabilityScope);ok('Availability retains exact known-product authority: '+text,checked.valid===expect,checked);}
 const cases=[
  ['exact live text',fixture.author.decision.reply,true],
  ['model heading followed by approved printing','کشویی بگ‌دار.\nروی بگ بیرونی طرح چاپ می‌شود.',true],
  ['approved claim followed by a separate question','کشویی بگ‌دار چاپ روی درب دارد، چه طرحی می‌خواید؟',true],
  ['a question cannot hide an unsupported preceding feature','کشویی بگ‌دار چاپ لیزری دارد، چه طرحی می‌خواید؟',false],
  ['a gap cannot swallow a comma-separated risky feature','اطلاعاتی درباره کشویی کج ندارم، فوم محافظ.',false],
  ['desired printing cannot authorize custom sizes','کشویی بگ‌دار اندازه دلخواه دارد.',false],
  ['new model question ends inherited scope','کشویی بگ‌دار را پیشنهاد می‌کنم. کشویی کج چطور؟ روی بگ بیرونی طرح چاپ می‌شود.',false],
  ['new model knowledge gap ends inherited scope','کشویی بگ‌دار را پیشنهاد می‌کنم. درباره کشویی کج اطلاعات کافی ندارم. روی بگ بیرونی طرح چاپ می‌شود.',false],
  ['unknown new model ends inherited scope','کشویی بگ‌دار را پیشنهاد می‌کنم. مدل ناشناخته را بررسی کنیم. روی بگ بیرونی طرح چاپ می‌شود.',false],
  ['multiple models need evidence for each','کشویی بگ‌دار و کشویی کج. روی بگ بیرونی طرح چاپ می‌شود.',false],
  ['unresolved plural cannot borrow older selection','کشویی بگ‌دار. این دو مدل را بررسی کنیم. روی بگ بیرونی طرح چاپ می‌شود.',false],
  ['disclaimer cannot license a mechanism',fixture.author.decision.reply+' اطلاعات دقیق ندارم ولی با آهنربا بسته می‌شود.',false],
  ['invented printing method remains unsupported',fixture.author.decision.reply.replace('رو چاپ کرد','رو چاپ لیزری کرد'),false]
 ];
 for(const [key,text,expect]of cases){const result=validateSalesBrainDraft(text,scope);ok('Scoped validator: '+key,result.valid===expect,result);}
 for(const [key,changed]of [
  ['missing printing evidence',facts.filter(f=>f!==facts[0])],
  ['other model printing evidence',[{...facts[0],entity_key:'کشویی کج'},...facts.slice(1)]],
  ['other market printing evidence',[{...facts[0],market:'ARAB'},...facts.slice(1)]],
  ['negative printing evidence',[{...facts[0],values:['کشویی بگ‌دار چاپ ندارد.']},...facts.slice(1)]]
 ]){const result=validateSalesBrainDraft(fixture.author.decision.reply,{...scope,authoritativeFacts:changed});ok('Scoped validator rejects '+key,!result.valid,result);}
 for(const [key,reply]of [
  ['unsupported perfume dimensions',fixture.author.decision.reply+' این مدل برای شیشه عطر با ابعاد 999x999x999 مناسب است.'],
  ['unsupported custom size',fixture.author.decision.reply+' کشویی بگ‌دار اندازه دلخواه دارد.'],
  ['unsupported mechanism after uncertainty',fixture.author.decision.reply+' اطلاعات دقیق ندارم ولی با آهنربا بسته می‌شود.'],
  ['invented price',fixture.author.decision.reply+' قیمت این جعبه 123456789 تومان است.'],
  ['unauthorized discount',fixture.author.decision.reply+' تخفیف ویژه 37 درصد می‌دهیم.'],
  ['unapproved availability',fixture.author.decision.reply+' مدل ناشناخته در انبار موجود است.'],
  ['deposit requirement cannot be waived',fixture.author.decision.reply+' برای شروع کار بیعانه لازم نیست.'],
  ['payment authority',fixture.author.decision.reply+' پرداخت شما تأیید شده است.'],
  ['invented printing method',fixture.author.decision.reply.replace('رو چاپ کرد','رو چاپ لیزری کرد')]
 ])await replay(key,{reply,expect:false});
 await freshWorld();
 for(const row of W.q("SELECT id FROM sales_knowledge_facts WHERE attribute='bag_drawer_print_surfaces' AND market='IRAN' AND status='active'"))W.dbrun("UPDATE sales_knowledge_facts SET status='superseded' WHERE id=?",[row.id]);
 await replay('missing approved model printing fact',{expect:false});
 // Fresh independent fixtures avoid changing an immutable knowledge revision back
 // to active or editing its entity. The Production immutability trigger stays intact.
 await freshWorld();
 const otherSources=W.q("SELECT * FROM sales_knowledge_facts WHERE attribute='bag_drawer_print_surfaces' AND market='IRAN' AND status='active'");
 for(const row of otherSources){
  W.dbrun("UPDATE sales_knowledge_facts SET status='superseded' WHERE id=?",[row.id]);
  const value=JSON.parse(row.value_json);value.value=value.value.replaceAll('کشویی بگ‌دار','کشویی کج');
  const json=JSON.stringify(value),copy={...row,id:'other-model-'+row.id,fact_key:'other-model-'+row.fact_key,change_request_id:'other-model-'+row.change_request_id,entity_key:'کشویی کج',value_json:json,value_hash:createHash('sha256').update(json).digest('hex')},keys=Object.keys(copy);
  W.dbrun(`INSERT INTO sales_knowledge_facts(${keys.join(',')}) VALUES(${keys.map(()=>'?')})`,Object.values(copy));
 }
 await replay('printing fact belongs to another model',{expect:false});
}
ok('Original positive-world approved bag-drawer printing fact has unchanged value',worlds[0].q("SELECT value_json FROM sales_knowledge_facts WHERE attribute='bag_drawer_print_surfaces' AND market='IRAN' AND status='active'").some(x=>JSON.parse(x.value_json).value===JSON.parse(fixture.approved_facts.find(f=>f.attribute==='bag_drawer_print_surfaces').value_json).value));
ok('No real network transport',worlds.every(w=>w.offNet().length===0),worlds.flatMap(w=>w.offNet()));
const result={suite:'phase51_live_perfume_replay',baseline_commit:fixture.commit,fixture_source:fixture.kind,expected_hold:expectHold,live_model_calls:0,real_telegram_messages:0,assertions,observations};
if(process.env.PHASE51_INCIDENT_EVIDENCE)fs.writeFileSync(process.env.PHASE51_INCIDENT_EVIDENCE,JSON.stringify(result,null,2)+'\n');
process.exitCode=report.done()?1:0;
