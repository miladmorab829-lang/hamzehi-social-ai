// Google Places discovery with a monthly cost guard (owner budget 2026-10-30: USD 10 per calendar month).
//
// Pricing (Places API (New), Google Maps Platform price list, first volume tier, per request):
//   Text Search Essentials (IDs Only) — fields places.id / places.name only: no charge, unlimited free cap.
//   Text Search Pro        — displayName, formattedAddress, location, types, businessStatus, googleMapsUri …: USD 0.032.
//   Text Search Enterprise — adds phone numbers, websiteUri, rating …:                                     USD 0.035.
// The SKU is set by the response field mask, not by request parameters, so includedType / strictTypeFiltering / locationRestriction
// keep the IDs-only price.
//
// Ledger: one system_events row 'places_reserved' per potentially billable request, inserted atomically BEFORE the request (monthly
// sum + reserved cost ≤ effective cap, and today's count < today's allowance). Rows are never released: a timed-out request may still
// be billed. Months are UTC calendar months; the effective cap keeps a safety margin (default 20%) that also covers the hours between
// the UTC month start and Google's billing month, billing delays and price changes. Until the owner confirms from Google Cloud billing
// that IDs-only requests are free (ADS_PLACES_IDS_ONLY_BILLING_VERIFIED=true), each IDs-only request is reserved at the Pro price.
//
// Storage (Google Maps Platform terms): only the place ID may be stored indefinitely; names, addresses, types and coordinates may not be
// kept in the CRM. Discovery therefore requests and stores the place ID only; the Maps link is built from it.

export const PLACES_SKU_MICROS=Object.freeze({ids_only:0,pro:32000,enterprise:35000});   // micro-USD per request
export const PLACES_DEFAULT_MONTHLY_USD=10,PLACES_DEFAULT_MARGIN=0.2;
const MICROS=1e6;

export function placesBudgetSettings(env={}){
  const usd=Number(env.ADS_PLACES_MONTHLY_BUDGET_USD);
  const monthlyUsd=Number.isFinite(usd)&&usd>=0&&usd<=100?usd:PLACES_DEFAULT_MONTHLY_USD;
  const m=Number(env.ADS_PLACES_BUDGET_MARGIN);
  const margin=Number.isFinite(m)&&m>=0.05&&m<=0.9?m:PLACES_DEFAULT_MARGIN;
  return {monthlyUsd,margin,capMicros:Math.floor(monthlyUsd*(1-margin)*MICROS),
    idsOnlyVerifiedFree:String(env.ADS_PLACES_IDS_ONLY_BILLING_VERIFIED||"").toLowerCase()==="true",
    adsEnabled:String(env.ADS_PLACES_DISCOVERY||"").toLowerCase()==="on"};
}
// Cost reserved for one request of a SKU (conservative for IDs-only until billing has been verified by the owner).
export function placesReserveMicros(sku,settings){
  const list=PLACES_SKU_MICROS[sku];if(list==null)throw new Error("unknown Places SKU "+sku);
  return sku==="ids_only"&&!settings.idsOnlyVerifiedFree?PLACES_SKU_MICROS.pro:list;
}
const monthStartIso=ms=>{const d=new Date(ms);return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1)).toISOString();};
const dayStartIso=ms=>{const d=new Date(ms);d.setUTCHours(0,0,0,0);return d.toISOString();};
const daysLeftInMonth=ms=>{const d=new Date(ms);return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()-d.getUTCDate()+1;};
const SUM_SQL="SELECT COALESCE(SUM(CAST(json_extract(details_json,'$.reserved_micros') AS INTEGER)),0) s,COUNT(*) n FROM system_events WHERE type='places_reserved' AND created_at>=?";

