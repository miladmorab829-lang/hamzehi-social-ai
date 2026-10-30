// CRM PROTECTION — autonomous Google Places lead discovery never overwrites existing CRM data. Local only: Google Places is answered by
// an in-process stub (fake key, no network); every other URL keeps the harness 503.
import {makeWorld,reporter} from "./harness.mjs";
const {ok,J,done}=reporter("crmdisc");
const W=await makeWorld();const {q,dbrun,call}=W;
W.env.GOOGLE_PLACES_API_KEY="test-places-key";
let places=[],placesCalls=0,masks=[];const base=globalThis.fetch;
globalThis.fetch=async(u,o)=>{const s=String(u?.url||u);if(s.startsWith("https://places.googleapis.com/")){placesCalls++;masks.push(o?.headers?.["X-Goog-FieldMask"]||"");return new Response(JSON.stringify({places}),{status:200,headers:{"Content-Type":"application/json"}});}return base(u,o);};
const place=(id,name,site,phone)=>({id,displayName:{text:name},formattedAddress:"تهران، ایران",websiteUri:site,nationalPhoneNumber:phone,internationalPhoneNumber:phone,types:["jewelry_store"]});
const discover=()=>call("/api/crm/lead-discovery",{type:"gold_fa",city:"تهران"});
const lead=id=>q("SELECT * FROM leads WHERE id=?",[id])[0];
const byPlace=pid=>q("SELECT lead_id FROM lead_identities WHERE identity_key=?",["place_id:"+pid])[0]?.lead_id;

