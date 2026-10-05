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
export function salesAiEnabled(env){return String(env?.SALES_AI_BRAIN||"off").toLowerCase()==="on"&&!!env?.OPENAI_API_KEY;}
// Provider/model are configuration, never hard-wired into the sales logic.
export function salesAiModel(env){return String(env?.SALES_AI_MODEL||env?.OPENAI_MODEL||"gpt-5.6-luna");}

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
export function salesAiProseIssues(prose,{allowedNumbers=[]}={}){
  const text=String(prose||""),issues=[];
  if(!text.replace(SALES_AI_COMMERCIAL_SLOT,"").trim())issues.push("empty");
  if(text.length>1500)issues.push("too_long");
  const allowed=new Set(allowedNumbers.map(n=>String(n)));
  for(const m of text.match(DIGITS)||[]){const n=toAscii(m).replace(/[,٬]/g,"").replace(/[٫]/g,".");if(!allowed.has(n))issues.push("unapproved_number:"+n);}
  if(/(?:تومان|تومن|ریال|دلار|دولار|\$|USD|TOMAN|IQD|دینار)/iu.test(text))issues.push("currency");
  if(/(?:تخفیف|خصم|discount|آف\b)/iu.test(text))issues.push("discount");
  if(/(?:سفارش[^.؟!?]{0,25}(?:ثبت|تایید|تأیید)\s*شد|(?:ثبت|تایید|تأیید)\s*شد[^.؟!?]{0,25}سفارش|تم\s*(?:تأكيد|تاكيد|تسجيل)\s*الطلب|سجلت\s*الطلب|order\s+(?:is\s+)?(?:confirmed|registered))/iu.test(text))issues.push("order_commitment");
  // The model is never given commercial knowledge (it is filtered out of its context), so any of these in its OWN words would be
  // invented: they reach the customer only through the deterministic segment ({{COMMERCIAL}}).
  if(/(?:ارسال|تحویل|آماده|تولید|توصيل|يوصل|الشحن|التسليم|يجهز|جاهز|delivery|ship|ready)[^.؟!?]{0,20}(?<![\p{L}])(?:روز|ساعت|هفته|ماه|يوم|أيام|أسبوع|ساعة|شهر|day|week|hour|month)(?:ه|ی|ها|s)?(?![\p{L}])|(?<![\p{L}])(?:روز|ساعت|هفته|ماه|يوم|أيام|أسبوع|ساعة|شهر|day|week|hour|month)(?:ه|ی|ها|s)?(?![\p{L}])[^.؟!?]{0,20}(?:ارسال|تحویل|آماده|تولید|توصيل|يوصل|الشحن|التسليم|يجهز|جاهز|delivery|ship|ready)|(?:در\s*حال\s*تولید|تولید\s*شد|ارسال\s*شد|تحویل\s*شد|پرداخت\s*شد|قيد\s*الإنتاج|تم\s*الشحن|تم\s*التسليم|تم\s*الدفع|shipped|delivered|in\s+production)/iu.test(text))issues.push("delivery_or_status_claim");
  if(/(?:ارسال|حمل|پست|تیپاکس|باربری|شحن|توصيل|shipping)\s*(?:رایگان|مجانی|مجاني|free|داریم|نداریم|انجام|می[‌\s]?کنیم|میشه|می[‌\s]?شه)/iu.test(text))issues.push("shipping_claim");
  if(/(?:پیش[‌\s]?پرداخت|بیعانه|کارت\s*به\s*کارت|قسطی|اقساط|عربون|دفعة\s*مقدمة|الدفع\s*(?:عند|مقدم|بالأقساط)|deposit|installment)/iu.test(text))issues.push("payment_claim");
  if(/(?:حداقل\s*(?:سفارش|تعداد)|الحد\s*الأدنى|\bmoq\b|minimum\s+order)/iu.test(text))issues.push("moq_claim");
  return issues;
}
