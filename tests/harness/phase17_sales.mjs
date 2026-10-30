// PHASE 17 — B2B SALES INTELLIGENCE, end-to-end offline scenarios A–L. Synthetic businesses only; search engines, business sites,
// Google Places and OpenAI are in-process mocks; nothing leaves the process, no message is sent, no paid call is made.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase17_sales");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const LQ=await import(pathToFileURL(path.join(SRC,"lead-qualification.js")).href);
const W=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on",GOOGLE_PLACES_API_KEY:"test-places-not-real",ADS_PLACES_DISCOVERY:"on",OPENAI_API_KEY:"test-openai-not-real"}});const {q,dbrun,call}=W;
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
const AE=await import(pathToFileURL(path.join(SRC,"autonomy-engine.js")).href+"?p17="+Math.random());await AE.autonomyMasterGate(W.env);
const AM=await import(pathToFileURL(path.join(SRC,"ads-markets.js")).href);
const WD=await import(pathToFileURL(path.join(SRC,"agent-watchdog.js")).href);
const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;
const cityIR=AM.adsCityForRun({market:"IRAN",city:"ALL"}),cityIQ=AM.adsCityForRun({market:"ARAB",city:"ALL"});
const html=(title,body,links="")=>new Response(`<html><title>${title}</title><body>${body} ${links}</body></html>`,{status:200,headers:{"Content-Type":"text/html"}});
const SITES={
  "https://zarin-ir.ir/contact":()=>html("تماس با طلافروشی زرین","تلفن <a href=\"tel:+982188776655\">۰۲۱۸۸۷۷۶۶۵۵</a> ایمیل <a href=\"mailto:sales@zarin-ir.ir\">sales@zarin-ir.ir</a>"),
  "https://zarin-ir.ir/":()=>html("طلافروشی زرین "+cityIR,"گالری طلا و جواهر، فروش عمده و کالکشن برند در "+cityIR+". تلفن 02188776655","<a href=\"/contact\">تماس با ما</a>"),
  "https://dhahab-iq.iq/contact":()=>html("اتصل بينا","هاتف <a href=\"tel:+9647701234567\">07701234567</a> <a href=\"mailto:info@dhahab-iq.iq\">info@dhahab-iq.iq</a>"),
  "https://dhahab-iq.iq/":()=>html("مجوهرات الذهب - صائغ "+cityIQ,"محل ذهب ومجوهرات في "+cityIQ+" بيع بالجملة. هاتف 07701234567","<a href=\"/contact\">اتصل بينا</a>"),
  "https://goldstar-ir.ir/contact":()=>html("تماس","<a href=\"mailto:hi@goldstar-ir.ir\">hi@goldstar-ir.ir</a>"),
  "https://goldstar-ir.ir/":()=>html("Gold Star Jewelry طلافروشی "+cityIR,"زرگری در "+cityIR+" 02133445566","<a href=\"/contact\">تماس با ما</a>"),
  "https://goldstar-iq.iq/contact":()=>html("اتصل بينا","<a href=\"mailto:hi@goldstar-iq.iq\">hi@goldstar-iq.iq</a>"),
  "https://goldstar-iq.iq/":()=>html("Gold Star Jewelry مجوهرات "+cityIQ,"محل ذهب في "+cityIQ+" 07709998877","<a href=\"/contact\">اتصل بينا</a>"),
  "https://dubai-gold.ae/":()=>html("مجوهرات دبي "+cityIQ,"محل ذهب في دبي","<a href=\"/contact\">اتصل بينا</a>"),
  "https://nocontact-ir.ir/robots.txt":()=>new Response("User-agent: *\nDisallow:\n",{status:200}),
  "https://nocontact-ir.ir/":()=>html("زرگری بی‌تماس "+cityIR,"زرگری در "+cityIR),
  "https://blocked-ir.ir/robots.txt":()=>new Response("User-agent: *\nDisallow: /\n",{status:200})};
