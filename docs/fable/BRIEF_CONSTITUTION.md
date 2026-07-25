# Brief — SupaSnake Product Constitution

**For:** Claude Fable 5, run at `xhigh` effort, in a cleared context.
**Deliverable:** `docs/PRODUCT_CONSTITUTION.md`
**Prepared:** 25 July 2026 by Opus 5, from a code-verified audit.

---

## Why you are being asked for this

SupaSnake is a solo-developed 3D snake game, pre-launch, built over roughly nine months.
Its owner is one person. They are about to decide what the game *is* — and everything
downstream (implementation, launch, five years of live operation) will be executed by
smaller models working from whatever you produce.

Right now the game has an excellent core run and a metagame that has grown in eleven
directions at once. Nothing has been cut. There is no marketing surface at all. The
monetization sells the game's own friction. Every one of these is fixable, and none of
them can be fixed independently of the others — which is why this is one document rather
than six.

**What this output enables:** it becomes the single design authority for the project.
Implementation specs, the launch plan, the roadmap, and every future feature decision
will be derived from it and checked against it. Write it to be the thing someone reads
in 2029 to understand why SupaSnake is the way it is.

You are being given the hardest, most ambiguous, most consequential decision in the
project, deliberately. Take the whole of it.

---

## Read exactly these, in this order, then stop reading

1. `docs/GROUND_TRUTH.md` — the verified state of the game as built. Every claim is
   cited to code or a migration. **This is the world.** Where it and a design document
   disagree, it wins.
2. `docs/fable/AUDIT_DIGEST.md` — a Game Director's audit of the same codebase:
   findings, priorities, daily-cycle research across eight shipped titles, three
   proposed daily-world models, removal candidates, and ten open decisions.
3. `docs/game/SUPASNAKE_PRODUCT_GAMEPLAY_METAGAME_AUDIT.md`, **section 12 only**
   (Monetization strategy). The most recent thinking, and the section the owner engaged
   with most directly.

**Do not explore the repository further.** Do not read other design documents, do not
grep the source, do not open migrations. Everything you need is verified and in those
three files, and the context you would gather is exactly the context that was already
gathered for you. Twenty stale design documents describing an abandoned version of this
game were deleted on 25 July 2026 for the same reason.

If you find yourself needing a fact that is not in those three files, say so in the
Open Questions section rather than going to look for it.

---

## The owner's design philosophy

**How to read this.** These are the owner's spontaneous, unrehearsed reactions — not a
prepared position paper. That is precisely why they are the most valuable input in this
brief. They are the felt experience of someone who has played one competitor daily for
over two years and can say exactly which parts made them stay and which parts made them
resent staying. That is data no amount of design reasoning substitutes for.

Read them as evidence about **what this specific person is trying to build and why**,
not as a specification. Where they are imprecise, resolve the imprecision in the
direction of the underlying feeling.

<philosophy>
A useful reference point is Survivor.io, which I have played daily for over two years.
My feelings toward its monetization are mixed.

What it gets right:

- The daily reset feels meaningful and creates anticipation.
- Long-term progression is compelling enough that I keep coming back every day.
- There are always medium- and long-term goals to work toward.
- Spending generally accelerates progress or provides convenience rather than replacing
  gameplay.
- **High-level clan play is the central retention mechanism, and I want to be explicit
  that I consider this a strength rather than a flaw.** The clan is what gives the
  long-term meta-game and progression a point. If there were no clans, there would be no
  reason to keep improving my score — I would have stopped playing long ago. Being part
  of a group that is going somewhere, where my improvement matters to people other than
  me, is the thing that converted a game I liked into a game I kept returning to for two
  years. Any judgement that clan competition is merely "social pressure to spend" misses
  what it actually does: it supplies the reason the rest of the progression exists.

What it gets wrong:

- Monetization often feels relentless. Almost every screen presents another offer,
  bundle, or limited-time purchase.
- The game sometimes feels more like an obligation than entertainment, demanding both
  time and money.

For SupaSnake, I want the opposite philosophy on monetization — while keeping the social
reason-to-improve that made the two years worth it.

Our monetization should be designed so that players want to spend because they love the
game — not because they feel manipulated, punished, or left behind.

The core design principle:

Players should feel at home. Spending money should feel like supporting a game they
enjoy and receiving genuine value in return — not like resisting constant pressure or
escaping artificial frustration.

The goal is a game players are happy to play for years, where monetization strengthens
the relationship between player and game instead of gradually eroding trust.

On this document specifically: we have come quite far and have more than a solid
foundation, but now we need to sort it all out and make it come together into a
genuinely superb and engaging experience that makes users come back every day. We want
to be the user's daily habit. What we want deeply integrated from the start is
monetization AND MARKETING — marketing being the hardest part: getting users to play,
sign up, get hooked, start spending, and return daily.
</philosophy>

