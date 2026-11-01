// PHASE 18.21 — dataset credits on the dashboard + release guard (discovery can never be switched on with unapproved attribution).
// Offline only: node:sqlite, nothing sent.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase18_21");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const DD=await import(pathToFileURL(path.join(SRC,"dataset-discovery.js")).href);
const PF=await import(pathToFileURL(path.join(REPO,"scripts/release/preflight.mjs")).href);
const DASH=await import(pathToFileURL(path.join(SRC,"live-dashboard-page.js")).href);

// ---- G: release guard
const gate=(toml,approved,attr)=>{const v=PF.expectedFromToml(toml).vars;if(v.DATASET_DISCOVERY!=="on")return true;
  return approved===true&&/All rights reserved\./.test(attr.en)&&/places-notice-txt/.test(attr.en)&&/openstreetmap\.org\/copyright/.test(attr.en)&&/Overture/.test(attr.en)&&!!attr.fa;};
const toml=fs.readFileSync(path.join(REPO,"worker/wrangler.toml"),"utf8");
ok("G1 the committed configuration passes the guard: discovery is on only with approved attribution containing the Foursquare notice, the NOTICE link and the OSM copyright link",
  gate(toml,DD.DATASET_ATTRIBUTION_APPROVED,DD.DATASET_ATTRIBUTION),{flag:PF.expectedFromToml(toml).vars.DATASET_DISCOVERY,approved:DD.DATASET_ATTRIBUTION_APPROVED});
const onToml=toml.replace(/^DATASET_DISCOVERY = "(off|on)"/m,'DATASET_DISCOVERY = "on"'),offToml=toml.replace(/^DATASET_DISCOVERY = "(off|on)"/m,'DATASET_DISCOVERY = "off"');
const good={en:"Overture Maps Foundation … Copyright 2024 Foursquare Labs, Inc. All rights reserved. … https://opensource.foursquare.com/places-notice-txt/ … © OpenStreetMap contributors (https://www.openstreetmap.org/copyright)",fa:"…"};
ok("G2 an activation config is refused while the text is unapproved, or approved but missing a required notice; accepted when approved and complete",
  gate(offToml,false,good)&&!gate(onToml,false,good)&&!gate(onToml,true,{en:"Overture Maps Foundation only, no Foursquare or OSM notice",fa:"x"})&&gate(onToml,true,DD.DATASET_ATTRIBUTION)&&!gate(onToml,true,{...good,en:good.en.replace("All rights reserved.","")})&&gate(onToml,true,good));
ok("G3 activation configuration: attribution approved, DATASET_DISCOVERY=\"on\" IRAQ only (ARAB 1/run, 10/day; IRAN 0/0 disabled; 2 checks/run)",DD.DATASET_ATTRIBUTION_APPROVED===true&&PF.expectedFromToml(toml).vars.DATASET_DISCOVERY==="on"
  &&PF.expectedFromToml(toml).vars.DATASET_DISCOVERY_ARAB_PER_RUN==="1"&&PF.expectedFromToml(toml).vars.DATASET_DISCOVERY_ARAB_DAILY_CAP==="10"&&PF.expectedFromToml(toml).vars.DATASET_DISCOVERY_IRAN_PER_RUN==="0"&&PF.expectedFromToml(toml).vars.DATASET_DISCOVERY_IRAN_DAILY_CAP==="0"&&PF.expectedFromToml(toml).vars.DATASET_DISCOVERY_VERIFY_PER_RUN==="2");

// ---- A: API credits only when dataset leads are present
const W=await makeWorld({});const {call,dbrun}=W;
const si=async()=>(await call("/api/sales/intelligence?limit=10",null,"GET")).body;
const t=new Date().toISOString();
dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",["g1","Google lead","","discovered","low",JSON.stringify({provider:"google_places_ids",place_id:"ChIJx",target_market:"IRAN"}),t,t]);
const a0=await si();
ok("A1 no dataset lead → dataset_attribution is null (no credits card)",a0.ok&&a0.dataset_attribution===null,a0.dataset_attribution);
dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",["d1","طلافروشی آزمون","https://azmun.ir/","discovered","low",JSON.stringify({provider:"dataset",url:"https://azmun.ir/",target_market:"IRAN",dataset_record:{dataset:"overture",record_id:"x",release:"2026-11-01.0",license:"CDLA-Permissive-2.0"}}),t,t]);
const a1=await si();
ok("A2 with a dataset lead → the attribution object (EN + FA) is returned unchanged",a1.ok&&a1.dataset_attribution?.en===DD.DATASET_ATTRIBUTION.en&&a1.dataset_attribution?.fa===DD.DATASET_ATTRIBUTION.fa);
ok("A3 the owner-decision statement and markets are unchanged (IRAN TOMAN, ARAB USD)",/stay with the owner/.test(a1.owner_decisions)&&a1.markets.IRAN.currency==="TOMAN"&&a1.markets.ARAB.currency==="USD");

// ---- D: dashboard renders the card and its client script still parses
const html=String(DASH.liveDashboardHtml?.(...[])??"");
const scripts=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>s.trim());
let parseErr=null;for(const s of scripts){try{new Function(s);}catch(e){parseErr=String(e);break;}}
ok("D1 the dashboard page contains the data-sources card bound to dataset_attribution, and every inline script parses",
  html.includes("d.dataset_attribution")&&html.includes("منابع داده")&&scripts.length>0&&!parseErr,parseErr||{scripts:scripts.length,len:html.length});
ok("D2 the credits are rendered escaped (no raw HTML injection from the text)",/esc\(d\.dataset_attribution\.fa\)/.test(html)&&/esc\(d\.dataset_attribution\.en\)/.test(html));
process.exit(done()?1:0);
