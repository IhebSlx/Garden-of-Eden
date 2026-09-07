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
import type {
  Agent,
  DataSource,
  DataSourceType,
  Edge,
  Fleet,
  LibraryKind,
  Status,
} from './schemas.js';
import { sourceLabel } from './schemas.js';

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

/** A data source together with who owes it and which agents are waiting for it. */
export type DataObligation = {
  source: DataSource;
  /** Agents that reference this source, in fleet order. */
  waitingAgents: Agent[];
};

/** Everything one party has to prepare, with a count of what is not ready yet. */
export type OwnerWorkload = {
  /** The owner as written, or null for sources nobody has claimed. */
  owner: string | null;
  obligations: DataObligation[];
  /** Sources that are not yet Live, i.e. the outstanding work. */
  outstanding: number;
};

/** Trailing/leading space and case must not split one team into two rows. */
const ownerKey = (owner: string): string => owner.trim().toLowerCase();

/**
 * What each party still has to prepare, grouped by owner.
 *
 * The fleet answers "which agent needs what"; this answers the inverse question a
 * planning conversation actually asks - "what does Marketing owe, and who is
 * blocked until they deliver it?". Sources with no owner come last, under `null`,
 * because they are the ones nobody has been asked for yet.
 *
 * Owners are sorted by outstanding work first, so whoever is holding the most up
 * is at the top; ties fall back to name order for a stable list.
 */
export function dataObligations(fleet: Fleet): OwnerWorkload[] {
  // Who waits on an item, counting inheritance: an agent linked only to the box
  // that contains it is blocked by it just the same.
  const waitingBySource = new Map<string, Agent[]>();
  for (const agent of fleet.agents) {
    for (const source of dataForAgent(fleet, agent)) {
      const bucket = waitingBySource.get(source.id) ?? [];
      bucket.push(agent);
      waitingBySource.set(source.id, bucket);
    }
  }
  const byOwner = new Map<string, OwnerWorkload>();

  for (const source of fleet.dataSources) {
    const named = source.owner?.trim();
    const owner = named === undefined || named === '' ? null : named;
    const key = owner === null ? '\u0000unowned' : ownerKey(owner);

    const bucket = byOwner.get(key) ?? { owner, obligations: [], outstanding: 0 };
    bucket.obligations.push({
      source,
      waitingAgents: waitingBySource.get(source.id) ?? [],
    });
    if (source.status !== 'live') bucket.outstanding += 1;
    byOwner.set(key, bucket);
  }

  return [...byOwner.values()].sort((a, b) => {
    // Unowned work is a prompt to assign it, not a team, so it sits at the end.
    if (a.owner === null) return 1;
    if (b.owner === null) return -1;
    if (a.outstanding !== b.outstanding) return b.outstanding - a.outstanding;
    return a.owner.localeCompare(b.owner);
  });
}

/**
 * The state a department's work is in, for its own page: what it owes, who is held
 * up by it, and the person to ask.
 */
export type DepartmentWorkload = {
  owner: string;
  contact: string | null;
  obligations: DataObligation[];
  /** Items that are not Existing yet. */
  outstanding: number;
  /** Agents that cannot work until this department delivers. */
  blocking: Agent[];
};

/** One department's page, or null when nobody has recorded work for it. */
export function departmentWorkload(fleet: Fleet, provider: string): DepartmentWorkload | null {
  const wanted = provider.trim().toLowerCase();
  if (wanted === '') return null;

  const group = dataObligations(fleet).find(
    (entry) => entry.owner !== null && entry.owner.trim().toLowerCase() === wanted,
  );
  if (!group || group.owner === null) return null;

  // Only the outstanding items hold anybody up; delivered ones block nobody.
  const blocking = new Map<string, Agent>();
  for (const { source, waitingAgents } of group.obligations) {
    if (source.status === 'live') continue;
    for (const agent of waitingAgents) blocking.set(agent.id, agent);
  }

  return {
    owner: group.owner,
    contact: contactForProvider(fleet, group.owner),
    obligations: [...group.obligations].sort(
      (a, b) => BRIEFING_ORDER.indexOf(a.source.status) - BRIEFING_ORDER.indexOf(b.source.status),
    ),
    outstanding: group.outstanding,
    blocking: [...blocking.values()],
  };
}

/** Owed first: a page nobody has to scroll to find the ask. */
const BRIEFING_ORDER: Status[] = ['planned', 'building', 'live'];

