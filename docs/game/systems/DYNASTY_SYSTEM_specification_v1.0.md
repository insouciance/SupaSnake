> **PARTIALLY SUPERSEDED (2026-07-18)** by [`docs/game/GAME_DESIGN_V2.md`](../GAME_DESIGN_V2.md).
> Design v2 removes every stat-bonus and generation-scaling mechanic specified here:
> the +5% dynasty stat bonuses (Core Decisions 1 & 3 and each dynasty's "Gameplay Stats"),
> generation stat scaling (breeding "Stats: Base stats + (generation × 5%)" and the
> `compute_effective_stats` generation multiplier), rarity base-stat differences, and the
> set-bonus **stat doubling** (the +10% DNA set bonus itself survives). In v2, a dynasty is
> a **ruleset** (distinct gameplay physics — see GAME_DESIGN_V2 §3) and generation is
> prestige plus a trait-slot unlock. Everything else in this document — art direction,
> visual identity, variant catalog, unlock costs (26,000 DNA per dynasty), breeding
> cadence, database art fields, Panini book UX — remains authoritative.

# Dynasty System Specification v1.0
## Production-Ready Design - LOCKED

**Version:** 1.0 FINAL
**Date:** 2025-10-14
**Status:** 🔒 LOCKED - Ready for Implementation
**Priority:** CRITICAL - UNBLOCKS v0.1 DEVELOPMENT

---

## Executive Summary

**DECISIONS LOCKED - NO CHANGES AFTER THIS POINT**

The Dynasty System is now fully specified and ready for implementation. All 7 critical questions have been answered, all dependent systems are unblocked, and art production can begin Week 3.

### Core Decisions

1. **What IS a Dynasty?** → **Direction 4: Visual Art Theme + 5% Stat Bonus**
   - Dynasty = Midjourney-generated 2D art aesthetic + minor gameplay bonus
   - Example: CYBER = Neon tech aesthetic + 5% speed bonus

2. **How Many Dynasties?** → **3 for v0.1 MVP, expand monthly to 15+ in Year 1**
   - v0.1 (Month 1-3): 3 dynasties (CYBER, PRIMAL, COSMIC)
   - Post-launch: +1 dynasty per month (sustainable with Midjourney)

3. **Gameplay Impact?** → **Yes, 5% stat bonuses (strategic but skill > dynasty)**
   - CYBER: +5% speed
   - PRIMAL: +5% DNA generation
   - COSMIC: +5% size

4. **Unlock Method?** → **Progressive unlock (start with 1, unlock others via DNA)**
   - Tutorial: Choose 1 starter dynasty
   - Early game: Unlock 2nd for 2,000 DNA (Day 3-5)
   - Mid game: Unlock 3rd for 3,000 DNA (Day 7-10)

5. **Dynasty Mutability?** → **Immutable (permanent identity)**
   - Gen 1 CYBER → Gen 2 CYBER → Gen 3 CYBER forever
   - No dynasty transformation (can add as premium feature in v0.5 if desired)

6. **Breeding Rules?** → **Same dynasty only (v0.1 simplicity)**
   - CYBER + CYBER = CYBER offspring (100% inheritance)
   - Can expand to cross-dynasty in v0.5 based on player feedback

7. **Set Bonuses?** → **Yes, +10% DNA income per complete dynasty (stacking)**
   - Complete all 10 CYBER variants = +10% DNA bonus (permanent)
   - Complete all 3 MVP dynasties = +30% DNA total
   - Dynasty stat bonus doubles when complete (CYBER +5% → +10% speed)

### Art Strategy: Option A (Simple 3D Snake)

**Panini Book Collection (70% of playtime):**
- **2048×2048px Midjourney art cards** (gorgeous, zoomable, hi-res)
- Digital Panini sticker book interface
- Full-screen art zoom with lore text
- This is where the beautiful art shines

**Snake Gameplay (30% of playtime):**
- **Simple 3D snake model** (clean, smooth, 60fps performance)
- Color scheme + subtle pattern matches dynasty
- NOT trying to replicate full art detail (that's for the Lab)
- Focused on gameplay smoothness, not art showcase

**Visual Consistency:**
- CYBER snake in gameplay: Neon blue/pink gradient, circuit-like pattern on body
- CYBER card in Lab: Stunning Midjourney art (cybernetic snake, holographic scales, neon effects)
- Players understand: Collection art is the reward, gameplay is functional

### Production Timeline

**Week 1-2 (NOW):** Dynasty Design Sprint ✅ COMPLETE
**Week 3:** Art production begins (Midjourney generation)
**Week 4-5:** Art production continues + 3D snake models
**Week 6:** Backend implementation (database schema)
**Week 7:** UI implementation (Panini book + dynasty filters)
**Week 8:** Integration, testing, balancing

**Total: 6 weeks to full Dynasty System implementation**

### What Gets Unblocked

✅ **Art Production:** 2-3 weeks for 30 variants (vs 20 weeks for 500)
✅ **Art Budget:** ~$120 Midjourney Pro (vs $58,000 for 3D pipeline)
✅ **Breeding System:** Design complete, same-dynasty-only rules locked
✅ **Collection Lab UI:** 3 dynasty filters, 30 variant slots
✅ **Set Bonus Tracking:** +10% DNA per dynasty complete
✅ **v0.1 Path B:** Collection + Breeding viable for MVP

---

## The 3 Starter Dynasties (v0.1 MVP)

### Dynasty 1: CYBER

**Core Concept:** "Born from electric storms, masters of digital precision"

**Visual Theme:**
- **Aesthetic:** Cyberpunk, neon tech, holographic, circuit patterns, digital
- **Color Palette:**
  - Primary: Electric cyan (#00FFFF, #00D4FF)
  - Secondary: Neon magenta (#FF00FF, #FF007F)
  - Accent: White highlights, blue glows
- **Patterns:** Circuit board traces, hexagonal scales, data streams, holographic shimmer
- **Materials:** Metallic, glossy, reflective, glowing edges
- **Accessories:** Cyber visors, antenna, LED strips, holographic auras

**Gameplay Stats:**
- **Stat Bonus:** +5% speed
- **Rationale:** Tech = speed, cyber snakes are fast and agile
- **Set Bonus:** Complete 10/10 CYBER variants → +10% DNA income + CYBER bonus becomes +10% speed (doubled)

**Midjourney Art Prompts (Template):**
```
"cybernetic snake, neon circuit patterns, holographic scales, electric cyan and magenta colors,
glowing LED edges, digital aesthetic, high-tech futuristic design, sleek metallic body,
data stream effects, cyberpunk style, dramatic lighting, 4K detailed, centered composition"
```

**Simple 3D Gameplay Appearance:**
- Base snake model: Cyan-to-magenta gradient body
- Pattern overlay: Subtle circuit board lines (low opacity, doesn't distract)
- Particle trail: Small cyan sparks when moving fast
- Death effect: Blue glitch pixels dissolve

**Lore Summary:**
"The CYBER dynasty emerged from the first digital consciousness. Born in electric storms and forged in server farms, these snakes navigate data streams with unmatched precision. They are the embodiment of speed and technological evolution, masters of the digital frontier."

**10 Variants (Common → Legendary):**

1. **CYBER SPARK** (Common, 500 DNA)
   - First light of digital awakening
   - Entry-level cyber aesthetic, simple circuit patterns

2. **CYBER PULSE** (Common, 500 DNA)
   - Rhythmic data flows through circuitry
   - Pulsing LED patterns, heartbeat of the network

3. **CYBER BLADE** (Common, 500 DNA)
   - Sharp, angular, precision design
   - Blade-like scales, cutting-edge tech

4. **CYBER NEXUS** (Uncommon, 1,000 DNA)
   - Connection point of infinite networks
   - Complex circuit nodes, interconnected patterns

5. **CYBER STORM** (Uncommon, 1,000 DNA)
   - Electric tempest of raw data
   - Lightning effects, storm cloud digital aura

6. **CYBER PHANTOM** (Uncommon, 1,500 DNA)
   - Ghostly presence in the digital realm
   - Semi-transparent, holographic shimmer

7. **CYBER VORTEX** (Rare, 2,000 DNA)
   - Spiral of pure digital energy
   - Swirling data streams, vortex center glow

8. **CYBER ZENITH** (Rare, 2,500 DNA)
   - Peak of technological achievement
   - Advanced circuitry, pristine chrome finish

9. **CYBER SINGULARITY** (Epic, 5,000 DNA)
   - The convergence of all digital consciousness
   - Black hole center, event horizon glow, ultimate tech

10. **CYBER OMEGA** (Legendary, 10,000 DNA)
    - The final evolution of cyber existence
    - Transcendent digital being, pure light and data
    - Ultimate CYBER variant, most prestigious

**Total CYBER Unlock Cost:** 500×3 + 1,000×2 + 1,500 + 2,000 + 2,500 + 5,000 + 10,000 = **26,000 DNA**

---

### Dynasty 2: PRIMAL

**Core Concept:** "Ancient guardians of nature, masters of organic evolution"

**Visual Theme:**
- **Aesthetic:** Organic, nature, vines, earth, bioluminescent, natural materials
- **Color Palette:**
  - Primary: Forest green (#2d5016, #4a7c32)
  - Secondary: Earth brown (#8b4513, #a0522d)
  - Accent: Moss green, bioluminescent blue-green glows
- **Patterns:** Vine tendrils, leaf scales, bark textures, root networks, organic growth
- **Materials:** Natural, matte, textured bark, living plant matter, soft glows
- **Accessories:** Flower blooms, thorny vines, wooden antlers, moss coverings

**Gameplay Stats:**
- **Stat Bonus:** +5% DNA generation
- **Rationale:** Nature = growth, primal snakes generate more resources
- **Set Bonus:** Complete 10/10 PRIMAL variants → +10% DNA income + PRIMAL bonus becomes +10% DNA generation (doubled)

**Midjourney Art Prompts (Template):**
```
"organic snake covered in vines and moss, natural earth tones, bioluminescent plant patterns,
forest green and brown colors, bark texture scales, living plants growing from body,
nature aesthetic, ancient guardian design, soft bioluminescent glow, root network details,
dramatic forest lighting, 4K detailed, centered composition"
```

**Simple 3D Gameplay Appearance:**
- Base snake model: Green-to-brown gradient body
- Pattern overlay: Subtle vine/leaf patterns (organic feel)
- Particle trail: Small green leaves drift behind when moving
- Death effect: Vines dissolve into petals

**Lore Summary:**
"The PRIMAL dynasty is as old as the forests themselves. Born from the first seed and nurtured by ancient earth, these snakes are living embodiments of nature's power. They grow stronger with each generation, their bodies intertwined with vines and glowing with the life force of the natural world."

**10 Variants (Common → Legendary):**

1. **PRIMAL SEED** (Common, 500 DNA)
   - The first sprout of life
   - Simple vine patterns, young growth aesthetic

2. **PRIMAL VINE** (Common, 500 DNA)
   - Winding tendrils of organic power
   - Vine-covered body, growing leaves

3. **PRIMAL ROOT** (Common, 500 DNA)
   - Deep earth connection
   - Root-like scales, earthy textures

4. **PRIMAL BLOOM** (Uncommon, 1,000 DNA)
   - Flowering expression of natural beauty
   - Flower blooms along body, petal scales

5. **PRIMAL THORN** (Uncommon, 1,000 DNA)
   - Nature's defensive power
   - Thorny vines, protective spike patterns

6. **PRIMAL GROVE** (Uncommon, 1,500 DNA)
   - Living forest embodied
   - Multiple plant types, full ecosystem

7. **PRIMAL VERDANT** (Rare, 2,000 DNA)
   - Lush green perfection
   - Dense foliage, rich vegetation, vibrant life

8. **PRIMAL ANCIENT** (Rare, 2,500 DNA)
   - Wisdom of the old forest
   - Gnarled wood, ancient bark, moss-covered

9. **PRIMAL COLOSSUS** (Epic, 5,000 DNA)
   - Massive nature titan
   - Tree trunk scales, forest giant aesthetic

10. **PRIMAL TITAN** (Legendary, 10,000 DNA)
    - The eternal force of nature itself
    - Living world tree, ultimate organic power
    - Ultimate PRIMAL variant, most prestigious

**Total PRIMAL Unlock Cost:** 26,000 DNA (same as CYBER, balanced)

---

### Dynasty 3: COSMIC

**Core Concept:** "Born from collapsing stars, masters of celestial energy"

**Visual Theme:**
- **Aesthetic:** Space, nebula, stars, celestial, cosmic energy, deep space
- **Color Palette:**
  - Primary: Deep purple (#4a0e4e, #6a1b9a)
  - Secondary: Cosmic gold (#ffd700, #ffb300)
  - Accent: Star white, nebula pink/blue, galaxy swirls
- **Patterns:** Nebula clouds, star clusters, galaxy spirals, cosmic dust, constellation maps
- **Materials:** Ethereal, glowing, translucent, starlight shimmer, cosmic void
- **Accessories:** Star crowns, nebula auras, comet tails, orbital rings

**Gameplay Stats:**
- **Stat Bonus:** +5% size
- **Rationale:** Cosmic = expansive, cosmic snakes are larger and more imposing
- **Set Bonus:** Complete 10/10 COSMIC variants → +10% DNA income + COSMIC bonus becomes +10% size (doubled)

**Midjourney Art Prompts (Template):**
```
"cosmic snake with nebula patterns, deep purple and gold colors, star clusters on scales,
galaxy swirl designs, celestial energy glow, space aesthetic, stardust particles,
constellation markings, ethereal translucent body, cosmic void background,
dramatic space lighting, 4K detailed, centered composition"
```

**Simple 3D Gameplay Appearance:**
- Base snake model: Purple-to-gold gradient body
- Pattern overlay: Subtle star sparkles (glittering effect)
- Particle trail: Small golden stardust particles drift behind
- Death effect: Explodes into star particles (supernova)

**Lore Summary:**
"The COSMIC dynasty was born from the collapse of dying stars. Forged in the heart of black holes and bathed in nebula light, these snakes are fragments of the universe itself. They carry the weight of galaxies on their scales and shine with the light of distant suns, eternal wanderers of the cosmic void."

**10 Variants (Common → Legendary):**

1. **COSMIC SPARK** (Common, 500 DNA)
   - The first light of a new star
   - Simple star patterns, nascent cosmic energy

2. **COSMIC NOVA** (Common, 500 DNA)
   - Explosive birth of celestial power
   - Bright bursts, nova star effects

3. **COSMIC NEBULA** (Common, 500 DNA)
   - Clouds of cosmic dust and gas
   - Nebula swirls, soft cloud patterns

4. **COSMIC ORBIT** (Uncommon, 1,000 DNA)
   - Circular dance of planetary motion
   - Orbital ring designs, planet-like scales

5. **COSMIC PULSAR** (Uncommon, 1,000 DNA)
   - Rhythmic pulse of distant stars
   - Pulsing light effects, beacon-like glow

6. **COSMIC AURORA** (Uncommon, 1,500 DNA)
   - Dancing lights of celestial phenomena
   - Aurora borealis patterns, flowing colors

7. **COSMIC GALAXY** (Rare, 2,000 DNA)
   - Entire galaxy embodied
   - Spiral galaxy pattern, billions of stars

8. **COSMIC VOID** (Rare, 2,500 DNA)
   - The emptiness between stars
   - Black hole aesthetic, event horizon glow

9. **COSMIC SUPERNOVA** (Epic, 5,000 DNA)
   - The explosive death of massive stars
   - Explosive energy, supernova remnant patterns

10. **COSMIC SINGULARITY** (Legendary, 10,000 DNA)
    - The point where all universes converge
    - Ultimate cosmic power, transcendent energy
    - Ultimate COSMIC variant, most prestigious

**Total COSMIC Unlock Cost:** 26,000 DNA (balanced with CYBER and PRIMAL)

---

## Complete Variant Summary (30 Variants for v0.1 MVP)

| Dynasty | Common (500) | Common (500) | Common (500) | Uncommon (1k) | Uncommon (1k) | Uncommon (1.5k) | Rare (2k) | Rare (2.5k) | Epic (5k) | Legendary (10k) |
|---------|--------------|--------------|--------------|---------------|---------------|-----------------|-----------|-------------|-----------|-----------------|
| **CYBER** | Spark | Pulse | Blade | Nexus | Storm | Phantom | Vortex | Zenith | Singularity | Omega |
| **PRIMAL** | Seed | Vine | Root | Bloom | Thorn | Grove | Verdant | Ancient | Colossus | Titan |
| **COSMIC** | Spark | Nova | Nebula | Orbit | Pulsar | Aurora | Galaxy | Void | Supernova | Singularity |

**Rarity Distribution:**
- **Common:** 9 variants × 500 DNA = 4,500 DNA
- **Uncommon:** 9 variants × 1,000-1,500 DNA = 10,500 DNA
- **Rare:** 6 variants × 2,000-2,500 DNA = 13,500 DNA
- **Epic:** 3 variants × 5,000 DNA = 15,000 DNA
- **Legendary:** 3 variants × 10,000 DNA = 30,000 DNA

**Total DNA to unlock all 30 variants: 78,000 DNA**

**Progression Validation:**
- Day 30 target: 20+ variants
- Average player earns: 800 DNA/day × 30 = 24,000 DNA
- Can unlock: ~20-22 variants (target hit ✅)
- Expert player earns: 1,200 DNA/day × 30 = 36,000 DNA
- Can unlock: ~28-30 variants (nearly complete collection)

---

## Art Production Pipeline

### Phase 1: Midjourney Art Generation (Week 3-4)

**Tools:**
- Midjourney Pro subscription ($60/month, unlimited fast generations)
- Upscaling: Midjourney's native upscaler (4K resolution)
- Export format: PNG, 2048×2048px

**Process per Dynasty (10 variants):**

**Day 1-2: Concept Exploration**
- Generate 50-100 Midjourney variations per dynasty theme
- Test different prompts, styles, compositions
- Example prompt evolution:
  - Base: "cybernetic snake, neon colors"
  - Refined: "cybernetic snake, neon circuit patterns, holographic scales, electric cyan and magenta, glowing LED edges, digital aesthetic, 4K"
  - Final: Add "centered composition, dramatic lighting, sleek metallic body, data stream effects"
- Select best 15-20 candidates

**Day 3-4: Variant Differentiation**
- For each of 10 variants, generate 5-10 iterations
- Ensure visual distinction:
  - CYBER SPARK: Simple circuit lines, minimal glow
  - CYBER OMEGA: Complex circuits, maximum glow, transcendent design
- Adjust prompts for rarity progression (Common → Legendary = simple → complex)

**Day 5-6: Final Selection & Upscaling**
- Choose 1 final image per variant (10 total per dynasty)
- Upscale to 2048×2048px using Midjourney upscaler
- Export as PNG (lossless, supports transparency if needed)
- File naming: `CYBER_SPARK_001.png`, `CYBER_OMEGA_010.png`

**Day 7: Quality Review**
- View all 10 variants side-by-side
- Check visual progression (Common → Legendary should be obvious)
- Ensure color palette consistency
- Verify no duplicates or too-similar designs

**Timeline per Dynasty:** 7 days
**Timeline for 3 Dynasties:** 14-21 days (can parallelize some work)

**Cost:**
- Midjourney Pro: $60/month × 2 months (for revisions) = $120 total
- **vs $58,000 for 3D art pipeline = 99.8% cost savings**

---

### Phase 2: Simple 3D Snake Models (Week 4-5)

**Tools:**
- Blender (free, open-source 3D modeling)
- Export: GLTF/GLB format (Three.js compatible)

**Base Model (Reusable):**
- Generic snake model: Smooth curves, segmented body (20-30 segments), tapered tail
- UV unwrapped for texture mapping
- Simple rig: Forward movement, turning (no complex animation needed)
- File size target: <500KB per model

**Dynasty Customization (Color + Pattern Texture):**

**CYBER Snake:**
- Base color: Cyan (#00FFFF) to magenta (#FF00FF) gradient shader
- Pattern texture: Circuit board overlay (subtle, 30% opacity)
- Material: Glossy, metallic shader (reflects environment)
- Particle system: Small cyan sparks emit when moving

**PRIMAL Snake:**
- Base color: Forest green (#2d5016) to brown (#8b4513) gradient shader
- Pattern texture: Vine/leaf overlay (organic, 40% opacity)
- Material: Matte, bark-like shader (rough, natural)
- Particle system: Green leaves drift behind when moving

**COSMIC Snake:**
- Base color: Deep purple (#4a0e4e) to gold (#ffd700) gradient shader
- Pattern texture: Star sparkle overlay (glittering, 50% opacity)
- Material: Semi-translucent shader (ethereal glow)
- Particle system: Golden stardust particles trail behind

**Implementation:**
- Create base snake model (2 days)
- Create 3 dynasty shader variants (1 day each = 3 days)
- Create 3 particle systems (1 day)
- Export to GLTF, integrate into Three.js (1 day)
- **Total: 7 days**

**No Need for 30 Separate Models:**
- Use 1 base model + 3 shader/texture variants
- Runtime: Swap shaders based on equipped dynasty
- Result: Tiny file size, instant dynasty switching

---

### Phase 3: Lore Writing (Week 3-4, Parallel)

**Per Variant (30 total):**
- **Lore Snippet:** 1-2 sentences, evocative, mysterious
- **Example (CYBER BLADE):** "Forged in digital fire and tempered by data streams, CYBER BLADE strikes with the precision of a thousand calculations. Its edges cut through the fabric of reality itself."

**Writer:** Can be AI-assisted (GPT-4, Claude) with human editing
- Generate 3-5 lore options per variant
- Select best, polish tone
- Ensure consistency within dynasty

**Timeline:** 1-2 hours per dynasty (10 variants) = 6 hours total

---

### Art Production Summary

| Phase | Duration | Cost | Deliverables |
|-------|----------|------|--------------|
| Midjourney art (30 variants) | 2-3 weeks | $120 | 30 × 2048px PNG files |
| Simple 3D snakes (3 shaders) | 1 week | $0 (Blender free) | 1 base model + 3 GLTF variants |
| Lore writing (30 snippets) | 6 hours | $0 (AI-assisted) | 30 lore texts |
| **TOTAL** | **3-4 weeks** | **~$120** | **Production-ready art** |

**Compare to Original Plan:**
- Original: 500 3D snake models, $58,000, 20 weeks
- Dynasty System: 30 2D art cards + 3 shader variants, $120, 3 weeks
- **Savings: $57,880 and 17 weeks** 🎉

---

## Database Schema (Expandable Design)

### Tables

```sql
-- dynasties table (add 1 row per new dynasty)
CREATE TABLE dynasties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE, -- "CYBER", "PRIMAL", "COSMIC", "SHADOW"...
  display_name TEXT NOT NULL, -- "Cyber Dynasty"
  description TEXT, -- "Born from electric storms..."
  color_primary TEXT NOT NULL, -- "#00FFFF" (hex color for UI theming)
  color_secondary TEXT NOT NULL, -- "#FF00FF"
  stat_bonus_type TEXT NOT NULL, -- "speed", "dna_generation", "size", "evolution_speed", "breeding_success"
  stat_bonus_value FLOAT NOT NULL DEFAULT 0.05, -- 0.05 = 5%
  release_date TIMESTAMP DEFAULT NOW(),
  sort_order INT NOT NULL, -- Display order in UI (1, 2, 3...)
  is_active BOOLEAN DEFAULT true, -- Can disable old dynasties if needed
  art_style_guide_url TEXT, -- Link to Dynasty Style Guide PDF/doc
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert 3 MVP dynasties
INSERT INTO dynasties (name, display_name, description, color_primary, color_secondary, stat_bonus_type, sort_order) VALUES
('CYBER', 'Cyber Dynasty', 'Born from electric storms, masters of digital precision', '#00FFFF', '#FF00FF', 'speed', 1),
('PRIMAL', 'Primal Dynasty', 'Ancient guardians of nature, masters of organic evolution', '#2d5016', '#8b4513', 'dna_generation', 2),
('COSMIC', 'Cosmic Dynasty', 'Born from collapsing stars, masters of celestial energy', '#4a0e4e', '#ffd700', 'size', 3);

-- snake_variants table (add 10 rows per new dynasty)
CREATE TABLE snake_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dynasty_id UUID REFERENCES dynasties(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- "CYBER BLADE", "PRIMAL SEED"
  rarity TEXT NOT NULL, -- "common", "uncommon", "rare", "epic", "legendary"
  art_url TEXT NOT NULL, -- Supabase Storage URL: "dynasties/cyber/CYBER_BLADE_001.png"
  lore_text TEXT, -- "Forged in digital fire..."
  base_stats JSONB, -- {"speed": 10, "size": 5, "hp": 100} (base before generation scaling)
  unlock_cost_dna INT NOT NULL, -- 500, 1000, 2000, 5000, 10000
  sort_order INT NOT NULL, -- Order within dynasty (1-10)
  release_date TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(dynasty_id, name)
);

-- Example insert (CYBER BLADE)
INSERT INTO snake_variants (dynasty_id, name, rarity, art_url, lore_text, base_stats, unlock_cost_dna, sort_order) VALUES
((SELECT id FROM dynasties WHERE name = 'CYBER'),
 'CYBER BLADE',
 'common',
 'https://[supabase-project].supabase.co/storage/v1/object/public/dynasties/cyber/CYBER_BLADE_001.png',
 'Forged in digital fire and tempered by data streams, CYBER BLADE strikes with precision.',
 '{"speed": 10, "size": 5, "hp": 100}'::jsonb,
 500,
 3);

-- player_collection table (tracks ownership)
CREATE TABLE player_collection (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES snake_variants(id) ON DELETE CASCADE,
  generation INT DEFAULT 1, -- Gen 1, Gen 2, Gen 3...
  parent1_id UUID REFERENCES player_collection(id), -- NULL if unlocked (not bred)
  parent2_id UUID REFERENCES player_collection(id), -- NULL if unlocked (not bred)
  acquired_at TIMESTAMP DEFAULT NOW(),
  is_favorited BOOLEAN DEFAULT false,
  UNIQUE(user_id, variant_id, generation) -- Can have same variant at different generations
);

-- dynasty_unlocks table (tracks which dynasties player has unlocked)
CREATE TABLE dynasty_unlocks (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  dynasty_id UUID REFERENCES dynasties(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMP DEFAULT NOW(),
  unlock_method TEXT, -- "tutorial_choice", "dna_purchase", "promo"
  PRIMARY KEY (user_id, dynasty_id)
);

-- set_bonuses table (tracks dynasty completion bonuses)
CREATE TABLE set_bonuses (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  dynasty_id UUID REFERENCES dynasties(id) ON DELETE CASCADE,
  completed_at TIMESTAMP DEFAULT NOW(),
  bonus_dna_percent FLOAT DEFAULT 0.10, -- +10% DNA income
  bonus_stat_multiplier FLOAT DEFAULT 2.0, -- Dynasty stat bonus × 2
  PRIMARY KEY (user_id, dynasty_id)
);
```

### Indexes for Performance

```sql
-- Fast lookups
CREATE INDEX idx_variants_dynasty ON snake_variants(dynasty_id);
CREATE INDEX idx_variants_rarity ON snake_variants(rarity);
CREATE INDEX idx_collection_user ON player_collection(user_id);
CREATE INDEX idx_collection_variant ON player_collection(variant_id);
CREATE INDEX idx_unlocks_user ON dynasty_unlocks(user_id);
```

### Row Level Security (RLS)

```sql
-- Players can only see their own collection
ALTER TABLE player_collection ENABLE ROW LEVEL SECURITY;
CREATE POLICY collection_own_data ON player_collection
  FOR SELECT USING (auth.uid() = user_id);

-- Players can only see their own unlocks
ALTER TABLE dynasty_unlocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY unlocks_own_data ON dynasty_unlocks
  FOR SELECT USING (auth.uid() = user_id);

-- Players can only see their own bonuses
ALTER TABLE set_bonuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY bonuses_own_data ON set_bonuses
  FOR SELECT USING (auth.uid() = user_id);

-- Everyone can read dynasties and variants (public catalog)
ALTER TABLE dynasties ENABLE ROW LEVEL SECURITY;
CREATE POLICY dynasties_read_all ON dynasties FOR SELECT TO authenticated USING (true);

ALTER TABLE snake_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY variants_read_all ON snake_variants FOR SELECT TO authenticated USING (true);
```

---

## UI/UX Design

### Lab: Panini Book Interface (70% of playtime)

**Landing Screen (Main Lab):**
```
┌─────────────────────────────────────────────────┐
│  SupaSnake Lab                           🔋 85  │
│                                         💎 2,450 │
├─────────────────────────────────────────────────┤
│                                                 │
│   [Dynasty Tabs]                                │
│   ┌──────┬──────┬──────┐                       │
│   │CYBER │PRIMAL│COSMIC│ ← Swipe to switch     │
│   └──────┴──────┴──────┘                       │
│                                                 │
│   Collection Progress: 18/30 (60%) [🏆60%]     │
│                                                 │
│   ┌─────────────────────────────────────────┐  │
│   │  [Variant Grid - CYBER Dynasty]         │  │
│   │                                         │  │
│   │  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐  │  │
│   │  │ ✅ │ │ ✅ │ │ 🔒 │ │ 🔒 │ │ 🔒 │  │  │
│   │  │SPARK│ │PULSE│ │BLADE│ │NEXUS│ │STORM│  │  │
│   │  │ C  │ │ C  │ │ C  │ │ UC │ │ UC │  │  │
│   │  └────┘ └────┘ └────┘ └────┘ └────┘  │  │
│   │   500    500    500    1k     1k      │  │
│   │                                         │  │
│   │  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐  │  │
│   │  │ 🔒 │ │ 🔒 │ │ 🔒 │ │ 🔒 │ │ 🔒 │  │  │
│   │  │PHANT│ │VORTX│ │ZENTH│ │SINGU│ │OMEGA│  │  │
│   │  │ UC │ │ R  │ │ R  │ │ E  │ │ L  │  │  │
│   │  └────┘ └────┘ └────┘ └────┘ └────┘  │  │
│   │  1.5k   2k     2.5k    5k     10k     │  │
│   └─────────────────────────────────────────┘  │
│                                                 │
│   Set Bonus: 2/10 Complete                     │
│   Unlock 8 more for +10% DNA Income            │
│                                                 │
│   [🎮 Play Snake]  [⚗️ Breed]  [📊 Stats]      │
└─────────────────────────────────────────────────┘

Legend:
✅ = Unlocked (tappable for full view)
🔒 = Locked (tappable for unlock dialog)
C = Common, UC = Uncommon, R = Rare, E = Epic, L = Legendary
```

**Tap Unlocked Variant → Full-Screen Art View:**
```
┌─────────────────────────────────────────────────┐
│  [← Back]                         CYBER SPARK  │
├─────────────────────────────────────────────────┤
│                                                 │
│          ┌─────────────────────────┐           │
│          │                         │           │
│          │   [GORGEOUS MIDJOURNEY  │           │
│          │    ART - FULL SCREEN]   │           │
│          │                         │           │
│          │   CYBER SPARK           │           │
│          │   Neon cyan snake       │           │
│          │   with circuit patterns │           │
│          │                         │           │
│          └─────────────────────────┘           │
│                                                 │
│   "The first light of digital awakening.       │
│    CYBER SPARK embodies the nascent energy     │
│    of a consciousness being born."             │
│                                                 │
│   Rarity: Common                                │
│   Dynasty: CYBER (+5% speed)                    │
│   Base Stats: Speed 10, Size 5, HP 100         │
│                                                 │
│   Generation: 1  (You have Gen 1, Gen 2)       │
│                                                 │
│   [⚡ Equip] [⚗️ Breed] [❤️ Favorite]          │
└─────────────────────────────────────────────────┘
```

**Tap Locked Variant → Unlock Dialog:**
```
┌─────────────────────────────────────────────────┐
│              Unlock CYBER BLADE?                │
├─────────────────────────────────────────────────┤
│                                                 │
│   ┌─────────────────────┐                      │
│   │  [PREVIEW ART]      │  ← Slightly dimmed   │
│   │   (Blurred or       │     or blurred       │
│   │    silhouette)      │                      │
│   └─────────────────────┘                      │
│                                                 │
│   "Forged in digital fire, strikes with        │
│    precision..."                                │
│                                                 │
│   Rarity: Common                                │
│   Cost: 500 DNA                                 │
│   Your DNA: 2,450 💎                            │
│                                                 │
│   [✅ Unlock for 500 DNA] [❌ Cancel]           │
└─────────────────────────────────────────────────┘
```

**Dynasty Tab Switch (Swipe Left/Right):**
- Swipe right: CYBER → PRIMAL → COSMIC → (wrap to CYBER)
- Smooth transition animation (slide + fade)
- Dynasty color theme changes entire UI:
  - CYBER: Cyan/magenta accents
  - PRIMAL: Green/brown accents
  - COSMIC: Purple/gold accents

---

### Snake Gameplay Interface (30% of playtime)

**Pre-Game Splash Screen (3-5 seconds):**
```
┌─────────────────────────────────────────────────┐
│                                                 │
│          ┌─────────────────────────┐           │
│          │   [EQUIPPED SNAKE ART]  │           │
│          │                         │           │
│          │   CYBER BLADE           │           │
│          │   Gen 2                 │           │
│          │                         │           │
│          └─────────────────────────┘           │
│                                                 │
│   "Forged in digital fire, strikes with        │
│    precision..."                                │
│                                                 │
│         [ Press to Play ]                       │
│                                                 │
│   Dynasty: CYBER (+5% speed bonus)              │
│   Stats: Speed 11, Size 5, HP 105              │
│                                                 │
│            Loading Snake...                     │
└─────────────────────────────────────────────────┘
```

**During Gameplay (Simple 3D Snake):**
```
┌─────────────────────────────────────────────────┐
│  Score: 125        Time: 3:24      Energy: 4/5  │
├─────────────────────────────────────────────────┤
│                                                 │
│                    [Food]                       │
│                                                 │
│        🐍 ← CYBER BLADE (Simple 3D)             │
│           (Cyan/magenta gradient, circuit       │
│            pattern, moves smoothly at 60fps)    │
│                                                 │
│                                                 │
│                                                 │
│                                                 │
│                                                 │
│                    [Food]                       │
│                                                 │
│  [Mini Card]                                    │
│  ┌────┐ CYBER BLADE Gen 2                      │
│  │Art │                                         │
│  └────┘                                         │
└─────────────────────────────────────────────────┘
```

**Post-Game Results Screen:**
```
┌─────────────────────────────────────────────────┐
│              Run Complete!                      │
├─────────────────────────────────────────────────┤
│                                                 │
│          ┌─────────────────────────┐           │
│          │   [CYBER BLADE ART]     │           │
│          │   Gen 2                 │           │
│          └─────────────────────────┘           │
│                                                 │
│   Score: 125 (Personal Best: 180)              │
│   Time: 3:24                                    │
│   Food Eaten: 25                                │
│                                                 │
│   DNA Earned: 150 💎  (+7 from speed bonus)    │
│   Total DNA: 2,600 💎                           │
│                                                 │
│   [🔁 Play Again (4/5 Energy)] [🏠 Back to Lab] │
└─────────────────────────────────────────────────┘
```

---

## Breeding & Set Bonus Systems

### Breeding Rules (Same Dynasty Only for v0.1)

**Requirements:**
1. **Both parents must be same dynasty** (CYBER + CYBER, not CYBER + PRIMAL)
2. **DNA cost:** 200 DNA base + (avg_parent_generation × 100)
   - Gen 1 + Gen 1 → Gen 2: 200 DNA
   - Gen 2 + Gen 2 → Gen 3: 400 DNA
   - Gen 5 + Gen 5 → Gen 6: 1,000 DNA
3. **Breeding timer:** Instant for v0.1 MVP (30 seconds in original design, instant for better UX)
4. **Both parents must be owned by player**

**Offspring Rules:**
1. **Dynasty:** 100% inheritance (CYBER + CYBER = CYBER, always)
2. **Generation:** max(parent1_gen, parent2_gen) + 1
   - Gen 1 + Gen 1 → Gen 2
   - Gen 2 + Gen 5 → Gen 6
3. **Variant:** Random selection from parent dynasty (50% parent1 variant, 50% parent2 variant)
   - CYBER SPARK + CYBER BLADE → 50% CYBER SPARK Gen 2, 50% CYBER BLADE Gen 2
4. **Stats:** Base stats + (generation × 5%)
   - Gen 1 base: Speed 10
   - Gen 2: Speed 10.5 (+5%)
   - Gen 5: Speed 12.5 (+25%)
   - Gen 10: Speed 15 (+50%)

**Breeding UI Flow:**
```
Lab → Breed Tab → Select Parent 1 → Select Parent 2 → Pay DNA → Instant Offspring Reveal → Add to Collection
```

**Breeding Animation (Instant for v0.1):**
1. Parent 1 and Parent 2 art cards float to center of screen
2. Cards merge together with particle effects (dynasty-themed: cyan sparks for CYBER, green leaves for PRIMAL, gold stars for COSMIC)
3. Flash of light
4. Offspring card appears (Gen 2, Gen 3, etc.)
5. Celebration confetti if offspring is new variant
6. "Added to Collection" confirmation

---

### Set Bonus System

**Set Definition:** Complete all 10 variants within a single dynasty

**Bonuses per Complete Dynasty:**
1. **+10% DNA income** (permanent, stacking)
   - Complete CYBER: +10% DNA
   - Complete PRIMAL: +20% DNA total (10% + 10%)
   - Complete COSMIC: +30% DNA total (10% + 10% + 10%)
2. **Dynasty stat bonus doubles**
   - CYBER base: +5% speed
   - CYBER complete: +10% speed
3. **Visual reward:** Gold border on dynasty tab, trophy icon

**Progress Tracking:**
```
┌─────────────────────────────────────────────────┐
│  CYBER Dynasty: 6/10 Complete (60%)             │
│                                                 │
│  [✅✅✅🔒🔒🔒🔒🔒🔒🔒]                             │
│                                                 │
│  Unlocked: Spark, Pulse, Blade, Nexus, Storm,  │
│            Phantom                              │
│  Remaining: Vortex, Zenith, Singularity, Omega │
│                                                 │
│  Set Bonus (when 10/10):                        │
│  • +10% DNA Income (permanent)                  │
│  • CYBER speed bonus: +5% → +10% (doubled)      │
│                                                 │
│  Total DNA Needed: 8,500 💎                     │
│  (Vortex 2k + Zenith 2.5k + Singularity 5k      │
│   + Omega 10k = 19.5k, already have 11k)       │
└─────────────────────────────────────────────────┘
```

**Set Completion Celebration:**
1. All 10 variant cards animate into a circle
2. Golden light radiates from center
3. "CYBER DYNASTY COMPLETE!" text appears
4. Trophy icon unlocks
5. "+10% DNA Income" bonus displays
6. "CYBER Speed Bonus: +10%" displays
7. Confetti + sound effect

**Database Trigger (Auto-Grant Bonus):**
```sql
-- Function to check and grant set bonuses
CREATE OR REPLACE FUNCTION check_set_bonus()
RETURNS TRIGGER AS $$
BEGIN
  -- Count how many variants player has in this dynasty
  WITH variant_count AS (
    SELECT
      sv.dynasty_id,
      COUNT(DISTINCT sv.id) as owned_count,
      (SELECT COUNT(*) FROM snake_variants WHERE dynasty_id = sv.dynasty_id) as total_count
    FROM player_collection pc
    JOIN snake_variants sv ON pc.variant_id = sv.id
    WHERE pc.user_id = NEW.user_id
    GROUP BY sv.dynasty_id
  )
  -- If owned_count = total_count, grant set bonus
  INSERT INTO set_bonuses (user_id, dynasty_id)
  SELECT NEW.user_id, vc.dynasty_id
  FROM variant_count vc
  WHERE vc.owned_count = vc.total_count
  ON CONFLICT (user_id, dynasty_id) DO NOTHING; -- Already granted

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on collection insert
CREATE TRIGGER check_set_bonus_trigger
AFTER INSERT ON player_collection
FOR EACH ROW EXECUTE FUNCTION check_set_bonus();
```

---

## Implementation Roadmap

### Week 6: Backend (5 days)

**Day 1-2: Database Schema**
- Create `dynasties`, `snake_variants`, `player_collection`, `dynasty_unlocks`, `set_bonuses` tables
- Add indexes and RLS policies
- Seed 3 dynasties (CYBER, PRIMAL, COSMIC) and 30 variants
- Test queries (ensure <50ms response time)

**Day 3: Supabase Storage Setup**
- Create `dynasties` bucket (public read)
- Upload 30 Midjourney PNG files (organized: `cyber/`, `primal/`, `cosmic/`)
- Generate CDN URLs, update `snake_variants.art_url` column

**Day 4: API Endpoints (Supabase Functions)**
- `GET /dynasties` - List all dynasties
- `GET /dynasties/:id/variants` - List variants in dynasty
- `POST /collection/unlock` - Unlock variant (deduct DNA, add to collection)
- `POST /collection/breed` - Breed 2 snakes (validate, create offspring)
- `GET /collection/:userId` - Get player's collection
- Test all endpoints with Postman

**Day 5: Set Bonus Logic**
- Implement `check_set_bonus()` function and trigger
- Test: Unlock 10th CYBER variant → verify bonus auto-granted
- Test: Apply +10% DNA income to gameplay rewards

---

### Week 7: Lab UI (5 days)

**Day 1: Panini Book Layout**
- React Native component structure:
  - `DynastyTabs.tsx` - Tab navigation (CYBER, PRIMAL, COSMIC)
  - `VariantGrid.tsx` - 10 variant cards per dynasty
  - `VariantCard.tsx` - Single card (locked/unlocked states)
- Basic layout (no art yet, placeholder images)

**Day 2: Dynasty Filtering**
- Implement swipe gesture to switch dynasties
- Dynasty color theming (change accent colors based on active dynasty)
- Progress tracking UI (6/10 Complete, progress ring)

**Day 3: Full-Screen Art View**
- Tap unlocked variant → full-screen modal
- Display Midjourney art (2048px PNG, pinch-to-zoom)
- Lore text, stats, rarity, generation info
- "Equip", "Breed", "Favorite" buttons

**Day 4: Unlock Flow**
- Tap locked variant → unlock dialog
- Show preview art (slightly dimmed)
- DNA cost, current DNA balance
- "Unlock for X DNA" button → deduct DNA, add to collection → celebration animation

**Day 5: Polish & Testing**
- Smooth transitions, animations
- Loading states (skeleton screens while fetching)
- Error handling (insufficient DNA, network errors)
- Test on iOS and Android devices

---

### Week 8: Breeding UI (3 days)

**Day 1: Parent Selection**
- Breed tab in Lab
- "Select Parent 1" → show player's collection (filtered by dynasty)
- "Select Parent 2" → show valid breeding partners (same dynasty only)
- Display DNA cost (calculated based on parent generations)

**Day 2: Breeding Animation**
- Parent cards float to center
- Particle effects (dynasty-themed)
- Offspring card reveal (instant for v0.1)
- Add to collection confirmation

**Day 3: Breeding History**
- View past breedings
- See offspring lineage (parent1, parent2 → offspring)
- Generation tree visualization (simple, not complex family tree)

---

### Week 9: Simple 3D Snake Integration (5 days)

**Day 1-2: Base 3D Snake Model**
- Create generic snake in Blender (20-30 segments, smooth curves)
- UV unwrap for textures
- Export as GLTF, integrate into Three.js scene

**Day 3: Dynasty Shaders**
- CYBER shader: Cyan/magenta gradient, circuit pattern texture, glossy material
- PRIMAL shader: Green/brown gradient, vine pattern texture, matte material
- COSMIC shader: Purple/gold gradient, star sparkle texture, semi-translucent material

**Day 4: Particle Systems**
- CYBER: Cyan sparks emit when moving
- PRIMAL: Green leaves drift behind
- COSMIC: Golden stardust trail

**Day 5: Runtime Dynasty Switching**
- Load equipped dynasty from player profile
- Apply correct shader + particle system
- Test switching between dynasties (should be instant, no lag)

---

### Week 10: Testing & Balancing (5 days)

**Day 1-2: Integration Testing**
- Full flow: Unlock variant → equip → play Snake → earn DNA → breed → new offspring
- Test all 3 dynasties
- Test on multiple devices (iOS, Android, different screen sizes)

**Day 3: Balance Tuning**
- Verify DNA costs feel fair (not too easy, not too grindy)
- Verify 5% stat bonuses are noticeable but not overpowered
- Simulate Day 30 progression: Can average player reach 20+ variants? (target: yes)

**Day 4: Set Bonus Testing**
- Unlock all 10 CYBER variants → verify +10% DNA income applied
- Test stacking (CYBER + PRIMAL = +20% DNA total)
- Verify dynasty stat bonus doubles (CYBER +5% → +10% speed)

**Day 5: Bug Fixes & Polish**
- Fix any issues found in testing
- Performance optimization (ensure 60fps with 3D snake)
- Final QA pass

---

### Implementation Timeline Summary

| Week | Focus | Deliverables |
|------|-------|--------------|
| **Week 6** | Backend | Database schema, Supabase storage, API endpoints, set bonus logic |
| **Week 7** | Lab UI | Panini book, dynasty tabs, variant grid, full-screen art view, unlock flow |
| **Week 8** | Breeding | Parent selection, breeding animation, offspring creation |
| **Week 9** | 3D Snake | Base model, 3 dynasty shaders, particle systems, runtime switching |
| **Week 10** | Testing | Integration tests, balance tuning, bug fixes, polish |

**Total: 5 weeks from start of implementation to Dynasty System complete**

(Note: Art production happens in parallel during Weeks 3-5, before implementation starts)

---

## Monthly Expansion Playbook

**Goal:** Add +1 new dynasty per month post-launch (sustainable cadence)

### Process (7-Day Cycle)

**Day 1-2: Art Production (Midjourney)**
- Generate 50-100 concepts for new dynasty theme
- Example: "SHADOW Dynasty - dark, ethereal, wispy effects, monochrome black/purple"
- Select best 15-20 candidates
- Generate 10 final variants (Common → Legendary)
- Upscale to 2048×2048px PNG
- Export files: `SHADOW_UMBRA_001.png`, `SHADOW_VOID_002.png`, ..., `SHADOW_ECLIPSE_010.png`

**Day 3: Database Insert**
```sql
-- Insert new dynasty
INSERT INTO dynasties (name, display_name, description, color_primary, color_secondary, stat_bonus_type, sort_order) VALUES
('SHADOW', 'Shadow Dynasty', 'Born from darkness, masters of stealth', '#1a1a2e', '#16213e', 'evolution_speed', 4);

-- Insert 10 variants
INSERT INTO snake_variants (dynasty_id, name, rarity, art_url, lore_text, unlock_cost_dna, sort_order) VALUES
((SELECT id FROM dynasties WHERE name = 'SHADOW'), 'SHADOW UMBRA', 'common', 'https://.../SHADOW_UMBRA_001.png', 'Born from twilight...', 500, 1),
((SELECT id FROM dynasties WHERE name = 'SHADOW'), 'SHADOW DUSK', 'common', 'https://.../SHADOW_DUSK_002.png', 'Fades into darkness...', 500, 2),
-- ... (8 more variants)
((SELECT id FROM dynasties WHERE name = 'SHADOW'), 'SHADOW ECLIPSE', 'legendary', 'https://.../SHADOW_ECLIPSE_010.png', 'Total absence of light...', 10000, 10);
```

**Day 4: Supabase Storage Upload**
- Upload 10 PNG files to `dynasties/shadow/` bucket
- Verify CDN URLs are accessible
- Update `snake_variants.art_url` if needed

**Day 5: 3D Snake Shader**
- Create SHADOW shader in Blender:
  - Color: Dark purple (#1a1a2e) to black (#000000) gradient
  - Pattern: Wispy shadow trails (subtle, ethereal)
  - Material: Translucent, ghostly
- Create particle system: Black smoke particles drift behind
- Export GLTF, add to Three.js shader library

**Day 6: Testing**
- Verify new dynasty appears in Lab UI (4th tab: SHADOW)
- Test unlock flow (tap locked SHADOW UMBRA → unlock for 500 DNA → success)
- Test breeding (SHADOW + SHADOW = SHADOW offspring)
- Test set bonus (unlock 10/10 SHADOW → +10% DNA income granted)
- Test 3D shader (equip SHADOW snake → see dark purple/black snake with smoke trail)

**Day 7: Announcement & Deployment**
- Push to production (no app update needed, database already live)
- In-game notification: "NEW DYNASTY: Shadow - Born from darkness! Unlock now!"
- Social media announcement
- Monitor analytics (how many players unlock SHADOW in first 24 hours?)

---

### Expansion Metrics (Projected)

**Month 4:** Add SHADOW dynasty (+10 variants = 40 total)
**Month 5:** Add CRYSTAL dynasty (+10 variants = 50 total)
**Month 6:** Add EGYPTIAN dynasty (+10 variants = 60 total)
**Month 7:** Add NORSE dynasty (+10 variants = 70 total)
**Month 8:** Add FEUDAL dynasty (+10 variants = 80 total)
**Month 9:** Add STEAMPUNK dynasty (+10 variants = 90 total)
**Month 10:** Add MECHANICAL dynasty (+10 variants = 100 total)
**Month 11:** Add INFERNAL dynasty (+10 variants = 110 total)
**Month 12:** Add CELESTIAL dynasty (+10 variants = 120 total)

**Year 1 Total: 3 (MVP) + 12 (monthly) = 15 dynasties, 150 variants**

**Exceeds original plan of 10 dynasties, 500 variants** (can continue to 50 dynasties if desired, 500 variants achieved by Month 47 = ~4 years)

---

## What Gets Unblocked

### ✅ Art Production (UNBLOCKED)

**Status:** Can begin Week 3
**Timeline:** 2-3 weeks for 30 MVP variants
**Cost:** $120 (Midjourney Pro) vs $58,000 (original 3D pipeline)
**Deliverables:** 30 × 2048px PNG art cards + 3 × simple 3D shader variants

**Next Steps:**
1. Subscribe to Midjourney Pro ($60/month)
2. Generate CYBER, PRIMAL, COSMIC art (Week 3-4)
3. Create simple 3D snake base model + 3 shaders (Week 4-5)
4. Proceed with implementation (Week 6-10)

---

### ✅ Breeding System Design (UNBLOCKED)

**Status:** Fully specified
**Rules:** Same dynasty only, 100% dynasty inheritance, generation = max(parents) + 1
**DNA Cost:** 200 base + (avg_parent_gen × 100)
**Timer:** Instant for v0.1 (better UX than 30-second wait)

**Implementation:** Week 8 (3 days)

---

### ✅ Collection Lab UI (UNBLOCKED)

**Status:** Panini book design complete
**Dynasty Filters:** 3 tabs (CYBER, PRIMAL, COSMIC), swipe to switch
**Variant Grid:** 10 slots per dynasty, locked/unlocked states
**Full-Screen Art:** Tap unlocked variant → zoom into 2048px Midjourney art

**Implementation:** Week 7 (5 days)

---

### ✅ Set Bonus Tracking (UNBLOCKED)

**Status:** Fully specified
**Bonuses:** +10% DNA income per complete dynasty (stacking), dynasty stat bonus doubles
**Database Trigger:** Auto-grant bonus when 10th variant unlocked
**UI:** Progress tracking, set completion celebration

**Implementation:** Week 6 Day 5 (backend), Week 7 Day 4 (UI)

---

### ✅ v0.1 Path B (Collection + Breeding) VIABLE

**Status:** Can proceed with ambitious MVP scope
**MVP Contents:**
- 3 dynasties (CYBER, PRIMAL, COSMIC)
- 30 variants total
- Collection system (unlock via DNA)
- Breeding system (same dynasty only)
- Set bonuses (+10% DNA per dynasty)
- Simple 3D Snake gameplay with dynasty visual themes

**Timeline:** 12 weeks (original plan maintained)
**Result:** Higher retention potential than Path A (collection-only)

---

## Success Criteria

### Dynasty System is READY FOR PRODUCTION if:

- [x] All 7 critical questions answered with locked decisions
- [x] 3 starter dynasties fully specified (CYBER, PRIMAL, COSMIC)
- [x] 30 variants defined with names, rarities, DNA costs, lore
- [x] Art production pipeline documented (Midjourney + simple 3D)
- [x] Database schema designed for expansion
- [x] UI/UX design complete (Panini book + gameplay)
- [x] Breeding rules locked (same dynasty only, immutable)
- [x] Set bonus system specified (+10% DNA per dynasty)
- [x] Implementation roadmap created (5-week timeline)
- [x] Monthly expansion playbook written (sustainable cadence)
- [x] All dependent systems unblocked (art, breeding, UI, bonuses)

**ALL CRITERIA MET ✅**

---

## Appendix: Future Expansions (v0.5+)

**Cross-Dynasty Breeding (v0.5):**
- CYBER + PRIMAL = 80% dominant parent dynasty, 20% recessive
- Or 50/50 random split
- Adds strategic breeding choices ("I want CYBER, so I'll breed 2 CYBER to guarantee it")

**Dynasty Transformation (v0.5+):**
- Premium feature: "Dynasty Crystal" item ($1.99 or 5,000 DNA)
- Allows changing dynasty of existing snake (Gen 5 CYBER → Gen 5 PRIMAL)
- Monetization opportunity (not pay-to-win, just cosmetic flexibility)

**Dynasty Abilities (v1.0+):**
- CYBER: Data Hack (slow time for 3s, once per run)
- PRIMAL: Nature's Blessing (heal 1 collision after 30s)
- COSMIC: Warp (teleport short distance, once per run)
- High complexity, delay to v1.0 after core system proven

**Mega Dynasties (Year 2+):**
- Special rare dynasties released quarterly
- Example: "QUANTUM Dynasty - reality-bending snakes, 20 variants, ultra-rare"
- Higher DNA costs (20,000+ per variant), prestige collection goal

---

## Document Status

**Version:** 1.0 FINAL
**Status:** 🔒 LOCKED - NO CHANGES
**Date:** 2025-10-14
**Approved By:** Product Lead, Design Lead (Sprint Day 3 decision)
**Next Review:** After v0.1 launch + 3 months (evaluate expansion cadence)

---

**This specification is now production-ready. All dependent systems are unblocked. Art production can begin Week 3. Implementation starts Week 6.**

**🔒 DYNASTY SYSTEM SPECIFICATION v1.0 - LOCKED FOR PRODUCTION 🔒**
