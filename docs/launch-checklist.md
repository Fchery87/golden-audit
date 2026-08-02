# Pilot launch checklist — California invite-only educational pilot

> **Status:** Release-readiness guide, not approval to launch. It converts the current code and working documents into one ordered path for a limited California pilot. Complete every required gate with real evidence before inviting any consumer.
>
> **Detected stack:** Cloudflare Pages and Pages Functions, D1 database, R2 file storage, Cloudflare Email Service, and a React browser app. The product accepts consumer-provided IdentityIQ PDFs for personal educational analysis only.
>
> **Recommended path:** Complete the human approval and Cloudflare setup gates first, then conduct one controlled preview rehearsal, then seek launch approval. Do **not** open public sign-up: registration remains invite-only.
>
> **Estimated effort:** 1–3 business days of operator work after legal, privacy, and security reviewers are available. DNS, vendor review, and human approval timing can extend this.

## Legend

- 🧑 **You** — requires an authorized business owner, account access, or a human decision.
- 🤖 **Agent** — can be performed in the codebase or terminal by a coding agent.
- 🤝 **Together** — the agent prepares/verifies; you approve or enter account-controlled values.

## Phase 0 — keep the pilot boundary honest

- [ ] 🧑 **Confirm the launch scope.** Confirm this is a free, California-only, invite-only educational pilot. Do not add states, public registration, dispute delivery, credit repair, score promises, or legal conclusions.
  - **You’ll know it worked when:** the accountable owner has signed the applicable launch-scope and legal approval records, and the live copy still states the same limits.

- [ ] 🧑 **Provide the four authorized IdentityIQ PDF samples for local validation.** Put only authorized PDFs in the gitignored `docs/reports/` directory; do not commit, upload, attach to tickets, or paste content into chat.
  - **You’ll know it worked when:** the Phase 5 parser validation records only non-sensitive structural/availability results and `docs/consumer-workflow-implementation-plan.md` no longer says real-sample validation is pending.

- [ ] 🤝 **Review outstanding human gates.** Work through `docs/pilot-readiness-gap-checklist.md`, `docs/legal-review-packet.md`, `docs/privacy-review-packet.md`, and `docs/security-approval-handoff.md`. Record actual owners, dates, decisions, and evidence references—never substitute a passing test for human sign-off.
  - **You’ll know it worked when:** no launch-blocking checkbox is empty and required approval records reference real accountable people.

## Phase 1 — complete vendor, privacy, and security approval

- [ ] 🧑 **Finish Cloudflare vendor review.** In `docs/vendor-inventory-working.md`, complete the Pages, D1, R2, and Cloudflare Email Service rows: contract/DPA status, incident contact, deletion/return mechanics, subprocessors, data residency, and accountable owner.
  - **You’ll know it worked when:** no active processor row has `[TBD]`, `not started`, or an unassigned owner.

- [ ] 🧑 **Approve the privacy notice and data processing.** Have privacy/counsel approve the draft privacy notice, retention/deletion language, and the Email Service processor disclosure. The email provider receives the account email and a one-hour link token only to deliver account recovery/verification messages.
  - **You’ll know it worked when:** an approval record identifies the approved notice version and effective date.

- [ ] 🧑 **Finish security evidence and incident readiness.** Complete the open evidence in `docs/security-evidence-tracker.md`, access/secrets evidence, restore test, and incident/runbook drill records.
  - **You’ll know it worked when:** security’s sign-off references completed evidence and the responsible people know how to pause the pilot and revoke access.

## Phase 2 — configure the Cloudflare production resources

- [ ] 🧑 **Verify ownership of the Cloudflare account and production domain.** Use the Cloudflare account that will own Pages, D1, R2, rate limits, and Email Service. Decide the pilot’s HTTPS app domain.
  - **You’ll know it worked when:** you can access the Cloudflare dashboard and the domain is under your control. DNS—the Internet’s address book—may take up to 24 hours to update after changes.

- [ ] 🤝 **Replace deployment placeholders without sharing secrets in chat.** Set `CONSUMER_APP_URL` to the exact HTTPS app address ending in `/app`; set `CONSUMER_EMAIL_FROM` to the verified Golden Audit sender address in `wrangler.jsonc`/Cloudflare Pages settings. Do not commit secret values or send them to an agent.

  > **Agent prompt:** “Inspect `wrangler.jsonc` for remaining placeholder values and validate the production configuration without printing secrets.”

  - **You’ll know it worked when:** `REPLACE-BEFORE-DEPLOYMENT` no longer appears in the deployed configuration, the app URL is HTTPS, and the sender uses a domain you control.

