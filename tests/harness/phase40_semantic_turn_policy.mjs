// Full webhook -> interpretation -> memory -> commercial engine -> Telegram (all in-memory mocks).
import fs from 'node:fs';
import {makeWorld,reporter} from './harness.mjs';
import {planSalesTurn,policyAllowsOwner,trustedQuantityProjection} from '../../worker/src/sales-turn-policy.js';
const {ok,done}=reporter('phase40_semantic_turn_policy');
const W=await makeWorld({aiBrain:'on',extraEnv:{PUBLIC_WORKER_BASE_URL:'https://w.test',AUTONOMY_ORCHESTRATOR:'on'}});
W.d1.db.exec(fs.readFileSync(new URL('../../owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql',import.meta.url),'utf8'));
for(const p of ['/api/quotes','/api/si/knowledge/product','/api/owner-escalations','/api/leads/outreach','/api/content/pipeline'])await W.call(p,null,'GET');
await W.call('/api/sales-ai-first',{mode:'on'});
for(const market of ['IRAN','ARAB']){const input={setting_key:'deposit_percent',scope:{market},value:50},p=(await W.call('/api/si/knowledge/setting/preview',{input})).body;const saved=await W.call('/api/si/knowledge/setting',{input,confirm_owner_approved:true,preview_hash:p.preview_hash});if(!saved.body.ok)throw Error('test setting fixture failed');}
const at=new Date().toISOString();
for(const [id,name,market,currency,price] of [['ring','انگشتر کوچک · 5x5 · 3 تکه','IRAN','TOMAN',66000],['s2','سرویس · 20x20 · 2 تکه','IRAN','TOMAN',100000],['s3','سرویس · 20x20 · 3 تکه','IRAN','TOMAN',120000],['s3k','سرویس · 20x20 · 3 تکه کج','IRAN','TOMAN',140000],['ar','علبة خاتم صغيرة · 5x5 · ثلاث قطع','ARAB','USD',60]]){
 W.dbrun('INSERT INTO commercial_price_items(id,product_key,product_name,market,currency,unit_price_minor,version,active,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,1,1,?,?,?,?)',[id,id,name,market,currency,price,'test',at,at,at]);
}
await W.teach('COLOR | مشکی سلفون | IRAN','IRAN','p40-black');
await W.teach('COLOR | طلایی سلفون | IRAN','IRAN','p40-gold');
let uid=887700000;
const i=(intent,o={})=>({primary_intent:intent,product_key:null,reference:'none',requested_size:null,requested_color:[],requested_structure:null,requested_printing:null,quantity:null,ambiguity:'none',confidence:'high',...o});
async function turn(u,text,{reply='حتماً، بفرمایید.',intent='product_info',mode='browse',requests=['product_info'],role='none',ref='none',repeat=false,facts={},interp={},owner=false}={}){
 let ctx;W.AI.script.set(text,c=>{ctx=c;return W.D({reply,requests,interpretation:i(intent,interp),semantics:{mode,quantity_role:role,deal_reference:ref,repeat_requested:repeat},facts:{color_statement:'none',negated_colors:[],...facts},owner_escalation_needed:owner,escalation_reason:owner?'unapproved_terms':null});});
 const k=W.tg.length,r=await W.send(u,text),sent=W.tg.slice(k).filter(x=>x.method==='sendMessage').map(x=>JSON.parse(x.body)).filter(x=>String(x.chat_id)===String(u.id)).map(x=>x.text).join('\n');
 if(!r.brain)console.log('NO_BRAIN',text,W.q("SELECT type,details_json FROM system_events WHERE severity='error' ORDER BY created_at DESC LIMIT 3"));
 return {r,sent,ctx};
}
async function fresh(market='iran'){const u={id:++uid,name:'TEST',username:'policy'+uid};await turn(u,'سلام',{reply:'سلام، چه کمکی از دستم برمیاد؟',intent:'greeting',requests:['greeting']});W.setMarket(u,market);return u;}
const brief=x=>({sent:x.sent,action:x.r.action,reason:x.r.outcome?.reason,pricing:x.r.brain?.sales_agent?.pricing_status,product:x.r.brain?.sales_agent?.product_match,variant:x.r.brain?.sales_agent?.order_candidate?.requirements,policy:x.r.brain?.turn_policy,validation:x.r.brain?.validation,ai_fallback:x.r.brain?.ai_brain?.fallback});
const memory=(r,key)=>W.q("SELECT value_json FROM conversation_memory_facts WHERE lead_id=? AND conversation_id=? AND memory_key=? AND status='active'",[r.brain.lead_id,r.brain.conversation_id,key]).map(x=>JSON.parse(x.value_json));
const cases=r=>W.q('SELECT count(*) n FROM owner_escalations WHERE lead_id=?',[r.brain.lead_id])[0].n;
const noHandoff=x=>x.sent.length>0&&x.r.brain?.needs_owner===false&&!/بررسی می|خبرتون|مالک|مدیر|أراجع|أرجعلك|المسؤول/u.test(x.sent)&&cases(x.r)===0;
{
 const u=await fresh();
 const x=await turn(u,'به نظرت یک جعبه انگشتری لوکس، ترکیب مشکی و طلایی بهتره؟ دلیل انتخابت رو توضیح بده',{reply:'برای حس لوکس، مشکی سلفون کنار طلایی سلفون رو پیشنهاد می‌کنم؛ تضادشون طرح رو واضح‌تر نشون می‌ده.',intent:'color_choice',requests:['color_recommendation'],role:'illustrative',facts:{quantity:1,colors:[],color_statement:'comparison'},interp:{quantity:1}});
 ok('Illustrative numeral even in faulty model quantity never enters purchase memory',noHandoff(x)&&memory(x.r,'requested_quantity').length===0&&memory(x.r,'order_candidate').length===0,brief(x));
 ok('Recommendation is not a customer color selection',memory(x.r,'selected_colors').length===0);
}
{
 const u=await fresh();let x=await turn(u,'یک جعبه انگشتر برای مثال',{reply:'چه ویژگی‌ای براتون مهمه؟',role:'illustrative',facts:{quantity:1}});
 // Seed the exact pre-fix corruption; subsequent audit/fix must not delete or rewrite this historical row.
 W.dbrun("INSERT INTO conversation_memory_facts(id,lead_id,conversation_id,memory_key,fact_type,value_json,value_hash,source_message_id,status,version,created_at,updated_at) VALUES('legacy-q',?,?,'requested_quantity','requested_quantity','1','legacy',?,'active',17,?,?)",[x.r.brain.lead_id,x.r.brain.conversation_id,x.r.row.id,at,at]);
 x=await turn(u,'جعبه سرویس داری؟',{reply:'بله، جعبه سرویس در مدل‌های 2 تکه، 3 تکه و 3 تکه کج در فهرست ما هست.',facts:{product:'سرویس'},interp:{product_key:'list:سرویس'}});
 ok('Actual live service question bypasses stale one-piece MOQ and creates no candidate/case',noHandoff(x)&&x.sent.includes('سرویس')&&!x.sent.includes('حداقل')&&memory(x.r,'order_candidate').length===0,brief(x));
 ok('Read-time projection masks corrupt count in every model input but preserves raw D1',x.ctx.state.quantity===null&&x.ctx.deal?.quantity==null&&x.ctx.commercial_now?.quantity==null&&memory(x.r,'requested_quantity')[0]===1, x.ctx);
 x=await turn(u,'دوتیکه کج چنده؟',{reply:'مدل 2 تکه کج برای سرویس در فهرست نیست؛ منظورتون 2 تکه است یا 3 تکه کج؟',mode:'quote',intent:'price',requests:['price'],interp:{product_key:'list:سرویس',ambiguity:'structure'}});
 ok('Variant clarification is asked once, not appended by old router',noHandoff(x)&&(x.sent.match(/[؟?]/g)||[]).length===1,brief(x));
 x=await turn(u,'۳ تیکه کج',{reply:'مدل 3 تکه کج: {{COMMERCIAL}}',mode:'quote',intent:'price',requests:['price'],role:'component_count',facts:{model:'3 تکه کج'},interp:{product_key:'list:سرویس',requested_structure:'3 تکه کج'}});
 ok('Structure-only price continuation uses current catalog without old quantity',noHandoff(x)&&!/۱ عدد|1 عدد|بررسی/.test(x.sent)&&x.r.brain.customer_known_facts.requested_quantity==null,brief(x));
 x=await turn(u,'میگم سرویس سه تیکه کج داری؟',{reply:'بله، سرویس مدل 3 تکه کج در فهرست ما هست. رنگ دلخواهتون رو هم می‌تونید از سایت انتخاب کنید.',facts:{product:'سرویس',model:'3 تکه کج'},interp:{product_key:'list:سرویس',requested_structure:'3 تکه کج'}});
 ok('New availability question overrides previous price clarification',noHandoff(x)&&x.sent.includes('بله')&&!/حداقل|لازم دارید|قیمت/.test(x.sent),brief(x));
}
for(const [market,text,reply] of [['iran','اگر ۵۰۰ عدد انگشتر سه تکه بخوام چقدر میشه؟','{{COMMERCIAL}}'],['iraq','لو آخذ 500 علبة خاتم ثلاث قطع شكد السعر؟','{{COMMERCIAL}}']]){
 const u=await fresh(market),x=await turn(u,text,{reply,mode:'quote',intent:'price',requests:['price'],role:'quote_only',ref:'new',facts:{quantity:500,product:market==='iran'?'انگشتر کوچک':'علبة خاتم صغيرة'},interp:{quantity:500}});
 ok('Hypothetical quantity computes a quote without purchase commitment '+market,noHandoff(x)&&memory(x.r,'requested_quantity').length===0&&W.q('SELECT count(*) n FROM lead_orders WHERE lead_id=?',[x.r.brain.lead_id])[0].n===0,brief(x));
 const next=await turn(u,market==='iran'?'همان تعداد را حساب کردی؟':'حسبت نفس الكمية؟',{reply:'{{COMMERCIAL}}',mode:'quote',intent:'price',requests:['price'],ref:'current',repeat:true});
 ok('Quote-only count survives a scoped continuation without becoming purchasing memory '+market,next.r.brain.sales_agent.order_candidate?.quantity===500&&memory(next.r,'requested_quantity').length===0&&!/چند عدد|شكد العدد/.test(next.sent),brief(next));
 ok('Explicit repeat request receives the grounded answer, not a holding acknowledgement '+market,next.r.outcome?.customer_visible==='reply'&&/500|۵۰۰/.test(next.sent),brief(next));
}
{
 const u=await fresh();let x=await turn(u,'۳۰۰ عدد انگشتر سه تکه میخوام؛ قیمتش؟',{reply:'{{COMMERCIAL}}',mode:'quote',intent:'price',requests:['price'],role:'order_count',ref:'new',facts:{quantity:300,product:'انگشتر کوچک',model:'3 تکه'},interp:{quantity:300}});
 ok('Explicit purchase quantity is saved with semantic provenance',memory(x.r,'requested_quantity')[0]===300&&x.r.brain.turn_policy.quantity_source?.verified===true,brief(x));
 const other=await turn(u,'جعبه سرویس هم دارید؟',{reply:'بله، جعبه سرویس در فهرست ما هست.',facts:{product:'سرویس'},interp:{product_key:'list:سرویس'}});
 ok('New product prompt contains no previous product quantity, size or deal',other.ctx.state.quantity===null&&other.ctx.state.size===null&&other.ctx.deal===null&&other.ctx.commercial_now.quantity===null,other.ctx);
 x=await turn(u,'فعلاً فقط ظاهرش رو می‌پرسم، سفارش نمی‌دم',{reply:'حتماً، درباره ظاهر جعبه راهنمایی‌تون می‌کنم.',requests:['product_info']});
 ok('Browsing never starts a price or order workflow',noHandoff(x)&&!x.r.brain.sales_agent.order_candidate_written,brief(x));
 x=await turn(u,'بیعانه معمولاً چقدره؟',{reply:'{{COMMERCIAL}}',intent:'payment',requests:['payment']});
 ok('General payment-policy question answers approved percentage without inventing timing',noHandoff(x)&&/50|۵۰/.test(x.sent)&&!x.sent.includes('قبل از ارسال')&&!x.sent.includes('پیش از ارسال'),brief(x));
 x=await turn(u,'زیر حداقل سفارش می‌خوام',{reply:'{{COMMERCIAL}}',mode:'quote',intent:'price',requests:['moq'],owner:true});
 ok('MOQ exception does not create owner work or grant an exception',noHandoff(x),brief(x));
 x=await turn(u,'تخفیف بیشتری بده',{reply:'از مدیر می‌پرسم. {{COMMERCIAL}}',mode:'quote',intent:'negotiate',requests:['discount'],owner:true});
 ok('Unapproved discount gives a truthful boundary without owner referral',noHandoff(x)&&/تخفیف.*نیست/.test(x.sent),brief(x));
}
for(const [market,text]of [['iran','الان می‌خوام برای این سفارش پول واریز کنم؛ حساب بده'],['iraq','هسه أريد أحول فلوس لهذا الطلب، عطيني الحساب']]){
 const u=await fresh(market),x=await turn(u,text,{reply:market==='iran'?'حتماً.':'أكيد.',mode:'pay_ready',intent:'payment',requests:['payment'],ref:'current'});
 ok('Explicit payment readiness retains owner gate despite model owner=false '+market,x.r.brain.turn_policy.may_handoff&&x.r.brain.needs_owner&&cases(x.r)===1,brief(x));
 const again=await turn(u,text+' ؟',{reply:market==='iran'?'حتماً.':'أكيد.',mode:'pay_ready',intent:'payment',requests:['payment'],ref:'current'});
 ok('Repeated readiness reuses one owner case '+market,cases(again.r)===1,brief(again));
 W.dbrun("UPDATE owner_escalations SET status='resolved',owner_decision='test case resolved',resolved_by='test',resolved_at=? WHERE lead_id=?",[at,again.r.brain.lead_id]);
 W.dbrun("UPDATE owner_decisions SET status='RESOLVED' WHERE lead_id=?",[again.r.brain.lead_id]);
 const closed=await turn(u,text+' لطفاً',{reply:market==='iran'?'حتماً.':'أكيد.',mode:'pay_ready',intent:'payment',requests:['payment'],ref:'current'});
 ok('Closed readiness case cannot reopen on repeated message '+market,cases(closed.r)===1&&W.q("SELECT count(*) n FROM owner_decisions WHERE lead_id=? AND status='PENDING'",[closed.r.brain.lead_id])[0].n===0,brief(closed));
 ok('Payment readiness never records money or invents bank details '+market,W.q('SELECT count(*) n FROM lead_order_payments')[0].n===0&&!/[0-9]{10,}/.test(x.sent));
}
{
 const u=await fresh(),x=await turn(u,'واریز کردم',{reply:'پرداخت شما تأیید شد.',mode:'payment_claim',intent:'payment',requests:['payment'],ref:'current'});
 ok('Payment claim remains owner verified even if model invents confirmation',x.r.action==='payment_claim_unmatched'&&cases(x.r)===1&&!x.sent.includes('تأیید شد')&&W.q('SELECT count(*) n FROM lead_order_payments')[0].n===0,brief(x));
}
{
 const u=await fresh();W.AI.fail=true;const x=await turn(u,'لطفاً این مدل رو توضیح بده',{reply:'بله.'});W.AI.fail=false;
 ok('Provider failure produces a visible clarification without fake human follow-up',noHandoff(x),brief(x));
}
{
 const u=await fresh();await turn(u,'برای ۵۰۰ انگشتر سه تکه قیمت بده',{reply:'{{COMMERCIAL}}',mode:'quote',intent:'price',requests:['price'],role:'order_count',facts:{quantity:500,product:'انگشتر کوچک',model:'3 تکه'},interp:{quantity:500},ref:'new'});
 await turn(u,'سرویس هم دارید؟',{reply:'بله، سرویس هم در فهرست ما هست.',facts:{product:'سرویس'},interp:{product_key:'list:سرویس'}});
 const x=await turn(u,'قیمت این آخری چنده؟',{reply:'{{COMMERCIAL}}',mode:'quote',intent:'price',requests:['price'],ref:'new',interp:{product_key:'list:سرویس',requested_structure:'3 تکه کج'}});
 ok('Validated product key drives price even when facts.product is absent',x.r.brain.sales_agent.product_match.product_key==='list:سرویس'&&!x.sent.includes('۶۶')&&x.r.brain.sales_agent.order_candidate?.quantity==null,brief(x));
}
{
 const u=await fresh(),x=await turn(u,'از انگشتر و سرویس جمعاً ۵۰۰ تا می‌خوام، قیمتش؟',{reply:'از هر مدل چند عدد می‌خواید؟',mode:'quote',intent:'price',requests:['price'],role:'order_count',ref:'new',facts:{quantity:500},interp:{product_key:'list:انگشتر کوچک',quantity:500,ambiguity:'quantity'}});
 ok('Ambiguous multi-product total never becomes one product quantity',memory(x.r,'requested_quantity').length===0&&memory(x.r,'order_candidate').length===0,brief(x));
 const next=await turn(u,'اول قیمت انگشتر رو بگو',{reply:'{{COMMERCIAL}}',mode:'quote',intent:'price',requests:['price'],ref:'new',interp:{product_key:'list:انگشتر کوچک'}});
 ok('Subsequent single-product quote cannot reuse ambiguous aggregate',next.r.brain.sales_agent.order_candidate?.quantity==null&&!/۵۰۰|500/.test(next.sent),brief(next));
}
ok('Cached old MOQ cases cannot reopen under payment-only policy',!policyAllowsOwner({ai_first:'on',needs_owner:true,next_sales_action:'moq_owner'}));
for(const pct of [30,0]){
 const u=await fresh(),base=await turn(u,'برای سفارش خودم سؤال دارم',{reply:'بفرمایید.'}),lead=base.r.brain.lead_id,conversation=base.r.brain.conversation_id,id='terms-'+pct;
 W.dbrun("INSERT INTO lead_orders(id,order_number,quote_id,lead_id,conversation_id,product,quantity,currency,total_minor,status,market,created_at,updated_at) VALUES(?,?,?,?,?,'test',300,'TOMAN',10000,'confirmed','IRAN',?,?)",[id,id,id,lead,conversation,at,at]);
 W.dbrun("INSERT INTO owner_decisions(id,status,decision_type,fingerprint,order_id,lead_id,conversation_id,question,payload_json,owner_decision,owner_answer_json,scope_json,resolved_at,created_at,updated_at) VALUES(?,'RESOLVED','PAYMENT_TERMS',?,?,?,?,'test',?,'APPROVE','{}',?,?,?,?)",[id,id,id,lead,conversation,JSON.stringify({kind:'deposit_terms',requested_percent:pct,requested_kind:pct===0?'after_delivery':'deposit'}),JSON.stringify({scope:'CASE_ONLY'}),at,at,at]);
 const x=await turn(u,'بیعانه همین سفارشم چند درصده؟',{reply:'{{COMMERCIAL}}',intent:'payment',requests:['payment'],ref:'current'});
 ok('Case-only deposit override is preserved '+pct,x.r.brain.payment_policy_evidence?.percent===pct&&x.sent.includes(String(pct))&&!x.sent.includes('50')&&noHandoff(x),brief(x));
}
{
 const u=await fresh(),base=await turn(u,'سفارش قبلی دارم',{reply:'بفرمایید.'}),lead=base.r.brain.lead_id,conversation=base.r.brain.conversation_id,id='rejected-order';
 W.dbrun("INSERT INTO lead_orders(id,order_number,quote_id,lead_id,conversation_id,product,quantity,currency,total_minor,status,market,created_at,updated_at) VALUES(?,?,?,?,?,'test',300,'TOMAN',10000,'order_candidate','IRAN',?,?)",[id,id,id,lead,conversation,at,at]);
 W.dbrun("INSERT INTO owner_decisions(id,status,decision_type,fingerprint,order_id,lead_id,conversation_id,question,created_at,updated_at) VALUES(?,'REJECTED','ORDER_CANDIDATE_APPROVAL',?,?,?,?,'test',?,?)",[id,id,id,lead,conversation,at,at]);
 const candidate={candidate_id:id,market:'IRAN',product:{key:'list:انگشتر کوچک',name:'انگشتر',source:'list'},quantity:300,status:'accepted',order_id:id,offer:{offer_hash:'rejected-offer',quantity:300,accepted_in:base.r.row.id},requirements:{configuration:'3 تکه'}};
 W.dbrun("INSERT INTO conversation_memory_facts(id,lead_id,conversation_id,memory_key,fact_type,value_json,value_hash,source_message_id,status,version,created_at,updated_at) VALUES(?,?,?,'order_candidate','order_candidate',?,'test',?,'active',1,?,?)",[id,lead,conversation,JSON.stringify(candidate),base.r.row.id,at,at]);
 const x=await turn(u,'الان برای همین سفارش پول واریز کنم؟',{reply:'حتماً.',mode:'pay_ready',intent:'payment',requests:['payment'],ref:'current'});
 ok('Rejected unchanged order approval never reopens at payment readiness',W.q("SELECT count(*) n FROM owner_decisions WHERE lead_id=? AND status='PENDING'",[lead])[0].n===0&&cases(x.r)===0&&x.r.brain.turn_policy.closed_payment_scope,brief(x));
}
{
 const proposed=await W.call('/api/sales-knowledge/propose',{id:'p40-constraint',operation:'ADD',domain:'knowledge',entity_type:'business',entity_key:'global',attribute:'special_route_constraint',market:'IRAN',value:{schema:'hamzehi.knowledge.v1',kind:'prohibition',priority:50,conditions:[{field:'message',op:'contains',value:'مسیر ویژه'}],keywords:['مسیر ویژه'],labels:{fa:'محدودیت مسیر'},value:'مسیر ویژه نیازمند بررسی مالک است.'}});await W.approveK('p40-constraint');
 const u=await fresh(),x=await turn(u,'برای مسیر ویژه مشکلی نیست؟',{reply:'بله، این مسیر قابل انجامه.',requests:['shipping'],intent:'shipping'});
 ok('Owner-reviewed prohibition cannot be approved by AI or turned into prepayment referral',x.r.action==='policy_constraint'&&!x.sent.includes('قابل انجامه')&&noHandoff(x),{proposed:proposed.status,...brief(x)});
}
ok('No real external calls',W.offNet().length===0,W.offNet());
process.exitCode=done()?1:0;
