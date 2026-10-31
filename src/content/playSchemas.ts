import { z } from 'zod';
import { Id } from './schemas';

/** Batch 2 schemas: offense, defense and speed-profile content. Every entry carries its review state. */
const Review = { reviewed: z.boolean(), reviewer: z.string().optional(), reviewed_at: z.string().optional() };
type ReviewFields = { reviewed: boolean; reviewer?: string | undefined; reviewed_at?: string | undefined };
const reviewComplete = (e: unknown) => {
  const r = e as ReviewFields;
  return !r.reviewed || (Boolean(r.reviewer) && Boolean(r.reviewed_at));
};
const reviewMessage = { message: 'a reviewed entry needs reviewer and reviewed_at' };
const reviewed = <T extends z.ZodRawShape>(shape: T) => z.object({ ...shape, ...Review }).strict().refine(reviewComplete, reviewMessage);

const Header = { version: z.number().int(), batch: z.number().int() };
const Point = z.tuple([z.number(), z.number()]);
const Side = z.enum(['strong', 'weak']);
const Letter = z.enum(['X', 'Z', 'H', 'Y', 'R', 'F']);
const QbSet = z.enum(['gun', 'pistol', 'under']);
export type QbSet = z.infer<typeof QbSet>;

// ------------------------------------------------------------------ offense
export const Personnel = z
  .object({
    ...Header,
    groups: z.array(reviewed({ id: z.string().regex(/^\d\d$/), backs: z.number().int(), tight_ends: z.number().int(), receivers: z.number().int() })),
    jersey_numbers: z.record(z.string(), z.number().int().min(0).max(99)),
  })
  .strict();

export const Align = z.enum(['wide', 'slot', 'inside-slot', 'attached', 'bunch-point', 'bunch-inside', 'bunch-outside', 'gun-offset', 'pistol-back', 'i-back', 'fullback']);
export type Align = z.infer<typeof Align>;
const BackSpot = z.object({ x: z.number(), depth: z.number() }).strict();
const Drop = z.object({ catch: z.number(), path: z.array(Point).min(2) }).strict();

export const Formations = z
  .object({
    ...Header,
    alignment: reviewed({
      line: z.object({ split: z.number(), depth: z.number() }).strict(),
      back_min_depth: z.number(),
      wide: z.object({ from_sideline: z.number(), min_from_ball: z.number(), max_from_ball: z.number() }).strict(),
      slot: z.object({ fraction: z.number(), min_outside_end_man: z.number() }).strict(),
      inside_slot: z.object({ fraction: z.number() }).strict(),
      attached: z.object({ outside_tackle: z.number() }).strict(),
      bunch: z.object({ point_outside_end_man: z.number(), spread: z.number(), depth_behind_point: z.number() }).strict(),
      qb: z.object({ gun: z.number(), pistol: z.number(), under: z.number() }).strict(),
      backs: z.object({ 'gun-offset': BackSpot, 'pistol-back': BackSpot, 'i-back': BackSpot, fullback: BackSpot }).strict(),
    }),
    drops: reviewed({ gun: Drop, pistol: Drop, under: Drop }),
    formations: z.array(
      reviewed({
        id: Id,
        name: z.string().min(1),
        terms: z.array(Id),
        personnel: z.string(),
        qb: QbSet,
        players: z.partialRecord(Letter, z.object({ side: Side, align: Align, on_line: z.boolean().optional() }).strict()),
      }),
    ),
  })
  .strict();

const Spot = z.object({ x: z.number(), depth: z.number() }).strict();
export const MotionPath = z.discriminatedUnion('kind', [
  z.object({ kind: z.enum(['jet', 'orbit']), turn: z.object({ inward: z.number(), depth: z.number() }).strict(), via: z.array(Point).optional(), snap: Spot }).strict(),
  z.object({ kind: z.literal('lateral'), inward: z.number().positive() }).strict(),
  z.object({ kind: z.literal('return'), inward: z.number().positive(), turn_radius: z.number().positive(), back: z.number().positive() }).strict(),
  z.object({ kind: z.literal('out-to-slot'), destination: Side, set_before_snap: z.number().positive() }).strict(),
]);
export type MotionPath = z.infer<typeof MotionPath>;

