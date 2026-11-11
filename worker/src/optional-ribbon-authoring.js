// Presentation evidence only. The approved O11 selector/calculator remain unchanged.
import {protectedReplyProse} from './sales-conversation-author.js';
export function ribbonAuthoringContract(g){
 if(!g?.optional_ribbon_fee||!g.service||!g.price_evidence)throw Error('Approved ribbon evidence required');
 const s=g.service,scale=BigInt(s.minor_unit_scale),unit=BigInt(s.amount_minor),quantity=BigInt(s.quantity),raw=BigInt(s.raw_subtotal_minor);
 if(quantity<=0n||raw!==quantity*unit)throw Error('Ribbon amount evidence mismatch');
 const money=n=>scale===1n?n.toString():`${n/scale}.${(n%scale).toString().padStart(2,'0')}`;
 const ar=g.market==='ARAB',currency=ar?'USD':'تومان',v2=s.discount==='SAME_APPROVED_PRODUCT_QUANTITY_RULE';
 const parts=ar?[
  `طباعة الشريط المخصصة: ${money(unit)} ${currency} لكل علبة.`,
  `المجموع الأولي للخدمة فقط لـ ${quantity} علبة: ${money(raw)} ${currency}.`,
  'هذه الكلفة منفصلة عن السعر الأساسي، وتخص طباعة الشريط المخصصة للجرّارة مع كيس فقط، بطلبك وعلى القياس المسعّر المعتمد.',
  ...(v2?['خصم الخدمة: نفس قاعدة خصم كمية المنتج المعتمدة.','العربون: 50% من مجموع المنتج والخدمة بعد الخصم؛ الشحن منفصل.']:['تأثير الخدمة على الخصم والعربون غير معتمد؛ لا يُعلن مبلغ نهائي للدفع.']),
  'الحساب لمراجعة المالك، وليس إذناً بالدفع.'
 ]:[
  `چاپ سفارشی روبان: ${money(unit)} ${currency} برای هر جعبه.`,
  `جمع خام همین خدمت برای ${quantity} جعبه: ${money(raw)} ${currency}.`,
  'این هزینه جدا از قیمت پایه و فقط برای چاپ سفارشی روبان کشویی بگ‌دار، به درخواست شما و در سایز قیمت‌گذاری‌شدهٔ مصوب است.',
  ...(v2?['تخفیف خدمت: همان قاعدهٔ تخفیف تعدادی مصوب کالا.','بیعانه: ۵۰٪ جمع کالا و خدمت پس از تخفیف؛ حمل جداست.']:['اثر خدمت بر تخفیف و بیعانه تأیید نشده؛ مبلغ نهایی قابل پرداخت اعلام نمی‌شود.']),
  'محاسبه برای بررسی مالک است و مجوز پرداخت نیست.'
 ];
 return {parts,facts:{service:'custom_ribbon_printing',market:g.market,product:g.price_evidence.product_name,
  quantity:s.quantity,unit_minor:s.amount_minor,currency:s.currency,minor_unit_scale:s.minor_unit_scale,
  raw_service_subtotal_minor:s.raw_subtotal_minor,discount:s.discount,deposit:s.deposit,financial_authority:'OWNER_REVIEW_ONLY',
  included_services_evidence:g.text,source_revisions:g.facts.map(f=>({id:f.id,version:f.version}))}};
}
export function maskRibbonAuthoringFacts(text,g){
 const prose=protectedReplyProse(text,ribbonAuthoringContract(g).parts);
 return prose===null?text:prose;
}
