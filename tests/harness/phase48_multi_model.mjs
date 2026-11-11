import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeWorld,reporter} from './harness.mjs';
const {catalogClaimIssue}=await import(pathToFileURL(path.join(process.env.SRC||new URL('../../worker/src',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),'sales-reply-integrity.js')));
const {ok,done}=reporter('phase48_multi_model');
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
// Phase51: missing sections require another provider-authored, grounded answer.
// This explicit model stub is only an offline contract test, not live AI evidence.
const setScript=W.AI.script.set.bind(W.AI.script);
W.AI.script.set=(question,fn)=>setScript(question,c=>c.authoring?decision({...live[0],reply:authorReply(c)}):fn(c));
function authorReply(c){
 if(c.authoring.required_parts.length)return 'در خدمتم.\n'+c.authoring.required_parts.join('\n');
 if(c.state?.comparison?.clarification_needed)return 'کدام مدل‌ها مدنظرتونه؟';
 const names=c.authoring.requested_models;
 if(!names.length)return c.authoring.decision;
 return names.map(name=>{
  const key=name.replace(/\u200c/g,' '),part=c.knowledge.find(k=>/۲ تکه|2 تکه/.test(k.about)&&k.value==='رویه'),three=c.knowledge.find(k=>/۳ تکه|3 تکه/.test(k.about)&&String(k.value).includes('قسمت بالا، وسط و پایین')),bag=c.knowledge.find(k=>String(k.value).includes('در کشویی بگ'));
  const fact=/^2 تکه$/.test(key)&&part?'بخش ثبت‌شده در اطلاعات تأییدشده: '+part.value+'.':/^3 تکه$/.test(key)&&three?three.value:/بگ/.test(key)&&bag?bag.value:'';
  return '• '+name+': '+fact+((!fact||/^2 تکه$/.test(key))?(c.language==='Iraqi Arabic'?' تفاصيل آلية هذا الموديل مو كاملة بالمعلومات المعتمدة عندي.':' شرح کامل مکانیزم این مدل در اطلاعات فعلی کامل نیست.'):'');
 }).join('\n');
}

const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/phase48-live-comparison.json',import.meta.url)));
let c48,follow;
W.AI.script.set(fixture.message,c=>{c48=c;return decision({...live[0],reply:fixture.partial_reply});});
const firstCallsBefore=W.AI.requests.length;
const first48=await W.send(u,fixture.message);
if(!sent().length)console.log('FIRST_REPLY_FAILURE '+JSON.stringify({validation:first48.brain.validation,authorship:first48.brain.ai_brain.authorship,rejection:first48.brain.ai_brain.author_rejection,outcome:first48.outcome}));
const firstCallsUsed=W.AI.requests.length-firstCallsBefore;
ok('Exact four-model typo request creates four independent comparison identities',c48.state?.comparison?.requested_models?.length===4,c48.state?.comparison);
ok('Diagnostics counts actual four requested construction identities',first48.brain.ai_brain.knowledge_context.comparison_entities===4,first48.brain.ai_brain.knowledge_context);
ok('Final answer covers omitted two-piece and ribbon models without replacing supported answer',sent().at(-1)?.includes('2 تکه')&&/کشویی روبان/.test(sent().at(-1))&&sent().at(-1)?.includes('بگ'),sent().at(-1));
// Seed the historical partial SENT answer in the isolated replay only; never modify Production.
const originalOutreach=W.q('SELECT id FROM lead_outreach WHERE inbox_message_id=?',[first48.brain.source_message_id])[0];
W.dbrun('UPDATE lead_outreach SET message=?,status=? WHERE id=?',[fixture.partial_reply,'sent',originalOutreach.id]);
W.AI.script.set(fixture.followup,c=>{follow=c;const ids=c.state?.comparison?.requested_models||[];return decision({...live[0],reply:ids.length===2?'مدل 2 تکه: در اطلاعات مصوب، رویه به عنوان بخش ثبت شده است؛ شرح کامل مکانیزم را ندارم. مدل کشویی روبان‌دار: شرح اختصاصی مکانیزم روبان در اطلاعات فعلی کامل نیست.':fixture.followup_reply});});
const followCallsBefore=W.AI.requests.length;
const followResult=await W.send(u,fixture.followup);
const followCallsUsed=W.AI.requests.length-followCallsBefore;
ok('Follow-up resolves exactly the two previously unanswered models',follow.state?.comparison?.requested_models?.length===2&&follow.state.comparison.requested_models.some(x=>/2/.test(x))&&follow.state.comparison.requested_models.some(x=>/روبان/.test(x)),follow.state?.comparison);
ok('Follow-up delivers both missing models, not website/old choice',followResult.outcome?.customer_visible==='reply'&&sent().at(-1).includes('2 تکه')&&/کشویی روبان/.test(sent().at(-1))&&!/hamzehibox|نگه داریم/.test(sent().at(-1)),{outcome:followResult.outcome,text:sent().at(-1)});
ok('Isolated mocks make no outbound network calls',W.offNet().length===0);

