// PHASE 20.1 — sales conversion: deterministic next action / follow-up state / template drafts (no AI, no price), the read-only
// /api/sales/conversion endpoint, the owner-triggered template draft (existing outreach-draft route, nothing sent) and the dashboard section.
// Offline only: node:sqlite, mocked network, nothing sent, no Production access.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase20_1");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const imp=f=>import(pathToFileURL(path.join(SRC,f)).href);
const SC=await imp("sales-conversion.js"),LQ=await imp("lead-qualification.js"),LS=await imp("lead-scoring.js"),DP=await imp("live-dashboard-page.js");
const PRICE=new RegExp(fs.readFileSync(path.join(SRC,"index.js"),"utf8").match(/const OUTREACH_PRICE_TERMS=\/(.*)\/iu;/)[1],"iu");
const NOW=Date.parse("2026-11-10T12:00:00Z"),ago=d=>new Date(NOW-d*86400000).toISOString();

// ---- T: template drafts
{const all=["IRAN","ARAB"].flatMap(mk=>SC.DRAFT_MODES.map(mode=>({mk,mode,d:SC.buildConversionDraft({market:mk,mode,name:"Test Gallery",city:"City",signals:["wholesale","luxury"]})})));
 ok("T1 drafts exist for both markets and all modes, carry the brand HAMZEHI BOX and never a price, discount, number or currency word",all.every(x=>x.d&&x.d.text.includes("HAMZEHI BOX")&&!PRICE.test(x.d.text.normalize("NFKC"))&&!/[0-9۰-۹٠-٩]/.test(x.d.text)&&x.d.prices_included===false));
 ok("T2 Iran = Persian / TOMAN metadata, Iraq = Iraqi Arabic / USD metadata (language and currency from the market only)",all.filter(x=>x.mk==="IRAN").every(x=>x.d.language==="Persian"&&x.d.currency==="TOMAN"&&/سلام/.test(x.d.text))&&all.filter(x=>x.mk==="ARAB").every(x=>x.d.language==="Iraqi Arabic"&&x.d.currency==="USD"&&/(شنو|نكدر|وياكم)/.test(x.d.text)));
 const a=SC.buildConversionDraft({market:"IRAN",name:"A",signals:["wholesale"]}).text,b=SC.buildConversionDraft({market:"IRAN",name:"B",city:"شیراز",signals:["brand_collection"]}).text;
 ok("T3 drafts are personalized (name, city, own-site activity → product fit), not one fixed text, and never claim 'manufacturer' or 'gallery' for us/them",a!==b&&a.includes("سفارش‌های عمده")&&b.includes("کالکشن‌های اختصاصی")&&b.includes("شیراز")&&!/تولیدکننده|گالری شما/.test(a+b)&&!/نصنع/.test(SC.buildConversionDraft({market:"ARAB"}).text));
 const ph0=SC.buildConversionDraft({market:"IRAN",galleryIds:[]}).text,ph1=SC.buildConversionDraft({market:"IRAN",galleryIds:["g1"]}).text,ar0=SC.buildConversionDraft({market:"ARAB",galleryIds:[]}).text,ar1=SC.buildConversionDraft({market:"ARAB",galleryIds:["g1"]}).text;
 ok("T5 a photo is offered only when an owner-verified gallery photo exists",!/تصویر/.test(ph0)&&/تصویر/.test(ph1)&&!/صور/.test(ar0)&&/صور/.test(ar1));
 const cl=SC.buildConversionDraft({market:"ARAB",name:"Gold Shop https://evil.example/x @handle mail@x.com",city:"بغداد"});
 ok("T6 scraped names never carry links, handles or e-mails into a message (and the cleaning is flagged); the brand is isolated for RTL text",!/https?:|evil\.example|@/.test(cl.text)&&cl.input_cleaned===true&&cl.text.includes("\u2068HAMZEHI BOX\u2069"));
 const qf=SC.buildConversionDraft({market:"IRAN",mode:"quote_followup"}).text,qa=SC.buildConversionDraft({market:"ARAB",mode:"quote_followup"}).text;
 ok("T7 quote follow-up has its own text and still names no price or amount",/پیش‌فاکتور/.test(qf)&&/العرض/.test(qa)&&!PRICE.test(qf)&&!PRICE.test(qa));
 const idx=fs.readFileSync(path.join(SRC,"index.js"),"utf8").match(/const REVENUE_FOLLOWUP_DAYS=Object\.freeze\((\{[^)]*\})\)/)[1].replace(/(\w+):/g,'"$1":');const RF=JSON.parse(idx);
 ok("T8 follow-up intervals equal the existing REVENUE_FOLLOWUP_DAYS (no drift, no new rule)",RF.quote_no_reply===SC.FOLLOWUP_RULES.quote_no_reply_days&&RF.reorder===SC.FOLLOWUP_RULES.reorder_days);
 ok("T4 no market → no draft (never guessed); gallery attachments are only the owner-verified IDs passed in (max 2)",SC.buildConversionDraft({market:null})===null&&JSON.stringify(SC.buildConversionDraft({market:"ARAB",galleryIds:["g1","g2","g3"]}).attachments_suggested)==='["g1","g2"]');}

