/**
 * Data as the user's model of it: a thing with a SOURCE (a system, or a department),
 * marked as existing or as owed by someone, and nestable — "Produktdaten" holds
 * "Bilder" holds "Freigestellt".
 */
import { describe, expect, it } from 'vitest';
import { checkFleetIntegrity } from '../../src/model/integrity.js';
import {
  contactForProvider,
  dataObligations,
  departmentBriefing,
  departmentWorkload,
  dataChildren,
  dataDescendants,
  dataForAgent,
  ANY_DATA,
  dataItemMatches,
  dataMatchesQuery,
  dataProviders,
  providerOptions,
  dataRoots,
} from '../../src/model/selectors.js';
import { DataSourceSchema, sourceLabel } from '../../src/model/schemas.js';
import { DATA_TYPE_COLOR, DATA_TYPE_UNSET_COLOR, dataDotColor } from '../../src/ui/palette.js';
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
      data('produkt', { name: 'Produktdaten', owner: 'Produktmanagement' }),
      data('bilder', { name: 'Bilder', parentId: 'produkt', owner: 'Marketing' }),
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

  it('records the department that has to provide it', () => {
    const parsed = DataSourceSchema.parse(data('x', { owner: 'Marketing' }));
    expect(parsed).toMatchObject({ owner: 'Marketing' });
  });

  it('leaves the provider optional, so existing data needs none', () => {
    const parsed = DataSourceSchema.parse(data('x', { type: 'dataverse', status: 'live' }));
    expect(parsed.owner).toBeUndefined();
  });

  it('does not carry an Ansprechpartner of its own — that belongs to the department', () => {
    const parsed = DataSourceSchema.parse({ ...data('x'), contact: 'Herr Klein' });
    expect('contact' in parsed).toBe(false);
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
    const by = (name: string) => ({ ...ANY_DATA, provider: { kind: 'provider' as const, name } });
    // Produktdaten is Produktmanagement's, but Bilder inside it is Marketing's.
    expect(dataMatchesQuery(fleet, produkt, by('Marketing'))).toBe(true);
    expect(dataMatchesQuery(fleet, produkt, by('Produktmanagement'))).toBe(true);
    expect(dataMatchesQuery(fleet, produkt, by('HR'))).toBe(false);
  });

  it('keeps a box in view when a part of it is owed, so context is not filtered away', () => {
    const fleet = nested();
    const produkt = fleet.dataSources[0];
    const crm = fleet.dataSources[4];
    if (!produkt || !crm) throw new Error('missing');
    const marketing = { ...ANY_DATA, provider: { kind: 'provider' as const, name: 'Marketing' } };
    // This is what the Data library's "Provided by" filter shows for Marketing.
    expect(dataMatchesQuery(fleet, produkt, marketing)).toBe(true);
    expect(dataMatchesQuery(fleet, crm, marketing)).toBe(false);
  });

  it('finds nothing at all for a department that owes nothing', () => {
    const fleet = nested();
    const hr = { ...ANY_DATA, provider: { kind: 'provider' as const, name: 'HR' } };
    expect(fleet.dataSources.filter((d) => dataMatchesQuery(fleet, d, hr))).toEqual([]);
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

  it('reads the Ansprechpartner off the department, not off each item it provides', () => {
    const base = nested();
    const marketing = base.agents.find((a) => a.kind === 'department');
    if (!marketing) throw new Error('no department in the fixture');
    const fleet: Fleet = {
      ...base,
      agents: base.agents.map((a) => (a.id === marketing.id ? { ...a, contact: 'Herr Klein' } : a)),
      dataSources: base.dataSources.map((d) =>
        d.id === 'bilder' ? { ...d, owner: marketing.name } : d,
      ),
    };
    expect(contactForProvider(fleet, marketing.name)).toBe('Herr Klein');
    // One name, however many items that department provides.
    expect(contactForProvider(fleet, marketing.name.toUpperCase())).toBe('Herr Klein');
  });

  it('has no Ansprechpartner for a provider that is not a department here', () => {
    expect(contactForProvider(nested(), 'Produktmanagement')).toBeNull();
    expect(contactForProvider(nested(), undefined)).toBeNull();
  });
});

describe('who a data item can be assigned to', () => {
  it('offers every department, including those that owe nothing yet', () => {
    const fleet = nested();
    const departments = fleet.agents.filter((a) => a.kind === 'department').map((a) => a.name);
    expect(departments.length).toBeGreaterThan(0);
    for (const name of departments) expect(providerOptions(fleet)).toContain(name);
  });

  it('keeps providers that are not departments, so nothing already named is lost', () => {
    // Produktmanagement and Vertrieb provide data but are not agents in this fleet.
    expect(providerOptions(nested())).toEqual(expect.arrayContaining(['Produktmanagement', 'Vertrieb']));
  });

  it('lists a name once when a department is also a named provider', () => {
    const fleet = nested();
    const department = fleet.agents.find((a) => a.kind === 'department');
    if (!department) throw new Error('no department in the fixture');
    const withOverlap: Fleet = {
      ...fleet,
      dataSources: [...fleet.dataSources, data('extra', { owner: department.name.toUpperCase() })],
    };
    const hits = providerOptions(withOverlap).filter((o) => o.toLowerCase() === department.name.toLowerCase());
    expect(hits).toHaveLength(1);
  });
});

