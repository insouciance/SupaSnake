# Training Lab product and systems contract

Status: approved feature design, implemented on `feat/training-lab`.

## Player outcome

Training Lab gives a player a short, repeatable way to isolate a Supa Snake
movement skill, understand one actionable error, retry without setup friction,
and then test whether that skill transfers to an unfamiliar route. Practice is
valuable because the player becomes better at the game, not because the mode
pays currency or advances a checklist.

Training is always rewardless. It spends no Energy and grants no DNA, mastery,
contract progress, streak progress, season progress, or leaderboard score.
Sandbox results are diagnostic and never become standardized records.

## Research synthesis

The design adapts learning structures that recur across mechanically demanding
games and motor-learning research. It does not reproduce any one game's mode.

| Source pattern | Learning value | Supa Snake adaptation |
| --- | --- | --- |
| Motor-learning challenge-point research argues that useful task difficulty depends on the learner and task. | Practice that is trivial or overwhelming produces weak information. | Foundation, Advanced, and Elite are all available immediately; the Skill Profile suggests a weak area without locking player choice. |
| Self-controlled feedback research finds its clearest benefit in retention and transfer, while evidence during initial acquisition is mixed. | Learners benefit from control, but guidance should not be mistaken for mastery. | The player chooses Full route, Next six, PB trace, or No guide. A separate guide-free Circuit measures transfer. |
| Contextual-interference research generally finds that interleaving can hurt practice performance while improving delayed transfer, with substantial task heterogeneity. | Blocked repetition helps acquisition; varied checks reveal whether learning generalized. | Focus Drills preserve same-scenario retry. The Circuit then interleaves four held-out skills. It does not randomize every early repetition. |
| Racing time trials expose personal ghosts, sectors, split deltas, and session records. | A comparison trace turns an abstract best into a visible, local target. | Matching-seed PB ghosts and corner splits show where a line gained or lost ticks. |
| Fighting-game training records and replays situations and provides fast restart shortcuts. | Reproducible state and low restart cost enable deliberate correction of one response. | Every drill has deterministic opening geometry; Retry reuses the exact scenario and Next variant changes it. |
| Aim trainers separate broad performance into specific subskills and controlled task variants. | A named weakness can be trained instead of repeatedly playing the full game. | Precision, Planning, Tempo, and Recovery each have a drill and primary metric. |
| Speedrunning split tools compare each segment with a personal best. | Segment feedback distinguishes one bad section from a generally weak run. | The recap reports corner-by-corner tick deltas and a single next adjustment. |
| Rhythm practice commonly isolates short patterns, changes tempo, and makes immediate retry cheap. | Compact repetitions create many high-quality correction cycles. | Focus Drills target 20–60 second attempts and Tempo compresses the tick window. |

Primary references:

