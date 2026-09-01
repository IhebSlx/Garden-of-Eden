/**
 * SPEC 9 Phase 3: "100+ agents at 60 fps target: instanced meshes, memoized
 * selectors."
 *
 * A 60 fps frame is 16.6 ms for EVERYTHING, so the derived layer has to be a small
 * fraction of that. These budgets are deliberately loose (CI machines are slow and
 * shared) - they exist to catch an accidental O(n²), not to benchmark hardware.
 */
import { describe, expect, it } from 'vitest';
import { buildFleetIndex, instances, isShared, visibleSet } from '../../src/model/selectors.js';
import { deriveWires } from '../../src/model/wires.js';
import { computeVisibility } from '../../src/model/visibility.js';
import { layoutInstances } from '../../src/layout/treeLayout.js';
import { layoutInstances3d } from '../../src/layout/layout3d.js';
import { checkFleetIntegrity } from '../../src/model/integrity.js';
import { buildSearchIndex, searchFleet } from '../../src/search/index.js';
import { makeLargeFleet } from '../fixtures/largeFleet.js';

const fleet = makeLargeFleet();

function millis(run: () => void, iterations = 20): number {
  // Warm up, so the first-call JIT cost is not what gets measured.
  run();
  const started = performance.now();
  for (let i = 0; i < iterations; i += 1) run();
  return (performance.now() - started) / iterations;
}

describe('large fleet shape', () => {
  it('is over the 100-agent target and has more instances than agents', () => {
    expect(fleet.agents.length).toBeGreaterThan(100);
    const list = instances(fleet);
    // 6 shared agents under 3 parents each add 12 extra copies.
    expect(list.length).toBe(fleet.agents.length + 12);
  });

  it('is valid, so the numbers below are measured on a realistic fleet', () => {
    expect(checkFleetIntegrity(fleet)).toEqual([]);
  });
});

describe('derived layer stays well inside a frame budget', () => {
  it('builds the instance list quickly', () => {
    expect(millis(() => void instances(fleet))).toBeLessThan(8);
  });

  it('derives wires quickly', () => {
    const list = instances(fleet);
    expect(millis(() => void deriveWires(fleet, list))).toBeLessThan(8);
  });

  it('lays out 2D and 3D quickly', () => {
    const list = instances(fleet);
    expect(millis(() => void layoutInstances(list))).toBeLessThan(8);
    expect(millis(() => void layoutInstances3d(list))).toBeLessThan(8);
  });

  it('recomputes visibility on every focus change quickly', () => {
    const list = instances(fleet);
    const wires = deriveWires(fleet, list);
    expect(millis(() => void computeVisibility(fleet, list, wires, 'agt_dep_3', null))).toBeLessThan(8);
  });

  it('runs the whole board projection inside one frame', () => {
    // What `useBoardModel` does on a focus change, end to end.
    const budget = millis(() => {
      const index = buildFleetIndex(fleet);
      const list = instances(fleet, index);
      const wires = deriveWires(fleet, list);
      layoutInstances(list);
      computeVisibility(fleet, list, wires, 'agt_dep_2', null);
    }, 10);
    expect(budget).toBeLessThan(16);
  });
});

describe('no accidental quadratic behaviour', () => {
  it('scales roughly linearly with agent count', () => {
    const small = makeLargeFleet({ departments: 4, workersPerDepartment: 6 });
    const large = makeLargeFleet({ departments: 16, workersPerDepartment: 6 });
    expect(large.agents.length / small.agents.length).toBeGreaterThan(3);

    const project = (target: typeof fleet) => () => {
      const index = buildFleetIndex(target);
      const list = instances(target, index);
      deriveWires(target, list);
      layoutInstances(list);
    };

    const smallTime = Math.max(millis(project(small), 30), 0.01);
    const largeTime = millis(project(large), 30);

    // Linear would be ~4x. Allow generous headroom; quadratic would be ~16x+.
    expect(largeTime / smallTime).toBeLessThan(11);
  });

  it('reuses one index across selectors instead of rebuilding per call', () => {
    const index = buildFleetIndex(fleet);
    const shared = millis(() => {
      for (const agent of fleet.agents) isShared(fleet, agent.id, index);
    }, 5);
    expect(shared).toBeLessThan(16);
  });

  it('keeps focus lookups cheap for every agent', () => {
    const index = buildFleetIndex(fleet);
    expect(
      millis(() => {
        for (const agent of fleet.agents) visibleSet(fleet, agent.id, index);
      }, 5),
    ).toBeLessThan(60);
  });
});

describe('search on a large fleet', () => {
  it('builds its index once and answers quickly', () => {
    expect(millis(() => void buildSearchIndex(fleet), 5)).toBeLessThan(80);
    const index = buildSearchIndex(fleet);
    expect(millis(() => void searchFleet(index, 'worker'), 20)).toBeLessThan(40);
  });
});
