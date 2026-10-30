// PHASE 16.16-N — orchestrator configuration and autonomy preservation.
// (1) worker/wrangler.toml now carries AUTONOMY_ORCHESTRATOR="on", so every build path (not only uploads made with --var) has it;
// (2) scripts/release/preflight.mjs refuses a version that lacks it, lacks a tag or differs in D1/R2/AI/vars/secret names;
// (3) the Watchdog raises a WARNING (detection only) when the running version lacks the flag — before this phase it said nothing;
// (4) the tables a Time Travel restore can remove (system_kv, telegram_media_sources) are recreated on first use without errors.
// Local only: in-memory D1, Telegram / AI / OpenAI are in-process mocks; nothing leaves the machine and nothing is deployed.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase16_16n");
const started=Date.now();
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const PF=await import(pathToFileURL(path.join(REPO,"scripts/release/preflight.mjs")).href);
const WD=await import(pathToFileURL(path.join(SRC,"agent-watchdog.js")).href);
const OPS_SQL=fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8");

// ---- (1) version-controlled configuration
const exp=PF.expectedFromToml(fs.readFileSync(path.join(REPO,"worker/wrangler.toml"),"utf8"));
ok("N1 worker/wrangler.toml declares AUTONOMY_ORCHESTRATOR = \"on\"",exp.vars.AUTONOMY_ORCHESTRATOR==="on",exp.vars);
ok("N2 Production bindings unchanged: DB=40b272c5…, GALLERY_BUCKET=hamzehi-gallery, AI",exp.d1.length===1&&exp.d1[0].binding==="DB"&&exp.d1[0].database_id==="40b272c5-e368-4c33-8a41-7c63db98d7e8"
  &&exp.r2.length===1&&exp.r2[0].bucket_name==="hamzehi-gallery"&&exp.ai?.binding==="AI",exp);
ok("N3 the 9 previously declared vars keep their values (12 vars total since the Google Places vars)",Object.keys(exp.vars).length===12&&exp.vars.ADS_PLACES_DISCOVERY==="on"&&exp.vars.ADS_PLACES_MONTHLY_BUDGET_USD==="10"&&exp.vars.SALES_AI_BRAIN==="on"&&exp.vars.SALES_AI_PROVIDER==="anthropic"&&exp.vars.RATE_LIMIT_PER_MINUTE==="60",exp.vars);
const stg=PF.expectedFromToml(fs.readFileSync(path.join(REPO,"staging/wrangler.staging.toml"),"utf8"));
ok("N4 the staging config stays separate (own D1 only, flag on)",stg.d1.length===1&&stg.d1[0].database_id==="cddc10c5-2232-4334-8d99-fedb52fbd12d"&&stg.vars.AUTONOMY_ORCHESTRATOR==="on",stg);

// ---- (2) preflight on version metadata shaped like `wrangler versions view --json` (names and types only, no secret values)
const V=(over={})=>{const vars={...exp.vars,...(over.vars||{})};for(const k of over.dropVars||[])delete vars[k];
  const b=[{name:"AI",type:"ai"},{name:"DB",type:"d1",id:over.d1||"40b272c5-e368-4c33-8a41-7c63db98d7e8"},{name:"GALLERY_BUCKET",type:"r2_bucket",bucket_name:over.r2||"hamzehi-gallery"},
    ...Object.entries(vars).map(([name,text])=>({name,type:"plain_text",text})),...PF.REQUIRED_SECRETS.filter(s=>s!==over.dropSecret).map(name=>({name,type:"secret_text"})),...(over.extra||[])];
  return {id:"00000000-0000-4000-8000-000000000000",annotations:over.untagged?{}:{"workers/tag":over.tag||"d7962d5-orch-on"},resources:{bindings:b}};};
const good=PF.checkVersion(V(),exp);
ok("N5 a tagged version with the full Production configuration (22 bindings) passes",good.ok&&good.summary.bindings===22,good);
const auto=PF.checkVersion(V({untagged:true,dropVars:["AUTONOMY_ORCHESTRATOR"]}),exp);
ok("N6 an automatic-build-shaped version (untagged, no AUTONOMY_ORCHESTRATOR, 19 bindings) is refused",!auto.ok&&auto.failures.some(f=>/AUTONOMY_ORCHESTRATOR/.test(f))&&auto.failures.some(f=>/no tag/.test(f)),auto.failures);
ok("N7 flag present but \"off\" is refused",!PF.checkVersion(V({vars:{AUTONOMY_ORCHESTRATOR:"off"}}),exp).ok);
ok("N8 a different D1 database is refused",PF.checkVersion(V({d1:"cddc10c5-2232-4334-8d99-fedb52fbd12d"}),exp).failures.some(f=>/^D1 DB/.test(f)));
ok("N9 a different R2 bucket is refused",PF.checkVersion(V({r2:"other-bucket"}),exp).failures.some(f=>/^R2/.test(f)));
ok("N10 a missing secret binding name is refused",PF.checkVersion(V({dropSecret:"TELEGRAM_BOT_TOKEN"}),exp).failures.some(f=>/TELEGRAM_BOT_TOKEN/.test(f)));
ok("N11 an unexpected extra binding is refused",PF.checkVersion(V({extra:[{name:"HAMZEHI_ENVIRONMENT",type:"plain_text",text:"staging"}]}),exp).failures.some(f=>/unexpected binding HAMZEHI_ENVIRONMENT/.test(f)));
ok("N12 a changed var value is refused",PF.checkVersion(V({vars:{SALES_AI_PROVIDER:"openai"}}),exp).failures.some(f=>/SALES_AI_PROVIDER/.test(f)));
ok("N13 a tag without the -orch-on suffix is refused",PF.checkVersion(V({tag:"d7962d5"}),exp).failures.some(f=>/tag/.test(f)));

