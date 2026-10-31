// Release preflight (Phase 16.16-N) — READ ONLY. Checks one uploaded Worker version against the version-controlled Production
// configuration (worker/wrangler.toml) BEFORE anyone activates it with `wrangler versions deploy`. It never uploads, deploys,
// changes traffic or reads secret values (Cloudflare returns secret binding names only).
//
//   node scripts/release/preflight.mjs <version-uuid> [--expect-active <version-uuid>]
//
// Exit 0 = PASS, 1 = FAIL (do not activate), 2 = could not check. Wrangler: WRANGLER_JS, else the pinned 4.156.0 npx cache copy.
import fs from "node:fs";import path from "node:path";import {spawnSync} from "node:child_process";import {fileURLToPath,pathToFileURL} from "node:url";

const REPO=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
export const WORKER_NAME="hamzehi-social-ai";
// Secret binding names Production has carried since Phase 14 (names only; values are never read).
// TELEGRAM_WEBHOOK_SECRET_TOKEN: Phase 17.1 rotation (8c3de836, 2026-10-31); a version without it would fall back to the
// legacy D1 secret that Telegram no longer sends, so it is required, not optional.
export const REQUIRED_SECRETS=Object.freeze(["ADMIN_TOKEN","ANTHROPIC_API_KEY","GOOGLE_PLACES_API_KEY","KLING_API_KEY","OPENAI_API_KEY","SHOTSTACK_API_KEY","TELEGRAM_BOT_TOKEN","TELEGRAM_WEBHOOK_SECRET_TOKEN"]);

// Minimal reader for the parts of worker/wrangler.toml this check needs: [vars] strings, the D1 id, the R2 bucket, the AI binding.
export function expectedFromToml(text){
  const vars={},d1=[],r2=[];let ai=null,section="",cur=null;
  for(const raw of text.split(/\r?\n/)){const line=raw.replace(/\s+#.*$/,"").trim();if(!line||line.startsWith("#"))continue;
    const sec=/^\[\[?\s*([\w.]+)\s*\]\]?$/.exec(line);
    if(sec){section=sec[1];cur=section==="d1_databases"?(d1.push({}),d1[d1.length-1]):section==="r2_buckets"?(r2.push({}),r2[r2.length-1]):section==="ai"?(ai={}):null;continue;}
    const kv=/^([A-Za-z_][\w]*)\s*=\s*"([^"]*)"$/.exec(line);if(!kv)continue;
    if(section==="vars")vars[kv[1]]=kv[2];else if(cur)cur[kv[1]]=kv[2];}
  return {vars,d1,r2,ai};
}

// Pure check of `wrangler versions view --json` output. Returns {ok, failures[], summary}.
export function checkVersion(v,expected,{requiredSecrets=REQUIRED_SECRETS,requireTagSuffix="-orch-on"}={}){
  const f=[],b=v?.resources?.bindings||[],by=n=>b.find(x=>x.name===n);
  if(!v?.id)f.push("version not found");
  const tag=v?.annotations?.["workers/tag"]||null;
  if(!tag)f.push("version has no tag (automatic builds are never activated directly)");
  else if(requireTagSuffix&&!tag.endsWith(requireTagSuffix))f.push(`tag "${tag}" does not end with ${requireTagSuffix}`);
  if(by("AUTONOMY_ORCHESTRATOR")?.text!=="on")f.push("AUTONOMY_ORCHESTRATOR is not \"on\"");
  for(const [k,val] of Object.entries(expected.vars)){const x=by(k);if(!x)f.push(`var ${k} missing`);else if(x.type!=="plain_text"||x.text!==val)f.push(`var ${k} differs from worker/wrangler.toml`);}
  for(const d of expected.d1){const x=by(d.binding);if(!x||x.type!=="d1"||(x.id||x.database_id)!==d.database_id)f.push(`D1 ${d.binding} is not ${d.database_id}`);}
  for(const r of expected.r2){const x=by(r.binding);if(!x||x.type!=="r2_bucket"||x.bucket_name!==r.bucket_name)f.push(`R2 ${r.binding} is not ${r.bucket_name}`);}
  if(expected.ai?.binding&&by(expected.ai.binding)?.type!=="ai")f.push(`AI binding ${expected.ai.binding} missing`);
  for(const s of requiredSecrets)if(by(s)?.type!=="secret_text")f.push(`secret binding ${s} missing`);
  const known=new Set([...Object.keys(expected.vars),...expected.d1.map(d=>d.binding),...expected.r2.map(r=>r.binding),expected.ai?.binding,...requiredSecrets]);
  for(const x of b)if(!known.has(x.name))f.push(`unexpected binding ${x.name} (${x.type})`);
  return {ok:!f.length,failures:f,summary:{id:v?.id||null,tag,bindings:b.length}};
}

async function main(argv){
  const id=argv[0],ia=argv.indexOf("--expect-active"),expectActive=ia>=0?argv[ia+1]:null;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id||"")){console.error("usage: preflight.mjs <full version uuid> [--expect-active <uuid>]");return 2;}
  const WJS=process.env.WRANGLER_JS||path.join(process.env.LOCALAPPDATA||"","npm-cache","_npx","32026684e21afda6","node_modules","wrangler","bin","wrangler.js");
  const READ=new Set(["versions view","deployments status"]);
  const w=args=>{if(!READ.has(args.slice(0,2).join(" ")))throw Error("read-only commands only");
    const r=spawnSync(process.execPath,[WJS,...args,"--name",WORKER_NAME,"--json"],{encoding:"utf8",timeout:120000,cwd:process.env.TEMP||REPO});
    const o=r.stdout||"";try{return JSON.parse(o.slice(o.indexOf("{")));}catch{return null;}};
  const expected=expectedFromToml(fs.readFileSync(path.join(REPO,"worker/wrangler.toml"),"utf8"));
  const v=w(["versions","view",id]);if(!v){console.error("could not read the version");return 2;}
  const res=checkVersion(v,expected);
  const st=w(["deployments","status"]);const active=(st?.versions||[]).map(x=>`${x.version_id}@${x.percentage}`);
  if(!st)res.failures.push("could not read the active deployment");
  else if(expectActive&&!(st.versions.length===1&&st.versions[0].version_id===expectActive&&st.versions[0].percentage===100))res.failures.push(`active deployment is ${active.join(" ")}, expected ${expectActive}@100`);
  res.ok=!res.failures.length;
  console.log(JSON.stringify({result:res.ok?"PASS":"FAIL",...res.summary,active_deployment:active,failures:res.failures},null,1));
  return res.ok?0:1;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)process.exit(await main(process.argv.slice(2)));
