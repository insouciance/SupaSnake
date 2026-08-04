import { render, screen } from '@testing-library/react';
import {
  HOME_HEADER_GRID,
  HomeIdentityHud,
  homeHeaderGridGeometry,
} from './HomeIdentityHud';

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
