import { render, screen } from '@testing-library/react';
import {
  HOME_HEADER_GRID,
  HOME_WORDMARK,
  HomeIdentityHud,
  homeHeaderGridGeometry,
} from './HomeIdentityHud';

describe('the mark, under the locked wordmark geometry', () => {
  const renderHud = () =>
    render(
      <HomeIdentityHud
        specimen={null}
        clan={null}
        authenticated={false}
        dna={null}
        energy={null}
      />
    );

  /**
   * The wordmark ruling locked a tilt, a top margin and three size steps. The
   * medium changed from type to an image; these did not, and this is the test
   * that says so. If somebody restyles the heading, the mark silently changes
   * size with it — so the classes are asserted literally.
   */
  it('keeps the ruling: -2deg tilt, mt-10/sm:mt-14, and the 4xl/6xl/7xl steps', () => {
    renderHud();
    const heading = screen.getByRole('heading', { level: 1 });
    for (const cls of [
      '-rotate-[2deg]',
      'mt-10',
      'sm:mt-14',
      'text-4xl',
      'sm:text-6xl',
      'lg:text-7xl',
    ]) {
      expect(heading).toHaveClass(cls);
    }
  });

  it('sizes the mark in em off that same type scale, so the box cannot drift', () => {
    renderHud();
    const img = screen.getByRole('heading', { level: 1 }).querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveStyle({ width: `${HOME_WORDMARK.widthEm}em` });

    // 6.12em is the measured ratio of the old wordmark's width to its
    // font-size, identical at all three breakpoints. These are the pixel
    // widths it reproduces; if the constant moves, the footprint moved.
    expect(HOME_WORDMARK.widthEm * 36).toBeCloseTo(220.3, 1);
    expect(HOME_WORDMARK.widthEm * 60).toBeCloseTo(367.2, 1);
    expect(HOME_WORDMARK.widthEm * 72).toBeCloseTo(440.6, 1);
  });

  it('serves the derived ladder and keeps the name in the accessibility tree', () => {
    renderHud();
    const img = screen.getByRole('heading', { level: 1 }).querySelector('img');
    expect(img).toHaveAttribute('src', '/brand/mark.png');
    expect(img?.getAttribute('srcSet')).toContain('/brand/mark@3x.png 3x');
    // The image is decorative; the h1's sr-only span is the only place the
    // product name exists as a string now that the lettering is drawn.
    expect(img).toHaveAttribute('alt', '');
    expect(screen.getByText('SUPASNAKE')).toHaveClass('sr-only');
  });

  it('declares intrinsic dimensions, so the hero reserves its box before it loads', () => {
    renderHud();
    const img = screen.getByRole('heading', { level: 1 }).querySelector('img');
    expect(img).toHaveAttribute('width', String(HOME_WORDMARK.intrinsicWidth));
    expect(img).toHaveAttribute('height', String(HOME_WORDMARK.intrinsicHeight));
  });
});

