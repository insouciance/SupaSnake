# The 90s Cartoon Direction — Consequential Redesign Audit

Owner directive, 2026-08-07: *"research also about other elements in the game that we
need to redesign as a consequence of the new 90s cartoon style!"*

Authority above this document: `docs/PRODUCT_CONSTITUTION.md` (design), 
`docs/design/SNAKE_CHARACTER_STYLE_GUIDE.md` (the character law), 
`docs/ENGINEERING_DOCTRINE.md` (system-shaped work). This document decides nothing;
it inventories, classifies, and hands the owner a decomposition and a list of
tensions it deliberately does not resolve.

---

## 0. Two facts that change how you read every path below

**0.1 — The main worktree is 60 commits behind `origin/main`.** Verified:
`git status -sb` → `## main...origin/main [behind 60]`; local `HEAD` is `e918c9d`,
`origin/main` is `baf0ebc`. The entire INK & AMBER design release
(`6e7cf01` LF-A · `3897128` LF-B · `edd45fa` LF-C · `a460a4e` LF-D) is on the remote
and **absent from disk here** — `src/components/game/screen/inkAmber.ts` does not
exist locally and does exist on `origin/main`. Every citation in this document is
against `origin/main` unless marked otherwise, because that is what is live at
supasnake.com.

*Consequence for the program:* a design work package branched from this worktree
would silently revert INK & AMBER. **Pull before the first WP branches.** This is
listed again as tension T-11 because it is the only item that can destroy work
rather than merely misdirect it.

**0.2 — The ratified composition is already built, on a branch.**
`concept/board-neon-themes` (worktree `.../SupaSnake-worktrees/board-neon-concept`,
HEAD `710baf8`) is 28 files and ~6,600 lines ahead of `origin/main` and contains the
whole of what the owner just approved:

| Module | What it establishes |
|---|---|
| `src/components/game/screen/snake90s.ts` (1,114 ln) | The character law as code: true cubes, **face-keyed authored tones** (both reflected-light accumulators zeroed — colour is immune to the board's light rig by construction, not by tuning), five bands from three swatches, the facet bevel (`SNAKE_FACE_CUTS.rim = 0.005`, landing the tone boundary at the geometry's own edge), ink hull at `0.095`, the guide's shades and braids. |
| `src/components/game/screen/boardTiles.ts` (809 ln) | 400 real beveled tile blocks, one baked draw. `toneForFace` assigns HIGHLIGHT / MID / SHADOW **by orientation**, hard boundaries because they are vertex colours on flat quads. |
| `src/components/game/screen/boardThemes.ts` (433 ln) | Three neon dynasty identities on one geometry. Luminance parity across all three (~39–41 Rec.709). The lit-shoulder hue-family rule. |
| `CockpitPrototype.module.css` | The tray's white frame **removed** by owner ruling 2026-08-07 — *"the BOARD keeps its outline (it is a character outline), the TRAY loses its frame."* |
| `SpecimenChamber.tsx` | The home portrait re-hung on the same face-keyed shader, explicitly to hold chamber = game law. |

**What the concept branch does NOT touch** — verified by
`git diff --name-only origin/main...HEAD`, which returns nothing matching
`food|portal|beacon|particle|terrain|aim|genome`:

> FoodBeacon · ExitPortal · MutationBeacon · TerrainBlocks · AimRenderer ·
> Particles · GenomeBoardEffects · BlackoutMask · TrainingPathRenderer ·
> **and the entire DOM layer.**

That list is the spine of this audit. The snake and its stage are drawn by one hand.
Nothing else on the board is.

**0.3 — The reach of the shipped vocabulary, measured.** `git grep -l` for imports of
`inkAmber` on `origin/main` returns exactly 11 render files: `game/page.tsx`,
`AimRenderer`, `ArenaBorder`, `ArenaFloor`, `FoodBeacon`, `InstancedSnake`,
`SnakeModel`, `TerrainBlocks`, `ArenaPrototypeCanvas`, `SnakeCosmetics`,
`SpecimenChamber`. Every other object in the 3D scene is outside the vocabulary
today — not stylistically behind it, structurally unaware of it.

---

## 1. The grammar this audit judges against

Six words, taken from the code that already implements them. Every "direction"
column below is written in these terms and nothing else.

1. **CHUNKY** — true cubes, `width = height = depth`, clearly separated, never
   flattened into slabs (`snake90s.ts` § THE CUBE LAW). A gap always survives:
   `maxEdge` is a hard cap, not an average.
2. **CEL** — three authored tones with hard transitions. Hard because they are
   *chosen*, not lit: `applySnakeFaceShading` zeroes `directDiffuse`,
   `directSpecular` and `indirectSpecular` and writes the band itself. A tone
   boundary cannot soften under any light rig or board theme.
3. **INK** — a thick near-black silhouette line, weight bounded by the gap it must
   not close (`snake90s.ts`: two hulls facing each other across the free-running
   gap must not meet). Internal separation is bought by the *gaps between cubes*,
   which each cube's own hull paints, not by a second drawn line.
4. **AUTHORED TONE** — a shadow is a dark, **more saturated** member of the
   surface's own hue family; never a desaturated grey (`TONE_DOWN` is a warm tint,
   not a scalar). Generalises correctly to all three dynasties.
5. **RESTRAINED NEON** — light lives at boundaries and in the air, never along a
   repeated interior element. The governing rule, learned by rendering and
   rejecting the alternative: *a lit shoulder must be the same hue family as the
   plane it rolls off* (`boardThemes.ts`, DARK_NEON). Hue contrast makes lines;
   saturation does not.
6. **PURPLE ACCENT** — **new, and unresolved.** The logo introduces it. See T-2;
   this document does not assume it enters the token set.

---

## 2. Verdict key

- **REQUIRED** — the new direction makes the current treatment *wrong*, not merely
  dated. Leaving it produces a visible seam inside one composition.
- **RECOMMENDED** — coherent enough to survive, cheaper to fix while adjacent work
  is open, and it will read as unfinished next to the finished surfaces.
- **FINE AS-IS** — the direction has nothing to say about it, or the current
  treatment is already the direction's own answer.

Size: **S** ≈ under a day · **M** ≈ a few days · **L** ≈ a work package of its own.

---

## A. IN-PLAY 3D OBJECTS

The board during a run. Ordered by how much of the player's attention each object
holds.

### A.0 — Already ratified (recorded, not re-audited)

| Element | State |
|---|---|
| Snake head + trail | `snake90s.ts` + `InstancedSnake`/`SnakeModel` on `concept/board-neon-themes`. **The composition itself.** |
| Board slab, tiles, rim, undertray | `boardTiles.ts` + `boardThemes.ts` + `ArenaFloor`/`ArenaBorder`/`ArenaUndertray`, same branch. |
| Home portrait creature | `SpecimenChamber.tsx`, same branch, same shader. |
| Snake cosmetics (shades, braids) | `SnakeCosmetics.tsx`, same branch; `NINETIES_COSMETICS` in `snake90s.ts`. |

### A.1 — The extraction moment

| # | Element | Current state (verified) | Verdict | Direction | Size |
|---|---|---|---|---|---|
| A1 | **Exit portal + aperture + arc ticks + inner disc** | `src/components/game/ExitPortal.tsx:149–174` — three `MeshBasicMaterial`s, all `AdditiveBlending`, colour `PORTAL_COLOR = '#f8f5d0'` (:52). No ink hull, no toon ramp, no rounded geometry. Categorically outside the vocabulary. | **REQUIRED** | The one moment the whole game is about is currently the least-drawn object on the board. Rebuild the aperture as a **chunky beveled ring** — real thickness, facet chamfer, authored 3-tone in its own warm hue family — inside a full-weight ink hull. It should read as a *thing standing on the board*, not a glow painted onto it. | **L** |
| A2 | **Portal beam column** | `ExitPortal.tsx:118–141, 176–184` — cylinder with a baked grayscale vertex fade, additive, `opacity 0.5`. | **RECOMMENDED — keep as light** | Deliberately the exception. The bloom contract names the portal as one of four things allowed to glow (`InstancedSnake.tsx:238–240`). Keep it pure light; retune only its colour to sit in the same family as A1's new authored tones so ring and beam read as one object. | **S** |
| A3 | **"EXTRACT" callout sprite** | `ExitPortal.tsx:217–243` — a canvas-drawn text sprite in **Arial Black**, `#f8f5d0`, 6 s fade. | **REQUIRED** | A system font rendered to a texture inside a hand-drawn composition. Replace with the product's own lettering treatment — the `RunRateCallout` idiom (see C-11) is already the right answer and already shipped. | **S** |
| A4 | **Portal ground decal** | `ExitPortal.tsx:143, 186–215` — canvas radial gradient on a plane, desktop only. | **RECOMMENDED** | A soft radial is a lighting effect. Replace with a flat authored pad with a hard edge, or delete — the beam and the new ring may carry it alone. | **S** |
| A5 | **Twin Exits** | `game/page.tsx:8085–8092` renders a second identical `<ExitPortal>`. | **FINE AS-IS** | Inherits A1 automatically. No separate work. | — |
| A6 | **Side Door / phase-gate markers** | `GenomeBoardEffects.tsx:545–592` — `TorusGeometry` ring + `OctahedronGeometry` core, `meshBasicMaterial`, additive. Entry `#c084fc`, exit `#67e8f9`. | **REQUIRED** | The Side Door is an *exit*, and it currently shares no visual language with the exit. Draw it as a smaller sibling of A1's ring — same construction, same ink weight, different hue family — so "this is also a way out" is legible without a label. | **M** |
| A7 | **Phase-gate tether + arrival chevron** | `GenomeBoardEffects.tsx:447–491, 507–543` — up to 12 dashed additive box segments at `#a5b4fc`, `opacity 0.45`; two additive bars. | **RECOMMENDED** | A dashed additive line is the one mark type this direction has no vocabulary for. Redraw as chunky ink-hulled chevron blocks — discrete, countable, the same "field of blocks" logic the braids use. | **S** |

### A.2 — Pickups

