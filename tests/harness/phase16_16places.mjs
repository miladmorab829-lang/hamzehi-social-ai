// PHASE 16.16 — GOOGLE PLACES ADS DISCOVERY with the owner's USD 10/month budget. One reserved IDs-only Text Search per Ads run (jewelry
// stores inside the run city's rectangle), place-ID-only CRM storage, a D1 monthly ledger with a safety margin and a daily allowance,
// web-search 429 cooldown and the Watchdog budget warning. Local only: Google Places, search engines and sites are in-process mocks.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase16_16places");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const W=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on",GOOGLE_PLACES_API_KEY:"test-places-not-real",ADS_PLACES_DISCOVERY:"on"}});const {q,dbrun,call}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
const AE=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+"?places="+Math.random());await AE.autonomyMasterGate(W.env);
const AM=await import(pathToFileURL(path.join(SRC,"ads-markets.js")).href);
const PB=await import(pathToFileURL(path.join(SRC,"places-budget.js")).href);
const WD=await import(pathToFileURL(path.join(SRC,"agent-watchdog.js")).href);
const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;
const cityIR=AM.adsCityForRun({market:"IRAN",city:"ALL"}),cityIQ=AM.adsCityForRun({market:"ARAB",city:"ALL"});
let placesCalls=[],placesMode="ok",googleCalls=0,googleStatus=200;const inner=globalThis.fetch;
globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);
  if(s.startsWith("https://w.test/"))return W.run(new Request(s,o));
  if(s==="https://places.googleapis.com/v1/places:searchText"){const body=JSON.parse(o.body||"{}");placesCalls.push({body,mask:o.headers?.["X-Goog-FieldMask"]});
    if(placesMode==="timeout"){const e=new Error("The operation was aborted due to timeout");e.name="TimeoutError";throw e;}
    const iq=body.regionCode==="iq";
    return new Response(JSON.stringify({places:[{id:(iq?"ChIJiq":"ChIJir")+"AAAAAAAAAA1"},{id:(iq?"ChIJiq":"ChIJir")+"AAAAAAAAAA2"}]}),{status:200,headers:{"Content-Type":"application/json"}});}
  if(/^https:\/\/www\.google\.com\/search/.test(s)){googleCalls++;return new Response("<html></html>",{status:googleStatus,headers:{"Content-Type":"text/html"}});}
  if(/^https:\/\/www\.bing\.com\/search/.test(s))return new Response("<html></html>",{status:200,headers:{"Content-Type":"text/html"}});
  return inner(u,o);};
const tick=async()=>{const p=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},W.env,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);};
const backdate=()=>dbrun("UPDATE system_events SET created_at=? WHERE type='ads_autopilot_reserved'",[new Date(Date.now()-61*60000).toISOString()]);
const runs=m=>q("SELECT details_json FROM system_events WHERE type='ad_autopilot_run'").map(r=>JSON.parse(r.details_json)).filter(d=>d.market===m);
const placesLeads=m=>q("SELECT name,contact,notes FROM leads").map(r=>({name:r.name,contact:r.contact,meta:JSON.parse(r.notes||"{}")})).filter(l=>l.meta.provider==="google_places_ids"&&(!m||l.meta.target_market===m));
const ledger=()=>q("SELECT details_json,created_at FROM system_events WHERE type='places_reserved'").map(r=>({...JSON.parse(r.details_json),created_at:r.created_at}));
const clearLedger=()=>dbrun("DELETE FROM system_events WHERE type='places_reserved'");
await call("/api/ads/autopilot/status",null,"GET");
for(const market of ["IRAN","ARAB"])await call("/api/ads/markets/config",{market,enabled:true,city:"ALL",type:"gold",runs_per_day:24,owner_approved:true});

// ---- request shape (pure)
{const ir=PB.placesIdsOnlyRequest({market:"IRAN",city:"اصفهان"}),iq=PB.placesIdsOnlyRequest({market:"ARAB",city:"بغداد"});
 const inside=(r,lat,lng)=>r.low.latitude<lat&&lat<r.high.latitude&&r.low.longitude<lng&&lng<r.high.longitude;
 ok("P1 IRAN request: jewelry_store, strict type filter, Isfahan rectangle, fa/ir, city-specific Persian query",ir.includedType==="jewelry_store"&&ir.strictTypeFiltering===true&&inside(ir.locationRestriction.rectangle,32.6546,51.668)&&ir.languageCode==="fa"&&ir.regionCode==="ir"&&ir.textQuery.includes("اصفهان"),ir);
 ok("P2 ARAB request: jewelry_store, Baghdad rectangle, ar/iq, Arabic query",iq.includedType==="jewelry_store"&&inside(iq.locationRestriction.rectangle,33.3152,44.3661)&&iq.languageCode==="ar"&&iq.regionCode==="iq"&&iq.textQuery.includes("بغداد"),iq);
 const all=[...AM.ADS_TARGET_CITIES.IRAN,...AM.ADS_TARGET_CITIES.ARAB].map(c=>c[0]);
 ok("P3 every supported city (11 Iran + 10 Iraq) has a rectangle; the two markets' rectangles never overlap",all.every(c=>PB.PLACES_CITY_BOUNDS[c])&&AM.ADS_TARGET_CITIES.IRAN.every(([a])=>AM.ADS_TARGET_CITIES.ARAB.every(([b])=>{const x=PB.PLACES_CITY_BOUNDS[a],y=PB.PLACES_CITY_BOUNDS[b];return x.high.latitude<y.low.latitude||y.high.latitude<x.low.latitude||x.high.longitude<y.low.longitude||y.high.longitude<x.low.longitude;})),all.length);}

