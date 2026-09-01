/**
 * Application shell. One store, many renderers (SPEC 2.1): the board is a
 * subscriber, the chrome is a subscriber, nothing here owns fleet data.
 */
import { useEffect, useRef, useState } from 'react';
import { Board } from './views/board2d/Board.js';
import { Breadcrumb } from './views/chrome/Breadcrumb.js';
import { FilterBar } from './views/chrome/FilterBar.js';
import { TopBar } from './views/chrome/TopBar.js';
import { hydrateFleetStore, useFleetStore } from './store/fleetStore.js';
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
      hydrateFleetStore({ fleets: loaded.fleets, activeFleetId: loaded.activeFleetId });

      if (loaded.fleets.length === 0) {
        // First run opens the Solarlux example so the board is never empty on
        // arrival; SPEC 5.11 keeps it a loadable example, not a hidden default.
        hydrateFleetStore({ fleets: [solarluxFleet()], activeFleetId: solarluxFleet().id });
      }

      handle = attachPersistence(useFleetStore, repository);
      setReady(true);
    })();

    return () => handle?.stop();
  }, []);

  return ready;
}

export function App(): React.JSX.Element {
  const ready = useBootstrap();

  if (!ready) {
    return <main className="grid h-full place-items-center text-sm text-white/50">Loading fleet…</main>;
  }

  return (
    <main className="relative h-full w-full overflow-hidden">
      <Board />
      <TopBar />
      <FilterBar />
      <Breadcrumb />
    </main>
  );
}
