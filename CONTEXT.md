# Personal Credit Analysis & Education Platform

A direct-to-consumer, U.S.-only, **educational** analysis product for adults who already hold a credit report they are authorized to use. This glossary is the project's ubiquitous language. It is devoid of implementation detail.

## Language

### Core safety boundary (these terms are deliberately distinct — do not collapse them)

**Finding**:
A structured, evidence-linked output of a deterministic rule, classified by the strength of the evidence. The fundamental unit of analysis output.
_Avoid:_ result, alert, flag, error, issue

**Observation**:
A Finding classification stating only what the report displays, with no judgment of correctness. The weakest, safest claim.
_Avoid:_ fact (overloaded), statement

**Legal verdict**:
A conclusion that a law has been broken or a legal right established. **The product never emits this.** Anything that looks like one is downgraded to a verification recommendation or suppressed.
_Avoid:_ violation, illegal, breach (as Finding labels)

**Educational**:
Content that explains a credit concept or constructive action without asserting anything about the user's specific legal position. Distinct from a Finding about the user's data.
_Avoid:_ advice (ambiguous with legal advice), tip

### Data and extraction

**Report**:
A single credit report document a Consumer is authorized to use; the sole source of analyzed data.
_Avoid:_ file, document

**Provenance**:
The source location (page or element), original display text, extraction method, parser version, and confidence attached to every normalized value. Required for a value to be publishable.
_Avoid:_ source (overloaded), reference

**Canonical value**:
A normalized extraction that preserves bureau identity and original display, with an explicit missing-value state (unknown / absent / not-applicable / redacted / parser-failed). Never silently zero or false.
_Avoid:_ field, cell

### Process

**Deterministic core**:
The pure rules engine, finding taxonomy, and evidence/provenance model. Ingest-agnostic — operates on already-normalized inputs, with no dependency on storage, sessions, or ingestion.
_Avoid:_ analysis service (too broad)

**Ingest-agnostic**:
A property of code that does not assume consumer reports are ingested or held. Required of all parallel-track work during the legal de-risk period.
_Avoid:_ headless, standalone

**Suppression**:
Producing no Finding (and recording a "suppressed" audit reason) when evidence is missing, low-confidence, ambiguous, or non-comparable — rather than emitting a weak Finding.
_Avoid:_ hiding, filtering

## Avoid everywhere

account (ambiguous — use Consumer, or the specific entity), dispute (the product does not send these), score guarantee (never given), deletion promise (never given).
