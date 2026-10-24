import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { normalizeArticleDraft } from './articles/article-project.js';
import {
  createCompanionPostDraft,
  previewArticleDraft,
  validateArticleDraft,
} from './articles/article-render.js';
import type { LocalArticleStore } from './articles/article-store.js';

interface ArticleToolsDeps {
  transport?: 'stdio' | 'http';
  articleStore?: LocalArticleStore;
  createRequestId: () => string;
  now: () => Date;
}

const source = z
  .object({
    id: z.string().min(1).max(80),
    title: z.string().min(1).max(240),
    url: z.string().min(1).max(2048),
    notes: z.string().max(2000).optional(),
    provenance: z.literal('user_supplied_unverified').optional(),
  })
  .strict();
const outline = z
  .object({
    id: z.string().min(1).max(80),
    heading: z.string().min(1).max(240),
    notes: z.string().max(2000).optional(),
  })
  .strict();
const block = z
  .object({
    id: z.string().min(1).max(80),
    kind: z.enum(['heading', 'paragraph', 'bullets', 'quote', 'code', 'image_placeholder']),
    text: z.string().min(1).max(12000),
    sourceIds: z.array(z.string().min(1).max(80)).max(30).optional(),
  })
  .strict();
const draft = z
  .object({
    title: z.string().min(1).max(200),
    topic: z.string().min(1).max(200),
    audience: z.string().min(1).max(240),
    goal: z.string().min(1).max(500),
    research: z.object({ brief: z.string().max(16000), sources: z.array(source).max(30) }).strict(),
    outline: z.array(outline).max(25),
    blocks: z.array(block).max(80),
    seo: z
      .object({
        slug: z.string().max(120).optional(),
        description: z.string().max(320).optional(),
        keywords: z.array(z.string().max(80)).max(12).optional(),
      })
      .strict()
      .optional(),
    media: z
      .object({ coverDescription: z.string().max(800).optional(), altText: z.string().max(320).optional() })
      .strict()
      .optional(),
    companionPost: z.string().max(3000).optional(),
    review: z
      .object({
        state: z.enum(['draft', 'needs_review', 'reviewed']),
        notes: z.string().max(2000).optional(),
      })
      .strict(),
  })
  .strict();

const draftInput = z.object({ draft }).strict();
const projectId = z.string().uuid();
const idempotencyKey = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
const createInput = z.object({ draft, idempotencyKey }).strict();
const getInput = z.object({ id: projectId }).strict();
const revision = z.number().int().min(1);
const updateInput = z.object({ id: projectId, expectedRevision: revision, draft }).strict();
const removeInput = z.object({ id: projectId, expectedRevision: revision }).strict();
const emptyInput = z.object({}).strict();

const warning = z.object({ code: z.string(), message: z.string() }).strict();
const review = z.object({ readyForReview: z.boolean(), warnings: z.array(warning).max(100) }).strict();
const preview = z
  .object({
    format: z.literal('markdown'),
    publicationStatus: z.literal('not_published'),
    sourceVerification: z.literal('user_supplied_unverified'),
    markdown: z.string(),
    review,
  })
  .strict();
const companion = z.object({ status: z.literal('draft_only'), text: z.string().max(3000) }).strict();
const project = z
  .object({
    id: projectId,
    revision,
    createdAt: z.string(),
    updatedAt: z.string(),
    draft: draft.extend({
      research: draft.shape.research.extend({
        sources: z.array(source.extend({ provenance: z.literal('user_supplied_unverified') })).max(30),
      }),
    }),
  })
  .strict();
const projectSummary = project.omit({ draft: true }).extend({ title: z.string().max(200) });
const envelope = z
  .object({
    status: z.enum(['succeeded', 'unsupported', 'failed', 'partial']),
    data: z.unknown().optional(),
    provider: z.object({ type: z.literal('LOCAL_ONLY'), name: z.literal('linkedin-mcp') }).strict(),
    error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).strict().optional(),
    metadata: z.object({ requestId: z.string(), timestamp: z.string() }).strict(),
  })
  .strict();
const responseFor = <T extends z.ZodTypeAny>(data: T) => envelope.safeExtend({ data: data.optional() });

const MAX_REPLY_BYTES = 262_144;