let openaiMode="ok",openaiPrompts=[],draftText="سلام، ما HAMZEHI BOX هستیم و جعبه‌های لوکس جواهرات می‌سازیم. برای بسته‌بندی محصولات‌تان چه نیازی دارید؟",fetched=[];
const inner=globalThis.fetch;
globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);
  if(s.startsWith("https://w.test/"))return W.run(new Request(s,o));
  if(s==="https://places.googleapis.com/v1/places:searchText"){const iq=JSON.parse(o.body||"{}").regionCode==="iq";return new Response(JSON.stringify({places:[{id:(iq?"ChIJiqP17":"ChIJirP17")+"AAAAAAAAAA1"}]}),{status:200,headers:{"Content-Type":"application/json"}});}
  if(/^https:\/\/www\.(google|bing)\.com\/search/.test(s)){const iq=/العراق/.test(decodeURIComponent(new URL(s).searchParams.get("q")||""));
    const links=iq?["https://dhahab-iq.iq/","https://goldstar-iq.iq/","https://dubai-gold.ae/"]:["https://zarin-ir.ir/","https://goldstar-ir.ir/"];
    return new Response("<html>"+links.map(l=>`<a href="${l}">x</a>`).join("")+"</html>",{status:200,headers:{"Content-Type":"text/html"}});}
  if(s==="https://api.openai.com/v1/responses"){const inp=JSON.parse(o.body||"{}").input;if(openaiMode==="timeout"){const e=new Error("The operation was aborted due to timeout");e.name="TimeoutError";throw e;}const isOutreach=typeof inp==="string"&&inp.includes("Never mention any price");if(isOutreach)openaiPrompts.push(inp);
    return new Response(JSON.stringify({output:[{type:"message",content:[{type:"output_text",text:isOutreach?draftText:"پیش‌نویس داخلی"}]}]}),{status:200,headers:{"Content-Type":"application/json"}});}
  const key=Object.keys(SITES).sort((a,b)=>b.length-a.length).find(k=>s===k||s.startsWith(k)&&k.endsWith("/")&&!Object.keys(SITES).some(k2=>k2!==k&&s.startsWith(k2)&&k2.length>k.length));
  if(key){fetched.push(s);return SITES[key]();}
  if(/^https:\/\/[a-z0-9.-]+\/(robots\.txt|contact|contact-us|about)\/?$/.test(s))return new Response("",{status:404});
  return inner(u,o);};
const tick=async()=>{const p=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},W.env,{waitUntil:x=>p.push(x)});await Promise.allSettled(p);};
const backdate=()=>dbrun("UPDATE system_events SET created_at=? WHERE type='ads_autopilot_reserved'",[new Date(Date.now()-61*60000).toISOString()]);
const leadBy=(pred)=>q("SELECT * FROM leads").map(r=>({...r,meta:JSON.parse(r.notes||"{}")})).find(pred);
const intel=async id=>(await call("/api/leads/intelligence?id="+encodeURIComponent(id),null,"GET")).body?.item;
await call("/api/ads/autopilot/status",null,"GET");
for(const market of ["IRAN","ARAB"])await call("/api/ads/markets/config",{market,enabled:true,city:"ALL",type:"gold",runs_per_day:24,owner_approved:true});
await tick();

// ---- A: Iran shop, own site + own-domain contacts → SALES_READY, tier B; Persian draft held for approval
const A=leadBy(l=>String(l.meta.url||"").includes("zarin-ir.ir"));const iA=A&&await intel(A.id);
ok("A1 Iran shop discovered from its own site; identity VERIFIED (own site + same-domain contact), contact VERIFIED, market IRAN",iA?.identity?.status==="IDENTITY_VERIFIED"&&iA.contact.status==="CONTACT_VERIFIED"&&iA.market==="IRAN",iA&&{id:iA.identity,c:iA.contact,m:iA.market});
ok("A2 SALES_READY, tier B (no real buying intent yet), packaging signals from its own page only, demand 'unknown', next action PREPARE_OUTREACH_DRAFT (owner-gated)",iA?.state==="SALES_READY"&&iA.tier==="B"&&iA.packaging_signals.includes("wholesale")&&iA.packaging_demand==="unknown"&&iA.next_action.action==="PREPARE_OUTREACH_DRAFT"&&iA.next_action.autonomous===false,iA&&{s:iA.state,t:iA.tier,ps:iA.packaging_signals,na:iA.next_action});
const dA=await call("/api/leads/outreach-draft",{lead_id:A.id});
ok("A3 Persian draft saved as DRAFT only (manual approval), prompt names HAMZEHI BOX, forbids prices, asks for natural Persian",dA.status===200&&dA.body.status==="draft"&&dA.body.language==="Persian"&&openaiPrompts.length===1&&/HAMZEHI BOX/.test(openaiPrompts[0])&&/Never mention any price/.test(openaiPrompts[0])&&/professional Persian/.test(openaiPrompts[0])&&W.tg.filter(x=>/^send/.test(x.method)).length===0,[dA.status,dA.body,openaiPrompts.length]);
const dA2=await call("/api/leads/outreach-draft",{lead_id:A.id});
ok("A4 memory first: asking again returns the existing draft (reused) with NO second AI call",dA2.body?.reused===true&&dA2.body.outreach_id===dA.body.outreach_id&&openaiPrompts.length===1,dA2.body);

