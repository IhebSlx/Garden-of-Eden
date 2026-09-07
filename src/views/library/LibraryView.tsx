/**
 * The Library view: a peer of 2D and 3D, answering a different question.
 *
 * The graph views answer "what does this fleet look like?". This one answers "what
 * is it made of, and who owes it?" — three libraries the agents draw on, each a
 * list beside an editor. It is a view rather than a dialog because it is somewhere
 * you work, not something you glance at over the board.
 *
 *   Data   - what the agents read: nested, owed by departments, with a source
 *   Tools  - what they can do, including workflow shapes
 *   Skills - what they know how to do
 *
 * Each tab filters, and each filters by the axes its own content actually has: a
 * tool is not owed by anybody, and a skill has no state, so offering them a status
 * chip would be three dead controls.
 *
 * DEVIATION: beyond SPEC §5, which describes two views and puts the libraries in a
 * dialog (§8.7). The libraries are what this app is used to plan, and a 640px
 * dialog could not hold them.
 */
import { useState } from 'react';
import type { ToolType } from '../../model/schemas.js';
import { ANY_DATA } from '../../model/selectors.js';
import type { DataQuery } from '../../model/selectors.js';
import { selectActiveFleet, useFleetStore } from '../../store/fleetStore.js';
import { useUiStore } from '../../store/uiStore.js';
import type { LibraryTab } from '../../store/uiStore.js';
import { TOOL_TYPE_LABEL } from '../../ui/palette.js';
import { BriefingButton, DataPane } from './DataPane.js';
import { DataFilters } from './DataFilters.js';
import { FolderImport } from './FolderImport.js';
import { SkillsPane } from './SkillsPane.js';
import { SourceKinds } from './SourceKinds.js';
import { ToolsPane, TOOL_TYPES } from './ToolsPane.js';

const TABS: { tab: LibraryTab; label: string }[] = [
  { tab: 'data', label: 'Data' },
  { tab: 'tools', label: 'Tools' },
  { tab: 'skills', label: 'Skills' },
];

export function LibraryView(): React.JSX.Element | null {
  const fleet = useFleetStore(selectActiveFleet);
  const tab = useUiStore((s) => s.libraryTab);
  const setLibraryTab = useUiStore((s) => s.setLibraryTab);

  /**
   * Filters are view state and deliberately local: they scope what is on screen
   * and have no business in the undo history or the saved document (SPEC §2).
   */
  const [query, setQuery] = useState<DataQuery>(ANY_DATA);
  const [search, setSearch] = useState('');
  const [toolType, setToolType] = useState<ToolType | null>(null);

  if (!fleet) return null;

  const counts: Record<LibraryTab, number> = {
    data: fleet.dataSources.length,
    tools: fleet.tools.length,
    skills: fleet.skills.length,
  };

  return (
    <div className="dataview" data-testid="library-view" data-tab={tab}>
      <header className="dataview-head">
        <div className="glass-bar dataview-modes">
          {TABS.map((entry) => (
            <button
              key={entry.tab}
              type="button"
              className={`chrome-btn ${tab === entry.tab ? 'on' : ''}`}
              data-testid={`library-tab-${entry.tab}`}
              onClick={() => setLibraryTab(entry.tab)}
            >
              {entry.label} {counts[entry.tab]}
            </button>
          ))}
        </div>

        <div className="dataview-meta">
          {tab === 'data' && (
            <>
              <BriefingButton fleet={fleet} query={query} />
              <SourceKinds />
              <FolderImport />
            </>
          )}
        </div>
      </header>

      {tab === 'data' ? (
        <DataFilters fleet={fleet} query={query} onChange={setQuery} idPrefix="library" />
      ) : (
        <div className="datafilters" data-testid="library-filter">
          <div className="lib-filter">
            <label htmlFor="library-search">Search</label>
            <input
              id="library-search"
              value={search}
              placeholder={tab === 'tools' ? 'Name or description' : 'Name or description'}
              data-testid="library-search"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {/* A tool's only axis is its type; a skill has none, so it gets none. */}
          {tab === 'tools' && (
            <div className="lib-filter">
              <label htmlFor="library-tool-type">Type</label>
              <select
                id="library-tool-type"
                value={toolType ?? ''}
                data-testid="library-tool-type"
                onChange={(event) =>
                  setToolType(event.target.value === '' ? null : (event.target.value as ToolType))
                }
              >
                <option value="">Any type</option>
                {TOOL_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {TOOL_TYPE_LABEL[option]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {search !== '' && (
            <button
              type="button"
              className="lib-filter-clear"
              onClick={() => setSearch('')}
              aria-label="Clear the search"
            >
              ✕
            </button>
          )}
        </div>
      )}

      <div className="dataview-body">
        {tab === 'data' && <DataPane fleet={fleet} query={query} />}
        {tab === 'tools' && <ToolsPane fleet={fleet} search={search} type={toolType} />}
        {tab === 'skills' && <SkillsPane fleet={fleet} search={search} />}
      </div>
    </div>
  );
}
