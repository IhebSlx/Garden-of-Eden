/**
 * Id generation. Swappable so unit tests get deterministic, readable ids
 * instead of random UUIDs.
 */

export type IdFactory = (prefix: string) => string;

export const ID_PREFIX = {
  fleet: 'flt',
  agent: 'agt',
  edge: 'edg',
  skill: 'skl',
  tool: 'tol',
  dataSource: 'dsr',
  workflowStep: 'stp',
  sourceKind: 'skd',
} as const;

const defaultFactory: IdFactory = (prefix) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

let factory: IdFactory = defaultFactory;

export function newId(prefix: string): string {
  return factory(prefix);
}

export function setIdFactory(next: IdFactory): void {
  factory = next;
}

export function resetIdFactory(): void {
  factory = defaultFactory;
}

/** Deterministic factory for tests: `agt_1`, `agt_2`, `edg_1`, ... */
export function sequentialIdFactory(): IdFactory {
  const counters = new Map<string, number>();
  return (prefix) => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}_${next}`;
  };
}
