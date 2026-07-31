'use strict';

const {
  PRODUCTION_PUBLIC_FLAGS,
  PRODUCTION_PUBLIC_SURFACE_HASH,
  PRODUCTION_SUPABASE_URL,
} = require('./production-public-surface.cjs');

/**
 * Stripe Price IDs the build REQUIRES. Only the two subscription prices are
 * left: WP-0.09 deleted every one-time SKU (Constitution §10.4), so no other
 * price is read by any code path.
 */
const PRICE_VARIABLES = [
  'NEXT_PUBLIC_STRIPE_PREMIUM_MONTHLY',
  'NEXT_PUBLIC_STRIPE_PREMIUM_YEARLY',
];

/**
 * Price IDs for the deleted energy and bundle SKUs.
 *
 * These are NOT required and NOT format-checked — but they are also not
 * rejected. Production still defines all five, and the deploy that ships
 * WP-0.09 must succeed against the environment as it exists on that day;
 * removing them from Vercel is a separate, unhurried cleanup. Requiring them
 * would break the deploy after the cleanup; rejecting them breaks the deploy
 * before it. Tolerating them, and saying so once per build, is the only
 * ordering-independent behaviour.
 *
 * Nothing reads these values. A leftover is inert, not dangerous.
 */
const RETIRED_PRICE_VARIABLES = [
  'NEXT_PUBLIC_STRIPE_ENERGY_SMALL',
  'NEXT_PUBLIC_STRIPE_ENERGY_MEDIUM',
  'NEXT_PUBLIC_STRIPE_ENERGY_LARGE',
  'NEXT_PUBLIC_STRIPE_STARTER_BUNDLE',
  'NEXT_PUBLIC_STRIPE_DYNASTY_BUNDLE',
];

const REQUIRED_VARIABLES = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  ...PRICE_VARIABLES,
  'NEXT_PUBLIC_SENTRY_DSN',
  'SENTRY_AUTH_TOKEN',
  'SENTRY_ORG',
  'SENTRY_PROJECT',
  'NEXT_PUBLIC_POSTHOG_KEY',
  'NEXT_PUBLIC_POSTHOG_HOST',
  'NEXT_PUBLIC_APP_URL',
  ...PRODUCTION_PUBLIC_FLAGS,
  'SUPASNAKE_PUBLIC_SURFACE_HASH',
  'MIN_AGE_REQUIREMENT',
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_BOT_TOKEN',
  'DISCORD_GUILD_ID',
  'DISCORD_REDIRECT_URI',
  'DISCORD_TOKEN_ENC_KEY',
  'CRON_SECRET',
  'OPENAI_API_KEY',
];

const SEALED_VALUE = '[SENSITIVE]';

