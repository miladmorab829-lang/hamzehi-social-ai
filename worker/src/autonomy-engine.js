const now=()=>new Date().toISOString();
const uid=()=>crypto.randomUUID();

export const MODULES=[
  "telegram","whatsapp","instagram","website","crm",
  "ads","content","media","learning","revenue"
];
const DEFAULTS=Object.fromEntries(MODULES.map(x=>[x,true]));

const ACTIONS={
 telegram:["status","inbox_scan","inbox_reply"],
 whatsapp:["status","inbox_scan"],
 instagram:["status","health_and_leads"],
 website:["status","growth_scan"],
 crm:["status","lead_intelligence"],
 ads:["status","discover_opportunities"],
 content:["status","generate_and_queue"],
 media:["status"],
 learning:["status","run"],
 revenue:["status","funnel_snapshot"]
};

async function ensure(env){
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS autonomy_controls(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)`).run();
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS autonomy_commands(id TEXT PRIMARY KEY,raw_command TEXT NOT NULL,plan_json TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`).run();
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS autonomy_tasks(id TEXT PRIMARY KEY,command_id TEXT NOT NULL,module TEXT NOT NULL,action TEXT NOT NULL,status TEXT NOT NULL,priority INTEGER NOT NULL DEFAULT 50,payload_json TEXT,result_json TEXT,error TEXT,attempts INTEGER NOT NULL DEFAULT 0,scheduled_at TEXT,started_at TEXT,finished_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`).run();
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS autonomy_locks(module TEXT PRIMARY KEY,task_id TEXT NOT NULL,locked_at TEXT NOT NULL)`).run();
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS autonomy_action_controls(module TEXT NOT NULL,action TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,PRIMARY KEY(module,action))`).run();
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS autonomy_events(id TEXT PRIMARY KEY,type TEXT NOT NULL,module TEXT,message TEXT,meta_json TEXT,created_at TEXT NOT NULL)`).run();
}

async function getKV(env,key){const r=await env.DB.prepare("SELECT value FROM autonomy_controls WHERE key=?").bind(key).first();return r?.value??null}
async function setKV(env,key,value){await env.DB.prepare("INSERT OR REPLACE INTO autonomy_controls(key,value,updated_at) VALUES(?,?,?)").bind(key,String(value),now()).run()}
export async function autonomyMasterGate(env){await ensure(env);const v=await getKV(env,"master");return v===null||v==="on"}
async function controls(env){
 await ensure(env);
 let master=await getKV(env,"master");if(!master)master="on";
 const mods={...DEFAULTS};try{Object.assign(mods,JSON.parse(await getKV(env,"modules")||"{}"))}catch{}
 return {master,modules:mods};
}
async function event(env,type,module,message,meta={}){try{await env.DB.prepare("INSERT INTO autonomy_events VALUES(?,?,?,?,?,?)").bind(uid(),type,module||null,message||"",JSON.stringify(meta),now()).run()}catch{}}