### What actually drives the daily login — the owner's account of the architecture

Asked to enumerate why they personally open Survivor.io every day, the owner described a
four-part structure. This is a description of a competitor, **not a feature request** —
they were explicit that they are not proposing SupaSnake build events. Read it as an
anatomy of what makes a long-term grind feel worth doing.

<philosophy>
What you really need are the Cores — rare pieces you need to upgrade your equipment. You
get them from various sources: some gameplay, and importantly from weekly events and a
monthly league called Ender's Echo, where the highest scorers ascend into the next higher
league, and your rewards at the end of the month depend on which league you finished in.
That adds competition and comparison to other players. So the events are always a big
motivation to log in daily.

But where it all comes together is my score in the clan battle. You asynchronously attack
a boss and kill it a number of times — my last score was 2315 — and that's the number
that really motivates you. Improve it every week, every battle. That's where you see that
the grind paid off.
</philosophy>

**The structure, made explicit:**

1. A **scarce upgrade bottleneck** (Cores) with several faucets, so a bad week in one
   source is not fatal.
2. **Time-boxed competitive surfaces** (weekly events, a monthly promotion league) that
   both *supply* the bottleneck resource and *provide comparison*.
3. One **convergence metric** — the clan boss kill count — where every accumulated
   investment resolves into a single legible number.
4. That number is **asynchronous, cooperative, and compared against your own past self**
   before it is compared against anyone else.

### The gap this exposes in SupaSnake — read this carefully

**SupaSnake currently has no convergence metric, and this is probably its most important
missing piece.**

Run score is per-run and, by deliberate design, **independent of build** — genes, traits
and anomalies do not affect it (`rulesets.ts:261-267`). Mastery XP is per-dynasty and
invisible between levels. DNA is a spendable balance, not an achievement. Records are
discrete badges. Collection is a count.

So there is nowhere in SupaSnake that a player's accumulated investment — their genome
knowledge, their lineage, their mastery, their collection — becomes **one number that
visibly goes up over weeks**. Nowhere that the grind visibly pays off. That is exactly
the thing the owner says keeps them returning to a game for two years.

The audit tells you to protect build-independent scoring, and it is right: a leaderboard
that measures build rather than play is not a skill leaderboard. But the resolution is
not to abandon one or the other — it is that the game plausibly needs **two different
numbers with two different jobs**:

- **A skill number** — the run score. Build-independent, ranked, fair, the thing the
  leaderboard measures.
- **An investment number** — where everything the player has built is tested and pays
  off, measured against their own history first and their clan second.

Clash Royale ships exactly this split (Trophy Road, which never demotes and reflects
investment, alongside a separate skill-ranked ladder). The research found the pattern is
real and shipped but has **no established name and almost no public design writing** —
so you are not copying a solved problem, and you should not assume it is easy. Whether
players conflate the two numbers is genuinely unknown.

**An asynchronous cooperative boss is the strongest known home for the investment
number**, and it also happens to dissolve the cold-start problem below: you fight a boss,
not another clan, so there is no walkover, no matchmaking symmetry to protect, and a clan
of one still has something to fight. Whether SupaSnake's version is a boss, a wall, a
seeded gauntlet, or something native to snake movement is yours to invent — the shape
matters less than the property.

**The failure mode you must design against is sharp and documented.** In Raid: Shadow
Legends, clan boss rewards sit behind hard damage thresholds — below the bar you receive
*nothing*, no matter how much you played. Clans then set minimum-damage entry
requirements and remove members who fall short. That converts the convergence metric into
a spending leaderboard and the clan into a job with a performance review. **It is
precisely the "clan pressure to spend" the owner named as Survivor.io's worst quality,
and it is the single easiest way to ruin this design.** Whatever you build, participation
must pay proportionally rather than pass/fail at a threshold, and no clan officer should
ever have a mechanical reason to evaluate a member's output.

### The cold-start problem — the hardest design challenge in this brief

This is the one the owner most wants solved, and they have explicitly declined to
constrain your approach. Their framing:

<philosophy>
What's certainly true is that if we have clans from the start, they'll be empty — so
from that point of view it would be better to introduce them later, once we have a large
enough player base. But we might never establish a large enough player base if we have
low retention, and clans are a strong retention mechanism when they work. So I want to
find a mechanism to have them from the start. It's also fine if we begin with two clans
of one person each playing against each other, maybe. Freely find ways to do it — I
don't want to constrain or limit you here. We need to be clever about this.

Facebook was also empty in the beginning. It's the chicken-and-egg problem — but nobody
says you should therefore not build it in the first place.
</philosophy>

