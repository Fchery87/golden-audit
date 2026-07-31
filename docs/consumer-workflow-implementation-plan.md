# Consumer workflow implementation plan

> **Status:** Working implementation plan covering the end-to-end consumer workflow — registration through delivered analysis report. This is not approval, not legal review, and not production certification. It supersedes the UX and analysis-scope assumptions in `docs/pilot-stack-implementation-plan.md`; the stack choices there (Pages / Functions / R2 / D1) are unchanged and reaffirmed.
>
> **Derived from:** a full code review of the current workflow (2026-07-31) plus first-party competitor research into how comparable platforms structure credit audit artifacts. Twelve decisions were resolved explicitly; each is recorded below with its rationale and its rejected alternatives.

## Scope

The workflow this plan covers:

```
land → register (invite-gated) → consent → written authorization → state attestation
     → upload IdentityIQ PDF → parse → cross-bureau matching → deterministic analysis
     → report (findings + education + coverage) → export / print → deletion on request
```

---

## Part 1 — Current-state findings

Every item below was verified against the source, not inferred. These are the gaps the plan closes.

### Blocking defects

| # | Finding | Location |
|---|---|---|
| 1 | **PDF parsing cannot run on the deployed target.** `extractBboxFromPdfBytes` shells out to `pdftotext -bbox` via `execSync`. `node:child_process` does not exist in Workers. `packages/platform` statically imports it, so the bundle carries it regardless of code path. | `packages/platform/src/index.ts:7,958` |
| 2 | **Entire platform state lives in one D1 row.** `pilot_state['platform-snapshot']` holds every user's password hash and salt, every session, and `rawUploadBytes` base64. Read-modify-written per request → last-write-wins; two concurrent users corrupt each other silently. | `apps/web/functions/api/_platform.ts` |
| 3 | **A single upload exceeds the row.** A 2.6 MB IdentityIQ PDF base64-encodes to ~3.5 MB inside that blob. D1 documents roughly a 1 MB ceiling on a single value. First real upload fails. | `_platform.ts`, `platform:exportSnapshot` |
| 4 | **The written authorization is never shown.** `AUTHORIZATION_TEXT` and `RETENTION_POLICY` appear only in `packages/platform` and in tests. No endpoint returns them; no component renders them. The client posts `{}` to `/consumer/authorization`. The FCRA Q-L3 artifact the entire legal posture rests on is a button next to invisible text. | `platform:33-49`; `client/src/lib/api.ts:144` |
| 5 | **"Invite-only" is not enforced.** Claimed in hero copy, in `launchScope`, and throughout `docs/`. `register()` checks email format, password length, and duplicates — no invite gate. | `platform:336` |
| 6 | **Deletion is promised in writing and not implemented.** `requestDeletion` exists and is unrouted. R2 upload blobs are written by `persistUpload` and never removed. `AUTHORIZATION_TEXT` promises deletion on request; `RETENTION_POLICY` promises 30 days. | `platform:651`; `_platform.ts:storeUploadBlob` |
| 7 | **Matching collapses distinct accounts.** `proposeMatches` keys on `creditor + maskedAccount`; the PDF adapter always sets `maskedAccount: ''`. Two cards from one issuer merge into one group, and the balance rule then reports a phantom cross-bureau discrepancy between two different accounts. | `platform:585`; `identityiq-pdf-adapter.ts:102` |
| 8 | **The cross-bureau rule never checks bureau.** `crossBureauBalanceDifference` compares balances within a match group without verifying the lines come from different bureaus. Currently masked by (7); becomes live the moment account numbers are extracted. | `analysis-core/src/engine.ts:59-90` |
| 9 | **No sign-in route.** `signIn()` exists, unrouted. Sessions live in `localStorage` with no expiry. Clearing the browser permanently destroys the account; no password reset exists. | `platform:346` |

### Product gaps against the stated objective

| Area | Stated intent | Actual |
|---|---|---|
| Upload | HTML or PDF | No file input exists. A `<textarea>` of fictitious JSON, base64-wrapped with a `GOLDEN-AUDIT-REPORT:` marker. Real IdentityIQ HTML is ruled out by our own research (`docs/parsers/identityiq-field-map.md`: AngularJS template shell, no per-account data) — **PDF-only is correct and stays.** |
| Registration flow | Consumer product | Six-step API diagnostic with per-step "Re-run" buttons and credentials prefilled as `pilot@example.com` / `correct horse battery staple`. Re-running consent or authorization re-records a legally meaningful acceptance. |
| State selection | User selects state | Hero availability check is cosmetic; `api.consent()` hardcodes `residence: 'CA'`. |
| Findings breadth | Inaccuracies, inconsistencies | **One** registered rule evaluator: `cross-bureau-balance-difference`. |
| Extraction depth | Full report analysis | Adapter extracts **recent balance only**; `maskedAccount`, `status`, `opened`, `updated` hardcoded null/empty. |
| Education | "Tons of valuable updated context" | **One** module, 6 words: *"Bureaus can update on different dates."* Module bodies never join into the report — only IDs travel. |
| Per-finding detail | Why it matters, how to address | `Finding` carries `alternativeExplanations`, `verificationDocuments`, `suggestedAction`, `authorityIds`, `limitations`. The engine populates all of them. **The UI renders none of them** — only title, severity, confidence. |
| Deliverable | "Well drafted report" | Pretty-printed JSON in a `<pre>` block behind a "Show export artifact" button. |

