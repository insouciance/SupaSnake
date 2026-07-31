import { readFileSync } from 'fs';
import { join } from 'path';

const read = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), 'utf8');

describe('Lab recognition visibility', () => {
  it('does not clear Mastery recognition until the Mastery disclosure is open', () => {
    const source = read('src/app/lab/page.tsx');
    const hookStart = source.indexOf("useRecognitionSeen(\n    'mastery'");
    const hookEnd = source.indexOf('\n  );', hookStart);
    const invocation = source.slice(hookStart, hookEnd);

    expect(hookStart).toBeGreaterThan(-1);
    expect(invocation).toContain('deepToolsOpen');
    expect(invocation).toContain('masteryByDynasty[activeMasteryKey]');
  });
});
