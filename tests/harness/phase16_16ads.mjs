// PHASE 16.16 — ALL-CITIES ADS DISCOVERY: owner policy 2026-10-30 = IRAN and ARAB (Iraq) nationwide, segment gold, at most 24 runs per
// MARKET per day. A market's city may now be "ALL": each discovery run takes ONE supported city of that market, rotating by UTC hour;
// the market's daily limit, 55-minute spacing, reservation, attribution and draft-only behaviour are unchanged. Local only: search
// engines, sites and OpenAI are in-process mocks; the worker's own URL is routed back into the test worker; no message is sent.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,J,done}=reporter("phase16_16ads");
const started=Date.now();
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const W=await makeWorld({extraEnv:{OPENAI_API_KEY:"test-openai-not-real",PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on"}});const {q,dbrun,call}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
const AE=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+"?ads="+Math.random());await AE.autonomyMasterGate(W.env);
const AM=await import(pathToFileURL(path.join(SRC,"ads-markets.js")).href);
const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;
let searches=[],drafts=[];const inner=globalThis.fetch;
const IR_SITE='<html><title>گالری طلای نمونه</title><body>طلافروشی و جواهر در ایران؛ شعبه‌ها: تهران، اصفهان، شیراز، مشهد، تبریز، کرج، قم، اهواز، رشت، کرمان، یزد. تلفن 02100000000. <a href="/contact">تماس با ما contact us</a></body></html>';
const IQ_SITE='<html><title>مجوهرات النموذج - صائغ</title><body>محل ذهب ومجوهرات في العراق؛ فروعنا: بغداد، أربيل، البصرة، النجف، كربلاء، السليمانية، الموصل، كركوك، دهوك، الناصرية. هاتف +9647700000001. <a href="/contact">تواصل contact us</a></body></html>';
globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);
  if(s.startsWith("https://w.test/"))return W.run(new Request(s,o));
  if(/^https:\/\/www\.(google|bing)\.com\/search/.test(s)){const qq=decodeURIComponent(new URL(s).searchParams.get("q")||"");searches.push(qq);const iraq=/العراق/.test(qq);
    return new Response(`<html><a href="${iraq?"https://gold-iq-"+searches.length+".iq/":"https://gold-ir-"+searches.length+".ir/"}">x</a></html>`,{status:200,headers:{"Content-Type":"text/html"}});}
  if(/^https:\/\/gold-ir-\d+\.ir/.test(s))return new Response(IR_SITE,{status:200,headers:{"Content-Type":"text/html"}});
  if(/^https:\/\/gold-iq-\d+\.iq/.test(s))return new Response(IQ_SITE,{status:200,headers:{"Content-Type":"text/html"}});
  if(s==="https://api.openai.com/v1/responses"){const inp=JSON.parse(o.body||"{}").input;if(typeof inp==="string"&&/B2B/.test(inp))drafts.push(inp);
    return new Response(JSON.stringify({output_text:"پیش‌نویس آزمایشی",output:[{type:"message",content:[{type:"output_text",text:"پیش‌نویس آزمایشی"}]}]}),{status:200,headers:{"Content-Type":"application/json"}});}
  return inner(u,o);};
const tick=async()=>{const p=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},W.env,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);};
const runs=m=>q("SELECT details_json FROM system_events WHERE type='ad_autopilot_run'").map(r=>JSON.parse(r.details_json)).filter(d=>!m||d.market===m);
const reservations=m=>q("SELECT COUNT(*) n FROM system_events WHERE type='ads_autopilot_reserved' AND instr(details_json,?)>0",[`"market":"${m}"`])[0].n;
const backdate=()=>dbrun("UPDATE system_events SET created_at=? WHERE type='ads_autopilot_reserved'",[new Date(Date.now()-61*60000).toISOString()]);
const kv=k=>q("SELECT value FROM system_kv WHERE key=?",[k])[0]?.value??null;
const IR=AM.ADS_TARGET_CITIES.IRAN.map(c=>c[0]),IQ=AM.ADS_TARGET_CITIES.ARAB.map(c=>c[0]);
await call("/api/ads/autopilot/status",null,"GET");

