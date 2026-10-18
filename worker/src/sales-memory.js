// ============================================================================================================================
// MEM-02 — memory foundation & duplicate safety.
//   * single-flight leases (ai_call_flights): one owner per key across every Worker instance (D1 has one primary, so the
//     claim / takeover statements are atomic), a fencing token so a stale Worker can never overwrite a newer owner, crash /
//     timeout recovery by lease expiry, a bounded number of attempts, and a recorded result that a retry reuses.
//   * usage ledger (ai_usage_ledger): one row per provider attempt (or reuse), real provider token counts kept apart from the
//     cost ESTIMATE (versioned tariff), no message or reply text.
//   * knowledge version: a content fingerprint of every table the sales answers are read from (not MAX(updated_at)).
//   * concept key: the canonical key future shared memory (MEM-03+) will use; colour placement stays top / middle / bottom.
// Nothing here answers a customer, prices, confirms payments or orders, or shares data between customers.
// ============================================================================================================================

const nowIso=()=>new Date().toISOString();
const plus=ms=>new Date(Date.now()+ms).toISOString();
const token=()=>crypto.randomUUID();
const missingTable=e=>/no such table/i.test(String(e?.message||e));

// ---- single-flight ---------------------------------------------------------------------------------------------------------
// What this guarantees and what it does NOT:
//   * at most ONE recorded result per key, written by the current fence holder (stale writes are rejected) — always;
//   * at most ONE provider call in flight per key while its owner is alive: the owner RENEWS its lease while the call runs, so a
//     slow call never looks crashed; a waiter waits for the result instead of calling in parallel;
//   * NOT exactly-once towards the provider: if the owner dies (or cannot renew) the lease expires and one more call can be made
//     — bounded by maxAttempts, counted for crashed, failed and timed-out attempts alike; a call abandoned on timeout may still be
//     billed by the provider; a crash between the provider's answer and the result write pays again.
export const FLIGHT_DEFAULTS={
  sales_brain:{leaseMs:25000,reuseMs:30*60000,maxAttempts:2},        // ≥ provider timeout (≤ 15 s) + margin; a retry reuses for 30 min
  inbound_processing:{leaseMs:60000,reuseMs:0,maxAttempts:3}          // one inbound message is processed by one Worker at a time
};
let flightsReady=false;
async function flightsAvailable(env){
  if(flightsReady)return true;
  try{await env.DB.prepare("SELECT flight_key FROM ai_call_flights LIMIT 0").all();flightsReady=true;return true;}catch(e){if(missingTable(e))return false;throw e;}
}
// A table that disappears (rollback) is not an error: the caller falls back to today's behaviour.
const flightSafe=async fn=>{try{return await fn();}catch(e){if(missingTable(e)){flightsReady=false;return {unavailable:true};}throw e;}};
// → {role:"owner",token,fence,attempt} | {role:"reuse",result} | {role:"done"} | {role:"busy",lease_until} | {role:"exhausted"}
//   | {role:"unavailable"} (the table is not migrated / was rolled back: callers keep today's behaviour)
export async function claimFlight(env,{key,purpose,leadId=null,conversationId=null,inboxId=null,provider=null,requestedModel=null,leaseMs=null,maxAttempts=null}){
  if(!(await flightsAvailable(env)))return {role:"unavailable"};
  const cfg=FLIGHT_DEFAULTS[purpose]||FLIGHT_DEFAULTS.sales_brain,lease=leaseMs??cfg.leaseMs,max=maxAttempts??cfg.maxAttempts;
  const out=await flightSafe(async()=>{
    const t=nowIso(),tok=token();
    const ins=await env.DB.prepare(`INSERT INTO ai_call_flights(flight_key,purpose,lead_id,conversation_id,inbox_message_id,status,owner_token,fence,attempt,lease_until,expires_at,provider,requested_model,created_at,updated_at)
      VALUES(?,?,?,?,?,'running',?,1,1,?,NULL,?,?,?,?) ON CONFLICT(flight_key) DO NOTHING`).bind(key,purpose,leadId,conversationId,inboxId,tok,plus(lease),provider,requestedModel,t,t).run();
    if(Number(ins?.meta?.changes)===1)return {role:"owner",token:tok,fence:1,attempt:1};
    // Takeover — exactly one Worker wins (single UPDATE): an expired lease (crashed owner) or a failed attempt, both only below
    // the attempt cap, or a recorded result past its reuse window (a fresh generation). The fence increments, so the previous
    // owner's late writes are rejected.
    const up=await env.DB.prepare(`UPDATE ai_call_flights SET status='running',owner_token=?,fence=fence+1,attempt=CASE WHEN status='succeeded' THEN 1 ELSE attempt+1 END,lease_until=?,error_code=NULL,updated_at=?
      WHERE flight_key=? AND ((((status='running' AND lease_until<=?) OR status='failed') AND attempt<?) OR (status='succeeded' AND expires_at IS NOT NULL AND expires_at<=?))`)
      .bind(tok,plus(lease),t,key,t,max,t).run();
    const row=await env.DB.prepare("SELECT status,owner_token,fence,attempt,lease_until,expires_at,result_json FROM ai_call_flights WHERE flight_key=?").bind(key).first();
    if(Number(up?.meta?.changes)===1&&row?.owner_token===tok)return {role:"owner",token:tok,fence:Number(row.fence),attempt:Number(row.attempt)};
    if(row?.status==="succeeded"){let result=null;try{result=row.result_json?JSON.parse(row.result_json):null;}catch{}return result?{role:"reuse",result,fence:Number(row.fence)}:{role:"done",fence:Number(row.fence)};}
    if(row?.status==="running"&&String(row.lease_until)>t)return {role:"busy",lease_until:row.lease_until};
    return {role:"exhausted",attempt:Number(row?.attempt||0)};
  });
  return out.unavailable?{role:"unavailable"}:out;
}
// Fenced writes: only the CURRENT owner (same token and fence, still running) may extend, complete or fail the flight.
export async function renewFlight(env,{key,token:tok,fence,leaseMs}){
  const r=await flightSafe(()=>env.DB.prepare(`UPDATE ai_call_flights SET lease_until=?,updated_at=? WHERE flight_key=? AND owner_token=? AND fence=? AND status='running'`).bind(plus(leaseMs),nowIso(),key,tok,fence).run());
  return Number(r?.meta?.changes)===1;
}
export async function completeFlight(env,{key,purpose,token:tok,fence,result=null,returnedModel=null}){
  const cfg=FLIGHT_DEFAULTS[purpose]||FLIGHT_DEFAULTS.sales_brain,t=nowIso();
  const r=await flightSafe(()=>env.DB.prepare(`UPDATE ai_call_flights SET status='succeeded',result_json=?,returned_model=?,expires_at=?,lease_until=?,updated_at=? WHERE flight_key=? AND owner_token=? AND fence=? AND status='running'`)
    .bind(result===null?null:JSON.stringify(result),returnedModel,cfg.reuseMs?plus(cfg.reuseMs):null,t,t,key,tok,fence).run());
  return Number(r?.meta?.changes)===1;
}
export async function failFlight(env,{key,token:tok,fence,errorCode}){
  const t=nowIso();
  const r=await flightSafe(()=>env.DB.prepare(`UPDATE ai_call_flights SET status='failed',error_code=?,lease_until=?,updated_at=? WHERE flight_key=? AND owner_token=? AND fence=? AND status='running'`)
    .bind(String(errorCode||"error").slice(0,60),t,t,key,tok,fence).run());
  return Number(r?.meta?.changes)===1;
}
export async function readFlight(env,key){
  const r=await flightSafe(()=>env.DB.prepare("SELECT * FROM ai_call_flights WHERE flight_key=?").bind(key).first());
  return r&&!r.unavailable?r:null;
}

