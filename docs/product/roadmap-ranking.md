# Tank Roadmap Ranking (Mar 6, 2026)

Ranked from product perspective: how much each feature helps the product + makes it go viral. Scores 1-5 each.

## Scores

| #   | Feature                                           | Product (1-5) | Viral (1-5) | Notes                                                                                                                                                                                          |
| --- | ------------------------------------------------- | :-----------: | :---------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Fix search + bugs + shortcuts**                 |     **5**     |    **2**    | Broken discovery = nothing else matters. Do this first, no debate.                                                                                                                             |
| 2   | **Add official skills (manual, with permission)** |     **4**     |    **4**    | Invite companies to publish, don't scrape and slap "official" on it. Requires a trust/provenance layer first. Legal risk if done wrong.                                                        |
| 3   | **Cron job for official skills**                  |     **3**     |    **3**    | Depends on legal framework + quality gates that don't exist yet. Without them, auto-ingestion creates abundance theater. Sequence AFTER trust infrastructure.                                  |
| 4   | **Create skill-packs**                            |     **4**     |    **5**    | Highest viral/effort ratio. "Install one pack, get a complete frontend AI agent" is shareable. Only ship packs you've personally tested — one broken skill in a pack 10x's the bad impression. |
| 5   | **Token ranking (by usage)**                      |     **4**     |    **3**    | Low effort, real value. Token usage is the #1 concern for power users managing context budgets. Ship quietly.                                                                                  |
| 6   | **Context improvements for skills**               |     **5**     |    **2**    | Core product quality. Better context = skills actually work = retention. Do continuously, don't roadmap as milestone.                                                                          |
| 7   | **Self-hosting install**                          |     **4**     |    **3**    | Tank's brand is security-first → security teams need on-prem → that's the beachhead. Also where monetization lives.                                                                            |
| 8   | **Optimize token count (semantic model)**         |     **3**     |    **4**    | Great headline ("cut tokens by 40%") but massive effort for early-stage. Classic Build Trap without reproducible benchmarks. Save for later.                                                   |
| 9   | **Like/Dislike + Reviews**                        |     **3**     |    **3**    | Don't ship full review UI yet. Ship lightweight trust signals NOW: install counts, verified publisher badge, last scan date, "works with" matrix.                                              |
| 10  | **Benchmarking (BENCHMARK.md)**                   |     **3**     |    **3**    | Interesting but "what makes a skill good?" is hard to define. Risk of gaming metrics. Low confidence.                                                                                          |
| 11  | **UX Refinement**                                 |     **3**     |    **2**    | Table stakes. Continuous, not a roadmap item.                                                                                                                                                  |
| 12  | **White label Tank**                              |     **2**     |    **1**    | Enterprise-only. Premature. Reframing as "private registry primitives" is smarter architecturally, but build the public flywheel first.                                                        |

## Priority Order

| Phase                                 | What                                                                                                                      | Why                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Now** (next 2-4 weeks)              | Fix search → Lightweight trust signals (verified publisher, install counts) → Curated skill-packs (Tank-authored, tested) | Foundation: discovery works, trust exists, activation is fast |
| **Next** (1-2 months)                 | Official skills via partnerships (not scraping) → Token ranking → Self-hosting MVP                                        | Growth: supply with real trust, practical value, beachhead    |
| **Later** (only after flywheel spins) | Cron automation (after legal gates) → Token optimization → Full reviews → Benchmarking                                    | Scale: only after the flywheel is proven                      |

## Key Insight

Trust infrastructure is a prerequisite, not a feature. You can't slap "official" on scraped skills — that's a liability for a security-first brand. Build the provenance layer, then fill the catalog.

## Devil's Advocate Challenges (incorporated above)

- **Legal risk on official skills**: Without publisher authorization, "official" badges are a liability. Invite, don't scrape.
- **Self-hosting undervalued**: Security-conscious orgs are Tank's natural beachhead. On-prem is where OSS monetizes.
- **Reviews timing is backwards**: Lightweight trust signals (install counts, verified badges) are conversion features, not engagement features. Ship them early.
- **Platform risk unaddressed**: If Anthropic/OpenAI launch native registries, catalog size loses value. Tank's moat is cross-agent security governance (signing, attestations, lockfiles, policy enforcement).
- **Distribution is product**: Marketing (Discord, X, Reddit) should be treated as product work, not an afterthought.
- **Cold-start may be demand, not supply**: If nobody knows Tank exists, more skills just increases noise. Time to Hello World < 5 minutes matters more than catalog size.
