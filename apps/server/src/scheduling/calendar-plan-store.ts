import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, rename, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, normalize, parse } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { types as utilTypes } from 'node:util';

import { previewLocalContentCalendar, type LocalCalendarItemKind } from './calendar-preview.js';

const MAX_PLANS = 20;
const MAX_HISTORY = 2_048;
const MAX_BYTES = 2 * 1_048_576;
const INITIALIZED = 'linkedin-mcp.calendar-plan-store.initialized.v1\n';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{3,127}$/u;
const HASH = /^[0-9a-f]{64}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export type CalendarPlanStoreErrorKind =
  | 'invalid_input'
  | 'not_found'
  | 'revision_conflict'
  | 'idempotency_conflict'
  | 'capacity'
  | 'unsafe_store'
  | 'outcome_unknown';

/** Error messages are fixed: caller labels, fields, paths and OS errors never escape. */
export class CalendarPlanStoreError extends Error {
  constructor(readonly kind: CalendarPlanStoreErrorKind) {
    super(
      (
        {
          invalid_input: 'Invalid local calendar plan input.',
          not_found: 'Local calendar plan does not exist.',
          revision_conflict: 'Local calendar plan revision is stale.',
          idempotency_conflict: 'Calendar plan creation key conflicts with an earlier request.',
          capacity: 'Private calendar plan store capacity exceeded.',
          unsafe_store: 'Private calendar plan store is unsafe or unavailable.',
          outcome_unknown: 'Calendar plan commit outcome is uncertain; inspect or retry the same key.',
        } as const
      )[kind],
    );
    this.name = 'CalendarPlanStoreError';
  }
}

function fail(kind: CalendarPlanStoreErrorKind): never {
  throw new CalendarPlanStoreError(kind);
}

export interface LocalCalendarPlanDefinition {
  readonly referenceUtc: string;
  readonly items: readonly Readonly<{
    id: string;
    label: string;
    kind: LocalCalendarItemKind;
    plannedAtUtc: string;
  }>[];
}

export interface LocalCalendarPlan {
  readonly id: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly calendar: LocalCalendarPlanDefinition;
}

export interface LocalCalendarPlanSummary {
  readonly id: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly referenceUtc: string;
  readonly itemCount: number;
}

export interface LocalCalendarPlanStore {
  create(input: { idempotencyKey: string; calendar: unknown }): Promise<LocalCalendarPlan>;
  update(input: { id: string; expectedRevision: number; calendar: unknown }): Promise<LocalCalendarPlan>;
  get(input: { id: string }): Promise<LocalCalendarPlan | null>;
  list(): Promise<readonly LocalCalendarPlanSummary[]>;
  remove(input: { id: string; expectedRevision: number }): Promise<boolean>;
}

interface CreateHistory {
  key: string;
  payloadHash: string;
  planId: string;
}

interface StoreState {
  version: 1;
  plans: LocalCalendarPlan[];
  idempotency: CreateHistory[];
}

function record(value: unknown, expectedKeys: readonly string[]): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    utilTypes.isProxy(value) ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail('invalid_input');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expectedKeys.length) fail('invalid_input');
  const result: Record<string, unknown> = {};
  for (const property of keys) {
    if (typeof property !== 'string' || !expectedKeys.includes(property)) fail('invalid_input');
    const descriptor = descriptors[property];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail('invalid_input');
    result[property] = descriptor.value;
  }
  if (expectedKeys.some((property) => !Object.hasOwn(descriptors, property))) fail('invalid_input');
  return result;
}

function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) fail('invalid_input');
  return value;
}

function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail('invalid_input');
  return value as number;
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !DATE.test(value)) fail('invalid_input');
  const instant = Date.parse(value);
  if (!Number.isFinite(instant) || new Date(instant).toISOString() !== value) fail('invalid_input');
  return value;
}

function key(value: unknown): string {
  if (typeof value !== 'string' || !KEY.test(value)) fail('invalid_input');
  return value;
}

/** All hostile input is rejected by the existing preview parser before own-data copying. */
function cleanCalendar(value: unknown): LocalCalendarPlanDefinition {
  try {
    previewLocalContentCalendar(value);
    const root = record(value, ['referenceUtc', 'items']);
    const items = root.items as readonly unknown[];
    const copied = items.map((item) => {
      const entry = record(item, ['id', 'label', 'kind', 'plannedAtUtc']);
      return Object.freeze({
        id: entry.id as string,
        label: entry.label as string,
        kind: entry.kind as LocalCalendarItemKind,
        plannedAtUtc: entry.plannedAtUtc as string,
      });
    });
    return Object.freeze({
      referenceUtc: root.referenceUtc as string,
      items: Object.freeze(copied),
    });
  } catch {
    fail('invalid_input');
  }
}

