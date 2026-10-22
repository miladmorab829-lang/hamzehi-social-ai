// PHASE 09.4 — DUAL-MARKET ADS: independent IRAN (Persian, TOMAN) and ARAB = Iraq (Iraqi Arabic, USD) markets — separate config, owner-
// approved enabling, validated city lists, per-market daily limits, CRM attribution, UNKNOWN for historical leads, per-market follow-ups
// and reporting, disabled-by-default with no scheduled task and no dead letter. Local only: search engines, sites and OpenAI are
// in-process mocks; the worker's own URL is routed back into the test worker. Every phone below is a fake test value.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,J,done}=reporter("phase09");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const W=await makeWorld({extraEnv:{OPENAI_API_KEY:"test-openai-not-real",PUBLIC_WORKER_BASE_URL:"https://w.test"}});const {q,dbrun,call}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
W.env.AUTONOMY_ORCHESTRATOR="on";
const AE=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+"?p09="+Math.random());await AE.autonomyMasterGate(W.env);
const AM=await import(pathToFileURL(path.join(SRC,"ads-markets.js")).href);
const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;
// external mocks: one Tehran jeweller (.ir) and one Baghdad jeweller (.iq, +964); OpenAI prompts are recorded to check the language
let searches=[],prompts=[];const inner=globalThis.fetch;
const IR_SITE='<html><title>گالری طلای نمونه تهران</title><body>طلافروشی و جواهر در تهران، ایران. تلفن 02100000000. <a href="/contact">تماس با ما contact us</a></body></html>';
const IQ_SITE='<html><title>مجوهرات النموذج - صائغ في بغداد</title><body>محل ذهب ومجوهرات في بغداد، العراق. هاتف +9647700000001. <a href="/contact">تواصل contact us</a></body></html>';
globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);
  if(s.startsWith("https://w.test/"))return W.run(new Request(s,o));
  if(/^https:\/\/www\.(google|bing)\.com\/search/.test(s)){const qq=decodeURIComponent(new URL(s).searchParams.get("q")||"");searches.push(qq);const iraq=/العراق|بغداد/.test(qq);
    return new Response(`<html><a href="${iraq?"https://gold-baghdad.iq/":"https://gold-tehran.ir/"}">x</a></html>`,{status:200,headers:{"Content-Type":"text/html"}});}
  if(s.startsWith("https://gold-tehran.ir"))return new Response(IR_SITE,{status:200,headers:{"Content-Type":"text/html"}});
  if(s.startsWith("https://gold-baghdad.iq"))return new Response(IQ_SITE,{status:200,headers:{"Content-Type":"text/html"}});
  if(s==="https://api.openai.com/v1/responses"){const inp=JSON.parse(o.body||"{}").input;if(typeof inp==="string"&&/B2B/.test(inp))prompts.push(inp);   // Ads drafts only (the content autopilot also calls OpenAI on a cron tick)
    return new Response(JSON.stringify({output_text:"پیش‌نویس آزمایشی",output:[{type:"message",content:[{type:"output_text",text:"پیش‌نویس آزمایشی"}]}]}),{status:200,headers:{"Content-Type":"application/json"}});}
  return inner(u,o);};
const reservations=(m)=>q("SELECT COUNT(*) n FROM system_events WHERE type='ads_autopilot_reserved'"+(m?" AND instr(details_json,?)>0":""),m?[`"market":"${m}"`]:[])[0].n;
const resetRuns=()=>dbrun("DELETE FROM system_events WHERE type IN ('ads_autopilot_reserved','ads_run_deferred','crm_followup_reserved','crm_followup_deferred')");
const crm=()=>q("SELECT COUNT(*) n FROM system_events WHERE type='crm_followup_reserved'")[0].n;   // Phase 09.7: CRM_FOLLOWUP quota rows
const tick=async(cron="*/15 * * * *")=>{const p=[];await WK.scheduled({cron},W.env,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);};
const kv=k=>q("SELECT value FROM system_kv WHERE key=?",[k])[0]?.value??null;
const notes=id=>JSON.parse(q("SELECT notes FROM leads WHERE id=?",[id])[0]?.notes||"{}");
const t0="2026-09-26T09:00:00.000Z";
const addLead=(id,stage,n,name=id)=>dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",[id,name,n.website||"",stage,"normal",JSON.stringify(n),t0,t0]);

await call("/api/ads/autopilot/status",null,"GET");   // creates system_kv like the dashboard does
// reached leads shaped like Production: legacy Ads leads WITHOUT any market (Iraqi and Persian search group), a Telegram inbound lead
// without a country, an Iran lead and an Iraq lead. They become due for a follow-up only in Block F (Phase 09.6).
const due="2026-01-01T00:00:00.000Z";
addLead("H-OLD","contacted",{source:"ad_autopilot",type:"gold_ar",ad_target:true,negotiation_draft:"x"});
addLead("H-OLDFA","negotiation",{source:"ad_autopilot",type:"gold_fa",ad_target:true,negotiation_draft:"x"});
addLead("H-TG","replied",{source:"telegram_inbound"});
addLead("H-IR","contacted",{source:"customer_discovery",country:"ایران"});
addLead("H-IQ","contacted",{source:"customer_discovery",country:"العراق"});
const oldNotes=q("SELECT notes FROM leads WHERE id='H-OLD'")[0].notes;
// the Production legacy row (enabled, empty city) plus a legacy row WITH a city: neither may start anything any more
dbrun("INSERT OR REPLACE INTO system_kv(key,value,updated_at) VALUES('ads_autopilot_config',?,?)",[JSON.stringify({enabled:true,type:"gold",city:"تهران",extra:""}),t0]);
const legacyBefore=kv("ads_autopilot_config");
const other10=async()=>{const a=(await call("/api/autonomy/agents/activity",null,"GET")).body?.agents||[];return J(a.filter(x=>x.agent!=="ads").map(x=>[x.agent,x.status,x.technical,x.connection,x.reason_codes]));};