// ---- budget arithmetic (pure)
{const st=PB.placesBudgetSettings({});
 ok("P4 defaults: USD 10/month, 20% margin → effective cap 8.00; IDs-only reserved at the Pro price (0.032) until billing is verified",st.monthlyUsd===10&&st.capMicros===8000000&&PB.placesReserveMicros("ids_only",st)===32000&&PB.placesReserveMicros("enterprise",st)===35000,st);
 ok("P5 once the owner verifies IDs-only billing, those requests reserve 0; Pro/Enterprise keep list price",PB.placesReserveMicros("ids_only",PB.placesBudgetSettings({ADS_PLACES_IDS_ONLY_BILLING_VERIFIED:"true"}))===0&&PB.placesReserveMicros("pro",PB.placesBudgetSettings({ADS_PLACES_IDS_ONLY_BILLING_VERIFIED:"true"}))===32000);
 ok("P6 Ads Places discovery is OFF unless ADS_PLACES_DISCOVERY=on (Production toml does not set it)",PB.placesBudgetSettings({}).adsEnabled===false&&PB.placesBudgetSettings({ADS_PLACES_DISCOVERY:"on"}).adsEnabled===true);}

// ---- scheduled run with Places on
{await tick();const ir=runs("IRAN")[0]||{},iq=runs("ARAB")[0]||{};
 ok("P7 one Places request per market run, field mask = places.id only (IDs-only SKU)",placesCalls.length===2&&placesCalls.every(c=>c.mask==="places.id"),placesCalls.map(c=>c.mask));
 ok("P8 IRAN: 2 place IDs → 2 new CRM leads for the run city, market IRAN, evidence = location restriction",ir.places?.status==="ok"&&ir.places.new_leads===2&&placesLeads("IRAN").length===2&&placesLeads("IRAN").every(l=>l.meta.city===cityIR&&l.meta.market_evidence==="places_location_restriction"),[ir.places,placesLeads("IRAN").length]);
 ok("P9 ARAB: 2 leads for the Iraq run city, market ARAB, country العراق; no IRAN/ARAB mix",iq.places?.new_leads===2&&placesLeads("ARAB").every(l=>l.meta.city===cityIQ&&l.meta.country==="العراق")&&placesLeads("IRAN").every(l=>l.meta.country==="ایران"),iq.places);
 const L=placesLeads("IRAN")[0];
 ok("P10 Maps terms: only the place ID is stored — no Google name, address, coordinates or types; Maps link built from the ID",L&&/^ChIJ/.test(L.meta.place_id)&&L.contact.startsWith("https://www.google.com/maps/place/?q=place_id:")&&!("lat" in L.meta)&&!("address" in L.meta)&&!("types" in L.meta)&&L.name.includes("(Google Maps)"),L);
 ok("P11 the ledger holds one reservation per request (ids_only, reserved 32000 µUSD, outcome status 200 + results recorded)",ledger().length===2&&ledger().every(x=>x.sku==="ids_only"&&x.reserved_micros===32000&&x.status===200&&x.results===2),ledger());
 ok("P12 no AI draft for Places leads (no OpenAI key here, and Places leads never enter the draft list)",(ir.drafted||0)===0);
 backdate();await tick();
 ok("P13 deduplication: the same place IDs next run update the leads, create none",placesLeads().length===4&&runs("IRAN")[1]?.places?.new_leads===0&&runs("IRAN")[1]?.places?.updated===2,runs("IRAN")[1]?.places);}

