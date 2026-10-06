// ============================================================================================================================
// Sales AI Gateway — the conversational understanding + drafting layer of the Telegram Sales Brain.
//
// The LLM UNDERSTANDS the customer's whole turn (several requests at once, references, corrections, paraphrases) and DRAFTS a
// natural reply from a bounded, grounded context. It never decides commercial truth: prices, totals, discounts, MOQ figures and order
// outcomes come only from the deterministic layer (they are inserted at {{COMMERCIAL}}), every extracted fact is validated against
// D1 before it is stored, and a reply that fails validation falls back to the deterministic reply. Nothing here touches D1.
// No chain-of-thought is requested or stored: only the structured decision below.
// ============================================================================================================================

// What a customer turn can contain (several at once).
export const SALES_AI_REQUESTS=["greeting","thanks","product_info","colors_available","color_recommendation","choose_colors","price","discount","moq","shipping","payment","production_time","printing","ribbon","size","customization","order_status","acceptance","rejection","provide_details","correction","other"];
export const SALES_AI_ESCALATIONS=["unknown_capability","custom_color","unapproved_terms","missing_knowledge","conflicting_knowledge"];
export const SALES_AI_COMMERCIAL_SLOT="{{COMMERCIAL}}";

// Off unless configured (SALES_AI_BRAIN=on) and a key exists: unconfigured environments keep the deterministic brain unchanged.
export function salesAiEnabled(env){return String(env?.SALES_AI_BRAIN||"off").toLowerCase()==="on"&&!!salesAiKey(env,salesAiProvider(env));}
// Provider/model are configuration, never hard-wired into the sales logic. SALES_AI_PROVIDER is explicit: "openai" (default when unset,
// i.e. today's behaviour) or "anthropic"; any other value is a misconfiguration (no call, no silent fallback to another provider).
export function salesAiProvider(env){const p=String(env?.SALES_AI_PROVIDER||"openai").trim().toLowerCase();return p==="openai"||p==="anthropic"?p:null;}
function salesAiKey(env,provider){return provider==="anthropic"?env?.ANTHROPIC_API_KEY:provider==="openai"?env?.OPENAI_API_KEY:null;}
export function salesAiModel(env){
  if(salesAiProvider(env)==="anthropic")return String(env?.SALES_AI_MODEL||env?.ANTHROPIC_MODEL||"claude-opus-5-5");
  return String(env?.SALES_AI_MODEL||env?.OPENAI_MODEL||"gpt-5.6-luna");
}

// The decision contract (strict JSON schema: every property present; null / [] when not applicable).
const str={type:["string","null"]};
export const SALES_AI_DECISION_SCHEMA={
  type:"object",additionalProperties:false,
  required:["requests","facts","acceptance","rejection","owner_escalation_needed","escalation_reason","missing_information","summary_update","reply","reply_colors"],
  properties:{
    requests:{type:"array",items:{type:"string",enum:SALES_AI_REQUESTS}},
    facts:{type:"object",additionalProperties:false,required:["quantity","product","model","size","destination","customer_name","colors","color_parts","unknown_colors"],properties:{
      quantity:{type:["integer","null"]},product:str,model:str,size:str,destination:str,customer_name:str,
      colors:{type:"array",items:{type:"string"}},
      color_parts:{type:"array",items:{type:"object",additionalProperties:false,required:["part","color"],properties:{part:{type:"string"},color:{type:"string"}}}},
      unknown_colors:{type:"array",items:{type:"string"}}}},
    acceptance:{type:"boolean"},rejection:{type:"boolean"},
    owner_escalation_needed:{type:"boolean"},escalation_reason:{type:["string","null"],enum:[...SALES_AI_ESCALATIONS,null]},
    missing_information:{type:"array",items:{type:"string"}},
    summary_update:str,
    reply:{type:"string"},
    reply_colors:{type:"array",items:{type:"string"}}
  }
};