export const Motions = z
  .object({
    ...Header,
    motions: z.array(
      reviewed({
        id: Id,
        name: z.string().min(1),
        terms: z.array(Id),
        mover: z.object({ side: z.enum(['strong', 'weak', 'backfield']), pick: z.enum(['innermost-off-line', 'widest-off-line', 'back']) }).strict().optional(),
        needs: z
          .object({
            side_receivers_min: z.number().int().optional(),
            max_from_ball: z.number().optional(),
            qb: z.array(QbSet).optional(),
            mover_is_number: z.number().int().optional(),
            protection_without_back: z.boolean().optional(),
            destination_receivers_max: z.number().int().optional(),
            clear_of_teammates: z.number().optional(),
          })
          .strict()
          .optional(),
        speed: z.number().positive().optional(),
        path: MotionPath.optional(),
        after: z.array(Point).optional(),
        quick: z.boolean().optional(),
        counts_to: z.literal('destination').optional(),
      }),
    ),
  })
  .strict();

export const Routes = z
  .object({
    ...Header,
    sideline_room: z.number(),
    routes: z.array(reviewed({ id: Id, waypoints: z.array(Point).min(1), quick: z.boolean(), check_seconds: z.number().optional() })),
  })
  .strict();

export const RouteRef = z.union([Id, z.object({ route: Id, deeper: z.number() }).strict()]);
export type RouteRef = z.infer<typeof RouteRef>;
const ByNumber = z.partialRecord(z.enum(['1', '2', '3']), RouteRef);

export const Concepts = z
  .object({
    ...Header,
    concepts: z.array(
      reviewed({
        id: Id,
        name: z.string().min(1),
        terms: z.array(Id),
        by_count: z.partialRecord(z.enum(['1', '2', '3']), ByNumber),
        weak: ByNumber,
        back: Id,
        read: z.object({ key: Id, side: z.enum(['strong', 'weak', 'middle']), progression: z.array(Id).min(1) }).strict(),
      }),
    ),
  })
  .strict();

export const Protections = z
  .object({
    ...Header,
    back_check_point: z.object({ outside_tackle: z.number(), depth: z.number() }).strict(),
    pass_set: z.object({ in_front_of_rusher: z.number(), help_depth: z.number() }).strict(),
    second_back: z.literal('block'),
    protections: z.array(
      reviewed({
        id: Id,
        name: z.string().min(1),
        terms: z.array(Id),
        back: z.enum(['free', 'check-release', 'pick-up']),
        needs_back: z.boolean(),
        slide: z.literal('away-from-back').optional(),
      }),
    ),
  })
  .strict();

// ------------------------------------------------------------------ defense
export const Tech = z.enum(['0', '1', '2i', '2', '3', '4i', '4', '5', '7', '6', '9']);
export type Tech = z.infer<typeof Tech>;
const ByTightEnd = <T extends z.ZodTypeAny>(t: T) => z.union([t, z.object({ 'tight-end': t, none: t }).strict()]);
const LbAlign = z.union([
  z.object({ gap: z.enum(['a', 'b', 'c']) }).strict(),
  z.object({ stack: Id }).strict(),
  z.object({ at: z.literal('apex') }).strict(),
]);
export type LbAlign = z.infer<typeof LbAlign>;
export const FrontPlayer = z
  .object({
    role: Id,
    label: z.string().min(1).max(3),
    number: z.number().int().min(0).max(99),
    group: z.enum(['dl', 'lb', 'db']),
    side: Side,
    tech: ByTightEnd(Tech).optional(),
    align: ByTightEnd(LbAlign).optional(),
  })
  .strict();
export type FrontPlayer = z.infer<typeof FrontPlayer>;
export const Lane = z.enum(['a', 'b', 'c', 'edge', 'bull']);
export type Lane = z.infer<typeof Lane>;

