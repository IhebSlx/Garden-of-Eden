/**
 * The folder the user opened, kept for as long as the tab is.
 *
 * `Open folder` already asks for a directory to import from. Keeping that handle
 * afterwards is what lets the library show a document's text instead of only its
 * file name: the same grant, used twice.
 *
 * Deliberately in memory and not persisted. A handle can be stored in IndexedDB
 * and re-authorised on the next visit, but that would mean a document store beside
 * the fleet document, a version bump on data that is already live, and a browser
 * permission prompt on load that nobody asked for. Losing the folder on reload
 * costs one click, and the UI says so plainly rather than failing quietly.
 */
import { create } from 'zustand';
import { readDocx } from '../model/docx.js';
import type { DocxResult } from '../model/docx.js';

/** The File System Access shapes this app touches, and nothing more. */
export type FileEntryHandle = {
  kind: 'file';
  name: string;
  getFile: () => Promise<{ arrayBuffer: () => Promise<ArrayBuffer> }>;
};

export type DirectoryHandle = {
  kind: 'directory';
  name: string;
  values: () => AsyncIterable<DirectoryHandle | FileEntryHandle>;
  getDirectoryHandle: (name: string) => Promise<DirectoryHandle>;
  getFileHandle: (name: string) => Promise<FileEntryHandle>;
};

type FolderState = {
  /** The picked directory, or null when none has been opened this session. */
  handle: DirectoryHandle | null;
  /** Its name, for saying which folder is connected. */
  name: string | null;
  connect: (handle: DirectoryHandle) => void;
  forget: () => void;
};

export const useFolderStore = create<FolderState>((set) => ({
  handle: null,
  name: null,
  connect: (handle) => set({ handle, name: handle.name }),
  forget: () => set({ handle: null, name: null }),
}));

/**
 * The path segments of a reference that names a document in the folder, or null
 * when it is something else.
 *
 * A `ref` is free text and can be three different things: a URL to SharePoint, a
 * Dataverse table name, or the path the importer wrote. Only the third can be
 * read off disk, and only `.docx` is uploaded at all, which is the user's own rule.
 */
export function documentPathOf(ref: string | undefined): string[] | null {
  if (ref === undefined) return null;
  const trimmed = ref.trim();
  if (trimmed === '' || /^[a-z]+:\/\//i.test(trimmed)) return null;
  if (!trimmed.toLowerCase().endsWith('.docx')) return null;

  const segments = trimmed.split(/[\\/]+/).filter((part) => part !== '' && part !== '.');
  // `..` would walk out of the folder the user granted. Nothing writes it, so a
  // ref containing one is malformed rather than a path to honour.
  if (segments.length === 0 || segments.some((part) => part === '..')) return null;
  return segments;
}

/** Read the document at `segments` under `root`. */
export async function readDocumentFrom(
  root: DirectoryHandle,
  segments: string[],
): Promise<DocxResult> {
  const path = segments.join('/');
  const fileName = segments[segments.length - 1];
  if (fileName === undefined) return { ok: false, error: { kind: 'not-found', path } };

  let directory = root;
  try {
    for (const part of segments.slice(0, -1)) {
      directory = await directory.getDirectoryHandle(part);
    }
    const file = await directory.getFileHandle(fileName);
    const bytes = new Uint8Array(await (await file.getFile()).arrayBuffer());
    return await readDocx(bytes);
  } catch {
    // The folder is open but this path is not in it: renamed, moved, or the user
    // picked a different folder than the one the refs were written from.
    return { ok: false, error: { kind: 'not-found', path } };
  }
}
