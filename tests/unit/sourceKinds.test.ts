/**
 * Source kinds: the list behind the Source dropdown, owned by the fleet.
 *
 * Where data comes from is the user's world — SAP-Belege, Objektportal, a Dynamics
 * CRM — so a closed enum of five was wrong. The built-in five stay the app's,
 * because SPEC §6 fixes their dot colours; anything a fleet adds is the fleet's to
 * rename, recolour and remove.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetIdFactory, sequentialIdFactory, setIdFactory } from '../../src/model/ids.js';
import { checkFleetIntegrity } from '../../src/model/integrity.js';
import { isBuiltInSource, sourceLabel } from '../../src/model/schemas.js';
import type { Fleet } from '../../src/model/schemas.js';
import { selectActiveFleet, useFleetStore } from '../../src/store/fleetStore.js';
import { allSourceKinds, dataDotColor, DATA_TYPE_UNSET_COLOR } from '../../src/ui/palette.js';
import { makeFleet } from '../fixtures/fleets.js';

const store = () => useFleetStore.getState();

/** A fleet whose agents reference no library, for testing the library alone. */
const bare = (dataSources: Fleet['dataSources']): Fleet => {
  const base = makeFleet();
  return {
    ...base,
    agents: base.agents.map((agent) => ({ ...agent, dataSourceIds: [] })),
    dataSources,
  };
};
const active = (): Fleet => {
  const fleet = selectActiveFleet(store());
  if (!fleet) throw new Error('no active fleet');
  return fleet;
};

beforeEach(() => {
  setIdFactory(sequentialIdFactory());
  store().importFleetObject(makeFleet());
});

describe('the list of source kinds', () => {
  it('offers the built-in five before a fleet adds anything', () => {
    expect(allSourceKinds(active()).map((k) => k.id)).toEqual([
      'md',
      'dataverse',
      'sharepoint',
      'file',
      'department',
    ]);
  });

  it('puts a fleet kind beside them, with its own colour', () => {
    const added = store().addSourceKind('SAP-Belege', '#f6b954');
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const kinds = allSourceKinds(active());
    expect(kinds).toHaveLength(6);
    expect(kinds[5]).toMatchObject({ id: added.id, name: 'SAP-Belege', color: '#f6b954' });
    expect(dataDotColor(added.id, active())).toBe('#f6b954');
  });

  it('names a fleet kind wherever a source is named', () => {
    const added = store().addSourceKind('Objektportal', '#38e1ff');
    if (!added.ok) throw new Error('add failed');
    // `sourceLabel` has no fleet, so it falls back to the id rather than to nothing.
    expect(sourceLabel(added.id)).toBe(added.id);
    expect(allSourceKinds(active()).find((k) => k.id === added.id)?.name).toBe('Objektportal');
  });

  it('refuses a nameless kind, and a duplicate of any name already offered', () => {
    expect(store().addSourceKind('   ', '#38e1ff')).toMatchObject({ ok: false });
    expect(store().addSourceKind('SharePoint', '#38e1ff')).toMatchObject({ ok: false });
    expect(store().addSourceKind('  sharepoint ', '#38e1ff')).toMatchObject({ ok: false });
  });

  it('renames and recolours a fleet kind', () => {
    const added = store().addSourceKind('SAP', '#f6b954');
    if (!added.ok) throw new Error('add failed');

    expect(store().updateSourceKind(added.id, { name: 'SAP-Belege' }).ok).toBe(true);
    expect(store().updateSourceKind(added.id, { color: '#3ce8b0' }).ok).toBe(true);
    expect(allSourceKinds(active()).find((k) => k.id === added.id)).toMatchObject({
      name: 'SAP-Belege',
      color: '#3ce8b0',
    });
  });

  it('will not rename a fleet kind onto a name already in use', () => {
    const first = store().addSourceKind('SAP', '#f6b954');
    const second = store().addSourceKind('Objektportal', '#38e1ff');
    if (!first.ok || !second.ok) throw new Error('add failed');
    expect(store().updateSourceKind(second.id, { name: 'SAP' })).toMatchObject({ ok: false });
    expect(store().updateSourceKind(second.id, { name: 'Markdown' })).toMatchObject({ ok: false });
  });

  it('leaves the built-in five alone: SPEC 6 fixes their colours', () => {
    expect(store().updateSourceKind('sharepoint', { name: 'SP' })).toMatchObject({ ok: false });
    expect(store().deleteSourceKind('sharepoint')).toMatchObject({ ok: false });
    expect(isBuiltInSource('sharepoint')).toBe(true);
  });

  it('removes a kind nothing uses', () => {
    const added = store().addSourceKind('SAP', '#f6b954');
    if (!added.ok) throw new Error('add failed');
    expect(store().deleteSourceKind(added.id).ok).toBe(true);
    expect(allSourceKinds(active())).toHaveLength(5);
  });

  it('refuses to remove a kind data still points at, and names what is in the way', () => {
    const added = store().addSourceKind('SAP', '#f6b954');
    if (!added.ok) throw new Error('add failed');
    const item = store().addDataSource({ name: 'SAP-Belege 2026', type: added.id, status: 'live' });
    if (!item.ok) throw new Error('add data failed');

    const result = store().deleteSourceKind(added.id);
    expect(result).toMatchObject({ ok: false });
    if (result.ok) return;
    expect(result.blockedBy).toEqual(['SAP-Belege 2026']);

    // Pointing the item elsewhere clears the way.
    expect(store().updateDataSource(item.id, { type: 'dataverse' }).ok).toBe(true);
    expect(store().deleteSourceKind(added.id).ok).toBe(true);
  });

  it('is undoable, like any other edit to the document', () => {
    const added = store().addSourceKind('SAP', '#f6b954');
    if (!added.ok) throw new Error('add failed');
    expect(allSourceKinds(active())).toHaveLength(6);

    useFleetStore.temporal.getState().undo();
    expect(allSourceKinds(active())).toHaveLength(5);
  });
});

