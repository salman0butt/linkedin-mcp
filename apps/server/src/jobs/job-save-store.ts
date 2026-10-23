import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, rename, unlink } from 'node:fs/promises';
import { isAbsolute, basename, dirname, join, normalize, parse } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import {
  createJobSearchQuery,
  normalizeDiscoveredJob,
  type JobSearchQuery,
  type NormalizedJob,
  type TrustedJobContext,
} from '../../../../packages/core/dist/index.js';

const MAX_JOBS = 500;
const MAX_SEARCHES = 50;
const MAX_BYTES = 2 * 1024 * 1024;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const SEARCH_ID_PATTERN = /^search-[a-f0-9]{64}$/;
const TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export interface SavedJob {
  readonly key: string;
  readonly job: Readonly<NormalizedJob>;
  readonly savedAt: string;
}

export interface SavedSearch {
  readonly id: string;
  readonly query: JobSearchQuery;
  readonly savedAt: string;
}

export interface LocalJobSaveStore {
  saveJob(input: unknown): Promise<SavedJob>;
  saveSearch(input: unknown): Promise<SavedSearch>;
  listJobs(): Promise<readonly SavedJob[]>;
  listSearches(): Promise<readonly SavedSearch[]>;
  getJob(input: unknown): Promise<SavedJob | null>;
  getSearch(input: unknown): Promise<SavedSearch | null>;
  removeJob(input: unknown): Promise<boolean>;
  removeSearch(input: unknown): Promise<boolean>;
}

interface StoreState {
  version: 1;
  jobs: SavedJob[];
  searches: SavedSearch[];
}

function fail(message: string): never {
  throw new Error(`Invalid or unsafe local saved-job store: ${message}`);
}

function ownKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('invalid object');
  const obj = value as Record<string, unknown>;
  const proto: unknown = Object.getPrototypeOf(obj);
  if (proto !== Object.prototype && proto !== null) fail('invalid object prototype');
  const descriptors = Object.getOwnPropertyDescriptors(obj);
  if (
    Reflect.ownKeys(obj).some(
      (key) =>
        typeof key !== 'string' ||
        !Object.hasOwn(descriptors, key) ||
        !Object.hasOwn(descriptors[key]!, 'value'),
    ) ||
    Object.keys(obj).some((key) => !required.includes(key) && !optional.includes(key)) ||
    required.some((key) => !Object.hasOwn(obj, key))
  )
    fail('invalid fields');
  return obj;
}

function utc(value: unknown): string {
  if (typeof value !== 'string' || !TIME_PATTERN.test(value)) fail('invalid timestamp');
  const date = new Date(value);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value.slice(0, 10)) {
    fail('invalid timestamp');
  }
  return date.toISOString();
}

function ref(input: unknown): { sourceId: string; jobId: string } {
  const value = ownKeys(input, ['sourceId', 'jobId']);
  if (
    typeof value.sourceId !== 'string' ||
    !ID_PATTERN.test(value.sourceId) ||
    typeof value.jobId !== 'string' ||
    !value.jobId ||
    value.jobId.length > 256 ||
    value.jobId.trim() !== value.jobId
  )
    fail('invalid source-scoped job ID');
  return { sourceId: value.sourceId, jobId: value.jobId };
}

function searchId(input: unknown): string {
  if (typeof input !== 'string' || !SEARCH_ID_PATTERN.test(input)) fail('invalid saved-search ID');
  return input;
}

function jobKey(sourceId: string, jobId: string): string {
  return JSON.stringify([sourceId, jobId]);
}

function canonicalSearch(input: unknown): JobSearchQuery {
  return createJobSearchQuery(
    ownKeys(input, ['keywords'], ['location', 'workplace', 'employmentType', 'postedSince', 'limit', 'sort']),
  );
}

function keyForSearch(query: JobSearchQuery): string {
  // Query fields are emitted in a fixed order by the strict core normalizer.
  return `search-${createHash('sha256').update(JSON.stringify(query)).digest('hex')}`;
}

