// RR1 — CUSTOMER REPLY RECOVERY: an ordinary customer question is not left unanswered because one sentence carried an unsupported
// claim or the bounded rewrite failed; correct sentences are kept, only the defective part is removed or referred to the owner, and
// every commercial boundary (D-004 owner-only terms, D-016 standard offer, D-005/D-006 shipping, opt-out C-04, payment C-05) holds.
// Local only: in-memory SQLite, recording Telegram, scripted model (the reply-author call repeats the model's claim, i.e. the bounded
// rewrite FAILS, the hardest case). Synthetic customers and data only; no network, no real messages.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";import {createHash} from "node:crypto";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,gap,done}=reporter("phase51_reply_recovery");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const SRC=process.env.SRC||path.join(REPO,"worker/src");
const SA=await import(pathToFileURL(path.join(SRC,"sales-ai-brain.js")).href);
// ---- unit: the engine slot is a block of its own; a slot-only remainder is kept only when asked for ----
if(typeof SA.splitReplyBlocks!=="function")ok("U0 splitReplyBlocks is exported",false,"missing export");
else{const S=SA.SALES_AI_COMMERCIAL_SLOT;
 const blocks=SA.splitReplyBlocks("برای ۱۰۰۰ عدد: "+S+" ارسالش هم رایگانه.");
 ok("U1 slot split into its own block",JSON.stringify(blocks)===JSON.stringify(["برای ۱۰۰۰ عدد:",S,"ارسالش هم رایگانه."]),blocks);
 const r=SA.salesAiRepairProse("برای ۱۰۰۰ عدد: "+S+" ارسالش هم رایگانه.",{allowedNumbers:[1000]});
 ok("U2 claim next to the slot is removed, intro and slot kept",!!r&&r.text.includes(S)&&!/رایگان/.test(r.text),r);
 const only="تخفیف بیشتر میدیم. "+S;
 ok("U3 slot-only remainder is null by default",SA.salesAiRepairProse(only,{allowedNumbers:[]})===null);
 const kept=SA.salesAiRepairProse(only,{allowedNumbers:[],allowSlotOnly:true});
 ok("U4 slot-only remainder kept when allowSlotOnly",!!kept&&kept.text===S,kept);}
