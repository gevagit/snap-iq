import { z } from 'zod';

/** kebab-case ids, used to cross-reference content */
export const Id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ids are kebab-case');

/** Every content entry carries its review state (PRD §13.1). A reviewed entry must say who and when. */
const Review = {
  reviewed: z.boolean(),
  reviewer: z.string().optional(),
  reviewed_at: z.string().optional(),
};
const reviewComplete = (e: { reviewed: boolean; reviewer?: string | undefined; reviewed_at?: string | undefined }) =>
  !e.reviewed || (Boolean(e.reviewer) && Boolean(e.reviewed_at));
const reviewMessage = { message: 'a reviewed entry needs reviewer and reviewed_at' };

export const GlossaryTerm = z
  .object({
    id: Id,
    term: z.string().min(1),
    category: z.string().min(1),
    definition: z.string().min(10),
    aliases: z.array(z.string().min(1)),
    see: z.array(Id).optional(),
    confirm: z.string().optional(),
    /** owner or coach decisions recorded during review */
    notes: z.string().optional(),
    ...Review,
  })
  .strict()
  .refine(reviewComplete, reviewMessage);
export type GlossaryTerm = z.infer<typeof GlossaryTerm>;

export const Glossary = z
  .object({
    version: z.number().int(),
    batch: z.number().int(),
    categories: z.record(z.string(), z.string()),
    terms: z.array(GlossaryTerm),
  })
  .strict();
export type Glossary = z.infer<typeof Glossary>;

export const Source = z.object({ title: z.string().min(1), url: z.url() }).strict();

export const Rule = z
  .object({
    id: Id,
    title: z.string().min(1),
    nfhs_ref: z.string().min(1),
    nfhs_ref_seen_in_source: z.boolean(),
    rule: z.string().min(10),
    penalty: z.string().optional(),
    qb_meaning: z.string().min(10),
    game_use: z.string().min(5),
    terms: z.array(Id).min(1),
    check: z
      .object({
        status: z.enum(['rule-book', 'search-summary', 'default', 'needs-confirm']),
        note: z.string().optional(),
        sources: z.array(Source).min(1),
      })
      .strict(),
    ...Review,
  })
  .strict()
  .refine(reviewComplete, reviewMessage)
  .refine((r) => !['needs-confirm', 'default'].includes(r.check.status) || Boolean(r.check.note), {
    message: 'needs-confirm and default must say what (check.note)',
  });
export type Rule = z.infer<typeof Rule>;

export const Rules = z
  .object({
    version: z.number().int(),
    batch: z.number().int(),
    rule_set: z.literal('NFHS'),
    edition_checked: z.string(),
    rules: z.array(Rule),
  })
  .strict();
export type Rules = z.infer<typeof Rules>;

const Landmark = z
  .object({
    id: Id,
    rule: z.string().min(5),
    half_width: z.number().optional(),
    depth_behind_each_line: z.number().optional(),
    outside_end_man: z.number().optional(),
    depth: z.number().optional(),
    confirm: z.string().optional(),
    notes: z.string().optional(),
    ...Review,
  })
  .strict();

export const Geometry = z
  .object({
    version: z.number().int(),
    batch: z.number().int(),
    units: z.literal('yards'),
    field: z
      .object({
        length_goal_to_goal: z.number(),
        end_zone_depth: z.number(),
        width: z.number(),
        hash_from_sideline: z.number(),
        hash_mark_length: z.number(),
        line_width: z.number(),
        yard_lines_every: z.number(),
        numbers: z.object({ optional: z.boolean(), height: z.number(), top_from_sideline: z.number(), confirm: z.string().optional(), notes: z.string().optional() }).strict(),
        goal_post: z.object({ crossbar_height: z.number(), uprights_inside_width: z.number(), on: z.literal('end_line') }).strict(),
        ...Review,
      })
      .strict(),
    ball_spots: z
      .object({
        left_hash: z.object({ x_from_left_sideline: z.number() }).strict(),
        middle: z.object({ x_from_left_sideline: z.number() }).strict(),
        right_hash: z.object({ x_from_left_sideline: z.number() }).strict(),
        ...Review,
      })
      .strict(),
    landmarks: z.array(Landmark),
  })
  .strict();
export type Geometry = z.infer<typeof Geometry>;
