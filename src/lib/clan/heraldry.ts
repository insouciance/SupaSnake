/**
 * Clan heraldry catalog (Player Identity v1 section 8.1) - the banner
 * and emblem options behind the update_clan_identity RPC. All ids match
 * the migration 024 format CHECK (^[a-z0-9_]{1,32}$); the SQL validates
 * again server-side, this list just drives the picker UI.
 *
 * Editing gates on the clan's Heraldry research (020):
 *   heraldry_1 - banner, emblem and colors become editable
 *   heraldry_2 - victory fanfare at duel settlement (render-time)
 *   heraldry_3 - board frame in counted runs (render-time)
 *   heraldry_4 - animated clan title (render-time)
 */

export interface ClanBannerOption {
  id: string;
  name: string;
  /** Default gradient stops (color pickers override at render). */
  from: string;
  to: string;
}

export interface ClanEmblemOption {
  id: string;
  name: string;
  /** Rendered glyph (unicode - no asset pipeline needed). */
  glyph: string;
}

export const CLAN_BANNERS: readonly ClanBannerOption[] = [
  { id: 'field_standard', name: 'Field Standard', from: '#131a2a', to: '#1e293b' },
  { id: 'venom_wake', name: 'Venom Wake', from: '#7c2d12', to: '#f97316' },
  { id: 'deep_current', name: 'Deep Current', from: '#0c4a6e', to: '#22d3ee' },
  { id: 'primal_root', name: 'Primal Root', from: '#14532d', to: '#4ade80' },
  { id: 'cosmic_veil', name: 'Cosmic Veil', from: '#3b0764', to: '#a855f7' },
  { id: 'iron_march', name: 'Iron March', from: '#1c1917', to: '#78716c' },
] as const;

export const CLAN_EMBLEMS: readonly ClanEmblemOption[] = [
  { id: 'fang', name: 'Fang', glyph: '𐃉' },
  { id: 'coil', name: 'Coil', glyph: '༗' },
  { id: 'helix', name: 'Helix', glyph: '§' },
  { id: 'talon', name: 'Talon', glyph: '⟁' },
  { id: 'sigil', name: 'Sigil', glyph: '◈' },
  { id: 'crown', name: 'Crown', glyph: '♛' },
] as const;

/** Curated color swatches; the route and SQL accept only these launch presets. */
export const CLAN_COLORS: readonly string[] = [
  '#f97316', '#22d3ee', '#4ade80', '#a855f7',
  '#facc15', '#f43f5e', '#e2e8f0', '#64748b',
] as const;

/**
 * Heraldry is intentionally a small preset vocabulary at launch. These
 * guards are shared by every server-facing clan route; SQL repeats the same
 * allowlist so a forged request cannot create an unmoderated identity.
 */
export function isValidClanBannerId(value: unknown): value is string {
  return typeof value === 'string' && CLAN_BANNERS.some((banner) => banner.id === value);
}

export function isValidClanEmblemId(value: unknown): value is string {
  return typeof value === 'string' && CLAN_EMBLEMS.some((emblem) => emblem.id === value);
}

export function isValidClanColor(value: unknown): value is string {
  return typeof value === 'string' && CLAN_COLORS.includes(value.toLowerCase());
}

export function bannerById(id: string | null | undefined): ClanBannerOption {
  return CLAN_BANNERS.find((b) => b.id === id) ?? CLAN_BANNERS[0];
}

export function emblemById(id: string | null | undefined): ClanEmblemOption | null {
  return CLAN_EMBLEMS.find((e) => e.id === id) ?? null;
}
