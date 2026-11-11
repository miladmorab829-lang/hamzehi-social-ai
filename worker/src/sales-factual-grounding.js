// Conservative evidence scope for descriptive product claims. No I/O or commercial authority.
import {conversationKey} from './sales-conversation-author.js';
import {typedSpecifications} from './sales-reply-integrity.js';
const normal=value=>conversationKey(value).replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim().split(' ').map(word=>word.length>4&&word.startsWith('ال')?word.slice(2):word).join(' ');
const includes=(text,term)=>(' '+normal(text)+' ').includes(' '+normal(term)+' ');
const entityOf=fact=>fact.entity_key||fact.collection?.split('|')[0]||null;
const modelLike=value=>/کشویی|تکه|تیکه|جرار|قطعتین|قطع|drawer|piece/u.test(normal(value));
export function claimEntities(text,options={}){
 const {facts=[],catalog=[],selectedProductKey=null}=options;
 const models=options._index?.models||[...new Set([...catalog.flatMap(c=>c.models||c.variants?.map(v=>v.configuration)||[]),...facts.map(entityOf).filter(value=>value&&modelLike(value))])];
 const products=options._index?.products||[...new Set([...catalog.map(c=>c.product),...facts.map(entityOf)].filter(value=>value&&normal(value)!=='global'))];
 const specific=list=>list.filter(name=>!list.some(other=>other!==name&&normal(other).length>normal(name).length&&includes(other,name)));
 const found=specific(models.filter(name=>includes(text,name)));
 if(found.length)return found;
 const families=specific(products.filter(name=>includes(text,name)));if(families.length)return families;
 const explicit=normal(text).match(/(?:^|\s)(?:جعبه|مدل|علبه|مودیل)\s+(.+?)(?=\s+(?:از|با|دارای|دارد|داره|ساخته|بسته|باز|موجود|مصنوع|مجهز)|$)/u)?.[1];
 if(explicit&&!/^(?:از|با|دارای|ساخته|بسته|باز)(?:\s|$)/u.test(explicit))return [explicit];
 const selected=catalog.find(c=>c.key===selectedProductKey);return selected?[selected.product]:[];
}
export function factAppliesToEntity(fact,entity,options={}){
 const {catalog=[],facts=[]}=options;
 const own=entityOf(fact),scope=normal(own).replace(/^مدل\s+/u,'');if(own&&scope!=='global')return scope===normal(entity).replace(/^مدل\s+/u,'')||scope==='کشویی'&&normal(entity).startsWith('کشویی ')||fact.category==='availability'&&catalog.some(entry=>normal(entry.product)===scope&&(entry.models||[]).some(model=>normal(model)===normal(entity)))&&(fact.values||[]).some(value=>includes(value,entity));
 // A GLOBAL record that explicitly names a model is not a capability of all other models.
 const names=options._index?.models||[...new Set([...catalog.flatMap(c=>c.models||c.variants?.map(v=>v.configuration)||[]),...facts.map(entityOf).filter(value=>value&&modelLike(value))])];
 let named=options._index?.factModels.get(fact);
 if(!named){named=names.filter(name=>(fact.values||[]).some(value=>includes(value,name)));options._index?.factModels.set(fact,named);}
 return !named.length||named.some(name=>normal(name)===normal(entity));
}
const stop=new Set(('این آن اون همین مدل جعبه علبه برای در از به با و یا روی رو را هم نیز یک که است هست هستند باشد داره دارد داریم دارند داری می شود شده میشود میشه شده میتونید تونید توانید توانیم میتواند میتونه میشه انجام داد دادیم میدیم امکان امکانش پذیر قابلیت قابل ساخته بسته باز جنس بدنه مشتری خودش انتخاب کند میتوانید دارای شامل کنار بخش قسمت های ها ی مثلا مثل فقط علاوه بر بهش بهمون شما میتونیم میزنیم کرد کنید میکنیم کنیم میشه شده هر خودش خودشون مدلهای سایز اندازه ابعاد موجود موجوده متوفر متوفره موجوداست هذا هذه های فی من علی و او مع عندنا عدنا یمکن تگدر تکدر یصیر متاح مصنوع مزود یحتوی یمکنک نطبع نسوی علیها به بیها کدام چه اطلاعات تاییدشده ثبت شده فهرست فعلی دقیق').split(' '));
const risky=/ضد\s*اب|ضداب|اهنربا|مگنت|فوم|ریل|قفل|محافظ|مقاوم|ضربه|نفوذ|مغناطیس|مغناطیسی|اسفنج|حمایه|حمایة|مقاومه|عازل|سکه|سکک|waterproof|magnet\w*|foam|rails?|protect\w*|durab\w*/giu;
const affirmative=/(?<!\p{L})(?:است|هست|هستند|دارد|دارند|داره|داریم|دارای|موجوده|مناسبه|مناسب|تایید\s*شده|می\s*(?:شود|شه|شوند|تونه|تواند|تونیم|زنیم|کنیم)|یمکن|یناسب|ینفتح|تنفتح|یفتح|تفتح|ینغلق|تنغلق|مناسبه|مجهز|مصنوع|مزود|یحتوی|بیها|بیهه|عدنا|متوفر|موجود|has|have|is|are|supports?|fits?|suitable)(?!\p{L})/iu;
const gap=/(?:اطلاعات|توضیح|شرح|جزئیات|مکانیزم|معلومات|تفاصیل).*(?:ندارم|کافی ندار|کامل نیست|کامل ندار|مو واضح|مو کامله|ما عندی|نیست)|ما عندی.{0,30}(?:معلومات|تفاصیل|شرح)|(?:مناسب|قیاس|ابعاد|اندازه).*(?:مشخص|معلوم|روشن|تاییدشده) نیست|(?:مو|ما) متاکد\p{L}*.*(?:قیاس|یناسب)/u;
const uncertainFitFrame=value=>!affirmative.test(value.replace(/(?<!\p{L})(?:یناسب|مناسبه|مناسب)(?!\p{L})/gu,' '))&&(/^(?:مناسب بودن|قیاس|ابعاد|اندازه).*(?:مشخص|معلوم|روشن|تاییدشده) نیست$/u.test(value)||/^(?:(?:بس|بعدنا|هنوز)\s+)*(?:مو|ما) متاکد\p{L}*.*(?:قیاس|یناسب)/u.test(value));
const negativeFeature=value=>/(?:ندارد|ندارن|نداره|نیست|نمی\s*(?:شه|شود|تونه|توان)|ما\s*(?:تگدر|تکدر|یمکن|بیها|عدنا)|مو\s*(?:متوفر|موجود)|لا\s*یمکن)/u.test(normal(value));
function assertionClauses(text){
 return String(text||'').split(/(?<=[.!؟?؛;\n])\s+|[،,]|\s+(?:ولی|اما|لکن|و?لكن(?:ها|ه|هم|هن)?|بس)\s+/u).flatMap(clause=>{
  // Split a coordinated disclaimer/assertion, not ordinary lists of attributes.
  // A knowledge gap never exempts an independently asserted feature beside it.
  const parts=normal(clause).split(/\s+و\s*/u);
  return parts.length>1&&parts.some(part=>gap.test(part))&&parts.some(part=>!gap.test(part)&&(affirmative.test(part)||negativeFeature(part)))?parts:[clause];
 });
}
const epistemicAssertion=value=>value.replace(/((?:اطلاعات|جزئیات|معلومات|تفاصیل))\s+تایید\s*شده/gu,'$1').replace(/(رنگ(?: های)?|رنگهای)\s+موجود/gu,'$1');
export function isExclusiveKnowledgeGap(text){
 const clauses=assertionClauses(text);
 return clauses.length>0&&clauses.every(clause=>{const value=normal(clause);return gap.test(value)&&(!affirmative.test(epistemicAssertion(value))||uncertainFitFrame(value));});
}
const stem=word=>normal(word).replace(/^(?:ال)(?=.{3})/u,'').replace(/(.{3,})(?:هایی|های|شون|تون|تان|ها)$/u,'$1');
for(const word of 'پیشنهاد توصیه ترجیح اولیه میکنم کنم دهم بین وجود تایید مودیل چون بنابراین دلیل همین منظور مدنظر درخواست خواسته نظر ظاهر شیک زیبایی امکانش میتونید داشته باشید بله سلام مثلا طباعة طباعه طلبتها اللي تخص اقتراح اقتراحي انصح انصحک اول من ناحیه حتی اذا لان'.split(' '))stop.add(word);
export function productAssertionIssue(text,{authoritativeFacts=[],catalog=[],selectedProductKey=null,requireEvidence=false}={}){
 const facts=authoritativeFacts,options={facts,catalog,selectedProductKey,_index:{models:[...new Set([...catalog.flatMap(c=>c.models||c.variants?.map(v=>v.configuration)||[]),...facts.map(entityOf).filter(value=>value&&modelLike(value))])],products:[...new Set([...catalog.map(c=>c.product),...facts.map(entityOf)].filter(value=>value&&normal(value)!=='global'))],factModels:new WeakMap()}};let previous=[];
 // Build polarity and scope indexes once per validation. Nothing is cached across
 // turns/customers, and a source that changes gets a new independent validation.
 const eligibleByPolarity=[false,true].map(negative=>facts.filter(fact=>['capability','material','availability','color','size'].includes(fact.category)).map(fact=>({...fact,values:(fact.values||[]).filter(value=>negativeFeature(value)===negative)})));
 for(const clause of assertionClauses(text)){
  const entities=claimEntities(clause,options);if(entities.length)previous=entities;
  const subjects=entities.length?entities:previous;
  const normalized=normal(clause),risk=[...normalized.matchAll(risky)].map(match=>normal(match[0]));
  const assertion=epistemicAssertion(normalized);
  if(gap.test(normalized)&&!affirmative.test(assertion))continue;
  // Presence and absence are different facts. Token overlap with "does not have
  // foam" can never ground "has foam", or the opposite.
  const negative=negativeFeature(normalized);
  const eligible=eligibleByPolarity[Number(negative)];
  for(const term of risk)for(const subject of subjects.length?subjects:[null]){
   if(!eligible.some(fact=>factAppliesToEntity(fact,subject,options)&&(fact.values||[]).some(value=>includes(value,term))))return {valid:false,reason:'unsupported_product_feature',unsupported_values:[term]};
  }
  if(!requireEvidence&&/قیمت|هزینه|تخفیف|بیعانه|پرداخت|حداقل|سعر|کلفه|خصم|عربون|الحد الادنی|\b(?:price|discount|deposit|moq)\b/u.test(normalized))continue;
  // Catalog tuples are already checked relationally, including every claimed size
  // and construction. Do not reinterpret their natural list headings as features.
  if(!requireEvidence&&/موجود|متوفر|داریم|عدنا/u.test(normalized)&&!/(?:چاپ|طبع|جنس|ساخته|مصنوع|بسته|باز|مجهز|مزود|مناسب|یناسب|عطر)/u.test(normalized))continue;
  if(!subjects.length||!affirmative.test(normalized)&&!negative&&!requireEvidence||uncertainFitFrame(normalized)&&!risk.length)continue;
  // Ordinary inventory tuples, colours and sizes keep their existing typed/category
  // validation. Descriptive construction assertions need evidence of their attributes.
  if(!requireEvidence&&!modelLike(subjects.join(' '))&&!/ساخته|جنس|مصنوع|بسته|باز|دارای|مجهز|مزود/u.test(normalized))continue;
  let content=normal(typedSpecifications(clause).scalar);
  for(const subject of subjects)content=content.replaceAll(normal(subject),' ');
  const terms=[...new Set(content.split(' ').map(stem).filter(word=>word.length>=3&&!stop.has(word)&&!/^\d+$/.test(word)))];
  for(const subject of subjects){
   const sources=eligible.filter(fact=>factAppliesToEntity(fact,subject,options));
   const tokens=new Set(sources.flatMap(fact=>(fact.values||[]).flatMap(value=>normal(value).split(' ').map(stem))));
   const missing=terms.filter(term=>!tokens.has(term)&&!stop.has(term));
   if(missing.length)return {valid:false,reason:'unsupported_product_description',unsupported_values:missing.slice(0,8)};
  }
 }
 return {valid:true};
}

