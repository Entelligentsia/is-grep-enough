// Zod schemas for the experiment spine + state ledger.
// These are the single source of truth for the JSON shapes. Every read parses
// through them; every write re-validates before it hits disk. Unknown fields are
// rejected (.strict()) so the model can never smuggle arbitrary keys into the store.
import { z } from "zod";

/** Lifecycle of one side (a single repo×rung×arm cell). */
export const Status = z.enum([
  "pending",
  "running",
  "verifying",
  "harvesting",
  "harvested",
  "blocked",
]);
export type Status = z.infer<typeof Status>;

/** A side record: progress + measured metrics for one cell. */
export const SideRecord = z
  .object({
    status: Status,
    run_wall_s: z.number().nonnegative().optional(),
    setup_ref: z.string().optional(), // key into state.setup (<arm>/<repo>)
    context: z.number().nonnegative().optional(),
    engaged: z.boolean().optional(), // verification gate: arm used its capability
    evidence: z.string().optional(), // path under evidence/<rung>/
    blocked_reason: z.string().optional(),
    ts: z.string().optional(), // last update, ISO 8601
  })
  .strict();
export type SideRecord = z.infer<typeof SideRecord>;

/** Per (arm,repo) setup state, shared across that pair's 5 rungs. */
export const SetupRecord = z
  .object({
    ready: z.boolean(),
    setup_s: z.number().nonnegative().optional(),
    index_log: z.string().optional(),
    image_digest: z.string().optional(),
    ts: z.string().optional(),
  })
  .strict();
export type SetupRecord = z.infer<typeof SetupRecord>;

/** One arm's blind-judged score for a prompt cell. */
export const ArmScore = z
  .object({
    grounding: z.number().min(0).max(1), // cites resolve, line-exact
    completeness: z.number().min(0).max(1), // required-spine coverage
    verdict: z.string(),
  })
  .strict();

/** An audited key revision the judge made while grading. */
export const KeyRevision = z
  .object({
    level: z.string(),
    reason: z.string(),
    cite: z.string(),
    ts: z.string(),
  })
  .strict();

/** Judge record for a prompt cell (<rung>-<repo>), all arms graded together. */
export const JudgeRecord = z
  .object({
    scores: z.record(z.string(), ArmScore), // keyed by arm
    key_revisions: z.array(KeyRevision).optional(),
    verdict: z.string().optional(),
    ts: z.string().optional(),
  })
  .strict();
export type JudgeRecord = z.infer<typeof JudgeRecord>;

/** The whole mutable ledger. */
export const State = z
  .object({
    experiment: z.string(),
    spine: z.string(),
    registered_repos: z.array(z.string()),
    sides: z.record(z.string(), SideRecord),
    setup: z.record(z.string(), SetupRecord),
    judge: z.record(z.string(), JudgeRecord),
  })
  .strict();
export type State = z.infer<typeof State>;

/** One arm in the spine definition. */
export const Arm = z
  .object({
    capability: z.string(),
    image: z.string(),
    mcp: z.string().nullable(),
    needs_index: z.boolean(),
  })
  .strict();

/** The static experiment definition (spine.json). */
export const Spine = z
  .object({
    experiment: z.string(),
    purpose: z.string(),
    model: z.string(),
    arms: z.record(z.string(), Arm),
    rungs: z.array(z.string()),
    repos_source: z.string(),
    cell_id: z.string(),
    order_policy: z
      .object({
        by: z.array(z.string()),
        rung_order: z.array(z.string()),
        arm_order: z.array(z.string()),
        repo_order: z.string(),
      })
      .strict(),
    watchdog: z.object({ max_bytes: z.number(), poll_s: z.number() }).strict(),
    metrics: z.array(z.string()),
    readiness: z.object({ side_ready_iff: z.string() }).strict(),
    provenance: z.record(z.string(), z.union([z.string(), z.boolean()])),
  })
  .strict();
export type Spine = z.infer<typeof Spine>;