### What is already good and is being kept

- **Consent and authorization gating** — `requireAuthorization()` genuinely blocks processing before acceptance.
- **The output guard** (`packages/output-guard`) — fail-closed, three forbidden vocabularies mapped to counsel conditions Q-L2/Q-L4/Q-L5, plus residual-identifier detection. The strongest component in the repo.
- **The suppression model** — `RuleAudit` with `triggered | skipped | suppressed` and a reason, plus `CanonicalValue.state` (`known | unknown | blank | not-applicable | parser-failed`). Built, correct, and currently discarded at the render layer.
- **Provenance** — every value carries page/element locator, original display text, extraction method, parser version, confidence.
- **Migration 002** — a correct per-user relational schema with foreign keys, written and then bypassed.
- **The `Word[]` seam** — `bbox-extractor.ts:8` already documents the pdfjs swap as the intended production path.

---

## Part 2 — Competitor research findings

First-party sources: Credit Repair Cloud, 605b.ai, ScorePros AI, Pinnacle/ACAT, Ultra Dispute, plus CFPB / TransUnion / myFICO consumer-education references. Complements the positioning analysis in `docs/competitor-credit-positioning-brief.md`, which covers *what to say*; this covers *what the artifact looks like*.

### The converged three-layer structure

1. **Summary layer** — tri-bureau score comparison, counts (tradelines / negatives / collections / inquiries / public records), rolled-up totals.
2. **Section walkthrough mirroring the report's own anatomy** — Personal Information → Accounts → Collections → Public Records → Inquiries. Universal across TransUnion, CFPB, myFICO, 700Credit, and every audit tool, because it matches the mental model users already have.
3. **Per-item finding card**, one repeated schema.

### The finding card (605b.ai — closest posture match)

> **Capital One Account #8 (517805XXXXXX)** · `Flagged for Review` · `Discrepancy`
> Documentation Basis **§611** · Review Priority **High** · Evidence Strength **Strong**
> *"Account shows charged-off status on one bureau but only closed-by-creditor on others, with a $185 balance and past-due amount inconsistent across bureaus."*
> **Suggested Next Step:** Prepare documentation noting the inconsistent charge-off status and balances across all three bureaus.
> `[Prepare Documentation]` `[Dismiss]`

Plus a flat ledger table of all flagged items, and PDF export.

**Our `Finding` type is already a superset of this card.** Nothing is structurally missing; it is purely unrendered.

### The key boundary insight

605b.ai cites statutes (§611, §623, FDCPA §809) while disclaiming *"not a credit repair organization… does not provide legal advice… does not guarantee outcomes."* They label it **"Documentation Basis,"** not "violation," and describe their labels as **"safe priority labels."**

**Citing a statute as *why a field matters* is compatible with analysis-only. Asserting the statute was violated is not.** Our `Authority` type (`citation`, `jurisdiction`, `effectiveFrom`, `permittedUse`, `limitations`) already models exactly this distinction.

### The check catalog (industry union)

| Category | Checks |
|---|---|
| Identity | name / SSN / DOB / address variance across bureaus; mixed-file indicators |
| Duplication | same account twice across bureaus, or twice within one bureau |
| Cross-bureau divergence | balance, past due, credit limit / high credit, status, payment rating, payment-history grid, DOFD, date opened, date of last activity, account type |
| Internal contradiction | "paid/closed" with balance > 0; "transferred/sold" with balance ≠ $0; status "current" but grid shows delinquency; past due > balance |
| Date logic | DOFD moving forward (re-aging); opened-after-other-dates; last payment after closed |
| Obsolescence | past the 7-year window (10 for bankruptcy) |
| Inquiries | hard pulls the consumer doesn't recognize |
| Utilization | revolving account reporting no credit limit |

We currently implement **one cell** of this table.

### The universal promise we don't yet keep

ScorePros states it directly: *"Every finding tells you what it is, why it matters, and what to do next."* That triad is the product. We compute all three and discard them at render.

---

## Part 3 — Decisions

### D1 · Product boundary: educational analysis only

Findings are Observations and verification recommendations. The product never emits a legal verdict. Statutes may appear as **Documentation Basis** — context for why a field matters — never as a claim that a law was broken.

