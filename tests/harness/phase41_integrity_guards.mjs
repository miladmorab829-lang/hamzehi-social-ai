import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {makeWorld,reporter} from './harness.mjs';
import {catalogVariantAnswer,validateReplyParts} from '../../worker/src/sales-reply-integrity.js';
const {validateSalesBrainDraft:validate}=await import(process.env.SRC?pathToFileURL(path.join(process.env.SRC,'index.js')).href:new URL('../../worker/src/index.js',import.meta.url).href);
const {ok,done}=reporter('phase41_integrity_guards');
const catalog=[{key:'service',product:'سرویس',market:'IRAN',complete:true,variants:[{size:'20x20',configuration:'2 تکه'},{size:'20x20',configuration:'3 تکه کج'}]},{key:'half',product:'نیم سرویس',market:'IRAN',complete:true,variants:[{size:'13x16',configuration:'کشویی بگ دار'}]}];
const facts=[{category:'size',market:'IRAN',values:['13x16','20x20','5x5x4','7x9.5']},{category:'availability',market:'IRAN',values:['سرویس','نیم سرویس','2 تکه','3 تکه کج','کشویی بگ دار']},{category:'moq',market:'IRAN',values:['100','500']},{category:'price',market:'IRAN',values:['185000']},{category:'discount',market:'IRAN',values:['10']}];
const opts={authoritativeFacts:facts,allowedNumbers:[2,3,4,5,7,9,13,16,20,100,500,185000],markets:['IRAN'],catalog};
ok('A Persian decimal dimension matches the actual catalog tuple',validate('آویز مدل ۳ تکه سایز ۵x۷٫۵ داریم.',{...opts,authoritativeFacts:[...facts,{category:'size',market:'IRAN',values:['5x7.5']}],catalog:[{key:'pendant',product:'آویز',market:'IRAN',complete:true,variants:[{size:'5x7.5',configuration:'3 تکه'}]}]}).valid);
for(const text of ['سرویس سایز ۲۰x۲۰ نداریم.','سرویس موجود نیست.','سرویس مدل ۳ تکه کج نیست.','سرویس در مدل‌های ۳ تکه و ۳ تکه کج داریم.'])ok('Unsupported catalog denial or list is rejected: '+text,!validate(text,opts).valid,validate(text,opts));
ok('An unrelated negative phrase does not reject an approved model',validate('مشکلی نیست، سرویس سایز ۲۰x۲۰ مدل ۳ تکه کج داریم.',opts).valid);
for(const text of ['سرویس سایز ۲۰×۲۰ مدل ۳ تکه کج داریم.','نیم سرویس سایز ١٣x١٦ مدل کشویی بگ دار داریم.','ابعاد ۵x۵x۴ است.','ابعاد ۷x۹٫۵ است.'])ok('Supported specification: '+text,validate(text,opts).valid,validate(text,opts));
for(const text of ['حداقل سفارش ۱۳ عدد است.','حداقل سفارش ۱۶ عدد است.','حداقل سفارش ۳ قطعه است.','حداقل سفارش ما ۳ قطعه است.','قیمت ۵۰۰ تومان است.','تخفیف ۱۰۰ درصد است.','قیمت 13x16 تومان است.','حداقل 13x16 عدد است.','تحویل 13x16 روز است.','سرویس سایز ۱۳×۱۶ داریم.','سرویس سایز ۲۰×۲۰ مدل کشویی بگ دار داریم.','سرویس مدل ۳ تکه داریم.','سرویس مدل ۳ تکه کج نداریم.'])ok('Reject role or tuple mismatch: '+text,!validate(text,opts).valid,validate(text,opts));
ok('A different market cannot authorize a size',!validate('سایز 13x16 است.',{...opts,catalog:[],markets:['ARAB']}).valid);
const exact={text:'قیمت ۱۸۵۰۰۰ تومان است.',facts:[facts[3]],kind:'commercial'};
ok('Prose and price segment remain independently grounded',validateReplyParts('نیم سرویس سایز 13x16 است. '+exact.text,[exact],validate,opts).valid);
ok('Changing an exact commercial part fails closed',!validateReplyParts('قیمت ۵۰۰ تومان است.',[exact],validate,opts).valid);
ok('Duplicating a commercial part fails closed',!validateReplyParts(exact.text+' '+exact.text,[exact],validate,opts).valid);
const query={catalog,key:'service',size:'20x20',structure:'کشویی بگ دار',message:'',language:'Persian'};
ok('Catalog absence is accurately scoped, not an inventory claim',catalogVariantAnswer(query)?.text.includes('در فهرست فعلی ثبت نشده'));
ok('An incomplete catalog never proves absence',catalogVariantAnswer({...query,catalog:catalog.map(c=>({...c,complete:false}))})===null);
ok('A model present at another size is not available at this size',!!catalogVariantAnswer({...query,catalog:[{...catalog[0],variants:[...catalog[0].variants,{size:'13x16',configuration:'کشویی بگ دار'}]},catalog[1]]}));
ok('An unknown requested structure never becomes a denial',catalogVariantAnswer({...query,structure:'مدل خیالی'})===null);
ok('Two mentioned models are not resolved by longest spelling',catalogVariantAnswer({...query,structure:null,message:'کشویی بگ دار می‌خواستم ولی حالا 3 تکه کج می‌خوام'})===null);