The audit takes the opposing position: reduce clans at launch to name, heraldry, roster,
roles and one asynchronous weekly goal; hide duels, the Gauntlet, research trees and
playoffs until a population threshold is met, because "empty social spaces are worse than
absent social spaces."

**Three things should inform how you resolve this:**

1. **That audit claim is folklore.** Research for this brief found no postmortem, study,
   or documented case supporting it. It is plausible and widely believed. It is not
   established, and it should not function as a hard constraint.

2. **The Facebook analogy is right but the usual reading of it is wrong.** Facebook did
   not launch empty and survive. It launched to Harvard *only*, gated behind a
   `harvard.edu` address — roughly 1,200 signups in 24 hours, more than half the
   undergraduate population within a month. It was never sparse **within the network it
   had scoped itself to**. It solved cold start by shrinking the world until density was
   achievable, saturating it, then expanding one campus at a time. The transferable
   question is therefore not *"how do we survive empty clans"* but **"what is SupaSnake's
   Harvard — the smallest bounded population we can saturate first?"** That is a product,
   marketing, and clan-design question simultaneously, which is exactly why it belongs in
   this document rather than in a separate go-to-market pass.

3. **Headcount may be the wrong variable.** The documented mechanism behind clan
   retention is *interdependence with consequences for specific named people* — not
   crowd size. That mechanism is fully present at N=2. A clan of two where your
   improvement visibly matters to one other person delivers it; a clan of fifty where
   nobody notices you does not. The owner's "two clans of one person each" instinct is
   more defensible than it may first appear, and the research on small groups points the
   same way: make the unit of competition small enough that 3–6 real players constitute a
   viable group, and resolve competition asynchronously against banked results so a clan
   whose members are never online together still produces a real weekly outcome.

4. **The actual threshold is small, and the owner's arithmetic is right.** A clan-versus-
   clan competition needs exactly two clans to exist. At ten members each that is **twenty
   retained players for a complete competitive MVP** — not a "large player base." And
   because resolution is asynchronous, those twenty never need to be online together.
   Twenty is a marketing problem with a known solution, not a structural barrier.

   The honest complication is not headcount but **symmetry**: twenty players split into
   one active clan and one lapsed clan produces a walkover, which is worse than no
   competition at all. The requirement is therefore ~20 retained players of *roughly
   comparable activity*, and matchmaking, clan size, and season length should all be
   designed around protecting that symmetry at small N. Solve that and the cold start is
   solved.

**Relevant code facts, verified 25 July 2026:**

- `CLAN_LIMITS.minMembers: 20` (`src/lib/clan/types.ts:56`) is **declared but never
  enforced** — it appears only in two tests asserting the constant equals 20. It gates
  nothing.
- `CLAN_LIMITS.maxMembers: 50` **is** enforced in the UI (`src/app/clan/page.tsx:459`).
- Duel matchmaking already accepts `member_count >= 1`
  (`supabase/migrations/011_clan_duels.sql:250`).

**So a one-member clan can already duel today.** The cold start is not mechanically
blocked; it is a design and population problem, which is the one you are being asked to
solve.

**What to deliver:** a clan design that is genuinely alive on day one with a handful of
players, degrades gracefully rather than looking abandoned, protects competitive symmetry
at small N, and grows into something worth the systems already built — without ever
requiring a human officer to adjudicate scarce rewards, and without fabricating fake
players, which the research found to be an anti-pattern with no successful precedent.

All four clan sub-systems (duels; the Gauntlet with scouting, blind picks and a research
tree; playoffs) are **already built and reachable today**. The question is not whether to
build them, but what is shown, to whom, and when.

---

## The grand strategy requirement — design the growth, not just the game

This is the owner's framing, and it may be the most demanding thing in the brief:

<philosophy>
Survivor.io is overloaded with gameplay modes that all feed the progression. It's clearly
too much, and as a player you can see that the different parts of the game were not
defined in a grand strategy from the beginning — they were added as the game grew and the
developer needed to find new ways to keep players engaged and extend the grind.

I want a grand strategy from the beginning, considering that the game might grow
significantly and we will need to introduce new paths to keep players engaged and keep
the grind going. But I want the game to remain clear, and to do that in a way that does
not dilute the core game too much.
</philosophy>

**What this asks for is unusual and you should treat it as a first-class deliverable: not
a design, but an expansion architecture.**

Most design documents describe a game at one moment. This one has to describe a game that
will need new content in year two and year four, and to decide *now* where that content
is allowed to go — so that future additions extend the game along predetermined lines
instead of accreting beside it as visibly bolted-on modes.

Concretely, the Constitution should answer:

- **Where does new content go?** Name the small number of expansion slots — for example
  "new curated modifiers," "new mastery trials," "new cosmetic lines," "new Signal
  conditions" — and state that new content must fit an existing slot. A proposal that
  fits no slot is either rejected or forces an explicit, deliberate decision to open a
  new one.
