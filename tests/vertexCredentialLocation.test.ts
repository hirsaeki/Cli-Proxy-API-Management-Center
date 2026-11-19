import { describe, expect, test } from 'bun:test';
import {
  changeVertexLocation,
  invalidVertexLocation,
  readVertexLocation,
  resolveVertexLocation,
} from '@/features/authFiles/vertexLocation';

const credential = { service_account: { type: 'service_account' } };

describe('Vertex service-account endpoint location', () => {
  test('does not offer location editing for ordinary Gemini or API keys', () => {
    expect(readVertexLocation('gemini', credential)).toBeUndefined();
    expect(readVertexLocation('vertex', { api_key: 'example' })).toBeUndefined();
    expect(readVertexLocation('vertex', { service_account: [] })).toBeUndefined();
  });

  test('shows the effective default without patching an absent location', () => {
    const draft = readVertexLocation('vertex', credential)!;
    expect(draft.choice).toBe('global');
    expect(resolveVertexLocation(draft)).toBeUndefined();
    expect(
      resolveVertexLocation(changeVertexLocation(draft, 'vertexLocationChoice', 'global'))
    ).toBe('global');
  });

  test('preserves a custom value across preset selection', () => {
    const draft = readVertexLocation('vertex', { ...credential, location: 'europe-west4' })!;
    expect(draft).toEqual({ choice: 'custom', custom: 'europe-west4', touched: false });
    expect(resolveVertexLocation(draft)).toBeUndefined();
    const us = changeVertexLocation(draft, 'vertexLocationChoice', 'us');
    expect(resolveVertexLocation(us)).toBe('us');
    expect(resolveVertexLocation(changeVertexLocation(us, 'vertexLocationChoice', 'custom'))).toBe(
      'europe-west4'
    );
  });

  test('blocks empty and malformed custom input without falling back', () => {
    const draft = changeVertexLocation(
      readVertexLocation('vertex', credential)!,
      'vertexLocationChoice',
      'custom'
    );
    for (const value of ['', ' ', 'https://example.test', '-us', 'us_1']) {
      const edited = changeVertexLocation(draft, 'vertexLocationCustom', value);
      expect(invalidVertexLocation(edited)).toBe(true);
      expect(resolveVertexLocation(edited)).toBeUndefined();
    }
    const edited = changeVertexLocation(draft, 'vertexLocationCustom', ' US-CENTRAL1 ');
    expect(invalidVertexLocation(edited)).toBe(false);
    expect(resolveVertexLocation(edited)).toBe('us-central1');
  });
});

test('an invalid edited location keeps the discard guard active while disabling Save', async () => {
  const editor = await Bun.file(
    new URL('../src/features/authFiles/hooks/useAuthFilesPrefixProxyEditor.ts', import.meta.url)
  ).text();
  const sheet = await Bun.file(
    new URL('../src/features/authFiles/components/AuthFileDetailsSheet.tsx', import.meta.url)
  ).text();
  expect(editor).toMatch(/const prefixProxyDirty =[^;]*invalidVertexLocation/);
  expect(sheet).toMatch(/!dirty\s*\|\|[^}]*invalidVertexLocation/);
});
