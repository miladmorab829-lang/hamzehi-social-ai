// TEMPORARY, ISOLATED smoke test of the REAL OpenAI model through the committed Sales AI Gateway (../src/sales-ai-brain.js).
//
// HTTP POST /run?case=<ID> (Authorization: Bearer <SMOKE_OWNER_TOKEN>) → ONE fixed case of A–J → synthetic read-only context → the production
// gateway functions (policy, context builder, structured-output call, normalisation) → sanitised JSON report.
//
// SCOPE: this validates the REAL provider/model (compatibility, structured output, Persian / Iraqi-Arabic understanding,
// multi-intent, follow-ups, corrections, ambiguity, raw commercial discipline). It is NOT a production integration test: it
// reuses the production salesAiProseIssues gate, but does NOT execute the complete production validateSalesBrainDraft /
// deterministic sales pipeline.
//
// It has no bindings (see wrangler.toml), accepts no prompt from the request, sends nothing anywhere except the configured provider
// (SALES_AI_PROVIDER: OpenAI Responses API or Anthropic Messages API) through the gateway, and never returns or logs a secret or a request header. The expected values below are only used to
// SCORE the model's answer afterwards; they are never sent to the model.
import { salesAiPolicy, buildSalesAiInput, callSalesAi, salesAiProseIssues, salesAiModel, salesAiProvider, salesAiGroundedNumbers, salesAiPreferenceTerms, salesAiColorIssues, salesAiSpokenNumbers, salesAiMessageQuantities, SALES_AI_REQUESTS, SALES_AI_ESCALATIONS, SALES_AI_COMMERCIAL_SLOT } from "../src/sales-ai-brain.js";

// ---- synthetic, read-only context pieces (shaped like the production context builder's output)
const COLORS_IR=["سفید سلفون","مشکی سلفون","قرمز سلفون","طلایی سلفون","سرمه‌ای سلفون","مشکی راه راه","کرم راه راه","نارنجی سلفون"];
const COLORS_AR=["أسود","ذهبي","أبيض"];
const CATALOG_IR=[{product:"نیم ست کوچک",models:["2 تکه","3 تکه","کشویی"],sizes:["7x9"]},{product:"نیم ست مربع",models:["2 تکه","3 تکه"],sizes:["8x8"]}];
const CATALOG_AR=[{product:"علبة طقم",models:["قطعتين","3 قطع"],sizes:["5x5"]}];
const PARTS_ALL_FA={three_piece:["بالا","وسط","پایین"],two_piece:["رویه","کف"],sliding:["بیرونی","داخل"]};
const base=(o={})=>({market:"IRAN",language:"Persian",customer:{name:null,destination:"تهران",earlier_profile:null},deal:null,commercial:{status:"needs_quantity",product:"نیم ست کوچک",quantity:null,needs:null},catalog:CATALOG_IR,colors:{approved:COLORS_IR,parts:PARTS_ALL_FA,suggestion:null,chosen:[],chosen_parts:null},knowledge:[{topic:"جنس",about:"global",value:"مقوای سخت با روکش سلفون"}],pending:[],stillNeeded:[],summary:null,summaryRequested:false,recent:[],...o});
const deal500={product:"نیم ست کوچک 3 تکه",model:"3 تکه",size:"7x9",quantity:500,status:"draft",order_registered:false};
const threePiece={approved:COLORS_IR,parts:["بالا","وسط","پایین"],suggestion:"often top and bottom the same colour, middle different (only a suggestion)",chosen:[],chosen_parts:null};

