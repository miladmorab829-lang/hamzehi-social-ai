// O11 only: read-only service disclosure and owner preview; never writes a price, order or payment.
import {loadRibbonFinancialPreview} from './optional-ribbon-finance.js';
export const RIBBON_MODEL='کشویی بگ‌دار';
export const RIBBON_SCHEMA='hamzehi.optional-ribbon-fee.v1';
export const RIBBON_FINANCIAL_SCHEMA='hamzehi.optional-ribbon-fee.v2';
const norm=s=>String(s||'').normalize('NFKC').replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[ً-ٰٟ]/g,'').replace(/[‌‍]/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
export const ribbonModelKey=s=>norm(s);
const fields=['schema','service','model','size_scope','activation','amount_minor','currency','minor_unit_scale','basis','discount_effect','deposit_effect','source_ref','policy_version'];
export function validateRibbonFee(v,market){
 if(!v||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).length!==fields.length||Object.keys(v).some(k=>!fields.includes(k)))throw Error('Invalid optional ribbon fields');
 const v1=v.schema===RIBBON_SCHEMA&&v.discount_effect==='UNKNOWN'&&v.deposit_effect==='UNKNOWN'&&v.policy_version===1&&v.source_ref==='PHASE50B-RECOVERY-O11-20261111-v1';
 const v2=v.schema===RIBBON_FINANCIAL_SCHEMA&&v.discount_effect==='SAME_APPROVED_PRODUCT_QUANTITY_RULE'&&v.deposit_effect==='HALF_COMBINED_POST_DISCOUNT'&&v.policy_version===2&&v.source_ref==='PHASE50D-O11-FINANCIAL-v2';
 if(!(v1||v2)||v.service!=='custom_ribbon_printing'||v.model!==RIBBON_MODEL||v.size_scope!=='approved_base_price_sizes'||v.activation!=='explicit_customer_request'||v.basis!=='per_box')throw Error('Invalid O11 scope or authority reference');
 // This is intentionally not a generic service pricing facility. A new rate needs separate approved development.
 if(!(market==='IRAN'&&v.currency==='TOMAN'&&v.minor_unit_scale===1&&v.amount_minor===6000||market==='ARAB'&&v.currency==='USD'&&v.minor_unit_scale===100&&v.amount_minor===30))throw Error('Invalid approved O11 market/rate');
 return true;
}
const FINANCIAL=/پرداخت|بیعانه|پیش پرداخت|تخفیف|ثبت|تایید|تأیید|فاکتور|قیمت نهایی|دفع|عربون|خصم|فاتورة|ثبت|اکد|أکد|استرجاع|refund|payment|discount|deposit/iu;
export function explicitRibbonRequest(message,{allowFinancial=false}={}){
 const s=norm(message);
 // Reject mixed financial/order instructions; the normal owner-controlled path handles them.
 if(!allowFinancial&&FINANCIAL.test(s))return false;
 if(/نمی|نخوا|بدون|نشود|نکن|(?:ما|لا|مو)\s*(?:ارید|أرید|نرید|تطبع)|بلا|without|don't|do not/iu.test(s))return false;
 if(!allowFinancial&&/چیست|چیه|یعنی|بدانم|بدونم|أعرف|اعرف|استفس|ما هی|ما هي|هل|اگر|(?:^|\s)لو(?:\s|$)|\bif\b|\?/iu.test(s))return false;
 return s.split(/[.!؟؛;\n]/u).some(clause=>{
  const surface=/(?:چاپ|طلاکوب|طلا کوب|طباعة|طباعه|اطبع|طبع)(?:\s+(?:سفارشی|لوگو|اسم|الذهبیة|المخصصة|الشعار))*\s+(?:(?:روی|علی)\s+(?:خود\s*|نفس\s*)?)?(?:روبان|نوار ساتن|الشریط|شریط)/u.test(clause)||/(?:روبان|نوار ساتن)\s+را\s+(?:چاپ|طلاکوب)/u.test(clause);
  return surface&&/(?:می خواهم|میخواهیم|می خواهیم|میخوام|می خوام|کنید|بزنید|أرید|ارید|نرید|اطبع|اطلب)/u.test(clause);
 });
}
export const ribbonFinancialMix=message=>FINANCIAL.test(norm(message))&&explicitRibbonRequest(message,{allowFinancial:true});
const effective=(r,at)=>Number(r.active??(r.status==='active'))===1&&(!r.effective_from||Number.isFinite(Date.parse(r.effective_from))&&Date.parse(r.effective_from)<=at)&&(!r.effective_until||Number.isFinite(Date.parse(r.effective_until))&&Date.parse(r.effective_until)>at);
const has=(s,p)=>(' '+s+' ').includes(' '+norm(p)+' ');
function money(n,scale){const x=BigInt(n),k=BigInt(scale);return scale===1?x.toString():`${x/k}.${(x%k).toString().padStart(2,'0')}`;}
export function selectRibbonFee(rows,prices,{market,message,at=Date.now()}){
 if(!['IRAN','ARAB'].includes(market)||!explicitRibbonRequest(message))return null;
 const s=norm(message).replace(/[،,؛;:؟?!]/g,' '),model=norm(RIBBON_MODEL);
 const aliases=[model,'جرارة مع کیس'];
 if(!aliases.some(x=>has(s,x))||/روبان دار|ربان دار|جرارة مع شریط|کشویی کج|جرارة مائلة|تکه|تیکه|قطعتین|ثلاث قطع|مقایسه|مقارنة|یا | او |أو /u.test(s))return null;
 const families=new Set(prices.map(p=>norm(p.product_name.split(' · ')[0])).filter(p=>has(s,p)));
 if(families.size!==1)return null;
 const eligible=prices.filter(p=>p.market===market&&effective(p,at)&&p.currency===(market==='IRAN'?'TOMAN':'USD')&&Number.isSafeInteger(p.unit_price_minor)&&p.unit_price_minor>0&&p.id&&Number.isSafeInteger(p.version)&&p.version>0&&p.approved_by&&Number.isFinite(Date.parse(p.approved_at))&&Date.parse(p.approved_at)<=at).filter(p=>{
  const parts=p.product_name.split(' · ');return parts.length===3&&aliases.includes(norm(parts[2]))&&has(s,parts[0])&&has(s.replace(/×/g,'x'),parts[1].replace(/×/g,'x'));
 });
 if(eligible.length!==1)return null;
 const matches=rows.filter(r=>r.market===market&&r.entity_type==='model'&&norm(r.entity_key)===model&&r.domain==='optional_service'&&r.attribute==='ribbon_printing'&&r.authority==='owner_approved'&&effective(r,at));
 if(matches.length!==1)return null;
 const fact=matches[0];let v;try{v=JSON.parse(fact.value_json);validateRibbonFee(v,market);}catch{return null;}
 const quantities=[...s.matchAll(/(?:^|\s)([1-9][0-9]*)\s*(?:جعبه|علبة|علبه|قطعة|قطعه)(?=\s|$)/gu)].map(m=>m[1]);
 if(quantities.length!==1)return null;
 const quantity=BigInt(quantities[0]),subtotal=quantity*BigInt(v.amount_minor);
 if(quantity>BigInt(Number.MAX_SAFE_INTEGER)||subtotal>BigInt(Number.MAX_SAFE_INTEGER))return null;
 const unit=money(v.amount_minor,v.minor_unit_scale),total=money(subtotal,v.minor_unit_scale),price=eligible[0];
 let text=market==='IRAN'
 ?`فقط برای چاپ سفارشی روی روبان ${v.model}، به درخواست شما: هزینه هر جعبه ${unit} تومان است؛ جمع خام همین خدمت برای ${quantity} جعبه ${total} تومان است. این هزینه جدا از قیمت پایه است. روبان استاندارد، دو دسته ساتن بگ، چاپ چهاررنگ استاندارد بگ و چاپ تک‌رنگ استاندارد مصوب درب داخل قیمت پایه‌اند. اثر این خدمت بر تخفیف و بیعانه هنوز مشخص نیست؛ مبلغ نهایی قابل پرداخت و پیش‌پرداخت قطعی اعلام نمی‌شود.`
 :`فقط للطباعة المخصصة على شريط الجرّارة مع كيس، بطلبك: كلفة كل علبة ${unit} USD؛ المجموع الأولي لهذه الخدمة فقط لـ ${quantity} علبة هو ${total} USD. الكلفة منفصلة عن السعر الأساسي. الشريط القياسي ومقبضا الساتان للكيس والطباعة القياسية بأربعة ألوان للكيس والطباعة القياسية المعتمدة بلون واحد للغطاء ضمن السعر الأساسي. تأثير الخدمة على الخصم والعربون غير محدد؛ لا نحدد مبلغاً نهائياً للدفع أو العربون.`;
 const financial=v.schema===RIBBON_FINANCIAL_SCHEMA;
 if(financial)text=market==='IRAN'?text.replace('اثر این خدمت بر تخفیف و بیعانه هنوز مشخص نیست؛ مبلغ نهایی قابل پرداخت و پیش‌پرداخت قطعی اعلام نمی‌شود.','این خدمت مشمول همان تخفیف تعدادی مصوب کالا است؛ بیعانه برابر ۵۰٪ جمع کالا و خدمت پس از تخفیف است. هزینه حمل جداست. محاسبه مبلغ برای بررسی مالک است و مجوز پرداخت نیست.'):text.replace('تأثير الخدمة على الخصم والعربون غير محدد؛ لا نحدد مبلغاً نهائياً للدفع أو العربون.','تخضع الخدمة لنفس خصم الكمية المعتمد للمنتج؛ العربون 50% من مجموع المنتج والخدمة بعد الخصم. الشحن منفصل. حساب المبلغ لمراجعة المالك وليس إذناً بالدفع.');
 return {kind:'information',optional_ribbon_fee:true,request:{kind:'optional_ribbon_fee',message},market,text,insist:false,facts:[{id:fact.id,version:fact.version,value_json:fact.value_json}],price_evidence:{...price},service:{amount_minor:v.amount_minor,currency:v.currency,minor_unit_scale:v.minor_unit_scale,quantity:quantity.toString(),raw_subtotal_minor:subtotal.toString(),final_payable:financial?'OWNER_REVIEW_REQUIRED':'UNKNOWN',deposit:financial?v.deposit_effect:'UNKNOWN',discount:financial?v.discount_effect:'UNKNOWN'}};
}
export async function loadRibbonFee(env,options){
 if(!explicitRibbonRequest(options.message))return null;
 const rows=(await env.DB.prepare("SELECT * FROM sales_knowledge_facts WHERE domain='optional_service' AND attribute='ribbon_printing' AND market=? AND status='active'").bind(options.market).all()).results||[];
 const prices=(await env.DB.prepare('SELECT * FROM commercial_price_items WHERE market=? AND active=1').bind(options.market).all()).results||[];
 const guidance=selectRibbonFee(rows,prices,options);
 if(guidance?.service.discount==='SAME_APPROVED_PRODUCT_QUANTITY_RULE')guidance.financial_preview=await loadRibbonFinancialPreview(env,guidance);
 return guidance;
}
export async function ribbonFeeCurrent(env,g){
 const next=await loadRibbonFee(env,{market:g.market,message:g.request?.message});
 return !!next&&JSON.stringify(next)===JSON.stringify(g);
}