// The standing policy (identity, objective, language, safety, style). Business facts are NOT here: they come per turn in CONTEXT.
export function salesAiPolicy(language){
  const fa=language!=="Iraqi Arabic";
  return [
    "You are the HAMZEHI BOX sales assistant (custom gift / jewellery boxes, B2B) chatting with a customer on Telegram.",
    "Goal: understand the customer's WHOLE message (it may contain several questions, choices and corrections at once), answer what they asked, and move the sale forward naturally.",
    `Write the reply in ${fa?"natural conversational Persian (Iran)":"natural Iraqi Arabic"} — warm, confident, concise (normally 1–3 short sentences; a list of options may be longer). No robotic filler, no repeated phrases, no internal or database words.`,
    "Answer explicit questions first, then ask at most ONE useful next question. Never ask for anything already known in CONTEXT (customer, deal, recent messages). Resolve references (همون، این مدل، اون رنگ، مثل قبلی، وسطش…) from the deal and recent messages.",
    "GROUNDING — use ONLY facts given in CONTEXT. Never invent products, models, sizes, colours, capabilities, prices, discounts, MOQ, delivery times or policies.",
    `COMMERCIAL TRUTH — never write a price, total, currency amount, discount, MOQ number, delivery date, and never say an order is registered/confirmed. When the customer asks about price/discount/MOQ/terms or accepts an offer, write ${SALES_AI_COMMERCIAL_SLOT} where the system will insert the authoritative answer, and do not write about it yourself.`,
    "COLOURS — offer and recommend only names from colors.approved, written exactly as given. A box model may have parts (colors.parts); each part may take any approved colour; colors.suggestion is only a common suggestion, never a rule. A colour that is not in colors.approved: put it in facts.unknown_colors, do not say it is available, set owner_escalation_needed with escalation_reason custom_color.",
    "If the customer asks for something CONTEXT does not cover (a capability, option or policy), do not guess: say naturally that you will confirm it, and set owner_escalation_needed with the matching reason. Do NOT escalate just because the wording is unusual or several questions were combined, and do not let an old pending question stop you from answering a new answerable one.",
    "FACTS — report only what the customer stated or clearly confirmed in THIS message (resolved with context): quantity as an integer, product/model/size as named in catalog, destination city, the customer's own name, chosen colours (exact approved names) and per-part choices (part names exactly as in colors.parts). Leave everything else null / empty. A later statement that corrects an earlier one is the new value.",
    "reply_colors: every colour name your reply mentions, exactly as written in the reply (they must all be in colors.approved).",
    "acceptance = the customer clearly accepts the current offer (deal.status offered) to register it; rejection = the customer clearly declines it.",
    "summary_update: only when CONTEXT.summary_requested is true — a factual summary (max 600 characters) of the whole conversation so far (decisions, choices, open questions, promises); otherwise null.",
    "Return ONLY the JSON object of the required schema."
  ].join("\n");
}

// ---- Context budgeting: each section is capped so the prompt stays small and fast whatever the conversation length.
const clip=(v,n)=>{const s=String(v??"").replace(/\s+/g," ").trim();return s.length>n?s.slice(0,n-1)+"…":s;};
export const SALES_AI_BUDGET={recent_messages:12,message_chars:400,knowledge_items:24,knowledge_chars:220,catalog_products:30,summary_chars:800,total_chars:14000};
export function buildSalesAiInput(ctx){
  const c={
    market:ctx.market||null,language:ctx.language,
    customer:ctx.customer||{},
    deal:ctx.deal||null,
    commercial_now:ctx.commercial||null,
    catalog:(ctx.catalog||[]).slice(0,SALES_AI_BUDGET.catalog_products),
    colors:ctx.colors||null,
    knowledge:(ctx.knowledge||[]).slice(0,SALES_AI_BUDGET.knowledge_items).map(k=>({topic:clip(k.topic,60),about:clip(k.about,60),value:clip(k.value,SALES_AI_BUDGET.knowledge_chars)})),
    pending_owner_questions:ctx.pending||[],
    still_needed:ctx.stillNeeded||[],
    summary:ctx.summary?clip(ctx.summary,SALES_AI_BUDGET.summary_chars):null,
    summary_requested:!!ctx.summaryRequested,
    recent:(ctx.recent||[]).slice(-SALES_AI_BUDGET.recent_messages).map(m=>({from:m.from,text:clip(m.text,SALES_AI_BUDGET.message_chars)})),
    message:clip(ctx.message,1200)
  };
  let text="CONTEXT:\n"+JSON.stringify(c);
  // Hard cap: older recent messages and then knowledge are dropped first (state, commercial facts and the message are kept).
  while(text.length>SALES_AI_BUDGET.total_chars&&(c.recent.length>4||c.knowledge.length>6)){if(c.recent.length>4)c.recent.shift();else c.knowledge.pop();text="CONTEXT:\n"+JSON.stringify(c);}
  return text;
}

// ---- Provider (OpenAI Responses API). One call, bounded by a timeout; errors are sanitised codes, never provider internals.
// The customer waits for this call: a slow model is abandoned after SALES_AI_TIMEOUT_MS (default 8 s, bounded 1–15 s) and the
// deterministic reply is sent instead. No retry (a retried call could double provider cost and reply twice).
export function salesAiTimeoutMs(env){const v=Number(env?.SALES_AI_TIMEOUT_MS);return Number.isFinite(v)?Math.min(15000,Math.max(1000,Math.round(v))):8000;}
export async function callSalesAi(env,{instructions,input,timeoutMs=salesAiTimeoutMs(env)}){
  const provider=salesAiProvider(env);
  if(provider==="anthropic")return callSalesAiAnthropic(env,{instructions,input,timeoutMs});
  if(provider!=="openai")return {ok:false,model:salesAiModel(env),ms:0,error:"provider_misconfigured"};
  const started=Date.now(),model=salesAiModel(env);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",signal:controller.signal,headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
      body:JSON.stringify({model,instructions,input,text:{format:{type:"json_schema",name:"sales_decision",strict:true,schema:SALES_AI_DECISION_SCHEMA}}})});
    if(!r.ok)return {ok:false,model,ms:Date.now()-started,error:"provider_http_"+r.status};
    const data=await r.json();
    let text=typeof data?.output_text==="string"?data.output_text:"";
    if(!text)for(const item of data?.output||[])for(const part of item?.content||[])if(typeof part?.text==="string")text+=part.text;
    const json=JSON.parse(String(text).match(/\{[\s\S]*\}/)?.[0]||"null");
    if(!json||typeof json!=="object")return {ok:false,model,ms:Date.now()-started,error:"provider_unparsable"};
    return {ok:true,model,ms:Date.now()-started,decision:normalizeSalesAiDecision(json)};
  }catch(error){return {ok:false,model,ms:Date.now()-started,error:error?.name==="AbortError"?"provider_timeout":"provider_error"};}
  finally{clearTimeout(timer);}
}

