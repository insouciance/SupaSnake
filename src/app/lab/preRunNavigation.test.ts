import { readFileSync } from 'fs';
import { join } from 'path';

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
