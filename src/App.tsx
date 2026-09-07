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
import { ShortcutsHelp } from './views/chrome/ShortcutsHelp.js';
import { TopBar } from './views/chrome/TopBar.js';
import { Inspector } from './panel/Inspector.js';
import { EdgeInspector } from './panel/EdgeInspector.js';
import { CatalogManager } from './panel/CatalogManager.js';
import { LinkKindDialog } from './views/dialogs/LinkKindDialog.js';
import { hydrateFleetStore, selectActiveFleet, useFleetStore } from './store/fleetStore.js';
import { solarluxFleet } from './model/seed.js';
import { solarluxVisionFleet } from './model/visionFleet.js';
import { attachPersistence, createIndexedDbRepository } from './store/persistence.js';
import { useCatalogStore } from './store/catalogStore.js';
import { useUiStore } from './store/uiStore.js';

type Bootstrap = {
  ready: boolean;
  /** A save failed - the user is editing something that is not being persisted. */
  storageError: string | null;
  /** Another tab saved a fleet this tab also has open. */
  changedElsewhere: boolean;
  dismissStorageError: () => void;
};

function useBootstrap(): Bootstrap {
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [changedElsewhere, setChangedElsewhere] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const repository = createIndexedDbRepository();
    let handle: { stop: () => void } | undefined;
    let catalogStop: (() => void) | undefined;

    void (async () => {
      const loaded = await repository.loadAll();
      useCatalogStore.getState().hydrate(await repository.loadCatalog());

      // First run opens the Solarlux Vision fleet: it is the architecture this app
      // exists to show, so a fresh install - a new machine, a colleague's browser -
      // lands on the real thing rather than on the feature demo. SPEC 5.11 keeps both
      // loadable examples: seeded once, then editable and replaceable like any fleet.
      const fleets = loaded.fleets.length > 0 ? loaded.fleets : [solarluxVisionFleet()];
      const activeFleetId = loaded.fleets.length > 0 ? loaded.activeFleetId : (fleets[0]?.id ?? null);

      hydrateFleetStore({ fleets, activeFleetId });
      // The catalog saves on its own schedule: it is not fleet data and must not
      // ride along in the fleet's undo history or exported document.
      catalogStop = useCatalogStore.subscribe((state, previous) => {
        if (state.catalog === previous.catalog) return;
        void repository.saveCatalog(state.catalog).catch((cause: unknown) => {
          console.error(cause);
          setStorageError('The catalog could not be saved. Export anything you cannot lose.');
        });
      });

      handle = attachPersistence(useFleetStore, repository, {
        onError: (error) => {
          console.error(error.cause);
          setStorageError(error.message);
        },
        onExternalChange: () => setChangedElsewhere(true),
      });
      setReady(true);
    })();

    return () => {
      handle?.stop();
      catalogStop?.();
    };
  }, []);

  return {
    ready,
    storageError,
    changedElsewhere,
    dismissStorageError: () => setStorageError(null),
  };
}

/** SPEC 5.11 + Phase 3: what the board says when there is nothing to draw. */
function EmptyState(): React.JSX.Element {
  const createFleet = useFleetStore((s) => s.createFleet);
  const importFleet = useFleetStore((s) => s.importFleetObject);

  return (
    <div className="empty-state" data-testid="empty-state">
      <h1>No fleet open</h1>
      <p>Start from a template, or load the Solarlux architecture to see a full fleet.</p>
      <div className="empty-actions">
        <button type="button" className="btn" onClick={() => createFleet('company')}>
          Company fleet
        </button>
        <button type="button" className="btn ghost" onClick={() => createFleet('blank')}>
          Blank
        </button>
        <button type="button" className="btn ghost" onClick={() => importFleet(solarluxVisionFleet())}>
          Solarlux Vision
        </button>
        <button type="button" className="btn ghost" onClick={() => importFleet(solarluxFleet())}>
          Solarlux example
        </button>
      </div>
    </div>
  );
}

export function App(): React.JSX.Element {
  const { ready, storageError, changedElsewhere, dismissStorageError } = useBootstrap();
  const fleet = useFleetStore(selectActiveFleet);
  const view = useUiStore((s) => s.view);

  if (!ready) {
    return <main className="grid h-full place-items-center text-sm text-white/50">Loading fleet…</main>;
  }

  return (
    <main className="relative h-full w-full overflow-hidden">
      {fleet ? <ViewSwitch /> : <EmptyState />}
      <TopBar />
      <FleetBar />
      {view !== 'library' && <FilterBar />}
      {view !== 'library' && <SearchBox />}
      {view !== 'library' && <Breadcrumb />}
      <Inspector />
      <EdgeInspector />
      <LinkKindDialog />
      <CatalogManager />
      {view !== 'library' && <Hint />}
      <ShortcutsHelp />
      <Shortcuts />

      {storageError && (
        <div className="appbanner" role="alert" data-testid="storage-error">
          <span>{storageError}</span>
          <button type="button" onClick={dismissStorageError}>
            Dismiss
          </button>
        </div>
      )}

      {!storageError && changedElsewhere && (
        <div className="appbanner info" role="status" data-testid="changed-elsewhere">
          <span>
            This fleet was also edited in another tab. Reload to pick up those changes - otherwise
            whichever tab saves last wins.
          </span>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      )}
    </main>
  );
}
