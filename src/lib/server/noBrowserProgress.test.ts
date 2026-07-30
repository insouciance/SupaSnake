import * as fs from 'fs';
import * as path from 'path';

describe('browser progress boundary', () => {
  it('marks every API response private and non-cacheable at the framework boundary', () => {
    const config = fs.readFileSync(path.join(process.cwd(), 'next.config.js'), 'utf8');
    expect(config).toMatch(/source:\s*['"]\/api\/:path\*['"]/);
    expect(config).toMatch(/key:\s*['"]Cache-Control['"][\s\S]*?value:\s*['"]private, no-store['"]/);
  });

  it('keeps public Chronicle HTML and RSC responses dynamic and non-cacheable', () => {
    const config = fs.readFileSync(path.join(process.cwd(), 'next.config.js'), 'utf8');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/app/p/[handle]/page.tsx'),
      'utf8'
    );
    expect(config).toMatch(/source:\s*['"]\/p\/:path\*['"][\s\S]*?value:\s*['"]private, no-store['"]/);
    expect(source).toMatch(/export const dynamic = ['"]force-dynamic['"]/);
    expect(source).toMatch(/export const revalidate = 0/);
    expect(source).toMatch(/unstable_noStore as noStore/);
    expect(source).toMatch(/noStore\(\)/);
    expect(source).not.toMatch(/ISR-cached|revalidate = 60/);
  });

  it('makes earned and progression reads explicitly bypass browser caches', () => {
    const reads = [
      ['src/app/lab/page.tsx', '/api/player'],
      ['src/app/lab/page.tsx', '/api/mastery'],
      ['src/lib/stores/codexStore.ts', '/api/codex'],
      ['src/app/profile/page.tsx', '/api/analyst/digest'],
      ['src/app/profile/page.tsx', '/api/analyst/recall'],
      ['src/app/profile/page.tsx', '/api/chronicle'],
      ['src/components/chronicle/CareerPulse.tsx', '/api/progression/career-pulse'],
      ['src/components/signal/SignalSurface.tsx', '/api/signal/panel'],
      ['src/components/clan/EnergyBattlePanel.tsx', '/api/clan/energy-battle'],
      ['src/hooks/useWalletSync.ts', '/api/player'],
      ['src/components/ui/NotificationProvider.tsx', '/api/progression/attention'],
      ['src/components/lab/LineageDossier.tsx', '/api/progression/lineage'],
      ['src/components/profile/CareerStats.tsx', '/api/player/stats'],
      ['src/components/profile/AimSystemPanel.tsx', '/api/player'],
      ['src/components/profile/DigestEmailPanel.tsx', '/api/player'],
      ['src/components/clan/PlayoffBracket.tsx', '/api/season'],
      ['src/components/clan/ClanFoundingPrompt.tsx', '/api/player'],
      ['src/components/identity/IdentityPanel.tsx', '/api/player/identity'],
    ] as const;

    for (const [file, endpoint] of reads) {
      const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      const escapedEndpoint = endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(source).toMatch(
        new RegExp(`${escapedEndpoint}[\\s\\S]{0,260}cache:\\s*['\"]no-store['\"]`)
      );
    }
  });

  it('keeps analytics state in memory and deletes every legacy durable identifier', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/analytics/posthog.ts'),
      'utf8'
    );
    expect(source).toMatch(/persistence:\s*['"]memory['"]/);
    expect(source).toMatch(/clearLegacyStorage\(window\.localStorage\)/);
    expect(source).toMatch(/clearLegacyStorage\(window\.sessionStorage\)/);
    expect(source).toMatch(/disable_persistence:\s*true/);
    expect(source).toMatch(/disable_session_recording:\s*true/);
    expect(source).toMatch(/disable_surveys:\s*true/);
    expect(source).toMatch(/disable_product_tours:\s*true/);
    expect(source).toMatch(/disable_conversations:\s*true/);
    expect(source).toMatch(/disable_external_dependency_loading:\s*true/);
    expect(source).not.toMatch(/persistence:\s*['"]localStorage/);
  });
});
