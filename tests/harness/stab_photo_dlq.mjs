// FINAL STABILIZATION — two old photo dead letters and their Watchdog alert, on synthetic data. Proves the existing owner path
// (Cleanup → DLQ → move to Trash = dismiss) closes them without replaying anything, the alert then recovers by itself, and both
// come back on restore. A read-only dead letter is the control for automatic recovery.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("stab_photo_dlq");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const {runWatchdog}=await import(pathToFileURL(path.join(SRC,"agent-watchdog.js")).href);
const W=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on"}});
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
for(const p of ["/api/autonomy/status","/api/autonomy/tasks","/api/agents/overview"])await W.call(p,null,"GET");
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/phase25-delete-system/01-migration.sql"),"utf8"));
const fill=(t,o)=>{for(const c of W.q(`SELECT name,"notnull" nn,dflt_value d,type FROM pragma_table_info('${t}')`).filter(k=>k.nn&&k.d===null))if(!(c.name in o))o[c.name]=/INT|REAL/.test(c.type)?1:"x"+o.id;const k=Object.keys(o);W.dbrun(`INSERT INTO ${t}(${k.join(",")}) VALUES(${k.map(()=>"?").join(",")})`,k.map(x=>o[x]));};
const D=n=>new Date(Date.now()-n*86400000).toISOString();
for(const [id,days,err] of [["ph1",16,"timed out after 30000 ms"],["ph2",11,"timed out after 55000 ms"]]){
 fill("autonomy_tasks",{id,module:"photo",action:"photo_generate",status:"failed",error:err,created_at:D(days),updated_at:D(days),finished_at:D(days),payload_json:"{}"});
 fill("agent_dead_letters",{id:"dl-"+id,run_id:"run-"+id,task_id:id,agent:"autonomy:photo",state:"timed_out",attempts:1,error_redacted:err,created_at:D(days)});}
// control: a read-only task's dead letter is recovered automatically
fill("autonomy_tasks",{id:"rd1",module:"revenue",action:"funnel_snapshot",status:"failed",error:"x",created_at:D(3),updated_at:D(3),finished_at:D(3),payload_json:"{}"});
fill("agent_dead_letters",{id:"dl-rd1",run_id:"run-rd1",task_id:"rd1",agent:"autonomy:revenue",state:"failed",attempts:1,error_redacted:"x",created_at:D(3)});
const n=(sql,a=[])=>W.q(sql,a)[0].n;
const photoQueued=()=>n("SELECT COUNT(*) n FROM autonomy_tasks WHERE module='photo' AND status IN ('queued','running')");
const alert=()=>W.q("SELECT recovery_state s,affected_tasks_json t FROM agent_alerts WHERE code='dead_letter_unresolved' AND agent='autonomy:photo' ORDER BY first_seen_at DESC LIMIT 1")[0];
const net0=W.net.length;
const r1=await runWatchdog(W.env,{orchestratorOn:true});
ok("D1 the Watchdog raises dead_letter_unresolved for the two photo letters",alert()?.s==="open"&&JSON.parse(alert().t).sort().join()==="ph1,ph2",{r:r1.alerts,a:alert()});
ok("D2 it never re-queues a photo task (paid)",photoQueued()===0&&n("SELECT COUNT(*) n FROM autonomy_tasks WHERE id IN ('ph1','ph2') AND status='failed'")===2);
ok("D3 control: the read-only letter is recovered automatically",W.q("SELECT status s FROM autonomy_tasks WHERE id='rd1'")[0].s==="queued"&&W.q("SELECT resolution r FROM agent_dead_letters WHERE id='dl-rd1'")[0].r==="retried",r1.auto_retried);
ok("D4 a second Watchdog run keeps the alert open and still replays nothing",(await runWatchdog(W.env,{orchestratorOn:true}))&&alert()?.s==="open"&&photoQueued()===0);
// the existing owner path: Cleanup → DLQ → move to Trash, which records "dismissed"
const pv=b=>W.call("/api/cleanup/preview",{action:"trash",scope:"ids",...b}).then(r=>r.body),ex=(t,c)=>W.call("/api/cleanup/execute",{token:t,confirm:c}).then(r=>r.body);
const items=await W.call("/api/cleanup/items?section=dlq&view=active&limit=50",null,"GET").then(r=>r.body);
ok("D5 both photo letters are listed and not protected",["dl-ph1","dl-ph2"].every(id=>(items.items||[]).some(x=>x.id===id&&!x.block)),items.items?.map(x=>[x.id,x.block]));
const p=await pv({section:"dlq",ids:["dl-ph1","dl-ph2"]});ok("D6 the preview counts 2",p.count===2,p.summary);
const x=await ex(p.token,p.confirm_phrase||undefined);ok("D7 executed",x.result?.done===2,x);
ok("D8 both are dismissed, with the time and the owner",n("SELECT COUNT(*) n FROM agent_dead_letters WHERE id IN ('dl-ph1','dl-ph2') AND resolution='dismissed' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL")===2);
ok("D9 the task rows and their errors are kept",W.q("SELECT id,status,error FROM autonomy_tasks WHERE id IN ('ph1','ph2') ORDER BY id").map(r=>r.status+":"+r.error).join("|")==="failed:timed out after 30000 ms|failed:timed out after 55000 ms");
ok("D10 nothing re-queued",photoQueued()===0);
await runWatchdog(W.env,{orchestratorOn:true});ok("D11 the next Watchdog run marks the alert recovered",alert()?.s==="recovered",alert());
const ai=await W.call("/api/cleanup/items?section=alerts&view=active&limit=50",null,"GET").then(r=>r.body),row=(ai.items||[]).find(x=>x.title==="dead_letter_unresolved"&&x.sub==="autonomy:photo");
ok("D12 the recovered alert can now be moved to Trash; an open one could not",row&&!row.block,row);
// restore brings everything back
const rp=await W.call("/api/cleanup/preview",{action:"restore",scope:"ids",section:"dlq",ids:["dl-ph1","dl-ph2"]}).then(r=>r.body);const rx=await ex(rp.token,rp.confirm_phrase||undefined);
ok("D13 restore reopens both letters",rx.result?.done===2&&n("SELECT COUNT(*) n FROM agent_dead_letters WHERE id IN ('dl-ph1','dl-ph2') AND resolved_at IS NULL")===2,rx);
await runWatchdog(W.env,{orchestratorOn:true});ok("D14 and the Watchdog raises the alert again, still without replay",alert()?.s==="open"&&photoQueued()===0);
ok("D15 no outbound call at any step",W.net.slice(net0).filter(u=>!/^https:\/\/api\.telegram\.org\/bot\*\*\*\//.test(u)).length===0,W.net.slice(net0));
done();