// Financial facts cannot be contradicted by free surrounding speech. Outside the
// protected blocks admit neutral introductions or positive source-grounded product
// descriptions only. Unknown speech acts are held, rather than interpreted as consent.
export function protectedContextIssue(prose,{authoritativeFacts=[],catalog=[],selectedProductKey=null,requireProductExplanation=false}={}){
 if(/```|~~~|<\/?(?:s|del|strike|blockquote|code)|^[ \t]*>/imu.test(prose))return {valid:false,reason:'protected_context_markup'};
 const negative=/(?<!\p{L})(?:نه|نیست|نباید|منتفی|خلاف|برعکس|نمی\p{L}*|ندار\p{L}*|بدون|لا|مو|ما|لیس\p{L}*|غیر|not|no|never|ignore|disregard|opposite)(?!\p{L})/u;
 let grounded=false;
 for(const raw of String(prose).split(/[.!؟?؛;\n]+/u).map(value=>value.trim()).filter(Boolean)){
  const text=normal(raw);if(negative.test(text))return {valid:false,reason:'protected_context_negation'};
  if(/^(?:سلام(?: علیکم)?|درود|هلا(?: بیک)?|مرحبا|ممنون(?:م)?|شکرا|در خدمتم)$/u.test(text))continue;
  const introWords=new Set('این اینها اطلاعات مربوط به پرسش سوال سوالتون درخواست شما شماست خدمت جزئیات درخواستی های هاي هذه معلومات تخص استفسارک طلبک طلبك تفاصيل'.split(' '));
  if(text.split(' ').map(stem).every(word=>introWords.has(word)||['است','هست','اینه','هستند','ست'].includes(word)))continue;
  const subjects=claimEntities(raw,{facts:authoritativeFacts,catalog,selectedProductKey});
  const source=authoritativeFacts.some(fact=>['capability','availability','material'].includes(fact.category)&&(!requireProductExplanation||fact.category==='capability')&&subjects.some(subject=>factAppliesToEntity(fact,subject,{facts:authoritativeFacts,catalog}))&&(()=>{
   const tokens=new Set((fact.values||[]).flatMap(value=>normal(value).split(' ').map(stem)));return text.split(' ').filter(word=>word.length>=3&&!stop.has(word)&&tokens.has(stem(word))).length>=(fact.category==='availability'?1:3);
  })());
  if(!subjects.length||!source||!productAssertionIssue(raw,{authoritativeFacts,catalog,selectedProductKey,requireEvidence:true}).valid)return {valid:false,reason:'protected_context_unverified_speech'};
  grounded=true;
 }
 return requireProductExplanation&&!grounded?{valid:false,reason:'service_explanation_missing'}:{valid:true};
}