function hash(calendar: LocalCalendarPlanDefinition): string {
  return createHash('sha256').update(JSON.stringify(calendar)).digest('hex');
}

function parseState(bytes: string): StoreState {
  let raw: unknown;
  try {
    raw = JSON.parse(bytes);
  } catch {
    fail('unsafe_store');
  }
  try {
    const root = record(raw, ['version', 'plans', 'idempotency']);
    if (root.version !== 1 || !Array.isArray(root.plans) || !Array.isArray(root.idempotency))
      fail('invalid_input');
    if (root.plans.length > MAX_PLANS || root.idempotency.length > MAX_HISTORY) fail('invalid_input');
    const ids = new Set<string>();
    const plans: LocalCalendarPlan[] = [];
    for (const rawPlan of root.plans) {
      const entry = record(rawPlan, ['id', 'revision', 'createdAt', 'updatedAt', 'calendar']);
      const id = uuid(entry.id);
      if (ids.has(id)) fail('invalid_input');
      ids.add(id);
      const createdAt = timestamp(entry.createdAt);
      const updatedAt = timestamp(entry.updatedAt);
      if (updatedAt < createdAt) fail('invalid_input');
      const plan: LocalCalendarPlan = {
        id,
        revision: revision(entry.revision),
        createdAt,
        updatedAt,
        calendar: cleanCalendar(entry.calendar),
      };
      if (JSON.stringify(plan.calendar) !== JSON.stringify(entry.calendar)) fail('invalid_input');
      plans.push(plan);
    }
    const usedKeys = new Set<string>();
    const historicalIds = new Set<string>();
    const idempotency: CreateHistory[] = [];
    for (const value of root.idempotency) {
      const history = record(value, ['key', 'payloadHash', 'planId']);
      const oldKey = key(history.key);
      const planId = uuid(history.planId);
      if (
        typeof history.payloadHash !== 'string' ||
        !HASH.test(history.payloadHash) ||
        usedKeys.has(oldKey) ||
        historicalIds.has(planId)
      ) {
        fail('invalid_input');
      }
      usedKeys.add(oldKey);
      historicalIds.add(planId);
      idempotency.push({ key: oldKey, payloadHash: history.payloadHash, planId });
    }
    for (const plan of plans) {
      const original = idempotency.find((history) => history.planId === plan.id);
      if (!original || (plan.revision === 1 && original.payloadHash !== hash(plan.calendar))) {
        fail('invalid_input');
      }
    }
    const validated: StoreState = { version: 1, plans, idempotency };
    if (JSON.stringify(validated) !== bytes) fail('invalid_input');
    return validated;
  } catch {
    fail('unsafe_store');
  }
}

interface StatShape {
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
  mode: number;
  uid: number;
  nlink: number;
}

function checkStat(stat: StatShape, type: 'file' | 'directory', strict: boolean): void {
  if (stat.isSymbolicLink() || (type === 'file' ? !stat.isFile() || stat.nlink !== 1 : !stat.isDirectory())) {
    fail('unsafe_store');
  }
  const owner = process.getuid?.();
  if (owner === undefined || (strict ? stat.uid !== owner : stat.uid !== owner && stat.uid !== 0)) {
    fail('unsafe_store');
  }
  const permissions = stat.mode & 0o7777;
  if (strict && permissions !== (type === 'file' ? 0o600 : 0o700)) fail('unsafe_store');
  if (!strict && (permissions & 0o022) !== 0 && !(stat.uid === 0 && (permissions & 0o1000) !== 0)) {
    fail('unsafe_store');
  }
}

interface DirectoryPin {
  path: string;
  dev: number;
  ino: number;
  strict: boolean;
}

/** Pin the full physical hierarchy; reads never create missing directories. */
async function pinParent(path: string, create: boolean): Promise<readonly DirectoryPin[] | null> {
  const parent = dirname(path);
  const parts: string[] = [];
  let current = parent;
  while (current !== parse(current).root) {
    parts.unshift(current);
    current = dirname(current);
  }
  parts.unshift(current);
  const pins: DirectoryPin[] = [];
  for (const part of parts) {
    let stat;
    try {
      stat = await lstat(part);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (!create) return null;
      try {
        await mkdir(part, { mode: 0o700 });
      } catch (created) {
        if ((created as NodeJS.ErrnoException).code !== 'EEXIST') throw created;
      }
      stat = await lstat(part);
    }
    checkStat(stat, 'directory', part === parent);
    pins.push({ path: part, dev: stat.dev, ino: stat.ino, strict: part === parent });
  }
  return pins;
}