- **What is capped forever?** Which quantities must never grow — number of currencies,
  number of daily surfaces, number of progression lanes, number of game modes, size of
  the active gene pool. A cap that is written down is a cap that survives the pressure of
  a bad retention month.
- **What is designed to grow?** Which axes can absorb years of content without adding
  systems. Content that varies *within* an existing mechanic is nearly free; content that
  adds a mechanic is permanently expensive for a solo developer.
- **The dilution test.** A stated, checkable rule for whether a proposed addition takes
  attention away from the core run. The audit's north-star questions are a starting
  point; make them sharper and make them binding.
- **The pressure valve.** Be honest that the moment will come when retention dips and the
  temptation is to bolt on a new mode. Say in advance what the sanctioned response is —
  which lever gets pulled instead — so that the answer exists before the panic does. This
  is the specific failure the owner watched happen to a game they otherwise love.

The test: someone in 2029 proposing a new feature should be able to open this document
and find that it already tells them where the feature goes, or that it doesn't belong.

## Evidence from shipped games

Researched 25 July 2026 specifically for this brief. Each item is labelled **[D]**
documented with a source, **[R]** widely reported but not independently verified, or
**[F]** design folklore repeated confidently without evidence found. Treat the labels as
load-bearing — a surprising amount of game-design common knowledge turns out to be [F].

### On social systems as retention drivers

- **[D]** Kongregate (GDC Europe 2013) reported guild members spending 10–20× more than
  non-members: *Dawn of the Dragons* converted 3.2% without a guild vs 23% with;
  *Tyrant Unleashed* ARPU $36.59 vs $91.60. **Caveat:** this single 2013 talk appears to
  be the origin of most later "guilds drive retention" claims. Downstream repetitions
  are echoes, not independent confirmation.
- **[D]** The mechanism across successful cases is **interdependence with consequences
  for specific named people** — Clash of Clans troop donation, Destiny 2 requiring half
  a raid fireteam to be clanmates — not the existence of a clan tag or a shared
  scoreboard.
- **[R]** CCP describes the EVE Online community as "one of, if not the, best retention
  tools" they have. Developer self-report, not measured churn.
- **[D]** Marvel Snap grew for roughly two years with **no clan system at all** — but it
  substituted a ranked ladder against real opponents. This is the important counterweight
  to the owner's claim: the durable thing may be *an external reference point*, of which
  a clan is one implementation and a ladder is another.
- **[D]** Roguelike/idle meta-progression (permanent unlocks across runs) is credited
  with extending game lifetime 40–60% — a solo mechanism for "effort is never wasted."
- **[F→ but unfalsified]** No successful long-term counterexample was found for a pure
  single-player high-score chase with no ladder and no meta-progression. That is
  consistent with the owner's intuition without proving it.

### On asynchronous social design — decisive for a solo developer

- **[D]** Clash of Clans is the blueprint: fully **asynchronous core combat** (you attack
  a saved base state; the defender need not be online) with a **synchronous-feeling
  48-hour war window** layered on top.
- **[D]** Old School RuneScape clan chat works **across worlds**, structurally solving
  "not enough of my clan is on my shard."
- **[D]** Destiny 2 shows the failure mode: clan chat and XP are async, but the valuable
  content (raids) needs six synchronous players. Bungie had to add Guided Games as a
  patch for exactly this.
- **Design implication:** decouple *competitive resolution* from *live presence*. A clan
  of four people who are never online together should still produce a meaningful weekly
  result.

### On belonging versus obligation

- **[D]** WoW's 40-man raid era required roughly six scheduled nights a week and turned
  guild leadership into a second job; Blizzard's own response — shrinking raids, adding
  flexible sizing and Raid Finder — is evidence the design was unsustainable.
- **[R]** Toxicity correlates more with **contested governance** (loot councils, DKP
  disputes, who "deserves" a scarce reward) than with grouping itself.
- **Design implication, strongly supported:** avoid any mechanic requiring a human clan
  officer to adjudicate scarcity. Fixed schedules plus contested scarce rewards is the
  combination that turns belonging into a job.

### On cold-starting a social system with almost no players

- **[F]** *"Empty social spaces are worse than absent social spaces"* — **the audit
  asserts this as fact and no supporting evidence was found.** No postmortem or study
  documenting "we shipped guilds too early and it backfired" surfaced. It is plausible
  and widely believed; it is not established. Weight it accordingly rather than treating
  it as a constraint.
- **[D]** No shipped game was found that successfully bootstrapped clan retention with
  bot or fake populations. It appears only in third-party cheat tooling. Treat as an
  anti-pattern.
- **[D]** EVE Online still loses roughly 90% of new players within a week after twenty
  years of iterating on this.