// ================= BLOCK 1 — defaults, legacy, validation, owner approval =================
{const m=(await call("/api/ads/markets",null,"GET")).body||{};const I=m.markets?.IRAN||{},A=m.markets?.ARAB||{};
 ok("D1 both markets default to DISABLED with no city and no limit (nothing invented); no market row is written by reading",I.enabled===false&&A.enabled===false&&I.city===""&&A.city===""&&I.runs_per_day===null&&A.runs_per_day===null&&I.codes.includes("ADS_MARKET_DISABLED")&&A.codes.includes("ADS_CITY_EMPTY")&&kv("ads_market:IRAN")===null&&kv("ads_market:ARAB")===null,[I.codes,A.codes]);
 ok("D2 market language and currency follow the CRM policy: IRAN → Persian/TOMAN, ARAB (Iraq) → Iraqi Arabic/USD; city lists are the fixed per-market lists",I.language==="Persian"&&I.currency==="TOMAN"&&A.language==="Iraqi Arabic"&&A.currency==="USD"&&I.city_options.includes("تهران")&&!I.city_options.includes("بغداد")&&A.city_options.includes("بغداد")&&!A.city_options.includes("تهران"),[I.currency,A.currency]);
 const s0=searches.length;await tick();
 ok("D3 the legacy single-market row (even enabled WITH a city) starts nothing: no search, no reservation, and the row is left byte-for-byte unchanged",searches.length===s0&&reservations()===0&&kv("ads_autopilot_config")===legacyBefore,[searches.length-s0,reservations()]);
 const st=await call("/api/ads/autopilot/start",{type:"gold",city:"تهران"});
 ok("D4 the retired legacy start returns 409 and writes or runs nothing",st.status===409&&st.body.reason==="use_market_controls"&&kv("ads_autopilot_config")===legacyBefore&&kv("ads_market:IRAN")===null&&searches.length===s0,[st.status,st.body?.reason]);
 const noAp=await call("/api/ads/markets/config",{market:"IRAN",enabled:true,city:"تهران",runs_per_day:3});
 ok("V1 enabling without owner_approved is refused (403) and stores nothing",noAp.status===403&&noAp.body.reason==="owner_approval_required"&&kv("ads_market:IRAN")===null,[noAp.status,noAp.body?.reason]);
 const bad=[await call("/api/ads/markets/config",{market:"IRAN",enabled:true,city:"بغداد",runs_per_day:3,owner_approved:true}),
  await call("/api/ads/markets/config",{market:"ARAB",enabled:true,city:"Paris",runs_per_day:3,owner_approved:true}),
  await call("/api/ads/markets/config",{market:"IRAN",enabled:true,city:"تهران",runs_per_day:0,owner_approved:true}),
  await call("/api/ads/markets/config",{market:"IRAN",enabled:true,city:"تهران",runs_per_day:999,owner_approved:true}),
  await call("/api/ads/markets/config",{market:"IRAN",enabled:true,city:"تهران",runs_per_day:2.5,owner_approved:true}),
  await call("/api/ads/markets/config",{market:"IRAN",enabled:true,city:"تهران",owner_approved:true}),
  await call("/api/ads/markets/config",{market:"TURKEY",enabled:true,city:"تهران",runs_per_day:3,owner_approved:true}),
  await call("/api/ads/markets/config",{market:"IRAN",enabled:"yes",city:"تهران",runs_per_day:3,owner_approved:true})];
 ok("V2 invalid input is refused with 400 and stores nothing: other market's city, unknown city, limit 0 / above the global cap / non-integer, no limit, unknown market, non-boolean enabled",bad.every(r=>r.status===400)&&J(bad.map(r=>r.body.reason))===J(["ads_city_not_in_market","ads_city_not_in_market","ads_limit_invalid","ads_limit_invalid","ads_limit_invalid","ads_market_not_ready","ads_market_invalid","ads_enabled_invalid"])&&kv("ads_market:IRAN")===null&&kv("ads_market:ARAB")===null,bad.map(r=>[r.status,r.body?.reason]));
 const unauth=[await W.run(new Request("https://w.test/api/ads/markets")),await W.run(new Request("https://w.test/api/ads/markets/config",{method:"POST",body:JSON.stringify({market:"IRAN",enabled:true,city:"تهران",runs_per_day:3,owner_approved:true})}))];
 ok("V3 market status and market config need the owner token (401)",unauth.every(r=>r.status===401)&&kv("ads_market:IRAN")===null,unauth.map(r=>r.status));
 const mm=await call("/api/ads/autopilot",{type:"gold",city:"بغداد",market:"IRAN"});
 ok("V4 a city of one market sent with the other market id is refused (400 ads_city_market_mismatch), nothing reserved",mm.status===400&&mm.body.reason==="ads_city_market_mismatch"&&reservations()===0,[mm.status,mm.body?.reason]);}

