// Dual-market Ads (Phase 09.4): IRAN (Persian, TOMAN) and ARAB = Iraq (Iraqi Arabic, USD) are configured, enabled and limited
// independently. Market ids follow the CRM convention (lead_quotes.market, MARKET_CURRENCY in autonomy-engine.js). Each market lives in
// its own system_kv row ("ads_market:IRAN" / "ads_market:ARAB"); a missing row is a DISABLED market with no city and no limit — nothing
// is invented. The legacy row 'ads_autopilot_config' is never written or converted here and no longer starts any Ads run.
export const ADS_MARKET_IDS=Object.freeze(["IRAN","ARAB"]);
export const ADS_MARKETS=Object.freeze({
  IRAN:Object.freeze({id:"IRAN",label_fa:"ایران",country:"ایران",language:"Persian",currency:"TOMAN",group_suffix:"_fa"}),
  ARAB:Object.freeze({id:"ARAB",label_fa:"عراق",country:"العراق",language:"Iraqi Arabic",currency:"USD",group_suffix:"_ar"})
});
export const ADS_MARKET_TYPES=Object.freeze(["gold","perfume","watch","fashion_jewelry","all"]);
export const adsMarketKey=m=>"ads_market:"+m;

// ---- Ads targeting cities (Phase 04 list, unchanged; keyed by CRM market id) ----
export const ADS_TARGET_CITIES={
  IRAN:[["تهران","tehran"],["اصفهان","isfahan","esfahan"],["شیراز","shiraz"],["مشهد","mashhad"],["تبریز","tabriz"],["کرج","karaj"],["قم","qom"],["اهواز","ahvaz"],["رشت","rasht"],["کرمان","kerman"],["یزد","yazd"]],
  ARAB:[["بغداد","baghdad"],["أربيل","اربيل","هولير","erbil","arbil"],["البصرة","بصرة","basra","basrah"],["النجف","نجف","najaf"],["كربلاء","كربلا","karbala"],["السليمانية","سليمانية","sulaymaniyah","sulaimani"],["الموصل","موصل","mosul"],["كركوك","kirkuk"],["دهوك","duhok"],["الناصرية","nasiriyah"]]
};
export function adsNormalizeText(s){return String(s||"").toLowerCase().replace(/[كک]/g,"ک").replace(/[يىی]/g,"ی").replace(/[أإآ]/g,"ا").replace(/ة/g,"ه").replace(/[ً-ْـ]/g,"");}
export function adsTargetCity(value){
  const v=adsNormalizeText(String(value||"").trim());if(!v)return null;
  for(const market of ADS_MARKET_IDS)for(const names of ADS_TARGET_CITIES[market])if(names.some(n=>adsNormalizeText(n)===v))return {market,city:names[0],names};
  return null;
}
// A city counts for a market only when it is on THAT market's list (Baghdad is never an IRAN target and vice versa).
export function adsTargetCityInMarket(value,market){const t=adsTargetCity(value);return t&&t.market===market?t:null;}
export const adsCityOptions=market=>(ADS_TARGET_CITIES[market]||[]).map(n=>n[0]);

// CRM market id from any spelling used in leads, quotes or requests ("iraq", "iq", "العراق" → ARAB); anything else → null.
export function normalizeAdsMarket(value){
  const x=String(value||"").normalize("NFKC").trim().toLowerCase();
  if(["iran","ir","ایران"].includes(x))return "IRAN";
  if(["arab","iraq","iq","عراق","العراق"].includes(x))return "ARAB";
  return null;
}
// Market of a lead for CRM attribution and reporting: the owner-set market wins, then the recorded country, then the Ads target market.
// Country and Ads market that disagree → CONFLICT; no evidence → UNKNOWN (historical leads are never guessed or rewritten).
export function leadMarketOf(meta={}){
  const owner=normalizeAdsMarket(meta.market);if(owner)return owner;
  const country=normalizeAdsMarket(meta.country),ads=normalizeAdsMarket(meta.target_market);
  if(country&&ads&&country!==ads)return "CONFLICT";
  return country||ads||"UNKNOWN";
}

