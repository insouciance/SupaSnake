# SupaSnake Localization Strategy

**Document Version:** 1.0
**Last Updated:** 2025-12-19
**Owner:** Product & Engineering
**Status:** Planning

---

## Executive Summary

SupaSnake is a mobile F2P snake game with dynasty-themed cosmetics (EMBER, CRYSTAL, MECHA, etc.) designed for global launch. This strategy outlines our phased approach to localization across 11 languages, targeting US (launch), EU, LATAM, and Asia markets.

**Key Principles:**
- **Minimal text by design:** Show-don't-tell UI reduces translation burden
- **Phased rollout:** Tier 1 languages at launch, Tiers 2-3 post-validation
- **Cultural adaptation:** Dynasty themes adjusted per region
- **Fast iteration:** 24-48 hour hotfix translation turnaround

**Budget Estimate:** $35,000-$50,000 (all tiers)
**Launch Timeline:** Tier 1 at launch, Tier 2 at Month 3, Tier 3 at Month 6

---

## 1. Language Prioritization

### Tier 1: Launch Languages (Day 0)
**Markets:** North America, Western Europe, Latin America
**Languages:** 5 total
**Revenue Target:** 70% of global revenue

| Language | Market | MAU Potential | F2P ARPPU | Priority Rationale |
|----------|--------|---------------|-----------|-------------------|
| **English (US)** | US, UK, Canada, Australia | 150M | $25-35 | Primary launch market, highest ARPPU |
| **Spanish (LATAM)** | Mexico, Argentina, Colombia | 120M | $8-12 | Large mobile gaming market, growing F2P adoption |
| **Portuguese (BR)** | Brazil | 100M | $10-15 | Largest LATAM market, strong mobile penetration |
| **French (FR)** | France, Canada (QC), Belgium | 35M | $20-28 | High ARPPU, requires localization by law (France) |
| **German (DE)** | Germany, Austria, Switzerland | 45M | $22-30 | High ARPPU, strong F2P culture |

**Translation Volume:** ~1,200 strings (UI, menus, dynasty descriptions, shop)
**Launch Budget:** $12,000-$18,000

---

### Tier 2: Post-Launch Expansion (Month 3)
**Markets:** East Asia
**Languages:** 3 total
**Revenue Target:** 20% of global revenue

| Language | Market | MAU Potential | F2P ARPPU | Priority Rationale |
|----------|--------|---------------|-----------|-------------------|
| **Japanese (JP)** | Japan | 50M | $35-50 | Highest ARPPU globally, strong gacha culture |
| **Korean (KR)** | South Korea | 25M | $30-45 | Second highest ARPPU, competitive mobile market |
| **Chinese Simplified (CN)** | Mainland China | 600M | $5-8 | Massive TAM, requires separate app store strategy |

**Translation Volume:** ~1,200 strings + CJK font integration
**Budget:** $15,000-$20,000 (includes CJK QA)

**Note:** Chinese launch requires:
- iOS China App Store registration (ICP license)
- Android distribution via local stores (Huawei, Xiaomi, Tencent)
- Content review for dynasty themes (MECHA → rename to avoid military connotations)
- Separate Supabase instance (data residency compliance)

---

### Tier 3: Market Optimization (Month 6+)
**Markets:** Southern Europe, MENA, Eastern Europe
**Languages:** 3 total
**Revenue Target:** 10% of global revenue

| Language | Market | MAU Potential | F2P ARPPU | Priority Rationale |
|----------|--------|---------------|-----------|-------------------|
| **Italian (IT)** | Italy | 20M | $15-22 | Strong mobile market, adjacent to France/Germany |
| **Russian (RU)** | Russia, CIS | 80M | $3-6 | Large TAM, lower ARPPU (payment friction) |
| **Turkish (TR)** | Turkey | 30M | $4-8 | Growing mobile market, young demographic |
| **Arabic (AR)** | Saudi Arabia, UAE, Egypt | 60M | $12-18 | High ARPPU in Gulf states, RTL UI challenge |

**Translation Volume:** ~1,200 strings + RTL layout (Arabic)
**Budget:** $8,000-$12,000

**Note:** Arabic requires:
- RTL (right-to-left) UI layout support
- Mirrored game board (snake starts right side)
- Font rendering for Arabic script (connected letters)
- Cultural review (avoid religious imagery in dynasty themes)

---

## 2. Text Expansion Planning

### Expansion Rates by Language
**Baseline:** English (US) = 100%

| Language | Avg Expansion | Max Expansion | UI Impact |
|----------|---------------|---------------|-----------|
| German | +30% | +50% | Buttons, short labels |
| French | +25% | +40% | Menus, descriptions |
| Portuguese | +15% | +25% | Minimal |
| Spanish | +10% | +20% | Minimal |
| Italian | +20% | +35% | Buttons |
| Russian | +15% | +30% | Menus |
| Turkish | +10% | +25% | Minimal |
| Japanese | -10% | +5% | Vertical text option |
| Korean | -5% | +10% | Minimal |
| Chinese | -30% | -10% | Space savings |
| Arabic | +20% | +40% | RTL layout |

### Character Limits by String Type

**UI Element** | **English Limit** | **German/French Limit** | **CJK Limit** | **Arabic Limit**
---|---|---|---|---
Button Label | 12 chars | 16 chars | 8 chars | 15 chars
Menu Item | 20 chars | 26 chars | 12 chars | 25 chars
Toast/Snackbar | 40 chars | 52 chars | 25 chars | 50 chars
Dynasty Name | 10 chars | 13 chars | 6 chars | 12 chars
Description (short) | 60 chars | 78 chars | 40 chars | 75 chars
Description (long) | 200 chars | 260 chars | 130 chars | 250 chars
Tutorial Step | 80 chars | 104 chars | 50 chars | 100 chars

### UI Layout Strategies

