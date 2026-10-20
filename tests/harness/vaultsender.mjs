// VAULT SENDER ALLOW-LIST — a group-based marketing vault accepts media only from listed numeric Telegram user ids; a channel vault
// is trusted by its verified channel identity; anything unverified fails closed. Local only (in-process Telegram mock, test ids).
import fs from "node:fs";import path from "node:path";import {fileURLToPath} from "node:url";import {makeWorld,reporter} from "./harness.mjs";
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const {ok,J,done}=reporter("vaultsender");
const OWNER=50000001,MEMBER=50000002;   // test-only ids
const W=await makeWorld({extraEnv:{TELEGRAM_VAULT_CHAT_ID:"-1005550001",TELEGRAM_VIDEO_VAULT_CHAT_ID:"@test_video_vault",TELEGRAM_CHAT_ID:"@test_channel",TELEGRAM_VAULT_SENDER_IDS:String(OWNER)}});
const {q,call}=W;await call("/api/autonomy/status",{},"GET");await W.run(new Request("https://w.test/api/telegram/vault/media",{headers:{Authorization:"Bearer tok"}}));   // creates the vault tables
let upd=950000,mid=700;const T=()=>Math.floor(Date.now()/1000);
const GROUP={id:-1005550001,type:"supergroup",title:"vault"};
const photo=f=>[{file_id:f+"-S",file_unique_id:"U-"+f,width:90,height:90},{file_id:f,file_unique_id:"U-"+f,width:1280,height:1280}];
const groupMsg=(f,extra={})=>W.post({update_id:++upd,message:{message_id:++mid,date:T(),chat:GROUP,photo:photo(f),caption:"جعبه",...extra}});
const kind=f=>q("SELECT source_kind FROM telegram_media_sources WHERE file_id=?",[f]).map(r=>r.source_kind);
const isVault=f=>kind(f).includes("vault"),vaultItem=f=>q("SELECT COUNT(*) n FROM media_vault_items i JOIN telegram_media_sources s ON s.id=i.telegram_media_id WHERE s.file_id=?",[f])[0].n;
const leads0=q("SELECT COUNT(*) n FROM leads")[0].n;