// ---- F: follow-up state (existing intervals only)
{const f=(a,m={})=>SC.followUpState({},m,a,{nowMs:NOW});
 ok("F1 no send → none; open draft → waiting for owner (no second suggestion)",f({}).status==="none"&&f({outreach_status:"draft",outreach_ever_sent:true,outreach_sent_count:1,outreach_sent_at:ago(30)}).status==="draft_waiting_for_owner");
 ok("F2 first contact without reply: 5 days → scheduled at +14 days, 15 days → due (released no-response rule)",f({outreach_status:"sent",outreach_ever_sent:true,outreach_sent_count:1,outreach_sent_at:ago(5)}).status==="scheduled"&&f({outreach_status:"sent",outreach_ever_sent:true,outreach_sent_count:1,outreach_sent_at:ago(15)}).status==="due");
 ok("F3 two follow-ups without reply → exhausted (no repeated follow-up)",f({outreach_status:"sent",outreach_ever_sent:true,outreach_sent_count:3,outreach_sent_at:ago(40)}).status==="exhausted");
 ok("F4 the owner's next_followup_at wins; a reply turns follow-up into an active conversation",f({outreach_status:"sent",outreach_ever_sent:true,outreach_sent_count:1,outreach_sent_at:ago(1)},{next_followup_at:ago(-2)}).basis==="owner_schedule"&&f({replied:true,outreach_sent_count:1}).status==="conversation_active");
 ok("F6 no duplicate follow-up: a send after the owner date or after the quote means it already happened (followed_up, not due)",f({outreach_status:"sent",outreach_ever_sent:true,outreach_sent_count:2,outreach_sent_at:ago(1)},{next_followup_at:ago(3)}).status==="followed_up"&&f({quoted:true,quote_sent_at:ago(10),outreach_ever_sent:true,outreach_sent_count:2,outreach_sent_at:ago(5)}).status==="followed_up");
 ok("F5 a quote without reply is due after 3 days (REVENUE_FOLLOWUP_DAYS.quote_no_reply)",f({quoted:true,quote_sent_at:ago(4)}).status==="due"&&f({quoted:true,quote_sent_at:ago(1)}).status==="scheduled"&&SC.FOLLOWUP_RULES.quote_no_reply_days===3);}