function fallbackPlan(raw){
 const s=String(raw||"").toLowerCase(),tasks=[];
 const add=(module,action,payload={},priority=50)=>tasks.push({module,action,payload,priority});
 const blocked=new Set();
 for(const m of MODULES)if(new RegExp(`(?:نه|بدون|نکن|متوقف|off|block)[^\\n]{0,40}(?:${m})`).test(s))blocked.add(m);
 if(/تلگرام|telegram/.test(s))add("telegram",/جواب|پاسخ|reply/.test(s)?"inbox_reply":"inbox_scan",{},90);
 if(/واتساپ|whatsapp/.test(s))add("whatsapp","inbox_scan",{},85);
 if(/اینستاگرام|instagram|اینستا/.test(s))add("instagram","health_and_leads",{},70);
 if(/وبسایت|website|سایت/.test(s))add("website","growth_scan",{},70);
 if(/مشتری|lead|crm|لید/.test(s))add("crm","lead_intelligence",{},85);
 if(/تبلیغ|اسپانسر|ads|advertis|رپورتاژ/.test(s))add("ads","discover_opportunities",{},85);
 if(/محتوا|content|پست|استوری|story/.test(s))add("content","generate_and_queue",{platform:"telegram",market:"iran_iraq"},70);
 if(/یادگیری|learn|بهینه|optimi/.test(s))add("learning","run",{},55);
 if(/درآمد|فروش|revenue|پول/.test(s))add("revenue","funnel_snapshot",{},90);
 if(/همه|all|فعالیت|شروع|start/.test(s))for(const m of MODULES)if(!tasks.some(x=>x.module===m))add(m,m==="learning"?"run":"status",{},40);
 for(let i=tasks.length-1;i>=0;i--)if(blocked.has(tasks[i].module))tasks.splice(i,1);
 if(!tasks.length)add("revenue","funnel_snapshot",{},30);
 return {goal:"Execute the user's requested business activity with verification and learning",tasks,source:"fallback"};
}
function extractJson(text){
 const t=String(text||"").trim().replace(/^```(?:json)?/i,"").replace(/```$/,"").trim();
 try{return JSON.parse(t)}catch{}
 const a=t.indexOf("{"),b=t.lastIndexOf("}");if(a>=0&&b>a)try{return JSON.parse(t.slice(a,b+1))}catch{}
 return null;
}
async function aiPlan(env,raw){
 if(!env.OPENAI_API_KEY)return fallbackPlan(raw);
 const catalog=MODULES.map(m=>`${m}: ${ACTIONS[m].join(",")}`).join("\n");
 const prompt=`You are the planning brain of HAMZEHI SOCIAL AI.
Convert the user's Persian/English command into a SAFE executable plan.
Only use these modules/actions:
${catalog}
Rules:
- Never invent an action.
- Respect explicit OFF, BLOCK, STOP, DON'T, ONLY OBSERVE, DRAFT ONLY, or NO PUBLISH instructions.
- If the user says a channel should not act, do not create tasks for it.
- Keep modules independent; do not create cross-module dependencies unless the user explicitly requests analysis using another module's data.
- Publishing or external customer replies are sensitive: prefer observation/draft unless the user explicitly asks for execution and the existing backend supports it.
- Return JSON only: {"goal":"...","mode":"observe|draft|execute","tasks":[{"module":"...","action":"...","payload":{},"priority":50}],"blocked_modules":[],"blocked_actions":[]}
User command: ${raw}`;
 try{
  const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:env.OPENAI_MODEL||"gpt-5.6-luna",input:prompt})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(`AI planner HTTP ${r.status}`);
  const text=d.output_text||((d.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||"").join(""));
  const p=extractJson(text);if(!p||!Array.isArray(p.tasks))throw new Error("AI planner returned invalid plan");
  p.tasks=p.tasks.filter(t=>MODULES.includes(t.module)&&ACTIONS[t.module]?.includes(t.action));
  p.source="ai";
  return p;
 }catch(e){const p=fallbackPlan(raw);p.planner_error=String(e.message||e);return p}
}
async function actionEnabled(env,module,action){
 const r=await env.DB.prepare("SELECT enabled FROM autonomy_action_controls WHERE module=? AND action=?").bind(module,action).first();
 return r===null||Number(r.enabled)!==0;
}
async function callSelf(req,env,path,method="GET",body){
  const base=String(
    env.PUBLIC_WORKER_BASE_URL ||
    "https://hamzehi-social-ai.miladmorab829.workers.dev"
  ).replace(/\/$/,'');

  const url=new URL(base);
  url.pathname=path;
  url.search="";

  const headers={
    Authorization:`Bearer ${env.ADMIN_TOKEN}`
  };

  if(body){
    headers["Content-Type"]="application/json";
  }

  const r=await fetch(url,{
    method,
    headers,
    body:body?JSON.stringify(body):undefined
  });
const responseText = await r.text();


return {
 status:r.status,
 data
};
  await event(env,"autonomy_self_call_diagnostic","self","Self-call diagnostic",{
  path,
  method,
  url:url.toString(),
  status:r.status,
  ok:r.ok
});
  const data=await r.json().catch(()=>({
    ok:false,
    error:`HTTP ${r.status}`
  }));

  return {
    status:r.status,
    data
  };
}
async function revenue(env){
 const r=await env.DB.prepare("SELECT stage,COUNT(*) n FROM leads GROUP BY stage").all(),f={};
 for(const x of r.results||[])f[x.stage]=Number(x.n||0);
 const o=await env.DB.prepare("SELECT COUNT(*) n FROM leads WHERE stage IN ('qualified','contacted','replied','negotiation')").first();
 const c=await env.DB.prepare("SELECT COUNT(*) n FROM leads WHERE stage IN ('customer','converted')").first();
 return {ok:true,funnel:f,opportunities:Number(o?.n||0),conversions:Number(c?.n||0),money:{status:"not_available",reason:"No verified revenue amount field is present in the current data model"}};
}
async function executeTask(env,req,t){
 const p=JSON.parse(t.payload_json||"{}");
 if(t.action==="status")return {ok:true,module:t.module,mode:"observed"};
 if(t.module==="telegram"&&t.action==="inbox_scan")return (await callSelf(req,env,"/api/inbox")).data;
 if(t.module==="telegram"&&t.action==="inbox_reply"){const r=await callSelf(req,env,"/api/inbox");return {ok:r.status<300,mode:"reply_queue",items:r.data.items||[],note:"Reply drafts are queued; no external send is performed by this action."}}
 if(t.module==="content"&&t.action==="generate_and_queue")return (await callSelf(req,env,"/api/content/automation/run","POST",{platform:p.platform||"telegram",market:p.market||"iran_iraq"})).data;
 if(t.module==="ads"&&t.action==="discover_opportunities")return (await callSelf(req,env,"/api/ads/autopilot","POST",p)).data;
 if(t.module==="learning"&&t.action==="run")return (await callSelf(req,env,"/api/learning/run","POST",{})).data;
 if(t.module==="crm"&&t.action==="lead_intelligence")return (await callSelf(req,env,"/api/ads/intelligence")).data;
 if(t.module==="website"&&t.action==="growth_scan")return (await callSelf(req,env,"/api/website/growth")).data;
 if(t.module==="revenue"&&t.action==="funnel_snapshot")return await revenue(env);
 if(t.module==="instagram"&&t.action==="health_and_leads")return (await callSelf(req,env,"/api/settings")).data;
 if(t.module==="whatsapp"&&t.action==="inbox_scan")return (await callSelf(req,env,"/api/inbox")).data;
 throw new Error("Unsupported autonomous action");
}
async function acquire(env,module,taskId){
 const r=await env.DB.prepare("INSERT OR IGNORE INTO autonomy_locks(module,task_id,locked_at) VALUES(?,?,?)").bind(module,taskId,now()).run();
 return Number(r.meta?.changes||0)===1;
}
async function release(env,module,taskId){
 await env.DB.prepare("DELETE FROM autonomy_locks WHERE module=? AND task_id=?").bind(module,taskId).run();
}