// Context-driven provider: no section can assert a fact unless the actual request context supplied it.
const grounded=c=>(c.state?.comparison?.requested_models||[]).map(name=>{
  const key=name.replace(/\u200c/g,' ');
  const part=c.knowledge.find(k=>/۲ تکه|2 تکه/.test(k.about)&&k.value==='رویه');
  const three=c.knowledge.find(k=>/۳ تکه|3 تکه/.test(k.about)&&k.value.includes('قسمت بالا، وسط و پایین'));
  const bag=c.knowledge.find(k=>k.value.includes('در کشویی بگ'));
  const fact=/^2 تکه$/.test(key)&&part?'بخش ثبت‌شده در اطلاعات تأییدشده: '+part.value+'.':/^3 تکه$/.test(key)&&three?three.value:/بگ/.test(key)&&bag?bag.value:'';
  return '• '+name+': '+fact+' شرح کامل مکانیزم این مدل در اطلاعات فعلی کامل نیست.';
}).join('\n');
let userId=9480100;
async function client(market='iran'){const v={id:++userId,name:'Compare',username:'compare'+userId};await W.send(v,market==='iraq'?'هلا':'سلام');W.setMarket(v,market);return v;}
const textFor=v=>W.tg.filter(t=>t.method==='sendMessage').map(t=>JSON.parse(t.body)).filter(t=>String(t.chat_id)===String(v.id)).at(-1)?.text||'';
for(const [question,count] of [
 ['دوتکه و سه‌تکه چه فرقی دارن؟',2],
 ['دو تکه و ۳ تکه چه تفاوتی دارند؟',2],
 ['تفاوت کشویی بگ دار و کشویی ربان دار چیست؟',2],
 ['تفاوت دوتیکه، سه تیکه، کشویی بگ‌دار و کشویی روبان‌دار چیست؟',4],
 ['دوتکه، سه‌تکه، سه‌تکه کج، کشویی روبان‌دار، کشویی کج و کشویی بگ‌دار چه تفاوتی دارن؟',6]
]){
 const who=await client();let ctx;W.AI.script.set(question,c=>{ctx=c;return decision({...live[0],reply:grounded(c)||'چه مدلی را می‌خواهید؟'});});
 const callsBefore=W.AI.requests.length;const r=await W.send(who,question);
 ok('Canonical independent construction count '+count+': '+question,ctx.state?.comparison?.requested_models?.length===count,ctx.state?.comparison);
 ok('Every requested model has a final addressed section: '+question,r.outcome?.customer_visible==='reply'&&r.brain.ai_brain.comparison?.unanswered_models.length===0&&r.brain.ai_brain.comparison.addressed_models.length===count,{outcome:r.outcome,reply:textFor(who),comparison:r.brain.ai_brain.comparison});
 ok('At most one final authoring pass; comparison creates no customer choice or order',W.AI.requests.length-callsBefore<=2&&r.brain.ai_brain.authorship?.verified&&!r.brain.sales_agent.order_candidate_written&&!r.brain.customer_known_facts.requested_quantity,{ai:W.AI.requests.length-callsBefore,candidate:r.brain.sales_agent.order_candidate});
 ok('No invented drawer material or mechanism',!/مقوا|مگنت|آهنربا|چوب|چرم|ریل/.test(textFor(who)));
}
const topic=await client();W.AI.script.set(fixture.message,c=>decision({...live[0],reply:grounded(c)}));await W.send(topic,fixture.message);
let green;const greenQ='برای انگشتر سبز چه سایزهایی داری؟';W.AI.script.set(greenQ,c=>{green=c;return decision(live[1]);});const gr=await W.send(topic,greenQ);
ok('New green-ring topic clears comparison projection and answers first time',!green.state?.comparison&&gr.outcome?.customer_visible==='reply'&&/5x5/.test(textFor(topic))&&/6x6/.test(textFor(topic))&&textFor(topic).includes('سبز'),{text:textFor(topic),outcome:gr.outcome});
ok('New topic does not turn comparison into a saved order or model choice',!gr.brain.sales_agent.order_candidate_written&&!W.q('SELECT 1 FROM lead_orders').length);
const fresh=await client();let isolated;W.AI.script.set(fixture.followup,c=>{isolated=c;return decision({...live[0],reply:'کدام مدل‌ها مدنظرتونه؟'});});await W.send(fresh,fixture.followup);
ok('A second customer cannot inherit the comparison',!isolated.state?.comparison);
for(const boundary of ['trashed','unsent','topic','market']){
 const who=await client();const src=await W.send(who,fixture.message);
 const out=W.q('SELECT id FROM lead_outreach WHERE inbox_message_id=?',[src.row.id])[0];
 W.dbrun('UPDATE lead_outreach SET message=? WHERE id=?',[fixture.partial_reply,out.id]);
 if(boundary==='trashed')W.dbrun("UPDATE inbox_messages SET status='trashed' WHERE id=?",[src.row.id]);
 if(boundary==='unsent')W.dbrun("UPDATE lead_outreach SET status='send_ambiguous' WHERE id=?",[out.id]);
 if(boundary==='topic'){W.AI.script.set(greenQ,()=>decision(live[1]));await W.send(who,greenQ);}
 if(boundary==='market'){W.dbrun("UPDATE system_events SET details_json=json_set(details_json,'$.knowledge_market.conversation_market','ARAB') WHERE id=?",['sales-brain:'+src.row.id]);}
 let c;W.AI.script.set(fixture.followup,ctx=>{c=ctx;return decision({...live[0],reply:'کدام مدل‌ها مدنظرتونه؟'});});await W.send(who,fixture.followup);
 ok('Continuity respects '+boundary+' boundary',boundary==='unsent'?c.state?.comparison?.requested_models.length!==2:!c.state?.comparison,c.state?.comparison);
}
const ar=await client('iraq');let arabic;
const aq='شنو الفرق بين 2 قطعة و3 قطعة؟';
W.AI.script.set(aq,c=>{arabic=c;return decision({...live[0],reply:'تفاصيل آلية هالموديلات مو واضحة عندي. أي ميزة تهمك؟'});});await W.send(ar,aq);
ok('Arabic market never receives Iran-only structural facts',arabic.market==='ARAB'&&!arabic.knowledge.some(k=>/مدل ۲|مدل ۳|^۳ تکه/.test(k.about)));
const beforeCalls=W.AI.requests.length,beforeSends=W.tg.length;
const duplicateRow=gr.row;
await W.post({update_id:99999999,message:{message_id:Number(String(duplicateRow.external_id).split(':').at(-1)),date:Math.floor(Date.now()/1000),from:{id:topic.id,is_bot:false,first_name:topic.name,username:topic.username},chat:{id:topic.id,type:'private'},text:greenQ}});
ok('Duplicate webhook makes no extra provider call or send',W.AI.requests.length===beforeCalls&&W.tg.length===beforeSends);
ok('All tests remain isolated without outbound network',W.offNet().length===0);