// ---- P: plan (next action, packaging need, wholesale priority)
const lead=(id,stage="discovered")=>({id,name:"گالری نمونه",stage,created_at:ago(20),updated_at:ago(1)});
const vm={source:"dataset_discovery",provider:"web",url:"https://sample-gallery.ir/",evidence:"گالری طلا و جواهر نمونه · فروش عمده",target_market:"IRAN",city:"تهران",type:"gold_fa",qualification:{buyer_in_title:true,local_domain:true},contact_enrichment_checked_at:ago(2)};
const ct=[{contact_type:"phone",normalized_value:"+98210000",evidence_status:"page_extracted",evidence_url:"https://sample-gallery.ir/contact",created_at:ago(2)}];
const plan=(l,m,c,a)=>{const aa={strict_activity:true,...a},p=LQ.leadQualification(l,m,c,aa),s=LS.scoreLeadCached(p,l,m,aa,{nowMs:NOW});return SC.conversionPlan(l,m,p,s,aa,{nowMs:NOW,galleryIds:["g1"]});};
{const x=plan(lead("P1"),vm,ct,{});
 ok("P1 verified business with verified contact → PREPARE_FIRST_CONTACT_DRAFT with a Persian preview; packaging need only 'possible' (site wording), never certain",x.next_action.action==="PREPARE_FIRST_CONTACT_DRAFT"&&x.draft?.language==="Persian"&&x.packaging_need.level==="possible"&&/wholesale/.test(x.wholesale_priority)&&x.send_requires==="owner_approval",x);
 const q=plan(lead("P2"),vm,ct,{quote_requested:true});
 ok("P2 a customer price request → ESCALATE_FINANCIAL_DECISION (owner decision), no draft with prices",q.next_action.action==="ESCALATE_FINANCIAL_DECISION"&&q.next_action.owner_decision===true&&q.draft===null);
 const o=plan(lead("P3","customer"),{...vm,source:"telegram_inbound"},[],{replied:true,ordered:true,order_confirmed:true,order_markets:["IRAN"]});
 ok("P3 a confirmed order → SERVICE_EXISTING_ORDER; packaging need 'demonstrated', wholesale priority high",o.next_action.action==="SERVICE_EXISTING_ORDER"&&o.packaging_need.level==="demonstrated"&&/high/.test(o.wholesale_priority));
 const nm=plan(lead("P4","negotiation"),{source:"telegram_inbound"},[],{replied:true});
 ok("P4 a conversation without a market → SET_MARKET for the owner, no draft, market never guessed",nm.next_action.action==="SET_MARKET"&&nm.draft===null&&nm.market===null&&nm.currency===null);
 const g=plan(lead("P5"),{source:"ad_autopilot",provider:"google_places_ids",place_id:"ChIJz",target_market:"ARAB",type:"gold_ar"},[],{});
 ok("P5 insufficient data → COMPLETE_DATA (no draft)",g.next_action.action==="COMPLETE_DATA"&&g.draft===null);
 const ex=plan(lead("P6","negotiation"),{source:"ad_autopilot",target_market:"ARAB",rejected_reason:"x"},[],{});
 ok("P6 excluded / Ads 'negotiation' without contact evidence → NONE (never counted as a negotiation)",ex.next_action.action==="NONE");
 const d=plan(lead("P7"),vm,ct,{outreach_status:"pending_approval"});
 ok("P7 an open draft → OWNER_REVIEW_DRAFT (no duplicate draft suggested)",d.next_action.action==="OWNER_REVIEW_DRAFT"&&d.draft===null);
 const due=plan(lead("P8","contacted"),vm,ct,{outreach_status:"sent",outreach_ever_sent:true,outreach_sent_count:1,outreach_sent_at:ago(15),outreach_approved_at:ago(16)});
 ok("P8 sent 15 days ago without reply → PREPARE_FOLLOW_UP_DRAFT with a follow-up preview",due.next_action.action==="PREPARE_FOLLOW_UP_DRAFT"&&due.draft?.mode==="followup");}

{const o2=plan(lead("P9","negotiation"),{source:"telegram_inbound"},[],{replied:true,ordered:true,order_confirmed:true});const q2=plan(lead("P10","negotiation"),{source:"telegram_inbound"},[],{replied:true,quote_requested:true});
 ok("P9 an order or a price request comes before 'set market' (closest to cash first)",o2.next_action.action==="SERVICE_EXISTING_ORDER"&&q2.next_action.action==="ESCALATE_FINANCIAL_DECISION"&&o2.next_action.rank<q2.next_action.rank&&q2.next_action.rank<SC.ACTION_RANK.SET_MARKET+1);
 const rj=plan(lead("P11"),vm,ct,{outreach_rejected_at:ago(3)});
 ok("P10 after the owner rejected a draft nothing is re-suggested (follows the existing qualification's next action)",rj.next_action.action==="NONE"&&rj.qualification_action==="NO_ACTION_REQUIRED"&&rj.draft===null);
 const ap=plan(lead("P12"),vm,ct,{outreach_status:"approved",outreach_approved_at:ago(1)});
 ok("P11 an approved message is 'send through the approved channel' — not a new owner decision",ap.next_action.action==="SEND_APPROVED_MESSAGE"&&ap.next_action.owner_decision===false);
 const nc=plan(lead("P13"),{...vm,city:undefined},ct,{});
 ok("P12 a verified business without a confirmed city waits for data (no first-contact draft)",nc.next_action.action==="COMPLETE_DATA"&&nc.draft===null);}

