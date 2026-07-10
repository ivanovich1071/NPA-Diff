---
name: Synchronous O(n^2) diffing can hang a single-threaded Node server
description: Root cause and fix pattern for a document-comparison feature that intermittently returned 502s and froze unrelated pages (e.g. history) under large inputs.
---

## Symptom
A document-comparison endpoint worked fine on small test inputs but, on real-world large documents (e.g. a full legal code with thousands of paragraphs), the whole server became unresponsive for minutes — even `/healthz` timed out — and the platform edge proxy returned 502 to every route, not just the slow one. This looked like "the server restarted at a bad time" but was actually the process pinning CPU synchronously.

## Root cause
Paragraph-level document diffing paired every "removed" paragraph against every "added" paragraph to detect replacements/moves, calling an expensive word-level diff (`similarity()`) inside the O(removed × added) loop. On a large document this is effectively O(n² × diff_cost), which runs synchronously on the request thread and blocks Node's single-threaded event loop — so *no* request (including unrelated health checks) can be served until it finishes.

**Why:** Node has one event loop thread; any long synchronous CPU-bound loop in a request handler starves every other in-flight and incoming request, not just the slow one. Small-input testing will never reveal this — it only shows up once someone feeds realistically large content.

## How to apply
When implementing any pairwise/matching/diffing algorithm that runs synchronously inside a request handler:
1. Add a cheap pre-filter (e.g. length-ratio check) before any expensive per-pair comparison, to skip obviously-mismatched candidates.
2. Add a hard cap on total pairwise comparisons (e.g. `removed.length * added.length <= MAX`); when exceeded, degrade gracefully (e.g. skip fancy grouping and fall back to a plain/linear classification) rather than doing unbounded work.
3. Replace O(n²) exact-match scans (`findIndex` over one array for every item of another) with a `Map`-based index for O(1) lookup wherever the match key is an exact value (not a fuzzy score).
4. If the work is inherently unbounded/large even after the above, consider moving it off the main event loop (worker thread / background job) so health checks and unrelated requests are never starved.
5. Always load-test with realistically large inputs (not just toy fixtures) before shipping any new synchronous comparison/diff feature.