**Responsive Text Sizing:**
```typescript
// src/lib/i18n/text-sizing.ts
export function getTextSize(locale: string, stringKey: string): TextSize {
  const expansionFactors = {
    'de': 1.3,
    'fr': 1.25,
    'it': 1.2,
    'ar': 1.2,
    'pt': 1.15,
    'es': 1.1,
    'ru': 1.15,
    'tr': 1.1,
    'ja': 0.9,
    'ko': 0.95,
    'zh': 0.7,
    'en': 1.0,
  };

  const baseFontSize = 14;
  const factor = expansionFactors[locale] || 1.0;

  // Reduce font size if text expands significantly
  if (factor > 1.2) {
    return { fontSize: baseFontSize * 0.9, lineHeight: 1.2 };
  }

  return { fontSize: baseFontSize, lineHeight: 1.4 };
}
```

**Dynamic Button Widths:**
- Min width: 80px (icon buttons)
- Preferred width: Auto (content-based)
- Max width: 200px (wrap to 2 lines if exceeded)

**Vertical Text (Japanese Option):**
- Traditional vertical reading for dynasty names
- Horizontal fallback for UI elements
- Player preference toggle in settings

---

## 3. Cultural Adaptation

### Dynasty Theme Localization

**EMBER Dynasty** (Fire/Passion)
- **Global:** Red/orange colors, flame particles
- **China:** Auspicious red (prosperity), acceptable
- **Japan:** Orange tones (red = warning in UI), rename particles to "spirit flames"
- **Middle East:** Fire symbolism positive (warmth, energy)

**CRYSTAL Dynasty** (Ice/Precision)
- **Global:** Blue/white colors, ice shards
- **China:** White = mourning (use silver/light blue instead)
- **Japan:** Acceptable (ice = purity)
- **Russia:** Strongly positive (winter pride)

**MECHA Dynasty** (Technology/Power)
- **Global:** Gray/silver, circuit patterns
- **Japan:** **CRITICAL ADJUSTMENT NEEDED**
  - "Mecha" = giant robots (Gundam association)
  - Rename to "TECH Dynasty" or "CYBER Dynasty"
  - Replace circuit patterns with holographic effects
- **China:** "MECHA" → "STEEL Dynasty" (钢铁, avoid military tech connotations)
- **South Korea:** Acceptable (strong tech culture)

**VOID Dynasty** (Mystery/Darkness)
- **Global:** Purple/black, shadow effects
- **China:** Acceptable (mystery, not death)
- **Middle East:** Dark themes acceptable if not tied to occult
- **Japan:** "Void" (虚無) = Buddhist concept, strongly positive

**NATURE Dynasty** (未実装, Future)**
- **Global:** Green/brown, leaf particles
- **All markets:** Universally positive symbolism

### Color Symbolism by Region

**Red:**
- US/EU: Passion, energy, danger (context-dependent)
- China: Luck, prosperity, celebration (always positive)
- Japan: Warning in UI, passion in art (context-dependent)
- India: Celebration, marriage (positive)

**White:**
- US/EU: Purity, cleanliness (positive)
- China/Japan/Korea: Death, mourning (avoid in life-related UI)
- Middle East: Purity (positive)

**Black:**
- US/EU: Sophistication, power (positive in premium contexts)
- China: Neutral (use sparingly)
- Japan: Formality (positive)

**Green:**
- Global: Growth, nature, success (universally positive)
- Exception: Avoid neon green in MENA (negative connotation)

**Gold/Yellow:**
- China: Imperial, prosperity (highly positive)
- Japan: Courage, wealth (positive)
- Middle East: Wealth (positive)
- US/EU: Premium tier indicator (positive)

### Holiday Event Localization

**Global Events (All Regions):**
- **New Year:** Jan 1 (Western), Lunar New Year variants for CN/JP/KR/VN
- **Summer Festival:** July (Northern Hemisphere), January (Southern Hemisphere variants for AU/BR)
- **Harvest Season:** October (generic autumn theme, no Halloween religious ties)

**Regional Events:**
- **Lunar New Year** (CN/JP/KR/VN): Red envelopes, zodiac snakes, fireworks
- **Golden Week** (JP): April 29-May 5, special challenges
- **Diwali** (India, future Tier 4): Festival of Lights theme (if Hindi added)
- **Ramadan** (MENA): No food/drink rewards during daylight hours (respect fasting)

**Avoided Holidays:**
- Christmas: Not celebrated globally (use "Winter Festival" instead)
- Easter: Religious (use "Spring Festival")
- Halloween: US-centric, religious objections in some markets (use "Harvest Festival")

### Naming Conventions

**Player Usernames:**
- **CJK Markets:** Allow 2-10 characters (vs 3-15 for Latin scripts)
- **Arabic:** Support full Unicode range (avoid breaking connected letters)
- **Profanity Filter:** Language-specific dictionaries (English filter misses non-English profanity)

**Dynasty Names:**
- **Transliteration vs Translation:**
  - EMBER: Translate meaning ("Fuego" in Spanish, "炎" in Japanese)
  - CRYSTAL: Keep English in most markets (globally understood)
  - MECHA: Translate/adapt (see Cultural Adaptation section)

**Achievement Titles:**
- **Avoid idioms:** "Cold as ice" doesn't translate (use "Ice Master")
- **Avoid puns:** "Snake Charmer" wordplay doesn't work in other languages
- **Use descriptive titles:** "100 Games Won" (universal)

---

## 4. Localization Workflow

### Phase 1: String Extraction

**Process:**
1. Developer adds string to codebase using i18n key
2. Pre-commit hook validates key exists in `en-US.json`
3. Weekly: Run extraction script to find new strings
4. Export to localization platform (Phrase, Lokalise, or Crowdin)

**String Key Naming Convention:**
```typescript
// Format: {namespace}.{feature}.{element}.{variant}

// Good examples:
"game.hud.score_label" = "Score"
"game.hud.high_score_label" = "Best"
"dynasty.ember.name" = "Ember"
"dynasty.ember.description" = "Masters of fire and passion"
"shop.iap.energy_pack_100.title" = "Energy Pack"
"shop.iap.energy_pack_100.description" = "100 energy crystals"
"error.network.connection_failed" = "Connection failed. Check your internet."

// Bad examples (avoid):
"label1" = "Score"  // No context
"ember" = "Ember"  // Ambiguous namespace
"error_msg" = "Failed"  // Unclear meaning
```

