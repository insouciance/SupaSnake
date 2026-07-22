'use client';

/**
 * Clan Gauntlet Panel (Design v2 section 8) - the prepared, counter-playable
 * layer over the weekly duel, rendered on the clan page under the duel card.
 *
 * Two sections, fed by GET /api/clan/gauntlet (hidden while { live: false },
 * i.e. pre-migration-020):
 *
 * 1. WAR ROOM - the weekly protocol:
 *    - picks_open (Mon-Wed): officer form (dynasty pick, modifier lens from
 *      base three + unlocked research options, mutation ban) with opponent
 *      scouting (locked roster + mastery levels + last 3 weeks' picks);
 *      members see "picks lock Wednesday". Submitted picks are blind+final.
 *    - locked (Wed-Thu): both sides revealed, window countdown.
 *    - scoring (Thu-Sun): revealed picks stay visible; live scores +
 *      effective rules live in the DuelPanel above.
 * 2. RESEARCH - the 3-branch x 4-node tree: node states (locked / available /
 *    target with progress bar / unlocked), officer target selection, tithe
 *    input with the 500 DNA/member/week cap indicator, recent contributions.
 */

import { useCallback, useEffect, useState } from 'react';
import { IconDna, IconShield, IconTrophy } from '@/components/ui/icons';
import {
  GAUNTLET_MODIFIERS,
  RESEARCH_NODES,
  TITHE_WEEKLY_CAP,
  type GauntletModifierId,
  type ResearchNode,
  gauntletBanName,
} from '@/shared/game/gauntlet';
import { GENES, type GeneId } from '@/shared/game/genes';
import { STRAINS, STRAIN_IDS } from '@/shared/game/strains';
import { modifierName } from './DuelPanel';
import { PlayerCard } from '@/components/identity/PlayerCard';
import { identityFromEmbedded, type EmbeddedIdentity } from '@/lib/identity/types';

interface ResearchState {
  pool: number;
  target: string | null;
  unlocked: Array<{ nodeId: string; unlockedAt: string }>;
  titheCap: number;
  myTitheThisWeek: number;
  recentTithes: Array<{ name: string; amount: number; weekStart: string }>;
}

interface ScoutingState {
  roster: Array<{
    name: string;
    /** Identity v1 (migration 022): Player Card row fields, when live. */
    identity?: EmbeddedIdentity | null;
    mastery: Record<string, { level: number; xp?: number }>;
  }>;
  lastPicks: Array<{
    weekStart: string;
    dynasty: string;
    dynasty2: string | null;
    modifier: string | null;
    ban: string | null;
  }>;
  detail: boolean;
  /** Identity v1 I4: cached Analyst scouting brief for this duel week. */
  narration?: string | null;
}

interface GauntletState {
  phase: 'picks_open' | 'locked' | 'scoring';
  picksDeadline: string;
  revealed: boolean;
  opponent: { name: string; tag: string; rating: number } | null;
  myPicks: {
    dynasty: string;
    dynasty2: string | null;
    modifier: string | null;
    ban: string | null;
  } | null;
  theirPicks: {
    dynasty: string;
    dynasty2: string | null;
    modifier: string | null;
    ban: string | null;
  } | null;
  scouting: ScoutingState | null;
}

export interface GauntletData {
  live: boolean;
  isOfficer: boolean;
  research: ResearchState | null;
  gauntlet: GauntletState | null;
}

const DYNASTY_OPTIONS = ['PRIMAL', 'CYBER', 'COSMIC'] as const;

/** Modifier options for the pick form, given the clan's unlocked nodes. */
export function availableModifiers(
  unlockedNodes: readonly string[]
): Array<{ id: GauntletModifierId; name: string; locked: boolean; reason: string | null }> {
  return (Object.values(GAUNTLET_MODIFIERS)).map((modifier) => {
    if (modifier.requiresNode && !unlockedNodes.includes(modifier.requiresNode)) {
      return {
        id: modifier.id,
        name: modifier.name,
        locked: true,
        reason: 'Research locked',
      };
    }
    return { id: modifier.id, name: modifier.name, locked: false, reason: null };
  });
}

