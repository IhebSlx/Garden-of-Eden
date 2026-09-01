/** SPEC 7 - autosave to IndexedDB on every mutation (debounced), multiple named fleets. */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetIdFactory, sequentialIdFactory, setIdFactory } from '../../src/model/ids.js';
import {
  attachPersistence,
  createIndexedDbRepository,
  createMemoryRepository,
} from '../../src/store/persistence.js';
import type { FleetRepository } from '../../src/store/persistence.js';
import {
  hydrateFleetStore,
  resetFleetStore,
  selectActiveFleet,
  useFleetStore,
} from '../../src/store/fleetStore.js';
import { makeFleet } from '../fixtures/fleets.js';

const store = () => useFleetStore.getState();

beforeEach(async () => {
  setIdFactory(sequentialIdFactory());
  resetFleetStore();
  await createIndexedDbRepository().clear();
  return () => resetIdFactory();
});

describe('IndexedDB repository', () => {
  it('round-trips a fleet through the database', async () => {
    const repository = createIndexedDbRepository();
    const fleet = makeFleet();

    await repository.saveFleet(fleet);
    await repository.setActiveFleetId(fleet.id);

    const loaded = await repository.loadAll();
    expect(loaded.fleets).toHaveLength(1);
    expect(loaded.fleets[0]).toEqual(fleet);
    expect(loaded.activeFleetId).toBe(fleet.id);
    expect(loaded.errors).toEqual([]);
  });

  it('keeps multiple named fleets apart', async () => {
    const repository = createIndexedDbRepository();
    await repository.saveFleet({ ...makeFleet(), id: 'flt_a', name: 'A' });
    await repository.saveFleet({ ...makeFleet(), id: 'flt_b', name: 'B' });

    const loaded = await repository.loadAll();
    expect(loaded.fleets.map((f) => f.name).sort()).toEqual(['A', 'B']);
  });

  it('overwrites a fleet saved under the same id', async () => {
    const repository = createIndexedDbRepository();
    const fleet = makeFleet();
    await repository.saveFleet(fleet);
    await repository.saveFleet({ ...fleet, name: 'Renamed' });

    const loaded = await repository.loadAll();
    expect(loaded.fleets).toHaveLength(1);
    expect(loaded.fleets[0]?.name).toBe('Renamed');
  });

  it('deletes a fleet', async () => {
    const repository = createIndexedDbRepository();
    const fleet = makeFleet();
    await repository.saveFleet(fleet);
    await repository.deleteFleet(fleet.id);
    expect((await repository.loadAll()).fleets).toEqual([]);
  });

  it('reports a corrupted stored fleet instead of loading it', async () => {
    const repository = createIndexedDbRepository();
    await repository.saveFleet(makeFleet());
    // Simulate a hand-edited or half-migrated record.
    await repository.saveFleet({ ...makeFleet(), id: 'flt_broken', agents: [] });

    const loaded = await repository.loadAll();
    expect(loaded.fleets).toHaveLength(1);
    expect(loaded.errors).toHaveLength(1);
    expect(loaded.errors[0]).toContain('flt_broken');
  });

  it('ignores a stale active id that points at nothing', async () => {
    const repository = createIndexedDbRepository();
    await repository.setActiveFleetId('flt_gone');
    expect((await repository.loadAll()).activeFleetId).toBeNull();
  });
});

describe('attachPersistence', () => {
  const withPersistence = async (
    repository: FleetRepository,
    run: (flush: () => Promise<void>) => void | Promise<void>,
  ): Promise<void> => {
    const handle = attachPersistence(useFleetStore, repository, { debounceMs: 0 });
    try {
      await run(handle.flush);
    } finally {
      handle.stop();
    }
  };

  it('writes a mutation through to the repository', async () => {
    const repository = createMemoryRepository();
    await withPersistence(repository, async (flush) => {
      store().createFleet('blank', 'Autosaved');
      store().addAgent({ name: 'Sales', role: 'Pipeline' });
      await flush();

      const loaded = await repository.loadAll();
      expect(loaded.fleets).toHaveLength(1);
      expect(loaded.fleets[0]?.agents).toHaveLength(2);
      expect(loaded.activeFleetId).toBe(loaded.fleets[0]?.id);
    });
  });

  it('propagates a delete', async () => {
    const repository = createMemoryRepository();
    await withPersistence(repository, async (flush) => {
      const id = store().createFleet('blank', 'Temporary');
      await flush();
      expect((await repository.loadAll()).fleets).toHaveLength(1);

      store().deleteFleet(id);
      await flush();
      expect((await repository.loadAll()).fleets).toEqual([]);
    });
  });

  it('only rewrites the fleets that actually changed', async () => {
    const written: string[] = [];
    const base = createMemoryRepository();
    const repository: FleetRepository = {
      ...base,
      saveFleet: (fleet) => {
        written.push(fleet.id);
        return base.saveFleet(fleet);
      },
    };

    await withPersistence(repository, async (flush) => {
      const first = store().createFleet('blank', 'One');
      const second = store().createFleet('blank', 'Two');
      await flush();
      written.length = 0;

      store().setActiveFleet(first);
      store().renameFleet(first, 'One renamed');
      await flush();

      expect(written).toEqual([first]);
      expect(written).not.toContain(second);
    });
  });

  it('persists an undo, because undo is a state change like any other', async () => {
    const repository = createMemoryRepository();
    await withPersistence(repository, async (flush) => {
      store().createFleet('blank', 'Original');
      const id = store().activeFleetId ?? '';
      store().renameFleet(id, 'Changed');
      await flush();
      expect((await repository.loadAll()).fleets[0]?.name).toBe('Changed');

      useFleetStore.temporal.getState().undo();
      await flush();
      expect((await repository.loadAll()).fleets[0]?.name).toBe('Original');
    });
  });

  it('stops writing after stop()', async () => {
    const repository = createMemoryRepository();
    const handle = attachPersistence(useFleetStore, repository, { debounceMs: 0 });
    store().createFleet('blank', 'Saved');
    await handle.flush();
    handle.stop();

    store().createFleet('blank', 'Not saved');
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect((await repository.loadAll()).fleets).toHaveLength(1);
  });
});

describe('hydration', () => {
  it('restores fleets from disk into the store', () => {
    const fleet = makeFleet();
    hydrateFleetStore({ fleets: [fleet], activeFleetId: fleet.id });
    expect(selectActiveFleet(store())?.id).toBe(fleet.id);
  });

  it('falls back to the first fleet when the stored active id is gone', () => {
    const fleet = makeFleet();
    hydrateFleetStore({ fleets: [fleet], activeFleetId: 'flt_gone' });
    expect(store().activeFleetId).toBe(fleet.id);
  });

  it('handles an empty database', () => {
    hydrateFleetStore({ fleets: [], activeFleetId: null });
    expect(store().activeFleetId).toBeNull();
    expect(store().fleetOrder).toEqual([]);
  });
});
