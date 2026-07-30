import { NextResponse } from 'next/server';

const PROGRESS_NO_STORE = 'private, no-store';

/**
 * Progression responses must never become browser- or intermediary-cached state.
 * Postgres remains the sole authority; clients always read the current server view.
 */
export function progressionJson<T>(body: T, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', PROGRESS_NO_STORE);
  return NextResponse.json(body, { ...init, headers });
}
