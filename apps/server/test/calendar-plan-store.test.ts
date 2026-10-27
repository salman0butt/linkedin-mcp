import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  chmod,
  link,
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import {
  CalendarPlanStoreError,
  createLocalCalendarPlanStore,
  type LocalCalendarPlanStore,
} from '../src/scheduling/calendar-plan-store.js';

const roots: string[] = [];
const runChild = promisify(execFile);
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function location() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'm11-calendar-store-')));
  roots.push(root);
  return { root, path: join(root, 'private', 'calendar.json') };
}

function calendar(label = '🤖 Engineering  notes') {
  return {
    referenceUtc: '2026-10-27T10:00:00.000Z',
    items: [
      { id: 'last', label, kind: 'image_post', plannedAtUtc: '2026-10-29T10:01:00.000Z' },
      {
        id: 'first',
        label: 'Article handoff',
        kind: 'manual_article_handoff',
        plannedAtUtc: '2026-10-28T10:01:00.000Z',
      },
    ],
  };
}

function store(path: string, lockTimeoutMs = 120): LocalCalendarPlanStore {
  const result = createLocalCalendarPlanStore({ transport: 'stdio', filePath: path, lockTimeoutMs });
  if (!result) throw new Error('Missing STDIO calendar store');
  return result;
}

async function rejectKind(value: Promise<unknown> | (() => unknown), kind: CalendarPlanStoreError['kind']) {
  try {
    await (typeof value === 'function' ? value() : value);
    throw new Error('Expected an error');
  } catch (error) {
    expect(error).toBeInstanceOf(CalendarPlanStoreError);
    expect((error as CalendarPlanStoreError).kind).toBe(kind);
    for (const secret of [
      'SECRET_FIELD_NAME',
      'SECRET_FIELD_VALUE',
      'Engineering  notes',
      'private/calendar',
    ]) {
      expect(String(error)).not.toContain(secret);
    }
  }
}

