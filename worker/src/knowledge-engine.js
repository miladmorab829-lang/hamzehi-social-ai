// Generic, data-driven business knowledge engine for HAMZEHI SOCIAL AI.
//
// Pure functions only: no I/O, no eval, no dynamic code. Everything the owner teaches is DATA in one canonical envelope
// (schema "hamzehi.knowledge.v1") stored through the existing versioned Sales Knowledge tables (propose → owner review →
// apply). A new product, size, color, combination, MOQ, discount condition, printing/ribbon option or market rule is a new
// record in that envelope — never a new code branch.
//
// Envelope = kind + (value | relation | conditions + effect) + scope (entity, market) + metadata. Nothing here grants
// commercial authority: rules only RETURN approved knowledge; the Sales Brain keeps every owner gate.

export const KNOWLEDGE_SCHEMA="hamzehi.knowledge.v1";
export const KNOWLEDGE_DOMAIN="knowledge";
export const KNOWLEDGE_KINDS=new Set(["fact","rule","relation","constraint","capability","availability","prohibition"]);
export const KNOWLEDGE_OPERATORS=new Set(["=","!=",">",">=","<","<=","contains","in","not_in","exists"]);
export const KNOWLEDGE_OPERATIONS=new Set(["ADD","EXPAND","UPDATE","REPLACE","DEACTIVATE","DELETE"]);
export const KNOWLEDGE_MARKETS=new Set(["GLOBAL","IRAN","ARAB"]);
export const KNOWLEDGE_LIMITS={records:25,conditions:8,effects:8,members:6,keywords:12,list:20,string:200,text:12000,fanout:25};

const FA_DIGITS="۰۱۲۳۴۵۶۷۸۹",AR_DIGITS="٠١٢٣٤٥٦٧٨٩";
const OP_ALIASES={"==":"=","===":"=",eq:"=",equals:"=","≠":"!=","<>":"!=",ne:"!=",gt:">",gte:">=","≥":">=",lt:"<",lte:"<=","≤":"<=",has:"contains",includes:"contains",nin:"not_in","not in":"not_in",isin:"in"};
// Prices/costs/fees are never knowledge records: the existing versioned price list stays the only pricing store.
const PRICE_LIKE=/(?:^|_)(?:price|prices|pricing|unit_price|total|cost|costs|fee|fees|amount|rate|tariff|قیمت|هزینه|نرخ)(?:_|$)/u;
// Conservative: anything touching these commercial areas is "commercial" → owner confirmation to approve, owner gate to disclose.
const COMMERCIAL_CONCEPT=/(?:^|_)(?:moq|min|minimum|max|maximum|qty|quantity|discount|promo|promotion|offer|price|pricing|cost|fee|shipping|delivery|freight|deposit|prepayment|payment|invoice|credit|refund|warranty|production|lead|leadtime|capacity|turnaround|timing|order|orders|ordering|حداقل|حداکثر|تخفیف|قیمت|ارسال|پیش|پرداخت|تولید|ظرفیت)(?:_|$)/u;
const ALIAS_CONCEPTS=new Set(["alias","aliases","synonym","synonyms","display_name","name","نام","نام_دیگر"]);