async function recoverStaleLocks(env,maxAgeMs=15*60*1000){
 const cutoff=Date.now()-maxAgeMs;
 const rows=await env.DB.prepare(
  "SELECT l.module,l.task_id,l.locked_at,t.status FROM autonomy_locks l LEFT JOIN autonomy_tasks t ON t.id=l.task_id"
 ).all();

 let recovered=0;

 for(const row of rows.results||[]){
  if(row.status!=="running")continue;

  const lockedAt=Date.parse(row.locked_at||"");
  if(!Number.isFinite(lockedAt)||lockedAt>cutoff)continue;

  const t=now();
  const ageMs=Math.max(0,Date.now()-lockedAt);

  const r=await env.DB.prepare(
   "UPDATE autonomy_tasks SET status='failed',error=?,finished_at=?,updated_at=? WHERE id=? AND status='running'"
  ).bind(
   "Stale autonomous lock recovered automatically",
   t,
   t,
   row.task_id
  ).run();

  if(Number(r.meta?.changes||0)!==1)continue;

  await env.DB.prepare(
   "DELETE FROM autonomy_locks WHERE module=? AND task_id=?"
  ).bind(row.module,row.task_id).run();

  recovered++;

  await event(
   env,
   "stale_lock_recovered",
   row.module,
   "Recovered stale autonomous lock",
   {
    task_id:row.task_id,
    locked_at:row.locked_at,
    age_ms:ageMs
   }
  );
 }

 return recovered;
}
export async function runTasks(env,req,limit=20){
 const c=await controls(env);if(c.master!=="on")return {ok:true,paused:true,executed:0,failed:0,blocked:0};
 await recoverStaleLocks(env);
  const rows=await env.DB.prepare("SELECT * FROM autonomy_tasks WHERE status='queued' AND (scheduled_at IS NULL OR scheduled_at<=?) ORDER BY priority DESC,created_at ASC LIMIT ?").bind(now(),limit).all();
 let executed=0,failed=0,blocked=0;
 for(const t of rows.results||[]){
  if(c.modules[t.module]===false||!(await actionEnabled(env,t.module,t.action))){
   await env.DB.prepare("UPDATE autonomy_tasks SET status='blocked',error=?,updated_at=? WHERE id=?").bind("Blocked by module/action control",now(),t.id).run();blocked++;await event(env,"task_blocked",t.module,`Task blocked: ${t.action}`);continue;
  }
  if(!(await acquire(env,t.module,t.id)))continue;
  await env.DB.prepare("UPDATE autonomy_tasks SET status='running',started_at=?,attempts=attempts+1,updated_at=? WHERE id=? AND status='queued'").bind(now(),now(),t.id).run();
  try{
   const result=await executeTask(env,req,t);
   await env.DB.prepare("UPDATE autonomy_tasks SET status='completed',result_json=?,finished_at=?,updated_at=? WHERE id=? AND status='running'").bind(JSON.stringify(result).slice(0,50000),now(),now(),t.id).run();
   executed++;await event(env,"task_completed",t.module,`Completed: ${t.action}`,{task_id:t.id});
  }catch(e){
   failed++;await env.DB.prepare("UPDATE autonomy_tasks SET status='failed',error=?,finished_at=?,updated_at=? WHERE id=?").bind(String(e.message||e).slice(0,2000),now(),now(),t.id).run();
   await event(env,"task_failed",t.module,`Failed: ${t.action}`,{task_id:t.id,error:String(e.message||e)});
  }finally{await release(env,t.module,t.id)}
 }
 return {ok:true,executed,failed,blocked,paused:false};
}
export async function handleAutonomy(env,req){
 if(!["GET","POST"].includes(req.method))return new Response("Method not allowed",{status:405});
 if(!env.ADMIN_TOKEN||req.headers.get("Authorization")!==`Bearer ${env.ADMIN_TOKEN}`)return Response.json({ok:false,error:"Unauthorized"},{status:401});
 const u=new URL(req.url);await ensure(env);
 if(u.pathname==="/api/autonomy/status"){
  const c=await controls(env),counts=await env.DB.prepare("SELECT status,COUNT(*) n FROM autonomy_tasks GROUP BY status").all(),tasks={};
  for(const x of counts.results||[])tasks[x.status]=Number(x.n||0);
  const locks=await env.DB.prepare("SELECT module,task_id,locked_at FROM autonomy_locks").all();
  return Response.json({ok:true,controls:c,tasks,revenue:await revenue(env),active_locks:locks.results||[],fresh_at:now(),architecture:{global_master_gate:true,independent_module_queues:true,independent_module_locks:true,action_gates:true}});
 }
 if(u.pathname==="/api/autonomy/master"&&req.method==="POST"){
  const b=await req.json().catch(()=>({})),a=["on","pause","stop","emergency_stop"].includes(b.action)?b.action:"on";
  await setKV(env,"master",a==="on"?"on":a==="pause"?"paused":"off");await event(env,"master_changed",null,`Master changed to ${a}`);
  return Response.json({ok:true,master:a==="on"?"on":a==="pause"?"paused":"off",action:a});
 }
 if(u.pathname==="/api/autonomy/module"&&req.method==="POST"){
  const b=await req.json().catch(()=>({})),m=String(b.module||"");if(!MODULES.includes(m))return Response.json({ok:false,error:"Unknown module"},{status:400});
  const c=await controls(env);c.modules[m]=!!b.enabled;await setKV(env,"modules",JSON.stringify(c.modules));await event(env,"module_changed",m,`${m} ${b.enabled?"enabled":"disabled"}`);
  return Response.json({ok:true,module:m,enabled:c.modules[m]});
 }
 if(u.pathname==="/api/autonomy/action"&&req.method==="POST"){
  const b=await req.json().catch(()=>({})),m=String(b.module||""),a=String(b.action||"");if(!MODULES.includes(m)||!ACTIONS[m]?.includes(a))return Response.json({ok:false,error:"Unknown module/action"},{status:400});
  const enabled=b.enabled!==false;await env.DB.prepare("INSERT OR REPLACE INTO autonomy_action_controls(module,action,enabled,updated_at) VALUES(?,?,?,?)").bind(m,a,enabled?1:0,now()).run();await event(env,"action_changed",m,`${a} ${enabled?"enabled":"disabled"}`);return Response.json({ok:true,module:m,action:a,enabled});
 }
 if(u.pathname==="/api/autonomy/command"&&req.method==="POST"){
  const b=await req.json().catch(()=>({})),raw=String(b.command||"").trim();if(!raw)return Response.json({ok:false,error:"command is required"},{status:400});
  const plan=await aiPlan(env,raw),cid=uid(),t=now();
  await env.DB.prepare("INSERT INTO autonomy_commands VALUES(?,?,?,?,?,?)").bind(cid,raw,JSON.stringify(plan),"queued",t,t).run();
  for(const x of plan.tasks||[])await env.DB.prepare("INSERT INTO autonomy_tasks(id,command_id,module,action,status,priority,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(uid(),cid,x.module,x.action,"queued",Number(x.priority||50),JSON.stringify(x.payload||{}),t,t).run();
  await event(env,"command_planned",null,`Command planned: ${raw}`,{command_id:cid,source:plan.source,task_count:(plan.tasks||[]).length});
  return Response.json({ok:true,command_id:cid,plan,status:"queued"});
 }
 if(u.pathname==="/api/autonomy/tasks")return Response.json({ok:true,items:(await env.DB.prepare("SELECT * FROM autonomy_tasks ORDER BY created_at DESC LIMIT 100").all()).results||[]});
 if(u.pathname==="/api/autonomy/tasks/run"&&req.method==="POST")return Response.json(await runTasks(env,req,20));
 if(u.pathname==="/api/autonomy/brain"){
  const c=await controls(env),events=await env.DB.prepare("SELECT * FROM autonomy_events ORDER BY created_at DESC LIMIT 30").all(),tasks=await env.DB.prepare("SELECT module,action,status,priority,error,updated_at FROM autonomy_tasks ORDER BY updated_at DESC LIMIT 30").all();
  return Response.json({ok:true,brain:{mission:"Operate independently until MASTER OFF; observe, plan, execute allowed work, verify results and learn.",controls:c,revenue:await revenue(env),active_tasks:tasks.results||[],timeline:events.results||[]}});
 }
 if(u.pathname==="/api/autonomy/opportunities")return Response.json({ok:true,items:(await env.DB.prepare("SELECT id,name,contact,stage,priority,notes,updated_at FROM leads WHERE stage NOT IN ('customer','converted','rejected','archived') ORDER BY updated_at DESC LIMIT 50").all()).results||[]});
 if(u.pathname==="/api/autonomy/revenue")return Response.json(await revenue(env));
 if(u.pathname==="/api/autonomy/errors"){
  const r=await env.DB.prepare("SELECT * FROM retry_queue ORDER BY updated_at DESC LIMIT 50").all(),t=await env.DB.prepare("SELECT * FROM autonomy_tasks WHERE status='failed' ORDER BY updated_at DESC LIMIT 50").all();return Response.json({ok:true,retries:r.results||[],tasks:t.results||[]});
 }
 if(u.pathname==="/api/autonomy/metrics"){
  const r=await env.DB.prepare("SELECT status,COUNT(*) n FROM autonomy_tasks GROUP BY status").all(),x=Object.fromEntries((r.results||[]).map(v=>[v.status,Number(v.n||0)])),total=(x.completed||0)+(x.failed||0)+(x.blocked||0),rate=total?Math.round((x.completed||0)/total*100):0;
  return Response.json({ok:true,total,completed:x.completed||0,failed:x.failed||0,blocked:x.blocked||0,autonomous_rate:rate,target:98,definition:"completed / completed+failed+blocked"});
 }
 return Response.json({ok:false,error:"Not found"},{status:404});
}
export async function runAutonomyScheduled(env,req){
 try{
  if(!(await autonomyMasterGate(env)))
   return {ok:true,paused:true,executed:0,planned:0,reason:"MASTER_OFF"};

  await ensure(env);

  const c=await controls(env);

  const queued=await env.DB
   .prepare("SELECT COUNT(*) n FROM autonomy_tasks WHERE status='queued' AND (scheduled_at IS NULL OR scheduled_at<=?)")
   .bind(now())
   .first();

  let planned=0;

  if(Number(queued?.n||0)===0){

   const cid=uid();
   const t=now();

   const plan={
    goal:"Run a safe scheduled autonomy check using only enabled modules",
    mode:"observe",
    source:"scheduled",
    tasks:[]
   };

   const add=(module,action,priority)=>{
    plan.tasks.push({
     module,
     action,
     payload:{},
     priority
    });
   };

   if(
    c.modules.revenue!==false &&
    await actionEnabled(env,"revenue","funnel_snapshot")
   ){
    add("revenue","funnel_snapshot",90);
   }

   for(const m of MODULES){

    if(m==="revenue" || c.modules[m]===false)
     continue;

    if(await actionEnabled(env,m,"status"))
     add(m,"status",40);
   }

   if(plan.tasks.length){

    await env.DB
     .prepare("INSERT INTO autonomy_commands VALUES(?,?,?,?,?,?)")
     .bind(
      cid,
      "Scheduled autonomy cycle",
      JSON.stringify(plan),
      "queued",
      t,
      t
     )
     .run();

    for(const x of plan.tasks){

     await env.DB
      .prepare("INSERT INTO autonomy_tasks(id,command_id,module,action,status,priority,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .bind(
       uid(),
       cid,
       x.module,
       x.action,
       "queued",
       x.priority,
       "{}",
       t,
       t
      )
      .run();
    }

    await event(
     env,
     "command_planned",
     null,
     "Scheduled autonomy cycle",
     {
      command_id:cid,
      source:"scheduled",
      task_count:plan.tasks.length
     }
    );

    planned=plan.tasks.length;
   }
  }

  const result=await runTasks(env,req,20);

  return {
   ...result,
   planned
  };

 }catch(e){
  return {
   ok:false,
   error:String(e.message||e)
  };
 }
}
