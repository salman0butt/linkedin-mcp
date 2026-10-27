import { describe, expect, it, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';

// Filesystem fixtures are purely virtual: config parsing must NEVER create a
// media-root/sidecar directory in order to decide whether paths overlap.
const virtualMediaRoots = vi.hoisted(() => new Set<string>());
const simulatedCaseSensitiveRoot = vi.hoisted(() => '/private/tmp/m11-virtual-case-sensitive-apfs-fixture');
const virtualMounts = vi.hoisted(() => new Map<string, { dev: number; ino: number }>());
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  const { tmpdir: osTmpdir } = await import('node:os');
  // Read an EXISTING directory's metadata: Ubuntu has /tmp but need not have
  // macOS's /private/tmp. Never create or mutate files for virtual fixtures.
  return {
    ...fs,
    realpathSync: (path: string) =>
      path === simulatedCaseSensitiveRoot || virtualMediaRoots.has(path) || virtualMounts.has(path)
        ? path
        : fs.realpathSync(path),
    statSync: (path: string) => {
      const mount = virtualMounts.get(path);
      if (mount !== undefined) {
        return Object.assign(fs.statSync(osTmpdir()), mount);
      }
      return path === simulatedCaseSensitiveRoot || virtualMediaRoots.has(path)
        ? fs.statSync(osTmpdir())
        : fs.statSync(path);
    },
  };
});

import { parseConfig } from '../src/config.js';

// Real, readable OS temp ancestor for fixtures intended to exercise host-path
// validation rather than a platform-specific /private/tmp installation.
const testTempRoot = realpathSync(process.platform === 'darwin' ? '/tmp' : tmpdir());

const encryptionKey = Buffer.alloc(32, 7).toString('base64');

function nativePkceEnv(tokenEncryptionKey: string) {
  return {
    LINKEDIN_MCP_OAUTH_MODE: 'native_pkce',
    LINKEDIN_MCP_CLIENT_ID: 'client-id',
    LINKEDIN_MCP_REDIRECT_URI: 'http://127.0.0.1:17890/oauth/callback',
    LINKEDIN_MCP_OAUTH_SCOPES: 'openid profile email',
    LINKEDIN_MCP_CREDENTIAL_STORE_PATH: '/tmp/linkedin-mcp-credentials.json',
    LINKEDIN_MCP_TOKEN_ENCRYPTION_KEY: tokenEncryptionKey,
  } as const;
}

