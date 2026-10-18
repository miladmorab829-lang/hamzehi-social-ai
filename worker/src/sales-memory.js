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
export function salesConceptKey({market,language=null,intent,productKey=null,structure=null,size=null,colors={},anyColors=[],printing=null,photo=false}){
  if(!market||!intent)return null;
  const c=colors&&typeof colors==="object"&&!Array.isArray(colors)?colors:{};
  const extra=Object.keys(c).filter(k=>!CONCEPT_PLACEMENTS.includes(k));if(extra.length)throw new Error("colour placement must be top / middle / bottom");
  const fields=[["m",kNorm(market).toUpperCase()],["l",language?kNorm(language):""],["i",kNorm(intent)],["p",kNorm(productKey)],["st",kNorm(structure)],["sz",kNorm(size).replace(/\s*[x×*]\s*/g,"x")],
    ...CONCEPT_PLACEMENTS.map(p=>["c."+p,kNorm(c[p])]),["c.any",[...new Set((anyColors||[]).map(kNorm))].sort().join(",")],["pr",kNorm(printing)],["ph",photo?"1":"0"]];
  return fields.map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join("|");
}

// ============================================================================================================================
// MEM-03 — approved shared memory (LOCAL, not wired to customer replies: SALES_MEMORY_MODE off | shadow).
// What is shared: only the MEANING of a general product question (concept: intent, product key, structure, size, colours per
// placement, printing), keyed by a canonical fingerprint built from a CLOSED vocabulary (approved catalog names / models / sizes,
// approved colour families, approved printing, placement words, a few intent words, filler words). Nothing a customer wrote
// outside that vocabulary is stored; no names, quantities, prices, orders or payments; no reply text (a reply is always rendered
// from approved data at answer time).
// A message is cacheable only when it is context-free: it names the product itself, contains no unknown word (so «مشکیش»,
// «اشوفها», a name, a typo → not cacheable), no bare number (quantity), and no commercial / payment / order word. Anything else —
// and anything ambiguous — goes to the model as today.
// Learning: an entry is born «candidate» from a validated AI interpretation that AGREES with the deterministic canonical parse;
// it is used for other customers only after the OWNER approves it («approved»). A disagreement marks it «conflict» (never used).
// Validity: an entry is used only while every product / model / size / colour / printing it depends on is still approved.
// ============================================================================================================================
export const MEMORY_INTENT_WORDS={
  photo:["عکس","عکسا","عکسها","عکسهای","تصویر","تصاویر","نمونه","نمونه‌ها","فیلم","صور","صوره","صورة","الصور","نماذج","ببینم","نشون","نشونم","بفرست","بفرستید","بفرستین","دزلی","دزلي","ارسل","ابعث","شوفني","اريد اشوف"],
  colors:["رنگ","رنگا","رنگها","رنگهای","رنگبندی","رنگ‌بندی","لون","الوان","الالوان","ألوان"],
  size:["سایز","سایزا","سایزها","سایزهای","اندازه","اندازه‌ها","ابعاد","قیاس","قياس","مقاس","قياسات","مقاسات","حجم"],
  have:["دارید","دارین","داری","موجود","موجوده","هست","عندکم","عندكم","عدکم","عدكم","یوجد","يوجد","متوفر"]
};
// words that make a message commercial / financial / order-related → never shared memory (the validated money path handles it)
export const MEMORY_COMMERCIAL_WORDS=["قیمت","قیمتش","چند","چنده","چقدر","تخفیف","پرداخت","واریز","رسید","کارت","سفارش","ثبت","فاکتور","پیش","بیعانه","تومان","تومن","دلار",
  "سعر","سعره","شکد","شكد","بکم","بكم","خصم","تخفيض","دفع","حواله","حوالة","وصل","طلب","اطلب","دینار","دولار","price","cost","discount","pay","payment","order"];
