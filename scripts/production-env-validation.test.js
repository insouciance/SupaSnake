const {
  PRICE_VARIABLES,
  REQUIRED_VARIABLES,
  RETIRED_PRICE_VARIABLES,
  validateProductionEnvironment,
} = require('./production-env-validation.cjs');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const {
  PRODUCTION_PUBLIC_FLAGS,
  PRODUCTION_PUBLIC_SURFACE_HASH,
  PRODUCTION_SUPABASE_URL,
} = require('./production-public-surface.cjs');

/**
 * The fixture deliberately still carries the five retired energy/bundle
 * Price IDs, because that is exactly what Vercel production defines on the
 * day WP-0.09 deploys. If validation ever starts rejecting them, the first
 * production build after this work package fails — so the base case IS the
 * regression test.
 */
function validEnvironment() {
  const environment = Object.fromEntries(
    REQUIRED_VARIABLES.map((name) => [name, `configured-${name.toLowerCase()}`])
  );
  return {
    ...environment,
    NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
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
    ...Object.fromEntries(PRODUCTION_PUBLIC_FLAGS.map((name) => [name, 'true'])),
    SUPASNAKE_PUBLIC_SURFACE_HASH: PRODUCTION_PUBLIC_SURFACE_HASH,
    MIN_AGE_REQUIREMENT: '14',
    DISCORD_CLIENT_ID: '123456789012345678',
    DISCORD_GUILD_ID: '223456789012345678',
    DISCORD_REDIRECT_URI: 'https://supasnake.com/api/discord/callback',
    DISCORD_TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString('base64'),
    CRON_SECRET: 'c'.repeat(32),
  };
}

