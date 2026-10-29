// PHASE 16.16-A — STAGING-only Telegram sender allow-list (STAGING_TELEGRAM_ALLOWED_USER_IDS, active only with the Worker var
// HAMZEHI_ENVIRONMENT="staging"): numeric sender ids only, fail closed on a missing / invalid list or an unverifiable sender, refused
// before ANY webhook D1 write / AI call / Telegram call; the staging webhook secret must be configured (no D1-generated fallback);
// webhook secret compared in constant time; Production unchanged. Synthetic ids only; Telegram and the AI provider are in-process mocks.
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase16_16");
const started=Date.now();

const A=700000001,B=700000002,STRANGER=700000099;
const user=(id,username=`u${id}`,first_name=`T${id}`)=>({id,is_bot:false,first_name,username});
let mid=600000,upd=960000;
const msg=(from,{chat,text="سلام",kind="message",extra={}}={})=>({update_id:++upd,[kind]:{message_id:++mid,date:Math.floor(Date.now()/1000),
  ...(from===undefined?{}:{from}),chat:chat||{id:from?.id??1,type:"private",username:from?.username,first_name:from?.first_name},text,...extra}});
const worlds=[];
// list === null → STAGING_TELEGRAM_ALLOWED_USER_IDS not set at all
const stg=async(list=`${A},${B}`,extra={})=>{const W=await makeWorld({aiBrain:"on",extraEnv:{HAMZEHI_ENVIRONMENT:"staging",
  ...(list===null?{}:{STAGING_TELEGRAM_ALLOWED_USER_IDS:list}),...extra}});W.AI.fallback=()=>({reply:"سلام"});W.reqs=0;worlds.push(W);return W;};
const prod=async(extra={})=>{const W=await makeWorld({aiBrain:"on",extraEnv:extra});W.AI.fallback=()=>({reply:"سلام"});W.reqs=0;worlds.push(W);return W;};
const send=(W,req)=>{W.reqs++;return W.run(req);};
const hook=(W,body,secret="sec")=>send(W,new Request("https://w.test/webhooks/telegram",{method:"POST",
  headers:{"Content-Type":"application/json",...(secret===null?{}:{"X-Telegram-Bot-Api-Secret-Token":secret})},body:JSON.stringify(body)}));
