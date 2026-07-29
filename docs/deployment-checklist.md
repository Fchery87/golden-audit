# Deployment and Release Checklist

## Before release
- Confirm the runtime store exists and is writable.
- Confirm the web boundary starts and returns onboarding payloads.
- Confirm the client build succeeds.
- Confirm the smoke check passes.

## Release order
1. runtime storage
2. service startup
3. browser smoke
4. observability hooks
5. operator documentation

## Post-release
- Watch for analysis failures, upload failures, and persistence failures.
- Record any approval changes in the human-gates packet set.
- Keep rollout claims state-bounded until legal review changes the posture.
