'use client';

/**
 * Clan heraldry — preset banner, emblem and colors (Constitution §9.2).
 *
 * WP-1.02 removed the research gate this editor used to sit behind. It
 * required the `heraldry_1` node, which lives in the Gauntlet tree, and the
 * Gauntlet is hidden behind a population gate that will not open for a long
 * time (§9.3) — so a clan founded today would have had a permanently locked
 * identity. §9.2 makes preset heraldry part of FOUNDING, and identity is
 * never a reward for reaching a population threshold.
 *
 * Only the Leader may save (`set_clan_heraldry` enforces it again in SQL).
 * Co-leaders recruit and care for the roster; they do not rewrite the clan's
 * public identity.
 */

import { useState } from 'react';
import { IconShield } from '@/components/ui/icons';
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
  const canEdit = role === 'owner';

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
                The clan&apos;s owner sets its heraldry.
              </p>
            )}
            {message && <p className="text-beige text-sm font-body mt-2">{message}</p>}
      </div>
    </section>
  );
}
