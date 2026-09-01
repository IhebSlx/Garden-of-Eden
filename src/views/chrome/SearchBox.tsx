/**
 * SPEC 5.10 - always-visible search. Results show the match reason, arrow keys
 * move the highlight, and picking one focuses + opens the agent with a click burst.
 */
import { useMemo, useState } from 'react';
import { selectActiveFleet, useFleetStore } from '../../store/fleetStore.js';
import { useUiStore } from '../../store/uiStore.js';
import { buildSearchIndex, MATCH_LABEL, searchFleet } from '../../search/index.js';
import { STATUS_LABELS } from '../../model/schemas.js';
import { KIND_COLOR } from '../../ui/palette.js';

export function SearchBox(): React.JSX.Element {
  const fleet = useFleetStore(selectActiveFleet);
  const query = useUiStore((s) => s.searchQuery);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);
  const activate = useUiStore((s) => s.activate);

  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);

  const index = useMemo(() => (fleet ? buildSearchIndex(fleet) : null), [fleet]);
  const results = useMemo(
    () => (index && query.trim() !== '' ? searchFleet(index, query) : []),
    [index, query],
  );

  const pick = (position: number): void => {
    const result = results[position];
    if (!result) return;
    setOpen(false);
    activate(result.agent.id);
  };

  return (
    <div className="fixed top-[90px] left-4 z-30 w-[238px]" data-testid="search">
      <input
        className="searchinput"
        value={query}
        placeholder="Search agents, skills, tools…"
        autoComplete="off"
        aria-label="Search the fleet"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(event) => {
          setSearchQuery(event.target.value);
          setHighlight(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            pick(highlight);
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (results.length === 0) return;
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setHighlight((current) => (current + step + results.length) % results.length);
          } else if (event.key === 'Escape') {
            // Do not let Escape also exit focus while the user is searching.
            event.stopPropagation();
            setOpen(false);
            event.currentTarget.blur();
          }
        }}
      />

      {open && results.length > 0 && (
        <div className="sres" data-testid="search-results">
          {results.map((result, position) => (
            <button
              key={result.agent.id}
              type="button"
              className={`srow ${position === highlight ? 'hl' : ''}`}
              onMouseEnter={() => setHighlight(position)}
              onPointerDown={(event) => {
                event.preventDefault();
                pick(position);
              }}
            >
              <span className="sd" style={{ background: KIND_COLOR[result.agent.kind] }} />
              {result.agent.name}
              <small>
                {MATCH_LABEL[result.field]} · {STATUS_LABELS[result.agent.status]}
              </small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