describe('production environment validation', () => {
  it('fails closed off main before either production workflow job proceeds', () => {
    const workflow = readFileSync(
      join(process.cwd(), '.github/workflows/deploy-production.yml'),
      'utf8'
    );
    const verifyAt = workflow.indexOf('  verify:');
    const deployAt = workflow.indexOf('  deploy:');
    expect(verifyAt).toBeGreaterThan(-1);
    expect(deployAt).toBeGreaterThan(verifyAt);

    for (const job of [
      workflow.slice(verifyAt, deployAt),
      workflow.slice(deployAt),
    ]) {
      expect(job).toContain('name: Require main branch dispatch');
      expect(job).toContain('if [ "$GITHUB_REF" != "refs/heads/main" ]');
      expect(job).toMatch(
        /Require main branch dispatch[\s\S]*exit 1[\s\S]*uses: actions\/checkout@v4/
      );
      expect(job).toContain('name: Require the exact current main commit');
      expect(job).toContain('bash scripts/verify-exact-main.sh');
    }
  });

  it('uses Preview-only preflight and one deliberate Production cutover', () => {
    const workflow = readFileSync(
      join(process.cwd(), '.github/workflows/deploy-production.yml'),
      'utf8'
    );
    const migrationSet =
      '062_competitive_clans.sql,063_run_continuity.sql,064_atomic_dynasty_favorites.sql';
    expect(workflow).toContain(`\"$actual\" = '${migrationSet}'`);
    expect(workflow).toContain('rollout=cohesive-ux-initial');
    expect(workflow).toContain('rollout=cohesive-ux-resume');

    const snapshotAt = workflow.indexOf('name: Snapshot exact outgoing cron state');
    const previewAt = workflow.indexOf('name: Build isolated Preview artifact');
    const previewBoundaryAt = workflow.indexOf(
      'name: Prove Preview cannot own production cron'
    );
    const bridgeAt = workflow.indexOf('name: Apply cohesive UX bridge migrations');
    const linkedProbeAt = workflow.indexOf(
      'name: Probe linked cohesive schema read-only'
    );
    const bridgeBoundaryAt = workflow.indexOf(
      'name: Prove bridge push left production cron unchanged'
    );
    const previewSmokeAt = workflow.indexOf(
      'name: Re-prove exact Preview public contract on final bridge schema'
    );
    const productionAt = workflow.indexOf(
      'name: Create deliberate Production deployment and cut over'
    );
    const productionCronAt = workflow.indexOf(
      'name: Prove exact Production deployment owns reviewed cron schedule'
    );
    const incidentAt = workflow.indexOf(
      'name: Classify production state after cutover attempt'
    );
    expect(snapshotAt).toBeGreaterThan(-1);
    expect(previewAt).toBeGreaterThan(snapshotAt);
    expect(previewBoundaryAt).toBeGreaterThan(previewAt);
    expect(bridgeAt).toBeGreaterThan(previewBoundaryAt);
    expect(linkedProbeAt).toBeGreaterThan(bridgeAt);
    expect(bridgeBoundaryAt).toBeGreaterThan(linkedProbeAt);
    expect(previewSmokeAt).toBeGreaterThan(bridgeBoundaryAt);
    expect(productionAt).toBeGreaterThan(previewSmokeAt);
    expect(productionCronAt).toBeGreaterThan(productionAt);
    expect(incidentAt).toBeGreaterThan(productionCronAt);

    const previewBlock = workflow.slice(previewAt, previewBoundaryAt);
    expect(previewBlock).toContain('npx vercel@56.3.1 deploy');
    expect(previewBlock).not.toContain('--prod');
    expect(previewBlock).toContain(
      'node scripts/production-public-surface-cli.mjs vercel-args'
    );
    expect(previewBlock).toContain(
      "SUPABASE_SERVICE_ROLE_KEY='preview-disabled-no-service-role'"
    );
    expect(previewBlock).toContain("deployment_target=$(printf '%s'");
    expect(previewBlock).toContain("[ \"$deployment_target\" != 'preview' ]");
    expect(workflow).not.toContain('rollout=standard');
    expect(workflow).toContain('rejects migrations without an explicit reviewed rollout contract');
    expect(workflow).toContain('name: Revalidate exact authority and pending plan before schema mutation');
    expect(workflow).toContain('name: Revalidate exact authority and empty schema plan before Production');
    expect(workflow.match(/node scripts\/verify-github-sha-workflows\.mjs/g)?.length)
      .toBeGreaterThanOrEqual(3);
    expect(workflow.match(/bash scripts\/verify-linked-migration-plan\.sh/g)?.length)
      .toBeGreaterThanOrEqual(4);

    const productionBlock = workflow.slice(productionAt, productionCronAt);
    expect(productionBlock).toContain('--prod');
    expect(productionBlock).toContain(
      'node scripts/production-public-surface-cli.mjs vercel-args'
    );
    expect(workflow).not.toMatch(/^\s+--skip-domain(?:\s|$)/m);
    expect(workflow).not.toContain('vercel@56.3.1 promote');
    expect(workflow).not.toContain('Restore outgoing cron ownership');
    expect(workflow).toContain(
      "always() && steps.production_attempt.outputs.started == 'true'"
    );
  });

  it('runs fixture SQL only on isolated Supabase and a distinct hosted read-only probe', () => {
    const production = readFileSync(
      join(process.cwd(), '.github/workflows/deploy-production.yml'),
      'utf8'
    );
    const e2e = readFileSync(
      join(process.cwd(), '.github/workflows/e2e.yml'),
      'utf8'
    );
    const localHarness = readFileSync(
      join(process.cwd(), 'scripts/run-local-sql-contracts.sh'),
      'utf8'
    );
    const linkedHarness = readFileSync(
      join(process.cwd(), 'scripts/probe-linked-cohesive-schema.sh'),
      'utf8'
    );
    const linkedProbe = readFileSync(
      join(process.cwd(), 'supabase/tests/cohesive_release_read_only.sql'),
      'utf8'
    );

    expect(production).toContain(
      'name: Run isolated SQL contracts, including two-session races'
    );
    expect(production).toContain('bash scripts/run-local-sql-contracts.sh');
    expect(e2e).toContain('sql-contracts:');
    expect(e2e).toContain('bash scripts/run-local-sql-contracts.sh');
    expect(e2e).toContain('needs: [sql-contracts, e2e-matrix]');

    expect(localHarness).toContain('127.0.0.1:54322');
    expect(localHarness).toContain('localhost:54322');
    expect(localHarness).toContain('supabase/tests/062_competitive_clans.sql');
    expect(localHarness).toContain('supabase/tests/063_run_continuity.sql');
    expect(localHarness).toContain('supabase/tests/064_atomic_dynasty_favorites.sql');
    expect(localHarness).toContain(
      'supabase/tests/064_atomic_dynasty_favorites_concurrency.sql'
    );
    expect(localHarness).toContain('supabase/tests/059_energy_commitment.sql');
    expect(localHarness).toContain('supabase/tests/060_pending_game_session_ends.sql');
    expect(localHarness).toContain('supabase/tests/061_career_spine.sql');
    expect(localHarness).toContain('supabase/tests/061_game_reward_concurrency.sql');
    expect(localHarness).toContain('@supabase_db_${project_id}:5432');
    expect(localHarness).toContain('-v dblink_conn="$dblink_database_url"');

    expect(linkedHarness).toContain("read_only: true");
    expect(linkedHarness).toContain('cohesive_release_read_only_v1');
    expect(linkedHarness).toContain('| length == 1');
    expect(linkedHarness).toContain(
      'supabase/tests/cohesive_release_read_only.sql'
    );
    expect(linkedHarness).not.toContain('062_competitive_clans.sql');
    expect(linkedHarness).not.toContain('063_run_continuity.sql');
    expect(linkedHarness).not.toContain('064_atomic_dynasty_favorites.sql');
    expect(linkedProbe).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(linkedProbe).toContain('supabase_migrations.schema_migrations');
    expect(linkedProbe).toContain("ARRAY['062', '063', '064']");
    expect(linkedProbe).toContain('COMMIT;');
    expect(linkedProbe).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/im);
  });

  it('fails closed unless cron definitions, owner, host, and enabled state are exact', () => {
    const verifier = readFileSync(
      join(process.cwd(), 'scripts/verify-vercel-cron-state.sh'),
      'utf8'
    );
    expect(verifier).toContain('[.crons[] | {path, schedule}]');
    expect(verifier).toContain('[.crons.definitions[] | {path, schedule}]');
    expect(verifier).toContain('.crons.deploymentId == $deployment');
    expect(verifier).toContain('.crons.enabledAt != null');
    expect(verifier).toContain('.crons.disabledAt == null');
    expect(verifier).toContain('all(. == $host)');
    expect(verifier).toContain('EXPECTED_CRON_DEFINITIONS_SHA');
  });

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

  it('rejects a production artifact that would compile the rollback Run Flow', () => {
    const environment = validEnvironment();
    environment.NEXT_PUBLIC_RUN_FLOW_V1 = 'false';

    expect(validateProductionEnvironment(environment, 'test').errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('NEXT_PUBLIC_RUN_FLOW_V1'),
      ])
    );
  });

  it('rejects another valid-looking Supabase project and any public-surface drift', () => {
    const environment = validEnvironment();
    environment.NEXT_PUBLIC_SUPABASE_URL = 'https://abcdefghijklmnopqrst.supabase.co';
    environment.NEXT_PUBLIC_LADDER_V1 = 'false';
    environment.SUPASNAKE_PUBLIC_SURFACE_HASH = '0'.repeat(64);

    expect(validateProductionEnvironment(environment, 'test').errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('NEXT_PUBLIC_SUPABASE_URL'),
        expect.stringContaining('NEXT_PUBLIC_LADDER_V1'),
        expect.stringContaining('SUPASNAKE_PUBLIC_SURFACE_HASH'),
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

  it('does not require the retired energy/bundle Price IDs', () => {
    // The cleanup direction: the owner deletes them from Vercel later, and
    // the build must keep passing when they are gone.
    const environment = validEnvironment();
    for (const name of RETIRED_PRICE_VARIABLES) delete environment[name];

    const result = validateProductionEnvironment(environment, 'test');
    expect(result.errors).toEqual([]);
    expect(result.warnings.join('\n')).not.toContain('WP-0.09');
  });

  it('tolerates retired Price IDs that are still defined, and says so once', () => {
    // The deploy direction: they are present today and must not fail a build.
    const result = validateProductionEnvironment(validEnvironment(), 'test');
    expect(result.errors).toEqual([]);
    const warning = result.warnings.find((w) => w.includes('WP-0.09'));
    expect(warning).toBeDefined();
    for (const name of RETIRED_PRICE_VARIABLES) {
      expect(warning).toContain(name);
    }
  });

  it('does not format-check a retired Price ID (a leftover is inert)', () => {
    const environment = validEnvironment();
    environment.NEXT_PUBLIC_STRIPE_ENERGY_SMALL = 'not-a-price-id-at-all';

    const result = validateProductionEnvironment(environment, 'test');
    expect(result.errors).toEqual([]);
  });

  it('still requires and format-checks the two subscription Price IDs', () => {
    expect(PRICE_VARIABLES).toEqual([
      'NEXT_PUBLIC_STRIPE_PREMIUM_MONTHLY',
      'NEXT_PUBLIC_STRIPE_PREMIUM_YEARLY',
    ]);
    for (const name of RETIRED_PRICE_VARIABLES) {
      expect(REQUIRED_VARIABLES).not.toContain(name);
    }

    const missing = validEnvironment();
    delete missing.NEXT_PUBLIC_STRIPE_PREMIUM_MONTHLY;
    expect(validateProductionEnvironment(missing, 'test').errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('NEXT_PUBLIC_STRIPE_PREMIUM_MONTHLY'),
      ])
    );

    const malformed = validEnvironment();
    malformed.NEXT_PUBLIC_STRIPE_PREMIUM_YEARLY = 'sub_notAPrice';
    expect(validateProductionEnvironment(malformed, 'test').errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('NEXT_PUBLIC_STRIPE_PREMIUM_YEARLY'),
      ])
    );
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
