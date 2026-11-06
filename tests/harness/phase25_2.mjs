// PHASE 25C — the high-risk paths left without a direct test after 25B. Every path has a live control, so a pass means the filter did the work.
// Also: the migration against the code now in Production, the rollback, and every route before the migration exists. Synthetic data only.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase25_2");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const MIG=fs.readFileSync(path.join(REPO,"owner-actions/phase25-delete-system/01-migration.sql"),"utf8"),ROLL=fs.readFileSync(path.join(REPO,"owner-actions/phase25-delete-system/02-rollback.sql"),"utf8");
const ORCH=fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8");
const T=new Date(Date.now()-3600000).toISOString();
const world=async({ai=false,migrate=true}={})=>{const W=await makeWorld({aiBrain:ai?"on":"off",extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on"}});W.d1.db.exec(ORCH);
 for(const p of ["/api/quotes","/api/si/knowledge/product","/api/owner-escalations","/api/leads/outreach","/api/content/pipeline"])await W.call(p,null,"GET");if(migrate)W.d1.db.exec(MIG);
 const rq=(p,b)=>W.run(new Request("https://w.test"+p,{method:"POST",headers:{Authorization:"Bearer tok","Content-Type":"application/json"},body:JSON.stringify(b)})).then(r=>r.json());
 W.del=async b=>{const p=await rq("/api/cleanup/preview",{action:"trash",scope:"ids",...b});return p.token?rq("/api/cleanup/execute",{token:p.token,confirm:p.confirm_phrase||undefined}):p;};
 W.back=async b=>{const p=await rq("/api/cleanup/preview",{action:"restore",scope:"ids",...b});return p.token?rq("/api/cleanup/execute",{token:p.token,confirm:p.confirm_phrase||undefined}):p;};
 W.fact=(r,key,value,extra={})=>{const fc=W.q("SELECT name,\"notnull\" nn,dflt_value d,type FROM pragma_table_info('conversation_memory_facts')").filter(c=>c.nn&&c.d===null),f={id:"f-"+key+"-"+r.id,lead_id:r.l,conversation_id:r.c,source_message_id:r.id,memory_key:key,value_json:value,value_hash:"h"+r.id+key,status:"active",fact_type:key,version:1,created_at:T,...extra};for(const c of fc)if(!(c.name in f))f[c.name]=/INT|REAL/.test(c.type)?0:"x";const k=Object.keys(f);W.dbrun(`INSERT INTO conversation_memory_facts(${k.join(",")}) VALUES(${k.map(()=>"?").join(",")})`,k.map(x=>f[x]));};
 W.first=async(id,text)=>{const u={id,name:"U"+id,username:"u"+id};await W.send(u,text);W.setMarket(u,"iran");const r=W.q("SELECT id,lead_id l,conversation_id c FROM inbox_messages WHERE provider_sender_id=? ORDER BY created_at LIMIT 1",[String(id)])[0];return {u,...r};};
 return W;};
const n=(W,sql,a=[])=>W.q(sql,a)[0].n;

// 1. chat_offer_sent, read through the funnel report
{const W=await world();const mk=async id=>{const c=await W.first(id,"سلام");W.fact(c,"order_candidate",'{"offer_hash":"x"}');W.dbrun("UPDATE lead_outreach SET status='sent',sent_at=? WHERE lead_id=?",[new Date().toISOString(),c.l]);return c;};
 const quoted=async()=>{const r=(await W.call("/api/leads/funnel",null,"GET")).body;return r?.funnel?.reached?.quoted??r?.reached?.quoted??r?.report?.reached?.quoted;};
 const a=await mk(9101);const q1=await quoted();const b=await mk(9102);const q2=await quoted();
 ok("F1 control: a live chat offer counts as quoted",q2===q1+1&&Number.isFinite(q1),{q1,q2});
 await W.del({section:"inbox",ids:[b.id]});ok("F2 chat_offer_sent ignores an offer from a deleted message",await quoted()===q1,await quoted());void a;}

// 2. customer photo reference, in the prompt the model receives
{const W=await world({ai:true});const mk=async(id,obs)=>{const c=await W.first(id,"سلام");W.dbrun("INSERT INTO conversation_customer_media(id,lead_id,conversation_id,inbox_message_id,platform,chat_id,telegram_message_id,update_id,media_type,file_id,file_unique_id,mime_type,analysis_status,observation_json,created_at,updated_at) VALUES(?,?,?,?,'telegram',?,?,?,'photo','f','u'||?,'image/jpeg','analyzed',?,?,?)",["cm"+id,c.l,c.c,c.id,String(id),"1"+id,String(id),id,JSON.stringify({summary:obs,product_type:obs}),new Date().toISOString(),new Date().toISOString()]);return c;};
 const live=await mk(9201,"ZZLIVEPHOTO"),gone=await mk(9202,"ZZGONEPHOTO");
 await W.del({section:"inbox",ids:[gone.id]});
 const turn=async(c,t)=>{const k=W.AI.requests.length;const r=await W.send(c.u,t);return {p:JSON.stringify(W.AI.requests.slice(k).map(x=>x.body)),r};};
 const a=await turn(live,"این مدل چنده؟"),b=await turn(gone,"این مدل چنده؟");
 const ref=c=>W.q("SELECT value_json v FROM conversation_memory_facts WHERE conversation_id=? AND memory_key='customer_image_reference' AND status='active'",[c.c])[0]?.v||"";
 ok("P1 control: a live photo is resolved as the reference",ref(live).includes("cm9201"),ref(live));ok("P2 a deleted photo is not",!ref(gone).includes("cm9202")&&b.p.length>10,ref(gone));
 ok("P3 its observation does not reach the model",!b.p.includes("ZZGONEPHOTO"));}

// 3. background order candidate
{const W=await world();const mk=async id=>{const c=await W.first(id,"قبول است");const cand={offer:{accepted_in:c.id,offer_hash:"oh"+id,product:"p",quantity:100},status:"accepted"};W.dbrun("INSERT INTO owner_decisions(id,status,priority,decision_type,fingerprint,lead_id,conversation_id,question,known_json,created_at,updated_at) VALUES(?,'PENDING','HIGH','ORDER_CANDIDATE_APPROVAL',?,?,?,'q',?,?,?)",["dc"+id,"ORDER_CANDIDATE|"+id,c.l,c.c,JSON.stringify({order_candidate:cand}),T,T]);return c;};
 const live=await mk(9301),gone=await mk(9302);W.dbrun("DELETE FROM lead_outreach WHERE lead_id=?",[gone.l]);
 const d=await W.del({section:"inbox",ids:[gone.id]});ok("O0 the accepted message can be deleted in this fixture",W.q("SELECT status s FROM inbox_messages WHERE id=?",[gone.id])[0].s==="trashed",d);
 const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href+"?o="+Math.random())).default,ws=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},W.env,{waitUntil:p=>ws.push(p)});await Promise.allSettled(ws);
 const touched=id=>n(W,"SELECT COUNT(*) n FROM lead_orders WHERE lead_id=?",[id])+n(W,"SELECT COUNT(*) n FROM system_events WHERE type='chat_order_candidate_failed' AND details_json LIKE ?",["%dc"+(id===live.l?"9301":"9302")+"%"]);
 ok("O1 control: the live acceptance reaches the order path",touched(live.l)>=1,touched(live.l));
 ok("O2 a deleted acceptance makes no order and no attempt",touched(gone.l)===0,touched(gone.l));}

