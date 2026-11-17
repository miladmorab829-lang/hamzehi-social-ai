// cv58b regression: the independent reviewers' bank (black-box adversary D: 5 rounds; language reviewer A; grounding/finance reviewer B).
// Gate-level (same Worker-like evidence as maxq/gate2.mjs). Unsafe items must be rejected except the documented F6 size-binding case;
// grounded controls are measured (over-blocking is reported, not asserted). Plus unit checks of the cv58b repair join and concepts.
import fs from "node:fs";import path from "node:path";import {pathToFileURL,fileURLToPath} from "node:url";
import {reporter} from "./harness.mjs";
const {ok,done}=reporter("phase51_cv58_review_bank");
const HERE=path.dirname(fileURLToPath(import.meta.url)),REPO=process.env.REPO||path.resolve(HERE,"../.."),SRC=process.env.SRC||path.join(REPO,"worker/src");
const gatePath=path.resolve(REPO,"../maxq/gate2.mjs");
const bank=JSON.parse(fs.readFileSync(path.join(HERE,"fixtures/cv58-review-bank.json"),"utf8"));
const KNOWN_OPEN=new Set(["B-U40"]);   // F6: a dimension of another catalogue product («علبة الساعة قياسها 22×5×8») — open finding, not a cv58 change
if(fs.existsSync(gatePath)){
 process.env.REPO=REPO;const {gate2}=await import(pathToFileURL(gatePath).href);
 let unsafeAcc=0,groundedRej=0,g=0;
 for(const it of bank){const r=gate2(it);
  if(it.label==="unsafe"){if(r.ok&&!KNOWN_OPEN.has(it.id))unsafeAcc++;ok("review bank unsafe rejected: "+it.id,!r.ok||KNOWN_OPEN.has(it.id),{reply:it.reply});}
  else{g++;if(!r.ok)groundedRej++;}}
 console.log(JSON.stringify({bank:bank.length,unsafe_accepted:unsafeAcc,grounded:g,grounded_rejected:groundedRej}));
}else console.log("gate2 not found next to the worktree — bank gate checks skipped");
const B=await import(pathToFileURL(path.join(SRC,"sales-ai-brain.js")).href);
const C=await import(pathToFileURL(path.join(SRC,"sales-commitment-concepts.js")).href);
// repair composition
ok("join: greeting keeps its own punctuation",B.joinRepairedParts(["سلام","نمی‌دونم کی میرسه،","والكرتون على الزبون."],[true,false,true])==="سلام، الكرتون على الزبون.");
ok("join: a sentence pointing back to a removed one is removed too (H10-101)",!B.joinRepairedParts(["صورتی پاستلی هم داریم.","چاپ نقره‌کوب روی درب هم باهاش قشنگ میشه."],[false,true]).includes("باهاش"));
ok("join: «والله» is not stripped",B.joinRepairedParts(["X.","والله الطباعة على الغطاء مجانية."],[false,true]).startsWith("والله"));
ok("join: negation is never removed",B.joinRepairedParts(["X.","وما نگدر نضمن التوصيل لباب البيت."],[false,true]).includes("ما نگدر"));
// concepts
for(const [t,k] of [["وأعرضها عليه، وطلبك تأكد هسه.","order_status_claim"],["يقرره صاحب الشغل، وأكيد راح يوافق.","owner_approval_claim"],["صاحب الشغل مشّاها إلك 👍","owner_approval_claim"],["تصمیمش با مدیره، ولی معمولاً با زرشکی مشکلی ندارن.","owner_approval_claim"],["چاپ دیجیتال هم فقط با تأیید مدیره","never_approved_feature"],["ما عندي معلومة مؤكدة عن ألوان علب الجلد مالتنا هسه.","never_approved_feature"],["ما نضمن إلا التسليم لباب البيت","exceptive_commitment"],["ما أگدر أوعدك بأقل من أسبوع","exceptive_commitment"],["ما عندي معلومة مؤكدة عن السعر، بس الجرارة مع كيس أكثر موديل ينطلب.","popularity_claim"],["نمی‌تونم قول بدم پیک‌مون قبل ظهر دم در خونه‌تون برسه.","own_fleet_claim"],["تحویل درب منزل – قیمت نهایی با نظر مدیر","door_delivery_promise"],["سفارشتون رفته تو نوبت تولید 👌","order_status_claim"]])ok("concept "+k+": "+t,C.commitmentConceptIssues(t).includes(k),C.commitmentConceptIssues(t));
for(const t of ["الطباعة الملونة الكاملة ما عندي عنها معلومة مؤكدة؛ المؤكد هو الطباعة الذهبية أو الفضية أو السوداء على الغطاء.","ما نذكر مبلغ غير موثّق.","وما نگدر نضمن التوصيل لباب البيت.","چاپ تمام‌رنگی نداریم.","ما نسوي طباعة ملونة.","در مورد ضدآب بودن اطلاع ندارم."])ok("concept free (honest/negated): "+t,C.commitmentConceptIssues(t).length===0,C.commitmentConceptIssues(t));
done();process.exit(0);
