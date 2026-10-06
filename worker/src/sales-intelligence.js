// Sales Intelligence: structured product knowledge, deterministic request routing, versioned pricing/costs,
// Owner Decision Center, controlled learning, revenue attribution and AI usage accounting.
// Code holds engines and safety rules; business knowledge lives in owner-approved, versioned DB rows.
import { canonicalCurrency, MARKET_CURRENCY, CURRENCY_RULES } from "./autonomy-engine.js";

let D={};
// index.js injects shared helpers (audit, draft gate, quote/order helpers) to avoid a circular import.
export function configureSalesIntelligence(deps){D=deps||{};}

const now=()=>new Date().toISOString(),uid=()=>crypto.randomUUID();
const MARKETS=["IRAN","ARAB"];
// Protected rules: no setting, learning proposal or decision can change these.
export const LOCKED_RULES=Object.freeze({currency:{IRAN:"TOMAN",ARAB:"USD"},custom_price:"OWNER_REQUIRED",approval_gate:"REQUIRED",customer_auto_send:"DISABLED",unknown_commercial_facts:"ESCALATE_TO_OWNER",ledger:"APPEND_ONLY"});
const LOCKED_SETTING_KEYS=new Set(["market_currency","currency_rule","approval_gate","custom_price_requires_owner","ledger_integrity","unknown_fact_policy","trusted_auto_reply","auto_send"]);
const DECISION_STATUSES=new Set(["PENDING","RESOLVED","REJECTED","SUPERSEDED"]);
const DECISION_SCOPES=new Set(["CASE_ONLY","SAVE_AS_KNOWLEDGE","UPDATE_EXISTING","NEW_VERSION"]);
const KIND_DECISION={color:"UNKNOWN_COLOR",color_combination:"COLOR_COMBINATION",ribbon:"UNKNOWN_RIBBON",ribbon_type:"UNKNOWN_RIBBON",ribbon_color:"UNKNOWN_RIBBON",printing:"UNKNOWN_PRINTING",printing_colors:"UNKNOWN_PRINTING",printing_method:"UNKNOWN_PRINTING",material:"UNKNOWN_MATERIAL"};
const SYSTEM_REQUIREMENT_KEYS=new Set(["product","quantity","market","destination","qty","count"]);

function parseJson(value,fallback){try{const v=JSON.parse(value);return v??fallback}catch{return fallback}}
function digitsLatin(s){return String(s??"").replace(/[۰-۹]/g,c=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(c))).replace(/[٠-٩]/g,c=>String("٠١٢٣٤٥٦٧٨٩".indexOf(c)));}
export function normText(v){return digitsLatin(String(v??"").normalize("NFKC")).replace(/[يى]/g,"ی").replace(/ك/g,"ک").toLowerCase().replace(/\s+/g," ").trim();}
export function normKey(v){return normText(v).replace(/[^\p{L}\p{N}]+/gu,"_").replace(/^_+|_+$/g,"").slice(0,120)||null;}
function safeInt(v,{min=0,nullable=false,name="value"}={}){
  if(v===null||v===undefined||v===""){if(nullable)return null;throw Error(`${name} is required`);}
  const n=typeof v==="number"?v:Number(digitsLatin(String(v)).replace(/[\s,،]/g,""));
  if(!Number.isSafeInteger(n)||n<min)throw Error(`${name} must be a safe integer >= ${min}`);return n;
}
const first=async(env,sql,...b)=>await env.DB.prepare(sql).bind(...b).first();
const all=async(env,sql,...b)=>(await env.DB.prepare(sql).bind(...b).all()).results||[];
async function auditSafe(env,type,msg,details){try{await D.audit(env,type,msg,details);}catch{}}

/* ------------------------------------------------------------------ store */
export async function ensureSalesIntelligenceStore(env){
  if(D.ensureOrderStore)await D.ensureOrderStore(env);
  const ddl=[
    `CREATE TABLE IF NOT EXISTS product_catalog (id TEXT PRIMARY KEY,product_key TEXT NOT NULL,family TEXT,name TEXT NOT NULL,aliases_json TEXT NOT NULL DEFAULT '[]',
      version INTEGER NOT NULL,status TEXT NOT NULL,approved_by TEXT NOT NULL,approved_at TEXT NOT NULL,source_decision_id TEXT,created_at TEXT NOT NULL)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_product_catalog_current ON product_catalog(product_key) WHERE status='current'`,
    `CREATE TABLE IF NOT EXISTS product_attribute_schema (id TEXT PRIMARY KEY,product_key TEXT NOT NULL,attribute_key TEXT NOT NULL,label TEXT NOT NULL,attribute_kind TEXT NOT NULL,
      value_type TEXT NOT NULL,required INTEGER NOT NULL,commercial_critical INTEGER NOT NULL,allowed_values_json TEXT NOT NULL DEFAULT '[]',question_fa TEXT,question_ar TEXT,priority INTEGER NOT NULL DEFAULT 100,
      version INTEGER NOT NULL,status TEXT NOT NULL,approved_by TEXT NOT NULL,approved_at TEXT NOT NULL,source_decision_id TEXT,created_at TEXT NOT NULL)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_product_attribute_current ON product_attribute_schema(product_key,attribute_key) WHERE status='current'`,
    `CREATE TABLE IF NOT EXISTS product_configurations (id TEXT PRIMARY KEY,product_key TEXT NOT NULL,market TEXT NOT NULL,config_key TEXT NOT NULL,attributes_json TEXT NOT NULL,label TEXT,
      version INTEGER NOT NULL,status TEXT NOT NULL,approved_by TEXT NOT NULL,approved_at TEXT NOT NULL,source_decision_id TEXT,created_at TEXT NOT NULL)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_product_configuration_current ON product_configurations(product_key,market,config_key) WHERE status='current'`,
    `CREATE TABLE IF NOT EXISTS compatibility_rules (id TEXT PRIMARY KEY,rule_key TEXT NOT NULL,scope_json TEXT NOT NULL,attributes_json TEXT NOT NULL,verdict TEXT NOT NULL,
      version INTEGER NOT NULL,status TEXT NOT NULL,approved_by TEXT NOT NULL,approved_at TEXT NOT NULL,source_decision_id TEXT,created_at TEXT NOT NULL)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_compatibility_current ON compatibility_rules(rule_key) WHERE status='current'`,
    `CREATE TABLE IF NOT EXISTS price_versions (id TEXT PRIMARY KEY,market TEXT NOT NULL,product_key TEXT NOT NULL,config_key TEXT NOT NULL,quantity_min INTEGER NOT NULL,quantity_max INTEGER,
      currency TEXT NOT NULL,unit_price_minor INTEGER NOT NULL,moq INTEGER,conditions_json TEXT NOT NULL DEFAULT '{}',effective_from TEXT,effective_until TEXT,
      version INTEGER NOT NULL,status TEXT NOT NULL,approved_by TEXT NOT NULL,approved_at TEXT NOT NULL,source_decision_id TEXT,created_at TEXT NOT NULL)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_price_versions_current ON price_versions(market,product_key,config_key,quantity_min,COALESCE(quantity_max,-1)) WHERE status='current'`,
    `CREATE TABLE IF NOT EXISTS cost_versions (id TEXT PRIMARY KEY,market TEXT NOT NULL,product_key TEXT NOT NULL,config_key TEXT NOT NULL,quantity_min INTEGER NOT NULL,quantity_max INTEGER,
      component TEXT NOT NULL,basis TEXT NOT NULL,currency TEXT NOT NULL,amount_minor INTEGER NOT NULL,
      version INTEGER NOT NULL,status TEXT NOT NULL,approved_by TEXT NOT NULL,approved_at TEXT NOT NULL,source_decision_id TEXT,created_at TEXT NOT NULL)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_cost_versions_current ON cost_versions(market,product_key,config_key,quantity_min,COALESCE(quantity_max,-1),component) WHERE status='current'`,
    `CREATE TABLE IF NOT EXISTS business_settings (id TEXT PRIMARY KEY,setting_key TEXT NOT NULL,scope_key TEXT NOT NULL,value_json TEXT NOT NULL,
      version INTEGER NOT NULL,status TEXT NOT NULL,approved_by TEXT NOT NULL,approved_at TEXT NOT NULL,source_decision_id TEXT,created_at TEXT NOT NULL)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_business_settings_current ON business_settings(setting_key,scope_key) WHERE status='current'`,
    `CREATE TABLE IF NOT EXISTS sales_requests (id TEXT PRIMARY KEY,lead_id TEXT NOT NULL,conversation_id TEXT NOT NULL,market TEXT,product_key TEXT,product_text TEXT,quantity INTEGER,
      requirements_json TEXT NOT NULL DEFAULT '{}',unknown_json TEXT NOT NULL DEFAULT '[]',case_overrides_json TEXT NOT NULL DEFAULT '{}',request_class TEXT,matched_config_key TEXT,
      missing_json TEXT NOT NULL DEFAULT '[]',custom_reasons_json TEXT NOT NULL DEFAULT '[]',quote_id TEXT,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_requests_conversation ON sales_requests(conversation_id)`,
    `CREATE TABLE IF NOT EXISTS owner_decisions (id TEXT PRIMARY KEY,status TEXT NOT NULL,priority INTEGER NOT NULL DEFAULT 50,decision_type TEXT NOT NULL,fingerprint TEXT NOT NULL,
      lead_id TEXT,conversation_id TEXT,market TEXT,product_key TEXT,request_id TEXT,quote_id TEXT,order_id TEXT,owner_escalation_id TEXT,question TEXT NOT NULL,
      known_json TEXT NOT NULL DEFAULT '{}',missing_json TEXT NOT NULL DEFAULT '[]',conflicting_json TEXT NOT NULL DEFAULT '[]',history_json TEXT NOT NULL DEFAULT '[]',
      recommendation TEXT,risk TEXT,payload_json TEXT NOT NULL DEFAULT '{}',owner_decision TEXT,owner_answer_json TEXT,owner_note TEXT,scope_json TEXT,knowledge_action TEXT,
      resulting_ref TEXT,resolved_by TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,resolved_at TEXT)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_decisions_pending ON owner_decisions(fingerprint) WHERE status='PENDING'`,
    `CREATE INDEX IF NOT EXISTS idx_owner_decisions_status ON owner_decisions(status,priority)`,
    `CREATE TABLE IF NOT EXISTS knowledge_gaps (fingerprint TEXT PRIMARY KEY,decision_type TEXT NOT NULL,product_key TEXT,attribute_key TEXT,value_text TEXT,occurrences INTEGER NOT NULL,
      lead_ids_json TEXT NOT NULL DEFAULT '[]',examples_json TEXT NOT NULL DEFAULT '[]',first_seen TEXT NOT NULL,last_seen TEXT NOT NULL,status TEXT NOT NULL,proposal_decision_id TEXT,updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS draft_corrections (outreach_id TEXT PRIMARY KEY,lead_id TEXT,conversation_id TEXT,inbox_message_id TEXT,market TEXT,request_class TEXT,product_key TEXT,config_key TEXT,
      ai_draft TEXT,final_text TEXT,change_kind TEXT NOT NULL,changed_json TEXT NOT NULL DEFAULT '{}',owner_outcome TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS revenue_attribution (order_id TEXT PRIMARY KEY,lead_id TEXT,market TEXT,currency TEXT,lead_source TEXT,request_class TEXT,product_key TEXT,config_key TEXT,quantity INTEGER,
      quote_id TEXT,price_version_id TEXT,pricing_mode TEXT,discount_minor INTEGER,total_minor INTEGER,paid_minor INTEGER,profit_minor INTEGER,order_status TEXT,repeat_index INTEGER,created_at TEXT,updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS ai_usage_ledger (id TEXT PRIMARY KEY,module TEXT NOT NULL,task TEXT NOT NULL,provider TEXT,model TEXT,input_tokens INTEGER,output_tokens INTEGER,
      cost_status TEXT NOT NULL,cost_minor INTEGER,cost_currency TEXT,lead_id TEXT,conversation_id TEXT,quote_id TEXT,order_id TEXT,created_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_ai_usage_module ON ai_usage_ledger(module,created_at)`
  ];
  for(const sql of ddl)await env.DB.prepare(sql).run();
  // Price/cost/setting/configuration history is immutable: only the lifecycle status may change.
  const immutable={price_versions:["market","product_key","config_key","quantity_min","quantity_max","currency","unit_price_minor","moq","conditions_json","effective_from","effective_until","version","approved_by","approved_at","created_at"],
    cost_versions:["market","product_key","config_key","quantity_min","quantity_max","component","basis","currency","amount_minor","version","approved_by","approved_at","created_at"],
    business_settings:["setting_key","scope_key","value_json","version","approved_by","approved_at","created_at"],
    product_configurations:["product_key","market","config_key","attributes_json","version","approved_by","approved_at","created_at"]};
  for(const [table,cols] of Object.entries(immutable)){
    await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_${table}_immutable BEFORE UPDATE ON ${table} WHEN ${cols.map(c=>`NEW.${c} IS NOT OLD.${c}`).join(" OR ")} BEGIN SELECT RAISE(ABORT,'${table} history is immutable'); END`).run();
    await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_${table}_no_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'${table} history cannot be deleted'); END`).run();
  }
  for(const column of ["request_id TEXT","config_key TEXT","price_version_id TEXT","custom_price_decision_id TEXT","margin_json TEXT","discount_reason TEXT"]){
    try{await env.DB.prepare(`ALTER TABLE lead_quotes ADD COLUMN ${column}`).run();}
    catch(e){if(!/duplicate column|already exists/i.test(String(e?.message||e)))throw e;}
  }
  for(const column of ["owner_escalation_id TEXT"]){
    try{await env.DB.prepare(`ALTER TABLE owner_decisions ADD COLUMN ${column}`).run();}
    catch(e){if(!/duplicate column|already exists/i.test(String(e?.message||e)))throw e;}
  }
  await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_decisions_pending_escalation ON owner_decisions(owner_escalation_id) WHERE status='PENDING' AND owner_escalation_id IS NOT NULL AND owner_escalation_id<>''").run();
}

