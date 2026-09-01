/**
 * SPEC 7 - "Autosave to IndexedDB on every mutation (debounced). Multiple named fleets."
 *
 * The repository is an interface so the store can be tested against an in-memory
 * implementation, and so a future backend (backlog) is a drop-in.
 *
 * Two failure modes are handled explicitly, because both silently destroy work:
 *  - a write that throws (quota exceeded, private browsing, corrupted store) is
 *    reported instead of vanishing into an unhandled rejection;
 *  - a second tab editing the same fleet is detected and announced, rather than
 *    the two tabs overwriting each other last-write-wins.
 */
import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import { migrateFleetDocument } from '../model/migrations.js';
import { CatalogSchema, emptyCatalog } from '../model/catalog.js';
import type { Catalog } from '../model/catalog.js';
import type { Fleet } from '../model/schemas.js';

/**
 * NOT branding - this is the on-disk key. Renaming it would orphan every fleet,
 * import and catalog already saved in a user's browser, so it stays as it is even
 * though the app is now called Solarlux Agent Visualiser.
 */
export const DB_NAME = 'agent-fleet-studio';
export const DB_VERSION = 2;
export const SYNC_CHANNEL = 'agent-fleet-studio:saves';

const FLEET_STORE = 'fleets';
const CATALOG_STORE = 'catalog';
const CATALOG_KEY = 'catalog';
const META_STORE = 'meta';
const ACTIVE_FLEET_KEY = 'activeFleetId';

interface FleetDb extends DBSchema {
  [FLEET_STORE]: { key: string; value: Fleet };
  [META_STORE]: { key: string; value: unknown };
  [CATALOG_STORE]: { key: string; value: unknown };
}

export type LoadedState = {
  fleets: Fleet[];
  activeFleetId: string | null;
  /** Documents that failed validation on load, reported rather than silently dropped. */
  errors: string[];
};

export interface FleetRepository {
  loadAll(): Promise<LoadedState>;
  loadCatalog(): Promise<Catalog>;
  saveCatalog(catalog: Catalog): Promise<void>;
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
      // v2 added the catalog: agents, skills and tools that outlive any one fleet.
      if (!db.objectStoreNames.contains(CATALOG_STORE)) {
        db.createObjectStore(CATALOG_STORE);
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

    async loadCatalog(): Promise<Catalog> {
      const database = await db();
      const stored = await database.get(CATALOG_STORE, CATALOG_KEY);
      // A catalog that no longer validates is replaced rather than crashing the app;
      // the fleets are the irreplaceable part.
      const parsed = CatalogSchema.safeParse(stored);
      return parsed.success ? parsed.data : emptyCatalog();
    },

    async saveCatalog(catalog: Catalog): Promise<void> {
      const database = await db();
      await database.put(CATALOG_STORE, catalog, CATALOG_KEY);
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
      await database.clear(CATALOG_STORE);
    },
  };
}

/** In-memory stand-in used by unit tests and by any environment without IndexedDB. */
export function createMemoryRepository(
  initial: LoadedState = { fleets: [], activeFleetId: null, errors: [] },
): FleetRepository {
  const fleets = new Map<string, Fleet>(initial.fleets.map((f) => [f.id, f]));
  let activeFleetId = initial.activeFleetId;

  let catalog = emptyCatalog();

  return {
    loadAll: () => Promise.resolve({ fleets: [...fleets.values()], activeFleetId, errors: [] }),
    loadCatalog: () => Promise.resolve(catalog),
    saveCatalog: (next) => {
      catalog = next;
      return Promise.resolve();
    },
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
      catalog = emptyCatalog();
      return Promise.resolve();
    },
  };
}

export type PersistenceSnapshot = {
  fleets: Record<string, Fleet>;
  activeFleetId: string | null;
};

/** What went wrong, in words a user can act on. */
export type PersistenceError = {
  message: string;
  cause: unknown;
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

/** Minimal shape of the cross-tab channel, so tests can pass a fake. */
export type SaveBroadcast = {
  postMessage: (message: unknown) => void;
  close: () => void;
  onmessage: ((event: { data: unknown }) => void) | null;
};

export type AttachOptions = {
  debounceMs?: number;
  /** Called when a write fails - the app turns this into a visible warning. */
  onError?: (error: PersistenceError) => void;
  /** Called when another tab saved a fleet this tab also has open. */
  onExternalChange?: (fleetId: string) => void;
  /** Injectable for tests; defaults to a BroadcastChannel when available. */
  channel?: SaveBroadcast | null;
};

/** Identifies this tab, so it can ignore the echoes of its own saves. */
const TAB_ID = `tab-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

type SaveMessage = { tabId: string; fleetId: string };

function isSaveMessage(data: unknown): data is SaveMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as SaveMessage).tabId === 'string' &&
    typeof (data as SaveMessage).fleetId === 'string'
  );
}

function defaultChannel(): SaveBroadcast | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  return new BroadcastChannel(SYNC_CHANNEL) as unknown as SaveBroadcast;
}

/**
 * Mirror store mutations into the repository. Only fleets whose object identity
 * changed are written, so an unrelated mutation never rewrites the whole database.
 */
export function attachPersistence(
  store: Subscribable<PersistenceSnapshot>,
  repository: FleetRepository,
  options: AttachOptions = {},
): PersistenceHandle {
  const debounceMs = options.debounceMs ?? 300;
  const onError = options.onError;
  const onExternalChange = options.onExternalChange;
  const channel = options.channel === undefined ? defaultChannel() : options.channel;

  const dirtyFleetIds = new Set<string>();
  const deletedFleetIds = new Set<string>();
  let activeFleetDirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> = Promise.resolve();

  if (channel) {
    channel.onmessage = (event) => {
      if (!isSaveMessage(event.data)) return;
      // Our own broadcast comes back to us on some platforms; ignore it.
      if (event.data.tabId === TAB_ID) return;
      if (!(event.data.fleetId in store.getState().fleets)) return;
      onExternalChange?.(event.data.fleetId);
    };
  }

  const report = (message: string, cause: unknown): void => {
    if (onError) onError({ message, cause });
    else console.error(message, cause);
  };

  const write = async (): Promise<void> => {
    const { fleets, activeFleetId } = store.getState();

    const toDelete = [...deletedFleetIds];
    const toSave = [...dirtyFleetIds];
    const saveActive = activeFleetDirty;
    deletedFleetIds.clear();
    dirtyFleetIds.clear();
    activeFleetDirty = false;

    for (const fleetId of toDelete) {
      try {
        await repository.deleteFleet(fleetId);
      } catch (cause) {
        report('A fleet could not be removed from local storage.', cause);
      }
    }

    for (const fleetId of toSave) {
      const fleet = fleets[fleetId];
      if (!fleet) continue;
      try {
        await repository.saveFleet(fleet);
        channel?.postMessage({ tabId: TAB_ID, fleetId } satisfies SaveMessage);
      } catch (cause) {
        // Put it back in the queue: the next mutation retries it.
        dirtyFleetIds.add(fleetId);
        report(
          `Changes to "${fleet.name}" could not be saved. Your browser may be out of storage or in private mode - export the fleet to keep your work.`,
          cause,
        );
      }
    }

    if (saveActive) {
      try {
        await repository.setActiveFleetId(activeFleetId);
      } catch (cause) {
        report('The active fleet could not be remembered for next time.', cause);
      }
    }
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
      if (channel) {
        channel.onmessage = null;
        channel.close();
      }
      unsubscribe();
    },
  };
}
