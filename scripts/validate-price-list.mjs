#!/usr/bin/env node
// Validate an owner price list BEFORE anything is imported. Read-only: it reads a CSV (and optionally a JSON export of the currently
// active commercial_price_items) and prints a report. It never connects to D1, never writes, never activates anything.
//   node scripts/validate-price-list.mjs <price-list.csv> [current-active-items.json] [--max-change-pct=30]
// Exit code 0 = no errors (warnings may still need the owner's confirmation), 1 = errors, 2 = usage problem.
import fs from "node:fs";import crypto from "node:crypto";

export const COLUMNS=["market","currency","product_name","size","configuration","sku","unit_price","moq","discount_min_qty","discount_percent","deposit_percent","shipping_mode","shipping_amount","effective_from","effective_until","list_version","note"];
const REQUIRED=["market","currency","product_name","size","configuration","unit_price","effective_from","list_version"];
const MARKET={IRAN:{internal:"IRAN",currency:"TOMAN",exponent:0},IRAQ:{internal:"ARAB",currency:"USD",exponent:2}};
const SHIPPING=new Set(["included","owner_quoted","fixed","pending"]);

export function parseCsv(text){
  const rows=[];let row=[],cell="",q=false;
  const src=String(text).replace(/^﻿/,"");
  for(let i=0;i<src.length;i++){const c=src[i];
    if(q){if(c==='"'){if(src[i+1]==='"'){cell+='"';i++;}else q=false;}else cell+=c;continue;}
    if(c==='"'){q=true;continue;}
    if(c===","){row.push(cell);cell="";continue;}
    if(c==="\n"||c==="\r"){if(c==="\r"&&src[i+1]==="\n")i++;row.push(cell);cell="";if(row.some(x=>x.trim()!==""))rows.push(row);row=[];continue;}
    cell+=c;}
  row.push(cell);if(row.some(x=>x.trim()!==""))rows.push(row);
  return rows;
}
const digits=s=>String(s??"").replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[٬,\s]/g,"").replace(/٫/g,".").trim();
// human price → minor units of the market (TOMAN whole; USD cents). Returns null when the text is not an exact amount.
export function toMinor(text,exponent){
  const t=digits(text);if(!/^\d+(?:\.\d+)?$/.test(t))return null;
  const [w,f=""]=t.split(".");if(f.length>exponent)return null;
  const v=Number(w+f.padEnd(exponent,"0"));return Number.isSafeInteger(v)&&v>0?v:null;
}
const isoDate=s=>/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?)?$/.test(String(s||""))&&!Number.isNaN(Date.parse(s));
const key=(...p)=>p.map(x=>String(x||"").normalize("NFKC").replace(/\s+/g," ").trim().toLowerCase()).join(" · ");