**String Categories:**
- **ui.{feature}:** UI labels, buttons, menus
- **game.{element}:** In-game HUD, tooltips
- **dynasty.{name}:** Dynasty names, descriptions
- **shop.{product}:** IAP titles, descriptions
- **tutorial.{step}:** Onboarding text
- **error.{type}:** Error messages
- **notification.{trigger}:** Push notifications

**Metadata per String:**
```json
{
  "key": "game.hud.score_label",
  "en-US": "Score",
  "max_length": 12,
  "context": "Displayed above score number in game HUD",
  "screenshot": "screenshots/hud_score_label.png",
  "tags": ["hud", "core_ui", "tier1_critical"]
}
```

### Phase 2: Translation Vendor Selection

**Recommended Vendors:**

**Option A: Professional Agency (Recommended for Tier 1)**
- **Vendor:** Keywords Studios, Lionbridge, or TransPerfect
- **Cost:** $0.15-$0.25/word (English source)
- **Turnaround:** 5-7 days (1,200 strings)
- **Quality:** Native speakers, gaming specialization
- **Services:** Translation Memory (TM), glossary management, LQA

**Option B: Platform + Freelancers (Tier 2/3)**
- **Platform:** Phrase, Lokalise with marketplace
- **Cost:** $0.08-$0.15/word
- **Turnaround:** 3-5 days
- **Quality:** Variable (requires review)
- **Services:** CAT tools, TM, community voting

**Option C: Machine Translation + MTPE (Internal strings only)**
- **Provider:** DeepL Pro or Google Cloud Translation
- **Cost:** $0.01-$0.03/word (MT) + $0.05/word (post-editing)
- **Turnaround:** 1-2 days
- **Quality:** Good for simple strings, requires editing
- **Use case:** Internal tools, dev environments, rapid prototyping

**Selected Approach:**
- **Tier 1 (Launch):** Professional agency (Option A)
- **Tier 2 (CJK):** Professional agency (Option A) - cultural sensitivity critical
- **Tier 3 (Expansion):** Platform + freelancers (Option B)
- **Hotfixes:** Machine + MTPE (Option C) with 24hr review

### Phase 3: Glossary & Style Guide

**Glossary (Translation Memory):**
```
TERM                 | CATEGORY    | EN-US          | ES-LATAM       | PT-BR          | NOTES
---------------------|-------------|----------------|----------------|----------------|------------------
Snake (player)       | Game Entity | Snake          | Serpiente      | Cobra          | Player character
Dynasty              | Game Concept| Dynasty        | Dinastía       | Dinastia       | Collection tier
Energy (currency)    | Currency    | Energy         | Energía        | Energia        | Gameplay currency
Gems (currency)      | Currency    | Gems           | Gemas          | Gemas          | Premium currency
Evolution            | Game Mechanic| Evolution     | Evolución      | Evolução       | Snake upgrade
Breed                | Game Mechanic| Breed         | Criar          | Cruzar         | Combine 2 snakes
Hatch                | Game Mechanic| Hatch         | Eclosionar     | Chocar         | Open egg
Classic Mode         | Game Mode   | Classic Mode   | Modo Clásico   | Modo Clássico  | Standard gameplay
Speed Run            | Game Mode   | Speed Run      | Contrarreloj   | Corrida Rápida | Time-based mode
Leaderboard          | Feature     | Leaderboard    | Clasificación  | Classificação  | Rankings
```

**Style Guide per Language:**

**Spanish (LATAM):**
- **Formality:** Informal "tú" (not "usted")
- **Tone:** Energetic, enthusiastic (¡Increíble! not "Bien")
- **Numbers:** Use periods for thousands (1.000 not 1,000)
- **Currency:** Local symbols ($10 MXN, $10 ARS)

**Portuguese (BR):**
- **Formality:** Informal "você"
- **Tone:** Friendly, casual (Legal! not Bom)
- **Numbers:** Use periods for thousands (1.000)
- **Currency:** R$ 10,00

**French (FR):**
- **Formality:** Informal "tu" for game (formal "vous" for legal)
- **Tone:** Playful but not childish
- **Numbers:** Use spaces for thousands (1 000)
- **Currency:** 10,00 € (space before €)

**German (DE):**
- **Formality:** Informal "du"
- **Tone:** Direct, enthusiastic
- **Numbers:** Use periods for thousands (1.000)
- **Currency:** 10,00 € (space before €)

**Japanese (JP):**
- **Formality:** Casual polite (です/ます form)
- **Tone:** Cute/kawaii acceptable for snake cosmetics
- **Numbers:** Use kanji for large numbers (万, 億)
- **Currency:** ¥100 (no decimal)

**Korean (KR):**
- **Formality:** Polite informal (해요 form)
- **Tone:** Respectful but approachable
- **Numbers:** Use commas (1,000)
- **Currency:** ₩1,000 (no decimal)

**Chinese Simplified (CN):**
- **Formality:** Neutral (avoid overly formal literary Chinese)
- **Tone:** Encouraging, aspirational
- **Numbers:** Use commas (1,000) or 万 (10,000s)
- **Currency:** ¥10.00

**Arabic (AR):**
- **Formality:** Modern Standard Arabic (MSA)
- **Tone:** Respectful, enthusiastic
- **Numbers:** Use Arabic-Indic numerals (٠١٢٣) or Western (0123) based on region
- **Currency:** Local symbols (﷼ for SAR, د.إ for AED)

### Phase 4: Review & QA Process

**Linguistic QA (LQA):**
1. **Automated Checks (CI/CD):**
   - String length validation (within limits)
   - Placeholder validation (all variables present)
   - Consistency checks (same term translated consistently)
   - Missing translations (no fallback to English in production)

