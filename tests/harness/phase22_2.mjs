// PHASE 22.2 — every catalog and price-list change needs a read-only preview, the owner's explicit confirmation and that preview's hash:
// the direct knowledge route (SAVE NEW VERSION / retire), owner decisions that save knowledge, and the live price list. Owner operations
// that are not catalog changes keep working unchanged. Local only: in-process mocks, fake test products; nothing reaches Production.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase22_2");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const W=await makeWorld({aiBrain:"off"});const {q,dbrun,call}=W;
await call("/api/quotes",null,"GET");await call("/api/si/knowledge/product",null,"GET");
const T="2026-10-01T00:00:00.000Z";
const tables=()=>q("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").map(r=>r.name);
const snap=()=>JSON.stringify(q("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"))+JSON.stringify(tables().filter(n=>n!=="api_rate_limits").map(n=>[n,q(`SELECT * FROM "${n}"`)]));
const K=k=>`/api/si/knowledge/${k}`;
const preview=async(k,input,extra={})=>(await call(K(k)+"/preview",{input,...extra})).body;
const gated=async(k,input,extra={})=>{const p=await preview(k,input,extra);if(!p.ok)throw Error("preview failed "+JSON.stringify(p));const r=await call(K(k),{input,...extra,confirm_owner_approved:true,preview_hash:p.preview_hash});if(!r.body.ok)throw Error("save failed "+JSON.stringify(r.body));return r.body;};
const product={name:"علبة بوابة"},attr={product_key:"علبة_بوابة",attribute_key:"box_type",label:"box",attribute_kind:"box_type",required:true,commercial_critical:true,allowed_values:["قطعتين"]};