async function assertPinned(pins: readonly DirectoryPin[]): Promise<void> {
  for (const pin of pins) {
    const stat = await lstat(pin.path);
    checkStat(stat, 'directory', pin.strict);
    if (stat.dev !== pin.dev || stat.ino !== pin.ino) fail('unsafe_store');
  }
}

async function syncParent(path: string, check: () => Promise<void>): Promise<void> {
  await check();
  const parent = await open(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const pinned = await parent.stat();
    const actual = await lstat(dirname(path));
    if (pinned.dev !== actual.dev || pinned.ino !== actual.ino) fail('unsafe_store');
    await parent.sync();
  } finally {
    await parent.close();
  }
  await check();
}

async function statFile(path: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    const stat = await lstat(path);
    checkStat(stat, 'file', true);
    return stat;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function secureRead(path: string, limit: number): Promise<string | null> {
  const before = await statFile(path);
  if (before === null) return null;
  if (before.size > limit) fail('unsafe_store');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const after = await handle.stat();
    checkStat(after, 'file', true);
    if (before.dev !== after.dev || before.ino !== after.ino || after.size > limit) fail('unsafe_store');
    const bytes = await handle.readFile();
    if (bytes.length > limit || (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) {
      fail('unsafe_store');
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      fail('unsafe_store');
    }
  } finally {
    await handle.close();
  }
}

async function readState(path: string): Promise<StoreState | null> {
  const prefix = `.${basename(path)}.`;
  if ((await readdir(dirname(path))).some((item) => item.startsWith(prefix) && item.endsWith('.tmp'))) {
    fail('unsafe_store');
  }
  const sentinel = await secureRead(path + '.initialized', 256);
  const bytes = await secureRead(path, MAX_BYTES);
  if (sentinel === null && bytes === null) return null;
  if (sentinel !== INITIALIZED || bytes === null) fail('unsafe_store');
  return parseState(bytes);
}

/** No temp is deleted on a pre-rename failure; it blocks future operations until inspected. */
async function commitState(path: string, state: StoreState, check: () => Promise<void>): Promise<void> {
  if (state.plans.length > MAX_PLANS || state.idempotency.length > MAX_HISTORY) fail('capacity');
  const serialized = JSON.stringify(state);
  const bytes = Buffer.from(serialized, 'utf8');
  if (bytes.length > MAX_BYTES) fail('capacity');
  await check();
  const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  const handle = await open(
    temp,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  let renamed = false;
  try {
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await check();
    await statFile(path);
    await check();
    await rename(temp, path);
    renamed = true;
    await syncParent(path, check);
    if ((await secureRead(path, MAX_BYTES)) !== serialized) fail('outcome_unknown');
    await check();
  } catch {
    fail(renamed ? 'outcome_unknown' : 'unsafe_store');
  }
}

async function initializeSentinel(path: string, check: () => Promise<void>): Promise<void> {
  await check();
  if ((await statFile(path + '.initialized')) !== null || (await statFile(path)) !== null) {
    fail('unsafe_store');
  }
  const handle = await open(
    path + '.initialized',
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(INITIALIZED);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncParent(path, check);
}

function summary(plan: LocalCalendarPlan): LocalCalendarPlanSummary {
  return {
    id: plan.id,
    revision: plan.revision,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    referenceUtc: plan.calendar.referenceUtc,
    itemCount: plan.calendar.items.length,
  };
}

/** Host-constructed STDIO private storage. Node pathname APIs do not claim atomic openat semantics. */
export function createLocalCalendarPlanStore(options: {
  transport: 'stdio' | 'http';
  filePath?: string;
  lockTimeoutMs?: number;
}): LocalCalendarPlanStore | null {
  if (options.transport === 'http' || (options.transport === 'stdio' && options.filePath === undefined)) {
    return null;
  }
  const filePath = options.filePath;
  if (
    options.transport !== 'stdio' ||
    typeof filePath !== 'string' ||
    !isAbsolute(filePath) ||
    normalize(filePath) !== filePath ||
    filePath === parse(filePath).root ||
    filePath.endsWith('/') ||
    filePath.length > 2_048 ||
    filePath.includes('\0') ||
    filePath.split(/[\\/]/u).some((part) => part === '.' || part === '..') ||
    basename(filePath).endsWith('.lock') ||
    basename(filePath).endsWith('.initialized')
  ) {
    fail('invalid_input');
  }
  const path = filePath;
  const timeout = options.lockTimeoutMs ?? 5_000;
  if (!Number.isSafeInteger(timeout) || timeout < 10 || timeout > 30_000) fail('invalid_input');
  const lockPath = path + '.lock';

  async function withLock<T>(
    fn: (state: StoreState | null, check: () => Promise<void>, markWrite: () => void) => T | Promise<T>,
    missingParent?: () => T,
  ): Promise<T> {
    try {
      const pins = await pinParent(path, missingParent === undefined);
      if (pins === null) {
        if (!missingParent) fail('unsafe_store');
        return missingParent();
      }
      const check = () => assertPinned(pins);
      await check();
      const deadline = Date.now() + timeout;
      let lock: Awaited<ReturnType<typeof open>>;
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
          if (Date.now() >= deadline) fail('unsafe_store');
          await delay(Math.min(10, Math.max(1, deadline - Date.now())));
        }
      }
      const identity = await lock.stat();
      let writeStarted = false;
      try {
        await check();
        const state = await readState(path);
        await check();
        const result = await fn(state, check, () => {
          writeStarted = true;
        });
        await check();
        return result;
      } finally {
        try {
          await lock.close();
          await check();
          const liveLock = await lstat(lockPath);
          checkStat(liveLock, 'file', true);
          if (liveLock.dev !== identity.dev || liveLock.ino !== identity.ino) fail('unsafe_store');
          await unlink(lockPath);
        } catch {
          fail(writeStarted ? 'outcome_unknown' : 'unsafe_store');
        }
      }
    } catch (error) {
      if (error instanceof CalendarPlanStoreError) throw error;
      fail('unsafe_store');
    }
  }

  return {
    async create(input) {
      const args = record(input, ['idempotencyKey', 'calendar']);
      const idempotencyKey = key(args.idempotencyKey);
      const calendar = cleanCalendar(args.calendar);
      const payloadHash = hash(calendar);
      return withLock(async (current, check, markWrite) => {
        let state = current;
        if (state === null) {
          markWrite();
          await initializeSentinel(path, check);
          state = { version: 1, plans: [], idempotency: [] };
        }
        const used = state.idempotency.find((history) => history.key === idempotencyKey);
        if (used) {
          if (used.payloadHash !== payloadHash) fail('idempotency_conflict');
          const existing = state.plans.find((plan) => plan.id === used.planId);
          if (!existing) fail('idempotency_conflict');
          return existing;
        }
        if (state.plans.length >= MAX_PLANS || state.idempotency.length >= MAX_HISTORY) {
          fail('capacity');
        }
        const now = new Date().toISOString();
        const plan: LocalCalendarPlan = {
          id: randomUUID(),
          revision: 1,
          createdAt: now,
          updatedAt: now,
          calendar,
        };
        state.plans.push(plan);
        state.idempotency.push({ key: idempotencyKey, payloadHash, planId: plan.id });
        markWrite();
        await commitState(path, state, check);
        return plan;
      });
    },
    async update(input) {
      const args = record(input, ['id', 'expectedRevision', 'calendar']);
      const id = uuid(args.id);
      const expectedRevision = revision(args.expectedRevision);
      const calendar = cleanCalendar(args.calendar);
      return withLock(async (raw, check, markWrite) => {
        if (!raw) fail('not_found');
        const index = raw.plans.findIndex((plan) => plan.id === id);
        if (index < 0) fail('not_found');
        const previous = raw.plans[index]!;
        if (previous.revision !== expectedRevision) fail('revision_conflict');
        if (previous.revision >= Number.MAX_SAFE_INTEGER) fail('capacity');
        const plan: LocalCalendarPlan = {
          ...previous,
          revision: previous.revision + 1,
          updatedAt: new Date(Math.max(Date.now(), Date.parse(previous.updatedAt))).toISOString(),
          calendar,
        };
        raw.plans[index] = plan;
        markWrite();
        await commitState(path, raw, check);
        return plan;
      });
    },
    async get(input) {
      const args = record(input, ['id']);
      const id = uuid(args.id);
      return withLock(
        (state) => state?.plans.find((plan) => plan.id === id) ?? null,
        () => null,
      );
    },
    async list() {
      return withLock(
        (state) => (state?.plans ?? []).map(summary),
        () => [],
      );
    },
    async remove(input) {
      const args = record(input, ['id', 'expectedRevision']);
      const id = uuid(args.id);
      const expectedRevision = revision(args.expectedRevision);
      return withLock(async (state, check, markWrite) => {
        if (!state) return false;
        const index = state.plans.findIndex((plan) => plan.id === id);
        if (index < 0) return false;
        if (state.plans[index]!.revision !== expectedRevision) fail('revision_conflict');
        state.plans.splice(index, 1);
        markWrite();
        await commitState(path, state, check);
        return true;
      });
    },
  };
}