// The provider call under a per-inbox single-flight. The result is persisted IMMEDIATELY after the provider answers (before
// any other work), so a later crash / retry reuses it instead of paying again. While the call runs the owner renews its lease
// (every leaseMs / 3, as long as this Worker is alive — the provider call has its own timeout; a dead Worker simply stops
// renewing), so a slow provider never hands the key to a second caller.
export async function salesAiSingleFlight(env,{key,row,provider,requestedModel,call,leaseMs=FLIGHT_DEFAULTS.sales_brain.leaseMs,maxAttempts=FLIGHT_DEFAULTS.sales_brain.maxAttempts,maxCallMs=null,waitMs=null,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
  const purpose="sales_brain",ids={leadId:row?.lead_id||null,conversationId:row?.conversation_id||null,inboxId:row?.id||null},claimArgs={key,purpose,...ids,provider,requestedModel,leaseMs,maxAttempts};
  let claim=await claimFlight(env,claimArgs);
  // Another Worker holds the lease right now: wait (bounded) for its recorded result instead of calling the provider in parallel.
  const deadline=Date.now()+(waitMs??leaseMs),poll=Math.max(20,Math.min(250,Math.floor(leaseMs/5)));
  while(claim.role==="busy"&&Date.now()<deadline){await sleep(poll);claim=await claimFlight(env,claimArgs);}
  if(claim.role==="unavailable"){
    let res;try{res=await call();}catch(error){await recordAiUsage(env,{...ids,provider,requestedModel,res:{ok:false,error:"provider_exception"},outcome:"error",attempt:1,flightKey:null});throw error;}
    await recordAiUsage(env,{...ids,provider,requestedModel,res,outcome:res.ok?"success":"error",attempt:1,flightKey:null});return {...res,flight:{role:"unavailable"}};
  }
  if(claim.role==="reuse"){await recordAiUsage(env,{...ids,provider,requestedModel,res:{ok:true,model:claim.result.model,returned_model:claim.result.returned_model},outcome:"reused",attempt:0,flightKey:key,noTokens:true});return {...claim.result,ms:0,flight:{role:"reuse",fence:claim.fence}};}
  if(claim.role!=="owner")return {ok:false,model:requestedModel,ms:0,error:claim.role==="busy"?"single_flight_busy":"single_flight_"+claim.role,flight:{role:claim.role}};
  // lease renewal while the provider call runs
  let running=true,renewLost=false;const renewUntil=maxCallMs===null?Infinity:Date.now()+maxCallMs;
  (async()=>{while(running){await sleep(Math.max(20,Math.floor(leaseMs/3)));if(!running||Date.now()>renewUntil)return;if(!(await renewFlight(env,{key,token:claim.token,fence:claim.fence,leaseMs}).catch(()=>false))){renewLost=true;return;}}})();
  let res;
  try{res=await call();}
  catch(error){running=false;await failFlight(env,{key,token:claim.token,fence:claim.fence,errorCode:"provider_exception"}).catch(()=>false);
    await recordAiUsage(env,{...ids,provider,requestedModel,res:{ok:false,error:"provider_exception"},outcome:"error",attempt:claim.attempt,flightKey:key});throw error;}
  finally{running=false;}
  const stored=res.ok?{ok:true,model:res.model,returned_model:res.returned_model||null,decision:res.decision,usage:res.usage||null}:null;
  const written=res.ok?await completeFlight(env,{key,purpose,token:claim.token,fence:claim.fence,result:stored,returnedModel:res.returned_model||null}):await failFlight(env,{key,token:claim.token,fence:claim.fence,errorCode:res.error});
  await recordAiUsage(env,{...ids,provider,requestedModel,res,outcome:res.ok?"success":"error",attempt:claim.attempt,flightKey:key,fenced:!written});
  if(!written){
    // Fenced out (a newer owner exists): its recorded result wins, so every path acts on ONE decision — the cost of this
    // call was still paid (recorded with fenced_out = 1).
    const cur=await readFlight(env,key);let winner=null;try{winner=cur?.status==="succeeded"&&cur.result_json?JSON.parse(cur.result_json):null;}catch{}
    if(winner)return {...winner,ms:res.ms,flight:{role:"stale_reused_winner",fence:claim.fence,renew_lost:renewLost}};
    return {...res,flight:{role:"stale",fence:claim.fence,renew_lost:renewLost}};
  }
  return {...res,flight:{role:"owner",fence:claim.fence,attempt:claim.attempt}};
}

// ---- retention / cleanup ----------------------------------------------------------------------------------------------------
// ai_call_flights holds per-inbox decisions (AI reply, facts read from that customer's own message). Policy:
//   * result_json is cleared once its reuse window ended + 1 h (nothing can reuse it any more; a later retry calls afresh);
//   * whole rows are deleted after 7 days without change (Telegram redelivers an update for at most ~24 h);
//   * a RUNNING row whose lease is still alive is never touched; failed rows keep their attempt counter for 7 days.
// Bounded per run (cron), idempotent, and never touches any other table.
export const FLIGHT_RETENTION={resultGraceMs:3600000,rowMs:7*86400000,batch:200};
export async function purgeAiCallFlights(env,{now=Date.now(),batch=FLIGHT_RETENTION.batch}={}){
  const iso=ms=>new Date(ms).toISOString(),t=iso(now);
  const out=await flightSafe(async()=>{
    const cleared=await env.DB.prepare(`UPDATE ai_call_flights SET result_json=NULL,updated_at=? WHERE flight_key IN (SELECT flight_key FROM ai_call_flights WHERE result_json IS NOT NULL AND status='succeeded' AND expires_at IS NOT NULL AND expires_at<=? LIMIT ?)`)
      .bind(t,iso(now-FLIGHT_RETENTION.resultGraceMs),batch).run();
    const deleted=await env.DB.prepare(`DELETE FROM ai_call_flights WHERE flight_key IN (SELECT flight_key FROM ai_call_flights WHERE updated_at<=? AND NOT (status='running' AND lease_until>?) LIMIT ?)`)
      .bind(iso(now-FLIGHT_RETENTION.rowMs),t,batch).run();
    return {cleared:Number(cleared?.meta?.changes||0),deleted:Number(deleted?.meta?.changes||0)};
  });
  return out.unavailable?{cleared:0,deleted:0,unavailable:true}:out;
}

// ---- usage ledger ---------------------------------------------------------------------------------------------------------
// Versioned tariff (USD per million tokens), from the provider's published price list. A model without a tariff gets no cost.
export const SALES_AI_TARIFFS=[
  {version:"anthropic-2026-10-18",provider:"anthropic",model:"claude-opus-5-5",input:4,output:20,cache_write_5m:5,cache_write_1h:8,cache_read:0.2,source:"platform.claude.com/docs/en/about-claude/pricing (read 2026-10-18)"}
];
export function salesAiTariff(provider,model){return SALES_AI_TARIFFS.find(t=>t.provider===provider&&t.model===model)||null;}
// $ per MTok == µ$ per token → the estimate in micro-USD is an integer sum (no float drift for the totals).
// Nothing is assumed to be zero: without BOTH input and output counts there is no estimate (null → cost 'unknown'). Cache
// counts the provider did not report are left out and the estimate is marked partial (see salesAiCostEstimate).
const isCount=v=>Number.isSafeInteger(v)&&v>=0;
export function salesAiCostEstimate(usage,tariff){
  if(!usage||!tariff)return {micro:null,status:"unknown"};
  if(!isCount(usage.input_tokens)||!isCount(usage.output_tokens))return {micro:null,status:"unknown_partial_usage"};
  const cc=usage.cache_creation&&typeof usage.cache_creation==="object"?usage.cache_creation:null;
  const w5=cc?cc.ephemeral_5m_input_tokens:usage.cache_creation_input_tokens,w1=cc?cc.ephemeral_1h_input_tokens:0,r=usage.cache_read_input_tokens;
  const cacheKnown=isCount(w5)&&isCount(w1)&&isCount(r);
  const micro=Math.round(usage.input_tokens*tariff.input+usage.output_tokens*tariff.output+(isCount(w5)?w5:0)*tariff.cache_write_5m+(isCount(w1)?w1:0)*tariff.cache_write_1h+(isCount(r)?r:0)*tariff.cache_read);
  return {micro,status:cacheKnown?"estimated":"estimated_cache_unreported"};
}
export function estimateCostMicroUsd(usage,tariff){return salesAiCostEstimate(usage,tariff).micro;}
let ledgerColumns=null;
async function ledgerReady(env){
  if(ledgerColumns)return ledgerColumns;
  try{const r=await env.DB.prepare("PRAGMA table_info(ai_usage_ledger)").all();const cols=new Set((r.results||[]).map(c=>c.name));if(!cols.size)return null;if(cols.has("outcome"))ledgerColumns=cols;return cols;}catch{return null;}
}
// One row per provider attempt (success / error) or per reuse. Real token counts only when the provider reported them
// (usage_source='provider'); otherwise tokens stay NULL and the cost is not estimated (cost_status='unknown').
export async function recordAiUsage(env,{leadId=null,conversationId=null,inboxId=null,provider,requestedModel,res,outcome,attempt=1,flightKey=null,fenced=false,noTokens=false,module="sales_ai",task="sales_brain"}){
  try{
    const cols=await ledgerReady(env);if(!cols)return false;
    const u=noTokens?null:res?.usage||null,tariff=salesAiTariff(provider,requestedModel),est=u?salesAiCostEstimate(u,tariff):{micro:null,status:"unknown"},cost=est.micro;
    const cc=u?.cache_creation&&typeof u.cache_creation==="object"?u.cache_creation:null;
    const cacheWrite=u?(cc?(isCount(cc.ephemeral_5m_input_tokens)&&isCount(cc.ephemeral_1h_input_tokens)?cc.ephemeral_5m_input_tokens+cc.ephemeral_1h_input_tokens:null):(isCount(u.cache_creation_input_tokens)?u.cache_creation_input_tokens:null)):null;
    const base={id:"aiu-"+token(),module,task,provider:provider||null,model:requestedModel||null,input_tokens:u?.input_tokens??null,output_tokens:u?.output_tokens??null,
      cost_status:outcome==="reused"?"none_reused":est.status,cost_minor:cost===null?null:Math.round(cost/10000),cost_currency:cost===null?null:"USD",
      lead_id:leadId,conversation_id:conversationId,quote_id:null,order_id:null,created_at:nowIso()};
    const ext={returned_model:res?.returned_model||null,cache_creation_input_tokens:cacheWrite,cache_read_input_tokens:isCount(u?.cache_read_input_tokens)?u.cache_read_input_tokens:null,usage_source:u?"provider":"none",
      cost_estimate_micro_usd:cost,tariff_version:cost===null?null:tariff.version,outcome,error_code:res?.ok?null:(res?.error?String(res.error).slice(0,60):null),attempt,
      flight_key:flightKey,inbox_message_id:inboxId,latency_ms:Number.isFinite(res?.ms)?res.ms:null,fenced_out:fenced?1:0};
    const row={...base,...Object.fromEntries(Object.entries(ext).filter(([k])=>cols.has(k)))};
    const keys=Object.keys(row);
    await env.DB.prepare(`INSERT INTO ai_usage_ledger(${keys.join(",")}) VALUES(${keys.map(()=>"?").join(",")})`).bind(...keys.map(k=>row[k])).run();
    return true;
  }catch{return false;}
}

// ---- knowledge version ------------------------------------------------------------------------------------------------------
// A CONTENT fingerprint (SHA-256 of every relevant row, every column) of the tables the sales answers read: approved list
// prices, SI catalog / configurations / prices / attribute schema / settings, approved knowledge (colours, printing, rules),
// gallery specs, media eligibility and media storage. Any insert, update, deactivation or delete changes it — it does not
// depend on updated_at being maintained by every write path. Market-scoped tables contribute only their market + GLOBAL.
export const KNOWLEDGE_VERSION_SOURCES=[
  {table:"commercial_price_items",component:"prices",market:"market"},
  {table:"price_versions",component:"prices",market:"market"},
  {table:"product_catalog",component:"products"},
  {table:"product_configurations",component:"products",market:"market"},
  {table:"product_attribute_schema",component:"products"},
  {table:"business_settings",component:"settings"},
  {table:"sales_knowledge_facts",component:"knowledge",market:"market"},
  {table:"gallery_photo_specs",component:"photos",market:"market"},
  {table:"visual_product_media",component:"photos"},
  {table:"visual_media_storage",component:"photos"}
];
async function sha256Hex(text){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");}
export async function knowledgeVersion(env,market){
  const m=["IRAN","ARAB"].includes(market)?market:null,parts={};
  for(const s of KNOWLEDGE_VERSION_SOURCES){
    let rows;
    try{
      const where=s.market?(m?` WHERE ${s.market} IN (?,'GLOBAL')`:` WHERE ${s.market}='GLOBAL'`):"";
      rows=(await env.DB.prepare(`SELECT * FROM ${s.table}${where} ORDER BY id`).bind(...(s.market&&m?[m]:[])).all()).results||[];
    }catch(e){if(missingTable(e)){rows=null;}else throw e;}
    const text=rows===null?"(absent)":rows.map(r=>JSON.stringify(Object.keys(r).sort().map(k=>[k,r[k]]))).join("\n");
    (parts[s.component]||(parts[s.component]=[])).push(s.table+"\n"+text);
  }
  const components={};for(const [k,v] of Object.entries(parts))components[k]=(await sha256Hex(v.join("\n\u0000\n"))).slice(0,16);
  const version=(await sha256Hex(JSON.stringify([m,components]))).slice(0,20);
  return {market:m,version,components};
}

// ---- concept key (MEM-03+) --------------------------------------------------------------------------------------------------
// Canonical, order-independent key of a GENERAL product question. Colour placement is part of the key: top / middle / bottom
// (gallery lid / middle / base), never a merged colour set. Customer-specific data (names, quantities, prices, orders) never
// enters a concept key.
const kNorm=v=>String(v??"").normalize("NFKC").toLowerCase().replace(/[يى]/g,"ی").replace(/ك/g,"ک").replace(/[ً-ٰٟ]/g,"").replace(/[‌‍]/g," ").replace(/\s+/g," ").trim();
export const CONCEPT_PLACEMENTS=["top","middle","bottom"];
export function salesConceptKey({market,language=null,intent,productKey=null,structure=null,size=null,colors={},printing=null,photo=false}){
  if(!market||!intent)return null;
  const c=colors&&typeof colors==="object"&&!Array.isArray(colors)?colors:{};
  const extra=Object.keys(c).filter(k=>!CONCEPT_PLACEMENTS.includes(k));if(extra.length)throw new Error("colour placement must be top / middle / bottom");
  const fields=[["m",kNorm(market).toUpperCase()],["l",language?kNorm(language):""],["i",kNorm(intent)],["p",kNorm(productKey)],["st",kNorm(structure)],["sz",kNorm(size).replace(/\s*[x×*]\s*/g,"x")],
    ...CONCEPT_PLACEMENTS.map(p=>["c."+p,kNorm(c[p])]),["pr",kNorm(printing)],["ph",photo?"1":"0"]];
  return fields.map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join("|");
}
