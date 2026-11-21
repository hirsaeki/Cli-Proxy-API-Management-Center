import type { VertexFailoverMode, VertexFailoverPolicy } from '@/services/api/vertexFailover';

type PolicyReader = () => Promise<VertexFailoverPolicy>;
type PolicyApi = {
  read: PolicyReader;
  write: (mode: VertexFailoverMode, revision: string) => Promise<VertexFailoverPolicy>;
};

export type VertexFailoverState =
  | { kind: 'loading' }
  | { kind: 'unavailable' | 'ineligible' | 'read_error' | 'unknown' }
  | { kind: 'ready'; policy: VertexFailoverPolicy; writeUnconfirmed?: boolean };

export async function readVertexFailover(read: PolicyReader): Promise<VertexFailoverState> {
  try {
    return { kind: 'ready', policy: await read() };
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      if (error.status === 404) return { kind: 'unavailable' };
      if (error.status === 409) return { kind: 'ineligible' };
    }
    return { kind: 'read_error' };
  }
}

export async function saveVertexFailover(
  api: PolicyApi,
  current: VertexFailoverState,
  mode: VertexFailoverMode,
  isCurrent: () => boolean
): Promise<VertexFailoverState | undefined> {
  if (!isCurrent() || current.kind !== 'ready' || current.policy.mode === mode) return undefined;
  try {
    const policy = await api.write(mode, current.policy.revision);
    if (policy.mode === mode && policy.explicit) return { kind: 'ready', policy };
  } catch {
    // The request may have committed before the response failed. Do not retry the write.
  }
  if (!isCurrent()) return undefined;
  const state = await readVertexFailover(api.read);
  return state.kind === 'ready' ? { ...state, writeUnconfirmed: true } : { kind: 'unknown' };
}
