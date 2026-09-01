/**
 * 2D board layout - SPEC 5.8: "same-depth alignment, cluster gaps, staggered
 * sub-agent rows", reproducing `layout2d()` in `reference/prototype.html` with its
 * tuned constants (SPEC 6, normative).
 *
 * DEVIATION from SPEC 3 (elkjs): the layout runs over INSTANCES, and instances form
 * a tree by construction - every instance has exactly one parent instance, even when
 * the underlying agent has several parents. elkjs is pinned in the stack for
 * "DAG auto-layout, multi-parent aware", a capability this input can never need. A
 * tree walk reproduces the prototype's tuned geometry exactly, stays synchronous
 * (elkjs is async/worker-based) and is directly unit-testable against the prototype's
 * numbers. Rationale recorded here and in the milestone report.
 *
 * Coordinates are CARD CENTRES, like the prototype. The board converts to
 * top-left when handing nodes to React Flow.
 */
import { LAYOUT, hierarchyScale } from '../ui/constants.js';
import type { Instance } from '../model/selectors.js';
import type { Position } from '../model/schemas.js';

export type LayoutResult = {
  /** Instance key -> centre position. */
  positions: Map<string, Position>;
  /** Board extent, used by fit, the minimap and the scroll area. */
  width: number;
  height: number;
};

/**
 * Distance from the top of the board to the centre of a row.
 *
 * Row spacing follows the same hierarchy scale as the cards themselves
 * (HIERARCHY_SCALE_STEP): a level whose cards are 50% larger needs 50% more room
 * beneath it, otherwise the biggest card at the top of the tree overlaps the row
 * below. Depth 1 is the anchor, so a fleet of same-size cards keeps exactly the
 * prototype's 185px rows.
 */
export function rowOffset(depth: number): number {
  let offset = 0;
  for (let level = 0; level < depth; level += 1) offset += LAYOUT.rowHeight * hierarchyScale(level);
  return offset;
}

/**
 * @param instances pre-order instance list from `instances(fleet)`
 * @param manual    agentId -> manual centre override (SPEC 4 `Agent.position`)
 */
export function layoutInstances(
  instances: Instance[],
  manual: ReadonlyMap<string, Position> = new Map(),
): LayoutResult {
  const positions = new Map<string, Position>();
  if (instances.length === 0) {
    return { positions, width: LAYOUT.boardMinWidth, height: LAYOUT.top + LAYOUT.boardPaddingY };
  }

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

  let slot = 0;

  /**
   * Post-order placement: leaves consume slots left to right, a parent centres
   * itself over its children. `childIndex` drives the odd/even row stagger.
   */
  const place = (instance: Instance, childIndex: number): void => {
    const children = childrenByParentKey.get(instance.key) ?? [];

    let x: number;
    if (children.length === 0) {
      x = (slot + 0.5) * LAYOUT.slotWidth;
      slot += 1;
    } else {
      children.forEach((child, index) => {
        // Cluster gap goes in front of every child but the first, and is wider
        // directly under the root so departments read as separate columns.
        if (index > 0) {
          slot += instance.depth === 0 ? LAYOUT.clusterGapRoot : LAYOUT.clusterGap;
        }
        place(child, index);
      });
      const sum = children.reduce((total, child) => total + (positions.get(child.key)?.x ?? 0), 0);
      x = sum / children.length;
    }

    const stagger =
      instance.depth >= LAYOUT.staggerFromDepth ? (childIndex % 2) * LAYOUT.stagger : 0;

    positions.set(instance.key, {
      x,
      y: LAYOUT.top + rowOffset(instance.depth) + stagger,
    });
  };

  roots.forEach((root, index) => {
    if (index > 0) slot += LAYOUT.clusterGapRoot;
    place(root, index);
  });

  // A manual position moves the agent's single instance. Agents with several
  // instances (shared agents) are always auto-placed - see the board's drag guard.
  const instancesByAgent = new Map<string, number>();
  for (const instance of instances) {
    instancesByAgent.set(instance.agentId, (instancesByAgent.get(instance.agentId) ?? 0) + 1);
  }
  for (const instance of instances) {
    const override = manual.get(instance.agentId);
    if (override && instancesByAgent.get(instance.agentId) === 1) {
      positions.set(instance.key, override);
    }
  }

  const maxDepth = instances.reduce((max, instance) => Math.max(max, instance.depth), 0);
  const autoWidth = slot * LAYOUT.slotWidth + LAYOUT.boardPaddingX;

  // Manual drags may push a card past the auto extent; the board must still contain it.
  let widest = autoWidth;
  let tallest = LAYOUT.top + rowOffset(maxDepth) + LAYOUT.boardPaddingY;
  for (const point of positions.values()) {
    widest = Math.max(widest, point.x + LAYOUT.slotWidth);
    tallest = Math.max(tallest, point.y + LAYOUT.boardPaddingY);
  }

  return {
    positions,
    width: Math.max(widest, LAYOUT.boardMinWidth),
    height: tallest,
  };
}

/** Bounding box of a set of cards, padded per card like the prototype's `frame2d`. */
export function boundsOf(
  keys: Iterable<string>,
  positions: ReadonlyMap<string, Position>,
  sizeOf: (key: string) => { width: number; height: number },
  pad: number,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  for (const key of keys) {
    const point = positions.get(key);
    if (!point) continue;
    found = true;
    const { width, height } = sizeOf(key);
    const halfW = width / 2 + pad;
    const halfH = height / 2 + pad;
    minX = Math.min(minX, point.x - halfW);
    maxX = Math.max(maxX, point.x + halfW);
    minY = Math.min(minY, point.y - halfH);
    maxY = Math.max(maxY, point.y + halfH);
  }

  return found ? { minX, minY, maxX, maxY } : null;
}