// ================= BLOCK 2 — disabled markets: no execution, no task, no dead letter =================
{const s0=searches.length,o0=prompts.length;
 const runs=[await call("/api/ads/autopilot",{type:"gold",city:"بغداد"}),await call("/api/ads/discover",{type:"gold",city:"تهران"}),await call("/api/ads/auto-run",{type:"gold",city:"بغداد"}),await call("/api/ads/autopilot",{})];
 ok("X1 with both markets disabled every Ads DISCOVERY route returns 200 skipped (ads_market_disabled): no reservation, search or OpenAI call",runs.every(r=>r.status===200&&r.body.ok===true&&r.body.skipped===true&&r.body.reason==="ads_market_disabled")&&reservations()===0&&searches.length===s0&&prompts.length===o0,runs.map(r=>[r.status,r.body?.reason]));
 dbrun("DELETE FROM autonomy_tasks");dbrun("DELETE FROM autonomy_commands");
 await AE.runAutonomyScheduled(W.env,new Request("https://w.test/x"));
 ok("X3 the scheduled autonomy planner plans no Ads execution task (only the read-only status ping every agent gets)",q("SELECT COUNT(*) n FROM autonomy_tasks WHERE module='ads' AND action<>'status'")[0].n===0,q("SELECT module,action FROM autonomy_tasks"));
 dbrun("DELETE FROM autonomy_tasks");dbrun("DELETE FROM autonomy_commands");
 dbrun("INSERT INTO autonomy_commands(id,raw_command,plan_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",["c9","تبلیغ",JSON.stringify({mode:"execute",tasks:[{module:"ads",action:"discover_opportunities"}]}),"queued",t0,t0]);
 dbrun("INSERT INTO autonomy_tasks(id,command_id,module,action,status,priority,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",["ad9","c9","ads","discover_opportunities","queued",500,"{}",t0,t0]);
 await AE.runTasksOrchestrated(W.env,new Request("https://w.test/x"),20);const t=q("SELECT * FROM autonomy_tasks WHERE id='ad9'")[0];
 ok("X4 an owner-command Ads task with no market enabled completes as skipped: no dead letter, no approval, no search",t.status==="completed"&&/"skipped":true/.test(t.result_json||"")&&!q("SELECT 1 FROM agent_dead_letters WHERE task_id='ad9'").length&&q("SELECT COUNT(*) n FROM agent_approvals")[0].n===0&&searches.length===s0,[t.status,(t.result_json||"").slice(0,100)]);
 const ac=(await call("/api/autonomy/agents/activity",null,"GET")).body?.agents?.find(a=>a.agent==="ads")||{};
 ok("X5 Control Center: Ads shows both markets off, NOT blocked by ADS_CITY_EMPTY (a disabled market is not a fault); the legacy row is shown as inactive",ac.detail?.autopilot==="off"&&!ac.reason_codes?.includes("ADS_CITY_EMPTY")&&ac.detail?.markets?.IRAN?.enabled===false&&ac.detail?.markets?.ARAB?.enabled===false&&ac.detail?.legacy_config?.active===false,[ac.status,ac.reason_codes,ac.detail?.autopilot]);}

