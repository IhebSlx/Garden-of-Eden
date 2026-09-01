/**
 * Turns the store's fleet into React Flow nodes and edges.
 *
 * Everything here is derived (SPEC 2.3: instances are never persisted). The board
 * is a pure projection of `fleetStore` + `uiStore`, which is what lets the 3D scene
 * subscribe to the same data without either view owning it.
 */
import { useMemo } from 'react';
import { instances as deriveInstances, buildFleetIndex, parentIdsOf } from '../../model/selectors.js';
import type { Instance } from '../../model/selectors.js';
import { deriveWires } from '../../model/wires.js';
import type { Wire } from '../../model/wires.js';
import { computeVisibility } from '../../model/visibility.js';
import type { VisibilityResult } from '../../model/visibility.js';
import { layoutInstances } from '../../layout/treeLayout.js';
import type { LayoutResult } from '../../layout/treeLayout.js';
import { selectActiveFleet, useFleetStore } from '../../store/fleetStore.js';
import { useUiStore } from '../../store/uiStore.js';
import {
  COLLAPSED_CARD_WIDTH,
  FOCUS_CASCADE_STAGGER_MS,
  ZOOM_COLLAPSE_TO_DOTS,
  ZOOM_HIDE_ROLES,
  PEER_WIRE_COLOR,
  cardSize,
} from '../../ui/constants.js';
import { KIND_COLOR } from '../../ui/palette.js';
import type { AgentFlowNode } from './AgentNode.js';
import type { WireFlowEdge } from './WireEdge.js';
import type { Fleet, Position } from '../../model/schemas.js';

/** Which semantic-zoom stage the board is in (SPEC 5.5). */
export type ZoomBucket = 'near' | 'far' | 'vfar';

export function zoomBucket(zoom: number): ZoomBucket {
  if (zoom < ZOOM_COLLAPSE_TO_DOTS) return 'vfar';
  if (zoom < ZOOM_HIDE_ROLES) return 'far';
  return 'near';
}

/** Card box at a given depth and zoom stage - collapsed cards are much narrower. */
export function cardSizeAt(depth: number, bucket: ZoomBucket): { width: number; height: number } {
  const base = cardSize(depth);
  if (depth < 2) return base;
  if (bucket === 'vfar') return { width: COLLAPSED_CARD_WIDTH, height: 33 };
  if (bucket === 'far') return { width: base.width, height: 33 };
  return base;
}

export type BoardModel = {
  fleet: Fleet | undefined;
  instanceList: Instance[];
  wireList: Wire[];
  layout: LayoutResult;
  visibility: VisibilityResult;
  nodes: AgentFlowNode[];
  edges: WireFlowEdge[];
  /** Instance key -> card box at the current zoom stage. */
  sizeOf: (key: string) => { width: number; height: number };
};

