/** SPEC 5.8 (create/edit/delete/unlink), 5.11 (fleets) and 8.1 (undo/redo). */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetIdFactory, sequentialIdFactory, setIdFactory } from '../../src/model/ids.js';
import { checkFleetIntegrity } from '../../src/model/integrity.js';
import { contactForProvider, instances, isShared } from '../../src/model/selectors.js';
import type { Fleet } from '../../src/model/schemas.js';
import {
  canRedo,
  canUndo,
  clearHistory,
  hydrateFleetStore,
  redo,
  resetFleetStore,
  selectActiveFleet,
  selectFleetList,
  undo,
  useFleetStore,
} from '../../src/store/fleetStore.js';
import { exportFleetToJson, parseFleetJson } from '../../src/store/io.js';
import { makeFleet } from '../fixtures/fleets.js';

const store = () => useFleetStore.getState();
const active = (): Fleet => {
  const fleet = selectActiveFleet(store());
  if (!fleet) throw new Error('no active fleet');
  return fleet;
};
/** Ids the fixture-backed tests share. */
const load = (): Fleet => {
  const fleet = makeFleet();
  hydrateFleetStore({ fleets: [fleet], activeFleetId: fleet.id });
  return fleet;
};

beforeEach(() => {
  setIdFactory(sequentialIdFactory());
  resetFleetStore();
  return () => resetIdFactory();
});

describe('fleets (SPEC 5.11)', () => {
  it('creates from a template and makes it active', () => {
    const id = store().createFleet('company', 'Acme');
    expect(active().id).toBe(id);
    expect(active().name).toBe('Acme');
    expect(active().agents).toHaveLength(5);
  });

  it('keeps several fleets side by side and switches between them', () => {
    const first = store().createFleet('blank', 'One');
    const second = store().createFleet('blank', 'Two');
    expect(selectFleetList(store()).map((f) => f.name)).toEqual(['One', 'Two']);

    expect(store().setActiveFleet(first).ok).toBe(true);
    expect(active().id).toBe(first);
    expect(store().setActiveFleet(second).ok).toBe(true);
  });

  it('rejects switching to an unknown fleet', () => {
    expect(store().setActiveFleet('flt_missing')).toMatchObject({ ok: false });
  });

  it('renames a fleet and refuses a blank name', () => {
    const id = store().createFleet('blank', 'One');
    expect(store().renameFleet(id, '  Renamed  ').ok).toBe(true);
    expect(active().name).toBe('Renamed');
    expect(store().renameFleet(id, '   ')).toMatchObject({ ok: false });
  });

  it('duplicates a fleet under a new id without touching the original', () => {
    const id = store().createFleet('company', 'Acme');
    const result = store().duplicateFleet(id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.id).not.toBe(id);
    expect(active().name).toBe('Acme (copy)');
    expect(active().agents).toHaveLength(5);

    store().renameAgent(active().agents[0]?.id ?? '', 'Changed');
    expect(store().fleets[id]?.agents[0]?.name).toBe('Orchestrator');
  });

  it('deletes a fleet and falls back to the next one', () => {
    const first = store().createFleet('blank', 'One');
    const second = store().createFleet('blank', 'Two');
    expect(store().deleteFleet(second).ok).toBe(true);
    expect(store().activeFleetId).toBe(first);
    expect(selectFleetList(store())).toHaveLength(1);
  });

  it('leaves no active fleet once the last one is deleted', () => {
    const only = store().createFleet('blank');
    store().deleteFleet(only);
    expect(store().activeFleetId).toBeNull();
    expect(selectActiveFleet(store())).toBeUndefined();
  });

  it('imports a fleet from JSON and re-ids a colliding import', () => {
    const fleet = load();
    const result = store().importFleetFromJson(exportFleetToJson(fleet));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.id).not.toBe(fleet.id);
    expect(selectFleetList(store())).toHaveLength(2);
    expect(active().agents).toHaveLength(fleet.agents.length);
  });

  it('surfaces import errors instead of storing a broken fleet', () => {
    const result = store().importFleetFromJson('{"schemaVersion":1}');
    expect(result.ok).toBe(false);
    expect(selectFleetList(store())).toHaveLength(0);
  });
});