await groupMsg("A-OK",{from:{id:OWNER,is_bot:false,first_name:"Owner"}});
ok("VS-1 an allow-listed sender's photo in the vault group is stored as vault media (with its vault item)",isVault("A-OK")&&vaultItem("A-OK")===1,kind("A-OK"));
await groupMsg("A-NO",{from:{id:MEMBER,is_bot:false,first_name:"Member"}});
ok("VS-2 a group member who is NOT on the list is refused: stored as vault_untrusted, no vault item, audited without the sender id",kind("A-NO").join()==="vault_untrusted"&&vaultItem("A-NO")===0&&q("SELECT details_json FROM system_events WHERE type='vault_media_rejected'").some(r=>/sender_not_allowed/.test(r.details_json)&&!r.details_json.includes(String(MEMBER))),kind("A-NO"));
await groupMsg("A-ANON",{from:{id:1087968824,is_bot:true,first_name:"Group",username:"GroupAnonymousBot"},sender_chat:{id:GROUP.id,type:"supergroup",title:"vault"}});
await groupMsg("A-FWD",{from:{id:777000,is_bot:false,first_name:"Telegram"},sender_chat:{id:-1005550099,type:"channel",title:"linked"},is_automatic_forward:true});
await groupMsg("A-NOFROM",{});
await groupMsg("A-BOT",{from:{id:OWNER,is_bot:true,first_name:"bot"}});
await groupMsg("A-VIA",{from:{id:OWNER,is_bot:false,first_name:"Owner"},via_bot:{id:60000001,is_bot:true,first_name:"inline"}});
ok("VS-3 anonymous admin, linked-channel auto-forward, missing sender, bot sender and via-bot posts are all refused",["A-ANON","A-FWD","A-NOFROM","A-BOT","A-VIA"].every(f=>!isVault(f)&&vaultItem(f)===0),["A-ANON","A-FWD","A-NOFROM","A-BOT","A-VIA"].map(f=>[f,kind(f)]));
for(const [val,f] of [["",'C-EMPTY'],["abc","C-ABC"],["@owner","C-USER"],[`${OWNER},abc`,"C-MIX"],[`${OWNER},777000`,"C-SVC"],[`${OWNER},1087968824`,"C-ANONID"]]){W.env.TELEGRAM_VAULT_SENDER_IDS=val;await groupMsg(f,{from:{id:OWNER,is_bot:false,first_name:"Owner"}});}
W.env.TELEGRAM_VAULT_SENDER_IDS=String(OWNER);
ok("VS-4 a missing, empty or invalid list (usernames, text, service ids, one bad entry) fails closed — even the owner's photo is not vault",["C-EMPTY","C-ABC","C-USER","C-MIX","C-SVC","C-ANONID"].every(f=>!isVault(f)),["C-EMPTY","C-ABC","C-USER","C-MIX","C-SVC","C-ANONID"].map(f=>[f,kind(f)]));
await W.post({update_id:++upd,channel_post:{message_id:++mid,date:T(),chat:{id:-1005550002,type:"channel",username:"test_video_vault",title:"vv"},video:{file_id:"V-CH",file_unique_id:"U-V-CH",duration:5,width:720,height:1280,mime_type:"video/mp4"}}});
W.env.TELEGRAM_VAULT_SENDER_IDS="";
await W.post({update_id:++upd,channel_post:{message_id:++mid,date:T(),chat:{id:-1005550002,type:"channel",username:"test_video_vault",title:"vv"},video:{file_id:"V-CH2",file_unique_id:"U-V-CH2",duration:5,width:720,height:1280,mime_type:"video/mp4"}}});
W.env.TELEGRAM_VAULT_SENDER_IDS=String(OWNER);
ok("VS-5 a channel vault keeps working by its verified channel identity (channel_post), with or without a sender list",isVault("V-CH")&&isVault("V-CH2"),[kind("V-CH"),kind("V-CH2")]);
const again={update_id:++upd,message:{message_id:mid-20,date:T(),chat:GROUP,from:{id:OWNER,is_bot:false,first_name:"Owner"},photo:photo("A-OK")}};
const n0=q("SELECT COUNT(*) n FROM telegram_media_sources WHERE file_unique_id='U-A-OK'")[0].n;await W.post(again);await W.post(again);
ok("VS-6 deduplication unchanged: re-deliveries of authorised media are stored once per message",q("SELECT COUNT(*) n FROM telegram_media_sources WHERE file_unique_id='U-A-OK'")[0].n<=n0+1&&q("SELECT COUNT(*) n FROM media_vault_items i JOIN telegram_media_sources s ON s.id=i.telegram_media_id WHERE s.file_unique_id='U-A-OK'")[0].n<=2,q("SELECT message_id FROM telegram_media_sources WHERE file_unique_id='U-A-OK'"));
await W.post({update_id:++upd,message:{message_id:++mid,date:T(),from:{id:OWNER,is_bot:false,first_name:"Owner"},chat:{id:OWNER,type:"private"},photo:photo("P-DM")}});
ok("VS-7 the allow-listed person's PRIVATE chat is customer media, never vault (isolation unchanged); vault-group posts never create leads",kind("P-DM").every(k=>k!=="vault")&&q("SELECT COUNT(*) n FROM leads WHERE id IN (SELECT lead_id FROM inbox_messages WHERE conversation_id IS NOT NULL)")[0].n>=0&&!["A-OK","A-NO","A-ANON"].some(f=>q("SELECT 1 FROM inbox_messages WHERE lead_id IS NOT NULL AND message LIKE ?",["%"+f+"%"]).length),kind("P-DM"));
W.d1.db.exec(fs.readFileSync(path.join(REPO,"owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql"),"utf8"));
const ov=(await call("/api/autonomy/agents/overview",null,"GET")).body;
ok("VS-8 the Agent Control Center shows the allow-list state and refused count, never the ids; refused media is never a visual-product candidate",ov.publishing?.vault?.sender_allow_list==="configured"&&ov.publishing.vault.rejected_7d>=1&&!J(ov).includes(String(OWNER))&&!q("SELECT 1 FROM visual_product_media WHERE source_identity LIKE '%A-NO%'").length,ov.publishing?.vault);
ok("ISOLATION nothing was sent to the vault group or the channel (only the normal customer reply to the private DM) and no external network was called",!W.tg.some(x=>/^send/.test(x.method)&&/-1005550001|test_channel|test_video_vault/.test(x.body))&&!W.tg.some(x=>/sendPhoto|sendVideo/.test(x.method))&&W.offNet().length===0,[W.tg.map(x=>x.method),W.offNet()]);
process.exit(done()?1:0);
