/**
 * Instance-level wires. A fleet edge connects AGENTS; a drawn wire connects two
 * INSTANCES, so a hierarchy edge under a shared parent produces one wire per copy.
 *
 * View-agnostic (SPEC 2.1): the 2D board and the 3D scene both render this list.
 *
 * The prototype took `instById[edge.source]` - the first instance of the source
 * agent - which was safe only because it disabled children under shared agents.
 * With SPEC 8.8 enabled we walk the instance tree instead, so every copy of a
 * shared subtree gets its own wires.
 */
import type { Edge, EdgeKind, Fleet, Status } from './schemas.js';
import type { Instance } from './selectors.js';

export type Wire = {
  /** Unique per drawn wire (a hierarchy edge repeats under each parent instance). */
  id: string;
  /** The fleet edge this wire draws - several wires may share one. */
  edgeId: string;
  kind: EdgeKind;
  status: Status;
  label: string | undefined;
  fromKey: string;
  toKey: string;
  fromAgentId: string;
  toAgentId: string;
  /** Depth of the source instance; the orchestrator's wires are the thickest (SPEC 6). */
  fromDepth: number;
  /** Kind of the target agent - hierarchy wires take the child's colour. */
  toKind: Fleet['agents'][number]['kind'];
};

/**
 * How many leading agents two instance paths have in common — the depth of their
 * nearest common ancestor.
 */
function sharedAncestry(a: Instance, b: Instance): number {
  const limit = Math.min(a.path.length, b.path.length);
  let shared = 0;
  while (shared < limit && a.path[shared] === b.path[shared]) shared += 1;
  return shared;
}

/**
 * The copy of `agentId` nearest to `from`.
 *
 * A shared agent is drawn once under every parent (SPEC §2.3), so an edge naming
 * it is ambiguous at render time: which copy should the wire reach? The nearest
 * one — the copy sharing the deepest common ancestor with the source. A peer of
 * something under Business Development links to the copy under Business
 * Development, not to a copy three columns away that happens to come first in the
 * instance walk.
 *
 * Ties (two copies equally close) fall back to the smaller depth and then to key
 * order, so the choice is deterministic and never flickers between renders.
 */
function nearestInstance(from: Instance, candidates: Instance[]): Instance | undefined {
  let best: Instance | undefined;
  let bestScore = -1;
  for (const candidate of candidates) {
    if (candidate.key === from.key) continue;
    const score = sharedAncestry(from, candidate);
    if (
      score > bestScore ||
      (score === bestScore &&
        best !== undefined &&
        (candidate.depth < best.depth || (candidate.depth === best.depth && candidate.key < best.key)))
    ) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export function deriveWires(fleet: Fleet, instanceList: Instance[]): Wire[] {
  const agentsById = new Map(fleet.agents.map((a) => [a.id, a]));
  const instancesByKey = new Map(instanceList.map((i) => [i.key, i]));

  /** `${source}->${target}` -> hierarchy edge. */
  const hierarchyByPair = new Map<string, Edge>();
  const instancesOfAgent = new Map<string, Instance[]>();
  for (const instance of instanceList) {
    const list = instancesOfAgent.get(instance.agentId);
    if (list) list.push(instance);
    else instancesOfAgent.set(instance.agentId, [instance]);
  }
  for (const edge of fleet.edges) {
    if (edge.kind === 'hierarchy') hierarchyByPair.set(`${edge.source}->${edge.target}`, edge);
  }

  const out: Wire[] = [];

  // One hierarchy wire per parent-instance -> child-instance link.
  for (const instance of instanceList) {
    if (instance.parentKey === null || instance.parentId === null) continue;
    const edge = hierarchyByPair.get(`${instance.parentId}->${instance.agentId}`);
    const parent = instancesByKey.get(instance.parentKey);
    const target = agentsById.get(instance.agentId);
    if (!edge || !parent || !target) continue;

    out.push({
      id: `${edge.id}::${instance.key}`,
      edgeId: edge.id,
      kind: 'hierarchy',
      status: edge.status,
      label: edge.label,
      fromKey: parent.key,
      toKey: instance.key,
      fromAgentId: parent.agentId,
      toAgentId: instance.agentId,
      fromDepth: parent.depth,
      toKind: target.kind,
    });
  }

  // Peer links are not structure (SPEC 5.2), so they do not repeat down a shared
  // subtree the way hierarchy wires do. They do follow each copy of their source:
  // every drawn copy really does hand off to a peer, and each reaches the NEAREST
  // copy of the other agent rather than whichever happened to be walked first.
  const drawn = new Set<string>();
  for (const edge of fleet.edges) {
    if (edge.kind !== 'peer') continue;
    const target = agentsById.get(edge.target);
    const candidates = instancesOfAgent.get(edge.target) ?? [];
    if (!target || candidates.length === 0) continue;

    for (const from of instancesOfAgent.get(edge.source) ?? []) {
      const to = nearestInstance(from, candidates);
      if (!to) continue;

      const pair = `${edge.id}::${from.key}`;
      if (drawn.has(pair)) continue;
      drawn.add(pair);

      out.push({
        id: pair,
        edgeId: edge.id,
        kind: 'peer',
        status: edge.status,
        label: edge.label,
        fromKey: from.key,
        toKey: to.key,
        fromAgentId: from.agentId,
        toAgentId: to.agentId,
        fromDepth: from.depth,
        toKind: target.kind,
      });
    }
  }

  return out;
}