describe('integrity holds the line the enum used to', () => {
  it('accepts data pointing at a kind the fleet declares', () => {
    const added = store().addSourceKind('SAP', '#f6b954');
    if (!added.ok) throw new Error('add failed');
    store().addDataSource({ name: 'Belege', type: added.id, status: 'live' });
    expect(checkFleetIntegrity(active())).toEqual([]);
  });

  it('rejects data pointing at a kind that does not exist', () => {
    const fleet = bare([{ id: 'dsr_x', name: 'Belege', type: 'skd_ghost', status: 'live' }]);
    const codes = checkFleetIntegrity(fleet).map((issue) => issue.code);
    expect(codes).toContain('data-source-kind-missing');
  });

  it('rejects a fleet kind that shadows a built-in', () => {
    const fleet: Fleet = {
      ...makeFleet(),
      sourceKinds: [{ id: 'sharepoint', name: 'Mine', color: '#38e1ff' }],
    };
    const codes = checkFleetIntegrity(fleet).map((issue) => issue.code);
    expect(codes).toContain('source-kind-shadows-built-in');
  });

  it('still accepts data with no source at all', () => {
    const fleet = bare([{ id: 'dsr_x', name: 'Kampagnen-Kalender', status: 'planned' }]);
    expect(checkFleetIntegrity(fleet)).toEqual([]);
    expect(dataDotColor(undefined, fleet)).toBe(DATA_TYPE_UNSET_COLOR);
  });

  it('paints a deleted kind neutrally rather than not at all', () => {
    // A document can arrive with a dangling type; the dot must still render.
    expect(dataDotColor('skd_ghost', makeFleet())).toBe(DATA_TYPE_UNSET_COLOR);
  });
});

describe('a document written before source kinds existed', () => {
  it('parses without them and reports none', () => {
    const { sourceKinds: _absent, ...older } = { ...makeFleet(), sourceKinds: [] };
    expect(allSourceKinds(older as Fleet)).toHaveLength(5);
    expect(checkFleetIntegrity(older as Fleet)).toEqual([]);
  });
});

afterEach(() => {
  resetIdFactory();
});
