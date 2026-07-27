# De-risk legal viability before parser/build

**Status:** accepted

We are de-risking the product's **legal/regulatory viability** (FCRA, California CCRAA/CPRA, the "educational vs. legal advice" boundary) before investing in a real report parser, ingestion pipeline, or consumer UI. This inverts the obvious "build the parser first" sequence.

We picked this order because legal viability is the risk most likely to be **fatal** and **least reducible by writing more code**: if a D2C product may not lawfully ingest and retain a consumer's full credit report and surface automated "findings" in California, no parser quality rescues it. Parsing, by contrast, is tractable engineering with fallbacks (commercial parsing APIs, narrower scope).

The first artifact is a scoped **legal pre-mortem brief** — evidence gathered and cited to primary sources by the agent, framed as a *question list for a real FCRA attorney*, explicitly **not** a legal verdict. This mirrors the product's own discipline ("don't let AI issue verdicts; gather evidence, let a qualified human decide") — the de-risking obeys the same rule the product preaches.

Hard rule: if the legal memo is not a clear "yes under conditions," the default is **stop** (or narrow), not round-up-to-green, because the downside (consumer financial/legal harm) is asymmetric.

See ADR-0002 for the only work that runs in parallel during the legal track.
