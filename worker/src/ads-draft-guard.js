// Ads first-contact draft cost guard (Phase 16.16, owner-approved 2026-10-30). The Ads autopilot drafts at most AD_MAX_DRAFTS_PER_RUN
// suggestions per run with OpenAI (Responses API). Before this guard a call carried no output limit and no daily cap; now:
//   • bounded input (each lead field clipped, whole prompt ≤ ADS_DRAFT_PROMPT_MAX characters);
//   • bounded output: max_output_tokens (counts reasoning tokens too) + reasoning.effort "low" (both per the official API contract);
//   • an atomic daily draft cap shared by every run and Worker instance, which is also a per-lead-per-day idempotency key;
//   • usage accounting from the provider's own `usage` object (input, cached input, output, reasoning).
// Drafting stays optional: a lead is saved and attributed before any of this runs, and a skipped or failed draft never stops discovery.
// No dollar budget exists for Ads drafts; this guard bounds tokens and calls, not money.
export const ADS_DRAFT_MAX_OUTPUT_DEFAULT=1500,ADS_DRAFT_MAX_OUTPUT_MIN=256,ADS_DRAFT_MAX_OUTPUT_MAX=4000;
export const ADS_DRAFT_PROMPT_MAX=2400;
const FIELD_MAX=Object.freeze({name:160,website:200,evidence:1200});
const EFFORTS=new Set(["none","low","medium","high"]);

export function adsDraftSettings(env){
  const n=Number(env?.ADS_DRAFT_MAX_OUTPUT_TOKENS);
  const maxOutputTokens=Number.isInteger(n)?Math.min(ADS_DRAFT_MAX_OUTPUT_MAX,Math.max(ADS_DRAFT_MAX_OUTPUT_MIN,n)):ADS_DRAFT_MAX_OUTPUT_DEFAULT;
  const e=String(env?.ADS_DRAFT_REASONING_EFFORT||"low").trim().toLowerCase();
  // "off" omits the reasoning parameter (for a non-reasoning OPENAI_MODEL); an unknown value falls back to "low".
  const reasoningEffort=e==="off"?null:EFFORTS.has(e)?e:"low";
  return {model:env?.OPENAI_MODEL||"gpt-5.6-luna",maxOutputTokens,reasoningEffort};
}

const clip=(v,max)=>{const s=String(v??"").replace(/\s+/g," ").trim();if(s.length<=max)return s;let out="";for(const ch of s){if(out.length+ch.length>max-1)break;out+=ch;}return out+"…";};
export function buildAdsDraftPrompt({language,sourceSite,name,website,evidence}){
  const p=`Create a concise ${language} B2B first-contact draft from HAMZEHI BOX (${sourceSite}), a maker of luxury packaging boxes for gold, jewellery, watch and perfume shops, to this shop. Target: ${clip(name,FIELD_MAX.name)}. Website: ${clip(website,FIELD_MAX.website)}. Evidence: ${clip(evidence,FIELD_MAX.evidence)}. Offer to send packaging samples and a catalogue; logo printing is available. Do not invent facts, prices or discounts. Draft only, under 700 characters.`;
  return p.length<=ADS_DRAFT_PROMPT_MAX?p:clip(p,ADS_DRAFT_PROMPT_MAX);
}
export function adsDraftRequestBody(settings,prompt){
  const body={model:settings.model,input:prompt,max_output_tokens:settings.maxOutputTokens};
  if(settings.reasoningEffort)body.reasoning={effort:settings.reasoningEffort};
  return body;
}
// Provider usage → counts. A response without usage is counted as `usage_missing` (never guessed).
export function adsDraftUsage(data){
  const u=data?.usage;if(!u||typeof u!=="object")return {reported:false,input:0,cached:0,output:0,reasoning:0};
  const int=v=>Number.isFinite(Number(v))&&Number(v)>=0?Math.round(Number(v)):0;
  return {reported:true,input:int(u.input_tokens),cached:int(u.input_tokens_details?.cached_tokens),output:int(u.output_tokens),reasoning:int(u.output_tokens_details?.reasoning_tokens)};
}
// A truncated answer (status "incomplete", e.g. max_output_tokens reached) is never saved as a draft.
export function adsDraftOutcome(data,text){
  if(data?.status==="incomplete")return {ok:false,reason:"incomplete_"+String(data?.incomplete_details?.reason||"unknown").replace(/[^a-z_]/gi,"").slice(0,40)};
  if(!String(text||"").trim())return {ok:false,reason:"empty_output"};
  return {ok:true};
}
export const emptyAdsDraftStats=settings=>({model:settings.model,max_output_tokens:settings.maxOutputTokens,reasoning_effort:settings.reasoningEffort||"off",
  calls:0,input_tokens:0,cached_input_tokens:0,output_tokens:0,reasoning_tokens:0,usage_missing:0,incomplete:0,failed:0,timeouts:0,skipped_daily_cap:0,skipped_already_reserved:0});
export function addAdsDraftUsage(stats,usage){
  if(!usage.reported){stats.usage_missing++;return stats;}
  stats.input_tokens+=usage.input;stats.cached_input_tokens+=usage.cached;stats.output_tokens+=usage.output;stats.reasoning_tokens+=usage.reasoning;return stats;
}
const dayStart=ms=>{const d=new Date(ms);d.setUTCHours(0,0,0,0);return d.toISOString();};
// One atomic statement: reserve one draft for this lead today, only while today's reservations stay below the cap. The row id is the
// lead + UTC day, so two concurrent runs can never both pay for the same lead's draft. Reserved before the call and never released
// (a timed-out call may still have been billed).
export async function reserveAdsDraft(env,{leadId,market,cap,nowMs=Date.now()}){
  const day=dayStart(nowMs),id=`ads-draft:${String(leadId).slice(0,80)}:${day.slice(0,10)}`;
  if(!Number.isInteger(cap)||cap<1)return {reserved:false,reason:"daily_cap"};
  const r=await env.DB.prepare("INSERT OR IGNORE INTO system_events(id,type,severity,message,details_json,created_at) SELECT ?,'ads_draft_reserved','info','Ads AI draft reserved (daily cap)',?,? WHERE (SELECT COUNT(*) FROM system_events WHERE type='ads_draft_reserved' AND created_at>=?)<?")
    .bind(id,JSON.stringify({lead_id:String(leadId).slice(0,80),market,cap}),new Date(nowMs).toISOString(),day,cap).run();
  if(Number(r?.meta?.changes||0)===1)return {reserved:true};
  const dup=await env.DB.prepare("SELECT 1 AS x FROM system_events WHERE id=?").bind(id).first();
  return {reserved:false,reason:dup?"already_reserved":"daily_cap"};
}
export async function adsDraftsToday(env,nowMs=Date.now()){
  try{return Number((await env.DB.prepare("SELECT COUNT(*) n FROM system_events WHERE type='ads_draft_reserved' AND created_at>=?").bind(dayStart(nowMs)).first())?.n||0);}catch{return 0;}
}
