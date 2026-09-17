/**
 * V9.2 Live Dashboard Adapter.
 * Safe boundary between UI and the existing Worker runtime.
 * It never owns credentials and never performs sensitive side effects.
 */
const TARGET = Object.freeze({
  repo:"miladmorab829-lang/hamzehi-social-ai",
  worker:"hamzehi-social-ai"
});
const READ_ROUTES = new Set([
 "/api/health","/api/operations","/api/campaigns","/api/content","/api/media",
 "/api/calendar","/api/leads","/api/crm","/api/inbox","/api/analytics",
 "/api/experiments","/api/learning","/api/skills","/api/providers","/api/queue",
 "/api/incidents","/api/approval","/api/audit","/api/settings"
]);
const MUTATION_ROUTES = new Set([
 "/api/campaigns/plan","/api/content/brief","/api/media/qa","/api/leads/qualify",
 "/api/crm/update","/api/experiments/propose","/api/jobs/schedule"
]);
const SENSITIVE = new Set([
 "/api/publish","/api/messages/send","/api/deploy","/api/secrets/change"
]);

export function assertLiveTarget(ctx={}) {
 if(ctx.repo!==TARGET.repo || ctx.worker!==TARGET.worker)
   throw new Error("SCOPE_BLOCKED");
 return true;
}
export function classifyLiveRoute(method,path){
 if(SENSITIVE.has(path)) return "APPROVAL_REQUIRED";
 if(method==="GET" && READ_ROUTES.has(path)) return "READ_ONLY";
 if(method==="POST" && MUTATION_ROUTES.has(path)) return "MUTATION";
 throw new Error("ROUTE_BLOCKED");
}
export function buildLiveRequest(input={}){
 if(!input.request_id || !input.path) throw new Error("VALIDATION_ERROR");
 const kind=classifyLiveRoute(input.method||"GET",input.path);
 if(kind==="MUTATION" && !input.idempotency_key) throw new Error("IDEMPOTENCY_REQUIRED");
 return {
   request_id:String(input.request_id),
   correlation_key:String(input.correlation_key||input.request_id),
   path:String(input.path), method:String(input.method||"GET"),
   kind, idempotency_key:input.idempotency_key||null,
   side_effect:kind==="APPROVAL_REQUIRED",
   external_execution:false
 };
}
export function liveHealthSnapshot(){
 return {status:"READY",target:TARGET.worker,mode:"SAFE_LIVE_ADAPTER",
         external_side_effects:"GATED",credentials_owned:false};
}

export const DEPLOYMENT_POLICY = Object.freeze({auto_deploy:false, sensitive_actions:"APPROVAL_REQUIRED"});