/* -------------------------------------------------------------- settings */
const SETTING_SPECS={
  quantity_tier_policy:v=>{const x=String(v||"").toUpperCase();if(!["EXACT","RANGE","MINIMUM_BREAK"].includes(x))throw Error("quantity_tier_policy must be EXACT, RANGE or MINIMUM_BREAK");return x;},
  margin_threshold_bp:v=>safeInt(v,{min:0,name:"margin_threshold_bp"}),
  required_cost_components:v=>{const a=(Array.isArray(v)?v:String(v||"").split(",")).map(normKey).filter(Boolean);if(!a.length)throw Error("required_cost_components needs at least one component");return [...new Set(a)];},
  learning_proposal_threshold:v=>safeInt(v,{min:2,name:"learning_proposal_threshold"}),
  quote_validity_days:v=>safeInt(v,{min:1,name:"quote_validity_days"}),
  shipping_pricing_mode:v=>{const x=String(v||"").toLowerCase();if(!["included","owner_quoted","fixed"].includes(x))throw Error("shipping_pricing_mode must be included, owner_quoted or fixed");return x;},
  shipping_fixed_minor:v=>safeInt(v,{min:0,name:"shipping_fixed_minor"}),
  quote_tax_mode:v=>{const x=String(v||"").toLowerCase();if(!["none","owner_quoted"].includes(x))throw Error("quote_tax_mode must be none or owner_quoted");return x;},
  quote_fees_mode:v=>{const x=String(v||"").toLowerCase();if(!["none","owner_quoted"].includes(x))throw Error("quote_fees_mode must be none or owner_quoted");return x;},
  quote_payment_terms:v=>{const x=String(v||"").trim().slice(0,1000);if(!x)throw Error("quote_payment_terms text is required");return x;},
  quote_delivery_terms:v=>{const x=String(v||"").trim().slice(0,1000);if(!x)throw Error("quote_delivery_terms text is required");return x;},
  payment_instructions:v=>{const x=String(v||"").trim().slice(0,2000);if(!x)throw Error("payment_instructions text is required");
    if(PAYMENT_TERMS_MARKERS.test(x))throw Error("payment_instructions must contain only bank / card / IBAN / account holder / contact details; payment terms (advance %, remaining, schedule) come from deposit_percent or an owner-approved per-order PAYMENT_TERMS decision");return x;},
  deposit_percent:v=>{const n=safeInt(v,{min:0,name:"deposit_percent"});if(n>100)throw Error("deposit_percent must be 0..100");return n;},
  discount_rule:v=>{const o=typeof v==="object"&&v?v:parseJson(v,{});if(!["percent_bp","amount_minor"].includes(o.type))throw Error("discount_rule.type must be percent_bp or amount_minor");return {type:o.type,value:safeInt(o.value,{min:0,name:"discount_rule.value"}),min_quantity:safeInt(o.min_quantity,{min:1,nullable:true,name:"discount_rule.min_quantity"})};},
  color_compatibility_policy:v=>{const x=String(v||"").toLowerCase();if(!["explicit_only","standard_values_allowed"].includes(x))throw Error("color_compatibility_policy must be explicit_only or standard_values_allowed");return x;},
  unknown_feature_terms:v=>{const a=(Array.isArray(v)?v:String(v||"").split(",")).map(normText).filter(Boolean);if(!a.length)throw Error("unknown_feature_terms needs at least one term");return [...new Set(a)];},
  moq:v=>safeInt(v,{min:1,name:"moq"}),
  shipping_amount_minor:v=>safeInt(v,{min:0,name:"shipping_amount_minor"}),
  tax_minor:v=>safeInt(v,{min:0,name:"tax_minor"}),
  other_fees_minor:v=>safeInt(v,{min:0,name:"other_fees_minor"}),
  ai_model_small:v=>String(v||"").trim().slice(0,120),
  ai_model_strong:v=>String(v||"").trim().slice(0,120),
  ai_model_pricing:v=>{const o=typeof v==="object"&&v?v:parseJson(v,{});for(const [m,p] of Object.entries(o)){safeInt(p.input_per_mtok_minor,{name:`${m}.input_per_mtok_minor`});safeInt(p.output_per_mtok_minor,{name:`${m}.output_per_mtok_minor`});if(!p.currency)throw Error(`${m}.currency is required`);}return o;}
};
export function settingScopeKey(scope={}){
  if(typeof scope==="string")return scope||"global";
  const parts=[];if(scope.market){if(!MARKETS.includes(scope.market))throw Error("Invalid scope market");parts.push(`market:${scope.market}`);}
  if(scope.product_key)parts.push(`product:${normKey(scope.product_key)}`);if(scope.config_key)parts.push(`config:${scope.config_key}`);
  return parts.join("|")||"global";
}
function scopeCandidates({market,product_key,config_key}={}){
  const c=[];const p=product_key?`product:${product_key}`:null,cf=config_key?`config:${config_key}`:null,m=market?`market:${market}`:null;
  if(m&&p&&cf)c.push(`${m}|${p}|${cf}`);if(p&&cf)c.push(`${p}|${cf}`);if(m&&p)c.push(`${m}|${p}`);if(p)c.push(p);if(m)c.push(m);c.push("global");return c;
}
// Payment TERMS (advance %, remaining, when / how the balance is paid) never live inside the payment instructions: the instructions
// are the payment DESTINATION only (bank, card, IBAN, holder, contact). Terms come from deposit_percent or a per-order override.
export const PAYMENT_TERMS_MARKERS=/[%٪]|درصد|پیش[‌\s]?پرداخت|پیش[‌\s]?قسط|بیعانه|علی[‌\s]?الحساب|باقی[‌\s]?مانده|مانده[‌\s]?حساب|تسویه|(?:قبل|بعد|پس)\s*از\s*(?:ارسال|تحویل|دریافت)|اقساط|قسطی|نسیه|عربون|العربون|دفعة\s*مقدمة|مقدماً|المتبقي|الباقي|بالمي[ةه]|بالمئ[ةه]|deposit|advance|remaining|balance\s+due|percent|installment/iu;
// Legacy text that mixes terms into the instructions: only the sentences without any terms marker are kept (null when nothing
// remains, so the owner is asked again instead of sending terms that contradict the order's own).
export function paymentDestinationOnly(text){
  const kept=String(text??"").split(/(?<=[.!؟?\n؛;])/u).filter(part=>part.trim()&&!PAYMENT_TERMS_MARKERS.test(part)).join("").trim();
  return kept||null;
}
export async function getSetting(env,key,ctx={}){
  const cands=scopeCandidates(ctx);
  const rows=await all(env,`SELECT * FROM business_settings WHERE setting_key=? AND status='current' AND scope_key IN (${cands.map(()=>"?").join(",")})`,key,...cands);
  for(const c of cands){const r=rows.find(x=>x.scope_key===c);if(r)return {value:parseJson(r.value_json,null),scope_key:r.scope_key,id:r.id,version:r.version};}
  return null;
}

/* ------------------------------------------------------ versioned knowledge */
const KINDS={
  product:{table:"product_catalog",identity:["product_key"],cols:["product_key","family","name","aliases_json"]},
  attribute:{table:"product_attribute_schema",identity:["product_key","attribute_key"],cols:["product_key","attribute_key","label","attribute_kind","value_type","required","commercial_critical","allowed_values_json","question_fa","question_ar","priority"]},
  configuration:{table:"product_configurations",identity:["product_key","market","config_key"],cols:["product_key","market","config_key","attributes_json","label"]},
  compatibility:{table:"compatibility_rules",identity:["rule_key"],cols:["rule_key","scope_json","attributes_json","verdict"]},
  price:{table:"price_versions",identity:["market","product_key","config_key","quantity_min","quantity_max"],cols:["market","product_key","config_key","quantity_min","quantity_max","currency","unit_price_minor","moq","conditions_json","effective_from","effective_until"]},
  cost:{table:"cost_versions",identity:["market","product_key","config_key","quantity_min","quantity_max","component"],cols:["market","product_key","config_key","quantity_min","quantity_max","component","basis","currency","amount_minor"]},
  setting:{table:"business_settings",identity:["setting_key","scope_key"],cols:["setting_key","scope_key","value_json"]}
};
export const KNOWLEDGE_KINDS=Object.keys(KINDS);
function normalizeAllowedValues(list){
  const out=[];for(const v of Array.isArray(list)?list:[]){const o=typeof v==="object"&&v?v:{value:v};const value=normText(o.value);if(!value)continue;
    out.push({value,label:String(o.label||o.value).trim().slice(0,120),aliases:[...new Set((o.aliases||[]).map(normText).filter(Boolean))]});}
  const seen=new Set();return out.filter(x=>!seen.has(x.value)&&seen.add(x.value));
}
export function configKeyFor(attributes){return Object.keys(attributes).sort().map(k=>`${k}=${attributes[k]}`).join("|");}
function lockedCurrencyFor(market,currency){
  if(!MARKETS.includes(market))throw Error("market must be IRAN or ARAB");
  const required=MARKET_CURRENCY[market],c=canonicalCurrency(currency||required);
  if(c!==required)throw Error(`Locked currency rule: ${market} uses ${required} (got ${c})`);return required;
}
async function currentProductKnowledge(env,productKey){
  const product=await first(env,"SELECT * FROM product_catalog WHERE product_key=? AND status='current' LIMIT 1",productKey);
  const attributes=(await all(env,"SELECT * FROM product_attribute_schema WHERE product_key=? AND status='current' ORDER BY priority,attribute_key",productKey)).map(a=>({...a,allowed:parseJson(a.allowed_values_json,[])}));
  const configurations=(await all(env,"SELECT * FROM product_configurations WHERE product_key=? AND status='current'",productKey)).map(c=>({...c,attributes:parseJson(c.attributes_json,{})}));
  return {product,attributes,configurations};
}
async function normalizeKnowledgeInput(env,kind,input){
  const i=input||{};
  if(kind==="product"){
    const product_key=normKey(i.product_key||i.name),name=String(i.name||"").trim().slice(0,160);if(!product_key||!name)throw Error("product name is required");
    return {product_key,family:normKey(i.family)||null,name,aliases_json:JSON.stringify([...new Set((i.aliases||[]).map(normText).filter(Boolean))])};
  }
  if(kind==="attribute"){
    const product_key=normKey(i.product_key),attribute_key=normKey(i.attribute_key||i.label);if(!product_key||!attribute_key)throw Error("product_key and attribute_key are required");
    if(SYSTEM_REQUIREMENT_KEYS.has(attribute_key))throw Error(`${attribute_key} is a system requirement, not a product attribute`);
    if(!await first(env,"SELECT id FROM product_catalog WHERE product_key=? AND status='current'",product_key))throw Error("Unknown product; add the product first");
    const value_type=["enum","number","text"].includes(i.value_type)?i.value_type:"enum";
    const allowed=normalizeAllowedValues(i.allowed_values);if(value_type==="enum"&&!allowed.length&&i.required)throw Error("A required enum attribute needs approved values");
    return {product_key,attribute_key,label:String(i.label||attribute_key).trim().slice(0,120),attribute_kind:normKey(i.attribute_kind)||"other",value_type,required:i.required?1:0,
      commercial_critical:i.commercial_critical===false||i.commercial_critical===0?0:1,allowed_values_json:JSON.stringify(allowed),
      question_fa:String(i.question_fa||"").trim().slice(0,500)||null,question_ar:String(i.question_ar||"").trim().slice(0,500)||null,priority:safeInt(i.priority??100,{name:"priority"})};
  }
  if(kind==="configuration"){
    const product_key=normKey(i.product_key),market=i.market&&i.market!=="*"?String(i.market).toUpperCase():"*";if(market!=="*"&&!MARKETS.includes(market))throw Error("market must be IRAN, ARAB or *");
    const k=await currentProductKnowledge(env,product_key);if(!k.product)throw Error("Unknown product");
    const attrs={};const given=i.attributes||{};
    for(const a of k.attributes.filter(x=>x.commercial_critical)){
      const raw=given[a.attribute_key];if(raw===undefined||raw===null||raw==="")throw Error(`Configuration must define critical attribute ${a.attribute_key}`);
      const v=matchAllowedValue(a,raw);if(v===null)throw Error(`${raw} is not an approved ${a.attribute_key} value; approve the value first`);attrs[a.attribute_key]=v;
    }
    for(const key of Object.keys(given))if(!k.attributes.some(a=>a.attribute_key===normKey(key)))throw Error(`Unknown attribute ${key} for this product`);
    return {product_key,market,config_key:configKeyFor(attrs),attributes_json:JSON.stringify(attrs),label:String(i.label||"").trim().slice(0,160)||null};
  }
  if(kind==="compatibility"){
    const scope={};for(const [k2,v] of Object.entries(i.scope||{}))if(v!==undefined&&v!==null&&v!=="")scope[normKey(k2)]=k2==="market"?String(v).toUpperCase():normText(v);
    const attrs={};for(const [k2,v] of Object.entries(i.attributes||{}))attrs[normKey(k2)]=normText(v);
    if(Object.keys(attrs).length<2)throw Error("A compatibility rule combines at least two attribute values");
    const verdict=["approved","forbidden"].includes(i.verdict)?i.verdict:null;if(!verdict)throw Error("verdict must be approved or forbidden");
    return {rule_key:`${configKeyFor(scope)}#${configKeyFor(attrs)}`,scope_json:JSON.stringify(scope),attributes_json:JSON.stringify(attrs),verdict};
  }
  if(kind==="price"||kind==="cost"){
    const market=String(i.market||"").toUpperCase(),currency=lockedCurrencyFor(market,i.currency),product_key=normKey(i.product_key);
    if(!product_key||!await first(env,"SELECT id FROM product_catalog WHERE product_key=? AND status='current'",product_key))throw Error("Unknown product");
    const config_key=kind==="cost"&&(!i.config_key||i.config_key==="*")?"*":String(i.config_key||"");
    if(config_key!=="*"&&!await first(env,"SELECT id FROM product_configurations WHERE product_key=? AND config_key=? AND market IN (?,'*') AND status='current'",product_key,config_key,market))throw Error("Price/cost must reference a current approved configuration");
    const quantity_min=safeInt(i.quantity_min??1,{min:1,name:"quantity_min"}),quantity_max=safeInt(i.quantity_max,{min:1,nullable:true,name:"quantity_max"});
    if(quantity_max!==null&&quantity_max<quantity_min)throw Error("quantity_max must be >= quantity_min");
    if(kind==="price"){
      const effective_from=i.effective_from?new Date(i.effective_from).toISOString():null,effective_until=i.effective_until?new Date(i.effective_until).toISOString():null;
      return {market,product_key,config_key,quantity_min,quantity_max,currency,unit_price_minor:safeInt(i.unit_price_minor,{min:1,name:"unit_price_minor"}),
        moq:safeInt(i.moq,{min:1,nullable:true,name:"moq"}),conditions_json:JSON.stringify(i.conditions&&typeof i.conditions==="object"?i.conditions:{}),effective_from,effective_until};
    }
    const basis=["per_unit","per_order"].includes(i.basis)?i.basis:null;if(!basis)throw Error("basis must be per_unit or per_order");
    const component=normKey(i.component);if(!component)throw Error("component is required");
    return {market,product_key,config_key,quantity_min,quantity_max,component,basis,currency,amount_minor:safeInt(i.amount_minor,{min:0,name:"amount_minor"})};
  }
  if(kind==="setting"){
    const setting_key=normKey(i.setting_key);if(!setting_key)throw Error("setting_key is required");
    if(LOCKED_SETTING_KEYS.has(setting_key))throw Error(`Locked rule: ${setting_key} cannot be changed by settings or learning`);
    const spec=SETTING_SPECS[setting_key],value=spec?spec(i.value):i.value;if(value===undefined)throw Error("value is required");
    return {setting_key,scope_key:settingScopeKey(i.scope),value_json:JSON.stringify(value)};
  }
  throw Error("Unknown knowledge kind");
}
function sameKnowledge(cur,row,cols){return cols.every(c=>String(cur[c]??"")===String(row[c]??""));}
export async function saveKnowledgeVersion(env,kind,input,{actor="owner",decisionId=null,expectExisting=false}={}){
  await ensureSalesIntelligenceStore(env);
  const spec=KINDS[kind];if(!spec)throw Error("Unknown knowledge kind");
  const row=await normalizeKnowledgeInput(env,kind,input);
  const where=spec.identity.map(c=>row[c]===null?`${c} IS NULL`:`${c}=?`).join(" AND "),binds=spec.identity.filter(c=>row[c]!==null).map(c=>row[c]);
  const cur=await first(env,`SELECT * FROM ${spec.table} WHERE ${where} AND status='current' LIMIT 1`,...binds);
  if(expectExisting&&!cur)throw Error("No current knowledge exists to update");
  if(cur&&sameKnowledge(cur,row,spec.cols))return {created:false,idempotent:true,row:cur};
  const max=await first(env,`SELECT MAX(version) AS v FROM ${spec.table} WHERE ${where}`,...binds),id=uid(),t=now(),version=Number(max?.v||0)+1;
  const cols=[...spec.cols,"id","version","status","approved_by","approved_at","source_decision_id","created_at"],vals=[...spec.cols.map(c=>row[c]),id,version,"current",String(actor||"owner").slice(0,120),t,decisionId,t];
  const stmts=[];if(cur)stmts.push(env.DB.prepare(`UPDATE ${spec.table} SET status='superseded' WHERE id=? AND status='current'`).bind(cur.id));
  stmts.push(env.DB.prepare(`INSERT INTO ${spec.table}(${cols.join(",")}) VALUES(${cols.map(()=>"?").join(",")})`).bind(...vals));
  await env.DB.batch(stmts);
  const saved=await first(env,`SELECT * FROM ${spec.table} WHERE id=?`,id);
  await auditSafe(env,"knowledge_version_saved","Owner-approved knowledge version saved",{kind,id,version,superseded:cur?.id||null,decision_id:decisionId,actor});
  return {created:true,row:saved,superseded_id:cur?.id||null};
}
export async function retireKnowledge(env,kind,id,actor="owner"){
  const spec=KINDS[kind];if(!spec)throw Error("Unknown knowledge kind");
  const r=await env.DB.prepare(`UPDATE ${spec.table} SET status='retired' WHERE id=? AND status='current'`).bind(id).run();
  if(!r.meta?.changes)throw Error("Only current knowledge can be retired");
  await auditSafe(env,"knowledge_version_retired","Owner retired knowledge",{kind,id,actor});return {retired:true,id};
}
export async function listKnowledge(env,kind,{search="",status="current",identity=null}={}){
  await ensureSalesIntelligenceStore(env);const spec=KINDS[kind];if(!spec)throw Error("Unknown knowledge kind");
  const where=[],binds=[];if(status!=="all"){where.push("status=?");binds.push(status);}
  if(search){where.push(`(${spec.cols.map(c=>`CAST(${c} AS TEXT) LIKE ?`).join(" OR ")})`);for(const _ of spec.cols)binds.push(`%${search}%`);}
  if(identity)for(const [k,v] of Object.entries(identity))if(spec.identity.includes(k)){where.push(`${k}=?`);binds.push(v);}
  return await all(env,`SELECT * FROM ${spec.table} ${where.length?"WHERE "+where.join(" AND "):""} ORDER BY ${spec.identity.join(",")},version DESC LIMIT 300`,...binds);
}

