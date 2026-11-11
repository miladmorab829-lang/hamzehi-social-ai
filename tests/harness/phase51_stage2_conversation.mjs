// Stage 2: actual Worker/SQLite/validator/delivery with explicit, non-live model fixtures.
// Provider and Telegram calls are intercepted by evaluationWorld; no paid or remote calls.
import fs from 'node:fs';
import {reporter} from './harness.mjs';
import {evaluationWorld, REFERENCES, QUESTIONS} from './phase51-evaluation-world.mjs';
import {salesAiFirstReply, validateSalesBrainDraft} from '../../worker/src/index.js';
import {modelMentions} from '../../worker/src/sales-conversation-author.js';
import {selectApprovedGuidance} from '../../worker/src/approved-sales-guidance.js';
const report=reporter('phase51_stage2_conversation'), assertions=[], observations=[];
const ok=(label,pass,detail)=>{assertions.push({label,pass:!!pass,...(!pass?{detail}:{})});report.ok(label,pass,detail);};
const {W,client,decision,sent,seedJewelleryMemory}=await evaluationWorld();
const owner=row=>W.q("SELECT id FROM owner_escalations WHERE source_message_id=? AND status='open'",[row.id]);
const detail=r=>({action:r.action,outcome:r.outcome,validation:r.brain?.validation,comparison:r.brain?.ai_brain?.comparison,rejection:r.brain?.ai_brain?.author_rejection});
async function answer(key,market,question,reply,{user=null,repeat=false,contextCheck=null,forceAuthor=false}={}){
 user??=await client(market);let context;const outputs=[];
 W.AI.script.set(question,ctx=>{context=ctx;const output=forceAuthor&&!ctx.authoring?(market==='IRAN'?'سلام':'هلا'):reply;outputs.push({stage:ctx.authoring?'author':'primary',reply:output,required_parts:ctx.authoring?.required_parts});return decision(output,{repeat});});
 const start=W.tg.length,calls=W.AI.requests.length,result=await W.send(user,question),texts=sent(user,start);
 ok(key+': exact substantive fixture reaches customer once',texts.length===1&&texts[0]===reply,detail(result));
 ok(key+': closed AI authorship, no canned replacement',salesAiFirstReply(result.brain)&&outputs.some(o=>o.reply===texts[0]),detail(result));
 ok(key+': no unrequested deal or payment mutation',!result.brain?.sales_agent?.order_candidate_written&&!W.q("SELECT 1 FROM conversation_memory_facts WHERE source_message_id=? AND fact_type IN ('requested_quantity','order_candidate')",[result.row.id]).length&&!W.q('SELECT 1 FROM lead_orders').length&&!W.q('SELECT 1 FROM lead_order_payments').length,detail(result));
 ok(key+': bounded authoring',W.AI.requests.length-calls>=1&&W.AI.requests.length-calls<=2);
 if(forceAuthor)ok(key+': final author actually called without canned descriptive requirement',outputs.some(o=>o.stage==='author')&&outputs.filter(o=>o.stage==='author').every(o=>!o.required_parts?.some(p=>p.includes('بدنه')||p.includes('الجسم')||p.includes('خوانایی')||p.includes('وضوحه'))),outputs);
 ok(key+': question fragments never become branding/printing selections',!W.q("SELECT 1 FROM conversation_memory_facts WHERE source_message_id=? AND fact_type IN ('branding','printing')",[result.row.id]).length,result.brain?.customer_known_facts);
 if(contextCheck)contextCheck(context,result);
 observations.push({key,kind:'SCRIPTED_NOT_LIVE',question,provider_outputs:outputs,final_customer_visible:texts,...detail(result),context_state:context?.state,customer_known_facts:result.brain?.customer_known_facts,order_candidate_written:result.brain?.sales_agent?.order_candidate_written,reply_parts:result.brain?.reply_parts});
 return {user,result,context};
}
await answer('FA multipart printing+logo','IRAN',
 'برای انگشتری کشویی بگ دار بهتره یا کشویی کج؟ چاپ روی بگ و امکان درج آدرس زیر لوگو رو هم توضیح بده؛ فعلاً سفارش نمی‌دم.',
 REFERENCES.faB+'\nزیر لوگوی روی درب می‌توان آدرس، شماره تلفن و آدرس اینستاگرام را درج کرد، به شرط فضای کافی و حفظ ظاهر و خوانایی طرح.',{forceAuthor:true});
