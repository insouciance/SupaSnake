import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildLabSetupHref,
  readRunSetupDraft,
  resolveSafeRunSetupReturnPath,
} from '@/lib/game/runSetupDraft';

const read = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), 'utf8');

describe('pre-run snake selection boundaries', () => {
  it('Lab equips and returns to Setup without preparing or starting a run', () => {
    const source = read('src/app/lab/page.tsx');
    const handlerStart = source.indexOf('const handlePlayWithSnake');
    const handlerEnd = source.indexOf('/**\n   * Handle breed action', handlerStart);
    const handler = source.slice(handlerStart, handlerEnd);

    expect(handlerStart).toBeGreaterThan(-1);
    expect(handler).toContain('await equipSnake(selectedSnake.id)');
    expect(handler).toContain('router.push(setupReturnPath)');
    expect(source).toContain('resolveSafeRunSetupReturnPath(returnTo)');
    expect(handler).not.toMatch(/prepareLaunchHandoff|storeLaunchHandoff|api\/game\/session/);
    expect(source).not.toMatch(/from ['"]@\/lib\/ftue\/launchFlow['"]/);
  });

  it('Run Setup selection owns only the collection equip endpoint', () => {
    const source = read('src/app/game/page.tsx');
    const handlerStart = source.indexOf('const handleChooseSetupSnake');
    const handlerEnd = source.indexOf('// Splice hints', handlerStart);
    const handler = source.slice(handlerStart, handlerEnd);

    expect(handlerStart).toBeGreaterThan(-1);
    expect(handler).toContain("fetch('/api/collection/equip'");
    expect(handler).not.toContain('/api/game/session');
    expect(source).toContain('<SnakePickerSheet');
    expect(source).toContain('onChooseSnake={() =>');
  });
});

describe('Setup → Lab → Back to Setup draft wiring contract', () => {
  const gameSource = read('src/app/game/page.tsx');

  it('imports and applies the URL draft to all three unsent Setup choices', () => {
    const missing = [
      [
        'buildLabSetupHref import',
        /import\s*\{[^}]*\bbuildLabSetupHref\b[^}]*\}\s*from ['"]@\/lib\/game\/runSetupDraft['"]/s,
      ],
      [
        'readRunSetupDraft import',
        /import\s*\{[^}]*\breadRunSetupDraft\b[^}]*\}\s*from ['"]@\/lib\/game\/runSetupDraft['"]/s,
      ],
      [
        'draft read from the current URL',
        /readRunSetupDraft\(\s*window\.location\.search\s*\)/,
      ],
      [
        'mode restored from the URL draft',
        /(?:setGameMode\([^)]*SetupDraft\.mode|SetupDraft\.mode[\s\S]{0,220}setGameMode)/,
      ],
      [
        'Energy restored from the URL draft',
        /(?:setEnergyCommitment\([^)]*SetupDraft\.energyCommitment|useState[^;]{0,260}SetupDraft\.energyCommitment)/s,
      ],
      [
        'Ladder rung restored from the URL draft',
        /(?:setLadderRung\([^)]*SetupDraft\.ladderRung|useState[^;]{0,260}SetupDraft\.ladderRung)/s,
      ],
    ].filter(([, pattern]) => !(pattern as RegExp).test(gameSource)).map(([label]) => label);

    expect(missing).toEqual([]);
  });

  it('re-clamps restored Energy and Ladder requests to fresh server authority', () => {
    const playerReadStart = gameSource.indexOf('// Fetch player data from server on mount');
    const playerReadEnd = gameSource.indexOf(
      '// A player may leave Run Setup open across a recovery boundary',
      playerReadStart
    );
    const playerRead = gameSource.slice(playerReadStart, playerReadEnd);

    expect(playerReadStart).toBeGreaterThan(-1);
    expect(playerReadEnd).toBeGreaterThan(playerReadStart);
    expect(playerRead).toMatch(
      /setEnergyCommitment\(\(current\)\s*=>[\s\S]{0,220}available/
    );
    expect(playerRead).toMatch(
      /setLadderRung\(\(current\)\s*=>[\s\S]{0,220}(?:attemptable|ladderInfo)/
    );
  });

  it('passes one dynamic current-state Lab doorway to both Setup surfaces', () => {
    const binding = gameSource.match(
      /const\s+([A-Za-z_$][\w$]*)\s*=\s*buildLabSetupHref\(\{/
    );
    const builderStart = binding?.index ?? -1;
    const builder =
      builderStart >= 0 ? gameSource.slice(builderStart, builderStart + 700) : '';
    const labHrefName = binding?.[1] ?? '__missing_setup_lab_href__';
    const propPattern = new RegExp(`labHref=\\{${labHrefName}\\}`, 'g');

    expect(builderStart).toBeGreaterThan(-1);
    expect(builder).toMatch(/currentSearch\s*:/);
    expect(builder).toMatch(/mode\s*:\s*gameMode/);
    expect(builder).toMatch(/energyCommitment\s*[,}]/);
    expect(builder).toMatch(/ladderRung\s*[,}]/);
    expect(gameSource.match(propPattern) ?? []).toHaveLength(2);
  });

  it('retains the existing challenge query through the exact Lab round trip', () => {
    const labHref = buildLabSetupHref({
      currentSearch:
        '?seed=Dchallenge1&target=1240&challenge=run%3ADchallenge1&by=Rhea',
      mode: 'anomaly',
      energyCommitment: 5,
      ladderRung: 3,
    });
    const returnTo = new URL(labHref, 'https://supasnake.invalid').searchParams.get(
      'returnTo'
    );
    const setupPath = resolveSafeRunSetupReturnPath(returnTo);

    expect(setupPath).toBe(
      '/game?seed=Dchallenge1&target=1240&challenge=run%3ADchallenge1&by=Rhea&setupMode=anomaly&setupEnergy=5&setupRung=3'
    );
    expect(readRunSetupDraft(setupPath!.split('?')[1])).toEqual({
      mode: 'anomaly',
      energyCommitment: 5,
      ladderRung: 3,
    });
  });

  it('introduces no localStorage or sessionStorage authority for the draft', () => {
    const authorityBoundary = [
      'src/app/game/page.tsx',
      'src/app/lab/page.tsx',
      'src/components/game/RunSetupPanel.tsx',
      'src/components/game/SnakePickerSheet.tsx',
      'src/lib/game/runSetupDraft.ts',
      'src/lib/store/gameStore.ts',
    ]
      .map(read)
      .join('\n');

    expect(authorityBoundary).not.toMatch(/\blocalStorage\b|\bsessionStorage\b/);
  });
});
