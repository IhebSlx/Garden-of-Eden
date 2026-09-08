/**
 * Which references point at a readable document, and reading one out of a folder.
 *
 * A `ref` is free text holding three different things — a SharePoint URL, a
 * Dataverse table name, the importer's path — and only the last is a file. Getting
 * that wrong means either a preview that never appears or one that tries to read
 * "Kunden" off disk.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { documentPathOf, readDocumentFrom, useFolderStore } from '../../src/store/folderHandle.js';
import type { DirectoryHandle, FileEntryHandle } from '../../src/store/folderHandle.js';

describe('deciding what can be previewed', () => {
  it('takes the importer’s path apart', () => {
    expect(documentPathOf('03 Fachkontext/Objektvertrieb/Rollen im Bauprojekt.docx')).toEqual([
      '03 Fachkontext',
      'Objektvertrieb',
      'Rollen im Bauprojekt.docx',
    ]);
  });

  it('takes a backslash path too, since Explorer copies them that way', () => {
    expect(documentPathOf('01 Kern\\Solarlux Glossar.docx')).toEqual([
      '01 Kern',
      'Solarlux Glossar.docx',
    ]);
  });

  it('reads a bare file name as a document at the top of the folder', () => {
    expect(documentPathOf('Glossar.docx')).toEqual(['Glossar.docx']);
  });

  it('leaves a SharePoint URL alone — it already has Open', () => {
    expect(documentPathOf('https://solarlux.sharepoint.com/sites/Marketing/Doc.docx')).toBeNull();
  });

  it('leaves a Dataverse table alone — there is no file to read', () => {
    expect(documentPathOf('Kunden')).toBeNull();
    expect(documentPathOf('cr123_produktdaten')).toBeNull();
  });

  it('leaves other file types alone, since only .docx is uploaded', () => {
    expect(documentPathOf('01 Kern/Glossar.md')).toBeNull();
    expect(documentPathOf('bilder/produkt.png')).toBeNull();
  });

  it('ignores case in the extension, because Windows does', () => {
    expect(documentPathOf('01 Kern/Glossar.DOCX')).toEqual(['01 Kern', 'Glossar.DOCX']);
  });

  it('refuses a path that climbs out of the folder that was granted', () => {
    expect(documentPathOf('../../Windows/secret.docx')).toBeNull();
    expect(documentPathOf('01 Kern/../../x.docx')).toBeNull();
  });

  it('says nothing for an absent or empty reference', () => {
    expect(documentPathOf(undefined)).toBeNull();
    expect(documentPathOf('   ')).toBeNull();
  });
});

/** The browser hands out entries asynchronously; disk does not. */
function asAsync<T>(items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]: () => {
      const walk = items[Symbol.iterator]();
      return { next: () => Promise.resolve(walk.next()) };
    },
  };
}

/** A directory handle backed by real files on disk, shaped like the browser's. */
function folderAt(path: string): DirectoryHandle {
  const at = (name: string): string => {
    const next = join(path, name);
    // What the File System Access API throws for a name that is not there.
    if (!existsSync(next)) throw new Error('NotFoundError');
    return next;
  };
  return {
    kind: 'directory',
    name: path.split(/[\\/]/).pop() ?? path,
    values: () =>
      asAsync(
        readdirSync(path, { withFileTypes: true }).map((entry) =>
          entry.isDirectory() ? folderAt(join(path, entry.name)) : fileAt(join(path, entry.name)),
        ),
      ),
    getDirectoryHandle: (name) => Promise.resolve(folderAt(at(name))),
    getFileHandle: (name) => Promise.resolve(fileAt(at(name))),
  };
}

function fileAt(path: string): FileEntryHandle {
  return {
    kind: 'file',
    name: path.split(/[\\/]/).pop() ?? path,
    getFile: () =>
      Promise.resolve({
        arrayBuffer: () => {
          const bytes = readFileSync(path);
          return Promise.resolve(
            bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          );
        },
      }),
  };
}

const UPLOAD = 'C:/Users/I.Marouani/Desktop/agent_data/UPLOAD';
const hasUpload = existsSync(UPLOAD);
const whenReal = hasUpload ? it : it.skip;

describe('reading a document out of the opened folder', () => {
  whenReal('reads a real document by the path the importer stored', async () => {
    const root = folderAt(UPLOAD);
    // Whatever the first folder holds — the fixture must not name a file that
    // could be renamed tomorrow.
    const kern = readdirSync(join(UPLOAD, '01 Kern')).find((name) => name.endsWith('.docx'));
    expect(kern, 'no .docx under 01 Kern').toBeDefined();

    const path = documentPathOf(`01 Kern/${kern ?? ''}`);
    expect(path).not.toBeNull();

    const result = await readDocumentFrom(root, path ?? []);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.paragraphs.length).toBeGreaterThan(3);
  });

  whenReal('says the file is not there rather than throwing', async () => {
    const result = await readDocumentFrom(folderAt(UPLOAD), ['01 Kern', 'Nicht vorhanden.docx']);
    expect(result).toEqual({
      ok: false,
      error: { kind: 'not-found', path: '01 Kern/Nicht vorhanden.docx' },
    });
  });

  whenReal('says so when the folder in the path is not there either', async () => {
    const result = await readDocumentFrom(folderAt(UPLOAD), ['99 Erfunden', 'x.docx']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('not-found');
  });

  it('refuses an empty path instead of reading the folder itself', async () => {
    const result = await readDocumentFrom(folderAt('.'), []);
    expect(result).toEqual({ ok: false, error: { kind: 'not-found', path: '' } });
  });
});

describe('remembering the folder', () => {
  it('starts with nothing open, and forgets on request', () => {
    useFolderStore.getState().forget();
    expect(useFolderStore.getState().handle).toBeNull();
    expect(useFolderStore.getState().name).toBeNull();

    const root = folderAt('.');
    useFolderStore.getState().connect(root);
    expect(useFolderStore.getState().handle).toBe(root);
    expect(useFolderStore.getState().name).toBe(root.name);

    useFolderStore.getState().forget();
    expect(useFolderStore.getState().handle).toBeNull();
  });
});
