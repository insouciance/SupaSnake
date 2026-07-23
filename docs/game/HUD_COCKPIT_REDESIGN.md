# SupaSnake Run Cockpit & Arena — Premium Game-Screen Redesign

**Status:** implementation-ready product and engineering plan

**Date:** 2026-07-23

**Implementation checkpoint:** Phase 0 is implemented and verified in the
isolated `feat/cockpit-v1` worktree. The static whole-screen fixture passes 8
viewports × 4 telemetry states with a centered, stable, unobstructed board,
14px minimum visible text, 44px controls, explicit background crops, and no
overflow. The Phase 1 isolated WebGL foundation is also running with the
canonical environment component, shared DOM/Three.js tokens, physical arena
undertray, matte floor/grid, camera tuning, and real entity previews; it adds
3 measured raw-scene draw calls versus the released arena. Nothing is wired to
the live `/game` route or deployed yet.

**Scope:** the complete active game screen: authored background treatment,
cockpit chassis, arena geometry and materials, board grid, camera/framing,
lighting, run telemetry, genes, strains, prompts, pause/choice presentation,
responsive behavior, accessibility, performance, and rollout

**Non-goal:** gameplay rules, economy, progression, input semantics, validation
rules, or replacement/redrawing of the player-authored background artwork

## 1. Product intent

The game board is the hero. SupaSnake should feel like a premium competitive
arena seated inside a purpose-built instrument panel and a coherent authored
world, not a web dashboard stacked above a canvas or a grid floating over
unrelated wallpaper.

The run cockpit must be:

- **user-first:** information is ranked by what helps the player act now;
- **board-first:** the playable board stays centered and unobstructed;
- **coherent:** background, cockpit, arena, lighting, entities, and telemetry
  read as one art-directed game screen;
- **glanceable:** symbols, silhouettes, values, and short state changes replace
  microcopy;
- **stable:** telemetry updates never resize, shift, or cover the board;
- **learnable:** a gene uses the same icon in its offer, held slot, pause detail,
  results, and Codex;
- **premium:** restrained materials, precise alignment, controlled motion, and
  strong hierarchy replace rows of generic glowing chips;
- **competitive:** a spectator can read score, run value, mode, build, and strain
  direction from a 1080p capture;
- **accessible:** color is never the only channel and no gameplay-relevant state
  depends on tiny text, hover, or animation.

“AAA” does not mean more decoration. It means that every pixel has a job, every
state is intentional, and the player trusts the interface without studying it.

## 2. Current-state audit

### What is working

- The active HUD participates in document flow, so the board no longer starts
  underneath it on first paint.
- Score, DNA, energy, bank/crash, combo, anomaly, mode, genes, and five strains
  already have authoritative live data.
- The engine is held until deliberate first/resume input.
- Safe-area and consent containment exist.
- The eight-viewport regression matrix and geometry assertions provide a strong
  baseline.
- The player-authored 2048×2048 space artwork already provides a distinctive
  diagonal nebula, cool star field, and recognizable SupaSnake atmosphere.
- The arena already has a useful five-cell major-grid cadence, a neutral dark
  floor, restrained dynasty lighting, and semantic COSMIC border phases.
- The camera already auto-fits the complete board, supports safe zoom/pitch,
  and magnetically returns to side-aligned competitive views.

### What must change

- The active HUD is a dense header. On desktop and landscape it consumes height
  while large lateral areas sit unused.
- `SupaSnake`, `Run telemetry`, `Build`, `No genes acquired`, and five `Dormant`
  labels compete with actual run state.
- Gene chips use 10–11px two-letter monograms. They are not meaningful symbols
  and are especially illegible on mobile.
- Strain cards use 8–9px labels and tier names. Their colored rectangles are too
  similar in silhouette and require reading.
- Energy occupies a primary active-run slot even though it is spent at run start
  and normally does not change during the run.
- Bank/crash value, combo, anomaly, and mode appear as conditional chips. Their
  insertion is visually noisy even when geometry is reserved.
- The current Ready/Choose Your Line card, Expression flourish, Pause menu, gene
  choice, portal choice, and surge choice visually cover the board.
- The frozen candidate improves space reservation and input safety, but its
  compact grid/status-rail visual treatment is not the desired premium design.
- The authored background is currently shown at only `0.12` opacity with a
  generic centered `cover` crop. Its identity is almost lost, while bright
  stars can still land unpredictably behind important objects at some aspect
  ratios.
- The board reads as a thin clear-coated slab with four luminous rails rather
  than an arena mechanically seated inside the cockpit.
- The floor edge wash, border glow, snake, food, portal, and bloom all compete
  in nearby luminance bands. Semantic objects need a clearer contrast ladder.
- Camera fitting currently understands the Canvas rectangle but not the visual
  mass of the arena chassis. The new frame, crop, and telemetry must be tuned as
  one composition at every target aspect ratio.

## 3. Research synthesis

This direction uses principles rather than copying another game's skin.

- Riot's competitive-clarity work prioritizes immediate understanding,
  hierarchy, and low visual noise. That becomes SupaSnake's rule that the board
  and current decision always outrank ambient telemetry.
  <https://www.leagueoflegends.com/en-us/news/dev/clarity-in-league/>
- VALORANT's interface team described removing decoration without purpose,
  increasing contrast, and simplifying shape language to improve legibility.
  SupaSnake should use fewer, stronger instrument shapes instead of many equal
  chips.
  <https://playvalorant.com/en-us/news/game-updates/preview-the-future-of-valorant-s-interface/>
