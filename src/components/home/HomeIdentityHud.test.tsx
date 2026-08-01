import { render, screen } from '@testing-library/react';
import { HomeIdentityHud } from './HomeIdentityHud';

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
      'Volt Genome lineage'
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
