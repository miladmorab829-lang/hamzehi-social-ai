// Phase 13.1 / 13.1B — Owner Action Center: ONE read-only queue of everything that waits on the owner, built only from existing records.
// Nothing here writes, sends, approves, publishes, changes a state or touches the schema: every statement is a bounded SELECT, a missing
// table is reported as an unavailable source (never created — the revenue detector is called with ensure:false), and each item links to
// the existing dashboard view where the owner acts. Amounts come only from the record (order outstanding = total − recorded payments,
// quote total), stay in the record's own currency and are never converted or summed across currencies. A lead is REAL only with explicit
// owner evidence (notes.data_class='real'), TEST only with the existing test evidence (data_class 'test' / is_test), otherwise UNKNOWN —
// and UNKNOWN money is never reported as verified.
// Completeness (13.1B): every source reads base-P0/P1 rows first, then age-escalated rows, then the rest and counts all matching rows in the same
// statement (window COUNT), so truncation is measured, never guessed. Coverage is COMPLETE / PARTIAL (a source had more rows than its
// cap) / UNKNOWN (a source could not be read); counts are exact only when coverage is COMPLETE.

export const OAC_RULES_VERSION="13.1B";
const DAY=86400000,SOURCE_LIMIT=200,PAGE_MAX=100,IN_BATCH=90;
const P=["P0","P1","P2","P3"],best=(a,b)=>P.indexOf(a)<=P.indexOf(b)?a:b;

// Base priority per decision/escalation type (P0 urgent … P3 low). Unlisted escalations are standard commercial items (P2).
const DECISION_RULES={
  PAYMENT_VERIFICATION:{category:"payment",priority:"P0",action:"بررسی ادعای پرداخت مشتری و تطبیق با رسید (فقط مالک)"},
  ORDER_CANDIDATE_APPROVAL:{category:"order",priority:"P1",action:"تأیید یا رد سفارش (فقط مالک)"},
  PAYMENT_TERMS:{category:"payment",priority:"P1",action:"تعیین شرایط پرداخت این سفارش"},
  QUOTE_OWNER_EDIT_CONFLICT:{category:"pricing",priority:"P1",action:"بررسی تعارض ویرایش پیش‌فاکتور"},
  CUSTOM_ORDER:{category:"pricing",priority:"P1",action:"تعیین قیمت سفارش سفارشی"},
  QUANTITY_TIER:{category:"pricing",priority:"P1",action:"تعیین قیمت پله‌ای تعداد"},
  ESCALATION_UNSUPPORTED_PRICE:{category:"pricing",priority:"P1",action:"تعیین یا تأیید قیمت درخواست‌شده"},
  MOQ_DECISION:{category:"commercial",priority:"P2",action:"تصمیم دربارهٔ حداقل سفارش"},
  ESCALATION_UNCLEAR_MOQ:{category:"commercial",priority:"P2",action:"تصمیم دربارهٔ حداقل سفارش"},
  ESCALATION_UNUSUAL_COMMERCIAL_TERMS:{category:"commercial",priority:"P2",action:"بررسی شرایط تجاری غیرمصوب"},
  ESCALATION_MISSING_BUSINESS_KNOWLEDGE:{category:"knowledge",priority:"P2",action:"پاسخ به سؤال محصول مشتری و ثبت دانش"},
  MARGIN_RULE:{category:"pricing",priority:"P2",action:"تعیین قاعدهٔ حاشیهٔ سود"},
  COST_REQUIRED:{category:"pricing",priority:"P2",action:"ثبت هزینهٔ تمام‌شده"},
  KNOWLEDGE_CONFLICT:{category:"knowledge",priority:"P3",action:"رفع تعارض دانش"},
  LEARNING_RULE:{category:"knowledge",priority:"P3",action:"بررسی قاعدهٔ یادگیری"}
};
const decisionRule=t=>DECISION_RULES[t]||(String(t||"").startsWith("ESCALATION_")?{category:"commercial",priority:"P2",action:"بررسی درخواست ارجاع‌شده"}:{category:"commercial",priority:"P2",action:"بررسی تصمیم در انتظار"});
const escalationRule=reason=>decisionRule("ESCALATION_"+String(reason||"").toUpperCase());
const sqlList=a=>a.map(x=>`'${x}'`).join(",");   // constants only (never request input)
const URGENT_DECISIONS=sqlList(Object.keys(DECISION_RULES).filter(k=>["P0","P1"].includes(DECISION_RULES[k].priority)));
const LOW_DECISIONS=sqlList(Object.keys(DECISION_RULES).filter(k=>DECISION_RULES[k].priority==="P3"));
const URGENT_ESCALATIONS=sqlList(Object.keys(DECISION_RULES).filter(k=>k.startsWith("ESCALATION_")&&DECISION_RULES[k].priority==="P1").map(k=>k.slice(11).toLowerCase()));