/**
 * A department's outstanding work as plain text, to paste into an e-mail.
 *
 * An overview nobody sends is a dashboard. This is the same information the page
 * shows, in the one format that reaches a person who will never open this app.
 */
export function departmentBriefing(fleet: Fleet, provider: string): string {
  const work = departmentWorkload(fleet, provider);
  if (!work) return '';

  const lines: string[] = [`Data needed from ${work.owner} for the AI agents`];
  if (work.contact !== null) lines.push(`Ansprechpartner: ${work.contact}`);
  lines.push('');

  const owed = work.obligations.filter(({ source }) => source.status !== 'live');
  if (owed.length === 0) {
    lines.push('Everything asked for has been provided. Nothing outstanding.');
  } else {
    lines.push(`Still to provide (${owed.length} of ${work.obligations.length}):`);
    lines.push('');
    owed.forEach(({ source, waitingAgents }, index) => {
      lines.push(`${index + 1}. ${source.name} — ${sourceLabel(source.type)}`);
      const requirement = (source.requirement ?? '').trim();
      lines.push(`   ${requirement === '' ? 'What finished looks like: still to be written.' : requirement}`);
      if (waitingAgents.length > 0) {
        lines.push(`   Needed by: ${waitingAgents.map((agent) => agent.name).join(', ')}`);
      }
      lines.push('');
    });
  }

  const done = work.obligations.filter(({ source }) => source.status === 'live');
  if (done.length > 0) {
    lines.push(`Already provided: ${done.map(({ source }) => source.name).join(', ')}.`);
  }

  return lines.join('\n');
}

/** Owner names already in use, for the editor's suggestion list. */
export function knownOwners(fleet: Fleet): string[] {
  const seen = new Map<string, string>();
  for (const source of fleet.dataSources) {
    const named = source.owner?.trim();
    if (named === undefined || named === '') continue;
    if (!seen.has(ownerKey(named))) seen.set(ownerKey(named), named);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * Who a data item can be assigned to: every department in the fleet. Data is
 * provided by a department, so the list is the org chart — including departments
 * that owe nothing yet, since one of those is exactly what you are about to ask.
 *
 * Anything already recorded as a provider is kept even if no department carries
 * that name, so a fleet imported from elsewhere never silently loses an owner.
 */
export function providerOptions(fleet: Fleet): string[] {
  const seen = new Map<string, string>();
  for (const agent of fleet.agents) {
    if (agent.kind !== 'department') continue;
    const named = agent.name.trim();
    if (named !== '' && !seen.has(ownerKey(named))) seen.set(ownerKey(named), named);
  }
  for (const named of knownOwners(fleet)) {
    if (!seen.has(ownerKey(named))) seen.set(ownerKey(named), named);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * The Ansprechpartner for whoever provides a data item: the person recorded on the
 * department, not on the item. Returns null when nobody has been named, or when the
 * provider is not a department in this fleet.
 */
export function contactForProvider(fleet: Fleet, provider: string | undefined): string | null {
  const wanted = (provider ?? '').trim().toLowerCase();
  if (wanted === '') return null;
  for (const agent of fleet.agents) {
    if (agent.name.trim().toLowerCase() !== wanted) continue;
    const contact = agent.contact?.trim();
    if (contact !== undefined && contact !== '') return contact;
  }
  return null;
}

/** The department agent named by a provider, when the fleet has one. */
export function departmentNamed(fleet: Fleet, provider: string | undefined): Agent | null {
  const wanted = (provider ?? '').trim().toLowerCase();
  if (wanted === '') return null;
  return fleet.agents.find((agent) => agent.name.trim().toLowerCase() === wanted) ?? null;
}

// ---------- data: nesting, provision and who provides it ----------

/** Top-level data — the items not inside anything else. */
export function dataRoots(fleet: Fleet): DataSource[] {
  const byId = new Map(fleet.dataSources.map((source) => [source.id, source]));
  // An item whose parent is missing is shown at the top rather than hidden.
  return fleet.dataSources.filter((s) => s.parentId === undefined || !byId.has(s.parentId));
}

export function dataChildren(fleet: Fleet, parentId: string): DataSource[] {
  return fleet.dataSources.filter((source) => source.parentId === parentId);
}

/**
 * Everything inside `id`, at any depth. Cycle-safe: a malformed document must not
 * hang a renderer, so a repeat visit ends that branch.
 */
export function dataDescendants(fleet: Fleet, id: string): DataSource[] {
  const out: DataSource[] = [];
  const seen = new Set<string>([id]);
  const queue = [id];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) continue;
    for (const child of dataChildren(fleet, current)) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      out.push(child);
      queue.push(child.id);
    }
  }
  return out;
}

/**
 * The data an agent actually gets: what it references, plus everything inside
 * those items. Linking an agent to "Produktdaten" gives it the whole box, so the
 * contents never have to be attached one by one.
 */
export function dataForAgent(fleet: Fleet, agent: Agent): DataSource[] {
  const byId = new Map(fleet.dataSources.map((source) => [source.id, source]));
  const out: DataSource[] = [];
  const seen = new Set<string>();

  for (const id of agent.dataSourceIds) {
    const direct = byId.get(id);
    if (!direct || seen.has(id)) continue;
    seen.add(id);
    out.push(direct);
    for (const child of dataDescendants(fleet, id)) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      out.push(child);
    }
  }
  return out;
}

