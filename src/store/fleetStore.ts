/**
 * SPEC 2.1 - "One store, many renderers." The fleet lives here as view-agnostic data;
 * the 2D board and the 3D scene are subscribers. No view owns data.
 *
 * SPEC 8.1 - every mutation below is undoable: zundo wraps the data slice, so
 * Ctrl+Z / Ctrl+Y work without any action having to opt in.
 *
 * View state (focus, selection, filter, search) deliberately does NOT live here -
 * it belongs to Phase 1's UI store and must stay out of the undo history.
 */
import { create } from 'zustand';
import { temporal } from 'zundo';
import { ID_PREFIX, newId } from '../model/ids.js';
import {
  AgentSchema,
  DataSourceSchema,
  SkillSchema,
  ToolSchema,
} from '../model/schemas.js';
import type {
  Agent,
  AgentKind,
  DataSource,
  Edge,
  EdgeKind,
  Fleet,
  LibraryKind,
  ModelConfig,
  Position,
  Skill,
  Status,
  Tool,
} from '../model/schemas.js';
import { formatZodError, migrateFleetDocument } from '../model/migrations.js';
import { agentsUsing, descendantIds, isShared, parentsOf } from '../model/selectors.js';
import { fleetFromTemplate } from '../model/templates.js';
import type { FleetTemplate } from '../model/templates.js';
import { parseFleetJson } from './io.js';

// ---------- action results ----------

export type ActionFail = { ok: false; reason: string; blockedBy?: string[] };
export type ActionResult = { ok: true } | ActionFail;
export type CreateResult = { ok: true; id: string } | ActionFail;

const OK: ActionResult = { ok: true };
const fail = (reason: string, blockedBy?: string[]): ActionFail =>
  blockedBy === undefined ? { ok: false, reason } : { ok: false, reason, blockedBy };

// ---------- inputs ----------

export type NewAgentInput = {
  /** SPEC 5.8 creation friction rule: name + role and nothing else is required. */
  name: string;
  role: string;
  kind?: AgentKind;
  /** When given, the agent is wired under this parent with a hierarchy edge. */
  parentId?: string;
  status?: Status;
};

export type AgentPatch = {
  name?: string;
  role?: string;
  kind?: AgentKind;
  status?: Status;
  instructions?: string;
  model?: ModelConfig;
};

export type EdgePatch = {
  kind?: EdgeKind;
  status?: Status;
  label?: string;
};

/** Everything the UI needs to warn before deleting an agent (SPEC 5.8). */
export type AgentDeletionPreview = {
  agentId: string;
  agentName: string;
  shared: boolean;
  /** Names of the hierarchy parents a shared agent will disappear from. */
  parentNames: string[];
  edgeCount: number;
  /** Children whose only hierarchy parent is this agent. */
  orphanedChildIds: string[];
};

export type FleetStoreState = {
  fleets: Record<string, Fleet>;
  /** Display order of the fleet switcher (SPEC 5.11). */
  fleetOrder: string[];
  activeFleetId: string | null;

  // --- fleets (SPEC 5.11) ---
  createFleet: (template: FleetTemplate, name?: string) => string;
  renameFleet: (fleetId: string, name: string) => ActionResult;
  duplicateFleet: (fleetId: string) => CreateResult;
  deleteFleet: (fleetId: string) => ActionResult;
  setActiveFleet: (fleetId: string) => ActionResult;
  importFleetFromJson: (text: string) => { ok: true; id: string } | { ok: false; errors: string[] };
  /** Load an in-memory fleet (the shipped Solarlux example, SPEC 5.11). */
  importFleetObject: (fleet: Fleet) => { ok: true; id: string } | { ok: false; errors: string[] };

  // --- agents (SPEC 5.8) ---
  addAgent: (input: NewAgentInput) => CreateResult;
  renameAgent: (agentId: string, name: string) => ActionResult;
  updateAgent: (agentId: string, patch: AgentPatch) => ActionResult;
  deleteAgent: (agentId: string) => ActionResult;
  previewAgentDeletion: (agentId: string) => AgentDeletionPreview | null;
  setAgentPosition: (agentId: string, position: Position) => ActionResult;
  /** SPEC 5.8 auto-arrange: drop manual overrides so layout can own positions again. */
  clearAgentPositions: () => ActionResult;

  // --- edges (SPEC 5.8, 8.5) ---
  linkAgents: (sourceId: string, targetId: string, kind: EdgeKind) => CreateResult;
  unlinkEdge: (edgeId: string) => ActionResult;
  updateEdge: (edgeId: string, patch: EdgePatch) => ActionResult;

  // --- libraries (SPEC 8.7) ---
  addSkill: (input: Omit<Skill, 'id'>) => CreateResult;
  updateSkill: (skillId: string, patch: Partial<Omit<Skill, 'id'>>) => ActionResult;
  deleteSkill: (skillId: string) => ActionResult;
  addTool: (input: Omit<Tool, 'id'>) => CreateResult;
  updateTool: (toolId: string, patch: Partial<Omit<Tool, 'id'>>) => ActionResult;
  deleteTool: (toolId: string) => ActionResult;
  addDataSource: (input: Omit<DataSource, 'id'>) => CreateResult;
  updateDataSource: (dataSourceId: string, patch: Partial<Omit<DataSource, 'id'>>) => ActionResult;
  deleteDataSource: (dataSourceId: string) => ActionResult;
  attachLibraryItem: (agentId: string, kind: LibraryKind, itemId: string) => ActionResult;
  detachLibraryItem: (agentId: string, kind: LibraryKind, itemId: string) => ActionResult;
};

