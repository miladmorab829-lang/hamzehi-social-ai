import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyIdentityEvidence,verifyContactEvidence} from '../../worker/src/phase17-evidence.js';
import {phase17Overview} from '../../worker/src/phase17-dashboard-metrics.js';
test('google_places_ids with unrelated URL is NOT independent',()=>assert.equal(verifyIdentityEvidence({provider:'google_places_ids',url:'https://thirdparty.example',evidenceSource:'page_extracted'}).verified,false));
test('plain third party web page is not verified official site',()=>assert.equal(verifyIdentityEvidence({provider:'web',url:'https://directory.example',evidenceSource:'page_extracted'}).verified,false));
test('official business source with explicitly confirmed domain',()=>assert.equal(verifyIdentityEvidence({provider:'web',url:'https://shop.example/contact',identitySource:'official_business_website',evidenceSource:'page_extracted',businessDomainConfirmed:true}).verified,true));
test('Google-origin lead can be independently verified later',()=>assert.equal(verifyIdentityEvidence({provider:'google_places_ids',url:'https://shop.example',identitySource:'official_business_website',evidenceSource:'page_extracted',businessDomainConfirmed:true}).verified,true));
test('owner verified bypasses website requirement',()=>assert.equal(verifyIdentityEvidence({identitySource:'owner_confirmed',ownerConfirmed:true}).verified,true));
test('Google maps content never counts as independent contact',()=>assert.equal(verifyContactEvidence({identityVerified:true,channel:'email',source:'official_business_website',evidenceUrl:'https://maps.google.com',isBusinessPublished:true}).verified,false));
test('official business contact page counts',()=>assert.equal(verifyContactEvidence({identityVerified:true,channel:'email',source:'official_business_website',evidenceUrl:'https://shop.example/contact',isBusinessPublished:true,verifiedBusinessDomain:'shop.example'}).verified,true));
test('no auto contact without identity',()=>assert.equal(verifyContactEvidence({identityVerified:false,channel:'email',source:'owner_confirmed',isBusinessPublished:true}).verified,false));
test('raw ID not counted as qualified sale',()=>{const o=phase17Overview([{market:'IRAN',qualification:{state:'PLACE_DISCOVERED'},identityVerified:false}]);assert.equal(o.IRAN.discovered,1);assert.equal(o.IRAN.sales_ready,0)});
test('only verified contact and identity counts sales ready',()=>{const o=phase17Overview([{market:'ARAB',qualification:{state:'SALES_READY'},identityVerified:true,contactVerified:true},{market:'ARAB',qualification:{state:'SALES_READY'},identityVerified:true,contactVerified:false}]);assert.equal(o.ARAB.sales_ready,1)});
test('market separation',()=>{const o=phase17Overview([{market:'IRAN'},{market:'ARAB'},{market:'CONFLICT'}]);assert.equal(o.IRAN.discovered,1);assert.equal(o.ARAB.discovered,1);assert.equal(o.UNKNOWN.discovered,1)});

test('independent business contact requires a verified website domain',()=>assert.equal(verifyContactEvidence({identityVerified:true,channel:'email',source:'official_business_website',evidenceUrl:'https://directory.example/contact',isBusinessPublished:true}).verified,false));
test('unrelated site cannot masquerade as official contact page',()=>assert.equal(verifyContactEvidence({identityVerified:true,channel:'email',source:'official_business_website',evidenceUrl:'https://directory.example/contact',verifiedBusinessDomain:'shop.example',isBusinessPublished:true}).verified,false));
test('official website identity rejects conflicting verified domain',()=>assert.equal(verifyIdentityEvidence({provider:'web',url:'https://other.example',identitySource:'official_business_website',evidenceSource:'page_extracted',businessDomainConfirmed:true,verifiedBusinessDomain:'shop.example'}).verified,false));