2. **Native Speaker Review:**
   - In-context review (screenshots with translations)
   - Tone consistency (formal vs informal)
   - Cultural appropriateness (no offensive content)
   - Technical accuracy (game terms correct)

3. **Functional QA:**
   - UI rendering (no text overflow, truncation)
   - RTL layout (Arabic: correct mirroring)
   - Font rendering (CJK: no missing characters, Arabic: proper ligatures)
   - Input validation (username character sets)

4. **Player Testing (Soft Launch):**
   - Run ads in target market (100-500 installs per language)
   - Monitor feedback (in-game surveys, app store reviews)
   - A/B test variant translations (e.g., "Comprar" vs "Adquirir" for "Buy")

**QA Checklist per Language:**
```markdown
## Spanish (LATAM) QA
- [ ] No European Spanish detected (ordenador → computadora)
- [ ] Informal tú used throughout (not usted)
- [ ] Currency symbols localized ($ MXN, $ ARS)
- [ ] Date format: DD/MM/YYYY
- [ ] Exclamation marks balanced (¡Genial!)

## Japanese QA
- [ ] Kanji appropriate for target age (use hiragana for kids)
- [ ] No outdated katakana (ゲーム not ゲイム)
- [ ] Vertical text rendering works (dynasty names)
- [ ] Half-width katakana not used (full-width only)
- [ ] Currency: ¥ symbol, no decimal

## Arabic QA
- [ ] RTL layout functional (buttons mirrored)
- [ ] No broken ligatures (connected letters intact)
- [ ] Numbers in correct script (Arabic-Indic vs Western)
- [ ] Game board mirrored (snake starts right)
- [ ] No offensive content (cultural review passed)
```

### Phase 5: Hotfix Localization Turnaround

**Scenario:** Critical bug fix requires new error message

**Process:**
1. **Hour 0:** Developer adds English string, deploys hotfix to production
2. **Hour 0-2:** Automated extraction, export to translation platform
3. **Hour 2-6:** Machine translation (DeepL) + context added
4. **Hour 6-24:** Native speaker post-editing (async, freelancer marketplace)
5. **Hour 24:** Review, merge translations, deploy localized hotfix
6. **Hour 48:** Monitor player feedback, adjust if needed

**Acceptable Interim State:**
- English fallback for first 24 hours (better than broken game)
- Push notification: Delay localized version by 2 hours (send English first)

**Optimization:**
- Pre-translate common error messages (build library of 50-100 standard errors)
- Maintain on-call translator for Tier 1 languages (24hr response SLA)

---

## 5. Technical Implementation

### Recommended i18n Library: next-intl

**Rationale:**
- Native Next.js integration (App Router support)
- Type-safe translations (TypeScript autocomplete)
- Server + client components supported
- Automatic locale detection (Accept-Language header)
- Dynamic imports (reduce bundle size)

**Alternative:** react-i18next (if migrating from React Native)

### Setup

**Installation:**
```bash
npm install next-intl
```

**File Structure:**
```
src/
├── i18n/
│   ├── locales/
│   │   ├── en-US.json       # English (default)
│   │   ├── es-419.json      # Spanish (LATAM)
│   │   ├── pt-BR.json       # Portuguese (Brazil)
│   │   ├── fr-FR.json       # French
│   │   ├── de-DE.json       # German
│   │   ├── ja-JP.json       # Japanese
│   │   ├── ko-KR.json       # Korean
│   │   ├── zh-CN.json       # Chinese (Simplified)
│   │   ├── it-IT.json       # Italian
│   │   ├── ru-RU.json       # Russian
│   │   ├── tr-TR.json       # Turkish
│   │   └── ar-SA.json       # Arabic (Saudi)
│   ├── config.ts            # i18n configuration
│   ├── request.ts           # Server-side i18n
│   └── types.ts             # TypeScript types
├── middleware.ts            # Locale detection
└── app/
    └── [locale]/            # Locale-based routing
        └── page.tsx
```

**Configuration:**
```typescript
// src/i18n/config.ts
export const locales = [
  'en-US',
  'es-419',
  'pt-BR',
  'fr-FR',
  'de-DE',
  'ja-JP',
  'ko-KR',
  'zh-CN',
  'it-IT',
  'ru-RU',
  'tr-TR',
  'ar-SA',
] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en-US';

export const localeNames: Record<Locale, string> = {
  'en-US': 'English',
  'es-419': 'Español',
  'pt-BR': 'Português',
  'fr-FR': 'Français',
  'de-DE': 'Deutsch',
  'ja-JP': '日本語',
  'ko-KR': '한국어',
  'zh-CN': '简体中文',
  'it-IT': 'Italiano',
  'ru-RU': 'Русский',
  'tr-TR': 'Türkçe',
  'ar-SA': 'العربية',
};

export const rtlLocales: Locale[] = ['ar-SA'];

export function isRTL(locale: Locale): boolean {
  return rtlLocales.includes(locale);
}
```

**Middleware (Locale Detection):**
```typescript
// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { defaultLocale, locales } from '@/i18n/config';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Check if pathname already has locale
  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  if (pathnameHasLocale) return;

  // Detect locale from Accept-Language header
  const locale = getLocale(request) || defaultLocale;

  // Redirect to locale-prefixed URL
  return NextResponse.redirect(
    new URL(`/${locale}${pathname}`, request.url)
  );
}

function getLocale(request: NextRequest): string | null {
  const acceptLanguage = request.headers.get('Accept-Language');
  if (!acceptLanguage) return null;

  // Parse Accept-Language: "en-US,en;q=0.9,es;q=0.8"
  const languages = acceptLanguage
    .split(',')
    .map((lang) => {
      const [locale, q] = lang.trim().split(';q=');
      return { locale, quality: q ? parseFloat(q) : 1.0 };
    })
    .sort((a, b) => b.quality - a.quality);

  // Match exact locale (en-US)
  for (const { locale } of languages) {
    if (locales.includes(locale as any)) return locale;
  }

  // Match language only (en → en-US)
  for (const { locale } of languages) {
    const lang = locale.split('-')[0];
    const match = locales.find((l) => l.startsWith(lang));
    if (match) return match;
  }

  return null;
}

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
```

