/**
 * Reading the agent-data folder into the data library.
 *
 * The convention is the user's own, documented in `LIESMICH Aufbau und
 * Einrichtung.md` beside the folder, and it is what makes this importable at all:
 * the path already says who needs the document.
 *
 *   01 Kern            -> every agent, "ohne Ausnahme"
 *   02 Vertrieb        -> only sales-adjacent agents; explicitly NOT the deck
 *                         builder or the Holzoffensive assistant, "dort verwässert
 *                         es den Abruf". Which agents those are cannot be read off
 *                         a folder name, so the importer links nothing and says so.
 *   03 Fachkontext/<X> -> the one agent whose folder it is, matched by name
 *
 * Two of their rules shape the rest. "Nur `.docx` hochladen" - the Markdown files
 * are working copies, so only `.docx` becomes a data item; that also means the
 * `NICHT_HOCHLADEN` folder is skipped without naming it, since it holds only
 * Markdown. And "keine Kopien: dieselbe Bibliothek, mehrfach eingebunden" is
 * exactly this app's model, so a document becomes ONE data item referenced by
 * several agents rather than one copy per agent (SPEC §8.7).
 *
 * Everything here is pure: the browser half only walks the directory and hands
 * over a flat file list.
 */
import { ID_PREFIX, newId } from './ids.js';
import type { DataSource, Fleet } from './schemas.js';

/** One file found under the picked folder. `segments` excludes the file itself. */
export type ScannedFile = {
  /** Folder names from the picked root down to the file's own folder. */
  segments: string[];
  /** File name including its extension. */
  name: string;
};

export type PlannedBox = {
  /** Folder path, joined - the identity used to match an existing box. */
  key: string;
  name: string;
  parentKey: string | null;
  /** Agents this box (and so everything in it) will be linked to. */
  linkTo: string[];
  /** Why it links where it does, shown in the preview. */
  reason: string;
};

export type PlannedItem = {
  key: string;
  name: string;
  parentKey: string;
  /** Path relative to the picked folder, stored as the item's `ref`. */
  ref: string;
};

export type ImportPlan = {
  boxes: PlannedBox[];
  items: PlannedItem[];
  /** Files ignored because they are not `.docx`. */
  skipped: string[];
  /** Boxes the importer deliberately left unlinked, and why. */
  undecided: { name: string; reason: string }[];
};

const DOCX = '.docx';

/** The document title is the file name; the extension is not part of it. */
export function documentTitle(fileName: string): string {
  return fileName.toLowerCase().endsWith(DOCX) ? fileName.slice(0, -DOCX.length) : fileName;
}

/** Case-insensitive, space-tolerant name match against the fleet's agents. */
function agentsNamed(fleet: Fleet, name: string): string[] {
  const wanted = name.trim().toLowerCase();
  return fleet.agents.filter((agent) => agent.name.trim().toLowerCase() === wanted).map((a) => a.id);
}

/** Their level-1 folder, however it is numbered. */
const isKern = (segment: string): boolean => /kern/i.test(segment);
const isVertrieb = (segment: string): boolean => /vertrieb/i.test(segment) && !/fachkontext/i.test(segment);
const isFachkontext = (segment: string): boolean => /fachkontext/i.test(segment);

/**
 * What the importer will do, without doing it. Rendered as a preview so the
 * decisions it cannot make are visible before anything is written.
 */
export function planFolderImport(files: ScannedFile[], fleet: Fleet): ImportPlan {
  const boxes = new Map<string, PlannedBox>();
  const items: PlannedItem[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(DOCX)) {
      skipped.push([...file.segments, file.name].join('/'));
      continue;
    }
    // A file at the picked root has no box to sit in; the root itself is the box.
    if (file.segments.length === 0) {
      skipped.push(file.name);
      continue;
    }

    // Every folder on the way down becomes a box, so the tree mirrors the disk.
    let parentKey: string | null = null;
    file.segments.forEach((segment, depth) => {
      const key = file.segments.slice(0, depth + 1).join('/');
      if (!boxes.has(key)) {
        boxes.set(key, {
          key,
          name: segment,
          parentKey,
          ...scopeFor(file.segments.slice(0, depth + 1), fleet),
        });
      }
      parentKey = key;
    });

    const boxKey = file.segments.join('/');
    items.push({
      key: `${boxKey}/${file.name}`,
      name: documentTitle(file.name),
      parentKey: boxKey,
      ref: [...file.segments, file.name].join('/'),
    });
  }

  const undecided = [...boxes.values()]
    .filter((box) => box.linkTo.length === 0 && box.reason !== '')
    .map((box) => ({ name: box.name, reason: box.reason }));

  return { boxes: [...boxes.values()], items, skipped, undecided };
}

