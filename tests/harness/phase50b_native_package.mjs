import fs from 'node:fs';
import crypto from 'node:crypto';
import {makeWorld,reporter} from './harness.mjs';
const {ok,done}=reporter('phase50b_native_package');
const root=process.env.PHASE50_REPORTS||new URL('../../reports/phase50-recovery/original',import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/,'');
const plan=JSON.parse(fs.readFileSync(root+'/PHASE50B-CORRECTED-IMPORT-PACKAGE.json'));
const normalized=['IRAN','IRAQ'].flatMap(m=>JSON.parse(fs.readFileSync(root+'/PHASE50-KNOWLEDGE-'+m+'.json')).proposed_records);
const W=await makeWorld({aiBrain:'on'});
for(const p of ['/api/quotes','/api/si/knowledge/product','/api/owner-escalations','/api/leads/outreach'])await W.call(p,null,'GET');
const requests=plan.batches.flatMap(b=>b.requests);
const canonical=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v);

for(const r of requests.filter(r=>r.payload.operation!=='ADD')){
 const old=normalized.find(x=>x.id===r.record_id).existing_target,p=r.payload,id=p.target_fact_id.replace(/^knowledge-fact-/,'');
 const seed=await W.call('/api/sales-knowledge/propose',{id,operation:'ADD',domain:p.domain,attribute:p.attribute,entity_type:p.entity_type,entity_key:p.entity_key,market:p.market,value:old.old_value});
 if(!seed.body.ok)throw Error('seed proposal '+JSON.stringify(seed));
 await W.approveK(id);
 const got=W.q('SELECT * FROM sales_knowledge_facts WHERE id=?',[p.target_fact_id])[0];
 if(!got||got.version!==p.target_version||got.value_json!==JSON.stringify(old.old_value))throw Error('seed mismatch '+r.record_id);
}
const names=['commercial_price_items','lead_orders','lead_order_payments','conversation_memory_facts','conversation_sales_state','business_settings'];
const digest=()=>Object.fromEntries(names.map(n=>[n,crypto.createHash('sha256').update(JSON.stringify(W.q('SELECT * FROM '+n).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))).digest('hex')]));
const before=digest(),evidence=[];
for(const r of requests){
 const p=r.payload,proposed=await W.call('/api/sales-knowledge/propose',p);
 ok('Native propose '+r.record_id,proposed.body.ok===true,{status:proposed.status,body:proposed.body});
 if(proposed.body.ok!==true)continue;
 await W.approveK(p.id);
 const applied=W.q('SELECT status FROM sales_knowledge_change_requests WHERE id=?',[p.id])[0]?.status==='applied';
 ok('Local native approval/application '+r.record_id,applied);
 const old=p.target_fact_id?W.q('SELECT * FROM sales_knowledge_facts WHERE id=?',[p.target_fact_id])[0]:null;
 const active=W.q("SELECT * FROM sales_knowledge_facts WHERE status='active' AND market=? AND domain=? AND entity_type=? AND entity_key=? AND attribute=?",[p.market,p.domain,p.entity_type,p.entity_key.normalize("NFKC").replace(/[يى]/g,"ی").replace(/ك/g,"ک"),p.attribute]);
 if(p.operation==='DEACTIVATE')ok('Legacy MOQ history retained without active override',!!old&&old.status!=='active'&&active.length===0);
 else ok('Exact active scoped payload '+r.record_id,active.length===1&&canonical(JSON.parse(active[0].value_json))===canonical(p.value),{actual:active[0],same_attribute:W.q("SELECT id,entity_key,value_json FROM sales_knowledge_facts WHERE status='active' AND market=? AND attribute=?",[p.market,p.attribute]),expected:p.value});
 if(p.operation==='REPLACE')ok('Old revision preserved '+r.record_id,!!old&&old.status!=='active');
 evidence.push({id:r.record_id,operation:p.operation,market:p.market,applied_in_memory_only:applied,target_preserved:!p.target_fact_id||!!old});
}
ok('Exactly20 unique proposals with execution disabled',requests.length===20&&new Set(requests.map(r=>r.payload.id)).size===20&&plan.execution_permitted===false&&plan.production_approval_received===false&&plan.batches.every(b=>b.execute===false));
ok('Protected local tables unchanged by native knowledge plan',JSON.stringify(before)===JSON.stringify(digest()),{before,after:digest()});
ok('No customer or provider calls',W.tg.length===0&&W.AI.calls.length===0&&W.offNet().length===0);
console.log('NATIVE_PACKAGE_EVIDENCE '+JSON.stringify({proposals:evidence,protected_hashes:before,execution:'IN_MEMORY_ONLY_NO_PRODUCTION'}));
process.exitCode=done()?1:0;
