// PHASE 16.16 — ADS AI COST GUARD: bounded input, max_output_tokens + reasoning.effort "low" (official Responses API contract), atomic
// daily draft cap that is also a per-lead-per-day idempotency key, provider usage accounting (input / cached / output / reasoning),
// and drafting that stays optional — a lead is saved and attributed whatever happens to its draft. Nationwide discovery (city ALL,
// gold, 24 runs per market per day) is unchanged. Local only: search, sites and OpenAI are in-process mocks; no paid call, no message.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,J,done}=reporter("phase16_16cost");
const started=Date.now();
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const W=await makeWorld({extraEnv:{OPENAI_API_KEY:"test-openai-not-real",OPENAI_MODEL:"gpt-5.6-luna",PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on"}});const {q,dbrun,call}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
const AE=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+"?cost="+Math.random());await AE.autonomyMasterGate(W.env);
const G=await import(pathToFileURL(path.join(SRC,"ads-draft-guard.js")).href);
const AM=await import(pathToFileURL(path.join(SRC,"ads-markets.js")).href);
await import(pathToFileURL(path.join(SRC,"index.js")).href);
const IR_CITIES="تهران، اصفهان، شیراز، مشهد، تبریز، کرج، قم، اهواز، رشت، کرمان، یزد",IQ_CITIES="بغداد، أربيل، البصرة، النجف، كربلاء، السليمانية، الموصل، كركوك، دهوك، الناصرية";
let site=0,longTitle=false;const bodies=[];let mode="normal";
const inner=globalThis.fetch;
globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);
  if(s.startsWith("https://w.test/"))return W.run(new Request(s,o));
  if(/^https:\/\/www\.(google|bing)\.com\/search/.test(s)){const qq=decodeURIComponent(new URL(s).searchParams.get("q")||"");const iraq=/العراق/.test(qq);site++;
    return new Response(`<html><a href="https://gold-${iraq?"iq":"ir"}-${site}.${iraq?"iq":"ir"}/">x</a></html>`,{status:200,headers:{"Content-Type":"text/html"}});}
  if(/^https:\/\/gold-ir-\d+\.ir/.test(s))return new Response(`<html><title>${longTitle?"گالری طلا ".repeat(800):"گالری طلای نمونه"}</title><body>طلافروشی و جواهر در ایران؛ شعبه‌ها: ${IR_CITIES}. تلفن 02100000000. ${"جزئیات ".repeat(600)}<a href="/contact">تماس با ما contact us</a></body></html>`,{status:200,headers:{"Content-Type":"text/html"}});
  if(/^https:\/\/gold-iq-\d+\.iq/.test(s))return new Response(`<html><title>مجوهرات النموذج - صائغ</title><body>محل ذهب ومجوهرات في العراق؛ فروعنا: ${IQ_CITIES}. هاتف +9647700000001. <a href="/contact">تواصل contact us</a></body></html>`,{status:200,headers:{"Content-Type":"text/html"}});
  if(s==="https://api.openai.com/v1/responses"){const b=JSON.parse(o.body||"{}");
    if(!(typeof b.input==="string"&&/B2B first-contact/.test(b.input)))return new Response(JSON.stringify({output_text:"x",output:[]}),{status:200});   // other autopilots
    bodies.push(b);
    if(mode==="timeout")throw new DOMException("The operation was aborted due to timeout","TimeoutError");
    if(mode==="http500")return new Response(JSON.stringify({error:{message:"server error"}}),{status:500});
    if(mode==="incomplete")return new Response(JSON.stringify({status:"incomplete",incomplete_details:{reason:"max_output_tokens"},output:[{type:"message",content:[{type:"output_text",text:"پیش‌نویس ناقص"}]}],usage:{input_tokens:900,output_tokens:1500,output_tokens_details:{reasoning_tokens:1500}}}),{status:200});
    const usage=mode==="nousage"?undefined:{input_tokens:800,input_tokens_details:{cached_tokens:100},output_tokens:450,output_tokens_details:{reasoning_tokens:150},total_tokens:1250};
    return new Response(JSON.stringify({status:"completed",output_text:"پیش‌نویس آزمایشی",output:[{type:"message",content:[{type:"output_text",text:"پیش‌نویس آزمایشی"}]}],...(usage?{usage}:{})}),{status:200});}
  return inner(u,o);};
