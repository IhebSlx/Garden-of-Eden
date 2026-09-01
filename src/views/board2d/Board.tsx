/**
 * The 2D glass board (SPEC 5.4, 5.5, 9 Phase 1).
 *
 * React Flow owns pan/zoom/drag; the prototype's tuned maths owns fit and focus
 * framing, so SPEC 5.2's "real zoom-to-fit, not centring" is exact rather than
 * approximated by a library's own padding rules.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  useViewport,
} from '@xyflow/react';
import type { Connection, NodeChange, NodeMouseHandler, OnNodeDrag } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { AgentNode } from './AgentNode.js';
import type { AgentFlowNode } from './AgentNode.js';
import { ArrowMarkers, WireEdge } from './WireEdge.js';
import { Minimap } from './Minimap.js';
import { ZoomControls } from './ZoomControls.js';
import { cardSizeAt, useBoardModel, zoomBucket } from './boardModel.js';
import type { ZoomBucket } from './boardModel.js';
import { boundsOf } from '../../layout/treeLayout.js';
import { fitViewport, frameViewport } from '../../layout/viewport.js';
import { useFleetStore } from '../../store/fleetStore.js';
import { useUiStore } from '../../store/uiStore.js';
import { useLinkDraft } from '../../store/linkDraft.js';
import {
  BOARD_ANIM_MS,
  DRAG_THRESHOLD_PX,
  FRAME_PADDING,
  ZOOM,
} from '../../ui/constants.js';

const nodeTypes = { agent: AgentNode };
const edgeTypes = { wire: WireEdge };

function BoardCanvas(): React.JSX.Element {
  const wrapper = useRef<HTMLDivElement>(null);
  const { setViewport, getViewport } = useReactFlow();
  const { zoom } = useViewport();

  // Semantic-zoom stage is a pure function of the live zoom - no state to drift.
  const bucket: ZoomBucket = zoomBucket(zoom);

  const model = useBoardModel(bucket);
  const activate = useUiStore((s) => s.activate);
  const clearFocus = useUiStore((s) => s.clearFocus);
  const focusId = useUiStore((s) => s.focusId);
  const showDetails = useUiStore((s) => s.showDetails);
  const setAgentPosition = useFleetStore((s) => s.setAgentPosition);
  const openLinkDraft = useLinkDraft((s) => s.open);
  const linking = useLinkDraft((s) => s.pending !== null);

  // React Flow needs to own node objects during a drag, so the derived list is
  // mirrored into local state and re-synced whenever the projection changes.
  // (React's "adjust state during render" pattern - no cascading effect.)
  const [nodes, setNodes] = useState<AgentFlowNode[]>(model.nodes);
  const [syncedFrom, setSyncedFrom] = useState(model.nodes);
  if (syncedFrom !== model.nodes) {
    setSyncedFrom(model.nodes);
    setNodes(model.nodes);
  }

  const onNodesChange = useCallback(
    (changes: NodeChange<AgentFlowNode>[]) => setNodes((current) => applyNodeChanges(changes, current)),
    [],
  );

  // Live board size, so fit/frame maths and the minimap agree with what is on screen.
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /** SPEC 5.4: double-click empty space / the fit button frames the whole fleet. */
  const fit = useCallback(
    (animate = true) => {
      if (size.width === 0 || size.height === 0) return;
      const viewport = fitViewport(
        { width: model.layout.width, height: model.layout.height },
        size,
      );
      void setViewport(viewport, animate ? { duration: BOARD_ANIM_MS } : undefined);
    },
    [model.layout.height, model.layout.width, size, setViewport],
  );

  /** SPEC 5.2: animated pan + zoom-to-fit of the focused subtree's bounding box. */
  const frameFocus = useCallback(() => {
    const bounds = boundsOf(
      model.visibility.litInstanceKeys,
      model.layout.positions,
      model.sizeOf,
      FRAME_PADDING.card,
    );
    if (!bounds || size.width === 0) return;
    void setViewport(frameViewport(bounds, size), { duration: BOARD_ANIM_MS });
  }, [model.layout.positions, model.sizeOf, model.visibility.litInstanceKeys, size, setViewport]);

  // Fit once React Flow has a viewport, and again whenever a different fleet loads.
  // The fit has to wait for `onInit`: before that the pane has no size and
  // `setViewport` is dropped, which would leave the fleet parked at 100%.
  const [initialized, setInitialized] = useState(false);
  const fleetId = model.fleet?.id;
  const didFit = useRef<string | null>(null);
  useEffect(() => {
    if (!initialized || fleetId === undefined || didFit.current === fleetId) return;
    if (model.nodes.length === 0 || size.width === 0) return;
    didFit.current = fleetId;
    fit(false);
  }, [fit, fleetId, initialized, model.nodes.length, size.width]);

  // Framing follows focus, and returning to the full fleet refits (prototype `applyFocus`).
  const previousFocus = useRef<string | null>(null);
  useEffect(() => {
    if (focusId === previousFocus.current) return;
    const hadFocus = previousFocus.current !== null;
    previousFocus.current = focusId;
    if (focusId !== null) frameFocus();
    else if (hadFocus) fit(true);
  }, [fit, focusId, frameFocus]);

  // Auto-arrange and the fit control ask for a refit through the ui store,
  // because they live outside the ReactFlowProvider.
  const fitRequest = useUiStore((s) => s.fitRequest);
  const lastFitRequest = useRef(fitRequest);
  useEffect(() => {
    if (fitRequest === lastFitRequest.current) return;
    lastFitRequest.current = fitRequest;
    fit(true);
  }, [fit, fitRequest]);

  const onNodeClick = useCallback<NodeMouseHandler<AgentFlowNode>>(
    (_event, node) => activate(node.data.agent.id),
    [activate],
  );

  /** Single click on empty space exits focus, but only while focused (SPEC 5.2). */
  const onPaneClick = useCallback(() => {
    if (useUiStore.getState().focusId !== null) clearFocus();
  }, [clearFocus]);

  const onDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if ((event.target as HTMLElement).closest('.react-flow__node')) return;
      clearFocus();
      fit(true);
    },
    [clearFocus, fit],
  );

  const onNodeDragStop = useCallback<OnNodeDrag<AgentFlowNode>>(
    (_event, node) => {
      const box = cardSizeAt(node.data.depth, bucket);
      setAgentPosition(node.data.agent.id, {
        x: node.position.x + box.width / 2,
        y: node.position.y + box.height / 2,
      });
    },
    [bucket, setAgentPosition],
  );

  /** SPEC 8.4: dragging a wire between two cards opens the link-kind prompt. */
  const onConnect = useCallback(
    (connection: Connection) => {
      const source = model.instanceList.find((i) => i.key === connection.source);
      const target = model.instanceList.find((i) => i.key === connection.target);
      if (!source || !target || source.agentId === target.agentId) return;
      openLinkDraft(source.agentId, target.agentId);
    },
    [model.instanceList, openLinkDraft],
  );

  const surfaceClass = useMemo(
    () =>
      ['board-surface', bucket === 'far' ? 'far' : '', bucket === 'vfar' ? 'vfar' : '', showDetails ? 'showdet' : '', linking ? 'linkable' : '']
        .filter(Boolean)
        .join(' '),
    [bucket, showDetails, linking],
  );

  return (
    <div ref={wrapper} className={surfaceClass} onDoubleClick={onDoubleClick} data-testid="board">
      <ArrowMarkers />
      <ReactFlow
        nodes={nodes}
        edges={model.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        onConnect={onConnect}
        onInit={() => setInitialized(true)}
        minZoom={ZOOM.min}
        maxZoom={ZOOM.max}
        /* SPEC 10 known bug class: the threshold is screen pixels, never zoom-scaled. */
        nodeDragThreshold={DRAG_THRESHOLD_PX}
        zoomOnDoubleClick={false}
        selectNodesOnDrag={false}
        nodesFocusable={false}
        edgesFocusable={false}
        panOnScroll={false}
        proOptions={{ hideAttribution: true }}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={26}
          size={1.1}
          color="rgba(120,140,255,.4)"
        />
      </ReactFlow>

      <div className="pointer-events-none absolute right-4 bottom-11 z-20 flex flex-col items-end gap-2">
        <div className="pointer-events-auto">
          <ZoomControls
            onZoomIn={() => zoomBy(getViewport(), setViewport, size, ZOOM.buttonIn)}
            onZoomOut={() => zoomBy(getViewport(), setViewport, size, ZOOM.buttonOut)}
            onFit={() => {
              clearFocus();
              fit(true);
            }}
            zoom={zoom}
          />
        </div>
        <div className="pointer-events-auto">
          <Minimap model={model} screen={size} />
        </div>
      </div>
    </div>
  );
}

/** Zoom around the centre of the board, matching the prototype's button steps. */
function zoomBy(
  viewport: { x: number; y: number; zoom: number },
  setViewport: (v: { x: number; y: number; zoom: number }, o?: { duration: number }) => Promise<boolean> | void,
  screen: { width: number; height: number },
  factor: number,
): void {
  const zoom = Math.min(ZOOM.max, Math.max(ZOOM.min, viewport.zoom * factor));
  const applied = zoom / viewport.zoom;
  const cx = screen.width / 2;
  const cy = screen.height / 2;
  void setViewport(
    { zoom, x: cx - (cx - viewport.x) * applied, y: cy - (cy - viewport.y) * applied },
    { duration: 180 },
  );
}

export function Board(): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <BoardCanvas />
    </ReactFlowProvider>
  );
}
