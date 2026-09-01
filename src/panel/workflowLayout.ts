/**
 * SPEC 8.6 - "Branching workflow renderer: mini-DAG for `steps[].next[]`
 * (prototype rendered linear chains only)."
 *
 * Steps are laid out in rows by longest path from a start step, so every branch of
 * a condition sits on the same row and the flow always reads downwards. Pure and
 * cycle-safe: a malformed workflow must never hang the panel.
 */
import type { WorkflowStep } from '../model/schemas.js';

export type WorkflowLayoutNode = {
  step: WorkflowStep;
  /** Row index, 0 at the trigger. */
  row: number;
  /** Position within the row, left to right. */
  col: number;
};

export type WorkflowLayout = {
  nodes: WorkflowLayoutNode[];
  links: { from: string; to: string }[];
  rowCount: number;
  /** Widest row - drives the column grid. */
  columnCount: number;
};

export function layoutWorkflow(steps: WorkflowStep[]): WorkflowLayout {
  if (steps.length === 0) return { nodes: [], links: [], rowCount: 0, columnCount: 0 };

  const byId = new Map(steps.map((step) => [step.id, step]));
  const incoming = new Map<string, number>(steps.map((step) => [step.id, 0]));
  const links: { from: string; to: string }[] = [];

  for (const step of steps) {
    for (const next of step.next) {
      if (!byId.has(next)) continue;
      links.push({ from: step.id, to: next });
      incoming.set(next, (incoming.get(next) ?? 0) + 1);
    }
  }

  // Kahn's algorithm gives a topological order; row = longest path so branches align.
  const row = new Map<string, number>(steps.map((step) => [step.id, 0]));
  const pending = new Map(incoming);
  const queue = steps.filter((step) => (pending.get(step.id) ?? 0) === 0).map((step) => step.id);
  const settled = new Set<string>();

  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined || settled.has(id)) continue;
    settled.add(id);

    const step = byId.get(id);
    if (!step) continue;
    const here = row.get(id) ?? 0;

    for (const next of step.next) {
      if (!byId.has(next)) continue;
      row.set(next, Math.max(row.get(next) ?? 0, here + 1));
      const left = (pending.get(next) ?? 0) - 1;
      pending.set(next, left);
      if (left === 0) queue.push(next);
    }
  }

  // Any step left over sits in a cycle; park it on a final row rather than dropping it.
  const leftovers = steps.filter((step) => !settled.has(step.id));
  if (leftovers.length > 0) {
    const maxRow = Math.max(0, ...[...row.values()]);
    leftovers.forEach((step, index) => row.set(step.id, maxRow + 1 + index));
  }

  const perRow = new Map<number, number>();
  const nodes: WorkflowLayoutNode[] = steps
    // Keep the author's order inside a row.
    .map((step) => ({ step, row: row.get(step.id) ?? 0, col: 0 }))
    .sort((a, b) => a.row - b.row || steps.indexOf(a.step) - steps.indexOf(b.step))
    .map((node) => {
      const col = perRow.get(node.row) ?? 0;
      perRow.set(node.row, col + 1);
      return { ...node, col };
    });

  return {
    nodes,
    links,
    rowCount: perRow.size,
    columnCount: Math.max(1, ...perRow.values()),
  };
}

/** True when the flow is a single unbranched chain - rendered as the prototype's list. */
export function isLinearWorkflow(layout: WorkflowLayout): boolean {
  return layout.columnCount === 1;
}