- **Most evidence-consistent approach at tiny scale:** make the unit of competition small
  enough that 3–6 real players constitute a viable group, and resolve competition
  asynchronously against banked results or replays.

### On the asynchronous cooperative boss and the convergence metric

- **[D]** Clan/guild members show roughly 2–3× higher Day-30 retention than solo players;
  having a friend in-game shows ~40% higher Day-7 retention. About social membership
  generally, not the boss mechanic specifically.
- **[D]** Game Developer's clan analysis names the structural tension directly:
  competitions serve "killers" while clans themselves are a socialization mechanic, and
  clan-vs-clan PvP carries built-in inequality — "there is always a stronger opponent"
  once spending enters. This is the closest thing to a documented rationale for
  preferring cooperative-versus-PvE clan content over clan-versus-clan.
- **[D]** More than half of top-200-grossing midcore titles combine cooperative tasks,
  asynchronous PvE, and guild wars — treated as complementary rather than alternatives.
- **[D]** AFK Arena's guild boss scales difficulty so under-geared players still
  contribute and earn damage-proportional rewards — an explicit accommodation for uneven
  rosters that clan-vs-clan PvP structurally cannot make.
- **[R → unconfirmed hypothesis]** The framing that a clan-boss score works because it
  *converts all account investment into one legible number* is consistent with
  self-determination theory's competence need and with how the rewards are gated, but
  **no developer commentary or study stating this rationale was found.** Plarium's own
  writeup on clan design mentions Clan Boss only in passing. Treat as a strong inference,
  not an established fact.

### On the "two scores" pattern

- **[D]** Clash Royale ships it: **Trophy Road** (investment-driven, never demotes)
  alongside a separate skill-ranked ladder with promotion and relegation. Same game, same
  publisher, deliberate split.
- **[gap]** There is **no established name for this pattern** in public design literature,
  and **no source discussing whether players conflate the two scores.** It is real and
  shipped but essentially untheorized. Do not assume it is easy.
- **Do not confuse it** with visible-rank-versus-hidden-MMR (League, Valorant, Rocket
  League). That is a skill-display versus skill-truth split, a different problem.

### On leagues versus flat leaderboards — directly relevant at small scale

- **[D]** Duolingo Leagues is the best-documented case with real numbers: a claimed **+25%
  lesson completion**, groups of 30 with weekly reset, top N promoted and bottom 5
  demoted, thresholds tightening at higher tiers. Their stated rationale: "loss aversion
  does the heavy lifting: people will work harder to avoid losing status they've earned
  than to gain status they don't yet have." Note the tension with the owner's no-loss
  principle — leagues that demote *are* a loss mechanic, and you will have to decide
  whether promotion-only tiering retains the benefit without the coercion.
- **[R]** Consultant analysis (Octalysis) argues a flat global leaderboard of 10,000
  produces "one euphoric winner and 9,900 demoralized losers," and recommends
  micro-leaderboards showing five above and five below. Industry commentary, not an
  experiment — but directly relevant to a game whose leaderboard will initially hold
  a dozen real players.
- **[gap]** No controlled study comparing flat-leaderboard to tiered-league retention
  was found. All evidence is company-reported or consultant analysis.

### On how the clan-boss pattern fails

- **[D]** Raid: Shadow Legends gates clan boss rewards behind **hard damage thresholds** —
  below the bar you earn nothing regardless of effort. Clans then set minimum-damage entry
  requirements as a condition of membership.
- **[D]** Summoners War's Guild Battle explicitly withholds rewards from members who do
  not participate that week — a documented obligation mechanic.
- **[R]** Player sentiment reports clan-vs-clan content drifting pay-to-win, with
  mid-spenders squeezed out; one forum framing: when mid-level players leave, whales
  follow, because there is no one left to dominate.
- **[gap]** **No postmortem was found of any developer changing a clan-boss system in
  response to toxicity.** Absent evidence, not evidence of absence — but it means there
  is no worked example of fixing this after the fact. Get it right the first time.

### On the scarce-resource-with-multiple-faucets structure

- **[D]** This is a recognized and deliberate gacha pattern: engineer material scarcity so
  that "any misstep will force players to interact with an alternative source," with a
  visible core loop and a hidden secondary loop governing scarcity that most players never
  fully perceive. **Note the ethical valence** — the documented version of this pattern is
  designed to route players toward purchases. The owner admires how it *feels*; the
  literature describes it as a monetization funnel. Reconciling those is your problem.
- **[gap]** The specific three-faucet structure the owner describes for Survivor.io could
  not be independently verified — the official wiki and PocketGamer both blocked
  retrieval. Treat the owner's account as reliable player testimony about their own
  experience rather than as verified game documentation.

### On monetization changes, and their outcomes

