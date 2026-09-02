/** SPEC 5.4/5.5 3D layout, pinned against the prototype's `layout3d()` numbers. */
import { describe, expect, it } from 'vitest';
import type { Instance } from '../../src/model/selectors.js';
import { boundingSphere, fitDistance, layoutInstances3d } from '../../src/layout/layout3d.js';
import { instances } from '../../src/model/selectors.js';
import { CAMERA_FOV_3D, FOCUS_CAMERA_3D, LAYOUT_3D } from '../../src/ui/constants.js';
import { solarluxFleet } from '../../src/model/seed.js';
import { solarluxVisionFleet } from '../../src/model/visionFleet.js';
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

  it('puts every node of a level on one ring, at one height', () => {
    // DEVIATION: odd siblings used to be pushed 26 units further out, which reads
    // as an up-and-down jumble in perspective even at identical height.
    const list = instances(solarluxFleet());
    const { positions } = layoutInstances3d(list);
    const deep = list.filter((i) => i.depth === 2);
    const radii = new Set(deep.map((i) => {
      const point = positions.get(i.key);
      return Math.round(Math.hypot(point?.x ?? 0, point?.z ?? 0));
    }));
    expect(radii).toEqual(new Set([LAYOUT_3D.baseRadius + LAYOUT_3D.radiusPerDepth]));

    const heights = new Set(deep.map((i) => positions.get(i.key)?.y));
    expect(heights.size).toBe(1);
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

describe('a fan is measured in world units, not radians', () => {
  /** A parent at `depth` with `count` children, as a bare instance list. */
  const fan = (depth: number, count: number): Instance[] => {
    const chain: Instance[] = [];
    for (let level = 0; level <= depth; level += 1) {
      chain.push({
        key: level === 0 ? 'p0' : `p${level}`,
        agentId: `a${level}`,
        parentId: level === 0 ? null : `a${level - 1}`,
        parentKey: level === 0 ? null : `p${level - 1}`,
        pairKey: `pair${level}`,
        depth: level,
        path: Array.from({ length: level + 1 }, (_, i) => `a${i}`),
      });
    }
    const children: Instance[] = Array.from({ length: count }, (_, index) => ({
      key: `c${index}`,
      agentId: `c${index}`,
      parentId: `a${depth}`,
      parentKey: `p${depth}`,
      pairKey: `pairc${index}`,
      depth: depth + 1,
      path: [...Array.from({ length: depth + 1 }, (_, i) => `a${i}`), `c${index}`],
    }));
    return [...chain, ...children];
  };

  /** Straight-line distance between the first and last child of a fan. */
  const fanWidth = (depth: number, count: number): number => {
    const { positions } = layoutInstances3d(fan(depth, count));
    const first = positions.get('c0');
    const last = positions.get(`c${count - 1}`);
    if (!first || !last) throw new Error('missing child');
    return Math.hypot(last.x - first.x, last.z - first.z);
  };

  it('keeps the same fan roughly as wide when it sits further out', () => {
    // The old rule spaced by angle, so this fan grew with every level it dropped.
    const near = fanWidth(1, 4);
    const far = fanWidth(3, 4);
    expect(far).toBeLessThan(near * 1.35);
  });

  it('spaces siblings by about siblingArc on a wide ring', () => {
    const { positions } = layoutInstances3d(fan(3, 4));
    const points = [0, 1, 2, 3].map((i) => positions.get(`c${i}`));
    // Neighbours on the same ring (skip the staggered ones) sit ~siblingArc apart.
    const a = points[0];
    const c = points[2];
    if (!a || !c) throw new Error('missing');
    const gap = Math.hypot(c.x - a.x, c.z - a.z) / 2;
    expect(gap).toBeGreaterThan(LAYOUT_3D.siblingArc * 0.6);
    expect(gap).toBeLessThan(LAYOUT_3D.siblingArc * 1.6);
  });

  it('never lets one fan exceed the hard cap', () => {
    const { positions, angles } = layoutInstances3d(fan(1, 40));
    expect(positions.size).toBeGreaterThan(0);
    const spread = Math.max(...[...Array(40).keys()].map((i) => angles.get(`c${i}`) ?? 0)) -
      Math.min(...[...Array(40).keys()].map((i) => angles.get(`c${i}`) ?? 0));
    expect(spread).toBeLessThanOrEqual(LAYOUT_3D.spreadMax + 1e-9);
  });

  it('puts a lone child straight out from its parent', () => {
    const { angles } = layoutInstances3d(fan(1, 1));
    expect(angles.get('c0')).toBeCloseTo(angles.get('p1') ?? 0, 10);
  });

  it('holds the department ring where it was — that level never sprawled', () => {
    const { positions } = layoutInstances3d(fan(0, 3));
    for (const key of ['c0', 'c1', 'c2']) {
      const point = positions.get(key);
      expect(Math.hypot(point?.x ?? 0, point?.z ?? 0)).toBeCloseTo(LAYOUT_3D.baseRadius, 6);
    }
  });
});

describe('fitDistance', () => {
  it('puts the sphere edge exactly on the view edge at margin 1', () => {
    // A sphere of radius R at distance R/tan(fov/2) subtends exactly the fov.
    const radius = 100;
    const distance = fitDistance(radius, 55, 1, 1.6);
    const halfHeightAtDistance = distance * Math.tan((55 * Math.PI) / 360);
    expect(halfHeightAtDistance).toBeCloseTo(radius, 6);
  });

  it('scales linearly with the sphere, so a bigger fleet is never cropped', () => {
    expect(fitDistance(200, 55, 1.2, 1.6)).toBeCloseTo(fitDistance(100, 55, 1.2, 1.6) * 2, 6);
  });

  it('needs less distance the wider the lens', () => {
    expect(fitDistance(100, 80, 1, 1.6)).toBeLessThan(fitDistance(100, 40, 1, 1.6));
  });

  it('applies the margin as breathing room', () => {
    expect(fitDistance(100, 55, 1.18, 1.6)).toBeCloseTo(fitDistance(100, 55, 1, 1.6) * 1.18, 6);
  });

  it('frames the whole vision fleet inside the orbit limit', () => {
    // The old rule capped at 340, which cropped this fleet; the fit must fit.
    const { positions } = layoutInstances3d(instances(solarluxVisionFleet()));
    const sphere = boundingSphere(positions.keys(), positions);
    if (!sphere) throw new Error('no sphere');

    const distance = fitDistance(sphere.radius, CAMERA_FOV_3D, FOCUS_CAMERA_3D.margin, 1.6);
    expect(distance).toBeGreaterThan(sphere.radius);
    expect(distance).toBeLessThanOrEqual(FOCUS_CAMERA_3D.max);
    // Everything really is inside the frustum at that distance.
    expect(distance * Math.tan((CAMERA_FOV_3D * Math.PI) / 360)).toBeGreaterThan(sphere.radius);
  });
});

describe('fitDistance in a portrait viewport', () => {
  it('backs off further when the viewport is taller than it is wide', () => {
    // The horizontal field of view is the narrower one below aspect 1, which is
    // what let the fleet spill out of the sides of a tall pane.
    const landscape = fitDistance(100, 55, 1, 1.6);
    const portrait = fitDistance(100, 55, 1, 0.75);
    expect(portrait).toBeGreaterThan(landscape);
  });

  it('is governed by the vertical field of view once the viewport is wider than tall', () => {
    const square = fitDistance(100, 55, 1, 1);
    const wide = fitDistance(100, 55, 1, 2.5);
    expect(wide).toBeCloseTo(square, 6);
  });

  it('fits the sphere on the narrow axis, whichever that is', () => {
    for (const aspect of [0.5, 0.8, 1, 1.4, 2]) {
      const distance = fitDistance(120, 55, 1, aspect);
      const halfVertical = (55 * Math.PI) / 360;
      const halfHeight = distance * Math.tan(halfVertical);
      const halfWidth = halfHeight * aspect;
      expect(Math.min(halfHeight, halfWidth)).toBeCloseTo(120, 6);
    }
  });

  it('survives a zero-height viewport rather than dividing by nothing', () => {
    expect(Number.isFinite(fitDistance(100, 55, 1, 0))).toBe(true);
  });
});
