import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import {
  abandonContinuityRun,
  activateRun,
  assertTerminalRunLease,
  finalizeRunStart,
  fingerprintStartRequest,
  isValidStartRequestId,
  readActiveRun,
  RunContinuityError,
  saveRunCheckpoint,
  stageRunTerminalIntent,
  validateRunCheckpoint,
} from './runContinuity';
import {
  SNAKE_RULES_VERSION,
  SnakeGameLogic,
} from '@/lib/game/SnakeGameLogic';
import { sanitizeGenomeCapability } from '@/lib/game/genomeCapability';
import { RULESETS } from '@/shared/game/rulesets';

const START_ID = '7a604a42-9f57-4f50-9a36-a7c7e85dbb28';

function clientWithRpc(rpc: jest.Mock): SupabaseClient {
  return { rpc } as unknown as SupabaseClient;
}

function clientWithRowAndRpc(row: Record<string, unknown>, rpc: jest.Mock): SupabaseClient {
  const query = {
    select: jest.fn(),
    eq: jest.fn(),
    is: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue({ data: row, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return { from: jest.fn(() => query), rpc } as unknown as SupabaseClient;
}

describe('run continuity server contract', () => {
  it('accepts UUID start request ids and rejects identifiers a client could alias', () => {
    expect(isValidStartRequestId(START_ID)).toBe(true);
    expect(isValidStartRequestId('same-run')).toBe(false);
    expect(isValidStartRequestId('')).toBe(false);
    expect(isValidStartRequestId(null)).toBe(false);
  });

  it('fingerprints every material player-selected start field deterministically', () => {
    const start = {
      mode: 'earn' as const,
      snakeId: 'snake-1',
      energyCommitment: 6,
      confirmMaxEnergy: true,
      signalObjectiveId: null,
      ladderRung: 2,
    };
    expect(fingerprintStartRequest(start)).toBe(fingerprintStartRequest({ ...start }));
    expect(fingerprintStartRequest(start)).toMatch(/^[0-9a-f]{64}$/);
    expect(
      fingerprintStartRequest({ ...start, energyCommitment: 5 })
    ).not.toBe(fingerprintStartRequest(start));
    expect(
      fingerprintStartRequest({ ...start, snakeId: 'snake-2' })
    ).not.toBe(fingerprintStartRequest(start));
  });

  it('asks one database transaction to bind the manifest and Energy commitment', async () => {
    const manifest = { sessionId: 'session-1', traits: ['swift'] };
    const rpc = jest.fn().mockResolvedValue({ data: manifest, error: null });

    await expect(
      finalizeRunStart(clientWithRpc(rpc), {
        playerId: 'player-1',
        sessionId: 'session-1',
        startRequestId: START_ID,
        fingerprint: 'a'.repeat(64),
        requestedCommitment: 6,
        exemptionFacts: {
          rewardless: false,
          signalObjectiveRunId: null,
          serpentWeekId: null,
        },
        energyVisible: true,
        manifestBase: { traits: ['swift'] },
      })
    ).resolves.toEqual(manifest);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      'finalize_run_continuity_start',
      expect.objectContaining({
        p_player_id: 'player-1',
        p_session_id: 'session-1',
        p_start_request_id: START_ID,
        p_start_request_fingerprint: 'a'.repeat(64),
        p_commitment: 6,
        p_exempt: false,
        p_manifest_base: { traits: ['swift'] },
      })
    );
  });

  it('cannot spend Energy for an exempt run', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { sessionId: 'session-1', freePlay: true },
      error: null,
    });
    await finalizeRunStart(clientWithRpc(rpc), {
      playerId: 'player-1',
      sessionId: 'session-1',
      startRequestId: START_ID,
      fingerprint: 'b'.repeat(64),
      requestedCommitment: 6,
      exemptionFacts: {
        rewardless: true,
        signalObjectiveRunId: null,
        serpentWeekId: null,
      },
      energyVisible: false,
      manifestBase: { freePlay: true },
    });

    expect(rpc).toHaveBeenCalledWith(
      'finalize_run_continuity_start',
      expect.objectContaining({ p_commitment: 0, p_exempt: true })
    );
  });

  it('maps a replay with different settings to a stable conflict', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'start_request_conflict' },
    });
    await expect(
      finalizeRunStart(clientWithRpc(rpc), {
        playerId: 'player-1',
        sessionId: 'session-1',
        startRequestId: START_ID,
        fingerprint: 'c'.repeat(64),
        requestedCommitment: 1,
        exemptionFacts: {
          rewardless: false,
          signalObjectiveRunId: null,
          serpentWeekId: null,
        },
        energyVisible: true,
        manifestBase: {},
      })
    ).rejects.toMatchObject<Partial<RunContinuityError>>({
      reason: 'request_conflict',
    });
  });

  it('atomically activates with checkpoint one and an exclusive lease', async () => {
    const now = Date.now();
    const game = new SnakeGameLogic({
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'activation-seed',
    });
    game.prepare();
    const opening = game.exportCheckpoint(now);
    const manifest = {
      sessionId: 'session-1',
      simulation: {
        seed: 'activation-seed',
        version: 1,
        rulesVersion: SNAKE_RULES_VERSION,
      },
      runSnake: { dynasty: 'PRIMAL' },
    };
    const rpc = jest.fn().mockResolvedValue({
      data: {
        id: 'session-1',
        start_request_id: START_ID,
        start_request_fingerprint: 'd'.repeat(64),
        start_manifest: manifest,
        continuity_phase: 'active',
        continuity_activated_at: '2026-07-31T10:00:01.000Z',
        continuity_lease_epoch: 1,
        continuity_checkpoint: opening,
        continuity_checkpoint_revision: 1,
        continuity_checkpoint_saved_at: new Date(now).toISOString(),
        simulation_rules_version: SNAKE_RULES_VERSION,
        started_at: '2026-07-31T10:00:00.000Z',
        server_started_at: '2026-07-31T10:00:00.000Z',
        energy_committed: 6,
      },
      error: null,
    });

    await expect(
      activateRun(
        clientWithRowAndRpc({
          id: 'session-1',
          start_request_id: START_ID,
          start_manifest: manifest,
          continuity_phase: 'prepared',
          simulation_rules_version: SNAKE_RULES_VERSION,
          started_at: new Date(now - 1_000).toISOString(),
          server_started_at: new Date(now - 1_000).toISOString(),
          ended_at: null,
          end_reason: null,
        }, rpc),
        'player-1',
        'session-1',
        opening,
        now
      )
    ).resolves.toMatchObject({
      phase: 'active',
      energyCommitted: 6,
      canContinue: true,
      requiresAbandon: false,
      checkpointRevision: 1,
      leaseEpoch: 1,
    });
    expect(rpc).toHaveBeenCalledWith(
      'activate_run_continuity',
      expect.objectContaining({
        p_player_id: 'player-1',
        p_session_id: 'session-1',
        p_checkpoint: opening,
        p_checkpoint_digest: expect.stringMatching(/^[0-9a-f]{64}$/),
        p_lease_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        p_rules_version: SNAKE_RULES_VERSION,
      })
    );
  });

  it('binds live checkpoints to the server-issued simulation and time budget', () => {
    const now = Date.now();
    const game = new SnakeGameLogic({
      ruleset: RULESETS.CYBER,
      simulationSeed: 'server-seed',
    });
    game.prepare();
    const previous = game.exportCheckpoint(now - 1_000);
    game.activatePrepared(now - 1_000);
    game.tick();
    const checkpoint = game.exportCheckpoint(now);
    const manifest = {
      sessionId: 'session-1',
      simulation: {
        seed: 'server-seed',
        version: 1,
        rulesVersion: SNAKE_RULES_VERSION,
      },
      runSnake: { dynasty: 'CYBER' },
    };

    expect(
      validateRunCheckpoint(checkpoint, {
        manifest,
        startedAt: new Date(now - 1_000).toISOString(),
        now,
        previous,
      })
    ).toMatchObject({ state: { score: checkpoint.state.score } });

    expect(() =>
      validateRunCheckpoint(
        { ...checkpoint, rng: { ...checkpoint.rng, seed: checkpoint.rng.seed + 1 } },
        { manifest, startedAt: new Date(now - 1_000).toISOString(), now, previous }
      )
    ).toThrow('does not match its simulation');

    expect(() =>
      validateRunCheckpoint(
        {
          ...checkpoint,
          rng: {
            ...checkpoint.rng,
            state: (checkpoint.rng.state + 1) >>> 0,
          },
        },
        { manifest, startedAt: new Date(now - 1_000).toISOString(), now, previous }
      )
    ).toThrow('does not match its simulation');

    expect(() =>
      validateRunCheckpoint(
        {
          ...checkpoint,
          config: { ...checkpoint.config, traits: ['patient'] },
        },
        { manifest, startedAt: new Date(now - 1_000).toISOString(), now, previous }
      )
    ).toThrow('does not match its start manifest');

    expect(() =>
      validateRunCheckpoint(
        {
          ...checkpoint,
          privateState: { ...checkpoint.privateState, elapsedMs: 60_000 },
        },
        { manifest, startedAt: new Date(now - 1_000).toISOString(), now, previous }
      )
    ).toThrow('server time bound');
  });

  it('rejects a forged free decision hold in replay', () => {
    const now = Date.now();
    const game = new SnakeGameLogic({
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'forged-decision-hold',
    });
    game.prepare();
    const previous = game.exportCheckpoint(now);
    const forged = JSON.parse(JSON.stringify(previous)) as typeof previous;
    forged.privateState.replay.actions.push({
      tick: 0,
      kind: 'pause',
      hold: 'decision',
    });
    expect(() => validateRunCheckpoint(forged, {
      manifest: {
        sessionId: 'forged-hold',
        simulation: {
          seed: 'forged-decision-hold',
          version: 1,
          rulesVersion: SNAKE_RULES_VERSION,
        },
        runSnake: { dynasty: 'PRIMAL' },
      },
      startedAt: new Date(now).toISOString(),
      now,
      previous,
    })).toThrow('impossible replay transition');
  });

  it('uses a stable checkpoint digest when an accepted response is lost', async () => {
    const now = Date.now();
    const lease = 'checkpoint-response-loss-lease-token-0001';
    const game = new SnakeGameLogic({
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'checkpoint-response-loss',
    });
    game.prepare();
    const opening = game.exportCheckpoint(now - 1_000);
    game.activatePrepared(now - 1_000);
    game.tick();
    const proposal = game.exportCheckpoint(now);
    const manifest = {
      sessionId: 'session-loss',
      simulation: {
        seed: 'checkpoint-response-loss',
        version: 1,
        rulesVersion: SNAKE_RULES_VERSION,
      },
      runSnake: { dynasty: 'PRIMAL' },
    };
    const baseRow = {
      id: 'session-loss',
      start_request_id: START_ID,
      start_manifest: manifest,
      continuity_phase: 'active',
      continuity_activated_at: new Date(now - 1_000).toISOString(),
      continuity_checkpoint: opening,
      continuity_checkpoint_revision: 1,
      continuity_lease_hash: createHash('sha256').update(lease).digest('hex'),
      simulation_rules_version: SNAKE_RULES_VERSION,
      started_at: new Date(now - 2_000).toISOString(),
      server_started_at: new Date(now - 2_000).toISOString(),
      ended_at: null,
      end_reason: null,
    };
    const firstRpc = jest.fn().mockImplementation(async (_name, params) => ({
      data: { revision: 2, savedAt: new Date(now).toISOString(), digest: params.p_checkpoint_digest },
      error: null,
    }));
    await saveRunCheckpoint(clientWithRowAndRpc(baseRow, firstRpc), {
      playerId: 'player-1',
      sessionId: 'session-loss',
      expectedRevision: 1,
      checkpoint: proposal,
      leaseToken: lease,
      now,
    });
    const firstArgs = firstRpc.mock.calls[0][1] as Record<string, unknown>;
    const retryRpc = jest.fn().mockImplementation(async (_name, params) => ({
      data: { revision: 2, savedAt: new Date(now).toISOString(), digest: params.p_checkpoint_digest },
      error: null,
    }));
    await saveRunCheckpoint(clientWithRowAndRpc({
      ...baseRow,
      continuity_checkpoint: firstArgs.p_checkpoint,
      continuity_checkpoint_revision: 2,
      continuity_checkpoint_digest: firstArgs.p_checkpoint_digest,
    }, retryRpc), {
      playerId: 'player-1',
      sessionId: 'session-loss',
      expectedRevision: 1,
      checkpoint: proposal,
      leaseToken: lease,
      now: now + 5_000,
    });
    expect(retryRpc.mock.calls[0][1]).toMatchObject({
      p_expected_revision: 1,
      p_checkpoint_digest: firstArgs.p_checkpoint_digest,
    });
  });

  it('rebases a terminal suffix over a checkpoint whose response was lost', async () => {
    const now = Date.now();
    const lease = 'terminal-rebase-lease-token-with-enough-entropy';
    const game = new SnakeGameLogic({
      gridSize: 4,
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'terminal-rebase',
    });
    game.prepare();
    const opening = game.exportCheckpoint(now - 1_000);
    game.activatePrepared(now - 1_000);
    game.tick();
    const newerCheckpoint = game.exportCheckpoint(now - 500);
    game.tick();
    expect(game.getState().isGameOver).toBe(true);
    const terminalTrace = game.getReplayTrace();
    const proof = {
      fromTick: opening.privateState.replay.ticks,
      toTick: terminalTrace.ticks,
      actionOffset: opening.privateState.replay.actions.length,
      actions: terminalTrace.actions.slice(opening.privateState.replay.actions.length),
    };
    const rpc = jest.fn().mockResolvedValue({
      data: { accepted: true, inserted: true },
      error: null,
    });
    const intent = await stageRunTerminalIntent(clientWithRowAndRpc({
      id: 'terminal-rebase',
      start_request_id: START_ID,
      start_manifest: {
        sessionId: 'terminal-rebase',
        simulation: {
          seed: 'terminal-rebase',
          version: 1,
          rulesVersion: SNAKE_RULES_VERSION,
        },
        runSnake: { dynasty: 'PRIMAL' },
      },
      continuity_phase: 'active',
      continuity_activated_at: new Date(now - 1_000).toISOString(),
      continuity_checkpoint: newerCheckpoint,
      continuity_checkpoint_revision: 2,
      continuity_lease_hash: createHash('sha256').update(lease).digest('hex'),
      simulation_rules_version: SNAKE_RULES_VERSION,
      started_at: new Date(now - 2_000).toISOString(),
      ended_at: null,
      end_reason: null,
    }, rpc), {
      playerId: 'player-1',
      sessionId: 'terminal-rebase',
      expectedRevision: 1,
      leaseToken: lease,
      replay: proof,
      now,
    });
    expect(intent.facts).not.toHaveProperty('replay');
    expect(Buffer.byteLength(JSON.stringify(intent.facts), 'utf8'))
      .toBeLessThanOrEqual(262_144);
    expect(rpc).toHaveBeenCalledWith(
      'stage_run_continuity_terminal',
      expect.objectContaining({ p_expected_revision: 2 })
    );
  });

  it('refuses a checkpoint that rewinds accepted progress', () => {
    const now = Date.now();
    const game = new SnakeGameLogic({
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'monotonic-seed',
    });
    game.start();
    const previous = game.exportCheckpoint(now);
    const rewind = {
      ...previous,
      privateState: { ...previous.privateState, elapsedMs: 0 },
    };
    expect(() =>
      validateRunCheckpoint(rewind, {
        manifest: {
          sessionId: 'session-1',
          simulation: {
            seed: 'monotonic-seed',
            version: 1,
            rulesVersion: SNAKE_RULES_VERSION,
          },
          runSnake: { dynasty: 'PRIMAL' },
        },
        startedAt: new Date(now - 1_000).toISOString(),
        now,
        previous: {
          ...previous,
          privateState: { ...previous.privateState, elapsedMs: 500 },
        },
      })
    ).toThrow('rewind accepted progress');
  });

  it('accepts genome-only genes and keeps legacy length derivation separate', () => {
    const now = Date.now();
    const genome = sanitizeGenomeCapability({
      runSeed: 'genome-run-seed',
      heirloom: {},
      genePool: ['loan_shark', 'overgrowth', 'time_dilation'],
      lineage: null,
      anomalyStrain: null,
      suppressedStrains: [],
      strainThresholdDelta: {},
      prevRunDied: false,
      ftue: {
        bankedRuns: 20,
        strainTagsUnlocked: true,
        expressionsUnlocked: true,
        infuseUnlocked: true,
        spawnPointsUnlocked: true,
        splicesUnlocked: true,
        apexesUnlocked: true,
      },
    })!;
    const genomeGame = new SnakeGameLogic({
      ruleset: RULESETS.COSMIC,
      genome,
      simulationSeed: 'genome-simulation-seed',
    });
    genomeGame.prepare();
    const genomeCheckpoint = genomeGame.exportCheckpoint(now);
    const genomeManifest = {
      sessionId: 'genome-session',
      simulation: {
        seed: 'genome-simulation-seed',
        version: 1,
        rulesVersion: SNAKE_RULES_VERSION,
      },
      runSnake: { dynasty: 'COSMIC' },
      traits: genomeCheckpoint.config.traits,
      mutationPool: genomeCheckpoint.config.mutationPool,
      genome: genomeCheckpoint.config.genome,
    };
    expect(validateRunCheckpoint(genomeCheckpoint, {
      manifest: genomeManifest,
      startedAt: new Date(now - 1_000).toISOString(),
      now,
      opening: true,
    })).toMatchObject({ config: { genome } });

    const legacyGame = new SnakeGameLogic({
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'legacy-simulation-seed',
    });
    legacyGame.prepare();
    const legacyCheckpoint = legacyGame.exportCheckpoint(now);
    expect(legacyCheckpoint.privateState.fusedView).toEqual({
      loose: [],
      splices: [],
    });
    expect(validateRunCheckpoint(legacyCheckpoint, {
      manifest: {
        sessionId: 'legacy-session',
        simulation: {
          seed: 'legacy-simulation-seed',
          version: 1,
          rulesVersion: SNAKE_RULES_VERSION,
        },
        runSnake: { dynasty: 'PRIMAL' },
        traits: legacyCheckpoint.config.traits,
        mutationPool: legacyCheckpoint.config.mutationPool,
      },
      startedAt: new Date(now - 1_000).toISOString(),
      now,
      opening: true,
    })).toMatchObject({ config: { genome: null } });
  });

  it.each([
    ['disconnected body', (checkpoint: ReturnType<SnakeGameLogic['exportCheckpoint']>) => {
      checkpoint.state.snake[1] = { x: 0, y: 0, z: 0 };
    }],
    ['food on the body', (checkpoint: ReturnType<SnakeGameLogic['exportCheckpoint']>) => {
      checkpoint.state.food = { ...checkpoint.state.snake[0] };
      checkpoint.state.foods = [{ ...checkpoint.state.snake[0] }];
    }],
    ['authored run state', (checkpoint: ReturnType<SnakeGameLogic['exportCheckpoint']>) => {
      checkpoint.privateState.drivenRun = true;
    }],
    ['forged slow tick speed', (checkpoint: ReturnType<SnakeGameLogic['exportCheckpoint']>) => {
      checkpoint.privateState.speed = 10_000;
    }],
    ['forged tactical hold budget', (checkpoint: ReturnType<SnakeGameLogic['exportCheckpoint']>) => {
      checkpoint.state.holdBudget += 100;
    }],
  ])('rejects checkpoint tampering with %s', (_label, tamper) => {
    const now = Date.now();
    const game = new SnakeGameLogic({
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'tamper-seed',
    });
    game.start();
    const checkpoint = game.exportCheckpoint(now);
    tamper(checkpoint);
    expect(() => validateRunCheckpoint(checkpoint, {
      manifest: {
        sessionId: 'tamper-session',
        simulation: {
          seed: 'tamper-seed',
          version: 1,
          rulesVersion: SNAKE_RULES_VERSION,
        },
        runSnake: { dynasty: 'PRIMAL' },
      },
      startedAt: new Date(now - 1_000).toISOString(),
      now,
    })).toThrow(RunContinuityError);
  });

  it('lets only the newest in-memory lease terminalize an activated run', () => {
    const lease = 'exclusive-run-lease-token-with-enough-entropy';
    const row = {
      start_request_id: START_ID,
      continuity_phase: 'active',
      continuity_checkpoint: { version: 1 },
      continuity_checkpoint_revision: 1,
      continuity_lease_hash: createHash('sha256').update(lease).digest('hex'),
    };
    expect(() => assertTerminalRunLease(row, lease)).not.toThrow();
    expect(() => assertTerminalRunLease(row, `${lease}-stale`)).toThrow(
      'open in a newer session'
    );
    expect(() =>
      assertTerminalRunLease(
        { start_request_id: null, continuity_phase: null },
        null
      )
    ).not.toThrow();
  });

  it('surfaces a durable terminal envelope as settling and never abandonable', async () => {
    const rpc = jest.fn();
    const row = {
      id: 'session-1',
      start_request_id: START_ID,
      start_manifest: { sessionId: 'session-1' },
      simulation_rules_version: SNAKE_RULES_VERSION,
      continuity_phase: 'active',
      continuity_checkpoint: { version: 1 },
      continuity_checkpoint_revision: 4,
      continuity_lease_epoch: 1,
      energy_committed: 6,
      started_at: '2026-07-31T10:00:00.000Z',
      server_started_at: '2026-07-31T10:00:00.000Z',
      ended_at: null,
      end_reason: 'completed',
    };
    await expect(readActiveRun(clientWithRowAndRpc(row, rpc), 'player-1'))
      .resolves.toMatchObject({
        sessionId: 'session-1',
        phase: 'settling',
        canContinue: false,
        requiresAbandon: false,
      });

    await expect(abandonContinuityRun(clientWithRpc(rpc), {
      playerId: 'player-1',
      sessionId: 'session-1',
      phase: 'settling',
      leaseToken: 'exclusive-run-lease-token-with-enough-entropy',
    })).rejects.toMatchObject<Partial<RunContinuityError>>({
      reason: 'not_prepared',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('surfaces an interrupted preparing shell for explicit zero-spend release', async () => {
    const row = {
      id: 'preparing-session',
      start_request_id: START_ID,
      start_manifest: null,
      simulation_rules_version: SNAKE_RULES_VERSION,
      continuity_phase: 'preparing',
      continuity_checkpoint: null,
      continuity_checkpoint_revision: 0,
      continuity_lease_epoch: 0,
      energy_committed: 0,
      started_at: '2026-07-31T10:00:00.000Z',
      server_started_at: '2026-07-31T10:00:00.000Z',
      ended_at: null,
      end_reason: null,
    };
    await expect(readActiveRun(
      clientWithRowAndRpc(row, jest.fn()),
      'player-1'
    )).resolves.toMatchObject({
      sessionId: 'preparing-session',
      phase: 'preparing',
      energyCommitted: 0,
      canContinue: false,
      requiresAbandon: true,
    });

    const rpc = jest.fn().mockResolvedValue({
      data: { accepted: true, endReason: 'abandoned' },
      error: null,
    });
    await abandonContinuityRun(clientWithRpc(rpc), {
      playerId: 'player-1',
      sessionId: 'preparing-session',
      phase: 'preparing',
      leaseToken: null,
    });
    expect(rpc).toHaveBeenCalledWith('abandon_run_continuity', expect.objectContaining({
      p_session_id: 'preparing-session',
      p_lease_hash: null,
    }));
  });

  it('lets immutable terminal facts outrank a later rules-version bump', async () => {
    await expect(readActiveRun(clientWithRowAndRpc({
      id: 'old-terminal',
      start_request_id: START_ID,
      start_manifest: { sessionId: 'old-terminal' },
      simulation_rules_version: 'snake-rules-older',
      continuity_phase: 'terminal',
      continuity_checkpoint: { version: 1 },
      continuity_checkpoint_revision: 3,
      continuity_terminal_facts: { score: 12 },
      continuity_terminal_digest: 'a'.repeat(64),
      continuity_lease_epoch: 1,
      energy_committed: 6,
      started_at: '2026-07-31T10:00:00.000Z',
      ended_at: null,
      end_reason: null,
    }, jest.fn()), 'player-1')).resolves.toMatchObject({
      phase: 'terminal',
      canContinue: false,
      requiresAbandon: false,
    });

    await expect(readActiveRun(clientWithRowAndRpc({
      id: 'old-active',
      start_request_id: START_ID,
      start_manifest: { sessionId: 'old-active' },
      simulation_rules_version: 'snake-rules-older',
      continuity_phase: 'active',
      continuity_checkpoint: { version: 1 },
      continuity_checkpoint_revision: 3,
      continuity_lease_epoch: 1,
      energy_committed: 6,
      started_at: '2026-07-31T10:00:00.000Z',
      ended_at: null,
      end_reason: null,
    }, jest.fn()), 'player-1')).resolves.toMatchObject({
      phase: 'incompatible',
      canContinue: false,
      requiresAbandon: true,
    });
  });

  it('classifies a legacy open completed row as settling, not abandonable', async () => {
    await expect(readActiveRun(clientWithRowAndRpc({
      id: 'legacy-pending',
      start_request_id: null,
      start_manifest: null,
      simulation_rules_version: null,
      continuity_phase: null,
      continuity_checkpoint: null,
      continuity_checkpoint_revision: 0,
      continuity_lease_epoch: 0,
      energy_committed: 1,
      started_at: '2026-07-31T10:00:00.000Z',
      server_started_at: '2026-07-31T10:00:00.000Z',
      ended_at: null,
      end_reason: 'completed',
    }, jest.fn()), 'player-1')).resolves.toMatchObject({
      phase: 'settling',
      canContinue: false,
      requiresAbandon: false,
    });
  });
});
