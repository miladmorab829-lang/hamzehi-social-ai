// PHASE 04 — REACHABLE PIPELINE: contact backfill (dry run / idempotent apply), owner-approved first contact with manual delivery and
// pilot-code links, Ads target-quality filter, evidence-based negotiation stage and the event-based funnel. Local only: search engines,
// sites and OpenAI are in-process mocks, Telegram is the harness mock; every phone/email below is a fake test value.
import fs from "node:fs";import path from "node:path";import {fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,J,done}=reporter("phase04");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const W=await makeWorld({extraEnv:{OPENAI_API_KEY:"test-openai-not-real",PUBLIC_WORKER_BASE_URL:"https://w.test",TELEGRAM_BOT_USERNAME:"hamzehi_test_bot"}});const {q,dbrun,call}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
// external mocks (search, sites, OpenAI); the worker's own URL is routed back into the test worker
let search=0,openai=0,sites={},links=[];const inner=globalThis.fetch;
globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);
  if(s.startsWith("https://w.test/"))return W.run(new Request(s,o));
  if(/^https:\/\/www\.(google|bing)\.com\/search/.test(s)){search++;return new Response("<html>"+links.map(l=>`<a href="${l}">x</a>`).join("")+"</html>",{status:200,headers:{"Content-Type":"text/html"}});}
  const site=Object.keys(sites).find(k=>s.startsWith(k));if(site)return new Response(sites[site],{status:200,headers:{"Content-Type":"text/html"}});
  if(s==="https://api.openai.com/v1/responses"){openai++;return new Response(JSON.stringify({output_text:"پیش‌نویس آزمایشی",output:[{type:"message",content:[{type:"output_text",text:"پیش‌نویس آزمایشی"}]}]}),{status:200,headers:{"Content-Type":"application/json"}});}
  return inner(u,o);};
const t0="2026-09-26T09:00:00.000Z";
const addLead=(id,stage,notes,name=id)=>dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",[id,name,notes.website||"",stage,"normal",JSON.stringify(notes),t0,t0]);
const sends=()=>W.tg.filter(x=>/^send/.test(x.method)).length;
const snapshot=()=>JSON.stringify(q("SELECT id,stage,notes,updated_at FROM leads ORDER BY id"));
const count=t=>q(`SELECT COUNT(*) n FROM ${t}`)[0].n;

// ---------------- fixture: 80 discovery leads shaped like Production (45 Iran, 35 Iraq) ----------------
const fakeIr=i=>"0912000"+String(1000+i).slice(-4),fakeIq=i=>"+964770000"+String(1000+i).slice(-4);
for(let i=0;i<45;i++)addLead("D-IR-"+i,"discovered",{source:"customer_discovery",country:"ایران",type:"gold_fa",name:"گالری "+i,...(i<42?{phone:fakeIr(i)}:{}),...(i<35?{website:`https://ir-shop-${i}.example`}:{}),address:"تهران، ایران"});
for(let i=0;i<35;i++)addLead("D-IQ-"+i,"discovered",{source:"customer_discovery",country:"العراق",type:"gold_ar",name:"محل "+i,...(i<24?{phone:fakeIq(i)}:{}),...(i<16?{website:`https://iq-shop-${i}.example`}:{})});
// duplicates: D-IR-41 shares D-IR-40's phone; D-IR-39's phone is already the identity of another (non-discovery) lead
dbrun("UPDATE leads SET notes=json_set(notes,'$.phone',?) WHERE id='D-IR-41'",[fakeIr(40)]);
addLead("L-OWNER","customer",{source:"telegram_inbound"});dbrun("INSERT INTO lead_identities(identity_key,identity_type,normalized_value,lead_id,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",["phone:+98912"+fakeIr(39).slice(4),"phone","+98912"+fakeIr(39).slice(4),"L-OWNER","test",t0,t0]);
const allPhones=[...Array(45).keys()].map(fakeIr).concat([...Array(35).keys()].map(fakeIq));