- EA's F1 HUD treats telemetry as modular instruments, supports extensive race
  UI customization, and keeps ultrawide UI centered rather than scattering it
  to distant screen edges. SupaSnake should attach rails to the arena frame and
  later expose scale/density controls.
  <https://www.ea.com/games/f1/news/f1-25-pc-features>
  <https://www.ea.com/able/resources/f1-22/pc/on-screen>
- Tetris Effect is the closest board-first reference: the matrix remains the
  visual center while progress and score sit laterally in the surrounding
  atmosphere. SupaSnake should preserve that compositional confidence while
  supporting richer buildcraft.
  <https://www.tetriseffect.game/>
- Blizzard's modern WoW HUD work emphasizes a cleaner view, prominent primary
  state, and player-adjustable modules. That supports a future Essential /
  Tactical density setting without making configuration a first-run chore.
  <https://news.blizzard.com/en-us/article/23837944/get-into-the-grid-of-things-with-the-updated-ui-and-hud>
- Bungie's accessibility work reinforces configurable color presentation and
  consistent visual categories rather than color-only meaning.
  <https://www.bungie.net/7/en/News/article/destiny-2-accessibility-set>
- Microsoft's Xbox Accessibility Guidelines treat HUD text as gameplay text.
  They recommend large, high-contrast defaults and scalable glyphs. SupaSnake
  should remove 8–11px gameplay text, not attempt to sharpen it.
  <https://learn.microsoft.com/en-us/xbox/accessibility/accessibility-feature-tags>
  <https://learn.microsoft.com/gaming/accessibility/xbox-accessibility-guidelines/101>

## 4. Coherent game-screen art direction

The redesign is not a HUD laid over the existing scene. It is one composed
visual system from the most distant pixel to the most urgent gameplay object.

### Layer and attention contract

The complete screen uses this fixed depth and attention order:

| Layer | Role | Visual priority |
| --- | --- | --- |
| 1. Authored space | Distant world and SupaSnake identity | Atmospheric; recognizable at the perimeter, quiet behind play |
| 2. Dynasty atmosphere | Reversible run identity wash | Low-frequency ambient color; never a semantic signal by itself |
| 3. Cockpit chassis | Organizes the screen and joins telemetry to arena | Crisp, neutral graphite; lower contrast than gameplay |
| 4. Arena undertray and rim | Seats the board physically inside the cockpit | Strong silhouette and controlled depth; no visual clutter |
| 5. Board plane and grid | Defines playable space and distance | Consistent contrast across every crop and dynasty |
| 6. Snake, food, hazards, portals | What the player acts on now | Highest semantic contrast, distinct silhouettes, restrained bloom |
| 7. Peripheral instruments | Explains the run without covering it | Immediately readable, but never brighter than an urgent board event |
| 8. Frozen-state sidecars | Supports an explicit decision while simulation is held | Highest temporary UI priority, still outside/replacing rather than overlaying the board |

No lower layer may imitate the shape, motion, luminance, or semantic color of a
higher layer. In particular, background stars must not read as food, dynasty
light must not read as a portal, and decorative chassis glow must not read as a
hazard boundary.

### Player-authored background treatment

The source artwork at
`public/textures/minimalistic_background_texture_of_space_1.png` remains the
canonical image. The public and source copies are currently checksum-identical;
the redesign must not replace, repaint, or destructively recolor it.

Its diagonal violet nebula and cyan/magenta star field become the visual world
around the arena rather than a faint uniform watermark:

- `GameEnvironment` owns the image, crop, dynasty wash, board quiet-zone mask,
  and edge vignette as one component.
- Preserve more of the artwork at the outer cockpit perimeter while applying a
  neutral local darkening behind the arena and primary instruments. This
  creates contrast where needed without reducing the entire image to `0.12`
  opacity.
- Use one static image layer plus inexpensive CSS gradients. Do not add
  animated particles, a second star texture, full-screen blur, or continuous
  parallax during active play.
- Define explicit crop/focal-position tokens for wide, short landscape,
  portrait, and tablet compositions. A generic centered `cover` crop is not an
  art direction. Phase 0 will choose positions that retain the diagonal nebula
  while keeping dense star clusters away from primary values.
- The board quiet zone follows the actual arena rectangle, not the viewport
  center. It must adapt when portrait controls or landscape side rails change
  the board cell.
- Dynasty identity is a separate radial/linear atmosphere layer. It may tint
  the periphery and arena rim, but it never permanently modifies the source
  bitmap and never overwhelms the artwork's blue-violet authorship.
- High-contrast mode strengthens the quiet-zone mask and instrument wells; it
  does not remove the artwork unless a future explicit “minimal background”
  preference is added.
- Reduced motion shows the exact same static composition. The artwork itself
  never drifts behind a moving snake.

### Arena as a physical cockpit centerpiece

The board becomes a recessed tactical arena seated inside the same chassis as
the telemetry, not an isolated floating grid.

Build it as a restrained stack:

1. a broad, near-black undertray extending beyond the playable 20×20 cells;
2. a shallow chamfered apron that visually connects to the DOM cockpit rails;
3. a recessed playable floor with a clear, exact boundary;
4. four low-profile edge rails with semantic state lighting;
5. four recognizable corner nodes that establish orientation without looking
   like collectible objects.

The undertray and apron are non-playable geometry and must never make the
playable boundary ambiguous. They should be visible enough to ground the board
against the authored space, but darker and rougher than gameplay entities.

