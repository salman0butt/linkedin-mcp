# M11.0 — Caller-Defined LOCAL_ONLY Content Calendar Preview

## Context and choice

At the verified M10.4 squash main `2366139cffcc080332dd25ec9438018ee1863b33` (push CI `40469415495` SUCCESS), M10's actual external topic discovery remains unavailable without a legitimate provider. M11's full scheduler requires durable queues, live capability checks, short-lived trusted approval, idempotent claim/dispatch and outcome verification. None is safe to infer from a calendar preview. Implement the smallest useful, self-contained **read-only calendar organization** slice now; keep all actual scheduling and publishing unavailable. This is not M11 acceptance completion.

## Exact public contract

Pure API in `apps/server/src/scheduling/calendar-preview.ts`:

```ts
previewLocalContentCalendar(input: unknown): Readonly<LocalCalendarPreview>
```

Strict input, **exact own enumerable data keys only**, arrays dense/ordinary, no accessors, proxies, symbols, extra keys or prototype tricks:

```ts
{
  referenceUtc: string;
  items: Array<{
    id: string;
    label: string;
    kind: 'text_post' | 'image_post' | 'multi_image_post' | 'manual_article_handoff';
    plannedAtUtc: string;
  }>;
}
```

- `referenceUtc` and all `plannedAtUtc` values are **canonical real UTC minute instants** `YYYY-MM-DDTHH:mm:00.000Z`; strict round-trip validation; reject timezone offsets, missing milliseconds, leap seconds, invalid Gregorian dates and non-UTC ambiguous local time. Reference is caller-declared, never implicit wall clock.
- 1–20 items; raw safe ASCII IDs `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`, case-insensitively unique **without trimming**; labels 1–120 UTF-16 code units, nonblank single-line, no control/C1/lone surrogates/U+2028/U+2029; reject leading/trailing whitespace instead of silently changing caller labels. Format enum exact.
- All planned instants strictly later than `referenceUtc` and at most 90 × 24 hours later, inclusive. Do not run ambient now, use network, parse arbitrary timezone names, or infer DST behavior.
- Stable chronology: sort by `plannedAtUtc`, breaking equal-time ties by original caller item order. Group by `utcDate` in ascending order, retaining that order. A collision is two or more caller items at the exact minute; report it, do not shift/dedupe items.
- Return **only** caller-affirmed fields and deterministic metadata, never payload/content/media path, cookies, auth tokens, approval receipts, callback URLs, retries or idempotency handles.

```ts
interface LocalCalendarPreview {
  kind: 'local_content_calendar_preview';
  status: 'planning_only';
  origin: 'caller_defined';
  persistence: 'none';
  execution: 'not_queued';
  approval: 'not_evaluated';
  publication: 'not_attempted';
  referenceUtc: string;
  days: readonly {
    utcDate: string;
    items: readonly {
      id: string;
      label: string;
      kind: 'text_post' | 'image_post' | 'multi_image_post' | 'manual_article_handoff';
      plannedAtUtc: string;
      manualOnly: boolean;
    }[];
  }[];
  collisions: readonly { plannedAtUtc: string; itemIds: readonly string[] }[];
  warnings: readonly (
    | 'caller_planned_only'
    | 'no_scheduling_or_publishing'
    | 'approval_not_evaluated'
    | 'same_minute_collision'
    | 'manual_article_handoff_only'
  )[];
}
```

`manualOnly: true` only for `manual_article_handoff`; other kinds also remain unqueued and unpublished regardless of this flag. Fixed warnings first three, then optional collision and manual flags in that order. Every nested structure deeply frozen, byte-identical across calls. Input serialized UTF-8 JSON ≤16 KiB, pure output JSON ≤32 KiB, bounded **complete dual MCP response + actual raw HTTP SSE ≤256 KiB**.

## MCP and provenance

- Typed `linkedin.calendar.preview`, separate `apps/server/src/calendar-mcp.ts` registrar invoked by `createLinkedInMcpServer`, strict Zod input/output, existing defensive reply pattern with fixed sanitized errors and dual text/structured output. One tool increases count **55 → 56**.
- Capability `calendar.preview` **LOCAL_ONLY / AVAILABLE / ACTIVE / M11**, based only on deterministic testable local preview. Existing `schedule.create`, if present in capability inventory, remains **UNAVAILABLE / PLANNED**. No automatic scheduled execution, retries, cancellation, approval state validation, token handling or provider operations.
- Real built STDIO and HTTP transports, raw SSE near-limit/error/host RPC ID adversarial coverage; no private article/job store access via HTTP. Failure never returns secret names/values from unknown SDK keys.

## Review focus / acceptance

1. Calendar strings such as 2026-02-30, 24:00, leap seconds, local offsets or fractional second variants fail closed; tests assert no normalization.
2. Duplicate ID under ASCII case, padded ID or unusual symbol/proxy/getter (getter count stays zero) rejects without emitting caller content.
3. Same-minute collisions remain ordered and explicit, never auto-shifted or treated as separate schedulings; 20 boundary accepts, 21 rejects.
4. Unknown nested/root secret keys fail before provider call and are absent from response/transport even in SDK-side validation errors.
5. A very large host RPC ID, multi-byte response sizes, and injected private STDIO stores do not leak or exceed HTTP SSE limits.

Genuine pure missing-module RED, actual MCP missing-tool RED, capability/inventory RED, focused GREEN, full Node24 quality and independent pure plus MCP/transport Critical=0 Important=0 reviews, connector-first exact-tree PR, feature and post-merge main exact-SHA CI gate the slice. Verified preview is **not** completed M11 scheduler.
