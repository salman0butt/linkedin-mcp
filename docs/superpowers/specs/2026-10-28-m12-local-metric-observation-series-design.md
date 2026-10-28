# M12.2 — Strict caller-only metric observation series

## Baseline and boundary

M12.1 was independently reviewed Critical 0 / Important 0 and VERIFIED/MERGED through PR #26, feature `810b8bc90fe85fcb477a717a35382dd3616d9c6e` CI `40664805538` SUCCESS, guarded squash main `40c714df69039ab65e648ae78d58a30496698c1e`, tree `2820ce11430aea3f0e91d7098cd716cc5295bad0` and separate main-push CI `40665262565` SUCCESS. Broader M12 remains IMPLEMENTING; LinkedIn `analytics.post` is OFFICIAL_API / UNAVAILABLE. M12.0 compares one pair; M12.1 ranks caller-reported changes across multiple content items. M12.2 adds a strictly local chronological series for **one** content item without inventing provider trend, rates or accounting windows.

## Pure input and result

`compareLocalAnalyticsObservationSeries(input: unknown)` accepts **exactly** `{contentId:string, contentKind:'post'|'article', snapshots: Snapshot[]}` where `snapshots` has **3–10** non-sparse own-data elements. Reuse the strict M12.0 content ID, snapshot, metric, UTC-minute validation by calling `compareLocalAnalyticsSnapshots` on **each consecutive pair**, validating every pair before returning data. UTC capture instants must be strictly increasing; counts are individually caller-supplied, nullable, integer in `[0,1_000_000_000]`, and each capture has at least one available metric as in M12.0. No other fields, symbols, accessors, inherited object/array prototypes, proxies, revoked proxies, holes or unknown secret-bearing keys; fail closed with a fixed error message and no echoes. No clock, network, store or credential dependency.

Output is deeply immutable and at most **32,768 UTF-8 bytes**:

```ts
{
  kind: 'local_caller_metric_observation_series',
  status: 'observations_only',
  provenance: 'caller_supplied_unverified',
  verification: 'not_performed',
  providerData: 'not_fetched',
  accountAuthorization: 'not_evaluated',
  publication: 'not_attempted',
  contentId: string,
  contentKind: 'post'|'article',
  capturesUtc: readonly string[], // 3–10, increasing
  intervals: readonly Array<{
    fromUtc: string,
    toUtc: string,
    metrics: { impressions: MetricComparison, reactions: MetricComparison,
               comments: MetricComparison, reposts: MetricComparison }
  }>, // exactly capturesUtc.length - 1, chronological
  counts: { captures: number, intervals: number },
  warnings: [
    'caller_metrics_unverified',
    'capture_intervals_not_provider_windows',
    'no_rates_or_performance_inferred',
    ...optional 'missing_metrics_not_zero',
    ...optional 'negative_delta_may_reflect_counter_revisions'
  ]
}
```

`MetricComparison` is exactly M12.0's discriminated comparable/unavailable `{state,previous,current,delta}` object. Null remains distinct from zero and never gets a synthetic delta; signed negative deltas may be counter corrections. Neither a difference nor an ordered series establishes a comparable provider measurement window, a trend forecast, performance judgment, experimental effect, audience similarity, publication, authorization or verified data.

Use a `LocalAnalyticsSeriesError` with `kind:'invalid_input'|'output_too_large'` and fixed messages; map unexpected malformed input safely. No labels, text, URLs, account data or derived rates.

## MCP/capability/release

New strict-Zod tool `linkedin.analytics.compare_snapshot_series`; strict input and output parsing with sanitized unknown keys/values and existing bounded dual `content`/`structuredContent`, fixed errors, bounded/untrusted host request IDs and hostile host timestamps, real STDIO/HTTP and raw SSE envelope **≤262,144 bytes**. Capability `analytics.snapshots.series`: LOCAL_ONLY / AVAILABLE / ACTIVE / M12; `analytics.post` and `schedule.create` remain UNAVAILABLE. In-memory tool inventory **61→62**, compiled STDIO/HTTP **65→66**. This remains stateless, no provider fetch, account store, approval, publication or scheduled execution.

Genuine missing-module and missing-tool RED before GREEN, focused pure and real MCP SDK contract tests with hostile object/secret/clock/ID cases, real compiled STDIO/HTTP smokes, 256KiB raw SSE checks, full Node24 format/lint/typecheck/build/test, independent read-only pure/MCP security reviews Critical0 Important0, exact GitHub tree/feature CI, guarded squash and separate main push CI before VERIFIED/MERGED.
