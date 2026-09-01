/** SPEC 5.4/5.5 3D layout, pinned against the prototype's `layout3d()` numbers. */
import { describe, expect, it } from 'vitest';
import { boundingSphere, layoutInstances3d } from '../../src/layout/layout3d.js';
import { instances } from '../../src/model/selectors.js';
import { LAYOUT_3D } from '../../src/ui/constants.js';
import { solarluxFleet } from '../../src/model/seed.js';
import { AGENT, makeFleet } from '../fixtures/fleets.js';

describe('layoutInstances3d', () => {
  it('places every instance exactly once', () => {
    const list = instances(solarluxFleet());
    const { positions } = layoutInstances3d(list);
    expect(positions.size).toBe(list.length);
    for (const instance of list) expect(positions.has(instance.key)).toBe(true);
  });

  it('puts the single root at the top of the scene', () => {
    const list = instances(solarluxFleet());
    const { positions } = layoutInstances3d(list);
    const root = list.find((i) => i.parentKey === null);
    expect(positions.get(root?.key ?? '')).toEqual({ x: 0, y: LAYOUT_3D.rootY, z: 0 });
  });

  it('drops one level of height per depth', () => {
    const list = instances(solarluxFleet());
    const { positions } = layoutInstances3d(list);
    for (const instance of list) {
      expect(positions.get(instance.key)?.y).toBe(LAYOUT_3D.rootY - LAYOUT_3D.yPerDepth * instance.depth);
    }
  });

  it('fans departments around the orchestrator at the base radius', () => {
    const list = instances(solarluxFleet());
    const { positions } = layoutInstances3d(list);
    const departments = list.filter((i) => i.depth === 1);
    expect(departments).toHaveLength(4);
    for (const department of departments) {
      const point = positions.get(department.key);
      expect(Math.hypot(point?.x ?? 0, point?.z ?? 0)).toBeCloseTo(LAYOUT_3D.baseRadius, 6);
    }
  });

  it('spreads deeper children within their parent arc and staggers odd siblings outwards', () => {
    const list = instances(solarluxFleet());
    const { positions } = layoutInstances3d(list);
    const deep = list.filter((i) => i.depth === 2);
    const radii = deep.map((i) => {
      const point = positions.get(i.key);
      return Math.round(Math.hypot(point?.x ?? 0, point?.z ?? 0));
    });
    const inner = LAYOUT_3D.baseRadius + LAYOUT_3D.radiusPerDepth;
    expect(new Set(radii)).toEqual(new Set([inner, inner + LAYOUT_3D.radiusStagger]));
  });

  it('gives each copy of a shared agent its own point in space', () => {
    const list = instances(solarluxFleet());
    const { positions } = layoutInstances3d(list);
    const copies = list.filter((i) => i.agentId === 'agt_ppt');
    expect(copies).toHaveLength(3);
    const keys = copies.map((c) => JSON.stringify(positions.get(c.key)));
    expect(new Set(keys).size).toBe(3);
  });

  it('is deterministic', () => {
    const list = instances(makeFleet());
    expect(layoutInstances3d(list).positions).toEqual(layoutInstances3d(list).positions);
  });

  it('handles an empty fleet', () => {
    expect(layoutInstances3d([]).positions.size).toBe(0);
  });
});

describe('boundingSphere (focus camera, SPEC 5.2)', () => {
  it('centres on the given instances and measures the furthest one', () => {
    const positions = new Map([
      ['a', { x: -10, y: 0, z: 0 }],
      ['b', { x: 10, y: 0, z: 0 }],
    ]);
    const sphere = boundingSphere(['a', 'b'], positions);
    expect(sphere?.centre).toEqual({ x: 0, y: 0, z: 0 });
    expect(sphere?.radius).toBe(10);
  });

  it('shrinks as the focused subtree shrinks, so focusing zooms in', () => {
    const fleet = solarluxFleet();
    const list = instances(fleet);
    const { positions } = layoutInstances3d(list);

    const whole = boundingSphere(
      list.map((i) => i.key),
      positions,
    );
    const branch = boundingSphere(
      list.filter((i) => i.agentId === 'agt_w1' || i.agentId === 'agt_mkt').map((i) => i.key),
      positions,
    );
    expect(branch?.radius ?? 0).toBeLessThan(whole?.radius ?? 0);
  });

  it('returns null when nothing is focused', () => {
    expect(boundingSphere([], new Map())).toBeNull();
  });

  it('ignores keys with no position', () => {
    const positions = new Map([[AGENT.sales, { x: 1, y: 2, z: 3 }]]);
    expect(boundingSphere([AGENT.sales, 'missing'], positions)?.centre).toEqual({ x: 1, y: 2, z: 3 });
  });
});
