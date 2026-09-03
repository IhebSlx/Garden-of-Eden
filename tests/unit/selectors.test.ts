/** SPEC 4 derived rules + the SPEC 5 behaviours that read them. */
import { describe, expect, it } from 'vitest';
import { ROOT_PARENT, agentDepths, agentsUsing, buildFleetIndex, childIdsOf, dataObligations, departmentObligations, descendantIds, hierarchyEdges, instances, instancesByAgent, isShared, knownOwners, libraryUsage, parentIdsOf, parentsOf, peerEdges, peerIdsOf, rootAgentIds, sharedCount, visibleSet } from '../../src/model/selectors.js';
import type { DataSource, Fleet } from '../../src/model/schemas.js';
import { AGENT, LIB, makeFleet } from '../fixtures/fleets.js';

const keysOf = (fleet: Fleet): string[] => instances(fleet).map((i) => i.key);
const agentSequence = (fleet: Fleet): string[] => instances(fleet).map((i) => i.agentId);

describe('adjacency', () => {
  it('separates hierarchy from peer edges', () => {
    const fleet = makeFleet();
    expect(hierarchyEdges(fleet)).toHaveLength(6);
    expect(peerEdges(fleet)).toHaveLength(1);
  });

  it('lists hierarchy parents and children in edge order', () => {
    const fleet = makeFleet();
    expect(parentIdsOf(fleet, AGENT.quotes)).toEqual([AGENT.sales, AGENT.operations]);
    expect(childIdsOf(fleet, AGENT.sales)).toEqual([AGENT.quotes, AGENT.leads]);
    expect(childIdsOf(fleet, AGENT.pricing)).toEqual([]);
  });

  it('treats peer links as undirected and never as hierarchy', () => {
    const fleet = makeFleet();
    expect(peerIdsOf(fleet, AGENT.leads)).toEqual([AGENT.operations]);
    expect(peerIdsOf(fleet, AGENT.operations)).toEqual([AGENT.leads]);
    expect(parentIdsOf(fleet, AGENT.operations)).toEqual([AGENT.orchestrator]);
  });

  it('reports parentless agents as roots', () => {
    expect(rootAgentIds(makeFleet())).toEqual([AGENT.orchestrator]);
  });
});

describe('isShared (SPEC 4)', () => {
  it('is true only at two or more hierarchy parents', () => {
    const fleet = makeFleet();
    expect(isShared(fleet, AGENT.quotes)).toBe(true);
    expect(isShared(fleet, AGENT.leads)).toBe(false);
    expect(isShared(fleet, AGENT.orchestrator)).toBe(false);
  });

  it('does not count peer links towards shared-ness', () => {
    const fleet = makeFleet();
    // operations has one hierarchy parent and one peer neighbour.
    expect(peerIdsOf(fleet, AGENT.operations)).toHaveLength(1);
    expect(isShared(fleet, AGENT.operations)).toBe(false);
  });

  it('exposes the xN badge count and the parent list for the panel (SPEC 5.3)', () => {
    const fleet = makeFleet();
    expect(sharedCount(fleet, AGENT.quotes)).toBe(2);
    expect(parentsOf(fleet, AGENT.quotes).map((a) => a.name)).toEqual(['Sales', 'Operations']);
  });
});

