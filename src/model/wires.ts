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

export function deriveWires(fleet: Fleet, instanceList: Instance[]): Wire[] {
  const agentsById = new Map(fleet.agents.map((a) => [a.id, a]));
  const instancesByKey = new Map(instanceList.map((i) => [i.key, i]));

  /** `${source}->${target}` -> hierarchy edge. */
  const hierarchyByPair = new Map<string, Edge>();
  const firstInstanceOfAgent = new Map<string, Instance>();
  for (const instance of instanceList) {
    if (!firstInstanceOfAgent.has(instance.agentId)) firstInstanceOfAgent.set(instance.agentId, instance);
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

  // Peer links are not structure (SPEC 5.2), so they attach to the first copy of
  // each endpoint rather than repeating across the hierarchy.
  for (const edge of fleet.edges) {
    if (edge.kind !== 'peer') continue;
    const from = firstInstanceOfAgent.get(edge.source);
    const to = firstInstanceOfAgent.get(edge.target);
    const target = agentsById.get(edge.target);
    if (!from || !to || !target) continue;

    out.push({
      id: edge.id,
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

  return out;
}
