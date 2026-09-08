/**
 * "Open folder": read the agent-data folder into the data library.
 *
 * The convention lives in `folderImport.ts`; this is only the browser half — pick
 * a directory, walk it, show what the import will do, and apply it on request.
 *
 * A preview rather than a straight import, because the folder cannot answer every
 * question. `02 Vertrieb` goes to "sales-adjacent agents", which is a judgement,
 * so the importer says what it could not decide instead of guessing and being
 * quietly wrong.
 *
 * The File System Access API is Chromium-only. Where it is missing the button says
 * so rather than failing on click.
 */
import { useState } from 'react';
import { planFolderImport } from '../../model/folderImport.js';
import type { ImportPlan, ScannedFile } from '../../model/folderImport.js';
import { selectActiveFleet, useFleetStore } from '../../store/fleetStore.js';
import { useFolderStore } from '../../store/folderHandle.js';
import type { DirectoryHandle } from '../../store/folderHandle.js';

/**
 * A mis-picked folder — a whole OneDrive root — must not lock the tab up walking
 * it. The real folder holds tens of files, so this is far out of the way.
 */
const MAX_FILES = 2000;

type PickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<DirectoryHandle>;
};

const picker = (): PickerWindow['showDirectoryPicker'] =>
  typeof window === 'undefined' ? undefined : (window as PickerWindow).showDirectoryPicker;

async function scan(
  directory: DirectoryHandle,
  segments: string[],
  found: ScannedFile[],
): Promise<void> {
  for await (const entry of directory.values()) {
    if (found.length >= MAX_FILES) return;
    if (entry.kind === 'file') {
      found.push({ segments, name: entry.name });
    } else {
      await scan(entry, [...segments, entry.name], found);
    }
  }
}

export function FolderImport(): React.JSX.Element {
  const fleet = useFleetStore(selectActiveFleet);
  const importDataFolder = useFleetStore((s) => s.importDataFolder);
  const connectFolder = useFolderStore((s) => s.connect);

  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [root, setRoot] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const open = picker();

  const choose = async (): Promise<void> => {
    if (open === undefined || fleet === undefined) return;
    setMessage(null);
    let handle: DirectoryHandle;
    try {
      handle = await open({ mode: 'read' });
    } catch {
      // The picker throws when it is dismissed, which is not an error.
      return;
    }

    // Kept whether or not the import is applied: the library reads documents
    // through this same grant, and cancelling the preview is not a reason to
    // make the user pick the folder again.
    connectFolder(handle);

    setBusy(true);
    try {
      const found: ScannedFile[] = [];
      await scan(handle, [], found);
      setRoot(handle.name);
      setPlan(planFolderImport(found, fleet));
      if (found.length >= MAX_FILES) {
        setMessage(`Stopped after ${MAX_FILES} files. Pick the UPLOAD folder rather than its parent.`);
      }
    } catch {
      setMessage('That folder could not be read. Check the permission prompt and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="chrome-btn"
        data-testid="folder-import"
        disabled={open === undefined || busy}
        title={
          open === undefined
            ? 'Reading a folder needs Chrome or Edge'
            : 'Read a folder of documents into the data library'
        }
        onClick={() => void choose()}
      >
        {busy ? 'Reading…' : open === undefined ? 'Open folder (Chrome only)' : 'Open folder'}
      </button>

      {message !== null && (
        <span className="import-note" data-testid="folder-import-note">
          {message}
        </span>
      )}

      {plan !== null && (
        <div className="dialog-scrim" role="dialog" aria-label="Import folder" data-testid="import-preview">
          <div className="dialog">
            <h2>Import {root}</h2>

            {plan.items.length === 0 ? (
              <p className="dialog-lead" data-testid="import-nothing">
                No <code>.docx</code> documents under that folder. Only <code>.docx</code> is taken —
                the Markdown working copies stay out of the library, which is your own rule.
              </p>
            ) : (
              <p className="dialog-lead">
                <b>{plan.items.length}</b> documents in <b>{plan.boxes.length}</b> folders. A folder
                becomes a box and the documents sit inside it, so linking the box gives an agent
                everything in it — one item referenced many times, never a copy.
              </p>
            )}

            <ul className="import-list">
              {plan.boxes.map((box) => (
                <li key={box.key} data-testid="import-box">
                  <b>{box.key}</b>
                  <span>
                    {box.linkTo.length === 0
                      ? box.reason
                      : `${box.linkTo.length} ${box.linkTo.length === 1 ? 'agent' : 'agents'} — ${box.reason}`}
                  </span>
                </li>
              ))}
            </ul>

            {plan.skipped.length > 0 && (
              <p className="import-skipped" data-testid="import-skipped">
                Skipped {plan.skipped.length} non-<code>.docx</code>{' '}
                {plan.skipped.length === 1 ? 'file' : 'files'}.
              </p>
            )}

            <div className="dialog-row">
              <button
                type="button"
                className="btn"
                data-testid="import-apply"
                disabled={plan.items.length === 0}
                onClick={() => {
                  const result = importDataFolder(plan);
                  setPlan(null);
                  setMessage(
                    result.ok
                      ? `Imported ${plan.items.length} documents. Ctrl+Z undoes it.`
                      : result.reason,
                  );
                }}
              >
                Import
              </button>
              <button type="button" className="btn ghost" onClick={() => setPlan(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
