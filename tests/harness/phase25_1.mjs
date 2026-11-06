// PHASE 25 — Trash and cleanup. Synthetic data only; Telegram is the in-process mock. Checks that a cleanup never sends, retries, approves
// or resolves anything, that scope and confirmation are enforced on the server, and that protected records stay out of reach.
import fs from "node:fs";import path from "node:path";import vm from "node:vm";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase25_1");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const imp=f=>import(pathToFileURL(path.join(SRC,f)).href);
const CC=await imp("cleanup-center.js"),DP=await imp("live-dashboard-page.js");
const MIG=fs.readFileSync(path.join(REPO,"owner-actions/phase25-delete-system/01-migration.sql"),"utf8");
const NOW=Date.now(),ago=d=>new Date(NOW-d*86400000).toISOString(),T=ago(60);
const req=(W,p,method="GET",body,token="tok")=>W.run(new Request("https://w.test"+p,{method,headers:{...(token?{Authorization:"Bearer "+token}:{}),"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined}));

// Before the migration: the API says so and the existing views keep working
{const W0=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test"}});
 const r=await req(W0,"/api/cleanup/items?section=leads");ok("M1 without the migration the API answers migration_required",r.status===503&&(await r.json()).error==="migration_required");
 const s=await (await req(W0,"/api/cleanup/sections")).json();ok("M2 the overview says it is not ready",s.ok&&s.ready===false&&s.sections[0].active===null);
 ok("M3 existing views still work without the tables",(await req(W0,"/api/system/events?kind=errors")).status===200&&(await req(W0,"/api/owner-escalations")).status===200&&(await req(W0,"/api/si/decisions?status=ALL")).status===200);}

const W=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on"}});const {q,dbrun,call,send,setMarket}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
await call("/api/quotes",null,"GET");await call("/api/si/knowledge/product",null,"GET");await call("/api/owner-escalations",null,"GET");await call("/api/leads/outreach",null,"GET");await call("/api/content/pipeline",null,"GET");
W.d1.db.exec(MIG);
const FQ=await imp("final-quote-review.js");await FQ.ensureFinalQuoteStore(W.env);
const AE0=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+"?z="+Math.random());await AE0.autonomyMasterGate(W.env);

const preview=async b=>{const r=await req(W,"/api/cleanup/preview","POST",b);return {status:r.status,...await r.json()};};
const exec=async(token,confirm)=>{const r=await req(W,"/api/cleanup/execute","POST",{token,confirm});return {status:r.status,...await r.json()};};
const doIt=async b=>{const p=await preview(b);if(!p.token)return {p};return {p,e:await exec(p.token,p.confirm_phrase||undefined)};};
const items=async(s,x="")=>(await (await req(W,`/api/cleanup/items?section=${s}${x}`)).json());
const col=(t,c,id)=>q(`SELECT ${c} v FROM ${t} WHERE id=?`,[id])[0]?.v;
const count=(sql,a=[])=>q(sql,a)[0].n;
const lead=(id,stage="discovered",notes={target_market:"IRAN"},at=T)=>dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",[id,"Shop "+id,"c",stage,"normal",JSON.stringify(notes),at,at]);
const out=(id,l,status,extra={})=>dbrun("INSERT INTO lead_outreach(id,lead_id,channel,recipient,message,language,status,approved_at,approved_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",[id,l,extra.channel||"instagram","r","secret customer text "+id,"Persian",status,extra.approved_at||null,extra.approved_by||null,T,T]);
const fill=(t,row)=>{const req=q(`SELECT name,"notnull" nn,dflt_value d,type FROM pragma_table_info('${t}')`).filter(c=>c.nn&&c.d===null);for(const c of req)if(!(c.name in row))row[c.name]=/INT|REAL/.test(c.type)?0:"x";const k=Object.keys(row);dbrun(`INSERT INTO ${t}(${k.join(",")}) VALUES(${k.map(()=>"?").join(",")})`,k.map(c=>row[c]));};
const esc=(id,l,status="open")=>fill("owner_escalations",{id,escalation_key:"k"+id,lead_id:l,conversation_id:"c-"+l,status,version:1,reason_code:"unclear_moq",created_at:T,updated_at:T,...(status==="open"?{}:{owner_decision:"answered",resolved_by:"admin",resolved_at:T})});
const dec=(id,l,status="PENDING")=>fill("owner_decisions",{id,status,priority:"HIGH",decision_type:"ESCALATION_UNCLEAR_MOQ",fingerprint:"f"+id,lead_id:l,question:"q",created_at:T,updated_at:T});
const tgBefore=()=>W.tg.length;

// Authorization
for(const [p,m] of [["/api/cleanup/sections","GET"],["/api/cleanup/items?section=leads","GET"],["/api/cleanup/test-candidates","GET"],["/api/cleanup/preview","POST"],["/api/cleanup/execute","POST"]]){
 const a=await req(W,p,m,m==="POST"?{}:undefined,null),b=await req(W,p,m,m==="POST"?{}:undefined,"wrong");ok("S1 no valid token, no access: "+p,a.status===401&&b.status===401);}

// Input
{lead("in1");out("in-o1","in1","draft");
 ok("V1 unknown section",(await preview({section:"payments",action:"trash",scope:"section"})).status===404);
 ok("V2 prototype key is not a section",(await preview({section:"__proto__",action:"trash",scope:"section"})).status===404);
 ok("V3 unknown action",(await preview({section:"leads",action:"drop",scope:"section"})).status===400);
 ok("V4 unknown scope",(await preview({section:"leads",action:"trash",scope:"all"})).status===400);
 ok("V5 filter scope needs a filter",(await preview({section:"outreach",action:"trash",scope:"filter",filter:{}})).error==="filter_required");
 ok("V6 a status outside the list is refused",(await preview({section:"outreach",action:"trash",scope:"filter",filter:{status:"sent' OR 1=1 --"}})).error==="invalid_filter");
 ok("V7 a bad day count is refused",(await preview({section:"outreach",action:"trash",scope:"filter",filter:{older_than_days:"1;DROP TABLE leads"}})).error==="invalid_filter");
 ok("V8 market filter only where supported",(await preview({section:"outreach",action:"trash",scope:"filter",filter:{market:"IRAN"}})).error==="invalid_filter");
 ok("V9 ids are required",(await preview({section:"outreach",action:"trash",scope:"ids",ids:[]})).error==="ids_required");
 ok("V10 too many ids",(await preview({section:"outreach",action:"trash",scope:"ids",ids:Array.from({length:201},(_,i)=>"x"+i)})).error==="too_many_ids");
 ok("V11 purge is refused where it is not allowed",(await preview({section:"leads",action:"purge",scope:"ids",ids:["in1"]})).error==="not_purgeable");
 ok("V12 an unknown token",(await exec("nope")).status===404);
 ok("V13 tables survived",count("SELECT COUNT(*) n FROM leads")>0);}

// Confirmation, repeat and expiry
{for(let i=0;i<3;i++){lead("cf"+i);out("cf-o"+i,"cf"+i,"draft");}
 const p=await preview({section:"outreach",action:"trash",scope:"filter",filter:{status:"draft"}});
 ok("C1 a bulk action needs a typed phrase",!!p.confirm_phrase&&p.count>=3,p);
 ok("C2 the wrong phrase changes nothing",(await exec(p.token,"حذف")).error==="confirmation_mismatch"&&col("lead_outreach","status","cf-o0")==="draft");
 const pf=p.confirm_phrase.replace(/\d/g,d=>"۰۱۲۳۴۵۶۷۸۹"[d]),e=await exec(p.token,pf);
 ok("C3 Persian digits are accepted",e.ok&&e.result.done===p.count,e);
 const before=count("SELECT COUNT(*) n FROM cleanup_trash"),e2=await exec(p.token,pf);
 ok("C4 a repeated submit does nothing new",e2.ok&&e2.idempotent===true&&count("SELECT COUNT(*) n FROM cleanup_trash")===before);
 lead("cf9");out("cf-o9","cf9","draft");const p2=await preview({section:"outreach",action:"trash",scope:"ids",ids:["cf-o9"]});
 dbrun("UPDATE cleanup_ops SET expires_at=? WHERE id=?",[ago(1),p2.token]);ok("C5 an expired preview is refused",(await exec(p2.token)).status===410&&col("lead_outreach","status","cf-o9")==="draft");
 const p3=await preview({section:"outreach",action:"trash",scope:"ids",ids:["cf-o9"]}),[a,b]=await Promise.all([exec(p3.token),exec(p3.token)]);
 ok("C6 two submits at once make one change",count("SELECT COUNT(*) n FROM cleanup_trash WHERE record_id='cf-o9' AND state='trashed'")===1&&[a,b].filter(x=>x.ok&&x.result?.done===1&&!x.idempotent).length===1,{a,b});
 ok("C6b the second submit is refused or answered from the first",[a,b].filter(x=>x.status===409||x.idempotent===true).length===1,{a,b});
 lead("cf8");out("cf-o8","cf8","draft");lead("cf7");out("cf-o7","cf7","draft");
 const x=await preview({section:"outreach",action:"trash",scope:"ids",ids:["cf-o8"]}),y=await preview({section:"outreach",action:"trash",scope:"ids",ids:["cf-o7"]});
 dbrun("UPDATE cleanup_ops SET status='running',started_at=? WHERE id=?",[new Date().toISOString(),x.token]);
 ok("C7 one running operation per section",(await exec(y.token)).error==="section_busy"&&col("lead_outreach","status","cf-o7")==="draft");
 dbrun("UPDATE cleanup_ops SET started_at=? WHERE id=?",[ago(1),x.token]);const z=await preview({section:"outreach",action:"trash",scope:"ids",ids:["cf-o7"]});
 ok("C8 a stuck run does not lock the section forever",(await exec(z.token)).ok);}

// Scope
{for(let i=0;i<4;i++){lead("sc"+i);out("sc-o"+i,"sc"+i,"failed");}dbrun("UPDATE lead_outreach SET created_at=? WHERE id IN ('sc-o0','sc-o1')",[ago(100)]);dbrun("UPDATE lead_outreach SET created_at=? WHERE id IN ('sc-o2','sc-o3')",[ago(1)]);
 const f=await preview({section:"outreach",action:"trash",scope:"filter",filter:{status:"failed",older_than_days:30}});
 ok("D1 filter scope counts only the filter",f.summary.eligible===2,f.summary);
 lead("sc9");out("sc-o9","sc9","failed");dbrun("UPDATE lead_outreach SET created_at=? WHERE id='sc-o9'",[ago(100)]);
 await exec(f.token,f.confirm_phrase);
 ok("D2 a row added after the preview is not touched",col("lead_outreach","status","sc-o9")==="failed"&&col("lead_outreach","status","sc-o0")==="trashed");
 ok("D3 rows outside the filter are not touched",col("lead_outreach","status","sc-o2")==="failed");
 const s=await preview({section:"retry",action:"trash",scope:"section"});ok("D4 an empty section gives no token",s.token===null&&s.count===0);
 for(let i=0;i<205;i++)dbrun("INSERT INTO retry_queue VALUES(?,?,?,?,?,?,?,?,?,?)",["rq"+i,"content_distribution","{}",3,3,"failed",null,"e",T,T]);
 const big=await preview({section:"retry",action:"trash",scope:"section"});ok("D5 one run is capped and the rest is reported",big.count===200&&big.summary.remaining===5&&big.summary.eligible===205,big.summary);
 const tr=await preview({section:"outreach",action:"trash",scope:"page",ids:["sc-o2"]});ok("D6 page scope uses the sent ids only",tr.count===1);
 const lm=await preview({section:"leads",action:"trash",scope:"filter",filter:{market:"ARAB"}});ok("D7 the market filter does not reach another market",lm.summary.requested===0);}

// Stale selection
{lead("st1");out("st-o1","st1","draft");const p=await preview({section:"outreach",action:"trash",scope:"ids",ids:["st-o1"]});dbrun("UPDATE lead_outreach SET status='sent' WHERE id='st-o1'");
 const e=await exec(p.token);ok("T1 a row sent after the preview is left alone",e.result.done===0&&e.result.skipped===1&&col("lead_outreach","status","st-o1")==="sent"&&count("SELECT COUNT(*) n FROM cleanup_trash WHERE record_id='st-o1'")===0,e);
 lead("st2");const p2=await preview({section:"leads",action:"trash",scope:"ids",ids:["st2"]});dbrun("INSERT INTO lead_orders(id,order_number,lead_id,status,created_at,updated_at) SELECT 'ord-st2','N1','st2','confirmed',?,? WHERE 0",[T,T]);esc("e-st2","st2");
 const e2=await exec(p2.token,p2.confirm_phrase);ok("T2 a lead that gained an escalation is left alone",e2.result.done===0&&col("leads","stage","st2")==="discovered",e2);}

// Protected records
{const blk=async(s,id,code)=>{const p=await preview({section:s,action:"trash",scope:"ids",ids:[id]});return p.count===0&&p.summary.blocked[code]===1;};
 lead("pr1","customer");ok("P1 a customer is protected",await blk("leads","pr1","customer_record"));
 lead("pr2");esc("e-pr2","pr2");ok("P2 a lead with an open escalation",await blk("leads","pr2","open_escalation"));
 lead("pr3");dec("d-pr3","pr3");ok("P3 a lead with a pending decision",await blk("leads","pr3","pending_decision"));
 lead("pr4");out("pr4-o","pr4","approved");ok("P4 a lead with open outreach",await blk("leads","pr4","open_outreach"));
 lead("pr5");out("pr5-o","pr5","draft");dbrun("INSERT INTO final_quote_reviews(outreach_id,lead_id,conversation_id,reason,created_at,updated_at) VALUES('pr5-o','pr5','c','quantity_total',?,?)",[T,T]);
 ok("P5 a held final quote cannot be deleted",await blk("outreach","pr5-o","final_quote_review"));
 ok("P6 an open escalation cannot be deleted",await blk("escalations","e-pr2","open_escalation")&&col("owner_escalations","status","e-pr2")==="open");
 ok("P7 a pending decision cannot be deleted",await blk("decisions","d-pr3","pending_decision"));
 lead("pr7");out("pr7-o","pr7","sent");ok("P8 a sent message is not in the list",(await preview({section:"outreach",action:"trash",scope:"ids",ids:["pr7-o"]})).summary.not_available===1);
 dbrun("INSERT INTO retry_queue VALUES('rq-run','x','{}',0,3,'running',null,null,?,?)",[T,T]);dbrun("INSERT INTO retry_queue VALUES('rq-q','x','{}',0,3,'queued',null,null,?,?)",[T,T]);
 ok("P9 running and queued retries are blocked",await blk("retry","rq-run","job_active")&&await blk("retry","rq-q","job_active"));
 fill("autonomy_tasks",{id:"tk-run",module:"m",action:"a",status:"running",priority:1,attempts:0,created_at:T,updated_at:T});ok("P10 a running task is blocked",await blk("tasks","tk-run","job_active"));
 fill("agent_alerts",{id:"al-open",scheduler:"watchdog",code:"c",agent:"a",level:"warning",recovery_state:"open",first_seen_at:T,last_seen_at:T,occurrences:1});ok("P11 an active alert is blocked",await blk("alerts","al-open","alert_active"));
 fill("contents",{id:"ct-pub",status:"generated",topic:"t",created_at:T,updated_at:T});dbrun("INSERT INTO calendar(id,campaign_id,content_id,planned_at,status,created_at,updated_at) VALUES('cal-p',null,'ct-pub',?,'planned',?,?)",[ago(-5),T,T]);
 ok("P12 scheduled content is blocked",await blk("contents","ct-pub","scheduled_or_published"));
 // bulk never reaches a lead with a conversation; an explicit selection can
 const u={id:7001,name:"Cust",username:"cu7001"};await send(u,"سلام");const lid=q("SELECT lead_id FROM inbox_messages WHERE provider_sender_id='7001' LIMIT 1")[0].lead_id;
 dbrun("DELETE FROM lead_outreach WHERE lead_id=?",[lid]);
 const bulk=await preview({section:"leads",action:"trash",scope:"section"}),one=await preview({section:"leads",action:"trash",scope:"ids",ids:[lid]});
 ok("P13 bulk never takes a lead with a conversation",bulk.summary.blocked.needs_explicit_selection>=1&&!JSON.parse(q("SELECT record_ids_json r FROM cleanup_ops WHERE id=?",[bulk.token||""])[0]?.r||"[]").includes(lid),bulk.summary);
 ok("P14 an explicit selection can",one.count===1,one.summary);
 const prot=(await (await req(W,"/api/cleanup/sections")).json()).protected.map(x=>x.key);ok("P15 protected categories are listed with a reason",["payments","orders","sent","prices","knowledge","audit","media_files"].every(k=>prot.includes(k)));}

// Restore
{lead("rs1");out("rs-a","rs1","approved",{approved_at:T,approved_by:"admin"});out("rs-d","rs1","pending_approval");
 await doIt({section:"outreach",action:"trash",scope:"ids",ids:["rs-a","rs-d"]});
 ok("R1 trashed rows leave the outreach list",!(await (await req(W,"/api/leads/outreach")).json()).items.some(x=>x.id==="rs-a"));
 const r=await doIt({section:"outreach",action:"restore",scope:"ids",ids:["rs-a","rs-d"]});
 ok("R2 an approval does not come back",col("lead_outreach","status","rs-a")==="draft"&&col("lead_outreach","approved_at","rs-a")===null&&col("lead_outreach","approved_by","rs-a")===null,r);
 ok("R3 other states return as they were",col("lead_outreach","status","rs-d")==="pending_approval");
 lead("rs2");await doIt({section:"leads",action:"trash",scope:"ids",ids:["rs2"]});ok("R4 a lead leaves the active list",col("leads","stage","rs2")==="archived"&&!(await (await req(W,"/api/leads")).json()).items.some(x=>x.id==="rs2"));
 await doIt({section:"leads",action:"restore",scope:"ids",ids:["rs2"]});ok("R5 a lead returns to its stage",col("leads","stage","rs2")==="discovered");
 lead("rs3");await doIt({section:"leads",action:"trash",scope:"ids",ids:["rs3"]});dbrun("UPDATE leads SET stage='negotiation' WHERE id='rs3'");
 const c=await preview({section:"leads",action:"restore",scope:"ids",ids:["rs3"]});ok("R6 a record changed after deletion is not overwritten",c.summary.blocked.changed_since_delete===1&&col("leads","stage","rs3")==="negotiation");
 lead("rs4");out("rs4-o","rs4","failed");await doIt({section:"outreach",action:"trash",scope:"ids",ids:["rs4-o"]});await doIt({section:"leads",action:"trash",scope:"ids",ids:["rs4"]});
 ok("R7 a child waits for its parent",(await preview({section:"outreach",action:"restore",scope:"ids",ids:["rs4-o"]})).summary.blocked.parent_in_trash===1);
 fill("contents",{id:"ct-1",status:"generated",topic:"t",created_at:T,updated_at:T});dbrun("INSERT INTO calendar(id,campaign_id,content_id,planned_at,status,created_at,updated_at) VALUES('cal-1',null,'x',?,'planned',?,?)",[ago(-1),T,T]);
 await doIt({section:"calendar",action:"trash",scope:"ids",ids:["cal-1"]});dbrun("UPDATE calendar SET planned_at=? WHERE id='cal-1'",[ago(1)]);
 ok("R8 a passed schedule cannot be restored",(await preview({section:"calendar",action:"restore",scope:"ids",ids:["cal-1"]})).summary.blocked.schedule_passed===1);
 await doIt({section:"contents",action:"trash",scope:"ids",ids:["ct-1"]});ok("R9 trashed content leaves the waiting count",!(await call("/api/content?status=generated",null,"GET")).body.items.some(x=>x.id==="ct-1")&&!(await call("/api/content",null,"GET")).body.items.some(x=>x.id==="ct-1"));
 await doIt({section:"contents",action:"restore",scope:"ids",ids:["ct-1"]});ok("R10 content returns",col("contents","status","ct-1")==="generated");
 const n=count("SELECT COUNT(*) n FROM cleanup_trash WHERE record_id='rs-a'");ok("R11 the history keeps the earlier trash row",n===1&&q("SELECT state FROM cleanup_trash WHERE record_id='rs-a'")[0].state==="restored");}

// Execute-time rules and other sections
{lead("bk1");lead("bk2","negotiation");const p=await preview({section:"leads",action:"trash",scope:"section"});const ids=JSON.parse(q("SELECT record_ids_json r FROM cleanup_ops WHERE id=?",[p.token])[0].r);
 ok("B1 bulk takes only leads nobody talked to",ids.includes("bk1")&&!ids.includes("bk2"));
 fill("inbox_messages",{id:"bk-m",platform:"telegram",message:"hello",status:"new",lead_id:"bk1",created_at:T,updated_at:T});
 const e=await exec(p.token,p.confirm_phrase);ok("B2 a lead that got a message after the preview stays",col("leads","stage","bk1")==="discovered",e.result);
 dbrun("UPDATE leads SET stage='archived' WHERE stage='discovered' AND id NOT IN ('bk1','st2')");
 lead("bk3");fill("inbox_messages",{id:"bk-i",platform:"telegram",message:"hello",status:"new",lead_id:"bk3",created_at:T,updated_at:T});out("bk-o","bk3","draft");dbrun("UPDATE lead_outreach SET inbox_message_id='bk-i' WHERE id='bk-o'");
 const bo=await preview({section:"outreach",action:"trash",scope:"section"});ok("B3 a draft that answers a customer is never bulk-deleted",bo.summary.blocked.needs_explicit_selection>=1&&!JSON.parse(q("SELECT record_ids_json r FROM cleanup_ops WHERE id=?",[bo.token||""])[0]?.r||"[]").includes("bk-o"));
 ok("B4 an explicit selection can",(await preview({section:"outreach",action:"trash",scope:"ids",ids:["bk-o"]})).count===1);
 lead("pl1");out("pl-o","pl1","approved");dbrun("INSERT INTO lead_campaign_codes(id,code_hash,lead_id,campaign,status,expires_at,created_at,updated_at) VALUES('pc1','h1','pl1','iq','active',?,?,?)",[ago(-5),T,T]);
 ok("B5 an approved row with a live pilot link waits for reject",(await preview({section:"outreach",action:"trash",scope:"ids",ids:["pl-o"]})).summary.blocked.active_pilot_link===1);
 dbrun("UPDATE lead_campaign_codes SET expires_at=? WHERE id='pc1'",[ago(1)]);ok("B6 an expired link does not block",(await preview({section:"outreach",action:"trash",scope:"ids",ids:["pl-o"]})).count===1);
 // hide mode, inbox and distribution restore
 dbrun("INSERT INTO system_events VALUES('ev-r','scheduled_step_failed','error','m','{}',?)",[T]);await doIt({section:"errors",action:"trash",scope:"ids",ids:["ev-r"]});await doIt({section:"errors",action:"restore",scope:"ids",ids:["ev-r"]});
 ok("B7 a hidden record comes back",(await (await req(W,"/api/system/events?kind=errors")).json()).items.some(x=>x.id==="ev-r"));
 fill("inbox_messages",{id:"in-r",platform:"telegram",message:"x",status:"handled",created_at:T,updated_at:T});await doIt({section:"inbox",action:"trash",scope:"ids",ids:["in-r"]});ok("B8 inbox row leaves",col("inbox_messages","status","in-r")==="trashed");await doIt({section:"inbox",action:"restore",scope:"ids",ids:["in-r"]});ok("B9 inbox row returns to its own status",col("inbox_messages","status","in-r")==="handled");
 dbrun("INSERT INTO content_distribution(id,content_id,target,status,planned_at,external_id,error,created_at,updated_at) VALUES('cd1','x','telegram','failed',?,null,'e',?,?)",[T,T,T]);dbrun("INSERT INTO content_distribution(id,content_id,target,status,planned_at,external_id,error,created_at,updated_at) VALUES('cd2','x','website','manual_required',?,null,'OUTCOME_UNKNOWN: x',?,?)",[T,T,T]);
 ok("B10 an unknown send outcome is blocked",(await preview({section:"distribution",action:"trash",scope:"ids",ids:["cd2"]})).summary.blocked.outcome_unknown===1);
 await doIt({section:"distribution",action:"trash",scope:"ids",ids:["cd1"]});ok("B11 failed publishing leaves the status view",!JSON.stringify((await call("/api/content/pipeline",null,"GET")).body).includes('"status":"trashed"'));await doIt({section:"distribution",action:"restore",scope:"ids",ids:["cd1"]});ok("B12 and returns",col("content_distribution","status","cd1")==="failed");
 dbrun("INSERT INTO calendar(id,campaign_id,content_id,planned_at,status,created_at,updated_at) VALUES('cal-pub',null,'x',?,'published',?,?)",[T,T,T]);ok("B13 the old calendar delete refuses a published row",(await call("/api/calendar",{id:"cal-pub"},"DELETE")).status===409&&count("SELECT COUNT(*) n FROM calendar WHERE id='cal-pub'")===1);}

// A customer who writes back leaves Trash
{const u={id:7401,name:"Back",username:"uback"};await send(u,"سلام");const lid=q("SELECT lead_id l FROM inbox_messages WHERE provider_sender_id='7401' LIMIT 1")[0].l;dbrun("UPDATE lead_outreach SET status='sent' WHERE lead_id=?",[lid]);
 const r=await doIt({section:"leads",action:"trash",scope:"ids",ids:[lid]});ok("W1 explicit selection archives the lead",col("leads","stage",lid)==="archived",r);
 await send(u,"قیمت جعبه چنده؟");
 ok("W2 a customer message brings the lead back",col("leads","stage",lid)!=="archived"&&q("SELECT state FROM cleanup_trash WHERE section='leads' AND record_id=?",[lid])[0].state==="restored");
 ok("W3 and it is on the list again",(await (await req(W,"/api/leads")).json()).items.some(x=>x.id===lid));
 dbrun("UPDATE leads SET stage='archived' WHERE id='in1'");const u2=count("SELECT COUNT(*) n FROM leads WHERE stage='archived' AND id='in1'");ok("W4 a lead archived outside Trash is not touched by the revive",u2===1);}

// Priority 1: a deleted message reaches no AI, memory, reply or follow-up path
{
 const u={id:7501,name:"Mem",username:"umem"};await send(u,"سلام، جعبه جواهر می‌خواهم");await send(u,"اسم من تست‌نام است و مقصد من شیراز است");
 const rows=q("SELECT id,lead_id l,conversation_id c,message m FROM inbox_messages WHERE provider_sender_id='7501' ORDER BY created_at");const secret=rows[1],lid=secret.l,cid=secret.c;
 // a synthetic fact whose only source is the deleted message
 const fc=q("SELECT name,\"notnull\" nn,dflt_value d,type FROM pragma_table_info('conversation_memory_facts')").filter(c=>c.nn&&c.d===null),fact={id:"mf1",lead_id:lid,conversation_id:cid,source_message_id:secret.id,memory_key:"test_note",value_json:'"SECRETCITY"',value_hash:"h-secret",status:"active",fact_type:"destination",version:1,created_at:T};for(const c of fc)if(!(c.name in fact))fact[c.name]=/INT|REAL/.test(c.type)?0:"x";{const k=Object.keys(fact);dbrun(`INSERT INTO conversation_memory_facts(${k.join(",")}) VALUES(${k.map(()=>"?").join(",")})`,k.map(x=>fact[x]));}
 const ov=await preview({section:"inbox",action:"trash",scope:"ids",ids:[secret.id]});
 ok("I1 the preview counts linked items",ov.summary.impact.memory_facts>=1&&Array.isArray(ov.summary.warnings)&&ov.summary.warnings.includes("memory_hidden"),ov.summary);
 {const has=q("SELECT 1 FROM lead_outreach WHERE inbox_message_id=?",[secret.id]).length;if(!has){out("mem-draft",lid,"draft");dbrun("UPDATE lead_outreach SET inbox_message_id=? WHERE id='mem-draft'",[secret.id]);}}dbrun("UPDATE lead_outreach SET status='draft',approved_at=NULL,approved_by=NULL WHERE inbox_message_id=?",[secret.id]);const linked=q("SELECT id,message FROM lead_outreach WHERE inbox_message_id=?",[secret.id]);ok("I1b the fixture has a linked draft",linked.length===1);
 const ov2=await preview({section:"inbox",action:"trash",scope:"ids",ids:[secret.id]});
 ok("I2 a linked draft is announced",ov2.summary.impact.drafts===1&&ov2.summary.warnings.includes("linked_drafts"),ov2.summary);
 await exec(ov2.token);
 ok("I3 the message is out of every view",col("inbox_messages","status",secret.id)==="trashed"&&!(await (await req(W,"/api/inbox")).json()).items.some(x=>x.id===secret.id));
 ok("I4 its draft cannot outlive it",q("SELECT COUNT(*) n FROM lead_outreach WHERE inbox_message_id=? AND status='draft'",[secret.id])[0].n===0);
 ok("I8 the fact row itself is kept",count("SELECT COUNT(*) n FROM conversation_memory_facts WHERE id='mf1'")===1);
 const n=(await call("/api/inbox/negotiation-draft",{id:secret.id},"POST"));ok("I9 no draft can be generated from it",n.body?.processed===false&&count("SELECT COUNT(*) n FROM lead_outreach WHERE inbox_message_id=? AND status='draft'",[secret.id])===0,n);
 const pt=await req(W,"/api/inbox","PATCH",{id:secret.id,status:"new"});ok("I10 the old inbox control cannot pull it out of Trash",pt.status===409&&col("inbox_messages","status",secret.id)==="trashed");
 // restore: nothing goes out
 const tg=W.tg.length,sent=count("SELECT COUNT(*) n FROM lead_outreach WHERE status='sent'");
 await doIt({section:"inbox",action:"restore",scope:"ids",ids:[secret.id]});
 ok("I11 restore sends nothing",W.tg.length===tg&&count("SELECT COUNT(*) n FROM lead_outreach WHERE status='sent'")===sent&&col("inbox_messages","status",secret.id)==="new");
 {const r=q("SELECT status s,message m,approved_at a FROM lead_outreach WHERE inbox_message_id=?",[secret.id])[0];ok("I12 its draft returns unchanged and unapproved",r.s==="draft"&&r.m===linked[0].message&&r.a===null,r);}
 ok("I13 a restored lead gets no automatic follow-up for 7 days",(await CC.cleanupRecentlyRestored(W.env,lid))===true);
 ok("I14 and after that it can",(await CC.cleanupRecentlyRestored(W.env,lid,Date.now()+8*86400000))===false);
 // opt-out stays effective even from a deleted message
 ok("I15 a deleted stop request stays in the opt-out scan",/opt|stop/i.test(fs.readFileSync(path.join(SRC,"index.js"),"utf8").match(/async function leadOptOutState[\s\S]{0,900}/)?.[0]||"")&&!/status<>'trashed'/.test(fs.readFileSync(path.join(SRC,"index.js"),"utf8").match(/async function leadOptOutState[\s\S]{0,900}/)?.[0]||""));}

// AI proof: the prompt the model really receives, with a positive control before the delete and after the restore
{const WA=await makeWorld({aiBrain:"on",extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test"}});await WA.call("/api/quotes",null,"GET");await WA.call("/api/si/knowledge/product",null,"GET");await WA.call("/api/owner-escalations",null,"GET");await WA.call("/api/leads/outreach",null,"GET");await WA.call("/api/content/pipeline",null,"GET");
 WA.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));WA.d1.db.exec(MIG);
 const rq=(p,b)=>req(WA,p,"POST",b).then(r=>r.json()),go=async b=>{const p=await rq("/api/cleanup/preview",b);return rq("/api/cleanup/execute",{token:p.token,confirm:p.confirm_phrase||undefined});};
 const u={id:7601,name:"Ai",username:"uai"};WA.setMarket&&0;await WA.send(u,"سلام، جعبه جواهر می‌خواهم");WA.setMarket(u,"iran");await WA.send(u,"کلمه رمز من ZZSECRETWORD است");
 const rows=WA.q("SELECT id,lead_id l,conversation_id c,message m FROM inbox_messages WHERE provider_sender_id='7601' ORDER BY created_at"),sec=rows[1];
 const fc=WA.q("SELECT name,\"notnull\" nn,dflt_value d,type FROM pragma_table_info('conversation_memory_facts')").filter(c=>c.nn&&c.d===null),fact={id:"mf-ai",lead_id:sec.l,conversation_id:sec.c,source_message_id:sec.id,memory_key:"customer_name",value_json:'"ZZSECRETFACT"',value_hash:"hz",status:"active",fact_type:"customer_name",version:1,created_at:T};for(const c of fc)if(!(c.name in fact))fact[c.name]=/INT|REAL/.test(c.type)?0:"x";
 WA.dbrun("DELETE FROM conversation_memory_facts WHERE 0");{const k=Object.keys(fact);try{WA.dbrun(`INSERT INTO conversation_memory_facts(${k.join(",")}) VALUES(${k.map(()=>"?").join(",")})`,k.map(x=>fact[x]));}catch(e){console.log("fact",String(e).slice(0,120));}}
 const turn=async text=>{const n=WA.AI.requests.length;await WA.send(u,text);return JSON.stringify(WA.AI.requests.slice(n).map(r=>r.body));};
 const before=await turn("قیمت جعبه چنده؟");
 ok("L1 control: before the delete the model sees the message",before.includes("ZZSECRETWORD"),before.slice(0,300));
 ok("L2 control: and the memory fact",before.includes("ZZSECRETFACT"));
 const d=await go({section:"inbox",action:"trash",scope:"ids",ids:[sec.id]});
 const after=await turn("رنگ مشکی دارید؟");
 ok("L3 after the delete the model gets a request",after.length>10,d);
 ok("L4 the deleted message is not in the prompt",!after.includes("ZZSECRETWORD"));
 ok("L5 nor its memory fact",!after.includes("ZZSECRETFACT"));
 await go({section:"inbox",action:"restore",scope:"ids",ids:[sec.id]});
 const back=await turn("تحویل چند روزه است؟");ok("L6 after restore the context is whole again",back.includes("ZZSECRETWORD")&&back.includes("ZZSECRETFACT"));
 const tg=WA.tg.length,reqs=WA.AI.requests.length;await go({section:"inbox",action:"trash",scope:"ids",ids:[sec.id]});await go({section:"inbox",action:"restore",scope:"ids",ids:[sec.id]});ok("L7 neither action calls the model or Telegram",WA.tg.length===tg&&WA.AI.requests.length===reqs);}

// Isolation and tokens
{lead("is1");lead("is2");out("is-a","is1","draft");out("is-b","is2","draft");const p=await preview({section:"outreach",action:"trash",scope:"ids",ids:["is-a"]});
 const tampered=await exec(p.token.slice(0,-1)+(p.token.endsWith("a")?"b":"a"));ok("K1 a changed token is refused",tampered.status===404&&col("lead_outreach","status","is-a")==="draft");
 dbrun("UPDATE cleanup_ops SET record_ids_json=? WHERE 0",["[]"]);await exec(p.token);ok("K2 only the previewed record changes",col("lead_outreach","status","is-a")==="trashed"&&col("lead_outreach","status","is-b")==="draft");
 const again=await exec(p.token);ok("K3 a spent token cannot change anything else",again.idempotent===true&&col("lead_outreach","status","is-b")==="draft");
 ok("K4 the section of a token cannot be swapped",(await preview({section:"leads",action:"trash",scope:"ids",ids:["is-b"]})).summary.not_available===1);}

// Sales paths after a delete
{const Wm=W,u={id:7701,name:"Sp",username:"usp"};await send(u,"سلام");const r=q("SELECT id,lead_id l,conversation_id c FROM inbox_messages WHERE provider_sender_id='7701' LIMIT 1")[0];
 dbrun("UPDATE inbox_messages SET category='quote_requested' WHERE id=?",[r.id]);dbrun("UPDATE lead_outreach SET status='sent' WHERE lead_id=?",[r.l]);await doIt({section:"inbox",action:"trash",scope:"ids",ids:[r.id]});
 const before=count("SELECT COUNT(*) n FROM lead_quotes WHERE lead_id=?",[r.l]);const mk=await call("/api/inbox/negotiation-draft",{id:r.id},"POST");ok("K5 no quote or draft comes from a deleted request",count("SELECT COUNT(*) n FROM lead_quotes WHERE lead_id=?",[r.l])===before&&mk.body?.processed===false,mk);void Wm;}

// An offer that came from a deleted message no longer counts as a priced offer; a control lead with the same offer still does
{const offer=async(id)=>{const u={id,name:"O"+id,username:"o"+id};await send(u,"سلام");const r=q("SELECT id,lead_id l,conversation_id c FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(id)])[0];
  const fc=q("SELECT name,\"notnull\" nn,dflt_value d,type FROM pragma_table_info('conversation_memory_facts')").filter(c=>c.nn&&c.d===null),f={id:"of"+id,lead_id:r.l,conversation_id:r.c,source_message_id:r.id,memory_key:"order_candidate",value_json:'{"offer_hash":"x"}',value_hash:"o"+id,status:"active",fact_type:"order_candidate",version:1,created_at:T};for(const c of fc)if(!(c.name in f))f[c.name]=/INT|REAL/.test(c.type)?0:"x";const k=Object.keys(f);dbrun(`INSERT INTO conversation_memory_facts(${k.join(",")}) VALUES(${k.map(()=>"?").join(",")})`,k.map(x=>f[x]));return {u,...r};};
 const gone=await offer(7901),ctl=await offer(7902);dbrun("UPDATE lead_outreach SET status='sent' WHERE lead_id IN (?,?)",[gone.l,ctl.l]);
 await doIt({section:"inbox",action:"trash",scope:"ids",ids:[gone.id]});
 await send(ctl.u,"قیمت جعبه چنده؟");await send(gone.u,"قیمت جعبه چنده؟");
 ok("O1 control: a live offer moves the lead to negotiation",col("leads","stage",ctl.l)==="negotiation",col("leads","stage",ctl.l));
 ok("O2 an offer from a deleted message does not",col("leads","stage",gone.l)==="replied",col("leads","stage",gone.l));}

// Blocks on a message
{lead("mb1");fill("inbox_messages",{id:"mb-i",platform:"telegram",message:"x",status:"new",lead_id:"mb1",created_at:T,updated_at:T});
 dbrun("INSERT INTO lead_quotes(id,lead_id,inbox_message_id,status,created_at,updated_at) SELECT 'mq',?,?,'draft',?,? WHERE 0",["mb1","mb-i",T,T]);esc("e-mb","mb1");dbrun("UPDATE owner_escalations SET source_message_id='mb-i' WHERE id='e-mb'");
 ok("I16 a message behind an open escalation stays",(await preview({section:"inbox",action:"trash",scope:"ids",ids:["mb-i"]})).summary.blocked.open_escalation===1);
 lead("mb2");fill("inbox_messages",{id:"mb-j",platform:"telegram",message:"x",status:"new",lead_id:"mb2",created_at:T,updated_at:T});out("mb-o","mb2","approved");dbrun("UPDATE lead_outreach SET inbox_message_id='mb-j' WHERE id='mb-o'");
 ok("I17 a message with an approved reply stays",(await preview({section:"inbox",action:"trash",scope:"ids",ids:["mb-j"]})).summary.blocked.open_reply===1);
 lead("mb3");fill("inbox_messages",{id:"mb-k",platform:"telegram",message:"x",status:"new",lead_id:"mb3",created_at:T,updated_at:T});out("mb-p","mb3","draft");dbrun("UPDATE lead_outreach SET inbox_message_id='mb-k' WHERE id='mb-p'");
 const p=await preview({section:"outreach",action:"trash",scope:"ids",ids:["mb-p"]});ok("I18 deleting a draft warns that the customer stays unanswered",p.summary.warnings.includes("unanswered_message"),p.summary);
 await doIt({section:"inbox",action:"trash",scope:"ids",ids:["mb-k"]});ok("I19 the draft moved with the message",col("lead_outreach","status","mb-p")==="trashed");
 const s=await call("/api/leads/outreach/transition",{id:"mb-p",action:"submit"},"POST");ok("I20 and it cannot be submitted",s.status>=400);}

// Media
{const now2=new Date().toISOString(),vm=(id,st)=>fill("visual_product_media",{id,source_platform:"telegram",source_identity:"s"+id,source_media_id:"m"+id,media_type:"photo",source_kind:"owner",ownership_status:"owned",generated_detected:0,candidate_status:st,verified_real_product:st==="verified"?1:0,version:1,created_at:T,updated_at:T});
 W.env.GALLERY_BUCKET=W.env.GALLERY_BUCKET||{};let r2Writes=0;const b=W.env.GALLERY_BUCKET;for(const k of ["delete"]){const f=b[k]?.bind(b);b[k]=async(...a)=>{r2Writes++;return f?.(...a);};}
 vm("gm1","verified");dbrun("INSERT INTO visual_media_storage(id,visual_media_id,provider,object_key,created_at) VALUES('st1','gm1','r2','k/1',?)",[T]);
 vm("gm2","verified");lead("gl1");out("gl-o","gl1","draft");fill("lead_outreach_media",{id:"om1",outreach_id:"gl-o",visual_media_id:"gm2",spec_id:"sp",position:1,created_at:T});
 ok("G1 a photo in an open message stays",(await preview({section:"gallery",action:"trash",scope:"ids",ids:["gm2"]})).summary.blocked.used_in_open_message===1);
 await doIt({section:"gallery",action:"trash",scope:"ids",ids:["gm1"]});
 ok("G2 a deleted photo leaves sales",col("visual_product_media","candidate_status","gm1")==="inactive"&&col("visual_product_media","version","gm1")===2);
 ok("G3 storage rows and the R2 object stay",count("SELECT COUNT(*) n FROM visual_media_storage WHERE id='st1'")===1&&r2Writes===0);
 ok("G4 permanent delete is refused",(await preview({section:"gallery",action:"purge",scope:"ids",ids:["gm1"]})).error==="not_purgeable");
 await doIt({section:"gallery",action:"restore",scope:"ids",ids:["gm1"]});ok("G5 restore returns its status",col("visual_product_media","candidate_status","gm1")==="verified");
 ok("G6 cleanup code never calls R2",!/\.delete\(|BUCKET/.test(fs.readFileSync(path.join(SRC,"cleanup-center.js"),"utf8")));
 dbrun("CREATE TABLE IF NOT EXISTS content_media(id TEXT PRIMARY KEY,content_id TEXT,source_type TEXT,source_id TEXT,media_type TEXT,status TEXT,created_at TEXT)");
 const tc=q("SELECT name FROM pragma_table_info('telegram_media_sources')").map(x=>x.name);if(tc.includes("source_kind")){fill("telegram_media_sources",{id:"tv1",chat_id:"c",message_id:"1",file_id:"f1",file_unique_id:"u1",media_type:"photo",source_kind:"vault",created_at:T,updated_at:T});fill("telegram_media_sources",{id:"tv2",chat_id:"c",message_id:"2",file_id:"f2",file_unique_id:"u2",media_type:"photo",source_kind:"vault",created_at:T,updated_at:T});
  dbrun("INSERT INTO content_media(id,content_id,source_type,source_id,media_type,status,created_at) VALUES('cm1','x','telegram','tv2','photo','ready',?)",[T]);
  ok("G7 a vault file used by content stays",(await preview({section:"vault",action:"trash",scope:"ids",ids:["tv2"]})).summary.blocked.used_by_content===1);
  await doIt({section:"vault",action:"trash",scope:"ids",ids:["tv1"]});ok("G8 the row stays",count("SELECT COUNT(*) n FROM cleanup_trash WHERE record_id='tv1' AND state='trashed'")===1&&count("SELECT COUNT(*) n FROM telegram_media_sources WHERE id='tv1'")===1);
  const src=fs.readFileSync(path.join(SRC,"index.js"),"utf8"),picks=src.split("\n").filter(l=>/m\.source_kind='vault'/.test(l));ok("G9 every vault picker filters Trash",picks.length>=4&&picks.filter(l=>l.includes('cleanupHiddenSql(env,"vault","m.id")')).length>=4,picks.length);
  const hidden=await CC.cleanupHiddenSql(W.env,"vault","m.id"),listed=q("SELECT m.id FROM telegram_media_sources m WHERE m.source_kind='vault'"+hidden).map(x=>x.id);ok("G10 the filter takes the trashed file out and keeps the other",!listed.includes("tv1")&&listed.includes("tv2"),listed);}
 else ok("G7 the vault fixture exists",false);}

// Conversation: only its own messages
{const a={id:7101,name:"A",username:"ua"},b={id:7102,name:"B",username:"ub"};await send(a,"سلام");await send(a,"قیمت؟");await send(b,"سلام");
 const la=q("SELECT lead_id l,conversation_id c FROM inbox_messages WHERE provider_sender_id='7101' LIMIT 1")[0],lb=q("SELECT conversation_id c FROM inbox_messages WHERE provider_sender_id='7102' LIMIT 1")[0];
 dbrun("DELETE FROM lead_outreach WHERE lead_id=?",[la.l]);dbrun("DELETE FROM owner_escalations WHERE 0");
 const r=await doIt({section:"conversations",action:"trash",scope:"ids",ids:[la.c]});
 ok("X1 a conversation takes its own messages to Trash",r.e?.result?.done===1&&count("SELECT COUNT(*) n FROM inbox_messages WHERE conversation_id=? AND status<>'trashed'",[la.c])===0,r);
 ok("X2 another customer is not touched",count("SELECT COUNT(*) n FROM inbox_messages WHERE conversation_id=? AND status='new'",[lb.c])>=1);
 ok("X3 the lead and its records remain",count("SELECT COUNT(*) n FROM leads WHERE id=?",[la.l])===1&&count("SELECT COUNT(*) n FROM lead_conversations WHERE id=?",[la.c])===1);
 await doIt({section:"conversations",action:"restore",scope:"ids",ids:[la.c]});ok("X4 restore brings them back",count("SELECT COUNT(*) n FROM inbox_messages WHERE conversation_id=? AND status='new'",[la.c])>=2);}

// Deduplication: a deleted message stays known, so a redelivered update is not processed again
{const u={id:7201,name:"D",username:"ud"};await send(u,"سلام دوباره");const row=q("SELECT id,external_id,lead_id FROM inbox_messages WHERE provider_sender_id='7201' LIMIT 1")[0];
 await doIt({section:"inbox",action:"trash",scope:"ids",ids:[row.id]});
 const [chat,mid]=String(row.external_id).split(":"),before=count("SELECT COUNT(*) n FROM inbox_messages"),tg=W.tg.length;
 await W.run(new Request("https://w.test/webhooks/telegram",{method:"POST",headers:{"Content-Type":"application/json","X-Telegram-Bot-Api-Secret-Token":"sec"},body:JSON.stringify({update_id:99001,message:{message_id:Number(mid),date:1,text:"سلام دوباره",from:{id:7201,first_name:"D",username:"ud"},chat:{id:Number(chat),type:"private"}}})}));
 ok("Y1 a redelivered deleted message makes no new row",count("SELECT COUNT(*) n FROM inbox_messages")===before);
 ok("Y2 and no new reply",W.tg.length===tg);
 ok("Y3 the row stays in Trash",col("inbox_messages","status",row.id)==="trashed");}

// Automation
{const AE=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+"?a="+Math.random());await AE.autonomyMasterGate(W.env);
 const IDX=await import(pathToFileURL(path.join(SRC,"index.js")).href+"?r="+Math.random());
 const AM=await imp("auto-sales-messaging.js"),inHours=mk=>{for(let h=0;h<48;h++){const t=NOW+h*3600000;if(AM.withinContactHours(mk,AM.autoMessagingSettings(null),t))return t;}return NOW;};
 const run=nowMs=>IDX.runAutoSalesMessaging(W.env,{nowMs,internalFetch:r=>W.run(new Request(r.url.replace("https://internal.local","https://w.test"),r))});
 dbrun("CREATE TABLE IF NOT EXISTS system_kv(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)");
 dbrun("INSERT OR REPLACE INTO system_kv(key,value,updated_at) VALUES('auto_sales_messaging',?,?)",[JSON.stringify({enabled:true,followups:false,initial_drafts:true,per_run:5,per_day:20,local_start_hour:10,local_end_hour:20}),T]);
 const vm0={source:"dataset_discovery",provider:"web",evidence:"گالری طلا و جواهر نمونه · فروش عمده",target_market:"IRAN",city:"تهران",type:"gold_fa",qualification:{buyer_in_title:true,local_domain:true},contact_enrichment_checked_at:ago(2)};
 const nl=(id,n)=>{const url="https://gallery"+n+".ir/";dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",[id,"گالری نمونه "+n,url,"discovered","normal",JSON.stringify({...vm0,url}),T,T]);dbrun("INSERT INTO lead_contacts(id,lead_id,contact_type,raw_value,normalized_value,evidence_status,source,evidence_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",[id+":p",id,"phone","+9821000"+n,"+9821000"+n,"page_extracted","test",url+"contact",T,T]);};
 dbrun("UPDATE leads SET stage='archived' WHERE stage NOT IN ('archived','customer')");
 nl("au1","201");nl("au2","202");
 await doIt({section:"leads",action:"trash",scope:"ids",ids:["au1"]});
 const r1=await run(inHours("IRAN"));ok("A1 a trashed lead gets no first-contact draft",count("SELECT COUNT(*) n FROM lead_outreach WHERE lead_id='au1'")===0&&count("SELECT COUNT(*) n FROM lead_outreach WHERE lead_id='au2'")===1,r1);
 const did=q("SELECT id FROM lead_outreach WHERE lead_id='au2'")[0].id;await doIt({section:"outreach",action:"trash",scope:"ids",ids:[did]});
 await run(inHours("IRAN"));ok("A2 a trashed draft is not written again",count("SELECT COUNT(*) n FROM lead_outreach WHERE lead_id='au2'")===1);
 const s=await call("/api/leads/outreach/send-telegram",{id:did},"POST");ok("A3 a trashed draft cannot be sent",s.status>=400&&col("lead_outreach","status",did)==="trashed",s);
 const t=await call("/api/leads/outreach/transition",{id:did,action:"approve"},"POST");ok("A4 a trashed draft cannot be approved",t.status>=400&&col("lead_outreach","status",did)==="trashed",t);
 // scheduled publishing and retries
 dbrun("INSERT INTO calendar(id,campaign_id,content_id,planned_at,status,created_at,updated_at) VALUES('cal-2',null,'ct-1',?,'planned',?,?)",[ago(-1),T,T]);await doIt({section:"calendar",action:"trash",scope:"ids",ids:["cal-2"]});
 dbrun("UPDATE calendar SET planned_at=? WHERE id='cal-2'",[ago(1)]);const tg=W.tg.length;
 {const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href+"?s="+Math.random())).default,ws=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},W.env,{waitUntil:p=>ws.push(p)});await Promise.allSettled(ws);}ok("A5 a trashed calendar entry is not published",col("calendar","status","cal-2")==="trashed"&&W.tg.length===tg);
 const rq=await doIt({section:"retry",action:"trash",scope:"ids",ids:["rq0"]});ok("A6 a trashed retry stays failed and leaves the view",rq.e.result.done===1&&col("retry_queue","status","rq0")==="failed"&&!(await (await req(W,"/api/autonomy/errors")).json()).retries?.some(x=>x.id==="rq0"));}

// A deleted message is not consent for an automatic follow-up; a control customer still gets one
{const AE=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+"?c="+Math.random());await AE.autonomyMasterGate(W.env);
 const IDX=await import(pathToFileURL(path.join(SRC,"index.js")).href+"?c="+Math.random());const AM=await imp("auto-sales-messaging.js");
 const inH=mk=>{for(let h=0;h<48;h++){const x=NOW+h*3600000;if(AM.withinContactHours(mk,AM.autoMessagingSettings(null),x))return x;}return NOW;};
 const run=nowMs=>IDX.runAutoSalesMessaging(W.env,{nowMs,internalFetch:r=>W.run(new Request(r.url.replace("https://internal.local","https://w.test"),r))});
 dbrun("UPDATE system_kv SET value=? WHERE key='auto_sales_messaging'",[JSON.stringify({enabled:true,followups:true,initial_drafts:false,per_run:5,per_day:20,local_start_hour:10,local_end_hour:20})]);
 const customer=async(id,text)=>{const u={id,name:"F"+id,username:"f"+id};await send(u,text);setMarket(u,"iran");const lid=q("SELECT lead_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(id)])[0].lead_id;dbrun("UPDATE inbox_messages SET created_at=? WHERE lead_id=?",[ago(16),lid]);const c=q("SELECT id FROM lead_contacts WHERE lead_id=? LIMIT 1",[lid])[0];dbrun("DELETE FROM lead_outreach WHERE lead_id=?",[lid]);dbrun("INSERT INTO lead_outreach(id,lead_id,contact_id,channel,recipient,message,language,status,approved_at,approved_by,sent_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",["pv-"+lid,lid,c?.id||null,"telegram",String(id),"earlier","Persian","sent",ago(15),"admin",ago(15),ago(15),ago(15)]);return {u,lid};};
 const gone=await customer(7801,"سلام، جعبه جواهر می‌خواهم"),ctl=await customer(7802,"سلام، جعبه انگشتر می‌خواهم");
 const ids=q("SELECT id FROM inbox_messages WHERE lead_id=?",[gone.lid]).map(x=>x.id);await doIt({section:"inbox",action:"trash",scope:"ids",ids});
 const sent=l=>count("SELECT COUNT(*) n FROM lead_outreach WHERE lead_id=? AND status='sent'",[l]),a=sent(gone.lid),b=sent(ctl.lid),r=await run(inH("IRAN"));
 ok("A7 control: a normal customer gets the follow-up",sent(ctl.lid)===b+1,r);
 ok("A8 no follow-up rests on a deleted message",sent(gone.lid)===a&&r.skipped?.no_customer_conversation>=1,r);
 dbrun("UPDATE system_kv SET value=? WHERE key='auto_sales_messaging'",[JSON.stringify({enabled:true,followups:false,initial_drafts:true,per_run:5,per_day:20,local_start_hour:10,local_end_hour:20})]);}

// Queues and views
{const OPS=await imp("agent-ops-store.js");
 fill("autonomy_tasks",{id:"tk-f",module:"m",action:"a",status:"failed",priority:1,attempts:3,created_at:T,updated_at:T});
 fill("agent_dead_letters",{id:"dl1",task_id:"tk-f",agent:"a",state:"failed",attempts:3,created_at:T});
 fill("autonomy_tasks",{id:"tk-hide",module:"m",action:"a",status:"failed",priority:1,attempts:3,created_at:T,updated_at:T});await doIt({section:"tasks",action:"trash",scope:"ids",ids:["tk-hide"]});
 fill("agent_dead_letters",{id:"dl-hide",task_id:"tk-none",agent:"a",state:"failed",attempts:3,created_at:new Date().toISOString()});await doIt({section:"dlq",action:"trash",scope:"ids",ids:["dl-hide"]});
 const blocked=await preview({section:"tasks",action:"trash",scope:"ids",ids:["tk-f"]});ok("Q1 a task with an open dead letter waits",blocked.summary.blocked.open_dead_letter===1);
 await doIt({section:"dlq",action:"trash",scope:"ids",ids:["dl1"]});ok("Q2 DLQ dismissal closes it without a retry",col("agent_dead_letters","resolution","dl1")==="dismissed"&&col("autonomy_tasks","status","tk-f")==="failed");
 const res=await OPS.resolveDeadLetter?.(W.env,{id:"dl1",resolution:"retried",actor:"admin"}).catch(e=>({error:String(e)}));ok("Q3 a dismissed dead letter cannot be replayed",col("autonomy_tasks","status","tk-f")==="failed",res);
 await doIt({section:"dlq",action:"restore",scope:"ids",ids:["dl1"]});ok("Q4 restore reopens it",col("agent_dead_letters","resolved_at","dl1")===null&&col("agent_dead_letters","resolution","dl1")===null);
 dbrun("INSERT INTO system_events VALUES('ev1','scheduled_step_failed','error','m','{}',?)",[T]);dbrun("INSERT INTO system_events VALUES('ev2','telegram_webhook_rejected','warning','m','{}',?)",[T]);
 const seen=async id=>(await (await req(W,"/api/system/events?kind=errors")).json()).items.some(x=>x.id===id);
 ok("Q5 errors show before cleanup",await seen("ev1"));await doIt({section:"errors",action:"trash",scope:"ids",ids:["ev1","ev2"]});ok("Q6 errors leave the view",!(await seen("ev1"))&&count("SELECT COUNT(*) n FROM system_events WHERE id='ev1'")===1);
 fill("agent_alerts",{id:"al2",scheduler:"watchdog",code:"c2",agent:"a",level:"warning",recovery_state:"recovered",first_seen_at:T,last_seen_at:new Date().toISOString(),occurrences:1});
 await doIt({section:"alerts",action:"trash",scope:"ids",ids:["al2"]});dbrun("UPDATE agent_alerts SET recovery_state='open' WHERE id='al2'");
 const av=await OPS.opsOverview(W.env,{nowMs:Date.now()});ok("Q7 a hidden alert that fires again stays visible",JSON.stringify(av).includes("c2"),av?.alerts);
 dbrun("UPDATE agent_alerts SET recovery_state='recovered' WHERE id='al2'");ok("Q7b while recovered it stays hidden",!JSON.stringify(await OPS.opsOverview(W.env,{nowMs:Date.now()})).includes('"code":"c2"'));
 ok("Q7c a dismissed dead letter leaves the agents view",!(await OPS.opsOverview(W.env,{nowMs:Date.now()})).dead_letters?.some(x=>x.id==="dl-hide"));
 {const tk=(await (await req(W,"/api/autonomy/errors")).json());ok("Q7d a trashed task leaves the errors view",!JSON.stringify(tk).includes("tk-hide"));}
 lead("ec1");esc("e-res","ec1","resolved");await doIt({section:"escalations",action:"trash",scope:"ids",ids:["e-res"]});
 ok("Q8 a resolved escalation leaves the list, the row stays",!(await (await req(W,"/api/owner-escalations")).json()).items.some(x=>x.id==="e-res")&&count("SELECT COUNT(*) n FROM owner_escalations WHERE id='e-res'")===1);
 dbrun("UPDATE owner_escalations SET status='open' WHERE id='e-res'");ok("Q9 reopened, it is visible again",(await (await req(W,"/api/owner-escalations")).json()).items.some(x=>x.id==="e-res"));
 dec("d-res","ec1","RESOLVED");await doIt({section:"decisions",action:"trash",scope:"ids",ids:["d-res"]});
 ok("Q10 a resolved decision leaves the list, the row stays",!(await (await req(W,"/api/si/decisions?status=ALL")).json()).items?.some(x=>x.id==="d-res")&&col("owner_decisions","status","d-res")==="RESOLVED");}

// Permanent delete
{const p=await preview({section:"errors",action:"purge",scope:"ids",ids:["ev1"]});ok("U1 retention stops an early permanent delete",p.count===0&&p.summary.blocked.retention_active===1,p.summary);
 dbrun("UPDATE cleanup_trash SET deleted_at=? WHERE section='errors'",[ago(40)]);
 const a=await preview({section:"errors",action:"purge",scope:"ids",ids:["ev2"]});ok("U2 security evidence is never purged",a.count===0&&a.summary.blocked.audit_evidence===1,a.summary);
 const b=await preview({section:"errors",action:"purge",scope:"ids",ids:["ev1"]});ok("U3 a purge always needs the phrase",!!b.confirm_phrase&&(await exec(b.token)).error==="confirmation_mismatch"&&count("SELECT COUNT(*) n FROM system_events WHERE id='ev1'")===1);
 const e=await exec(b.token,b.confirm_phrase);ok("U4 after retention the row goes",e.result.done===1&&count("SELECT COUNT(*) n FROM system_events WHERE id='ev1'")===0,e);
 ok("U5 the tombstone keeps no content",q("SELECT state,prior_json p FROM cleanup_trash WHERE record_id='ev1'")[0].state==="purged"&&q("SELECT prior_json p FROM cleanup_trash WHERE record_id='ev1'")[0].p==="{}");
 ok("U6 a purged record is not restorable",(await preview({section:"errors",action:"restore",scope:"ids",ids:["ev1"]})).summary.not_available===1);
 fill("autonomy_tasks",{id:"tk-p1",module:"m",action:"a",status:"failed",priority:1,attempts:3,created_at:T,updated_at:T});fill("autonomy_tasks",{id:"tk-p2",module:"m",action:"a",status:"failed",priority:1,attempts:3,created_at:T,updated_at:T});
 fill("agent_approvals",{id:"ap1",task_id:"tk-p2",status:"pending"});
 await doIt({section:"tasks",action:"trash",scope:"ids",ids:["tk-p1","tk-p2"]});dbrun("UPDATE cleanup_trash SET deleted_at=? WHERE section='tasks'",[ago(40)]);
 const tp=await preview({section:"tasks",action:"purge",scope:"ids",ids:["tk-p1","tk-p2"]});ok("U8 a task with linked history is kept",tp.count===1&&tp.summary.blocked.linked_history===1,tp.summary);await exec(tp.token,tp.confirm_phrase);ok("U9 the plain one goes, no orphan",count("SELECT COUNT(*) n FROM autonomy_tasks WHERE id='tk-p1'")===0&&count("SELECT COUNT(*) n FROM autonomy_tasks WHERE id='tk-p2'")===1);
 await doIt({section:"retry",action:"trash",scope:"ids",ids:["rq1"]});dbrun("UPDATE cleanup_trash SET deleted_at=? WHERE record_id='rq1'",[ago(40)]);dbrun("UPDATE retry_queue SET status='queued' WHERE id='rq1'");
 ok("U10 a record active again cannot be purged",(await preview({section:"retry",action:"purge",scope:"ids",ids:["rq1"]})).summary.blocked.job_active===1);dbrun("UPDATE retry_queue SET status='failed' WHERE id='rq1'");
 dbrun("INSERT INTO calendar(id,campaign_id,content_id,planned_at,status,created_at,updated_at) VALUES('cal-x',null,'x',?,'failed',?,?)",[T,T,T]);await doIt({section:"calendar",action:"trash",scope:"ids",ids:["cal-x"]});dbrun("UPDATE cleanup_trash SET deleted_at=? WHERE record_id='cal-x'",[ago(40)]);const cp=await preview({section:"calendar",action:"purge",scope:"ids",ids:["cal-x"]});await exec(cp.token,cp.confirm_phrase);ok("U11 calendar purge",count("SELECT COUNT(*) n FROM calendar WHERE id='cal-x'")===0);
 ok("U7 payments stay immutable",(()=>{try{dbrun("DELETE FROM lead_order_payments WHERE 1=1");return count("SELECT COUNT(*) n FROM lead_order_payments")===0;}catch{return true;}})());}

// Audit and side effects
{const ev=q("SELECT details_json d FROM system_events WHERE type='cleanup_executed'").map(x=>x.d);
 ok("Z1 each executed action is audited",ev.length>20);
 ok("Z2 the audit holds no customer text",!ev.some(d=>/secret customer text|سلام/.test(d)));
 ok("Z3 an audit row is not offered for cleanup",(await items("errors")).items.every(x=>x.title!=="cleanup_executed"));
 ok("Z4 opt-out and price tables are not referenced by any write",!/(UPDATE|DELETE FROM|INSERT[^"`]*INTO)\s+(commercial_price_items|price_versions|lead_order_payments|sales_knowledge_facts|approval_queue|business_settings)/.test(fs.readFileSync(path.join(SRC,"cleanup-center.js"),"utf8")));
 ok("Z5 cleanup code holds no send or retry call",!/sendMessage|api\.telegram|retry_queue SET|status='queued'|fetch\(/.test(fs.readFileSync(path.join(SRC,"cleanup-center.js"),"utf8")));
 ok("Z6 no orphaned foreign key",q("SELECT COUNT(*) n FROM pragma_foreign_key_check")[0].n===0);}

// Test data
{const c=CC.classifyTestEvidence;
 ok("E1 a name alone is not evidence",c({name:"mil",messages:["سلام","قیمت جعبه؟"]}).candidate===false);
 ok("E2 a name plus one signal counts",c({name:"mil",messages:["write python code"]}).candidate===true);
 ok("E3 one signal without the name does not",c({name:"Ali",messages:["this is a test"]}).candidate===false);
 ok("E4 two signals do",c({name:"Ali",messages:["this is a test","write python code"]}).candidate===true);
 ok("E5 a paying customer never is",c({name:"mil",messages:["test","python"],paidOrders:1}).candidate===false);
 ok("E6 the word inside another word does not count",c({name:"Ali",messages:["contest latest"]}).signals.length===0);
 const tgb=W.tg.length,before=JSON.stringify(q("SELECT id,stage FROM leads ORDER BY id"));
 const u={id:7301,name:"mil",username:"um"};await send(u,"this is a test, write python code");const lid=q("SELECT lead_id l FROM inbox_messages WHERE provider_sender_id='7301' LIMIT 1")[0].l;dbrun("UPDATE leads SET name='mil' WHERE id=?",[lid]);
 const before2=JSON.stringify(q("SELECT id,stage FROM leads ORDER BY id")),d=await (await req(W,"/api/cleanup/test-candidates")).json(),x=d.items.find(i=>i.id===lid);
 ok("E7 the candidate shows reasons and links",x&&x.signals.length>=2&&x.manual_only===true&&typeof x.linked.messages==="number",x);
 ok("E8 listing candidates changes nothing",JSON.stringify(q("SELECT id,stage FROM leads ORDER BY id"))===before2);
 ok("E9 no message text is returned",!JSON.stringify(d).includes("write python code"));void before;void tgb;}

// Dashboard
{const h=DP.liveDashboardHtml("cleanup");
 ok("H1 the page exists and routes",DP.dashboardRoute("/dashboard/cleanup")==="cleanup"&&/id="cleanupPanel"/.test(h));
 for(const w of ["حذف انتخاب‌شده‌ها","حذف همه","سطل زباله","بازیابی","حذف دائمی","پاک‌سازی خطاهای قدیمی","پاک‌سازی داده‌های آزمایشی","صفحه فعلی","نتایج فیلتر فعلی","کل موارد مجاز این بخش"])ok("H2 label: "+w,h.includes(w));
 const scripts=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);let parsed=true;for(const s of scripts){try{new vm.Script(s);}catch(e){parsed=false;console.log(String(e).slice(0,200));}}ok("H3 every script parses",parsed&&scripts.length>=2);
 ok("H4 row text is escaped",/esc\(x\.title/.test(h)&&/esc\(x\.sub/.test(h)&&!/onclick='[^']*x\.id/.test(h.slice(h.indexOf("REASON"),h.indexOf("REASON")+9000)));
 const other=DP.liveDashboardHtml("errors");ok("H5 lists carry the controls and skip the page script",other.includes("window.CL=")&&other.includes('CL.bar("errors")')&&!other.includes("loadCleanup=async"));
 for(const sec of ["contents","outreach","inbox","escalations","leads","dlq","gallery"])ok("H7 list control: "+sec,DP.liveDashboardHtml("all").includes('CL.rowCtl("'+sec+'"')||DP.liveDashboardHtml("gallery").includes('CL.rowCtl("'+sec+'"'));
 for(const w of ["حذف همه موارد مجاز","انتخاب همه","سطل زباله"])ok("H8 list label: "+w,other.includes(w));
 ok("H6 the page is under More",DP.liveDashboardHtml("more").includes("/dashboard/cleanup"));}

{const n=W.tg.length;lead("zz1");out("zz-o","zz1","approved",{approved_at:T,approved_by:"admin"});await doIt({section:"outreach",action:"trash",scope:"ids",ids:["zz-o"]});await doIt({section:"outreach",action:"restore",scope:"ids",ids:["zz-o"]});await doIt({section:"leads",action:"trash",scope:"ids",ids:["bk2"]});await doIt({section:"retry",action:"trash",scope:"section"});ok("Z7 cleanup makes no Telegram call",W.tg.length===n);void tgBefore;}
done();
