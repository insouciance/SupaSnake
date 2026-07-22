import * as fs from 'fs';
import * as path from 'path';

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/036_service_role_privileges.sql'),
  'utf8'
);

describe('migration 036 service-role privileges', () => {
  it('grants the server role access to existing tables, sequences, and functions', () => {
    expect(sql).toMatch(
      /GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role/
    );
    expect(sql).toMatch(
      /GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role/
    );
  });

  it('preserves the contract for objects created by later migrations', () => {
    expect(sql).toMatch(
      /ALTER DEFAULT PRIVILEGES FOR ROLE postgres[\s\S]*GRANT ALL PRIVILEGES ON TABLES TO service_role/
    );
    expect(sql).toMatch(
      /ALTER DEFAULT PRIVILEGES FOR ROLE postgres[\s\S]*GRANT ALL PRIVILEGES ON SEQUENCES TO service_role/
    );
    expect(sql).toMatch(
      /ALTER DEFAULT PRIVILEGES FOR ROLE postgres[\s\S]*GRANT EXECUTE ON FUNCTIONS TO service_role/
    );
  });

  it('does not expand browser-role privileges', () => {
    const statements = sql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');

    expect(statements).not.toMatch(/\b(?:anon|authenticated)\b/);
  });
});
