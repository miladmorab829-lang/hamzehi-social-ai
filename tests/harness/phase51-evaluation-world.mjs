// Local data fixture shared by targeted engineering tests and the bounded provider pilot.
// This never calls a production Worker, D1 database, or real Telegram endpoint.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {makeWorld} from './harness.mjs';
const read=file=>JSON.parse(fs.readFileSync(new URL(file,import.meta.url),'utf8').replace(/^\uFEFF/,''));
export const QUESTIONS={
 faA:'برای بسته بندی عطر دنبال جعبه شیکم، چه مدلی پیشنهاد میکنی و دلیلش چیه؟',
 faB:'برای انگشتری جعبه کشویی بگ دار بهتره یا کج؟',
 arA:'أدور على علبة مرتّبة لتغليف عطر، شنو الموديل اللي تنصحني بيه وليش؟',
 arB:'للمحابس، العلبة الجرّارة ويا كيس أحسن لو الجرّارة المائلة؟',
 faMemory:'همین دو مدل رو دوباره از نظر چاپ مقایسه کن؛ فعلاً سفارش نمی‌دم.',
 arMemory:'عيدلي الفرق بين هالموديلين من ناحية الطباعة، هسه ما أريد أطلب.'
};
export const REFERENCES={
 faA:'برای ظاهر و چاپ دلخواه، پیشنهاد اولیه‌ام کشویی بگ‌داره؛ روی درب و بدنهٔ میانی طلاکوب، نقره‌کوب یا مشکی‌کوب و روی بگ بیرونی طرح یا پترن چاپ می‌شه. مناسب بودن اندازه‌اش برای شیشهٔ عطرتون هنوز مشخص نیست؛ طول، عرض و ارتفاع شیشه چقدره؟',
 faB:'اگه امکان چاپ طرح دلخواه براتون مهمه، از بین این دو کشویی بگ‌دار رو پیشنهاد می‌کنم؛ علاوه بر درب و بدنهٔ میانی، روی بگ بیرونی هم می‌شه طرح چاپ کرد. دربارهٔ جزئیات کشویی کج اطلاعات کافی ندارم که بازشدن یا استحکام این دو رو مقایسه کنم.',
 arA:'من ناحية الطباعة، اقتراحي الأول الجرّارة ويا كيس؛ تگدر تختار طباعة ذهبية أو فضية أو سوداء على الغطاء والجسم الأوسط، وتصميم على الكيس الخارجي. بس بعدنا مو متأكدين إن قياسها يناسب قنينة عطرك؛ شكد طولها وعرضها وارتفاعها؟',
 arB:'إذا تهمك الطباعة والتصميم، أنصحك بالجرّارة ويا كيس؛ تگدر تختار طباعة ذهبية أو فضية أو سوداء على الغطاء والجسم الأوسط، وتطبع تصميم على الكيس الخارجي. أمّا الجرّارة المائلة، ما عندي تفاصيل كافية حتى أقارن طريقة الفتح أو المتانة بين الموديلين.',
 faMemory:'از نظر چاپ، برای کشویی بگ‌دار طلاکوب، نقره‌کوب یا مشکی‌کوب روی درب و بدنهٔ میانی و چاپ طرح روی بگ بیرونی تأیید شده. دربارهٔ امکانات چاپ کشویی کج اطلاعات تأییدشدهٔ کافی ندارم که تفاوت دقیق این دو رو بگم.',
 arMemory:'من ناحية الطباعة، المؤكد للجرّارة ويا كيس هو الطباعة الذهبية أو الفضية أو السوداء على الغطاء والجسم الأوسط، وطباعة تصميم على الكيس الخارجي. أمّا إمكانيات الطباعة بالجرّارة المائلة، ما عندي عنها معلومات مؤكدة كافية حتى أوضح الفرق بدقّة.'
};
export async function evaluationWorld({timeoutMs=1000}={}){
 const W=await makeWorld({aiBrain:'on',extraEnv:{PUBLIC_WORKER_BASE_URL:'https://w.test',SALES_AI_EFFORT:'medium',SALES_AI_TIMEOUT_MS:String(timeoutMs)}});
 for(const endpoint of ['/api/quotes','/api/si/knowledge/product','/api/owner-escalations','/api/leads/outreach'])await W.call(endpoint,null,'GET');
 await W.call('/api/sales-ai-first',{mode:'on'});
 const catalog=read('./fixtures/phase41-catalog.json');
 for(const [table,rows]of [['commercial_price_items',[...catalog.items,...read('./fixtures/phase44-approved-iraq-rows.json')]],['business_settings',catalog.settings]])for(const row of rows){const keys=Object.keys(row);W.dbrun(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?')})`,Object.values(row));}
 for(const row of read('./fixtures/phase47-approved-knowledge.json')){
  const value=JSON.parse(row.value_json);
  const result=await W.call('/api/sales-knowledge/teach',{market:row.market,records:[{...value,operation:'ADD',typed:null,entity:{type:row.entity_key==='global'?'business':'product',key:row.entity_key},concept:row.attribute}]});
  if(!result.body.ok)throw Error('Approved knowledge fixture rejected');
  for(const request of W.q("SELECT id FROM sales_knowledge_change_requests WHERE status NOT IN ('applied','rejected')"))await W.approveK(request.id);
 }
 // Only the two approved typed O11 fixture records, not the 22-operation import package.
 for(const request of read('../../reports/phase50d/PHASE50D-IMPORT-PACKAGE.json').batches.flatMap(batch=>batch.requests).filter(request=>request.payload.domain==='optional_service')){
  const result=await W.call('/api/sales-knowledge/propose',request.payload);if(!result.body.ok)throw Error('O11 fixture rejected');await W.approveK(request.payload.id);
 }
 let id=9515100;
 const client=async(market='IRAN')=>{const user={id:++id,name:'Isolated51',username:'isolated51'+id};await W.send(user,market==='IRAN'?'سلام':'هلا');W.setMarket(user,market==='IRAN'?'iran':'iraq');return user;};
 // Explicit persisted fixture of an older, verified jewellery deal. The next
 // perfume turn must discard its quantity/selection in the actual Worker path.
 const seedJewelleryMemory=user=>{
  const source=W.q('SELECT * FROM inbox_messages WHERE provider_sender_id=? ORDER BY created_at DESC LIMIT 1',[String(user.id)])[0],market=W.q('SELECT market FROM conversation_sales_state WHERE conversation_id=?',[source.conversation_id])[0]?.market||((W.q('SELECT notes FROM leads WHERE id=?',[source.lead_id])[0]?.notes||'').includes('Iraq')?'ARAB':'IRAN');
  const p=W.q("SELECT * FROM commercial_price_items WHERE market=? AND (product_name LIKE '%انگشتر%' OR product_name LIKE '%خاتم%') ORDER BY id LIMIT 1",[market])[0],parts=p.product_name.split(' · '),productKey='seeded-jewellery:'+p.product_key,t=new Date().toISOString();
  const facts={product_interest:parts[0],requested_quantity:1000,requested_size:parts[1],printing:'seeded prior printing',selected_colors:['seeded prior colour'],order_candidate:{started_at:source.created_at,product:{key:productKey,name:parts[0],source:'list',confidence:'HIGH'},quantity:1000,market,size:parts[1],structure:parts[2],status:'quoted'}};
  for(const [key,value]of Object.entries(facts)){
   W.dbrun("UPDATE conversation_memory_facts SET status='superseded' WHERE conversation_id=? AND memory_key=? AND status='active'",[source.conversation_id,key]);
   const json=JSON.stringify(value);W.dbrun("INSERT INTO conversation_memory_facts(id,lead_id,conversation_id,memory_key,fact_type,value_json,value_hash,source_message_id,status,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'active',1,?,?)",['seed51-'+user.id+'-'+key,source.lead_id,source.conversation_id,key,key,json,createHash('sha256').update(json).digest('hex'),source.id,t,t]);
  }
  const brain=W.brain(source.id);brain.turn_policy={...(brain.turn_policy||{}),quantity_source:{source_message_id:source.id,value:1000,role:'order_count',verified:true,market,product_key:productKey}};
  W.dbrun('UPDATE system_events SET details_json=? WHERE id=?',[JSON.stringify(brain),'sales-brain:'+source.id]);
  return {market,product:parts[0],quantity:1000};
 };
 const decision=(reply,{repeat=false}={})=>W.D({reply,requests:['product_info'],interpretation:{primary_intent:'product_info',product_key:null,reference:'none',requested_size:null,requested_color:[],requested_structure:null,requested_printing:null,quantity:null,ambiguity:'none',confidence:'high'},semantics:{mode:'browse',quantity_role:'none',deal_reference:'none',repeat_requested:repeat},facts:{color_statement:'none',negated_colors:[]}});
 const sent=(user,start=0)=>W.tg.slice(start).filter(row=>row.method==='sendMessage').map(row=>JSON.parse(row.body)).filter(row=>String(row.chat_id)===String(user.id)).map(row=>row.text);
 return {W,client,decision,sent,seedJewelleryMemory};
}
