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

// Typed fields that differ from their siblings ONLY by a role the owner has to name (exterior vs interior, the color of what…).
// A typed claim for one of them is trusted only when the owner's own words (`words`) name that role; otherwise the statement
// stays a generic fact whose concept is the owner's own collection name — or, if the model gave none, the neutral name below.
// `role` is the token that marks the guessed role inside a concept/context name. Data, not logic: another role-only typed
// field is one more entry here.
const TYPED_ROLE_FIELDS={
  "color.exterior":{role:"exterior",neutral:"color_options",words:["بیرون","خارج","exterior","outer","outside","external"]},
  "color.interior":{role:"interior",neutral:"color_options",words:["داخل","درون","interior","inner","inside","internal"]},
  "color.combination":{role:"combination",neutral:"color_options",words:["ترکیب","مزیج","combination","combo","combined"]},
  "color.restriction":{role:"restriction",neutral:"color_options",words:["محدود","ممنوع","منع","حظر","قید","restrict","forbid","prohibit","banned"]},
  "printing.color":{role:"printing",neutral:"color_options",words:["چاپ","فویل","طباعة","printing","print","foil","stamp"]}
};
const TYPED_ROLE_PATTERNS=Object.fromEntries(Object.entries(TYPED_ROLE_FIELDS).map(([key,spec])=>[key,new RegExp("(?<![\\p{L}\\p{N}])(?:ال)?(?:"+spec.words.map(escapeRegex).join("|")+")","u")]));
export function knowledgeTypedRoleNamed(typedKey,text){const pattern=TYPED_ROLE_PATTERNS[typedKey];return !pattern||pattern.test(knowledgeText(text));}
// The role word names the slot, it is not part of the value: "بیرونی مشکی" → "مشکی".
export function knowledgeWithoutRoleWords(value,typedKey){
  const pattern=TYPED_ROLE_PATTERNS[typedKey];
  if(!pattern||typeof value!=="string")return value;
  return value.normalize("NFKC").split(/\s+/).filter(w=>w&&!pattern.test(knowledgeText(w))).join(" ").trim();
}
// The extraction prompt only offers role-only typed fields the owner actually named, so nothing pulls the model toward a role nobody said.
export function knowledgeTypedCatalog(typedFields,text){return (typedFields||[]).filter(f=>knowledgeTypedRoleNamed(String(f).split(/\s/)[0],text));}

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
const listItemsOf=s=>String(s||"").split(/[،,؛;\n]+/u).map(x=>x.trim()).filter(Boolean);
// The items of a "<name>: A، B، C" statement (short values, no sentences), or null when the text is not a named list.
function collectionItems(text){
  const t=String(text||"").normalize("NFKC").trim();
  if(t.length<8||t.length>KNOWLEDGE_LIMITS.text)return null;
  const m=t.match(/^([^:：\n]{2,120})[:：]\s*([\s\S]+)$/u);
  if(!m)return null;
  const items=listItemsOf(m[2]);
  return items.length>=2&&items.length<=KNOWLEDGE_LIMITS.fanout&&items.every(x=>x.length<=60&&x.split(/\s+/).length<=4&&!/[!؟?]|\.(?:\s|$)/u.test(x))?items:null;
}
function ambiguityText(a){
  const s=typeof a==="string"?a:a&&typeof a==="object"?String(a.note??a.reason??a.question??a.about??""):"";
  return cleanString(s,200);
}
// A list of values counts each value once (case/Persian-form insensitive); the owner never gets two proposals for one member.
function uniqueValues(list){
  const seen=new Set();
  return list.filter(v=>{const k=typeof v==="string"?knowledgeText(v):JSON.stringify(v);if(seen.has(k))return false;seen.add(k);return true;});
}
function normalizeOne(source,defaultMarket,text=""){
  let raw=source;
  const issues=[];
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return [{operation:"ADD",issues:["record_invalid"],notes:[],kind:"fact",entity_type:"business",entity_key:"unresolved",concept:"needs_clarification",market:defaultMarket,envelope:null,typed:null,confidence:null}];
  const operationRaw=String(raw.operation||"ADD").toUpperCase();let operation=KNOWLEDGE_OPERATIONS.has(operationRaw)?operationRaw:null;
  if(!operation)issues.push("invalid_operation");
  // Doubts the model voiced are kept apart from structural problems: normalizeKnowledgeInput decides whether a doubt blocks (see settleDoubts).
  const doubts=(Array.isArray(raw.ambiguities)?raw.ambiguities:[]).slice(0,5).map(ambiguityText).filter(Boolean);
  const notes=[];
  const entityRaw=raw.entity&&typeof raw.entity==="object"?raw.entity:{};
  let entityKey=cleanString(entityRaw.key??raw.entity_key??"",120)||"";const lowered=knowledgeText(entityKey);
  let entityType=["product","model","business"].includes(entityRaw.type)?entityRaw.type:null;
  if(["global","all","business","همه","کل"].includes(lowered)||(!entityKey&&entityType==="business")){entityKey="global";entityType="business";}
  else if(!entityKey)issues.push("entity_missing");
  else if(!entityType||entityType==="business")entityType="product";
  let market=null;
  if(raw.market!==null&&raw.market!==undefined&&raw.market!==""){market=String(raw.market).toUpperCase();if(!KNOWLEDGE_MARKETS.has(market)){issues.push("invalid_market");market=null;}}
  let typed=raw.typed&&typeof raw.typed==="object"?{domain:knowledgeIdent(raw.typed.domain,40),attribute:knowledgeIdent(raw.typed.attribute,40)}:null;
  // ROLE SCOPING: a typed field that stands for a role (exterior / interior / …) is trusted only when the owner's own words name
  // that role. Otherwise the model guessed one: the statement stays a generic fact under the owner's own collection name — the
  // role is never forced, and a concept/context that still carries the guessed role is replaced by a neutral generic name.
  const roleSpec=typed&&typed.domain&&typed.attribute?TYPED_ROLE_FIELDS[typed.domain+"."+typed.attribute]:null;
  if(roleSpec&&text&&!knowledgeTypedRoleNamed(typed.domain+"."+typed.attribute,text)){
    const carriesRole=v=>(knowledgeIdent(v,60)||"").split("_").includes(roleSpec.role),named=knowledgeIdent(raw.concept,60),concept=named&&!carriesRole(named)?named:roleSpec.neutral;
    raw={...raw,concept,kind:["fact","capability","availability"].includes(String(raw.kind||"").toLowerCase())?raw.kind:"fact"};
    if(raw.context_field&&carriesRole(raw.context_field))raw.context_field=roleSpec.neutral.replace(/_options$/,"");
    notes.push("scope_not_named: "+typed.domain+"."+typed.attribute+" was not named by the owner, so this is stored as the generic collection "+concept);
    typed=null;
  }
  // The model sometimes returns a whole list as ONE string ("A، B، C"). Only when that string is exactly the list the owner wrote
  // after the colon of a named list does it become the collection's values, one per item; any other text is never split.
  if(!typed&&typeof raw.value==="string"&&text&&["fact","capability","availability"].includes(String(raw.kind||"").toLowerCase())){
    const owned=collectionItems(text),parts=listItemsOf(raw.value);
    if(owned&&parts.length>=2&&parts.length===owned.length&&parts.every(x=>owned.some(y=>knowledgeText(y)===knowledgeText(x))))raw={...raw,value:parts};
  }
  const confidence=typeof raw.confidence==="number"&&raw.confidence>=0&&raw.confidence<=1?raw.confidence:null;
  const base={operation:operation||"ADD",entity_type:entityType||"business",entity_key:entityKey||"unresolved",market:market||defaultMarket,confidence,issues:[...issues],notes:[...notes]};
  const mark=r=>({...r,issues:[...base.issues],notes:[...base.notes],ambiguities:[...doubts]});
  if(typed){
    if(!typed.domain||!typed.attribute)base.issues.push("typed_field_invalid");
    let values=uniqueValues(Array.isArray(raw.value)?raw.value:[raw.value]);
    if(Array.isArray(raw.value)&&!raw.value.length){base.issues.push("value_missing");values=[undefined];}
    if(values.length>KNOWLEDGE_LIMITS.fanout)base.issues.push("too_many_values");
    return values.slice(0,KNOWLEDGE_LIMITS.fanout).map(v=>mark({...base,kind:"fact",concept:typed.attribute||"needs_clarification",typed,value:v,envelope:null}));
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
  const emit=(core,extra={})=>{const r=mark({...base,kind,concept:concept||"needs_clarification",typed:null,envelope:core});Object.assign(r,extra);records.push(r);};
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
  // A COLLECTION FACT: one concept holding several approved values. One member record per distinct value (so a single member can
  // later be changed or deactivated); an empty list falls through and fails as value_invalid instead of vanishing.
  if(Array.isArray(raw.value)&&raw.value.length&&["fact","capability","availability"].includes(kind)){
    const values=uniqueValues(raw.value);
    if(values.length>KNOWLEDGE_LIMITS.fanout)base.issues.push("too_many_values");
    for(const v of values.slice(0,KNOWLEDGE_LIMITS.fanout)){const issuesLocal=[],core=buildEnvelopeCore({...rawCore,value:v,multi:true},issuesLocal);emit(core);records[records.length-1].issues.push(...issuesLocal);}
    return records;
  }
  const core=buildEnvelopeCore(rawCore,probeIssues);emit(core);records[0].issues.push(...probeIssues);
  return records;
}
// ---- relation guards (fail-closed): a statement that links two values must never become a plain value/fact ----
// A single value that still contains the link ("مشکی فقط با روبان طلایی", "black only with gold ribbon") is a collapsed relation.
const RELATIONAL_VALUE=/(?:فقط\s*(?:با|برای|روی)|\bonly\s+(?:with|for|on)\b|\s(?:با|روی)\s+.+\s(?:مجاز|ممنوع)(?:\s|$)|\b(?:incompatible\s+with|forbidden\s+with|allowed\s+with|requires)\b)/iu;
// The owner's sentence itself reads as "A <link> B <allowed|forbidden|exclusive>".
const RELATIONAL_STATEMENT=/(?:فقط\s*(?:با|برای|روی)|(?:با|روی)\s+\S+(?:\s+\S+){0,3}\s+(?:مجاز|ممنوع|قابل\s*استفاده|سازگار|ناسازگار)|ترکیب\s*(?:می[‌\s]?شود|شود)|\bonly\s+(?:with|for|on)\b|\bincompatible\b|\brequires?\b|\bsupports?\b)/iu;
export function knowledgeValueLooksRelational(value){return typeof value==="string"&&RELATIONAL_VALUE.test(knowledgeText(value))||typeof value==="string"&&RELATIONAL_VALUE.test(value);}
export function knowledgeStatementLooksRelational(text){return RELATIONAL_STATEMENT.test(String(text||"").normalize("NFKC"));}
// Marks records that collapsed a relation. The owner CORRECTs them into a real relation; they are never approvable as-is.
export function applyRelationalGuards(records,text){
  const list=records||[];
  for(const r of list){
    const v=r.typed?r.value:r.envelope?.value;
    if(knowledgeValueLooksRelational(v))r.issues.push("value_contains_relational_clause: express it as a relation between two values");
  }
  if(text&&knowledgeStatementLooksRelational(text)&&list.length&&!list.some(r=>r.envelope?.relation||["rule","constraint","prohibition"].includes(r.kind)&&!r.typed)){
    for(const r of list)if(r.typed||["fact","capability","availability"].includes(r.kind))r.issues.push("relational_statement_without_relation: the statement links two values but no relation was extracted");
  }
  for(const r of list)r.issues=[...new Set(r.issues)];
  return list;
}
// The model may voice doubts ("ambiguities"). A doubt blocks the proposal when the engine cannot check the structure itself. For a
// plain, NON-commercial collection/fact whose entity, concept and value(s) are all present, the owner reviews exactly that
// structure before anything becomes knowledge — so the doubt (typically a refinement the owner never gave) is kept as a visible
// NOTE instead of a "needs clarification" dead end. Relations, rules, constraints, commercial records and anything with a
// missing entity/concept/value keep treating every doubt as blocking.
function settleDoubts(r,typedCommercial){
  const doubts=r.ambiguities||[];delete r.ambiguities;
  if(!doubts.length)return;
  const complete=!r.issues.length&&r.entity_key&&r.entity_key!=="unresolved"&&r.concept&&r.concept!=="needs_clarification";
  const plain=complete&&(r.typed
    ?r.value!==undefined&&r.value!==null&&r.value!==""&&!typedCommercial(r.typed.domain)
    :!!r.envelope&&["fact","capability","availability"].includes(r.kind)&&r.envelope.value!==undefined&&!r.envelope.relation&&!r.envelope.conditions.length&&!r.envelope.effect&&!r.envelope.commercial);
  if(plain)r.notes.push(...doubts.map(d=>"model_note: "+d));
  else r.issues.push(...doubts.map(d=>"ambiguous: "+d));
}
// Several separate single-value facts for the SAME concept of the same product are the members of one collection: a plain value slot
// holds exactly one value, so as competing scalars they could never all be approved. The model is asked for one array; if it split
// the list anyway, the members are recognised here (a lone value stays an ordinary scalar fact).
function foldCollectionMembers(records){
  const groups=new Map();
  for(const r of records){
    const e=r.envelope;
    if(!e||r.typed||r.operation!=="ADD"||r.issues.length||!["fact","capability","availability"].includes(r.kind)||e.multi||e.relation||e.effect||e.conditions.length||e.value===undefined||typeof e.value==="boolean")continue;
    const key=[r.entity_key,r.concept,r.market,r.kind].join("|");
    (groups.get(key)||groups.set(key,[]).get(key)).push(r);
  }
  for(const list of groups.values()){
    if(list.length<2||new Set(list.map(r=>knowledgeText(r.envelope.value))).size<2)continue;
    for(const r of list){r.envelope.multi=true;r.notes.push("collection_members: "+list.length+" values of the same concept are stored as one collection");}
  }
}
// ADDING a value ("add A to <collection>", "<collection> also has A") makes it one more MEMBER of that collection — never the
// single-value slot of the whole concept, which a second added value could only conflict with.
function joinCollection(r){
  const e=r.envelope;
  if(!e||r.typed||r.issues.length||e.multi||!["fact","capability","availability"].includes(r.kind)||e.value===undefined||e.value===null||typeof e.value==="boolean"||e.relation||e.effect||e.conditions.length||e.commercial)return;
  e.multi=true;
  r.notes.push("collection_member: the added value joins the collection "+r.concept);
}
// additive: the owner's own command says add/expand (decided by the caller from the owner's words, not by the model).
export function normalizeKnowledgeInput(rawRecords,{market="GLOBAL",text="",typedCommercial=()=>true,additive=false}={}){
  const list=Array.isArray(rawRecords)?rawRecords:[];
  if(!list.length)return {records:[],issues:["no_records"]};
  const records=[],source=String(text||"");
  for(const raw of list.slice(0,KNOWLEDGE_LIMITS.records))for(const r of normalizeOne(raw,KNOWLEDGE_MARKETS.has(market)?market:"GLOBAL",source))records.push(r);
  for(const r of records){
    const expanding=!!r.envelope&&r.operation==="EXPAND";
    // generic safety: price-like concept names are rejected; EXPAND is just ADD for generic records
    if(r.envelope&&PRICE_LIKE.test(r.concept))r.issues.push("price_belongs_to_price_list");
    if(r.envelope&&r.operation==="EXPAND")r.operation="ADD";
    if(r.envelope)r.envelope.commercial=knowledgeIsCommercial(r.concept,r.envelope);
    r.notes=r.notes||[];
    settleDoubts(r,typedCommercial);
    if((additive||expanding)&&r.operation==="ADD")joinCollection(r);
    r.issues=[...new Set(r.issues)];r.notes=[...new Set(r.notes)];
  }
  foldCollectionMembers(records);
  return {records,issues:list.length>KNOWLEDGE_LIMITS.records?["too_many_records"]:[]};
}
export function knowledgeExtractionPrompt({text,market,typedFields,knownFields}){
  return [
    "You convert ONE owner statement about the packaging / gift-box business HAMZEHI BOX into structured knowledge records.",
    "Return ONLY a JSON object {\"records\":[...]} (at most 25 records). The statement may be Persian, Arabic or English.",
    "Never invent anything the owner did not say. Absence is not a fact: never turn a missing price/color/option into \"unavailable\".",
    "AMBIGUITIES: add a short string to a record's \"ambiguities\" ONLY when something essential is truly unknown — which product/entity, what the values ARE (the concept), the value(s) themselves, the market, or the operation — instead of guessing it. An optional detail, refinement or role the owner did not mention is NOT an ambiguity: never add one for it.",
    "Record shape:",
    "{\"operation\":\"ADD|UPDATE|REPLACE|DEACTIVATE|DELETE\" (UPDATE/REPLACE when the owner changes, corrects or replaces earlier knowledge; DEACTIVATE/DELETE when removed),",
    " \"kind\":\"fact|rule|relation|constraint|capability|availability|prohibition\",",
    " \"typed\":null or {\"domain\":\"<d>\",\"attribute\":\"<a>\"} ONLY when the statement is ONE plain value for one of the typed fields listed below (a list of values is a COLLECTION: typed null),",
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
    "COLLECTIONS: when the owner lists several approved values under one name (\"<collection name>: A, B, C\" — available sizes, ribbon types, printing options, standard materials, allowed accessories, standard colors, anything), return ONE record: kind \"fact\" (\"availability\" or \"capability\" when the owner says they are available or possible), typed null, concept = snake_case of the owner's OWN collection name (e.g. available_sizes, ribbon_types, printing_options, standard_materials, allowed_accessories, standard_colors), value = an ARRAY holding every value exactly as written, labels = the owner's own collection name, keywords = the words customers use for it. Never split a list into several records, and never treat a plain list as a relation or a rule.",
    "ADDING TO A COLLECTION: when the owner adds value(s) to a list (\"add A to <collection name>\", \"A را به <collection name> اضافه کن\", \"<collection name> هم A دارد\"), return that collection's record with operation ADD and value = an ARRAY of only the added value(s), even for a single value — never the whole list and never UPDATE.",
    "SCOPE: put a role or sub-category (which part, side, layer or purpose the values are for) into the concept ONLY when the owner's text names it — then the concept carries that role. When the owner named none, NEVER choose one, never use a typed field that stands for a role, and never ask which role is meant: the owner's own collection name is already the complete concept.",
    "RELATIONS: if the statement links two or more attribute values — A with B, A only with B, A only for/on B, A requires B, A supports B, A is allowed/forbidden/incompatible with B, A combines with B — it is a RELATION: kind \"relation\", relation.members = ONE entry per side, keyed by the ROLE the owner names for that side (e.g. color, ribbon_color, printing, size, product, model, material, finish, insert, accessory — use the owner's own role words), value = that side's value. NEVER put such a statement in \"typed\", and NEVER copy a clause like \"A only with B\" into a single value.",
    "Semantics: \"A only with / only for / only on B\" → A is the anchor and B's role goes in relation.only_with. Allowed pairs: value true. Forbidden / incompatible pairs: value false. A side that is the product itself may be the entity or a member (use a member when the statement is about the pair, not about one product).",
    "If a side, its role or the meaning of the link is unclear, still return the record but add an \"ambiguities\" entry instead of guessing.",
    "Relation templates (placeholders, not data): {\"kind\":\"relation\",\"concept\":\"allowed_combination\",\"relation\":{\"name\":\"allowed_combination\",\"members\":{\"<roleA>\":\"<A>\",\"<roleB>\":\"<B>\"},\"only_with\":[\"<roleB>\"]},\"value\":true}  and  {\"kind\":\"relation\",\"concept\":\"forbidden_combination\",\"relation\":{\"name\":\"forbidden_combination\",\"members\":{\"<roleA>\":\"<A>\",\"<roleB>\":\"<B>\"}},\"value\":false}",
    (knownFields&&knownFields.length?"Role/field names already used by approved knowledge — REUSE the same name when the role is the same: "+knownFields.join(", "):"No role/field names exist yet."),
    "Typed fields (use typed ONLY for a plain single value of these, never for a list and never for a statement that links two values): "+knowledgeTypedCatalog(typedFields,text).join("; "),
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
// "<collection name>: A، B، C" — a named list of short values is business knowledge by itself; it needs no verb and no sales keyword.
export function knowledgeLooksLikeCollection(text){return !!collectionItems(text);}
// One logical collection = the member proposals that share entity, concept, market and operation. The versioned store keeps one
// row per member (so one member can later be changed or deactivated); the owner is shown — and decides on — the collection as a whole.
export function knowledgeCollections(proposals){
  const groups=new Map();
  for(const p of proposals||[]){
    if(p.attribute==="needs_clarification")continue;
    let e=null;try{e=JSON.parse(p.new_value_json);}catch{continue;}
    const generic=p.domain===KNOWLEDGE_DOMAIN&&e&&e.schema===KNOWLEDGE_SCHEMA;
    if(generic&&(!e.multi||e.value===undefined||e.value===null))continue;
    if(!generic&&(e===null||typeof e==="object"))continue;
    const key=[generic?"g":p.domain,p.entity_key,p.attribute,p.market,p.operation].join("|");
    const g=groups.get(key)||groups.set(key,{generic,entity_key:p.entity_key,entity_type:p.entity_type,domain:p.domain,concept:p.attribute,market:p.market,operation:p.operation,kind:generic?e.kind:"fact",labels:generic?e.labels||{}:{},values:[],proposal_ids:[],statuses:{}}).get(key);
    const value=generic?e.value:e;
    if(g.proposal_ids.includes(p.id))continue;
    g.values.push(value);g.proposal_ids.push(p.id);g.statuses[p.status]=(g.statuses[p.status]||0)+1;
  }
  // a typed member field is only a "collection" once it holds more than one value
  return [...groups.values()].filter(g=>g.generic||g.values.length>1).map(({generic,...g})=>g);
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
  const groups=new Map(),answerable=[];
  for(const r of records){
    const e=r.envelope;
    if(e.relation||e.conditions.length||e.effect||!["fact","capability","availability"].includes(e.kind)||ALIAS_CONCEPTS.has(r.concept))continue;
    if(knowledgeIsCommercial(r.concept,e)||!inScope(r,entities))continue;
    answerable.push(r);
    const words=[...e.keywords,...Object.values(e.labels),...r.concept.split("_").filter(w=>w.length>=3)];
    const hits=words.filter(w=>hasPhrase(text,w)).length;if(!hits)continue;
    const key=knowledgeText(r.entity_key)+"|"+r.concept,g=groups.get(key)||groups.set(key,{key,entity:r.entity_key,concept:r.concept,records:[],score:0}).get(key);
    g.records.push(r);g.score=Math.max(g.score,hits);
  }
  // A matched concept is answered with ALL its approved values for that product: a member added later (taught with other or no
  // keywords) still belongs to the same collection.
  for(const r of answerable){const g=groups.get(knowledgeText(r.entity_key)+"|"+r.concept);if(g&&!g.records.includes(r))g.records.push(r);}
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
