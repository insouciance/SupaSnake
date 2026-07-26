/**
 * Additive contribution display (§9.2, Rule 8) and the hidden-member honesty
 * problem (§13).
 *
 * Two properties are asserted here that no amount of copy review would catch:
 * that the rows carry no ordinal, share or bar, and that when the cohort filter
 * withholds a member the list SAYS the visible rows add up to less than the
 * clan's total rather than quietly presenting arithmetic that looks broken.
 */

import { render, screen, within } from '@testing-library/react';
import { ContributionList, type ContributionMember } from './ContributionList';

const SOLO: ContributionMember[] = [
  { playerId: 'p1', handle: 'Sans_Souci', depth: 2315, attempts: 3 },
];

describe('N = 1', () => {
  it('renders one row for a clan of one and calls it theirs', () => {
    render(
      <ContributionList
        members={SOLO}
        hiddenMembers={0}
        memberCount={1}
        youPlayerId="p1"
      />
    );

    const rows = screen.getAllByTestId('contribution-row');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('Sans_Souci (you)')).toBeInTheDocument();
    expect(within(rows[0]).getByText(/fed 2,315 segments/)).toBeInTheDocument();
  });

  it('names an unknown handle without inventing one', () => {
    render(
      <ContributionList
        members={[{ playerId: 'p9', handle: null, depth: 40, attempts: 1 }]}
        hiddenMembers={0}
        memberCount={1}
      />
    );
    expect(screen.getByText('A handler')).toBeInTheDocument();
  });

  it('reads an empty week as an opening rather than a void', () => {
    render(<ContributionList members={[]} hiddenMembers={0} memberCount={1} />);

    expect(screen.getByTestId('contribution-empty')).toHaveTextContent(
      /No runs are in this week yet/i
    );
    expect(screen.queryByTestId('contribution-row')).not.toBeInTheDocument();
  });

  it('states a member at zero as a fact about the week, not about the person', () => {
    render(
      <ContributionList
        members={[{ playerId: 'p1', handle: 'Sans_Souci', depth: 0, attempts: 0 }]}
        hiddenMembers={0}
        memberCount={1}
        youPlayerId="p1"
      />
    );
    expect(screen.getByText('has not hunted yet this week')).toBeInTheDocument();
  });
});

describe('the display is additive, never evaluative (Rule 8)', () => {
  const members: ContributionMember[] = [
    { playerId: 'p1', handle: 'Sans_Souci', depth: 2315, attempts: 3 },
    { playerId: 'p2', handle: 'viper', depth: 400, attempts: 2 },
    { playerId: 'p3', handle: 'drago', depth: 0, attempts: 0 },
  ];

  it('renders every member, including the one at zero', () => {
    render(<ContributionList members={members} hiddenMembers={0} memberCount={3} />);
    expect(screen.getAllByTestId('contribution-row')).toHaveLength(3);
  });

  it('numbers nobody and shows no share, percentage or bar', () => {
    const { container } = render(
      <ContributionList members={members} hiddenMembers={0} memberCount={3} />
    );
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/%/);
    expect(text).not.toMatch(/\b1st\b|\b2nd\b|\b3rd\b/);
    expect(text).not.toMatch(/\bof the clan's\b/i);
    expect(container.querySelector('ol')).toBeNull(); // an ordered list IS a ranking
    expect(container.querySelector('progress')).toBeNull();
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('renders no control that could act on another member', () => {
    render(<ContributionList members={members} hiddenMembers={0} memberCount={3} />);
    // There is no officer, so there is no lever, so there is no button.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('hidden members are shown honestly (§13)', () => {
  it('says how many names it is showing and why the rows add up to less', () => {
    render(
      <ContributionList members={SOLO} hiddenMembers={2} memberCount={3} />
    );

    const note = screen.getByTestId('hidden-members-note');
    expect(note).toHaveTextContent('Showing 1 of 3 members');
    expect(note).toHaveTextContent(/2 members keep their name off public lists/);
    expect(note).toHaveTextContent(/already inside the clan’s Depth above/);
    expect(note).toHaveTextContent(/add up to less than the total on purpose/);
  });

  it('says "One member keeps" for a single withheld member', () => {
    render(<ContributionList members={SOLO} hiddenMembers={1} memberCount={2} />);
    expect(screen.getByTestId('hidden-members-note')).toHaveTextContent(
      /One member keeps their name off public lists/
    );
  });

  it('stays silent when nothing is withheld', () => {
    render(<ContributionList members={SOLO} hiddenMembers={0} memberCount={1} />);
    expect(screen.queryByTestId('hidden-members-note')).not.toBeInTheDocument();
  });

  it('renders the note even when every visible row is withheld', () => {
    render(<ContributionList members={[]} hiddenMembers={2} memberCount={2} />);

    expect(screen.queryByTestId('contribution-empty')).not.toBeInTheDocument();
    expect(screen.getByTestId('hidden-members-note')).toHaveTextContent(
      'Showing 0 of 2 members'
    );
  });
});
