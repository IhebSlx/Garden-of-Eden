/**
 * Data as the user's model of it: a thing with a SOURCE (a system, or a department),
 * marked as existing or as owed by someone, and nestable — "Produktdaten" holds
 * "Bilder" holds "Freigestellt".
 */
import { describe, expect, it } from 'vitest';
import { checkFleetIntegrity } from '../../src/model/integrity.js';
import {
  agentsWaitingOn,
  dataObligations,
  dataChildren,
  dataDescendants,
  dataForAgent,
  dataMatchesProvider,
  dataProviders,
  dataRoots,
} from '../../src/model/selectors.js';
import { DataSourceSchema } from '../../src/model/schemas.js';
import type { DataSource, Fleet } from '../../src/model/schemas.js';
import { makeFleet } from '../fixtures/fleets.js';

const data = (id: string, over: Partial<DataSource> = {}): DataSource => ({
  id,
  name: id,
  type: 'department',
  status: 'planned',
  ...over,
});

/**
 *   produkt (Produktmanagement)
 *     bilder (Marketing)
 *       freigestellt (Marketing)
 *     preise (Vertrieb)
 *   crm (existing, Dataverse, nobody owes it)
 */
const nested = (): Fleet => {
  const base = makeFleet();
  return {
    ...base,
    dataSources: [
      data('produkt', { name: 'Produktdaten', owner: 'Produktmanagement', contact: 'Frau Bauer' }),
      data('bilder', { name: 'Bilder', parentId: 'produkt', owner: 'Marketing', contact: 'Herr Klein' }),
      data('freigestellt', { name: 'Freigestellt', parentId: 'bilder', owner: 'Marketing' }),
      data('preise', { name: 'Preise', parentId: 'produkt', owner: 'Vertrieb' }),
      data('crm', { name: 'CRM', type: 'dataverse', status: 'live' }),
    ],
    // Only the second agent references data, and only the top box.
    agents: base.agents.map((agent, index) =>
      index === 1 ? { ...agent, dataSourceIds: ['produkt'] } : { ...agent, dataSourceIds: [] },
    ),
  };
};

const agentAt = (fleet: Fleet, index: number) => {
  const agent = fleet.agents[index];
  if (!agent) throw new Error(`no agent at ${index}`);
  return agent;
};

describe('data has a source, and a department is one of them', () => {
  it('accepts a department as the source', () => {
    expect(DataSourceSchema.safeParse(data('x', { type: 'department' })).success).toBe(true);
  });

  it('records who provides it and who to ask', () => {
    const parsed = DataSourceSchema.parse(data('x', { owner: 'Marketing', contact: 'Herr Klein' }));
    expect(parsed).toMatchObject({ owner: 'Marketing', contact: 'Herr Klein' });
  });

  it('leaves provider and contact optional, so existing data needs neither', () => {
    const parsed = DataSourceSchema.parse(data('x', { type: 'dataverse', status: 'live' }));
    expect(parsed.owner).toBeUndefined();
    expect(parsed.contact).toBeUndefined();
  });
});

describe('nesting', () => {
  it('lists only top-level data as roots', () => {
    expect(dataRoots(nested()).map((d) => d.id)).toEqual(['produkt', 'crm']);
  });

  it('shows an item whose parent is missing at the top rather than hiding it', () => {
    const broken: Fleet = { ...nested(), dataSources: [data('orphan', { parentId: 'gone' })] };
    expect(dataRoots(broken).map((d) => d.id)).toEqual(['orphan']);
  });

  it('finds direct children and all descendants', () => {
    expect(dataChildren(nested(), 'produkt').map((d) => d.id)).toEqual(['bilder', 'preise']);
    expect(
      dataDescendants(nested(), 'produkt')
        .map((d) => d.id)
        .sort(),
    ).toEqual(['bilder', 'freigestellt', 'preise']);
  });

  it('does not hang on a nesting cycle', () => {
    const looped: Fleet = {
      ...nested(),
      dataSources: [data('a', { parentId: 'b' }), data('b', { parentId: 'a' })],
    };
    expect(dataDescendants(looped, 'a').map((d) => d.id)).toEqual(['b']);
  });
});