### Board plane and grid

- Retain the successful five-cell major-grid rhythm and quiet one-cell minor
  grid.
- Give major lines a different weight and structure, not merely more glow.
  Minor cells remain readable at the far edge of the default camera.
- Add restrained orientation cues through corner/node shape and, if testing
  proves useful, subtle center-axis ticks outside the playable cells. Do not
  place coordinate labels or microtext on the floor.
- Reduce broad clearcoat glare. The floor should read as engineered matte
  composite with selective specular response, not reflective glass.
- Keep the central play field neutral across PRIMAL, CYBER, and COSMIC. Dynasty
  color belongs in the rim, snake, and ambient light so food and hazards retain
  reliable contrast.
- Preserve COSMIC open/closed wall semantics. State changes use rail solidity,
  segment structure, and controlled color—not color alone or constant bloom.
- Keep the grid and floor below post-processing bloom threshold. Bloom is
  reserved for entity cores and brief event accents.

### Gameplay-object readability

Every interactive category needs both a distinct silhouette and a stable
lighting role:

- snake: the largest continuous form, dynasty-authored body, strong head/body
  distinction and a clean rim against every floor quadrant;
- food: compact target/beacon silhouette with a readable base contact point;
- mutation: unmistakable helix/double form, never a recolored food block;
- extraction portal: vertical doorway/beam and radial footprint, categorically
  different from food and board corners;
- hazard or lethal wall: rose structural warning plus solidity/pattern change;
- aim assist: thin tactical projection below entity luminance and never
  confused with a wall.

The grayscale test must still separate snake, food, mutation, portal, boundary,
and aim telegraph. Bright background points under the arena are suppressed
before compensating by making every gameplay object glow more.

### Camera, framing, and screen composition

- Keep the current side-aligned tactical camera, magnetic 90-degree snapping,
  deliberate player orbit, zoom, and reset behavior as the interaction
  foundation.
- Refit against the arena's complete visible chassis bounds, while separately
  guaranteeing all playable cell corners remain inside the protected board
  rectangle.
- Tune the default pitch and margin as visual tokens in Phase 0. The current
  70-degree down-look is the baseline, not an untouchable constant.
- The board's visual center—not merely the Canvas element—must align with the
  cockpit composition. Symmetric rails keep it within one CSS pixel of screen
  center in wide/landscape modes.
- Camera motion may never reveal HUD over the board or move an entity behind a
  DOM instrument. DOM and WebGL share one agreed arena-safe rectangle.
- Avoid automatic ambient camera movement during play. Camera shake and death
  response remain gameplay events and must respect reduced motion.
- The reset-view control belongs to the outer cockpit chassis and is available
  without covering playable cells.

### Shared material and color language

Use a small token set across DOM and WebGL:

- **void:** deepest background/occlusion;
- **graphite:** cockpit and undertray structure;
- **arena:** neutral playable floor;
- **grid-minor / grid-major:** spatial hierarchy;
- **dynasty-primary / dynasty-secondary:** identity and rim light;
- **system-cyan:** neutral interface state;
- **secure-gold:** bank/extraction consequence;
- **danger-rose:** lethal or irreversible risk;
- **bone:** primary readable value;
- **muted:** secondary, non-actionable state.

Tokens must have DOM CSS variables and Three.js equivalents sourced from one
definition. A screenshot should look like one renderer produced it even though
the cockpit is DOM and the arena is WebGL.

## 5. Non-negotiable layout contract

### Protected arena rectangle

`game-board-viewport` becomes a protected rectangle.

- No visible HUD, label, toast, prompt, button, choice card, pause panel, or
  flourish may intersect its bounding box.
- Invisible pointer/flick capture may cover the canvas only when it is the
  intended board input surface.
- The board remains centered within one pixel on layouts with symmetric side
  rails.
- HUD content appearing or changing does not alter the board rectangle during
  a live run.
- Frozen decisions may use dedicated sidecars. On narrow screens, a decision
  surface may replace the board region while the simulation is held; it may not
  layer text over playable cells.

### Stable chassis

The cockpit reserves its instrument regions at run start:

1. primary telemetry;
2. six gene sockets;
3. five strain gauges when that system is unlocked;
4. portal/risk instrument;
5. mode/anomaly instrument;
6. pause/view controls.

An inactive instrument becomes a quiet socket or icon. It does not disappear
and make another element jump.

## 6. Information hierarchy

| Priority | Information | Active-run presentation |
| --- | --- | --- |
| 0 | Board, snake, food, hazards, portals | Central arena; highest visual contrast and largest area |
| 1 | Score | Large tabular number; persistent |
| 1 | Run DNA and bank/salvage consequence | Large DNA value plus stable risk instrument |
| 1 | Live portal opportunity/window | Reserved portal instrument; one controlled activation cue |
| 2 | Held genes | Six symbol sockets; no names or monograms during motion |
| 2 | Strain progress/tier | Five distinct glyphs with four-segment gauges |
| 2 | Combo | Reserved multiplier dial; dormant when inactive |
| 3 | Mode/anomaly | Compact persistent symbol; readable label where space permits |
| 3 | Pause/reset controls | Outer chassis, 44px targets, never above the arena |
| 4 | Energy, snake name/generation | Pre-run, pause, and results; not primary during a live run |
| 4 | Gene effects/costs and tier names | Choice, pause detail, results, and Codex only |

Removing live-run energy from the primary trio is intentional. It is a session
entry resource, not an in-run decision variable. The player still sees it
before starting and after finishing.