export const MEMORY_FILLER_WORDS=["سلام","درود","لطفا","لطفاً","ممنون","مرسی","سپاس","میشه","میشد","می‌شه","بی","رو","را","از","برای","با","و","هم","یه","یک","من","ما","شما","ی","ای","هست؟","چی","چیه","کدوم","چه",
  "بیزحمت","بی‌زحمت","خواهش","میخوام","میخواستم","می‌خوام","بدید","بدین","لطف","کنید","کنین","هلا","اهلا","مرحبا","السلام","عليكم","علیکم","رجاء","رجاءا","لو","سمحت","ممکن","ممكن","من","عن","مال","مالت","اريد","ارید","ابي","ابغى","شنو","شو","ايش","ای","كل","کل","the","a","please","hi","hello","do","you","have","any","of","for","show","me","send"];
const MEMORY_DIGIT_WORDS=new Map([["2","دو"],["3","سه"]]);
// vocab: one map from a normalised phrase (1–4 tokens) to its canonical meaning
export function buildMemoryVocabulary({productKeys=[],catalog=[],colors=[],printing=[],placements={},normalize}){
  const phrases=new Map(),add=(text,entry)=>{const t=normalize(text);if(!t.length||t.length>4)return;const k=t.join(" ");if(!phrases.has(k))phrases.set(k,entry);else if(J(phrases.get(k))!==J(entry))phrases.set(k,{type:"ambiguous"});};
  const J=JSON.stringify;
  for(const p of productKeys){add(p.product,{type:"product",id:p.key});}
  for(const c of catalog){
    const key=(productKeys.find(p=>p.product===c.product)||{}).key;if(!key)continue;
    for(const m of c.models||[]){add(m,{type:"structure",id:m});const m2=String(m).replace(/^(\d)(?=\s)/,d=>MEMORY_DIGIT_WORDS.get(d)||d);if(m2!==m)add(m2,{type:"structure",id:m});}
    for(const s of c.sizes||[]){add(s,{type:"size",id:String(s).replace(/\s*[x×*]\s*/g,"x")});}
  }
  // a colour is said by its family (first word: «مشکی» for «مشکی سلفون»); a family shared by two approved colours stays a family
  const families=new Map();for(const c of colors){const f=normalize(c)[0];if(f)(families.get(f)||families.set(f,new Set()).get(f)).add(c);}
  for(const [f,set] of families){add(f,{type:"color",id:f,members:[...set].sort()});}
  for(const c of colors)add(c,{type:"color",id:normalize(c)[0],members:[...(families.get(normalize(c)[0])||[c])].sort()});
  for(const p of printing)add(p,{type:"printing",id:p});
  const role={lid:"top",middle:"middle",base:"bottom"};
  for(const [r,words] of Object.entries(placements))for(const w of words)add(w,{type:"placement",id:role[r]||r});
  for(const [intent,words] of Object.entries(MEMORY_INTENT_WORDS))for(const w of words)add(w,{type:"intent",id:intent});
  const commercial=new Set(MEMORY_COMMERCIAL_WORDS.flatMap(w=>normalize(w))),filler=new Set(MEMORY_FILLER_WORDS.flatMap(w=>normalize(w)));
  return {phrases,commercial,filler,maxLen:4};
}
// → {cacheable, reason, canon:[ids…], product, structure, size, placed:{top,middle,bottom}, unplaced:[families], printing, intents:[…], deps}
// Colour placement is bound INDEPENDENTLY of word order: the placement / colour mentions of the message, in order, must form one
// unambiguous pattern — «placement colour placement colour…» («درب مشکی پایین طلایی», «الغطاء اسود والقاعدة ذهبي») or
// «colour placement colour placement…» («مشکی بالا طلایی پایین») — or contain colours only (no placement). Anything else
// («مشکی بالا طلایی», «درب مشکی و طلایی», a placement without a colour, one placement with two colours) is not cacheable: it goes to
// the model (safe fallback), never guessed.
export function memoryCanonicalize(text,vocab,normalize){
  const toks=normalize(text),canon=[],out={cacheable:false,reason:null,canon,product:null,structure:null,size:null,placed:{},unplaced:[],printing:null,intents:[],deps:{products:[],structures:[],sizes:[],colors:[],printing:[]}};
  if(!toks.length)return {...out,reason:"empty"};
  const marks=[];// placement / colour mentions in order
  for(let i=0;i<toks.length;){
    let hit=null,len=0;
    for(let n=Math.min(vocab.maxLen,toks.length-i);n>=1;n--){const k=toks.slice(i,i+n).join(" ");if(vocab.phrases.has(k)){hit=vocab.phrases.get(k);len=n;break;}}
    const w=toks[i];
    if(!hit){
      if(vocab.commercial.has(w))return {...out,reason:"commercial"};
      if(/\d/.test(w))return {...out,reason:"number"};
      // a conjunction / Arabic article on a known word («والقاعدة», «وقاعدة», «الاسود»): dropped for the lookup; at the very START
      // of the message a «و…» is a follow-up of an earlier turn («والكبيرة؟») → not context-free
      const bare=[w.replace(/^و?ال(?=\S{2})/,""),w.replace(/^و(?=\S{2})/,"")].find(b=>b!==w&&vocab.phrases.has(b));
      if(bare){if(i===0&&/^و/.test(w))return {...out,reason:"follow_up"};hit=vocab.phrases.get(bare);len=1;}
      else if(vocab.filler.has(w)){i++;continue;}
      else return {...out,reason:"unknown_word"};
    }
    if(hit.type==="ambiguous")return {...out,reason:"ambiguous_phrase"};
    canon.push(hit.type+":"+hit.id);
    if(hit.type==="product"){if(out.product&&out.product!==hit.id)return {...out,reason:"two_products"};out.product=hit.id;out.deps.products.push(hit.id);}
    else if(hit.type==="structure"){if(out.structure&&out.structure!==hit.id)return {...out,reason:"two_structures"};out.structure=hit.id;out.deps.structures.push(hit.id);}
    else if(hit.type==="size"){if(out.size&&out.size!==hit.id)return {...out,reason:"two_sizes"};out.size=hit.id;out.deps.sizes.push(hit.id);}
    else if(hit.type==="printing"){out.printing=hit.id;out.deps.printing.push(hit.id);}
    else if(hit.type==="intent"){if(!out.intents.includes(hit.id))out.intents.push(hit.id);}
    else if(hit.type==="placement")marks.push({k:"P",id:hit.id});
    else if(hit.type==="color"){out.deps.colors.push(hit.id);marks.push({k:"C",id:hit.id});}
    i+=len;
  }
  // bind placements ↔ colours (order-independent, unambiguous patterns only)
  const pattern=marks.map(m=>m.k).join("");
  if(pattern.includes("P")){
    let pairs=null;
    if(/^(PC)+$/.test(pattern))pairs=marks.reduce((a,m,i)=>i%2?[...a,[marks[i-1].id,m.id]]:a,[]);        // placement → colour
    else if(/^(CP)+$/.test(pattern))pairs=marks.reduce((a,m,i)=>i%2?[...a,[m.id,marks[i-1].id]]:a,[]);   // colour → placement
    if(!pairs)return {...out,reason:"placement_ambiguous"};
    for(const [place,colour] of pairs){if(out.placed[place]&&out.placed[place]!==colour)return {...out,reason:"placement_conflict"};out.placed[place]=colour;}
  }else out.unplaced=marks.map(m=>m.id);
  if(!out.product)return {...out,reason:"no_product_named"};
  if(!out.intents.length&&!out.unplaced.length&&!Object.keys(out.placed).length)return {...out,reason:"no_intent"};
  out.unplaced=[...new Set(out.unplaced)].sort();
  for(const k of Object.keys(out.deps))out.deps[k]=[...new Set(out.deps[k])].sort();
  return {...out,cacheable:true};
}
// the memory intents a shared entry may carry (never price / order / payment / negotiation)
export const MEMORY_LEARNABLE_INTENTS={see_photo:"photo",see_other_color:"photo",colors_available:"colors",size_info:"size",product_info:"have"};
// The concept of a cacheable message, confirmed by a validated AI interpretation (AI-02 record). Disagreement → null + reason.
export function memoryConceptFromInterpretation(parse,interp,{market,language}){
  if(!parse?.cacheable)return {concept:null,reason:"not_cacheable"};
  if(!interp)return {concept:null,reason:"no_interpretation"};
  const mi=MEMORY_LEARNABLE_INTENTS[interp.primary_intent];
  if(!mi)return {concept:null,reason:"intent_not_shareable"};
  if(interp.confidence!=="high"||interp.ambiguity!=="none")return {concept:null,reason:"not_confident"};
  if(interp.product_key!==parse.product)return {concept:null,reason:"product_disagrees"};
  if(parse.intents.length&&!parse.intents.includes(mi)&&!(mi==="photo"&&parse.intents.includes("have")))return {concept:null,reason:"intent_disagrees"};
  if(interp.requested_structure&&parse.structure&&interp.requested_structure!==parse.structure)return {concept:null,reason:"structure_disagrees"};
  const concept={market,language:language||null,intent:mi,product_key:parse.product,structure:parse.structure||interp.requested_structure||null,size:parse.size||null,
    colors:{...parse.placed},any_colors:parse.unplaced,printing:parse.printing||null,photo:mi==="photo"};
  return {concept,reason:null};
}
export function memoryConceptKey(c){return salesConceptKey({market:c.market,language:c.language,intent:c.intent,productKey:c.product_key,structure:c.structure,size:c.size,colors:c.colors||{},anyColors:c.any_colors||[],printing:c.printing,photo:c.photo});}
// Order-independent MEANING (placement already bound to its colour by the parse): two wordings of the same question — other filler,
// other verb of the same intent, other word order — share one fingerprint; top/bottom swapped never do.
export function memoryMeaning(parse){return {i:[...new Set(parse.intents)].sort(),p:parse.product,st:parse.structure,sz:parse.size,c:{top:parse.placed.top||null,middle:parse.placed.middle||null,bottom:parse.placed.bottom||null},a:[...parse.unplaced].sort(),pr:parse.printing};}
export async function memoryFingerprint(market,parse){return (await sha256Hex(JSON.stringify([String(market||""),memoryMeaning(parse)]))).slice(0,32);}
// every dependency still approved (from the vocabulary built from TODAY's approved data)
export function memoryDepsValid(deps,vocab){
  const have=t=>new Set([...vocab.phrases.values()].filter(e=>e.type===t).map(e=>e.id));
  const P=have("product"),S=have("structure"),Z=have("size"),C=have("color"),R=have("printing");
  return (deps.products||[]).every(x=>P.has(x))&&(deps.structures||[]).every(x=>S.has(x))&&(deps.sizes||[]).every(x=>Z.has(x))&&(deps.colors||[]).every(x=>C.has(x))&&(deps.printing||[]).every(x=>R.has(x));
}
let memoryReady=false;
async function memoryAvailable(env){if(memoryReady)return true;try{await env.DB.prepare("SELECT id FROM sales_memory_entries LIMIT 0").all();memoryReady=true;return true;}catch(e){if(missingTable(e))return false;throw e;}}
const memSafe=async fn=>{try{return await fn();}catch(e){if(missingTable(e)){memoryReady=false;return {unavailable:true};}throw e;}};
// lookup: only an APPROVED entry of THIS market, still valid against today's approved data
export async function memoryLookup(env,{market,fingerprint,vocab}){
  if(!(await memoryAvailable(env)))return {status:"unavailable"};
  const r=await memSafe(()=>env.DB.prepare("SELECT id,status,concept_json,deps_json FROM sales_memory_entries WHERE market=? AND fingerprint=?").bind(market,fingerprint).first());
  if(r?.unavailable)return {status:"unavailable"};
  if(!r)return {status:"miss"};
  if(r.status!=="approved")return {status:r.status,entry_id:r.id};
  let deps={},concept=null;try{deps=JSON.parse(r.deps_json||"{}");concept=JSON.parse(r.concept_json);}catch{return {status:"invalid",entry_id:r.id};}
  if(!memoryDepsValid(deps,vocab))return {status:"stale",entry_id:r.id};
  return {status:"hit",entry_id:r.id,concept};
}
// observe a validated reading: create / confirm a candidate, or mark a conflict. The lead is kept only as a one-way hash (to count
// DISTINCT customers who meant the same thing); no customer text is stored.
export async function memoryObserve(env,{market,language,fingerprint,parse,concept,leadId,knowledgeVersion=null}){
  if(!(await memoryAvailable(env)))return {status:"unavailable"};
  const t=nowIso(),cj=JSON.stringify(concept),ck=memoryConceptKey(concept),leadHash=(await sha256Hex("mem-lead:"+String(leadId||""))).slice(0,32);
  const r=await memSafe(async()=>{
    const ex=await env.DB.prepare("SELECT id,status,concept_key FROM sales_memory_entries WHERE market=? AND fingerprint=?").bind(market,fingerprint).first();
    if(ex&&ex.concept_key!==ck){
      if(ex.status!=="retired")await env.DB.prepare("UPDATE sales_memory_entries SET status='conflict',conflicts=conflicts+1,updated_at=? WHERE id=? AND status<>'retired'").bind(t,ex.id).run();
      return {status:"conflict",entry_id:ex.id};
    }
    const id=ex?.id||"mem-"+token();
    if(!ex)await env.DB.prepare(`INSERT INTO sales_memory_entries(id,market,language,fingerprint,canonical_json,concept_json,concept_key,deps_json,status,observations,distinct_leads,conflicts,knowledge_version,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,'candidate',0,0,0,?,?,?) ON CONFLICT(market,fingerprint) DO NOTHING`).bind(id,market,language||null,fingerprint,JSON.stringify(parse.canon),cj,ck,JSON.stringify(parse.deps),knowledgeVersion,t,t).run();
    const cur=await env.DB.prepare("SELECT id,status,concept_key FROM sales_memory_entries WHERE market=? AND fingerprint=?").bind(market,fingerprint).first();
    if(!cur||cur.concept_key!==ck)return {status:"conflict",entry_id:cur?.id||null};
    const o=await env.DB.prepare("INSERT INTO sales_memory_observations(entry_id,lead_hash,created_at) VALUES(?,?,?) ON CONFLICT(entry_id,lead_hash) DO NOTHING").bind(cur.id,leadHash,t).run();
    await env.DB.prepare("UPDATE sales_memory_entries SET observations=observations+1,distinct_leads=distinct_leads+?,updated_at=? WHERE id=?").bind(Number(o?.meta?.changes)===1?1:0,t,cur.id).run();
    return {status:cur.status==="candidate"?"candidate":cur.status,entry_id:cur.id,new_lead:Number(o?.meta?.changes)===1};
  });
  return r?.unavailable?{status:"unavailable"}:r;
}
// owner review: approve (only a candidate whose concept is exactly the one reviewed) or retire
export async function memoryReview(env,{id,decision,conceptKey,by="owner"}){
  if(!(await memoryAvailable(env)))return {ok:false,error:"memory_not_migrated"};
  const t=nowIso();
  if(decision==="approve"){const r=await env.DB.prepare("UPDATE sales_memory_entries SET status='approved',approved_at=?,approved_by=?,updated_at=? WHERE id=? AND status='candidate' AND concept_key=?").bind(t,String(by).slice(0,60),t,id,String(conceptKey||"")).run();return {ok:Number(r?.meta?.changes)===1,error:Number(r?.meta?.changes)===1?null:"not_a_candidate_or_concept_changed"};}
  if(decision==="retire"){const r=await env.DB.prepare("UPDATE sales_memory_entries SET status='retired',updated_at=? WHERE id=? AND status<>'retired'").bind(t,id).run();return {ok:Number(r?.meta?.changes)===1,error:Number(r?.meta?.changes)===1?null:"not_found_or_retired"};}
  return {ok:false,error:"decision must be approve or retire"};
}
export async function memoryList(env,{status=null,limit=50}={}){
  if(!(await memoryAvailable(env)))return {ok:false,error:"memory_not_migrated",items:[]};
  const r=await env.DB.prepare(`SELECT id,market,language,status,canonical_json,concept_json,concept_key,deps_json,observations,distinct_leads,conflicts,created_at,updated_at,approved_at FROM sales_memory_entries ${status?"WHERE status=?":""} ORDER BY distinct_leads DESC,updated_at DESC LIMIT ?`).bind(...(status?[status]:[]),Math.min(200,Math.max(1,Number(limit)||50))).all();
  return {ok:true,items:(r.results||[]).map(x=>({...x,canonical:JSON.parse(x.canonical_json),concept:JSON.parse(x.concept_json),deps:JSON.parse(x.deps_json)}))};
}
// gallery roles of a concept (top / middle / bottom → lid / middle / base)
export function memoryGalleryRoles(concept){const r={};if(concept?.colors?.top)r.lid=concept.colors.top;if(concept?.colors?.middle)r.middle=concept.colors.middle;if(concept?.colors?.bottom)r.base=concept.colors.bottom;return r;}

