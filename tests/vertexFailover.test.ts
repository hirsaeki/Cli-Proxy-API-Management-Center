import { describe, expect, mock, test } from 'bun:test';
import { readVertexFailover, saveVertexFailover } from '@/features/authFiles/vertexFailover';
import { vertexFailoverApi, type VertexFailoverPolicy } from '@/services/api/vertexFailover';

const off: VertexFailoverPolicy = { mode: 'off', explicit: false, revision: 'read-off' };
const automatic: VertexFailoverPolicy = {
  mode: 'automatic',
  explicit: true,
  revision: 'read-auto',
};
const legacy: VertexFailoverPolicy = { mode: 'legacy', explicit: false, revision: 'read-legacy' };
const current = () => true;

describe('Vertex regional failover management control', () => {
  test('loads the unset and legacy modes without opting in', async () => {
    expect(await readVertexFailover(async () => off)).toEqual({ kind: 'ready', policy: off });
    expect(await readVertexFailover(async () => legacy)).toEqual({ kind: 'ready', policy: legacy });
  });

  test('only calls the dedicated endpoint with narrow identity and mode fields', async () => {
    const get = mock(async <T>() => ({ ...legacy, private_key: 'unused-test-sentinel' }) as T);
    const patch = mock(async <T>() => automatic as T);
    const api = vertexFailoverApi({ get, patch }, { name: 'a & a.json', authIndex: 'idx' });
    expect(await api.read()).toEqual(legacy);
    expect(await api.write('automatic', legacy.revision)).toEqual(automatic);
    expect(get.mock.calls).toEqual([
      ['/credentials/vertex-failover', { params: { name: 'a & a.json', auth_index: 'idx' } }],
    ]);
    expect(patch.mock.calls).toEqual([
      [
        '/credentials/vertex-failover',
        { name: 'a & a.json', auth_index: 'idx', mode: 'automatic', revision: legacy.revision },
      ],
    ]);
  });

  test('the old core and ineligible credentials never receive a write', async () => {
    for (const [status, kind] of [
      [404, 'unavailable'],
      [409, 'ineligible'],
    ] as const) {
      const get = mock(async () => {
        throw { status };
      });
      const patch = mock(async <T>() => automatic as T);
      const api = vertexFailoverApi({ get, patch }, { name: 'vertex.json' });
      const state = await readVertexFailover(api.read);
      expect(state).toEqual({ kind });
      expect(await saveVertexFailover(api, state, 'automatic', current)).toBeUndefined();
      expect(patch).not.toHaveBeenCalled();
    }
  });

  test('rejects unexpected successful responses rather than inferring support', async () => {
    const get = mock(async <T>() => ({ mode: 'off', explicit: false }) as T);
    const patch = mock(async <T>() => automatic as T);
    const api = vertexFailoverApi({ get, patch }, { name: 'vertex.json' });
    const state = await readVertexFailover(api.read);
    expect(state).toEqual({ kind: 'read_error' });
    expect(await saveVertexFailover(api, state, 'automatic', current)).toBeUndefined();
    expect(patch).not.toHaveBeenCalled();
  });

  test('a successful explicit transition replaces the state without reading or resending', async () => {
    const read = mock(async () => off);
    const write = mock(async () => automatic);
    expect(
      await saveVertexFailover(
        { read, write },
        { kind: 'ready', policy: legacy },
        'automatic',
        current
      )
    ).toEqual({ kind: 'ready', policy: automatic });
    expect(write.mock.calls).toEqual([['automatic', legacy.revision]]);
    expect(read).not.toHaveBeenCalled();
  });

  test('on ambiguous save, read back once or require a fresh read if unavailable', async () => {
    const write = mock(async () => {
      throw new Error('timeout');
    });
    const initial = { kind: 'ready', policy: legacy } as const;
    for (const state of [automatic, legacy]) {
      const read = mock(async () => state);
      expect(await saveVertexFailover({ read, write }, initial, 'automatic', current)).toEqual({
        kind: 'ready',
        policy: state,
        writeUnconfirmed: true,
      });
      expect(read).toHaveBeenCalledTimes(1);
    }
    const read = mock(async () => {
      throw new Error('offline');
    });
    expect(await saveVertexFailover({ read, write }, initial, 'automatic', current)).toEqual({
      kind: 'unknown',
    });
    expect(write).toHaveBeenCalledTimes(3);
  });

  test('a stale credential revision never retries a write and refreshes once', async () => {
    const read = mock(async () => ({ ...off, revision: 'replacement' }));
    const write = mock(async () => {
      throw { status: 409 };
    });
    expect(
      await saveVertexFailover(
        { read, write },
        { kind: 'ready', policy: legacy },
        'automatic',
        current
      )
    ).toEqual({
      kind: 'ready',
      policy: { ...off, revision: 'replacement' },
      writeUnconfirmed: true,
    });
    expect(write.mock.calls).toEqual([['automatic', legacy.revision]]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  test('a stale connection cannot write or initiate readback', async () => {
    let active = false;
    const read = mock(async () => off);
    const write = mock(async () => {
      active = false;
      throw new Error('disconnected');
    });
    const initial = { kind: 'ready', policy: off } as const;
    const isCurrent = () => active;
    expect(
      await saveVertexFailover({ read, write }, initial, 'automatic', isCurrent)
    ).toBeUndefined();
    expect(write).not.toHaveBeenCalled();
    active = true;
    expect(
      await saveVertexFailover({ read, write }, initial, 'automatic', isCurrent)
    ).toBeUndefined();
    expect(write).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
  });
});
