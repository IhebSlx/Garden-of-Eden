/** SPEC 7 - versioned JSON export/import, Zod-validated with readable errors. */
import { describe, expect, it } from 'vitest';
import { migrateFleetDocument } from '../../src/model/migrations.js';
import { isFleetValid } from '../../src/model/integrity.js';
import { SCHEMA_VERSION } from '../../src/model/schemas.js';
import type { Fleet } from '../../src/model/schemas.js';
import { exportFleetToJson, parseFleetJson, suggestFleetFileName } from '../../src/store/io.js';
import { AGENT, makeFleet } from '../fixtures/fleets.js';

describe('export / import round-trip', () => {
  it('returns an identical fleet', () => {
    const fleet = makeFleet();
    const result = parseFleetJson(exportFleetToJson(fleet));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fleet).toEqual(fleet);
  });

  it('writes pretty, newline-terminated JSON so exports stay diffable', () => {
    const json = exportFleetToJson(makeFleet());
    expect(json.endsWith('\n')).toBe(true);
    expect(json).toContain('\n  "schemaVersion": 1');
  });

  it('preserves branching workflow steps and manual positions', () => {
    const fleet = makeFleet();
    const pricing = fleet.agents.find((a) => a.id === AGENT.pricing);
    if (pricing) pricing.position = { x: 42, y: -17 };

    const result = parseFleetJson(exportFleetToJson(fleet));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fleet.tools[0]?.workflow?.steps[1]?.next).toEqual(['stp_send', 'stp_escalate']);
    expect(result.fleet.agents.find((a) => a.id === AGENT.pricing)?.position).toEqual({ x: 42, y: -17 });
  });
});