// ---- B: Iraq shop → Iraqi Arabic draft
const B=leadBy(l=>String(l.meta.url||"").includes("dhahab-iq.iq"));const iB=B&&await intel(B.id);
const dB=await call("/api/leads/outreach-draft",{lead_id:B.id});
ok("B1 Iraq shop SALES_READY in market ARAB; draft language Iraqi Arabic and the prompt asks for Iraqi dialect (not MSA)",iB?.state==="SALES_READY"&&iB.market==="ARAB"&&dB.body?.language==="Iraqi Arabic"&&/Iraqi Arabic dialect/.test(openaiPrompts.at(-1)||""),[iB?.state,iB?.market,dB.body?.language]);

// ---- C: Places ID only → provisional, no draft, no AI call
const C=leadBy(l=>l.meta.provider==="google_places_ids"&&l.meta.target_market==="IRAN");const iC=C&&await intel(C.id);const n0=openaiPrompts.length;
const dC=await call("/api/leads/outreach-draft",{lead_id:C.id});
ok("C1 Places-only lead stays PLACE_DISCOVERED, tier D, identity GOOGLE_DISCOVERED, next action WAIT_FOR_VERIFICATION",iC?.state==="PLACE_DISCOVERED"&&iC.tier==="D"&&iC.identity.status==="GOOGLE_DISCOVERED"&&iC.next_action.action==="WAIT_FOR_VERIFICATION",iC&&{s:iC.state,t:iC.tier,i:iC.identity.status});
ok("C2 outreach draft refused 409 lead_not_contactable with zero AI calls",dC.status===409&&dC.body?.reason==="lead_not_contactable"&&openaiPrompts.length===n0,dC.body);

// ---- D: wrong country rejected without CRM contamination
ok("D1 a Dubai (.ae) jewelry page in the Iraq run is rejected (foreign_country) and never stored",!leadBy(l=>String(l.meta.url||"").includes("dubai-gold"))&&q("SELECT details_json FROM system_events WHERE type='ad_autopilot_run'").some(r=>JSON.parse(r.details_json).rejected_reasons?.foreign_country>=1));

// ---- E: rediscovery in a later cycle → no duplicate
const before=q("SELECT COUNT(*) n FROM leads")[0].n;backdate();await tick();
ok("E1 the same businesses rediscovered next cycle create no duplicate CRM records (domain + place-ID identities)",q("SELECT COUNT(*) n FROM leads")[0].n===before&&q("SELECT COUNT(*) n FROM leads WHERE notes LIKE '%zarin-ir.ir%'")[0].n===1,[before,q("SELECT COUNT(*) n FROM leads")[0].n]);

