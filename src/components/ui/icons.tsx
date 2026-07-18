/**
 * SupaSnake icon set - consistent 24px stroke icons replacing the emoji
 * iconography (🧬 🏆 🔥 …). All icons inherit currentColor so dynasty/state
 * colors apply via text-* classes; size via the size prop or className.
 */

import React from 'react';

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

function base(props: IconProps) {
  const { size = 24, ...rest } = props;
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...rest,
  };
}

/** DNA double helix - the core currency */
export function IconDna(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 3c0 4 8 6 8 10s-8 6-8 8" />
      <path d="M16 3c0 4-8 6-8 10s8 6 8 8" />
      <path d="M8.5 7h7M8.5 17h7M10 12h4" />
    </svg>
  );
}

/** Energy bolt */
export function IconBolt(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}

/** Trophy - leaderboard / high score */
export function IconTrophy(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4z" />
      <path d="M7 6H4a1 1 0 0 0-1 1c0 2.2 1.8 4 4 4M17 6h3a1 1 0 0 1 1 1c0 2.2-1.8 4-4 4" />
    </svg>
  );
}

/** Flame - streak */
export function IconFlame(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3c1 3-3 4.5-3 8a3 3 0 0 0 6 0c0-1 -0.5-2-1-2.5 2 .5 4 2.5 4 5.5a6 6 0 0 1-12 0c0-5 5-7 6-11z" />
    </svg>
  );
}

/** Home */
export function IconHome(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 11 12 3l9 8" />
      <path d="M5 10v10h5v-6h4v6h5V10" />
    </svg>
  );
}

/** Flask - the Lab */
export function IconFlask(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 3v6L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 9V3" />
      <path d="M8.5 3h7M7.5 15h9" />
    </svg>
  );
}

/** Egg - breeding */
export function IconEgg(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3c4 4.5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6.5 6-11z" />
      <path d="M9.5 13.5c.5 2 2 3 4 3" />
    </svg>
  );
}

/** Cart - shop */
export function IconCart(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="17" cy="20" r="1.4" />
      <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.3h7.6a1.5 1.5 0 0 0 1.5-1.2L20 8H6" />
    </svg>
  );
}

/** Shield - clan */
export function IconShield(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6l-7-3z" />
    </svg>
  );
}

/** User / profile */
export function IconUser(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
    </svg>
  );
}

/** Play triangle */
export function IconPlay(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 4.5v15l13-7.5-13-7.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Lock */
export function IconLock(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** Check */
export function IconCheck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}

/** X / close */
export function IconX(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/** Chart bars - stats/leaderboard alt */
export function IconChart(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 20h16M7 20v-6M12 20V8M17 20v-9" />
    </svg>
  );
}

/** Gift - daily reward */
export function IconGift(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="9" width="16" height="4" />
      <path d="M6 13v7h12v-7M12 9v11" />
      <path d="M12 9C10 9 7.5 8.5 7.5 6.5A2 2 0 0 1 11 5c1 .8 1 4 1 4zm0 0c2 0 4.5-.5 4.5-2.5A2 2 0 0 0 13 5c-1 .8-1 4-1 4z" />
    </svg>
  );
}

/** Gear - settings */
export function IconGear(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5 13 5a7.5 7.5 0 0 1 2.2.9l2.5-1 1.4 1.4-1 2.5c.4.7.7 1.4.9 2.2l2.5 1v2l-2.5 1a7.5 7.5 0 0 1-.9 2.2l1 2.5-1.4 1.4-2.5-1a7.5 7.5 0 0 1-2.2.9l-1 2.5h-2l-1-2.5a7.5 7.5 0 0 1-2.2-.9l-2.5 1-1.4-1.4 1-2.5a7.5 7.5 0 0 1-.9-2.2l-2.5-1v-2l2.5-1c.2-.8.5-1.5.9-2.2l-1-2.5L6.3 4.9l2.5 1A7.5 7.5 0 0 1 11 5l1-2.5z" />
    </svg>
  );
}

/** Reset view - counter-clockwise circular arrow */
export function IconReset(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 12a9 9 0 1 0 2.6-6.36L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

/** Arrow right */
export function IconArrowRight(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 12h16m-6-6 6 6-6 6" />
    </svg>
  );
}

/** Medal - badges / earned prestige */
export function IconMedal(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="15" r="5" />
      <path d="M12 13v2.5l1.8 1M8.5 11 5 3h5l2 4.5L14 3h5l-3.5 8" />
    </svg>
  );
}

/** Crown - titles / sovereign ranks */
export function IconCrown(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 18h16M4 18 3 8l4.5 3.5L12 5l4.5 6.5L21 8l-1 10" />
    </svg>
  );
}

/** Edit pencil - claim / change handle */
export function IconEdit(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 20h4L20.5 7.5a2.1 2.1 0 0 0-3-3L5 17l-1 3z" />
      <path d="m14.5 6.5 3 3" />
    </svg>
  );
}

/** Snake - brand mark (stylized S-curve with head + eye) */
export function IconSnake(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M19 6c0-1.7-1.6-3-3.5-3H9C6.8 3 5 4.6 5 6.5S6.8 10 9 10h6c2.2 0 4 1.6 4 3.5S17.2 17 15 17H8.5C6.6 17 5 18.3 5 20" />
      <circle cx="6.5" cy="19.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
