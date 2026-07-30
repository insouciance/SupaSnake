/**
 * ChronicleView tests (Player Identity v1 section 7): section order and
 * presence, the section 7.2 empty-state rules (forward-looking prompts,
 * silhouettes-as-content, the public <5-earning-runs limited shape),
 * season chapters with the Crowned banner, and the clan sparkline.
 */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChronicleView } from './ChronicleView';
import type { ChroniclePayload } from '@/lib/chronicle/types';
import type { PlayerIdentity } from '@/lib/identity/types';

const identity: PlayerIdentity = {
  playerId: 'player-1',
  userId: null,
  handle: 'Souci',
  displayHandle: 'Souci',
  isGenerated: false,
  isFounder: true,
  title: null,
  bannerId: null,
  bannerRender: null,
  badges: [],
  avatar: null,
  clanTag: 'FANG',
  clanName: 'Fang Dynasty',
  mastery: { CYBER: 4 },
  legacyScore: 75,
};

function payload(overrides: Partial<ChroniclePayload> = {}): ChroniclePayload {
  return {
    identity,
    legacyScore: 75,
    recordsLive: true,
    earningRuns: 40,
    limited: false,
    records: {
      records: [
        {
          id: 'vault',
          name: 'The Vault',
          category: 'extraction',
          dynasty: null,
          measures: 'Lifetime DNA banked (extracted runs)',
          thresholds: [5000, 25000, 100000, 400000, 1000000],
          tierPoints: [5, 10, 20, 35, 60],
          value: 30000,
          tier: 2,
        },
      ],
      capstones: [],
    },
    pbTimeline: {
      points: [
        { weekStart: '2026-07-13', dynasty: 'CYBER', bestScore: 250, runs: 3 },
        { weekStart: '2026-07-20', dynasty: 'CYBER', bestScore: 400, runs: 4 },
      ],
      annotations: [
        {
          weekStart: '2026-07-20',
          label: 'The Vault — Silver',
          rarity: 'uncommon',
          cosmeticId: 'record_vault_t2',
        },
      ],
    },
    collectionLog: [
      {
        variantId: 'v1',
        name: 'CYBER SPARK',
        dynasty: 'CYBER',
        rarity: 'common',
        sortOrder: 1,
        acquiredAt: '2026-07-10T00:00:00.000Z',
        generation: 3,
      },
      {
        variantId: 'v2',
        name: 'COSMIC NOVA',
        dynasty: 'COSMIC',
        rarity: 'rare',
        sortOrder: 2,
        acquiredAt: null,
        generation: null,
      },
    ],
    seasons: [
      {
        seq: 1,
        name: 'Season 1 — Solstice',
        theme: 'solstice',
        startsOn: '2026-07-20',
        endsOn: '2026-09-07',
        active: false,
        trackLevel: 30,
        maxLevel: 30,
        completed: true,
        champion: { clanName: 'Fang Dynasty', clanTag: 'FANG' },
        crowned: true,
      },
    ],
    clan: {
      name: 'Fang Dynasty',
      tag: 'FANG',
      battleHistory: [
        {
          battleId: 'battle-1',
          startedAt: '2026-07-24T00:00:00.000Z',
          settledAt: '2026-07-27T00:00:00.000Z',
          outcome: 'victor',
          clanDepth: 51000,
          opponent: {
            name: 'Void Reavers',
            tag: 'VOID',
            depth: 48000,
            outcome: 'participant',
          },
        },
      ],
      honors: { total: 2, victories: 1, stalemates: 0, participations: 1 },
      legacyArchive: {
        rating: 1064,
        ratingHistory: [
          { weekStart: '2026-07-13', ratingAfter: 1032, delta: 32 },
          { weekStart: '2026-07-20', ratingAfter: 1064, delta: 32 },
        ],
        rivalries: [
          { opponentName: 'Void Reavers', opponentTag: 'VOID', wins: 2, losses: 1, ties: 0 },
        ],
      },
    },
    // Career footnotes from retired systems (WP-0.07). Most careers have
    // none, so the default fixture has none.
    trivia: [],
    ...overrides,
  };
}