// ================= BLOCK 1 — contact backfill =================
{const before=snapshot(),c0=count("lead_contacts"),i0=count("lead_identities");
 const noAuth=await W.run(new Request("https://w.test/api/leads/contacts/backfill",{method:"POST",body:"{}",headers:{"Content-Type":"application/json"}}));
 const dry=await call("/api/leads/contacts/backfill",{});const r=dry.body||{};
 const cn=r.contacts_new||{},evaluated=(cn.phone||0)+(cn.email||0)+(cn.website||0);
 ok("B1a the dry run evaluates 72+ potential contacts and writes nothing (contacts, identities, notes, stages unchanged)",noAuth.status===401&&dry.status===200&&r.dry_run===true&&r.eligible_leads===80&&evaluated>=72&&count("lead_contacts")===c0&&count("lead_identities")===i0&&snapshot()===before,[noAuth.status,r.eligible_leads,evaluated,r.leads_gaining_contacts]);
 const blob=JSON.stringify(r);
 ok("B1b the report holds counts and lead ids only — no phone number, website or address",!allPhones.some(p=>blob.includes(p)||blob.includes(p.slice(-7)))&&!/example|تهران/.test(blob),"");
 ok("B1c duplicates are detected: a phone shared by two leads and a phone owned by another lead are reported, not claimed",r.identity_shared_in_batch>=2&&r.identity_conflicts>=1&&(r.conflict_lead_ids||[]).some(([a,b])=>a==="D-IR-39"&&b==="L-OWNER"),[r.identity_shared_in_batch,r.identity_conflicts,r.conflict_lead_ids]);
 const noConfirm=await call("/api/leads/contacts/backfill",{apply:true});
 ok("B1d applying needs an explicit confirm_apply",noConfirm.status===400&&count("lead_contacts")===c0,noConfirm.body);
 const a1=(await call("/api/leads/contacts/backfill",{apply:true,confirm_apply:true})).body;
 const rows=q("SELECT * FROM lead_contacts WHERE source='discovery_backfill'");
 ok("B1e apply writes UNVERIFIED contacts only (evidence 'possible', source discovery_backfill; phone/email/website — never telegram/whatsapp/instagram), notes and stages untouched",a1?.applied?.contacts===evaluated&&rows.length===evaluated&&rows.every(x=>x.evidence_status==="possible"&&["phone","email","website"].includes(x.contact_type))&&snapshot()===before,[a1.applied,rows.length]);
 ok("B1f the shared phone is claimed by neither lead and the owned phone stays with its owner",q("SELECT lead_id FROM lead_identities WHERE identity_key=?",["phone:+98912"+fakeIr(40).slice(4)]).length===0&&q("SELECT lead_id FROM lead_identities WHERE identity_key=?",["phone:+98912"+fakeIr(39).slice(4)])[0]?.lead_id==="L-OWNER",q("SELECT identity_key,lead_id FROM lead_identities WHERE identity_key LIKE 'phone:+98912000%04_'"));
 const c1=count("lead_contacts"),i1=count("lead_identities");
 const a2=(await call("/api/leads/contacts/backfill",{apply:true,confirm_apply:true})).body;
 ok("B1g running the backfill twice creates no duplicate contact or identity",count("lead_contacts")===c1&&count("lead_identities")===i1&&a2?.applied?.contacts===0&&a2?.applied?.identities===0&&a2?.contacts_new?.phone===0,[a2?.applied,a2?.contacts_new]);
 ok("B1h a backfilled phone is never a Telegram-sendable contact",!q("SELECT 1 FROM lead_contacts WHERE source='discovery_backfill' AND contact_type='telegram'").length&&q("SELECT COUNT(*) n FROM system_events WHERE type='discovery_contact_backfill' AND details_json LIKE '%+9%'")[0].n===0,"");}

