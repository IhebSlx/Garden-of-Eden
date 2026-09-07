/**
 * Importing the agent-data folder, against the real layout on disk and the
 * convention documented beside it in `LIESMICH Aufbau und Einrichtung.md`.
 */
import { describe, expect, it } from 'vitest';
import { resetIdFactory, sequentialIdFactory, setIdFactory } from '../../src/model/ids.js';
import { checkFleetIntegrity } from '../../src/model/integrity.js';
import {
  applyFolderImport,
  documentTitle,
  planFolderImport,
} from '../../src/model/folderImport.js';
import type { ScannedFile } from '../../src/model/folderImport.js';
import { dataForAgent, flattenData } from '../../src/model/selectors.js';
import type { Fleet } from '../../src/model/schemas.js';
import { solarluxVisionFleet } from '../../src/model/visionFleet.js';

/** The UPLOAD folder as it actually stands, plus a Markdown working copy. */
const scanned: ScannedFile[] = [
  { segments: ['01 Kern'], name: 'Solarlux Glossar Vertrieb und Geschaeft.docx' },
  { segments: ['01 Kern'], name: 'Solarlux Produktsysteme Beschreibungen.docx' },
  { segments: ['01 Kern'], name: 'Solarlux Produktsysteme Register.docx' },
  { segments: ['01 Kern'], name: 'Solarlux Systeme und Anwendungen.docx' },
  { segments: ['01 Kern'], name: 'Solarlux Unternehmensprofil.docx' },
  { segments: ['02 Vertrieb'], name: 'Solarlux Kennzahlen und Definitionen.docx' },
  { segments: ['02 Vertrieb'], name: 'Solarlux Kundensegmentierung.docx' },
  { segments: ['02 Vertrieb'], name: 'Solarlux Tochtergesellschaften und eigene Marken.docx' },
  { segments: ['02 Vertrieb'], name: 'Solarlux Vertriebskanaele und Kanalcodes.docx' },
  { segments: ['02 Vertrieb'], name: 'Solarlux Vertriebsorganisation.docx' },
  { segments: ['03 Fachkontext', 'Objektvertrieb'], name: 'Objektvertrieb Belege und Nummern.docx' },
  {
    segments: ['03 Fachkontext', 'Objektvertrieb'],
    name: 'Objektvertrieb Geschaeftsablauf Bauprojekt.docx',
  },
  {
    segments: ['03 Fachkontext', 'Objektvertrieb'],
    name: 'Objektvertrieb Glossar Verkaufschancen und Bauprojekte.docx',
  },
  {
    segments: ['03 Fachkontext', 'Objektvertrieb'],
    name: 'Objektvertrieb Kanal-Scope und Auswertungsregeln.docx',
  },
  { segments: ['03 Fachkontext', 'Objektvertrieb'], name: 'Objektvertrieb Rollen im Bauprojekt.docx' },
  { segments: ['03 Fachkontext', 'Objektvertrieb'], name: 'Objektvertrieb Systeme und Ablagen.docx' },
  // The working copies, which their rules keep out of the library.
  { segments: ['01 Kern'], name: 'Solarlux Unternehmensprofil.md' },
  { segments: ['NICHT_HOCHLADEN'], name: 'PFLEGE Regeln fuer die Bibliothek.md' },
];

/** A fleet with nothing in its data library, so an import is unambiguous. */
const emptyLibrary = (): Fleet => {
  const base = solarluxVisionFleet();
  return {
    ...base,
    agents: base.agents.map((agent) => ({ ...agent, dataSourceIds: [] })),
    dataSources: [],
  };
};

describe('reading the folder', () => {
  it('takes the title from the file name, without the extension', () => {
    expect(documentTitle('Solarlux Unternehmensprofil.docx')).toBe('Solarlux Unternehmensprofil');
    expect(documentTitle('Objektvertrieb Rollen im Bauprojekt.DOCX')).toBe(
      'Objektvertrieb Rollen im Bauprojekt',
    );
    expect(documentTitle('no extension')).toBe('no extension');
  });

  it('makes a box per folder and an item per document', () => {
    const plan = planFolderImport(scanned, emptyLibrary());
    expect(plan.boxes.map((b) => b.key)).toEqual([
      '01 Kern',
      '02 Vertrieb',
      '03 Fachkontext',
      '03 Fachkontext/Objektvertrieb',
    ]);
    expect(plan.items).toHaveLength(16);
  });

  it('takes only .docx, which is what keeps NICHT_HOCHLADEN out without naming it', () => {
    const plan = planFolderImport(scanned, emptyLibrary());
    expect(plan.skipped).toEqual([
      '01 Kern/Solarlux Unternehmensprofil.md',
      'NICHT_HOCHLADEN/PFLEGE Regeln fuer die Bibliothek.md',
    ]);
    expect(plan.boxes.some((b) => b.name === 'NICHT_HOCHLADEN')).toBe(false);
  });

  it('stores the path, so an item says where it lives', () => {
    const plan = planFolderImport(scanned, emptyLibrary());
    const item = plan.items.find((i) => i.name === 'Objektvertrieb Rollen im Bauprojekt');
    expect(item?.ref).toBe('03 Fachkontext/Objektvertrieb/Objektvertrieb Rollen im Bauprojekt.docx');
  });

  it('ignores a stray file at the top, which belongs to no level', () => {
    const plan = planFolderImport([{ segments: [], name: 'loose.docx' }], emptyLibrary());
    expect(plan.items).toEqual([]);
    expect(plan.skipped).toEqual(['loose.docx']);
  });
});