// ---- Provider (Anthropic Messages API, structured output). Same contract as above: one call, same timeout, no retry, sanitised
// error codes, the same decision schema (nullable type arrays expressed as anyOf, which is the same JSON schema semantics).
export const toAnthropicSchema=s=>{
  if(Array.isArray(s))return s.map(toAnthropicSchema);
  if(!s||typeof s!=="object")return s;
  const o=Object.fromEntries(Object.entries(s).map(([k,v])=>[k,k==="enum"?v:toAnthropicSchema(v)]));
  if(Array.isArray(o.type)&&o.type.includes("null")&&o.type.length===2){
    const {type,enum:en,...rest}=o,t=type.find(x=>x!=="null");
    return {anyOf:[{...rest,type:t,...(en?{enum:en.filter(x=>x!==null)}:{})},{type:"null"}]};
  }
  return o;
};
const SALES_AI_DECISION_SCHEMA_ANTHROPIC=toAnthropicSchema(SALES_AI_DECISION_SCHEMA);
async function callSalesAiAnthropic(env,{instructions,input,timeoutMs}){
  const started=Date.now(),model=salesAiModel(env);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",signal:controller.signal,
      headers:{"x-api-key":env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","content-type":"application/json"},
      body:JSON.stringify({model,max_tokens:8000,system:instructions,messages:[{role:"user",content:input}],
        output_config:{effort:String(env?.SALES_AI_EFFORT||"low"),format:{type:"json_schema",schema:SALES_AI_DECISION_SCHEMA_ANTHROPIC}}})});
    if(!r.ok)return {ok:false,model,ms:Date.now()-started,error:"provider_http_"+r.status};
    const data=await r.json();
    if(data?.stop_reason==="refusal")return {ok:false,model,ms:Date.now()-started,error:"provider_refusal"};
    if(data?.stop_reason==="max_tokens")return {ok:false,model,ms:Date.now()-started,error:"provider_truncated"};
    const text=(Array.isArray(data?.content)?data.content:[]).filter(b=>b?.type==="text"&&typeof b.text==="string").map(b=>b.text).join("");
    const json=JSON.parse(String(text).match(/\{[\s\S]*\}/)?.[0]||"null");
    if(!json||typeof json!=="object")return {ok:false,model,ms:Date.now()-started,error:"provider_unparsable"};
    return {ok:true,model,ms:Date.now()-started,decision:normalizeSalesAiDecision(json)};
  }catch(error){return {ok:false,model,ms:Date.now()-started,error:error?.name==="AbortError"?"provider_timeout":"provider_error"};}
  finally{clearTimeout(timer);}
}

// Shape/type sanitising only (semantic validation against D1 happens in the brain).
export function normalizeSalesAiDecision(raw){
  const s=v=>typeof v==="string"&&v.trim()?v.trim().slice(0,200):null,arr=v=>Array.isArray(v)?v:[];
  const f=raw?.facts&&typeof raw.facts==="object"?raw.facts:{};
  const qty=Number(f.quantity);
  return {
    requests:[...new Set(arr(raw?.requests).filter(x=>SALES_AI_REQUESTS.includes(x)))],
    facts:{quantity:Number.isSafeInteger(qty)&&qty>0&&qty<=10000000?qty:null,product:s(f.product),model:s(f.model),size:s(f.size),destination:s(f.destination),customer_name:s(f.customer_name),
      colors:[...new Set(arr(f.colors).map(s).filter(Boolean))].slice(0,12),
      color_parts:arr(f.color_parts).filter(p=>p&&s(p.part)&&s(p.color)).map(p=>({part:s(p.part),color:s(p.color)})).slice(0,6),
      unknown_colors:[...new Set(arr(f.unknown_colors).map(s).filter(Boolean))].slice(0,6)},
    acceptance:raw?.acceptance===true,rejection:raw?.rejection===true,
    owner_escalation_needed:raw?.owner_escalation_needed===true,escalation_reason:SALES_AI_ESCALATIONS.includes(raw?.escalation_reason)?raw.escalation_reason:null,
    missing_information:arr(raw?.missing_information).map(s).filter(Boolean).slice(0,6),
    summary_update:typeof raw?.summary_update==="string"&&raw.summary_update.trim()?raw.summary_update.trim().slice(0,800):null,
    reply:typeof raw?.reply==="string"?raw.reply.trim().slice(0,1500):"",
    reply_colors:[...new Set(arr(raw?.reply_colors).map(s).filter(Boolean))].slice(0,30)
  };
}

