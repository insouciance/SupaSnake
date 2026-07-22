/**
 * @jest-environment node
 */

import { isAuthorizedCron } from './cronAuth';

describe('isAuthorizedCron', () => {
  it('accepts only the exact configured bearer credential', () => {
    expect(
      isAuthorizedCron(
        new Headers({ authorization: 'Bearer cron-secret' }),
        'cron-secret'
      )
    ).toBe(true);

    expect(
      isAuthorizedCron(
        new Headers({ authorization: 'bearer cron-secret' }),
        'cron-secret'
      )
    ).toBe(false);
    expect(
      isAuthorizedCron(
        new Headers({ authorization: 'Bearer  cron-secret' }),
        'cron-secret'
      )
    ).toBe(false);
    expect(
      isAuthorizedCron(
        new Headers({ authorization: 'Bearer wrong' }),
        'cron-secret'
      )
    ).toBe(false);
  });

  it('fails closed when the configured secret is absent', () => {
    expect(
      isAuthorizedCron(new Headers({ authorization: 'Bearer undefined' }), undefined)
    ).toBe(false);
  });

  it('does not treat Vercel marker headers as credentials', () => {
    expect(
      isAuthorizedCron(new Headers({ 'x-vercel-cron': '1' }), 'cron-secret')
    ).toBe(false);
  });
});