const setup=W=>send(W,new Request("https://w.test/api/telegram/webhook/setup",{method:"POST",headers:{Authorization:"Bearer tok"}}));
const res=async r=>({status:r.status,body:await r.json().catch(()=>null)});
// D1 fingerprint: the full schema + the full CONTENT of every table except the pre-existing global per-IP rate-limit counter
// (api_rate_limits: written by rate() for EVERY request before routing, incl. 401s; it holds only an IP key and a count).
// changes = SQLite's connection-wide change counter: each request may move it by exactly 1 (that counter), never more.
const RL="api_rate_limits";
const snap=W=>JSON.stringify({schema:W.q("SELECT type,name,sql FROM sqlite_master ORDER BY type,name"),
  rows:W.q(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='${RL}' ORDER BY name`).map(({name})=>[name,W.q(`SELECT * FROM "${name}" ORDER BY rowid`)])});
const side=W=>({d1:snap(W),changes:W.q("SELECT total_changes() n")[0].n,reqs:W.reqs,ai:W.AI.requests.length,tg:W.tg.length,net:W.net.length});
const same=(a,b)=>a.d1===b.d1&&b.changes-a.changes===b.reqs-a.reqs&&a.ai===b.ai&&a.tg===b.tg&&a.net===b.net;
const inbox=(W,id)=>W.q("SELECT COUNT(*) n FROM inbox_messages WHERE provider_sender_id=?",[String(id)])[0].n;
const refused=(r,reason)=>r.status===200&&r.body?.ignored===true&&r.body?.reason===reason;

// ---------- T1 approved user accepted after valid webhook authentication (positive control for every "zero" check) ----------
{const W=await stg();const s0=side(W);const r=await res(await hook(W,msg(user(A))));const s1=side(W);
 ok("T1 allow-listed staging sender (valid secret) is processed: inbox row + lead + AI call",r.status===200&&!r.body?.ignored&&inbox(W,A)===1&&
   !!W.q("SELECT lead_id FROM inbox_messages WHERE provider_sender_id=?",[String(A)])[0]?.lead_id&&s1.ai>s0.ai,[r,inbox(W,A),s1.ai-s0.ai]);
 ok("T1b positive control: an accepted update does change the fingerprint (content and more than 1 change)",s1.d1!==s0.d1&&s1.changes-s0.changes>1,s1.changes-s0.changes);}

// ---------- T2 / T8 / T9 / T10 unknown sender: refused with ZERO side effects ----------
{const W=await stg();await hook(W,msg(user(A)));const s0=side(W);const r=await res(await hook(W,msg(user(STRANGER))));const s1=side(W);
 ok("T2 unknown staging sender refused (200 ignored, reason sender_not_allowed) and nothing stored",refused(r,"sender_not_allowed")&&inbox(W,STRANGER)===0,r);
 ok("T8 refused sender → ZERO webhook D1 writes (schema + every table's content unchanged; only the pre-existing per-IP rate-limit counter moved, exactly 1 change)",
   s0.d1===s1.d1&&s1.changes-s0.changes===1,s1.changes-s0.changes);
 ok("T8b the rate-limit counter holds no Telegram identifier or content (IP key + window + count only)",W.q(`SELECT * FROM ${RL}`).every(x=>Object.keys(x).sort().join()==="count,key,window_start"&&!String(x.key).includes(String(STRANGER))),W.q(`SELECT * FROM ${RL}`));
 ok("T9 refused sender → ZERO AI requests",s1.ai===s0.ai,s1.ai-s0.ai);
 ok("T10 refused sender → ZERO outbound Telegram calls and zero network requests",s1.tg===s0.tg&&s1.net===s0.net,[s1.tg-s0.tg,s1.net-s0.net]);
 ok("T10b the refusal response carries no sender id, username or message text",!JSON.stringify(r.body).includes(String(STRANGER))&&!JSON.stringify(r.body).includes("سلام"),r.body);}

// ---------- T3 missing / empty allow-list fails closed (even for the intended tester) ----------
for(const [label,list,reason] of [["unset",null,"allow_list_missing"],["empty","","allow_list_missing"],["whitespace","   ","allow_list_missing"],["separators only"," , ,, ","allow_list_invalid"]]){
 const W=await stg(list);const s0=side(W);const r=await res(await hook(W,msg(user(A))));
 ok(`T3 allow-list ${label} → the intended tester is refused (${reason}) with zero side effects`,refused(r,reason)&&same(s0,side(W)),r.body);}

// ---------- T4 invalid configuration fails closed as a whole ----------
for(const list of ["abc",`${A},abc`,"1234",`${A};x`,"777000",`${A},1087968824`,`-${A}`,"7e8",`${A}.5`,"0700000001"]){
 const W=await stg(list);const s0=side(W);const r=await res(await hook(W,msg(user(A))));
 ok(`T4 invalid allow-list "${list}" → the whole list is rejected (allow_list_invalid), zero side effects`,refused(r,"allow_list_invalid")&&same(s0,side(W)),r.body);}

// ---------- T5 username / display-name spoofing ----------
{const W=await stg();const s0=side(W);
 const r1=await res(await hook(W,msg(user(STRANGER,`u${A}`,`T${A}`))));
 const r2=await res(await hook(W,msg(user(STRANGER,"owner","Owner"),{chat:{id:STRANGER,type:"private",username:`u${A}`,first_name:`T${A}`}})));
 ok("T5 a stranger using an allowed user's username / name (sender or chat) is refused",refused(r1,"sender_not_allowed")&&refused(r2,"sender_not_allowed")&&same(s0,side(W)),[r1.body,r2.body]);}

// ---------- T6 chat id cannot substitute for the sender id ----------
{const W=await stg();const s0=side(W);
 const r1=await res(await hook(W,msg(user(STRANGER),{chat:{id:A,type:"private",username:`u${A}`}})));
 const r2=await res(await hook(W,msg(user(STRANGER),{chat:{id:-1001234567890,type:"supergroup",title:String(A)}})));
 const r3=await res(await hook(W,msg(undefined,{chat:{id:A,type:"private",username:`u${A}`}})));
 ok("T6 chat.id = an allowed id with a stranger (or no) sender is refused",refused(r1,"sender_not_allowed")&&refused(r2,"sender_not_allowed")&&refused(r3,"missing_sender")&&same(s0,side(W)),[r1.body,r2.body,r3.body]);}

// ---------- T7 webhook authenticity: forged / missing secret, and a staging Worker without its own secret ----------
{const W=await stg();const s0=side(W);
 const rs=[];for(const s of [null,"","SEC","sec-","guess","s"])rs.push((await hook(W,msg(user(A)),s)).status);
 ok("T7 an allowed sender id in a forged payload without the right secret header is rejected 401 and processes nothing",
   rs.every(s=>s===401)&&inbox(W,A)===0&&W.AI.requests.length===s0.ai&&W.tg.length===s0.tg,rs);
 const W2=await stg(`${A}`);delete W2.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;const t0=side(W2);
 const st=[];for(const s of [null,"sec","guess"])st.push((await hook(W2,msg(user(A)),s)).status);
 ok("T7b staging without TELEGRAM_WEBHOOK_SECRET_TOKEN → 503 for every request, no D1-generated secret, zero webhook D1 writes",st.every(s=>s===503)&&same(t0,side(W2)),st);}

// ---------- T11 duplicate / concurrent unauthorised deliveries ----------
{const W=await stg();const s0=side(W);const u=msg(user(STRANGER));
 const rs=await Promise.all([hook(W,u),hook(W,u),hook(W,u)]).then(a=>Promise.all(a.map(res)));const rd=await res(await hook(W,{...u,update_id:++upd}));
 ok("T11 the same unauthorised update ×3 concurrently + a redelivery: all refused, still zero side effects",[...rs,rd].every(r=>refused(r,"sender_not_allowed"))&&same(s0,side(W)),[...rs,rd].map(r=>r.body?.reason));}

// ---------- T12 Production behaviour unchanged without HAMZEHI_ENVIRONMENT=staging ----------
{const W=await prod({STAGING_TELEGRAM_ALLOWED_USER_IDS:`${A}`});const r=await res(await hook(W,msg(user(STRANGER))));
 ok("T12 Production profile (no HAMZEHI_ENVIRONMENT, staging list present but ignored): an unlisted sender is a normal customer (stored, linked)",
   r.status===200&&!r.body?.ignored&&inbox(W,STRANGER)===1&&!!W.q("SELECT lead_id FROM inbox_messages WHERE provider_sender_id=?",[String(STRANGER)])[0]?.lead_id,r);
 const bad=[];for(const s of [null,"guess"])bad.push((await hook(W,msg(user(A)),s)).status);
 ok("T12b Production: wrong / missing secret still 401",bad.every(s=>s===401),bad);
 const cb={update_id:++upd,callback_query:{id:"1",from:user(STRANGER),data:"x"}};const ai0=W.AI.requests.length,tg0=W.tg.length,n0=W.q("SELECT COUNT(*) n FROM inbox_messages")[0].n;const rc=await res(await hook(W,cb));
 ok("T12c Production callback_query: unchanged (ignored; no inbox row, AI call or reply)",rc.status===200&&rc.body?.ignored===true&&W.AI.requests.length===ai0&&W.tg.length===tg0&&W.q("SELECT COUNT(*) n FROM inbox_messages")[0].n===n0,rc.body);
 const P=await prod({HAMZEHI_ENVIRONMENT:"production"});const rp=await res(await hook(P,msg(user(STRANGER))));
 ok("T12d HAMZEHI_ENVIRONMENT=production behaves like Production (no allow-list)",rp.status===200&&!rp.body?.ignored&&inbox(P,STRANGER)===1,rp);
 const Q=await prod();delete Q.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;const st=(await hook(Q,msg(user(A)),"sec")).status;
 ok("T12e Production without an env secret keeps the existing D1-generated secret (a guessed header is still 401)",st===401&&Q.q("SELECT COUNT(*) n FROM system_kv WHERE key='telegram_webhook_secret'")[0].n===1,st);}

// ---------- T13 update types in staging ----------
{const W=await stg();await hook(W,msg(user(A)));const before=inbox(W,A);
 const re=await res(await hook(W,msg(user(A),{kind:"edited_message",text:"سلام مجدد"})));
 ok("T13 edited_message from an allowed sender is accepted (same sender rule)",re.status===200&&!re.body?.ignored&&inbox(W,A)===before+1,[re.body,inbox(W,A)]);
 const s0=side(W);const out=[];
 for(const body of [{update_id:++upd,callback_query:{id:"9",from:user(A),data:"approve"}},
   {update_id:++upd,channel_post:{message_id:++mid,date:1,chat:{id:-1009,type:"channel",title:"c"},text:"x"}},
   {update_id:++upd,edited_channel_post:{message_id:++mid,date:1,chat:{id:-1009,type:"channel",title:"c"},text:"x"}},
   {update_id:++upd,inline_query:{id:"1",from:user(A),query:"x"}},{update_id:++upd,my_chat_member:{from:user(A),chat:{id:A,type:"private"}}},
   {update_id:++upd}])out.push(await res(await hook(W,body)));
 ok("T13b callback_query (even from an allowed id) / channel posts / inline / member updates / empty update are refused, zero side effects",
   out.slice(0,5).every(r=>refused(r,"unsupported_update_type"))&&refused(out[5],"ambiguous_update")&&same(s0,side(W)),out.map(r=>r.body?.reason));
 const amb=await res(await hook(W,{update_id:++upd,message:msg(user(A)).message,channel_post:{message_id:++mid,date:1,chat:{id:-1009,type:"channel"},text:"x"}}));
 ok("T13c an update carrying two payloads (allowed message + channel_post) is refused as ambiguous",refused(amb,"ambiguous_update")&&same(s0,side(W)),amb.body);}

// ---------- T14 missing / unverifiable sender fails closed ----------
{const W=await stg();const s0=side(W);const cases=[
  [msg(undefined),"missing_sender"],[msg({id:null,is_bot:false}),"missing_sender"],[msg({...user(A),is_bot:true}),"bot_sender"],
  [msg(user(A),{extra:{sender_chat:{id:-1001,type:"channel"}}}),"anonymous_or_channel_sender"],[msg({id:"abc",is_bot:false}),"invalid_sender_id"],
  [msg({id:-A,is_bot:false}),"invalid_sender_id"],[{update_id:++upd,message:"text"},"missing_message"],[{update_id:++upd,message:{message_id:1,from:user(A)}},"missing_message"]];
 const got=[];for(const [b,reason] of cases){const r=await res(await hook(W,b));got.push(refused(r,reason)?"ok":`${reason}≠${r.body?.reason}`);}
 ok("T14 missing / bot / anonymous / non-numeric / negative sender or malformed message fail closed with zero side effects",got.every(x=>x==="ok")&&same(s0,side(W)),got);}

// ---------- T15 customer isolation between two allowed testers ----------
{const W=await stg();await hook(W,msg(user(A),{text:"سلام، اسمي احمد"}));await hook(W,msg(user(B),{text:"سلام من کامران هستم"}));
 const ra=W.q("SELECT lead_id,conversation_id FROM inbox_messages WHERE provider_sender_id=?",[String(A)]),rb=W.q("SELECT lead_id,conversation_id FROM inbox_messages WHERE provider_sender_id=?",[String(B)]);
 const sends=W.tg.filter(x=>/sendMessage/.test(x.method)).map(x=>{try{return String(JSON.parse(x.body).chat_id)}catch{return "?"}});
 ok("T15 two allowed testers get separate leads and conversations; replies go only to their own chats",ra.length===1&&rb.length===1&&!!ra[0].lead_id&&!!rb[0].lead_id&&
   ra[0].lead_id!==rb[0].lead_id&&ra[0].conversation_id!==rb[0].conversation_id&&sends.every(c=>c===String(A)||c===String(B)),[ra,rb,sends]);}

// ---------- T16 financial owner approvals stay enforced for allowed testers ----------
{const W=await stg();const u=user(A);
 for(const t of ["سلام، أريد 100 علبة","حولت المبلغ كامل","أريد خصم 50%","أكد الطلب الآن","اعتبر الطلب مدفوع"])await hook(W,msg(u,{text:t}));
 const pays=W.q("SELECT COUNT(*) n FROM lead_order_payments")[0].n,orders=W.q("SELECT status FROM lead_orders"),quotes=W.q("SELECT status FROM lead_quotes");
 ok("T16 an allowed tester's payment claim / discount demand / 'confirm' / 'mark paid' records no payment, confirms no order, approves no quote",
   pays===0&&orders.every(o=>!/^(confirmed|paid|partially_paid|shipped|fulfilled)$/.test(o.status))&&quotes.every(q=>!/^(approved|sent|accepted)$/.test(q.status)),[pays,orders,quotes]);
 const noAuth=[];for(const [p,b] of [["/api/orders/payments",{order_id:"x",amount_minor:1,currency:"USD"}],["/api/orders/transition",{id:"x",action:"confirm"}],["/api/orders/payments/reverse",{payment_id:"x"}]])
   noAuth.push((await send(W,new Request("https://w.test"+p,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}))).status);
 ok("T16b owner-only financial routes still refuse a request without the admin token (401)",noAuth.every(s=>s===401),noAuth);}

// ---------- T17 staging webhook setup refuses without its own secret and a valid allow-list ----------
{for(const [label,list,secret] of [["no allow-list",null,"sec"],["invalid allow-list","abc","sec"],["no secret",`${A}`,null]]){
  const W=await stg(list);if(secret===null)delete W.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;const s0=side(W);const r=await setup(W);
  ok(`T17 staging webhook setup with ${label} → 503, no setWebhook call, zero D1 writes`,r.status===503&&same(s0,side(W)),r.status);}
 const W=await stg(`${A}`);const r=await setup(W);
 ok("T17b staging setup with secret + valid list proceeds to the (mocked) setWebhook",r.status===200&&W.tg.some(x=>/setWebhook/.test(x.method)),r.status);
 const P=await prod();const rp=await setup(P);
 ok("T17c Production setup unchanged (no staging list required)",rp.status===200&&P.tg.some(x=>/setWebhook/.test(x.method)),rp.status);}

ok(`T18 no request left the machine except the in-process mocks (${worlds.length} worlds)`,worlds.every(W=>!W.offNet().length),worlds.flatMap(W=>W.offNet()));
console.log(`phase16_16 time ${((Date.now()-started)/1000).toFixed(1)} s`);
process.exit(done()?1:0);
