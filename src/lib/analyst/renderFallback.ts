/**
 * The Analyst — templated fallback renderer (Identity v1 §9.1).
 *
 * Renders every artifact from the same deterministic fact sheets as the
 * LLM path. This is the load-bearing floor: no key, budget breaker
 * tripped, parse failure, refusal, kill switch — the player still gets
 * a specific, numerate artifact. Every number here comes straight from
 * facts.ts; no new arithmetic beyond formatting.
 */

import {
  AnalystFacts,
  ArtifactContent,
  ArchetypeFacts,
  ARCHETYPES,
  DigestFacts,
  RecallFacts,
  RunFacts,
  ScoutFacts,
  detectArchetype,
} from './facts';

const DEATH_LABEL: Record<string, string> = {
  wall: 'the wall',
  self: 'your own tail',
  timeout: 'the clock',
  extracted: 'a clean extraction',
};

function dnaFmt(n: number): string {
  return `${n} DNA`;
}

// ---------------------------------------------------------------------------
// Run insight
// ---------------------------------------------------------------------------

function renderRunInsight(f: RunFacts): ArtifactContent {
  const tips: string[] = [];
  let headline: string;
  let body: string;

  if (f.outcome === 'extracted') {
    headline = 'Banked and gone';
    body = `A ${f.foods}-food ${f.dynasty} run, banked for ${dnaFmt(f.dnaEarned)}.`;
    if (f.outcomeMath.protectedByBanking !== null) {
      body += ` Extracting protected ${dnaFmt(f.outcomeMath.protectedByBanking)} that a crash would have burned.`;
    }
    if (f.portals.passesBeforeBank !== null && f.portals.passesBeforeBank >= 2) {
      body += ` You passed ${f.portals.passesBeforeBank} portals before taking the exit — nerve held.`;
      tips.push('Deep runs pay, but each passed portal risks the whole stack.');
    }
  } else {
    const cause = DEATH_LABEL[f.deathCause ?? ''] ?? 'a crash';
    headline = `Taken by ${cause}`;
    body = `A ${f.foods}-food ${f.dynasty} run ended by ${cause}, salvaging ${dnaFmt(f.dnaEarned)}.`;
    if (f.outcomeMath.missedByCrashing !== null && f.outcomeMath.missedByCrashing > 0) {
      body += ` Banking instead would have added ${dnaFmt(f.outcomeMath.missedByCrashing)}.`;
    }
    if (f.portals.passes >= 1) {
      body += ` You passed ${f.portals.passes} exit ${f.portals.passes === 1 ? 'portal' : 'portals'} on the way down.`;
      tips.push('When a portal spawns late in a run, the math usually favors taking it.');
    }
    if (f.deathCause === 'wall' && f.nearWall.episodes >= 3) {
      tips.push(`You hugged the wall margin ${f.nearWall.episodes} times this run — the center gives more escape routes.`);
    }
  }

  if (f.pace.deltaPct !== null && f.pace.personalMedian !== null) {
    if (f.pace.deltaPct >= 15) {
      body += ` Pace was ${f.pace.foodsPerMinute} foods/min, ${f.pace.deltaPct}% over your 30-day median of ${f.pace.personalMedian}.`;
    } else if (f.pace.deltaPct <= -15) {
      body += ` Pace was ${f.pace.foodsPerMinute} foods/min, ${Math.abs(f.pace.deltaPct)}% under your 30-day median of ${f.pace.personalMedian}.`;
    }
  }

  if (tips.length === 0 && f.build.held === 0 && f.foods >= 15) {
    tips.push('You ran clean — a single economy mutation would have compounded this run.');
  }

  return { headline, body, tips: tips.slice(0, 2) };
}

// ---------------------------------------------------------------------------
// Weekly digest
// ---------------------------------------------------------------------------

function renderDigest(f: DigestFacts): ArtifactContent {
  const headline =
    f.earningRuns > 0
      ? `${dnaFmt(f.totalDna)} banked this week`
      : 'A quiet week in the Lab';
  let body: string;
  if (f.earningRuns === 0) {
    body = 'No earning runs this week. The board keeps score when you return.';
  } else {
    body = `${f.earningRuns} earning runs across ${f.activeDays} days, extracting ${f.extractionRatePct}% of them.`;
    if (f.topDynasty) {
      body += ` ${f.topDynasty} carried the week with ${f.dynastyRuns[f.topDynasty]} runs.`;
    }
    body += ` Best single run: ${dnaFmt(f.bestDnaRun)}.`;
    if (f.recordsAdvanced.length > 0) {
      const first = f.recordsAdvanced[0];
      body += ` Record advanced: ${first.name} reached tier ${first.tier}.`;
    }
  }
  const tips: string[] = [];
  if (f.streak !== null && f.streak > 0) {
    tips.push(`Your login streak stands at ${f.streak} days.`);
  }
  if (f.contracts && f.contracts.completed > 0) {
    tips.push(`${f.contracts.completed} contracts completed this week.`);
  }
  return { headline, body, tips: tips.slice(0, 2) };
}

// ---------------------------------------------------------------------------
// Archetype
// ---------------------------------------------------------------------------

