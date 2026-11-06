// PHASE 24 — local stabilization: honest approval counters, no duplicate first-contact drafts, no automatic follow-up while the owner
// holds the matter, clear channel states, reversible inbox archive. Synthetic data only; Telegram is the in-process mock.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase24_1");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const imp=f=>import(pathToFileURL(path.join(SRC,f)).href);
const AM=await imp("auto-sales-messaging.js"),DP=await imp("live-dashboard-page.js");
const W=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on",OWNER_TELEGRAM_CHAT_ID:"-100555123456"}});const {q,dbrun,call,send,setMarket}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
W.dbrun("CREATE TABLE IF NOT EXISTS telegram_media_sources(id TEXT PRIMARY KEY,chat_id TEXT NOT NULL)");
const AE=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+"?a="+Math.random());await AE.autonomyMasterGate(W.env);
const IDX=await import(pathToFileURL(path.join(SRC,"index.js")).href+"?r="+Math.random());
const run=nowMs=>IDX.runAutoSalesMessaging(W.env,{nowMs,internalFetch:r=>W.run(new Request(r.url.replace("https://internal.local","https://w.test"),r))});
const NOW=Date.now(),ago=d=>new Date(NOW-d*86400000).toISOString(),T="2026-10-01T00:00:00.000Z";
const inHours=mk=>{for(let h=0;h<48;h++){const t=NOW+h*3600000;if(AM.withinContactHours(mk,AM.autoMessagingSettings(null),t))return t;}return NOW;};
await call("/api/quotes",null,"GET");await call("/api/si/knowledge/product",null,"GET");
dbrun("CREATE TABLE IF NOT EXISTS system_kv(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)");
dbrun("INSERT OR REPLACE INTO system_kv(key,value,updated_at) VALUES('auto_sales_messaging',?,?)",[JSON.stringify({enabled:true,followups:true,initial_drafts:true,per_run:5,per_day:20,local_start_hour:10,local_end_hour:20}),T]);

// Approval counters
{const cols=q("SELECT name FROM pragma_table_info('contents')").map(x=>x.name),base=id=>{const v={};for(const c of cols)v[c]="x";v.id=id;v.created_at=T;v.updated_at=T;return v;};
 const add=(id,status)=>{const v={...base(id),status};for(const c of q("SELECT name,\"notnull\" nn,type FROM pragma_table_info('contents')"))if(c.type==="INTEGER"||c.type==="REAL")v[c.name]=0;const k=Object.keys(v);dbrun(`INSERT INTO contents(${k.join(",")}) VALUES(${k.map(()=>"?").join(",")})`,k.map(c=>v[c]));};
 const row=(id,c,status,t)=>dbrun("INSERT INTO approval_queue VALUES(?,?,?,?,?,?)",[id,c,status,"r",t,t]);
 add("C1","approved");row("q1","C1","pending",T);row("q2","C1","approved","2026-10-02T00:00:00.000Z");add("C2","generated");row("q3","C2","pending",T);
 const a=(await call("/api/content/automation",null,"GET")).body,p=(await call("/api/content/pipeline",null,"GET")).body;
 ok("A1 an approved item's old pending row is not counted as work",a?.automation?.pending_approval===1||a?.automation?.pending===1||JSON.stringify(a).includes('"pending_approval":1')||JSON.stringify(a).includes('"pending_count":1'),a?.automation);
 ok("A2 the pipeline counter agrees",p?.pipeline?.counts?.pending_approval===1,p?.pipeline?.counts);
 ok("A3 the approval history stays intact",q("SELECT COUNT(*) n FROM approval_queue")[0].n===3&&q("SELECT status FROM approval_queue WHERE id='q1'")[0].status==="pending");
 const list=(await call("/api/content?status=generated",null,"GET")).body.items.filter(x=>x.approval_status==="pending").map(x=>x.id);ok("A4 the approval list shows only the waiting item",list.length===1&&list[0]==="C2",list);}

