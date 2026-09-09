/**
 * Creating an agent from the board itself.
 *
 * Until now an agent could only be born under another one — "+ Add sub-agent" on
 * a card you had already selected — so the first agent of a branch, or anything
 * that belongs at the top, had nowhere to come from. Right-clicking empty space
 * is where people expect "new thing here" to live.
 *
 * SPEC §5.8's friction rule still holds: name and role are all that is required.
 * Type, parent and children are offered because the board is where you already
 * know them, not because the schema demands them.
 */
import { useState } from 'react';
import { AgentKindSchema } from '../../model/schemas.js';
import { parentIdsOf } from '../../model/selectors.js';
import type { AgentKind, Fleet } from '../../model/schemas.js';
import { KIND_COLOR, KIND_LABEL } from '../../ui/palette.js';

export type NewAgentChoice = {
  name: string;
  role: string;
  kind: AgentKind;
  /** Empty means top level: SPEC §4 renders a parentless agent as a root. */
  parentId: string;
  /** Existing agents that become children of the new one. */
  childIds: string[];
};

export function NewAgentDialog({
  fleet,
  error,
  onCreate,
  onCancel,
}: {
  fleet: Fleet;
  error: string | null;
  onCreate: (choice: NewAgentChoice) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [kind, setKind] = useState<AgentKind>('worker');
  const [parentId, setParentId] = useState('');
  const [childIds, setChildIds] = useState<Set<string>>(new Set());

  // SPEC §4: exactly one orchestrator. Offering a second one that the store will
  // refuse is a button that lies.
  const hasOrchestrator = fleet.agents.some((agent) => agent.kind === 'orchestrator');

  const toggleChild = (id: string): void =>
    setChildIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /**
   * Everything the new agent would sit under, however far up.
   *
   * Any of these as a child would be a cycle, and the store refuses it — so they
   * are not offered. Offering a choice that will be rejected after the agent is
   * already created is how a link goes missing without anyone being told.
   */
  const ancestorsOfParent = (): Set<string> => {
    const found = new Set<string>();
    const walk = (id: string): void => {
      if (id === '' || found.has(id)) return;
      found.add(id);
      for (const up of parentIdsOf(fleet, id)) walk(up);
    };
    walk(parentId);
    return found;
  };

  // Anything not above it is fair game: an agent may have several hierarchy
  // parents (SPEC §2), so this takes nothing away from where a child sits now.
  const above = ancestorsOfParent();
  const childCandidates = fleet.agents.filter((agent) => !above.has(agent.id));

  return (
    <div className="dialog-scrim" role="dialog" aria-label="New agent" data-testid="new-agent-dialog">
      <div className="dialog">
        <h2>New agent</h2>

        <div className="lib-field-row">
          <label className="dialog-field">
            <span>Name</span>
            <input
              value={name}
              placeholder="Angebots-Assistent"
              data-testid="new-agent-name"
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="dialog-field">
            <span>What does it do?</span>
            <input
              value={role}
              placeholder="Drafts offers from project data"
              data-testid="new-agent-role"
              onChange={(event) => setRole(event.target.value)}
            />
          </label>
        </div>

        <div className="newagent-kinds" role="group" aria-label="Type">
          {AgentKindSchema.options.map((option) => {
            const blocked = option === 'orchestrator' && hasOrchestrator;
            return (
              <button
                key={option}
                type="button"
                className={`newagent-kind ${kind === option ? 'on' : ''}`}
                data-testid={`new-agent-kind-${option}`}
                disabled={blocked}
                title={blocked ? 'This fleet already has an orchestrator' : undefined}
                style={kind === option ? { borderColor: KIND_COLOR[option] } : undefined}
                onClick={() => setKind(option)}
              >
                <span className="tdot" style={{ background: KIND_COLOR[option] }} />
                {KIND_LABEL[option]}
              </button>
            );
          })}
        </div>

        <label className="dialog-field">
          <span>Reports to</span>
          <select
            value={parentId}
            data-testid="new-agent-parent"
            onChange={(event) => {
              setParentId(event.target.value);
              // A parent just chosen must not stay ticked as a child as well.
              setChildIds((previous) => {
                const next = new Set(previous);
                next.delete(event.target.value);
                return next;
              });
            }}
          >
            <option value="">Nothing — it sits at the top</option>
            {fleet.agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>

        <div className="newagent-children">
          <div className="newagent-childhead">
            <span>Agents under it</span>
            <small>{childIds.size === 0 ? 'none' : `${childIds.size} chosen`}</small>
          </div>
          {childCandidates.length === 0 ? (
            <p className="export-hint">No other agent to put under it yet.</p>
          ) : (
            <div className="newagent-childlist">
              {childCandidates.map((agent) => (
                <label key={agent.id} className="export-row">
                  <input
                    type="checkbox"
                    checked={childIds.has(agent.id)}
                    data-testid={`new-agent-child-${agent.id}`}
                    onChange={() => toggleChild(agent.id)}
                  />
                  <span className="tdot" style={{ background: KIND_COLOR[agent.kind] }} />
                  <span className="export-name">{agent.name}</span>
                  <small>{agent.role.trim() === '' ? KIND_LABEL[agent.kind] : agent.role}</small>
                </label>
              ))}
            </div>
          )}
        </div>

        {error !== null && (
          <p className="dialog-error" role="status" data-testid="new-agent-error">
            {error}
          </p>
        )}

        <div className="dialog-row">
          <button
            type="button"
            className="btn"
            disabled={name.trim() === ''}
            data-testid="new-agent-create"
            onClick={() =>
              onCreate({ name, role, kind, parentId, childIds: [...childIds] })
            }
          >
            Create
          </button>
          <button type="button" className="btn ghost" data-testid="new-agent-cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
