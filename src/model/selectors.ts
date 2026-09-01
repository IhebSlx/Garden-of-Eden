/**
 * SPEC 4 (derived rules) - pure, never-persisted projections of the fleet.
 * Every function here is total, side-effect free, and safe on an invalid fleet
 * (a cycle or a dangling edge must never hang or crash a renderer).
 *
 * DEVIATION (spec-internal conflict), see report:
 * 4 states instance keys are `agentId@parentId`, but 4 also requires the children of a
 * shared agent to "appear under EVERY instance of the parent". Those cannot both hold:
 * if A is shared under D1 and D2 and A has child C, C must render twice, yet `C@A` names
 * one instance. We therefore key instances by their full hierarchy PATH (unique in all
 * cases) and additionally expose `pairKey` in the 4 `agentId@parentId` form for callers
 * that want to address the (agent, parent) pair. Where no shared agent has children the
 * two are 1:1, so the spec's key survives as an alias.
 */
import type { Agent, Edge, Fleet, LibraryKind } from './schemas.js';

/** Stand-in parent id for root instances in the SPEC 4 `agentId@parentId` key form. */
export const ROOT_PARENT = '__root__';

/** One rendered copy of an agent. Derived; never persisted (SPEC 2.3). */
export type Instance = {
  /** Unique render key: the hierarchy path, percent-encoded and slash-joined. */
  key: string;
  agentId: string;
  /** Hierarchy parent, or null for a root instance. */
  parentId: string | null;
  /** `key` of the parent instance, or null at the root. */
  parentKey: string | null;
  /** SPEC 4 key form. Not unique when an ancestor is shared - see the DEVIATION note. */
  pairKey: string;
  /** Distance from the root instance; 0 = root. Drives node size (SPEC 5.5). */
  depth: number;
  /** Agent ids from the root down to and including this agent. */
  path: string[];
};

/** Precomputed adjacency, shared by the heavier selectors (memoize this in Phase 3). */
export type FleetIndex = {
  agentsById: Map<string, Agent>;
  /** hierarchy children, in edge order */
  childIds: Map<string, string[]>;
  /** hierarchy parents, in edge order */
  parentIds: Map<string, string[]>;
  /** peer neighbours in either direction, in edge order */
  peerIds: Map<string, string[]>;
};

function pushUnique(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (!list) {
    map.set(key, [value]);
  } else if (!list.includes(value)) {
    list.push(value);
  }
}

export function buildFleetIndex(fleet: Fleet): FleetIndex {
  const agentsById = new Map<string, Agent>();
  for (const agent of fleet.agents) agentsById.set(agent.id, agent);

  const childIds = new Map<string, string[]>();
  const parentIds = new Map<string, string[]>();
  const peerIds = new Map<string, string[]>();

  for (const edge of fleet.edges) {
    if (edge.kind === 'hierarchy') {
      pushUnique(childIds, edge.source, edge.target);
      pushUnique(parentIds, edge.target, edge.source);
    } else {
      pushUnique(peerIds, edge.source, edge.target);
      pushUnique(peerIds, edge.target, edge.source);
    }
  }

  return { agentsById, childIds, parentIds, peerIds };
}

// ---------- edges ----------

export function hierarchyEdges(fleet: Fleet): Edge[] {
  return fleet.edges.filter((e) => e.kind === 'hierarchy');
}

export function peerEdges(fleet: Fleet): Edge[] {
  return fleet.edges.filter((e) => e.kind === 'peer');
}

// ---------- adjacency ----------

/** Hierarchy parents of an agent, deduped, in edge order. */
export function parentIdsOf(fleet: Fleet, agentId: string, index = buildFleetIndex(fleet)): string[] {
  return index.parentIds.get(agentId) ?? [];
}

/** Hierarchy children of an agent, deduped, in edge order. */
export function childIdsOf(fleet: Fleet, agentId: string, index = buildFleetIndex(fleet)): string[] {
  return index.childIds.get(agentId) ?? [];
}

/**
 * Peer neighbours in either direction (SPEC 5.7 "Linked to... (same level)").
 * Peers never participate in hierarchy or focus (SPEC 5.2).
 */
export function peerIdsOf(fleet: Fleet, agentId: string, index = buildFleetIndex(fleet)): string[] {
  return index.peerIds.get(agentId) ?? [];
}

/** SPEC 4: an agent is shared iff it has two or more hierarchy parents. */
export function isShared(fleet: Fleet, agentId: string, index = buildFleetIndex(fleet)): boolean {
  return parentIdsOf(fleet, agentId, index).length >= 2;
}

/** The xN in the shared badge (SPEC 5.3) - how many parents the agent serves. */
export function sharedCount(fleet: Fleet, agentId: string, index = buildFleetIndex(fleet)): number {
  return parentIdsOf(fleet, agentId, index).length;
}

/** Parent agents, for the panel's "Shared sub-agent of A, B, C" (SPEC 5.3). */
export function parentsOf(fleet: Fleet, agentId: string, index = buildFleetIndex(fleet)): Agent[] {
  return parentIdsOf(fleet, agentId, index)
    .map((parentId) => index.agentsById.get(parentId))
    .filter((agent): agent is Agent => agent !== undefined);
}

