import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  isMissingTrainingInfra,
  sanitizeSandboxScenarioConfig,
  trainingPresetFromRow,
} from '@/lib/server/training';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function playerFor(request: NextRequest) {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser(header.slice(7));
  if (authError || !user) {
    return { response: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) };
  }
  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (playerError || !player) {
    return { response: NextResponse.json({ error: 'Player not found' }, { status: 404 }) };
  }
  return { player: player as { id: string } };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await playerFor(request);
    if ('response' in auth) return auth.response;
    const { data, error } = await supabase
      .from('training_presets')
      .select('id, name, dynasty, tick_ms, start_length, path, updated_at')
      .eq('player_id', auth.player.id)
      .order('updated_at', { ascending: false });
    if (error) {
      if (isMissingTrainingInfra(error)) {
        return NextResponse.json({ live: false, presets: [] });
      }
      console.error('Training preset read failed:', error);
      return NextResponse.json({ error: 'Failed to load presets' }, { status: 500 });
    }
    return NextResponse.json({
      live: true,
      presets: (data ?? []).map(trainingPresetFromRow).filter(Boolean),
    });
  } catch (error) {
    console.error('Training preset GET failed:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await playerFor(request);
    if ('response' in auth) return auth.response;
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const config = sanitizeSandboxScenarioConfig(body.config);
    if (!name || name.length > 40 || !config) {
      return NextResponse.json({ error: 'Invalid training preset' }, { status: 400 });
    }

    // The RPC serializes saves per player so simultaneous requests cannot
    // race past the 20-preset cap.
    const { data, error } = await supabase.rpc('save_training_preset', {
      p_player_id: auth.player.id,
      p_name: name,
      p_dynasty: config.dynasty,
      p_tick_ms: config.tickMs,
      p_start_length: config.startLength,
      p_path: config.path,
    });
    if (error) {
      if (isMissingTrainingInfra(error)) {
        return NextResponse.json({ live: false, preset: null });
      }
      if (error.code === 'P0001' && /preset limit/i.test(error.message ?? '')) {
        return NextResponse.json({ error: 'Preset limit reached (20)' }, { status: 400 });
      }
      console.error('Training preset insert failed:', error);
      return NextResponse.json({ error: 'Failed to save preset' }, { status: 500 });
    }
    const preset = trainingPresetFromRow(data);
    if (!preset) {
      return NextResponse.json({ error: 'Saved preset was invalid' }, { status: 500 });
    }
    return NextResponse.json({ live: true, preset });
  } catch (error) {
    console.error('Training preset POST failed:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await playerFor(request);
    if ('response' in auth) return auth.response;
    const id = request.nextUrl.searchParams.get('id');
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: 'Invalid preset id' }, { status: 400 });
    }
    const { error } = await supabase
      .from('training_presets')
      .delete()
      .eq('player_id', auth.player.id)
      .eq('id', id);
    if (error) {
      if (isMissingTrainingInfra(error)) {
        return NextResponse.json({ live: false, deleted: false });
      }
      console.error('Training preset delete failed:', error);
      return NextResponse.json({ error: 'Failed to delete preset' }, { status: 500 });
    }
    return NextResponse.json({ live: true, deleted: true });
  } catch (error) {
    console.error('Training preset DELETE failed:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
