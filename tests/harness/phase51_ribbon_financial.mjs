// Independent commercial oracles for the unchanged O11 calculator. Local SQLite only.
import fs from 'node:fs';
import {makeWorld,reporter} from './harness.mjs';
import {loadRibbonFee,ribbonFeeCurrent} from '../../worker/src/optional-ribbon-fee.js';
import {calculateRibbonFinancialPreview} from '../../worker/src/optional-ribbon-finance.js';
const read=file=>JSON.parse(fs.readFileSync(new URL(file,import.meta.url),'utf8').replace(/^\uFEFF/,''));
const {ok,done}=reporter('phase51_ribbon_financial');
const W=await makeWorld();
for(const endpoint of ['/api/quotes','/api/si/knowledge/product','/api/owner-escalations','/api/leads/outreach'])await W.call(endpoint,null,'GET');
const catalog=read('./fixtures/phase41-catalog.json');
for(const [table,rows] of [['commercial_price_items',[...catalog.items,...read('./fixtures/phase44-approved-iraq-rows.json')]],['business_settings',catalog.settings]])for(const row of rows){const keys=Object.keys(row);W.dbrun(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?')})`,Object.values(row));}
const snapshot=()=>JSON.stringify(['commercial_price_items','business_settings','lead_orders','lead_order_payments'].map(table=>[table,W.q(`SELECT * FROM ${table} ORDER BY id`)]));
const before=snapshot();
for(const request of read('../../reports/phase50d/PHASE50D-IMPORT-PACKAGE.json').batches.flatMap(batch=>batch.requests).filter(request=>request.payload.domain==='optional_service')){const proposed=await W.call('/api/sales-knowledge/propose',request.payload);if(!proposed.body.ok)throw Error('Invalid fixture');await W.approveK(request.payload.id);}
for(const market of ['IRAN','ARAB']){
  const price=W.q('SELECT * FROM commercial_price_items WHERE id=?',[market==='IRAN'?'c9308cdd-fae4-4ca2-a94f-68e22462bdbd':'06b13df3-84b1-4ad3-b68f-48898f2b74cc'])[0],name=price.product_name.split(' · ').join(' ');
  const question=count=>market==='IRAN'?`برای ${count} جعبه ${name} چاپ سفارشی روی روبان می خواهم`:`أريد طباعة على الشريط لـ ${count} علبة ${name}`;
  const guidance=await loadRibbonFee(W.env,{market,message:question(1000)}),preview=guidance.financial_preview;
  const expected=market==='IRAN'?['6000000','600000','5400000','108000000','113400000','56700000']:['30000','0','30000','120000','150000','75000'];
  for(const [index,actual] of [preview.lines[1].raw_minor,preview.lines[1].discount_minor,preview.lines[1].net_minor,preview.lines[0].net_minor,preview.total_minor,preview.deposit_minor].entries())ok('Existing independent amount oracle '+market+' #'+index,actual===expected[index],{actual,expected:expected[index]});
  ok('Calculator remains owner-review only '+market,preview.status==='OWNER_REVIEW_REQUIRED'&&!preview.payment_authorized&&!preview.order_creation_authorized&&!preview.shipping_included);
  ok('Fresh revision identity remains required '+market,await ribbonFeeCurrent(W.env,guidance));
  ok('Changed revision identity fails closed '+market,!await ribbonFeeCurrent(W.env,{...guidance,price_evidence:{...guidance.price_evidence,version:price.version+1}}));
  for(const count of [499,500,999,1000,1001]){
    let result;try{result=await loadRibbonFee(W.env,{market,message:question(count)});}catch{}
    ok('Preserved MOQ/discount boundary '+market+' '+count,count===499?!result:result?.financial_preview?.applied_discount_bp===(count>=(market==='IRAN'?1000:1001)?1000:0),result?.financial_preview?.applied_discount_bp);
  }
  for(const model of ['2 تکه','3 تکه','3 تکه کج','کشویی روبان‌دار','کشویی کج'])ok('No O11 fee on another model '+market+' '+model,await loadRibbonFee(W.env,{market,message:question(1000).replace(price.product_name.split(' · ')[2],model)})===null);
  for(const invalid of [{type:'amount_minor',value:100,min_quantity:1000},{type:'percent_bp',value:10000.1},{type:'percent_bp',value:1000,min_quantity:-1}]){let blocked=false;try{calculateRibbonFinancialPreview(guidance,invalid,{test:true});}catch{blocked=true;}ok('Unsupported financial rule still rejected '+market+' '+JSON.stringify(invalid),blocked);}
}
ok('Prices, settings, orders and payments remain byte-for-byte unchanged in memory',snapshot()===before);
ok('No provider or customer network calls',W.net.length===0);
process.exitCode=done()?1:0;