const LIBRARY_FIELD = {
  skill: 'skillIds',
  tool: 'toolIds',
  dataSource: 'dataSourceIds',
} as const satisfies Record<LibraryKind, 'skillIds' | 'toolIds' | 'dataSourceIds'>;

const LIBRARY_COLLECTION = {
  skill: 'skills',
  tool: 'tools',
  dataSource: 'dataSources',
} as const satisfies Record<LibraryKind, 'skills' | 'tools' | 'dataSources'>;

const LIBRARY_LABEL: Record<LibraryKind, string> = {
  skill: 'skill',
  tool: 'tool',
  dataSource: 'data source',
};

function replaceAgent(fleet: Fleet, agentId: string, update: (agent: Agent) => Agent): Fleet {
  return { ...fleet, agents: fleet.agents.map((a) => (a.id === agentId ? update(a) : a)) };
}

export const useFleetStore = create<FleetStoreState>()(
  temporal(
    (set, get) => {
      /** Run `mutate` on the active fleet; every data change funnels through here. */
      const mutateActive = (mutate: (fleet: Fleet) => Fleet | ActionFail): ActionResult => {
        const { activeFleetId, fleets } = get();
        if (activeFleetId === null) return fail('No active fleet.');
        const fleet = fleets[activeFleetId];
        if (!fleet) return fail('No active fleet.');

        const next = mutate(fleet);
        if ('ok' in next) return next;

        set({ fleets: { ...fleets, [activeFleetId]: next } });
        return OK;
      };

      const activeFleet = (): Fleet | undefined => {
        const { activeFleetId, fleets } = get();
        return activeFleetId === null ? undefined : fleets[activeFleetId];
      };

      const insertFleet = (fleet: Fleet): string => {
        set((state) => ({
          fleets: { ...state.fleets, [fleet.id]: fleet },
          fleetOrder: state.fleetOrder.includes(fleet.id)
            ? state.fleetOrder
            : [...state.fleetOrder, fleet.id],
          activeFleetId: fleet.id,
        }));
        return fleet.id;
      };

      const addLibraryItem = <K extends LibraryKind>(
        kind: K,
        item: Skill | Tool | DataSource,
      ): CreateResult => {
        const collection = LIBRARY_COLLECTION[kind];
        const result = mutateActive((fleet) => ({
          ...fleet,
          [collection]: [...fleet[collection], item],
        }));
        return result.ok ? { ok: true, id: item.id } : result;
      };

      const deleteLibraryItem = (kind: LibraryKind, itemId: string): ActionResult => {
        const fleet = activeFleet();
        if (!fleet) return fail('No active fleet.');

        // SPEC 5.8: deleting a library item is blocked while in use - show the usage list.
        const users = agentsUsing(fleet, kind, itemId);
        if (users.length > 0) {
          return fail(
            `This ${LIBRARY_LABEL[kind]} is still used by ${users.length} agent(s).`,
            users.map((a) => a.name),
          );
        }

        const collection = LIBRARY_COLLECTION[kind];
        if (!fleet[collection].some((entry) => entry.id === itemId)) {
          return fail(`Unknown ${LIBRARY_LABEL[kind]} "${itemId}".`);
        }

        return mutateActive((current) => ({
          ...current,
          [collection]: current[collection].filter((entry) => entry.id !== itemId),
        }));
      };

      return {
        fleets: {},
        fleetOrder: [],
        activeFleetId: null,

        // ---------- fleets ----------

        createFleet: (template, name) => insertFleet(fleetFromTemplate(template, name)),

        renameFleet: (fleetId, name) => {
          const trimmed = name.trim();
          if (trimmed === '') return fail('Fleet name must not be empty.');
          const fleet = get().fleets[fleetId];
          if (!fleet) return fail(`Unknown fleet "${fleetId}".`);
          set((state) => ({ fleets: { ...state.fleets, [fleetId]: { ...fleet, name: trimmed } } }));
          return OK;
        },

        duplicateFleet: (fleetId) => {
          const fleet = get().fleets[fleetId];
          if (!fleet) return fail(`Unknown fleet "${fleetId}".`);
          // Agent/edge ids are scoped to their fleet, so the copy keeps them.
          const copy: Fleet = {
            ...structuredClone(fleet),
            id: newId(ID_PREFIX.fleet),
            name: `${fleet.name} (copy)`,
          };
          return { ok: true, id: insertFleet(copy) };
        },

        deleteFleet: (fleetId) => {
          const { fleets, fleetOrder, activeFleetId } = get();
          if (!fleets[fleetId]) return fail(`Unknown fleet "${fleetId}".`);

          const remaining = { ...fleets };
          delete remaining[fleetId];
          const nextOrder = fleetOrder.filter((id) => id !== fleetId);

          set({
            fleets: remaining,
            fleetOrder: nextOrder,
            activeFleetId: activeFleetId === fleetId ? (nextOrder[0] ?? null) : activeFleetId,
          });
          return OK;
        },

        setActiveFleet: (fleetId) => {
          if (!get().fleets[fleetId]) return fail(`Unknown fleet "${fleetId}".`);
          set({ activeFleetId: fleetId });
          return OK;
        },

        importFleetFromJson: (text) => {
          const parsed = parseFleetJson(text);
          if (!parsed.ok) return parsed;
          return get().importFleetObject(parsed.fleet);
        },

        importFleetObject: (candidate) => {
          const parsed = migrateFleetDocument(candidate);
          if (!parsed.ok) return parsed;

          // A second fleet with the same id would collide in the switcher and in IndexedDB.
          const fleet = get().fleets[parsed.fleet.id]
            ? { ...parsed.fleet, id: newId(ID_PREFIX.fleet) }
            : parsed.fleet;

          return { ok: true, id: insertFleet(fleet) };
        },

        // ---------- agents ----------

        addAgent: (input) => {
          const name = input.name.trim();
          if (name === '') return fail('Agent name must not be empty.');

          const fleet = activeFleet();
          if (!fleet) return fail('No active fleet.');

          const kind: AgentKind = input.kind ?? 'worker';
          if (kind === 'orchestrator' && fleet.agents.some((a) => a.kind === 'orchestrator')) {
            return fail('This fleet already has an orchestrator (SPEC 4: exactly one).');
          }
          if (input.parentId !== undefined && !fleet.agents.some((a) => a.id === input.parentId)) {
            return fail(`Unknown parent agent "${input.parentId}".`);
          }

          const agent: Agent = {
            id: newId(ID_PREFIX.agent),
            kind,
            name,
            role: input.role.trim(),
            // SPEC 5.6: new agents and their edges default to Planned.
            status: input.status ?? 'planned',
            skillIds: [],
            toolIds: [],
            dataSourceIds: [],
          };

          const parentId = input.parentId;
          const edge: Edge | undefined =
            parentId === undefined
              ? undefined
              : {
                  id: newId(ID_PREFIX.edge),
                  source: parentId,
                  target: agent.id,
                  kind: 'hierarchy',
                  status: 'planned',
                };

          const result = mutateActive((current) => ({
            ...current,
            agents: [...current.agents, agent],
            edges: edge ? [...current.edges, edge] : current.edges,
          }));

          return result.ok ? { ok: true, id: agent.id } : result;
        },

        renameAgent: (agentId, name) => {
          const trimmed = name.trim();
          if (trimmed === '') return fail('Agent name must not be empty.');
          return mutateActive((fleet) => {
            if (!fleet.agents.some((a) => a.id === agentId)) return fail(`Unknown agent "${agentId}".`);
            return replaceAgent(fleet, agentId, (agent) => ({ ...agent, name: trimmed }));
          });
        },

        updateAgent: (agentId, patch) =>
          mutateActive((fleet) => {
            const agent = fleet.agents.find((a) => a.id === agentId);
            if (!agent) return fail(`Unknown agent "${agentId}".`);

            if (patch.name !== undefined && patch.name.trim() === '') {
              return fail('Agent name must not be empty.');
            }
            if (
              patch.kind === 'orchestrator' &&
              agent.kind !== 'orchestrator' &&
              fleet.agents.some((a) => a.kind === 'orchestrator')
            ) {
              return fail('This fleet already has an orchestrator (SPEC 4: exactly one).');
            }
            if (
              agent.kind === 'orchestrator' &&
              patch.kind !== undefined &&
              patch.kind !== 'orchestrator'
            ) {
              return fail('A fleet needs exactly one orchestrator - promote another agent first.');
            }

            const next: Agent = {
              ...agent,
              ...patch,
              ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
              ...(patch.role === undefined ? {} : { role: patch.role.trim() }),
            };

            const validated = AgentSchema.safeParse(next);
            if (!validated.success) return fail(formatZodError(validated.error).join('; '));

            return replaceAgent(fleet, agentId, () => validated.data);
          }),

        deleteAgent: (agentId) =>
          mutateActive((fleet) => {
            const target = fleet.agents.find((a) => a.id === agentId);
            if (!target) return fail(`Unknown agent "${agentId}".`);
            if (fleet.agents.length === 1) {
              return fail('A fleet needs at least one agent - delete the fleet instead.');
            }
            // SPEC 4: a fleet has exactly one orchestrator, so it cannot be deleted away.
            if (target.kind === 'orchestrator') {
              return fail('A fleet needs exactly one orchestrator - promote another agent first.');
            }
            // SPEC 5.8: "delete agents (removes their edges)".
            return {
              ...fleet,
              agents: fleet.agents.filter((a) => a.id !== agentId),
              edges: fleet.edges.filter((e) => e.source !== agentId && e.target !== agentId),
            };
          }),

        previewAgentDeletion: (agentId) => {
          const fleet = activeFleet();
          if (!fleet) return null;
          const agent = fleet.agents.find((a) => a.id === agentId);
          if (!agent) return null;

          const orphanedChildIds = fleet.edges
            .filter((e) => e.kind === 'hierarchy' && e.source === agentId)
            .map((e) => e.target)
            .filter((childId) => {
              const otherParents = fleet.edges.filter(
                (e) => e.kind === 'hierarchy' && e.target === childId && e.source !== agentId,
              );
              return otherParents.length === 0;
            });

          return {
            agentId,
            agentName: agent.name,
            shared: isShared(fleet, agentId),
            parentNames: parentsOf(fleet, agentId).map((p) => p.name),
            edgeCount: fleet.edges.filter((e) => e.source === agentId || e.target === agentId).length,
            orphanedChildIds: [...new Set(orphanedChildIds)],
          };
        },

        setAgentPosition: (agentId, position) =>
          mutateActive((fleet) => {
            if (!fleet.agents.some((a) => a.id === agentId)) return fail(`Unknown agent "${agentId}".`);
            return replaceAgent(fleet, agentId, (agent) => ({ ...agent, position }));
          }),

        clearAgentPositions: () =>
          mutateActive((fleet) => ({
            ...fleet,
            agents: fleet.agents.map(({ position: _dropped, ...rest }) => rest),
          })),

        // ---------- edges ----------

        linkAgents: (sourceId, targetId, kind) => {
          const fleet = activeFleet();
          if (!fleet) return fail('No active fleet.');
          if (sourceId === targetId) return fail('An agent cannot be linked to itself.');
          if (!fleet.agents.some((a) => a.id === sourceId)) return fail(`Unknown agent "${sourceId}".`);
          if (!fleet.agents.some((a) => a.id === targetId)) return fail(`Unknown agent "${targetId}".`);

          const duplicate = fleet.edges.some(
            (e) =>
              e.kind === kind &&
              ((e.source === sourceId && e.target === targetId) ||
                (kind === 'peer' && e.source === targetId && e.target === sourceId)),
          );
          if (duplicate) return fail('These agents are already linked that way.');

          // SPEC 4: the hierarchy is a DAG - adding source->target must not close a loop.
          if (kind === 'hierarchy' && descendantIds(fleet, targetId).has(sourceId)) {
            return fail('That link would create a hierarchy cycle.');
          }

          const edge: Edge = {
            id: newId(ID_PREFIX.edge),
            source: sourceId,
            target: targetId,
            kind,
            status: 'planned',
          };

          const result = mutateActive((current) => ({ ...current, edges: [...current.edges, edge] }));
          return result.ok ? { ok: true, id: edge.id } : result;
        },

        unlinkEdge: (edgeId) =>
          mutateActive((fleet) => {
            const edge = fleet.edges.find((e) => e.id === edgeId);
            if (!edge) return fail(`Unknown link "${edgeId}".`);

            if (edge.kind === 'hierarchy') {
              const remainingParents = fleet.edges.filter(
                (e) => e.kind === 'hierarchy' && e.target === edge.target && e.id !== edgeId,
              );
              // SPEC 5.8: removing the last hierarchy parent is blocked - no orphan nodes.
              if (remainingParents.length === 0) {
                const child = fleet.agents.find((a) => a.id === edge.target);
                return fail(
                  `"${child?.name ?? edge.target}" would be left without a parent. Delete the agent instead.`,
                );
              }
            }

            return { ...fleet, edges: fleet.edges.filter((e) => e.id !== edgeId) };
          }),

        updateEdge: (edgeId, patch) =>
          mutateActive((fleet) => {
            const edge = fleet.edges.find((e) => e.id === edgeId);
            if (!edge) return fail(`Unknown link "${edgeId}".`);

            // Demoting the last hierarchy link to a peer link orphans the child (SPEC 5.8).
            if (patch.kind === 'peer' && edge.kind === 'hierarchy') {
              const remainingParents = fleet.edges.filter(
                (e) => e.kind === 'hierarchy' && e.target === edge.target && e.id !== edgeId,
              );
              if (remainingParents.length === 0) {
                const child = fleet.agents.find((a) => a.id === edge.target);
                return fail(
                  `"${child?.name ?? edge.target}" would be left without a parent. Link it elsewhere first.`,
                );
              }
            }
            if (patch.kind === 'hierarchy' && edge.kind === 'peer') {
              if (descendantIds(fleet, edge.target).has(edge.source)) {
                return fail('That change would create a hierarchy cycle.');
              }
            }

            return { ...fleet, edges: fleet.edges.map((e) => (e.id === edgeId ? { ...e, ...patch } : e)) };
          }),

        // ---------- libraries ----------

        addSkill: (input) => {
          const parsed = SkillSchema.safeParse({ ...input, id: newId(ID_PREFIX.skill) });
          if (!parsed.success) return fail(formatZodError(parsed.error).join('; '));
          return addLibraryItem('skill', parsed.data);
        },

        updateSkill: (skillId, patch) =>
          mutateActive((fleet) => {
            const skill = fleet.skills.find((s) => s.id === skillId);
            if (!skill) return fail(`Unknown skill "${skillId}".`);
            const parsed = SkillSchema.safeParse({ ...skill, ...patch });
            if (!parsed.success) return fail(formatZodError(parsed.error).join('; '));
            return { ...fleet, skills: fleet.skills.map((s) => (s.id === skillId ? parsed.data : s)) };
          }),

        deleteSkill: (skillId) => deleteLibraryItem('skill', skillId),

        addTool: (input) => {
          const parsed = ToolSchema.safeParse({ ...input, id: newId(ID_PREFIX.tool) });
          if (!parsed.success) return fail(formatZodError(parsed.error).join('; '));
          return addLibraryItem('tool', parsed.data);
        },

        updateTool: (toolId, patch) =>
          mutateActive((fleet) => {
            const tool = fleet.tools.find((t) => t.id === toolId);
            if (!tool) return fail(`Unknown tool "${toolId}".`);
            const parsed = ToolSchema.safeParse({ ...tool, ...patch });
            if (!parsed.success) return fail(formatZodError(parsed.error).join('; '));
            return { ...fleet, tools: fleet.tools.map((t) => (t.id === toolId ? parsed.data : t)) };
          }),

        deleteTool: (toolId) => deleteLibraryItem('tool', toolId),

        addDataSource: (input) => {
          const parsed = DataSourceSchema.safeParse({ ...input, id: newId(ID_PREFIX.dataSource) });
          if (!parsed.success) return fail(formatZodError(parsed.error).join('; '));
          return addLibraryItem('dataSource', parsed.data);
        },

        updateDataSource: (dataSourceId, patch) =>
          mutateActive((fleet) => {
            const source = fleet.dataSources.find((d) => d.id === dataSourceId);
            if (!source) return fail(`Unknown data source "${dataSourceId}".`);
            const parsed = DataSourceSchema.safeParse({ ...source, ...patch });
            if (!parsed.success) return fail(formatZodError(parsed.error).join('; '));
            return {
              ...fleet,
              dataSources: fleet.dataSources.map((d) => (d.id === dataSourceId ? parsed.data : d)),
            };
          }),

        deleteDataSource: (dataSourceId) => deleteLibraryItem('dataSource', dataSourceId),

        attachLibraryItem: (agentId, kind, itemId) =>
          mutateActive((fleet) => {
            const agent = fleet.agents.find((a) => a.id === agentId);
            if (!agent) return fail(`Unknown agent "${agentId}".`);
            if (!fleet[LIBRARY_COLLECTION[kind]].some((entry) => entry.id === itemId)) {
              return fail(`Unknown ${LIBRARY_LABEL[kind]} "${itemId}".`);
            }

            const field = LIBRARY_FIELD[kind];
            if (agent[field].includes(itemId)) return fail(`Already attached to "${agent.name}".`);

            return replaceAgent(fleet, agentId, (current) => ({
              ...current,
              [field]: [...current[field], itemId],
            }));
          }),

        detachLibraryItem: (agentId, kind, itemId) =>
          mutateActive((fleet) => {
            const agent = fleet.agents.find((a) => a.id === agentId);
            if (!agent) return fail(`Unknown agent "${agentId}".`);

            const field = LIBRARY_FIELD[kind];
            if (!agent[field].includes(itemId)) return fail(`Not attached to "${agent.name}".`);

            return replaceAgent(fleet, agentId, (current) => ({
              ...current,
              [field]: current[field].filter((entry) => entry !== itemId),
            }));
          }),
      };
    },
    {
      limit: 100,
      // Only the data slice is undoable; actions and (later) view state are not.
      partialize: (state) => ({
        fleets: state.fleets,
        fleetOrder: state.fleetOrder,
        activeFleetId: state.activeFleetId,
      }),
    },
  ),
);

