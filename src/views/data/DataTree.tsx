/**
 * The data as it actually is: a tree of wholes and parts, beside the detail of
 * whichever one is selected.
 *
 * The tree mirrors the folder structure the data arrives in — a box holds items,
 * an item may hold more. Each row says what state it is in and who owes it, so the
 * shape of the work is legible before anything is clicked.
 */
import { useState } from 'react';
import { DATA_SOURCE_STATUS_LABELS, sourceLabel } from '../../model/schemas.js';
import type { DataSource, Fleet } from '../../model/schemas.js';
import { agentsUsing, dataMatchesQuery, flattenData } from '../../model/selectors.js';
import type { DataQuery } from '../../model/selectors.js';
import { DataFields } from '../../panel/DataFields.js';
import { useUiStore } from '../../store/uiStore.js';
import { dataDotColor, STATUS_COLOR } from '../../ui/palette.js';

export function DataTree({ fleet, query }: { fleet: Fleet; query: DataQuery }): React.JSX.Element {
  const rows = flattenData(fleet).filter(({ source }) => dataMatchesQuery(fleet, source, query));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // A row that has just been filtered away must not stay selected and show a
  // detail pane for something no longer on screen.
  const selected =
    rows.find(({ source }) => source.id === selectedId)?.source ?? rows[0]?.source ?? null;

  return (
    <div className="datapanes">
      <div className="datatree" data-testid="data-tree">
        {rows.length === 0 ? (
          <p className="data-empty" data-testid="data-tree-empty">
            Nothing matches. Widen the filter, or add data in Libraries.
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
              onClick={() => setSelectedId(source.id)}
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

      <div className="datadetail" data-testid="data-detail">
        {selected === null ? (
          <p className="data-empty">Pick an item to see who provides it.</p>
        ) : (
          <Detail fleet={fleet} source={selected} />
        )}
      </div>
    </div>
  );
}

function Detail({ fleet, source }: { fleet: Fleet; source: DataSource }): React.JSX.Element {
  const activate = useUiStore((s) => s.activate);
  const setView = useUiStore((s) => s.setView);
  const [error, setError] = useState<string | null>(null);
  const users = agentsUsing(fleet, 'dataSource', source.id);

  return (
    <>
      <header className="datadetail-head">
        <div>
          <h3>{source.name}</h3>
          <p>
            <span className={source.type === undefined ? 'data-undecided' : undefined}>
              {sourceLabel(source.type)}
            </span>
            {(source.owner ?? '').trim() !== '' && <> · {source.owner}</>}
          </p>
        </div>
        <span
          className="stag"
          style={{ color: STATUS_COLOR[source.status], borderColor: STATUS_COLOR[source.status] }}
        >
          {DATA_SOURCE_STATUS_LABELS[source.status]}
        </span>
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
