const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const MODULES = ['telegram','whatsapp','instagram','website','crm','ads','content','media','learning','revenue'];
const DEFAULTS = Object.fromEntries(MODULES.map(x => [x, true]));

async function ensure(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS autonomy_controls (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS autonomy_commands (id TEXT PRIMARY KEY,raw_command TEXT NOT NULL,plan_json TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS autonomy_tasks (id TEXT PRIMARY KEY,command_id TEXT,module TEXT NOT NULL,action TEXT NOT NULL,status TEXT NOT NULL,priority INTEGER NOT NULL DEFAULT 50,payload_json TEXT,result_json TEXT,error TEXT,attempts INTEGER NOT NULL DEFAULT 0,scheduled_at TEXT,started_at TEXT,finished_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`).run();
}
async function getKV(env,key){ const r=await env.DB.prepare('SELECT value FROM autonomy_controls WHERE key=?').bind(key).first(); return r?.value ?? null; }
async function setKV(env,key,value){ await env.DB.prepare('INSERT OR REPLACE INTO autonomy_controls(key,value,updated_at) VALUES(?,?,?)').bind(key,String(value),now()).run(); }
async function controls(env){
  await ensure(env); let master=await getKV(env,'master'); if(!master) master='on';
  const mods={...DEFAULTS}; const raw=await getKV(env,'modules'); try{Object.assign(mods,JSON.parse(raw||'{}'));}catch{}
  return {master,modules:mods};
}
function parseCommand(raw){
  const s=String(raw||'').toLowerCase(); const tasks=[];
  const add=(module,action,payload={},priority=50)=>tasks.push({module,action,payload,priority});
  if(/تلگرام|telegram/.test(s)){
    if(/جواب|پاسخ|reply|customer/.test(s)) add('telegram','inbox_reply',{mode:'safe_ai_reply'},90);
    else add('telegram','inbox_scan',{},80);
    if(/استوری|story|محتوا|content|پست|publish/.test(s)) add('content','generate_and_queue',{platform:'telegram',market:'iran_iraq'},70);
  }
  if(/واتساپ|whatsapp/.test(s)) add('whatsapp','inbox_scan',{},80);
  if(/اینستاگرام|instagram|اینستا/.test(s)) add('instagram','health_and_leads',{},60);
  if(/وبسایت|website|سایت/.test(s)) add('website','growth_scan',{},60);
  if(/مشتری|lead|crm|لید/.test(s)) add('crm','lead_intelligence',{},85);
  if(/تبلیغ|اسپانسر|ads|advertis|رپورتاژ/.test(s)) add('ads','discover_opportunities',{type:'all',city:'',extra:''},85);
  if(/محتوا|content|پست|استوری|story/.test(s) && !tasks.some(x=>x.module==='content')) add('content','generate_and_queue',{platform:'telegram',market:'iran_iraq'},70);
  if(/یادگیری|learn|بهینه|optimi/.test(s)) add('learning','run',{},55);
  if(/درآمد|فروش|revenue|پول/.test(s)) add('revenue','funnel_snapshot',{},90);
  if(/همه|all|فعالیت|شروع|start/.test(s)) { for(const m of MODULES) if(!tasks.some(x=>x.module===m)) add(m,m==='learning'?'run':'status',{},40); }
  if(!tasks.length) add('revenue','funnel_snapshot',{},30);
  return {goal:'Execute requested business activity with verification and learning',tasks};
}
async function authInternal(env){ return env.ADMIN_TOKEN ? `Bearer ${env.ADMIN_TOKEN}` : null; }
async function callSelf(req,env,path,method='GET',body){
  const url=new URL(req.url); url.pathname=path; url.search='';
  const headers={'Authorization':await authInternal(env)}; if(body) headers['Content-Type']='application/json';
  const r=await fetch(url.toString(),{method,headers,body:body?JSON.stringify(body):undefined});
  const data=await r.json().catch(()=>({ok:false,error:`HTTP ${r.status}`})); return {status:r.status,data};
}
async function executeTask(env,req,t){
  const p=JSON.parse(t.payload_json||'{}');
  if(t.action==='status') return {ok:true,module:t.module,mode:'observed'};
  if(t.module==='telegram' && t.action==='inbox_scan') return (await callSelf(req,env,'/api/inbox')).data;
  if(t.module==='telegram' && t.action==='inbox_reply'){
    const r=await callSelf(req,env,'/api/inbox');
    return {ok:r.status<300,mode:'reply_queue',items:r.data.items||[],note:'Reply drafts are queued for the configured Telegram reply engine.'};
  }
  if(t.module==='content' && t.action==='generate_and_queue') return (await callSelf(req,env,'/api/content/automation/run','POST',{platform:p.platform||'telegram',market:p.market||'iran_iraq'})).data;
  if(t.module==='ads' && t.action==='discover_opportunities') return (await callSelf(req,env,'/api/ads/autopilot','POST',p)).data;
  if(t.module==='learning' && t.action==='run') return (await callSelf(req,env,'/api/learning/run','POST',{})).data;
  if(t.module==='crm' && t.action==='lead_intelligence') return (await callSelf(req,env,'/api/ads/intelligence')).data;
  if(t.module==='website' && t.action==='growth_scan') return (await callSelf(req,env,'/api/website/growth')).data;
  if(t.module==='revenue' && t.action==='funnel_snapshot') return await revenue(env);
  if(t.module==='instagram' && t.action==='health_and_leads') return (await callSelf(req,env,'/api/settings')).data;
  if(t.module==='whatsapp' && t.action==='inbox_scan') return (await callSelf(req,env,'/api/inbox')).data;
  return {ok:false,error:'Unsupported autonomous action'};
}
async function revenue(env){
  const r=await env.DB.prepare('SELECT stage,COUNT(*) n FROM leads GROUP BY stage').all(); const funnel={}; for(const x of r.results||[]) funnel[x.stage]=Number(x.n||0);
  const opp=await env.DB.prepare("SELECT COUNT(*) n FROM leads WHERE stage IN ('qualified','contacted','replied','negotiation')").first();
  const customers=await env.DB.prepare("SELECT COUNT(*) n FROM leads WHERE stage IN ('customer','converted')").first();
  return {ok:true,funnel,opportunities:Number(opp?.n||0),conversions:Number(customers?.n||0),money:{status:'not_available',reason:'No verified revenue amount field is present in the current data model'}};
}
async function runTasks(env,req,limit=12){
  const c=await controls(env); if(c.master!=='on') return {ok:true,paused:true,executed:0};
  const rows=await env.DB.prepare("SELECT * FROM autonomy_tasks WHERE status='queued' AND (scheduled_at IS NULL OR scheduled_at<=?) ORDER BY priority DESC,created_at ASC LIMIT ?").bind(now(),limit).all();
  let executed=0,failed=0;
  for(const t of rows.results||[]){
    if(c.modules[t.module]===false){ await env.DB.prepare("UPDATE autonomy_tasks SET status='blocked',error=?,updated_at=? WHERE id=?").bind('Module is OFF',now(),t.id).run(); continue; }
    await env.DB.prepare("UPDATE autonomy_tasks SET status='running',started_at=?,attempts=attempts+1,updated_at=? WHERE id=? AND status='queued'").bind(now(),now(),t.id).run();
    try{ const result=await executeTask(env,req,t); await env.DB.prepare("UPDATE autonomy_tasks SET status='completed',result_json=?,finished_at=?,updated_at=? WHERE id=? AND status='running'").bind(JSON.stringify(result).slice(0,50000),now(),now(),t.id).run(); executed++; }
    catch(e){ failed++; await env.DB.prepare("UPDATE autonomy_tasks SET status='failed',error=?,finished_at=?,updated_at=? WHERE id=?").bind(String(e.message||e).slice(0,2000),now(),now(),t.id).run(); }
  }
  return {ok:true,executed,failed,paused:false};
}
export async function handleAutonomy(env,req){
  if(!['GET','POST'].includes(req.method)) return new Response('Method not allowed',{status:405});
  if(!env.ADMIN_TOKEN || req.headers.get('Authorization')!==`Bearer ${env.ADMIN_TOKEN}`) return Response.json({ok:false,error:'Unauthorized'},{status:401});
  const u=new URL(req.url); await ensure(env);
  if(u.pathname==='/api/autonomy/status'){
    const c=await controls(env); const counts=await env.DB.prepare("SELECT status,COUNT(*) n FROM autonomy_tasks GROUP BY status").all(); const tasks={}; for(const x of counts.results||[]) tasks[x.status]=Number(x.n||0);
    const rev=await revenue(env); return Response.json({ok:true,controls:c,tasks,revenue:rev,fresh_at:now()});
  }
  if(u.pathname==='/api/autonomy/master' && req.method==='POST'){
    const b=await req.json().catch(()=>({})); const action=['on','pause','stop','emergency_stop'].includes(b.action)?b.action:'on';
    await setKV(env,'master',action==='on'?'on':action==='pause'?'paused':'off');
    return Response.json({ok:true,master:action==='on'?'on':action==='pause'?'paused':'off',action});
  }
  if(u.pathname==='/api/autonomy/module' && req.method==='POST'){
    const b=await req.json().catch(()=>({})); const module=String(b.module||''); if(!MODULES.includes(module)) return Response.json({ok:false,error:'Unknown module'},{status:400});
    const c=await controls(env); c.modules[module]=!!b.enabled; await setKV(env,'modules',JSON.stringify(c.modules)); return Response.json({ok:true,module,enabled:c.modules[module]});
  }
  if(u.pathname==='/api/autonomy/command' && req.method==='POST'){
    const b=await req.json().catch(()=>({})); const raw=String(b.command||'').trim(); if(!raw) return Response.json({ok:false,error:'command is required'},{status:400});
    const plan=parseCommand(raw), cid=uid(), t=now(); await env.DB.prepare('INSERT INTO autonomy_commands VALUES(?,?,?,?,?,?)').bind(cid,raw,JSON.stringify(plan),'queued',t,t).run();
    for(const x of plan.tasks) await env.DB.prepare('INSERT INTO autonomy_tasks(id,command_id,module,action,status,priority,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(uid(),cid,x.module,x.action,'queued',x.priority,JSON.stringify(x.payload),t,t).run();
    return Response.json({ok:true,command_id:cid,plan,status:'queued'});
  }
  if(u.pathname==='/api/autonomy/tasks'){
    const r=await env.DB.prepare('SELECT * FROM autonomy_tasks ORDER BY created_at DESC LIMIT 50').all(); return Response.json({ok:true,items:r.results||[]});
  }
  if(u.pathname==='/api/autonomy/tasks/run' && req.method==='POST') return Response.json(await runTasks(env,req,20));
  if(u.pathname==='/api/autonomy/brain'){
    const c=await controls(env); const events=await env.DB.prepare('SELECT type,severity,message,created_at FROM system_events ORDER BY created_at DESC LIMIT 15').all(); const tasks=await env.DB.prepare("SELECT module,action,status,priority,error,updated_at FROM autonomy_tasks ORDER BY updated_at DESC LIMIT 15").all(); const rev=await revenue(env); return Response.json({ok:true,brain:{mission:'Grow qualified demand, serve customers, publish approved content, discover opportunities, learn and optimize.',controls:c,revenue:rev,active_tasks:tasks.results||[],timeline:events.results||[]}});
  }
  if(u.pathname==='/api/autonomy/opportunities'){
    const r=await env.DB.prepare("SELECT id,name,contact,stage,priority,notes,updated_at FROM leads WHERE stage NOT IN ('customer','converted','rejected','archived') ORDER BY updated_at DESC LIMIT 50").all(); return Response.json({ok:true,items:r.results||[]});
  }
  if(u.pathname==='/api/autonomy/revenue') return Response.json(await revenue(env));
  if(u.pathname==='/api/autonomy/errors'){
    const r=await env.DB.prepare("SELECT * FROM retry_queue ORDER BY updated_at DESC LIMIT 50").all(); const t=await env.DB.prepare("SELECT * FROM autonomy_tasks WHERE status='failed' ORDER BY updated_at DESC LIMIT 30").all(); return Response.json({ok:true,retries:r.results||[],tasks:t.results||[]});
  }
  if(u.pathname==='/api/autonomy/metrics'){
    const r=await env.DB.prepare("SELECT status,COUNT(*) n FROM autonomy_tasks GROUP BY status").all(); const x=Object.fromEntries((r.results||[]).map(v=>[v.status,Number(v.n||0)])); const total=(x.completed||0)+(x.failed||0)+(x.blocked||0); const autonomous=total?Math.round((x.completed||0)/total*100):0; return Response.json({ok:true,total,completed:x.completed||0,failed:x.failed||0,blocked:x.blocked||0,autonomous_rate:autonomous,target:98,definition:'completed autonomous tasks / completed+failed+blocked tasks'});
  }
  return Response.json({ok:false,error:'Not found'},{status:404});
}

export async function runAutonomyScheduled(env,req){ try { await ensure(env); return await runTasks(env,req,12); } catch(e){ return {ok:false,error:String(e.message||e)}; } }
