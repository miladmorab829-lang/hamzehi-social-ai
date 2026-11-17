// CLAIM-VALIDATION — local-only test of the DRAFT owner-case migration (owner-actions/claimval-processing-failed). In-memory SQLite;
// the current owner_escalations schema is taken verbatim from the Worker source. No Production D1, no network.
import fs from "node:fs";import path from "node:path";import {fileURLToPath} from "node:url";import {DatabaseSync} from "node:sqlite";
import {reporter} from "./harness.mjs";
const {ok,done}=reporter("claimval_processing_failed_migration");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const src=fs.readFileSync(path.join(SRC,"index.js"),"utf8");
const schema=eval(src.match(/const OWNER_ESCALATION_SCHEMA=(\[[\s\S]*?\n\]);/)[1]);
const db=new DatabaseSync(":memory:");for(const sql of schema)db.exec(sql);
const t="2026-11-12T00:00:00.000Z";
const ins=(id,reason,extra={})=>db.prepare("INSERT INTO owner_escalations(id,escalation_key,lead_id,conversation_id,contact_id,channel,source_message_id,sales_brain_event_id,context_summary,unresolved_question,reason_code,decision_required,status,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id,'k-'+id,'lead1','conv1',null,'telegram',extra.source||('m-'+id),'ev-'+id,'ctx','q',reason,'decide','open',1,t,t);
ins('a','unsupported_factual_claim');ins('b','uncertain_shipping');
let pre=false;try{ins('x','processing_failed');}catch{pre=true;}
ok('Before migration the current schema rejects processing_failed',pre);
db.exec(fs.readFileSync(path.join(REPO,"owner-actions/claimval-processing-failed/02-migration-draft.sql"),"utf8"));
ok('Existing rows preserved exactly',db.prepare("SELECT id,reason_code FROM owner_escalations ORDER BY id").all().map(r=>r.id+':'+r.reason_code).join(',')==='a:unsupported_factual_claim,b:uncertain_shipping');
let okInsert=true;try{ins('c','processing_failed',{source:'m-lost'});}catch(e){okInsert=false;}
ok('After migration processing_failed is accepted',okInsert);
let dup=false;try{ins('d','processing_failed',{source:'m-lost'});}catch{dup=true;}
ok('One open case per message and reason (idempotent retry)',dup);
let bad=false;try{ins('e','not_a_reason');}catch{bad=true;}
ok('Unknown reason codes are still rejected',bad);
let del=false;try{db.exec("DELETE FROM owner_escalations WHERE id='a'");}catch{del=true;}
ok('No-delete trigger still protects history',del);
const names=db.prepare("SELECT name FROM sqlite_master WHERE tbl_name='owner_escalations' AND type IN ('index','trigger') ORDER BY name").all().map(r=>r.name);
ok('All indexes and the trigger are recreated',['idx_owner_escalations_conversation','idx_owner_escalations_open','idx_owner_escalations_open_source_reason','owner_escalations_no_delete'].every(n=>names.includes(n)),names);
done();