/** Every party that owes data, in name order. Casing and stray spaces do not split one. */
export function dataProviders(fleet: Fleet): string[] {
  const seen = new Map<string, string>();
  for (const source of fleet.dataSources) {
    const named = source.owner?.trim();
    if (named === undefined || named === '') continue;
    const key = named.toLowerCase();
    if (!seen.has(key)) seen.set(key, named);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * What the data list is being asked for. Three independent axes, each of which may
 * be left open:
 *   provider - 'all', 'none' (nobody has been asked yet), or one department
 *   status   - null for any, else Existing / Being prepared / To be provided
 *   source   - 'any', 'unassigned' for undecided, or one kind by id
 *
 * The source axis is a union rather than a nullable string because a source kind
 * is now user-declared: any sentinel string could in principle also be a kind id.
 */
export type DataQuery = {
  provider: { kind: 'all' } | { kind: 'none' } | { kind: 'provider'; name: string };
  status: Status | null;
  source: { kind: 'any' } | { kind: 'unassigned' } | { kind: 'is'; id: DataSourceType };
};

/** Every axis left open: the whole library. */
export const ANY_DATA: DataQuery = {
  provider: { kind: 'all' },
  status: null,
  source: { kind: 'any' },
};

/** Whether this item, on its own, answers every axis of the query. */
export function dataItemMatches(source: DataSource, query: DataQuery): boolean {
  const owner = (source.owner ?? '').trim();
  const providerOk =
    query.provider.kind === 'all'
      ? true
      : query.provider.kind === 'none'
        ? owner === ''
        : owner.toLowerCase() === query.provider.name.trim().toLowerCase();

  const statusOk = query.status === null || source.status === query.status;

  const sourceOk =
    query.source.kind === 'any'
      ? true
      : query.source.kind === 'unassigned'
        ? source.type === undefined
        : source.type === query.source.id;

  return providerOk && statusOk && sourceOk;
}

/**
 * Whether a row belongs in a filtered list: this item, or anything inside it,
 * answers the whole query. Keeping the box means a part is never stranded from the
 * whole it belongs to.
 *
 * The WHOLE query, not each axis separately. A box holding one Existing item from
 * Marketing and one owed item from Vertrieb must not survive "Marketing + owed":
 * per-axis matching would keep the box and then drop both its contents, leaving an
 * empty whole on screen.
 */
export function dataMatchesQuery(fleet: Fleet, source: DataSource, query: DataQuery): boolean {
  if (dataItemMatches(source, query)) return true;
  return dataDescendants(fleet, source.id).some((child) => dataItemMatches(child, query));
}

/**
 * Data as a depth-first list with its nesting depth, for rendering a tree in a flat
 * list. Cycle-safe, and an item whose parent is missing appears at the top rather
 * than vanishing.
 */
export function flattenData(fleet: Fleet): { source: DataSource; depth: number }[] {
  const out: { source: DataSource; depth: number }[] = [];
  const seen = new Set<string>();

  const walk = (nodes: DataSource[], depth: number): void => {
    for (const source of nodes) {
      if (seen.has(source.id)) continue;
      seen.add(source.id);
      out.push({ source, depth });
      walk(dataChildren(fleet, source.id), depth + 1);
    }
  };

  walk(dataRoots(fleet), 0);
  // Anything a cycle kept out of the walk is still listed, or it could not be fixed.
  for (const source of fleet.dataSources) {
    if (!seen.has(source.id)) out.push({ source, depth: 0 });
  }
  return out;
}