- **[D] RuneScape / Treasure Hunter — the cleanest case in the entire search.** Jagex ran
  a loot-box-style system for a decade. In 2025 the CEO stated publicly it was "harming
  RuneScape" and put removal to a player vote; 124,985 votes cleared the threshold in
  about 24 hours, and it was removed on 19 January 2026 with the revenue loss explicitly
  accepted as the price of restoring trust.
- **[D]** Jagex's reported financials: **74% of revenue from membership subscriptions**,
  with subscription revenue up 9.5% while MTX revenue fell 12%. Real evidence that a
  subscription can outperform loot-box MTX on both trust *and* revenue trend.
- **[D]** Star Wars Battlefront II pulled paid loot boxes hours before launch after the
  most-downvoted comment in Reddit history, and triggered legislative loot-box scrutiny
  in Belgium, the Netherlands and Hawaii.
- **[D]** Overwatch 2 locked new heroes behind the battle pass, and reverted to
  free-for-all hero unlocks from Season 10.
- **[D] The counterweight you must not ignore:** Diablo Immortal drew enormous backlash,
  did **not** back down, and reportedly grossed ~$24M in two weeks and ~$1M/day after.
  Loud backlash is not the same as commercial failure. An argument for trust-first
  monetization has to be made on its merits, not on the claim that the alternative
  doesn't make money — it demonstrably does.

### On energy systems specifically

- **[D]** Industrial Toys removed the energy system from *Midnight Star* entirely after
  the data "told a very clear story": it punished the most engaged players hardest. The
  developer called shipping it "a mistake." This is the single most directly relevant
  documented case to open decision #2.

### On streaks and forced objectives

- **[F]** "Streak resets drive churn" is consensus across UX and design commentary but no
  named game with before/after retention data was found. Believed, not demonstrated.
- **[R]** Destiny 2's retreat from forced weekly power grinds is community-inferred;
  no single authoritative Bungie post articulating burnout as the reason was found.
- **[D]** Hearthstone's 2020 quest rework did happen as described (unpopular quests cut,
  difficulty normalized, rerolls improved); Blizzard's stated reasoning was not found.

### On cosmetic-only monetization at small scale — the real gap

- **[D]** Path of Exile sustains a studio on 100% cosmetic MTX with supporter packs from
  ~$30 to $480+, validated by Tencent's majority acquisition of Grinding Gear Games.
- **[R]** Warframe is commonly reported at roughly 10% of players ever paying; no audited
  figures found.
- **[D]** Deep Rock Galactic is a **paid premium game** with cosmetic DLC — not a valid
  comparator for free-to-play cosmetic-only. Do not cite it as one.
- **[F/gap]** **No public data was found on whether cosmetic-only monetization works at
  solo-studio scale.** Every real success (RuneScape, PoE, Warframe) is a large
  established studio with an acquisition budget. Industry guides warn cosmetic-only needs
  a large player base. **This is an unresolved risk in audit §12's recommendation and
  should be stated plainly in the Constitution rather than assumed away.**

### On web games and daily habit — directly relevant to the platform constraint

- **[D]** Mobile gaming Day-30 retention benchmarks are 2.3–5.4%, and that range is
  considered *good*. Even native, installable, push-capable games retain almost nobody
  by day 30. Calibrate expectations accordingly.
- **[gap]** No dataset comparing browser-game retention to native-app retention head to
  head was found.
- **[R]** PWA installability case studies (Twitter Lite, Pinterest, Trivago, Rakuten)
  report large engagement lifts, but all are vendor-published marketing material and none
  are games. Directionally suggestive; discount the magnitudes.
- **[D] Wordle is the proof that the constraint is survivable.** Browser-only, no install,
  no push notifications, and it became a genuine daily habit strong enough that the NYT
  credited it with their best-ever quarter for Games subscriber growth. The mechanism was
  **extreme scarcity (one puzzle per day) plus a share loop (the emoji grid)** — ritual
  and shareability rather than operating-system engagement hooks. This is the closest
  structural analogue to SupaSnake's situation in the entire search, and it argues that
  the missing share URL matters more than the missing push notifications.

## Decisions the owner has already made

These are settled. Design within them.

1. **You have full decision authority** over every open question — Energy, gene pool
   size, deterministic breeding, aim systems, clan scope, season expiry, the
   monetization model, the daily loop. Make the calls and commit to them. Do not return
   a menu of options.
2. **The game is pre-launch.** The live URL has no real audience (415 player rows, 15
   with a completed run — dev and QA noise). There are no player expectations to
   protect and no purchases to honor. A real launch is still ahead.
3. **Nothing is protected except the core run.** You may recommend deleting or hiding
   any shipped system — clans, breeding, the Analyst, offline progress, achievements,
   streaks, seasons. Sunk build cost is not a reason to keep something that dilutes the
   game. Where you remove something players own, specify how ownership and history are
   preserved.
