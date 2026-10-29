// Weekly video (Kling omni-video) per-shot prompt builder — Phase 16.16-P1 (D-P1).
// Kling caps every multi_prompt storyboard prompt at 512 characters and rejects the whole submission otherwise (HTTP 400
// "multiPrompt[0].prompt: size must be between 0 and 512", weeks 2026-W41/W43/W44). The previous builder joined the shot direction,
// the concept story and seven fixed sentences (about 640 characters), so every weekly submission failed before any video work.
// Prompts are now assembled by priority inside a budget below the limit. Length is measured in UTF-16 code units (String.length),
// the unit Java's @Size counts; a prompt is never longer in Unicode code points either, and a surrogate pair is never split.
export const KLING_SHOT_PROMPT_MAX=512;
export const KLING_SHOT_PROMPT_BUDGET=500;   // headroom below the provider limit
// Mandatory, always kept whole: the approved product identity and the output constraints (audio, no generated text).
export const KLING_PROMPT_IDENTITY="Keep the exact real HAMZEHI BOX product from the reference image: same shape, proportions, colors, materials and details.";
export const KLING_PROMPT_OUTPUT="Instrumental music only; no voice, speech, dialogue, subtitles or text in the scene (end card added separately).";
// Brand style: kept whole when it fits, dropped otherwise.
export const KLING_PROMPT_STYLE="Premium luxury commercial cinematography, smooth controlled camera, refined lighting.";

const clean=v=>String(v??"").replace(/\s+/g," ").trim();

// Shortens text to at most `max` UTF-16 code units without splitting a character; prefers a word boundary; marks the cut with "…".
export function clipPromptText(text,max){
  const s=clean(text);if(s.length<=max)return s;if(max<2)return "";
  let out="";for(const ch of s){if(out.length+ch.length>max-1)break;out+=ch;}
  const sp=out.lastIndexOf(" ");if(sp>=Math.floor(max*0.6))out=out.slice(0,sp);
  out=out.replace(/[\s,;:.\-–—]+$/u,"");
  return out?out+"…":"";
}

// Priority (highest first): product identity, output constraints, the shot's scene direction, brand style, concept story.
// Final order reads naturally: direction, story, identity, style, output constraints.
export function buildKlingShotPrompt(shot,brief,max=KLING_SHOT_PROMPT_BUDGET){
  const sep=1,mandatory=KLING_PROMPT_IDENTITY.length+sep+KLING_PROMPT_OUTPUT.length;
  let left=Math.max(0,Math.min(max,KLING_SHOT_PROMPT_MAX)-mandatory);
  const take=(text)=>{const t=clipPromptText(text,Math.max(0,left-sep));if(t)left-=t.length+sep;return t;};
  const direction=take(shot?.direction);
  const style=left>=KLING_PROMPT_STYLE.length+sep?take(KLING_PROMPT_STYLE):"";
  const story=take(brief?.story);
  return [direction,story,KLING_PROMPT_IDENTITY,style,KLING_PROMPT_OUTPUT].filter(Boolean).join(" ");
}

// Final guard at the API boundary: non-empty, within the provider limit, no lone surrogate.
export function klingShotPromptProblem(prompt){
  const p=String(prompt??"");
  if(!p.trim())return "empty prompt";
  if(p.length>KLING_SHOT_PROMPT_MAX)return `prompt is ${p.length} characters (limit ${KLING_SHOT_PROMPT_MAX})`;
  if(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(p))return "prompt contains a broken Unicode character";
  return null;
}