**Translation Files:**
```json
// src/i18n/locales/en-US.json
{
  "game": {
    "hud": {
      "score": "Score",
      "highScore": "Best",
      "energy": "Energy"
    },
    "pause": {
      "title": "Paused",
      "resume": "Resume",
      "restart": "Restart",
      "quit": "Quit"
    }
  },
  "dynasty": {
    "ember": {
      "name": "Ember",
      "description": "Masters of fire and passion"
    },
    "crystal": {
      "name": "Crystal",
      "description": "Precision and clarity embodied"
    },
    "mecha": {
      "name": "Mecha",
      "description": "Technological superiority achieved"
    }
  },
  "shop": {
    "energy": {
      "pack100": {
        "title": "Energy Pack",
        "description": "100 energy crystals"
      }
    }
  },
  "error": {
    "network": {
      "connectionFailed": "Connection failed. Check your internet."
    }
  }
}
```

```json
// src/i18n/locales/es-419.json
{
  "game": {
    "hud": {
      "score": "Puntuación",
      "highScore": "Récord",
      "energy": "Energía"
    },
    "pause": {
      "title": "Pausado",
      "resume": "Reanudar",
      "restart": "Reiniciar",
      "quit": "Salir"
    }
  },
  "dynasty": {
    "ember": {
      "name": "Brasa",
      "description": "Maestros del fuego y la pasión"
    },
    "crystal": {
      "name": "Cristal",
      "description": "Precisión y claridad encarnadas"
    },
    "mecha": {
      "name": "Tech",
      "description": "Superioridad tecnológica alcanzada"
    }
  },
  "shop": {
    "energy": {
      "pack100": {
        "title": "Paquete de Energía",
        "description": "100 cristales de energía"
      }
    }
  },
  "error": {
    "network": {
      "connectionFailed": "Conexión fallida. Verifica tu internet."
    }
  }
}
```

**Usage in Components:**
```typescript
// src/app/[locale]/game/page.tsx
import { useTranslations } from 'next-intl';

export default function GamePage() {
  const t = useTranslations('game.hud');

  return (
    <div>
      <div>{t('score')}: 1000</div>
      <div>{t('highScore')}: 5000</div>
      <div>{t('energy')}: 50</div>
    </div>
  );
}
```

**Server Components:**
```typescript
// src/app/[locale]/layout.tsx
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params: { locale } }: Props) {
  const t = await getTranslations({ locale, namespace: 'metadata' });

  return {
    title: t('title'),
    description: t('description'),
  };
}
```

### Pluralization Rules

**Challenge:** Languages have different plural forms
- English: 2 forms (1 apple, 2 apples)
- French: 2 forms (0/1 pomme, 2+ pommes)
- Russian: 3 forms (1, 2-4, 5+)
- Arabic: 6 forms (0, 1, 2, 3-10, 11-99, 100+)

**Implementation:**
```json
// en-US.json
{
  "game": {
    "energy": {
      "count": "{count, plural, =0 {No energy} one {# energy} other {# energy}}"
    }
  }
}
```

```json
// ru-RU.json (3 forms)
{
  "game": {
    "energy": {
      "count": "{count, plural, =0 {Нет энергии} one {# энергия} few {# энергии} many {# энергий} other {# энергии}}"
    }
  }
}
```

**Usage:**
```typescript
const t = useTranslations('game.energy');
console.log(t('count', { count: 0 }));  // "No energy"
console.log(t('count', { count: 1 }));  // "1 energy"
console.log(t('count', { count: 5 }));  // "5 energy"
```

### Date/Time Formatting

**Challenge:** Localized formats
- US: MM/DD/YYYY, 12-hour (3:00 PM)
- EU: DD/MM/YYYY, 24-hour (15:00)
- Asia: YYYY/MM/DD, 24-hour (15:00)

**Implementation:**
```typescript
import { useFormatter } from 'next-intl';

export function EventTimer() {
  const format = useFormatter();
  const eventEnd = new Date('2025-12-25T23:59:59Z');

  return (
    <div>
      <div>{format.dateTime(eventEnd, { dateStyle: 'full' })}</div>
      <div>{format.relativeTime(eventEnd)}</div>
    </div>
  );
}

// Output:
// en-US: "Friday, December 25, 2025" | "in 6 days"
// es-419: "viernes, 25 de diciembre de 2025" | "en 6 días"
// ja-JP: "2025年12月25日金曜日" | "6 日後"
```

### Number Formatting

**Challenge:** Thousand separators, decimal points
- US: 1,000.50
- EU: 1.000,50 or 1 000,50
- India: 1,00,000.50 (lakhs system)

**Implementation:**
```typescript
import { useFormatter } from 'next-intl';

export function ScoreDisplay({ score }: { score: number }) {
  const format = useFormatter();

  return (
    <div>
      Score: {format.number(score, { notation: 'compact' })}
    </div>
  );
}

// Output:
// en-US: "Score: 1.5K" (1,500) or "Score: 1.5M" (1,500,000)
// ja-JP: "Score: 1.5千" (1,500) or "Score: 150万" (1,500,000)
```

### Currency Formatting

**Implementation:**
```typescript
import { useFormatter } from 'next-intl';

export function IAPPrice({ priceUSD }: { priceUSD: number }) {
  const format = useFormatter();
  const locale = useLocale();

  // Convert USD to local currency (use Adjust revenue API in production)
  const localPrice = convertCurrency(priceUSD, locale);
  const currency = getCurrency(locale);

  return (
    <div>
      {format.number(localPrice, { style: 'currency', currency })}
    </div>
  );
}

function getCurrency(locale: string): string {
  const map: Record<string, string> = {
    'en-US': 'USD',
    'es-419': 'USD',  // Use USD in LATAM app stores
    'pt-BR': 'BRL',
    'fr-FR': 'EUR',
    'de-DE': 'EUR',
    'ja-JP': 'JPY',
    'ko-KR': 'KRW',
    'zh-CN': 'CNY',
    'it-IT': 'EUR',
    'ru-RU': 'RUB',
    'tr-TR': 'TRY',
    'ar-SA': 'SAR',
  };
  return map[locale] || 'USD';
}
```