export const Fronts = z
  .object({
    ...Header,
    strength_call: z.array(z.enum(['tight-end', 'more-receivers', 'field', 'away-from-back', 'offense-right'])).min(1),
    alignment: reviewed({
      dl_depth: z.number(),
      neutral_zone: z.number(),
      body_radius: z.number(),
      shoulder: z.number(),
      lb_depth: z.number(),
      c_gap_without_te: z.number(),
      apex_without_slot: z.object({ outside_end_man: z.number() }).strict(),
    }),
    techniques: z.record(Tech, z.object({ of: z.enum(['center', 'guard', 'tackle', 'tight-end']), shoulder: z.enum(['head-up', 'inside', 'outside']) }).strict()),
    rush_lanes: z.record(Tech, Lane),
    rush: reviewed({ gap_depth: z.number(), meet_line: z.number(), meet_back: z.number(), stop_short: z.number(), edge_outside_end_man: z.number() }),
    fronts: z.array(reviewed({ id: Id, name: z.string().min(1), terms: z.array(Id), tier: z.enum(['youth', 'jv']), players: z.array(FrontPlayer).length(11) })),
  })
  .strict();

const CbAlign = z.object({ depth: z.number(), leverage: z.enum(['outside', 'inside']), offset: z.number() }).strict();
const ZonePlace = z.union([
  z.object({ from_sideline: z.number(), max_outside_1: z.number().optional() }).strict(),
  z.object({ at: z.enum(['middle-of-field', 'ball']), depth: z.number().optional() }).strict(),
  z.object({ end_man_to_1: z.number() }).strict(),
  z.object({ end_man_plus: z.number() }).strict(),
]);
export type ZonePlace = z.infer<typeof ZonePlace>;
export const Zone = z
  .object({ term: Id, deep: z.boolean(), depth: z.number(), by: z.number(), outside: ZonePlace.optional(), inside: ZonePlace.optional(), middle: ZonePlace.optional() })
  .strict();
export type Zone = z.infer<typeof Zone>;
export const ManKey = z.enum(['strong-1', 'strong-2', 'strong-3', 'weak-1', 'weak-2', 'weak-3', 'tight-end', 'back']);
export type ManKey = z.infer<typeof ManKey>;
export const Job = z.union([
  z.object({ zone: Id, side: z.enum(['strong', 'weak', 'middle']), part: z.enum(['outside', 'inside', 'middle']).optional() }).strict(),
  z.object({ man: z.array(ManKey), spare: z.array(z.enum(['hole', 'rush'])).optional() }).strict(),
  z.object({ rush: Lane }).strict(),
]);
export type Job = z.infer<typeof Job>;
export const AlignName = z.enum(['off-outside', 'off-inside', 'squat', 'quarters', 'press', 'one-high', 'two-high', 'two-high-low', 'down', 'over-man', 'apex', 'blitz']);
export type AlignName = z.infer<typeof AlignName>;
const Shell = z.enum(['zero-high', 'one-high', 'two-high']);
export type Shell = z.infer<typeof Shell>;

export const Coverages = z
  .object({
    ...Header,
    shells: reviewed({ high_depth: z.number() }),
    alignments: z
      .object({
        'off-outside': CbAlign,
        'off-inside': CbAlign,
        squat: CbAlign,
        quarters: CbAlign,
        press: CbAlign,
        'one-high': z.object({ depth: z.number(), at: z.literal('middle-of-field') }).strict(),
        'two-high': z.object({ depth: z.number(), at: z.literal('hash') }).strict(),
        'two-high-low': z.object({ depth: z.number(), at: z.literal('hash') }).strict(),
        down: z.object({ depth: z.number() }).strict(),
        'over-man': CbAlign.extend({ travel_depth: z.number(), travel_for: z.array(z.enum(['jet', 'orbit', 'lateral', 'return', 'out-to-slot'])) }),
        apex: z.object({ at: z.literal('apex') }).strict(),
        blitz: z.object({ depth: z.number() }).strict(),
        ...Review,
      })
      .strict()
      .refine(reviewComplete, reviewMessage),
    zones: z.record(Id, Zone),
    zone_reaction: reviewed({
      react_after: z.number(),
      read_by: z.number(),
      switch_margin: z.number(),
      one_each: z.boolean(),
      zones: z.record(
        Id,
        z
          .object({
            half_width: z.number(), from_depth: z.number(), to_depth: z.number(), play: z.enum(['under', 'deeper']), cushion: z.number(),
            shade: z.number().optional(), min_depth: z.number().optional(), max_depth: z.number().optional(),
          })
          .strict(),
      ),
    }),
    man: reviewed({ leverage: z.number(), min_cushion: z.number(), close_rate: z.number(), green_dog: z.boolean() }),
    motion_response: z.object({ man: z.literal('travel'), zone: z.literal('bump') }).strict(),
    coverages: z.array(
      reviewed({
        id: Id,
        name: z.string().min(1),
        tier: z.enum(['youth', 'jv']),
        terms: z.array(Id),
        /** the coverage he names after the snap (a glossary term) */
        answer: Id,
        family: z.enum(['man', 'zone']),
        shell: z.object({ pre: Shell, post: Shell }).strict(),
        rotation: Id.optional(),
        counts: z.object({ deep: z.number().int().optional(), under: z.number().int().optional(), rush: z.number().int().optional() }).strict().optional(),
        tells: z
          .array(
            z
              .object({
                role: Id,
                start: z.number().positive(),
                to: z.object({ depth: z.number(), end_man_plus: z.number().optional() }).strict(),
                kind: z.enum(['blitz-tell', 'rotation-tell']).optional(),
                honest: z.boolean(),
              })
              .strict(),
          )
          .optional(),
        fronts: z.record(Id, z.record(Id, z.object({ align: AlignName.optional(), job: Job }).strict())),
      }),
    ),
  })
  .strict();

