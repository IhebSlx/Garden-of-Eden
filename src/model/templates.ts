/**
 * SPEC 5.11 - fleet starting points.
 *
 * "Creation offers two starting points: Blank (orchestrator only) and Company fleet
 *  (orchestrator + four generic departments, everything Planned, ready to rename)."
 *
 * SPEC 5.6: new agents and their edges default to Planned, so both templates are
 * entirely Planned by construction.
 */
import { ID_PREFIX, newId } from './ids.js';
import { SCHEMA_VERSION } from './schemas.js';
import type { Agent, Edge, Fleet } from './schemas.js';

export type FleetTemplate = 'blank' | 'company';

export const FLEET_TEMPLATE_LABELS: Record<FleetTemplate, string> = {
  blank: 'Blank',
  company: 'Company fleet',
};

/**
 * The four generic departments of the Company template. Deliberately plain business
 * functions: the template exists to be renamed (SPEC 5.11), so these are starting
 * labels, not domain claims.
 */
export const COMPANY_DEPARTMENTS: { name: string; role: string }[] = [
  { name: 'Sales', role: 'Owns pipeline, quotes and customer conversations' },
  { name: 'Marketing', role: 'Owns campaigns, content and market research' },
  { name: 'Operations', role: 'Owns delivery, scheduling and internal processes' },
  { name: 'Support', role: 'Owns customer questions, tickets and follow-up' },
];

function orchestrator(name: string, role: string): Agent {
  return {
    id: newId(ID_PREFIX.agent),
    kind: 'orchestrator',
    name,
    role,
    status: 'planned',
    skillIds: [],
    toolIds: [],
    dataSourceIds: [],
  };
}

function department(name: string, role: string): Agent {
  return {
    id: newId(ID_PREFIX.agent),
    kind: 'department',
    name,
    role,
    status: 'planned',
    skillIds: [],
    toolIds: [],
    dataSourceIds: [],
  };
}

function hierarchyEdge(source: string, target: string): Edge {
  return {
    id: newId(ID_PREFIX.edge),
    source,
    target,
    kind: 'hierarchy',
    status: 'planned',
  };
}

function emptyFleet(name: string, agents: Agent[], edges: Edge[]): Fleet {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId(ID_PREFIX.fleet),
    name,
    agents,
    edges,
    skills: [],
    tools: [],
    dataSources: [],
  };
}

/** SPEC 5.11 - Blank: an orchestrator and nothing else. */
export function blankFleet(name = 'New fleet'): Fleet {
  const root = orchestrator('Orchestrator', 'Routes work across the fleet');
  return emptyFleet(name, [root], []);
}

/** SPEC 5.11 - Company fleet: orchestrator + four generic departments, pre-wired. */
export function companyFleet(name = 'Company fleet'): Fleet {
  const root = orchestrator('Orchestrator', 'Routes work across the fleet');
  const departments = COMPANY_DEPARTMENTS.map((d) => department(d.name, d.role));
  const edges = departments.map((d) => hierarchyEdge(root.id, d.id));
  return emptyFleet(name, [root, ...departments], edges);
}

export function fleetFromTemplate(template: FleetTemplate, name?: string): Fleet {
  return template === 'company' ? companyFleet(name) : blankFleet(name);
}
