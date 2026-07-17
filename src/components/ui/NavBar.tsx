'use client';

/**
 * NavBar - compatibility alias for the game-style Navigation rail.
 *
 * Every screen that imported the old top command bar automatically gets the
 * floating icon rail (see Navigation.tsx). Kept as a separate module so
 * existing imports and test mocks keep working.
 */

export { Navigation as NavBar, Navigation as default } from './Navigation';