describe('agents (SPEC 5.8)', () => {
  it('creates an agent from name + role alone, Planned by default (SPEC 5.6)', () => {
    store().createFleet('blank');
    const result = store().addAgent({ name: 'Quote builder', role: 'Assembles quotes' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const agent = active().agents.find((a) => a.id === result.id);
    expect(agent).toMatchObject({ kind: 'worker', status: 'planned', role: 'Assembles quotes' });
    expect(agent?.skillIds).toEqual([]);
  });

  it('wires a sub-agent under its parent with a Planned edge', () => {
    store().createFleet('blank');
    const parentId = active().agents[0]?.id ?? '';
    const result = store().addAgent({ name: 'Sales', role: 'Pipeline', kind: 'department', parentId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const edge = active().edges[0];
    expect(edge).toMatchObject({ source: parentId, target: result.id, kind: 'hierarchy', status: 'planned' });
  });

  it('refuses a blank name, an unknown parent, and a second orchestrator', () => {
    store().createFleet('blank');
    expect(store().addAgent({ name: '   ', role: 'x' })).toMatchObject({ ok: false });
    expect(store().addAgent({ name: 'X', role: 'x', parentId: 'agt_missing' })).toMatchObject({ ok: false });
    expect(store().addAgent({ name: 'X', role: 'x', kind: 'orchestrator' })).toMatchObject({ ok: false });
  });

  it('renames an agent everywhere at once (one agent, one truth)', () => {
    const fleet = load();
    expect(store().renameAgent('agt_quotes', 'Angebots-Bot').ok).toBe(true);

    const renamed = active().agents.filter((a) => a.name === 'Angebots-Bot');
    expect(renamed).toHaveLength(1);
    // Both rendered copies of the shared agent read the new name.
    const copies = instances(active()).filter((i) => i.agentId === 'agt_quotes');
    expect(copies).toHaveLength(2);
    expect(isShared(active(), 'agt_quotes')).toBe(true);
    expect(fleet.agents.find((a) => a.id === 'agt_quotes')?.name).toBe('Quote builder');
  });

  it('rejects a blank rename', () => {
    load();
    expect(store().renameAgent('agt_quotes', ' ')).toMatchObject({ ok: false });
    expect(store().renameAgent('agt_missing', 'X')).toMatchObject({ ok: false });
  });

  it('edits role, status, instructions and model from the panel (SPEC 8.10)', () => {
    load();
    const result = store().updateAgent('agt_quotes', {
      role: '  Builds quotes  ',
      status: 'live',
      instructions: 'Always check the margin.',
      model: { provider: 'anthropic', name: 'claude-opus-5', temperature: 0.1 },
    });
    expect(result.ok).toBe(true);

    const agent = active().agents.find((a) => a.id === 'agt_quotes');
    expect(agent).toMatchObject({ role: 'Builds quotes', status: 'live' });
    expect(agent?.model?.name).toBe('claude-opus-5');
  });

  it('keeps exactly one orchestrator when kinds change (SPEC 4)', () => {
    load();
    expect(store().updateAgent('agt_sales', { kind: 'orchestrator' })).toMatchObject({ ok: false });
    expect(store().updateAgent('agt_orchestrator', { kind: 'worker' })).toMatchObject({ ok: false });
  });

  it('deletes an agent together with all its links', () => {
    load();
    expect(store().deleteAgent('agt_leads').ok).toBe(true);

    expect(active().agents.some((a) => a.id === 'agt_leads')).toBe(false);
    // Its hierarchy edge AND its peer link are gone.
    expect(active().edges.some((e) => e.source === 'agt_leads' || e.target === 'agt_leads')).toBe(false);
    expect(checkFleetIntegrity(active())).toEqual([]);
  });

  it('describes a shared-agent deletion before it happens (SPEC 5.8)', () => {
    load();
    const preview = store().previewAgentDeletion('agt_quotes');
    expect(preview).toMatchObject({ shared: true, parentNames: ['Sales', 'Operations'] });
    expect(preview?.orphanedChildIds).toEqual(['agt_pricing']);
    expect(preview?.edgeCount).toBe(3);
  });

  it('refuses to empty the fleet', () => {
    store().createFleet('blank');
    expect(store().deleteAgent(active().agents[0]?.id ?? '')).toMatchObject({ ok: false });
  });

  it('refuses to delete the orchestrator, keeping the fleet valid (SPEC 4)', () => {
    load();
    const result = store().deleteAgent('agt_orchestrator');
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.reason).toContain('exactly one orchestrator');
    expect(checkFleetIntegrity(active())).toEqual([]);
  });

  it('stores and clears manual positions (SPEC 5.8 auto-arrange)', () => {
    load();
    store().setAgentPosition('agt_sales', { x: 10, y: 20 });
    expect(active().agents.find((a) => a.id === 'agt_sales')?.position).toEqual({ x: 10, y: 20 });

    store().clearAgentPositions();
    expect(active().agents.every((a) => a.position === undefined)).toBe(true);
  });
});

describe('links (SPEC 5.8, 8.4, 8.5)', () => {
  it('links an existing agent as a sub-agent, making it shared', () => {
    load();
    const result = store().linkAgents('agt_operations', 'agt_leads', 'hierarchy');
    expect(result.ok).toBe(true);
    expect(isShared(active(), 'agt_leads')).toBe(true);
    expect(instances(active()).filter((i) => i.agentId === 'agt_leads')).toHaveLength(2);
  });

  it('links a peer without touching the hierarchy (SPEC 5.2)', () => {
    load();
    expect(store().linkAgents('agt_pricing', 'agt_leads', 'peer').ok).toBe(true);
    expect(instances(active()).filter((i) => i.agentId === 'agt_leads')).toHaveLength(1);
  });

  it('refuses self-links, unknown agents and duplicates', () => {
    load();
    expect(store().linkAgents('agt_sales', 'agt_sales', 'hierarchy')).toMatchObject({ ok: false });
    expect(store().linkAgents('agt_sales', 'agt_missing', 'hierarchy')).toMatchObject({ ok: false });
    expect(store().linkAgents('agt_sales', 'agt_quotes', 'hierarchy')).toMatchObject({ ok: false });
  });

  it('refuses a duplicate peer link in either direction', () => {
    load();
    expect(store().linkAgents('agt_operations', 'agt_leads', 'peer')).toMatchObject({ ok: false });
  });

  it('refuses a link that would close a hierarchy cycle (SPEC 4: DAG)', () => {
    load();
    const result = store().linkAgents('agt_pricing', 'agt_sales', 'hierarchy');
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.reason).toContain('cycle');
    expect(checkFleetIntegrity(active())).toEqual([]);
  });

  it('unlinks a hierarchy edge when another parent remains', () => {
    load();
    expect(store().unlinkEdge('edg_ops_quotes').ok).toBe(true);
    expect(isShared(active(), 'agt_quotes')).toBe(false);
    expect(instances(active()).filter((i) => i.agentId === 'agt_quotes')).toHaveLength(1);
  });

  it('blocks removing the last hierarchy parent - no orphan nodes (SPEC 5.8)', () => {
    load();
    const result = store().unlinkEdge('edg_sales_leads');
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.reason).toContain('Delete the agent instead');
  });

  it('always allows unlinking a peer link', () => {
    load();
    expect(store().unlinkEdge('edg_leads_peer_ops').ok).toBe(true);
  });

  it('edits edge status, label and kind (SPEC 8.5)', () => {
    load();
    expect(store().updateEdge('edg_ops_quotes', { status: 'live', label: 'escalates to' }).ok).toBe(true);
    const edge = active().edges.find((e) => e.id === 'edg_ops_quotes');
    expect(edge).toMatchObject({ status: 'live', label: 'escalates to' });
  });

  it('blocks demoting the last hierarchy link to a peer link', () => {
    load();
    expect(store().updateEdge('edg_sales_leads', { kind: 'peer' })).toMatchObject({ ok: false });
    expect(store().updateEdge('edg_ops_quotes', { kind: 'peer' }).ok).toBe(true);
  });
});

describe('libraries (SPEC 8.7)', () => {
  it('adds, attaches and detaches a skill', () => {
    load();
    const created = store().addSkill({ name: 'Pricing', description: 'Knows the price book' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(store().attachLibraryItem('agt_leads', 'skill', created.id).ok).toBe(true);
    expect(active().agents.find((a) => a.id === 'agt_leads')?.skillIds).toEqual([created.id]);

    expect(store().attachLibraryItem('agt_leads', 'skill', created.id)).toMatchObject({ ok: false });
    expect(store().detachLibraryItem('agt_leads', 'skill', created.id).ok).toBe(true);
    expect(active().agents.find((a) => a.id === 'agt_leads')?.skillIds).toEqual([]);
  });

  it('validates a tool on the way in', () => {
    load();
    expect(store().addTool({ name: 'Broken', description: '', type: 'python' })).toMatchObject({ ok: false });
    expect(
      store().addTool({
        name: 'Bad flow',
        description: 'x',
        type: 'python',
        workflow: { steps: [{ id: 's1', name: 'Start', kind: 'trigger', next: [] }] },
      }),
    ).toMatchObject({ ok: false });
  });

  it('blocks deleting a library item that is still in use, and lists the users (SPEC 5.8)', () => {
    load();
    const result = store().deleteDataSource('dsr_price_list');
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.blockedBy).toEqual(['Quote builder', 'Pricing check']);
  });

  it('allows the delete once the item is detached everywhere', () => {
    load();
    store().detachLibraryItem('agt_quotes', 'dataSource', 'dsr_price_list');
    store().detachLibraryItem('agt_pricing', 'dataSource', 'dsr_price_list');
    expect(store().deleteDataSource('dsr_price_list').ok).toBe(true);
    expect(checkFleetIntegrity(active())).toEqual([]);
  });

  it('edits a library item in place', () => {
    load();
    expect(store().updateSkill('skl_negotiation', { name: 'Verhandlung' }).ok).toBe(true);
    expect(active().skills[0]?.name).toBe('Verhandlung');
    expect(store().updateTool('tol_quote_flow', { description: '' })).toMatchObject({ ok: false });
  });

  it('refuses to attach an item that is not in the library', () => {
    load();
    expect(store().attachLibraryItem('agt_leads', 'tool', 'tol_ghost')).toMatchObject({ ok: false });
  });
});

describe('undo / redo (SPEC 8.1)', () => {
  it('covers a rename', () => {
    load();
    clearHistory();
    store().renameAgent('agt_quotes', 'Angebots-Bot');
    expect(canUndo()).toBe(true);

    undo();
    expect(active().agents.find((a) => a.id === 'agt_quotes')?.name).toBe('Quote builder');
    expect(canRedo()).toBe(true);

    redo();
    expect(active().agents.find((a) => a.id === 'agt_quotes')?.name).toBe('Angebots-Bot');
  });

  it('covers add, link and delete', () => {
    load();
    clearHistory();

    const added = store().addAgent({ name: 'Forecast', role: 'Predicts demand', parentId: 'agt_operations' });
    expect(added.ok).toBe(true);
    const afterAdd = active().agents.length;

    store().deleteAgent('agt_leads');
    expect(active().agents).toHaveLength(afterAdd - 1);

    undo();
    expect(active().agents.some((a) => a.id === 'agt_leads')).toBe(true);

    undo();
    expect(active().agents).toHaveLength(afterAdd - 1);
    expect(active().agents.some((a) => a.name === 'Forecast')).toBe(false);
  });

  it('restores a deleted fleet', () => {
    const id = store().createFleet('company', 'Acme');
    store().deleteFleet(id);
    expect(selectFleetList(store())).toHaveLength(0);

    undo();
    expect(selectFleetList(store())).toHaveLength(1);
    expect(active().name).toBe('Acme');
  });

  it('records nothing for a blocked action', () => {
    load();
    clearHistory();
    expect(store().unlinkEdge('edg_sales_leads')).toMatchObject({ ok: false });
    expect(canUndo()).toBe(false);
  });

  it('does not make hydration undoable', () => {
    load();
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(false);
  });
});

describe('integrity across action sequences', () => {
  it('stays clean through a realistic editing session', () => {
    store().createFleet('company', 'Acme');
    const orchestrator = active().agents.find((a) => a.kind === 'orchestrator');
    const [sales, marketing] = active().agents.filter((a) => a.kind === 'department');
    expect(orchestrator && sales && marketing).toBeTruthy();
    if (!sales || !marketing) return;

    const quotes = store().addAgent({ name: 'Quote builder', role: 'Assembles quotes', parentId: sales.id });
    expect(quotes.ok).toBe(true);
    if (!quotes.ok) return;

    store().linkAgents(marketing.id, quotes.id, 'hierarchy');
    const skill = store().addSkill({ name: 'Negotiation' });
    if (skill.ok) store().attachLibraryItem(quotes.id, 'skill', skill.id);
    store().updateAgent(quotes.id, { status: 'building' });
    store().setAgentPosition(quotes.id, { x: 5, y: 5 });

    expect(isShared(active(), quotes.id)).toBe(true);
    expect(instances(active()).filter((i) => i.agentId === quotes.id)).toHaveLength(2);
    expect(checkFleetIntegrity(active())).toEqual([]);

    undo();
    undo();
    undo();
    expect(checkFleetIntegrity(active())).toEqual([]);
  });
});

describe('data nesting through the store', () => {
  const setup = () => {
    store().createFleet('blank', 'Nesting');
    const outer = store().addDataSource({ name: 'Produktdaten', type: 'department', status: 'planned' });
    const inner = store().addDataSource({ name: 'Bilder', type: 'department', status: 'planned' });
    if (!outer.ok || !inner.ok) throw new Error('setup failed');
    return { outerId: outer.id, innerId: inner.id };
  };
  const dataOf = (id: string) => selectActiveFleet(store())?.dataSources.find((d) => d.id === id);

  it('puts one item inside another', () => {
    const { outerId, innerId } = setup();
    expect(store().updateDataSource(innerId, { parentId: outerId }).ok).toBe(true);
    expect(dataOf(innerId)?.parentId).toBe(outerId);
    expect(selectActiveFleet(store())).toBeDefined();
    expect(checkFleetIntegrity(selectActiveFleet(store())!)).toEqual([]);
  });

  it('records the department that has to provide it', () => {
    const { outerId } = setup();
    store().updateDataSource(outerId, { owner: 'Produktmanagement' });
    expect(dataOf(outerId)).toMatchObject({ owner: 'Produktmanagement' });
  });

  it('keeps the Ansprechpartner on the department, where one name serves every item', () => {
    setup();
    // A blank fleet is an orchestrator alone, so give it a department to ask.
    const added = store().addAgent({ name: 'Marketing', role: 'Kampagnen', kind: 'department' });
    if (!added.ok) throw new Error('could not add the department');
    const fleet = selectActiveFleet(store());
    const department = fleet?.agents.find((a) => a.id === added.id);
    if (!department) throw new Error('department missing after adding it');

    store().updateAgent(department.id, { contact: 'Frau Bauer' });
    const after = selectActiveFleet(store());
    if (!after) throw new Error('no fleet');
    expect(contactForProvider(after, department.name)).toBe('Frau Bauer');
    // Undoable like any other edit to the document.
    useFleetStore.temporal.getState().undo();
    const undone = selectActiveFleet(store());
    if (!undone) throw new Error('no fleet');
    expect(contactForProvider(undone, department.name)).toBeNull();
  });

  it('refuses to put an item inside itself', () => {
    const { outerId } = setup();
    expect(store().updateDataSource(outerId, { parentId: outerId })).toMatchObject({ ok: false });
  });

  it('refuses a parent that does not exist', () => {
    const { innerId } = setup();
    expect(store().updateDataSource(innerId, { parentId: 'dsr_ghost' })).toMatchObject({ ok: false });
  });

  it('refuses a move that would make a cycle', () => {
    const { outerId, innerId } = setup();
    store().updateDataSource(innerId, { parentId: outerId });
    // Putting the parent inside its own child would close a loop.
    expect(store().updateDataSource(outerId, { parentId: innerId })).toMatchObject({ ok: false });
    expect(checkFleetIntegrity(selectActiveFleet(store())!)).toEqual([]);
  });

  it('refuses to delete an item that still contains others, and names them', () => {
    const { outerId, innerId } = setup();
    store().updateDataSource(innerId, { parentId: outerId });
    const result = store().deleteDataSource(outerId);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.blockedBy).toEqual(['Bilder']);
  });

  it('allows the delete once the contents are moved out', () => {
    const { outerId, innerId } = setup();
    store().updateDataSource(innerId, { parentId: outerId });
    store().updateDataSource(innerId, { parentId: undefined });
    expect(store().deleteDataSource(outerId).ok).toBe(true);
  });

  it('is undoable', () => {
    const { outerId, innerId } = setup();
    store().updateDataSource(innerId, { parentId: outerId });
    expect(dataOf(innerId)?.parentId).toBe(outerId);
    useFleetStore.temporal.getState().undo();
    expect(dataOf(innerId)?.parentId).toBeUndefined();
  });
});

describe('the source of a data item can be taken back', () => {
  it('clears a source that was assigned by mistake', () => {
    store().createFleet('blank', 'Sources');
    const added = store().addDataSource({ name: 'Kampagnen-Kalender', type: 'sharepoint', status: 'planned' });
    if (!added.ok) throw new Error('setup failed');

    const dataOf = () => selectActiveFleet(store())?.dataSources.find((d) => d.id === added.id);
    expect(dataOf()?.type).toBe('sharepoint');

    expect(store().updateDataSource(added.id, { type: undefined }).ok).toBe(true);
    expect(dataOf()?.type).toBeUndefined();
    expect(checkFleetIntegrity(selectActiveFleet(store())!)).toEqual([]);
  });

  it('survives an export and import with no source', () => {
    store().createFleet('blank', 'Sources');
    const added = store().addDataSource({ name: 'Kampagnen-Kalender', status: 'planned' });
    if (!added.ok) throw new Error('setup failed');

    const json = exportFleetToJson(selectActiveFleet(store())!);
    expect(json).not.toContain('"type"');
    const round = parseFleetJson(json);
    expect(round.ok).toBe(true);
    if (round.ok) expect(round.fleet.dataSources[0]?.type).toBeUndefined();
  });
});
