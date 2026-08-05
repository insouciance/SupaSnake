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
  stageContinuityRunEnd,
  stageRunTerminalIntent,
  validateRunCheckpoint,
} from './runContinuity';
import {
  GENOME_V2_INTERACTION_AUTO_OFFER,
  GENOME_V2_INTERACTION_PHYSICAL_RELIC,
} from '@/shared/game/genomeV2';
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
    expect(
      fingerprintStartRequest({
        ...start,
        genomeInteractionVersion: GENOME_V2_INTERACTION_AUTO_OFFER,
      })
    ).toBe(fingerprintStartRequest(start));
    expect(
      fingerprintStartRequest({
        ...start,
        genomeInteractionVersion: GENOME_V2_INTERACTION_PHYSICAL_RELIC,
      })
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

  it('preserves cumulative active time across an offline resume and later saves', () => {
    const activatedAt = Date.UTC(2026, 7, 2, 8, 0, 0);
    const offlineGapMs = 3 * 60 * 60 * 1_000;
    const manifest = {
      sessionId: 'offline-resume',
      simulation: {
        seed: 'offline-resume-seed',
        version: 1,
        rulesVersion: SNAKE_RULES_VERSION,
      },
      runSnake: { dynasty: 'PRIMAL' },
    };
    const startedAt = new Date(activatedAt).toISOString();
    const game = new SnakeGameLogic({
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'offline-resume-seed',
    });
    game.prepare();
    const opening = game.exportCheckpoint(activatedAt);
    game.activatePrepared(activatedAt);
    game.tick();

    const firstProposal = game.exportCheckpoint(activatedAt + 1_000);
    const firstAccepted = validateRunCheckpoint(firstProposal, {
      manifest,
      startedAt,
      now: activatedAt + 1_000,
      previous: opening,
    });
    expect(firstAccepted.privateState.elapsedMs).toBe(1_000);

    const resumedAt = activatedAt + offlineGapMs;
    const resumed = new SnakeGameLogic({
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'offline-resume-seed',
    });
    resumed.prepare();
    resumed.restoreCheckpoint(firstAccepted, resumedAt, {
      replacePreparedOpening: true,
    });

    resumed.tick();
    const resumedProposal = resumed.exportCheckpoint(resumedAt + 1_000);
    const resumedAccepted = validateRunCheckpoint(resumedProposal, {
      manifest,
      startedAt,
      now: resumedAt + 1_000,
      previous: firstAccepted,
    });
    expect(resumedAccepted.privateState.elapsedMs).toBe(2_000);

    resumed.tick();
    const thirdProposal = resumed.exportCheckpoint(resumedAt + 2_000);
    const thirdAccepted = validateRunCheckpoint(thirdProposal, {
      manifest,
      startedAt,
      now: resumedAt + 2_000,
      previous: resumedAccepted,
    });
    expect(thirdAccepted.privateState.elapsedMs).toBe(3_000);

    resumed.tick();
    const fourthProposal = resumed.exportCheckpoint(resumedAt + 3_000);
    const fourthAccepted = validateRunCheckpoint(fourthProposal, {
      manifest,
      startedAt,
      now: resumedAt + 3_000,
      previous: thirdAccepted,
    });
    expect(fourthAccepted.privateState.elapsedMs).toBe(4_000);
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
      activeElapsedMs: 1_000,
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
      continuity_checkpoint_saved_at: new Date(now - 500).toISOString(),
      continuity_lease_issued_at: new Date(now - 1_000).toISOString(),
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
    expect(intent.facts.duration_seconds).toBe(1);
    expect(Buffer.byteLength(JSON.stringify(intent.facts), 'utf8'))
      .toBeLessThanOrEqual(262_144);
    expect(rpc).toHaveBeenCalledWith(
      'stage_run_continuity_terminal',
      expect.objectContaining({ p_expected_revision: 2 })
    );

    const sameSecondLaterIntent = await stageRunTerminalIntent(clientWithRowAndRpc({
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
      continuity_checkpoint_saved_at: new Date(now - 500).toISOString(),
      continuity_lease_issued_at: new Date(now - 1_000).toISOString(),
      continuity_lease_hash: createHash('sha256').update(lease).digest('hex'),
      simulation_rules_version: SNAKE_RULES_VERSION,
      started_at: new Date(now - 2_000).toISOString(),
      ended_at: null,
      end_reason: null,
    }, jest.fn().mockResolvedValue({
      data: { accepted: true, inserted: true },
      error: null,
    })), {
      playerId: 'player-1',
      sessionId: 'terminal-rebase',
      expectedRevision: 2,
      leaseToken: lease,
      replay: { ...proof, activeElapsedMs: 1_500 },
      now: now + 500,
    });
    expect(sameSecondLaterIntent.facts.duration_seconds).toBe(1);
    expect(sameSecondLaterIntent.digest).not.toBe(intent.digest);
  });

  it('settles terminal duration from cumulative active time after a long offline gap', async () => {
    const activatedAt = Date.UTC(2026, 7, 2, 8, 0, 0);
    const resumedAt = activatedAt + 3 * 60 * 60 * 1_000;
    const lease = 'offline-terminal-lease-token-with-enough-entropy';
    const game = new SnakeGameLogic({
      gridSize: 4,
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'offline-terminal',
    });
    game.prepare();
    game.activatePrepared(activatedAt);
    game.tick();
    const checkpoint = game.exportCheckpoint(activatedAt + 1_000);

    const resumed = new SnakeGameLogic({
      gridSize: 4,
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'offline-terminal',
    });
    resumed.prepare();
    resumed.restoreCheckpoint(checkpoint, resumedAt, {
      replacePreparedOpening: true,
    });
    resumed.tick();
    expect(resumed.getState().isGameOver).toBe(true);
    const terminalTrace = resumed.getReplayTrace();
    const rpc = jest.fn().mockResolvedValue({
      data: { accepted: true, inserted: true },
      error: null,
    });
    const row = {
      id: 'offline-terminal',
      start_request_id: START_ID,
      start_manifest: {
        sessionId: 'offline-terminal',
        simulation: {
          seed: 'offline-terminal',
          version: 1,
          rulesVersion: SNAKE_RULES_VERSION,
        },
        runSnake: { dynasty: 'PRIMAL' },
      },
      continuity_phase: 'active',
      continuity_activated_at: new Date(activatedAt).toISOString(),
      continuity_checkpoint: checkpoint,
      continuity_checkpoint_revision: 2,
      continuity_checkpoint_saved_at: new Date(activatedAt + 1_000).toISOString(),
      continuity_lease_issued_at: new Date(resumedAt).toISOString(),
      continuity_lease_hash: createHash('sha256').update(lease).digest('hex'),
      simulation_rules_version: SNAKE_RULES_VERSION,
      started_at: new Date(activatedAt - 1_000).toISOString(),
      ended_at: null,
      end_reason: null,
    };
    const replay = {
      fromTick: checkpoint.privateState.replay.ticks,
      toTick: terminalTrace.ticks,
      actionOffset: checkpoint.privateState.replay.actions.length,
      actions: terminalTrace.actions.slice(checkpoint.privateState.replay.actions.length),
      activeElapsedMs: 2_000,
    };

    const intent = await stageRunTerminalIntent(
      clientWithRowAndRpc(row, rpc),
      {
        playerId: 'player-1',
        sessionId: 'offline-terminal',
        expectedRevision: 2,
        leaseToken: lease,
        replay,
        now: resumedAt + 1_000,
      }
    );

    expect(intent.facts.duration_seconds).toBe(2);
    expect(intent.facts.duration_seconds).not.toBe(10_801);

    const legacyReplay = { ...replay };
    delete legacyReplay.activeElapsedMs;
    const legacyIntent = await stageRunTerminalIntent(
      clientWithRowAndRpc(row, jest.fn().mockResolvedValue({
        data: { accepted: true, inserted: true },
        error: null,
      })),
      {
        playerId: 'player-1',
        sessionId: 'offline-terminal',
        expectedRevision: 2,
        leaseToken: lease,
        replay: legacyReplay,
        now: resumedAt + 1_000,
      }
    );
    // A pre-cutover browser can still settle, but receives only the accepted
    // second plus the terminal suffix's physical minimum — never three offline
    // hours and never an unbounded client claim.
    expect(legacyIntent.facts.duration_seconds).toBe(1);
    expect(legacyIntent.digest).not.toBe(intent.digest);
  });

  it('rejects terminal active time that rewinds or outruns the current lease window', async () => {
    const now = Date.UTC(2026, 7, 2, 12, 0, 0);
    const lease = 'terminal-time-bound-lease-with-enough-entropy';
    const game = new SnakeGameLogic({
      gridSize: 4,
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'terminal-time-bound',
    });
    game.prepare();
    game.activatePrepared(now - 2_000);
    game.tick();
    const checkpoint = game.exportCheckpoint(now - 1_000);
    game.tick();
    const terminalTrace = game.getReplayTrace();
    const row = {
      id: 'terminal-time-bound',
      start_request_id: START_ID,
      start_manifest: {
        sessionId: 'terminal-time-bound',
        simulation: {
          seed: 'terminal-time-bound',
          version: 1,
          rulesVersion: SNAKE_RULES_VERSION,
        },
        runSnake: { dynasty: 'PRIMAL' },
      },
      continuity_phase: 'active',
      continuity_activated_at: new Date(now - 2_000).toISOString(),
      continuity_checkpoint: checkpoint,
      continuity_checkpoint_revision: 2,
      continuity_checkpoint_saved_at: new Date(now - 1_000).toISOString(),
      continuity_lease_issued_at: new Date(now - 1_000).toISOString(),
      continuity_lease_hash: createHash('sha256').update(lease).digest('hex'),
      simulation_rules_version: SNAKE_RULES_VERSION,
      started_at: new Date(now - 3_000).toISOString(),
      ended_at: null,
      end_reason: null,
    };
    const baseReplay = {
      fromTick: checkpoint.privateState.replay.ticks,
      toTick: terminalTrace.ticks,
      actionOffset: checkpoint.privateState.replay.actions.length,
      actions: terminalTrace.actions.slice(checkpoint.privateState.replay.actions.length),
    };
    const stage = (activeElapsedMs: number) => stageRunTerminalIntent(
      clientWithRowAndRpc(row, jest.fn().mockResolvedValue({
        data: { accepted: true, inserted: true },
        error: null,
      })),
      {
        playerId: 'player-1',
        sessionId: 'terminal-time-bound',
        expectedRevision: 2,
        leaseToken: lease,
        replay: { ...baseReplay, activeElapsedMs },
        now,
      }
    );

    // CE-3: the BOUND still refuses both claims — a rewound clock and a clock
    // 12 seconds ahead of the server both fail to prove the terminal. What
    // changed is the consequence. Neither answer is the client's: both settle
    // the accepted checkpoint's own second, so the inflated claim buys exactly
    // nothing, and the run is not destroyed for having made it.
    const rewound = await stage(999);
    const outrun = await stage(12_001);
    for (const intent of [rewound, outrun]) {
      expect(intent.held).toBe(true);
      expect(intent.facts.review).toMatchObject({
        reason: 'invalid_checkpoint',
        heldFrom: 'accepted_checkpoint',
      });
      expect(intent.facts.review?.detail).toContain('server time bound');
      expect(intent.facts.duration_seconds).toBe(
        Math.floor(checkpoint.privateState.elapsedMs / 1_000)
      );
    }
    expect(outrun.facts.duration_seconds).not.toBe(12);
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

  it('retains the immutable Free Play class when a terminal manifest is hidden', async () => {
    await expect(readActiveRun(clientWithRowAndRpc({
      id: 'terminal-free-run',
      start_request_id: START_ID,
      start_manifest: { sessionId: 'terminal-free-run', freePlay: true },
      simulation_rules_version: SNAKE_RULES_VERSION,
      continuity_phase: 'terminal',
      continuity_checkpoint: null,
      continuity_checkpoint_revision: 4,
      continuity_terminal_facts: { score: 12 },
      continuity_terminal_digest: 'a'.repeat(64),
      continuity_lease_epoch: 1,
      energy_committed: 0,
      started_at: '2026-07-31T10:00:00.000Z',
      ended_at: null,
      end_reason: null,
    }, jest.fn()), 'player-1')).resolves.toMatchObject({
      phase: 'terminal',
      freePlay: true,
      manifest: null,
      canContinue: false,
      requiresAbandon: false,
    });
  });

  it('keeps a run with no canonical base fatal — there is nothing to hold', async () => {
    // The one refusal CE-3 deliberately did NOT degrade. Holding means
    // "settle what the server proved"; with no accepted checkpoint it proved
    // nothing, so a hold would close the run at zero — the very voiding this
    // work package exists to stop. The row stays open for the sweep instead.
    await expect(stageRunTerminalIntent(clientWithRowAndRpc({
      id: 'no-base',
      start_request_id: START_ID,
      start_manifest: { sessionId: 'no-base' },
      continuity_phase: 'active',
      continuity_activated_at: null,
      continuity_checkpoint: null,
      continuity_checkpoint_revision: 2,
      continuity_lease_hash: createHash('sha256')
        .update('no-base-lease-token-with-sufficient-entropy')
        .digest('hex'),
      simulation_rules_version: SNAKE_RULES_VERSION,
      started_at: new Date().toISOString(),
      ended_at: null,
      end_reason: null,
    }, jest.fn()), {
      playerId: 'player-1',
      sessionId: 'no-base',
      expectedRevision: 2,
      leaseToken: 'no-base-lease-token-with-sufficient-entropy',
      replay: { fromTick: 0, toTick: 0, actionOffset: 0, actions: [] },
    })).rejects.toMatchObject({
      reason: 'not_prepared',
      retryable: false,
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

/**
 * CE-3 · audit F-02 — "a rejected terminal proof must not destroy an honest
 * finished run".
 *
 * Before this work package, every one of the engine's 57 invariants was also a
 * settlement veto: `deriveTerminalIntent` bare-caught the server-side replay,
 * the route answered 400 `retryable: false`, the claim was dropped, the run
 * sat until `expire_stale_game_sessions` closed it as `expired`, and the
 * Energy the player had committed to it was gone. The audit measured that as
 * the amplifier that turned every other finding fatal.
 */
describe('CE-3 · a refused terminal proof holds value instead of destroying it', () => {
  const LEASE = 'held-terminal-lease-token-with-enough-entropy';

  /**
   * A PRIMAL run that reaches a real collision: one accepted checkpoint after
   * the first tick, terminal on the second. The board is 4x4 and the run never
   * turns, so every fact below is deterministic.
   */
  function terminalFixture(now: number) {
    const game = new SnakeGameLogic({
      gridSize: 4,
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'held-terminal',
    });
    game.prepare();
    game.activatePrepared(now - 2_000);
    game.tick();
    const checkpoint = game.exportCheckpoint(now - 1_000);
    game.tick();
    expect(game.getState().isGameOver).toBe(true);
    const trace = game.getReplayTrace();
    const row = {
      id: 'held-terminal',
      start_request_id: START_ID,
      start_manifest: {
        sessionId: 'held-terminal',
        simulation: {
          seed: 'held-terminal',
          version: 1,
          rulesVersion: SNAKE_RULES_VERSION,
        },
        runSnake: { dynasty: 'PRIMAL' },
      },
      continuity_phase: 'active',
      continuity_activated_at: new Date(now - 2_000).toISOString(),
      continuity_checkpoint: checkpoint,
      continuity_checkpoint_revision: 2,
      continuity_checkpoint_saved_at: new Date(now - 1_000).toISOString(),
      continuity_lease_issued_at: new Date(now - 1_000).toISOString(),
      continuity_lease_hash: createHash('sha256').update(LEASE).digest('hex'),
      simulation_rules_version: SNAKE_RULES_VERSION,
      started_at: new Date(now - 3_000).toISOString(),
      ended_at: null,
      end_reason: null,
    };
    const provenProof = {
      fromTick: checkpoint.privateState.replay.ticks,
      toTick: trace.ticks,
      actionOffset: checkpoint.privateState.replay.actions.length,
      actions: trace.actions.slice(
        checkpoint.privateState.replay.actions.length
      ),
      activeElapsedMs: 2_000,
    };
    return { checkpoint, row, provenProof, terminal: game.getTerminalResult()! };
  }

  function stage(row: Record<string, unknown>, replay: unknown, now: number) {
    const rpc = jest.fn().mockResolvedValue({
      data: { accepted: true, inserted: true },
      error: null,
    });
    return {
      rpc,
      result: stageRunTerminalIntent(clientWithRowAndRpc(row, rpc), {
        playerId: 'player-1',
        sessionId: 'held-terminal',
        expectedRevision: 2,
        leaseToken: LEASE,
        replay,
        now,
      }),
    };
  }

  it('settles the accepted checkpoint when the server cannot replay the proof', async () => {
    const now = Date.UTC(2026, 7, 4, 12, 0, 0);
    const { checkpoint, row, provenProof } = terminalFixture(now);
    // An unreplayable suffix: the proof claims five ticks past the collision.
    // The engine refuses to continue after a terminal state — exactly the
    // shape of every Genome v2 invariant the audit found in this position,
    // including the proven F-01 buffered-turn poisoning.
    const refused = { ...provenProof, toTick: provenProof.toTick + 5 };

    const staged = stage(row, refused, now);
    const intent = await staged.result;

    // NOT a throw. That single line is the work package.
    expect(intent.held).toBe(true);
    expect(intent.facts.score).toBe(checkpoint.state.score);
    expect(intent.facts.dna_earned).toBe(checkpoint.state.dnaCollected);
    expect(intent.facts.food_count).toBe(checkpoint.state.foodEaten);
    expect(intent.facts.extracted).toBe(false);
    expect(intent.facts.died).toBe(true);
    expect(intent.facts.death_cause).toBe('timeout');
    expect(intent.facts.review).toMatchObject({
      v: 1,
      heldFrom: 'accepted_checkpoint',
      checkpointRevision: 2,
    });
    // The real validator message survives to the operator, not a placeholder.
    expect(String(intent.facts.review?.detail).length).toBeGreaterThan(0);

    // And it is DURABLY staged, which is what hands the run to CE-2: the row
    // becomes phase `terminal` with facts present, the exact state migration
    // 068's `list_stranded_terminal_runs` scans and the settlement sweep
    // drives to completion with no browser present.
    expect(staged.rpc).toHaveBeenCalledWith(
      'stage_run_continuity_terminal',
      expect.objectContaining({
        p_session_id: 'held-terminal',
        p_expected_revision: 2,
        p_terminal_facts: expect.objectContaining({
          review: expect.objectContaining({ heldFrom: 'accepted_checkpoint' }),
        }),
      })
    );
  });

  it('holds the same outcome however many times the refused proof is re-posted', async () => {
    const now = Date.UTC(2026, 7, 4, 12, 0, 0);
    const { row, provenProof } = terminalFixture(now);
    const refused = { ...provenProof, toTick: provenProof.toTick + 5 };

    const first = await stage(row, refused, now).result;
    const second = await stage(row, refused, now + 1_000).result;

    // Identical digest and identical facts: a client retrying its refused
    // proof re-stages the same outcome rather than colliding with
    // `terminal_intent_conflict`, and the settlement it feeds is idempotent
    // by session. No path here can pay a run twice.
    expect(second.digest).toBe(first.digest);
    expect(second.facts).toEqual(first.facts);

    // A run already terminal answers from its stored facts and stays held —
    // the marker is durable, so the player's retry, the start-path absorb and
    // the cron sweep all read the same outcome.
    const stored = await stageRunTerminalIntent(
      clientWithRowAndRpc(
        {
          ...row,
          continuity_phase: 'terminal',
          continuity_terminal_facts: first.facts,
          continuity_terminal_digest: first.digest,
        },
        jest.fn()
      ),
      {
        playerId: 'player-1',
        sessionId: 'held-terminal',
        expectedRevision: 2,
        leaseToken: LEASE,
        replay: refused,
        now: now + 2_000,
      }
    );
    expect(stored.held).toBe(true);
    expect(stored.digest).toBe(first.digest);
  });

  it('makes forging a terminal strictly worse than proving one', async () => {
    const now = Date.UTC(2026, 7, 4, 12, 0, 0);
    const { row, provenProof, terminal } = terminalFixture(now);

    const proven = await stage(row, provenProof, now).result;
    const forged = await stage(
      row,
      // A claim of a longer, richer run than the one that was played.
      { ...provenProof, toTick: provenProof.toTick + 5, activeElapsedMs: 60_000 },
      now
    ).result;

    expect(proven.held).toBe(false);
    expect(proven.facts.review).toBeUndefined();
    expect(proven.facts.score).toBe(terminal.score);

    // This is why the degradation may be unconditional: everything a forged
    // suffix claims is discarded, and what remains is what the server had
    // already proven for itself. Forgery can only ever LOWER the settled
    // result, so there is nothing here to deter and no honest run to punish.
    expect(forged.held).toBe(true);
    expect(forged.facts.score).toBeLessThanOrEqual(proven.facts.score);
    expect(forged.facts.duration_seconds).toBeLessThanOrEqual(
      proven.facts.duration_seconds
    );
    expect(forged.facts.duration_seconds).not.toBe(60);
  });

  it('never carries the refused proof into the held facts', async () => {
    const now = Date.UTC(2026, 7, 4, 12, 0, 0);
    const { row, provenProof } = terminalFixture(now);
    const intent = await stage(
      row,
      { ...provenProof, toTick: provenProof.toTick + 5 },
      now
    ).result;

    expect(intent.facts).not.toHaveProperty('replay');
    expect(JSON.stringify(intent.facts)).not.toContain('actionOffset');
    expect(Buffer.byteLength(JSON.stringify(intent.facts), 'utf8'))
      .toBeLessThanOrEqual(262_144);
  });
});

/**
 * CE-3 item 2 — the PR #72 lesson, in code.
 *
 * `terminalError` used to end in one unconditional fallback that made every
 * unrecognised database exception a retryable 503. Two deterministic byte
 * guards then produced a client that re-posted a permanently refused payload
 * forever, with no message an operator could search for, through a whole
 * deploy cycle.
 */
describe('CE-3 · settlement faults are permanent unless they are known transient', () => {
  const endInput = {
    userId: 'user-1',
    playerId: 'player-1',
    sessionId: 'session-1',
    leaseToken: 'settlement-fault-lease-token-with-enough-entropy',
    envelope: { v: 1 },
  };

  const failWith = (error: Record<string, unknown>) =>
    stageContinuityRunEnd(
      clientWithRpc(jest.fn().mockResolvedValue({ data: null, error })),
      endInput
    );

  it('stops retrying the exact rejections that stranded production', async () => {
    for (const message of [
      'INVALID_PENDING_GAME_END_ENVELOPE',
      'invalid_free_run_facts',
    ]) {
      const error = await failWith({ code: 'P0001', message }).catch((e) => e);
      expect(error).toBeInstanceOf(RunContinuityError);
      expect(error.retryable).toBe(false);
      // The database's own words reach the caller. A bare "Could not secure
      // the run outcome" is what made the incident invisible.
      expect(error.message).toContain(message);
    }
  });

  it('treats an unknown database exception as permanent and says what it was', async () => {
    const error = await failWith({
      code: '23514',
      message: 'new row violates check constraint "game_sessions_score_check"',
    }).catch((e) => e);
    expect(error.retryable).toBe(false);
    expect(error.message).toContain('game_sessions_score_check');
  });

  it('keeps genuinely transient classes retryable', async () => {
    for (const code of ['40001', '40P01', '55P03', '57014', '53300', '08006']) {
      const error = await failWith({ code, message: 'transient' })
        .catch((e) => e);
      expect(error.retryable).toBe(true);
      expect(error.reason).toBe('unavailable');
    }
  });

  it('keeps a transport failure with no database code retryable', async () => {
    const error = await failWith({ message: 'fetch failed' }).catch((e) => e);
    expect(error.retryable).toBe(true);
  });

  it('still reports a pre-migration schema as retryable', async () => {
    const error = await failWith({
      code: '42883',
      message: 'function stage_continuity_game_session_end does not exist',
    }).catch((e) => e);
    expect(error.retryable).toBe(true);
    expect(error.message).toMatch(/being prepared/);
  });

  it('leaves every named continuity refusal non-retryable', async () => {
    for (const [message, reason] of [
      ['run_lease_conflict', 'lease_conflict'],
      ['run_not_terminalizable', 'not_prepared'],
      ['checkpoint_revision_conflict', 'checkpoint_conflict'],
      ['invalid_terminal_intent', 'invalid_checkpoint'],
      ['session_not_found', 'not_found'],
    ] as const) {
      const error = await failWith({ code: 'P0001', message }).catch((e) => e);
      expect(error.reason).toBe(reason);
      expect(error.retryable).toBe(false);
    }
  });
});
