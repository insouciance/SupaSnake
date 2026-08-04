/**
 * The settlement projection of a run's genome.
 *
 * WHY THIS EXISTS
 *
 * The durable settlement payload (`pending_game_session_ends.envelope` for an
 * earning run, `complete_free_run_continuity(p_facts)` for practice) embedded
 * the ENTIRE genome, including two unbounded per-tick arrays: `journal` and
 * `targets`. On a long run those dominate the payload — a real stranded
 * production run measured 31,384 B of `journal` and 29,223 B of `targets` in a
 * 65,177 B snapshot — and pushed the envelope past the 65,536-byte guard in
 * `store_pending_game_session_end` (060) and `complete_free_run_continuity`
 * (063).
 *
 * That rejection is deterministic and permanent: the payload is rebuilt
 * identically from frozen terminal facts on every retry, so the run can never
 * settle, its row keeps `ended_at IS NULL`, and `readActiveRun` keeps refusing
 * every future start on the account. Two real accounts were locked out this
 * way. Migration 066 raises the caps, but a cap alone only moves the wall:
 * the payload must not carry unbounded per-tick data in the first place.
 *
 * WHAT IS SAFE TO DROP, AND WHY IT IS LOSSLESS
 *
 * The projection is derived from an exhaustive enumeration of every consumer
 * of the settlement snapshot's genome. The snapshot reaches consumers via
 * `adopt_pending_game_session_end` → `game_sessions.progression_settlement_payload`
 * → `settle_game_session_progression_core` (061:2455-2458), which passes
 * `v_payload -> 'genome'` to `record_session_codex_discoveries`. No other
 * runtime reader exists: `persist_run_impact_envelope` reads no genome, and no
 * TypeScript path reads `progression_settlement_payload`.
 *
 * `targets` — read by NOTHING. No migration and no `src/` path references it.
 * Dropped in full.
 *
 * `journal` — read by exactly four SQL helpers in 065, each of which extracts
 * only a fixed, tiny set of scalar fields per event:
 *
 *   genome_record_gene_ids          (065:476-487)  geneId, gene_id,
 *                                                  payload.geneId, payload.gene_id,
 *                                                  id (gated on type|kind)
 *   genome_record_splice_ids        (065:551-566)  spliceId, splice_id,
 *                                                  payload.spliceId, payload.splice_id,
 *                                                  id (gated on type|kind)
 *   genome_record_strain_milestones (065:596-616)  strain, payload.strain
 *                                                  (gated on type|kind)
 *   genome_record_infuse_count      (065:634-648)  COUNT of events by type|kind
 *
 * So keeping `type`, `kind`, `id`, `geneId`, `gene_id`, `spliceId`,
 * `splice_id`, `strain`, and a `payload` narrowed to the same id/strain keys
 * reproduces every one of those extractions exactly. Three of the four use
 * `SELECT DISTINCT`, and the fourth is a `COUNT`, so this projection preserves
 * event MULTIPLICITY and does not deduplicate — dropping a duplicate infuse
 * event would silently change `genome_record_infuse_count`.
 *
 * Everything else in the genome (instances, slots, picks, discoveredSplices,
 * activeSplices, splices, retired, expressions, apexes, infuses, ledger,
 * settlement, ftue, genePool, …) is bounded and is copied through untouched,
 * because `genome_record_gene_ids`/`genome_record_splice_ids` read several of
 * them directly.
 *
 * NOTHING IS LOST FROM THE RUN RECORD. The complete, unprojected genome —
 * journal, targets and all — remains in `game_sessions.continuity_terminal_facts`,
 * whose own cap is 262,144 (063:117, 063:801) and which nothing here rewrites.
 *
 * Note that `game_sessions.genome` is NOT a second full copy after settlement:
 * `adopt_pending_game_session_end` overwrites that column with the snapshot's
 * genome (061:1461-1463), so it holds the projected form once a run settles.
 * That is safe because every reader of the column — all of them in 032, the
 * genome engagement counters — reads only `v`, `picks`, `splices`, `apexes`
 * and `expressions` (032:184-243), every one of which this projection copies
 * through untouched. The terminal facts remain the audit record.
 */

