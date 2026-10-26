import type { ZodType } from 'zod';
import type { ContentKey } from '../content/load';
import * as S from '../content/playSchemas';
import { Glossary } from '../content/schemas';

export interface Batch2Counts { formations: number; motions: number; routes: number; concepts: number; protections: number; fronts: number; coverages: number; needsReview: number }

const FILES: Partial<Record<ContentKey, string>> = {
  personnel: 'offense/personnel.yaml', formations: 'offense/formations.yaml', motions: 'offense/motions.yaml', routes: 'offense/routes.yaml',
  concepts: 'offense/concepts.yaml', protections: 'offense/protections.yaml', fronts: 'defense/fronts.yaml', coverages: 'defense/coverages.yaml', speeds: 'tuning/speeds.yaml',
};

function parse<T>(schema: ZodType<T>, data: unknown, key: ContentKey, errors: string[]): T | null {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  for (const issue of r.error.issues) errors.push(`${FILES[key]}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  return null;
}

const routeId = (r: S.RouteRef) => (typeof r === 'string' ? r : r.route);

/** Cross-references and static football rules for the offense, defense and tuning content (batch 2). */
export function validateBatch2(raw: Record<ContentKey, unknown>, errors: string[]): Batch2Counts {
  const glossary = Glossary.safeParse(raw.glossary);
  const terms = new Set(glossary.success ? glossary.data.terms.map((t) => t.id) : []);
  const personnel = parse(S.Personnel, raw.personnel, 'personnel', errors);
  const formations = parse(S.Formations, raw.formations, 'formations', errors);
  const motions = parse(S.Motions, raw.motions, 'motions', errors);
  const routes = parse(S.Routes, raw.routes, 'routes', errors);
  const concepts = parse(S.Concepts, raw.concepts, 'concepts', errors);
  const protections = parse(S.Protections, raw.protections, 'protections', errors);
  const fronts = parse(S.Fronts, raw.fronts, 'fronts', errors);
  const coverages = parse(S.Coverages, raw.coverages, 'coverages', errors);
  const speeds = parse(S.Speeds, raw.speeds, 'speeds', errors);

  const term = (file: string, owner: string, id: string) => {
    if (glossary.success && !terms.has(id)) errors.push(`${file}: ${owner} uses term ${id}, which is not in the glossary`);
  };
  const unique = (file: string, ids: string[]) => ids.forEach((id, i) => ids.indexOf(id) !== i && errors.push(`${file}: duplicate id ${id}`));

  if (formations && personnel) {
    unique('offense/formations.yaml', formations.formations.map((f) => f.id));
    const groups = new Map(personnel.groups.map((g) => [g.id, g]));
    for (const f of formations.formations) {
      for (const t of f.terms) term('offense/formations.yaml', f.id, t);
      const g = groups.get(f.personnel);
      const letters = Object.keys(f.players);
      if (!g) errors.push(`offense/formations.yaml: ${f.id} uses unknown personnel ${f.personnel}`);
      else {
        const backs = letters.filter((l) => l === 'R' || l === 'F').length;
        const tes = Object.values(f.players).filter((p) => p.align === 'attached').length;
        if (letters.length !== 5) errors.push(`offense/formations.yaml: ${f.id} has ${letters.length} skill players, needs 5`);
        if (backs !== g.backs) errors.push(`offense/formations.yaml: ${f.id} has ${backs} backs, ${f.personnel} personnel has ${g.backs}`);
        if (tes !== g.tight_ends) errors.push(`offense/formations.yaml: ${f.id} has ${tes} attached tight ends, ${f.personnel} personnel has ${g.tight_ends}`);
      }
      for (const l of [...letters, 'QB', 'LT', 'LG', 'C', 'RG', 'RT'])
        if (personnel.jersey_numbers[l] === undefined) errors.push(`offense/personnel.yaml: no jersey number for ${l}`);
      const onLine = 5 + Object.values(f.players).filter((p) => p.on_line).length;
      if (onLine < 7) errors.push(`offense/formations.yaml: ${f.id} has ${onLine} on the line; NFHS needs at least 7`);
      for (const [l, p] of Object.entries(f.players)) {
        const back = ['gun-offset', 'pistol-back', 'i-back', 'fullback'].includes(p.align);
        if (back && p.on_line) errors.push(`offense/formations.yaml: ${f.id} puts back ${l} on the line`);
        if (['attached', 'bunch-point'].includes(p.align) && !p.on_line) errors.push(`offense/formations.yaml: ${f.id} ${l} (${p.align}) must be on the line`);
      }
    }
  }
  if (motions) {
    unique('offense/motions.yaml', motions.motions.map((m) => m.id));
    for (const m of motions.motions) {
      for (const t of m.terms) term('offense/motions.yaml', m.id, t);
      if (m.id !== 'none' && (!m.mover || !m.path || !m.speed)) errors.push(`offense/motions.yaml: ${m.id} needs mover, path and speed`);
      const crosses = m.path && (m.path.kind === 'jet' || m.path.kind === 'orbit');
      if (crosses && !m.after) errors.push(`offense/motions.yaml: ${m.id} crosses the formation and needs an after path`);
    }
  }
  const routeIds = new Set(routes?.routes.map((r) => r.id) ?? []);
  if (routes) {
    unique('offense/routes.yaml', routes.routes.map((r) => r.id));
    for (const r of routes.routes) term('offense/routes.yaml', r.id, r.id);
  }
  if (concepts && routes) {
    unique('offense/concepts.yaml', concepts.concepts.map((c) => c.id));
    for (const c of concepts.concepts) {
      for (const t of c.terms) term('offense/concepts.yaml', c.id, t);
      term('offense/concepts.yaml', c.id, c.read.key);
      const used = [...Object.values(c.by_count).flatMap((b) => Object.values(b ?? {})), ...Object.values(c.weak)].filter(Boolean).map((r) => routeId(r!));
      for (const r of [...used, c.back]) if (!routeIds.has(r)) errors.push(`offense/concepts.yaml: ${c.id} uses unknown route ${r}`);
      for (const r of c.read.progression) if (!routeIds.has(r)) errors.push(`offense/concepts.yaml: ${c.id} progression names unknown route ${r}`);
      for (const [n, byNum] of Object.entries(c.by_count))
        for (let k = 1; k <= Number(n); k++) if (!byNum?.[String(k) as '1']) errors.push(`offense/concepts.yaml: ${c.id} with ${n} receivers has no route for #${k}`);
    }
  }
  if (protections) {
    for (const p of protections.protections) for (const t of p.terms) term('offense/protections.yaml', p.id, t);
    if (!routeIds.has('check-release')) errors.push('offense/routes.yaml: protections need the check-release route');
  }

  const zoneIds = new Set(Object.keys(coverages?.zones ?? {}));
  if (fronts) {
    unique('defense/fronts.yaml', fronts.fronts.map((f) => f.id));
    for (const f of fronts.fronts) {
      for (const t of f.terms) term('defense/fronts.yaml', f.id, t);
      const roles = f.players.map((p) => p.role);
      unique(`defense/fronts.yaml ${f.id}`, roles);
      const dl = f.players.filter((p) => p.group === 'dl');
      if (dl.length < 3) errors.push(`defense/fronts.yaml: ${f.id} has ${dl.length} linemen`);
      for (const p of f.players) {
        if (p.group === 'dl' && !p.tech) errors.push(`defense/fronts.yaml: ${f.id} ${p.role} is a lineman with no technique`);
        if (p.group === 'dl' && p.align) errors.push(`defense/fronts.yaml: ${f.id} ${p.role} is a lineman with a linebacker alignment`);
        const aligns = p.align ? ('tight-end' in p.align ? [p.align['tight-end'], p.align.none] : [p.align]) : [];
        for (const a of aligns) if ('stack' in a && !dl.some((d) => d.role === a.stack)) errors.push(`defense/fronts.yaml: ${f.id} ${p.role} stacks on ${a.stack}, not a lineman in this front`);
      }
    }
  }
  if (coverages && fronts) {
    unique('defense/coverages.yaml', coverages.coverages.map((c) => c.id));
    for (const z of Object.values(coverages.zones)) term('defense/coverages.yaml', 'a zone', z.term);
    for (const cv of coverages.coverages) {
      const file = 'defense/coverages.yaml';
      for (const t of cv.terms) term(file, cv.id, t);
      const rotates = cv.shell.pre !== cv.shell.post;
      if (rotates !== Boolean(cv.rotation)) errors.push(`${file}: ${cv.id} ${rotates ? 'changes shell and needs a rotation tag' : 'has a rotation tag but keeps its shell'}`);
      if (cv.rotation) term(file, cv.id, cv.rotation);
      term(file, cv.id, cv.shell.pre);
      term(file, cv.id, cv.shell.post);
      for (const [frontId, table] of Object.entries(cv.fronts)) {
        const front = fronts.fronts.find((f) => f.id === frontId);
        if (!front) { errors.push(`${file}: ${cv.id} is set up for unknown front ${frontId}`); continue; }
        const roles = new Set(front.players.map((p) => p.role));
        const covered = new Set<string>();
        for (const [key, entry] of Object.entries(table)) {
          if (key === 'safety-field' || key === 'safety-boundary') { if (!roles.has('ss') || !roles.has('fs')) errors.push(`${file}: ${cv.id}/${frontId} uses ${key} without two safeties`); covered.add('ss'); covered.add('fs'); }
          else if (!roles.has(key)) errors.push(`${file}: ${cv.id}/${frontId} gives a job to ${key}, who is not in the front`);
          else covered.add(key);
          const j = entry.job;
          if ('zone' in j) {
            const z = coverages.zones[j.zone];
            if (!z) errors.push(`${file}: ${cv.id}/${frontId} ${key} uses unknown zone ${j.zone}`);
            else if (!z[j.part ?? (j.side === 'middle' ? 'middle' : 'outside')]) errors.push(`${file}: ${cv.id}/${frontId} ${key}: zone ${j.zone} has no ${j.part ?? j.side} landmark`);
          }
          if ('man' in j && j.man.length === 0 && !(j.spare ?? []).length) errors.push(`${file}: ${cv.id}/${frontId} ${key} has no man and no spare job`);
        }
        for (const p of front.players) if (p.group !== 'dl' && !covered.has(p.role)) errors.push(`${file}: ${cv.id}/${frontId} has no job for ${p.role}`);
        for (const tl of cv.tells ?? []) if (!roles.has(tl.role)) errors.push(`${file}: ${cv.id} tell for ${tl.role}, who is not in the ${frontId}`);
        if (cv.family === 'zone') {
          const jobs = Object.values(table).map((e) => e.job);
          const deep = jobs.filter((j) => 'zone' in j && coverages.zones[j.zone]?.deep).length;
          const under = jobs.filter((j) => 'zone' in j && !coverages.zones[j.zone]?.deep).length;
          if (cv.counts?.deep !== undefined && deep !== cv.counts.deep) errors.push(`${file}: ${cv.id}/${frontId} has ${deep} deep zones, needs ${cv.counts.deep}`);
          if (cv.counts?.under !== undefined && under !== cv.counts.under) errors.push(`${file}: ${cv.id}/${frontId} has ${under} under zones, needs ${cv.counts.under}`);
        }
      }
    }
    for (const z of zoneIds) if (!/^[a-z-]+$/.test(z)) errors.push(`defense/coverages.yaml: zone id ${z}`);
    const zr = coverages.zone_reaction;
    if (zr.react_after > zr.read_by) errors.push(`defense/coverages.yaml: zone defenders react at ${zr.react_after} s, after read_by (${zr.read_by} s)`);
    for (const z of zoneIds) if (!zr.zones[z]) errors.push(`defense/coverages.yaml: zone ${z} has no zone_reaction rule`);
  }
  if (speeds) for (const [job, prof] of Object.entries(speeds.jobs)) if (!speeds.profiles[prof]) errors.push(`tuning/speeds.yaml: job ${job} uses unknown profile ${prof}`);

  const entries: { reviewed: boolean }[] = [
    ...(personnel?.groups ?? []),
    ...(formations ? [formations.alignment, formations.drops, ...formations.formations] : []),
    ...(motions?.motions ?? []),
    ...(routes?.routes ?? []),
    ...(concepts?.concepts ?? []),
    ...(protections?.protections ?? []),
    ...(fronts ? [fronts.alignment, fronts.rush, ...fronts.fronts] : []),
    ...(coverages ? [coverages.shells, coverages.alignments, coverages.man, ...coverages.coverages] : []),
    ...(speeds ? [speeds] : []),
  ];
  return {
    formations: formations?.formations.length ?? 0,
    motions: motions?.motions.length ?? 0,
    routes: routes?.routes.length ?? 0,
    concepts: concepts?.concepts.length ?? 0,
    protections: protections?.protections.length ?? 0,
    fronts: fronts?.fronts.length ?? 0,
    coverages: coverages?.coverages.length ?? 0,
    needsReview: entries.filter((e) => !e.reviewed).length,
  };
}
