// Real Worker resolver and SQLite transactions; no production database or external calls.
import {makeWorld,reporter} from './harness.mjs';
const {ok,done}=reporter('phase37_payment_decision_atomic');
const W=await makeWorld();await W.call('/api/si/decisions',null,'GET');
let n=0;
function fixture(){const id='atomic-'+(++n),t=new Date().toISOString();
  W.dbrun("INSERT INTO lead_orders(id,order_number,quote_id,lead_id,conversation_id,product,quantity,currency,total_minor,status,market,created_at,updated_at) VALUES(?,?,?,?,?,'test',300,'TOMAN',10000,'confirmed','IRAN',?,?)",[id,id,id,id,id,t,t]);
  W.dbrun("INSERT INTO owner_decisions(id,status,decision_type,fingerprint,order_id,question,payload_json,created_at,updated_at) VALUES(?,'PENDING','PAYMENT_VERIFICATION',?,?,'Verify',?,?,?)",[id,id,id,JSON.stringify({resolution:'payment_verification',order_id:id,suggested_amount_minor:5000,method:'bank_transfer'}),t,t]);return id;}
const resolve=async(id,action='APPROVE',answer={})=>{const r=await W.call('/api/si/decisions/resolve',{id,action,answer,scope:'CASE_ONLY',note:'local test'});if(!r.body?.ok)throw Error(r.body?.error||'Resolution failed');return r.body;};
const attempt=p=>p.then(value=>({ok:true,value}),error=>({ok:false,error:error.message}));
const state=id=>({decision:W.q('SELECT * FROM owner_decisions WHERE id=?',[id])[0],payments:W.q('SELECT * FROM lead_order_payments WHERE order_id=?',[id]),order:W.q('SELECT * FROM lead_orders WHERE id=?',[id])[0]});
const originalBatch=W.env.DB.batch.bind(W.env.DB);
function pausePayment(){let entered,release;const reached=new Promise(r=>entered=r),blocked=new Promise(r=>release=r);let first=true;
  W.env.DB.batch=async stmts=>{if(first&&stmts.some(s=>/INSERT INTO lead_order_payments/.test(s.sql))){first=false;entered();await blocked;}return originalBatch(stmts);};
  return {reached,release,restore:()=>W.env.DB.batch=originalBatch};}
{
 const id=fixture(),pause=pausePayment(),approval=attempt(resolve(id));await pause.reached;await resolve(id,'REJECT');pause.release();const a=await approval;pause.restore();const s=state(id);
 ok('REJECT wins before payment transaction: no money or order effect',!a.ok&&s.decision.status==='REJECTED'&&s.payments.length===0&&s.order.status==='confirmed',s);
}
{
 const id=fixture();await resolve(id);const rejected=await attempt(resolve(id,'REJECT')),s=state(id);
 ok('APPROVE wins: rejection cannot overwrite its payment decision',!rejected.ok&&s.decision.status==='RESOLVED'&&s.decision.owner_decision==='APPROVE'&&s.payments.length===1&&s.order.status==='partially_paid',s);
 const repeat=await resolve(id);ok('Repeated approval is idempotent',repeat.idempotent&&state(id).payments.length===1);
 ok('Owner decision points at the exact committed payment',s.decision.resulting_ref==='payment:'+s.payments[0].id&&s.decision.owner_note==='local test');
}
{
 const id=fixture(),pause=pausePayment(),first=attempt(resolve(id,'APPROVE',{reference:'first',amount_minor:4000}));await pause.reached;
 await resolve(id,'ANSWER',{reference:'second',amount_minor:3000});pause.release();const lost=await first;pause.restore();const s=state(id);
 ok('Concurrent different approvals record only the winning corrected answer',!lost.ok&&s.payments.length===1&&s.payments[0].amount_minor===3000&&s.decision.owner_decision==='ANSWER',s);
}
{
 const id=fixture();globalThis.__FAIL_SQL=/UPDATE owner_decisions SET status='RESOLVED'/;
 const failed=await attempt(resolve(id));globalThis.__FAIL_SQL=null;const s=state(id);
 ok('Failure closing decision rolls back the payment and order in the same batch',!failed.ok&&s.decision.status==='PENDING'&&s.payments.length===0&&s.order.status==='confirmed',s);
 await resolve(id);ok('Rolled-back decision can be retried safely',state(id).payments.length===1&&state(id).decision.status==='RESOLVED');
}
for(const amount of [0,-1,10001]){const id=fixture(),r=await attempt(resolve(id,'ANSWER',{amount_minor:amount})),s=state(id);ok('Invalid verified amount leaves no partial resolution: '+amount,!r.ok&&s.payments.length===0&&s.decision.status==='PENDING',s);}
{
 const id=fixture(),pause=pausePayment(),approval=attempt(resolve(id));await pause.reached;
 W.dbrun("UPDATE owner_decisions SET payload_json=?,updated_at=? WHERE id=?",[JSON.stringify({resolution:'payment_verification',order_id:id,suggested_amount_minor:1000}),new Date(Date.now()+1000).toISOString(),id]);
 pause.release();const result=await approval;pause.restore();const s=state(id);
 ok('Revised evidence invalidates an in-flight approval',!result.ok&&s.payments.length===0&&s.decision.status==='PENDING',s);
}
{
 const id=fixture(),pause=pausePayment(),approval=attempt(resolve(id));await pause.reached;
 const manual=await W.call('/api/orders/payments',{order_id:id,payment_kind:'deposit',method:'bank_transfer',amount_minor:2000,currency:'TOMAN',reference:'manual'});
 pause.release();const result=await approval;pause.restore();const s=state(id);
 ok('A competing manual ledger change invalidates stale balance',!result.ok&&s.payments.length===1&&s.payments[0].amount_minor===2000&&s.decision.status==='PENDING',{manual,s});
}
{
 const id=fixture();W.dbrun('UPDATE owner_decisions SET order_id=NULL WHERE id=?',[id]);await resolve(id);const s=state(id);
 ok('Historical payload-only order reference remains supported',s.payments.length===1&&s.decision.status==='RESOLVED',s);
}
ok('No real network calls',W.offNet().length===0,W.offNet());
process.exitCode=done()?1:0;