describe('a source may be undecided', () => {
  it('accepts data with no source at all', () => {
    const parsed = DataSourceSchema.safeParse({
      id: 'kalender',
      name: 'Kampagnen-Kalender',
      status: 'planned',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.type).toBeUndefined();
  });

  it('names it as an open question, not as a blank', () => {
    expect(sourceLabel(undefined)).toBe('not assigned');
    expect(sourceLabel('sharepoint')).toBe('SharePoint');
  });

  it('still paints a dot, so a row never renders colourless', () => {
    expect(dataDotColor(undefined)).toBe(DATA_TYPE_UNSET_COLOR);
    expect(dataDotColor('sharepoint')).toBe(DATA_TYPE_COLOR.sharepoint);
  });

  it('passes integrity with an undecided source', () => {
    const base = nested();
    const fleet: Fleet = {
      ...base,
      dataSources: base.dataSources.map((d, index) =>
        index === 0 ? { ...d, type: undefined } : d,
      ),
    };
    expect(checkFleetIntegrity(fleet)).toEqual([]);
  });
});

describe('filtering the data by state, source and department at once', () => {
  const by = (name: string) => ({ kind: 'provider' as const, name });

  it('leaves the whole library when every axis is open', () => {
    const fleet = nested();
    expect(fleet.dataSources.every((d) => dataMatchesQuery(fleet, d, ANY_DATA))).toBe(true);
  });

  it('filters by state on its own', () => {
    const fleet = nested();
    const existing = { ...ANY_DATA, status: 'live' as const };
    expect(fleet.dataSources.filter((d) => dataItemMatches(d, existing)).map((d) => d.id)).toEqual([
      'crm',
    ]);
  });

  it('filters by source, and finds the undecided ones', () => {
    const base = nested();
    const fleet: Fleet = {
      ...base,
      dataSources: base.dataSources.map((d) => (d.id === 'preise' ? { ...d, type: undefined } : d)),
    };
    const undecided = { ...ANY_DATA, source: 'unassigned' as const };
    expect(fleet.dataSources.filter((d) => dataItemMatches(d, undecided)).map((d) => d.id)).toEqual([
      'preise',
    ]);
    const dataverse = { ...ANY_DATA, source: 'dataverse' as const };
    expect(fleet.dataSources.filter((d) => dataItemMatches(d, dataverse)).map((d) => d.id)).toEqual([
      'crm',
    ]);
  });

  it('finds what nobody has been asked for', () => {
    const fleet = nested();
    const nobody = { ...ANY_DATA, provider: { kind: 'none' as const } };
    expect(fleet.dataSources.filter((d) => dataItemMatches(d, nobody)).map((d) => d.id)).toEqual([
      'crm',
    ]);
  });

  it('intersects the axes rather than adding them up', () => {
    const fleet = nested();
    // Marketing owes Bilder and Freigestellt, both still To be provided.
    const owed = { ...ANY_DATA, provider: by('Marketing'), status: 'planned' as const };
    expect(fleet.dataSources.filter((d) => dataItemMatches(d, owed)).map((d) => d.id)).toEqual([
      'bilder',
      'freigestellt',
    ]);
    // Nothing of Marketing's is Existing, so the same provider with a different
    // state finds nobody.
    const done = { ...ANY_DATA, provider: by('Marketing'), status: 'live' as const };
    expect(fleet.dataSources.filter((d) => dataItemMatches(d, done))).toEqual([]);
  });

  it('never keeps a box whose parts each answer only half the query', () => {
    const base = nested();
    // Produktdaten holds Bilder (Marketing, owed) and Preise (Vertrieb, existing).
    const fleet: Fleet = {
      ...base,
      dataSources: base.dataSources.map((d) => (d.id === 'preise' ? { ...d, status: 'live' } : d)),
    };
    const produkt = fleet.dataSources[0];
    if (!produkt) throw new Error('missing');

    // Marketing + Existing is answered by neither part, so the box goes too.
    const query = { ...ANY_DATA, provider: by('Marketing'), status: 'live' as const };
    expect(dataMatchesQuery(fleet, produkt, query)).toBe(false);

    // Vertrieb + Existing is answered by Preise, so the box stays to hold it.
    const held = { ...ANY_DATA, provider: by('Vertrieb'), status: 'live' as const };
    expect(dataMatchesQuery(fleet, produkt, held)).toBe(true);
  });

  it('ignores casing and stray spaces in a department name', () => {
    const fleet = nested();
    const messy = { ...ANY_DATA, provider: by('  marKETing ') };
    expect(dataItemMatches({ ...fleet.dataSources[1]! }, messy)).toBe(true);
  });
});

describe("one department's own page", () => {
  /** Marketing owes Bilder and Freigestellt; one agent is linked to the whole box. */
  const withMarketing = (): Fleet => {
    const base = nested();
    const marketing = base.agents.find((a) => a.kind === 'department');
    if (!marketing) throw new Error('no department in the fixture');
    return {
      ...base,
      agents: base.agents.map((a) =>
        a.id === marketing.id ? { ...a, name: 'Marketing', contact: 'A. Vogt' } : a,
      ),
      dataSources: base.dataSources.map((d) =>
        d.id === 'bilder'
          ? { ...d, owner: 'Marketing', requirement: 'Jedes Produktbild, 2000 px.' }
          : d.id === 'freigestellt'
            ? { ...d, owner: 'Marketing' }
            : d,
      ),
    };
  };

  it('names the department, the person to ask and what they owe', () => {
    const work = departmentWorkload(withMarketing(), 'Marketing');
    expect(work).not.toBeNull();
    expect(work?.owner).toBe('Marketing');
    expect(work?.contact).toBe('A. Vogt');
    expect(work?.obligations.map(({ source }) => source.id)).toEqual(['bilder', 'freigestellt']);
    expect(work?.outstanding).toBe(2);
  });

  it('puts what is owed before what is done, so the ask is never buried', () => {
    const base = withMarketing();
    const fleet: Fleet = {
      ...base,
      dataSources: base.dataSources.map((d) =>
        d.id === 'bilder' ? { ...d, status: 'live' as const } : d,
      ),
    };
    const work = departmentWorkload(fleet, 'Marketing');
    // freigestellt is still owed, so it comes first even though bilder is its parent.
    expect(work?.obligations.map(({ source }) => source.id)).toEqual(['freigestellt', 'bilder']);
  });

  it('counts only the agents an outstanding item actually holds up', () => {
    const work = departmentWorkload(withMarketing(), 'Marketing');
    // The one agent linked to Produktdaten gets Bilder with it, and Bilder is owed.
    expect(work?.blocking).toHaveLength(1);

    const base = withMarketing();
    const delivered: Fleet = {
      ...base,
      dataSources: base.dataSources.map((d) =>
        d.owner === 'Marketing' ? { ...d, status: 'live' as const } : d,
      ),
    };
    expect(departmentWorkload(delivered, 'Marketing')?.blocking).toEqual([]);
  });

  it('finds a department however the owner was capitalised', () => {
    expect(departmentWorkload(withMarketing(), '  marKETing ')?.owner).toBe('Marketing');
  });

  it('has no page for a department nobody has asked for anything', () => {
    expect(departmentWorkload(withMarketing(), 'HR')).toBeNull();
    expect(departmentWorkload(withMarketing(), '')).toBeNull();
  });
});

describe('the briefing a department actually receives', () => {
  const withMarketing = (): Fleet => {
    const base = nested();
    const marketing = base.agents.find((a) => a.kind === 'department');
    if (!marketing) throw new Error('no department in the fixture');
    return {
      ...base,
      agents: base.agents.map((a) =>
        a.id === marketing.id ? { ...a, name: 'Marketing', contact: 'A. Vogt' } : a,
      ),
      dataSources: base.dataSources.map((d) =>
        d.id === 'bilder'
          ? { ...d, owner: 'Marketing', requirement: 'Jedes Produktbild, 2000 px.' }
          : d.id === 'freigestellt'
            ? { ...d, owner: 'Marketing', type: undefined }
            : d,
      ),
    };
  };

  it('leads with the department and the person to ask', () => {
    const text = departmentBriefing(withMarketing(), 'Marketing');
    expect(text).toContain('Data needed from Marketing');
    expect(text).toContain('Ansprechpartner: A. Vogt');
  });

  it('carries the requirement, or says it is still missing', () => {
    const text = departmentBriefing(withMarketing(), 'Marketing');
    expect(text).toContain('Jedes Produktbild, 2000 px.');
    expect(text).toContain('What finished looks like: still to be written.');
  });

  it('names the source, undecided included', () => {
    const text = departmentBriefing(withMarketing(), 'Marketing');
    expect(text).toContain('Bilder — A department');
    expect(text).toContain('Freigestellt — not assigned');
  });

  it('never mentions another department\'s work', () => {
    const text = departmentBriefing(withMarketing(), 'Marketing');
    expect(text).not.toContain('Preise');
    expect(text).not.toContain('CRM');
  });

  it('says so plainly when nothing is outstanding', () => {
    const base = withMarketing();
    const done: Fleet = {
      ...base,
      dataSources: base.dataSources.map((d) =>
        d.owner === 'Marketing' ? { ...d, status: 'live' as const } : d,
      ),
    };
    const text = departmentBriefing(done, 'Marketing');
    expect(text).toContain('Everything asked for has been provided');
    expect(text).toContain('Already provided: Bilder, Freigestellt.');
  });

  it('is empty for a department with no work, rather than a header with nothing under it', () => {
    expect(departmentBriefing(withMarketing(), 'HR')).toBe('');
  });
});
