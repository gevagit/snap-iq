import type { PlayContent } from './content';
import { lineOf, techX } from './defense';
import { isEligibleNumber, LINEMEN } from './offense';
import type { Play } from './index';

/** Football invariants on a generated play (PRD §6.11). */
export interface Check { id: string; ok: boolean; detail: string }

const EPS = 0.05;

export function runChecks(c: PlayContent, play: Play): Check[] {
  const { sim, offense: off, defense: def, plan } = play;
  const checks: Check[] = [];
  const add = (id: string, ok: boolean, detail: string) => checks.push({ id, ok, detail });
  const k0 = sim.snapIndex;
  const dt = sim.dt;
  const trackOf = new Map(sim.tracks.map((t) => [t.id, t]));
  const tr = (id: string) => trackOf.get(id)!;
  const at = (id: string, k: number) => ({ x: tr(id).xs[k]!, y: tr(id).ys[k]! });
  const speed = (id: string, k: number) => Math.hypot(tr(id).xs[k]! - tr(id).xs[k - 1]!, tr(id).ys[k]! - tr(id).ys[k - 1]!) / dt;
  const oIds = off.players.map((p) => p.id);
  const dIds = def.players.map((p) => p.role);
  const a = c.formations.alignment;
  const fa = c.fronts.alignment;

  add('eleven-on-eleven', oIds.length === 11 && dIds.length === 11, `${oIds.length} offense, ${dIds.length} defense`);

  // ---------------- legal formation at the snap (content/rules/nfhs.yaml legal-formation)
  const onLine = oIds.filter((id) => Math.abs(at(id, k0).y + a.line.depth) < 0.05);
  const underCenter = (id: string) => id === 'QB' && off.formation.qb === 'under' && Math.abs(at(id, k0).y + a.qb.under) < 0.05;
  const backs = oIds.filter((id) => !onLine.includes(id) && (at(id, k0).y <= -a.back_min_depth + 0.01 || underCenter(id)));
  const nowhere = oIds.filter((id) => !onLine.includes(id) && !backs.includes(id));
  const number = (id: string) => off.players.find((p) => p.id === id)!.number;
  const lineNumbered = onLine.filter((id) => number(id) >= 50 && number(id) <= 79).length;
  add('legal-formation', onLine.length >= 7 && lineNumbered >= 5 && backs.length <= 4 && nowhere.length === 0,
    `${onLine.length} on the line (${lineNumbered} numbered 50-79), ${backs.length} backs${nowhere.length ? `, not set on the line or as a back: ${nowhere.join(', ')}` : ''}`);

  // ---------------- eligible receivers (eligibility-by-number)
  const lineXs = onLine.map((id) => at(id, k0).x);
  const ends = new Set(onLine.filter((id) => at(id, k0).x === Math.min(...lineXs) || at(id, k0).x === Math.max(...lineXs)));
  const badRoutes = sim.routes.filter((r) => !isEligibleNumber(number(r.id)) || !(backs.includes(r.id) || ends.has(r.id))).map((r) => r.id);
  add('eligible-receivers', badRoutes.length === 0, badRoutes.length ? `ineligible route runners: ${badRoutes.join(', ')}` : `${sim.routes.length} route runners, all eligible`);

  // ---------------- motion and shift (motion-and-shift)
  const moving = oIds.filter((id) => speed(id, k0) > 0.2);
  let motionOk = moving.length <= 1;
  let motionDetail = moving.length ? `${moving.join(', ')} in motion at the snap` : 'no one in motion at the snap';
  if (moving.length === 1) {
    const id = moving[0]!;
    const vy = (tr(id).ys[k0]! - tr(id).ys[k0 - 1]!) / dt;
    if (vy > EPS) { motionOk = false; motionDetail += ', moving toward the defense'; }
    if (!backs.includes(id)) { motionOk = false; motionDetail += ', not a back'; }
  }
  if (plan) {
    const start = Math.max(0, Math.floor((plan.start - sim.tStart) / dt));
    for (let k = start; k <= k0; k++) if (at(plan.mover, k).y > -a.back_min_depth + 0.01) { motionOk = false; motionDetail += ', mover reached the line during motion'; break; }
  }
  add('motion', motionOk, motionDetail);
  const setFrom = k0 - Math.round(1 / dt);
  const unset = oIds.filter((id) => !moving.includes(id)).filter((id) => { for (let k = setFrom + 1; k <= k0; k++) if (speed(id, k) > EPS) return true; return false; });
  add('set-one-second', unset.length === 0, unset.length ? `moved in the last second: ${unset.join(', ')}` : 'everyone else set for 1 second before the snap');

  // ---------------- neutral zone, bounds, spacing
  const r = fa.body_radius;
  const inNz = [...oIds.filter((id) => at(id, k0).y > -r), ...dIds.filter((id) => at(id, k0).y < fa.neutral_zone + r)];
  add('neutral-zone', inNz.length === 0, inNz.length ? `in the neutral zone: ${inNz.join(', ')}` : 'neutral zone clear');
  const out: string[] = [];
  for (const t of sim.tracks) for (let k = 0; k <= sim.steps; k++) if (t.xs[k]! <= off.frame.leftSideline + r || t.xs[k]! >= off.frame.rightSideline - r) { out.push(`${t.id} at ${(sim.tStart + k * dt).toFixed(2)} s`); break; }
  add('in-bounds', out.length === 0, out.length ? `out of bounds: ${out.join(', ')}` : 'everyone inside the sidelines');
  const all = [...oIds, ...dIds];
  let minGap = Infinity;
  let pair = '';
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      // under center the quarterback takes the snap hand to hand
      if (off.formation.qb === 'under' && [all[i], all[j]].includes('QB') && [all[i], all[j]].includes('C')) continue;
      const p = at(all[i]!, k0);
      const q = at(all[j]!, k0);
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < minGap) { minGap = d; pair = `${all[i]} and ${all[j]}`; }
    }
  add('spacing', minGap >= 4 * r - 1e-9, `closest at the snap: ${pair}, ${minGap.toFixed(2)} yd`);

  // ---------------- techniques match offsets
  const snapView = off.players.map((p) => ({ id: p.id, align: p.align, side: p.side, backfield: p.backfield, pos: at(p.id, k0) }));
  const line = lineOf(c, snapView);
  const wrongTech = def.players.filter((p) => p.tech && Math.abs(at(p.role, k0).x - techX(c, line, p.tech, p.sign)) > 0.1).map((p) => p.role);
  add('techniques', wrongTech.length === 0, wrongTech.length ? `technique label off: ${wrongTech.join(', ')}` : 'every lineman sits on his technique');

  // ---------------- shell before the snap, rotation tag
  const high = dIds.filter((id) => at(id, k0).y >= c.coverages.shells.high_depth);
  const mid = (off.frame.leftSideline + off.frame.rightSideline) / 2;
  const shell = def.coverage.shell.pre;
  let shellOk: boolean;
  if (shell === 'zero-high') shellOk = high.length === 0;
  else if (shell === 'one-high') shellOk = high.length === 1 && at(high[0]!, k0).x >= off.frame.leftHash && at(high[0]!, k0).x <= off.frame.rightHash;
  else shellOk = high.length === 2 && (at(high[0]!, k0).x - mid) * (at(high[1]!, k0).x - mid) < 0;
  add('shell', shellOk, `${shell}: ${high.length} deep at the snap${high.length ? ` (${high.join(', ')})` : ''}`);
  const rotates = def.coverage.shell.pre !== def.coverage.shell.post;
  add('rotation-tag', rotates === Boolean(def.coverage.rotation), rotates ? `${def.coverage.shell.pre} to ${def.coverage.shell.post}: ${def.coverage.rotation ?? 'no rotation tag'}` : 'no rotation');

  // ---------------- coverage complete
  const zones = def.players.map((p) => p.job).filter((j) => j.kind === 'zone' || j.kind === 'drop' || j.kind === 'hole');
  const deep = zones.filter((j) => j.kind !== 'hole' && c.coverages.zones[j.zone]?.deep).length;
  const under = zones.length - deep;
  const rush = def.players.filter((p) => p.job.kind === 'rush').length;
  const counts = def.coverage.counts ?? {};
  const countIssues = [
    counts.deep !== undefined && counts.deep !== deep ? `${deep} deep, needs ${counts.deep}` : '',
    counts.under !== undefined && counts.under !== under ? `${under} under, needs ${counts.under}` : '',
    counts.rush !== undefined && counts.rush !== rush ? `${rush} rushing, needs ${counts.rush}` : '',
  ].filter(Boolean);
  const zoneKeys = zones.map((j) => (j.kind === 'hole' ? 'hole' : `${j.zone}/${j.side}/${j.part}`));
  const dup = zoneKeys.filter((z, i) => zoneKeys.indexOf(z) !== i);
  let uncovered: string[] = [];
  if (def.coverage.family === 'man') {
    const covered = new Set(sim.man.map((m) => m.target));
    uncovered = sim.routes.map((r) => r.id).filter((id) => !covered.has(id));
  }
  add('coverage-complete', countIssues.length === 0 && dup.length === 0 && uncovered.length === 0,
    [...countIssues, dup.length ? `zone twice: ${dup.join(', ')}` : '', uncovered.length ? `no man defender: ${uncovered.join(', ')}` : ''].filter(Boolean).join('; ') ||
      `${deep} deep, ${under} under, ${rush} rushing${def.coverage.family === 'man' ? `, ${sim.man.length} in man` : ''}`);

  // ---------------- rushers vs blockers needs a hot answer
  const hot = sim.routes.filter((r2) => r2.quick).map((r2) => r2.id);
  add('hot-answer', sim.rushers.length <= sim.blockers.length || hot.length > 0, `${sim.rushers.length} rushers, ${sim.blockers.length} blockers${hot.length ? `, hot: ${hot.join(', ')}` : ''}`);

  // ---------------- reachability: no one faster than his profile (PRD §6.11)
  const fast: string[] = [];
  for (const t of sim.tracks)
    for (let k = 1; k <= sim.steps; k++) {
      const cap = (k <= k0 ? t.capPre : t.capPost) + EPS;
      const v = Math.hypot(t.xs[k]! - t.xs[k - 1]!, t.ys[k]! - t.ys[k - 1]!) / dt;
      if (v > cap) { fast.push(`${t.id} ${v.toFixed(1)} yd/s at ${(sim.tStart + k * dt).toFixed(2)} s`); break; }
    }
  add('reachability', fast.length === 0, fast.length ? `faster than his profile: ${fast.join(', ')}` : 'every player within his speed profile');
  // his drop must be able to reach the landmark in time, whatever he reads on the way
  const late = sim.landmarks.filter((l) => l.short > 1.0);
  add('landmarks', late.length === 0, late.length ? `not at his landmark in time: ${late.map((l) => `${l.role} (${l.zone} by ${l.by} s)`).join(', ')}` : `${sim.landmarks.length} zone defenders at their landmarks in time`);

  // ---------------- zone defenders play the receivers in their zone
  // While a defender plays the same receiver for a second or more, he must at some point be on his spot
  // (within 3 yd) or running at it (over 0.2 s, at least 40% of his top speed toward it). Only a defender who
  // never does either has ignored him; a fast crosser may still pull away from someone chasing him.
  const ignored: string[] = [];
  const hold = Math.round(1.0 / dt);
  const back = Math.round(0.2 / dt);
  for (const z of sim.zoneReads) {
    const top = tr(z.role).capPost;
    const plays = (i: number) => {
      const p0 = at(z.role, k0 + i - back);
      const p1 = at(z.role, k0 + i);
      const ux = z.tx[i]! - p1.x;
      const uy = z.ty[i]! - p1.y;
      const gap = Math.hypot(ux, uy);
      return gap <= 3 || ((p1.x - p0.x) * ux + (p1.y - p0.y) * uy) / gap / (back * dt) >= 0.4 * top;
    };
    let start = 0;
    let ok = false;
    for (let i = 1; i <= z.threat.length; i++) {
      const ends = i === z.threat.length || z.threat[i] === null || z.threat[i] !== z.threat[i - 1];
      if (!ends) { if (i >= back && plays(i)) ok = true; continue; }
      if (z.threat[i - 1] !== null && i - start > hold && !ok) ignored.push(`${z.role} on ${z.threat[i - 1]} from ${(start * dt).toFixed(1)} s`);
      start = i;
      ok = i < z.threat.length && i >= back && plays(i);
    }
    // ... and a receiver standing in his zone for a second after he should be reading is never left unplayed
    const rule = c.coverages.zone_reaction.zones[z.zone];
    const lm = sim.landmarks.find((l) => l.role === z.role);
    if (!rule || !lm) continue;
    let run = 0;
    for (let i = Math.round(c.coverages.zone_reaction.read_by / dt); i < z.threat.length; i++) {
      const inside = sim.routes.some((rt) => {
        const q = at(rt.id, k0 + i);
        return Math.abs(q.x - lm.at.x) <= rule.half_width && q.y >= rule.from_depth && q.y <= rule.to_depth;
      });
      run = inside && z.threat[i] === null ? run + 1 : 0;
      if (run === hold) { ignored.push(`${z.role} left a receiver in his zone unplayed at ${(i * dt).toFixed(1)} s`); break; }
    }
  }
  add('zone-reaction', ignored.length === 0, ignored.length ? `not playing the receiver in his zone: ${ignored.join(', ')}` : `${sim.zoneReads.length} zone defenders read and play the receivers in their zones`);

  // ---------------- linemen stay behind the expanded neutral zone
  const downfield = LINEMEN.filter((id) => { for (let k = k0; k <= sim.steps; k++) if (at(id, k).y > fa.neutral_zone + 2) return true; return false; });
  add('ineligible-downfield', downfield.length === 0, downfield.length ? `linemen past 2 yd: ${downfield.join(', ')}` : 'linemen behind the expanded neutral zone');
  return checks;
}