/* ------------------------------------------------- requirements + router */
function matchAllowedValue(attribute,raw){
  const v=normText(raw);if(!v)return null;
  for(const a of attribute.allowed||parseJson(attribute.allowed_values_json,[]))if(a.value===v||(a.aliases||[]).includes(v))return a.value;
  return null;
}
function containsTerm(text,term){
  if(!term)return false;const esc=term.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`,"u").test(text);
}
export async function resolveProduct(env,text){
  const t=normText(text);if(!t)return {status:"none"};
  const products=await all(env,"SELECT * FROM product_catalog WHERE status='current'");
  const hits=products.filter(p=>[p.product_key.replace(/_/g," "),normText(p.name),...parseJson(p.aliases_json,[])].some(term=>term&&(t===term||containsTerm(t,term))));
  if(hits.length===1)return {status:"matched",product:hits[0]};
  if(hits.length>1)return {status:"ambiguous",candidates:hits.map(p=>p.product_key)};
  return {status:products.length?"unknown":"catalog_empty"};
}
// Deterministic extraction: approved values/aliases, labelled "key: value" pairs and owner-defined unknown-feature terms.
export function extractRequirements({message="",attributes=[],sourceId=null,watchTerms=[]}={}){
  const text=normText(message),found={},unknown=[],conflicts=[],at=now();
  for(const a of attributes){
    const hits=new Set();for(const v of a.allowed||[])for(const term of [v.value,...(v.aliases||[])])if(containsTerm(text,term))hits.add(v.value);
    if(hits.size===1)found[a.attribute_key]={value:[...hits][0],source:sourceId,at};else if(hits.size>1)conflicts.push({attribute:a.attribute_key,values:[...hits]});
  }
  // "key: value" pairs; a value ends at a separator or where the next label's key word starts ("printing: foil material: velvet").
  const msg=String(message||""),labels=[...msg.matchAll(/([\p{L}_][\p{L}\p{N}_]*(?:\s[\p{L}_][\p{L}\p{N}_]*)?)\s*[:：=]\s*/gu)];
  const keyStart=m=>{const w=m[1].trim().split(/\s+/);return m.index+m[1].lastIndexOf(w[w.length-1]);};
  for(let i=0;i<labels.length;i++){
    const m=labels[i],words=m[1].trim().split(/\s+/),end=i+1<labels.length?keyStart(labels[i+1]):msg.length;
    const raw=msg.slice(m.index+m[0].length,end).split(/[\n,،;؛]/)[0].trim();if(!raw)continue;
    const cands=[...new Set([normKey(words.join(" ")),normKey(words[words.length-1])])].filter(Boolean);
    const a=attributes.find(x=>cands.some(k=>x.attribute_key===k||normKey(x.label)===k)),key=cands[cands.length-1];
    if(!key||cands.some(k=>SYSTEM_REQUIREMENT_KEYS.has(k)))continue;
    if(a){const v=a.value_type==="enum"?matchAllowedValue(a,raw):normText(raw);found[a.attribute_key]={value:v===null?normText(raw):v,source:sourceId,at,approved:v!==null||a.value_type!=="enum"};}
    // An unlabelled-by-schema "key: value" only counts as a requested feature when the owner listed the key as a feature term.
    else if(cands.some(k=>watchTerms.includes(normText(k.replace(/_/g," ")))))unknown.push({attribute:key,value:normText(raw),source:sourceId});
  }
  for(const term of watchTerms)if(containsTerm(text,term)&&!attributes.some(a=>(a.allowed||[]).some(v=>v.value===term||(v.aliases||[]).includes(term))))unknown.push({attribute:"requested_feature",value:term,source:sourceId});
  const seen=new Set();return {attributes:found,unknown:unknown.filter(u=>{const k=u.attribute+"="+u.value;return !seen.has(k)&&seen.add(k);}),conflicts};
}
export function classifyOrderRequest({product,productText,market,quantity,attributes=[],configurations=[],compatibilityRules=[],requirements={},unknown=[],overrides={},policy=null}){
  const missing=[],custom=[];
  if(!product){if(productText)custom.push({type:"UNKNOWN_PRODUCT_SPEC",attribute:"product",value:normText(productText)});else missing.push("product");
    return {request_class:custom.length?"CUSTOM":"UNCLEAR",missing,custom_reasons:custom,matched_config:null};}
  if(!market)missing.push("market");
  if(!Number.isSafeInteger(Number(quantity))||Number(quantity)<=0)missing.push("quantity");
  const approved=overrides.approved_values||{};
  for(const u of unknown){const ok=(approved[u.attribute]||[]).includes(u.value);custom.push({type:"UNKNOWN_PRODUCT_SPEC",attribute:u.attribute,value:u.value,case_approved:ok});}
  for(const a of attributes){
    const r=requirements[a.attribute_key];if(!r||r.value===null||r.value===undefined||r.value===""){if(a.required)missing.push(a.attribute_key);continue;}
    if(a.value_type==="enum"&&matchAllowedValue(a,r.value)===null){
      const ok=(approved[a.attribute_key]||[]).includes(normText(r.value));
      custom.push({type:KIND_DECISION[a.attribute_kind]||"UNKNOWN_PRODUCT_SPEC",attribute:a.attribute_key,value:normText(r.value),case_approved:ok});
    }
  }
  if(custom.length)return {request_class:"CUSTOM",missing,custom_reasons:custom,matched_config:null};
  if(missing.length)return {request_class:"UNCLEAR",missing,custom_reasons:[],matched_config:null};
  const critical={};for(const a of attributes.filter(x=>x.commercial_critical))critical[a.attribute_key]=matchAllowedValue(a,requirements[a.attribute_key]?.value)??null;
  const missingCritical=Object.entries(critical).filter(([,v])=>v===null).map(([k])=>k);
  if(missingCritical.length)return {request_class:"UNCLEAR",missing:missingCritical,custom_reasons:[],matched_config:null};
  const key=configKeyFor(critical);
  const cfg=configurations.find(c=>c.config_key===key&&(c.market==="*"||c.market===market))||null;
  if(cfg)return {request_class:"STANDARD",missing:[],custom_reasons:[],matched_config:{config_key:cfg.config_key,id:cfg.id,version:cfg.version,market:cfg.market}};
  // No approved configuration: deterministic compatibility check, never an inferred match.
  const rules=compatibilityRules.filter(r=>{const s=parseJson(r.scope_json,{}),at=parseJson(r.attributes_json,{});
    return (!s.product_key||s.product_key===product.product_key)&&(!s.market||s.market===market)&&Object.entries(at).every(([k,v])=>critical[k]===v);});
  if(rules.some(r=>r.verdict==="forbidden"))return {request_class:"CUSTOM",missing:[],custom_reasons:[{type:"COLOR_COMBINATION",attribute:"combination",value:key,verdict:"forbidden"}],matched_config:null,config_key:key};
  const combinationOk=overrides.approved_combination===key||rules.some(r=>r.verdict==="approved")||policy==="standard_values_allowed";
  return {request_class:"CUSTOM",missing:[],custom_reasons:[combinationOk?{type:"CUSTOM_ORDER",attribute:"configuration",value:key,reason:"configuration_not_priced"}:{type:"COLOR_COMBINATION",attribute:"combination",value:key,reason:"combination_not_approved"}],matched_config:null,config_key:key};
}
const SYSTEM_QUESTIONS={
  product:{fa:"لطفاً بفرمایید کدام محصول یا مدل جعبه موردنظر شماست؟",ar:"ممكن توضحون أي منتج أو موديل علبة تحتاجون؟"},
  quantity:{fa:"لطفاً تعداد موردنیاز را بفرمایید.",ar:"شكد الكمية المطلوبة؟"},
  market:{fa:"لطفاً بفرمایید سفارش برای کدام کشور/شهر است؟",ar:"لأي بلد أو مدينة يكون الطلب؟"}
};
// Safe learning only reorders questions (attributes that most often caused escalations first); it never creates facts.
export function nextRequirementQuestions({missing=[],attributes=[],language="Persian",gapCounts={}}){
  const lang=language==="Iraqi Arabic"?"ar":"fa",order=["product","market","quantity"];
  const sys=missing.filter(m=>order.includes(m)).sort((a,b)=>order.indexOf(a)-order.indexOf(b)).map(k=>({key:k,question:SYSTEM_QUESTIONS[k][lang]}));
  const attrs=attributes.filter(a=>missing.includes(a.attribute_key)).sort((a,b)=>(a.priority-b.priority)||((gapCounts[b.attribute_key]||0)-(gapCounts[a.attribute_key]||0))||a.attribute_key.localeCompare(b.attribute_key))
    .map(a=>({key:a.attribute_key,question:(lang==="ar"?a.question_ar:a.question_fa)||null,label:a.label}));
  return [...sys,...attrs];
}

/* ------------------------------------------------------- owner decisions */
function decisionFingerprint(d){return [d.decision_type,d.request_id||d.quote_id||d.order_id||d.lead_id||"global",d.product_key||"",normKey(d.payload?.attribute)||"",normText(d.payload?.value)||"",d.payload?.setting_key||""].join("|");}
function gapFingerprint(d){return [d.decision_type,d.product_key||"",normKey(d.payload?.attribute)||"",normText(d.payload?.value)||"",d.payload?.setting_key||""].join("|");}
export async function openDecision(env,d){
  await ensureSalesIntelligenceStore(env);
  const type=String(d.decision_type||"OTHER").toUpperCase().replace(/[^A-Z0-9_]/g,"").slice(0,60)||"OTHER";
  const rec={...d,decision_type:type},fp=d.fingerprint||decisionFingerprint(rec);
  const existing=await first(env,"SELECT * FROM owner_decisions WHERE fingerprint=? AND status='PENDING' LIMIT 1",fp);
  if(existing)return {created:false,decision:existing};
  const id=uid(),t=now(),j=v=>JSON.stringify(v??null);
  await env.DB.prepare(`INSERT OR IGNORE INTO owner_decisions(id,status,priority,decision_type,fingerprint,lead_id,conversation_id,market,product_key,request_id,quote_id,order_id,owner_escalation_id,question,
    known_json,missing_json,conflicting_json,history_json,recommendation,risk,payload_json,created_at,updated_at) VALUES(?,'PENDING',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,safeInt(d.priority??50,{name:"priority"}),type,fp,d.lead_id||null,d.conversation_id||null,d.market||null,d.product_key||null,d.request_id||null,d.quote_id||null,d.order_id||null,d.owner_escalation_id||null,
      String(d.question||type).slice(0,1000),j(d.known||{}),j(d.missing||[]),j(d.conflicting||[]),j(d.history||[]),d.recommendation||null,d.risk||null,j(d.payload||{}),t,t).run();
  const decision=await first(env,"SELECT * FROM owner_decisions WHERE fingerprint=? AND status='PENDING' LIMIT 1",fp);
  if(decision?.id===id){await auditSafe(env,"owner_decision_opened","Owner decision required",{decision_id:id,decision_type:type,request_id:d.request_id||null,owner_escalation_id:d.owner_escalation_id||null});if(!d.owner_escalation_id)await recordKnowledgeGap(env,rec,id);}
  return {created:decision?.id===id,decision};
}
async function recordKnowledgeGap(env,d,decisionId){
  // A customer's acceptance waiting for owner approval is an approval step, not missing knowledge.
  if(d.payload?.resolution==="learning"||d.payload?.resolution==="order_candidate")return;
  const fp=gapFingerprint(d),t=now(),gap=await first(env,"SELECT * FROM knowledge_gaps WHERE fingerprint=?",fp);
  if(!gap){await env.DB.prepare(`INSERT OR IGNORE INTO knowledge_gaps(fingerprint,decision_type,product_key,attribute_key,value_text,occurrences,lead_ids_json,examples_json,first_seen,last_seen,status,updated_at)
    VALUES(?,?,?,?,?,1,?,?,?,?,'open',?)`).bind(fp,d.decision_type,d.product_key||null,normKey(d.payload?.attribute)||null,normText(d.payload?.value)||null,JSON.stringify(d.lead_id?[d.lead_id]:[]),JSON.stringify([decisionId]),t,t,t).run();}
  else{const leads=[...new Set([...parseJson(gap.lead_ids_json,[]),...(d.lead_id?[d.lead_id]:[])])],ex=[...parseJson(gap.examples_json,[]),decisionId].slice(-5);
    await env.DB.prepare("UPDATE knowledge_gaps SET occurrences=occurrences+1,lead_ids_json=?,examples_json=?,last_seen=?,updated_at=? WHERE fingerprint=?").bind(JSON.stringify(leads),JSON.stringify(ex),t,t,fp).run();}
  await detectRecurringGaps(env,fp);
}
// Failure memory: a gap that keeps reaching the owner becomes a LEARNING_RULE proposal; nothing is applied automatically.
export async function detectRecurringGaps(env,onlyFingerprint=null){
  const threshold=(await getSetting(env,"learning_proposal_threshold"))?.value;if(!threshold)return {proposals:0,reason:"learning_proposal_threshold_not_set"};
  const gaps=onlyFingerprint?await all(env,"SELECT * FROM knowledge_gaps WHERE fingerprint=? AND status='open' AND occurrences>=?",onlyFingerprint,threshold):await all(env,"SELECT * FROM knowledge_gaps WHERE status='open' AND occurrences>=?",threshold);
  let proposals=0;
  for(const g of gaps){
    const sample=await first(env,"SELECT * FROM owner_decisions WHERE id=?",parseJson(g.examples_json,[]).slice(-1)[0]||"");const samplePayload=parseJson(sample?.payload_json,{});
    const r=await openDecision(env,{decision_type:"LEARNING_RULE",fingerprint:`LEARNING|${g.fingerprint}`,product_key:g.product_key,priority:40,
      question:`RECURRING KNOWLEDGE GAP (${g.occurrences}x): ${g.decision_type} ${g.attribute_key||""} ${g.value_text||""}`.trim(),
      known:{occurrences:g.occurrences,affected_leads:parseJson(g.lead_ids_json,[]).length,examples:parseJson(g.examples_json,[])},
      recommendation:"Save the owner's answer as reusable approved knowledge, or keep deciding case-by-case.",risk:"Saving creates a reusable rule within the chosen scope only.",
      payload:{resolution:"learning",gap_fingerprint:g.fingerprint,proposal:{resolution:samplePayload.resolution||"record",...samplePayload}}});
    if(r.created){proposals++;await env.DB.prepare("UPDATE knowledge_gaps SET status='recurring',proposal_decision_id=?,updated_at=? WHERE fingerprint=?").bind(r.decision.id,now(),g.fingerprint).run();}
  }
  return {proposals};
}
async function resolutionContext(env,decision){
  const request=decision.request_id?await first(env,"SELECT * FROM sales_requests WHERE id=?",decision.request_id):null;
  return {request,payload:parseJson(decision.payload_json,{})};
}
async function addCaseOverride(env,requestId,mutate){
  const r=await first(env,"SELECT case_overrides_json FROM sales_requests WHERE id=?",requestId);if(!r)return;
  const o=parseJson(r.case_overrides_json,{});mutate(o);await env.DB.prepare("UPDATE sales_requests SET case_overrides_json=?,updated_at=? WHERE id=?").bind(JSON.stringify(o),now(),requestId).run();
}
// Each resolution kind applies the owner's answer either to the current case only or as a new versioned knowledge row.
async function applyResolution(env,decision,{action,scope,answer,actor}){
  const {request,payload}=await resolutionContext(env,decision),save=scope!=="CASE_ONLY",kind=payload.resolution||"record",result={knowledge_action:save?scope:"CASE_ONLY",resulting_ref:null};
  const saveOpts={actor,decisionId:decision.id,expectExisting:scope==="UPDATE_EXISTING"};
  if(action==="REJECT"){
    if(request&&payload.attribute)await addCaseOverride(env,request.id,o=>{o.rejected=[...new Set([...(o.rejected||[]),`${payload.attribute}=${payload.value}`])];});
    if(kind==="learning"&&payload.gap_fingerprint)await env.DB.prepare("UPDATE knowledge_gaps SET status='ignored',updated_at=? WHERE fingerprint=?").bind(now(),payload.gap_fingerprint).run();
    return {...result,knowledge_action:"NONE"};
  }
  if(kind==="learning"){
    if(!save){if(payload.gap_fingerprint)await env.DB.prepare("UPDATE knowledge_gaps SET status='case_by_case',updated_at=? WHERE fingerprint=?").bind(now(),payload.gap_fingerprint).run();return {...result,knowledge_action:"KEEP_CASE_BY_CASE"};}
    const inner={...decision,payload_json:JSON.stringify(payload.proposal||{}),request_id:null};
    const r=await applyResolution(env,inner,{action:"ANSWER",scope,answer,actor});
    if(payload.gap_fingerprint)await env.DB.prepare("UPDATE knowledge_gaps SET status='saved',updated_at=? WHERE fingerprint=?").bind(now(),payload.gap_fingerprint).run();
    return r;
  }
  if(kind==="attribute_value"){
    const attrKey=normKey(answer.attribute_key||payload.attribute),value=normText(answer.value||payload.value),productKey=decision.product_key||payload.product_key;
    if(!save){if(request)await addCaseOverride(env,request.id,o=>{o.approved_values=o.approved_values||{};o.approved_values[attrKey]=[...new Set([...(o.approved_values[attrKey]||[]),value])];});return result;}
    const cur=await first(env,"SELECT * FROM product_attribute_schema WHERE product_key=? AND attribute_key=? AND status='current'",productKey,attrKey);
    const base=cur?{...cur,allowed_values:parseJson(cur.allowed_values_json,[])}:{product_key:productKey,attribute_key:attrKey,label:answer.label||attrKey,attribute_kind:answer.attribute_kind||"other",value_type:"enum",required:!!answer.required,commercial_critical:answer.commercial_critical!==false,allowed_values:[]};
    const saved=await saveKnowledgeVersion(env,"attribute",{...base,allowed_values:[...base.allowed_values,{value,label:answer.label_value||value,aliases:answer.aliases||[]}]},saveOpts);
    return {...result,resulting_ref:`attribute:${saved.row.id}`};
  }
  if(kind==="combination"){
    if(!save){if(request)await addCaseOverride(env,request.id,o=>{o.approved_combination=payload.value;});return result;}
    const attrs=parseJson(request?.requirements_json,{}),flat={};for(const [k,v] of Object.entries(attrs))flat[k]=v.value;
    const saved=await saveKnowledgeVersion(env,"configuration",{product_key:decision.product_key,market:answer.market||decision.market||"*",attributes:{...flat,...(answer.attributes||{})},label:answer.label},saveOpts);
    return {...result,resulting_ref:`configuration:${saved.row.id}`};
  }
  if(kind==="price"){
    const unit=safeInt(answer.unit_price_minor,{min:1,name:"unit_price_minor"});
    if(!save){if(request)await addCaseOverride(env,request.id,o=>{o.owner_price={unit_price_minor:unit,decision_id:decision.id};});return result;}
    let configKey=payload.config_key||request?.matched_config_key;
    if(!configKey){const attrs=parseJson(request?.requirements_json,{}),flat={};for(const [k,v] of Object.entries(attrs))flat[k]=v.value;
      configKey=(await saveKnowledgeVersion(env,"configuration",{product_key:decision.product_key,market:decision.market,attributes:flat,label:answer.config_label},{actor,decisionId:decision.id})).row.config_key;}
    const saved=await saveKnowledgeVersion(env,"price",{market:decision.market,product_key:decision.product_key,config_key:configKey,quantity_min:answer.quantity_min??request?.quantity,quantity_max:answer.quantity_max??null,unit_price_minor:unit,moq:answer.moq??null,currency:answer.currency},saveOpts);
    return {...result,resulting_ref:`price:${saved.row.id}`};
  }
  if(kind==="setting"){
    const key=payload.setting_key;
    if(!save){if(request)await addCaseOverride(env,request.id,o=>{o.settings=o.settings||{};o.settings[key]=(SETTING_SPECS[key]?SETTING_SPECS[key](answer.value):answer.value);});
      else if(decision.order_id){/* order-level answer is read from the decision record */}return result;}
    const saved=await saveKnowledgeVersion(env,"setting",{setting_key:key,scope:answer.scope||payload.scope||"global",value:answer.value},saveOpts);
    return {...result,resulting_ref:`setting:${saved.row.id}`};
  }
  if(kind==="cost"){
    if(!save){if(request)await addCaseOverride(env,request.id,o=>{o.costs=o.costs||{};o.costs[payload.component||answer.component]={amount_minor:safeInt(answer.amount_minor,{name:"amount_minor"}),basis:answer.basis||"per_unit"};});return result;}
    const saved=await saveKnowledgeVersion(env,"cost",{market:decision.market,product_key:decision.product_key,config_key:payload.config_key||"*",quantity_min:answer.quantity_min??1,quantity_max:answer.quantity_max??null,component:payload.component||answer.component,basis:answer.basis,amount_minor:answer.amount_minor},saveOpts);
    return {...result,resulting_ref:`cost:${saved.row.id}`};
  }
  if(kind==="discount"){
    const amount=safeInt(answer.discount_minor,{min:0,name:"discount_minor"});
    if(request)await addCaseOverride(env,request.id,o=>{o.discount={discount_minor:amount,reason:String(answer.reason||"owner exceptional discount").slice(0,300),decision_id:decision.id};});
    if(save&&answer.rule){const saved=await saveKnowledgeVersion(env,"setting",{setting_key:"discount_rule",scope:answer.scope||{market:decision.market,product_key:decision.product_key},value:answer.rule},saveOpts);return {...result,resulting_ref:`setting:${saved.row.id}`};}
    return {...result,knowledge_action:"CASE_ONLY"};
  }
  return {...result,knowledge_action:save?"RECORDED":"CASE_ONLY"};
}
export async function resolveDecision(env,{id,action,scope="CASE_ONLY",answer={},note="",actor="owner"}){
  await ensureSalesIntelligenceStore(env);
  const act=String(action||"").toUpperCase(),sc=String(scope||"CASE_ONLY").toUpperCase();
  if(!["APPROVE","REJECT","ANSWER"].includes(act))throw Error("action must be APPROVE, REJECT or ANSWER");
  if(!DECISION_SCOPES.has(sc))throw Error("scope must be CASE_ONLY, SAVE_AS_KNOWLEDGE, UPDATE_EXISTING or NEW_VERSION");
  const decision=await first(env,"SELECT * FROM owner_decisions WHERE id=?",id);if(!decision)throw Error("Decision not found");
  // Runtime-blocking escalations are resolved only through the injected unified CAS path.
  if(decision.owner_escalation_id&&D.resolveLinkedOwnerDecision)return await D.resolveLinkedOwnerDecision(env,{id,action:act,scope:sc,answer:answer||{},note,actor});
  if(decision.status!=="PENDING"){if(decision.owner_decision===act)return {idempotent:true,decision};throw Error(`Decision is already ${decision.status}`);}
  const effect=await applyResolution(env,decision,{action:act,scope:sc,answer:answer||{},actor});
  const status=act==="REJECT"?"REJECTED":"RESOLVED",t=now();
  const changed=await env.DB.prepare(`UPDATE owner_decisions SET status=?,owner_decision=?,owner_answer_json=?,owner_note=?,scope_json=?,knowledge_action=?,resulting_ref=?,resolved_by=?,resolved_at=?,updated_at=? WHERE id=? AND status='PENDING'`)
    .bind(status,act,JSON.stringify(answer||{}),String(note||"").slice(0,1000)||null,JSON.stringify({scope:sc}),effect.knowledge_action,effect.resulting_ref,String(actor).slice(0,120),t,t,id).run();
  if(!changed.meta?.changes)throw Error("Decision resolution conflict");
  await auditSafe(env,"owner_decision_resolved","Owner resolved decision",{decision_id:id,decision_type:decision.decision_type,action:act,scope:sc,knowledge_action:effect.knowledge_action,resulting_ref:effect.resulting_ref});
  const resolved=await first(env,"SELECT * FROM owner_decisions WHERE id=?",id);
  if(decision.request_id)try{await processSalesRequest(env,decision.request_id,{actor});}catch(e){await auditSafe(env,"sales_request_reprocess_failed","Request reprocessing after decision failed",{decision_id:id,error:String(e?.message||e)});}
  if(decision.order_id&&parseJson(decision.payload_json,{}).setting_key==="payment_instructions"&&act!=="REJECT"){
    const order=await first(env,"SELECT * FROM lead_orders WHERE id=?",decision.order_id);if(order)await preparePaymentRequest(env,order,{caseInstructions:sc==="CASE_ONLY"?String(answer.value||""):null});
  }
  if(parseJson(decision.payload_json,{})?.kind==="deposit_terms")try{await afterDepositTermsDecision(env,resolved,act);}catch(e){await auditSafe(env,"deposit_terms_followup_failed","Payment-terms decision follow-up failed",{decision_id:id,error:String(e?.message||e)});}
  return {decision:resolved,effect};
}
// The owner's answer to a customer's payment-terms request is told to the customer through the normal approval-gated draft
// (Draft -> SUBMIT -> APPROVE -> SEND); a confirmed order's payment request is then (re)built on the final terms.
async function afterDepositTermsDecision(env,decision,act){
  const order=decision.order_id?await first(env,"SELECT * FROM lead_orders WHERE id=?",decision.order_id):null;
  const market=order?.market||decision.market||"IRAN",language=D.outreachLanguage({country:market==="IRAN"?"iran":"iraq"}),ar=language==="Iraqi Arabic";
  const kind=parseJson(decision.payload_json,{})?.requested_kind||"deposit",method=DEPOSIT_TERMS_METHOD_KINDS.has(kind);
  const defPct=(await getSetting(env,"deposit_percent",{market,product_key:null}))?.value;
  const approvedPct=act!=="REJECT"?decisionDepositPercent(decision):null,approved=act!=="REJECT"&&(approvedPct!==null||method);
  const pct=approved&&approvedPct!==null?approvedPct:defPct;
  const methodText=kind==="installments"?(ar?"الدفع بالأقساط":"پرداخت اقساطی"):kind==="cheque"?(ar?"الدفع بالصك":"پرداخت با چک"):null;
  const termsLine=pct===null||pct===undefined?null:pct>=100?(ar?"الدفع كامل مقدماً":"پرداخت کامل پیش از ارسال"):pct===0?(ar?"بدون عربون":"بدون پیش‌پرداخت"):(ar?`العربون ${pct}% والباقي ${100-pct}%`:`پیش‌پرداخت ${pct}٪ و باقی‌مانده ${100-pct}٪`);
  const message=approved
    ?method?(ar?`تمت موافقة المدير على ${methodText} لهذا الطلب${termsLine?`، مع ${termsLine}`:""}.`:`درخواستتون برای ${methodText} این سفارش تأیید شد${termsLine?`؛ ${termsLine}`:""}.`)
    :(termsLine?(ar?`تمت موافقة المدير على طلبكم بخصوص شروط الدفع لهذا الطلب: ${termsLine}.`:`درخواستتون درباره شرایط پرداخت این سفارش تأیید شد: ${termsLine}.`):(ar?"تمت موافقة المدير على طلبكم بخصوص شروط الدفع لهذا الطلب.":"درخواستتون درباره شرایط پرداخت این سفارش تأیید شد."))
    :(termsLine?(ar?`للأسف لم تتم الموافقة على طلب تغيير شروط الدفع؛ تبقى الشروط المعتادة: ${termsLine}.`:`متأسفانه امکان تغییر شرایط پرداخت تأیید نشد و شرایط معمول برقراره: ${termsLine}.`):(ar?"للأسف لم تتم الموافقة على طلب تغيير شروط الدفع.":"متأسفانه امکان تغییر شرایط پرداخت تأیید نشد."));
  if(decision.lead_id&&decision.conversation_id&&D.createApprovalGatedDraft)await D.createApprovalGatedDraft(env,{key:`payment-terms:decision-draft:${decision.id}`,skipKey:`payment-terms:decision-draft-skipped:${decision.id}`,leadId:decision.lead_id,conversationId:decision.conversation_id,language,message,
    eventType:"payment_terms_decision_draft_created",eventMessage:"Payment-terms decision draft created for owner approval",details:{decision_id:decision.id,order_id:order?.id||null,outcome:approved?"approved":"rejected",deposit_percent:pct??null,...(order?{snapshot:{status:order.status,total_minor:order.total_minor,currency:order.currency}}:{})}});
  if(order)await preparePaymentRequest(env,order);
}
export async function listDecisions(env,{status="PENDING",type=null,limit=100}={}){
  await ensureSalesIntelligenceStore(env);
  const where=[],b=[];if(status&&status!=="ALL"){if(!DECISION_STATUSES.has(status))throw Error("Invalid status");where.push("status=?");b.push(status);}
  if(type){where.push("decision_type=?");b.push(String(type).toUpperCase());}
  return (await all(env,`SELECT * FROM owner_decisions ${where.length?"WHERE "+where.join(" AND "):""} ORDER BY CASE status WHEN 'PENDING' THEN 0 ELSE 1 END,priority,created_at DESC LIMIT ?`,...b,Math.min(Number(limit)||100,300)))
    .map(d=>({...d,known:parseJson(d.known_json,{}),missing:parseJson(d.missing_json,[]),conflicting:parseJson(d.conflicting_json,[]),history:parseJson(d.history_json,[]),payload:parseJson(d.payload_json,{}),owner_answer:parseJson(d.owner_answer_json,null)}));
}
export async function decisionHistory(env,id){return await all(env,"SELECT type,message,details_json,created_at FROM system_events WHERE type LIKE 'owner_decision_%' AND details_json LIKE ? ORDER BY created_at",`%"decision_id":"${String(id).replace(/[%_"]/g,"")}"%`);}

