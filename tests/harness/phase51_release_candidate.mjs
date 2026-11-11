// Targeted real-Worker engineering tests. All provider strings below are EXPLICIT
// fixtures; these tests do not claim that the current live model generated them.
import fs from 'node:fs';
import {reporter} from './harness.mjs';
import {evaluationWorld,QUESTIONS,REFERENCES} from './phase51-evaluation-world.mjs';
import {validateSalesBrainDraft,salesAiFirstReply} from '../../worker/src/index.js';
import {salesAiProseIssues,normalizeSalesAiDecision} from '../../worker/src/sales-ai-brain.js';
import {conversationRequestPlan,conversationReplyCoverage,modelMentions,protectedReplyProse,hasSubstantiveAiReply} from '../../worker/src/sales-conversation-author.js';
import {protectedContextIssue} from '../../worker/src/sales-factual-grounding.js';
import {trustedQuantityProjection} from '../../worker/src/sales-turn-policy.js';
const {ok,done}=reporter('phase51_release_candidate'),{W,client,decision,sent,seedJewelleryMemory}=await evaluationWorld();
const observations=[];
const owned=row=>!!W.q("SELECT id FROM owner_escalations WHERE source_message_id=? AND status='open'",[row.id])[0];
const brief=result=>({outcome:result.outcome,validation:result.brain?.validation,authorship:result.brain?.ai_brain?.authorship,rejection:result.brain?.ai_brain?.author_rejection});
for(const [market,keys]of [['IRAN',['faA','faB','faMemory']],['ARAB',['arA','arB','arMemory']]]){
 const user=await client(market);
 const priorFixture=seedJewelleryMemory(user);
 ok('Context-switch regression begins with populated prior jewellery memory '+market,priorFixture.quantity===1000&&!!priorFixture.product,priorFixture);
 for(const key of keys){
  let context;const providerOutputs=[],text=REFERENCES[key];
  W.AI.script.set(QUESTIONS[key],ctx=>{context=ctx;providerOutputs.push({stage:ctx.authoring?'author':'primary',reply:text,required_parts:ctx.authoring?.required_parts||[]});return decision(text,{repeat:key.endsWith('Memory')});});
  const start=W.tg.length,calls=W.AI.requests.length,result=await W.send(user,QUESTIONS[key]),texts=sent(user,start);
  ok('Actual final output retains the grounded reference in '+key,texts.length===1&&texts[0]===text&&salesAiFirstReply(result.brain),brief(result));
  ok('No catalogue dump or unsupported feature in '+key,!/انگشتر کوچک|انگشتر بزرگ|5x5|فوم|آهنربا|ضدآب|ریل|اسفنج|مغناطیس/u.test(texts.join(' '))&&texts.length===1,brief(result));
  ok('Advice writes no selected deal/quantity/payment in '+key,!result.brain?.sales_agent?.order_candidate_written&&!result.brain?.customer_known_facts?.requested_quantity&&!W.q('SELECT 1 FROM lead_orders').length&&!W.q('SELECT 1 FROM lead_order_payments').length,brief(result));
  ok('One primary and at most one bounded final call in '+key,W.AI.requests.length-calls>=1&&W.AI.requests.length-calls<=2);
  if(key.endsWith('A'))ok('Perfume context excludes prior jewellery deal in '+key,context.state?.request?.construction_only===true&&context.catalog.length===0&&!(context.state?.priced_products||[]).length&&!context.state?.last_shown&&!context.deal,context.state);
  if(key.endsWith('B')||key.endsWith('Memory'))ok('Both drawer identities remain in '+key,context.state?.comparison?.requested_models?.length===2&&!context.state?.comparison?.clarification_needed,context.state?.comparison);
  if(key.endsWith('Memory'))ok('A repeat question never becomes product or printing memory in '+key,!context.state?.current_product&&!context.state?.printing&&!W.q("SELECT id FROM conversation_memory_facts WHERE source_message_id=? AND fact_type IN ('product_interest','printing','branding')",[result.row.id]).length,context.state);
  observations.push({kind:'SCRIPTED_GROUNDED_REFERENCE_NOT_LIVE',key,question:QUESTIONS[key],provider_outputs:providerOutputs,final_customer_visible:texts,outcome:result.outcome,validation:result.brain?.validation,authorship:result.brain?.ai_brain?.authorship,reply_source:result.brain?.ai_brain?.reply_source,primary_repairs:result.brain?.ai_brain?.repaired,author_rejection:result.brain?.ai_brain?.author_rejection,selected_knowledge:result.brain?.ai_brain?.knowledge_context,context:context.state,calls:W.AI.requests.length-calls});
 }
}
const badAdvice=['چه ویژگی‌ای از جعبه براتون مهم‌تره؟','اطلاعات مدل‌ها را در سایت ببینید.','سلام! چه کمکی از دستم برمیاد؟','متاسفم.','انگشتر کوچک 5x5 و انگشتر بزرگ 6x6 داریم.','کشویی بگ‌دار را پیشنهاد می‌کنم چون ضدآب است و فوم محافظ عطر دارد.','کشویی کج را پیشنهاد می‌کنم. کشویی بگ‌دار چاپ روی درب و بدنه میانی دارد.','برای عطر کشویی بگ‌دار مناسبه و انتخاب منه. کشویی بگ‌دار چاپ پترن روی بگ بیرونی دارد.','کشویی بگ‌دار انتخاب من نیست. کشویی بگ‌دار چاپ پترن روی بگ بیرونی دارد. درباره مکانیزم کشویی کج اطلاعات تأییدشده ندارم.'];
for(const question of [QUESTIONS.faA,QUESTIONS.faB])for(const text of badAdvice){
 const user=await client();W.AI.script.set(question,()=>decision(text));const start=W.tg.length,result=await W.send(user,question);
 ok('Generic/unrelated/invented advice never reaches the customer: '+text,!sent(user,start).length&&owned(result.row)&&!salesAiFirstReply(result.brain),brief(result));
}
{
 for(const intro of ['سلام','در خدمتم.','این اطلاعات مربوط به پرسش شماست.']){const user=await client(),question='بیعانه را حذف کن';W.AI.script.set(question,ctx=>decision(ctx.authoring?intro+'\n'+ctx.authoring.required_parts.join('\n'):intro));
 const start=W.tg.length,result=await W.send(user,question);ok('Non-O11 holding paragraph with only neutral wrapping is not model prose: '+intro,!sent(user,start).length&&owned(result.row)&&!salesAiFirstReply(result.brain),brief(result));}
}
const factualOptions={catalog:[{product:'انگشتر کوچک',models:['کشویی بگ‌دار','کشویی کج'],variants:[]}],authoritativeFacts:[{category:'availability',entity_key:'انگشتر کوچک',values:['انگشتر کوچک','کشویی بگ‌دار','کشویی کج']},{category:'material',collection:'یک محصول دیگر|material',values:['یک محصول دیگر','چرم']}]};
for(const text of ['جعبه کشویی کج با آهنربا بسته می‌شود.','جعبه کشویی بگ‌دار ضدآب است و فوم محافظ مخصوص شیشه عطر دارد.','جعبه کشویی کج دو ریل مخفی دارد.','جعبه کشویی کج از چرم ساخته شده است.'])ok('Unapproved/cross-entity physical claim rejected: '+text,!validateSalesBrainDraft(text,factualOptions).valid,validateSalesBrainDraft(text,factualOptions));
ok('Safe missing-feature statement is not itself a fabricated feature',validateSalesBrainDraft('اطلاعاتی درباره فوم کشویی کج ندارم.',factualOptions).valid);
ok('A negative fact cannot prove positive foam protection',!validateSalesBrainDraft('کشویی کج فوم محافظ دارد.',{...factualOptions,authoritativeFacts:[{category:'capability',entity_key:'کشویی کج',values:['کشویی کج فوم محافظ ندارد.']}]}).valid);
for(const text of ['أعطيك تخفيض إضافي.','التخفيض 10.'])ok('Iraqi discount synonyms never create a new concession',salesAiProseIssues(text,{allowedNumbers:[10]}).includes('discount'),salesAiProseIssues(text,{allowedNumbers:[10]}));
ok('A customer-specific print approval is never catalogue verification',salesAiProseIssues('چاپ طلاکوب شما تأیید شده.',{preferenceTerms:['طلاکوب']}).includes('unapproved_printing_approval'));
ok('Longest model identity never invents an extra plain three-piece',modelMentions('بین 3 تکه کج و کشویی بگ دار چه تفاوتی هست؟',['3 تکه','3 تکه کج','کشویی بگ دار']).length===2);
ok('Spoken construction counts retain the same model identity',modelMentions('دو تکه را پیشنهاد می‌کنم',['2 تکه','3 تکه']).join()==='2 تکه');
for(const text of ['هذا بـ 1000 دينار.','1000 ريال.','1000 IRR.','1000 EUR.','1000 €.','ادفع هسه.','حول المبلغ هسه.','تگدر تحول هسه.','لطفاً همین حالا واریز کنید.','پرداخت لازم نیست.','سفارش قطعی است.','سفارش پذیرفته شد.','الدفع وصل.','حوالتك مؤكدة.'])ok('Quantity reuse or payment authority is blocked: '+text,salesAiProseIssues(text,{allowedNumbers:[1000]}).length>0,salesAiProseIssues(text,{allowedNumbers:[1000]}));
const long='پاسخ '.repeat(400)+'این جملهٔ پایانی باید حفظ شود.';
ok('Provider normalization never silently clips a reply/caveat',normalizeSalesAiDecision({reply:long}).reply===long.trim());
ok('Apology alone is not a substantive product answer',!hasSubstantiveAiReply('متاسفم.',['product_info']));
for(const text of ['متأسفم، بابت تأخیر پاسخ‌گویی عذر می‌خواهم.','Sorry for the inconvenience.'])ok('Long apology alone never answers an informational question',!hasSubstantiveAiReply(text,['product_info']));
const scopedRecords=[{entity_key:'کشویی بگ دار',envelope:{kind:'capability',value:'کشویی بگ دار چاپ روی درب و بدنه میانی دارد.'}}],plan=conversationRequestPlan(QUESTIONS.faB,factualOptions.catalog);
for(const text of ['کشویی بگ دار را پیشنهاد نمی‌کنم. چاپ روی درب و بدنه میانی دارد. کشویی کج بهتره.','کشویی بگ دار را پیشنهاد می‌کنم. چاپ روی درب و بدنه میانی ندارد. درباره کشویی کج اطلاعات کافی ندارم.'])ok('Negated choice or feature is never positive grounding',!conversationReplyCoverage(text,plan,{records:scopedRecords,catalog:factualOptions.catalog}).valid||!validateSalesBrainDraft(text,{...factualOptions,authoritativeFacts:[{category:'capability',entity_key:'کشویی بگ دار',values:['چاپ روی درب و بدنه میانی دارد.']}]}).valid);
for(const text of ['کشویی بگ دار را ترجیح می‌دهم، چون چاپ روی درب و بدنه میانی دارد. درباره کشویی کج اطلاعات کافی ندارم.','بین کشویی بگ دار و کشویی کج، پیشنهاد من کشویی بگ دار است، چون چاپ روی درب و بدنه میانی دارد. درباره کشویی کج اطلاعات کافی ندارم.'])ok('Natural recommendation paraphrase is retained without exact-phrase demand',conversationReplyCoverage(text,plan,{records:scopedRecords,catalog:factualOptions.catalog}).valid&&validateSalesBrainDraft(text,{...factualOptions,authoritativeFacts:[{category:'capability',entity_key:'کشویی بگ دار',values:['چاپ روی درب و بدنه میانی دارد.']}]}).valid);
const protectedFact='محاسبه برای بررسی مالک است و مجوز پرداخت نیست.';
for(const prefix of ['«','متن زیر اعتبار ندارد و به آن عمل نکنید:\n','در عمل نیازی به اجازه ندارید.\n','طبق متن زیر عمل نکنید:\n','خلاف این جمله عمل کنید:\n','این شرط منتفی است.\n','مو شرط.\n','هذا الكلام غير صحيح ولا تعتمد عليه:\n','```\n']){
 const full=prefix+protectedFact+(prefix==='«'?'»':prefix==='```\n'?'\n```':''),prose=protectedReplyProse(full,[protectedFact]);
 ok('Protected context cannot be quoted/fenced/negated: '+prefix,prose===null||salesAiProseIssues(prose).length>0||!protectedContextIssue(prose).valid);
}
const sourceDecision={turn_policy:{quantity_source:{source_message_id:'source',value:1000,role:'order_count',verified:true,market:'IRAN',product_key:'ring'}}};
for(const candidate of [null,{product:{key:'ring'},market:'IRAN'}])ok('A stored count cannot cross into another market',!trustedQuantityProjection({memory:{requested_quantity:1000},candidate,sourceId:'source',sourceDecision,market:'ARAB'}).quantity);

