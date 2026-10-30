// PHASE 17.1 — Telegram webhook secret: never generated or written to D1 (env secret first, legacy D1 row read-only), fail closed
// without either; Google-originated leads (flag, place ID or Places provider) need an INDEPENDENT contact (owner-confirmed or a
// non-Google page) before a first contact or an outreach draft. Synthetic data only; Telegram and OpenAI are in-process mocks.
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase17_1");

const kvRows=W=>{try{return W.q("SELECT COUNT(*) n FROM system_kv WHERE key='telegram_webhook_secret'")[0].n;}catch{return 0;}};
let uid=880000;
const upd=(from=710000001)=>({update_id:++uid,message:{message_id:uid,date:Math.floor(Date.now()/1000),from:{id:from,is_bot:false,first_name:"T"},chat:{id:from,type:"private",first_name:"T"},text:"سلام"}});
const hook=(W,secret,body=upd())=>W.run(new Request("https://w.test/webhooks/telegram",{method:"POST",
  headers:{"Content-Type":"application/json",...(secret?{"X-Telegram-Bot-Api-Secret-Token":secret}:{})},body:JSON.stringify(body)}));
const setup=W=>W.run(new Request("https://w.test/api/telegram/webhook/setup",{method:"POST",headers:{Authorization:"Bearer tok"}}));
const inboxN=W=>W.q("SELECT COUNT(*) n FROM inbox_messages")[0].n;
const setWebhooks=W=>W.tg.filter(x=>x.method==="setWebhook");
const LEGACY="legacy-d1-test-secret";

// ================= Stage 1 — Telegram webhook secret =================
{const W=await makeWorld({aiBrain:"off"});
 const r=await hook(W,"sec"),bad=await hook(W,"guess");
 ok("S1 env secret configured: authorized inbound is processed (200 + inbox row), a wrong secret is 401, and no D1 secret is ever written",
   r.status===200&&inboxN(W)===1&&bad.status===401&&kvRows(W)===0,[r.status,bad.status,inboxN(W),kvRows(W)]);
 const s=await setup(W),calls=setWebhooks(W);let tok=null;try{tok=JSON.parse(calls[0]?.body||"{}").secret_token;}catch{}
 ok("S2 setup registers the env secret with Telegram (setWebhook) and still stores no D1 secret",s.status===200&&calls.length===1&&tok==="sec"&&kvRows(W)===0,[s.status,calls.length,kvRows(W)]);}

{const W=await makeWorld({aiBrain:"off"});delete W.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;
 const st=[];for(const s of [null,"guess","sec"])st.push((await hook(W,s)).status);
 const s=await setup(W);
 ok("S3 neither env secret nor legacy row: every delivery is refused (503), setup refuses (503) without calling Telegram, nothing is generated or stored",
   st.every(x=>x===503)&&s.status===503&&setWebhooks(W).length===0&&kvRows(W)===0&&inboxN(W)===0,[st,s.status,kvRows(W)]);}

