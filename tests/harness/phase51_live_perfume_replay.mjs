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
// v3 (FINAL owner architecture decision «REMOVE GENERAL SALES REPLY VALIDATION», 2026-11-19 — GV1): general reply validation is
// removed from the hold / owner path; informational findings are recorded read-only (ai_brain.advisory); only commercial-authority
// findings remove text. Claude's own reply is sent without a mandatory second authoring pass. v2 (sha256 01ac7316…) and v1 are preserved
// in reports/gv1-20261119/superseded/ and reports/rg1-20261118/superseded/. v2 injected every negative claim into the REPLY AUTHOR
// reply; under GV1 the captured Production primary is retained, so the author is not called and those injections tested nothing.
// v3 therefore injects each claim into the PRIMARY reply — the text that reaches the customer now — and checks per class:
//  'deliver'   the exact captured Production primary reply is sent, no second authoring pass, no owner case (owner item 3);
//  'advisory'  an INFORMATIONAL claim (custom size, mechanism, printing method, missing printing evidence): sent as Claude wrote it,
//              recorded in ai_brain.advisory, no owner case (owner item 2 — changed expectation; reason: the owner decision itself);
//  'dropped'   an ungrounded NUMBER (commercial-authority control, kept): the sentence never reaches the customer, the rest is answered,
//              and the RR1 owner case for a removed sentence on the central question is kept;
//  'protected' price, discount, stock, deposit, payment (D-004, owner item 4): the claim never reaches the customer — even when the
//              Reply Author repeats it — the verified rest is sent, and the owner case is KEPT;
//  'followup'  a reply that promises a staff follow-up is sent as written; per the final owner directive (items 3/4) it opens no owner
//              case — only price/discount exceptions, payment confirmation, final order and unauthorized commitments do.
// 'hold' (PHASE51_EXPECT_INCIDENT_HOLD=1 baseline replay) keeps its v1 meaning.
const INDEPENDENT_ANSWER=['کشویی بگ‌دار رو پیشنهاد می‌کنم','اطلاعات دقیقی درباره تناسب ابعاد'];
const PRIMARY_REPLY=fixture.primary.decision.reply;
async function replay(key,{primaryReply=PRIMARY_REPLY,reply=fixture.author.decision.reply,primary=fixture.primary.decision,author=fixture.author.decision,expect=!expectHold,policy=expect?'deliver':'hold',claim=[],ownerKept=false,authorExpected=policy==='hold'||policy==='dropped'||policy==='protected'}={}){
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
  capture.reply=stage==='author'?reply:primaryReply;
  calls.push({stage,decision:capture,selected_context:ctx.knowledge,required_parts:ctx.authoring?.required_parts});
  return new Response(JSON.stringify({model:fixture.provider,stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(capture)}]}),{headers:{'Content-Type':'application/json'}});
 };
 let r;try{r=await W.send(user,fixture.question);}finally{globalThis.fetch=originalFetch;}
 const texts=sent(user,start),ownerCases=owners(r.row.id),detail={validation:r.brain?.validation,rejection:r.brain?.ai_brain?.author_rejection,advisory:r.brain?.ai_brain?.advisory||null,stage:r.brain?.ai_brain?.authorship?.stage||null,outcome:r.outcome,stages:calls.map(c=>c.stage)};
 ok(key+': primary decision is the captured Production decision (only the reply text varies)',isDeepStrictEqual({...calls.find(c=>c.stage==='primary')?.decision,reply:null},{...fixture.primary.decision,reply:null}),detail);
 ok(key+(authorExpected?': the Reply Author runs only because the primary lost a commercial sentence':': no second authoring pass — the primary reply itself is used'),calls.some(c=>c.stage==='author')===authorExpected,detail);
 const delivered=policy!=='hold',sentText=texts.join('\n'),detailText={...detail,sent:texts};
 if(policy==='deliver')ok(key+': the exact captured Production reply is delivered',texts.length===1&&texts[0]===primaryReply,detailText);
 else if(policy==='hold')ok(key+': delivery decision matches expectation',texts.length===0,detail);
 else if(policy==='advisory'||policy==='followup'){
  ok(key+': Claude\'s reply is delivered as written',texts.length===1&&texts[0]===primaryReply,detailText);
  if(policy==='advisory'){
   ok(key+': the informational finding is recorded read-only (ai_brain.advisory)',Array.isArray(detail.advisory)&&detail.advisory.some(a=>a.codes?.length),detail);
   ok(key+': the recorded claim is the injected one',claim.every(fragment=>sentText.includes(fragment)),detailText);
  }
 }else{
  ok(key+': exactly one customer reply is delivered',texts.length===1,detailText);
  ok(key+': '+(policy==='protected'?'B protected claim':'ungrounded number')+' is never sent',texts.length===1&&claim.length>0&&claim.every(fragment=>!sentText.includes(fragment)),detailText);
  ok(key+': independent verified answer is kept',INDEPENDENT_ANSWER.every(fragment=>sentText.includes(fragment)),detailText);
 }
 ok(key+': closed AI authorship matches delivery',salesAiFirstReply(r.brain)===delivered,detail);
 ok(key+': durable owner review is held only when necessary',policy==='hold'||policy==='protected'||ownerKept?ownerCases.length===1:ownerCases.length===0,{...detail,ownerCases});
 ok(key+': financial source/order/payment state unchanged',isDeepStrictEqual(before,snapshot()),detail);
 ok(key+': no canned acknowledgement',!r.ack,detail);
 ok(key+': final-author destination does not become customer evidence',!W.q("SELECT 1 FROM conversation_memory_facts WHERE source_message_id=? AND fact_type IN ('destination','customer_name')",[r.row.id]).length,detail);
 if(delivered){
  ok(key+': draft and durable outcome prove customer transport',r.draft?.status==='sent'&&r.draft?.message===texts[0]&&r.outcome?.customer_visible==='reply',detail);
  ok(key+': correlated positive delivery receipt exists',Number(r.draft.provider_message_id)>0&&String(r.draft.provider_conversation_id)===String(user.id),r.draft);
 }else if(key==='captured incident'){
  const v=r.brain?.ai_brain?.author_rejection?.validation;
  ok(key+': reproduces exact Production printing rejection',v?.reason===fixture.expected_baseline_rejection.reason&&v?.claim_category==='printing'&&isDeepStrictEqual(v?.unsupported_values,['چاپ'])&&r.outcome?.reason==='ai_reply_unavailable',detail);
 }
 observations.push({key,policy,question:fixture.question,kind:'CAPTURED_NORMALIZED_MODEL_REPLAY_MOCK_TRANSPORT',calls,final_texts:texts,owner_cases:ownerCases,partial_delivery:r.brain?.ai_brain?.partial_delivery||null,...detail});
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
 // GV1 read-only mode of the same validator: an informational finding is reported as advisory, a commercial claim still fails
 for(const [key,text,expect]of [
  ['custom size is informational',PRIMARY_REPLY+' کشویی بگ‌دار اندازه دلخواه دارد.',true],
  ['invented printing method is informational',fixture.author.decision.reply.replace('رو چاپ کرد','رو چاپ لیزری کرد'),true],
  ['invented price stays commercial',PRIMARY_REPLY+' قیمت این جعبه 123456789 تومان است.',false],
  ['unknown model availability stays commercial',PRIMARY_REPLY+' مدل ناشناخته در انبار موجود است.',false]
 ]){const result=validateSalesBrainDraft(text,{...scope,informationalAdvisory:true});ok('GV1 advisory validator: '+key,result.valid===expect&&(!expect||text===PRIMARY_REPLY||Array.isArray(result.advisory)&&result.advisory.length>0),result);}
 // with the Reply Author repeating the protected claim, the claim still never reaches the customer (B)
 const both=extra=>({primaryReply:PRIMARY_REPLY+extra,reply:fixture.author.decision.reply+extra});
 for(const [key,extra,policy,claim]of [
  ['unsupported perfume dimensions',' این مدل برای شیشه عطر با ابعاد 999x999x999 مناسب است.','dropped',['999']],
  ['unsupported custom size',' کشویی بگ‌دار اندازه دلخواه دارد.','advisory',['اندازه دلخواه']],
  ['unsupported mechanism after uncertainty',' اطلاعات دقیق ندارم ولی با آهنربا بسته می‌شود.','advisory',['آهنربا']],
  ['invented price',' قیمت این جعبه 123456789 تومان است.','protected',['123456789','تومان','قیمت']],
  ['unauthorized discount',' تخفیف ویژه 37 درصد می‌دهیم.','protected',['37','تخفیف','درصد']],
  ['unapproved availability',' مدل ناشناخته در انبار موجود است.','protected',['انبار','ناشناخته','موجود']],
  ['deposit requirement cannot be waived',' برای شروع کار بیعانه لازم نیست.','protected',['بیعانه']],
  ['payment authority',' پرداخت شما تأیید شده است.','protected',['پرداخت','تأیید شده']]
 // (an ungrounded number is a commercial-authority control: removed like B, and — the removed sentence answered the central question
 // «for perfume» — the RR1 owner case for it is kept)
 ])await replay(key,{...(policy==='advisory'?{primaryReply:PRIMARY_REPLY+extra}:both(extra)),expect:false,policy:expectHold?'hold':policy,claim,ownerKept:policy==='dropped'});
 await replay('invented printing method',{primaryReply:PRIMARY_REPLY.replace('رو چاپ کرد','رو چاپ لیزری کرد'),expect:false,policy:expectHold?'hold':'advisory',claim:['لیزری']});
 // the reply promises a manager follow-up: it is sent; no owner case (final owner directive, items 3/4)
 await replay('manager follow-up promise is sent without an owner case',{primaryReply:PRIMARY_REPLY.replace('همین‌جا بفرستید.','همین‌جا بفرستید تا مدیر فروش بررسی کنه و خبرتون بدم.'),expect:false,policy:expectHold?'hold':'followup'});
 await freshWorld();
 for(const row of W.q("SELECT id FROM sales_knowledge_facts WHERE attribute='bag_drawer_print_surfaces' AND market='IRAN' AND status='active'"))W.dbrun("UPDATE sales_knowledge_facts SET status='superseded' WHERE id=?",[row.id]);
 // C (v2 «clarify», superseded by GV1): without the approved bag-drawer printing fact the printing description is an informational
 // finding — Claude's reply is sent as written and the finding is recorded; no owner case.
 const PRINT_CLAIM=['چاپ','کوب','بگ بیرونی'];
 await replay('missing approved model printing fact',{expect:false,policy:expectHold?'hold':'advisory',claim:PRINT_CLAIM});
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
 await replay('printing fact belongs to another model',{expect:false,policy:expectHold?'hold':'advisory',claim:PRINT_CLAIM});
}
ok('Original positive-world approved bag-drawer printing fact has unchanged value',worlds[0].q("SELECT value_json FROM sales_knowledge_facts WHERE attribute='bag_drawer_print_surfaces' AND market='IRAN' AND status='active'").some(x=>JSON.parse(x.value_json).value===JSON.parse(fixture.approved_facts.find(f=>f.attribute==='bag_drawer_print_surfaces').value_json).value));
ok('No real network transport',worlds.every(w=>w.offNet().length===0),worlds.flatMap(w=>w.offNet()));
const result={suite:'phase51_live_perfume_replay',version:3,supersedes:'v2 (sha256 01ac7316…, reports/gv1-20261119/superseded/) per owner architecture decision 2026-11-19 (GV1); v1 (sha256 28e3cc1a…, reports/rg1-20261118/superseded/)',baseline_commit:fixture.commit,fixture_source:fixture.kind,expected_hold:expectHold,live_model_calls:0,real_telegram_messages:0,assertions,observations};
if(process.env.PHASE51_INCIDENT_EVIDENCE)fs.writeFileSync(process.env.PHASE51_INCIDENT_EVIDENCE,JSON.stringify(result,null,2)+'\n');
process.exitCode=report.done()?1:0;