- Guadagnoli and Lee, [Challenge Point: A Framework for Conceptualizing the Effects of Various Practice Conditions in Motor Learning](https://doi.org/10.3200/JMBR.36.2.212-224).
- Wang et al., [Self-Controlled Feedback and Behavioral Outcomes in Motor Skill Learning: A Meta-Analysis](https://pmc.ncbi.nlm.nih.gov/articles/PMC12467369/).
- Czyż et al., [The effect of contextual interference on transfer in motor learning](https://pmc.ncbi.nlm.nih.gov/articles/PMC11349744/).
- Gran Turismo 7 manual, [Ghost Settings](https://www.gran-turismo.com/us/gt7/manual/drivingoption/06) and [Session Best/Car Record](https://www.gran-turismo.com/us/gt7/manual/race/04).
- Street Fighter 6 manual, [Training Mode Recording Tips](https://game.capcom.com/manual/SF6/en/steam/page/8/6).
- Aimlabs, [Introduction to Aim Training](https://aimlabs.com/articles/aimlabs/introduction-to-aim-training-the-basics-of-aimlabs/).
- LiveSplit, [Components and split comparisons](https://livesplit.org/components/).

## Learning loop

```text
Choose one weakness
        ↓
Run a short deterministic Focus Drill
        ↓
See rating + accuracy + efficiency + consistency + splits
        ↓
Apply one diagnosis and retry the same scenario
        ↓
Change variant or remove guidance
        ↓
Prove transfer in the four-skill Circuit
        ↓
Skill Profile shows ceiling and recent consistency
```

The same-scenario retry is deliberately the primary recap action. A new variant
is adjacent, never automatic. This supports correction before variability. The
Circuit uses held-out seeded transformations and no route guide, so memorizing a
single line cannot stand in for control.

## Practice surfaces

### Focus Drills

- **Trace / Precision:** follow an authored path through every checkpoint.
  It trains line accuracy and exact corner timing. This is the Path Training
  concept, promoted to the flagship precision drill rather than the entire
  mode.
- **Route / Planning:** collect ordered targets using the shortest practical
  line. Detours remain legal but reduce efficiency.
- **Tempo / Tempo:** execute a rehearsed line as the tick window compresses.
  It uses the production input queue and reaches the production 50 ms speed
  cap at Elite.
- **Escape / Recovery:** begin inside an authored dangerous body shape and
  reach safety. It trains the first corrective turn and composure after a bad
  position.

All catalog scenarios use versioned references containing exercise,
difficulty, and seed. The reference deterministically selects a rotation and
reflection of authored geometry. The client submits only that reference and
its bounded input trace; it never submits trusted scores.

### Training Circuit

The Circuit runs Trace, Route, Tempo, and Escape in sequence at the selected
difficulty. Guidance is forced off. The final recap shows the four exercise
ratings and their mean as a transfer rating. Circuit play has no separate
reward track, entry cost, or global ranking.

### Open Sandbox

The player composes a non-crossing path on the 20×20 board, selects an active
dynasty arena, adjusts tick pace from 250 ms to 50 ms, and chooses a starting
length from 3 to 8. Mouse, touch, and 44 px directional controls all edit the
same route. Presets are bounded to 20 per player and are durable only through
the server; browser storage is not authoritative.

Sandbox keeps the production movement and collision engine, but its score is
diagnostic. Custom geometry cannot be compared fairly across players or routes,
so it has no medals, catalog PB, or leaderboard.

## Feedback and scoring

Every attempt starts on a held board and requires a deliberate safe direction.
The cockpit then shows only practice-relevant telemetry: objective progress,
tick budget, pace, guidance, level, and matching PB. Route cells, checkpoints,
and the optional PB trace render inside the 3D world rather than covering the
board with DOM UI.

The recap reports:

- **Accuracy:** path match for Trace/Tempo; ordered objective completion for
  Route/Escape.
- **Efficiency:** optimal ticks divided by actual ticks for a completed run;
  incomplete runs receive only a bounded progress value.
- **Consistency:** timing error plus rejected and unnecessary input penalties.
- **Rating:** 55% accuracy, 25% efficiency, 20% consistency.

Incomplete attempts are capped below the medal floor. Catalog medals are
Bronze, Silver, Gold, and Prismatic; higher medals require both rating and an
accuracy gate. Accuracy is intentionally protected from a faster but sloppy
line. The PB comparison orders attempts by completion, accuracy, efficiency,
consistency, and then fewer ticks. The recap gives one diagnosis, not a list of
generic tips.

Recent median and PB answer different questions: PB shows the player's ceiling;
the latest ten attempts show whether that execution is becoming repeatable.
The profile recommends the lowest-developed skill, but all exercises and
difficulties remain player-controlled.

## Authority and replay contract

Training reuses `SnakeGameLogic` for movement, input buffering, pause safety,
collisions, and dynasty walls. `startDriven` adds validated authored starting
geometry without creating a second movement engine. `TrainingRun` owns only
training objectives, trace capture, splits, and scoring.

For a standardized attempt, the server:

1. authenticates the player and resolves the server-owned player id;
2. accepts only a versioned scenario reference and an ordered, bounded input
   trace (directions and tactical holds) plus the exact end tick;
3. reconstructs the scenario and replays every input through the same engine;
4. recomputes all metrics and ignores client score claims;
5. records the attempt and conditionally updates the best atomically.

The durable model consists of owner-scoped `training_attempts`,
`training_bests`, and `training_presets`, plus the
`record_training_attempt` transaction. Deletes cascade from `players`. No
training write touches Energy, DNA, mastery, contracts, seasons, streaks, or
game sessions. Until its centrally numbered migration is present, reads return
an explicit non-live profile and verified attempts remain session-local; this
degradation never falls back to `localStorage`.

## Retention hypothesis and evaluation

The retention mechanism is mastery investment: the player can see a weakness,
practice it, and later feel the difference in a real run. The mode intentionally
does not use login streaks, attempt-count rewards, forced daily drills, or
volume-based unlocks. Those systems can increase activity without proving
learning and can turn practice into obligation.

Evaluate the feature using cohorts rather than raw attempt volume:

- repeat Training Lab use after 1, 7, and 28 days;
- same-scenario retry rate followed by rating or primary-metric improvement;
- movement from guided drills to No guide and Circuit;
- PB ceiling versus recent-median consistency over time;
- subsequent Free Play and earning-run survival, food rate, bank rate, and
  high-score improvement, segmented by prior skill;
- abandon rate and time-to-retry by drill/difficulty, used to find challenge
  cliffs rather than to punish stopping.

A successful iteration improves transfer to ordinary play. More attempts with
flat or worsening transfer is not success.

Consent-gated analytics records attempt start source, exercise, difficulty,
guidance, bounded outcome metrics, verification/persistence status, and preset
shape. It does not send scenario seeds, input traces, route coordinates, or
player-auth tokens to analytics.

## Accessibility and board protection

- Keyboard supports arrows and WASD; coarse pointers receive the existing
  cockpit D-pad.
- Training begins and resumes only from a deliberate direction, preserving the
  tactical-hold safety contract.
- Controls are at least 44 px and the path composer has button alternatives to
  pointer drawing.
- Color is supplemented by labels, shapes, progress text, and split values.
- Cockpit instruments occupy reserved layout zones outside the square WebGL
  viewport at desktop and mobile sizes.
- Reduced-motion behavior comes from the existing application and cockpit
  primitives; training adds no mandatory flashing or timing-only instructions.

## Explicit non-goals

- no training currency, XP, mastery, contracts, season progress, or Energy;
- no global Training leaderboard or social pressure;
- no daily/weekly obligation in this release;
- no duplicated physics engine or client-authoritative durable profile;
- no obstacles that do not exist in production Supa Snake;
- no change to earning-run settlement, Free Play settlement, or production
  deployment behavior.
