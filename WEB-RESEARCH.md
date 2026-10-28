# Supplementary development research

Official planning decisions, permits, zoning cases and agendas remain primary. Codex-assisted searches now have a persistent query ledger and evidence intake in the existing SQLite database. Findings appear in **Admin Dashboard → Proposed Map Updates**, alongside the existing duplicate-review link. Auth0 administrator authorization and MFA protect this interface.

This is a working manual research workflow, not an autonomous crawler. No paid search API, cloud service or recurring job is enabled. The existing official-source research workflow continues separately.

## Cost and performance controls

- Reserve searches by municipality/county, rather than issuing one search per stored project.
- Two complementary queries per area; 24 total query reservations per UTC day and 200 per UTC calendar month.
- Reuse query reservations and completed results for seven days, including searches with no qualifying findings.
- At most eight evidence findings per query. Failed/reserved queries consume budget too; there is no automatic retry loop.
- Store brief evidence summaries, URLs, source types, publication dates (null when unknown), verification dates and reported milestones. Do not store full articles.
- Deduplicate unchanged evidence across queries and passes, excluding verification timestamps and tracking URL parameters from identity.
- Candidate matching uses the existing spatial-map search index, returning at most ten possible matches. An absence of matches is not a clearance to publish; archived and deleted identities are checked by the verified import workflow.
- The public map does not load this research ledger. No model/API processing runs in the backend.

These are enforceable limits for the research reservation workflow. They are **not a dollar cap on Codex account usage** or on searches performed outside this workflow. A future paid search provider requires separate approval and provider-specific quotas before activation.

## Operator workflow

Codex runs these commands; the owner does not need Terminal:

1. `node --import tsx scripts/web-research.mts plan Greenville "Pitt County"`
2. Run only the newly reserved query strings using available Codex search. Read credible source pages; snippets are leads. Respect access restrictions and paywalls.
3. Save up to eight structured findings per reserved query, then use `node --import tsx scripts/web-research.mts record <query-id> <findings.json>`. Record an empty array when no qualifying evidence is found.
4. Inspect `summary`, or the protected Proposed Map Updates screen, for budgets and recent searches.
5. Review findings individually. Possible matches can enter the existing **Potential Duplicates** workflow. Merge/link decisions remain manual and reversible.

Findings require `url`, `title`, `sourceType`, `publishedAt`, `verifiedAt`, `projectName`, `area`, `summary`, and `claim`. Optional `projectId` associates a known record; optional `externalId` preserves a case identifier.

Supported evidence labels: reported, proposed, approved, under-construction, completed, cancelled, delayed, meeting. These are **reported milestones**, not automatic public project statuses. Source categories: official, local-news, developer, industry, neighborhood, other.

## Lifecycle safeguards

Web findings always enter the private `uncertain` queue. They cannot be published by the status-preview endpoint and do not modify projects, history, follows, notifications, approval evidence, or expiration dates. Administrators must verify and use the existing editing/review workflow for any actual change.

An announcement does not establish construction. A projected completion date does not prove completion. Land acquisition does not establish approval. A newly checked old article does not become new activity. Approved projects retain the existing 365-day rule; only documented, genuinely relevant construction evidence can support the existing exception process. Unavailable sites and ambiguous reporting do not establish cancellation.

## Tests

`tests/web-research.test.ts` verifies hard budgets, cache reuse, evidence deduplication, indexed candidate matching, date/URL validation and preservation of public projects and approval clocks. Existing server authorization tests cover access to the administrator research endpoint.
