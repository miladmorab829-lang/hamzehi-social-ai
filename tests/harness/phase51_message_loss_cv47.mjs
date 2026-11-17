// cv47 — message-loss and availability guards (independent reviewers on cv45): (1) the watchdog also detects an inbound whose
// processing flight is still 'running' with an expired lease (Worker killed mid-processing), but not a live one; (2) a long unbroken
// letter run cannot stall the validators (ReDoS) and fails closed; (3) spoken unit prices are price claims again.
// Local only: in-memory SQLite, recording Telegram, scripted model; no Production access.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase51_message_loss_cv47");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const W=await makeWorld({aiBrain:"on"});const {q,dbrun}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
W.env.AUTONOMY_ORCHESTRATOR="on";
const WD=await import(pathToFileURL(path.join(SRC,"agent-watchdog.js")).href);
const BR=await import(pathToFileURL(path.join(SRC,"sales-ai-brain.js")).href);
const IX=await import(pathToFileURL(path.join(SRC,"index.js")).href);
await W.call('/api/sales-ai-first',{mode:'on'});W.AI.fallback=()=>W.D({requests:['greeting'],reply:'سلام، در خدمتم.'});
const user={id:9519881,name:'Local lease loss',username:'localleaseloss51'};
await W.send(user,'سلام');W.setMarket(user,'iran');
const base=q("SELECT id FROM inbox_messages WHERE provider_sender_id=? ORDER BY created_at,rowid",[String(user.id)])[0].id;
const copy=id=>{W.d1.db.exec("DROP TABLE IF EXISTS _m");W.d1.db.exec("CREATE TEMP TABLE _m AS SELECT * FROM inbox_messages WHERE id='"+base+"'");
 for(const c of q("PRAGMA table_info(inbox_messages)").map(x=>x.name))if(/^(?:provider_message_id|external_id|telegram_message_id|dedupe_key)$/.test(c))W.d1.db.exec("UPDATE _m SET "+c+"="+c+"||'-"+id+"'");
 W.d1.db.exec("UPDATE _m SET id='"+id+"'");W.d1.db.exec("INSERT INTO inbox_messages SELECT * FROM _m");};
const stale='lease-stale-'+Date.now(),live='lease-live-'+Date.now();copy(stale);copy(live);
const now=Date.now(),iso=ms=>new Date(ms).toISOString();
const flight=(id,lease)=>dbrun("INSERT INTO ai_call_flights(flight_key,purpose,lead_id,conversation_id,inbox_message_id,status,owner_token,fence,attempt,lease_until,expires_at,provider,requested_model,created_at,updated_at,error_code) VALUES(?,?,?,?,?,'running','tok',1,1,?,?,NULL,NULL,?,?,NULL)",['inbox:'+id+':process','inbound_processing',null,null,id,lease,iso(now+86400000),iso(now-30*60000),iso(now-30*60000)]);
flight(stale,iso(now-20*60000));flight(live,iso(now+60000));
const tg0=W.tg.length,ai0=W.AI.requests.length;
await WD.runWatchdog(W.env);
const alert=q("SELECT * FROM agent_alerts WHERE scheduler='watchdog' AND code='inbound_unanswered' AND acknowledged_at IS NULL")[0];
const tasks=JSON.parse(alert?.affected_tasks_json||'[]');
ok('A running flight with an expired lease and no draft/case raises the critical alert',alert?.level==='critical'&&tasks.includes(stale),alert);
ok('A flight whose lease is still live is not reported',!tasks.includes(live),tasks);
ok('Detection only: no customer send and no model call',W.tg.length===tg0&&W.AI.requests.length===ai0);
// ReDoS: a long unbroken letter run returns quickly and fails closed in both validators.
for(const n of [40,400,4000]){const t='نمی‌دونم '+'ب'.repeat(n)+' میشه';const t0=Date.now();const p=BR.salesAiProseIssues(t,{allowedNumbers:[]});const d=IX.validateSalesBrainDraft(t,{allowedNumbers:[],authoritativeFacts:[],markets:['IRAN']});const ms=Date.now()-t0;
 ok('Long letter run ('+n+') fails closed quickly',ms<2000&&p.includes('malformed_long_token')&&d.valid===false&&d.reason==='malformed_long_token',{ms,p,d});}
{const words=Array.from({length:150},(_,i)=>'کلمه'+String.fromCharCode(1576+i%20)+'ی').join(' ');const t0=Date.now();BR.salesAiProseIssues('نمی‌دونم '+words+' میشه یا نه',{allowedNumbers:[]});ok('150-word reply validates in linear time',Date.now()-t0<3000,Date.now()-t0);}
for(const t of ['سعر العلبة سبعة.','قیمت هر جعبه هشت.','انگشتر بزرگ جعبه‌ای ۸ درمیاد.','الحبة باثنين وعشرين.'])ok('Spoken/unit price is a price claim: '+t,BR.salesAiProseIssues(t,{allowedNumbers:[]}).includes('price_claim'));
// cv49: water/damage resistance in either polarity is a claim; an honest «whether» gap and care advice are not.
for(const t of ['ما تتأثر بالماي.','وإي تتحمل الماي عادي.','العلبة تقاوم الرطوبة.','در برابر آب مقاومه.','با آب خراب نمیشه.','جعبه انگشتر کوچک تر نمیشه.'])ok('Water/damage resistance is a claim: '+t,BR.salesAiProseIssues(t,{allowedNumbers:[]}).includes('water_resistance_claim'));
for(const t of ['ما عندي معلومة مؤكدة إذا تتحمل الماي.','خلي العلبة بمكان جاف.','روکش را خشک نگه دارید.','الزبون يتحمل أجور الشحن.'])ok('Not a water claim: '+t,!BR.salesAiProseIssues(t,{allowedNumbers:[]}).includes('water_resistance_claim'));
ok('Owner-decides price wording is not a price claim',!BR.salesAiProseIssues('قیمت هر جعبه رو مدیر تعیین می‌کنه.',{allowedNumbers:[]}).includes('price_claim'));
done();
process.exit(0);
