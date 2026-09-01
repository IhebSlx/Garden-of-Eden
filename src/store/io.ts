/**
 * SPEC 7 - versioned JSON export / import. Pure string in, string out, so the whole
 * round-trip is unit-testable without a DOM; the Blob/file-input plumbing lives in the UI.
 */
import { migrateFleetDocument } from '../model/migrations.js';
import type { MigrationResult } from '../model/migrations.js';
import type { Fleet } from '../model/schemas.js';

/** Pretty-printed so an exported fleet stays diffable in git. */
export function exportFleetToJson(fleet: Fleet): string {
  return `${JSON.stringify(fleet, null, 2)}\n`;
}

export function parseFleetJson(text: string): MigrationResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, errors: [`File is not valid JSON: ${detail}`] };
  }
  return migrateFleetDocument(raw);
}

/** `sales-fleet.fleet.json` - stable, filesystem-safe name derived from the fleet name. */
export function suggestFleetFileName(fleet: Fleet): string {
  const slug = fleet.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug === '' ? 'fleet' : slug}.fleet.json`;
}
