'use client';

/**
 * HeirloomSummary — what the equipped snake brings to this run (WP-2.07a).
 *
 * A component rather than inline JSX because `src/app/game/page.tsx` is a
 * declared hot file: this keeps its diff to a handful of lines and makes the
 * block unit-testable on its own.
 *
 * ── Why this is NOT gated on `spawnPointsUnlocked` ───────────────────────
 *
 * Today's Build Seed block gates two different facts behind one flag, and
 * only one of them deserves it:
 *
 * - **Strain pips genuinely do nothing** below the spawn-point unlock:
 *   `deriveHeirloom` returns `heirloom: {}` outright, so a pip there would
 *   be a picture of a number the server never reads. Those stay gated,
 *   inside the existing Build Seed panel.
 * - **Traits are always live.** The settlement path reads the equipped
 *   snake's traits unconditionally from its server-side row — from the
 *   player's very first run. Hiding them was never a gate, only a silence,
 *   and it is the silence the owner's playtest hit: Ascetic removes every
 *   mutation food from a run and nothing on the setup screen said so.
 *
 * So the traits are ungated here and each one is tappable: `TraitChip
 * interactive` puts the effect and the cost one tap away on a touch device,
 * which is the defect this work package exists to fix. (WP-2.07a wrapped
 * each chip in an `InfoPopover` by hand because it was not allowed to touch
 * `TraitChip`; WP-2.07b moved that wrapping into the chip itself, so every
 * chip site explains itself the same way.)
 *
 * There is deliberately **no `btn-go`** anywhere in this component. Run
 * Setup has exactly one emphasised action (§5), and its test pins that.
 */

import { TraitChip, EmptyTraitSlot } from '@/components/traits/TraitChip';
import {
  describe as describeEntry,
  type LexiconNoticeTone,
} from '@/shared/game/lexicon';
import { MAX_TRAIT_SLOTS, type TraitId } from '@/shared/game/traits';

export interface HeirloomSummaryProps {
  /** Trait ids in slot order, already sanitized by the API mapper. */
  traits: TraitId[];
  /** The snake's slot count (rarity + generation). Defaults to one slot. */
  slots?: number;
  className?: string;
}

export function HeirloomSummary({
  traits,
  slots,
  className = '',
}: HeirloomSummaryProps) {
  const slotCount = Math.min(
    MAX_TRAIT_SLOTS,
    Math.max(slots ?? 1, traits.length, 1)
  );
  const empties = Math.max(0, slotCount - traits.length);

  const notices: { id: TraitId; tone: LexiconNoticeTone; text: string }[] = [];
  for (const id of traits) {
    const notice = describeEntry('trait', id)?.runNotice;
    if (notice) notices.push({ id, ...notice });
  }

  return (
    <div
      /*
       * A REGION INSIDE THE PAPER TRAY, not a panel on the deck.
       *
       * `.panel` is the DECK family — a saturated dark-blue plate with an ink
       * contour and a void drop — and it was correct while this block sat in a
       * dark overlay. Setup is printed on the chamber's stock now, so a deck
       * plate in the middle of it is the one foreign object on the surface.
       * It becomes a recess cut into the tray: a fill step, no border, because
       * the tray already drew the only frame this surface gets (one tray, one
       * frame).
       *
       * ── COMPACT, NOT CUT (owner ruling, 2026-08-08) ────────────────────
       *
       * "ruleset line and heirloom block can remain, but COMPACT." Every fact
       * this block ever stated is still stated: the chips, the empty slots,
       * the potential of a traitless snake, and every run notice. What went is
       * WHITESPACE and one line break — the "Heirlooms" label now sits ON the
       * chip row rather than above it, which is a label doing what a label
       * does at no cost to what it labels. The recess keeps its padding, only
       * less of it. Setup's binding constraint is that the Energy reactor
       * fits above the fold on a 320x568 phone, so a row saved here is a row
       * the reactor gets.
       */
      className={`paper-recess mx-auto max-w-lg space-y-0.5 px-2 py-1.5 text-left sm:space-y-1 sm:px-3 sm:py-2 ${className}`}
      data-testid="heirloom-summary"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="label-arcade shrink-0 text-[10px] leading-none text-ink/60">
          Heirlooms
        </p>
        {traits.map((id) => (
          <TraitChip key={id} traitId={id} size="md" interactive />
        ))}
        {Array.from({ length: empties }).map((_, index) => (
          <EmptyTraitSlot key={`empty-${index}`} size="md" />
        ))}
      </div>

      {traits.length === 0 && (
        <p
          className="font-body text-[11px] leading-tight text-ink/70"
          data-testid="heirloom-empty"
        >
          No heirloom yet — breed in the Lab to fill this slot. Traits are live
          from the first food of every run.
        </p>
      )}

      {notices.map(({ id, tone, text }) => (
        <p
          key={id}
          data-testid={`heirloom-notice-${id}`}
          className={`font-body text-[11px] leading-tight ${
            tone === 'warning' ? 'text-strike-red' : 'text-ink/70'
          }`}
        >
          {text}
        </p>
      ))}
    </div>
  );
}

export default HeirloomSummary;