function reply(
  deps: ArticleToolsDeps,
  status: 'succeeded' | 'unsupported' | 'failed' | 'partial',
  data?: unknown,
  code?: string,
) {
  const provider = { type: 'LOCAL_ONLY' as const, name: 'linkedin-mcp' as const };
  const metadata = { requestId: deps.createRequestId(), timestamp: deps.now().toISOString() };
  const error =
    code === undefined
      ? undefined
      : {
          code,
          message:
            'Local article authoring request did not complete; no publication or verification occurred.',
          retryable: code === 'outcome_unknown',
        };
  let value = {
    status,
    ...(data === undefined ? {} : { data }),
    provider,
    ...(error === undefined ? {} : { error }),
    metadata,
  };
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_REPLY_BYTES) {
    value = {
      status: 'failed' as const,
      provider,
      error: {
        code: 'output_too_large',
        message: 'Local article response exceeded limit.',
        retryable: false,
      },
      metadata,
    };
  }
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    structuredContent: value,
    ...(value.status === 'succeeded' ? {} : { isError: true as const }),
  };
}

function exceptionCode(error: unknown): string {
  if (error !== null && typeof error === 'object' && Object.hasOwn(error, 'kind')) {
    const kind: unknown = Object.getOwnPropertyDescriptor(error, 'kind')?.value;
    if (
      typeof kind === 'string' &&
      [
        'invalid_input',
        'not_found',
        'revision_conflict',
        'idempotency_conflict',
        'capacity',
        'unsafe_store',
        'outcome_unknown',
      ].includes(kind)
    )
      return kind;
  }
  return 'invalid_input';
}

export function registerArticleTools(server: McpServer, deps: ArticleToolsDeps): void {
  const pure =
    (fn: (value: ReturnType<typeof normalizeArticleDraft>) => unknown) => (input: { draft: unknown }) => {
      try {
        return reply(deps, 'succeeded', fn(normalizeArticleDraft(input.draft)));
      } catch {
        return reply(deps, 'failed', undefined, 'invalid_input');
      }
    };
  server.registerTool(
    'linkedin.article.draft.validate',
    {
      description:
        'Assess local editorial completeness of a user-supplied, unverified long-form article draft; no browsing or publishing.',
      inputSchema: draftInput,
      outputSchema: responseFor(review),
    },
    pure(validateArticleDraft),
  );
  server.registerTool(
    'linkedin.article.draft.preview',
    {
      description:
        'Render escaped inert local draft Markdown with explicitly unverified source notes; never publish or fetch images.',
      inputSchema: draftInput,
      outputSchema: responseFor(preview),
    },
    pure(previewArticleDraft),
  );
  server.registerTool(
    'linkedin.article.draft.companion',
    {
      description: 'Suggest a deterministic local companion post draft, never submit it to LinkedIn.',
      inputSchema: draftInput,
      outputSchema: responseFor(companion),
    },
    pure(createCompanionPostDraft),
  );

  async function saved(fn: (store: LocalArticleStore) => Promise<unknown>) {
    if (deps.transport !== 'stdio' || deps.articleStore === undefined) {
      return reply(deps, 'unsupported', undefined, 'local_store_not_available');
    }
    try {
      return reply(deps, 'succeeded', await fn(deps.articleStore));
    } catch (error) {
      const code = exceptionCode(error);
      return reply(deps, code === 'outcome_unknown' ? 'partial' : 'failed', undefined, code);
    }
  }

  server.registerTool(
    'linkedin.article.projects.create',
    {
      description:
        'Create or replay a private STDIO local draft project using an idempotency key; no publication.',
      inputSchema: createInput,
      outputSchema: responseFor(project),
    },
    (input) => saved((store) => store.create(input)),
  );
  server.registerTool(
    'linkedin.article.projects.update',
    {
      description: 'Update a local project only with the expected current revision.',
      inputSchema: updateInput,
      outputSchema: responseFor(project),
    },
    (input) => saved((store) => store.update(input)),
  );
  server.registerTool(
    'linkedin.article.projects.get',
    {
      description: 'Read a private STDIO local draft project by project ID.',
      inputSchema: getInput,
      outputSchema: responseFor(project.nullable()),
    },
    (input) => saved((store) => store.get(input)),
  );
  server.registerTool(
    'linkedin.article.projects.list',
    {
      description: 'List only private local article project metadata; never list all article prose.',
      inputSchema: emptyInput,
      outputSchema: responseFor(z.array(projectSummary).max(50)),
    },
    () => saved((store) => store.list()),
  );
  server.registerTool(
    'linkedin.article.projects.remove',
    {
      description: 'Remove a private STDIO draft project only at its expected revision.',
      inputSchema: removeInput,
      outputSchema: responseFor(z.boolean()),
    },
    (input) => saved((store) => store.remove(input)),
  );
}
