// Original eleven production model decisions replayed through the full worker, with anonymised versioned prior context.
import fs from 'node:fs';
import {makeWorld,reporter} from './harness.mjs';
const {ok,done}=reporter('phase41_conversation_integrity');
const read=n=>JSON.parse(fs.readFileSync(new URL('./fixtures/phase41-'+n+'.json',import.meta.url),'utf8'));
const dialogue=read('dialogue'),catalog=read('catalog'),state=read('state');
const W=await makeWorld({aiBrain:'on',extraEnv:{PUBLIC_WORKER_BASE_URL:'https://w.test',AUTONOMY_ORCHESTRATOR:'on'}});
for(const p of ['agent-orchestrator-stage2b/02-migration-draft.sql','phase25-delete-system/01-migration.sql'])W.d1.db.exec(fs.readFileSync(new URL('../../owner-actions/'+p,import.meta.url),'utf8'));
for(const p of ['/api/quotes','/api/si/knowledge/product','/api/owner-escalations','/api/leads/outreach','/api/content/pipeline'])await W.call(p,null,'GET');
await W.call('/api/sales-ai-first',{mode:'on'});
const insert=(table,row)=>{const k=Object.keys(row);W.dbrun(`INSERT INTO ${table}(${k.join(',')}) VALUES(${k.map(()=>'?').join(',')})`,Object.values(row));};
for(const row of catalog.items)insert('commercial_price_items',row);
for(const row of catalog.settings)insert('business_settings',row);
const user={id:884100001,name:'TEST',username:'replay41'};
const warm=await W.send(user,'سلام');W.setMarket(user,'iran');
const lead=warm.row.lead_id,conversation=warm.row.conversation_id;
// Remove only harness warmup artefacts; reconstruct the prior context from read-only captured rows.
for(const table of ['inbox_messages','lead_outreach','conversation_sales_state'])W.dbrun(`DELETE FROM ${table} WHERE lead_id=?`,[lead]);
W.dbrun("UPDATE conversation_memory_facts SET status='superseded' WHERE lead_id=?",[lead]);
W.dbrun('DELETE FROM system_events');
insert('cleanup_trash',{id:'historical-reset',section:'context',record_id:conversation,op_id:'historical-reset',prior_json:'{}',state:'trashed',deleted_by:'test',deleted_at:state.context_from});
for(const h of state.history){
 const common={id:h.id,lead_id:lead,conversation_id:conversation,message:h.message,created_at:h.created_at,updated_at:h.created_at};
 if(h.direction==='inbound')insert('inbox_messages',{...common,platform:'telegram',external_id:h.id,sender:'test',status:'processed',provider_sender_id:String(user.id),provider_conversation_id:String(user.id)});
 else insert('lead_outreach',{...common,channel:'telegram',recipient:String(user.id),language:'fa',status:'sent',sent_at:h.created_at});
}
for(const f of state.memory)insert('conversation_memory_facts',{id:'seed-'+f.key,lead_id:lead,conversation_id:conversation,memory_key:f.key,fact_type:f.type,value_json:JSON.stringify(f.value),value_hash:'fixture',source_message_id:'historical-1',status:'active',version:f.version,created_at:f.created_at,updated_at:f.created_at});
insert('system_events',{id:'historical-brain',type:'sales_brain_decision',severity:'info',message:'fixture',details_json:JSON.stringify({...state.previous,lead_id:lead,conversation_id:conversation}),created_at:'2026-11-09T19:57:08.600Z'});
const snapshot=()=>JSON.stringify(['commercial_price_items','business_settings','lead_orders','lead_order_payments'].map(t=>[t,W.q(`SELECT * FROM ${t} ORDER BY id`)]));
const before=snapshot(),results=[];
let lastRow;
const expected={0:{price:120000,variant:'3 تکه کج'},2:{price:110000,variant:'2 تکه'},3:{price:110000,variant:'2 تکه'},4:{price:110000,variant:'2 تکه'},8:{price:185000,variant:'کشویی بگ دار'},9:{price:185000,variant:'کشویی بگ دار'},10:{price:185000,variant:'کشویی بگ دار'}};
for(const [n,t] of dialogue.entries()){
 let modelContext;W.AI.script.set(t.message,c=>{modelContext=c;return structuredClone(t.decision);});
 const start=W.tg.length,r=await W.send(user,t.message),sent=W.tg.slice(start).filter(x=>x.method==='sendMessage').map(x=>JSON.parse(x.body)).filter(x=>String(x.chat_id)===String(user.id)).map(x=>x.text).join('\n');
 lastRow=r.row;
 const b=r.brain,result={turn:n+1,input:t.message,sent,action:r.action,outcome:r.outcome,validation:b?.validation,ai_fallback:b?.ai_brain?.fallback,repaired:b?.ai_brain?.repaired,price:b?.sales_agent?.price_snapshot,candidate:b?.sales_agent?.order_candidate,policy:b?.turn_policy,commercial:b?.commercial_evidence,model_context:{recent_count:modelContext?.recent?.length,chars:b?.ai_brain?.context_chars}};results.push(result);
 ok('Recorded turn '+(n+1)+' sends one substantive reply without a hold',r.outcome?.customer_visible==='reply'&&sent.length>0&&!/منظورتون رو کامل نگرفتم/.test(sent),result);
 ok('Recorded turn '+(n+1)+' does not refer to owner or create owner work',b?.needs_owner===false&&W.q('SELECT count(*) n FROM owner_escalations WHERE lead_id=?',[lead])[0].n===0&&!/مالک|مدیر|خبرتون می|بررسی می‌کنم/.test(sent));
 const e=expected[n];if(e){const digits=sent.replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٬,]/g,''),configuration=b?.commercial_evidence?.requirements?.configuration;ok('Recorded turn '+(n+1)+' has the exact current variant and unit price',digits.includes(String(e.price))&&configuration?.replace(/\u200c/g,' ')===e.variant&&b?.sales_agent?.price_snapshot?.unit_price_minor===e.price&&b?.sales_agent?.price_snapshot?.currency==='TOMAN',result);}
 if(n===6||n===7)ok('Recorded turn '+(n+1)+' answers the unavailable variant in catalog scope',/فهرست/.test(sent)&&/20|۲۰/.test(sent)&&/ثبت نشده|نیست/.test(sent),result);
 ok('Recorded turn '+(n+1)+' keeps historical illustrative quantity out of the deal',b?.customer_known_facts?.requested_quantity==null&&b?.sales_agent?.order_candidate?.quantity==null,result);
}
const sentBeforeRedelivery=W.tg.length;
await W.post({update_id:99999,message:{message_id:Number(lastRow.external_id.split(':').at(-1)),date:Math.floor(Date.now()/1000),from:{id:user.id,is_bot:false,first_name:user.name,username:user.username},chat:{id:user.id,type:'private'},text:dialogue.at(-1).message}});
ok('Redelivery of the actual last message does not send twice or revive an old hold',W.tg.length===sentBeforeRedelivery);
ok('Prices, settings, orders and payments are unchanged',snapshot()===before);
ok('Historical reset boundary remains in place',W.q("SELECT deleted_at FROM cleanup_trash WHERE id='historical-reset'")[0].deleted_at===state.context_from);
ok('No real external calls',W.offNet().length===0,W.offNet());
if(process.env.REPLAY_REPORT)fs.writeFileSync(process.env.REPLAY_REPORT,JSON.stringify({source:'original model decisions with reconstructed versioned prior context',results},null,2));
process.exitCode=done()?1:0;
