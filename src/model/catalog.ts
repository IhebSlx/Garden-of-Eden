/**
 * The catalog: agents, skills, tools and data sources that exist independently of
 * any fleet.
 *
 * Why it is separate from `Fleet` rather than replacing its libraries:
 * SPEC 7 says "the graph is the file" - a fleet must stay self-contained so it can
 * be exported and opened anywhere. So adding a catalog agent to a fleet COPIES it
 * (and anything it references) into that fleet. The catalog is a source you draw
 * from, not a live dependency the fleet reaches back into.
 *
 * Ids are preserved on copy, so adding the same catalog agent to a fleet twice
 * updates rather than duplicates, and two agents that share a skill still share it.
 */
import { z } from 'zod';
import {
  AgentSchema,
  DataSourceSchema,
  SkillSchema,
  ToolSchema,
} from './schemas.js';
import type { Agent, DataSource, Fleet, Skill, Tool } from './schemas.js';

export const CATALOG_SCHEMA_VERSION = 1 as const;

/** Where a catalog agent came from, so the original file can be handed back. */
export const AgentSourceSchema = z.object({
  kind: z.literal('copilot-yaml'),
  fileName: z.string().min(1),
  importedAt: z.string().min(1),
  /** Copilot Studio's `entity.schemaName`, which identifies the same agent again. */
  schemaName: z.string().optional(),
});
export type AgentSource = z.infer<typeof AgentSourceSchema>;

export const CatalogAgentSchema = AgentSchema.extend({
  source: AgentSourceSchema.optional(),
});
export type CatalogAgent = z.infer<typeof CatalogAgentSchema>;

/** An uploaded file, kept byte-for-byte so it can be downloaded back unchanged. */
export const StoredDocumentSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  fileName: z.string().min(1),
  importedAt: z.string().min(1),
  /** The file exactly as uploaded. */
  text: z.string(),
});
export type StoredDocument = z.infer<typeof StoredDocumentSchema>;

export const CatalogSchema = z.object({
  schemaVersion: z.literal(CATALOG_SCHEMA_VERSION),
  agents: z.array(CatalogAgentSchema),
  skills: z.array(SkillSchema),
  tools: z.array(ToolSchema),
  dataSources: z.array(DataSourceSchema),
  documents: z.array(StoredDocumentSchema),
});
export type Catalog = z.infer<typeof CatalogSchema>;

export function emptyCatalog(): Catalog {
  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    agents: [],
    skills: [],
    tools: [],
    dataSources: [],
    documents: [],
  };
}

/** Replace by id if present, otherwise append. Keeps a re-import idempotent. */
export function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const at = list.findIndex((entry) => entry.id === item.id);
  if (at === -1) return [...list, item];
  return list.map((entry, index) => (index === at ? item : entry));
}

export function upsertManyById<T extends { id: string }>(list: T[], items: T[]): T[] {
  return items.reduce(upsertById, list);
}

/**
 * Which library items a set of agents depends on.
 *
 * Takes the three libraries structurally rather than a `Catalog`, because a fleet
 * carries exactly the same three and the question is the same one in both
 * directions: pulling an agent out of a fleet needs its parts just as putting one
 * into a fleet does.
 */
export function dependenciesOf(
  source: { skills: Skill[]; tools: Tool[]; dataSources: DataSource[] },
  agents: { skillIds: string[]; toolIds: string[]; dataSourceIds: string[] }[],
): { skills: Skill[]; tools: Tool[]; dataSources: DataSource[] } {
  const skillIds = new Set(agents.flatMap((a) => a.skillIds));
  const toolIds = new Set(agents.flatMap((a) => a.toolIds));
  const dataIds = new Set(agents.flatMap((a) => a.dataSourceIds));

  return {
    skills: source.skills.filter((s) => skillIds.has(s.id)),
    tools: source.tools.filter((t) => toolIds.has(t.id)),
    dataSources: source.dataSources.filter((d) => dataIds.has(d.id)),
  };
}

/**
 * Copy a catalog agent into a fleet, bringing whatever it references with it.
 *
 * `source` is dropped: a fleet holds plain SPEC 4 agents, and provenance belongs
 * to the catalog. The caller decides the kind, because a fleet needs exactly one
 * orchestrator and the catalog does not model hierarchy at all.
 */
export function instantiateIntoFleet(
  fleet: Fleet,
  catalog: Catalog,
  catalogAgent: CatalogAgent,
  overrides: Partial<Pick<Agent, 'kind' | 'status' | 'name' | 'role'>> = {},
): Fleet {
  const { source: _source, ...plain } = catalogAgent;
  const dependencies = dependenciesOf(catalog, [catalogAgent]);

  const agent: Agent = { ...plain, ...overrides };

  return {
    ...fleet,
    agents: upsertById(fleet.agents, agent),
    skills: upsertManyById(fleet.skills, dependencies.skills),
    tools: upsertManyById(fleet.tools, dependencies.tools),
    dataSources: upsertManyById(fleet.dataSources, dependencies.dataSources),
  };
}

/** One-line summary of what a catalog agent carries, for the list row. */
export function describeCatalogAgent(agent: CatalogAgent): string {
  const counts = [
    [agent.skillIds.length, 'skill'],
    [agent.toolIds.length, 'tool'],
    [agent.dataSourceIds.length, 'data source'],
  ] as const;

  const parts = counts
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}${count === 1 ? '' : 's'}`);

  return parts.length === 0 ? 'nothing attached yet' : parts.join(' · ');
}