// Review counterexamples: catalog listings and redirects do not count as explanations.
for(const suffix of ['در فهرست ثبت شده است.','اطلاعاتش در سایت https://www.hamzehibox.com است.']){
 const who=await client();let c;W.AI.script.set(fixture.message,ctx=>{c=ctx;return decision({...live[0],reply:(ctx.state?.comparison?.requested_models||fixture.expected_models).map(n=>'• '+n+': '+suffix).join('\n')});});
 const r=await W.send(who,fixture.message);
 ok('Name/website-only bullets trigger fact completion: '+suffix,!!r.brain.ai_brain.comparison_repair&&textFor(who).includes('رویه')&&r.brain.ai_brain.comparison.unanswered_models.length===0,{text:textFor(who),comparison:r.brain.ai_brain.comparison});
}
const continued=await client();W.AI.script.set(fixture.message,()=>decision({...live[0],reply:fixture.partial_reply}));const cfirst=await W.send(continued,fixture.message);
let cnext;W.AI.script.set(fixture.followup,c=>{cnext=c;return decision({...live[0],reply:grounded(c)});});await W.send(continued,fixture.followup);
ok('New repaired response retains its two model-specific missing-detail references',cnext.state?.comparison?.requested_models?.length===2&&cnext.state.comparison.requested_models.some(n=>/2/.test(n))&&cnext.state.comparison.requested_models.some(n=>/روبان/.test(n)),cnext.state?.comparison);
const courtesy=await client();const csrc=await W.send(courtesy,fixture.message);const co=W.q('SELECT id FROM lead_outreach WHERE inbox_message_id=?',[csrc.row.id])[0];W.dbrun('UPDATE lead_outreach SET message=? WHERE id=?',[fixture.partial_reply,co.id]);
W.AI.script.set('ممنون',()=>decision({...live[0],requests:['thanks'],reply:'خواهش می‌کنم.'}));await W.send(courtesy,'ممنون');let cc;W.AI.script.set(fixture.followup,c=>{cc=c;return decision({...live[0],reply:grounded(c)});});await W.send(courtesy,fixture.followup);
ok('Courtesy preserves prior comparison antecedent',cc.state?.comparison?.requested_models?.length===2,cc.state?.comparison);
const mismatch=await client();const ms=await W.send(mismatch,fixture.message);const mo=W.q('SELECT id FROM lead_outreach WHERE inbox_message_id=?',[ms.row.id])[0];W.dbrun('UPDATE lead_outreach SET message=? WHERE id=?',['• 3 تکه: مشتری می‌تواند رنگ قسمت بالا، وسط و پایین را خودش از بین رنگ‌های موجود انتخاب کند. ',mo.id]);let mc;W.AI.script.set(fixture.followup,c=>{mc=c;return decision({...live[0],reply:fixture.followup_reply});});await W.send(mismatch,fixture.followup);
ok('Two-model reference with three pending models asks a precise clarification',mc.state?.comparison?.clarification_needed===true&&mc.state.comparison.requested_models.length===0&&/کدام مدل/.test(textFor(mismatch))&&!/hamzehibox|نگه داریم/.test(textFor(mismatch)),{context:mc.state?.comparison,reply:textFor(mismatch)});
const resetWho=await client();const rs=await W.send(resetWho,fixture.message);
W.dbrun("UPDATE inbox_messages SET created_at='2000-01-01T00:00:00Z' WHERE id=?",[rs.row.id]);
W.dbrun("UPDATE lead_outreach SET created_at='2000-01-01T00:00:00Z' WHERE inbox_message_id=?",[rs.row.id]);
let rc;W.AI.script.set(fixture.followup,c=>{rc=c;return decision({...live[0],reply:'کدام مدل‌ها مدنظرتونه؟'});});
await W.send(resetWho,greenQ);await W.send(resetWho,fixture.followup);
ok('Expired antecedent cannot override newer topic',!rc.state?.comparison);
const pay=await client();await W.send(pay,fixture.message);
const mixedPay='واریز کردم. اون دو مدل دیگه رو توضیح بده';W.AI.script.set(mixedPay,c=>decision({...live[0],reply:grounded(c)||'کدام مدل‌ها را می‌گویید؟'}));const pr=await W.send(pay,mixedPay);
ok('Late payment claim cannot be replaced by comparison completion',pr.brain.turn_policy?.payment_stage===true&&!pr.brain.ai_brain.comparison_repair&&/payment|owner/.test(pr.brain.next_sales_action),{action:pr.brain.next_sales_action,policy:pr.brain.turn_policy,text:textFor(pay)});
const iraqRows=JSON.parse(fs.readFileSync(new URL('./fixtures/phase44-approved-iraq-rows.json',import.meta.url)));for(const r of iraqRows){const keys=Object.keys(r);W.dbrun('INSERT INTO commercial_price_items('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')',Object.values(r));}
const ar2=await client('iraq');let ar2c;const aq2='شنو الفرق بين قطعتين وثلاث قطع وجرارة مع كيس وجرارة مع شريط؟';W.AI.script.set(aq2,c=>{ar2c=c;return decision({...live[0],reply:(c.state?.comparison?.requested_models||[]).map(n=>'• '+n+': تفاصيل آلية هذا الموديل مو كاملة بالمعلومات المعتمدة عندي.').join('\n')||'تفاصيل الموديلات مو واضحة عندي.'});});const ar2r=await W.send(ar2,aq2);
ok('Arabic comparison independently recognizes its catalog constructions',ar2c.market==='ARAB'&&ar2c.state?.comparison?.requested_models?.length===4,{models:ar2c.state?.comparison,catalog:ar2c.catalog.flatMap(c=>c.models)});
ok('Arabic comparison stays validated and isolated',ar2r.outcome?.customer_visible==='reply'&&!ar2c.knowledge.some(k=>/مدل ۲|مدل ۳|^۳ تکه/.test(k.about)),{outcome:ar2r.outcome,reply:textFor(ar2)});
console.log('PHASE48_METRICS '+JSON.stringify({first_context_chars:JSON.stringify(c48).length,first_models:c48.state?.comparison?.requested_models,followup_models:follow.state?.comparison?.requested_models,original_ai_calls:first48.brain.ai_brain.provider_called,extra_provider_calls:Math.max(0,firstCallsUsed-1)+Math.max(0,followCallsUsed-1),first_provider_calls:firstCallsUsed,followup_provider_calls:followCallsUsed}));