const runMarket=async m=>{dbrun("DELETE FROM system_events WHERE type IN ('ads_autopilot_reserved','ads_run_deferred')");const r=await call("/api/ads/autopilot",{market:m});return r.body||{};};
const setBudget=b=>dbrun("INSERT OR REPLACE INTO autonomy_controls(key,value,updated_at) VALUES('budgets',?,?)",[JSON.stringify(b),new Date().toISOString()]);
const adsLeads=()=>q("SELECT id,stage,notes FROM leads").map(r=>({id:r.id,stage:r.stage,n:JSON.parse(r.notes||"{}")})).filter(x=>x.n.ad_target||x.n.source==="ad_autopilot");
await call("/api/ads/autopilot/status",null,"GET");
const cfgIR=await call("/api/ads/markets/config",{market:"IRAN",enabled:true,city:"ALL",type:"gold",runs_per_day:24,owner_approved:true});
const cfgIQ=await call("/api/ads/markets/config",{market:"ARAB",enabled:true,city:"ALL",type:"gold",runs_per_day:24,owner_approved:true});

// ---- unit: settings, input bound, usage parsing, outcome
{const d=G.adsDraftSettings({OPENAI_MODEL:"gpt-5.6-luna"});
 ok("C1 defaults: model unchanged (OPENAI_MODEL), max_output_tokens 1500, reasoning effort low",d.model==="gpt-5.6-luna"&&d.maxOutputTokens===1500&&d.reasoningEffort==="low",d);
 ok("C2 output limit is configurable but bounded (256…4000); invalid → 1500; reasoning 'off' omits the parameter",
   G.adsDraftSettings({ADS_DRAFT_MAX_OUTPUT_TOKENS:"99999"}).maxOutputTokens===4000&&G.adsDraftSettings({ADS_DRAFT_MAX_OUTPUT_TOKENS:"10"}).maxOutputTokens===256&&G.adsDraftSettings({ADS_DRAFT_MAX_OUTPUT_TOKENS:"abc"}).maxOutputTokens===1500
   &&!("reasoning" in G.adsDraftRequestBody(G.adsDraftSettings({ADS_DRAFT_REASONING_EFFORT:"off"}),"p"))&&G.adsDraftRequestBody(d,"p").reasoning.effort==="low");
 const huge=G.buildAdsDraftPrompt({language:"Persian",sourceSite:"https://www.hamzehibox.com",name:"ن".repeat(5000),website:"https://x.ir/"+"a".repeat(5000),evidence:"شواهد ".repeat(3000)});
 ok("C3 input bound: huge name / website / evidence → prompt ≤ 2400 characters, fixed instructions kept",huge.length<=G.ADS_DRAFT_PROMPT_MAX&&/Do not invent facts, prices or discounts/.test(huge),huge.length);
 const u=G.adsDraftUsage({usage:{input_tokens:800,input_tokens_details:{cached_tokens:100},output_tokens:450,output_tokens_details:{reasoning_tokens:150}}});
 ok("C4 usage parsing: input, cached input, output and reasoning tokens taken from the provider response",u.reported&&u.input===800&&u.cached===100&&u.output===450&&u.reasoning===150,u);
 ok("C5 missing usage is reported as missing, never guessed",G.adsDraftUsage({}).reported===false&&G.addAdsDraftUsage(G.emptyAdsDraftStats(d),G.adsDraftUsage({})).usage_missing===1);
 ok("C6 a truncated answer (status incomplete / max_output_tokens) is not a draft",G.adsDraftOutcome({status:"incomplete",incomplete_details:{reason:"max_output_tokens"}},"partial").reason==="incomplete_max_output_tokens"&&G.adsDraftOutcome({status:"completed"},"ok").ok);}