### RTL (Right-to-Left) Layout

**Implementation:**
```typescript
// src/app/[locale]/layout.tsx
import { isRTL } from '@/i18n/config';

export default function RootLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const direction = isRTL(locale as any) ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={direction}>
      <body>{children}</body>
    </html>
  );
}
```

**CSS Adjustments:**
```css
/* globals.css */

/* Standard (LTR) */
.button {
  margin-left: 10px;
  text-align: left;
}

/* RTL Support */
[dir="rtl"] .button {
  margin-left: 0;
  margin-right: 10px;
  text-align: right;
}

/* Logical Properties (Better) */
.button {
  margin-inline-start: 10px;  /* Automatically flips in RTL */
  text-align: start;          /* Automatically flips in RTL */
}
```

**Game Board Mirroring (Arabic):**
```typescript
// src/components/game/GameBoard.tsx
import { useLocale } from 'next-intl';
import { isRTL } from '@/i18n/config';

export function GameBoard() {
  const locale = useLocale();
  const mirrored = isRTL(locale as any);

  return (
    <canvas
      style={{
        transform: mirrored ? 'scaleX(-1)' : 'none',
      }}
    />
  );
}
```

---

## 6. Budget & Timeline

### Cost Breakdown by Tier

**Tier 1: Launch Languages (5 languages)**

| Item | Cost | Notes |
|------|------|-------|
| Translation (1,200 strings × 4 languages × $0.20/word avg) | $9,600 | English is source (no cost) |
| Glossary creation | $1,000 | One-time, reusable for Tier 2/3 |
| LQA (linguistic QA) | $2,000 | Native speaker review |
| Functional QA (UI testing) | $1,500 | QA team, 2 days × 5 languages |
| Project management | $1,000 | Vendor coordination |
| Contingency (15%) | $2,265 | Rework, unexpected issues |
| **Tier 1 Total** | **$17,365** | **Target: Launch Day** |

**Tier 2: East Asia (3 languages)**

| Item | Cost | Notes |
|------|------|-------|
| Translation (1,200 strings × 3 languages × $0.25/word) | $9,000 | Higher rate for CJK specialization |
| CJK font licensing | $2,000 | Noto Sans CJK (free) or custom font |
| Cultural adaptation (MECHA rename, etc.) | $1,500 | Creative review + translation updates |
| LQA + cultural review | $2,500 | Critical for Japan market |
| Functional QA (CJK rendering) | $1,500 | Vertical text, character display |
| Contingency (15%) | $2,475 | |
| **Tier 2 Total** | **$18,975** | **Target: Month 3** |

**Tier 3: Expansion (4 languages)**

| Item | Cost | Notes |
|------|------|-------|
| Translation (1,200 strings × 4 languages × $0.12/word) | $5,760 | Platform + freelancers (lower rate) |
| RTL development (Arabic) | $3,000 | Layout mirroring, testing |
| Arabic font + rendering | $1,000 | Connected letters, ligatures |
| LQA | $1,500 | Lighter review (lower ARPPU markets) |
| Functional QA | $1,000 | |
| Contingency (15%) | $1,839 | |
| **Tier 3 Total** | **$14,099** | **Target: Month 6** |

**Ongoing Maintenance (Annual)**

| Item | Cost | Notes |
|------|------|-------|
| New content translation (monthly updates) | $12,000 | $1,000/month avg (events, features) |
| Hotfix localization | $2,400 | $200/month avg |
| LQA retainer | $3,600 | $300/month |
| Platform subscription (Phrase/Lokalise) | $3,000 | $250/month |
| **Annual Maintenance** | **$21,000** | **After all tiers live** |

**Total Investment:**
- **Year 1:** $50,439 (Tier 1 + 2 + 3 + 6 months maintenance)
- **Year 2+:** $21,000/year (maintenance only)

### Timeline

**Phase 1: Tier 1 Launch (Months 1-2)**

| Week | Milestone | Deliverable |
|------|-----------|-------------|
| W1 | Kick-off + String extraction | 1,200 strings exported |
| W2 | Glossary creation | Glossary finalized (100 terms) |
| W3-4 | Translation (ES, PT, FR, DE) | All strings translated |
| W5 | LQA + Review | Issues identified, fixed |
| W6 | Integration + Functional QA | UI tested in all languages |
| W7 | Soft launch (beta testers) | 500 installs per language |
| W8 | Launch | All Tier 1 languages live |

**Phase 2: Tier 2 East Asia (Months 3-5)**

| Week | Milestone | Deliverable |
|------|-----------|-------------|
| W9-10 | Cultural adaptation | MECHA renamed, themes adjusted |
| W11-12 | Translation (JA, KO, ZH) | All strings translated |
| W13 | CJK font integration | Fonts rendered correctly |
| W14 | LQA + Cultural review | Native speaker validation |
| W15 | Functional QA (CJK) | Vertical text, character display tested |
| W16 | China app store setup | ICP license (if pursuing CN market) |
| W17-18 | Soft launch | 500 installs per language |
| W19 | Launch | All Tier 2 languages live |

**Phase 3: Tier 3 Expansion (Months 6-8)**

| Week | Milestone | Deliverable |
|------|-----------|-------------|
| W20-21 | Translation (IT, RU, TR, AR) | All strings translated |
| W22 | RTL development (Arabic) | Layout mirroring complete |
| W23 | LQA | Issues fixed |
| W24 | Functional QA (RTL) | Arabic layout tested |
| W25-26 | Soft launch | 300 installs per language |
| W27 | Launch | All Tier 3 languages live |

**Ongoing: Maintenance**
- **Monthly:** New content translated (events, features)
- **Quarterly:** LQA refresh (check for outdated terms)
- **Annually:** Glossary update (new game terms)

---

## 7. Success Metrics

### KPIs per Language

