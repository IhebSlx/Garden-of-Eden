/** SPEC 4 - the Zod schemas are the runtime contract. */
import { describe, expect, it } from 'vitest';
import {
  AgentSchema,
  DATA_SOURCE_STATUS_LABELS,
  DataSourceSchema,
  EdgeSchema,
  FleetSchema,
  SCHEMA_VERSION,
  STATUS_LABELS,
  SkillSchema,
  StatusSchema,
  ToolSchema,
} from '../../src/model/schemas.js';
import { makeFleet } from '../fixtures/fleets.js';

describe('Status', () => {
  it('accepts exactly the three roadmap states', () => {
    expect(StatusSchema.options).toEqual(['live', 'building', 'planned']);
    expect(StatusSchema.safeParse('done').success).toBe(false);
  });

  it('labels agents by readiness and data by provision (SPEC 4 / 5.6)', () => {
    // An agent is Live or not; data either exists or somebody still owes it.
    expect(STATUS_LABELS.live).toBe('Live');
    expect(STATUS_LABELS.building).toBe('In progress');
    expect(STATUS_LABELS.planned).toBe('Planned');

    expect(DATA_SOURCE_STATUS_LABELS.live).toBe('Existing');
    expect(DATA_SOURCE_STATUS_LABELS.building).toBe('Being prepared');
    expect(DATA_SOURCE_STATUS_LABELS.planned).toBe('To be provided');
  });

  it('shares one enum, so every status control keeps working', () => {
    expect(Object.keys(DATA_SOURCE_STATUS_LABELS)).toEqual(Object.keys(STATUS_LABELS));
  });
});

describe('AgentSchema', () => {
  const valid = {
    id: 'agt_1',
    kind: 'worker',
    name: 'Quote builder',
    role: 'Assembles quotes',
    status: 'planned',
    skillIds: [],
    toolIds: [],
    dataSourceIds: [],
  };

  it('accepts a minimal agent', () => {
    expect(AgentSchema.parse(valid)).toMatchObject({ id: 'agt_1', kind: 'worker' });
  });

  it('rejects "shared" as a kind - shared-ness is derived (SPEC 4 / 8)', () => {
    expect(AgentSchema.safeParse({ ...valid, kind: 'shared' }).success).toBe(false);
  });

  it('rejects an empty id or name', () => {
    expect(AgentSchema.safeParse({ ...valid, id: '' }).success).toBe(false);
    expect(AgentSchema.safeParse({ ...valid, name: '' }).success).toBe(false);
  });

  it('allows an empty role but requires the key', () => {
    expect(AgentSchema.safeParse({ ...valid, role: '' }).success).toBe(true);
    const { role: _omitted, ...withoutRole } = valid;
    expect(AgentSchema.safeParse(withoutRole).success).toBe(false);
  });

  it('accepts optional model config and manual position', () => {
    const parsed = AgentSchema.parse({
      ...valid,
      model: { provider: 'anthropic', name: 'claude-opus-5', temperature: 0.2 },
      position: { x: 120, y: -40 },
    });
    expect(parsed.model?.name).toBe('claude-opus-5');
    expect(parsed.position).toEqual({ x: 120, y: -40 });
  });

  it('rejects a non-numeric position', () => {
    expect(AgentSchema.safeParse({ ...valid, position: { x: '1', y: 2 } }).success).toBe(false);
  });
});

describe('EdgeSchema', () => {
  const valid = { id: 'edg_1', source: 'agt_1', target: 'agt_2', kind: 'hierarchy', status: 'live' };

  it('accepts hierarchy and peer links', () => {
    expect(EdgeSchema.safeParse(valid).success).toBe(true);
    expect(EdgeSchema.safeParse({ ...valid, kind: 'peer', label: 'hands off to' }).success).toBe(true);
  });

  it('rejects an unknown kind', () => {
    expect(EdgeSchema.safeParse({ ...valid, kind: 'dependency' }).success).toBe(false);
  });
});

describe('SkillSchema', () => {
  it('needs only an id and a name', () => {
    expect(SkillSchema.safeParse({ id: 'skl_1', name: 'Negotiation' }).success).toBe(true);
    expect(SkillSchema.safeParse({ id: 'skl_1' }).success).toBe(false);
  });
});