// ---- ledger: cap, allowance, concurrency, month reset (fixed clock)
{clearLedger();const nov1=Date.UTC(2026,10,1,10),env=W.env;
 const r1=[];for(let i=0;i<10;i++)r1.push(await PB.reservePlacesRequest(env,{sku:"ids_only",purpose:"t",nowMs:nov1}));
 ok("P14 daily allowance spreads the month: 1 Nov allows floor(8.00/0.032/30)=8 requests, the 9th is refused (daily_allowance)",r1.filter(x=>x.reserved).length===8&&r1[8].reason==="daily_allowance",r1.map(x=>x.reserved?1:x.reason));
 clearLedger();const late=Date.UTC(2026,10,30,10);
 for(let i=0;i<249;i++)dbrun("INSERT INTO system_events(id,type,severity,message,details_json,created_at) VALUES(?,?,?,?,?,?)",["fill"+i,"places_reserved","info","x",JSON.stringify({sku:"ids_only",reserved_micros:32000}),new Date(Date.UTC(2026,10,5)).toISOString()]);
 const par=await Promise.all(Array.from({length:5},()=>PB.reservePlacesRequest(env,{sku:"ids_only",purpose:"race",nowMs:late})));
 ok("P15 near exhaustion + parallel attempts: exactly 1 of 5 fits (249+1=250 × 0.032 = 8.00), the rest refused monthly_budget; total never above cap",par.filter(x=>x.reserved).length===1&&par.filter(x=>!x.reserved).every(x=>x.reason==="monthly_budget")&&ledger().reduce((s,x)=>s+x.reserved_micros,0)<=8000000,par.map(x=>x.reserved?1:x.reason));
 const st=await PB.placesBudgetStatus(env,late);
 ok("P16 status reports the month as exhausted (reserved 8.00 of 8.00)",st.exhausted===true&&st.reserved_usd===8&&st.requests_month===250,st);
 const dec=await PB.reservePlacesRequest(env,{sku:"ids_only",purpose:"t",nowMs:Date.UTC(2026,11,1,0,5)});
 ok("P17 monthly reset: 1 Dec 00:05 UTC starts a new month and a request is reserved again (rows persist in D1, not memory)",dec.reserved===true,dec);
 const ent=await PB.reservePlacesRequest(env,{sku:"enterprise",purpose:"t",nowMs:late});
 ok("P18 the existing CRM Enterprise-SKU path (35000 µUSD) is refused once the month is full",ent.reserved===false&&ent.reason==="monthly_budget",ent);}

// ---- exhaustion during a real run: Places skipped, web discovery continues, watchdog warning, nothing else changes
{clearLedger();for(let i=0;i<250;i++)dbrun("INSERT INTO system_events(id,type,severity,message,details_json,created_at) VALUES(?,?,?,?,?,?)",["full"+i,"places_reserved","info","x",JSON.stringify({sku:"ids_only",reserved_micros:32000}),new Date().toISOString()]);
 const p0=placesCalls.length,g0=googleCalls;backdate();await tick();const last=runs("IRAN").at(-1);
 ok("P19 budget exhausted: no Places request is sent; the run records places=budget_limited",placesCalls.length===p0&&last.places?.status==="budget_limited",last.places);
 ok("P20 web discovery still runs when Places is budget-limited (search engine called)",googleCalls>g0,[g0,googleCalls]);
 const snap=()=>JSON.stringify(q("SELECT key,value FROM autonomy_controls ORDER BY key"));const before=snap();
 const wd=await WD.runWatchdog(W.env);
 ok("P21 Watchdog raises places_budget_exhausted as a WARNING; Watchdog stays healthy",wd.ok&&wd.alerts.includes("places_budget_exhausted")&&wd.healthy===true&&q("SELECT level FROM agent_alerts WHERE code='places_budget_exhausted'")[0]?.level==="warning",wd);
 ok("P22 no agent disabled, no control changed, no approval created",snap()===before&&q("SELECT COUNT(*) n FROM agent_approvals")[0].n===0);
 const st=(await call("/api/ads/markets",null,"GET")).body;
 ok("P23 dashboard status shows the Places budget (enabled, exhausted, cap 8.00)",st.places?.enabled===true&&st.places.exhausted===true&&st.places.effective_cap_usd===8,st.places);}

// ---- timeout accounting and 429 cooldown
{clearLedger();placesMode="timeout";const p0=placesCalls.length;backdate();await tick();placesMode="ok";
 const lg=ledger();
 ok("P24 Places timeout: exactly one attempt per market run (no retry), each reservation kept and marked timeout (cost stays reserved)",placesCalls.length-p0===2&&lg.length===2&&lg.every(x=>x.timeout===1&&x.reserved_micros===32000),lg);
 googleStatus=429;const g0=googleCalls;backdate();await tick();const g1=googleCalls;backdate();await tick();googleStatus=200;
 ok("P25 Google search HTTP 429 → 6-hour cooldown in D1: the next run does not call Google again",g1>g0&&googleCalls===g1&&!!q("SELECT value FROM system_kv WHERE key='web_search_cooldown:www.google.com'")[0],[g0,g1,googleCalls]);}

// ---- Places off: nothing paid
{W.env.ADS_PLACES_DISCOVERY="off";const p0=placesCalls.length;backdate();await tick();
 ok("P26 with ADS_PLACES_DISCOVERY off no Places request is made (Production default)",placesCalls.length===p0);
 ok("P27 no customer message, no OpenAI call and nothing left the in-process mocks",W.offNet().length===0,W.offNet());}
done();