export function useBoardModel(bucket: ZoomBucket): BoardModel {
  const fleet = useFleetStore(selectActiveFleet);
  const focusId = useUiStore((s) => s.focusId);
  const selectedId = useUiStore((s) => s.selectedId);
  const statusFilter = useUiStore((s) => s.statusFilter);
  const focusStartedAt = useUiStore((s) => s.focusStartedAt);

  return useMemo(() => {
    if (!fleet) {
      return {
        fleet: undefined,
        instanceList: [],
        wireList: [],
        layout: layoutInstances([]),
        visibility: {
          litInstanceKeys: new Set<string>(),
          litWireIds: new Set<string>(),
          focusedWireIds: new Set<string>(),
          focusDepth: 0,
        },
        nodes: [],
        edges: [],
        sizeOf: () => cardSize(0),
      } satisfies BoardModel;
    }

    const index = buildFleetIndex(fleet);
    const instanceList = deriveInstances(fleet, index);
    const wireList = deriveWires(fleet, instanceList);

    const manual = new Map<string, Position>();
    for (const agent of fleet.agents) if (agent.position) manual.set(agent.id, agent.position);

    const layout = layoutInstances(instanceList, manual);
    const visibility = computeVisibility(fleet, instanceList, wireList, focusId, statusFilter);

    const agentsById = new Map(fleet.agents.map((a) => [a.id, a]));
    const skillsById = new Map(fleet.skills.map((s) => [s.id, s]));
    const toolsById = new Map(fleet.tools.map((t) => [t.id, t]));
    const depthByKey = new Map(instanceList.map((i) => [i.key, i.depth]));

    // Arrow-key neighbours, so the board is reachable without a pointer.
    const siblingsByParent = new Map<string, string[]>();
    for (const instance of instanceList) {
      const bucket = instance.parentKey ?? '__roots__';
      const list = siblingsByParent.get(bucket);
      if (list) list.push(instance.key);
      else siblingsByParent.set(bucket, [instance.key]);
    }
    const firstChildByKey = new Map<string, string>();
    for (const instance of instanceList) {
      if (instance.parentKey !== null && !firstChildByKey.has(instance.parentKey)) {
        firstChildByKey.set(instance.parentKey, instance.key);
      }
    }

    const sizeOf = (key: string): { width: number; height: number } =>
      cardSizeAt(depthByKey.get(key) ?? 2, bucket);

    const nodes: AgentFlowNode[] = [];
    for (const instance of instanceList) {
      const agent = agentsById.get(instance.agentId);
      const centre = layout.positions.get(instance.key);
      if (!agent || !centre) continue;

      const box = cardSizeAt(instance.depth, bucket);
      const parents = parentIdsOf(fleet, instance.agentId, index).length;
      const lit = visibility.litInstanceKeys.has(instance.key);

      nodes.push({
        id: instance.key,
        type: 'agent',
        // React Flow positions by top-left; the layout works in card centres.
        position: { x: centre.x - box.width / 2, y: centre.y - box.height / 2 },
        // A shared agent has several instances but SPEC 4 gives it one position
        // field, so only single-instance agents can be dragged.
        draggable: parents <= 1,
        selectable: false,
        data: {
          agent,
          instanceKey: instance.key,
          depth: instance.depth,
          sharedCount: parents,
          ghosted: !lit,
          selected: selectedId === instance.agentId,
          popToken: focusStartedAt,
          popDelayMs:
            focusId !== null && lit
              ? Math.max(0, instance.depth - visibility.focusDepth) * FOCUS_CASCADE_STAGGER_MS
              : null,
          neighbours: (() => {
            const bucket = instance.parentKey ?? '__roots__';
            const siblings = siblingsByParent.get(bucket) ?? [];
            const at = siblings.indexOf(instance.key);
            return {
              parent: instance.parentKey,
              child: firstChildByKey.get(instance.key) ?? null,
              previous: at > 0 ? (siblings[at - 1] ?? null) : null,
              next: at >= 0 && at < siblings.length - 1 ? (siblings[at + 1] ?? null) : null,
            };
          })(),
          skillNames: agent.skillIds
            .map((id) => skillsById.get(id)?.name)
            .filter((name): name is string => name !== undefined),
          tools: agent.toolIds
            .map((id) => toolsById.get(id))
            .filter((tool) => tool !== undefined)
            .map((tool) => ({ name: tool.name, type: tool.type })),
        },
      });
    }

    const edges: WireFlowEdge[] = wireList.map((wire) => {
      const color = wire.kind === 'peer' ? PEER_WIRE_COLOR : KIND_COLOR[wire.toKind];
      return {
        id: wire.id,
        source: wire.fromKey,
        target: wire.toKey,
        sourceHandle: wire.kind === 'peer' ? 'peer-out' : 'out',
        targetHandle: 'in',
        type: 'wire',
        selectable: true,
        focusable: false,
        data: {
          wireKind: wire.kind,
          status: wire.status,
          color,
          fromOrchestrator: agentsById.get(wire.fromAgentId)?.kind === 'orchestrator',
          ghosted: !visibility.litWireIds.has(wire.id),
          lit: visibility.focusedWireIds.has(wire.id),
          edgeId: wire.edgeId,
        },
      };
    });

    return { fleet, instanceList, wireList, layout, visibility, nodes, edges, sizeOf };
  }, [fleet, focusId, selectedId, statusFilter, focusStartedAt, bucket]);
}