// ---- (3) Watchdog detection (warning only) and autonomy left untouched
{const W=await makeWorld({aiBrain:"off"});W.d1.db.exec(OPS_SQL);
 const AE0=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+"?n16w="+Math.random());await AE0.autonomyMasterGate(W.env);
 const snap=()=>JSON.stringify([W.q("SELECT key,value FROM autonomy_controls ORDER BY key"),W.q("SELECT id,status FROM autonomy_tasks ORDER BY id")]);
 const before=snap();delete W.env.AUTONOMY_ORCHESTRATOR;
 const r1=await WD.runWatchdog(W.env);
 const a1=W.q("SELECT code,level,agent FROM agent_alerts WHERE code='orchestrator_flag_off'");
 ok("N14 [16.16-N FIX] flag missing → Watchdog raises orchestrator_flag_off (warning, agent orchestrator)",r1.ok&&r1.alerts.includes("orchestrator_flag_off")&&a1.length===1&&a1[0].level==="warning"&&a1[0].agent==="orchestrator",{r1,a1});
 ok("N15 the warning keeps the Watchdog healthy (no critical, nothing paused)",r1.healthy===true&&W.q("SELECT healthy FROM agent_heartbeat WHERE scheduler='watchdog'")[0]?.healthy===1);
 ok("N16 detection only: autonomy controls and tasks are not changed",snap()===before);
 const r2=await WD.runWatchdog({...W.env,AUTONOMY_ORCHESTRATOR:"on"},{nowMs:Date.now()+60000});
 const st=W.q("SELECT recovery_state FROM agent_alerts WHERE code='orchestrator_flag_off'")[0]?.recovery_state;
 ok("N17 flag restored → no new orchestrator_flag_off and the open alert is marked recovered",!r2.alerts.includes("orchestrator_flag_off")&&/recover/i.test(String(st)),{alerts:r2.alerts,st});
 const W2=await makeWorld({aiBrain:"off",extraEnv:{AUTONOMY_ORCHESTRATOR:"on"}});W2.d1.db.exec(OPS_SQL);await AE0.autonomyMasterGate(W2.env);const r3=await WD.runWatchdog(W2.env);
 ok("N18 flag on from the start → no orchestrator_flag_off alert",r3.ok&&!r3.alerts.includes("orchestrator_flag_off"),r3.alerts);}

// ---- (4) lazy tables after a restore-shaped state (neither table exists in database/schema.sql)
{const W=await makeWorld({aiBrain:"off",extraEnv:{AUTONOMY_ORCHESTRATOR:"on"}});W.d1.db.exec(OPS_SQL);
 const has=t=>W.q("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name=?",[t])[0].n===1;
 ok("N19 starting state: system_kv and telegram_media_sources absent (as after the 16.16-K restore)",!has("system_kv")&&!has("telegram_media_sources"));
 const AE=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+"?n16n="+Math.random());await AE.autonomyMasterGate(W.env);
 const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;const rejected=[];
 for(const cron of ["*/15 * * * *","0 7 * * *"]){const p=[];await WK.scheduled({cron,scheduledTime:Date.now()},W.env,{waitUntil:x=>p.push(x)});for(const s of await Promise.allSettled(p))if(s.status==="rejected")rejected.push(String(s.reason));}
 const h=await W.call("/api/telegram/inbound-health",null,"GET");
 const u=await W.post({update_id:9001,message:{message_id:1,date:1,chat:{id:5005,type:"private"},from:{id:5005,is_bot:false,first_name:"t"},text:"سلام"}});
 ok("N20 both cron ticks, inbound health and a webhook update complete without a rejected promise",!rejected.length&&h.status===200&&u.status===200,{rejected,h:h.status,u:u.status});
 ok("N21 no scheduled step failed and no 'no such table' error was recorded",W.q("SELECT COUNT(*) n FROM system_events WHERE type='scheduled_step_failed' OR details_json LIKE '%no such table%'")[0].n===0);
 ok("N22 both tables are recreated on first use",has("system_kv")&&has("telegram_media_sources"));
 ok("N23 no request left the machine except the in-process mocks",!W.offNet().length,W.offNet());}

console.log(`phase16_16n time ${((Date.now()-started)/1000).toFixed(1)} s`);
process.exit(done()?1:0);