// ------------------------------------------------------------------ tuning
const Profile = z.object({ top: z.number().positive(), tau: z.number().positive(), delay: z.number().min(0) }).strict();
export type Profile = z.infer<typeof Profile>;
export const JobName = z.enum([
  'route-wide-receiver', 'route-tight-end', 'route-back', 'back-check', 'pass-set', 'rush', 'blitz', 'drop-lineman',
  'zone-linebacker', 'zone-corner-deep', 'zone-back', 'man-linebacker', 'man-tight', 'man-off',
]);
export type JobName = z.infer<typeof JobName>;
export const Speeds = z
  .object({
    ...Header,
    profiles: z.record(z.string(), Profile),
    jobs: z.record(JobName, z.string()),
    presnap: z.object({ walk: z.number(), travel: z.number(), lag: z.number(), accel: z.number(), motion_tau: z.number(), man_tight_within: z.number(), make_room: z.number() }).strict(),
    ...Review,
  })
  .strict()
  .refine(reviewComplete, reviewMessage);

export type Personnel = z.infer<typeof Personnel>;
export type Formations = z.infer<typeof Formations>;
export type Formation = Formations['formations'][number];
export type Motions = z.infer<typeof Motions>;
export type Motion = Motions['motions'][number];
export type Routes = z.infer<typeof Routes>;
export type Route = Routes['routes'][number];
export type Concepts = z.infer<typeof Concepts>;
export type Concept = Concepts['concepts'][number];
export type Protections = z.infer<typeof Protections>;
export type Protection = Protections['protections'][number];
export type Fronts = z.infer<typeof Fronts>;
export type Front = Fronts['fronts'][number];
export type Coverages = z.infer<typeof Coverages>;
export type Coverage = Coverages['coverages'][number];
export type Speeds = z.infer<typeof Speeds>;

const RoutineTier = z
  .object({
    clock: z.number().positive(),
    coverages: z.array(Id).min(1),
    fronts: z.array(Id).min(1),
    motions: z.array(Id).min(1),
    answers: z.object({ shell: z.array(Id).min(2), coverage: z.array(Id).min(2) }).strict(),
  })
  .strict();