| # | Element | Current state (verified) | Verdict | Direction | Size |
|---|---|---|---|---|---|
| A8 | **The food / apple** | `src/components/game/FoodBeacon.tsx:234–268` — rounded box body, `MeshToonMaterial` with `getToonGradientMap()`, `emissiveIntensity 1.6`, **full ink hull** (`createInkHullMaterial()`, :149) plus a fine hull on the leaf (:151). Ink stem and bone glint unlit. | **REQUIRED** | Structurally already in the vocabulary — but its tones are **light-driven**, and the snake beside it no longer is. Once the creature's colour is immune to the light rig and the food's is not, they will visibly disagree at every board theme. Port the apple to `applyFaceKeyedShading` with its own tone set; widen the bevel to a facet; keep the leaf and stem as the sheet's "small white details" logic. | **M** |
| A9 | **GOLDEN HOUR ring** | `FoodBeacon.tsx:107–114` — `TorusGeometry(0.3128, 0.1, 4, 18)`, the board's only annulus, `#f5c542`, shares the toon material and hull. **Implemented but never rendered**: no call site passes `variant` (`game/page.tsx:8058, 8065`; `training/page.tsx:176`). | **REQUIRED (with A8)** | Same material, so it moves for free. Flag separately that GOLDEN HOUR — a ratified vocabulary word (`PLATFORM_STATUS.md:135–138`) — currently has **no rendered board object at all**. Styling it and wiring it are different decisions; this document only claims the first. | **S** |
| A10 | **Wager cube** | `FoodBeacon.tsx:116–126` — box rotated onto its corner, `#f54263`, two incommensurate wobbles. Also unwired. | **REQUIRED (with A8)** | Moves with A8. A cube on its corner is already the right shape language; it needs the facet bevel and the authored tones. | **S** |
| A11 | **Extra foods / rich harvest** | `game/page.tsx:8064–8071` — the *same* apple, tinted by `GLYPH_COLORS = ['#22d3ee','#f0abfc','#fbbf24']` (:7829) on COSMIC constellations. | **RECOMMENDED** | Tinting one object three ways is the cheapest possible differentiation and reads as a bug next to a board where every object is authored. Either author three foods or make the tint carry a shape change. | **S** |
| A12 | **Mutation / relic beacon** | `src/components/game/MutationBeacon.tsx:102–133` — three **raw `boxGeometry`** voxels, **`meshStandardMaterial`**, `metalness 0.3–0.4`, `roughness 0.3–0.4`, `#a855f7` / `#7c3aed`. No hull, no toon, no rounded geometry. | **REQUIRED** | The loudest remaining outlier on the board: it is the one object still lit as PBR, which the style guide's Never-list rules out by name ("Smooth PBR cubes", "thin outlines"). Rebuild in the cube law — three chunky beveled blocks, ink hulls, authored tones, the urgency pulse kept because it is information. | **S** |
| A13 | **Genome target sigils + halos + budget rings** | `GenomeBoardEffects.tsx:282–436` — seven authored linework silhouettes, all `meshBasicMaterial` + `AdditiveBlending` + `depthWrite: false`, plus a wireframe box shell and a shrinking budget torus. | **REQUIRED** | Seven additive wireframe glyphs floating over a board of solid drawn blocks. They are *information* and must stay legible, so this is not a deletion: give each sigil a physical body — a small chunky block wearing its rune as a face marking, the way terrain already carries `genomeRuneEngravingStrokes`. The budget ring stays a ring; it is a meter, not an object. | **M** |

### A.3 — Terrain

| # | Element | Current state (verified) | Verdict | Direction | Size |
|---|---|---|---|---|---|
| A14 | **Solid / calcified terrain blocks** | `src/components/game/TerrainBlocks.tsx:55–61` — `MeshToonMaterial` `#3f5060`, emissive `#22303c`, `gradientMap`; geometry `getTerrainCellGeometry()` (rounded, 0.08 chamfer); **ink hull present** (`solidHullMaterial`, :61) drawn as a second InstancedMesh at `renderOrder={-1}` (:275–301). | **FINE AS-IS** | **The owner is right to love it.** This is the one object that was already built to the direction: rounded chunky geometry, toon bands, a real silhouette line. Do not touch it. Its only exposure is that its tones are light-driven (as A8) — but terrain is *stage*, not character, and the stage is allowed to be lit. | — |
| A15 | **Calcifying stars (COSMIC)** | Renders through `TerrainBlocks` with the FLUX rune (`constellationCalcified`, `game/page.tsx:2686`). | **FINE AS-IS** | Inherits A14. | — |
| A16 | **Fortress (PRIMAL)** | Same path, `TERRAIN_RUNE_STRAIN` maps `fortress → FERAL` (`TerrainBlocks.tsx:79–84`). | **FINE AS-IS** | Inherits A14. | — |
| A17 | **Forming (amber, passable) terrain** | `TerrainBlocks.tsx:48–51` — `MeshBasicMaterial` `#f2a03f`, `toneMapped: false`, low fill `FORMING_HEIGHT 0.035`, raw `BoxGeometry`, four perimeter rails closing inward. **No hull, no toon, raw box.** | **RECOMMENDED** | The one part of the terrain system left flat. It is deliberately unlit — amber is a *signal*, the single semantic warm (`globals.css:14`) — so it should stay a drawn value. But a raw box with no hull inside a hulled field is the seam. Give it the hull and the rounded cell geometry its solid sibling already uses; keep the flat colour. | **S** |
| A18 | **Terrain runes** | `TerrainBlocks.tsx:62–65, 194–195` — instanced white `MeshBasicMaterial` with per-instance strain colour, `SIGNATURE_HEIGHT 0.04`. | **RECOMMENDED** | Reads as an engraved decal, which is correct; it just has no weight. One ink weight under the stroke would seat it on the block. Batch with A17. | **S** |

### A.4 — Aim and marking

| # | Element | Current state (verified) | Verdict | Direction | Size |
|---|---|---|---|---|---|
| A19 | **THE LEAD aim chips** | `src/components/game/AimRenderer.tsx:275–282, 519–537` — `createExactUnitRoundedBoxGeometry(0.09)`, `MeshBasicMaterial` flat white `#ffffff` with `toneMapped: false`, **full-weight ink hull** (`createInkHullMaterial()`, :282), drawn as two InstancedMeshes (`deadeye-lead-ink` at `renderOrder={-1}` + chips). Three cells, `LEAD_LENGTHS [0.74, 0.58, 0.42]`. | **FINE AS-IS** | Already the direction's own answer, arrived at independently: chunky rounded blocks, flat authored value, thick silhouette. A flat white here is *correct* — it is a drawn marker, not a lit object, and giving it tones would make it a thing on the board rather than a note about the board. Leave it. | — |
| A20 | **Snapped-cell highlight** | `AimRenderer.tsx:506–513` — additive plane, breathing at ~0.35 Hz. | **RECOMMENDED** | An additive breathe under a hard-edged marker. Flatten to an authored pad with a hard edge; keep the breathe as an opacity step, not a gradient. | **S** |
| A21 | **Gridlock rails + pips** | `AimRenderer.tsx:555–700` — row/col plane rails, additive `0.14→0.34`, diamond pips. Unlit, no hull. | **RECOMMENDED** | Gridlock draws *lines across the whole board* — exactly the class the line-free ruling deleted from the board itself (see T-3). It survives because it is transient and player-invoked. Redraw as discrete chunky pips rather than continuous rails. | **M** |
| A22 | **Pathline lanes + chevrons** | `AimRenderer.tsx:709+` — five lane quads with `LANE_OPACITIES [0.3 … 0.07]`, `ShapeGeometry` chevrons, danger tint `#f43f5e`. | **RECOMMENDED** | A five-step opacity ramp is a gradient by another name. Convert to a five-step *authored value* ramp — same information, hard boundaries. | **M** |
| A23 | **Firefly aim marker** | `AimRenderer.tsx:298–344` — `MeshStandardMaterial` `#ffd98a` emissive `#ffb347`, wireframe octahedron halo, canvas radial glow sprite. | **REQUIRED** | The second-loudest outlier after A12: a PBR-lit object with a canvas glow sprite. If Firefly survives the aim-system consolidation at all, rebuild in the cube law; if it does not, delete it here rather than restyling it. | **S** |

### A.5 — Effects, atmosphere, and the room

| # | Element | Current state (verified) | Verdict | Direction | Size |
|---|---|---|---|---|---|
| A24 | **Eat burst (`CollectEffect`)** | `src/components/game/Particles.tsx:21–146` — 25 `THREE.Points`, `pointsMaterial size 0.3`, `sizeAttenuation`, colours from the **legacy `themeManager` palette** (`ThemeManager.ts:30–58` — a live palette fork, see T-7). | **REQUIRED** | A camera-facing point sprite is the exact opposite of a drawn cube; it is also the only object on the board with no silhouette at all. Replace with a short burst of **instanced chunky ink-hulled shards** — the food's own cube, broken. Same trigger, same duration, same cost class. | **M** |
| A25 | **Death explosion** | `Particles.tsx:158–281` — 150 points, `size 0.4`, 1.5 s, gravity 8, mixed legacy `primary/secondary/accent`. | **REQUIRED** | Same treatment as A24 and the more important of the two: death is the most-watched half-second in the product. The snake should come apart into its own cubes. | **M** |
| A26 | **Coil seal dash** | `InstancedSnake.tsx:329–344, 853–861` — additive dash along newly fused contact edges, `COIL_SEAL_DURATION_SECONDS = 0.52`, `renderOrder={4}`, no hull. | **RECOMMENDED** | Draws *between* cubes — precisely where the direction says the gap and its ink live. Either flatten it to an authored flash on the two adjacent faces, or delete it and let the gap narrowing carry the fusion read (which under the cube law it already does). | **S** |
| A27 | **Gilded wake / "ground becoming yours"** | `GenomeBoardEffects.tsx:21–28, 611–634` — `BoxGeometry(0.78, 0.05, 0.78)`, `MeshBasicMaterial` with vertex colours at `#ffc247`, `opacity 0.48`, `depthWrite: false`. No hull, no toon. | **RECOMMENDED** | Same class as A17 and should be answered the same way: a flat amber value is right, a hull-less translucent plate is not. Batch with the terrain pass. | **S** |
| A28 | **Blackout anomaly mask** | `src/components/game/BlackoutMask.tsx:27–89` — one oversized plane, custom `ShaderMaterial`, radial `smoothstep`, `renderOrder={999}`. | **FINE AS-IS** | It is a mask over the composition, not a member of it. A soft falloff is correct here — the alternative is a hard circle, which would read as an object. | — |
| A29 | **Revive shell** | `InstancedSnake.tsx:296–302` — wireframe `MeshBasicMaterial` `#f4d58d`, `opacity 0.34`. | **RECOMMENDED** | Wireframe is a debug idiom. Redraw as the head's own silhouette in flat authored value — a ghost of the character, not a mesh of it. | **S** |
| A30 | **Training path renderer** | `src/components/game/training/TrainingPathRenderer.tsx` — guide boxes `#67e8f9`, checkpoint tori `#f5c85b`, ghost sphere `#c4b5fd`, all `MeshBasicMaterial`, no hull. | **RECOMMENDED** | Training is where new players form their first impression of the look. Low traffic, high first-impression value. Batch with A13 (same treatment, same file class). | **S** |
| A31 | **Postprocessing (Bloom only)** | `game/page.tsx:7763–7804` — `<Bloom>` alone, `luminanceThreshold 0.68`, `intensity 0.58`, desktop only, governor-gated. No vignette, no CA, no DoF. Fog **deleted** (:7628–7652). | **FINE AS-IS** | The threshold is what decides *what glows*, and the contract pins the set to head / food / portal / glow strips (`InstancedSnake.tsx:238–240`). The style guide's Never-list names "excessive bloom" — the current setting is the restraint that clause asks for. Do not open this. | — |
| A32 | **Lighting rig** | `game/page.tsx:7655–7697` — hemisphere + ambient + key at `[24,18,2]` with an explicit target, plus `DynamicLights.tsx:86–117` (dynasty point, white rim, per-food spotlights). | **RECOMMENDED — re-scope, don't restyle** | Under face-keyed shading the creature ignores every one of these lights. The rig now serves only the board, the terrain and the food. Once A8 lands, it serves the board and the terrain. That is a much smaller job than the rig currently does, and the per-food spotlights in particular (`MAX_FOOD_SPOTLIGHTS`) may become pure cost. Measure before deleting. | **S** |
| A33 | **Game environment backdrop** | `src/components/game/screen/GameEnvironment.tsx` + `.module.css:17` — a DOM stack whose base layer is the authored bitmap `/textures/minimalistic_background_texture_of_space_1.png` (2048², 2.0 MB) at 0.5 opacity, plus a dynasty radial and a contrast vignette. | **REQUIRED** | A photographic space texture behind a hand-drawn board is the largest single style seam left in the run. The concept branch's own tray ruling already calls the intended ground *"the cartoon night sky"* — which does not exist yet. This is the object that decides whether the run reads as one drawing. | **M** |
| A34 | **Screen shake** | `src/lib/effects/ScreenShake.ts` — light/medium/heavy, applied as a group offset (`game/page.tsx:7954`). | **FINE AS-IS** | Motion, not style. | — |
| A35 | **Camera** | `CameraRig.tsx` — live rig is `COCKPIT_DEFAULT_POLAR = 26°` (:65), `COCKPIT_FIT_SCALE ≈ 1.41` (:115–116), `COCKPIT_TARGET_Y = -0.3` (:118), `OrbitControls` still imported (:25). ET-5's ratified `pitch 28 / fit 1.00 / target 0.0` exists only in the untracked `docs/PROGRAM_PLAN.md:64–69` and matches nothing on any git ref. | **FINE AS-IS for style — but see T-12** | Not an art item. It is listed because **the approved composition was judged at the live framing, not the ratified one**, and the tile bevels, the gap between cubes and the ink weight are all framing-dependent reads. | — |

