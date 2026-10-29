// PHASE 16.15 — /api/health environment metadata: the public health check used to report a hard-coded production:true, so the
// staging Worker (HAMZEHI_ENVIRONMENT="staging") identified itself as Production. Production (no HAMZEHI_ENVIRONMENT var) must keep
// production:true; the route stays public and exposes no secret. Local only: Telegram and the AI provider are in-process mocks.
import {makeWorld,reporter} from "./harness.mjs";
const {ok,done}=reporter("phase16_15");
const started=Date.now();

{const W=await makeWorld({aiBrain:"off"});const h=await W.call("/api/health",null,"GET");
 ok("H1 Production profile (no HAMZEHI_ENVIRONMENT): /api/health 200 with production:true",h.status===200&&h.body?.ok===true&&h.body?.production===true,h.body);
 ok("H2 Production profile reports environment \"production\"",h.body?.environment==="production",h.body?.environment);
 ok("H3 no request left the machine except the in-process mocks",!W.offNet().length,W.offNet());}

{const W=await makeWorld({aiBrain:"off",extraEnv:{HAMZEHI_ENVIRONMENT:"staging"}});const h=await W.call("/api/health",null,"GET");
 ok("H4 [16.15 FIX] staging profile: /api/health 200 with production:false",h.status===200&&h.body?.ok===true&&h.body?.production===false,h.body);
 ok("H5 staging profile reports environment \"staging\"",h.body?.environment==="staging",h.body?.environment);
 ok("H6 the health body carries no secret or token value",!/token|secret|key/i.test(JSON.stringify(Object.values(h.body||{}))),h.body);}

console.log(`phase16_15 time ${((Date.now()-started)/1000).toFixed(1)} s`);
process.exit(done()?1:0);