function validateJob(input: unknown): Readonly<NormalizedJob> {
  const value = ownKeys(
    input,
    ['id', 'title', 'companyName', 'source', 'postingDate'],
    ['description', 'location', 'workplace', 'employmentType', 'canonicalUrl', 'salary', 'confidence'],
  );
  const source = ownKeys(value.source, ['provider', 'id', 'name', 'retrievedAt'], ['evidenceUrl']);
  const posting = ownKeys(
    value.postingDate,
    ['state'],
    ['postedAt', 'sourceClaim', 'checkedAt', 'verifiedBy', 'method', 'evidenceUrl'],
  );
  let postedAt: unknown;
  if (posting.state === 'reported') {
    ownKeys(value.postingDate, ['state', 'postedAt', 'sourceClaim']);
    if (posting.sourceClaim !== 'provider_reported') fail('invalid reported posting-date evidence');
    postedAt = posting.postedAt;
  } else if (posting.state === 'verified') {
    // No host-owned verifier continuity is available for locally supplied snapshots.
    // A caller must never be able to mint independently verified posting evidence.
    fail('untrusted verified posting-date attestation');
  } else if (posting.state !== 'unknown') {
    fail('invalid posting-date evidence');
  } else {
    ownKeys(value.postingDate, ['state']);
  }
  if (value.salary !== undefined) ownKeys(value.salary, ['min', 'max', 'currency', 'period']);
  if (typeof source.id !== 'string' || !ID_PATTERN.test(source.id)) fail('invalid source ID');
  if (typeof value.id !== 'string' || !value.id || value.id.trim() !== value.id) fail('invalid job ID');
  const context: TrustedJobContext = {
    providerId: source.id,
    providerType: source.provider as TrustedJobContext['providerType'],
    name: source.name as string,
    retrievedAt: source.retrievedAt as string,
    ...(source.evidenceUrl === undefined ? {} : { evidenceUrl: source.evidenceUrl as string }),
    ...(value.confidence === undefined ? {} : { confidence: value.confidence as number }),
  };
  const normalized = normalizeDiscoveredJob(
    {
      id: value.id,
      title: value.title,
      companyName: value.companyName,
      ...(postedAt === undefined ? {} : { postedAt }),
      ...Object.fromEntries(
        ['description', 'location', 'workplace', 'employmentType', 'canonicalUrl', 'salary']
          .filter((key) => Object.hasOwn(value, key))
          .map((key) => [key, value[key]]),
      ),
    },
    context,
  );
  // Save exact normalized evidence, without accepting extra fields or deriving missing facts.
  return normalized;
}

function stateFromBytes(raw: string): StoreState {
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return fail('corrupt JSON');
  }
  const state = ownKeys(input, ['version', 'jobs', 'searches']);
  if (
    state.version !== 1 ||
    !Array.isArray(state.jobs) ||
    !Array.isArray(state.searches) ||
    state.jobs.length > MAX_JOBS ||
    state.searches.length > MAX_SEARCHES
  )
    fail('corrupt schema or capacity');
  const jobs: SavedJob[] = [];
  const searches: SavedSearch[] = [];
  const seenJobs = new Set<string>();
  const seenSearches = new Set<string>();
  for (const item of state.jobs) {
    const entry = ownKeys(item, ['key', 'job', 'savedAt']);
    const job = validateJob(entry.job);
    const key = jobKey(job.source.id, job.id);
    if (entry.key !== key || seenJobs.has(key)) fail('corrupt job key');
    seenJobs.add(key);
    jobs.push({ key, job, savedAt: utc(entry.savedAt) });
  }
  for (const item of state.searches) {
    const entry = ownKeys(item, ['id', 'query', 'savedAt']);
    const query = canonicalSearch(entry.query);
    const id = keyForSearch(query);
    if (entry.id !== id || seenSearches.has(id)) fail('corrupt saved-search key');
    seenSearches.add(id);
    searches.push({ id, query, savedAt: utc(entry.savedAt) });
  }
  return { version: 1, jobs, searches };
}

function emptyState(): StoreState {
  return { version: 1, jobs: [], searches: [] };
}

