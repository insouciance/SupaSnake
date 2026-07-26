/**
 * The share affordance (WP-1.08).
 *
 * The regression this file guards is the one WP-0.08 found: a share that
 * leaves the recipient with no way back in. So the assertions are about the
 * payload's shape and the fallback ladder, not about styling.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ShareArtifactButton, shareArtifact } from './ShareArtifactButton';
import { cardShare, signalCardModel } from '@/lib/share/artifactCards';
import { challengeFromSignal, signalIndexToDayKey } from '@/shared/game/challenge';
import { signalArtifactUrl } from '@/lib/share/artifactUrls';

const CHALLENGE = challengeFromSignal(214, { t: '1240', by: 'Sans_Souci', d: 'ippb' });
const PAYLOAD = cardShare(
  signalCardModel({
    day: 214,
    dayKey: signalIndexToDayKey(214),
    seed: CHALLENGE.seed,
    challenge: CHALLENGE,
  }),
  signalArtifactUrl(214, CHALLENGE)
);

const originalShare = Object.getOwnPropertyDescriptor(navigator, 'share');
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function stubNavigator(props: { share?: unknown; clipboard?: unknown }) {
  if ('share' in props) {
    Object.defineProperty(navigator, 'share', { value: props.share, configurable: true });
  }
  if ('clipboard' in props) {
    Object.defineProperty(navigator, 'clipboard', {
      value: props.clipboard,
      configurable: true,
    });
  }
}

beforeEach(() => {
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
});

afterEach(() => {
  if (originalShare) Object.defineProperty(navigator, 'share', originalShare);
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
});

describe('the payload a share button is handed', () => {
  it('carries the URL twice — as `url` and as the last line of `text`', () => {
    expect(PAYLOAD.url).toBe(signalArtifactUrl(214, CHALLENGE));
    expect(PAYLOAD.text.split('\n').at(-1)).toBe(PAYLOAD.url);
  });

  it('reads as the §11.3 artifact', () => {
    expect(PAYLOAD.text).toContain('World Signal · #214');
    expect(PAYLOAD.text).toContain('⚡▶▶💰');
    expect(PAYLOAD.text).toContain("Beat Sans_Souci's 1,240");
  });

  it('preserves the dare in the shared link, so a re-share stays a dare', () => {
    expect(PAYLOAD.url).toContain('t=1240');
    expect(PAYLOAD.url).toContain('by=Sans_Souci');
    expect(PAYLOAD.url).toContain('d=ippb');
  });
});

describe('shareArtifact', () => {
  it('uses the native sheet when there is one, with url set', async () => {
    const calls: unknown[] = [];
    stubNavigator({ share: async (data: unknown) => void calls.push(data) });
    expect(await shareArtifact(PAYLOAD)).toBe('shared');
    expect(calls).toEqual([
      { title: PAYLOAD.title, text: PAYLOAD.text, url: PAYLOAD.url },
    ]);
  });

  it('falls back to the clipboard when the sheet is cancelled', async () => {
    const written: string[] = [];
    stubNavigator({
      share: async () => {
        throw new Error('AbortError');
      },
      clipboard: { writeText: async (value: string) => void written.push(value) },
    });
    expect(await shareArtifact(PAYLOAD)).toBe('copied');
    // The clipboard gets the TEXT, which ends with the URL — copying only
    // the title would be the same defect in a different costume.
    expect(written[0]).toBe(PAYLOAD.text);
    expect(written[0].endsWith(PAYLOAD.url)).toBe(true);
  });

  it('falls back to the clipboard when there is no native sheet at all', async () => {
    const written: string[] = [];
    stubNavigator({ clipboard: { writeText: async (v: string) => void written.push(v) } });
    expect(await shareArtifact(PAYLOAD)).toBe('copied');
    expect(written[0]).toBe(PAYLOAD.text);
  });

  it('ends at a visible URL rather than doing nothing', async () => {
    stubNavigator({
      clipboard: {
        writeText: async () => {
          throw new Error('denied');
        },
      },
    });
    expect(await shareArtifact(PAYLOAD)).toBe('manual');
  });
});

describe('ShareArtifactButton', () => {
  it('reports what actually happened', async () => {
    stubNavigator({ share: async () => undefined });
    render(<ShareArtifactButton payload={PAYLOAD} />);
    fireEvent.click(screen.getByTestId('share-artifact-button'));
    await waitFor(() =>
      expect(screen.getByTestId('share-artifact-status')).toHaveTextContent('Shared')
    );
  });

  it('shows the URL when nothing else worked', async () => {
    render(<ShareArtifactButton payload={PAYLOAD} />);
    fireEvent.click(screen.getByTestId('share-artifact-button'));
    await waitFor(() =>
      expect(screen.getByTestId('share-artifact-url')).toHaveTextContent(PAYLOAD.url)
    );
  });

  it('says nothing before it has been used', () => {
    render(<ShareArtifactButton payload={PAYLOAD} />);
    expect(screen.queryByTestId('share-artifact-status')).toBeNull();
  });
});
