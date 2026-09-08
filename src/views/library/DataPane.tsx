/**
 * Data: a tree of wholes and parts, beside the detail of whichever one is
 * selected.
 *
 * The tree mirrors the folder structure the data arrives in — a box holds items,
 * an item may hold more — and each row says what state it is in and who owes it,
 * so the shape of the work reads before anything is clicked.
 *
 * Filtering by a department also unlocks "Copy as e-mail": the briefing that used
 * to live in a pane of its own. An overview nobody sends is a dashboard, and the
 * filter already knows which department you mean.
 */
import { useState } from 'react';
import { DATA_SOURCE_STATUS_LABELS, sourceLabel } from '../../model/schemas.js';
import type { DataSource, Fleet } from '../../model/schemas.js';
import { dataMatchesQuery, departmentBriefing, flattenData } from '../../model/selectors.js';
import type { DataQuery } from '../../model/selectors.js';
import { DataFields } from '../../panel/DataFields.js';
import { useFleetStore } from '../../store/fleetStore.js';
import { useUiStore } from '../../store/uiStore.js';
import { dataDotColor, STATUS_COLOR } from '../../ui/palette.js';
import { DocumentPreview } from './DocumentPreview.js';
import { ItemHeader } from './ItemHeader.js';
import { LibraryList } from './LibraryList.js';
import { UsedBy } from './UsedBy.js';

/** What a newly typed item is: needed, with nothing decided about it yet. */
const BLANK = { status: 'planned' } as const;

export function DataPane({
  fleet,
  query,
}: {
  fleet: Fleet;
  query: DataQuery;
}): React.JSX.Element {
  const addDataSource = useFleetStore((s) => s.addDataSource);
  const updateDataSource = useFleetStore((s) => s.updateDataSource);
  const deleteDataSource = useFleetStore((s) => s.deleteDataSource);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const matching = flattenData(fleet).filter(({ source }) => dataMatchesQuery(fleet, source, query));

  // A row that has just been filtered away must not stay selected and show a
  // detail pane for something no longer on screen.
  const selected =
    matching.find(({ source }) => source.id === selectedId)?.source ?? matching[0]?.source ?? null;

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
      <LibraryList
        rows={matching.map(({ source, depth }) => ({
          id: source.id,
          name: source.name,
          dot: dataDotColor(source.type, fleet),
          depth,
          badge: (source.owner ?? '').trim(),
          statusColor: STATUS_COLOR[source.status],
          noted: (source.notes ?? '').trim() !== '',
        }))}
        selectedId={selected?.id ?? null}
        onSelect={(id) => {
          setSelectedId(id);
          setProblem(null);
        }}
        newName={newName}
        onNewName={setNewName}
        onAdd={() => add()}
        addLabel="New data name"
        emptyText="Nothing matches. Widen the filter, or add something below."
      />

      <div className="datadetail" data-testid="library-detail">
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
            onRename={(next) => {
              const result = updateDataSource(selected.id, { name: next });
              return result.ok ? null : result.reason;
            }}
            onDelete={() => {
              const result = deleteDataSource(selected.id);
              if (result.ok) {
                setSelectedId(null);
                return null;
              }
              return result.blockedBy === undefined
                ? result.reason
                : `${result.reason} ${result.blockedBy.join(', ')}.`;
            }}
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
  onRename,
  onDelete,
}: {
  fleet: Fleet;
  source: DataSource;
  onAddInside: () => void;
  onRename: (next: string) => string | null;
  onDelete: () => string | null;
}): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <ItemHeader
        name={source.name}
        subtitle={
          <>
            <span className={source.type === undefined ? 'data-undecided' : undefined}>
              {sourceLabel(source.type)}
            </span>
            {(source.owner ?? '').trim() !== '' && <> · {source.owner}</>}
            {(source.description ?? '').trim() !== '' && <> · {source.description}</>}
          </>
        }
        right={
          <span
            className="stag"
            style={{ color: STATUS_COLOR[source.status], borderColor: STATUS_COLOR[source.status] }}
          >
            {DATA_SOURCE_STATUS_LABELS[source.status]}
          </span>
        }
        extra={
          <button
            type="button"
            className="chrome-btn"
            data-testid="data-add-inside"
            onClick={onAddInside}
          >
            + Add inside
          </button>
        }
        onRename={onRename}
        onDelete={onDelete}
      />

      <UsedBy fleet={fleet} kind="dataSource" itemId={source.id} />

      {error !== null && (
        <p className="dialog-error" role="status" data-testid="data-detail-error">
          {error}
        </p>
      )}

      <DataFields id={source.id} onError={setError} />

      <DocumentPreview refValue={source.ref} />
    </>
  );
}

/**
 * The briefing, where the filter already says who it is for. Shown only when one
 * department is picked, because "send this to everyone" is not a thing anybody
 * wants to do.
 */
export function BriefingButton({
  fleet,
  query,
}: {
  fleet: Fleet;
  query: DataQuery;
}): React.JSX.Element | null {
  const copied = useUiStore((s) => s.briefingCopied);
  const setCopied = useUiStore((s) => s.setBriefingCopied);
  if (query.provider.kind !== 'provider') return null;

  const owner = query.provider.name;
  return (
    <button
      type="button"
      className="chrome-btn"
      data-testid="briefing-copy"
      title={`Copy what ${owner} still owes, as text to send them`}
      onClick={() => {
        const text = departmentBriefing(fleet, owner);
        // Clipboard access can be refused; the button must not lie.
        void navigator.clipboard
          .writeText(text)
          .then(() => setCopied(true))
          .catch(() => setCopied(false));
      }}
    >
      {copied ? 'Copied' : `Copy ${owner}'s list`}
    </button>
  );
}