describe('instances (SPEC 4)', () => {
  it('renders one instance per (agent, hierarchy-parent) pair', () => {
    const fleet = makeFleet();
    const byAgent = instancesByAgent(fleet);
    expect(byAgent.get(AGENT.sales)).toHaveLength(1);
    expect(byAgent.get(AGENT.quotes)).toHaveLength(2);
  });

  it('gives a parentless agent exactly one root instance', () => {
    const fleet = makeFleet();
    const roots = instances(fleet).filter((i) => i.parentId === null);
    expect(roots).toHaveLength(1);
    expect(roots[0]?.agentId).toBe(AGENT.orchestrator);
    expect(roots[0]?.depth).toBe(0);
    expect(roots[0]?.pairKey).toBe(`${AGENT.orchestrator}@${ROOT_PARENT}`);
  });

  it('repeats the subtree of a shared agent under every parent instance (SPEC 4)', () => {
    const fleet = makeFleet();
    const pricing = instances(fleet).filter((i) => i.agentId === AGENT.pricing);

    // The child of a shared agent must appear once per parent instance - this is the
    // case the pair-key form cannot express, hence path keys.
    expect(pricing).toHaveLength(2);
    expect(pricing.map((i) => i.path)).toEqual([
      [AGENT.orchestrator, AGENT.sales, AGENT.quotes, AGENT.pricing],
      [AGENT.orchestrator, AGENT.operations, AGENT.quotes, AGENT.pricing],
    ]);
    // Both carry the same SPEC 4 pair key, proving it is not unique here.
    expect(new Set(pricing.map((i) => i.pairKey)).size).toBe(1);
  });

  it('produces unique keys and correct parent links', () => {
    const fleet = makeFleet();
    const all = instances(fleet);
    expect(new Set(all.map((i) => i.key)).size).toBe(all.length);

    const byKey = new Map(all.map((i) => [i.key, i]));
    for (const instance of all) {
      if (instance.parentKey === null) continue;
      const parent = byKey.get(instance.parentKey);
      expect(parent?.agentId).toBe(instance.parentId);
      expect(instance.depth).toBe((parent?.depth ?? -1) + 1);
    }
  });

  it('walks the fleet in a deterministic pre-order', () => {
    const fleet = makeFleet();
    expect(agentSequence(fleet)).toEqual([
      AGENT.orchestrator,
      AGENT.sales,
      AGENT.quotes,
      AGENT.pricing,
      AGENT.leads,
      AGENT.operations,
      AGENT.quotes,
      AGENT.pricing,
    ]);
  });

  it('keys each instance by its full hierarchy path', () => {
    expect(keysOf(makeFleet())).toEqual([
      'agt_orchestrator',
      'agt_orchestrator/agt_sales',
      'agt_orchestrator/agt_sales/agt_quotes',
      'agt_orchestrator/agt_sales/agt_quotes/agt_pricing',
      'agt_orchestrator/agt_sales/agt_leads',
      'agt_orchestrator/agt_operations',
      'agt_orchestrator/agt_operations/agt_quotes',
      'agt_orchestrator/agt_operations/agt_quotes/agt_pricing',
    ]);
  });

  it('encodes ids so a separator inside an id cannot forge a key', () => {
    const fleet = makeFleet();
    const leads = fleet.agents.find((a) => a.id === AGENT.leads);
    if (leads) leads.id = 'agt/odd id';
    for (const edge of fleet.edges) {
      if (edge.target === AGENT.leads) edge.target = 'agt/odd id';
      if (edge.source === AGENT.leads) edge.source = 'agt/odd id';
    }

    const odd = instances(fleet).find((i) => i.agentId === 'agt/odd id');
    expect(odd?.key).toBe('agt_orchestrator/agt_sales/agt%2Fodd%20id');
    expect(new Set(keysOf(fleet)).size).toBe(instances(fleet).length);
  });

  it('is stable across calls', () => {
    const fleet = makeFleet();
    expect(instances(fleet)).toEqual(instances(fleet));
  });

  it('excludes peer edges from the instance tree', () => {
    const fleet = makeFleet();
    // operations appears once (under the orchestrator), not again beneath its peer.
    expect(instances(fleet).filter((i) => i.agentId === AGENT.operations)).toHaveLength(1);
  });

  it('terminates on a hierarchy cycle instead of hanging', () => {
    const fleet = makeFleet();
    // Close a loop: pricing -> sales, while sales is already an ancestor of pricing.
    fleet.edges.push({
      id: 'edg_cycle',
      source: AGENT.pricing,
      target: AGENT.sales,
      kind: 'hierarchy',
      status: 'planned',
    });

    const all = instances(fleet);
    expect(all.length).toBeGreaterThan(0);
    expect(new Set(all.map((i) => i.key)).size).toBe(all.length);
    // No instance may contain the same agent twice on its path.
    for (const instance of all) {
      expect(new Set(instance.path).size).toBe(instance.path.length);
    }
  });

  it('never mints two instances for a duplicated edge', () => {
    const fleet = makeFleet();
    fleet.edges.push({
      id: 'edg_duplicate',
      source: AGENT.sales,
      target: AGENT.leads,
      kind: 'hierarchy',
      status: 'planned',
    });
    expect(instances(fleet).filter((i) => i.agentId === AGENT.leads)).toHaveLength(1);
  });

  it('returns nothing for an empty fleet', () => {
    const fleet = makeFleet();
    fleet.agents = [];
    fleet.edges = [];
    expect(instances(fleet)).toEqual([]);
  });
});