/** Node display state for the research tree. */
export function nodeState(
  node: ResearchNode,
  research: Pick<ResearchState, 'target' | 'unlocked'>
): 'unlocked' | 'target' | 'available' | 'locked' {
  const unlockedIds = research.unlocked.map((u) => u.nodeId);
  if (unlockedIds.includes(node.id)) return 'unlocked';
  if (research.target === node.id) return 'target';
  if (node.tier === 1 || unlockedIds.includes(`${node.branch}_${node.tier - 1}`)) {
    return 'available';
  }
  return 'locked';
}

export function GauntletPanel({ accessToken }: { accessToken?: string | null }) {
  const [data, setData] = useState<GauntletData | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Pick form state (officers, picks_open)
  const [dynasty, setDynasty] = useState<string>('');
  const [modifier, setModifier] = useState<string>('');
  const [ban, setBan] = useState<string>('');
  const [banKind, setBanKind] = useState<'gene' | 'strain'>('gene');

  // Tithe form state
  const [titheAmount, setTitheAmount] = useState<string>('');

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const response = await fetch('/api/clan/gauntlet', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) return; // 404 = not in a clan; hide silently
      const json = (await response.json()) as GauntletData;
      if (json.live) setData(json);
    } catch {
      // Non-fatal: the panel simply stays hidden
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      if (!accessToken) return;
      setBusy(true);
      setError(null);
      setMessage(null);
      try {
        const response = await fetch('/api/clan/gauntlet', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(body),
        });
        const json = await response.json();
        if (!response.ok) {
          setError(json.error || 'Request failed');
          return null;
        }
        await load();
        return json;
      } catch {
        setError('Request failed');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [accessToken, load]
  );

  if (!data || !data.live) return null;

  const { research, gauntlet, isOfficer } = data;
  const unlockedIds = research?.unlocked.map((u) => u.nodeId) ?? [];
  const remainingCap = Math.max(
    0,
    (research?.titheCap ?? TITHE_WEEKLY_CAP) - (research?.myTitheThisWeek ?? 0)
  );

  const handleSubmitPicks = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dynasty) {
      setError('Pick a dynasty - counted runs must be in it');
      return;
    }
    const result = await post({
      action: 'submit_picks',
      dynasty,
      ...(modifier ? { modifier } : {}),
      ...(ban ? { ban } : {}),
    });
    if (result) setMessage('Picks locked. Revealed to both sides Wednesday 00:00 UTC.');
  };

  const handleTithe = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(titheAmount);
    if (!Number.isInteger(amount) || amount <= 0) {
      setError('Enter a DNA amount to tithe');
      return;
    }
    const result = await post({ action: 'tithe', amount });
    if (result) {
      setTitheAmount('');
      setMessage(
        result.result?.unlocked_node
          ? `Research unlocked: ${RESEARCH_NODES.find((n) => n.id === result.result.unlocked_node)?.name ?? result.result.unlocked_node}!`
          : 'Tithe contributed'
      );
    }
  };

  const handleSetTarget = async (nodeId: string) => {
    const result = await post({ action: 'set_target', nodeId });
    if (result) {
      setMessage(
        result.result?.unlocked_node
          ? `Research unlocked: ${RESEARCH_NODES.find((n) => n.id === result.result.unlocked_node)?.name ?? result.result.unlocked_node}!`
          : 'Research target set'
      );
    }
  };

  return (
    <section className="mb-10 animate-fade-up" data-testid="gauntlet-panel">
      <h2 className="heading-display text-2xl text-bone-white mb-4 flex items-center gap-2">
        <IconShield size={22} className="text-cosmic" />
        Clan Gauntlet
      </h2>

      {error && (
        <div className="bg-strike-red/15 border border-strike-red/70 rounded-arcade p-3 mb-4">
          <p className="text-strike-red font-body text-sm" data-testid="gauntlet-error">{error}</p>
        </div>
      )}
      {message && (
        <div className="bg-rarity-uncommon/10 border border-rarity-uncommon/70 rounded-arcade p-3 mb-4">
          <p className="text-rarity-uncommon font-body text-sm" data-testid="gauntlet-message">{message}</p>
        </div>
      )}

      {/* ---- WAR ROOM: weekly picks + scouting ---- */}
      {gauntlet && gauntlet.opponent && (
        <div className="panel-glow [--glow:#a855f7] p-4 sm:p-6 mb-6" data-testid="gauntlet-war-room">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <span className="label-arcade">War Room</span>
            <span className="px-3 py-1 bg-void/60 border border-scale-blue-light/50 rounded-arcade text-sm font-display text-bone-white">
              vs {gauntlet.opponent.name} [{gauntlet.opponent.tag}]
            </span>
          </div>

          {/* Picks: open phase */}
          {gauntlet.phase === 'picks_open' && !gauntlet.myPicks && isOfficer && (
            <form onSubmit={handleSubmitPicks} data-testid="gauntlet-pick-form" className="space-y-4 mb-4">
              <div>
                <p className="label-arcade mb-2">Dynasty pick - counted runs must be in it</p>
                <div className="flex gap-2">
                  {DYNASTY_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      data-testid={`dynasty-pick-${option}`}
                      onClick={() => setDynasty(option)}
                      className={`px-4 py-2 min-h-[44px] rounded-arcade font-display uppercase text-sm border transition-colors ${
                        dynasty === option
                          ? 'bg-venom-orange/20 border-venom-orange text-venom-orange'
                          : 'bg-void/60 border-scale-blue-light/50 text-beige hover:border-venom-orange/60'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="label-arcade mb-2">Clan-tech modifier (your scoring lens)</p>
                <select
                  value={modifier}
                  onChange={(e) => setModifier(e.target.value)}
                  data-testid="modifier-select"
                  className="w-full px-4 py-2 bg-void/60 border border-scale-blue-light/60 rounded-arcade text-bone-white font-body focus:border-venom-orange focus:outline-none"
                >
                  <option value="">No modifier</option>
                  {availableModifiers(unlockedIds).map((option) => (
                    <option key={option.id} value={option.id} disabled={option.locked}>
                      {option.name}
                      {option.locked ? ` - ${option.reason}` : ` - ${GAUNTLET_MODIFIERS[option.id].description}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="label-arcade mb-2">Genome ban</p>
                <div className="flex gap-2 mb-2" role="tablist" aria-label="Genome ban type">
                  {(['gene', 'strain'] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      role="tab"
                      aria-selected={banKind === kind}
                      data-testid={`ban-tab-${kind}`}
                      onClick={() => {
                        setBanKind(kind);
                        setBan('');
                      }}
                      className={`px-3 py-1.5 rounded-arcade border text-xs font-display uppercase ${
                        banKind === kind
                          ? 'border-cosmic text-cosmic bg-cosmic/15'
                          : 'border-scale-blue-light/50 text-beige'
                      }`}
                    >
                      Ban a {kind}
                    </button>
                  ))}
                </div>
                <select
                  value={ban}
                  onChange={(e) => setBan(e.target.value)}
                  data-testid="ban-select"
                  className="w-full px-4 py-2 bg-void/60 border border-scale-blue-light/60 rounded-arcade text-bone-white font-body focus:border-venom-orange focus:outline-none"
                >
                  <option value="">No ban</option>
                  {banKind === 'gene'
                    ? (Object.keys(GENES) as GeneId[]).map((id) => (
                        <option key={id} value={`gene:${id}`}>
                          {GENES[id].name}
                        </option>
                      ))
                    : STRAIN_IDS.map((id) => (
                        <option key={id} value={`strain:${id}`}>
                          {STRAINS[id].name} — suppress Expressions/Apexes
                        </option>
                      ))}
                </select>
                <p className="text-xs text-beige/50 mt-1">
                  Gene bans remove one offer; strain bans leave genes available but cap that strain at its Minor.
                </p>
              </div>

              <button
                type="submit"
                disabled={busy}
                data-testid="submit-picks"
                className="btn-go px-6 py-2 min-h-[44px] disabled:opacity-50"
              >
                Lock picks (final)
              </button>
              <p className="text-xs text-beige/50 font-body">
                Blind: your opponent cannot see this until both sides lock or Wednesday 00:00 UTC.
              </p>
            </form>
          )}

          {gauntlet.phase === 'picks_open' && !gauntlet.myPicks && !isOfficer && (
            <p className="text-beige font-body mb-4" data-testid="gauntlet-member-wait">
              Officers are deliberating. Picks lock{' '}
              <span className="text-bone-white font-display">Wednesday 00:00 UTC</span>.
            </p>
          )}

          {/* My locked picks (any phase once submitted) */}
          {gauntlet.myPicks && (
            <div className="mb-4" data-testid="gauntlet-my-picks">
              <p className="label-arcade mb-2">Our picks {gauntlet.revealed ? '' : '(locked, blind)'}</p>
              <p className="text-sm font-body text-beige">
                <span className="text-bone-white font-display">{gauntlet.myPicks.dynasty}</span>
                {gauntlet.myPicks.dynasty2 && (
                  <span className="text-bone-white font-display"> + {gauntlet.myPicks.dynasty2}</span>
                )}
                {gauntlet.myPicks.modifier && <> &middot; {modifierName(gauntlet.myPicks.modifier)}</>}
                {gauntlet.myPicks.ban && <> &middot; ban: {gauntletBanName(gauntlet.myPicks.ban)}</>}
              </p>
            </div>
          )}

          {/* Their picks (only after reveal) */}
          {gauntlet.revealed && gauntlet.theirPicks && (
            <div className="mb-4" data-testid="gauntlet-their-picks">
              <p className="label-arcade mb-2">Their picks (revealed)</p>
              <p className="text-sm font-body text-beige">
                <span className="text-bone-white font-display">{gauntlet.theirPicks.dynasty}</span>
                {gauntlet.theirPicks.dynasty2 && (
                  <span className="text-bone-white font-display"> + {gauntlet.theirPicks.dynasty2}</span>
                )}
                {gauntlet.theirPicks.modifier && <> &middot; {modifierName(gauntlet.theirPicks.modifier)}</>}
                {gauntlet.theirPicks.ban && <> &middot; banned vs us: {gauntletBanName(gauntlet.theirPicks.ban)}</>}
              </p>
            </div>
          )}

          {/* Scouting (opens at Monday pairing) */}
          {gauntlet.scouting && (
            <div data-testid="gauntlet-scouting">
              <p className="label-arcade mb-2">Scouting</p>
              {/* The Analyst's brief (Identity v1 I4) — cached, additive */}
              {gauntlet.scouting.narration && (
                <p
                  className="text-sm font-body text-cosmic/90 italic mb-3"
                  data-testid="gauntlet-scout-narration"
                >
                  {gauntlet.scouting.narration}
                </p>
              )}
              {gauntlet.scouting.roster.length > 0 && (
                <ul className="space-y-1 mb-3">
                  {gauntlet.scouting.roster.slice(0, 12).map((member, index) => (
                    <li
                      key={`${member.name}-${index}`}
                      className="flex items-center justify-between gap-2 text-sm font-body bg-void/40 border border-scale-blue-light/30 rounded-arcade px-3 py-1.5"
                    >
                      {/* Identity v1: scouting rows are Player Card rows */}
                      {member.identity ? (
                        <PlayerCard
                          identity={identityFromEmbedded(member.identity)}
                          variant="row"
                        />
                      ) : (
                        <span className="text-bone-white">{member.name}</span>
                      )}
                      <span className="text-beige/70 text-xs font-display uppercase shrink-0">
                        {Object.entries(member.mastery)
                          .map(([dyn, m]) => `${dyn.slice(0, 3)} M${m.level}`)
                          .join(' · ') || 'Unranked'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {gauntlet.scouting.lastPicks.length > 0 && (
                <div data-testid="gauntlet-last-picks">
                  <p className="text-xs text-beige/60 font-body mb-1">Their last picks:</p>
                  <p className="text-sm font-body text-beige">
                    {gauntlet.scouting.lastPicks
                      .map(
                        (pick) =>
                          `${pick.dynasty}${pick.modifier ? ` (${modifierName(pick.modifier)})` : ''}`
                      )
                      .join(' · ')}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---- RESEARCH: 3-branch tree + tithes ---- */}
      {research && (
        <div className="panel-glow [--glow:#22d3ee] p-4 sm:p-6" data-testid="gauntlet-research">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <span className="label-arcade">Clan Research</span>
            <span className="px-3 py-1 bg-void/60 border border-scale-blue-light/50 rounded-arcade text-sm font-display text-bone-white flex items-center gap-1.5">
              <IconDna size={14} />
              {research.pool.toLocaleString()} DNA pooled
            </span>
          </div>

          {/* Tree: 3 branches, mobile-first stacked, side-by-side on desktop */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {(['protocols', 'logistics', 'heraldry'] as const).map((branch) => (
              <div key={branch}>
                <p className="label-arcade mb-2 capitalize">{branch}</p>
                <div className="space-y-2">
                  {RESEARCH_NODES.filter((node) => node.branch === branch).map((node) => {
                    const state = nodeState(node, research);
                    return (
                      <div
                        key={node.id}
                        data-testid={`research-node-${node.id}`}
                        data-state={state}
                        className={`p-3 rounded-arcade border text-sm font-body ${
                          state === 'unlocked'
                            ? 'bg-venom-orange/10 border-venom-orange/70'
                            : state === 'target'
                              ? 'bg-cosmic/10 border-cosmic/70'
                              : state === 'available'
                                ? 'bg-void/60 border-scale-blue-light/50'
                                : 'bg-void/40 border-scale-blue-light/20 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-bone-white font-display text-xs uppercase">{node.name}</span>
                          <span className="text-beige/60 text-xs">{node.cost.toLocaleString()}</span>
                        </div>
                        <p className="text-beige/70 text-xs mt-1">{node.description}</p>

                        {state === 'target' && (
                          <div className="mt-2" data-testid={`research-progress-${node.id}`}>
                            <div className="h-2 bg-void/60 border border-scale-blue-light/40 rounded-arcade overflow-hidden">
                              <div
                                className="h-full bg-cosmic shadow-[0_0_6px_#a855f7] transition-all"
                                style={{
                                  width: `${Math.min(100, Math.round((research.pool / node.cost) * 100))}%`,
                                }}
                              />
                            </div>
                            <p className="text-xs text-beige/60 mt-1">
                              {Math.min(research.pool, node.cost).toLocaleString()} / {node.cost.toLocaleString()}
                            </p>
                          </div>
                        )}

                        {state === 'available' && isOfficer && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleSetTarget(node.id)}
                            data-testid={`set-target-${node.id}`}
                            className="mt-2 text-xs font-display uppercase text-venom-orange hover:text-bone-white transition-colors min-h-[32px]"
                          >
                            Research this
                          </button>
                        )}
                        {state === 'unlocked' && (
                          <p className="mt-1 text-xs font-display uppercase text-venom-orange">Unlocked</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Tithe input + weekly cap indicator */}
          <form onSubmit={handleTithe} className="mb-4" data-testid="tithe-form">
            <p className="label-arcade mb-2">
              Tithe DNA{' '}
              <span className="text-beige/60 normal-case" data-testid="tithe-cap-indicator">
                ({research.myTitheThisWeek}/{research.titheCap} this week
                {remainingCap === 0 ? ' - cap reached' : ''})
              </span>
            </p>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                max={remainingCap || undefined}
                value={titheAmount}
                onChange={(e) => setTitheAmount(e.target.value)}
                placeholder={remainingCap > 0 ? `Up to ${remainingCap}` : 'Cap reached'}
                disabled={remainingCap === 0 || busy}
                data-testid="tithe-input"
                className="flex-1 px-4 py-2 bg-void/60 border border-scale-blue-light/60 rounded-arcade text-bone-white font-body placeholder:text-beige/50 focus:border-venom-orange focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={remainingCap === 0 || busy}
                data-testid="tithe-submit"
                className="btn-go px-6 py-2 min-h-[44px] disabled:opacity-50"
              >
                Tithe
              </button>
            </div>
            <p className="text-xs text-beige/50 font-body mt-1">
              Capped at {research.titheCap} DNA per member per week - no whale can buy the tree.
            </p>
          </form>

          {/* Contribution history */}
          {research.recentTithes.length > 0 && (
            <div data-testid="tithe-history">
              <p className="label-arcade mb-2 flex items-center gap-1.5">
                <IconTrophy size={12} />
                Recent contributions
              </p>
              <ul className="space-y-1">
                {research.recentTithes.map((tithe, index) => (
                  <li
                    key={`${tithe.name}-${tithe.weekStart}-${index}`}
                    className="flex items-center justify-between text-sm font-body bg-void/40 border border-scale-blue-light/30 rounded-arcade px-3 py-1.5"
                  >
                    <span className="text-bone-white">{tithe.name}</span>
                    <span className="text-venom-orange font-display flex items-center gap-1">
                      <IconDna size={12} />
                      {tithe.amount.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
