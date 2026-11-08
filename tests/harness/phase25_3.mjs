// PHASE 25D — blocked test data. An open escalation can be set aside as a test artifact without any decision being recorded.
// Every behaviour has a live control, so a pass means the new filter or guard did the work. Synthetic data only.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase25_3");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const MIG=fs.readFileSync(path.join(REPO,"owner-actions/phase25-delete-system/01-migration.sql"),"utf8");
const ORCH=fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8");
const OLD=new Date(Date.now()-30*86400000).toISOString();
const world=async({ai=false}={})=>{const W=await makeWorld({aiBrain:ai?"on":"off",extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on"}});W.d1.db.exec(ORCH);
 for(const p of ["/api/quotes","/api/si/knowledge/product","/api/owner-escalations","/api/leads/outreach","/api/content/pipeline"])await W.call(p,null,"GET");W.d1.db.exec(MIG);
 W.rq=(p,b)=>W.run(new Request("https://w.test"+p,{method:"POST",headers:{Authorization:"Bearer tok","Content-Type":"application/json"},body:JSON.stringify(b)})).then(async r=>({status:r.status,...await r.json()}));
 W.pv=b=>W.rq("/api/cleanup/preview",{action:"trash",scope:"ids",...b});
 W.ex=p=>W.rq("/api/cleanup/execute",{token:p.token,confirm:p.confirm_phrase||undefined});
 W.del=async b=>{const p=await W.pv(b);return p.token?W.ex(p):p;};
 W.back=async b=>{const p=await W.pv({action:"restore",...b});return p.token?W.ex(p):p;};
 W.archive=ids=>W.del({section:"escalations",ids,test_artifact:true});
 // an old conversation: one customer message, aged past the quiet window
 W.old=async(id,text="سلام")=>{const u={id,name:"U"+id,username:"u"+id};await W.send(u,text);W.setMarket(u,"iran");const r=W.q("SELECT id,lead_id l,conversation_id c FROM inbox_messages WHERE provider_sender_id=? ORDER BY created_at LIMIT 1",[String(id)])[0];
  W.dbrun("UPDATE inbox_messages SET created_at=? WHERE lead_id=?",[OLD,r.l]);W.dbrun("UPDATE lead_outreach SET status='sent',sent_at=? WHERE lead_id=?",[OLD,r.l]);return {...r,u};};
 W.esc=(r,sfx="",reason="missing_business_knowledge")=>{const id="esc"+r.id+sfx,dec="dec"+r.id+sfx,t=OLD;
  W.dbrun("INSERT INTO owner_escalations(id,escalation_key,lead_id,conversation_id,channel,source_message_id,sales_brain_event_id,context_summary,unresolved_question,reason_code,decision_required,status,version,created_at,updated_at) VALUES(?,?,?,?,'telegram',?,?,'ctx','q',?,'answer','open',1,?,?)",[id,"k"+id,r.l,r.c,r.id,"sb"+id,reason,t,t]);
  W.dbrun("INSERT INTO owner_decisions(id,status,priority,decision_type,fingerprint,lead_id,conversation_id,owner_escalation_id,question,created_at,updated_at) VALUES(?,'PENDING',20,'ESCALATION_MISSING_BUSINESS_KNOWLEDGE',?,?,?,?,'q',?,?)",[dec,"ESCALATION|"+id,r.l,r.c,id,t,t]);return {id,dec};};
 W.fact=(r,key,value,extra={})=>{const fc=W.q("SELECT name,\"notnull\" nn,dflt_value d,type FROM pragma_table_info('conversation_memory_facts')").filter(c=>c.nn&&c.d===null),f={id:"f-"+key+"-"+r.id,lead_id:r.l,conversation_id:r.c,source_message_id:r.id,memory_key:key,value_json:value,value_hash:"h"+r.id+key,status:"active",fact_type:key,version:1,created_at:OLD,...extra};for(const c of fc)if(!(c.name in f))f[c.name]=/INT|REAL/.test(c.type)?0:"x";const k=Object.keys(f);W.dbrun(`INSERT INTO conversation_memory_facts(${k.join(",")}) VALUES(${k.map(()=>"?").join(",")})`,k.map(x=>f[x]));};
 W.order=(r,status,sfx="o")=>{const cols=W.q("SELECT name,\"notnull\" nn,dflt_value d,type FROM pragma_table_info('lead_orders')").filter(c=>c.nn&&c.d===null),o={id:"ord"+r.id+sfx,lead_id:r.l,conversation_id:r.c,status,acceptance_inbox_message_id:r.id,created_at:OLD,updated_at:OLD};for(const c of cols)if(!(c.name in o))o[c.name]=/INT|REAL/.test(c.type)?1:"x"+r.id+sfx;const k=Object.keys(o);W.dbrun(`INSERT INTO lead_orders(${k.join(",")}) VALUES(${k.map(()=>"?").join(",")})`,k.map(x=>o[x]));return o.id;};
 W.out=(r,o)=>{const cols=W.q("SELECT name,\"notnull\" nn,dflt_value d,type FROM pragma_table_info('lead_outreach')").filter(c=>c.nn&&c.d===null),x={lead_id:r.l,conversation_id:r.c,recipient:String(r.u.id),created_at:OLD,updated_at:OLD,...o};for(const c of cols)if(!(c.name in x))x[c.name]=/INT|REAL/.test(c.type)?0:c.name==="language"?"fa":"x";const k=Object.keys(x);W.dbrun(`INSERT INTO lead_outreach(${k.join(",")}) VALUES(${k.map(()=>"?").join(",")})`,k.map(y=>x[y]));};
 return W;};
const n=(W,sql,a=[])=>W.q(sql,a)[0].n;
const snap=(W,t,id)=>JSON.stringify(W.q(`SELECT * FROM ${t} WHERE id=?`,[id]));
const tick=async W=>{const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href+"?t="+Math.random())).default,ws=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},W.env,{waitUntil:p=>ws.push(p)});await Promise.allSettled(ws);};

// 1. escalation-linked message
{const W=await world();const r=await W.old(9001),keep=await W.old(9002);const e=W.esc(r),k=W.esc(keep);
 const se=snap(W,"owner_escalations",e.id),sd=snap(W,"owner_decisions",e.dec);
 const plain=await W.pv({section:"escalations",ids:[e.id]});ok("E1 control: a plain delete of an open escalation stays blocked",plain.count===0&&plain.summary.blocked.open_escalation===1,plain);
 const m0=await W.pv({section:"inbox",ids:[r.id]});ok("E2 control: its message is blocked",m0.count===0&&m0.summary.blocked.open_escalation===1,m0);
 for(const [nm,b] of [["section scope",{scope:"section"}],["page scope",{scope:"page",ids:[e.id]}],["filter scope",{scope:"filter",filter:{status:"open"}}],["restore",{action:"restore",ids:[e.id]}],["another section",{section:"inbox",ids:[r.id]}]]){const x=await W.pv({section:"escalations",ids:[e.id],test_artifact:true,...b});ok("E3 refused: "+nm,x.status===400&&x.error==="test_artifact_not_allowed",x);}
 const p=await W.pv({section:"escalations",ids:[e.id],test_artifact:true});ok("E4 a named preview is allowed and asks for its own phrase",p.count===1&&/^بایگانی تست 1 مورد$/.test(p.confirm_phrase||"")&&p.summary.impact.pending_decisions===1,p);
 const bad=await W.rq("/api/cleanup/execute",{token:p.token,confirm:"حذف 1 مورد"});ok("E5 the ordinary delete phrase does not pass",bad.status===400&&n(W,"SELECT COUNT(*) n FROM cleanup_trash")===0,bad);
 const x=await W.ex(p);ok("E6 executed",x.result?.done===1&&x.result?.test_artifact===true,x);
 ok("E7 the escalation row is unchanged: open, same version, no decision",snap(W,"owner_escalations",e.id)===se);
 ok("E8 the decision row is unchanged: PENDING, no answer",snap(W,"owner_decisions",e.dec)===sd);
 ok("E9 both are in Trash",n(W,"SELECT COUNT(*) n FROM cleanup_trash WHERE state='trashed' AND record_id IN (?,?)",[e.id,e.dec])===2);
 const m1=await W.pv({section:"inbox",ids:[r.id]});ok("E10 the message is now eligible",m1.count===1,m1);await W.ex(m1);
 const c1=await W.pv({section:"conversations",ids:[r.c]});ok("E11 the conversation is now eligible",c1.count===1,c1);
 const kept=await W.pv({section:"inbox",ids:[keep.id]});ok("E12 control: the other customer's message stays blocked",kept.count===0,kept);
 const list=async s=>((await W.call("/api/owner-escalations?status="+s,null,"GET")).body.items||[]).map(i=>i.id);
 const open=await list("open"),all=await list("all");ok("E13 hidden from the open and all lists, the live one stays",!open.includes(e.id)&&!all.includes(e.id)&&open.includes(k.id)&&all.includes(k.id),{open,all});
 const dl=((await W.call("/api/si/decisions?status=PENDING",null,"GET")).body?.items||(await W.call("/api/si/decisions?status=PENDING",null,"GET")).body?.decisions||[]).map(i=>i.id);ok("E14 hidden from pending decisions, the live one stays",!dl.includes(e.dec)&&dl.includes(k.dec),dl);
 const money=((await W.call("/api/si/money-at-stake",null,"GET")).body.pending_decisions||[]).find(x=>x.decision_type==="ESCALATION_MISSING_BUSINESS_KNOWLEDGE");ok("E16 not counted as money at stake, the live one is",money?.n===1,money);
 const oac=JSON.stringify((await W.call("/api/owner/action-center",null,"GET")).body);ok("E15 hidden from the Owner Action Center, the live one stays",!oac.includes(e.id)&&!oac.includes(e.dec)&&oac.includes(k.id),oac.slice(0,200));}

// 2. the gate: named records only pass when nothing commercial or current is attached
{const W=await world();const gate=async(id,prep,want)=>{const r=await W.old(id);const e=W.esc(r);await prep(r,e);const p=await W.pv({section:"escalations",ids:[e.id],test_artifact:true});
   ok("G "+want,want==="pass"?p.count===1:p.count===0&&p.summary.blocked[want]===1,p.summary);};
 await gate(9101,()=>{},"pass");
 await gate(9102,r=>{W.order(r,"cancelled");},"has_order");
 await gate(9109,(r,e)=>{W.dbrun("UPDATE owner_decisions SET status='SUPERSEDED' WHERE id=?",[e.dec]);},"no_pending_decision");
 await gate(9103,r=>{W.order(r,"paid");},"live_order");
 await gate(9104,r=>{W.dbrun("UPDATE inbox_messages SET created_at=? WHERE lead_id=?",[new Date(Date.now()-86400000).toISOString(),r.l]);},"recent_customer_activity");
 await gate(9105,(r,e)=>{W.dbrun("UPDATE owner_decisions SET order_id='x' WHERE id=?",[e.dec]);},"commercial_link");
 await gate(9106,r=>{W.dbrun("UPDATE lead_outreach SET status='approved' WHERE lead_id=?",[r.l]);},"open_reply");
 // a cancelled order on another message of the lead does not stop it
 {const r=await W.old(9107);const r2={...r,id:"other-msg"};W.dbrun("INSERT INTO inbox_messages(id,platform,lead_id,conversation_id,message,status,created_at,updated_at) VALUES('other-msg','telegram',?,?,'x','new',?,?)",[r.l,r.c,OLD,OLD]);W.order(r2,"cancelled");const e=W.esc(r);const p=await W.pv({section:"escalations",ids:[e.id],test_artifact:true});ok("G cancelled order elsewhere does not block",p.count===1,p.summary);}
 // the write re-checks: a customer who writes after the preview keeps the escalation
 {const r=await W.old(9108);const e=W.esc(r);const p=await W.pv({section:"escalations",ids:[e.id],test_artifact:true});W.dbrun("UPDATE inbox_messages SET created_at=? WHERE lead_id=?",[new Date().toISOString(),r.l]);const x=await W.ex(p);ok("G a stale preview does not pass",x.result?.done===0&&x.result?.skipped===1&&n(W,"SELECT COUNT(*) n FROM cleanup_trash WHERE record_id IN (?,?)",[e.id,e.dec])===0,x);}}

