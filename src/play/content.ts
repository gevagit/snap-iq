import { Geometry, Glossary } from '../content/schemas';
import * as S from '../content/playSchemas';
import type { ContentKey } from '../content/load';

/** Everything the play engine reads, parsed and indexed by id. Throws on invalid content (validate first). */
export interface PlayContent {
  geometry: Geometry;
  glossaryIds: Set<string>;
  personnel: S.Personnel;
  formations: S.Formations;
  motions: S.Motions;
  routes: Map<string, S.Route>;
  routeFile: S.Routes;
  concepts: S.Concepts;
  protections: S.Protections;
  fronts: S.Fronts;
  coverages: S.Coverages;
  speeds: S.Speeds;
}

export function parsePlayContent(raw: Record<ContentKey, unknown>): PlayContent {
  const routeFile = S.Routes.parse(raw.routes);
  return {
    geometry: Geometry.parse(raw.geometry),
    glossaryIds: new Set(Glossary.parse(raw.glossary).terms.map((t) => t.id)),
    personnel: S.Personnel.parse(raw.personnel),
    formations: S.Formations.parse(raw.formations),
    motions: S.Motions.parse(raw.motions),
    routes: new Map(routeFile.routes.map((r) => [r.id, r])),
    routeFile,
    concepts: S.Concepts.parse(raw.concepts),
    protections: S.Protections.parse(raw.protections),
    fronts: S.Fronts.parse(raw.fronts),
    coverages: S.Coverages.parse(raw.coverages),
    speeds: S.Speeds.parse(raw.speeds),
  };
}

export function byId<T extends { id: string }>(list: T[], id: string, what: string): T {
  const found = list.find((e) => e.id === id);
  if (!found) throw new Error(`unknown ${what} ${id}`);
  return found;
}