describe('parseConfig', () => {
  it('uses conservative production-safe defaults', () => {
    expect(parseConfig({})).toEqual({
      transport: 'stdio',
      httpHost: '127.0.0.1',
      httpPort: 3000,
      logLevel: 'info',
      serverName: 'linkedin-mcp',
      serverVersion: '0.0.0',
      requestBodyLimitBytes: 1_048_576,
      publishingApprovalTtlMs: 300_000,
      memberPostReadEnabled: false,
      imageStatusReadEnabled: false,
      engagementReadEnabled: false,
      mediaMaxBytes: 20 * 1_048_576,
    });
  });
  it('enables saved jobs only with an explicit absolute host-owned path', () => {
    expect(
      parseConfig({ LINKEDIN_MCP_JOB_SAVED_PATH: join(testTempRoot, 'my-workspace/saved.json') }),
    ).toMatchObject({ jobSavedPath: join(testTempRoot, 'my-workspace/saved.json') });
    for (const value of ['', 'saved.json', '/tmp/../sensitive.json', '/tmp/folder/./saved.json']) {
      expect(() => parseConfig({ LINKEDIN_MCP_JOB_SAVED_PATH: value })).toThrow(/saved.*path/i);
    }
    expect(parseConfig({})).not.toHaveProperty('jobSavedPath');
  });
  it('enables private article drafts only with a distinct canonical absolute host-owned path', () => {
    expect(
      parseConfig({ LINKEDIN_MCP_ARTICLE_STORE_PATH: join(testTempRoot, 'articles/projects.json') }),
    ).toMatchObject({ articleStorePath: join(testTempRoot, 'articles/projects.json') });
    for (const value of [
      '',
      'projects.json',
      '/tmp/../projects.json',
      '/tmp/./projects.json',
      '/tmp/projects.json/',
    ]) {
      expect(() => parseConfig({ LINKEDIN_MCP_ARTICLE_STORE_PATH: value })).toThrow(/article.*path/i);
    }
    expect(parseConfig({})).not.toHaveProperty('articleStorePath');
  });

  it('enables calendar-plan persistence only on an explicit canonical absolute host path', () => {
    expect(
      parseConfig({ LINKEDIN_MCP_CALENDAR_STORE_PATH: join(testTempRoot, 'calendars/plans.json') }),
    ).toMatchObject({ calendarStorePath: join(testTempRoot, 'calendars/plans.json') });
    expect(parseConfig({})).not.toHaveProperty('calendarStorePath');
    for (const path of [
      '',
      'plans.json',
      '/tmp/../plans.json',
      '/tmp/./plans.json',
      '/tmp/plans.json/',
      '/tmp/plans.json.lock',
      '/tmp/plans.json.initialized',
    ]) {
      expect(() => parseConfig({ LINKEDIN_MCP_CALENDAR_STORE_PATH: path })).toThrow(/calendar.*path/i);
    }
  });

  it('rejects calendar-store overlap with other private paths, companions and media roots', () => {
    const calendar = join(testTempRoot, 'm11-calendar.json');
    for (const extra of [
      { LINKEDIN_MCP_JOB_SAVED_PATH: calendar },
      { LINKEDIN_MCP_JOB_SAVED_PATH: calendar + '.lock' },
      { LINKEDIN_MCP_ARTICLE_STORE_PATH: calendar },
      { LINKEDIN_MCP_ARTICLE_STORE_PATH: calendar + '.initialized' },
      { LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH: calendar + '.ready' },
      { ...nativePkceEnv(encryptionKey), LINKEDIN_MCP_CREDENTIAL_STORE_PATH: calendar },
      { LINKEDIN_MCP_ARTICLE_STORE_PATH: calendar + '/nested.json' },
      { LINKEDIN_MCP_ARTICLE_STORE_PATH: testTempRoot, LINKEDIN_MCP_CALENDAR_STORE_PATH: calendar },
      { LINKEDIN_MCP_JOB_SAVED_PATH: calendar + '/nested.json' },
      { LINKEDIN_MCP_JOB_SAVED_PATH: testTempRoot, LINKEDIN_MCP_CALENDAR_STORE_PATH: calendar },
      { LINKEDIN_MCP_MEDIA_ROOT: testTempRoot },
    ]) {
      expect(() => parseConfig({ LINKEDIN_MCP_CALENDAR_STORE_PATH: calendar, ...extra })).toThrow(
        /calendar.*(overlap|path|private|collid)/i,
      );
    }
  });

  it('rejects all four media-root directory aliases of private companions without filesystem writes', () => {
    const observed: Array<{ store: Record<string, string>; mediaRoot: string }> = [
      {
        store: { LINKEDIN_MCP_CALENDAR_STORE_PATH: join(testTempRoot, 'review-calendar.json') },
        mediaRoot: join(testTempRoot, 'review-calendar.json.lock'),
      },
      {
        store: { LINKEDIN_MCP_CALENDAR_STORE_PATH: join(testTempRoot, 'review-calendar.json') },
        mediaRoot: join(testTempRoot, 'review-calendar.json.initialized'),
      },
      {
        store: { LINKEDIN_MCP_ARTICLE_STORE_PATH: join(testTempRoot, 'review-article.json') },
        mediaRoot: join(testTempRoot, 'review-article.json.ready'),
      },
      {
        store: { LINKEDIN_MCP_ARTICLE_STORE_PATH: join(testTempRoot, 'review-article.json') },
        mediaRoot: join(testTempRoot, '.review-article.json.lock'),
      },
    ];
    for (const { store, mediaRoot } of observed) {
      virtualMediaRoots.add(mediaRoot);
      try {
        expect(() => parseConfig({ ...store, LINKEDIN_MCP_MEDIA_ROOT: mediaRoot })).toThrow(
          /(media|private|overlap|companion|path)/i,
        );
      } finally {
        virtualMediaRoots.delete(mediaRoot);
      }
    }
  });

  it('rejects all private store companions, including hidden dot-lock, colliding with a media root', () => {
    const fileKeys = [
      'LINKEDIN_MCP_CALENDAR_STORE_PATH',
      'LINKEDIN_MCP_ARTICLE_STORE_PATH',
      'LINKEDIN_MCP_JOB_SAVED_PATH',
      'LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH',
      'LINKEDIN_MCP_CREDENTIAL_STORE_PATH',
    ] as const;
    const prefix = join(testTempRoot, 'review-private-file.json');
    const companionPaths = [
      prefix,
      `${prefix}.lock`,
      `${prefix}.initialized`,
      `${prefix}.ready`,
      join(testTempRoot, '.review-private-file.json.lock'),
    ];
    for (const fileKey of fileKeys) {
      for (const mediaRoot of companionPaths) {
        virtualMediaRoots.add(mediaRoot);
        try {
          const env = {
            ...(fileKey === 'LINKEDIN_MCP_CREDENTIAL_STORE_PATH' ? nativePkceEnv(encryptionKey) : {}),
            [fileKey]: prefix,
            LINKEDIN_MCP_MEDIA_ROOT: mediaRoot,
          };
          expect(() => parseConfig(env)).toThrow(/(media|private|overlap|companion|path)/i);
        } finally {
          virtualMediaRoots.delete(mediaRoot);
        }
      }
    }
  });

  it('rejects standalone job store and publishing ledger inside media roots and cross-private-store collisions', () => {
    for (const key of ['LINKEDIN_MCP_JOB_SAVED_PATH', 'LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH']) {
      expect(() =>
        parseConfig({
          [key]: join(testTempRoot, 'nested/private.json'),
          LINKEDIN_MCP_MEDIA_ROOT: testTempRoot,
        }),
      ).toThrow(/(media|private|overlap|path)/i);
    }

    const file = join(testTempRoot, 'm11-all-private.json');
    const keys = [
      'LINKEDIN_MCP_CALENDAR_STORE_PATH',
      'LINKEDIN_MCP_ARTICLE_STORE_PATH',
      'LINKEDIN_MCP_JOB_SAVED_PATH',
      'LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH',
      'LINKEDIN_MCP_CREDENTIAL_STORE_PATH',
    ] as const;
    for (let a = 0; a < keys.length; a++) {
      for (let b = a + 1; b < keys.length; b++) {
        const left = keys[a]!;
        const right = keys[b]!;
        const auth =
          left === 'LINKEDIN_MCP_CREDENTIAL_STORE_PATH' || right === 'LINKEDIN_MCP_CREDENTIAL_STORE_PATH';
        const env = {
          ...(auth ? nativePkceEnv(encryptionKey) : {}),
          [left]: file,
          [right]: file + '.lock',
        };
        expect(() => parseConfig(env)).toThrow(/(media|private|overlap|differ|path|companion)/i);
      }
    }
  });

  it('accepts safe sibling stores and media root without falsely matching same-prefix names', () => {
    const mediaRoot = join(testTempRoot, 'review-media');
    virtualMediaRoots.add(mediaRoot);
    try {
      const settings = parseConfig({
        ...nativePkceEnv(encryptionKey),
        LINKEDIN_MCP_CREDENTIAL_STORE_PATH: join(testTempRoot, 'review-secrets/tokens.json'),
        LINKEDIN_MCP_MEDIA_ROOT: mediaRoot,
        LINKEDIN_MCP_CALENDAR_STORE_PATH: join(testTempRoot, 'review-media-backup/plan.json'),
        LINKEDIN_MCP_ARTICLE_STORE_PATH: join(testTempRoot, 'review-articles/article.json'),
        LINKEDIN_MCP_JOB_SAVED_PATH: join(testTempRoot, 'review-jobs/jobs.json'),
        LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH: join(testTempRoot, 'review-ledger/ledger.json'),
      });
      expect(settings.calendarStorePath).toBe(join(testTempRoot, 'review-media-backup/plan.json'));
      expect(settings.mediaRoot).toBe(mediaRoot);
    } finally {
      virtualMediaRoots.delete(mediaRoot);
    }
  });

  it('rejects macOS case and Unicode-normalization aliases of calendar secrets and sidecars', () => {
    // On case-sensitive Linux these are different safe paths, and must remain allowed.
    if (process.platform !== 'darwin') return;
    const calendar = '/private/tmp/Calendars/Plans.JSON';
    const variants = [
      { LINKEDIN_MCP_JOB_SAVED_PATH: '/PRIVATE/TMP/CALENDARS/plans.json' },
      { LINKEDIN_MCP_JOB_SAVED_PATH: '/private/tmp/calendars/plans.json.LOCK' },
      { LINKEDIN_MCP_ARTICLE_STORE_PATH: '/private/tmp/CALENDARS/plans.json.INITIALIZED' },
      { LINKEDIN_MCP_ARTICLE_STORE_PATH: '/PRIVATE/TMP/calendars/PLANS.json.ready' },
      { LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH: '/private/tmp/calendars/plans.json' },
      {
        ...nativePkceEnv(encryptionKey),
        LINKEDIN_MCP_CREDENTIAL_STORE_PATH: '/PRIVATE/TMP/CALENDARS/PLANS.JSON',
      },
      { LINKEDIN_MCP_JOB_SAVED_PATH: '/PRIVATE/TMP/CALENDARS/PLANS.JSON/nested.json' },
      { LINKEDIN_MCP_ARTICLE_STORE_PATH: '/PRIVATE/TMP/CALENDARS' },
    ];
    for (const other of variants) {
      expect(() => parseConfig({ LINKEDIN_MCP_CALENDAR_STORE_PATH: calendar, ...other })).toThrow(
        /calendar.*(overlap|private|path|collid)/i,
      );
    }

    const nfc = '/private/tmp/Caf\u00e9/Plans.json';
    const nfd = '/PRIVATE/TMP/Cafe\u0301/plans.JSON';
    expect(() =>
      parseConfig({ LINKEDIN_MCP_CALENDAR_STORE_PATH: nfc, LINKEDIN_MCP_JOB_SAVED_PATH: nfd }),
    ).toThrow(/calendar.*(overlap|private|path|collid)/i);

    for (const companionSuffix of ['.LOCK', '.INITIALIZED', '.READY']) {
      expect(() =>
        parseConfig({
          LINKEDIN_MCP_CALENDAR_STORE_PATH: '/private/tmp/calendars/plans.json' + companionSuffix,
        }),
      ).toThrow(/calendar.*(private|companion|path)/i);
    }
  });

  it('rejects NFC/NFD collisions for missing leaves on a simulated case-sensitive Darwin APFS volume', () => {
    if (process.platform !== 'darwin') return;
    // A read-only virtual ancestor has a working same-case stat/realpath but
    // its differently cased alias is ENOENT: Darwin case-sensitive volume.
    const composed = `${simulatedCaseSensitiveRoot}/Caf\u00e9/plans.json`;
    const decomposed = `${simulatedCaseSensitiveRoot}/Cafe\u0301/plans.json`;
    for (const other of [
      decomposed,
      decomposed + '.lock',
      decomposed + '.initialized',
      decomposed + '.ready',
      `${simulatedCaseSensitiveRoot}/Cafe\u0301/.plans.json.lock`,
    ]) {
      expect(() =>
        parseConfig({
          LINKEDIN_MCP_CALENDAR_STORE_PATH: composed,
          LINKEDIN_MCP_JOB_SAVED_PATH: other,
        }),
      ).toThrow(/calendar.*(overlap|private|path|collid)/i);
    }
    expect(() =>
      parseConfig({
        LINKEDIN_MCP_ARTICLE_STORE_PATH: composed,
        LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH: decomposed,
      }),
    ).toThrow(/article.*(overlap|private|path|collid)/i);

    // All pairwise store/isolation rules must also apply across NFC/NFD.
    const mediaRoot = `${simulatedCaseSensitiveRoot}/Cafe\u0301`;
    virtualMediaRoots.add(mediaRoot);
    try {
      expect(() =>
        parseConfig({
          LINKEDIN_MCP_CALENDAR_STORE_PATH: composed,
          LINKEDIN_MCP_MEDIA_ROOT: mediaRoot,
        }),
      ).toThrow(/calendar.*(overlap|private|path|collid)/i);
    } finally {
      virtualMediaRoots.delete(mediaRoot);
    }
  });

  it('accepts case-distinct sibling leaves on case-sensitive Darwin despite shared NFC/NFD forms', () => {
    if (process.platform !== 'darwin') return;
    const result = parseConfig({
      LINKEDIN_MCP_CALENDAR_STORE_PATH: `${simulatedCaseSensitiveRoot}/Caf\u00e9/plans.json`,
      LINKEDIN_MCP_JOB_SAVED_PATH: `${simulatedCaseSensitiveRoot}/caf\u00e9/plans.json`,
      LINKEDIN_MCP_ARTICLE_STORE_PATH: `${simulatedCaseSensitiveRoot}/CAF\u00c9/plans.json`,
    });
    expect(result.calendarStorePath).toBe(`${simulatedCaseSensitiveRoot}/Caf\u00e9/plans.json`);
  });

  it('rejects case aliases on a case-insensitive Darwin volume mounted beneath a case-sensitive parent', () => {
    if (process.platform !== 'darwin') return;
    const mount = '/Volumes/ReviewCaseInsensitiveDisk';
    // The mount device is 9001 but its parent mountpoint name is resolved by
    // a different, case-sensitive filesystem (dev 25). An alternate-case stat
    // of the mountpoint is ENOENT; that is NOT evidence that dev 9001 is sensitive.
    virtualMounts.set('/Volumes', { dev: 25, ino: 100 });
    virtualMounts.set(mount, { dev: 9001, ino: 101 });
    try {
      for (const other of [
        `${mount}/café/plans.json`,
        `${mount}/café/plans.json.lock`,
        `${mount}/café/plans.json.initialized`,
        `${mount}/café/plans.json.ready`,
        `${mount}/café/.plans.json.lock`,
      ]) {
        expect(() =>
          parseConfig({
            LINKEDIN_MCP_CALENDAR_STORE_PATH: `${mount}/Café/plans.json`,
            LINKEDIN_MCP_JOB_SAVED_PATH: other,
          }),
        ).toThrow(/calendar.*(overlap|private|path|collid)/i);
      }
      // No same-device case evidence: even a truly sensitive mounted device
      // must fail conservatively rather than allow unsafe aliases.
      expect(() =>
        parseConfig({
          LINKEDIN_MCP_ARTICLE_STORE_PATH: `${mount}/Café/article.json`,
          LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH: `${mount}/café/article.json`,
        }),
      ).toThrow(/article.*(overlap|private|path|collid)/i);
    } finally {
      virtualMounts.clear();
    }
  });

  it('accepts case-distinct files on a case-sensitive mounted Darwin volume with same-device proof', () => {
    if (process.platform !== 'darwin') return;
    const mount = '/Volumes/ReviewCaseSensitiveDisk';
    const proof = `${mount}/ProofFolder`;
    virtualMounts.set('/Volumes', { dev: 25, ino: 100 });
    virtualMounts.set(mount, { dev: 9002, ino: 201 });
    // The parent filesystem can itself be case-insensitive: the different-case
    // mountpoint name reaches the SAME mounted inode. It is not valid evidence
    // for the mounted volume's own casing rules.
    virtualMounts.set('/Volumes/reviewCaseSensitiveDisk', { dev: 9002, ino: 201 });
    virtualMounts.set(proof, { dev: 9002, ino: 202 });
    try {
      const parsed = parseConfig({
        LINKEDIN_MCP_CALENDAR_STORE_PATH: `${proof}/Café/plans.json`,
        LINKEDIN_MCP_JOB_SAVED_PATH: `${proof}/café/plans.json`,
        LINKEDIN_MCP_ARTICLE_STORE_PATH: `${proof}/CAFÉ/plans.json`,
      });
      expect(parsed.jobSavedPath).toBe(`${proof}/café/plans.json`);
      // Unicode canonical equivalents are still aliases on sensitive APFS.
      expect(() =>
        parseConfig({
          LINKEDIN_MCP_CALENDAR_STORE_PATH: `${proof}/Café/plans.json`,
          LINKEDIN_MCP_JOB_SAVED_PATH: `${proof}/Cafe\u0301/plans.json`,
        }),
      ).toThrow(/calendar.*(overlap|private|path|collid)/i);
    } finally {
      virtualMounts.clear();
    }
  });

  it('preserves Linux case and Unicode-distinct missing-leaf paths', () => {
    // A temporary test-only platform override verifies the same code branch
    // on the Darwin test runner without requiring a Linux worker or writing files.
    const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { ...descriptor, value: 'linux' });
    try {
      const result = parseConfig({
        LINKEDIN_MCP_CALENDAR_STORE_PATH: `${simulatedCaseSensitiveRoot}/Caf\u00e9/plans.json`,
        LINKEDIN_MCP_JOB_SAVED_PATH: `${simulatedCaseSensitiveRoot}/Cafe\u0301/plans.json`,
        LINKEDIN_MCP_ARTICLE_STORE_PATH: `${simulatedCaseSensitiveRoot}/caf\u00e9/plans.json`,
      });
      expect(result.jobSavedPath).toBe(`${simulatedCaseSensitiveRoot}/Cafe\u0301/plans.json`);
    } finally {
      Object.defineProperty(process, 'platform', descriptor);
    }
  });

  it('rejects macOS case-alias overlaps with media roots and existing article/ledger/OAuth paths', () => {
    if (process.platform !== 'darwin') return;
    expect(() =>
      parseConfig({
        LINKEDIN_MCP_CALENDAR_STORE_PATH: '/PRIVATE/TMP/CALENDAR/PLANS.JSON',
        LINKEDIN_MCP_MEDIA_ROOT: '/private/tmp',
      }),
    ).toThrow(/calendar.*(overlap|private|path|collid)/i);
    expect(() =>
      parseConfig({
        LINKEDIN_MCP_ARTICLE_STORE_PATH: '/private/tmp/Articles/Projects.json',
        LINKEDIN_MCP_JOB_SAVED_PATH: '/PRIVATE/TMP/ARTICLES/projects.JSON.ready',
      }),
    ).toThrow(/article.*(overlap|path|collid)/i);
    expect(() =>
      parseConfig({
        ...nativePkceEnv(encryptionKey),
        LINKEDIN_MCP_CREDENTIAL_STORE_PATH: '/private/tmp/CREDENTIALS.JSON',
        LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH: '/PRIVATE/TMP/credentials.json',
      }),
    ).toThrow(/publishing ledger.*(differ|overlap|path)/i);
    expect(() =>
      parseConfig({
        ...nativePkceEnv(encryptionKey),
        LINKEDIN_MCP_CREDENTIAL_STORE_PATH: '/PRIVATE/TMP/SECRETS/CREDENTIALS.JSON',
        LINKEDIN_MCP_MEDIA_ROOT: '/private/tmp',
      }),
    ).toThrow(/oauth credential.*media root/i);
  });

  it('preserves distinct sibling host paths and physical symlink aliases without creating files', () => {
    const config = parseConfig({
      LINKEDIN_MCP_CALENDAR_STORE_PATH: join(testTempRoot, 'calendar-safe/plans.json'),
      LINKEDIN_MCP_JOB_SAVED_PATH: join(testTempRoot, 'calendar-safe-backups/plans.json'),
      LINKEDIN_MCP_ARTICLE_STORE_PATH: join(testTempRoot, 'elsewhere/articles.json'),
      LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH: join(testTempRoot, 'elsewhere/posts.json'),
    });
    expect(config.calendarStorePath).toBe(join(testTempRoot, 'calendar-safe/plans.json'));
    // /tmp aliases /private/tmp on this macOS host; detect via read-only realpath of existing ancestors.
    if (process.platform === 'darwin') {
      expect(() =>
        parseConfig({
          LINKEDIN_MCP_CALENDAR_STORE_PATH: '/tmp/calendar-alias/plan.json',
          LINKEDIN_MCP_JOB_SAVED_PATH: '/private/tmp/calendar-alias/plan.json',
        }),
      ).toThrow(/calendar.*(overlap|path|private|collid)/i);
    }
    if (process.platform === 'linux') {
      expect(
        parseConfig({
          LINKEDIN_MCP_CALENDAR_STORE_PATH: '/tmp/CalendarCase/plans.json',
          LINKEDIN_MCP_ARTICLE_STORE_PATH: '/tmp/calendarcase/plans.json',
        }).calendarStorePath,
      ).toBe('/tmp/CalendarCase/plans.json');
      expect(
        parseConfig({
          LINKEDIN_MCP_CALENDAR_STORE_PATH: '/tmp/Caf\u00e9/plan.json',
          LINKEDIN_MCP_JOB_SAVED_PATH: '/tmp/Cafe\u0301/plan.json',
        }).jobSavedPath,
      ).toBe('/tmp/Cafe\u0301/plan.json');
    }
  });

  it('rejects article path overlaps with private saved jobs, OAuth secrets, ledger and companions', () => {
    const article = '/tmp/articles.json';
    for (const env of [
      { LINKEDIN_MCP_JOB_SAVED_PATH: article },
      { LINKEDIN_MCP_JOB_SAVED_PATH: article + '.lock' },
      { LINKEDIN_MCP_JOB_SAVED_PATH: article + '.initialized' },
      { LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH: article },
      { LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH: article + '.lock' },
      { ...nativePkceEnv(encryptionKey), LINKEDIN_MCP_CREDENTIAL_STORE_PATH: article },
    ]) {
      expect(() => parseConfig({ LINKEDIN_MCP_ARTICLE_STORE_PATH: article, ...env })).toThrow(
        /article.*(overlap|collid|differ|path)/i,
      );
    }
  });

  it('rejects nested article/private-store path collisions in both directions before IO', () => {
    const article = join(testTempRoot, 'm08-parent');
    const nested = `${article}/private.json`;
    for (const env of [
      { LINKEDIN_MCP_ARTICLE_STORE_PATH: article, LINKEDIN_MCP_JOB_SAVED_PATH: nested },
      { LINKEDIN_MCP_ARTICLE_STORE_PATH: nested, LINKEDIN_MCP_JOB_SAVED_PATH: article },
      { LINKEDIN_MCP_ARTICLE_STORE_PATH: article, LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH: nested },
      { LINKEDIN_MCP_ARTICLE_STORE_PATH: nested, LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH: article },
      {
        ...nativePkceEnv(encryptionKey),
        LINKEDIN_MCP_CREDENTIAL_STORE_PATH: nested,
        LINKEDIN_MCP_ARTICLE_STORE_PATH: article,
      },
      {
        ...nativePkceEnv(encryptionKey),
        LINKEDIN_MCP_CREDENTIAL_STORE_PATH: article,
        LINKEDIN_MCP_ARTICLE_STORE_PATH: nested,
      },
    ]) {
      expect(() => parseConfig(env)).toThrow(/article.*(overlap|collid|path)/i);
    }
  });

  it('accepts an explicit LinkedIn API version only in YYYYMM form', () => {
    expect(parseConfig({ LINKEDIN_MCP_API_VERSION: '202510' })).toMatchObject({
      linkedinApiVersion: '202510',
    });
  });

  it.each(['2025-10', '20251', '2025101', '202500', '202513', ' 202510 '])(
    'rejects invalid LinkedIn API version %s',
    (apiVersion) => {
      expect(() => parseConfig({ LINKEDIN_MCP_API_VERSION: apiVersion })).toThrow(/api version.*yyyymm/i);
    },
  );

  it('normalizes the explicit publishing ledger path and accepts bounded trusted options', () => {
    const config = parseConfig({
      LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH: 'var/posts.json',
      LINKEDIN_MCP_APPROVAL_TTL_MS: '600000',
      LINKEDIN_MCP_MEMBER_POST_READ_ENABLED: 'true',
      LINKEDIN_MCP_ENGAGEMENT_READ_ENABLED: 'true',
    });

    expect(config.publishingLedgerPath?.startsWith('/')).toBe(true);
    expect(config.publishingApprovalTtlMs).toBe(600_000);
    expect(config.memberPostReadEnabled).toBe(true);
    expect(config.engagementReadEnabled).toBe(true);
  });

  it.each(['0', '-1', '1.5', '600001', 'bad'])('rejects invalid approval TTL %s', (ttl) => {
    expect(() => parseConfig({ LINKEDIN_MCP_APPROVAL_TTL_MS: ttl })).toThrow(/approval ttl/i);
  });

  it('rejects a blank explicit publishing ledger path without touching the filesystem', () => {
    expect(() => parseConfig({ LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH: '  ' })).toThrow(
      /publishing ledger path/i,
    );
  });

  it.each(['yes', '1', 'TRUE', ' false ', ''])('rejects non-exact read flag %j', (readFlag) => {
    expect(() => parseConfig({ LINKEDIN_MCP_MEMBER_POST_READ_ENABLED: readFlag })).toThrow(/true or false/i);
  });

  it.each(['yes', '1', 'TRUE', ' false ', ''])('rejects non-exact engagement read flag %j', (readFlag) => {
    expect(() => parseConfig({ LINKEDIN_MCP_ENGAGEMENT_READ_ENABLED: readFlag })).toThrow(
      /engagement read flag.*true or false/i,
    );
  });

  it('rejects a ledger path that aliases the credential store path', () => {
    expect(() =>
      parseConfig({
        ...nativePkceEnv(encryptionKey),
        LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH: '/tmp/one/../linkedin-mcp-credentials.json',
      }),
    ).toThrow(/must differ from the credential store/i);
  });

  it('parses confidential OAuth configuration only when required values exist', () => {
    const config = parseConfig({
      LINKEDIN_MCP_OAUTH_MODE: 'confidential',
      LINKEDIN_MCP_CLIENT_ID: 'client-id',
      LINKEDIN_MCP_CLIENT_SECRET: 'client-secret',
      LINKEDIN_MCP_REDIRECT_URI: 'http://127.0.0.1:17890/oauth/callback',
      LINKEDIN_MCP_OAUTH_SCOPES: 'openid profile email',
      LINKEDIN_MCP_CREDENTIAL_STORE_PATH: '/tmp/linkedin-mcp-credentials.json',
      LINKEDIN_MCP_TOKEN_ENCRYPTION_KEY: encryptionKey,
    });

    expect(config.auth).toEqual({
      mode: 'confidential',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'http://127.0.0.1:17890/oauth/callback',
      scopes: ['openid', 'profile', 'email'],
      credentialStorePath: '/tmp/linkedin-mcp-credentials.json',
      tokenEncryptionKey: encryptionKey,
    });
  });

  it('parses native PKCE configuration without requiring a client secret', () => {
    const config = parseConfig(nativePkceEnv(encryptionKey));

    expect(config.auth).toEqual({
      mode: 'native_pkce',
      clientId: 'client-id',
      redirectUri: 'http://127.0.0.1:17890/oauth/callback',
      scopes: ['openid', 'profile', 'email'],
      credentialStorePath: '/tmp/linkedin-mcp-credentials.json',
      tokenEncryptionKey: encryptionKey,
    });
  });

  it('requires the token encryption key to be canonical base64 for exactly 32 bytes', () => {
    for (const tokenEncryptionKey of [
      'not-base64',
      Buffer.alloc(31, 7).toString('base64'),
      Buffer.alloc(33, 7).toString('base64'),
      Buffer.alloc(32, 7).toString('base64url'),
    ]) {
      expect(() => parseConfig(nativePkceEnv(tokenEncryptionKey))).toThrow(/32-byte|base64/i);
    }
  });

  it('rejects non-loopback redirect URI for native PKCE mode', () => {
    expect(() =>
      parseConfig({
        LINKEDIN_MCP_OAUTH_MODE: 'native_pkce',
        LINKEDIN_MCP_CLIENT_ID: 'client-id',
        LINKEDIN_MCP_REDIRECT_URI: 'https://example.com/oauth/callback',
        LINKEDIN_MCP_OAUTH_SCOPES: 'openid profile email',
        LINKEDIN_MCP_CREDENTIAL_STORE_PATH: '/tmp/linkedin-mcp-credentials.json',
        LINKEDIN_MCP_TOKEN_ENCRYPTION_KEY: encryptionKey,
      }),
    ).toThrow(/loopback/i);
  });

  it('requires openid in configured OAuth scopes', () => {
    expect(() =>
      parseConfig({
        LINKEDIN_MCP_OAUTH_MODE: 'confidential',
        LINKEDIN_MCP_CLIENT_ID: 'client-id',
        LINKEDIN_MCP_CLIENT_SECRET: 'client-secret',
        LINKEDIN_MCP_REDIRECT_URI: 'http://127.0.0.1:17890/oauth/callback',
        LINKEDIN_MCP_OAUTH_SCOPES: 'profile email',
        LINKEDIN_MCP_CREDENTIAL_STORE_PATH: '/tmp/linkedin-mcp-credentials.json',
        LINKEDIN_MCP_TOKEN_ENCRYPTION_KEY: encryptionKey,
      }),
    ).toThrow(/openid/i);
  });

  it('rejects partial OAuth configuration instead of silently disabling auth', () => {
    expect(() => parseConfig({ LINKEDIN_MCP_CLIENT_ID: 'client-id' })).toThrow(/oauth/i);
  });

  it.each([
    [{ LINKEDIN_MCP_TRANSPORT: 'ftp' }, /transport/i],
    [{ LINKEDIN_MCP_HTTP_HOST: '0.0.0.0' }, /loopback/i],
    [{ LINKEDIN_MCP_HTTP_PORT: '0' }, /port/i],
    [{ LINKEDIN_MCP_HTTP_PORT: '70000' }, /port/i],
    [{ LINKEDIN_MCP_LOG_LEVEL: 'verbose' }, /log level/i],
    [{ LINKEDIN_MCP_BODY_LIMIT_BYTES: '0' }, /body limit/i],
  ])('rejects invalid configuration %j', (env, expected) => {
    expect(() => parseConfig(env)).toThrow(expected);
  });
});
