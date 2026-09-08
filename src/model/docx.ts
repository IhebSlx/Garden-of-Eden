/**
 * Reading a `.docx` well enough to show what it says.
 *
 * A `.docx` is a ZIP holding `word/document.xml`. This finds that entry, inflates
 * it with the browser's own `DecompressionStream` and pulls the paragraphs out.
 *
 * No library, for two reasons. The folder picker already limits this to Chromium,
 * which has `DecompressionStream` built in, so a dependency would buy nothing. And
 * the output wanted here is plain paragraphs rather than faithful HTML: the
 * preview exists to show what the agent will ground on, and the agent is handed
 * text, not formatting. A prettier rendering would be a less honest one.
 *
 * Deliberately narrow: Word writes stored or deflated entries and no ZIP64, so
 * that is what this reads. Anything else is reported rather than guessed at.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/** The part of a Word file that holds the words. */
const DOCUMENT_PART = 'word/document.xml';

export type DocxReadError =
  | { kind: 'not-a-zip' }
  | { kind: 'no-document-part' }
  | { kind: 'unsupported-compression'; method: number }
  /** The folder is open, but nothing is at that path. Reported here so a caller
   *  has one error type to render for "show me this document". */
  | { kind: 'not-found'; path: string };

export type DocxResult =
  | { ok: true; paragraphs: string[] }
  | { ok: false; error: DocxReadError };

/** The End Of Central Directory record, which is the only way into a ZIP. */
function findEocd(view: DataView): number | null {
  // It is at the end, after a comment of at most 65535 bytes.
  const earliest = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let at = view.byteLength - 22; at >= earliest; at -= 1) {
    if (view.getUint32(at, true) === EOCD_SIGNATURE) return at;
  }
  return null;
}

/** Where `name`'s bytes start and how they are compressed, or null if absent. */
function locate(
  view: DataView,
  name: string,
): { offset: number; compressed: number; method: number } | null {
  const eocd = findEocd(view);
  if (eocd === null) return null;

  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();

  for (let index = 0; index < count; index += 1) {
    if (at + 46 > view.byteLength || view.getUint32(at, true) !== CENTRAL_SIGNATURE) return null;

    const method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    const entry = decoder.decode(new Uint8Array(view.buffer, view.byteOffset + at + 46, nameLength));

    if (entry === name) {
      // The central directory records where the LOCAL header is; the data sits
      // after that header, whose own name and extra fields have their own lengths.
      if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) return null;
      const localName = view.getUint16(localOffset + 26, true);
      const localExtra = view.getUint16(localOffset + 28, true);
      return { offset: localOffset + 30 + localName + localExtra, compressed, method };
    }

    at += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** `&amp;` and friends, which Word writes and a reader has to undo. */
function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');
}

/**
 * The paragraphs of `word/document.xml`.
 *
 * A paragraph is `<w:p>`; its text lives in `<w:t>` runs, which Word splits at
 * every formatting change, so the runs of one paragraph are joined back together.
 * Tabs and line breaks are their own empty elements.
 */
export function paragraphsFromXml(xml: string): string[] {
  const body = xml.slice(xml.indexOf('<w:body'));
  const paragraphs: string[] = [];

  for (const paragraph of body.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
    const inner = paragraph[1] ?? '';
    let text = '';

    // Only runs, tabs and breaks carry text; everything else in a paragraph is
    // styling, revision marks and bookmarks, which a reader does not want.
    for (const token of inner.matchAll(
      /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>/g,
    )) {
      if (token[1] !== undefined) text += token[1];
      else if (token[0].startsWith('<w:tab')) text += '\t';
      else text += '\n';
    }

    const cleaned = decodeEntities(text).replace(/[ \t]+$/gm, '');
    // Word writes empty paragraphs for spacing; they are not content.
    if (cleaned.trim() !== '') paragraphs.push(cleaned);
  }

  return paragraphs;
}

/** Read a `.docx`'s text. The bytes are the whole file. */
export async function readDocx(bytes: Uint8Array): Promise<DocxResult> {
  if (bytes.byteLength < 22) return { ok: false, error: { kind: 'not-a-zip' } };

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (findEocd(view) === null) return { ok: false, error: { kind: 'not-a-zip' } };

  const found = locate(view, DOCUMENT_PART);
  if (found === null) return { ok: false, error: { kind: 'no-document-part' } };

  const raw = bytes.subarray(found.offset, found.offset + found.compressed);
  let xml: Uint8Array;
  if (found.method === 0) {
    xml = raw;
  } else if (found.method === 8) {
    xml = await inflateRaw(raw);
  } else {
    return { ok: false, error: { kind: 'unsupported-compression', method: found.method } };
  }

  return { ok: true, paragraphs: paragraphsFromXml(new TextDecoder().decode(xml)) };
}

/** What went wrong, in words a reader can act on. */
export function docxErrorMessage(error: DocxReadError): string {
  switch (error.kind) {
    case 'not-a-zip':
      return 'That file is not a .docx — a Word document is a zip, and this is not one.';
    case 'no-document-part':
      return 'That .docx has no word/document.xml, so there is no text to show.';
    case 'unsupported-compression':
      return `That .docx uses compression this reader does not handle (method ${error.method}). Open it in Word instead.`;
    case 'not-found':
      return `No file at ${error.path} in the folder you opened. It may have been renamed or moved.`;
  }
}
