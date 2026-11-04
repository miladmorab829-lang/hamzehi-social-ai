// PHASE 22.1 — product intake for the versioned catalog. Preview never writes and shows the live effect; apply needs the owner's
// confirmation and the hash of that exact preview; Iran stays in TOMAN and Iraq in USD; only verified real photos are accepted.
// Local only: Telegram and the AI model are in-process mocks; test product names are fake; nothing reaches Production or a customer.
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase22_1");
const W=await makeWorld({aiBrain:"on",extraEnv:{PUBLIC_WORKER_BASE_URL:"https://w.test"}});const {q,dbrun,call,send,setMarket,upload}=W;
await call("/api/quotes",null,"GET");await call("/api/si/knowledge/product",null,"GET");
const LIST=`INSERT INTO commercial_price_items(id,product_key,product_name,sku,market,currency,unit_price_minor,moq,version,active,effective_from,effective_until,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
const T="2026-10-01T00:00:00.000Z";
for(const [id,key,name,market,cur,price] of [["L1","test-a","علبة تجربة · 13x16x10 · قطعتين","ARAB","USD",250],["L2","test-b","علبة تجربة · 13x16x10 · ثلاث قطع","ARAB","USD",300],["L3","test-c","جعبه تست · 13x16 · 2 تکه","IRAN","TOMAN",90000]])
  dbrun(LIST,[id,key,name,null,market,cur,price,null,1,1,null,null,"admin",T,T,T]);
await call("/api/gallery/options",null,"GET");
const seedPhoto=(id,{status="verified",real=1,generated=0,size="13x16x10",spec=true}={})=>{
  dbrun("INSERT INTO visual_product_media(id,source_platform,source_identity,media_type,source_kind,ownership_status,generated_detected,candidate_status,verified_real_product,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",[id,"r2","r2:"+id,"photo","owner_gallery","owned",generated,status,real,1,T,T]);
  if(spec)dbrun("INSERT INTO gallery_photo_specs(id,visual_media_id,version,status,market,product_key,product_name,model,size,pieces,box_type,lid_color,base_color,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",["S-"+id,id,1,"approved","ARAB","test-a","علبة تجربة","علبة تجربة",size,2,"قطعتين","أسود","أسود",T,T]);};
seedPhoto("P-OK");seedPhoto("P-AI",{generated:1,real:0,status:"candidate"});seedPhoto("P-CAND",{status:"candidate",real:0});seedPhoto("P-NOSPEC",{spec:false});seedPhoto("P-SIZE",{size:"9x9"});

const sheet=(over={})=>({product:{name:"علبة تجربة",aliases:[]},
  attributes:[["size",["13x16x10"],false],["box_type",["قطعتين","ثلاث قطع"],true],["lid_color",["أسود"],false],["base_color",["أسود"],false],["foam",["فوم أسود"],false],["ribbon",["بدون شريط"],false]].map(([k,v,c])=>({attribute_key:k,label:k,attribute_kind:k,required:c,commercial_critical:c,allowed_values:v})),
  configurations:[{key:"two",market:"*",attributes:{box_type:"قطعتين"}},{key:"three",market:"*",attributes:{box_type:"ثلاث قطع"}}],
  prices:[{market:"ARAB",config:"two",currency:"USD",unit_price_minor:275,moq:100},{market:"ARAB",config:"three",currency:"USD",unit_price_minor:325,moq:100},{market:"IRAN",config:"two",currency:"TOMAN",unit_price_minor:95000,moq:300},{market:"IRAN",config:"three",currency:"TOMAN",unit_price_minor:105000,moq:300}],
  photo_media_ids:["P-OK"],...over});
const preview=async products=>(await call("/api/si/catalog-intake/preview",{products})).body;
const codes=p=>(p.products?.[0]?.issues||[]).map(x=>x.code);
const catalogRows=()=>q("SELECT COUNT(*) n FROM product_catalog")[0].n+q("SELECT COUNT(*) n FROM price_versions")[0].n;
const mutate=fn=>{const s=sheet();fn(s);return s;};
const schema=()=>JSON.stringify(q("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"));
const tables=()=>q("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").map(r=>r.name);
const snap=()=>schema()+JSON.stringify(tables().filter(n=>n!=="api_rate_limits").map(n=>[n,q(`SELECT * FROM "${n}"`)]));

// ---- preview
{const p=await preview([sheet()]);
 ok("A1 a complete sheet is ready, and preview writes nothing",p.ok&&p.ready&&p.writes===0&&catalogRows()===0,p);
 const iraq=p.products[0].live_effect.markets.find(m=>m.market==="ARAB");
 ok("A2 preview shows the live effect: which price-list rows are replaced, their current prices and the new ones",iraq.overrides_price_list_rows===2&&iraq.current_list.some(x=>x.price==="2.50 USD")&&iraq.new_prices.some(x=>x.price==="2.75 USD"),iraq);
 ok("A3 prices are shown in each market's own currency",p.products[0].live_effect.markets.find(m=>m.market==="IRAN").new_prices.some(x=>x.price==="95,000 TOMAN"));}

// ---- preview is read-only, proved two ways: every data row is compared, and every write statement is recorded
{const sqls=[],orig=W.env.DB.prepare.bind(W.env.DB);W.env.DB.prepare=s=>{sqls.push(String(s));return orig(s);};
 const before=snap();
 await preview([sheet()]);await preview([mutate(s=>{s.prices[0].currency="TOMAN"})]);await preview([sheet(),sheet({product:{name:"علبة ثانية"}})]);
 W.env.DB.prepare=orig;
 const writes=sqls.filter(s=>/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(s));
 const ddl=sqls.filter(s=>/^\s*(CREATE|ALTER|DROP)\b/i.test(s));
 ok("A4 preview leaves every row and the whole schema unchanged ("+tables().length+" tables compared, new tables included)",snap()===before&&tables().length>40,tables().length);
 ok("A5 the only write statement during preview is the request rate counter that every API call updates",writes.length>0&&writes.every(s=>/api_rate_limits/.test(s)),writes.filter(s=>!/api_rate_limits/.test(s)).map(s=>s.slice(0,80)));
 ok("A5b schema statements on this path are only the existing idempotent ensure steps, nothing is dropped",ddl.every(s=>/IF NOT EXISTS|ADD COLUMN/i.test(s)&&!/^\s*DROP/i.test(s)),ddl.filter(s=>!/IF NOT EXISTS|ADD COLUMN/i.test(s)).map(s=>s.slice(0,80)));
 const mod=(await import("node:fs")).readFileSync(new URL("../../worker/src/catalog-intake.js",import.meta.url),"utf8");
 ok("A6 the intake module itself holds no direct write: no run, batch, R2 or KV call; saves go only through saveKnowledgeVersion",!/\.run\(|\.batch\(|\.exec\(|\.put\(|\.delete\(|_BUCKET|env\.DB/.test(mod));}

// ---- refusals
for(const [id,label,fn,code] of [
  ["B1","a missing foam attribute",s=>{s.attributes=s.attributes.filter(a=>a.attribute_key!=="foam")},"required"],
  ["B2","a missing ribbon attribute",s=>{s.attributes=s.attributes.filter(a=>a.attribute_key!=="ribbon")},"required"],
  ["B3","foam with no approved value",s=>{s.attributes.find(a=>a.attribute_key==="foam").allowed_values=[]},"no_values"],
  ["B4","a two-dimension size",s=>{s.attributes.find(a=>a.attribute_key==="size").allowed_values=["13x16"]},"size_format"],
  ["B5","Iraq priced in toman",s=>{s.prices[0].currency="TOMAN"},"currency"],
  ["B6","Iran priced in USD",s=>{s.prices[2].currency="USD"},"currency"],
  ["B7","a price with no currency stated",s=>{delete s.prices[0].currency},"currency"],
  ["B8","a zero price",s=>{s.prices[0].unit_price_minor=0},"price"],
  ["B9","a decimal price",s=>{s.prices[0].unit_price_minor=2.75},"price"],
  ["B10","a price for an unknown configuration",s=>{s.prices[0].config="nope"},"config"],
  ["B11","a configuration value that is not approved",s=>{s.configurations[0].attributes.box_type="مجهول"},"value_not_approved"],
  ["B12","a configuration missing a critical attribute",s=>{s.configurations[0].attributes={}},"required"],
  ["B13","overlapping quantity tiers",s=>{s.prices[0].quantity_min=1;s.prices[0].quantity_max=500;s.prices.push({market:"ARAB",config:"two",currency:"USD",unit_price_minor:200,quantity_min:400,moq:100})},"tier_overlap"],
  ["B14","an unfilled template placeholder",s=>{s.product.name="<نام واقعی>"},"placeholder"],
  ["B15","no photo",s=>{s.photo_media_ids=[]},"required"],
  ["B16","an AI-generated photo",s=>{s.photo_media_ids=["P-AI"]},"photo_not_verified"],
  ["B17","a photo not yet verified",s=>{s.photo_media_ids=["P-CAND"]},"photo_not_verified"],
  ["B18","a photo with no approved spec",s=>{s.photo_media_ids=["P-NOSPEC"]},"photo_no_spec"],
  ["B19","a photo of a different size",s=>{s.photo_media_ids=["P-SIZE"]},"photo_size_mismatch"],
  ["B20","a photo that is not in the gallery",s=>{s.photo_media_ids=["P-NONE"]},"photo_not_found"],
  ["B25","a system key used as an attribute",s=>{s.attributes.push({attribute_key:"quantity",label:"q",allowed_values:["1"],commercial_critical:false})},"system_key"],
  ["B26","an extra attribute with no values",s=>{s.attributes.push({attribute_key:"note",label:"n",commercial_critical:false})},"no_values"],
  ["B27","a zero MOQ",s=>{s.prices[0].moq=0},"moq"],
  ["B28","a text MOQ",s=>{s.prices[0].moq="abc"},"moq"],
  ["B29","an invalid effective date",s=>{s.prices[0].effective_from="garbage"},"date"],
  ["B30","two configurations that differ only in a non-price attribute",s=>{s.configurations[1]={key:"three",market:"*",attributes:{box_type:"قطعتين"}}},"duplicate_config"],
  ["B31","the same configuration for all markets and for one market",s=>{s.configurations.push({key:"iran2",market:"IRAN",attributes:{box_type:"قطعتين"}})},"duplicate_config"],
  ["B32","a non-price attribute inside a configuration",s=>{s.configurations[0].attributes.lid_color="أسود"},"not_price_attribute"],
  ["B33","two attributes that normalize to the same key",s=>{s.attributes.push({attribute_key:"Lid Color",label:"x",allowed_values:["أبيض"],commercial_critical:false})},"duplicate"],
  ["B34","aliases that are not a list",s=>{s.product.aliases="علبة"},"format"]]){
 const p=await preview([mutate(fn)]);ok(`${id} ${label} is refused`,p.ready===false&&codes(p).includes(code),codes(p));}
{const six=await call("/api/si/catalog-intake/preview",{products:Array.from({length:6},(_,i)=>sheet({product:{name:"علبة "+i}}))});
 ok("B21 more than 5 products at once is refused",six.body.ok===false&&/At most 5/.test(six.body.error),six.body);
 const dup=await preview([sheet(),sheet()]);ok("B22 the same product twice is refused",dup.ready===false,dup.products[0].issues);
 const w=await preview([mutate(s=>{s.prices=s.prices.filter(p=>p.market==="ARAB");delete s.prices[0].moq;s.prices[1].unit_price_minor=325000})]);
 const wc=w.products[0].warnings.map(x=>x.code);
 ok("B23 warnings do not block but are shown: market not priced, missing MOQ, suspicious USD scale",w.ready&&wc.includes("market_not_priced")&&wc.includes("moq_missing")&&wc.includes("price_scale"),wc);
 const noPolicy=await preview([mutate(s=>{s.prices[0].quantity_max=499;s.prices.push({market:"ARAB",config:"two",currency:"USD",unit_price_minor:200,quantity_min:500,moq:100})})]);
 ok("B24 several tiers without an owner tier policy are flagged before they reach a customer",noPolicy.products[0].warnings.some(x=>x.code==="tier_policy_missing"),noPolicy.products[0].warnings);}

{const sp=await preview([mutate(s=>{s.configurations[0].key=" two ";s.prices.forEach(p=>{if(p.config==="two")p.config="two "})})]);
 ok("B35 stray spaces in configuration keys do not break the link to prices",sp.ready,sp.products[0].issues);
 const al=await preview([mutate(s=>{s.attributes.find(a=>a.attribute_key==="box_type").allowed_values=[{value:"قطعتين",aliases:["2 قطع"]},"ثلاث قطع"];s.configurations[0].attributes.box_type="2 قطع"})]);
 ok("B36 an approved alias is accepted, matching what the save accepts",al.ready,al.products[0].issues);
 const crit=await preview([mutate(s=>{const f=s.attributes.find(a=>a.attribute_key==="foam");f.commercial_critical=true;s.configurations.forEach(c=>c.attributes.foam="فوم أسود")})]);
 ok("B37 foam marked as price-setting warns that it adds a question before the price",crit.products[0].warnings.some(x=>x.code==="critical_question"&&/foam/.test(x.message)),crit.products[0].warnings);
 const part=await preview([mutate(s=>{s.configurations.pop();s.prices=s.prices.filter(p=>p.config==="two")})]);
 ok("B38 price-list models the sheet does not cover are reported, with the fallback stated",part.products[0].warnings.some(x=>x.code==="list_variants_uncovered"),part.products[0].warnings);
 const lost=await preview([mutate(s=>{s.product={name:"علبة أخرى",aliases:["علبة تجربة"]};s.configurations.pop();s.prices=s.prices.filter(p=>p.config==="two")})]);
 ok("B39 uncovered models with no name match are reported as going to the owner",lost.products[0].warnings.some(x=>x.code==="list_variants_lost"),lost.products[0].warnings);}

// ---- every ready sheet must apply fully, because saves are live as they happen
{const W2=await makeWorld({aiBrain:"off"});await W2.call("/api/quotes",null,"GET");await W2.call("/api/si/knowledge/product",null,"GET");await W2.call("/api/gallery/options",null,"GET");
 W2.dbrun("INSERT INTO visual_product_media(id,source_platform,source_identity,media_type,source_kind,ownership_status,generated_detected,candidate_status,verified_real_product,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",["P-OK","r2","r2:P-OK","photo","owner_gallery","owned",0,"verified",1,1,T,T]);
 W2.dbrun("INSERT INTO gallery_photo_specs(id,visual_media_id,version,status,market,product_key,product_name,model,size,pieces,box_type,lid_color,base_color,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",["S-OK","P-OK",1,"approved","ARAB","k","n","n","13x16x10",2,"b","c","c",T,T]);
 const variants=[sheet(),mutate(s=>{s.product.name="علبة ب";s.configurations[0].key=" two ";s.prices.forEach(p=>{if(p.config==="two")p.config="two "})}),
   mutate(s=>{s.product.name="علبة ج";s.attributes.find(a=>a.attribute_key==="box_type").allowed_values=[{value:"قطعتين",aliases:["2 قطع"]},"ثلاث قطع"];s.configurations[0].attributes.box_type="2 قطع"}),
   mutate(s=>{s.product.name="علبة د";s.attributes.push({attribute_key:"note",label:"note",value_type:"text",commercial_critical:false,required:false})}),
   mutate(s=>{s.product={name:"علبة هـ",aliases:["هـ"],family:"f"};s.prices[0].effective_from="2026-11-01";s.prices[0].quantity_min=100;s.prices[0].quantity_max=999})];
 const p=(await W2.call("/api/si/catalog-intake/preview",{products:variants})).body;
 const a=(await W2.call("/api/si/catalog-intake/apply",{products:variants,confirm_owner_approved:true,preview_hash:p.preview_hash})).body;
 ok("C0 five varied ready sheets all apply completely (preview and save agree)",p.ready&&a.ok&&a.applied.length===5&&W2.q("SELECT COUNT(*) n FROM price_versions WHERE status='current'")[0].n===20,[p.products.map(x=>x.issues),a]);
 const orig=W2.env.DB.batch.bind(W2.env.DB);let calls=0;W2.env.DB.batch=x=>{calls++;if(calls===3)throw new Error("simulated D1 failure");return orig(x);};
 const one=[mutate(s=>{s.product.name="علبة و"})],pv=(await W2.call("/api/si/catalog-intake/preview",{products:one})).body;
 const f=await W2.call("/api/si/catalog-intake/apply",{products:one,confirm_owner_approved:true,preview_hash:pv.preview_hash});W2.env.DB.batch=orig;
 ok("C0b a failure part-way is reported as such and audited, and applying again finishes the product",f.body.ok===false&&/Stopped part-way/.test(f.body.error)&&f.body.failed_product==="علبة و"&&W2.q("SELECT COUNT(*) n FROM system_events WHERE type='catalog_intake_partial'")[0].n===1,f.body);
 const pv2=(await W2.call("/api/si/catalog-intake/preview",{products:one})).body,g=await W2.call("/api/si/catalog-intake/apply",{products:one,confirm_owner_approved:true,preview_hash:pv2.preview_hash});
 ok("C0c the second apply completes it",g.body.ok&&W2.q("SELECT COUNT(*) n FROM price_versions p JOIN product_catalog c ON c.product_key=p.product_key WHERE c.name='علبة و' AND p.status='current'")[0].n===4,g.body);}

// ---- apply
{const products=[sheet()],p=await preview(products),before=snap();
 const noConfirm=await call("/api/si/catalog-intake/apply",{products,preview_hash:p.preview_hash});
 const noHash=await call("/api/si/catalog-intake/apply",{products,confirm_owner_approved:true});
 const other=[sheet({prices:sheet().prices.map(x=>({...x,unit_price_minor:x.unit_price_minor+1}))})];
 const swapped=await call("/api/si/catalog-intake/apply",{products:other,confirm_owner_approved:true,preview_hash:p.preview_hash});
 ok("C1 apply is refused without confirmation, without a hash, and for a sheet that is not the one previewed",noConfirm.body.ok===false&&noHash.body.ok===false&&swapped.body.ok===false&&snap()===before,[noConfirm.body,noHash.body,swapped.body]);
 for(const v of ["true",1,"yes",null]){const r=await call("/api/si/catalog-intake/apply",{products,confirm_owner_approved:v,preview_hash:p.preview_hash});
   ok("C1b only the literal value true counts as confirmation, not "+JSON.stringify(v),r.body.ok===false&&snap()===before,r.body);}
 const wrong=await W.run(new Request("https://w.test/api/si/catalog-intake/apply",{method:"POST",headers:{Authorization:"Bearer wrong","Content-Type":"application/json"},body:JSON.stringify({products,confirm_owner_approved:true,preview_hash:p.preview_hash})}));
 ok("C1c a wrong token is refused",wrong.status===401&&snap()===before,wrong.status);
 dbrun("UPDATE commercial_price_items SET unit_price_minor=260 WHERE id='L1'");
 const stale=await call("/api/si/catalog-intake/apply",{products,confirm_owner_approved:true,preview_hash:p.preview_hash});
 dbrun("UPDATE commercial_price_items SET unit_price_minor=250 WHERE id='L1'");
 ok("C1d a preview goes stale if a live price it showed has changed since",stale.body.ok===false&&/live prices changed/.test(stale.body.error)&&snap()===before,stale.body);
 dbrun("UPDATE commercial_price_items SET active=0 WHERE id='L2'");
 const gone=await call("/api/si/catalog-intake/apply",{products,confirm_owner_approved:true,preview_hash:p.preview_hash});
 dbrun("UPDATE commercial_price_items SET active=1 WHERE id='L2'");
 dbrun(LIST,["L9","test-z","علبة تجربة · 13x16x10 · جرّارة",null,"ARAB","USD",400,null,1,1,null,null,"admin",T,T,T]);
 const added=await call("/api/si/catalog-intake/apply",{products,confirm_owner_approved:true,preview_hash:p.preview_hash});
 dbrun("UPDATE commercial_price_items SET active=0 WHERE id='L9'");   // price rows cannot be deleted; this test row stays switched off
 ok("C1e it also goes stale if a list row was switched off or added",gone.body.ok===false&&added.body.ok===false&&catalogRows()===0,[gone.body,added.body]);
 const bad=[mutate(s=>{s.prices[0].currency="TOMAN"})],bp=await preview(bad);
 const blocked=await call("/api/si/catalog-intake/apply",{products:bad,confirm_owner_approved:true,preview_hash:bp.preview_hash});
 ok("C2 a sheet with issues cannot be applied even with its own hash",blocked.body.ok===false&&catalogRows()===0,blocked.body);
 const r=await W.run(new Request("https://w.test/api/si/catalog-intake/preview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({products})}));
 const r2=await W.run(new Request("https://w.test/api/si/catalog-intake/apply",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({products,confirm_owner_approved:true,preview_hash:p.preview_hash})}));
 ok("C3 both routes need the admin token",r.status===401&&r2.status===401&&catalogRows()===0,[r.status,r2.status]);
 const listBefore=JSON.stringify(q("SELECT * FROM commercial_price_items ORDER BY id"));
 const done1=await call("/api/si/catalog-intake/apply",{products,confirm_owner_approved:true,preview_hash:p.preview_hash});
 ok("C4 apply saves the product through the versioned catalog, approved by the owner",done1.body.ok&&q("SELECT COUNT(*) n FROM product_catalog WHERE status='current'")[0].n===1&&q("SELECT COUNT(*) n FROM product_attribute_schema WHERE status='current'")[0].n===6&&q("SELECT COUNT(*) n FROM product_configurations WHERE status='current'")[0].n===2&&q("SELECT COUNT(*) n FROM price_versions WHERE status='current'")[0].n===4,done1.body);
 ok("C5 currencies are stored per market: Iran TOMAN, Iraq USD, never mixed",q("SELECT DISTINCT market,currency FROM price_versions").every(x=>(x.market==="IRAN"&&x.currency==="TOMAN")||(x.market==="ARAB"&&x.currency==="USD")));
 ok("C6 the price list is untouched",JSON.stringify(q("SELECT * FROM commercial_price_items ORDER BY id"))===listBefore);
 ok("C7 the apply is audited",q("SELECT COUNT(*) n FROM system_events WHERE type='catalog_intake_applied'")[0].n===1);
 const n=q("SELECT COUNT(*) n FROM price_versions")[0].n;
 const again=await call("/api/si/catalog-intake/apply",{products,confirm_owner_approved:true,preview_hash:(await preview(products)).preview_hash});
 ok("C8 applying the same sheet again creates no new versions",again.body.ok&&q("SELECT COUNT(*) n FROM price_versions")[0].n===n,again.body);
 const after=await preview(products);ok("C9 preview now reports the product as already in the catalog",after.products[0].live_effect.existing_version===1,after.products[0].live_effect);}

// ---- nothing automatic can reach apply
{const fs=await import("node:fs"),path=await import("node:path"),url=await import("node:url");
 const SRC=path.resolve(path.dirname(url.fileURLToPath(import.meta.url)),process.env.REPO?path.join(process.env.REPO,"worker/src"):"../../worker/src");
 const files=fs.readdirSync(SRC).filter(f=>f.endsWith(".js")),text=f=>fs.readFileSync(path.join(SRC,f),"utf8");
 const callers=files.filter(f=>f!=="catalog-intake.js"&&/applyProductSheets|catalog-intake\/apply/.test(text(f)));
 const si=text("sales-intelligence.js"),uses=[...si.matchAll(/applyProductSheets\(/g)].map(m=>m.index),handler=si.indexOf("export async function handleSalesIntelligence"),authAt=si.indexOf("if(!D.auth(req,env))",handler);
 ok("C10 apply has exactly one server call, inside the route after the token check, plus the dashboard button; no cron, AI or inbound code calls it",callers.sort().join()==="live-dashboard-page.js,sales-intelligence.js"&&uses.length===1&&handler>0&&authAt>handler&&uses[0]>authAt,[callers,uses.length]);
 const ui=text("live-dashboard-page.js"),fn=ui.slice(ui.indexOf("async function intakeApply"),ui.indexOf("async function siLoadKnowledge"));
 const iHash=fn.indexOf("if(!intakeHash)"),iConfirm=fn.indexOf("if(!confirm("),iCall=fn.indexOf("catalog-intake/apply");
 ok("C11 the dashboard stops without a clean preview, then stops unless the owner confirms, before it sends apply",iHash>0&&iConfirm>iHash&&iCall>iConfirm&&/if\(!confirm\([^)]*\)\)return;/.test(fn),[iHash,iConfirm,iCall]);}

// ---- the real customer effect, which is why preview exists
{const u={id:705220001,name:"Test",username:"p22_a"};await send(u,"هلا");setMarket(u,"iraq");
 const pr=await send(u,"بكم علبة تجربة قطعتين؟ أريد 100");
 ok("D1 the live Sales Brain answers from the catalog, not the older list price (2.75, not 2.50)",pr.action==="answer_price"&&/2\.75/.test(pr.draft?.message||"")&&!/2\.50/.test(pr.draft?.message||""),{a:pr.action,m:pr.draft?.message});
 ok("D2 and that answer goes out automatically, which is why apply needs a preview and confirmation",pr.draft?.status==="sent"&&pr.draft?.approved_by==="inbound_auto_policy",{s:pr.draft?.status,b:pr.draft?.approved_by});}
{const u={id:705220002,name:"Test2",username:"p22_b"};await send(u,"سلام");setMarket(u,"iran");
 const pr=await send(u,"قیمت جعبه تست 2 تکه برای 400 عدد چنده؟");
 ok("D3 a product not in the catalog still answers from its price list, in toman",/90[,٬]?000|۹۰[,٬]?۰۰۰/.test(pr.draft?.message||""),{a:pr.action,m:pr.draft?.message});}
process.exit(done()?1:0);
