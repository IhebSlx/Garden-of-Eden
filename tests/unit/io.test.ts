/** SPEC 7 - versioned JSON export/import, Zod-validated with readable errors. */
import { describe, expect, it } from 'vitest';
import { migrateFleetDocument } from '../../src/model/migrations.js';
import { SCHEMA_VERSION } from '../../src/model/schemas.js';
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