// ---- Deterministic guard on the AI's OWN prose (before the commercial segment is inserted): it may not carry commercial truth.
const DIGITS=/[0-9۰-۹٠-٩]+(?:[.,٬٫][0-9۰-۹٠-٩]+)*/g;
const toAscii=s=>String(s).replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d));
// Normalised text for the gate (digits → ASCII, Arabic letter forms → Persian, no diacritics / ZWNJ) and number words → values.
const gateNorm=v=>toAscii(String(v??"").normalize("NFKC")).replace(/[يى]/g,"ی").replace(/ك/g,"ک").replace(/ة/g,"ه").replace(/[أإآ]/g,"ا")
  .replace(/ؤ/g,"و").replace(/ئ/g,"ی").replace(/[ً-ٰٟـ]/g,"").replace(/[‌‍]/g," ").toLowerCase().replace(/\s+/g," ").trim();
// «نه» (no) and «ست» (as in «نیم ست») are deliberately absent: they are not read as numbers.
const GATE_NUMBER_WORDS=new Map(Object.entries({یک:1,یه:1,دو:2,سه:3,چهار:4,پنج:5,شش:6,شیش:6,هفت:7,هشت:8,ده:10,یازده:11,دوازده:12,سیزده:13,چهارده:14,پانزده:15,پونزده:15,شانزده:16,شونزده:16,هفده:17,هجده:18,هیجده:18,نوزده:19,
  بیست:20,سی:30,چهل:40,پنجاه:50,شصت:60,هفتاد:70,هشتاد:80,نود:90,صد:100,یکصد:100,دویست:200,سیصد:300,چهارصد:400,پانصد:500,پونصد:500,ششصد:600,شیشصد:600,هفتصد:700,هشتصد:800,نهصد:900,
  واحد:1,اثنین:2,ثنین:2,اثنان:2,ثلاث:3,ثلاثه:3,اربع:4,اربعه:4,خمس:5,خمسه:5,سته:6,سبع:7,سبعه:7,ثمان:8,ثمانیه:8,تسع:9,تسعه:9,عشر:10,عشره:10,عشرین:20,عشرون:20,ثلاثین:30,اربعین:40,خمسین:50,ستین:60,سبعین:70,ثمانین:80,تسعین:90,
  میه:100,مایه:100,مئه:100,میتین:200,مئتین:200,ثلاثمیه:300,ثلاثمئه:300,اربعمیه:400,اربعمئه:400,خمسمیه:500,خمسمئه:500,ستمیه:600,ستمئه:600,سبعمیه:700,سبعمئه:700,ثمنمیه:800,ثمانمئه:800,تسعمیه:900,تسعمئه:900}).map(([k,v])=>[gateNorm(k),v]));