function checkStat(
  stat: {
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
    mode: number;
    uid: number;
    nlink: number;
  },
  type: 'file' | 'directory',
  strict: boolean,
): void {
  if (stat.isSymbolicLink() || (type === 'file' ? !stat.isFile() || stat.nlink !== 1 : !stat.isDirectory())) {
    fail('symlink, hardlink, or unsafe file type');
  }
  const uid = process.getuid?.();
  if (uid === undefined || (strict ? stat.uid !== uid : stat.uid !== uid && stat.uid !== 0)) {
    fail('unsafe owner');
  }
  const permissions = stat.mode & 0o7777;
  if (strict && permissions !== (type === 'file' ? 0o600 : 0o700)) fail('unsafe permissions');
  if (!strict && (permissions & 0o022) !== 0 && !(stat.uid === 0 && (permissions & 0o1000) !== 0)) {
    fail('unsafe ancestor permissions');
  }
}

interface PrivateDirectoryPin {
  path: string;
  ino: number;
  dev: number;
  strict: boolean;
}

async function ensurePrivateParent(path: string): Promise<PrivateDirectoryPin[]> {
  const parent = dirname(path);
  const parts: string[] = [];
  const pinned: PrivateDirectoryPin[] = [];
  let at = parent;
  while (at !== parse(at).root) {
    parts.unshift(at);
    at = dirname(at);
  }
  parts.unshift(at);
  for (const part of parts) {
    let stat;
    try {
      stat = await lstat(part);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await mkdir(part, { mode: 0o700 });
      stat = await lstat(part);
    }
    const strict = part === parent;
    checkStat(stat, 'directory', strict);
    pinned.push({ path: part, dev: stat.dev, ino: stat.ino, strict });
  }
  return pinned;
}

async function assertPinnedDirectories(pinned: readonly PrivateDirectoryPin[]): Promise<void> {
  for (const directory of pinned) {
    let stat;
    try {
      stat = await lstat(directory.path);
    } catch {
      fail('unsafe parent directory changed');
    }
    checkStat(stat, 'directory', directory.strict);
    if (stat.dev !== directory.dev || stat.ino !== directory.ino) {
      fail('unsafe parent directory identity changed');
    }
  }
}

async function readState(path: string): Promise<StoreState> {
  const parent = dirname(path);
  const tempPrefix = `.${basename(path)}.`;
  const children = await readdir(parent);
  if (children.some((name) => name.startsWith(tempPrefix) && name.endsWith('.tmp'))) {
    fail('interrupted write requires manual recovery');
  }
  let before;
  try {
    before = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyState();
    throw error;
  }
  checkStat(before, 'file', true);
  if (before.size > MAX_BYTES) fail('capacity exceeded');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    checkStat(stat, 'file', true);
    if (stat.ino !== before.ino || stat.dev !== before.dev || stat.size > MAX_BYTES)
      fail('unsafe file replacement');
    const data = await handle.readFile();
    if (data.length > MAX_BYTES) fail('capacity exceeded');
    return stateFromBytes(data.toString('utf8'));
  } finally {
    await handle.close();
  }
}

