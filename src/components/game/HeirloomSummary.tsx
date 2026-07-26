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
 * So the traits are ungated here and each one is tappable: `InfoPopover`
 * puts the effect and the cost one tap away on a touch device, which is the
 * defect this work package exists to fix.
 *
 * There is deliberately **no `btn-go`** anywhere in this component. Run
 * Setup has exactly one emphasised action (§5), and its test pins that.
 */

import { TraitChip, EmptyTraitSlot } from '@/components/traits/TraitChip';
import { InfoPopover } from '@/components/ui/InfoPopover';
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
      className={`panel mx-auto max-w-lg space-y-2 p-3 text-left ${className}`}
      data-testid="heirloom-summary"
    >
      <p className="label-arcade text-cosmic">Heirlooms</p>

      <div className="flex flex-wrap items-center gap-1.5">
        {traits.map((id) => {
          const entry = describeEntry('trait', id);
          if (!entry) return null;
          return (
            <InfoPopover
              key={id}
              testId={`trait-${id}`}
              title={entry.name}
              effect={entry.effect}
              cost={entry.cost}
              notice={entry.runNotice?.text}
              label={`${entry.name}: what it does`}
            >
              <TraitChip traitId={id} size="md" />
            </InfoPopover>
          );
        })}
        {Array.from({ length: empties }).map((_, index) => (
          <EmptyTraitSlot key={`empty-${index}`} size="md" />
        ))}
      </div>

      {traits.length === 0 && (
        <p className="font-body text-xs text-beige/60" data-testid="heirloom-empty">
          No heirloom yet — breed in the Lab to fill this slot. Traits are live
          from the first food of every run.
        </p>
      )}

      {notices.map(({ id, tone, text }) => (
        <p
          key={id}
          data-testid={`heirloom-notice-${id}`}
          className={`font-body text-xs ${
            tone === 'warning' ? 'text-strike-red' : 'text-beige/60'
          }`}
        >
          {text}
        </p>
      ))}
    </div>
  );
}

export default HeirloomSummary;