// Follow-ups
let uid=9100;const customer=async text=>{const u={id:++uid,name:"Cust",username:"f"+uid};await send(u,text);setMarket(u,"iran");const lid=q("SELECT lead_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(u.id)])[0].lead_id;
 dbrun("UPDATE inbox_messages SET created_at=? WHERE lead_id=?",[ago(16),lid]);const c=q("SELECT id FROM lead_contacts WHERE lead_id=? LIMIT 1",[lid])[0];dbrun("DELETE FROM lead_outreach WHERE lead_id=?",[lid]);
 dbrun("INSERT INTO lead_outreach(id,lead_id,contact_id,channel,recipient,message,language,status,approved_at,approved_by,sent_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",["prev-"+lid,lid,c?.id||null,"telegram",String(u.id),"earlier reply","Persian","sent",ago(15),"admin",ago(15),ago(15),ago(15)]);return {u,lid};};
const conv=lid=>q("SELECT id FROM lead_conversations WHERE lead_id=? LIMIT 1",[lid])[0]?.id||"c";
const toCustomer=u=>W.tg.filter(x=>x.method==="sendMessage"&&String(x.body).includes(String(u.id))).length;
{const free=await customer("سلام، جعبه جواهر می‌خواهم"),esc=await customer("سلام، جعبه انگشتر می‌خواهم"),dec=await customer("سلام، جعبه ساعت می‌خواهم"),held=await customer("سلام، جعبه هدیه می‌خواهم");
 const t=new Date().toISOString();
 {const ec=q("SELECT name,\"notnull\" nn,dflt_value d FROM pragma_table_info('owner_escalations')").filter(c=>c.nn&&c.d===null).map(c=>c.name),e={id:"e1",escalation_key:"k1",lead_id:esc.lid,conversation_id:conv(esc.lid),status:"open",version:1,reason_code:"unclear_moq",created_at:t,updated_at:t};for(const c of ec)if(!(c in e))e[c]="x";const k=Object.keys(e);dbrun(`INSERT INTO owner_escalations(${k.join(",")}) VALUES(${k.map(()=>"?").join(",")})`,k.map(c=>e[c]));}
 const dc=q("SELECT name,\"notnull\" nn,dflt_value d FROM pragma_table_info('owner_decisions')").filter(c=>c.nn&&c.d===null).map(c=>c.name),v={id:"d1",status:"PENDING",priority:"HIGH",decision_type:"ESCALATION_UNCLEAR_MOQ",fingerprint:"f1",lead_id:dec.lid,question:"q",created_at:t,updated_at:t};for(const c of dc)if(!(c in v))v[c]="x";const k=Object.keys(v);dbrun(`INSERT INTO owner_decisions(${k.join(",")}) VALUES(${k.map(()=>"?").join(",")})`,k.map(c=>v[c]));
 const FQ=await imp("final-quote-review.js");await FQ.ensureFinalQuoteStore(W.env);const oid="held-"+held.lid;
 dbrun("INSERT INTO lead_outreach(id,lead_id,channel,recipient,message,language,status,created_at,updated_at) VALUES(?,?,'telegram',?,'held total','Persian','draft',?,?)",[oid,held.lid,String(held.u.id),ago(20),ago(20)]);
 dbrun("INSERT INTO final_quote_reviews(outreach_id,lead_id,conversation_id,reason,created_at,updated_at) VALUES(?,?,?,'quantity_total',?,?)",[oid,held.lid,conv(held.lid),t,t]);
 const b={e:toCustomer(esc.u),d:toCustomer(dec.u),h:toCustomer(held.u),f:toCustomer(free.u)},r=await run(inHours("IRAN"));
 ok("F1 an open escalation stops the automatic follow-up",toCustomer(esc.u)===b.e&&r.skipped?.owner_decision_open>=1,r);
 ok("F2 a pending owner decision stops it",toCustomer(dec.u)===b.d,r);
 ok("F3 a held quote stops it",toCustomer(held.u)===b.h&&await FQ.finalQuoteWaiting(W.env,held.lid)===true,r);
 ok("F3b the check is scoped to that lead",await FQ.finalQuoteWaiting(W.env,free.lid)===false);
 ok("F3c the held quote is named as the reason",r.skipped?.final_quote_waiting>=1,r);
 for(const s of ["pending_approval","approved"]){dbrun("UPDATE lead_outreach SET status=? WHERE id=?",[s,oid]);ok("F3d "+s+" still counts as waiting",await FQ.finalQuoteWaiting(W.env,held.lid)===true);}
 for(const s of ["sent","rejected"]){dbrun("UPDATE lead_outreach SET status=? WHERE id=?",[s,oid]);ok("F3e "+s+" no longer counts as waiting",await FQ.finalQuoteWaiting(W.env,held.lid)===false);}
 dbrun("UPDATE lead_outreach SET status='draft' WHERE id=?",[oid]);
 ok("F4 a customer with nothing open still gets the permitted follow-up",toCustomer(free.u)===b.f+1,{r,b:b.f,a:toCustomer(free.u)});}

// First-contact drafts. A lead whose latest row is open is already routed to the owner; the guard covers an older open row behind a newer failed one.
{const t=ago(30),vm={source:"dataset_discovery",provider:"web",url:"https://sample-gallery.ir/",evidence:"گالری طلا و جواهر نمونه · فروش عمده",target_market:"IRAN",city:"تهران",type:"gold_fa",qualification:{buyer_in_title:true,local_domain:true},contact_enrichment_checked_at:ago(2)};
 const newLead=(id,n,at=t)=>{const url="https://gallery"+n+".ir/";dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",[id,"گالری نمونه "+n,url,"discovered","normal",JSON.stringify({...vm,url}),at,at]);dbrun("INSERT INTO lead_contacts(id,lead_id,contact_type,raw_value,normalized_value,evidence_status,source,evidence_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",[id+":p",id,"phone","+9821000"+n,"+9821000"+n,"page_extracted","test",url+"contact",t,t]);};
 const row=(id,lid,status,at)=>dbrun("INSERT INTO lead_outreach(id,lead_id,channel,recipient,message,language,status,created_at,updated_at) VALUES(?,?,'manual','s','old','Persian',?,?,?)",[id,lid,status,at,at]);
 const count=l=>q("SELECT COUNT(*) n FROM lead_outreach WHERE lead_id=?",[l])[0].n,cfg=per_run=>dbrun("UPDATE system_kv SET value=? WHERE key='auto_sales_messaging'",[JSON.stringify({enabled:true,followups:false,initial_drafts:true,per_run,per_day:20,local_start_hour:10,local_end_hour:20})]);
 cfg(1);for(const n of [1,2]){newLead("held"+n,"10"+n);row("old"+n,"held"+n,"draft",ago(30));row("new"+n,"held"+n,"failed",ago(20));}newLead("own3","103");row("old3","own3","draft",ago(30));newLead("free1","104",ago(60));
 const r1=await run(inHours("IRAN"));
 ok("D1 an older open draft does not get a twin",count("held1")===2&&count("held2")===2&&r1.skipped?.draft_open_exists===2,r1);
 ok("D2 and it is not approved or sent by the run",q("SELECT status FROM lead_outreach WHERE id='old1'")[0].status==="draft");
 ok("D3 held leads do not use up the run: the next lead gets its draft",count("free1")===1&&r1.drafts===1,r1);
 ok("D3b a lead whose latest row is open stays with the owner",count("own3")===1,r1);
 newLead("free2","105");newLead("free3","106");const r2=await run(inHours("IRAN"));ok("D4 a run stays inside its limit",r2.drafts===1&&count("free2")+count("free3")===1,r2);
 // A failed check stops first-contact drafts only; it does not throw out of the run.
 {const prep=W.env.DB.prepare.bind(W.env.DB),left=count("free2")===0?"free2":"free3";W.env.DB.prepare=x=>{if(String(x).startsWith("SELECT DISTINCT lead_id FROM lead_outreach"))throw Error("d1 down");return prep(x);};
  let r3=null,err=null;try{r3=await run(inHours("IRAN"));}catch(e){err=e;}W.env.DB.prepare=prep;
  ok("D5 a failed check makes no draft and does not stop the run",!err&&r3?.skipped?.draft_check_failed===1&&count(left)===0,{r3,err:String(err)});}}

// Non-Telegram approved rows
{const lid=q("SELECT id FROM leads LIMIT 1")[0].id;dbrun("INSERT INTO lead_outreach(id,lead_id,channel,recipient,message,language,status,approved_at,approved_by,created_at,updated_at) VALUES('ig1',?,'instagram','shop','msg','Persian','approved',?,'admin',?,?)",[lid,T,T,T]);
 const before=W.tg.length,s=await call("/api/leads/outreach/send-telegram",{id:"ig1"});ok("M1 an approved Instagram row cannot be sent through Telegram",s.body?.ok!==true&&W.tg.length===before&&q("SELECT status FROM lead_outreach WHERE id='ig1'")[0].status==="approved",s.body);
 const h=DP.liveDashboardHtml("all");ok("M2 the dashboard says approved is not sent for other channels",h.includes("APPROVED · NOT SENT"));}

// Inbox archive, reversible
{const id=q("SELECT id FROM inbox_messages LIMIT 1")[0].id,msg=q("SELECT message FROM inbox_messages WHERE id=?",[id])[0].message;
 await call("/api/inbox",{id,status:"archived"},"PATCH");ok("I1 archive changes only the status",q("SELECT status,message FROM inbox_messages WHERE id=?",[id])[0].status==="archived"&&q("SELECT message FROM inbox_messages WHERE id=?",[id])[0].message===msg);
 await call("/api/inbox",{id,status:"new"},"PATCH");ok("I2 restore brings it back",q("SELECT status FROM inbox_messages WHERE id=?",[id])[0].status==="new");
 const h=DP.liveDashboardHtml("all");ok("I3 the inbox has archive and restore controls",h.includes("setInboxArchived")&&h.includes("RESTORE"));}

// Final quote counters
{const b=W.tg.length;const d=(await call("/api/final-quotes",null,"GET")).body;ok("Q1 the approval counters do not call Telegram",W.tg.length===b&&d.ok===true,W.tg.slice(b).map(x=>x.method));
 const e=(await call("/api/final-quotes?verify=1",null,"GET")).body;ok("Q2 the panel's verify call uses getChat only",W.tg.slice(b).every(x=>x.method==="getChat")&&W.tg.length===b+1&&e.ok===true,W.tg.slice(b).map(x=>x.method));
 const h=DP.liveDashboardHtml("all");ok("Q3 held quotes are part of the owner's approval count",/const heldQ=fq\.ok/.test(h));
 {const m=h.match(/const heldQ=(fq\.ok\?[^;]+);/),count=items=>new Function("fq","return "+m[1])({ok:true,items});ok("Q3b only a waiting held draft counts",count([{state:"pending",outreach_status:"draft"},{state:"unresolved",outreach_status:"draft"},{state:"pending",outreach_status:"sent"},{state:"pending",outreach_status:"pending_approval"},{state:"approved",outreach_status:"draft"}])===2);}
 let bad=0;for(const r of Object.keys(DP.DASHBOARD_PAGES))for(const x of DP.liveDashboardHtml(r).matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)){try{new Function(x[1]);}catch{bad++;}}ok("Q4 the dashboard script parses on every page",bad===0,bad);}

// Publishing destination message
{const src=fs.readFileSync(path.join(SRC,"index.js"),"utf8");ok("P1 a missing publishing destination is named as such",src.split("Telegram publishing destination not configured (TELEGRAM_CHAT_ID)").length===3);}
done();process.exit(0);
