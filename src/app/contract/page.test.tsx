/**
 * `/contract` — the manifesto page (Constitution §3, §11.6; Rules 7 and 14).
 *
 * The load-bearing test here is the Rule 7 sweep. The failure mode this page
 * guards against is not a deliberate advert; it is the copy edit in 2028
 * that adds "…and supporters get an extra board" to a page whose entire
 * value is that it never says anything like that. So the rendered text is
 * run through `commercialTerms()` — the same lint that refuses to send a
 * Dispatch email — rather than through a hand-written list of bad words that
 * would drift from it.
 */

import { render, screen } from '@testing-library/react';
import { commercialTerms } from '@/lib/growth/commercialLanguage';
import { CONTRACT_CLAUSES, contractPlainText } from '@/lib/growth/playerContract';

class NotFoundError extends Error {}

jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new NotFoundError('NEXT_NOT_FOUND');
  },
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

jest.mock('@/components/ui/NavBar', () => ({
  NavBar: () => <nav data-testid="navbar" />,
}));

let contractEnabled = false;
jest.mock('@/lib/features/contract', () => ({
  get PLAYER_CONTRACT_V1_ENABLED() {
    return contractEnabled;
  },
}));

import ContractPage, { metadata } from './page';

describe('/contract — the player’s contract', () => {
  afterEach(() => {
    contractEnabled = false;
  });

  it('404s while the flag is off — the tested rollback path', () => {
    contractEnabled = false;
    expect(() => render(<ContractPage />)).toThrow(NotFoundError);
  });

  describe('flag on', () => {
    beforeEach(() => {
      contractEnabled = true;
    });

    it('renders every clause, its plain-words body, and how to check it', () => {
      const { container } = render(<ContractPage />);
      const text = container.textContent ?? '';

      expect(CONTRACT_CLAUSES).toHaveLength(9);
      for (const clause of CONTRACT_CLAUSES) {
        expect(text).toContain(clause.title);
        expect(text).toContain(clause.body);
        expect(text).toContain(clause.test);
      }
    });

    it('states the four promises the Constitution is built on', () => {
      render(<ContractPage />);
      const text = screen.getByTestId('player-contract').textContent ?? '';
      // §3's own claims, in the page's words: the two numbers, permanence,
      // and absence. If any of these stops being said, §3 stopped being
      // published, which is the one thing §3 requires.
      expect(text).toMatch(/score measures you, not your build/i);
      expect(text).toMatch(/money moves no number/i);
      expect(text).toMatch(/everything you earn is permanent/i);
      expect(text).toMatch(/being away is never destructive/i);
    });

    it('publishes both sides: what money can reach, and what it cannot', () => {
      const text =
        render(<ContractPage />).container.textContent ?? '';
      // §3: "Paying players get: appearance, continuity, and recognition."
      expect(text).toMatch(/appearance, continuity, recognition/i);
      // …and the sentence that is the test.
      expect(text).toMatch(/a free player and a supporter play the same game/i);
    });

    it('carries NO commercial vocabulary anywhere in the rendered page (Rule 7)', () => {
      const { container } = render(<ContractPage />);
      expect(commercialTerms(container.textContent ?? '')).toEqual([]);
    });

    it('keeps the source copy commercial-free too, so a card cannot drift', () => {
      // The rendered sweep only sees what the page happens to render today.
      // This one covers every published string, including the OG card lines.
      expect(commercialTerms(contractPlainText())).toEqual([]);
    });

    it('links nowhere commercial: the only way out is a free run (Rule 7)', () => {
      const { container } = render(<ContractPage />);
      const links = Array.from(container.querySelectorAll('a')).map((a) =>
        a.getAttribute('href')
      );
      expect(links).not.toContain('/shop');
      expect(links.filter((href) => href?.startsWith('/shop'))).toEqual([]);
      expect(screen.getByTestId('contract-play-link')).toHaveAttribute('href', '/');
    });

    it('gives every clause its own anchor, so a single promise is quotable', () => {
      const { container } = render(<ContractPage />);
      for (const clause of CONTRACT_CLAUSES) {
        expect(container.querySelector(`#${clause.id}`)).not.toBeNull();
        expect(
          container.querySelector(`a[href="/contract#${clause.id}"]`)
        ).not.toBeNull();
      }
    });

    it('has a canonical URL and an Open Graph entry (Rule 14)', () => {
      expect(metadata.alternates?.canonical).toBe(
        'https://supasnake.com/contract'
      );
      expect(metadata.openGraph?.url).toBe('https://supasnake.com/contract');
      expect(String(metadata.title)).toMatch(/contract/i);
      expect(commercialTerms(String(metadata.description ?? ''))).toEqual([]);
    });
  });
});