// ---------- selectors over the store ----------

export function selectActiveFleet(state: FleetStoreState): Fleet | undefined {
  return state.activeFleetId === null ? undefined : state.fleets[state.activeFleetId];
}

export function selectFleetList(state: FleetStoreState): Fleet[] {
  return state.fleetOrder
    .map((id) => state.fleets[id])
    .filter((fleet): fleet is Fleet => fleet !== undefined);
}

// ---------- history (SPEC 8.1) ----------

export const undo = (steps = 1): void => useFleetStore.temporal.getState().undo(steps);
export const redo = (steps = 1): void => useFleetStore.temporal.getState().redo(steps);
export const canUndo = (): boolean => useFleetStore.temporal.getState().pastStates.length > 0;
export const canRedo = (): boolean => useFleetStore.temporal.getState().futureStates.length > 0;
export const clearHistory = (): void => useFleetStore.temporal.getState().clear();

/**
 * Load persisted fleets without writing an undo entry - restoring yesterday's work
 * must not be undoable into an empty app.
 */
export function hydrateFleetStore(loaded: { fleets: Fleet[]; activeFleetId: string | null }): void {
  const history = useFleetStore.temporal.getState();
  history.pause();

  const fleets: Record<string, Fleet> = {};
  for (const fleet of loaded.fleets) fleets[fleet.id] = fleet;
  const fleetOrder = loaded.fleets.map((f) => f.id);

  useFleetStore.setState({
    fleets,
    fleetOrder,
    activeFleetId:
      loaded.activeFleetId !== null && fleets[loaded.activeFleetId] ? loaded.activeFleetId : (fleetOrder[0] ?? null),
  });

  history.resume();
  history.clear();
}

/** Test helper: back to a pristine, history-free store. */
export function resetFleetStore(): void {
  hydrateFleetStore({ fleets: [], activeFleetId: null });
}