// 4. weak fact
{const W=await world();const mk=async id=>{const c=await W.first(id,"سلام");W.fact(c,"destination",'"تبریز"');return c;};const live=await mk(9401),gone=await mk(9402);
 await W.del({section:"inbox",ids:[gone.id]});const said="ما در شیراز هستیم و جعبه می‌خواهیم";await W.send(live.u,said);await W.send(gone.u,said);
 const dest=c=>W.q("SELECT value_json v FROM conversation_memory_facts WHERE conversation_id=? AND memory_key='destination' AND status='active'",[c.c])[0]?.v;
 ok("K1 control: a weak mention does not replace a live value",dest(live)==='"تبریز"',dest(live));ok("K2 a weak mention fills the value left by a deleted message",dest(gone)==='"شیراز"',dest(gone));}

// 5. media redelivery
{const W=await world();const u={id:9501,name:"M",username:"um"};await W.send(u,"سلام");W.setMarket(u,"iran");
 const photo=(mid,upd)=>({update_id:upd,message:{message_id:mid,date:1,from:{id:u.id,is_bot:false,first_name:"M"},chat:{id:u.id,type:"private"},photo:[{file_id:"ph"+mid,file_unique_id:"uq"+mid,width:400,height:400,file_size:1000}]}});
 await W.post(photo(7001,70001));await W.post(photo(7002,70002));
 const rows=W.q("SELECT id FROM inbox_messages WHERE external_id IN (?,?) ORDER BY external_id",[u.id+":7001",u.id+":7002"]);ok("R0 both photos were stored",rows.length===2);
 const lid=W.q("SELECT lead_id l FROM inbox_messages WHERE id=?",[rows[0].id])[0].l;W.dbrun("UPDATE lead_outreach SET status='sent' WHERE lead_id=?",[lid]);
 await W.del({section:"inbox",ids:[rows[1].id]});W.dbrun("DELETE FROM conversation_customer_media WHERE inbox_message_id IN (?,?)",[rows[0].id,rows[1].id]);
 const tg=W.tg.length;await W.post(photo(7001,70003));await W.post(photo(7002,70004));
 ok("R1 control: redelivery of a live photo records it",n(W,"SELECT COUNT(*) n FROM conversation_customer_media WHERE inbox_message_id=?",[rows[0].id])===1);
 ok("R2 redelivery of a deleted photo records nothing",n(W,"SELECT COUNT(*) n FROM conversation_customer_media WHERE inbox_message_id=?",[rows[1].id])===0);
 ok("R3 and it stays deleted",W.q("SELECT status s FROM inbox_messages WHERE id=?",[rows[1].id])[0].s==="trashed");void tg;}

