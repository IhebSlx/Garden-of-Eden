/**
 * 3D fleet layout - the prototype's `layout3d()`, made pure and generalised to run
 * over the instance TREE (the prototype walked by agent id, which was only safe
 * because it disabled children under shared agents).
 *
 * Every branch owns a WEDGE of the circle and may never place anything outside it.
 * The root's children tile the full circle; below that, a node's children tile
 * their parent's wedge, each taking a share proportional to how many leaves hang
 * beneath it. Two branches therefore cannot reach into each other however lopsided
 * the tree is.
 *
 * DEVIATION: the fan used to be capped at a fixed `spreadMax` of 1.15 rad no matter
 * how much room the parent actually had. With four departments that was narrower
 * than a department's share of the circle and looked fine; with nine it was nearly
 * twice as wide, so the fans of neighbouring departments interleaved and their
 * spheres and labels overlapped on screen. A wedge is the honest bound, so
 * `spreadMax` is gone.
 *
 * Two things keep it compact rather than sprawling. A fan is drawn only as wide as
 * its members need - `siblingArc` world units apart - and merely *allowed* the rest
 * of the wedge; and a ring moves outward only when the tightest pair on it would
 * otherwise sit closer than one node needs (`departmentArc` on the department ring,
 * `siblingArc` below it). A small fleet lays out exactly where it always did.
 *
 * A fan's width is measured in world units between siblings, not in radians, so a
 * wide fan far from the centre stays as tight as the same fan near it.
 */
import { LAYOUT_3D } from '../ui/constants.js';
import type { Instance } from '../model/selectors.js';

export type Point3 = { x: number; y: number; z: number };

export type Layout3dResult = {
  positions: Map<string, Point3>;
  /** Polar angle per instance, reused when placing its children. */
  angles: Map<string, number>;
  /**
   * The slice of the circle each instance owns, in radians. Its own descendants are
   * laid out inside it and nothing else ever is.
   */
  wedges: Map<string, number>;
};

/** Leaves beneath an instance - how much room its branch has to be given. */
function leafWeights(
  instances: Instance[],
  childrenByParentKey: ReadonlyMap<string, Instance[]>,
): Map<string, number> {
  const weights = new Map<string, number>();
  // Deepest first, so a node's children are always counted before the node is.
  const byDepth = [...instances].sort((a, b) => b.depth - a.depth);
  for (const instance of byDepth) {
    const children = childrenByParentKey.get(instance.key) ?? [];
    let total = 0;
    for (const child of children) total += weights.get(child.key) ?? 1;
    weights.set(instance.key, Math.max(1, total));
  }
  return weights;
}

/**
 * Where each child sits inside its parent's wedge, before the fan is tightened.
 * Shares tile the wedge in order and each child sits at the centre of its share.
 */
function shareOffsets(wedge: number, weights: number[]): { offsets: number[]; shares: number[] } {
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const offsets: number[] = [];
  const shares: number[] = [];
  let cursor = -wedge / 2;
  for (const weight of weights) {
    const share = (wedge * weight) / total;
    shares.push(share);
    offsets.push(cursor + share / 2);
    cursor += share;
  }
  return { offsets, shares };
}

/**
 * The radius at which the tightest pair of neighbours is still `minArc` world units
 * apart. Adjacent shares meet halfway, so the angle between two centres is half of
 * each share.
 */
function radiusForArc(shares: number[], minArc: number, wrap: boolean): number {
  let needed = 0;
  for (let index = 0; index + 1 < shares.length; index += 1) {
    const gap = ((shares[index] ?? 0) + (shares[index + 1] ?? 0)) / 2;
    if (gap > 0) needed = Math.max(needed, minArc / gap);
  }
  // On a closed ring the last neighbour is the first one again.
  if (wrap && shares.length > 1) {
    const gap = ((shares[shares.length - 1] ?? 0) + (shares[0] ?? 0)) / 2;
    if (gap > 0) needed = Math.max(needed, minArc / gap);
  }
  return needed;
}