describe('integrity rejects broken nesting', () => {
  it('reports a missing parent', () => {
    const broken: Fleet = { ...nested(), dataSources: [data('x', { parentId: 'gone' })] };
    expect(checkFleetIntegrity(broken).map((i) => i.code)).toContain('data-parent-missing');
  });

  it('reports data inside itself', () => {
    const broken: Fleet = { ...nested(), dataSources: [data('x', { parentId: 'x' })] };
    expect(checkFleetIntegrity(broken).map((i) => i.code)).toContain('data-parent-self');
  });

  it('reports a cycle', () => {
    const broken: Fleet = {
      ...nested(),
      dataSources: [data('a', { parentId: 'b' }), data('b', { parentId: 'a' })],
    };
    expect(checkFleetIntegrity(broken).map((i) => i.code)).toContain('data-parent-cycle');
  });

  it('passes a properly nested fleet', () => {
    expect(checkFleetIntegrity(nested())).toEqual([]);
  });
});

describe('linking a parent brings its children', () => {
  it('gives an agent the whole box from one reference', () => {
    const fleet = nested();
    const agent = agentAt(fleet, 1);
    expect(agent.dataSourceIds).toEqual(['produkt']);
    expect(dataForAgent(fleet, agent).map((d) => d.id)).toEqual([
      'produkt',
      'bilder',
      'preise',
      'freigestellt',
    ]);
  });

  it('never lists the same item twice when parent and child are both attached', () => {
    const fleet = nested();
    const agent = { ...agentAt(fleet, 1), dataSourceIds: ['produkt', 'bilder'] };
    const ids = dataForAgent(fleet, agent).map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives nothing for an agent with no data', () => {
    const fleet = nested();
    expect(dataForAgent(fleet, { ...agentAt(fleet, 2), dataSourceIds: [] })).toEqual([]);
  });
});

describe('who provides what', () => {
  it('lists every provider once, in name order', () => {
    expect(dataProviders(nested())).toEqual(['Marketing', 'Produktmanagement', 'Vertrieb']);
  });

  it('does not split one provider over casing or stray spaces', () => {
    const messy: Fleet = {
      ...nested(),
      dataSources: [data('a', { owner: 'Marketing' }), data('b', { owner: '  marketing ' })],
    };
    expect(dataProviders(messy)).toEqual(['Marketing']);
  });

  it('matches a parent when a part of it is owed, so context is not filtered away', () => {
    const fleet = nested();
    const produkt = fleet.dataSources[0];
    if (!produkt) throw new Error('missing');
    // Produktdaten is Produktmanagement's, but Bilder inside it is Marketing's.
    expect(dataMatchesProvider(fleet, produkt, 'Marketing')).toBe(true);
    expect(dataMatchesProvider(fleet, produkt, 'Produktmanagement')).toBe(true);
    expect(dataMatchesProvider(fleet, produkt, 'HR')).toBe(false);
  });

  it('finds the agents waiting on one provider, through nesting', () => {
    const fleet = nested();
    const waiting = agentsWaitingOn(fleet, 'Marketing');
    // The agent references only Produktdaten, but Bilder inside it is Marketing's.
    expect(waiting.has(agentAt(fleet, 1).id)).toBe(true);
    expect(waiting.size).toBe(1);
  });

  it('finds nobody waiting on a provider that owes nothing', () => {
    expect(agentsWaitingOn(nested(), 'HR').size).toBe(0);
  });
});

describe('an inherited part still blocks whoever waits on the box', () => {
  it('names the agent under the part, not only under the box it references', () => {
    const fleet = nested();
    const agent = agentAt(fleet, 1);
    const bilder = dataObligations(fleet)
      .flatMap((group) => group.obligations)
      .find(({ source }) => source.id === 'bilder');
    if (!bilder) throw new Error('Bilder is missing from the obligations');
    // The agent references only Produktdaten. Marketing still owes it Bilder.
    expect(bilder.waitingAgents.map((a) => a.id)).toEqual([agent.id]);
  });

  it('leaves an item nobody reaches with nobody waiting', () => {
    const orphan = dataObligations(nested())
      .flatMap((group) => group.obligations)
      .find(({ source }) => source.id === 'crm');
    if (!orphan) throw new Error('CRM is missing from the obligations');
    expect(orphan.waitingAgents).toEqual([]);
  });

  it('carries the Ansprechpartner through to the obligation', () => {
    const bilder = dataObligations(nested())
      .flatMap((group) => group.obligations)
      .find(({ source }) => source.id === 'bilder');
    expect(bilder?.source.contact).toBe('Herr Klein');
  });
});