/** his pre-snap routine steps, each asked in one chunk; then the questions at the first stop after the snap */
export const STEPS = ['alignment', 'shell', 'box', 'corners', 'tells', 'threats', 'adjust', 'key', 'escape', 'reads'] as const;
export const POST_STEPS = ['drop', 'coverage', 'blitz', 'look-off'] as const;
export type Step = (typeof STEPS)[number];
const Points = z.object({
  alignment: z.number(), shell: z.number(), box: z.number(), corners: z.number(), tells: z.number(), threats: z.number(), adjust: z.number(),
  key: z.number(), escape: z.number(), drop: z.number(), coverage: z.number(), blitz: z.number(), decision: z.number(), beat_the_clock: z.number(),
}).strict();
export const Drills = z
  .object({
    ...Header,
    ball: z.object({ speed: z.number().positive(), release_delay: z.number().min(0), release_height: z.number() }).strict(),
    reads: z.object({ open_separation: z.number().positive() }).strict(),
    routine: z
      .object({
        reps: z.number().int().positive(),
        chunks: z.object({ know: z.array(z.enum(STEPS)), see: z.array(z.enum(STEPS)), threats: z.array(z.enum(STEPS)), plan: z.array(z.enum(STEPS)) }).strict(),
        max_reads: z.number().int().positive(),
        post: z.object({ snap_freeze: z.number().min(0), decision_after: z.number().positive(), questions: z.array(z.enum(POST_STEPS)) }).strict(),
        tiers: z.object({ youth: RoutineTier, jv: RoutineTier }).strict(),
        corners: z.object({ press_within: z.number(), head_up_within: z.number() }).strict(),
        box_choices: z.array(z.number().int()).min(2),
        faults: z.object({ rate: z.number().min(0).max(1), step: z.number().positive() }).strict(),
        decide: z.object({ run_room: z.number().positive(), roll_out: z.object({ lane: z.number().positive(), clear: z.number().positive() }).strict() }).strict(),
        points: Points,
      })
      .strict(),
    scoring: z.object({ open_not_read: z.number(), workout_bonus: z.number() }).strict(),
    ranks: z.array(z.tuple([z.number().int().min(0), z.string().min(1)])).min(1),
    ...Review,
  })
  .strict()
  .refine(reviewComplete, reviewMessage);
export type Drills = z.infer<typeof Drills>;

export const Adjustments = z
  .object({
    ...Header,
    max_changes: z.number().int().min(0),
    menus: z.object({ wide: z.array(Id), slot: z.array(Id), 'tight-end': z.array(Id), back: z.array(Id) }).strict(),
    ...Review,
  })
  .strict()
  .refine(reviewComplete, reviewMessage);
export type Adjustments = z.infer<typeof Adjustments>;

const DropSet = z.object({ gun: Id, pistol: Id, under: Id }).strict();
export const Quarterback = z
  .object({
    ...Header,
    throwing_hand: z.enum(['left', 'right']),
    drops: z.record(Id, DropSet),
    escape: z.object({ prefer: z.literal('throwing-hand'), edge_threat: z.object({ outside_tackle: z.number(), within_depth: z.number() }).strict() }).strict(),
    ...Review,
  })
  .strict()
  .refine(reviewComplete, reviewMessage);
export type Quarterback = z.infer<typeof Quarterback>;

// ---------------------------------------------------------------- pocket (batch 4): content/pocket/rules.yaml
const MoveProfile = z.object({ top: z.number().positive(), tau: z.number().positive() }).strict();
export const POCKET_RESPONSES = ['stand', 'climb', 'pocket-slide', 'pocket-escape', 'ball-out'] as const;
export const Pocket = z
  .object({
    ...Header,
    movement: z.object({ shuffle: MoveProfile, run: MoveProfile, run_at: z.number().min(0).max(1), offhand_reset: z.object({ above: z.number().positive(), seconds: z.number().min(0) }).strict() }).strict(),
    rush: z.object({
      hold_drift: z.number().min(0), push_speed: z.number().positive(), shed_reach: z.number().positive(), edge_lane: z.number().positive(), edge_corner: z.number(),
      edge_aim_behind: z.number().min(0), turn: z.object({ edge: z.number().positive(), interior: z.number().positive(), free: z.number().positive() }).strict(),
      sack_reach: z.number().positive(), break_down: z.number().positive(), blocker_gap: z.number().positive(), ride_wide: z.number().min(0), ride_deep: z.number().min(0), real_within: z.number().positive(),
    }).strict(),
    moves: z.object({
      climb: z.object({ forward: z.number().positive(), lateral_max: z.number().positive() }).strict(),
      'pocket-slide': z.object({ lateral: z.number().positive() }).strict(),
      'pocket-escape': z.object({ outside_tackle: z.number().min(0) }).strict(),
      'happy-feet': z.object({ lateral: z.number().positive(), forward: z.number().positive(), back: z.number().positive() }).strict(),
      timing: z.object({ moving: z.number().positive(), early: z.number().min(0), late: z.number().min(0) }).strict(),
    }).strict(),
    pocket_front: z.number().positive(),
    pocket_edge: z.number().positive(),
    ...Review,
  })
  .strict()
  .refine(reviewComplete, reviewMessage);
export type Pocket = z.infer<typeof Pocket>;