// ---- fixed cases (message + context + scoring expectations). Nothing here is sent to the model except message + context.
const qtyIs=n=>d=>d.facts.quantity===n;
const CASES=[
  {id:"A",label:"Persian multi-intent",lang:"Persian",ctx:base(),
   message:"سلام، برای نیم‌ست کوچک مدل ۳ تکه، ۵۰۰ عدد می‌خوام. چه رنگ‌هایی موجود دارید و چه ترکیب رنگی پیشنهاد می‌کنید؟",
   expect:[["quantity=500",qtyIs(500)],["product=نیم‌ست کوچک",d=>/نیم\s*‌?ست/u.test(d.facts.product||"")],["model=3-piece",d=>/3|۳|سه/u.test(d.facts.model||"")],["asks colours",d=>d.requests.includes("colors_available")],["asks recommendation",d=>d.requests.includes("color_recommendation")]]},
  {id:"B",label:"Persian contextual colour follow-up",lang:"Persian",ctx:base({deal:deal500,commercial:{status:"priced",product:"نیم ست کوچک 3 تکه",quantity:500,needs:null},colors:{...threePiece,chosen:["مشکی سلفون"],chosen_parts:{"بالا":"مشکی سلفون","پایین":"مشکی سلفون"}},recent:[{from:"customer",text:"نیم ست کوچک ۳ تکه ۵۰۰ تا میخوام"},{from:"assistant",text:"عالی، بالا و پایین مشکی سلفون یادداشت شد."}]}),
   message:"بالا و پایینشو مشکی بزن، واسه وسطش خودت یه رنگ خوب پیشنهاد بده",
   expect:[["asks middle recommendation",d=>d.requests.includes("color_recommendation")],["keeps top/bottom black",d=>d.facts.color_parts.every(p=>!["بالا","پایین"].includes(p.part)||/مشکی/u.test(p.color))],["does not restart: no product/quantity question",d=>!/چند\s*(?:عدد|تا)|کدوم\s*(?:محصول|مدل)|چه\s*مدل/u.test(d.reply)],["quantity unchanged",d=>d.facts.quantity===null||d.facts.quantity===500]]},
  {id:"C",label:"Persian quantity correction",lang:"Persian",ctx:base({deal:{...deal500,status:"offered"},commercial:{status:"priced",product:"نیم ست کوچک 3 تکه",quantity:500,needs:null},recent:[{from:"customer",text:"نیم ست کوچک ۳ تکه ۵۰۰ تا"},{from:"assistant",text:"قیمت ۵۰۰ عددی رو فرستادم؛ ثبتش کنم؟"}]}),
   message:"نه ۵۰۰ تا نمیخوام، ۷۰۰ تا حساب کن ببین چقدر میشه",
   expect:[["quantity=700",qtyIs(700)],["asks the authoritative price",d=>d.requests.includes("price")||d.reply.includes(SALES_AI_COMMERCIAL_SLOT)],["not an acceptance",d=>d.acceptance===false]]},
  {id:"D",label:"Persian discount negotiation",lang:"Persian",ctx:base({deal:{...deal500,status:"offered"},commercial:{status:"priced",product:"نیم ست کوچک 3 تکه",quantity:500,needs:null}}),
   message:"اگه تعدادو بیشتر کنم یه تخفیف خوب نمیدی؟",
   expect:[["discount request understood",d=>d.requests.includes("discount")],["defers to authority (slot or owner)",d=>d.reply.includes(SALES_AI_COMMERCIAL_SLOT)||d.owner_escalation_needed]]},
  {id:"E",label:"Iraqi Arabic multi-intent",lang:"Iraqi Arabic",ctx:base({market:"ARAB",language:"Iraqi Arabic",customer:{name:null,destination:"بغداد",earlier_profile:null},commercial:{status:"needs_quantity",product:"علبة طقم",quantity:null,needs:null},catalog:CATALOG_AR,colors:{approved:COLORS_AR,parts:{two_piece:["الغطاء","القاعدة"],three_piece:["الأعلى","الوسط","الأسفل"]},suggestion:null,chosen:[],chosen_parts:null},knowledge:[]}),
   message:"هلا عيوني، أريد علبة طقم قطعتين، ٣٠٠ حبة. شنو الألوان اللي عندكم وشنو تنصحني أختار؟ وبيش الحبة؟",
   expect:[["quantity=300",qtyIs(300)],["asks colours",d=>d.requests.includes("colors_available")],["asks recommendation",d=>d.requests.includes("color_recommendation")],["asks price",d=>d.requests.includes("price")||d.reply.includes(SALES_AI_COMMERCIAL_SLOT)],["reply in Arabic (no Persian letters)",d=>!/[پژکی]/u.test(d.reply)&&/[؀-ۿ]/u.test(d.reply)]]},
  {id:"F1",label:"unseen paraphrase",lang:"Persian",ctx:base({colors:threePiece}),message:"رنگای این سه تیکه‌ها چیا هست؟ یه چیز شیک میخوام",expect:[["asks colours",d=>d.requests.some(r=>["colors_available","color_recommendation"].includes(r))]]},
  {id:"F2",label:"unseen paraphrase",lang:"Persian",ctx:base(),message:"اگه بخوام کادوی شرکتی بدم، کدوم ترکیب رنگ بهتر درمیاد؟",expect:[["asks recommendation",d=>d.requests.includes("color_recommendation")]]},
  {id:"F3",label:"unseen paraphrase",lang:"Persian",ctx:base(),message:"واسه ۳۰۰ تا از همون دوتکه‌های کوچیک، قیمت آخرتون چیه؟",expect:[["quantity=300",qtyIs(300)],["asks price",d=>d.requests.includes("price")||d.reply.includes(SALES_AI_COMMERCIAL_SLOT)],["model=2-piece",d=>/2|۲|دو/u.test(d.facts.model||"")]]},
  {id:"F4",label:"unseen paraphrase",lang:"Persian",ctx:base(),message:"داداش این مدل کشویی رو به رنگ مشکی هم دارین؟",expect:[["asks colour availability",d=>d.requests.includes("colors_available")||d.requests.includes("choose_colors")],["model=sliding",d=>/کشو/u.test(d.facts.model||"")||/کشو/u.test(d.reply)]]},
  {id:"F5",label:"unseen paraphrase",lang:"Persian",ctx:base({deal:{...deal500,status:"offered"},commercial:{status:"priced",product:"نیم ست کوچک 3 تکه",quantity:500,needs:null}}),message:"خب پس من همین سه تکه رو برمیدارم ولی تعدادش بشه ۸۰۰",expect:[["quantity=800",qtyIs(800)]]},
  {id:"G",label:"noisy / typos",lang:"Persian",ctx:base(),message:"سلام وقت بخیر نیمستکوچیک سه تیکه میخاستم چهارصد تا رنگاشم چی دارین",
   expect:[["quantity=400",qtyIs(400)],["product understood",d=>/نیم/u.test(d.facts.product||"")],["asks colours",d=>d.requests.includes("colors_available")]]},
  {id:"H",label:"many commercial questions",lang:"Persian",ctx:base({colors:threePiece,commercial:{status:"priced",product:"نیم ست کوچک 3 تکه",quantity:500,needs:null}}),
   message:"چند تا سوال: چه رنگایی دارین؟ روش چاپ طلاکوب میزنید؟ حداقل سفارشتون چنده؟ ۵۰۰ تا چند درمیاد؟ کی آماده میشه؟",
   expect:[["≥4 of the 5 requests identified",d=>["colors_available","printing","moq","price","production_time"].filter(r=>d.requests.includes(r)).length>=4]]},
  {id:"I",label:"natural acceptance of a grounded offer",lang:"Persian",ctx:base({deal:{...deal500,status:"offered"},commercial:{status:"priced",product:"نیم ست کوچک 3 تکه",quantity:500,needs:null},recent:[{from:"assistant",text:"نیم ست کوچک 3 تکه برای ۵۰۰ عدد — قیمت رو فرستادم. ثبتش کنم؟"}]}),
   message:"عالیه، همینو برام نهایی کن بره",expect:[["acceptance understood",d=>d.acceptance===true||d.requests.includes("acceptance")],["not rejection",d=>d.rejection===false]]},
  {id:"J",label:"genuinely ambiguous",lang:"Persian",ctx:base({commercial:null}),message:"همون قبلیه رو میخوام فقط یه کم فرق داشته باشه",
   expect:[["no confident product/quantity invented",d=>!d.facts.quantity&&!d.facts.model],["not an acceptance",d=>d.acceptance===false],["asks for clarification",d=>d.missing_information.length>0||/[?؟]/u.test(d.reply)]]}
];

