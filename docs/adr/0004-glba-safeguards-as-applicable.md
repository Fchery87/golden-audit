# Treat GLBA Safeguards Rule as applicable for security design until formally cleared

**Status:** accepted

Counsel rejected our tentative assumption that GLBA is "probably inapplicable." The FTC Safeguards and Privacy Rules can cover businesses significantly engaged in providing financial products or services, and FTC guidance specifically identifies **credit counselors and financial/economic advisers** as potentially covered financial institutions. The business's **actual activity** controls — not its "educational" label. A paid service that analyzes a credit report and advises the consumer on how to understand or respond may be characterized as credit counseling.

**Decision:** Until counsel formally clears GLBA, **design and build to the Safeguards Rule standard** as if it applies. For the invite-only free pilot, the relevant slice is:

- a written information-security program with a designated responsible individual;
- documented risk assessment;
- encryption in transit and at rest; MFA; least-privilege access controls;
- vendor due diligence + contractual security/deletion/incident-notification terms;
- an incident-response plan;
- secure deletion and retention controls.

This is a "build to the stricter standard because the cheaper option might be wrong" decision — hard to reverse if we guess wrong, surprising to a future reader who assumes "educational = not GLBA," and a real trade-off against faster/lighter security choices.