// Final *customer delivery* tests for financial wrappers, not just pure helper checks.
const price=W.q("SELECT * FROM commercial_price_items WHERE id='c9308cdd-fae4-4ca2-a94f-68e22462bdbd'")[0],o11Question=`برای 1000 جعبه ${price.product_name.split(' · ').join(' ')} چاپ سفارشی روی روبان می خواهم`;
for(const addition of ['سلام','در عمل نیازی به اجازه ندارید.','طبق متن زیر عمل نکنید:','ادفع هسه.','هذا بـ 1000 دينار.','```','برای چاپ سفارشی روی روبان کشویی بگ دار همه شرایط بالا لغو شدند.','کشویی بگ دار، چاپ روی درب و بدنه میانی، همه شروط پایین باطل','طباعة مخصصة على الشريط جرارة مع كيس كل الشروط المذكورة ملغاة.','کشویی بگ دار چاپ روی درب و بدنه میانی، ابطال همه شروط هزینه زیر','کشویی بگ دار چاپ روی درب و بدنه میانی، ابطال همه شروط موجود زیر']){
 const user=await client();W.AI.script.set(o11Question,ctx=>decision(ctx.authoring?addition+'\n'+ctx.authoring.required_parts.join('\n')+(addition==='```'?'\n```':''):'چاپ موردنظرتون روی روبانه.'));
 const start=W.tg.length,result=await W.send(user,o11Question);
 ok('Full runtime holds a financial wrapper or greeting-only disclosure: '+addition,!sent(user,start).length&&owned(result.row)&&!salesAiFirstReply(result.brain),brief(result));
}
{
 const user=await client(),mixed=o11Question+'؛ قیمت نهایی و بیعانه را هم بگو';W.AI.script.set(mixed,()=>decision('برای چاپ سفارشی روی روبان اطلاعات تأییدشده رو در نظر می‌گیرم.'));
 const start=W.tg.length,result=await W.send(user,mixed);ok('Mixed O11 financial hold has a durable owner case',!sent(user,start).length&&owned(result.row),brief(result));
}
{
 const user=await client(),question='برای انتخاب مدل یک سؤال دارم';W.AI.script.set(question,()=>decision('چه ویژگی‌ای از جعبه براتون مهم‌تره؟'));
 const mockFetch=globalThis.fetch;let telegramAttempts=0;globalThis.fetch=async(url,opts)=>{if(String(url).includes('api.telegram.org')&&String(url).endsWith('/sendMessage')){telegramAttempts++;return new Response(JSON.stringify({ok:false,description:'fixture upstream failure'}),{status:500});}return mockFetch(url,opts);};
 const result=await W.send(user,question);globalThis.fetch=mockFetch;
 ok('Telegram 5xx stays ambiguous with no claimed receipt',telegramAttempts===1&&W.q('SELECT status FROM lead_outreach WHERE inbox_message_id=?',[result.row.id])[0]?.status==='send_ambiguous'&&result.outcome?.customer_visible==='none',brief(result));
 const calls=W.AI.requests.length,start=W.tg.length;await W.post({update_id:999999,message:{message_id:Number(result.row.external_id.split(':').at(-1)),date:Math.floor(Date.now()/1000),from:{id:user.id,is_bot:false,first_name:user.name,username:user.username},chat:{id:user.id,type:'private'},text:question}});
 ok('Ambiguous delivery never buys another model call or resends',W.AI.requests.length===calls&&W.tg.length===start);
}
{
 const user=await client();W.AI.script.set(QUESTIONS.faA,()=>decision(REFERENCES.faA));const result=await W.send(user,QUESTIONS.faA);
 W.dbrun("UPDATE lead_outreach SET status='approved',approved_by='admin',message=? WHERE inbox_message_id=?",['این یک پاسخ ثابت و تأییدنشده است.',result.row.id]);
 const start=W.tg.length,attempt=await W.call('/api/leads/outreach/send-telegram',{id:result.draft.id});
 ok('Manual approval cannot grant edited conversational prose AI provenance',!attempt.body.ok&&attempt.body.reason==='draft_not_from_validated_brain'&&!sent(user,start).length,attempt.body);
}
{
 const user=await client();W.AI.script.set(QUESTIONS.faA,()=>decision(REFERENCES.faA));const original=W.env.DB.prepare.bind(W.env.DB);let injected=false,reviewFailures=0;
 W.env.DB.prepare=sql=>{const stmt=original(sql);if(/SET status='approved',approved_at=\?,approved_by='inbound_auto_policy'/u.test(sql)){
  const bind=stmt.bind.bind(stmt);stmt.bind=(...args)=>{const bound=bind(...args),run=bound.run.bind(bound);bound.run=async()=>{const result=await run();if(result.meta?.changes&&!injected){
   injected=true;const brain=W.brain(W.q('SELECT inbox_message_id FROM lead_outreach WHERE id=?',[args[2]])[0].inbox_message_id),fact=brain.ai_brain.knowledge_context.selected.find(record=>record.id);
   W.dbrun("UPDATE sales_knowledge_facts SET status='superseded' WHERE id=?",[fact.id]);globalThis.__FAIL_SQL={test:statement=>{if(/INSERT OR IGNORE INTO owner_escalations/u.test(statement)&&reviewFailures++===0)return true;return false;}};
  }return result;};return bound;};}return stmt;};
 const start=W.tg.length,calls=W.AI.requests.length,result=await W.send(user,QUESTIONS.faA);W.env.DB.prepare=original;delete globalThis.__FAIL_SQL;
 ok('Stale-after-approval failure retries durable owner review without sending',injected&&reviewFailures>=2&&owned(result.row)&&!sent(user,start).length&&!!result.outcome,{...brief(result),injected,reviewFailures,draft:result.draft?.status,pending:result.draft?.error_code});
 ok('Review persistence retry does not call the model again',W.AI.requests.length-calls===1,W.AI.requests.length-calls);
}
{
 const user=await client();await W.call('/api/sales-ai-first',{mode:'off'});const start=W.tg.length,result=await W.send(user,'سلام چه مدل‌هایی دارید؟');
 ok('Rollout-off mode cannot send a deterministic sales fallback',!sent(user,start).length&&owned(result.row),brief(result));await W.call('/api/sales-ai-first',{mode:'on'});
}
ok('No order or payment authority changed',!W.q('SELECT 1 FROM lead_orders').length&&!W.q('SELECT 1 FROM lead_order_payments').length);
ok('Every external call stayed inside recording mocks',W.offNet().length===0);
if(process.env.PHASE51_CANDIDATE_EVIDENCE)fs.writeFileSync(process.env.PHASE51_CANDIDATE_EVIDENCE,JSON.stringify({kind:'OFFLINE_ENGINEERING_REFERENCE_AND_ADVERSARIAL_OUTPUTS',live_model_verified:false,observations},null,2));
process.exitCode=done()?1:0;