// ================= BLOCK 2 — owner-approved first contact =================
addLead("L-IQ","discovered",{source:"customer_discovery",country:"العراق",phone:"+9647709990001",address:"بغداد، العراق"},"متجر بغداد");
addLead("L-IR","discovered",{source:"customer_discovery",country:"ایران",phone:"09120009991",address:"تهران، ایران"},"گالری تهران");
addLead("L-IR2","discovered",{source:"customer_discovery",country:"ایران",phone:"09120009992",address:"اصفهان، ایران"},"گالری اصفهان");
addLead("L-UNV","discovered",{source:"customer_discovery",country:"العراق"},"محل بلا تحقق");
addLead("L-CUST","customer",{source:"customer_discovery",country:"ایران",phone:"09120009993",address:"تهران"},"مشتری");
addLead("L-RACE","discovered",{source:"customer_discovery",country:"ایران",phone:"09120009994",address:"شیراز، ایران"},"گالری شیراز");
await call("/api/leads/contacts/backfill",{apply:true,confirm_apply:true});
const tg0=sends(),leads0=count("leads");
{const noConfirm=await call("/api/leads/first-contact/prepare",{lead_ids:["L-IQ"]});
 const p=await call("/api/leads/first-contact/prepare",{lead_ids:["L-IQ","L-IR","L-UNV","L-CUST","L-IR2"],confirm_prepare:true});const it=Object.fromEntries((p.body?.items||[]).map(x=>[x.lead_id,x]));
 ok("F1 preparing needs confirm_prepare; drafts follow the VERIFIED market (Iraq → Iraqi Arabic with a pilot link, Iran → Persian); unverified market and non-cold leads are refused",noConfirm.status===400&&it["L-IQ"]?.prepared&&it["L-IQ"].language==="Iraqi Arabic"&&it["L-IQ"].pilot_link===true&&it["L-IR"]?.prepared&&it["L-IR"].language==="Persian"&&it["L-UNV"]?.reason==="market_not_verified"&&it["L-CUST"]?.reason==="lead_stage_not_cold",p.body?.items);
 const rowIQ=q("SELECT * FROM lead_outreach WHERE lead_id='L-IQ'")[0]||{id:"none",message:""};
 ok("F2 the Iraqi draft is Iraqi Arabic with only a link placeholder; the channel is first_contact_manual; the delivery contact is the backfilled phone",/[ك]|هلا|نكدر/.test(rowIQ.message)&&String(rowIQ.message).includes("{{PILOT_LINK}}")&&rowIQ.channel==="first_contact_manual"&&rowIQ.status==="draft"&&(p.body?.items||[]).find(x=>x.lead_id==="L-IQ")?.delivery_contact_type==="phone",[rowIQ.channel,rowIQ.status]);
 const again=await call("/api/leads/first-contact/prepare",{lead_ids:["L-IQ"],confirm_prepare:true});
 const race=await Promise.all([call("/api/leads/first-contact/prepare",{lead_ids:["L-RACE"],confirm_prepare:true}),call("/api/leads/first-contact/prepare",{lead_ids:["L-RACE"],confirm_prepare:true})]);
 ok("F3 no duplicate outreach: preparing again is refused and two simultaneous prepares create exactly one item",again.body?.items?.[0]?.reason==="already_queued_or_in_conversation"&&q("SELECT COUNT(*) n FROM lead_outreach WHERE lead_id='L-IQ'")[0].n===1&&q("SELECT COUNT(*) n FROM lead_outreach WHERE lead_id='L-RACE'")[0].n===1&&race.filter(r=>r.body?.items?.[0]?.prepared).length===1,[race.map(r=>r.body?.items?.[0])]);
 ok("F4 preparing changes no CRM stage",q("SELECT stage FROM leads WHERE id IN ('L-IQ','L-IR','L-IR2','L-RACE')").every(x=>x.stage==="discovered"),q("SELECT id,stage FROM leads WHERE id IN ('L-IQ','L-IR')"));
 // the generic outreach controls and the Telegram sender refuse a first-contact item
 const gen=await W.transition(rowIQ.id,"submit"),genSend=await call("/api/leads/outreach/send-telegram",{id:rowIQ.id}),patch=await call("/api/leads/outreach/draft",{id:rowIQ.id,message:"x"},"PATCH");
 ok("F5 the generic approve/submit, draft edit and Telegram send controls refuse a first-contact item",gen.status===409&&genSend.status>=400&&patch.status===409&&q("SELECT status,message FROM lead_outreach WHERE id=?",[rowIQ.id||""])[0]?.status==="draft",[gen.status,genSend.status,patch.status]);
 const deliverDraft=await call("/api/leads/first-contact/delivered",{outreach_id:rowIQ.id,delivered_via:"whatsapp",confirm_delivered:true});
 ok("F6 a draft cannot be confirmed as delivered (approval first) and the lead is not contacted",deliverDraft.status===409&&q("SELECT stage FROM leads WHERE id='L-IQ'")[0].stage==="discovered",deliverDraft.body);
 const apNo=await call("/api/leads/first-contact/approve",{outreach_id:rowIQ.id});
 const ap=await call("/api/leads/first-contact/approve",{outreach_id:rowIQ.id,confirm_approve:true});const link=ap.body?.deliverable_message?.match(/https:\/\/t\.me\/hamzehi_test_bot\?start=(iq_[A-Za-z0-9_-]{22})/);
 const code=link?.[1],stored=q("SELECT * FROM lead_outreach WHERE id=?",[rowIQ.id])[0]||{},dump=JSON.stringify(q("SELECT * FROM lead_outreach"))+JSON.stringify(q("SELECT * FROM lead_campaign_codes"))+JSON.stringify(q("SELECT details_json FROM system_events"));
 ok("F7 approval needs confirm_approve; an Iraq approval returns the text with a single-use pilot link ONCE — the code is stored nowhere (hash only)",apNo.status===400&&ap.status===200&&!!code&&stored.status==="approved"&&stored.approved_by==="owner"&&!dump.includes(code)&&q("SELECT COUNT(*) n FROM lead_campaign_codes WHERE lead_id='L-IQ' AND status='active'")[0].n===1,[ap.status,ap.body?.pilot,stored.status]);
 ok("F8 approval alone does not mark the lead contacted",q("SELECT stage FROM leads WHERE id='L-IQ'")[0].stage==="discovered","");
 const irRow=q("SELECT id FROM lead_outreach WHERE lead_id='L-IR'")[0]?.id,apIR=await call("/api/leads/first-contact/approve",{outreach_id:irRow,confirm_approve:true});
 ok("F9 an Iran approval carries no pilot link (Iraq-only campaign) and keeps the Persian text",apIR.status===200&&apIR.body?.pilot?.issued===false&&!/t\.me|PILOT_LINK/.test(String(apIR.body?.deliverable_message||""))&&/بسته‌بندی/.test(String(apIR.body?.deliverable_message||"")),apIR.body?.pilot);
 ok("F10 the mock sender received ZERO calls through prepare and approve (nothing is ever sent to a prospect)",sends()===tg0&&!W.tg.some(x=>x.body.includes("hamzehibox")),[sends()-tg0]);
 const badVia=await call("/api/leads/first-contact/delivered",{outreach_id:rowIQ.id,delivered_via:"carrier_pigeon",confirm_delivered:true}),noConf=await call("/api/leads/first-contact/delivered",{outreach_id:rowIQ.id,delivered_via:"whatsapp"});
 const del=await call("/api/leads/first-contact/delivered",{outreach_id:rowIQ.id,delivered_via:"whatsapp",confirm_delivered:true}),del2=await call("/api/leads/first-contact/delivered",{outreach_id:rowIQ.id,delivered_via:"whatsapp",confirm_delivered:true});
 ok("F11 only the owner's explicit delivery confirmation records «contacted» — once (a repeat is idempotent, one event)",badVia.status===400&&noConf.status===400&&del.status===200&&del.body?.lead_stage_changed===true&&del2.body?.idempotent===true&&q("SELECT stage FROM leads WHERE id='L-IQ'")[0].stage==="contacted"&&q("SELECT COUNT(*) n FROM system_events WHERE type='first_contact_delivered'")[0].n===1,[badVia.status,noConf.status,del.body,del2.body]);
 const evs=JSON.stringify(q("SELECT details_json FROM system_events WHERE type LIKE 'first_contact%'"));
 ok("F12 first-contact audit events hold ids/status only — no phone or message text",!/\+964|0912|هلا|سلام/.test(evs),"");
 const r2=q("SELECT id FROM lead_outreach WHERE lead_id='L-IR2'")[0]?.id,rej=await call("/api/leads/first-contact/reject",{outreach_id:r2});
 const reprep=await call("/api/leads/first-contact/prepare",{lead_ids:["L-IR2"],confirm_prepare:true});
 ok("F13 a rejected item can be prepared again (only open/delivered items block)",rej.status===200&&reprep.body?.items?.[0]?.prepared===true,[rej.body,reprep.body?.items?.[0]]);
 // ---- the prospect answers through the pilot link: linked to the ORIGINAL lead, its Iraq market kept, no new lead
 ok("F14 still no message was sent before the prospect writes first",sends()===tg0,"");
 const user={id:705000001,name:"Ali",username:"ali_iq"};const st=await W.send(user,"/start "+code);
 const leadsAfter=count("leads"),iq=JSON.parse(q("SELECT notes FROM leads WHERE id='L-IQ'")[0].notes);
 ok("F15 /start <pilot code> links the reply to the ORIGINAL lead (no duplicate lead), consumes the code and keeps the lead's Iraq country/phone (ARAB, USD pricing evidence)",st.row?.lead_id==="L-IQ"&&leadsAfter===leads0&&q("SELECT status FROM lead_campaign_codes WHERE lead_id='L-IQ'").every(x=>x.status!=="active")&&iq.country==="العراق"&&iq.phone==="+9647709990001"&&!iq.market,[st.row?.lead_id,leadsAfter-leads0,iq.country]);
 const q1=await W.send(user,"بكم علبة الخاتم؟");
 ok("F16 a price question from the linked prospect is preliminary interest: stage 'replied', not 'negotiation' (no priced offer recorded)",q1.row?.lead_id==="L-IQ"&&q("SELECT stage FROM leads WHERE id='L-IQ'")[0].stage==="replied",[q1.row?.category,q("SELECT stage FROM leads WHERE id='L-IQ'")[0].stage]);
 const other={id:705000002,name:"Eve",username:"eve"};const st2=await W.send(other,"/start "+code);
 ok("F17 the same pilot code used by another sender is never linked to that lead",st2.row?.lead_id!=="L-IQ",[st2.row?.lead_id]);}

