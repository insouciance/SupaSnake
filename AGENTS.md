# SupaSnake parallel-agent working agreement

This file applies to every coding agent working anywhere in this repository.
It defines the shared operating rules for concurrent feature development. A
feature assignment may add stricter requirements, but it must not silently
weaken these rules.

## Clean-context assumption

Assume you have no prior conversation context. Do not rely on phrases such as
"as discussed," "the earlier plan," or "the other agent's work." Your sources
of truth are:

1. The current assignment prompt.
2. This file.
3. The current repository and its authoritative documentation.

The assignment must provide a sufficiently clear feature outcome and acceptance
criteria. Operational details such as the branch name, worktree path, starting
SHA, likely file ownership, relevant tests, and documentation scope should be
derived by the agent using the defaults below. Do not ask the user to perform
routine Git setup that the agent can safely perform itself.

Ask for clarification only when a missing product decision would materially
change player behavior, data compatibility, security, money movement, or the
public contract. Do not reconstruct those decisions from historical plans.

## Required startup check

Before editing code:

1. Locate the canonical repository and inspect its status without changing or
   cleaning the primary worktree.
2. Read this file and `docs/README.md`, which routes to the current product and
   operations sources of truth.
3. Read `README.md`, `PLATFORM_STATUS.md`, and only the authoritative product or
   operations documents relevant to the assigned feature.
4. Fetch `origin/main`, derive a unique feature slug, and self-provision the
   clean branch and worktree described below unless the assignment supplies
   them explicitly.
5. Confirm the resulting absolute path with `pwd` and branch with
   `git branch --show-current`.
6. Record the starting SHA with `git rev-parse HEAD`.
7. Inspect `git status --short --branch` and begin implementation only from a
   clean feature worktree.
8. Inspect the affected implementation, tests, and recent history before
   proposing or writing changes.
9. Restate the understood scope, non-goals, inferred owned and shared paths,
   dependencies, and validation plan in the first progress update, then proceed
   unless a genuine conflict or product ambiguity exists.

Do not treat routine inferred details as blockers. Stop and report only when the
current repository cannot be identified safely, the intended branch/worktree
collides with another assignment, the base cannot be fetched, the worktree is
dirty, or the feature depends on a material product decision that is absent.

## Self-provisioning a feature workspace

For a normal implementation assignment, the agent owns setup of its feature
workspace. Unless the prompt explicitly provides different values:

1. Update remote knowledge with `git fetch origin main` without changing the
   primary worktree.
2. Derive a short lowercase kebab-case slug from the feature, for example
   `contract-tracker`.
3. Use branch `feat/<slug>`.
4. Use the adjacent absolute worktree path
   `/Volumes/Souci_WD/Dev/active/SupaSnake-worktrees/<slug>`.
5. Record `origin/main` as the base and expected starting SHA.
6. Verify that neither branch nor worktree path belongs to another active task.
7. Create the shared parent directory `SupaSnake-worktrees` if it does not yet
   exist; do not remove or alter existing entries in it.
8. Create both from the same fetched `origin/main` commit with `git worktree
   add -b feat/<slug> <absolute-path> origin/main`.
9. Perform every subsequent command and edit inside that new worktree.

If the proposed branch or path already exists, inspect it read-only. Resume it
only when it is clearly the same assignment and is clean; otherwise stop and
report the collision rather than choosing an ambiguous workspace or touching
another agent's files.

Leave the feature worktree in place at handoff so the integration owner can
inspect it. The integration owner removes completed worktrees and branches.

The primary repository may contain the orchestrator's own documentation or
integration changes. Its status does not block creation from clean
`origin/main`; never include those local changes in the feature branch.

## Worktree and branch isolation

- Work only in the dedicated absolute worktree and `feat/<feature>` branch
  created for the assignment.
- Never implement a feature directly on `main`, `develop`, a release branch, or
  the primary main worktree.
- Do not switch the branch of a shared worktree.
- You may create and use your own feature worktree as described above. Do not
  create, delete, prune, move, lock, or unlock another agent's worktree.
- Do not edit, stage, commit, stash, restore, or clean files belonging to
  another worktree or assignment.
- Do not merge, rebase, or cherry-pick another feature branch. Cross-feature
  integration belongs to the designated integration owner.
- Never force-push, rewrite published history, or use destructive Git commands
  such as `git reset --hard` or `git clean -fd`.
- Preserve unrelated changes. If unrelated modifications appear in the feature
  worktree, stop and report their paths and status.

The integration owner alone manages merge order, integration conflicts,
release branches, pull-request merging, and updates to `main`.

## Scope and file ownership

Infer the smallest reasonable file ownership set by inspecting the feature's
code paths. In the first update, list:

- The player or operator outcome.
- In-scope behavior and acceptance criteria.
- Inferred non-goals.
- Files or directories likely to change.
- Shared hotspots that may require a small coordinated edit.
- Dependencies on other parallel features discovered in the repository.
- Whether schema, configuration, generated assets, or documentation may change.

Then proceed without asking the user to approve routine ownership choices. If
implementation reveals another necessary path, add it to the next progress
update and keep the edit narrowly tied to the feature.

Stop for ownership coordination only when the prompt or repository evidence
shows that another active agent owns the same behavior, when an unexpected
dirty file exists in this worktree, or when two features would change an
incompatible shared contract. Normal Git merge overlap by itself is not a
reason to abandon an otherwise self-contained feature.

Treat these as shared hotspots and keep edits minimal:

- `package.json` and `package-lock.json`
- global styles, shared design tokens, and cross-feature UI primitives
- shared stores, central configuration, and common API contracts
- `supabase/migrations/`
- `.github/workflows/` and deployment configuration
- root context/status files and documentation indexes