// ---- A: API + owner-triggered template draft (real worker, in-memory D1)
const W=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test"}});const {q,dbrun,call}=W;const t=new Date().toISOString();
let openai=0;const inner=globalThis.fetch;globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);if(/api\.openai|api\.anthropic/.test(s)){openai++;throw new Error("paid AI call");}if(s.startsWith("https://w.test/"))return W.run(new Request(s,o));return inner(u,o);};
const ins=(id,name,stage,notes)=>dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",[id,name,notes.url||"",stage,"normal",JSON.stringify(notes),t,t]);
const con=(lid,type,value,url)=>dbrun("INSERT INTO lead_contacts(id,lead_id,contact_type,raw_value,normalized_value,evidence_status,source,evidence_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",[lid+":"+type,lid,type,value,value,"page_extracted","test",url,t,t]);
ins("ir-1","گالری نمونه یک","discovered",{...vm,contact_enrichment_checked_at:t});con("ir-1","phone","+982100000001","https://sample-gallery.ir/contact");
ins("iq-1","مجوهرات نموذج","discovered",{source:"dataset_discovery",provider:"web",url:"https://sample-gold.iq/",evidence:"مجوهرات نموذج ذهب بالجملة",target_market:"ARAB",city:"بغداد",type:"gold_ar",qualification:{buyer_in_title:true,local_domain:true},contact_enrichment_checked_at:t});
con("iq-1","phone","+9647700000001","https://sample-gold.iq/");
ins("nm-1","Conversation X","negotiation",{source:"telegram_inbound"});
const before=JSON.stringify(q("SELECT id,stage,notes,updated_at FROM leads ORDER BY id")),out0=q("SELECT COUNT(*) n FROM lead_outreach")[0]?.n??0;
const r=(await call("/api/sales/conversion",null,"GET")).body;
ok("A1 /api/sales/conversion returns plans per lead and a per-market summary (IRAN TOMAN / ARAB USD) from records",r.ok&&r.items.every(i=>i.conversion)&&r.conversion.summary.IRAN.currency==="TOMAN"&&r.conversion.summary.ARAB.currency==="USD"&&r.items.filter(i=>i.conversion.next_action.action==="PREPARE_FIRST_CONTACT_DRAFT").length===2,r.items?.map(i=>[i.id,i.conversion?.next_action.action]));
ok("A1b the market-less conversation is SET_MARKET and ranked before the cold first contacts; the summary counts it apart",r.items[0]?.id==="nm-1"&&r.items[0].conversion.next_action.action==="SET_MARKET"&&r.conversion.summary.NO_MARKET.set_market===1,r.items?.map(i=>i.id));
ok("A2 the endpoint is read-only: no lead, outreach row or AI call; and it requires authentication",JSON.stringify(q("SELECT id,stage,notes,updated_at FROM leads ORDER BY id"))===before&&(q("SELECT COUNT(*) n FROM lead_outreach")[0]?.n??0)===out0&&openai===0&&(await W.run(new Request("https://w.test/api/sales/conversion"))).status===401);
const d1=await call("/api/leads/outreach-draft",{lead_id:"ir-1",engine:"template",mode:"initial"});
const row=q("SELECT status,message,language FROM lead_outreach WHERE lead_id='ir-1'");
ok("A3 owner-triggered template draft is stored in the existing approval queue as 'draft' (Persian, brand, no price) with no AI call",d1.status===200&&d1.body?.status==="draft"&&row.length===1&&row[0].status==="draft"&&row[0].message.includes("HAMZEHI BOX")&&!PRICE.test(row[0].message)&&openai===0,[d1.status,d1.body,row]);
const d2=await call("/api/leads/outreach-draft",{lead_id:"ir-1",engine:"template",mode:"initial"});
ok("A4 asking again reuses the open draft (no duplicate)",d2.body?.reused===true&&q("SELECT COUNT(*) n FROM lead_outreach WHERE lead_id='ir-1'")[0].n===1);
const d3=await call("/api/leads/outreach-draft",{lead_id:"nm-1",engine:"template"});
ok("A5 a lead without a market gets no template draft (409 market_unknown or not contactable) — nothing stored",d3.status===409&&q("SELECT COUNT(*) n FROM lead_outreach WHERE lead_id='nm-1'")[0].n===0,[d3.status,d3.body]);
ok("A6 nothing was sent: no Telegram send, the draft stays 'draft' until the owner approves",!W.tg.some(x=>/^send/.test(x.method))&&q("SELECT COUNT(*) n FROM lead_outreach WHERE status!='draft'")[0].n===0);
// guards of the template route
ins("g-1","طلافروشی (Google Maps) · #abc","discovered",{source:"ad_autopilot",provider:"google_places_ids",place_id:"ChIJx",target_market:"IRAN",type:"gold_fa",lead_status:"provisional_place"});
const convBefore=q("SELECT COUNT(*) n FROM lead_conversations")[0]?.n??0;
const g1=await call("/api/leads/outreach-draft",{lead_id:"g-1",engine:"template"});
const f1=await call("/api/leads/outreach-draft",{lead_id:"iq-1",engine:"template",mode:"followup"});
ok("A8 guards: a Google-only lead is not contactable (409); a follow-up without any sent message is refused (409 mode_not_applicable); no conversation row is created by refused calls",
  g1.status===409&&g1.body?.reason==="lead_not_contactable"&&f1.status===409&&f1.body?.reason==="mode_not_applicable"&&(q("SELECT COUNT(*) n FROM lead_conversations")[0]?.n??0)===convBefore&&q("SELECT COUNT(*) n FROM lead_outreach WHERE lead_id IN ('g-1','iq-1')")[0].n===0,[g1.status,g1.body?.reason,f1.status,f1.body?.reason]);
