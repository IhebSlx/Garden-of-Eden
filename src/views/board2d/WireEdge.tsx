/**
 * Hierarchy and peer wires, drawing the prototype's exact bezier shapes
 * (`draw2dWires`) with its stroke widths, dashes and arrowheads (SPEC 6).
 */
import { memo } from 'react';
import type { Edge, EdgeProps } from '@xyflow/react';
import type { EdgeKind, Status } from '../../model/schemas.js';
import { PEER_WIRE_COLOR, PEER_WIRE_LIFT, WIRE_BEZIER, WIRE_WIDTH } from '../../ui/constants.js';

export type WireEdgeData = {
  wireKind: EdgeKind;
  status: Status;
  /** Colour of the target agent's kind; peers use the neutral peer colour. */
  color: string;
  fromOrchestrator: boolean;
  ghosted: boolean;
  lit: boolean;
  edgeId: string;
};

export type WireFlowEdge = Edge<WireEdgeData, 'wire'>;

/** Hierarchy: down out of the parent, up into the child (prototype `draw2dWires`). */
export function hierarchyPath(sx: number, sy: number, tx: number, ty: number): string {
  const dy = Math.min(WIRE_BEZIER.max, Math.max(WIRE_BEZIER.min, (ty - sy) * 0.5));
  return `M ${sx} ${sy} C ${sx} ${sy + dy}, ${tx} ${ty - dy}, ${tx} ${ty}`;
}

/** Peer: an arc lifted above both cards, so it never reads as hierarchy. */
export function peerPath(sx: number, sy: number, tx: number, ty: number): string {
  return `M ${sx} ${sy} C ${sx} ${sy - PEER_WIRE_LIFT}, ${tx} ${ty - PEER_WIRE_LIFT}, ${tx} ${ty}`;
}

export function wireStrokeWidth(kind: EdgeKind, fromOrchestrator: boolean): number {
  if (kind === 'peer') return WIRE_WIDTH.peer;
  return fromOrchestrator ? WIRE_WIDTH.fromOrchestrator : WIRE_WIDTH.hierarchy;
}

/** Arrow markers are registered once per colour by `ArrowMarkers`. */
export function markerIdFor(color: string): string {
  return `arw${color.replace('#', '')}`;
}

function WireEdgeComponent({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps<WireFlowEdge>): React.JSX.Element | null {
  if (!data) return null;
  const { wireKind, status, color, fromOrchestrator, ghosted, lit } = data;

  const d =
    wireKind === 'peer'
      ? peerPath(sourceX, sourceY, targetX, targetY)
      : hierarchyPath(sourceX, sourceY, targetX, targetY);

  const className = [
    'w2',
    `st-${status}`,
    wireKind === 'peer' ? 'peer' : '',
    ghosted ? 'ghost' : '',
    lit && !ghosted ? 'lit' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <path
      className={className}
      d={d}
      stroke={color}
      strokeWidth={wireStrokeWidth(wireKind, fromOrchestrator)}
      markerEnd={wireKind === 'hierarchy' ? `url(#${markerIdFor(color)})` : undefined}
    />
  );
}

export const WireEdge = memo(WireEdgeComponent);

/** Directional arrowheads, one per wire colour (prototype `defs` block). */
export function ArrowMarkers(): React.JSX.Element {
  const colors = ['#38e1ff', '#3ce8b0', '#f6b954', '#8b5cf6', PEER_WIRE_COLOR];
  return (
    <svg
      aria-hidden="true"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      <defs>
        {colors.map((color) => (
          <marker
            key={color}
            id={markerIdFor(color)}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
          </marker>
        ))}
      </defs>
    </svg>
  );
}