// 3. order-linked conversation
{const W=await world();const r=await W.old(9201);const pay=W.order(r,"cancelled");const e=W.esc({...r,id:r.id},"x");
 W.dbrun("INSERT INTO inbox_messages(id,platform,lead_id,conversation_id,message,status,created_at,updated_at) VALUES('m9201b','telegram',?,?,'x','new',?,?)",[r.l,r.c,OLD,OLD]);W.dbrun("UPDATE owner_escalations SET source_message_id='m9201b' WHERE id=?",[e.id]);
 const so=snap(W,"lead_orders",pay);const x=await W.archive([e.id]);ok("O1 an escalation beside a cancelled order can be set aside",x.result?.done===1,x);
 const c=await W.pv({section:"conversations",ids:[r.c]});ok("O2 the order-linked conversation stays blocked",c.count===0&&c.summary.blocked.has_order===1,c.summary);
 const m=await W.pv({section:"inbox",ids:[r.id]});ok("O3 the order acceptance message stays blocked",m.count===0&&m.summary.blocked.has_order===1,m.summary);
 const m2=await W.pv({section:"inbox",ids:["m9201b"]});ok("O4 its other message is eligible",m2.count===1,m2.summary);await W.ex(m2);
 ok("O5 the order row is unchanged",snap(W,"lead_orders",pay)===so);}

// 4. AI context
{const W=await world({ai:true});const mk=async(id,word)=>{const r=await W.old(id);W.fact(r,"destination",JSON.stringify(word+"FACT"));W.dbrun("UPDATE lead_outreach SET message=?,inbox_message_id=?,conversation_id=? WHERE lead_id=?",[word+"REPLY",r.id,r.c,r.l]);return r;};
 const live=await mk(9301,"ZZLIVE"),part=await mk(9302,"ZZPART"),whole=await mk(9303,"ZZWHOLE");
 const ea=W.esc(part),eb=W.esc(whole);await W.archive([ea.id,eb.id]);await W.del({section:"inbox",ids:[part.id]});await W.del({section:"conversations",ids:[whole.c]});
 const turn=async r=>{const k=W.AI.requests.length;await W.send(r.u,"جعبه چند؟");return JSON.stringify(W.AI.requests.slice(k).map(x=>x.body));};
 const a=await turn(live),b=await turn(part),c=await turn(whole);
 ok("C1 control: live fact and live reply reach the model",a.includes("ZZLIVEFACT")&&a.includes("ZZLIVEREPLY"),a.slice(0,200));
 ok("C2 an archived fact does not reach the model",b.length>10&&!b.includes("ZZPARTFACT")&&c.length>10&&!c.includes("ZZWHOLEFACT"));
 ok("C3 what the customer was told stays when only a message is archived",b.includes("ZZPARTREPLY"));
 ok("C4 an archived conversation's old replies do not reach the model",!c.includes("ZZWHOLEREPLY"));
 ok("C5 the sent rows stay as evidence",n(W,"SELECT COUNT(*) n FROM lead_outreach WHERE lead_id=? AND message='ZZWHOLEREPLY' AND status='sent'",[whole.l])===1);
 W.dbrun("UPDATE lead_outreach SET status='sent',message='ZZLATERREPLY',created_at=? WHERE lead_id=? AND message<>'ZZWHOLEREPLY'",[new Date(Date.now()+60000).toISOString(),whole.l]);const d=await turn(whole);ok("C6 a reply sent after the archive stays in context",n(W,"SELECT COUNT(*) n FROM lead_outreach WHERE lead_id=? AND message='ZZLATERREPLY'",[whole.l])>=1&&d.includes("ZZLATERREPLY"),d.slice(0,120));}
// 4b. a summary built over an archived message; an owner answer on an archived message
{const W=await world({ai:true});const mk=async(id,word)=>{const r=await W.old(id);W.dbrun("INSERT INTO inbox_messages(id,platform,lead_id,conversation_id,message,status,created_at,updated_at) VALUES(?,'telegram',?,?,'later','new',?,?)",["later"+id,r.l,r.c,new Date(Date.now()-20*86400000).toISOString(),OLD]);
  W.fact({...r,id:"later"+id},"conversation_summary",JSON.stringify({text:word+"SUMMARY"}),{created_at:new Date(Date.now()-19*86400000).toISOString()});
  W.dbrun("INSERT INTO owner_escalations(id,escalation_key,lead_id,conversation_id,channel,source_message_id,sales_brain_event_id,context_summary,unresolved_question,reason_code,decision_required,status,version,owner_decision,resolved_by,resolved_at,created_at,updated_at) VALUES(?,?,?,?,'telegram',?,?,'c','q','missing_business_knowledge','a','resolved',2,?,'owner',?,?,?)",["re"+id,"kre"+id,r.l,r.c,r.id,"sbre"+id,word+"ANSWER",OLD,OLD,OLD]);return r;};
 const live=await mk(9311,"ZZLIVE"),gone=await mk(9312,"ZZGONE");await W.del({section:"inbox",ids:[gone.id]});
 const turn=async r=>{const k=W.AI.requests.length,x=await W.send(r.u,"جعبه چند؟");return JSON.stringify([W.AI.requests.slice(k).map(y=>y.body),x.brain?.owner_case_decisions]);};
 const a=await turn(live),b=await turn(gone);
 ok("S1 control: a live summary reaches the model",a.includes("ZZLIVESUMMARY"),a.slice(0,160));ok("S2 a summary built over an archived message does not",b.length>10&&!b.includes("ZZGONESUMMARY"));
 const fresh=await W.old(9314);W.dbrun("INSERT INTO inbox_messages(id,platform,lead_id,conversation_id,message,status,created_at,updated_at) VALUES('new9314','telegram',?,?,'later','new',?,?)",[fresh.l,fresh.c,OLD,OLD]);await W.del({section:"inbox",ids:[fresh.id]});W.fact({...fresh,id:"new9314"},"conversation_summary",JSON.stringify({text:"ZZNEWSUMMARY"}),{created_at:new Date(Date.now()+1000).toISOString()});const c=await turn(fresh);ok("S2b a summary written after the archive is used",c.includes("ZZNEWSUMMARY"),c.slice(0,120));
 const third=await mk(9313,"ZZTRASH");await W.del({section:"escalations",ids:["re9313"]});const d=await turn(third);ok("S5 an owner answer whose escalation is in Trash is not authority",d.length>10&&!d.includes("ZZTRASHANSWER")&&d.includes("ZZTRASHSUMMARY"),d.slice(0,120));
 ok("S3 control: a live owner answer is authority for the reply",a.includes("ZZLIVEANSWER"));ok("S4 an owner answer on an archived message is not",!b.includes("ZZGONEANSWER"));}

// 5. nothing waits on a hidden escalation
{const W=await world();const ask="تحویل به استرالیا چند روز طول میکشه؟";const mk=async id=>{const r=await W.old(id);const s=await W.send(r.u,ask);W.dbrun("UPDATE inbox_messages SET created_at=? WHERE lead_id=?",[OLD,r.l]);W.dbrun("UPDATE lead_outreach SET status='rejected' WHERE lead_id=? AND status<>'sent'",[r.l]);return {...r,esc:W.q("SELECT id FROM owner_escalations WHERE source_message_id=?",[s.row.id])[0]?.id};};
 const live=await mk(9401),gone=await mk(9402);const ar=await W.archive([gone.esc]);ok("W0 a real escalation was made and set aside",!!live.esc&&ar.result?.done===1,ar);
 const a=await W.send(live.u,ask),b=await W.send(gone.u,ask);
 const waits=x=>x.action==="wait_for_owner"||x.brain?.next_sales_action==="wait_for_owner";
 const fresh=r=>n(W,"SELECT COUNT(*) n FROM owner_escalations WHERE lead_id=? AND status='open'",[r.l]);
 ok("W1 control: a repeat waits on the open escalation",waits(a)&&fresh(live)===1,{a:a.action,n:fresh(live)});
 ok("W2 a repeat does not wait on a hidden one",!waits(b),{b:b.action});
 ok("W3 and a new case reaches the owner",fresh(gone)===2&&((await W.call("/api/owner-escalations?status=open",null,"GET")).body.items||[]).some(i=>i.lead_id===gone.l),fresh(gone));}

// 6. restore, and no decision on a hidden record
{const W=await world();const r=await W.old(9501);const e=W.esc(r);
 W.dbrun("UPDATE lead_outreach SET id='dr9501',status='draft',sent_at=NULL WHERE inbox_message_id=?",[r.id]);
 await W.archive([e.id]);
 const se=snap(W,"owner_escalations",e.id);
 const res=await W.call("/api/owner-escalations/resolve",{id:e.id,version:1,owner_decision:"x"},"POST");ok("R1 a hidden escalation cannot be answered",res.status===409&&snap(W,"owner_escalations",e.id)===se,res);
 const res2=await W.call("/api/si/decisions/resolve",{id:e.dec,action:"APPROVE",scope:"CASE_ONLY"},"POST");ok("R2 nor through its decision",res2.status>=400&&W.q("SELECT status s FROM owner_decisions WHERE id=?",[e.dec])[0].s==="PENDING",res2);
 await W.del({section:"inbox",ids:[r.id]});ok("R3 the old draft moved with the message",W.q("SELECT status s FROM lead_outreach WHERE id='dr9501'")[0].s==="trashed");
 const d=await W.pv({section:"decisions",action:"restore",ids:[e.dec]});ok("R4 the decision alone cannot be restored",d.count===0&&d.summary.blocked.restore_with_escalation===1,d.summary);
 const a=await W.pv({section:"escalations",action:"restore",ids:[e.id]});ok("R5 the escalation waits for its message",a.count===0&&a.summary.blocked.message_in_trash===1,a.summary);
 const tg=W.tg.length;await W.back({section:"inbox",ids:[r.id]});const b=await W.back({section:"escalations",ids:[e.id]});ok("R6 restored",b.result?.done===1,b);
 ok("R7 row untouched, decision out of Trash with it",snap(W,"owner_escalations",e.id)===se&&n(W,"SELECT COUNT(*) n FROM cleanup_trash WHERE state='trashed'")===0&&n(W,"SELECT COUNT(*) n FROM cleanup_trash WHERE record_id=? AND state='restored'",[e.dec])===1);
 ok("R8 visible again",((await W.call("/api/owner-escalations?status=open",null,"GET")).body.items||[]).some(i=>i.id===e.id));
 ok("R9 the draft came back as a draft",W.q("SELECT status s,approved_at a FROM lead_outreach WHERE id='dr9501'")[0].s==="draft");
 await tick(W);ok("R10 nothing was sent, by restore or by the next tick",W.tg.length===tg&&W.q("SELECT status s FROM lead_outreach WHERE id='dr9501'")[0].s==="draft",W.tg.length-tg);
 const fin=await W.call("/api/owner-escalations/resolve",{id:e.id,version:1,owner_decision:"answered"},"POST");ok("R11 after restore the owner can answer it normally",fin.status===200&&W.q("SELECT status s FROM owner_escalations WHERE id=?",[e.id])[0].s==="resolved",fin);}

