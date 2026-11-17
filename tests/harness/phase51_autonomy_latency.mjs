// Comparable local pipeline timings with a fixed 80ms per scripted provider call.
// Measures time-to-outcome (delivery OR owned review), never real model latency.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {evaluationWorld,QUESTIONS,REFERENCES} from './phase51-evaluation-world.mjs';
import {reporter} from './harness.mjs';
const report=reporter('phase51_autonomy_latency'),assertions=[],samples=[];
const ok=(label,pass,detail)=>{assertions.push({label,pass:!!pass,...(!pass?{detail}:{})});report.ok(label,pass,detail);};
const baseline=process.env.PHASE51_AUTONOMY_BASELINE==='1';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/phase51-live-abadan-aa2889f0.json',import.meta.url),'utf8'));
const {W,client,decision,sent}=await evaluationWorld();
const fact=fixture.approved_shipping,t=new Date().toISOString();
W.dbrun("INSERT INTO sales_knowledge_facts(id,fact_key,domain,entity_type,entity_key,attribute,market,member_key,value_json,value_hash,version,status,authority,source_type,change_request_id,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[fact.id,'latency-local-'+fact.id,fact.domain,'business',fact.entity_key,fact.attribute,fact.market,'',fact.value_json,createHash('sha256').update(fact.value_json).digest('hex'),fact.version,fact.status,fact.authority,'local_only','latency-local-request','fixture-owner',t,t,t]);
const scenarios=[
 {key:'verified shipping policy',question:fixture.question,reply:'هزینه ارسال تا آبادان با خودتونه و جدا از قیمت جعبه حساب می‌شه. مبلغ دقیقش باید استعلام بشه.',shipping:true},
 {key:'unchanged product consultation control',question:QUESTIONS.faB,reply:REFERENCES.faB,shipping:false}
];
const mockFetch=globalThis.fetch;
for(const scenario of scenarios)for(let run=0;run<4;run++){
 const user=await client(),start=W.tg.length;let attempts=0;
 globalThis.fetch=async(url,options={})=>{
  if(String(url?.url||url)!=='https://api.anthropic.com/v1/messages')return mockFetch(url,options);
  if(options.headers?.['x-api-key']!=='test-key-not-real')throw Error('Only mock credential allowed');
  attempts++;if(attempts>2)throw Error('Unexpected extra latency inference');
  const body=JSON.parse(options.body),ctx=JSON.parse(body.messages[0].content.replace(/^CONTEXT:\n/u,''));
  if(ctx.message!==scenario.question)throw Error('Scenario mismatch');
  await new Promise(resolve=>setTimeout(resolve,80));
  const result=decision(scenario.reply);if(scenario.shipping){result.requests=['shipping'];result.interpretation.primary_intent='shipping';}
  return new Response(JSON.stringify({model:'claude-opus-5-5',stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(result)}]}),{headers:{'Content-Type':'application/json'}});
 };
 let result;const started=performance.now();try{result=await W.send(user,scenario.question);}finally{globalThis.fetch=mockFetch;}
 const elapsed=performance.now()-started,texts=sent(user,start),owner=W.q("SELECT id FROM owner_escalations WHERE source_message_id=? AND status='open'",[result.row.id]);
 ok(scenario.key+' '+run+': bounded attempts and no duplicate',attempts<=2&&texts.length<=1,{attempts,texts:texts.length});
 ok(scenario.key+' '+run+': outcome has delivery or durable review',texts.length===1||owner.length===1,result.outcome);
 if(!baseline)ok(scenario.key+' '+run+': unchanged natural primary uses one call',attempts===1&&texts[0]===scenario.reply,{attempts,texts,validation:result.brain?.validation});
 samples.push({scenario:scenario.key,run,warmup:run===0,elapsed_ms:Math.round(elapsed*100)/100,physical_attempts:attempts,scripted_provider_delay_ms:attempts*80,outcome:result.outcome?.customer_visible||null,owner_cases:owner.length});
}
ok('Latency benchmark has no real outbound transport',W.offNet().length===0,W.offNet());
const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)];};
const summary=scenarios.map(scenario=>{const rows=samples.filter(row=>row.scenario===scenario.key&&!row.warmup);return {scenario:scenario.key,runs:rows.length,median_time_to_outcome_ms:median(rows.map(row=>row.elapsed_ms)),median_physical_attempts:median(rows.map(row=>row.physical_attempts)),outcomes:rows.map(row=>row.outcome)};});
const evidence={suite:'phase51_autonomy_latency',baseline,baseline_commit:fixture.commit,mode:'FIXED_DELAY_OFFLINE_CAPTURED_OR_SCRIPTED_PROVIDER_RECORDING_TELEGRAM',provider_delay_ms:80,live_model_calls:0,real_telegram_messages:0,samples,summary,assertions,corpus_sha256:createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).update(JSON.stringify(scenarios)).digest('hex'),warning:'Failure/review and delivery timings are separate outcomes; these are not production response times or provider/cost estimates.'};
if(process.env.PHASE51_LATENCY_EVIDENCE)fs.writeFileSync(process.env.PHASE51_LATENCY_EVIDENCE,JSON.stringify(evidence,null,2)+'\n');
process.exitCode=report.done()?1:0;
