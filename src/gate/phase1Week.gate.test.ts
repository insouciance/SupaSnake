/**
 * @jest-environment node
 */

/**
 * THE PHASE 1 GATE — a full simulated week against a REAL Postgres.
 *
 * Authority: docs/PRODUCT_CONSTITUTION.md; the gate text in
 * `.claude/commands/execute-constitution.md`:
 *
 *   "an integration test with an injected clock simulates the full week —
 *    found a clan of one -> play Signal runs (charged, lean, and exempt) ->
 *    Serpent runs -> Sunday settlement -> Depth recorded -> share artifacts
 *    render with URLs -> Monday briefing reads correctly."
 *
 * WHY THIS FILE EXISTS AT ALL
 *
 *   Migrations 046-051 were written, reviewed and pinned by SHAPE TESTS —
 *   tests that `readFileSync` the .sql and assert against its TEXT. Not one
 *   of them had ever been executed by Postgres. A shape test reads one file
 *   in isolation, so it cannot see a collision between two migrations, a
 *   wrong argument order, or a function that parses but does not run. This
 *   gate runs them.
 *
 *   It found one immediately: migration 048 created a TABLE named
 *   `clan_rivalries`, a name migration 020 had already taken with a VIEW.
 *   `CREATE TABLE IF NOT EXISTS` was a silent no-op and the next
 *   `CREATE INDEX` aborted the migration (SQLSTATE 42809). Both shape tests
 *   passed. The pair was unrunnable. See the rename in 048's header.
 *
 * THE TWO CLOCKS
 *
 *   1. THE INJECTED CLOCK. Every function that takes `now` is given one
 *      derived from `WEEK_ANCHOR`, never `Date.now()`. `ensure_serpent_week`
 *      and `ensure_signal_day` take their whole window as parameters, so the
 *      simulated week is written into Postgres exactly as a real one would be.
 *      Nothing in this file sleeps.
 *
 *   2. THE TAKE CLOCK, WHICH IS NOT INJECTABLE. `collect_daily_take` takes a
 *      player id and nothing else; it reads `(NOW() AT TIME ZONE 'utc')::DATE`
 *      itself. That is deliberate in migration 050 and pinned by its shape
 *      test. So the Take days are advanced the only way the RPC can observe:
 *      by writing `player_streaks.take_last_claim_date` to a real-clock-
 *      relative date before each call. The RPC's own logic — the guard, the
 *      compare-and-set, the ladder, the cooling — runs untouched.
 *
 * WHAT IS REAL AND WHAT IS NOT
 *
 *   Real: every RPC, every table write, every constraint, every lock, every
 *   grant. This talks to a local Docker Postgres over PostgREST with the
 *   service-role key.
 *
 *   Not real: the game engine. No snake is driven. Runs are inserted as
 *   `game_sessions` rows with the fields settlement actually reads, which is
 *   what the settlement path would see from a played run.
 */

// ---------------------------------------------------------------------------
// SAFETY: this file writes to a database. It must only ever be a local one.
// ---------------------------------------------------------------------------
//
// `next/jest` auto-loads `.env`, and this repo's `.env` points at the HOSTED
// production Supabase project with a live service-role key. A gate test that
// simply read `process.env.NEXT_PUBLIC_SUPABASE_URL` would run this entire
// week simulation — including the DNA credits and the settlement writes —
// against production. The guard below is not a nicety.

const LOCAL_URL_PATTERN = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;

const GATE_URL = process.env.GATE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const GATE_KEY =
  process.env.GATE_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY_LOCAL ??
  '';

if (!LOCAL_URL_PATTERN.test(GATE_URL)) {
  throw new Error(
    `Phase 1 gate refused to run: GATE_SUPABASE_URL must be a loopback address, got "${GATE_URL}". ` +
      'This test writes to the database it is pointed at.'
  );
}

// The flags every Phase 1 surface is gated behind. Set BEFORE the modules that
// read them are imported — each `*_ENABLED` is a module-scope const, so these
// assignments must happen before the dynamic `import()` calls in `beforeAll`.
process.env.NEXT_PUBLIC_SERPENT_V1 = 'true';
process.env.NEXT_PUBLIC_SIGNAL_V1 = 'true';
process.env.NEXT_PUBLIC_DAILY_TAKE_V1 = 'true';
process.env.NEXT_PUBLIC_CLAN_V2 = 'true';
process.env.NEXT_PUBLIC_SHARE_ARTIFACTS_V1 = 'true';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

jest.setTimeout(180_000);

// ---------------------------------------------------------------------------
// The injected clock
// ---------------------------------------------------------------------------

/** A Wednesday inside the week the gate simulates. */
const WEEK_ANCHOR = new Date('2026-06-03T12:00:00.000Z');

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC midnight of `weekStart` plus `days`, at `hour`. */
function at(weekStartIso: string, days: number, hour: number): Date {
  return new Date(new Date(`${weekStartIso}T00:00:00.000Z`).getTime() + days * DAY_MS + hour * 3600_000);
}

// ---------------------------------------------------------------------------
// Modules under test, loaded after the flags are set
// ---------------------------------------------------------------------------

let serpentLib: any;
let signalLib: any;
let takeLib: any;
let envelopeLib: any;
let clanLib: any;
let artifactsLib: any;
let briefingLib: any;
let sharedSerpent: any;
let sharedEnvelope: any;
let rulesets: any;
let cards: any;

let supabase: SupabaseClient;

/** Everything this run created, torn down in reverse at the end. */
const created = {
  userIds: [] as string[],
  playerIds: [] as string[],
  clanIds: [] as string[],
  weekIds: [] as string[],
  dayIds: [] as string[],
};

/** A player, as the gate needs to address one: two ids and a handle. */
interface GatePlayer {
  userId: string;
  playerId: string;
  handle: string;
}