// ---- integration: normal Iran run (nationwide config, real discovery path, mocked provider)
{mode="normal";const b0=bodies.length;const r=await runMarket("IRAN");const ai=r.summary?.ai||{};const req=bodies.slice(b0);
 ok("C7 nationwide config intact: both markets READY with city ALL, gold, 24 runs/day",cfgIR.status===200&&cfgIQ.status===200&&cfgIR.body.config.city==="ALL"&&cfgIQ.body.config.runs_per_day===24&&cfgIR.body.readiness.ready&&cfgIQ.body.readiness.ready);
 ok("C8 IRAN run: a city of the Iran list, leads found, every draft request carries max_output_tokens 1500 + reasoning low, model unchanged",(()=>{const runCity=q("SELECT details_json FROM system_events WHERE type='ad_autopilot_run' ORDER BY rowid DESC LIMIT 1").map(x=>JSON.parse(x.details_json).city)[0];
   return AM.ADS_TARGET_CITIES.IRAN.some(c=>c[0]===runCity)&&req.length>=1&&req.every(x=>x.model==="gpt-5.6-luna"&&x.max_output_tokens===1500&&x.reasoning?.effort==="low")&&r.summary.found>=1;})(),{req:req.length,found:r.summary?.found});
 ok("C9 usage accounting per run (calls, input, cached, output, reasoning) equals the provider's numbers",ai.calls===req.length&&ai.input_tokens===800*req.length&&ai.cached_input_tokens===100*req.length&&ai.output_tokens===450*req.length&&ai.reasoning_tokens===150*req.length&&ai.usage_missing===0,ai);
 const ev=q("SELECT details_json FROM system_events WHERE type='ad_autopilot_run' ORDER BY rowid DESC LIMIT 1").map(x=>JSON.parse(x.details_json))[0];
 ok("C10 the run audit (ad_autopilot_run) records ai_usage for the dashboard / cost review",ev?.ai_usage?.calls===ai.calls&&ev.ai_usage.output_tokens===ai.output_tokens&&ev.market==="IRAN",ev?.ai_usage);
 const ir=adsLeads().filter(x=>x.n.target_market==="IRAN");
 ok("C11 Iran isolation: drafted leads are IRAN, Persian prompts only, stage unchanged (draft only)",ir.length>=1&&ir.every(x=>!x.n.negotiation_draft||x.stage!=="contacted")&&req.every(x=>/Create a concise Persian/.test(x.input)),ir.length);}