await answer('AR multipart printing+logo','ARAB',
 'للمحابس الجرّارة ويا كيس أحسن لو الجرّارة المائلة؟ وگلي عن الطباعة على الكيس والعنوان تحت الشعار؛ هسه ما أريد أطلب.',
 REFERENCES.arB+'\nيمكن إضافة العنوان ورقم الهاتف وحساب إنستغرام تحت شعار الغطاء إذا توفرت مساحة كافية مع الحفاظ على شكل التصميم ووضوحه.',{forceAuthor:true});
const triples={
 IRAN:{question:'کشویی بگ دار، کشویی کج و 3 تکه را از نظر چاپ و انتخاب رنگ مقایسه کن؛ هر جا اطلاعات نداریم مشخص بگو.',reply:'کشویی بگ‌دار: طلاکوب، نقره‌کوب یا مشکی‌کوب روی درب و بدنهٔ میانی و چاپ طرح روی بگ بیرونی امکان‌پذیر است. درباره رنگ‌های موجود اطلاعات کافی ندارم.\nکشویی کج: درباره جزئیات چاپ و رنگ‌های موجود اطلاعات تأییدشده کافی ندارم.\n3 تکه: مشتری می‌تواند رنگ قسمت بالا، وسط و پایین را خودش از بین رنگ‌های موجود انتخاب کند. درباره جزئیات چاپ اطلاعات کافی ندارم.'},
 ARAB:{question:'قارنلي الجرّارة ويا كيس والجرّارة المائلة وقطعتين من ناحية الطباعة؛ إذا ما عدنا تفاصيل گلي.',reply:'الجرّارة ويا كيس: طباعة ذهبية أو فضية أو سوداء على الغطاء والجسم الأوسط، وطباعة تصميم على الكيس الخارجي.\nالجرّارة المائلة: ما عندي معلومات مؤكدة كافية عن تفاصيل الطباعة.\nقطعتين: ما عندي معلومات مؤكدة كافية عن تفاصيل الطباعة.'}
};
for(const [market,t]of Object.entries(triples))await answer(market+' three constructions',market,t.question,t.reply,{contextCheck:(ctx)=>ok(market+': all three comparison models supplied without clarification',ctx.state?.comparison?.requested_models?.length===3&&!ctx.state?.comparison?.clarification_needed,ctx.state?.comparison)});
await answer('FA shared-head grouped unknowns','IRAN','کشویی بگ‌دار، روبان‌دار و کج چه تفاوتی دارن؟',
 'کشویی بگ‌دار: طلاکوب، نقره‌کوب یا مشکی‌کوب روی درب و بدنهٔ میانی و چاپ طرح روی بگ بیرونی امکان‌پذیر است.\nدرباره مکانیزم کشویی روبان‌دار و کشویی کج اطلاعات کافی ندارم.',{contextCheck:ctx=>ok('Shared-head Worker prompt preserves three identities',ctx.state?.comparison?.requested_models?.length===3,ctx.state?.comparison)});
