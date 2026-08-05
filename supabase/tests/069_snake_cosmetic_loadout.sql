-- Local integration contract for migration 069.
-- Run only against an isolated `supabase db reset` database:
--   psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/069_snake_cosmetic_loadout.sql
--
-- WHY THIS EXISTS RATHER THAN A UNIT TEST
--
-- `cosmeticSlots.migration.test.ts` reads the migration as TEXT and can prove
-- the four slot lists agree. It cannot prove that Postgres AGREES: that the
-- CHECK really refuses an unknown slot, that the stored ACL really names the
-- roles it claims to, that `equip_cosmetic` really refuses an un-owned item.
-- Doctrine FM-6 is exactly this gap — a fake that is weaker than the real
-- dependency tests only the fake. These assertions run against real SQL.
--
-- The ACL assertions read `pg_class.relacl` / `pg_proc.proacl` DIRECTLY rather
-- than asking `has_table_privilege`. That distinction is the point of the
-- hardening: on a host where `supabase_admin` applied the file, the browser
-- roles would hold an EXPLICIT grant that a PUBLIC-only revoke never touched,
-- and an effective-privilege check against a locally-applied database would
-- cheerfully report "no access" while the hosted database disagreed. The
-- stored ACL is the thing being asserted.

BEGIN;

DO $$
DECLARE
  v_acl TEXT;
  v_name TEXT;
  v_slot TEXT;
  v_def TEXT;
  v_count INTEGER;
  v_ok BOOLEAN;
  v_json JSONB;
  v_player UUID;
  v_user UUID := gen_random_uuid();
