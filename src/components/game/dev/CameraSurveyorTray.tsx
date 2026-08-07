'use client';

/**
 * ET-5 camera surveyor - the readout tray.
 *
 * Renders once. Every live number in it is written by `CameraSurveyorProbe`
 * straight into these text nodes through `cameraSurveyorChannel`; this
 * component never re-renders to show a value, only to collapse, to report a
 * copy, or to re-place itself when the window changes size.
 *
 * Placement: the tray floats in the gutter beside the cockpit composition
 * (which is centred and width-capped, so on a desktop there is real empty
 * space either side of it). The gutter is MEASURED from the live instrument
 * boxes rather than assumed, because "never covers the HUD" is the one thing
 * a tuning overlay must not get wrong. When there is no room, it docks to the
 * viewport edge and can be collapsed to its title bar.
 *
 * Dev-only: mounted exclusively by the double-gated dynamic import on /game.
 */

import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import {
  bindSlot,
  currentParameterLine,
  queueCommand,
  resetChannel,
} from './cameraSurveyorChannel';
import type { CameraSurveyorSlot } from './cameraSurveyorReadout';
import styles from './CameraSurveyorTray.module.css';

/**
 * Kept in step with `.tray` in the stylesheet.
 *
 * 176 is not a taste number. The cockpit composition is capped at
 * `100cqh + 180px` and centred, so a 1440x900 desktop leaves exactly 192px of
 * gutter beside it - a wider tray cannot be placed there without clipping the
 * board's own bay, which is the one thing a tuning overlay must not do.
 * Narrower windows have less gutter than that and the tray docks to the edge;
 * the collapse control is the answer there.
 */
const TRAY_WIDTH = 176;
const TRAY_MARGIN = 8;

const DEGREES_PER_RADIAN = 180 / Math.PI;

export interface CameraSurveyorTrayProps {
  /** The rig's shipped default pitch (polar from zenith, radians). */
  defaultPolar: number;
}

/**
 * Buttons must not keep focus: the owner is PLAYING while tuning, and a
 * focused button turns the next Space (pause) or Enter into a second click on
 * whatever was pressed last. Arrow/WASD steering is unaffected either way -
 * the game listens on `window` - but the pause key is worth protecting.
 */
function releaseFocus(event: MouseEvent<HTMLButtonElement>): void {
  event.currentTarget.blur();
}

function Row({ label, slot }: { label: string; slot: CameraSurveyorSlot }) {
  return (
    <>
      <span className={styles.label}>{label}</span>
      <span
        className={styles.value}
        data-testid={`camera-surveyor-${slot}`}
        ref={(node) => bindSlot(slot, node)}
      >
        —
      </span>
    </>
  );
}

export function CameraSurveyorTray({ defaultPolar }: CameraSurveyorTrayProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [rightOffset, setRightOffset] = useState(TRAY_MARGIN);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => () => resetChannel(), []);

  useEffect(() => {
    const measure = () => {
      let hudRight = 0;
      document
        .querySelectorAll('[data-cockpit-zone="instrument"]')
        .forEach((instrument) => {
          hudRight = Math.max(hudRight, instrument.getBoundingClientRect().right);
        });
      // No HUD on screen (setup, results): dock to the edge. Centring in a
      // "gutter" that is the whole window would park the tray over the board.
      const gutter = hudRight > 0 ? window.innerWidth - hudRight : 0;
      setRightOffset(
        gutter >= TRAY_WIDTH + TRAY_MARGIN * 2
          ? Math.round((gutter - TRAY_WIDTH) / 2)
          : TRAY_MARGIN
      );
    };
    measure();
    window.addEventListener('resize', measure);
    // The HUD does not exist until the run starts, so one measurement at mount
    // would place the tray against a screen that is about to change shape.
    // Identical values bail out of React's update, so this costs nothing.
    const poll = window.setInterval(measure, 1500);
    return () => {
      window.removeEventListener('resize', measure);
      window.clearInterval(poll);
    };
  }, []);

  const pose = useCallback((polarDeg: number | null) => {
    queueCommand({ kind: 'pose', polarDeg });
  }, []);

  const copyLine = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    releaseFocus(event);
    const line = currentParameterLine();
    if (!line || !navigator.clipboard) {
      setCopyState('failed');
      return;
    }
    navigator.clipboard.writeText(line).then(
      () => setCopyState('copied'),
      () => setCopyState('failed')
    );
  }, []);

  useEffect(() => {
    if (copyState === 'idle') return;
    const id = window.setTimeout(() => setCopyState('idle'), 1600);
    return () => window.clearTimeout(id);
  }, [copyState]);

  const defaultPitchDeg = Math.round(defaultPolar * DEGREES_PER_RADIAN);

  return (
    <div
      className={styles.tray}
      data-testid="camera-surveyor-tray"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 84px)',
        right: `${rightOffset}px`,
      }}
    >
      <div className={styles.header}>
        <span className={styles.title}>camera surveyor</span>
        <button
          type="button"
          className={styles.toggle}
          data-testid="camera-surveyor-collapse"
          aria-label={collapsed ? 'Expand camera surveyor' : 'Collapse camera surveyor'}
          onClick={(event) => {
            releaseFocus(event);
            setCollapsed((value) => !value);
          }}
        >
          {collapsed ? '+' : '–'}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className={styles.rows}>
            <Row label="az" slot="azimuth" />
            <Row label="pitch" slot="pitch" />
            <Row label="dist" slot="distance" />
            <Row label="fit" slot="fit" />
            <Row label="target" slot="target" />
            <Row label="fov" slot="fov" />
          </div>

          <div
            className={styles.meter}
            data-testid="camera-surveyor-legibility"
            data-grade="fail"
            ref={(node) => bindSlot('legibility', node)}
          >
            far/near —
          </div>

          <code
            className={styles.line}
            data-testid="camera-surveyor-line"
            ref={(node) => bindSlot('line', node)}
          >
            —
          </code>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.button}
              data-testid="camera-surveyor-reset"
              onClick={(event) => {
                releaseFocus(event);
                pose(null);
              }}
            >
              reset
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={(event) => {
                releaseFocus(event);
                pose(defaultPitchDeg);
              }}
            >
              {defaultPitchDeg}° def
            </button>
            <button
              type="button"
              className={styles.button}
              data-testid="camera-surveyor-pose-30"
              onClick={(event) => {
                releaseFocus(event);
                pose(30);
              }}
            >
              30° flat
            </button>
            <button
              type="button"
              className={styles.button}
              data-testid="camera-surveyor-pose-55"
              onClick={(event) => {
                releaseFocus(event);
                pose(55);
              }}
            >
              55° drama
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.copy}`}
              data-testid="camera-surveyor-copy"
              onClick={copyLine}
            >
              {copyState === 'idle'
                ? 'copy line'
                : copyState === 'copied'
                  ? 'copied'
                  : 'copy failed'}
            </button>
          </div>

          <p className={styles.hint}>
            drag orbits · right-drag pans · wheel zooms · keys still steer
          </p>
        </>
      )}
    </div>
  );
}

export default CameraSurveyorTray;
