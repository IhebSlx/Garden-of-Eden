/**
 * SPEC 7 - versioned JSON export / import. Pure string in, string out, so the whole
 * round-trip is unit-testable without a DOM; the Blob/file-input plumbing lives in the UI.
 *
 * Two shapes come out of here, and which one is written depends on what was asked
 * for rather than on a setting:
 *
 *  - ONE fleet and nothing else -> the plain fleet document, exactly as before.
 *    Every `.fleet.json` already saved keeps working, a single fleet stays
 *    diffable in git, and sending one to a colleague is unchanged.
 *  - anything else -> a BUNDLE holding several fleets and/or the catalog.
 *
 * Import takes either, so a file never has to be explained before it is opened.
 * The catalog travels only in a bundle: SPEC 7 says a fleet document is
 * self-contained, so it must not carry catalog data inside it.
 */
import { z } from 'zod';
import { CatalogSchema } from '../model/catalog.js';
import type { Catalog } from '../model/catalog.js';
import { formatZodError, migrateFleetDocument } from '../model/migrations.js';
import type { MigrationResult } from '../model/migrations.js';
import type { Fleet } from '../model/schemas.js';

/** Names the file for what it is, so a stray download is identifiable. */
export const BUNDLE_KIND = 'solarlux-agent-visualiser-export';
export const BUNDLE_VERSION = 1 as const;

/**
 * The envelope only. Fleets stay `unknown` here because each one goes through
 * `migrateFleetDocument` individually — a bundle written by an older version may
 * hold fleets that still need migrating, and rejecting the whole file for that
 * would make old backups unreadable.
 */
const BundleEnvelopeSchema = z.object({
  kind: z.literal(BUNDLE_KIND),
  bundleVersion: z.literal(BUNDLE_VERSION),
  exportedAt: z.string().min(1),
  fleets: z.array(z.unknown()),
  catalog: z.unknown().optional(),
});

export type ExportContents = { fleets: Fleet[]; catalog: Catalog | null };
export type ParseExportResult = ({ ok: true } & ExportContents) | { ok: false; errors: string[] };

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

/**
 * What to write for a given selection.
 *
 * One fleet alone is written as the fleet document it has always been; anything
 * else needs an envelope to hold it.
 */
export function exportSelectionToJson(fleets: Fleet[], catalog: Catalog | null): string {
  const single = fleets.length === 1 && catalog === null ? fleets[0] : undefined;
  if (single !== undefined) return exportFleetToJson(single);

  const bundle = {
    kind: BUNDLE_KIND,
    bundleVersion: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    fleets,
    ...(catalog === null ? {} : { catalog }),
  };
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

/** Read either shape. A plain fleet document comes back as a one-fleet result. */
export function parseExport(text: string): ParseExportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, errors: [`File is not valid JSON: ${detail}`] };
  }

  // Not a bundle: the only other thing this app writes is a fleet document.
  const looksLikeBundle =
    typeof raw === 'object' && raw !== null && (raw as { kind?: unknown }).kind === BUNDLE_KIND;
  if (!looksLikeBundle) {
    const single = migrateFleetDocument(raw);
    return single.ok ? { ok: true, fleets: [single.fleet], catalog: null } : single;
  }

  const envelope = BundleEnvelopeSchema.safeParse(raw);
  if (!envelope.success) return { ok: false, errors: formatZodError(envelope.error) };

  const fleets: Fleet[] = [];
  const errors: string[] = [];
  envelope.data.fleets.forEach((candidate, index) => {
    const migrated = migrateFleetDocument(candidate);
    // Named by position, because a fleet that failed to parse has no name to give.
    if (migrated.ok) fleets.push(migrated.fleet);
    else errors.push(...migrated.errors.map((error) => `Fleet ${index + 1}: ${error}`));
  });

  let catalog: Catalog | null = null;
  if (envelope.data.catalog !== undefined) {
    const parsed = CatalogSchema.safeParse(envelope.data.catalog);
    if (parsed.success) catalog = parsed.data;
    else errors.push(...formatZodError(parsed.error).map((error) => `Catalog: ${error}`));
  }

  // All or nothing: a half-restored backup is worse than a refused one, because
  // it looks like it worked.
  if (errors.length > 0) return { ok: false, errors };
  if (fleets.length === 0 && catalog === null) {
    return { ok: false, errors: ['That export is empty — no fleets and no catalog in it.'] };
  }
  return { ok: true, fleets, catalog };
}

/** `sales-fleet.fleet.json` - stable, filesystem-safe name derived from the fleet name. */
export function suggestFleetFileName(fleet: Fleet): string {
  return `${slugify(fleet.name, 'fleet')}.fleet.json`;
}

/** What to call the download for a given selection. */
export function suggestExportFileName(
  fleets: Fleet[],
  catalog: Catalog | null,
  today = new Date(),
): string {
  const single = fleets.length === 1 && catalog === null ? fleets[0] : undefined;
  if (single !== undefined) return suggestFleetFileName(single);

  const day = today.toISOString().slice(0, 10);
  // A backup is found again by date, not by which fleets happened to be in it.
  return `agent-visualiser-${day}.json`;
}

function slugify(text: string, fallback: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? fallback : slug;
}
