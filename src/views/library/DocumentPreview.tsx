/**
 * The document itself, read-only, under the item that references it.
 *
 * The library says a document exists, who owes it and where it lives. What it
 * actually says was still a trip to Explorer. This shows the text the agent will
 * be grounded on, read straight from the folder the user already opened — no
 * second copy to drift out of date, and nothing here can edit it. The `.docx` on
 * disk stays the single truth; this is a window onto it.
 *
 * Only for items whose reference is a path to a `.docx`. A SharePoint URL already
 * has `Open ↗`, and a Dataverse table has no text to show.
 */
import { useEffect, useState } from 'react';
import { docxErrorMessage } from '../../model/docx.js';
import type { DocxResult } from '../../model/docx.js';
import { documentPathOf, readDocumentFrom, useFolderStore } from '../../store/folderHandle.js';

/**
 * What was read, and which document it was read for. Tagged rather than cleared
 * when the selection moves: clearing it would mean writing state during a render
 * pass, and the tag says "stale" just as well as an empty box does.
 */
type Preview = { of: string; result: DocxResult };

export function DocumentPreview({ refValue }: { refValue: string | undefined }): React.JSX.Element | null {
  const handle = useFolderStore((s) => s.handle);
  const folderName = useFolderStore((s) => s.name);
  const [preview, setPreview] = useState<Preview | null>(null);

  const segments = documentPathOf(refValue);
  const path = segments?.join('/') ?? null;
  // The folder is part of the identity: reopening a different folder must not
  // leave the previous one's text under the same path.
  const key = `${folderName ?? ''}|${path ?? ''}`;

  useEffect(() => {
    if (handle === null || path === null) return;
    // A slow read must not land on a different item after the selection moves.
    let current = true;
    void readDocumentFrom(handle, path.split('/')).then((result) => {
      if (current) setPreview({ of: key, result });
    });
    return () => {
      current = false;
    };
  }, [handle, path, key]);

  if (segments === null) return null;
  const fileName = segments[segments.length - 1] ?? '';
  const read = preview !== null && preview.of === key ? preview.result : null;

  return (
    <section className="docprev" data-testid="document-preview">
      <header className="docprev-head">
        <h3>{fileName}</h3>
        <span className="docprev-note">as uploaded · read-only</span>
      </header>

      {handle === null ? (
        <p className="docprev-empty" data-testid="document-preview-closed">
          Open folder to read this here. Until then the reference is all the library has.
        </p>
      ) : read === null ? (
        <p className="docprev-empty">Reading…</p>
      ) : read.ok ? (
        <>
          <div className="docprev-body" data-testid="document-preview-text" tabIndex={0}>
            {read.paragraphs.map((line, index) => (
              // Paragraph order is the only identity a line of a document has.
              <p key={index}>{line}</p>
            ))}
          </div>
          <p className="docprev-foot">
            {read.paragraphs.length} {read.paragraphs.length === 1 ? 'paragraph' : 'paragraphs'} from{' '}
            {folderName}/{path}
          </p>
        </>
      ) : (
        <p className="docprev-empty" data-testid="document-preview-error">
          {docxErrorMessage(read.error)}
        </p>
      )}
    </section>
  );
}
