// Phase 16.10 local rehearsal of the EXACT first staging deploy: the real worker with the staging vars and NO secrets at all
// (no ADMIN_TOKEN, no TELEGRAM_BOT_TOKEN, no webhook secret, no provider keys), no R2, no AI binding, schema + stage2b + seed.
// Proves: no outbound call of any kind, every admin route refused, Telegram webhook refused, cron tick inert.
// Usage: node staging/staging-nosecrets-rehearsal.mjs <repo root>
import fs from "node:fs";import path from "node:path";import {pathToFileURL} from "node:url";
const REPO=process.argv[2];const {makeWorld}=await import(pathToFileURL(path.join(REPO,"tests/harness/harness.mjs")).href);
const W=await makeWorld({aiBrain:"off",extraEnv:{HAMZEHI_ENVIRONMENT:"staging",SALES_AI_PROVIDER:"anthropic",ANTHROPIC_MODEL:"claude-opus-5-5",
  SALES_AI_TIMEOUT_MS:"15000",SALES_AI_MAX_OUTPUT_TOKENS:"800",AUTONOMY_ORCHESTRATOR:"on",AUTO_AI_MEDIA_ENABLED:"false",SALES_AI_UNDERSTANDING:"off",
  RATE_LIMIT_PER_MINUTE:"30",PUBLIC_WORKER_BASE_URL:"https://hamzehi-social-ai-staging.miladmorab829.workers.dev"}});
for(const k of ["ADMIN_TOKEN","TELEGRAM_BOT_TOKEN","TELEGRAM_WEBHOOK_SECRET_TOKEN","GALLERY_BUCKET","AI"])delete W.env[k];
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
W.d1.db.exec(fs.readFileSync(path.join(REPO,"staging/seed-staging-controls.sql"),"utf8"));
let pass=0,fail=0;const ok=(n,c,d)=>{c?pass++:fail++;console.log((c?"PASS ":"FAIL ")+n+(c?"":"  "+JSON.stringify(d)));};
const req=(p,o={})=>W.run(new Request("https://hamzehi-social-ai-staging.miladmorab829.workers.dev"+p,o));
const h=await req("/api/health");ok("N1 /api/health 200",h.status===200,h.status);
for(const [p,m] of [["/api/autonomy/agents/overview","GET"],["/api/orders","GET"],["/api/quotes","GET"],["/api/telegram/webhook/setup","POST"],["/api/telegram/inbound-health","GET"]]){
  const r=await req(p,{method:m,headers:{Authorization:"Bearer anything"}});ok(`N2 ${m} ${p} refused without ADMIN_TOKEN (${r.status})`,r.status===401||r.status===403,r.status);}
const upd={update_id:1,message:{message_id:1,date:Math.floor(Date.now()/1000),from:{id:5,is_bot:false,first_name:"x"},chat:{id:5,type:"private"},text:"قیمت؟"}};
for(const s of ["","guess","sec"]){const r=await req("/webhooks/telegram",{method:"POST",headers:{"Content-Type":"application/json",...(s?{"X-Telegram-Bot-Api-Secret-Token":s}:{})},body:JSON.stringify(upd)});
  ok(`N3 webhook refused with secret "${s||"(none)"}" (${r.status})`,r.status>=400,r.status);}
ok("N3b no inbox row stored",W.q("SELECT COUNT(*) n FROM inbox_messages")[0].n===0);
const mod=await import(pathToFileURL(path.join(REPO,"worker/src/index.js")).href+"?n="+Math.random());
for(const cron of ["*/15 * * * *","0 7 * * *"]){const pend=[];await mod.default.scheduled({cron,scheduledTime:Date.now()},W.env,{waitUntil:p=>pend.push(p)});await Promise.allSettled(pend);}
ok("N4 cron ticks (both schedules) ran no autonomy task",W.q("SELECT COUNT(*) n FROM autonomy_tasks")[0].n===0);
ok("N5 ZERO outbound network calls of any kind (Telegram, AI, other)",W.net.length===0,W.net);
ok("N6 zero AI provider requests",W.AI.requests.length===0);
ok("N7 no lead, order, payment, outreach row created",W.q("SELECT (SELECT COUNT(*) FROM leads)+(SELECT COUNT(*) FROM lead_orders)+(SELECT COUNT(*) FROM lead_order_payments)+(SELECT COUNT(*) FROM lead_outreach) n")[0].n===0);
console.log(`staging no-secrets rehearsal: ${pass} pass, ${fail} fail`);process.exit(fail?1:0);