/* ----------------------------------------------------------- sales requests */
function flatRequirements(req){const o={};for(const [k,v] of Object.entries(parseJson(req.requirements_json,{})))o[k]=v.value;return o;}
async function getOrCreateRequest(env,{leadId,conversationId}){
  const existing=await first(env,"SELECT * FROM sales_requests WHERE conversation_id=?",conversationId);if(existing)return existing;
  const t=now();await env.DB.prepare("INSERT OR IGNORE INTO sales_requests(id,lead_id,conversation_id,status,created_at,updated_at) VALUES(?,?,?,'open',?,?)").bind(uid(),leadId,conversationId,t,t).run();
  return await first(env,"SELECT * FROM sales_requests WHERE conversation_id=?",conversationId);
}
async function gapCountsFor(env,productKey){const o={};for(const g of await all(env,"SELECT attribute_key,occurrences FROM knowledge_gaps WHERE product_key=?",productKey||""))if(g.attribute_key)o[g.attribute_key]=(o[g.attribute_key]||0)+g.occurrences;return o;}
// Merge new evidence into the request, then run the deterministic router and the matching quote path.
export async function updateSalesRequest(env,{leadId,conversationId,message="",sourceId=null,productText=null,quantity=null,market=null,ownerRequirements=null,actor="system"}){
  await ensureSalesIntelligenceStore(env);
  const req=await getOrCreateRequest(env,{leadId,conversationId});
  let productKey=req.product_key,pText=req.product_text;
  if(productText||!productKey){const res=await resolveProduct(env,productText||message);if(res.status==="matched"){productKey=res.product.product_key;pText=res.product.name;}else if(productText&&res.status!=="catalog_empty"&&!productKey)pText=productText;}
  const k=productKey?await currentProductKnowledge(env,productKey):{attributes:[],configurations:[]};
  const watch=(await getSetting(env,"unknown_feature_terms",{market:market||req.market,product_key:productKey}))?.value||[];
  const ex=extractRequirements({message,attributes:k.attributes,sourceId,watchTerms:watch});
  const reqs={...parseJson(req.requirements_json,{}),...ex.attributes};
  for(const [key,v] of Object.entries(ownerRequirements||{})){const a=k.attributes.find(x=>x.attribute_key===normKey(key));if(a)reqs[a.attribute_key]={value:normText(v),source:"owner",at:now()};else ex.unknown.push({attribute:normKey(key),value:normText(v),source:"owner"});}
  const unk=[...parseJson(req.unknown_json,[])];for(const u of ex.unknown)if(!unk.some(x=>x.attribute===u.attribute&&x.value===u.value))unk.push(u);
  const q=quantity!==null&&quantity!==undefined&&quantity!==""?safeInt(quantity,{min:1,name:"quantity"}):req.quantity,m=market&&MARKETS.includes(market)?market:req.market;
  await env.DB.prepare("UPDATE sales_requests SET product_key=?,product_text=?,quantity=?,market=?,requirements_json=?,unknown_json=?,updated_at=? WHERE id=?")
    .bind(productKey||null,pText||null,q??null,m||null,JSON.stringify(reqs),JSON.stringify(unk),now(),req.id).run();
  return await processSalesRequest(env,req.id,{actor,conflicts:ex.conflicts});
}
export async function processSalesRequest(env,requestId,{actor="system",conflicts=[]}={}){
  const req=await first(env,"SELECT * FROM sales_requests WHERE id=?",requestId);if(!req)throw Error("Sales request not found");
  const k=req.product_key?await currentProductKnowledge(env,req.product_key):{product:null,attributes:[],configurations:[]};
  const overrides=parseJson(req.case_overrides_json,{}),requirements=parseJson(req.requirements_json,{});
  const policy=(await getSetting(env,"color_compatibility_policy",{market:req.market,product_key:req.product_key}))?.value||null;
  const rules=await all(env,"SELECT * FROM compatibility_rules WHERE status='current'");
  const cls=classifyOrderRequest({product:k.product,productText:req.product_text,market:req.market,quantity:req.quantity,attributes:k.attributes,configurations:k.configurations,compatibilityRules:rules,requirements,unknown:parseJson(req.unknown_json,[]),overrides,policy});
  const rejected=new Set(overrides.rejected||[]);
  const blocked=cls.custom_reasons.some(r=>rejected.has(`${r.attribute}=${r.value}`));
  await env.DB.prepare("UPDATE sales_requests SET request_class=?,matched_config_key=?,missing_json=?,custom_reasons_json=?,status=?,updated_at=? WHERE id=?")
    .bind(cls.request_class,cls.matched_config?.config_key||null,JSON.stringify(cls.missing),JSON.stringify(cls.custom_reasons),blocked?"owner_rejected":req.status==="owner_rejected"?"open":req.status,now(),req.id).run();
  const base={lead_id:req.lead_id,conversation_id:req.conversation_id,market:req.market,product_key:req.product_key,request_id:req.id};
  const known={product:k.product?.name||req.product_text||null,market:req.market,quantity:req.quantity,...flatRequirements(req)};
  const out={request_id:req.id,request_class:cls.request_class,missing:cls.missing,custom_reasons:cls.custom_reasons,matched_config:cls.matched_config,decisions:[],quote:null,blocked};
  if(conflicts.length)out.decisions.push((await openDecision(env,{...base,decision_type:"KNOWLEDGE_CONFLICT",question:"Customer message matched several approved values for the same attribute",known,conflicting:conflicts,payload:{resolution:"record"},priority:60})).decision?.id);
  if(blocked)return out;
  if(cls.request_class==="UNCLEAR"){out.questions=nextRequirementQuestions({missing:cls.missing,attributes:k.attributes,gapCounts:await gapCountsFor(env,req.product_key)});return out;}
  if(cls.request_class==="CUSTOM"){
    for(const r of cls.custom_reasons.filter(x=>!x.case_approved&&x.type!=="CUSTOM_ORDER")){
      const resolution=r.type==="COLOR_COMBINATION"?"combination":r.attribute==="product"?"record":"attribute_value";
      out.decisions.push((await openDecision(env,{...base,decision_type:r.type,priority:r.verdict==="forbidden"?30:40,
        question:r.verdict==="forbidden"?`Requested combination is marked forbidden: ${r.value}`:`Unknown/special ${r.attribute}: "${r.value}" — can we produce it?`,
        known,missing:cls.missing,recommendation:"Confirm capability for this case, or save it as approved knowledge for this product.",risk:"Promising an unsupported specification can lose the order or margin.",
        payload:{resolution,attribute:r.attribute,value:r.value,product_key:req.product_key}})).decision?.id);
    }
    const capabilityOpen=cls.custom_reasons.some(x=>!x.case_approved&&x.type!=="CUSTOM_ORDER");
    if(!capabilityOpen&&!cls.missing.length){
      if(overrides.owner_price)out.quote=await buildQuote(env,req,{mode:"custom_owner",unit_price_minor:overrides.owner_price.unit_price_minor,decisionId:overrides.owner_price.decision_id,configKey:cls.config_key||null},out);
      else out.decisions.push((await openDecision(env,{...base,decision_type:"CUSTOM_ORDER",priority:20,question:"CUSTOM QUOTE — OWNER PRICING REQUIRED",
        known:customQuoteCard(k,req),missing:[],recommendation:"Provide the unit price for this case. Optionally save it as a new versioned price for this exact configuration.",
        risk:"No price is derived from similar products or past quotes.",payload:{resolution:"price",config_key:cls.config_key||null}})).decision?.id);
    }else if(cls.missing.length)out.questions=nextRequirementQuestions({missing:cls.missing,attributes:k.attributes,gapCounts:await gapCountsFor(env,req.product_key)});
    return out;
  }
  out.quote=await prepareFastQuote(env,req,cls.matched_config,out);
  return out;
}
function customQuoteCard(k,req){
  const flat=flatRequirements(req),byKind=kind=>k.attributes.filter(a=>a.attribute_kind===kind||a.attribute_kind.startsWith(kind)).map(a=>flat[a.attribute_key]).filter(Boolean).join(", ")||null;
  return {market:req.market,product:k.product?.name||req.product_text,quantity:req.quantity,size:byKind("size"),material:byKind("material"),colors:byKind("color"),color_combination:byKind("color_combination"),
    printing:byKind("printing"),ribbon:byKind("ribbon"),configuration:flat,unknown_requested:parseJson(req.unknown_json,[]),price:"OWNER REQUIRED"};
}

