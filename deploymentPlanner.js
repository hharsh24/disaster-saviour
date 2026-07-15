/**
 * ══════════════════════════════════════════════════════════
 *  PRANA — Deployment Planner
 * ══════════════════════════════════════════════════════════
 *
 *  Answers two questions, with plain arithmetic — no ML, no training:
 *
 *  1. "Which area is more severe?" — severity() scores zones by
 *     EXPECTED LIVES STILL SAVABLE, not just a probability. A zone
 *     with 20 likely survivors outranks a zone with 2, all else equal
 *     — unlike the older pr() formula in decisionRules.js, which
 *     scores confidence/time/survival-rate but ignores headcount.
 *
 *  2. "Where can troops save the most people?" — planDeployment()
 *     greedily assigns the nearest available team to each zone in
 *     severity order (most severe first), using real GPS distance
 *     (haversine formula).
 *
 *  Why greedy and not a training pass: this is an assignment problem
 *  with a known objective (minimize response time to the most severe
 *  zones first). That's directly computable from data you already
 *  have (headcount, GPS, time elapsed) — there's nothing to learn that
 *  isn't already fully determined by the inputs.
 */

'use strict';

// ─── Severity: expected lives still recoverable, right now ───
function severity(zone) {
  const confidence = (zone.hp ?? 50) / 100;              // how sure we are people are there
  const survivalFactor = Math.exp(-0.048 * (zone.ts ?? 0)); // decays with time since incident
  const headcount = zone.hc ?? 0;
  return headcount * confidence * survivalFactor;
}

// ─── Haversine distance in km between two {lat,lng} points ───
function haversineKm(a, b) {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return null;
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Greedy severity-first, nearest-team assignment plan.
 * Does NOT mutate state or assign anything for real — it's a suggestion,
 * same philosophy as the rest of decisionRules.js. A human/API caller
 * decides whether to actually issue ASSIGN_TEAM for each entry.
 *
 * Returns an array of:
 *   { zoneId, severity, hc, suggestedTeamId, distanceKm, reason }
 * distanceKm / suggestedTeamId are null if no team has GPS coords or
 * none are available — the plan still ranks severity so it's useful
 * even before every team has a location set.
 */
function planDeployment(state) {
  const candidateZones = state.zones
    .filter(z => !z.assigned && z.hc > 0)
    .map(z => ({ ...z, sev: severity(z) }))
    .sort((a, b) => b.sev - a.sev);

  const availableTeams = state.teams.filter(t => t.status === 'available');
  const claimed = new Set();
  const plan = [];

  for (const zone of candidateZones) {
    const pool = availableTeams.filter(t => !claimed.has(t.id));
    let best = null;
    let bestDist = null;

    if (pool.length) {
      const withDist = pool
        .map(t => ({ team: t, dist: haversineKm(zone, t) }))
        .filter(x => x.dist !== null)
        .sort((a, b) => a.dist - b.dist);

      if (withDist.length) {
        best = withDist[0].team;
        bestDist = withDist[0].dist;
      } else {
        // No GPS data available for any candidate team — fall back to
        // "first available" rather than leaving the zone unplanned.
        best = pool[0];
      }
    }

    if (best) claimed.add(best.id);

    plan.push({
      zoneId: zone.id,
      severity: +zone.sev.toFixed(2),
      survivors: zone.hc,
      suggestedTeamId: best ? best.id : null,
      distanceKm: bestDist !== null ? +bestDist.toFixed(1) : null,
      reason: best
        ? (bestDist !== null
            ? `Highest remaining severity (${zone.hc} survivor(s), ${(zone.hp).toFixed(0)}% confidence) — ${best.id} is the nearest available team at ${bestDist.toFixed(1)}km.`
            : `Highest remaining severity — ${best.id} assigned (no GPS data available to rank by distance).`)
        : `Highest remaining severity — no available team left to assign.`,
    });
  }

  return plan;
}

module.exports = { severity, haversineKm, planDeployment };
