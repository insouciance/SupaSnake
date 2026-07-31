-- Local integration contract for migration 062.
-- Run against an isolated database after applying migrations through 062:
--   psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/062_competitive_clans.sql

BEGIN;

DO $$
DECLARE
  v_leader_user UUID := '06200000-0000-0000-0000-000000000001';
  v_co_user UUID := '06200000-0000-0000-0000-000000000002';
  v_applicant_user UUID := '06200000-0000-0000-0000-000000000003';
  v_invitee_user UUID := '06200000-0000-0000-0000-000000000004';
  v_outsider_user UUID := '06200000-0000-0000-0000-000000000005';
  v_leader_player UUID;
  v_co_player UUID;
  v_applicant_player UUID;
  v_invitee_player UUID;
  v_outsider_player UUID;
  v_clan UUID;
  v_fresh_clan UUID;
  v_application UUID;
  v_invite UUID;
  v_source_battle UUID := '06200000-0000-0000-0001-000000000001';
  v_source_side UUID := '06200000-0000-0000-0001-000000000002';
  v_effective_battle UUID := '06200000-0000-0000-0001-000000000003';
  v_effective_side UUID := '06200000-0000-0000-0001-000000000004';
  v_effective_rival_side UUID := '06200000-0000-0000-0001-000000000005';
  v_stalemate_battle UUID := '06200000-0000-0000-0001-000000000006';
  v_stalemate_side_one UUID := '06200000-0000-0000-0001-000000000007';
  v_stalemate_side_two UUID := '06200000-0000-0000-0001-000000000008';
  v_legacy_battle UUID := '06200000-0000-0000-0001-000000000009';
  v_legacy_side UUID := '06200000-0000-0000-0001-000000000010';
  v_result JSONB;
  v_retry JSONB;
  v_row RECORD;
  v_before_dna INTEGER;
  v_before_total INTEGER;
  v_co_before_dna INTEGER;
  v_invitee_before_dna INTEGER;
  v_count INTEGER;
