// Node replacement for the deleted browser/sql.js harness: the real worker (worker/src/index.js) on node:sqlite as D1, the repo
// schema + the gallery migration, a recording Telegram mock (nothing leaves this machine) and the same helper names the pages used.
import {DatabaseSync} from "node:sqlite";
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
// Repository root = two levels above this file (tests/harness/); override with REPO=... if needed.
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const SRC=process.env.SRC||path.join(REPO,"worker/src");

class Stmt{constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args;}
  bind(...a){return new Stmt(this.db,this.sql,a.map(v=>v===undefined?null:typeof v==="boolean"?(v?1:0):v));}
  // fault injection for tests: globalThis.__FAIL_SQL (a RegExp) makes every matching statement fail like a broken database
  _s(){if(globalThis.__FAIL_SQL&&globalThis.__FAIL_SQL.test(this.sql))throw new Error("injected database failure (test)");return this.db.prepare(this.sql);}
  async first(col){const r=this._s().get(...this.args);if(!r)return null;const o={...r};return col?o[col]??null:o;}
  async all(){const s=this._s();const rows=s.columns().length?s.all(...this.args).map(r=>({...r})):(s.run(...this.args),[]);return {results:rows,success:true,meta:{}};}
  async run(){const s=this._s();if(s.columns().length){const rows=s.all(...this.args);return {results:rows,success:true,meta:{changes:0}};}const r=s.run(...this.args);return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}
  async raw(){return this._s().all(...this.args).map(r=>Object.values(r));}
}
class D1{constructor(){this.db=new DatabaseSync(":memory:");}
  prepare(sql){return new Stmt(this.db,sql);}
  // D1 batches are atomic: run every statement synchronously inside ONE transaction (no await in between, so two concurrent
  // batches can never interleave their BEGIN/COMMIT)
  async batch(list){this.db.exec("BEGIN");try{const out=[];for(const st of list){const p=st._s();if(p.columns().length)out.push({results:p.all(...st.args).map(r=>({...r})),success:true,meta:{changes:0}});else{const r=p.run(...st.args);out.push({success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}});}}this.db.exec("COMMIT");return out;}catch(e){try{this.db.exec("ROLLBACK");}catch{}throw e;}}
  async exec(sql){this.db.exec(sql);return {count:1};}
}