function renderArchetype(f: ArchetypeFacts): ArtifactContent {
  const detection = detectArchetype(f);
  const meta = ARCHETYPES[detection.archetype];
  const headline = meta.name;
  let body: string;
  switch (detection.archetype) {
    case 'surgeon':
      body = `Season ${f.seasonSeq}: you extracted ${f.extractionRatePct}% of your earning runs, typically banking by portal ${f.medianBankingPortal}. ${meta.fantasy}.`;
      break;
    case 'daredevil':
      body = `Season ${f.seasonSeq}: ${f.meanPortalsPassed} portals passed per run on average, with ${f.dnaLostToSalvagePct}% of potential DNA left on the board. ${meta.fantasy}.`;
      break;
    case 'loyalist': {
      const top = Object.entries(f.dynastySharesPct).sort(
        (a, b) => b[1] - a[1]
      )[0];
      body = `Season ${f.seasonSeq}: ${top?.[1] ?? 0}% of your ${f.earningRuns} earning runs ran ${top?.[0] ?? 'one dynasty'}. ${meta.fantasy}.`;
      break;
    }
    case 'polymath':
      body = `Season ${f.seasonSeq}: every dynasty saw real play across ${f.earningRuns} earning runs, all three masteries developed. ${meta.fantasy}.`;
      break;
    case 'alchemist':
      body = `Season ${f.seasonSeq}: ${f.meanMutationsHeld} mutations held per run on average, accepting ${f.offerAcceptPct ?? 0}% of offers. ${meta.fantasy}.`;
      break;
    case 'purist':
      body = `Season ${f.seasonSeq}: ${f.meanMutationsHeld} mutations held on average across ${f.earningRuns} runs. ${meta.fantasy}.`;
      break;
    case 'redliner':
      body = `Season ${f.seasonSeq}: ${f.cyber.tier4Pct}% of your CYBER runs reached tier 4, banking ${f.cyber.tier4Banked} from the redline. ${meta.fantasy}.`;
      break;
    case 'metronome':
      body = `Season ${f.seasonSeq}: 5-day play weeks in ${f.rhythm.fiveDayWeeks} of ${f.rhythm.seasonWeeks} season weeks, completing ${f.contractCompletionPct ?? 0}% of contracts. ${meta.fantasy}.`;
      break;
    case 'hatchling':
    default:
      body = `Season ${f.seasonSeq}: ${f.earningRuns} earning runs — not yet enough to read a shape. The next season names you.`;
      break;
  }
  return {
    headline,
    body,
    tips: [],
    badge: detection.archetype === 'hatchling' ? undefined : meta.badgeId,
  };
}

// ---------------------------------------------------------------------------
// Season Recall
// ---------------------------------------------------------------------------

function renderRecall(f: RecallFacts): ArtifactContent {
  const seasonLabel = f.seasonName
    ? `Season ${f.seasonSeq} — ${f.seasonName}`
    : `Season ${f.seasonSeq}`;
  const headline = `${seasonLabel}, chronicled`;
  let body = `${f.totalRuns} runs over ${f.activeDays} days, ${dnaFmt(f.totalDna)} banked, best single run ${dnaFmt(f.bestDnaRun)}.`;
  if (f.favoriteDynasty) {
    body += ` ${f.favoriteDynasty} was home: ${f.dynastyRuns[f.favoriteDynasty]} earning runs.`;
  }
  if (f.variantsAcquired > 0) {
    body += ` ${f.variantsAcquired} new variants joined the collection.`;
  }
  if (f.archetypeName) {
    body += ` The season named you ${f.archetypeName}.`;
  }
  if (f.clan) {
    body += f.clan.champion
      ? ` And ${f.clan.name} took the championship.`
      : ` ${f.clan.name} went ${f.clan.duelWins}-${f.clan.duelLosses} in the duels.`;
  }
  return { headline, body, tips: [] };
}

// ---------------------------------------------------------------------------
// Gauntlet scouting brief
// ---------------------------------------------------------------------------

function renderScout(f: ScoutFacts): ArtifactContent {
  const headline = `Scouting ${f.opponent.name}`;
  let body = `${f.opponent.name} [${f.opponent.tag}] fields ${f.rosterSize} at rating ${f.opponent.rating}.`;
  if (f.deepestDynasty) {
    const profile = f.masteryProfile[f.deepestDynasty];
    body += ` Their depth is ${f.deepestDynasty}`;
    if (profile && profile.m5Plus > 0) {
      body += ` — ${profile.m5Plus} rostered at M5 or higher, topping out at M${profile.maxLevel}`;
    }
    body += '.';
  }
  const tips: string[] = [];
  if (f.pickHistory.repeatedDynasty) {
    tips.push(
      `They have picked ${f.pickHistory.repeatedDynasty} in ${f.pickHistory.dynastyCounts[f.pickHistory.repeatedDynasty]} of their last ${f.pickHistory.weeks} duels.`
    );
  }
  if (f.pickHistory.bans.length > 0) {
    tips.push(`Recent bans: ${f.pickHistory.bans.slice(0, 3).join(', ')}.`);
  }
  return { headline, body, tips: tips.slice(0, 2) };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function renderFallback(facts: AnalystFacts): ArtifactContent {
  switch (facts.kind) {
    case 'run_insight':
      return renderRunInsight(facts);
    case 'weekly_digest':
      return renderDigest(facts);
    case 'archetype':
      return renderArchetype(facts);
    case 'season_recall':
      return renderRecall(facts);
    case 'scout_narration':
      return renderScout(facts);
  }
}
