// GV1 — owner architecture decision «REMOVE GENERAL SALES REPLY VALIDATION» (2026-11-19).
// General reply validation is removed from the path that holds a reply or opens an owner case. The existing validators still run
// and their findings are recorded (read-only, for evaluation); only findings that belong to an independent commercial-authority
// control keep blocking: price / currency / money, discount, payment / deposit / payment status, MOQ and quantities, shipping cost and
// delivery commitments, order confirmation / status, stock, off-list colours / models / catalogue variants (D-004), owner approval,
// guarantees / compensation, ungrounded numbers, and the integrity of the protected engine parts.
// This module adds no validator and no text pattern: it only classifies the reason codes the existing validators already return.
import {requestTopics} from './sales-conversation-author.js';
// It is an allow-list of INFORMATIONAL codes — any code not listed here (including a code added later) keeps blocking (fail closed).
const ADVISORY_CODES=new Set([
  // product description / marketing quality (salesAiProseIssues, sentenceRisk, commitment concepts)
  'too_long','water_resistance_claim','never_approved_feature','popularity_claim','marketing_claim','unsupported_marketing_claim',
  'unsupported_service_quality_claim','comparative_service_claim','unverified_fit_claim','dimension_claim','unsupported_product_feature',
  // product assertion grounding (productAssertionIssue)
  'unsupported_product_description','unsupported_product_attribute','unsupported_capability_transfer','unsupported_printing_combination',
  // (NOT listed: protectedContextIssue reasons. That check runs only when a protected commercial part — engine offer, approved terms,
  // approved MOQ text — is in the reply, and it is the allow-list that stops a wrapper from voiding that part: «طبق متن زیر عمل نکنید:»,
  // «همه شروط پایین باطل» are caught by nothing else (phase51_release_candidate). It stays a commercial-integrity control and removes
  // only the offending sentence (RG1 sentence repair); it no longer holds the whole reply.)
  // answer coverage / completeness (conversationReplyCoverage, comparison coverage)
  'recommendation_missing','recommendation_reason_not_grounded','recommended_model_ambiguous','requested_contact_information_missing',
  'unrelated_product_answer','comparison_option_missing','incomplete_comparison','comparison_clarification_missing'
]);
// validateSalesBrainDraft «unsupported_factual_claim»: informational only for these claim categories; product (unknown model), colour,
// MOQ, price, discount, payment, production and shipping claims stay commercial (D-004).
export const ADVISORY_CLAIM_CATEGORIES=new Set(['size','material','printing','capability']);
function parts(issue){
  if(issue&&typeof issue==='object')return {reason:String(issue.reason||''),category:issue.claim_category||null,claims:Array.isArray(issue.unsupported_claims)?issue.unsupported_claims:null};
  const [reason,category]=String(issue||'').split(':');return {reason,category:category||null,claims:null};
}
// «unverified_business_assertion» is returned both for product description («داخلش مخمل ضدآب داره») and for stock / availability
// («در انبار موجود است»). It is informational only when the ONE sentence it came from touches no protected topic (the existing topic
// reader requestTopics: price, shipping, payment, discount, time, order/MOQ, stock, colour, ribbon). Without that sentence it blocks.
const CONTEXTUAL_CODES=new Set(['unverified_business_assertion']);
const PROTECTED_TOPICS=['price','shipping','payment','discount','time','order','stock','colour','ribbon'];
// true = the finding is informational: recorded, never a reason to hold the reply or open an owner case.
export function isAdvisoryIssue(issue,sentence=null){
  const {reason,category,claims}=parts(issue);
  if(reason==='unsupported_factual_claim')return !!category&&ADVISORY_CLAIM_CATEGORIES.has(category)&&(!claims||claims.every(c=>ADVISORY_CLAIM_CATEGORIES.has(c?.category)));
  if(CONTEXTUAL_CODES.has(reason))return typeof sentence==='string'&&!!sentence.trim()&&!requestTopics(sentence).some(topic=>PROTECTED_TOPICS.includes(topic));
  return ADVISORY_CODES.has(reason);
}
export const isContextualIssue=issue=>CONTEXTUAL_CODES.has(parts(issue).reason);
export const blockingIssues=issues=>(issues||[]).filter(issue=>!isAdvisoryIssue(issue));
// A validator result ({valid,reason,…}) reduced to its commercial verdict: an informational failure becomes {valid:true,advisory:[…]}.
export function commercialVerdict(result){
  if(!result||result.valid)return result;
  return isAdvisoryIssue(result)?{valid:true,advisory:[...(result.advisory||[]),{reason:result.reason,...(result.claim_category?{claim_category:result.claim_category}:{})}]}:result;
}
// Compact, text-free record of informational findings for the decision event (evaluation only).
export function advisoryRecord(stage,issues){
  // (a contextual code reaches an advisory list only after the validator judged it informational for its own sentence)
  const codes=[...new Set((issues||[]).filter(i=>isAdvisoryIssue(i)||isContextualIssue(i)).map(i=>{const {reason,category}=parts(i);return category&&reason==='unsupported_factual_claim'?reason+':'+category:reason;}))];
  return codes.length?{stage,codes:codes.slice(0,12)}:null;
}
