import type { ReactNode } from 'react';
import type { GeneId } from '@/shared/game/genes';
import type { StrainId } from '@/shared/game/strains';

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function ScoreGlyph() {
  return (
    <Svg>
      <path d="M5 5h14v5c0 4.2-2.7 7.1-7 8.5C7.7 17.1 5 14.2 5 10V5Z" />
      <path d="M8 5V3h8v2M9 21h6M12 18.5V21" />
      <path d="m12 8 1.1 2.2 2.4.3-1.7 1.7.4 2.4-2.2-1.1-2.2 1.1.4-2.4-1.7-1.7 2.4-.3L12 8Z" />
    </Svg>
  );
}

export function DnaGlyph() {
  return (
    <Svg>
      <path d="M7 3c0 4.3 10 5.6 10 10s-10 5.7-10 8" />
      <path d="M17 3c0 4.3-10 5.6-10 10s10 5.7 10 8" />
      <path d="M8.2 7h7.6M8.2 17h7.6M9.5 12h5" />
    </Svg>
  );
}

export function ShieldGlyph() {
  return (
    <Svg>
      <path d="m12 3 7 3v5c0 4.7-2.6 8-7 10-4.4-2-7-5.3-7-10V6l7-3Z" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </Svg>
  );
}

export function RiskGlyph() {
  return (
    <Svg>
      <path d="M18.4 17.5A8 8 0 1 1 19.7 8" />
      <path d="m18.8 4-.9 5.1-5-.9M12 7v5l3 2" />
    </Svg>
  );
}

export function PortalGlyph() {
  return (
    <Svg>
      <ellipse cx="12" cy="12" rx="6.5" ry="9" />
      <ellipse cx="12" cy="12" rx="3" ry="5.5" />
      <path d="M12 3v3M12 18v3" />
    </Svg>
  );
}

export function ModeGlyph({ mode }: { mode: 'standard' | 'free' | 'anomaly' }) {
  if (mode === 'free') {
    return (
      <Svg>
        <path d="M8.2 8.4c-3.8 0-5.3 7.2-1.6 7.2 3 0 6.1-7.2 9.2-7.2 3.8 0 5.3 7.2 1.6 7.2-3 0-6.1-7.2-9.2-7.2Z" />
      </Svg>
    );
  }
  if (mode === 'anomaly') {
    return (
      <Svg>
        <path d="M4 12c2.2-6.5 5.3-8.7 8-8.7s5.8 2.2 8 8.7c-2.2 6.5-5.3 8.7-8 8.7S6.2 18.5 4 12Z" />
        <path d="M8 12h8M12 8v8M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" />
      </Svg>
    );
  }
  return (
    <Svg>
      <path d="M5 18V6l7-3 7 3v12l-7 3-7-3Z" />
      <path d="m8 8 4 2 4-2M12 10v7" />
    </Svg>
  );
}

export function PauseGlyph() {
  return <Svg><path d="M8 5v14M16 5v14" strokeWidth="3" /></Svg>;
}

export function ResetGlyph() {
  return <Svg><path d="M4 11a8 8 0 1 1 2.1 6.6M4 5v6h6" /></Svg>;
}

/**
 * The complete gene catalog expressed as semantic silhouettes. These stay
 * intentionally free of letters and numerals: the rack is glance telemetry,
 * while the accessible name/title carries the precise definition.
 */
