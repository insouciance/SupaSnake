-- Migration 056: the Signal day's condition clauses (WP-2.10b)
--
-- WHY: WP-2.10b gave a day's condition an interactive half — the clauses that
-- shift strain offer weights, tier thresholds and suppression, and that the
-- Workbench computes against. The Serpent needed no migration because
-- `serpent_weeks.modifiers` is already TEXT[] and holds [...anomalies,
-- ...clauses]. `signal_days.modifier` is a singular TEXT, so the day's clauses
-- need a column of their own.
--
-- WITHOUT THIS MIGRATION THE SIGNAL IS BROKEN, not merely un-clause-d:
-- `src/lib/server/signal.ts` now calls ensure_signal_day with `p_clauses`, and
-- 049 declared a seven-parameter function. Postgres resolves by signature, so
-- the eight-argument call finds no function and every day derivation fails.
-- The unit suite cannot see this — it drives a fake client that records the
-- params rather than a database that type-checks them. Caught by reading the
-- shipped 049 signature against the new call site.
--
-- SAFETY: additive and forward-only. The column defaults to '{}', so every
-- existing day reads as "no clauses" — which is exactly what those days were.
-- The function is CREATE OR REPLACE at a NEW signature; 049's seven-parameter
-- version is dropped explicitly rather than left as an overload, because two
-- resolvable signatures is how a caller silently keeps hitting the old one.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

ALTER TABLE signal_days
  ADD COLUMN IF NOT EXISTS clauses TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN signal_days.clauses IS
  'The day''s condition clauses (WP-2.10b), server-derived from the UTC '
  'calendar by signalClausesForDay and stored so the drift tripwire can '
  'compare a live day against the caller''s derivation. Namespaced ids '
  '(clause:*) — never a bare anomaly word, which lives in `modifier`. Empty '
  'for every day derived before this migration, which is what those days were.';

-- ---------------------------------------------------------------------------
-- 2. The derivation entry point, at its new signature
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ensure_signal_day(
  p_day         DATE,
  p_starts_at   TIMESTAMPTZ,
  p_ends_at     TIMESTAMPTZ,
  p_seed        TEXT,
  p_modifier    TEXT,
  p_strain_tilt TEXT,
  p_clauses     TEXT[],
  p_objectives  JSONB
)
RETURNS TABLE (
  id          UUID,
  day         DATE,
  starts_at   TIMESTAMPTZ,
  ends_at     TIMESTAMPTZ,
  seed        TEXT,
  modifier    TEXT,
  strain_tilt TEXT,
  clauses     TEXT[],
  objectives  JSONB
)
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
-- The OUT-variable collision note from 049 still applies, and now covers
-- `clauses` as well as `day`: both are RETURNS TABLE names that also name
-- columns of signal_days.
#variable_conflict use_column
DECLARE
  v_row signal_days%ROWTYPE;
BEGIN
  IF p_day IS NULL OR p_seed IS NULL OR p_starts_at IS NULL
     OR p_ends_at IS NULL OR p_modifier IS NULL THEN
    RAISE EXCEPTION 'ensure_signal_day requires a fully derived day';
  END IF;

  INSERT INTO signal_days (day, starts_at, ends_at, seed, modifier, strain_tilt, clauses, objectives)
  VALUES (
    p_day, p_starts_at, p_ends_at, p_seed, p_modifier,
    COALESCE(p_strain_tilt, ''), COALESCE(p_clauses, '{}'),
    COALESCE(p_objectives, '[]'::JSONB)
  )
  -- The day is written ONCE and never rewritten. A caller that loses the
  -- 00:00 UTC race inserts nothing and RETURNING gives it no row.
  ON CONFLICT (day) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    -- Either the day already existed, or we just lost the boundary race. In
    -- both cases the winning row is committed and visible by now. Reading the
    -- STORED row (never EXCLUDED) is also exactly what the drift tripwire
    -- below has to compare the caller's derivation against.
    SELECT * INTO v_row FROM signal_days d WHERE d.day = p_day;
  END IF;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'ensure_signal_day could not resolve day %', p_day;
  END IF;

  -- Drift tripwire. A live day's conditions are never rewritten.
  IF v_row.seed IS DISTINCT FROM p_seed THEN
    RAISE EXCEPTION
      'Signal day % already exists with seed % (caller derived %) — the day derivation changed under a live day',
      p_day, v_row.seed, p_seed;
  END IF;
  IF v_row.modifier IS DISTINCT FROM p_modifier THEN
    RAISE EXCEPTION
      'Signal day % already exists with a different condition — the day derivation changed under a live day',
      p_day;
  END IF;
  -- Clauses join the tripwire on the same terms as the modifier: a clause draw
  -- that changed under a live day is the same class of fault as a condition
  -- that did, and it moves real payouts. Days stored before this migration
  -- hold '{}', and a caller deriving clauses for such a day RAISEs rather than
  -- silently re-clausing a day players already hunted.
  IF v_row.clauses IS DISTINCT FROM COALESCE(p_clauses, '{}') THEN
    RAISE EXCEPTION
      'Signal day % already exists with a different clause set — the clause draw changed under a live day',
      p_day;
  END IF;
  IF v_row.objectives IS DISTINCT FROM COALESCE(p_objectives, '[]'::JSONB) THEN
    RAISE EXCEPTION
      'Signal day % already exists with a different objective set — the day derivation changed under a live day',
      p_day;
  END IF;

  RETURN QUERY
  SELECT v_row.id, v_row.day, v_row.starts_at, v_row.ends_at,
         v_row.seed, v_row.modifier, v_row.strain_tilt, v_row.clauses,
         v_row.objectives;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ---------------------------------------------------------------------------
-- 3. Retire the seven-parameter version
-- ---------------------------------------------------------------------------
--
-- Dropped, not left alongside. Postgres would happily keep both as overloads,
-- and a caller that omitted p_clauses would keep resolving to the old one —
-- writing days with no clauses while the engine played them with clauses, the
-- precise engine/server divergence this wave exists to eliminate.

DROP FUNCTION IF EXISTS ensure_signal_day(
  DATE, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, JSONB
);

REVOKE ALL ON FUNCTION ensure_signal_day(
  DATE, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT[], JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION ensure_signal_day(
  DATE, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT[], JSONB
) FROM anon;
REVOKE ALL ON FUNCTION ensure_signal_day(
  DATE, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT[], JSONB
) FROM authenticated;
GRANT EXECUTE ON FUNCTION ensure_signal_day(
  DATE, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT[], JSONB
) TO service_role;

COMMIT;
