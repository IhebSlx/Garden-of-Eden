/**
 * Reading a `.docx`, against real Word files rather than a mock.
 *
 * The fixtures are the user's own documents under `agent_data/UPLOAD`, read from
 * disk when they are present. They are not in the repo, so those cases skip on a
 * machine that does not have them — a test that silently passed on a fabricated
 * file would prove nothing about the format Word actually writes.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { docxErrorMessage, paragraphsFromXml, readDocx } from '../../src/model/docx.js';

const UPLOAD = 'C:/Users/I.Marouani/Desktop/agent_data/UPLOAD';

/** Every `.docx` under the upload folder, when this machine has it. */
function realDocuments(): string[] {
  if (!existsSync(UPLOAD)) return [];
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return walk(path);
      return entry.name.toLowerCase().endsWith('.docx') ? [path] : [];
    });
  return walk(UPLOAD);
}

/** A minimal but genuine ZIP, so the reader is exercised without Word present. */
async function makeDocx(
  xml: string,
  { deflate = true, part = 'word/document.xml' } = {},
): Promise<Uint8Array> {
  const name = new TextEncoder().encode(part);
  const raw = new TextEncoder().encode(xml);

  let body = raw;
  if (deflate) {
    const stream = new Blob([raw as BlobPart])
      .stream()
      .pipeThrough(new CompressionStream('deflate-raw'));
    body = new Uint8Array(await new Response(stream).arrayBuffer());
  }

  const local = new Uint8Array(30 + name.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint16(8, deflate ? 8 : 0, true);
  lv.setUint32(18, body.length, true);
  lv.setUint32(22, raw.length, true);
  lv.setUint16(26, name.length, true);
  local.set(name, 30);

  const central = new Uint8Array(46 + name.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint16(10, deflate ? 8 : 0, true);
  cv.setUint32(20, body.length, true);
  cv.setUint32(24, raw.length, true);
  cv.setUint16(28, name.length, true);
  cv.setUint32(42, 0, true);
  central.set(name, 46);

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, 1, true);
  ev.setUint16(10, 1, true);
  ev.setUint32(12, central.length, true);
  ev.setUint32(16, local.length + body.length, true);

  const out = new Uint8Array(local.length + body.length + central.length + eocd.length);
  out.set(local, 0);
  out.set(body, local.length);
  out.set(central, local.length + body.length);
  out.set(eocd, local.length + body.length + central.length);
  return out;
}

const document = (inner: string): string =>
  `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${inner}</w:body></w:document>`;

describe('pulling paragraphs out of Word XML', () => {
  it('joins the runs Word splits a sentence into', () => {
    // Word breaks a run at every formatting change; the sentence is still one.
    const xml = document('<w:p><w:r><w:t>Solarlux </w:t></w:r><w:r><w:t>Objektvertrieb</w:t></w:r></w:p>');
    expect(paragraphsFromXml(xml)).toEqual(['Solarlux Objektvertrieb']);
  });

  it('keeps paragraphs apart', () => {
    const xml = document('<w:p><w:r><w:t>Erstens</w:t></w:r></w:p><w:p><w:r><w:t>Zweitens</w:t></w:r></w:p>');
    expect(paragraphsFromXml(xml)).toEqual(['Erstens', 'Zweitens']);
  });

  it('drops the empty paragraphs Word uses for spacing', () => {
    const xml = document('<w:p/><w:p><w:r><w:t>Inhalt</w:t></w:r></w:p><w:p><w:r><w:t>   </w:t></w:r></w:p>');
    expect(paragraphsFromXml(xml)).toEqual(['Inhalt']);
  });

  it('reads tabs and line breaks as themselves', () => {
    const xml = document('<w:p><w:r><w:t>a</w:t><w:tab/><w:t>b</w:t><w:br/><w:t>c</w:t></w:r></w:p>');
    expect(paragraphsFromXml(xml)).toEqual(['a\tb\nc']);
  });

  it('ignores styling, bookmarks and revision marks', () => {
    const xml = document(
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:bookmarkStart w:id="1"/>' +
        '<w:r><w:rPr><w:b/></w:rPr><w:t>Überschrift</w:t></w:r><w:bookmarkEnd w:id="1"/></w:p>',
    );
    expect(paragraphsFromXml(xml)).toEqual(['Überschrift']);
  });

  it('decodes the entities Word escapes', () => {
    const xml = document('<w:p><w:r><w:t>Preis &amp; Menge &lt;100&gt; &#8212; fertig</w:t></w:r></w:p>');
    expect(paragraphsFromXml(xml)).toEqual(['Preis & Menge <100> — fertig']);
  });

  it('finds the body even when the header carries namespaces', () => {
    const xml = '<?xml version="1.0"?><w:document xmlns:w="x"><w:ignored/><w:body><w:p><w:r><w:t>x</w:t></w:r></w:p></w:body></w:document>';
    expect(paragraphsFromXml(xml)).toEqual(['x']);
  });
});

describe('reading the file', () => {
  it('reads a deflated document', async () => {
    const bytes = await makeDocx(document('<w:p><w:r><w:t>Unternehmensprofil</w:t></w:r></w:p>'));
    const result = await readDocx(bytes);
    expect(result).toEqual({ ok: true, paragraphs: ['Unternehmensprofil'] });
  });

  it('reads a stored document, which Word writes for tiny parts', async () => {
    const bytes = await makeDocx(document('<w:p><w:r><w:t>Kurz</w:t></w:r></w:p>'), { deflate: false });
    const result = await readDocx(bytes);
    expect(result).toEqual({ ok: true, paragraphs: ['Kurz'] });
  });

  it('says so when the file is not a zip at all', async () => {
    const result = await readDocx(new TextEncoder().encode('This is a plain text file, not a docx.'));
    expect(result).toEqual({ ok: false, error: { kind: 'not-a-zip' } });
    if (!result.ok) expect(docxErrorMessage(result.error)).toContain('not a .docx');
  });

  it('says so when a zip holds no document part', async () => {
    // A valid zip whose only entry is something else — a .zip of holiday photos
    // renamed to .docx reads as a zip and still has no text in it.
    const bytes = await makeDocx(document('<w:p><w:r><w:t>x</w:t></w:r></w:p>'), {
      part: 'word/settings.xml',
    });
    const result = await readDocx(bytes);
    expect(result).toEqual({ ok: false, error: { kind: 'no-document-part' } });
    if (!result.ok) expect(docxErrorMessage(result.error)).toContain('no text to show');
  });

  it('refuses an empty file rather than throwing', async () => {
    expect(await readDocx(new Uint8Array())).toEqual({ ok: false, error: { kind: 'not-a-zip' } });
  });
});

describe('the real documents, where this machine has them', () => {
  const documents = realDocuments();
  const when = documents.length > 0 ? it : it.skip;

  when('reads every .docx under agent_data/UPLOAD', async () => {
    for (const path of documents) {
      const result = await readDocx(new Uint8Array(readFileSync(path)));
      expect(result.ok, `${path} did not read`).toBe(true);
      if (result.ok) {
        // A real document has words in it; an empty read is a silent failure.
        expect(result.paragraphs.length, `${path} came back empty`).toBeGreaterThan(3);
        expect(result.paragraphs.join(' ')).not.toContain('<w:');
      }
    }
  });

  when('carries the Stand: line their own rules require', async () => {
    const first = documents[0];
    if (first === undefined) return;
    const result = await readDocx(new Uint8Array(readFileSync(first)));
    if (!result.ok) throw new Error('did not read');
    expect(result.paragraphs.some((line) => line.includes('Stand'))).toBe(true);
  });
});