export function layoutInstances3d(instances: Instance[]): Layout3dResult {
  const positions = new Map<string, Point3>();
  const angles = new Map<string, number>();
  const wedges = new Map<string, number>();
  if (instances.length === 0) return { positions, angles, wedges };

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

  const weights = leafWeights(instances, childrenByParentKey);

  roots.forEach((root, index) => {
    // Several roots would sit on top of each other at the origin, so they share the
    // top ring instead.
    const angle = roots.length === 1 ? Math.PI / 2 : Math.PI / 2 + (index * Math.PI * 2) / roots.length;
    const radius = roots.length === 1 ? 0 : LAYOUT_3D.baseRadius;
    positions.set(root.key, {
      x: Math.cos(angle) * radius,
      y: LAYOUT_3D.rootY,
      z: Math.sin(angle) * radius,
    });
    angles.set(root.key, angle);
    wedges.set(root.key, (Math.PI * 2) / roots.length);
  });

  const byDepth = new Map<number, Instance[]>();
  for (const instance of instances) {
    const bucket = byDepth.get(instance.depth);
    if (bucket) bucket.push(instance);
    else byDepth.set(instance.depth, [instance]);
  }
  const depths = [...byDepth.keys()].filter((depth) => depth > 0).sort((a, b) => a - b);

  // Depth by depth: a ring's radius depends on every fan that lands on it, so the
  // whole level is measured before any of it is placed. One radius per level also
  // keeps a level reading as a level (SPEC §5.4).
  let previousRadius = 0;
  for (const depth of depths) {
    const parents = (byDepth.get(depth - 1) ?? []).filter(
      (parent) => (childrenByParentKey.get(parent.key) ?? []).length > 0,
    );

    // The department ring is a closed circle around a single root; everything below
    // it is a fan hanging off its own parent.
    const isDepartmentRing = depth === 1 && roots.length === 1;
    const minArc = isDepartmentRing ? LAYOUT_3D.departmentArc : LAYOUT_3D.siblingArc;

    let radius = isDepartmentRing ? LAYOUT_3D.baseRadius : previousRadius + LAYOUT_3D.radiusPerDepth;

    for (const parent of parents) {
      const children = childrenByParentKey.get(parent.key) ?? [];
      const { shares } = shareOffsets(
        wedges.get(parent.key) ?? Math.PI * 2,
        children.map((child) => weights.get(child.key) ?? 1),
      );
      radius = Math.max(radius, radiusForArc(shares, minArc, isDepartmentRing));
    }

    for (const parent of parents) {
      const children = childrenByParentKey.get(parent.key) ?? [];
      const parentAngle = angles.get(parent.key) ?? Math.PI / 2;
      const { offsets, shares } = shareOffsets(
        wedges.get(parent.key) ?? Math.PI * 2,
        children.map((child) => weights.get(child.key) ?? 1),
      );

      // Draw the fan only as wide as its members need, and let it keep the wedge it
      // did not use. A closed ring is never tightened - that would leave a gap in
      // the circle instead of filling it.
      const span = (offsets[offsets.length - 1] ?? 0) - (offsets[0] ?? 0);
      const step = Math.min(LAYOUT_3D.siblingArc / radius, LAYOUT_3D.maxSiblingStep);
      const wanted = (children.length - 1) * step;
      const tighten = isDepartmentRing || span <= 0 ? 1 : Math.min(1, wanted / span);

      children.forEach((child, index) => {
        const angle = parentAngle + (offsets[index] ?? 0) * tighten;
        angles.set(child.key, angle);
        wedges.set(child.key, (shares[index] ?? 0) * tighten);
        positions.set(child.key, {
          x: Math.cos(angle) * radius,
          y: LAYOUT_3D.rootY - LAYOUT_3D.yPerDepth * child.depth,
          z: Math.sin(angle) * radius,
        });
      });
    }

    previousRadius = radius;
  }

  return { positions, angles, wedges };
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

/**
 * How far a camera must sit to fit a sphere of `radius` in view.
 *
 * Solved from the lens rather than guessed: half a field of view gives the angle
 * available from the centre line, so the distance putting the sphere's edge on
 * that line is `radius / tan(half)`. `margin` leaves breathing room.
 *
 * BOTH axes are checked. A perspective camera states its field of view
 * vertically; the horizontal one is derived from the aspect ratio, and in a
 * viewport taller than it is wide (a narrow browser, a phone, this app's own side
 * pane) the horizontal view is the narrower of the two. Fitting on the vertical
 * alone let the fleet spill out of the sides.
 */
export function fitDistance(
  radius: number,
  fovDegrees: number,
  margin: number,
  aspect: number,
): number {
  const halfVertical = (fovDegrees * Math.PI) / 360;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * Math.max(aspect, 0.0001));
  return (radius / Math.tan(Math.min(halfVertical, halfHorizontal))) * margin;
}
