/**
 * ══════════════════════════════════════════════════════════
 *  PRANA — Priority Formula Validation Suite
 * ══════════════════════════════════════════════════════════
 *
 *  This does NOT need the server, DB, or frontend running.
 *  It tests the same math as pr() in PRANA_v4.html against a set of
 *  hand-written scenarios where the "expectedRank" is YOUR (or your
 *  domain expert's) judgment call on what the correct priority order
 *  should be.
 *
 *  HOW TO USE:
 *    node validate-priority.js
 *
 *  HOW TO EXTEND:
 *    1. Add more scenarios below. Base them on real incident patterns
 *       if you have them, or on what a rescue coordinator would tell you.
 *    2. Set expectedRank = 1 for "should be handled first", 2 for next, etc.
 *       Zones with the SAME expectedRank are considered a tie (order between
 *       them doesn't matter).
 *    3. Run this after every time you touch the pr() weights (.4/.35/.25)
 *       in PRANA_v4.html — keep this file's formula in sync with that one.
 *    4. When mismatches show up, that's a signal to either:
 *         a) adjust the formula weights, or
 *         b) accept the formula is right and your expectedRank was off
 *            (discuss with whoever gave you the ranking)
 */

'use strict';

// ─── Mirror of the frontend formula (PRANA_v4.html line ~1212) ───
// pr = z => ((z.hp/100)*.4 + Math.exp(-.048*z.ts)*.35 + (z.sr/100)*.25) * 100;
function pr(z) {
  return ((z.hp / 100) * 0.4 + Math.exp(-0.048 * z.ts) * 0.35 + (z.sr / 100) * 0.25) * 100;
}

// ─── Scenarios ───
// hp = human-presence probability (%), ts = time since incident (hours),
// sr = survival rate estimate (%), hc = human count (headcount)
const scenarios = [
  {
    name: 'Fresh high-confidence vs. stale low-confidence',
    zones: [
      { id: 'A', hp: 94, ts: 0.5, sr: 90, hc: 7, expectedRank: 1 }, // just happened, strong signal
      { id: 'B', hp: 40, ts: 8,   sr: 30, hc: 2, expectedRank: 2 }, // old, weak signal
    ],
  },
  {
    name: 'Many weak-signal survivors vs. few strong-signal survivors',
    zones: [
      { id: 'C', hp: 90, ts: 1,  sr: 85, hc: 2,  expectedRank: 1 }, // small but high-confidence
      { id: 'D', hp: 35, ts: 1,  sr: 40, hc: 15, expectedRank: 2 }, // large headcount, low confidence
    ],
    note: 'Formula ignores headcount entirely — worth deciding if that\'s intentional.',
  },
  {
    name: 'Time decay should matter even with high initial confidence',
    zones: [
      { id: 'E', hp: 95, ts: 1,  sr: 92, hc: 5, expectedRank: 1 },
      { id: 'F', hp: 95, ts: 10, sr: 92, hc: 5, expectedRank: 2 }, // same everything, just later
    ],
  },
  {
    name: 'Two zones nearly tied — formula should not wildly diverge',
    zones: [
      { id: 'G', hp: 70, ts: 3, sr: 65, hc: 4, expectedRank: 1 },
      { id: 'H', hp: 68, ts: 3, sr: 63, hc: 4, expectedRank: 1 }, // tie — either order acceptable
    ],
  },
  {
    name: 'Low survival rate but recent + high presence (borderline triage call)',
    zones: [
      { id: 'I', hp: 90, ts: 0.5, sr: 20, hc: 6, expectedRank: 1 }, // urgent — SR dropping fast
      { id: 'J', hp: 60, ts: 4,   sr: 55, hc: 3, expectedRank: 2 },
    ],
    note: 'Checks whether the formula reacts fast enough to low SR + high urgency.',
  },
];

// ─── Run ───
function spearman(expected, actual) {
  // actual/expected are arrays of {id, rank}. Simple correlation on rank positions.
  const n = expected.length;
  if (n < 2) return 1;
  const eMap = new Map(expected.map((e, i) => [e.id, i]));
  const aMap = new Map(actual.map((a, i) => [a.id, i]));
  let sumSqDiff = 0;
  for (const id of eMap.keys()) {
    const d = eMap.get(id) - aMap.get(id);
    sumSqDiff += d * d;
  }
  return 1 - (6 * sumSqDiff) / (n * (n * n - 1));
}

let totalScenarios = 0;
let agreeScenarios = 0;

console.log('═══════════════════════════════════════════════════════');
console.log(' PRANA Priority Formula — Validation Report');
console.log('═══════════════════════════════════════════════════════\n');

for (const scenario of scenarios) {
  totalScenarios++;
  const scored = scenario.zones.map(z => ({ ...z, score: pr(z) }));
  const byExpected = [...scored].sort((a, b) => a.expectedRank - b.expectedRank);
  const byActual = [...scored].sort((a, b) => b.score - a.score);

  const actualOrder = byActual.map(z => z.id).join(' > ');
  const expectedOrder = byExpected.map(z => z.id).join(' > ');
  const agrees = actualOrder === expectedOrder;
  if (agrees) agreeScenarios++;

  console.log(`▸ ${scenario.name}`);
  if (scenario.note) console.log(`  note: ${scenario.note}`);
  scored.forEach(z => {
    console.log(
      `    ${z.id}: score=${z.score.toFixed(1)}  (hp=${z.hp} ts=${z.ts}h sr=${z.sr} hc=${z.hc})  expectedRank=${z.expectedRank}`
    );
  });
  console.log(`  expected order: ${expectedOrder}`);
  console.log(`  formula order:  ${actualOrder}`);
  console.log(`  ${agrees ? '✓ MATCH' : '✗ MISMATCH — review this one'}\n`);
}

const corr = spearman(
  scenarios.flatMap(s => [...s.zones].sort((a, b) => a.expectedRank - b.expectedRank)),
  scenarios.flatMap(s => [...s.zones].map(z => ({ ...z, score: pr(z) })).sort((a, b) => b.score - a.score))
);

console.log('───────────────────────────────────────────────────────');
console.log(`Scenarios matching expert expectation: ${agreeScenarios}/${totalScenarios}`);
console.log('───────────────────────────────────────────────────────');
console.log(
  '\nNext steps:\n' +
  ' - For every MISMATCH above, decide: is the formula wrong, or was\n' +
  '   the expectedRank a bad call? Don\'t silently accept either.\n' +
  ' - If headcount (hc) should matter and currently doesn\'t, that\'s a\n' +
  '   sign the formula is missing a term, not that you need ML.\n' +
  ' - Add more scenarios over time, especially ones pulled from real\n' +
  '   drills or incidents once you have them — that raises this from\n' +
  '   "made-up test cases" to "a real regression suite."'
);
