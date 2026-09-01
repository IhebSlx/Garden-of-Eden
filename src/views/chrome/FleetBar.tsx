/**
 * SPEC 5.11 - fleet switcher: create, rename, duplicate, delete (with confirm),
 * plus SPEC 7 export/import and SPEC 8.1 undo/redo.
 *
 * The Solarlux demo ships here as a loadable example rather than a default.
 */
import { useRef, useState } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import {
  redo,
  selectActiveFleet,
  selectFleetList,
  undo,
  useFleetStore,
} from '../../store/fleetStore.js';
import { useUiStore } from '../../store/uiStore.js';
import { exportFleetToJson, suggestFleetFileName } from '../../store/io.js';
import { solarluxFleet } from '../../model/seed.js';
import { FLEET_TEMPLATE_LABELS } from '../../model/templates.js';
import type { Fleet } from '../../model/schemas.js';

function download(fleet: Fleet): void {
  const blob = new Blob([exportFleetToJson(fleet)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = suggestFleetFileName(fleet);
  anchor.click();
  URL.revokeObjectURL(url);
}

export function FleetBar(): React.JSX.Element {
  const fleet = useFleetStore(selectActiveFleet);
  const fleets = useFleetStore(useShallow(selectFleetList));
  const createFleet = useFleetStore((s) => s.createFleet);
  const setActiveFleet = useFleetStore((s) => s.setActiveFleet);
  const renameFleet = useFleetStore((s) => s.renameFleet);
  const duplicateFleet = useFleetStore((s) => s.duplicateFleet);
  const deleteFleet = useFleetStore((s) => s.deleteFleet);
  const importFleetFromJson = useFleetStore((s) => s.importFleetFromJson);
  const importFleet = useFleetStore((s) => s.importFleetObject);
  const resetForFleet = useUiStore((s) => s.resetForFleet);
  const openLibrary = useUiStore((s) => s.openLibrary);

  const pastCount = useStore(useFleetStore.temporal, (s) => s.pastStates.length);
  const futureCount = useStore(useFleetStore.temporal, (s) => s.futureStates.length);

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const switchTo = (id: string): void => {
    setActiveFleet(id);
    resetForFleet();
    setMenuOpen(false);
  };

  return (
    <div className="fleetbar" data-testid="fleet-bar">
      <div className="glass-bar flex items-center gap-0.5">
        <button
          type="button"
          className="chrome-btn"
          onClick={() => setMenuOpen((open) => !open)}
          data-testid="fleet-menu-toggle"
          aria-expanded={menuOpen}
        >
          {fleet?.name ?? 'No fleet'} ▾
        </button>
        <span className="chrome-div" />
        <button
          type="button"
          className="chrome-btn"
          onClick={() => undo()}
          disabled={pastCount === 0}
          title="Undo (Ctrl+Z)"
          data-testid="undo"
        >
          ↶
        </button>
        <button
          type="button"
          className="chrome-btn"
          onClick={() => redo()}
          disabled={futureCount === 0}
          title="Redo (Ctrl+Y)"
          data-testid="redo"
        >
          ↷
        </button>
      </div>

      {menuOpen && (
        <div className="fleetmenu" data-testid="fleet-menu">
          <div className="fleetmenu-section">Fleets</div>
          {fleets.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`fleetmenu-row ${entry.id === fleet?.id ? 'on' : ''}`}
              onClick={() => switchTo(entry.id)}
            >
              {entry.name}
              <small>{entry.agents.length} agents</small>
            </button>
          ))}

          <div className="fleetmenu-section">New</div>
          <button
            type="button"
            className="fleetmenu-row"
            onClick={() => {
              createFleet('blank');
              resetForFleet();
              setMenuOpen(false);
            }}
          >
            {FLEET_TEMPLATE_LABELS.blank}
            <small>orchestrator only</small>
          </button>
          <button
            type="button"
            className="fleetmenu-row"
            data-testid="new-company-fleet"
            onClick={() => {
              createFleet('company');
              resetForFleet();
              setMenuOpen(false);
            }}
          >
            {FLEET_TEMPLATE_LABELS.company}
            <small>+ four departments</small>
          </button>
          <button
            type="button"
            className="fleetmenu-row"
            data-testid="load-example"
            onClick={() => {
              const result = importFleet(solarluxFleet());
              if (!result.ok) setNotice(result.errors.join(' · '));
              resetForFleet();
              setMenuOpen(false);
            }}
          >
            Solarlux example
            <small>demo fleet</small>
          </button>

          {fleet && (
            <>
              <div className="fleetmenu-section">This fleet</div>
              <input
                className="fleetmenu-input"
                defaultValue={fleet.name}
                key={fleet.id}
                aria-label="Fleet name"
                data-testid="fleet-rename"
                onBlur={(event) => {
                  const result = renameFleet(fleet.id, event.target.value);
                  if (!result.ok) {
                    setNotice(result.reason);
                    event.target.value = fleet.name;
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
              <button
                type="button"
                className="fleetmenu-row"
                onClick={() => {
                  duplicateFleet(fleet.id);
                  resetForFleet();
                  setMenuOpen(false);
                }}
              >
                Duplicate
              </button>
              <button type="button" className="fleetmenu-row" onClick={() => openLibrary()}>
                Libraries…
                <small>
                  {fleet.skills.length + fleet.tools.length + fleet.dataSources.length} items
                </small>
              </button>
              <button type="button" className="fleetmenu-row" onClick={() => download(fleet)}>
                Export JSON
              </button>
              <button type="button" className="fleetmenu-row" onClick={() => fileInput.current?.click()}>
                Import JSON…
              </button>
              {confirmDelete ? (
                <div className="fleetmenu-confirm">
                  <span>Delete “{fleet.name}”?</span>
                  <button
                    type="button"
                    onClick={() => {
                      deleteFleet(fleet.id);
                      resetForFleet();
                      setConfirmDelete(false);
                      setMenuOpen(false);
                    }}
                  >
                    Delete
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="fleetmenu-row danger"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete fleet
                </button>
              )}
            </>
          )}

          {notice && <div className="fleetmenu-notice">{notice}</div>}
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          void file.text().then((text) => {
            const result = importFleetFromJson(text);
            setNotice(result.ok ? null : result.errors.join(' · '));
            if (result.ok) {
              resetForFleet();
              setMenuOpen(false);
            }
          });
        }}
      />
    </div>
  );
}
