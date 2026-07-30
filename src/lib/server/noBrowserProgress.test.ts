import * as fs from 'fs';
import * as path from 'path';

describe('browser progress boundary', () => {
  it('marks every API response private and non-cacheable at the framework boundary', () => {
    const config = fs.readFileSync(path.join(process.cwd(), 'next.config.js'), 'utf8');
    expect(config).toMatch(/source:\s*['"]\/api\/:path\*['"]/);
    expect(config).toMatch(/key:\s*['"]Cache-Control['"][\s\S]*?value:\s*['"]private, no-store['"]/);
  });

  it('keeps analytics state in memory and deletes the legacy durable identifier', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/analytics/posthog.ts'),
      'utf8'
    );
    expect(source).toMatch(/persistence:\s*['"]memory['"]/);
    expect(source).toMatch(/localStorage\.removeItem\(key\)/);
    expect(source).toMatch(/sessionStorage\.removeItem\(key\)/);
    expect(source).not.toMatch(/persistence:\s*['"]localStorage/);
  });
});