BEGIN
  INSERT INTO auth.users(id, aud, role, email, created_at, updated_at)
  VALUES
    (v_leader_user, 'authenticated', 'authenticated', 'leader-062@example.test', NOW(), NOW()),
    (v_co_user, 'authenticated', 'authenticated', 'co-062@example.test', NOW(), NOW()),
    (v_applicant_user, 'authenticated', 'authenticated', 'applicant-062@example.test', NOW(), NOW()),
    (v_invitee_user, 'authenticated', 'authenticated', 'invitee-062@example.test', NOW(), NOW()),
    (v_outsider_user, 'authenticated', 'authenticated', 'outsider-062@example.test', NOW(), NOW());

  SELECT id INTO v_leader_player FROM players WHERE user_id = v_leader_user;
  SELECT id INTO v_co_player FROM players WHERE user_id = v_co_user;
  SELECT id INTO v_applicant_player FROM players WHERE user_id = v_applicant_user;
  SELECT id INTO v_invitee_player FROM players WHERE user_id = v_invitee_user;
  SELECT id INTO v_outsider_player FROM players WHERE user_id = v_outsider_user;

  IF v_leader_player IS NULL OR v_co_player IS NULL
     OR v_applicant_player IS NULL OR v_invitee_player IS NULL
     OR v_outsider_player IS NULL THEN
    RAISE EXCEPTION 'auth provisioning did not create every player';
  END IF;

  UPDATE players
  SET handle = CASE user_id
      WHEN v_leader_user THEN 'leader_062'
      WHEN v_co_user THEN 'coleader_062'
      WHEN v_applicant_user THEN 'applicant_062'
      WHEN v_invitee_user THEN 'invite_062'
      WHEN v_outsider_user THEN 'outsider_062'
    END,
    username = CASE user_id
      WHEN v_leader_user THEN 'leader_062'
      WHEN v_co_user THEN 'coleader_062'
      WHEN v_applicant_user THEN 'applicant_062'
      WHEN v_invitee_user THEN 'invite_062'
      WHEN v_outsider_user THEN 'outsider_062'
    END,
    dna = CASE WHEN user_id = v_leader_user THEN 1500 ELSE 0 END,
    total_dna_earned = 0
  WHERE user_id IN (
    v_leader_user, v_co_user, v_applicant_user, v_invitee_user, v_outsider_user
  );

  -- Founding is a clearly quoted, atomic sink with one durable ledger row.
  -- Heraldry is a server-enforced preset vocabulary, not a client convention.
  v_result := found_clan(
    v_leader_user, 'Forged Standard', 'FGD', 'unreleased_banner', NULL,
    NULL, NULL, 500
  );
  IF v_result ->> 'error' <> 'invalid_banner'
     OR (SELECT dna FROM players WHERE id = v_leader_player) <> 1500
     OR EXISTS (SELECT 1 FROM clan_members WHERE player_id = v_leader_user) THEN
    RAISE EXCEPTION 'forged founding heraldry mutated state: %', v_result;
  END IF;

  v_result := found_clan(
    v_leader_user, 'Rivals Welcome', 'RWL', 'deep_current', 'coil',
    '#22d3ee', '#64748b', 500
  );
  IF v_result ? 'error'
     OR (v_result ->> 'founding_dna_cost')::INTEGER <> 500
     OR (v_result ->> 'dna_balance')::INTEGER <> 1000 THEN
    RAISE EXCEPTION 'atomic founding failed: %', v_result;
  END IF;
  v_clan := (v_result ->> 'clan_id')::UUID;
  IF (SELECT dna FROM players WHERE id = v_leader_player) <> 1000 THEN
    RAISE EXCEPTION 'founding did not deduct exactly 500 DNA';
  END IF;
  IF (SELECT COUNT(*) FROM economy_transactions
      WHERE player_id = v_leader_player
        AND source_type = 'clan_founding'
        AND source_id = v_clan
        AND amount = -500
        AND balance_after = 1000) <> 1 THEN
    RAISE EXCEPTION 'founding ledger is missing or duplicated';
  END IF;
  IF set_clan_heraldry(v_leader_user, 'custom_banner', NULL, NULL, NULL)
       ->> 'error' <> 'invalid_banner'
     OR set_clan_heraldry(v_leader_user, NULL, 'custom_emblem', NULL, NULL)
       ->> 'error' <> 'invalid_emblem'
     OR set_clan_heraldry(v_leader_user, NULL, NULL, '#123456', NULL)
       ->> 'error' <> 'invalid_color' THEN
    RAISE EXCEPTION 'arbitrary heraldry passed the server allowlist';
  END IF;
  v_retry := found_clan(
    v_leader_user, 'Rivals Welcome', 'RWL', NULL, NULL,
    '#36F1CD', '#14213D', 500
  );
  IF v_retry ->> 'error' <> 'already_in_clan'
     OR (SELECT dna FROM players WHERE id = v_leader_player) <> 1000 THEN
    RAISE EXCEPTION 'founding retry spent DNA: %', v_retry;
  END IF;

  -- Open entry, owner-only promotion/settings, and idempotent applications.
  v_result := request_clan_membership(v_co_user, v_clan);
  IF v_result ->> 'state' <> 'joined' THEN
    RAISE EXCEPTION 'open membership failed: %', v_result;
  END IF;
  v_result := set_clan_member_role(v_leader_user, v_co_user, 'co_leader');
  IF v_result ->> 'role' <> 'co_leader' OR (v_result ->> 'idempotent')::BOOLEAN THEN
    RAISE EXCEPTION 'promotion failed: %', v_result;
  END IF;
  v_retry := set_clan_member_role(v_leader_user, v_co_user, 'co_leader');
  IF NOT (v_retry ->> 'idempotent')::BOOLEAN THEN
    RAISE EXCEPTION 'promotion retry was not idempotent: %', v_retry;
  END IF;
  IF update_clan_settings(v_co_user, 'application') ->> 'error' <> 'not_authorized' THEN
    RAISE EXCEPTION 'co-leader changed owner-only settings';
  END IF;
  v_result := update_clan_settings(v_leader_user, 'application');
  IF v_result ->> 'join_policy' <> 'application' THEN
    RAISE EXCEPTION 'application policy update failed: %', v_result;
  END IF;

  v_result := request_clan_membership(v_applicant_user, v_clan);
  v_retry := request_clan_membership(v_applicant_user, v_clan);
  v_application := (v_result ->> 'application_id')::UUID;
  IF v_result ->> 'state' <> 'application_pending'
     OR (v_result ->> 'idempotent')::BOOLEAN
     OR (v_retry ->> 'application_id')::UUID <> v_application
     OR NOT (v_retry ->> 'idempotent')::BOOLEAN THEN
    RAISE EXCEPTION 'application idempotence failed: first=%, retry=%', v_result, v_retry;
  END IF;
  v_result := review_clan_application(v_co_user, v_application, TRUE);
  v_retry := review_clan_application(v_co_user, v_application, TRUE);
  IF v_result ->> 'state' <> 'approved'
     OR (v_result ->> 'idempotent')::BOOLEAN
     OR v_retry ->> 'state' <> 'approved'
     OR NOT (v_retry ->> 'idempotent')::BOOLEAN THEN
    RAISE EXCEPTION 'co-leader application review failed: first=%, retry=%', v_result, v_retry;
  END IF;

  -- Invite-only entry still permits exact-handle invitations by a co-leader.
  PERFORM update_clan_settings(v_leader_user, 'invite_only');
  v_result := request_clan_membership(v_outsider_user, v_clan);
  IF v_result ->> 'error' <> 'invite_required' THEN
    RAISE EXCEPTION 'invite-only policy leaked an entry path: %', v_result;
  END IF;
  IF create_clan_invite_by_handle(v_applicant_user, 'invite_062', 604800)
       ->> 'error' <> 'not_authorized' THEN
    RAISE EXCEPTION 'ordinary member created an invitation';
  END IF;
  IF create_clan_invite_by_handle(v_co_user, 'invite_06', 604800)
       ->> 'error' <> 'handle_not_found' THEN
    RAISE EXCEPTION 'partial handle unexpectedly matched';
  END IF;
  v_result := create_clan_invite_by_handle(v_co_user, 'INVITE_062', 604800);
  v_retry := create_clan_invite_by_handle(v_co_user, 'invite_062', 604800);
  v_invite := (v_result ->> 'invite_id')::UUID;
  IF v_result ? 'error'
     OR (v_result ->> 'idempotent')::BOOLEAN
     OR (v_retry ->> 'invite_id')::UUID <> v_invite
     OR NOT (v_retry ->> 'idempotent')::BOOLEAN THEN
    RAISE EXCEPTION 'exact-handle invitation failed: first=%, retry=%', v_result, v_retry;
  END IF;
  v_result := respond_clan_invite(v_invitee_user, v_invite, NULL);
  IF v_result ->> 'error' <> 'not_authorized'
     OR (SELECT status FROM clan_invites WHERE id = v_invite) <> 'pending' THEN
    RAISE EXCEPTION 'NULL invite response mutated state: %', v_result;
  END IF;
  v_result := respond_clan_invite(v_invitee_user, v_invite, TRUE);
  v_retry := respond_clan_invite(v_invitee_user, v_invite, TRUE);
  IF v_result ->> 'state' <> 'accepted'
     OR (v_result ->> 'idempotent')::BOOLEAN
     OR v_retry ->> 'state' <> 'accepted'
     OR NOT (v_retry ->> 'idempotent')::BOOLEAN THEN
    RAISE EXCEPTION 'invitation acceptance failed: first=%, retry=%', v_result, v_retry;
  END IF;

  -- The role matrix has explicit owner/co-leader/member boundaries.
  IF set_clan_member_role(v_co_user, v_applicant_user, 'co_leader')
       ->> 'error' <> 'not_authorized' THEN
    RAISE EXCEPTION 'co-leader promoted a member';
  END IF;
  IF transfer_clan_ownership(v_co_user, v_applicant_user)
       ->> 'error' <> 'not_authorized' THEN
    RAISE EXCEPTION 'co-leader transferred ownership';
  END IF;
  IF remove_clan_member(v_co_user, v_leader_user)
       ->> 'error' <> 'protected_role' THEN
    RAISE EXCEPTION 'co-leader removed the Leader';
  END IF;
  IF update_clan_settings(v_applicant_user, 'open')
       ->> 'error' <> 'not_authorized' THEN
    RAISE EXCEPTION 'member changed clan settings';
  END IF;
  PERFORM set_clan_member_role(v_leader_user, v_co_user, 'member');
  PERFORM set_clan_member_role(v_leader_user, v_co_user, 'co_leader');

  -- Source cycle: only authoritative counted positive-Energy results rank.
  INSERT INTO clan_energy_battles(
    id, cycle_index, starts_at, ends_at, intermission_ends_at
  ) VALUES (
    v_source_battle, 620,
    NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours',
    NOW() + INTERVAL '1 hour'
  );
  INSERT INTO clan_energy_battle_sides(
    id, battle_id, cycle_index, clan_id, slot, score, outcome
  ) VALUES (v_source_side, v_source_battle, 620, v_clan, 1, 600, 'participant');
  INSERT INTO clan_energy_cycle_memberships(cycle_index, player_id, clan_id)
  VALUES
    (620, v_co_player, v_clan),
    (620, v_applicant_player, v_clan),
    (620, v_invitee_player, v_clan);
  INSERT INTO game_sessions(id, player_id)
  VALUES
    ('06200000-0000-0000-0002-000000000001', v_co_player),
    ('06200000-0000-0000-0002-000000000002', v_applicant_player),
    ('06200000-0000-0000-0002-000000000003', v_invitee_player);
  INSERT INTO clan_energy_contributions(
    battle_id, side_id, clan_id, player_id, session_id, score,
    energy_committed, commitment_multiplier_bps, snake_generation,
    counted, contribution_rank, score_delta, completed_at
  ) VALUES
    (v_source_battle, v_source_side, v_clan, v_co_player,
      '06200000-0000-0000-0002-000000000001', 300,
      1, 10000, 2, TRUE, 1, 300, NOW() - INTERVAL '20 minutes'),
    (v_source_battle, v_source_side, v_clan, v_applicant_player,
      '06200000-0000-0000-0002-000000000002', 200,
      1, 10000, 3, TRUE, 2, 200, NOW() - INTERVAL '15 minutes'),
    (v_source_battle, v_source_side, v_clan, v_invitee_player,
      '06200000-0000-0000-0002-000000000003', 100,
      1, 10000, 1, TRUE, 3, 100, NOW() - INTERVAL '10 minutes');

  v_result := assign_clan_glory(
    v_leader_user, v_applicant_user, 620::BIGINT, 1::SMALLINT,
    250, 0, 1, FALSE, FALSE
  );
  IF v_result ->> 'error' <> 'glory_source_not_final' THEN
    RAISE EXCEPTION 'unsettled battle produced Glory evidence: %', v_result;
  END IF;
  UPDATE clan_energy_battles
  SET settled_at = NOW(), ends_at = NOW() + INTERVAL '15 minutes'
  WHERE id = v_source_battle;
  v_result := assign_clan_glory(
    v_leader_user, v_applicant_user, 620::BIGINT, 1::SMALLINT,
    250, 0, 1, FALSE, FALSE
  );
  IF v_result ->> 'error' <> 'glory_boundary_not_open' THEN
    RAISE EXCEPTION 'active battle produced Glory evidence: %', v_result;
  END IF;
  UPDATE clan_energy_battles
  SET ends_at = NOW() - INTERVAL '2 hours'
  WHERE id = v_source_battle;

  SELECT * INTO v_row
  FROM get_clan_competitive_roster(v_clan, 620)
  WHERE user_id = v_applicant_user;
  IF v_row.best_five_depth <> 200 OR v_row.contribution_rank <> 2
     OR v_row.eligible_results <> 1 THEN
    RAISE EXCEPTION 'authoritative roster rank mismatch: %', row_to_json(v_row);
  END IF;
  SELECT * INTO v_row
  FROM get_clan_competitive_roster(v_clan, 620)
  WHERE user_id = v_leader_user;
  IF v_row.best_five_depth IS NOT NULL OR v_row.contribution_rank IS NOT NULL
     OR v_row.eligible_results <> 0 THEN
    RAISE EXCEPTION 'non-contributor received fake zero prestige: %', row_to_json(v_row);
  END IF;

  -- Glory is next-cycle, contribution-gated, capped at two active seats,
  -- idempotent, and reassignable only under the server-owned term.
  v_result := assign_clan_glory(
    v_leader_user, v_applicant_user, 620::BIGINT, 1::SMALLINT,
    250, 0, 1, FALSE, FALSE
  );
  v_retry := assign_clan_glory(
    v_leader_user, v_applicant_user, 620::BIGINT, 1::SMALLINT,
    250, 0, 1, FALSE, FALSE
  );
  IF v_result ? 'error'
     OR (v_result ->> 'effective_cycle_index')::BIGINT <> 621
     OR (v_result ->> 'evidence_depth')::BIGINT <> 200
     OR (v_result ->> 'evidence_rank')::BIGINT <> 2
     OR (v_retry ->> 'assignment_id') <> (v_result ->> 'assignment_id')
     OR NOT (v_retry ->> 'idempotent')::BOOLEAN THEN
    RAISE EXCEPTION 'Glory assignment/idempotence failed: first=%, retry=%', v_result, v_retry;
  END IF;
  IF assign_clan_glory(
      v_leader_user, v_applicant_user, 620::BIGINT, 2::SMALLINT,
      250, 0, 1, FALSE, FALSE
    ) ->> 'error' <> 'glory_holder_already_assigned' THEN
    RAISE EXCEPTION 'same holder occupied two Glory seats';
  END IF;
  IF assign_clan_glory(
      v_leader_user, v_co_user, 620::BIGINT, 1::SMALLINT,
      250, 0, 1, FALSE, FALSE
    ) ->> 'error' <> 'glory_seat_taken' THEN
    RAISE EXCEPTION 'Glory seat changed without reassignment permission';
  END IF;
  v_result := assign_clan_glory(
    v_leader_user, v_invitee_user, 620::BIGINT, 1::SMALLINT,
    250, 0, 1, FALSE, TRUE
  );
  IF v_result ? 'error' THEN
    RAISE EXCEPTION 'audited Glory reassignment failed: %', v_result;
  END IF;
  v_result := assign_clan_glory(
    v_leader_user, v_applicant_user, 620::BIGINT, 1::SMALLINT,
    250, 0, 1, FALSE, TRUE
  );
  IF v_result ? 'error' THEN
    RAISE EXCEPTION 'Glory reassignment restore failed: %', v_result;
  END IF;
  v_result := assign_clan_glory(
    v_leader_user, v_co_user, 620::BIGINT, 2::SMALLINT,
    250, 0, 1, FALSE, FALSE
  );
  IF v_result ? 'error' THEN
    RAISE EXCEPTION 'second Glory seat failed: %', v_result;
  END IF;
  IF assign_clan_glory(
      v_co_user, v_applicant_user, 620::BIGINT, 1::SMALLINT,
      250, 0, 1, FALSE, FALSE
    ) ->> 'error' <> 'not_authorized' THEN
    RAISE EXCEPTION 'co-leader assigned Glory';
  END IF;
  IF assign_clan_glory(
      v_leader_user, v_leader_user, 620::BIGINT, 1::SMALLINT,
      250, 0, 1, FALSE, FALSE
    ) ->> 'error' <> 'glory_self_award_disabled' THEN
    RAISE EXCEPTION 'disabled self-award path was reachable';
  END IF;
  IF assign_clan_glory(
      v_leader_user, v_outsider_user, 620::BIGINT, 1::SMALLINT,
      250, 0, 1, FALSE, FALSE
    ) ->> 'error' <> 'target_not_in_clan' THEN
    RAISE EXCEPTION 'outsider received Glory';
  END IF;
  IF (SELECT COUNT(*) FROM clan_glory_assignments
      WHERE clan_id = v_clan AND effective_cycle_index = 621
        AND superseded_at IS NULL) <> 2
     OR (SELECT COUNT(*) FROM clan_glory_assignments
         WHERE clan_id = v_clan AND effective_cycle_index = 621
           AND superseded_at IS NOT NULL) <> 2 THEN
    RAISE EXCEPTION 'Glory seat cap/history mismatch';
  END IF;

  -- Removal archives tenure but does not rewrite the settled cycle lock.
  v_result := remove_clan_member(v_co_user, v_invitee_user);
  IF v_result ? 'error'
     OR EXISTS (SELECT 1 FROM clan_members WHERE player_id = v_invitee_user)
     OR NOT EXISTS (
       SELECT 1 FROM clan_membership_history
       WHERE clan_id = v_clan AND player_id = v_invitee_user AND ended_by = 'removed'
     )
     OR clan_tenure_since(v_clan, v_invitee_user) IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM clan_energy_cycle_memberships
       WHERE cycle_index = 620 AND player_id = v_invitee_player AND clan_id = v_clan
     ) THEN
    RAISE EXCEPTION 'removal lost tenure or cycle lock: %', v_result;
  END IF;

  -- Directory facts come from current rows and real activity, never the stale
  -- denormalized member_count or wildcard interpretation.
  UPDATE clans SET member_count = 12 WHERE id = v_clan;
  SELECT * INTO v_row
  FROM get_competitive_clan_directory('rivals', 'invite_only', TRUE, 50, 0, 2)
  WHERE id = v_clan;
  IF v_row.id IS NULL OR v_row.member_count <> 3 OR v_row.available_spots <> 9
     OR v_row.join_policy <> 'invite_only'
     OR v_row.recent_activity_at IS NULL
     OR v_row.recent_activity_kind <> 'membership' THEN
    RAISE EXCEPTION 'directory facts mismatch: %', row_to_json(v_row);
  END IF;
  SELECT COUNT(*) INTO v_count
  FROM get_competitive_clan_directory('%', NULL, NULL, 50, 0, 2)
  WHERE id = v_clan;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'directory treated literal search as SQL wildcard';
  END IF;
  UPDATE players SET dna = 500 WHERE id = v_invitee_player;
  v_result := found_clan(
    v_invitee_user, 'Fresh Standard', 'FRSH', 'field_standard', 'fang',
    '#f97316', '#22d3ee', 500
  );
  v_fresh_clan := (v_result ->> 'clan_id')::UUID;
  SELECT * INTO v_row
  FROM get_competitive_clan_directory('fresh standard', NULL, NULL, 50, 0, 2)
  WHERE id = v_fresh_clan;
  IF v_result ? 'error' OR v_row.id IS NULL
     OR v_row.recent_activity_kind <> 'founded' THEN
    RAISE EXCEPTION 'new recruiting clan was not honestly discoverable: result=%, row=%',
      v_result, row_to_json(v_row);
  END IF;

  -- A real contributor on an unmatched side receives participation only.
  -- Leaving the source clan later does not erase the snapshotted result.
  UPDATE clan_energy_battle_sides SET outcome = 'bye'
  WHERE id = v_source_side;
  v_result := award_clan_energy_battle_rewards(v_source_battle, 100, 100, 50);
  IF (v_result ->> 'settled')::INTEGER <> 3
     OR (v_result ->> 'dna_awarded')::INTEGER <> 300
     OR (SELECT COUNT(*) FROM clan_energy_battle_reward_ledger
         WHERE battle_id = v_source_battle
           AND reward_kind = 'participation'
           AND outcome = 'bye'
           AND participation_amount = 100
           AND bonus_amount = 0
           AND amount = 100) <> 3
     OR (SELECT COUNT(*) FROM economy_transactions
         WHERE source_type = 'clan_battle_reward'
           AND metadata ->> 'battle_id' = v_source_battle::TEXT) <> 3
     OR (SELECT COUNT(*) FROM player_attention_items
         WHERE source_type = 'clan_battle_reward'
           AND destination = 'clan'
           AND artifact_ref LIKE 'battle-reward:%') <> 3 THEN
    RAISE EXCEPTION 'unmatched participation reward/receipt mismatch: %', v_result;
  END IF;
  v_retry := award_clan_energy_battle_rewards(v_source_battle, 100, 100, 50);
  IF (v_retry ->> 'settled')::INTEGER <> 0
     OR (v_retry ->> 'dna_awarded')::INTEGER <> 0 THEN
    RAISE EXCEPTION 'unmatched reward retry duplicated settlement: %', v_retry;
  END IF;

  UPDATE clan_energy_contributions
  SET completed_at = NOW() - INTERVAL '15 days'
  WHERE battle_id = v_source_battle;
  UPDATE clans
  SET created_at = NOW() - INTERVAL '15 days'
  WHERE id = v_clan;
  UPDATE clan_membership_transitions
  SET created_at = NOW() - INTERVAL '15 days'
  WHERE clan_id = v_clan;
  SELECT COUNT(*) INTO v_count
  FROM get_competitive_clan_directory('rivals', NULL, NULL, 50, 0, 2)
  WHERE id = v_clan;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'stale clan remained in the two-week alive directory';
  END IF;

  -- A settled effective cycle pays only active holders who contributed there.
  INSERT INTO clan_energy_battles(
    id, cycle_index, starts_at, ends_at, intermission_ends_at, settled_at
  ) VALUES (
    v_effective_battle, 621,
    NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '1 hour', NOW()
  );
  INSERT INTO clan_energy_battle_sides(
    id, battle_id, cycle_index, clan_id, slot, score, outcome
  ) VALUES
    (v_effective_side, v_effective_battle, 621, v_clan, 1, 777, 'victor'),
    (v_effective_rival_side, v_effective_battle, 621, v_fresh_clan, 2, 50, 'participant');
  INSERT INTO clan_energy_cycle_memberships(cycle_index, player_id, clan_id)
  VALUES
    (621, v_co_player, v_clan),
    (621, v_applicant_player, v_clan);
  INSERT INTO game_sessions(id, player_id)
  VALUES
    ('06200000-0000-0000-0002-000000000004', v_co_player),
    ('06200000-0000-0000-0002-000000000005', v_applicant_player),
    ('06200000-0000-0000-0002-000000000006', v_invitee_player);
  INSERT INTO clan_energy_contributions(
    battle_id, side_id, clan_id, player_id, session_id, score,
    energy_committed, commitment_multiplier_bps, snake_generation,
    counted, contribution_rank, score_delta, completed_at
  ) VALUES
    (v_effective_battle, v_effective_side, v_clan, v_co_player,
      '06200000-0000-0000-0002-000000000004', 120,
      1, 10000, 2, TRUE, 1, 120, NOW() - INTERVAL '2 hours'),
    (v_effective_battle, v_effective_side, v_clan, v_applicant_player,
      '06200000-0000-0000-0002-000000000005', 80,
      1, 10000, 3, TRUE, 2, 80, NOW() - INTERVAL '2 hours'),
    (v_effective_battle, v_effective_rival_side, v_fresh_clan, v_invitee_player,
      '06200000-0000-0000-0002-000000000006', 50,
      1, 10000, 1, TRUE, 1, 50, NOW() - INTERVAL '2 hours');

  v_result := award_clan_energy_battle_rewards(v_effective_battle, 100, 100, 50);
  IF (v_result ->> 'settled')::INTEGER <> 3
     OR (v_result ->> 'dna_awarded')::INTEGER <> 500
     OR (SELECT COUNT(*) FROM clan_energy_battle_reward_ledger
         WHERE battle_id = v_effective_battle
           AND reward_kind = 'victor'
           AND participation_amount = 100
           AND bonus_amount = 100
           AND amount = 200) <> 2
     OR (SELECT COUNT(*) FROM clan_energy_battle_reward_ledger
         WHERE battle_id = v_effective_battle
           AND reward_kind = 'participation'
           AND amount = 100) <> 1 THEN
    RAISE EXCEPTION 'winner/loser battle rewards mismatch: %', v_result;
  END IF;
  v_retry := award_clan_energy_battle_rewards(v_effective_battle, 999, 999, 999);
  IF (v_retry ->> 'settled')::INTEGER <> 0
     OR (v_retry ->> 'dna_awarded')::INTEGER <> 0
     OR EXISTS (
       SELECT 1 FROM clan_energy_battle_reward_ledger
       WHERE battle_id = v_effective_battle AND amount > 200
     ) THEN
    RAISE EXCEPTION 'reward retry repriced an existing receipt: %', v_retry;
  END IF;

  SELECT dna, total_dna_earned INTO v_before_dna, v_before_total
  FROM players WHERE id = v_applicant_player;
  SELECT dna INTO v_co_before_dna FROM players WHERE id = v_co_player;
  SELECT dna INTO v_invitee_before_dna FROM players WHERE id = v_invitee_player;
  v_result := settle_clan_glory_rewards(621);
  IF (v_result ->> 'settled')::INTEGER <> 2
     OR (v_result ->> 'dna_awarded')::INTEGER <> 500 THEN
    RAISE EXCEPTION 'Glory settlement failed: %', v_result;
  END IF;
  IF (SELECT dna FROM players WHERE id = v_applicant_player) <> v_before_dna + 250
     OR (SELECT total_dna_earned FROM players WHERE id = v_applicant_player)
        <> v_before_total + 250
     OR (SELECT dna FROM players WHERE id = v_co_player) <> v_co_before_dna + 250
     OR (SELECT dna FROM players WHERE id = v_invitee_player) <> v_invitee_before_dna
     OR (SELECT COUNT(*) FROM clan_glory_reward_ledger
         WHERE clan_id = v_clan AND cycle_index = 621) <> 2
     OR (SELECT COUNT(*) FROM economy_transactions
         WHERE source_type = 'clan_glory_reward'
           AND player_id IN (v_co_player, v_applicant_player)) <> 2
     OR (SELECT score FROM clan_energy_battle_sides WHERE id = v_effective_side) <> 777
     OR EXISTS (
       SELECT 1 FROM clan_glory_reward_ledger WHERE holder_user_id = v_invitee_user
     ) THEN
    RAISE EXCEPTION 'Glory reward ledger/economy bounds mismatch';
  END IF;
  v_retry := settle_clan_glory_rewards(621);
  IF (v_retry ->> 'settled')::INTEGER <> 0
     OR (v_retry ->> 'dna_awarded')::INTEGER <> 0
     OR (SELECT COUNT(*) FROM clan_glory_reward_ledger
         WHERE clan_id = v_clan AND cycle_index = 621) <> 2 THEN
    RAISE EXCEPTION 'Glory settlement retry duplicated reward: %', v_retry;
  END IF;

  IF (SELECT COUNT(*) FROM player_attention_items
      WHERE source_type = 'clan_glory_reward'
        AND destination = 'clan'
        AND artifact_ref LIKE 'glory-reward:%') <> 2
     OR (SELECT COUNT(*) FROM progression_moments
         WHERE source_type = 'clan_glory_reward'
           AND kind = 'clan_glory_reward') <> 2 THEN
    RAISE EXCEPTION 'Glory settlement was not visible in Compete history';
  END IF;

  -- A battle without the forward reward-terms marker predates this promise.
  -- It keeps its honor/Depth history but can never become a retroactive faucet.
  INSERT INTO clan_energy_battles(
    id, cycle_index, starts_at, ends_at, intermission_ends_at,
    settled_at, reward_terms_version
  ) VALUES (
    v_legacy_battle, 619,
    NOW() - INTERVAL '9 days', NOW() - INTERVAL '6 days',
    NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days', NULL
  );
  INSERT INTO clan_energy_battle_sides(
    id, battle_id, cycle_index, clan_id, slot, score, outcome
  ) VALUES (v_legacy_side, v_legacy_battle, 619, v_clan, 1, 40, 'bye');
  INSERT INTO game_sessions(id, player_id)
  VALUES ('06200000-0000-0000-0002-000000000009', v_applicant_player);
  INSERT INTO clan_energy_contributions(
    battle_id, side_id, clan_id, player_id, session_id, score,
    energy_committed, commitment_multiplier_bps, snake_generation,
    counted, contribution_rank, score_delta, completed_at
  ) VALUES (
    v_legacy_battle, v_legacy_side, v_clan, v_applicant_player,
    '06200000-0000-0000-0002-000000000009', 40,
    1, 10000, 3, TRUE, 1, 40, NOW() - INTERVAL '6 days'
  );
  v_result := award_clan_energy_battle_rewards(v_legacy_battle, 100, 100, 50);
  IF v_result ->> 'reason' <> 'reward_terms_not_eligible'
     OR EXISTS (
       SELECT 1 FROM clan_energy_battle_reward_ledger
       WHERE battle_id = v_legacy_battle
     )
     OR EXISTS (
       SELECT 1 FROM economy_transactions
       WHERE source_type = 'clan_battle_reward'
         AND metadata ->> 'battle_id' = v_legacy_battle::TEXT
     ) THEN
    RAISE EXCEPTION 'pre-cutover battle received retroactive DNA: %', v_result;
  END IF;

  -- The integrated settlement path resolves a genuine draw, grants the
  -- configured 150 DNA total to each contributor, and remains idempotent.
  INSERT INTO clan_energy_battles(
    id, cycle_index, starts_at, ends_at, intermission_ends_at
  ) VALUES (
    v_stalemate_battle, 622,
    NOW() - INTERVAL '5 days', NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '1 day'
  );
  INSERT INTO clan_energy_battle_sides(
    id, battle_id, cycle_index, clan_id, slot, score
  ) VALUES
    (v_stalemate_side_one, v_stalemate_battle, 622, v_clan, 1, 60),
    (v_stalemate_side_two, v_stalemate_battle, 622, v_fresh_clan, 2, 60);
  INSERT INTO game_sessions(id, player_id)
  VALUES
    ('06200000-0000-0000-0002-000000000007', v_applicant_player),
    ('06200000-0000-0000-0002-000000000008', v_invitee_player);
  INSERT INTO clan_energy_contributions(
    battle_id, side_id, clan_id, player_id, session_id, score,
    energy_committed, commitment_multiplier_bps, snake_generation,
    counted, contribution_rank, score_delta, completed_at
  ) VALUES
    (v_stalemate_battle, v_stalemate_side_one, v_clan, v_applicant_player,
      '06200000-0000-0000-0002-000000000007', 60,
      2, 22000, 3, TRUE, 1, 60, NOW() - INTERVAL '2 days'),
    (v_stalemate_battle, v_stalemate_side_two, v_fresh_clan, v_invitee_player,
      '06200000-0000-0000-0002-000000000008', 60,
      3, 36000, 1, TRUE, 1, 60, NOW() - INTERVAL '2 days');
  v_count := settle_clan_energy_battles(0, 100, 100, 50);
  IF v_count <> 1
     OR (SELECT COUNT(*) FROM clan_energy_battle_sides
         WHERE battle_id = v_stalemate_battle AND outcome = 'stalemate') <> 2
     OR (SELECT COUNT(*) FROM clan_energy_battle_reward_ledger
         WHERE battle_id = v_stalemate_battle
           AND reward_kind = 'stalemate'
           AND participation_amount = 100
           AND bonus_amount = 50
           AND amount = 150) <> 2 THEN
    RAISE EXCEPTION 'integrated stalemate settlement/reward failed: settled %, outcomes %, rewards %',
      v_count,
      (SELECT COUNT(*) FROM clan_energy_battle_sides
       WHERE battle_id = v_stalemate_battle AND outcome = 'stalemate'),
      (SELECT COUNT(*) FROM clan_energy_battle_reward_ledger
       WHERE battle_id = v_stalemate_battle);
  END IF;
  IF settle_clan_energy_battles(0, 100, 100, 50) <> 0
     OR (SELECT COUNT(*) FROM clan_energy_battle_reward_ledger
         WHERE battle_id = v_stalemate_battle) <> 2 THEN
    RAISE EXCEPTION 'integrated settlement retry duplicated a reward';
  END IF;

  BEGIN
    PERFORM settle_clan_energy_battles(0, 1001, 100, 50);
    RAISE EXCEPTION 'out-of-range battle reward dial was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'out-of-range battle reward dial was accepted' THEN RAISE; END IF;
    IF SQLERRM <> 'CLAN_BATTLE_REWARD_DIAL_OUT_OF_RANGE' THEN RAISE; END IF;
  END;

  -- Ownership transfer is explicit: the former Leader becomes co-leader.
  v_result := transfer_clan_ownership(v_leader_user, v_co_user);
  IF v_result ->> 'owner_id' <> v_co_user::TEXT
     OR (SELECT owner_id FROM clans WHERE id = v_clan) <> v_co_user
     OR (SELECT role FROM clan_members WHERE player_id = v_leader_user) <> 'co_leader'
     OR (SELECT role FROM clan_members WHERE player_id = v_co_user) <> 'owner' THEN
    RAISE EXCEPTION 'ownership transfer role semantics failed: %', v_result;
  END IF;
  IF update_clan_settings(v_leader_user, 'open') ->> 'error' <> 'not_authorized' THEN
    RAISE EXCEPTION 'former Leader retained owner-only settings authority';
  END IF;
  v_result := update_clan_settings(v_co_user, 'open');
  IF v_result ->> 'join_policy' <> 'open' THEN
    RAISE EXCEPTION 'new Leader did not receive owner authority: %', v_result;
  END IF;

  IF (SELECT COUNT(*) FROM clan_membership_transitions WHERE clan_id = v_clan) < 12 THEN
    RAISE EXCEPTION 'competitive clan transitions were not durably audited';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('clans', 'clan_members', 'clan_invites')
      AND roles @> ARRAY['authenticated']::name[]
  ) THEN
    RAISE EXCEPTION 'a legacy authenticated clan table policy survived';
  END IF;
