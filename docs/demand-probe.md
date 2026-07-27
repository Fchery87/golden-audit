# Demand probe instrument (runs in parallel with the legal track)

**Purpose.** De-risk the #2 risk: will the target user value a product whose entire pitch is *restraint* — no disputes, no score guarantee, no deletion promise — when the market they know is dispute-mills? Per ADR-0001 sequencing, this runs **in parallel** with legal (the two are independent) and **ahead of** the parser spike (ADR: parser only after both legal and demand clear).

**This is a human-execution instrument.** An agent cannot run credible user interviews. The output we want is ~10 problem interviews + a recorded go/no-go signal.

## What we are testing (and not testing)

- **Testing:** does the *problem* resonate and would they pay for *this* shape of solution?
- **Not testing:** the UI (none exists), the parser accuracy, or feature breadth.

## Recruitment (n≈10)

Target the segment the product is actually for, not convenience:

- U.S. adults who, in the last 12 months, **pulled their own full credit report** (not just a score app) because something confused or worried them.
- Mix: a few who have used a dispute/credit-repair service, a few who avoided them on principle, a few identity-theft-adjacent.
- Exclude: credit-industry professionals (biased), and anyone who has never read a full report (no pain).

Recruit via your network, relevant subreddits/communities, or a small panel. Pay for their time (standard $20–$40 honorarium) — unpaid respondents skew unrepresentative.

## Interview script (30 min, problem-first)

1. "Tell me about the last time you looked at your full credit report — what were you trying to figure out?" *(Listen for the actual job, in their words. Don't pitch.)*
2. "What was confusing or worrying that you couldn't resolve from the report alone?" *(Specifics. Quote them.)*
3. "What did you do next?" *(Did they Google it, pay a dispute service, call the bureau, give up? This is the real competition.)*
4. "When you looked into [credit-repair / dispute services], what stopped you — or what made you go ahead?" *(This surfaces the trust/restraint angle directly.)*
5. *(Now describe the product in one sentence, neutrally)*: "An educational tool that explains what your report shows, flags what might warrant *your* verification, and teaches credit concepts — but does **not** dispute for you, doesn't promise deletion, and doesn't predict your score. It leaves the action up to you."
6. "What's your reaction? What's useful, what's missing, what's a dealbreaker?"
7. "Would you pay for that? How much, and how often (one-time vs subscription)?" *(Anchor on their previous answer to Q3's cost.)*
8. "Who else do you know who'd find this useful — or who'd hate it?"

## Pass / fail signal (pre-committed)

- **GO:** ≥6/10 recognize the problem in their own words unprompted (Q2), AND ≥4/10 indicate willingness to pay a price that supports unit economics (Q7), AND no single dealbreaker (Q6) repeats across a majority.
- **NO-GO / PIVOT:** <4/10 recognize the problem, OR near-zero willingness to pay, OR a repeated dealbreaker (most likely: "I can get this free from Credit Karma" or "I want someone to just fix it for me").
- **Record:** for each interview, the verbatim problem, the competing behavior, the price signal, and any dealbreaker. Report aggregate **and** the two most negative quotes (avoid survivorship bias).

## Tie-back

If demand is NO-GO, the parser spike (ADR-0001) never starts — regardless of legal outcome. If demand is GO and legal is GO, proceed to the narrowed parser spike.