**Retention (Day 1 / Day 7 / Day 30):**
- **Target:** Within 5% of English baseline
- **Acceptable:** -10% (account for market differences)
- **Red flag:** -20% (investigate: translation issues, cultural misalignment)

**Conversion (Install → Account → Purchase):**
- **Target:** Within 10% of English baseline
- **Acceptable:** -15% (LATAM/RU have lower payment penetration)
- **Red flag:** -30% (check: pricing, payment methods, localized store pages)

**App Store Rating:**
- **Target:** 4.5+ stars (same as English)
- **Red flag:** <4.0 stars + negative reviews mentioning "bad translation"

**Support Tickets (Language-Related):**
- **Target:** <2% of tickets cite translation confusion
- **Red flag:** >5% of tickets (indicates poor translation quality)

### A/B Testing Variants

**Test:** Formal vs Informal Tone (Spanish)
- **Variant A:** Informal "tú" (¡Juega ahora!)
- **Variant B:** Formal "usted" (Juegue ahora)
- **Hypothesis:** Informal performs better (younger audience)
- **Metric:** Day 1 retention
- **Sample size:** 10,000 installs per variant

**Test:** Dynasty Name Localization (Japanese)
- **Variant A:** English names (EMBER, CRYSTAL, MECHA)
- **Variant B:** Translated names (炎, 水晶, 機械)
- **Hypothesis:** Translated performs better (cultural relevance)
- **Metric:** Collection engagement rate
- **Sample size:** 5,000 installs per variant

---

## 8. Risk Mitigation

### Risk: Poor Translation Quality
**Impact:** Negative reviews, low retention, refund requests
**Likelihood:** Medium (vendor quality varies)
**Mitigation:**
- Use professional agencies for Tier 1 (not freelancers)
- Require LQA by second native speaker
- Soft launch to 500 beta testers per language before full launch
- Monitor app store reviews daily (set alerts for "translation" keyword)

### Risk: Text Overflow (UI Breaking)
**Impact:** Buttons unreadable, labels truncated
**Likelihood:** High (German/French expand 30%)
**Mitigation:**
- Define strict character limits per string type
- Automated length validation in CI/CD
- Responsive font sizing (reduce font size if text expands)
- Functional QA on smallest supported screen (iPhone SE)

### Risk: Cultural Offense
**Impact:** App store rejection, negative press, boycotts
**Likelihood:** Low (but high severity)
**Mitigation:**
- Cultural review by native consultants (not just translators)
- Avoid religious/political imagery in dynasty themes
- Test with beta users in target market (1,000 installs before launch)
- Legal review for China (sensitive content regulations)

### Risk: Delayed Localization (Hotfixes)
**Impact:** Non-English players see English strings for days
**Likelihood:** Medium (urgent fixes bypass process)
**Mitigation:**
- Pre-translate common error messages (library of 50-100)
- Machine translation + 24hr review SLA for urgent fixes
- Acceptable interim: English fallback for critical bugs (better than broken game)

### Risk: Regional Payment Issues
**Impact:** Players can't purchase (low conversion)
**Likelihood:** Medium (payment methods vary by country)
**Mitigation:**
- Integrate local payment methods (Pix in Brazil, Alipay in China, carrier billing in Turkey)
- Localize pricing (use Adjust revenue API to show local currency)
- Soft launch payment flow separately (test before IAP launch)

---

## 9. Post-Launch Optimization

### Month 1: Monitor & Fix
- **Daily:** Check app store reviews for translation complaints
- **Weekly:** Analyze retention by language (flag outliers)
- **Action:** Deploy hotfixes for critical translation errors within 48 hours

### Month 3: A/B Test Variants
- **Test:** 2-3 alternative translations for key CTAs (Buy, Play, Join)
- **Analyze:** Conversion rate impact
- **Action:** Replace underperforming translations

### Month 6: Expand Tier 2/3
- **Validate:** Tier 1 languages hit retention/conversion targets
- **Action:** Greenlight Tier 2 (East Asia) if targets met
- **Hold:** If Tier 1 underperforms, fix before expanding

### Month 12: Localization Refresh
- **Audit:** Review all translations (are they still accurate?)
- **Update:** New game terms added over year (need translation)
- **Action:** Re-translate outdated strings, update glossary

---

## 10. China-Specific Considerations

**Why Separate Section:**
China requires distinct strategy (regulatory, infrastructure, distribution)

### Regulatory Requirements
- **ICP License:** Required for online games (6-12 month approval process)
- **ISBN Number:** Required for paid games (not F2P)
- **Content Review:** No violence, gambling, or politically sensitive content
- **Real-Name Registration:** Players must verify identity (phone number + national ID)
- **Anti-Addiction System:** Minors limited to 3 hours/week (enforced by government)

### Technical Requirements
- **Data Residency:** All player data stored in China (separate Supabase instance or Alibaba Cloud)
- **No Google Services:** Replace Firebase, Google Analytics, AdMob with local alternatives
- **CDN:** Use China-optimized CDN (Alibaba, Tencent, or local provider)

### Distribution
- **iOS:** China App Store (separate app submission, Chinese business license required)
- **Android:** Local stores only (Huawei, Xiaomi, Oppo, Vivo, Tencent MyApp)
- **Publishing Partner:** Recommended (local company handles licensing, distribution, payments)

### Monetization
- **Payment Methods:** Alipay, WeChat Pay (not credit cards)
- **Pricing:** Lower than US (¥6 vs $0.99, ¥30 vs $4.99)
- **Revenue Share:** 30% platform + 30% publisher = 40% to developer (vs 70% in US)

### Cultural Adaptations
- **MECHA Dynasty:** Rename to "STEEL Dynasty" (钢铁) - avoid military tech connotations
- **VOID Dynasty:** Acceptable (虚无 = Buddhist concept, not negative)
- **Colors:** Red = luck (use extensively), white = mourning (avoid in life-related UI)
- **Numbers:** 8 = lucky, 4 = unlucky (avoid pricing at ¥4, ¥14, etc.)