describe('M11.1 opt-in private local calendar plan store', () => {
  it('does not construct an HTTP store or unconfigured STDIO store and rejects unsafe paths', async () => {
    const { path } = await location();
    expect(createLocalCalendarPlanStore({ transport: 'http', filePath: path })).toBeNull();
    expect(createLocalCalendarPlanStore({ transport: 'http', filePath: '/tmp/../secret' })).toBeNull();
    expect(createLocalCalendarPlanStore({ transport: 'stdio' })).toBeNull();
    for (const filePath of [
      'relative/path',
      '/tmp/../secret',
      '/',
      '/tmp/ending/',
      '/tmp/a\0b',
      path + '.lock',
      path + '.initialized',
    ]) {
      await rejectKind(() => createLocalCalendarPlanStore({ transport: 'stdio', filePath }), 'invalid_input');
    }
  });

  it('persists exact caller Unicode and item order across restart with private file and sentinel', async () => {
    const { path } = await location();
    const input = calendar();
    const first = await store(path).create({ idempotencyKey: 'calendar-creation', calendar: input });
    expect(first).toEqual({
      id: first.id,
      revision: 1,
      createdAt: first.createdAt,
      updatedAt: first.createdAt,
      calendar: input,
    });
    expect(first.id).toMatch(/^[0-9a-f-]{36}$/u);
    expect(Number.isNaN(Date.parse(first.createdAt))).toBe(false);
    expect((await lstat(dirname(path))).mode & 0o777).toBe(0o700);
    expect((await lstat(path)).mode & 0o777).toBe(0o600);
    expect((await lstat(path + '.initialized')).mode & 0o777).toBe(0o600);
    expect(await store(path).get({ id: first.id })).toEqual(first);
    expect(await store(path).list()).toEqual([
      {
        id: first.id,
        revision: 1,
        createdAt: first.createdAt,
        updatedAt: first.updatedAt,
        referenceUtc: input.referenceUtc,
        itemCount: 2,
      },
    ]);
    expect(JSON.stringify(await store(path).list())).not.toContain('Engineering');
    input.items[0]!.label = 'Mutation after creation';
    expect((await store(path).get({ id: first.id }))?.calendar.items[0]?.label).toBe('🤖 Engineering  notes');
  });

  it('does not create any directory for read-only lookups before opted-in writes', async () => {
    const { path } = await location();
    expect(await store(path).get({ id: randomUUID() })).toBeNull();
    expect(await store(path).list()).toEqual([]);
    await expect(lstat(dirname(path))).rejects.toThrow();
  });

  it('replays create by key, rejects conflicts and preserves tombstones after remove', async () => {
    const { path } = await location();
    const s = store(path);
    const created = await s.create({ idempotencyKey: 'same-key', calendar: calendar() });
    expect(await s.create({ idempotencyKey: 'same-key', calendar: calendar() })).toEqual(created);
    await rejectKind(
      s.create({ idempotencyKey: 'same-key', calendar: calendar('Changed') }),
      'idempotency_conflict',
    );
    expect(await s.remove({ id: created.id, expectedRevision: 1 })).toBe(true);
    expect(await s.get({ id: created.id })).toBeNull();
    expect(await s.remove({ id: created.id, expectedRevision: 1 })).toBe(false);
    await rejectKind(
      store(path).create({ idempotencyKey: 'same-key', calendar: calendar() }),
      'idempotency_conflict',
    );
    await rejectKind(
      store(path).create({ idempotencyKey: 'same-key', calendar: calendar('Changed') }),
      'idempotency_conflict',
    );
    expect(await s.list()).toEqual([]);
  });

  it('compare-and-swaps updates and removals under concurrent independent store instances', async () => {
    const { path } = await location();
    const a = store(path);
    const b = store(path);
    const created = await a.create({ idempotencyKey: 'initial-key', calendar: calendar() });
    const writes = await Promise.allSettled([
      a.update({ id: created.id, expectedRevision: 1, calendar: calendar('From A') }),
      b.update({ id: created.id, expectedRevision: 1, calendar: calendar('From B') }),
    ]);
    expect(writes.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    expect(writes.filter((entry) => entry.status === 'rejected')).toMatchObject([
      { status: 'rejected', reason: { kind: 'revision_conflict' } },
    ]);
    const latest = await b.get({ id: created.id });
    expect(latest?.revision).toBe(2);
    expect(['From A', 'From B']).toContain(latest?.calendar.items[0]?.label);
    await rejectKind(a.remove({ id: created.id, expectedRevision: 1 }), 'revision_conflict');
    expect(await a.remove({ id: created.id, expectedRevision: 2 })).toBe(true);
    await rejectKind(a.update({ id: created.id, expectedRevision: 2, calendar: calendar() }), 'not_found');
    expect(await a.remove({ id: randomUUID(), expectedRevision: 1 })).toBe(false);
  });

  it('serializes two independent Node processes racing to create with one key', async () => {
    const { path } = await location();
    const script = `
      import { createLocalCalendarPlanStore } from './apps/server/src/scheduling/calendar-plan-store.ts';
      const store = createLocalCalendarPlanStore({transport:'stdio',filePath:process.argv[1]});
      const result = await store.create({idempotencyKey:'same-process-key',calendar:{
        referenceUtc:'2026-10-27T10:00:00.000Z',
        items:[{id:'x',label:'Child process',kind:'text_post',plannedAtUtc:'2026-10-28T10:00:00.000Z'}]
      }});
      process.stdout.write(JSON.stringify({id:result.id,revision:result.revision}));
    `;
    const args = ['--import', 'tsx', '--input-type=module', '--eval', script, path];
    const [a, b] = await Promise.all([
      runChild(process.execPath, args, { cwd: process.cwd() }),
      runChild(process.execPath, args, { cwd: process.cwd() }),
    ]);
    expect(JSON.parse(a.stdout)).toEqual(JSON.parse(b.stdout));
    expect(await store(path).list()).toHaveLength(1);
  });

  it('rejects invalid keys, unauthorized metadata, getters, proxies, symbols and sparse arrays before filesystem writes', async () => {
    const { path } = await location();
    const s = store(path);
    const root = calendar();
    let getterCalls = 0;
    const getter = { ...root };
    Object.defineProperty(getter, 'referenceUtc', {
      enumerable: true,
      get() {
        getterCalls++;
        throw new Error('SECRET_FIELD_VALUE');
      },
    });
    const sparse = { ...root, items: [...root.items] };
    Reflect.deleteProperty(sparse.items, '0');
    const symbol = { ...root, [Symbol('secret')]: 'SECRET_FIELD_VALUE' };
    const revoked = Proxy.revocable(root, {});
    revoked.revoke();
    const values: Array<{ idempotencyKey: string; calendar: unknown }> = [
      { idempotencyKey: 'short', calendar: { ...root, SECRET_FIELD_NAME: 'SECRET_FIELD_VALUE' } },
      { idempotencyKey: 'abc', calendar: root },
      { idempotencyKey: 'key-with-space ', calendar: root },
      { idempotencyKey: 'getter-reject', calendar: getter },
      {
        idempotencyKey: 'proxy-reject',
        calendar: new Proxy(root, {
          get() {
            throw new Error('SECRET_FIELD_VALUE');
          },
        }),
      },
      { idempotencyKey: 'revoked-proxy', calendar: revoked.proxy },
      { idempotencyKey: 'symbol-reject', calendar: symbol },
      { idempotencyKey: 'sparse-reject', calendar: sparse },
      {
        idempotencyKey: 'duplicate-case',
        calendar: { ...root, items: [root.items[0], { ...root.items[0], id: 'LAST' }] },
      },
      {
        idempotencyKey: 'invalid-time',
        calendar: { ...root, items: [{ ...root.items[0], plannedAtUtc: '2027-10-29T10:01:00.000Z' }] },
      },
    ];
    for (const input of values) await rejectKind(s.create(input), 'invalid_input');
    await rejectKind(
      s.create({
        idempotencyKey: 'envelope-secret',
        calendar: root,
        SECRET_FIELD_NAME: 'SECRET_FIELD_VALUE',
      } as never),
      'invalid_input',
    );
    await rejectKind(s.update({ id: randomUUID(), expectedRevision: 1, calendar: getter }), 'invalid_input');
    expect(getterCalls).toBe(0);
    await expect(readFile(path)).rejects.toThrow();
  });

  it('rejects interrupted initialization, orphan temps, invalid UTF8 and corrupt JSON without overwriting bytes', async () => {
    const { path } = await location();
    const s = store(path);
    const first = await s.create({ idempotencyKey: 'seed-key', calendar: calendar() });
    const stored = await readFile(path);
    for (const bad of [
      '{invalid json',
      JSON.stringify({ version: 4, plans: [], idempotency: [] }),
      Buffer.from([0xff, 0xfe, 0x00]),
    ]) {
      await writeFile(path, bad);
      await rejectKind(store(path).get({ id: first.id }), 'unsafe_store');
      expect(await readFile(path)).toEqual(Buffer.from(bad));
    }
    await writeFile(path, stored);
    const orphan = join(dirname(path), `.${basename(path)}.orphan.tmp`);
    await writeFile(orphan, 'partial');
    await rejectKind(s.list(), 'unsafe_store');
    expect(await readFile(orphan, 'utf8')).toBe('partial');
    await rm(orphan);
    await rm(path);
    await rejectKind(s.create({ idempotencyKey: 'new-key', calendar: calendar() }), 'unsafe_store');
  });

  it('rejects tampered revision-one hashes, broken sentinels and excess serialized state', async () => {
    const { path } = await location();
    const s = store(path);
    await s.create({ idempotencyKey: 'seed-key', calendar: calendar() });
    const original = await readFile(path);
    const tampered = JSON.parse(original.toString('utf8')) as {
      plans: Array<{ calendar: { items: Array<{ label: string }> } }>;
    };
    tampered.plans[0]!.calendar.items[0]!.label = 'Tampered';
    await writeFile(path, JSON.stringify(tampered));
    await rejectKind(s.list(), 'unsafe_store');
    await writeFile(path, Buffer.alloc(2 * 1_048_576 + 1, 'x'));
    await rejectKind(s.list(), 'unsafe_store');
    await writeFile(path, original);
    await rm(path + '.initialized');
    await rejectKind(s.list(), 'unsafe_store');
    await symlink(path, path + '.initialized');
    await rejectKind(s.list(), 'unsafe_store');
  });

  it('rejects unsafe permissions, symlinks, hardlinks and stale locks', async () => {
    const { root, path } = await location();
    const s = store(path);
    await s.create({ idempotencyKey: 'seed-key', calendar: calendar() });
    await chmod(path, 0o644);
    await rejectKind(s.list(), 'unsafe_store');
    await chmod(path, 0o600);
    const hard = join(root, 'hard-link');
    await link(path, hard);
    await rejectKind(s.list(), 'unsafe_store');
    await rm(hard);
    const elsewhere = join(root, 'elsewhere');
    await rename(path, elsewhere);
    await symlink(elsewhere, path);
    await rejectKind(s.list(), 'unsafe_store');
    await rm(path);
    await rename(elsewhere, path);
    await chmod(dirname(path), 0o755);
    await rejectKind(s.list(), 'unsafe_store');
    await chmod(dirname(path), 0o700);
    await writeFile(path + '.lock', 'stale');
    await rejectKind(s.list(), 'unsafe_store');
    expect((await lstat(path + '.lock')).isFile()).toBe(true);
  });

  it('refuses a symlinked private parent even when the target contains valid private state', async () => {
    const { path, root } = await location();
    const s = store(path);
    await s.create({ idempotencyKey: 'first-key', calendar: calendar() });
    const otherParent = join(root, 'original-private');
    await rename(dirname(path), otherParent);
    await symlink(otherParent, dirname(path));
    await rejectKind(s.list(), 'unsafe_store');
    await rejectKind(s.create({ idempotencyKey: 'other-key', calendar: calendar() }), 'unsafe_store');
    expect((await readFile(join(otherParent, basename(path)))).length).toBeGreaterThan(0);
  });

  it('respects 2048 durable tombstones and rejects excess history instead of silently resetting it', async () => {
    const { path } = await location();
    const s = store(path);
    await s.create({ idempotencyKey: 'initial-key', calendar: calendar() });
    const idempotency = Array.from({ length: 2_048 }, (_, i) => ({
      key: 'used-key-' + i,
      payloadHash: '0'.repeat(64),
      planId: randomUUID(),
    }));
    const state = { version: 1, plans: [], idempotency };
    await writeFile(path, JSON.stringify(state));
    expect(await s.list()).toEqual([]);
    await rejectKind(s.create({ idempotencyKey: 'new-key', calendar: calendar() }), 'capacity');
    await rejectKind(
      s.create({ idempotencyKey: 'used-key-0', calendar: calendar() }),
      'idempotency_conflict',
    );
    expect(await readFile(path, 'utf8')).toBe(JSON.stringify(state));
    await writeFile(
      path,
      JSON.stringify({
        ...state,
        idempotency: [...idempotency, { ...idempotency[0], key: 'used-key-extra' }],
      }),
    );
    await rejectKind(s.list(), 'unsafe_store');
  });

  it('enforces the live 20-plan ceiling without discarding history or allowing overflow', async () => {
    const { path } = await location();
    const s = store(path);
    for (let n = 0; n < 20; n++) {
      await s.create({ idempotencyKey: 'key-' + n, calendar: calendar() });
    }
    await rejectKind(s.create({ idempotencyKey: 'key-extra', calendar: calendar() }), 'capacity');
    expect(await store(path).list()).toHaveLength(20);
  });
});
