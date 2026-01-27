/**
 * Dynasties API - List all active dynasties
 * GET /api/dynasties
 *
 * Returns the 3 MVP dynasties: CYBER, PRIMAL, COSMIC
 * Public read for authenticated users (no RLS filtering)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Dynasty } from '@/shared/types/snake-data-model';
import { mapDynastyRow } from './utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Fetch all active dynasties ordered by sort_order
    const { data: rows, error } = await supabase
      .from('dynasties')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Failed to fetch dynasties:', error);
      return NextResponse.json(
        { error: 'Failed to fetch dynasties' },
        { status: 500 }
      );
    }

    const dynasties: Dynasty[] = (rows || []).map(mapDynastyRow);

    return NextResponse.json({ dynasties });
  } catch (err) {
    console.error('Dynasties API error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
