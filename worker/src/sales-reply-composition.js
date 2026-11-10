// Conversational text is separate from business assertions. Nothing in this module grants a price, capability or delivery promise.
const normal=s=>String(s||'').normalize('NFKC').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\u064b-\u065f]/g,'').replace(/‌/g,' ').replace(/\s+/g,' ').trim();
// Assent (yes/sure/حتماً/أكيد) is NOT a courtesy: detaching it can confirm the very claim that was rejected.
const courtesy=/^(?:سلام(?: علیکم)?|درود|هلا(?: ب[یي](?:ک|ك|کم|كم))?|مرحبا|وعل[یي]کم السلام|ممنون(?:م)?|مرسی|خواهش می[‌ ]کنم|ش[کك]راً?|خوش اومدید|خوش آمدید|وقت(?:تون|تان)? بخیر)(?=[\s،,!。.🌸🙏🙂😊👋]|$)[\s،,!。.🌸🙏🙂😊👋]*/iu;
export function splitSalesReply(value){
  let rest=String(value||'').trim();const parts=[];
  // Greetings often share a sentence with an unsupported claim. Preserve only the recognised courtesy, not the whole sentence.
  while(rest){const m=rest.match(courtesy);if(!m)break;
    parts.push(m[0].trim());rest=rest.slice(m[0].length).trim();
  }
  return [...parts,...rest.split(/(?<=[.!?؟\n؛;])(?=\s|$)/u).map(x=>x.trim()).filter(Boolean)];
}
const tidy=s=>normal(s).replace(/[،,!。.؟?🌸🙏🙂😊👋]/gu,' ').replace(/\s+/g,' ').trim();
const harmlessCourtesy=s=>/^(?:سلام(?: علیکم)?|درود|هلا(?: بی(?:ک|کم))?|مرحبا|وعلیکم السلام|ممنون(?:م)?|مرسی|خواهش می کنم|شکرا|خوش اومدید|خوش آمدید|وقت(?:تون|تان)? بخیر)$/iu.test(tidy(s));
const uploadReply=s=>/^(?:بله[،\s]+)?(?:تصویر|عکس|فایل) (?:لوگو|طرح)(?: را| رو)? (?:همین جا|همینجا|در تلگرام) (?:بفرستید|بفرستین|ارسال کنید)[.!؟?]*$/iu.test(normal(s))||/^(?:اکید[،\s]+)?(?:دز|ارسل|أرسل) (?:صورة|صوره) (?:الشعار|التصمیم) (?:هنا|بالتلغرام)[.!؟?]*$/iu.test(normal(s));
// Only these questions can accompany immutable service facts. They ask for a preference; they cannot assert a new business fact.
export function serviceQuestionField(s){const t=tidy(s);
  if(/^(?:سفارش (?:را |رو )?)?(?:برای )?ایران (?:است یا|یا|می خواید یا) عراق(?: است|می خواید)?$/u.test(t)||/^(?:الطلب )?(?:لإیران|ایران) (?:لو|او|أو) (?:للعراق|العراق)$/u.test(t))return 'market';
  if(/^(?:حدودا )?(?:چه تعدادی|چند عدد) (?:لازم دارید|نیاز دارید|می خواید|مدنظر(?:تون|تان)? هست)$/u.test(t)||/^(?:شکد|شگد|کم) (?:تحتاج|قطعة تحتاج|الکمیة)$/u.test(t))return 'quantity';
  if(/^(?:کدوم|کدام|چه) مدل(?:ی)? (?:را |رو )?(?:می پسندید|می خواید|مدنظر(?:تون|تان)? هست|انتخاب می کنید)$/u.test(t)||/^(?:ای|أی|شنو) مودیل (?:تفضل|یعجبک|ترید)$/u.test(t))return 'model';
  if(/^(?:چه|کدوم|کدام) رنگ(?:ی)? (?:را |رو )?(?:می پسندید|می خواید|مدنظر(?:تون|تان)?(?: هست|ه)|انتخاب می کنید)$/u.test(t)||/^(?:ای|أی|شنو) لون (?:تفضل|یعجبک|ترید)$/u.test(t))return 'color';
  if(/^(?:برای )?(?:کدام|کدوم|چه) شهر(?:ی)? (?:می خواهید|می خواید)$/u.test(t)||/^وین یکون التسلیم$/u.test(t))return 'destination';
  return null;
}
export function serviceCompanionParts(reply,{message='',market=null,destination=null,quantity=null,productKnown=false,colorsChosen=false}={}){
  const clean=String(reply||'').replaceAll('{{INFORMATION}}','').replaceAll('{{COMMERCIAL}}','');const opening=[],answers=[],questions=[];
  const asked=normal(message),uploadAsked=/(?:لوگو|طرح|شعار|تصمیم)/iu.test(asked)&&/(?:بفرستم|بفرستیم|ارسال کنم|ارسال کنیم|(?:کجا|چطور).*(?:بفرست|ارسال)|(?:ادز|أدز|ارسل|أرسل).*(?:هنا|هنه|تلغرام))/iu.test(asked)&&!/(?:لوگو|طرح|شعار).*(?:ندارم|فرستادم|ارسال کردم|ما عندی|دزیت|ارسلت)/iu.test(asked);
  for(const p of splitSalesReply(clean)){
    if(harmlessCourtesy(p)){if(opening.length<2)opening.push(p);continue;}
    if(uploadReply(p)&&uploadAsked){answers.push(p);continue;}
    const field=serviceQuestionField(p);if(!field||questions.length)continue;
    if(field==='market'&&market||field==='destination'&&destination||field==='quantity'&&Number.isSafeInteger(quantity)||field==='model'&&productKnown||field==='color'&&colorsChosen)continue;
    questions.push(p);
  }
  return {opening:opening.join(' '),answers:[...new Set(answers)],question:questions[0]||null};
}