// ---- F: relevant business without any contact channel stays uncontactable; bounded own-site enrichment respects robots.txt
const t=new Date().toISOString(),mkLead=(id,url,ev)=>dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",[id,"زرگری نمونه",url,"discovered","normal",JSON.stringify({source:"crm_fixture",url,evidence:ev,target_market:"IRAN",city:cityIR,qualification:{buyer_in_title:true,local_domain:true}}),t,t]);
mkLead("lead-F","https://nocontact-ir.ir/","زرگری در "+cityIR);mkLead("lead-R","https://blocked-ir.ir/","زرگری در "+cityIR);
const iF=await intel("lead-F"),n1=openaiPrompts.length,dF=await call("/api/leads/outreach-draft",{lead_id:"lead-F"});
ok("F1 relevant verified business with no contact = BUSINESS_QUALIFIED, tier C, next action VERIFY_OFFICIAL_CONTACT (autonomous)",iF?.state==="BUSINESS_QUALIFIED"&&iF.tier==="C"&&iF.next_action.action==="VERIFY_OFFICIAL_CONTACT"&&iF.next_action.autonomous===true,iF&&{s:iF.state,t:iF.tier,na:iF.next_action});
ok("F2 no draft for a lead without any usable contact (409) and no AI call",dF.status===409&&dF.body?.reason==="lead_not_contactable"&&openaiPrompts.length===n1,dF.body);
fetched=[];backdate();await tick();
const mF=leadBy(l=>l.id==="lead-F").meta,mR=leadBy(l=>l.id==="lead-R").meta;
ok("F3 bounded enrichment re-checked the own sites once (marked with a 14-day re-check stamp); robots.txt 'Disallow: /' site was NOT fetched",!!mF.contact_enrichment_checked_at&&String(mR.contact_enrichment_result||"").startsWith("robots_disallow")&&!fetched.includes("https://blocked-ir.ir/"),[mF.contact_enrichment_result,mR.contact_enrichment_result]);
ok("F4 the site publishes no contact, so the lead stays uncontactable (nothing invented)",(await intel("lead-F")).contact.status==="NONE");
// Phase 17.1: the enrichment counter counts only NEW reachable channels, never the re-stored start URL
ok("F4b a site with no published contact records checked:0 (the website itself is not a new contact)",mF.contact_enrichment_result==="checked:0",mF.contact_enrichment_result);
SITES["https://newmail-ir.ir/"]=()=>html("زرگری نیومیل "+cityIR,"زرگری در "+cityIR+" <a href=\"mailto:info@newmail-ir.ir\">info@newmail-ir.ir</a>");
mkLead("lead-N","https://newmail-ir.ir/","زرگری در "+cityIR);backdate();await tick();
{const mN=leadBy(l=>l.id==="lead-N").meta;
 ok("F4c a newly published own-site email is counted (checked:1) and stored once",mN.contact_enrichment_result==="checked:1"&&q("SELECT COUNT(*) n FROM lead_contacts WHERE lead_id='lead-N' AND contact_type='email'")[0].n===1,mN.contact_enrichment_result);}

// ---- G: price request → owner financial decision (approved-price rules live in the Sales Brain; see phase16/phase14 suites)
const g=LQ.leadQualification({stage:"replied"},{source:"telegram_inbound",target_market:"IRAN",city:cityIR},[],{replied:true,quote_requested:true});
ok("G1 a customer price/quote request without an approved quote → next action ESCALATE_FINANCIAL_DECISION (owner decision), never autonomous",g.next_action.action==="ESCALATE_FINANCIAL_DECISION"&&g.next_action.autonomous===false&&g.next_action.authorization==="owner_decision",g.next_action);
draftText="قیمت هر جعبه ۲۵۰٬۰۰۰ تومان است";dbrun("UPDATE lead_outreach SET status='sent' WHERE lead_id=?",[B.id]);
const Gx=leadBy(l=>String(l.meta.url||"").includes("goldstar-ir.ir"));const dG=await call("/api/leads/outreach-draft",{lead_id:Gx.id});
ok("G2 a model draft that names a price is NOT saved (422 draft_mentions_price); prices stay with the owner",dG.status===422&&dG.body?.reason==="draft_mentions_price"&&!q("SELECT 1 FROM lead_outreach WHERE lead_id=?",[Gx.id]).length,dG.body);
draftText="سلام، ما HAMZEHI BOX هستیم. برای بسته‌بندی محصولات‌تان چه نیازی دارید؟";

// ---- H: Places budget exhausted → only Places stops
for(let i=0;i<250;i++)dbrun("INSERT INTO system_events(id,type,severity,message,details_json,created_at) VALUES(?,?,?,?,?,?)",["p17full"+i,"places_reserved","info","x",JSON.stringify({sku:"ids_only",reserved_micros:32000}),new Date().toISOString()]);
backdate();await tick();const lastIR=q("SELECT details_json FROM system_events WHERE type='ad_autopilot_run'").map(r=>JSON.parse(r.details_json)).filter(d=>d.market==="IRAN").at(-1);
ok("H1 budget exhausted: Places step budget_limited, web discovery still ran (candidates evaluated), CRM unaffected",lastIR.places?.status==="budget_limited"&&lastIR.candidates>=1,lastIR.places);

