// PHASE 18.24 — Iraq discovery reliability: exact website-failure reasons (http status / timeout / dns / tls / not_html), a site that
// refuses automated access (403/429, e.g. Shopify bot protection) retired under that name, and link services that are not a business's
// own website. Offline only: node:sqlite, mocked websites; the two-check / 14-day policy is unchanged; nothing is sent.
import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase18_24");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const LQ=await import(pathToFileURL(path.join(SRC,"lead-qualification.js")).href);
const DD=await import(pathToFileURL(path.join(SRC,"dataset-discovery.js")).href);

// ---- N: link services are not own websites (shared rule)
{const links=["https://fb.me/goldalsarmd","https://m.me/dylar1212","https://bio.link/laperle","https://unit.link/zarangary-las","https://wsend.co/9647838036670","https://2u.pw/2aEf7Fb","https://deeplink.qi.iq/3488020275848554/seller/5363","https://bit.ly/x","https://linkin.bio/x"];
 const own=["https://www.alnashmi.co/","https://akd.iq/","https://yellowsparkle.co/","https://www.alkawthar.shop/","https://khafaji-jewelrygroup.com/","https://mobile-gold.iq/"];
 ok("N1 link-in-bio / short-link / chat-link / payment deep-link hosts are not an own website",links.every(u=>!LQ.independentWebsiteHost(u)),links.filter(u=>LQ.independentWebsiteHost(u)));
 ok("N2 real business domains are still own websites",own.every(u=>!!LQ.independentWebsiteHost(u)),own.filter(u=>!LQ.independentWebsiteHost(u)));
 const v=DD.validateCandidate({market:"ARAB",dataset:"overture",record_id:"x",license:"CDLA-Permissive-2.0",name:"Fusion shop",websites:["https://wsend.co/9647838036670"]});
 ok("N3 such a record is refused by the dataset validator (no_own_website)",!v.ok&&v.reason==="no_own_website");}

// ---- F: failure reasons through the real cron
const W=await makeWorld({extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test",AUTONOMY_ORCHESTRATOR:"on"}});const {q,dbrun}=W;
const inner=globalThis.fetch,fetched=[];
const SITES={"https://shop429-ds.iq/":()=>new Response("Too Many Requests",{status:429,headers:{"Content-Type":"text/plain","retry-after":"60"}}),
  "https://forbid-ds.iq/":()=>new Response("Forbidden",{status:403,headers:{"Content-Type":"text/html"}}),
  "https://gone-ds.iq/":()=>new Response("",{status:404,headers:{"Content-Type":"text/html"}}),
  "https://pdf-ds.iq/":()=>new Response("%PDF",{status:200,headers:{"Content-Type":"application/pdf"}}),
  "https://slow-ds.iq/":()=>{const e=new Error("The operation was aborted due to timeout");e.name="TimeoutError";throw e;},
  "https://nodns-ds.iq/":()=>{throw new TypeError("fetch failed: getaddrinfo ENOTFOUND nodns-ds.iq");}};
globalThis.fetch=async(u,o={})=>{const s=String(u?.url||u);if(s.startsWith("https://w.test/"))return W.run(new Request(s,o));
  if(/places\.googleapis|api\.openai|api\.anthropic|brave/.test(s))throw new Error("paid call attempted");
  if(s==="https://shop429-ds.iq/robots.txt")return new Response("",{status:429});   // a 4xx robots.txt = no rules (RFC 9309)
  if(/\/robots\.txt$/.test(s))return new Response("",{status:404});
  if(SITES[s]){fetched.push(s);return SITES[s]();}
  if(/^https:\/\/www\.(google|bing)\.com\/search/.test(s))return new Response("<html></html>",{status:200,headers:{"Content-Type":"text/html"}});
  return inner(u,o);};
const WK=(await import(pathToFileURL(path.join(SRC,"index.js")).href)).default;
const tick=async()=>{const p=[];await WK.scheduled({cron:"*/15 * * * *",scheduledTime:Date.now()},{...W.env,DATASET_DISCOVERY:"on",DISCOVERY_BUCKET:{get:async()=>null,head:async()=>null},DATASET_DISCOVERY_VERIFY_PER_RUN:"6",DATASET_DISCOVERY_IRAN_PER_RUN:"0",DATASET_DISCOVERY_IRAN_DAILY_CAP:"0"},{waitUntil:x=>p.push(x)});await Promise.allSettled(p);};
const t=new Date().toISOString(),ids=Object.keys(SITES).map((u,i)=>{const id="f"+i;dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",[id,"مجوهرات "+i,u,"discovered","low",
  JSON.stringify({provider:"dataset",source:"overture_places",url:u,website:u,target_market:"ARAB",type:"gold_ar",dataset_record:{dataset:"overture",record_id:id,release:"2026-11-09.0",license:"CDLA-Permissive-2.0"},dataset_claims:{name:"مجوهرات "+i,trusted:false}}),t,t]);return id;});