**Section A tally — 35 elements:** 12 REQUIRED · 14 RECOMMENDED · 9 FINE AS-IS.
(A0's four ratified items are excluded from the count.)

---

## B. DECISION SURFACES

The moments the game stops and asks. Two of these already own pending work packages
— **Wave 6 owns the DROP redesign, Wave 7 owns Workbench and Results**
(`docs/PROGRAM_PLAN.md:62–74`) — and the style guidance for those folds **into** the
pending WP rather than arriving as a second pass over the same file. That is marked
per row.

**Naming note, verified:** the shipped portal verbs are `BANK / PASS / INFUSE`
(`PortalChoiceOverlay.tsx:122–149`), not the ratified `BANK / RIDE ON / TRADE UP`
(`lexicon.ts:317–327`). `plainLanguage.test.ts:116` bans `PASS|INFUSE` from surfaces
via `const RETIRED`. There is a live divergence between the lexicon and the overlay
that is not an art problem and is flagged here only so a redesign does not
re-enshrine the retired words. **"Split Bet" does not exist in the codebase** — no
component, no test, no doc; it is greenfield if wanted.

| # | Element | Current state (verified) | Verdict | Direction | Size |
|---|---|---|---|---|---|
| B1 | **THE DROP cards** | `src/components/game/GeneChoiceOverlay.tsx:130–225` — `bg-void-deep/80 backdrop-blur-sm` scrim, `panel-elevated max-w-lg` frame with `--glow:#a855f7`, option tiles `rounded-arcade border bg-void/60 p-4`. **No rarity tier, no foil, no holo** — the entire rarity treatment is `text-rarity-uncommon` on the effect line vs `text-strike-red/90` on the cost line (:181–182). DECLINE is drawn as a third card (:194–225), which is right. | **REQUIRED — FOLD INTO WAVE 6** | The single highest-value decision surface and currently the most generic. It should be a **card you would want as an object**: ink tier-3 frame, flat displaced drop (`--ink-drop-3`, no blur — *"a soft shadow is a lighting effect and this is a printed object"*, `globals.css:123–125`), rarity carried by frame weight and an authored colour band rather than by text colour. This is the surface where the collectible IP and the gameplay meet. | **M** |
| B2 | **Portal choice (BANK / PASS / INFUSE)** | `src/components/game/PortalChoiceOverlay.tsx:115–149` — the three branches share one class string and differ **only by border and background tint**. No iconography, no weight hierarchy. Every multiplier is interpolated from engine constants (:75–79, 147–148) and must stay that way. | **REQUIRED** | Three options that look identical for the game's defining decision. Give each branch its own drawn identity — BANK the amber (the product's single semantic warm), RIDE ON the neutral, TRADE UP the violet it already owns as the gene hue. Weight hierarchy by frame tier, not by tint. **Do not hardcode a multiplier**; a literal here caused a shipped 12-segment lie, recorded at :26–52. | **M** |
| B3 | **Strain Surge overlay** | `PortalChoiceOverlay.tsx:156–179` — the gene-cap fallback, `panel-elevated max-w-md [--glow:#a855f7]`. | **RECOMMENDED** | Inherits B2's grammar. Batch. | **S** |
| B4 | **Run Setup** | `src/components/game/RunSetupPanel.tsx:129–233` — no frame of its own; framed by the caller's `panel-elevated` (`game/page.tsx:3042–3055`). "Adjust this run" is a native `<details>` (:221–233). The 3-tap law is e2e-enforced (`e2e/run-flow.spec.ts`). | **RECOMMENDED** | Inherits the chrome law (C1) almost entirely. The one item worth authoring is START: it is the product's front door and currently `btn-go` with a glow-pulse. **Do not touch the disclosure structure** — the tap count is a Constitution cap (R10). | **M** |
| B5 | **Results screen** | `src/components/game/RunResults.tsx:190–484` — three declared layers; headline `heading-display text-4xl text-glow`; Daily Take in `panel-glow [--glow:#facc15]`; yield breakdown in a `font-mono` grid; Layer 3 collapsed into one `<details class="panel">`; exactly one CTA. | **REQUIRED — FOLD INTO WAVE 7** | Wave 7 already owns the restructure (Score → Victory Lap → payout facts → actions). Fold the style in there rather than styling a layout that is about to change. The one style-specific note: Results is where a run becomes a *possession*, so it is the natural home for the card grammar B1 and E1 share. | **M** |
| B6 | **Genome card + "ALL IN" stamp** | `src/components/game/GenomeCard.tsx:47–106` — `panel-glow [--glow:#a855f7]`; **the ALL IN stamp at :55 is `-rotate-3 border-2 border-strike-red tracking-widest`** — the one piece of existing sticker/stamp grammar in the product. Body strip :59–75 is a per-gene gradient split. | **RECOMMENDED — promote, do not replace** | The stamp is already speaking the direction's language and arrived before it. Promote it to a named primitive and reuse it; do not redesign it into something else. The gradient body strip is the part that needs the treatment (a gradient where the direction wants authored steps). | **S** |
| B7 | **Genome share card (canvas PNG)** | `src/lib/share/genomeCardImage.ts:221–321` — a 1200×630 card drawn on a raw 2D canvas with `ctx.fillText`, hardcoded `Space Grotesk` / `Inter`, `#f97316` accent, `#f43f5e` ALL IN, gene barcode as `fillRect` strips (:259–266). | **REQUIRED** | **A second, divergent art direction that leaves the product.** It uses two fonts the app does not load and a palette the app does not have. Every share is an IP impression. Rebuild against the same tokens as everything else. | **M** |
| B8 | **Pause menu (legacy path)** | `src/components/game/PauseMenu.tsx:70–139` — `panel-glow p-8` with `--glow` set from the live dynasty primary. Only rendered when the cockpit flag is **off** (`game/page.tsx:2955`). | **RECOMMENDED** | Rollback-path surface. Style it only insofar as the chrome law reaches it for free. | **S** |
| B9 | **Tactical hold rail (cockpit)** | `RunCockpit.tsx:371–381` + `CockpitPrototype.module.css:818–851` — a slim notched banner, `clip-path: polygon(...)`, cyan hairline. **`display: none` by default; shown only in landscape-short** (:1264–1266). | **RECOMMENDED — and check the gating** | A clip-path notch is a techno idiom, not a drawn one. Redraw as an ink-framed tab. Separately: a surface that is hidden at every viewport except landscape-short looks like a bug, not a decision; worth confirming before styling it. | **S** |
| B10 | **Abandon run dialog** | `src/components/game/AbandonRunDialog.tsx:45–84` — `role="alertdialog"`, `panel-elevated max-w-md [--glow:#f43f5e]`. | **RECOMMENDED** | Inherits the chrome law. | **S** |
| B11 | **Decision focus-blur** | `CockpitPrototype.module.css:918–920` — `.liveRoot[data-decision='true'] .arenaBay { filter: blur(7px) saturate(0.78) brightness(0.82) }`. The ruling at :889–899 **explicitly supersedes** the earlier blur-free rule and says *"Do not 'restore' the blur-free rule; it was overturned on purpose."* The scrim's own `backdrop-filter` was deleted at :812–818 to stop a double lens. | **FINE AS-IS — see T-4** | Keep. A rack focus on a 3D room is photography of the scene, not a soft edge on a drawn object. Listed as a tension only because a naive reading of "90s cartoon" would delete it. | — |
| B12 | **Legacy mutation choice overlay** | `src/components/game/MutationChoiceOverlay.tsx:78–155` — the pre-genome fallback; its decline is a plain underlined text link (:145–155), inconsistent with B1's third-card treatment. | **DELETE, do not redesign** | It exports `CHOICE_INPUT_LOCK_MS` (:20), which B1 and B2 both import — extract that constant, then remove the surface. Redesigning it costs the same as B1 and ships to nobody. | **S** |
| B13 | **Legacy Results + legacy HUD deck** | `game/page.tsx:3120–3400+` (Results) and `:2679–2892` (the pre-cockpit HUD, a complete second HUD with its own `game-hud-deck` CSS grid at `globals.css:134–166`). Not dead code — the HUD renders pre-run even under the cockpit flag. | **DELETE / SCOPE, do not redesign** | Four dying grammars (this pair plus B12 and the unused `ui/Panel.tsx`) will otherwise each need styling twice. `docs/CONSTITUTION_CHECKLIST.md` R12 asks a PR to name the system that could not do the job; here the honest answer is that the job is deletion. | **M** |

**Section B tally — 13 elements:** 5 REQUIRED · 6 RECOMMENDED · 1 FINE AS-IS · 2 marked
DELETE (B12, B13 counted once each in RECOMMENDED for sizing; see WP 90S-2).

---

## C. CHROME

The frame the whole product wears. **This section contains the highest-leverage
single edit in the audit** (C1) and the largest hidden dependency (C4).