// ---- world (same seeds as the PD90/RR1 probes) ----
const ORCH=fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8");
const MIG=fs.readFileSync(path.join(REPO,"owner-actions/phase25-delete-system/01-migration.sql"),"utf8");
const inc=JSON.parse(fs.readFileSync(path.join(REPO,"tests/harness/fixtures/phase51-live-abadan-aa2889f0.json"),"utf8")),ship=inc.approved_shipping;
const OWNER="-100555123456",T="2026-10-01T00:00:00.000Z";
const L=`INSERT INTO commercial_price_items(id,product_key,product_name,sku,market,currency,unit_price_minor,moq,version,active,effective_from,effective_until,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
const S="INSERT INTO business_settings(id,setting_key,scope_key,value_json,version,status,approved_by,approved_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)";
const KF="INSERT INTO sales_knowledge_facts(id,fact_key,domain,entity_type,entity_key,attribute,market,member_key,value_json,value_hash,version,status,authority,source_type,change_request_id,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
const ARAB_SHIP="في إيران والعراق يتحمّل الزبون أجور الشحن والكرتون والنقل إلى شركة الشحن، وهي خارج سعر العلبة؛ لا يُذكر مبلغ غير موثّق.\nالشحن إلى العراق عبر شركة نقل بضائع إلى العراق؛ لا يُضمن التسليم المباشر للعنوان النهائي دون مستند.";
const IRAN_FACT="هزینه چاپ، طراحی و ساخت کلیشه رایگان است.",ARAB_FACT="الطباعة القياسية والتصميم وصنع الكليشة مشمولة بسعر العلبة بدون كلفة إضافية.";
const W=await makeWorld({aiBrain:"on",extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on",OWNER_TELEGRAM_CHAT_ID:OWNER}});W.d1.db.exec(ORCH);
for(const p of ["/api/quotes","/api/si/knowledge/product","/api/owner-escalations","/api/leads/outreach","/api/content/pipeline"])await W.call(p,null,"GET");W.d1.db.exec(MIG);
W.dbrun("CREATE TABLE IF NOT EXISTS telegram_media_sources(id TEXT PRIMARY KEY,chat_id TEXT NOT NULL,chat_username TEXT,message_id TEXT NOT NULL,file_id TEXT NOT NULL,file_unique_id TEXT,media_type TEXT,caption TEXT,source_kind TEXT,created_at TEXT,updated_at TEXT)");
W.dbrun(L,["R1","k1","انگشتر کوچک · 5x5 · 3 تکه",null,"IRAN","TOMAN",66000,null,1,1,null,null,"admin",T,T,T]);
W.dbrun(L,["A1","a1","علبة خاتم صغيرة · 5x5x4 · ثلاث قطع",null,"ARAB","USD",60,null,1,1,null,null,"admin",T,T,T]);
W.dbrun(S,["di","discount_rule","market:IRAN",JSON.stringify({type:"percent_bp",value:1000,min_quantity:1000}),1,"current","owner",T,T]);
W.dbrun(S,["ds","discount_rule","market:ARAB",JSON.stringify({type:"percent_bp",value:1000,min_quantity:1001}),1,"current","owner",T,T]);
W.dbrun(S,["dpi","deposit_percent","market:IRAN","50",1,"current","owner",T,T]);W.dbrun(S,["dpa","deposit_percent","market:ARAB","50",1,"current","owner",T,T]);
const kf=(id,market,text)=>W.dbrun(KF,[id,"aset-"+id,"shipping","business","global","terms",market,"",JSON.stringify(text),createHash("sha256").update(JSON.stringify(text)).digest("hex"),1,"active","owner_approved","captured_local_only","aset-"+id,"captured-owner-approval",T,T,T]);
kf(ship.id,"IRAN",JSON.parse(ship.value_json));kf("aset-arab-ship","ARAB",ARAB_SHIP);
for(const [market,value] of [["IRAN",IRAN_FACT],["ARAB",ARAB_FACT]]){await W.call("/api/sales-knowledge/teach",{market,records:[{operation:"ADD",kind:"capability",typed:null,entity:{type:"business",key:"global"},concept:"included_services",value,keywords:[],labels:{},conditions:[],effect:null,relation:null}]});for(const x of W.q("SELECT id FROM sales_knowledge_change_requests WHERE status NOT IN ('applied','rejected')"))await W.approveK(x.id);}
let n=0;for(const c of ["مشکی سلفون","طلایی سلفون","سرمه‌ای سلفون"])await W.teach(`COLOR | ${c} | IRAN`,"IRAN","cf"+(++n));for(const c of ["أسود","ذهبي"])await W.teach(`COLOR | ${c} | ARAB`,"ARAB","ca"+(++n));
if(!(await W.call("/api/sales-ai-first",{mode:"on",allowlist:[]},"POST")).body?.ok)throw Error("AI-FIRST not set");
const PK={IRAN:"list:انگشتر کوچک",ARAB:"list:علبة خاتم صغيرة"};
const I=(intent,o={})=>({primary_intent:intent,product_key:null,reference:"none",requested_size:null,requested_color:[],requested_structure:null,requested_printing:null,quantity:null,ambiguity:"none",confidence:"high",...o});
// DA: primary decision `reply`; the reply-author call (ctx.authoring) repeats the same prose + the protected parts (the rewrite fails).
const DA=(reply,intent,o={})=>(ctx)=>({requests:o.requests||[],reply:ctx?.authoring?[reply.replace(/\{\{(?:COMMERCIAL|INFORMATION)\}\}/g,"").trim(),...(ctx.authoring.required_parts||[])].filter(Boolean).join("\n"):reply,reply_colors:[],acceptance:intent==="acceptance",interpretation:I(intent,o.interp||{}),
  semantics:{mode:o.mode||"browse",quantity_role:o.qrole||"none",deal_reference:o.deal||"none",repeat_requested:false},
  facts:{colors:[],color_parts:[],unknown_colors:[],color_statement:"none",negated_colors:[],quantity:o.interp?.quantity??null,destination:o.destination||null,customer_name:null}});
let uid=771000000;
const out=u=>W.tg.filter(x=>x.method==="sendMessage"&&(String(x.body).includes(`"chat_id":"${u.id}"`)||String(x.body).includes(`"chat_id":${u.id}`))).map(x=>{try{return JSON.parse(x.body).text||"";}catch{return "";}});
const toOwner=()=>W.tg.filter(x=>x.method==="sendMessage"&&String(x.body).includes(`"chat_id":"${OWNER}"`)).map(x=>JSON.parse(x.body).text);
const leadOf=u=>W.q("SELECT lead_id FROM inbox_messages WHERE provider_sender_id=? LIMIT 1",[String(u.id)])[0]?.lead_id;
const open=u=>W.q("SELECT reason_code,unresolved_question FROM owner_escalations WHERE lead_id=? AND status='open'",[leadOf(u)]);
const num=t=>String(t||"").replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[٬,]/g,"").replace(/٫/g,".").replace(/٪/g,"%");
// the customer's requested percentage in any digits / percent sign / words
const grants20=s=>/(?<![\d.])20\s*%|(?<![\d.])20\s*درصد|بیست\s*درصد|عشرين\s*(?:%|بالمية|بالمئة)/u.test(num(s));
const turn=async(u,msg,dec)=>{if(dec)W.AI.script.set(msg,dec);SA.resetSalesAiCooldown?.();const b=out(u).length,o=toOwner().length;const r=await W.send(u,msg);return {r,sent:out(u).slice(b),owner:toOwner().slice(o)};};
const start=async market=>{const u={id:++uid,name:"Case "+uid,username:"case"+uid};await turn(u,market==="IRAN"?"سلام":"هلا",DA(market==="IRAN"?"سلام، بفرمایید.":"هلا بيك.","greeting"));W.setMarket(u,market==="IRAN"?"iran":"iraq");return u;};
const IR_OFFER=["66000","66000000","59400000","29700000"],IQ_OFFER=["0.60","540.54","270.27"];
// every automatically sent total in this suite must carry D-016 provenance (standard_total + standard_offer_authority)
function provenance(label,x){const t=num(x.sent.join(" "));ok(label+" automatic total carries D-016 provenance",!/(?<![\d.])(?:59400000|540\.54)(?!\d)/.test(t)||x.r.brain?.standard_total===true&&!!x.r.brain?.standard_offer_authority,{standard_total:x.r.brain?.standard_total});}
// exact figures (not substrings: 66000 must not be satisfied by 66000000)
const has=(sent,figs)=>{const t=num(sent.join(" "));return figs.every(f=>new RegExp("(?<![\\d.])"+f.replace(".","\\.")+"(?![\\d])").test(t));};
// GV1 final owner directive (2026-11-19): general/informational text checks are read-only (ai_brain.advisory) and never hold a reply or
// open an owner case; only commercial-authority findings, opt-out and duplicate guards hold. Expectations below updated accordingly.
// ---- R1: volunteered non-commercial claim → correct answer sent as written, no owner case ----
{const u=await start("IRAN");const x=await turn(u,"جعبه انگشتر کوچک دارید؟",DA("بله، جعبه انگشتر کوچک 3 تکه داریم. داخلش مخمل ضدآب و ضدخش داره.","product_info",{interp:{product_key:PK.IRAN},requests:["product_info"]}));
 ok("R1 product question answered",x.sent.length===1&&/داریم/.test(x.sent[0]),x.sent);
 ok("R1 GV1: informational description is sent and recorded, not removed",x.sent.some(s=>/مخمل/.test(s))&&(x.r.brain?.ai_brain?.advisory||[]).length>0,{sent:x.sent,advisory:x.r.brain?.ai_brain?.advisory});
 ok("R1 no owner case for a volunteered non-commercial claim",open(u).length===0,open(u));}
// ---- R2: unapproved shipping-cost sentence removed → payer rule sent, owner case kept ----
{const u=await start("IRAN");const x=await turn(u,"هزینه ارسال به شیراز با کیه؟",DA("هزینه ارسال به شیراز با خود مشتریه و جدا از قیمت جعبه حساب میشه. هزینه کارتن رو هم ما میدیم.","shipping",{requests:["shipping"],destination:"شیراز"}));
 ok("R2 shipping payer answered from the approved policy",x.sent.length===1&&/مشتری/.test(x.sent[0]),x.sent);
 ok("R2 unapproved cost-sharing never sent",!x.sent.some(s=>/ما\s*می\s*دیم|ما\s*میدیم|رایگان/.test(s)),x.sent);
 ok("R2 owner case kept (a commercial claim was removed)",open(u).length===1,open(u));}
// ---- R3: multi-question; invented production time removed → product answer sent, production time stays with the owner ----
{const u=await start("IRAN");const x=await turn(u,"جعبه انگشتر کوچک دارید؟ چند روزه آماده میشه؟",DA("بله، جعبه انگشتر کوچک 3 تکه داریم. سفارش ظرف ۷ روز کاری آماده میشه.","product_info",{interp:{product_key:PK.IRAN},requests:["product_info","production"]}));
 ok("R3 answerable part delivered",x.sent.length===1&&/داریم/.test(x.sent[0]),x.sent);
 ok("R3 invented production time never sent",!x.sent.some(s=>/۷\s*روز|7\s*روز/.test(s)),x.sent);
 ok("R3 production time stays with the owner",open(u).length===1,open(u));}
// ---- C2: standard price + false free shipping → exact offer as a standalone block, claim removed, owner case kept ----
{const u=await start("IRAN");const x=await turn(u,"قیمت انگشتر کوچک 3 تکه برای 1000 عدد چنده؟ ارسالش رایگانه؟",DA("برای ۱۰۰۰ عدد: {{COMMERCIAL}} ارسالش هم رایگانه.","price",{mode:"quote",interp:{product_key:PK.IRAN,quantity:1000},requests:["price","shipping"],qrole:"order_count"}));
 ok("C2 exact standard offer delivered",x.sent.length===1&&has(x.sent,IR_OFFER),x.sent);
 ok("C2 free-shipping claim never sent",!x.sent.some(s=>/رایگان/.test(s)),x.sent);
 ok("C2 engine offer is a standalone line",x.sent.length===1&&x.sent[0].split("\n").some(l=>/^انگشتر کوچک 3 تکه برای/.test(l)),x.sent);
 ok("C2 shipping question stays with the owner",open(u).length===1,open(u));provenance("C2",x);}
// ---- D1/D2: out-of-rule discount request → standard offer + the engine's discount-limit sentence, nothing granted ----
{const u=await start("IRAN");const x=await turn(u,"برای 1000 عدد انگشتر کوچک 3 تکه ۲۰٪ تخفیف میدید؟",DA("تخفیف ۲۰٪ برای این سفارش تأیید نشده؛ تخفیف مصوب همین تعداد در قیمت زیر حساب شده:\n{{COMMERCIAL}}","negotiate",{mode:"quote",interp:{product_key:PK.IRAN,quantity:1000},requests:["price","discount"],qrole:"order_count"}));
 ok("D1 discount request answered with the approved standard offer",x.sent.length===1&&has(x.sent,IR_OFFER),x.sent);
 ok("D1 the extra discount is declined",x.sent.some(s=>/تخفیف بیشتری در شرایط مصوب فعلی قابل اعمال نیست/.test(s)),x.sent);
 ok("D1 no 20% granted (any digits / percent sign / words)",!x.sent.some(grants20),x.sent);
 ok("D1 the out-of-rule request stays with the owner",open(u).length===1,open(u));provenance("D1",x);}
{const u=await start("ARAB");const x=await turn(u,"تنطوني خصم 20% على 1001 علبة خاتم صغيرة ثلاث قطع؟",DA("خصم 20% غير معتمد لهذا الطلب، والخصم المعتمد لهذي الكمية محسوب بالعرض:\n{{COMMERCIAL}}","negotiate",{mode:"quote",interp:{product_key:PK.ARAB,quantity:1001},requests:["price","discount"],qrole:"order_count"}));
 ok("D2 Iraq discount request answered with the approved offer (USD)",x.sent.length===1&&has(x.sent,IQ_OFFER)&&!x.sent.some(s=>/تومان/.test(s)),x.sent);
 ok("D2 no 20% granted (any digits / percent sign / words)",!x.sent.some(grants20),x.sent);
 ok("D2 the extra discount is declined (engine sentence)",x.sent.some(s=>/ما عندي تخفيض إضافي ضمن الشروط المعتمدة/.test(s)),x.sent);
 ok("D2 the out-of-rule request stays with the owner",open(u).length===1,open(u));provenance("D2",x);}
// ---- C4: valid standard price (control) ----
{const u=await start("IRAN");const x=await turn(u,"قیمت انگشتر کوچک 3 تکه برای 1000 عدد چنده؟",DA("برای ۱۰۰۰ عدد: {{COMMERCIAL}}","price",{mode:"quote",interp:{product_key:PK.IRAN,quantity:1000},requests:["price"],qrole:"order_count"}));
 ok("C4 valid standard offer sent with exact figures",x.sent.length===1&&has(x.sent,IR_OFFER),x.sent);
 ok("C4 D-016 provenance recorded (standard_total + standard_offer_authority)",x.r.brain?.standard_total===true&&!!x.r.brain?.standard_offer_authority,{standard_total:x.r.brain?.standard_total,authority:x.r.brain?.standard_offer_authority});}
// every automatically sent total in this suite carries D-016 provenance
// ---- A1/A2/A3: owner case is never dropped when the reply defers or a commercial claim was removed; no fragments ----
{const u=await start("IRAN");const x=await turn(u,"چاپ لوگو روی جعبه چقدر طول میکشه؟",DA("زمان دقیق تولید رو مدیر بررسی میکنه و خبرتون میدیم. ارسال به سراسر ایران رایگانه.","production",{requests:["production"]}));
 ok("A1 free shipping never sent",!x.sent.some(s=>/رایگان/.test(s)),x.sent);ok("A1 owner case kept",open(u).length===1,open(u));}
{const u=await start("IRAN");const x=await turn(u,"هزینه پستش با کیه؟",DA("ارسال به همه شهرها با باربری انجام میشه. کرایه ارسال رایگانه.","shipping",{requests:["shipping"]}));
 ok("A2 free freight never sent",!x.sent.some(s=>/رایگان/.test(s)),x.sent);ok("A2 owner case kept",open(u).length===1,open(u));}
{const u=await start("IRAN");const x=await turn(u,"قیمت انگشتر کوچک 3 تکه برای 1000 عدد چنده؟ ارسالش رایگانه؟ (A3)",DA("قیمتش اینه {{COMMERCIAL}} برای شما. ارسالش هم رایگانه.","price",{mode:"quote",interp:{product_key:PK.IRAN,quantity:1000},requests:["price","shipping"],qrole:"order_count"}));
 ok("A3 free shipping never sent",!x.sent.some(s=>/رایگان/.test(s)),x.sent);
 ok("A3 no offer split around a mid-sentence slot",!x.sent.some(s=>s.split("\n").some(l=>l.trim()==="برای شما."||l.trim()==="برای شما")),x.sent);
 ok("A3 owner case kept",open(u).length===1,open(u));}
// ---- C6 payment claim, C7 opt-out, C9 duplicate update ----
{const u=await start("IRAN");await turn(u,"قیمت انگشتر کوچک 3 تکه برای 1000 عدد چنده؟ (C6)",DA("برای ۱۰۰۰ عدد: {{COMMERCIAL}}","price",{mode:"quote",interp:{product_key:PK.IRAN,quantity:1000},requests:["price"],qrole:"order_count"}));
 const x=await turn(u,"مبلغ پیش‌پرداخت رو واریز کردم",DA("ممنون، به همکارم اطلاع می‌دم بررسی کنه.","payment",{mode:"payment_claim",requests:["payment"]}));
 ok("C6 no payment recorded from a customer claim",W.q("SELECT COUNT(*) n FROM lead_order_payments WHERE order_id IN (SELECT id FROM lead_orders WHERE lead_id=?)",[leadOf(u)])[0].n===0);
 ok("C6 customer never told the payment is confirmed",!x.sent.some(s=>/تأیید شد|تایید شد|دریافت شد/.test(s)),x.sent);}
{const u={id:++uid,name:"Case "+uid,username:"case"+uid};await turn(u,"لطفاً دیگه پیام ندید",DA("باشه.","other"));W.setMarket(u,"iran");
 const x=await turn(u,"جعبه انگشتر کوچک دارید؟ (C7)",DA("بله، جعبه انگشتر کوچک 3 تکه داریم. داخلش مخمل ضدآب و ضدخش داره.","product_info",{interp:{product_key:PK.IRAN},requests:["product_info"]}));
 ok("C7 opted-out customer receives nothing",out(u).length===0,out(u));ok("C7 hold recorded as the opt-out",x.r.draft?.error_detail==="customer_opted_out",x.r.draft);}
{const u=await start("IRAN");const msg="جعبه انگشتر کوچک دارید؟ (C9)";const x=await turn(u,msg,DA("بله، جعبه انگشتر کوچک 3 تکه داریم.","product_info",{interp:{product_key:PK.IRAN},requests:["product_info"]}));
 const before=out(u).length;await W.post({update_id:9100000+uid,message:{message_id:Number(x.r.row.external_id.split(":").at(-1)),date:Math.floor(Date.now()/1000),from:{id:u.id,is_bot:false,first_name:u.name},chat:{id:u.id,type:"private"},text:msg}});
 ok("C9 answered once",x.sent.length===1,x.sent);ok("C9 replayed update sends nothing",out(u).length===before,out(u));}
// ---- C8: temporary provider error → no reply, one owner case that names the service failure (not a knowledge gap) ----
{const u=await start("IRAN");W.AI.status="http500";let x;try{x=await turn(u,"جعبه انگشتر کوچک دارید؟ (C8)",DA("بله، جعبه انگشتر کوچک 3 تکه داریم.","product_info",{interp:{product_key:PK.IRAN},requests:["product_info"]}));}finally{W.AI.status=null;}
 const cases=open(u);
 ok("C8 no canned or invented reply",x.sent.length===0,x.sent);
 ok("C8 one durable owner case",cases.length===1,cases);
 ok("C8 the case names the provider failure",cases.length===1&&cases[0].unresolved_question==="ai_provider_unavailable",cases);
 ok("C8 the decision records the provider failure",x.r.brain?.owner_topic==="ai_provider_unavailable"&&x.r.brain?.ai_brain?.provider_failure?.stage==="primary",{topic:x.r.brain?.owner_topic,pf:x.r.brain?.ai_brain?.provider_failure});
 ok("C8 owner alert says it is not missing business knowledge",x.owner.some(t=>/خطای موقت سرویس هوش مصنوعی/.test(t)),x.owner);}
// ---- reviewer findings: guards tested on their own ----
// G1: the kept text defers to the owner (honest uncertainty), only a NON-commercial claim was removed → the owner case must stay.
{const u=await start("IRAN");const x=await turn(u,"جعبه انگشتر کوچک دارید؟ (G1)",DA("بله، جعبه انگشتر کوچک 3 تکه داریم. درباره رنگ‌های خاص مطمئن نیستم. داخلش مخمل ضدآب داره.","product_info",{interp:{product_key:PK.IRAN},requests:["product_info"]}));
 const deferralSent=x.sent.some(s=>/مطمئن نیستم/.test(s));
 // Known gap (reported every run, never counted as a pass): the earlier stages already withhold a reply whose kept text defers to the
 // owner, so the removedOnlyVolunteered deferral guard is defense in depth and is not reachable end-to-end with this scripted reply.
 gap("G1 deferral guard reachable end-to-end (the deferral sentence is delivered)",deferralSent,{sent:x.sent,owner_cases:open(u)});
 ok("G1 GV1: informational description is sent and recorded, not removed",x.sent.some(s=>/مخمل/.test(s))&&(x.r.brain?.ai_brain?.advisory||[]).length>0,{sent:x.sent,advisory:x.r.brain?.ai_brain?.advisory});
 ok("G1 GV1: honest uncertainty opens no owner case (not a real owner decision)",open(u).length===0,open(u));}
// G2: the model placed the slot but the turn has no engine segment → the slot-only remainder never becomes an empty message.
{const u=await start("IRAN");const x=await turn(u,"جعبه انگشتر کوچک دارید؟ (G2)",DA("داخلش مخمل ضدآب داره. {{COMMERCIAL}}","product_info",{interp:{product_key:PK.IRAN},requests:["product_info"]}));
 ok("G2 no empty or slot-only message is sent",x.sent.every(s=>s.trim()&&!/\{\{/.test(s)),x.sent);
 ok("G2 GV1: informational description is sent (slot removed), not held",x.sent.length===1&&/مخمل/.test(x.sent[0]),x.sent);}
// G3: out-of-rule discount, primary call fine, the reply-author call FAILS at the provider → the open commercial request keeps the
// commercial-review label; the owner is not told it is «not a business matter».
{const u=await start("IRAN");const msg="برای 1000 عدد انگشتر کوچک 3 تکه ۲۰٪ تخفیف میدید؟ (G3)";
 const prim=DA("تخفیف ۲۰٪ برای این سفارش تأیید نشده؛\n{{COMMERCIAL}}","negotiate",{mode:"quote",interp:{product_key:PK.IRAN,quantity:1000},requests:["price","discount"],qrole:"order_count"});
 const x=await turn(u,msg,ctx=>{if(ctx?.authoring)throw new Error("simulated provider outage (author call)");return prim(ctx);});
 const cases=open(u);
 ok("G3 no 20% granted",!x.sent.some(grants20),x.sent);
 ok("G3 owner case open for the commercial request",cases.length===1,cases);
 ok("G3 case is not labelled as a provider-only failure",cases.length===1&&cases[0].unresolved_question!=="ai_provider_unavailable",cases);
 ok("G3 owner alert does not say «not a business matter»",!x.owner.some(t=>/کمبود اطلاعات تجاری نیست/.test(t)),x.owner);
 ok("G3 the provider failure is still recorded in the decision",x.r.brain?.ai_brain?.provider_failure?.stage==="reply_author",x.r.brain?.ai_brain?.provider_failure);
 provenance("G3",x);}
process.exitCode=done()?1:0;
