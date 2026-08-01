/**
 * Structural contract for Constitution v1.7 competitive clans.
 *
 * The filename is historical: migration 048 proved that no officer lever
 * existed. The owner amendment deliberately overturns that rule; this suite
 * now proves that hierarchy exists only behind audited, server-authoritative
 * permissions and earned contribution evidence.
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const migration = readFileSync(
  join(ROOT, 'supabase', 'migrations', '062_competitive_clans.sql'),
  'utf8'
);
const route = readFileSync(join(__dirname, 'route.ts'), 'utf8');
const types = readFileSync(join(ROOT, 'src', 'lib', 'clan', 'types.ts'), 'utf8');
const clanPage = readFileSync(join(ROOT, 'src', 'app', 'clan', 'page.tsx'), 'utf8');
const directory = readFileSync(
  join(ROOT, 'src', 'components', 'clan', 'ClanDirectory.tsx'),
  'utf8'
);
const roster = readFileSync(
  join(ROOT, 'src', 'components', 'clan', 'ClanRoster.tsx'),
  'utf8'
);

function functionBody(name: string): string {
  return migration.match(
    new RegExp(`CREATE (?:OR REPLACE )?FUNCTION ${name}\\([\\s\\S]+?REVOKE ALL ON FUNCTION ${name}\\(`)
  )?.[0] ?? '';
}

describe('role and recruitment authority', () => {
  it('defines owner|co_leader|member and maps owner to Leader', () => {
    expect(types).toMatch(/ClanRole = 'owner' \| 'co_leader' \| 'member'/);
    expect(types).toMatch(/owner: 'Leader'/);
    expect(migration).toMatch(/CHECK \(role IN \('owner', 'co_leader', 'member'\)\)/);
  });

  it('lets only owners change roles, settings, ownership, and Glory', () => {
    for (const name of [
      'set_clan_member_role',
      'transfer_clan_ownership',
      'update_clan_settings',
      'assign_clan_glory',
    ]) {
      expect(functionBody(name)).toMatch(/role <> 'owner'/);
    }
  });

  it('lets co-leaders recruit/review and remove only ordinary members', () => {
    expect(functionBody('create_clan_invite_by_handle')).toMatch(
      /role NOT IN \('owner', 'co_leader'\)/
    );
    expect(functionBody('review_clan_application')).toMatch(
      /role NOT IN \('owner', 'co_leader'\)/
    );
    expect(functionBody('remove_clan_member')).toMatch(
      /v_actor\.role = 'co_leader' AND v_target\.role <> 'member'/
    );
  });

  it('supports all policies through server RPCs and exact-handle invitations', () => {
    expect(migration).toMatch(/join_policy IN \('open', 'application', 'invite_only'\)/);
    expect(functionBody('request_clan_membership')).toMatch(/application_pending/);
    expect(functionBody('request_clan_membership')).toMatch(/joined_open/);
    expect(functionBody('create_clan_invite_by_handle')).toMatch(
      /lower\(p\.handle\) = lower\(btrim\(p_handle\)\)/
    );
    expect(route).toMatch(/case 'approve_application'/);
    expect(route).toMatch(/case 'reject_application'/);
  });
});

describe('economy and factual reads', () => {
  it('founds atomically under a player lock with one bounded ledgered spend', () => {
    const body = functionBody('found_clan');
    expect(body).toMatch(/p_founding_cost < 1 OR p_founding_cost > 100000/);
    expect(body).toMatch(/FROM players p WHERE p\.user_id = p_user_id FOR UPDATE/);
    expect(body).toMatch(/SET dna = dna - p_founding_cost/);
    expect(body).toMatch(/'clan_founding'/);
    expect(body).toMatch(/founding_dna_cost/);
  });

  it('fails legacy unquoted founding closed and requires the current quoted cost', () => {
    expect(migration.match(/CREATE FUNCTION found_clan\(/g)).toHaveLength(2);
    expect(migration).toMatch(
      /p_color_secondary TEXT,\s*p_founding_cost INTEGER\s*\)\s*RETURNS JSONB/i
    );
    expect(migration).toMatch(
      /CREATE FUNCTION found_clan\([\s\S]*?p_color_secondary TEXT\s*\)[\s\S]*?'founding_confirmation_required'[\s\S]*?Rolling-release compatibility only/i
    );
    expect(route).toMatch(
      /confirmedFoundingDnaCost !== CLAN_ECONOMY_CONFIG\.foundingDnaCost/
    );
    expect(route).toMatch(
      /p_founding_cost: CLAN_ECONOMY_CONFIG\.foundingDnaCost/
    );
    expect(clanPage).toMatch(/Founding commitment/);
    expect(clanPage).toMatch(/Creating this clan spends \{cost\.toLocaleString\(\)\} DNA/);
    expect(clanPage).toMatch(/confirmedFoundingDnaCost: cost/);
    expect(clanPage).toMatch(/data-testid="confirm-found-clan"/);
  });

  it('computes directory membership/spaces and excludes stale or missing activity', () => {
    const body = functionBody('get_competitive_clan_directory');
    expect(body).toMatch(/COUNT\(\*\)::BIGINT AS member_count/);
    expect(body).toMatch(/exact_available_spots/);
    expect(body).toMatch(/recent_activity_at/);
    expect(body).toMatch(/membership_activity AS/);
    expect(body).toMatch(/ELSE 'founded'/);
    expect(body).toMatch(/POSITION\(lower\(btrim\(p_search\)\)/);
    expect(body).toMatch(/f\.recent_activity_at IS NOT NULL/);
    expect(body).toMatch(/make_interval\(/);
    expect(body).toMatch(/p_alive_weeks/);
  });

  it('closes every legacy authenticated base-table path', () => {
    expect(migration).toMatch(/DROP POLICY IF EXISTS clans_insert ON clans/);
    expect(migration).toMatch(/DROP POLICY IF EXISTS clans_update ON clans/);
    expect(migration).toMatch(/DROP POLICY IF EXISTS clans_delete ON clans/);
    expect(migration).toMatch(/DROP POLICY IF EXISTS clan_members_insert ON clan_members/);
    expect(migration).toMatch(/DROP POLICY IF EXISTS clan_members_delete ON clan_members/);
    expect(migration).toMatch(/DROP POLICY IF EXISTS clan_invites_update ON clan_invites/);
    expect(migration).toMatch(
      /REVOKE ALL ON clans, clan_members, clan_invites FROM anon, authenticated/
    );
  });

  it('enforces the launch heraldry catalog in SQL as well as the picker', () => {
    expect(functionBody('found_clan')).toMatch(/p_banner_id NOT IN/);
    expect(functionBody('found_clan')).toMatch(/'field_standard'/);
    expect(functionBody('set_clan_heraldry')).toMatch(/p_emblem_id NOT IN/);
    expect(functionBody('set_clan_heraldry')).toMatch(/'#f97316'/);
  });

  it('ranks only authoritative counted positive-Energy contributions', () => {
    const body = functionBody('get_clan_competitive_roster');
    expect(body).toMatch(/clan_energy_contributions/);
    expect(body).toMatch(/c\.counted IS TRUE AND c\.energy_committed > 0/);
    expect(body).toMatch(/SUM\(c\.score\)/);
    expect(body).toMatch(/RANK\(\) OVER/);
    expect(body).not.toMatch(/dna_earned/);
  });
});

describe('Glory integrity', () => {
  it('hard-caps two seats and 1,000 DNA independent of deployment config', () => {
    expect(migration).toMatch(/seat SMALLINT NOT NULL CHECK \(seat BETWEEN 1 AND 2\)/);
    expect(migration).toMatch(/reward_dna INTEGER NOT NULL CHECK \(reward_dna BETWEEN 0 AND 1000\)/);
    expect(functionBody('assign_clan_glory')).toMatch(/p_reward_dna > 1000/);
  });

  it('uses contribution evidence and takes effect only next boundary', () => {
    const body = functionBody('assign_clan_glory');
    expect(migration).toMatch(/effective_cycle_index = source_cycle_index \+ 1/);
    expect(body).toMatch(/b\.intermission_ends_at/);
    expect(body).toMatch(/NOW\(\) >= v_effective_at/);
    expect(body).toMatch(/b\.settled_at/);
    expect(body).toMatch(/v_source_settled_at IS NULL/);
    expect(body).toMatch(/NOW\(\) < v_source_ends_at/);
    expect(body).toMatch(/c\.counted IS TRUE/);
    expect(body).toMatch(/c\.energy_committed > 0/);
    expect(body).toMatch(/clan_tenure_since/);
  });

  it('prevents duplicate seat, holder, assignment, and cycle payouts', () => {
    expect(migration).toMatch(
      /uq_clan_glory_active_seat[\s\S]+clan_id, effective_cycle_index, seat/
    );
    expect(migration).toMatch(
      /uq_clan_glory_active_holder[\s\S]+clan_id, effective_cycle_index, holder_user_id/
    );
    expect(migration).toMatch(/assignment_id UUID NOT NULL UNIQUE/);
    expect(migration).toMatch(/UNIQUE \(clan_id, cycle_index, seat\)/);
    expect(migration).toMatch(/ON CONFLICT DO NOTHING/);
  });

  it('settles only completed battles through a service-only function', () => {
    const body = functionBody('settle_clan_glory_rewards');
    expect(body).toMatch(/b\.settled_at IS NOT NULL/);
    expect(body).toMatch(/'clan_glory_reward'/);
    expect(body).not.toMatch(/UPDATE clan_energy_battle_sides/);
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION settle_clan_glory_rewards\(BIGINT\) FROM PUBLIC, anon, authenticated/
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION settle_clan_glory_rewards\(BIGINT\) TO service_role/
    );
  });

  it('does not accept client-authored competitive or economy facts', () => {
    const assignCase = route.match(/case 'assign_glory'[\s\S]+?default:/)?.[0] ?? '';
    expect(assignCase).toMatch(/CLAN_ECONOMY_CONFIG\.glory\.rewardDna/);
    expect(assignCase).toMatch(/energyBattleCycleAt\(\)/);
    expect(assignCase).not.toMatch(/body\.(reward|depth|rank|cycle|effective)/i);
  });
});

describe('battle reward integrity', () => {
  it('keeps one bounded, exact receipt per eligible player and battle', () => {
    expect(migration).toMatch(/ADD COLUMN reward_terms_version SMALLINT/);
    expect(migration).toMatch(/ALTER COLUMN reward_terms_version SET DEFAULT 1/);
    expect(migration).toMatch(/b\.reward_terms_version = 1/);
    expect(migration).toMatch(/CREATE TABLE clan_energy_battle_reward_ledger/);
    expect(migration).toMatch(/UNIQUE \(battle_id, player_id\)/);
    expect(migration).toMatch(/participation_amount BETWEEN 0 AND 1000/);
    expect(migration).toMatch(/bonus_amount BETWEEN 0 AND 1000/);
    expect(migration).toMatch(/amount = participation_amount \+ bonus_amount/);
    expect(migration).toMatch(/'clan_battle_reward'/);
  });

  it('rewards contributors without multiplying score, Yield, or Energy', () => {
    const body = functionBody('award_clan_energy_battle_rewards');
    expect(body).toMatch(/FROM clan_energy_contributions/);
    expect(body).toMatch(/SET dna = COALESCE\(dna, 0\) \+ v_amount/);
    expect(body).toMatch(/'participation_dna'/);
    expect(body).toMatch(/'bonus_dna'/);
    expect(body).not.toMatch(/UPDATE clan_energy_battle_sides/);
    expect(body).not.toMatch(/UPDATE game_sessions/);
    expect(body).not.toMatch(/SET energy/);
  });

  it('ties exact Compete attention to the immutable reward ledger row', () => {
    const body = functionBody('award_clan_energy_battle_rewards');
    expect(body).toMatch(/v_ledger_id::TEXT, 'settlement'/);
    expect(body).toMatch(/'recognition', 'clan'/);
    expect(body).toMatch(/'battle-reward:' \|\| v_ledger_id/);
    expect(body).toMatch(/ON CONFLICT \(player_id, source_type, source_id, attention_key\) DO NOTHING/);
  });

  it('keeps all reward writers service-only and SQL-capped', () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION award_clan_energy_battle_rewards\(UUID, INTEGER, INTEGER, INTEGER\)[\s\S]+FROM PUBLIC, anon, authenticated/
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION settle_clan_energy_battles\(INTEGER, INTEGER, INTEGER, INTEGER\)[\s\S]+FROM PUBLIC, anon, authenticated/
    );
    expect(functionBody('settle_clan_energy_battles')).toMatch(
      /p_participation_reward_dna NOT BETWEEN 0 AND 1000/
    );
  });
});

describe('release surfaces', () => {
  it('authenticates the legacy membership bridge and never wildcard-selects clan secrets', () => {
    expect(route).toMatch(/auth\.userId !== playerId/);
    expect(route).not.toMatch(/clans:clan_id\(\*\)/);
    expect(route).not.toMatch(/\.from\('clans'\)\s*\.select\('\*'\)/);
    expect(route).toMatch(/CLAN_PERMISSIONS\[role\]\.invite/);
  });

  it('mounts the one-time founding prompt on the clan journey', () => {
    expect(clanPage).toMatch(/import \{ ClanFoundingPrompt \}/);
    expect(clanPage).toMatch(/<ClanFoundingPrompt/);
  });

  it('keeps a visible report path on clan names and member handles', () => {
    expect(directory).toMatch(/clanReportHref\(clan\.id, clan\.name\)/);
    expect(roster).toMatch(/clanMemberReportHref/);
  });
});