describe('parseFleetJson error reporting', () => {
  it('rejects malformed JSON with a readable message', () => {
    const result = parseFleetJson('{ not json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('not valid JSON');
  });

  it('rejects a non-object document', () => {
    const result = parseFleetJson('[]');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('expected a JSON object');
  });

  it('rejects a document without schemaVersion', () => {
    const { schemaVersion: _dropped, ...rest } = makeFleet();
    const result = parseFleetJson(JSON.stringify(rest));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('missing "schemaVersion"');
  });

  it('refuses a file from a newer app version rather than half-reading it', () => {
    const result = parseFleetJson(JSON.stringify({ ...makeFleet(), schemaVersion: 99 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('newer version of the app');
  });

  it('refuses an older schemaVersion with no migration path', () => {
    const result = parseFleetJson(JSON.stringify({ ...makeFleet(), schemaVersion: 0 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('no migration path');
  });

  it('names the offending field for a structural error', () => {
    const fleet = makeFleet();
    const agent = fleet.agents[1];
    if (agent) agent.name = '';
    const result = parseFleetJson(JSON.stringify(fleet));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.startsWith('agents[1].name:'))).toBe(true);
  });

  it('reports an integrity violation from the same entry point', () => {
    const fleet = makeFleet();
    fleet.edges.push({
      id: 'edg_ghost',
      source: AGENT.sales,
      target: 'agt_missing',
      kind: 'hierarchy',
      status: 'planned',
    });
    const result = parseFleetJson(JSON.stringify(fleet));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('agt_missing'))).toBe(true);
  });
});

describe('migrateFleetDocument', () => {
  it('accepts the current version', () => {
    expect(migrateFleetDocument(makeFleet()).ok).toBe(true);
    expect(SCHEMA_VERSION).toBe(1);
  });

  it('rejects null and primitives', () => {
    expect(migrateFleetDocument(null).ok).toBe(false);
    expect(migrateFleetDocument('fleet').ok).toBe(false);
    expect(migrateFleetDocument(7).ok).toBe(false);
  });
});

describe('suggestFleetFileName', () => {
  it('slugifies the fleet name', () => {
    expect(suggestFleetFileName({ ...makeFleet(), name: 'Sales & Ops Fleet' })).toBe(
      'sales-ops-fleet.fleet.json',
    );
  });

  it('falls back when the name has no usable characters', () => {
    expect(suggestFleetFileName({ ...makeFleet(), name: '///' })).toBe('fleet.fleet.json');
  });
});

describe('the Ansprechpartner moved from the data item to the department', () => {
  /** A document written while the contact still sat on each data item. */
  const older = () => {
    const fleet = makeFleet();
    const department = fleet.agents.find((a) => a.kind === 'department');
    if (!department) throw new Error('no department in the fixture');
    return {
      document: {
        ...fleet,
        dataSources: [
          ...fleet.dataSources,
          {
            id: 'dsr_bilder',
            name: 'Bilder',
            type: 'sharepoint',
            status: 'planned',
            owner: department.name,
            contact: 'Herr Klein',
          },
        ],
      },
      departmentId: department.id,
      departmentName: department.name,
    };
  };

  it('hoists the name onto the department that provides the item', () => {
    const { document, departmentId } = older();
    const result = migrateFleetDocument(document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fleet.agents.find((a) => a.id === departmentId)?.contact).toBe('Herr Klein');
  });

  it('does not leave the name on the data item as well', () => {
    const { document } = older();
    const result = migrateFleetDocument(document);
    if (!result.ok) throw new Error(result.errors.join(' '));
    const source = result.fleet.dataSources.find((d) => d.id === 'dsr_bilder');
    expect(source).toBeDefined();
    expect('contact' in (source ?? {})).toBe(false);
  });

  it('matches the department however the owner was capitalised', () => {
    const { document, departmentId, departmentName } = older();
    const shouted = {
      ...document,
      dataSources: document.dataSources.map((d) =>
        d.id === 'dsr_bilder' ? { ...d, owner: departmentName.toUpperCase() } : d,
      ),
    };
    const result = migrateFleetDocument(shouted);
    if (!result.ok) throw new Error(result.errors.join(' '));
    expect(result.fleet.agents.find((a) => a.id === departmentId)?.contact).toBe('Herr Klein');
  });

  it('never overwrites a contact the department already has', () => {
    const { document, departmentId } = older();
    const already = {
      ...document,
      agents: document.agents.map((a) => (a.id === departmentId ? { ...a, contact: 'Frau Bauer' } : a)),
    };
    const result = migrateFleetDocument(already);
    if (!result.ok) throw new Error(result.errors.join(' '));
    expect(result.fleet.agents.find((a) => a.id === departmentId)?.contact).toBe('Frau Bauer');
  });

  it('leaves a document with no contacts exactly as it was', () => {
    const fleet = makeFleet();
    const result = migrateFleetDocument(fleet);
    if (!result.ok) throw new Error(result.errors.join(' '));
    expect(result.fleet).toEqual(fleet);
  });
});

/**
 * An item nobody uses is still work somebody did.
 *
 * The library is flat on the fleet and agents only reference it by id, so an
 * unattached skill, tool or data source is a legal state — you can add one in the
 * Library before deciding which agent gets it. Export must carry it: a backup
 * that quietly drops whatever is not wired up yet is worse than no backup, because
 * it looks complete.
 */
describe('items attached to no agent', () => {
  const withOrphans = (): Fleet => {
    const fleet = makeFleet();
    fleet.skills.push({ id: 'skl_orphan', name: 'Angebot prüfen' });
    fleet.tools.push({
      id: 'tol_orphan',
      name: 'Objektportal',
      description: 'Liest Bauprojekte aus dem Objektportal.',
      type: 'python',
    });
    fleet.dataSources.push({
      id: 'dsc_orphan',
      name: 'Preisliste 2026',
      status: 'planned',
      owner: 'Vertrieb',
    });
    return fleet;
  };

  it('are a valid fleet — nothing has to be attached to exist', () => {
    expect(isFleetValid(withOrphans())).toBe(true);
  });

  it('survive the export and come back whole', () => {
    const fleet = withOrphans();
    const result = parseFleetJson(exportFleetToJson(fleet));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.fleet.skills.find((s) => s.id === 'skl_orphan')?.name).toBe('Angebot prüfen');
    expect(result.fleet.tools.find((t) => t.id === 'tol_orphan')?.type).toBe('python');
    // Not just the name: who owes it and what state it is in come back too.
    const data = result.fleet.dataSources.find((d) => d.id === 'dsc_orphan');
    expect(data?.owner).toBe('Vertrieb');
    expect(data?.status).toBe('planned');
  });

  it('are in the file whether or not any agent references them', () => {
    const fleet = withOrphans();
    const referenced = new Set([
      ...fleet.agents.flatMap((a) => a.skillIds),
      ...fleet.agents.flatMap((a) => a.toolIds),
      ...fleet.agents.flatMap((a) => a.dataSourceIds),
    ]);
    // The premise of the test: these three really are attached to nobody.
    expect(referenced.has('skl_orphan')).toBe(false);
    expect(referenced.has('tol_orphan')).toBe(false);
    expect(referenced.has('dsc_orphan')).toBe(false);

    const json = exportFleetToJson(fleet);
    expect(json).toContain('Angebot prüfen');
    expect(json).toContain('Objektportal');
    expect(json).toContain('Preisliste 2026');
  });
});