export function validatePriceList(csvText,{current=[],maxChangePct=30,now=new Date()}={}){
  const errors=[],warnings=[],items=[];
  const rows=parseCsv(csvText);if(!rows.length)return {errors:[{row:0,code:"empty_file"}],warnings,items};
  const header=rows[0].map(h=>h.trim().toLowerCase());
  const missingCols=COLUMNS.filter(c=>!header.includes(c)),extraCols=header.filter(c=>!COLUMNS.includes(c));
  if(missingCols.length)errors.push({row:1,code:"missing_columns",columns:missingCols});
  if(extraCols.length)errors.push({row:1,code:"unknown_columns",columns:extraCols});
  if(errors.length)return {errors,warnings,items};
  const seen=new Map(),seenSku=new Map(),perMarket={};
  rows.slice(1).forEach((cells,i)=>{const n=i+2,r=Object.fromEntries(header.map((h,j)=>[h,String(cells[j]??"").trim()]));
    const err=(code,extra={})=>errors.push({row:n,code,...extra}),warn=(code,extra={})=>warnings.push({row:n,code,...extra});
    for(const c of REQUIRED)if(!r[c])err("required_missing",{column:c});
    const mk=MARKET[r.market.toUpperCase()];if(!mk){err("market_invalid",{value:r.market,allowed:Object.keys(MARKET)});return;}
    const cur=r.currency.toUpperCase();
    if(/^(IRR|RIAL|ریال)$/i.test(r.currency))err("rial_not_allowed",{hint:"prices for IRAN are in TOMAN"});
    else if(/^(IQD|دينار|دینار)$/i.test(r.currency))err("iqd_not_allowed",{hint:"prices for IRAQ are in USD"});
    else if(cur!==mk.currency)err("currency_market_mismatch",{market:r.market,currency:r.currency,expected:mk.currency});
    const minor=toMinor(r.unit_price,mk.exponent);
    if(minor===null)err("unit_price_invalid",{value:r.unit_price,exponent:mk.exponent});
    else if(mk.currency==="TOMAN"&&(minor<10000||minor>10000000))warn("toman_scale_suspicious",{value:minor,hint:"below 10,000 or above 10,000,000 toman: check it is not rial or a typo"});
    else if(mk.currency==="USD"&&minor>=2000)warn("usd_scale_suspicious",{value:r.unit_price,hint:"$20 or more per unit: check it is dollars, not cents"});
    if(r.moq&&!(/^\d+$/.test(digits(r.moq))&&Number(digits(r.moq))>0))err("moq_invalid",{value:r.moq});
    const k=key(mk.internal,r.product_name,r.size,r.configuration);
    if(seen.has(k))err("duplicate_variant",{first_row:seen.get(k),variant:k});else seen.set(k,n);
    if(r.sku){const sk=key(mk.internal,r.sku);if(seenSku.has(sk))err("duplicate_sku",{first_row:seenSku.get(sk),sku:r.sku});else seenSku.set(sk,n);}
    if(!isoDate(r.effective_from))err("effective_from_invalid",{value:r.effective_from});
    if(r.effective_until&&!isoDate(r.effective_until))err("effective_until_invalid",{value:r.effective_until});
    if(isoDate(r.effective_from)&&isoDate(r.effective_until)&&Date.parse(r.effective_until)<=Date.parse(r.effective_from))err("effective_range_invalid");
    if(isoDate(r.effective_until)&&Date.parse(r.effective_until)<=now.getTime())err("already_expired",{value:r.effective_until});
    if(r.shipping_mode&&!SHIPPING.has(r.shipping_mode))err("shipping_mode_invalid",{value:r.shipping_mode,allowed:[...SHIPPING]});
    if(r.shipping_mode==="fixed"&&toMinor(r.shipping_amount,mk.exponent)===null)err("shipping_amount_required_for_fixed");
    if(r.shipping_mode!=="fixed"&&r.shipping_amount)err("shipping_amount_without_fixed_mode",{hint:"leave blank unless the owner fixed an exact amount"});
    const pm=perMarket[mk.internal]||(perMarket[mk.internal]={discount:new Set(),deposit:new Set(),version:new Set(),rows:0});pm.rows++;
    pm.discount.add(`${digits(r.discount_min_qty)}|${digits(r.discount_percent)}`);pm.deposit.add(digits(r.deposit_percent));pm.version.add(r.list_version);
    if(r.discount_percent&&!(/^\d+(?:\.\d{1,2})?$/.test(digits(r.discount_percent))&&Number(digits(r.discount_percent))>0&&Number(digits(r.discount_percent))<=50))err("discount_percent_invalid",{value:r.discount_percent});
    if(!!r.discount_percent!==!!r.discount_min_qty)err("discount_incomplete",{hint:"discount_percent and discount_min_qty go together"});
    if(r.deposit_percent&&!(/^\d+$/.test(digits(r.deposit_percent))&&Number(digits(r.deposit_percent))<=100))err("deposit_percent_invalid",{value:r.deposit_percent});
    if(minor!==null)items.push({row:n,market:mk.internal,currency:mk.currency,product_name:[r.product_name,r.size,r.configuration].filter(x=>x&&x!=="-").join(" · "),variant_key:k,sku:r.sku||null,unit_price_minor:minor,moq:r.moq?Number(digits(r.moq)):null,effective_from:r.effective_from,effective_until:r.effective_until||null});
  });
  // one rule per market: a list must not carry two different discounts, deposits or versions for the same market
  for(const [m,p] of Object.entries(perMarket)){
    if(p.discount.size>1)errors.push({row:0,code:"discount_rule_inconsistent",market:m,values:[...p.discount]});
    if(p.deposit.size>1)errors.push({row:0,code:"deposit_percent_inconsistent",market:m,values:[...p.deposit]});
    if(p.version.size>1)errors.push({row:0,code:"list_version_inconsistent",market:m,values:[...p.version]});
  }
  // diff against the currently active list (export of commercial_price_items where active=1)
  const diff={added:[],changed:[],unchanged:0,not_in_new_list:[]};
  if(current.length){const byName=new Map(current.filter(c=>Number(c.active)===1).map(c=>[key(c.market,c.product_name),c]));const newKeys=new Set();
    for(const it of items){const c=byName.get(key(it.market,it.product_name));newKeys.add(key(it.market,it.product_name));
      if(!c){diff.added.push({row:it.row,product_name:it.product_name,market:it.market,unit_price_minor:it.unit_price_minor});continue;}
      if(c.currency!==it.currency)errors.push({row:it.row,code:"currency_changed_vs_active",from:c.currency,to:it.currency});
      if(Number(c.unit_price_minor)===it.unit_price_minor){diff.unchanged++;continue;}
      const pct=Math.round((it.unit_price_minor-Number(c.unit_price_minor))/Number(c.unit_price_minor)*1000)/10;
      diff.changed.push({row:it.row,product_name:it.product_name,market:it.market,from:Number(c.unit_price_minor),to:it.unit_price_minor,change_pct:pct});
      if(Math.abs(pct)>maxChangePct)warnings.push({row:it.row,code:"large_price_change",change_pct:pct,hint:"owner must confirm this change explicitly"});}
    for(const [k,c] of byName)if(!newKeys.has(k))diff.not_in_new_list.push({product_name:c.product_name,market:c.market,unit_price_minor:Number(c.unit_price_minor)});}
  return {errors,warnings,items,diff,per_market:Object.fromEntries(Object.entries(perMarket).map(([m,p])=>[m,{rows:p.rows,discount:[...p.discount][0],deposit_percent:[...p.deposit][0],list_version:[...p.version][0]}]))};
}

if(import.meta.url===`file://${process.argv[1].replace(/\\/g,"/").replace(/^([A-Za-z]):/,"/$1:")}`||process.argv[1]?.endsWith("validate-price-list.mjs")){
  const args=process.argv.slice(2),files=args.filter(a=>!a.startsWith("--")),max=Number((args.find(a=>a.startsWith("--max-change-pct="))||"").split("=")[1]||30);
  if(!files[0]){console.error("usage: node scripts/validate-price-list.mjs <price-list.csv> [current-active-items.json] [--max-change-pct=30]");process.exit(2);}
  const csv=fs.readFileSync(files[0]),current=files[1]?JSON.parse(fs.readFileSync(files[1],"utf8")):[];
  const report=validatePriceList(csv.toString("utf8"),{current:Array.isArray(current)?current:current.results||[],maxChangePct:max});
  report.file={path:files[0],sha256:crypto.createHash("sha256").update(csv).digest("hex"),rows:report.items.length};
  console.log(JSON.stringify({...report,items:undefined,item_count:report.items.length},null,2));
  process.exit(report.errors.length?1:0);
}
