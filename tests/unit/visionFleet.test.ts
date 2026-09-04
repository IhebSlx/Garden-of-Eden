/**
 * The Solarlux target architecture from `agenten_02_vision.pdf`, with statuses
 * taken from the companion `agenten_01_heute.svg` legend (produktiv / in Arbeit /
 * fehlt-nicht verknüpft).
 */
import { describe, expect, it } from 'vitest';
import { FleetDocumentSchema, checkFleetIntegrity } from '../../src/model/integrity.js';
import { childIdsOf, instances, isShared, parentsOf } from '../../src/model/selectors.js';
import { solarluxVisionFleet } from '../../src/model/visionFleet.js';
import { exportFleetToJson, parseFleetJson } from '../../src/store/io.js';

const fleet = solarluxVisionFleet();

describe('Solarlux vision fleet', () => {
  it('is schema-valid and integrity-clean', () => {
    expect(FleetDocumentSchema.safeParse(fleet).success).toBe(true);
    expect(checkFleetIntegrity(fleet)).toEqual([]);
  });

  it('has the orchestrator, nine departments and five sub-agents', () => {
    expect(fleet.agents).toHaveLength(15);
    const orchestrators = fleet.agents.filter((a) => a.kind === 'orchestrator');
    expect(orchestrators).toHaveLength(1);
    expect(orchestrators[0]?.name).toBe('Orchestrator');

    expect(childIdsOf(fleet, 'vagt_orchestrator')).toHaveLength(9);
    expect(fleet.agents.filter((a) => a.kind === 'department').map((a) => a.name)).toEqual([
      'Objektvertrieb',
      'Controlling',
      'Marketing',
      'Service',
      'Finanzen',
      'Forschung & Entwicklung',
      'IT',
      'Produktion',
      'Weitere Fachagenten',
    ]);
    expect(fleet.agents.filter((a) => a.kind === 'worker').map((a) => a.name)).toEqual([
      'Projektsuche',
      'PPTX-Creator',
      'Leistungsverzeichnis-Decoder',
      'Kalkulationsagent',
      'Holzoffensive Buddy',
    ]);

    // SPEC-adjacent house rule: level 2 names areas of the business, nothing else.
    for (const id of childIdsOf(fleet, 'vagt_orchestrator')) {
      expect(fleet.agents.find((a) => a.id === id)?.kind).toBe('department');
    }
  });

  it('hangs the deck builder off both departments that commission decks', () => {
    // A sub-agent, one level below the departments, shared by two of them (SPEC §2.2).
    expect(parentsOf(fleet, 'vagt_pptx').map((p) => p.name)).toEqual(['Objektvertrieb', 'Controlling']);
    expect(parentsOf(fleet, 'vagt_pptx').some((p) => p.kind === 'orchestrator')).toBe(false);
    expect(isShared(fleet, 'vagt_pptx')).toBe(true);
  });

  it('puts the Holzoffensive answers beside the deck builder, not above it', () => {
    expect(parentsOf(fleet, 'vagt_holzoffensive').map((p) => p.name)).toEqual(['Controlling']);
    // Same level, so neither reports to the other.
    expect(childIdsOf(fleet, 'vagt_holzoffensive')).toEqual([]);

    const peer = fleet.edges.find((e) => e.kind === 'peer');
    expect(peer).toMatchObject({ source: 'vagt_holzoffensive', target: 'vagt_pptx' });
    // SPEC §5.2: a peer link never expands focus, so it adds no instance.
    expect(instances(fleet).filter((i) => i.agentId === 'vagt_holzoffensive')).toHaveLength(1);
  });

  it('every department reports to the orchestrator and the edge says "delegiert"', () => {
    for (const agent of fleet.agents.filter((a) => a.kind === 'department')) {
      expect(parentsOf(fleet, agent.id).map((p) => p.name)).toEqual(['Orchestrator']);
    }
    const fromOrchestrator = fleet.edges.filter((e) => e.source === 'vagt_orchestrator');
    expect(fromOrchestrator).toHaveLength(9);
    for (const edge of fromOrchestrator) {
      expect(edge.kind).toBe('hierarchy');
      expect(edge.label).toBe('delegiert');
    }
    // The sub-agent is commissioned by its departments, not delegated to by the top.
    const commissions = fleet.edges.filter((e) => e.target === 'vagt_pptx' && e.kind === 'hierarchy');
    expect(commissions).toHaveLength(2);
    for (const edge of commissions) expect(edge.label).toBe('beauftragt');
    // One peer hand-off aside, every edge is hierarchy.
    expect(fleet.edges.filter((e) => e.kind !== 'hierarchy')).toHaveLength(1);
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
    expect(status('vagt_controlling')).toBe('planned');
    expect(status('vagt_weitere')).toBe('planned');
  });

  it('mirrors each agent status on the edge that carries it', () => {
    for (const edge of fleet.edges) {
      const child = fleet.agents.find((a) => a.id === edge.target);
      // The shared sub-agent is Building under the department already using it and
      // Planned under the one that has not started, so its two edges differ.
      if (edge.target === 'vagt_pptx') continue;
      expect(edge.status).toBe(child?.status);
    }
    const pptxEdges = fleet.edges.filter((e) => e.target === 'vagt_pptx');
    expect(pptxEdges.map((e) => e.status).sort()).toEqual(['building', 'planned', 'planned']);
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

  it('records the department sites that exist but that nobody reads yet', () => {
    const source = (id: string) => fleet.dataSources.find((d) => d.id === id);
    // Existing, so not something a department still owes - but not linked either,
    // which is exactly the state a site is in before an agent is pointed at it.
    expect(source('vdsr_sp_finanzen')).toMatchObject({
      status: 'live',
      linked: false,
      owner: 'Finanzen',
      ref: 'https://solarlux.sharepoint.com/sites/Finanzen',
    });
    expect(source('vdsr_sp_fue')?.owner).toBe('Forschung & Entwicklung');

    // Each site sits with its own department and nowhere else.
    const holders = (id: string) =>
      fleet.agents.filter((a) => a.dataSourceIds.includes(id)).map((a) => a.name);
    expect(holders('vdsr_sp_finanzen')).toEqual(['Finanzen']);
    expect(holders('vdsr_sp_fue')).toEqual(['Forschung & Entwicklung']);
  });

  it('has one branching workflow tool, so the mini-DAG has something to show', () => {
    const flows = fleet.tools.find((t) => t.id === 'vtol_flows');
    const condition = flows?.workflow?.steps.find((s) => s.kind === 'condition');
    expect(condition?.next).toHaveLength(2);
  });

  it('draws the shared sub-agent once under each parent (SPEC §2.3)', () => {
    // Eight agents, but the deck builder has two parents, so nine instances.
    expect(instances(fleet)).toHaveLength(fleet.agents.length + 1);
    expect(instances(fleet).filter((i) => i.agentId === 'vagt_pptx')).toHaveLength(2);
  });

  it('puts the Angebotsprozess sub-agents under Objektvertrieb', () => {
    for (const id of ['vagt_lvdecoder', 'vagt_kalkulation']) {
      expect(parentsOf(fleet, id).map((p) => p.name)).toEqual(['Objektvertrieb']);
      expect(isShared(fleet, id)).toBe(false);
    }
    expect(childIdsOf(fleet, 'vagt_objektvertrieb')).toEqual([
      'vagt_projektsuche',
      'vagt_pptx',
      'vagt_lvdecoder',
      'vagt_kalkulation',
    ]);
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

describe('departments carry no work of their own', () => {
  const fleet = solarluxVisionFleet();

  it('leaves the Objektvertrieb department empty and gives its content to Projektsuche', () => {
    const department = fleet.agents.find((a) => a.id === 'vagt_objektvertrieb');
    expect(department).toMatchObject({ kind: 'department', name: 'Objektvertrieb' });
    expect(department?.skillIds).toEqual([]);
    expect(department?.instructions).toBeUndefined();

    // The agent that actually runs today kept everything it had.
    const worker = fleet.agents.find((a) => a.id === 'vagt_projektsuche');
    expect(worker).toMatchObject({ kind: 'worker', name: 'Projektsuche', status: 'live' });
    expect(worker?.skillIds).toEqual(['vskl_projektstatus', 'vskl_belege']);
    expect(worker?.dataSourceIds).toContain('vdsr_crm');
    expect(worker?.instructions).toContain('Qualifiziere jedes Bauprojekt');
  });

  it('leaves the departments added for the org chart empty of work', () => {
    for (const id of ['vagt_finanzen', 'vagt_fue', 'vagt_it', 'vagt_produktion']) {
      const department = fleet.agents.find((a) => a.id === id);
      expect(department?.kind).toBe('department');
      expect(department?.skillIds).toEqual([]);
      expect(department?.instructions).toBeUndefined();
      // Named at level 2, so the orchestrator delegates to them directly.
      expect(parentsOf(fleet, id).map((p) => p.name)).toEqual(['Orchestrator']);
      expect(childIdsOf(fleet, id)).toEqual([]);
    }
  });

  it('keeps every second-level node a department', () => {
    // The rule is about what sits at level 2, not about departments being empty:
    // Controlling still carries its own skills and has not been split yet.
    for (const id of childIdsOf(fleet, 'vagt_orchestrator')) {
      expect(fleet.agents.find((a) => a.id === id)?.kind).toBe('department');
    }
  });
});
