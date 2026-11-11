// Stage2 media/approval faults with real local gallery and Telegram recording mock.
import fs from 'node:fs';
import {evaluationWorld} from './phase51-evaluation-world.mjs';
import {reporter} from './harness.mjs';
const report=reporter('phase51_stage2_media'),assertions=[],observations=[];
const ok=(label,pass,detail)=>{assertions.push({label,pass:!!pass,...(!pass?{detail}:{})});report.ok(label,pass,detail);};
const {W,client}=await evaluationWorld();
await W.teach('COLOR | مشکی سلفون | IRAN','IRAN','stage2-media-black');
const price=W.q("SELECT * FROM commercial_price_items WHERE product_name='انگشتر کوچک · 5x5 · 2 تکه' AND market='IRAN'")[0];
for(let n=0;n<11;n++)await W.upload({market:'IRAN',product_key:price.product_key,pieces:2,lid_color:'مشکی سلفون',base_color:'مشکی سلفون'});
const users=[await client(),await client(),await client()],question='عکس انگشتر کوچک سایز 5x5 مدل 2 تکه را بفرست';
W.AI.script.set(question,ctx=>W.D({requests:['product_info'],reply:ctx.authoring?'انگشتر کوچک مدل 2 تکه در فهرست موجود است.\n'+ctx.authoring.required_parts.join('\n'):'عکس همین مدل را می‌فرستم.',interpretation:{primary_intent:'see_photo',product_key:ctx.product_keys?.find(p=>p.product==='انگشتر کوچک')?.key||null,reference:'none',requested_size:'5x5',requested_structure:'2 تکه',requested_color:[],requested_printing:null,quantity:null,ambiguity:'none',confidence:'high'},semantics:{mode:'browse',quantity_role:'none',deal_reference:'none',repeat_requested:false},facts:{product:'انگشتر کوچک',model:'2 تکه',size:'5x5',color_statement:'none',negated_colors:[]}}));
const media=start=>W.tg.slice(start).filter(c=>['sendMediaGroup','sendPhoto'].includes(c.method));
const owner=row=>W.q("SELECT id FROM owner_escalations WHERE source_message_id=? AND status='open'",[row.id]);
let start=W.tg.length;const held=await W.send(users[0],question);
ok('Photo authority off prevents all album sends',media(start).length===0&&held.outcome?.customer_visible==='none',held.outcome);
await W.call('/api/sales-autonomy/policy',{capability:'photo_album',mode:'live',photo_album_pilot_chat_ids:users.slice(1).map(u=>String(u.id))});
for(const [user,mode]of [[users[1],'second_album_rejected'],[users[2],'child_lookup_failure']]){
 let count=0,injected=false;
 W.TG.before=async method=>{if(['sendMediaGroup','sendPhoto'].includes(method)&&++count===2&&mode==='second_album_rejected')return 'reject';};
 W.TG.after=async method=>{if(['sendMediaGroup','sendPhoto'].includes(method)&&count===1&&mode==='child_lookup_failure'&&!injected){injected=true;globalThis.__FAIL_SQL={test:sql=>{if(/SELECT \* FROM lead_outreach WHERE id=\? AND lead_id=\? AND conversation_id=\? LIMIT 1/u.test(sql)){delete globalThis.__FAIL_SQL;return true;}return false;}};}};
 start=W.tg.length;const result=await W.send(user,question);W.TG.before=null;W.TG.after=null;delete globalThis.__FAIL_SQL;
 const parent=W.q('SELECT * FROM lead_outreach WHERE id=?',[result.draft.id])[0],children=W.q("SELECT o.id,o.status,o.error_code FROM lead_outreach o JOIN system_events e ON json_extract(e.details_json,'$.outreach_id')=o.id WHERE e.type='gallery_album_draft_created' AND json_extract(e.details_json,'$.first_outreach_id')=?",[parent.id]);
 ok(mode+': the first album receipt remains durable',parent.status==='sent'&&!!parent.provider_message_id,parent.status);
 ok(mode+': no false claim that every album completed',result.outcome?.reason==='gallery_delivery_incomplete',result.outcome);
 ok(mode+': remaining photos have one durable owner case',owner(result.row).length===1,{cases:owner(result.row),children});
 ok(mode+': only bounded attempted media calls',media(start).length===(mode==='second_album_rejected'?2:1),media(start).map(c=>c.method));
 const calls=W.AI.requests.length,attempts=W.tg.length;
 await W.post({update_id:700000+Number(user.id),message:{message_id:Number(result.row.external_id.split(':').at(-1)),from:{id:user.id,first_name:user.name},chat:{id:user.id,type:'private'},text:question}});
 ok(mode+': duplicate replay never resends the first album',W.tg.length===attempts&&W.AI.requests.length===calls,{before:attempts,after:W.tg.length});
 ok(mode+': review remains deduplicated after replay',owner(result.row).length===1,owner(result.row));
 observations.push({case:mode,kind:'RECORDING_MEDIA_NOT_LIVE',parent_status:parent.status,parent_receipt:parent.provider_message_id,children,outcome:result.outcome,owner_cases:owner(result.row).length,media_attempts:media(start).map(c=>c.method)});
}
ok('Media failures create no orders or payments',!W.q('SELECT 1 FROM lead_orders').length&&!W.q('SELECT 1 FROM lead_order_payments').length);
{
 const user=await client();await W.call('/api/sales-autonomy/policy',{capability:'photo_album',mode:'live',photo_album_pilot_chat_ids:[String(user.id)]});let count=0;
 W.TG.before=async method=>{if(['sendMediaGroup','sendPhoto'].includes(method)&&++count===2)return 'reject';};
 globalThis.__FAIL_SQL={test:sql=>/INSERT OR IGNORE INTO owner_escalations/u.test(sql)};
 const r=await W.send(user,question);W.TG.before=null;delete globalThis.__FAIL_SQL;const parent=W.q('SELECT * FROM lead_outreach WHERE id=?',[r.draft.id])[0];
 ok('Partial delivery preserves sent receipt during owner-case outage',parent.status==='sent'&&!!parent.provider_message_id&&parent.error_code==='owner_review_pending'&&!owner(r.row).length,parent.status);
 const calls=W.AI.requests.length,attempts=W.tg.length;await W.post({update_id:888888,message:{message_id:Number(r.row.external_id.split(':').at(-1)),from:{id:user.id,first_name:user.name},chat:{id:user.id,type:'private'},text:question}});
 const recovered=W.q('SELECT * FROM lead_outreach WHERE id=?',[parent.id])[0],event=W.q('SELECT details_json FROM system_events WHERE id=?',['inbound-outcome:'+r.row.id])[0],outcome=event&&JSON.parse(event.details_json);
 ok('Partial delivery retry recovers owner case without any media/model call',owner(r.row).length===1&&recovered.status==='sent'&&recovered.provider_message_id===parent.provider_message_id&&W.AI.requests.length===calls&&W.tg.length===attempts,{status:recovered.status,owner:owner(r.row)});
 ok('Recovered partial outcome retains its incomplete-delivery reason',outcome?.customer_visible==='reply'&&outcome?.reason==='gallery_delivery_incomplete'&&outcome?.review_recovered===true,outcome);
}
ok('Every request remains in recording mocks',W.offNet().length===0,W.offNet());
if(process.env.PHASE51_STAGE2_EVIDENCE)fs.writeFileSync(process.env.PHASE51_STAGE2_EVIDENCE,JSON.stringify({suite:'phase51_stage2_media',live_model_verified:false,real_telegram_verified:false,assertions,observations},null,2)+'\n');
process.exitCode=report.done()?1:0;
