'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  TRAINING_DIFFICULTIES,
  TRAINING_EXERCISE_IDS,
  TRAINING_EXERCISES,
  type SandboxScenarioConfig,
  type TrainingDifficulty,
  type TrainingExerciseId,
  type TrainingGuidance,
  type TrainingProfile,
  type TrainingPreset,
} from '@/shared/game/training';
import { dynastyDisplayName } from '@/shared/game/rulesets';
import { PathComposer } from './PathComposer';

interface TrainingHubProps {
  profile: TrainingProfile;
  profileLoading: boolean;
  difficulty: TrainingDifficulty;
  guidance: TrainingGuidance;
  sandbox: SandboxScenarioConfig;
  presets: TrainingPreset[];
  presetsLive: boolean;
  onDifficulty: (difficulty: TrainingDifficulty) => void;
  onGuidance: (guidance: TrainingGuidance) => void;
  onSandbox: (sandbox: SandboxScenarioConfig) => void;
  onStartExercise: (exercise: TrainingExerciseId) => void;
  onStartCircuit: () => void;
  onStartSandbox: () => void;
  onSavePreset: (name: string) => void;
  onLoadPreset: (preset: TrainingPreset) => void;
  onDeletePreset: (id: string) => void;
}

const DIFFICULTY_LABEL: Record<TrainingDifficulty, string> = {
  foundation: 'Foundation',
  advanced: 'Advanced',
  elite: 'Elite',
};

const GUIDANCE_LABEL: Record<TrainingGuidance, string> = {
  full: 'Full route',
  next: 'Next six',
  ghost: 'PB trace',
  none: 'No guide',
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? Math.round((ordered[middle - 1] + ordered[middle]) / 2)
    : ordered[middle];
}

