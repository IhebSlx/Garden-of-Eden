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

  const parsed = FleetDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: formatZodError(parsed.error) };
  }

  return { ok: true, fleet: parsed.data };
}
