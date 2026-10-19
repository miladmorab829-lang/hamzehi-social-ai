// Constant-time comparison for secrets (admin bearer token). Uses Workers' crypto.subtle.timingSafeEqual when present, otherwise a
// pure-JS XOR loop. Both strings are compared over the same padded length, so the time does not depend on where they first differ;
// the length mismatch is folded into the result instead of returning early.
const encoder=new TextEncoder();
export function safeTokenEqual(provided,expected){
  if(typeof provided!=="string"||typeof expected!=="string"||!expected)return false;
  const a=encoder.encode(provided),b=encoder.encode(expected),len=Math.max(a.length,b.length,1);
  const pa=new Uint8Array(len),pb=new Uint8Array(len);pa.set(a);pb.set(b);
  let same=a.length===b.length;
  try{
    const subtle=globalThis.crypto?.subtle;
    if(subtle&&typeof subtle.timingSafeEqual==="function")return subtle.timingSafeEqual(pa,pb)&&same;
  }catch{}
  let diff=0;for(let i=0;i<len;i++)diff|=pa[i]^pb[i];
  return diff===0&&same;
}
export function bearerMatches(header,token){
  return typeof token==="string"&&token.length>0&&safeTokenEqual(String(header??""),`Bearer ${token}`);
}