const GENE_GLYPHS: Record<GeneId, ReactNode> = {
  gold_trail: <><circle cx="7" cy="7" r="2.5" /><circle cx="12" cy="12" r="2.5" /><circle cx="17" cy="17" r="2.5" /><path d="m5 19 3-1M16 6l3-1" /></>,
  overgrowth: <><path d="M12 21V9M12 16c-4.6 0-7.5-2.5-7.5-7 4.6 0 7.5 2.5 7.5 7ZM12 13c4.6 0 7.5-2.5 7.5-7-4.6 0-7.5 2.5-7.5 7Z" /><path d="M8 21h8" /></>,
  wall_rush: <><path d="M4 4v16M20 4v16M8 12h8" /><path d="m13 8 4 4-4 4" /></>,
  shed: <><path d="M5 7c5-4 10-2 12 2s-.5 8-5 8H8" /><path d="m8 13-4 4 4 4M10 7c2 1 3 2.5 3 4.5" /></>,
  mirror_wager: <><path d="m8 4-4 8 4 8 4-8-4-8ZM16 4l4 8-4 8-4-8 4-8Z" /><circle cx="12" cy="12" r="2" /></>,
  magnet_pulse: <><path d="M6 5v8a6 6 0 0 0 12 0V5M6 8h4M14 8h4" /><path d="M3 4c-1 5-1 11 1 16M21 4c1 5 1 11-1 16" /></>,
  time_dilation: <><ellipse cx="12" cy="12" rx="8.5" ry="6" /><circle cx="12" cy="12" r="3.5" /><path d="M12 9v3l2 1M3.5 12H1M23 12h-2.5" /></>,
  splitter: <><path d="M12 21V12M12 12 6 5M12 12l6-7" /><path d="M4 8V4h4M16 4h4v4" /></>,
  phoenix: <><path d="M12 21c-4-3-6-6-4-10 1 3 3 3 4 0 1-3-.5-5-.5-8 5 4 7 8 4.5 12" /><path d="M12 21c4-3 6-7 7-11-3 1-5 2-7 5-2-3-4-4-7-5 1 4 3 8 7 11Z" /></>,
  compound_interest: <><ellipse cx="8" cy="17" rx="4" ry="2" /><path d="M4 13c0 1.1 1.8 2 4 2s4-.9 4-2M4 9c0 1.1 1.8 2 4 2s4-.9 4-2" /><path d="m13 16 3-3 2 2 3-5M18 10h3v3" /></>,
  deep_roots: <><path d="M12 3v10M8 7h8M12 13l-6 7M12 13l6 7M12 15v6M9 17l-3-1M15 17l3-1" /></>,
  ancient_grove: <><path d="M5 20v-7M12 20V8M19 20v-6" /><path d="M2 13c0-3 2-5 4-5s4 2 4 5M7 9c0-4 2-7 5-7s5 3 5 7M15 14c0-3 2-5 4-5s3 2 3 5M3 20h18" /></>,
  tectonic_patience: <><path d="M3 8h18M3 13h7l2-3 2 6 2-3h5M3 18h18" /><path d="m9 3 3 3 3-3" /></>,
  redline_dividend: <><path d="M4 19h16M5 16l4-5 3 2 6-8" /><path d="M4 8h16M15 5h3v3" /></>,
  afterburner: <><path d="m14 3 4 4-5 8-4-4 5-8ZM9 11l-3 1-2 4 4-1M13 15l-1 3-4 2 1-4" /><path d="m6 18-2 3M10 18l-1 3" /></>,
  overclock_harvest: <><path d="M4 18h16M7 18v-6M12 18V9M17 18V6" /><path d="M5 8a7 7 0 0 1 14 0M12 8l4-3" /></>,
  starweaver: <><path d="M5 6l7 4 7-5M5 6l2 12 5-8 5 8 2-13M7 18h10" /><circle cx="5" cy="6" r="1.5" /><circle cx="12" cy="10" r="1.5" /><circle cx="19" cy="5" r="1.5" /><circle cx="7" cy="18" r="1.5" /><circle cx="17" cy="18" r="1.5" /></>,
  gravity_well: <><ellipse cx="12" cy="12" rx="9" ry="5" /><ellipse cx="12" cy="12" rx="5" ry="9" transform="rotate(45 12 12)" /><circle cx="12" cy="12" r="2.5" /></>,
  event_horizon: <><circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" /><path d="M2 12c3-7 8-9 14-7M22 12c-3 7-8 9-14 7" /><path d="m16 3 1 3-3 1M8 21l-1-3 3-1" /></>,
  solstice_engine: <><circle cx="12" cy="12" r="4" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3" /><path d="m10 10 4 2-4 2v-4Z" /></>,
  glacial_reserve: <><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" /><path d="m9 5 3 3 3-3M9 19l3-3 3 3M4 11l4 1-1-4M20 13l-4-1 1 4" /></>,
  midnight_oil: <><path d="M13 3c-5 6-7 9-7 12a6 6 0 0 0 12 0c0-3-2-6-5-12Z" /><path d="M10 17c1.8 1.1 3.6.6 4.8-1M18 5a5 5 0 0 0 3 6" /></>,
  loan_shark: <><circle cx="9" cy="13" r="4" /><path d="M13 13c3-4 5-5 8-5l-2 4 2 4c-3 0-5-1-8-3ZM6 13h6M8 11v4" /><path d="m5 7 3-3 3 3" /></>,
  tithe: <><circle cx="8" cy="12" r="5" /><path d="M8 7v10M4 12h8M16 5v14M16 8l4-2v12l-4-2" /></>,
  static_charge: <><path d="m13 2-7 11h6l-1 9 7-12h-6l1-8Z" /><circle cx="4" cy="6" r="1" /><circle cx="20" cy="17" r="1" /><path d="M3 18h4M17 5h4" /></>,
  slipstream: <><path d="M3 8h8c4 0 6 2 10 2M3 12h6c4 0 6 3 12 3M3 16h4c3 0 4 2 8 2" /><path d="m17 7 4 3-4 3" /></>,
  bulk_up: <><rect x="3" y="8" width="18" height="8" rx="4" /><path d="M7 8v8M12 8v8M17 8v8M5 5v3M19 5v3M5 16v3M19 16v3" /></>,
  serpentine: <><path d="M18 5c-3-3-9-2-9 2 0 5 7 4 7 8 0 4-6 5-10 2" /><path d="m16 3 2 2 3-1M6 17l-3 1 2 3" /><circle cx="17.5" cy="5" r=".7" fill="currentColor" /></>,
  pocket_rift: <><ellipse cx="7" cy="12" rx="3.5" ry="7" /><ellipse cx="17" cy="12" rx="3.5" ry="7" /><path d="M9 8h6M9 16h6M12 6l3 2-3 2M12 14l-3 2 3 2" /></>,
  grave_robber: <><path d="M5 20h10M7 20V9a5 5 0 0 1 10 0v3" /><path d="M12 6v6M9 9h6M17 12l4 4-3 3-4-4 3-3Z" /></>,
  last_gasp: <><path d="M5 15c2-5 4-7 7-7 4 0 6 3 7 7" /><path d="M4 18c4-2 6-2 9 0 3 2 5 2 8 0M6 12H3M21 12h-3" /><circle cx="12" cy="8" r="2" /></>,
  heartwood: <><path d="M12 21V5M8 21h8" /><path d="M12 16C5 12 6 6 9 6c2 0 3 2 3 3 0-1 1-3 3-3 3 0 4 6-3 10Z" /><path d="M5 4c2-2 4-2 7-1 3-1 5-1 7 1" /></>,
  zenith_protocol: <><path d="m5 17 7-12 7 12H5Z" /><path d="m8 14 4-6 4 6M8 21h8M12 17v4" /><circle cx="12" cy="5" r="1.5" /></>,
  constellation_crown: <><path d="m4 17 2-9 5 4 3-7 4 7 3-4-1 9H4ZM5 20h14" /><circle cx="6" cy="8" r="1" /><circle cx="14" cy="5" r="1" /><circle cx="21" cy="8" r="1" /></>,
};

export function GeneGlyph({ id }: { id: GeneId }) {
  return <Svg>{GENE_GLYPHS[id]}</Svg>;
}

export function StrainGlyph({ id }: { id: StrainId }) {
  if (id === 'AURUM') {
    return <Svg><path d="m12 3 7 5-2.5 10h-9L5 8l7-5Z" /><path d="m5 8 7 4 7-4M12 12v6" /></Svg>;
  }
  if (id === 'VOLT') {
    return <Svg><path d="m13 2-8 11h6l-1 9 9-12h-6V2Z" /></Svg>;
  }
  if (id === 'FERAL') {
    return <Svg><path d="M5 19c2-7 4.4-11 7-14 2.6 3 5 7 7 14M8 15l4-3 4 3M12 12v8" /></Svg>;
  }
  if (id === 'FLUX') {
    return <Svg><ellipse cx="12" cy="12" rx="6.5" ry="9" /><path d="M3 12h5M16 12h5M12 3v5M12 16v5" /></Svg>;
  }
  return <Svg><path d="M17.5 17.5A8 8 0 1 1 17.5 6 6.2 6.2 0 0 0 17.5 17.5Z" /><path d="m8 12 2 2 4-5" /></Svg>;
}
