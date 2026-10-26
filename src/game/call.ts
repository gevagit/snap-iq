import type { PlayContent } from '../play/content';
import type { Play } from '../play';
import type { Rep } from './drill';

/** One player on the call sheet: his letter, number, position and job, each a glossary id. */
export interface CallRow {
  id: string;
  number: number;
  position: string;
  /** route (a route id), check (check-release or pick-up), block (stays in to block), qb */
  job: 'route' | 'check' | 'block' | 'qb';
  /** glossary id of the job: his route, check-release, the protection, or his drop */
  term: string;
  /** his place in the quarterback's progression (1 = first look); null if not in it */
  read: number | null;
  /** a quick route: his hot route against more rushers than blockers */
  quick: boolean;
}

export interface CallSheet {
  formation: string;
  concept: { name: string; term: string; key: string };
  protection: { name: string; term: string };
  rows: CallRow[];
}

const LINE_POS: Record<string, string> = { LT: 'offensive-tackle', LG: 'guard', C: 'center', RG: 'guard', RT: 'offensive-tackle' };
const ORDER = ['LT', 'LG', 'C', 'RG', 'RT', 'QB', 'X', 'H', 'Y', 'Z', 'F', 'R'];

/** The glossary position for a player, from where the formation puts him (content/offense/formations.yaml). */
export function positionOf(play: Play, id: string): string {
  if (LINE_POS[id]) return LINE_POS[id];
  if (id === 'QB') return 'quarterback';
  const p = play.offense.players.find((x) => x.id === id)!;
  if (p.align === 'fullback' || (p.backfield && id === 'F')) return 'fullback';
  if (p.backfield) return 'running-back';
  if (p.align === 'attached') return 'tight-end';
  if (p.align === 'wide') return p.onLine ? 'split-end' : 'flanker';
  return 'slot-receiver';
}

/**
 * The play call as the quarterback knows it in the huddle: everyone's job before the snap. It comes from the call
 * (formation, concept, protection) and never from what the defense does after the snap.
 */
export function callSheet(c: PlayContent, rep: Rep): CallSheet {
  const play = rep.play;
  const concept = c.concepts.concepts.find((x) => x.id === play.call.concept)!;
  const protection = c.protections.protections.find((x) => x.id === play.call.protection)!;
  const jobs = play.jobs;
  // read order from the call alone (not from the simulation, which knows whether the back released)
  const called = [...jobs.routes.map((r) => ({ id: r.id, route: r.route })), ...(jobs.checker && protection.back === 'check-release' ? [{ id: jobs.checker, route: 'check-release' }] : [])];
  const order: string[] = [];
  for (const route of concept.read.progression) {
    const r = called.find((x) => x.route === route && !order.includes(x.id));
    if (r) order.push(r.id);
  }
  const rows: CallRow[] = play.offense.players.map((p) => {
    const route = jobs.routes.find((r) => r.id === p.id);
    const base = { id: p.id, number: p.number, position: positionOf(play, p.id), read: order.includes(p.id) ? order.indexOf(p.id) + 1 : null, quick: route?.quick ?? false };
    if (p.id === 'QB') return { ...base, job: 'qb' as const, term: rep.routine.drop };
    if (route) return { ...base, job: 'route' as const, term: route.route };
    if (jobs.checker === p.id) return { ...base, job: 'check' as const, term: protection.back === 'check-release' ? 'check-release' : protection.terms[0]! };
    // linemen block in the called protection; a back who stays in (protections.yaml second_back) is pass protection
    return { ...base, job: 'block' as const, term: p.onLine ? protection.terms[0]! : 'pass-protection' };
  });
  rows.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  return {
    formation: play.offense.formation.name,
    concept: { name: concept.name, term: concept.terms[0]!, key: concept.read.key },
    protection: { name: protection.name, term: protection.terms[0]! },
    rows,
  };
}