Prefer additive, feature-local changes over broad refactors. Do not
opportunistically clean up adjacent systems in a parallel feature branch;
record useful follow-up ideas in the handoff instead.

## Product and architecture boundaries

- Current product contracts are indexed in `docs/README.md`. They override
  historical research and aspirational roadmaps.
- Protect immediate gameplay, player-pulled discovery, and the unobstructed
  game board unless the authoritative contract explicitly says otherwise.
- Keep progress, economy, rewards, and session settlement server-authoritative.
- Do not introduce authoritative player state in `localStorage`.
- Active dynasties are CYBER, PRIMAL, and COSMIC. Do not reintroduce deprecated
  EMBER, CRYSTAL, or VOID models.
- Check every Supabase error result and preserve established telemetry/error
  handling.
- Do not leave placeholders, TODOs, FIXMEs, disabled tests, or incomplete
  implementations in committed work.

## Database and migration coordination

Database migration numbers are the one resource that parallel feature agents
must not allocate independently.

- Verify the current migration set; do not rely only on a number quoted in a
  prompt or old document.
- When a migration is required and none was reserved, finish all safe
  non-migration work, report the proposed schema change, and request a migration
  number before creating the migration file.
- Never renumber, edit, or replace an existing/deployed migration.
- Migrations are forward-only, idempotent where appropriate, and must preserve
  existing player choices and data.
- Use only the isolated local Supabase environment for feature development and
  automated tests.
- Never apply, repair, reset, link, or validate changes against hosted Supabase
  from a feature assignment unless the user gives explicit production-operations
  authorization in that agent's current prompt.

## Production and external systems

A feature implementation assignment does not authorize deployment or hosted
state changes.

- Do not deploy to Vercel or any other environment.
- Do not change production aliases, domains, environment variables, feature
  flags, integrations, billing state, or deployment protection.
- Do not apply hosted database migrations.
- Do not enable Stripe live mode or perform real transactions.
- Do not merge or close pull requests unless explicitly assigned as the
  integration owner.
- Never commit secrets, `.env` files, credentials, production data, generated
  reports, Playwright artifacts, or build output.

Read `PLATFORM_STATUS.md` for current production facts and
`docs/ops/RELEASE_RUNBOOK.md` for release boundaries. Do not copy volatile
production identifiers into feature code or new planning documents.

## Implementation discipline

1. Inspect and explain the relevant code path before editing it.
2. Form a concise implementation plan tied to the acceptance criteria.
3. Make the smallest coherent change that completely implements the feature.
4. Preserve existing gameplay and production behavior outside the scope.
5. Add or update tests for success, failure, boundary, and regression cases.
6. Update the relevant authoritative feature documentation when behavior
   changes. Keep shared-document edits focused and flag them in the handoff.
7. Keep commits focused and logically ordered. Do not mix formatting churn or
   unrelated cleanup into feature commits.

## Validation minimum

Infer the relevant tests from the affected code and acceptance criteria; the
user does not need to enumerate routine commands. Run the narrowest relevant
checks during development. Before handoff, run and report at least:

```text
git diff --check
npx tsc --noEmit
npm run lint
relevant Jest tests
```

Also run the appropriate broader gate when the change warrants it:

- `npm test -- --runInBand` for shared logic or broad regressions.
- `npm run build` for routing, server/client boundaries, configuration, or
  production-build behavior.
- `CI=1 npm run test:e2e -- <relevant spec>` for player journeys. Keep E2E
  isolated and non-destructive; do not target production.
- The relevant `verify:cockpit-*` scripts for game-screen, arena, camera, HUD,
  decision-surface, or responsive-layout changes.
- Local Supabase tests for schema, RPC, auth, or server-authoritative behavior.

Never silently weaken a quality gate, coverage threshold, assertion, fixture,
or lint rule to make a change pass. Explain any check that cannot be run.

## Git delivery

The default delivery mode for an implementation assignment is: make focused
commits, push only the assigned feature branch, and provide the handoff below.
The user does not need to specify this every time. An explicit prompt may choose
local commits only instead.

- Stage only files tied to the assignment.
- Review the staged diff before every commit.
- Use clear, focused commit messages.
- Leave the feature worktree clean at handoff.
- Never push another agent's branch.
- Do not merge the branch, update `main`, create or merge a pull request, create
  a release, or deploy unless explicitly assigned as the integration owner.

## Required handoff

Finish with a self-contained report containing:

- Feature branch and absolute worktree path.
- Starting SHA, final SHA, and commit list.
- Implemented behavior and explicit non-goals.
- Files changed.
- Tests and quality gates run, with results.
- Migration, configuration, dependency, or feature-flag changes.
- Known risks, manual checks still needed, and possible regressions.
- Shared-file needs, conflicts, and dependencies for the integration owner.
- Confirmation that nothing was deployed and no hosted database state changed.

Do not claim the feature is production-ready merely because its focused tests
pass. The integration owner is responsible for cross-feature validation,
documentation reconciliation, pull-request checks, migration sequencing, and
deployment approval.

## Minimum clean-context assignment

For a standard feature, the orchestrator only needs to provide:

```text
Read and follow /Volumes/Souci_WD/Dev/active/SupaSnake/AGENTS.md completely
before taking any action. You are responsible for creating your own clean
feat/<feature> branch and dedicated worktree from the latest origin/main.

Feature: <clear feature name>
Outcome: <player or operator outcome>
Acceptance criteria:
- <criterion>
- <criterion>

Additional product constraints or non-goals, if any:
- <constraint>
```

The agent derives the branch name, worktree path, starting SHA, owned paths,
shared paths, dependencies, relevant tests, documentation changes, and default
commit-and-push delivery. Supply an override only when a feature genuinely needs
one, such as a pre-reserved migration number or a dependency on another
unmerged branch.
