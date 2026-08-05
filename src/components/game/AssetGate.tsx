'use client';

import { Component, Suspense, type ReactNode } from 'react';

/**
 * The one safe way to mount a component that loads an asset.
 *
 * THE TRAP THIS EXISTS TO CLOSE (doctrine FM-13). drei's `useTexture` and
 * `useGLTF` SUSPEND while an asset loads but THROW when it fails, and a throw
 * walks straight past every `Suspense` boundary to the nearest ERROR boundary.
 * `Suspense` reads like it covers loading, so it looks complete; it covers
 * exactly half. With no error boundary above it, the nearest catcher is
 * `app/global-error.tsx`, which replaces the entire page with "Something went
 * wrong". PR #90 found this the expensive way: two decorative JPEGs 404'd and
 * blacked out the whole of Home.
 *
 * So every loader site needs BOTH, and the two fallbacks should be the same
 * thing — a player whose model was slow and a player whose model was missing
 * both want a snake on the board. That invariant used to be a rule people had
 * to remember at each site. Here it is structural: you pass ONE `fallback`,
 * and it is used for both the suspended and the failed case. There is no way
 * to wire this up with the boundary missing, because the boundary is not
 * something the caller assembles.
 *
 * Use `fallback={null}` for decoration that may simply be absent. Do NOT use
 * `null` for anything the player is meant to see — the fallback for the snake
 * is the primitive snake, never an empty board.
 */

class AssetFailureBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; label: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Reported, never swallowed: this logs so the failure reaches the console
    // and Sentry's console integration. Degrading quietly for the player is
    // the goal; degrading quietly for US is FM-2.
    console.error(`${this.props.label} failed to load; drawing the fallback:`, error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Renders `children`, showing `fallback` while their assets load AND if those
 * assets fail to load.
 *
 * `label` names the thing in the console when it fails — "the specimen model",
 * "the chamber decoration" — so a report says what was lost, not just that
 * something threw.
 */
export function AssetGate({
  fallback,
  label,
  children,
}: {
  fallback: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <AssetFailureBoundary fallback={fallback} label={label}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </AssetFailureBoundary>
  );
}
