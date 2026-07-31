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
  v_application UUID;
  v_invite UUID;
  v_source_battle UUID := '06200000-0000-0000-0001-000000000001';
  v_source_side UUID := '06200000-0000-0000-0001-000000000002';
  v_effective_battle UUID := '06200000-0000-0000-0001-000000000003';
  v_effective_side UUID := '06200000-0000-0000-0001-000000000004';
  v_result JSONB;
  v_retry JSONB;
  v_row RECORD;
  v_before_dna INTEGER;
  v_before_total INTEGER;
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
  v_result := found_clan(
    v_leader_user, 'Rivals Welcome', 'RWL', NULL, NULL,
    '#36F1CD', '#14213D', 500
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
  FROM get_competitive_clan_directory('rivals', 'invite_only', TRUE, 50, 0)
  WHERE id = v_clan;
  IF v_row.id IS NULL OR v_row.member_count <> 3 OR v_row.available_spots <> 9
     OR v_row.join_policy <> 'invite_only'
     OR v_row.recent_activity_at IS NULL
     OR v_row.recent_activity_kind <> 'energy_battle' THEN
    RAISE EXCEPTION 'directory facts mismatch: %', row_to_json(v_row);
  END IF;
  SELECT COUNT(*) INTO v_count
  FROM get_competitive_clan_directory('%', NULL, NULL, 50, 0)
  WHERE id = v_clan;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'directory treated literal search as SQL wildcard';
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
  ) VALUES (v_effective_side, v_effective_battle, 621, v_clan, 1, 777, 'victor');
  INSERT INTO clan_energy_cycle_memberships(cycle_index, player_id, clan_id)
  VALUES
    (621, v_co_player, v_clan),
    (621, v_applicant_player, v_clan);
  INSERT INTO game_sessions(id, player_id)
  VALUES
    ('06200000-0000-0000-0002-000000000004', v_co_player),
    ('06200000-0000-0000-0002-000000000005', v_applicant_player);
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
      1, 10000, 3, TRUE, 2, 80, NOW() - INTERVAL '2 hours');

  SELECT dna, total_dna_earned INTO v_before_dna, v_before_total
  FROM players WHERE id = v_applicant_player;
  v_result := settle_clan_glory_rewards(621);
  IF (v_result ->> 'settled')::INTEGER <> 2
     OR (v_result ->> 'dna_awarded')::INTEGER <> 500 THEN
    RAISE EXCEPTION 'Glory settlement failed: %', v_result;
  END IF;
  IF (SELECT dna FROM players WHERE id = v_applicant_player) <> v_before_dna + 250
     OR (SELECT total_dna_earned FROM players WHERE id = v_applicant_player)
        <> v_before_total + 250
     OR (SELECT dna FROM players WHERE id = v_co_player) <> 250
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
END;
$$;

ROLLBACK;
