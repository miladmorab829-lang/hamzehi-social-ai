// TEMPORARY, ISOLATED smoke test of the REAL OpenAI model through the committed Sales AI Gateway (../src/sales-ai-brain.js).
//
// HTTP POST /run (Authorization: Bearer <SMOKE_OWNER_TOKEN>) → fixed cases A–J → synthetic read-only context → the production
// gateway functions (policy, context builder, structured-output call, normalisation) → sanitised JSON report.
//
// SCOPE: this validates the REAL provider/model (compatibility, structured output, Persian / Iraqi-Arabic understanding,
// multi-intent, follow-ups, corrections, ambiguity, raw commercial discipline). It is NOT a production integration test: it
// reuses the production salesAiProseIssues gate, but does NOT execute the complete production validateSalesBrainDraft /
// deterministic sales pipeline.
//
// It has no bindings (see wrangler.toml), accepts no prompt from the request, sends nothing anywhere except the OpenAI Responses
// API through the gateway, and never returns or logs a secret or a request header. The expected values below are only used to
// SCORE the model's answer afterwards; they are never sent to the model.
import { salesAiPolicy, buildSalesAiInput, callSalesAi, salesAiProseIssues, salesAiModel, SALES_AI_REQUESTS, SALES_AI_ESCALATIONS, SALES_AI_COMMERCIAL_SLOT } from "../src/sales-ai-brain.js";

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
  const allowed=new Set([...String(message+JSON.stringify(ctx.deal||{})+JSON.stringify(ctx.catalog||[])).matchAll(DIGITS)].map(m=>asc(m[0])));
  for(const m of t.match(DIGITS)||[])if(!allowed.has(asc(m)))issues.push("number_not_in_conversation:"+asc(m));
  const rules=[["price_or_currency",/(?:تومان|تومن|ریال|دلار|دولار|دينار|\$|USD|TOMAN|قیمت(?:ش)?\s*(?:هر|میشه|می‌شه|هست)|السعر\s*(?:هو|يكون))/iu],["discount",/(?:تخفیف|خصم|discount|درصد\s*کم)/iu],["moq",/(?:حداقل\s*(?:سفارش|تعداد)|الحد\s*الأدنى|minimum\s+order|\bmoq\b)/iu],
    ["shipping_or_delivery",/(?:ارسال|تحویل|پست|شحن|توصيل|delivery|shipping)[^.؟!?]{0,25}(?:رایگان|داریم|انجام|می[‌\s]?دیم|میدیم|می[‌\s]?کنیم|روز|هفته|يوم|مجاني|free)/iu],["production_time",/(?:آماده|تولید|جاهز|يجهز|ready)[^.؟!?]{0,20}(?:روز|هفته|ماه|يوم|أسبوع|day|week)|(?:روز|هفته|يوم|أسبوع)[^.؟!?]{0,20}(?:آماده|تولید|جاهز)/iu],
    ["payment_terms",/(?:پیش[‌\s]?پرداخت|بیعانه|کارت\s*به\s*کارت|قسط|عربون|دفعة|deposit|installment)/iu],["order_confirmation",/(?:سفارش[^.؟!?]{0,25}(?:ثبت|تایید|تأیید|نهایی)\s*شد|ثبت\s*شد|تم\s*(?:تأكيد|تسجيل)|سجلت\s*الطلب|order\s+(?:is\s+)?(?:confirmed|placed))/iu],
    ["capability_promise",/(?:چاپ|طلاکوب|لیزر|حک|برجسته|طباعة|ليزر|print|engrav)[^.؟!?]{0,30}(?:میزنیم|می[‌\s]?زنیم|انجام\s*می[‌\s]?دیم|داریم|می[‌\s]?تونیم|نسوي|نكدر|we\s+(?:do|can))/iu],
    ["availability_claim",/(?:موجود\s*(?:است|هست|داریم)|ناموجود|تموم\s*شده|in\s+stock|out\s+of\s+stock|متوفر\s*حالياً)/iu]];
  for(const [k,re] of rules)if(re.test(t))issues.push(k);
  const approved=new Set((ctx.colors?.approved||[]).map(c=>c.replace(/\s+/g," ")));
  for(const c of d.reply_colors)if(!approved.has(c.replace(/\s+/g," ")))issues.push("reply_colour_not_approved:"+c);
  // colour words in the reply that are not part of an approved option name the customer could be offered
  const approvedText=[...approved].join(" ");for(const m of t.match(COLOUR_WORDS)||[])if(!approvedText.includes(m)&&!message.includes(m))issues.push("colour_word_not_approved:"+m);
  return [...new Set(issues)];
}
// PROSE-GATE APPROXIMATION (not the full production validator). It calls the production salesAiProseIssues unchanged, plus two
// colour checks that mirror the brain's post-call gate: reply colours must be approved, and an unknown colour the model reported may
// not appear in its reply unless negated. Differences from production, stated honestly: colour names are compared with whitespace
// normalisation (production uses its own tokeniser in index.js); allowed numbers are only the message's numbers and the deal
// quantity (production also allows catalog / deal-requirement numbers, so this is stricter); validateSalesBrainDraft, the
// deterministic commercial segment and escalation logic are NOT executed here.
function proseGate(d,ctx,message){
  const allowedNumbers=[...new Set([...String(message).matchAll(DIGITS)].map(m=>Number(asc(m[0]))).concat(Number(ctx.deal?.quantity)||[]))].filter(Number.isFinite);
  const issues=salesAiProseIssues(d.reply,{allowedNumbers});
  const approved=new Set((ctx.colors?.approved||[]).map(c=>c.replace(/\s+/g," ")));
  for(const c of d.reply_colors)if(!approved.has(c.replace(/\s+/g," ")))issues.push("unapproved_color");
  for(const c of d.facts.unknown_colors)if(c&&d.reply.includes(c)&&!/نیست|ندار|مو من|ما عدنا|not/u.test(d.reply))issues.push("unapproved_color_offered");
  return issues;
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

// ---- one run of the fixed suite (sequential: one real call per case)
async function runSuite(env){
  const results=[],observed={};
  // Observe the gateway's own provider response (raw text + usage) without changing the request it makes; headers are never read.
  const realFetch=globalThis.fetch;
  // (Provider error bodies are reduced to their type/code only: OpenAI error messages can quote part of a key, so they are never kept.)
  globalThis.fetch=async(url,init)=>{const r=await realFetch(url,init);try{if(String(url)==="https://api.openai.com/v1/responses"){observed.status=r.status;const data=await r.clone().json();
    if(!r.ok){observed.provider_error={type:typeof data?.error?.type==="string"?data.error.type.slice(0,60):null,code:typeof data?.error?.code==="string"?data.error.code.slice(0,60):null};}
    else{let text=typeof data?.output_text==="string"?data.output_text:"";if(!text)for(const item of data?.output||[])for(const part of item?.content||[])if(typeof part?.text==="string")text+=part.text;observed.raw=text;observed.model=typeof data?.model==="string"?data.model.slice(0,80):null;observed.usage=data?.usage?{input_tokens:data.usage.input_tokens??null,output_tokens:data.usage.output_tokens??null}:null;}}}catch{}return r;};
  try{
    for(const c of CASES){
      for(const k of Object.keys(observed))delete observed[k];
      const input=buildSalesAiInput({...c.ctx,message:c.message});
      const res=await callSalesAi(env,{instructions:salesAiPolicy(c.ctx.language),input});
      let raw=null;try{raw=JSON.parse(String(observed.raw||"").match(/\{[\s\S]*\}/)?.[0]||"null");}catch{}
      const schemaErrors=res.ok?schemaCheck(raw):["no_decision"];
      const d=res.decision||null;
      const checks=d?c.expect.map(([name,fn])=>({check:name,pass:(()=>{try{return !!fn(d);}catch{return false;}})()})):[];
      const discipline=d?disciplineIssues(d,c.ctx,c.message):[];
      const gate=d?proseGate(d,c.ctx,c.message):[];
      // prose_gate_verdict: did the production prose gate (as approximated above) discard every raw output that the smoke-specific
      // discipline evaluator found unsafe? Capability / availability claims are judged in production by validateSalesBrainDraft,
      // which this Worker does NOT run — they are listed separately and never counted as covered by the prose gate.
      const gateMisses=discipline.filter(x=>!["capability_promise","availability_claim"].includes(x.split(":")[0]))
        .filter(()=>gate.length===0);
      results.push({
        case:c.id,label:c.label,model_requested:res.model,model_reported_by_provider:observed.model??null,
        provider_success:res.ok,provider_error:res.error||null,provider_error_detail:observed.provider_error||null,provider_status:observed.status??null,
        schema_valid:res.ok&&schemaErrors.length===0,schema_errors:schemaErrors,latency_ms:res.ms,
        tokens:observed.usage||null,input_chars:input.length,
        expected_language:c.lang,reply_script:d?scriptOf(d.reply):null,
        understood_requests:d?.requests||[],extracted_facts:d?.facts||null,
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
      });
    }
  }finally{globalThis.fetch=realFetch;}
  const lat=results.filter(r=>Number.isFinite(r.latency_ms)).map(r=>r.latency_ms).sort((a,b)=>a-b),pct=(n,of)=>of?Math.round(1000*n/of)/10:0;
  const decided=results.filter(r=>r.provider_success);
  const failed=results.filter(r=>!r.provider_success);
  return {scope:"This smoke test reuses the production salesAiProseIssues gate, but does not execute the complete production validateSalesBrainDraft / deterministic sales pipeline.",
    summary:{suite_status:failed.length?"PROVIDER_FAILURE — not a successful smoke test":"COMPLETED",
    model_requested:salesAiModel(env),models_reported_by_provider:[...new Set(results.map(r=>r.model_reported_by_provider).filter(Boolean))],
    timeout_ms_configured:Number(env.SALES_AI_TIMEOUT_MS)||8000,total_cases:results.length,total_real_openai_calls:results.length,retries:0,
    provider_failures:failed.map(r=>({case:r.case,error:r.provider_error,status:r.provider_status,detail:r.provider_error_detail})),
    provider_success_rate:pct(decided.length,results.length),schema_success_rate:pct(results.filter(r=>r.schema_valid).length,results.length),
    understanding_pass_rate:pct(results.filter(r=>r.understanding_verdict==="PASS").length,results.length),
    commercial_discipline_pass_rate:pct(decided.filter(r=>r.commercial_discipline_verdict==="PASS").length,decided.length),
    prose_gate_pass_rate:pct(decided.filter(r=>r.prose_gate_verdict==="PASS").length,decided.length),
    latency_min_ms:lat[0]??null,latency_median_ms:lat.length?lat[Math.floor((lat.length-1)/2)]:null,latency_max_ms:lat[lat.length-1]??null,
    timeout_count:results.filter(r=>r.provider_error==="provider_timeout").length},results};
}

// ---- HTTP: one route, owner-only, fixed suite, one run at a time (per isolate) with a cooldown.
let running=false,lastRun=0;
function sameSecret(a,b){a=String(a||"");b=String(b||"");if(!a||!b||a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
const json=(body,status=200)=>new Response(JSON.stringify(body,null,1),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
export default {
  async fetch(req,env){
    const url=new URL(req.url);
    if(url.pathname!=="/run")return json({ok:false,error:"not_found"},404);
    if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
    if(!env.SMOKE_OWNER_TOKEN||!env.OPENAI_API_KEY)return json({ok:false,error:"not_configured"},503);
    const auth=req.headers.get("Authorization")||"";
    if(!sameSecret(auth.startsWith("Bearer ")?auth.slice(7):"",env.SMOKE_OWNER_TOKEN))return json({ok:false,error:"unauthorized"},401);
    if(running)return json({ok:false,error:"already_running"},409);
    if(Date.now()-lastRun<60000)return json({ok:false,error:"cooldown_60s"},429);
    running=true;lastRun=Date.now();
    try{return json({ok:true,smoke:"sales-ai-real-openai",note:"fixed cases only; no data written anywhere; no Telegram",...await runSuite(env)});}
    catch{return json({ok:false,error:"suite_failed"},500);}
    finally{running=false;}
  }
};
