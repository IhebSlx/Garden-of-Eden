/**
 * SPEC §4 — Domain model. These Zod schemas are the single source of truth:
 * every TypeScript domain type in the app is inferred from here, never hand-written.
 *
 * Layering:
 *   - `*Schema`        structural validation of one entity
 *   - `FleetSchema`    structural validation of a whole fleet
 *   - `FleetDocumentSchema` (integrity.ts) adds the §4 cross-entity rules
 */
import { z } from 'zod';

/** Schema version of the on-disk / exported fleet document (SPEC §7). */
export const SCHEMA_VERSION = 1 as const;

const id = () => z.string().min(1, 'id must not be empty');

// ---------- shared ----------

export const StatusSchema = z.enum(['live', 'building', 'planned']);
export type Status = z.infer<typeof StatusSchema>;

/** SPEC §4: display labels for agents & edges. */
export const STATUS_LABELS: Record<Status, string> = {
  live: 'Live',
  building: 'In progress',
  planned: 'Planned',
};

/**
 * SPEC §4/§5.6 gives data its own labels where agents say Live / In progress / Planned.
 *
 * DEVIATION: those labels are now about PROVISION rather than readiness, because the
 * question asked of data is "does this exist, or does somebody still owe it?". The
 * same three-state enum underneath, so the filter bar and every status control keep
 * working — only the words change, and only for data.
 */
export const DATA_SOURCE_STATUS_LABELS: Record<Status, string> = {
  live: 'Existing',
  building: 'Being prepared',
  planned: 'To be provided',
};

// ---------- libraries (first-class entities, referenced by id) ----------

export const SkillSchema = z.object({
  id: id(),
  name: z.string().min(1),
  description: z.string().optional(),
  instructions: z.string().optional(),
  /**
   * DEVIATION: beyond SPEC §4. Free text ABOUT this component, written for people
   * — an open question, a decision and why, who to ask, what still has to happen.
   * Deliberately not `instructions`: instructions are given to the agent and shape
   * what it does; notes are never sent anywhere and shape nothing.
   */
  notes: z.string().optional(),
});
export type Skill = z.infer<typeof SkillSchema>;

/** SPEC §4: "extensible enum" — widen this tuple to add a tool type. */
export const ToolTypeSchema = z.enum(['workflow', 'python', 'microsoft']);
export type ToolType = z.infer<typeof ToolTypeSchema>;

export const WorkflowStepKindSchema = z.enum(['trigger', 'action', 'condition']);
export type WorkflowStepKind = z.infer<typeof WorkflowStepKindSchema>;

export const WorkflowStepSchema = z.object({
  id: id(),
  name: z.string().min(1),
  kind: WorkflowStepKindSchema,
  /** Branching supported — a step may fan out to several successors (mini-DAG). */
  next: z.array(z.string()),
});
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const WorkflowSchema = z.object({
  steps: z.array(WorkflowStepSchema),
});
export type Workflow = z.infer<typeof WorkflowSchema>;

export const ToolSchema = z
  .object({
    id: id(),
    /** SPEC §4: required — "every tool explains itself". */
    name: z.string().min(1),
    description: z.string().min(1, 'every tool needs a description'),
    type: ToolTypeSchema,
    workflow: WorkflowSchema.optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    /**
     * DEVIATION: beyond SPEC §4. Free text ABOUT this component, written for people
     * — an open question, a decision and why, who to ask, what still has to happen.
     * Deliberately not `instructions`: instructions are given to the agent and shape
     * what it does; notes are never sent anywhere and shape nothing.
     */
    notes: z.string().optional(),
  })
  .superRefine((tool, ctx) => {
    // SPEC §4: `workflow` is "only when type === 'workflow'".
    if (tool.workflow && tool.type !== 'workflow') {
      ctx.addIssue({
        code: 'custom',
        path: ['workflow'],
        message: `workflow steps are only allowed on tools of type "workflow" (got "${tool.type}")`,
      });
    }
    if (!tool.workflow) return;

    // A step may only point at steps of the same tool, or the mini-DAG renderer (§8.6) has nothing to draw.
    const stepIds = new Set(tool.workflow.steps.map((s) => s.id));
    tool.workflow.steps.forEach((step, stepIndex) => {
      step.next.forEach((nextId, nextIndex) => {
        if (!stepIds.has(nextId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['workflow', 'steps', stepIndex, 'next', nextIndex],
            message: `step "${step.id}" points at unknown step "${nextId}"`,
          });
        }
      });
    });
  });
export type Tool = z.infer<typeof ToolSchema>;

/** SPEC §4: "extensible enum". */
/**
 * SPEC 4 calls this an "extensible enum".
 *
 * DEVIATION: 'file' is added beyond the spec's three. A Copilot Studio skill ships
 * a folder of resources - templates, images, reference docs, JSON schemas - and
 * they are genuinely data the agent reads, but none of them is md, Dataverse or
 * SharePoint. Forcing them into one of those would misreport where the data lives.
 *
 * DEVIATION: 'department' is added too. Data HAS a source, and that source may be an
 * organisational unit rather than a system: product data comes from Produktmanagement
 * long before it lives in Dataverse. Without it, data a team still owes has to be
 * mislabelled as a file or as a SharePoint site it is not in yet.
 */