describe('ChronicleView', () => {
  it('renders the full identity header without a synthetic account score', () => {
    render(<ChronicleView payload={payload()} />);
    const card = screen.getByTestId('player-card');
    expect(card).toHaveAttribute('data-variant', 'full');
    expect(screen.queryByTestId('player-card-legacy')).not.toBeInTheDocument();
    expect(screen.getByTestId('player-card-founder')).toBeInTheDocument();
  });

  it('places the private Career Pulse only in the owner view', () => {
    const pulse = <div data-testid="private-career-pulse">Pulse</div>;
    const { rerender } = render(
      <ChronicleView payload={payload()} isSelf careerPulseSlot={pulse} />
    );
    expect(screen.getByTestId('private-career-pulse')).toBeInTheDocument();

    rerender(<ChronicleView payload={payload()} careerPulseSlot={pulse} />);
    expect(screen.queryByTestId('private-career-pulse')).not.toBeInTheDocument();
  });

  it('renders every section for a full payload (doc 7.1 order)', () => {
    render(<ChronicleView payload={payload()} />);
    for (const section of [
      'section-pb',
      'section-records',
      'section-collection',
      'section-seasons',
      'section-clan',
    ]) {
      expect(screen.getByTestId(section)).toBeInTheDocument();
    }
    expect(screen.getByTestId('pb-timeline')).toBeInTheDocument();
    expect(screen.getByTestId('records-cabinet')).toBeInTheDocument();
    expect(screen.getByTestId('season-crowned')).toHaveTextContent('Crowned');
    expect(screen.getByTestId('clan-energy-history')).toHaveTextContent('51,000');
    expect(screen.getByTestId('clan-honors')).toHaveTextContent('1 victor');
    expect(screen.getByTestId('clan-legacy-archive')).toHaveTextContent(
      'Archived weekly duel history'
    );
  });

  it('limited payload (<5 earning runs): header + collection log ONLY (section 7.2)', () => {
    render(
      <ChronicleView
        payload={payload({
          limited: true,
          records: null,
          pbTimeline: null,
          seasons: null,
          clan: null,
        })}
      />
    );
    expect(screen.getByTestId('chronicle-limited')).toBeInTheDocument();
    expect(screen.getByTestId('section-collection')).toBeInTheDocument();
    expect(screen.queryByTestId('section-pb')).not.toBeInTheDocument();
    expect(screen.queryByTestId('section-records')).not.toBeInTheDocument();
    expect(screen.queryByTestId('section-seasons')).not.toBeInTheDocument();
    expect(screen.queryByTestId('section-clan')).not.toBeInTheDocument();
  });

  it('collection log renders silhouettes for undiscovered variants (want-list)', () => {
    render(<ChronicleView payload={payload()} />);
    expect(screen.getAllByTestId('collection-entry')).toHaveLength(1);
    expect(screen.getAllByTestId('collection-silhouette')).toHaveLength(1);
    expect(screen.getByText('1 of 2 discovered')).toBeInTheDocument();
  });

  it('null sections render forward-looking prompts, never empty grids', () => {
    render(
      <ChronicleView
        payload={payload({
          records: null,
          pbTimeline: null,
          seasons: null,
          clan: null,
        })}
      />
    );
    expect(
      screen.getByText('Your first banked run starts your timeline.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Records open with your first banked run.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Your first season chapter is being written now.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Join a clan to start its story.')
    ).toBeInTheDocument();
  });

  it('empty PB timeline data renders the prompt (section 7.2)', () => {
    render(
      <ChronicleView
        payload={payload({ pbTimeline: { points: [], annotations: [] } })}
      />
    );
    expect(screen.getByTestId('pb-timeline-empty')).toHaveTextContent(
      'Your first banked run starts your timeline.'
    );
  });

  it('renders retired-unlock trivia when the career has footnotes (WP-0.07)', () => {
    render(
      <ChronicleView
        payload={payload({
          trivia: [
            {
              id: 'aim-unlock-gridlock',
              label: 'Gridlock, earned the old way',
              detail:
                'You cleared the retired Gridlock unlock — a high score of 15.',
            },
          ],
        })}
      />
    );
    expect(screen.getByTestId('section-trivia')).toBeInTheDocument();
    expect(screen.getByTestId('trivia-aim-unlock-gridlock')).toHaveTextContent(
      'Gridlock, earned the old way'
    );
  });

  it('omits the trivia section entirely for a career with no footnotes', () => {
    render(<ChronicleView payload={payload()} />);
    expect(screen.queryByTestId('section-trivia')).not.toBeInTheDocument();
  });

  it('hides trivia from a limited public payload (section 7.2)', () => {
    render(
      <ChronicleView
        payload={payload({
          limited: true,
          records: null,
          pbTimeline: null,
          seasons: null,
          clan: null,
          trivia: [
            { id: 'aim-unlock-firefly', label: 'Firefly, earned the old way', detail: '.' },
          ],
        })}
      />
    );
    expect(screen.queryByTestId('section-trivia')).not.toBeInTheDocument();
  });

  it('renders private extras when provided (own page)', () => {
    render(
      <ChronicleView
        payload={payload()}
        isSelf
        extras={<div data-testid="own-extras">Early Career</div>}
      />
    );
    expect(screen.getByTestId('own-extras')).toBeInTheDocument();
  });
});