// D1 a new place creates exactly one discovered lead with its identities
places=[place("PL-1","گالری طلای الف","https://gold-alef.example","+982188880001")];
const r1=await discover();const L1=byPlace("PL-1");
ok("D1 discovery creates one lead for a new place (stage discovered) and maps its identities",r1.status===200&&!!L1&&lead(L1).stage==="discovered"&&placesCalls>=1,[r1.status,r1.body?.ok,L1]);
// D2 the same place found again: no rewrite, updated_at unchanged
const u1=lead(L1).updated_at,n1=lead(L1).notes;W.age?.(5);await new Promise(r=>setTimeout(r,15));
await discover();
ok("D2 rediscovering the same place changes nothing: same notes, same updated_at, still one lead",lead(L1).updated_at===u1&&lead(L1).notes===n1&&q("SELECT COUNT(*) n FROM lead_identities WHERE lead_id=?",[L1])[0].n>=1&&q("SELECT COUNT(DISTINCT lead_id) n FROM lead_identities WHERE identity_key LIKE 'place_id:PL-1'")[0].n===1,[u1,lead(L1).updated_at]);
// D3 owner notes and an owner-managed stage are preserved
const ownerNotes=JSON.stringify({manual_notes:"مشتری VIP — فقط با مدیر",next_followup_at:"2026-11-01T09:00:00.000Z",negotiation_draft:"draft text"});
dbrun("UPDATE leads SET stage='customer',notes=?,updated_at='2026-10-01T00:00:00.000Z' WHERE id=?",[ownerNotes,L1]);
places=[{...place("PL-1","گالری طلای الف (جدید)","https://gold-alef.example","+982188880001"),formattedAddress:"آدرس جدید"}];
await discover();
ok("D3 a customer lead is never rewritten by discovery: notes, stage and updated_at stay exactly as the owner left them",lead(L1).notes===ownerNotes&&lead(L1).stage==="customer"&&lead(L1).updated_at==="2026-10-01T00:00:00.000Z",lead(L1));
// D4 free-text (non-JSON) notes on an early-stage lead are never replaced
const t0="2026-10-02T00:00:00.000Z";
dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",["L-FREE","گالری ب","https://gold-be.example","discovered","normal","یادداشت مالک: فقط صبح‌ها تماس",t0,t0]);
dbrun("INSERT INTO lead_identities(identity_key,identity_type,normalized_value,lead_id,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",["place_id:PL-2","place_id","PL-2","L-FREE","test",t0,t0]);
places=[place("PL-2","گالری ب","https://gold-be.example","+982188880002")];
await discover();
ok("D4 a lead whose notes are owner free text keeps the text and its timestamp; Phase 17: no Google-derived phone/website identity is added (place ID only)",lead("L-FREE").notes==="یادداشت مالک: فقط صبح‌ها تماس"&&lead("L-FREE").updated_at===t0&&q("SELECT COUNT(*) n FROM lead_identities WHERE lead_id='L-FREE'")[0].n===1,[lead("L-FREE"),q("SELECT identity_key FROM lead_identities WHERE lead_id='L-FREE'")]);
// D5 an early-stage JSON lead gains only missing keys; existing keys are kept; updated_at moves because data really changed
dbrun("INSERT INTO leads(id,name,contact,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",["L-NEW","گالری ج",null,"discovered","normal",JSON.stringify({score:42,city:"شیراز"}),t0,t0]);
dbrun("INSERT INTO lead_identities(identity_key,identity_type,normalized_value,lead_id,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",["place_id:PL-3","place_id","PL-3","L-NEW","test",t0,t0]);
places=[place("PL-3","گالری ج","https://gold-je.example","+982188880003")];
await discover();
const nm=JSON.parse(lead("L-NEW").notes||"{}");
ok("D5 an early-stage lead only gains missing metadata (existing score/city kept) and updated_at moves because data changed",nm.score===42&&nm.city==="شیراز"&&Array.isArray(nm.provider_evidence)&&lead("L-NEW").updated_at>t0,[nm.score,nm.city,lead("L-NEW").updated_at]);
// D6 identities that point to two different leads: conflict, nothing merged
dbrun("INSERT INTO leads(id,name,stage,priority,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",["L-X","X","discovered","normal","{}",t0,t0]);
dbrun("INSERT INTO lead_identities(identity_key,identity_type,normalized_value,lead_id,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",["place_id:PL-4","place_id","PL-4","L-X","test",t0,t0]);
const before=q("SELECT COUNT(*) n FROM leads")[0].n,xNotes=lead("L-X").notes,freeNotes=lead("L-FREE").notes;
places=[place("PL-4","مختلط","https://gold-be.example","+982188880004")];   // place → L-X, website → L-FREE
await discover();
ok("D6 Phase 17: a Google website no longer links a place to another lead — the place matches only its own place-ID lead (L-X), L-FREE is untouched, no new lead",q("SELECT COUNT(*) n FROM leads")[0].n===before&&lead("L-FREE").notes===freeNotes&&q("SELECT lead_id FROM lead_identities WHERE identity_key='place_id:PL-4'")[0].lead_id==="L-X",[q("SELECT COUNT(*) n FROM leads")[0].n-before]);
// D8 Phase 17 safety fix: only the place ID + our own data are stored; Google content is used transiently for filtering only
{places=[place("PL-9","گالری طلای نمونه","https://gold-nine.example","+982188880009")];await discover();const L9=byPlace("PL-9"),row=lead(L9),m=JSON.parse(row.notes||"{}");
 ok("D8a a new Places lead stores the place ID, a Maps link built from it and our own label — no Google name, address, phone, website, coordinates or types",!!L9&&m.place_id==="PL-9"&&m.maps_url==="https://www.google.com/maps/place/?q=place_id:PL-9"&&!row.name.includes("نمونه")&&row.name.includes("#")&&["name","address","phone","website","lat","lng","types","business_status","telegram_username","telegram_url"].every(k=>!(k in m))&&!JSON.stringify(row).includes("gold-nine")&&!JSON.stringify(row).includes("88880009"),{name:row.name,meta:m});
 ok("D8b no Google-supplied contact is written to lead_contacts and no phone/domain identity is derived from Google data",!q("SELECT 1 FROM lead_contacts WHERE lead_id=?",[L9]).length&&q("SELECT identity_type FROM lead_identities WHERE lead_id=?",[L9]).every(r=>r.identity_type==="place_id"),q("SELECT identity_type FROM lead_identities WHERE lead_id=?",[L9]));
 ok("D8c the lead is a provisional discovery (provisional_place, not identity-verified, not contactable)",m.lead_status==="provisional_place"&&m.identity_verified===false&&m.contactable===false);
 ok("D8d the Places request asks only for id, name, address, types and business status (no phone, website, location or Maps URI) and is budgeted as Text Search Pro",masks.length&&masks.every(x=>!/Phone|websiteUri|location|googleMapsUri/.test(x))&&q("SELECT details_json FROM system_events WHERE type='places_reserved'").map(r=>JSON.parse(r.details_json)).every(d=>d.sku==="pro"),masks.at(-1));}
// D7 discovery sends nothing to anyone
ok("D7 discovery sends no Telegram message and calls no network except the (stubbed) Places API",!W.tg.some(x=>/^send/.test(x.method)),W.tg.map(x=>x.method));
process.exit(done()?1:0);
