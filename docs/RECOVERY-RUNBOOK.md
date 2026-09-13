# Recovery Runbook

1. Stop automated operations using the emergency-stop/automation guardrail.
2. Export/verify application data and recovery manifest.
3. Provision the backup runtime.
4. Configure server-side secrets.
5. Point the provider-neutral API contract to the backup runtime.
6. Restore data.
7. Run health/release checks.
8. Verify approval boundary.
9. Test one non-production publish.
10. Resume operations only after verification.

Never copy secrets into dashboard HTML or public files.
Never connect the recovery system to the HAMZEHI BOX website.