describe('who binds what, per the documented convention', () => {
  it('gives 01 Kern to every agent, ohne Ausnahme', () => {
    const fleet = emptyLibrary();
    const plan = planFolderImport(scanned, fleet);
    const kern = plan.boxes.find((b) => b.key === '01 Kern');
    expect(kern?.linkTo).toEqual(fleet.agents.map((a) => a.id));
  });

  it('leaves 02 Vertrieb for the user rather than guessing who is sales-adjacent', () => {
    const plan = planFolderImport(scanned, emptyLibrary());
    const vertrieb = plan.boxes.find((b) => b.key === '02 Vertrieb');
    expect(vertrieb?.linkTo).toEqual([]);
    expect(plan.undecided.map((u) => u.name)).toContain('02 Vertrieb');
  });

  it('gives a Fachkontext folder to the one agent whose name it carries', () => {
    const fleet = emptyLibrary();
    const plan = planFolderImport(scanned, fleet);
    const own = plan.boxes.find((b) => b.key === '03 Fachkontext/Objektvertrieb');
    const objektvertrieb = fleet.agents.find((a) => a.name === 'Objektvertrieb');
    expect(own?.linkTo).toEqual([objektvertrieb?.id]);
  });

  it('says so when a Fachkontext folder matches no agent', () => {
    const fleet = emptyLibrary();
    const plan = planFolderImport(
      [{ segments: ['03 Fachkontext', 'Einkauf'], name: 'Einkauf Lieferanten.docx' }],
      fleet,
    );
    const own = plan.boxes.find((b) => b.key === '03 Fachkontext/Einkauf');
    expect(own?.linkTo).toEqual([]);
    expect(own?.reason).toContain('Einkauf');
    expect(plan.undecided).toHaveLength(1);
  });

  it('links nothing it does not recognise, and says that too', () => {
    const plan = planFolderImport(
      [{ segments: ['99 Sonstiges'], name: 'irgendwas.docx' }],
      emptyLibrary(),
    );
    expect(plan.boxes[0]?.linkTo).toEqual([]);
    expect(plan.undecided[0]?.reason).toContain('link it yourself');
  });
});

describe('applying the import', () => {
  const imported = (): Fleet => {
    setIdFactory(sequentialIdFactory());
    const fleet = emptyLibrary();
    const result = applyFolderImport(fleet, planFolderImport(scanned, fleet));
    resetIdFactory();
    return result;
  };

  it('builds the tree and keeps it schema-clean', () => {
    const fleet = imported();
    expect(fleet.dataSources).toHaveLength(20);
    expect(checkFleetIntegrity(fleet)).toEqual([]);
  });

  it('nests the documents inside their folders', () => {
    const fleet = imported();
    const rows = flattenData(fleet);
    const objekt = rows.find(({ source }) => source.name === 'Objektvertrieb');
    expect(objekt?.depth).toBe(1);
    const doc = rows.find(({ source }) => source.name === 'Objektvertrieb Rollen im Bauprojekt');
    expect(doc?.depth).toBe(2);
  });

  it('marks the documents as existing but not yet linked', () => {
    const fleet = imported();
    const doc = fleet.dataSources.find((d) => d.name === 'Solarlux Unternehmensprofil');
    expect(doc).toMatchObject({ type: 'sharepoint', status: 'live', linked: false });
  });

  it('links the box, so every document inside it comes along', () => {
    const fleet = imported();
    const kern = fleet.dataSources.find((d) => d.name === '01 Kern');
    for (const agent of fleet.agents) {
      // One reference each, not five.
      expect(agent.dataSourceIds).toContain(kern?.id);
      expect(dataForAgent(fleet, agent).map((d) => d.name)).toContain('Solarlux Unternehmensprofil');
    }
  });

  it('gives the Fachkontext folder to its own agent and to nobody else', () => {
    const fleet = imported();
    const own = fleet.dataSources.find((d) => d.name === 'Objektvertrieb');
    const holders = fleet.agents.filter((a) => a.dataSourceIds.includes(own?.id ?? ''));
    expect(holders.map((a) => a.name)).toEqual(['Objektvertrieb']);
  });

  it('refreshes on a second import instead of doubling the library', () => {
    setIdFactory(sequentialIdFactory());
    const first = emptyLibrary();
    const once = applyFolderImport(first, planFolderImport(scanned, first));
    const twice = applyFolderImport(once, planFolderImport(scanned, once));
    resetIdFactory();

    expect(twice.dataSources).toHaveLength(once.dataSources.length);
    for (const agent of twice.agents) {
      expect(new Set(agent.dataSourceIds).size).toBe(agent.dataSourceIds.length);
    }
  });

  it('keeps what was edited in the app: only structure and links are the folder\'s', () => {
    setIdFactory(sequentialIdFactory());
    const base = emptyLibrary();
    const once = applyFolderImport(base, planFolderImport(scanned, base));

    // Somebody records who owes an update and what finished looks like.
    const edited: Fleet = {
      ...once,
      dataSources: once.dataSources.map((source) =>
        source.name === 'Solarlux Unternehmensprofil'
          ? { ...source, status: 'building', owner: 'Marketing', notes: 'Stand prüfen' }
          : source,
      ),
    };
    const again = applyFolderImport(edited, planFolderImport(scanned, edited));
    resetIdFactory();

    const doc = again.dataSources.find((d) => d.name === 'Solarlux Unternehmensprofil');
    expect(doc).toMatchObject({ status: 'building', owner: 'Marketing', notes: 'Stand prüfen' });
  });

  it('does nothing to a fleet when the folder holds nothing importable', () => {
    const fleet = emptyLibrary();
    const plan = planFolderImport([{ segments: ['01 Kern'], name: 'notes.md' }], fleet);
    expect(applyFolderImport(fleet, plan)).toEqual(fleet);
  });
});
