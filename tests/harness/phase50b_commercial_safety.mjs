import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const phase50=process.env.PHASE50_REPORTS||new URL('../../reports/phase50-recovery/original',import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/,'');
const fixture=JSON.parse(fs.readFileSync(path.join(phase50,'evidence/phase50-isolated-tests.json'),'utf8'));
const plan=JSON.parse(fs.readFileSync(path.join(phase50,'PHASE50-KNOWLEDGE-IMPORT-READY.json'),'utf8'));
const guidance=await import(pathToFileURL(path.join(root,'worker/src/approved-sales-guidance.js')));
const source=fs.readFileSync(path.join(root,'worker/src/index.js'),'utf8');
const start=source.indexOf('const SALES_EXTRA_COST_Q='),end=source.indexOf('const SALES_BRAIN_STATUS_PING',start);
const extra=vm.runInNewContext(source.slice(start,end)+';salesExtraCostQuestion;',{serviceRibbonPrintQuestion:guidance.serviceRibbonPrintQuestion});
const tests=[];const check=(id,got,want,detail={})=>tests.push({id,status:got===want?'PASS':'FAIL',observed:got,expected:want,detail});
for(const t of fixture.tests.filter(t=>/^RUNTIME-(?:carton|ribbon-foil)-(?:fa|ar)$/.test(t.id)))
 check(t.id,extra(t.detail.question),t.expected,{question:t.detail.question});
