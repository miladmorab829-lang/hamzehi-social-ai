// O11 v2 only: read-only owner calculation preview. Never writes an order, price or payment.
import {commercialDefaultDiscount,evaluateOrderLines} from './commercial-policy.js';
const MAX=BigInt(Number.MAX_SAFE_INTEGER);
const integer=(v,label)=>{if(!Number.isSafeInteger(v)||v<0)throw Error('Invalid '+label);return BigInt(v);};
const bounded=v=>{if(v<0n||v>MAX)throw Error('Optional fee financial overflow');return v.toString();};
export function calculateRibbonFinancialPreview(g,rule,evidence){
 if(g?.service?.discount!=='SAME_APPROVED_PRODUCT_QUANTITY_RULE'||g.service.deposit!=='HALF_COMBINED_POST_DISCOUNT')throw Error('O11 v2 approval required');
 const p=g.price_evidence,q=Number(g.service.quantity),unit=integer(p.unit_price_minor,'base price'),fee=integer(g.service.amount_minor,'service rate');
 if(!Number.isSafeInteger(q)||q<1||!unit||!fee)throw Error('Invalid service quantity or amount');
 if(rule&&(rule.type!=='percent_bp'||!Number.isSafeInteger(rule.value)||rule.value<1||rule.value>10000||rule.min_quantity!==null&&rule.min_quantity!==undefined&&(!Number.isSafeInteger(rule.min_quantity)||rule.min_quantity<1)))throw Error('Unsupported approved quantity discount; owner review required');
 const [product,size,configuration]=p.product_name.split(' · ');
 // Only the product counts toward MOQ/discount eligibility. The service is NOT a second quantity-bearing line.
 const [base]=evaluateOrderLines([{market:g.market,product,size,configuration,quantity:q,unit_price_minor:p.unit_price_minor,currency:p.currency,row_moq:p.moq}],{discountRule:rule});
 if(base.status!=='priced')throw Error('Product not orderable: '+base.status);
 const rawBase=unit*BigInt(q),rawService=fee*BigInt(q);bounded(rawBase);bounded(rawService);
 const bp=BigInt(base.discount?.value||0),baseDiscount=rawBase*bp/10000n,serviceDiscount=rawService*bp/10000n;
 // Do not silently disagree with existing product policy rounding or precision.
 if(base.subtotal_minor!==Number(rawBase)||(base.discount?.amount_minor||0)!==Number(baseDiscount))throw Error('Existing product discount precision mismatch');
 const netBase=rawBase-baseDiscount,netService=rawService-serviceDiscount,total=netBase+netService,deposit=(total+1n)/2n;
 return {schema:'hamzehi.optional-ribbon-financial-preview.v1',status:'OWNER_REVIEW_REQUIRED',payment_authorized:false,order_creation_authorized:false,market:g.market,currency:p.currency,quantity:q,eligibility_quantity:base.size_quantity,
  lines:[{kind:'product',price_id:p.id,price_version:p.version,unit_minor:p.unit_price_minor,raw_minor:bounded(rawBase),discount_minor:bounded(baseDiscount),net_minor:bounded(netBase)},{kind:'optional_ribbon_service',unit_minor:g.service.amount_minor,raw_minor:bounded(rawService),discount_minor:bounded(serviceDiscount),net_minor:bounded(netService)}],
  applied_discount_bp:Number(bp),discount_evidence:evidence,total_minor:bounded(total),deposit_percent:50,deposit_minor:bounded(deposit),balance_minor:bounded(total-deposit),shipping_included:false,rounding:{discount:'floor_each_component_to_minor_unit',deposit:'ceil_half_combined_to_minor_unit'},authority:'PHASE50D-O11-FINANCIAL-v2'};
}
export async function loadRibbonFinancialPreview(env,g){
 // Same exact market rule used by salesListDiscountRule. Ambiguous/unapproved/malformed data fails closed here.
 const rows=(await env.DB.prepare("SELECT * FROM business_settings WHERE setting_key='discount_rule' AND status='current' AND scope_key=?").bind('market:'+g.market).all()).results||[];
 if(rows.length>1)throw Error('Ambiguous quantity discount');
 let rule,evidence;
 if(rows.length){const r=rows[0];if(!r.approved_by||!Number.isFinite(Date.parse(r.approved_at))||Date.parse(r.approved_at)>Date.now()||!Number.isSafeInteger(r.version)||r.version<1)throw Error('Unapproved quantity discount');
  const v=JSON.parse(r.value_json);rule={type:v.type,value:v.value,min_quantity:v.min_quantity??null,id:r.id,version:r.version};evidence={source:'business_settings',...r};
 }else{rule=commercialDefaultDiscount(g.market);evidence={source:'existing_commercial_default',rule};}
 return calculateRibbonFinancialPreview(g,rule,evidence);
}
