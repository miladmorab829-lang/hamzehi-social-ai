// PHASE 34 — final owner rules (2026-11-09).
// (1) Iran and Iraq: no extra charge for design or cliché (Teach Knowledge, per market). (2) A question about tax or any extra charge
// on the listed boxes / sizes is answered «نه.» (Persian) / «لا.» (Arabic) — nothing more; shipping, custom products, a message that
// also gives quantities, and an opted-out customer keep their own path. (3) Claude never states free shipping in other words either.
// Prices, discount (10% from 1000 per size) and AI-FIRST conversation stay as they are. Synthetic rows; Claude is mocked (no paid call).
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase34_owner_rules");
const T="2026-10-01T00:00:00.000Z";
const L=`INSERT INTO commercial_price_items(id,product_key,product_name,sku,market,currency,unit_price_minor,moq,version,active,effective_from,effective_until,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
const IRAN_FACT="هزینه چاپ، طراحی و ساخت کلیشه رایگان است.",ARAB_FACT="الطباعة القياسية والتصميم وصنع الكليشة مشمولة بسعر العلبة بدون كلفة إضافية.";
const fact=(market,value)=>({market,records:[{operation:"ADD",kind:"capability",typed:null,entity:{type:"business",key:"global"},concept:"included_services",value,keywords:[],labels:{},conditions:[],effect:null,relation:null}]});
const seed=async W=>{await W.call("/api/quotes",null,"GET");await W.call("/api/si/knowledge/product",null,"GET");
  let n=0;for(const [c,p] of [["2 تکه",63000],["3 تکه",72000]])W.dbrun(L,["R"+(++n),"k"+n,`انگشتر کوچک · 5x5 · ${c}`,null,"IRAN","TOMAN",p,null,1,1,null,null,"admin",T,T,T]);
  W.dbrun(L,["A1","a1","علبة خاتم صغيرة · 5x5x4 · قطعتين",null,"ARAB","USD",53,null,1,1,null,null,"admin",T,T,T]);
  W.dbrun(`INSERT INTO business_settings(id,setting_key,scope_key,value_json,version,status,approved_by,approved_at,created_at) VALUES('d1','discount_rule','market:IRAN','{"type":"percent_bp","value":1000,"min_quantity":1000}',1,'current','owner',?,?)`,[T,T]);
  for(const f of [fact("IRAN",IRAN_FACT),fact("ARAB",ARAB_FACT)]){await W.call("/api/sales-knowledge/teach",f);for(const x of W.q("SELECT id FROM sales_knowledge_change_requests WHERE status NOT IN ('applied','rejected')"))await W.approveK(x.id);}};
const num=t=>String(t||"").replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[٬,]/g,"");
let uid=794000000;const user=async(W,mk)=>{const u={id:++uid,name:"O",username:"o"+uid};await W.send(u,mk==="iran"?"سلام":"هلا");W.setMarket(u,mk);return u;};
// ===== deterministic engine
const W=await makeWorld({aiBrain:"off",extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test"}});await seed(W);
const ask=async(mk,text)=>{const u=await user(W,mk);const r=await W.send(u,text);return {r,t:r.draft?.message||""};};
ok("K0 knowledge seeded through the real teach path: one active fact per market",W.q("SELECT COUNT(*) n FROM sales_knowledge_facts WHERE attribute='included_services' AND status='active'")[0].n===2);
for(const q of ["مالیات داره؟","هزینه اضافه هم داره؟","هزینه دیگه‌ای هم هست؟","تکس داره؟"]){const a=await ask("iran",q);ok(`E1 «${q}» → exactly «نه.»`,a.t==="نه."&&a.r.action==="answer_extra_cost",[a.r.action,a.t]);}
for(const q of ["اكو ضريبة؟","في كلفة إضافية؟","اكو رسوم اضافية؟"]){const a=await ask("iraq",q);ok(`E2 «${q}» → exactly «لا.»`,a.t==="لا."&&a.r.action==="answer_extra_cost",[a.r.action,a.t]);}
for(const [mk,q] of [["iran","هزینه ارسال چقدره؟"],["iran","برای جعبه سفارشی هزینه اضافه داره؟"],["iraq","الشحن عليه رسوم اضافية؟"]]){const a=await ask(mk,q);ok(`E3 «${q}» is not this question (own path, not «نه/لا»)`,a.t!=="نه."&&a.t!=="لا."&&a.r.action!=="answer_extra_cost",[a.r.action,a.t.slice(0,100)]);}
for(const [mk,q] of [["iran","هزینه چقدره دیگه"],["iran","هزینه رنگ دیگه چقدره"],["iran","قیمت چنده؟ مالیات داره؟"],["iran","هزینه دیگه‌ای برای ارسال هست؟"],["iraq","بكم السعر؟ اكو ضريبة؟"]]){const a=await ask(mk,q);
  ok(`E3b «${q}» (filler «دیگه» / price question / shipping) is not answered «نه/لا»`,a.r.action!=="answer_extra_cost"&&a.t!=="نه."&&a.t!=="لا.",[a.r.action,a.t.slice(0,100)]);}
{const a=await ask("iran","قیمت انگشتر کوچک 5x5 2 تکه 500 تا چنده؟ مالیات داره؟");ok("E4 a message that also asks a price keeps the price answer (63,000)",/هر عدد\s*63000/.test(num(a.t)),a.t.slice(0,120));}
for(const [q,total] of [[999,62937000],[1000,56700000]]){const a=await ask("iran",`قیمت انگشتر کوچک 5x5 2 تکه برای ${q} عدد چنده؟`);ok(`P${q} ${q} units → ${total}`,num(a.t).includes(String(total)),a.t.slice(0,160));}
// ===== AI-FIRST ON (mocked Claude; what Telegram receives is checked)
const W2=await makeWorld({aiBrain:"on",extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test"}});await seed(W2);const on=await W2.call("/api/sales-ai-first",{mode:"on"},"POST");
ok("O0 AI-FIRST ON",on.body?.setting?.mode==="on");
const INTERP={primary_intent:"other",product_key:null,reference:"none",requested_size:null,requested_color:[],requested_structure:null,requested_printing:null,quantity:null,ambiguity:"none",confidence:"high"};
const out=u=>W2.tg.filter(x=>x.method==="sendMessage"&&String(x.body).includes(String(u.id))).map(x=>JSON.parse(x.body).text);
const say=async(u,msg,reply,requests=[])=>{let ctx=null;W2.AI.script.set(msg,c=>{ctx=c;return {requests,reply,reply_colors:[],interpretation:INTERP,semantics:{mode:'browse',quantity_role:'none',deal_reference:'none',repeat_requested:false},facts:{colors:[],color_parts:[],unknown_colors:[],color_statement:"none",negated_colors:[]}};});
  const k=W2.AI.requests.length,b=out(u).length;const r=await W2.send(u,msg);return {r,sent:out(u).slice(b),called:W2.AI.requests.slice(k).some(x=>x.body?.messages),ctx:ctx?JSON.stringify({...ctx,message:undefined,recent:undefined}):""};};
{const u=await user(W2,"iran");const a=await say(u,"مالیات داره؟","مالیات و هزینه‌های جانبی بسته به سفارش فرق داره، بررسی می‌کنم.");
 ok("E5 AI-FIRST ON, Persian: Telegram receives exactly «نه.» and Claude is not asked for this question",a.sent.length===1&&a.sent[0]==="نه."&&!a.called,[a.sent,a.called]);}
{const u=await user(W2,"iraq");const a=await say(u,"اكو ضريبة لو رسوم اضافية؟","الضريبة تعتمد على الطلب.");
 ok("E6 AI-FIRST ON, Arabic: Telegram receives exactly «لا.»",a.sent.length===1&&a.sent[0]==="لا."&&!a.called,[a.sent,a.called]);}
{const u=await user(W2,"iran");await say(u,"دیگه پیام نده","باشه.");const a=await say(u,"مالیات داره؟","");
 ok("E7 an opted-out customer gets nothing, not even «نه.»",a.sent.length===0,a.sent);}
{const u=await user(W2,"iran");const a=await say(u,"چاپ و طراحی و کلیشه هزینه داره؟","{{INFORMATION}}",['printing']);
 ok("KN1 Iran: the approved fact (printing, design, cliché) is in Claude's context and Claude's reply is sent",a.ctx.includes(IRAN_FACT)&&!a.ctx.includes(ARAB_FACT)&&a.sent.some(s=>s.includes("رایگان")),[a.sent]);}
{const u=await user(W2,"iraq");const a=await say(u,"التصميم والكليشة بفلوس؟","{{INFORMATION}}",['printing']);
 ok("KN2 Iraq: design + cliché fact is in Claude's context (never the Iran fact) and Claude's reply is sent",a.ctx.includes(ARAB_FACT)&&!a.ctx.includes(IRAN_FACT)&&a.sent.some(s=>s.includes("الكليشة")),[a.sent,a.r.action,a.r.brain?.ai_brain?.fallback,a.r.brain?.ai_brain?.repaired,a.r.brain?.validation]);}
for(const [mk,q,rep] of [["iran","ارسال هم رایگانه؟","بله، ارسال هم برای شما کاملاً رایگانه."],["iran","ارسالش چی؟","ارسالش هم رایگانه."],["iran","ارسال؟","رایگان ارسال می‌کنیم."],["iraq","الشحن مجاني؟","نعم الشحن علينا ومجاني."],["iran","free shipping?","Yes, free shipping for you."]]){
  const u=await user(W2,mk);const a=await say(u,q,rep,["shipping"]);ok(`K4 Claude's «${rep}» never reaches Telegram; the customer still gets the safe reply`,!a.sent.some(s=>s.includes(rep))&&a.sent.length===1&&a.sent[0].trim().length>0,a.sent);}
{const u=await user(W2,"iran");const rep="مشکی سلفون کلاسیک‌تر و رسمی‌تره، سرمه‌ای سلفون آرام‌تر و خاص‌تر.";const a=await say(u,"مشکی سلفون بهتره یا سرمه‌ای سلفون؟",rep);
 ok("N1 Claude's natural answer on everything else is still sent exactly",a.sent.length===1&&a.sent[0]===rep&&a.called,[a.sent,a.called]);}
process.exit(done()?1:0);