// ================= BLOCK F — CRM follow-up continuity with BOTH Ads markets disabled (Phase 09.6) =================
const FL=["H-OLD","H-OLDFA","H-TG","H-IR","H-IQ"];
const arm=ids=>{for(const id of ids){const n=notes(id);for(const k of ["followup_draft","followup_prepared_at","followup_status","followup_at"])delete n[k];n.next_followup_at=due;dbrun("UPDATE leads SET notes=? WHERE id=?",[JSON.stringify(n),id]);}};
const promptsFor=id=>prompts.filter(p=>p.includes("Target: "+id+"."));
const langOf=id=>{const p=promptsFor(id).at(-1)||"";return /Iraqi Arabic/.test(p)?"Iraqi Arabic":/Persian/.test(p)?"Persian":null;};
const marketKeys=id=>["market","country","target_market"].filter(k=>k in notes(id));
const tbl=t=>q("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",[t]).length?q("SELECT COUNT(*) n FROM "+t)[0].n:"absent";
const crmSnap=()=>J(["lead_quotes","lead_orders","lead_order_payments","lead_outreach","approval_queue"].map(tbl));
const stages=()=>J(q("SELECT id,stage FROM leads WHERE id IN ('H-OLD','H-OLDFA','H-TG','H-IR','H-IQ') ORDER BY id"));
const fs0=stages(),crm0=crmSnap(),tg0=W.tg.filter(x=>/^send/.test(x.method)).length,mk0=J(FL.map(id=>[id,marketKeys(id)]));
{const mk=(await call("/api/ads/markets",null,"GET")).body?.markets||{};ok("F0 precondition: both Ads markets are disabled",mk.IRAN?.enabled===false&&mk.ARAB?.enabled===false,"");
 arm(FL);resetRuns();const s0=searches.length;await tick("0 7 * * *");
 ok("F1 07:00 sweep with both markets disabled drafts a follow-up for EVERY due reached lead: legacy Ads (no market), Telegram (no country), Iran and Iraq",FL.every(id=>!!notes(id).followup_draft&&promptsFor(id).length===1)&&searches.length===s0&&crm()===1&&reservations()===0,FL.map(id=>[id,!!notes(id).followup_draft]));
 ok("F2 language: recorded market → its language (H-IR Persian, H-IQ Iraqi Arabic); no market → the previous rule (gold_ar → Iraqi Arabic, gold_fa / no type → Persian)",langOf("H-IR")==="Persian"&&langOf("H-IQ")==="Iraqi Arabic"&&langOf("H-OLD")==="Iraqi Arabic"&&langOf("H-OLDFA")==="Persian"&&langOf("H-TG")==="Persian",FL.map(id=>[id,langOf(id)]));
 ok("F3 no market or country is written by a follow-up (legacy Ads and Telegram leads stay UNKNOWN); stages unchanged",J(FL.map(id=>[id,marketKeys(id)]))===mk0&&marketKeys("H-OLD").length===0&&marketKeys("H-TG").length===0&&stages()===fs0,FL.map(id=>[id,marketKeys(id)]));
 const p1=prompts.length,n1=J(FL.map(id=>notes(id).followup_draft));await tick("0 7 * * *");
 ok("F4 no duplicate: a second sweep finds nothing due (next_followup_at cleared) — no OpenAI call, drafts unchanged",prompts.length===p1&&J(FL.map(id=>notes(id).followup_draft))===n1,[prompts.length-p1]);
 arm(["H-TG","H-OLD"]);resetRuns();const m=await call("/api/ads/followups/run",{});
 ok("F5 the owner's manual follow-up button works with both markets disabled (one CRM_FOLLOWUP reservation, no Ads quota used)",m.status===200&&m.body.ok===true&&m.body.skipped!==true&&m.body.reason!=="ads_market_disabled"&&m.body.prepared===2&&promptsFor("H-TG").length===2&&promptsFor("H-OLD").length===2&&crm()===1&&reservations()===0,[m.status,m.body]);
 arm(["H-TG"]);resetRuns();const p2=prompts.length;const [x,y]=await Promise.all([call("/api/ads/followups/run",{}),call("/api/ads/followups/run",{})]);
 ok("F6 two simultaneous manual runs: exactly one runs (the other is deferred), the lead gets exactly one new draft",[x,y].filter(r=>r.body.deferred===true).length===1&&prompts.length===p2+1,[x.body?.deferred,y.body?.deferred,prompts.length-p2]);
 resetRuns();const s1=searches.length;await tick();
 ok("F7 an idle 15-minute tick (no due lead) reserves nothing and calls nothing",reservations()===0&&crm()===0&&prompts.length===p2+1&&searches.length===s1,[reservations()]);
 arm(["H-OLDFA"]);await tick();const r15=q("SELECT details_json FROM system_events WHERE type='crm_followup_reserved'").map(r=>JSON.parse(r.details_json).source);
 ok("F8 the 15-minute path drafts a due follow-up with both markets disabled, under one CRM_FOLLOWUP 'scheduled_followups' reservation, no Ads quota or search",!!notes("H-OLDFA").followup_draft&&J(r15)===J(["scheduled_followups"])&&reservations()===0&&searches.length===s1,r15);
 arm(["H-TG"]);const d0=q("SELECT COUNT(*) n FROM system_events WHERE type IN ('ads_run_deferred','crm_followup_deferred')")[0].n,p3=prompts.length;await tick();
 ok("F9 a second 15-minute tick inside 55 minutes waits (spacing): no draft, no extra reservation, no deferred-audit noise; the lead stays due",!notes("H-TG").followup_draft&&notes("H-TG").next_followup_at===due&&prompts.length===p3&&crm()===1&&q("SELECT COUNT(*) n FROM system_events WHERE type IN ('ads_run_deferred','crm_followup_deferred')")[0].n===d0,[prompts.length-p3,crm()]);
 resetRuns();await tick();
 ok("F10 once the spacing has passed the waiting lead is drafted by the next tick",!!notes("H-TG").followup_draft&&prompts.length===p3+1,"");
 ok("F11 follow-ups stay owner-gated: no Telegram send, no outreach/quote/order/payment/approval row created, CRM stages unchanged",W.tg.filter(x=>/^send/.test(x.method)).length===tg0&&crmSnap()===crm0&&stages()===fs0&&q("SELECT COUNT(*) n FROM agent_approvals")[0].n===0,[crmSnap(),crm0]);}

