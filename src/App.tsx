/**
 * Application shell. One store, many renderers (SPEC 2.1): the board is a
 * subscriber, the chrome is a subscriber, nothing here owns fleet data.
 */
import { useEffect, useRef, useState } from 'react';
import { ViewSwitch } from './views/ViewSwitch.js';
import { Breadcrumb } from './views/chrome/Breadcrumb.js';
import { FilterBar } from './views/chrome/FilterBar.js';
import { FleetBar } from './views/chrome/FleetBar.js';
import { Hint } from './views/chrome/Hint.js';
import { SearchBox } from './views/chrome/SearchBox.js';
import { Shortcuts } from './views/chrome/Shortcuts.js';
import { TopBar } from './views/chrome/TopBar.js';
import { Inspector } from './panel/Inspector.js';
import { EdgeInspector } from './panel/EdgeInspector.js';
import { LibraryManager } from './panel/LibraryManager.js';
import { LinkKindDialog } from './views/dialogs/LinkKindDialog.js';
import { hydrateFleetStore, selectActiveFleet, useFleetStore } from './store/fleetStore.js';
import { solarluxFleet } from './model/seed.js';
import { attachPersistence, createIndexedDbRepository } from './store/persistence.js';

function useBootstrap(): boolean {
  const [ready, setReady] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const repository = createIndexedDbRepository();
    let handle: { stop: () => void } | undefined;

    void (async () => {
      const loaded = await repository.loadAll();

      // First run opens the Solarlux example so the board is never empty on arrival.
      // SPEC 5.11 keeps it a loadable example: it is seeded once, then editable and
      // replaceable like any other fleet.
      const fleets = loaded.fleets.length > 0 ? loaded.fleets : [solarluxFleet()];
      const activeFleetId = loaded.fleets.length > 0 ? loaded.activeFleetId : (fleets[0]?.id ?? null);

      hydrateFleetStore({ fleets, activeFleetId });
      handle = attachPersistence(useFleetStore, repository);
      setReady(true);
    })();

    return () => handle?.stop();
  }, []);

  return ready;
}

/** SPEC 5.11 + Phase 3: what the board says when there is nothing to draw. */
function EmptyState(): React.JSX.Element {
  const createFleet = useFleetStore((s) => s.createFleet);
  const importFleet = useFleetStore((s) => s.importFleetObject);

  return (
    <div className="empty-state" data-testid="empty-state">
      <h1>No fleet open</h1>
      <p>Start from a template, or load the Solarlux example to see a full fleet.</p>
      <div className="empty-actions">
        <button type="button" className="btn" onClick={() => createFleet('company')}>
          Company fleet
        </button>
        <button type="button" className="btn ghost" onClick={() => createFleet('blank')}>
          Blank
        </button>
        <button type="button" className="btn ghost" onClick={() => importFleet(solarluxFleet())}>
          Solarlux example
        </button>
      </div>
    </div>
  );
}

export function App(): React.JSX.Element {
  const ready = useBootstrap();
  const fleet = useFleetStore(selectActiveFleet);

  if (!ready) {
    return <main className="grid h-full place-items-center text-sm text-white/50">Loading fleet…</main>;
  }

  return (
    <main className="relative h-full w-full overflow-hidden">
      {fleet ? <ViewSwitch /> : <EmptyState />}
      <TopBar />
      <FleetBar />
      <FilterBar />
      <SearchBox />
      <Breadcrumb />
      <Inspector />
      <EdgeInspector />
      <LinkKindDialog />
      <LibraryManager />
      <Hint />
      <Shortcuts />
    </main>
  );
}
