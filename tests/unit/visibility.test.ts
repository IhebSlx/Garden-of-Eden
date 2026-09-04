/**
 * SPEC 5.2 (focus + ghosting) and SPEC 5.6 (status filter), including the rule the
 * prototype encoded in `recomputeVis`: focus is decided per INSTANCE, so only the
 * copy of a shared agent that hangs under the focused branch stays lit.
 */
import { describe, expect, it } from 'vitest';
import { instances } from '../../src/model/selectors.js';
import { deriveWires } from '../../src/model/wires.js';
import { computeVisibility } from '../../src/model/visibility.js';
import { solarluxFleet } from '../../src/model/seed.js';
import type { Fleet } from '../../src/model/schemas.js';
import { AGENT, EDGE, makeFleet } from '../fixtures/fleets.js';

const setup = (fleet: Fleet) => {
  const instanceList = instances(fleet);
  const wireList = deriveWires(fleet, instanceList);
  return { fleet, instanceList, wireList };
};

const visible = (fleet: Fleet, focusId: string | null, filter: Parameters<typeof computeVisibility>[4] = null) => {
  const { instanceList, wireList } = setup(fleet);
  return computeVisibility(fleet, instanceList, wireList, focusId, filter);
};

describe('deriveWires', () => {
  it('draws one wire per hierarchy parent-instance to child-instance link', () => {
    const fleet = makeFleet();
    const { instanceList, wireList } = setup(fleet);
    // 8 instances, one root -> 7 hierarchy wires, plus the single peer wire.
    expect(instanceList).toHaveLength(8);
    expect(wireList.filter((w) => w.kind === 'hierarchy')).toHaveLength(7);
    expect(wireList.filter((w) => w.kind === 'peer')).toHaveLength(1);
  });

  it('repeats a shared agent\'s subtree wires under every parent copy', () => {
    const fleet = makeFleet();
    const { wireList } = setup(fleet);
    // quotes -> pricing exists once per copy of quotes.
    const pricingWires = wireList.filter((w) => w.toAgentId === AGENT.pricing);
    expect(pricingWires).toHaveLength(2);
    expect(new Set(pricingWires.map((w) => w.fromKey)).size).toBe(2);
    // Both draw the same fleet edge.
    expect(new Set(pricingWires.map((w) => w.edgeId))).toEqual(new Set([EDGE.quotesToPricing]));
  });

  it('gives every wire a unique id', () => {
    const { wireList } = setup(solarluxFleet());
    expect(new Set(wireList.map((w) => w.id)).size).toBe(wireList.length);
  });

  it('carries the target kind and source depth for stroke colour and width', () => {
    const fleet = makeFleet();
    const { wireList } = setup(fleet);
    const toSales = wireList.find((w) => w.toAgentId === AGENT.sales);
    expect(toSales?.toKind).toBe('department');
    expect(toSales?.fromDepth).toBe(0);
  });

  it('attaches a peer wire to the first copy of each endpoint', () => {
    const fleet = makeFleet();
    const { wireList } = setup(fleet);
    const peer = wireList.find((w) => w.kind === 'peer');
    expect(peer?.fromAgentId).toBe(AGENT.leads);
    expect(peer?.toAgentId).toBe(AGENT.operations);
  });

  it('matches the Solarlux fleet: 19 hierarchy wires plus one peer', () => {
    const { wireList } = setup(solarluxFleet());
    // 20 instances minus the single root = 19 parent links.
    expect(wireList.filter((w) => w.kind === 'hierarchy')).toHaveLength(19);
    expect(wireList.filter((w) => w.kind === 'peer')).toHaveLength(1);
  });
});

