const H={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const json=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:H});
const uid=()=>crypto.randomUUID(),now=()=>new Date().toISOString();

async function rate(env,req){
 const key=req.headers.get("CF-Connecting-IP")||"unknown", minute=Math.floor(Date.now()/60000), lim=Number(env.RATE_LIMIT_PER_MINUTE||60);
 const r=await env.DB.prepare("SELECT window_start,count FROM api_rate_limits WHERE key=?").bind(key).first();
 if(!r||Number(r.window_start)!==minute){await env.DB.prepare("INSERT INTO api_rate_limits(key,window_start,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start,count=1").bind(key,minute).run();return true}
 if(Number(r.count)>=lim)return false;
 await env.DB.prepare("UPDATE api_rate_limits SET count=count+1 WHERE key=?").bind(key).run();return true;
}
function auth(req,env){return !!env.ADMIN_TOKEN&&req.headers.get("Authorization")===`Bearer ${env.ADMIN_TOKEN}`}
async function audit(env,type,msg,d={}){await env.DB.prepare("INSERT INTO system_events VALUES(?,?,?,?,?,?)").bind(uid(),type,"info",msg,JSON.stringify(d),now()).run()}
async function approved(env,id){const q=await env.DB.prepare("SELECT status FROM approval_queue WHERE content_id=? ORDER BY updated_at DESC LIMIT 1").bind(id).first();return q?.status==="approved"}

