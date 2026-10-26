import type { PlayContent } from '../play/content';
import type { AnswerKey, Answers, Grade, Rep } from './drill';

export interface Term { id: string; term: string; definition: string }

/**
 * The Breakdown's explanation chain (PRD §6.11, §9), built only from glossary terms and their definitions plus the
 * numbers of this rep. Nothing here adds football meaning of its own.
 */
export function explain(c: PlayContent, terms: Map<string, Term>, rep: Rep, a: Answers, g: Grade): { title: string; lines: string[] }[] {
  const k: AnswerKey = rep.key;
  const t = (id: string) => terms.get(id);
  const play = rep.play;
  const coverage = play.defense.coverage;
  const concept = c.concepts.concepts.find((x) => x.id === rep.call.concept)!;
  const def = (role: string | null) => { const d = play.defense.players.find((p) => p.role === role); return d ? `${d.label} #${d.number}` : ''; };
  const name = (id: string) => (t(id)?.term ?? id);
  /** a term in the middle of a sentence: lower case, unless it is a name like Cover 3 */
  const inline = (id: string) => { const n = name(id); return /^Cover \d/.test(n) ? n : n.charAt(0).toLowerCase() + n.slice(1); };
  const option = (id: string | null) => k.options.find((o) => o.id === id);
  const out: { title: string; lines: string[] }[] = [];

  const shell = t(k.shell);
  out.push({ title: `Before the snap: ${name(k.shell)}${g.shell ? '' : ` (you said ${a.shell ? name(a.shell) : 'nothing'})`}`, lines: shell ? [shell.definition] : [] });

  const cov = t(k.coverage);
  const rot = coverage.rotation ? t(coverage.rotation) : undefined;
  out.push({
    title: `After the snap: ${coverage.name}${g.coverage ? '' : ` (you said ${a.coverage ? name(a.coverage) : 'nothing'})`}`,
    lines: [...(cov ? [cov.definition] : []), ...(rot ? [`${rot.term}: ${rot.definition}`] : [])],
  });

  const key = t(concept.read.key);
  const best = option(k.throwTo)!;
  const reading = k.readDefender ? `${name(concept.read.key)}: ${def(k.readDefender)}.` : `${name(concept.read.key)}: no defender has that job in this coverage.`;
  const room = (o: { separation: number }) => `${o.separation.toFixed(1)} yd of room when the ball got there`;
  const why = best.open ? `the first open receiver in your ${concept.name} progression` : 'no one was open, and he had the most room';
  const lines = [reading, ...(key ? [key.definition] : []), `The ball goes to ${best.id} on the ${inline(best.route)}: ${room(best)}, ${why}.`];
  const mine = option(a.throwTo);
  if (mine && mine.id !== best.id) lines.push(`You threw to ${mine.id} on the ${inline(mine.route)}: ${room(mine)}${mine.open ? ', open too, but not first in your progression' : ''}.`);
  out.push({ title: `Your read: ${concept.name}`, lines });
  return out;
}
