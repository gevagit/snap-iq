import type { PlayContent } from '../play/content';
import type { Answers, CornerLook, Grade, Rep } from './drill';

export interface Term { id: string; term: string; definition: string }

/** Plain names for the corner looks, built from glossary words (press, off coverage, leverage). */
export const CORNER_LABEL: Record<CornerLook, string> = { press: 'Press', 'off-inside': 'Off, inside', 'off-outside': 'Off, outside', 'off-head-up': 'Off, head-up' };

/**
 * The Breakdown (PRD §9): each step of his routine and his decision, explained only with glossary terms, their
 * definitions, the NFHS rules content and this rep's numbers. Nothing here adds football meaning of its own.
 */
export function explain(c: PlayContent, terms: Map<string, Term>, original: Rep, played: Rep, a: Answers, g: Grade): { title: string; ok: boolean | null; lines: string[] }[] {
  const t = (id: string) => terms.get(id);
  const name = (id: string) => t(id)?.term ?? id;
  const inline = (id: string) => { const n = name(id); return /^Cover \d/.test(n) ? n : n.charAt(0).toLowerCase() + n.slice(1); };
  const def = (id: string) => t(id)?.definition ?? '';
  const k = original.routine;
  const d = (role: string | null) => { const p = original.play.defense.players.find((x) => x.role === role); return p ? `${p.label} #${p.number}` : ''; };
  const said = (ok: boolean, what: string | null) => (ok ? '' : ` (you said ${what ?? 'nothing'})`);
  const out: { title: string; ok: boolean | null; lines: string[] }[] = [];

  // Know
  const fault = original.fault;
  out.push({
    title: `Know: ${fault ? `${fault.id} lined up wrong` : 'everyone lined up right'}${said(g.steps.alignment!, a.alignment === 'ok' ? 'all good' : a.alignment)}`,
    ok: g.steps.alignment!,
    lines: fault ? [fault.kind === 'off-the-line' ? `${fault.id} was off the line, leaving 6 on it. ${def('legal-formation')}` : `${fault.id} stepped up onto the line inside the split end. ${def('covered-receiver')}`] : [def('legal-formation')],
  });
  // See
  out.push({ title: `See: ${name(k.shell)}${said(g.steps.shell!, a.shell && name(a.shell))}`, ok: g.steps.shell!, lines: [def(k.shell)] });
  out.push({ title: `See: ${k.box} in the box${said(g.steps.box!, a.box === null ? null : String(a.box))}`, ok: g.steps.box!, lines: [def('box')] });
  out.push({
    title: `See: corners ${k.corners.map((cn) => `${cn.side} ${CORNER_LABEL[cn.look].toLowerCase()}`).join(', ')}`,
    ok: g.steps.corners!,
    lines: [
      ...k.corners.map((cn, i) => `${cn.side === 'left' ? 'Left' : 'Right'} corner (${d(cn.role)}): ${CORNER_LABEL[cn.look]}${a.corners[i] && a.corners[i] !== cn.look ? `; you said ${CORNER_LABEL[a.corners[i]!].toLowerCase()}` : ''}.`),
      def('leverage'),
    ],
  });
  out.push({ title: `See: ${k.tells === 'none' ? 'no tells' : name(k.tells)}${said(g.steps.tells!, a.tells === 'none' ? 'none' : a.tells && name(a.tells))}`, ok: g.steps.tells!, lines: k.tells === 'none' ? [] : [def(k.tells)] });
  // Threats
  const pa = original.play.analysis;
  out.push({
    title: `Threats: ${pa.rushers} rushers against ${pa.blockers} blockers${k.threats.more ? `, hot: ${k.threats.hot.join(' or ')}` : ''}`,
    ok: g.steps.threats!,
    lines: k.threats.more ? [def('hot-route')] : ['Everyone who rushes has a blocker.'],
  });
  // Plan
  const changes = Object.entries(a.changes);
  out.push({
    title: changes.length ? `Plan: you changed ${changes.map(([id, r]) => `${id} to the ${inline(r)}`).join(' and ')}` : 'Plan: you kept every route',
    ok: g.steps.adjust!,
    lines: changes.length ? [g.adjustGain > 0.5 ? `Your change gave your best receiver ${g.adjustGain.toFixed(1)} yd more room.` : `It did not open anyone up (${g.adjustGain >= 0 ? '+' : ''}${g.adjustGain.toFixed(1)} yd for your best receiver).`, def('route-adjustment')] : [],
  });
  const concept = c.concepts.concepts.find((x) => x.id === original.call.concept)!;
  out.push({
    title: `Plan: your key, ${k.key ? `${name(concept.read.key).toLowerCase()} ${d(k.key)}` : 'no defender has that job'}; first look ${k.firstLook}`,
    ok: g.steps.key!,
    lines: [def(concept.read.key)],
  });
  out.push({ title: `Plan: ${name(k.drop)}${said(g.steps.drop!, a.drop && name(a.drop))}`, ok: g.steps.drop!, lines: [def(k.drop)] });
  out.push({ title: `Plan: escape ${k.escape}${said(g.steps.escape!, a.escape)}`, ok: g.steps.escape!, lines: [def('escape-lane')] });
  // After the snap
  const cov = played.play.defense.coverage;
  const rot = cov.rotation ? t(cov.rotation) : undefined;
  out.push({ title: `After the snap: ${cov.name}${said(g.steps.coverage!, a.coverage && name(a.coverage))}`, ok: g.steps.coverage!, lines: [def(cov.answer), ...(rot ? [`${rot.term}: ${rot.definition}`] : [])] });
  // Decision
  const best = played.post.options.find((o) => o.id === played.post.decision);
  const mine = played.post.options.find((o) => o.id === a.decision);
  const room = (o: { separation: number }) => `${o.separation.toFixed(1)} yd of room when the ball got there`;
  const grounding = c.geometry && terms.get('throwaway')?.definition;
  const lines: string[] = [];
  if (best) lines.push(`${best.id} on the ${inline(best.route)}: ${room(best)}, the first open receiver in your ${concept.name} progression.`);
  else if (played.post.decision === 'run') lines.push(`No one was open, and no free defender was within ${c.drills.routine.decide.run_room} yd in front of you. ${def('quarterback-run')}`);
  else lines.push(`No one was open and there was no room to run: escape and throw it away. ${grounding ?? ''}`);
  if (mine && mine.id !== played.post.decision) lines.push(`You threw to ${mine.id} on the ${inline(mine.route)}: ${room(mine)}${mine.open ? ', open too, but not first in your progression' : ''}.`);
  if (a.decision === 'throw-away' && played.post.decision !== 'throw-away') lines.push(grounding ?? '');
  const label = (x: string) => (x === 'run' ? 'keep it and run' : x === 'throw-away' ? 'throw it away' : `throw to ${x}`);
  out.push({ title: `Decision: ${label(played.post.decision)}${g.decision === 'read' ? '' : ` (you chose ${a.decision ? label(a.decision) : 'nothing'})`}`, ok: g.decision === 'read', lines: lines.filter(Boolean) });
  return out;
}
