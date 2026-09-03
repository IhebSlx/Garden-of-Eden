/**
 * Operations on a department's tree of data requirements — the boxes saying what
 * it has to provide, which may contain further boxes.
 *
 * Pure and immutable: every function returns a new tree, so the store can hand
 * the result straight to zundo and undo works on requirements like anything else.
 */
import { ID_PREFIX, newId } from './ids.js';
import type { DataRequirement, Status } from './schemas.js';

/** A fresh box. Planned, because a new promise is not kept yet. */
export function newRequirement(title: string): DataRequirement {
  return { id: newId(ID_PREFIX.requirement), title: title.trim(), status: 'planned', children: [] };
}

/** Depth-first walk, parents before children. */
export function walkRequirements(
  tree: DataRequirement[],
  visit: (node: DataRequirement, depth: number) => void,
  depth = 0,
): void {
  for (const node of tree) {
    visit(node, depth);
    walkRequirements(node.children, visit, depth + 1);
  }
}

export function findRequirement(tree: DataRequirement[], id: string): DataRequirement | undefined {
  for (const node of tree) {
    if (node.id === id) return node;
    const found = findRequirement(node.children, id);
    if (found) return found;
  }
  return undefined;
}

/** Insert `box` under `parentId`, or at the top when `parentId` is null. */
export function insertRequirement(
  tree: DataRequirement[],
  parentId: string | null,
  box: DataRequirement,
): DataRequirement[] {
  if (parentId === null) return [...tree, box];
  return tree.map((node) =>
    node.id === parentId
      ? { ...node, children: [...node.children, box] }
      : { ...node, children: insertRequirement(node.children, parentId, box) },
  );
}

/** Replace one box, keeping its children unless the patch names new ones. */
export function updateRequirement(
  tree: DataRequirement[],
  id: string,
  patch: Partial<Omit<DataRequirement, 'id'>>,
): DataRequirement[] {
  return tree.map((node) =>
    node.id === id
      ? { ...node, ...patch }
      : { ...node, children: updateRequirement(node.children, id, patch) },
  );
}

/** Remove a box and everything inside it — deleting a box deletes its contents. */
export function removeRequirement(tree: DataRequirement[], id: string): DataRequirement[] {
  return tree
    .filter((node) => node.id !== id)
    .map((node) => ({ ...node, children: removeRequirement(node.children, id) }));
}

/**
 * Move a box up or down among its siblings. Reordering only: a box never changes
 * parent this way, so the tree cannot be made to contain itself.
 */
export function reorderRequirement(
  tree: DataRequirement[],
  id: string,
  direction: -1 | 1,
): DataRequirement[] {
  const at = tree.findIndex((node) => node.id === id);
  if (at !== -1) {
    const to = at + direction;
    if (to < 0 || to >= tree.length) return tree;
    const next = [...tree];
    const moved = next[at];
    const displaced = next[to];
    if (!moved || !displaced) return tree;
    next[at] = displaced;
    next[to] = moved;
    return next;
  }
  return tree.map((node) => ({ ...node, children: reorderRequirement(node.children, id, direction) }));
}

export type RequirementProgress = {
  total: number;
  /** Boxes not yet Live — what is still owed. */
  outstanding: number;
  byStatus: Record<Status, number>;
};

/**
 * Counts over the whole tree, every level included: a parent box being Live means
 * little if the boxes inside it are not, so the overview counts them all.
 */
export function requirementProgress(tree: DataRequirement[]): RequirementProgress {
  const byStatus: Record<Status, number> = { live: 0, building: 0, planned: 0 };
  let total = 0;

  walkRequirements(tree, (node) => {
    total += 1;
    byStatus[node.status] += 1;
  });

  return { total, outstanding: byStatus.building + byStatus.planned, byStatus };
}