dbrun("INSERT INTO lead_outreach(id,lead_id,channel,recipient,message,language,status,approved_at,sent_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",["o-sent","iq-1","telegram","x","earlier","Iraqi Arabic","sent",t,t,t,t]);
const f2=await call("/api/leads/outreach-draft",{lead_id:"iq-1",engine:"template",mode:"followup"});
const audit=q("SELECT details_json d FROM system_events WHERE type='lead_outreach_draft'").map(x=>JSON.parse(x.d));
ok("A7 drafts are audited with engine 'template' and their real mode; an Iraqi follow-up after a real send is stored in Iraqi Arabic",audit.length===2&&audit.every(a=>a.engine==="template")&&audit.some(a=>a.mode==="followup")&&f2.status===200&&/وياكم/.test(q("SELECT message FROM lead_outreach WHERE lead_id='iq-1' AND status='draft'")[0]?.message||""),[f2.status,f2.body,audit]);
// ---- Q: final-QA rules (initial outreach vs follow-up, no auto-send, no CONTACTED without evidence, owner decisions, send guard)
ins("ir-2","گالری نمونه دو","discovered",{...vm,url:"https://sample-two.ir/",contact_enrichment_checked_at:t});con("ir-2","phone","+982100000002","https://sample-two.ir/contact");
const stageBefore=q("SELECT stage FROM leads WHERE id='ir-2'")[0].stage;
const i1=await call("/api/leads/outreach-draft",{lead_id:"ir-2",engine:"template",mode:"initial"});
const pl2=(await call("/api/sales/conversion?limit=50",null,"GET")).body.items.find(i=>i.id==="ir-2");
ok("Q1 an INITIAL OUTREACH draft is stored for owner review (kind INITIAL_OUTREACH); the CRM stage does not move and the pipeline shows REVIEWED, not CONTACTED",
  i1.status===200&&i1.body?.draft_kind==="INITIAL_OUTREACH"&&q("SELECT stage FROM leads WHERE id='ir-2'")[0].stage===stageBefore&&pl2?.pipeline?.stage==="REVIEWED"&&pl2?.conversion?.next_action.action==="OWNER_REVIEW_DRAFT",[i1.status,i1.body?.draft_kind,pl2?.pipeline?.stage]);
ok("Q2 a plan with a draft is ready for the owner's review but never 'ready to send' (owner approval + unrecorded compliance screening are blockers)",
  (await call("/api/sales/conversion?limit=50",null,"GET")).body.items.filter(i=>i.conversion?.draft).every(i=>i.conversion.send_readiness.ready_for_owner_review===true&&i.conversion.send_readiness.ready_to_send===false&&i.conversion.send_readiness.blockers.includes("owner_approval_required")&&i.conversion.send_readiness.blockers.includes("compliance_screening_not_recorded")));