await answer('FA natural preference cue','IRAN',QUESTIONS.faB,REFERENCES.faB.replace('رو پیشنهاد می‌کنم','رو می‌پسندم'));
await answer('AR natural preference cue','ARAB',QUESTIONS.arB,REFERENCES.arB.replace('أنصحك بالجرّارة','أميل للجرّارة'));
// An older priced jewellery selection must not contaminate a complex perfume recommendation.
await W.teach('COLOR | مشکی سلفون | IRAN','IRAN','stage2-black');
await W.teach('COLOR | أسود | ARAB','ARAB','stage2-ar-black');
for(const [market,a,b]of [['IRAN','faA','faB'],['ARAB','arA','arB']]){
 const user=await client(market);seedJewelleryMemory(user);
 const noRepeat=REFERENCES[a].replace(/؛ طول،[^؟?]*[؟?]$/u,'.').replace(/؛ شكد[^؟?]*[؟?]$/u,'.');
 await answer(market+' complex fresh perfume',market,QUESTIONS[a]+(market==='IRAN'?' لطفاً درباره چاپ بگو؛ اندازه شیشه هنوز مشخص نیست.':' وگلي عن الطباعة؛ قياس القنينة بعده مو معروف.'),noRepeat,{user,contextCheck:(ctx,result)=>{
  ok(market+': old quantity/selection absent from fresh perfume prompt',ctx.state?.request?.construction_only===true&&!ctx.catalog.length&&!ctx.deal&&!ctx.state?.current_product&&!ctx.state?.printing&&!ctx.state?.quantity,ctx.state);
  ok(market+': color selection cleared in the entire prompt',!ctx.colors?.chosen?.length&&!ctx.colors?.chosen_parts,ctx.colors);
  ok(market+': multipart question never becomes a product label',!W.q("SELECT 1 FROM conversation_memory_facts WHERE source_message_id=? AND fact_type='product_interest' AND value_json LIKE ?",[result.row.id,'%تنصحني%']).length,result.brain?.customer_known_facts);
  ok(market+': an explicitly unknown dimension is not requested again',!/[؟?]/u.test(result.brain?.draft_customer_reply||''),result.brain?.draft_customer_reply);
 }});
 await answer(market+' switch back to named comparison',market,QUESTIONS[b],REFERENCES[b],{user});
 // A new request must not repeat the preceding perfume answer.
 ok(market+': topic switch yields a distinct relevant answer',observations.at(-1).final_customer_visible[0]!==observations.at(-2).final_customer_visible[0]);
}
// Missing details cannot license an affirmative product claim in the same sentence.
const unsupported=[
 'اطلاعات دقیق کشویی کج را ندارم و این مدل از بالا باز می‌شود.',
 'کشویی کج از بالا باز می‌شود و اطلاعات دقیقش را ندارم.',
 'ما عندي تفاصيل عن الجرّارة المائلة وهي تنفتح من فوق.',
 'الجرّارة المائلة تنفتح من فوق وما عندي تفاصيل عنها.'
 ,'مو متأكد قياس الجرّارة المائلة يناسب قنينة العطر لكنها تنفتح من فوق.'
];
const scope={catalog:[{product:'انگشتر کوچک',models:['کشویی کج','کشویی بگ‌دار','جرّارة مائلة'],variants:[]}],authoritativeFacts:[]};
for(const reply of unsupported){
 const checked=validateSalesBrainDraft(reply,scope);
 ok('Unknown disclaimer cannot conceal invented mechanism: '+reply,!checked.valid,checked);
}
for(const reply of ['درباره جزئیات کشویی کج اطلاعات کافی ندارم.','مناسب بودن اندازه کشویی بگ دار برای شیشه عطر هنوز مشخص نیست.','ما عندي معلومات كافية عن تفاصيل الجرّارة المائلة.'])ok('Honest knowledge gap remains allowed: '+reply,validateSalesBrainDraft(reply,scope).valid,validateSalesBrainDraft(reply,scope));
const models=['کشویی بگ‌دار','کشویی روبان‌دار','کشویی کج','3 تکه کج'];
ok('Shared drawer head expands exactly three drawers without unrelated slanted model',JSON.stringify(modelMentions('کشویی بگ‌دار، روبان‌دار و کج چه تفاوتی دارن؟',models).slice().sort())===JSON.stringify(models.slice(0,3).sort()),modelMentions('کشویی بگ‌دار، روبان‌دار و کج چه تفاوتی دارن؟',models));
ok('A slanted print is not a second drawer identity',modelMentions('کشویی بگ‌دار و کج بودن چاپ روی آن را توضیح بده',models).join()==='کشویی بگ‌دار',modelMentions('کشویی بگ‌دار و کج بودن چاپ روی آن را توضیح بده',models));
ok('A print orientation choice is not a model comparison',modelMentions('چاپ روی کشویی بگ‌دار صافه یا کج؟',models).join()==='کشویی بگ‌دار',modelMentions('چاپ روی کشویی بگ‌دار صافه یا کج؟',models));
ok('A Persian object marker preserves shorthand identity',modelMentions('کشویی بگ‌دار و کج رو مقایسه کن',models).length===2,modelMentions('کشویی بگ‌دار و کج رو مقایسه کن',models));
ok('An attached Iraqi conjunction preserves shorthand identity',modelMentions('الجرّارة ويا كيس والمائلة، قارنلي الطباعة',['جرّارة مع كيس','جرّارة مائلة']).length===2,modelMentions('الجرّارة ويا كيس والمائلة، قارنلي الطباعة',['جرّارة مع كيس','جرّارة مائلة']));
const knownMechanisms={...scope,authoritativeFacts:[{category:'capability',entity_key:'کشویی کج',values:['کشویی کج از بالا باز می‌شود.']},{category:'capability',entity_key:'جرّارة مائلة',values:['الجرّارة المائلة تنفتح من فوق.']}]};
for(const reply of unsupported.slice(0,4))ok('An approved mechanism beside a gap remains valid: '+reply,validateSalesBrainDraft(reply,knownMechanisms).valid,validateSalesBrainDraft(reply,knownMechanisms));
// Scoped financial topics remain exact controls, while printing/contact prose is free to be authored.
const records=W.q("SELECT * FROM sales_knowledge_facts WHERE status='active' AND authority='owner_approved'");
for(const market of ['IRAN','ARAB']){
 const descriptive=selectApprovedGuidance(records,{market,request:{kind:'information',topics:['lid','contact','bag']}});
 ok(market+': descriptive knowledge supplies no mandatory paragraph',!!descriptive&&!descriptive.protected_parts.length,descriptive);
 const moq={id:'stage2-unit-moq',version:1,domain:'quantity',attribute:'quantity_rule',entity_key:'global',market,status:'active',authority:'owner_approved',value_json:JSON.stringify('حداقل سفارش طبق مدل تأیید می‌شود.')};
 const mixed=selectApprovedGuidance([...records,moq],{market,request:{kind:'information',topics:['bag','moq','timing','shipping_payer','ribbon_printing']}});
 ok(market+': selected commercial topics retain exact protected controls',!!mixed&&mixed.protected_parts.length>0&&mixed.protected_parts.every(p=>mixed.text.includes(p))&&!mixed.protected_parts.some(p=>p.includes('پترن')||p.includes('نقش متكرر')),mixed);
}
// The same unsupported output must be stopped in the final customer path, not only a helper.
for(const [market,reply]of [['IRAN',unsupported[0]],['ARAB',unsupported[2]],['ARAB',unsupported[4]]]){
 const user=await client(market),question=market==='IRAN'?'کشویی کج از کجا باز می‌شود؟':'الجرّارة المائلة منين تنفتح؟';
 W.AI.script.set(question,()=>decision(reply));const start=W.tg.length,result=await W.send(user,question);
 ok(market+': unsupported mechanism held in real Worker path',!sent(user,start).length&&owner(result.row).length===1&&!salesAiFirstReply(result.brain),detail(result));
 observations.push({key:market+' unknown mechanism',kind:'ADVERSARIAL_SCRIPTED_NOT_LIVE',question,provider_reply:reply,final_customer_visible:sent(user,start),owner_cases:owner(result.row).length,...detail(result)});
}
for(const [market,base,reference,detail]of [['IRAN',QUESTIONS.faB,REFERENCES.faB,' درباره آدرس و تلفن زیر لوگو هم بگو.'],['ARAB',QUESTIONS.arB,REFERENCES.arB,' وگلي عن العنوان والهاتف تحت الشعار.']]){
 const user=await client(market),question=base+detail;W.AI.script.set(question,()=>decision(reference));const start=W.tg.length,result=await W.send(user,question);
 ok(market+': an answer omitting the explicit second question is held',!sent(user,start).length&&owner(result.row).length===1,detailResult(result));
 const fragment=reference+(market==='IRAN'?'\nدرباره آدرس و تلفن زیر لوگو.':'\nعن العنوان والهاتف تحت الشعار.');
 W.AI.script.set(question,()=>decision(fragment));const second=await client(market),before=W.tg.length,onlyNames=await W.send(second,question);
 ok(market+': naming the second topic alone is not an answer',!sent(second,before).length&&owner(onlyNames.row).length===1,detailResult(onlyNames));
}
function detailResult(r){return {outcome:r.outcome,validation:r.brain?.validation,rejection:r.brain?.ai_brain?.author_rejection};}
ok('All provider and Telegram traffic remained intercepted',W.offNet().length===0,W.offNet());
if(process.env.PHASE51_STAGE2_EVIDENCE)fs.writeFileSync(process.env.PHASE51_STAGE2_EVIDENCE,JSON.stringify({suite:'phase51_stage2_conversation',live_model_verified:false,assertions,observations},null,2)+'\n');
process.exitCode=report.done()?1:0;
