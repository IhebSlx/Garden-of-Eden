/**
 * The catalog store: agents, skills, tools and data sources you build up once and
 * draw on from any fleet, plus the original files they were imported from.
 *
 * Deliberately NOT part of `fleetStore`: the catalog is not fleet data, so it must
 * not enter the fleet's undo history (SPEC 2) and must not travel inside an
 * exported fleet document (SPEC 7).
 */
import { create } from 'zustand';
import { ID_PREFIX, newId } from '../model/ids.js';
import { CatalogAgentSchema, emptyCatalog, upsertById, upsertManyById } from '../model/catalog.js';
import type { Catalog, CatalogAgent, StoredDocument } from '../model/catalog.js';
import { DataSourceSchema, SkillSchema, ToolSchema } from '../model/schemas.js';
import type { DataSource, Skill, Tool } from '../model/schemas.js';
import { formatZodError } from '../model/migrations.js';
import { parseCopilotAgent } from '../model/copilotImport.js';

export type CatalogFail = { ok: false; reason: string };
export type CatalogCreate = { ok: true; id: string } | CatalogFail;
export type CatalogResult = { ok: true } | CatalogFail;

export type ImportOutcome =
  | { ok: true; agentId: string; agentName: string; warnings: string[]; counts: { skills: number; tools: number; dataSources: number } }
  | { ok: false; errors: string[] };

export type NewCatalogAgent = {
  name: string;
  role?: string;
  instructions?: string;
  provider?: string;
  modelName?: string;
};

export type CatalogState = {
  catalog: Catalog;

  hydrate: (catalog: Catalog) => void;
  /**
   * Fold a restored catalog into this one, by id.
   *
   * Merge rather than replace: an import must never silently remove a catalog
   * agent that simply was not in the file. Same id means the same thing, so the
   * incoming copy wins — that is what makes restoring the same backup twice
   * land in the same place.
   */
  mergeCatalog: (catalog: Catalog) => void;
  /**
   * Take a copy of something that already exists in a fleet.
   *
   * Ids are kept, which is the whole point: the catalog copy and the fleet copy
   * are the same thing seen twice, so adding it back to that fleet updates rather
   * than duplicates. Adopting an agent brings the skills, tools and data it
   * references, or the catalog would hold an agent whose parts are missing.
   */
  adoptFromFleet: (items: {
    agents?: CatalogAgent[];
    skills?: Skill[];
    tools?: Tool[];
    dataSources?: DataSource[];
  }) => void;

  /** Create an agent by hand, with no fleet involved. */
  addAgent: (input: NewCatalogAgent) => CatalogCreate;
  updateAgent: (agentId: string, patch: Partial<Omit<CatalogAgent, 'id'>>) => CatalogResult;
  deleteAgent: (agentId: string) => CatalogResult;
  attachToAgent: (agentId: string, kind: 'skill' | 'tool' | 'dataSource', itemId: string) => CatalogResult;
  detachFromAgent: (agentId: string, kind: 'skill' | 'tool' | 'dataSource', itemId: string) => CatalogResult;

  addSkill: (input: Omit<Skill, 'id'>) => CatalogCreate;
  updateSkill: (id: string, patch: Partial<Omit<Skill, 'id'>>) => CatalogResult;
  deleteSkill: (id: string) => CatalogResult;

  addTool: (input: Omit<Tool, 'id'>) => CatalogCreate;
  updateTool: (id: string, patch: Partial<Omit<Tool, 'id'>>) => CatalogResult;
  deleteTool: (id: string) => CatalogResult;

  addDataSource: (input: Omit<DataSource, 'id'>) => CatalogCreate;
  updateDataSource: (id: string, patch: Partial<Omit<DataSource, 'id'>>) => CatalogResult;
  deleteDataSource: (id: string) => CatalogResult;

  /** Import a Copilot Studio YAML export, keeping the file for download. */
  importCopilotYaml: (text: string, fileName: string) => ImportOutcome;
  documentFor: (agentId: string) => StoredDocument | undefined;
};

const fail = (reason: string): CatalogFail => ({ ok: false, reason });

const FIELD = {
  skill: 'skillIds',
  tool: 'toolIds',
  dataSource: 'dataSourceIds',
} as const;

const COLLECTION = {
  skill: 'skills',
  tool: 'tools',
  dataSource: 'dataSources',
} as const;