4. **Marketing is co-equal with product, not an appendix.** It is the hardest unsolved
   problem and the least built. It must shape product decisions — what is installable,
   what is shareable, which moment is worth sharing — rather than being bolted on after.

---

## Constraints that are not yours to overturn

- **One developer, five years.** Every system you keep must be operable, balanceable,
  moderatable, and supportable by one person for five years. This is the binding
  constraint on the entire design and should visibly kill things.
- **Server authority.** All economy and progress mutations go through API routes and
  RPCs; the client never writes balances.
- **Austria/EU legal posture.** Gross EUR pricing incl. VAT (PAngG); FAGG §10
  service-start consent and §16 pro-rata withdrawal; cancel-anytime; game minimum age
  14, recurring billing 18+. Loot boxes carry case-by-case legal risk after OGH
  6 Ob 228/24h and the incoming EU Digital Fairness Act.
- **No ads.** Locked, permanently.
- **Dynasties are CYBER / PRIMAL / COSMIC.** EMBER/CRYSTAL/VOID is deprecated.
- **Stack:** Next.js App Router, Supabase, Vercel, Stripe, react-three-fiber. It is a
  **web game** — that constrains installability, notification, and discovery in ways a
  native app is not constrained, and you should treat those constraints as design
  problems to solve rather than facts to note.

---

## The one disagreement you must rule on

`docs/game/MONETIZATION_DESIGN.md` is marked **LOCKED (v1.0, 2026-07-19)**. It
deliberately designed Premium's progression perks — +3 energy/day, 3 daily contracts
instead of 2, 48h instead of 24h offline accumulation. It defines "never pay-to-win" as
"never *competitive power*" while explicitly permitting collection-progression
acceleration, bounded by a stated guardrail of "premium/free DNA ratio under ~1.7×".
The implementation matches the document; measured, the live ratio is about 1.5×. **This
is a deliberate, internally consistent position, not drift.**

Audit §12 argues the opposite: that SupaSnake should sell only identity and continuity,
never access or advantage, and should carry zero consumables.

These are incompatible. **Rule on it.** Whichever way you rule, the losing position has
real costs — say what they are. Do not resolve this quietly as though it were a bug, and
do not split the difference to avoid choosing.

Three facts bear on it, all verified:

- Paid bundles contain DNA; DNA funds breeding, whose variant selection, trait rolls and
  lineage reroll are all `random()`. Money reaches randomized outcomes through one
  intermediate step, against a stated "no paid RNG, ever" principle.
- Premium perk #1 as advertised — "Season Pass included" — **does not exist**. Season 1
  seeds no premium tiers and the claim function filters them out. A subscriber currently
  pays for a perk with no content behind it.
- Purchased energy is granted uncapped and then destroyed by a live code path
  (`claim-offline` clamps to `max_energy`). Roughly €4 of a €4.99 purchase, silently.

---

## What the Constitution must cover

Cover all of this. **Structure it however serves the argument best** — the ordering
below is a checklist, not a template, and you should reorganize, merge, or split freely
if a better shape presents itself.

- **Identity.** What SupaSnake is, in one sentence and one paragraph — and what it
  refuses to be. Everything else should be derivable from this.
- **The inviolable rules.** A small numbered set replacing the deleted constraint
  lattice. Each testable, each with the question a reviewer asks to check compliance.
  Small enough to remember; if it runs past ~15 you are describing preferences, not laws.
- **The core run** — what is protected, and precisely why, so a future contributor knows
  what they are not allowed to erode.
- **Progression** — the pillars, what each answers for the player, and how they compound.
- **The convergence metric** — where accumulated investment becomes one legible number
  that visibly improves over weeks, how it relates to the build-independent run score,
  and why participation pays proportionally rather than passing a threshold. If you
  conclude SupaSnake should not have one, argue that explicitly; do not omit it.
- **The expansion architecture** — the growth slots, the permanent caps, the dilution
  test, and the sanctioned response to a bad retention month. See the grand strategy
  section; this is a required deliverable, not an appendix.
- **The daily habit** — the ritual, its cadence, why missing a day costs nothing, and
  how it survives a solo developer's content budget for five years.
- **The metagame** — what survives, what is hidden until when, what is deleted.
- **The social layer and its cold start** — treat this as a headline section, not a
  subsection of the metagame. What clans are for; the design that makes them alive at
  twenty players and still worth having at twenty thousand; how competitive symmetry is
  protected at small N; what "SupaSnake's Harvard" is — the smallest bounded population
  that can be saturated first. This is the owner's highest-priority unsolved problem and
  they have explicitly left the approach open to you.