*Rejected:* compliance-flavored output ("this looks like an FCRA §1681s-2 problem"). CROA and state credit-services-organization statutes target exactly that framing; the 25 state memos in `docs/` trace the exposure, and the CA-only invite posture exists because of it. The depth the product needs lives entirely inside the educational boundary — the current shallowness comes from a six-word corpus and a discarded render layer, not from the boundary.

*Consequence:* the word "violations" in the original product description is retired. `CONTEXT.md` already bans it as a Finding label.

### D2 · Report renders the full finding schema, with explicit coverage disclosure

Render every field the engine computes. The report states which checks ran, which were suppressed and why, and which fields the parser could not read on this document. `RuleAudit` is surfaced rather than discarded.

*Rejected:* findings-only with silent coverage (what competitors do); gating the report behind full extraction (ships nothing for months).

*Rationale:* a product differentiated on not overclaiming cannot imply twelve-field coverage from a partial parse. This converts the biggest weakness into a trust statement competitors structurally cannot make — their accuracy marketing depends on never itemizing what they missed.

*Accepted cost:* a partly-empty checklist demos weaker than a wall of red.

### D3 · Stay on Cloudflare; replace poppler with pure-JS extraction

`extractBboxFromPdfBytes` swaps to `unpdf`/`pdfjs-dist` emitting an identical `Word[]`. `node:fs` and `node:child_process` are excised from `packages/platform` behind the runtime-store seam.

*Rejected:* Node runtime with poppler (discards the Cloudflare migration of the last five commits); hybrid (two runtimes, two deploys, two vendor entries, for an invite-only single-state pilot).

*Rationale:* the seam is one function wide and already documented as the intended swap. Adapter, `positional-types.ts`, bureau-column detection, and every parser test consume `Word[]` unchanged.

*Named risks — all validated in Phase 0:*
- **Coordinate origin flip.** pdfjs is bottom-left; poppler `-bbox` is top-left. The adapter sorts `a.yMin - b.yMin` assuming top-down and bands rows at ≤4 units. Unflipped coordinates invert row grouping and parse "successfully" into garbage. Requires an explicit y-flip plus a regression test against a known-good `Word[]` fixture.
- **Workers CPU budget** against the real 2.6 MB / 13-text-page sample.
- **Bundle size** against the Workers script limit; `unpdf` is the mitigation.

### D4 · Tiered parser depth — core 6 first, full Metro 2 as the destination

**Slice 1 (core 6):** account number, account type, account status, date opened, date reported / last activity, and the money trio (balance, past due, credit limit / high credit).
**Slice 2:** DOFD, 24-month payment-history grid, remarks, special comment codes.

**Tiering is the sequencing, not the ceiling.** Slice 2 is committed work, not optional. The D2 coverage table doubles as the visible roadmap.

*Rejected:* all twelve fields in one pass (twelve fields against four samples with no field-level regression harness is how an adapter overfits to the 2025 report and mangles the 2020 one — our own field map flags this); balance-only (leaves the phantom-discrepancy bug live).

*Rationale:* **account number is load-bearing and not optional** — it fixes the matching defect (finding 7) that currently produces false findings in the one rule we ship. The core 6 unlocks the whole cross-bureau divergence row, the internal-contradiction row, and utilization gaps. Deferring DOFD and the grid is prudent twice: the grid is the densest positional structure on the page and most likely to overfit, and DOFD analysis *is* re-aging analysis — the finding most likely to read as a legal accusation, so it needs the D1 framing worked out first rather than retrofitted.

*Standing constraint:* depth is safe only while suppression stays strict. A field with low confidence or ambiguous provenance produces **no finding**. `CanonicalValue.state` and the suppression audit must stay wired as fields are added, not decay into formality. Depth purchased by guessing is the failure mode of the platforms marketing "99.5% detection accuracy."

*Validation gate:* all four PDF samples (2020 / 2021 / 2023 / 2025) yield three-bureau tradelines before the adapter is trusted.

### D5 · Activate migration 002 — real per-user persistence

Per-entity tables and queries. Raw PDF bytes live in **R2 only**, never in D1. Sessions become rows with expiry. `requestDeletion` becomes real `DELETE`s plus an R2 object delete.

*Rejected:* per-user snapshot rows — **unworkable**, because `requireSession(sessionId)` resolves a session before knowing its user, so per-user blobs force either a full scan per authenticated request or a separate global session index, which is option A built badly. It also leaves PDF bytes in D1 (the size wall stands) and fixes neither deletion nor R2 orphans. Also rejected: shipping on the global snapshot — the failure is silent data loss and an unkeepable written deletion promise on consumer credit files.

*Rationale:* the schema is already written and reviewed; this is activation, not design. It eliminates last-write-wins structurally and removes the most sensitive bytes we hold from the database entirely.