// ---- evaluation (independent of the application gate): is the RAW model output commercially disciplined?
const DIGITS=/[0-9۰-۹٠-٩]+/g,asc=s=>String(s).replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d));
const COLOUR_WORDS=/(?:بنفش|یاسی|صورتی|نقره‌?ای|نقره|سبز|آبی|زرد|خاکستری|طوسی|قهوه‌?ای|بژ|کرم|سفید|مشکی|قرمز|زرشکی|طلایی|سرمه‌?ای|نارنجی|بنفش|purple|pink|silver|green|blue|yellow|grey|gray|brown|beige|white|black|red|gold|navy|orange|أسود|ذهبي|أبيض|أحمر|أزرق|أخضر|فضي|وردي|بنفسجي|رمادي|بني|برتقالي)/giu;
function disciplineIssues(d,ctx,message){
  const t=d.reply,issues=[];
  // A number the customer SPOKE («چهارصد تا») is in the conversation exactly like one written in digits.
  const allowed=new Set([...[...String(message+JSON.stringify(ctx.deal||{})+JSON.stringify(ctx.catalog||[])).matchAll(DIGITS)].map(m=>asc(m[0])),...salesAiSpokenNumbers(message).map(String)]);
  for(const m of t.match(DIGITS)||[])if(!allowed.has(asc(m)))issues.push("number_not_in_conversation:"+asc(m));
  // «… ثبت شد / نهایی شد» is an order confirmation unless the sentence only acknowledges a preference: it names an approved colour or a
  // model part, and no order word and no number (evaluator's own reading, independent of the application gate).
  const prefs=[...(ctx.colors?.approved||[]),...(Array.isArray(ctx.colors?.parts)?ctx.colors.parts:Object.values(ctx.colors?.parts||{}).flat())];
  for(const s of String(t).split(/(?<=[.!?؟\n])/u))
    if(/(?:ثبت|تایید|تأیید|نهایی)\s*(?:شد|کردم|کردیم|می[‌\s]?شود|میشود|می[‌\s]?شه|میشه|خواهد\s*شد|می[‌\s]?کنیم|میکنیم)/u.test(s)&&!/[?؟]\s*$/u.test(s.trim())&&(/(?:سفارش|خرید|فاکتور|order)/iu.test(s)||/[0-9۰-۹٠-٩]/u.test(s)||!prefs.some(p=>s.includes(p))))issues.push("order_confirmation");
  const rules=[["price_or_currency",/(?:تومان|تومن|ریال|دلار|دولار|دينار|\$|USD|TOMAN|قیمت(?:ش)?\s*(?:هر|میشه|می‌شه|هست)|السعر\s*(?:هو|يكون))/iu],["discount",/(?:تخفیف|خصم|discount|درصد\s*کم)/iu],["moq",/(?:حداقل\s*(?:سفارش|تعداد)|الحد\s*الأدنى|minimum\s+order|\bmoq\b)/iu],
    ["shipping_or_delivery",/(?:ارسال|تحویل|پست|شحن|توصيل|delivery|shipping)[^.؟!?]{0,25}(?:رایگان|داریم|انجام|می[‌\s]?دیم|میدیم|می[‌\s]?کنیم|روز|هفته|يوم|مجاني|free)/iu],["production_time",/(?:آماده|تولید|جاهز|يجهز|ready)[^.؟!?]{0,20}(?:روز|هفته|ماه|يوم|أسبوع|day|week)|(?:روز|هفته|يوم|أسبوع)[^.؟!?]{0,20}(?:آماده|تولید|جاهز)/iu],
    ["payment_terms",/(?:پیش[‌\s]?پرداخت|بیعانه|کارت\s*به\s*کارت|قسط|عربون|دفعة|deposit|installment)/iu],["order_confirmation",/(?:سفارش[^.؟!?]{0,25}(?:ثبت|تایید|تأیید|نهایی)\s*شد|تم\s*(?:تأكيد|تسجيل)|سجلت\s*الطلب|order\s+(?:is\s+)?(?:confirmed|placed))/iu],
    ["capability_promise",/(?:چاپ|طلاکوب|لیزر|حک|برجسته|طباعة|ليزر|print|engrav)[^.؟!?]{0,30}(?:میزنیم|می[‌\s]?زنیم|انجام\s*می[‌\s]?دیم|داریم|می[‌\s]?تونیم|نسوي|نكدر|we\s+(?:do|can))/iu],
    ["availability_claim",/(?:موجود\s*(?:است|هست|داریم)|ناموجود|تموم\s*شده|in\s+stock|out\s+of\s+stock|متوفر\s*حالياً)/iu]];
  for(const [k,re] of rules)if(re.test(t))issues.push(k);
  const approved=new Set((ctx.colors?.approved||[]).map(c=>c.replace(/\s+/g," ")));
  for(const c of d.reply_colors)if(!approved.has(c.replace(/\s+/g," ")))issues.push("reply_colour_not_approved:"+c);
  // colour words in the reply that are not part of an approved option name the customer could be offered
  const approvedText=[...approved].join(" ");for(const m of t.match(COLOUR_WORDS)||[])if(!approvedText.includes(m)&&!message.includes(m))issues.push("colour_word_not_approved:"+m);
  return [...new Set(issues)];
}
// PROSE GATE: the production post-call gate functions themselves (salesAiProseIssues with salesAiGroundedNumbers of the built input +
// salesAiPreferenceTerms, and salesAiColorIssues). Differences from production, stated honestly: colour names are compared with
// whitespace normalisation (production passes its own tokeniser); production's extra D1 sources (stored quantity, deal requirements)
// do not exist here; validateSalesBrainDraft, the deterministic commercial segment and escalation logic are NOT executed here.
function proseGate(d,ctx,input){
  const allowedNumbers=[...new Set([...salesAiGroundedNumbers(input),...(Number(ctx.deal?.quantity)?[Number(ctx.deal.quantity)]:[])])];
  return [...salesAiProseIssues(d.reply,{allowedNumbers,preferenceTerms:salesAiPreferenceTerms(input)}),...salesAiColorIssues(d,{approved:ctx.colors?.approved||[],norm:c=>String(c).replace(/\s+/g," ").trim()})];
}
// Raw schema check against the strict contract (shape and enums), before any normalisation.
function schemaCheck(raw){
  const e=[],str=v=>v===null||typeof v==="string";
  if(!raw||typeof raw!=="object")return ["not_an_object"];
  for(const k of ["requests","facts","acceptance","rejection","owner_escalation_needed","escalation_reason","missing_information","summary_update","reply","reply_colors"])if(!(k in raw))e.push("missing:"+k);
  if(!Array.isArray(raw.requests)||raw.requests.some(r=>!SALES_AI_REQUESTS.includes(r)))e.push("requests");
  const f=raw.facts||{};for(const k of ["product","model","size","destination","customer_name"])if(!str(f[k]))e.push("facts."+k);
  if(!(f.quantity===null||Number.isInteger(f.quantity)))e.push("facts.quantity");
  if(!Array.isArray(f.colors)||!Array.isArray(f.color_parts)||!Array.isArray(f.unknown_colors))e.push("facts.colour_arrays");
  if(typeof raw.acceptance!=="boolean"||typeof raw.rejection!=="boolean"||typeof raw.owner_escalation_needed!=="boolean")e.push("booleans");
  if(!(raw.escalation_reason===null||SALES_AI_ESCALATIONS.includes(raw.escalation_reason)))e.push("escalation_reason");
  if(typeof raw.reply!=="string"||!Array.isArray(raw.reply_colors)||!Array.isArray(raw.missing_information))e.push("reply_fields");
  return e;
}
const scriptOf=t=>/[پچژکگی]/u.test(t)?"Persian":/[؀-ۿ]/u.test(t)?"Arabic":/[a-z]/i.test(t)?"Latin":"none";

