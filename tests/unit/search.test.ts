/** SPEC 5.10 + 8.3 - weighted fielded fuzzy search with DE-EN synonyms. */
import { describe, expect, it } from 'vitest';
import { buildSearchIndex, searchFleet } from '../../src/search/index.js';
import { expandToken, SYNONYM_GROUPS } from '../../src/search/synonyms.js';
import { solarluxFleet } from '../../src/model/seed.js';

const index = buildSearchIndex(solarluxFleet());
const names = (query: string, limit?: number): string[] =>
  searchFleet(index, query, limit).map((r) => r.agent.name);

describe('synonyms', () => {
  it('expands a German term to its English partners and back', () => {
    expect(expandToken('Angebot')).toContain('offer');
    expect(expandToken('offer')).toContain('angebot');
    expect(expandToken('Vertrieb')).toContain('sales');
    expect(expandToken('sales')).toContain('vertrieb');
  });

  it('keeps the typed word first so an exact hit outranks a synonym', () => {
    expect(expandToken('sales')[0]).toBe('sales');
  });

  it('returns the token itself when it has no group', () => {
    expect(expandToken('zzzz')).toEqual(['zzzz']);
  });

  it('ignores empty input', () => {
    expect(expandToken('   ')).toEqual([]);
  });

  it('has no duplicate terms inside a group', () => {
    for (const group of SYNONYM_GROUPS) {
      expect(new Set(group).size).toBe(group.length);
    }
  });
});

describe('searchFleet', () => {
  it('returns nothing for an empty query', () => {
    expect(searchFleet(index, '')).toEqual([]);
    expect(searchFleet(index, '   ')).toEqual([]);
  });

  it('finds an agent by name and reports the reason', () => {
    const results = searchFleet(index, 'Marketing');
    expect(results[0]?.agent.name).toBe('Marketing');
    expect(results[0]?.field).toBe('name');
  });

  it('ranks a name hit above a role hit', () => {
    const results = searchFleet(index, 'Marketing');
    const marketingIndex = results.findIndex((r) => r.agent.name === 'Marketing');
    expect(marketingIndex).toBe(0);
  });

  it('tolerates a typo', () => {
    expect(names('Markting')).toContain('Marketing');
    expect(names('Objektvertieb')).toContain('Objektvertrieb');
  });

  it('finds by role text', () => {
    const results = searchFleet(index, 'onboarding');
    expect(results.map((r) => r.agent.name)).toContain('Onboarding Guide');
  });

  it('finds by attached skill', () => {
    const results = searchFleet(index, 'BANT');
    expect(results[0]?.agent.name).toBe('Lead Qualifier');
    expect(results[0]?.field).toBe('skills');
  });

  it('finds by attached tool and by tool type label', () => {
    expect(names('DeepL')).toContain('Translator DE/EN');
    expect(names('python')).toContain('Content Writer');
  });

  it('finds by data source name', () => {
    expect(names('Bauprojekte')).toContain('Objektvertrieb');
  });

  it('finds every Planned agent by status', () => {
    const fleet = solarluxFleet();
    const planned = fleet.agents.filter((a) => a.status === 'planned').map((a) => a.name);
    const found = names('planned', 20);
    for (const name of planned) expect(found).toContain(name);
  });

  it('also matches agents whose DATA source is Planned - data status is searchable (SPEC 5.10)', () => {
    const results = searchFleet(index, 'planned', 20);
    const fleet = solarluxFleet();
    // Every hit is justified: either the agent is Planned, or one of its data sources is.
    for (const result of results) {
      const viaAgent = result.agent.status === 'planned';
      const viaData = result.agent.dataSourceIds.some(
        (id) => fleet.dataSources.find((d) => d.id === id)?.status === 'planned',
      );
      expect(viaAgent || viaData).toBe(true);
    }
  });

  it('finds shared agents by the derived word "shared"', () => {
    const results = searchFleet(index, 'shared', 20).map((r) => r.agent.name);
    expect(results).toContain('PowerPoint Creator');
    expect(results).toContain('Translator DE/EN');
  });

  it('crosses languages through the synonym table', () => {
    // "sales" must reach the German-named Objektvertrieb via its role text.
    expect(names('sales', 20)).toContain('Objektvertrieb');
    // "Praesentation" must reach the English-named PowerPoint Creator.
    expect(names('powerpoint', 20)).toContain('PowerPoint Creator');
  });

  it('requires every token to match (AND, not OR)', () => {
    const both = names('lead qualifier');
    expect(both).toContain('Lead Qualifier');

    // "marketing" and "bant" never co-occur on one agent.
    expect(searchFleet(index, 'marketing bant')).toEqual([]);
  });

  it('narrows as tokens are added', () => {
    const wide = searchFleet(index, 'guide', 20).length;
    const narrow = searchFleet(index, 'guide onboarding', 20).length;
    expect(narrow).toBeLessThanOrEqual(wide);
    expect(narrow).toBeGreaterThan(0);
  });

  it('respects the result limit', () => {
    expect(searchFleet(index, 'a', 3).length).toBeLessThanOrEqual(3);
  });

  it('returns nothing for a term that is in no field', () => {
    expect(searchFleet(index, 'zzzzqqqq')).toEqual([]);
  });

  it('is stable for the same query', () => {
    expect(searchFleet(index, 'lead')).toEqual(searchFleet(index, 'lead'));
  });
});