/* ------------------------------------------------------- pricing + quotes */
export function resolveTierPrice(prices,quantity,policy){
  const q=Number(quantity);let c=[];
  if(policy==="EXACT")c=prices.filter(p=>p.quantity_min===q&&(p.quantity_max===null||p.quantity_max===q));
  else if(policy==="RANGE")c=prices.filter(p=>p.quantity_max!==null&&p.quantity_min<=q&&q<=p.quantity_max);
  else if(policy==="MINIMUM_BREAK"){const eligible=prices.filter(p=>p.quantity_min<=q);const top=Math.max(...eligible.map(p=>p.quantity_min));c=eligible.filter(p=>p.quantity_min===top);}
  else return {status:"policy_missing"};
  if(c.length===1)return {status:"matched",price:c[0]};
  return {status:c.length?"ambiguous":"no_tier",candidates:c};
}
async function quoteCharges(env,req,ctx,overrides,out,base){
  const s=async key=>overrides.settings?.[key]??(await getSetting(env,key,ctx))?.value??null;
  const need=async(key,question)=>{out.decisions.push((await openDecision(env,{...base,decision_type:key.startsWith("shipping")?"SHIPPING_RULE":key==="quote_payment_terms"?"PAYMENT_TERMS":"OTHER",priority:45,
    question,known:{setting_key:key,scope:ctx},payload:{resolution:"setting",setting_key:key,scope:{market:ctx.market}}})).decision?.id);return null;};
  const r={},ship=await s("shipping_pricing_mode");
  if(ship==="included")r.shipping_minor=0;else if(ship==="fixed"){const f=await s("shipping_fixed_minor");r.shipping_minor=f??await need("shipping_fixed_minor","Fixed shipping amount is not defined");}
  else if(ship==="owner_quoted"){const v=overrides.settings?.shipping_amount_minor;r.shipping_minor=v??await need("shipping_amount_minor","Shipping amount for this quote is owner-quoted");}
  else r.shipping_minor=await need("shipping_pricing_mode","How is shipping priced for this market? (included / owner_quoted / fixed)");
  for(const [mode,field,label] of [["quote_tax_mode","tax_minor","tax"],["quote_fees_mode","other_fees_minor","other fees"]]){
    const v=await s(mode);if(v==="none")r[field]=0;else if(v==="owner_quoted"){const a=overrides.settings?.[field];r[field]=a??await need(field,`Owner must quote ${label} for this case`);}
    else r[field]=await need(mode,`How is ${label} handled on quotes? (none / owner_quoted)`);
  }
  r.payment_terms=await s("quote_payment_terms")??await need("quote_payment_terms","Approved quote payment terms text is missing");
  r.delivery_terms=await s("quote_delivery_terms")??await need("quote_delivery_terms","Approved quote delivery terms text is missing");
  const validity=await s("quote_validity_days");r.expires_at=validity?new Date(Date.now()+Number(validity)*86400000).toISOString():null;
  return r;
}
function formatMoney(currency,minor){const f=D.customerPaymentAmountText?.({currency,amount_minor:minor});return f||`${minor} ${currency} (minor units)`;}
function quoteText(req,k,q,language){
  const ar=language==="Iraqi Arabic",flat=flatRequirements(req),spec=Object.entries(flat).map(([a,v])=>`${(k.attributes.find(x=>x.attribute_key===a)||{}).label||a}: ${v}`).join(" · ");
  const lines=ar?[`عرض سعر: ${k.product?.name||req.product_text}`,spec,`الكمية: ${q.quantity}`,`سعر الوحدة: ${formatMoney(q.currency,q.unit_price_minor)}`,q.discount_minor?`الخصم: ${formatMoney(q.currency,q.discount_minor)}`:null,`المجموع: ${formatMoney(q.currency,q.total_minor)}`,`شروط الدفع: ${q.payment_terms}`,`التسليم: ${q.delivery_terms}`]
    :[`پیش‌فاکتور: ${k.product?.name||req.product_text}`,spec,`تعداد: ${q.quantity}`,`قیمت واحد: ${formatMoney(q.currency,q.unit_price_minor)}`,q.discount_minor?`تخفیف: ${formatMoney(q.currency,q.discount_minor)}`:null,`جمع کل: ${formatMoney(q.currency,q.total_minor)}`,`شرایط پرداخت: ${q.payment_terms}`,`تحویل: ${q.delivery_terms}`];
  return lines.filter(Boolean).join("\n");
}
async function prepareFastQuote(env,req,matched,out){
  const base={lead_id:req.lead_id,conversation_id:req.conversation_id,market:req.market,product_key:req.product_key,request_id:req.id},ctx={market:req.market,product_key:req.product_key,config_key:matched.config_key};
  const overrides=parseJson(req.case_overrides_json,{});
  if(overrides.owner_price)return await buildQuote(env,req,{mode:"custom_owner",unit_price_minor:overrides.owner_price.unit_price_minor,decisionId:overrides.owner_price.decision_id,configKey:matched.config_key},out);
  const policy=(await getSetting(env,"quantity_tier_policy",ctx))?.value;
  if(!policy){out.decisions.push((await openDecision(env,{...base,decision_type:"QUANTITY_TIER",priority:35,question:"Which quantity-tier policy applies? (EXACT / RANGE / MINIMUM_BREAK)",known:{quantity:req.quantity},payload:{resolution:"setting",setting_key:"quantity_tier_policy",scope:{market:req.market,product_key:req.product_key}}})).decision?.id);return null;}
  const prices=(await all(env,"SELECT * FROM price_versions WHERE market=? AND product_key=? AND config_key=? AND status='current'",req.market,req.product_key,matched.config_key))
    .filter(p=>(!p.effective_from||p.effective_from<=now())&&(!p.effective_until||p.effective_until>=now()));
  const tier=prices.length?resolveTierPrice(prices,req.quantity,policy):{status:"no_price"};
  if(tier.status!=="matched"){
    const type=tier.status==="no_price"?"PRICE_REQUIRED":tier.status==="ambiguous"?"KNOWLEDGE_CONFLICT":"QUANTITY_TIER";
    out.decisions.push((await openDecision(env,{...base,decision_type:type,priority:25,question:type==="PRICE_REQUIRED"?"No approved current price for this configuration and market":`Quantity ${req.quantity} is not covered by approved tiers under ${policy}`,
      known:{config_key:matched.config_key,quantity:req.quantity,policy,tiers:prices.map(p=>({min:p.quantity_min,max:p.quantity_max,version:p.version}))},recommendation:"Provide a price for this case, or save a new versioned tier price.",risk:"No price is guessed for uncovered quantities.",payload:{resolution:"price",config_key:matched.config_key}})).decision?.id);
    return null;
  }
  const price=tier.price;
  if(canonicalCurrency(price.currency)!==MARKET_CURRENCY[req.market]){out.decisions.push((await openDecision(env,{...base,decision_type:"KNOWLEDGE_CONFLICT",question:"Price currency violates locked market currency",known:{price_version:price.id,currency:price.currency},payload:{resolution:"record"}})).decision?.id);return null;}
  const moq=overrides.moq??price.moq??(await getSetting(env,"moq",ctx))?.value??null;
  if(moq&&req.quantity<moq){out.decisions.push((await openDecision(env,{...base,decision_type:"MOQ_DECISION",priority:30,question:`Requested quantity ${req.quantity} is below MOQ ${moq}`,known:{moq,quantity:req.quantity},recommendation:"Decide whether to accept this quantity for this case.",payload:{resolution:"setting",setting_key:"moq",scope:{market:req.market,product_key:req.product_key}}})).decision?.id);return null;}
  return await buildQuote(env,req,{mode:"versioned_price",price,configKey:matched.config_key},out);
}
async function buildQuote(env,req,{mode,price=null,unit_price_minor=null,decisionId=null,configKey=null},out){
  const base={lead_id:req.lead_id,conversation_id:req.conversation_id,market:req.market,product_key:req.product_key,request_id:req.id},ctx={market:req.market,product_key:req.product_key,config_key:configKey||undefined};
  const overrides=parseJson(req.case_overrides_json,{}),k=await currentProductKnowledge(env,req.product_key||"");
  const charges=await quoteCharges(env,req,ctx,overrides,out,base);
  const currency=MARKET_CURRENCY[req.market],unit=price?price.unit_price_minor:unit_price_minor,subtotal=unit*req.quantity;
  if(!Number.isSafeInteger(subtotal))throw Error("Quote subtotal overflow");
  let discount=0,discountReason=null;
  if(overrides.discount){discount=overrides.discount.discount_minor;discountReason=`case:${overrides.discount.reason}`;}
  else{const rule=(await getSetting(env,"discount_rule",ctx))?.value;if(rule&&(!rule.min_quantity||req.quantity>=rule.min_quantity)){discount=rule.type==="percent_bp"?Math.floor(subtotal*rule.value/10000):rule.value;discountReason="approved_discount_rule";}}
  const q={market:req.market,product:k.product?.name||req.product_text,quantity:req.quantity,currency,unit_price_minor:unit,discount_minor:discount,shipping_minor:charges.shipping_minor,tax_minor:charges.tax_minor,other_fees_minor:charges.other_fees_minor,
    moq:price?.moq??null,payment_terms:charges.payment_terms,delivery_terms:charges.delivery_terms,expires_at:charges.expires_at,pricing_mode:mode,price_version_id:price?.id||null,custom_price_decision_id:decisionId,config_key:configKey,request_id:req.id,
    lead_id:req.lead_id,conversation_id:req.conversation_id,discount_reason:discountReason};
  const vals=D.calculateQuoteValues(q);q.subtotal_minor=vals.subtotal_minor;q.total_minor=vals.total_minor;
  const language=D.outreachLanguage({country:req.market==="IRAN"?"iran":"iraq"});
  q.approved_quote_text=q.total_minor!==null&&q.payment_terms&&q.delivery_terms?quoteText(req,k,q,language):null;
  const margin=await marginGuard(env,{...q,product_key:req.product_key},overrides);q.margin_json=JSON.stringify(margin);
  if(margin.status==="UNKNOWN"&&margin.missing_components?.length&&!overrides.costs)for(const c of margin.missing_components)
    out.decisions.push((await openDecision(env,{...base,decision_type:"COST_REQUIRED",priority:55,question:`Cost component "${c}" is not defined for this configuration`,known:{config_key:configKey,quantity:req.quantity},payload:{resolution:"cost",component:c,config_key:configKey||"*"}})).decision?.id);
  if(margin.status==="UNKNOWN"&&margin.reason==="required_cost_components_not_defined")
    out.decisions.push((await openDecision(env,{...base,decision_type:"MARGIN_RULE",priority:60,question:"Which cost components are required before margin is considered known?",known:{market:req.market,product:req.product_key},payload:{resolution:"setting",setting_key:"required_cost_components",scope:{market:req.market,product_key:req.product_key}}})).decision?.id);
  const ready=D.quoteReadiness(q),status=ready.ready?"quote_ready":"draft",t=now();
  const existing=req.quote_id?await first(env,"SELECT * FROM lead_quotes WHERE id=?",req.quote_id):null;
  const mutable=["draft","needs_details","requires_owner_review","waiting_for_owner_price","waiting_for_price_match","quote_ready"];
  // In-flight/sent/accepted quotes are never touched or duplicated; a new quote starts only after rejection/expiry or an owner request reset.
  if(existing&&!mutable.includes(existing.status)&&!["rejected","expired"].includes(existing.status))return existing;
  if(existing&&!mutable.includes(existing.status)){req.quote_id=null;}
  const fields=["market","market_source","pricing_mode","price_version_id","custom_price_decision_id","config_key","request_id","product","quantity","customization","currency","unit_price_minor","subtotal_minor","discount_minor","shipping_minor","tax_minor","other_fees_minor","total_minor","moq","payment_terms","delivery_terms","approved_quote_text","expires_at","margin_json","discount_reason","status","updated_at"];
  const row={...q,market_source:"sales_request",customization:Object.entries(flatRequirements(req)).map(([a,v])=>`${a}=${v}`).join("; ")||null,status,updated_at:t};
  if(existing&&req.quote_id){await env.DB.prepare(`UPDATE lead_quotes SET ${fields.map(f=>f+"=?").join(",")} WHERE id=?`).bind(...fields.map(f=>row[f]??null),existing.id).run();}
  else{const id=uid();await env.DB.prepare(`INSERT INTO lead_quotes(id,lead_id,conversation_id,created_at,${fields.join(",")}) VALUES(?,?,?,?,${fields.map(()=>"?").join(",")})`).bind(id,req.lead_id,req.conversation_id,t,...fields.map(f=>row[f]??null)).run();
    await env.DB.prepare("UPDATE sales_requests SET quote_id=?,updated_at=? WHERE id=?").bind(id,t,req.id).run();req.quote_id=id;}
  const saved=await first(env,"SELECT * FROM lead_quotes WHERE id=?",req.quote_id);
  await auditSafe(env,"sales_quote_prepared","Quote prepared for owner approval (not sent)",{quote_id:saved.id,request_id:req.id,pricing_mode:mode,price_version_id:q.price_version_id,status});
  return saved;
}
/* ------------------------------------------- customer price answer (read-only) */
// The Sales Brain's immediate answer to "how much?": ONLY current, effective, owner-approved rows of THIS market (catalog, attribute
// schema, configurations, price versions, tier/MOQ/discount settings). No DDL, no decision, no write and no guess: whatever the
// approved data does not cover comes back as a status the brain turns into one question or a price-only owner escalation.
export async function siCatalogProducts(env){return await all(env,"SELECT product_key,name,aliases_json FROM product_catalog WHERE status='current'");}
function pickSetting(rows,key,ctx){for(const scope of scopeCandidates(ctx)){const r=rows.find(x=>x.setting_key===key&&x.scope_key===scope);if(r)return {value:parseJson(r.value_json,null),id:r.id,version:r.version,scope_key:r.scope_key};}return null;}
export async function siApprovedPrice(env,{market,productKey,texts=[],quantity=null,at=now()}){
  if(!MARKETS.includes(market))return {status:"market_unknown"};
  const [product,attributeRows,configurations,prices,settings]=await Promise.all([
    first(env,"SELECT * FROM product_catalog WHERE product_key=? AND status='current' LIMIT 1",productKey),
    all(env,"SELECT * FROM product_attribute_schema WHERE product_key=? AND status='current' ORDER BY priority,attribute_key",productKey),
    all(env,"SELECT * FROM product_configurations WHERE product_key=? AND market IN (?,'*') AND status='current'",productKey,market),
    all(env,"SELECT * FROM price_versions WHERE market=? AND product_key=? AND status='current'",market,productKey),
    all(env,"SELECT * FROM business_settings WHERE setting_key IN ('quantity_tier_policy','moq','discount_rule') AND status='current'")
  ]);
  if(!product)return {status:"no_product"};
  const attributes=attributeRows.map(a=>({...a,allowed:parseJson(a.allowed_values_json,[])}));
  // Customer requirements in conversation order: a later message overrides an earlier one («مشکی» → «نه، قرمز»).
  const found={};for(const text of texts){const ex=extractRequirements({message:text,attributes});for(const [k,v] of Object.entries(ex.attributes))if(v.value!==null&&v.value!==undefined)found[k]=v.value;}
  const critical={},missing=[];
  for(const a of attributes.filter(x=>x.commercial_critical)){const v=found[a.attribute_key]!==undefined?matchAllowedValue(a,found[a.attribute_key]):null;if(v===null)missing.push(a);else critical[a.attribute_key]=v;}
  const base={product_key:productKey,product_name:product.name,market,currency:MARKET_CURRENCY[market],requirements:critical};
  if(missing.length){const a=missing[0];return {...base,status:"missing_attribute",attribute:{key:a.attribute_key,label:a.label,kind:a.attribute_kind,question_fa:a.question_fa||null,question_ar:a.question_ar||null,values:a.allowed.map(v=>v.label||v.value)}};}
  const configKey=configKeyFor(critical);
  if(!configurations.some(c=>c.config_key===configKey))return {...base,status:"configuration_not_priced",config_key:configKey};
  const ctx={market,product_key:productKey,config_key:configKey},t=Date.parse(at);
  const tiers=prices.filter(p=>p.config_key===configKey&&(!p.effective_from||Date.parse(p.effective_from)<=t)&&(!p.effective_until||Date.parse(p.effective_until)>=t)).sort((a,b)=>a.quantity_min-b.quantity_min);
  if(!tiers.length)return {...base,status:"no_price",config_key:configKey};
  if(tiers.some(p=>canonicalCurrency(p.currency)!==MARKET_CURRENCY[market]))return {...base,status:"currency_conflict",config_key:configKey};
  const policy=pickSetting(settings,"quantity_tier_policy",ctx),moqSetting=pickSetting(settings,"moq",ctx),rule=pickSetting(settings,"discount_rule",ctx);
  const moq=Number.isSafeInteger(Number(tiers[0].moq))&&Number(tiers[0].moq)>0?Number(tiers[0].moq):Number.isSafeInteger(Number(moqSetting?.value))&&Number(moqSetting.value)>0?Number(moqSetting.value):null;
  // One approved row prices every quantity it covers; several rows need the owner's tier policy (never inferred).
  const tierOf=q=>tiers.length===1?((q===null||(q>=tiers[0].quantity_min&&(tiers[0].quantity_max===null||q<=tiers[0].quantity_max)))?{status:"matched",price:tiers[0]}:{status:"no_tier"}):policy?resolveTierPrice(tiers,q,policy.value):{status:"policy_missing"};
  const shared={...base,config_key:configKey,moq,policy:policy?.value||null,tiers:tiers.map(p=>({min:p.quantity_min,max:p.quantity_max,unit_price_minor:p.unit_price_minor,price_version_id:p.id,version:p.version})),
    discount_rule:rule?.value&&["percent_bp","amount_minor"].includes(rule.value.type)?{type:rule.value.type,value:Number(rule.value.value),min_quantity:rule.value.min_quantity??null,id:rule.id,version:rule.version}:null};
  const q=Number.isSafeInteger(quantity)&&quantity>0?quantity:null;
  if(q===null&&tiers.length>1)return {...shared,status:"needs_quantity"};
  if(q!==null&&moq&&q<moq){const atMoq=tierOf(moq);return {...shared,status:"under_moq",quantity:q,unit_at_moq:atMoq.status==="matched"?atMoq.price.unit_price_minor:null};}
  const tier=tierOf(q);
  if(tier.status!=="matched")return {...shared,status:tier.status==="ambiguous"?"tier_conflict":tier.status==="policy_missing"?"policy_missing":"no_tier",quantity:q};
  const unit=Number(tier.price.unit_price_minor),subtotal=q===null?null:unit*q;
  if(subtotal!==null&&!Number.isSafeInteger(subtotal))return {...shared,status:"overflow",quantity:q};
  const r=shared.discount_rule;let discount=null;
  if(subtotal!==null&&r&&r.value>0&&(!r.min_quantity||q>=r.min_quantity)){const amount=r.type==="percent_bp"?Math.floor(subtotal*r.value/10000):r.value;discount={type:r.type,value:r.value,amount_minor:Math.min(amount,subtotal),rule_id:r.id,rule_version:r.version};}
  return {...shared,status:"priced",quantity:q,price_version:{id:tier.price.id,version:tier.price.version},unit_price_minor:unit,subtotal_minor:subtotal,discount,total_minor:subtotal===null?null:subtotal-(discount?.amount_minor||0)};
}
export async function verifyQuotePriceVersion(env,q){
  if(q.pricing_mode==="custom_owner"){const d=await first(env,"SELECT status,owner_decision FROM owner_decisions WHERE id=?",q.custom_price_decision_id||"");if(!d||d.status!=="RESOLVED")throw Error("Custom price requires a resolved owner pricing decision");return;}
  if(q.pricing_mode!=="versioned_price")return;
  const p=await first(env,"SELECT * FROM price_versions WHERE id=?",q.price_version_id||"");
  if(!p||p.status!=="current")throw Error("Approved price version is no longer current; re-prepare the quote");
  if(Number(p.unit_price_minor)!==Number(q.unit_price_minor)||canonicalCurrency(p.currency)!==canonicalCurrency(q.currency)||p.market!==q.market)throw Error("Quote no longer matches its approved price version");
}

