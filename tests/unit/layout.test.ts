/**
 * SPEC 5.8 layout + SPEC 5.2/5.4 viewport maths, pinned against the tuned numbers
 * in reference/prototype.html (SPEC 6: those constants are normative).
 */
import { describe, expect, it } from 'vitest';
import { boundsOf, layoutInstances, rowOffset } from '../../src/layout/treeLayout.js';
import {
  centerOn,
  fitViewport,
  frameViewport,
  screenToBoard,
  visibleBoardRect,
  zoomAt,
} from '../../src/layout/viewport.js';
import {
  CARD_SIZE,
  HIERARCHY_ANCHOR_DEPTH,
  HIERARCHY_SCALE_STEP,
  LABEL_SCALE_3D,
  LAYOUT,
  NODE_SIZE_3D,
  ZOOM,
  cardSize,
  hierarchyScale,
} from '../../src/ui/constants.js';
import { instances } from '../../src/model/selectors.js';
import { solarluxFleet } from '../../src/model/seed.js';
import { AGENT, makeFleet } from '../fixtures/fleets.js';

const layoutFor = (fleet: Parameters<typeof instances>[0]) => {
  const list = instances(fleet);
  return { list, result: layoutInstances(list) };
};

describe('layoutInstances', () => {
  it('puts the root row at the prototype top and spaces depths by the scaled rowHeight', () => {
    const { list, result } = layoutFor(makeFleet());
    const byKey = (agentId: string) => list.find((i) => i.agentId === agentId)?.key ?? '';

    expect(result.positions.get(byKey(AGENT.orchestrator))?.y).toBe(LAYOUT.top);
    // DEVIATION: rows are spaced by rowHeight x hierarchyScale, not a flat rowHeight,
    // so the 50%-larger depth-0 card cannot overlap the row beneath it.
    expect(result.positions.get(byKey(AGENT.sales))?.y).toBe(LAYOUT.top + rowOffset(1));
    expect(rowOffset(1)).toBe(LAYOUT.rowHeight * HIERARCHY_SCALE_STEP);
    // Below the anchor the prototype's own 185px spacing is untouched.
    expect(rowOffset(2) - rowOffset(1)).toBe(LAYOUT.rowHeight);
    expect(LAYOUT.top).toBe(120);
    expect(LAYOUT.rowHeight).toBe(185);
    expect(LAYOUT.slotWidth).toBe(170);
  });

  it('places every instance exactly once', () => {
    const { list, result } = layoutFor(solarluxFleet());
    expect(result.positions.size).toBe(list.length);
    for (const instance of list) expect(result.positions.has(instance.key)).toBe(true);
  });

  it('centres a parent over its children', () => {
    const { list, result } = layoutFor(makeFleet());
    const sales = list.find((i) => i.agentId === AGENT.sales);
    const children = list.filter((i) => i.parentKey === sales?.key);
    expect(children.length).toBeGreaterThan(1);

    const mean =
      children.reduce((sum, child) => sum + (result.positions.get(child.key)?.x ?? 0), 0) / children.length;
    expect(result.positions.get(sales?.key ?? '')?.x).toBeCloseTo(mean, 6);
  });

  it('puts every card of a level on exactly one line', () => {
    // DEVIATION: the prototype dropped odd siblings by 36px. A level reads as a
    // level only when its members share a row, so the stagger is gone.
    const { list, result } = layoutFor(solarluxFleet());
    const rowsByDepth = new Map<number, Set<number>>();
    for (const instance of list) {
      const y = result.positions.get(instance.key)?.y ?? 0;
      const rows = rowsByDepth.get(instance.depth) ?? new Set<number>();
      rows.add(y);
      rowsByDepth.set(instance.depth, rows);
    }

    expect(rowsByDepth.size).toBeGreaterThan(2);
    for (const [depth, rows] of rowsByDepth) {
      expect(rows).toEqual(new Set([LAYOUT.top + rowOffset(depth)]));
    }
  });

  it('separates the levels themselves, so one line per depth is unambiguous', () => {
    const { list, result } = layoutFor(solarluxFleet());
    const ys = [...new Set(list.map((i) => result.positions.get(i.key)?.y ?? 0))].sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i += 1) {
      expect((ys[i] ?? 0) - (ys[i - 1] ?? 0)).toBeGreaterThan(100);
    }
  });

  it('gives each copy of a shared agent its own position', () => {
    const { list, result } = layoutFor(solarluxFleet());
    const copies = list.filter((i) => i.agentId === 'agt_ppt');
    expect(copies).toHaveLength(3);
    const xs = copies.map((c) => result.positions.get(c.key)?.x);
    expect(new Set(xs).size).toBe(3);
  });

  it('never overlaps two leaves horizontally', () => {
    const { list, result } = layoutFor(solarluxFleet());
    const leaves = list.filter((i) => !list.some((other) => other.parentKey === i.key));
    const xs = leaves.map((l) => result.positions.get(l.key)?.x ?? 0).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i += 1) {
      expect((xs[i] ?? 0) - (xs[i - 1] ?? 0)).toBeGreaterThanOrEqual(LAYOUT.slotWidth - 0.001);
    }
  });

  it('honours a manual position for a single-instance agent', () => {
    const list = instances(makeFleet());
    const manual = new Map([[AGENT.leads, { x: 999, y: 42 }]]);
    const result = layoutInstances(list, manual);
    const leads = list.find((i) => i.agentId === AGENT.leads);
    expect(result.positions.get(leads?.key ?? '')).toEqual({ x: 999, y: 42 });
  });

  it('ignores a manual position on a shared agent - one field cannot place N copies', () => {
    const list = instances(makeFleet());
    const manual = new Map([[AGENT.quotes, { x: 999, y: 42 }]]);
    const result = layoutInstances(list, manual);
    const copies = list.filter((i) => i.agentId === AGENT.quotes);
    for (const copy of copies) {
      expect(result.positions.get(copy.key)).not.toEqual({ x: 999, y: 42 });
    }
  });

  it('reports a board at least as large as the prototype minimum', () => {
    const { result } = layoutFor(solarluxFleet());
    expect(result.width).toBeGreaterThanOrEqual(LAYOUT.boardMinWidth);
    expect(result.height).toBeGreaterThan(LAYOUT.top);
  });

  it('grows the board to contain a manually dragged card', () => {
    const list = instances(makeFleet());
    const result = layoutInstances(list, new Map([[AGENT.leads, { x: 5000, y: 4000 }]]));
    expect(result.width).toBeGreaterThan(5000);
    expect(result.height).toBeGreaterThan(4000);
  });

  it('is deterministic', () => {
    const list = instances(solarluxFleet());
    expect(layoutInstances(list).positions).toEqual(layoutInstances(list).positions);
  });

  it('handles an empty fleet', () => {
    const result = layoutInstances([]);
    expect(result.positions.size).toBe(0);
    expect(result.width).toBe(LAYOUT.boardMinWidth);
  });
});