// ---- ONE fixed case = at most ONE real provider call (the suite is run case by case, so no request waits for all 14 calls).
const SCOPE="This smoke test reuses the production salesAiProseIssues gate, but does not execute the complete production validateSalesBrainDraft / deterministic sales pipeline.";
const CASE_IDS=CASES.map(c=>c.id);
async function runCase(env,c){
  const observed={};
  // Observe the gateway's own provider response (raw text + usage) without changing the request it makes; headers are never read.
  const realFetch=globalThis.fetch;
  // (Provider error bodies are reduced to their type/code only: OpenAI error messages can quote part of a key, so they are never kept.)
  globalThis.fetch=async(url,init)=>{const r=await realFetch(url,init);try{if(String(url)==="https://api.openai.com/v1/responses"){observed.status=r.status;const data=await r.clone().json();
    if(!r.ok){observed.provider_error={type:typeof data?.error?.type==="string"?data.error.type.slice(0,60):null,code:typeof data?.error?.code==="string"?data.error.code.slice(0,60):null};}
    else{let text=typeof data?.output_text==="string"?data.output_text:"";if(!text)for(const item of data?.output||[])for(const part of item?.content||[])if(typeof part?.text==="string")text+=part.text;observed.raw=text;observed.model=typeof data?.model==="string"?data.model.slice(0,80):null;observed.usage=data?.usage?{input_tokens:data.usage.input_tokens??null,output_tokens:data.usage.output_tokens??null}:null;}}
    else if(String(url)==="https://api.anthropic.com/v1/messages"){observed.status=r.status;const data=await r.clone().json();
      // Anthropic error bodies: {type:"error",error:{type,message}} — only the type is kept (no message; there is no code field).
      if(!r.ok){observed.provider_error={type:typeof data?.error?.type==="string"?data.error.type.slice(0,60):null,code:null};}
      else{observed.raw=(Array.isArray(data?.content)?data.content:[]).filter(b=>b?.type==="text"&&typeof b.text==="string").map(b=>b.text).join("");
        observed.model=typeof data?.model==="string"?data.model.slice(0,80):null;observed.stop_reason=typeof data?.stop_reason==="string"?data.stop_reason.slice(0,40):null;
        observed.usage=data?.usage?{input_tokens:data.usage.input_tokens??null,output_tokens:data.usage.output_tokens??null}:null;}}}catch{}return r;};
  try{
      const input=buildSalesAiInput({...c.ctx,message:c.message});
      const res=await callSalesAi(env,{instructions:salesAiPolicy(c.ctx.language),input});
      let raw=null;try{raw=JSON.parse(String(observed.raw||"").match(/\{[\s\S]*\}/)?.[0]||"null");}catch{}
      const schemaErrors=res.ok?schemaCheck(raw):["no_decision"];
      const d=res.decision||null;
      const checks=d?c.expect.map(([name,fn])=>({check:name,pass:(()=>{try{return !!fn(d);}catch{return false;}})()})):[];
      const discipline=d?disciplineIssues(d,c.ctx,c.message):[];
      const gate=d?proseGate(d,c.ctx,input):[];
      // prose_gate_verdict: did the production prose gate (as approximated above) discard every raw output that the smoke-specific
      // discipline evaluator found unsafe? Capability / availability claims are judged in production by validateSalesBrainDraft,
      // which this Worker does NOT run — they are listed separately and never counted as covered by the prose gate.
      const gateMisses=discipline.filter(x=>!["capability_promise","availability_claim"].includes(x.split(":")[0]))
        .filter(()=>gate.length===0);
      return {
        case:c.id,label:c.label,provider:salesAiProvider(env),model_requested:res.model,model_reported_by_provider:observed.model??null,stop_reason:observed.stop_reason??null,
        provider_success:res.ok,provider_error:res.error||null,provider_error_detail:observed.provider_error||null,provider_status:observed.status??null,
        schema_valid:res.ok&&schemaErrors.length===0,schema_errors:schemaErrors,latency_ms:res.ms,
        tokens:observed.usage||null,input_chars:input.length,
        expected_language:c.lang,reply_script:d?scriptOf(d.reply):null,
        understood_requests:d?.requests||[],extracted_facts:d?.facts||null,
        // Production accepts an AI quantity only when the current message expresses it (salesAiMessageQuantities); null = no quantity.
        quantity_grounded:d?.facts?.quantity?salesAiMessageQuantities(c.message).includes(d.facts.quantity):null,
        requested_information:d?d.requests.filter(r=>["price","discount","moq","shipping","payment","production_time","printing","ribbon","size","colors_available","color_recommendation","order_status"].includes(r)):[],
        missing_information:d?.missing_information||[],
        clarification_or_escalation:d?{owner_escalation_needed:d.owner_escalation_needed,escalation_reason:d.escalation_reason,acceptance:d.acceptance,rejection:d.rejection}:null,
        response_draft:d?.reply??null,reply_colors:d?.reply_colors||[],
        understanding_checks:checks,
        understanding_verdict:d&&checks.every(x=>x.pass)?"PASS":"FAIL",
        commercial_discipline_issues:discipline,commercial_discipline_verdict:d?(discipline.length?"FAIL":"PASS"):"N/A",
        prose_gate_blocks:gate,
        prose_gate_verdict:d?(gateMisses.length?"FAIL":"PASS"):"N/A (no decision; production would answer deterministically)",
        not_covered_by_prose_gate:discipline.filter(x=>["capability_promise","availability_claim"].includes(x.split(":")[0]))
      };
  }finally{globalThis.fetch=realFetch;}
}

