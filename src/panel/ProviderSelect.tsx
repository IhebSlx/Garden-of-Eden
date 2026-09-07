/**
 * "Provided by" — pick the department that owes a data item, or add one.
 *
 * The list is the org chart: a department is an agent (SPEC §4 level 2), which is
 * what lets the department page, the Ansprechpartner and the briefing all key off
 * one thing instead of a second list that can disagree with it.
 *
 * The consequence used to be that a department missing from the board could not be
 * chosen at all, and the only way to add one was to leave for the 2D view. So this
 * control can create one: **+ Add a department…** adds a real department agent
 * under the orchestrator and assigns it in the same step. The list stays the org
 * chart; you just no longer have to go somewhere else to extend it.
 *
 * Shared by the data editor and the department pane's compact row, so the two can
 * never offer different ways to answer the same question.
 */
import { useState } from 'react';
import type { Fleet } from '../model/schemas.js';
import { providerOptions } from '../model/selectors.js';
import { useFleetStore } from '../store/fleetStore.js';

/**
 * Real departments are prefixed, so the action's value cannot collide with one -
 * the same trick the data filter uses for its own axes.
 */
const ADD = 'add';
const asValue = (provider: string): string => `by:${provider}`;
const fromValue = (value: string): string => value.slice('by:'.length);

export function ProviderSelect({
  fleet,
  value,
  label,
  onPick,
  onProblem,
  testId,
}: {
  fleet: Fleet;
  /** The department currently named, or '' for nobody. */
  value: string;
  /** What this is choosing a provider for, for the accessible name. */
  label: string;
  onPick: (owner: string) => void;
  onProblem: (reason: string | null) => void;
  /** The host names its own control: two of them can be on screen at once. */
  testId: string;
}): React.JSX.Element {
  const addAgent = useFleetStore((s) => s.addAgent);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const create = (): void => {
    const trimmed = name.trim();
    if (trimmed === '') return;

    // Level 2 hangs off the orchestrator, so a new department does too.
    const orchestrator = fleet.agents.find((agent) => agent.kind === 'orchestrator');
    const result = addAgent({
      name: trimmed,
      role: '',
      kind: 'department',
      ...(orchestrator === undefined ? {} : { parentId: orchestrator.id }),
    });
    if (!result.ok) {
      onProblem(result.reason);
      return;
    }
    onProblem(null);
    setName('');
    setAdding(false);
    // Assigning it in the same step is the whole point of adding it here.
    onPick(trimmed);
  };

  return (
    <>
      <select
        value={value === '' ? '' : asValue(value)}
        aria-label={`Which department provides ${label}`}
        data-testid={testId}
        onChange={(event) => {
          if (event.target.value === ADD) {
            setAdding(true);
            return;
          }
          setAdding(false);
          onPick(event.target.value === '' ? '' : fromValue(event.target.value));
        }}
      >
        <option value="">Nobody yet</option>
        {providerOptions(fleet).map((provider) => (
          <option key={provider} value={asValue(provider)}>
            {provider}
          </option>
        ))}
        <option value={ADD}>+ Add a department…</option>
      </select>

      {adding && (
        <span className="provider-add" data-testid="provider-add">
          <input
            value={name}
            placeholder="Department name"
            aria-label="New department name"
            data-testid="provider-add-name"
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') create();
              if (event.key === 'Escape') {
                setAdding(false);
                setName('');
              }
            }}
          />
          <button
            type="button"
            className="chrome-btn"
            data-testid="provider-add-save"
            disabled={name.trim() === ''}
            onClick={create}
          >
            Add
          </button>
          <button
            type="button"
            className="chrome-btn"
            onClick={() => {
              setAdding(false);
              setName('');
            }}
          >
            Cancel
          </button>
        </span>
      )}
    </>
  );
}
