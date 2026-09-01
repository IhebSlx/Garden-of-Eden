/**
 * SPEC 5.8: "The link flow always asks for the edge kind: sub-agent (hierarchy)
 * or peer." Shown for both entry points - wire-drag (SPEC 8.4) and the panel picker.
 */
import { useState } from 'react';
import { selectActiveFleet, useFleetStore } from '../../store/fleetStore.js';
import { useLinkDraft } from '../../store/linkDraft.js';

export function LinkKindDialog(): React.JSX.Element | null {
  const pending = useLinkDraft((s) => s.pending);
  const cancel = useLinkDraft((s) => s.cancel);
  const fleet = useFleetStore(selectActiveFleet);
  const linkAgents = useFleetStore((s) => s.linkAgents);
  const [error, setError] = useState<string | null>(null);

  if (!pending || !fleet) return null;

  const source = fleet.agents.find((a) => a.id === pending.sourceId);
  const target = fleet.agents.find((a) => a.id === pending.targetId);
  if (!source || !target) return null;

  const link = (kind: 'hierarchy' | 'peer'): void => {
    const result = linkAgents(source.id, target.id, kind);
    if (result.ok) {
      setError(null);
      cancel();
    } else {
      setError(result.reason);
    }
  };

  return (
    <div className="dialog-scrim" role="dialog" aria-modal="true" data-testid="link-dialog">
      <div className="dialog">
        <h2>Link agents</h2>
        <p className="dialog-lead">
          How should <b>{source.name}</b> and <b>{target.name}</b> be connected?
        </p>

        <button type="button" className="dialog-option" data-testid="link-hierarchy" onClick={() => link('hierarchy')}>
          <span className="dialog-option-title">Sub-agent</span>
          <span className="dialog-option-sub">
            {target.name} reports to {source.name} and appears under it on the board.
          </span>
        </button>

        <button type="button" className="dialog-option" data-testid="link-peer" onClick={() => link('peer')}>
          <span className="dialog-option-title">Peer</span>
          <span className="dialog-option-sub">
            A same-level hand-off. Peers stay out of the hierarchy and never expand focus.
          </span>
        </button>

        {error && (
          <p className="dialog-error" role="status">
            {error}
          </p>
        )}

        <button type="button" className="dialog-cancel" onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
