// Real Worker approval/send paths on local SQLite and recording Telegram only.
import {makeWorld,reporter} from './harness.mjs';
import {preparePaymentRequest} from '../../worker/src/sales-intelligence.js';
const {ok,done}=reporter('phase51_operational_documents'),W=await makeWorld({aiBrain:'on'});
for(const endpoint of ['/api/quotes','/api/si/knowledge/product','/api/owner-escalations','/api/leads/outreach'])await W.call(endpoint,null,'GET');
await W.call('/api/sales-ai-first',{mode:'on'});W.AI.fallback=()=>W.D({requests:['greeting'],reply:'سلام، در خدمتم.'});
const user={id:9519991,name:'Local operational document',username:'localdoc51'};
await W.send(user,'سلام');W.setMarket(user,'iran');
const incoming=W.q('SELECT * FROM inbox_messages WHERE provider_sender_id=?',[String(user.id)])[0],t=new Date().toISOString();
for(const [key,value]of [['deposit_percent',50],['payment_instructions','بانک تست، صاحب حساب تست']])W.dbrun("INSERT INTO business_settings(id,setting_key,scope_key,value_json,version,status,approved_by,approved_at,created_at) VALUES(?,?,?, ?,1,'current','owner',?,?)",['doc51-'+key,key,'market:IRAN',JSON.stringify(value),t,t]);
W.dbrun("INSERT INTO lead_orders(id,order_number,quote_id,lead_id,conversation_id,product,quantity,currency,unit_price_minor,subtotal_minor,total_minor,status,market,created_at,updated_at) VALUES('doc-order-51','DOC51','doc-quote-51',?,?,'محصول تست',500,'TOMAN',20,10000,10000,'confirmed','IRAN',?,?)",[incoming.lead_id,incoming.conversation_id,t,t]);
const order=W.q("SELECT * FROM lead_orders WHERE id='doc-order-51'")[0],aiCalls=W.AI.requests.length;
const prepared=await preparePaymentRequest(W.env,order),draft=W.q('SELECT * FROM lead_outreach WHERE id=?',[prepared.outreach_id])[0];
ok('Verified engine payment document remains a draft until owner review',prepared.created&&draft?.status==='draft'&&draft?.inbox_message_id===null,prepared);
const unapproved=await W.call('/api/leads/outreach/send-telegram',{id:draft.id});ok('Unapproved operational payment document cannot send',!unapproved.body.ok,unapproved.body);
const submitted=await W.transition(draft.id,'submit'),approved=await W.transition(draft.id,'approve');
ok('Existing owner submit and approve controls remain required',submitted.body.ok&&approved.body.ok,{submitted,approved});
const start=W.tg.length,sent=await W.call('/api/leads/outreach/send-telegram',{id:draft.id});
const messages=W.tg.slice(start).filter(row=>row.method==='sendMessage').map(row=>JSON.parse(row.body)).filter(row=>String(row.chat_id)===String(user.id));
ok('Exact owner-approved payment document reaches recording transport',sent.body.ok&&messages.length===1&&messages[0].text===draft.message,sent.body);
const beforeDuplicate=W.tg.length,duplicate=await W.call('/api/leads/outreach/send-telegram',{id:draft.id});ok('Delivered document is not sent twice',!duplicate.body.ok&&W.tg.length===beforeDuplicate,duplicate.body);
// Local fixture reset of approval state tests a tamper attempt at the final boundary.
W.dbrun("UPDATE lead_outreach SET status='approved',message=? WHERE id=?",[draft.message+'\nیک قیمت خیالی اضافه شده.',draft.id]);
const editedStart=W.tg.length,edited=await W.call('/api/leads/outreach/send-telegram',{id:draft.id});ok('An edited document cannot inherit the operational exception',!edited.body.ok&&W.tg.length===editedStart,edited.body);
W.dbrun("UPDATE lead_outreach SET status='approved',message=? WHERE id=?",[draft.message,draft.id]);W.dbrun("UPDATE business_settings SET status='superseded' WHERE setting_key='deposit_percent'");
W.dbrun("INSERT INTO business_settings(id,setting_key,scope_key,value_json,version,status,approved_by,approved_at,created_at) VALUES('doc51-deposit-v2','deposit_percent','market:IRAN','25',2,'current','owner',?,?)",[t,t]);
const staleStart=W.tg.length,stale=await W.call('/api/leads/outreach/send-telegram',{id:draft.id});ok('Changed approved deposit configuration invalidates old document',!stale.body.ok&&stale.body.reason==='payment_configuration_changed'&&W.tg.length===staleStart,stale.body);
const termsDecision=async(id,pct)=>{
 W.dbrun("INSERT INTO owner_decisions(id,status,decision_type,fingerprint,lead_id,conversation_id,order_id,market,question,payload_json,created_at,updated_at) VALUES(?,'PENDING','PAYMENT_TERMS',?,?,?,'doc-order-51','IRAN','Local terms request',?,?,?)",[id,id,incoming.lead_id,incoming.conversation_id,JSON.stringify({resolution:'record',kind:'deposit_terms',requested_kind:'deposit',requested_percent:pct}),new Date().toISOString(),new Date().toISOString()]);
 return W.call('/api/si/decisions/resolve',{id,action:'APPROVE',answer:{value:pct},scope:'CASE_ONLY',note:'Local owner approval fixture'});
};
const resolution=await termsDecision('doc-terms-51',30),noticeEvent=W.q("SELECT details_json FROM system_events WHERE type='payment_terms_decision_draft_created' AND json_extract(details_json,'$.decision_id')='doc-terms-51'")[0];
const notice=noticeEvent?JSON.parse(noticeEvent.details_json):null;
ok('Owner decision creates an exact fingerprinted terms notice',resolution.body.ok&&notice?.engine_document?.terms_fingerprint,{resolution:resolution.body,notice:!!notice});
if(notice){
 await W.transition(notice.outreach_id,'submit');await W.transition(notice.outreach_id,'approve');
 const noticeSent=await W.call('/api/leads/outreach/send-telegram',{id:notice.outreach_id});ok('Current explicitly approved terms notice remains sendable',noticeSent.body.ok,noticeSent.body);
 const later=await termsDecision('doc-terms-51-later',40);W.dbrun("UPDATE lead_outreach SET status='approved' WHERE id=?",[notice.outreach_id]);
 const outdatedStart=W.tg.length,outdated=await W.call('/api/leads/outreach/send-telegram',{id:notice.outreach_id});
 ok('A later owner terms decision invalidates the old exact notice',later.body.ok&&!outdated.body.ok&&W.tg.length===outdatedStart,{later:later.body.ok,outdated:outdated.body});
}
ok('Document workflow never verifies a payment or calls AI',!W.q('SELECT 1 FROM lead_order_payments').length&&W.AI.requests.length===aiCalls);
const statusQuestion='سفارشم به کجا رسید؟';W.AI.script.set(statusQuestion,ctx=>W.D({requests:['order_status'],reply:ctx.authoring?'این اطلاعات مربوط به پرسش شماست.\n'+ctx.authoring.required_parts.join('\n'):'وضعیت سفارش را بررسی می‌کنم.',interpretation:{primary_intent:'order_status',product_key:null,reference:'current_order',requested_size:null,requested_color:[],requested_structure:null,requested_printing:null,quantity:null,ambiguity:'none',confidence:'high'},semantics:{mode:'order_support',quantity_role:'none',deal_reference:'current',repeat_requested:false},facts:{color_statement:'none',negated_colors:[]}}));
const status=await W.send(user,statusQuestion);ok('Fresh AI status reply retains raw protected identifiers safely',status.outcome?.customer_visible==='reply'&&status.brain?.order_reference?.order_number==='DOC51',{outcome:status.outcome,validation:status.brain?.validation});
if(status.draft){W.dbrun("UPDATE lead_outreach SET status='approved',approved_by='admin' WHERE id=?",[status.draft.id]);W.dbrun("UPDATE lead_orders SET status='paid' WHERE id='doc-order-51'");const oldStart=W.tg.length,old=await W.call('/api/leads/outreach/send-telegram',{id:status.draft.id});ok('Changed order status invalidates a cached conversational status reply',!old.body.ok&&old.body.reason==='commercial_evidence_changed'&&W.tg.length===oldStart,old.body);}
ok('All external calls remain recording mocks',W.offNet().length===0);
process.exitCode=done()?1:0;
