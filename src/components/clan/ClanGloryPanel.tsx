'use client';

/** Two earned prestige seats, backed by verified battle evidence. */

import { useMemo, useState } from 'react';
import { PlayerCard } from '@/components/identity/PlayerCard';
import { IconCrown } from '@/components/ui/icons';
import {
  clanAction,
  type ClanFullView,
  type ClanRosterEntry,
} from './useClanFull';

interface ClanGloryPanelProps {
  accessToken?: string;
  viewerUserId?: string;
  view: ClanFullView;
  onChanged: () => void;
  compact?: boolean;
}

function candidateName(member: ClanRosterEntry): string {
  return member.identity?.displayHandle ?? 'Handler';
}

function termDays(seconds: number): string {
  const days = Math.ceil(seconds / 86_400);
  if (days <= 0) return 'no tenure minimum';
  return `${days} day${days === 1 ? '' : 's'} in the clan`;
}

export function ClanGloryPanel({
  accessToken,
  viewerUserId,
  view,
  onChanged,
  compact = false,
}: ClanGloryPanelProps) {
  const terms = view.glory?.terms ?? view.competitiveConfig?.glory;
  const seats = useMemo(() => view.glory?.seats ?? [], [view.glory?.seats]);
  const canAssign = view.membership?.permissions.assignGlory === true;
  const maxSeats = terms?.maxSeats ?? 2;
  const [chosenSeat, setChosenSeat] = useState<number | null>(null);
  const [chosenUserId, setChosenUserId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const visibleSeats = useMemo(
    () => [...seats].sort((a, b) => {
      const stateOrder = { pending: 0, active: 1, completed: 2 } as const;
      return stateOrder[a.state] - stateOrder[b.state] || a.seat - b.seat;
    }),
    [seats]
  );
  const candidates = useMemo(
    () => (view.roster ?? [])
      .filter((member) => member.contribution.hasEligibleContribution)
      .sort((a, b) => (a.contribution.rank ?? 999) - (b.contribution.rank ?? 999)),
    [view.roster]
  );
  const selected = candidates.find((candidate) => candidate.userId === chosenUserId) ?? null;

  const assign = async () => {
    if (!selected || !chosenSeat) return;
    setBusy(true);
    setMessage(null);
    const result = await clanAction(accessToken, {
      action: 'assign_glory',
      targetUserId: selected.userId,
      seat: chosenSeat,
    });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error ?? 'Glory assignment failed');
      return;
    }
    setConfirming(false);
    setChosenSeat(null);
    setChosenUserId('');
    setMessage(`${candidateName(selected)} will hold Glory Seat ${chosenSeat} next battle.`);
    onChanged();
  };

  return (
    <section className="panel-glow [--glow:#f59e0b] p-4 sm:p-5" data-testid="clan-glory">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-arcade border border-amber-400/55 bg-amber-400/10 text-amber-300">
          <IconCrown size={22} />
        </span>
        <div>
          <h2 className="heading-display text-xl text-bone-white">Glory Members</h2>
          <p className="mt-1 text-sm font-body text-beige/65">
            Two public seats for proven clan contributors. The battle evidence stays attached.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: maxSeats }, (_, index) => index + 1).map((seatNumber) => {
          const seat = visibleSeats.find((item) => item.seat === seatNumber && item.state !== 'completed')
            ?? visibleSeats.find((item) => item.seat === seatNumber);
          return (
            <div key={seatNumber} className="rounded-arcade border border-amber-300/30 bg-void/50 p-3" data-testid={`glory-seat-${seatNumber}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="label-arcade text-amber-300">Glory Seat {seatNumber}</p>
                {seat && <span className="text-[10px] font-display uppercase text-beige/50">{seat.state}</span>}
              </div>
              {seat ? (
                <>
                  <div className="mt-2">
                    {seat.holderIdentity ? <PlayerCard identity={seat.holderIdentity} variant="row" /> : <p className="font-display text-bone-white">Handler</p>}
                  </div>
                  <p className="mt-2 text-xs font-body text-beige/60">
                    Earned with rank #{seat.evidenceRank} · {seat.evidenceDepth.toLocaleString()} Depth · {seat.evidenceContributionCount}/5 results
                  </p>
                  {seat.rewarded && <p className="mt-1 text-xs font-body text-rarity-uncommon">{seat.rewardDna.toLocaleString()} DNA awarded</p>}
                </>
              ) : (
                <p className="mt-3 text-sm font-body text-beige/50">Unassigned</p>
              )}
            </div>
          );
        })}
      </div>

      {!compact && terms && (
        <p className="mt-3 text-xs font-body text-beige/50" data-testid="glory-terms">
          Terms: verified contribution of at least {terms.minimumContributionDepth.toLocaleString()} Depth, {termDays(terms.minimumTenureSeconds)}, effective next battle. The holder earns {terms.rewardDna.toLocaleString()} DNA once if they contribute in that battle. {terms.allowOwnerSelfAward ? 'Leader self-award is allowed.' : 'Leader self-award is disabled.'}
        </p>
      )}

      {!compact && canAssign && (
        <details className="mt-4 rounded-arcade border border-scale-blue-light/40 bg-void/35 p-3">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center font-display uppercase text-bone-white">
            Assign next battle&apos;s seats
          </summary>
          <div className="space-y-3 pt-3">
            <label className="block text-sm font-body text-beige">
              Seat
              <select value={chosenSeat ?? ''} onChange={(event) => setChosenSeat(Number(event.target.value) || null)} className="mt-1 min-h-[44px] w-full rounded-arcade border border-scale-blue-light/60 bg-void/70 px-3 text-bone-white">
                <option value="">Choose a seat</option>
                {Array.from({ length: maxSeats }, (_, index) => <option key={index + 1} value={index + 1}>Glory Seat {index + 1}</option>)}
              </select>
            </label>
            <label className="block text-sm font-body text-beige">
              Contributor
              <select value={chosenUserId} onChange={(event) => setChosenUserId(event.target.value)} className="mt-1 min-h-[44px] w-full rounded-arcade border border-scale-blue-light/60 bg-void/70 px-3 text-bone-white">
                <option value="">Choose a verified contributor</option>
                {candidates.map((candidate) => {
                  const selfDisabled = candidate.userId === viewerUserId && !terms?.allowOwnerSelfAward;
                  return <option key={candidate.userId} value={candidate.userId} disabled={selfDisabled}>#{candidate.contribution.rank} · {candidateName(candidate)} · {candidate.contribution.bestFiveDepth?.toLocaleString()} Depth{selfDisabled ? ' · self-award disabled' : ''}</option>;
                })}
              </select>
            </label>
            {candidates.length === 0 && <p className="text-xs font-body text-beige/55">A member needs a verified positive-Energy contribution before they can be considered.</p>}
            <button type="button" disabled={!selected || !chosenSeat} onClick={() => setConfirming(true)} className="btn-go min-h-[44px] px-5">
              Review assignment
            </button>
          </div>
        </details>
      )}

      {message && <p className="mt-3 text-sm font-body text-beige" role="status">{message}</p>}

      {confirming && selected && chosenSeat && terms && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4" role="alertdialog" aria-modal="true" aria-labelledby="glory-confirm-title" aria-describedby="glory-confirm-description" data-testid="glory-confirmation">
          <div className="panel-elevated w-full max-w-md p-6">
            <p className="label-arcade text-amber-300">Glory Seat {chosenSeat}</p>
            <h3 id="glory-confirm-title" className="mt-1 heading-display text-2xl text-bone-white">Recognize {candidateName(selected)}?</h3>
            <p id="glory-confirm-description" className="mt-2 text-sm font-body text-beige/75">
              Their verified rank #{selected.contribution.rank} and {selected.contribution.bestFiveDepth?.toLocaleString()} Depth become the public evidence. The seat locks for the next battle; {terms.rewardDna.toLocaleString()} DNA is awarded once only if they contribute there.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="btn-neutral min-h-[44px] px-4">Cancel</button>
              <button type="button" disabled={busy} onClick={() => void assign()} className="btn-go min-h-[44px] px-4">{busy ? 'Assigning…' : 'Confirm Glory'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default ClanGloryPanel;