export function TrainingHub({
  profile,
  profileLoading,
  difficulty,
  guidance,
  sandbox,
  presets,
  presetsLive,
  onDifficulty,
  onGuidance,
  onSandbox,
  onStartExercise,
  onStartCircuit,
  onStartSandbox,
  onSavePreset,
  onLoadPreset,
  onDeletePreset,
}: TrainingHubProps) {
  const [presetName, setPresetName] = useState('My route');
  const skillRows = TRAINING_EXERCISE_IDS.map((exercise) => {
    const bests = profile.bests.filter((best) => best.exercise === exercise);
    const best = bests.sort((a, b) => b.rating - a.rating)[0] ?? null;
    const recent = profile.recent
      .filter((attempt) => attempt.exercise === exercise)
      .slice(0, 10)
      .map((attempt) => attempt.rating);
    return { exercise, best, median: median(recent) };
  });
  const suggested = [...skillRows].sort(
    (a, b) => (a.best?.rating ?? -1) - (b.best?.rating ?? -1)
  )[0]?.exercise ?? 'trace';

  return (
    <main className="consent-safe-viewport min-h-dvh app-bg px-4 pb-28 pt-8 text-bone-white sm:px-8 sm:pb-16">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="label-arcade text-[#67e8f9]">Rewardless deliberate practice</p>
            <h1 className="heading-display text-4xl text-venom-orange text-glow-orange sm:text-6xl">
              Training Lab
            </h1>
            <p className="max-w-2xl font-body text-lg text-beige">
              Isolate one skill, review exact feedback, then prove it on an unseen Circuit.
              Attempts never spend a charge or grant DNA, mastery, contracts, or leaderboard score.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/game" className="btn-neutral inline-flex min-h-11 items-center px-4">Free Play</Link>
            <Link href="/" className="btn-neutral inline-flex min-h-11 items-center px-4">Home</Link>
          </div>
        </header>

        <section className="panel-elevated p-5" aria-labelledby="skill-profile-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="label-arcade">Ceiling + consistency</p>
              <h2 id="skill-profile-heading" className="heading-display text-2xl">Skill Profile</h2>
            </div>
            <p className="font-body text-sm text-beige/65">
              Suggested focus: <strong className="text-[#67e8f9]">{TRAINING_EXERCISES[suggested].skill}</strong>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {skillRows.map(({ exercise, best, median: recentMedian }) => (
              <article key={exercise} className="rounded-arcade border border-scale-blue-light/35 bg-void/55 p-4">
                <p className="font-mono text-xs uppercase tracking-wider text-beige/60">
                  {TRAINING_EXERCISES[exercise].skill}
                </p>
                <strong className="mt-1 block font-display text-3xl text-bone-white">
                  {profileLoading ? '—' : best?.rating ?? 'New'}
                </strong>
                <p className="font-body text-xs text-beige/55">
                  {best ? `${best.medal} best · recent median ${recentMedian ?? '—'}` : 'No verified attempt yet'}
                </p>
              </article>
            ))}
          </div>
          {!profile.live && !profileLoading && (
            <p className="mt-3 font-body text-xs text-amber-200/80" data-testid="training-profile-offline">
              Verified practice remains available; the cross-device skill profile is temporarily unavailable.
            </p>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_auto]" aria-label="Training setup">
          <div className="panel p-4">
            <p className="label-arcade mb-2">Difficulty · all levels unlocked</p>
            <div className="flex flex-wrap gap-2">
              {TRAINING_DIFFICULTIES.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => onDifficulty(level)}
                  aria-pressed={difficulty === level}
                  className={`min-h-11 rounded-arcade border px-4 font-body ${difficulty === level
                    ? 'border-venom-orange/75 bg-venom-orange/15 text-venom-orange'
                    : 'border-scale-blue-light/40 bg-void/50 text-beige'}`}
                >
                  {DIFFICULTY_LABEL[level]}
                </button>
              ))}
            </div>
          </div>
          <div className="panel p-4">
            <p className="label-arcade mb-2">Guidance</p>
            <select
              value={guidance}
              onChange={(event) => onGuidance(event.target.value as TrainingGuidance)}
              className="min-h-11 rounded-arcade border border-scale-blue-light/50 bg-void-deep px-4 font-body text-bone-white"
              aria-label="Training guidance"
            >
              {(Object.keys(GUIDANCE_LABEL) as TrainingGuidance[]).map((option) => (
                <option key={option} value={option}>{GUIDANCE_LABEL[option]}</option>
              ))}
            </select>
            {guidance === 'ghost' && (
              <p className="mt-2 max-w-56 font-body text-xs text-beige/55">
                Replays the matching PB scenario. New drills show the next six cells until a PB exists.
              </p>
            )}
          </div>
        </section>

        <section aria-labelledby="focus-drills-heading">
          <div className="mb-4">
            <p className="label-arcade">20–60 second repetitions</p>
            <h2 id="focus-drills-heading" className="heading-display text-3xl">Focus Drills</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {TRAINING_EXERCISE_IDS.map((exercise) => {
              const definition = TRAINING_EXERCISES[exercise];
              const best = profile.bests.find(
                (entry) => entry.exercise === exercise && entry.difficulty === difficulty
              );
              return (
                <article
                  key={exercise}
                  className={`panel-glow p-5 ${suggested === exercise ? '[--glow:#67e8f9]' : '[--glow:#617a8d]'}`}
                  data-testid={`training-card-${exercise}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-mono text-xs uppercase tracking-widest text-[#67e8f9]">{definition.skill}</p>
                      <h3 className="heading-display text-2xl">{definition.name}</h3>
                    </div>
                    <span className="rounded-full border border-scale-blue-light/40 px-3 py-1 font-mono text-xs text-beige/65">
                      {best ? `${best.rating} · ${best.medal}` : 'No PB'}
                    </span>
                  </div>
                  <p className="mt-3 font-body text-beige">{definition.summary}</p>
                  <p className="mt-2 font-mono text-xs text-beige/55">Primary: {definition.primaryMetric}</p>
                  <button
                    type="button"
                    onClick={() => onStartExercise(exercise)}
                    className="btn-go mt-5 min-h-11 px-6"
                    data-testid={`start-${exercise}`}
                  >
                    Train {definition.name}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="panel-glow [--glow:#c4b5fd] grid gap-5 p-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="label-arcade text-violet-200">Guide-free transfer check</p>
            <h2 className="heading-display text-3xl">Training Circuit</h2>
            <p className="mt-2 max-w-2xl font-body text-beige">
              Four held-out scenarios—Precision, Planning, Tempo and Recovery. The Circuit removes guidance so memorized routes cannot impersonate mastery.
            </p>
          </div>
          <button type="button" onClick={onStartCircuit} className="btn-go min-h-12 px-7" data-testid="start-circuit">
            Start Circuit
          </button>
        </section>

        <section className="panel-elevated p-5" aria-labelledby="sandbox-heading">
          <p className="label-arcade">Experiment without medals</p>
          <h2 id="sandbox-heading" className="heading-display text-3xl">Open Sandbox</h2>
          <p className="mt-2 max-w-3xl font-body text-beige">
            Compose a route, tune the pace and choose the dynasty physics. Sandbox summaries are diagnostic only and never enter standardized bests.
          </p>
          <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.7fr)]">
            <PathComposer
              path={sandbox.path}
              onChange={(path) => onSandbox({ ...sandbox, path })}
            />
            <div className="space-y-5">
              <label className="block space-y-2">
                <span className="label-arcade">Arena dynasty</span>
                <select
                  value={sandbox.dynasty}
                  onChange={(event) => onSandbox({ ...sandbox, dynasty: event.target.value as SandboxScenarioConfig['dynasty'] })}
                  className="w-full min-h-11 rounded-arcade border border-scale-blue-light/50 bg-void-deep px-4"
                >
                  <option value="PRIMAL">PRIMAL · stone arena</option>
                  <option value="CYBER">CYBER · neon arena</option>
                  <option value="COSMIC">COSMIC · Flux walls</option>
                </select>
              </label>
              <label className="block space-y-2">
                <span className="label-arcade">Tick pace · {sandbox.tickMs} ms</span>
                <input
                  type="range"
                  min="50"
                  max="250"
                  step="25"
                  value={sandbox.tickMs}
                  onChange={(event) => onSandbox({ ...sandbox, tickMs: Number(event.target.value) })}
                  className="w-full accent-[#67e8f9]"
                />
              </label>
              <label className="block space-y-2">
                <span className="label-arcade">Starting length · {sandbox.startLength}</span>
                <input
                  type="range"
                  min="3"
                  max="8"
                  value={sandbox.startLength}
                  onChange={(event) => onSandbox({ ...sandbox, startLength: Number(event.target.value) })}
                  className="w-full accent-[#67e8f9]"
                />
              </label>
              <button
                type="button"
                onClick={onStartSandbox}
                disabled={sandbox.path.length < 5}
                className="btn-go min-h-12 w-full px-7"
                data-testid="start-sandbox"
              >
                Run Custom Path
              </button>
              <div className="space-y-2 border-t border-scale-blue-light/20 pt-4">
                <p className="label-arcade">Reusable presets</p>
                <div className="flex gap-2">
                  <input
                    value={presetName}
                    onChange={(event) => setPresetName(event.target.value)}
                    maxLength={40}
                    className="min-h-11 min-w-0 flex-1 rounded-arcade border border-scale-blue-light/50 bg-void-deep px-3 font-body"
                    aria-label="Preset name"
                  />
                  <button
                    type="button"
                    className="btn-neutral min-h-11 px-4"
                    onClick={() => onSavePreset(presetName.trim())}
                    disabled={!presetName.trim() || !presetsLive}
                    data-testid="save-training-preset"
                  >
                    Save
                  </button>
                </div>
                {!presetsLive && (
                  <p className="font-body text-xs text-beige/50">Cross-device preset storage is temporarily unavailable.</p>
                )}
                {presets.length > 0 && (
                  <div className="space-y-2" data-testid="training-presets">
                    {presets.map((preset) => (
                      <div key={preset.id} className="flex items-center gap-2 rounded-arcade border border-scale-blue-light/25 bg-void/50 p-2">
                        <button
                          type="button"
                          onClick={() => onLoadPreset(preset)}
                          className="min-h-11 min-w-0 flex-1 text-left font-body text-bone-white"
                        >
                          <strong className="block truncate">{preset.name}</strong>
                          <span className="text-xs text-beige/50">{dynastyDisplayName(preset.dynasty)} · {preset.tickMs}ms · {preset.path.length} cells</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeletePreset(preset.id)}
                          className="min-h-11 px-3 font-body text-xs text-strike-red"
                          aria-label={`Delete preset ${preset.name}`}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default TrainingHub;
