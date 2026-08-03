import { isMissingCodexInfra } from './codex';

describe('Codex rollout infrastructure classification', () => {
  it.each(['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205'])(
    'accepts only the explicit missing-schema code %s',
    (code) => {
      expect(isMissingCodexInfra({ code, message: 'schema capability missing' })).toBe(true);
    }
  );

  it.each([
    { code: '42501', message: 'permission denied for table player_codex' },
    { code: '57014', message: 'player_codex query canceled by timeout' },
    { code: '08006', message: 'codex_first_discoveries connection failure' },
    { message: 'record_codex_discoveries failed unexpectedly' },
  ])('keeps a real Codex failure reportable: $code $message', (error) => {
    expect(isMissingCodexInfra(error)).toBe(false);
  });

  it('does not classify an absent error', () => {
    expect(isMissingCodexInfra(null)).toBe(false);
    expect(isMissingCodexInfra(undefined)).toBe(false);
  });
});
