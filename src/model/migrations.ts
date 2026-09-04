/**
 * SPEC 7 - "Export/import: versioned Fleet JSON (schemaVersion), Zod-validated on
 * import with readable errors."
 *
 * Everything entering the store from outside (a file, IndexedDB) passes through
 * `migrateFleetDocument`, so there is exactly one place where an unknown document
 * shape is turned into a trusted `Fleet`.
 */
import type { ZodError } from 'zod';
import { SCHEMA_VERSION } from './schemas.js';
import type { Fleet } from './schemas.js';
import { FleetDocumentSchema } from './integrity.js';

export type MigrationResult = { ok: true; fleet: Fleet } | { ok: false; errors: string[] };

/** Zod issues as one readable line each: `agents[0].name: too small`. */
export function formatZodError(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.reduce<string>((acc, segment) => {
      if (typeof segment === 'number') return `${acc}[${segment}]`;
      return acc === '' ? String(segment) : `${acc}.${String(segment)}`;
    }, '');
    return path === '' ? issue.message : `${path}: ${issue.message}`;
  });
}

function readSchemaVersion(raw: unknown): number | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const value = (raw as { schemaVersion?: unknown }).schemaVersion;
  return typeof value === 'number' ? value : undefined;
}

/**
 * Validate (and, once there is more than one version, upgrade) an unknown document.
 * Only schemaVersion 1 exists today; older versions get a migration step here as
 * the schema evolves, and a newer version is rejected rather than half-read.
 */
/**
 * The Ansprechpartner used to sit on every data item; it now sits once on the
 * department that provides it. Zod strips unknown keys, so a document written
 * before the move would lose the name silently - it is hoisted onto the matching
 * department first. Same schemaVersion: nothing else about the shape changed, and
 * a document without contacts passes through untouched.
 */
function hoistContactsToDepartments(raw: object): object {
  const document = raw as { agents?: unknown; dataSources?: unknown };
  const agents: unknown[] = Array.isArray(document.agents) ? document.agents : [];
  const dataSources: unknown[] = Array.isArray(document.dataSources) ? document.dataSources : [];
  if (agents.length === 0 || dataSources.length === 0) return raw;

  const byOwner = new Map<string, string>();
  for (const source of dataSources) {
    if (typeof source !== 'object' || source === null) continue;
    const { owner, contact } = source as { owner?: unknown; contact?: unknown };
    if (typeof owner !== 'string' || typeof contact !== 'string') continue;
    const key = owner.trim().toLowerCase();
    if (key !== '' && contact.trim() !== '' && !byOwner.has(key)) byOwner.set(key, contact);
  }
  if (byOwner.size === 0) return raw;

  const withContact = (agent: unknown): unknown => {
    if (typeof agent !== 'object' || agent === null) return agent;
    const { name, contact } = agent as { name?: unknown; contact?: unknown };
    if (typeof name !== 'string' || typeof contact === 'string') return agent;
    const inherited = byOwner.get(name.trim().toLowerCase());
    return inherited === undefined ? agent : { ...agent, contact: inherited };
  };

  return { ...document, agents: agents.map(withContact) };
}

export function migrateFleetDocument(raw: unknown): MigrationResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['Not a fleet file: expected a JSON object at the top level.'] };
  }

  const version = readSchemaVersion(raw);

  if (version === undefined) {
    return {
      ok: false,
      errors: [`Not a fleet file: missing "schemaVersion" (expected ${SCHEMA_VERSION}).`],
    };
  }

  if (version > SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        `This file was written by a newer version of the app (schemaVersion ${version}, this app reads ${SCHEMA_VERSION}). Update the app to open it.`,
      ],
    };
  }

  if (version < SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [`Unsupported schemaVersion ${version}: no migration path to ${SCHEMA_VERSION} exists.`],
    };
  }

  const parsed = FleetDocumentSchema.safeParse(hoistContactsToDepartments(raw));
  if (!parsed.success) {
    return { ok: false, errors: formatZodError(parsed.error) };
  }

  return { ok: true, fleet: parsed.data };
}