{const W=await makeWorld({aiBrain:"off"});delete W.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;
 W.d1.db.exec("CREATE TABLE IF NOT EXISTS system_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
 W.dbrun("INSERT INTO system_kv(key,value,updated_at) VALUES('telegram_webhook_secret',?,?)",[LEGACY,"2026-09-16T18:47:35Z"]);
 const before=W.q("SELECT value,updated_at FROM system_kv WHERE key='telegram_webhook_secret'")[0];
 const good=await hook(W,LEGACY),bad=await hook(W,"guess");
 const after=W.q("SELECT value,updated_at FROM system_kv WHERE key='telegram_webhook_secret'")[0];
 ok("S4 compatibility: the existing (legacy) D1 secret still authenticates Telegram (200 + inbox row); a guess is 401; the row is read, never rewritten",
   good.status===200&&inboxN(W)===1&&bad.status===401&&kvRows(W)===1&&after.value===before.value&&after.updated_at===before.updated_at,[good.status,bad.status]);
 W.env.TELEGRAM_WEBHOOK_SECRET_TOKEN="rotated-env";
 const viaEnv=await hook(W,"rotated-env"),viaOld=await hook(W,LEGACY);
 ok("S5 once the Worker secret is set it takes precedence: the env value authenticates, the legacy D1 value is refused (401)",viaEnv.status===200&&viaOld.status===401,[viaEnv.status,viaOld.status]);}

{const W=await makeWorld({aiBrain:"off"});delete W.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;
 W.d1.db.exec("CREATE TABLE IF NOT EXISTS system_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
 W.dbrun("INSERT INTO system_kv(key,value,updated_at) VALUES('telegram_webhook_secret',?,?)",[LEGACY,"2026-09-16T18:47:35Z"]);
 const s=await setup(W),calls=setWebhooks(W);let tok=null;try{tok=JSON.parse(calls[0]?.body||"{}").secret_token;}catch{}
 const row=W.q("SELECT value,updated_at FROM system_kv WHERE key='telegram_webhook_secret'");
 ok("S6 setup with only the legacy row re-registers that same value (no new secret), and the row is unchanged",s.status===200&&calls.length===1&&tok===LEGACY&&row.length===1&&row[0].value===LEGACY&&row[0].updated_at==="2026-09-16T18:47:35Z",[s.status,calls.length]);
 W.d1.db.exec("DROP TABLE system_kv");const st=(await hook(W,LEGACY)).status;
 ok("S7 a D1 read failure (table missing) fails closed: 503, nothing stored",st===503&&inboxN(W)===0,st);}

// ================= Stage 2 — Google-originated leads need an independent contact =================
{const W=await makeWorld({aiBrain:"off",extraEnv:{OPENAI_API_KEY:"test-openai-not-real"}});const {q,dbrun,call}=W;
 const t=new Date().toISOString();
 const lead=(id,meta,stage="discovered")=>dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",[id,"x","",stage,"normal",JSON.stringify(meta),t,t]);
 const contact=(lid,type,value,status,url=null)=>dbrun("INSERT INTO lead_contacts(id,lead_id,contact_type,raw_value,normalized_value,evidence_status,source,evidence_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",[lid+":"+type+":"+status,lid,type,value,value,status,"test",url,t,t]);
 // the 20 pre-ladder production rows: place ID + Places provider, no provisional flag
 lead("G-NOFLAG",{source:"ad_autopilot",provider:"google_places_ids",place_id:"ChIJtestNOFLAG",target_market:"IRAN",city:"تبریز",qualification:{market:"IRAN",city:"تبریز",included_type:"jewelry_store"}});
 // a legacy Google row whose country/address/phone are Google content (would pass the first-contact market check on its own)
 lead("G-LEGACY",{source:"google_places",provider:"google_places",place_id:"ChIJtestLEGACY",country:"ایران",address:"تهران، ایران",phone:"09120001111",name:"گالری گوگل"});
 lead("G-GHOST",{source:"google_places",provider:"google_places",place_id:"ChIJtestGHOST",country:"ایران",address:"تهران، ایران",phone:"09120002222"});
 lead("G-OWNER",{source:"google_places",provider:"google_places",place_id:"ChIJtestOWNER",country:"ایران",address:"تهران، ایران",phone:"09120003333"});
 lead("N-CTRL",{source:"customer_discovery",country:"ایران",address:"شیراز، ایران",phone:"09120004444"});
 contact("G-NOFLAG","phone","+989120005555","provider_supplied");                     // Google/provider phone: not independent
 contact("G-GHOST","email","x@ghost.example","page_extracted","https://maps.google.com/?cid=1"); // extracted from a Google-hosted page
 contact("G-OWNER","phone","+989120003333","owner_confirmed");                         // owner-confirmed: independent
 const ai0=W.AI.requests.length,net0=W.net.length;
 const dN=await call("/api/leads/outreach-draft",{lead_id:"G-NOFLAG"}),dG=await call("/api/leads/outreach-draft",{lead_id:"G-GHOST"});
 ok("Q1 draft refused (409 lead_not_contactable) for an unflagged place-ID lead with only a provider-supplied phone, and for a Google-hosted page contact; no AI call, no outreach row",
   [dN,dG].every(d=>d.status===409&&d.body?.reason==="lead_not_contactable")&&q("SELECT COUNT(*) n FROM lead_outreach WHERE lead_id IN ('G-NOFLAG','G-GHOST')")[0].n===0,[dN.body,dG.body]);
 const p=await call("/api/leads/first-contact/prepare",{lead_ids:["G-NOFLAG","G-LEGACY","G-GHOST","G-OWNER","N-CTRL"],confirm_prepare:true});
 const it=Object.fromEntries((p.body?.items||[]).map(x=>[x.lead_id,x]));
 ok("Q2 first contact: Google-originated leads without an independent contact are refused (google_origin_unverified) — Google address/phone no longer verify the market",
   ["G-NOFLAG","G-LEGACY","G-GHOST"].every(id=>it[id]?.prepared===false&&it[id]?.reason==="google_origin_unverified"),p.body?.items);
 ok("Q3 the owner-confirmed contact still unlocks a Google lead, and a non-Google lead is unchanged (both prepared as owner-approval drafts, nothing sent)",
   it["G-OWNER"]?.prepared===true&&it["N-CTRL"]?.prepared===true&&q("SELECT COUNT(*) n FROM lead_outreach WHERE status!='draft'")[0].n===0&&W.tg.filter(x=>/^send/.test(x.method)).length===0,[it["G-OWNER"],it["N-CTRL"]]);
 const g=(await call("/api/leads/intelligence?id=G-NOFLAG",null,"GET")).body?.item;
 ok("Q4 the unflagged place-ID lead stays PLACE_DISCOVERED / tier D (a provider-supplied phone is not independent evidence)",g?.state==="PLACE_DISCOVERED"&&g?.tier==="D",g&&{state:g.state,tier:g.tier});
 // own-site page contact on a Google-origin lead is independent; every Google host form and a provider contact are not
 lead("G-SITE",{source:"google_places",provider:"google_places",place_id:"ChIJtestSITE",country:"ایران",address:"تهران، ایران",phone:"09120006666"});
 contact("G-SITE","email","info@site-ir.example","page_extracted","https://site-ir.example/contact");
 const pS=(await call("/api/leads/first-contact/prepare",{lead_ids:["G-SITE"],confirm_prepare:true})).body?.items?.[0];
 ok("Q6 a Google-origin lead with an own-site page contact is unlocked for an owner first-contact draft",pS?.prepared===true,pS);
 const LQ=await import(new URL("../../worker/src/lead-qualification.js",import.meta.url).href);
 const cases=[["https://maps.google.com/?cid=1",false],["https://www.google.com/maps/place/x",false],["https://g.page/x",false],["https://goo.gl/maps/x",false],
   ["https://lh3.googleusercontent.com/x",false],["https://site-ir.example/contact",true]];
 ok("Q7 independentContact: page_extracted from any Google host is refused, own-site accepted; provider_supplied/possible never; owner_confirmed always",
   cases.every(([u,exp])=>LQ.independentContact({evidence_status:"page_extracted",evidence_url:u})===exp)&&!LQ.independentContact({evidence_status:"provider_supplied"})&&
   !LQ.independentContact({evidence_status:"possible"})&&LQ.independentContact({evidence_status:"owner_confirmed",evidence_url:"https://maps.google.com/"}),"");
 ok("Q6b the Google lead's draft records its independent contact as the delivery contact (owner-confirmed phone), not a provider one",it["G-OWNER"]?.delivery_contact_type==="phone"&&
   q("SELECT c.evidence_status s FROM lead_outreach o JOIN lead_contacts c ON c.id=o.contact_id WHERE o.lead_id='G-OWNER'")[0]?.s==="owner_confirmed",it["G-OWNER"]);
 // a non-Google WEBSITE row alone is not a reachable independent contact
 lead("G-WEB",{source:"google_places",provider:"google_places",place_id:"ChIJtestWEB",country:"ایران",address:"تهران، ایران",phone:"09120007777"});
 contact("G-WEB","website","https://web-ir.example/","page_extracted","https://web-ir.example/");
 const pW=(await call("/api/leads/first-contact/prepare",{lead_ids:["G-WEB"],confirm_prepare:true})).body?.items?.[0];
 ok("Q6c a Google-origin lead with only a website row (no reachable channel) stays refused",pW?.prepared===false&&pW?.reason==="google_origin_unverified",pW);
 // a first-contact draft created before 17.1 (inserted directly) cannot be approved while the lead is unverified
 dbrun("INSERT INTO lead_outreach(id,lead_id,contact_id,conversation_id,channel,recipient,message,language,status,created_at,updated_at) VALUES('FC-OLD','G-LEGACY',NULL,NULL,'first_contact_manual','owner_manual','سلام','Persian','draft',?,?)",[t,t]);
 const ap=await call("/api/leads/first-contact/approve",{outreach_id:"FC-OLD",confirm_approve:true});
 ok("Q6d approval re-checks the Google origin: a pre-17.1 draft for an unverified Google lead is refused (409) and stays a draft",ap.status===409&&ap.body?.reason==="google_origin_unverified"&&q("SELECT status FROM lead_outreach WHERE id='FC-OLD'")[0].status==="draft",[ap.status,ap.body]);
 ok("Q8 googleOriginLead covers the provisional flag, a place ID, any Places provider/source variant — and not web, inbound or manual leads",
   LQ.googleOriginLead({lead_status:"provisional_place"})&&LQ.googleOriginLead({place_id:"x"})&&LQ.googleOriginLead({provider:"google_places_ids"})&&LQ.googleOriginLead({source:"google_places"})&&
   !LQ.googleOriginLead({source:"ad_autopilot"})&&!LQ.googleOriginLead({source:"telegram_inbound"})&&!LQ.googleOriginLead({source:"manual"}),"");
 ok("Q5 no AI or external call was made for any refused lead",W.AI.requests.length===ai0&&W.net.length===net0,[W.AI.requests.length-ai0,W.net.length-net0]);}

done();
