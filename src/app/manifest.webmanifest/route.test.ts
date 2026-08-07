/**
 * The flag-off rollback path, tested rather than inferred.
 *
 * `NEXT_PUBLIC_PWA_V1` is read at module scope, so each case re-imports the
 * route under a fresh module registry with the variable set explicitly —
 * including the "absent entirely" case, which is what a deployment that has
 * never heard of this feature looks like.
 */

const ROUTE = '@/app/manifest.webmanifest/route';
const SW_ROUTE = '@/app/sw.js/route';

async function importUnderFlag<T>(specifier: string, value: string | undefined): Promise<T> {
  const original = process.env.NEXT_PUBLIC_PWA_V1;
  if (value === undefined) delete process.env.NEXT_PUBLIC_PWA_V1;
  else process.env.NEXT_PUBLIC_PWA_V1 = value;

  let module_: T;
  jest.resetModules();
  try {
    module_ = (await import(specifier)) as T;
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_PWA_V1;
    else process.env.NEXT_PUBLIC_PWA_V1 = original;
  }
  return module_;
}

type RouteModule = { GET: () => Promise<Response> };

describe('GET /manifest.webmanifest', () => {
  it('serves the manifest when the flag is armed', async () => {
    const { GET } = await importUnderFlag<RouteModule>(ROUTE, 'true');
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/manifest+json');
    const body = await response.json();
    expect(body.start_url).toBe('/');
    // Asserted against the declaration rather than a second hardcoded list:
    // this route's job is to serve PWA_ICONS faithfully, and what that list
    // should CONTAIN is pinned by manifest.test.ts. Two copies of the list
    // meant one test failing for a reason the other had already covered.
    const { PWA_ICONS } = await import('@/lib/pwa/manifest');
    expect(body.icons.map((icon: { src: string }) => icon.src)).toEqual(
      PWA_ICONS.map((icon) => icon.src)
    );
    expect(body.icons.length).toBeGreaterThanOrEqual(3);
  });

  it('404s when the flag is absent', async () => {
    const { GET } = await importUnderFlag<RouteModule>(ROUTE, undefined);
    expect((await GET()).status).toBe(404);
  });

  it('404s for anything that is not the exact string "true"', async () => {
    for (const value of ['false', 'TRUE', '1', 'yes', '']) {
      const { GET } = await importUnderFlag<RouteModule>(ROUTE, value);
      expect((await GET()).status).toBe(404);
    }
  });
});

describe('GET /sw.js', () => {
  it('serves the worker when the flag is armed, scoped to the origin', async () => {
    const { GET } = await importUnderFlag<RouteModule>(SW_ROUTE, 'true');
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/javascript');
    expect(response.headers.get('Service-Worker-Allowed')).toBe('/');
    expect(response.headers.get('Cache-Control')).toContain('no-cache');
    expect(await response.text()).toContain("addEventListener('push'");
  });

  it('404s when the flag is off, so no worker can be registered at all', async () => {
    const { GET } = await importUnderFlag<RouteModule>(SW_ROUTE, undefined);
    expect((await GET()).status).toBe(404);
  });
});

describe('the document head', () => {
  it('links the manifest only when the flag is armed', async () => {
    const armed = await importUnderFlag<{ metadata: { manifest?: string } }>(
      '@/app/layout',
      'true'
    );
    expect(armed.metadata.manifest).toBe('/manifest.webmanifest');
  });

  it('has no manifest key at all when the flag is off', async () => {
    const dark = await importUnderFlag<{ metadata: Record<string, unknown> }>(
      '@/app/layout',
      undefined
    );
    // Absent, not undefined: Next omits the <link> either way, but an absent
    // key is the honest statement that there is nothing to install.
    expect('manifest' in dark.metadata).toBe(false);
  });
});
