/**
 * The data as it actually is: a tree of wholes and parts, beside the detail of
 * whichever one is selected.
 *
 * The tree mirrors the folder structure the data arrives in — a box holds items,
 * an item may hold more. Each row says what state it is in and who owes it, so the
 * shape of the work is legible before anything is clicked.
 *
 * Adding, renaming and deleting all happen here rather than in the Libraries
 * dialog: this is where the data is looked at, so it is where it should be
 * changed. Both destructive guards live in the store and their reasons are shown
 * verbatim — an item in use by an agent, and a box that still holds items.
 */
import { useState } from 'react';
import { DATA_SOURCE_STATUS_LABELS, sourceLabel } from '../../model/schemas.js';
import type { DataSource, Fleet } from '../../model/schemas.js';
import { agentsUsing, dataMatchesQuery, flattenData } from '../../model/selectors.js';
import type { DataQuery } from '../../model/selectors.js';
import { DataFields } from '../../panel/DataFields.js';
import { useFleetStore } from '../../store/fleetStore.js';
import { useUiStore } from '../../store/uiStore.js';
import { dataDotColor, STATUS_COLOR } from '../../ui/palette.js';

/** What a newly typed item is: needed, with nothing decided about it yet. */
const BLANK = { status: 'planned' } as const;

export function DataTree({ fleet, query }: { fleet: Fleet; query: DataQuery }): React.JSX.Element {
  const addDataSource = useFleetStore((s) => s.addDataSource);
  const rows = flattenData(fleet).filter(({ source }) => dataMatchesQuery(fleet, source, query));

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  // A row that has just been filtered away must not stay selected and show a
  // detail pane for something no longer on screen.
  const selected =
    rows.find(({ source }) => source.id === selectedId)?.source ?? rows[0]?.source ?? null;

  /** Create at the top level, or inside `parentId`, and open the new item. */
  const add = (parentId?: string): void => {
    const name = newName.trim();
    if (parentId === undefined && name === '') return;
    const result = addDataSource({
      ...BLANK,
      name: name === '' ? 'New data' : name,
      ...(parentId === undefined ? {} : { parentId }),
    });
    if (!result.ok) {
      setProblem(result.reason);
      return;
    }
    setProblem(null);
    setNewName('');
    setSelectedId(result.id);
  };

  return (
    <div className="datapanes">
      <div className="datatree" data-testid="data-tree">
        <div className="datatree-rows">
          {rows.length === 0 ? (
            <p className="data-empty" data-testid="data-tree-empty">
              Nothing matches. Widen the filter, or add something below.
            </p>
          ) : (
            rows.map(({ source, depth }) => (
              <button
                key={source.id}
                type="button"
                className={`datarow ${selected?.id === source.id ? 'on' : ''}`}
                data-testid="data-row"
                data-depth={depth}
                style={depth > 0 ? { paddingLeft: `${10 + depth * 16}px` } : undefined}
                onClick={() => {
                  setSelectedId(source.id);
                  setProblem(null);
                }}
              >
                <span className="tdot" style={{ background: dataDotColor(source.type) }} />
                <span className="datarow-name">{source.name}</span>
                {(source.owner ?? '').trim() !== '' && (
                  <span className="datarow-owner">{source.owner}</span>
                )}
                <span className="sdot" style={{ background: STATUS_COLOR[source.status] }} />
              </button>
            ))
          )}
        </div>

        {/* A new item starts at the top level; the editor's "Inside" moves it, or
            the detail pane adds one directly inside whatever is open. */}
        <div className="datatree-add">
          <input
            value={newName}
            placeholder="New data name"
            aria-label="New data name"
            data-testid="data-new-name"
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') add();
            }}
          />
          <button
            type="button"
            className="chrome-btn"
            data-testid="data-add"
            disabled={newName.trim() === ''}
            onClick={() => add()}
          >
            Add
          </button>
        </div>
      </div>

      <div className="datadetail" data-testid="data-detail">
        {problem !== null && (
          <p className="dialog-error" role="status" data-testid="data-problem">
            {problem}
          </p>
        )}
        {selected === null ? (
          <p className="data-empty">Nothing selected. Add an item, or clear the filter.</p>
        ) : (
          // Keyed by the item: the editor holds uncontrolled inputs, which would
          // otherwise keep the previous row's text when the selection moves.
          <Detail
            key={selected.id}
            fleet={fleet}
            source={selected}
            onAddInside={() => add(selected.id)}
            onProblem={setProblem}
            onDeleted={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}

function Detail({
  fleet,
  source,
  onAddInside,
  onProblem,
  onDeleted,
}: {
  fleet: Fleet;
  source: DataSource;
  onAddInside: () => void;
  onProblem: (reason: string | null) => void;
  onDeleted: () => void;
}): React.JSX.Element {
  const activate = useUiStore((s) => s.activate);
  const setView = useUiStore((s) => s.setView);
  const updateDataSource = useFleetStore((s) => s.updateDataSource);
  const deleteDataSource = useFleetStore((s) => s.deleteDataSource);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const users = agentsUsing(fleet, 'dataSource', source.id);

  const rename = (event: React.FocusEvent<HTMLInputElement>): void => {
    const next = event.target.value.trim();
    if (next === '' || next === source.name) {
      event.target.value = source.name;
      return;
    }
    const result = updateDataSource(source.id, { name: next });
    if (!result.ok) {
      event.target.value = source.name;
      onProblem(result.reason);
    }
  };

  return (
    <>
      <header className="datadetail-head">
        <div className="datadetail-title">
          <input
            className="datadetail-name"
            defaultValue={source.name}
            aria-label={`Rename ${source.name}`}
            data-testid="data-rename"
            onBlur={rename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
          <p>
            <span className={source.type === undefined ? 'data-undecided' : undefined}>
              {sourceLabel(source.type)}
            </span>
            {(source.owner ?? '').trim() !== '' && <> · {source.owner}</>}
          </p>
        </div>

        <div className="datadetail-actions">
          <span
            className="stag"
            style={{ color: STATUS_COLOR[source.status], borderColor: STATUS_COLOR[source.status] }}
          >
            {DATA_SOURCE_STATUS_LABELS[source.status]}
          </span>
          <button
            type="button"
            className="chrome-btn"
            data-testid="data-add-inside"
            onClick={onAddInside}
          >
            + Add inside
          </button>
          {confirming ? (
            <>
              <button
                type="button"
                className="chrome-btn danger"
                data-testid="data-delete-confirm"
                onClick={() => {
                  const result = deleteDataSource(source.id);
                  if (result.ok) {
                    onProblem(null);
                    onDeleted();
                    return;
                  }
                  // The store says why: in use by an agent, or still holds items.
                  setConfirming(false);
                  onProblem(
                    result.blockedBy === undefined
                      ? result.reason
                      : `${result.reason} ${result.blockedBy.join(', ')}.`,
                  );
                }}
              >
                Delete for good
              </button>
              <button type="button" className="chrome-btn" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              className="chrome-btn"
              data-testid="data-delete"
              onClick={() => setConfirming(true)}
            >
              Delete
            </button>
          )}
        </div>
      </header>

      {/* Who cannot work without it. Clicking one leaves for the board, because
          that is where an agent can actually be read. */}
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

      {error !== null && (
        <p className="dialog-error" role="status" data-testid="data-detail-error">
          {error}
        </p>
      )}

      <DataFields id={source.id} onError={setError} />
    </>
  );
}
