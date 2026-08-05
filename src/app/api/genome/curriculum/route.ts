/**
 * GET/POST `/api/genome/curriculum` — the Workbench's eligibility annotation
 * and the trial choice (WP-D; PEO §4.2, §4.4).
 *
 * ── CONTRACT ───────────────────────────────────────────────────────────────
 *
 * GET  /api/genome/curriculum?dynasty=CYBER|PRIMAL|COSMIC
 *      Authorization: Bearer <supabase access token>   (required)
 * 200  {
 *        live: boolean,            // false = annotate nothing, gate nothing
 *        dynasty: DynastyName,
 *        bankedRuns: number,
 *        trialsOpen: boolean,      // the first trial is chosen after the first BANK
 *        trialGeneId: string|null,
 *        candidates: string[],     // <= 2, different decision categories
 *        genes: CurriculumGeneAnnotation[]
 *      }
 *
 * POST /api/genome/curriculum   { dynasty, geneId }
 * 200  the same body, recomposed after the write
 * 400  the Gene is not a legal next trial for this account
 * 503  the curriculum is live but the write could not be made
 *
 * ── WHAT THIS ROUTE MAY NOT DO ─────────────────────────────────────────────
 *
 * It never widens what a run may be offered. `select_gene_trial` moves one row
 * to `trial`; the run-start composer still reads the satellite table itself,
 * and `genomeV2PlayableVocabulary` still bounds the result by the Dynasty
 * roster. There is no request field here through which a client could name a
 * Gene it may play (server contract §9).
 *
 * ANNOTATE, NEVER GATE. `live: false` — flag off, or the satellite table not
 * applied here yet — means the Workbench renders exactly what it renders
 * today: the complete catalog, every rule readable, nothing marked. The
 * instrument is free (PEO boundary 2); only live OFFER eligibility is staged.
 */

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { isPlayerCohort } from '@/lib/cohort/cohort';
import { playerEvolutionEnabled } from '@/lib/features/playerEvolution';
import {
  readGeneEligibility,
  selectGeneTrial,
} from '@/lib/server/geneEligibility';
import { getGenomeRunFacts } from '@/lib/server/genome';
import { progressionJson } from '@/lib/server/noStoreResponse';
import {
  curriculumAnnotations,
  curriculumTrialCandidates,
  curriculumTrialSelectable,
  curriculumTrialsOpen,
  type CurriculumFacts,
} from '@/shared/game/curriculum';
import type { GenomeV2Dynasty } from '@/shared/game/genes';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DYNASTIES: readonly GenomeV2Dynasty[] = ['CYBER', 'PRIMAL', 'COSMIC'];

function parseDynasty(value: unknown): GenomeV2Dynasty | null {
  return typeof value === 'string' &&
    (DYNASTIES as readonly string[]).includes(value)
    ? (value as GenomeV2Dynasty)
    : null;
}