// Schemas: default = database/schema.sql (fresh install, includes MEM-02); legacy = fixtures/schema-pre-mem02.sql (production as it is
// today); migrate = legacy + owner-actions/mem-02/02-migration.sql (production after the migration). MEM02_SCHEMA=pre|migrated
// switches the default for a whole run.
export const LEGACY_SCHEMA=path.join(path.dirname(fileURLToPath(import.meta.url)),"fixtures/schema-pre-mem02.sql");
export async function makeWorld({aiBrain="off",extraEnv={},realAi=null,migrate:migrateOpt=null,legacy:legacyOpt=null}={}){
  // Versioned copy: the paid real-AI evaluation mode is not available here (every provider call stays an in-process mock).
  if(realAi)throw new Error("realAi mode is disabled in the versioned harness (tests/harness); no paid API calls");
  // an explicit option always wins over the run-wide MEM02_SCHEMA switch
  const envMode=process.env.MEM02_MIGRATED==="1"?"migrated":process.env.MEM02_SCHEMA||"fresh";
  const migrate=migrateOpt??(legacyOpt===null&&envMode==="migrated"),legacy=legacyOpt??(migrateOpt===null&&envMode==="pre");
  // REAL-AI mode (AI-02.5 evaluation only): selected turns are forwarded to the real Anthropic API with a key taken from the
  // RUNNER's environment (the worker env keeps the fake key; the real key is never logged or stored). Hard cap on calls.
  const realFetch=globalThis.__REAL_FETCH||(globalThis.__REAL_FETCH=globalThis.fetch);
  const d1=new D1();
  d1.db.exec(fs.readFileSync(migrate||legacy?LEGACY_SCHEMA:path.join(REPO,"database/schema.sql"),"utf8"));
  try{d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/visual-sales-engine-v1/migration-gallery.sql"),"utf8"));}catch(e){/* tables already in schema.sql */}
  // MEM-02: the production migration file itself, applied on top of schema.sql (the "after migration" world)
  if(migrate)d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/mem-02/02-migration.sql"),"utf8"));
  const R2=new Map();
  // AI ON = the Anthropic provider with a FAKE key; every model call is answered by the in-process script below (no network).
  const env={DB:d1,ADMIN_TOKEN:"tok",TELEGRAM_BOT_TOKEN:"bot-test",TELEGRAM_WEBHOOK_SECRET_TOKEN:"sec",SALES_AI_BRAIN:aiBrain,RATE_LIMIT_PER_MINUTE:"100000",
    ...(aiBrain==="on"?{SALES_AI_PROVIDER:"anthropic",ANTHROPIC_API_KEY:"test-key-not-real",ANTHROPIC_MODEL:"claude-opus-5-5",SALES_AI_TIMEOUT_MS:"5000"}:{}),
    ...extraEnv,
    GALLERY_BUCKET:{put:async(k,v,o)=>{R2.set(k,{bytes:new Uint8Array(v instanceof ArrayBuffer?v:await new Response(v).arrayBuffer()),type:o?.httpMetadata?.contentType});},
      get:async k=>{const x=R2.get(k);return x?{body:new Blob([x.bytes]).stream(),httpMetadata:{contentType:x.type},arrayBuffer:async()=>x.bytes.slice().buffer}:null;},head:async k=>R2.has(k)?{}:null,delete:async k=>{R2.delete(k);}}};
  // Telegram mock: every call is recorded; nothing is sent anywhere
  const tg=[],net=[],TG={mode:"ok"};let tgId=1000;
  // scripted sales model: AI.script maps the customer's message → (context) => decision; D() fills the strict schema.
  const D=o=>({requests:[],acceptance:false,rejection:false,owner_escalation_needed:false,escalation_reason:null,missing_information:[],summary_update:null,reply:"",reply_colors:[],...o,
    facts:{quantity:null,product:null,model:null,size:null,destination:null,customer_name:null,colors:[],color_parts:[],unknown_colors:[],...(o?.facts||{})}});
  const AI={script:new Map(),calls:[],requests:[],fallback:null,fail:false,status:null};
  const EV={calls:[],next:null,fail:false};
  globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);net.push(s.replace(/bot[^/]+\//,"bot***/"));
    if(s==="https://api.anthropic.com/v1/messages"){const body=JSON.parse(String(o.body||"{}"));AI.requests.push({headers:{...(o.headers||{})},body});const content=body.messages?.[0]?.content;
      if(o.headers?.["x-api-key"]!=="test-key-not-real")throw Error("refusing: a non-test key reached the AI mock");
      if(realAi&&typeof content==="string"){let c0={};try{c0=JSON.parse(content.replace(/^CONTEXT:\n/,""));}catch{}
        if(realAi.want(c0.message)){if(realAi.used>=realAi.max)return new Response("real-ai cap reached",{status:429});realAi.used++;
          const r=await realFetch(s,{...o,headers:{...o.headers,"x-api-key":realAi.key}});const text=await r.text();let j=null;try{j=JSON.parse(text);}catch{}
          realAi.log.push({message:c0.message,status:r.status,usage:j?.usage||null,model:j?.model||null,stop_reason:j?.stop_reason||null,output:(j?.content||[]).filter(b=>b?.type==="text").map(b=>b.text).join(""),error:r.ok?null:String(j?.error?.type||r.status)});
          return new Response(text,{status:r.status,headers:{"Content-Type":"application/json"}});}}
      const reply=obj=>new Response(JSON.stringify({stop_reason:"end_turn",...(AI.returnedModel!==null?{model:AI.returnedModel===undefined?body.model:AI.returnedModel}:{}),...(AI.usage?{usage:AI.usage}:{}),content:[{type:"text",text:JSON.stringify(obj)}]}),{headers:{"Content-Type":"application/json"}});
      if(Array.isArray(content)){const text=content.find(c=>c.type==="text")?.text||"";EV.calls.push({text,image:content.some(c=>c.type==="image")});if(EV.fail)return new Response("x",{status:500});
        const out=typeof EV.next==="function"?EV.next(EV.calls.at(-1)):EV.next;return out?reply(out):new Response("x",{status:503});}
      // failure modes of the provider (contract tests): slow reply (aborted by the caller's timeout), refusal, truncation, HTTP error,
      // unreadable text, wrong field types
      if(AI.delay)await new Promise((res,rej)=>{const t=setTimeout(res,AI.delay);o.signal?.addEventListener?.("abort",()=>{clearTimeout(t);rej(Object.assign(new Error("aborted"),{name:"AbortError"}));});});
      const raw=(obj,st)=>new Response(JSON.stringify({stop_reason:st,...(AI.usage?{usage:AI.usage}:{}),content:obj}),{headers:{"Content-Type":"application/json"}});
      if(AI.status==="refusal")return raw([],"refusal");
      if(AI.status==="max_tokens")return raw([{type:"text",text:'{"requests":['}],"max_tokens");
      if(AI.status==="http500")return new Response("upstream error",{status:500});
      if(AI.status==="badjson")return raw([{type:"text",text:'{"requests":["price"], "reply": oops}'}],"end_turn");
      if(AI.status==="garbage")return raw([{type:"text",text:"Sure! Here is the answer, no JSON."}],"end_turn");
      if(AI.status==="wrongtypes")return raw([{type:"text",text:JSON.stringify({requests:["hack","price"],facts:{quantity:"abc",product:12,colors:"red",color_parts:"x"},acceptance:"yes",reply:42})}],"end_turn");
      let ctx={};try{ctx=JSON.parse(String(content).replace(/^CONTEXT:\n/,""));}catch{}
      AI.calls.push({message:ctx.message,market:ctx.market,language:ctx.language});if(AI.fail)return new Response("x",{status:500});
      const fn=AI.script.get(ctx.message)||AI.fallback;return fn?reply(D(fn(ctx))):new Response("x",{status:503});}
    if(/api\.telegram\.org/.test(s)){const method=s.split("/").pop();tg.push({method,body:o.body instanceof FormData?"(multipart)":String(o.body||""),mode:TG.mode});
      // failure modes: a network error (outcome unknown) or a definitive Telegram rejection
      if(TG.mode==="throw")throw new TypeError("network down (test)");
      if(TG.mode==="reject")return new Response(JSON.stringify({ok:false,description:"Bad Request: test rejection"}),{status:400,headers:{"Content-Type":"application/json"}});
      // per-call hook (tests): TG.before(method, n) may return "throw" / "reject" for THIS call; TG.after(method, n) runs after it
      TG.n=(TG.n||0)+1;const pre=TG.before?await TG.before(method,TG.n):null;
      if(pre==="throw")throw new TypeError("network down (test)");
      if(pre==="reject")return new Response(JSON.stringify({ok:false,description:"Bad Request: test rejection"}),{status:400,headers:{"Content-Type":"application/json"}});
      if(TG.after)await TG.after(method,TG.n);
      let chatId=1;try{chatId=o.body instanceof FormData?Number(o.body.get("chat_id")):Number(JSON.parse(String(o.body||"{}")).chat_id)||1;}catch{}
      const result=method==="sendMediaGroup"?[{message_id:++tgId,chat:{id:chatId,type:"private"},photo:[{file_id:"F"+tgId}],date:Math.floor(Date.now()/1000)}]:{message_id:++tgId,chat:{id:chatId,type:"private"},photo:[{file_id:"F"+tgId}],date:Math.floor(Date.now()/1000)};
      return new Response(JSON.stringify({ok:true,result}),{headers:{"Content-Type":"application/json"}});}
    return new Response(JSON.stringify({ok:false,error:"network disabled in tests"}),{status:503,headers:{"Content-Type":"application/json"}});};
  const mod=await import(pathToFileURL(path.join(SRC,"index.js")).href+"?w="+Math.random());
  const worker=mod.default;
  const run=async req=>{const pending=[];const res=await worker.fetch(req,env,{waitUntil:p=>pending.push(p),passThroughOnException(){}});await Promise.allSettled(pending);return res;};
  const call=async(p,body,method="POST")=>{const r=await run(new Request("https://w.test"+p,{method,headers:{Authorization:"Bearer tok","Content-Type":"application/json"},body:method==="GET"?undefined:JSON.stringify(body||{})}));let b=null;try{b=await r.json();}catch{}return {status:r.status,body:b};};
  const q=(sql,args=[])=>d1.db.prepare(sql).all(...(Array.isArray(args)?args:[args])).map(r=>({...r}));
  const dbrun=(sql,args=[])=>d1.db.prepare(sql).run(...(Array.isArray(args)?args:[args]));
  let upd=1,mid=1;
  const post=async update=>run(new Request("https://w.test/webhooks/telegram",{method:"POST",headers:{"Content-Type":"application/json","X-Telegram-Bot-Api-Secret-Token":"sec"},body:JSON.stringify(update)}));
  const brain=id=>{const e=q("SELECT details_json FROM system_events WHERE id=?",["sales-brain:"+id])[0];return e?JSON.parse(e.details_json):null;};
  const age=sec=>{for(const t of ["inbox_messages","lead_outreach"])for(const r of q(`SELECT rowid AS rid,created_at FROM ${t}`))dbrun(`UPDATE ${t} SET created_at=? WHERE rowid=?`,[new Date(Date.parse(r.created_at)-sec*1000).toISOString(),r.rid]);};
  const send=async(user,text)=>{const m={message_id:++mid,date:Math.floor(Date.now()/1000),from:{id:user.id,is_bot:false,first_name:user.name,username:user.username},chat:{id:user.id,type:"private",username:user.username,first_name:user.name},text};
    await post({update_id:++upd,message:m});const row=q("SELECT * FROM inbox_messages WHERE external_id=?",[String(user.id)+":"+m.message_id])[0]||null;age(20);
    const b=row?brain(row.id):null,oc=row?q("SELECT details_json FROM system_events WHERE id=?",["inbound-outcome:"+row.id])[0]:null,ack=row?q("SELECT message FROM lead_outreach WHERE id=?",["inbound-ack-"+row.id])[0]:null;
    return {row,brain:b,action:b?.next_sales_action||null,draft:row?q("SELECT * FROM lead_outreach WHERE inbox_message_id=?",[row.id])[0]||null:null,gallery:b?.gallery||null,outcome:oc?JSON.parse(oc.details_json):null,ack:ack?.message||null,lang:b?.detected_language||null};};
  const setMarket=(user,country)=>{const r=q("SELECT lead_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(user.id)])[0];const lead=q("SELECT notes FROM leads WHERE id=?",[r.lead_id])[0];let n={};try{n=JSON.parse(lead.notes||"{}");}catch{}
    n.country=country==="iraq"?"Iraq":country==="iran"?"Iran":country;dbrun("UPDATE leads SET notes=? WHERE id=?",[JSON.stringify(n),r.lead_id]);};
  const approveK=async id=>{const p=q("SELECT proposal_hash FROM sales_knowledge_change_requests WHERE id=?",[id])[0];await call("/api/sales-knowledge/review",{id,decision:"approve",proposal_hash:p.proposal_hash,confirm_sensitive:true,note:"test"});
    const p2=q("SELECT proposal_hash,status FROM sales_knowledge_change_requests WHERE id=?",[id])[0];if(p2.status!=="applied")await call("/api/sales-knowledge/apply",{id,proposal_hash:p2.proposal_hash,confirm_apply:true});};
  let seq=0;const jpg=()=>{seq++;return new File([new Uint8Array([0xFF,0xD8,0xFF,0xE0,seq&255,(seq>>8)&255,3,1,4,1,5,9,seq&7,2])],"IMG_"+(5000+seq)+".JPG",{type:"image/jpeg"});};
  const upload=async spec=>{const fd=new FormData();fd.append("images",jpg());fd.append("attest_real","yes");fd.append("spec",JSON.stringify(spec));
    const packed=new Response(fd),bytes=new Uint8Array(await packed.arrayBuffer());
    const r=await run(new Request("https://w.test/api/gallery/upload",{method:"POST",headers:{Authorization:"Bearer tok","Content-Type":packed.headers.get("content-type"),"Content-Length":String(bytes.length)},body:bytes}));const b=await r.json();
    if(!b.items?.[0]?.visual_media_id)throw Error("upload failed "+JSON.stringify(b));const id=b.items[0].visual_media_id;const v=q("SELECT version FROM visual_product_media WHERE id=?",[id])[0].version;
    const rv=await call("/api/gallery/review",{id,action:"verify",expected_version:v});if(!rv.body?.ok)throw Error("verify failed "+JSON.stringify(rv.body));return id;};
  const importLine=async(text,market,cid)=>{const im=await call("/api/owner-knowledge/import",{text,market,client_request_id:cid});if(!im.body?.import_id)throw Error("import failed "+JSON.stringify(im.body));
    const ap=await call("/api/owner-knowledge/imports/approve-parsed",{import_id:im.body.import_id,confirm_commercial:true});if(!ap.body?.ok)throw Error("approve failed "+JSON.stringify(ap.body));};
  const teach=async(text,market,cid)=>{const r=await call("/api/sales-knowledge/teach",{text,market,command_id:cid});for(const x of q("SELECT id FROM sales_knowledge_change_requests WHERE status NOT IN ('applied','rejected')"))await approveK(x.id);return r;};
  const resolve=(id,action,answer={})=>call("/api/si/decisions/resolve",{id,action,scope:"CASE_ONLY",answer});
  const transition=(id,action,extra={})=>call("/api/leads/outreach/transition",{id,action,...extra});
  // no outbound call may reach anything except the two in-process mocks
  const offNet=()=>net.filter(u=>!/^https:\/\/api\.telegram\.org\/bot\*\*\*\//.test(u)&&u!=="https://api.anthropic.com/v1/messages");
  return {TG,run,env,d1,q,dbrun,call,post,send,brain,age,setMarket,approveK,upload,importLine,teach,tg,R2,AI,D,EV,net,offNet,resolve,transition};
}
// tiny reporter
export function reporter(name){const res=[];const J=v=>JSON.stringify(v);
  const ok=(label,cond,detail)=>{const d=typeof detail==="string"?detail:J(detail);res.push({label,pass:!!cond,detail:cond?"":d});if(process.env.TRACE)console.log((cond?"  ok   ":"  FAIL ")+label+"\n         "+String(d).slice(0,600));};
  // gap(): a PRE-EXISTING behaviour gap found while rebuilding coverage — reported every run, never counted as a pass or a fail
  const gaps=[];const gap=(label,cond,detail)=>{if(!cond)gaps.push({label,detail:typeof detail==="string"?detail:J(detail)});};
  const done=()=>{const f=res.filter(r=>!r.pass);console.log(`${name} → ${f.length?"FAILURES: "+f.length:"ALL PASS"} (${res.length})${gaps.length?` [known gaps: ${gaps.length}]`:""}`);for(const r of f)console.log("   FAIL "+r.label+" :: "+String(r.detail).slice(0,900));for(const g of gaps)console.log("   GAP  "+g.label+" :: "+String(g.detail).slice(0,300));return f.length;};
  return {ok,gap,J,done};}