async function commitState(
  path: string,
  state: StoreState,
  assertParent: () => Promise<void>,
): Promise<void> {
  if (state.jobs.length > MAX_JOBS || state.searches.length > MAX_SEARCHES)
    fail('maximum saved-job capacity exceeded');
  const bytes = Buffer.from(JSON.stringify(state), 'utf8');
  if (bytes.length > MAX_BYTES) fail('maximum saved-store capacity exceeded');
  await assertParent();
  const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  const handle = await open(
    temp,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await assertParent();
  // Never discard an interrupted temp: the next read must require explicit recovery.
  // Any existing target must remain private, singly linked, and owned by this process.
  try {
    checkStat(await lstat(path), 'file', true);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await assertParent();
  await rename(temp, path);
  await assertParent();
  const parent = await open(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const stat = await parent.stat();
    const end = await lstat(dirname(path));
    if (stat.dev !== end.dev || stat.ino !== end.ino) fail('unsafe parent directory changed');
    await parent.sync();
  } finally {
    await parent.close();
  }
  await assertParent();
  const persisted = await readState(path);
  await assertParent();
  if (JSON.stringify(persisted) !== bytes.toString('utf8')) fail('uncertain persisted readback');
}

export function createLocalJobSaveStore(options: {
  transport: 'stdio' | 'http';
  filePath?: string;
  lockTimeoutMs?: number;
}): LocalJobSaveStore | null {
  // The HTTP runtime has no per-client authenticated workspace identity.
  if (options.transport === 'http' || (options.transport === 'stdio' && options.filePath === undefined))
    return null;
  if (
    options.transport !== 'stdio' ||
    typeof options.filePath !== 'string' ||
    !isAbsolute(options.filePath) ||
    normalize(options.filePath) !== options.filePath ||
    options.filePath === parse(options.filePath).root ||
    options.filePath.includes('\0')
  ) {
    fail('invalid absolute host path');
  }
  const path = options.filePath;
  const timeout = options.lockTimeoutMs ?? 5_000;
  if (!Number.isSafeInteger(timeout) || timeout < 10 || timeout > 30_000) fail('invalid lock timeout');
  const lockPath = `${path}.lock`;

  async function withLock<T>(
    operate: (current: StoreState, assertParent: () => Promise<void>) => Promise<T> | T,
  ): Promise<T> {
    const pinned = await ensurePrivateParent(path);
    const assertParent = () => assertPinnedDirectories(pinned);
    await assertParent();
    const deadline = Date.now() + timeout;
    let lock;
    for (;;) {
      try {
        lock = await open(
          lockPath,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
          0o600,
        );
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (Date.now() >= deadline) fail('concurrent writer lock unresolved');
        await delay(Math.min(10, Math.max(1, deadline - Date.now())));
      }
    }
    const lockIdentity = await lock.stat();
    try {
      await assertParent();
      const current = await readState(path);
      await assertParent();
      const result = await operate(current, assertParent);
      await assertParent();
      return result;
    } finally {
      await lock.close();
      await assertParent();
      const liveLock = await lstat(lockPath);
      if (liveLock.ino !== lockIdentity.ino || liveLock.dev !== lockIdentity.dev) {
        fail('unsafe lock identity changed');
      }
      await unlink(lockPath);
    }
  }

  return {
    async saveJob(input) {
      const job = validateJob(input);
      const key = jobKey(job.source.id, job.id);
      return withLock(async (state, assertParent) => {
        const existing = state.jobs.findIndex((entry) => entry.key === key);
        const entry = {
          key,
          job,
          savedAt: existing < 0 ? new Date().toISOString() : state.jobs[existing]!.savedAt,
        };
        if (existing < 0) state.jobs.push(entry);
        else state.jobs[existing] = entry;
        await commitState(path, state, assertParent);
        return entry;
      });
    },
    async saveSearch(input) {
      const query = canonicalSearch(input);
      const id = keyForSearch(query);
      return withLock(async (state, assertParent) => {
        const existing = state.searches.find((entry) => entry.id === id);
        if (existing !== undefined) return existing;
        const entry = { id, query, savedAt: new Date().toISOString() };
        state.searches.push(entry);
        await commitState(path, state, assertParent);
        return entry;
      });
    },
    listJobs: () => withLock((state) => state.jobs),
    listSearches: () => withLock((state) => state.searches),
    async getJob(input) {
      const { sourceId, jobId } = ref(input);
      return withLock((state) => state.jobs.find((entry) => entry.key === jobKey(sourceId, jobId)) ?? null);
    },
    async getSearch(input) {
      const id = searchId(input);
      return withLock((state) => state.searches.find((entry) => entry.id === id) ?? null);
    },
    async removeJob(input) {
      const { sourceId, jobId } = ref(input);
      const key = jobKey(sourceId, jobId);
      return withLock(async (state, assertParent) => {
        const index = state.jobs.findIndex((entry) => entry.key === key);
        if (index < 0) return false;
        state.jobs.splice(index, 1);
        await commitState(path, state, assertParent);
        return true;
      });
    },
    async removeSearch(input) {
      const id = searchId(input);
      return withLock(async (state, assertParent) => {
        const index = state.searches.findIndex((entry) => entry.id === id);
        if (index < 0) return false;
        state.searches.splice(index, 1);
        await commitState(path, state, assertParent);
        return true;
      });
    },
  };
}
