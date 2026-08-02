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
import { STRAINS, type StrainId } from '@/shared/game/strains';
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
  const [selected, setSelected] = useState<ChoiceKey>(() =>
    !model.candidates[0].disabledReason
      ? 'candidate-0'
      : !model.candidates[1].disabledReason
        ? 'candidate-1'
        : 'decline'
  );
  const [recodePhase, setRecodePhase] = useState(false);
  const [replacementSlot, setReplacementSlot] = useState<number | null>(null);
  const [declineOptionId, setDeclineOptionId] = useState<string | null>(
    model.decline.options?.[0]?.id ?? null
  );
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
  const selectedDeclineOption = model.decline.options?.find(
    (option) => option.id === declineOptionId
  ) ?? model.decline.options?.[0] ?? null;
  const consequence = recodePhase && selectedReplacement
    ? selectedReplacement.consequence
    : selectedCandidate?.consequence ?? selectedDeclineOption?.consequence ?? model.decline.consequence;
  const action = recodePhase && selectedCandidate
    ? `${selectedCandidate.action} ${selectedCandidate.name} · replace ${selectedReplacement?.label ?? 'one locus'}`
    : selectedCandidate?.action ?? (selectedDeclineOption
      ? `${model.decline.action} · ${selectedDeclineOption.label}`
      : model.decline.action);

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
    if (locked) return;
    if (selectedIndex === null) {
      onDecline(selectedDeclineOption?.pinCandidateIndex);
      return;
    }
    if (selectedCandidate?.disabledReason) return;
    if (replacementChoices.length > 0 && !recodePhase) {
      setRecodePhase(true);
      setReplacementSlot(replacementChoices.find((choice) => !choice.disabledReason)?.slotIndex ?? null);
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
    recodePhase,
    replacementChoices,
    selectedDeclineOption,
    selectedCandidate,
    selectedIndex,
    selectedReplacement,
  ]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (locked) return;
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
      } else if (event.key === 'Enter' || event.key === ' ') {
        confirm();
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, [confirm, locked, onBack, recodePhase, select]);

  const choices = useMemo(
    () => [
      ...model.candidates.map((candidate, index) => ({
        key: choiceKey(index as 0 | 1),
        action: candidate.action,
        name: candidate.name,
        category: candidate.category,
        geneId: candidate.geneId,
        strains: candidate.strains,
        disabledReason: candidate.disabledReason,
      })),
      {
        key: 'decline' as const,
        action: model.decline.action,
        name: model.decline.name,
        category: 'Opportunity cost',
        geneId: null,
        strains: [] as readonly StrainId[],
        disabledReason: undefined,
      },
    ],
    [model]
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
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="-ml-1 inline-flex min-h-11 shrink-0 items-center rounded-full px-2 font-body text-sm font-bold text-beige/65 hover:bg-bone-white/8 hover:text-bone-white"
                data-testid="loom-back-to-portal"
              >
                ‹ Portal
              </button>
            ) : null}
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
            const testId = index < 2 ? `gene-option-${index}` : 'gene-decline';
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
                aria-label={`${index < 2 ? `${index === 0 ? 'A' : 'B'}, ` : ''}${choice.action} ${choice.name}${choice.strains.length > 0 ? `, Strains ${choice.strains.map((id) => STRAINS[id].name).join(', ')}` : ''}`}
                aria-keyshortcuts={index === 0 ? '1' : index === 1 ? '2' : 'Escape'}
                disabled={locked || Boolean(choice.disabledReason)}
                onClick={() => select(choice.key)}
                onFocus={() => select(choice.key)}
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
                  {index < 2 ? `${index === 0 ? 'A' : 'B'} · ` : ''}{choice.action}
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
                {choice.disabledReason ? (
                  <span className={decisionStyles.choiceDisabled} title={choice.disabledReason}>
                    {choice.disabledReason}
                  </span>
                ) : null}
              </button>
            );
          })}
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
                    onFocus={() => setReplacementSlot(choice.slotIndex)}
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

          {selectedIndex === null && model.decline.options && model.decline.options.length > 0 ? (
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
                    onFocus={() => setDeclineOptionId(option.id)}
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

        <footer className="mt-3 flex shrink-0 items-center justify-between gap-3 border-t border-scale-blue-light/20 pt-3">
          <p className="hidden font-body text-sm text-beige/45 sm:block">
            1 / 2 previews · Esc {onBack ? 'returns to Portal' : 'selects DECLINE'} · Enter confirms
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
              disabled={locked || (recodePhase && (!selectedReplacement || Boolean(selectedReplacement.disabledReason)))}
              data-testid="loom-confirm"
            >
              {recodePhase && selectedReplacement
                ? `RECODE +${selectedReplacement.growthCost}`
                : selectedIndex === null
                  ? selectedDeclineOption?.pinCandidateIndex !== undefined
                    ? `DECLINE · PIN ${model.candidates[selectedDeclineOption.pinCandidateIndex].name}`
                    : 'DECLINE OFFER'
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