// Deterministic priority: the base rule, then age — a P2 item waiting 7+ days becomes P1, a P3 item 14+ days becomes P2. Age never
// raises anything to P0, and a TEST record is always P3 (it is shown, never ranked as real work). Opportunities (reorder, never-contacted
// high-priority lead) are not escalated by age: their age is the opportunity itself (a reorder is 30+ days old by definition).
export function oacPriority(base,ageDays,classification,category){
  if(classification==="TEST")return "P3";
  if(category==="opportunity")return base;
  if(base==="P2"&&ageDays!==null&&ageDays>=7)return "P1";
  if(base==="P3"&&ageDays!==null&&ageDays>=14)return "P2";
  return base;
}
const LINKS={escalation:"/dashboard/approvals#sec-escalations",decision:"/dashboard/approvals#sec-approvalsOverview",order:"/dashboard/orders#sec-orders",
  payment:"/dashboard/orders#sec-money",quote:"/dashboard/orders#sec-quotes",draft:"/dashboard/approvals#sec-outreach",lead:"/dashboard/customers#sec-leadsList",reorder:"/dashboard/orders#sec-money"};
// lead_outreach states (LEAD_OUTREACH_STATUSES in index.js) → what the owner must do; sent / delivered are real contact (no draft item)
const OUTREACH_STATE={
  draft:{kind:"awaiting_owner_approval",priority:"P2"},pending_approval:{kind:"awaiting_owner_approval",priority:"P2"},
  approved:{kind:"approved_not_sent",priority:"P2"},sending:{kind:"send_in_progress",priority:"P2"},
  send_failed:{kind:"delivery_failed",priority:"P1"},send_ambiguous:{kind:"delivery_unknown",priority:"P1"}
};
const OUTREACH_TEXT={
  awaiting_owner_approval:{reply:"پاسخ به پیام مشتری منتظر تأیید شما",followup:"پیش‌نویس پیگیری منتظر تأیید شما",outreach:"پیام تماس منتظر تأیید شما"},
  approved_not_sent:{reply:"پاسخ تأییدشده هنوز ارسال نشده",followup:"پیگیری تأییدشده هنوز ارسال نشده",outreach:"پیام تأییدشده هنوز ارسال نشده"},
  send_in_progress:{reply:"ارسال پاسخ در جریان است؛ اگر طولانی شد بررسی کنید",followup:"ارسال پیگیری در جریان است",outreach:"ارسال پیام در جریان است"},
  delivery_failed:{reply:"ارسال پاسخ ناموفق بود — بررسی و تصمیم مالک",followup:"ارسال پیگیری ناموفق بود — بررسی مالک",outreach:"ارسال پیام ناموفق بود — بررسی مالک"},
  delivery_unknown:{reply:"نتیجهٔ ارسال پاسخ نامعلوم است — پیش از ارسال دوباره بررسی کنید",followup:"نتیجهٔ ارسال پیگیری نامعلوم است — بررسی کنید",outreach:"نتیجهٔ ارسال پیام نامعلوم است — بررسی کنید"}
};

