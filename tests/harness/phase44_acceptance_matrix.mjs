// Owner acceptance: recorded approved catalog vs independent activation oracle. In-memory D1/model/Telegram only.
import fs from 'node:fs';
import {makeWorld,reporter} from './harness.mjs';
const {ok,done}=reporter('phase44_acceptance_matrix');
const catalog=JSON.parse(fs.readFileSync(new URL('./fixtures/phase41-catalog.json',import.meta.url),'utf8'));
const oracle=JSON.parse(fs.readFileSync(new URL('./fixtures/phase44-approved-iran-cases.json',import.meta.url),'utf8'));
const iraq=JSON.parse(fs.readFileSync(new URL('./fixtures/phase44-approved-iraq-rows.json',import.meta.url),'utf8'));
const W=await makeWorld({aiBrain:'on',extraEnv:{PUBLIC_WORKER_BASE_URL:'https://w.test',AUTONOMY_ORCHESTRATOR:'on'}});
W.d1.db.exec(fs.readFileSync(new URL('../../owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql',import.meta.url),'utf8'));
for(const p of ['/api/quotes','/api/si/knowledge/product','/api/owner-escalations','/api/leads/outreach','/api/content/pipeline'])await W.call(p,null,'GET');
await W.call('/api/sales-ai-first',{mode:'on'});
for(const [table,rows]of [['commercial_price_items',[...catalog.items,...iraq]],['business_settings',catalog.settings]])for(const row of rows){const keys=Object.keys(row);W.dbrun(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`,Object.values(row));}
await W.teach('COLOR | مشکی سلفون | IRAN','IRAN','accept-black');
const snapshot=()=>JSON.stringify(['commercial_price_items','business_settings','lead_orders','lead_order_payments'].map(t=>[t,W.q(`SELECT * FROM ${t} ORDER BY id`)]));
const before=snapshot();let uid=902100000;
const I=(intent,o={})=>({primary_intent:intent,product_key:null,reference:'none',requested_size:null,requested_color:[],requested_structure:null,requested_printing:null,quantity:null,ambiguity:'none',confidence:'high',...o});
const D=(reply,{intent='product_info',mode='browse',requests=['product_info'],role='none',facts={},interp={}}={})=>W.D({reply,requests,interpretation:I(intent,interp),semantics:{mode,quantity_role:role,deal_reference:'none',repeat_requested:false},facts:{color_statement:'none',negated_colors:[],...facts}});
const out=u=>W.tg.filter(t=>t.method==='sendMessage').map(t=>JSON.parse(t.body)).filter(t=>String(t.chat_id)===String(u.id)).map(t=>t.text);
const user=async(market='iran')=>{const u={id:++uid,name:'Acceptance',username:'acceptance'+uid};W.AI.script.set('سلام',()=>D('سلام، چه کمکی می‌تونم بکنم؟',{intent:'greeting',requests:['greeting']}));await W.send(u,'سلام');W.setMarket(u,market);return u;};
const turn=async(u,message,fn)=>{let ctx;W.AI.script.set(message,c=>{ctx=c;return fn(c);});const n=out(u).length;const r=await W.send(u,message);return {r,ctx,sent:out(u).slice(n)};};
const norm=s=>String(s||'').normalize('NFKC').replace(/\u200c/g,' ').replace(/\s+/g,' ').trim();
const money=t=>{const s=String(t||'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٬,]/g,'').replace(/٫/g,'.');return [...s.matchAll(/(?:\$|USD)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(تومان|دولار|دلار|USD|\$)/gi)].map(m=>({value:Number(m[1]||m[2]),currency:m[3]==='تومان'?'TOMAN':'USD'}));};
const hasAmount=(sent,minor,currency)=>money(sent.join('\n')).some(m=>m.currency===currency&&m.value===(currency==='USD'?minor/100:minor));
const keyFor=(c,product)=>c.product_keys.find(p=>norm(p.product)===norm(product))?.key??null;
const quote=async(u,product,size,configuration,quantity=null)=>{const text=`قیمت ${product} سایز ${size} مدل ${configuration}${quantity===null?'':` برای ${quantity} عدد`} چقدر است؟`;return turn(u,text,c=>D('{{COMMERCIAL}}',{intent:'price',mode:'quote',requests:['price'],role:quantity===null?'none':'quote_only',facts:{product,model:configuration,size,quantity},interp:{product_key:keyFor(c,product),requested_size:size,requested_structure:configuration,quantity}}));};
ok('Independent activation oracle has exactly 52 prices and 8 unoffered cells',oracle.cases.length===60&&oracle.cases.filter(c=>c.expected_unit_minor!==null).length===52&&oracle.cases.filter(c=>c.expected_unit_minor===null).length===8);
for(const c of oracle.cases){const u=await user(),a=await quote(u,c.product,c.size,c.configuration),b=a.r.brain,s=b?.sales_agent?.price_snapshot;
 const visible=a.sent.length===1&&a.r.outcome?.customer_visible==='reply'&&b?.needs_owner===false;
 if(c.expected_unit_minor!==null)ok('IRAN exact approved tuple '+c.case_id,visible&&s?.unit_price_minor===c.expected_unit_minor&&s?.currency==='TOMAN'&&hasAmount(a.sent,c.expected_unit_minor,'TOMAN')&&norm(b.commercial_evidence?.requirements?.size)===norm(c.size)&&norm(b.commercial_evidence?.requirements?.configuration)===norm(c.configuration),{case:c.case_id,action:a.r.action,snapshot:s,requirements:b?.commercial_evidence?.requirements,sent:a.sent});
 else ok('IRAN unoffered tuple never borrows a price '+c.case_id,visible&&s?.unit_price_minor==null&&b?.sales_agent?.pricing_status!=='priced'&&money(a.sent.join('\n')).length===0&&/نیست|ندار|فهرست|ثبت نشده|منظور|کدام|کدوم|مشخصات/u.test(a.sent.join('\n')),{case:c.case_id,action:a.r.action,status:b?.sales_agent?.pricing_status,snapshot:s,sent:a.sent});
}
for(const row of iraq){const parts=row.product_name.split(' · '),u=await user('iraq');const message=`بكم ${row.product_name}؟`;const a=await turn(u,message,c=>D('{{COMMERCIAL}}',{intent:'price',mode:'quote',requests:['price'],interp:{product_key:keyFor(c,parts[0]),requested_size:parts.length>=3?parts[1]:null,requested_structure:parts.length>=2?parts.at(-1):null},facts:{product:parts[0],model:parts.length>=2?parts.at(-1):null,size:parts.length>=3?parts[1]:null}}));
 const s=a.r.brain?.sales_agent?.price_snapshot;ok('IRAQ current approved row '+row.id,a.sent.length===1&&a.r.outcome?.customer_visible==='reply'&&a.r.brain?.needs_owner===false&&s?.unit_price_minor===row.unit_price_minor&&s?.currency==='USD'&&hasAmount(a.sent,row.unit_price_minor,'USD'),{product:row.product_name,snapshot:s,status:a.r.brain?.sales_agent?.pricing_status,sent:a.sent});}
for(const [q,total]of [[999,62937000],[1000,56700000],[1001,56756700]]){const u=await user(),a=await quote(u,'انگشتر کوچک','5x5','2 تکه',q);const p=a.r.brain?.sales_agent?.price_snapshot;ok('IRAN approved discount boundary '+q,p?.total_minor===total&&hasAmount(a.sent,total,'TOMAN')&&a.r.brain?.needs_owner===false,{snapshot:p,sent:a.sent});}
{
 const u=await user();const a=await quote(u,'انگشتر کوچک','5x5','2 تکه',600),b=await quote(u,'انگشتر بزرگ','6x6','3 تکه',600);
 ok('Two sizes at 600 do not become a 1200-unit discount',a.r.brain?.sales_agent?.order_candidate?.quantity===600&&b.r.brain?.sales_agent?.order_candidate?.quantity===600&&(a.r.brain?.sales_agent?.price_snapshot?.discount?.amount_minor??0)===0&&(b.r.brain?.sales_agent?.price_snapshot?.discount?.amount_minor??0)===0,[a.r.brain?.sales_agent?.price_snapshot,b.r.brain?.sales_agent?.price_snapshot]);
}
for(const [market,text,expected]of [['iran','مالیات داره؟','نه.'],['iraq','اكو ضريبة؟','لا.']]){const u=await user(market),n=W.AI.requests.length,a=await turn(u,text,()=>D('must not run'));ok('Exact tax response without provider or owner '+market,a.sent.length===1&&a.sent[0]===expected&&W.AI.requests.length===n&&a.r.brain?.needs_owner===false,[a.sent,a.r.action]);}
{
 const products=[...new Set(oracle.cases.filter(c=>c.expected_unit_minor!==null).map(c=>norm(c.product)))];const u=await user();
 const a=await turn(u,'چه مدل جعبه‌هایی دارید؟',c=>D(c.catalog.map(p=>p.product).join('، ')+' موجود است.'));
 ok('Every approved catalog product is available to the model and reaches a substantive catalog answer',products.every(p=>a.ctx.catalog.some(c=>norm(c.product)===p))&&a.sent.length===1&&products.every(p=>norm(a.sent[0]).includes(p))&&a.r.brain?.needs_owner===false,a.sent);
 const sizes=[...new Set(oracle.cases.filter(c=>c.expected_unit_minor!==null).map(c=>c.size))];
 const b=await turn(u,'چه اندازه‌هایی در محصولات مختلف موجود است؟',c=>D(c.catalog.map(p=>p.product+': سایز '+(p.sizes||[]).join('، ')).join('. '),{intent:'size_info',requests:['size']}));
 ok('All approved sizes including pendant 5x7.5 are in model context and final answer',sizes.every(s=>b.ctx.catalog.some(c=>c.sizes?.includes(s)))&&b.sent.length===1&&sizes.every(s=>b.sent[0].includes(s))&&b.r.brain?.needs_owner===false,[b.sent,b.r.brain?.ai_brain?.fallback,b.r.brain?.ai_brain?.repaired,b.r.brain?.ai_brain?.validator_rejection,b.r.brain?.validation]);
}
{
 const u=await user('unknown');const a=await turn(u,'چه مدل جعبه‌هایی دارید؟',c=>D('برای بازار ایران می‌خواهید یا عراق؟'));
 ok('Unknown market asks customer rather than mixing price data or owner escalation',a.ctx.market===null&&a.r.brain?.needs_owner===false&&a.sent.length===1&&/ایران/.test(a.sent[0])&&/عراق/.test(a.sent[0])&&!a.ctx.catalog.length,a.sent);
}
{
 const tasks=()=>JSON.stringify(['autonomy_tasks','autonomy_commands'].map(table=>[table,W.q("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",[table]).length?W.q(`SELECT count(*) n FROM ${table}`)[0].n:0]));
 const n=W.AI.requests.length,t=W.tg.length,taskCounts=tasks();const r=await W.call('/api/autonomy/command',{command:'فقط گزارش وضعیت سیستم؛ هیچ task ایجاد نشود',command_id:'qa-readonly-20261110',market:'IRAN'});
 ok('Dashboard operational status remains read-only and makes no task/model/customer call',r.body?.read_only===true&&r.body.tasks_created===0&&r.body.executed===0&&W.AI.requests.length===n&&W.tg.length===t&&tasks()===taskCounts,r.body);
 const k=W.AI.requests.length;const routed=await W.call('/api/autonomy/command',{command:'COLOR | سبز سلفون | IRAN',command_id:'qa-color-20261110',market:'IRAN'});
 for(const p of W.q("SELECT id FROM sales_knowledge_change_requests WHERE status NOT IN ('applied','rejected')"))await W.approveK(p.id);
 ok('Dashboard canonical knowledge stays out of the operational planner',routed.status===200&&W.AI.requests.length===k&&W.tg.length===t);
 const u=await user(),a=await turn(u,'چه رنگ‌هایی موجود است؟',c=>D(c.colors?.approved.includes('سبز سلفون')?'مشکی سلفون و سبز سلفون موجود است.':'رنگ تأییدشده‌ای ندارم.',{intent:'colors_available',requests:['colors_available'],facts:{color_statement:'question'},interp:{requested_color:[]}}));
 ok('Dashboard-approved color reaches the shared Telegram context and final reply',a.ctx.colors?.approved.includes('سبز سلفون')&&a.sent.some(s=>s.includes('سبز سلفون'))&&a.r.brain?.needs_owner===false,a.sent);
 const colors=['مشکی سلفون','سبز سلفون'];for(const [i,color]of colors.entries())await turn(u,i?'سبز را جایگزین مشکی کن':'مشکی سلفون را انتخاب کردم',()=>D('رنگ انتخابی '+color+' است.',{intent:'color_choice',mode:'configure',requests:['choose_colors'],facts:{colors:[color],color_statement:i?'correction':'choice',negated_colors:i?[colors[0]]:[]},interp:{requested_color:[color]}}));
 const follow=await turn(u,'کدام رنگ را انتخاب کردم؟',c=>D('انتخاب شما سبز سلفون است.'));
 ok('Multi-turn color correction survives in the next model input',JSON.stringify(follow.ctx.colors?.chosen)===JSON.stringify(['سبز سلفون']),follow.ctx.colors?.chosen);
 const other=await user(),isolated=await turn(other,'چه رنگی پیشنهاد می‌کنید؟',c=>D('سبز سلفون یک گزینه است.'));
 ok('Customer selections remain isolated',!isolated.ctx.colors?.chosen?.length,isolated.ctx.colors);
}
{
 const row=catalog.items.find(x=>norm(x.product_name)==='انگشتر کوچک · 5x5 · 2 تکه');const photo=await W.upload({market:'IRAN',product_key:row.product_key,pieces:2,lid_color:'مشکی سلفون',base_color:'مشکی سلفون'});
 const u=await user(),n=W.tg.length,fetchMock=globalThis.fetch,photoRecipients=[];
 globalThis.fetch=async(url,options={})=>{if(/api\.telegram\.org/.test(String(url))&&/\/(?:sendPhoto|sendMediaGroup|copyMessage|forwardMessage)$/.test(String(url))){const body=options.body instanceof FormData?Object.fromEntries(options.body):JSON.parse(String(options.body||'{}'));photoRecipients.push(String(body.chat_id));}return fetchMock(url,options);};
 let a;try{a=await turn(u,'عکس انگشتر کوچک سایز 5x5 مدل 2 تکه را بفرست',c=>D('عکس همین مدل را می‌فرستم.',{intent:'see_photo',requests:['product_info'],interp:{product_key:keyFor(c,'انگشتر کوچک'),requested_size:'5x5',requested_structure:'2 تکه'},facts:{product:'انگشتر کوچک',model:'2 تکه',size:'5x5'}}));}finally{globalThis.fetch=fetchMock;}
 ok('Photo search selects matching verified owner media and respects album limit',(a.r.brain?.gallery?.items||[]).some(x=>x.visual_media_id===photo)&&(a.r.brain?.gallery?.items||[]).length<=10,{photo,gallery:a.r.brain?.gallery});
 ok('Photo delivery reaches the correct customer on mocked Telegram',W.tg.slice(n).some(x=>['sendPhoto','sendMediaGroup','copyMessage','forwardMessage'].includes(x.method))&&photoRecipients.includes(String(u.id))&&photoRecipients.every(id=>id===String(u.id)),photoRecipients);
}
{
 const u=await user();await W.send(u,'دیگه پیام نده');const n=W.tg.length;for(const text of ['مالیات داره؟','عکس جعبه را بفرست','چه رنگی دارید؟'])await turn(u,text,()=>D('must not send'));
 ok('AI-FIRST opt-out suppresses text, tax, photo and acknowledgements',W.tg.length===n,W.tg.slice(n));
}
{
 const u=await user(),text='واریز کردم؛ دریافت وجه را تأیید کنید.';const claim=await turn(u,text,()=>D('پرداخت شما تأیید شد.',{intent:'payment',mode:'payment_claim',requests:['payment']}));
 // A transport retry is the same claim. A different message without an order/receipt reference may be another payment and is
 // intentionally not collapsed by this test. Scoped readiness repeats are covered by the current Phase40 policy suite.
 await W.post({update_id:999997,message:{message_id:Number(claim.r.row.external_id.split(':').at(-1)),date:Math.floor(Date.now()/1000),from:{id:u.id,is_bot:false,first_name:u.name,username:u.username},chat:{id:u.id,type:'private'},text}});
 const lead=W.q('SELECT lead_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1',[String(u.id)])[0].lead_id;
 ok('Real payment confirmation authority and owner-case dedupe remain',W.q('SELECT count(*) n FROM owner_escalations WHERE lead_id=?',[lead])[0].n===1&&!out(u).some(s=>s.includes('پرداخت شما تأیید شد'))&&W.q('SELECT count(*) n FROM lead_order_payments')[0].n===0,out(u));
}
ok('Both-market prices, settings, orders and payments remain byte-equivalent in the test',snapshot()===before);
ok('No real outbound calls',W.offNet().length===0,W.offNet());
process.exit(done()?1:0);