| # | Element | Current state (verified) | Verdict | Direction | Size |
|---|---|---|---|---|---|
| C1 | **`.panel` / `.panel-elevated` / `.panel-glow`** | `src/app/globals.css:177–197`. `.panel` = panel gradient + 1px `scale-blue-light/60` border + `rounded-arcade` + `shadow-panel`. `.panel-elevated` adds an inset top edge light + `0 4px 24px rgba(0,0,0,.5)`. `.panel-glow` adds a `--glow`-driven border-colour and an 18px outer bloom. **30+ files consume each.** | **REQUIRED** | One edit re-skins ~90% of the product. The direction: replace the *lit* grammar (inset edge light + soft drop + coloured bloom) with the *printed* one already tokenised beside it — ink/paper tier borders (`--ink-border-*`, `--paper-ring-*`) plus the flat displaced drop (`--ink-drop-2/-3`). Both vocabularies already exist in the same file; the panel classes simply predate them. | **L** |
| C2 | **Buttons: `.btn-arcade` / `.btn-go` / `.btn-stop` / `.btn-neutral`** | `globals.css:434–476`. `.btn-arcade` is display font, uppercase, `border-radius 4px`, `border-width 2px`, hover `scale(1.02)`. `.btn-go` is `bg-cta-gradient` + `text-shadow` + a `0 0 14px -4px` glow. Shared component `src/components/ui/Button.tsx:20–35`. | **REQUIRED** | The glow is the tell — a button that emits light is a screen object; this direction's buttons are printed ones. Flat fill, ink tier-2 frame, hard displaced drop that *collapses* on `:active` (the `.ink-chip` at `globals.css:150–178` already does exactly this: `--ink-drop-3` → `1px 1px 0`). The chip is the correct model; promote its physics to the button. | **M** |
| C3 | **`.ink-chip` family + Home command rail** | `globals.css:150–178` — bg `#fffdf8`, `--ink-border-2`, `--ink-drop-2`, hover `--ink-drop-3`, active `1px 1px 0`. `.ink-chip-primary` fills with `--venom-orange`, glyph goes ink (*"an orange glyph on an orange chip is the underread this whole block exists to fix"*, :162–165). | **FINE AS-IS — and it is the reference** | Already the direction, shipped. Everything in C1/C2 should be brought toward this, not away from it. | — |
| C4 | **Cockpit decision-dock override** | `CockpitPrototype.module.css:695–772` — reparents any `[role=dialog]` into the dock and **replaces** the inner `.panel-elevated`/`.panel-glow` border, background and shadow with `!important` (`:727–745`), then overrides `h2`, `p`, `button`, `kbd` type scale (`:746–763`). | **REQUIRED — must move with C1** | **The hidden dependency.** With the cockpit flag on, the decision components' own Tailwind frames are decorative; this block is what the player sees. A C1 edit alone will not change a single in-run decision surface. Either delete the override or author it in the same pass. | **S** |
| C5 | **Cockpit instrument frame** | `CockpitPrototype.module.css:85–106` — a `clip-path` corner bevel + a gradient-border-box + inset edge lights + a 5px inset hairline `::after`. | **REQUIRED** | Four different mechanisms producing one border, and the composite reads as brushed metal. One ink tier-2 frame and one flat fill will say more with less; the instrument's identity should come from its glyph and its content, not from its chrome. | **M** |
| C6 | **Cockpit glyph set (15 SVG marks)** | `src/components/game/cockpit/CockpitGlyphs.tsx:1–200` — `ScoreGlyph`, `DnaGlyph`, `EnergyGlyph`, `TrainingObjectiveGlyph`, `TrainingTickGlyph`, `ShieldGlyph`, `RiskGlyph`, `PortalGlyph`, `ModeGlyph`, `PauseGlyph`, `ResetGlyph`, `AbandonGlyph`, `GeneGlyph`, `StrainGlyph` — all 24×24, **`stroke-width 1.8`, round caps, `currentColor`**: one thin-line technical style. | **REQUIRED** | Fifteen hairline technical icons inside a chunky composition. Redraw as **filled marks with a bold ink contour** — the same two-weight logic the character uses (thick silhouette, medium interior line). **High IP value**: these are the product's smallest reusable drawings and the natural seed for sticker/merch marks. | **M** |
| C7 | **Global icon set** | `src/components/ui/icons.tsx` — 23 inline 24px stroke icons, `strokeWidth 2`, `currentColor`. | **REQUIRED (with C6)** | Same problem, larger surface. Batch: one drawing pass covers both sets and keeps them one hand. | **M** |
| C8 | **Type classes** | `globals.css:483–520` — `.heading-display`, `.heading-ink`, `.heading-lettered` (`-webkit-text-stroke: var(--ink-w-3)`, `paint-order: stroke fill`, `text-shadow: 5px 5px 0 var(--ink)`), `.label-arcade`. | **RECOMMENDED** | `.heading-lettered` is already the direction and is the wordmark's class. The gap is that headings below it are not: `.heading-display` is a plain glow. Step the lettered grammar down one tier so headings and the mark read as one family. | **S** |
| C9 | **Typeface** | `src/app/layout.tsx:2–18` — `Russo_One` 400 (`--font-display`) and `Rajdhani` 500/600/700 (`--font-body`) via `next/font/google`, self-hosted. `styleguide/styleguide.md:23` names an unshipped display face "Snakebite" with Russo One as the fallback that actually ships. Numerics use raw Tailwind `font-mono` with no token. | **RECOMMENDED — owner call, see T-8** | Russo One is a squarish techno face; the style sheet and the new logo are a heavy brush comic face. **The logo arrives as an asset and sidesteps this for the mark itself.** The open question is whether headings follow, which is a licensing and loading cost, not a CSS edit. Recommend shipping v1 on Russo One and treating the face as its own judgement. | **M** |
| C10 | **Toasts** | `src/components/ui/Toast.tsx:41–86, 119` — `panel-glow` with per-type `--glow`, `animate-slide-in-right`, fixed bottom-right. | **RECOMMENDED** | Inherits C1. The per-type glow is the only bespoke part and should become a per-type frame colour instead. | **S** |
| C11 | **`RunRateCallout`** | `src/components/game/RunRateCallout.module.css:1–84` — 900-weight italic display, `-webkit-text-stroke: 1px`, `paint-order: stroke fill`, hard `3px 3px 0` offset shadow in cream, `rotate(-2deg)`, pop-scale keyframe. | **FINE AS-IS — and it is the reference for in-play type** | The one in-run surface already in a cartoon idiom, and it arrived before the direction. Use it as the model for A3 ("EXTRACT") and C12. | — |
| C12 | **`ExpressionFlourish`** | `src/components/game/ExpressionFlourish.tsx:42–84` — two presentations; the overlay variant is a full-board radial colour wash plus a `rounded-arcade` card with `shadow-2xl` and a `0 0 42px` colour bleed. | **RECOMMENDED** | A radial wash and a 42px bleed are lighting. Bring it to C11's idiom — lettering with a stroke and a hard offset. **Constraint:** it fires mid-run, so this is a *replacement at an existing trigger*, never an addition (Constitution R1, `docs/CONSTITUTION_CHECKLIST.md:9–12`). | **S** |
| C13 | **`ModalDialog`** | `src/components/ui/ModalDialog.tsx:34–122` — owns portal, focus trap, Escape, scroll lock, and **exactly one visual line** (:90, the scrim). The frame is delegated to the caller via `panelClassName`. Only 4 consumers; **no game decision surface uses it** — they all hand-roll `role="dialog"` + their own backdrop. | **RECOMMENDED — consolidate** | Not a style item on its own, but the duplication is why B1/B2/B8/B10 each carry their own scrim string and will each need editing. Consolidating first makes the chrome law a one-file change instead of a six-file one. | **M** |
| C14 | **Modal frame / scrim / tray width** | `globals.css:181–252` — `.modal-frame` (*"one tray, one bold outline"*, paper ring at `--ink-w-3`, `border-radius: 26px`), `.modal-scrim` (`rgba(6,9,13,0.86)`, deliberately no blur), `--tray-w: 45rem`. 22 files consume these. | **FINE AS-IS structurally — one open question, T-1** | The single-frame ruling *is* the direction: one tray, one outline, no second border or radius or glow inside it. The only question the 90s direction raises is whether the **drawn shade** companion line survives (T-1). Nothing else here needs to move. | — |
| C15 | **Navigation rail** | `src/components/ui/Navigation.tsx:90, 101–200` — mobile bottom pill `rounded-full bg-void-deep/72 backdrop-blur-xl shadow-[0_12px_38px_...]`; desktop right rail; active state is a radial `rgba(250,204,21,0.16)` + `drop-shadow-[0_0_7px_...]` + a rotated 4px diamond. | **RECOMMENDED** | Glass-and-glow, which the direction has no room for. It should be chips (C3) on a rail. Note Home does **not** mount it — Home uses `HomeCommandRail`, which already is chips; the rail is the surface that diverged. | **M** |
| C16 | **Footer** | `src/components/ui/Footer.tsx:12–38` — `border-t`, flat fill, legal links. | **FINE AS-IS** | Inherits tokens. Nothing to author. | — |
| C17 | **Loading spinners** | Hand-rolled per page — e.g. `app/lab/page.tsx:571` and `:884`, `app/leaderboard/page.tsx:358` and `:438`: `border-4 border-venom-orange border-t-transparent rounded-full animate-spin shadow-glow-sm`. Present in 8+ routes with **no shared component**. | **RECOMMENDED** | A rotating ring with a glow is a system idiom. One shared drawn loader — chunky, ink-framed, stepped rather than continuous — replaces eight copies and is a genuine character moment (the snake is the obvious mark). | **S** |
| C18 | **Skeletons / shimmer** | `.shimmer-overlay` (`globals.css`) plus pulse placeholders across `lab/`, `chronicle/`, `clan/`, `ftue/`, `signal/`. | **RECOMMENDED** | A shimmer sweep is a gloss effect. Flat authored blocks read better against a printed grammar and cost less. | **S** |
| C19 | **`global-error.tsx`** | `src/app/global-error.tsx:23–63` — **inline styles only, entirely outside the design system**: `background:'#0a0a0f'` (not a token), `fontFamily:'system-ui'` (neither product font), a `#00ffff` button with `borderRadius:'0.5rem'` (violates the 4px rule). | **REQUIRED** | The one page guaranteed to be seen at the worst moment, and it is unbranded. Small, high-embarrassment. | **S** |
| C20 | **`error.tsx` / `not-found.tsx` / route `loading.tsx`** | **None exist.** Verified absent across `src/app/`. | **REQUIRED (new)** | Not a redesign — a gap. A 404 is a free character moment and currently renders the framework default. | **M** |
| C21 | **`ui/Panel.tsx`** | `src/components/ui/Panel.tsx` — 53 lines, three variants, `border-[3px]`. **Zero importers.** | **DELETE** | Do not model the new grammar on it and do not restyle it. | **S** |

**Section C tally — 21 elements:** 8 REQUIRED · 8 RECOMMENDED · 4 FINE AS-IS · 1 DELETE.

*(Corrections to the two prior tallies, recounted: **Section A** is 12 REQUIRED · 14
RECOMMENDED · 9 FINE AS-IS. **Section B** is 4 REQUIRED · 6 RECOMMENDED · 1 FINE
AS-IS · 2 DELETE.)*

---

## D. HOME

The chamber ruling stands and is not reopened here: `SpecimenChamber.tsx:66–87`
records *"THE CHAMBER IS BRIGHT NOW"*, the owner's *"no black"* said twice, and
`assets/Inspiration/Trap_Snake_1` as the target — a near-white warm studio sweep,
one soft contact shadow, no grid, no void. That is the bright comic ruling, and the
90s direction agrees with it.