/** Agents with no hierarchy parent - each gets exactly one root instance (SPEC 4). */
export function rootAgentIds(fleet: Fleet, index = buildFleetIndex(fleet)): string[] {
  return fleet.agents.filter((a) => (index.parentIds.get(a.id) ?? []).length === 0).map((a) => a.id);
}

// ---------- instances ----------

function encodePath(path: string[]): string {
  return path.map(encodeURIComponent).join('/');
}

/**
 * SPEC 4: one render instance per (agent, hierarchy-parent) pair; parentless agents get
 * one root instance; the subtree of a shared agent repeats under every one of its instances.
 *
 * Pre-order and deterministic (roots in `fleet.agents` order, children in edge order).
 * Cycle-safe: a hierarchy cycle is cut where it would revisit an agent already on the path.
 */
export function instances(fleet: Fleet, index = buildFleetIndex(fleet)): Instance[] {
  const out: Instance[] = [];
  const seenKeys = new Set<string>();

  const visit = (agentId: string, parent: Instance | null, path: string[]): void => {
    // Cycle guard: never re-enter an agent that is already an ancestor on this path.
    if (path.includes(agentId)) return;

    const nextPath = [...path, agentId];
    const key = encodePath(nextPath);
    if (seenKeys.has(key)) return;
    seenKeys.add(key);

    const instance: Instance = {
      key,
      agentId,
      parentId: parent?.agentId ?? null,
      parentKey: parent?.key ?? null,
      pairKey: `${agentId}@${parent?.agentId ?? ROOT_PARENT}`,
      depth: nextPath.length - 1,
      path: nextPath,
    };
    out.push(instance);

    for (const childId of index.childIds.get(agentId) ?? []) {
      visit(childId, instance, nextPath);
    }
  };

  for (const rootId of rootAgentIds(fleet, index)) visit(rootId, null, []);

  return out;
}

/** All instances of each agent (SPEC 5.3: selecting one copy highlights all). */
export function instancesByAgent(fleet: Fleet, index = buildFleetIndex(fleet)): Map<string, Instance[]> {
  const byAgent = new Map<string, Instance[]>();
  for (const instance of instances(fleet, index)) {
    const list = byAgent.get(instance.agentId);
    if (list) list.push(instance);
    else byAgent.set(instance.agentId, [instance]);
  }
  return byAgent;
}

// ---------- focus ----------

/** Hierarchy descendants of an agent, excluding the agent itself. BFS, cycle-safe. */
export function descendantIds(fleet: Fleet, agentId: string, index = buildFleetIndex(fleet)): Set<string> {
  const found = new Set<string>();
  const queue = [...(index.childIds.get(agentId) ?? [])];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || found.has(current) || current === agentId) continue;
    found.add(current);
    queue.push(...(index.childIds.get(current) ?? []));
  }

  return found;
}

/**
 * SPEC 4 / 5.2: focused agent + all hierarchy descendants (BFS over hierarchy edges).
 * Peer-connected agents are deliberately NOT included - peers never expand focus (SPEC 5.2).
 * A null focus means "nothing focused": the whole fleet is visible.
 */
export function visibleSet(fleet: Fleet, focusId: string | null, index = buildFleetIndex(fleet)): Set<string> {
  if (focusId === null) return new Set(fleet.agents.map((a) => a.id));
  if (!index.agentsById.has(focusId)) return new Set();
  return new Set([focusId, ...descendantIds(fleet, focusId, index)]);
}

/**
 * Shallowest depth of every agent, for hierarchy-scaled node size (SPEC 5.5).
 * A shared agent sitting at two levels takes the shallower one so its size is stable.
 */
export function agentDepths(fleet: Fleet, index = buildFleetIndex(fleet)): Map<string, number> {
  const depths = new Map<string, number>();
  for (const instance of instances(fleet, index)) {
    const known = depths.get(instance.agentId);
    if (known === undefined || instance.depth < known) depths.set(instance.agentId, instance.depth);
  }
  return depths;
}

// ---------- library usage ----------

const USAGE_FIELD = {
  skill: 'skillIds',
  tool: 'toolIds',
  dataSource: 'dataSourceIds',
} as const satisfies Record<LibraryKind, keyof Agent>;

/**
 * Which agents use each library item (SPEC 5.7 "linked to: [Agent] [Agent]...",
 * SPEC 5.8 "delete library items - blocked while in use, show the usage list").
 */
export function libraryUsage(fleet: Fleet, kind: LibraryKind): Map<string, string[]> {
  const field = USAGE_FIELD[kind];
  const usage = new Map<string, string[]>();
  for (const agent of fleet.agents) {
    for (const itemId of agent[field]) {
      const list = usage.get(itemId);
      if (list) {
        if (!list.includes(agent.id)) list.push(agent.id);
      } else {
        usage.set(itemId, [agent.id]);
      }
    }
  }
  return usage;
}

/** Agents using one library item, in fleet order. */
export function agentsUsing(fleet: Fleet, kind: LibraryKind, itemId: string): Agent[] {
  const field = USAGE_FIELD[kind];
  return fleet.agents.filter((agent) => agent[field].includes(itemId));
}