const GATE_MULTIPLIERS=new Map([["هزار",1000],["الف",1000],["الاف",1000],["میلیون",1e6],["ملیون",1e6]].map(([k,v])=>[gateNorm(k),v]));
const gateSet=a=>new Set(a.map(gateNorm));
const GATE_QTY_UNITS=gateSet(["تا","تایی","عدد","عدده","دانه","حبه","حبات","قطعه","قطع","تکه","تیکه","قطعتین","pcs","pc","pieces","units","جعبه","باکس","پک","بسته","کارتن","علبه","علب","box","boxes"]);
const GATE_TIME_UNITS=gateSet(["روز","روزه","روزی","هفته","هفته‌ای","ماه","ماهه","ساعت","ساعته","یوم","ایام","اسبوع","اسابیع","ساعه","شهر","day","days","week","weeks","hour","hours","month","months"]);
// Every number a text states (digits and spoken numbers), with the two words that follow it. Dimensions (7x9, ۷ در ۹) are one «DIM».
function gateNumberMentions(text){
  const t=gateNorm(text).replace(/(\d+)\s*(?:x|×|\*|در)\s*(\d+)/g," $1 dim $2 dim ").replace(/(\d)[,٬](?=\d{3}(?!\d))/g,"$1");
  const w=t.split(/[^\p{L}\p{N}.]+/u).map(x=>x.replace(/^\.+|\.+$/g,"")).filter(Boolean),out=[];
  for(let i=0;i<w.length;i++){
    let total=0,current=0,used=0,spoken=false,mult=false,j=i;
    for(;j<w.length;j++){
      const x=w[j];
      if(/^\d+(?:\.\d+)?$/.test(x)){if(used&&!mult&&current)break;current+=Number(x);used++;continue;}
      if(GATE_NUMBER_WORDS.has(x)){current+=GATE_NUMBER_WORDS.get(x);used++;spoken=true;continue;}
      if(used&&GATE_MULTIPLIERS.has(x)){total+=(current||1)*GATE_MULTIPLIERS.get(x);current=0;mult=true;continue;}
      if(x==="و"&&used&&(GATE_NUMBER_WORDS.has(w[j+1])||/^\d/.test(w[j+1]||"")))continue;
      break;
    }
    if(!used)continue;
    out.push({value:total+current,spoken,multiplied:mult,next:w[j]||"",next2:w[j+1]||""});
    i=j-1;
  }
  return out;
}
export const salesAiSpokenNumbers=text=>gateNumberMentions(text).filter(m=>m.spoken).map(m=>m.value);
// Numbers the model was actually GIVEN: the customer's current message (digits and spoken numbers: «چهارصد» = 400) and the
// structured, non-commercial context sections of the built input (customer, deal, commercial state, catalog, approved colours /
// parts, approved knowledge). Recent messages and the summary are NOT grounding (they may carry old commercial figures).
export function salesAiGroundedNumbers(input){
  let c=null;try{c=JSON.parse(String(input||"").replace(/^CONTEXT:\s*/,""));}catch{}
  if(!c||typeof c!=="object")return [];
  const sources=[c.message,JSON.stringify(c.customer||null),JSON.stringify(c.deal||null),JSON.stringify(c.commercial_now||null),JSON.stringify(c.catalog||[]),JSON.stringify(c.colors||null),JSON.stringify(c.knowledge||[])];
  const out=new Set();
  for(const s of sources){for(const m of String(s||"").match(DIGITS)||[]){const n=Number(toAscii(m).replace(/[,٬]/g,"").replace(/[٫]/g,"."));if(Number.isFinite(n))out.add(n);for(const p of toAscii(m).split(/[.,٬٫]/))if(p)out.add(Number(p));}
    for(const m of gateNumberMentions(s))out.add(m.value);}
  return [...out].filter(Number.isFinite);
}
// The quantities the CURRENT customer message itself expresses (same parser as the gate: any digit script, thousands separators,
// spoken Persian / Arabic numbers). A number that names a part count («3 تکه»), a dimension (7x9), a duration or an amount with a
// money multiplier but no quantity unit is not a quantity. Used to accept an AI-extracted quantity only when the customer said it now.
const GATE_NOT_QUANTITY_NEXT=gateSet(["تکه","تیکه","قطعه","قطع","قطعتین","dim","درصد","تومان","تومن","ریال","دلار","دینار","usd"]);
export function salesAiMessageQuantities(message){
  return [...new Set(gateNumberMentions(message).filter(m=>Number.isSafeInteger(m.value)&&m.value>0&&!GATE_NOT_QUANTITY_NEXT.has(m.next)&&!GATE_TIME_UNITS.has(m.next)&&!(m.next==="تا"&&GATE_TIME_UNITS.has(m.next2))&&!(m.multiplied&&!GATE_QTY_UNITS.has(m.next))).map(m=>m.value))];
}
// The confirmation guard: AI prose never registers an order (that comes only from the deterministic segment after a validated
// acceptance). A «registered / finalised» sentence passes only as an acknowledgement of a PREFERENCE (it names an approved colour or a
// model part) and only when it names no order word and no number; otherwise it is an order commitment. Questions offer, not confirm.
const GATE_CONFIRM=/(?:ثبت|تایید|نهایی|قطعی)\s*(?:شد|شده|شدن|کردم|کردیم|میشه|می شه|میشن|می شن|میشود|می شود|میشوند|می شوند|شود|بشه|خواهد شد|خواهند شد|میگردد|می گردد|گردید|میکنم|می کنم|میکنیم|می کنیم|کنم|میزنم|می زنم|میزنیم|می زنیم)|ثبتش|ثبتشون|ثبتتون|تم (?:تاکید|تسجیل|اعتماد)|سیتم (?:تاکید|تسجیل|اعتماد)|(?:راح|رح|سوف) (?:نسجل|نثبت|نعتمد|یتسجل|یتثبت)|نسجل(?:ه|ها)?(?!\p{L})|سجلت|سجلنا|اعتمدنا|confirmed|registered|finali[sz]ed|placed/u;
const GATE_ORDER=/(?:سفارش|خرید|فاکتور|قرارداد|طلب|فاتوره|order|purchase|invoice)/u;
function gateConfirmationIssue(text,preferenceTerms){
  const prefs=preferenceTerms.map(gateNorm).filter(p=>p.length>=2);
  for(const raw of String(text).split(/(?<=[.!?؟\n؛;])/u)){
    const s=gateNorm(raw);
    if(!GATE_CONFIRM.test(s)||/[?؟]\s*$/u.test(raw.trim()))continue;
    if(GATE_ORDER.test(s)||gateNumberMentions(raw).length||!prefs.some(p=>s.includes(p)))return true;
  }
  return false;
}
// Does the reply say a COLOUR choice is finalised / registered / noted (a sentence with such a verb that names one of the colours)?
// The brain allows that wording only when the colours were actually saved (questions only offer, they never claim).
export function salesAiClaimsColoursRecorded(text,colours){
  const names=(colours||[]).map(gateNorm).filter(c=>c.length>=2);
  if(!names.length)return false;
  return String(text||"").split(/(?<=[.!?؟\n؛;])/u).some(raw=>{const s=gateNorm(raw);return (GATE_CONFIRM.test(s)||/یادداشت\s*(?:شد|شده|کردم|کردیم)/u.test(s))&&!/[?؟]\s*$/u.test(raw.trim())&&names.some(c=>s.includes(c));});
}
const GATE_PRICE_WORDS=/(?<!\p{L})(?:قیمت\p{L}*|فی|هزینه\p{L}*|مبلغ\p{L}*|سعر\p{L}*|السعر|کلفه|الکلفه|بیش|price\p{L}*|cost\p{L}*|total)(?!\p{L})/u,GATE_MIN_WORDS=/(?<!\p{L})(?:حداقل|کمترین|دست کم|الحد الادنی|اقل|minimum|at least)(?!\p{L})/u;
// ---- Payment-terms negotiation. A customer may ask for other terms (another advance %, full payment, paying after delivery); the
// request is relayed to the owner, never accepted or invented by the AI.
const SALES_AI_PAY_WORDS=/(?:بیعانه|پیش[‌\s]?پرداخت|پیش[‌\s]?قسط|علی[‌\s]?الحساب|عربون|العربون|دفعه\s*مقدمه|دفعة\s*مقدمة|مقدم|deposit|advance|upfront|پرداخت|تسویه|الدفع|payment|pay)/iu;
const SALES_AI_RELAY=/(?:هماهنگ|بررسی|استعلام|تأیید\s*مدیر|تایید\s*مدیر|با\s*مدیر|از\s*مدیر|مدیر\s*فروش|برای\s*تأیید|برای\s*تایید|نتیجه\s*رو|خبرتون|اطلاع\s*می|confirm\s+with|check\s+with|owner|أتأكد|أراجع|نراجع|المدير|للموافقة)/iu;
const SALES_AI_AGREE=/(?:قبول|موافق|مشکلی\s*نیست|اشکالی\s*نداره|حله|اوکیه|پذیرفت|تأیید\s*شد|تایید\s*شد|ثبت\s*شد|می[‌\s]?تونید|میتونید|مانعی\s*نداره|approved|accepted|agreed|you\s+can|مقبول|ماشي|يصير|تگدر|تقدر)/iu;
const SALES_AI_PAY_LATER=/(?:(?:پرداخت|تسویه|پول)[^.؟!?\n]{0,25}(?:بعد|پس)\s*(?:از\s*)?(?:تحویل|دریافت|ارسال|رسیدن)|(?:بعد|پس)\s*(?:از\s*)?(?:تحویل|دریافت)[^.؟!?\n]{0,25}(?:پرداخت|تسویه)|نسیه|اعتباری|(?:ماهانه|ماهیانه|هفتگی)\s*(?:پرداخت|تسویه)|cash\s+on\s+delivery|pay\s+later|after\s+delivery|عند\s*الاستلام|بعد\s*الاستلام|آجل|بالآجل|بالتقسيط|بالأقساط|installments?|cheques?)/iu;
// Cheque wording is matched as whole words only («کوچکی» / «چک کردم» are not cheques).
const SALES_AI_CHEQUE=/(?<![\p{L}\p{M}])(?:(?:چکی|با\s*چک)(?![\p{L}\p{M}])|چک\s*(?:هم\s|صیادی|مدت[‌\s]?دار|قبول|می[‌\s]?گیر|میگیر|بد|مید|بپرداز|پرداخت))|(?<![\p{L}\p{M}])(?:صك|صک|بصك|بصک|بالصك|بالصک|بالشيك|بالشیک)(?![\p{L}\p{M}])/u;
const SALES_AI_INSTALMENT=/(?<![\p{L}\p{M}])(?:قسطی|اقساطی|اقساط|قسط(?:ی|ها|بندی)?|تقسيط|بالتقسيط|تقسیط|بالتقسیط|بالأقساط|بالاقساط|أقساط)(?![\p{L}\p{M}])|installments?/iu;
export function salesAiWithoutTermsRelays(text){
  return String(text||"").split(/(?<=[.!?؟\n؛;])/u).filter(raw=>!(SALES_AI_PAY_WORDS.test(raw)&&SALES_AI_RELAY.test(raw)&&!SALES_AI_AGREE.test(raw))).join(" ");
}
// The payment terms a CUSTOMER asks for: {kind:"deposit",percent} (the advance % nearest a payment word), {kind:"full",percent:100}
// or {kind:"after_delivery",percent:0}; null when the message asks for none.
export function salesPaymentTermsRequest(message){
  const t=gateNorm(String(message||""));
  if(/(?:(?:پرداخت|تسویه|پول)[^.؟!?]{0,25}(?:بعد|پس)\s*(?:از\s*)?(?:تحویل|دریافت|رسیدن)|(?:بعد|پس)\s*(?:از\s*)?(?:تحویل|دریافت)[^.؟!?]{0,25}(?:پرداخت|تسویه|بدم|میدم|بپردازم)|نسیه|cash\s+on\s+delivery|pay\s+(?:on|after)\s+delivery|عند\s*الاستلام|بعد\s*الاستلام)/iu.test(t))return {kind:"after_delivery",percent:0};
  if(/(?:(?:کل|تمام|همه)\s*(?:مبلغ|پول|هزینه)?[^.؟!?]{0,15}(?:اول|اولش|پیشاپیش|نقد|یکجا|یک\s*جا|کامل)|(?:پرداخت|تسویه)\s*(?:کامل|یکجا|یک\s*جا|نقدی)|صد\s*درصد|pay\s+in\s+full|full\s+payment|الدفع\s*كامل|كامل\s*المبلغ)/iu.test(t))return {kind:"full",percent:100};
  const W=/(?:بیعانه|پیش\s*پرداخت|پیش\s*قسط|علی\s*الحساب|عربون|العربون|دفعه\s*مقدمه|مقدم|deposit|advance|upfront)/giu;
  const words=[...t.matchAll(W)].map(m=>m.index);
  const pcts=[...t.matchAll(/([0-9]{1,3})\s*(?:درصد|٪|%|بالمیه|بالمئه|percent)/giu)].map(m=>({value:Number(m[1]),at:m.index})).filter(x=>x.value<=100);
  // Paying in instalments / by cheque is a payment-terms request too (with the advance % the customer named, if any).
  const advance=pcts.length&&words.length?pcts.map(p=>({...p,d:Math.min(...words.map(w=>Math.abs(w-p.at)))})).sort((a,b)=>a.d-b.d)[0].value:null;
  if(SALES_AI_INSTALMENT.test(t.replace(/پیش\s*قسط/gu," ")))return {kind:"installments",percent:advance};
  if(SALES_AI_CHEQUE.test(t)||/(?<![\p{L}\p{M}])چک(?![\p{L}\p{M}])[^.؟!?]{0,20}(?:قبول|میگیر|می\s*گیر|بدم|میدم|بپرداز|پرداخت)/u.test(t)||/\bcheques?\b/iu.test(t))return {kind:"cheque",percent:advance};
  if(!pcts.length||!words.length)return null;
  const best=pcts.map(p=>({...p,d:Math.min(...words.map(w=>Math.abs(w-p.at)))})).sort((a,b)=>a.d-b.d)[0];
  return {kind:best.value===100?"full":best.value===0?"after_delivery":"deposit",percent:best.value};
}
export function salesAiProseIssues(prose,{allowedNumbers=[],preferenceTerms=[]}={}){
  const text=String(prose||""),issues=[];
  if(!text.replace(SALES_AI_COMMERCIAL_SLOT,"").trim())issues.push("empty");
  if(text.length>1500)issues.push("too_long");
  const allowed=new Set(allowedNumbers.map(n=>String(n)));
  for(const m of text.match(DIGITS)||[]){const n=toAscii(m).replace(/[,٬]/g,"").replace(/[٫]/g,".");if(!allowed.has(n))issues.push("unapproved_number:"+n);}
  // Spoken numbers are grounded the same way (counting words below 10 — «یه ترکیب», «سه بخش» — are ordinary language).
  for(const m of gateNumberMentions(text.replaceAll(SALES_AI_COMMERCIAL_SLOT," ")))if(m.spoken&&m.value>=10&&!allowed.has(String(m.value)))issues.push("unapproved_number:"+m.value);
  // Commercial shape of a number, grounded or not: a duration, a money magnitude, a price, a minimum (they reach the customer only
  // through the deterministic segment).
  for(const raw of text.replaceAll(SALES_AI_COMMERCIAL_SLOT," ").split(/(?<=[.!?؟\n؛;])/u)){
    const s=gateNorm(raw),mentions=gateNumberMentions(raw);
    for(const m of mentions){
      if(GATE_TIME_UNITS.has(m.next)||(m.next==="تا"&&GATE_TIME_UNITS.has(m.next2)))issues.push("duration_claim");
      if(m.multiplied&&!GATE_QTY_UNITS.has(m.next))issues.push("money_number");
    }
    if(GATE_PRICE_WORDS.test(s)&&mentions.some(m=>!GATE_QTY_UNITS.has(m.next)&&m.next!=="dim"))issues.push("price_claim");
    if(GATE_MIN_WORDS.test(s)&&mentions.length)issues.push("moq_claim");
  }
  if(/(?:تومان|تومن|ریال|دلار|دولار|\$|USD|TOMAN|IQD|دینار)/iu.test(text))issues.push("currency");
  // A sentence that only RELAYS the customer's payment-terms request to the owner («۳۰ درصد بیعانه رو با مدیر هماهنگ می‌کنم») is not a
  // commercial claim: it is left out of the discount / payment checks (its numbers are still grounded). Agreeing or stating terms is not.
  const termsText=salesAiWithoutTermsRelays(text);
  if(/(?:تخفیف|خصم|discount|آف\b|درصد|[%٪]|بالمي[ةه]|بالمئ[ةه]|percent)/iu.test(termsText))issues.push("discount");
  if(gateConfirmationIssue(text,preferenceTerms))issues.push("order_commitment");
  if(/(?:سفارش[^.؟!?]{0,25}(?:ثبت|تایید|تأیید)\s*شد|(?:ثبت|تایید|تأیید)\s*شد[^.؟!?]{0,25}سفارش|تم\s*(?:تأكيد|تاكيد|تسجيل)\s*الطلب|سجلت\s*الطلب|order\s+(?:is\s+)?(?:confirmed|registered))/iu.test(text))issues.push("order_commitment");
  // The model is never given commercial knowledge (it is filtered out of its context), so any of these in its OWN words would be
  // invented: they reach the customer only through the deterministic segment ({{COMMERCIAL}}).
  if(/(?:ارسال|تحویل|آماده|تولید|توصيل|يوصل|الشحن|التسليم|يجهز|جاهز|delivery|ship|ready)[^.؟!?]{0,20}(?<![\p{L}])(?:روز|ساعت|هفته|ماه|يوم|أيام|أسبوع|ساعة|شهر|day|week|hour|month)(?:ه|ی|ها|s)?(?![\p{L}])|(?<![\p{L}])(?:روز|ساعت|هفته|ماه|يوم|أيام|أسبوع|ساعة|شهر|day|week|hour|month)(?:ه|ی|ها|s)?(?![\p{L}])[^.؟!?]{0,20}(?:ارسال|تحویل|آماده|تولید|توصيل|يوصل|الشحن|التسليم|يجهز|جاهز|delivery|ship|ready)|(?:در\s*حال\s*تولید|تولید\s*شد|ارسال\s*شد|تحویل\s*شد|پرداخت\s*شد|قيد\s*الإنتاج|تم\s*الشحن|تم\s*التسليم|تم\s*الدفع|shipped|delivered|in\s+production)/iu.test(text))issues.push("delivery_or_status_claim");
  if(/(?:ارسال|حمل|پست|تیپاکس|باربری|شحن|توصيل|shipping)\s*(?:رایگان|مجانی|مجاني|free|داریم|نداریم|انجام|می[‌\s]?کنیم|میشه|می[‌\s]?شه)/iu.test(text))issues.push("shipping_claim");
  if(/(?:پیش[‌\s]?پرداخت|بیعانه|کارت\s*به\s*کارت|قسطی|اقساط|عربون|دفعة\s*مقدمة|الدفع\s*(?:عند|مقدم|بالأقساط)|deposit|installment)/iu.test(termsText))issues.push("payment_claim");
  // Credit / pay-after-delivery / a payment schedule in the AI's own words is an unapproved payment term (relays excepted).
  if(SALES_AI_PAY_LATER.test(termsText)||SALES_AI_CHEQUE.test(termsText)||SALES_AI_INSTALMENT.test(termsText))issues.push("payment_claim");
  // Only an owner-recorded payment may be called received / confirmed — never the AI's words.
  if(/(?:(?:پرداخت|واریز|وجه|مبلغ|پول|بیعانه|پیش[‌\s]?پرداخت)[^.؟!?\n]{0,25}(?:تأیید|تایید|دریافت|ثبت|وصول|رسید)\s*(?:شد|شده|گردید|کردیم|کردم)|payment\s+(?:is\s+|was\s+|has\s+been\s+)?(?:confirmed|received)|(?:تم|تمت)\s*(?:استلام|تأكيد|تاكيد)\s*(?:ال)?(?:دفع|دفعه|دفعة|مبلغ|حواله|حوالة|تحويل)|وصلت?\s*(?:ال)?(?:فلوس|حواله|حوالة|دفعه|دفعة))/iu.test(text))issues.push("payment_claim");
  if(/(?:حداقل\s*(?:سفارش|تعداد)|الحد\s*الأدنى|\bmoq\b|minimum\s+order)/iu.test(text))issues.push("moq_claim");
  return [...new Set(issues)];
}
// What a preference acknowledgement may name: the approved colours and the model parts given to the model (colors.parts may be a
// list for the known model or a map model → parts). Accepts the colours object or the built input text.
export function salesAiPreferenceTerms(colors){
  if(typeof colors==="string"){try{colors=JSON.parse(colors.replace(/^CONTEXT:\s*/,"")).colors;}catch{colors=null;}}
  const parts=colors?.parts,list=Array.isArray(parts)?parts:parts&&typeof parts==="object"?Object.values(parts).flat():[];
  return [...(colors?.approved||[]),...list].filter(x=>typeof x==="string"&&x.trim());
}
// Colour discipline of the reply: every colour it names is approved, and a colour reported as unknown (or unsupported) is never offered.
export function salesAiColorIssues(decision,{approved=[],norm=gateNorm,unsupported=[]}={}){
  const issues=[],names=new Set(approved.map(norm)),reply=String(decision?.reply||"");
  for(const c of decision?.reply_colors||[])if(!names.has(norm(c)))issues.push("unapproved_color");
  for(const c of [...unsupported,...(decision?.facts?.unknown_colors||[])])if(c&&reply.includes(c)&&!/نیست|ندار|مو من|ما عدنا|not/u.test(reply))issues.push("unapproved_color_offered");
  return [...new Set(issues)];
}
