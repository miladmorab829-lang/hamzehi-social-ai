// PHASE 26 — opt-out safety gate on the AUTOMATIC inbound path. A customer who asked us to stop (or whose history holds a possible
// stop request, or whose history cannot be read in full) receives NO automatic message from the inbound path: no reply, no
// acknowledgement, no hand-off. The draft stays for the owner. Customers who never opted out keep their normal nonfinancial replies.
// Every blocking check has a live control. Synthetic data only; Telegram and the AI are in-process mocks.
import fs from "node:fs";import path from "node:path";import {fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase26_optout_inbound");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const MIG=fs.readFileSync(path.join(REPO,"owner-actions/phase25-delete-system/01-migration.sql"),"utf8");
const ORCH=fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8");
const OLD=new Date(Date.now()-30*86400000).toISOString();
const world=async()=>{const W=await makeWorld({aiBrain:"off",extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on"}});W.d1.db.exec(ORCH);
 for(const p of ["/api/quotes","/api/si/knowledge/product","/api/owner-escalations","/api/leads/outreach","/api/content/pipeline"])await W.call(p,null,"GET");W.d1.db.exec(MIG);
 W.rq=(p,b)=>W.run(new Request("https://w.test"+p,{method:"POST",headers:{Authorization:"Bearer tok","Content-Type":"application/json"},body:JSON.stringify(b)})).then(async r=>({status:r.status,...await r.json()}));
 W.pv=b=>W.rq("/api/cleanup/preview",{action:"trash",scope:"ids",...b});
 W.ex=p=>W.rq("/api/cleanup/execute",{token:p.token,confirm:p.confirm_phrase||undefined});
 W.del=async b=>{const p=await W.pv(b);return p.token?W.ex(p):p;};
 // an old (archived-era) conversation: customer messages aged 30 days, our replies marked sent
 W.old=async(id,texts=["سلام"])=>{const u={id,name:"U"+id,username:"u"+id};for(const t of texts)await W.send(u,t);W.setMarket(u,"iran");
  const r=W.q("SELECT id,lead_id l,conversation_id c FROM inbox_messages WHERE provider_sender_id=? ORDER BY created_at LIMIT 1",[String(id)])[0];
  W.dbrun("UPDATE inbox_messages SET created_at=? WHERE lead_id=?",[OLD,r.l]);W.dbrun("UPDATE lead_outreach SET status='sent',sent_at=? WHERE lead_id=?",[OLD,r.l]);return {...r,u};};
 return W;};
const n=(W,sql,a=[])=>W.q(sql,a)[0].n;
// every send* to this chat; a multipart body (photo/album) cannot be attributed, so it is counted for EVERY chat (never undercounted)
const sends=(W,id)=>W.tg.filter(x=>{if(!/^send/.test(x.method))return false;if(x.body==="(multipart)")return true;try{return String(JSON.parse(x.body).chat_id)===String(id);}catch{return true;}}).length;
const auto=(W,lead)=>n(W,"SELECT COUNT(*) n FROM lead_outreach WHERE lead_id=? AND approved_by IN ('inbound_auto_policy','inbound_ack_policy')",[lead]);
const NORMAL=["سلام، جعبه جواهر دارید؟","جعبه انگشتر مشکی دارید؟","ممنون، کاتالوگ رو می‌فرستید؟"];
const silent=(W,u,lead,c0,a0,x)=>sends(W,u.id)===c0&&auto(W,lead)===a0&&!x.ack&&x.outcome?.customer_visible==="none";

// 1. control: a new customer who never opted out gets a normal nonfinancial reply
{const W=await world();const u={id:7101,name:"A",username:"a7101"};const x=await W.send(u,NORMAL[0]);
 ok("O1 control: a new customer's nonfinancial message gets an automatic reply",x.outcome?.customer_visible==="reply"&&sends(W,u.id)===1,x.outcome);
 const y=await W.send(u,NORMAL[1]);ok("O1b control: the second ordinary message is answered too",y.outcome?.customer_visible==="reply"&&sends(W,u.id)===2,y.outcome);}

// 2. explicit stop request, then a new message
{const W=await world();const u={id:7102,name:"B",username:"b7102"};const s=await W.send(u,"لطفاً دیگه پیام ندید");const lead=s.row.lead_id;
 ok("O2 the stop request itself gets no automatic message (no reply, no acknowledgement)",sends(W,u.id)===0&&auto(W,lead)===0&&!s.ack,{outcome:s.outcome,sends:sends(W,u.id)});
 const c0=sends(W,u.id),a0=auto(W,lead);const x=await W.send(u,NORMAL[0]);
 ok("O3 after opting out, a new ordinary message gets NO automatic reply or acknowledgement",silent(W,u,lead,c0,a0,x),{outcome:x.outcome,ack:x.ack,sends:sends(W,u.id)});
 ok("O4 the message is still stored and linked to the same lead (nothing lost)",x.row&&x.row.lead_id===lead&&x.row.conversation_id===s.row.conversation_id);
 ok("O5 the draft stays for the owner, marked with the opt-out reason",x.draft&&x.draft.status==="draft"&&x.draft.error_detail==="customer_opted_out",x.draft&&{s:x.draft.status,e:x.draft.error_code,d:x.draft.error_detail});
 ok("O6 the hold is audited with its reason",n(W,"SELECT COUNT(*) n FROM system_events WHERE type='inbound_auto_reply_held' AND details_json LIKE '%customer_opted_out%' AND details_json LIKE ?",["%"+x.row.id+"%"])===1);
 for(const [i,t] of [["Arabic","شكد سعر العلبة؟"],["English","hello, do you have ring boxes?"],["greeting","سلام"]].entries()){const c=sends(W,u.id),a=auto(W,lead),z=await W.send(u,t[1]+" "+i);
  ok("O7 still silent for a later "+t[0]+" message",silent(W,u,lead,c,a,z),z.outcome);}}

// 3. English and Iraqi Arabic stop requests
for(const [id,stop] of [[7103,"STOP"],[7104,"لا تراسلني"],[7105,"Please stop messaging me"]]){const W=await world();const u={id,name:"C",username:"c"+id};const s=await W.send(u,stop);
 const c0=sends(W,u.id),a0=auto(W,s.row.lead_id),x=await W.send(u,NORMAL[0]);ok("O8 opt-out '"+stop+"' blocks the next automatic reply",sends(W,u.id)===0&&silent(W,u,s.row.lead_id,c0,a0,x),x.outcome);}

// 4. possible stop request (review) — automatic messages wait for the owner
{const W=await world();const u={id:7106,name:"D",username:"d7106"};const s=await W.send(u,"بس کن");const c0=sends(W,u.id),a0=auto(W,s.row.lead_id),x=await W.send(u,NORMAL[0]);
 ok("O9 a possible stop request holds automatic replies for the owner (review, fail-closed)",silent(W,u,s.row.lead_id,c0,a0,x)&&x.draft?.error_detail==="opt_out_needs_review",{o:x.outcome,d:x.draft?.error_detail});}

// 5. history that cannot be read in full (> 500 messages) → fail-closed
{const W=await world();const u={id:7107,name:"E",username:"e7107"};const s=await W.send(u,NORMAL[0]);const lead=s.row.lead_id;
 const cols=W.q("SELECT name FROM pragma_table_info('inbox_messages')").map(c=>c.name),sel=cols.map(c=>c==="id"?"id||'-h'||?":c==="external_id"?"external_id||'-h'||?":c==="created_at"?"?":c==="message"?"'سلام'":c==="status"?"'trashed'":c).join(",");
 for(let i=0;i<505;i++)W.dbrun(`INSERT INTO inbox_messages(${cols.join(",")}) SELECT ${sel} FROM inbox_messages WHERE id=?`,[i,i,new Date(Date.parse(OLD)-i*60000).toISOString(),s.row.id]);
 const c0=sends(W,u.id),a0=auto(W,lead),x=await W.send(u,NORMAL[1]);
 ok("O10 a history too long to check fully holds the automatic reply (fail-closed)",silent(W,u,lead,c0,a0,x)&&x.draft?.error_detail==="opt_out_needs_review",{o:x.outcome,d:x.draft?.error_detail});}

// 6. returning customer and archived (reset) test conversation
{const W=await world();const back=await W.old(7108,["سلام","دیگه به من پیام نده"]),ctl=await W.old(7109,["سلام"]);
 const c0=sends(W,back.u.id),a0=auto(W,back.l),x=await W.send(back.u,NORMAL[0]);
 ok("O11 a returning customer who opted out a month ago gets no automatic reply",silent(W,back.u,back.l,c0,a0,x)&&x.row.lead_id===back.l,x.outcome);
 const y=await W.send(ctl.u,NORMAL[0]);ok("O12 control: a returning customer who never opted out is answered",y.outcome?.customer_visible==="reply",y.outcome);
 // the old conversation is archived as test data (context reset) — the old stop request still protects the customer
 const W2=await world();const a=await W2.old(7110,["سلام","لغو"]),b=await W2.old(7111,["سلام"]);
 const ra=await W2.del({section:"context",ids:[a.c]}),rb=await W2.del({section:"context",ids:[b.c]});
 ok("O13 setup: both conversations were reset (archived context)",ra.result?.done===1&&rb.result?.done===1,[ra,rb]);
 const c1=sends(W2,a.u.id),a1=auto(W2,a.l),z=await W2.send(a.u,NORMAL[0]);
 ok("O14 an opt-out made before an archive/reset still blocks automatic replies after it",silent(W2,a.u,a.l,c1,a1,z),z.outcome);
 const v=await W2.send(b.u,NORMAL[0]);ok("O15 control: after a reset, a customer who never opted out is answered normally",v.outcome?.customer_visible==="reply",v.outcome);}

// 7. duplicate delivery of the same Telegram update
{const W=await world();const u={id:7112,name:"F",username:"f7112"};const m={message_id:900,date:Math.floor(Date.now()/1000),from:{id:u.id,is_bot:false,first_name:u.name,username:u.username},chat:{id:u.id,type:"private",username:u.username},text:NORMAL[0]};
 await W.post({update_id:5001,message:m});await W.post({update_id:5001,message:m});await W.post({update_id:5002,edited_message:{...m,text:"لطفاً دیگه پیام ندید"}});
 ok("O16 a redelivered update creates one inbox row and at most one automatic reply",n(W,"SELECT COUNT(*) n FROM inbox_messages WHERE external_id=?",[u.id+":900"])===1&&sends(W,u.id)===1,sends(W,u.id));}

// 8. other customers are not affected by one customer's opt-out
{const W=await world();const a={id:7113,name:"G",username:"g7113"},b={id:7114,name:"H",username:"h7114"};await W.send(a,"STOP");const x=await W.send(b,NORMAL[0]);
 ok("O17 another customer's opt-out does not silence this customer",x.outcome?.customer_visible==="reply"&&sends(W,b.id)===1,x.outcome);}

// 9. a financial question from a customer who has NOT opted out is never answered with an amount automatically
{const W=await world();const u={id:7115,name:"I",username:"i7115"};await W.send(u,NORMAL[0]);
 for(const t of ["قیمت نهایی ۵۰ عدد با ارسال به تهران چند می‌شود؟","تخفیف می‌دید؟","مبلغ رو واریز کردم"]){const before=W.q("SELECT COUNT(*) n FROM lead_outreach WHERE recipient=? AND status='sent'",[String(u.id)])[0].n;await W.send(u,t);
  const out=W.q("SELECT message FROM lead_outreach WHERE recipient=? AND status='sent' ORDER BY created_at",[String(u.id)]).slice(before).map(r=>r.message);
  const d=W.q("SELECT o.status,o.error_detail FROM lead_outreach o JOIN inbox_messages i ON i.id=o.inbox_message_id WHERE i.provider_sender_id=? ORDER BY i.created_at DESC LIMIT 1",[String(u.id)])[0];
  ok("O18 no automatic amount for: "+t,out.every(m=>!/[0-9۰-۹٠-٩]/.test(m))&&!!d,{out,d});}}

// 10. C1: an opted-out customer asks for a final quote — the quote stays with the owner and NO acknowledgement goes out
{const W=await world();for(const [id,q] of [[7116,"قیمت نهایی ۵۰ عدد با ارسال به تهران چند می‌شود؟"],[7117,"شكد سعر ٥٠ علبة مع الشحن؟"]]){const u={id,name:"J",username:"j"+id};const s=await W.send(u,"STOP");
  const c0=sends(W,u.id),a0=auto(W,s.row.lead_id),x=await W.send(u,q);
  ok("O19 opted-out customer, final-quote request: nothing automatic is sent ("+id+")",silent(W,u,s.row.lead_id,c0,a0,x)&&x.draft&&x.draft.status==="draft",{o:x.outcome,d:x.draft&&{s:x.draft.status,e:x.draft.error_detail}});
  ok("O20 and the hold is audited",n(W,"SELECT COUNT(*) n FROM system_events WHERE type='inbound_auto_reply_held' AND details_json LIKE ?",["%"+x.row.id+"%"])===1);}}

// 11. C2: the same Telegram sender's stop request recorded under ANOTHER lead still protects them
{const W=await world();const u={id:7118,name:"K",username:"k7118"},ctl={id:7119,name:"L",username:"l7119"};const s=await W.send(u,"STOP");
 const cols=W.q("SELECT name,\"notnull\" nn,dflt_value d,type FROM pragma_table_info('leads')").filter(c=>c.nn&&c.d===null),L2={id:"lead-second-7118"};
 for(const c of cols)if(!(c.name in L2))L2[c.name]=/INT|REAL/.test(c.type)?0:c.name==="created_at"||c.name==="updated_at"?OLD:"x";
 W.dbrun(`INSERT INTO leads(${Object.keys(L2).join(",")}) VALUES(${Object.keys(L2).map(()=>"?").join(",")})`,Object.values(L2));
 W.dbrun("UPDATE inbox_messages SET lead_id=? WHERE id=?",[L2.id,s.row.id]);
 const c0=sends(W,u.id),a0=auto(W,s.row.lead_id),x=await W.send(u,NORMAL[0]);
 ok("O21 a stop request stored under a second lead of the same sender still blocks automatic replies",x.row.lead_id===s.row.lead_id&&silent(W,u,s.row.lead_id,c0,a0,x)&&x.draft?.error_detail==="customer_opted_out",{o:x.outcome,d:x.draft?.error_detail,lead:x.row.lead_id===s.row.lead_id});
 const y=await W.send(ctl,NORMAL[0]);ok("O22 control: a different sender is answered",y.outcome?.customer_visible==="reply",y.outcome);}

// 12. C3: the opt-out check itself fails → held (fail-closed), and the failure is not sticky
{const W=await world();const u={id:7120,name:"M",username:"m7120"};await W.send(u,NORMAL[0]);const lead=W.q("SELECT lead_id l FROM inbox_messages WHERE provider_sender_id=?",[String(u.id)])[0].l;
 const orig=W.env.DB.prepare.bind(W.env.DB);W.env.DB.prepare=sql=>{if(/FROM inbox_messages WHERE lead_id=\? OR \(provider_sender_id/.test(sql))throw new Error("simulated D1 failure");return orig(sql);};
 const c0=sends(W,u.id),a0=auto(W,lead),x=await W.send(u,NORMAL[1]);W.env.DB.prepare=orig;
 ok("O23 an opt-out check failure holds the automatic reply (fail-closed)",silent(W,u,lead,c0,a0,x)&&x.draft?.error_detail==="opt_out_needs_review",{o:x.outcome,d:x.draft?.error_detail});
 const y=await W.send(u,NORMAL[2]);ok("O24 once the check works again, the customer is answered (not sticky)",y.outcome?.customer_visible==="reply",y.outcome);}
done();
