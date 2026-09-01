/** SPEC 8.6 - branching mini-DAG layout for tool workflows. */
import { describe, expect, it } from 'vitest';
import { isLinearWorkflow, layoutWorkflow } from '../../src/panel/workflowLayout.js';
import type { WorkflowStep } from '../../src/model/schemas.js';
import { solarluxFleet } from '../../src/model/seed.js';

const step = (id: string, next: string[], kind: WorkflowStep['kind'] = 'action'): WorkflowStep => ({
  id,
  name: id,
  kind,
  next,
});

describe('layoutWorkflow', () => {
  it('lays a linear chain out one per row', () => {
    const layout = layoutWorkflow([
      step('a', ['b'], 'trigger'),
      step('b', ['c']),
      step('c', []),
    ]);
    expect(layout.nodes.map((n) => [n.step.id, n.row, n.col])).toEqual([
      ['a', 0, 0],
      ['b', 1, 0],
      ['c', 2, 0],
    ]);
    expect(isLinearWorkflow(layout)).toBe(true);
  });

  it('puts both arms of a condition on the same row', () => {
    const layout = layoutWorkflow([
      step('start', ['check'], 'trigger'),
      step('check', ['send', 'escalate'], 'condition'),
      step('send', []),
      step('escalate', []),
    ]);
    const rowOf = (id: string) => layout.nodes.find((n) => n.step.id === id)?.row;
    expect(rowOf('check')).toBe(1);
    expect(rowOf('send')).toBe(2);
    expect(rowOf('escalate')).toBe(2);
    expect(layout.columnCount).toBe(2);
    expect(isLinearWorkflow(layout)).toBe(false);
  });

  it('gives branch arms distinct columns', () => {
    const layout = layoutWorkflow([
      step('start', ['a', 'b'], 'trigger'),
      step('a', []),
      step('b', []),
    ]);
    const cols = layout.nodes.filter((n) => n.row === 1).map((n) => n.col);
    expect(cols.sort()).toEqual([0, 1]);
  });

  it('uses the longest path so a re-joining branch sits below both arms', () => {
    const layout = layoutWorkflow([
      step('start', ['fast', 'slow'], 'trigger'),
      step('fast', ['join']),
      step('slow', ['extra']),
      step('extra', ['join']),
      step('join', []),
    ]);
    const rowOf = (id: string) => layout.nodes.find((n) => n.step.id === id)?.row;
    expect(rowOf('extra')).toBe(2);
    // join must come after `extra`, not merely after `fast`.
    expect(rowOf('join')).toBe(3);
  });

  it('records every link that points at a real step', () => {
    const layout = layoutWorkflow([step('a', ['b', 'ghost'], 'trigger'), step('b', [])]);
    expect(layout.links).toEqual([{ from: 'a', to: 'b' }]);
  });

  it('is cycle-safe and still places every step', () => {
    const layout = layoutWorkflow([
      step('a', ['b'], 'trigger'),
      step('b', ['c']),
      step('c', ['b']),
    ]);
    expect(layout.nodes).toHaveLength(3);
    expect(new Set(layout.nodes.map((n) => n.step.id))).toEqual(new Set(['a', 'b', 'c']));
  });

  it('handles an empty workflow', () => {
    expect(layoutWorkflow([])).toEqual({ nodes: [], links: [], rowCount: 0, columnCount: 0 });
  });

  it('handles disconnected steps', () => {
    const layout = layoutWorkflow([step('a', [], 'trigger'), step('b', [])]);
    expect(layout.nodes.every((n) => n.row === 0)).toBe(true);
    expect(layout.columnCount).toBe(2);
  });

  it('renders the seed fleet workflows as linear chains', () => {
    const fleet = solarluxFleet();
    for (const tool of fleet.tools.filter((t) => t.workflow)) {
      const layout = layoutWorkflow(tool.workflow?.steps ?? []);
      expect(layout.nodes).toHaveLength(tool.workflow?.steps.length ?? 0);
      expect(isLinearWorkflow(layout)).toBe(true);
      expect(layout.nodes[0]?.step.kind).toBe('trigger');
    }
  });
});