## 7. Cockpit composition

### Wide desktop and ultrawide

Side rails have equal width and remain visually attached to the arena rather
than the physical monitor edges.

```text
             ┌──── SCORE / COMBO ────┐   ┌──── DNA / RISK ──────┐
┌───────────┐┌───────────────────────────────────────────────────┐┌───────────┐
│ GENE RACK ││                                                   ││ STRAINS   │
│ [1] [2]   ││                                                   ││ ◉ ◉ ◉ ◉ ◉ │
│ [3] [4]   ││                 GAME BOARD                        ││           │
│ [5] [6]   ││                                                   ││ PORTAL    │
│           ││                                                   ││ / ANOMALY │
└───────────┘└───────────────────────────────────────────────────┘└───────────┘
             └──── HELD / MODE STATUS ─┘   └──── PAUSE / VIEW ───┘
```

- Central arena width is capped from viewport height so ultrawide screens do
  not pull related telemetry metres away from the board.
- Score anchors the board's upper-left corner; DNA/risk anchors upper-right.
- Genes read vertically or as a 2×3 rack on the left.
- Strains, portal state, anomaly, pause, and reset live on the right.
- The redundant in-run logo and “Run telemetry” label are removed.

### Short mobile landscape

This layout uses width, not height.

```text
┌ SCORE ┐┌──────────────────────── GAME BOARD ───────────────────────┐┌ DNA   ┐
│ BANK  ││                                                           ││ RISK  │
│ G 1–6 ││                                                           ││ S 1–5 │
│ MODE  ││                                                           ││ PAUSE │
└───────┘└───────────────────────────────────────────────────────────┘└───────┘
```

- Rails are symmetric and compact.
- The board viewport targets nearly the full safe-area height.
- There is no header deck above the board.
- Icons may reduce to 24px, but critical values remain at least 18px.

### Portrait phone

Portrait uses a shallow top instrument bar and two compact bottom docks.

```text
┌──────── SCORE ─────── DNA ─────── PAUSE ────────┐
┌─────────────────────────────────────────────────┐
│                                                 │
│                   GAME BOARD                    │
│                                                 │
└─────────────────────────────────────────────────┘
┌ GENE SOCKETS  [1] [2] [3] [4] [5] [6] ────────┐
└ STRAINS       ◉   ◉   ◉   ◉   ◉   MODE/RISK ──┘
                 optional D-pad control dock
```

- The board receives the largest contiguous rectangle.
- Flick mode gives the board more height; D-pad mode owns a separate bottom
  control dock.
- No horizontal text ticker is allowed.
- Low-priority text becomes accessible labels and pause detail, not smaller
  typography.

### Tablet portrait

- Use the portrait composition with larger 36–40px symbols.
- At sufficient width, genes and strains share one bottom rail.
- Do not switch to side rails solely because the device width crosses a desktop
  breakpoint; use container size and aspect ratio.

## 8. Instrument design

### Primary telemetry

**Score**

- 24–32px desktop, 20–24px phone, tabular numerals.
- No `SCORE 0` micro-label/value pair. Use a clear trophy/score glyph and the
  value as one instrument.
- A restrained 120–180ms digit response is allowed; no bouncing every point.

**DNA / outcome**

- Helix glyph plus current run DNA is the primary value.
- Bank and salvage values are represented by a shield/secured glyph and a
  fractured-ring/risk glyph.
- Their numeric values are always reserved; they brighten when relevant.
- The first portal lesson teaches these two symbols at readable size. Later HUD
  use is recognition, not decoding.

**Portal instrument**

- Dormant state is a recessed portal socket.
- Live state fills a radial window gauge around the portal glyph, exposes the
  bank value, and fires one edge-light sweep.
- Continuous pulsing is prohibited. Reduced-motion mode uses color/weight only.

**Combo instrument**

- Stable circular or segmented dial.
- Displays `×1.0` through the active multiplier in large numerals.
- Chain count is secondary and may appear only in pause/detail at the smallest
  breakpoint.

**Mode and anomaly**

- Free Play uses an infinity/practice glyph; Anomaly uses its own distortion
  glyph plus strain-biased edge color.
- `FREE PLAY` or the anomaly name appears only where it can be at least 14px.
- Mode remains visible in captures so practice footage is not misleading.

## 9. Gene rack: symbols, not abbreviations

The six held slots become a visual loadout rack.

- Every gene gets a bespoke 24×24 SVG with a recognizable silhouette.
- Slot size: 40px desktop/tablet, 34–36px phone, never below 32px including its
  hit/visual frame.
- Primary strain colors the outer edge; a dual-tag gene uses a split edge.
- Gene identity comes from silhouette, not color or letters.
- Empty slots are visible recessed sockets. Remove “Build” and “No genes
  acquired.”
- Spent/voided genes keep their silhouette with a diagonal fracture mark and
  reduced fill; opacity alone is insufficient.
- A splice receives a bespoke icon and a braided dual-strain frame. Do not
  render splice initials.
- Hover/focus may reveal a tooltip on pointer devices, but no gameplay
  information may be hover-only.
- Pause and choice views show icon, full name, effect, cost, strain, and state at
  readable sizes.

### Offer-to-rack learning loop

1. A gene offer shows the icon at 48–64px beside its full readable name.
2. Choosing it produces one short icon-to-socket transition while the board is
   held.
3. The same icon persists in the rack, results, Genome Card, and Codex.
4. The pause panel is the player's on-demand legend.

