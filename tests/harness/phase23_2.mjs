// Phase 23 — final-quote safety, on the real automatic-send path. A total or a discounted offer never reaches the customer until the
// owner releases it; ordinary replies still go out by themselves. Local only: Telegram and the AI are mocks.
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase23_2");
const W=await makeWorld({aiBrain:"off",extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test"}});const {q,dbrun,call,send,setMarket,tg,post,releaseDraft,transition}=W;
await call("/api/quotes",null,"GET");await call("/api/si/knowledge/product",null,"GET");
const T="2026-10-01T00:00:00.000Z",L=`INSERT INTO commercial_price_items(id,product_key,product_name,sku,market,currency,unit_price_minor,moq,version,active,effective_from,effective_until,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
dbrun(L,["R1","k1","انگشتر کوچک · 5x5 · 3 تکه",null,"IRAN","TOMAN",66000,null,1,1,null,null,"admin",T,T,T]);
dbrun(L,["A1","a1","علبة خاتم صغيرة · 5x5x4 · ثلاث قطع",null,"ARAB","USD",60,null,1,1,null,null,"admin",T,T,T]);
dbrun("INSERT INTO business_settings(id,setting_key,scope_key,value_json,version,status,approved_by,approved_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)",["ds","discount_rule","market:ARAB",JSON.stringify({type:"percent_bp",value:1000,min_quantity:1001}),1,"current","owner",T,T]);
let id=731000000;const customer=async mk=>{const u={id:++id,name:"T",username:"q"+id};await send(u,"سلام");setMarket(u,mk);return u;};
const out=u=>tg.filter(x=>x.method==="sendMessage"&&String(x.body).includes(String(u.id))).map(x=>{try{return JSON.parse(x.body).text||"";}catch{return String(x.body);}});
const sentAfter=async(u,fn)=>{const b=out(u).length;const r=await fn();return {r,texts:out(u).slice(b)};};
const IR=n=>`قیمت انگشتر کوچک 3 تکه برای ${n} عدد چنده؟`,IQ=n=>`بكم علبة خاتم صغيرة ثلاث قطع؟ أريد ${n}`;
const noMoney=t=>!/[0-9۰-۹٠-٩]/u.test(t);
const held=(x,label,total)=>{ok(label+": prepared with the right total",String(x.r.draft?.message||"").includes(total),x.r.draft?.message);
 ok(label+": held as an owner draft, not approved, not sent",x.r.draft?.status==="draft"&&!x.r.draft?.approved_by&&x.r.draft?.error_detail==="final_quote_owner_approval",{s:x.r.draft?.status,e:x.r.draft?.error_detail});
 ok(label+": the customer gets one neutral acknowledgement with no number",x.texts.length===1&&noMoney(x.texts[0]),x.texts);};
const orders=u=>q("SELECT * FROM lead_orders WHERE lead_id IN (SELECT lead_id FROM inbox_messages WHERE provider_sender_id=?)",[String(u.id)]);
const drafts=u=>q("SELECT id,status,error_detail FROM lead_outreach WHERE error_detail IN ('final_quote_owner_approval','final_quote_superseded') AND lead_id IN (SELECT lead_id FROM inbox_messages WHERE provider_sender_id=?) ORDER BY created_at",[String(u.id)]);

// Thresholds on the send path
{const u=await customer("iran");const x=await sentAfter(u,()=>send(u,IR(999)));held(x,"F1 Iran 999","۶۵٬۹۳۴٬۰۰۰");ok("F1 Iran 999 has no discount",!/تخفیف/.test(x.r.draft?.message),x.r.draft?.message);}
{const u=await customer("iran");const x=await sentAfter(u,()=>send(u,IR(1000)));held(x,"F2 Iran 1000","۵۹٬۴۰۰٬۰۰۰");const m=x.r.draft?.message||"";
 ok("F2 Iran 1000 has one 10% discount and the full breakdown",m.split("۱۰٪").length===2&&m.includes("۶۶٬۰۰۰٬۰۰۰")&&m.includes("۶٬۶۰۰٬۰۰۰"),m);
 ok("F2 the wording never says final",!/نهایی|قطعی/.test(m)&&m.includes("جمع پس از تخفیف"),m);}
{const u=await customer("iraq");const x=await sentAfter(u,()=>send(u,IQ(1000)));held(x,"F3 Iraq 1000","600.00");ok("F3 Iraq 1000 has no discount",!/خصم/.test(x.r.draft?.message),x.r.draft?.message);}
{const u=await customer("iraq");const x=await sentAfter(u,()=>send(u,IQ(1001)));held(x,"F4 Iraq 1001","540.54");const m=x.r.draft?.message||"";
 ok("F4 Iraq 1001 keeps its 10%, once, in USD, and never says final",m.split("10%").length===2&&/دولار/.test(m)&&!/تومان/.test(m)&&!/النهائي/.test(m)&&m.includes("المجموع بعد الخصم"),m);}

// Ordinary replies still go out by themselves
{const u=await customer("iran");
 const a=await sentAfter(u,()=>send(u,"قیمت انگشتر کوچک 3 تکه چنده؟"));
 ok("G1 a unit price with no total still goes out automatically",a.r.draft?.status==="sent"&&a.texts.length===1&&a.texts[0].includes("۶۶٬۰۰۰")&&!/جمع/.test(a.texts[0]),{s:a.r.draft?.status,t:a.texts});
 const b=await sentAfter(u,()=>send(u,"حداقل سفارش چنده؟"));
 ok("G2 an MOQ answer still goes out automatically",b.r.draft?.status==="sent"&&b.texts.length===1,{s:b.r.draft?.status,t:b.texts});}
{const u={id:++id,name:"T",username:"q"+id};const g=await sentAfter(u,()=>send(u,"سلام"));ok("G3 a greeting still goes out automatically",g.r.draft?.status==="sent"&&g.texts.length===1,{s:g.r.draft?.status,t:g.texts});}
{const u=await customer("iran");const x=await sentAfter(u,()=>send(u,IR(200)));ok("G4 below MOQ still goes to the owner and states no total",x.r.action==="moq_owner"&&!x.texts.some(t=>/جمع/.test(t)),{a:x.r.action,t:x.texts});}

// Before the owner releases it, the offer does not exist for the customer
{const u=await customer("iran");const first=await send(u,IR(1000));
 const acc=await sentAfter(u,()=>send(u,"ثبتش کن"));
 ok("H1 accepting a held offer creates no order",orders(u).length===0&&acc.r.action!=="accept_offer",{a:acc.r.action,o:orders(u).length});
 ok("H2 and tells the customer no amount",acc.texts.every(noMoney),acc.texts);
 const again=await sentAfter(u,()=>send(u,IR(1000)));
 ok("H3 asking the same price again adds no second held draft",drafts(u).length===1,drafts(u));
 ok("H4 and sends one message with no price or total, only the quantity the customer gave",again.texts.length===1&&!/تومان|جمع|۵۹٬۴۰۰/.test(again.texts[0]),again.texts);
 const ch=await sentAfter(u,()=>send(u,IR(2000)));
 const ds=drafts(u);ok("H5 a changed quantity replaces the older held draft: only the newest can be released",ds.length===2&&ds.filter(d=>["draft","pending_approval"].includes(d.status)).length===1&&ds.filter(d=>d.error_detail==="final_quote_superseded"&&d.status==="rejected").length===1,ds);
 ok("H6 the superseded draft cannot be approved",(await call("/api/leads/outreach/transition",{id:first.draft.id,action:"submit"})).body?.ok!==true&&q("SELECT status FROM lead_outreach WHERE id=?",[first.draft.id])[0].status==="rejected");
 ok("H7 the changed quantity is held too",ch.r.draft?.status==="draft"&&ch.texts.every(noMoney),{s:ch.r.draft?.status,t:ch.texts});}

// The owner's release
{const u=await customer("iran");const o=await send(u,IR(1000));const b=out(u).length;await releaseDraft(o.draft.id);const t=out(u).slice(b);
 ok("I1 the owner's release sends the exact prepared text, once",t.length===1&&t[0]===o.draft.message,t);
 ok("I2 the row records the owner, not the automatic policy",(r=>r.status==="sent"&&r.approved_by==="admin")(q("SELECT status,approved_by FROM lead_outreach WHERE id=?",[o.draft.id])[0]));
 const a=await send(u,"ثبتش کن");const os=orders(u);
 ok("I3 only after release does acceptance create one order candidate",a.action==="accept_offer"&&os.length===1&&os[0].status==="order_candidate",{a:a.action,n:os.length});
 ok("I4 the discount is applied once in the order",os[0]?.total_minor===59400000&&os[0]?.discount_minor===6600000&&os[0]?.currency==="TOMAN",os[0]);
 await send(u,"ثبتش کن");ok("I5 accepting again adds no order",orders(u).length===1);}
{const u=await customer("iran");const o=await send(u,IR(1000));await releaseDraft(o.draft.id);const x=await sentAfter(u,()=>send(u,"قیمت برای 1000 عدد چند شد؟"));
 ok("I6 the figures the owner released may be repeated without a new hold, and no different total is sent",x.r.draft?.error_detail!=="final_quote_owner_approval"&&x.texts.every(t=>noMoney(t)||t.includes("۵۹٬۴۰۰٬۰۰۰")),{s:x.r.draft?.status,t:x.texts});}
{const u=await customer("iran");const o=await send(u,IR(1000));await transition(o.draft.id,"submit");await transition(o.draft.id,"reject");const x=await sentAfter(u,()=>send(u,IR(1000)));
 ok("I7 after the owner rejects a held draft, asking again prepares a new held draft and sends no amount",x.r.draft?.id!==o.draft.id&&x.r.draft?.status==="draft"&&x.r.draft?.error_detail==="final_quote_owner_approval"&&x.texts.every(noMoney),{s:x.r.draft?.status,t:x.texts});
 const y=await send(u,"ثبتش کن");ok("I8 and that rejected offer can never be accepted",orders(u).length===0&&y.action!=="accept_offer",y.action);
 await releaseDraft(x.r.draft.id);await send(u,"ثبتش کن");ok("I9 the new draft, once released, can be accepted",orders(u).length===1,orders(u).length);}

// Duplicate delivery: the very same Telegram update, twice
{const u=await customer("iran");const m={message_id:88800001,date:Math.floor(Date.now()/1000),from:{id:u.id,is_bot:false,first_name:u.name,username:u.username},chat:{id:u.id,type:"private",username:u.username,first_name:u.name},text:IR(1000)};
 await post({update_id:990000001,message:m});const sends=out(u).length;await post({update_id:990000001,message:m});
 ok("J1 a redelivered message sends nothing more and leaves one held draft",drafts(u).length===1&&out(u).length===sends,{d:drafts(u),n:out(u).length-sends});}

// Sales AI on, including a model trying to state a total itself
{const A=await makeWorld({aiBrain:"on",extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test"}});await A.call("/api/quotes",null,"GET");await A.call("/api/si/knowledge/product",null,"GET");
 A.dbrun(L,["R1","k1","انگشتر کوچک · 5x5 · 3 تکه",null,"IRAN","TOMAN",66000,null,1,1,null,null,"admin",T,T,T]);
 const u={id:++id,name:"T",username:"q"+id};await A.send(u,"سلام");A.setMarket(u,"iran");const m=IR(1000);
 A.AI.script.set(m,()=>({requests:["price"],reply:"حتماً، جمعش ۵۹٬۴۰۰٬۰۰۰ تومان میشه و مبلغ نهایی همینه.",facts:{quantity:1000}}));
 const b=A.tg.filter(x=>x.method==="sendMessage").length,r=await A.send(u,m),t=A.tg.filter(x=>x.method==="sendMessage").slice(b).map(x=>String(x.body));
 ok("K1 with AI on, no total reaches Telegram",r.draft?.status==="draft"&&!t.some(x=>/۵۹٬۴۰۰٬۰۰۰|59400000/.test(x)),{s:r.draft?.status,t});
 const before=A.q("SELECT COUNT(*) n FROM lead_orders")[0].n;await A.send(u,"ثبتش کن");ok("K2 and no order comes from the held offer",A.q("SELECT COUNT(*) n FROM lead_orders")[0].n===before);}

// Nothing here writes a price
ok("Z1 prices unchanged",q("SELECT SUM(unit_price_minor) s FROM commercial_price_items")[0].s===66060&&q("SELECT COUNT(*) n FROM commercial_price_items")[0].n===2);
done();process.exit(0);
