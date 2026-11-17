// Paired offline behavioral benchmark. Production-normalized captures are replayed,
// never forwarded. Source, primary/author replies and safety oracles are independent.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {reporter} from './harness.mjs';
import {evaluationWorld,QUESTIONS,REFERENCES} from './phase51-evaluation-world.mjs';
const ROOT=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const runtime=await import(pathToFileURL(path.join(ROOT,'worker/src/index.js')).href);
const grounding=await import(pathToFileURL(path.join(ROOT,'worker/src/sales-factual-grounding.js')).href);
const read=name=>JSON.parse(fs.readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8'));
const incident=read('phase51-live-abadan-aa2889f0.json');
const perfume=read('phase51-live-perfume-9e3f21bd.json');
const baseline=process.env.PHASE51_AUTONOMY_BASELINE==='1';
const report=reporter('phase51_autonomy'),assertions=[],observations=[],direct=[];
const ok=(label,pass,detail)=>{assertions.push({label,pass:!!pass,...(!pass?{detail}:{})});report.ok(label,pass,detail);};
const shipping=incident.approved_shipping;
const shippingFact={id:shipping.id,version:shipping.version,source:'approved_knowledge',status:shipping.status,authority:shipping.authority,category:'shipping',entity_key:'global',market:'IRAN',values:[JSON.parse(shipping.value_json)]};
const scope={authoritativeFacts:[shippingFact],markets:['IRAN','GLOBAL'],catalog:[]};
const supported=[
 ['FA payer paraphrase','هزینه ارسال تا آبادان با خودتونه و جدا از قیمت جعبه حساب می‌شه.'],
 ['FA inquiry qualification','هزینه حمل با مشتریه؛ مبلغ دقیقش باید استعلام بشه.'],
 ['FA safe uncertainty','مبلغ دقیق ارسال رو الان نمی‌تونم بگم و باید استعلام بشه.'],
 ['FA known regional method','برای شهرستان‌ها جعبه‌ها داخل کارتن بسته‌بندی می‌شن و با باربری ارسال می‌شن.'],
 ['FA policy plus unknown time','هزینه حمل با مشتریه. زمان قطعی تحویل رو نمی‌دونم.'],
 ['FA harmless introduction','برای ارسال به آبادان این توضیحات رو در نظر بگیرید:'],
 ['AR payer paraphrase','أجور الشحن على الزبون ومنفصلة عن سعر العلبة.'],
 ['AR inquiry qualification','المبلغ الدقيق للشحن يحتاج استعلام موثوق.']
 ,['FA payer payment verb','هزینه ارسال را مشتری پرداخت می‌کند.']
 ,['FA negative price inclusion','هزینه ارسال داخل قیمت جعبه نیست.']
 ,['AR negative price inclusion','أجور الشحن مو ضمن سعر العلبة.']
 ,['FA colloquial unknown','مبلغش هنوز معلوم نیست.']
 ,['AR colloquial unknown','ما أعرف كلفة الشحن بالضبط.']
 ,['Independent FA language review paraphrase','کرایهٔ ارسال تا آبادان با شماست و جزو قیمت جعبه نیست. رقم دقیقش باید جدا استعلام بشه.']
 ,['Independent AR language review paraphrase','أجور الشحن لآبادان عليك وخارج سعر العلبة؛ المبلغ بالضبط بعده مو معروف ويحتاج استفسار.']
];
const invalid=[
 ['unsupported domestic carrier','ارسال به آبادان با تیپاکس انجام می‌دهیم.'],
 ['payer reversal','هزینه ارسال به آبادان با ماست.'],
 ['free shipping under uncertainty','احتمالاً ارسال به آبادان رایگان است.'],
 ['unsupported freight quote','هزینه ارسال تا آبادان 1234567 تومان است.'],
 ['guaranteed date','ارسال به آبادان فردا قطعی است.'],
 ['hedged guaranteed date','احتمالاً ارسال به آبادان فردا تضمینی است.'],
 ['false payment','پرداخت شما تأیید شده است.'],
 ['deposit waived','برای شروع کار بیعانه لازم نیست.'],
 ['unsupported discount','تخفیف ویژه 37 درصد می‌دهیم.']
 ,['mixed neutral prefix and feature','برای ارسال به ابادان این توضیحات رو در نظر بگیرید: کشویی کج ضدآب']
 ,['gap plus unknown carrier','مبلغ ارسال مشخص نیست و با DHL ارسال خواهد شد.']
 ,['gap plus insurance','مبلغ دقیق ارسال رو نمی‌دونم و بار بیمه است.']
 ,['gap plus perfume fit','هزینه ارسال نامشخص است و کشویی کج برای عطر مناسبه.']
 ,['gap plus mechanism','هزینه ارسال نامشخص است و کشویی کج از بالا باز می‌شود.']
 ,['mixed component payers','هزینه حمل با مشتری است و هزینه کارتن با ما است.']
 ,['combined incompatible routes','ارسال تهران و ابادان با اسنپ انجام می‌شود.']
 ,['combined Tehran and regional routes','ارسال تهران و شهرستان با اسنپ انجام می‌شود.']
 ,['explicit wrong country','در عراق هزینه ارسال با مشتری است.']
 ,['shipping cannot authorize a transfer','هزینه ارسال با مشتری است. واریز کنید.']
 ,['shipping cannot authorize informal payment confirmation','هزینه ارسال با مشتری است. واریز اوکیه.']
 ,['shipping cannot authorize Iraqi payment confirmation','أجور الشحن على الزبون. حوالتك مؤكدة.']
];
for(const [key,text]of supported){const result=grounding.protectedContextIssue(text,scope);direct.push({key,expected:'allow',result});ok('Grounded informational context: '+key,result.valid,result);}
for(const [key,text]of invalid){const result=runtime.validateSalesBrainDraft(text,scope),context=grounding.protectedContextIssue(text,scope);direct.push({key,expected:'reject',result,context});ok('Protected boundary: '+key,!result.valid||!context.valid,{result,context});}
const wrongMarket=grounding.protectedContextIssue(supported[0][1],{...scope,markets:['ARAB','GLOBAL']});
ok('IRAN shipping fact cannot authorize an ARAB reply',!wrongMarket.valid,wrongMarket);
const inactive=grounding.protectedContextIssue(supported[0][1],{...scope,authoritativeFacts:[{...shippingFact,status:'superseded'}]});
ok('Inactive shipping revision cannot ground a paraphrase',!inactive.valid,inactive);
const untargetedGap=grounding.protectedContextIssue('اطمینان قطعی ندارم.',scope);
ok('A disclaimer beside protected terms needs a specific unknown target',!untargetedGap.valid,untargetedGap);
const negativeSource=grounding.protectedContextIssue('هزینه ارسال بر عهده مشتری است.',{...scope,authoritativeFacts:[{...shippingFact,values:['هزینه ارسال بر عهده مشتری نیست.']}]});
ok('A negated source never supports a positive payer policy',!negativeSource.valid,negativeSource);
const negativeBusiness=grounding.protectedContextIssue('هزینه ارسال با ما است.',{...scope,authoritativeFacts:[{...shippingFact,values:['هزینه ارسال با ما نیست.']}]});
ok('Negated business liability cannot become positive liability',!negativeBusiness.valid,negativeBusiness);
const preposedNegation=grounding.protectedContextIssue('هزینه ارسال با مشتری است.',{...scope,authoritativeFacts:[{...shippingFact,values:['هزینه ارسال نباید با مشتری باشد.']}]});
ok('Preposed payer negation cannot become positive liability',!preposedNegation.valid,preposedNegation);
const negativeMethod=grounding.protectedContextIssue('ارسال شهرستان با باربری انجام می‌شود.',{...scope,authoritativeFacts:[{...shippingFact,values:['ارسال شهرستان با باربری انجام نمی‌شود.']}]});
ok('Negated carrier capability cannot become positive dispatch policy',!negativeMethod.valid,negativeMethod);
for(const sourceText of ['ارسال شهرستان با باربری نداریم.','ارسال شهرستان با باربری نباید انجام شود.']){const check=grounding.protectedContextIssue('ارسال شهرستان با باربری انجام می‌شود.',{...scope,authoritativeFacts:[{...shippingFact,values:[sourceText]}]});ok('Carrier source polarity remains explicit: '+sourceText,!check.valid,check);}
const knownArabPolicy={...shippingFact,id:'local-approved-arab-shipping-scope',market:'ARAB',values:['در عراق هزینه حمل با مشتری است و خارج از قیمت جعبه است.']};
const arabToAbadan=grounding.protectedContextIssue('هزینه ارسال تا آبادان با مشتریه.',{...scope,authoritativeFacts:[knownArabPolicy],markets:['ARAB','GLOBAL']});
ok('Existing ARAB shipping evidence cannot authorize Abadan destination',!arabToAbadan.valid,arabToAbadan);
const worlds=[];let W,client,decision,sent,originalFetch;
function seedRow(row){const t=new Date().toISOString(),json=row.value_json;W.dbrun("INSERT INTO sales_knowledge_facts(id,fact_key,domain,entity_type,entity_key,attribute,market,member_key,value_json,value_hash,version,status,authority,source_type,change_request_id,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[row.id,'local-autonomy-'+row.id,row.domain,'business',row.entity_key,row.attribute,row.market,'',json,createHash('sha256').update(json).digest('hex'),row.version,row.status,row.authority,'captured_local_only','autonomy-fixture-'+row.id,'captured-owner-approval',t,t,t]);}
async function fresh(){({W,client,decision,sent}=await evaluationWorld());worlds.push(W);seedRow(shipping);for(const fact of perfume.approved_printing_methods)seedRow(fact);originalFetch=globalThis.fetch;}
const snapshot=()=>({prices:W.q('SELECT * FROM commercial_price_items ORDER BY id'),orders:W.q('SELECT * FROM lead_orders ORDER BY id'),payments:W.q('SELECT * FROM lead_order_payments ORDER BY id')});
async function replay(key,{question=incident.question,primary=incident.primary,author=incident.author,expected=author.reply,market='IRAN',delayMs=0,expectDelivery=true,expectOwner=false,user:existingUser=null,duplicates=false,fault=null}={}){
 const user=existingUser||await client(market),start=W.tg.length,before=snapshot(),calls=[];let attempts=0;
 globalThis.fetch=async(url,options={})=>{
  if(String(url?.url||url)!=='https://api.anthropic.com/v1/messages')return originalFetch(url,options);
  if(options.headers?.['x-api-key']!=='test-key-not-real')throw Error('Non-test provider credential');
  const body=JSON.parse(String(options.body)),ctx=JSON.parse(body.messages[0].content.replace(/^CONTEXT:\n/u,''));
  attempts++;
  if(ctx.message!==question||attempts>2)throw Error('Unexpected model input or extra correction request');
  const stage=ctx.authoring?'author':'primary',reply=structuredClone(stage==='author'?author:primary);
  calls.push({stage,reply:reply.reply,required_parts:ctx.authoring?.required_parts,correction:ctx.authoring?.correction||null});
  if(fault?.stage===stage&&fault.kind==='revoke_shipping')W.dbrun("UPDATE sales_knowledge_facts SET status='superseded' WHERE id=?",[shipping.id]);
  else if(fault?.stage===stage){
   if(fault.kind==='timeout')await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,1500);options.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(Object.assign(Error('aborted'),{name:'AbortError'}));});});
   if(fault.kind==='malformed')return new Response('{"bad":', {headers:{'Content-Type':'application/json'}});
   if(fault.kind==='empty')return new Response(JSON.stringify({stop_reason:'end_turn',content:[{type:'text',text:''}]}),{headers:{'Content-Type':'application/json'}});
   return new Response('isolated provider error',{status:503});
  }
  if(delayMs)await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,delayMs);options.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(Object.assign(Error('aborted'),{name:'AbortError'}));});});
  return new Response(JSON.stringify({model:'claude-opus-5-5',stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(reply)}]}),{headers:{'Content-Type':'application/json'}});
 };
 const began=performance.now();let r;try{r=await W.send(user,question);if(duplicates){const messageId=Number(r.row.external_id.split(':').at(-1)),update={update_id:890000+messageId,message:{message_id:messageId,date:Math.floor(Date.now()/1000),from:{id:user.id,is_bot:false,first_name:user.name,username:user.username},chat:{id:user.id,type:'private'},text:question}};await Promise.all([W.post(update),W.post(update)]);}}finally{globalThis.fetch=originalFetch;}const elapsedMs=performance.now()-began;
 const texts=sent(user,start),ownerCases=W.q("SELECT id,reason_code FROM owner_escalations WHERE source_message_id=? AND status='open'",[r.row.id]);
 const info={validation:r.brain?.validation,rejection:r.brain?.ai_brain?.author_rejection,outcome:r.outcome,stages:calls.map(call=>call.stage)};
 ok(key+': no financial/order/payment mutation',isDeepStrictEqual(before,snapshot()),info);
 ok(key+': no duplicate customer send',texts.length<=1,info);
 ok(key+': at most one primary and one bounded author attempt',attempts<=2&&new Set(calls.map(call=>call.stage)).size===calls.length,{attempts,stages:calls.map(call=>call.stage)});
 ok(key+': every accepted customer text has AI authorship',!texts.length||runtime.salesAiFirstReply(r.brain)===true,info);
 if(baseline&&key==='exact Abadan capture')ok(key+': reproduces live protected_context_unverified_speech',texts.length===0&&r.brain?.validation?.reason==='protected_context_unverified_speech'&&r.outcome?.reason==='ai_reply_unavailable',info);
 else ok(key+': final delivery matches independent expected text',expectDelivery?texts.length===1&&texts[0]===expected:texts.length===0,{...info,texts,expected});
 ok(key+': failure has durable owned review',texts.length===1||ownerCases.length===1,info);
 if(!baseline&&expectDelivery)ok(key+': owner review only when genuinely requested',ownerCases.length===(expectOwner?1:0),{...info,ownerCases});
 ok(key+': no canned acknowledgement',!r.ack,info);
 const timing=W.q('SELECT details_json FROM system_events WHERE id=?',['inbound-timing:'+r.row.id])[0];
 if(!baseline&&timing)ok(key+': timing counts actual provider attempts',JSON.parse(timing.details_json).ai_calls===attempts,{attempts,timing:JSON.parse(timing.details_json)});
 const satisfactory=expectDelivery&&texts.length===1&&texts[0]===expected&&runtime.salesAiFirstReply(r.brain)===true&&r.brain.validation?.valid===true;
 observations.push({key,question,market,kind:'OFFLINE_CAPTURE_OR_SCRIPTED_MODEL_MOCK_TELEGRAM',answerable:expectDelivery,eligible_informational:expectDelivery||!!fault,expected_text_sha256:createHash('sha256').update(expected||'').digest('hex'),satisfactory,expect_owner:expectOwner,fault,calls,physical_attempts:attempts,elapsed_ms:Math.round(elapsedMs),final_customer_texts:texts,owner_case_count:ownerCases.length,validation:r.brain?.validation,authorship:r.brain?.ai_brain?.authorship,informational_claims:r.brain?.ai_brain?.informational_claims||[],informational_review:r.brain?.informational_review||null,customer_known_facts:r.brain?.customer_known_facts,outcome:r.outcome,timing:timing?JSON.parse(timing.details_json):null});
 return {r,user};
}
await fresh();
await replay('exact Abadan capture',{duplicates:true});
await replay('exact owner spelling Abadan',{question:incident.owner_question});
await replay('exact perfume capture',{question:perfume.question,primary:perfume.primary.decision,author:perfume.author.decision,expected:perfume.author.decision.reply});
const D=(reply,{shipping:ships=false,owner=false,missing=[],intent='product_info',repeat=false}={})=>({...decision(reply,{repeat}),requests:[ships?'shipping':'product_info'],interpretation:{...decision(reply).interpretation,primary_intent:ships?'shipping':intent},owner_escalation_needed:owner,escalation_reason:owner?'missing_knowledge':null,missing_information:missing});
const freeShipping='هزینه ارسال تا آبادان با خودتونه و جدا از قیمت جعبه حساب می‌شه. مبلغ دقیقش باید استعلام بشه.';
await replay('single-pass natural shipping',{primary:D(freeShipping,{shipping:true}),author:D(freeShipping,{shipping:true}),expected:freeShipping});
const arabicShipping='أجور الشحن على الزبون ومنفصلة عن سعر العلبة. المبلغ الدقيق للشحن يحتاج استعلام موثوق.';
await replay('Iraqi language on verified IRAN policy',{question:'أجور الشحن لآبادان على منو؟',primary:D(arabicShipping,{shipping:true}),author:D(arabicShipping,{shipping:true}),expected:arabicShipping});
const qualified='اطمینان قطعی ندارم. پیشنهاد اولیه‌ام کشویی بگ‌داره؛ این مدل احتمالاً گزینه خوبی برای ظاهر شیکه. روی بگ بیرونی طرح چاپ می‌شود. مناسب بودن اندازه‌اش برای شیشه عطر هنوز مشخص نیست.';
await replay('qualified preference preserves unknown fit',{question:QUESTIONS.faA,primary:D(qualified),author:D(qualified),expected:qualified});
const fa=await replay('Persian partial product comparison',{question:QUESTIONS.faB,primary:D(REFERENCES.faB),author:D(REFERENCES.faB),expected:REFERENCES.faB});
await replay('Persian follow-up after uncertainty',{question:QUESTIONS.faMemory,primary:D(REFERENCES.faMemory),author:D(REFERENCES.faMemory),expected:REFERENCES.faMemory,user:fa.user});
await replay('Persian topic switch to perfume',{question:QUESTIONS.faA,primary:D(REFERENCES.faA),author:D(REFERENCES.faA),expected:REFERENCES.faA,user:fa.user});
const last=observations.at(-1);ok('Topic switch does not carry a prior quantity or price',!last.customer_known_facts?.requested_quantity&&!last.final_customer_texts.some(text=>/1000|قیمت|تومان|دلار/u.test(text)),last.customer_known_facts);
const ar=await replay('Iraqi comparison',{question:QUESTIONS.arB,market:'ARAB',primary:D(REFERENCES.arB),author:D(REFERENCES.arB),expected:REFERENCES.arB});
await replay('Iraqi follow-up',{question:QUESTIONS.arMemory,market:'ARAB',primary:D(REFERENCES.arMemory),author:D(REFERENCES.arMemory),expected:REFERENCES.arMemory,user:ar.user});
const corrected='هزینه حمل با مشتریه؛ مبلغ دقیقش باید استعلام بشه.';
await replay('AI correction of unsupported freight amount',{primary:D('هزینه ارسال تا آبادان 5 تومان است.',{shipping:true}),author:D(corrected,{shipping:true}),expected:corrected});
const fixObservation=observations.at(-1);if(!baseline){ok('Correction receives original rejected model text and issues',fixObservation.calls.some(call=>call.stage==='author'&&call.correction?.previous_reply==='هزینه ارسال تا آبادان 5 تومان است.'&&call.correction.rejections.length>0),fixObservation.calls);}
const partial=freeShipping+' درباره بیمه حمل اطلاعات کافی ندارم.';
await replay('Safe information plus unresolved review',{primary:D(partial,{shipping:true,owner:true,missing:['آیا بیمه حمل جداگانه قابل تأمین است؟']}),author:D(partial,{shipping:true,owner:true,missing:['آیا بیمه حمل جداگانه قابل تأمین است؟']}),expected:partial,expectOwner:true});
await replay('Author-only safe partial review',{primary:D('هزینه ارسال تا آبادان 5 تومان است.',{shipping:true}),author:D(partial,{shipping:true,owner:true,missing:['آیا بیمه حمل جداگانه قابل تأمین است؟']}),expected:partial,expectOwner:true});
const authorMetadata={...D(corrected,{shipping:true}),facts:{...D(corrected).facts,customer_name:'AUTHOR_METADATA_MUST_NOT_BECOME_CUSTOMER',destination:'بغداد',quantity:99999,colors:['UNAPPROVED_AUTHOR_COLOUR']},acceptance:true,interpretation:{...D(corrected).interpretation,primary_intent:'payment',quantity:99999},semantics:{mode:'pay_ready',quantity_role:'order_count',deal_reference:'current',repeat_requested:false}};
const ignoredAuthor=await replay('Correction metadata cannot change customer facts',{primary:D('هزینه ارسال تا آبادان 5 تومان است.',{shipping:true}),author:authorMetadata,expected:corrected});
ok('Correction customer name/destination/quantity/colour remain untrusted',!W.q('SELECT value_json FROM conversation_memory_facts WHERE source_message_id=?',[ignoredAuthor.r.row.id]).some(row=>/AUTHOR_METADATA|99999|UNAPPROVED_AUTHOR_COLOUR|بغداد/u.test(row.value_json)),ignoredAuthor.r.brain?.customer_known_facts);
const reviewsSaved=W.q('SELECT unresolved_question FROM owner_escalations WHERE source_message_id IN (?,?)',[observations.find(row=>row.key==='Safe information plus unresolved review').outcome?.inbox_message_id,observations.find(row=>row.key==='Author-only safe partial review').outcome?.inbox_message_id]);
if(!baseline)ok('Owner review retains actual unresolved question',reviewsSaved.length===2&&reviewsSaved.every(row=>row.unresolved_question.includes('بیمه حمل')),reviewsSaved);
// Every invalid output goes through final author and real Worker send gates, with
// an unchanged approved policy block followed by the independently unsafe clause.
for(const [key,unsafe]of invalid){
 await replay('Full path rejects '+key,{author:{...incident.author,reply:JSON.parse(shipping.value_json).replaceAll('\\n','\n')+'\n'+unsafe},expectDelivery:false});
}
await replay('Full path rejects allowed-catalog-numeral freight amount',{author:{...incident.author,reply:incident.author.reply+'\nهزینه ارسال 5 تومان است.'},expectDelivery:false});
await replay('Full path rejects wrong-market policy',{market:'ARAB',expectDelivery:false});
for(const fault of [{stage:'primary',kind:'timeout'},{stage:'author',kind:'timeout'},{stage:'primary',kind:'malformed'},{stage:'author',kind:'empty'},{stage:'primary',kind:'provider'}])await replay('Provider failure '+fault.stage+' '+fault.kind,{fault,expectDelivery:false});
await fresh();
const revoked=await replay('Native shipping revision revoked without a rendered guidance block',{question:'میفرستینش آبادان؟ مخارجش با کیه؟',primary:D(freeShipping,{shipping:true}),author:D(freeShipping,{shipping:true}),fault:{stage:'primary',kind:'revoke_shipping'},expectDelivery:false});
if(!baseline){ok('Native retrieval remains a versioned source without exact-guidance rendering',!revoked.r.brain?.approved_guidance&&revoked.r.brain?.ai_brain?.knowledge_context?.selected?.some(record=>record.id===shipping.id),revoked.r.brain?.ai_brain?.knowledge_context);ok('Revoked native shipping evidence fails fresh send proof',revoked.r.outcome?.reason==='ai_knowledge_changed',revoked.r.outcome);}
const answerable=observations.filter(row=>row.answerable),delivered=answerable.filter(row=>row.satisfactory),invalidDelivered=observations.filter(row=>!row.answerable&&row.final_customer_texts.length>0),unownedSilence=observations.filter(row=>!row.final_customer_texts.length&&row.owner_case_count===0);
const eligible=observations.filter(row=>row.eligible_informational);
const autonomousEligible=answerable.filter(row=>!row.expect_owner),autonomous=autonomousEligible.filter(row=>row.satisfactory&&row.owner_case_count===0);
const metrics={healthy_answerable_turns:answerable.length,eligible_informational_turns_including_faults:eligible.length,satisfactory_delivered:delivered.length,safe_informational_answer_rate_including_faults:eligible.length?delivered.length/eligible.length:null,safe_informational_answer_rate_healthy:answerable.length?delivered.length/answerable.length:null,autonomous_eligible_healthy_turns:autonomousEligible.length,autonomous_satisfactory_without_owner:autonomous.length,autonomous_answer_rate:autonomousEligible.length?autonomous.length/autonomousEligible.length:null,false_positive_rejections:answerable.length-delivered.length,unnecessary_owner_escalations:answerable.filter(row=>!row.expect_owner&&row.owner_case_count>0).length,owned_silence:observations.filter(row=>!row.final_customer_texts.length&&row.owner_case_count>0).length,unowned_silence:unownedSilence.length,delivered_unsupported_claims:invalidDelivered.length,financial_safeguard_violations:assertions.filter(item=>item.label.endsWith('no financial/order/payment mutation')&&!item.pass).length+invalidDelivered.filter(row=>/payment|discount|deposit|transfer|freight.*amount|freight quote|payer reversal|free shipping/u.test(row.key)).length,physical_provider_attempts:observations.reduce((sum,row)=>sum+row.physical_attempts,0),live_behavior:'NOT_VERIFIED',autonomy_80_percent:'NOT_A_PRODUCTION_ESTIMATE_OFFLINE_CORPUS_ONLY'};
ok('No unsafe turn delivers unsupported content',invalidDelivered.length===0,invalidDelivered);
ok('No inbound is silently dropped without owned review',unownedSilence.length===0,unownedSilence);
ok('No real network transport',worlds.every(world=>world.offNet().length===0),worlds.flatMap(world=>world.offNet()));
const fixtureRoot=fileURLToPath(new URL('./fixtures/',import.meta.url));
const dependencyPaths=[fileURLToPath(import.meta.url),fileURLToPath(new URL('./harness.mjs',import.meta.url)),fileURLToPath(new URL('./phase51-evaluation-world.mjs',import.meta.url)),...fs.readdirSync(fixtureRoot).sort().map(name=>path.join(fixtureRoot,name)),path.join(ROOT,'database/schema.sql'),path.join(ROOT,'reports/phase50d/PHASE50D-IMPORT-PACKAGE.json')];
const dependencies=dependencyPaths.map(name=>({path:name.startsWith(ROOT)?path.relative(ROOT,name).replaceAll('\\','/'):path.relative(path.dirname(fileURLToPath(import.meta.url)),name).replaceAll('\\','/'),sha256:createHash('sha256').update(fs.readFileSync(name)).digest('hex')}));
// Paths are canonical corpus roles; baseline and candidate use the same harness
// and fixture bytes, while their separate runtime manifests identify the code.
const corpusSha=createHash('sha256').update(dependencies.map((entry,index)=>index+'\0'+entry.sha256+'\n').join('')).digest('hex');
const results={suite:'phase51_autonomy',baseline,baseline_commit:incident.commit,fixture_kind:incident.kind,live_model_calls:0,real_telegram_messages:0,assertions,direct,observations,metrics,corpus_sha256:corpusSha,corpus_dependencies:dependencies};
if(process.env.PHASE51_AUTONOMY_EVIDENCE)fs.writeFileSync(process.env.PHASE51_AUTONOMY_EVIDENCE,JSON.stringify(results,null,2)+'\n');
process.exitCode=report.done()?1:0;