describe('visibleSet (SPEC 4 / 5.2)', () => {
  it('is the focused agent plus all hierarchy descendants', () => {
    const fleet = makeFleet();
    expect(visibleSet(fleet, AGENT.sales)).toEqual(
      new Set([AGENT.sales, AGENT.quotes, AGENT.pricing, AGENT.leads]),
    );
  });

  it('includes every parent of a focused shared agent nowhere - only its own subtree', () => {
    const fleet = makeFleet();
    expect(visibleSet(fleet, AGENT.quotes)).toEqual(new Set([AGENT.quotes, AGENT.pricing]));
  });

  it('never expands focus along peer links (SPEC 5.2)', () => {
    const fleet = makeFleet();
    // leads has a peer link to operations; focusing leads must not pull operations in.
    expect(visibleSet(fleet, AGENT.leads)).toEqual(new Set([AGENT.leads]));
  });

  it('is the whole fleet when nothing is focused', () => {
    const fleet = makeFleet();
    expect(visibleSet(fleet, null).size).toBe(fleet.agents.length);
  });

  it('is empty for an unknown focus id', () => {
    expect(visibleSet(makeFleet(), 'agt_missing').size).toBe(0);
  });

  it('is cycle-safe', () => {
    const fleet = makeFleet();
    fleet.edges.push({
      id: 'edg_cycle',
      source: AGENT.pricing,
      target: AGENT.sales,
      kind: 'hierarchy',
      status: 'planned',
    });
    expect(visibleSet(fleet, AGENT.sales)).toEqual(
      new Set([AGENT.sales, AGENT.quotes, AGENT.pricing, AGENT.leads]),
    );
  });

  it('descendantIds excludes the agent itself', () => {
    expect(descendantIds(makeFleet(), AGENT.quotes)).toEqual(new Set([AGENT.pricing]));
  });
});

describe('agentDepths (SPEC 5.5)', () => {
  it('uses the shallowest depth so a shared agent keeps one size', () => {
    const fleet = makeFleet();
    const depths = agentDepths(fleet);
    expect(depths.get(AGENT.orchestrator)).toBe(0);
    expect(depths.get(AGENT.sales)).toBe(1);
    expect(depths.get(AGENT.quotes)).toBe(2);
    expect(depths.get(AGENT.pricing)).toBe(3);
  });
});

describe('library usage (SPEC 5.7 / 5.8)', () => {
  it('maps each library item to the agents that use it', () => {
    const fleet = makeFleet();
    expect(libraryUsage(fleet, 'skill').get(LIB.skill)).toEqual([AGENT.sales, AGENT.quotes]);
    expect(libraryUsage(fleet, 'dataSource').get(LIB.dataSource)).toEqual([AGENT.quotes, AGENT.pricing]);
    expect(libraryUsage(fleet, 'tool').get(LIB.tool)).toEqual([AGENT.quotes]);
  });

  it('returns the using agents for the "linked to:" buttons', () => {
    const fleet = makeFleet();
    expect(agentsUsing(fleet, 'dataSource', LIB.dataSource).map((a) => a.name)).toEqual([
      'Quote builder',
      'Pricing check',
    ]);
    expect(agentsUsing(fleet, 'tool', 'tol_unused')).toEqual([]);
  });
});

describe('buildFleetIndex', () => {
  it('is reusable across selectors and yields identical results', () => {
    const fleet = makeFleet();
    const index = buildFleetIndex(fleet);
    expect(instances(fleet, index)).toEqual(instances(fleet));
    expect(visibleSet(fleet, AGENT.sales, index)).toEqual(visibleSet(fleet, AGENT.sales));
    expect(isShared(fleet, AGENT.quotes, index)).toBe(true);
  });
});