// ---- I: AI provider unavailable → no draft, nothing created, CRM still answers
const keep=W.env.OPENAI_API_KEY;delete W.env.OPENAI_API_KEY;const Ix=leadBy(l=>String(l.meta.url||"").includes("goldstar-iq.iq"));
const dI=await call("/api/leads/outreach-draft",{lead_id:Ix.id}),sI=await call("/api/sales/intelligence",null,"GET");W.env.OPENAI_API_KEY=keep;
ok("I1 without the AI provider the draft route answers 503 and creates no outreach row; sales intelligence (deterministic) still works",dI.status===503&&!q("SELECT 1 FROM lead_outreach WHERE lead_id=?",[Ix.id]).length&&sI.status===200&&sI.body.ok,[dI.status,sI.status]);

// ---- J: owner rejects a draft → recorded, never re-sent, not re-drafted automatically
await call("/api/leads/outreach/transition",{id:dA.body.outreach_id,action:"submit"});const rj=await call("/api/leads/outreach/transition",{id:dA.body.outreach_id,action:"reject"});
const n2=openaiPrompts.length,again=await call("/api/leads/outreach-draft",{lead_id:A.id}),send=await call("/api/leads/outreach/send-telegram",{id:dA.body.outreach_id});
ok("J1 owner rejection is recorded (status rejected); a new draft is refused 409 outreach_recently_rejected without an AI call",rj.body?.status==="rejected"&&again.status===409&&again.body?.reason==="outreach_recently_rejected"&&openaiPrompts.length===n2,[rj.body,again.body]);
ok("J2 the rejected draft can never be sent (send refused) and nothing reached Telegram",send.status>=400&&W.tg.filter(x=>/^send/.test(x.method)).length===0,send.status);
ok("J3 next action after rejection = NO_ACTION_REQUIRED (owner decided), not a new draft",(await intel(A.id)).next_action.action==="NO_ACTION_REQUIRED");
const forced=await call("/api/leads/outreach-draft",{lead_id:A.id,force:true});
ok("J4 only an explicit owner request (force:true) drafts again — still a DRAFT, nothing sent",forced.status===200&&forced.body.status==="draft"&&!forced.body.reused);

// ---- K: previous customer → CUSTOMER, tier A, follow-up drafting stays owner-approved
dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",["lead-K","مشتری قبلی","manual","customer","high",JSON.stringify({source:"telegram_inbound",target_market:"IRAN",city:cityIR}),t,t]);
const iK=await intel("lead-K");
ok("K1 an existing customer is CUSTOMER / tier A with FOLLOW_UP_EXISTING_CONVERSATION that needs owner approval before any send",iK.state==="CUSTOMER"&&iK.tier==="A"&&iK.next_action.action==="FOLLOW_UP_EXISTING_CONVERSATION"&&iK.next_action.authorization==="owner_approval_before_send",iK.next_action);

// ---- L: same name, different countries → separate identities and markets
const L1=leadBy(l=>String(l.meta.url||"").includes("goldstar-ir.ir")),L2=leadBy(l=>String(l.meta.url||"").includes("goldstar-iq.iq"));
ok("L1 two 'Gold Star Jewelry' businesses in Iran and Iraq stay two leads with their own market (never merged by name)",L1&&L2&&L1.id!==L2.id&&(await intel(L1.id)).market==="IRAN"&&(await intel(L2.id)).market==="ARAB");

