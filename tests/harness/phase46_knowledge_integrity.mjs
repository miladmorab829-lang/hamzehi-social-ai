import {makeWorld,reporter} from './harness.mjs';
const {ok,done}=reporter('phase46_knowledge_integrity');
const W=await makeWorld({aiBrain:'on',extraEnv:{PUBLIC_WORKER_BASE_URL:'https://w.test'}});
for(const p of ['/api/quotes','/api/si/knowledge/product','/api/owner-escalations','/api/leads/outreach'])await W.call(p,null,'GET');
await W.call('/api/sales-ai-first',{mode:'on'});
const record=(key,concept,value,extra={})=>({operation:'ADD',kind:'fact',typed:null,entity:{type:'product',key},concept,value,keywords:['تفاوت','سایز'],labels:{},conditions:[],effect:null,relation:null,...extra});
const teach=async records=>{const r=await W.call('/api/sales-knowledge/teach',{market:'IRAN',records});if(r.status!==200)throw Error('fixture failed');for(const p of W.q("SELECT id FROM sales_knowledge_change_requests WHERE status NOT IN ('applied','rejected')"))await W.approveK(p.id);};
await teach([record('جعبه آلفا','material','روکش آلفا کاغذی است.'),record('جعبه بتا','material','روکش بتا مخملی است.'),record('جعبه بتا','available_sizes','12x12',{kind:'availability',conditions:[{field:'material',op:'=',value:'مخمل'}]})]);
let uid=903100000;
const decision=reply=>({reply,requests:['product_info'],interpretation:{primary_intent:'product_info',product_key:null,reference:'none',requested_size:null,requested_color:[],requested_structure:null,requested_printing:null,quantity:null,ambiguity:'none',confidence:'high'},semantics:{mode:'browse',quantity_role:'none',deal_reference:'none',repeat_requested:false}});
const user=async()=>{const u={id:++uid,name:'Integrity',username:'integrity'+uid};await W.send(u,'سلام');W.setMarket(u,'iran');return u;};
const out=u=>W.tg.filter(t=>t.method==='sendMessage').map(t=>JSON.parse(t.body)).filter(t=>String(t.chat_id)===String(u.id)).map(t=>t.text);
{
 const u=await user(),q='تفاوت جعبه آلفا با جعبه بتا چیست؟';let ctx;W.AI.script.set(q,c=>{ctx=c;return decision('جعبه بتا سایز 12x12 موجود است.');});const n=out(u).length,r=await W.send(u,q);
 const condition=ctx.knowledge.find(k=>k.about==='جعبه بتا'&&k.topic==='available_sizes');
 ok('Comparison supplies complete conditional rule, including its condition',condition&&JSON.parse(condition.value).when[0].value==='مخمل',condition);
 ok('Conditional comparison values are never lent as unconditional validator evidence',!(r.brain?.knowledge_answer_facts||[]).some(f=>JSON.stringify(f.values||[]).includes('12x12')),r.brain?.knowledge_answer_facts);
 ok('Conditional availability cannot authorize the injected unconditional claim',!out(u).slice(n).some(s=>s.includes('12x12 موجود است.')),[r.brain?.ai_brain?.fallback,out(u).slice(n)]);
}
{
 const u=await user(),q='درباره تفاوت روکش جعبه آلفا و جعبه بتا توضیح بده';const id=W.q("SELECT id FROM sales_knowledge_facts WHERE entity_key='جعبه بتا' AND attribute='material' AND status='active'")[0].id;let changed=false;
 W.AI.script.set(q,()=>{W.dbrun("UPDATE sales_knowledge_facts SET status='superseded' WHERE id=?",[id]);changed=true;return decision('روکش آلفا کاغذی است و روکش بتا مخملی است.');});
 const n=out(u).length,r=await W.send(u,q);
 ok('Model succeeded before a concurrent knowledge revision change was checked',changed&&r.brain?.ai_brain?.provider_succeeded===true);
 ok('A fact superseded during the model call prevents stale automatic delivery',r.outcome?.reason==='ai_knowledge_changed'&&!out(u).slice(n).some(s=>s.includes('روکش بتا مخملی است.')),[r.outcome,out(u).slice(n)]);
}
ok('No real outbound calls',W.offNet().length===0);
process.exit(done()?1:0);