/** Per-event journal keys any 065 consumer can read. Order-insensitive. */
const JOURNAL_SCALAR_KEYS = [
  'type',
  'kind',
  'id',
  'geneId',
  'gene_id',
  'spliceId',
  'splice_id',
  'strain',
] as const;

/** The `payload` sub-keys those same consumers reach through `#>>`. */
const JOURNAL_PAYLOAD_KEYS = [
  'geneId',
  'gene_id',
  'spliceId',
  'splice_id',
  'strain',
] as const;

/**
 * The journal keys the 065 helpers look for, in their own precedence order:
 * `eventJournal`, then `events`, then `journal`. Every one that is present is
 * projected, so the projection cannot depend on which name the engine used.
 */
const JOURNAL_FIELDS = ['eventJournal', 'events', 'journal'] as const;

/** Per-tick arrays no consumer reads. */
const DROPPED_FIELDS = ['targets'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function projectJournalEntry(entry: unknown): unknown {
  // A bare string entry is already minimal, and `genome_record_items` yields it
  // verbatim (`item #>> '{}'` is read for splice ids). Keep it as-is.
  if (!isRecord(entry)) return entry;
  const projected: Record<string, unknown> = {};
  for (const key of JOURNAL_SCALAR_KEYS) {
    if (entry[key] !== undefined) projected[key] = entry[key];
  }
  const payload = entry.payload;
  if (isRecord(payload)) {
    const projectedPayload: Record<string, unknown> = {};
    for (const key of JOURNAL_PAYLOAD_KEYS) {
      if (payload[key] !== undefined) projectedPayload[key] = payload[key];
    }
    if (Object.keys(projectedPayload).length > 0) {
      projected.payload = projectedPayload;
    }
  }
  return projected;
}

function projectJournal(journal: unknown): unknown {
  // `genome_record_items` accepts both arrays and objects, so both shapes are
  // preserved in kind — an object journal keeps its keys, an array keeps its
  // order and length.
  if (Array.isArray(journal)) return journal.map(projectJournalEntry);
  if (isRecord(journal)) {
    const projected: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(journal)) {
      projected[key] = projectJournalEntry(value);
    }
    return projected;
  }
  return journal;
}

/**
 * Narrow a validated genome to the fields the durable settlement payload needs.
 * Returns the input unchanged when it is not an object (notably `null`, which
 * is what an invalid run stores).
 */
export function projectGenomeForSettlement(genome: unknown): unknown {
  if (!isRecord(genome)) return genome;
  const projected: Record<string, unknown> = { ...genome };
  for (const field of DROPPED_FIELDS) {
    delete projected[field];
  }
  for (const field of JOURNAL_FIELDS) {
    if (projected[field] !== undefined) {
      projected[field] = projectJournal(projected[field]);
    }
  }
  return projected;
}

/**
 * Byte length of a JSON value as Postgres measures it.
 *
 * THIS IS NOT `JSON.stringify(value).length`, and the difference is exactly
 * what hid the production overflow. Postgres validates
 * `octet_length(payload::TEXT)`, and `jsonb`'s canonical text form inserts a
 * space after every `:` and `,`. The stranded production envelope measured
 * 63,687 B with compact `JSON.stringify` — comfortably under the 65,536 cap —
 * but 70,113 B as `jsonb::text`, which is what actually rejected it. Any guard
 * that measures the compact form will keep passing payloads the database then
 * refuses.
 */
export function jsonbTextByteLength(value: unknown): number {
  return Buffer.byteLength(jsonbText(value), 'utf8');
}

function jsonbText(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map(jsonbText).join(', ')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => `${JSON.stringify(key)}: ${jsonbText(entry)}`)
      .join(', ')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
