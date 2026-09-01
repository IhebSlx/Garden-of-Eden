/**
 * SPEC 9 Phase 3 performance target: "100+ agents at 60 fps".
 *
 * A generated fleet big enough to exercise that, with the same shape as a real one:
 * one orchestrator, several departments, workers under each, and a handful of
 * shared agents so the instance count exceeds the agent count.
 */
import { SCHEMA_VERSION } from '../../src/model/schemas.js';
import type { Agent, DataSource, Edge, Fleet, Skill, Status, Tool } from '../../src/model/schemas.js';

const STATUSES: Status[] = ['live', 'building', 'planned'];

export type LargeFleetOptions = {
  departments?: number;
  workersPerDepartment?: number;
  sharedAgents?: number;
  librarySize?: number;
};

export function makeLargeFleet(options: LargeFleetOptions = {}): Fleet {
  const departments = options.departments ?? 8;
  const workersPerDepartment = options.workersPerDepartment ?? 13;
  const sharedAgents = options.sharedAgents ?? 6;
  const librarySize = options.librarySize ?? 40;

  const agents: Agent[] = [];
  const edges: Edge[] = [];

  const skills: Skill[] = Array.from({ length: librarySize }, (_, i) => ({
    id: `skl_${i}`,
    name: `Skill ${i}`,
  }));
  const tools: Tool[] = Array.from({ length: librarySize }, (_, i) => ({
    id: `tol_${i}`,
    name: `Tool ${i}`,
    description: `Does job ${i}`,
    type: (['workflow', 'python', 'microsoft'] as const)[i % 3] ?? 'python',
  }));
  const dataSources: DataSource[] = Array.from({ length: librarySize }, (_, i) => ({
    id: `dsr_${i}`,
    name: `Source ${i}`,
    type: (['md', 'dataverse', 'sharepoint'] as const)[i % 3] ?? 'md',
    status: STATUSES[i % 3] ?? 'planned',
  }));

  const attach = (index: number): Pick<Agent, 'skillIds' | 'toolIds' | 'dataSourceIds'> => ({
    skillIds: [`skl_${index % librarySize}`],
    toolIds: [`tol_${index % librarySize}`, `tol_${(index + 7) % librarySize}`],
    dataSourceIds: [`dsr_${index % librarySize}`],
  });

  agents.push({
    id: 'agt_root',
    kind: 'orchestrator',
    name: 'Orchestrator',
    role: 'Routes work',
    status: 'live',
    ...attach(0),
  });

  let counter = 0;
  for (let d = 0; d < departments; d += 1) {
    const departmentId = `agt_dep_${d}`;
    counter += 1;
    agents.push({
      id: departmentId,
      kind: 'department',
      name: `Department ${d}`,
      role: `Owns area ${d}`,
      status: STATUSES[d % 3] ?? 'planned',
      ...attach(counter),
    });
    edges.push({
      id: `edg_root_${d}`,
      source: 'agt_root',
      target: departmentId,
      kind: 'hierarchy',
      status: STATUSES[d % 3] ?? 'planned',
    });

    for (let w = 0; w < workersPerDepartment; w += 1) {
      const workerId = `agt_w_${d}_${w}`;
      counter += 1;
      agents.push({
        id: workerId,
        kind: 'worker',
        name: `Worker ${d}-${w}`,
        role: `Handles task ${w}`,
        status: STATUSES[(d + w) % 3] ?? 'planned',
        ...attach(counter),
      });
      edges.push({
        id: `edg_${d}_${w}`,
        source: departmentId,
        target: workerId,
        kind: 'hierarchy',
        status: STATUSES[(d + w) % 3] ?? 'planned',
      });
    }
  }

  // Shared agents hang under three departments each, so instances > agents.
  for (let s = 0; s < sharedAgents; s += 1) {
    const sharedId = `agt_shared_${s}`;
    counter += 1;
    agents.push({
      id: sharedId,
      kind: 'worker',
      name: `Shared ${s}`,
      role: 'Serves several departments',
      status: 'building',
      ...attach(counter),
    });
    for (let p = 0; p < 3; p += 1) {
      const parent = `agt_dep_${(s + p) % departments}`;
      edges.push({
        id: `edg_shared_${s}_${p}`,
        source: parent,
        target: sharedId,
        kind: 'hierarchy',
        status: 'building',
      });
    }
  }

  // A few peer links, which must never affect hierarchy or focus.
  for (let p = 0; p + 1 < departments; p += 2) {
    edges.push({
      id: `edg_peer_${p}`,
      source: `agt_dep_${p}`,
      target: `agt_dep_${p + 1}`,
      kind: 'peer',
      status: 'planned',
    });
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'flt_large',
    name: `Large fleet (${agents.length} agents)`,
    agents,
    edges,
    skills,
    tools,
    dataSources,
  };
}