// ---- HTTP
//   GET  /manifest          public: the ordered fixed case ids + metadata (no secrets, no execution)
//   POST /run?case=<ID>     owner-only: runs EXACTLY that one fixed case (≤ 1 real provider call), returns its sanitised result
// The caller can only choose an id from the hard-coded allowlist; nothing else from the request is used. No /run-all on purpose:
// it would recreate the long synchronous request. One case runs at a time per isolate (the observer above patches fetch for the
// duration of a case); a repeat of the SAME case within 20 s in that isolate is refused (accidental double tap). Both guards are
// per-isolate only — the owner token is the real protection.
let busy=null;const lastRunOf=new Map();
function sameSecret(a,b){a=String(a||"");b=String(b||"");if(!a||!b||a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
const json=(body,status=200)=>new Response(JSON.stringify(body,null,1),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
export default {
  async fetch(req,env){
    const url=new URL(req.url);
    if(url.pathname==="/manifest"){
      if(req.method!=="GET")return json({ok:false,error:"method_not_allowed"},405);
      return json({ok:true,smoke:"sales-ai-real-openai",scope:SCOPE,cases:CASE_IDS,total_cases:CASE_IDS.length,labels:Object.fromEntries(CASES.map(c=>[c.id,c.label])),
        run:"POST /run?case=<ID> with Authorization: Bearer <SMOKE_OWNER_TOKEN> — one fixed case per request",max_provider_calls_per_request:1,retries:0,
        provider:salesAiProvider(env),model_requested:salesAiModel(env),timeout_ms_configured:Number(env.SALES_AI_TIMEOUT_MS)||8000});
    }
    // Owner-only egress diagnostic: what a Cloudflare-fronted site (like api.openai.com) sees for this Worker's outbound fetch.
    // Calls ONLY www.cloudflare.com/cdn-cgi/trace with no headers/secrets; never calls OpenAI.
    if(url.pathname==="/egress"){
      if(req.method!=="GET")return json({ok:false,error:"method_not_allowed"},405);
      const auth=req.headers.get("Authorization")||"";
      if(!env.SMOKE_OWNER_TOKEN||!sameSecret(auth.startsWith("Bearer ")?auth.slice(7):"",env.SMOKE_OWNER_TOKEN))return json({ok:false,error:"unauthorized"},401);
      let kv={};
      try{const t=await (await fetch("https://www.cloudflare.com/cdn-cgi/trace",{method:"GET"})).text();kv=Object.fromEntries(t.trim().split("\n").map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1)];}));}
      catch{return json({ok:false,error:"trace_fetch_failed",ingress_colo:req.cf?.colo??null,ingress_country:req.cf?.country??null},502);}
      return json({ok:true,ingress_colo:req.cf?.colo??null,ingress_country:req.cf?.country??null,
        egress_as_seen_by_cloudflare_zone:{ip:kv.ip??null,loc:kv.loc??null,colo:kv.colo??null}});
    }
    // Owner-only model verification: Anthropic Models API lookup of the configured model id (no generation, no cost). Returns only
    // the provider's status and the model's public metadata.
    if(url.pathname==="/model-info"){
      if(req.method!=="GET")return json({ok:false,error:"method_not_allowed"},405);
      const auth=req.headers.get("Authorization")||"";
      if(!env.SMOKE_OWNER_TOKEN||!sameSecret(auth.startsWith("Bearer ")?auth.slice(7):"",env.SMOKE_OWNER_TOKEN))return json({ok:false,error:"unauthorized"},401);
      if(salesAiProvider(env)!=="anthropic"||!env.ANTHROPIC_API_KEY)return json({ok:false,error:"not_configured"},503);
      const model=salesAiModel(env);
      try{const r=await fetch("https://api.anthropic.com/v1/models/"+encodeURIComponent(model),{headers:{"x-api-key":env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"}});
        const d=await r.json().catch(()=>null);
        return json({ok:r.ok,model_configured:model,provider_status:r.status,id:typeof d?.id==="string"?d.id:null,display_name:typeof d?.display_name==="string"?d.display_name:null,created_at:typeof d?.created_at==="string"?d.created_at:null,error_type:!r.ok&&typeof d?.error?.type==="string"?d.error.type:null});
      }catch{return json({ok:false,error:"lookup_failed"},502);}
    }
    if(url.pathname!=="/run")return json({ok:false,error:"not_found"},404);
    if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
    const providerKey=salesAiProvider(env)==="anthropic"?env.ANTHROPIC_API_KEY:salesAiProvider(env)==="openai"?env.OPENAI_API_KEY:null;
    if(!env.SMOKE_OWNER_TOKEN||!providerKey)return json({ok:false,error:"not_configured"},503);
    const auth=req.headers.get("Authorization")||"";
    if(!sameSecret(auth.startsWith("Bearer ")?auth.slice(7):"",env.SMOKE_OWNER_TOKEN))return json({ok:false,error:"unauthorized"},401);
    const id=url.searchParams.get("case");
    const c=CASES.find(x=>x.id===id);
    if(!c)return json({ok:false,error:id?"unknown_case":"case_required",allowed_cases:CASE_IDS},400);
    if(busy)return json({ok:false,error:"busy",running_case:busy},409);
    const last=lastRunOf.get(c.id);
    if(last&&Date.now()-last<20000)return json({ok:false,error:"same_case_cooldown_20s",case:c.id},429);
    busy=c.id;lastRunOf.set(c.id,Date.now());
    try{
      const result=await runCase(env,c);
      const index=CASE_IDS.indexOf(c.id);
      return json({ok:true,smoke:"sales-ai-real-openai",scope:SCOPE,case_index:index+1,total_cases:CASE_IDS.length,next_case:CASE_IDS[index+1]||null,
        provider_calls:1,retries:0,model_requested:salesAiModel(env),
        case_status:result.provider_success?"COMPLETED":"PROVIDER_FAILURE — not a successful case",result});
    }catch{return json({ok:false,error:"case_failed",case:c.id},500);}
    finally{busy=null;}
  }
};