// 7. duplicate send and expired approval
{const W=await world();const r=await W.old(9601);
 W.out(r,{id:"ap9601",channel:"first_contact_manual",message:"hello",status:"approved",approved_at:OLD,approved_by:"owner"});
 await W.del({section:"outreach",ids:["ap9601"]});const s=await W.call("/api/leads/outreach/send-telegram",{id:"ap9601"},"POST");ok("D1 a trashed row cannot be sent",s.status>=400,s);
 await W.back({section:"outreach",ids:["ap9601"]});const x=W.q("SELECT status s,approved_at a,approved_by b FROM lead_outreach WHERE id='ap9601'")[0];ok("D2 an old approval does not come back",x.s==="draft"&&x.a===null&&x.b===null,x);
 const fresh=new Date().toISOString();W.dbrun("UPDATE lead_outreach SET message='x',status='rejected' WHERE id='ap9601'");W.out(r,{id:"ok9601",channel:"first_contact_manual",message:"hello",status:"approved",approved_at:fresh,approved_by:"owner"});
 const live=await W.call("/api/leads/first-contact/delivered",{outreach_id:"ok9601",confirm_delivered:true,delivered_via:"instagram"},"POST");ok("D3a control: a live approval can be confirmed",live.status===200&&W.q("SELECT status s FROM lead_outreach WHERE id='ok9601'")[0].s==="delivered",live);
 W.dbrun("UPDATE lead_outreach SET status='draft' WHERE id='ap9601'");const d=await W.call("/api/leads/first-contact/delivered",{outreach_id:"ap9601",confirm_delivered:true,delivered_via:"instagram"},"POST");ok("D3b a restored row cannot be confirmed as delivered",d.status===409&&W.q("SELECT status s FROM lead_outreach WHERE id='ap9601'")[0].s==="draft",d);
 const u=r.u,mid=777,upd=88001,msg={update_id:upd,message:{message_id:mid,date:1,from:{id:u.id,is_bot:false,first_name:"U"},chat:{id:u.id,type:"private"},text:"سلام دوباره"}};
 await W.post(msg);const row=W.q("SELECT id FROM inbox_messages WHERE external_id=?",[u.id+":"+mid])[0];W.dbrun("UPDATE lead_outreach SET status='sent' WHERE inbox_message_id=?",[row.id]);await W.del({section:"inbox",ids:[row.id]});
 const tg=W.tg.length,c=n(W,"SELECT COUNT(*) n FROM inbox_messages");await W.post({...msg,update_id:upd+1});ok("D4 redelivery of an archived message makes no row and no send",n(W,"SELECT COUNT(*) n FROM inbox_messages")===c&&W.tg.length===tg,W.tg.length-tg);
 await W.back({section:"inbox",ids:[row.id]});await W.post({...msg,update_id:upd+2});ok("D5 nor after it is restored",n(W,"SELECT COUNT(*) n FROM inbox_messages")===c&&W.tg.length===tg,W.tg.length-tg);
 await W.post({update_id:upd+3,message:{...msg.message,message_id:mid+1,text:"پیام تازه"}});ok("D6 control: a new message from the same person is still received",n(W,"SELECT COUNT(*) n FROM inbox_messages")===c+1);}