// ---- MEM-03 measurement (owner report) ----------------------------------------------------------------------------------------
// From the brain's own decision records (sales-brain:<inbox>, ai_brain.memory) and the usage ledger, over a window:
//   turns, memory-checked turns, cacheable / not cacheable (by reason), lookup results (hit / miss / candidate / conflict / stale /
//   unavailable), hits that AGREE with the model (safe) vs DISAGREE (would have been wrong — quality guard), model calls («Opus
//   referrals»), and cost: in SHADOW the model is still called on every turn, so actual_saved is 0 by definition and
//   potential_saved = the ledger's estimated cost of the model calls on turns whose memory hit agreed. Nothing is invented: a turn
//   without a ledger estimate adds no potential saving and is counted in potential_unknown.
export async function memoryMetrics(env,{days=7,now=Date.now()}={}){
  const since=new Date(now-Math.max(1,Math.min(90,Number(days)||7))*86400000).toISOString();
  const rows=((await env.DB.prepare("SELECT id,details_json FROM system_events WHERE id LIKE 'sales-brain:%' AND created_at>=?").bind(since).all()).results||[]);
  const m={window_days:Number(days)||7,mode:String(env.SALES_MEMORY_MODE||"off").toLowerCase(),turns:rows.length,memory_checked:0,cacheable:0,not_cacheable:{},lookup:{},hits_agree:0,hits_disagree:0,learned:{},model_calls:0,opus_referrals_after_memory_miss:0,
    cost:{potential_saved_micro_usd:0,potential_unknown:0,actual_saved_micro_usd:0}};
  const agreeInbox=[];
  for(const r of rows){
    let b=null;try{b=JSON.parse(r.details_json||"{}").ai_brain||null;}catch{}
    if(!b)continue;
    const called=b.provider_called===true||(b.provider_called===undefined&&b.called===true);if(called)m.model_calls++;
    const mem=b.memory;if(!mem)continue;
    m.memory_checked++;
    if(!mem.cacheable){m.not_cacheable[mem.reason||"unknown"]=(m.not_cacheable[mem.reason||"unknown"]||0)+1;if(called)m.opus_referrals_after_memory_miss++;continue;}
    m.cacheable++;m.lookup[mem.lookup||"none"]=(m.lookup[mem.lookup||"none"]||0)+1;
    if(mem.learn)m.learned[mem.learn]=(m.learned[mem.learn]||0)+1;
    if(mem.lookup==="hit"){if(mem.agrees===true){m.hits_agree++;agreeInbox.push(r.id.slice("sales-brain:".length));}else m.hits_disagree++;}
    else if(called)m.opus_referrals_after_memory_miss++;
  }
  for(const id of agreeInbox){
    let c=null;try{c=await env.DB.prepare("SELECT cost_estimate_micro_usd c FROM ai_usage_ledger WHERE inbox_message_id=? AND outcome='success' ORDER BY created_at DESC LIMIT 1").bind(id).first();}catch{c=null;}
    if(c&&Number.isSafeInteger(c.c))m.cost.potential_saved_micro_usd+=c.c;else m.cost.potential_unknown++;
  }
  m.hit_rate=m.cacheable?Math.round(1000*(m.lookup.hit||0)/m.cacheable)/1000:null;
  m.safe_hit_rate=(m.hits_agree+m.hits_disagree)?Math.round(1000*m.hits_agree/(m.hits_agree+m.hits_disagree))/1000:null;
  return m;
}
