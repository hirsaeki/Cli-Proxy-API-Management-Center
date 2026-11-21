import { apiClient } from './client';

const endpoint = '/credentials/vertex-failover';

export type VertexFailoverMode = 'off' | 'automatic';
export type VertexFailoverPolicy = {
  mode: VertexFailoverMode | 'legacy';
  explicit: boolean;
  revision: string;
};
export type VertexFailoverTarget = { name: string; authIndex?: string };
type PinnedClient = Pick<typeof apiClient, 'get' | 'patch'>;

function parsePolicy(value: unknown): VertexFailoverPolicy {
  if (
    value &&
    typeof value === 'object' &&
    'mode' in value &&
    'explicit' in value &&
    'revision' in value &&
    typeof value.revision === 'string' &&
    value.revision.trim()
  ) {
    const { mode, explicit, revision } = value;
    if (
      (mode === 'off' && typeof explicit === 'boolean') ||
      (mode === 'automatic' && explicit === true) ||
      (mode === 'legacy' && explicit === false)
    ) {
      return { mode, explicit, revision };
    }
  }
  throw new Error('Unexpected Vertex failover policy response');
}

export function vertexFailoverApi(client: PinnedClient, target: VertexFailoverTarget) {
  const identity = {
    name: target.name,
    ...(target.authIndex ? { auth_index: target.authIndex } : {}),
  };
  return {
    read: async () => parsePolicy(await client.get<unknown>(endpoint, { params: identity })),
    write: async (mode: VertexFailoverMode, revision: string) =>
      parsePolicy(await client.patch<unknown>(endpoint, { ...identity, mode, revision })),
  };
}
