// PHASE 16.16 — LIVE DISCOVERY YIELD FIX. Production (2026-10-30, 10 runs) found 0 leads: the search query carried a fixed list of other
// cities that diluted the run's rotated city, and a local shop page naming its city but not the word "Iran"/"Iraq" was rejected as
// target_country_missing. Checks the focused query, city-as-country evidence, unchanged rejections and the new audit evidence.
// Local only: search engines, sites and OpenAI are in-process mocks; no message is sent.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase16_16disc");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const W=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on"}});const {q,dbrun,call}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
const AE=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+"?disc="+Math.random());await AE.autonomyMasterGate(W.env);
const AM=await import(pathToFileURL(path.join(SRC,"ads-markets.js")).href);
const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;
const cityIR=AM.adsCityForRun({market:"IRAN",city:"ALL"}),cityIQ=AM.adsCityForRun({market:"ARAB",city:"ALL"});
const otherIR=AM.ADS_TARGET_CITIES.IRAN.map(c=>c[0]).find(c=>c!==cityIR),otherIQ=AM.ADS_TARGET_CITIES.ARAB.map(c=>c[0]).find(c=>c!==cityIQ);
// Shop pages that name their city but never the country (the production rejection case), plus pages that must stay rejected.
const page=(title,body)=>new Response(`<html><title>${title}</title><body>${body} <a href="/contact">تماس با ما</a></body></html>`,{status:200,headers:{"Content-Type":"text/html"}});
const SITES={
  "https://shop-ir.com/":()=>page("طلافروشی نمونه "+cityIR,"گالری طلا و جواهر، زرگری در "+cityIR+"، خیابان امام. تلفن 0131234567"),
  "https://other-ir.com/":()=>page("طلافروشی دیگر "+otherIR,"زرگری در "+otherIR),
  "https://price-ir.com/":()=>page("قیمت طلا امروز "+cityIR,"نرخ طلا و سکه"),
  // city named only in passing (no local phone, not in the title) → uncertain, must stay rejected
  "https://passing-ir.com/":()=>page("زرگری نمونه","زرگری و جواهر؛ ارسال به "+cityIR+" هم داریم"),
  // city in the body + a local mobile written in Persian digits → reliable local evidence
  "https://phone-ir.com/":()=>page("زرگری الماس","زرگری و جواهرفروشی، شعبه "+cityIR+". تلفن ۰۹۱۲ ۳۴۵ ۶۷۸۹"),
  "https://afg-ir.com/":()=>page("طلافروشی کابل","زرگری در کابل و "+cityIR+" 0791234567"),
  "https://shop-iq.com/":()=>page("مجوهرات النموذج - صائغ "+cityIQ,"محل ذهب ومجوهرات في "+cityIQ+" شارع الرئيسي"),
  "https://price-iq.com/":()=>page("سعر الذهب اليوم "+cityIQ,"أسعار الذهب")};
const searches=[];const inner=globalThis.fetch;
globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);
  if(s.startsWith("https://w.test/"))return W.run(new Request(s,o));
  if(/^https:\/\/www\.(google|bing)\.com\/search/.test(s)){const qq=decodeURIComponent(new URL(s).searchParams.get("q")||"");searches.push(qq);const iq=/العراق/.test(qq);
    const links=iq?["https://shop-iq.com/","https://price-iq.com/"]:["https://shop-ir.com/","https://other-ir.com/","https://price-ir.com/","https://passing-ir.com/","https://phone-ir.com/","https://afg-ir.com/"];
    return new Response("<html>"+links.map(l=>`<a href="${l}">x</a>`).join("")+"</html>",{status:200,headers:{"Content-Type":"text/html"}});}
  const key=Object.keys(SITES).find(k=>s.startsWith(k));if(key)return SITES[key]();
  return inner(u,o);};
const tick=async()=>{const p=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},W.env,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);};
const runs=m=>q("SELECT details_json FROM system_events WHERE type='ad_autopilot_run'").map(r=>JSON.parse(r.details_json)).filter(d=>d.market===m);
const leadsOf=m=>q("SELECT name,notes FROM leads").map(r=>({name:r.name,meta:JSON.parse(r.notes||"{}")})).filter(l=>l.meta.source==="ad_autopilot"&&l.meta.target_market===m);
await call("/api/ads/autopilot/status",null,"GET");
for(const market of ["IRAN","ARAB"])await call("/api/ads/markets/config",{market,enabled:true,city:"ALL",type:"gold",runs_per_day:24,owner_approved:true});
await tick();

