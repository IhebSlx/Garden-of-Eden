/**
 * Phase 0 shell.
 *
 * Phase 0 delivers the foundation, not the board: this screen exists so the store,
 * IndexedDB autosave, JSON export/import, undo/redo and the derived selectors are
 * exercised by a real UI rather than only by tests. Phase 1 replaces it with the
 * React Flow board (SPEC 9); every control here is wired to a working action.
 */
import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { checkFleetIntegrity } from './model/integrity.js';
import { instances, isShared } from './model/selectors.js';
import type { Fleet } from './model/schemas.js';
import {
  hydrateFleetStore,
  redo,
  selectActiveFleet,
  selectFleetList,
  undo,
  useFleetStore,
} from './store/fleetStore.js';
import { exportFleetToJson, suggestFleetFileName } from './store/io.js';
import { attachPersistence, createIndexedDbRepository } from './store/persistence.js';

type Notice = { tone: 'ok' | 'error'; text: string };

function downloadFleet(fleet: Fleet): void {
  const blob = new Blob([exportFleetToJson(fleet)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = suggestFleetFileName(fleet);
  anchor.click();
  URL.revokeObjectURL(url);
}

function useBootstrap(): { ready: boolean; loadErrors: string[] } {
  const [ready, setReady] = useState(false);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const repository = createIndexedDbRepository();
    let handle: { stop: () => void } | undefined;

    void (async () => {
      const loaded = await repository.loadAll();
      hydrateFleetStore({ fleets: loaded.fleets, activeFleetId: loaded.activeFleetId });

      // First run: start from the Blank template (SPEC 5.11).
      if (loaded.fleets.length === 0) useFleetStore.getState().createFleet('blank', 'My fleet');

      handle = attachPersistence(useFleetStore, repository);
      setLoadErrors(loaded.errors);
      setReady(true);
    })();

    return () => handle?.stop();
  }, []);

  return { ready, loadErrors };
}

function Stat({ label, value }: { label: string; value: string | number }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-white/8 bg-[var(--glass-fill)] px-4 py-3 backdrop-blur">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs tracking-wide text-white/50 uppercase">{label}</div>
    </div>
  );
}

function Button({
  onClick,
  children,
  disabled = false,
}: {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-white/12 bg-white/5 px-3 py-1.5 text-sm text-white/85 transition hover:border-white/25 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  );
}

export function App(): React.JSX.Element {
  const { ready, loadErrors } = useBootstrap();
  const [notice, setNotice] = useState<Notice | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const fleet = useFleetStore(selectActiveFleet);
  // selectFleetList builds a new array each call, so it needs a shallow equality
  // check - a raw selector would fail useSyncExternalStore's snapshot caching.
  const fleetList = useFleetStore(useShallow(selectFleetList));
  const createFleet = useFleetStore((s) => s.createFleet);
  const setActiveFleet = useFleetStore((s) => s.setActiveFleet);
  const importFleetFromJson = useFleetStore((s) => s.importFleetFromJson);

  const pastCount = useStore(useFleetStore.temporal, (s) => s.pastStates.length);
  const futureCount = useStore(useFleetStore.temporal, (s) => s.futureStates.length);

  const handleImport = async (file: File): Promise<void> => {
    const result = importFleetFromJson(await file.text());
    setNotice(
      result.ok
        ? { tone: 'ok', text: `Imported "${file.name}".` }
        : { tone: 'error', text: result.errors.join(' · ') },
    );
  };

  if (!ready) {
    return (
      <main className="grid h-full place-items-center text-sm text-white/50">Loading fleets…</main>
    );
  }

  const issues = fleet ? checkFleetIntegrity(fleet) : [];
  const sharedAgents = fleet ? fleet.agents.filter((a) => isShared(fleet, a.id)) : [];

  return (
    <main className="mx-auto flex h-full max-w-4xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Agent Fleet Studio</h1>
        <p className="mt-1 text-sm text-white/45">
          Phase 0 foundation — store, selectors, persistence and versioned JSON. The 2D board
          arrives in Phase 1.
        </p>
      </header>

      <section className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-white/55" htmlFor="fleet-select">
          Fleet
        </label>
        <select
          id="fleet-select"
          value={fleet?.id ?? ''}
          onChange={(event) => setActiveFleet(event.target.value)}
          className="rounded-md border border-white/12 bg-white/5 px-2 py-1.5 text-sm"
        >
          {fleetList.map((entry) => (
            <option key={entry.id} value={entry.id} className="bg-[#0d1330]">
              {entry.name}
            </option>
          ))}
        </select>
        <Button onClick={() => createFleet('blank')}>New blank</Button>
        <Button onClick={() => createFleet('company')}>New company fleet</Button>
      </section>

      {fleet ? (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Agents" value={fleet.agents.length} />
            <Stat label="Links" value={fleet.edges.length} />
            <Stat label="Instances" value={instances(fleet).length} />
            <Stat label="Shared" value={sharedAgents.length} />
            <Stat label="Skills" value={fleet.skills.length} />
            <Stat label="Tools" value={fleet.tools.length} />
          </section>

          <section className="flex flex-wrap gap-2">
            <Button onClick={() => downloadFleet(fleet)}>Export JSON</Button>
            <Button onClick={() => fileInput.current?.click()}>Import JSON</Button>
            <Button onClick={() => undo()} disabled={pastCount === 0}>
              Undo ({pastCount})
            </Button>
            <Button onClick={() => redo()} disabled={futureCount === 0}>
              Redo ({futureCount})
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void handleImport(file);
              }}
            />
          </section>

          <section className="rounded-lg border border-white/8 bg-[var(--glass-fill)] p-4 text-sm backdrop-blur">
            <h2 className="mb-2 text-xs tracking-wide text-white/45 uppercase">Integrity (SPEC §4)</h2>
            {issues.length === 0 ? (
              <p className="text-[color:var(--color-status-live)]">No issues.</p>
            ) : (
              <ul className="list-inside list-disc space-y-1 text-[color:var(--color-status-building)]">
                {issues.map((issue) => (
                  <li key={`${issue.code}-${issue.path.join('.')}`}>{issue.message}</li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <p className="text-sm text-white/55">No fleet selected. Create one above to begin.</p>
      )}

      {loadErrors.length > 0 && (
        <section className="rounded-lg border border-[color:var(--color-status-building)]/30 p-4 text-sm">
          <h2 className="mb-2 text-xs tracking-wide text-white/45 uppercase">Load warnings</h2>
          <ul className="list-inside list-disc space-y-1">
            {loadErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </section>
      )}

      {notice && (
        <p
          role="status"
          className={
            notice.tone === 'ok'
              ? 'text-sm text-[color:var(--color-status-live)]'
              : 'text-sm text-[color:var(--color-status-building)]'
          }
        >
          {notice.text}
        </p>
      )}
    </main>
  );
}