/* ----------------------------------------------------------- cost + margin */
export async function estimateQuoteCost(env,{market,product_key,config_key,quantity},overrides={}){
  const ctx={market,product_key,config_key};
  const required=overrides.settings?.required_cost_components??(await getSetting(env,"required_cost_components",ctx))?.value;
  if(!required)return {status:"UNKNOWN",reason:"required_cost_components_not_defined",cost_minor:null,missing_components:[]};
  const rows=await all(env,"SELECT * FROM cost_versions WHERE market=? AND product_key=? AND config_key IN (?,'*') AND status='current'",market,product_key,config_key||"*");
  const parts=[],missing=[];let total=0;
  for(const c of required){
    const caseCost=overrides.costs?.[c];
    const cands=rows.filter(r=>r.component===c&&r.quantity_min<=quantity&&(r.quantity_max===null||quantity<=r.quantity_max)).sort((a,b)=>(a.config_key==="*")-(b.config_key==="*")||b.quantity_min-a.quantity_min);
    const pick=caseCost?{component:c,basis:caseCost.basis,amount_minor:caseCost.amount_minor,source:"case"}:cands[0]?{component:c,basis:cands[0].basis,amount_minor:cands[0].amount_minor,source:`cost_version:${cands[0].id}`}:null;
    if(!pick){missing.push(c);continue;}
    const line=pick.basis==="per_unit"?pick.amount_minor*quantity:pick.amount_minor;total+=line;parts.push({...pick,line_minor:line});
  }
  if(missing.length)return {status:"UNKNOWN",reason:"cost_data_required",cost_minor:null,missing_components:missing,known_parts:parts};
  return {status:"KNOWN",cost_minor:total,parts,missing_components:[]};
}
// Margin = selling price (total ex tax) − known costs. AI only warns; it never changes price, discount or MOQ.
export async function marginGuard(env,quote,overrides={}){
  const cost=await estimateQuoteCost(env,{market:quote.market,product_key:quote.product_key,config_key:quote.config_key,quantity:Number(quote.quantity)},overrides);
  const selling=quote.total_minor===null||quote.total_minor===undefined?null:Number(quote.total_minor)-Number(quote.tax_minor||0);
  const threshold=(await getSetting(env,"margin_threshold_bp",{market:quote.market,product_key:quote.product_key,config_key:quote.config_key}))?.value??null;
  if(cost.status!=="KNOWN"||selling===null)return {status:"UNKNOWN",message:"MARGIN = UNKNOWN · COST DATA REQUIRED",selling_minor:selling,currency:quote.currency,known_cost:cost.known_parts||null,missing_components:cost.missing_components||[],reason:cost.reason||(selling===null?"total_unknown":null),threshold_bp:threshold};
  const margin=selling-cost.cost_minor,bp=selling>0?Math.floor(margin*10000/selling):null;
  return {status:"KNOWN",currency:quote.currency,selling_minor:selling,cost_minor:cost.cost_minor,margin_minor:margin,margin_bp:bp,threshold_bp:threshold,
    warning:threshold===null?"margin_threshold_not_defined":bp===null||bp<threshold?"below_owner_threshold":null,parts:cost.parts};
}

