// PHASE 23.1 — the owner-approved MOQ and discount policy: exact boundaries, per-size counting, model precedence, unverified labels,
// owner escalation of exceptions, and proof that no price changes. Real product names and prices are copied as fixtures.
// Local only: Telegram and the AI model are in-process mocks; nothing reaches Production or a customer.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase23_1");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=path.join(REPO,"worker/src");
const P=await import(pathToFileURL(path.join(SRC,"commercial-policy.js")).href);
const IR=(product,configuration,quantity,size="5x5",unit=66000)=>({market:"IRAN",product,size,configuration,quantity,unit_price_minor:unit,currency:"TOMAN"});
const IQ=(product,configuration,quantity,size="5x5x5",unit=60)=>({market:"ARAB",product,size,configuration,quantity,unit_price_minor:unit,currency:"USD"});
const IRAN_RULE=P.commercialDefaultDiscount("IRAN"),ARAB_RULE={type:"percent_bp",value:1000,min_quantity:1001,id:"s-arab",version:1};
const one=(line,rule=null)=>P.evaluateOrderLines([line],{discountRule:rule})[0];

// ---- MOQ boundaries
{const s=q=>one(IR("انگشتر کوچک","3 تکه",q)).status;
 ok("M1 Iran standard size: 299 is under MOQ, 300 is priced",s(299)==="under_moq"&&s(300)==="priced",[s(299),s(300)]);
 for(const [name,cfg] of [["نیم سرویس","2 تکه"],["نیم سرویس","3 تکه کج"],["نیم‌سرویس","3 تکه"],["سرویس","3 تکه"],["سرویس 20x20","2 تکه"]]){const t=q=>one(IR(name,cfg,q)).status;
  ok(`M2 Iran ${name}: 99 is under MOQ, 100 is priced`,t(99)==="under_moq"&&t(100)==="priced",[t(99),t(100)]);}
 for(const name of ["نیم ست کوچک","نیم ست بزرگ","نیم ست مربع"]){const t=q=>one(IR(name,"3 تکه",q));
  ok(`M2b ${name} is not half-service: standard, 100 and 299 under MOQ, 300 priced`,t(100).status==="under_moq"&&t(299).status==="under_moq"&&t(300).status==="priced"&&t(300).moq===300&&t(300).moq_rule==="standard",[t(100),t(300)]);}
 for(const name of ["انگشتر کوچک","آویز","نیم ست کوچک","نیم ست بزرگ","نیم ست مربع","سرویس 20x20","سرویس","نیم سرویس"]){const t=q=>one(IR(name,"کشویی بگ‌دار",q));
  ok(`M3 Iran bag drawer on ${name}: 499 under, 500 priced, rule bag_drawer overrides the size class`,t(499).status==="under_moq"&&t(500).status==="priced"&&t(500).moq===500&&t(500).moq_rule==="bag_drawer",[t(499).status,t(500)]);}
 const a=q=>one(IQ("علبة خاتم صغيرة","ثلاث قطع",q)).status;
 ok("M4 Iraq standard: 499 is under MOQ, 500 is priced",a(499)==="under_moq"&&a(500)==="priced",[a(499),a(500)]);
 ok("M5 Iraq bag model keeps the Iraq standard: no Iran rule crosses the market",one(IQ("علبة نصف طقم صغيرة","جرّارة مع كيس",500,"9x7x5")).moq===500&&one(IQ("علبة نصف طقم صغيرة","جرّارة مع كيس",500,"9x7x5")).moq_rule==="standard");
 ok("M6 Iraq half-set has no Iran half-set exception (100 is under MOQ)",one(IQ("علبة نصف طقم صغيرة","قطعتين",100,"9x7x5")).status==="under_moq");
 ok("M7 an explicit MOQ on the approved price row wins",one({...IR("انگشتر کوچک","3 تکه",150),row_moq:150}).status==="priced");}