const irQ=searches.filter(s=>!/العراق/.test(s)),iqQ=searches.filter(s=>/العراق/.test(s));
ok("D1 IRAN query targets only the rotated city (no fixed list of other Iran cities)",irQ.length>0&&irQ.every(s=>s.includes(cityIR)&&!AM.ADS_TARGET_CITIES.IRAN.some(c=>c[0]!==cityIR&&s.includes(c[0]))),irQ);
ok("D2 ARAB query targets only the rotated city (no fixed list of other Iraq cities)",iqQ.length>0&&iqQ.every(s=>s.includes(cityIQ)&&!AM.ADS_TARGET_CITIES.ARAB.some(c=>c[0]!==cityIQ&&s.includes(c[0]))),iqQ);
const ir=runs("IRAN")[0]||{},iq=runs("ARAB")[0]||{};
ok("D3 IRAN shop page naming its city (no word 'Iran', .com) is accepted and persisted as an IRAN lead",ir.found===2&&leadsOf("IRAN").length===2&&leadsOf("IRAN").every(l=>l.meta.city===cityIR),[ir,leadsOf("IRAN").length]);
ok("D4 ARAB shop page naming its city (no word 'Iraq', .com) is accepted and persisted as an ARAB lead",iq.found===1&&leadsOf("ARAB").length===1,[iq,leadsOf("ARAB").length]);
ok("D5 a page of ANOTHER city of the market is still rejected (target_city_missing / country missing), never stored",!leadsOf("IRAN").some(l=>l.name.includes(otherIR))&&(ir.rejected_reasons?.target_country_missing||0)+(ir.rejected_reasons?.target_city_missing||0)>=1,ir.rejected_reasons);
ok("D6 price/news pages are still rejected in both markets",(ir.rejected_reasons?.price_or_news||0)>=1&&(iq.rejected_reasons?.price_or_news||0)>=1,[ir.rejected_reasons,iq.rejected_reasons]);
ok("D7 run audit now records candidates, new vs updated leads and per-provider link counts",ir.candidates===6&&ir.new_leads===2&&ir.updated===0&&Array.isArray(ir.search)&&ir.search[0]?.providers?.length===2&&ir.search[0].providers.every(p=>typeof p.links==="number"),ir);
ok("D8 market attribution kept: no IRAN lead carries ARAB and vice versa",leadsOf("IRAN").every(l=>l.meta.target_market==="IRAN")&&leadsOf("ARAB").every(l=>l.meta.target_market==="ARAB"));
dbrun("UPDATE system_events SET created_at=? WHERE type='ads_autopilot_reserved'",[new Date(Date.now()-61*60000).toISOString()]);
await tick();
ok("D9 duplicate prevention: a second run finding the same shops updates them, creates no new lead",leadsOf("IRAN").length===2&&runs("IRAN")[1]?.new_leads===0&&runs("IRAN")[1]?.updated===2,runs("IRAN")[1]);
ok("D10 no OpenAI key → no paid call; no customer message; nothing left the in-process mocks",!searches.some(s=>/openai/.test(s))&&W.offNet().length===0,W.offNet());
{const ev=Object.fromEntries(leadsOf("IRAN").map(l=>[l.name.includes("الماس")?"phone":"title",l.meta.qualification?.country_evidence]));
 ok("D11 a city mentioned only in passing (no local phone, not in title) is NOT accepted as country evidence",!leadsOf("IRAN").some(l=>l.name==="زرگری نمونه"),leadsOf("IRAN").map(l=>l.name));
 ok("D12 city + local phone in Persian digits is accepted; the evidence kind is recorded on the lead",ev.phone==="city_and_local_phone"&&ev.title==="city_in_title",ev);
 ok("D13 a wrong-country (Afghanistan) shop is rejected as foreign_country, never stored",(ir.rejected_reasons?.foreign_country||0)===1&&!leadsOf("IRAN").some(l=>/کابل/.test(l.name)),ir.rejected_reasons);
 ok("D14 gold queries ask for shops and exclude price/news words in both languages",irQ.every(s=>/طلافروشی/.test(s)&&/-قیمت/.test(s))&&iqQ.every(s=>/محل ذهب/.test(s)&&/-سعر/.test(s)),[irQ[0],iqQ[0]]);
 ok("D15 run audit records the silently dropped pages by reason (object present, counts numeric)",ir.dropped&&typeof ir.dropped==="object"&&Object.values(ir.dropped).every(n=>Number.isInteger(n)),ir.dropped);}
done();