*Accepted cost:* the largest single chunk of work in the plan. `CreditAnalysisPlatform` is a ~1,000-line in-memory object with 40+ `Map`s that assumes it holds all state; `exportSnapshot`/`importSnapshot` exist because of that assumption. This requires a real repository seam underneath it.

### D6 · Build the real consumer flow; demote the wizard to `/debug`

Linear, one decision per screen, resumable. `AUTHORIZATION_TEXT` and `RETENTION_POLICY` rendered **in full** before acceptance. Real file upload (init/complete collapse into one user action). Sign-in, account, and deletion surfaces. The D2 report as a proper reading surface. The six-step wizard is **kept**, moved behind `/debug` as the diagnostic it is.

*Rejected:* evolving the wizard in place — the six-step frame is the problem, not the widgets. A legally meaningful authorization screen cannot coexist with a "Re-run" button, and collapsing init/complete deletes two of the six steps; by the time it's correct it has become a rebuild without the coherence. Also rejected: keeping the wizard for a hand-held pilot — the thing that defers is the authorization screen, which is the artifact the entire D1 boundary depends on and the first thing counsel asks to see.

*Accepted cost:* roughly a dozen screens counting sign-in, account, deletion confirmation, upload error states, and the report. The largest *visible* chunk, as D5 is the largest invisible one.

### D7 · Two-tier, authority-anchored education corpus in reviewed content files

**Tier 1 — section primers** (what a tradeline is, how utilization works, what an inquiry does, how to read a payment grid) rendered in the D2 section walkthrough, following the "How This Impacts Your Credit Score" pattern.
**Tier 2 — per-finding modules** rendered inline in the finding card.
Every module cites a public authority (CFPB / FTC / bureau documentation) via the existing `authorityIds` link. Corpus lives as **reviewed content files in the repo**, not code constants.

*Rejected:* per-finding only (leaves the zero-findings case empty); linking out (fails the objective and offloads trust).

*Rationale:* the **zero-findings case** is decisive. Today a clean report renders `"No disagreements surfaced."` and nothing else. With coverage at 6 of 12 fields and most accounts agreeing across bureaus, that is a common outcome, not an edge case. Section primers give the report standalone value regardless of finding count. Authority-anchoring is the difference between *"we assert this about credit"* and *"here is what the CFPB says, and here is how it applies to line 14 of your report."*

**Blocker to fix as part of this:** the governance gate is currently theater. `bootstrapPublishedRulesets` registers `web-compliance-reviewer`, creates content, and approves it with that same synthetic reviewer in one function with no human involved — an audit trail that certifies its own output. Content files must be reviewed and merged by a person, with reviewer identity recorded from the merge rather than minted in `server.ts`.

*Standing obligation:* "updated" is continuous. Medical-debt thresholds and BNPL furnishing are in flux. `effectiveFrom` only helps if a human revisits it on a schedule.

### D8 · Rule catalog with strict absence handling

**Slice-1 rules (~10):** cross-bureau divergence on balance, past due, credit limit / high credit, status, date opened; internal contradictions (closed/paid with balance, past due > balance); missing credit limit on a revolver; duplicate tradeline within one bureau; partial furnishing.

**Two mandatory corrections:**
- Add an explicit **distinct-bureau guard** to cross-bureau rules; route same-bureau collisions to the duplicate-tradeline rule (fixes finding 8).
- **Absence is not disagreement.** Partial furnishing (2-of-3 reporting) surfaces as a **collapsed, low-severity `observed-fact` Observation** — one card ("6 accounts are reported by fewer than three bureaus"), expandable, with an education module explaining that partial furnishing is normal and not itself an error.

*Rejected:* suppressing partial furnishing entirely (discards real information the consumer cannot get elsewhere); surfacing it only in combination with another finding (the same fact appears or disappears based on an unrelated rule — unexplainable in a report whose selling point is explaining itself).

*Accepted cost:* the first screen may lead with a collapsed group of normal observations rather than a wall of red.

### D9 · The web report is the document

One rendering path. A real `@media print` stylesheet so the browser's own "Save as PDF" produces a clean, paginated artifact. The JSON export is retained, demoted to a secondary "download my data" affordance, and **expanded to mirror the full report** — overview counts, coverage table, findings with evidence and provenance, education references, suppression audit. (It currently drops `ConsumerReport.overview` entirely.)

*Rejected:* server-generated PDF via Cloudflare Browser Rendering — a new paid binding, vendor-inventory entry, and security review; and the thing it primarily buys is *emailing the report*, which D1's authorization text explicitly forbids ("Return the Findings only to me"). Deferred, not foreclosed: it would render the same HTML, so the content model is unaffected.