const W=await makeWorld({aiBrain:'on',extraEnv:{PUBLIC_WORKER_BASE_URL:'https://w.test',AUTONOMY_ORCHESTRATOR:'on'}});
W.d1.db.exec(fs.readFileSync(new URL('../../owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql',import.meta.url),'utf8'));
for(const p of ['/api/quotes','/api/si/knowledge/product','/api/owner-escalations','/api/leads/outreach','/api/content/pipeline'])await W.call(p,null,'GET');await W.call('/api/sales-ai-first',{mode:'on'});
const data=JSON.parse(fs.readFileSync(new URL('./fixtures/phase41-catalog.json',import.meta.url),'utf8'));
for(const [table,rows] of [['commercial_price_items',data.items],['business_settings',data.settings]])for(const row of rows){const k=Object.keys(row);W.dbrun(`INSERT INTO ${table}(${k.join(',')}) VALUES(${k.map(()=>'?').join(',')})`,Object.values(row));}
const original=JSON.parse(fs.readFileSync(new URL('./fixtures/phase41-dialogue.json',import.meta.url),'utf8'));
let seq=884200000;
const fresh=async()=>{const user={id:++seq,name:'TEST',username:'guard'+seq};await W.send(user,'سلام');W.setMarket(user,'iran');return user;};
// Explicit final-provider stub for protected commercial parts. Adversarial prose
// without such a part is returned unchanged and must still be rejected by runtime gates.
const turn=async(user,message,decision)=>{W.AI.script.set(message,c=>{const entry=c.catalog.find(p=>p.key===c.state?.current_product?.key)||c.catalog[0],model=entry?.models?.[0];return {...structuredClone(decision),...(c.authoring?.required_parts.length?{reply:`${entry.product} مدل ${model} در فهرست موجود است.\n`+c.authoring.required_parts.join('\n')}:{})};});const k=W.tg.length,r=await W.send(user,message),sent=W.tg.slice(k).filter(x=>x.method==='sendMessage').map(x=>JSON.parse(x.body)).filter(x=>String(x.chat_id)===String(user.id)).map(x=>x.text).join('\n');return {r,sent};};
const detail=x=>({sent:x.sent,action:x.r.action,outcome:x.r.outcome,validation:x.r.brain?.validation,fallback:x.r.brain?.ai_brain?.fallback});
for(const punctuation of [' ','. ','، ','\n']){
 const u=await fresh(),decision=structuredClone(original[2].decision);decision.reply='نیم سرویس ۲ تکه سایز ۱۳x۱۶'+punctuation+'{{COMMERCIAL}}';
 const x=await turn(u,'نیم سرویس دوتکه معمولی چنده؟',decision);
 ok('Composition is punctuation-independent '+JSON.stringify(punctuation),x.r.outcome?.customer_visible==='reply'&&x.sent.includes('۱۱۰٬۰۰۰')&&x.r.brain?.commercial_evidence?.requirements?.configuration==='2 تکه',detail(x));
}
for(const bad of ['سرویس سایز ۱۳×۱۶ داریم.','سرویس سایز ۲۰×۲۰ مدل کشویی بگ دار داریم.','سرویس مدل ۳ تکه کج نداریم.']){
 const u=await fresh(),decision=structuredClone(original[6].decision);decision.interpretation.reference='none';decision.reply=bad;
 const x=await turn(u,'درباره جعبه سرویس توضیح بده',decision);
 ok('Unsupported catalog claim never reaches Telegram and opens owner review: '+bad,!x.sent&&x.r.brain?.needs_owner===true&&!!W.q("SELECT id FROM owner_escalations WHERE source_message_id=? AND status='open'",[x.r.row.id])[0],detail(x));
}
{
 const u=await fresh(),decision=structuredClone(original[7].decision);decision.interpretation.reference='none';decision.reply='مشکلی نیست، تصویر لوگو را همین‌جا بفرستید. نه، سرویس ۲۰x۲۰ مدل کشویی روبان‌دار نداره. رنگ رو از سایت انتخاب کنید.';
 const x=await turn(u,'سرویس ۲۰x۲۰ کشویی روبان دار دارید؟ لوگو رو همینجا بفرستم؟',decision);
 ok('An unverified mixed denial is reauthored or escalated as a whole',x.sent.includes('تصویر لوگو را همین‌جا بفرستید')&&x.sent.includes('در فهرست فعلی ثبت نشده')&&x.sent.includes('رنگ رو از سایت انتخاب کنید')||!x.sent&&x.r.brain?.needs_owner===true&&!!W.q("SELECT id FROM owner_escalations WHERE source_message_id=? AND status='open'",[x.r.row.id])[0],detail(x));
}
for(const failure of ['price','version','currency','size','read']){
 const u=await fresh(),decision=structuredClone(original[2].decision),prepare=W.env.DB.prepare.bind(W.env.DB);let injected=false;
 W.env.DB.prepare=sql=>{const stmt=prepare(sql),bind=stmt.bind.bind(stmt);stmt.bind=(...args)=>{const bound=bind(...args);if(sql==='SELECT * FROM commercial_price_items WHERE market=? AND active=1'){const all=bound.all.bind(bound);bound.all=async()=>{const result=await all(),ready=W.q("SELECT 1 FROM system_events WHERE type='sales_brain_decision' AND json_extract(details_json,'$.lead_id')=?",[W.q('SELECT lead_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1',[String(u.id)])[0]?.lead_id]).length>1;if(ready){injected=true;if(failure==='read')throw Error('fixture read failure');for(const row of result.results)if(row.id==='684056c3-f9d4-4b80-8333-8eab59d234b5'){if(failure==='price')row.unit_price_minor+=1;if(failure==='version')row.version+=1;if(failure==='currency')row.currency='USD';if(failure==='size')row.product_name=row.product_name.replace('13x16','13x17');}}return result;};}return bound;};return stmt;};
 const x=await turn(u,'نیم سرویس دوتکه معمولی چنده؟',decision);W.env.DB.prepare=prepare;
 ok('Evidence changing at final send gate is held: '+failure,injected&&x.r.outcome?.reason==='commercial_evidence_changed'&&!x.sent.includes('۱۱۰٬۰۰۰')&&!x.sent.includes('منظورتون رو کامل نگرفتم'),detail(x));
}
ok('Adversarial turns do not create orders or payment records',W.q('SELECT count(*) n FROM lead_orders')[0].n===0&&W.q('SELECT count(*) n FROM lead_order_payments')[0].n===0);
ok('No real external calls',W.offNet().length===0,W.offNet());
process.exitCode=done()?1:0;
