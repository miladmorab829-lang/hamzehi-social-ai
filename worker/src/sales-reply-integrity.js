// Typed product specifications and exact response parts. Neither helper authorizes prices or payments.
export const replyKey=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[۰-۹٠-٩]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.includes(d)?'۰۱۲۳۴۵۶۷۸۹'.indexOf(d):'٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\s\u200c]+/g,' ').trim();
export const dimensionKey=value=>replyKey(value).replace(/٫/g,'.').replace(/\s*(?:x|×|در)\s*/g,'x');
export function typedSpecifications(text){
 const dimensions=[],components=[];let invalid=false;
 let scalar=String(text).replace(/[0-9۰-۹٠-٩]+(?:[.٫][0-9۰-۹٠-٩]+)?(?:\s*[x×]\s*[0-9۰-۹٠-٩]+(?:[.٫][0-9۰-۹٠-٩]+)?){1,2}/giu,(value,offset,whole)=>{
  const before=whole.slice(Math.max(0,offset-28),offset),after=whole.slice(offset+value.length,offset+value.length+22);
  if(/(?:قیمت|سعر|حداقل(?: سفارش)?|minimum|price)\s*[:：]?\s*$/iu.test(before)||/^\s*(?:تومان|ریال|دلار|دولار|عدد|درصد|٪|%|روز|هفته|ماه|days?|weeks?|usd|pieces)(?=$|[^\p{L}])/iu.test(after)){invalid=true;return value;}
  dimensions.push(dimensionKey(value));return ' ';
 });
 scalar=scalar.replace(/[0-9۰-۹٠-٩]+\s*(?:تکه|تیکه|قطعه|قطع)(?=$|[^\p{L}])/gu,(value,offset,whole)=>{
  const before=whole.slice(Math.max(0,offset-35),offset);
  if(/(?:حداقل(?: سفارش| تعداد)?|تعداد|کمیت|كمية|minimum(?: order)?|moq)(?:\s+(?:ما|این مدل|برای این مدل|our|لهذا الموديل))?\s*[:：]?\s*$/iu.test(before))return value;
  components.push(replyKey(value));return ' ';
 });
 return {scalar,dimensions,components,invalid};
}
export function validateReplyParts(text,parts,validate,options){
 let prose=String(text);
 for(const part of parts||[]){
  if(!part.text||prose.split(part.text).length!==2)return {valid:false,reason:'reply_part_mismatch'};
  const checked=validate(part.text,{...options,catalog:part.kind==='catalog'?[]:options.catalog,authoritativeFacts:part.facts||[]});
  if(!checked.valid)return checked;
  prose=prose.replace(part.text,' . ');
 }
 return validate(prose,options);
}
const modelKey=value=>replyKey(value).replace(/تیکه/g,'تکه');
// Validate relational catalog claims before generic word/number evidence. A size or model belonging to another product is not proof.
export function catalogClaimIssue(text,catalog=[],selectedKey=null){
 if(!catalog.length)return null;
 const names=catalog.filter(c=>c.product&&c.variants?.length),allModels=[...new Set(names.flatMap(c=>c.variants.map(v=>modelKey(v.configuration))))];
 for(const sentence of String(text).split(/[،؛]|(?<![0-9۰-۹٠-٩])[.!؟?]|[.!؟?](?![0-9۰-۹٠-٩])/u)){
  const s=modelKey(sentence);if(!s.trim())continue;
  const anchors=[];
  for(const c of names){const name=modelKey(c.product);let from=0,at;while((at=s.indexOf(name,from))>=0){from=at+name.length;if((at===0||!/[\p{L}\p{N}]/u.test(s[at-1]))&&(from===s.length||!/[\p{L}\p{N}]/u.test(s[from])))anchors.push({at,end:from,c});}}
  const chosen=anchors.filter(a=>!anchors.some(b=>b!==a&&b.at<=a.at&&b.end>=a.end&&(b.end-b.at>a.end-a.at))).sort((a,b)=>a.at-b.at);
  if(!chosen.length){if(/^(?:اگه|اگر|اگ|لو|إذا|if)(?=$|\s)/iu.test(s.trim()))continue;const c=names.find(c=>c.key===selectedKey);if(c)chosen.push({at:0,end:0,c});}
  for(let n=0;n<chosen.length;n++){
   const a=chosen[n],end=chosen[n+1]?.at??s.length;
   let start=n===0?0:a.at;
   // A bullet or parenthetical product clause with ITS OWN model list does not inherit the preceding list's last model.
   // Retain preposed dimensions ("12x12 for small ring") and clauses without their own model list for tuple validation.
   if(n===0){const boundary=Math.max(s.lastIndexOf('•',a.at),s.lastIndexOf('(',a.at)),tail=s.slice(a.end,end),prefix=s.slice(0,boundary);
    const list=allModels.slice().sort((a,b)=>b.length-a.length).reduce((p,m)=>({text:p.text.replaceAll(m,' '),count:p.count+Number(p.text.includes(m))}),{text:prefix,count:0});
    const bare=list.text.split(/\s+/u).filter(w=>!['و','یا','او','أو','and','or'].includes(w)).join('').replace(/[،:;\[\]]/gu,'');
    if(boundary>=0&&list.count>1&&!bare&&allModels.some(m=>tail.includes(m)))start=boundary;
   }
   const part=s.slice(start,end),spec=typedSpecifications(part),dims=spec.dimensions;
   let variants=a.c.variants;
   if(dims.length){if(!dims.every(d=>variants.some(v=>dimensionKey(v.size)===d)))return 'catalog_size_mismatch';variants=variants.filter(v=>dims.includes(dimensionKey(v.size)));}
   const spans=[...part.matchAll(/\d+\s*تکه(?:\s+کج)?/gu)].map(m=>({at:m.index,end:m.index+m[0].length,value:m[0]}));
   for(const model of allModels){let from=0,at;while((at=part.indexOf(model,from))>=0){from=at+model.length;spans.push({at,end:from,value:model});}}
   const models=[...new Set(spans.filter(a=>!spans.some(b=>b.at<=a.at&&b.end>=a.end&&b.end-b.at>a.end-a.at)).map(a=>a.value))];
   if(models.some(m=>!variants.some(v=>modelKey(v.configuration)===m)))return 'catalog_configuration_mismatch';
   const explicitProduct=anchors.some(x=>x.c.key===a.c.key);
   if((explicitProduct||dims.length||models.length)&&/(?:ندار|موجود نیست|موجود ندار|متوفر نیست|مو متوفر|غير متوفر)/u.test(part))return 'catalog_negative_unverified';
   const escapedModels=models.map(m=>m.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
   if(escapedModels.some(m=>new RegExp(m+'\\s+(?:نیست|نیستن|نیستند)(?=$|[^\\p{L}])','u').test(part)))return 'catalog_negative_unverified';
  }
 }
 return null;
}
// Absence in a complete active-price catalog is not physical inventory or a manufacturing prohibition.
export function catalogVariantAnswer({catalog,key,size,structure,message,language}){
 const entry=(catalog||[]).find(c=>c.key===key);if(!entry?.complete||!size)return null;
 const rows=(entry.variants||[]).filter(v=>dimensionKey(v.size)===dimensionKey(size));if(!rows.length)return null;
 const all=[...new Set(catalog.flatMap(c=>(c.variants||[]).map(v=>v.configuration)))];
 let query=structure;
 if(!query){
  const said=' '+replyKey(message)+' ',hits=all.filter(c=>said.includes(' '+replyKey(c)+' ')).sort((a,b)=>b.length-a.length);
  const distinct=hits.filter(h=>!hits.some(other=>other!==h&&replyKey(other).includes(replyKey(h))));if(distinct.length>1)return null;
  query=distinct[0];
  if(!query){const families=[...new Set(all.map(c=>replyKey(c).split(' ')[0]).filter(w=>/^\p{L}{3,}$/u.test(w)))];const hit=families.filter(f=>said.includes(' '+f+' '));if(hit.length===1)query=hit[0];}
 }
 if(!query)return null;
 const q=replyKey(query),matches=v=>replyKey(v.configuration)===q||(!q.includes(' ')&&replyKey(v.configuration).startsWith(q+' '));
 if(rows.some(matches))return null;
 // The requested configuration must be a known catalog term, not arbitrary model prose.
 if(!all.some(c=>matches({configuration:c})))return null;
 const models=[...new Set(rows.map(v=>v.configuration))],ar=language==='Iraqi Arabic';
 const text=ar?`موديل ${query} لعلبة ${entry.product} بقياس ${size} مو مسجل بالقائمة الحالية؛ الموديلات المسجلة لهالقياس: ${models.join('، ')}.`:`مدل ${query} برای ${entry.product} سایز ${size} در فهرست فعلی ثبت نشده؛ مدل‌های ثبت‌شدهٔ این سایز: ${models.join('، ')}.`;
 return {text,market:entry.market,product:key,size,query,variants:rows.map(v=>({size:v.size,configuration:v.configuration})),facts:[{category:'availability',market:entry.market,values:[entry.product,...models,query]},{category:'size',market:entry.market,values:[size]}]};
}
