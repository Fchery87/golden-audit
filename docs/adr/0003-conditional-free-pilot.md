# Proceed to a tightly controlled FREE invite-only pilot under counsel's conditions (not a paid launch)

**Status:** accepted

Preliminary FCRA counsel opinion (received; non-privileged, to be validated by retained California/FCRA counsel before any paid launch) returned the **"proceed under conditions"** branch of our kill/pivot map (ADR-0001). Bottom lines:

- **FCRA CRA status (Q-L1): likely NOT a CRA**, conditional on a strictly maintained consumer-only delivery model. Any third-party delivery feature reopens the analysis immediately.
- **CROA (Q-L2): conditional yellow light** — outside only with strict product + marketing boundaries; outcome driven by marketing/pricing/onboarding/output.
- **Permissible purpose (Q-L3): user-upload-only is the cleanest model**; obtain express written authorization; never self-fetch reports in the pilot.
- **CCRAA (Q-L4): likely outside** while we don't furnish to third parties.
- **CCPA/CPRA (Q-L4): threshold-dependent**, but build CCPA-grade controls regardless; the FCRA/GLBA exemptions are narrow and cannot be stacked with a "not a CRA" position.
- **GLBA (Q-L5): material unresolved risk** — treat as APPLICABLE for security design until cleared (see ADR-0004).
- **UPL (Q-L5): low risk** if the taxonomy boundary is enforced (never apply a statute to the consumer's facts).

**Decision:** authorize continued development toward an **invite-only, genuinely FREE pilot** (no payment, no data sale, no unrelated model training), built to counsel's enumerated conditions (tracked in ticket 12). We explicitly do **NOT** approve any paid California launch until final pricing, marketing copy, sample Findings, authorization, privacy notice, terms, retention schedule, and vendor/data-flow diagram receive written legal clearance.

The free pilot doubles as the demand probe (ADR-0001's #2 risk): a free invite-only pilot is itself the test of whether the "restraint" value proposition resonates. Demand is folded into the pilot rather than run as a separate interview track.

This partly supersedes ADR-0001's "parser gated behind legal + demand" — the parser is now **unblocked for the free pilot**, but must be built to counsel's conditions (notably a redact-before-analyze stage and consumer-only delivery).