// ---- rotation (pure)
{const H=3600000,base=Date.UTC(2026,9,30,0,0,0);
 const day=m=>Array.from({length:24},(_,h)=>AM.adsCityForRun({market:m,city:"ALL"},base+h*H));
 ok("A1 IRAN 'ALL': 24 consecutive hourly runs cover all 11 supported Iran cities, only Iran cities",new Set(day("IRAN")).size===IR.length&&day("IRAN").every(c=>IR.includes(c)),[IR.length,new Set(day("IRAN")).size]);
 ok("A2 ARAB 'ALL': 24 consecutive hourly runs cover all 10 supported Iraq cities, only Iraq cities",new Set(day("ARAB")).size===IQ.length&&day("ARAB").every(c=>IQ.includes(c)),[IQ.length,new Set(day("ARAB")).size]);
 ok("A3 rotation is deterministic and consecutive hours take consecutive cities",AM.adsCityForRun({market:"IRAN",city:"ALL"},base)===AM.adsCityForRun({market:"IRAN",city:"ALL"},base+59*60000)&&day("IRAN")[0]!==day("IRAN")[1]);
 ok("A4 a single configured city is unchanged (existing behaviour)",AM.adsCityForRun({market:"IRAN",city:"اصفهان"},base)==="اصفهان");
 ok("A5 readiness: 'ALL' is a valid city for both markets; empty still ADS_CITY_EMPTY",AM.adsMarketReadiness({market:"IRAN",enabled:true,city:"ALL",runs_per_day:24},24).ready&&AM.adsMarketReadiness({market:"ARAB",enabled:true,city:"ALL",runs_per_day:24},24).ready&&AM.adsMarketReadiness({market:"IRAN",enabled:true,city:"",runs_per_day:24},24).codes.includes("ADS_CITY_EMPTY"));}

// ---- owner configuration through the existing authenticated API (same validation and owner_approved rule)
{const noApproval=await call("/api/ads/markets/config",{market:"IRAN",enabled:true,city:"ALL",type:"gold",runs_per_day:24});
 ok("A6 enabling still requires the existing owner_approved flag (403 without it, nothing stored)",noApproval.status===403&&kv("ads_market:IRAN")===null,noApproval.body);
 const over=await call("/api/ads/markets/config",{market:"IRAN",enabled:true,city:"ALL",type:"gold",runs_per_day:25,owner_approved:true});
 ok("A7 the per-market limit stays bounded by the global Ads cap (25 refused, cap 24)",over.status===400&&over.body?.reason==="ads_limit_invalid",over.body);
 const ir=await call("/api/ads/markets/config",{market:"IRAN",enabled:true,city:"همه شهرها",type:"gold",runs_per_day:24,owner_approved:true});
 const iq=await call("/api/ads/markets/config",{market:"ARAB",enabled:true,city:"كل المدن",type:"gold",runs_per_day:24,owner_approved:true});
 ok("A8 IRAN and ARAB enabled nationwide (aliases accepted → 'ALL'), gold, 24/day, both READY",ir.status===200&&iq.status===200&&ir.body.config.city==="ALL"&&iq.body.config.city==="ALL"&&ir.body.readiness.ready&&iq.body.readiness.ready
   &&ir.body.config.type==="gold"&&iq.body.config.runs_per_day===24,[ir.body,iq.body]);
 const st=await call("/api/ads/markets",null,"GET");const m=st.body?.markets||{};
 ok("A9 status: both markets enabled + ready, city ALL, runs_per_day 24 each, quotas ADS_IRAN_DISCOVERY / ADS_IRAQ_DISCOVERY",m.IRAN?.enabled&&m.ARAB?.enabled&&m.IRAN.ready&&m.ARAB.ready&&m.IRAN.city==="ALL"&&m.ARAB.runs_per_day===24&&m.IRAN.quota==="ADS_IRAN_DISCOVERY"&&m.ARAB.quota==="ADS_IRAQ_DISCOVERY",m);
 const wrong=await call("/api/ads/markets/config",{market:"IRAN",city:"بغداد",owner_approved:true});
 ok("A10 market isolation kept: an Iraq city is still refused for IRAN",wrong.status===400&&wrong.body?.reason==="ads_city_not_in_market");}

