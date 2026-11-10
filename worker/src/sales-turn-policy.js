// One authority for conversational intent and owner handoff. No I/O and no prices.
// Models interpret meaning; approved calculators supply commercial facts.
export const TURN_POLICY_VERSION='payment-boundary-v1';
export const TURN_MODES=['browse','quote','configure','accept','pay_ready','payment_claim','order_support','uncertain'];
export const QUANTITY_ROLES=['order_count','quote_only','illustrative','component_count','none','uncertain'];
export const DEAL_REFERENCES=['current','new','previous_order','none','uncertain'];
export function normalizeTurnSemantics(value){
  const v=value&&typeof value==='object'?value:{};
  return {mode:TURN_MODES.includes(v.mode)?v.mode:'uncertain',quantity_role:QUANTITY_ROLES.includes(v.quantity_role)?v.quantity_role:'uncertain',deal_reference:DEAL_REFERENCES.includes(v.deal_reference)?v.deal_reference:'uncertain',repeat_requested:v.repeat_requested===true};
}
export function planSalesTurn({enabled,interpretation,valid=false,semantics,requests=[]}={}){
  if(!enabled)return null;
  const s=normalizeTurnSemantics(semantics),i=valid&&interpretation?.confidence!=='low'?interpretation:null;
  // Old cached decisions may still answer informational questions. They cannot invent purchasing quantities or payment readiness.
  let mode=i?s.mode:'uncertain';
  if(i&&mode==='uncertain'){
    if(['price','negotiate','quantity_change'].includes(i.primary_intent))mode='quote';
    else if(['greeting','thanks','product_info','colors_available','size_info','printing','shipping','see_photo','see_other_color'].includes(i.primary_intent))mode='browse';
    else if(i.primary_intent==='order_status')mode='order_support';
  }
  const paymentStage=['pay_ready','payment_claim'].includes(mode);
  const commercial=['quote','configure','accept','pay_ready'].includes(mode);
  const quantityRole=i?s.quantity_role:'uncertain';
  return {version:TURN_POLICY_VERSION,mode,primary_intent:i?.primary_intent||'other',ambiguity:i?.ambiguity||'none',deal_reference:s.deal_reference,
    quantity_role:quantityRole,may_store_quantity:commercial&&i?.ambiguity==='none'&&quantityRole==='order_count',
    may_quote_quantity:commercial&&i?.ambiguity==='none'&&['order_count','quote_only'].includes(quantityRole),
    may_write_candidate:commercial&&(!i||i.ambiguity==='none'),may_handoff:paymentStage,payment_stage:paymentStage,
    asks_commercial:commercial||requests.some(r=>['price','discount','moq','payment'].includes(r)),
    repeat_requested:!!i&&s.repeat_requested,semantic_valid:!!i};
}
export function policyAllowsOwner(brain){return brain?.turn_policy?brain.turn_policy.may_handoff===true:brain?.ai_first==='on'?['payment_claim_owner','payment_claim_unmatched','payment_ready_owner'].includes(brain.next_sales_action):true;}
export function trustedQuantityProjection({memory,candidate,sourceId,sourceDecision}={}){
  const value=memory?.requested_quantity,p=sourceDecision?.turn_policy;
  const proof=p?.quantity_source;
  const trusted=Number.isSafeInteger(value)&&value>0&&proof?.source_message_id===sourceId&&proof?.value===value&&proof?.role==='order_count'&&proof?.verified===true&&!!proof.market&&(!candidate||proof.product_key===candidate.product?.key&&proof.market===candidate.market);
  const projected={...memory};if(!trusted)delete projected.requested_quantity;
  // Never revive an older superseded count. Historical order records/accepted offers themselves are not altered.
  const q=candidate?.quantity_provenance,quoteTrusted=q?.verified===true&&q.role==='quote_only'&&q.product_key===candidate.product?.key&&q.market===candidate.market&&q.value===candidate.quantity&&Number.isSafeInteger(q.value)&&q.value>0;
  const deal=candidate?{...candidate,quantity:trusted?value:quoteTrusted?q.value:null,...(!trusted&&!quoteTrusted&&candidate.status!=='accepted'?{offer:null,price:null,status:'draft'}:{})}:null;
  return {memory:projected,candidate:deal,quantity:trusted?value:null,quoteQuantity:quoteTrusted?q.value:null,masked:!trusted&&Number.isSafeInteger(value)};
}
export function policyClarification(language){return language==='Iraqi Arabic'?'ما فهمت قصدك بشكل كافي. ممكن توضح شنو تريد تعرف عن هالموديل؟':'منظورتون رو کامل نگرفتم؛ می‌تونید بگید دقیقاً چه چیزی درباره این مدل می‌خواید بدونید؟';}
export function commercialLimitReply(language,kind,{minimum=null}={}){
  const ar=language==='Iraqi Arabic';
  if(kind==='minimum'&&Number.isSafeInteger(minimum))return ar?`أقل كمية لهذا القياس هي ${minimum} قطعة. أگدر أكمل وياك على هالكمية أو أكثر؛ الكمية الأقل مو ضمن الشروط المتاحة.`:`حداقل سفارش این سایز ${minimum} عدده. می‌تونیم با همین تعداد یا بیشتر ادامه بدیم؛ تعداد کمتر در شرایط فعلی قابل ثبت نیست.`;
  if(kind==='terms')return ar?'أگدر أعتمد شروط الدفع المعتمدة فقط؛ التغيير المطلوب مو متاح حالياً. نكدر نكمل اختيار مواصفات الطلب.':'می‌تونم طبق شرایط پرداخت مصوب ادامه بدم؛ تغییر درخواستی فعلاً قابل اعمال نیست. انتخاب مشخصات سفارش رو می‌تونیم ادامه بدیم.';
  if(kind==='discount')return ar?'ما عندي تخفيض إضافي ضمن الشروط المعتمدة.':'تخفیف بیشتری در شرایط مصوب فعلی قابل اعمال نیست.';
  return ar?'ما عندي رقم موثوق لهالمواصفات حتى أعطيك جواب دقيق.':'برای این مشخصات، عدد قابل اتکایی در اختیارم نیست که دقیق راهنمایی‌تون کنم.';
}