BEGIN
  -- ---------------------------------------------------------------------
  RAISE NOTICE '--- 1. slot vocabulary ---';

  FOREACH v_name IN ARRAY ARRAY['cosmetic_definitions_slot_check','player_loadout_slot_check'] LOOP
    SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint WHERE conname = v_name;
    IF v_def IS NULL THEN RAISE EXCEPTION '% missing', v_name; END IF;
    FOREACH v_slot IN ARRAY ARRAY['face','crown','food_skin'] LOOP
      IF v_def NOT LIKE '%''' || v_slot || '''%' THEN
        RAISE EXCEPTION '% does not admit %', v_name, v_slot;
      END IF;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'OK  both slot CHECKs admit face/crown/food_skin';

  -- An unknown slot must still be refused: the list grew, it did not open.
  BEGIN
    INSERT INTO cosmetic_definitions (id, name, slot, rarity)
    VALUES ('zz_probe', 'Probe', 'wings', 'common');
    RAISE EXCEPTION 'FAIL: cosmetic_definitions accepted an unknown slot';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK  an unknown slot is still refused';
  END;

  -- ---------------------------------------------------------------------
  RAISE NOTICE '--- 2. catalog ---';

  SELECT COUNT(*) INTO v_count FROM cosmetic_definitions WHERE slot IN ('face','crown');
  IF v_count <> 2 THEN RAISE EXCEPTION 'expected 2 snake cosmetics, found %', v_count; END IF;

  SELECT COUNT(*) INTO v_count FROM cosmetic_definitions WHERE slot = 'food_skin';
  IF v_count <> 0 THEN RAISE EXCEPTION 'food_skin scaffold is not empty (% rows)', v_count; END IF;

  SELECT COUNT(*) INTO v_count FROM cosmetic_definitions WHERE supporter_only;
  IF v_count <> 0 THEN RAISE EXCEPTION 'a supporter_only item shipped (% rows)', v_count; END IF;

  SELECT COUNT(*) INTO v_count FROM cosmetic_definitions
  WHERE id = 'banner_hatchery_standard' AND default_owned;
  IF v_count <> 1 THEN RAISE EXCEPTION 'the default banner backfill did not run'; END IF;
  RAISE NOTICE 'OK  2 snake cosmetics, 0 food skins, 0 supporter items, banner backfilled';

  -- ---------------------------------------------------------------------
  RAISE NOTICE '--- 3. table ACLs (the stored grant, not effective privilege) ---';

  -- player_cosmetics / player_loadout: authenticated may READ ONLY; anon nothing.
  FOREACH v_name IN ARRAY ARRAY['player_cosmetics','player_loadout'] LOOP
    SELECT array_to_string(relacl, ' ') INTO v_acl
    FROM pg_class WHERE relname = v_name AND relnamespace = 'public'::regnamespace;

    IF v_acl NOT LIKE '%authenticated=r/%' THEN
      RAISE EXCEPTION '% : authenticated has no bare SELECT grant. ACL=%', v_name, v_acl;
    END IF;
    IF v_acl LIKE '%anon=%' THEN
      RAISE EXCEPTION '% : anon still holds a grant. ACL=%', v_name, v_acl;
    END IF;
    RAISE NOTICE 'OK  % : authenticated=r only, anon absent  [%]', v_name, v_acl;
  END LOOP;

  SELECT array_to_string(relacl, ' ') INTO v_acl
  FROM pg_class WHERE relname = 'cosmetic_definitions' AND relnamespace = 'public'::regnamespace;
  IF v_acl NOT LIKE '%anon=r/%' OR v_acl NOT LIKE '%authenticated=r/%' THEN
    RAISE EXCEPTION 'cosmetic_definitions is not a public read catalog. ACL=%', v_acl;
  END IF;
  RAISE NOTICE 'OK  cosmetic_definitions : anon=r authenticated=r  [%]', v_acl;

  -- The own-row policies must still exist beside those grants.
  SELECT COUNT(*) INTO v_count FROM pg_policies
  WHERE tablename IN ('player_cosmetics','player_loadout') AND cmd = 'SELECT';
  IF v_count < 2 THEN RAISE EXCEPTION 'own-row SELECT policies missing (%)', v_count; END IF;
  RAISE NOTICE 'OK  own-row SELECT policies present alongside the grants';

  -- ---------------------------------------------------------------------
  RAISE NOTICE '--- 4. function ACLs + search_path ---';

  FOREACH v_name IN ARRAY ARRAY['read_snake_loadout','read_snake_cosmetic_catalog','equip_cosmetic'] LOOP
    SELECT array_to_string(proacl, ' '), prosecdef, array_to_string(proconfig, ',')
    INTO v_acl, v_ok, v_def
    FROM pg_proc WHERE proname = v_name AND pronamespace = 'public'::regnamespace;

    IF v_acl IS NULL THEN RAISE EXCEPTION '% : no stored ACL at all', v_name; END IF;
    IF v_acl LIKE '%anon=X/%' THEN
      RAISE EXCEPTION '% : anon may EXECUTE. ACL=%', v_name, v_acl;
    END IF;
    IF v_acl LIKE '%authenticated=X/%' THEN
      RAISE EXCEPTION '% : authenticated may EXECUTE. ACL=%', v_name, v_acl;
    END IF;
    IF v_acl LIKE '%=X/%' AND v_acl NOT LIKE '%service_role=X/%' THEN
      RAISE EXCEPTION '% : an unexpected role may EXECUTE. ACL=%', v_name, v_acl;
    END IF;
    IF v_acl NOT LIKE '%service_role=X/%' THEN
      RAISE EXCEPTION '% : service_role cannot EXECUTE. ACL=%', v_name, v_acl;
    END IF;

    IF NOT v_ok THEN RAISE EXCEPTION '% is not SECURITY DEFINER', v_name; END IF;
    IF v_def IS NULL OR v_def NOT LIKE '%search_path=public%' THEN
      RAISE EXCEPTION '% has no pinned search_path (%)', v_name, v_def;
    END IF;

    RAISE NOTICE 'OK  % : service_role only, SECURITY DEFINER, search_path pinned  [%]',
      v_name, v_acl;
  END LOOP;

  -- ---------------------------------------------------------------------
  RAISE NOTICE '--- 5. behaviour ---';

  -- Probe fixtures, removed at the end. The email is fixed so a half-finished
  -- run cannot leave a second account behind on the next pass.
  DELETE FROM cosmetic_definitions WHERE id = 'zz_locked';
  DELETE FROM auth.users WHERE email = 'lfb-069@example.test';

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  VALUES (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'lfb-069@example.test', '', NOW(), NOW(), NOW());

  -- A trigger already materialises the players row for a new auth user, so
  -- this reads it rather than racing it.
  SELECT id INTO v_player FROM players WHERE user_id = v_user;
  IF v_player IS NULL THEN
    INSERT INTO players (user_id) VALUES (v_user) RETURNING id INTO v_player;
  END IF;

  -- Nothing worn: every snake slot present and null.
  v_json := read_snake_loadout(v_player);
  IF v_json <> '{"face": null, "crown": null, "food_skin": null}'::JSONB THEN
    RAISE EXCEPTION 'bare loadout is not all-null: %', v_json;
  END IF;
  RAISE NOTICE 'OK  a bare snake answers null for every slot';

  -- A free item equips without any player_cosmetics row (default_owned).
  v_json := equip_cosmetic(v_player, 'face', 1, 'face_shades_deadpan');
  IF v_json->>'success' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'equipping a free cosmetic failed: %', v_json;
  END IF;
  v_json := read_snake_loadout(v_player);
  IF v_json->>'face' <> 'shades_deadpan' THEN
    RAISE EXCEPTION 'loadout did not report the equipped component: %', v_json;
  END IF;
  RAISE NOTICE 'OK  a default-owned cosmetic equips and reads back as its component key';

  -- Wrong slot is refused.
  v_json := equip_cosmetic(v_player, 'crown', 1, 'face_shades_deadpan');
  IF v_json->>'error' <> 'slot_mismatch' THEN
    RAISE EXCEPTION 'a face item was accepted into the crown slot: %', v_json;
  END IF;
  RAISE NOTICE 'OK  a face item cannot be worn on the crown';

  -- An un-owned item is refused (and this is what a supporter lock rests on).
  INSERT INTO cosmetic_definitions (id, name, slot, rarity, supporter_only, render)
  VALUES ('zz_locked', 'Locked', 'face', 'epic', TRUE,
          '{"kind":"snake_cosmetic","component":"zz_locked"}');
  v_json := equip_cosmetic(v_player, 'face', 1, 'zz_locked');
  IF v_json->>'error' <> 'not_owned' THEN
    RAISE EXCEPTION 'an un-owned supporter item was equipped: %', v_json;
  END IF;
  RAISE NOTICE 'OK  an un-owned item is refused on ownership alone';

  -- Once granted, it equips — subscription state is never re-asked (§10.2/R6).
  INSERT INTO player_cosmetics (player_id, cosmetic_id, source)
  VALUES (v_player, 'zz_locked', 'test');
  v_json := equip_cosmetic(v_player, 'face', 1, 'zz_locked');
  IF v_json->>'success' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'a granted supporter item was refused: %', v_json;
  END IF;
  RAISE NOTICE 'OK  a granted item is worn without asking about a subscription';

  -- The catalog reports owned/equipped, and browses only the snake slots.
  v_json := read_snake_cosmetic_catalog(v_player);
  IF jsonb_array_length(v_json->'items') <> 3 THEN
    RAISE EXCEPTION 'catalog should hold 3 snake items, holds %',
      jsonb_array_length(v_json->'items');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_json->'items') e
    WHERE e->>'id' = 'zz_locked'
      AND (e->>'owned')::BOOLEAN AND (e->>'equipped')::BOOLEAN
      AND (e->>'supporterOnly')::BOOLEAN
  ) THEN
    RAISE EXCEPTION 'catalog misreported the granted item: %', v_json->'items';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_json->'items') e
    WHERE e->>'slot' NOT IN ('face','crown','food_skin')
  ) THEN
    RAISE EXCEPTION 'catalog leaked a profile slot into the snake menu';
  END IF;
  IF v_json->'loadout'->>'face' <> 'zz_locked' THEN
    RAISE EXCEPTION 'catalog loadout disagrees with read_snake_loadout: %', v_json->'loadout';
  END IF;
  RAISE NOTICE 'OK  the catalog reports owned/equipped and embeds the same loadout';

  -- Unequip removes the SELECTION and never the OWNERSHIP (R6).
  v_json := equip_cosmetic(v_player, 'face', 1, NULL);
  IF v_json->>'success' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'unequip failed: %', v_json;
  END IF;
  IF (read_snake_loadout(v_player))->>'face' IS NOT NULL THEN
    RAISE EXCEPTION 'unequip left something worn';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM player_cosmetics
                 WHERE player_id = v_player AND cosmetic_id = 'zz_locked') THEN
    RAISE EXCEPTION 'R6 VIOLATION: unequip deleted the ownership row';
  END IF;
  RAISE NOTICE 'OK  unequip drops the selection and keeps the ownership';

  -- Profile slots still work: 069 must not have broken Identity v1.
  v_json := equip_cosmetic(v_player, 'banner', 1, 'banner_hatchery_standard');
  IF v_json->>'success' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'the Identity v1 banner path regressed: %', v_json;
  END IF;
  RAISE NOTICE 'OK  the six Identity v1 slots still equip';

  -- Leave the database as the migration left it.
  DELETE FROM auth.users WHERE id = v_user;
  DELETE FROM cosmetic_definitions WHERE id = 'zz_locked';

  SELECT COUNT(*) INTO v_count FROM cosmetic_definitions WHERE supporter_only;
  IF v_count <> 0 THEN RAISE EXCEPTION 'probe cleanup left a supporter item'; END IF;

  RAISE NOTICE '=== MIGRATION 069 VERIFIED ===';
END;
$$;

ROLLBACK;