export function knowledgeText(value){
  return String(value??"").normalize("NFKC")
    .replace(/[۰-۹]/g,d=>String(FA_DIGITS.indexOf(d))).replace(/[٠-٩]/g,d=>String(AR_DIGITS.indexOf(d)))
    .replace(/ي/g,"ی").replace(/ى/g,"ی").replace(/ك/g,"ک").replace(/[ً-ٰٟ]/g,"")
    .replace(/[×✕]/g,"x").replace(/[‌‍_]+/g," ").replace(/\s+/g," ").trim().toLowerCase();
}
export function knowledgeIdent(value,max=60){
  const x=knowledgeText(value).replace(/[^\p{L}\p{N}]+/gu,"_").replace(/^_+|_+$/g,"");
  return x&&x.length<=max?x:null;
}
function cleanString(v,max){const s=String(v).normalize("NFKC").replace(/[\u0000-\u001f]+/g," ").replace(/\s+/g," ").trim();return s&&s.length<=max?s:null;}
function scalarOf(v,max=KNOWLEDGE_LIMITS.string){
  if(typeof v==="boolean")return v;
  if(typeof v==="number"){if(!Number.isFinite(v))return undefined;return Number.isSafeInteger(v)?v:String(v);}
  if(typeof v==="string"){const s=cleanString(v,max);return s===null?undefined:s;}
  return undefined;
}
function num(v){if(typeof v==="number")return Number.isFinite(v)?v:NaN;const t=knowledgeText(v).replace(/[,\s]/g,"");return /^-?\d+(?:\.\d+)?$/.test(t)?Number(t):NaN;}
function escapeRegex(s){return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
function hasPhrase(text,phrase){const p=knowledgeText(phrase);if(!p||p.length<2)return false;return new RegExp("(?<![\\p{L}\\p{N}])"+escapeRegex(p)+"(?![\\p{L}\\p{N}])","u").test(text);}

function cleanCondition(c,issues,i){
  if(!c||typeof c!=="object"||Array.isArray(c)){issues.push(`condition_${i}_invalid`);return null;}
  const field=knowledgeIdent(c.field,40);let op=String(c.op??c.operator??"").trim().toLowerCase();op=OP_ALIASES[op]||op;
  if(!field||!KNOWLEDGE_OPERATORS.has(op)){issues.push(`condition_${i}_invalid`);return null;}
  if(op==="exists")return {field,op};
  if(op==="in"||op==="not_in"){
    const arr=Array.isArray(c.value)?c.value:[],vals=arr.map(x=>scalarOf(x,100)).filter(x=>x!==undefined);
    if(!vals.length||vals.length!==arr.length||vals.length>KNOWLEDGE_LIMITS.list){issues.push(`condition_${i}_value_invalid`);return null;}
    return {field,op,value:vals};
  }
  const v=Array.isArray(c.value)?undefined:scalarOf(c.value,100);
  if(v===undefined){issues.push(`condition_${i}_value_invalid`);return null;}
  if([">",">=","<","<="].includes(op)){const n=num(v);if(!Number.isFinite(n)){issues.push(`condition_${i}_value_invalid`);return null;}return {field,op,value:Number.isSafeInteger(n)?n:String(n)};}
  return {field,op,value:v};
}
function cleanEffect(e,issues){
  if(e===null||e===undefined)return null;
  if(typeof e!=="object"||Array.isArray(e)){issues.push("effect_invalid");return null;}
  const out={},entries=Object.entries(e);
  if(entries.length>KNOWLEDGE_LIMITS.effects){issues.push("effect_too_large");return null;}
  for(const [k,v] of entries){
    const key=knowledgeIdent(k,40),val=scalarOf(v);
    if(!key||val===undefined){issues.push("effect_invalid");continue;}
    if(PRICE_LIKE.test(key)){issues.push("price_belongs_to_price_list");continue;}
    out[key]=val;
  }
  return Object.keys(out).length?out:null;
}
function cleanRelation(r,issues){
  if(r===null||r===undefined)return null;
  if(typeof r!=="object"||Array.isArray(r)){issues.push("relation_invalid");return null;}
  const name=knowledgeIdent(r.name,60),members={},entries=Object.entries(r.members&&typeof r.members==="object"&&!Array.isArray(r.members)?r.members:{});
  if(!name||entries.length<2||entries.length>KNOWLEDGE_LIMITS.members){issues.push("relation_invalid");return null;}
  for(const [k,v] of entries){const field=knowledgeIdent(k,40),val=scalarOf(v,100);if(!field||val===undefined||val===null||val===""){issues.push("relation_invalid");return null;}members[field]=val;}
  const only=(Array.isArray(r.only_with)?r.only_with:[]).map(x=>knowledgeIdent(x,40)).filter(x=>x&&Object.hasOwn(members,x));
  if(only.length>=Object.keys(members).length){issues.push("relation_invalid");return null;}
  return {name,members,...(only.length?{only_with:[...new Set(only)].sort()}:{})};
}
// Shared by the owner-text normalizer and by the server-side validator of stored envelopes.
function buildEnvelopeCore(raw,issues){
  const kind=String(raw.kind||"").toLowerCase();
  if(!KNOWLEDGE_KINDS.has(kind)){issues.push("invalid_kind");return null;}
  const conditionsRaw=Array.isArray(raw.conditions)?raw.conditions:[];
  if(conditionsRaw.length>KNOWLEDGE_LIMITS.conditions)issues.push("too_many_conditions");
  const conditions=conditionsRaw.slice(0,KNOWLEDGE_LIMITS.conditions).map((c,i)=>cleanCondition(c,issues,i)).filter(Boolean);
  const effect=cleanEffect(raw.effect,issues),relation=cleanRelation(raw.relation,issues);
  let value;
  if(raw.value!==undefined&&raw.value!==null){value=scalarOf(raw.value);if(value===undefined||Array.isArray(raw.value))issues.push("value_invalid");}
  if(value!==undefined&&typeof value==="object")issues.push("value_invalid");
  if(kind==="relation"&&!relation)issues.push("relation_required");
  if(["fact","capability","availability"].includes(kind)&&value===undefined&&!relation)issues.push("value_missing");
  if(["rule","constraint","prohibition"].includes(kind)&&!effect&&value===undefined&&!relation)issues.push("empty_rule");
  const priority=Number.isInteger(raw.priority)&&raw.priority>=0&&raw.priority<=100?raw.priority:50;
  const keywords=(Array.isArray(raw.keywords)?raw.keywords:[]).map(x=>cleanString(x,40)).filter(Boolean).slice(0,KNOWLEDGE_LIMITS.keywords);
  const labels={};for(const lang of ["fa","ar","en"]){const s=raw.labels&&typeof raw.labels==="object"?cleanString(raw.labels[lang]??"",80):null;if(s)labels[lang]=s;}
  const unit=raw.unit?cleanString(raw.unit,20):null,currency=raw.currency?String(raw.currency).toUpperCase():null;
  if(currency&&!["TOMAN","USD"].includes(currency))issues.push("unsupported_currency");
  const contextField=raw.context_field?knowledgeIdent(raw.context_field,40):null;
  const env={schema:KNOWLEDGE_SCHEMA,kind,priority,conditions,keywords,labels};
  if(value!==undefined)env.value=value;
  if(raw.multi===true)env.multi=true;
  if(relation)env.relation=relation;
  if(effect)env.effect=effect;
  if(unit)env.unit=unit;
  if(currency&&["TOMAN","USD"].includes(currency))env.currency=currency;
  if(contextField)env.context_field=contextField;
  return env;
}
export function knowledgeIsCommercial(concept,envelope){
  const names=[concept,envelope?.relation?.name,envelope?.context_field,...Object.keys(envelope?.effect||{}),...(envelope?.conditions||[]).map(c=>c.field).filter(f=>f!=="message")].filter(Boolean);
  return names.some(n=>COMMERCIAL_CONCEPT.test(String(n)));
}
export function validateKnowledgeEnvelope(env){
  if(!env||typeof env!=="object"||Array.isArray(env)||env.schema!==KNOWLEDGE_SCHEMA)throw Error(`Generic knowledge requires the ${KNOWLEDGE_SCHEMA} envelope`);
  const issues=[];buildEnvelopeCore(env,issues);
  if(issues.length)throw Error("Invalid knowledge envelope: "+issues[0]);
  return true;
}
// Slot identity: which records are "the same piece of knowledge". Different conditions/relation members ⇒ a different rule.
export function knowledgeSlot(env){
  return {kind:env.kind,relation:env.relation?{name:env.relation.name,members:env.relation.members}:null,
    conditions:(env.conditions||[]).map(c=>JSON.stringify([c.field,c.op,c.value??null])).sort(),
    effect_keys:Object.keys(env.effect||{}).sort(),member:env.multi?knowledgeText(env.value):null};
}

// ---- owner text → canonical records (input is the AI's JSON; every field is re-validated deterministically) ----
function expandRelationMembers(rel){
  const entries=Object.entries(rel?.members||{});let combos=[{}];
  for(const [field,v] of entries){const values=Array.isArray(v)?v:[v];combos=combos.flatMap(c=>values.map(x=>({...c,[field]:x})));if(combos.length>KNOWLEDGE_LIMITS.fanout)return null;}
  return combos;
}
function normalizeOne(raw,defaultMarket){
  const issues=[];
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return [{operation:"ADD",issues:["record_invalid"],kind:"fact",entity_type:"business",entity_key:"unresolved",concept:"needs_clarification",market:defaultMarket,envelope:null,typed:null,confidence:null}];
  const operationRaw=String(raw.operation||"ADD").toUpperCase();let operation=KNOWLEDGE_OPERATIONS.has(operationRaw)?operationRaw:null;
  if(!operation)issues.push("invalid_operation");
  for(const a of (Array.isArray(raw.ambiguities)?raw.ambiguities:[]).slice(0,5)){const s=cleanString(a,200);if(s)issues.push("ambiguous: "+s);}
  const entityRaw=raw.entity&&typeof raw.entity==="object"?raw.entity:{};
  let entityKey=cleanString(entityRaw.key??raw.entity_key??"",120)||"";const lowered=knowledgeText(entityKey);
  let entityType=["product","model","business"].includes(entityRaw.type)?entityRaw.type:null;
  if(["global","all","business","همه","کل"].includes(lowered)||(!entityKey&&entityType==="business")){entityKey="global";entityType="business";}
  else if(!entityKey)issues.push("entity_missing");
  else if(!entityType||entityType==="business")entityType="product";
  let market=null;
  if(raw.market!==null&&raw.market!==undefined&&raw.market!==""){market=String(raw.market).toUpperCase();if(!KNOWLEDGE_MARKETS.has(market)){issues.push("invalid_market");market=null;}}
  const typed=raw.typed&&typeof raw.typed==="object"?{domain:knowledgeIdent(raw.typed.domain,40),attribute:knowledgeIdent(raw.typed.attribute,40)}:null;
  const confidence=typeof raw.confidence==="number"&&raw.confidence>=0&&raw.confidence<=1?raw.confidence:null;
  const base={operation:operation||"ADD",entity_type:entityType||"business",entity_key:entityKey||"unresolved",market:market||defaultMarket,confidence,issues:[...issues]};
  if(typed){
    if(!typed.domain||!typed.attribute)base.issues.push("typed_field_invalid");
    const values=Array.isArray(raw.value)?raw.value:[raw.value];
    if(values.length>KNOWLEDGE_LIMITS.fanout)base.issues.push("too_many_values");
    return values.slice(0,KNOWLEDGE_LIMITS.fanout).map(v=>({...base,issues:[...base.issues],kind:"fact",concept:typed.attribute||"needs_clarification",typed,value:v,envelope:null}));
  }
  // conditions may scope the market ("only for Iraq") — that is the market column, not a runtime condition
  const conditionsIn=Array.isArray(raw.conditions)?raw.conditions:[];let scopedMarket=null;
  const conditions=conditionsIn.filter(c=>{
    const field=knowledgeIdent(c?.field,40),op=String(c?.op??"").trim();const m=String(c?.value??"").toUpperCase();
    if(field==="market"&&(op==="="||op==="==")&&["IRAN","ARAB"].includes(m)){scopedMarket=m;return false;}
    return true;
  });
  if(scopedMarket){if(market&&market!==scopedMarket)base.issues.push("market_conflict");else base.market=scopedMarket;}
  const concept=knowledgeIdent(raw.concept,60);
  if(!concept)base.issues.push("concept_missing");
  const kind=String(raw.kind||"").toLowerCase();
  const rawCore={...raw,conditions,kind};
  const records=[];
  const emit=(core,extra={})=>{const r={...base,issues:[...base.issues],kind,concept:concept||"needs_clarification",typed:null,envelope:core};Object.assign(r,extra);records.push(r);};
  const probeIssues=[];
  if(kind==="relation"||(raw.relation&&typeof raw.relation==="object")){
    const combos=expandRelationMembers(raw.relation);
    if(!combos){base.issues.push("relation_too_large");emit(null);return records;}
    for(const members of combos.length?combos:[{}]){
      const issuesLocal=[],core=buildEnvelopeCore({...rawCore,relation:{...raw.relation,members}},issuesLocal);
      emit(core);records[records.length-1].issues.push(...issuesLocal);
    }
    return records;
  }
  if(Array.isArray(raw.value)&&["fact","capability","availability"].includes(kind)){
    if(raw.value.length>KNOWLEDGE_LIMITS.fanout)base.issues.push("too_many_values");
    for(const v of raw.value.slice(0,KNOWLEDGE_LIMITS.fanout)){const issuesLocal=[],core=buildEnvelopeCore({...rawCore,value:v,multi:true},issuesLocal);emit(core);records[records.length-1].issues.push(...issuesLocal);}
    return records;
  }
  const core=buildEnvelopeCore(rawCore,probeIssues);emit(core);records[0].issues.push(...probeIssues);
  return records;
}
export function normalizeKnowledgeInput(rawRecords,{market="GLOBAL"}={}){
  const list=Array.isArray(rawRecords)?rawRecords:[];
  if(!list.length)return {records:[],issues:["no_records"]};
  const records=[];
  for(const raw of list.slice(0,KNOWLEDGE_LIMITS.records))for(const r of normalizeOne(raw,KNOWLEDGE_MARKETS.has(market)?market:"GLOBAL"))records.push(r);
  for(const r of records){
    // generic safety: price-like concept names are rejected; EXPAND is just ADD for generic records
    if(r.envelope&&PRICE_LIKE.test(r.concept))r.issues.push("price_belongs_to_price_list");
    if(r.envelope&&r.operation==="EXPAND")r.operation="ADD";
    if(r.envelope)r.envelope.commercial=knowledgeIsCommercial(r.concept,r.envelope);
    r.issues=[...new Set(r.issues)];
  }
  return {records,issues:list.length>KNOWLEDGE_LIMITS.records?["too_many_records"]:[]};
}
export function knowledgeExtractionPrompt({text,market,typedFields}){
  return [
    "You convert ONE owner statement about the packaging / gift-box business HAMZEHI BOX into structured knowledge records.",
    "Return ONLY a JSON object {\"records\":[...]} (at most 25 records). The statement may be Persian, Arabic or English.",
    "Never invent anything the owner did not say. If something needed is missing or unclear, add a short string to that record's \"ambiguities\" instead of guessing. Absence is not a fact: never turn a missing price/color/option into \"unavailable\".",
    "Record shape:",
    "{\"operation\":\"ADD|UPDATE|REPLACE|DEACTIVATE|DELETE\" (UPDATE/REPLACE when the owner changes, corrects or replaces earlier knowledge; DEACTIVATE/DELETE when removed),",
    " \"kind\":\"fact|rule|relation|constraint|capability|availability|prohibition\",",
    " \"typed\":null or {\"domain\":\"<d>\",\"attribute\":\"<a>\"} ONLY when the statement is a plain value for one of the typed fields listed below,",
    " \"entity\":{\"type\":\"product|model|business\",\"key\":\"<product or model exactly as the owner wrote it, or global for business-wide knowledge>\"},",
    " \"concept\":\"<snake_case name of what this is about, e.g. standard_colors, printing_options, allowed_combination>\",",
    " \"value\":<string|number|boolean|array of those|null> (an array becomes one record per element),",
    " \"relation\":null or {\"name\":\"<snake_case>\",\"members\":{\"<field>\":\"<value or [values]>\"},\"only_with\":[\"<field>\"]} (only_with when X is allowed ONLY together with Y),",
    " \"conditions\":[{\"field\":\"<snake_case, e.g. quantity|size|color|ribbon_color|printing|destination|configuration|message>\",\"op\":\"=|!=|>|>=|<|<=|contains|in|not_in|exists\",\"value\":<scalar|array>}],",
    " \"effect\":null or {\"<snake_case key>\":<scalar>} (e.g. {\"discount_percent\":10} or {\"order_allowed\":false}),",
    " \"context_field\":null or \"<snake_case condition field these values belong to, e.g. color>\",",
    " \"unit\":null,\"market\":\"IRAN|ARAB|GLOBAL|null\" (null when the owner did not restrict the market),\"priority\":50,",
    " \"keywords\":[\"words customers use when asking about this, in the owner's language(s)\"],\"labels\":{\"fa\":\"\",\"ar\":\"\",\"en\":\"\"},\"confidence\":0.0,\"ambiguities\":[]}",
    "Rules: never output prices, costs, fees or money amounts (they belong to the price list). Percentages and counts are numbers. For a text trigger use a condition {\"field\":\"message\",\"op\":\"contains\",\"value\":\"...\"}.",
    "Typed fields (use typed ONLY for a plain value of these): "+(typedFields||[]).join("; "),
    "Default market for this submission: "+market,
    "OWNER_TEXT:",
    "<<<",
    String(text||""),
    ">>>"
  ].join("\n");
}
export function looksLikeKnowledgeStatement(text){
  const t=String(text||"").trim();
  return t.length>=8&&t.length<=KNOWLEDGE_LIMITS.text;
}

// ---- retrieval ----
export function hydrateKnowledgeRecords(rows){
  const out=[];
  for(const r of rows||[]){let env=null;try{env=JSON.parse(r.value_json);}catch{continue;}
    if(!env||env.schema!==KNOWLEDGE_SCHEMA)continue;
    out.push({id:r.id,version:r.version,entity_key:r.entity_key,entity_type:r.entity_type,concept:r.attribute,market:r.market,member_key:r.member_key,envelope:env});}
  return out;
}
export function knowledgeEntityForms(value){
  const t=knowledgeText(value);if(!t)return [];
  const forms=new Set([t]);
  const stripped=t.replace(/^(?:جعبه|باکس|پک|علبه|علبة)\s+(?:ی\s+)?/u,"").replace(/\s+(?:box|case)$/u,"").trim();
  if(stripped)forms.add(stripped);
  return [...forms];
}
// Products are matched only on exact (normalized) name or an owner-taught alias. Partial overlap is reported, never applied.
export function resolveKnowledgeEntities(records,candidates){
  const candidateForms=new Set((candidates||[]).filter(Boolean).flatMap(knowledgeEntityForms));
  const keys=[...new Set(records.map(r=>r.entity_key).filter(k=>knowledgeText(k)&&knowledgeText(k)!=="global"))];
  const matched=new Set(),partial=new Set();
  for(const key of keys)if(knowledgeEntityForms(key).some(f=>candidateForms.has(f)))matched.add(key);
  for(const r of records)if(ALIAS_CONCEPTS.has(r.concept)&&typeof r.envelope.value==="string"&&knowledgeEntityForms(r.envelope.value).some(f=>candidateForms.has(f)))matched.add(r.entity_key);
  const tokens=new Set([...candidateForms].flatMap(f=>f.split(" ")).filter(w=>w.length>=3));
  for(const key of keys)if(!matched.has(key)&&knowledgeEntityForms(key).some(f=>f.split(" ").some(w=>tokens.has(w))))partial.add(key);
  const ambiguous=matched.size>1;
  return {matched:ambiguous?[]:[...matched],ambiguous,ambiguous_keys:ambiguous?[...matched]:[],partial:[...partial]};
}
const inScope=(r,entities)=>{const k=knowledgeText(r.entity_key);return k==="global"||(entities||[]).some(e=>knowledgeText(e)===k);};
export function knowledgeVocabulary(records){
  const entries=[];
  for(const r of records){const e=r.envelope;
    if(e.relation){for(const [field,val] of Object.entries(e.relation.members))if(typeof val==="string")entries.push({field,value:val});}
    else if(e.multi&&typeof e.value==="string")entries.push({field:e.context_field||r.concept,value:e.value});}
  return entries;
}
// Data-driven entity recognition: a value the owner taught (e.g. a color or ribbon) found in the customer's words fills its field.
export function recognizeKnowledgeContext(texts,vocabulary){
  const ctx={},byValue=new Map();
  for(const e of vocabulary){const k=knowledgeText(e.value);if(k.length<2)continue;(byValue.get(k)||byValue.set(k,{display:e.value,fields:new Set()}).get(k)).fields.add(e.field);}
  for(const text of texts||[]){const t=knowledgeText(text);
    for(const [k,info] of byValue)if(info.fields.size===1&&hasPhrase(t,k))ctx[[...info.fields][0]]=info.display;}
  return ctx;
}
function eqValue(actual,expected){
  const e=knowledgeText(expected);
  if(Array.isArray(actual))return actual.some(a=>knowledgeText(a)===e);
  return knowledgeText(actual)===e;
}
function evalCondition(c,ctx){
  const actual=ctx[c.field];
  const present=actual!==undefined&&actual!==null&&actual!==""&&!(Array.isArray(actual)&&!actual.length);
  if(c.op==="exists")return present?"satisfied":"unsatisfied";
  if(!present)return "unknown";
  switch(c.op){
    case "=":return eqValue(actual,c.value)?"satisfied":"unsatisfied";
    case "!=":return eqValue(actual,c.value)?"unsatisfied":"satisfied";
    case ">":case ">=":case "<":case "<=":{
      const a=num(Array.isArray(actual)?actual[0]:actual),b=num(c.value);if(!Number.isFinite(a)||!Number.isFinite(b))return "unknown";
      return (c.op===">"?a>b:c.op===">="?a>=b:c.op==="<"?a<b:a<=b)?"satisfied":"unsatisfied";}
    case "contains":{const v=knowledgeText(c.value);
      if(Array.isArray(actual))return actual.some(a=>knowledgeText(a)===v)?"satisfied":"unsatisfied";
      const t=knowledgeText(actual);return (hasPhrase(t,c.value)||t.includes(v))?"satisfied":"unsatisfied";}
    case "in":return c.value.some(v=>eqValue(actual,v))?"satisfied":"unsatisfied";
    case "not_in":return c.value.some(v=>eqValue(actual,v))?"unsatisfied":"satisfied";
  }
  return "unknown";
}
const summarize=r=>({id:r.id,version:r.version,concept:r.concept,kind:r.envelope.kind,entity:r.entity_key,market:r.market,priority:r.envelope.priority,conditions:r.envelope.conditions,effect:r.envelope.effect||null,value:r.envelope.value??null,commercial:knowledgeIsCommercial(r.concept,r.envelope)});
// Bounded, deterministic evaluation of approved rules against the current context. Returns knowledge — never permission.
export function evaluateKnowledgeRules(records,ctx,{entities=[]}={}){
  const applicable=[],unresolved=[];
  for(const r of records){
    const e=r.envelope;
    if(e.relation)continue;
    if(!(e.conditions.length||e.effect||["rule","constraint","prohibition"].includes(e.kind)))continue;
    if(!inScope(r,entities))continue;
    let unknown=[],failed=false;
    for(const c of e.conditions){const s=evalCondition(c,ctx);if(s==="unsatisfied"){failed=true;break;}if(s==="unknown")unknown.push(c.field);}
    if(failed)continue;
    if(unknown.length)unresolved.push({...summarize(r),missing:[...new Set(unknown)]});else applicable.push(summarize(r));
  }
  const specific=x=>Number(knowledgeText(x.entity)!=="global");
  applicable.sort((a,b)=>b.priority-a.priority||b.conditions.length-a.conditions.length||specific(b)-specific(a));
  // Two applicable rules that set the same effect key differently at the same priority are a conflict → owner decides.
  const conflicts=[],winners={};
  for(const rule of applicable)for(const [k,v] of Object.entries(rule.effect||{})){
    const prev=winners[k];
    if(!prev){winners[k]={value:v,rule};continue;}
    if(prev.rule.priority===rule.priority&&prev.value!==v)conflicts.push({effect:k,rules:[prev.rule.id,rule.id],values:[prev.value,v]});
  }
  const effects=Object.fromEntries(Object.entries(winners).map(([k,x])=>[k,{value:x.value,rule:x.rule.id}]));
  return {applicable,unresolved,conflicts,effects};
}
export function checkKnowledgeRelations(records,ctx,{entities=[],current=null}={}){
  const rels=records.filter(r=>r.envelope.relation&&inScope(r,entities));
  const matches=[],groups=new Map();
  for(const r of rels){
    const rel=r.envelope.relation,fields=Object.keys(rel.members).sort(),sig=r.entity_key+"|"+rel.name+"|"+fields.join(",");
    (groups.get(sig)||groups.set(sig,{fields,records:[]}).get(sig)).records.push(r);
    if(!fields.every(f=>ctx[f]!==undefined&&ctx[f]!==null))continue;
    if(rel.only_with?.length){
      // "X only with Y": the anchor members match, the restricted members must equal the stated ones.
      const anchors=fields.filter(f=>!rel.only_with.includes(f));
      if(anchors.every(f=>eqValue(ctx[f],rel.members[f]))){
        const ok=rel.only_with.every(f=>eqValue(ctx[f],rel.members[f]));
        matches.push({id:r.id,concept:r.concept,relation:rel.name,members:Object.fromEntries(fields.map(f=>[f,ctx[f]])),allowed:ok&&r.envelope.value!==false,exclusive:true});
      }
      continue;
    }
    if(fields.every(f=>eqValue(ctx[f],rel.members[f])))matches.push({id:r.id,concept:r.concept,relation:rel.name,members:{...rel.members},allowed:r.envelope.value!==false,exclusive:false});
  }
  const unknown=[];
  for(const [sig,g] of groups){
    if(!g.fields.every(f=>ctx[f]!==undefined&&ctx[f]!==null))continue;
    if(current&&!g.fields.some(f=>current[f]!==undefined))continue;
    if(!matches.some(m=>g.records.some(r=>r.id===m.id)))unknown.push({relation:sig,fields:g.fields});
  }
  const conflict=matches.some(a=>matches.some(b=>a.members&&b.members&&JSON.stringify(a.members)===JSON.stringify(b.members)&&a.allowed!==b.allowed));
  return {matches,unknown,conflict};
}
const QUESTION=/[?؟]|(?:^|\s)(?:چه|چی|چند|کدام|کدوم|آیا|هست|هستند|دارید|دارین|دارد|میشه|می شه|می شود|ممکنه|امکان|موجود|شنو|شنهو|اکو|هل|کم|ممکن|یوجد|متوفر|what|which|how|do you|can|is there|are there|available)(?:\s|$)/u;
export function knowledgeLooksLikeQuestion(text){return QUESTION.test(knowledgeText(text));}
// Which approved, NON-commercial fact groups does the customer's question touch? (owner keywords/labels/concept words)
export function matchKnowledgeQuestion(message,records,{entities=[]}={}){
  const text=knowledgeText(message);
  if(!knowledgeLooksLikeQuestion(message))return [];
  const groups=new Map();
  for(const r of records){
    const e=r.envelope;
    if(e.relation||e.conditions.length||e.effect||!["fact","capability","availability"].includes(e.kind)||ALIAS_CONCEPTS.has(r.concept))continue;
    if(knowledgeIsCommercial(r.concept,e)||!inScope(r,entities))continue;
    const words=[...e.keywords,...Object.values(e.labels),...r.concept.split("_").filter(w=>w.length>=3)];
    const hits=words.filter(w=>hasPhrase(text,w)).length;if(!hits)continue;
    const key=knowledgeText(r.entity_key)+"|"+r.concept,g=groups.get(key)||groups.set(key,{key,entity:r.entity_key,concept:r.concept,records:[],score:0}).get(key);
    g.records.push(r);g.score=Math.max(g.score,hits);
  }
  const specific=g=>Number(knowledgeText(g.entity)!=="global");
  return [...groups.values()].sort((a,b)=>b.score-a.score||specific(b)-specific(a)).slice(0,2);
}
const langKey=language=>language==="Iraqi Arabic"?"ar":"fa";
export function composeKnowledgeAnswer(group,language){
  const lang=langKey(language),labels=group.records[0].envelope.labels||{};
  const label=labels[lang]||labels.fa||labels.ar||labels.en||group.concept.replace(/_/g," ");
  const values=[...new Set(group.records.map(r=>r.envelope.value).filter(v=>v!==undefined&&v!==null))];
  if(!values.length)return null;
  if(values.every(v=>typeof v==="boolean")){const yes=values.every(Boolean);return lang==="ar"?`${label}: ${yes?"نعم":"لا"}.`:`${label}: ${yes?"بله":"خیر"}.`;}
  return `${label}: ${values.join("، ")}.`;
}
export function composeRelationAnswer(match,language){
  const vals=Object.values(match.members).join(" + ");
  if(langKey(language)==="ar")return match.allowed?`التركيب ${vals} معتمد.`:`التركيب ${vals} غير مسموح.`;
  return match.allowed?`ترکیب ${vals} تأیید شده است.`:`ترکیب ${vals} مجاز نیست.`;
}
// Validator evidence: approved VALUES only (never effects), so no rule can ever "prove" a commercial claim to a customer.
export function knowledgeEvidenceValue(r){
  const e=r.envelope;
  return {value:e.value??null,relation:e.relation?e.relation.members:null};
}