// ---- QA review gaps: provider timeout, concurrency, unapproved send, Watchdog continuity
{const T=leadBy(l=>String(l.meta.url||"").includes("goldstar-ir.ir"));openaiMode="timeout";const r=await call("/api/leads/outreach-draft",{lead_id:T.id});openaiMode="ok";
 ok("T1 OpenAI timeout: the draft route fails closed (5xx), creates no outreach row and sends nothing",r.status>=500&&!q("SELECT 1 FROM lead_outreach WHERE lead_id=?",[T.id]).length&&W.tg.filter(x=>/^send/.test(x.method)).length===0,[r.status,r.body]);
 const C2=leadBy(l=>String(l.meta.url||"").includes("goldstar-iq.iq"));const both=await Promise.all([call("/api/leads/outreach-draft",{lead_id:C2.id}),call("/api/leads/outreach-draft",{lead_id:C2.id})]);
 ok("T2 two simultaneous draft requests for one lead leave exactly ONE outreach draft (the second reuses it)",both.every(x=>x.status===200)&&q("SELECT COUNT(*) n FROM lead_outreach WHERE lead_id=?",[C2.id])[0].n===1,[both.map(x=>x.body?.reused),q("SELECT COUNT(*) n FROM lead_outreach WHERE lead_id=?",[C2.id])[0].n]);
 const draftId=q("SELECT id FROM lead_outreach WHERE lead_id=?",[C2.id])[0].id,sendU=await call("/api/leads/outreach/send-telegram",{id:draftId});
 ok("T3 a draft that was never approved cannot be sent (refused) — nothing reaches Telegram",sendU.status>=400&&W.tg.filter(x=>/^send/.test(x.method)).length===0,sendU.status);
 const n0=q("SELECT COUNT(*) n FROM leads")[0].n;backdate();await Promise.all([tick(),tick()]);
 ok("T4 two overlapping scheduler ticks create no duplicate leads (reservations + identity keys)",q("SELECT COUNT(*) n FROM leads")[0].n===n0,[n0,q("SELECT COUNT(*) n FROM leads")[0].n]);
 const wd=await WD.runWatchdog(W.env);
 ok("T5 Watchdog keeps running after the sales-flow failures: ok + healthy, no agent disabled",wd.ok&&wd.healthy===true,wd);}

// ---- Intelligence API, security, market money
const S=(await call("/api/sales/intelligence",null,"GET")).body;
ok("S1 per-market metrics in each market's own currency (IRAN TOMAN, ARAB USD), provisional Places counted apart",S.markets.IRAN.currency==="TOMAN"&&S.markets.ARAB.currency==="USD"&&S.markets.IRAN.provisional_discoveries>=1&&S.markets.IRAN.sales_ready>=1&&S.markets.ARAB.sales_ready>=1,{IR:S.markets.IRAN.states,AR:S.markets.ARAB.states});
ok("S2 the ranked list never includes provisional Places IDs (unless tier D is requested) and is sorted by priority",S.items.every(i=>i.state!=="PLACE_DISCOVERED")&&S.items.every((x,i,a)=>!i||a[i-1].priority_score>=x.priority_score));
const un=await W.run(new Request("https://w.test/api/sales/intelligence")),un2=await W.run(new Request("https://w.test/api/leads/intelligence?id="+A.id));
ok("S3 intelligence routes require the admin token (401 without it)",un.status===401&&un2.status===401);
const badDate=await call("/api/leads",{id:A.id,last_reply_at:"not-a-date"},"PATCH");
ok("S4 PATCH rejects a non-date engagement field (400) — engagement cannot be faked by a malformed value",badDate.status===400,badDate.body);
{const ov=(await call("/api/leads/overview",null,"GET")).body,ms=ov.market_summary;
 ok("S6 /api/leads/overview carries the candidate market summary: IRAN/ARAB separate, same lead counts as /api/sales/intelligence, provisional never sales-ready",
   ms&&ms.IRAN.discovered===S.markets.IRAN.leads&&ms.ARAB.discovered===S.markets.ARAB.leads&&ms.IRAN.sales_ready===S.markets.IRAN.sales_ready&&ms.ARAB.sales_ready===S.markets.ARAB.sales_ready&&ms.IRAN.discovered+ms.ARAB.discovered<=ov.total&&ms.IRAN.states.PLACE_DISCOVERED===S.markets.IRAN.provisional_discoveries&&ms.IRAN.sales_ready+ms.ARAB.sales_ready<=ov.total-ms.IRAN.states.PLACE_DISCOVERED-ms.ARAB.states.PLACE_DISCOVERED,
   {ov:{IR:ms?.IRAN?.discovered,AR:ms?.ARAB?.discovered,srIR:ms?.IRAN?.sales_ready},si:{IR:S.markets.IRAN.leads,AR:S.markets.ARAB.leads,srIR:S.markets.IRAN.sales_ready}});
 ok("S7 overview tiers are reported and every provisional Places lead is tier D",ov.tiers&&ov.tiers.D>=ms.IRAN.states.PLACE_DISCOVERED+ms.ARAB.states.PLACE_DISCOVERED&&(ov.items||[]).filter(x=>x.qualification.state==="PLACE_DISCOVERED").every(x=>x.qualification.tier==="D"),ov.tiers);}
ok("S5 nothing left the in-process mocks; no Telegram message was sent",W.offNet().length===0&&W.tg.filter(x=>/^send/.test(x.method)).length===0,W.offNet());
done();
