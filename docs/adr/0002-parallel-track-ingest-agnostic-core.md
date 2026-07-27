# Parallel-track only the ingest-agnostic deterministic core

**Status:** accepted

While the legal track (ADR-0001) is unresolved, we **pause** everything that assumes we may ingest and hold consumer credit reports: the upload/ingestion pipeline, any real report parser, the report database, and the consumer UI.

We **continue** only one parallel build track: extracting the **deterministic core** — rules engine, finding taxonomy, evidence/provenance model — as a standalone, **ingest-agnostic** library validated against synthetic fixtures. This block survives every plausible legal outcome: "permitted under conditions," a B2B/counselor-tooling pivot, or an education-only pivot that never ingests reports.

One constraint: the finding **taxonomy** ("potential compliance concern," "verification recommended," etc.) is partly a legal construct, so the extraction keeps the taxonomy **provisional and isolated** in its own module so an attorney can narrow it without rewriting the engine.

Everything else stays paused until both legal viability and demand (see plan) clear.
