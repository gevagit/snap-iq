import raw from 'virtual:content';
import type { BallSpot } from '../field/geometry';
import { parsePlayContent } from '../play/content';
import { buildPlay, type PlayCall } from '../play';

/** Browser entry for the Play Lab: the same engine and content the validator runs, bundled into one page. */
const content = parsePlayContent(raw);
const glossary = (raw.glossary as { terms: { id: string; term: string }[] }).terms;
const termName = new Map(glossary.map((t) => [t.id, t.term]));
export const term = (id: string) => termName.get(id) ?? id;

const named = <T extends { id: string; name: string }>(list: T[]) => list.map((e) => ({ id: e.id, name: e.name }));
export const options = {
  formations: named(content.formations.formations),
  motions: named(content.motions.motions),
  concepts: named(content.concepts.concepts),
  protections: named(content.protections.protections),
  fronts: named(content.fronts.fronts),
  coverages: content.coverages.coverages.map((c) => ({ id: c.id, name: c.name, fronts: Object.keys(c.fronts) })),
  spots: [
    { id: 'left_hash', name: 'Left hash' },
    { id: 'middle', name: 'Middle' },
    { id: 'right_hash', name: 'Right hash' },
  ] as { id: BallSpot; name: string }[],
};

/** Hand-picked plays that show each idea in this batch. */
export const featured: { title: string; call: PlayCall }[] = [
  { title: 'Stick vs Cover 3 Sky', call: { formation: 'gun-trips-te', strength: 'right', motion: 'none', concept: 'stick-concept', protection: 'half-slide', front: 'four-two-five-over', coverage: 'cover-3-sky', spot: 'left_hash' } },
  { title: 'Jet motion vs Cover 1 Robber', call: { formation: 'gun-trips', strength: 'right', motion: 'jet-motion', concept: 'curl-flat', protection: 'five-man', front: 'four-two-five-over', coverage: 'cover-1-robber', spot: 'middle' } },
  { title: 'Jet motion vs Cover 3 Sky', call: { formation: 'gun-trips', strength: 'right', motion: 'jet-motion', concept: 'curl-flat', protection: 'five-man', front: 'four-two-five-over', coverage: 'cover-3-sky', spot: 'middle' } },
  { title: 'Slant-flat vs Cover 0', call: { formation: 'gun-empty', strength: 'left', motion: 'none', concept: 'slant-flat', protection: 'five-man', front: 'four-two-five-even', coverage: 'cover-0', spot: 'right_hash' } },
  { title: 'Smash vs Cover 2', call: { formation: 'gun-doubles', strength: 'right', motion: 'return-motion', concept: 'smash', protection: 'half-slide', front: 'four-two-five-even', coverage: 'cover-2', spot: 'middle' } },
  { title: 'Four verticals vs Cover 4', call: { formation: 'gun-doubles-te', strength: 'right', motion: 'none', concept: 'four-verticals', protection: 'big-on-big', front: 'four-three-over', coverage: 'cover-4', spot: 'left_hash' } },
  { title: 'Flood vs Fire zone', call: { formation: 'gun-trips', strength: 'right', motion: 'none', concept: 'flood', protection: 'half-slide', front: 'three-three-stack', coverage: 'fire-zone', spot: 'right_hash' } },
  { title: 'Mesh vs Cover 2 (zone reads)', call: { formation: 'gun-trips', strength: 'right', motion: 'none', concept: 'mesh', protection: 'five-man', front: 'four-two-five-even', coverage: 'cover-2', spot: 'middle' } },
  { title: 'Mesh vs Cover 1', call: { formation: 'gun-doubles', strength: 'left', motion: 'none', concept: 'mesh', protection: 'half-slide', front: 'three-three-stack', coverage: 'cover-1', spot: 'middle' } },
  { title: 'I-formation curl-flat vs Cover 3', call: { formation: 'i-formation', strength: 'right', motion: 'short-motion', concept: 'curl-flat', protection: 'five-man', front: 'four-three-over', coverage: 'cover-3', spot: 'left_hash' } },
  { title: 'Back motion to empty vs 2-Man', call: { formation: 'gun-doubles-te', strength: 'right', motion: 'back-motion', concept: 'stick-concept', protection: 'five-man', front: 'four-two-five-over', coverage: 'two-man', spot: 'middle' } },
];

