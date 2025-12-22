/**
 * Clan API
 * Per SO-001: 40% DAU in clans, energy bonus
 * Per SO-002: No daily requirements
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isValidClanName, isValidClanTag, CLAN_LIMITS } from '@/lib/clan/types';

// Server-side Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/**
 * GET - List clans or get player's clan
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get('playerId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    // If playerId specified, get that player's clan
    if (playerId) {
      const { data: membership } = await supabase
        .from('clan_members')
        .select(`
          clan_id,
          role,
          joined_at,
          clans:clan_id(*)
        `)
        .eq('player_id', playerId)
        .maybeSingle();

      if (!membership) {
        return NextResponse.json({ clan: null });
      }

      return NextResponse.json({
        clan: membership.clans,
        membership: {
          clanId: membership.clan_id,
          role: membership.role,
          joinedAt: membership.joined_at,
        },
      });
    }

    // List all clans
    const { data: clans, error, count } = await supabase
      .from('clans')
      .select('*', { count: 'exact' })
      .order('member_count', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch clans' }, { status: 500 });
    }

    return NextResponse.json({
      clans: clans || [],
      total: count || 0,
    });
  } catch (error) {
    console.error('Clan GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * POST - Create clan, join clan, or leave clan
 */
export async function POST(request: NextRequest) {
  try {
    // Verify auth
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const { action, clanId, name, tag, description } = body;

    switch (action) {
      case 'create': {
        // Validate inputs
        if (!name || !tag) {
          return NextResponse.json({ error: 'Name and tag required' }, { status: 400 });
        }

        if (!isValidClanName(name)) {
          return NextResponse.json(
            { error: `Name must be ${CLAN_LIMITS.minNameLength}-${CLAN_LIMITS.maxNameLength} characters` },
            { status: 400 }
          );
        }

        const upperTag = tag.toUpperCase();
        if (!isValidClanTag(upperTag)) {
          return NextResponse.json(
            { error: `Tag must be ${CLAN_LIMITS.minTagLength}-${CLAN_LIMITS.maxTagLength} uppercase letters/numbers` },
            { status: 400 }
          );
        }

        // Check if player already in a clan
        const { data: existing } = await supabase
          .from('clan_members')
          .select('clan_id')
          .eq('player_id', user.id)
          .maybeSingle();

        if (existing) {
          return NextResponse.json({ error: 'Already in a clan' }, { status: 400 });
        }

        // Check tag uniqueness
        const { data: tagExists } = await supabase
          .from('clans')
          .select('id')
          .eq('tag', upperTag)
          .maybeSingle();

        if (tagExists) {
          return NextResponse.json({ error: 'Tag already taken' }, { status: 400 });
        }

        // Create clan
        const { data: clan, error: createError } = await supabase
          .from('clans')
          .insert({
            name,
            tag: upperTag,
            description: description || '',
            owner_id: user.id,
            member_count: 1,
            max_members: CLAN_LIMITS.maxMembers,
          })
          .select()
          .single();

        if (createError) {
          console.error('Create clan error:', createError);
          return NextResponse.json({ error: 'Failed to create clan' }, { status: 500 });
        }

        // Add creator as owner
        await supabase.from('clan_members').insert({
          clan_id: clan.id,
          player_id: user.id,
          role: 'owner',
        });

        return NextResponse.json({ clan });
      }

      case 'join': {
        if (!clanId) {
          return NextResponse.json({ error: 'Clan ID required' }, { status: 400 });
        }

        // Check if player already in a clan
        const { data: existing } = await supabase
          .from('clan_members')
          .select('clan_id')
          .eq('player_id', user.id)
          .maybeSingle();

        if (existing) {
          return NextResponse.json({ error: 'Already in a clan' }, { status: 400 });
        }

        // Check clan exists and has space
        const { data: clan } = await supabase
          .from('clans')
          .select('id, member_count, max_members')
          .eq('id', clanId)
          .single();

        if (!clan) {
          return NextResponse.json({ error: 'Clan not found' }, { status: 404 });
        }

        if (clan.member_count >= clan.max_members) {
          return NextResponse.json({ error: 'Clan is full' }, { status: 400 });
        }

        // Add as member
        await supabase.from('clan_members').insert({
          clan_id: clanId,
          player_id: user.id,
          role: 'member',
        });

        // Increment member count
        await supabase
          .from('clans')
          .update({ member_count: clan.member_count + 1 })
          .eq('id', clanId);

        return NextResponse.json({ success: true });
      }

      case 'leave': {
        // Get membership
        const { data: membership } = await supabase
          .from('clan_members')
          .select('clan_id, role')
          .eq('player_id', user.id)
          .maybeSingle();

        if (!membership) {
          return NextResponse.json({ error: 'Not in a clan' }, { status: 400 });
        }

        if (membership.role === 'owner') {
          return NextResponse.json(
            { error: 'Owners must transfer ownership before leaving' },
            { status: 400 }
          );
        }

        // Remove membership
        await supabase
          .from('clan_members')
          .delete()
          .eq('player_id', user.id);

        // Decrement member count
        await supabase.rpc('decrement_clan_members', { clan_id: membership.clan_id });

        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Clan POST error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