- **Monetization** — your ruling on the locked decision, the offer architecture,
  permanent vs consumable, the free/paying contract, and the dark patterns you forbid
  by name. Note that if clans are central to retention, monetization must be designed so
  that clan competition never becomes the pressure to spend — that is the specific
  failure the owner named in Survivor.io, and it is the hardest needle to thread in the
  entire document.
- **Marketing and growth** — positioning, who this is for, the acquisition thesis, the
  shareable artifact and the moment that earns a share, and how a web game becomes a
  daily habit without a native app. Be concrete; this is the weakest area and the one
  where generic advice is least useful. It is also inseparable from the cold-start
  section above: the acquisition thesis and the first clan are the same problem.
- **The kill list** — every shipped system to remove or hide, each with a preservation
  path for player data, ownership, and history.
- **Sequencing** — what ships in what order, with dependencies, and what must be true
  before launch.
- **The overturn record** — a plain list of every locked or shipped decision this
  document reverses, with the reason and what is being given up. If this list is empty,
  you have not engaged with the material.
- **Open questions** — what you could not decide without data, and the specific test
  that would decide each.

---

## How to work

- **Numbers are hypotheses.** Any conversion rate, retention target, CAC, or revenue
  figure you produce is reasoning, not observation — label it as an assumption and name
  the test that would confirm it. The production dataset is 15 real players; treat every
  quantitative claim about this game's players as unfounded until tested.
- **Default to subtraction.** The game is over-built, not under-built. Eleven systems can
  already address the player between two runs. Any recommendation to *add* something
  needs to argue why an existing system cannot do the job.
- **Decide, don't survey.** Where you weigh a choice, give the ruling and the reasoning
  for it, not an exhaustive tour of alternatives you won't pursue.
- **Delegate freely.** Use parallel subagents for independent strands (e.g. drafting the
  marketing thesis while working the economy) and keep working while they run. Do not
  send them into the repository to gather more context.
- **Check your own work.** Establish a method for verifying the document against itself
  as you build it, and run it periodically — the failure mode for a document this size
  is internal contradiction, a monetization section that quietly assumes a system the
  kill list deletes.
- **You have ample context.** Do not stop, summarize, or suggest a new session on
  account of context limits.
- Write it for a reader who did not see any of your working. Lead with what you decided.

### When to escalate to the owner

The owner is available and *wants* to be consulted on decisions that genuinely belong to
them. They do not want to be consulted on everything. Get this balance right — asking too
much wastes the reason you were given this brief; asking too little produces a document
built on a guess about their taste.

**Decide it yourself — do not ask —** when the brief, `GROUND_TRUTH.md`, or the audit give
you enough to form a defensible view. That explicitly includes all ten open design
decisions (Energy, gene pool size, breeding determinism, aim systems, clan scope, season
expiry, the day boundary, the dominant fantasy, and the rest), the ruling on the locked
monetization document, the kill list, and the sequencing. You were given full authority
over these. A defensible ruling you commit to is worth more than a question.

**Escalate** only when a decision meets all three tests:

1. It **forks the product**, not a system — two coherent, defensible versions of SupaSnake
   follow from it, and everything downstream changes depending on which you pick.
2. The deciding input is **the owner's own taste, ambition, or appetite for risk** —
   something no amount of reasoning from the material can supply.
3. Getting it wrong would **invalidate large parts of the document**, not require an edit.

Realistically that is a small number of questions, possibly zero. Candidate shape: "is
this a game for a few thousand devoted players or a mass-market daily habit, because the
clan design, the monetization, and the marketing all resolve differently."

**How to ask:**

- **Batch them.** Reach the point where you know the full set, then ask once. Do not
  interrupt repeatedly.
- **Ask with a recommendation.** Give your ruling and the reasoning, and ask whether they
  disagree — never present a bare menu. If they do not respond or respond loosely, your
  recommendation stands.
- **Keep working while you wait** wherever the rest of the document does not depend on
  the answer. Write the dependent section under a clearly stated assumption rather than
  blocking on it.
- **Ask and end the turn.** Do not end on a promise of work you have not done — if your
  final paragraph is a plan, a question about something you could have decided, or an
  "I'll now…", do that work first.
- Everything below the escalation bar goes in **Open Questions** with the test that would
  settle it, not into a message.

---

## The test this document has to pass

The owner should be able to read it and recognize their own game — better organized than
they could have organized it, with decisions they had been avoiding now made and
defended, and with an honest account of what each decision costs.

If it reads as a generic free-to-play design document with SupaSnake's nouns substituted
in, it has failed. The specific things worth building on are already there: an extraction
decision that converts a familiar game into a strategic one, three rulesets that change
how you read space, a leaderboard score that is deliberately independent of build power,
a cosmetics and identity substrate that is already deployed and barely used, and an
onboarding flow that gets a stranger onto the board in one click.