describe('boundsOf', () => {
  it('pads each card by half its size plus the frame padding', () => {
    const positions = new Map([['a', { x: 100, y: 100 }]]);
    const bounds = boundsOf(['a'], positions, () => ({ width: 200, height: 100 }), 30);
    expect(bounds).toEqual({ minX: -30, maxX: 230, minY: 20, maxY: 180 });
  });

  it('returns null when nothing is in the set', () => {
    expect(boundsOf([], new Map(), () => cardSize(0), 30)).toBeNull();
  });
});

describe('fitViewport', () => {
  it('matches the prototype formula', () => {
    const board = { width: 2000, height: 1000 };
    const screen = { width: 1400, height: 900 };
    const zoom = Math.min((1400 - 40) / 2000, (900 - 160) / 1000, ZOOM.fitMax);
    const viewport = fitViewport(board, screen);

    expect(viewport.zoom).toBeCloseTo(zoom, 10);
    expect(viewport.x).toBeCloseTo((1400 - 2000 * zoom) / 2, 10);
    expect(viewport.y).toBeCloseTo((900 - 1000 * zoom) / 2 + 14, 10);
  });

  it('never zooms in past 110%', () => {
    expect(fitViewport({ width: 100, height: 100 }, { width: 1600, height: 1000 }).zoom).toBe(ZOOM.fitMax);
  });

  it('stays within the zoom limits for an enormous board', () => {
    const viewport = fitViewport({ width: 500_000, height: 500_000 }, { width: 1400, height: 900 });
    expect(viewport.zoom).toBeGreaterThanOrEqual(ZOOM.min);
  });
});

describe('frameViewport (SPEC 5.2 zoom-to-fit)', () => {
  it('really zooms rather than only centring', () => {
    const screen = { width: 1400, height: 900 };
    const whole = frameViewport({ minX: 0, minY: 0, maxX: 4000, maxY: 2000 }, screen);
    const subtree = frameViewport({ minX: 0, minY: 0, maxX: 800, maxY: 400 }, screen);
    expect(subtree.zoom).toBeGreaterThan(whole.zoom);
  });

  it('centres the bbox on screen', () => {
    const screen = { width: 1400, height: 900 };
    const bounds = { minX: 200, minY: 100, maxX: 1000, maxY: 500 };
    const viewport = frameViewport(bounds, screen);

    const centreX = ((bounds.minX + bounds.maxX) / 2) * viewport.zoom + viewport.x;
    const centreY = ((bounds.minY + bounds.maxY) / 2) * viewport.zoom + viewport.y;
    expect(centreX).toBeCloseTo(screen.width / 2, 6);
    expect(centreY).toBeCloseTo(screen.height / 2 + 10, 6);
  });

  it('caps at the frame maximum so a single card does not fill the screen', () => {
    expect(
      frameViewport({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, { width: 1400, height: 900 }).zoom,
    ).toBe(ZOOM.frameMax);
  });

  it('survives a degenerate bbox', () => {
    const viewport = frameViewport({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, { width: 800, height: 600 });
    expect(Number.isFinite(viewport.x)).toBe(true);
    expect(Number.isFinite(viewport.zoom)).toBe(true);
  });
});

describe('zoomAt', () => {
  it('keeps the point under the cursor fixed', () => {
    const before = { x: 120, y: -40, zoom: 0.8 };
    const cursor = { x: 500, y: 300 };
    const anchor = screenToBoard(before, cursor.x, cursor.y);

    const after = zoomAt(before, cursor.x, cursor.y, ZOOM.wheelIn);
    const anchorAfter = screenToBoard(after, cursor.x, cursor.y);

    expect(anchorAfter.x).toBeCloseTo(anchor.x, 6);
    expect(anchorAfter.y).toBeCloseTo(anchor.y, 6);
    expect(after.zoom).toBeCloseTo(0.8 * ZOOM.wheelIn, 10);
  });

  it('clamps to the prototype zoom range', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 2.4 }, 0, 0, 4).zoom).toBe(ZOOM.max);
    expect(zoomAt({ x: 0, y: 0, zoom: 0.25 }, 0, 0, 0.1).zoom).toBe(ZOOM.min);
  });

  it('does not drift when clamped', () => {
    const clamped = zoomAt({ x: 10, y: 10, zoom: ZOOM.max }, 400, 400, 2);
    expect(clamped.zoom).toBe(ZOOM.max);
    expect(clamped.x).toBe(10);
    expect(clamped.y).toBe(10);
  });
});