/* ------------------------------------------------------- payment request */
// Approval-gated payment request after owner confirmation; never invents instructions, amounts, deposit or deadline.
// The deposit terms that apply to ONE order: the owner's approved override for this order (a customer's negotiated request), else the
// market's persistent default. The override never touches the persistent setting. A request still awaiting the owner => pending.
const DEPOSIT_TERMS_SQL="decision_type='PAYMENT_TERMS' AND json_valid(payload_json) AND json_extract(payload_json,'$.kind')='deposit_terms'";
// The advance % an owner approved on a deposit-terms decision: the owner's own answer value (a counter-offer), else the requested %.
function decisionDepositPercent(decision){
  const ans=parseJson(decision.owner_answer_json,{})||{},pl=parseJson(decision.payload_json,{})||{};
  const raw=ans.value!==undefined&&ans.value!==null&&String(ans.value).trim()!==""?ans.value:pl.requested_percent;
  const pct=Number(digitsLatin(String(raw??"")).replace(/[%٪\s]/g,""));
  return String(raw??"").trim()!==""&&Number.isInteger(pct)&&pct>=0&&pct<=100?pct:null;
}
// Requests about HOW the balance is paid (instalments, cheque); an approval of one keeps the default advance unless the owner gives a %.
export const DEPOSIT_TERMS_METHOD_KINDS=new Set(["installments","cheque"]);
export async function orderDepositTerms(env,order){
  await ensureSalesIntelligenceStore(env);
  const pending=await first(env,`SELECT id FROM owner_decisions WHERE order_id=? AND status='PENDING' AND ${DEPOSIT_TERMS_SQL} ORDER BY created_at DESC LIMIT 1`,order.id);
  if(pending)return {pending:true,decision_id:pending.id};
  const approved=await first(env,`SELECT id,payload_json,owner_answer_json FROM owner_decisions WHERE order_id=? AND status='RESOLVED' AND owner_decision IN ('APPROVE','ANSWER') AND ${DEPOSIT_TERMS_SQL} ORDER BY resolved_at DESC LIMIT 1`,order.id);
  const def=(await getSetting(env,"deposit_percent",{market:order.market,product_key:null}))?.value??null;
  if(approved){
    const pct=decisionDepositPercent(approved),kind=parseJson(approved.payload_json,{})?.requested_kind||"deposit";
    if(pct!==null||DEPOSIT_TERMS_METHOD_KINDS.has(kind))return {percent:pct??def,source:"owner_override",decision_id:approved.id,kind};
  }
  return {percent:def,source:"default",decision_id:null,kind:"default"};
}
// ---- The CUSTOMER-FACING payment configuration of one order, as the database says it is right now: which instructions apply
// (this order's approved CASE_ONLY answer, else the market setting — by id + version), the deposit setting (id + version + value)
// and the order's effective deposit terms (default, or the owner-approved override decision). A payment-request draft is built on
// exactly one configuration; its fingerprint is a hash of ids / versions / amounts only (no card, IBAN or phone).
export async function paymentRequestConfig(env,order){
  await ensureSalesIntelligenceStore(env);
  const terms=await orderDepositTerms(env,order);
  const caseRow=await first(env,"SELECT id,owner_answer_json FROM owner_decisions WHERE order_id=? AND decision_type='PAYMENT_TERMS' AND status='RESOLVED' AND owner_decision IN ('APPROVE','ANSWER') AND json_valid(scope_json) AND json_extract(scope_json,'$.scope')='CASE_ONLY' AND NOT (json_valid(payload_json) AND COALESCE(json_extract(payload_json,'$.kind'),'')='deposit_terms') ORDER BY resolved_at DESC LIMIT 1",order.id);
  const caseText=String(parseJson(caseRow?.owner_answer_json,{})?.value??"").trim()||null;
  const ctx={market:order.market,product_key:null};
  const setting=caseText?null:await getSetting(env,"payment_instructions",ctx);
  const depositSetting=await getSetting(env,"deposit_percent",ctx);
  const instructions=paymentDestinationOnly(caseText||setting?.value);
  const parts={v:1,order:order.id,status:order.status,total:order.total_minor,currency:order.currency,
    instructions:caseText?`case:${caseRow.id}`:setting?`setting:${setting.id}:v${setting.version}`:"none",
    deposit_setting:depositSetting?`${depositSetting.id}:v${depositSetting.version}:${depositSetting.value}`:"none",
    terms:terms.pending?`pending:${terms.decision_id}`:`${terms.source}:${terms.kind||"-"}:${terms.percent??"-"}:${terms.decision_id||"-"}`};
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(parts)));
  const fingerprint=Array.from(new Uint8Array(digest).slice(0,12),b=>b.toString(16).padStart(2,"0")).join("");
  return {terms,instructions,parts,fingerprint};
}
export async function preparePaymentRequest(env,order,{caseInstructions=null}={}){
  await ensureSalesIntelligenceStore(env);
  if(order.status!=="confirmed")return {created:false,reason:"order_not_awaiting_payment"};
  // The owner's already-approved CASE_ONLY instructions for THIS order are reused (never asked again, no second PAYMENT_TERMS decision);
  // which instructions / terms apply is read back from the database (paymentRequestConfig), so the draft and its send-time check agree.
  const config=await paymentRequestConfig(env,order);
  const instructions=config.instructions;
  const amount=D.customerPaymentAmountText?.({currency:order.currency,amount_minor:order.total_minor});
  const base={lead_id:order.lead_id,conversation_id:order.conversation_id,market:order.market,order_id:order.id};
  if(!instructions)return {created:false,decision:(await openDecision(env,{...base,decision_type:"PAYMENT_TERMS",priority:15,question:`Payment instructions for ${order.market} are not defined (order ${order.order_number})`,known:{order_number:order.order_number,total_minor:order.total_minor,currency:order.currency},recommendation:"Enter payment instructions for this order, or save them for the market.",risk:"No bank/payment details are invented.",payload:{resolution:"setting",setting_key:"payment_instructions",scope:{market:order.market}}})).decision};
  if(!amount)return {created:false,decision:(await openDecision(env,{...base,decision_type:"PAYMENT_TERMS",priority:15,fingerprint:`PAYMENT_AMOUNT|${order.id}`,question:`Order ${order.order_number} amount cannot be safely formatted (currency ${order.currency}); legacy currency is not converted`,known:{currency:order.currency,total_minor:order.total_minor},payload:{resolution:"record"}})).decision};
  const terms=config.terms;
  // A customer's request for other payment terms is still with the owner: no payment request until it is decided.
  if(terms.pending)return {created:false,reason:"payment_terms_pending",decision_id:terms.decision_id};
  const deposit=terms.percent;
  const language=D.outreachLanguage({country:order.market==="IRAN"?"iran":"iraq"}),ar=language==="Iraqi Arabic";
  const depositMinor=deposit!==undefined&&deposit!==null&&deposit>0?Math.ceil(Number(order.total_minor)*deposit/100):null;
  const depositText=depositMinor!==null&&D.customerPaymentAmountText?.({currency:order.currency,amount_minor:depositMinor});
  // The remaining balance is the system's own calculation (total − deposit); WHEN it is due stays in the owner's instructions.
  const remainingText=depositText&&Number(order.total_minor)-depositMinor>0&&D.customerPaymentAmountText?.({currency:order.currency,amount_minor:Number(order.total_minor)-depositMinor});
  const message=(ar?[`تم تأكيد طلبكم ${order.order_number}: ${order.product} × ${order.quantity}`,`المبلغ المطلوب: ${amount}`,depositText?`العربون المطلوب (${deposit}%): ${depositText}`:null,remainingText?`المبلغ المتبقي: ${remainingText}`:null,`طريقة الدفع: ${instructions}`]
    :[`سفارش ${order.order_number} تأیید شد: ${order.product} × ${order.quantity}`,`مبلغ قابل پرداخت: ${amount}`,depositText?`پیش‌پرداخت (${deposit}%): ${depositText}`:null,remainingText?`باقی‌مانده: ${remainingText}`:null,`روش پرداخت: ${instructions}`]).filter(Boolean).join("\n");
  // ONE draft per payment configuration: the key carries the configuration fingerprint, so an unchanged retrigger returns the same
  // draft and any change (instructions version, deposit setting, per-order terms) creates exactly one replacement. Older drafts of
  // the order become stale at send time (salesOutreachStillCurrent recomputes the fingerprint).
  const termsKey=`:cfg-${config.fingerprint}`;
  return await D.createApprovalGatedDraft(env,{key:`lead-order:update-draft:${order.id}:payment_request${termsKey}`,skipKey:`lead-order:update-draft-skipped:${order.id}:payment_request${termsKey}`,leadId:order.lead_id,conversationId:order.conversation_id,language,message,
    eventType:"lead_order_update_draft_created",eventMessage:"Payment request draft created for owner approval",details:{order_id:order.id,order_number:order.order_number,event:"payment_request",payment_instructions:instructions,payment_fingerprint:config.fingerprint,payment_config:config.parts,payment_terms:{deposit_percent:deposit??null,source:terms.source,decision_id:terms.decision_id||null},snapshot:{status:order.status,total_minor:order.total_minor,currency:order.currency,deposit_percent:deposit??null}}});
}

