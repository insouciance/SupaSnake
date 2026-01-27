/**
 * Variants API - List all snake variants
 * GET /api/variants
 * GET /api/variants?dynasty=<dynasty_id>
 *
 * Returns the 5 MVP variants, optionally filtered by dynasty
 * Public read for authenticated users
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SnakeVariant } from '@/shared/types/snake-data-model';
import { mapVariantRow } from './utils';

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

    // Check for optional dynasty filter
    const { searchParams } = new URL(request.url);
    const dynastyId = searchParams.get('dynasty');

    // Build query
    let query = supabase
      .from('snake_variants')
      .select('*')
      .eq('is_active', true);

    // Apply dynasty filter if provided
    if (dynastyId) {
      query = query.eq('dynasty_id', dynastyId);
    }

    // Order by dynasty then sort_order
    const { data: rows, error } = await query.order('sort_order', {
      ascending: true,
    });

    if (error) {
      console.error('Failed to fetch variants:', error);
      return NextResponse.json(
        { error: 'Failed to fetch variants' },
        { status: 500 }
      );
    }

    const variants: SnakeVariant[] = (rows || []).map(mapVariantRow);

    return NextResponse.json({ variants });
  } catch (err) {
    console.error('Variants API error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
