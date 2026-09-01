/**
 * SPEC 7 - "Autosave to IndexedDB on every mutation (debounced). Multiple named fleets."
 *
 * The repository is an interface so the store can be tested against an in-memory
 * implementation, and so a future backend (backlog) is a drop-in.
 */
import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import { migrateFleetDocument } from '../model/migrations.js';
import type { Fleet } from '../model/schemas.js';

export const DB_NAME = 'agent-fleet-studio';
export const DB_VERSION = 1;

const FLEET_STORE = 'fleets';
const META_STORE = 'meta';
const ACTIVE_FLEET_KEY = 'activeFleetId';

interface FleetDb extends DBSchema {
  [FLEET_STORE]: { key: string; value: Fleet };
  [META_STORE]: { key: string; value: unknown };
}

export type LoadedState = {
  fleets: Fleet[];
  activeFleetId: string | null;
  /** Documents that failed validation on load, reported rather than silently dropped. */
  errors: string[];
};

export interface FleetRepository {
  loadAll(): Promise<LoadedState>;
  saveFleet(fleet: Fleet): Promise<void>;
  deleteFleet(fleetId: string): Promise<void>;
  setActiveFleetId(fleetId: string | null): Promise<void>;
  clear(): Promise<void>;
}

function openFleetDb(): Promise<IDBPDatabase<FleetDb>> {
  return openDB<FleetDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(FLEET_STORE)) {
        db.createObjectStore(FLEET_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    },
  });
}

export function createIndexedDbRepository(): FleetRepository {
  let dbPromise: Promise<IDBPDatabase<FleetDb>> | undefined;
  const db = (): Promise<IDBPDatabase<FleetDb>> => (dbPromise ??= openFleetDb());

  return {
    async loadAll(): Promise<LoadedState> {
      const database = await db();
      const stored = await database.getAll(FLEET_STORE);
      const rawActive = await database.get(META_STORE, ACTIVE_FLEET_KEY);

      const fleets: Fleet[] = [];
      const errors: string[] = [];

      for (const candidate of stored) {
        // Stored documents are re-validated: a schema change or hand-edited DB
        // must not put a broken fleet into the store.
        const result = migrateFleetDocument(candidate);
        if (result.ok) {
          fleets.push(result.fleet);
        } else {
          const label =
            typeof candidate === 'object' && candidate !== null && 'id' in candidate
              ? String((candidate as { id: unknown }).id)
              : 'unknown';
          errors.push(`Stored fleet "${label}" could not be loaded: ${result.errors.join('; ')}`);
        }
      }

      const activeFleetId =
        typeof rawActive === 'string' && fleets.some((f) => f.id === rawActive) ? rawActive : null;

      return { fleets, activeFleetId, errors };
    },

    async saveFleet(fleet: Fleet): Promise<void> {
      const database = await db();
      await database.put(FLEET_STORE, fleet);
    },

    async deleteFleet(fleetId: string): Promise<void> {
      const database = await db();
      await database.delete(FLEET_STORE, fleetId);
    },

    async setActiveFleetId(fleetId: string | null): Promise<void> {
      const database = await db();
      if (fleetId === null) await database.delete(META_STORE, ACTIVE_FLEET_KEY);
      else await database.put(META_STORE, fleetId, ACTIVE_FLEET_KEY);
    },

    async clear(): Promise<void> {
      const database = await db();
      await database.clear(FLEET_STORE);
      await database.clear(META_STORE);
    },
  };
}

/** In-memory stand-in used by unit tests and by any environment without IndexedDB. */
export function createMemoryRepository(initial: LoadedState = { fleets: [], activeFleetId: null, errors: [] }): FleetRepository {
  const fleets = new Map<string, Fleet>(initial.fleets.map((f) => [f.id, f]));
  let activeFleetId = initial.activeFleetId;

  return {
    loadAll: () => Promise.resolve({ fleets: [...fleets.values()], activeFleetId, errors: [] }),
    saveFleet: (fleet) => {
      fleets.set(fleet.id, fleet);
      return Promise.resolve();
    },
    deleteFleet: (fleetId) => {
      fleets.delete(fleetId);
      return Promise.resolve();
    },
    setActiveFleetId: (fleetId) => {
      activeFleetId = fleetId;
      return Promise.resolve();
    },
    clear: () => {
      fleets.clear();
      activeFleetId = null;
      return Promise.resolve();
    },
  };
}

export type PersistenceSnapshot = {
  fleets: Record<string, Fleet>;
  activeFleetId: string | null;
};

export type PersistenceHandle = {
  /** Write everything still pending right now (tests, and beforeunload). */
  flush: () => Promise<void>;
  stop: () => void;
};

type Subscribable<T> = {
  getState: () => T;
  subscribe: (listener: (state: T, previous: T) => void) => () => void;
};

/**
 * Mirror store mutations into the repository. Only fleets whose object identity
 * changed are written, so an unrelated mutation never rewrites the whole database.
 */
export function attachPersistence(
  store: Subscribable<PersistenceSnapshot>,
  repository: FleetRepository,
  options: { debounceMs?: number } = {},
): PersistenceHandle {
  const debounceMs = options.debounceMs ?? 300;

  const dirtyFleetIds = new Set<string>();
  const deletedFleetIds = new Set<string>();
  let activeFleetDirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> = Promise.resolve();

  const write = async (): Promise<void> => {
    const { fleets, activeFleetId } = store.getState();

    const toDelete = [...deletedFleetIds];
    const toSave = [...dirtyFleetIds];
    const saveActive = activeFleetDirty;
    deletedFleetIds.clear();
    dirtyFleetIds.clear();
    activeFleetDirty = false;

    for (const fleetId of toDelete) await repository.deleteFleet(fleetId);
    for (const fleetId of toSave) {
      const fleet = fleets[fleetId];
      if (fleet) await repository.saveFleet(fleet);
    }
    if (saveActive) await repository.setActiveFleetId(activeFleetId);
  };

  const schedule = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      inFlight = inFlight.then(write);
    }, debounceMs);
  };

  const unsubscribe = store.subscribe((state, previous) => {
    for (const [fleetId, fleet] of Object.entries(state.fleets)) {
      if (previous.fleets[fleetId] !== fleet) dirtyFleetIds.add(fleetId);
    }
    for (const fleetId of Object.keys(previous.fleets)) {
      if (!(fleetId in state.fleets)) {
        deletedFleetIds.add(fleetId);
        dirtyFleetIds.delete(fleetId);
      }
    }
    if (state.activeFleetId !== previous.activeFleetId) activeFleetDirty = true;

    if (dirtyFleetIds.size > 0 || deletedFleetIds.size > 0 || activeFleetDirty) schedule();
  });

  return {
    flush: async () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      inFlight = inFlight.then(write);
      await inFlight;
    },
    stop: () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      unsubscribe();
    },
  };
}
