/** SPEC 4 - "exactly one orchestrator; no hierarchy cycles; edge endpoints exist; referenced library ids exist." */
import { describe, expect, it } from 'vitest';
import { FleetDocumentSchema, checkFleetIntegrity, isFleetValid } from '../../src/model/integrity.js';
import { AGENT, LIB, makeFleet } from '../fixtures/fleets.js';

const codes = (fleet: Parameters<typeof checkFleetIntegrity>[0]): string[] =>
  checkFleetIntegrity(fleet).map((issue) => issue.code);

describe('checkFleetIntegrity', () => {
  it('passes a well-formed fleet', () => {
    expect(checkFleetIntegrity(makeFleet())).toEqual([]);
    expect(isFleetValid(makeFleet())).toBe(true);
  });

  it('requires exactly one orchestrator - none', () => {
    const fleet = makeFleet();
    fleet.agents = fleet.agents.filter((a) => a.kind !== 'orchestrator');
    fleet.edges = fleet.edges.filter((e) => e.source !== AGENT.orchestrator);
    expect(codes(fleet)).toContain('orchestrator-count');
  });

  it('requires exactly one orchestrator - two', () => {
    const fleet = makeFleet();
    const sales = fleet.agents.find((a) => a.id === AGENT.sales);
    if (sales) sales.kind = 'orchestrator';
    const issue = checkFleetIntegrity(fleet).find((i) => i.code === 'orchestrator-count');
    expect(issue?.message).toContain('2 orchestrators');
  });

  it('flags an edge pointing at a missing agent', () => {
    const fleet = makeFleet();
    fleet.edges.push({
      id: 'edg_ghost',
      source: AGENT.sales,
      target: 'agt_missing',
      kind: 'hierarchy',
      status: 'planned',
    });
    const issue = checkFleetIntegrity(fleet).find((i) => i.code === 'edge-endpoint-missing');
    expect(issue?.message).toContain('agt_missing');
    expect(issue?.path).toEqual(['edges', 7, 'target']);
  });

  it('flags a self-loop', () => {
    const fleet = makeFleet();
    fleet.edges.push({
      id: 'edg_self',
      source: AGENT.sales,
      target: AGENT.sales,
      kind: 'hierarchy',
      status: 'planned',
    });
    expect(codes(fleet)).toContain('edge-self-loop');
    expect(codes(fleet)).toContain('hierarchy-cycle');
  });

  it('flags a hierarchy cycle and names the loop', () => {
    const fleet = makeFleet();
    fleet.edges.push({
      id: 'edg_cycle',
      source: AGENT.pricing,
      target: AGENT.sales,
      kind: 'hierarchy',
      status: 'planned',
    });
    const issue = checkFleetIntegrity(fleet).find((i) => i.code === 'hierarchy-cycle');
    expect(issue?.message).toContain(AGENT.sales);
    expect(issue?.message).toContain(AGENT.pricing);
  });

  it('does not treat a peer link as a cycle', () => {
    const fleet = makeFleet();
    fleet.edges.push({
      id: 'edg_peer_back',
      source: AGENT.operations,
      target: AGENT.leads,
      kind: 'peer',
      status: 'planned',
    });
    expect(codes(fleet)).not.toContain('hierarchy-cycle');
  });

  it('does not treat a shared agent (two parents) as a cycle', () => {
    expect(codes(makeFleet())).not.toContain('hierarchy-cycle');
  });

  it('flags a duplicate edge', () => {
    const fleet = makeFleet();
    fleet.edges.push({
      id: 'edg_dupe',
      source: AGENT.sales,
      target: AGENT.leads,
      kind: 'hierarchy',
      status: 'planned',
    });
    expect(codes(fleet)).toContain('edge-duplicate');
  });

  it('flags duplicate ids in every collection', () => {
    const fleet = makeFleet();
    const first = fleet.agents[0];
    const skill = fleet.skills[0];
    if (first) fleet.agents.push({ ...first, kind: 'worker' });
    if (skill) fleet.skills.push({ ...skill });
    expect(codes(fleet).filter((c) => c === 'duplicate-id')).toHaveLength(2);
  });

  it('flags a reference to a library item that does not exist', () => {
    const fleet = makeFleet();
    fleet.agents[1]?.skillIds.push('skl_ghost');
    const issue = checkFleetIntegrity(fleet).find((i) => i.code === 'library-ref-missing');
    expect(issue?.message).toContain('skl_ghost');
  });

  it('accepts every real library reference in the fixture', () => {
    const fleet = makeFleet();
    expect(fleet.skills.map((s) => s.id)).toContain(LIB.skill);
    expect(codes(fleet)).not.toContain('library-ref-missing');
  });
});

describe('FleetDocumentSchema', () => {
  it('combines structural and integrity validation in one parse', () => {
    expect(FleetDocumentSchema.safeParse(makeFleet()).success).toBe(true);
  });

  it('reports integrity problems as Zod issues on the right path', () => {
    const fleet = makeFleet();
    fleet.agents = fleet.agents.filter((a) => a.kind !== 'orchestrator');
    fleet.edges = fleet.edges.filter((e) => e.source !== AGENT.orchestrator);

    const result = FleetDocumentSchema.safeParse(fleet);
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.message.includes('no orchestrator'))).toBe(true);
  });

  it('still catches structural errors', () => {
    const fleet = makeFleet();
    const agent = fleet.agents[0];
    if (agent) agent.name = '';
    expect(FleetDocumentSchema.safeParse(fleet).success).toBe(false);
  });
});
