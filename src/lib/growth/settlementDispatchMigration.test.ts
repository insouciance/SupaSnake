/**
 * Migration 051 — shape assertions only. NOT APPLIED anywhere.
 *
 * The route that depends on this table fails closed until it exists, so the
 * one thing a test can usefully pin is that the file, when somebody does apply
 * it, carries the guarantees the route is written against: uniqueness per
 * (week, recipient), a deny-by-default boundary, and no address, body or
 * tracking event at rest.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/051_settlement_dispatch_log.sql'),
  'utf8'
);

describe('051_settlement_dispatch_log.sql', () => {
  it('states loudly that it has not been applied', () => {
    expect(sql).toMatch(/NOT APPLIED/);
    expect(sql).toMatch(/FAILS CLOSED/);
  });

  it('creates the ledger inside one transaction', () => {
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/^COMMIT;/m);
    expect(sql).toMatch(/CREATE TABLE settlement_dispatch_sends/);
  });

  it('makes one send per recipient per week impossible to repeat', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX settlement_dispatch_sends_once_idx\s*\n\s*ON settlement_dispatch_sends \(week_start, recipient_kind, recipient_key\)/
    );
  });

  it('refuses a recipient key that looks like an email address', () => {
    expect(sql).toMatch(/recipient_key !~ '@'/);
  });

  it('constrains the recipient kind and the outcome to known values', () => {
    expect(sql).toMatch(/recipient_kind IN \('player', 'dispatch'\)/);
    expect(sql).toMatch(/outcome IN \('claimed', 'sent', 'failed', 'refused'\)/);
  });

  it('is deny-by-default: RLS on, privileges revoked, service_role only', () => {
    expect(sql).toMatch(/ALTER TABLE settlement_dispatch_sends ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(
      /REVOKE ALL ON TABLE settlement_dispatch_sends FROM PUBLIC, anon, authenticated/
    );
    expect(sql).toMatch(/GRANT ALL PRIVILEGES ON TABLE settlement_dispatch_sends TO service_role/);
  });

  it('stores no address, no message body and no open or click event', () => {
    // Column definitions only: the prose around them explains the omissions,
    // and prose must not be able to satisfy or break this assertion.
    const body = sql
      .slice(sql.indexOf('CREATE TABLE'), sql.indexOf('CREATE UNIQUE INDEX'))
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    expect(body).not.toMatch(/\bemail\b\s+TEXT/i);
    expect(body).not.toMatch(/subject|html|body_text|message/i);
    expect(body).not.toMatch(/opened_at|clicked_at|open_count|click_count/i);
  });

  it('pins its search_path on the trigger function, like every other migration', () => {
    expect(sql).toMatch(/SECURITY DEFINER SET search_path = public, pg_temp/);
  });
});
