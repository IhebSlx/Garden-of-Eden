/**
 * 3D fleet layout - the prototype's `layout3d()`, made pure and generalised to run
 * over the instance TREE (the prototype walked by agent id, which was only safe
 * because it disabled children under shared agents).
 *
 * Departments fan out around the orchestrator; deeper levels spread within their
 * parent's arc and drop a level each time, with odd siblings pushed further out so
 * dense branches do not overlap. Constants are SPEC 6 normative.
 */
import { LAYOUT_3D } from '../ui/constants.js';
import type { Instance } from '../model/selectors.js';

export type Point3 = { x: number; y: number; z: number };

export type Layout3dResult = {
  positions: Map<string, Point3>;
  /** Polar angle per instance, reused when placing its children. */
  angles: Map<string, number>;
};

export function layoutInstances3d(instances: Instance[]): Layout3dResult {
  const positions = new Map<string, Point3>();
  const angles = new Map<string, number>();
  if (instances.length === 0) return { positions, angles };

  const childrenByParentKey = new Map<string, Instance[]>();
  const roots: Instance[] = [];
  for (const instance of instances) {
    if (instance.parentKey === null) {
      roots.push(instance);
      continue;
    }
    const siblings = childrenByParentKey.get(instance.parentKey);
    if (siblings) siblings.push(instance);
    else childrenByParentKey.set(instance.parentKey, [instance]);
  }

  const queue: Instance[] = [];

  roots.forEach((root, index) => {
    // Several roots would sit on top of each other at the origin, so they share
    // the top ring instead.
    const angle = roots.length === 1 ? Math.PI / 2 : Math.PI / 2 + (index * Math.PI * 2) / roots.length;
    const radius = roots.length === 1 ? 0 : LAYOUT_3D.baseRadius;
    positions.set(root.key, {
      x: Math.cos(angle) * radius,
      y: LAYOUT_3D.rootY,
      z: Math.sin(angle) * radius,
    });
    angles.set(root.key, angle);
    queue.push(root);
  });

  while (queue.length > 0) {
    const parent = queue.shift();
    if (parent === undefined) continue;

    const children = childrenByParentKey.get(parent.key) ?? [];
    const count = children.length;
    const parentAngle = angles.get(parent.key) ?? Math.PI / 2;

    children.forEach((child, index) => {
      let angle: number;
      let radius: number;

      if (parent.depth === 0) {
        // Departments take the full circle around the orchestrator.
        angle = Math.PI / 4 + (index * Math.PI * 2) / count;
        radius = LAYOUT_3D.baseRadius;
      } else {
        const spread = Math.min(count * LAYOUT_3D.spreadPerChild, LAYOUT_3D.spreadMax);
        angle = parentAngle + (count === 1 ? 0 : (index / (count - 1) - 0.5) * spread);
        radius =
          LAYOUT_3D.baseRadius +
          LAYOUT_3D.radiusPerDepth * parent.depth +
          (index % 2) * LAYOUT_3D.radiusStagger;
      }

      angles.set(child.key, angle);
      positions.set(child.key, {
        x: Math.cos(angle) * radius,
        y: LAYOUT_3D.rootY - LAYOUT_3D.yPerDepth * child.depth,
        z: Math.sin(angle) * radius,
      });
      queue.push(child);
    });
  }

  return { positions, angles };
}

/** Centre and radius of a set of instances, for the focus camera (SPEC 5.2). */
export function boundingSphere(
  keys: Iterable<string>,
  positions: ReadonlyMap<string, Point3>,
): { centre: Point3; radius: number } | null {
  const points: Point3[] = [];
  for (const key of keys) {
    const point = positions.get(key);
    if (point) points.push(point);
  }
  if (points.length === 0) return null;

  const centre = points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y, z: sum.z + point.z }),
    { x: 0, y: 0, z: 0 },
  );
  centre.x /= points.length;
  centre.y /= points.length;
  centre.z /= points.length;

  let radius = 0;
  for (const point of points) {
    const distance = Math.hypot(point.x - centre.x, point.y - centre.y, point.z - centre.z);
    radius = Math.max(radius, distance);
  }

  return { centre, radius };
}
