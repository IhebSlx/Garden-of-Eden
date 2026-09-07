/**
 * The left-hand list every library pane shares: rows, and the box that adds one.
 *
 * Shared so Data, Tools and Skills cannot drift into three slightly different
 * lists — which is what happened when the Libraries dialog and the Data view each
 * kept their own copy of a filter.
 *
 * A row carries only what a list has to show: what it is (the dot), what it is
 * called, who owes it or what type it is (the badge), and what state it is in.
 * Anything more belongs in the detail pane beside it.
 */
export type LibraryRow = {
  id: string;
  name: string;
  /** The item's own colour, by source kind, tool type or skill. */
  dot: string;
  /** Nesting depth; only data nests, so this is 0 elsewhere. */
  depth: number;
  /** A short right-aligned label: the provider, or the tool's type. */
  badge?: string;
  /** Status colour, for the trailing dot. Absent where an item has no state. */
  statusColor?: string;
  /** Whether somebody left a note on it. */
  noted?: boolean;
};

export function LibraryList({
  rows,
  selectedId,
  onSelect,
  newName,
  onNewName,
  onAdd,
  addLabel,
  emptyText,
  addExtra,
  canAdd,
}: {
  rows: LibraryRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  newName: string;
  onNewName: (name: string) => void;
  onAdd: () => void;
  /** Placeholder on the add box, e.g. "New data name". */
  addLabel: string;
  emptyText: string;
  /**
   * A second field the add row needs. Tools have one: SPEC §4 requires a
   * description, so a tool cannot be created from a name alone.
   */
  addExtra?: React.ReactNode;
  /** Overrides "a name is enough" where more than a name is required. */
  canAdd?: boolean;
}): React.JSX.Element {
  return (
    <div className="datatree" data-testid="library-list">
      <div className="datatree-rows">
        {rows.length === 0 ? (
          <p className="data-empty" data-testid="library-list-empty">
            {emptyText}
          </p>
        ) : (
          rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`datarow ${selectedId === row.id ? 'on' : ''}`}
              data-testid="library-row"
              data-depth={row.depth}
              style={row.depth > 0 ? { paddingLeft: `${10 + row.depth * 16}px` } : undefined}
              onClick={() => onSelect(row.id)}
            >
              <span className="tdot" style={{ background: row.dot }} />
              <span className="datarow-name">{row.name}</span>
              {row.noted === true && <span className="lib-note-dot" data-testid="library-note-dot" />}
              {row.badge !== undefined && row.badge !== '' && (
                <span className="datarow-owner">{row.badge}</span>
              )}
              {row.statusColor !== undefined && (
                <span className="sdot" style={{ background: row.statusColor }} />
              )}
            </button>
          ))
        )}
      </div>

      <div className="datatree-add">
        <input
          value={newName}
          placeholder={addLabel}
          aria-label={addLabel}
          data-testid="library-new-name"
          onChange={(event) => onNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onAdd();
          }}
        />
        {addExtra}
        <button
          type="button"
          className="chrome-btn"
          data-testid="library-add"
          disabled={!(canAdd ?? newName.trim() !== '')}
          onClick={onAdd}
        >
          Add
        </button>
      </div>
    </div>
  );
}