// 6. pending and scheduled replies, restore
{const W=await world();const c=await W.first(9601,"سلام");const row=W.q("SELECT id,status FROM lead_outreach WHERE inbox_message_id=?",[c.id])[0];
 W.dbrun("UPDATE lead_outreach SET status='draft',approved_at=NULL,approved_by=NULL,sent_at=NULL WHERE inbox_message_id=?",[c.id]);await W.del({section:"inbox",ids:[c.id]});
 const oid=row?.id;const s=await W.call("/api/leads/outreach/send-telegram",{id:oid},"POST"),a=await W.call("/api/leads/outreach/transition",{id:oid,action:"submit"},"POST");
 ok("S1 a reply whose source is deleted cannot be sent or submitted",!!oid&&s.status>=400&&a.status>=400&&W.q("SELECT status s FROM lead_outreach WHERE id=?",[oid])[0].s==="trashed",{s:s.status,a:a.status});
 const tg=W.tg.length;await W.back({section:"inbox",ids:[c.id]});const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href+"?s="+Math.random())).default,ws=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},W.env,{waitUntil:p=>ws.push(p)});await Promise.allSettled(ws);
 const r=W.q("SELECT status s,approved_at a FROM lead_outreach WHERE id=?",[oid])[0];ok("S2 after restore and a cron tick nothing went out",W.tg.length===tg&&r.s==="draft"&&r.a===null,r);
 const c2=await W.first(9602,"سلام");W.dbrun("UPDATE lead_outreach SET status='approved',approved_at=?,approved_by='admin',sent_at=NULL WHERE inbox_message_id=?",[T,c2.id]);
 const p=await W.del({section:"inbox",ids:[c2.id]});ok("S3 a message with an approved reply stays",p.summary?.blocked?.open_reply===1&&W.q("SELECT status s FROM inbox_messages WHERE id=?",[c2.id])[0].s!=="trashed",p);
 const conv=await W.del({section:"conversations",ids:[c2.c]});ok("S4 so does its conversation",conv.summary?.blocked?.open_reply===1,conv);}