### Icon brief for all offerable genes

| Gene | Core silhouette |
| --- | --- |
| Gold Trail | Three coins following a curved trail |
| Overgrowth | Sprout emerging from a thick coil |
| Wall Rush | Head sliding tangentially along a wall |
| Shed | Split outer skin around a smaller coil |
| Mirror Wager | Mirrored diamond divided into gain/loss halves |
| Magnet Pulse | Horseshoe magnet with one expanding ring |
| Time Dilation | Clock face with a stretched outer arc |
| Splitter | One food node branching into two |
| Phoenix | Flame-wing silhouette |
| Compound Interest | Stacked rings with a rising arc |
| Deep Roots | Rooted coil |
| Ancient Grove | Canopy/tree rings over a tail |
| Tectonic Patience | Portal gate combined with an hourglass |
| Redline Dividend | Gauge at redline with a value spark |
| Afterburner | Twin exhaust chevrons/flames |
| Overclock Harvest | Speed dial cutting through a food node |
| Starweaver | Four connected stars |
| Gravity Well | Inward orbit rings |
| Event Horizon | Half-open, half-closed ring |
| Solstice Engine | Sun gear |
| Glacial Reserve | Snowflake inside a reservoir ring |
| Midnight Oil | Crescent with a burning drop |
| Loan Shark | Fin/tooth closing on a coin |
| Tithe | Ten-node ring with the tenth node illuminated |
| Static Charge | Capacitor plates crossed by a bolt |
| Slipstream | Parallel speed arcs around a head |
| Bulk Up | Expanding body segments with a plus notch |
| Serpentine | S-curve with a shielded tail tip |
| Pocket Rift | Two portals joined by a transfer arrow |
| Grave Robber | Grave marker lifting a coin |
| Last Gasp | Pulse line continuing through a long coil |
| Heartwood | Heart-shaped tree rings |
| Zenith Protocol | Circuit path terminating at a peak |
| Constellation Crown | Crown made from linked stars |

Splice silhouettes:

| Splice | Core silhouette |
| --- | --- |
| Dragon Hoard | Dragon eye over stacked coins |
| Regenesis | Sprout emerging from a shed ring |
| Styx Contract | Phoenix flame inside a fractured wager diamond |
| Gravity Bubble | Magnet enclosed by an orbit bubble |
| Ricochet | Split arrow bouncing from a wall |
| Comet Tail | Star with a burning segmented trail |
| Old Growth | Tree rings and deep roots |
| All In | Wager diamond over a full coin stack |
| Black Magnet | Magnet inside an eclipse |
| Molted Rebirth | Flame emerging from split skin |

Before acceptance, the icon sheet must pass silhouette review at 16, 20, 24,
32, and 48px, in monochrome, grayscale, and each supported color-vision preset.
The active HUD uses 24px or larger; smaller sizes are validation only.

## 10. Strain array: five readable gauges

Replace five mini-cards with five distinct symbols and segmented gauges.

| Strain | Symbol | Non-color identity |
| --- | --- | --- |
| Aurum | Faceted coin/sun | Circular rays |
| Volt | Split lightning bolt | Angular vertical stroke |
| Feral | Claw/leaf | Organic three-prong silhouette |
| Flux | Offset portal rings | Concentric broken geometry |
| Umbra | Eclipse/fang | Crescent silhouette |

- Each symbol is surrounded by a four-segment progress ring matching the four
  possible points.
- Dormant is an outline; filled points are solid segments.
- Minor, Expression, and Apex add one, two, or three outer crown marks so tier
  is not encoded only by color.
- Suppression adds a fixed cap/slash glyph and hatched outer arc; remove tiny
  `CAP` text.
- Tier names appear in the pause/detail panel and in a readable one-time rail
  callout, not permanently beneath every gauge.
- Expression/Apex activation lights the relevant rail and announces the name
  without covering the board.

## 11. Prompts, pause, and frozen decisions

The protected-board rule applies to transient UI too.

### Ready and resume

- Move “Swipe or press an arrow to move” and “Choose Your Line” into a status
  rail immediately outside the arena.
- Keep the board fully visible and frozen.
- The FTUE line remains the only first-run teaching copy.

### Expression/Apex

- Replace the centered `ExpressionFlourish` card with a strain-rail activation:
  ring completion, one controlled light sweep, and a readable adjacent name.
- The board may receive a subtle in-world color response from gameplay VFX, but
  DOM UI may not cover it.

### Pause

- Desktop/landscape: expand the left sidecar into a Run Systems panel while the
  board remains held and visible.
- Portrait: switch to a dedicated pause layout in normal flow. It may replace
  the Canvas region while paused; it must not layer a panel over the board.
- Show score, DNA, bank/salvage, all gene icons with full details, strains, mode,
  Resume/Plan Next Move, and Quit.
- Resume returns to the deliberate-direction gate outside the board.

### Gene, portal, and surge choices

- Desktop/landscape: use the two sidecars as opposing choice panels with the
  held board visible between them.
- Portrait: transition to a full-width frozen-decision layout that replaces the
  board region. Do not squeeze full gene effects into a tiny strip.
- Preserve input locks, focus trap, keyboard shortcuts, and atomic engine hold.

## 12. Visual system

### Materials

- Near-black graphite chassis with 90–96% opaque instrument wells.
- One-pixel cool edge, subtle inner highlight, and sparse depth shadow.
- Dynasty color is an ambient edge light, not the fill of every panel.
- Cyan remains the system/accent color; gold communicates banked value, rose
  communicates irreversible risk, and strain colors stay semantic.
