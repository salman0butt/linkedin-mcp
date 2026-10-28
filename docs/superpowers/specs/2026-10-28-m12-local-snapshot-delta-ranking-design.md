# M12.1 — Rank caller-supplied metric counter changes without provider claims

## Context

M12.0 is VERIFIED/MERGED via PR #25, exact feature CI `40658356126`, squash main `79568b556e926566362ad82e8203e1195d35d2e8`, tree `a4f42182b086072c20f6d6b4a91f43a661389afa`, exact main push CI `40658638728` SUCCESS. It safely computes signed differences between two unverified caller-supplied metric snapshots for one content slug. M12's PRD includes comparisons and top content, but real LinkedIn post/article analytics remains OFFICIAL_API / UNAVAILABLE pending legitimate provider access and scopes. Actual M11 scheduled execution remains unavailable.

Choose M12.1 stateless **local comparison of counter changes** across 2–10 supplied post/article content slugs over two identical caller-reported UTC capture instants. Reject provider-backed top-post ranking, persistence, inferred rates and cross-user account data. The ranking must not imply verified popularity, relative performance, a common audience/age window or an experiment result.

## Pure contract

`rankLocalAnalyticsSnapshotChanges(input:unknown)`: strict input exactly:

```ts
{
  targetMetric: 'impressions' | 'reactions' | 'comments' | 'reposts';
  entries: Array<{
    contentId: string; // same slug restriction as M12.0; must be unique
    contentKind: 'post' | 'article';
    snapshots: [Snapshot, Snapshot]; // EXACT M12.0 schema
  }>; // 2..10, no holes/accessors/extra array keys
}
```

For each entry, reuse M12.0 `compareLocalAnalyticsSnapshots` for deep strict input/proxy/getter/secret/UTC validation and canonical signed counter change; reject duplicate IDs or inconsistent paired `capturedAtUtc` across entries. Do not inspect ambient current time. Null/unavailable chosen metric stays separate and is never treated as zero or included in ranking.

Return deeply immutable result:

```ts
{
  kind:'local_caller_metric_delta_ranking';
  status:'ranking_only';
  provenance:'caller_supplied_unverified';
  verification:'not_performed';
  providerData:'not_fetched';
  accountAuthorization:'not_evaluated';
  publication:'not_attempted';
  targetMetric: 'impressions'|'reactions'|'comments'|'reposts';
  capturesUtc: readonly [string,string];
  ranked: readonly Array<{contentId:string;contentKind:'post'|'article';
    previous:number;current:number;delta:number}>; // decreasing delta, original input order on exact ties
  unavailable: readonly Array<{contentId:string;contentKind:'post'|'article';
    previous:number|null;current:number|null}>; // original input order
  counts:{compared:number;ranked:number;unavailable:number};
  warnings:[
    'caller_metrics_unverified',
    'same_capture_minutes_not_provider_window',
    'no_performance_or_rates_inferred',
    ...optional 'unavailable_excluded_from_ranking',
    ...optional 'negative_delta_may_be_counter_correction'
  ]
}
```

No labels, descriptions, URLs, account IDs, credentials, provider calls, approval receipts or persistable data. No percentage change, CTR, engagement rate or winner claims. Signed deltas may be negative and are merely differences between two counter observations. Strict own-data input with no accessors/proxies, bounded <=32KiB pure output.

## MCP and capability

One typed MCP tool `linkedin.analytics.rank_snapshot_changes`, strict Zod pre-handler schema with sanitized unknown secret names and values, existing M12.0 source validation reused, dual text/structured <=256KiB full raw HTTP/SSE even with hostile 270k host IDs. Registered for both STDIO and HTTP; no private store or external HTTP fetch. Capability `analytics.snapshots.rank`: LOCAL_ONLY/AVAILABLE/ACTIVE/M12. Existing `analytics.snapshots.compare` remains available; `analytics.post` and `schedule.create` remain UNAVAILABLE. In-memory tool count 60→61, compiled runtime 64→65.

## Test/release gates

Genuine pure missing-module RED then GREEN with chronological alignment, ties/order, negative corrections, null split, 10-entry bound, hostile proxies/accessors/array holes, repeated IDs, differing captures, secret fields, immutability. Genuine real MCP listTools missing-method/inventory RED then GREEN; malformed secret fields prehandler no echo, host requestID bounds, raw SSE, truthfulness and no provider access. Real compiled STDIO/HTTP smoke and count 65, provider capability truth. Full Node24 quality and Vitest, independent pure and MCP+transport reviews Critical0 Important0, connector-first SHA-verified blobs/tree, feature PR CI, guarded squash and exact main push CI before VERIFIED/MERGED. Overall M12 stays IMPLEMENTING.
