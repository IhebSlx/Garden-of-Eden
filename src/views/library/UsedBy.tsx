/**
 * "Needed by" — the agents that depend on a library item.
 *
 * Clicking one leaves for the board, because that is where an agent can actually
 * be read. Shared by all three panes so the answer to "who breaks if I change
 * this?" looks the same wherever it is asked.
 */
import type { Fleet, LibraryKind } from '../../model/schemas.js';
import { agentsUsing } from '../../model/selectors.js';
import { useUiStore } from '../../store/uiStore.js';

export function UsedBy({
  fleet,
  kind,
  itemId,
}: {
  fleet: Fleet;
  kind: LibraryKind;
  itemId: string;
}): React.JSX.Element {
  const activate = useUiStore((s) => s.activate);
  const setView = useUiStore((s) => s.setView);
  const users = agentsUsing(fleet, kind, itemId);

  return (
    <div className="datadetail-users">
      <p className="datadetail-lab">Needed by</p>
      {users.length === 0 ? (
        <small>Nothing is linked to this yet.</small>
      ) : (
        <div className="ub">
          {users.map((agent) => (
            <button
              key={agent.id}
              type="button"
              className="ubn"
              onClick={() => {
                activate(agent.id);
                setView('2d');
              }}
            >
              {agent.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
