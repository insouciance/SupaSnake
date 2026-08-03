import * as fs from 'fs';
import * as path from 'path';

describe('Tactical Loom mobile input boundary', () => {
  it('removes the flick surface only for the intentional engine-frozen decision state', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/app/game/page.tsx'),
      'utf8'
    );
    const choiceBoundary = source.match(
      /const choiceActive =[\s\S]*?;\n\s*const blockingOverlayActive =/
    )?.[0];
    expect(choiceBoundary).toBeDefined();
    expect(choiceBoundary).toContain('genomeRulesVersion === 2');
    expect(choiceBoundary).toContain('genomeV2OfferPresentation !== null');
    expect(choiceBoundary).toContain('choiceOptions !== null');
    expect(choiceBoundary).toContain('portalChoicePending');
    expect(choiceBoundary).toContain('surgeChoicePending');
    const blockingBoundary = source.match(
      /const blockingOverlayActive =[\s\S]*?;/
    )?.[0];
    expect(blockingBoundary).toBeDefined();
    expect(blockingBoundary).toContain('choiceActive');
    expect(blockingBoundary).toContain('showAbandonConfirm');
    expect(blockingBoundary).toContain('runEngineFault');
    expect(blockingBoundary).toContain("continuitySafetyHold === 'stale'");
    expect(blockingBoundary).toContain("terminalRecoveryState !== 'idle'");
    expect(blockingBoundary).not.toContain("continuitySafetyHold === 'connection'");
    expect(blockingBoundary).not.toContain("continuitySafetyHold === 'integrity'");
    expect(source).toMatch(
      /isMobile && isPlaying && !isGameOver && \(!isPaused \|\| awaitingResumeInput\) && !blockingOverlayActive && \(\s*<FlickSurface/
    );
  });

  it('does not add a persistent route-level pointer interceptor', () => {
    const loom = fs.readFileSync(
      path.join(
        process.cwd(),
        'src/components/game/genome/TacticalLoomDecision.tsx'
      ),
      'utf8'
    );
    expect(loom).not.toMatch(/position:\s*['"]fixed['"]/);
    expect(loom).not.toMatch(/addEventListener\(['"]pointer(move|down|up)/);
  });

  it('hides only the global legal footer, never the Loom action footer', () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), 'src/app/globals.css'),
      'utf8'
    );
    const footer = fs.readFileSync(
      path.join(process.cwd(), 'src/components/ui/Footer.tsx'),
      'utf8'
    );
    expect(footer).toContain('data-site-footer');
    expect(css).toContain(
      'body:has(.cockpit-game-viewport) [data-site-footer]'
    );
    expect(css).not.toMatch(
      /body:has\(\.cockpit-game-viewport\)\s+footer\s*\{/
    );
  });
});
