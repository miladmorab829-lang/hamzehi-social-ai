// Real local Worker pipeline, local SQLite and recording transport only. No live sends.
import fs from 'node:fs';
import {reporter} from './harness.mjs';
import {evaluationWorld,QUESTIONS,REFERENCES} from './phase51-evaluation-world.mjs';
import {salesAiSingleFlight} from '../../worker/src/sales-memory.js';
import {upsertConversationMemoryFact,retryPendingInboundReviews} from '../../worker/src/index.js';
const report=reporter('phase51_stage2_reliability'),assertions=[],observations=[];
const ok=(label,pass,detail)=>{assertions.push({label,pass:!!pass,...(!pass?{detail}:{})});report.ok(label,pass,detail);};
const {W,client,decision,sent}=await evaluationWorld();
const latch=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
let seq=200000;
const update=(user,text)=>({update_id:++seq,message:{message_id:seq,date:Math.floor(Date.now()/1000),from:{id:user.id,is_bot:false,first_name:user.name,username:user.username},chat:{id:user.id,type:'private'},text}});
const rowFor=up=>W.q('SELECT * FROM inbox_messages WHERE external_id=?',[up.message.chat.id+':'+up.message.message_id])[0];
const outcome=row=>{const r=W.q('SELECT details_json FROM system_events WHERE id=?',['inbound-outcome:'+row.id])[0];return r?JSON.parse(r.details_json):null;};
const owner=row=>W.q("SELECT id FROM owner_escalations WHERE source_message_id=? AND status='open'",[row.id]);
const draft=row=>W.q('SELECT * FROM lead_outreach WHERE inbox_message_id=?',[row.id])[0];
function holdPrimary(question){
 const original=globalThis.fetch,entered=latch(),release=latch();let claimed=false;
 globalThis.fetch=async(url,opts)=>{if(String(url)==='https://api.anthropic.com/v1/messages'){
  const b=JSON.parse(opts.body),ctx=JSON.parse(b.messages[0].content.replace(/^CONTEXT:\n/,''));
  if(ctx.message===question&&!ctx.authoring&&!claimed){claimed=true;entered.resolve();await release.promise;}
 }return original(url,opts);};
 return {entered:entered.promise,release:()=>release.resolve(),restore:()=>globalThis.fetch=original};
}
// Same update concurrently delivered while its provider is running: one inference and one delivery.
{
 const user=await client(),base=W.q('SELECT * FROM inbox_messages WHERE provider_sender_id=?',[String(user.id)])[0],t=Date.now(),sourceIds=['stage2-cas-a','stage2-cas-c','stage2-cas-b'];
 for(const [n,id]of sourceIds.entries())W.dbrun("INSERT INTO inbox_messages(id,platform,external_id,message,status,lead_id,conversation_id,created_at,updated_at) VALUES(?,'telegram',?,'explicit local fixture','new',?,?,?,?)",[id,id,base.lead_id,base.conversation_id,new Date(t+n).toISOString(),new Date(t+n).toISOString()]);
 const args={leadId:base.lead_id,conversationId:base.conversation_id},put=(source,value)=>upsertConversationMemoryFact(W.env,{...args,sourceMessageId:source,fact:{memory_key:'destination',fact_type:'destination',value}});
 await put(sourceIds[0],'تهران');
 const original=W.env.DB.batch.bind(W.env.DB),entered=latch(),release=latch();let blocked=false;
 W.env.DB.batch=async statements=>{if(!blocked&&statements.some(s=>/INSERT INTO conversation_memory_facts/u.test(s.sql)&&s.args[7]===sourceIds[2])){blocked=true;entered.resolve();await release.promise;}return original(statements);};
 const latest=put(sourceIds[2],'تبریز');await entered.promise;await put(sourceIds[1],'شیراز');release.resolve();await latest;W.env.DB.batch=original;
 const active=W.q("SELECT * FROM conversation_memory_facts WHERE conversation_id=? AND memory_key='destination' AND status='active'",[base.conversation_id]);
 ok('A newer memory write losing a stale-read CAS rereads and wins',active.length===1&&active[0].source_message_id===sourceIds[2]&&JSON.parse(active[0].value_json)==='تبریز',active);
}
// Same update concurrently delivered while its provider is running: one inference and one delivery.
{
 const user=await client(),up=update(user,QUESTIONS.faA);W.AI.script.set(QUESTIONS.faA,()=>decision(REFERENCES.faA));
 const start=W.tg.length,calls=W.AI.requests.length,gate=holdPrimary(QUESTIONS.faA),first=W.post(up);await gate.entered;
 const second=W.post(up);gate.release();await Promise.all([first,second]);gate.restore();
 const row=rowFor(up),d=draft(row);
 ok('Concurrent duplicate webhook creates one inbox and draft',W.q('SELECT 1 FROM inbox_messages WHERE external_id=?',[user.id+':'+up.message.message_id]).length===1&&W.q('SELECT 1 FROM lead_outreach WHERE inbox_message_id=?',[row.id]).length===1);
 ok('Concurrent duplicate webhook uses one primary and one exact delivery',W.AI.requests.length-calls===1&&sent(user,start).length===1&&sent(user,start)[0]===REFERENCES.faA,{calls:W.AI.requests.length-calls,status:d?.status});
 ok('Duplicate delivery has a durable correlated receipt',d?.status==='sent'&&String(d.provider_conversation_id)===String(user.id)&&!!d.provider_message_id&&outcome(row)?.customer_visible==='reply',outcome(row));
 observations.push({case:'CONCURRENT_DUPLICATE',status:d?.status,outcome:outcome(row),provider_calls:W.AI.requests.length-calls});
 W.age(20);
}
// Losing a provider lease must never return usable stale success while its replacement runs.
{
 const user=await client(),row=W.q('SELECT * FROM inbox_messages WHERE provider_sender_id=?',[String(user.id)])[0],key='stage2-fence:'+row.id;
 const a=latch(),b=latch(),enteredA=latch(),enteredB=latch();
 const args={key,row,provider:'anthropic',requestedModel:'claude-opus-5-5',leaseMs:6000,waitMs:0};
 const first=salesAiSingleFlight(W.env,{...args,call:async()=>{enteredA.resolve();await a.promise;return {ok:true,model:'claude-opus-5-5',decision:decision(REFERENCES.faA),ms:1};}});await enteredA.promise;
 W.dbrun('UPDATE ai_call_flights SET lease_until=? WHERE flight_key=?',[new Date(Date.now()-10000).toISOString(),key]);
 const second=salesAiSingleFlight(W.env,{...args,call:async()=>{enteredB.resolve();await b.promise;return {ok:true,model:'claude-opus-5-5',decision:decision(REFERENCES.faB),ms:2};}});await enteredB.promise;
 a.resolve();const lost=await first;
 ok('Fenced late provider result is unusable until a winner exists',lost.ok===false&&!lost.decision&&lost.flight?.role==='stale',lost);
 b.resolve();const winner=await second,reuse=await salesAiSingleFlight(W.env,{...args,call:()=>{throw Error('winner must be reused');}});
 ok('Current fence alone records a reusable winning decision',winner.ok&&winner.flight?.role==='owner'&&reuse.ok&&reuse.flight?.role==='reuse'&&reuse.decision.reply===REFERENCES.faB,{winner:winner.flight,reuse:reuse.flight});
 observations.push({case:'STALE_FLIGHT',loser:lost,winner:winner.flight,reuse:reuse.flight});
}
// A later correction completes before an earlier model: old facts must not overwrite its key/state.
{
 const user=await client(),oldQuestion='نامم سارا است؛ برای جعبه انگشتر کوچک سایز 5x5 مدل 2 تکه 1000 عدد می‌خواهم.',newQuestion='تعداد همان جعبه انگشتر کوچک سایز 5x5 مدل 2 تکه را اصلاح می‌کنم: 700 عدد.';
 const reply='انگشتر کوچک مدل 2 تکه در فهرست موجود است.';
 for(const [question,quantity,name]of [[oldQuestion,1000,'سارا'],[newQuestion,700,null]])W.AI.script.set(question,ctx=>W.D({requests:['provide_details'],reply:ctx.authoring?reply+'\n'+ctx.authoring.required_parts.join('\n'):reply,interpretation:{primary_intent:'quantity_change',product_key:ctx.product_keys?.find(p=>p.product==='انگشتر کوچک')?.key||null,reference:'current',requested_size:'5x5',requested_structure:'2 تکه',requested_color:[],requested_printing:null,quantity,ambiguity:'none',confidence:'high'},semantics:{mode:'configure',quantity_role:'order_count',deal_reference:'current',repeat_requested:false},facts:{quantity,customer_name:name,color_statement:'none',negated_colors:[]}}));
 const firstUp=update(user,oldQuestion),secondUp=update(user,newQuestion),gate=holdPrimary(oldQuestion),calls=W.AI.requests.length,start=W.tg.length,first=W.post(firstUp);await gate.entered;
 await W.post(secondUp);const newer=rowFor(secondUp);gate.release();await first;gate.restore();
 const older=rowFor(firstUp),facts=W.q("SELECT memory_key,value_json,source_message_id FROM conversation_memory_facts WHERE conversation_id=? AND status='active' AND memory_key IN ('requested_quantity','order_candidate','customer_name')",[newer.conversation_id]),quantity=facts.find(f=>f.memory_key==='requested_quantity'),name=facts.find(f=>f.memory_key==='customer_name'),candidate=facts.find(f=>f.memory_key==='order_candidate'),state=W.q('SELECT * FROM conversation_sales_state WHERE conversation_id=?',[newer.conversation_id])[0];
 ok('Late earlier turn cannot replace the newer explicit quantity',quantity&&JSON.parse(quantity.value_json)===700&&quantity.source_message_id===newer.id,facts);
 ok('Late earlier turn cannot replace current conversation state',state.source_message_id===newer.id,{state_source:state.source_message_id,expected:newer.id});
 ok('Late earlier turn cannot replace the newer candidate',!candidate||candidate.source_message_id===newer.id&&JSON.parse(candidate.value_json).quantity===700,candidate);
 ok('Independent explicit older customer name is preserved',name&&JSON.parse(name.value_json)==='سارا',name);
 ok('Late superseded turn never sends an obsolete customer reply',draft(older)?.status!=='sent'&&outcome(older)?.customer_visible==='none',{draft:draft(older)?.status,outcome:outcome(older),texts:sent(user,start)});
 ok('Overlap never creates orders, payments or extra retries',!W.q('SELECT 1 FROM lead_orders').length&&!W.q('SELECT 1 FROM lead_order_payments').length&&W.AI.requests.length-calls<=4,{calls:W.AI.requests.length-calls});
 observations.push({case:'OVERLAPPING_CORRECTION',older:older.id,newer:newer.id,facts,state_source:state.source_message_id,outcomes:[outcome(older),outcome(newer)]});
 W.age(20);
}
// Malformed Telegram success cannot create a receipt or relocate the conversation.
{
 const user=await client(),claim='پرداخت کردم',later='ممنون',up=update(user,claim),next=update(user,later),gate=holdPrimary(claim);
 W.AI.script.set(claim,ctx=>W.D({requests:['payment'],reply:ctx.authoring?'برای بررسی پرداخت، نتیجه را مالک تأیید می‌کند.\n'+ctx.authoring.required_parts.join('\n'):'متوجه شدم.',interpretation:{primary_intent:'payment',product_key:null,reference:'current',requested_size:null,requested_structure:null,requested_color:[],quantity:null,ambiguity:'none',confidence:'high'},semantics:{mode:'payment_claim',quantity_role:'none',deal_reference:'current',repeat_requested:false}}));
 W.AI.script.set(later,()=>W.D({requests:['thanks'],reply:'خواهش می‌کنم.',interpretation:{primary_intent:'thanks',reference:'none',ambiguity:'none',confidence:'high'},semantics:{mode:'browse',quantity_role:'none',deal_reference:'none',repeat_requested:false}}));
 const first=W.post(up);await gate.entered;await W.post(next);gate.release();await first;gate.restore();const row=rowFor(up),brain=W.brain(row.id);
 ok('A later courtesy never retires a customer payment-review event',!brain?.superseded_inbound&&owner(row).length===1,{brain_action:brain?.next_sales_action,owner:owner(row),outcome:outcome(row)});
 ok('Overlapping payment claim cannot approve money or create an order',!W.q('SELECT 1 FROM lead_order_payments').length&&!W.q('SELECT 1 FROM lead_orders').length);
 W.age(20);
}
// Malformed Telegram success cannot create a receipt or relocate the conversation.
{
 const user=await client(),old=update(user,QUESTIONS.faA),current=update(user,QUESTIONS.faB);
 W.AI.script.set(QUESTIONS.faA,()=>decision(REFERENCES.faA));W.AI.script.set(QUESTIONS.faB,()=>decision(REFERENCES.faB));
 const start=W.tg.length,gate=holdPrimary(QUESTIONS.faA),first=W.post(old);await gate.entered;await W.post(current);gate.release();await first;gate.restore();
 ok('A late informational reply cannot follow a newer topic reply',sent(user,start).length===1&&sent(user,start)[0]===REFERENCES.faB,{texts:sent(user,start),old:outcome(rowFor(old)),current:outcome(rowFor(current))});
 ok('Superseded informational turn has an explicit durable outcome',outcome(rowFor(old))?.reason==='superseded_inbound'&&outcome(rowFor(old))?.customer_visible==='none',outcome(rowFor(old)));
 W.age(20);
}
{
 const user=await client(),up=update(user,QUESTIONS.faA),gate=holdPrimary(QUESTIONS.faA);W.AI.script.set(QUESTIONS.faA,()=>decision(REFERENCES.faA));
 const start=W.tg.length,calls=W.AI.requests.length,first=W.post(up);await gate.entered;const row=rowFor(up);
 W.dbrun("UPDATE ai_call_flights SET owner_token='fixture-replacement',fence=fence+1,lease_until=? WHERE flight_key=?",[new Date(Date.now()+60000).toISOString(),'inbox:'+row.id+':sales_brain']);
 gate.release();await first;gate.restore();
 ok('Fenced result cannot gain full-pipeline authorship or send',sent(user,start).length===0&&W.brain(row.id)?.ai_brain?.authorship?.verified===false&&owner(row).length===1,{outcome:outcome(row),owner:owner(row)});
 ok('Fenced provider cannot trigger an author retry',W.AI.requests.length-calls===1,W.AI.requests.length-calls);
 W.age(20);
}
// Malformed Telegram success cannot create a receipt or relocate the conversation.
for(const [key,resultFor]of [['WRONG_RECIPIENT',()=>({message_id:778899,chat:{id:990099001,type:'private'}})],['MISSING_IDENTIFIERS',()=>({})],['ZERO_MESSAGE_ID',user=>({message_id:0,chat:{id:user.id,type:'private'}})]]){
 const user=await client(),original=globalThis.fetch;W.AI.script.set(QUESTIONS.faA,()=>decision(REFERENCES.faA));
 globalThis.fetch=async(url,opts)=>{const response=await original(url,opts);if(String(url).endsWith('/sendMessage')&&String(JSON.parse(opts.body).chat_id)===String(user.id))return new Response(JSON.stringify({ok:true,result:resultFor(user)}),{headers:{'Content-Type':'application/json'}});return response;};
 const r=await W.send(user,QUESTIONS.faA);globalThis.fetch=original;const d=draft(r.row);
 ok(key+': no false sent status or success receipt',d?.status==='send_ambiguous'&&!d.provider_message_id&&outcome(r.row)?.customer_visible==='none',{draft:d,outcome:outcome(r.row)});
 ok(key+': no conversation mapping created from uncorrelated receipt',!W.q("SELECT 1 FROM lead_conversations WHERE platform='telegram' AND provider_conversation_id='990099001'").length);
 ok(key+': uncertain delivery has exactly one owner verification case',owner(r.row).length===1,owner(r.row));
 const calls=W.AI.requests.length,attempts=W.tg.length;await W.post({update_id:++seq,message:{message_id:Number(r.row.external_id.split(':').at(-1)),from:{id:user.id,first_name:user.name},chat:{id:user.id,type:'private'},text:QUESTIONS.faA}});
 ok(key+': ambiguous replay never resends or calls AI',W.AI.requests.length===calls&&W.tg.length===attempts);
 observations.push({case:key,status:d?.status,outcome:outcome(r.row)});
}
// A failed turn after a successful turn cannot reuse the prior customer reply.
for(const mode of ['empty','http500','badjson','timeout']){
 const user=await client();W.AI.script.set(QUESTIONS.faA,()=>decision(REFERENCES.faA));await W.send(user,QUESTIONS.faA);
 const question='الان فقط درباره جزئیات چاپ کشویی کج بگو؛ '+mode;W.AI.script.set(question,()=>decision(''));
 if(mode==='timeout')W.AI.delay=1250;else if(mode!=='empty')W.AI.status=mode;
 const start=W.tg.length,calls=W.AI.requests.length,r=await W.send(user,question);W.AI.delay=0;W.AI.status=null;
 ok(mode+': no empty, canned or prior sales reply sent',sent(user,start).length===0&&outcome(r.row)?.customer_visible==='none',outcome(r.row));
 ok(mode+': one durable controlled owner case',owner(r.row).length===1,owner(r.row));
 ok(mode+': failure has bounded calls and a held draft',W.AI.requests.length-calls<=(mode==='empty'?2:1)&&draft(r.row)?.status==='draft',{calls:W.AI.requests.length-calls,draft:draft(r.row)?.status});
 observations.push({case:'PROVIDER_'+mode,outcome:outcome(r.row),owner_cases:owner(r.row).length,provider_calls:W.AI.requests.length-calls});
}
{
 const user=await client();W.AI.script.set(QUESTIONS.faA,()=>decision(REFERENCES.faA));W.TG.mode='reject';const r=await W.send(user,QUESTIONS.faA);W.TG.mode='ok';
 ok('Definitive Telegram rejection has no fabricated receipt',draft(r.row)?.status==='send_failed'&&!draft(r.row)?.provider_message_id&&outcome(r.row)?.customer_visible==='none',{draft:draft(r.row)?.status,outcome:outcome(r.row)});
 ok('Definitive Telegram rejection has one durable owner case',owner(r.row).length===1,owner(r.row));
 const calls=W.AI.requests.length,attempts=W.tg.length;await W.post({update_id:++seq,message:{message_id:Number(r.row.external_id.split(':').at(-1)),from:{id:user.id,first_name:user.name},chat:{id:user.id,type:'private'},text:QUESTIONS.faA}});
 ok('Rejected Telegram delivery replay needs explicit review, no automatic resend',W.AI.requests.length===calls&&W.tg.length===attempts&&owner(r.row).length===1);
}
{
 const user=await client(),question='چاپ روی بگ کشویی بگ دار رو توضیح بده';W.AI.script.set(QUESTIONS.faA,()=>decision(REFERENCES.faA));W.AI.script.set(question,()=>decision(REFERENCES.faA));await W.send(user,QUESTIONS.faA);
 const start=W.tg.length,r=await W.send(user,question);
 ok('Unrequested repeated AI prose never sends twice',sent(user,start).length===0&&outcome(r.row)?.reason==='repetitive_reply',outcome(r.row));
 ok('A suppressed repetitive sales reply has one owner case',owner(r.row).length===1,owner(r.row));
}
// A primary success followed by an author-only failure must also fail closed.
{
 const user=await client();W.AI.script.set(QUESTIONS.faA,()=>decision(REFERENCES.faA));W.TG.mode='throw';
 globalThis.__FAIL_SQL={test:sql=>/INSERT OR IGNORE INTO owner_escalations/u.test(sql)};
 const r=await W.send(user,QUESTIONS.faA);delete globalThis.__FAIL_SQL;W.TG.mode='ok';const pending=draft(r.row);
 ok('Uncertain delivery survives review outage without becoming resendable',pending.status==='send_ambiguous'&&pending.error_code==='owner_review_pending'&&!owner(r.row).length,pending);
 const calls=W.AI.requests.length,attempts=W.tg.length;W.dbrun('UPDATE lead_outreach SET created_at=? WHERE id=?',[new Date(Date.now()-2*3600000).toISOString(),r.draft.id]);const recovery=await retryPendingInboundReviews(W.env,{limit:3});
 ok('Bounded queued retry recovers only owner review even after two hours',recovery.recovered===1&&owner(r.row).length===1&&draft(r.row).status==='send_ambiguous'&&W.AI.requests.length===calls&&W.tg.length===attempts,{recovery,draft:draft(r.row)?.status,owner:owner(r.row),outcome:outcome(r.row)});
 ok('Recovered ambiguous outcome never claims customer success',outcome(r.row)?.customer_visible==='none'&&outcome(r.row)?.review_recovered===true,outcome(r.row));
}
// A primary success followed by an author-only failure must also fail closed.
for(const mode of ['http500','timeout']){
 const user=await client(),question='چاپ کشویی بگ دار را توضیح بده؛ '+mode,original=globalThis.fetch;
 W.AI.script.set(question,ctx=>decision(ctx.authoring?REFERENCES.faB:'سلام'));
 globalThis.fetch=async(url,opts)=>{if(String(url)==='https://api.anthropic.com/v1/messages'){
  const ctx=JSON.parse(JSON.parse(opts.body).messages[0].content.replace(/^CONTEXT:\n/,''));if(ctx.authoring){if(mode==='timeout')W.AI.delay=1250;else W.AI.status=mode;}
 }return original(url,opts);};
 const start=W.tg.length,calls=W.AI.requests.length,r=await W.send(user,question);globalThis.fetch=original;W.AI.delay=0;W.AI.status=null;
 ok('Author-only '+mode+' never sends and has one durable owner case',sent(user,start).length===0&&owner(r.row).length===1&&outcome(r.row)?.customer_visible==='none',{outcome:outcome(r.row),cases:owner(r.row).length});
 ok('Author-only '+mode+' has exactly two bounded provider attempts',W.AI.requests.length-calls===2,W.AI.requests.length-calls);
}
ok('Reliability scenarios preserve order/payment authority',!W.q('SELECT 1 FROM lead_orders').length&&!W.q('SELECT 1 FROM lead_order_payments').length);
{
 const user=await client(),base=W.q('SELECT * FROM inbox_messages WHERE provider_sender_id=?',[String(user.id)])[0],t=new Date().toISOString(),orderId='stage2-pending-payment';
 W.dbrun("INSERT INTO lead_orders(id,order_number,quote_id,lead_id,conversation_id,product,quantity,currency,unit_price_minor,subtotal_minor,total_minor,status,market,created_at,updated_at) VALUES(?,?,?, ?,?,'isolated payment fixture',500,'TOMAN',20,10000,10000,'confirmed','IRAN',?,?)",[orderId,'STAGE2-PAY','stage2-local-quote',base.lead_id,base.conversation_id,t,t]);
 const before=JSON.stringify(W.q('SELECT * FROM lead_orders WHERE id=?',[orderId])[0]),claim='پرداخت کردم',up=update(user,claim),next=update(user,'ممنون'),gate=holdPrimary(claim),first=W.post(up);await gate.entered;await W.post(next);gate.release();await first;gate.restore();
 const row=rowFor(up),reviews=W.q("SELECT id,status,decision_type FROM owner_decisions WHERE order_id=? AND decision_type='PAYMENT_VERIFICATION'",[orderId]);
 ok('A late claim for a confirmed order keeps one pending payment verification',reviews.length===1&&reviews[0].status==='PENDING'&&!W.brain(row.id)?.superseded_inbound,reviews);
 ok('Pending payment verification changes neither order nor payment ledger',JSON.stringify(W.q('SELECT * FROM lead_orders WHERE id=?',[orderId])[0])===before&&!W.q('SELECT 1 FROM lead_order_payments').length);
 observations.push({case:'OVERLAPPING_CONFIRMED_ORDER_PAYMENT_CLAIM',reviews,outcome:outcome(row),order_unchanged:JSON.stringify(W.q('SELECT * FROM lead_orders WHERE id=?',[orderId])[0])===before});
 // A captionless receipt is an independent event even if a later courtesy wins the dialogue.
 const contact=W.q('SELECT contact_id FROM lead_conversations WHERE id=?',[base.conversation_id])[0].contact_id;
 W.dbrun("INSERT INTO lead_outreach(id,lead_id,contact_id,conversation_id,channel,recipient,message,language,status,created_at,updated_at) VALUES('stage2-local-pay-request',?,?,?,'telegram',?,'مبلغ قابل پرداخت طبق سند تأییدشده','Persian','sent',?,?)",[base.lead_id,contact,base.conversation_id,String(user.id),t,t]);
 const receipt=update(user,'');delete receipt.message.text;receipt.message.photo=[{file_id:'stage2-receipt-file',file_unique_id:'stage2-receipt-unique',width:10,height:10,file_size:100}];
 const original=W.env.DB.prepare.bind(W.env.DB),entered=latch(),release=latch();let blocked=false;
 W.env.DB.prepare=sql=>{const stmt=original(sql);if(/FROM inbox_messages i JOIN leads l/u.test(sql)){
  const bind=stmt.bind.bind(stmt);stmt.bind=(...args)=>{const bound=bind(...args),first=bound.first.bind(bound);bound.first=async(...params)=>{const target=W.q('SELECT external_id FROM inbox_messages WHERE id=?',[args[0]])[0];if(!blocked&&target?.external_id===user.id+':'+receipt.message.message_id){blocked=true;entered.resolve();await release.promise;}return first(...params);};return bound;};}return stmt;};
 const pending=W.post(receipt);await entered.promise;await W.post(update(user,'ممنون'));release.resolve();await pending;W.env.DB.prepare=original;
 const receiptRow=rowFor(receipt),merged=W.q("SELECT payload_json,status FROM owner_decisions WHERE order_id=? AND decision_type='PAYMENT_VERIFICATION'",[orderId]);
 ok('A captionless receipt overlapping a courtesy is retained for payment review',!W.brain(receiptRow.id)?.superseded_inbound&&merged.length===1&&merged[0].status==='PENDING'&&merged[0].payload_json.includes(receiptRow.id),{receipt_id:receiptRow.id,brain_action:W.brain(receiptRow.id)?.next_sales_action,merged});
 ok('Receipt evidence never approves the payment ledger or order',JSON.stringify(W.q('SELECT * FROM lead_orders WHERE id=?',[orderId])[0])===before&&!W.q('SELECT 1 FROM lead_order_payments').length);
}
{
 const user=await client();W.AI.script.set(QUESTIONS.faA,()=>decision(REFERENCES.faA));const original=W.env.DB.prepare.bind(W.env.DB);let injected=false;
 W.env.DB.prepare=sql=>{const stmt=original(sql);if(/SET status='approved',approved_at=\?,approved_by='inbound_auto_policy'/u.test(sql)){
  const bind=stmt.bind.bind(stmt);stmt.bind=(...args)=>{const bound=bind(...args),run=bound.run.bind(bound);bound.run=async()=>{const result=await run();if(result.meta?.changes&&!injected){injected=true;const brain=W.brain(W.q('SELECT inbox_message_id FROM lead_outreach WHERE id=?',[args[2]])[0].inbox_message_id),fact=brain.ai_brain.knowledge_context.selected.find(record=>record.id);W.dbrun("UPDATE sales_knowledge_facts SET status='superseded' WHERE id=?",[fact.id]);globalThis.__FAIL_SQL={test:statement=>/INSERT(?: OR IGNORE)?\s+INTO owner_decisions/u.test(statement)};}return result;};return bound;};}return stmt;};
 const start=W.tg.length,r=await W.send(user,QUESTIONS.faA);W.env.DB.prepare=original;delete globalThis.__FAIL_SQL;
 const pending=W.q('SELECT id,reason_code,escalation_key FROM owner_escalations WHERE source_message_id=?',[r.row.id]);
 ok('Partial owner-case persistence retains one logical draft-review identity',injected&&pending.length===1&&draft(r.row)?.error_code==='owner_review_pending',pending);
 const calls=W.AI.requests.length,recovery=await retryPendingInboundReviews(W.env,{limit:5}),cases=W.q('SELECT * FROM owner_escalations WHERE source_message_id=?',[r.row.id]);
 const decisions=W.q('SELECT * FROM owner_decisions WHERE owner_escalation_id=?',[pending[0]?.id||'none']);
 ok('Review recovery completes the original case and one linked decision',recovery.recovered===1&&cases.length===1&&cases[0].id===pending[0]?.id&&decisions.length===1&&decisions[0].status==='PENDING',{recovery,cases:cases.map(c=>({id:c.id,reason:c.reason_code})),decisions:decisions.length});
 ok('Draft review recovery has no customer send or extra model call',W.tg.length===start&&W.AI.requests.length===calls);
}
ok('All traffic stayed inside recording mocks',W.offNet().length===0,W.offNet());
if(process.env.PHASE51_STAGE2_EVIDENCE)fs.writeFileSync(process.env.PHASE51_STAGE2_EVIDENCE,JSON.stringify({suite:'phase51_stage2_reliability',live_model_verified:false,real_telegram_verified:false,assertions,observations},null,2)+'\n');
process.exitCode=report.done()?1:0;