// ================= BLOCK 3 — Ads target quality =================
const PRICE_TITLES=["أسعار الذهب في السعودية","سعر الذهب اليوم في مصر لحظة بلحظة | iSag","سعر الذهب اليوم: أسعار الذهب المباشرة بالعراق","أسعار المعادن اليوم 2026 | الذهب والفضة","اسعار الذهب في الامارات","سعر الذهب اليوم في عمان | تحديث لحظي","سعر الذهب اليوم الثلاثاء 20 أكتوبر 2026"];
// adversarial bodies: each price page also mentions Baghdad/Iraq, jewellery and a contact link, so only the new filter can reject it
PRICE_TITLES.forEach((t,i)=>{sites[`https://price-${i}.example`]=`<html><title>${t}</title><body>${t} — سعر غرام الذهب عيار 21 في العراق بغداد 95000 دينار، عيار 18 81000 دينار، الأونصة 2400 USD. مجوهرات. <a href="/contact">contact us</a></body></html>`;});
sites["https://alrafidain-gold.example"]=`<html><title>مجوهرات الرافدين - صائغ في بغداد</title><body>محل ذهب ومجوهرات في بغداد، العراق. هاتف +9647701112233. <a href="/contact">تواصل contact us</a></body></html>`;
const resetAds=()=>{dbrun("DELETE FROM system_events WHERE type IN ('ads_autopilot_reserved','ads_run_deferred')");};
{const bad1=await call("/api/ads/autopilot",{type:"gold",city:""}),bad2=await call("/api/ads/autopilot",{type:"gold",city:"Paris"}),bad3=await call("/api/ads/discover",{type:"gold",city:""});
 ok("A1 every Ads run needs a valid target city in Iran or Iraq (empty or unknown → 400, nothing reserved, no search)",bad1.status===400&&bad2.status===400&&bad3.status===400&&bad1.body.reason==="ads_target_city_required"&&search===0&&q("SELECT COUNT(*) n FROM system_events WHERE type='ads_autopilot_reserved'")[0].n===0,[bad1.status,bad2.status,bad3.status]);
 // the live Production config (enabled, city "") makes the cron do nothing at all
 await call("/api/ads/autopilot/status",null,"GET");
 dbrun("INSERT OR REPLACE INTO system_kv(key,value,updated_at) VALUES('ads_autopilot_config',?,?)",[JSON.stringify({enabled:true,type:"gold",city:"",extra:""}),new Date().toISOString()]);
 const p=[];const WK=(await import((await import("node:url")).pathToFileURL(path.join(process.env.SRC||path.join(REPO,"worker/src"),"index.js")).href)).default;
 await WK.scheduled({cron:"*/15 * * * *"},W.env,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);
 const stat=await call("/api/ads/autopilot/status",null,"GET");
 ok("A2 the cron with an empty-city config reserves no Ads budget and calls no search; status reports the invalid target",search===0&&q("SELECT COUNT(*) n FROM system_events WHERE type='ads_autopilot_reserved'")[0].n===0&&stat.body.target?.valid===false,[search,stat.body.target]);
 dbrun("DELETE FROM system_kv WHERE key='ads_autopilot_config'");
 // Phase 09.4: the Baghdad checks below need the ARAB (Iraq) market enabled by the owner
 await call("/api/ads/markets/config",{market:"ARAB",enabled:true,city:"بغداد",runs_per_day:24,owner_approved:true});
 links=[...PRICE_TITLES.map((_,i)=>`https://price-${i}.example/`),"https://alrafidain-gold.example/"];
 const l0=count("leads"),d=await call("/api/ads/discover",{type:"gold",city:"بغداد"});
 const created=q("SELECT name,notes FROM leads WHERE json_extract(notes,'$.source')='ad_discovery'");
 ok("A3 all seven known price/news pages are rejected; the real Baghdad jeweller is kept (manual discovery)",d.status===200&&count("leads")===l0+1&&created.length===1&&/الرافدين/.test(created[0].name)&&JSON.parse(created[0].notes).target_market==="ARAB",[d.status,created.map(x=>x.name)]);
 resetAds();links=[`https://price-0.example/`,`https://price-1.example/`,`https://price-4.example/`,`https://price-5.example/`,`https://price-6.example/`,"https://alrafidain-gold.example/"];
 dbrun("DELETE FROM leads WHERE json_extract(notes,'$.source')='ad_discovery'");dbrun("DELETE FROM lead_identities WHERE lead_id NOT IN (SELECT id FROM leads)");
 const o0=openai,a=await call("/api/ads/autopilot",{type:"gold",city:"بغداد"});
 const ap=q("SELECT stage,notes FROM leads WHERE json_extract(notes,'$.source')='ad_autopilot'");
 ok("A4 Autopilot run: price pages rejected (counted by reason), only the jeweller stored; its draft does NOT change the CRM stage or schedule a follow-up",a.status===200&&a.body.summary.rejected>=5&&a.body.summary.rejected_reasons?.price_or_news>=1&&ap.length===1&&ap[0].stage==="discovered"&&a.body.summary.drafted===1&&openai===o0+1&&!JSON.parse(ap[0].notes).next_followup_at,[a.body?.summary?.rejected_reasons,ap.map(x=>x.stage),a.body?.summary?.drafted]);
 ok("A5 only Iraqi groups run for a Baghdad target (no Persian/Iran query)",a.body.targets.every(t=>t.endsWith("_ar")),a.body.targets);
 const cust=q("SELECT id FROM leads WHERE json_extract(notes,'$.source')='ad_autopilot'")[0]?.id||"none";dbrun("UPDATE leads SET stage='customer' WHERE id=?",[cust]);
 const nd=await call("/api/ads/negotiation-draft",{lead_id:cust});
 ok("A6 the owner's manual Ads draft button never re-stages a lead (a customer stays customer)",nd.status===200&&q("SELECT stage FROM leads WHERE id=?",[cust])[0]?.stage==="customer",[nd.status,q("SELECT stage FROM leads WHERE id=?",[cust])[0]?.stage]);
 // follow-up drafting (paid) only for leads that were actually reached
 dbrun("UPDATE leads SET notes=json_set(notes,'$.next_followup_at','2026-01-01T00:00:00.000Z') WHERE id IN ('D-IR-0','L-IQ')");
 // Phase 09.6: A7 keeps its ORIGINAL fixture — no Ads market enabled — so it checks that CRM follow-ups never depend on the Ads switches
 await call("/api/ads/markets/config",{market:"ARAB",enabled:false});
 resetAds();const o1=openai,f=await call("/api/ads/followups/run",{});
 ok("A7 follow-up drafts are prepared for a contacted/replied lead only — never for a never-contacted discovery lead",f.status===200&&!JSON.parse(q("SELECT notes FROM leads WHERE id='D-IR-0'")[0].notes).followup_draft&&!!JSON.parse(q("SELECT notes FROM leads WHERE id='L-IQ'")[0].notes).followup_draft&&openai===o1+1,[f.body,openai-o1]);
 await call("/api/ads/markets/config",{market:"ARAB",enabled:true,city:"بغداد",runs_per_day:24,owner_approved:true});   // A8 is an Ads discovery check again
 resetAds();const r1=await call("/api/ads/autopilot",{type:"gold",city:"بغداد"}),r2=await call("/api/ads/autopilot",{type:"gold",city:"بغداد"});
 ok("A8 the shared Ads budget is unchanged: a second run inside 55 minutes is deferred",!r1.body.deferred&&r2.body.deferred===true&&r2.body.reason==="ads_daily_limit",[r1.body?.deferred,r2.body?.deferred]);}

