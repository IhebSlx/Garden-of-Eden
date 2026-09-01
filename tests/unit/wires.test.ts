/**
 * Instance-level wires (SPEC §2.1: one derivation, both renderers draw it).
 *
 * The interesting case is a shared agent: it is drawn once under every parent, so
 * an edge naming it is ambiguous at render time and the wire must pick a copy.
 */
import { describe, expect, it } from 'vitest';
import { instances } from '../../src/model/selectors.js';
import { deriveWires } from '../../src/model/wires.js';
import type { Agent, Edge, Fleet } from '../../src/model/schemas.js';

const agent = (id: string, kind: Agent['kind'] = 'worker'): Agent => ({
  id,
  kind,
  name: id,
  role: '',
  status: 'planned',
  skillIds: [],
  toolIds: [],
  dataSourceIds: [],
});

const edge = (id: string, source: string, target: string, kind: Edge['kind']): Edge => ({
  id,
  source,
  target,
  kind,
  status: 'planned',
});

/**
 *            root
 *        ┌────┴────┐
 *      left      right
 *        │      ┌──┴──┐
 *      shared  shared  near
 *
 * `shared` has two parents, so two instances; `near` sits beside one of them.
 */
const fleet: Fleet = {
  schemaVersion: 1,
  id: 'flt_1',
  name: 'Shared',
  agents: [agent('root', 'orchestrator'), agent('left', 'department'), agent('right', 'department'), agent('shared'), agent('near')],
  edges: [
    edge('e1', 'root', 'left', 'hierarchy'),
    edge('e2', 'root', 'right', 'hierarchy'),
    edge('e3', 'left', 'shared', 'hierarchy'),
    edge('e4', 'right', 'shared', 'hierarchy'),
    edge('e5', 'right', 'near', 'hierarchy'),
    edge('p1', 'near', 'shared', 'peer'),
  ],
  skills: [],
  tools: [],
  dataSources: [],
};

const wiresOf = (input: Fleet = fleet) => deriveWires(input, instances(input));

describe('a peer wire reaches the nearest copy of a shared agent', () => {
  it('links to the copy under the same parent, not the first one walked', () => {
    const peer = wiresOf().filter((w) => w.kind === 'peer');
    expect(peer).toHaveLength(1);
    // "left/shared" comes first in the pre-order walk and is the wrong answer.
    expect(peer[0]?.toKey).toBe('root/right/shared');
    expect(peer[0]?.fromKey).toBe('root/right/near');
  });

  it('still draws exactly one wire per copy of the source', () => {
    // `near` has one instance, so one peer wire — not one per copy of the target.
    expect(wiresOf().filter((w) => w.kind === 'peer')).toHaveLength(1);
  });

  it('gives every copy of a shared source its own nearest peer', () => {
    // Make the source shared too: both copies must reach their own neighbour.
    const shared: Fleet = {
      ...fleet,
      edges: [...fleet.edges, edge('e6', 'left', 'near', 'hierarchy')],
    };
    const peer = wiresOf(shared).filter((w) => w.kind === 'peer');
    expect(peer).toHaveLength(2);
    expect(peer.map((w) => `${w.fromKey} -> ${w.toKey}`).sort()).toEqual([
      'root/left/near -> root/left/shared',
      'root/right/near -> root/right/shared',
    ]);
  });

  it('is deterministic when two copies are equally close', () => {
    const first = wiresOf().filter((w) => w.kind === 'peer');
    const second = wiresOf().filter((w) => w.kind === 'peer');
    expect(second).toEqual(first);
  });

  it('never links an instance to itself', () => {
    const selfish: Fleet = { ...fleet, edges: [...fleet.edges, edge('p2', 'near', 'near', 'peer')] };
    expect(wiresOf(selfish).every((w) => w.fromKey !== w.toKey)).toBe(true);
  });

  it('drops a peer edge whose target has no instance at all', () => {
    const orphan: Fleet = {
      ...fleet,
      agents: [...fleet.agents, agent('ghost')],
      edges: [...fleet.edges, edge('p3', 'near', 'ghost', 'peer')],
    };
    // `ghost` has no hierarchy parent, so it is drawn as a root instance...
    expect(wiresOf(orphan).filter((w) => w.edgeId === 'p3')).toHaveLength(1);
  });

  it('keeps peer wire ids unique so React never sees a duplicate key', () => {
    const shared: Fleet = { ...fleet, edges: [...fleet.edges, edge('e6', 'left', 'near', 'hierarchy')] };
    const ids = wiresOf(shared).map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('hierarchy wires still repeat under every parent', () => {
  it('draws the shared agent\'s incoming wire once per copy', () => {
    const hierarchy = wiresOf().filter((w) => w.kind === 'hierarchy' && w.toAgentId === 'shared');
    expect(hierarchy.map((w) => w.toKey).sort()).toEqual(['root/left/shared', 'root/right/shared']);
  });
});