| # | Element | Current state (verified) | Verdict | Direction | Size |
|---|---|---|---|---|---|
| D1 | **The chamber (3D portrait)** | `src/components/home/SpecimenChamber.tsx` — `PAPER #fffaf1`, `PAPER_EDGE #faf1e2`, `PAPER_SHADOW #c0a887` (*"Never ink: a shadow on warm paper is warm, not neutral"*), ink `#0b1118`; toon ramp + ink hull; `SEGMENT_COUNT = 4`. **Already re-hung on the face-keyed shader** on `concept/board-neon-themes`. | **REQUIRED — finish the concept** | The creature is done; the room is not. Under authored tones the chamber's five-light rig (`ChamberLights:697–730`) no longer touches the character at all, so it exists only to light a paper sweep. Simplify it, and settle the contact shadow as a drawn mark rather than a lit one. **Note the contract mismatch:** `docs/CONSTITUTION_CHECKLIST.md:73` says "one head plus two body pieces"; the code says `SEGMENT_COUNT = 4` / head plus three. Reconcile before touching. | **M** |
| D2 | **The wordmark → THE NEW LOGO** | `src/components/home/HomeIdentityHud.tsx:73–89, 148` — type-only. `WORDMARK = 'SUPASNAKE'` plus a frozen nine-glyph rotate/shift/size table, rendered as `heading-display heading-lettered mt-10 -rotate-[2deg] text-4xl sm:text-6xl lg:text-7xl text-venom-orange`. **No SVG or raster wordmark asset exists anywhere in the repo.** | **REQUIRED** | Full spec in §D.1 below. | **L** |
| D3 | **Home command rail (Play + 3)** | `src/components/home/HomeCommandRail.tsx:93–158` — `ink-chip` circles, 64px, Play is `ink-chip-primary` with an `sr-only` label. | **FINE AS-IS** | Already the direction (see C3). The one open item is whether the Play chip should carry the character rather than `IconPlay` — a judgement, not a defect. | — |
| D4 | **Codex relic (five runes)** | `src/components/home/HomeCodexRelic.tsx:13–67` — a 48/56px diamond pinned right-centre, rotating 45°→135° on hover, five `StrainGlyph` runes, cosmic-glow border + `backdrop-blur-sm`. | **REQUIRED — FOLD INTO WAVE 7** | Wave 7 already owns the rune restyle. The style note to fold in: a glowing blurred diamond is the last glass object on Home, sitting next to chips that are printed. It should be a drawn relic. Runes move with C6/C7. | **S** |
| D5 | **Daily Take** | **No Home element exists.** The streak is one rotating text line in the mission slot (`src/app/page.tsx:663–664`, rendered `:918–945`). `SignalSurface.tsx:11, 38` deliberately refuses streak language, test-enforced. | **REQUIRED (new) — FOLD INTO WAVE 7 (D2 float)** | Wave 7 owns "Daily Take → floating home element". Style guidance to fold in: it is a *daily object you come back to*, which makes it the strongest small collectible moment on Home — a drawn token, not a badge or a counter. | **S** |
| D6 | **Identity HUD (specimen name, Gen, lineage rune, wallet)** | `HomeIdentityHud.tsx:220–255` — text plus a wallet pill plus a settings gear. Header grid geometry test-locked (`HOME_HEADER_GRID:15–19`). | **RECOMMENDED** | Inherits C1/C8. Do not move the grid — it is pinned. | **S** |
| D7 | **Cosmetics menu / wardrobe** | `src/components/home/CosmeticsMenu.tsx:1–260` — deliberately not a modal; on-screen selectors that take the dock's place so the snake stays visible; `ink-chip` chips; supporter-locked items visible and linking to `/shop`. | **RECOMMENDED** | Structurally right and already chip-based. What it lacks is any *depiction* of what you are equipping — see E10, which is the same problem at its root. | **M** |
| D8 | **AccountChip** | `src/components/ui/AccountChip.tsx:114–272` — 40×40 `rounded-arcade` chip; registered state uses `bg-cta-gradient` with a glow; popover is `panel-elevated animate-pop-in`. **Not mounted on Home** — only via `Navigation.tsx:20`. | **RECOMMENDED** | Inherits C1/C2/C15. Its gradient-plus-glow avatar is the one bespoke part. | **S** |
| D9 | **Home dock surfaces** | `WorldReportCard.tsx`, `SignalSurface.tsx`, `SeasonTrack.tsx` (modal), mounted `src/app/page.tsx:901–916, 814–826`. | **RECOMMENDED** | Inherit C1. No bespoke work. | **M** |
| D10 | **Landing pitch** | `src/components/growth/LandingPitch.tsx:57–` — below-the-fold on Home, gated on `GROWTH_SURFACES_V1_ENABLED && !isAuthenticated`; `.panel` cards, `heading-display`. Plus `src/app/play/page.tsx`, a separate SEO route. | **RECOMMENDED** | The first thing a stranger sees. Inherits C1, but it is also the one place where showing the character rather than describing the game is free. | **S** |

**Section D tally — 10 elements:** 3 REQUIRED · 6 RECOMMENDED · 1 FINE AS-IS.

### D.1 — THE LOGO: how the new mark lands (REQUIRED)

The asset supplied is `/Volumes/Souci_WD/Downloads/LOGO.jpg` — an orange-gradient
`SUPASNAKE` wordmark inside a jagged purple comic burst, on a black JPG ground.
It is a **comp, not a production asset**, and it cannot ship as delivered.

**D.1.1 — Asset derivation (blocking, do first).** A JPG has no alpha and the mark
must sit on the chamber's near-white paper *and* on the game's dark ground.

1. **Transparent-background master.** Knock out the black; the burst's outer contour
   becomes the silhouette. JPG chroma artefacts around a high-contrast purple-on-black
   edge will need cleaning, not just keying.
2. **SVG trace — attempt it, and prefer it.** The mark is flat colour plus a gradient
   fill: exactly what vectorises well. An SVG gives crisp rendering at every size, a
   theme-able fill, and — critically — makes the mark usable inside `next/og` Satori
   cards, which **cannot fetch external images or fonts** (`src/lib/og/artifactCard.tsx`
   hardcodes `fontFamily: 'sans-serif'` for this reason). If the burst's texture
   resists tracing, ship a two-layer hybrid: vector burst, raster wordmark.
3. **Raster ladder as fallback**: 1×/2×/3× PNG with alpha, plus the icon sizes in F.
4. **Version it in `git`.** The current brand assets are a cautionary tale:
   `assets/` at repo root holds 7 tracked source PNGs that **nothing in `src/`
   references**, and `assets/Textures/` holds 40 MB of untracked comic/paper/speedline
   material — including `TEX_COMIC_SPEED_LINES.png` and
   `TEX_seamless_pattern_of_stylized_snake_scales_comic.png`, which are precisely
   this direction's raw material — sitting outside version control.

**D.1.2 — Hero placement on Home.** The locked ruling is in code, not docs, and it
survives the change of medium:

- `HomeIdentityHud.tsx:50–57` — *"a hand-lettered logo does not read as hand-lettered
  because its edges are degraded… Roughness is a reproduction fault pretending to be
  craft. There is no filter here, and there must not be one."* **A traced SVG satisfies
  this ruling better than the type-plus-table did**: the character is now *drawn in*,
  and every edge is exact.
- `:63–66` — *"A hand-lettered logo is drawn ONCE and then it is the logo."* The
  nine-glyph `WORDMARK_CHARACTER` table (`:75–89`) is **superseded by the asset** and
  should be deleted, not ported — it exists only to give type character the asset now
  carries natively.
- `:148` — the locked geometry to preserve: tilt **−2deg**, `mt-10 / sm:mt-14`,
  scale steps `text-4xl / sm:text-6xl / lg:text-7xl`. Express these as the image's
  width steps so the mark occupies the same box it does today. `:142–147` records why
  the accent glow was removed (near-white room) — **do not reintroduce a glow behind
  the burst**; the burst *is* the glow's replacement.
- Keep the `sr-only` "SUPASNAKE" string (`:149–153`) — with the mark as an image it
  becomes the only accessible name on the page.
- `styleguide/styleguide.md:42–44` — *"Always place on top 20% of screen. Do not
  obscure the snake's eyes."* Both hold at the current placement; verify after.

**D.1.3 — Favicon and app icons.** Current state is a hand-written geometric snake
path, **duplicated in two files that will drift**: `src/app/icon.svg` (64² viewBox,
`#06090d` plate, `#22d3ee` stroke, `#67e8f9` head pip) and `src/app/apple-icon.tsx:26–36`
(same path data redrawn through `next/og`). Both still carry the **retired cyan**.
The mark that replaces them should be the **character head**, not the wordmark — a
wordmark is illegible at 16px and the head is the IP. Derive one SVG, consume it in
both places.

**D.1.4 — PWA icons.** `src/lib/pwa/manifest.ts` declares exactly two icons,
`/icon.svg` (`sizes: 'any'`) and `/apple-icon` (180×180), **both `purpose: 'any'`**.
There is **no maskable icon and no 192/512 raster ladder**, so Android will letterbox
the mark inside its own shape. Add a `purpose: 'maskable'` variant with the head
centred inside the safe zone, plus 192 and 512 PNGs. `theme_color` is `#0e141c` and
`background_color` `#06090d`; both should be re-ruled against the new palette.
**Tripwire:** `src/lib/pwa/manifest.test.ts` asserts the icon list is exactly
`['/icon.svg','/apple-icon']`, that both exist on disk, that apple-icon is 180×180,
and that `layout.tsx`'s `themeColor` string-matches `PWA_THEME_COLOR` — the test
must be updated in the same commit.

**D.1.5 — OG / share image.** `src/app/opengraph-image.tsx:42–48` currently draws
`SUPASNAKE` as 96px text in `OG_COLORS.accent`. With a traced SVG the mark can be
inlined into Satori directly. The palette it draws from, `src/lib/og/brand.ts:10–19`,
is **stale cyan** (`accent: '#22d3ee'`) and its own header claims it mirrors the app
palette — it does not. See F.

**D.1.6 — The purple question.** The burst introduces purple as a brand colour. This
document does **not** assume it enters the design tokens. See **T-2**, which is the
sharpest tension in the audit.

---

## E. META SURFACES

Verified up front: **nothing in the meta layer is 3D.** `<Canvas>` appears in four
places only — `app/game/page.tsx`, `app/training/page.tsx`, `app/dev/perf/page.tsx`,
and `components/home/SpecimenChamber.tsx`. Every route below is DOM + CSS + inline
SVG, plus two image pipelines (Satori OG, canvas genome card).