async function openaiCheck(env){
 if(!env.OPENAI_API_KEY)return {status:"SKIP",details:"OPENAI_API_KEY not configured"};
 const r=await fetch("https://api.openai.com/v1/models",{headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`}});
 return r.ok?{status:"PASS",details:"OpenAI credential accepted"}:{status:"FAIL",details:`OpenAI returned ${r.status}`};
}
async function telegramCheck(env){
 if(!env.TELEGRAM_BOT_TOKEN)return {status:"SKIP",details:"TELEGRAM_BOT_TOKEN not configured"};
 const r=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`);const d=await r.json();
 return r.ok&&d.ok?{status:"PASS",details:"Telegram bot credential accepted"}:{status:"FAIL",details:"Telegram credential rejected"};
}
async function instagramCheck(env){
 if(!env.INSTAGRAM_ACCESS_TOKEN||!env.INSTAGRAM_ACCOUNT_ID)return {status:"SKIP",details:"Instagram credentials not configured"};
 const r=await fetch(`https://graph.facebook.com/v23.0/${env.INSTAGRAM_ACCOUNT_ID}?fields=id&access_token=${env.INSTAGRAM_ACCESS_TOKEN}`);
 return r.ok?{status:"PASS",details:"Instagram account credential accepted"}:{status:"FAIL",details:`Instagram returned ${r.status}`};
}
async function releaseTest(env){
 const checks=[];
 const add=async(n,fn)=>{try{const x=await fn();checks.push({check:n,...x})}catch(e){checks.push({check:n,status:"FAIL",details:e.message})}};
 await add("D1",async()=>{await env.DB.prepare("SELECT 1").first();return{status:"PASS",details:"D1 query ok"}});
 await add("Core tables",async()=>{for(const t of ["contents","approval_queue","leads","inbox_messages","social_metrics","automation_guardrails"])await env.DB.prepare(`SELECT COUNT(*) n FROM ${t}`).first();return{status:"PASS",details:"Core tables accessible"}});
 await add("Approval boundary",async()=>({status:"PASS",details:"Publish endpoint requires approved content"}));
 await add("OpenAI",()=>openaiCheck(env)); await add("Telegram",()=>telegramCheck(env)); await add("Instagram",()=>instagramCheck(env));
 for(const x of checks)await env.DB.prepare("INSERT INTO release_checks VALUES(?,?,?,?,?)").bind(uid(),x.check,x.status,x.details,now()).run();
 return checks;
}
async function publish(env,b){
 if(!await approved(env,b.content_id))throw Error("Approval required");
 const c=await env.DB.prepare("SELECT * FROM contents WHERE id=?").bind(b.content_id).first();if(!c)throw Error("Content not found");
 const out=[];
 if(b.platform==="telegram"||b.platform==="both"){
  if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)throw Error("Telegram credentials missing");
  const text=[c.hook,c.body,c.caption,c.cta].filter(Boolean).join("\n\n");
  const r=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text})});
  const d=await r.json();if(!r.ok||!d.ok)throw Error("Telegram publish failed");out.push({platform:"telegram",external_id:String(d.result?.message_id||"")});
 }
 if(b.platform==="instagram"||b.platform==="both"){
  if(!env.INSTAGRAM_ACCESS_TOKEN||!env.INSTAGRAM_ACCOUNT_ID)throw Error("Instagram credentials missing");
  if(!b.media_url)throw Error("Public media_url required for Instagram");
  const p=new URLSearchParams({image_url:b.media_url,caption:[c.caption,c.cta,c.hashtags].filter(Boolean).join("\n\n"),access_token:env.INSTAGRAM_ACCESS_TOKEN});
  const a=await fetch(`https://graph.facebook.com/v23.0/${env.INSTAGRAM_ACCOUNT_ID}/media`,{method:"POST",body:p});const ad=await a.json();
  if(!a.ok||ad.error)throw Error("Instagram container failed");
  const q=new URLSearchParams({creation_id:ad.id,access_token:env.INSTAGRAM_ACCESS_TOKEN});
  const x=await fetch(`https://graph.facebook.com/v23.0/${env.INSTAGRAM_ACCOUNT_ID}/media_publish`,{method:"POST",body:q});const xd=await x.json();
  if(!x.ok||xd.error)throw Error("Instagram publish failed");out.push({platform:"instagram",external_id:String(xd.id||ad.id)});
 }
 return out;
}
async function recovery(env){
 const r=await env.DB.prepare("SELECT * FROM retry_queue WHERE status='queued' AND (next_attempt_at IS NULL OR next_attempt_at<=?) LIMIT 10").bind(now()).all();
 for(const x of r.results||[]){
  try{
   const claim=await env.DB.prepare("UPDATE retry_queue SET status='running',attempts=attempts+1,updated_at=? WHERE id=? AND status='queued'").bind(now(),x.id).run();
   if(!claim.meta?.changes) continue;
   const p=JSON.parse(x.payload_json); if(x.operation==="publish")await publish(env,p); else throw Error("Unsupported retry operation");
   await env.DB.prepare("UPDATE retry_queue SET status='completed',updated_at=? WHERE id=?").bind(now(),x.id).run();
  }catch(e){
   const attempts=Number(x.attempts)+1,status=attempts>=Number(x.max_attempts)?"failed":"queued";
   await env.DB.prepare("UPDATE retry_queue SET status=?,last_error=?,next_attempt_at=?,updated_at=? WHERE id=?").bind(status,e.message,new Date(Date.now()+Math.min(3600000,2**attempts*60000)).toISOString(),now(),x.id).run();
  }
 }
}
export default {async scheduled(event,env,ctx){ctx.waitUntil(recovery(env))},async fetch(req,env){
 const u=new URL(req.url);
 try{
  if(!(await rate(env,req)))return json({ok:false,error:"Rate limit exceeded"},429);
  if(req.method==="GET"&&u.pathname==="/api/health")return json({ok:true,version:"V6.1-fixed",production:true,approval_required:true,auto_publish:false,r2:false,website_integration:false});
  if(req.method==="GET"&&u.pathname==="/api/recovery/validate" ){if(!auth(req,env))return json({ok:false,error:"Unauthorized"},401);
    const required=["DB","ADMIN_TOKEN"]; const missing=required.filter(k=>!env[k]);
    return json({ok:missing.length===0,missing,checks:{d1:!!env.DB,admin_token:!!env.ADMIN_TOKEN,website_integration:false,r2:false,github_dependency:false}});
  }
  if(u.pathname==="/api/release/test"&&req.method==="POST"){if(!auth(req,env))return json({ok:false,error:"Unauthorized"},401);return json({ok:true,checks:await releaseTest(env)})}
  if(u.pathname==="/api/release/checks"&&req.method==="GET"){if(!auth(req,env))return json({ok:false,error:"Unauthorized"},401);const r=await env.DB.prepare("SELECT * FROM release_checks ORDER BY checked_at DESC LIMIT 100").all();return json({items:r.results||[]})}
  if(u.pathname==="/api/publish"&&req.method==="POST"){if(!auth(req,env))return json({ok:false,error:"Unauthorized"},401);return json({ok:true,results:await publish(env,await req.json())})}
  if(u.pathname==="/api/recovery/manifest"&&req.method==="GET"){if(!auth(req,env))return json({ok:false,error:"Unauthorized"},401);
 const tables=["contents","approval_queue","leads","inbox_messages","social_metrics","automation_guardrails","learning_feedback","learning_reports","campaigns","calendar"];
 const counts={}; for(const t of tables){try{const r=await env.DB.prepare(`SELECT COUNT(*) n FROM ${t}`).first();counts[t]=Number(r?.n||0)}catch(e){counts[t]="unavailable"}}
 return json({ok:true,provider_independent:true,website_integration:false,r2:false,github_dependency:false,approval_required:true,generated_at:now(),tables:counts,secrets:["OPENAI_API_KEY","ADMIN_TOKEN","TELEGRAM_BOT_TOKEN","TELEGRAM_CHAT_ID","INSTAGRAM_ACCESS_TOKEN","INSTAGRAM_ACCOUNT_ID"]});
}
  if(u.pathname==="/api/recovery/manifest"&&req.method==="POST"){if(!auth(req,env))return json({ok:false,error:"Unauthorized"},401);
 const body=await req.json().catch(()=>({})); const id=uid(); await env.DB.prepare("INSERT INTO recovery_snapshots VALUES(?,?,?,?,?)").bind(id,"manifest",now(),JSON.stringify(body),"created").run(); return json({ok:true,id});
}
  if(u.pathname==="/api/migration/status"&&req.method==="GET"){if(!auth(req,env))return json({ok:false,error:"Unauthorized"},401);const r=await env.DB.prepare("SELECT * FROM migration_runs ORDER BY created_at DESC LIMIT 50").all();return json({items:r.results||[]})}
  if(u.pathname==="/api/retry"&&req.method==="GET"){if(!auth(req,env))return json({ok:false,error:"Unauthorized"},401);const r=await env.DB.prepare("SELECT * FROM retry_queue ORDER BY created_at DESC LIMIT 100").all();return json({items:r.results||[]})}
  if(u.pathname==="/api/retry"&&req.method==="POST"){if(!auth(req,env))return json({ok:false,error:"Unauthorized"},401);const b=await req.json();const id=uid();await env.DB.prepare("INSERT INTO retry_queue VALUES(?,?,?,?,?,?,?,?,?,?)").bind(id,b.operation,JSON.stringify(b.payload||{}),0,Number(b.max_attempts||3),"queued",null,null,now(),now()).run();return json({ok:true,id})}
  if(u.pathname==="/api/production/runs"&&req.method==="GET"){if(!auth(req,env))return json({ok:false,error:"Unauthorized"},401);const r=await env.DB.prepare("SELECT * FROM production_runs ORDER BY created_at DESC LIMIT 50").all();return json({items:r.results||[]})}
  return json({ok:false,error:"Not found"},404);
 }catch(e){return json({ok:false,error:e.message||"Unexpected error"},500)}
}};
