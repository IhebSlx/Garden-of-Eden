/**
 * The boxes saying what a department has to provide, which may contain boxes.
 * The tree operations are pure, so they are pinned here on their own before the
 * store wires them to an agent.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetIdFactory, sequentialIdFactory, setIdFactory } from '../../src/model/ids.js';
import {
  findRequirement,
  insertRequirement,
  newRequirement,
  removeRequirement,
  reorderRequirement,
  requirementProgress,
  updateRequirement,
  walkRequirements,
} from '../../src/model/requirements.js';
import { DataRequirementSchema } from '../../src/model/schemas.js';
import type { DataRequirement } from '../../src/model/schemas.js';

beforeEach(() => {
  setIdFactory(sequentialIdFactory());
  return () => resetIdFactory();
});

/** Produktdaten > Bilder > freigestellt, plus a sibling. */
const nested = (): DataRequirement[] => {
  let tree = insertRequirement([], null, { ...newRequirement('Produktdaten'), id: 'a' });
  tree = insertRequirement(tree, 'a', { ...newRequirement('Bilder'), id: 'b' });
  tree = insertRequirement(tree, 'b', { ...newRequirement('freigestellt, 2000px'), id: 'c' });
  tree = insertRequirement(tree, null, { ...newRequirement('Preise'), id: 'd' });
  return tree;
};

describe('newRequirement', () => {
  it('starts Planned — a new promise is not kept yet', () => {
    expect(newRequirement('Bilder')).toMatchObject({ title: 'Bilder', status: 'planned', children: [] });
  });

  it('trims the title', () => {
    expect(newRequirement('  Bilder  ').title).toBe('Bilder');
  });
});

describe('a box may contain boxes', () => {
  it('nests to any depth and validates', () => {
    const tree = nested();
    expect(DataRequirementSchema.safeParse(tree[0]).success).toBe(true);
    expect(tree[0]?.children[0]?.children[0]?.title).toBe('freigestellt, 2000px');
  });

  it('walks parents before children, reporting depth', () => {
    const seen: [string, number][] = [];
    walkRequirements(nested(), (node, depth) => seen.push([node.title, depth]));
    expect(seen).toEqual([
      ['Produktdaten', 0],
      ['Bilder', 1],
      ['freigestellt, 2000px', 2],
      ['Preise', 0],
    ]);
  });

  it('finds a box at any depth, and reports a missing one', () => {
    expect(findRequirement(nested(), 'c')?.title).toBe('freigestellt, 2000px');
    expect(findRequirement(nested(), 'nope')).toBeUndefined();
  });

  it('inserts at the top when no parent is named', () => {
    const tree = insertRequirement(nested(), null, { ...newRequirement('Kontakte'), id: 'e' });
    expect(tree.map((n) => n.id)).toEqual(['a', 'd', 'e']);
  });

  it('leaves the original tree untouched, so undo has something to go back to', () => {
    const before = nested();
    const snapshot = JSON.stringify(before);
    insertRequirement(before, 'a', newRequirement('X'));
    updateRequirement(before, 'a', { status: 'live' });
    removeRequirement(before, 'a');
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('updateRequirement', () => {
  it('patches a nested box without disturbing its children', () => {
    const tree = updateRequirement(nested(), 'b', { status: 'live', notes: 'von Marketing' });
    const box = findRequirement(tree, 'b');
    expect(box).toMatchObject({ title: 'Bilder', status: 'live', notes: 'von Marketing' });
    expect(box?.children[0]?.title).toBe('freigestellt, 2000px');
  });

  it('does nothing when the id is not in the tree', () => {
    expect(updateRequirement(nested(), 'ghost', { status: 'live' })).toEqual(nested());
  });
});

describe('removeRequirement', () => {
  it('takes the contents with it — that is what a box means', () => {
    const tree = removeRequirement(nested(), 'a');
    expect(tree.map((n) => n.id)).toEqual(['d']);
    expect(findRequirement(tree, 'b')).toBeUndefined();
    expect(findRequirement(tree, 'c')).toBeUndefined();
  });

  it('removes a deep box and leaves its ancestors standing', () => {
    const tree = removeRequirement(nested(), 'c');
    expect(findRequirement(tree, 'b')?.children).toEqual([]);
    expect(findRequirement(tree, 'a')).toBeDefined();
  });
});

describe('reorderRequirement', () => {
  it('swaps siblings', () => {
    expect(reorderRequirement(nested(), 'd', -1).map((n) => n.id)).toEqual(['d', 'a']);
    expect(reorderRequirement(nested(), 'a', 1).map((n) => n.id)).toEqual(['d', 'a']);
  });

  it('does nothing at the ends', () => {
    expect(reorderRequirement(nested(), 'a', -1).map((n) => n.id)).toEqual(['a', 'd']);
    expect(reorderRequirement(nested(), 'd', 1).map((n) => n.id)).toEqual(['a', 'd']);
  });

  it('reorders nested siblings too', () => {
    let tree = insertRequirement(nested(), 'a', { ...newRequirement('Masse'), id: 'e' });
    tree = reorderRequirement(tree, 'e', -1);
    expect(findRequirement(tree, 'a')?.children.map((n) => n.id)).toEqual(['e', 'b']);
  });

  it('never moves a box into itself — reordering only', () => {
    const tree = reorderRequirement(nested(), 'a', 1);
    expect(findRequirement(tree, 'a')?.children.map((n) => n.id)).toEqual(['b']);
  });
});

describe('requirementProgress', () => {
  it('counts every level, not just the top boxes', () => {
    expect(requirementProgress(nested())).toEqual({
      total: 4,
      outstanding: 4,
      byStatus: { live: 0, building: 0, planned: 4 },
    });
  });

  it('counts a Live box as no longer outstanding', () => {
    let tree = updateRequirement(nested(), 'c', { status: 'live' });
    tree = updateRequirement(tree, 'd', { status: 'building' });
    expect(requirementProgress(tree)).toEqual({
      total: 4,
      outstanding: 3,
      byStatus: { live: 1, building: 1, planned: 2 },
    });
  });

  it('is zero for an empty tree', () => {
    expect(requirementProgress([])).toEqual({
      total: 0,
      outstanding: 0,
      byStatus: { live: 0, building: 0, planned: 0 },
    });
  });
});
