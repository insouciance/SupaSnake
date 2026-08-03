'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useDialogFocusTrap } from '@/hooks/useDialogFocusTrap';
import { GeneGlyph, StrainGlyph } from '@/components/game/cockpit/CockpitGlyphs';
import { STRAINS } from '@/shared/game/strains';
import { TacticalLoomLite } from './TacticalLoomLite';
import decisionStyles from './TacticalLoomDecision.module.css';
import type {
  TacticalLoomCandidate,
  TacticalLoomDecisionModel,
  TacticalLoomReplacementChoice,
} from './tacticalLoomPresentation';

type ChoiceKey = 'candidate-0' | 'candidate-1' | 'decline';

export interface TacticalLoomDecisionProps {
  model: TacticalLoomDecisionModel;
  locked: boolean;
  onChoose: (candidateIndex: 0 | 1, replacementSlot?: number) => void;
  onDecline: (pinCandidateIndex?: 0 | 1) => void;
  /** Portal mutation inspection may return without consuming the portal. */
  onBack?: () => void;
}

function choiceKey(index: 0 | 1): ChoiceKey {
  return `candidate-${index}`;
}

export function TacticalLoomDecision({
  model,
  locked,
  onChoose,
  onDecline,
  onBack,
}: TacticalLoomDecisionProps) {
  // Deliberately blank: focus is navigation, never consent. A fresh offer
  // presents two equal possibilities without silently recommending A.
  const [selected, setSelected] = useState<ChoiceKey | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [recodePhase, setRecodePhase] = useState(false);
  const [replacementSlot, setReplacementSlot] = useState<number | null>(null);
  const [declineOptionId, setDeclineOptionId] = useState<string | null>(
    model.decline.options?.[0]?.id ?? null
  );
  const defaultDeclineOptionId = model.decline.options?.[0]?.id ?? null;
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstChoiceRef = useRef<HTMLButtonElement>(null);
  useDialogFocusTrap(dialogRef, !locked);

  const selectedIndex: 0 | 1 | null =
    selected === 'candidate-0' ? 0 : selected === 'candidate-1' ? 1 : null;
  const selectedCandidate: TacticalLoomCandidate | null =
    selectedIndex === null ? null : model.candidates[selectedIndex];
  const replacementChoices = useMemo(
    () => selectedCandidate?.replacementChoices ?? [],
    [selectedCandidate]
  );
  const selectedReplacement: TacticalLoomReplacementChoice | null =
    replacementChoices.find((choice) => choice.slotIndex === replacementSlot) ?? null;
  const declineSelected = selected === 'decline';
  const selectedDeclineOption = declineSelected
    ? model.decline.options?.find((option) => option.id === declineOptionId)
      ?? model.decline.options?.[0]
      ?? null
    : null;
  const consequence = recodePhase && selectedReplacement
    ? selectedReplacement.consequence
    : selectedCandidate?.consequence
      ?? (declineSelected
        ? selectedDeclineOption?.consequence ?? model.decline.consequence
        : null);
  const action = recodePhase && selectedCandidate
    ? `${selectedCandidate.action} ${selectedCandidate.name} · replace ${selectedReplacement?.label ?? 'one locus'}`
    : selectedCandidate?.action ?? (declineSelected
      ? selectedDeclineOption
        ? `${model.decline.action} · ${selectedDeclineOption.label}`
        : model.decline.action
      : '');

  useEffect(() => {
    setSelected(null);
    setDetailsOpen(false);
    setRecodePhase(false);
    setReplacementSlot(null);
    setDeclineOptionId(defaultDeclineOptionId);
  }, [defaultDeclineOptionId, model.decisionId]);

  useEffect(() => {
    if (!locked) {
      dialogRef.current
        ?.querySelector<HTMLButtonElement>('[role="radio"]:not(:disabled)')
        ?.focus();
    }
  }, [locked]);

  const select = useCallback((next: ChoiceKey) => {
    if (
      (next === 'candidate-0' && model.candidates[0].disabledReason)
      || (next === 'candidate-1' && model.candidates[1].disabledReason)
    ) {
      return;
    }
    setSelected(next);
    setRecodePhase(false);
    setReplacementSlot(null);
    if (next === 'decline') {
      setDeclineOptionId(model.decline.options?.[0]?.id ?? null);
    }
  }, [model.candidates, model.decline.options]);

  const confirm = useCallback(() => {
    if (locked || selected === null) return;
    if (declineSelected) {
      onDecline(selectedDeclineOption?.pinCandidateIndex);
      return;
    }
    if (selectedIndex === null) return;
    if (selectedCandidate?.disabledReason) return;
    if (replacementChoices.length > 0 && !recodePhase) {
      setRecodePhase(true);
      // Entering Recode reveals the legal loci; it does not silently choose
      // one. Focus is navigation and can never become irreversible consent.
      setReplacementSlot(null);
      return;
    }
    if (recodePhase) {
      if (selectedReplacement && !selectedReplacement.disabledReason) {
        onChoose(selectedIndex, selectedReplacement.slotIndex);
      }
      return;
    }
    onChoose(selectedIndex);
  }, [
    locked,
    onChoose,
    onDecline,
    declineSelected,
    recodePhase,
    replacementChoices,
    selectedDeclineOption,
    selectedCandidate,
    selected,
    selectedIndex,
    selectedReplacement,
  ]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (locked) return;
      const interactiveTarget =
        event.target instanceof Element &&
        event.target.closest(
          'button, a, input, select, textarea, [role="button"], [role="radio"], [contenteditable="true"]'
        ) !== null;
      if (event.key === '1') {
        select('candidate-0');
        firstChoiceRef.current?.focus();
      } else if (event.key === '2') {
        select('candidate-1');
        dialogRef.current?.querySelector<HTMLButtonElement>('[data-testid="gene-option-1"]')?.focus();
      } else if (event.key === 'Escape') {
        if (recodePhase) {
          setRecodePhase(false);
          setReplacementSlot(null);
        } else if (onBack) {
          onBack();
        } else {
          select('decline');
          dialogRef.current?.querySelector<HTMLButtonElement>('[data-testid="gene-decline"]')?.focus();
        }
      } else if (
        (event.key === 'Enter' || event.key === ' ') &&
        selected !== null &&
        !interactiveTarget
      ) {
        confirm();
      } else {
        // Buttons and other controls keep their native Enter/Space behavior.
        // The capture shortcut must never turn Details, Back, or a radio
        // choice into a hidden gene confirmation.
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, [confirm, locked, onBack, recodePhase, select, selected]);

  const choices = useMemo(
    () => model.candidates.map((candidate, index) => ({
        key: choiceKey(index as 0 | 1),
        action: candidate.action,
        name: candidate.name,
        category: candidate.category,
        geneId: candidate.geneId,
        strains: candidate.strains,
        salience: candidate.consequence.salienceChip ?? candidate.consequence.effect,
        disabledReason: candidate.disabledReason,
      })),
    [model.candidates]
  );

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tactical-loom-title"
      tabIndex={-1}
      className="absolute inset-0 z-30 flex items-end justify-center bg-gradient-to-t from-void-deep/40 via-void-deep/10 to-transparent sm:items-center sm:justify-end sm:bg-gradient-to-l"
      data-testid="gene-choice-overlay"
      data-rules-version={model.rulesVersion}
    >
      <div
        className={`${decisionStyles.decisionPanel} panel-elevated flex h-auto max-h-[min(66dvh,680px)] w-full flex-col overflow-hidden rounded-b-none border-b-0 p-3 animate-pop-in sm:ml-auto sm:max-h-[min(88dvh,720px)] sm:w-[min(36rem,48vw)] sm:max-w-none sm:rounded-l-[20px] sm:rounded-r-none sm:border-b sm:border-r-0 sm:p-5`}
        style={{ '--glow': '#a855f7' } as CSSProperties}
      >
        <header className="flex shrink-0 flex-col items-stretch gap-1.5 border-b border-scale-blue-light/20 pb-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0">
            <p className="font-body text-sm font-bold uppercase tracking-[0.14em] text-cosmic">
              Simulation held · {model.dynasty}
            </p>
            <h2 id="tactical-loom-title" className="heading-display text-xl leading-tight text-[#c4b5fd] text-glow sm:text-2xl">
              {model.title}
            </h2>
            </div>
          </div>
          <p className="font-body text-sm leading-snug text-beige/50 sm:max-w-[12rem] sm:text-right">
            {model.sourceLabel}
          </p>
        </header>

        <div
          role="radiogroup"
          aria-label="Genome decision"
          className={`${decisionStyles.choiceWeave} shrink-0`}
          data-testid="loom-choice-rail"
          data-responsive-composition="portrait-bottom landscape-side"
        >
          {choices.map((choice, index) => {
            const active = selected === choice.key;
            const testId = `gene-option-${index}`;
            const accent = choice.strains[0]
              ? STRAINS[choice.strains[0]].color
              : '#a855f7';
            return (
              <button
                key={choice.key}
                ref={index === 0 ? firstChoiceRef : undefined}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`${index === 0 ? 'A' : 'B'}, ${choice.action} ${choice.name}${choice.strains.length > 0 ? `, Strains ${choice.strains.map((id) => STRAINS[id].name).join(', ')}` : ''}`}
                aria-keyshortcuts={index === 0 ? '1' : '2'}
                disabled={locked || Boolean(choice.disabledReason)}
                onClick={() => select(choice.key)}
                data-testid={testId}
                data-active={active ? 'true' : 'false'}
                className={decisionStyles.choiceToken}
                style={{ '--choice-accent': accent } as CSSProperties}
              >
                <span className={decisionStyles.choiceCore} aria-hidden="true">
                  <i className={decisionStyles.choiceGlyph}>
                    <GeneGlyph id={choice.geneId ?? 'loom-decline'} />
                  </i>
                </span>
                <span className={decisionStyles.choiceAction}>
                  {index === 0 ? 'A' : 'B'} · {choice.action}
                </span>
                <span className={decisionStyles.choiceName} data-testid={`${testId}-name`}>
                  {choice.name}
                </span>
                {choice.strains.length > 0 ? (
                  <span className={decisionStyles.choiceStrains} aria-label={`Strains ${choice.strains.map((id) => STRAINS[id].name).join(', ')}`}>
                    {choice.strains.map((id) => (
                      <span
                        key={id}
                        className={decisionStyles.choiceStrain}
                        style={{ color: STRAINS[id].color }}
                        data-testid={`${testId}-strain-${id}`}
                      >
                        <i aria-hidden="true"><StrainGlyph id={id} /></i>
                        {STRAINS[id].name.toUpperCase()}
                      </span>
                    ))}
                  </span>
                ) : null}
                <span className={decisionStyles.choiceSignal} data-testid={`${testId}-salience`}>
                  {choice.salience}
                </span>
                {choice.disabledReason ? (
                  <span className={decisionStyles.choiceDisabled} title={choice.disabledReason}>
                    {choice.disabledReason}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className={decisionStyles.quietActions}>
          <button
            type="button"
            onClick={() => {
              if (onBack) {
                onBack();
                return;
              }
              select('decline');
            }}
            disabled={locked}
            className={decisionStyles.quietAction}
            data-testid={onBack ? 'loom-back-to-portal' : 'gene-decline'}
            data-active={declineSelected ? 'true' : 'false'}
          >
            {onBack ? '‹ Back to Portal' : 'Decline · keep this Genome'}
          </button>
        </div>

        <div
          id="tactical-loom-consequences"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [touch-action:pan-y]"
          data-testid="loom-scroll-region"
        >
          {recodePhase && selectedCandidate ? (
            <section className="mb-4 rounded-[14px] border border-venom-orange/40 bg-venom-orange/7 p-3" data-testid="loom-recode-step">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-display text-sm text-venom-orange">Recode · choose one locus</p>
                  <p className="mt-1 font-body text-sm text-beige/65">
                    {selectedCandidate.name} enters only after you choose what leaves the active Genome.
                  </p>
                </div>
                <span className="font-body text-xs font-bold uppercase tracking-[0.12em] text-beige/45">Step 2 of 2</span>
              </div>
              <div role="radiogroup" aria-label="Locus to replace" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {replacementChoices.map((choice) => (
                  <button
                    key={choice.slotIndex}
                    type="button"
                    role="radio"
                    aria-checked={replacementSlot === choice.slotIndex}
                    aria-label={`Replace ${choice.label}${choice.strains.length > 0 ? `, Strains ${choice.strains.map((id) => STRAINS[id].name).join(', ')}` : ''}, +${choice.growthCost} growth`}
                    disabled={Boolean(choice.disabledReason)}
                    onClick={() => setReplacementSlot(choice.slotIndex)}
                    className={`min-h-11 rounded-[10px] border px-2 py-2 text-left text-sm ${
                      replacementSlot === choice.slotIndex
                        ? 'border-venom-orange bg-venom-orange/12'
                        : 'border-scale-blue-light/25 bg-void/35'
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                    data-testid={`loom-replace-${choice.slotIndex}`}
                  >
                    <span className="block font-body text-sm font-bold leading-tight text-bone-white">{choice.label}</span>
                    {model.rulesVersion === 2 && choice.strains.length > 0 ? (
                      <span className={decisionStyles.replacementStrains}>
                        {choice.strains.map((id) => (
                          <span
                            key={id}
                            className={decisionStyles.choiceStrain}
                            style={{ color: STRAINS[id].color }}
                            data-testid={`loom-replace-${choice.slotIndex}-strain-${id}`}
                          >
                            <i aria-hidden="true"><StrainGlyph id={id} /></i>
                            {STRAINS[id].name.toUpperCase()}
                          </span>
                        ))}
                      </span>
                    ) : null}
                    <span className="mt-0.5 block font-mono text-sm text-venom-orange">+{choice.growthCost} growth</span>
                    {choice.disabledReason ? <span className="block text-sm text-beige/45">{choice.disabledReason}</span> : null}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {declineSelected && model.decline.options && model.decline.options.length > 0 ? (
            <section className="mb-4 rounded-[14px] border border-cosmic/35 bg-cosmic/6 p-3" data-testid="loom-anchor-decline-step">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-display text-sm text-cosmic">Loom Anchor · choose what DECLINE preserves</p>
                  <p className="mt-1 font-body text-sm text-beige/65">Pinning spends the charged Anchor. Declining without a pin keeps the charge only when the authoritative rule allows it.</p>
                </div>
                <span className="font-body text-xs font-bold uppercase tracking-[0.12em] text-beige/45">Before confirmation</span>
              </div>
              <div role="radiogroup" aria-label="Loom Anchor decline outcome" className="mt-3 grid gap-2 sm:grid-cols-3">
                {model.decline.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selectedDeclineOption?.id === option.id}
                    onClick={() => setDeclineOptionId(option.id)}
                    className={`min-h-11 rounded-[10px] border px-2.5 py-2 text-left text-sm ${
                      selectedDeclineOption?.id === option.id
                        ? 'border-cosmic bg-cosmic/12'
                        : 'border-scale-blue-light/25 bg-void/35'
                    }`}
                    data-testid={`loom-decline-option-${option.id}`}
                  >
                    <span className="block font-body text-sm font-bold leading-tight text-bone-white">{option.label}</span>
                    <span className="mt-0.5 block font-body text-sm leading-snug text-beige/50">{option.detail}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {!consequence ? (
            <div className={decisionStyles.emptyPrompt} data-testid="loom-empty-prompt">
              <strong>Choose a thread.</strong>
              <span>The two runes show their Strain and most important consequence now. Unfold only when you want the complete reaction map.</span>
            </div>
          ) : (
            <>
              {!recodePhase ? (
                <section className={decisionStyles.quickRead} data-testid="loom-quick-read" aria-live="polite">
                  <div className={decisionStyles.quickReadHeading}>
                    <span>{action}</span>
                    <strong>{selectedCandidate?.name ?? model.decline.name}</strong>
                    <em>{consequence.salienceChip ?? consequence.category}</em>
                  </div>
                  {consequence.trigger ? (
                    <p className={decisionStyles.quickTrigger}>
                      <b>WHEN</b><span>{consequence.trigger.label}</span>
                    </p>
                  ) : null}
                  <div className={decisionStyles.quickConsequences}>
                    <p data-tone="gain"><b>GAIN</b><span>{consequence.effect}</span></p>
                    <p data-tone="risk"><b>RISK</b><span>{consequence.cost}</span></p>
                  </div>
                </section>
              ) : null}

              {!recodePhase ? (
                <button
                  type="button"
                  className={decisionStyles.detailsToggle}
                  onClick={() => setDetailsOpen((open) => !open)}
                  aria-expanded={detailsOpen}
                  aria-controls="loom-full-reaction-map"
                  data-testid="loom-details-toggle"
                >
                  {detailsOpen ? 'FOLD DETAILS' : 'UNFOLD DETAILS'}
                  <span aria-hidden="true">{detailsOpen ? '⌃' : '⌄'}</span>
                </button>
              ) : null}

              {detailsOpen || recodePhase ? (
                <div id="loom-full-reaction-map" data-testid="loom-full-reaction-map">
                  <TacticalLoomLite
                    consequence={consequence}
                    action={action}
                    currentGenome={model.currentGenome}
                    geneId={selectedCandidate?.geneId ?? null}
                    geneName={selectedCandidate?.name ?? null}
                    strains={selectedCandidate?.strains ?? []}
                    showStrains={model.rulesVersion === 2}
                  />
                </div>
              ) : null}
            </>
          )}
        </div>

        <footer className={`${decisionStyles.decisionFooter} mt-3 flex shrink-0 items-center justify-between gap-3 border-t border-scale-blue-light/20 pt-3`}>
          <p className="hidden font-body text-sm text-beige/45 sm:block">
            1 / 2 chooses · Esc {onBack ? 'returns to Portal' : 'selects DECLINE'} · Enter confirms
          </p>
          <div className="ml-auto flex gap-2">
            {recodePhase ? (
              <button
                type="button"
                className="btn-neutral min-h-11 px-4 py-2 text-sm"
                onClick={() => {
                  setRecodePhase(false);
                  setReplacementSlot(null);
                }}
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              className="btn-go min-h-11 min-w-[9rem] px-4 py-2 text-sm"
              onClick={confirm}
              disabled={locked || selected === null || (recodePhase && (!selectedReplacement || Boolean(selectedReplacement.disabledReason)))}
              data-testid="loom-confirm"
            >
              {recodePhase && selectedReplacement
                ? `RECODE +${selectedReplacement.growthCost}`
                : declineSelected
                  ? selectedDeclineOption?.pinCandidateIndex !== undefined
                    ? `DECLINE · PIN ${model.candidates[selectedDeclineOption.pinCandidateIndex].name}`
                    : 'DECLINE OFFER'
                  : selected === null
                    ? 'CHOOSE A THREAD'
                    : selectedCandidate?.replacementChoices?.length
                    ? `${selectedCandidate.action} · RECODE`
                    : `${selectedCandidate?.action} ${selectedCandidate?.name}`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
