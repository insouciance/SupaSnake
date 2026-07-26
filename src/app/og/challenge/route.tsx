/**
 * `GET /og/challenge` — the Open Graph image for a challenge link.
 *
 * Deliberately NOT under `/api/`: `robots.ts` disallows that whole prefix
 * (it is a machine surface of authenticated mutations), and several link
 * unfurlers check robots before fetching an `og:image`. An image a crawler
 * is forbidden to fetch is a grey box in every feed that honours the file.
 *
 * WHY THIS EXISTS BESIDE THE `opengraph-image.tsx` FILES
 *
 * Next's file convention hands an image route only its `params`, never the
 * request's `searchParams`. A challenge lives in the query — `/s/214?t=1240
 * &by=Sans_Souci&d=ippb` — so `/s/[day]/opengraph-image.tsx` can render the
 * DAY but cannot render the dare, and §11.3's artifact is the dare: "beat my
 * 1,240 on Signal #214" has to be legible in the feed, not after the click.
 *
 * So: the file-convention images stay (they are what a bare `/s/214` or
 * `/r/<seed>` link shows, and they are what a crawler gets for free), and a
 * page whose URL carries challenge parameters points `openGraph.images` at
 * this route instead. Both render the same `ArtifactCard` from the same
 * model builders — one look, two entry points.
 *
 * Every parameter is untrusted and goes through the same validators the
 * landing pages use; nothing here reads a database, a session or a cookie,
 * and nothing here writes anything (Rule 11 is untouched).
 */

import { NextRequest } from 'next/server';
import { artifactImageResponse } from '@/lib/og/artifactCard';
import { runCardModel, signalCardModel } from '@/lib/share/artifactCards';
import {
  challengeFromRun,
  challengeFromSignal,
  parseSignalDay,
  signalDayIndex,
  signalIndexToDayKey,
} from '@/shared/game/challenge';

export const dynamic = 'force-dynamic';

const DYNASTIES = new Set(['CYBER', 'PRIMAL', 'COSMIC']);

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const read = (key: string) => query.get(key);

  const kind = query.get('kind') === 'run' ? 'run' : 'signal';

  if (kind === 'run') {
    const challenge = challengeFromRun(query.get('seed') ?? '', {
      t: read('t'),
      by: read('by'),
      d: read('d'),
    });
    if (!challenge) {
      // A malformed seed still has to produce an image, so fall back to the
      // day card rather than handing a feed a broken preview.
      return signalImage(signalDayIndex());
    }
    const dynastyParam = (query.get('dy') ?? '').toUpperCase();
    return artifactImageResponse(
      runCardModel({
        challenge,
        dynasty: DYNASTIES.has(dynastyParam) ? dynastyParam : null,
      })
    );
  }

  const day = parseSignalDay(query.get('day')) ?? signalDayIndex();
  return signalImage(day, { t: read('t'), by: read('by'), d: read('d') });
}

function signalImage(
  day: number,
  challengeQuery: { t?: string | null; by?: string | null; d?: string | null } = {}
) {
  const challenge = challengeFromSignal(day, challengeQuery);
  return artifactImageResponse(
    signalCardModel({
      day,
      dayKey: signalIndexToDayKey(day),
      seed: challenge.seed,
      challenge,
    })
  );
}
