/**
 * THE TRAY SIZE IS A CONSTANT (owner ruling).
 *
 *   "the trays have different sizes when all are selected, the tray size can
 *    never change, though, just because one gene has a longer text. determine
 *    the minimum size that all share and that is the size of the tray."
 *
 * What was wrong: the grid stretched the CELL, and the button inside it was
 * content-sized. Measured on the live surface at 390x844 with all six full —
 * 147.3, 163.4, 122.2, 147.3, 147.3, 147.3. Three different trays in one
 * bench, decided by whether a name took two lines and whether two Path badges
 * took two rows.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE. jsdom has no layout: every box it
 * reports is zero, so a test that asserted "these six heights are equal" here
 * would pass on any CSS at all, including the broken CSS above. It would be a
 * lie with a green tick. So the contract is split at the line where each half
 * can actually be checked:
 *
 *   THE PIXELS   measured in a real browser across the width and height
 *                matrix, and recorded in the commit that set them.
 *   THIS FILE    (a) the rule that makes one height possible is present in
 *                the stylesheet and no later rule takes it back, and (b) the
 *                whole catalog still fits inside the budget those pixels were
 *                measured over — so a new Power with a longer name fails HERE,
 *                at the point where someone can re-measure, instead of
 *                silently making one tray taller than its neighbours.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { GenomeV2WorkbenchView } from './WorkbenchView';
import { GENOME_V2_SPLICES, GENOME_V2_SPLICE_IDS } from '@/shared/game/genomeV2';
import { GENOME_V2_GENES } from '@/shared/game/genes';
import type { GenomeV2ActiveGeneId } from '@/shared/game/genes';

/** The catalog drives this file: no list of ids is maintained beside it. */
const GENE_IDS = Object.keys(GENOME_V2_GENES) as GenomeV2ActiveGeneId[];

const mockUseAuth = jest.fn();
jest.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('@/lib/features/workbench', () => ({ WORKBENCH_V1_ENABLED: true }));
jest.mock('@/lib/features/genomeV2', () => ({ GENOME_V2_ENABLED: true }));

const CSS = readFileSync(
  path.join(__dirname, 'WorkbenchView.module.css'),
  'utf8'
);

/**
 * THE BUDGET THE 132/168/84/100px TRAYS WERE MEASURED OVER.
 *
 * Every label a socket can wear is a Power name, a Combo name, or one of the
 * two empty words. The tallest content in the catalog is "Double or Nothing"
 * over two Path badges; the tray heights were measured with exactly that in
 * the socket, at every column width the bench produces.
 *
 * Characters and word length are a proxy for rendered width, and are honest
 * about being one: they cannot prove a string fits, only that it is no bigger
 * than the string that was measured. That is the whole job — the numbers are
 * only valid for the catalog they were taken over, and this notices when the
 * catalog leaves it.
 */
const LONGEST_MEASURED_LABEL = 'Double or Nothing';
const LABEL_BUDGET = LONGEST_MEASURED_LABEL.length;
/** "Straight" — the longest unbreakable run, which is what sets the floor a
 *  column can narrow to before `overflow-wrap: anywhere` starts cutting. */
const WORD_BUDGET = 8;
/** Two badges fit one row down to ~135px of column, which the column floor
 *  keeps them above. A third would wrap and take the tray with it. */
const STRAIN_BUDGET = 2;

function slotLabels(): string[] {
  return [
    ...GENE_IDS.map((id) => GENOME_V2_GENES[id].name),
    ...GENOME_V2_SPLICE_IDS.map((id) => GENOME_V2_SPLICES[id].name),
    'OPEN',
    'EMPTY',
  ];
}

const NON_COMBINING_SIX = [
  'gold_trail',
  'live_wire',
  'coilkeeper',
  'wall_rush',
  'mirror_wager',
  'loan_shark',
] as const;

async function renderResearch() {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      snakes: [
        {
          id: 'cyber-4',
          name: 'Cyber Spark',
          dynasty: 'CYBER',
          generation: 4,
          equipped: true,
        },
      ],
    }),
  }) as unknown as typeof fetch;
  await act(async () => {
    render(<GenomeV2WorkbenchView />);
  });
}

