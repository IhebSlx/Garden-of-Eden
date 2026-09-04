/**
 * SPEC 5.2 (focus) + SPEC 5.6 (status filter), composed by intersection.
 *
 * This is `recomputeVis()` from the prototype, made pure. The subtlety worth
 * keeping: focus is decided per INSTANCE, not per agent. An instance survives only
 * if its own parent is inside the focused set, so focusing Marketing lights up the
 * copy of a shared agent that hangs under Marketing and ghosts its copies under
 * the other departments.
 *
 * Nothing is ever hidden - non-matching components ghost to 5% (SPEC 5.2/5.6).
 */
import { matchesFilter } from '../store/uiStore.js';
import type { Fleet, Status } from './schemas.js';
import type { Instance } from './selectors.js';
import { visibleSet } from './selectors.js';
import type { Wire } from './wires.js';

export type VisibilityResult = {
  /** Instance keys that render at full strength. Everything else ghosts. */
  litInstanceKeys: Set<string>;
  /** Wire ids that render at full strength. */
  litWireIds: Set<string>;
  /** Wire ids inside the focused branch - these brighten (SPEC 6, x1.7). */
  focusedWireIds: Set<string>;
  /** Depth of the focused agent, so the cascade can stagger relative to it. */
  focusDepth: number;
};

export function computeVisibility(
  fleet: Fleet,
  instanceList: Instance[],
  wireList: Wire[],
  focusId: string | null,
  statusFilter: Status | null,
): VisibilityResult {
  const statusOf = new Map(fleet.agents.map((a) => [a.id, a.status]));
  const focused = focusId === null ? null : visibleSet(fleet, focusId);

  let focusDepth = 0;
  if (focusId !== null) {
    const depths = instanceList.filter((i) => i.agentId === focusId).map((i) => i.depth);
    focusDepth = depths.length > 0 ? Math.min(...depths) : 0;
  }

  const inFocus = new Set<string>();
  for (const instance of instanceList) {
    const ok =
      focused === null ||
      (focused.has(instance.agentId) &&
        (instance.agentId === focusId ||
          instance.parentId === null ||
          focused.has(instance.parentId)));
    if (ok) inFocus.add(instance.key);
  }

  const litInstanceKeys = new Set<string>();
  for (const instance of instanceList) {
    const status = statusOf.get(instance.agentId);
    if (inFocus.has(instance.key) && status !== undefined && matchesFilter(status, statusFilter)) {
      litInstanceKeys.add(instance.key);
    }
  }

  const litWireIds = new Set<string>();
  const focusedWireIds = new Set<string>();
  for (const wire of wireList) {
    const endpointsInFocus = inFocus.has(wire.fromKey) && inFocus.has(wire.toKey);
    // SPEC §5.6: a wire is filtered by its OWN status, never its endpoints'.
    if (endpointsInFocus && matchesFilter(wire.status, statusFilter)) {
      litWireIds.add(wire.id);
      if (focused !== null) focusedWireIds.add(wire.id);
    }
  }

  return { litInstanceKeys, litWireIds, focusedWireIds, focusDepth };
}
