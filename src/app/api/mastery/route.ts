/**
 * Mastery API - per-dynasty mastery state for the Lab (Design v2 §7.1).
 * Read-only: XP is granted exclusively by the game-session end action
 * (server authority). PRE-019 SAFE: before migration 019 applies, every
 * dynasty reads as 0 XP / level 0 (base pool) - never an error.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  MASTERY_UNLOCK_TRACK,
  masteryProgress,
  masteryUnlockLabel,
} from '@/shared/game/mastery';
import { getMasteryXp } from '@/lib/server/mastery';
import type { DynastyName } from '@/shared/game/rulesets';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DYNASTIES: DynastyName[] = ['PRIMAL', 'CYBER', 'COSMIC'];

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const mastery = await Promise.all(
      DYNASTIES.map(async (dynasty) => {
        const xp = await getMasteryXp(supabase, player.id, dynasty);
        const progress = masteryProgress(xp);
        return {
          dynasty,
          xp,
          level: progress.level,
          intoLevel: progress.intoLevel,
          toNext: progress.toNext,
          track: MASTERY_UNLOCK_TRACK.map((rung) => ({
            level: rung.level,
            kind: rung.kind,
            label: masteryUnlockLabel(dynasty, rung.level),
            unlocked: progress.level >= rung.level,
          })),
        };
      })
    );

    return NextResponse.json({ mastery });
  } catch (err) {
    console.error('Mastery API error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