function fillBench() {
  NON_COMBINING_SIX.forEach((geneId, slot) => {
    fireEvent.click(screen.getByTestId(`workbench-locus-${slot}`));
    fireEvent.click(screen.getByTestId(`workbench-gene-${geneId}`));
    fireEvent.click(screen.getByTestId('workbench-thread'));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({
    session: { access_token: 'token', user: { id: 'user-a' } },
    isAuthenticated: true,
  });
});

describe('every socket on the bench is the same tray', () => {
  it('sizes the socket itself, not the cell around it', () => {
    // The defect in one line of CSS. `min-height` lets a long name push past
    // it; a stretched CELL says nothing about the button inside it. Only a
    // height on the socket makes six sockets one size.
    const slotRule = CSS.match(/\n\.slot \{[^}]*\}/);
    expect(slotRule).not.toBeNull();
    expect(slotRule![0]).toContain('height: var(--slot-h);');
    expect(slotRule![0]).not.toContain('min-height');
  });

  it('never lets a later rule reintroduce a content-sized socket', () => {
    // A `min-height` in a media query is how this defect comes back: it reads
    // as a tightening and is in fact a licence to grow.
    expect(CSS).not.toMatch(/\.slot\b[^{]*\{[^}]*min-height/);
  });

  it('declares the shared height on the row, so all six read the same value', () => {
    const declarations = CSS.match(/[^\n]*--slot-h:[^\n]*/g) ?? [];
    expect(declarations.length).toBeGreaterThan(0);
    for (const declaration of declarations) {
      expect(declaration).toMatch(/\.slotRow \{|^\s+--slot-h:/);
    }
    // The measured constants. Changing one of these means re-measuring, which
    // is exactly the friction it is here to create.
    const values = (CSS.match(/--slot-h: (\d+)px/g) ?? []).map((d) =>
      Number(d.replace(/\D/g, ''))
    );
    expect(new Set(values)).toEqual(new Set([132, 168, 84, 100]));
  });

  it('drops a column before the copy wraps, at the measured 150px floor', () => {
    // 6 columns need (W - 5x8)/6 >= 150 -> 940. 3 need (W - 2x8)/3 -> 466.
    // 2 need (W - 8)/2 -> 308. These three numbers ARE the tray sizing: they
    // are why one height serves every real device.
    expect(CSS).toContain('@container bench (max-width: 939px)');
    expect(CSS).toContain('@container bench (max-width: 465px)');
    expect(CSS).toContain('@container bench (max-width: 315px)');
    expect(CSS).toMatch(/\.genomeStage,\s*\n\.studyBody \{[^}]*container-type: inline-size/);
  });

  it('renders all six sockets identically clothed, with no per-slot sizing', async () => {
    await renderResearch();
    fillBench();

    const sockets = Array.from({ length: 6 }, (_, slot) =>
      screen.getByTestId(`workbench-locus-${slot}`)
    );
    const clothing = new Set(sockets.map((socket) => socket.className));
    expect(clothing.size).toBe(1);
    for (const socket of sockets) {
      // An inline height is the other way six trays drift apart, and it is
      // the way a "quick fix" would arrive.
      expect(socket.getAttribute('style')).toBeNull();
      expect(socket.querySelector('strong')).not.toBeNull();
    }
  });
});

describe('the catalog stays inside the budget the trays were measured over', () => {
  it.each(slotLabels())('%s fits the measured label budget', (label) => {
    expect(label.length).toBeLessThanOrEqual(LABEL_BUDGET);
    const longestWord = Math.max(...label.split(/[\s]+/).map((word) => word.length));
    expect(longestWord).toBeLessThanOrEqual(WORD_BUDGET);
  });

  it.each(GENE_IDS)('%s wears at most two Path badges', (geneId) => {
    const strains = new Set(GENOME_V2_GENES[geneId].strains);
    expect(strains.size).toBeLessThanOrEqual(STRAIN_BUDGET);
  });

  it('is measured over the longest label the catalog actually has', () => {
    // If a rename ever makes something else the longest, the constant above
    // is no longer describing the thing that was measured.
    const longest = slotLabels().reduce((a, b) => (b.length > a.length ? b : a));
    expect(longest.length).toBe(LABEL_BUDGET);
  });
});