async function playerFor(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return { response: progressionJson({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: auth, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );
  if (authError || !auth.user) {
    return { response: progressionJson({ error: 'Invalid token' }, { status: 401 }) };
  }
  // `cohort` rides along for telemetry only (WP-F): PEO §9.3 requires every
  // curriculum conclusion to exclude the dev/QA/fixture accounts, and the
  // label has to come from the server — a browser that asserted its own
  // cohort could exclude itself from measurement at will. It reaches PostHog
  // as a person property and reaches no gameplay path at all.
  const { data: player, error } = await supabase
    .from('players')
    .select('id, cohort')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (error) {
    console.error('Curriculum player lookup failed:', error);
    Sentry.captureException(
      new Error(`curriculum player lookup failed: ${error.message}`),
      { tags: { wp: 'wp-pe-d' } }
    );
    return {
      response: progressionJson({ error: 'Could not read player' }, { status: 503 }),
    };
  }
  if (!player) {
    return { response: progressionJson({ error: 'Player not found' }, { status: 404 }) };
  }
  return {
    playerId: player.id as string,
    cohort: isPlayerCohort(player.cohort) ? player.cohort : null,
  };
}

/** The dormant body: a truthful "nothing is staged here". */
function dormant(dynasty: GenomeV2Dynasty, cohort: string | null) {
  return {
    live: false,
    dynasty,
    cohort,
    bankedRuns: 0,
    trialsOpen: false,
    trialGeneId: null,
    candidates: [] as string[],
    genes: [] as ReturnType<typeof curriculumAnnotations>,
  };
}

function projection(
  dynasty: GenomeV2Dynasty,
  facts: CurriculumFacts,
  cohort: string | null
) {
  return {
    live: true,
    dynasty,
    cohort,
    bankedRuns: facts.bankedRuns,
    trialsOpen: curriculumTrialsOpen(facts),
    trialGeneId: facts.trialGeneId,
    candidates: curriculumTrialCandidates(dynasty, facts),
    genes: curriculumAnnotations(dynasty, facts),
  };
}

/**
 * Read the account's curriculum facts, or `null` when there are none to read.
 *
 * `getGenomeRunFacts` is UNIGNORABLE by construction and its failure means the
 * banked-run count is unknown — so the annotation degrades to dormant rather
 * than telling a player their first trial is not open yet when it may well be.
 */
async function readFacts(playerId: string): Promise<CurriculumFacts | null> {
  const eligibility = await readGeneEligibility(supabase, playerId);
  if (!eligibility.available) return null;
  const runFacts = await getGenomeRunFacts(supabase, playerId);
  if (!runFacts.ok) {
    console.error('Curriculum run facts unavailable:', {
      playerId,
      reason: runFacts.reason,
      error: runFacts.error,
    });
    Sentry.captureException(
      new Error(`curriculum run facts unavailable: ${runFacts.reason}`),
      { level: 'warning', extra: { playerId }, tags: { wp: 'wp-pe-d' } }
    );
    return null;
  }
  return {
    eligibleGeneIds: eligibility.eligibleGeneIds,
    trialGeneId: eligibility.trialGeneId,
    bankedRuns: runFacts.bankedRuns,
  };
}

export async function GET(request: NextRequest) {
  const dynasty = parseDynasty(request.nextUrl.searchParams.get('dynasty'));
  if (!dynasty) {
    return progressionJson({ error: 'A valid dynasty is required' }, { status: 400 });
  }
  const auth = await playerFor(request);
  if ('response' in auth) return auth.response;
  if (!playerEvolutionEnabled()) {
    return progressionJson(dormant(dynasty, auth.cohort));
  }

  const facts = await readFacts(auth.playerId);
  if (!facts) return progressionJson(dormant(dynasty, auth.cohort));
  return progressionJson(projection(dynasty, facts, auth.cohort));
}

export async function POST(request: NextRequest) {
  const auth = await playerFor(request);
  if ('response' in auth) return auth.response;
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const dynasty = parseDynasty(body?.dynasty);
  if (!dynasty) {
    return progressionJson({ error: 'A valid dynasty is required' }, { status: 400 });
  }
  if (!playerEvolutionEnabled()) {
    return progressionJson({ error: 'The curriculum is not live' }, { status: 404 });
  }

  const facts = await readFacts(auth.playerId);
  if (!facts) {
    return progressionJson(
      { error: 'The curriculum is not available' },
      { status: 503 }
    );
  }
  const geneId = body?.geneId;
  // The server decides what a legal next trial is. A client may name a Gene;
  // it may not name one outside its own two candidates, and it may not name
  // one it already holds.
  if (!curriculumTrialSelectable(dynasty, facts, geneId)) {
    return progressionJson(
      { error: 'That power is not one of your next trials' },
      { status: 400 }
    );
  }

  // `selectGeneTrial` answers null — never throws — for a missing table, a
  // missing RPC, or a transient failure. 503 is honest: the choice did not
  // take. A silent success would leave a player believing they had chosen a
  // trial they had not.
  const selection = await selectGeneTrial(supabase, auth.playerId, geneId);
  if (!selection) {
    return progressionJson(
      { error: 'Could not set that trial' },
      { status: 503 }
    );
  }
  // Recompose from the write's own effect rather than assuming it: switching
  // is idempotent and last-writer-wins, so the caller must read back what the
  // server now holds (server contract §2).
  const after = await readFacts(auth.playerId);
  return progressionJson(
    projection(dynasty, after ?? { ...facts, trialGeneId: geneId }, auth.cohort)
  );
}