// ================= BLOCK 4 — evidence-based negotiation and funnel =================
{const user={id:705000010,name:"Sara",username:"sara_ir"};const m1=await W.send(user,"سلام، قیمت جعبه انگشتر چنده؟");const L=m1.row?.lead_id;
 ok("N1 a price question without any priced offer moves a new lead to 'replied' only",!!L&&q("SELECT stage FROM leads WHERE id=?",[L])[0].stage==="replied",[L&&q("SELECT stage FROM leads WHERE id=?",[L])[0].stage]);
 const t=new Date().toISOString();dbrun("INSERT INTO lead_quotes(id,lead_id,conversation_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",["Q-1",L,m1.row.conversation_id,"sent",t,t]);
 const m2=await W.send(user,"تخفیف هم میدید؟ قیمتش زیاده");
 ok("N2 once a priced quote was sent, a price/discount reply is a real negotiation: stage 'negotiation'",q("SELECT stage FROM leads WHERE id=?",[L])[0].stage==="negotiation",[m2.row?.category,q("SELECT stage FROM leads WHERE id=?",[L])[0].stage]);
 // a paid customer (owner-confirmed order + recorded payment) and a legacy 'negotiation' lead without any offer
 addLead("L-PAID","customer",{source:"telegram_inbound"});dbrun("INSERT INTO lead_orders(id,order_number,quote_id,lead_id,conversation_id,product,quantity,currency,status,created_at,updated_at) VALUES('O-1','HB-T-1','chat-offer:c:h','L-PAID','C-PAID','علبة',100,'USD','confirmed',?,?)",[t,t]);
 dbrun("INSERT INTO inbox_messages(id,platform,external_id,sender,message,category,status,created_at,updated_at,lead_id,conversation_id) VALUES('IN-P','telegram','x:1','s','ok','accepted','new',?,?,'L-PAID','C-PAID')",[t,t]);
 dbrun("INSERT INTO lead_order_payments(id,order_id,lead_id,payment_kind,amount_minor,currency,method,reference,reference_key,recorded_by,recorded_at) VALUES('P-1','O-1','L-PAID','deposit',5000,'USD','bank','r1','r1','owner',?)",[t]);
 addLead("L-LEGACY","negotiation",{source:"ad_autopilot",negotiation_draft:"x"});
 const noAuth=await W.run(new Request("https://w.test/api/leads/funnel"));const fr=(await call("/api/leads/funnel",null,"GET")).body||{};fr.furthest=fr.furthest||{};fr.evidence=fr.evidence||{};fr.stage_without_evidence=fr.stage_without_evidence||{};fr.by_source=fr.by_source||{};
 const sum=Object.values(fr.furthest).reduce((a,b)=>a+b,0);
 ok("E1 the funnel needs the owner token and reconciles: every lead in exactly one furthest bucket, total = leads table",noAuth.status===401&&fr.reconciled===true&&sum===fr.total_leads&&fr.total_leads===count("leads"),[noAuth.status,sum,fr.total_leads]);
 ok("E2 funnel steps come from recorded events: contacted (owner-confirmed delivery), replied, negotiated (offer + reply), quoted, ordered, paid",fr.evidence.contacted>=1&&fr.evidence.replied>=3&&fr.evidence.negotiated>=2&&fr.evidence.quoted>=2&&fr.evidence.ordered===1&&fr.evidence.paid===1&&fr.furthest.paid===1,fr.evidence);
 ok("E3 a draft-only 'negotiation' lead is NOT counted as negotiated; it is flagged as a stage without evidence (historical stage not rewritten)",fr.stage_without_evidence.negotiation_without_priced_offer>=1&&q("SELECT stage FROM leads WHERE id='L-LEGACY'")[0].stage==="negotiation"&&fr.by_source.ad_autopilot?.discovered>=1,[fr.stage_without_evidence,fr.by_source.ad_autopilot]);
 ok("E4 the paid customer keeps its classification ('customer'); no quote event is fabricated for its chat-offer order (lead_quotes untouched)",q("SELECT stage FROM leads WHERE id='L-PAID'")[0].stage==="customer"&&q("SELECT COUNT(*) n FROM lead_quotes")[0].n===1,"");
 ok("E5 preliminary interest is reported separately from real negotiation",fr.evidence.preliminary_interest>=1,fr.evidence);}