// ---- discounts
{const i=q=>one(IR("انگشتر کوچک","3 تکه",q),IRAN_RULE);
 ok("D1 Iran: 999 has no discount, 1000 has exactly 10%",i(999).discount===null&&i(1000).discount?.amount_minor===6600000&&i(1000).total_minor===59400000,[i(999).discount,i(1000).total_minor]);
 ok("D2 the Iran breakdown adds up: quantity x unit = subtotal, subtotal - discount = total",(l=>l.quantity*l.unit_price_minor===l.subtotal_minor&&l.subtotal_minor-l.discount.amount_minor===l.total_minor)(i(1250)));
 const a=q=>one(IQ("علبة خاتم صغيرة","ثلاث قطع",q),ARAB_RULE);
 ok("D3 Iraq: 1000 has no discount, 1001 has 10% in cents",a(1000).discount===null&&a(1001).discount?.amount_minor===6006&&a(1001).total_minor===54054,[a(1000).discount,a(1001).discount]);
 ok("D4 no default rule exists for Iraq: its rule stays the approved setting",P.commercialDefaultDiscount("ARAB")===null);
 const l=one(IR("انگشتر کوچک","3 تکه",2000),IRAN_RULE);
 ok("D5 one discount only: a line is reduced once, by one rule",l.discount.amount_minor===l.subtotal_minor/10&&l.total_minor===l.subtotal_minor*0.9);}

// ---- per size, never across sizes
{const two=(a,b)=>P.evaluateOrderLines([a,b],{discountRule:IRAN_RULE});
 const d=two(IR("انگشتر کوچک","3 تکه",200,"5x5"),IR("انگشتر بزرگ","3 تکه",200,"6x6",72600));
 ok("S1 MOQ: 200 + 200 in two sizes is not 400; both stay under MOQ",d.every(x=>x.status==="under_moq"),d.map(x=>x.status));
 const e=two(IR("انگشتر کوچک","3 تکه",600,"5x5"),IR("انگشتر بزرگ","3 تکه",600,"6x6",72600));
 ok("S2 discount: 600 + 600 in two sizes gets no discount",e.every(x=>x.status==="priced"&&x.discount===null),e.map(x=>x.discount));
 const f=two(IR("انگشتر کوچک","3 تکه",600,"5x5"),IR("انگشتر کوچک","3 تکه کج",400,"5x5"));
 ok("S3 the same size counts together: 600 + 400 reaches 1,000 and each line gets 10%",f.every(x=>x.discount?.value===1000&&x.size_quantity===1000),f.map(x=>x.size_quantity));
 const g=two(IR("انگشتر کوچک","3 تکه",300,null),IR("انگشتر بزرگ","3 تکه",800,null,72600));
 ok("S4 lines with no known size are never added together",g.every(x=>x.discount===null),g.map(x=>x.size_quantity));
 const h=two(IR("نیم ست کوچک","کشویی بگ‌دار",200,"7x9"),IR("نیم ست کوچک","3 تکه",400,"7x9"));
 ok("S5 a bag drawer counts apart for its own MOQ: 200 bag + 400 other leaves the bag line under 500",h[0].status==="under_moq"&&h[1].status==="priced",h.map(x=>x.status));}

// ---- identity
{const r=(c,n="نیم ست کوچک")=>one(IR(n,c,1000));
 for(const label of ["کشویی یک‌دار","کشویی یکدار","کشویی بازدار","کشویی بازدار "])ok(`I1 «${label}» goes to the owner and is mapped to nothing`,r(label).status==="owner_review"&&r(label).review_reason==="model_identity_unverified"&&r(label).moq===null,r(label));
 ok("I2 a price-row MOQ does not make an unverified label acceptable",one({...IR("نیم ست کوچک","کشویی یک‌دار",1000),row_moq:100}).status==="owner_review");
 for(const label of ["بگ‌دار","بگدار کشویی","کشویی کیف","جرّارة مع كيس"])ok(`I3 near-miss «${label}» is not a bag drawer (no 500 rule; owner review)`,r(label).status==="owner_review"&&r(label).moq_rule!=="bag_drawer",r(label));
 ok("I4 a bag drawer spelled with or without the joiner is the same verified identifier",r("کشویی بگ‌دار").moq_rule==="bag_drawer"&&r("کشویی بگدار").moq_rule==="bag_drawer");
 ok("I5 an unknown product goes to the owner, in both markets",one(IR("جعبه ساعت لوکس","3 تکه",1000)).status==="owner_review"&&one(IQ("علبة عطور","ثلاث قطع",1000)).review_reason==="model_unknown");
 ok("I6 an unknown model of a known product goes to the owner",r("کشویی طلایی").review_reason==="model_unknown");
 ok("I7 no configuration known: the bag rule cannot be ruled out, so the owner reviews",one(IR("نیم ست کوچک",null,1000)).status==="owner_review");
 ok("I8 نیم ست and نیم سرویس are never equated: each keeps its own rule, and a partial name is unknown",one(IR("نیم سرویس","3 تکه",100)).moq_rule==="half_service"&&one(IR("نیم ست کوچک","3 تکه",300)).moq_rule==="standard"&&one(IR("نیم ست","3 تکه",300)).status==="owner_review");
 ok("I9 market not known: never a rule",one({...IR("انگشتر کوچک","3 تکه",500),market:"TURKEY"}).status!=="priced");}