// 8. commercial isolation
{const W=await world();const r=await W.old(9701);const e=W.esc(r);const tables=["commercial_price_items","sales_knowledge_facts","business_settings","lead_orders","lead_order_payments","lead_quotes","approval_queue"];
 const hash=()=>JSON.stringify(tables.map(t=>W.q(`SELECT * FROM ${t} ORDER BY rowid`)));const h0=hash(),ta=()=>n(W,"SELECT COUNT(*) n FROM system_events WHERE type='owner_escalation_and_decision_resolved'");
 await W.archive([e.id]);await W.del({section:"inbox",ids:[r.id]});await W.back({section:"inbox",ids:[r.id]});await W.back({section:"escalations",ids:[e.id]});
 ok("I1 prices, knowledge, settings, orders, payments, quotes and approvals unchanged",hash()===h0);
 ok("I2 no owner resolution was recorded",ta()===0&&W.q("SELECT owner_decision a,resolved_by b FROM owner_escalations WHERE id=?",[e.id])[0].a===null&&W.q("SELECT owner_answer_json a,resolved_at b FROM owner_decisions WHERE id=?",[e.dec])[0].b===null);
 const ev=W.q("SELECT details_json d FROM system_events WHERE type='cleanup_executed' ORDER BY created_at LIMIT 1")[0]?.d||"";ok("I3 the audit row says it was a test archive",JSON.parse(ev).test_artifact===true,ev);
 const src=fs.readFileSync(path.join(SRC,"cleanup-center.js"),"utf8");ok("I4 the cleanup code never writes an escalation or a decision row",!/(UPDATE|DELETE FROM|INSERT[^"`]*INTO)\s+(owner_escalations|owner_decisions)\b/.test(src));
 const CS=(await import(pathToFileURL(path.join(SRC,"cleanup-center.js")).href)).CLEANUP_SECTIONS;ok("I5 no purge exists for either section",!!CS.escalations&&!!CS.decisions&&!CS.escalations.purge&&!CS.decisions.purge);}

// 9. opt-out
{const W=await world();const r=await W.old(9801,"STOP");const e=W.esc(r);const over=async()=>(await W.call("/api/sales/auto-messaging",null,"GET")).body?.opt_out||(await W.call("/api/sales/auto-messaging",null,"GET")).body?.status?.opt_out;
 const b=await over();const has=o=>(o?.opted_out||[]).some(x=>x.lead_id===r.l);ok("P1 control: the stop request is seen",has(b),b);
 await W.archive([e.id]);await W.del({section:"inbox",ids:[r.id]});ok("P2 it stays effective after archive",has(await over()));
 const c=await W.pv({section:"conversations",ids:[r.c]});await W.ex(c);ok("P3 and after the conversation is archived",has(await over()));
 ok("P4 the message row stays as evidence",n(W,"SELECT COUNT(*) n FROM inbox_messages WHERE id=?",[r.id])===1);
 W.out(r,{id:"p9801",channel:"telegram",message:"x",status:"pending_approval"});const g=await W.call("/api/leads/outreach/transition",{id:"p9801",action:"approve"},"POST");ok("P5 the owner approve gate still refuses this customer",g.status===409&&g.body?.reason==="customer_opted_out",g);
 const c2=await W.old(9802);W.out(c2,{id:"p9802",channel:"telegram",message:"x",status:"pending_approval"});const g2=await W.call("/api/leads/outreach/transition",{id:"p9802",action:"approve"},"POST");ok("P6 control: another customer is not refused for opt-out",g2.body?.reason!=="customer_opted_out",g2);}
// 10. edge cases
{const W=await world();const r=await W.old(9901);
 const a=W.esc(r,"a"),b=W.esc(r,"b","unclear_moq");await W.archive([a.id]);const m=await W.pv({section:"inbox",ids:[r.id]});ok("M1 a second escalation on the message still blocks it",m.count===0&&m.summary.blocked.open_escalation===1,m.summary);
 const twice=await W.pv({section:"escalations",ids:[a.id],test_artifact:true});ok("M2 archiving twice does nothing",twice.count===0&&n(W,"SELECT COUNT(*) n FROM cleanup_trash WHERE record_id=?",[a.id])===1,twice.summary);
 await W.archive([b.id]);const c=await W.pv({section:"conversations",ids:[r.c]});await W.ex(c);
 const e1=await W.pv({section:"escalations",action:"restore",ids:[a.id]});ok("M3 restore waits while the conversation holds its message",e1.count===0&&e1.summary.blocked.message_in_trash===1,e1.summary);
 await W.back({section:"conversations",ids:[r.c]});const e2=await W.back({section:"escalations",ids:[a.id,b.id]});ok("M4 after the conversation returns it restores",e2.result?.done===2,e2);}
{const W=await world();const r=await W.old(9902);const e=W.esc(r);await W.archive([e.id]);W.dbrun("UPDATE owner_decisions SET status='SUPERSEDED' WHERE id=?",[e.dec]);
 const b=await W.back({section:"escalations",ids:[e.id]});ok("M5 a decision superseded while hidden keeps its state on restore",b.result?.done===1&&W.q("SELECT status s FROM owner_decisions WHERE id=?",[e.dec])[0].s==="SUPERSEDED"&&n(W,"SELECT COUNT(*) n FROM cleanup_trash WHERE state='trashed'")===0,b);}
{const W=await world();const r=await W.old(9903);const e=W.esc(r);await W.archive([e.id]);await W.send(r.u,"سلام دوباره");const tg=W.tg.length,o=n(W,"SELECT COUNT(*) n FROM lead_outreach WHERE status='sent'");
 const b=await W.back({section:"escalations",ids:[e.id]});ok("M6 restore after the customer wrote again sends nothing",b.result?.done===1&&W.tg.length===tg&&n(W,"SELECT COUNT(*) n FROM lead_outreach WHERE status='sent'")===o,b);}
// an ordinary Trash row never hides or unblocks an escalation that is open again
{const W=await world();const r=await W.old(9904);const e=W.esc(r);W.dbrun("UPDATE owner_escalations SET status='resolved',owner_decision='x',resolved_by='o',resolved_at=? WHERE id=?",[OLD,e.id]);W.dbrun("UPDATE owner_decisions SET status='RESOLVED' WHERE id=?",[e.dec]);
 await W.del({section:"escalations",ids:[e.id]});W.dbrun("UPDATE owner_escalations SET status='open',owner_decision=NULL,resolved_by=NULL,resolved_at=NULL WHERE id=?",[e.id]);
 const m=await W.pv({section:"inbox",ids:[r.id]});ok("M7 reopened after an ordinary delete, it still blocks its message",m.count===0&&m.summary.blocked.open_escalation===1,m.summary);
 ok("M8 and it is visible",((await W.call("/api/owner-escalations?status=open",null,"GET")).body.items||[]).some(i=>i.id===e.id));}
// a conversation that received a formal quote keeps its history in the AI context
{const W=await world();const r=await W.old(9906);const cols=W.q("SELECT name,\"notnull\" nn,dflt_value d,type FROM pragma_table_info('lead_quotes')").filter(c=>c.nn&&c.d===null),o={id:"q9906",lead_id:r.l,conversation_id:r.c,created_at:OLD,updated_at:OLD};for(const c of cols)if(!(c.name in o))o[c.name]=/INT|REAL/.test(c.type)?1:c.name==="status"?"sent":"x";const k=Object.keys(o);W.dbrun(`INSERT INTO lead_quotes(${k.join(",")}) VALUES(${k.map(()=>"?").join(",")})`,k.map(x=>o[x]));
 const c=await W.pv({section:"conversations",ids:[r.c]});ok("M10 a conversation with a quote stays blocked",c.count===0&&c.summary.blocked.has_quote===1,c.summary);}
// the archive lands between the guard and the write
{const W=await world();const r=await W.old(9905);const e=W.esc(r);const batch=W.env.DB.batch.bind(W.env.DB);let hit=false;
 W.env.DB.batch=async st=>{if(!hit&&st.some(x=>/UPDATE owner_decisions SET status=/.test(x.sql||x.query||x._sql||""))){hit=true;W.dbrun("INSERT INTO cleanup_trash(id,section,record_id,op_id,prior_json,state,deleted_by,deleted_at) VALUES('race','escalations',?,'op',?,'trashed','admin',?)",[e.id,'{"test_artifact":1}',new Date().toISOString()]);}return batch(st);};
 const x=await W.call("/api/owner-escalations/resolve",{id:e.id,version:1,owner_decision:"x"},"POST");W.env.DB.batch=batch;
 ok("M9 a race leaves no decision on the archived record",hit&&W.q("SELECT status s FROM owner_escalations WHERE id=?",[e.id])[0].s==="open"&&W.q("SELECT status s FROM owner_decisions WHERE id=?",[e.dec])[0].s==="PENDING",{hit,status:x.status});}
// ---- PHASE 25E
const sends=(W,id)=>W.tg.filter(x=>{if(x.method!=="sendMessage")return false;try{return String(JSON.parse(x.body).chat_id)===String(id);}catch{return false;}}).length;
// 11. an archived conversation: old content is gone, a genuinely new message is answered
{const W=await world();const live=await W.old(9951),gone=await W.old(9952);await W.del({section:"conversations",ids:[gone.c]});
 W.dbrun("UPDATE lead_outreach SET status='sent' WHERE lead_id=? AND status='trashed'",[gone.l]);
 const leads=n(W,"SELECT COUNT(*) n FROM leads"),convs=n(W,"SELECT COUNT(*) n FROM lead_conversations"),a0=sends(W,live.u.id),b0=sends(W,gone.u.id);
 const a=await W.send(live.u,"سلام، جعبه جواهر دارید؟"),b=await W.send(gone.u,"سلام، جعبه جواهر دارید؟");
 ok("A1 control: a live conversation gets its automatic reply",sends(W,live.u.id)>a0,{o:a.outcome});
 ok("A2 a new message in an archived conversation is answered",sends(W,gone.u.id)>b0&&b.outcome?.customer_visible==="reply",{o:b.outcome});
 ok("A3 same customer: no duplicate lead or conversation",n(W,"SELECT COUNT(*) n FROM leads")===leads&&n(W,"SELECT COUNT(*) n FROM lead_conversations")===convs&&b.row.lead_id===gone.l&&b.row.conversation_id===gone.c);
 const prep=W.env.DB.prepare.bind(W.env.DB);W.env.DB.prepare=sql=>{if(/FROM cleanup_trash WHERE section IN \('context','conversations'\)/.test(sql))throw Error("D1 temporary failure");return prep(sql);};const f0=sends(W,live.u.id);await W.send(live.u,"یک سوال دیگر دارم");W.env.DB.prepare=prep;ok("A4c an unreadable boundary stops the send",sends(W,live.u.id)===f0);
 W.dbrun("ALTER TABLE cleanup_trash RENAME TO cleanup_trash_x");const f1=sends(W,live.u.id);await W.send(live.u,"جعبه طلایی هم دارید؟");W.dbrun("ALTER TABLE cleanup_trash_x RENAME TO cleanup_trash");ok("A4d a store that does not exist does not stop replies",sends(W,live.u.id)>f1);}

// 12. names, notes and identity
{const W=await world({ai:true});const mk=async id=>{const r=await W.old(id);W.dbrun("UPDATE leads SET name=?,notes=json_set(notes,'$.telegram_username',?) WHERE id=?",["ZZNAME"+id,"ZZUSER"+id,r.l]);W.fact(r,"customer_name",JSON.stringify("ZZFACTNAME"+id));return r;};
 const live=await mk(9961),gone=await mk(9962);await W.del({section:"conversations",ids:[gone.c]});
 W.dbrun("INSERT OR IGNORE INTO sales_knowledge_facts(id) SELECT 'x' WHERE 0");
 const turn=async r=>{const k=W.AI.requests.length;await W.send(r.u,"جعبه چند؟");return JSON.stringify(W.AI.requests.slice(k).map(x=>x.body));};
 const a=await turn(live),b=await turn(gone);
 ok("N1 control: a live customer name fact reaches the model",a.includes("ZZFACTNAME9961"),a.slice(0,120));
 ok("N2 an archived customer name fact does not",b.length>10&&!b.includes("ZZFACTNAME9962"));
 ok("N3 lead name and notes never reach the model, live or archived",!a.includes("ZZNAME9961")&&!a.includes("ZZUSER9961")&&!b.includes("ZZNAME9962")&&!b.includes("ZZUSER9962"));
 const l=W.q("SELECT name,notes,stage FROM leads WHERE id=?",[gone.l])[0];ok("N4 the lead identity row is preserved",l.name==="ZZNAME9962"&&l.notes.includes("ZZUSER9962"),l);
 ok("N5 the model still receives the business instructions",b.includes("HAMZEHI BOX"));}

// 13. restored draft and the automatic follow-up runner; visible reasons
{const W=await world();const IDX=await import(pathToFileURL(path.join(SRC,"index.js")).href+"?r="+Math.random());const NOW=Date.now();
 const AM=await import(pathToFileURL(path.join(SRC,"auto-sales-messaging.js")).href);const hour=(()=>{for(let h=0;h<48;h++){const t=NOW+h*3600000;if(AM.withinContactHours("IRAN",AM.autoMessagingSettings(null),t))return t;}return NOW;})();
 const run=t=>IDX.runAutoSalesMessaging(W.env,{nowMs:t,internalFetch:r=>W.run(new Request(r.url.replace("https://internal.local","https://w.test"),r))});const ago=d=>new Date(NOW-d*86400000).toISOString();
 let uid=9970;const mk=async()=>{const u={id:++uid,name:"F"+uid,username:"f"+uid};await W.send(u,"سلام، جعبه جواهر می‌خواهم");W.setMarket(u,"iran");const r=W.q("SELECT id,lead_id l,conversation_id c FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(u.id)])[0];W.dbrun("UPDATE inbox_messages SET created_at=? WHERE lead_id=?",[ago(16),r.l]);const c=W.q("SELECT id FROM lead_contacts WHERE lead_id=? LIMIT 1",[r.l])[0];W.dbrun("DELETE FROM lead_outreach WHERE lead_id=?",[r.l]);
  W.dbrun("INSERT INTO lead_outreach(id,lead_id,contact_id,channel,recipient,message,language,status,approved_at,approved_by,sent_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",["prev-"+r.l,r.l,c?.id||null,"telegram",String(u.id),"earlier reply","Persian","sent",ago(15),"admin",ago(15),ago(15),ago(15)]);return {...r,u};};
 await W.call("/api/sales/auto-messaging",{enabled:true,owner_approved:true,local_start_hour:0,local_end_hour:24,per_run:10,per_day:50});
 const control=await mk(),restored=await mk(),old=await mk(),arch=await mk(),esc=await mk();
 // restored: an old draft comes back from Trash
 W.out(restored,{id:"rd1",inbox_message_id:restored.id,conversation_id:restored.c,channel:"telegram",recipient:String(restored.u.id),message:"old",status:"draft"});await W.del({section:"inbox",ids:[restored.id]});await W.back({section:"inbox",ids:[restored.id]});
 // old: a restore older than the pause window, its draft still open
 W.out(old,{id:"rd2",inbox_message_id:old.id,conversation_id:old.c,channel:"telegram",recipient:String(old.u.id),message:"old",status:"draft"});await W.del({section:"inbox",ids:[old.id]});await W.back({section:"inbox",ids:[old.id]});W.dbrun("UPDATE cleanup_trash SET restored_at=? WHERE record_id=?",[ago(9),old.id]);
 const ea=W.esc(esc);await W.archive([ea.id]);
 await W.del({section:"conversations",ids:[arch.c]});W.dbrun("UPDATE inbox_messages SET status='new' WHERE lead_id=?",[arch.l]);
 const before=Object.fromEntries([control,restored,old,arch,esc].map(x=>[x.u.id,sends(W,x.u.id)])),more=x=>sends(W,x.u.id)-before[x.u.id];const r=await run(hour);const st=id=>W.q("SELECT status s,approved_at a FROM lead_outreach WHERE id=?",[id])[0];
 ok("F1 control: the runner reaches and sends to an eligible silent customer",r.sent>=1&&more(control)>=1,r);
 ok("F2 a restored draft is held by the pause",r.skipped?.restored_recently>=1&&st("rd1").s==="draft"&&st("rd1").a===null&&more(restored)===0,r.skipped);
 ok("F3 after the pause the old restored draft itself is never sent",st("rd2").s==="draft"&&st("rd2").a===null&&!W.tg.some(x=>{try{return JSON.parse(x.body).text==="old";}catch{return false;}}),st("rd2"));
 ok("F4 a reset or archived conversation gets no follow-up, with its reason",r.skipped?.conversation_reset>=1&&more(arch)===0,r.skipped);
 ok("F5 an archived escalation stops the follow-up under its own reason",r.skipped?.archived_test_escalation>=1&&more(esc)===0,r.skipped);
 const body=(await W.call("/api/owner-escalations",null,"GET")).body;ok("F6 the owner list reports the archived count and leads",body.archived_test?.count===1&&body.archived_test?.leads===1,body.archived_test);
 const tr=(await W.call("/api/cleanup/items?section=escalations&view=trash",null,"GET")).body;ok("F7 the Trash view marks it as a test archive",tr.items?.[0]?.test_artifact===1&&tr.items?.[0]?.state==="open",tr.items?.[0]);}

// 14. concurrent cleanup
{const W=await world();const r=await W.old(9981),r2=await W.old(9982);const e=W.esc(r);
 const p=await W.pv({section:"escalations",ids:[e.id],test_artifact:true});const [x,y]=await Promise.all([W.ex(p),W.ex(p)]);ok("K1 one token executed twice at once archives once",n(W,"SELECT COUNT(*) n FROM cleanup_trash WHERE record_id=?",[e.id])===1&&n(W,"SELECT COUNT(*) n FROM cleanup_trash WHERE record_id=?",[e.dec])===1&&[x,y].filter(v=>v.result?.done===1&&!v.idempotent).length===1,[x,y]);
 const a=await W.pv({section:"inbox",ids:[r.id,r2.id]}),b=await W.pv({section:"inbox",ids:[r.id]});const [xa,xb]=await Promise.all([W.ex(a),W.ex(b)]);ok("K2 two overlapping operations trash each record once",n(W,"SELECT COUNT(*) n FROM cleanup_trash WHERE section='inbox' AND state='trashed'")===2,[xa,xb]);
 W.dbrun("INSERT INTO cleanup_ops(id,section,action,scope,status,created_by,created_at,expires_at,started_at) VALUES('busy','outreach','trash','ids','running','admin',?,?,?)",[new Date().toISOString(),new Date(Date.now()+60000).toISOString(),new Date().toISOString()]);
 W.dbrun("INSERT INTO lead_outreach(id,lead_id,channel,recipient,message,language,status,created_at,updated_at) VALUES('k3',?,'telegram','x','m','fa','rejected',?,?)",[r2.l,OLD,OLD]);const c=await W.pv({section:"outreach",ids:["k3"]});const xc=await W.ex(c);ok("K3 a second operation on a busy section is refused",xc.status===409&&xc.error==="section_busy",xc);
 const r3=await W.old(9983);const e3=W.esc(r3);const pr=await W.pv({section:"escalations",ids:[e3.id],test_artifact:true});await W.call("/api/owner-escalations/resolve",{id:e3.id,version:1,owner_decision:"real answer"},"POST");const xr=await W.ex(pr);ok("K4 an escalation the owner answered after the preview is not archived",xr.result?.done===0&&W.q("SELECT status s FROM owner_escalations WHERE id=?",[e3.id])[0].s==="resolved"&&n(W,"SELECT COUNT(*) n FROM cleanup_trash WHERE record_id=?",[e3.id])===0,xr);}

// a second operation runs inside the first one's write: the guard between claim and batch is really exercised
{const W=await world();const r=await W.old(9984),r2=await W.old(9985);const a=await W.pv({section:"inbox",ids:[r.id,r2.id]}),b=await W.pv({section:"inbox",ids:[r.id]}),batch=W.env.DB.batch.bind(W.env.DB);let inner=null,hit=false;
 W.env.DB.batch=async st=>{if(!hit){hit=true;inner=await W.ex(b);}return batch(st);};const outer=await W.ex(a);W.env.DB.batch=batch;
 ok("K5 an operation that starts during another on the same section is refused",hit&&inner?.status===409&&inner?.error==="section_busy",inner);
 ok("K6 the running one finishes cleanly, each record once",outer.result?.done===2&&n(W,"SELECT COUNT(*) n FROM cleanup_trash WHERE section='inbox' AND state='trashed'")===2,outer);
 const c=await W.pv({section:"inbox",action:"restore",ids:[r.id]}),d=await W.pv({section:"inbox",action:"restore",ids:[r.id]});const x=await W.ex(c),y=await W.ex(d);ok("K7 two restores of one record restore it once",x.result?.done===1&&y.result?.done===0&&y.result?.skipped===1&&W.q("SELECT status s FROM inbox_messages WHERE id=?",[r.id])[0].s!=="trashed",[x,y]);}

// 15. quote safety and financial immutability
{const W=await world();const r=await W.old(9991);const oid=W.order(r,"paid");
 W.dbrun("INSERT INTO lead_order_payments(id,order_id,lead_id,payment_kind,amount_minor,currency,method,reference,reference_key,recorded_by,recorded_at) VALUES('pay1',?,?,'full',100,'TOMAN','bank_transfer','r','r','owner',?)",[oid,r.l,OLD]);
 const e=W.esc({...r,id:r.id},"p");const fin=()=>JSON.stringify([W.q("SELECT * FROM lead_orders ORDER BY id"),W.q("SELECT * FROM lead_order_payments ORDER BY id")]),h=fin();
 const g=await W.pv({section:"escalations",ids:[e.id],test_artifact:true});ok("Q1 a paid order keeps its escalation with the owner",g.count===0&&g.summary.blocked.live_order===1,g.summary);
 const l=await W.pv({section:"leads",ids:[r.l]});const c=await W.pv({section:"conversations",ids:[r.c]});ok("Q2 its lead and conversation stay blocked",l.count===0&&c.count===0);
 let up=false,dl=false;try{W.dbrun("UPDATE lead_order_payments SET amount_minor=1 WHERE id='pay1'");}catch{up=true;}try{W.dbrun("DELETE FROM lead_order_payments WHERE id='pay1'");}catch{dl=true;}ok("Q3 a payment row cannot be updated or deleted",up&&dl,{up,dl});
 const src=fs.readFileSync(path.join(SRC,"cleanup-center.js"),"utf8");ok("Q4 the cleanup code has no write to orders or payments",!/(UPDATE|DELETE FROM|INSERT[^"`]*INTO)\s+(lead_orders|lead_order_payments|revenue_attribution)\b/.test(src));ok("Q5 orders and payments unchanged",fin()===h);
 const sect=[];for(const sc of ["inbox","conversations","outreach","escalations","decisions","leads"]){const p=await W.pv({section:sc,scope:"section"});if(p.token)sect.push(await W.ex(p));}ok("Q5b section-wide cleanup of every customer section leaves orders and payments unchanged",fin()===h&&n(W,"SELECT COUNT(*) n FROM lead_orders WHERE id=? AND status='paid'",[oid])===1,sect.length);
 const r2=await W.old(9992);const cols=W.q("SELECT name,\"notnull\" nn,dflt_value d,type FROM pragma_table_info('lead_quotes')").filter(c=>c.nn&&c.d===null),o={id:"q9992",lead_id:r2.l,conversation_id:r2.c,inbox_message_id:r2.id,created_at:OLD,updated_at:OLD};for(const c2 of cols)if(!(c2.name in o))o[c2.name]=/INT|REAL/.test(c2.type)?1:c2.name==="status"?"sent":"x";const k=Object.keys(o);W.dbrun(`INSERT INTO lead_quotes(${k.join(",")}) VALUES(${k.map(()=>"?").join(",")})`,k.map(x=>o[x]));
 const e2=W.esc(r2);const q1=await W.pv({section:"escalations",ids:[e2.id],test_artifact:true}),q2=await W.pv({section:"inbox",ids:[r2.id]});ok("Q6 a lead with a quote keeps its escalation and quoted message",q1.summary.blocked.has_quote===1&&q2.summary.blocked.has_quote===1,[q1.summary,q2.summary]);}

// a held final quote: nothing around it can be archived, and it cannot be sent
{const W=await world();const r=await W.old(9995);W.dbrun("UPDATE lead_outreach SET id='fq1',status='draft',sent_at=NULL WHERE inbox_message_id=?",[r.id]);W.dbrun("INSERT INTO final_quote_reviews(outreach_id,lead_id,conversation_id,reason,created_at,updated_at) VALUES('fq1',?,?,'quantity_total',?,?)",[r.l,r.c,OLD,OLD]);const e=W.esc(r,"f");
 W.dbrun("INSERT INTO inbox_messages(id,platform,lead_id,conversation_id,message,status,created_at,updated_at) VALUES('m9995b','telegram',?,?,'x','new',?,?)",[r.l,r.c,OLD,OLD]);W.dbrun("UPDATE owner_escalations SET source_message_id='m9995b' WHERE id=?",[e.id]);
 const g=await W.pv({section:"escalations",ids:[e.id],test_artifact:true}),m=await W.pv({section:"inbox",ids:[r.id]}),o=await W.pv({section:"outreach",ids:["fq1"]});
 ok("Q7 a held final quote blocks the test archive, its message and its draft",g.count===0&&g.summary.blocked.final_quote_review===1&&m.count===0&&m.summary.blocked.final_quote_review===1&&o.count===0&&o.summary.blocked.final_quote_review===1,[g.summary?.blocked,m.summary?.blocked,o.summary?.blocked]);
 const s0=await W.call("/api/leads/outreach/send-telegram",{id:"fq1"},"POST");ok("Q8 and it cannot be sent as a draft",s0.status>=400&&W.q("SELECT status s FROM lead_outreach WHERE id='fq1'")[0].s==="draft",s0.status);}

// 16. cross-customer isolation
{const W=await world({ai:true});const mk=async(id,w)=>{const r=await W.old(id);W.fact(r,"destination",JSON.stringify(w));return r;};const a=await mk(9993,"ZZAAA"),b=await mk(9994,"ZZBBB");const ea=W.esc(a),eb=W.esc(b);
 await W.archive([ea.id]);await W.del({section:"inbox",ids:[a.id]});await W.del({section:"conversations",ids:[a.c]});
 const turn=async r=>{const k=W.AI.requests.length;await W.send(r.u,"جعبه چند؟");return JSON.stringify(W.AI.requests.slice(k).map(x=>x.body));};const pb=await turn(b),pa=await turn(a);
 ok("X1 another customer's fact and escalation are untouched",pb.includes("ZZBBB")&&!pb.includes("ZZAAA")&&W.q("SELECT status s FROM owner_decisions WHERE id=?",[eb.dec])[0].s==="PENDING"&&((await W.call("/api/owner-escalations?status=open",null,"GET")).body.items||[]).some(i=>i.id===eb.id));
 ok("X2 the archived customer does not see the other customer's fact",!pa.includes("ZZBBB")&&!pa.includes("ZZAAA"));
 const m=await W.pv({section:"inbox",ids:[b.id]});ok("X3 the other customer's message stays blocked",m.count===0&&m.summary.blocked.open_escalation===1,m.summary);}
// ---- PHASE 25G: context reset
const reset=(W,ids)=>W.del({section:"context",ids});
const ORDER_ASK="سفارشم کجاست؟";
// 17. the reset itself
{const W=await world();const r=await W.old(9101+900),o=W.order(r,"paid");const h=()=>JSON.stringify(["inbox_messages","lead_outreach","lead_orders","conversation_memory_facts","owner_escalations","owner_decisions","leads","lead_contacts","lead_conversations"].map(t=>W.q(`SELECT * FROM ${t} ORDER BY rowid`))),h0=h();
 for(const [nm,b] of [["section",{scope:"section"}],["page",{scope:"page",ids:[r.c]}],["filter",{scope:"filter",filter:{older_than_days:1}}]]){const x=await W.pv({section:"context",...b});ok("Z1 reset refused for "+nm,x.status===400&&x.error==="named_records_only",x);}
 const p=await W.pv({section:"context",ids:[r.c]});ok("Z2 an order-linked conversation can be reset, with its own phrase",p.count===1&&p.confirm_phrase==="بازنشانی گفتگو 1 مورد",p);await W.ex(p);
 ok("Z3 the reset changes no record at all",h()===h0);ok("Z4 the order keeps its paid flag",W.q("SELECT status s FROM lead_orders WHERE id=?",[o])[0].s==="paid");
 const r2=await W.old(10002);W.dbrun("UPDATE lead_outreach SET status='approved' WHERE lead_id=?",[r2.l]);const b=await W.pv({section:"context",ids:[r2.c]});ok("Z5 an open reply blocks the reset",b.count===0&&b.summary.blocked.open_reply===1,b.summary);
 const r3=await W.old(10003);W.dbrun("UPDATE inbox_messages SET created_at=? WHERE lead_id=?",[new Date().toISOString(),r3.l]);const c=await W.pv({section:"context",ids:[r3.c]});ok("Z6 a customer who is writing now blocks the reset",c.count===0&&c.summary.blocked.recent_customer_activity===1,c.summary);}
// 18. returning customer, replies, financial hold, order question
{const W=await world();const a=await W.old(10011),ctl=await W.old(10012);W.order(a,"paid");W.order(ctl,"paid");await reset(W,[a.c]);
 const leads=n(W,"SELECT COUNT(*) n FROM leads"),convs=n(W,"SELECT COUNT(*) n FROM lead_conversations");let c0=sends(W,a.u.id);
 const x=await W.send(a.u,"سلام، جعبه جواهر دارید؟");ok("Y1 returning customer: a nonfinancial reply is allowed",sends(W,a.u.id)>c0&&x.outcome?.customer_visible==="reply",x.outcome);
 ok("Y2 no duplicate identity",n(W,"SELECT COUNT(*) n FROM leads")===leads&&n(W,"SELECT COUNT(*) n FROM lead_conversations")===convs&&x.row.lead_id===a.l);
 const auto=()=>n(W,"SELECT COUNT(*) n FROM lead_outreach WHERE lead_id=? AND approved_by='inbound_auto_policy'",[a.l]);
 for(const [nm,t] of [["price","قیمت جعبه جواهر چنده؟"],["discount","تخفیف می‌دید؟"],["quantity price","۵۰۰ تا جعبه چقدر هزینه داره؟"],["payment claim","مبلغ رو واریز کردم"],["Arabic price","شكد سعر العلبة؟"],["Arabic transfer","حولت الفلوس"],["Arabic dollars","اريد العلبة بكم دولار"],["English","How much in dollars?"],["written number","ده هزار تومن میشه؟"],["written Arabic number","عشرة آلاف دينار"]]){const q0=auto(),y=await W.send(a.u,t);ok("Y3 "+nm+" stays with the owner",auto()===q0&&y.draft?.status==="draft",{a:y.action,o:y.outcome?.reason,d:y.draft?.status});}
 ok("Y4 the hold reason is recorded",n(W,"SELECT COUNT(*) n FROM system_events WHERE type='inbound_auto_reply_held' AND details_json LIKE '%reset_financial_owner%' AND details_json LIKE ?",["%"+a.l+"%"])>=1);
 const e0=n(W,"SELECT COUNT(*) n FROM owner_escalations WHERE lead_id=? AND status='open'",[a.l]),q0=auto(),y=await W.send(a.u,ORDER_ASK);
 ok("Y5 a historical order question is escalated",n(W,"SELECT COUNT(*) n FROM owner_escalations WHERE lead_id=? AND status='open'",[a.l])===e0+1&&W.q("SELECT status s FROM owner_escalations WHERE source_message_id=?",[y.row.id]).length===1,{a:y.action,e:e0});
 ok("Y6 and it gets no automatic status answer",auto()===q0&&y.action!=="order_status"&&!/پرداخت|ارسال ثبت/.test(W.q("SELECT message m FROM lead_outreach WHERE lead_id=? AND status='sent' ORDER BY created_at DESC LIMIT 1",[a.l])[0]?.m||""),y.action);
 const z=await W.send(ctl.u,ORDER_ASK);ok("Y7 control: without a reset the status answer is automatic",z.action==="order_status",z.action);}
{const W=await world();for(const [i,t] of [[1,"طلبي وين صار؟"],[2,"سفارشم کی میرسه"],[3,"شحنتي وين؟"],[4,"where is my order"],[5,"جنسم کی میرسه"],[6,"بارم چی شد"],[7,"where is my package"]]){const r=await W.old(10013+i*100);await reset(W,[r.c]);const e0=n(W,"SELECT COUNT(*) n FROM owner_escalations WHERE lead_id=?",[r.l]);const x=await W.send(r.u,t);ok("Y9 order question escalated: "+t,n(W,"SELECT COUNT(*) n FROM owner_escalations WHERE lead_id=?",[r.l])===e0+1&&x.outcome?.customer_visible!=="reply",{a:x.action,o:x.outcome?.customer_visible});}}
{const W=await world();const r=await W.old(10013);await reset(W,[r.c]);const e0=n(W,"SELECT COUNT(*) n FROM owner_escalations WHERE lead_id=?",[r.l]);await W.send(r.u,ORDER_ASK);ok("Y8 an order question with no order on file is escalated too",n(W,"SELECT COUNT(*) n FROM owner_escalations WHERE lead_id=?",[r.l])===e0+1);}
// 19. everything before the boundary is gone for the AI
{const W=await world({ai:true});const mk=async(id,w)=>{const r=await W.old(id,w+"INBOUND");W.dbrun("UPDATE lead_outreach SET message=? WHERE lead_id=?",[w+"REPLY",r.l]);W.fact(r,"destination",JSON.stringify(w+"DEST"));W.fact(r,"customer_name",JSON.stringify(w+"NAME"));W.fact(r,"conversation_summary",JSON.stringify({text:w+"SUMMARY"}));W.fact(r,"product_interest",JSON.stringify(w+"PRODUCT"));W.order(r,"paid");W.dbrun("UPDATE lead_orders SET order_number=? WHERE lead_id=?",[w+"ORDER",r.l]);
   const mc=W.q("SELECT name,\"notnull\" nn,dflt_value d,type FROM pragma_table_info('conversation_customer_media')").filter(k=>k.nn&&k.d===null),m={id:"cm"+id,lead_id:r.l,conversation_id:r.c,inbox_message_id:r.id,platform:"telegram",chat_id:String(r.u.id),telegram_message_id:"1",media_type:"photo",analysis_status:"analyzed",observation_json:JSON.stringify({note:w+"PHOTO"}),created_at:OLD,updated_at:OLD};for(const k of mc)if(!(k.name in m))m[k.name]=/INT|REAL/.test(k.type)?1:"x"+id;const mk2=Object.keys(m);W.dbrun(`INSERT INTO conversation_customer_media(${mk2.join(",")}) VALUES(${mk2.map(()=>"?").join(",")})`,mk2.map(k=>m[k]));return r;};
 const live=await mk(10021,"ZZLIVE"),gone=await mk(10022,"ZZOLD");
 const eg=W.esc(gone,"h");await reset(W,[gone.c]);
 const turn=async r=>{const k=W.AI.requests.length,x=await W.send(r.u,"جعبه جواهر دارید؟");return {p:JSON.stringify(W.AI.requests.slice(k).map(y=>y.body)),x};};const a=await turn(live),b=await turn(gone);
 ok("H0 the model was called in both",a.p.length>10&&b.p.length>10);
 for(const [nm,t] of [["fact","DEST"],["name","NAME"],["summary","SUMMARY"],["sent reply","REPLY"],["customer message","INBOUND"]]){ok("H1 control: live "+nm+" reaches the model",a.p.includes("ZZLIVE"+t),a.p.slice(0,100));ok("H2 archived "+nm+" does not",!b.p.includes("ZZOLD"+t));}
 ok("H3a control: a live order state reaches the model",/order_status[^,]{0,6}paid/.test(a.p),a.p.slice(0,80));ok("H3 no old order context",!b.p.includes("ZZOLDORDER")&&!/order_status[^,]{0,6}paid/.test(b.p));ok("H4 no old product",!b.p.includes("ZZOLDPRODUCT")&&!JSON.stringify(b.x.brain?.customer_known_facts||{}).includes("ZZOLDPRODUCT"));
 ok("H6 an open escalation from before the reset is not waited on",b.x.action!=="wait_for_owner",b.x.action);ok("H7 it stays open for the owner, unchanged",W.q("SELECT status s FROM owner_escalations WHERE id=?",[eg.id])[0].s==="open");
 ok("H8 business instructions still reach the model",b.p.includes("HAMZEHI BOX"));
 ok("H9 the facts themselves are preserved",n(W,"SELECT COUNT(*) n FROM conversation_memory_facts WHERE lead_id=? AND memory_key='destination' AND value_json LIKE '%ZZOLDDEST%'",[gone.l])===1);}
{const W=await world();const a=await W.old(10023),b=await W.old(10024);W.fact(a,"product_interest",'"ZZLIVEPRODUCT"');W.fact(b,"product_interest",'"ZZOLDPRODUCT"');await reset(W,[b.c]);const x=await W.send(a.u,"ممنون"),y=await W.send(b.u,"ممنون");ok("H4a control: a live product is known to the brain",JSON.stringify(x.brain?.customer_known_facts||{}).includes("ZZLIVEPRODUCT"),x.brain?.customer_known_facts);ok("H4b an old product is not",!JSON.stringify(y.brain?.customer_known_facts||{}).includes("ZZOLDPRODUCT")&&!!y.brain);}
// a real open escalation from before the reset is not waited on; a repeat without a reset is
{const W=await world();const ask="تحویل به استرالیا چند روز طول میکشه؟";const mk=async id=>{const r=await W.old(id);await W.send(r.u,ask);W.dbrun("UPDATE inbox_messages SET created_at=? WHERE lead_id=?",[OLD,r.l]);W.dbrun("UPDATE owner_escalations SET created_at=? WHERE lead_id=?",[OLD,r.l]);W.dbrun("UPDATE lead_outreach SET status='rejected' WHERE lead_id=? AND status<>'sent'",[r.l]);return r;};const a=await mk(10028),b=await mk(10029);await reset(W,[b.c]);const x=await W.send(a.u,ask),y=await W.send(b.u,ask);ok("H6a control: without a reset a repeat waits",x.action==="wait_for_owner",x.action);ok("H6b after a reset it does not wait on the old case",y.action!=="wait_for_owner"&&n(W,"SELECT COUNT(*) n FROM owner_escalations WHERE lead_id=? AND status='open'",[b.l])===2,y.action);}
// the customer's photo: within its time window, but before the boundary
{const W=await world({ai:true});const mk=async(id,obs)=>{const u={id,name:"U"+id,username:"u"+id};await W.send(u,"سلام");W.setMarket(u,"iran");const c=W.q("SELECT id,lead_id l,conversation_id c FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(id)])[0];W.dbrun("INSERT INTO conversation_customer_media(id,lead_id,conversation_id,inbox_message_id,platform,chat_id,telegram_message_id,update_id,media_type,file_id,file_unique_id,mime_type,analysis_status,observation_json,created_at,updated_at) VALUES(?,?,?,?,'telegram',?,?,?,'photo','f','u'||?,'image/jpeg','analyzed',?,?,?)",["cm"+id,c.l,c.c,c.id,String(id),"1"+id,String(id),id,JSON.stringify({summary:obs,product_type:obs}),new Date().toISOString(),new Date().toISOString()]);return {...c,u};};
 const live=await mk(10025,"ZZLIVEPHOTO"),gone=await mk(10026,"ZZGONEPHOTO");W.dbrun("INSERT INTO cleanup_trash(id,section,record_id,op_id,prior_json,state,deleted_by,deleted_at) VALUES('ph','context',?,'op','{}','trashed','admin',?)",[gone.c,new Date().toISOString()]);await new Promise(z=>setTimeout(z,5));
 const turn=async r=>{const k=W.AI.requests.length;await W.send(r.u,"این مدل چنده؟");return JSON.stringify(W.AI.requests.slice(k).map(x=>x.body));};const a=await turn(live),b=await turn(gone);const ref=c=>W.q("SELECT value_json v FROM conversation_memory_facts WHERE conversation_id=? AND memory_key='customer_image_reference' AND status='active'",[c.c])[0]?.v||"";ok("H5a control: a live photo is resolved as the reference",ref(live).includes("cm10025"),ref(live));ok("H5 a photo from before the boundary is not",b.length>10&&!ref(gone).includes("cm10026")&&!b.includes("ZZGONEPHOTO"),ref(gone));}
{const W=await world();const mk=async id=>{const r=await W.old(id);W.fact(r,"destination",'"تبریز"');return r;};const a=await mk(10031),b=await mk(10032);await reset(W,[b.c]);const said="ما در شیراز هستیم و جعبه می‌خواهیم";await W.send(a.u,said);await W.send(b.u,said);const d=c=>W.q("SELECT value_json v FROM conversation_memory_facts WHERE conversation_id=? AND memory_key='destination' AND status='active'",[c.c])[0]?.v;ok("H10 control: a weak mention keeps a live value",d(a)==='"تبریز"',d(a));ok("H11 a weak mention replaces a value from before the reset",d(b)==='"شیراز"',d(b));}
// 20. opt-out, duplicates, restore, concurrency, isolation
{const W=await world();const r=await W.old(10041,"STOP");await reset(W,[r.c]);const has=async()=>((await W.call("/api/sales/auto-messaging",null,"GET")).body?.opt_out?.opted_out||[]).some(x=>x.lead_id===r.l);ok("V1 opt-out survives a reset",await has());W.out(r,{id:"v41",channel:"telegram",message:"x",status:"pending_approval"});const g=await W.call("/api/leads/outreach/transition",{id:"v41",action:"approve"},"POST");ok("V2 the approve gate still refuses",g.status===409&&g.body?.reason==="customer_opted_out",g);}
{const W=await world();const r=await W.old(10051);await reset(W,[r.c]);const u=r.u,m={update_id:99001,message:{message_id:4242,date:1,from:{id:u.id,is_bot:false,first_name:"U"},chat:{id:u.id,type:"private"},text:"سلام، جعبه جواهر دارید؟"}};await W.post(m);const c=sends(W,u.id),rows=n(W,"SELECT COUNT(*) n FROM inbox_messages");await W.post({...m,update_id:99002});ok("V3 a duplicate delivery after reset sends once",c>=1&&sends(W,u.id)===c&&n(W,"SELECT COUNT(*) n FROM inbox_messages")===rows,{c,after:sends(W,u.id)});
 const old=W.q("SELECT external_id e FROM inbox_messages WHERE id=?",[r.id])[0].e,mid=Number(String(old).split(":")[1]);const c2=sends(W,u.id);await W.post({update_id:99003,message:{...m.message,message_id:mid,text:"سلام"}});ok("V4 redelivery of a message from before the reset sends nothing",mid>0&&sends(W,u.id)===c2&&n(W,"SELECT COUNT(*) n FROM inbox_messages")===rows,{mid});}
{const W=await world();const r=await W.old(10061);W.dbrun("UPDATE lead_outreach SET status='draft',sent_at=NULL,id='rv1' WHERE inbox_message_id=?",[r.id]);W.out(r,{id:"rv2",channel:"telegram",message:"old approved",status:"rejected",approved_at:OLD,approved_by:"owner"});W.fact(r,"destination",'"ZZBACK"');await reset(W,[r.c]);const tg=sends(W,r.u.id);const b=await W.back({section:"context",ids:[r.c]});
 ok("V5 restoring a reset sends nothing and approves nothing",b.result?.done===1&&sends(W,r.u.id)===tg&&W.q("SELECT status s,approved_at a FROM lead_outreach WHERE id='rv1'")[0].s==="draft"&&W.q("SELECT status s FROM lead_outreach WHERE id='rv2'")[0].s==="rejected",b);
 await tick(W);ok("V6 no send observed on the next tick",sends(W,r.u.id)===tg);ok("V7 the restore is recorded",n(W,"SELECT COUNT(*) n FROM cleanup_trash WHERE section='context' AND state='restored' AND restored_at IS NOT NULL")===1);}
{const W=await world();const r=await W.old(10071);const f=new Date(Date.now()+60000).toISOString();W.dbrun("INSERT INTO cleanup_trash(id,section,record_id,op_id,prior_json,state,deleted_by,deleted_at) VALUES('raceR','context',?,'op','{}','trashed','admin',?)",[r.c,f]);const c=sends(W,r.u.id);const x=await W.send(r.u,"جعبه جواهر دارید؟");ok("V8 a message that lands before the reset time is not answered alone",sends(W,r.u.id)===c&&x.draft?.status==="draft",{o:x.outcome?.reason});
 W.dbrun("UPDATE cleanup_trash SET deleted_at=? WHERE id='raceR'",[OLD]);const c1=sends(W,r.u.id);await W.send(r.u,"جعبه طلایی دارید؟");ok("V9 the next message is answered",sends(W,r.u.id)>c1);
 const q=await W.old(10072);const p=await W.pv({section:"context",ids:[q.c]});await W.send(q.u,"سلام");const e=await W.ex(p);ok("V10 a message between preview and execute cancels the reset",e.result?.done===0&&e.result?.skipped===1,e);}
{const W=await world({ai:true});const a=await W.old(10081),b=await W.old(10082);W.fact(a,"destination",'"ZZAAA"');W.fact(b,"destination",'"ZZBBB"');W.order(b,"paid");await reset(W,[a.c]);const k=W.AI.requests.length;await W.send(b.u,"جعبه جواهر دارید؟");const p=JSON.stringify(W.AI.requests.slice(k).map(y=>y.body));ok("V11 another customer's context is untouched",p.includes("ZZBBB")&&!p.includes("ZZAAA"));const y=await W.send(b.u,ORDER_ASK);ok("V12 another customer's order answer is untouched",y.action==="order_status",y.action);const k2=W.AI.requests.length;await W.send(a.u,"جعبه جواهر دارید؟");const p2=JSON.stringify(W.AI.requests.slice(k2).map(y=>y.body));ok("V13 the reset customer sees neither",p2.length>10&&!p2.includes("ZZAAA")&&!p2.includes("ZZBBB"));}
// several conversations of one lead: a fact in the OTHER conversation, read through the lead profile
{const W=await world({ai:true});const mk=async(id,name)=>{const a=await W.old(id),c2="c2x"+id,m="m2x"+id;W.dbrun("INSERT INTO lead_conversations(id,lead_id,platform,status,created_at,updated_at) VALUES(?,?,'instagram','open',?,?)",[c2,a.l,OLD,OLD]);W.dbrun("INSERT INTO inbox_messages(id,platform,lead_id,conversation_id,message,status,created_at,updated_at) VALUES(?,'instagram',?,?,'x','new',?,?)",[m,a.l,c2,OLD,OLD]);W.fact({id:m,l:a.l,c:c2},"customer_name",JSON.stringify(name));return {...a,c2};};
 const live=await mk(10091,"ZZPROFILELIVE"),gone=await mk(10092,"ZZPROFILEGONE");await reset(W,[gone.c2]);const turn=async r=>{const k=W.AI.requests.length;await W.send(r.u,"جعبه جواهر دارید؟");return JSON.stringify(W.AI.requests.slice(k).map(y=>y.body));};const a=await turn(live),b=await turn(gone);
 ok("V14a control: a live profile fact from another conversation reaches the model",a.includes("ZZPROFILELIVE"),a.slice(0,100));ok("V14 a reset fact does not return through the lead profile",b.length>10&&!b.includes("ZZPROFILEGONE"));}
// ---- PHASE 25H: numbers in a reply after a reset
{const IDX=await import(pathToFileURL(path.join(SRC,"index.js")).href+"?n="+Math.random());const T=(action,said,reply,category="other")=>IDX.resetFinancialTurn({message:said,category},{next_sales_action:action},{message:reply});
 const go=[["answer_sizes","سایز دارید؟","سایز ۲۰ در ۳۰ سانت داریم"],["answer_sizes","المقاسات؟","٢٠×٣٠ سم"],["answer_sizes","sizes?","20x30x10 cm available"],["answer_sizes","اندازه؟","20 × 30 سانتی‌متر و ۱۵ در ۱۵ سانت"],["answer_knowledge","چند مدل دارید؟","۱۲ مدل داریم"],["answer_knowledge","كم موديل؟","عدنا ١٢ موديل و ٥ الوان"],["answer_knowledge","how many models","We have 12 models in 5 colours"],["answer_catalog","کاتالوگ","۸ طرح و ۳ رنگ موجود است"],["answer_knowledge","ضخامت؟","ضخامت 2.5 میلی متر است"],["answer_moq","حداقل سفارش چنده؟","حداقل سفارش ۱۰۰ عدد است","asks_moq"],["answer_moq","اقل عدد شكد؟","الحد الأدنى للطلب ١٠٠ قطعة","asks_moq"],["answer_moq","what is the moq","Minimum order is 100 pieces","asks_moq"],["answer_moq","حداقل؟","100","asks_moq"],["ask_quantity","۵۰۰ تا موجوده؟","چند عدد لازم دارید؟"],["greet","سلام","سلام، خوش آمدید"],["answer_sizes","سایز؟","سایز موجود: انگشتر کوچک: 5x5."],["answer_sizes","سایز؟","۱۲ مدل در اندازه ۲۰ در ۳۰ سانت"],["answer_moq","اقل كمية؟","أقل كمية للطلب ١٠٠ قطعة","asks_moq"]];
 for(const [a,x,y,c] of go)ok("U1 allowed: "+y,T(a,x,y,c)===false,[a,x,y]);
 const stop=[["answer_price","قیمت؟","۱۲۰ هزار تومان"],["negotiate","تخفیف؟","۱۰ درصد"],["accept_offer","قبول","ثبت شد"],["commercial_owner","ok","بررسی می‌کنم"],["payment_info","کارت؟","شماره کارت"],["payment_claim_unmatched","واریز کردم","بررسی می‌کنم"],["order_status","سفارشم؟","ثبت شده"],["answer_knowledge","هر عدد؟","هر عدد 80300"],["answer_knowledge","x","۱۲۰"],["answer_knowledge","x","١٢٠"],["answer_knowledge","x","120"],["answer_knowledge","x","۲۰ در ۳۰ سانت ۵۰ دلار"],["answer_knowledge","x","20x30 cm for 50"],["answer_knowledge","x","۵ مدل، هر کدام ۵۰۰"],["answer_knowledge","x","٥٠٠ دينار"],["answer_knowledge","x","500 dinars total"],["answer_knowledge","x","$50"],["answer_knowledge","x","ده هزار تومن"],["answer_knowledge","x","عشرة آلاف"],["answer_knowledge","x","مبلغ کل"],["answer_knowledge","x","۱۰۰ عدد"],["ask_size","x","۱۰۰ تا"],["answer_knowledge","x","۲ میلیون"],["answer_knowledge","x","total 500"],["answer_knowledge","x","10% off"],["answer_moq","x","حداقل سفارش ۱۰۰ عدد، هر عدد ۵۰۰ تومان","asks_moq"],["answer_moq","x","حداقل سفارش ۱۰۰ عدد ۵۰","asks_moq"],["answer_moq","تخفیف چقدر؟","حداقل سفارش ۱۰۰ عدد","asks_moq"],["answer_moq","x","Minimum order is 100 pieces at 5 dollars","asks_moq"],["unknown_new_action","x","سلام"],["answer_sizes","قیمت چنده؟","۲۰ در ۳۰ سانت"],["answer_sizes","x","۲۰ در ۳۰ سانت","asks_price"],["answer_knowledge","x","20x"],["answer_knowledge","x","100×5"],["answer_knowledge","x","5 در 100"],["answer_knowledge","x","10 فی 500"],["answer_knowledge","x","50 USD"],["answer_knowledge","x","IQD"],["answer_knowledge","x","1,200"],["answer_knowledge","x","۱٬۲۰۰"],["answer_knowledge","x","2.5"],["answer_knowledge","x","مية"],["answer_knowledge","x","الف"],["answer_knowledge","x","خمسين دولار"],["answer_knowledge","x","بیست و پنج"],["answer_knowledge","x","پنجهزار"],["answer_knowledge","x","رایگان"],["answer_knowledge","x","free shipping"],["answer_knowledge","x","دینار"],["answer_knowledge","x","دينار"],["answer_knowledge","x","تكلفة"],["answer_knowledge","بكم؟","نعم"],["answer_knowledge","x","بیعانه"],["answer_knowledge","x","یورو"],["answer_knowledge","x","ده درصد"],["answer_knowledge","x","شماره حساب"],["answer_knowledge","x","fifty thousand"],["answer_knowledge","x","500 mm 20"],["answer_knowledge","سعر؟","نعم"]];
 for(const [a,x,y,c] of stop)ok("U2 held: "+a+" "+y,T(a,x,y,c)===true,[a,x,y]);
 // 2026-11-08 live hold (draft 4fc52240): an AI colour suggestion naming the catalog sizes «(۶x۶)» «(۵x۵)» with the brain's grounded numbers
 const G=[500,2,3,5,7,6,22,8,20,11,9,13,16],TG=(action,said,reply,nums=G,category="other")=>IDX.resetFinancialTurn({message:said,category},{next_sales_action:action,answer_numbers:nums},{message:reply});
 const live="سلام! برای جعبه انگشتر رنگ‌های کلاسیک مثل مشکی سلفون و سرمه‌ای سلفون حس لوکس می‌دن و طلاکوب روشون خیلی خوب درمیاد. جعبه انگشتر بزرگ (۶x۶) مدنظرتونه یا انگشتر کوچک (۵x۵)؟",said="سلام برای جعبه انگشتر چه رنگ‌هایی پیشنهاد می‌کنی و چرا؟";
 ok("U8 a colour suggestion with grounded catalog sizes is not held after a reset",TG("answer_knowledge",said,live)===false);
 ok("U8 the same on advise_colors",TG("advise_colors",said,live)===false);
 const held=[["U9 ungrounded sizes are still held","answer_knowledge",said,live,[]],["U9 a bare amount beside grounded sizes is held","answer_knowledge",said,"(۶x۶) هر کدام ۵۰۰",G],["U9 a large grounded number in a dimension is held","answer_knowledge","x","500x2",G],["U9 a money word beside a grounded size is held","answer_knowledge","x","(۶x۶) ۵۰ هزار",G],["U9 a price action is held","answer_price",said,live,G],["U9 a price question is held","answer_knowledge","قیمت جعبه ۶x۶ چنده؟",live,G,"asks_price"],["U9 a payment reply is held","payment_info","کارت؟","(۶x۶) شماره کارت",G],["U9 a thousands group is not read as a decimal size","answer_knowledge","x","1,000x5",[1,5]]];
 for(const [name,a,x,y,nums,c] of held)ok(name,TG(a,x,y,nums,c)===true,[a,y]);
 // 2026-11-08 live hold (draft 87704902): the customer named colours in an advice question → pre-order colour pick (order_details)
 const N2=[1,2,3,5,7,6,22,8,20,11,9,13,16],PO=(said,reply,pre,{nums=N2,category="other",action="order_details"}={})=>IDX.resetFinancialTurn({message:said,category},{next_sales_action:action,answer_numbers:nums,order_details_pre_order:pre},{message:reply});
 const said2="به نظرت یک جعبه انگشتری لوکس، ترکیب مشکی و طلایی بهتره یا سرمه‌ای و طلایی؟ دلیل انتخابت رو توضیح بده.";
 const live2="برای حس لوکس، ترکیب مشکی سلفون و طلایی سلفون انتخاب مطمئن‌تریه؛ کنتراست بالایی داره، کلاسیک و پرابهت دیده می‌شه و طلایی کنارش جلوه‌ی جواهر رو بیشتر می‌کنه. سرمه‌ای سلفون با طلایی سلفون هم شیک و خاصه، ولی حس آرام‌تر و متفاوت‌تری داره و برای برندی که می‌خواد کمی از حالت رایج فاصله بگیره عالیه. جعبه برای انگشتر کوچیک می‌خواید (5x5) یا انگشتر بزرگ (6x6)؟";
 ok("U10 the live pre-order colour answer is not held after a reset",PO(said2,live2,true)===false);
 const held2=[["U11 order_details after an accepted deal (no pre-order flag) is held",said2,live2,false,{}],["U11 the flag on another action does not help",said2,live2,true,{action:"accept_offer"}],["U11 a pre-order reply with a price is held",said2,"مشکی و طلایی هر عدد ۸۰ هزار تومن",true,{}],["U11 a pre-order reply naming an order total is held",said2,"سفارش ۵۰۰ عددی شما ثبت شد",true,{}],["U11 a pre-order reply with a payment instruction is held",said2,"لطفاً بیعانه رو واریز کنید",true,{}],["U11 a pre-order reply with an ungrounded size is held",said2,"جعبه (7x9) مناسبه",true,{nums:[]}],["U11 a price question is held even on a pre-order turn","قیمت مشکی طلایی چنده؟",live2,true,{category:"asks_price"}]];
 for(const [name,x,y,pre,o] of held2)ok(name,PO(x,y,pre,o)===true,[y.slice(0,40)]);}
// the MOQ wording is not an order question
{const W=await world();const r=await W.old(10101);await reset(W,[r.c]);const e=n(W,"SELECT COUNT(*) n FROM owner_escalations WHERE lead_id=?",[r.l]);const x=await W.send(r.u,"حداقل سفارش چنده؟");ok("U3 a MOQ question is not treated as a historical order question",x.action!=="commercial_owner"&&x.brain?.needs_owner_reason!=="commercial_owner_review_required"&&e===0,{a:x.action,n:x.brain?.needs_owner_reason});}
// the real send path: priced catalog, after a reset
{const W=await world();const T0="2026-10-01T00:00:00.000Z";W.dbrun("INSERT INTO commercial_price_items(id,product_key,product_name,sku,market,currency,unit_price_minor,moq,version,active,effective_from,effective_until,approved_by,approved_at,created_at,updated_at) VALUES('R1','k1','انگشتر کوچک · 5x5 · 3 تکه',NULL,'IRAN','TOMAN',66000,100,1,1,NULL,NULL,'admin',?,?,?)",[T0,T0,T0]);
 const a=await W.old(10121),b=await W.old(10122),c=await W.old(10123),ctl=await W.old(10124);await reset(W,[a.c,b.c,c.c]);
 const x=await W.send(a.u,"سایز انگشتر کوچک چیه؟"),x0=await W.send(ctl.u,"سایز انگشتر کوچک چیه؟");ok("U4 the reset gate adds no hold to a size reply: the same outcome as without a reset",x.action==="answer_sizes"&&x.outcome?.reason!=="reset_financial_owner"&&x.outcome?.customer_visible===x0.outcome?.customer_visible&&x.outcome?.reason===x0.outcome?.reason,{a:x.outcome,b:x0.outcome});
 const y=await W.send(b.u,"حداقل سفارش انگشتر کوچک 3 تکه چنده؟");ok("U5 an approved MOQ reply is actually sent after a reset",y.action==="answer_moq"&&y.outcome?.customer_visible==="reply",{a:y.action,o:y.outcome?.reason,d:y.draft?.message});
 const z=await W.send(c.u,"قیمت انگشتر کوچک 3 تکه برای 1000 عدد چنده؟");const l=(await W.call("/api/final-quotes",null,"GET")).body;ok("U6 a real total after a reset is held and listed",z.outcome?.customer_visible!=="reply"&&(z.draft?.status==="draft")&&(l.items||[]).some(i=>i.lead_id===c.l),{a:z.action,o:z.outcome?.reason,n:(l.items||[]).length});
 const h=(await W.call("/api/owner-escalations",null,"GET")).body.archived_test;const heldPrice=await W.send(a.u,"قیمت انگشتر کوچک 3 تکه چنده؟");const h2=(await W.call("/api/owner-escalations",null,"GET")).body.archived_test;ok("U7 a held reply is counted on the owner panel",heldPrice.draft?.status==="draft"&&h2.held===h.held+1,{h,h2,e:heldPrice.draft?.error_detail});}
// Owner visibility of a held final quote, with Telegram fully mocked
{const W=await world();const r=await W.old(10111);await reset(W,[r.c]);W.dbrun("UPDATE lead_outreach SET id='fqh',status='draft',sent_at=NULL,error_detail='final_quote_owner_approval' WHERE inbox_message_id=?",[r.id]);W.dbrun("INSERT INTO final_quote_reviews(outreach_id,lead_id,conversation_id,reason,created_at,updated_at) VALUES('fqh',?,?,'quantity_total',?,?)",[r.l,r.c,new Date().toISOString(),new Date().toISOString()]);
 const l=(await W.call("/api/final-quotes",null,"GET")).body;const it=(l.items||[]).find(x=>x.outreach_id==="fqh");ok("B1 a held final quote in a reset conversation is on the Final Quotes list",it?.state==="pending",it);
 ok("B2 the list reports it as not delivered",l.summary?.alerts_not_delivered>=1&&l.owner_alert?.configured===false,[l.summary,l.owner_alert]);
 const IDX=await import(pathToFileURL(path.join(SRC,"final-quote-review.js")).href);const t0=W.tg.length,x=await IDX.notifyFinalQuoteOwner(W.env,"fqh");ok("B3 with no destination nothing is sent and the reason is kept",x.sent===false&&W.tg.length===t0&&W.q("SELECT alert_status s FROM final_quote_reviews WHERE outreach_id='fqh'")[0].s==="destination_missing",x);
 ok("B4 the quote stays held",W.q("SELECT status s FROM lead_outreach WHERE id='fqh'")[0].s==="draft");
 W.dbrun("DELETE FROM final_quote_reviews WHERE outreach_id='fqh'");const m=(await W.call("/api/final-quotes",null,"GET")).body.summary;ok("B5 a held quote with no review row is still reported",m.missing_review===1,m);}
// the background order reconciler reads customer details: not from before the boundary
{const W=await world();const mk=async id=>{const r=await W.old(id);W.fact(r,"customer_name",JSON.stringify("ZZBG"+id));return r;};const a=await mk(10131),b=await mk(10132);await reset(W,[b.c]);await new Promise(z=>setTimeout(z,5));const now=new Date().toISOString();
 for(const r of [a,b]){const cand={offer:{accepted_in:r.id,offer_hash:"oh"+r.id,product:"p",quantity:100},status:"accepted"};W.dbrun("INSERT INTO owner_decisions(id,status,priority,decision_type,fingerprint,lead_id,conversation_id,question,known_json,created_at,updated_at) VALUES(?,'PENDING','HIGH','ORDER_CANDIDATE_APPROVAL',?,?,?,'q',?,?,?)",["dc"+r.id,"ORDER_CANDIDATE|"+r.id,r.l,r.c,JSON.stringify({order_candidate:cand}),now,now]);}
 const prep=W.env.DB.prepare.bind(W.env.DB),seen={};W.env.DB.prepare=sql=>{const st=prep(sql);if(!/selected_colors/.test(sql)||!/customer_name/.test(sql))return st;const bind=st.bind.bind(st);st.bind=(...v)=>{const bound=bind(...v),all=bound.all.bind(bound);bound.all=async()=>{const r=await all();seen[v[1]]=r.results||[];return r;};return bound;};return st;};
 await tick(W);W.env.DB.prepare=prep;
 ok("G1 control: the reconciler reads a live customer's details",(seen[a.c]||[]).some(x=>String(x.value_json).includes("ZZBG10131")),Object.keys(seen).length);
 ok("G2 it reads nothing from before the boundary",!!seen[b.c]&&!seen[b.c].some(x=>String(x.value_json).includes("ZZBG10132")),seen[b.c]);}
done();
