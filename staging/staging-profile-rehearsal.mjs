// Phase 16.9 local rehearsal: the real worker with the STAGING env profile (wrangler.staging.toml vars, no R2, no AI binding,
// no provider keys) on the harness mock world. Nothing leaves this machine.
import fs from "node:fs";import path from "node:path";import {pathToFileURL} from "node:url";
const REPO=process.argv[2];const {makeWorld}=await import(pathToFileURL(path.join(REPO,"tests/harness/harness.mjs")).href);
const W=await makeWorld({aiBrain:"off",extraEnv:{SALES_AI_PROVIDER:"anthropic",ANTHROPIC_MODEL:"claude-opus-5-5",SALES_AI_TIMEOUT_MS:"15000",
  SALES_AI_MAX_OUTPUT_TOKENS:"800",AUTONOMY_ORCHESTRATOR:"on",AUTO_AI_MEDIA_ENABLED:"false",SALES_AI_UNDERSTANDING:"off",
  PUBLIC_WORKER_BASE_URL:"https://hamzehi-social-ai-staging.miladmorab829.workers.dev"}});
delete W.env.GALLERY_BUCKET;delete W.env.AI;
for(const k of ["ANTHROPIC_API_KEY","OPENAI_API_KEY","KLING_API_KEY","SHOTSTACK_API_KEY","GOOGLE_PLACES_API_KEY","TELEGRAM_VAULT_CHAT_ID"])if(k in W.env)throw Error("staging profile leak: "+k);
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
W.d1.db.exec(fs.readFileSync(path.join(REPO,"staging/seed-staging-controls.sql"),"utf8"));
let pass=0,fail=0;const ok=(n,c,d)=>{c?pass++:fail++;console.log((c?"PASS ":"FAIL ")+n+(c?"":"  "+JSON.stringify(d)));};
const MONEY=/[0-9٠-٩۰-۹]{3,}|USD|\$|تومان|دولار/;const textOf=x=>{try{const b=JSON.parse(x.body);return String(b.text||b.caption||"");}catch{return "";}};
const sends=()=>W.tg.filter(x=>/^send/.test(x.method));
const h=await W.call("/api/health",null,"GET");ok("S1 GET /api/health 200 ok",h.status===200&&h.body?.ok===true,h);
ok("S1b health shows no vault channel configured",h.body?.telegram_media_vault===false,h.body);
const bad=await W.run(new Request("https://w.test/webhooks/telegram",{method:"POST",headers:{"Content-Type":"application/json","X-Telegram-Bot-Api-Secret-Token":"WRONG"},body:JSON.stringify({update_id:1,message:{message_id:1,date:1,from:{id:9,is_bot:false,first_name:"x"},chat:{id:9,type:"private"},text:"hi"}})}));
ok("S2 webhook with wrong secret rejected, nothing processed",bad.status>=400&&W.q("SELECT COUNT(*) n FROM inbox_messages")[0].n===0,bad.status);
const unauth=await W.run(new Request("https://w.test/api/autonomy/agents/overview"));ok("S3 admin API without token is rejected",unauth.status===401||unauth.status===403,unauth.status);
const fa={id:880001,name:"fa",username:"fa_test"},iq={id:880002,name:"iq",username:"iq_test"};
const s0=sends().length;const r1=await W.send(fa,"سلام، قیمت جعبه انگشتری ۳ تکه برای ۱۰۰ عدد چنده؟");
const out1=sends().slice(s0);ok("S4 Persian price inquiry: no unapproved amount sent",out1.every(x=>!MONEY.test(textOf(x))),out1.map(textOf));
ok("S4b replies go only to the sender's own chat",out1.every(x=>{try{return Number(JSON.parse(x.body).chat_id)===fa.id;}catch{return false;}}),out1.length);
const r2=await W.send(iq,"شلونكم، أريد التوصيل لكربلاء، شكد السعر؟");const lead2=W.q("SELECT l.notes FROM leads l JOIN inbox_messages i ON i.lead_id=l.id WHERE i.provider_sender_id=? LIMIT 1",[String(iq.id)])[0];
ok("S5 Iraqi Arabic inquiry: no unapproved amount sent",sends().slice(s0).every(x=>!MONEY.test(textOf(x))),[r2.action]);
ok("S5b Iraqi inquiry recorded on its own lead (no cross-customer mix)",W.q("SELECT COUNT(DISTINCT lead_id) n FROM inbox_messages")[0].n===2,W.q("SELECT provider_sender_id,lead_id FROM inbox_messages"));
const dup={update_id:777777,message:{message_id:4242,date:Math.floor(Date.now()/1000),from:{id:fa.id,is_bot:false,first_name:"fa",username:"fa_test"},chat:{id:fa.id,type:"private"},text:"دوباره"}};
const n0=W.q("SELECT COUNT(*) n FROM inbox_messages")[0].n;await W.post(dup);await W.post(dup);ok("S6 duplicate Telegram update stored once",W.q("SELECT COUNT(*) n FROM inbox_messages")[0].n===n0+1,n0);
ok("S7 no AI provider request at all (deterministic brain)",W.AI.requests.length===0,W.AI.requests.length);
// scheduled */15 with master gate off
const mod=await import(pathToFileURL(path.join(REPO,"worker/src/index.js")).href+"?s="+Math.random());const pend=[],tg0=W.tg.length;
await mod.default.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},W.env,{waitUntil:p=>pend.push(p)});await Promise.allSettled(pend);
ok("S8 cron tick with master off sends no Telegram message",W.tg.length===tg0,W.tg.slice(tg0).map(x=>x.method));
const fails=W.q("SELECT id FROM system_events WHERE type='scheduled_step_failed'");ok("S8b cron tick: no scheduled step failed",fails.length===0,fails);
ok("S8c cron tick: no autopilot/ads/autonomy task ran (gate closed)",W.q("SELECT COUNT(*) n FROM autonomy_tasks")[0].n===0);
ok("S9 no network call outside the Telegram/AI mocks",W.offNet().length===0,W.offNet());
ok("S10 no order, payment or approval rows created",W.q("SELECT (SELECT COUNT(*) FROM lead_orders)+(SELECT COUNT(*) FROM lead_order_payments) n")[0].n===0);
console.log(`staging-profile rehearsal: ${pass} pass, ${fail} fail`);process.exit(fail?1:0);
