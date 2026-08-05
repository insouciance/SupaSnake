/**
 * The proof that FM-13 stays closed.
 *
 * PR #90 fixed this failure mode in one component and left no test behind, so
 * the next person to write `<Suspense>` around a `useGLTF` would have
 * reintroduced it with a green suite. These tests pin the two halves that
 * matter and the relationship between them: a child that SUSPENDS shows the
 * fallback, a child that THROWS also shows the fallback instead of escaping,
 * and the failure is reported rather than swallowed.
 *
 * The escape is the whole point. Without the boundary the throw would reach
 * the nearest ancestor boundary — in the app, the global error page — so the
 * assertion that matters most is the one proving nothing propagates past
 * `AssetGate`.
 */

import { Component, Suspense, type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';

import { AssetGate } from '@/components/game/AssetGate';

function Throws(): never {
  throw new Error('simulated 404 from a drei loader');
}

let pending: Promise<void> | null = null;
let resolved = false;

/** Suspends once, the way `useGLTF` does while a model streams. */
function Suspends() {
  if (!resolved) {
    pending ??= new Promise<void>((resolve) => {
      setTimeout(() => {
        resolved = true;
        resolve();
      }, 0);
    });
    throw pending;
  }
  return <div>loaded</div>;
}

/** Stands in for the app's global error page. Nothing should reach it. */
class EscapeSentinel extends Component<
  { children: ReactNode },
  { escaped: boolean }
> {
  state = { escaped: false };

  static getDerivedStateFromError() {
    return { escaped: true };
  }

  render() {
    return this.state.escaped ? <div>ESCAPED</div> : this.props.children;
  }
}

describe('AssetGate', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    pending = null;
    resolved = false;
    // React logs the caught error itself; silence it so a passing test does
    // not print a stack, while still asserting on our own report below.
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('renders its children when the asset loads', () => {
    render(
      <AssetGate label="the test asset" fallback={<div>fallback</div>}>
        <div>the real thing</div>
      </AssetGate>
    );

    expect(screen.getByText('the real thing')).toBeInTheDocument();
    expect(screen.queryByText('fallback')).not.toBeInTheDocument();
  });

  it('shows the fallback while the asset is still loading', () => {
    render(
      <AssetGate label="the test asset" fallback={<div>fallback</div>}>
        <Suspends />
      </AssetGate>
    );

    expect(screen.getByText('fallback')).toBeInTheDocument();
  });

  it('shows the SAME fallback when the asset fails to load', () => {
    render(
      <AssetGate label="the test asset" fallback={<div>fallback</div>}>
        <Throws />
      </AssetGate>
    );

    expect(screen.getByText('fallback')).toBeInTheDocument();
  });

  it('never lets a loader failure reach an outer boundary', () => {
    render(
      <EscapeSentinel>
        <AssetGate label="the test asset" fallback={<div>fallback</div>}>
          <Throws />
        </AssetGate>
      </EscapeSentinel>
    );

    // This is the assertion that stands between a missing GLB and the
    // player losing the whole page mid-run.
    expect(screen.queryByText('ESCAPED')).not.toBeInTheDocument();
    expect(screen.getByText('fallback')).toBeInTheDocument();
  });

  it('reports the failure with the label, rather than swallowing it (FM-2)', () => {
    render(
      <AssetGate label="the specimen model" fallback={<div>fallback</div>}>
        <Throws />
      </AssetGate>
    );

    const reported = consoleError.mock.calls.some(
      ([first]) =>
        typeof first === 'string' && first.includes('the specimen model')
    );
    expect(reported).toBe(true);
  });

  it('supports a null fallback for decoration that may simply be absent', () => {
    render(
      <EscapeSentinel>
        <div>the chamber</div>
        <AssetGate label="the chamber decoration" fallback={null}>
          <Throws />
        </AssetGate>
      </EscapeSentinel>
    );

    expect(screen.getByText('the chamber')).toBeInTheDocument();
    expect(screen.queryByText('ESCAPED')).not.toBeInTheDocument();
  });

  it('is the only shape that closes FM-13: bare Suspense does not', () => {
    // The counter-example, asserted rather than described. If a future React
    // makes Suspense catch errors too, this test fails and the doctrine entry
    // and AssetGate can both be revisited on evidence.
    render(
      <EscapeSentinel>
        <Suspense fallback={<div>fallback</div>}>
          <Throws />
        </Suspense>
      </EscapeSentinel>
    );

    expect(screen.getByText('ESCAPED')).toBeInTheDocument();
  });
});
