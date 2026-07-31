# Secrets and access evidence (working)

> **Status:** Working record for the current California one-state pilot. This is not approval and not production certification. It captures where secrets live and how privileged access is controlled.

## Secret locations
| Secret / credential class | Storage location | Access restriction | Rotation owner | Notes |
|---|---|---|---|---|
| database credentials | Cloudflare D1 binding / Pages Functions env | Cloudflare account admin only | Security / Ops | Use the `PILOT_DB` binding; no raw credential is committed to git. |
| signing keys | secret manager / future env binding | Security-only access | Security | Not enabled for the current pilot surface. |
| provider tokens | secret manager / provider dashboard | Named owner only | Ops / Vendor | Only if a provider is added later. |
| backup credentials | Cloudflare account / provider-managed | Account admin only | Ops | D1/R2 pilot uses provider-managed access; no shared credentials. |

## Privileged access controls
- **Access review owner:** `Security / Ops`
- **Review cadence:** `monthly`
- **MFA enforced on:** `Cloudflare account admin, Pages project admin, D1 admin, R2 admin`
- **Shared credentials allowed:** `no`

## Notes
- Do not mark this complete until real systems and owners are named.
- Link final evidence back to `docs/glba-wisp-skeleton.md`, `docs/security-evidence-tracker.md`, and `docs/pilot-readiness-gap-checklist.md`.