export async function placesBudgetStatus(env,nowMs=Date.now()){
  const st=placesBudgetSettings(env),m=monthStartIso(nowMs),day=dayStartIso(nowMs);
  const month=await env.DB.prepare(SUM_SQL).bind(m).first(),today=await env.DB.prepare(SUM_SQL).bind(day).first();
  const spent=Number(month?.s||0),reserve=placesReserveMicros("ids_only",st);
  return {enabled:st.adsEnabled,month_start:m,monthly_budget_usd:st.monthlyUsd,effective_cap_usd:st.capMicros/MICROS,safety_margin:st.margin,
    reserved_usd:spent/MICROS,requests_month:Number(month?.n||0),requests_today:Number(today?.n||0),
    ids_only_reserved_usd:reserve/MICROS,ids_only_billing_verified:st.idsOnlyVerifiedFree,
    exhausted:reserve>0&&spent+reserve>st.capMicros};
}
// Atomic reservation before one potentially billable request. Today's allowance spreads what is left of the month over the days left,
// so the budget cannot be spent in the first days. Returns {reserved,id} or {reserved:false,reason:"monthly_budget"|"daily_allowance"}.
export async function reservePlacesRequest(env,{sku,purpose,market=null,nowMs=Date.now()}={}){
  const st=placesBudgetSettings(env),cost=placesReserveMicros(sku,st),m=monthStartIso(nowMs),day=dayStartIso(nowMs);
  const before=Number((await env.DB.prepare("SELECT COALESCE(SUM(CAST(json_extract(details_json,'$.reserved_micros') AS INTEGER)),0) s FROM system_events WHERE type='places_reserved' AND created_at>=? AND created_at<?").bind(m,day).first())?.s||0);
  const left=st.capMicros-before;
  if(cost>0&&left<cost)return {reserved:false,reason:"monthly_budget"};
  const allowance=cost>0?Math.max(1,Math.floor(left/cost/daysLeftInMonth(nowMs))):1e6;
  const id=crypto.randomUUID(),t=new Date(nowMs).toISOString();
  const details=JSON.stringify({sku,reserved_micros:cost,list_micros:PLACES_SKU_MICROS[sku],purpose:String(purpose||"").slice(0,40),market,month:m.slice(0,7)});
  const r=await env.DB.prepare("INSERT INTO system_events(id,type,severity,message,details_json,created_at) SELECT ?,'places_reserved','info','Google Places request reserved (monthly budget)',?,? "
    +"WHERE (SELECT COALESCE(SUM(CAST(json_extract(details_json,'$.reserved_micros') AS INTEGER)),0) FROM system_events WHERE type='places_reserved' AND created_at>=?)+?<=? "
    +"AND (SELECT COUNT(*) FROM system_events WHERE type='places_reserved' AND created_at>=?)<?")
    .bind(id,details,t,m,cost,st.capMicros,day,allowance).run();
  if(Number(r?.meta?.changes||0)===1)return {reserved:true,id,reserved_micros:cost};
  const now=Number((await env.DB.prepare(SUM_SQL).bind(m).first())?.s||0);
  return {reserved:false,reason:now+cost>st.capMicros?"monthly_budget":"daily_allowance"};
}
// Records the request's outcome on its reservation row (reconciliation evidence: status, results, timeout). Never changes the cost.
export async function finishPlacesRequest(env,id,outcome={}){
  try{await env.DB.prepare("UPDATE system_events SET details_json=json_set(details_json,'$.status',?,'$.results',?,'$.timeout',?) WHERE id=? AND type='places_reserved'")
    .bind(outcome.status??null,Number(outcome.results||0),outcome.timeout?1:0,id).run();}catch{}
}