function validateProductionEnvironment(
  environment,
  paymentsMode,
  { allowSealed = false } = {}
) {
  if (!['test', 'live'].includes(paymentsMode)) {
    return {
      errors: ['EXPECTED_PAYMENTS_MODE: must be either test or live'],
      warnings: [],
      sealed: [],
    };
  }

  const errors = [];
  const warnings = [];
  const sealed = [];
  const value = (name) => environment[name]?.trim() ?? '';
  const isSealed = (name) => value(name) === SEALED_VALUE;
  const issue = (name, message) => errors.push(`${name}: ${message}`);

  for (const name of REQUIRED_VARIABLES) {
    const configured = value(name);
    if (!configured) {
      issue(name, 'missing');
    } else if (isSealed(name)) {
      sealed.push(name);
      if (!allowSealed) {
        issue(name, 'is sealed and can only be validated during the Vercel build');
      }
    } else if (/xxxx|placeholder|your[-_ ]|example\.com/i.test(configured)) {
      issue(name, 'still contains a placeholder value');
    }
  }

  const canInspect = (name) => value(name) && !isSealed(name);
  const assertExact = (name, expected) => {
    if (canInspect(name) && value(name) !== expected) {
      issue(name, `must equal ${expected}`);
    }
  };
  const assertPattern = (name, pattern, description) => {
    if (canInspect(name) && !pattern.test(value(name))) {
      issue(name, description);
    }
  };

  assertExact('NEXT_PUBLIC_SUPABASE_URL', PRODUCTION_SUPABASE_URL);
  if (
    canInspect('NEXT_PUBLIC_SUPABASE_ANON_KEY') &&
    value('NEXT_PUBLIC_SUPABASE_ANON_KEY').length < 20
  ) {
    issue('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'value is unexpectedly short');
  }
  if (
    canInspect('SUPABASE_SERVICE_ROLE_KEY') &&
    value('SUPABASE_SERVICE_ROLE_KEY').length < 20
  ) {
    issue('SUPABASE_SERVICE_ROLE_KEY', 'value is unexpectedly short');
  }
  if (
    canInspect('NEXT_PUBLIC_SUPABASE_ANON_KEY') &&
    canInspect('SUPABASE_SERVICE_ROLE_KEY') &&
    value('NEXT_PUBLIC_SUPABASE_ANON_KEY') === value('SUPABASE_SERVICE_ROLE_KEY')
  ) {
    issue('SUPABASE_SERVICE_ROLE_KEY', 'must not equal the public anonymous key');
  }

  assertPattern(
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    new RegExp(`^pk_${paymentsMode}_[A-Za-z0-9]+$`),
    `must be a Stripe ${paymentsMode}-mode publishable key`
  );
  assertPattern(
    'STRIPE_SECRET_KEY',
    new RegExp(`^sk_${paymentsMode}_[A-Za-z0-9]+$`),
    `must be a Stripe ${paymentsMode}-mode secret key`
  );
  assertPattern(
    'STRIPE_WEBHOOK_SECRET',
    /^whsec_[A-Za-z0-9]+$/,
    'must be a Stripe webhook signing secret'
  );
  for (const name of PRICE_VARIABLES) {
    assertPattern(name, /^price_[A-Za-z0-9]+$/, 'must be a Stripe Price ID');
  }

  assertPattern(
    'NEXT_PUBLIC_SENTRY_DSN',
    /^https:\/\/[^\s]+@[^\s]+\/\d+$/,
    'must be an HTTPS Sentry DSN'
  );
  assertPattern(
    'NEXT_PUBLIC_POSTHOG_KEY',
    /^phc_[A-Za-z0-9_-]+$/,
    'must be a PostHog project key'
  );
  assertExact('NEXT_PUBLIC_POSTHOG_HOST', 'https://eu.i.posthog.com');
  assertExact('NEXT_PUBLIC_APP_URL', 'https://supasnake.com');
  for (const name of PRODUCTION_PUBLIC_FLAGS) {
    assertExact(name, 'true');
  }
  assertExact(
    'SUPASNAKE_PUBLIC_SURFACE_HASH',
    PRODUCTION_PUBLIC_SURFACE_HASH
  );
  assertExact('MIN_AGE_REQUIREMENT', '14');
  assertExact('DISCORD_REDIRECT_URI', 'https://supasnake.com/api/discord/callback');

  for (const name of ['DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) {
    assertPattern(name, /^\d{15,22}$/, 'must be a Discord snowflake ID');
  }
  if (canInspect('CRON_SECRET') && value('CRON_SECRET').length < 32) {
    issue('CRON_SECRET', 'must contain at least 32 characters');
  }
  if (canInspect('DISCORD_TOKEN_ENC_KEY')) {
    const key = value('DISCORD_TOKEN_ENC_KEY');
    const isCanonicalBase64 = /^[A-Za-z0-9+/]{43}=$/.test(key);
    if (!isCanonicalBase64 || Buffer.from(key, 'base64').length !== 32) {
      issue('DISCORD_TOKEN_ENC_KEY', 'must be a base64-encoded 32-byte key');
    }
  }

  if (!value('RESEND_API_KEY')) {
    warnings.push(
      'RESEND_API_KEY: weekly digest email will remain disabled (gameplay is unaffected)'
    );
  }

  // Retired SKU prices: never an error in either direction. Present is fine
  // (inert leftover, flagged for cleanup); absent is fine (cleanup done).
  const leftoverPrices = RETIRED_PRICE_VARIABLES.filter((name) => value(name));
  if (leftoverPrices.length > 0) {
    warnings.push(
      `${leftoverPrices.join(', ')}: Stripe Price ID(s) for SKUs deleted by ` +
        'WP-0.09 (Constitution §10.4). Nothing reads them; remove them from ' +
        'Vercel at your convenience — the build passes with or without them.'
    );
  }

  return { errors, warnings, sealed };
}

module.exports = {
  PRICE_VARIABLES,
  RETIRED_PRICE_VARIABLES,
  REQUIRED_VARIABLES,
  validateProductionEnvironment,
};