export async function ownerActionCenter(env,query={},deps={}){
  const nowMs=Number.isFinite(query.nowMs)?query.nowMs:Date.now(),iso=n=>new Date(nowMs-n*DAY).toISOString();
  const ageOf=at=>{const t=Date.parse(at||"");return Number.isFinite(t)?Math.max(0,Math.floor((nowMs-t)/DAY)):null;};
  const cur=v=>{const c=deps.canonicalCurrency?deps.canonicalCurrency(v):String(v||"").trim().toUpperCase();return c||null;};
  const testSql=deps.leadTestFlagSql?deps.leadTestFlagSql("l"):"0";
  const classSql=`CASE WHEN ${testSql}=1 THEN 'TEST' WHEN l.notes IS NOT NULL AND json_valid(l.notes) AND json_extract(l.notes,'$.data_class')='real' THEN 'REAL' ELSE 'UNKNOWN' END`;
  // only the three market fields are read from lead notes (no names, phones or other personal data leave the database)
  const mktSql=`CASE WHEN l.notes IS NOT NULL AND json_valid(l.notes) THEN json_object('market',json_extract(l.notes,'$.market'),'country',json_extract(l.notes,'$.country'),'target_market',json_extract(l.notes,'$.target_market')) ELSE '{}' END`;
  const marketOf=m=>{let o={};try{o=JSON.parse(m||"{}")||{};}catch{}return deps.leadMarketOf?deps.leadMarketOf(o):"UNKNOWN";};
  const sources={},items=[],ago7=iso(7);
  // which tables exist — one catalogue SELECT; a missing table makes its source UNAVAILABLE (it is never created here)
  let tables=new Set();
  try{tables=new Set((((await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").bind().all()).results)||[]).map(r=>r.name));}catch{tables=null;}
  const missing=need=>tables===null?need:need.filter(t=>!tables.has(t));
  // read(): urgent rows first, `_total` / `_urgent` = matching rows in the whole source (window COUNT in the same statement)
  const read=async(name,need,sql,args=[])=>{
    const gone=missing(need);if(gone.length){sources[name]={ok:false,count:0,total:null,complete:false,error:"table missing: "+gone.join(",")};return [];}
    try{const r=((await env.DB.prepare(sql).bind(...args).all()).results)||[];
      const total=r.length?Number(r[0]._total)||r.length:0,urgent=r.length?Number(r[0]._urgent)||0:0,urgentReturned=r.filter(x=>Number(x._u)===1).length;
      sources[name]={ok:true,count:r.length,total,complete:total<=r.length,urgent_total:urgent,urgent_returned:urgentReturned,urgent_complete:urgentReturned>=urgent};return r;}
    catch(e){sources[name]={ok:false,count:0,total:null,complete:false,error:"source unavailable"};return [];}};
  const push=x=>{const age=ageOf(x.since);const it={...x,age_days:age,base_priority:x.priority,priority:oacPriority(x.priority,age,x.classification,x.category),
    market:["IRAN","ARAB"].includes(x.market)?x.market:"UNKNOWN",currency:x.currency?cur(x.currency):null,related:x.related||[],flags:x.flags||[]};items.push(it);return it;};
  const win=u=>`(${u}) AS _u,COUNT(*) OVER() AS _total,SUM(CASE WHEN ${u} THEN 1 ELSE 0 END) OVER() AS _urgent`;

  // A — escalations (owner_escalations) and owner decisions; a decision that mirrors an escalation is the SAME item (one row) and the
  // merged item keeps the MORE urgent of the two priorities.
  const escU=`e.reason_code IN (${URGENT_ESCALATIONS}) OR e.created_at<='${ago7}'`;
  const esc=await read("owner_escalations",["owner_escalations","leads"],`SELECT e.id,e.lead_id,e.reason_code,e.status,e.created_at,${classSql} AS classification,${mktSql} AS meta,${win(escU)}
    FROM owner_escalations e LEFT JOIN leads l ON l.id=e.lead_id WHERE e.status='open' ORDER BY CASE WHEN e.reason_code IN (${URGENT_ESCALATIONS}) THEN 0 ELSE 1 END,_u DESC,e.created_at ASC,e.id LIMIT ${SOURCE_LIMIT}`);
  const escItems=new Map();
  for(const e of esc){const r=escalationRule(e.reason_code);
    escItems.set(e.id,push({key:`escalation:${e.id}`,category:r.category,kind:"escalation",priority:r.priority,reason:String(e.reason_code||""),since:e.created_at,status:e.status,classification:e.classification,market:marketOf(e.meta),
      lead_id:e.lead_id||null,record:{type:"owner_escalation",id:e.id},next_action:r.action,link:LINKS.escalation}));}
  const decU=`d.decision_type IN (${URGENT_DECISIONS}) OR (d.decision_type NOT IN (${LOW_DECISIONS}) AND d.created_at<='${ago7}')`;
  const dec=await read("owner_decisions",["owner_decisions","leads","lead_orders","lead_quotes"],`SELECT d.id,d.decision_type,d.status,d.market,d.lead_id,d.quote_id,d.order_id,d.owner_escalation_id,d.created_at,${classSql} AS classification,${win(decU)}
    FROM owner_decisions d LEFT JOIN leads l ON l.id=COALESCE(d.lead_id,(SELECT o.lead_id FROM lead_orders o WHERE o.id=d.order_id),(SELECT q.lead_id FROM lead_quotes q WHERE q.id=d.quote_id))
    WHERE d.status='PENDING' ORDER BY CASE WHEN d.decision_type='PAYMENT_VERIFICATION' THEN 0 WHEN d.decision_type IN (${URGENT_DECISIONS}) THEN 1 ELSE 2 END,_u DESC,d.created_at ASC,d.id LIMIT ${SOURCE_LIMIT}`);
  const orderDecisions=new Map();   // order_id → [pending ORDER_CANDIDATE_APPROVAL decisions] (merged into the order item; none dropped)
  const standalone=d=>{const r=decisionRule(d.decision_type);
    push({key:`decision:${d.id}`,category:r.category,kind:"decision",priority:r.priority,reason:d.decision_type,since:d.created_at,status:d.status,classification:d.classification,market:d.market,
      lead_id:d.lead_id||null,record:{type:"owner_decision",id:d.id},related:[d.order_id?{type:"order",id:d.order_id}:null,d.quote_id?{type:"quote",id:d.quote_id}:null].filter(Boolean),next_action:r.action,link:LINKS.decision});};
  for(const d of dec){
    const host=d.owner_escalation_id?escItems.get(d.owner_escalation_id):null;
    if(host){const r=decisionRule(d.decision_type),mergedBase=best(host.base_priority,r.priority);host.related.push({type:"owner_decision",id:d.id});
      if(host.market==="UNKNOWN"&&["IRAN","ARAB"].includes(d.market))host.market=d.market;
      if(mergedBase!==host.base_priority){host.base_priority=mergedBase;host.priority=oacPriority(mergedBase,host.age_days,host.classification,host.category);host.next_action=r.action;host.category=r.category;}continue;}
    if(d.decision_type==="ORDER_CANDIDATE_APPROVAL"&&d.order_id){orderDecisions.set(d.order_id,[...(orderDecisions.get(d.order_id)||[]),d]);continue;}
    standalone(d);
  }

  // B — orders: candidates waiting for the owner, confirmed-unpaid, partial balances (also after shipping / fulfilment), and payment
  // integrity issues (P0). A paid / shipped / fulfilled order whose payments equal its total is complete and never listed.
  const paid="COALESCE((SELECT SUM(p.amount_minor) FROM lead_order_payments p WHERE p.order_id=o.id),0)";
  const lastPay="(SELECT MAX(p.recorded_at) FROM lead_order_payments p WHERE p.order_id=o.id)";
  const integrity=`(o.status='paid' AND (o.total_minor IS NULL OR ${paid}<>o.total_minor)) OR (o.status='cancelled' AND ${paid}<>0) OR (o.total_minor IS NOT NULL AND ${paid}>o.total_minor)`;
  const ordU=`${integrity} OR o.status='order_candidate' OR (o.status IN ('shipped','fulfilled')) OR (o.status='confirmed' AND COALESCE(o.confirmed_at,o.updated_at)<='${iso(2)}') OR (o.status='partially_paid' AND COALESCE(${lastPay},o.updated_at)<='${iso(3)}')`;
  const orders=await read("lead_orders",["lead_orders","lead_order_payments","leads"],`SELECT o.id,o.order_number,o.lead_id,o.market,o.currency,o.status,o.total_minor,o.created_at,o.customer_accepted_at,o.confirmed_at,o.shipped_at,o.delivered_at,o.updated_at,${paid} AS paid_minor,${lastPay} AS last_payment_at,${classSql} AS classification,${win(ordU)}
    FROM lead_orders o LEFT JOIN leads l ON l.id=o.lead_id
    WHERE o.status IN ('order_candidate','confirmed','partially_paid') OR ${integrity} OR (o.status IN ('shipped','fulfilled') AND o.total_minor IS NOT NULL AND ${paid}<o.total_minor)
    ORDER BY CASE WHEN ${integrity} THEN 0 WHEN o.status IN ('order_candidate','shipped','fulfilled') THEN 1 ELSE 2 END,_u DESC,o.created_at ASC,o.id LIMIT ${SOURCE_LIMIT}`);
  for(const o of orders){
    const total=Number.isSafeInteger(Number(o.total_minor))&&o.total_minor!==null?Number(o.total_minor):null,paidM=Number(o.paid_minor)||0,outstanding=total===null?null:total-paidM;
    const base={lead_id:o.lead_id||null,market:o.market,currency:o.currency,classification:o.classification,status:o.status,record:{type:"order",id:o.id,number:o.order_number||null}};
    const decs=orderDecisions.get(o.id)||[];
    if((o.status==="paid"&&(total===null||paidM!==total))||(o.status==="cancelled"&&paidM!==0)||(total!==null&&paidM>total)){
      push({...base,key:`integrity:${o.id}`,category:"payment",kind:"payment_integrity",priority:"P0",reason:o.status==="cancelled"?"payments_on_cancelled_order":total===null?"order_total_missing":paidM>total?"payments_exceed_total":"payments_do_not_match_total",
        since:o.updated_at,amount_minor:paidM,amount_kind:"recorded_payments",related:decs.map(d=>({type:"owner_decision",id:d.id})),next_action:"بررسی فوری ناهمخوانی پرداخت و مبلغ سفارش",link:LINKS.payment});orderDecisions.delete(o.id);continue;}
    if(o.status==="order_candidate"){orderDecisions.delete(o.id);
      push({...base,key:`order:${o.id}`,category:"order",kind:"order_candidate",priority:"P1",reason:"awaiting_owner_confirmation",since:o.customer_accepted_at||o.created_at,amount_minor:total,amount_kind:"order_total",
        related:decs.map(d=>({type:"owner_decision",id:d.id})),next_action:"تأیید یا رد سفارش (فقط مالک)",link:LINKS.order});continue;}
    if(o.status==="shipped"||o.status==="fulfilled"){const since=o.last_payment_at||o.delivered_at||o.shipped_at||o.updated_at;
      push({...base,key:`order:${o.id}`,category:"payment",kind:"balance_after_shipping",priority:"P1",reason:"unpaid_balance_after_"+o.status,since,amount_minor:outstanding,amount_kind:"outstanding",
        next_action:"پیگیری باقیماندهٔ پرداخت پس از ارسال کالا",link:LINKS.payment});continue;}
    if(paidM<=0){const since=o.confirmed_at||o.updated_at,age=ageOf(since);
      push({...base,key:`order:${o.id}`,category:"payment",kind:"order_unpaid",priority:age!==null&&age>=2?"P1":"P2",reason:age!==null&&age>=2?"payment_overdue":"awaiting_payment",since,amount_minor:outstanding,amount_kind:"outstanding",
        next_action:"پیگیری پرداخت (پیش‌نویس درخواست پرداخت با تأیید مالک)",link:LINKS.payment});continue;}
    if(outstanding!==null&&outstanding>0){const since=o.last_payment_at||o.updated_at,age=ageOf(since);
      push({...base,key:`order:${o.id}`,category:"payment",kind:"balance_open",priority:age!==null&&age>=3?"P1":"P2",reason:age!==null&&age>=3?"balance_overdue":"balance_open",since,amount_minor:outstanding,amount_kind:"outstanding",
        next_action:"پیگیری باقیماندهٔ پرداخت",link:LINKS.payment});continue;}
    if(o.status==="partially_paid"&&outstanding===0)   // fully paid but still marked partially_paid: a bookkeeping action, not money at risk
      push({...base,key:`order:${o.id}`,category:"payment",kind:"status_out_of_date",priority:"P2",reason:"fully_paid_but_partially_paid",since:o.last_payment_at||o.updated_at,amount_minor:null,amount_kind:null,
        next_action:"به‌روزرسانی وضعیت سفارش (پرداخت کامل ثبت شده)",link:LINKS.order});
  }
  // an ORDER_CANDIDATE_APPROVAL decision whose order is not an open candidate (or not read) is still an owner item — never dropped
  for(const list of orderDecisions.values())for(const d of list)standalone(d);

  // B/A — quotes that wait on the owner (price / review / approval) or are ready to submit.
  const qU=`q.status IN ('waiting_for_owner_price','requires_owner_review','pending_approval') OR COALESCE(q.created_at,q.updated_at)<='${ago7}'`;
  const quotes=await read("lead_quotes",["lead_quotes","lead_orders","leads"],`SELECT q.id,q.lead_id,q.market,q.currency,q.status,q.total_minor,q.created_at,q.updated_at,${classSql} AS classification,${win(qU)}
    FROM lead_quotes q LEFT JOIN leads l ON l.id=q.lead_id
    WHERE q.status IN ('waiting_for_owner_price','requires_owner_review','pending_approval','waiting_for_price_match','quote_ready') AND NOT EXISTS(SELECT 1 FROM lead_orders o WHERE o.quote_id=q.id)
    ORDER BY CASE WHEN q.status IN ('waiting_for_owner_price','requires_owner_review','pending_approval') THEN 0 ELSE 1 END,_u DESC,COALESCE(q.created_at,q.updated_at) ASC,q.id LIMIT ${SOURCE_LIMIT}`);
  const QUOTE_RULE={waiting_for_owner_price:["P1","تعیین قیمت پیش‌فاکتور"],requires_owner_review:["P1","بررسی پیش‌فاکتور (ارز/قیمت/جزئیات)"],pending_approval:["P1","تأیید پیش‌فاکتور برای ارسال"],
    waiting_for_price_match:["P2","افزودن قیمت مصوب برای این محصول"],quote_ready:["P2","بررسی و ارسال پیش‌فاکتور آماده"]};
  for(const q of quotes){const [pr,action]=QUOTE_RULE[q.status];
    push({key:`quote:${q.id}`,category:"pricing",kind:"quote_owner",priority:pr,reason:q.status,since:q.created_at||q.updated_at,status:q.status,classification:q.classification,market:q.market,currency:q.currency,
      amount_minor:Number.isSafeInteger(Number(q.total_minor))&&q.total_minor!==null?Number(q.total_minor):null,amount_kind:"quote_total",lead_id:q.lead_id||null,record:{type:"quote",id:q.id},next_action:action,link:LINKS.quote});}

  // C — unanswered sent quotes (3+ days) and repeat-order opportunities (30+ days): the Phase 12 detector, reused WITHOUT its schema
  // initialisation (ensure:false). Its own per-kind cap of 200 is reported as partial coverage.
  const detNeed=["lead_quotes","lead_orders","lead_order_payments","inbox_messages","leads"],detGone=missing(detNeed);
  let stalled=[];
  if(!deps.findStalledRevenueItems)sources.revenue_detector={ok:false,count:0,total:null,complete:false,error:"detector unavailable"};
  else if(detGone.length)sources.revenue_detector={ok:false,count:0,total:null,complete:false,error:"table missing: "+detGone.join(",")};
  else{try{stalled=await deps.findStalledRevenueItems(env,{nowMs,ensure:false});const perKind=stalled.reduce((m,s)=>(m[s.kind]=(m[s.kind]||0)+1,m),{}),capped=Object.values(perKind).some(n=>n>=SOURCE_LIMIT);
      sources.revenue_detector={ok:true,count:stalled.length,total:capped?null:stalled.length,complete:!capped,urgent_total:0,urgent_returned:0,urgent_complete:!capped};}
    catch{sources.revenue_detector={ok:false,count:0,total:null,complete:false,error:"source unavailable"};}}
  const wanted=stalled.filter(s=>s.kind==="quote_no_reply"||s.kind==="reorder");   // unpaid / balances are already order items above
  const ids=[...new Set(wanted.map(s=>s.lead_id).filter(Boolean))],cls=new Map();
  for(let i=0;i<ids.length;i+=IN_BATCH){const part=ids.slice(i,i+IN_BATCH);   // bounded batches: within the D1 bound-parameter limit
    try{const r=((await env.DB.prepare(`SELECT l.id,${classSql} AS classification FROM leads l WHERE l.id IN (${part.map(()=>"?").join(",")})`).bind(...part).all()).results)||[];for(const x of r)cls.set(x.id,x.classification);}
    catch{sources.lead_classification={ok:false,count:0,total:null,complete:false,error:"source unavailable"};}}
  for(const s of wanted){
    push({key:`${s.kind}:${s.ref_id}`,category:s.kind==="reorder"?"opportunity":"followup",kind:s.kind,priority:s.kind==="reorder"?"P3":"P2",reason:s.kind,since:s.since,status:s.kind==="reorder"?"completed_order":"sent",
      classification:s.test_record?"TEST":(cls.get(s.lead_id)||"UNKNOWN"),market:s.market,currency:s.currency,amount_minor:s.kind==="reorder"?null:s.total_minor,amount_kind:s.kind==="reorder"?null:"quote_total",lead_id:s.lead_id||null,
      record:{type:s.kind==="reorder"?"order":"quote",id:s.ref_id},next_action:s.kind==="reorder"?"پیشنهاد سفارش مجدد (پیش‌نویس با تأیید مالک)":"پیگیری پیش‌فاکتور بی‌پاسخ (پیش‌نویس با تأیید مالک)",link:s.kind==="reorder"?LINKS.reorder:LINKS.quote});
  }

  // C — outgoing messages that wait on the owner, ONE item per lead and state: awaiting approval / approved but not sent / sending /
  // delivery failed / outcome unknown. The origin (reply to a customer message, follow-up, other outreach) only changes the wording.
  const states=Object.keys(OUTREACH_STATE),dU=`x.status IN ('send_failed','send_ambiguous') OR MIN(x.created_at)<='${ago7}'`;
  const drafts=await read("lead_outreach",["lead_outreach","leads"],`SELECT x.lead_id,x.status,CASE WHEN MAX(x.inbox_message_id IS NOT NULL)=1 THEN 'reply' WHEN MIN(x.id LIKE 'sales-draft-%')=1 THEN 'followup' ELSE 'outreach' END AS origin,
      COUNT(*) n,MIN(x.created_at) oldest,MAX(x.updated_at) newest,${classSql} AS classification,${mktSql} AS meta,${win(dU)}
    FROM lead_outreach x LEFT JOIN leads l ON l.id=x.lead_id WHERE x.status IN (${sqlList(states)}) GROUP BY x.lead_id,x.status ORDER BY CASE WHEN x.status IN ('send_failed','send_ambiguous') THEN 0 ELSE 1 END,_u DESC,oldest ASC,x.lead_id LIMIT ${SOURCE_LIMIT}`);
  for(const d of drafts){const st=OUTREACH_STATE[d.status];if(!st)continue;
    // a send that has been "in progress" for more than an hour has an unknown outcome
    const stuck=d.status==="sending"&&ageOf(d.newest)!==null&&(nowMs-Date.parse(d.newest))>3600000,kind=stuck?"delivery_unknown":st.kind;
    push({key:`outreach:${kind}:${d.lead_id}`,category:"followup",kind,priority:stuck?"P1":st.priority,reason:d.status,since:d.oldest,status:d.status,classification:d.classification,market:marketOf(d.meta),
      lead_id:d.lead_id||null,count:Number(d.n)||0,record:{type:"lead",id:d.lead_id},next_action:OUTREACH_TEXT[kind][d.origin]+(Number(d.n)>1?` (${Number(d.n)} مورد)`:""),link:LINKS.draft});}

  // C/D — conversations in ONE pass over inbox_messages and lead_outreach (grouped per lead; no per-lead correlated scans). A lead whose
  // customer wrote last is WAITING; real contact = outreach 'sent' or 'delivered' only (drafts / failed sends are not contact).
  const convU=`inb.last_in IS NOT NULL AND inb.last_in>COALESCE(ob.last_out,'')`;
  const convo=await read("conversations",["leads","inbox_messages","lead_outreach","lead_orders"],`WITH inb AS (SELECT lead_id,MAX(created_at) last_in,COUNT(*) msgs FROM inbox_messages WHERE lead_id IS NOT NULL GROUP BY lead_id),
      ob AS (SELECT lead_id,MAX(sent_at) last_out,COUNT(*) contacts FROM lead_outreach WHERE status IN ('sent','delivered') AND lead_id IS NOT NULL GROUP BY lead_id),
      busyo AS (SELECT DISTINCT lead_id FROM lead_orders WHERE status IN ('order_candidate','confirmed','partially_paid') AND lead_id IS NOT NULL)
    SELECT l.id lead_id,l.stage,l.priority,${classSql} AS classification,${mktSql} AS meta,CASE WHEN l.notes IS NOT NULL AND json_valid(l.notes) THEN json_extract(l.notes,'$.discovered_at') END AS discovered_at,
      inb.last_in,ob.last_out,COALESCE(inb.msgs,0) msgs,COALESCE(ob.contacts,0) contacts,${win(convU)}
    FROM leads l LEFT JOIN inb ON inb.lead_id=l.id LEFT JOIN ob ON ob.lead_id=l.id
    WHERE l.stage NOT IN ('customer','lost','won','closed') AND (inb.lead_id IS NOT NULL OR l.priority='high') AND NOT EXISTS(SELECT 1 FROM busyo WHERE busyo.lead_id=l.id)
    ORDER BY _u DESC,COALESCE(inb.last_in,l.updated_at) ASC,l.id LIMIT ${SOURCE_LIMIT}`);
  // Dedupe without hiding: when the lead already has an open item, "customer waiting" is attached to that item (raised to at least P1,
  // TEST stays P3) instead of being dropped; a separate conversation row is shown only for a lead with nothing else open.
  const byLead=new Map();for(const it of items)if(it.lead_id){const a=byLead.get(it.lead_id)||[];a.push(it);byLead.set(it.lead_id,a);}
  for(const c of convo){
    const market=marketOf(c.meta),lastIn=c.last_in,lastOut=c.last_out,own=byLead.get(c.lead_id)||[];
    if(Number(c.msgs)>0){
      const unanswered=!!lastIn&&(!lastOut||String(lastIn)>String(lastOut)),since=unanswered?lastIn:([lastIn,lastOut].filter(Boolean).sort().pop());
      if(unanswered&&own.length){const host=own.slice().sort((a,b)=>P.indexOf(a.priority)-P.indexOf(b.priority)||a.key.localeCompare(b.key))[0];
        host.flags.push("customer_waiting");host.customer_waiting_since=lastIn;if(host.classification!=="TEST")host.priority=best(host.priority,"P1");continue;}
      if(own.length)continue;
      const age=ageOf(since);if(!unanswered&&(age===null||age<3))continue;
      push({key:`conversation:${c.lead_id}`,category:"followup",kind:unanswered?"customer_waiting":"stalled_negotiation",priority:unanswered?"P1":"P2",reason:unanswered?"customer_message_unanswered":"no_activity",since,status:c.stage,
        classification:c.classification,market,lead_id:c.lead_id,record:{type:"lead",id:c.lead_id},flags:unanswered?["customer_waiting"]:[],next_action:unanswered?"پاسخ به آخرین پیام مشتری":"پیگیری مذاکرهٔ متوقف‌شده",link:LINKS.lead});
    }else if(c.priority==="high"&&Number(c.contacts)===0&&!own.length){
      push({key:`lead:${c.lead_id}`,category:"opportunity",kind:"high_priority_lead",priority:"P3",reason:"high_priority_never_contacted",since:c.discovered_at||null,status:c.stage,classification:c.classification,market,
        lead_id:c.lead_id,record:{type:"lead",id:c.lead_id},next_action:"تصمیم دربارهٔ تماس با لید اولویت‌دار",link:LINKS.lead});
    }
  }

  // dedupe by key (first source wins), then a stable order: priority, oldest first, category, key.
  const seen=new Set(),all=[];for(const x of items){if(seen.has(x.key))continue;seen.add(x.key);all.push(x);}
  all.sort((a,b)=>P.indexOf(a.priority)-P.indexOf(b.priority)||(b.age_days??-1)-(a.age_days??-1)||a.category.localeCompare(b.category)||a.key.localeCompare(b.key));
  const money={verified_by_currency:{},unverified_by_currency:{},test_by_currency:{}};
  for(const x of all){if(x.amount_kind!=="outstanding"||!x.currency||!Number.isSafeInteger(x.amount_minor))continue;
    const bucket=x.classification==="REAL"?money.verified_by_currency:x.classification==="TEST"?money.test_by_currency:money.unverified_by_currency;bucket[x.currency]=(bucket[x.currency]||0)+x.amount_minor;}
  // coverage: UNKNOWN if any source could not be read; PARTIAL if any source had more rows than it returned; else COMPLETE.
  const S=Object.entries(sources),failed=S.filter(([,s])=>!s.ok).map(([k])=>k),truncated=S.filter(([,s])=>s.ok&&!s.complete).map(([k])=>k),urgentCut=S.filter(([,s])=>s.ok&&s.urgent_complete===false).map(([k])=>k);
  const coverage=failed.length?"UNKNOWN":truncated.length?"PARTIAL":"COMPLETE",urgent_coverage=failed.length?"UNKNOWN":urgentCut.length?"PARTIAL":"COMPLETE";
  const count=(arr,f)=>arr.reduce((o,x)=>(o[x[f]]=(o[x[f]]||0)+1,o),{});
  const f={priority:query.priority||"",category:query.category||"",market:query.market||"",status:query.status||""};
  const filtered=all.filter(x=>(!f.priority||x.priority===f.priority)&&(!f.category||x.category===f.category)&&(!f.market||x.market===f.market)&&(!f.status||x.status===f.status));
  const limit=Math.min(PAGE_MAX,Math.max(1,Number(query.limit)||50)),offset=Math.max(0,Number(query.offset)||0);
  return {ok:true,rules_version:OAC_RULES_VERSION,generated_at:new Date(nowMs).toISOString(),read_only:true,
    coverage:{status:coverage,urgent:urgent_coverage,exact:coverage==="COMPLETE",failed_sources:failed,truncated_sources:truncated,urgent_truncated_sources:urgentCut},
    summary:{total:all.length,exact:coverage==="COMPLETE",by_priority:Object.fromEntries(P.map(p=>[p,all.filter(x=>x.priority===p).length])),by_category:count(all,"category"),by_market:count(all,"market"),
      by_classification:count(all,"classification"),by_status:count(all,"status"),customer_waiting:all.filter(x=>x.flags.includes("customer_waiting")).length,money_outstanding:money},
    filters:f,total_filtered:filtered.length,limit,offset,items:filtered.slice(offset,offset+limit),sources};
}
