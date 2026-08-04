import { render, screen } from '@testing-library/react';

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
  }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

jest.mock('@/components/ui/NavBar', () => ({
  NavBar: () => <nav data-testid="navbar" />,
}));

let growthSurfacesEnabled = false;
jest.mock('@/lib/features/growth', () => ({
  get GROWTH_SURFACES_V1_ENABLED() {
    return growthSurfacesEnabled;
  },
}));

import PlayPage, { metadata } from './page';

describe('/play intent page', () => {
  afterEach(() => {
    growthSurfacesEnabled = false;
  });

  it('404s while the growth flag is off — the tested rollback path', () => {
    growthSurfacesEnabled = false;
    expect(() => render(<PlayPage />)).toThrow(NotFoundError);
  });

  describe('flag on', () => {
    beforeEach(() => {
      growthSurfacesEnabled = true;
    });

    it('answers the query with a heading, the pitch, and a way in', () => {
      render(<PlayPage />);
      expect(
        screen.getByRole('heading', { level: 1, name: /play snake online/i })
      ).toBeInTheDocument();
      expect(screen.getByTestId('play-cta')).toHaveAttribute('href', '/');
    });

    it('explains the extraction decision, which is the product', () => {
      const { container } = render(<PlayPage />);
      expect(container.textContent).toMatch(/BANK/);
      expect(container.textContent).toMatch(/RIDE ON/);
      expect(container.textContent).toMatch(/TRADE UP/);
    });

    it('emits VideoGame structured data', () => {
      const { container } = render(<PlayPage />);
      const script = container.querySelector(
        'script[type="application/ld+json"]'
      );
      expect(script).not.toBeNull();
      const data = JSON.parse(script!.innerHTML);
      expect(data['@context']).toBe('https://schema.org');
      expect(data['@type']).toBe('VideoGame');
      expect(data.url).toBe('https://supasnake.com');
      expect(data.isAccessibleForFree).toBe(true);
      expect(data.offers.price).toBe('0');
    });

    it('carries a canonical URL and its own title', () => {
      expect(metadata.alternates?.canonical).toBe('https://supasnake.com/play');
      expect(String(metadata.title)).toMatch(/play snake online/i);
    });

    it('is not commerce (Rule 7): no price, SKU, or store link', () => {
      const { container } = render(<PlayPage />);
      const links = Array.from(container.querySelectorAll('a')).map((a) =>
        a.getAttribute('href')
      );
      expect(links).not.toContain('/shop');
      // The structured-data script is markup, not a surface; check the prose.
      const prose = container.querySelector('main')?.textContent ?? '';
      expect(prose).not.toMatch(/€|\bbuy now\b|\bsubscribe\b|\bpremium\b|\bcheckout\b/i);
      // The page answers "what does it cost" with "nothing", not with a price.
      expect(prose).toMatch(/What it costsNothing\./);
      expect(prose).toMatch(/free to play/i);
    });
  });
});