// ================= BLOCK 5 — safety =================
{ok("S1 the funnel/first-contact/backfill routes all refuse requests without the owner token",(await Promise.all(["/api/leads/funnel","/api/leads/first-contact"].map(p=>W.run(new Request("https://w.test"+p))))).every(r=>r.status===401)&&(await Promise.all(["/api/leads/first-contact/prepare","/api/leads/first-contact/approve","/api/leads/first-contact/delivered","/api/leads/contacts/backfill"].map(p=>W.run(new Request("https://w.test"+p,{method:"POST",body:"{}"}))))).every(r=>r.status===401),"");
 const big=await call("/api/leads/first-contact/prepare",{lead_ids:["x"],pad:"a".repeat(25000),confirm_prepare:true});
 ok("S2 oversized bodies are refused (413)",big.status===413,big.status);
 ok("S3 no outbound call left the in-process mocks",W.offNet().every(u=>/google\.com|bing\.com|\.example|api\.openai\.com|w\.test/.test(u)),W.offNet().filter(u=>!/google\.com|bing\.com|\.example|api\.openai\.com|w\.test/.test(u)));
 ok("S4 the only Telegram sends in the whole run are replies to prospects who wrote first (welcome/auto-reply), never a first contact",W.tg.filter(x=>/^send/.test(x.method)).every(x=>!/hamzehibox\.com|HAMZEHI BOX \(hamzehibox/.test(x.body)),"");}
process.exit(done()?1:0);