/* -------------------------------------------------- controlled learning */
function stripForCompare(s){return normText(s).replace(/[\p{P}\p{S}\s]+/gu,"");}
export function classifyCorrection(aiDraft,finalText){
  if(finalText===null||finalText===undefined)return {kind:"rejected",changed:{}};
  if(String(aiDraft||"")===String(finalText||""))return {kind:"none",changed:{}};
  if(stripForCompare(aiDraft)===stripForCompare(finalText))return {kind:"cosmetic",changed:{}};
  const nums=s=>[...digitsLatin(String(s||"")).matchAll(/\d+(?:[.,]\d+)?/g)].map(m=>m[0]).sort();
  const a=nums(aiDraft),b=nums(finalText),removed=a.filter(x=>!b.includes(x)),added=b.filter(x=>!a.includes(x));
  if(removed.length||added.length)return {kind:"numeric_commercial",changed:{removed,added}};
  const commercial=/(price|moq|discount|deposit|delivery|days|قیمت|تخفیف|حداقل|پیش.?پرداخت|تحویل|سعر|خصم|عربون|تسليم)/iu;
  return {kind:commercial.test(String(finalText))||commercial.test(String(aiDraft))?"commercial_wording":"content",changed:{}};
}
// Captures AI draft vs owner-final text with sales context; only numeric/commercial changes feed learning proposals.
export async function recordDraftCorrection(env,{outreachId,before=null,after=null,outcome=null}){
  await ensureSalesIntelligenceStore(env);
  const o=await first(env,"SELECT * FROM lead_outreach WHERE id=?",outreachId);if(!o)return null;
  const existing=await first(env,"SELECT * FROM draft_corrections WHERE outreach_id=?",outreachId),t=now();
  const req=o.conversation_id?await first(env,"SELECT * FROM sales_requests WHERE conversation_id=?",o.conversation_id):null;
  const aiDraft=existing?existing.ai_draft:(before??o.message),finalText=outcome==="rejected"?null:(after??o.message),c=classifyCorrection(aiDraft,finalText);
  if(existing)await env.DB.prepare("UPDATE draft_corrections SET final_text=?,change_kind=?,changed_json=?,owner_outcome=COALESCE(?,owner_outcome),updated_at=? WHERE outreach_id=?").bind(finalText,c.kind,JSON.stringify(c.changed),outcome,t,outreachId).run();
  else await env.DB.prepare(`INSERT OR IGNORE INTO draft_corrections(outreach_id,lead_id,conversation_id,inbox_message_id,market,request_class,product_key,config_key,ai_draft,final_text,change_kind,changed_json,owner_outcome,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(outreachId,o.lead_id,o.conversation_id,o.inbox_message_id,req?.market||null,req?.request_class||null,req?.product_key||null,req?.matched_config_key||null,aiDraft,finalText,c.kind,JSON.stringify(c.changed),outcome,t,t).run();
  if(c.kind==="numeric_commercial")await proposeFromCorrections(env,{product_key:req?.product_key||null,market:req?.market||null,request_class:req?.request_class||null,changed:c.changed});
  return c;
}
async function proposeFromCorrections(env,{product_key,market,request_class,changed}){
  const threshold=(await getSetting(env,"learning_proposal_threshold"))?.value;if(!threshold)return;
  const signature=`${product_key||"*"}|${market||"*"}|${request_class||"*"}|-${(changed.removed||[]).join(",")}|+${(changed.added||[]).join(",")}`;
  const rows=await all(env,"SELECT changed_json FROM draft_corrections WHERE change_kind='numeric_commercial' AND COALESCE(product_key,'*')=? AND COALESCE(market,'*')=? AND COALESCE(request_class,'*')=?",product_key||"*",market||"*",request_class||"*");
  const count=rows.filter(r=>{const c=parseJson(r.changed_json,{});return `${(c.removed||[]).join(",")}`===(changed.removed||[]).join(",")&&`${(c.added||[]).join(",")}`===(changed.added||[]).join(",");}).length;
  if(count<threshold)return;
  await openDecision(env,{decision_type:"LEARNING_RULE",fingerprint:`CORRECTION|${signature}`,product_key,market,priority:45,question:`Owner repeatedly changed ${changed.removed?.join(", ")||"(none)"} → ${changed.added?.join(", ")||"(none)"} in AI drafts (${count}x)`,
    known:{context:{product_key,market,request_class},occurrences:count},recommendation:"If this reflects a real rule (e.g. a first-order MOQ), save it with an explicit scope; otherwise keep case-by-case.",risk:"Nothing changes until the owner saves an explicit, scoped rule.",payload:{resolution:"learning",proposal:{resolution:"record"}}});
}

/* ------------------------------------------------- revenue intelligence */
const ATTRIBUTION_DIMENSIONS=new Set(["market","lead_source","product_key","config_key","request_class","pricing_mode","order_status","repeat_index","quantity"]);
// Idempotent rebuild from stored orders/payments; currencies are kept separate and never converted.
export async function rebuildRevenueAttribution(env){
  await ensureSalesIntelligenceStore(env);
  const rows=await all(env,`SELECT o.*,q.request_id,q.price_version_id,q.discount_minor AS quote_discount,q.config_key AS quote_config,l.notes AS lead_notes,
      (SELECT COALESCE(SUM(p.amount_minor),0) FROM lead_order_payments p WHERE p.order_id=o.id) AS paid,
      (SELECT COUNT(*) FROM lead_orders e WHERE e.lead_id=o.lead_id AND e.created_at<o.created_at AND e.status NOT IN ('order_candidate','cancelled')) AS prior_orders
    FROM lead_orders o LEFT JOIN lead_quotes q ON q.id=o.quote_id LEFT JOIN leads l ON l.id=o.lead_id`);
  const t=now();let n=0;
  for(const o of rows){
    const req=o.request_id?await first(env,"SELECT request_class,product_key FROM sales_requests WHERE id=?",o.request_id):null,meta=parseJson(o.lead_notes,{});
    const costsKnown=o.unit_cost_minor!==null&&o.unit_cost_minor!==undefined&&o.shipping_cost_minor!==null&&o.shipping_cost_minor!==undefined&&o.other_cost_minor!==null&&o.other_cost_minor!==undefined;
    const profit=costsKnown&&["paid","shipped","fulfilled"].includes(o.status)?Number(o.total_minor)-Number(o.tax_minor||0)-(o.unit_cost_minor*o.quantity+o.shipping_cost_minor+o.other_cost_minor):null;
    await env.DB.prepare(`INSERT OR REPLACE INTO revenue_attribution(order_id,lead_id,market,currency,lead_source,request_class,product_key,config_key,quantity,quote_id,price_version_id,pricing_mode,discount_minor,total_minor,paid_minor,profit_minor,order_status,repeat_index,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(o.id,o.lead_id,o.market,canonicalCurrency(o.currency),String(meta.source||meta.lead_source||meta.discovery_source||meta.platform||"unknown").slice(0,80),
      req?.request_class||"legacy",req?.product_key||normKey(o.product),o.quote_config||null,o.quantity,o.quote_id,o.price_version_id||null,o.pricing_mode,o.quote_discount??o.discount_minor??0,o.total_minor,Number(o.paid||0),profit,o.status,Number(o.prior_orders||0),o.created_at,t).run();n++;
  }
  return {rebuilt:n};
}
export async function revenueBreakdown(env,dimension){
  if(!ATTRIBUTION_DIMENSIONS.has(dimension))throw Error("Unsupported dimension");
  return (await all(env,`SELECT ${dimension} AS bucket,currency,COUNT(*) AS orders,SUM(CASE WHEN order_status IN ('paid','shipped','fulfilled') THEN 1 ELSE 0 END) AS paid_orders,
      SUM(paid_minor) AS paid_minor,SUM(total_minor) AS total_minor,SUM(discount_minor) AS discount_minor,SUM(CASE WHEN profit_minor IS NOT NULL THEN profit_minor END) AS profit_minor,
      SUM(CASE WHEN profit_minor IS NOT NULL THEN 1 ELSE 0 END) AS profit_known_orders,SUM(CASE WHEN repeat_index>0 THEN 1 ELSE 0 END) AS repeat_orders
    FROM revenue_attribution GROUP BY ${dimension},currency ORDER BY currency,paid_minor DESC`))
    .map(r=>({...r,legacy_currency:!CURRENCY_RULES[r.currency]}));
}

/* ------------------------------------------------------- AI cost ledger */
const DETERMINISTIC_TASKS=new Set(["requirements_extraction","request_classification","configuration_match","price_resolution","margin","owner_decision"]);
const SMALL_TASKS=new Set(["intent_classification","structured_extraction","simple_analysis"]);
// Deterministic routing: skip AI when rules/knowledge suffice; otherwise pick owner-configured small/strong model (null = keep existing default).
export async function routeAiTask(env,task){
  if(DETERMINISTIC_TASKS.has(task))return {skip:true,reason:"deterministic_engine"};
  const key=SMALL_TASKS.has(task)?"ai_model_small":"ai_model_strong";
  return {skip:false,tier:key==="ai_model_small"?"small":"strong",model:(await getSetting(env,key))?.value||null};
}
export async function recordAiUsage(env,{module,task,provider=null,model=null,usage=null,lead_id=null,conversation_id=null,quote_id=null,order_id=null}){
  await ensureSalesIntelligenceStore(env);
  const input=Number.isSafeInteger(Number(usage?.input_tokens))?Number(usage.input_tokens):null,output=Number.isSafeInteger(Number(usage?.output_tokens))?Number(usage.output_tokens):null;
  const rates=(await getSetting(env,"ai_model_pricing"))?.value?.[model||""];
  let status="unknown",cost=null,currency=null;
  if(rates&&input!==null&&output!==null){cost=Math.round((input*rates.input_per_mtok_minor+output*rates.output_per_mtok_minor)/1e6);currency=rates.currency;status="estimated_from_owner_rates";}
  await env.DB.prepare(`INSERT INTO ai_usage_ledger(id,module,task,provider,model,input_tokens,output_tokens,cost_status,cost_minor,cost_currency,lead_id,conversation_id,quote_id,order_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(uid(),String(module).slice(0,60),String(task).slice(0,60),provider,model,input,output,status,cost,currency,lead_id,conversation_id,quote_id,order_id,now()).run();
  return {cost_status:status,cost_minor:cost};
}
export async function aiUsageSummary(env){
  await ensureSalesIntelligenceStore(env);
  return await all(env,`SELECT module,task,model,cost_status,COUNT(*) AS calls,SUM(input_tokens) AS input_tokens,SUM(output_tokens) AS output_tokens,SUM(cost_minor) AS cost_minor,cost_currency
    FROM ai_usage_ledger GROUP BY module,task,model,cost_status,cost_currency ORDER BY calls DESC LIMIT 100`);
}

/* ------------------------------------------------------- money at stake */
export async function moneyAtStake(env){
  await ensureSalesIntelligenceStore(env);
  const decisions=await all(env,"SELECT decision_type,COUNT(*) AS n,MIN(priority) AS top_priority FROM owner_decisions WHERE status='PENDING' GROUP BY decision_type ORDER BY top_priority");
  const quotes=await all(env,"SELECT id,lead_id,status,currency,total_minor,pricing_mode,margin_json,updated_at FROM lead_quotes WHERE status IN ('quote_ready','pending_approval','approved','waiting_for_owner_price','requires_owner_review','draft') ORDER BY updated_at DESC LIMIT 50");
  const marginWarnings=quotes.map(q=>({...q,margin:parseJson(q.margin_json,null)})).filter(q=>q.margin&&(q.margin.status==="UNKNOWN"||q.margin.warning==="below_owner_threshold")).map(({margin_json,...q})=>q);
  const followups=D.findStalledRevenueItems?(await D.findStalledRevenueItems(env)).map(({record,...x})=>x):[];
  const sum=(items,field)=>{const o={};for(const x of items)if(x.currency&&x[field]!==null&&x[field]!==undefined)o[canonicalCurrency(x.currency)]=(o[canonicalCurrency(x.currency)]||0)+Number(x[field]);return o;};
  return {pending_decisions:decisions,quotes_awaiting_owner:quotes.filter(q=>["quote_ready","pending_approval","waiting_for_owner_price","requires_owner_review"].includes(q.status)).map(({margin_json,...q})=>q),
    quote_value_by_currency:sum(quotes.filter(q=>["quote_ready","pending_approval","approved"].includes(q.status)),"total_minor"),
    orders_awaiting_payment:followups.filter(x=>x.kind==="order_unpaid"),partial_balances:followups.filter(x=>x.kind==="balance_open"),
    outstanding_by_currency:sum(followups.filter(x=>x.kind==="order_unpaid"||x.kind==="balance_open"),"outstanding_minor"),
    stalled_commercial:followups.filter(x=>x.audience==="owner"),repeat_opportunities:followups.filter(x=>x.kind==="reorder"),margin_warnings:marginWarnings};
}

/* ------------------------------------------------- brain + routes glue */
// Called by the sales brain; returns null (legacy behavior) unless structured product knowledge exists.
export async function siHandleInbound(env,{row,memory,storedMarket,language}){
  await ensureSalesIntelligenceStore(env);
  if(!await first(env,"SELECT id FROM product_catalog WHERE status='current' LIMIT 1"))return null;
  const quantity=Number.isSafeInteger(memory.requested_quantity)&&memory.requested_quantity>0?memory.requested_quantity:null;
  const r=await updateSalesRequest(env,{leadId:row.lead_id,conversationId:row.conversation_id,message:row.message,sourceId:row.id,productText:memory.product_interest||null,quantity,market:storedMarket||null});
  const ar=language==="Iraqi Arabic";
  if(r.request_class==="UNCLEAR"){const q=(r.questions||[])[0];return {request_id:r.request_id,request_class:"UNCLEAR",action:"ask_requirement",draft:q?.question||null,needs_owner:!q?.question,reason:q?.question?null:"requirement_question_not_defined",missing:r.missing};}
  // Holding replies carry no commercial claim; the commercial work goes to Owner Decisions / quote approval.
  if(r.request_class==="CUSTOM")return {request_id:r.request_id,request_class:"CUSTOM",action:"custom_owner",needs_owner:false,reason:"owner_decision_required",missing:r.missing,
    draft:ar?"تم استلام طلبكم الخاص. نراجع التفاصيل مع الفريق ونرجع لكم بعد التأكيد.":"درخواست اختصاصی شما دریافت شد. جزئیات با تیم بررسی می‌شود و پس از تأیید به شما اطلاع می‌دهیم."};
  return {request_id:r.request_id,request_class:"STANDARD",action:r.quote?"fast_quote_prepared":"standard_owner",needs_owner:false,reason:r.quote?"fast_quote_ready_for_owner":"owner_decision_required",missing:[],
    draft:ar?"تم استلام طلبكم. نجهز عرض السعر ونرسله بعد المراجعة.":"درخواست شما دریافت شد. پیش‌فاکتور آماده و پس از بررسی ارسال می‌شود."};
}
export async function handleSalesIntelligence(req,env,u){
  const json=D.json,b=["POST","PATCH"].includes(req.method)?await req.json().catch(()=>({})):{},p=u.pathname.replace(/^\/api\/si\/?/,"").split("/").filter(Boolean),actor="authenticated_owner";
  if(!D.auth(req,env))return json({ok:false,error:"Unauthorized"},401);
  try{
    await ensureSalesIntelligenceStore(env);
    if(p[0]==="locked-rules")return json({ok:true,locked:LOCKED_RULES,currency_rules:CURRENCY_RULES});
    if(p[0]==="knowledge"&&p[1]&&req.method==="GET")return json({ok:true,items:await listKnowledge(env,p[1],{search:u.searchParams.get("search")||"",status:u.searchParams.get("status")||"current"})});
    if(p[0]==="knowledge"&&p[1]&&p[2]==="retire"&&req.method==="POST")return json({ok:true,...await retireKnowledge(env,p[1],String(b.id||""),actor)});
    if(p[0]==="knowledge"&&p[1]&&req.method==="POST")return json({ok:true,...await saveKnowledgeVersion(env,p[1],b.input||b,{actor,expectExisting:!!b.expect_existing})});
    if(p[0]==="decisions"&&!p[1]&&req.method==="GET")return json({ok:true,items:await listDecisions(env,{status:(u.searchParams.get("status")||"PENDING").toUpperCase(),type:u.searchParams.get("type")})});
    if(p[0]==="decisions"&&p[1]&&p[2]==="history")return json({ok:true,items:await decisionHistory(env,p[1])});
    if(p[0]==="decisions"&&p[1]==="resolve"&&req.method==="POST")return json({ok:true,...await resolveDecision(env,{id:String(b.id||""),action:b.action,scope:b.scope,answer:b.answer||{},note:b.note,actor})});
    if(p[0]==="gaps")return json({ok:true,items:await all(env,"SELECT * FROM knowledge_gaps ORDER BY CASE status WHEN 'recurring' THEN 0 WHEN 'open' THEN 1 ELSE 2 END,occurrences DESC LIMIT 100")});
    if(p[0]==="gaps-detect"&&req.method==="POST")return json({ok:true,...await detectRecurringGaps(env)});
    if(p[0]==="requests"&&!p[1]&&req.method==="GET")return json({ok:true,items:(await all(env,`SELECT r.*,q.status AS quote_status,q.total_minor,q.currency,q.unit_price_minor,q.price_version_id,q.margin_json,q.pricing_mode,pv.version AS price_version,pv.quantity_min,pv.quantity_max
        FROM sales_requests r LEFT JOIN lead_quotes q ON q.id=r.quote_id LEFT JOIN price_versions pv ON pv.id=q.price_version_id ORDER BY r.updated_at DESC LIMIT 100`)).map(r=>({...r,requirements:parseJson(r.requirements_json,{}),missing:parseJson(r.missing_json,[]),custom_reasons:parseJson(r.custom_reasons_json,[]),margin:parseJson(r.margin_json,null)}))});
    if(p[0]==="requests"&&p[1]&&p[2]==="requirements"&&req.method==="POST"){const r=await first(env,"SELECT * FROM sales_requests WHERE id=?",p[1]);if(!r)return json({ok:false,error:"Sales request not found"},404);
      return json({ok:true,...await updateSalesRequest(env,{leadId:r.lead_id,conversationId:r.conversation_id,productText:b.product||null,quantity:b.quantity??null,market:b.market||null,ownerRequirements:b.requirements||{},actor})});}
    if(p[0]==="requests"&&p[1]&&p[2]==="reset"&&req.method==="POST"){
      const r=await env.DB.prepare("UPDATE sales_requests SET requirements_json='{}',unknown_json='[]',case_overrides_json='{}',quote_id=NULL,request_class=NULL,matched_config_key=NULL,missing_json='[]',custom_reasons_json='[]',status='open',updated_at=? WHERE id=?").bind(new Date().toISOString(),p[1]).run();
      if(!r.meta?.changes)return json({ok:false,error:"Sales request not found"},404);await auditSafe(env,"sales_request_reset","Owner reset a sales request for a new purchase",{request_id:p[1],actor});return json({ok:true,reset:true});}
    if(p[0]==="requests"&&p[1]&&p[2]==="process"&&req.method==="POST")return json({ok:true,...await processSalesRequest(env,p[1],{actor})});
    if(p[0]==="money-at-stake")return json({ok:true,...await moneyAtStake(env)});
    if(p[0]==="intelligence"&&req.method==="POST")return json({ok:true,...await rebuildRevenueAttribution(env)});
    if(p[0]==="intelligence")return json({ok:true,dimension:u.searchParams.get("dimension")||"market",items:await revenueBreakdown(env,u.searchParams.get("dimension")||"market")});
    if(p[0]==="corrections")return json({ok:true,items:await all(env,`SELECT c.change_kind,c.market,c.request_class,c.product_key,COUNT(*) AS n,SUM(CASE WHEN EXISTS(SELECT 1 FROM revenue_attribution a WHERE a.lead_id=c.lead_id AND a.order_status IN ('paid','shipped','fulfilled')) THEN 1 ELSE 0 END) AS led_to_paid
        FROM draft_corrections c GROUP BY c.change_kind,c.market,c.request_class,c.product_key ORDER BY n DESC LIMIT 100`)});
    if(p[0]==="ai-usage")return json({ok:true,items:await aiUsageSummary(env)});
    if(p[0]==="ai-route")return json({ok:true,...await routeAiTask(env,String(u.searchParams.get("task")||""))});
    return json({ok:false,error:"Not found"},404);
  }catch(error){return json({ok:false,error:D.sanitizeOperationalError?D.sanitizeOperationalError(error?.message||error):String(error?.message||error)},409);}
}
export async function siScheduled(env){
  await ensureSalesIntelligenceStore(env);
  const gaps=await detectRecurringGaps(env),attribution=await rebuildRevenueAttribution(env);
  return {gaps,attribution};
}