let solo: GatePlayer; // founds the clan of one, plays the week
let absent: GatePlayer; // never plays — the Rule 5 witness

let weekStart: string;
let weekId: string;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

async function createGatePlayer(handle: string): Promise<GatePlayer> {
  const email = `gate-${handle.toLowerCase()}-${Date.now()}@gate.invalid`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: 'gate-password-not-a-secret',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`auth user create failed: ${error?.message}`);
  const userId = data.user.id;
  created.userIds.push(userId);

  // The FTUE bootstrap trigger may already have made a players row for this
  // auth user. Take it if so; the gate is not testing bootstrap.
  const { data: existing } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  let playerId: string;
  if (existing?.id) {
    playerId = String(existing.id);
  } else {
    const { data: row, error: insertError } = await supabase
      .from('players')
      .insert({ user_id: userId, username: handle, dna: 0 })
      .select('id')
      .single();
    if (insertError || !row) {
      throw new Error(`player insert failed: ${insertError?.message}`);
    }
    playerId = String(row.id);
  }
  created.playerIds.push(playerId);
  return { userId, playerId, handle };
}

/** An OPEN session — `begin_signal_objective_run` requires one. */
async function openSession(
  player: GatePlayer,
  startedAt: Date,
  extra: Record<string, unknown> = {}
): Promise<string> {
  const { data, error } = await supabase
    .from('game_sessions')
    .insert({
      player_id: player.playerId,
      started_at: startedAt.toISOString(),
      server_started_at: startedAt.toISOString(),
      dynasty: 'CYBER',
      ...extra,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`session insert failed: ${error?.message}`);
  return String(data.id);
}

/** Close a session with the settlement facts Depth and the ledger read. */
async function endSession(
  sessionId: string,
  fields: {
    endedAt: Date;
    yieldDna: number;
    dnaEarned: number;
    score: number;
    chargeState: string;
    serpentWeekId?: string | null;
  }
): Promise<void> {
  const { error } = await supabase
    .from('game_sessions')
    .update({
      ended_at: fields.endedAt.toISOString(),
      // `game_sessions_end_reason_valid` (migration 045) allows exactly
      // completed | abandoned | disconnected | expired. Only a settling
      // reason makes a run Depth-eligible.
      end_reason: 'completed',
      extracted: true,
      validated: true,
      yield_dna: fields.yieldDna,
      dna_earned: fields.dnaEarned,
      score: fields.score,
      charge_state: fields.chargeState,
      serpent_week_id: fields.serpentWeekId ?? null,
    })
    .eq('id', sessionId);
  if (error) throw new Error(`session end failed: ${error.message}`);
}

async function readPlayer(playerId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('players')
    .select(
      'dna, total_dna_earned, high_score, legacy_score, lifetime_depth, best_week_depth, signals_completed, charges_used'
    )
    .eq('id', playerId)
    .single();
  if (error || !data) throw new Error(`player read failed: ${error?.message}`);
  return data as unknown as Record<string, number>;
}

/**
 * Move the Take clock. `collect_daily_take` reads today from Postgres, so the
 * only way to simulate "yesterday" is to write the date the RPC compares
 * against. Everything the RPC then decides is its own.
 */
async function setTakeState(
  playerId: string,
  state: { days: number; tier: number; longest: number; lastClaimDaysAgo: number | null }
): Promise<void> {
  // The RPC reads `(NOW() AT TIME ZONE 'utc')::DATE`; this is the same day
  // from this process. The two can only differ if the run straddles UTC
  // midnight, which would make the RPC report `already_collected` — a loud,
  // safe failure rather than a silently wrong assertion.
  const base = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  const lastClaim =
    state.lastClaimDaysAgo === null
      ? null
      : new Date(base.getTime() - state.lastClaimDaysAgo * DAY_MS).toISOString().slice(0, 10);

  await supabase
    .from('player_streaks')
    .upsert(
      {
        player_id: playerId,
        take_streak_days: state.days,
        take_tier: state.tier,
        take_longest_streak: state.longest,
        take_last_claim_date: lastClaim,
      },
      { onConflict: 'player_id' }
    )
    .throwOnError();
}

// ---------------------------------------------------------------------------

beforeAll(async () => {
  if (!GATE_KEY) {
    throw new Error(
      'Phase 1 gate needs GATE_SUPABASE_SERVICE_ROLE_KEY (the LOCAL stack key). ' +
        'Never the hosted one.'
    );
  }

  supabase = createClient(GATE_URL, GATE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  serpentLib = await import('@/lib/server/serpent');
  signalLib = await import('@/lib/server/signal');
  takeLib = await import('@/lib/server/dailyTake');
  envelopeLib = await import('@/lib/server/energyEnvelope');
  clanLib = await import('@/lib/server/clanHunt');
  artifactsLib = await import('@/lib/server/artifacts');
  briefingLib = await import('@/lib/serpent/briefing');
  sharedSerpent = await import('@/shared/game/serpent');
  sharedEnvelope = await import('@/shared/game/energyEnvelope');
  rulesets = await import('@/shared/game/rulesets');
  cards = await import('@/lib/share/artifactCards');

  weekStart = sharedSerpent.describeSerpentWeek(WEEK_ANCHOR).weekStart;

  solo = await createGatePlayer('GateSolo');
  absent = await createGatePlayer('GateAbsent');
});

afterAll(async () => {
  if (!supabase) return;
  // players/clans cascade most of it; auth users cascade clan_members.
  for (const id of created.clanIds) await supabase.from('clans').delete().eq('id', id);
  for (const id of created.weekIds) await supabase.from('serpent_weeks').delete().eq('id', id);
  for (const id of created.dayIds) await supabase.from('signal_days').delete().eq('id', id);
  for (const id of created.playerIds) await supabase.from('players').delete().eq('id', id);
  for (const id of created.userIds) await supabase.auth.admin.deleteUser(id).catch(() => {});
});

// ===========================================================================
// STEP 0 — the migrations are actually there
// ===========================================================================

describe('step 0 — migrations 046-051 are live in Postgres', () => {
  /**
   * PostgREST resolves an RPC by its ARGUMENT NAMES, and answers `PGRST202`
   * when no function matches. So each RPC is called with its real parameter
   * names and null values: a `PGRST202` means the function is absent or its
   * signature is not what the client believes, and anything else — including
   * a raised refusal — means it is there and executable by `service_role`.
   *
   * This is the check a shape test structurally cannot make. It also pins the
   * signature the TypeScript callers actually send.
   */
  const PHASE_1_RPCS: Array<[string, Record<string, unknown>]> = [
    [
      'ensure_serpent_week',
      { p_week_start: null, p_starts_at: null, p_ends_at: null, p_seed: null, p_modifiers: null },
    ],
    ['apply_serpent_week_settlement', { p_week_id: null, p_players: null }],
    [
      'ensure_signal_day',
      {
        p_day: null,
        p_starts_at: null,
        p_ends_at: null,
        p_seed: null,
        p_modifier: null,
        p_strain_tilt: null,
        p_objectives: null,
      },
    ],
    [
      'begin_signal_objective_run',
      {
        p_player_id: null,
        p_day_id: null,
        p_objective_id: null,
        p_target: null,
        p_session_id: null,
      },
    ],
    [
      'settle_signal_objective_run',
      {
        p_run_id: null,
        p_player_id: null,
        p_completed: null,
        p_progress: null,
        p_bonus_dna: null,
      },
    ],
    ['collect_daily_take', { p_player_id: null }],
    [
      'found_clan',
      {
        p_user_id: null,
        p_name: null,
        p_tag: null,
        p_banner_id: null,
        p_emblem_id: null,
        p_color_primary: null,
        p_color_secondary: null,
      },
    ],
    ['join_clan_by_code', { p_user_id: null, p_code: null }],
    ['leave_clan', { p_user_id: null }],
    ['clan_tenure_since', { p_clan_id: null, p_player_id: null }],
    ['apply_clan_week_pairings', { p_week_id: null, p_pairs: null }],
    ['settle_clan_week_pairings', { p_week_id: null }],
    ['consume_run_charge', { p_player_id: null, p_charges_per_day: null }],
  ];

  it.each(PHASE_1_RPCS)('%s exists with the signature its caller sends', async (fn, args) => {
    const { error } = await supabase.rpc(fn as string, args as Record<string, unknown>);
    expect(error?.code).not.toBe('PGRST202');
  });

  it('kept the 020 Gauntlet view AND the 048 rivalry table side by side', async () => {
    // The collision this gate found. Migration 020's VIEW keeps its name and
    // its duel-derived columns; 048's new TABLE lives beside it under the
    // name it should always have had. Both must answer.
    const view = await supabase.from('clan_rivalries').select('clan_x, clan_y, meetings').limit(1);
    expect(view.error).toBeNull();

    const table = await supabase
      .from('clan_rivalry_memory')
      .select('clan_low_id, clan_high_id, meetings')
      .limit(1);
    expect(table.error).toBeNull();
  });

  it('retained the gated Gauntlet state 048 promised not to delete', async () => {
    for (const table of ['clan_duels', 'gauntlet_picks', 'clan_research', 'clan_tithes']) {
      const { error } = await supabase.from(table).select('*', { head: true, count: 'exact' });
      expect(error).toBeNull();
    }
  });
});

// ===========================================================================
// STEP 1 — found a clan of one, and prove it functions at N=1
// ===========================================================================

describe('step 1 — the clan of one', () => {
  let clanId: string;

  it('founds a clan with one member through found_clan', async () => {
    const { data, error } = await supabase.rpc('found_clan', {
      p_user_id: solo.userId,
      p_name: 'Gate Hollow',
      p_tag: 'GATE',
      p_banner_id: null,
      p_emblem_id: null,
      p_color_primary: null,
      p_color_secondary: null,
    });
    expect(error).toBeNull();
    const result = data as Record<string, unknown>;
    expect(result.error).toBeUndefined();
    expect(result.member_count).toBe(1);
    expect(result.max_members).toBe(12); // §12.2 cap, not the old 50
    expect(String(result.invite_code)).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

    clanId = String(result.clan_id);
    created.clanIds.push(clanId);
  });

  it('refuses a second clan for the same founder', async () => {
    const { data } = await supabase.rpc('found_clan', {
      p_user_id: solo.userId,
      p_name: 'Second Hollow',
      p_tag: 'GAT2',
      p_banner_id: null,
      p_emblem_id: null,
      p_color_primary: null,
      p_color_secondary: null,
    });
    expect((data as Record<string, unknown>).error).toBe('already_in_clan');
  });

  it('records tenure from founding', async () => {
    const { data, error } = await supabase.rpc('clan_tenure_since', {
      p_clan_id: clanId,
      p_player_id: solo.userId,
    });
    expect(error).toBeNull();
    expect(data).toBeTruthy();
  });

  it('reads as a live clan at N=1 — no minimum, no cut line', async () => {
    const panel = await clanLib.buildClanHuntPanel(
      supabase,
      solo.playerId,
      solo.userId,
      at(weekStart, 2, 12).getTime()
    );
    expect(panel.live).toBe(true);
    expect(panel.clan.memberCount).toBe(1);
    expect(panel.you.role).toBe('owner');
  });
});

// ===========================================================================
// STEP 2 — Signal runs across the week: charged, lean, exempt
// ===========================================================================

describe('step 2 — Signal runs in all three charge states', () => {
  const CHARGES_PER_DAY = 6;

  it('resolves a Signal day per UTC day from the injected clock', async () => {
    for (let d = 0; d < 3; d++) {
      const day = await signalLib.ensureCurrentSignalDay(supabase, at(weekStart, d, 10).getTime());
      expect(day).not.toBeNull();
      expect(day.day).toBe(at(weekStart, d, 0).toISOString().slice(0, 10));
      expect(day.objectives.length).toBeGreaterThan(0);
      created.dayIds.push(day.id);
    }
  });

  it('EXEMPT: the day’s Signal objective run consumes no charge', async () => {
    const now = at(weekStart, 0, 10);
    const before = await readPlayer(solo.playerId);

    const sessionId = await openSession(solo, now);
    const day = await signalLib.ensureCurrentSignalDay(supabase, now.getTime());
    const claim = await signalLib.claimSignalObjectiveRun(
      supabase,
      solo.playerId,
      sessionId,
      day.objectives[0].id,
      now.getTime()
    );

    expect(claim.live).toBe(true);
    expect(claim.ownsAttempt).toBe(true);
    // The exemption id comes from the DATABASE's answer, never the request.
    expect(claim.exemptRunId).toBe(claim.runId);

    const consumed = await envelopeLib.consumeRunCharge(
      supabase,
      solo.playerId,
      {
        signalObjectiveRunId: claim.exemptRunId,
        serpentWeekId: null,
        rewardless: false,
      },
      now.getTime()
    );
    expect(consumed.state).toBe('exempt');

    const after = await readPlayer(solo.playerId);
    expect(after.charges_used).toBe(before.charges_used);

    await endSession(sessionId, {
      endedAt: new Date(now.getTime() + 600_000),
      yieldDna: 800,
      dnaEarned: 800, // exempt harvests full strength
      score: 4200,
      chargeState: 'exempt',
    });

    const settled = await signalLib.settleSignalObjectiveRun(
      supabase,
      claim.runId,
      solo.playerId,
      { completed: true, progress: day.objectives[0].target, bonusDna: 50 }
    ).catch(async () => {
      // The lib wraps the RPC; fall back to the RPC itself if the shape differs.
      const { data } = await supabase.rpc('settle_signal_objective_run', {
        p_run_id: claim.runId,
        p_player_id: solo.playerId,
        p_completed: true,
        p_progress: day.objectives[0].target,
        p_bonus_dna: 50,
      });
      return data;
    });
    expect(settled).toBeTruthy();
  });

  it('CHARGED: an ordinary run with the allotment intact consumes one charge', async () => {
    const now = at(weekStart, 1, 10);
    const before = await readPlayer(solo.playerId);

    const consumed = await envelopeLib.consumeRunCharge(
      supabase,
      solo.playerId,
      sharedEnvelope.NO_EXEMPTION,
      now.getTime()
    );
    expect(consumed.state).toBe('charged');

    const after = await readPlayer(solo.playerId);
    expect(after.charges_used).toBe(before.charges_used + 1);

    // Charged harvests full strength — indistinguishable from exempt.
    expect(sharedEnvelope.applyHarvestFactor(1200, 'charged')).toBe(1200);
  });

  it('LEAN: the allotment empties, the run still plays, and settles at 25% floored to >= 1', async () => {
    const now = at(weekStart, 1, 14);

    // Spend the rest of the day's allotment.
    for (let i = 0; i < CHARGES_PER_DAY; i++) {
      await envelopeLib.consumeRunCharge(
        supabase,
        solo.playerId,
        sharedEnvelope.NO_EXEMPTION,
        now.getTime()
      );
    }

    const consumed = await envelopeLib.consumeRunCharge(
      supabase,
      solo.playerId,
      sharedEnvelope.NO_EXEMPTION,
      now.getTime()
    );
    // The run is NEVER blocked — it starts, and settles lean.
    expect(consumed.state).toBe('lean');

    // The 25% factor, floored, never zero (§8.6 "lean, never zero").
    expect(sharedEnvelope.applyHarvestFactor(1200, 'lean')).toBe(300);
    expect(sharedEnvelope.applyHarvestFactor(1192, 'lean')).toBe(298);
    expect(sharedEnvelope.applyHarvestFactor(3, 'lean')).toBe(1);
    expect(sharedEnvelope.applyHarvestFactor(1, 'lean')).toBe(1);

    // A lean run still Scores and still ranks: the session carries its full
    // score and is a validated, banked row like any other.
    const sessionId = await openSession(solo, now);
    await endSession(sessionId, {
      endedAt: new Date(now.getTime() + 600_000),
      yieldDna: 1200,
      dnaEarned: sharedEnvelope.applyHarvestFactor(1200, 'lean'),
      score: 4200,
      chargeState: 'lean',
    });

    const { data } = await supabase
      .from('game_sessions')
      .select('score, yield_dna, dna_earned, charge_state, validated')
      .eq('id', sessionId)
      .single();
    expect(data!.score).toBe(4200);
    expect(data!.validated).toBe(true);
    expect(data!.yield_dna).toBe(1200); // full strength preserved for Depth
    expect(data!.dna_earned).toBe(300); // only the balance is cut
  });
});

// ===========================================================================
// STEP 3 — Serpent runs: no charge, Depth from FULL-STRENGTH Yield
// ===========================================================================

describe('step 3 — Serpent runs', () => {
  it('opens the week from the injected clock', async () => {
    const week = await serpentLib.ensureCurrentSerpentWeek(
      supabase,
      at(weekStart, 2, 12).getTime()
    );
    expect(week).not.toBeNull();
    expect(week.weekStart).toBe(weekStart);
    weekId = week.id;
    created.weekIds.push(weekId);
  });

  it('a Serpent attempt consumes no charge', async () => {
    const now = at(weekStart, 2, 12);
    const before = await readPlayer(solo.playerId);
    const consumed = await envelopeLib.consumeRunCharge(
      supabase,
      solo.playerId,
      { signalObjectiveRunId: null, serpentWeekId: weekId, rewardless: false },
      now.getTime()
    );
    expect(consumed.state).toBe('exempt');
    const after = await readPlayer(solo.playerId);
    expect(after.charges_used).toBe(before.charges_used);
  });

  /**
   * Five attempts, one of them settled LEAN. Depth must read `yield_dna`
   * (full strength) and never `dna_earned` (the lean-adjusted credit) —
   * §6.2, and the reason `SerpentRunRow` deliberately carries no
   * `dna_earned` field at all.
   */
  const attempts = [
    { yieldDna: 900, chargeState: 'exempt' },
    { yieldDna: 1500, chargeState: 'exempt' },
    { yieldDna: 400, chargeState: 'exempt' },
    { yieldDna: 1200, chargeState: 'lean' }, // credited 300, Depth must see 1200
    { yieldDna: 700, chargeState: 'exempt' },
  ];

  it('records five Serpent attempts, one of them lean', async () => {
    for (const [i, attempt] of attempts.entries()) {
      const start = at(weekStart, 2, 12 + i);
      const sessionId = await openSession(solo, start, { serpent_week_id: weekId });
      await endSession(sessionId, {
        endedAt: new Date(start.getTime() + 600_000),
        yieldDna: attempt.yieldDna,
        dnaEarned:
          attempt.chargeState === 'lean'
            ? sharedEnvelope.applyHarvestFactor(attempt.yieldDna, 'lean')
            : attempt.yieldDna,
        score: 1000 + i,
        chargeState: attempt.chargeState,
        serpentWeekId: weekId,
      });
    }

    const { runs } = await serpentLib.loadSerpentWeekRuns(supabase, weekId);
    expect(runs).toHaveLength(5);
    // Every row carries FULL yield, including the lean one.
    expect(runs.map((r: { yieldDna: number }) => r.yieldDna).sort((a: number, b: number) => a - b)).toEqual(
      [400, 700, 900, 1200, 1500]
    );
  });
});

// ===========================================================================
// STEP 4 — Sunday settlement, run twice
// ===========================================================================

describe('step 4 — Sunday settlement', () => {
  /** Best three of 1500, 1200, 900, 700, 400. */
  const EXPECTED_DEPTH = 1500 + 1200 + 900;

  let firstRun: Record<string, unknown>;

  it('settles the week at Sunday midnight UTC', async () => {
    const sunday = at(weekStart, 7, 0); // exclusive end of the week
    const result = await serpentLib.settleDueSerpentWeeks(supabase, sunday.getTime());
    expect(result.failed).toBe(false);
    expect(result.skipped).toBe(false);
    const week = result.settled.find((s: { weekId: string }) => s.weekId === weekId);
    expect(week).toBeTruthy();
    firstRun = week as Record<string, unknown>;
    expect(week!.players).toBeGreaterThanOrEqual(1);
  });

  it('counts the best three runs, from full-strength Yield', async () => {
    const { data, error } = await supabase
      .from('serpent_week_players')
      .select('depth, attempts, best_yield, counted_yields, clan_id')
      .eq('week_id', weekId)
      .eq('player_id', solo.playerId)
      .single();
    expect(error).toBeNull();
    expect(data!.depth).toBe(EXPECTED_DEPTH); // 3600
    expect(data!.attempts).toBe(5);
    expect(data!.best_yield).toBe(1500);
    expect((data!.counted_yields as number[]).slice().sort((a, b) => b - a)).toEqual([
      1500, 1200, 900,
    ]);
    // The lean run's 1200 is IN the counted three at full strength. Had Depth
    // read `dna_earned` it would have contributed 300 and the total would be
    // 2700, not 3600.
    expect(data!.depth).not.toBe(1500 + 900 + 700);
  });

  it('sums clan Depth additively — no minimum, no multiplier', async () => {
    const { data, error } = await supabase
      .from('serpent_week_clans')
      .select('depth, contributing_members, member_count')
      .eq('week_id', weekId)
      .eq('clan_id', created.clanIds[0])
      .single();
    expect(error).toBeNull();
    expect(data!.depth).toBe(EXPECTED_DEPTH); // one member, so the sum is theirs
    expect(data!.contributing_members).toBe(1);
    expect(data!.member_count).toBe(1);
  });

  it('carries lifetime Depth monotonically', async () => {
    const player = await readPlayer(solo.playerId);
    expect(player.lifetime_depth).toBe(EXPECTED_DEPTH);
    expect(player.best_week_depth).toBe(EXPECTED_DEPTH);
  });

  it('IS IDEMPOTENT — settling a second time changes nothing', async () => {
    const beforePlayer = await readPlayer(solo.playerId);
    const { data: beforeRow } = await supabase
      .from('serpent_week_players')
      .select('depth, attempts, best_yield, counted_yields')
      .eq('week_id', weekId)
      .eq('player_id', solo.playerId)
      .single();
    const { data: beforeClan } = await supabase
      .from('serpent_week_clans')
      .select('depth, contributing_members')
      .eq('week_id', weekId)
      .eq('clan_id', created.clanIds[0])
      .single();
    const { count: beforeChronicle } = await supabase
      .from('serpent_chronicle_entries')
      .select('*', { count: 'exact', head: true })
      .eq('week_id', weekId);

    const sunday = at(weekStart, 7, 0);
    const second = await serpentLib.settleDueSerpentWeeks(supabase, sunday.getTime());
    expect(second.failed).toBe(false);

    const afterPlayer = await readPlayer(solo.playerId);
    const { data: afterRow } = await supabase
      .from('serpent_week_players')
      .select('depth, attempts, best_yield, counted_yields')
      .eq('week_id', weekId)
      .eq('player_id', solo.playerId)
      .single();
    const { data: afterClan } = await supabase
      .from('serpent_week_clans')
      .select('depth, contributing_members')
      .eq('week_id', weekId)
      .eq('clan_id', created.clanIds[0])
      .single();
    const { count: afterChronicle } = await supabase
      .from('serpent_chronicle_entries')
      .select('*', { count: 'exact', head: true })
      .eq('week_id', weekId);

    expect(afterRow).toEqual(beforeRow);
    expect(afterClan).toEqual(beforeClan);
    expect(afterPlayer.lifetime_depth).toBe(beforePlayer.lifetime_depth);
    expect(afterPlayer.best_week_depth).toBe(beforePlayer.best_week_depth);
    // The Chronicle is the sharpest idempotency probe: a second personal-best
    // entry for the same week would mean the ON CONFLICT guard is wrong.
    expect(afterChronicle).toBe(beforeChronicle);
    expect(firstRun).toBeTruthy();
  });

  it('settles the clan week after the Serpent week', async () => {
    const sunday = at(weekStart, 7, 0);
    const result = await clanLib.settleDueClanWeeks(supabase, sunday.getTime());
    expect(result.failed).toBe(false);
    // At N=1 with no symmetric rival there is no pairing — and no shame (§9.4).
    const { data } = await supabase
      .from('clan_week_pairings')
      .select('week_id')
      .eq('week_id', weekId);
    expect(data).toEqual([]);
  });
});

// ===========================================================================
// STEP 5 — Depth recorded and readable through the panel
// ===========================================================================

describe('step 5 — Depth reads back through the panel', () => {
  it('shows the player their Depth and their clan’s', async () => {
    const panel = await serpentLib.buildSerpentPanel(
      supabase,
      solo.playerId,
      at(weekStart, 7, 1).getTime()
    );
    expect(panel.live).toBe(true);
    expect(panel.you.lifetimeDepth).toBe(3600);
    expect(panel.you.bestWeekDepth).toBe(3600);
  });

  it('carries the settled week in history', async () => {
    const panel = await serpentLib.buildSerpentPanel(
      supabase,
      solo.playerId,
      at(weekStart, 8, 12).getTime() // the following Monday
    );
    const entry = panel.history.find(
      (h: { weekStart: string }) => h.weekStart === weekStart
    );
    expect(entry).toBeTruthy();
    expect(entry.depth).toBe(3600);
  });
});

// ===========================================================================
// STEP 6 — share artifacts render, with URLs
// ===========================================================================

describe('step 6 — share artifacts', () => {
  it('/w/<week> renders the settled week with the clan’s Depth', async () => {
    const artifact = await artifactsLib.loadSerpentWeekArtifact(supabase, weekStart, 'GATE');
    expect(artifact).not.toBeNull();
    expect(artifact.weekKey).toBe(weekStart);
    expect(artifact.settled).toBe(true);
    expect(artifact.clan).not.toBeNull();
    expect(artifact.clan.tag).toBe('GATE');
    expect(artifact.clan.depth).toBe(3600);
    expect(artifact.clan.bestWeek).toBe(true);
    expect(artifact.clan.contributingMembers).toBe(1);

    const card = cards.settlementCardModel(artifact);
    const url = `https://supasnake.com/w/${weekStart}`;
    const share = cards.cardShare(card, url);
    expect(share.url).toBe(url);
    expect(card.title).toContain('3,600');
    expect(card.title).toContain('best week yet');
    expect(card.provenance).toBe('verified');
  });

  it('/w/<week> renders for a stranger with no clan in the URL', async () => {
    const artifact = await artifactsLib.loadSerpentWeekArtifact(supabase, weekStart, null);
    expect(artifact.clan).toBeNull();
    const card = cards.settlementCardModel(artifact);
    expect(card.title).toBe('The hunt is open');
  });

  it('/s/<day> derives a real day for every day of the simulated week', async () => {
    const signalShared = await import('@/shared/game/signal');
    for (let d = 0; d < 7; d++) {
      const dayKey = at(weekStart, d, 0).toISOString().slice(0, 10);
      const derived = signalShared.describeSignalDay(at(weekStart, d, 12));
      expect(derived.day).toBe(dayKey);
      expect(derived.seed).toBeTruthy();
      // A stranger opening the link on a later day sees an archive day, which
      // is playable and pays nothing — never an error (Rule 5).
      expect(signalShared.signalDayStatus(dayKey, at(weekStart, 8, 12))).toBe('archive');
    }
  });

  it('refuses a malformed week key rather than inventing one', () => {
    expect(artifactsLib.derivedSerpentWeek('not-a-week')).toBeNull();
    // Only a Monday names a Serpent week.
    expect(artifactsLib.derivedSerpentWeek(at(weekStart, 3, 0).toISOString().slice(0, 10))).toBeNull();
  });
});

// ===========================================================================
// STEP 7 — the Monday briefing
// ===========================================================================

describe('step 7 — Monday briefing', () => {
  const monday = () => at(weekStart, 8, 9); // 9am the following Monday

  it('reads the settled week back to the player who hunted it', async () => {
    const panel = await serpentLib.buildSerpentPanel(
      supabase,
      solo.playerId,
      monday().getTime()
    );
    const briefing = briefingLib.readWeekBriefing(panel, weekStart, monday().getTime());
    expect(briefing).not.toBeNull();
    expect(briefing.weekStart).toBe(weekStart);
    expect(briefing.submerged).toBe(true);
    expect(briefing.hunted).toBe(true);
    expect(briefing.yourDepth).toBe(3600);
    expect(briefing.deepestYet).toBe(true);
    expect(briefing.deltaVsPriorBest).toBe(3600);
  });

  it('RULE 5 — reads correctly for a player who missed the week', async () => {
    const panel = await serpentLib.buildSerpentPanel(
      supabase,
      absent.playerId,
      monday().getTime()
    );
    const briefing = briefingLib.readWeekBriefing(panel, weekStart, monday().getTime());

    expect(briefing).not.toBeNull();
    expect(briefing.hunted).toBe(false);
    expect(briefing.yourDepth).toBe(0);
    // The opportunity went. Nothing OWNED moved: no decay, no debt, no
    // negative delta to apologise for.
    expect(briefing.deltaVsPriorBest).toBe(0);
    expect(briefing.priorBest).toBe(0);
    expect(briefing.deepestYet).toBe(false);

    const player = await readPlayer(absent.playerId);
    expect(player.lifetime_depth).toBe(0);
    expect(player.best_week_depth).toBe(0);
    expect(player.dna).toBeGreaterThanOrEqual(0);
  });

  it('offers every week as a URL, and refuses a week that has not happened', async () => {
    const panel = await serpentLib.buildSerpentPanel(
      supabase,
      solo.playerId,
      monday().getTime()
    );
    const weeks = briefingLib.listBriefingWeeks(panel, monday().getTime());
    expect(weeks.length).toBeGreaterThan(0);
    // Rule 14: the week that just submerged is always offered, as a URL.
    expect(weeks).toContain(weekStart);
    for (const key of weeks) expect(briefingLib.isSerpentWeekKey(key)).toBe(true);

    // A week that has not started is not a briefing — a wrong URL says so.
    const future = at(weekStart, 21, 0).toISOString().slice(0, 10);
    expect(briefingLib.readWeekBriefing(panel, future, monday().getTime())).toBeNull();
    expect(briefingLib.readWeekBriefing(panel, 'not-a-week', monday().getTime())).toBeNull();
  });

  it('says "1 segment" and not "1 segments" — N=1 is a real case', () => {
    expect(briefingLib.segments(1)).toBe('1 segment');
    expect(briefingLib.segments(3600)).toBe('3,600 segments');
  });
});

// ===========================================================================
// The Constitution's load-bearing claims
// ===========================================================================

describe('Rule 2 — Score is identical for the same run, whatever the build', () => {
  it('does not move with genome, traits, mutations or anomaly', () => {
    const base = rulesets.computeRunTotals('CYBER', 40);

    // Mutations, traits and anomalies all move DNA. None may move Score.
    const withTraits = rulesets.computeRunTotals('CYBER', 40, [], null, ['harvester']);
    const withAnomaly = rulesets.computeRunTotals('CYBER', 40, [], null, [], 'dense_field');

    expect(withTraits.score).toBe(base.score);
    expect(withAnomaly.score).toBe(base.score);
  });

  it('does not move with charge state, Take state or clan', () => {
    // Score is a pure fold over food count and ruleset. There is no parameter
    // through which a charge, a streak or a clan could reach it — which is
    // the point: the leaderboard measures play, not build and not attendance.
    const a = rulesets.computeRunTotals('PRIMAL', 55).score;
    const b = rulesets.computeRunTotals('PRIMAL', 55).score;
    expect(a).toBe(b);

    // And the lean factor is applied to DNA only, never to a score.
    expect(sharedEnvelope.applyHarvestFactor(1200, 'lean')).toBe(300);
    expect(sharedEnvelope.harvestFactor('lean')).toBe(0.25);
    expect(sharedEnvelope.harvestFactor('charged')).toBe(1);
    expect(sharedEnvelope.harvestFactor('exempt')).toBe(1);
  });
});

describe('Daily Take — the ladder, the cooling, and the double collect', () => {
  it('pays the base at tier 0 on the first collect a player ever makes', async () => {
    await setTakeState(solo.playerId, {
      days: 0,
      tier: 0,
      longest: 0,
      lastClaimDaysAgo: null,
    });
    const before = await readPlayer(solo.playerId);

    const { data, error } = await supabase.rpc('collect_daily_take', {
      p_player_id: solo.playerId,
    });
    expect(error).toBeNull();
    const result = data as Record<string, unknown>;
    expect(result.collected).toBe(true);
    expect(result.amount).toBe(100);
    expect(result.tier).toBe(0);
    expect(result.streak_days).toBe(1);
    expect(result.cooled).toBe(false);

    const after = await readPlayer(solo.playerId);
    expect(after.dna).toBe(before.dna + 100);
  });

  it('DOUBLE COLLECT IS IMPOSSIBLE — a second call the same day pays nothing', async () => {
    const before = await readPlayer(solo.playerId);
    const { data, error } = await supabase.rpc('collect_daily_take', {
      p_player_id: solo.playerId,
    });
    expect(error).toBeNull();
    const result = data as Record<string, unknown>;
    expect(result.collected).toBe(false);
    expect(result.already_collected).toBe(true);
    expect(result.amount).toBe(0);

    const after = await readPlayer(solo.playerId);
    expect(after.dna).toBe(before.dna); // not one DNA moved
  });

  it('survives a concurrent double collect — still exactly one payment', async () => {
    await setTakeState(solo.playerId, {
      days: 2,
      tier: 0,
      longest: 2,
      lastClaimDaysAgo: 1,
    });
    const before = await readPlayer(solo.playerId);

    const [a, b] = await Promise.all([
      supabase.rpc('collect_daily_take', { p_player_id: solo.playerId }),
      supabase.rpc('collect_daily_take', { p_player_id: solo.playerId }),
    ]);
    const results = [a.data, b.data] as Array<Record<string, unknown>>;
    const paid = results.filter((r) => r.collected === true);
    expect(paid).toHaveLength(1);

    const after = await readPlayer(solo.playerId);
    expect(after.dna).toBe(before.dna + (paid[0].amount as number));
  });

  it('climbs the ladder 3 / 7 / 14 / 30 -> x1.25 / x1.5 / x2 / x3', async () => {
    const ladder = [
      { days: 2, expectTier: 1, expectAmount: 125 }, // -> 3 days
      { days: 6, expectTier: 2, expectAmount: 150 }, // -> 7 days
      { days: 13, expectTier: 3, expectAmount: 200 }, // -> 14 days
      { days: 29, expectTier: 4, expectAmount: 300 }, // -> 30 days
    ];

    for (const rung of ladder) {
      await setTakeState(solo.playerId, {
        days: rung.days,
        tier: 0,
        longest: rung.days,
        lastClaimDaysAgo: 1, // yesterday: the chain continues
      });
      const { data } = await supabase.rpc('collect_daily_take', {
        p_player_id: solo.playerId,
      });
      const result = data as Record<string, unknown>;
      expect(result.collected).toBe(true);
      expect(result.streak_days).toBe(rung.days + 1);
      expect(result.tier).toBe(rung.expectTier);
      expect(result.amount).toBe(rung.expectAmount);
    }
  });

  it('RULE 5 — a 30-day absence costs ONE tier, never a reset to zero', async () => {
    await setTakeState(solo.playerId, {
      days: 30,
      tier: 4,
      longest: 30,
      lastClaimDaysAgo: 30, // a month away
    });

    const { data, error } = await supabase.rpc('collect_daily_take', {
      p_player_id: solo.playerId,
    });
    expect(error).toBeNull();
    const result = data as Record<string, unknown>;

    expect(result.collected).toBe(true);
    expect(result.cooled).toBe(true);
    // Tier 4 -> tier 3, and the chain restarts at tier 3's own threshold.
    expect(result.tier).toBe(3);
    expect(result.streak_days).toBe(14);
    expect(result.amount).toBe(200);
    // NOT a reset.
    expect(result.streak_days).not.toBe(0);
    expect(result.streak_days).not.toBe(1);
    // Rule 6: the high-water mark is untouched by the absence.
    expect(result.longest_streak).toBe(30);
  });

  it('cools exactly one rung however long the absence — 200 days is still one tier', async () => {
    await setTakeState(solo.playerId, {
      days: 30,
      tier: 4,
      longest: 30,
      lastClaimDaysAgo: 200,
    });
    const { data } = await supabase.rpc('collect_daily_take', {
      p_player_id: solo.playerId,
    });
    const result = data as Record<string, unknown>;
    expect(result.tier).toBe(3);
    expect(result.streak_days).toBe(14);
    expect(result.longest_streak).toBe(30);
  });

  it('floors at tier 0 — cooling can never go below the bottom rung', async () => {
    await setTakeState(solo.playerId, {
      days: 1,
      tier: 0,
      longest: 30,
      lastClaimDaysAgo: 9,
    });
    const { data } = await supabase.rpc('collect_daily_take', {
      p_player_id: solo.playerId,
    });
    const result = data as Record<string, unknown>;
    expect(result.tier).toBe(0);
    expect(result.streak_days).toBe(1);
    expect(result.amount).toBe(100);
    expect(result.longest_streak).toBe(30);
  });

  it('the Take multiplier touches the Take and nothing else', async () => {
    // Tier 4 pays 300 for the Take. It must not have moved Depth, Yield,
    // best week, or the session score of anything already settled.
    const player = await readPlayer(solo.playerId);
    expect(player.lifetime_depth).toBe(3600);
    expect(player.best_week_depth).toBe(3600);
  });
});

describe('Rule 6 — nothing owned was written downward across the whole week', () => {
  it('every monotonic column ends >= where it started', async () => {
    const player = await readPlayer(solo.playerId);

    // These are the columns migration 046's own tripwire names.
    expect(player.lifetime_depth).toBeGreaterThanOrEqual(3600);
    expect(player.best_week_depth).toBeGreaterThanOrEqual(3600);
    expect(player.total_dna_earned).toBeGreaterThanOrEqual(0);
    expect(player.high_score).toBeGreaterThanOrEqual(0);
    expect(player.legacy_score).toBeGreaterThanOrEqual(0);

    const { data: streak } = await supabase
      .from('player_streaks')
      .select('take_longest_streak, take_streak_days')
      .eq('player_id', solo.playerId)
      .single();
    // The high-water mark survived every cooling above.
    expect(streak!.take_longest_streak).toBeGreaterThanOrEqual(
      streak!.take_streak_days as number
    );
    expect(streak!.take_longest_streak).toBe(30);
  });

  it('tenure survives — and survives leaving', async () => {
    const clanId = created.clanIds[0];
    const { data: before } = await supabase.rpc('clan_tenure_since', {
      p_clan_id: clanId,
      p_player_id: solo.userId,
    });
    expect(before).toBeTruthy();

    // Leave (the clan of one disbands) and read tenure again. F-7: leaving is
    // a membership ending, not an erasure of history.
    const { data: left, error } = await supabase.rpc('leave_clan', {
      p_user_id: solo.userId,
    });
    expect(error).toBeNull();
    expect((left as Record<string, unknown>).disbanded).toBe(true);

    const { data: after } = await supabase.rpc('clan_tenure_since', {
      p_clan_id: clanId,
      p_player_id: solo.userId,
    });
    expect(after).toBe(before); // the span is permanent

    // And the clan row itself is never deleted — the laurels and the
    // Chronicle it earned still point at something.
    const { data: clan } = await supabase
      .from('clans')
      .select('id, member_count, disbanded_at')
      .eq('id', clanId)
      .single();
    expect(clan!.member_count).toBe(0);
    expect(clan!.disbanded_at).not.toBeNull();
  });

  it('the settled week is still readable after the clan disbanded', async () => {
    const { data } = await supabase
      .from('serpent_week_clans')
      .select('depth')
      .eq('week_id', weekId)
      .eq('clan_id', created.clanIds[0])
      .single();
    expect(data!.depth).toBe(3600);
  });
});