describe('HomeIdentityHud', () => {
  it('renders only factual server-fed identity and one unified wallet', () => {
    render(
      <HomeIdentityHud
        specimen={{ variantName: 'CYBER SPARK', generation: 11, lineageStrain: 'VOLT' }}
        clan={{ name: 'Apex Coil', tag: 'APEX' }}
        authenticated
        dna={48_260}
        energy={{ available: 6, capacity: 6, visible: true }}
      />
    );

    expect(screen.getByText('SUPASNAKE')).toBeInTheDocument();
    expect(screen.getByTestId('home-specimen-identity')).toHaveTextContent(
      'CYBER SPARK · Gen 11'
    );
    expect(screen.getByTestId('home-lineage-rune')).toHaveAttribute(
      'title',
      'Pulse Genome lineage'
    );
    expect(screen.getByTestId('home-clan-identity')).toHaveTextContent('Apex Coil');
    expect(screen.getByTestId('home-clan-identity')).toHaveAttribute('href', '/clan');
    expect(screen.getByTestId('home-wallet')).toHaveTextContent('48,260');
    expect(screen.getByTestId('home-wallet')).toHaveTextContent('6/6');
    expect(screen.getAllByTestId('home-wallet')).toHaveLength(1);
    expect(screen.getByTestId('home-settings')).toHaveAttribute('href', '/settings');
    const header = screen.getByRole('banner');
    expect(header).toHaveAttribute('data-home-identity-hud');
    expect(header.firstElementChild).toHaveClass('flex-col');
  });

  it('reserves a non-overlapping Settings rail for the longest catalog identity at 320px', () => {
    const geometry = homeHeaderGridGeometry(320);
    expect(geometry).toEqual({
      identityLeft: 64,
      identityRight: 256,
      identityWidth: 192,
      settingsLeft: 264,
      settingsRight: 308,
    });
    expect(geometry.identityRight + HOME_HEADER_GRID.columnGapPx).toBe(
      geometry.settingsLeft
    );

    render(
      <HomeIdentityHud
        specimen={{
          variantName: 'COSMIC SINGULARITY',
          generation: 999_999,
          lineageStrain: 'UMBRA',
        }}
        clan={{ name: 'SINGULARITY SERPENTS', tag: 'SING' }}
        authenticated
        dna={48_260}
        energy={{ available: 6, capacity: 6, visible: true }}
      />
    );

    const header = screen.getByRole('banner');
    expect(header).toHaveStyle({
      paddingLeft: '12px',
      paddingRight: '12px',
      columnGap: '8px',
      gridTemplateColumns: '44px minmax(0, 1fr) 44px',
    });
    const specimen = screen.getByTestId('home-specimen-identity');
    expect(specimen).toHaveClass('w-full', 'min-w-0', 'text-xs');
    expect(specimen).toHaveAttribute(
      'aria-label',
      'COSMIC SINGULARITY · Gen 999999'
    );
    expect(specimen).toHaveAccessibleName(
      'COSMIC SINGULARITY · Gen 999999'
    );
    expect(specimen).toHaveAttribute(
      'title',
      'COSMIC SINGULARITY · Gen 999999'
    );
    expect(screen.getByTestId('home-specimen-name')).toHaveClass(
      'min-w-0',
      'truncate'
    );
    expect(screen.getByTestId('home-specimen-generation')).toHaveClass('shrink-0');

    const clan = screen.getByTestId('home-clan-identity');
    expect(clan).toHaveClass('min-w-0', 'max-w-full', 'overflow-hidden');
    expect(clan).toHaveAttribute(
      'aria-label',
      'Clan SINGULARITY SERPENTS, SING'
    );
    expect(clan).toHaveAccessibleName('Clan SINGULARITY SERPENTS, SING');
    expect(clan).toHaveAttribute(
      'title',
      'Clan SINGULARITY SERPENTS, SING'
    );
    expect(screen.getByTestId('home-clan-name')).toHaveClass('min-w-0', 'truncate');
    expect(screen.getByTestId('home-settings')).toHaveClass(
      'col-start-3',
      'row-start-1',
      'h-11',
      'w-11'
    );
  });

  it('keeps a short specimen identity fully visible at desktop width', () => {
    const geometry = homeHeaderGridGeometry(1280);
    expect(geometry.identityWidth).toBe(1152);

    render(
      <HomeIdentityHud
        specimen={{ variantName: 'CYBER SPARK', generation: 11, lineageStrain: null }}
        clan={null}
        authenticated={false}
        dna={null}
        energy={null}
      />
    );

    expect(screen.getByTestId('home-specimen-name')).toHaveTextContent('CYBER SPARK');
    expect(screen.getByTestId('home-specimen-generation')).toHaveTextContent('· Gen 11');
    expect(screen.getByTestId('home-specimen-identity')).toHaveClass('sm:text-base');
  });

  it('never invents identity or Energy while authoritative values are absent', () => {
    render(
      <HomeIdentityHud
        specimen={null}
        clan={null}
        authenticated
        dna={null}
        energy={null}
      />
    );

    expect(screen.queryByTestId('home-specimen-identity')).toBeNull();
    expect(screen.queryByTestId('home-clan-identity')).toBeNull();
    expect(screen.getByTestId('home-wallet')).toHaveTextContent('—');
    expect(screen.queryByTitle('Recovered Energy')).toBeNull();
  });

  it('keeps the signed-out chamber clean while Settings stays reachable', () => {
    render(
      <HomeIdentityHud
        specimen={null}
        clan={null}
        authenticated={false}
        dna={null}
        energy={null}
      />
    );

    expect(screen.queryByTestId('home-wallet')).toBeNull();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveClass('h-11', 'w-11');
  });
});