const held=plan.held_scoped_records.filter(r=>r.attribute==='shipping_cost_responsibility');
for(const r of held){
 const market=r.market,request={kind:'delivery',topic:market==='IRAN'?'method':'timing',insist:false};
 const row={id:r.existing_target.source_id,domain:'shipping',attribute:'terms',entity_key:'global',market,status:'active',authority:'owner_approved',version:r.existing_target.version,value_json:JSON.stringify(r.existing_target.old_value)};
 const before=guidance.selectApprovedGuidance([row],{market,request});
 const after=guidance.selectApprovedGuidance([{...row,version:row.version+1,value_json:JSON.stringify(r.native_proposal.value)}],{market,request});
 check('shipping-guidance-after-'+market,!!after,true,{old_guidance_available:!!before,source_fact_id:row.id,source_version:row.version,merged_value:r.native_proposal.value});
 if(!process.argv.includes('--baseline')){
  check('shipping-original-'+market,!!before,true);
  check('shipping-full-approved-text-'+market,after?.text===r.native_proposal.value.trim(),true);
  check('shipping-exact-source-'+market,after?.facts?.[0]?.id===row.id&&after?.facts?.[0]?.version===row.version+1,true);
  for(const [suffix,override]of [['wrong-market',{market:market==='IRAN'?'ARAB':'IRAN'}],['inactive',{status:'inactive'}],['unapproved',{authority:'unapproved'}],['expired',{effective_until:'2025-01-01T00:00:00Z'}],['future',{effective_from:'2099-01-01T00:00:00Z'}]]){
   check('shipping-'+suffix+'-'+market,guidance.selectApprovedGuidance([{...row,...override,value_json:JSON.stringify(r.native_proposal.value)}],{market,request})===null,true);
  }
  check('shipping-conflict-'+market,guidance.selectApprovedGuidance([{...row,value_json:JSON.stringify(r.native_proposal.value)},{...row,id:'other',value_json:JSON.stringify(r.native_proposal.value)}],{market,request})===null,true);
  for(const [key,suffix]of [['amount-fa',' هزینه ارسال ۵۰۰۰۰ تومان است.'],['amount-ar',' أجور الشحن 50 دولار.'],['amount-bare',' هزینه ارسال بر عهده مشتری: 50000.'],['discount',' تخفیف ۱۰ درصد دارد.'],['deposit',' بیعانه 50 درصد است.'],['payment',' شماره حساب پرداخت 1234567890123456 است.'],['owner-payer',' هزینه حمل بر عهده مالک است.'],['free-policy',' هزینه حمل رایگان است.'],['negated-payer-fa',' هزینه حمل بر عهده مشتری نیست و بر عهده مالک است.'],['negated-payer-ar',' لا يتحمل الزبون أجور الشحن.'],['written-amount-fa',' هزینه حمل پنجاه هزار بر عهده مشتری است.'],['written-product-fa',' هزینه حمل بر عهده مشتری است و قیمت هر جعبه پنجاه است.'],['written-product-ar',' يتحمل الزبون أجور الشحن وسعر العلبة خمسون.'],['bare-newline','\n50000.'],['bank-number',' شماره کارت: 1111222233334444.'],['transfer-ar',' حوّل لنا قبل الشحن.'],['free-second',' ارسال رایگان است.']]){
   check('shipping-denies-'+key+'-'+market,guidance.selectApprovedGuidance([{...row,value_json:JSON.stringify(r.native_proposal.value+suffix)}],{market,request})===null,true);
  }
  for(const [key,prefix]of [['prefixed-transfer-ar','وحوّل لنا قبل الشحن.\n'],['payment-polite-fa','پول کارتن را قبل از ارسال بفرستید.\n'],['payment-synonym-ar','سدّدوا قبل الشحن.\n']])check('shipping-denies-'+key+'-'+market,guidance.selectApprovedGuidance([{...row,value_json:JSON.stringify(prefix+r.native_proposal.value)}],{market,request})===null,true);
  const masked=guidance.maskApprovedGuidance((after?.text||'')+' هزینه اضافی ساختگی 999',after);
  check('shipping-mask-only-exact-'+market,masked===' هزینه اضافی ساختگی 999',true);
 }
}
if(!process.argv.includes('--baseline')){
 const cases=[
 ['negated-lid-positive-ribbon-fa','چاپ روی درب نمی‌خواهم و چاپ روی روبان می‌خواهم؛ هزینه اضافه دارد؟',false],['positive-ribbon-negated-lid-fa','چاپ روی روبان می‌خواهم و چاپ روی درب نمی‌خواهم؛ هزینه اضافه دارد؟',false],['negated-lid-positive-ribbon-ar','ما أريد طباعة على الغطاء وأريد طباعة على الشريط؛ بيها كلفة إضافية؟',false],['negated-lid-positive-ribbon-ar2','لا أريد طباعة الغطاء بل طباعة الشريط. بيها كلفة إضافية؟',false],['ribbon-verb-fa','روبان را طلاکوب کنید؛ هزینه اضافه دارد؟',false],['ribbon-suffix-fa','طلاکوبی روبان هزینه اضافه دارد؟',false],
 ['negated-print-passive-fa','طلاکوب روی درب باشد؛ روی روبان چاپ نشود. هزینه اضافه دارد؟',true],
 ['negated-print-passive-ar','الطباعة على الغطاء؛ على الشريط لا تطبعون. بيها كلفة إضافية؟',true],
 ['tax-fa','مالیات یا هزینه اضافه دارد؟',true],['tax-ar','أكو ضريبة إضافية؟',true],
 ['lid-fa','طلاکوب استاندارد روی درب هزینه اضافه دارد؟',true],
 ['lid-with-ribbon-model-fa','کشویی روبان‌دار با طلاکوب روی درب هزینه اضافه دارد؟',true],
 ['ribbon-gold-color-fa','روبان طلایی و چاپ لوگو روی درب هزینه اضافه دارد؟',true],
 ['ribbon-standard-fa','روبان استاندارد هزینه اضافه دارد؟',true],
 ['bag-standard-fa','چاپ چهاررنگ استاندارد بگ هزینه اضافه دارد؟',true],
 ['bag-material-fa','بگ از مقوای گلاسه است، هزینه اضافه دارد؟',true],
 ['ribbon-explicit-fa','چاپ لوگو روی خود روبان هزینه اضافه دارد؟',false],
 ['ribbon-name-fa','چاپ اسم روی نوار ساتن هزینه اضافه دارد؟',false],
 ['ribbon-reversed-fa','روی روبان اسم طلاکوب شود، هزینه اضافه دارد؟',false],
 ['ribbon-negated-free-fa','چاپ روی روبان رایگان نیست؟ هزینه اضافه دارد؟',false],
 ['lid-and-ribbon-fa','چاپ روی درب و روی روبان هزینه اضافه دارد؟',false],
 ['ribbon-negated-service-fa','روی روبان چاپ نمی‌خواهم، فقط روی درب؛ هزینه اضافه دارد؟',true],
 ['ribbon-explicit-ar','طباعة الشعار على شريط ساتان بيها كلفة إضافية؟',false],
 ['ribbon-standard-ar','الشريط الساتان القياسي بيه كلفة إضافية؟',true],
 ['lid-model-ar','موديل الجرارة مع شريط وطباعة ذهبية على الغطاء بيها كلفة إضافية؟',true],
 ['lid-and-ribbon-ar','طباعة على الغطاء وعلى الشريط بيها كلفة إضافية؟',false],
 ['ribbon-negated-service-ar','ما أريد طباعة على الشريط، فقط على الغطاء؛ بيها كلفة إضافية؟',true],
 ['carton-mixed-fa','مالیات و کارتن هزینه اضافه دارد؟',false],
 ['carton-plural-ar','كراتين النقل بيها كلفة إضافية؟',false],
 ['carton-variant-fa','کارتون ارسال هزینه اضافه دارد؟',false],
 ['shipping-fa','هزینه ارسال اضافه است؟',false],
 ['shipping-ar','أجور النقل عليها رسوم إضافية؟',false],
 ];
 for(const [id,q,want]of cases)check(id,extra(q),want,{question:q});
 check('money-request-gate-IRAN',guidance.approvedGuidanceRequest('قیمت با ارسال چقدر است؟')===null,true);
 check('money-request-gate-ARAB',guidance.approvedGuidanceRequest('شكد أجور الشحن؟')===null,true);
 check('existing-order-gate',guidance.approvedGuidanceRequest('سفارشم کی میرسه؟')===null,true);
}

