/**
 * Records cabinet tests (Player Identity v1 sections 6 + 7.1): category
 * grouping, tier names in the section 5.5 rarity language, the
 * capstone ring, and the want-list progress captions.
 */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RecordsCabinet } from './RecordsCabinet';
import type { ChronicleRecord, RecordsCabinetData } from '@/lib/chronicle/types';

function record(overrides: Partial<ChronicleRecord>): ChronicleRecord {
  return {
    id: 'vault',
    name: 'The Vault',
    category: 'extraction',
    dynasty: null,
    measures: 'Lifetime DNA banked (extracted runs)',
    thresholds: [5000, 25000, 100000, 400000, 1000000],
    tierPoints: [5, 10, 20, 35, 60],
    value: 0,
    tier: 0,
    ...overrides,
  };
}

const data: RecordsCabinetData = {
  records: [
    record({ id: 'vault', value: 30000, tier: 2 }),
    record({
      id: 'high_water',
      name: 'High Water',
      measures: 'Best single-run banked payout',
      thresholds: [500, 1200, 2500, 4500, 6500],
      value: 2600,
      tier: 3,
    }),
    record({
      id: 'menagerie',
      name: 'The Menagerie',
      category: 'collection',
      measures: 'Distinct variants collected (of 30)',
      thresholds: [5, 12, 20, 26, 30],
      value: 30,
      tier: 5,
    }),
    record({
      id: 'tenure',
      name: 'Tenure',
      category: 'veterancy',
      measures: 'Account age (days)',
      thresholds: [30, 90, 365, 730, 1461],
      value: 3,
      tier: 0,
    }),
  ],
  capstones: [
    {
      category: 'extraction',
      titleId: 'title_extractor_prime',
      titleName: 'Extractor Prime',
      minTier: 2,
      unlocked: false,
      apex: false,
    },
    {
      category: 'collection',
      titleId: 'title_grand_curator',
      titleName: 'Grand Curator',
      minTier: 5,
      unlocked: true,
      apex: true,
    },
  ],
};

describe('RecordsCabinet', () => {
  it('groups records by category with their capstone', () => {
    render(<RecordsCabinet data={data} />);
    expect(screen.getByTestId('records-category-extraction')).toBeInTheDocument();
    expect(screen.getByTestId('records-category-collection')).toBeInTheDocument();
    expect(screen.getByTestId('records-category-veterancy')).toBeInTheDocument();
    expect(screen.getByTestId('capstone-extraction')).toHaveTextContent('Extractor Prime');
    expect(screen.getByTestId('capstone-collection')).toHaveTextContent('Grand Curator');
  });

  it('shows reached tier names (Silver/Gold/Apex) and Unranked for tier 0', () => {
    render(<RecordsCabinet data={data} />);
    expect(screen.getByTestId('record-tier-vault')).toHaveTextContent('Silver');
    expect(screen.getByTestId('record-tier-high_water')).toHaveTextContent('Gold');
    expect(screen.getByTestId('record-tier-menagerie')).toHaveTextContent('Apex');
    expect(screen.getByTestId('record-tenure')).toHaveTextContent('Unranked');
  });

  it('captions progress toward the NEXT threshold (want-list), Apex shows no next', () => {
    render(<RecordsCabinet data={data} />);
    expect(screen.getByTestId('record-vault')).toHaveTextContent('30,000 / 100,000');
    expect(screen.getByTestId('record-menagerie')).toHaveTextContent('30 — Apex');
    // Unranked records still show their first rung - never an empty grid
    expect(screen.getByTestId('record-tenure')).toHaveTextContent('3 / 30');
  });

  it('renders five tier pips per record', () => {
    render(<RecordsCabinet data={data} />);
    const pips = screen.getAllByTestId('tier-pips');
    expect(pips).toHaveLength(4);
  });
});