describe('dataObligations — what each party has to prepare', () => {
  const withSources = (sources: Partial<DataSource>[]): Fleet => {
    const fleet = makeFleet();
    return {
      ...fleet,
      dataSources: sources.map((source, index) => ({
        id: `dsr_${index}`,
        name: `Source ${index}`,
        type: 'file' as const,
        status: 'planned' as const,
        ...source,
      })),
      agents: fleet.agents.map((agent, index) =>
        index === 1 ? { ...agent, dataSourceIds: sources.map((_, i) => `dsr_${i}`) } : agent,
      ),
    };
  };

  it('groups sources by the party that owes them', () => {
    const fleet = withSources([
      { owner: 'Marketing', name: 'Produktbilder' },
      { owner: 'Marketing', name: 'Logos' },
      { owner: 'Produktmanagement', name: 'Preisliste' },
    ]);

    const groups = dataObligations(fleet);
    expect(groups.map((g) => g.owner)).toEqual(['Marketing', 'Produktmanagement']);
    expect(groups[0]?.obligations.map((o) => o.source.name)).toEqual(['Produktbilder', 'Logos']);
  });

  it('counts only what is not Live as outstanding', () => {
    const fleet = withSources([
      { owner: 'Marketing', status: 'live' },
      { owner: 'Marketing', status: 'building' },
      { owner: 'Marketing', status: 'planned' },
    ]);
    expect(dataObligations(fleet)[0]).toMatchObject({ owner: 'Marketing', outstanding: 2 });
  });

  it('puts whoever is holding up the most at the top', () => {
    const fleet = withSources([
      { owner: 'Vertrieb', status: 'planned' },
      { owner: 'Marketing', status: 'planned' },
      { owner: 'Marketing', status: 'planned' },
    ]);
    expect(dataObligations(fleet).map((g) => g.owner)).toEqual(['Marketing', 'Vertrieb']);
  });

  it('names the agents that are waiting on each source', () => {
    const fleet = withSources([{ owner: 'Marketing', name: 'Produktbilder' }]);
    const waiting = dataObligations(fleet)[0]?.obligations[0]?.waitingAgents ?? [];
    expect(waiting).toHaveLength(1);
    expect(waiting[0]?.id).toBe(fleet.agents[1]?.id);
  });

  it('collects unclaimed sources last, so they read as a prompt to assign them', () => {
    const fleet = withSources([{ name: 'Nobody asked for this' }, { owner: 'Marketing' }]);
    const groups = dataObligations(fleet);
    expect(groups.map((g) => g.owner)).toEqual(['Marketing', null]);
    expect(groups[1]?.obligations).toHaveLength(1);
  });

  it('does not split one team in two over casing or stray spaces', () => {
    const fleet = withSources([{ owner: 'Marketing' }, { owner: '  marketing ' }]);
    const groups = dataObligations(fleet);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.obligations).toHaveLength(2);
    // The first spelling seen is the one shown.
    expect(groups[0]?.owner).toBe('Marketing');
  });

  it('treats a blank owner as no owner at all', () => {
    const fleet = withSources([{ owner: '   ' }]);
    expect(dataObligations(fleet)[0]?.owner).toBeNull();
  });

  it('offers every owner already in use as a suggestion, deduplicated', () => {
    const fleet = withSources([{ owner: 'Vertrieb' }, { owner: 'marketing' }, { owner: 'Marketing' }]);
    expect(knownOwners(fleet)).toEqual(['marketing', 'Vertrieb']);
  });

  it('returns nothing for a fleet with no data sources', () => {
    expect(dataObligations(withSources([]))).toEqual([]);
    expect(knownOwners(withSources([]))).toEqual([]);
  });
});

describe('departmentObligations — what each department has to provide', () => {
  const withBoxes = (): Fleet => {
    const fleet = makeFleet();
    return {
      ...fleet,
      agents: fleet.agents.map((agent) => {
        if (agent.name === 'Sales') {
          return {
            ...agent,
            kind: 'department' as const,
            dataRequirements: [
              {
                id: 'r1',
                title: 'Produktdaten',
                status: 'planned' as const,
                children: [{ id: 'r2', title: 'Bilder', status: 'live' as const, children: [] }],
              },
            ],
          };
        }
        if (agent.name === 'Operations') return { ...agent, kind: 'department' as const };
        return agent;
      }),
    };
  };

  it('lists departments only', () => {
    const groups = departmentObligations(withBoxes());
    expect(groups.every((g) => g.agent.kind === 'department')).toBe(true);
  });

  it('counts boxes at every level, not just the top ones', () => {
    const sales = departmentObligations(withBoxes()).find((g) => g.agent.name === 'Sales');
    expect(sales?.progress).toEqual({
      total: 2,
      outstanding: 1,
      byStatus: { live: 1, building: 0, planned: 1 },
    });
  });

  it('puts whoever is holding up the most first', () => {
    expect(departmentObligations(withBoxes())[0]?.agent.name).toBe('Sales');
  });

  it('still lists a department with nothing recorded — that is the finding', () => {
    const groups = departmentObligations(withBoxes());
    const marketing = groups.find((g) => g.agent.name === 'Operations');
    expect(marketing).toBeDefined();
    expect(marketing?.progress.total).toBe(0);
    expect(marketing?.requirements).toEqual([]);
  });

  it('returns nothing for a fleet with no departments', () => {
    const flat = makeFleet();
    const noDepts: Fleet = { ...flat, agents: flat.agents.map((a) => ({ ...a, kind: 'worker' as const })) };
    expect(departmentObligations(noDepts)).toEqual([]);
  });
});