- Avoid glass over the board, excessive blur, repeated gradients, and glow on
  every number.

### Shape language

- One arena frame.
- Two symmetric rail families.
- Instrument wells are rectilinear with clipped or chamfered corners.
- Circular gauges are reserved for progress/window concepts.
- Hex/rounded-square sockets are reserved for genes.
- Equal-looking generic pills are not the default component.

### Typography

- No gameplay-relevant text below 14 CSS px.
- Instructions and actions are at least 16 CSS px; critical mobile prompts target
  18 CSS px.
- Primary numbers are at least 20 CSS px on phones and 24 CSS px on desktop.
- Use tabular numerals for telemetry.
- Wide-tracked uppercase is limited to short, readable labels; decorative
  microtype is removed rather than shrunk.
- Text/background contrast targets at least 4.5:1.

### Motion

- One event, one motion cue.
- Gene acquisition: 200–300ms socket arrival while held.
- Portal activation: one 250ms edge sweep, then a steady radial gauge.
- Tier activation: one 350ms rail response.
- No perpetual pulse on actionable telemetry.
- `prefers-reduced-motion` removes travel/sweep and retains state through shape,
  weight, and contrast.

## 13. Responsive engineering architecture

Create one screen composition with a CSS-grid cockpit and an arena assembly
rather than extending the existing header or independently styling the Canvas.

```text
GameScreen
├── GameEnvironment
│   ├── AuthoredBackground
│   ├── DynastyAtmosphere
│   └── ArenaQuietZone
└── RunCockpit
    ├── PrimaryTelemetry
    ├── GeneRack
    ├── GameBoardViewport
    │   └── ArenaAssembly (WebGL)
    ├── StrainArray
    ├── RunRiskInstrument
    ├── ModeInstrument
    ├── CockpitControls
    └── CockpitStatusRail
```

Recommended source boundaries:

- `src/components/game/screen/GameEnvironment.tsx`
- `src/components/game/screen/gameScreenTokens.ts`
- `src/components/game/cockpit/RunCockpit.tsx`
- `src/components/game/cockpit/PrimaryTelemetry.tsx`
- `src/components/game/cockpit/GeneRack.tsx`
- `src/components/game/cockpit/GeneGlyph.tsx`
- `src/components/game/cockpit/StrainArray.tsx`
- `src/components/game/cockpit/StrainGlyph.tsx`
- `src/components/game/cockpit/RunRiskInstrument.tsx`
- `src/components/game/cockpit/ModeInstrument.tsx`
- `src/components/game/cockpit/CockpitStatusRail.tsx`
- `src/components/game/cockpit/RunSystemsPanel.tsx`
- `src/components/game/cockpit/types.ts`
- `src/components/game/arena/ArenaAssembly.tsx`
- `src/components/game/arena/ArenaUndertray.tsx`
- `src/components/game/arena/arenaVisualConfig.ts`
- evolve `src/components/game/ArenaFloor.tsx`, `ArenaBorder.tsx`,
  `CameraRig.tsx`, and `DynamicLights.tsx` behind stable public props rather
  than duplicating their gameplay-aware behavior;
- `src/app/dev/cockpit/page.tsx` for a deterministic, state-rich visual
  fixture that cannot start or mutate a real run.

`page.tsx` should construct one immutable view model instead of containing the
visual markup:

```ts
interface RunCockpitModel {
  score: number;
  dnaCollected: number;
  bankDna: number;
  crashDna: number;
  mode: GameMode;
  anomaly: AnomalyRunInfo | null;
  portalLive: boolean;
  portalTicksRemaining: number | null;
  comboMultiplier: number;
  chainLength: number;
  genes: GenePick[];
  phoenixTriggered: boolean;
  strainCounts: StrainPoints;
  strainTiers: Partial<Record<StrainId, number>>;
  suppressedStrains: readonly StrainId[];
}
```

Implementation rules:

- One shared token source supplies matching CSS variables and serializable
  Three.js color/material values.
- `GameEnvironment` references the existing authored bitmap; it does not
  import a generated replacement or create a competing star field.
- Keep environment, cockpit, and arena variants behind
  `NEXT_PUBLIC_HUD_COCKPIT_V1` until the full composition passes canary.
- Use container size/aspect-ratio queries; width-only desktop breakpoints are
  insufficient for 844×390 and tablets.
- Use CSS Grid areas for wide, short-landscape, portrait, and compact portrait.
- Do not use `ResizeObserver` to calculate board offsets.
- Keep left/right wide rails equal even when one contains less information.
- `GameBoardViewport` remains a direct grid child with `min-width: 0` and
  `min-height: 0`.
- The Canvas remains transparent outside opaque arena geometry so the authored
  environment is visible around the physical board, never through playable
  cells.
- Static arena geometry shares materials and geometry where possible; no
  per-frame allocation is introduced by the chassis.
- Camera fit points include the visual apron and rim, while a separate contract
  asserts every playable corner remains inside the Canvas safe bounds.
- Low-frequency gene/strain components are memoized and update only when their
  underlying state changes.
- SVGs are code-native and share a single icon primitive; no bitmap HUD assets.
- Do not change engine state, payout math, API payloads, or persistence.

## 14. Progressive discovery and settings

- First run: score, DNA, mode, pause, and the minimal movement prompt only.
- Gene rack appears when the first offer system is relevant; empty sockets teach
  capacity without explanatory prose.