// 7. shared references
{const W=await world();const a=await W.first(9701,"سلام");
 const t=new Date().toISOString();W.dbrun("INSERT INTO lead_conversations(id,lead_id,contact_id,platform,provider_conversation_id,provider_sender_id,status,created_at,updated_at) SELECT 'conv2',lead_id,contact_id,'instagram','ig','ig','open',?,? FROM lead_conversations WHERE id=?",[t,t,a.c]);
 W.dbrun("INSERT INTO inbox_messages(id,platform,external_id,sender,message,status,lead_id,conversation_id,created_at,updated_at) VALUES('m2','instagram','ig:1','s','x','new',?,'conv2',?,?)",[a.l,t,t]);
 W.dbrun("UPDATE lead_outreach SET status='sent' WHERE lead_id=?",[a.l]);await W.del({section:"conversations",ids:[a.c]});
 ok("X1 deleting one conversation leaves the same customer's other one",W.q("SELECT status s FROM inbox_messages WHERE id='m2'")[0].s==="new");
 ok("X2 the customer stays",W.q("SELECT stage s FROM leads WHERE id=?",[a.l])[0].s!=="archived");
 const vm=id=>W.dbrun("INSERT INTO visual_product_media(id,source_platform,source_identity,source_media_id,media_type,source_kind,ownership_status,generated_detected,candidate_status,verified_real_product,version,created_at,updated_at) VALUES(?,'telegram',?,?,'photo','owner','owned',0,'verified',1,1,?,?)",[id,"si"+id,"sm"+id,T,T]);vm("v1");
 const b=await W.first(9702,"سلام"),d=await W.first(9703,"سلام"),out=(id,l,s)=>W.dbrun("INSERT INTO lead_outreach(id,lead_id,channel,recipient,message,language,status,created_at,updated_at) VALUES(?,?,'telegram','r','m','Persian',?,?,?)",[id,l,s,T,T]);out("os",b.l,"sent");out("od",d.l,"draft");
 for(const [i,o] of [["1","os"],["2","od"]])W.dbrun("INSERT INTO lead_outreach_media(id,outreach_id,visual_media_id,spec_id,position,created_at) VALUES(?,?,'v1','sp',1,?)",["lm"+i,o,T]);
 const p=await W.del({section:"gallery",ids:["v1"]});ok("X3 one photo shared by two customers stays while either message is open",p.summary?.blocked?.used_in_open_message===1,p);
 W.dbrun("UPDATE lead_outreach SET status='sent' WHERE id='od'");const e=await W.del({section:"gallery",ids:["v1"]});ok("X4 once all are sent it can leave sales, history stays",e.result?.done===1&&n(W,"SELECT COUNT(*) n FROM lead_outreach_media WHERE visual_media_id='v1'")===2,e);}

// 8. every route before the migration exists
{const W=await world({migrate:false});const u={id:9801,name:"N",username:"un"};
 for(const p of ["/api/inbox","/api/leads","/api/leads/outreach","/api/content","/api/calendar","/api/system/events?kind=errors","/api/owner-escalations","/api/si/decisions?status=ALL","/api/autonomy/errors","/api/owner/action-center","/api/final-quotes","/api/content/pipeline"]){const r=await W.call(p,null,"GET");ok("B1 before the migration: "+p,r.status===200,r.status);}
 const r=await W.send(u,"سلام");ok("B2 inbound works before the migration",!!r.row);
 const k=(await W.call("/api/cleanup/items?section=leads",null,"GET"));ok("B3 cleanup answers migration_required",k.status===503&&k.body?.error==="migration_required");
 const before=W.q("SELECT COUNT(*) n FROM system_events WHERE severity='error'")[0].n,WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href+"?b="+Math.random())).default,ws=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},W.env,{waitUntil:p=>ws.push(p)});const res=await Promise.allSettled(ws);
 ok("B4 a cron tick has no failure before the migration",res.every(x=>x.status==="fulfilled")&&W.q("SELECT COUNT(*) n FROM system_events WHERE severity='error'")[0].n===before);
 ok("B5 no cleanup table was created at runtime",W.q("SELECT COUNT(*) n FROM sqlite_master WHERE name IN ('cleanup_trash','cleanup_ops')")[0].n===0);}

// 9. migration and rollback
{const W=await world({migrate:false});const a=await W.first(9901,"سلام");const count=()=>JSON.stringify(W.q("SELECT (SELECT COUNT(*) FROM leads) l,(SELECT COUNT(*) FROM inbox_messages) i,(SELECT COUNT(*) FROM lead_outreach) o"));const c0=count();
 const cols=()=>JSON.stringify(W.q("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'cleanup%' AND name NOT LIKE 'idx_cleanup%' AND name NOT LIKE 'sqlite_%' ORDER BY name"));const s0=cols();
 W.d1.db.exec(MIG);W.d1.db.exec(MIG);ok("G1 the migration can run twice",W.q("SELECT COUNT(*) n FROM sqlite_master WHERE name IN ('cleanup_trash','cleanup_ops')")[0].n===2);
 ok("G2 it changes no existing table or data",cols()===s0&&count()===c0);
 await W.del({section:"inbox",ids:[a.id]});await W.back({section:"inbox",ids:[a.id]});
 W.d1.db.exec(ROLL);ok("G3 rollback removes only its own tables",W.q("SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE '%cleanup%'")[0].n===0&&cols()===s0);
 ok("G4 after rollback the views still work",(await W.call("/api/inbox",null,"GET")).status===200&&(await W.call("/api/system/events?kind=errors",null,"GET")).status===200);}
done();
