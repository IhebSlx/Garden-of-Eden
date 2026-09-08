/**
 * Choosing what to export.
 *
 * Export used to write whichever fleet happened to be open, which made it a way
 * to share one fleet but not a way to back the app up: a second fleet, and the
 * catalog, were simply not in the file. Tick what you want instead — one fleet,
 * several, all of them, and the catalog beside them.
 *
 * The catalog is listed separately because it is the only thing here that is not
 * inside a fleet. A fleet's own Data, Tools and Skills travel within it (SPEC §7:
 * a fleet document is self-contained), and the dialog says so, because "I ticked
 * the fleet, did I get its data?" is the question this screen exists to answer.
 */
import { useState } from 'react';
import type { Catalog } from '../../model/catalog.js';
import type { Fleet } from '../../model/schemas.js';

export type ExportChoice = { fleetIds: string[]; catalog: boolean };

/** What the catalog holds, in the terms the Catalog screen uses. */
function describeCatalog(catalog: Catalog): string {
  const parts: string[] = [];
  if (catalog.agents.length > 0) {
    parts.push(`${catalog.agents.length} ${catalog.agents.length === 1 ? 'agent' : 'agents'}`);
  }
  const items = catalog.skills.length + catalog.tools.length + catalog.dataSources.length;
  if (items > 0) parts.push(`${items} library ${items === 1 ? 'item' : 'items'}`);
  if (catalog.documents.length > 0) {
    parts.push(
      `${catalog.documents.length} imported ${catalog.documents.length === 1 ? 'file' : 'files'}`,
    );
  }
  return parts.length === 0 ? 'Nothing in it yet' : parts.join(' · ');
}

export function ExportDialog({
  fleets,
  activeFleetId,
  catalog,
  onExport,
  onCancel,
}: {
  fleets: Fleet[];
  activeFleetId: string | null;
  catalog: Catalog;
  onExport: (choice: ExportChoice) => void;
  onCancel: () => void;
}): React.JSX.Element {
  // Opens on what you were looking at, so the old one-click export is still one
  // click away.
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(activeFleetId === null ? [] : [activeFleetId]),
  );
  const [withCatalog, setWithCatalog] = useState(false);

  const toggle = (id: string): void =>
    setChosen((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allChosen = fleets.length > 0 && fleets.every((fleet) => chosen.has(fleet.id));
  const everything = allChosen && withCatalog;
  const nothing = chosen.size === 0 && !withCatalog;

  const takeEverything = (): void => {
    setChosen(new Set(fleets.map((fleet) => fleet.id)));
    setWithCatalog(true);
  };

  return (
    <div className="dialog-scrim" role="dialog" aria-label="Export" data-testid="export-dialog">
      <div className="dialog">
        <h2>Export</h2>
        <p className="dialog-lead">
          Tick what to save. A fleet brings its own Data, Tools and Skills with it — those are part
          of the fleet, not a separate thing to choose.
        </p>

        <div className="export-group">
          <div className="export-grouphead">
            <span>Fleets</span>
            <button
              type="button"
              className="chrome-btn"
              data-testid="export-all"
              disabled={everything}
              onClick={takeEverything}
            >
              Select everything
            </button>
          </div>

          {fleets.map((fleet) => (
            <label key={fleet.id} className="export-row">
              <input
                type="checkbox"
                checked={chosen.has(fleet.id)}
                data-testid={`export-fleet-${fleet.id}`}
                onChange={() => toggle(fleet.id)}
              />
              <span className="export-name">{fleet.name}</span>
              <small>
                {fleet.agents.length} {fleet.agents.length === 1 ? 'agent' : 'agents'} ·{' '}
                {fleet.skills.length + fleet.tools.length + fleet.dataSources.length} library items
              </small>
            </label>
          ))}
        </div>

        <div className="export-group">
          <div className="export-grouphead">
            <span>Beside the fleets</span>
          </div>
          <label className="export-row">
            <input
              type="checkbox"
              checked={withCatalog}
              data-testid="export-catalog"
              onChange={(event) => setWithCatalog(event.target.checked)}
            />
            <span className="export-name">Catalog</span>
            <small>{describeCatalog(catalog)}</small>
          </label>
          <p className="export-hint">
            Agents and library items kept outside any fleet, plus the Copilot Studio files you
            imported — kept exactly as uploaded. Nothing else saves these.
          </p>
        </div>

        {nothing && (
          <p className="export-hint" data-testid="export-nothing">
            Nothing ticked, so there is nothing to write.
          </p>
        )}

        <div className="dialog-row">
          <button
            type="button"
            className="btn"
            disabled={nothing}
            data-testid="export-confirm"
            onClick={() => onExport({ fleetIds: [...chosen], catalog: withCatalog })}
          >
            {everything ? 'Export everything' : 'Export'}
          </button>
          <button type="button" className="btn ghost" data-testid="export-cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
