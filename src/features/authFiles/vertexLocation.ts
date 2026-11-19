export const vertexLocationPresets = ['global', 'us', 'eu'] as const;
type VertexLocationPreset = (typeof vertexLocationPresets)[number];

export type VertexLocationDraft = {
  choice: VertexLocationPreset | 'custom';
  custom: string;
  touched: boolean;
};

function isPreset(value: string): value is VertexLocationPreset {
  return vertexLocationPresets.some((preset) => preset === value);
}

export function readVertexLocation(
  provider: string,
  credential: Record<string, unknown>
): VertexLocationDraft | undefined {
  const account = credential.service_account;
  if (provider !== 'vertex' || !account || typeof account !== 'object' || Array.isArray(account)) {
    return undefined;
  }
  const location = typeof credential.location === 'string' ? credential.location.trim() : '';
  const normalized = location.toLowerCase() || 'global';
  return isPreset(normalized)
    ? { choice: normalized, custom: '', touched: false }
    : { choice: 'custom', custom: location, touched: false };
}

export function changeVertexLocation(
  draft: VertexLocationDraft,
  field: 'vertexLocationChoice' | 'vertexLocationCustom',
  value: string
): VertexLocationDraft {
  if (field === 'vertexLocationCustom') return { ...draft, custom: value, touched: true };
  return value === 'custom' || isPreset(value) ? { ...draft, choice: value, touched: true } : draft;
}

export function resolveVertexLocation(draft?: VertexLocationDraft): string | undefined {
  if (!draft?.touched) return undefined;
  if (draft.choice !== 'custom') return draft.choice;
  const location = draft.custom.trim().toLowerCase();
  return /^[a-z0-9](?:[a-z0-9-]{0,50}[a-z0-9])?$/.test(location) ? location : undefined;
}

export function invalidVertexLocation(draft?: VertexLocationDraft): boolean {
  return Boolean(draft?.touched && resolveVertexLocation(draft) === undefined);
}
