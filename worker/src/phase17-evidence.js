// Phase 17 proposed strict source provenance for LOCAL review; not yet wired into Production.
const googleHost = /(^|\.)(google\.[a-z.]+|goo\.gl|g\.page|g\.co|googleusercontent\.com|googleapis\.com)$/i;
const independentSources = new Set(['owner_confirmed','official_business_website']);
export function verifyIdentityEvidence({provider='',url='',identitySource='',evidenceSource='',businessDomainConfirmed=false,ownerConfirmed=false,verifiedBusinessDomain=''}={}) {
  if(ownerConfirmed === true && identitySource==='owner_confirmed')return {verified:true,reason:'owner_confirmed'};
  let hostname='';try{const u=new URL(String(url));if(u.protocol!=='https:'&&u.protocol!=='http:')return {verified:false,reason:'invalid_protocol'};hostname=u.hostname.toLowerCase();}catch{return {verified:false,reason:'missing_valid_url'}}
  if(googleHost.test(hostname))return {verified:false,reason:'google_not_independent'};
  if(verifiedBusinessDomain && hostname!==verifiedBusinessDomain.toLowerCase() && !hostname.endsWith('.'+verifiedBusinessDomain.toLowerCase()))return {verified:false,reason:'verified_business_domain_mismatch'};
  if(/^google_places(?:_ids)?$/.test(String(provider)) && !businessDomainConfirmed)return {verified:false,reason:'google_origin_not_independent'};
  if(!independentSources.has(identitySource)||identitySource!=='official_business_website'||evidenceSource!=='page_extracted'||!businessDomainConfirmed)return {verified:false,reason:'no_verified_official_source'};
  return {verified:true,reason:'verified_official_site'};
}
export function verifyContactEvidence({identityVerified=false,source='',channel='',evidenceUrl='',isBusinessPublished=false,verifiedBusinessDomain=''}={}) {
  const types=new Set(['email','phone','telegram','whatsapp','instagram']);
  if(!identityVerified||!types.has(channel)||!independentSources.has(source)||!isBusinessPublished)return {verified:false,reason:'insufficient_independent_evidence'};
  if(source==='owner_confirmed')return {verified:true,reason:'owner_confirmed'};
  try{const url=new URL(evidenceUrl);if(!['https:','http:'].includes(url.protocol)||googleHost.test(url.hostname))return {verified:false,reason:'invalid_evidence_url'};
    if(!verifiedBusinessDomain)return {verified:false,reason:'unverified_business_domain'};
    const h=url.hostname.toLowerCase(), d=String(verifiedBusinessDomain).toLowerCase();
    if(h!==d && !h.endsWith('.'+d))return {verified:false,reason:'business_domain_mismatch'};}catch{return {verified:false,reason:'missing_evidence_url'}}
  return {verified:true,reason:'business_published_contact'};
}
