/**
 * The settlement-dispatch flag parses the environment exactly, and defaults
 * off. CI must never be able to infer the rollback path from an omitted
 * variable, so both directions are asserted here against the real module.
 */

const VAR = 'NEXT_PUBLIC_SETTLEMENT_DISPATCH_V1';

async function flagWith(value: string | undefined): Promise<boolean> {
  jest.resetModules();
  if (value === undefined) delete process.env[VAR];
  else process.env[VAR] = value;
  const mod = await import('./config');
  return mod.SETTLEMENT_DISPATCH_V1;
}

describe('SETTLEMENT_DISPATCH_V1', () => {
  const original = process.env[VAR];

  afterAll(() => {
    if (original === undefined) delete process.env[VAR];
    else process.env[VAR] = original;
    jest.resetModules();
  });

  it('is off when the variable is absent', async () => {
    await expect(flagWith(undefined)).resolves.toBe(false);
  });

  it.each(['false', 'FALSE', 'TRUE', 'True', '1', 'yes', 'on', '', ' true'])(
    'is off for %p — only the exact string arms it',
    async (value) => {
      await expect(flagWith(value)).resolves.toBe(false);
    }
  );

  it('is on for the exact string "true"', async () => {
    await expect(flagWith('true')).resolves.toBe(true);
  });
});