// ---- Iraq run + cross-market protection
{mode="normal";const b0=bodies.length;const r=await runMarket("ARAB");const req=bodies.slice(b0);
 const iq=adsLeads().filter(x=>x.n.target_market==="ARAB");
 ok("C12 Iraq isolation: ARAB leads, Iraqi Arabic prompts only, no Iran lead drafted by the Iraq run",iq.length>=1&&req.length>=1&&req.every(x=>/Create a concise Iraqi Arabic/.test(x.input))&&!req.some(x=>/\.ir\//.test(x.input)),{iq:iq.length,req:req.length});}

// ---- duplicate + concurrency
{const day=new Date().toISOString().slice(0,10);
 const a=await G.reserveAdsDraft(W.env,{leadId:"LEAD-X",market:"IRAN",cap:288}),b=await G.reserveAdsDraft(W.env,{leadId:"LEAD-X",market:"IRAN",cap:288});
 ok("C13 duplicate: the same lead can be reserved for a paid draft only once per UTC day",a.reserved&&!b.reserved&&b.reason==="already_reserved");
 const same=await Promise.all([1,2,3,4,5].map(()=>G.reserveAdsDraft(W.env,{leadId:"LEAD-Y",market:"ARAB",cap:288})));
 ok("C14 concurrent attempts on one lead: exactly one reservation wins",same.filter(x=>x.reserved).length===1);
 dbrun("DELETE FROM system_events WHERE type='ads_draft_reserved'");
 const many=await Promise.all(Array.from({length:8},(_,i)=>G.reserveAdsDraft(W.env,{leadId:"L-"+i,market:"IRAN",cap:3})));
 ok("C15 concurrent attempts across leads never exceed the daily cap (cap 3 → exactly 3 of 8)",many.filter(x=>x.reserved).length===3&&many.filter(x=>x.reason==="daily_cap").length===5);
 dbrun("DELETE FROM system_events WHERE type='ads_draft_reserved'");}

// ---- failures keep the lead; discovery continues
{const before=adsLeads().length;
 mode="incomplete";let r=await runMarket("IRAN");
 ok("C16 token exhaustion (incomplete): no partial draft saved, counted as incomplete, usage still accounted",r.summary.ai.incomplete>=1&&r.summary.ai.output_tokens>=1500&&r.summary.drafted===0,r.summary.ai);
 mode="timeout";r=await runMarket("IRAN");
 ok("C17 provider timeout: counted, not retried in the run, nothing saved, run completes",r.ok===true&&r.summary.ai.timeouts>=1&&r.summary.drafted===0,r.summary.ai);
 mode="http500";r=await runMarket("ARAB");
 ok("C18 provider error: counted as failed, run completes",r.ok===true&&r.summary.ai.failed>=1&&r.summary.drafted===0,r.summary.ai);
 mode="nousage";r=await runMarket("IRAN");
 ok("C19 provider response without usage: draft saved, usage_missing counted (no invented numbers)",r.summary.drafted>=1&&r.summary.ai.usage_missing>=1&&r.summary.ai.input_tokens===0,r.summary.ai);
 const after=adsLeads();
 ok("C20 leads persist with the right market whatever happened to the draft",after.length>before&&after.every(x=>["IRAN","ARAB"].includes(x.n.target_market)),[before,after.length]);}

// ---- daily cap exhaustion never stops discovery
{mode="normal";setBudget({ads_drafts_per_day:1});dbrun("DELETE FROM system_events WHERE type='ads_draft_reserved'");
 const r1=await runMarket("IRAN"),r2=await runMarket("ARAB");const runs=q("SELECT COUNT(*) n FROM system_events WHERE type='ad_autopilot_run'")[0].n;
 ok("C21 cap 1: the first draft is made, further drafts are skipped (skipped_daily_cap) — no failure, no approval request",r1.summary.drafted+r2.summary.drafted===1&&(r1.summary.ai.skipped_daily_cap+r2.summary.ai.skipped_daily_cap)>=1,[r1.summary.ai,r2.summary.ai]);
 ok("C22 discovery continues while the draft cap is exhausted (both runs completed and saved leads)",r1.ok&&r2.ok&&r2.summary.found>=1&&runs>=8,[r2.summary.found,runs]);
 const st=await call("/api/ads/markets",null,"GET");
 ok("C23 status reports AI drafts today / cap, model, output limit, reasoning, and that no dollar cap is configured",st.body?.ai_drafts?.drafts_today===1&&st.body.ai_drafts.drafts_per_day===1&&st.body.ai_drafts.exhausted===true&&st.body.ai_drafts.max_output_tokens===1500&&st.body.ai_drafts.dollar_cap===null,st.body?.ai_drafts);
 setBudget({});}

// ---- autonomy and safety
{const st=await call("/api/ads/markets",null,"GET");
 ok("C24 24 runs/day per market still configured; default draft cap 288 (2 × 24 × 6) restored without owner value",st.body.markets.IRAN.runs_per_day===24&&st.body.markets.ARAB.runs_per_day===24&&st.body.ai_drafts.drafts_per_day===288);
 ok("C25 no customer message, no stage moved to contacted, no approval request, no owner decision created",W.tg.filter(x=>/^send/.test(x.method)).length===0&&!q("SELECT 1 FROM leads WHERE stage='contacted'").length&&q("SELECT COUNT(*) n FROM agent_approvals")[0].n===0&&q("SELECT COUNT(*) n FROM owner_decisions")[0].n===0);
 ok("C26 no paid call: nothing left the machine except the in-process mocks",!W.offNet().filter(u=>!/^https:\/\/(www\.(google|bing)\.com|gold-i[rq]-\d+\.i[rq]|api\.openai\.com)/.test(u)).length,W.offNet().slice(0,3));}

console.log(`phase16_16cost time ${((Date.now()-started)/1000).toFixed(1)} s`);
process.exit(done()?1:0);