const cumulative=await client();const start=await W.send(cumulative,fixture.message);const so=W.q('SELECT id FROM lead_outreach WHERE inbox_message_id=?',[start.row.id])[0];W.dbrun('UPDATE lead_outreach SET message=? WHERE id=?',[fixture.partial_reply,so.id]);
W.AI.script.set(fixture.followup,c=>decision({...live[0],reply:'• 2 تکه: بخش‌های مستقل مدل ۲ تکه: رویه.\n• کشویی روبان‌دار: شرح اختصاصی این مدل در اطلاعات فعلی کامل نیست.'}));const cumulativeFollow=await W.send(cumulative,fixture.followup);
let lastPending;const one='اون مدل دیگه چی؟';W.AI.script.set(one,c=>{lastPending=c;return decision({...live[0],reply:grounded(c)});});await W.send(cumulative,one);
ok('Cumulative follow-up resolves only last ribbon model, never resurrects answered two-piece',lastPending.state?.comparison?.requested_models?.length===1&&/روبان/.test(lastPending.state.comparison.requested_models[0]),{latest_reply:cumulativeFollow.draft?.message,latest_ai:cumulativeFollow.brain?.ai_brain,replies:W.q("SELECT message FROM lead_outreach WHERE lead_id=?",[start.row.lead_id]).map(x=>x.message).slice(-2),comparison:lastPending.state?.comparison});


