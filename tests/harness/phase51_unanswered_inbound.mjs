// CLAIM-VALIDATION — an inbound customer message whose processing failed (no reply draft, no owner case) raises an owner alert
// through the existing watchdog alert lifecycle; detection only (no retry, model call, draft or customer send). Local only:
// in-memory SQLite, recording Telegram, scripted model; the Stage 2B ops migration is applied to the in-memory database only.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase51_unanswered_inbound");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const W=await makeWorld({aiBrain:"on"});const {q,dbrun}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
W.env.AUTONOMY_ORCHESTRATOR="on";
const WD=await import(pathToFileURL(path.join(SRC,"agent-watchdog.js")).href);
await W.call('/api/sales-ai-first',{mode:'on'});W.AI.fallback=()=>W.D({requests:['greeting'],reply:'سلام، در خدمتم.'});
const user={id:9519771,name:'Local unanswered inbound',username:'localunanswered51'};
await W.send(user,'سلام');W.setMarket(user,'iran');
const rows=q("SELECT id FROM inbox_messages WHERE provider_sender_id=? ORDER BY created_at,rowid",[String(user.id)]);
ok('A stored customer message exists',rows.length>=1,rows);
const answered=rows[0].id,lost='unanswered-'+Date.now();
// Simulate the failure path: a stored customer message whose processing failed on both attempts, leaving no draft and no owner
// case (a copy of the stored row under a new id — exactly what an exception before drafting leaves behind).
W.d1.db.exec("CREATE TEMP TABLE _m AS SELECT * FROM inbox_messages WHERE id='"+answered+"'");
for(const c of q("PRAGMA table_info(inbox_messages)").map(x=>x.name))if(/^(?:provider_message_id|external_id|telegram_message_id|dedupe_key)$/.test(c))W.d1.db.exec("UPDATE _m SET "+c+"="+c+"||'-u'");
W.d1.db.exec("UPDATE _m SET id='"+lost+"'");W.d1.db.exec("INSERT INTO inbox_messages SELECT * FROM _m");
ok('Simulated message has no draft and no owner case',!q('SELECT 1 FROM lead_outreach WHERE inbox_message_id=?',[lost]).length&&!q('SELECT 1 FROM owner_escalations WHERE source_message_id=?',[lost]).length);
const t=new Date().toISOString(),key='inbox:'+lost+':process';
dbrun("INSERT INTO ai_call_flights(flight_key,purpose,lead_id,conversation_id,inbox_message_id,status,owner_token,fence,attempt,lease_until,expires_at,provider,requested_model,created_at,updated_at,error_code) VALUES(?,?,?,?,?,'failed','tok',1,2,?,?,NULL,NULL,?,?,'processing_failed')",[key,'inbound_processing',null,null,lost,t,new Date(Date.now()+86400000).toISOString(),t,t]);
const tg0=W.tg.length,ai0=W.AI.requests.length;
await WD.runWatchdog(W.env);
const alert=q("SELECT * FROM agent_alerts WHERE scheduler='watchdog' AND code='inbound_unanswered' AND acknowledged_at IS NULL")[0];
ok('Failed inbound with no draft and no owner case raises a critical owner alert',alert?.level==='critical'&&alert?.recovery_state==='open',alert);
ok('The alert names the unanswered message only',JSON.parse(alert?.affected_tasks_json||'[]').includes(lost)&&!JSON.parse(alert?.affected_tasks_json||'[]').includes(answered),alert?.affected_tasks_json);
ok('Detection only: no customer send and no model call',W.tg.length===tg0&&W.AI.requests.length===ai0,{tg:W.tg.length-tg0,ai:W.AI.requests.length-ai0});
// A later successful processing clears the alert through the existing recovery lifecycle.
dbrun("UPDATE ai_call_flights SET status='succeeded',error_code=NULL WHERE flight_key=?",[key]);
await WD.runWatchdog(W.env);
const after=q("SELECT * FROM agent_alerts WHERE scheduler='watchdog' AND code='inbound_unanswered'")[0];
ok('Alert recovers once the message is no longer unanswered',after?.recovery_state==='recovered',after);
done();
