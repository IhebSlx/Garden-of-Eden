/**
 * SPEC §4 (derived rules, last bullet) — cross-entity validation:
 *   "exactly one orchestrator; no hierarchy cycles; edge endpoints exist;
 *    referenced library ids exist."
 *
 * Kept separate from the structural schemas so the UI can surface issues as a list
 * (§5.8 blocks destructive actions by showing *why*), while import (§7) runs both
 * layers at once via `FleetDocumentSchema`.
 */
import type { z } from 'zod';
import { FleetSchema } from './schemas.js';
import type { Fleet } from './schemas.js';

export type IntegrityCode =
  | 'duplicate-id'
  | 'orchestrator-count'
  | 'edge-endpoint-missing'
  | 'edge-self-loop'
  | 'edge-duplicate'
  | 'hierarchy-cycle'
  | 'library-ref-missing';

export type IntegrityIssue = {
  code: IntegrityCode;
  message: string;
  /** Path into the fleet document, in Zod's `path` shape, for error surfacing. */
  path: (string | number)[];
};

function collectDuplicateIds(fleet: Fleet, issues: IntegrityIssue[]): void {
  const buckets: { key: 'agents' | 'edges' | 'skills' | 'tools' | 'dataSources'; items: { id: string }[] }[] = [
    { key: 'agents', items: fleet.agents },
    { key: 'edges', items: fleet.edges },
    { key: 'skills', items: fleet.skills },
    { key: 'tools', items: fleet.tools },
    { key: 'dataSources', items: fleet.dataSources },
  ];

  for (const bucket of buckets) {
    const seen = new Set<string>();
    bucket.items.forEach((item, index) => {
      if (seen.has(item.id)) {
        issues.push({
          code: 'duplicate-id',
          message: `duplicate ${bucket.key} id "${item.id}"`,
          path: [bucket.key, index, 'id'],
        });
      }
      seen.add(item.id);
    });
  }
}

function checkOrchestrator(fleet: Fleet, issues: IntegrityIssue[]): void {
  const orchestrators = fleet.agents.filter((a) => a.kind === 'orchestrator');
  if (orchestrators.length !== 1) {
    issues.push({
      code: 'orchestrator-count',
      message:
        orchestrators.length === 0
          ? 'fleet has no orchestrator (exactly one is required)'
          : `fleet has ${orchestrators.length} orchestrators (exactly one is required): ${orchestrators
              .map((a) => a.name)
              .join(', ')}`,
      path: ['agents'],
    });
  }
}

function checkEdges(fleet: Fleet, issues: IntegrityIssue[]): void {
  const agentIds = new Set(fleet.agents.map((a) => a.id));
  const seenPairs = new Set<string>();

  fleet.edges.forEach((edge, index) => {
    if (!agentIds.has(edge.source)) {
      issues.push({
        code: 'edge-endpoint-missing',
        message: `edge "${edge.id}" has unknown source agent "${edge.source}"`,
        path: ['edges', index, 'source'],
      });
    }
    if (!agentIds.has(edge.target)) {
      issues.push({
        code: 'edge-endpoint-missing',
        message: `edge "${edge.id}" has unknown target agent "${edge.target}"`,
        path: ['edges', index, 'target'],
      });
    }
    if (edge.source === edge.target) {
      issues.push({
        code: 'edge-self-loop',
        message: `edge "${edge.id}" connects agent "${edge.source}" to itself`,
        path: ['edges', index],
      });
    }

    // Two identical edges would mint two instances with the same key (§4 instance rule).
    const pair = `${edge.kind}:${edge.source}->${edge.target}`;
    if (seenPairs.has(pair)) {
      issues.push({
        code: 'edge-duplicate',
        message: `duplicate ${edge.kind} edge from "${edge.source}" to "${edge.target}"`,
        path: ['edges', index],
      });
    }
    seenPairs.add(pair);
  });
}

/**
 * Depth-first cycle detection over hierarchy edges only.
 * Peer edges are deliberately excluded: they are not structure (§5.2).
 */
function checkHierarchyCycles(fleet: Fleet, issues: IntegrityIssue[]): void {
  const children = new Map<string, string[]>();
  for (const edge of fleet.edges) {
    if (edge.kind !== 'hierarchy') continue;
    const list = children.get(edge.source);
    if (list) list.push(edge.target);
    else children.set(edge.source, [edge.target]);
  }

  const UNVISITED = 0;
  const IN_STACK = 1;
  const DONE = 2;
  const state = new Map<string, number>();
  const reported = new Set<string>();

  const walk = (agentId: string, stack: string[]): void => {
    state.set(agentId, IN_STACK);
    stack.push(agentId);

    for (const childId of children.get(agentId) ?? []) {
      const childState = state.get(childId) ?? UNVISITED;
      if (childState === IN_STACK) {
        const start = stack.indexOf(childId);
        const cycle = [...stack.slice(start === -1 ? 0 : start), childId];
        const signature = cycle.join('->');
        if (!reported.has(signature)) {
          reported.add(signature);
          issues.push({
            code: 'hierarchy-cycle',
            message: `hierarchy cycle: ${signature}`,
            path: ['edges'],
          });
        }
      } else if (childState === UNVISITED) {
        walk(childId, stack);
      }
    }

    stack.pop();
    state.set(agentId, DONE);
  };

  for (const agent of fleet.agents) {
    if ((state.get(agent.id) ?? UNVISITED) === UNVISITED) walk(agent.id, []);
  }
}

function checkLibraryRefs(fleet: Fleet, issues: IntegrityIssue[]): void {
  const libraries = [
    { field: 'skillIds', label: 'skill', ids: new Set(fleet.skills.map((s) => s.id)) },
    { field: 'toolIds', label: 'tool', ids: new Set(fleet.tools.map((t) => t.id)) },
    { field: 'dataSourceIds', label: 'data source', ids: new Set(fleet.dataSources.map((d) => d.id)) },
  ] as const;

  fleet.agents.forEach((agent, agentIndex) => {
    for (const library of libraries) {
      agent[library.field].forEach((refId, refIndex) => {
        if (!library.ids.has(refId)) {
          issues.push({
            code: 'library-ref-missing',
            message: `agent "${agent.name}" references unknown ${library.label} "${refId}"`,
            path: ['agents', agentIndex, library.field, refIndex],
          });
        }
      });
    }
  });
}

/** All §4 integrity violations in the fleet, in a stable order. Empty array = valid. */
export function checkFleetIntegrity(fleet: Fleet): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  collectDuplicateIds(fleet, issues);
  checkOrchestrator(fleet, issues);
  checkEdges(fleet, issues);
  checkHierarchyCycles(fleet, issues);
  checkLibraryRefs(fleet, issues);
  return issues;
}

export function isFleetValid(fleet: Fleet): boolean {
  return checkFleetIntegrity(fleet).length === 0;
}

/**
 * Structure + integrity in one parse. This is what import (§7) validates against,
 * so a hand-edited or foreign file can never enter the store half-broken.
 */
export const FleetDocumentSchema = FleetSchema.superRefine((fleet, ctx) => {
  for (const issue of checkFleetIntegrity(fleet)) {
    ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
  }
});

export type FleetDocument = z.infer<typeof FleetDocumentSchema>;
