// Pure dashboard aggregator; feed authorized, redacted CRM rows; no external calls or D1 writes.
// Integrated (2026-10-30): the state list follows the CRM qualification ladder in lead-qualification.js (QUALIFICATION_STATES).
const STATES=['DISCOVERED','PLACE_DISCOVERED','INDEPENDENT_IDENTITY_FOUND','IDENTITY_VERIFIED','CONTACT_CHANNEL_FOUND','CONTACT_VERIFIED','BUSINESS_QUALIFIED','SALES_READY','CONTACTED','OPPORTUNITY','CUSTOMER','REJECTED'];
export function phase17Overview(items=[]){
  const market=()=>({discovered:0,verified_identity:0,verified_contact:0,sales_ready:0,engaged:0,customers:0,states:Object.fromEntries(STATES.map(k=>[k,0]))});
  const output={IRAN:market(),ARAB:market(),UNKNOWN:market()};
  for(const item of items){const m=item?.market==='IRAN'||item?.market==='ARAB'?item.market:'UNKNOWN';const q=item?.qualification||{};const s=STATES.includes(q.state)?q.state:'DISCOVERED';const o=output[m];o.discovered++;o.states[s]++;if(item.identityVerified===true)o.verified_identity++;if(item.contactVerified===true)o.verified_contact++;if(item.identityVerified===true&&item.contactVerified===true&&s==='SALES_READY')o.sales_ready++;if(['CONTACTED','OPPORTUNITY','CUSTOMER'].includes(s))o.engaged++;if(s==='CUSTOMER')o.customers++;}
  return output;
}