if(!process.argv.includes('--baseline')){
 for(const market of ['IRAN','ARAB']){
  const policy=market==='IRAN'?'طلاکوب سفارشی روی خود روبان هزینه جدا دارد؛ مبلغ دقیق در اختیارم نیست.':'الطباعة الذهبية المخصصة على الشريط لها كلفة منفصلة؛ المبلغ الدقيق غير متوفر عندي.';
  const row={id:'isolated-ribbon-'+market,domain:'knowledge',attribute:'order_custom_ribbon_printing',market,entity_key:'global',status:'active',authority:'owner_approved',version:1,value_json:JSON.stringify({schema:'hamzehi.knowledge.v1',kind:'fact',priority:50,conditions:[],commercial:true,value:policy})};
  const request={kind:'information',topics:['ribbon_printing']},select=rs=>guidance.selectApprovedGuidance(rs,{market,request});
  check('ribbon-policy-exact-'+market,select([row])?.text===policy,true);
  for(const [key,delta]of [['inactive',{status:'inactive'}],['unapproved',{authority:'unapproved'}],['wrong-market',{market:market==='IRAN'?'ARAB':'IRAN'}],['expired',{effective_until:'2020-01-01T00:00:00Z'}]])check('ribbon-policy-'+key+'-'+market,select([{...row,...delta}])===null,true);
  check('ribbon-policy-missing-'+market,select([])===null,true);
  check('ribbon-policy-conflict-'+market,select([row,{...row,id:'other'}])===null,true);
  for(const [key,change]of [['conditions',{conditions:[{field:'quantity',op:'>=',value:1000}]}],['relation',{relation:{name:'alias',members:{a:'a',b:'b'}}}],['effect',{effect:{refund:true}}],['not-commercial',{commercial:false}]]){
   const env={schema:'hamzehi.knowledge.v1',kind:'fact',conditions:[],commercial:true,value:policy,...change};
   check('ribbon-policy-envelope-'+key+'-'+market,select([{...row,value_json:JSON.stringify(env)}])===null,true);
  }
  for(const [key,suffix]of [['written-fa',' اجرت آن بیست است.'],['written-ar',' أجورها عشرون.'],['numeric',' 50000'],['bank',' شماره کارت 1111222233334444'],['discount',' تخفیف دارد.'],['free',' رایگان است.'],['payment',' پرداخت تأیید شده است.']]){
   const env={schema:'hamzehi.knowledge.v1',kind:'fact',conditions:[],commercial:true,value:policy+suffix};
   check('ribbon-policy-denies-'+key+'-'+market,select([{...row,value_json:JSON.stringify(env)}])===null,true);
  }
 }
}

const baseline=process.argv.includes('--baseline');
const six=tests.filter(t=>/^RUNTIME-|^shipping-guidance-after-/.test(t.id));
if(!baseline){check('six-original-cases-present',six.length,6);check('six-original-ids-unique',new Set(six.map(t=>t.id)).size,6);}
const result={mode:baseline?'BASELINE':'PATCHED',source_head:'5e0449f31c05e8884dbd87d086650dc64f06ffe5',fixture_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(phase50,'evidence/phase50-isolated-tests.json'))).digest('hex'),six_original_cases:six,tests,pass:tests.filter(t=>t.status==='PASS').length,fail:tests.filter(t=>t.status==='FAIL').length,no_network_calls:true,no_production_writes:true};
console.log(JSON.stringify(result,null,2));
if(baseline)process.exitCode=six.length===6&&six.every(t=>t.status==='FAIL')?0:1;
else process.exitCode=result.fail?1:0;