/** Who binds a folder, per the convention documented beside the folder. */
function scopeFor(segments: string[], fleet: Fleet): { linkTo: string[]; reason: string } {
  const top = segments[0] ?? '';

  if (isKern(top)) {
    return {
      linkTo: fleet.agents.map((agent) => agent.id),
      reason: 'Every agent binds this, ohne Ausnahme.',
    };
  }

  if (isVertrieb(top)) {
    return {
      linkTo: [],
      reason:
        'Only sales-adjacent agents bind this, and not the deck builder or the Holzoffensive assistant. Link it yourself.',
    };
  }

  if (isFachkontext(top)) {
    // The folder inside Fachkontext names the agent it belongs to.
    const own = segments[1];
    if (own === undefined) return { linkTo: [], reason: '' };
    const matched = agentsNamed(fleet, own);
    return matched.length > 0
      ? { linkTo: matched, reason: `Only ${own} binds this.` }
      : { linkTo: [], reason: `No agent called "${own}" in this fleet.` };
  }

  return { linkTo: [], reason: 'Not one of the known levels — link it yourself.' };
}

/**
 * Apply a plan to a fleet.
 *
 * Idempotent by name within a parent: importing the same folder twice refreshes
 * the tree rather than doubling it, and an item that was edited here keeps its
 * status, owner and notes. Only the structure, the reference and the links are the
 * folder's to own.
 */
export function applyFolderImport(fleet: Fleet, plan: ImportPlan): Fleet {
  const sources = [...fleet.dataSources];
  /** Plan key -> the data source id it ended up as. */
  const idByKey = new Map<string, string>();

  const findExisting = (name: string, parentId: string | undefined): DataSource | undefined =>
    sources.find(
      (source) =>
        source.name.trim().toLowerCase() === name.trim().toLowerCase() &&
        (source.parentId ?? undefined) === parentId,
    );

  const upsert = (
    name: string,
    parentId: string | undefined,
    patch: Partial<DataSource>,
  ): string => {
    const existing = findExisting(name, parentId);
    if (existing) {
      const index = sources.indexOf(existing);
      sources[index] = { ...existing, ...patch, id: existing.id, name: existing.name, parentId };
      return existing.id;
    }
    const created: DataSource = {
      id: newId(ID_PREFIX.dataSource),
      name,
      // These documents exist on disk; nobody has to provide them. They are not
      // linked into any agent yet, which `linked: false` says exactly.
      type: 'sharepoint',
      status: 'live',
      linked: false,
      ...patch,
      parentId,
    };
    sources.push(created);
    return created.id;
  };

  // Shallowest first, so a parent always has an id before its children need one.
  const orderedBoxes = [...plan.boxes].sort(
    (a, b) => a.key.split('/').length - b.key.split('/').length,
  );
  for (const box of orderedBoxes) {
    const parentId = box.parentKey === null ? undefined : idByKey.get(box.parentKey);
    idByKey.set(box.key, upsert(box.name, parentId, {}));
  }
  for (const item of plan.items) {
    const parentId = idByKey.get(item.parentKey);
    idByKey.set(item.key, upsert(item.name, parentId, { ref: item.ref }));
  }

  // A box is linked, not its contents: linking a parent brings what is inside it.
  const linkedIds = new Map<string, Set<string>>();
  for (const box of plan.boxes) {
    const id = idByKey.get(box.key);
    if (id === undefined) continue;
    for (const agentId of box.linkTo) {
      const bucket = linkedIds.get(agentId) ?? new Set<string>();
      bucket.add(id);
      linkedIds.set(agentId, bucket);
    }
  }

  const agents = fleet.agents.map((agent) => {
    const add = linkedIds.get(agent.id);
    if (add === undefined || add.size === 0) return agent;
    const next = [...agent.dataSourceIds];
    for (const id of add) if (!next.includes(id)) next.push(id);
    return { ...agent, dataSourceIds: next };
  });

  return { ...fleet, agents, dataSources: sources };
}
