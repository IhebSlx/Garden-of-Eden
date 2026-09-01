/**
 * SPEC 9 - the Solarlux demo fleet, migrated from reference/prototype.html.
 * These tests pin the migration against the prototype's own numbers so a future
 * edit cannot quietly drop an agent, a parent link or a library reference.
 */
import { describe, expect, it } from 'vitest';
import { checkFleetIntegrity } from '../../src/model/integrity.js';
import { FleetDocumentSchema } from '../../src/model/integrity.js';
import { instances, isShared, parentsOf, sharedCount } from '../../src/model/selectors.js';
import {
  SEED_AGENTS,
  SEED_DATA_SOURCES,
  SEED_EDGES,
  SEED_SKILLS,
  SEED_TOOLS,
  solarluxFleet,
} from '../../src/model/seed.js';
import { exportFleetToJson, parseFleetJson } from '../../src/store/io.js';

describe('Solarlux seed fleet', () => {
  it('carries the prototype\'s 16 agents and 20 edges', () => {
    const fleet = solarluxFleet();
    expect(fleet.agents).toHaveLength(16);
    expect(fleet.edges).toHaveLength(20);
    expect(fleet.edges.filter((e) => e.kind === 'hierarchy')).toHaveLength(19);
    expect(fleet.edges.filter((e) => e.kind === 'peer')).toHaveLength(1);
  });

  it('is schema-valid and integrity-clean', () => {
    const fleet = solarluxFleet();
    expect(FleetDocumentSchema.safeParse(fleet).success).toBe(true);
    expect(checkFleetIntegrity(fleet)).toEqual([]);
  });

  it('has exactly one orchestrator', () => {
    expect(solarluxFleet().agents.filter((a) => a.kind === 'orchestrator')).toHaveLength(1);
  });

  it('uses no "shared" kind - shared-ness is derived (SPEC §8)', () => {
    const fleet = solarluxFleet();
    expect(fleet.agents.every((a) => a.kind !== ('shared' as unknown))).toBe(true);
    expect(fleet.agents.filter((a) => a.kind === 'department')).toHaveLength(4);
    expect(fleet.agents.filter((a) => a.kind === 'worker')).toHaveLength(11);
  });

  it('derives exactly the prototype\'s three shared agents, with the same parent counts', () => {
    const fleet = solarluxFleet();
    const shared = fleet.agents.filter((a) => isShared(fleet, a.id));
    expect(shared.map((a) => a.name).sort()).toEqual([
      'PowerPoint Creator',
      'SharePoint Reader',
      'Translator DE/EN',
    ]);
    expect(sharedCount(fleet, 'agt_ppt')).toBe(3);
    expect(sharedCount(fleet, 'agt_tr')).toBe(2);
    expect(sharedCount(fleet, 'agt_sp')).toBe(2);
    expect(parentsOf(fleet, 'agt_ppt').map((a) => a.name)).toEqual([
      'Marketing',
      'Business Development',
      'Objektvertrieb',
    ]);
  });

  it('renders 20 instances - one per (agent, parent) pair', () => {
    // orch 1 + four departments 4 + w1..w8 8 + ppt 3 + tr 2 + sp 2 = 20,
    // matching the prototype's own `instances` array.
    const fleet = solarluxFleet();
    expect(instances(fleet)).toHaveLength(20);
    expect(instances(fleet).filter((i) => i.agentId === 'agt_ppt')).toHaveLength(3);
    expect(instances(fleet).filter((i) => i.agentId === 'agt_tr')).toHaveLength(2);
    expect(instances(fleet).filter((i) => i.agentId === 'agt_sp')).toHaveLength(2);
  });

  it('references every library item by id, and every reference resolves', () => {
    const fleet = solarluxFleet();
    const skillIds = new Set(fleet.skills.map((s) => s.id));
    const toolIds = new Set(fleet.tools.map((t) => t.id));
    const dataIds = new Set(fleet.dataSources.map((d) => d.id));

    for (const agent of fleet.agents) {
      for (const id of agent.skillIds) expect(skillIds.has(id)).toBe(true);
      for (const id of agent.toolIds) expect(toolIds.has(id)).toBe(true);
      for (const id of agent.dataSourceIds) expect(dataIds.has(id)).toBe(true);
    }
  });

  it('deduplicates library items that the prototype repeated by name', () => {
    const fleet = solarluxFleet();
    expect(fleet.skills).toHaveLength(17);
    expect(fleet.tools).toHaveLength(18);
    expect(fleet.dataSources).toHaveLength(14);

    // Names are unique - the prototype matched usage by name, so duplicates would
    // have merged silently and broken the "linked to" list.
    for (const collection of [fleet.skills, fleet.tools, fleet.dataSources]) {
      const names = collection.map((entry) => entry.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('shares the tools and data sources the prototype shared across agents', () => {
    const fleet = solarluxFleet();
    const usersOf = (toolId: string) => fleet.agents.filter((a) => a.toolIds.includes(toolId)).map((a) => a.name);
    expect(usersOf('tol_dataverse_api')).toEqual(['Objektvertrieb', 'Lead Qualifier']);
    expect(usersOf('tol_teams')).toEqual(['HR', 'Onboarding Guide']);

    const handbook = fleet.agents.filter((a) => a.dataSourceIds.includes('dsr_personalhandbuch'));
    expect(handbook.map((a) => a.name)).toEqual(['HR', 'Onboarding Guide']);
  });

  it('keeps the prototype\'s workflow tools with their steps', () => {
    const fleet = solarluxFleet();
    const workflows = fleet.tools.filter((t) => t.type === 'workflow');
    expect(workflows.map((t) => t.name).sort()).toEqual([
      'Angebots-Flow',
      'Lead-Scoring Flow',
      'PPTX engine',
    ]);

    const lead = fleet.tools.find((t) => t.id === 'tol_lead_scoring_flow');
    expect(lead?.workflow?.steps).toHaveLength(5);
    expect(lead?.workflow?.steps[0]?.kind).toBe('trigger');
    expect(lead?.workflow?.steps[0]?.name).toBe('new lead in CRM');
    expect(lead?.workflow?.steps[0]?.next).toEqual(['stp_lead_1']);
    expect(lead?.workflow?.steps[4]?.next).toEqual([]);
  });

  it('preserves the prototype\'s statuses and linked flags', () => {
    const fleet = solarluxFleet();
    expect(fleet.agents.find((a) => a.id === 'agt_orch')?.status).toBe('live');
    expect(fleet.agents.find((a) => a.id === 'agt_bd')?.status).toBe('planned');
    expect(fleet.dataSources.find((d) => d.id === 'dsr_unternehmenskontext')?.linked).toBe(true);
    // Personalhandbuch is Ready but explicitly NOT linked in the prototype.
    const handbook = fleet.dataSources.find((d) => d.id === 'dsr_personalhandbuch');
    expect(handbook?.status).toBe('live');
    expect(handbook?.linked).toBe(false);
  });

  it('survives a JSON export/import round-trip', () => {
    const fleet = solarluxFleet();
    const result = parseFleetJson(exportFleetToJson(fleet));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fleet).toEqual(fleet);
  });

  it('returns a fresh copy each call', () => {
    const first = solarluxFleet();
    first.agents[0]!.name = 'Changed';
    expect(solarluxFleet().agents[0]?.name).toBe('Solarlux Orchestrator');
  });

  it('exports its collections for reuse without cloning surprises', () => {
    expect(SEED_AGENTS).toHaveLength(16);
    expect(SEED_EDGES).toHaveLength(20);
    expect(SEED_SKILLS).toHaveLength(17);
    expect(SEED_TOOLS).toHaveLength(18);
    expect(SEED_DATA_SOURCES).toHaveLength(14);
  });
});