export const useCatalogStore = create<CatalogState>()((set, get) => {
  const patchCatalog = (mutate: (catalog: Catalog) => Catalog): void => {
    set({ catalog: mutate(get().catalog) });
  };

  const usageOf = (kind: keyof typeof FIELD, itemId: string): CatalogAgent[] =>
    get().catalog.agents.filter((agent) => agent[FIELD[kind]].includes(itemId));

  const removeItem = (kind: keyof typeof FIELD, itemId: string): CatalogResult => {
    const users = usageOf(kind, itemId);
    if (users.length > 0) {
      return fail(`Still used by ${users.map((a) => a.name).join(', ')}. Detach it there first.`);
    }
    const collection = COLLECTION[kind];
    patchCatalog((catalog) => ({
      ...catalog,
      [collection]: catalog[collection].filter((entry) => entry.id !== itemId),
    }));
    return { ok: true };
  };

  return {
    catalog: emptyCatalog(),

    hydrate: (catalog) => set({ catalog }),

    adoptFromFleet: (items) =>
      patchCatalog((catalog) => ({
        ...catalog,
        // A fleet agent has no `source`, which is right: it was not imported from
        // a file, so there is no file to hand back.
        agents: upsertManyById(catalog.agents, items.agents ?? []),
        skills: upsertManyById(catalog.skills, items.skills ?? []),
        tools: upsertManyById(catalog.tools, items.tools ?? []),
        dataSources: upsertManyById(catalog.dataSources, items.dataSources ?? []),
      })),

    mergeCatalog: (incoming) =>
      patchCatalog((catalog) => ({
        schemaVersion: catalog.schemaVersion,
        agents: upsertManyById(catalog.agents, incoming.agents),
        skills: upsertManyById(catalog.skills, incoming.skills),
        tools: upsertManyById(catalog.tools, incoming.tools),
        dataSources: upsertManyById(catalog.dataSources, incoming.dataSources),
        // One document per agent, so the newer upload replaces the older.
        documents: [
          ...catalog.documents.filter(
            (kept) => !incoming.documents.some((one) => one.agentId === kept.agentId),
          ),
          ...incoming.documents,
        ],
      })),

    addAgent: (input) => {
      const name = input.name.trim();
      if (name === '') return fail('An agent needs a name.');

      const model =
        input.provider?.trim() && input.modelName?.trim()
          ? { provider: input.provider.trim(), name: input.modelName.trim() }
          : undefined;

      const candidate = {
        id: newId(ID_PREFIX.agent),
        kind: 'department' as const,
        name,
        role: input.role?.trim() ?? '',
        status: 'planned' as const,
        ...(input.instructions?.trim() ? { instructions: input.instructions.trim() } : {}),
        ...(model ? { model } : {}),
        skillIds: [],
        toolIds: [],
        dataSourceIds: [],
      };

      const parsed = CatalogAgentSchema.safeParse(candidate);
      if (!parsed.success) return fail(formatZodError(parsed.error).join('; '));

      patchCatalog((catalog) => ({ ...catalog, agents: [...catalog.agents, parsed.data] }));
      return { ok: true, id: parsed.data.id };
    },

    updateAgent: (agentId, patch) => {
      const existing = get().catalog.agents.find((a) => a.id === agentId);
      if (!existing) return fail('That agent is not in the catalog.');
      const parsed = CatalogAgentSchema.safeParse({ ...existing, ...patch });
      if (!parsed.success) return fail(formatZodError(parsed.error).join('; '));
      patchCatalog((catalog) => ({ ...catalog, agents: upsertById(catalog.agents, parsed.data) }));
      return { ok: true };
    },

    deleteAgent: (agentId) => {
      if (!get().catalog.agents.some((a) => a.id === agentId)) return fail('That agent is not in the catalog.');
      patchCatalog((catalog) => ({
        ...catalog,
        agents: catalog.agents.filter((a) => a.id !== agentId),
        // The uploaded file belongs to the agent; it goes with it.
        documents: catalog.documents.filter((d) => d.agentId !== agentId),
      }));
      return { ok: true };
    },

    attachToAgent: (agentId, kind, itemId) => {
      const agent = get().catalog.agents.find((a) => a.id === agentId);
      if (!agent) return fail('That agent is not in the catalog.');
      if (!get().catalog[COLLECTION[kind]].some((entry) => entry.id === itemId)) {
        return fail('That library item is not in the catalog.');
      }
      const field = FIELD[kind];
      if (agent[field].includes(itemId)) return fail(`Already attached to ${agent.name}.`);

      patchCatalog((catalog) => ({
        ...catalog,
        agents: upsertById(catalog.agents, { ...agent, [field]: [...agent[field], itemId] }),
      }));
      return { ok: true };
    },

    detachFromAgent: (agentId, kind, itemId) => {
      const agent = get().catalog.agents.find((a) => a.id === agentId);
      if (!agent) return fail('That agent is not in the catalog.');
      const field = FIELD[kind];
      if (!agent[field].includes(itemId)) return fail(`Not attached to ${agent.name}.`);

      patchCatalog((catalog) => ({
        ...catalog,
        agents: upsertById(catalog.agents, {
          ...agent,
          [field]: agent[field].filter((entry) => entry !== itemId),
        }),
      }));
      return { ok: true };
    },

    addSkill: (input) => {
      const parsed = SkillSchema.safeParse({ ...input, id: newId(ID_PREFIX.skill) });
      if (!parsed.success) return fail(formatZodError(parsed.error).join('; '));
      patchCatalog((catalog) => ({ ...catalog, skills: [...catalog.skills, parsed.data] }));
      return { ok: true, id: parsed.data.id };
    },

    updateSkill: (id, patch) => {
      const existing = get().catalog.skills.find((s) => s.id === id);
      if (!existing) return fail('That skill is not in the catalog.');
      const parsed = SkillSchema.safeParse({ ...existing, ...patch });
      if (!parsed.success) return fail(formatZodError(parsed.error).join('; '));
      patchCatalog((catalog) => ({ ...catalog, skills: upsertById(catalog.skills, parsed.data) }));
      return { ok: true };
    },

    deleteSkill: (id) => removeItem('skill', id),

    addTool: (input) => {
      const parsed = ToolSchema.safeParse({ ...input, id: newId(ID_PREFIX.tool) });
      if (!parsed.success) return fail(formatZodError(parsed.error).join('; '));
      patchCatalog((catalog) => ({ ...catalog, tools: [...catalog.tools, parsed.data] }));
      return { ok: true, id: parsed.data.id };
    },

    updateTool: (id, patch) => {
      const existing = get().catalog.tools.find((t) => t.id === id);
      if (!existing) return fail('That tool is not in the catalog.');
      const parsed = ToolSchema.safeParse({ ...existing, ...patch });
      if (!parsed.success) return fail(formatZodError(parsed.error).join('; '));
      patchCatalog((catalog) => ({ ...catalog, tools: upsertById(catalog.tools, parsed.data) }));
      return { ok: true };
    },

    deleteTool: (id) => removeItem('tool', id),

    addDataSource: (input) => {
      const parsed = DataSourceSchema.safeParse({ ...input, id: newId(ID_PREFIX.dataSource) });
      if (!parsed.success) return fail(formatZodError(parsed.error).join('; '));
      patchCatalog((catalog) => ({ ...catalog, dataSources: [...catalog.dataSources, parsed.data] }));
      return { ok: true, id: parsed.data.id };
    },

    updateDataSource: (id, patch) => {
      const existing = get().catalog.dataSources.find((d) => d.id === id);
      if (!existing) return fail('That data source is not in the catalog.');
      const parsed = DataSourceSchema.safeParse({ ...existing, ...patch });
      if (!parsed.success) return fail(formatZodError(parsed.error).join('; '));
      patchCatalog((catalog) => ({
        ...catalog,
        dataSources: upsertById(catalog.dataSources, parsed.data),
      }));
      return { ok: true };
    },

    deleteDataSource: (id) => removeItem('dataSource', id),

    importCopilotYaml: (text, fileName) => {
      const parsed = parseCopilotAgent(text, fileName);
      if (!parsed.ok) return parsed;

      const { agent, skills, tools, dataSources, warnings, schemaName } = parsed.value;
      const importedAt = new Date().toISOString();

      // Re-importing the same Copilot agent replaces it instead of piling up copies.
      const previous = get().catalog.agents.find(
        (candidate) => schemaName !== undefined && candidate.source?.schemaName === schemaName,
      );
      const id = previous?.id ?? agent.id;

      const catalogAgent: CatalogAgent = {
        ...agent,
        id,
        source: {
          kind: 'copilot-yaml',
          fileName,
          importedAt,
          ...(schemaName === undefined ? {} : { schemaName }),
        },
      };

      const document: StoredDocument = {
        id: newId('doc'),
        agentId: id,
        fileName,
        importedAt,
        // Kept verbatim, so the download is byte-for-byte what was uploaded.
        text,
      };

      patchCatalog((catalog) => ({
        ...catalog,
        agents: upsertById(catalog.agents, catalogAgent),
        skills: upsertManyById(catalog.skills, skills),
        tools: upsertManyById(catalog.tools, tools),
        dataSources: upsertManyById(catalog.dataSources, dataSources),
        documents: [...catalog.documents.filter((d) => d.agentId !== id), document],
      }));

      return {
        ok: true,
        agentId: id,
        agentName: catalogAgent.name,
        warnings: previous ? [`Replaced the earlier import of "${previous.name}".`, ...warnings] : warnings,
        counts: { skills: skills.length, tools: tools.length, dataSources: dataSources.length },
      };
    },

    documentFor: (agentId) => get().catalog.documents.find((d) => d.agentId === agentId),
  };
});