const nameOf = (list: { id: string; name: string }[], id: string) => list.find((e) => e.id === id)?.name ?? id;

export function play(call: PlayCall) {
  const r = buildPlay(content, call);
  if (!r.ok) return { ok: false as const, reason: r.reason };
  const p = r.value;
  const sim = p.sim;
  const coverage = p.defense.coverage;
  const concept = content.concepts.concepts.find((c) => c.id === call.concept)!;
  const defLabel = new Map(p.defense.players.map((d) => [d.role, { label: d.label, number: d.number }]));
  const routeOf = new Map(sim.routes.map((rt) => [rt.id, rt.route]));
  return {
    ok: true as const,
    view: {
      call,
      names: {
        formation: nameOf(options.formations, call.formation),
        motion: nameOf(options.motions, call.motion),
        concept: concept.name,
        protection: nameOf(options.protections, call.protection),
        front: p.defense.front.name,
        coverage: coverage.name,
      },
      frame: p.offense.frame,
      dt: sim.dt,
      tStart: sim.tStart,
      snapIndex: sim.snapIndex,
      steps: sim.steps,
      players: sim.tracks.map((t) => ({ id: t.id, team: t.team, label: t.label, number: t.number, job: t.job, xs: t.xs, ys: t.ys })),
      routes: sim.routes.map((rt) => ({ ...rt, name: rt.route.endsWith('-motion') ? `${term(rt.route)} path` : term(rt.route) })),
      motionPath: sim.motionPath,
      mover: p.plan?.mover ?? null,
      landmarks: sim.landmarks.map((l) => ({ ...l, name: term(c(l.zone)) })),
      man: sim.man,
      zoneReads: sim.zoneReads,
      rushers: sim.rushers,
      greenDogs: sim.greenDogs,
      backJob: sim.backJob,
      analysis: p.analysis,
      checks: p.checks,
      tells: (coverage.tells ?? []).map((tl) => ({ ...tl, ...(defLabel.get(tl.role) ?? { label: tl.role, number: 0 }) })),
      read: {
        key: term(concept.read.key),
        defenders: p.analysis.readDefenders.map((role) => ({ role, ...defLabel.get(role)! })),
        progression: concept.read.progression
          .map((route) => ({ route: term(route), player: [...routeOf].find(([, rt]) => rt === route)?.[0] ?? null }))
          .filter((s) => s.player),
      },
      terms: {
        shellPre: term(p.analysis.shellPre),
        shellPost: term(p.analysis.shellPost),
        rotation: p.analysis.rotation ? term(p.analysis.rotation) : null,
        family: term(coverage.family === 'man' ? 'man-coverage' : 'zone-coverage'),
      },
    },
  };
  function c(zone: string) {
    return content.coverages.zones[zone]?.term ?? zone;
  }
}

/** When a call does not fit, the nearest calls that do: change one choice at a time. */
export function nearest(call: PlayCall, limit = 3): { call: PlayCall; change: string }[] {
  const out: { call: PlayCall; change: string }[] = [];
  const tries: [keyof PlayCall, { id: string; name: string }[]][] = [
    ['motion', options.motions], ['protection', options.protections], ['concept', options.concepts],
    ['coverage', options.coverages.filter((cv) => cv.fronts.includes(call.front))], ['front', options.fronts.filter((f) => options.coverages.find((cv) => cv.id === call.coverage)?.fronts.includes(f.id))],
    ['formation', options.formations],
  ];
  for (const [key, list] of tries)
    for (const opt of list) {
      if (out.length >= limit) return out;
      if (opt.id === call[key]) continue;
      const next = { ...call, [key]: opt.id } as PlayCall;
      if (buildPlay(content, next).ok) { out.push({ call: next, change: opt.name }); break; }
    }
  return out;
}