describe('computeVisibility - focus (SPEC 5.2)', () => {
  it('lights everything when nothing is focused', () => {
    const fleet = makeFleet();
    const { instanceList, wireList } = setup(fleet);
    const result = visible(fleet, null);
    expect(result.litInstanceKeys.size).toBe(instanceList.length);
    expect(result.litWireIds.size).toBe(wireList.length);
    expect(result.focusedWireIds.size).toBe(0);
  });

  it('lights the focused agent and its descendants only', () => {
    const fleet = makeFleet();
    const { instanceList } = setup(fleet);
    const result = visible(fleet, AGENT.sales);

    const litAgents = new Set(
      [...result.litInstanceKeys].map((key) => instanceList.find((i) => i.key === key)?.agentId),
    );
    expect(litAgents).toEqual(new Set([AGENT.sales, AGENT.quotes, AGENT.pricing, AGENT.leads]));
  });

  it('ghosts the copies of a shared agent that hang outside the focused branch', () => {
    const fleet = makeFleet();
    const { instanceList } = setup(fleet);
    const result = visible(fleet, AGENT.sales);

    const quoteCopies = instanceList.filter((i) => i.agentId === AGENT.quotes);
    expect(quoteCopies).toHaveLength(2);
    const litCopies = quoteCopies.filter((i) => result.litInstanceKeys.has(i.key));
    // Only the copy under Sales survives; the one under Operations ghosts.
    expect(litCopies).toHaveLength(1);
    expect(litCopies[0]?.parentId).toBe(AGENT.sales);
  });

  it('keeps every copy lit when the shared agent itself is focused', () => {
    const fleet = makeFleet();
    const { instanceList } = setup(fleet);
    const result = visible(fleet, AGENT.quotes);

    const copies = instanceList.filter((i) => i.agentId === AGENT.quotes);
    expect(copies.every((c) => result.litInstanceKeys.has(c.key))).toBe(true);
    // ...and so does its subtree under each copy (SPEC 5.2).
    const pricing = instanceList.filter((i) => i.agentId === AGENT.pricing);
    expect(pricing.every((p) => result.litInstanceKeys.has(p.key))).toBe(true);
  });

  it('never pulls a peer-connected agent into focus (SPEC 5.2)', () => {
    const fleet = makeFleet();
    const { instanceList } = setup(fleet);
    const result = visible(fleet, AGENT.leads);

    const operations = instanceList.filter((i) => i.agentId === AGENT.operations);
    expect(operations.every((o) => !result.litInstanceKeys.has(o.key))).toBe(true);
  });

  it('marks the focused branch\'s wires for brightening', () => {
    const fleet = makeFleet();
    const result = visible(fleet, AGENT.sales);
    expect(result.focusedWireIds.size).toBeGreaterThan(0);
    for (const id of result.focusedWireIds) expect(result.litWireIds.has(id)).toBe(true);
  });

  it('reports the focus depth so the cascade can stagger from it', () => {
    const fleet = makeFleet();
    expect(visible(fleet, AGENT.orchestrator).focusDepth).toBe(0);
    expect(visible(fleet, AGENT.sales).focusDepth).toBe(1);
    // A shared agent takes its shallowest depth.
    expect(visible(fleet, AGENT.quotes).focusDepth).toBe(2);
  });

  it('lights nothing for an unknown focus id', () => {
    expect(visible(makeFleet(), 'agt_missing').litInstanceKeys.size).toBe(0);
  });
});

describe('computeVisibility - status filter (SPEC 5.6)', () => {
  it('lights only matching agents', () => {
    const fleet = makeFleet();
    const { instanceList } = setup(fleet);
    const result = visible(fleet, null, 'planned');

    for (const instance of instanceList) {
      const agent = fleet.agents.find((a) => a.id === instance.agentId);
      expect(result.litInstanceKeys.has(instance.key)).toBe(agent?.status === 'planned');
    }
  });

  it('filters wires by their own status, not their endpoints', () => {
    const fleet = makeFleet();
    const { wireList } = setup(fleet);
    const result = visible(fleet, null, 'live');
    for (const wire of wireList) {
      expect(result.litWireIds.has(wire.id)).toBe(wire.status === 'live');
    }
  });

  it('composes with focus as an intersection', () => {
    const fleet = makeFleet();
    const { instanceList } = setup(fleet);
    const result = visible(fleet, AGENT.sales, 'planned');

    const litAgents = new Set(
      [...result.litInstanceKeys].map((key) => instanceList.find((i) => i.key === key)?.agentId),
    );
    // Inside the Sales subtree, only the Planned ones survive.
    expect(litAgents).toEqual(new Set([AGENT.pricing, AGENT.leads]));
  });

  it('can light nothing at all without throwing', () => {
    const fleet = makeFleet();
    for (const agent of fleet.agents) agent.status = 'live';
    expect(visible(fleet, null, 'planned').litInstanceKeys.size).toBe(0);
  });
});
