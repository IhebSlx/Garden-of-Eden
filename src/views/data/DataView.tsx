/**
 * The Data view: a peer of 2D and 3D, answering a different question.
 *
 * The graph views answer "what does this fleet look like?". This one answers "what
 * does it need from the organisation, and who owes it?" — which is a table, a
 * matrix and a page per department, not a graph. It is a view rather than a dialog
 * because it is somewhere you work, not something you glance at over the board.
 *
 * Three panes over one filter:
 *   Tree       - the data as it is: wholes, parts, and the detail of one item
 *   Coverage   - every agent against every box, so a gap cannot hide
 *   Department - what one department owes, and the text to send them
 *
 * DEVIATION: beyond SPEC §5, which describes two views. The data behind a fleet is
 * the thing this app is used to plan, and a 640px dialog could not hold it.
 */
import { useState } from 'react';
import { ANY_DATA } from '../../model/selectors.js';
import type { DataQuery } from '../../model/selectors.js';
import { selectActiveFleet, useFleetStore } from '../../store/fleetStore.js';
import { useUiStore } from '../../store/uiStore.js';
import type { DataMode } from '../../store/uiStore.js';
import { DataCoverage } from './DataCoverage.js';
import { DataDepartments } from './DataDepartments.js';
import { DataFilters } from './DataFilters.js';
import { FolderImport } from './FolderImport.js';
import { DataTree } from './DataTree.js';

const MODES: { mode: DataMode; label: string }[] = [
  { mode: 'tree', label: 'Tree' },
  { mode: 'coverage', label: 'Coverage' },
  { mode: 'department', label: 'By department' },
];

export function DataView(): React.JSX.Element | null {
  const fleet = useFleetStore(selectActiveFleet);
  const mode = useUiStore((s) => s.dataMode);
  const setDataMode = useUiStore((s) => s.setDataMode);
  const openLibrary = useUiStore((s) => s.openLibrary);

  /**
   * The filter is view state and deliberately local: it scopes what is on screen
   * and has no business in the undo history or the saved document (SPEC §2).
   */
  const [query, setQuery] = useState<DataQuery>(ANY_DATA);

  if (!fleet) return null;

  const owed = fleet.dataSources.filter((source) => source.status !== 'live').length;

  return (
    <div className="dataview" data-testid="data-view" data-mode={mode}>
      <header className="dataview-head">
        <div className="glass-bar dataview-modes">
          {MODES.map((entry) => (
            <button
              key={entry.mode}
              type="button"
              className={`chrome-btn ${mode === entry.mode ? 'on' : ''}`}
              data-testid={`data-mode-${entry.mode}`}
              onClick={() => setDataMode(entry.mode)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="dataview-meta">
          <span data-testid="data-view-owed">
            {owed === 0
              ? 'Nothing outstanding'
              : `${owed} of ${fleet.dataSources.length} still to provide`}
          </span>
          <FolderImport />
          <button type="button" className="chrome-btn" onClick={openLibrary} data-testid="data-view-edit">
            Libraries…
          </button>
        </div>
      </header>

      {/* Coverage is a picture of the whole fleet, so filtering rows out of it
          would make it lie about what is covered. */}
      {mode !== 'coverage' && (
        <DataFilters fleet={fleet} query={query} onChange={setQuery} idPrefix="dataview" />
      )}

      <div className="dataview-body">
        {mode === 'tree' && <DataTree fleet={fleet} query={query} />}
        {mode === 'coverage' && <DataCoverage fleet={fleet} />}
        {mode === 'department' && <DataDepartments fleet={fleet} query={query} />}
      </div>
    </div>
  );
}