// City rectangles (approximate city extents, WGS84) for locationRestriction: Places returns only places INSIDE the rectangle, which is
// the geographic evidence for the run's city and country. Keyed by the canonical city name of ADS_TARGET_CITIES.
const box=(lat,lng,d)=>({low:{latitude:+(lat-d).toFixed(4),longitude:+(lng-d).toFixed(4)},high:{latitude:+(lat+d).toFixed(4),longitude:+(lng+d).toFixed(4)}});
export const PLACES_CITY_BOUNDS=Object.freeze({
  "تهران":box(35.6892,51.3890,0.25),"اصفهان":box(32.6546,51.6680,0.15),"شیراز":box(29.5918,52.5837,0.15),"مشهد":box(36.2605,59.6168,0.15),
  "تبریز":box(38.0800,46.2919,0.12),"کرج":box(35.8400,50.9391,0.12),"قم":box(34.6399,50.8759,0.12),"اهواز":box(31.3183,48.6706,0.12),
  "رشت":box(37.2808,49.5832,0.10),"کرمان":box(30.2839,57.0834,0.10),"یزد":box(31.8974,54.3569,0.10),
  "بغداد":box(33.3152,44.3661,0.25),"أربيل":box(36.1911,44.0092,0.12),"البصرة":box(30.5085,47.7804,0.12),"النجف":box(32.0259,44.3462,0.10),
  "كربلاء":box(32.6160,44.0249,0.10),"السليمانية":box(35.5613,45.4374,0.10),"الموصل":box(36.3350,43.1189,0.12),"كركوك":box(35.4681,44.3922,0.10),
  "دهوك":box(36.8669,42.9503,0.08),"الناصرية":box(31.0439,46.2576,0.08)
});
// IDs-only Text Search request for jewelry stores in ONE city (strict type filter + location restriction). Pure: returns the body.
export function placesIdsOnlyRequest({market,city}){
  const rect=PLACES_CITY_BOUNDS[city];if(!rect)return null;
  const iraq=market==="ARAB";
  return {textQuery:iraq?`محل ذهب مجوهرات ${city}`:`طلافروشی جواهرفروشی ${city}`,includedType:"jewelry_store",strictTypeFiltering:true,
    locationRestriction:{rectangle:rect},languageCode:iraq?"ar":"fa",regionCode:iraq?"iq":"ir",pageSize:20};
}
const PLACE_ID=/^[A-Za-z0-9_-]{10,300}$/;
export const placesMapsUrl=id=>`https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(id)}`;
// One reserved, bounded, non-retried IDs-only search. Returns {ok, place_ids[], status, reason}.
export async function placesIdsOnlySearch(env,{market,city,purpose="ads_discovery",timeoutMs=10000,fetchImpl=fetch}){
  if(!env.GOOGLE_PLACES_API_KEY)return {ok:false,reason:"not_configured",place_ids:[]};
  const body=placesIdsOnlyRequest({market,city});if(!body)return {ok:false,reason:"city_bounds_missing",place_ids:[]};
  const slot=await reservePlacesRequest(env,{sku:"ids_only",purpose,market});
  if(!slot.reserved)return {ok:false,reason:slot.reason,budget_limited:true,place_ids:[]};
  let r;
  try{r=await fetchImpl("https://places.googleapis.com/v1/places:searchText",{method:"POST",headers:{"Content-Type":"application/json","X-Goog-Api-Key":env.GOOGLE_PLACES_API_KEY,"X-Goog-FieldMask":"places.id"},body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});}
  catch(e){const timeout=/timeout|abort/i.test(String(e?.name||e?.message||e));await finishPlacesRequest(env,slot.id,{status:null,timeout});return {ok:false,reason:timeout?"timeout":"fetch_failed",place_ids:[]};}
  const d=await r.json().catch(()=>({}));
  const ids=r.ok?[...new Set((d.places||[]).map(p=>String(p?.id||"")).filter(x=>PLACE_ID.test(x)))]:[];
  await finishPlacesRequest(env,slot.id,{status:r.status,results:ids.length});
  return r.ok?{ok:true,status:r.status,place_ids:ids}:{ok:false,status:r.status,reason:"http_"+r.status,place_ids:[]};
}

// Web search cooldown: after HTTP 429 a search engine is skipped for 6 hours (shared in D1 system_kv, survives isolates).
export const WEB_SEARCH_COOLDOWN_MS=6*3600*1000;
export async function webSearchCoolingDown(env,host,nowMs=Date.now()){
  try{const v=(await env.DB.prepare("SELECT value FROM system_kv WHERE key=?").bind("web_search_cooldown:"+host).first())?.value;return !!v&&Date.parse(v)>nowMs;}catch{return false;}
}
export async function startWebSearchCooldown(env,host,nowMs=Date.now()){
  try{const t=new Date(nowMs).toISOString();await env.DB.prepare("INSERT OR REPLACE INTO system_kv(key,value,updated_at) VALUES(?,?,?)").bind("web_search_cooldown:"+host,new Date(nowMs+WEB_SEARCH_COOLDOWN_MS).toISOString(),t).run();}catch{}
}