// ---- scheduled discovery
{const s0=searches.length,d0=drafts.length;await tick();
 const ir=runs("IRAN"),iq=runs("ARAB");
 ok("A11 one cron tick runs ONE IRAN and ONE ARAB discovery (no burst), each reserving its own market quota once",ir.length===1&&iq.length===1&&reservations("IRAN")===1&&reservations("ARAB")===1,[ir.length,iq.length]);
 const hourCityIR=AM.adsCityForRun({market:"IRAN",city:"ALL"},Date.now()),hourCityIQ=AM.adsCityForRun({market:"ARAB",city:"ALL"},Date.now());
 ok("A12 each run used this hour's rotation city of ITS market (IRAN → Iran city, ARAB → Iraq city)",ir[0].city===hourCityIR&&IR.includes(ir[0].city)&&iq[0].city===hourCityIQ&&IQ.includes(iq[0].city),[ir[0].city,iq[0].city]);
 const sq=searches.slice(s0);
 ok("A13 search queries are per market: Iran queries Persian (with the Iran city), Iraq queries Arabic (with the Iraq city)",sq.some(x=>x.includes(ir[0].city)&&!/العراق/.test(x))&&sq.some(x=>x.includes(iq[0].city)&&/العراق/.test(x)),sq.length);
 const leads=q("SELECT notes FROM leads").map(r=>JSON.parse(r.notes||"{}")).filter(n=>n.source==="ad_autopilot"||n.ad_target);
 ok("A14 CRM persistence: new leads carry target_market of the market that found them (IRAN and ARAB present, no mixing)",leads.length>=2&&leads.some(n=>n.target_market==="IRAN")&&leads.some(n=>n.target_market==="ARAB")
   &&leads.every(n=>(n.website||"").endsWith(".ir/")||!(n.target_market==="IRAN"&&/\.iq/.test(n.website||""))),leads.map(n=>[n.target_market,n.website]));
 ok("A15 drafts only (owner sends): ≤ 6 OpenAI drafts per run, no Telegram/customer message, no stage change to contacted",drafts.length-d0<=12&&W.tg.filter(x=>/^send/.test(x.method)).length===0&&!q("SELECT 1 FROM leads WHERE stage='contacted'").length,[drafts.length-d0]);
 const s1=searches.length;await tick();
 ok("A16 no duplicate execution: a second tick inside 55 minutes runs nothing more (spacing per market)",searches.length===s1&&runs("IRAN").length===1&&runs("ARAB").length===1);
 backdate();await tick();
 ok("A17 after the spacing, the scheduler runs each market once more (normal distribution, never a forced burst)",runs("IRAN").length===2&&runs("ARAB").length===2&&reservations("IRAN")===2);}

// ---- market-level daily quota
{await call("/api/ads/markets/config",{market:"IRAN",enabled:true,city:"ALL",type:"gold",runs_per_day:3,owner_approved:true});
 backdate();await tick();const afterThird=runs("IRAN").length;backdate();await tick();
 ok("A18 the daily limit is per MARKET (not per city): IRAN stops at 3 runs today although cities rotate; ARAB keeps running",afterThird===3&&runs("IRAN").length===3&&runs("ARAB").length===4,[runs("IRAN").length,runs("ARAB").length]);
 const off=await call("/api/ads/markets/config",{market:"ARAB",enabled:false});const n=runs("ARAB").length;backdate();await tick();
 ok("A19 disabling needs no approval and stops that market at the next tick",off.status===200&&runs("ARAB").length===n);}

ok("A20 no request left the machine except the in-process mocks",!W.offNet().filter(u=>!/^https:\/\/(www\.(google|bing)\.com|gold-i[rq]-\d+\.i[rq]|api\.openai\.com)/.test(u)).length,W.offNet().slice(0,5));
console.log(`phase16_16ads time ${((Date.now()-started)/1000).toFixed(1)} s`);
process.exit(done()?1:0);
