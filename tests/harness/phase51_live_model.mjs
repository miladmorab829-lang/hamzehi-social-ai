// Isolated, bounded provider pilot. NO production, D1, or real Telegram access.
// Run only with an already approved Process credential; never loads secret files.
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
const output=process.env.PHASE51_LIVE_EVIDENCE;
if(!output)throw Error('PHASE51_LIVE_EVIDENCE output path is required');
const provider='anthropic',model='claude-opus-5-5',effort='medium',maxCalls=12;
const receipt={kind:'ISOLATED_REAL_PROVIDER_EVALUATION',provider,requested_model:model,effort,timeout_ms:20000,max_calls:maxCalls,actual_calls:0,live_model_verified:false,status:'NOT_VERIFIED',observations:[],estimated_cost:null};
const key=process.env.ANTHROPIC_API_KEY;
const save=()=>fs.writeFileSync(output,JSON.stringify(receipt,null,2));
if(!key||key==='test-key-not-real'){
 receipt.reason='No existing approved provider credential in Process environment; no secret retrieval attempted.';
 save();console.log(JSON.stringify({status:receipt.status,actual_calls:0,reason:receipt.reason}));
}else{
 const nativeFetch=globalThis.fetch;
 const {evaluationWorld,QUESTIONS}=await import('./phase51-evaluation-world.mjs');
 const {salesAiFirstReply}=await import('../../worker/src/index.js');
 const {W,client,sent}=await evaluationWorld({timeoutMs:20000});
 const users={IRAN:await client('IRAN'),ARAB:await client('ARAB')};
 const mockFetch=globalThis.fetch;
 const calls=[];
 globalThis.fetch=async(url,options={})=>{
  const endpoint=String(url);
  if(endpoint==='https://api.anthropic.com/v1/messages'){
   if(receipt.actual_calls>=maxCalls)throw Error('Local provider cap exhausted');
   const body=JSON.parse(String(options.body||'{}'));
   if(body.model!==model||body.output_config?.effort!==effort)throw Error('Unauthorized model/effort in evaluation');
   let context;try{context=JSON.parse(body.messages[0].content.replace(/^CONTEXT:\n/,''));}catch{throw Error('Non-conversation model call blocked');}
   if(!Object.values(QUESTIONS).includes(context.message))throw Error('Non-pilot question blocked');
   receipt.actual_calls++;
   const headers=new Headers(options.headers);headers.set('x-api-key',key);
   const entry={question:context.message,stage:context.authoring?'final_author':'primary',latency_ms:null,status:null,returned_model:null,usage:null,stop_reason:null,decision:null,reply:null};
   calls.push(entry);const started=performance.now();
   try{
    const response=await nativeFetch(endpoint,{...options,headers,redirect:'error'});
    entry.status=response.status;const text=await response.text();let result;try{result=JSON.parse(text);}catch{}
    // Record model text and usage only. Never record headers, key, or provider error bodies.
    entry.returned_model=result?.model||null;entry.usage=result?.usage||null;entry.stop_reason=result?.stop_reason||null;
    if(response.ok){const raw=(result?.content||[]).filter(block=>block.type==='text').map(block=>block.text).join('');try{entry.decision=JSON.parse(raw);entry.reply=entry.decision.reply||null;}catch{entry.reply=null;}}
    return new Response(text,{status:response.status,headers:{'Content-Type':'application/json'}});
   }catch(error){entry.error=error?.name==='AbortError'?'provider_timeout':'provider_unavailable';throw Object.assign(Error(entry.error),{name:error?.name==='AbortError'?'AbortError':'Error'});}
   finally{entry.latency_ms=Math.round(performance.now()-started);}
  }
  // Recording Telegram transport only: the original mock NEVER calls native fetch.
  if(/^https:\/\/api\.telegram\.org\/botbot-test\//u.test(endpoint))return mockFetch(url,options);
  throw Error('Non-pilot external endpoint blocked');
 };
 try{
  for(const [market,keys]of [['IRAN',['faA','faB','faMemory']],['ARAB',['arA','arB','arMemory']]]){
   const user=users[market];
   for(const questionKey of keys){
    const start=W.tg.length,before=receipt.actual_calls,started=performance.now(),result=await W.send(user,QUESTIONS[questionKey]);
    receipt.observations.push({key:questionKey,question:QUESTIONS[questionKey],total_turn_latency_ms:Math.round(performance.now()-started),final_customer_visible:sent(user,start),outcome:result.outcome,validation:result.brain?.validation,authorship:result.brain?.ai_brain?.authorship,verified_authorship:salesAiFirstReply(result.brain),calls:receipt.actual_calls-before});save();
   }
  }
  receipt.status=receipt.observations.length===6&&receipt.observations.every(item=>item.final_customer_visible.length===1&&item.verified_authorship)?'REQUIRES_INDEPENDENT_QUALITY_REVIEW':'NO_GO';
  receipt.reason='Actual provider outputs require independent Persian/Iraqi Arabic quality review; transport is an isolated mock.';
 }catch(error){receipt.status='NO_GO';receipt.reason=['provider_timeout','provider_unavailable'].includes(error?.message)?error.message:'Isolated pilot did not complete';}
 finally{globalThis.fetch=mockFetch;receipt.provider_calls=calls;save();}
 console.log(JSON.stringify({status:receipt.status,actual_calls:receipt.actual_calls,live_model_verified:receipt.live_model_verified}));
}