describe('ToolSchema', () => {
  const valid = {
    id: 'tol_1',
    name: 'Quote flow',
    description: 'Builds a quote document',
    type: 'workflow',
  };

  it('requires a description - every tool explains itself (SPEC 4)', () => {
    expect(ToolSchema.safeParse({ ...valid, description: '' }).success).toBe(false);
    const { description: _omitted, ...withoutDescription } = valid;
    expect(ToolSchema.safeParse(withoutDescription).success).toBe(false);
  });

  it('accepts a branching workflow (mini-DAG, SPEC 8.6)', () => {
    const parsed = ToolSchema.safeParse({
      ...valid,
      workflow: {
        steps: [
          { id: 's1', name: 'Start', kind: 'trigger', next: ['s2', 's3'] },
          { id: 's2', name: 'Send', kind: 'action', next: [] },
          { id: 's3', name: 'Escalate', kind: 'action', next: [] },
        ],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('allows workflow steps only on tools of type "workflow" (SPEC 4)', () => {
    const result = ToolSchema.safeParse({
      ...valid,
      type: 'python',
      workflow: { steps: [{ id: 's1', name: 'Start', kind: 'trigger', next: [] }] },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('only allowed on tools of type "workflow"');
  });

  it('rejects a step pointing at a step that does not exist', () => {
    const result = ToolSchema.safeParse({
      ...valid,
      workflow: { steps: [{ id: 's1', name: 'Start', kind: 'trigger', next: ['ghost'] }] },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('unknown step "ghost"');
  });

  it('accepts non-workflow tool types with free-form config', () => {
    expect(
      ToolSchema.safeParse({ ...valid, type: 'python', config: { entrypoint: 'main.py' } }).success,
    ).toBe(true);
  });
});

describe('DataSourceSchema', () => {
  const valid = { id: 'dsr_1', name: 'Price list', type: 'sharepoint', status: 'live' };

  it('accepts the linked badge and a ref', () => {
    const parsed = DataSourceSchema.parse({ ...valid, linked: true, ref: 'sites/sales/prices' });
    expect(parsed.linked).toBe(true);
  });

  it('does not force `linked` to follow status - it is meaning, not a constraint (SPEC 4)', () => {
    expect(DataSourceSchema.safeParse({ ...valid, status: 'planned', linked: true }).success).toBe(true);
  });

  it('accepts any source id, because a fleet declares its own kinds', () => {
    // The check that a type names something real moved from Zod to integrity: a
    // closed enum could not hold SAP-Belege or Objektportal.
    expect(DataSourceSchema.safeParse({ ...valid, type: 'skd_sap' }).success).toBe(true);
  });

  it('still refuses an empty source id, which is what "undefined" is for', () => {
    expect(DataSourceSchema.safeParse({ ...valid, type: '' }).success).toBe(false);
  });
});

describe('FleetSchema', () => {
  it('accepts the fixture fleet', () => {
    expect(FleetSchema.safeParse(makeFleet()).success).toBe(true);
  });

  it('pins the schema version', () => {
    const fleet = makeFleet();
    expect(fleet.schemaVersion).toBe(SCHEMA_VERSION);
    expect(FleetSchema.safeParse({ ...fleet, schemaVersion: 2 }).success).toBe(false);
  });

  it('survives a JSON round-trip unchanged', () => {
    const fleet = makeFleet();
    expect(FleetSchema.parse(JSON.parse(JSON.stringify(fleet)))).toEqual(fleet);
  });

  it('strips nothing it should keep', () => {
    const fleet = makeFleet();
    const parsed = FleetSchema.parse(fleet);
    expect(parsed.tools[0]?.workflow?.steps).toHaveLength(4);
    expect(parsed.dataSources[0]?.ref).toBe('sites/sales/prices');
  });
});

const AGENT_FIXTURE = {
  id: 'agt_1',
  kind: 'worker' as const,
  name: 'A',
  role: '',
  status: 'planned' as const,
  skillIds: [],
  toolIds: [],
  dataSourceIds: [],
};

describe('notes — free text about a component, for people', () => {
  it('is optional on all four kinds, so nothing existing breaks', () => {
    expect(AgentSchema.safeParse({ ...AGENT_FIXTURE }).success).toBe(true);
    expect(SkillSchema.safeParse({ id: 's', name: 'S' }).success).toBe(true);
    expect(ToolSchema.safeParse({ id: 't', name: 'T', description: 'd', type: 'python' }).success).toBe(true);
    expect(DataSourceSchema.safeParse({ id: 'd', name: 'D', type: 'md', status: 'planned' }).success).toBe(true);
  });

  it('round-trips on all four kinds', () => {
    const notes = 'Ask Marketing whether the 2023 template is still current.';
    expect(AgentSchema.parse({ ...AGENT_FIXTURE, notes }).notes).toBe(notes);
    expect(SkillSchema.parse({ id: 's', name: 'S', notes }).notes).toBe(notes);
    expect(ToolSchema.parse({ id: 't', name: 'T', description: 'd', type: 'python', notes }).notes).toBe(notes);
    expect(DataSourceSchema.parse({ id: 'd', name: 'D', type: 'md', status: 'planned', notes }).notes).toBe(notes);
  });

  it('keeps line breaks, because a note is prose not a label', () => {
    const notes = 'Open:\n- who owns the images?\n- template version?';
    expect(SkillSchema.parse({ id: 's', name: 'S', notes }).notes).toBe(notes);
  });

  it('is separate from an agent\'s instructions', () => {
    // Instructions are given to the agent; notes are never sent anywhere.
    const agent = AgentSchema.parse({ ...AGENT_FIXTURE, instructions: 'Always cite the source.', notes: 'Klaus disagrees with this rule.' });
    expect(agent.instructions).toBe('Always cite the source.');
    expect(agent.notes).toBe('Klaus disagrees with this rule.');
  });
});