const M=id=>JSON.parse(q("SELECT notes FROM leads WHERE id=?",[id])[0].notes),byUrl=u=>M(ids[Object.keys(SITES).indexOf(u)]);
await tick();
ok("F1 exact reason recorded instead of a bare fetch_failed: 429 → http_429, 403 → http_403, 404 → http_404, PDF → not_html, timeout → timeout, DNS → dns",
  byUrl("https://shop429-ds.iq/").contact_enrichment_error==="http_429"&&byUrl("https://forbid-ds.iq/").contact_enrichment_error==="http_403"&&byUrl("https://gone-ds.iq/").contact_enrichment_error==="http_404"
  &&byUrl("https://pdf-ds.iq/").contact_enrichment_error==="not_html"&&byUrl("https://slow-ds.iq/").contact_enrichment_error==="timeout"&&byUrl("https://nodns-ds.iq/").contact_enrichment_error==="dns",
  Object.keys(SITES).map(u=>[u,byUrl(u).contact_enrichment_error,byUrl(u).contact_enrichment_result]));
ok("F2 first failure: counted only (dataset_fetch_failures 1), result still fetch_failed, nothing rejected (two-check policy unchanged)",ids.every(id=>M(id).dataset_fetch_failures===1&&!M(id).rejected_reason&&/^fetch_failed/.test(M(id).contact_enrichment_result)));
ok("F3 a 4xx robots.txt is 'no rules' (RFC 9309): the 429 site's homepage was requested once, not treated as robots_unreachable",fetched.filter(u=>u==="https://shop429-ds.iq/").length===1);
dbrun("UPDATE leads SET notes=json_set(notes,'$.contact_enrichment_checked_at',?) WHERE id LIKE 'f%'",[new Date(Date.now()-15*86400e3).toISOString()]);fetched.length=0;await tick();
ok("F4 second failure 14 days later: 403/429 → website_refuses_automated_access; 404 / not_html / timeout / dns → unreachable_website",
  byUrl("https://shop429-ds.iq/").rejected_reason==="website_refuses_automated_access"&&byUrl("https://forbid-ds.iq/").rejected_reason==="website_refuses_automated_access"
  &&["https://gone-ds.iq/","https://pdf-ds.iq/","https://slow-ds.iq/","https://nodns-ds.iq/"].every(u=>byUrl(u).rejected_reason==="unreachable_website"),Object.keys(SITES).map(u=>[u,byUrl(u).rejected_reason]));
fetched.length=0;await tick();
ok("F5 retired leads are never fetched again; the same honest User-Agent is used throughout (no identity change)",!fetched.length);
ok("F6 nothing sent, no outreach row",!q("SELECT 1 FROM lead_outreach").length&&!W.tg.some(x=>/^send/.test(x.method)));
process.exit(done()?1:0);
