import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  candidateBestFromResult,
  isMissingTrainingInfra,
  trainingBestFromRow,
  trainingRecentFromRow,
  verifyTrainingAttemptPayload,
} from '@/lib/server/training';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function authenticatedPlayer(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const token = authHeader.slice('Bearer '.length);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) };
  }
  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (playerError || !player) {
    return { error: NextResponse.json({ error: 'Player not found' }, { status: 404 }) };
  }
  return { player: player as { id: string } };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticatedPlayer(request);
    if ('error' in auth) return auth.error;

    const { data: bestRows, error: bestError } = await supabase
      .from('training_bests')
      .select('exercise_id, difficulty, scenario_version, completed, rating, medal, accuracy, efficiency, consistency, ticks, scenario_seed, trace, updated_at')
      .eq('player_id', auth.player.id);
    if (bestError) {
      if (isMissingTrainingInfra(bestError)) {
        return NextResponse.json({ live: false, bests: [], recent: [] });
      }
      console.error('Training best read failed:', bestError);
      return NextResponse.json({ error: 'Failed to load training profile' }, { status: 500 });
    }

    const { data: recentRows, error: recentError } = await supabase
      .from('training_attempts')
      .select('exercise_id, difficulty, rating, completed, created_at')
      .eq('player_id', auth.player.id)
      .order('created_at', { ascending: false })
      .limit(40);
    if (recentError) {
      if (isMissingTrainingInfra(recentError)) {
        return NextResponse.json({ live: false, bests: [], recent: [] });
      }
      console.error('Training recent read failed:', recentError);
      return NextResponse.json({ error: 'Failed to load training profile' }, { status: 500 });
    }

    return NextResponse.json({
      live: true,
      bests: (bestRows ?? []).map(trainingBestFromRow).filter(Boolean),
      recent: (recentRows ?? []).map(trainingRecentFromRow).filter(Boolean),
    });
  } catch (error) {
    console.error('Training GET failed:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticatedPlayer(request);
    if ('error' in auth) return auth.error;

    let result;
    try {
      result = verifyTrainingAttemptPayload(await request.json());
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid training attempt' },
        { status: 400 }
      );
    }
    if (!result.scenario || result.kind !== 'drill') {
      return NextResponse.json({ error: 'Only catalog drills can be verified' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('record_training_attempt', {
      p_player_id: auth.player.id,
      p_exercise_id: result.exercise,
      p_difficulty: result.difficulty,
      p_scenario_version: result.scenario.version,
      p_scenario_seed: result.scenario.seed,
      p_completed: result.metrics.completed,
      p_rating: result.metrics.rating,
      p_medal: result.metrics.medal,
      p_accuracy: result.metrics.accuracy,
      p_efficiency: result.metrics.efficiency,
      p_consistency: result.metrics.consistency,
      p_ticks: result.metrics.ticks,
      p_metrics: result.metrics,
      p_trace: result.trace,
    });
    if (error) {
      if (isMissingTrainingInfra(error)) {
        return NextResponse.json({
          result,
          best: candidateBestFromResult(result),
          persisted: false,
        });
      }
      console.error('Training attempt persistence failed:', error);
      return NextResponse.json({ error: 'Failed to record training attempt' }, { status: 500 });
    }

    const payload = data as { best?: unknown } | null;
    const best = trainingBestFromRow(payload?.best) ?? candidateBestFromResult(result);
    return NextResponse.json({ result, best, persisted: true });
  } catch (error) {
    console.error('Training POST failed:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
