# Direction Approved

## Selection record
- **Date:** 2026-07-29
- **Task:** Implement the real frontend UI for the Golden Audit pilot (React + Vite + Tailwind + shadcn/ui).
- **Gate:** huashu-design three-direction hard gate (Phase 1–5).

## Directions shown (all on identical representative content: landing + sample finding)
Three structurally distinct directions were produced with real renders (dark + light):

| Direction | Logic / benchmark | Accent | Typography | Skeleton |
|---|---|---|---|---|
| A · Trust Ledger | Reality ref → Stripe / Plaid | Indigo `#4F46E5` | Instrument Serif display + Inter body + JetBrains Mono | Centered hero, single column, data-forward card |
| B · Calm Audit | Best designer → quiet editorial (Hara / report) | Teal `#0F766E` | Newsreader serif throughout + JetBrains Mono ledger | Asymmetric, rule-divided masthead, finding as pull-quote |
| C · Signal Map | Roulette → modern analytics (Linear / Vercel) | Emerald `#10B981` + Amber `#F59E0B` | Space Grotesk + Inter + IBM Plex Mono | Dashboard grid, chips, stat strip, ranked rows |

Artifacts:
- `design-demos/direction-a-trust-ledger.html` + `a-trust-ledger-{dark,light}.png`
- `design-demos/direction-b-calm-audit.html` + `b-calm-audit-{dark,light}.png`
- `design-demos/direction-c-signal-map.html` + `c-signal-map-{dark,light}.png`

## User selection (verbatim)
Selected: **B · Calm Audit (Teal + all-serif)**.

Recommended was A; user chose B for its "careful educational reading, not a repair service" tone.

## Implementation direction
- Stack: React + Vite + TypeScript + Tailwind CSS + shadcn/ui (Radix primitives owned in-repo).
- Theme tokens carry the Calm Audit palette: dark base `#1A1916`, light base `#F6F4EE`, accent teal `#0F766E` (light) / `#2DD4BF` (dark), Newsreader serif for display + prose, JetBrains Mono for numeric/ledger data with `tabular-nums`.
- Honors research rules: near-black not pure `#000`, 60-30-10, never color-alone (severity = color + label).
- Adaptation (noted): Newsreader is the primary face; JetBrains Mono is used for numeric/tabular data so dense number UIs stay readable — this is faithful to Direction B's own sample (mono ledger).
