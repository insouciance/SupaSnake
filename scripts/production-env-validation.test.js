const {
  REQUIRED_VARIABLES,
  validateProductionEnvironment,
} = require('./production-env-validation.cjs');

function validEnvironment() {
  const environment = Object.fromEntries(
    REQUIRED_VARIABLES.map((name) => [name, `configured-${name.toLowerCase()}`])
  );
  return {
    ...environment,
    NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon_key_with_sufficient_length_123456',
    SUPABASE_SERVICE_ROLE_KEY: 'service_key_with_sufficient_length_654321',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: ['pk', 'test', '1234567890abcdef'].join('_'),
    STRIPE_SECRET_KEY: ['sk', 'test', '1234567890abcdef'].join('_'),
    STRIPE_WEBHOOK_SECRET: ['whsec', '1234567890abcdef'].join('_'),
    NEXT_PUBLIC_STRIPE_ENERGY_SMALL: 'price_energySmall123',
    NEXT_PUBLIC_STRIPE_ENERGY_MEDIUM: 'price_energyMedium123',
    NEXT_PUBLIC_STRIPE_ENERGY_LARGE: 'price_energyLarge123',
    NEXT_PUBLIC_STRIPE_STARTER_BUNDLE: 'price_starterBundle123',
    NEXT_PUBLIC_STRIPE_DYNASTY_BUNDLE: 'price_dynastyBundle123',
    NEXT_PUBLIC_STRIPE_PREMIUM_MONTHLY: 'price_premiumMonthly123',
    NEXT_PUBLIC_STRIPE_PREMIUM_YEARLY: 'price_premiumYearly123',
    NEXT_PUBLIC_SENTRY_DSN: 'https://abc123@o123.ingest.sentry.io/456',
    NEXT_PUBLIC_POSTHOG_KEY: 'phc_1234567890abcdef',
    NEXT_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com',
    NEXT_PUBLIC_APP_URL: 'https://supasnake.com',
    MIN_AGE_REQUIREMENT: '14',
    DISCORD_CLIENT_ID: '123456789012345678',
    DISCORD_GUILD_ID: '223456789012345678',
    DISCORD_REDIRECT_URI: 'https://supasnake.com/api/discord/callback',
    DISCORD_TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString('base64'),
    CRON_SECRET: 'c'.repeat(32),
  };
}

describe('production environment validation', () => {
  it('accepts a complete test-mode production contract', () => {
    const result = validateProductionEnvironment(validEnvironment(), 'test');
    expect(result.errors).toEqual([]);
    expect(result.sealed).toEqual([]);
  });

  it('rejects a payment-mode mismatch and non-canonical public settings', () => {
    const environment = validEnvironment();
    environment.NEXT_PUBLIC_APP_URL = 'https://supasnake.vercel.app';
    environment.MIN_AGE_REQUIREMENT = '13';

    const result = validateProductionEnvironment(environment, 'live');
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
        expect.stringContaining('STRIPE_SECRET_KEY'),
        expect.stringContaining('NEXT_PUBLIC_APP_URL'),
        expect.stringContaining('MIN_AGE_REQUIREMENT'),
      ])
    );
  });

  it('allows sealed Vercel values only for the presence-check pass', () => {
    const sealed = Object.fromEntries(
      REQUIRED_VARIABLES.map((name) => [name, '[SENSITIVE]'])
    );

    expect(
      validateProductionEnvironment(sealed, 'test').errors.length
    ).toBeGreaterThan(0);
    const presenceOnly = validateProductionEnvironment(sealed, 'test', {
      allowSealed: true,
    });
    expect(presenceOnly.errors).toEqual([]);
    expect(presenceOnly.sealed).toHaveLength(REQUIRED_VARIABLES.length);
  });

  it('reports variable names without including configured values', () => {
    const environment = validEnvironment();
    const secretValue = 'do-not-print-this-value';
    environment.CRON_SECRET = secretValue;

    const result = validateProductionEnvironment(environment, 'test');
    expect(result.errors.join('\n')).toContain('CRON_SECRET');
    expect(result.errors.join('\n')).not.toContain(secretValue);
  });
});