- Strain array appears only after strain tags unlock.
- Portal risk instrument is introduced contextually at the first portal.
- Full labels live in the held choice/pause surfaces, not in motion.

After the default is proven, add optional settings:

- HUD scale: 85%, 100%, 115%, 130%;
- density: Essential / Tactical;
- high-contrast instrument wells;
- supported color-vision palettes;
- reduced motion (also respects the OS preference).

Defaults must be excellent; no first-run HUD configuration screen.

## 15. Implementation phases

### Phase 0 — State-rich whole-screen prototype

- Build an isolated `/dev/cockpit` fixture with the real authored background,
  responsive crop/quiet-zone treatment, cockpit chassis, representative arena
  slab/grid, and every telemetry state.
- Provide deterministic fixture controls through query parameters for dynasty,
  run state, gene count, strain state, portal/combo state, and motion/contrast
  preferences.
- Produce wide, portrait, and short-landscape screenshots before touching the
  live game page or real engine state.
- Review the entire eye path: background identity → arena → snake/targets →
  primary values → build detail.
- Lock environment crops, quiet-zone strength, shared material/color tokens,
  board/frame proportions, camera baseline, icon silhouette, and instrument
  dimensions.

**Exit:** approved static states for 390×844, 844×390, 1440×900, and 2560×1080.

### Phase 1 — Environment and WebGL arena foundation

- Implement `GameEnvironment` using the canonical background image and the
  approved responsive focal/crop tokens.
- Build `ArenaAssembly`: undertray, apron, recessed floor, semantic rails, and
  orientation nodes using shared, low-cost geometry/materials.
- Refine grid hierarchy, floor response, bloom thresholds, and light balance
  across all three dynasties.
- Refit and snapshot the camera at default, zoom limits, pitch limits, and all
  four snapped azimuths.
- Validate snake, food, mutation, portal, aim, hazard, COSMIC wall phases, and
  Blackout against the new arena before integrating the live cockpit.

**Exit:** the authored world remains recognizable; the arena reads as a
physical centerpiece; all gameplay categories remain immediately distinct in
color and grayscale; the GPU/frame budget remains green.

### Phase 2 — Protected cockpit chassis

- Extract active-run markup from `page.tsx` into `RunCockpit`.
- Implement symmetric grid areas and safe-area behavior.
- Place the refined Canvas in the protected central cell.
- Move Ready/resume prompt outside the board.
- Keep existing HUD available behind a kill switch.

**Exit:** no visible UI intersects the board at any supported viewport/state;
board geometry does not change from score zero through full telemetry.

### Phase 3 — Primary instruments

- Implement Score, DNA, bank/salvage, portal, combo, mode/anomaly, pause, and
  reset instruments.
- Remove in-run energy, brand, micro-labels, tickers, and conditional chip row.
- Preserve all current data and semantics.

**Exit:** score/DNA/risk are readable in a 1080p capture and on a 320px phone;
portal/combo/anomaly transitions do not move the board or neighboring modules.

### Phase 4 — Gene and strain visual language

- Create all gene, splice, and strain SVGs.
- Replace `MutationHUD` with `GeneRack` and `StrainMeterHUD` with `StrainArray`.
- Integrate icons into choice cards, results, Genome Card, and Codex.
- Add spent, dual-strain, splice, suppressed, tier, and empty states.

**Exit:** no monograms or 8–11px gene/strain labels remain in active gameplay;
every catalog entry resolves to a tested bespoke glyph.

### Phase 5 — Frozen-state sidecars

- Redesign Pause as Run Systems.
- Move Expression/Apex feedback to the strain rail.
- Move gene, portal, and surge choices out of the board rectangle.
- Preserve focus, keyboard, touch, and atomic engine-hold behavior.

**Exit:** board protection holds during Ready, resume, pause, gene offer, portal,
surge, Expression, and Apex states.

### Phase 6 — Accessibility, polish, and preference controls

- Add scale/density/high-contrast/color-vision options.
- Add reduced-motion variants and live-region announcements.
- Tune sounds/haptics only after visual hierarchy is stable.
- Validate performance and layout stability.

### Phase 7 — Flagged rollout

- Gate with `NEXT_PUBLIC_HUD_COCKPIT_V1`.
- Run deterministic fixture tests, local real-engine tests, protected canary,
  real-device pass, then production canary.
- Retain the released HUD as a rollback until cockpit acceptance is complete.

## 16. Verification matrix

### Viewports

- 320×568 compact phone portrait
- 375×667 short phone portrait
- 390×844 tall phone portrait
- 844×390 phone landscape
- 768×1024 tablet portrait
- 1280×720 short desktop
- 1440×900 desktop
- 2560×1080 ultrawide

Add safe-area simulations and at least one real iOS Safari and Android Chrome
device in portrait and landscape.

### Required states at every relevant viewport

- PRIMAL, CYBER, and COSMIC environment/arena themes;
- authored-background crop and arena quiet zone in wide, short-landscape,
  portrait, and tablet compositions;
- default camera plus four snapped sides, zoom limits, and pitch limits;
- score zero and first movement;
- first food;
- DNA > 0 with bank/salvage values;
- portal dormant and live/window expiring;
- combo dormant and active;
- normal, Free Play, and Anomaly modes;
- zero through six genes;
- single/dual-strain gene, spent Phoenix, and every splice;
- zero through four points for each strain;
- Minor, Expression, Apex, and suppressed strain;
- Ready, resume hold, Pause, gene choice, portal choice, surge choice;
- COSMIC walls open, closing telegraph, closed, and opening telegraph;
- normal arena and Blackout visibility mask;
- flick and D-pad control modes;
- consent visible and hidden;
- default, reduced-motion, high-contrast, and color-vision variants.