const choiceOnly=await client();W.AI.script.set('دوتکه و سه‌تکه چه فرقی دارن؟',c=>decision({...live[0],reply:'• 2 تکه: در فهرست ثبت شده است.\n• 3 تکه: مشتری می‌تواند خودش انتخاب کند.'}));const choiceResult=await W.send(choiceOnly,'دوتکه و سه‌تکه چه فرقی دارن؟');
ok('Choice-only boilerplate cannot satisfy approved three-piece feature coverage',choiceResult.brain.ai_brain.comparison_repair?.missing_models.some(n=>/3/.test(n))&&textFor(choiceOnly).includes('بالا، وسط و پایین'),textFor(choiceOnly));
const slanted=await client();W.AI.script.set('دوتکه و سه‌تکه چه فرقی دارن؟',()=>decision({...live[0],reply:'• 2 تکه: شرح کامل این مدل در اطلاعات فعلی کامل نیست.\n• 3 تکه کج: شرح کامل این مدل در اطلاعات فعلی کامل نیست.'}));const slantResult=await W.send(slanted,'دوتکه و سه‌تکه چه فرقی دارن؟');
ok('Slanted three-piece never satisfies requested plain three-piece',slantResult.brain.ai_brain.comparison_repair?.missing_models.some(n=>/^3 تکه$/.test(n)),{reply:textFor(slanted),repair:slantResult.brain.ai_brain.comparison_repair});
const newTopic=await client();W.AI.script.set(fixture.message,()=>decision({...live[0],reply:fixture.partial_reply}));await W.send(newTopic,fixture.message);let nt;const nq='سؤال دیگه: برای انگشتر سبز چه مدل‌هایی دارید؟';W.AI.script.set(nq,c=>{nt=c;return decision(live[1]);});await W.send(newTopic,nq);
ok('Explicit new family with other-question wording clears comparison',!nt.state?.comparison&&textFor(newTopic).includes('سبز'),nt.state?.comparison);
W.d1.db.exec(fs.readFileSync(new URL('../../owner-actions/phase25-delete-system/01-migration.sql',import.meta.url),'utf8'));
const resetClient=await client();const rsource=await W.send(resetClient,fixture.message);const cutoff=new Date(Date.now()-1000).toISOString();
W.dbrun("UPDATE inbox_messages SET created_at='2000-01-01T00:00:00Z' WHERE id=?",[rsource.row.id]);
W.dbrun("INSERT INTO cleanup_trash(id,section,record_id,op_id,prior_json,state,deleted_by,deleted_at) VALUES(?,?,?,?,?,?,?,?)",['p48reset','context',rsource.row.conversation_id,'p48reset','{}','trashed','test',cutoff]);
let resetCtx;W.AI.script.set(fixture.followup,c=>{resetCtx=c;return decision({...live[0],reply:'کدام مدل‌ها مدنظرتونه؟'});});const resetResult=await W.send(resetClient,fixture.followup);
ok('Real context-reset cutoff excludes prior comparison',resetResult.brain.context_reset===true&&resetResult.brain.context_from===cutoff&&!resetCtx.state?.comparison,{reset:resetResult.brain.context_reset,from:resetResult.brain.context_from,comparison:resetCtx.state?.comparison});
ok('Comparisons never persist selected configuration or color preferences',W.q("SELECT * FROM conversation_memory_facts WHERE lead_id=? AND memory_key IN ('product_interest','requested_size','requested_quantity','selected_colors','color_parts') AND status='active'",[first48.row.lead_id]).length===0);


const paragraph=await client();W.AI.script.set('دوتکه و سه‌تکه چه فرقی دارن؟',()=>decision({...live[0],reply:'2 تکه: شرح کامل این مدل در اطلاعات فعلی کامل نیست. 3 تکه: در فهرست ثبت شده است. 3 تکه کج: شرح کامل این مدل در اطلاعات فعلی کامل نیست.'}));const para=await W.send(paragraph,'دوتکه و سه‌تکه چه فرقی دارن؟');
ok('Unrequested longer model in one paragraph clears prior plain-model scope',para.brain.ai_brain.comparison_repair?.missing_models.some(n=>/^3 تکه$/.test(n)),{repair:para.brain.ai_brain.comparison_repair,comparison:para.brain.ai_brain.comparison});

process.exit(done()?1:0);