ins("iq-2","مجوهرات نموذج اثنين","discovered",{source:"dataset_discovery",provider:"web",url:"https://sample-two.iq/",evidence:"مجوهرات نموذج ذهب",target_market:"ARAB",city:"بغداد",type:"gold_ar",qualification:{buyer_in_title:true,local_domain:true},contact_enrichment_checked_at:t});
con("iq-2","phone","+9647700000002","https://sample-two.iq/");
dbrun("INSERT INTO lead_outreach(id,lead_id,channel,recipient,message,language,status,approved_at,sent_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",["o-sent2","iq-2","telegram","x","earlier","Iraqi Arabic","sent",t,t,t,t]);
const i2=await call("/api/leads/outreach-draft",{lead_id:"iq-2",engine:"template",mode:"initial"});
ok("Q3 no second introduction to an already-contacted lead (409 already_contacted → use FOLLOW-UP)",i2.status===409&&i2.body?.reason==="already_contacted",[i2.status,i2.body?.reason]);
// owner decision kept: a rejected draft is not re-drafted within 30 days
const oid=q("SELECT id FROM lead_outreach WHERE lead_id='ir-2' AND status='draft'")[0].id;
await call("/api/leads/outreach/transition",{id:oid,action:"submit"});const rj=await call("/api/leads/outreach/transition",{id:oid,action:"reject"});
const i3=await call("/api/leads/outreach-draft",{lead_id:"ir-2",engine:"template",mode:"initial"});
ok("Q4 the owner's rejection is kept: no new draft for 30 days unless the owner explicitly forces it",rj.status===200&&i3.status===409&&i3.body?.reason==="outreach_recently_rejected"&&q("SELECT COUNT(*) n FROM lead_outreach WHERE lead_id='ir-2' AND status='draft'")[0].n===0);
// send guard: market-less conversation drafts are kept but cannot be approved/sent; a language/market mismatch is refused
dbrun("INSERT INTO lead_outreach(id,lead_id,channel,recipient,message,language,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",["o-nm","nm-1","telegram","x","سلام","Persian","pending_approval",t,t]);
ins("om-1","Order Customer","customer",{source:"telegram_inbound"});
dbrun("INSERT INTO lead_orders(id,order_number,quote_id,lead_id,conversation_id,market,product,quantity,currency,status,total_minor,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",["ord-1","T-1","q-test","om-1","c-om","ARAB","test box",1,"USD","confirmed",1000,t,t]);
dbrun("INSERT INTO lead_outreach(id,lead_id,channel,recipient,message,language,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",["o-om","om-1","telegram","x","سلام","Persian","pending_approval",t,t]);
const qg1=await call("/api/leads/outreach/transition",{id:"o-nm",action:"approve"}),qg2=await call("/api/leads/outreach/send-telegram",{id:"o-nm"}),qg3=await call("/api/leads/outreach/transition",{id:"o-om",action:"approve"});
ok("Q5 a draft of a conversation without a recorded market is kept (not deleted) but cannot be approved or sent (409 market_required)",
  qg1.status===409&&qg1.body?.reason==="market_required"&&qg2.status===409&&qg2.body?.reason==="market_required"&&q("SELECT status FROM lead_outreach WHERE id='o-nm'")[0].status==="pending_approval",[qg1.status,qg1.body?.reason,qg2.status,qg2.body?.reason]);
ok("Q6 the market comes from the lead's own order record (ARAB), and a Persian draft for it is refused (language_market_mismatch): no TOMAN/USD guess",qg3.status===409&&qg3.body?.reason==="language_market_mismatch"&&q("SELECT status FROM lead_outreach WHERE id='o-om'")[0].status==="pending_approval",[qg3.status,qg3.body?.reason]);
ok("Q7 still nothing was sent automatically: no Telegram send and no 'sent' outreach row created by any of the above",!W.tg.some(x=>/^send/.test(x.method))&&q("SELECT COUNT(*) n FROM lead_outreach WHERE status='sent' AND id NOT IN ('o-sent','o-sent2')")[0].n===0);
globalThis.fetch=inner;

// ---- D: dashboard
{const html=DP.liveDashboardHtml(DP.dashboardRoute("/dashboard/customers")),js=html.slice(html.lastIndexOf("<script>")+8).replace(/<\/script><\/body><\/html>$/,"");let parses=true;try{new Function(js);}catch{parses=false;}
 ok("D1 the Customers page has the Sales Conversion section (after lead prioritization) with a market filter; the script parses",html.includes('id="salesConvPanel"')&&html.includes('id="sc_market"')&&html.indexOf("leadPriorityPanel")<html.indexOf("salesConvPanel")&&parses);
 ok("D2 Errors and approvals pages unchanged; the section's only POST is the owner's 'save for approval' (template draft), never a send",!DP.liveDashboardHtml(DP.dashboardRoute("/dashboard/errors")).includes("salesConvPanel")&&!DP.liveDashboardHtml(DP.dashboardRoute("/dashboard/approvals")).includes("salesConvPanel")
   &&/async function salesConvClick[\s\S]{0,400}\/api\/leads\/outreach-draft/.test(html)&&!/salesConv[\s\S]{0,3000}send-telegram/.test(html.slice(html.indexOf("const SC_ACTION_FA"),html.indexOf("const SC_ACTION_FA")+6000)));}
done();