// Stored config → normalized config. Unknown fields are dropped; a malformed row reads as disabled.
export function adsMarketConfig(market,raw){
  let v={};try{v=typeof raw==="string"?JSON.parse(raw||"{}"):(raw||{});}catch{v={};}
  if(!v||typeof v!=="object"||Array.isArray(v))v={};
  const lim=Number(v.runs_per_day);
  return {market,enabled:v.enabled===true,city:String(v.city||"").trim().slice(0,100),type:ADS_MARKET_TYPES.includes(v.type)?v.type:"all",
    extra:String(v.extra||"").trim().slice(0,300),runs_per_day:Number.isInteger(lim)&&lim>0?lim:null,
    approved_by:v.approved_by||null,approved_at:v.approved_at||null,updated_at:v.updated_at||null};
}
export async function readAdsMarketConfigs(env){
  const out=Object.fromEntries(ADS_MARKET_IDS.map(m=>[m,adsMarketConfig(m,null)]));
  try{
    const rows=(await env.DB.prepare("SELECT key,value,updated_at FROM system_kv WHERE key IN (?,?)").bind(adsMarketKey("IRAN"),adsMarketKey("ARAB")).all()).results||[];
    for(const r of rows){const m=String(r.key).slice("ads_market:".length);if(out[m])out[m]={...adsMarketConfig(m,r.value),updated_at:r.updated_at||null};}
  }catch{}
  return out;
}
// Readiness of one market: every code is listed; the market runs only when there is none.
export function adsMarketReadiness(cfg,globalCap){
  const codes=[];
  if(!cfg.enabled)codes.push("ADS_MARKET_DISABLED");
  if(!cfg.city)codes.push("ADS_CITY_EMPTY");else if(!adsTargetCityInMarket(cfg.city,cfg.market))codes.push("ADS_CITY_INVALID");
  if(cfg.runs_per_day==null)codes.push("ADS_LIMIT_MISSING");else if(Number.isFinite(globalCap)&&cfg.runs_per_day>globalCap)codes.push("ADS_LIMIT_ABOVE_GLOBAL");
  return {ready:codes.length===0,codes};
}
// Owner update of one market (POST /api/ads/markets/config). Disabling never needs approval; any result that leaves the market ENABLED
// needs owner_approved:true, a city of that market and an owner-set daily run limit within the global Ads cap.
export function validateAdsMarketUpdate(body,current,globalCap,at){
  const b=body&&typeof body==="object"?body:{};
  const market=normalizeAdsMarket(b.market);if(!market)return {ok:false,reason:"ads_market_invalid",error:"بازار نامعتبر است (IRAN یا ARAB)"};
  const next={...current,market};
  if("enabled" in b){if(typeof b.enabled!=="boolean")return {ok:false,reason:"ads_enabled_invalid",error:"enabled باید true یا false باشد"};next.enabled=b.enabled;}
  if("city" in b){
    const raw=String(b.city||"").trim();
    if(raw){const t=adsTargetCityInMarket(raw,market);if(!t)return {ok:false,reason:"ads_city_not_in_market",error:"این شهر در فهرست شهرهای این بازار نیست"};next.city=t.city;}
    else next.city="";
  }
  if("runs_per_day" in b){
    if(b.runs_per_day===null)next.runs_per_day=null;
    else{const n=Number(b.runs_per_day);if(!Number.isInteger(n)||n<1||n>globalCap)return {ok:false,reason:"ads_limit_invalid",error:`سقف اجرای روزانه باید عدد صحیح بین 1 و ${globalCap} باشد`};next.runs_per_day=n;}
  }
  if("type" in b){if(!ADS_MARKET_TYPES.includes(b.type))return {ok:false,reason:"ads_type_invalid",error:"نوع مشتری نامعتبر است"};next.type=b.type;}
  if("extra" in b){const e=String(b.extra||"").trim();if(e.length>300)return {ok:false,reason:"ads_extra_too_long",error:"جزئیات نباید بیشتر از 300 کاراکتر باشد"};next.extra=e;}
  if(next.enabled){
    if(b.owner_approved!==true)return {ok:false,reason:"owner_approval_required",error:"روشن کردن یا تغییر بازار فعال، تأیید صریح مالک (owner_approved) لازم دارد"};
    const r=adsMarketReadiness(next,globalCap);if(!r.ready)return {ok:false,reason:"ads_market_not_ready",codes:r.codes,error:"برای روشن کردن، شهر معتبر همین بازار و سقف اجرای روزانه لازم است"};
    next.approved_by="owner";next.approved_at=at;
  }
  next.updated_at=at;
  const {market:_m,updated_at:_u,...stored}=next;
  return {ok:true,market,config:next,stored:{...stored,updated_at:at}};
}