// ================= BLOCK 3 — IRAN enabled only: independent execution and attribution =================
{const en=await call("/api/ads/markets/config",{market:"IRAN",enabled:true,city:"Tehran",runs_per_day:3,type:"gold",owner_approved:true});
 const stored=JSON.parse(kv("ads_market:IRAN")||"{}");
 ok("E1 the owner enables IRAN (approval recorded, city canonicalised to تهران); ARAB stays disabled and unwritten; audit event written",en.status===200&&en.body.readiness?.ready===true&&stored.enabled===true&&stored.city==="تهران"&&stored.runs_per_day===3&&stored.approved_by==="owner"&&!!stored.approved_at&&kv("ads_market:ARAB")===null&&q("SELECT COUNT(*) n FROM system_events WHERE type='ads_market_enabled'")[0].n===1,[en.status,stored]);
 const s0=searches.length,o0=prompts.length;await tick();
 const ir=q("SELECT id,notes FROM leads WHERE json_extract(notes,'$.source')='ad_autopilot' AND contact LIKE '%gold-tehran%'")[0];const n=ir?JSON.parse(ir.notes):{};
 ok("E2 the cron runs IRAN only: Persian/Iran queries only, one IRAN reservation, zero ARAB reservations",searches.length>s0&&searches.slice(s0).every(x=>!/العراق|بغداد/.test(x))&&reservations("IRAN")===1&&reservations("ARAB")===0,searches.slice(s0));
 ok("E3 the Tehran lead is attributed to IRAN (target_market IRAN, country ایران from the .ir domain → TOMAN quotes); its draft prompt is Persian",!!ir&&n.target_market==="IRAN"&&n.country==="ایران"&&n.market_evidence==="local_domain"&&prompts.slice(o0).length>=1&&prompts.slice(o0).every(p=>/Persian/.test(p)&&!/Iraqi/.test(p)),[n.target_market,n.country,n.market_evidence]);
 arm(["H-IQ","H-OLD","H-TG"]);resetRuns();const fu=await call("/api/ads/followups/run",{});
 ok("E4 with only IRAN enabled, follow-ups still cover the ARAB lead and the market-UNKNOWN leads, each in its own language; no ARAB reservation",fu.body.prepared===3&&langOf("H-IQ")==="Iraqi Arabic"&&langOf("H-OLD")==="Iraqi Arabic"&&langOf("H-TG")==="Persian"&&reservations("ARAB")===0,[fu.body,langOf("H-IQ"),langOf("H-TG")]);
 const b=await call("/api/ads/autopilot",{type:"gold",city:"بغداد"});
 ok("E5 a Baghdad run is still skipped (ARAB disabled) even though IRAN is enabled; no ARAB reservation",b.status===200&&b.body.skipped===true&&b.body.market==="ARAB"&&reservations("ARAB")===0,[b.status,b.body?.reason]);
 const ch=await call("/api/ads/markets/config",{market:"IRAN",runs_per_day:2});
 ok("E6 changing an ENABLED market needs owner approval again (403) and leaves the stored config unchanged",ch.status===403&&JSON.parse(kv("ads_market:IRAN")).runs_per_day===3,[ch.status]);}

// ================= BLOCK 4 — ARAB enabled too: independence, limits, cross-market protection =================
{await call("/api/ads/markets/config",{market:"ARAB",enabled:true,city:"بغداد",runs_per_day:2,type:"gold",owner_approved:true});
 const s0=searches.length,o0=prompts.length;const a=await call("/api/ads/autopilot",{type:"gold",city:"بغداد"});
 const iq=q("SELECT id,notes FROM leads WHERE contact LIKE '%gold-baghdad%'")[0];const n=iq?JSON.parse(iq.notes):{};
 ok("I1 ARAB runs right after an IRAN run (spacing is per market): Iraqi queries only, the lead is ARAB/العراق (+964), the draft prompt is Iraqi Arabic",a.status===200&&!a.body.deferred&&!a.body.skipped&&searches.slice(s0).every(x=>/العراق|بغداد|Iraq/.test(x))&&n.target_market==="ARAB"&&n.country==="العراق"&&prompts.slice(o0).every(p=>/Iraqi Arabic/.test(p)),[a.body?.reason,n.target_market,n.country]);
 const a2=await call("/api/ads/autopilot",{type:"gold",city:"بغداد"});
 ok("I2 a second ARAB run inside 55 minutes is deferred for ARAB only",a2.body.deferred===true&&a2.body.market==="ARAB"&&reservations("ARAB")===1,[a2.body?.reason]);
 // per-market cap and the global cap, with a fixed clock (direct reservations)
 resetRuns();dbrun("INSERT OR REPLACE INTO autonomy_controls(key,value,updated_at) VALUES('budgets',?,?)",[JSON.stringify({ads_runs_per_day:3}),new Date().toISOString()]);
 const d=new Date();d.setUTCHours(10,0,0,0);const T=d.getTime(),r=(m,c,dt)=>AE.reserveAdsAutopilotRun(W.env,T+dt*60000,"t",{market:m,marketCap:c});
 const seq=[await r("IRAN",1,0),await r("ARAB",2,1),await r("IRAN",1,70),await r("ARAB",2,70),await r("ARAB",2,140)];
 ok("I3 limits: IRAN cap 1 refuses its 2nd run; ARAB runs 1 min after IRAN (no cross-market spacing), again after 55 min, and its own cap (2) refuses a 3rd",J(seq)===J([true,true,false,true,false]),seq);
 ok("I4 a market reservation without a valid market or limit is refused (fail closed)",!(await AE.reserveAdsAutopilotRun(W.env,T+500*60000,"t",{market:"TURKEY",marketCap:3}))&&!(await AE.reserveAdsAutopilotRun(W.env,T+600*60000,"t",{market:"IRAN",marketCap:null})),"");
 dbrun("DELETE FROM autonomy_controls WHERE key='budgets'");resetRuns();
 // cross-market: an existing IRAN lead (country ایران) re-found by an ARAB run keeps its market and gets no Iraqi draft
 dbrun("DELETE FROM leads WHERE contact LIKE '%gold-baghdad%'");dbrun("DELETE FROM lead_identities WHERE lead_id NOT IN (SELECT id FROM leads)");
 addLead("X-IR","discovered",{source:"customer_discovery",country:"ایران",website:"https://gold-baghdad.iq/"},"existing iran lead");
 dbrun("INSERT INTO lead_identities(identity_key,identity_type,normalized_value,lead_id,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",["domain:gold-baghdad.iq","domain","gold-baghdad.iq","X-IR","test",t0,t0]);
 const o1=prompts.length;const c=await call("/api/ads/autopilot",{type:"gold",city:"بغداد"});const xn=notes("X-IR");
 ok("I5 cross-market protection: an existing IRAN lead re-found by an ARAB run keeps country ایران, gets no draft (counted as cross_market_skipped)",c.status===200&&xn.country==="ایران"&&!xn.negotiation_draft&&(c.body.summary?.cross_market_skipped||0)>=1&&prompts.length===o1,[xn.country,xn.target_market,c.body?.summary?.cross_market_skipped]);
 const o=JSON.parse(oldNotes),h=notes("H-OLD");
 ok("I6 historical lead without market evidence: never given a market or country, original fields intact (only follow-up draft fields added)",marketKeys("H-OLD").length===0&&Object.keys(o).every(k=>J(o[k])===J(h[k])),[marketKeys("H-OLD")]);}