*Rationale:* two rendering paths means two places a finding can be phrased differently, a limitation can go missing, or `assertSafeConsumerOutput` can guard one and not the other. In a product whose thesis is calibrated accuracy, a document that disagrees with the screen is the worst possible bug.

*Accepted cost:* print output varies across browsers and needs per-browser testing. No server-side archival copy of the rendered document — though the JSON export plus `rulesetVersion` and parser version reconstruct any report deterministically.

### D10 · Invite gate, session hardening, rate limiting, email-backed reset

- **Invite codes required at registration.** Non-negotiable: "invite-only" is currently a factual claim in marketing copy and legal scope documents that the code does not enforce.
- **Sessions** move to `httpOnly` / `Secure` / `SameSite` cookies with absolute and idle expiry, rotating on privilege change.
- **Rate limiting** via Cloudflare WAF rules — configuration, not code.
- **Email verification and password reset** via a transactional email vendor.
- **State stays self-attested**, but becomes an explicit on-screen attestation with its meaning stated and recorded in the consent record. Stop hardcoding `'CA'`.

*Rejected:* invite gate alone (leaves an indefinitely-valid `localStorage` bearer token guarding a full credit history); full consumer auth with MFA (real friction on a free educational pilot, defending an attacker profile that doesn't exist yet).

*On state verification:* no better option is worth having. IP geolocation is unreliable and VPN-defeated; document verification is wildly disproportionate. The honest move is an explicit, consequential attestation — which `Consent` already models.

*New process:* a transactional email vendor is a new processor touching user emails — vendor-inventory entry, DPA, privacy-notice update. Already anticipated by `docs/data-flow.md`.

### D11 · No LLM narration in the pilot

Report prose comes from deterministic templates interpolating real extracted values, plus the authored D7 corpus. `narrate()`, `assertSafeConsumerOutput`, and `evaluateNarrationOutput` remain as tested, unwired infrastructure.

*Rejected:* enabling narration; LLM for the educational layer only (the corpus is authored and reviewed *so that it is stable and citable* — generating it per request means two users get different explanations of the same concept, and the governance gate has nothing to gate).

*Rationale:* D7 already produces the prose; an LLM adds fluency, not information. Every marginal gain costs a new processor receiving consumer credit findings — the one processor category the deletion model cannot fully close. Most importantly, **the guard is a denylist**: it catches `"fcra violation"` and `"improve your score"`; it cannot catch a fluent, plausible, *wrong* sentence about the user's specific account. Denylists bound legal risk, not accuracy risk. Everything else in this architecture is deterministic and provenance-linked precisely so every claim traces to an extracted value — narration is the one place that chain breaks.

*Detail worth choosing rather than inheriting:* `narrate()`'s payload redaction is `.replace(/\b\d{9}\b/g, '[REDACTED]')` — nine-digit runs only. Creditor names, balances, dates, and masked-account fragments would ship to the provider intact.

*Accepted cost:* competitors all lead with AI. A deterministic product demos as less magical, and templated prose can read as repetitive across many findings.

### D12 · Risk-first sequencing

See Part 4.

*Rejected:* user-visible-first (would build the report surface against balance-only findings with no corpus and no coverage table, then rebuild it — two builds of the largest visible piece); foundation-strict (cleanest on paper, worst on risk — most effort spent before touching the least-validated assumption).

---

## Part 4 — Phased plan

### Phase 0 — Extraction spike **(has a kill criterion)** — ✅ complete, D3 holds (2026-07-31)

The highest-uncertainty item gated the most work, so it went first.

1. ✅ Swapped `extractBboxFromPdfBytes` to `unpdf` (serverless pdfjs build) emitting `Word[]` — `packages/parser/src/pdfjs-extractor.ts`, wired into `platform.ts` as `parseIdentityIqPdf` (private method) via `parseIdentityIqPdfBytes`.
2. ✅ Handled the coordinate-origin flip explicitly, plus a second bug caught only by testing against real files: `item.width`/`item.height` from `getTextContent()` are already rendered point-space extents, not unit-glyph-space — the first implementation re-multiplied them by the transform's font-scale and produced coordinates off by roughly the font-size factor. Fixed by using the transform only for direction (rotation), and width/height for magnitude.
3. ✅ Diffed the new `Word[]` (and, more importantly, the resulting `ParserTradeline[]` from `parseIdentityIqPdf`) against the `pdftotext` path on all four real samples. **Real tradeline extraction is byte-for-byte identical between the two extraction paths on all four samples — zero mismatches.** Raw word counts differ by 0–2.4% (different run/word segmentation between poppler and pdfjs), but none of that difference reaches the parsed output. One pre-existing adapter bug was found in the process — a "Last Reported <date>" label row is misparsed as a spurious tradeline on all four samples — but it fires identically in magnitude on both extraction paths (poppler and pdfjs produce the same *count* of spurious rows, differing only in the junk row's exact creditor text). This is a real defect, but it predates and is independent of the extractor swap; tracked for a Phase 2 adapter fix, not a Phase 0 blocker.
4. ✅ Measured CPU and bundle size in real `workerd` (via `wrangler dev`, not just Node) against all four real samples:
   - **CPU time: 1.5s–7.3s per document** across the four samples (largest: 2.6 MB / 12 pages). No correlation with file size — cost tracks page/text-item count. All four comfortably clear the Workers Paid default 30,000ms CPU budget (4–20x headroom). **Workers Free tier's 10ms CPU limit is categorically incompatible** with any JS-side PDF parsing of this shape, independent of optimization — moot here since D1/R2 already require a paid plan, but worth stating plainly since it wasn't documented anywhere in `docs/`.
   - **Bundle size: 2.36 MB raw / 573 KB gzip** for a minimal Worker containing only the new extractor + adapter (measured via `wrangler deploy --dry-run`). Comfortably under any plausible Workers script-size ceiling.
   - Exact current Cloudflare limit figures (CPU budget, script size ceiling) were not re-verified against live docs in this pass — the measured numbers cleared every commonly-cited threshold with enough margin that this wasn't a close call, but confirm exact current limits before treating this as final sign-off.
5. ✅ Excised `node:fs` / `node:child_process` from `packages/platform`. `execSync`/`extractBboxFromPdfBytes` removed. `saveSnapshot`/`loadSnapshot` (dead code — unused anywhere in the repo; `runtime-store.ts` already used `exportSnapshot`/`importSnapshot` directly, the correct Node-only seam) removed rather than relocated. `node:crypto` usage (`randomUUID`, `randomBytes`, `scryptSync`, `timingSafeEqual`) retained — all Workers-compatible under `nodejs_compat`.

**Ripple, handled:** `parseReport` and the private `parseIdentityIqPdf` became `async` (the pdfjs API is promise-based; poppler's `execSync` was synchronous). Every call site updated — `apps/web/src/server.ts`, `apps/web/functions/api/consumer/[[path]].ts`, and 9 test files (`platform.test.ts`, `measurement-matching.test.ts`, `measurement-real-samples.test.ts`, `pilot-legal-conditions.test.ts`, `quality-reporting.test.ts`, `redaction.test.ts`). One assertion in `pilot-legal-conditions.test.ts` changed from `assert.throws` to `assert.rejects` — a throw inside an `async` function is a promise rejection, not a synchronous throw, so the old assertion would have silently stopped catching the error it was written to catch. Full suite: **85/85 passing** (was 82/85 immediately after the swap — the 3 failures were `unpdf` rejecting a Node `Buffer` outright despite `Buffer` being a `Uint8Array` subclass; fixed with a defensive normalization at the extractor boundary, since `platform.ts` stores raw upload bytes as `Buffer`).

> **Kill criterion outcome: D3 holds.** CPU and bundle both clear budget with wide margin; real tradeline output is identical to the poppler baseline on every available sample. Proceeding to Phase 1 on the Cloudflare/Pages Functions target as planned. No fallback ladder needed.

### Phase 1 — Foundation — ✅ complete (2026-07-31)

- D5: activate migration 002; repository seam under `CreditAnalysisPlatform`; R2-only raw bytes; real deletion including R2 objects.
- D10: invite gate; cookie sessions with expiry and rotation; WAF rate limiting; email verification and password reset.

**Scoping decision, stated explicitly:** D5's repository seam covers the PII-bearing, per-consumer entities implicated in the four failure modes (users, sessions, workspaces, authorizations, uploads, reports, matches, analyses, consumer reports, exports, deletion jobs, audit events) plus the quality-reporting/pilot-evidence reads that touch them. Governance/rules/authorities/education-modules/reviewers/pilotApprovals/pilotDrills/launchScope stay in-memory and synchronous — they are operator-seeded config, identical for every user, and are not implicated in last-write-wins, the size limit, or the deletion promise. Migration 002 itself already drew this line (no table for rules/authorities/matches/consumer_reports existed); this makes it explicit rather than accidental.

**What was built:**
- `packages/platform/src/store.ts` — the `PlatformStore`/`BlobStore` interfaces plus `InMemoryStore`/`InMemoryBlobStore` (the default, used by all pre-existing tests — zero constructor changes needed anywhere that doesn't care about cross-request durability).
- `apps/web/functions/api/store-d1.ts` — `D1PlatformStore`, real per-row D1 queries, atomic single-use consumption for invites/tokens via `meta.changes` rather than a racy read-then-write.
- `apps/web/src/runtime-store.ts` — rewritten from a single-row whole-snapshot pattern to `SqlitePlatformStore` (same schema as D1, one held connection for the process lifetime) + `FileBlobStore` (local-dev analogue of R2).
- `packages/platform/src/index.ts` — every PII-entity method converted to `async`, delegating to the injected store; `exportSnapshot`/`importSnapshot`/`PlatformSnapshot` removed entirely (the mechanism D5 replaces).
- `database/migrations/004_consumer_persistence.sql` — the missing `matches`/`consumer_reports`/`authorizations` tables, `users.password_salt` (002 never had it despite the app always using one), and the D10 `invites`/`auth_tokens`/session-expiry additions.
- Real deletion: `requestDeletion` now has an actual route (`POST /consumer/deletion` on both backends) and deletes blob objects, not just rows — previously unrouted (Part 1 finding #6).
- D10: invite-gated registration (`register()` requires and atomically consumes a single-use code — no HTTP route issues codes; `scripts/issue-invite.ts` is the operator path, mirroring what a real invite-only pilot needs); httpOnly/SameSite=Lax cookie sessions on both backends (Node `Set-Cookie` header, Cloudflare same) replacing the `x-session-id` header/localStorage bearer token; session idle timeout (24h) and absolute expiry (30d), refreshed on every authenticated call; session rotation (all sessions revoked) on password reset; native Workers `ratelimits` binding (5 req/60s per client IP, config verified against `node_modules/wrangler/config-schema.json` and the `RateLimit` runtime type rather than assumed) on register/sign-in/password-reset-request; password reset and email verification with a pluggable token flow — **no real transactional email vendor is wired** (tokens are logged, not delivered) — this needs a vendor + DPA before launch, exactly as flagged in the original plan.

**Bugs found and fixed as part of this, not pre-planned:**
1. **The Cloudflare Pages Functions path never seeded governance/rulesets at all** — `resolveRulesetForJurisdiction` would have thrown "No published ruleset is available" on every real `kickoff-analysis`/`complete-analysis` call on the deployed target. Fixed by extracting `apps/web/src/pilot-bootstrap.ts` (`bootstrapGovernance`) and calling it from both backends.
2. **A root-level `functions/api/_platform.ts` was dead, orphaned code** — a full duplicate of the real `apps/web/functions/api/_platform.ts` that nothing imported (verified via grep — the only importer of any `_platform` file is `apps/web/functions/api/consumer/[[path]].ts` importing its sibling). Deleted.
3. **The entire Cloudflare consumer route handler had no top-level error boundary** — any thrown error (bad credentials, "Not found", malformed JSON) returned Cloudflare's generic error page instead of a clean JSON error, unlike the Node server which already wrapped everything in try/catch. Fixed while wiring the rate-limit error path, since it needed the same boundary.
4. **My own first draft of the invite-consumption logic in `register()` was wrong** — it consumed the invite with a placeholder empty-string user id, then tried to "re-consume" with the real id, which silently no-oped since invites are single-use. Fixed by minting the user id first, consuming the invite with it, then creating the user — caught before it shipped, not after.

**Verification beyond typecheck + the 85-test suite (still 85/85 passing throughout):** a standalone concurrency check — two separate `CreditAnalysisPlatform` instances, each with its own `SqlitePlatformStore` connection to the same SQLite file (structurally identical to two concurrent Cloudflare requests against the same D1), registering and recording consent via `Promise.all`. Both users' data survived correctly when read back through a third, independent connection. This is the actual bug D5 exists to fix — confirmed fixed, not just assumed fixed because the architecture changed.

**Explicitly out of scope for this phase, stated rather than silently dropped:**
- A real transactional email vendor (needs a vendor decision + DPA — D10's own rationale already flagged this as a prerequisite, not an engineering task).
- Deployed-target (Cloudflare D1) invite issuance tooling — `scripts/issue-invite.ts` covers local dev; a real operator tool for the live pilot is a launch-prep follow-up.
- Wiring the hero's state-of-residence input into the actual consent call — `api.consent()` no longer hardcodes `'CA'` internally (now a parameter, defaulting to `'CA'` at the one call site), but connecting it to a real state picker in the consumer flow is Phase 4 (D6) scope; the wizard and the hero are still separate screens today.
- Enforcing email verification before allowing uploads — the mechanism (token issuance/consumption, `emailVerifiedAt`) exists and is tested, but nothing gates on it yet; that's a product decision, not stated as required by D10.

### Phase 2 — Analysis depth — ✅ complete (2026-07-31)

- D4 slice 1: account-block parsing now extracts account number, account type, status, date opened, last reported date, balance, credit limit / high credit, and past due. When an older layout lacks a block-level balance for a bureau, the existing balance-row parser fills only that missing bureau; the additional account fields remain unknown so their rules suppress rather than infer values.
- D8: all cross-bureau evaluators require two distinct bureaus. Same-bureau collisions are downgraded to split matches and handled by the duplicate-tradeline evaluator; they cannot create cross-bureau findings.
- The published pilot ruleset now includes divergence checks for balance, credit limit, past due, status, opened date, and last-reported date; internal checks for closed/paid with a positive balance and past due exceeding balance; a revolving-without-credit-limit observation; duplicate tradelines; and the collapsed partial-furnishing observation.
- Validation gate: all four available PDF samples pass the three-bureau parser smoke test, and the full suite remains green (89/89).

### Phase 3 — Content — ✅ complete (2026-07-31)

- D7: `packages/platform/src/reviewed-content.ts` is the static, reviewed California corpus: tier-1 section primers plus a module for each published Phase-2 rule. Authorities carry public HTTPS documentation links and all consumer-facing catalog prose passes the output guard before publication.
- The prior `bootstrap-*` synthetic reviewers and self-approval sequence are gone. `bootstrapGovernance` installs the bundled catalog identically in Node and Pages; catalog installation fails closed for a stale review, mismatched digest, unpublished item, unresolved authority/module, unsafe prose, or disabled rule content. `scripts/verify-reviewed-content.ts` binds the content digest to the named reviewer’s recorded commit and enforces the 90-day review interval.
- D2: each stored `ConsumerReport` snapshots the complete Finding schema with resolved education and authority references, Tier-1 primers, versions, lossless `RuleAudit` coverage rows, and parser capability plus actual-field-state disclosure. The current reading surface renders these sections, including a calibrated zero-findings state; legacy reports retain their prior compact reading.
- Validation gate: `npm run verify:content`, typecheck, the complete 89-test suite, the server build, and the client production build pass.

### Phase 4 — Surface — ✅ complete (2026-08-01)

- D6: the normal browser route is now a linear, server-resumable consumer flow: sign-in/registration tabs, California eligibility attestation, full server-sourced written authorization and retention policy, one PDF-only upload action, saved match review, report navigation, sign-out, and confirmed account deletion. The former per-step fixture wizard survives only at `/debug`.
- The browser uses the Pages-compatible `/api` contract in local Vite and deployed Pages. Disclosures and dashboard state are server-owned; authorization requires the current version plus an affirmative acknowledgement at the HTTP boundary.
- Account deletion clears the session cookie, deletes account-linked data and upload blobs, and keeps only a non-identifying completion receipt. Blob removal happens before deleting its metadata, so a failed removal leaves resumable account metadata rather than a false completion receipt.
- D9: the web report has one document component for screen and print. Browser Print / Save as PDF retains the readings, authority links, findings, coverage, parser disclosure, and limitations. Download my data retrieves a versioned, guarded, identifier-masked JSON projection of the complete report snapshot.
- Operations: the Cloudflare rollout procedure now applies migration 004 before the Pages consumer surface is deployed.

### Phase 5 — Full depth

- D4 slice 2: DOFD, payment-history grid, remarks, special comment codes.
- D1 framing for re-aging worked out **before** DOFD findings are emitted.
- Coverage table rows flip from unsupported to supported.

---

## Part 5 — Documents to update

Authorized by the product owner to revise `docs/` where it blocks correct implementation.

| Document | Change |
|---|---|
| `pilot-stack-implementation-plan.md` | Note supersession of UX/analysis scope; reaffirm the stack. |
| `data-flow.md` | Remove "Consumer review / corrections" (unimplemented — `reviewValue` is unrouted); correct the HTML ingestion path to PDF-only; add invite gate, R2-only byte storage, real deletion. |
| `runtime-architecture.md` | Replace the SQLite-file narrative with the D1 per-entity model; document the repository seam. |
| `parsers/identityiq-field-map.md` | Record the pdfjs swap; mark slice 1 / slice 2 field scope. |
| `vendor-inventory-working.md` | Add the transactional email vendor. |
| `privacy-notice-draft.md` | Email processor; corrected retention and deletion mechanics. |
| `security-review-packet.md` | Cookie sessions, rate limiting, invite gate, R2 deletion. |
| `release-gates.md` | Add the Phase 0 kill criterion and the four-sample parser validation gate. |

**Explicitly out of scope for override:** the human legal/privacy sign-off gate before real consumer reports flow through a deployed system. That is a decision for the product owner and counsel, not a document to edit away.

---

## Part 6 — Open items

- **Phase 0 outcome** determines whether D3 holds. Everything downstream is provisional until it passes.
- **Invite issuance mechanism** (manual list vs. generated codes vs. waitlist) — unspecified; decide in Phase 1.
- **Education content authorship** — who writes tier 1 and tier 2, and who holds compliance-reviewer sign-off. D7 requires a named human; the person is not yet named.
- **Re-review cadence** for education modules under `effectiveFrom`.
- **Browser Rendering** deferred, not foreclosed (D9).
- **LLM narration** deferred, not foreclosed (D11); requires a DPA and a decision on payload redaction scope.
