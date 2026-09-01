/**
 * The Solarlux target architecture from `agenten_02_vision.pdf`, with statuses
 * taken from the companion `agenten_01_heute.svg` legend (produktiv / in Arbeit /
 * fehlt-nicht verknüpft).
 */
import { describe, expect, it } from 'vitest';
import { FleetDocumentSchema, checkFleetIntegrity } from '../../src/model/integrity.js';
import { childIdsOf, instances, parentsOf } from '../../src/model/selectors.js';
import { solarluxVisionFleet } from '../../src/model/visionFleet.js';
import { exportFleetToJson, parseFleetJson } from '../../src/store/io.js';

const fleet = solarluxVisionFleet();

describe('Solarlux vision fleet', () => {
  it('is schema-valid and integrity-clean', () => {
    expect(FleetDocumentSchema.safeParse(fleet).success).toBe(true);
    expect(checkFleetIntegrity(fleet)).toEqual([]);
  });

  it('has the orchestrator and the five specialist columns from the diagram', () => {
    expect(fleet.agents).toHaveLength(6);
    const orchestrators = fleet.agents.filter((a) => a.kind === 'orchestrator');
    expect(orchestrators).toHaveLength(1);
    expect(orchestrators[0]?.name).toBe('Orchestrator');

    expect(childIdsOf(fleet, 'vagt_orchestrator')).toHaveLength(5);
    expect(fleet.agents.filter((a) => a.kind === 'department').map((a) => a.name)).toEqual([
      'Objektvertrieb',
      'PPTX-Creator',
      'Holzoffensive Buddy',
      'Business Development',
      'Weitere Fachagenten',
    ]);
  });

  it('every specialist reports to the orchestrator and the edge says "delegiert"', () => {
    for (const edge of fleet.edges) {
      expect(edge.kind).toBe('hierarchy');
      expect(edge.source).toBe('vagt_orchestrator');
      expect(edge.label).toBe('delegiert');
    }
    for (const agent of fleet.agents.filter((a) => a.kind === 'department')) {
      expect(parentsOf(fleet, agent.id).map((p) => p.name)).toEqual(['Orchestrator']);
    }
  });

  it('carries the roadmap statuses from the "heute" diagram', () => {
    const status = (id: string): string | undefined => fleet.agents.find((a) => a.id === id)?.status;
    // produktiv -> live
    expect(status('vagt_objektvertrieb')).toBe('live');
    // in Arbeit -> building
    expect(status('vagt_pptx')).toBe('building');
    // not in the "heute" diagram at all -> planned
    expect(status('vagt_orchestrator')).toBe('planned');
    expect(status('vagt_holzoffensive')).toBe('planned');
    expect(status('vagt_businessdev')).toBe('planned');
    expect(status('vagt_weitere')).toBe('planned');
  });

  it('mirrors each agent status on the edge that carries it', () => {
    for (const edge of fleet.edges) {
      const child = fleet.agents.find((a) => a.id === edge.target);
      expect(edge.status).toBe(child?.status);
    }
  });

  it('models Sorakel as the orchestrator\'s LLM, not as an agent', () => {
    expect(fleet.agents.some((a) => a.name === 'Sorakel')).toBe(false);
    const orchestrator = fleet.agents.find((a) => a.id === 'vagt_orchestrator');
    expect(orchestrator?.model).toEqual({ provider: 'Sorakel', name: 'externes Unternehmens-LLM' });
  });

  it('models Dataverse & SharePoint as the substrate every agent draws on', () => {
    expect(fleet.agents.some((a) => a.name.includes('Dataverse &'))).toBe(false);
    for (const agent of fleet.agents) {
      expect(agent.toolIds).toContain('vtol_dataverse');
      expect(agent.toolIds).toContain('vtol_sharepoint');
      expect(agent.toolIds).toContain('vtol_flows');
    }
  });

  it('gives every agent the shared Unternehmenskontext ("Kontext für alle")', () => {
    for (const agent of fleet.agents) {
      expect(agent.dataSourceIds).toContain('vdsr_unternehmenskontext');
    }
  });

  it('keeps Allgemeines Unternehmenswissen to the orchestrator only', () => {
    const holders = fleet.agents.filter((a) => a.dataSourceIds.includes('vdsr_unternehmenswissen'));
    expect(holders.map((a) => a.id)).toEqual(['vagt_orchestrator']);
  });

  it('carries the per-source statuses the "heute" diagram shows', () => {
    const source = (id: string) => fleet.dataSources.find((d) => d.id === id);
    // Objektvertrieb is productive today, so its sources are Ready and linked.
    expect(source('vdsr_crm')).toMatchObject({ status: 'live', linked: true });
    expect(source('vdsr_sap')).toMatchObject({ status: 'live', linked: true });
    // Bauprojekt-Sites is amber (in Arbeit) in the today diagram.
    expect(source('vdsr_bauprojekte')?.status).toBe('building');
    // PPTX sources are "fehlt / nicht verknüpft".
    expect(source('vdsr_produktbilder')).toMatchObject({ status: 'planned', linked: false });
    expect(source('vdsr_produktwissen')).toMatchObject({ status: 'planned', linked: false });
  });

  it('has one branching workflow tool, so the mini-DAG has something to show', () => {
    const flows = fleet.tools.find((t) => t.id === 'vtol_flows');
    const condition = flows?.workflow?.steps.find((s) => s.kind === 'condition');
    expect(condition?.next).toHaveLength(2);
  });

  it('renders one instance per agent - nothing is shared in the vision', () => {
    expect(instances(fleet)).toHaveLength(fleet.agents.length);
  });

  it('survives a JSON export/import round-trip', () => {
    const result = parseFleetJson(exportFleetToJson(fleet));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fleet).toEqual(fleet);
  });

  it('returns a fresh copy each call', () => {
    const first = solarluxVisionFleet();
    first.agents[0]!.name = 'Changed';
    expect(solarluxVisionFleet().agents[0]?.name).toBe('Orchestrator');
  });
});
