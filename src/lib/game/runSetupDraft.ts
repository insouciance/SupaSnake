import { GAME_CONFIG } from '@/shared/config/game';
import { LADDER_RUNGS } from '@/shared/game/ladder';

export type SetupRunMode = 'earn' | 'free' | 'anomaly';

export interface RunSetupDraft {
  mode: SetupRunMode | null;
  energyCommitment: number | null;
  ladderRung: number | null;
}

interface RunSetupReturnInput {
  currentSearch: string;
  mode: SetupRunMode;
  energyCommitment: number;
  ladderRung: number;
}

const CHALLENGE_KEYS = ['seed', 'target', 'challenge', 'by'] as const;
const SETUP_KEYS = ['setupMode', 'setupEnergy', 'setupRung'] as const;
const ALLOWED_KEYS = new Set<string>([...CHALLENGE_KEYS, ...SETUP_KEYS]);
const MAX_RETURN_PATH_LENGTH = 2_048;
const MAX_QUERY_VALUE_LENGTH = 160;
const MAX_LADDER_RUNG = Math.max(...LADDER_RUNGS.map((entry) => entry.rung));

function oneValue(params: URLSearchParams, key: string): string | null {
  const values = params.getAll(key);
  return values.length === 1 ? values[0] : null;
}

function boundedInteger(
  value: string | null,
  minimum: number,
  maximum: number
): number | null {
  if (value === null || !/^(0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function setupMode(value: string | null): SetupRunMode | null {
  return value === 'earn' || value === 'free' || value === 'anomaly'
    ? value
    : null;
}

/**
 * Read a navigation-only setup draft. These values are never progress or run
 * authority: the session endpoint still validates Energy, mode and Ladder at
 * the explicit Play action.
 */
export function readRunSetupDraft(search: string): RunSetupDraft {
  const params = new URLSearchParams(search);
  return {
    mode: setupMode(oneValue(params, 'setupMode')),
    energyCommitment: boundedInteger(
      oneValue(params, 'setupEnergy'),
      0,
      GAME_CONFIG.economy.energy.capacity
    ),
    ladderRung: boundedInteger(oneValue(params, 'setupRung'), 0, MAX_LADDER_RUNG),
  };
}

/** Build the internal return route while retaining only recognized challenge context. */
export function buildRunSetupReturnPath(input: RunSetupReturnInput): string {
  const current = new URLSearchParams(input.currentSearch);
  const next = new URLSearchParams();
  for (const key of CHALLENGE_KEYS) {
    const value = oneValue(current, key);
    if (value !== null && value.length <= MAX_QUERY_VALUE_LENGTH) next.set(key, value);
  }
  next.set('setupMode', input.mode);
  next.set(
    'setupEnergy',
    String(
      Math.max(
        0,
        Math.min(
          GAME_CONFIG.economy.energy.capacity,
          Math.floor(input.energyCommitment)
        )
      )
    )
  );
  next.set(
    'setupRung',
    String(Math.max(0, Math.min(MAX_LADDER_RUNG, Math.floor(input.ladderRung))))
  );
  return `/game?${next.toString()}`;
}

export function buildLabSetupHref(input: RunSetupReturnInput): string {
  return `/lab?returnTo=${encodeURIComponent(buildRunSetupReturnPath(input))}`;
}

/**
 * Normalize the untrusted Lab query before using it as a link. Unknown keys,
 * duplicate values, fragments and non-/game routes fail closed to Home.
 */
export function resolveSafeRunSetupReturnPath(value: string | null | undefined): string | null {
  if (value === '/game') return '/game';
  if (
    !value ||
    value.length > MAX_RETURN_PATH_LENGTH ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value, 'https://setup.supasnake.invalid');
  } catch {
    return null;
  }
  if (
    parsed.origin !== 'https://setup.supasnake.invalid' ||
    parsed.pathname !== '/game' ||
    parsed.hash !== ''
  ) {
    return null;
  }
  let containsUnsafeKey = false;
  parsed.searchParams.forEach((_queryValue, key) => {
    if (!ALLOWED_KEYS.has(key) || parsed.searchParams.getAll(key).length !== 1) {
      containsUnsafeKey = true;
    }
  });
  if (containsUnsafeKey) return null;
  for (const key of CHALLENGE_KEYS) {
    const valueForKey = parsed.searchParams.get(key);
    if (valueForKey !== null && valueForKey.length > MAX_QUERY_VALUE_LENGTH) return null;
  }

  const draft = readRunSetupDraft(parsed.search);
  if (
    draft.mode === null ||
    draft.energyCommitment === null ||
    draft.ladderRung === null
  ) {
    return null;
  }
  return buildRunSetupReturnPath({
    currentSearch: parsed.search,
    mode: draft.mode,
    energyCommitment: draft.energyCommitment,
    ladderRung: draft.ladderRung,
  });
}
