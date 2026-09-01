/**
 * SPEC 8.5 - "Edge status editing (click a wire → mini panel: kind, label, status)."
 * The kind control enforces the same no-orphan rule as unlinking (SPEC 5.8).
 */
import { useState } from 'react';
import { selectActiveFleet, useFleetStore } from '../store/fleetStore.js';
import { useUiStore } from '../store/uiStore.js';
import { KIND_COLOR } from '../ui/palette.js';
import { StatusChip } from './StatusChip.js';

export function EdgeInspector(): React.JSX.Element | null {
  const fleet = useFleetStore(selectActiveFleet);
  const selectedEdgeId = useUiStore((s) => s.selectedEdgeId);
  const selectEdge = useUiStore((s) => s.selectEdge);
  const updateEdge = useFleetStore((s) => s.updateEdge);
  const unlinkEdge = useFleetStore((s) => s.unlinkEdge);
  const [error, setError] = useState<string | null>(null);

  const edge = fleet && selectedEdgeId !== null ? fleet.edges.find((e) => e.id === selectedEdgeId) : undefined;
  if (!fleet || !edge) return null;

  const source = fleet.agents.find((a) => a.id === edge.source);
  const target = fleet.agents.find((a) => a.id === edge.target);

  const apply = (change: Parameters<typeof updateEdge>[1]): void => {
    const result = updateEdge(edge.id, change);
    setError(result.ok ? null : result.reason);
  };

  return (
    <aside
      className="inspector open edge-inspector"
      style={{ '--kc': KIND_COLOR[target?.kind ?? 'worker'] } as React.CSSProperties}
      data-testid="edge-inspector"
    >
      <button type="button" className="ins-close" onClick={() => selectEdge(null)} aria-label="Close link panel">
        ✕
      </button>

      <span className="kind">Link</span>
      <h2 className="ins-name-static">
        {source?.name} → {target?.name}
      </h2>

      <h3>Kind</h3>
      <div className="strow">
        <button
          type="button"
          className={`stbtn ${edge.kind === 'hierarchy' ? 'on' : ''}`}
          style={{ '--sc': KIND_COLOR.department } as React.CSSProperties}
          onClick={() => apply({ kind: 'hierarchy' })}
          data-testid="edge-kind-hierarchy"
        >
          Sub-agent
        </button>
        <button
          type="button"
          className={`stbtn ${edge.kind === 'peer' ? 'on' : ''}`}
          style={{ '--sc': KIND_COLOR.worker } as React.CSSProperties}
          onClick={() => apply({ kind: 'peer' })}
          data-testid="edge-kind-peer"
        >
          Peer
        </button>
      </div>

      <h3>Status</h3>
      <StatusChip status={edge.status} onChange={(status) => apply({ status })} />

      <h3>Label</h3>
      <input
        className="ins-role"
        defaultValue={edge.label ?? ''}
        placeholder="e.g. hands off to"
        data-testid="edge-label"
        onBlur={(event) => apply({ label: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />

      <div className="actions">
        <button
          type="button"
          className="btn danger"
          data-testid="edge-unlink"
          onClick={() => {
            const result = unlinkEdge(edge.id);
            if (result.ok) selectEdge(null);
            else setError(result.reason);
          }}
        >
          Unlink
        </button>
      </div>

      {error && (
        <p className="notice" role="status" data-testid="edge-notice">
          {error}
        </p>
      )}
    </aside>
  );
}