// ================= BLOCK Q — three independent daily quotas (Phase 09.7): ADS_IRAN_DISCOVERY, ADS_IRAQ_DISCOVERY, CRM_FOLLOWUP =================
{const setB=b=>b?dbrun("INSERT OR REPLACE INTO autonomy_controls(key,value,updated_at) VALUES('budgets',?,?)",[JSON.stringify(b),new Date().toISOString()]):dbrun("DELETE FROM autonomy_controls WHERE key='budgets'");
 const cfgCrm=async()=>(await call("/api/ads/markets",null,"GET")).body?.crm_followups?.runs_per_day;
 setB(null);const c0=await cfgCrm();setB({ads_runs_per_day:10});const c1=await cfgCrm();setB({ads_runs_per_day:10,crm_followups_per_day:5});const c2=await cfgCrm();setB({crm_followups_per_day:-1});const c3=await cfgCrm();setB({crm_followups_per_day:"7"});const c4=await cfgCrm();
 ok("Q0 CRM quota source: no owner value → inherits the Ads run cap that governed follow-ups until now (24 default / owner 10); an owner crm_followups_per_day wins; invalid values fall back (nothing invented, capacity not reduced)",J([c0,c1,c2,c3,c4])===J([24,10,5,24,24]),[c0,c1,c2,c3,c4]);
 resetRuns();setB({ads_runs_per_day:5,crm_followups_per_day:1});
 const d=new Date();d.setUTCHours(10,0,0,0);const T=d.getTime(),at=m=>T+m*60000;
 const ads=(m,c,t)=>AE.reserveAdsAutopilotRun(W.env,at(t),"t",{market:m,marketCap:c}),cr=(t,o)=>AE.reserveCrmFollowupRun(W.env,at(t),"t",o);
 const seq=[await ads("IRAN",2,0),await ads("IRAN",2,60),await ads("IRAN",2,120),await ads("ARAB",2,121),await cr(0),await cr(60),await ads("ARAB",2,180),await ads("ARAB",2,240),await ads("IRAN",2,300)];
 ok("Q1 independent counters: IRAN exhausted (2/2) does not stop ARAB; CRM exhausted (1/1) does not stop ARAB; ARAB stops only at its own cap; IRAN stays exhausted",J(seq)===J([true,true,false,true,true,false,true,false,false])&&reservations("IRAN")===2&&reservations("ARAB")===2&&crm()===1,seq);
 const cnt=q("SELECT type,COUNT(*) n FROM system_events WHERE type IN ('ads_autopilot_reserved','crm_followup_reserved') GROUP BY type ORDER BY type").map(r=>[r.type,r.n]);
 ok("Q2 each quota writes only its own rows (CRM never writes an Ads row and vice versa)",J(cnt)===J([["ads_autopilot_reserved",4],["crm_followup_reserved",1]]),cnt);
 const n0=new Date(d);n0.setUTCDate(n0.getUTCDate()+1);n0.setUTCHours(0,0,0,0);const N=n0.getTime();
 const edge=[await AE.reserveAdsAutopilotRun(W.env,N-1,"t",{market:"IRAN",marketCap:2}),await AE.reserveCrmFollowupRun(W.env,N-1,"t"),await AE.reserveAdsAutopilotRun(W.env,N,"t",{market:"IRAN",marketCap:2}),await AE.reserveCrmFollowupRun(W.env,N,"t"),await AE.reserveAdsAutopilotRun(W.env,N+60000,"t",{market:"ARAB",marketCap:2})];
 ok("Q3 UTC reset: one millisecond before midnight the exhausted IRAN and CRM quotas still refuse; at 00:00:00.000 both start fresh; ARAB too",J(edge)===J([false,false,true,true,true]),edge);
 const sp=[await AE.reserveCrmFollowupRun(W.env,N+30*60000,"t"),await AE.reserveCrmFollowupRun(W.env,N+31*60000,"t",{spacing:false})];
 setB({ads_runs_per_day:5,crm_followups_per_day:3});const sp2=await AE.reserveCrmFollowupRun(W.env,N+40*60000,"t",{spacing:false});
 ok("Q4 CRM spacing: a second CRM run 30 min later is refused (55-minute spacing); the 07:00-style sweep (no spacing) is refused while the daily cap (1) is used and allowed once the owner raises the CRM cap",J([...sp,sp2])===J([false,false,true]),[...sp,sp2]);
 resetRuns();setB({ads_runs_per_day:24,crm_followups_per_day:1});
 // API level: IRAN exhausted (limit 1) while ARAB and CRM continue; dashboard shows the exhaustion per quota
 await call("/api/ads/markets/config",{market:"IRAN",enabled:true,city:"تهران",runs_per_day:1,owner_approved:true});await call("/api/ads/markets/config",{market:"ARAB",enabled:true,city:"بغداد",runs_per_day:2,owner_approved:true});
 const i1=await call("/api/ads/autopilot",{type:"gold",city:"تهران"});const s0=searches.length;const i2=await call("/api/ads/autopilot",{type:"gold",city:"تهران"});const a1=await call("/api/ads/autopilot",{type:"gold",city:"بغداد"});
 const mk=(await call("/api/ads/markets",null,"GET")).body||{};
 ok("Q5 IRAN exhausted (1/1): the next IRAN run is deferred with no search, while ARAB still runs; the dashboard data marks only IRAN exhausted",!i1.body.deferred&&i2.body.deferred===true&&i2.body.market==="IRAN"&&!a1.body.deferred&&!a1.body.skipped&&mk.markets?.IRAN?.exhausted===true&&mk.markets?.ARAB?.exhausted===false&&mk.crm_followups?.exhausted===false&&mk.markets?.IRAN?.enabled===true,[i2.body?.reason,a1.body?.reason,mk.markets?.IRAN?.exhausted]);
 arm(["H-TG"]);const f1=await call("/api/ads/followups/run",{});arm(["H-IQ"]);resetRuns();
 setB({ads_runs_per_day:24,crm_followups_per_day:1});await AE.reserveCrmFollowupRun(W.env,Date.now(),"t");   // CRM 1/1 used
 const f2=await call("/api/ads/followups/run",{}),a2=await call("/api/ads/autopilot",{type:"gold",city:"بغداد"}),mk2=(await call("/api/ads/markets",null,"GET")).body||{};
 ok("Q6 CRM exhausted (1/1): the follow-up button is deferred (crm_followup_daily_limit, lead stays due) while ARAB discovery still runs and the Ads markets are not marked exhausted",f1.body.prepared===1&&f2.body.deferred===true&&f2.body.reason==="crm_followup_daily_limit"&&notes("H-IQ").next_followup_at===due&&!notes("H-IQ").followup_draft&&!a2.body.deferred&&mk2.crm_followups?.exhausted===true&&mk2.markets?.ARAB?.exhausted===false,[f2.body?.reason,a2.body?.reason]);
 // no duplicate between the 07:00 sweep and the 15-minute tick that fire at the same minute
 resetRuns();setB(null);arm(["H-IQ","H-TG","H-OLD"]);const p0=prompts.length,seven=new Date();seven.setUTCHours(7,0,0,0);
 const pp=[];await Promise.all([WK.scheduled({cron:"0 7 * * *",scheduledTime:seven.getTime()},W.env,{waitUntil:x=>pp.push(x)}),WK.scheduled({cron:"*/15 * * * *",scheduledTime:seven.getTime()},W.env,{waitUntil:x=>pp.push(x)})]);await Promise.allSettled(pp);
 const srcs=q("SELECT details_json FROM system_events WHERE type='crm_followup_reserved'").map(r=>JSON.parse(r.details_json).source);
 ok("Q7 07:00 sweep and the 07:00 15-minute tick together: each due lead gets exactly ONE draft and only the daily sweep reserves CRM quota",["H-IQ","H-TG","H-OLD"].every(id=>promptsFor(id).length>=1&&!!notes(id).followup_draft)&&prompts.length===p0+3&&J(srcs)===J(["daily_followups"]),[prompts.length-p0,srcs]);
 const page=await (await W.run(new Request("https://w.test/dashboard/agents"))).text();
 ok("Q8 dashboard: separate cards/usage for IRAN Ads, IRAQ Ads and CRM follow-ups with exhaustion labels; DEMO vs real data label; no secret or phone in the markets API",/پیگیری CRM/.test(page)&&/سهمیهٔ امروز تمام شد/.test(page)&&/DEMO/.test(page)&&!/test-openai-not-real|\+964|0912/.test(JSON.stringify((await call("/api/ads/markets",null,"GET")).body)),"");
 setB(null);resetRuns();await call("/api/ads/autopilot/stop",{});}

