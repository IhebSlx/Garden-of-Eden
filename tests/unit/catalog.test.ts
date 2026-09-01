/**
 * The catalog: agents, skills and tools that exist outside any fleet, plus the
 * Copilot Studio files they were imported from.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetIdFactory, sequentialIdFactory, setIdFactory } from '../../src/model/ids.js';
import { CatalogSchema, describeCatalogAgent, emptyCatalog, instantiateIntoFleet, upsertById } from '../../src/model/catalog.js';
import { useCatalogStore } from '../../src/store/catalogStore.js';
import {
  resetFleetStore,
  selectActiveFleet,
  useFleetStore,
} from '../../src/store/fleetStore.js';
import { checkFleetIntegrity } from '../../src/model/integrity.js';
import { childIdsOf, instances, parentsOf } from '../../src/model/selectors.js';

const yaml = readFileSync('tests/fixtures/copilot/objektvertrieb.yaml', 'utf8');
const catalog = () => useCatalogStore.getState();
const fleetStore = () => useFleetStore.getState();

beforeEach(() => {
  setIdFactory(sequentialIdFactory());
  useCatalogStore.getState().hydrate(emptyCatalog());
  resetFleetStore();
  return () => resetIdFactory();
});

describe('upsertById', () => {
  it('appends a new item and replaces an existing one', () => {
    const a = { id: '1', v: 'a' };
    const b = { id: '2', v: 'b' };
    expect(upsertById([a], b)).toEqual([a, b]);
    expect(upsertById([a, b], { id: '1', v: 'changed' })).toEqual([{ id: '1', v: 'changed' }, b]);
  });
});

describe('creating catalog items by hand', () => {
  it('creates an agent from a name alone', () => {
    const result = catalog().addAgent({ name: 'Angebots-Bot' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const agent = catalog().catalog.agents.find((a) => a.id === result.id);
    expect(agent).toMatchObject({ name: 'Angebots-Bot', status: 'planned', kind: 'department' });
    expect(agent?.skillIds).toEqual([]);
  });

  it('refuses a blank name', () => {
    expect(catalog().addAgent({ name: '   ' })).toMatchObject({ ok: false });
  });

  it('records a model only when both provider and name are given', () => {
    const partial = catalog().addAgent({ name: 'A', provider: 'Sorakel' });
    expect(partial.ok).toBe(true);
    if (partial.ok) expect(catalog().catalog.agents.find((a) => a.id === partial.id)?.model).toBeUndefined();

    const full = catalog().addAgent({ name: 'B', provider: 'Sorakel', modelName: 'LLM' });
    if (full.ok) {
      expect(catalog().catalog.agents.find((a) => a.id === full.id)?.model).toEqual({
        provider: 'Sorakel',
        name: 'LLM',
      });
    }
  });

  it('creates skills, tools and data sources', () => {
    expect(catalog().addSkill({ name: 'Angebotslogik' }).ok).toBe(true);
    expect(catalog().addTool({ name: 'Flow', description: 'Does a thing', type: 'workflow' }).ok).toBe(true);
    expect(catalog().addDataSource({ name: 'CRM', type: 'dataverse', status: 'planned' }).ok).toBe(true);

    expect(catalog().catalog.skills).toHaveLength(1);
    expect(catalog().catalog.tools).toHaveLength(1);
    expect(catalog().catalog.dataSources).toHaveLength(1);
  });

  it('validates a tool on the way in', () => {
    expect(catalog().addTool({ name: 'Bad', description: '', type: 'python' })).toMatchObject({ ok: false });
  });
});

describe('attaching library items to a catalog agent', () => {
  it('attaches and detaches', () => {
    const agent = catalog().addAgent({ name: 'A' });
    const skill = catalog().addSkill({ name: 'S' });
    if (!agent.ok || !skill.ok) throw new Error('setup failed');

    expect(catalog().attachToAgent(agent.id, 'skill', skill.id).ok).toBe(true);
    expect(catalog().catalog.agents[0]?.skillIds).toEqual([skill.id]);

    expect(catalog().attachToAgent(agent.id, 'skill', skill.id)).toMatchObject({ ok: false });
    expect(catalog().detachFromAgent(agent.id, 'skill', skill.id).ok).toBe(true);
    expect(catalog().catalog.agents[0]?.skillIds).toEqual([]);
  });

  it('refuses to attach something that is not in the catalog', () => {
    const agent = catalog().addAgent({ name: 'A' });
    if (!agent.ok) throw new Error('setup failed');
    expect(catalog().attachToAgent(agent.id, 'tool', 'tol_ghost')).toMatchObject({ ok: false });
  });

  it('blocks deleting a library item that is still attached, and names the agent', () => {
    const agent = catalog().addAgent({ name: 'Angebots-Bot' });
    const skill = catalog().addSkill({ name: 'S' });
    if (!agent.ok || !skill.ok) throw new Error('setup failed');
    catalog().attachToAgent(agent.id, 'skill', skill.id);

    const result = catalog().deleteSkill(skill.id);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.reason).toContain('Angebots-Bot');
  });

  it('summarises what an agent carries', () => {
    const agent = catalog().addAgent({ name: 'A' });
    if (!agent.ok) throw new Error('setup failed');
    expect(describeCatalogAgent(catalog().catalog.agents[0]!)).toBe('nothing attached yet');

    const skill = catalog().addSkill({ name: 'S' });
    if (skill.ok) catalog().attachToAgent(agent.id, 'skill', skill.id);
    expect(describeCatalogAgent(catalog().catalog.agents[0]!)).toBe('1 skill');
  });
});

describe('importing a Copilot Studio export', () => {
  it('lands the agent and its libraries in the catalog', () => {
    const result = catalog().importCopilotYaml(yaml, 'Objektvertrieb (2).yaml');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.agentName).toBe('Objektvertrieb');
    expect(result.counts).toEqual({ skills: 7, tools: 8, dataSources: 4 });
    expect(catalog().catalog.agents).toHaveLength(1);
    expect(catalog().catalog.skills).toHaveLength(7);
    expect(catalog().catalog.tools).toHaveLength(8);
  });

  it('keeps the uploaded file byte-for-byte so it can be downloaded back', () => {
    const result = catalog().importCopilotYaml(yaml, 'Objektvertrieb (2).yaml');
    if (!result.ok) throw new Error('import failed');

    const document = catalog().documentFor(result.agentId);
    expect(document?.fileName).toBe('Objektvertrieb (2).yaml');
    expect(document?.text).toBe(yaml);
  });

  it('records where the agent came from', () => {
    const result = catalog().importCopilotYaml(yaml, 'Objektvertrieb (2).yaml');
    if (!result.ok) throw new Error('import failed');
    expect(catalog().catalog.agents[0]?.source).toMatchObject({
      kind: 'copilot-yaml',
      fileName: 'Objektvertrieb (2).yaml',
      schemaName: 'crea8_objektvertriebassistent_p3Z5Bl',
    });
  });

  it('replaces the same agent on re-import instead of duplicating it', () => {
    const first = catalog().importCopilotYaml(yaml, 'Objektvertrieb (2).yaml');
    const second = catalog().importCopilotYaml(yaml, 'Objektvertrieb (3).yaml');
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(second.agentId).toBe(first.agentId);
    expect(catalog().catalog.agents).toHaveLength(1);
    expect(catalog().catalog.documents).toHaveLength(1);
    expect(catalog().documentFor(second.agentId)?.fileName).toBe('Objektvertrieb (3).yaml');
    expect(second.warnings.join(' ')).toContain('Replaced the earlier import');
  });

  it('reports a file that is not a Copilot export', () => {
    const result = catalog().importCopilotYaml('kind: NotABot', 'x.yaml');
    expect(result.ok).toBe(false);
    expect(catalog().catalog.agents).toHaveLength(0);
  });

  it('deleting the agent takes its stored file with it', () => {
    const result = catalog().importCopilotYaml(yaml, 'o.yaml');
    if (!result.ok) throw new Error('import failed');
    catalog().deleteAgent(result.agentId);
    expect(catalog().catalog.documents).toEqual([]);
  });

  it('produces a catalog that still validates', () => {
    catalog().importCopilotYaml(yaml, 'o.yaml');
    expect(CatalogSchema.safeParse(catalog().catalog).success).toBe(true);
  });
});

describe('adding a catalog agent to a fleet', () => {
  it('copies the agent and everything it references', () => {
    catalog().importCopilotYaml(yaml, 'o.yaml');
    const catalogAgent = catalog().catalog.agents[0];
    if (!catalogAgent) throw new Error('import failed');

    fleetStore().createFleet('blank', 'Target');
    expect(fleetStore().addCatalogAgent(catalogAgent).ok).toBe(true);

    const fleet = selectActiveFleet(fleetStore());
    expect(fleet?.agents.some((a) => a.name === 'Objektvertrieb')).toBe(true);
    expect(fleet?.skills).toHaveLength(7);
    expect(fleet?.tools).toHaveLength(8);
    expect(fleet?.dataSources).toHaveLength(4);
  });

  it('leaves the fleet valid and self-contained (SPEC 7)', () => {
    catalog().importCopilotYaml(yaml, 'o.yaml');
    const catalogAgent = catalog().catalog.agents[0];
    if (!catalogAgent) throw new Error('import failed');

    fleetStore().createFleet('blank', 'Target');
    fleetStore().addCatalogAgent(catalogAgent);

    const fleet = selectActiveFleet(fleetStore());
    if (!fleet) throw new Error('no fleet');
    // Every reference resolves inside the fleet itself - no catalog lookup needed.
    expect(checkFleetIntegrity(fleet)).toEqual([]);
  });

  it('does not carry the catalog-only `source` field into the fleet', () => {
    catalog().importCopilotYaml(yaml, 'o.yaml');
    const catalogAgent = catalog().catalog.agents[0];
    if (!catalogAgent) throw new Error('import failed');

    fleetStore().createFleet('blank', 'Target');
    fleetStore().addCatalogAgent(catalogAgent);

    const copied = selectActiveFleet(fleetStore())?.agents.find((a) => a.name === 'Objektvertrieb');
    expect(copied).toBeDefined();
    expect('source' in (copied ?? {})).toBe(false);
  });

  it('never creates a second orchestrator', () => {
    const created = catalog().addAgent({ name: 'Boss' });
    if (!created.ok) throw new Error('setup failed');
    catalog().updateAgent(created.id, { kind: 'orchestrator' });

    fleetStore().createFleet('blank', 'Target');
    fleetStore().addCatalogAgent(catalog().catalog.agents[0]!);

    const fleet = selectActiveFleet(fleetStore());
    expect(fleet?.agents.filter((a) => a.kind === 'orchestrator')).toHaveLength(1);
    expect(checkFleetIntegrity(fleet!)).toEqual([]);
  });

  it('adding the same agent twice updates rather than duplicating', () => {
    const created = catalog().addAgent({ name: 'Twice' });
    if (!created.ok) throw new Error('setup failed');
    const catalogAgent = catalog().catalog.agents[0]!;

    fleetStore().createFleet('blank', 'Target');
    fleetStore().addCatalogAgent(catalogAgent);
    fleetStore().addCatalogAgent(catalogAgent);

    const fleet = selectActiveFleet(fleetStore());
    expect(fleet?.agents.filter((a) => a.name === 'Twice')).toHaveLength(1);
  });

  it('arrives parentless, so it renders as its own root until it is linked', () => {
    const created = catalog().addAgent({ name: 'Loose' });
    if (!created.ok) throw new Error('setup failed');

    fleetStore().createFleet('blank', 'Target');
    fleetStore().addCatalogAgent(catalog().catalog.agents[0]!);

    const fleet = selectActiveFleet(fleetStore());
    if (!fleet) throw new Error('no fleet');
    // Orchestrator + the new agent, each a root instance.
    expect(instances(fleet)).toHaveLength(2);
  });

  it('is undoable like any other fleet mutation (SPEC 8.1)', () => {
    const created = catalog().addAgent({ name: 'Undoable' });
    if (!created.ok) throw new Error('setup failed');

    fleetStore().createFleet('blank', 'Target');
    fleetStore().addCatalogAgent(catalog().catalog.agents[0]!);
    expect(selectActiveFleet(fleetStore())?.agents).toHaveLength(2);

    useFleetStore.temporal.getState().undo();
    expect(selectActiveFleet(fleetStore())?.agents).toHaveLength(1);
  });

  it('refuses when there is no fleet open', () => {
    const created = catalog().addAgent({ name: 'Homeless' });
    if (!created.ok) throw new Error('setup failed');
    expect(fleetStore().addCatalogAgent(catalog().catalog.agents[0]!)).toMatchObject({ ok: false });
  });
});

describe('instantiateIntoFleet', () => {
  it('brings only the dependencies the agent actually references', () => {
    const base = emptyCatalog();
    const withItems = {
      ...base,
      skills: [{ id: 'skl_used', name: 'Used' }, { id: 'skl_spare', name: 'Spare' }],
      agents: [
        {
          id: 'agt_1',
          kind: 'department' as const,
          name: 'A',
          role: '',
          status: 'planned' as const,
          skillIds: ['skl_used'],
          toolIds: [],
          dataSourceIds: [],
        },
      ],
    };

    fleetStore().createFleet('blank', 'Target');
    const fleet = selectActiveFleet(fleetStore());
    if (!fleet) throw new Error('no fleet');

    const next = instantiateIntoFleet(fleet, withItems, withItems.agents[0]!);
    expect(next.skills.map((s) => s.id)).toEqual(['skl_used']);
  });
});

describe('replacing an agent in the tree with a catalog one', () => {
  const setupTree = () => {
    // Orchestrator -> Placeholder -> Child, so replacement has edges on both sides.
    fleetStore().createFleet('blank', 'Target');
    const root = selectActiveFleet(fleetStore())?.agents[0];
    if (!root) throw new Error('no orchestrator');

    const placeholder = fleetStore().addAgent({ name: 'PPTX-Creator', role: 'placeholder', parentId: root.id });
    if (!placeholder.ok) throw new Error('setup failed');
    const child = fleetStore().addAgent({ name: 'Child', role: '', parentId: placeholder.id });
    if (!child.ok) throw new Error('setup failed');

    return { rootId: root.id, placeholderId: placeholder.id, childId: child.id };
  };

  it('puts the replacement in the old agent\'s place and removes the old one', () => {
    const { placeholderId } = setupTree();
    catalog().importCopilotYaml(yaml, 'o.yaml');
    const replacement = catalog().catalog.agents[0];
    if (!replacement) throw new Error('import failed');

    expect(fleetStore().replaceWithCatalogAgent(placeholderId, replacement).ok).toBe(true);

    const fleet = selectActiveFleet(fleetStore());
    expect(fleet?.agents.some((a) => a.id === placeholderId)).toBe(false);
    expect(fleet?.agents.some((a) => a.id === replacement.id)).toBe(true);
    expect(fleet?.agents.some((a) => a.name === 'Objektvertrieb')).toBe(true);
  });

  it('rewires the edges on both sides', () => {
    const { rootId, placeholderId, childId } = setupTree();
    catalog().importCopilotYaml(yaml, 'o.yaml');
    const replacement = catalog().catalog.agents[0];
    if (!replacement) throw new Error('import failed');

    fleetStore().replaceWithCatalogAgent(placeholderId, replacement);
    const fleet = selectActiveFleet(fleetStore());
    if (!fleet) throw new Error('no fleet');

    // It still reports to the orchestrator...
    expect(parentsOf(fleet, replacement.id).map((a) => a.id)).toEqual([rootId]);
    // ...and still owns the child.
    expect(childIdsOf(fleet, replacement.id)).toEqual([childId]);
    // No edge mentions the removed agent.
    expect(fleet.edges.some((e) => e.source === placeholderId || e.target === placeholderId)).toBe(false);
  });

  it('brings the replacement\'s skills, tools and data with it', () => {
    const { placeholderId } = setupTree();
    catalog().importCopilotYaml(yaml, 'o.yaml');
    const replacement = catalog().catalog.agents[0];
    if (!replacement) throw new Error('import failed');

    fleetStore().replaceWithCatalogAgent(placeholderId, replacement);
    const fleet = selectActiveFleet(fleetStore());
    expect(fleet?.skills).toHaveLength(7);
    expect(fleet?.tools).toHaveLength(8);
    expect(checkFleetIntegrity(fleet!)).toEqual([]);
  });

  it('keeps the old agent\'s board position', () => {
    const { placeholderId } = setupTree();
    fleetStore().setAgentPosition(placeholderId, { x: 321, y: 654 });

    catalog().importCopilotYaml(yaml, 'o.yaml');
    const replacement = catalog().catalog.agents[0];
    if (!replacement) throw new Error('import failed');

    fleetStore().replaceWithCatalogAgent(placeholderId, replacement);
    const moved = selectActiveFleet(fleetStore())?.agents.find((a) => a.id === replacement.id);
    expect(moved?.position).toEqual({ x: 321, y: 654 });
  });

  it('inherits the old agent\'s kind, so an orchestrator stays the orchestrator', () => {
    fleetStore().createFleet('blank', 'Target');
    const root = selectActiveFleet(fleetStore())?.agents[0];
    if (!root) throw new Error('no orchestrator');

    const created = catalog().addAgent({ name: 'New brain' });
    if (!created.ok) throw new Error('setup failed');

    fleetStore().replaceWithCatalogAgent(root.id, catalog().catalog.agents[0]!);
    const fleet = selectActiveFleet(fleetStore());
    expect(fleet?.agents.filter((a) => a.kind === 'orchestrator')).toHaveLength(1);
    expect(fleet?.agents[0]?.name).toBe('New brain');
    expect(checkFleetIntegrity(fleet!)).toEqual([]);
  });

  it('refuses to replace an agent that is not there', () => {
    setupTree();
    const created = catalog().addAgent({ name: 'X' });
    if (!created.ok) throw new Error('setup failed');
    expect(fleetStore().replaceWithCatalogAgent('agt_missing', catalog().catalog.agents[0]!)).toMatchObject({
      ok: false,
    });
  });

  it('refuses to replace an agent with itself', () => {
    setupTree();
    const created = catalog().addAgent({ name: 'Self' });
    if (!created.ok) throw new Error('setup failed');
    const agent = catalog().catalog.agents[0]!;
    fleetStore().addCatalogAgent(agent);
    expect(fleetStore().replaceWithCatalogAgent(agent.id, agent)).toMatchObject({ ok: false });
  });

  it('is undoable', () => {
    const { placeholderId } = setupTree();
    const created = catalog().addAgent({ name: 'Replacement' });
    if (!created.ok) throw new Error('setup failed');

    fleetStore().replaceWithCatalogAgent(placeholderId, catalog().catalog.agents[0]!);
    expect(selectActiveFleet(fleetStore())?.agents.some((a) => a.name === 'Replacement')).toBe(true);

    useFleetStore.temporal.getState().undo();
    expect(selectActiveFleet(fleetStore())?.agents.some((a) => a.name === 'PPTX-Creator')).toBe(true);
  });
});