| # | Element | Current state (verified) | Verdict | Direction | Size |
|---|---|---|---|---|---|
| E1 | **Collection grid + variant cards** | `src/components/lab/CollectionGrid.tsx` (explicitly *"Panini sticker book style"*, 3-column) + `src/components/lab/VariantCard.tsx:52–60` — 3:4 cards whose entire identity is `RARITY_STYLE`: a CSS border colour and a box-shadow that escalates common→legendary (legendary gets `animate-glow-pulse`). | **REQUIRED — highest IP value in the audit** | This is the collectible surface, and its "sticker book" intent is currently carried by a glowing CSS border. It wants a **real card**: ink tier-3 frame, flat displaced drop, an authored rarity treatment that is a *drawn* property (frame weight, corner treatment, a printed foil band) rather than a light. Note `assets/Collection_Cards/Collection Card OG SNAKE_Speedlines-1.png` is **1200×1800 (2:3)** while the shipped card is **3:4** — the art direction and the code already disagree on aspect. | **L** |
| E2 | **Variant card art** | `src/components/lab/SnakeArt.tsx:67–75` — **procedural deterministic SVG**: a mulberry32-seeded sine-wave snake body with a per-dynasty motif and a `RARITY_FRAME` stroke/glow table. This is the actual art for all 30 variants (`variant.artUrl` is null for the shipped catalog). | **REQUIRED** | A sine wave is the opposite of a chunky cube character. Every owned snake in the product is currently depicted as a smooth curve while the snake you play is a chain of blocks. Redraw the generator in the cube law — segments, ink contour, authored tones — so a card depicts the thing you drove. **This is the single largest coherence gap outside the run.** | **L** |
| E3 | **Variant detail modal** | `src/components/lab/VariantDetailModal.tsx:294, 430` — full-screen `panel-elevated` sheet; art, sibling roster, traits, strains, Ascendance yield. | **RECOMMENDED** | Inherits C1 + E1/E2. | **M** |
| E4 | **Breeding surfaces** | `src/components/breeding/{ParentSlot,SnakePicker,BreedingReveal}.tsx`; draft board `app/lab/breed/page.tsx:560–575`. | **RECOMMENDED** | Inherits E1/E2. The reveal is a character moment that currently has no character in it. | **M** |
| E5 | **Mastery + collection progress** | `src/components/lab/MasteryPanel.tsx` (M1–M10 rung track), `CollectionProgress.tsx`, `DynastyTabs.tsx` (glowing segmented control). | **RECOMMENDED** | Inherits C1/C2. | **M** |
| E6 | **Workbench / Codex** | `src/app/codex/page.tsx:174–320` + `src/components/workbench/WorkbenchView.tsx` (+ `.module.css`). Note the Workbench is on `/codex`, **not** `/lab`. `codex/page.tsx:187` references `btn-secondary`, **which is undefined in `globals.css`**. | **REQUIRED — FOLD INTO WAVE 7** | Wave 7 owns the slot-first Workbench production. Fold the style in there. Fix the undefined class while the file is open. | **M** |
| E7 | **Leaderboard podium + table** | `src/app/leaderboard/page.tsx:388–419` — 3-up `panel-glow` with metal `--glow` per rank, rank-1 `animate-breathe`; table rows with gradient tints; `RankBadge:91–118`. | **RECOMMENDED** | Podium metals as coloured glows should become drawn medals — a natural character/sticker surface. The 8-rung difficulty ladder is **not** here; it is the pre-run selector at `game/page.tsx:2597–2630` and inherits B4. | **M** |
| E8 | **Clan** | `src/app/clan/page.tsx:308–423` — `panel-glow [--glow:#a855f7]` hero; founding form uses **CSS-gradient banner swatches** (`:394–402`, `linear-gradient(120deg, from, to)`) and **text-glyph emblem buttons** (`:409–423`) from `src/lib/clan/heraldry.ts`. | **RECOMMENDED** | Heraldry rendered as CSS gradients and text glyphs is placeholder-grade, and heraldry is exactly the kind of thing this direction draws well. Same root problem as E10. | **M** |
| E9 | **Shop (identity district)** | `src/app/shop/page.tsx` is **157 lines total**. WP-0.09 deleted the storefront; the only commercial surface is `src/components/engagement/PremiumSection.tsx:161–263` — one amber `panel-glow` card with three hardcoded text perks and a monthly/yearly toggle. **No cosmetic browser, no item grid, no preview of any kind.** | **REQUIRED — but note what is actually missing** | There is almost nothing here to *restyle*; what is required is that the surface the Constitution promises gets built to this direction rather than retrofitted later. §10.2 names **The Atelier** (permanent cosmetic storefront, never rotates out) and **Patron Packs** — neither exists in code. This is the merch-adjacent surface and it is a greenfield. Also: shipped prices are €9.99/€89.99 under the old "Premium" name; the Constitution says Keeper at €3.99/€34.99. That divergence is not an art item but sits in the same file. | **M** |
| E10 | **Cosmetic item rendering** | The registry is **SQL, not TypeScript**: `supabase/migrations/022_identity_core.sql:290–302`, six slots `title/banner/badge/trail/board_accent/emblem`. Rendering today: `banner` = a CSS `linear-gradient` (`PlayerCard.tsx:69–73`); `badge` = a **generic `IconMedal` for every badge — the `glyph` field is never read** (`:137–155`); `title` = plain text. **`trail`, `board_accent` and `emblem` have no renderer at all.** | **REQUIRED — and this is the monetization surface** | Identity is the *only* thing the product may sell (§10.2: *"SupaSnake sells appearance, continuity, and patronage"*), and half of what it sells is currently undepicted while the other half is a gradient and a shared icon. A 90s cartoon direction whose whole premise is characters→collectibles→merch cannot leave this. **System-shaped** — a renderer plus an asset pipeline arms the doctrine prior-art gate (`ENGINEERING_DOCTRINE.md:242–282`) and FM-13's `AssetGate` rule. | **L** |
| E11 | **PlayerCard** | `src/components/identity/PlayerCard.tsx:51–66, 106–110` — the identity render across every meta surface; `SnakeArt` avatar inside a mastery-tiered frame (`plain/inlaid/gilt/animated`), plus a second offset `outline: 1px solid #fbbf24` founder ring. | **REQUIRED** | Two frame systems (rarity in E1, mastery here) that must become one drawn language or the product will have two ideas of what a frame means. Mounted in 7 places, so it moves a lot of surface at once. **Constraint:** R8 forbids payment buying *earned-proof styling* — the mastery/founder frames must stay visually distinct from anything purchasable. | **M** |
| E12 | **Chronicle / records cabinet** | `src/components/chronicle/ChronicleView.tsx:57–90` + `RecordsCabinet.tsx:21–43` — 21 records in 6 categories, tier glyphs on the rarity ramp, capstone progress rings. | **RECOMMENDED** | The product's trophy room, currently rendered as dots and rings. High character potential, low urgency. | **M** |
| E13 | **Auth pages** | `src/app/{login,signup}/page.tsx` and `auth/{forgot,reset}-password` — each renders `/brand/mascot-sm.png` at 104px with `animate-float` and a **stale cyan** `drop-shadow-[0_0_28px_rgba(34,211,238,0.4)]`, then a text `SUPASNAKE` wordmark, then a `panel-glow [--glow:#22d3ee]` form. | **REQUIRED** | These are the only pages that show a mascot image, and it is the **old** mascot — superseded by the character sheet. Four pages, one asset swap plus the logo from D.1, plus removing five hardcoded cyan literals. | **S** |
| E14 | **Settings** | `src/app/settings/page.tsx:70–177` — a vertical stack of uniform `panel-elevated` cards. | **FINE AS-IS** | Inherits C1 entirely. Nothing bespoke. | — |
| E15 | **Legal pages + footers** | `src/app/legal/*/page.tsx` — `main` is flat `bg-scale-blue-dark` (**not** `.app-bg`) and each section is `border-[3px] border-scale-blue-light rounded-arcade` — a 3px hard border, heavier than the 1px `.panel` used everywhere else. | **RECOMMENDED** | Ironically the closest thing in the product to a bold drawn frame, arrived at by accident. Unify it into the tier system (C1) rather than leaving a fourth grammar. | **S** |
| E16 | **Share artifact landings** | `src/components/share/ArtifactLanding.tsx` — one server component for six artifact classes, plus routes `app/{b,c,p,r,s,w,x}/[…]/page.tsx`. | **RECOMMENDED** | The page a stranger lands on from a share. Inherits C1; pairs with F3. | **S** |

**Section E tally — 16 elements:** 7 REQUIRED · 8 RECOMMENDED · 1 FINE AS-IS.

---

## F. SYSTEM AND OUTWARD-FACING ASSETS

The headline finding: **there is almost no raster brand asset to replace.** The
entire system-level identity — favicon, app icon, OG cards, Twitter cards, email
chrome, Discord embeds — is generated at runtime from about eight hex literals and
inline SVG path data. That makes this section cheap to execute and easy to leave
undone, because none of it is visible from inside the product.