END;
$$;

-- Exercise the same boundary a browser JWT receives. Every base-table path
-- fails closed, including reads that would reveal the invite authority secret.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '06200000-0000-0000-0000-000000000005', TRUE);

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.clans', 'SELECT')
     OR has_table_privilege('authenticated', 'public.clans', 'INSERT')
     OR has_table_privilege('authenticated', 'public.clans', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.clans', 'DELETE')
     OR has_table_privilege('authenticated', 'public.clan_members', 'SELECT')
     OR has_table_privilege('authenticated', 'public.clan_members', 'INSERT')
     OR has_table_privilege('authenticated', 'public.clan_members', 'DELETE')
     OR has_table_privilege('authenticated', 'public.clan_invites', 'SELECT')
     OR has_table_privilege('authenticated', 'public.clan_invites', 'INSERT')
     OR has_table_privilege('authenticated', 'public.clan_invites', 'UPDATE')
     OR has_table_privilege(
       'authenticated', 'public.clan_energy_battle_reward_ledger', 'SELECT'
     ) THEN
    RAISE EXCEPTION 'authenticated retained a direct clan table privilege';
  END IF;

  BEGIN
    PERFORM invite_code FROM clans WHERE name = 'Rivals Welcome';
    RAISE EXCEPTION 'authenticated read a clan invite code directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO clans(name, tag, owner_id)
    VALUES ('Free Bypass', 'FREE', auth.uid());
    RAISE EXCEPTION 'authenticated founded a clan without the economy RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO clan_members(clan_id, player_id, role)
    SELECT id, auth.uid(), 'owner' FROM clans WHERE name = 'Rivals Welcome';
    RAISE EXCEPTION 'authenticated self-inserted an authority membership';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM found_clan(auth.uid(), 'RPC Bypass', 'RPC', NULL, NULL, NULL, NULL, 1);
    RAISE EXCEPTION 'authenticated executed the service-only founding RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;

ROLLBACK;
