/**
 * ══════════════════════════════════════════════════════════
 *  PRANA — Decision Rule Checker
 * ══════════════════════════════════════════════════════════
 *
 *  Deterministic, explainable "is this decision correct" checks.
 *  No ML — just codified safety rules a rescue coordinator would
 *  apply. Add new rules as you think of edge cases; each rule is
 *  independent so one bad rule doesn't break the others.
 *
 *  Every rule function takes the full `state` (from loadState())
 *  and returns an array of violation objects:
 *    { rule, severity, zoneId?, message }
 *  severity is 'BLOCK' (should prevent the action) or 'WARN'
 *  (surface it, but let a human decide).
 */

'use strict';

function pr(z) {
  // Mirrors PRANA_v4.html's pr() and validate-priority.js — keep in sync.
  return ((z.hp / 100) * 0.4 + Math.exp(-0.048 * z.ts) * 0.35 + (z.sr / 100) * 0.25) * 100;
}

// ─── Individual rules ───

// Never leave a zone with survivors and a critically low survival rate unassigned
// when a team IS available to send.
function ruleCriticalZoneMustBeCovered(state) {
  const violations = [];
  const availableTeams = state.teams.filter(t => t.status === 'available');
  for (const z of state.zones) {
    if (z.hc > 0 && z.sr < 30 && !z.assigned && availableTeams.length > 0) {
      violations.push({
        rule: 'CRITICAL_ZONE_MUST_BE_COVERED',
        severity: 'WARN',
        zoneId: z.id,
        message: `${z.id} has ${z.hc} survivor(s), SR ${z.sr.toFixed(0)}%, no team assigned, ` +
                 `and ${availableTeams.length} team(s) are sitting available. Recommend assigning now.`,
      });
    }
  }
  return violations;
}

// Block recalling the ONLY team from a zone that is still critical, unless
// there's another available team ready to take over immediately.
function ruleNoBlindRecallFromCritical(state, action) {
  const violations = [];
  if (action?.type !== 'RECALL_TEAM') return violations;
  const team = state.teams.find(t => t.id === action.teamId);
  if (!team || !team.assignedZone) return violations;
  const zone = state.zones.find(z => z.id === team.assignedZone);
  if (!zone) return violations;

  const isStillCritical = zone.hc > 0 && zone.sr < 40;
  const otherAvailable = state.teams.filter(t => t.status === 'available' && t.id !== team.id);

  if (isStillCritical && otherAvailable.length === 0) {
    violations.push({
      rule: 'NO_BLIND_RECALL_FROM_CRITICAL',
      severity: 'BLOCK',
      zoneId: zone.id,
      message: `Refusing to recall ${team.id} from ${zone.id}: zone still has ${zone.hc} ` +
                `survivor(s) at SR ${zone.sr.toFixed(0)}%, and no other team is available to ` +
                `take over. Pass { force: true } to override and accept the risk.`,
    });
  }
  return violations;
}

// Don't dispatch/keep a drone in the air if battery is too low to safely
// complete a round trip (existing DISPATCH_DRONE check is <15; this flags
// the softer warning zone <25 so an operator gets advance notice).
function ruleDroneBatteryMargin(state) {
  const violations = [];
  for (const d of state.drones) {
    if (d.status === 'mission' && d.battery < 25) {
      violations.push({
        rule: 'DRONE_BATTERY_MARGIN',
        severity: 'WARN',
        message: `${d.id} is on mission at ${d.battery}% battery — consider recalling soon ` +
                  `before it hits the auto-RTB threshold mid-task.`,
      });
    }
  }
  return violations;
}

// Flag when the AI recommendation's #1 pick conflicts with an unacknowledged
// CRITICAL alert elsewhere — i.e. the human might be looking at the wrong zone.
function ruleRecommendationMatchesAlerts(state, recommendations) {
  const violations = [];
  if (!recommendations.length) return violations;
  const topPick = recommendations[0].id;
  const unackedCritical = state.errorLog.filter(e => e.severity === 'CRITICAL' && !e.acknowledged);
  for (const alert of unackedCritical) {
    if (alert.source !== topPick) {
      violations.push({
        rule: 'RECOMMENDATION_MATCHES_ALERTS',
        severity: 'WARN',
        zoneId: alert.source,
        message: `Unacknowledged CRITICAL alert at ${alert.source} ("${alert.message}") is not ` +
                  `the top-ranked recommendation (${topPick}). Double-check before acting on the ` +
                  `ranked list alone.`,
      });
    }
  }
  return violations;
}

// ─── Public API ───

/**
 * Compute top-N zone recommendations using the priority formula.
 */
function getRecommendations(state, limit = 3) {
  return state.zones
    .filter(z => !z.assigned && z.hc > 0)
    .map(z => ({ ...z, score: pr(z) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Run all state-level rules (no specific action being taken — e.g. for a
 * periodic health check or the /api/recommendation endpoint).
 */
function checkStateRules(state) {
  const recommendations = getRecommendations(state);
  return [
    ...ruleCriticalZoneMustBeCovered(state),
    ...ruleDroneBatteryMargin(state),
    ...ruleRecommendationMatchesAlerts(state, recommendations),
  ];
}

/**
 * Run rules relevant to a specific proposed action, e.g. before actually
 * executing RECALL_TEAM. Returns violations; if any has severity BLOCK,
 * the caller should refuse the action unless action.force === true.
 */
function checkActionRules(state, action) {
  return [
    ...ruleNoBlindRecallFromCritical(state, action),
  ];
}

module.exports = { pr, getRecommendations, checkStateRules, checkActionRules };
