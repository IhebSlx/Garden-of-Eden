/** SPEC 5.11 - Blank and Company fleet starting points. */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetIdFactory, sequentialIdFactory, setIdFactory } from '../../src/model/ids.js';
import { checkFleetIntegrity } from '../../src/model/integrity.js';
import { FleetSchema } from '../../src/model/schemas.js';
import {
  COMPANY_DEPARTMENTS,
  blankFleet,
  companyFleet,
  fleetFromTemplate,
} from '../../src/model/templates.js';

beforeEach(() => {
  setIdFactory(sequentialIdFactory());
  return () => resetIdFactory();
});

describe('blankFleet', () => {
  it('is an orchestrator and nothing else', () => {
    const fleet = blankFleet();
    expect(fleet.agents).toHaveLength(1);
    expect(fleet.agents[0]?.kind).toBe('orchestrator');
    expect(fleet.edges).toEqual([]);
    expect(fleet.skills).toEqual([]);
    expect(fleet.tools).toEqual([]);
    expect(fleet.dataSources).toEqual([]);
  });

  it('starts Planned (SPEC 5.6)', () => {
    expect(blankFleet().agents[0]?.status).toBe('planned');
  });

  it('is schema-valid and integrity-clean', () => {
    const fleet = blankFleet();
    expect(FleetSchema.safeParse(fleet).success).toBe(true);
    expect(checkFleetIntegrity(fleet)).toEqual([]);
  });

  it('takes a custom name', () => {
    expect(blankFleet('My fleet').name).toBe('My fleet');
  });
});

describe('companyFleet', () => {
  it('is an orchestrator plus four generic departments, pre-wired', () => {
    const fleet = companyFleet();
    expect(fleet.agents).toHaveLength(5);
    expect(fleet.agents.filter((a) => a.kind === 'department')).toHaveLength(4);
    expect(fleet.edges).toHaveLength(4);
    expect(fleet.edges.every((e) => e.kind === 'hierarchy')).toBe(true);
  });

  it('wires every department to the orchestrator', () => {
    const fleet = companyFleet();
    const orchestrator = fleet.agents.find((a) => a.kind === 'orchestrator');
    expect(fleet.edges.every((e) => e.source === orchestrator?.id)).toBe(true);
    expect(fleet.edges.map((e) => e.target).sort()).toEqual(
      fleet.agents
        .filter((a) => a.kind === 'department')
        .map((a) => a.id)
        .sort(),
    );
  });

  it('is entirely Planned and ready to rename (SPEC 5.11)', () => {
    const fleet = companyFleet();
    expect(fleet.agents.every((a) => a.status === 'planned')).toBe(true);
    expect(fleet.edges.every((e) => e.status === 'planned')).toBe(true);
    expect(fleet.agents.filter((a) => a.kind === 'department').map((a) => a.name)).toEqual(
      COMPANY_DEPARTMENTS.map((d) => d.name),
    );
  });

  it('gives every department a role so no card ships empty', () => {
    expect(companyFleet().agents.every((a) => a.role.length > 0)).toBe(true);
  });

  it('is schema-valid and integrity-clean', () => {
    const fleet = companyFleet();
    expect(FleetSchema.safeParse(fleet).success).toBe(true);
    expect(checkFleetIntegrity(fleet)).toEqual([]);
  });
});

describe('fleetFromTemplate', () => {
  it('dispatches on the template name', () => {
    expect(fleetFromTemplate('blank').agents).toHaveLength(1);
    expect(fleetFromTemplate('company').agents).toHaveLength(5);
  });

  it('mints fresh ids on every call', () => {
    expect(fleetFromTemplate('blank').id).not.toBe(fleetFromTemplate('blank').id);
  });
});
