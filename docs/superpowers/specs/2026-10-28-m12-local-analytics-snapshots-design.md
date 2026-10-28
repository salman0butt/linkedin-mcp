# M12.0 — Local comparison of caller-supplied content metric snapshots

## Goal and boundary

M12 requires provenance-aware deterministic analytics without inventing unavailable provider metrics. Actual LinkedIn post/article/account analytics remain **OFFICIAL_API / UNAVAILABLE** until genuine scopes, account access and endpoint support are verified. M11.0–M11.3 planning-only functionality was VERIFIED/MERGED through PR #24, main `d7d46ab4b117109b2aad6e266fb78ecd453b10b2`, exact push CI `40655163394` SUCCESS. M11 scheduled execution remains unavailable.

Choose the smallest independently releasable M12.0 local-only slice: compare **exactly two caller-supplied snapshots** of the same named content, without fetching, storing, persisting, publishing, or authorizing anything. Reject a provider-backed analytics connector (not authorized), a local content metrics persistence store (unneeded new private attack surface) and ratio/engagement-rate estimation (ambiguous unavailable metric denominators).

## Contract

New MCP `linkedin.analytics.compare_snapshots`; capability `analytics.snapshots.compare` LOCAL_ONLY / AVAILABLE / ACTIVE / M12, default available over STDIO and HTTP because strictly stateless/metadata-only. `analytics.post` stays OFFICIAL_API / UNAVAILABLE / PLANNED. No provider or account call.

Input strictly exactly:

```ts
{
  contentId: string; // caller-local safe slug 1..80, not a URL/URN/secret
  contentKind: 'post' | 'article';
  snapshots: [Snapshot, Snapshot];
}
type Snapshot = {
  capturedAtUtc: string; // canonical UTC minute YYYY-MM-DDTHH:mm:00.000Z
  metrics: {
    impressions: number | null;
    reactions: number | null;
    comments: number | null;
    reposts: number | null;
  };
};
```

All counters safe integers 0..1,000,000,000 or **null meaning unavailable**; do not coerce missing/undefined to 0. Every metric key is required even when unavailable. At least one non-null metric in each snapshot. Strict increasing capturedAtUtc; no absolute ambient current time restrictions (offline comparison). Guard against malformed dates (including impossible civil days), proxy/revoked objects, prototypes, getters/accessors, arrays with holes/extra properties, inherited keys, unknown secret fields and output overrun. No content body, post URL or account identifier accepted.

Pure `compareLocalAnalyticsSnapshots(input:unknown)` returns deeply frozen:

```ts
{
  kind: 'local_content_metric_snapshot_comparison';
  status: 'comparison_only';
  provenance: 'caller_supplied_unverified';
  verification: 'not_performed';
  providerData: 'not_fetched';
  accountAuthorization: 'not_evaluated';
  publication: 'not_attempted';
  contentId: string;
  contentKind: 'post' | 'article';
  capturesUtc: readonly [string,string];
  metrics: {
    impressions: MetricComparison;
    reactions: MetricComparison;
    comments: MetricComparison;
    reposts: MetricComparison;
  };
  warnings: readonly ['caller_metrics_unverified',
    'not_provider_analytics', 'snapshots_are_observations_only', ...optional];
}
type MetricComparison =
  | {state:'unavailable'; previous:number|null; current:number|null; delta:null}
  | {state:'comparable';previous:number;current:number;delta:number}
```

No impression-adjusted engagement rate, invented CTR, extrapolated trend or claim of provider availability. Differences can be **negative**: record the arithmetic, do not infer activity loss or data integrity. If any comparable delta negative, append `decrease_may_reflect_counter_revisions`; if any unavailable, append `missing_metrics_not_zero`. Max pure JSON 16 KiB, MCP dual structured/text and raw HTTP/SSE all <=256KiB including hostile host ID. Strict sanitized invalid_input/invalid_output/output_too_large errors; full results bounded.

## Acceptance and release

1. Genuine missing-module RED→GREEN pure tests covering all-null rejection, absent counters, retained nulls, negative deltas, sorted UTC, leap/invalid time, large counters, exact output/warnings, deep freeze, secret rejection, revoked proxy/getter; no ambient clock, persistence, provider or network.
2. Genuine real SDK absent-tool RED→GREEN for strict typed Zod input/output, malformed extra secret names/values sanitized before tool handler, forged provenance rejected, 270k host request ID bounded, actual raw HTTP/SSE <=256KiB and no provider call. Default in-memory tools 59→60, compiled 63→64.
3. Real compiled STDIO and HTTP analytics comparison smoke, unavailable provider analytics not upgraded, capability registry truth unchanged for `analytics.post`. Exact route capability available but no provider claims.
4. Full Node24 format/lint/typecheck/build/tests, independent pure and MCP/transport reviews Critical=0 Important=0, durable milestones/traceability, connector-first Git blobs and indexed tree exact SHA, feature PR CI quality, guarded squash merge, exact main push CI quality. M12 remains IMPLEMENTING after M12.0.