// ---- the direct route: SAVE NEW VERSION
{const before=snap(),p=await preview("product",product);
 ok("E1 preview of a direct save is read-only and reports what would change",p.ok&&p.op==="create"&&p.requires_owner_approval===true&&p.writes===0&&snap()===before,p);
 const none=await call(K("product"),{input:product});
 const flag=await call(K("product"),{input:product,confirm_owner_approved:true});
 const hash=await call(K("product"),{input:product,preview_hash:p.preview_hash});
 const text=await call(K("product"),{input:product,confirm_owner_approved:"true",preview_hash:p.preview_hash});
 const other=await call(K("product"),{input:{name:"علبة أخرى"},confirm_owner_approved:true,preview_hash:p.preview_hash});
 ok("E2 a direct save is refused without confirmation, without a hash, with a non-literal flag, and for anything but the previewed input",[none,flag,hash,text,other].every(r=>r.status===409&&r.body.ok===false)&&snap()===before,[none,flag,hash,text,other].map(r=>r.body));
 const anon=await W.run(new Request("https://w.test"+K("product")+"/preview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({input:product})}));
 ok("E3 preview needs the admin token too",anon.status===401,anon.status);
 const r=await call(K("product"),{input:product,confirm_owner_approved:true,preview_hash:p.preview_hash});
 ok("E4 with the exact preview's hash the save works, and the approval method is audited",r.body.ok&&q("SELECT COUNT(*) n FROM product_catalog WHERE status='current'")[0].n===1&&q("SELECT details_json FROM system_events WHERE type='knowledge_version_saved' ORDER BY created_at DESC LIMIT 1")[0].details_json.includes("knowledge_preview"),r.body);}
await gated("attribute",attr);
const cfg=await gated("configuration",{product_key:attr.product_key,market:"*",attributes:{box_type:"قطعتين"}}),configKey=cfg.row.config_key;
const price=(unit,market="ARAB",currency="USD")=>({market,product_key:attr.product_key,config_key:configKey,currency,unit_price_minor:unit,moq:100});
{const a=await call(K("price")+"/preview",{input:price(100,"ARAB","TOMAN")}),b=await call(K("price")+"/preview",{input:price(100,"IRAN","USD")}),c=await call(K("price")+"/preview",{input:price(100,"IRAN","EUR")});
 ok("E5 Iraq only USD and Iran only TOMAN, already at preview",[a,b,c].every(r=>r.body.ok===false&&/Locked currency|TOMAN|USD/.test(r.body.error)),[a.body,b.body,c.body]);
 const first=await gated("price",price(250));const p1=await preview("price",price(260));
 await gated("price",price(270));
 const stale=await call(K("price"),{input:price(260),confirm_owner_approved:true,preview_hash:p1.preview_hash});
 ok("E6 a preview goes stale when the row it was based on has changed",stale.status===409&&/preview it again/.test(stale.body.error)&&q("SELECT unit_price_minor FROM price_versions WHERE status='current' AND market='ARAB'")[0].unit_price_minor===270,stale.body);
 const LIST="INSERT INTO commercial_price_items(id,product_key,product_name,sku,market,currency,unit_price_minor,moq,version,active,effective_from,effective_until,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
 const p2=await preview("price",price(280));
 dbrun(LIST,["G1","gate-1","علبة بوابة · 9x9x9 · قطعتين",null,"ARAB","USD",200,null,1,1,null,null,"admin",T,T,T]);
 const stale2=await call(K("price"),{input:price(280),confirm_owner_approved:true,preview_hash:p2.preview_hash});
 ok("E7 a preview goes stale when the live price list for that product has changed",stale2.status===409,stale2.body);
 ok("E8 preview shows the price-list rows the change would replace",(await preview("price",price(280))).price_list_rows.length===1);
 const unchanged=await gated("price",price(270));
 ok("E9 re-saving identical data creates no new version",unchanged.idempotent===true&&q("SELECT COUNT(*) n FROM price_versions")[0].n===2,unchanged);}

// ---- retire
{const row=q("SELECT id FROM price_versions WHERE status='current' AND market='ARAB'")[0],before=snap();
 const none=await call(K("price")+"/retire",{id:row.id});
 ok("E10 retire is refused without an approved preview",none.status===409&&snap()===before,none.body);
 const p=(await call(K("price")+"/retire/preview",{id:row.id})).body;
 ok("E11 retire preview is read-only",p.ok&&p.op==="retire"&&snap()===before,p);
 const r=await call(K("price")+"/retire",{id:row.id,confirm_owner_approved:true,preview_hash:p.preview_hash});
 ok("E12 retire works with the approved preview, keeping history",r.body.ok&&q("SELECT status FROM price_versions WHERE id=?",[row.id])[0].status==="retired",r.body);}

// ---- operations that are not catalog changes keep working
{const pay=await call(K("setting"),{input:{setting_key:"payment_instructions",scope:{market:"ARAB"},value:"test only"}});
 const dep=await call(K("setting"),{input:{setting_key:"deposit_percent",scope:{market:"ARAB"},value:50}});
 ok("E13 deposit and payment settings are commercial: a save without the preview is refused",pay.status===409&&dep.status===409,[pay.body,dep.body]);
 const list=await call(K("price")+"?status=all",null,"GET");ok("E14 listing history still works",list.body.ok&&list.body.items.length>=2,list.body.ok);
 const tier=await call(K("setting"),{input:{setting_key:"quantity_tier_policy",scope:"global",value:"RANGE"}});
 ok("E15 a commercial rule such as the tier policy is gated like a price",tier.status===409,tier.body);
 const t2=await gated("setting",{setting_key:"quantity_tier_policy",scope:"global",value:"RANGE"});ok("E16 and works through preview and confirmation",t2.ok);}

// ---- nothing can bypass it from inside the code
{const SI=await import(pathToFileURL(path.join(SRC,"sales-intelligence.js")).href);
 const fail=async f=>{try{await f();return null;}catch(e){return String(e.message);}};
 const a=await fail(()=>SI.saveKnowledgeVersion(W.env,"product",{name:"علبة سرية"},{actor:"code"}));
 const b=await fail(()=>SI.saveKnowledgeVersion(W.env,"product",{name:"علبة سرية"},{actor:"code",approval:{method:"x"}}));
 const row=q("SELECT id FROM product_catalog WHERE status='current'")[0],c=await fail(()=>SI.retireKnowledge(W.env,"product",row.id,"code"));
 ok("E17 saveKnowledgeVersion and retireKnowledge refuse a catalog change with no recorded approval, whoever calls them",[a,b,c].every(x=>/Owner approval is required/.test(x||"")),[a,b,c]);
 const src=fs.readFileSync(path.join(SRC,"sales-intelligence.js"),"utf8"),calls=[...src.matchAll(/saveKnowledgeVersion\(env,[^\n]*/g)].map(m=>m[0]).filter(l=>!l.startsWith("saveKnowledgeVersion(env,kind,input,{actor=")),bad=calls.filter(l=>!/saveOpts|approval/.test(l));
 ok("E18 every call in the code passes an approval",calls.length>=8&&!bad.length,bad.map(x=>x.slice(0,70)));}

// ---- owner decisions that save knowledge
const decision=(id,payload,extra={})=>dbrun("INSERT INTO owner_decisions(id,status,decision_type,fingerprint,market,product_key,question,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",[id,"PENDING",extra.type||"PRICE_REQUIRED","fp-"+id,"ARAB",attr.product_key,"q",JSON.stringify(payload),T,T]);
const resolve=(id,scope,answer,extra={})=>call("/api/si/decisions/resolve",{id,action:"ANSWER",scope,answer,...extra});
const dPreview=(id,scope,answer)=>call("/api/si/decisions/preview",{id,action:"ANSWER",scope,answer}).then(r=>r.body);
{decision("D1",{resolution:"price",config_key:configKey});const before=snap(),ans={unit_price_minor:333,quantity_min:1};
 const p=await dPreview("D1","SAVE_AS_KNOWLEDGE",ans);
 ok("F1 decision preview is read-only and says it writes the catalog",p.ok&&p.writes_catalog===true&&snap()===before,p);
 const none=await resolve("D1","SAVE_AS_KNOWLEDGE",ans);
 ok("F2 saving a price from a decision is refused without an approved preview, and the decision stays open",none.body.ok===false&&q("SELECT status FROM owner_decisions WHERE id='D1'")[0].status==="PENDING"&&snap()===before,none.body);
 const changed=await resolve("D1","SAVE_AS_KNOWLEDGE",{unit_price_minor:999,quantity_min:1},{confirm_owner_approved:true,preview_hash:p.preview_hash});
 ok("F3 a hash for one answer cannot approve a different answer",changed.body.ok===false&&snap()===before,changed.body);
 dbrun("UPDATE owner_decisions SET updated_at=? WHERE id='D1'",["2026-10-02T00:00:00.000Z"]);
 const stale=await resolve("D1","SAVE_AS_KNOWLEDGE",ans,{confirm_owner_approved:true,preview_hash:p.preview_hash});
 ok("F4 a preview goes stale when the decision has changed",stale.body.ok===false&&/preview it again/.test(stale.body.error),stale.body);
 const p2=await dPreview("D1","SAVE_AS_KNOWLEDGE",ans),r=await resolve("D1","SAVE_AS_KNOWLEDGE",ans,{confirm_owner_approved:true,preview_hash:p2.preview_hash});
 ok("F5 with the approved preview the decision saves the price, linked to the decision",r.body.ok&&q("SELECT source_decision_id FROM price_versions WHERE unit_price_minor=333")[0]?.source_decision_id==="D1",r.body);}
{decision("D2",{resolution:"price",config_key:configKey});decision("D3",{resolution:"price",config_key:configKey});
 const a=await resolve("D2","CASE_ONLY",{unit_price_minor:444});
 const b=await call("/api/si/decisions/resolve",{id:"D3",action:"REJECT",scope:"SAVE_AS_KNOWLEDGE",answer:{}});
 ok("F6 case-only answers and rejections still work with one step, and write no catalog row",a.body.ok&&b.body.ok&&q("SELECT COUNT(*) n FROM price_versions WHERE unit_price_minor=444")[0].n===0,[a.body,b.body]);
 decision("D4",{resolution:"setting",setting_key:"payment_instructions",scope:{market:"ARAB"}},{type:"PAYMENT_TERMS"});
 const pv4=(await call("/api/si/decisions/preview",{id:"D4",action:"ANSWER",scope:"SAVE_AS_KNOWLEDGE",answer:{value:"test only"}})).body,c=await resolve("D4","SAVE_AS_KNOWLEDGE",{value:"test only"},{confirm_owner_approved:true,preview_hash:pv4.preview_hash});
 ok("F7 a payment-settings decision saves through the same preview",c.body.ok,c.body);
 decision("D5",{resolution:"learning",proposal:{resolution:"price",config_key:configKey}});
 const d=await resolve("D5","SAVE_AS_KNOWLEDGE",{unit_price_minor:555,quantity_min:1});
 ok("F8 a learning proposal that would save a price is gated too",d.body.ok===false&&(await dPreview("D5","SAVE_AS_KNOWLEDGE",{unit_price_minor:555})).writes_catalog===true,d.body);}

// ---- the live price list
{const P="/api/commercial-price-items",body={market:"ARAB",product_name:"علبة قائمة",product_key:"list box",currency:"USD",unit_price_minor:300,moq:10},before=snap();
 const p=(await call(P+"/preview",body)).body;
 ok("G1 price-list preview is read-only",p.ok&&p.writes===0&&snap()===before,p);
 const none=await call(P,body);ok("G2 a price-list change is refused without an approved preview",none.status===409&&none.body.reason==="owner_approval_required"&&snap()===before,none.body);
 const bad=await call(P+"/preview",{...body,currency:"TOMAN"});ok("G3 Iraq stays USD at preview",bad.status===400,bad.body);
 const r=await call(P,{...body,confirm_owner_approved:true,preview_hash:p.preview_hash});ok("G4 it works with the approved preview",r.body.ok&&r.body.item.unit_price_minor===300,r.body);
 const id=r.body.item.id,next={base_id:id,unit_price_minor:320},p2=(await call(P+"/preview",next)).body;
 const a=(await call(P+"/activation/preview",{id,active:false})).body;
 const refused=await call(P+"/activation",{id,active:false},"PATCH");
 ok("G5 switching a price off is refused without an approved preview",refused.status===409&&q("SELECT active FROM commercial_price_items WHERE id=?",[id])[0].active===1,refused.body);
 const off=await call(P+"/activation",{id,active:false,confirm_owner_approved:true,preview_hash:a.preview_hash},"PATCH");
 ok("G6 and works with one",off.body.ok&&q("SELECT active FROM commercial_price_items WHERE id=?",[id])[0].active===0,off.body);
 const stale=await call(P,{...next,confirm_owner_approved:true,preview_hash:p2.preview_hash});
 ok("G7 a price preview goes stale when the live row has changed",stale.status===409,stale.body);
 const missing=await call(P+"/activation",{id:"nope",active:true},"PATCH");ok("G8 an unknown row still reports not found",missing.status===404,missing.status);
 await W.importLine("علبة استيراد · 7x7x7 · قطعتين | 1.25","ARAB","p22-import").catch(()=>null);
 const list=await call(P,null,"GET");ok("G9 reading the price list is unchanged",list.body.ok,list.body.ok);}

// ---- dashboard: every writer previews and confirms first
{const ui=fs.readFileSync(path.join(SRC,"live-dashboard-page.js"),"utf8"),body=(n,end)=>ui.slice(ui.indexOf("async function "+n),ui.indexOf(end,ui.indexOf("async function "+n)+10));
 const cases=[["siSaveKnowledge","async function siRetire",'"/api/si/knowledge/"+encodeURIComponent(kind),{method:"POST"'],["siRetire","let priceVersionBaseId",'+"/retire",{method:"POST"'],["createPriceVersion","function preparePriceVersion",'api("/api/commercial-price-items",{method:"POST"'],["togglePrice","\n",'api("/api/commercial-price-items/activation",{method:"PATCH"'],["siResolve","const d=await api(\"/api/si/decisions/resolve\"",null]];
 const results=cases.map(([n,end,w])=>{const f=body(n,end),g=f.indexOf("ownerGate("),i=w?f.indexOf(w):f.length;return [n,g>=0&&i>g];});
 ok("H1 all five dashboard writers go through the preview and confirmation first",results.every(x=>x[1]),results);
 const gate=ui.slice(ui.indexOf("async function ownerGate"),ui.indexOf("let intakeHash=null"));
 ok("H2 the gate stops unless the owner confirms, and only then passes the hash",/if\(!confirm\(/.test(gate)&&gate.indexOf("if(!confirm(")<gate.indexOf("confirm_owner_approved:true"));}
process.exit(done()?1:0);