// ================= BLOCK 5 — reporting, dashboard, disabling, other agents =================
{await call("/api/ads/markets/config",{market:"IRAN",enabled:true,city:"تهران",runs_per_day:3,owner_approved:true});await call("/api/ads/markets/config",{market:"ARAB",enabled:true,city:"بغداد",runs_per_day:2,owner_approved:true});   // Block Q ended with the stop switch
 const f=(await call("/api/leads/funnel",null,"GET")).body||{};const bm=f.by_market||{};
 ok("R1 the funnel is split by market (IRAN / ARAB / UNKNOWN) and still reconciles",f.reconciled===true&&!!bm.IRAN&&!!bm.ARAB&&!!bm.UNKNOWN&&Object.values(bm).reduce((a,x)=>a+Object.values(x).reduce((s,v)=>s+v,0),0)===f.total_leads,Object.keys(bm));
 const tg=(await call("/api/ads/targets",null,"GET")).body||{},ov=(await call("/api/ads/overview",null,"GET")).body||{};
 ok("R2 Ads targets and overview carry the market of each lead and per-market counts (H-OLD → UNKNOWN)",tg.items?.find(x=>x.id==="H-OLD")?.market==="UNKNOWN"&&tg.items?.some(x=>x.market==="IRAN")&&(tg.by_market?.UNKNOWN||0)>=1&&!!ov.by_market?.IRAN&&ov.items?.every(x=>["IRAN","ARAB","UNKNOWN","CONFLICT"].includes(x.market)),[tg.by_market,Object.keys(ov.by_market||{})]);
 const st=(await call("/api/ads/autopilot/status",null,"GET")).body||{};
 ok("R3 the legacy status route reports both markets and labels the legacy config inactive",st.enabled===true&&st.markets?.IRAN?.ready===true&&st.markets?.ARAB?.ready===true&&st.legacy_config_active===false,[st.enabled,st.legacy_config_active]);
 const page=await (await W.run(new Request("https://w.test/dashboard/agents"))).text();
 ok("R4 the agents page has the Ads markets section (two cards, owner-confirmed enabling, DEMO/real data label)",/adsMarketsGrid/.test(page)&&/owner_approved:true/.test(page)&&/window\.confirm/.test(page)&&/DEMO/.test(page),"");
 const off=await call("/api/ads/markets/config",{market:"IRAN",enabled:false});const s0=searches.length;resetRuns();await tick();
 ok("K1 disabling a market needs no approval and stops it at once: the next cron runs ARAB only",off.status===200&&JSON.parse(kv("ads_market:IRAN")).enabled===false&&reservations("IRAN")===0&&reservations("ARAB")===1&&searches.slice(s0).every(x=>!/تهران|ایران/.test(x)),[off.status,reservations("IRAN"),reservations("ARAB")]);
 const stop=await call("/api/ads/autopilot/stop",{});
 ok("K2 the stop button is a kill switch: both markets disabled (cities/limits kept), legacy row disabled, nothing deleted",stop.status===200&&JSON.parse(kv("ads_market:ARAB")).enabled===false&&JSON.parse(kv("ads_market:ARAB")).city==="بغداد"&&JSON.parse(kv("ads_autopilot_config")).enabled===false&&JSON.parse(kv("ads_autopilot_config")).city==="تهران",[stop.status]);
 // controlled comparison on the same data: only the market switches change (a cron tick would also run the other agents' own work)
 const before10=await other10();
 await call("/api/ads/markets/config",{market:"IRAN",enabled:true,city:"تهران",runs_per_day:3,owner_approved:true});await call("/api/ads/markets/config",{market:"ARAB",enabled:true,city:"بغداد",runs_per_day:2,owner_approved:true});
 const on10=await other10();await call("/api/ads/autopilot/stop",{});
 ok("O1 the other 10 agents' status/health/connection/reason codes are identical with the Ads markets on and off",on10===before10&&(await other10())===before10,"");
 ok("S1 nothing was sent to Telegram and no owner approval item was created by any Ads path (drafts only)",!W.tg.some(x=>/^send/.test(x.method))&&q("SELECT COUNT(*) n FROM agent_approvals")[0].n===0,W.tg.map(x=>x.method));
 ok("S2 only in-process mocks were called (no real network)",W.offNet().every(u=>/google\.com|bing\.com|gold-tehran\.ir|gold-baghdad\.iq|api\.openai\.com|w\.test/.test(u)),W.offNet().filter(u=>!/google\.com|bing\.com|gold-tehran\.ir|gold-baghdad\.iq|api\.openai\.com|w\.test/.test(u)));
 ok("U1 market helpers: spellings map to CRM ids; owner market > country > Ads market; disagreement → CONFLICT; none → UNKNOWN",AM.normalizeAdsMarket("iraq")==="ARAB"&&AM.normalizeAdsMarket("العراق")==="ARAB"&&AM.normalizeAdsMarket("ایران")==="IRAN"&&AM.normalizeAdsMarket("turkey")===null&&AM.leadMarketOf({market:"IRAN",country:"العراق"})==="IRAN"&&AM.leadMarketOf({country:"ایران",target_market:"ARAB"})==="CONFLICT"&&AM.leadMarketOf({target_market:"iraq"})==="ARAB"&&AM.leadMarketOf({type:"gold_ar"})==="UNKNOWN","");}
process.exit(done()?1:0);