### Automated contracts

- The canonical background asset path resolves and no second full-screen
  texture is loaded by the game screen.
- Each responsive composition resolves to an explicit tested background focal
  position and quiet-zone token.
- The opaque playable floor covers the authored background throughout the
  playable 20×20 bounds at every permitted camera pose.
- Every playable board corner remains visible at default and limit camera
  poses; decorative apron visibility may never be purchased by cropping a cell.
- Every visible cockpit region has a bounding box that does not intersect the
  board.
- Wide/landscape board center is within one CSS pixel of the viewport center.
- Board bounds are unchanged when telemetry progresses through every dynamic
  state.
- No horizontal page overflow.
- No gameplay-relevant computed font size is below the agreed threshold.
- Every `GENES` and `SPLICES` key resolves to a non-fallback glyph.
- Every icon has a non-color silhouette and accessible name in detail contexts.
- Contrast tests pass for text, focus, gauge fills, dormant states, and danger
  states.
- Keyboard, flick, D-pad, reversal rejection, pause rearm, and engine holds
  retain existing behavior.
- HUD DOM updates do not run on every engine tick.
- Layout shift caused by the active HUD is zero.
- Visual-regression snapshots cover background, chassis, arena, and instruments
  as one image rather than testing those layers only in isolation.

### Performance budgets

- Reuse the one existing 2048×2048 background; add no competing full-screen
  bitmap textures or runtime icon downloads. A derived delivery format is only
  allowed if measurement proves a loading win and the authored pixels/crop
  remain visually faithful.
- No full-screen blur/filter animation, animated star field, or continuous
  parallax.
- Arena chassis adds no real-time lights, no additional shadow caster, and no
  per-frame allocations. Static meshes share materials/geometries; target no
  more than eight additional draw calls before instancing/merging.
- Grid, floor, and chassis stay below bloom threshold; bloom work remains
  desktop-only unless device profiling explicitly clears mobile.
- Median frame time may not regress by more than 5% on the existing device
  matrix.
- No sustained decorative animation.
- Icon library is tree-shakeable or emitted as one small local symbol set.

### Manual quality bar

- Artwork-authorship test: the background is recognizably the player-authored
  SupaSnake image at a glance, without competing with board objects.
- Arena-seat test: the board reads as physically integrated into the cockpit,
  not a floating square and not a rectangular web canvas.
- Entity-separation test: in color and grayscale, a player can immediately
  distinguish snake, food, mutation, portal, aim, and lethal boundary.
- Five-second test: a new viewer can point to score, DNA, secured/crash outcome,
  held build, and strongest strain without reading documentation.
- Thumb-distance test: mobile players never need to reach through the board to
  operate pause or D-pad controls.
- Couch-distance test: primary telemetry is readable in a 1080p capture.
- Grayscale test: genes, strain progress, risk, and suppression remain
  distinguishable.
- Distraction test: the board wins the first eye fixation in every state.
- Real-device test: browser chrome and safe areas never conceal an instrument or
  reduce the arena below the accepted minimum.

## 17. Acceptance criteria

The redesign is ready only when:

- the authored background remains intact, recognizable, responsively
  art-directed, and visually subordinate behind the arena;
- cockpit, arena, lighting, entities, and telemetry share one deliberate
  material/color language across all three dynasties;
- the board reads as a grounded premium arena with an unambiguous playable
  boundary, readable grid, and restrained bloom;
- every gameplay entity remains distinct by silhouette and luminance as well as
  color;
- default and limit camera poses frame the complete playable board and arena
  chassis without allowing DOM UI to intersect play;
- the game board is the visual and geometric center of active play;
- visible UI never overlays the protected board rectangle;
- score and DNA are immediately readable on all supported screens;
- active-run genes use clear bespoke graphics, never monograms or tiny names;
- strains communicate identity, points, tier, and suppression without relying
  on color or microcopy;
- energy and long-form descriptions appear only where they are useful;
- no telemetry state changes board geometry;
- Ready, pause, choices, and tier feedback respect the protected board;
- default motion is restrained and reduced-motion loses no information;
- all existing gameplay, input, payout, FTUE, consent, and interruption-policy
  tests remain green;
- the old HUD remains an immediate feature-flag rollback through canary.

## 18. Explicitly rejected directions

- Replacing or repainting the player-authored background with generated sci-fi
  art.
- Hiding the artwork behind one uniformly tiny opacity value instead of
  art-directing crop and local contrast.
- Adding another star field, moving particle wallpaper, or ambient camera drift.
- An overbuilt sci-fi frame with pipes, bolts, labels, and lights that compete
  with the snake.
- A reflective/glass board or grid/border glow bright enough to rival food and
  portals.
- Sacrificing visible playable cells to show more decorative undertray or a
  more dramatic camera angle.
- Another compact top dashboard.
- Gene initials, truncated names, or font sizes below readability thresholds.
- Five colored strain cards that differ mainly by hue.
- Permanent scrolling tickers.
- Conditional chips that cause neighboring modules to move.
- HUD glass, prompts, or celebration cards over the board.
- Putting telemetry at the far monitor edges on ultrawide.
- A configuration screen before first gameplay.
- Shipping the frozen HUD/Pause candidate unchanged.
