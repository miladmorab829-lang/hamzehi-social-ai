import fs from 'node:fs';import crypto from 'node:crypto';
import {makeWorld,reporter} from './harness.mjs';
import {RIBBON_FINANCIAL_SCHEMA,validateRibbonFee,loadRibbonFee,ribbonFeeCurrent} from '../../worker/src/optional-ribbon-fee.js';
import {calculateRibbonFinancialPreview} from '../../worker/src/optional-ribbon-finance.js';
const {ok,done}=reporter('phase50d_financial'),read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/^\uFEFF/,''));
const owner=read('../../reports/phase50d/O11-FINANCIAL-OWNER-DECISION-v2.json'),old=read('../../reports/phase50c/PHASE50C-IMPORT-PACKAGE.json'),schema=read('../../reports/phase50c/PHASE50C-OPTIONAL-FEE-SCHEMA.json');
const W=await makeWorld({aiBrain:'on'});for(const p of ['/api/quotes','/api/si/knowledge/product','/api/owner-escalations','/api/leads/outreach'])await W.call(p,null,'GET');await W.call('/api/sales-ai-first',{mode:'on'});
const cat=read('./fixtures/phase41-catalog.json'),ar=read('./fixtures/phase44-approved-iraq-rows.json');
for(const [table,rows]of [['commercial_price_items',[...cat.items,...ar]],['business_settings',cat.settings]])for(const row of rows){const keys=Object.keys(row);W.dbrun(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?')})`,Object.values(row));}
const snapshot=()=>Object.fromEntries(['commercial_price_items','business_settings','lead_orders','lead_order_payments'].map(t=>[t,crypto.createHash('sha256').update(JSON.stringify(W.q(`SELECT * FROM ${t} ORDER BY id`))).digest('hex')]));const before=snapshot();
const additions=[],samples=[];let uid=956000;
for(const market of ['IRAN','ARAB']){
 const prior=schema.records.find(r=>r.payload.market===market),payload={...prior.payload,id:'phase50d-o11-'+market.toLowerCase()+'-v2',value:{...prior.payload.value,schema:RIBBON_FINANCIAL_SCHEMA,discount_effect:owner.discount_effect,deposit_effect:owner.deposit_effect,source_ref:owner.id,policy_version:2}};
 additions.push({record_id:payload.id,payload});
 const propose=await W.call('/api/sales-knowledge/propose',payload);ok('Native v2 propose '+market,propose.body.ok===true,propose);
 const request=W.q('SELECT * FROM sales_knowledge_change_requests WHERE id=?',[payload.id])[0];
 const review=await W.call('/api/sales-knowledge/review',{id:payload.id,decision:'approve',proposal_hash:request.proposal_hash,confirm_sensitive:false});ok('Sensitive review still required '+market,review.body.ok!==true);
 const apply=await W.call('/api/sales-knowledge/apply',{id:payload.id,proposal_hash:request.proposal_hash});ok('Premature apply rejected '+market,apply.body.ok!==true);await W.approveK(payload.id);
 const rowId=market==='IRAN'?'c9308cdd-fae4-4ca2-a94f-68e22462bdbd':'06b13df3-84b1-4ad3-b68f-48898f2b74cc';
 const price=W.q('SELECT * FROM commercial_price_items WHERE id=?',[rowId])[0],name=price.product_name.split(' · ').join(' ');
 const question=q=>market==='IRAN'?`برای ${q} جعبه ${name} چاپ سفارشی روی روبان می خواهم`:`أريد طباعة على الشريط لـ ${q} علبة ${name}`;
 const g=await loadRibbonFee(W.env,{market,message:question(1000)}),f=g.financial_preview;
 ok('Raw service '+market,f.lines[1].raw_minor===(market==='IRAN'?'6000000':'30000'));
 ok('Approved service discount '+market,f.lines[1].discount_minor===(market==='IRAN'?'600000':'0'));
 ok('Service net '+market,f.lines[1].net_minor===(market==='IRAN'?'5400000':'30000'));
 ok('Product net '+market,f.lines[0].net_minor===(market==='IRAN'?'108000000':'120000'));
 ok('Combined total '+market,f.total_minor===(market==='IRAN'?'113400000':'150000'));
 ok('50 percent deposit '+market,f.deposit_minor===(market==='IRAN'?'56700000':'75000'));
 ok('Single quantity eligibility '+market,f.eligibility_quantity===1000);
 ok('Calculation not payment/order authorization '+market,f.status==='OWNER_REVIEW_REQUIRED'&&!f.payment_authorized&&!f.order_creation_authorized&&!f.shipping_included);
 ok('Policy prose no stale UNKNOWN '+market,!/هنوز مشخص نیست|غير محدد/.test(g.text)&&/۵۰|50/.test(g.text));
 ok('Preview totals not in automatic text '+market,!g.text.includes(f.total_minor)&&!g.text.includes(f.deposit_minor));
 ok('Fresh setting and catalog evidence '+market,await ribbonFeeCurrent(W.env,g));
 for(const qty of [499,500,999,1000,1001]){let got=null;try{got=await loadRibbonFee(W.env,{market,message:question(qty)});}catch{}
  if(qty===499){ok('MOQ still blocks '+market,!got);continue;}
  const expected=qty>=(market==='IRAN'?1000:1001)?1000:0;
  ok('Existing threshold '+market+' '+qty,got?.financial_preview.applied_discount_bp===expected);
 }
 for(const model of ['2 تکه','3 تکه','3 تکه کج','کشویی روبان‌دار','کشویی کج'])ok('Other model not charged '+market+model,await loadRibbonFee(W.env,{market,message:question(1000).replace(price.product_name.split(' · ')[2],model)})===null);
 ok('No printing request unchanged '+market,await loadRibbonFee(W.env,{market,message:`1000 جعبه ${name}`})===null);
 const rule=f.discount_evidence,setting=W.q('SELECT * FROM business_settings WHERE id=?',[rule.id])[0];
 ok('Changed setting version revalidation '+market,!await ribbonFeeCurrent(W.env,{...g,financial_preview:{...f,discount_evidence:{...rule,version:rule.version+1}}}));
 for(const bad of [{type:'amount_minor',value:100,min_quantity:1000},{type:'percent_bp',value:10000.1},{type:'percent_bp',value:1000,min_quantity:-1}]){let blocked=false;try{calculateRibbonFinancialPreview(g,bad,{test:true});}catch{blocked=true;}ok('Unsupported rule fails closed '+market+JSON.stringify(bad),blocked);}
 const odd={...g,service:{...g.service,quantity:'501',amount_minor:market==='IRAN'?6000:30},price_evidence:{...price,unit_price_minor:market==='IRAN'?120001:121}};
 const rounded=calculateRibbonFinancialPreview(odd,null,{test:'existing no discount'});ok('Existing ceil half minor rounding '+market,BigInt(rounded.deposit_minor)===(BigInt(rounded.total_minor)+1n)/2n);
 const u={id:++uid,name:'Local50D',username:'p50d'+uid};await W.send(u,market==='IRAN'?'سلام':'هلا');W.setMarket(u,market==='IRAN'?'iran':'iraq');
 const decision=()=>W.D({reply:market==='IRAN'?'اطلاعات خدمت آماده است.':'معلومات الخدمة جاهزة.',requests:['product_info'],interpretation:{primary_intent:'product_info',product_key:null,reference:'none',requested_size:null,requested_color:[],requested_structure:null,requested_printing:null,quantity:null,ambiguity:'none',confidence:'high'},semantics:{mode:'browse',quantity_role:'none',deal_reference:'none',repeat_requested:false},facts:{color_statement:'none',negated_colors:[]}});
 W.AI.script.set(question(1000),decision);let n=W.tg.length;const result=await W.send(u,question(1000));
 const texts=()=>W.tg.slice(n).filter(t=>t.method==='sendMessage').map(t=>JSON.parse(t.body)).filter(t=>String(t.chat_id)===String(u.id)).map(t=>t.text);
 ok('Full FA/AR information response '+market,texts().join('\n')===g.text,{text:texts(),outcome:result.outcome});
 const mixed=question(1000)+(market==='IRAN'?'؛ قیمت نهایی و بیعانه را بگو?':'؛ هل تحسب الخصم والعربون؟');W.AI.script.set(mixed,decision);n=W.tg.length;await W.send(u,mixed);ok('Combined financial send hold retained '+market,texts().length===0);
 // Change exact rule between draft and freshness check; immutable revision identity is retained in preview.
 const prepare=W.env.DB.prepare.bind(W.env.DB);let settingReads=0;
 W.env.DB.prepare=sql=>{if(sql.includes("setting_key='discount_rule'")&&++settingReads===2)W.dbrun("UPDATE business_settings SET status='superseded' WHERE id=?",[setting.id]);return prepare(sql);};
 n=W.tg.length;await W.send(u,question(1000));W.env.DB.prepare=prepare;
 ok('Rule changed before send blocks disclosure '+market,settingReads>=2&&texts().length===0,{settingReads,text:texts()});
 // A fresh database setting is restored by legal new immutable revision, never updating an approved value.
 const keys=Object.keys(setting),restored={...setting,id:setting.id+'-local-restored',version:setting.version+1};W.dbrun(`INSERT INTO business_settings(${keys.join(',')}) VALUES(${keys.map(()=>'?')})`,keys.map(k=>restored[k]));
 samples.push({price_id:price.id,price_version:price.version,product:price.product_name,unit_price_minor:price.unit_price_minor,preview:f,customer_text:g.text});
}
// Exercise the preserved 20 plus the two v2 policies in the SAME isolated native store.
const normalized=['IRAN','IRAQ'].flatMap(m=>read('../../reports/phase50-recovery/original/PHASE50-KNOWLEDGE-'+m+'.json').proposed_records);
const originalRequests=old.batches.slice(0,2).flatMap(b=>b.requests);
for(const r of originalRequests.filter(r=>r.payload.operation!=='ADD')){
 const p=r.payload,prior=normalized.find(x=>x.id===r.record_id).existing_target,id=p.target_fact_id.replace(/^knowledge-fact-/,'');
 const seed=await W.call('/api/sales-knowledge/propose',{id,operation:'ADD',domain:p.domain,attribute:p.attribute,entity_type:p.entity_type,entity_key:p.entity_key,market:p.market,value:prior.old_value});
 if(!seed.body.ok)throw Error('Preserved baseline seed failed');await W.approveK(id);
}
for(const r of originalRequests){const p=r.payload,rsp=await W.call('/api/sales-knowledge/propose',p);ok('Preserved native proposal '+r.record_id,rsp.body.ok===true,rsp);if(rsp.body.ok){await W.approveK(p.id);ok('Preserved native apply '+r.record_id,W.q('SELECT status FROM sales_knowledge_change_requests WHERE id=?',[p.id])[0]?.status==='applied');}}
ok('All22 intended requests applied in isolated store',[...originalRequests,...additions].length===22&&[...originalRequests,...additions].every(r=>W.q('SELECT status FROM sales_knowledge_change_requests WHERE id=?',[r.payload.id])[0]?.status==='applied'));
ok('Base prices unchanged',snapshot().commercial_price_items===before.commercial_price_items);
ok('Orders/payments unchanged',snapshot().lead_orders===before.lead_orders&&snapshot().lead_order_payments===before.lead_order_payments);
ok('No network escapes',W.offNet().length===0);
const base20=old.batches.slice(0,2),plan={...old,schema:'hamzehi.phase50d.review-plan.v1',batches:[...base20,...additions.map(r=>({market:r.payload.market,execute:false,method:'POST',endpoint:'/api/sales-knowledge/propose',requests:[r]}))],phase50d:{owner_source:owner.id,owner_source_sha256:crypto.createHash('sha256').update(fs.readFileSync(new URL('../../reports/phase50d/O11-FINANCIAL-OWNER-DECISION-v2.json',import.meta.url))).digest('hex'),supersedes_unapplied_local_proposals:schema.records.map(r=>r.payload.id),new_financial_policy_records:2,total_operations:22,execution_permitted:false},required_isolated_patch:{base_commit:old.worker_base_commit,source_manifest:'AFTER-SHA256.json'},readiness:{status:'LOCAL_FINANCIAL_VALIDATION_SEE_CHECKPOINT',production_action_permitted:false}};
plan.historical_phase50c=old.phase50c;delete plan.phase50c;
plan.historical_prior_requirements=old.requirements;
plan.requirements=['Separate owner release authorization after Phase50D local review','Fresh source/deployed-version/target-version preflight before any future operational action','Existing per-proposal sensitive owner review, preview and apply gates','Preserve base prices, historical HOLD and all financial/payment authority boundaries','Never activate both the superseded unapplied Phase50C proposals and these Phase50D replacements'];
ok('Original20 preserved,22 unique disabled operations',JSON.stringify(plan.batches.slice(0,2))===JSON.stringify(base20)&&plan.batches.flatMap(b=>b.requests).length===22&&new Set(plan.batches.flatMap(b=>b.requests).map(r=>r.payload.id)).size===22&&plan.batches.every(b=>b.execute===false));
ok('Both historical HOLD arrays unchanged',['held_unscoped_records','held_scoped_records'].every(k=>JSON.stringify(plan[k])===JSON.stringify(old[k])));
fs.writeFileSync(new URL('../../reports/phase50d/PHASE50D-IMPORT-PACKAGE.json',import.meta.url),JSON.stringify(plan,null,2)+'\n');
fs.writeFileSync(new URL('../../reports/phase50d/evidence/calculations.json',import.meta.url),JSON.stringify({samples,before,after:snapshot(),note:'Settings mutated only in memory for revocation tests; no settings mutation code added'},null,2)+'\n');
process.exitCode=done()?1:0;