// ---- currency
{ok("C1 TOMAN on an Iraq line and USD on an Iran line are refused, never converted",one({...IQ("علبة خاتم صغيرة","ثلاث قطع",600),currency:"TOMAN"}).status==="currency_conflict"&&one({...IR("انگشتر کوچک","3 تکه",400),currency:"USD"}).status==="currency_conflict");
}

// ---- real path
const W=await makeWorld({aiBrain:"off",extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test"}});const {q,dbrun,call,send,setMarket}=W;
await call("/api/quotes",null,"GET");await call("/api/si/knowledge/product",null,"GET");
const T="2026-10-01T00:00:00.000Z",LIST=`INSERT INTO commercial_price_items(id,product_key,product_name,sku,market,currency,unit_price_minor,moq,version,active,effective_from,effective_until,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
const ROWS=[["انگشتر کوچک · 5x5 · 3 تکه","IRAN","TOMAN",66000],["انگشتر کوچک · 5x5 · کشویی کج","IRAN","TOMAN",72600],
 ["نیم ست کوچک · 7x9 · 2 تکه","IRAN","TOMAN",74800],["نیم ست کوچک · 7x9 · 3 تکه","IRAN","TOMAN",80300],["نیم ست کوچک · 7x9 · کشویی بگ‌دار","IRAN","TOMAN",110000],["نیم ست کوچک · 7x9 · کشویی یک‌دار","IRAN","TOMAN",121000],["نیم ست کوچک · 7x9 · کشویی بازدار","IRAN","TOMAN",99000],["نیم ست کوچک · 7x9 · کشویی روبان‌دار","IRAN","TOMAN",99000],
 ["سرویس 20x20 · 20x20 · 3 تکه","IRAN","TOMAN",143000],["نیم سرویس · 13x16 · 3 تکه","IRAN","TOMAN",121000],["نیم سرویس · 13x16 · کشویی بگ‌دار","IRAN","TOMAN",181500],["جعبه عطر · 9x9 · 3 تکه","IRAN","TOMAN",50000],
 ["علبة خاتم صغيرة · 5x5x5 · ثلاث قطع","ARAB","USD",60],["علبة خاتم صغيرة · 5x5x5 · قطعتين","ARAB","USD",53]];
ROWS.forEach(([name,market,cur,price],i)=>dbrun(LIST,["R"+i,"k"+i,name,null,market,cur,price,null,1,1,null,null,"admin",T,T,T]));
dbrun("INSERT INTO business_settings(id,setting_key,scope_key,value_json,version,status,approved_by,approved_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)",["ds","discount_rule","market:ARAB",JSON.stringify({type:"percent_bp",value:1000,min_quantity:1001}),1,"current","owner",T,T]);
const prices=()=>JSON.stringify(q("SELECT id,product_name,currency,unit_price_minor,moq,version,active,updated_at FROM commercial_price_items ORDER BY id"));
const before=prices();let uid=723100000;
const customer=async country=>{const u={id:++uid,name:"Test",username:"p23_"+uid};await send(u,country==="iraq"?"هلا":"سلام");setMarket(u,country);return u;};
const esc=u=>q("SELECT e.reason_code,e.status,e.lead_id FROM owner_escalations e JOIN leads l ON l.id=e.lead_id WHERE l.notes LIKE ? OR e.lead_id IN (SELECT lead_id FROM inbox_messages WHERE provider_sender_id=?)",["%"+u.id+"%",String(u.id)]);
const msg=r=>r.draft?.message||"";
const orderCount=u=>q("SELECT COUNT(*) n FROM lead_orders WHERE lead_id IN (SELECT lead_id FROM inbox_messages WHERE provider_sender_id=?)",[String(u.id)])[0].n;

{const u=await customer("iran"),r=await send(u,"قیمت انگشتر کوچک 3 تکه برای 299 عدد چنده؟");
 ok("E1 Iran 299 standard: not refused, owner escalation, no price total, minimum and requested quantity stated",r.action==="moq_owner"&&/۳۰۰|300/.test(msg(r))&&/۲۹۹|299/.test(msg(r))&&!/۶۶|66[,٬]?000/.test(msg(r)),{a:r.action,m:msg(r)});
 ok("E2 and the exception is recorded for the owner as an MOQ case",esc(u).some(e=>e.reason_code==="unclear_moq"),esc(u));
 const u2=await customer("iran"),r2=await send(u2,"قیمت انگشتر کوچک 3 تکه برای 300 عدد چنده؟");
 ok("E3 Iran 300 standard: priced from the approved row",r2.action==="answer_price"&&/19[,٬]?800[,٬]?000|۱۹[,٬]?۸۰۰[,٬]?۰۰۰/.test(msg(r2)),{a:r2.action,m:msg(r2)});
 const u3=await customer("iran"),r3=await send(u3,"قیمت نیم ست کوچک 2 تکه برای 300 عدد چنده؟");
 ok("E4 نیم ست کوچک at 300 is priced at the live 74,800, unchanged",r3.action==="answer_price"&&/74[,٬]?800|۷۴[,٬]?۸۰۰/.test(msg(r3)),{a:r3.action,m:msg(r3)});
 const u4=await customer("iran"),r4=await send(u4,"قیمت نیم ست کوچک کشویی بگ‌دار برای 499 عدد چنده؟");
 ok("E5 bag drawer at 499 goes to the owner and the reply states 500",r4.action==="moq_owner"&&/۵۰۰|500/.test(msg(r4)),{a:r4.action,m:msg(r4)});
 const u5=await customer("iran"),r5=await send(u5,"قیمت نیم ست کوچک کشویی بگ‌دار برای 500 عدد چنده؟");
 ok("E6 bag drawer at 500 is priced at the live 110,000",r5.action==="answer_price"&&/110[,٬]?000|۱۱۰[,٬]?۰۰۰/.test(msg(r5)),{a:r5.action,m:msg(r5)});}

{const u=await customer("iran"),r=await send(u,"قیمت انگشتر کوچک 3 تکه برای 1000 عدد چنده؟"),m=msg(r);
 ok("B1 Iran 1000: the reply shows quantity, unit, subtotal, 10% discount and final total",r.action==="answer_price"&&[/1[,٬]?000|۱[,٬]?۰۰۰/,/66[,٬]?000|۶۶[,٬]?۰۰۰/,/66[,٬]?000[,٬]?000|۶۶[,٬]?۰۰۰[,٬]?۰۰۰/,/6[,٬]?600[,٬]?000|۶[,٬]?۶۰۰[,٬]?۰۰۰/,/59[,٬]?400[,٬]?000|۵۹[,٬]?۴۰۰[,٬]?۰۰۰/].every(x=>x.test(m)),{a:r.action,m});
 ok("B2 no USD in an Iran reply",!/USD|دولار|دلار|\$/.test(m),m);
 const u2=await customer("iran"),m2=msg(await send(u2,"قیمت انگشتر کوچک 3 تکه برای 999 عدد چنده؟"));
 ok("B3 Iran 999: priced in full, no discount in the reply",/65[,٬]?934[,٬]?000|۶۵[,٬]?۹۳۴[,٬]?۰۰۰/.test(m2)&&!/تخفیف/.test(m2),m2);
 const u3=await customer("iraq"),a=await send(u3,"بكم علبة خاتم صغيرة ثلاث قطع؟ أريد 1000"),am=msg(a);
 ok("B4 Iraq 1000: priced, no discount",a.action==="answer_price"&&!/خصم/.test(am)&&/600\.00/.test(am),{a:a.action,m:am});
 const u4=await customer("iraq"),b=await send(u4,"بكم علبة خاتم صغيرة ثلاث قطع؟ أريد 1001"),bm=msg(b);
 ok("B5 Iraq 1001: the existing 10% applies, with the breakdown, in USD",b.action==="answer_price"&&/خصم/.test(bm)&&/540\.54/.test(bm)&&/600\.60/.test(bm),{a:b.action,m:bm});
 ok("B6 no TOMAN in an Iraq reply",!/تومان|TOMAN/.test(am+bm),am+bm);}

{const u=await customer("iraq"),r=await send(u,"بكم علبة خاتم صغيرة ثلاث قطع؟ أريد 200"),m=msg(r);
 ok("Q1 Iraq 200: not refused, polite Iraqi Arabic, owner review promised",r.action==="moq_owner"&&/500/.test(m)&&/200/.test(m)&&/الإدارة/.test(m)&&!/ما نقدر|مرفوض|لا يمكن/.test(m),{a:r.action,m});
 ok("Q2 the exception reaches the owner; nothing is offered",esc(u).some(e=>e.reason_code==="unclear_moq"),esc(u));
 const again=await send(u,"بكم علبة خاتم صغيرة ثلاث قطع؟ أريد 200");
 ok("Q3 asked again: one open escalation, no second one, no reduced MOQ granted",esc(u).filter(e=>e.reason_code==="unclear_moq").length===1&&/500/.test(msg(again))&&/الإدارة/.test(msg(again))&&!/المبلغ النهائي|المجموع/.test(msg(again)),{e:esc(u),m:msg(again),a:again.action});
 const other=await customer("iraq");
 ok("Q4 another customer has no escalation from this one",esc(u).length>0&&esc(other).length===0,esc(other));
 const v=await customer("iraq");await send(v,"بكم علبة خاتم صغيرة ثلاث قطع؟");const w=await send(v,"الكمية هواية");
 ok("Q5 a customer who finds the quantity too high is asked the quantity, not refused",/شكد العدد/.test(msg(w))&&!/ما نقدر|مرفوض|لا يمكن/.test(msg(w)),{a:w.action,m:msg(w)});
 const x=await customer("iraq"),y=await send(x,"بكم علبة خاتم صغيرة ثلاث قطع؟ ممكن أقل من 500؟");
 ok("Q6 «أقل من 500» is never read as an order of 500: no total, and the customer is asked how many",!/المجموع|المبلغ النهائي/.test(msg(y))&&/شكد العدد/.test(msg(y)),{a:y.action,m:msg(y)});
 const y2=await customer("iraq"),z=await send(y2,"بكم علبة خاتم صغيرة ثلاث قطع؟ أريد أقل من 500 قطعة");await send(y2,"سجلها");
 ok("Q7 «أقل من 500 قطعة» with a unit makes no offer, and «سجلها» orders nothing",!/المجموع|المبلغ النهائي/.test(msg(z))&&orderCount(y2)===0,{a:z.action,m:msg(z)});
 const y3=await customer("iran"),z3=await send(y3,"قیمت انگشتر کوچک 3 تکه برای کمتر از 300 عدد چنده؟");
 ok("Q8 Persian «کمتر از 300 عدد» is treated the same",!/جمعش|مبلغ نهایی/.test(msg(z3))&&/چند عدد/.test(msg(z3)),{a:z3.action,m:msg(z3)});
 const y4=await customer("iran");await send(y4,"قیمت انگشتر کوچک 3 تکه برای 1000 عدد چنده؟");const z4=await send(y4,"کمتر از 300 عدد میشه؟");
 ok("Q9 an earlier 1000 is not reused when the customer now says less than 300",!/مبلغ نهایی|جمعش/.test(msg(z4)),{a:z4.action,m:msg(z4)});
 const n1=await customer("iraq");await send(n1,"بكم علبة خاتم صغيرة ثلاث قطع؟");const n2=await send(n1,"200 قطعة");
 ok("Q10 a turn that only states 200 still goes to the owner",n2.action==="moq_owner"&&esc(n1).some(e=>e.reason_code==="unclear_moq"),{a:n2.action,e:esc(n1)});
 const c1=await customer("iraq");await send(c1,"بكم علبة خاتم صغيرة ثلاث قطع؟ أريد 200");const c2=await send(c1,"بكم علبة خاتم صغيرة ثلاث قطع؟ أريد 100");
 ok("Q11 a changed quantity is a new question for the owner and states the new number",esc(c1).filter(e=>e.reason_code==="unclear_moq").length===2&&/100/.test(msg(c2)),{e:esc(c1),m:msg(c2)});
 const d1=await customer("iran");await send(d1,"قیمت انگشتر کوچک 3 تکه برای 200 عدد چنده؟");const d2=await send(d1,"قیمت نیم ست کوچک کشویی بگ‌دار برای 200 عدد چنده؟");
 ok("Q12 another product below MOQ in the same conversation is its own owner case",esc(d1).filter(e=>e.reason_code==="unclear_moq").length===2&&/۵۰۰|500/.test(msg(d2)),{e:esc(d1),m:msg(d2)});
 const i1=await customer("iraq"),l1=await send(i1,"بكم علبة خاتم صغيرة ثلاث قطع؟ أريد 499"),i2=await customer("iraq"),l2=await send(i2,"بكم علبة خاتم صغيرة ثلاث قطع؟ أريد 500");
 ok("Q13 Iraq on the real path: 499 to the owner, 500 priced at the live 0.60",l1.action==="moq_owner"&&l2.action==="answer_price"&&/300\.00/.test(msg(l2)),{a:[l1.action,l2.action],m:msg(l2)});}

{const u=await customer("iran"),r=await send(u,"قیمت نیم ست کوچک کشویی یک‌دار برای 1000 عدد چنده؟");
 ok("H1 a customer naming «یک‌دار» gets no price and the owner reviews it",r.action==="price_owner"&&!/121|۱۲۱/.test(msg(r))&&esc(u).length>=1,{a:r.action,m:msg(r),e:esc(u)});
 const u2=await customer("iran"),r2=await send(u2,"قیمت نیم ست کوچک کشویی بازدار برای 1000 عدد چنده؟");
 ok("H2 «بازدار» likewise, never priced as ribbon or bag drawer",r2.action==="price_owner"&&esc(u2).length>=1&&!/99[,٬]?000|۹۹[,٬]?۰۰۰/.test(msg(r2)),{a:r2.action,m:msg(r2)});
 const u4=await customer("iran"),r4=await send(u4,"قیمت جعبه عطر 3 تکه برای 1000 عدد چنده؟");
 ok("H4 an unknown product name on the real path goes to the owner with no price",r4.action==="price_owner"&&esc(u4).length>=1&&!/50[,٬]?000|۵۰[,٬]?۰۰۰/.test(msg(r4)),{a:r4.action,m:msg(r4)});
 const u3=await customer("iran"),r3=await send(u3,"قیمت نیم ست کوچک چنده؟");
 ok("H3 the model question never offers «یک‌دار» or «بازدار»",/مدل/.test(msg(r3))&&!/یک‌دار|بازدار/.test(msg(r3))&&/بگ‌دار/.test(msg(r3)),{a:r3.action,m:msg(r3)});}

{const u=await customer("iran");await send(u,"قیمت انگشتر کوچک 3 تکه برای 1000 عدد چنده؟");const acc=await send(u,"ثبتش کن");
 const orders=q("SELECT status,total_minor,currency,confirmed_by FROM lead_orders WHERE lead_id IN (SELECT lead_id FROM inbox_messages WHERE provider_sender_id=?)",[String(u.id)]);
 ok("A1 acceptance creates one order candidate, never a confirmed order",orders.length===1&&orders[0].status==="order_candidate"&&!orders[0].confirmed_by,orders);
 ok("A2 it keeps the discounted total once (no second discount) in TOMAN",orders[0]?.total_minor===59400000&&orders[0]?.currency==="TOMAN",orders);
 await send(u,"ثبتش کن");
 ok("A3 accepting again adds no duplicate candidate",q("SELECT COUNT(*) n FROM lead_orders WHERE lead_id IN (SELECT lead_id FROM inbox_messages WHERE provider_sender_id=?)",[String(u.id)])[0].n===1);
 const d=q("SELECT known_json,status FROM owner_decisions WHERE decision_type='ORDER_CANDIDATE_APPROVAL' AND lead_id IN (SELECT lead_id FROM inbox_messages WHERE provider_sender_id=?)",[String(u.id)]);
 const b=JSON.parse(d[0]?.known_json||"{}").price_breakdown||{};
 ok("A4 the owner's decision is pending and shows quantity, unit, subtotal, discount and total",d[0]?.status==="PENDING"&&b.quantity===1000&&b.unit_price_minor===66000&&b.subtotal_minor===66000000&&b.discount_minor===6600000&&b.total_minor===59400000&&b.currency==="TOMAN",{d:d[0]?.status,b});
 ok("A5 this order stays unconfirmed, with no approved quote and no payment for this customer",orders[0]?.status==="order_candidate"&&!q("SELECT 1 FROM lead_quotes WHERE status IN ('approved','sent') AND lead_id IN (SELECT lead_id FROM inbox_messages WHERE provider_sender_id=?)",[String(u.id)]).length&&!q("SELECT 1 FROM lead_order_payments p JOIN lead_orders o ON o.id=p.order_id WHERE o.lead_id IN (SELECT lead_id FROM inbox_messages WHERE provider_sender_id=?)",[String(u.id)]).length);}

{const b=async(text)=>{const u=await customer("iran");return {u,r:await send(u,text)};};
 const h=await b("قیمت نیم سرویس 3 تکه برای 99 عدد چنده؟"),h0=await b("قیمت نیم سرویس 3 تکه برای 100 عدد چنده؟");
 ok("R1 half-service on the real path: 99 to the owner with MOQ 100, 100 priced at the live 121,000",h.r.action==="moq_owner"&&/۱۰۰|100/.test(msg(h.r))&&esc(h.u).some(e=>e.reason_code==="unclear_moq")&&h0.r.action==="answer_price"&&/121[,٬]?000|۱۲۱[,٬]?۰۰۰/.test(msg(h0.r)),{a:[h.r.action,h0.r.action],m:[msg(h.r),msg(h0.r)]});
 const f9=await b("قیمت سرویس 20x20 3 تکه برای 99 عدد چنده؟"),f0=await b("قیمت سرویس 20x20 3 تکه برای 100 عدد چنده؟");
 ok("R2 full-set on the real path: 99 to the owner, 100 priced at the live 143,000",f9.r.action==="moq_owner"&&f0.r.action==="answer_price"&&/143[,٬]?000|۱۴۳[,٬]?۰۰۰/.test(msg(f0.r)),{a:[f9.r.action,f0.r.action],m:msg(f0.r)});
 const g9=await b("قیمت نیم سرویس کشویی بگ‌دار برای 499 عدد چنده؟"),g0=await b("قیمت نیم سرویس کشویی بگ‌دار برای 500 عدد چنده؟");
 ok("R3 bag drawer on the larger set: 499 to the owner, 500 priced at the live 181,500",g9.r.action==="moq_owner"&&g0.r.action==="answer_price"&&/181[,٬]?500|۱۸۱[,٬]?۵۰۰/.test(msg(g0.r)),{a:[g9.r.action,g0.r.action],m:msg(g0.r)});
 const n1=await b("قیمت نیم ست کوچک 3 تکه برای 100 عدد چنده؟"),n9=await b("قیمت نیم ست کوچک 3 تکه برای 299 عدد چنده؟"),n0=await b("قیمت نیم ست کوچک 3 تکه برای 300 عدد چنده؟");
 ok("R4 نیم ست کوچک on the real path: 100 and 299 go to the owner with no quote, 300 priced",n1.r.action==="moq_owner"&&n9.r.action==="moq_owner"&&esc(n1.u).some(e=>e.reason_code==="unclear_moq")&&!/جمعش|مبلغ نهایی/.test(msg(n1.r)+msg(n9.r))&&/۳۰۰|300/.test(msg(n1.r))&&n0.r.action==="answer_price",{a:[n1.r.action,n9.r.action,n0.r.action],m:msg(n1.r)});
 const two=await b("قیمت انگشتر کوچک 3 تکه 200 عدد و نیم ست کوچک 3 تکه 200 عدد چنده؟");
 ok("R5 two sizes in one message are never added up: no 400 anywhere",!/400|۴۰۰/.test(msg(two.r)),{a:two.r.action,m:msg(two.r)});
 const dq=await customer("iran");await send(dq,"قیمت انگشتر کوچک 3 تکه برای 500 عدد چنده؟");const dr=await send(dq,"تخفیف دارید؟");
 ok("R6 the Iran discount answer says from 1,000 of one size",/از یک سایز/.test(msg(dr))&&/۱[,٬]?۰۰۰|1[,٬]?000/.test(msg(dr)),{a:dr.action,m:msg(dr)});}

{const V=["2 تکه","3 تکه","3 تکه کج","کشویی کج","کشویی روبان‌دار"],BAG="کشویی بگ‌دار",want={"انگشتر کوچک":300,"انگشتر بزرگ":300,"آویز":300,"دستبند کشیده":300,"ساعتی بالشت‌دار":300,"نیم ست کوچک":300,"نیم ست بزرگ":300,"نیم ست مربع":300,"نیم سرویس":100,"سرویس":100,"سرویس 20x20":100};
 const bad=[];for(const [n,m] of Object.entries(want)){for(const c of V){const r=P.moqPolicy({market:"IRAN",product:n,configuration:c});if(r.moq!==m)bad.push([n,c,r.moq]);}const r=P.moqPolicy({market:"IRAN",product:n,configuration:BAG});if(r.moq!==500||r.rule!=="bag_drawer")bad.push([n,BAG,r.moq]);}
 ok("Z0 every live Iran name maps to its exact MOQ, and the bag drawer is 500 on all eleven",!bad.length,bad);
 ok("Z1 no customer conversation changed any price row",prices()===before);
 ok("Z2 nothing was added to the catalog",q("SELECT COUNT(*) n FROM product_catalog")[0].n===0&&q("SELECT COUNT(*) n FROM price_versions")[0].n===0);
 const src=fs.readFileSync(path.join(SRC,"commercial-policy.js"),"utf8");
 ok("Z3 the policy module has no database, network or customer-send call",!/\.prepare\(|env\.DB|fetch\(|sendMessage/.test(src));
 ok("Z4 no request left the machine except the in-process mocks",!W.offNet().length,W.offNet());}
// ---- the Sales AI on, as in Production: the scripted model misbehaves on purpose
{const A=await makeWorld({aiBrain:"on",extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test"}});
 await A.call("/api/quotes",null,"GET");await A.call("/api/si/knowledge/product",null,"GET");
 ROWS.forEach(([name,market,cur,price],i)=>A.dbrun(LIST,["R"+i,"k"+i,name,null,market,cur,price,null,1,1,null,null,"admin",T,T,T]));
 let id=723900000;const cust=async c=>{const u={id:++id,name:"Test",username:"p23a_"+id};await A.send(u,c==="iraq"?"هلا":"سلام");A.setMarket(u,c);return u;};
 const orders=u=>A.q("SELECT COUNT(*) n FROM lead_orders WHERE lead_id IN (SELECT lead_id FROM inbox_messages WHERE provider_sender_id=?)",[String(u.id)])[0].n;
 const m1="بكم علبة خاتم صغيرة ثلاث قطع؟ أريد 200";
 A.AI.script.set(m1,()=>({requests:["price"],reply:"تمام، نوافق على 200 قطعة والمجموع 120 دولار",facts:{product:"علبة خاتم صغيرة",quantity:200}}));
 const u=await cust("iraq"),r=await A.send(u,m1),t=r.draft?.message||"";
 ok("AI1 a model that grants 200 is ignored: the fixed below-MOQ reply goes out and no total is stated",/500/.test(t)&&/الإدارة/.test(t)&&!/120|نوافق/.test(t),{a:r.action,t});
 const m2="بكم علبة خاتم صغيرة ثلاث قطع؟ أريد أقل من 500 قطعة";
 A.AI.script.set(m2,()=>({requests:["price"],reply:"تمام {{COMMERCIAL}}",facts:{product:"علبة خاتم صغيرة",quantity:500}}));
 const v=await cust("iraq"),r2=await A.send(v,m2),t2=r2.draft?.message||"";await A.send(v,"سجلها");
 ok("AI2 a model that reads «أقل من 500» as 500 is refused: no total, nothing ordered",!/المجموع|300\.00/.test(t2)&&orders(v)===0,{a:r2.action,t:t2});
 const m3="قیمت نیم ست کوچک کشویی یک‌دار برای 1000 عدد چنده؟";
 A.AI.script.set(m3,()=>({requests:["price"],reply:"هر عدد ۱۲۱٬۰۰۰ تومان است",facts:{product:"نیم ست کوچک",quantity:1000}}));
 const w=await cust("iran"),r3=await A.send(w,m3),t3=r3.draft?.message||"";
 ok("AI3 a model that quotes «یک‌دار» is not sent to the customer",!/121|۱۲۱/.test(t3),{a:r3.action,t:t3});
 ok("AI4 no request left the machine except the in-process mocks",!A.offNet().length,A.offNet());}
done();