- [ ] 🧑 **Enable Cloudflare Email Service.** Onboard and verify the sending domain in Cloudflare Email Service; complete its required sender authentication (such as SPF/DKIM/DMARC) and bind `EMAIL` to the Pages project. Follow `docs/cloudflare-email-service-checklist.md`.
  - **You’ll know it worked when:** Cloudflare reports the sender as ready and a preview email reaches an account you control. Never test with a fake recipient address.

- [ ] 🤝 **Create/verify D1 and R2, then apply migrations.** D1 is the structured database; R2 stores raw PDFs. Apply both `003_pilot_pages_state.sql` and `004_consumer_persistence.sql` locally and remotely, as specified in `docs/cloudflare-rollout-checklist.md`.

  > **Agent prompt:** “Follow the migration section of `docs/cloudflare-rollout-checklist.md`; show table names and success/failure only, never consumer data.”

  - **You’ll know it worked when:** remote D1 has `pilot_state`, `consumer_reports`, and `authorizations`, and the configured R2 bucket exists.

- [ ] 🧑 **Configure abuse protection.** Retain the application’s five-per-minute auth limiter and create Cloudflare WAF/rate-limit rules for `/api/consumer/register`, `/api/consumer/sign-in`, and `/api/consumer/password-reset/request`. Define who receives rate-limit or delivery-failure alerts.
  - **You’ll know it worked when:** the rules are enabled in the Cloudflare dashboard, their owner and response procedure are recorded, and the protected routes were tested from a controlled preview environment.

## Phase 3 — deploy and rehearse in preview

- [ ] 🤖 **Run the local release baseline.**

  > **Agent prompt:** “Run `npm run typecheck`, `npm test`, `npm run verify:content`, `npm run build`, and `npm run build:web`; summarize failures without exposing report data.”

  - **You’ll know it worked when:** every command exits successfully. Current expected suite: 95 tests or more with zero failures.

- [ ] 🤝 **Deploy a preview Pages build and run non-sensitive smoke tests.**

  > **Agent prompt:** “With `CF_PAGES_SMOKE_URL` set in your own terminal, run `npm run health` and report endpoint status only.”

  - **You’ll know it worked when:** `/api/onboarding`, `/api/pilot-availability?state=CA`, and `/api/consumer/health` return successful expected responses from the deployed preview.

- [ ] 🧑 **Perform a controlled browser rehearsal.** Use an invite code and an account you control. Verify: California eligibility, authorization, a permitted PDF upload, match review, report rendering, print preview, masked JSON export, sign-out, deletion, password-reset delivery, email verification, and repeated-link rejection. Inspect the browser console for errors.
  - **You’ll know it worked when:** the journey completes, no consumer data is exposed unexpectedly, tokens work once, and deletion immediately signs the account out.

- [ ] 🧑 **Record rehearsal evidence safely.** Put only dates, environment URL, test account class (for example “operator-controlled”), pass/fail outcomes, and owner names in the release evidence. Do not record PDF text, email URLs, recipient addresses, session IDs, or tokens.
  - **You’ll know it worked when:** the release record is reproducible without retaining sensitive data.

## Phase 4 — launch decision and first invites

- [ ] 🧑 **Hold the go/no-go review.** Review test results, real-PDF validation, vendor/privacy/security/legal approvals, WAF configuration, deployment rehearsal, and open risks. An approval is a human decision—not a coding-agent action.
  - **You’ll know it worked when:** the responsible launch owner explicitly records “go,” “no-go,” or a scoped conditional decision with date and evidence links.

- [ ] 🧑 **Issue a small number of single-use invitations.** Use `npm run issue-invite` only from the approved operator environment. Deliver codes through your approved process; do not place codes in public channels.
  - **You’ll know it worked when:** every issued invitation has a recorded owner/purpose, and registration rejects reused or unrecognized codes.

- [ ] 🧑 **Monitor the first pilot cohort.** Watch error, rate-limit, delivery-failure, deletion, and security events. Pause new invitations if a release gate, privacy commitment, or security control fails.
  - **You’ll know it worked when:** the designated owner can explain where signals are checked and how to pause the pilot.

## Do not launch if any of these are true

- The four authorized Phase 5 PDFs have not been locally validated.
- Any legal, privacy, security, or vendor approval is absent or conditional without a documented owner and expiry.
- Placeholder Email Service URL/sender values remain in deployed configuration.
- Email Service is not domain-verified or preview reset/verification delivery has not been proven.
- Required D1 migrations are missing, WAF controls are not configured, or remote smoke tests fail.
- A browser rehearsal has not verified the full consumer journey, including deletion and one-time recovery links.

## After launch

- Review access, D1/R2 retention/deletion behavior, vendor status, and security events on the cadence agreed by reviewers.
- Re-run release gates for every deployment.
- Keep the California/invite-only/educational boundary unchanged until a separately approved scope decision exists.
- Re-review reviewed educational content by its documented due date (`2026-10-29`).
