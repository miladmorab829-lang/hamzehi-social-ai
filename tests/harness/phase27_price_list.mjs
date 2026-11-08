// Phase 27 — price-list validator (read-only tool; synthetic test rows only, never real prices).
import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {reporter} from "./harness.mjs";
const {ok,done}=reporter("phase27_price_list");
const REPO=process.env.REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const V=await import(pathToFileURL(path.join(REPO,"scripts/validate-price-list.mjs")).href);
const H=V.COLUMNS.join(",");const now=new Date("2026-11-08T00:00:00Z");
const row=o=>V.COLUMNS.map(c=>o[c]??"").join(",");
const base={market:"IRAN",currency:"TOMAN",product_name:"TEST-BOX",size:"5x5",configuration:"3 piece",unit_price:"66000",moq:"300",discount_min_qty:"1000",discount_percent:"10",deposit_percent:"50",shipping_mode:"pending",effective_from:"2026-11-10",list_version:"TEST-1"};
const iq={...base,market:"IRAQ",currency:"USD",unit_price:"0.60",moq:"500",discount_min_qty:"1001"};
const run=(rows,opt={})=>V.validatePriceList([H,...rows.map(row)].join("\n"),{now,...opt});
const codes=r=>r.errors.map(e=>e.code);
{const r=run([base,{...base,size:"6x6",unit_price:"۷۴٬۸۰۰"},iq]);ok("V1 a clean two-market list has no errors",r.errors.length===0,r.errors);
 ok("V2 TOMAN is whole toman and USD is cents (0.60 → 60); Persian digits accepted",r.items[0].unit_price_minor===66000&&r.items[1].unit_price_minor===74800&&r.items[2].unit_price_minor===60&&r.items[2].market==="ARAB",r.items.map(i=>i.unit_price_minor));}
ok("V3 rial is rejected",codes(run([{...base,currency:"IRR"}])).includes("rial_not_allowed"));
ok("V4 IQD is rejected for Iraq",codes(run([{...iq,currency:"IQD"}])).includes("iqd_not_allowed"));
ok("V5 a cross-market currency is rejected",codes(run([{...base,currency:"USD"}])).includes("currency_market_mismatch")&&codes(run([{...iq,currency:"TOMAN"}])).includes("currency_market_mismatch"));
ok("V6 USD with three decimals is rejected (no hidden cents)",codes(run([{...iq,unit_price:"0.605"}])).includes("unit_price_invalid"));
ok("V7 a dollars-vs-cents mistake is flagged for the owner",run([{...iq,unit_price:"60"}]).warnings.some(w=>w.code==="usd_scale_suspicious"));
ok("V8 a rial-sized toman price is flagged",run([{...base,unit_price:"660000000"}]).warnings.some(w=>w.code==="toman_scale_suspicious"));
ok("V9 a duplicate active variant is rejected",codes(run([base,{...base,unit_price:"70000"}])).includes("duplicate_variant"));
ok("V10 a duplicate SKU is rejected",codes(run([{...base,sku:"S1"},{...base,size:"7x7",sku:"S1"}])).includes("duplicate_sku"));
ok("V11 two discount rules in one market are rejected",codes(run([base,{...base,size:"6x6",discount_percent:"15"}])).includes("discount_rule_inconsistent"));
ok("V12 two deposit percentages in one market are rejected",codes(run([base,{...base,size:"6x6",deposit_percent:"40"}])).includes("deposit_percent_inconsistent"));
ok("V13 a fixed shipping mode needs an exact amount; others must not invent one",codes(run([{...base,shipping_mode:"fixed"}])).includes("shipping_amount_required_for_fixed")&&codes(run([{...base,shipping_amount:"50000"}])).includes("shipping_amount_without_fixed_mode"));
ok("V14 an expired or inverted date range is rejected",codes(run([{...base,effective_until:"2026-11-01"}])).includes("already_expired")&&codes(run([{...base,effective_from:"2026-12-01",effective_until:"2026-11-20"}])).includes("effective_range_invalid"));
ok("V15 a missing column or an unknown market is rejected",codes(V.validatePriceList("market,currency\nIRAN,TOMAN",{now})).includes("missing_columns")&&codes(run([{...base,market:"TURKEY"}])).includes("market_invalid"));
{const cur=[{market:"IRAN",currency:"TOMAN",product_name:"TEST-BOX · 5x5 · 3 piece",unit_price_minor:60000,active:1},{market:"IRAN",currency:"TOMAN",product_name:"OLD-BOX · 1x1 · 1",unit_price_minor:1000,active:1}];
 const r=run([base],{current:cur});
 ok("V16 the diff shows changed, removed and the % change; a big change needs the owner",r.diff.changed[0]?.from===60000&&r.diff.changed[0]?.to===66000&&r.diff.changed[0]?.change_pct===10&&r.diff.not_in_new_list.length===1,r.diff);
 ok("V17 a change above the threshold is flagged",run([{...base,unit_price:"120000"}],{current:cur}).warnings.some(w=>w.code==="large_price_change"));}
done();