### Recommendation
**If TAM < 100K MAU expected:** Skip China (regulatory burden too high)
**If TAM > 500K MAU expected:** Partner with local publisher (Tencent, NetEase, Bilibili)

---

## 11. Tools & Resources

### Translation Platforms
- **Phrase:** https://phrase.com (TM, CAT tools, vendor marketplace)
- **Lokalise:** https://lokalise.com (developer-friendly, CI/CD integration)
- **Crowdin:** https://crowdin.com (community translation, lower cost)

### Machine Translation (Prototyping Only)
- **DeepL Pro:** https://deepl.com (best quality for EU languages)
- **Google Cloud Translation:** https://cloud.google.com/translate (200+ languages)

### Fonts
- **Noto Sans CJK:** https://github.com/googlefonts/noto-cjk (free, covers CJK)
- **Roboto:** https://fonts.google.com/specimen/Roboto (Latin scripts)
- **Cairo:** https://fonts.google.com/specimen/Cairo (Arabic, free)

### Locale Data
- **Unicode CLDR:** https://cldr.unicode.org (date/number formats, pluralization rules)
- **i18n Ally (VS Code):** https://github.com/lokalise/i18n-ally (inline translation editing)

### QA Tools
- **Pseudo-localization:** https://github.com/tryggvigy/pseudo-localization (test text expansion)
- **i18n String Extractor:** https://github.com/formatjs/formatjs (automated extraction)

---

## 12. Appendix

### A. Sample Translation Brief

**Project:** SupaSnake Mobile Game
**Languages:** Spanish (LATAM), Portuguese (BR), French (FR), German (DE)
**Volume:** 1,200 strings (~6,000 words English source)
**Due Date:** 2 weeks from kickoff
**Budget:** $10,000

**Context:**
SupaSnake is a casual mobile game where players control a snake, collect items, and unlock cosmetic dynasties (EMBER, CRYSTAL, MECHA). Target audience is 13-35 years old, casual gamers.

**Tone:**
- Energetic, fun, approachable (not childish)
- Use informal address (tú/tu/du, not usted/vous/Sie)
- Short, punchy sentences (mobile UI = limited space)

**Key Terms (Do Not Translate):**
- SupaSnake (brand name)
- Dynasties: EMBER, CRYSTAL, MECHA, VOID (translate descriptions, not names)

**Reference Materials:**
- Screenshots: [Link to Figma with UI mockups]
- Glossary: [Link to shared spreadsheet]
- Style guide: [Link to brand guidelines]

**Deliverables:**
- Translated JSON files (one per language)
- Translation Memory (TMX format)
- QA report (any unclear strings)

### B. Character Set Support

**Language** | **Script** | **Unicode Range** | **Font Recommendation**
---|---|---|---
English | Latin | U+0020-U+007F | Roboto
Spanish | Latin + diacritics | U+0020-U+00FF | Roboto
Portuguese | Latin + diacritics | U+0020-U+00FF | Roboto
French | Latin + diacritics | U+0020-U+00FF | Roboto
German | Latin + umlauts | U+0020-U+00FF | Roboto
Italian | Latin + diacritics | U+0020-U+00FF | Roboto
Russian | Cyrillic | U+0400-U+04FF | Roboto
Turkish | Latin + special | U+0020-U+00FF, U+011E-U+015F | Roboto
Japanese | Kanji + Hiragana + Katakana | U+3040-U+309F, U+30A0-U+30FF, U+4E00-U+9FFF | Noto Sans CJK JP
Korean | Hangul | U+AC00-U+D7AF | Noto Sans CJK KR
Chinese | Simplified Hanzi | U+4E00-U+9FFF | Noto Sans CJK SC
Arabic | Arabic | U+0600-U+06FF | Cairo

### C. Pluralization Rules by Language

**Language** | **Forms** | **Rules** | **Example (1, 2, 5)**
---|---|---|---
English | 2 | one (1), other (0, 2+) | 1 apple, 2 apples, 5 apples
Spanish | 2 | one (1), other (0, 2+) | 1 manzana, 2 manzanas, 5 manzanas
Portuguese | 2 | one (0-1), other (2+) | 1 maçã, 2 maçãs, 5 maçãs
French | 2 | one (0-1), other (2+) | 1 pomme, 2 pommes, 5 pommes
German | 2 | one (1), other (0, 2+) | 1 Apfel, 2 Äpfel, 5 Äpfel
Russian | 3 | one (1), few (2-4), many (5+) | 1 яблоко, 2 яблока, 5 яблок
Arabic | 6 | zero (0), one (1), two (2), few (3-10), many (11-99), other (100+) | Complex rules

### D. Date/Time Formats

**Locale** | **Short Date** | **Long Date** | **Time**
---|---|---|---
en-US | 12/25/2025 | December 25, 2025 | 3:00 PM
es-419 | 25/12/2025 | 25 de diciembre de 2025 | 15:00
pt-BR | 25/12/2025 | 25 de dezembro de 2025 | 15:00
fr-FR | 25/12/2025 | 25 décembre 2025 | 15:00
de-DE | 25.12.2025 | 25. Dezember 2025 | 15:00
ja-JP | 2025/12/25 | 2025年12月25日 | 15:00
ko-KR | 2025. 12. 25. | 2025년 12월 25일 | 오후 3:00
zh-CN | 2025/12/25 | 2025年12月25日 | 15:00
ar-SA | ٢٥/١٢/٢٠٢٥ | ٢٥ ديسمبر ٢٠٢٥ | ١٥:٠٠

---

## Document Control

**Version History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-19 | Product Team | Initial strategy document |

**Approvals:**

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Product Manager | [Name] | YYYY-MM-DD | __________ |
| Engineering Lead | [Name] | YYYY-MM-DD | __________ |
| Finance (Budget) | [Name] | YYYY-MM-DD | __________ |
| Legal (Compliance) | [Name] | YYYY-MM-DD | __________ |

**Next Review:** 2026-01-19 (Monthly during implementation, Quarterly after launch)

---

**End of Document**
