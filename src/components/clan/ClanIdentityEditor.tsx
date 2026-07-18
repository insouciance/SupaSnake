'use client';

/**
 * Clan identity editor (Identity v1 section 8.1) - banner, emblem and
 * color pickers gated by the clan's Heraldry research:
 *
 * - heraldry_1 unlocks editing (banner/emblem/colors); locked state
 *   shows WHAT could be customized and what it costs to get there.
 * - heraldry_3 / heraldry_4 render as locked hints for their
 *   render-time perks (board frame, animated title).
 *
 * Only owners/officers may save (the server RPC enforces it again).
 */

import { useState } from 'react';
import { IconLock, IconShield } from '@/components/ui/icons';
import {
  CLAN_BANNERS,
  CLAN_COLORS,
  CLAN_EMBLEMS,
  bannerById,
  emblemById,
} from '@/lib/clan/heraldry';
import { clanAction, type ClanFullView } from './useClanFull';

interface ClanIdentityEditorProps {
  accessToken?: string;
  view: ClanFullView;
  onSaved: () => void;
}

export function ClanIdentityEditor({ accessToken, view, onSaved }: ClanIdentityEditorProps) {
  const identity = view.identity;
  const role = view.membership?.role ?? 'member';
  const canEdit = role === 'owner' || role === 'officer';
  const heraldry = identity?.heraldry ?? [];
  const unlocked = heraldry.includes('heraldry_1');

  const [bannerId, setBannerId] = useState<string | null>(identity?.bannerId ?? null);
  const [emblemId, setEmblemId] = useState<string | null>(identity?.emblemId ?? null);
  const [colorPrimary, setColorPrimary] = useState<string | null>(identity?.colorPrimary ?? null);
  const [colorSecondary, setColorSecondary] = useState<string | null>(identity?.colorSecondary ?? null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const banner = bannerById(bannerId);
  const emblem = emblemById(emblemId);
  const from = colorPrimary ?? banner.from;
  const to = colorSecondary ?? banner.to;
  const clanName = (view.clan?.name as string) ?? '';
  const clanTag = (view.clan?.tag as string) ?? '';

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    const result = await clanAction(accessToken, {
      action: 'update_identity',
      bannerId,
      emblemId,
      colorPrimary,
      colorSecondary,
    });
    setSaving(false);
    setMessage(result.ok ? 'Heraldry saved' : result.error ?? 'Failed to save');
    if (result.ok) onSaved();
  };

  return (
    <section className="mb-10 animate-fade-up" data-testid="clan-identity-editor">
      <h2 className="heading-display text-2xl text-bone-white mb-4">Heraldry</h2>
      <div className="panel-elevated p-6">
        {/* Live banner preview */}
        <div
          className="rounded-arcade border border-scale-blue-light/50 p-5 mb-5 flex items-center gap-4"
          style={{ background: `linear-gradient(120deg, ${from}, ${to})` }}
          data-testid="clan-banner-preview"
        >
          <div className="w-12 h-12 rounded-arcade bg-void/50 border border-bone-white/30 flex items-center justify-center text-2xl text-bone-white">
            {emblem ? emblem.glyph : <IconShield size={22} />}
          </div>
          <div>
            <p className="heading-display text-2xl text-bone-white drop-shadow">{clanName}</p>
            <p className="font-display text-sm text-bone-white/80">[{clanTag}]</p>
          </div>
        </div>

        {!unlocked ? (
          <div className="flex items-start gap-3 bg-void/60 border border-scale-blue-light/50 rounded-arcade p-4">
            <IconLock size={20} className="text-beige/70 mt-0.5 shrink-0" />
            <div>
              <p className="text-bone-white font-body">
                Research <span className="text-venom-orange font-display">Heraldry I</span> in
                the Gauntlet tree to unlock banner, emblem and clan colors.
              </p>
              <p className="text-beige/60 text-sm font-body mt-1">
                Deeper Heraldry adds a victory fanfare (II), a board frame in counted runs
                (III) and an animated clan title (IV).
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <p className="label-arcade mb-2">Banner</p>
              <div className="flex flex-wrap gap-2">
                {CLAN_BANNERS.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setBannerId(option.id)}
                    disabled={!canEdit}
                    title={option.name}
                    aria-label={`Banner ${option.name}`}
                    className={`w-14 h-9 rounded-arcade border transition-all ${
                      (bannerId ?? CLAN_BANNERS[0].id) === option.id
                        ? 'border-venom-orange scale-105'
                        : 'border-scale-blue-light/50 hover:border-bone-white/60'
                    } ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
                    style={{ background: `linear-gradient(120deg, ${option.from}, ${option.to})` }}
                  />
                ))}
              </div>
            </div>

            <div className="mb-4">
              <p className="label-arcade mb-2">Emblem</p>
              <div className="flex flex-wrap gap-2">
                {CLAN_EMBLEMS.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setEmblemId(option.id)}
                    disabled={!canEdit}
                    title={option.name}
                    aria-label={`Emblem ${option.name}`}
                    className={`w-11 h-11 rounded-arcade border bg-void/60 text-xl text-bone-white transition-all ${
                      emblemId === option.id
                        ? 'border-venom-orange scale-105'
                        : 'border-scale-blue-light/50 hover:border-bone-white/60'
                    } ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {option.glyph}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              {(
                [
                  ['Primary color', colorPrimary, setColorPrimary],
                  ['Secondary color', colorSecondary, setColorSecondary],
                ] as const
              ).map(([label, value, setValue]) => (
                <div key={label}>
                  <p className="label-arcade mb-2">{label}</p>
                  <div className="flex flex-wrap gap-2">
                    {CLAN_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setValue(color)}
                        disabled={!canEdit}
                        aria-label={`${label} ${color}`}
                        className={`w-8 h-8 rounded-full border transition-all ${
                          value === color
                            ? 'border-bone-white scale-110'
                            : 'border-scale-blue-light/50'
                        } ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
                        style={{ background: color }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Deeper-tier hints */}
            <div className="flex flex-wrap gap-2 mb-5 text-xs font-body">
              {(
                [
                  ['heraldry_2', 'Victory fanfare'],
                  ['heraldry_3', 'Board frame in counted runs'],
                  ['heraldry_4', 'Animated clan title'],
                ] as const
              ).map(([node, label]) => (
                <span
                  key={node}
                  className={`px-2 py-1 rounded-arcade border ${
                    heraldry.includes(node)
                      ? 'border-rarity-uncommon/70 text-rarity-uncommon'
                      : 'border-scale-blue-light/40 text-beige/50'
                  }`}
                >
                  {heraldry.includes(node) ? '✓' : '🔒'} {label}
                </span>
              ))}
            </div>

            {canEdit ? (
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-go px-6 py-2 min-h-[44px]"
                data-testid="save-heraldry"
              >
                {saving ? 'Saving…' : 'Save Heraldry'}
              </button>
            ) : (
              <p className="text-beige/60 text-sm font-body">
                Officers and the owner set the clan&apos;s heraldry.
              </p>
            )}
            {message && <p className="text-beige text-sm font-body mt-2">{message}</p>}
          </>
        )}
      </div>
    </section>
  );
}