| # | Element | Current state (verified) | Verdict | Direction | Size |
|---|---|---|---|---|---|
| F1 | **Favicon + apple icon** | `src/app/icon.svg` and `src/app/apple-icon.tsx:26–36` — the same hand-written path data written twice, both **stale cyan** (`#22d3ee` / `#67e8f9`). No `favicon.ico`, no `icon.png`. | **REQUIRED** | See D.1.3. Derive once, consume twice. | **S** |
| F2 | **PWA manifest** | `src/lib/pwa/manifest.ts` + `src/app/manifest.webmanifest/route.ts` (flag-gated on `NEXT_PUBLIC_PWA_V1`). Two icons, both `purpose: 'any'`; **no maskable, no 192/512, no shortcuts, no splash, no `apple-touch-startup-image`**. `theme_color #0e141c`, `background_color #06090d`. | **REQUIRED** | See D.1.4, including the test tripwire. | **S** |
| F3 | **OG / Twitter card generators** | 12 routes, all through `src/lib/og/artifactCard.tsx`, tokens in `src/lib/og/brand.ts:10–19`. Satori flexbox subset, flat rectangles, **`fontFamily: 'sans-serif'`**, no images, no external fonts. `src/app/twitter-image.tsx` is a re-export of the OG card. | **REQUIRED** | Every share impression the product makes, currently rendered in the system sans-serif on a retired palette. Two files cover ten of the twelve routes. Inlining a traced SVG mark (D.1.5) and embedding a display font buffer via `ImageResponse`'s `fonts` option are both possible and neither is wired today. | **L** |
| F4 | **`src/lib/og/brand.ts`** | `accent: '#22d3ee'`, `accentLight: '#67e8f9'`, `boneWhite: '#e6edf3'`. Its header claims it mirrors the app palette; **it does not** — the app shipped `--venom-orange: #f2a03f` in the INK & AMBER cutover (verified in the served stylesheet, `docs/ops/QA_CHECKLIST.md:159–162`). | **REQUIRED** | A one-file fix that corrects every outward image at once. Do it first in F3's WP. | **S** |
| F5 | **`layout.tsx` metadata** | `src/app/layout.tsx:96` — `viewport.themeColor: '#0e141c'`. **`appleWebApp` is entirely absent** (no `statusBarStyle`, no `capable`, no startup images). | **REQUIRED** | Trivial, and pinned by `manifest.test.ts` — must move with F2. | **S** |
| F6 | **Notification icon** | `src/lib/pwa/serviceWorkerSource.ts:106` — `icon: '/icon.svg'` is the **only** image in the push path. No `badge`, no `image`, no `actions`, all test-enforced absent. | **FINE AS-IS structurally** | Inherits F1 for free. The deliberate absences are ruled, not gaps. | — |
| F7 | **Email templates** | `src/lib/growth/dispatchEmail.ts` and `settlementEmail.ts` — inline CSS strings, `#06090d` ground, `#121a24→#0a1017` card, **`#22d3ee` kicker and CTA button** (stale cyan), `font-family: 'Segoe UI', Arial`. **No `<img>`, no logo, no attachment in any email.** Supabase auth emails use hosted defaults (`supabase/config.toml` has no template blocks). | **RECOMMENDED** | Two files, inline CSS, and the same stale palette as F4. Adding the mark is a new capability (hosted image URL), not a restyle. | **S** |
| F8 | **Discord embeds** | `src/lib/server/discordSync.ts:185` — `EMBED_COLOR = 0xf97316`, **genuine orange and the one place in the codebase where "venom orange" actually renders orange**; `0xfacc15` gold for `season_champion` (:257). Embeds carry **no image, thumbnail, or icon_url**; the `WebhookMessage` type (`discord.ts:638–641`) exposes only title/description/color/fields. | **RECOMMENDED** | Align `0xf97316` to the actual token (`#f2a03f`) and consider widening the type so the mark can ride along. Cheap; visible in every clan channel. | **S** |
| F9 | **Fonts** | **No font files in the repo.** `Russo_One` + `Rajdhani` via `next/font/google` (`layout.tsx:2–18`), CSP allows `fonts.googleapis.com` (`middleware.ts:112`). Satori cannot use them. | **RECOMMENDED — gated on C9** | If the display face changes, this is where it lands, and F3 needs the buffer regardless. | **M** |
| F10 | **Repo brand assets** | `assets/` root: 7 tracked source PNGs (~21 MB), **none referenced by `src/`**. `assets/Textures/` (40 MB), `assets/Inspiration/` (6.5 MB), `assets/Collection_Cards/` (4.6 MB): **all untracked**. The 7 `assets/New/TEX_*.png` showing as deleted are the same files moved into `assets/Textures/` without `git mv` — nothing breaks. `public/brand/mascot.png` (391 KB) is **referenced by nothing**. | **RECOMMENDED — housekeeping, do it early** | Stage the comic/paper/speedline textures (they are this direction's raw material), delete the unreferenced mascot, and decide whether `assets/` root belongs in the repo at all. The parked "repo-weight cleanup (~71 MB)" in `docs/PROGRAM_PLAN.md:79` is the same job. | **S** |
| F11 | **Service worker / install / offline** | `src/components/pwa/InstallOffer.tsx` contains **no image or icon** — text only. No offline page, by design (no `fetch` handler, server authority). | **RECOMMENDED** | The install offer is the moment someone puts the mark on their home screen and it currently shows them nothing. | **S** |

**Section F tally — 11 elements:** 5 REQUIRED · 5 RECOMMENDED · 1 FINE AS-IS.

---

## G. TOTALS

| Section | Elements | REQUIRED | RECOMMENDED | FINE AS-IS | DELETE |
|---|---:|---:|---:|---:|---:|
| A · In-play 3D objects | 35 | 12 | 14 | 9 | — |
| B · Decision surfaces | 13 | 4 | 6 | 1 | 2 |
| C · Chrome | 21 | 8 | 8 | 4 | 1 |
| D · Home | 10 | 3 | 6 | 1 | — |
| E · Meta surfaces | 16 | 7 | 8 | 1 | — |
| F · System / outward | 11 | 5 | 5 | 1 | — |
| **Total** | **106** | **39** | **47** | **17** | **3** |

Four already-ratified items (the snake, the board, the chamber creature, the
cosmetics) are excluded from the count; they are the composition, not consequences
of it.

The shape of that table is the finding. **Only 17 of 106 surfaces are untouched by
this direction**, and the largest block of REQUIRED work is not on the board — it is
in the chrome and the collection, where the product's characters become objects a
player owns.

---

## H. TENSIONS WITH EXISTING RATIFIED RULINGS

> **RATIFIED 2026-08-07 — owner accepted ALL recommendations below as written**
> ("design is approved. accept all recommendations from the ruling batch").
> Every *Recommendation* paragraph in this section is therefore a RULING:
> T-1 shade scoped by ground · T-2 purple is logo-only, never a token ·
> T-3 internal ink for characters, never fields (LAW) · T-4 focus-blur stays ·
> T-5 both highlight mechanisms stay · T-6 two grounds legal, converge via the
> game sky if ever · T-7 ThemeManager dies inside 90S-5 · T-8 headings stay
> Russo One for v1, mark ships as asset · T-9 styleguide radius line retired,
> one radius per role · T-10 gap-derived hull for the creature only, weights
> chosen per object. T-11/T-12 were actioned before ratification (checkout
> pulled; ET-5 production in flight). The round-3 composition
> (concept/board-neon-themes @ 9f63939) is the FINAL APPROVED design.


These are listed, not resolved. Each carries a recommendation the owner may take or
overturn. Two of them (T-2, T-8) gate the first work package and should be ruled
before it opens.

**T-1 · The drawn shade vs. the printed frame.**
`globals.css:80–121` rules that every paper frame carries a 1px grey companion line
immediately outside it, because *"nothing a hand draws has two identical edges."*
The 90s grammar reaches the same goal by the opposite route: a single hard stroke
plus a **flat displaced drop** (`--ink-drop-2/-3`, *"No blur: a soft shadow is a
lighting effect and this is a printed object"*, `:123–125`) — which is deliberately
two identical edges, because a printed object has them.
*Recommendation:* keep both, and rule the boundary rather than picking a winner. The
shade is a **paper-on-dark** device and earns its keep exactly where an ink line
would vanish (`:41–45`). The 90s direction moves surfaces toward light grounds, where
`:133–135` already says *"ink IS the shade"* — so the tension largely dissolves on
its own. **Do not delete the token; scope it.**

**T-2 · Purple as brand vs. purple as data. (Sharpest tension. Ruling needed first.)**
The new logo makes purple a brand colour. Purple is already spent four ways, all
semantic: `--pulse #8b5cf6` (`globals.css:25`), COSMIC `#a855f7` / `#6A0DAD`,
`rarity-epic #a78bfa`, and FLUX/**Warp** `#a642f5` (`strains.ts:54`). On the board it
is load-bearing twice over: `MutationBeacon.tsx:10` — *"Violet is deliberately
outside every dynasty accent"* — and `TacticalLoomDecision.module.css:39–40` —
*"Violet stays: it is the universal mutation/gene hue."* There is also direct
precedent **against** doing this: cyan was pulled from global-accent duty and
*"released back to CYBER, where it means dynasty rather than accent"* (`globals.css:13–15`).
*Recommendation:* **the burst's purple stays a logo colour and does not enter the
token set.** Confine it to brand assets — the mark, favicon, PWA, OG, splash — where
no gameplay meaning is being read. If the owner wants purple as product chrome, it
must first be evicted from one of its four meanings, and the only cheap eviction is
`--pulse` (used by the "You" chip and toast accents); COSMIC, epic and FLUX are all
information a player decodes.

**T-3 · The line-free board vs. "internal lines separate body cubes".**
Style guide §3 asks for *"thinner dark internal lines"*; the owner ruling of
2026-08-07 deleted every drawn cell boundary — *"we don't need the gridlines now
anymore, they are rather a disturbance."* `boardTiles.ts` already records the
resolution: the guide *allows* an internal line and does not require one, and on a
field of 400 identical blocks 40 of them stop reading as boundaries and start reading
as a grid.
*Recommendation:* **promote that resolution to a general rule** — internal ink is for
the CHARACTER, forbidden on FIELDS of repeated elements. It then also governs the
cockpit gene rack, the collection grid and the strain gauges, which are the next
three places this question will arise.

**T-4 · Decision focus-blur vs. "a drawing has no lens".**
`CockpitPrototype.module.css:889–899` overturned the earlier blur-free rule on
purpose and says so: *"Do not 'restore' the blur-free rule; it was overturned on
purpose."* The double blur was separately deleted at `:812–818`.
*Recommendation:* **keep it, and do not re-litigate.** The blur is applied to
`.arenaBay` — a 3D room — not to a drawn surface. The 90s objection is to soft edges
and soft shadows *on drawn objects*; depth of field on a photographed scene is a
different thing. Flagged only because a literal reading of the direction would delete
it.

**T-5 · The toon ramp's 214 ceiling vs. "bright graphic highlights".**
`inkAmber.ts:98–101` caps the top band short of white — *"Three bands of COLOUR, not
two bands and a sheet of paper."* The character sheet's rim is *brighter* than its
own highlight swatch.
*Recommendation:* **not a real conflict — record it so nobody "fixes" it.** These are
two mechanisms: the 214 cap governs the **lit** ramp (`getToonGradientMap`), while
`snake90s.ts` solves the authored case with `TONE_RIM_LIFT`, an additive warm lift
rather than a wash toward white. Both are correct in their own domain. Once A8 ports
the food to authored tones, the lit ramp's remaining consumers are terrain and the
board.

**T-6 · The bright chamber vs. the dark neon board.**
Home is a near-white warm paper studio, ruled twice (*"no black"*). The board is dark
neon. Chamber = game law binds the **creature**, not the room
(`InstancedSnake.tsx:142–148`: both read one answer, `read_snake_loadout`).
*Recommendation:* no conflict in law, but the product now has two grounds. If the
owner wants one look, the cheap move is to bring the **game's** environment toward
the chamber — a drawn cartoon sky replacing the space photograph (A33, WP 90S-7) —
**not** to darken the chamber, which has been ruled against twice.

**T-7 · The palette fork.**
Three dynasty palettes are live simultaneously: `gameScreenTokens.ts` /
`gameMaterialProfiles.ts` (INK & AMBER canonical), the legacy
`src/lib/theme/ThemeManager.ts:30–58` (still driving `Particles.tsx`, the released
non-cockpit arena rollback path, and `foodColor`), and `useDynastyTheme.ts` (DOM).
*Recommendation:* the particle rework (A24/A25, WP 90S-5) is the natural moment to
cut `ThemeManager` out of the render path, because it is the last in-play consumer.
Do it there rather than as its own WP; a palette-unification WP with no visible
output is the kind that never ships.

**T-8 · Russo One vs. the sheet's lettering. (Ruling needed before 90S-1.)**
`layout.tsx:2–18` ships Russo One (squarish techno) and Rajdhani. The style sheet and
the logo are a heavy brush comic face. The wordmark ruling
(`HomeIdentityHud.tsx:50–66`) locks the per-glyph table and forbids filters but does
**not** lock the face.
*Recommendation:* the logo arriving as an SVG **asset** removes this question from
the mark itself. Ship v1 with Russo One for headings — it is not offensive against
the sheet — and treat a display-face swap as its own owner judgement with a real
licensing and loading cost (and a Satori font-buffer consequence, F3/F9).

**T-9 · Radius: three rules, four practices.**
`styleguide/styleguide.md:39` says *"Hard edges or minimal radius (max 4px). No fully
rounded corners."* Tailwind ships one token, `rounded-arcade: 4px`. `.modal-frame`
uses **26px**. `.ink-chip` uses `rounded-full`. The 3D law meanwhile asks for
*substantial* rounded bevels.
*Recommendation:* **retire the styleguide line** — it is already broken by two
shipped surfaces that were each ruled deliberately — and replace it with one radius
per role (chip / card / tray), recorded in `globals.css` beside the outline tiers.

**T-10 · Two laws for one constant (the ink hull width).**
`inkAmber.ts:36–41` caps `INK_HULL_WIDTH` at `0.058`, bounded by *"the weight where
neighbouring coil segments start to merge into one black mass."* `snake90s.ts` raises
it to `0.095` and re-derives the bound from the free-running gap.
*Recommendation:* adopt the gap derivation — it is the honest bound and the earlier
percentage note *"was a number with no meaning"* by its own admission. **But do not
propagate 0.095 automatically:** terrain, food, THE LEAD and the arena all call
`createInkHullMaterial()` and are not chains of cubes. The gap argument is specific
to the creature; every other object needs its weight chosen, not inherited.

**T-11 · The stale worktree. (Not a style tension; the only one that can destroy work.)**
`/Volumes/Souci_WD/Dev/active/SupaSnake` is 60 commits behind `origin/main` and does
not contain `inkAmber.ts` at all.
*Recommendation:* **pull before any WP branches.** A design package branched from
here would silently revert the entire INK & AMBER release, and because the revert
would look like a *style change* it is exactly the kind that survives review.

**T-12 · The composition was judged at a camera that is not the ratified one.**
ET-5's ratified `az=+0.0 pitch=28.0 fit=1.00 target=+0.0,+0.0 fov=44` exists only in
the **untracked** `docs/PROGRAM_PLAN.md:64–69` and matches nothing on any git ref.
The live rig is `COCKPIT_DEFAULT_POLAR = 26°`, `COCKPIT_FIT_SCALE ≈ 1.41`,
`COCKPIT_TARGET_Y = -0.3`, with `OrbitControls` still imported
(`CameraRig.tsx:25, 65, 115–118`).
*Recommendation:* the tile bevel, the inter-cube gap and the ink weight are all
framing-dependent reads, and every one of them was approved at the **live** framing.
Land ET-5 (Wave 6) **before** the board-adjacent art WPs, or re-judge the composition
after it lands. Also: get the ratification out of an untracked file.

---

## I. PROPOSED WORK-PACKAGE DECOMPOSITION

Ordered by **player-visibility × IP value**. Sizes are relative, not calendar.
Every package inherits the standing constraints: concept-first for anything the owner
judges visually; a `NEXT_PUBLIC_*` flag with a deliberately tested rollback for any
new player-visible surface (`docs/CONSTITUTION_CHECKLIST.md:102–103`); a release
record per deploy.

### I.1 — What folds into waves that already exist

`docs/PROGRAM_PLAN.md` Waves 6 and 7 already own four of these surfaces. **Style
guidance folds into the pending WP; it does not arrive as a second pass over the same
file.**

| Fold | Into | Item |
|---|---|---|
| THE DROP card grammar | **Wave 6** — DROP redesign production | B1 |
| Camera-before-art sequencing | **Wave 6** — ET-5 canonical camera | A35 / T-12 |
| Results card + payout grammar | **Wave 7** — Results restructure | B5 |
| Workbench surface styling | **Wave 7** — Workbench slot-first | E6 |
| Rune restyle + floating "i" | **Wave 7** — Codex/Workbench runes | D4 |
| Daily Take as a drawn token | **Wave 7** — Daily Take float (D2) | D5 |

### I.2 — New packages

**90S-0 · THE TWO RULINGS** — *owner session, no code.* **S**
Resolves **T-2** (does purple enter the token set?) and **T-8** (does the display face
change?). Both gate 90S-1 and 90S-2; ruling them after those ship means doing them
twice. Also settles T-9 (one radius per role) and T-10 (ink weight per object class)
while the owner is in the file.

**90S-1 · THE MARK** — **M/L** · *covers D2 · D.1 · F1 · F2 · F4 · F5 · E13*
Production derivation of `LOGO.jpg` (transparent master → SVG trace → raster ladder),
hero placement on Home under the locked geometry, favicon + apple icon from the
**character head** (not the wordmark), maskable + 192/512 PWA icons, the
`og/brand.ts` palette correction, `themeColor`, and the four auth pages including
retirement of the old mascot PNG.
*Why first:* highest IP value, zero gameplay risk, no dependency on any other package,
and it corrects the stale-cyan brand layer that currently ships on every favicon, OG
card and email. **Tripwire:** `src/lib/pwa/manifest.test.ts` must move in the same
commit.

**90S-2 · THE CHROME LAW** — **L** · *covers C1 · C2 · C4 · C8 · C13 · C21 · B12 · B13*
One edit to `globals.css:177–246` re-skins ~90% of the product: panel classes move
from the lit grammar (inset edge light, soft drop, coloured bloom) to the printed one
already tokenised beside them (ink/paper tiers, flat displaced drop). **The cockpit
decision-dock override at `CockpitPrototype.module.css:695–772` must move in the same
package or no in-run decision surface will change at all.**
*Sequencing:* the four deletions (legacy HUD deck, legacy Results, `MutationChoiceOverlay`,
`ui/Panel.tsx`) go **first**, so nothing is styled twice. Extract
`CHOICE_INPUT_LOCK_MS` before removing B12. `ModalDialog` consolidation (C13) turns
the follow-on decision-surface work from six files into one.

**90S-3 · THE EXTRACTION** — **L** · *covers A1 · A2 · A3 · A4 · A6 · A7*
The exit portal rebuilt as a chunky beveled ring with authored tones and a real ink
hull; the beam kept as the one permitted light; the Arial Black "EXTRACT" sprite
replaced with the `RunRateCallout` lettering idiom; the Side Door drawn as the
portal's smaller sibling.
*Why here:* extraction is the product's central mechanic and its object is currently
the least-drawn thing on the board.

**90S-4 · THE PICKUPS** — **M** · *covers A8 · A9 · A10 · A11 · A12 · A13*
Food ported to `applyFaceKeyedShading` (it is the object that will visibly disagree
with the creature first), GOLDEN HOUR ring and wager cube carried along, the mutation
beacon rebuilt out of PBR, genome target sigils given physical bodies.
*Note:* GOLDEN HOUR has **no rendered board object today** — styling it and wiring it
are separate decisions and only the first belongs here.

**90S-5 · THE INSTRUMENTS** — **M** · *covers C5 · C6 · C7*
The cockpit instrument frame reduced from four mechanisms to one ink frame, and all
**38 marks** (15 cockpit glyphs + 23 global icons) redrawn as filled shapes with bold
contours.
*IP note:* these are the product's smallest reusable drawings and the natural seed
for stickers and merch. Do them as one drawing pass so they stay one hand.

**90S-6 · THE COLLECTION** — **L** · *covers E1 · E2 · E3 · E11 · B6*
The variant card as a real card (ink tier-3 frame, flat drop, drawn rarity), and —
the larger half — **`SnakeArt.tsx` redrawn in the cube law**, so an owned snake is
depicted as the blocky character you actually drove instead of a smooth sine wave.
Unifies the two competing frame systems (rarity and mastery/founder) into one drawn
language, and promotes the existing "ALL IN" stamp to a named primitive.
*Constraints:* R8 forbids payment buying earned-proof styling, so mastery and founder
frames must stay visually distinct from anything purchasable. Settle the 2:3 vs 3:4
aspect disagreement between `assets/Collection_Cards/` and the shipped card.

**90S-7 · THE EFFECTS** — **M** · *covers A17 · A18 · A20 · A23 · A24 · A25 · A26 · A27 · A29 · A30*
Centrepiece: both particle systems replaced — point sprites become instanced,
ink-hulled cube shards, so the snake comes apart into its own cubes on death. Plus the
terrain's forming amber and runes given hulls, the Firefly marker rebuilt or deleted,
gilded wake and coil seal flattened to authored values, training path brought in.
*Constraint:* Constitution **R1** — every one of these is a **replacement at an
existing trigger**, never an addition. The PR should say so explicitly.
*Rider:* cut `ThemeManager` out of the render path here (T-7); this is its last in-play
consumer.

**90S-8 · THE ROOM** — **M** · *covers A33 · A32 · D1 · C19 · C20*
The space-photograph backdrop replaced with a drawn cartoon sky (the single largest
remaining style seam in a run), the light rig re-scoped now that the creature ignores
it, the chamber's room finished around the already-converted creature, and the
missing/unstyled error surfaces built (`global-error` is inline `system-ui` today;
`error.tsx` and `not-found.tsx` do not exist).
*Blocked by:* T-6 should be ruled first — this package is where "one ground or two"
gets answered.

**90S-9 · THE OUTWARD ARTIFACTS** — **M/L** · *covers F3 · B7 · F7 · F8 · F11 · E16*
The Satori card system (12 routes through 2 files) rebuilt on the corrected palette
with the traced mark inlined and a display font embedded; the raw-canvas genome share
card (a second, divergent art direction with two fonts the app does not load) rebuilt
against the same tokens; email chrome, Discord embed colour, install offer, share
landings.
*Why late:* every one of these is an acquisition surface, and they are worth more once
the product they advertise looks like the advertisement.

**90S-10 · THE COSMETIC RENDERER AND THE ATELIER** — **L** · *covers E10 · E9 · D7 · E8*
The largest package and the one the direction's whole premise points at: identity is
the **only** thing the product may sell, and **three of six cosmetic slots (`trail`,
`board_accent`, `emblem`) have no renderer at all**, while `badge` ignores its own
`glyph` field and draws a shared medal for every item. Build the renderer, then the
Atelier presentation §10.2 promises and code does not have, then the wardrobe and
clan heraldry that depend on it.
*Gate:* **system-shaped.** A renderer plus an asset pipeline arms the doctrine
prior-art brief (`ENGINEERING_DOCTRINE.md:242–282`) and FM-13's `AssetGate` rule —
*"anything the player must see falls back to the primitive version of itself, never
to an empty scene."* Also carries R13 (state the permanent operating cost: a cosmetic
catalog has a content cadence).
*Why last:* it needs the mark, the chrome law, the card grammar and the character
renderer to all exist before it has anything to render.

**90S-H · HOUSEKEEPING** — **S** · *covers F10, plus the long tail*
Stage the untracked comic/paper/speedline textures (40 MB currently outside version
control and precisely this direction's raw material), delete the unreferenced
`public/brand/mascot.png`, and fold the parked ~71 MB repo-weight cleanup
(`PROGRAM_PLAN.md:79`) into whichever train is moving. Rides any package.

### I.3 — The RECOMMENDED tail

The 47 RECOMMENDED items are deliberately **not** given their own packages. Almost
all of them inherit their fix from 90S-2 (the chrome law) at zero marginal cost —
settings, footer, legal, spinners, skeletons, toasts, dock surfaces, nav, chronicle,
leaderboard, breeding, mastery. The correct handling is a single sweep **after**
90S-2 lands, fixing what the law did not reach, rather than eleven small packages
that each re-open the same files.

---

*Compiled 2026-08-07. All citations against `origin/main` (`baf0ebc`) unless marked;
concept citations against `concept/board-neon-themes` (`710baf8`). This document
classifies and proposes; it ratifies nothing.*
