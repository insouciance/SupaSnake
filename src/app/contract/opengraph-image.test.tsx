/**
 * The `/contract` Open Graph route (Rule 14).
 *
 * `next/og` is mocked for the same reason `src/app/artifactImages.test.tsx`
 * mocks it: `ImageResponse` rasterises through Satori, which loads its WASM
 * by dynamic import and cannot run in Jest's CommonJS VM without
 * `--experimental-vm-modules`. This file proves the route RESOLVES and
 * answers with an image, and that the card carries the contract's own
 * claims rather than a pitch. The bytes are an e2e concern.
 */

import { describe, it, expect, jest } from '@jest/globals';

const rendered: unknown[] = [];

jest.mock('next/og', () => ({
  ImageResponse: class extends Response {
    constructor(element: unknown) {
      super(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        headers: { 'content-type': 'image/png' },
      });
      rendered.push(element);
    }
  },
}));

/** Every string in a React element tree, flattened. */
function textOf(node: unknown): string {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  const props = (node as { props?: { children?: unknown } }).props;
  return props ? textOf(props.children) : '';
}

const contractImage =
  require('./opengraph-image') as typeof import('./opengraph-image');

describe('/contract opengraph-image', () => {
  it('returns an image', async () => {
    const response = contractImage.default();
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it('declares the summary_large_image size, type and alt text', () => {
    expect(contractImage.size).toEqual({ width: 1200, height: 630 });
    expect(contractImage.contentType).toBe('image/png');
    expect(contractImage.alt).toMatch(/contract/i);
  });

  it('unfurls the argument, not the pitch — the four claims are on the card', () => {
    contractImage.default();
    const text = textOf(rendered[rendered.length - 1]);
    expect(text).toMatch(/score measures you, not your build/i);
    expect(text).toMatch(/money moves no number/i);
    expect(text).toMatch(/everything you earn is permanent/i);
    expect(text).toMatch(/being away is never destructive/i);
    expect(text).toContain('supasnake.com/contract');
  });
});