describe('viewport helpers', () => {
  it('centreOn puts a board point in the middle of the screen', () => {
    const screen = { width: 1000, height: 800 };
    const viewport = centerOn({ x: 0, y: 0, zoom: 1.5 }, { x: 200, y: 300 }, screen);
    expect(200 * viewport.zoom + viewport.x).toBeCloseTo(500, 6);
    expect(300 * viewport.zoom + viewport.y).toBeCloseTo(400, 6);
  });

  it('visibleBoardRect round-trips with screenToBoard', () => {
    const viewport = { x: -300, y: -150, zoom: 1.25 };
    const screen = { width: 1200, height: 800 };
    const rect = visibleBoardRect(viewport, screen);
    expect(rect.x).toBeCloseTo(screenToBoard(viewport, 0, 0).x, 6);
    expect(rect.width).toBeCloseTo(screen.width / viewport.zoom, 6);
  });
});

describe('hierarchy sizing (1.5x per level)', () => {
  it('makes each level exactly 50% larger than the level below it', () => {
    for (let depth = 0; depth < CARD_SIZE.length - 1; depth += 1) {
      const above = CARD_SIZE[depth];
      const below = CARD_SIZE[depth + 1];
      if (!above || !below) throw new Error('missing depth');
      expect(above.width / below.width).toBeCloseTo(HIERARCHY_SCALE_STEP, 2);
      expect(above.height / below.height).toBeCloseTo(HIERARCHY_SCALE_STEP, 2);
    }
  });

  it('holds the anchor depth at the size it has always had', () => {
    // Depth 1 is where specialists sit; changing the ratio must not move it.
    expect(hierarchyScale(HIERARCHY_ANCHOR_DEPTH)).toBe(1);
    expect(CARD_SIZE[HIERARCHY_ANCHOR_DEPTH]).toEqual({ width: 182, height: 64 });
  });

  it('clamps depths past the deepest card rather than shrinking forever', () => {
    expect(hierarchyScale(99)).toBe(hierarchyScale(CARD_SIZE.length - 1));
    expect(cardSize(99)).toEqual(CARD_SIZE[CARD_SIZE.length - 1]);
    expect(cardSize(-3)).toEqual(CARD_SIZE[0]);
  });

  it('scales the 3D spheres and their labels by the same step', () => {
    expect(NODE_SIZE_3D.orchestrator / NODE_SIZE_3D.department).toBeCloseTo(HIERARCHY_SCALE_STEP, 2);
    expect(NODE_SIZE_3D.department / NODE_SIZE_3D.worker).toBeCloseTo(HIERARCHY_SCALE_STEP, 2);
    expect(LABEL_SCALE_3D.orchestrator / LABEL_SCALE_3D.department).toBeCloseTo(HIERARCHY_SCALE_STEP, 2);
    expect(LABEL_SCALE_3D.department / LABEL_SCALE_3D.worker).toBeCloseTo(HIERARCHY_SCALE_STEP, 2);
  });
});

describe('rows leave room for the cards they hold', () => {
  it('never lets a row overlap the one below it, at any depth', () => {
    // The 1.5x depth-0 card used to collide with the departments beneath it.
    for (let depth = 0; depth + 1 < CARD_SIZE.length; depth += 1) {
      const gap = rowOffset(depth + 1) - rowOffset(depth);
      const half = cardSize(depth).height / 2 + cardSize(depth + 1).height / 2;
      expect(gap).toBeGreaterThan(half);
    }
  });

  it('grows the gap under a level in proportion to that level\'s cards', () => {
    const topGap = rowOffset(1) - rowOffset(0);
    const nextGap = rowOffset(2) - rowOffset(1);
    expect(topGap / nextGap).toBeCloseTo(HIERARCHY_SCALE_STEP, 5);
  });
});