export const DataSourceTypeSchema = z.enum(['md', 'dataverse', 'sharepoint', 'file', 'department']);
export type DataSourceType = z.infer<typeof DataSourceTypeSchema>;

export const DataSourceSchema = z.object({
  id: id(),
  name: z.string().min(1),
  type: DataSourceTypeSchema,
  status: StatusSchema,
  /**
   * SPEC §4: "only meaningful when status === 'live'" — meaningfulness, not a constraint,
   * so a stale `linked` on a non-ready source validates and is simply not displayed (§5.6).
   */
  linked: z.boolean().optional(),
  ref: z.string().optional(),
  /**
   * DEVIATION: beyond SPEC §4's field list. A Copilot Studio knowledge source
   * carries prose telling the agent when the source is and is not the right one
   * to consult. Dropping it would lose the only text that explains the source.
   */
  description: z.string().optional(),
  /**
   * DEVIATION: beyond SPEC §4. The board is a roadmap (SPEC §1), and a Planned
   * data source is work somebody still has to do. These two record who owes it
   * and what "finished" looks like — "Marketing" / "every product image, named
   * produkt_variante.png". Without them the board can show that an agent needs
   * 19 sources but not who has to produce them, which is the question the fleet
   * overview is actually asked.
   *
   * `owner` names the department that has to provide it. Free text rather than an
   * agent id: a fleet can be edited into a state where the department agent does
   * not exist yet, and an obligation must survive that.
   *
   * The Ansprechpartner is NOT here. A department has one person to ask, not one
   * per item it provides, so it lives on the department agent (`Agent.contact`)
   * and is read through `contactForProvider`.
   */
  owner: z.string().optional(),
  requirement: z.string().optional(),
  /**
   * DEVIATION: nesting. Data comes in wholes made of parts — "Produktdaten" is
   * images and prices and dimensions — and an overview of what a department owes is
   * unreadable as a flat list of leaves.
   *
   * A parent id rather than an inline `children` array, because data stays an
   * id-referenced library (SPEC §8.7): the same item may be attached to several
   * agents, so it cannot be owned by one place in a tree. Absent = a top-level item.
   * `integrity.ts` rejects a missing parent, a self-parent and any cycle.
   */
  parentId: z.string().optional(),
  /**
   * DEVIATION: beyond SPEC §4. Free text ABOUT this source, written for people.
   * Distinct from `description` (what the source is, often imported) and from
   * `requirement` (what must be prepared before it can go Live).
   */
  notes: z.string().optional(),
});
export type DataSource = z.infer<typeof DataSourceSchema>;

// ---------- graph ----------

/** SPEC §4/§8: 'shared' is NOT a kind — shared-ness is derived from parent count. */
export const AgentKindSchema = z.enum(['orchestrator', 'department', 'worker']);
export type AgentKind = z.infer<typeof AgentKindSchema>;

export const ModelConfigSchema = z.object({
  provider: z.string().min(1),
  name: z.string().min(1),
  temperature: z.number().optional(),
});
export type ModelConfig = z.infer<typeof ModelConfigSchema>;

export const PositionSchema = z.object({ x: z.number(), y: z.number() });
export type Position = z.infer<typeof PositionSchema>;

export const AgentSchema = z.object({
  id: id(),
  kind: AgentKindSchema,
  name: z.string().min(1),
  /** Required key per §4, but may be empty while the user is still filling the card in. */
  role: z.string(),
  status: StatusSchema,
  instructions: z.string().optional(),
  model: ModelConfigSchema.optional(),
  skillIds: z.array(z.string()),
  toolIds: z.array(z.string()),
  dataSourceIds: z.array(z.string()),
  /**
   * DEVIATION: beyond SPEC §4. Free text ABOUT this component, written for people
   * — an open question, a decision and why, who to ask, what still has to happen.
   * Deliberately not `instructions`: instructions are given to the agent and shape
   * what it does; notes are never sent anywhere and shape nothing.
   */
  notes: z.string().optional(),
  /**
   * DEVIATION: the Ansprechpartner — the person to ask at this department. Data
   * records the department that owes it (`DataSource.owner`); a department is not
   * someone you can chase, so the name to chase lives here, once, rather than being
   * retyped on every item the department provides.
   */
  contact: z.string().optional(),
  /** Manual 2D override; absent = auto-layout (SPEC §7: the graph is the file). */
  position: PositionSchema.optional(),
});
export type Agent = z.infer<typeof AgentSchema>;

export const EdgeKindSchema = z.enum(['hierarchy', 'peer']);
export type EdgeKind = z.infer<typeof EdgeKindSchema>;

export const EdgeSchema = z.object({
  id: id(),
  /** parent */
  source: id(),
  /** child */
  target: id(),
  kind: EdgeKindSchema,
  status: StatusSchema,
  label: z.string().optional(),
});
export type Edge = z.infer<typeof EdgeSchema>;

export const FleetSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: id(),
  name: z.string().min(1),
  agents: z.array(AgentSchema),
  edges: z.array(EdgeSchema),
  skills: z.array(SkillSchema),
  tools: z.array(ToolSchema),
  dataSources: z.array(DataSourceSchema),
});
export type Fleet = z.infer<typeof FleetSchema>;

/** Which library a chip on an agent refers to (§5.7 chips, §5.8 pickers). */
export type LibraryKind = 'skill' | 'tool' | 'dataSource';
