import { render, screen } from '@testing-library/react';
import { StrainMeterHUD } from './StrainMeterHUD';

describe('StrainMeterHUD', () => {
  it('renders all five slots, points, and active tier names', () => {
    render(
      <StrainMeterHUD
        counts={{ AURUM: 3, UMBRA: 4 }}
        tiers={{ AURUM: 2, UMBRA: 3 }}
      />
    );
    expect(screen.getByTestId('strain-meter').children).toHaveLength(5);
    expect(screen.getByTestId('strain-meter-AURUM')).toHaveTextContent('Gilded Wake');
    expect(screen.getByTestId('strain-meter-AURUM')).toHaveTextContent('Aurum');
    expect(screen.getByTestId('strain-meter-UMBRA')).toHaveTextContent('Second Sun');
  });

  it('marks a Gauntlet-suppressed strain as capped', () => {
    render(
      <StrainMeterHUD
        counts={{ FERAL: 4 }}
        tiers={{ FERAL: 1 }}
        suppressed={['FERAL']}
      />
    );
    expect(screen.getByTestId('strain-meter-FERAL')).toHaveTextContent('CAP');
    expect(screen.getByTestId('strain-meter-FERAL')).toHaveAttribute(
      'title',
      expect.stringContaining('suppressed above Minor')
    );
  });
});
