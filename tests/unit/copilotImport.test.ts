/**
 * Importing a Microsoft Copilot Studio agent export.
 *
 * The fixture is a real export (`Objektvertrieb`, 2298 lines), so these tests fail
 * the moment the mapping drifts from what Copilot Studio actually produces.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { humanise, parseCopilotAgent } from '../../src/model/copilotImport.js';
import { resetIdFactory, sequentialIdFactory, setIdFactory } from '../../src/model/ids.js';
import { AgentSchema, DataSourceSchema, SkillSchema, ToolSchema } from '../../src/model/schemas.js';

const yaml = readFileSync('tests/fixtures/copilot/objektvertrieb.yaml', 'utf8');

beforeEach(() => {
  setIdFactory(sequentialIdFactory());
  return () => resetIdFactory();
});

const importFixture = () => {
  const result = parseCopilotAgent(yaml, 'Objektvertrieb (2).yaml');
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.value;
};

describe('humanise', () => {
  it('turns a machine name into a readable one', () => {
    expect(humanise('rechnungen-und-betraege')).toBe('Rechnungen und betraege');
    expect(humanise('projekt_dossier')).toBe('Projekt dossier');
  });

  it('leaves a name that already has capitals exactly alone', () => {
    // Flows carry real display names; rewriting them would lose the author's hyphens.
    expect(humanise('Portal-Suche Objektportal')).toBe('Portal-Suche Objektportal');
    expect(humanise('Projekte-Suchen CRM')).toBe('Projekte-Suchen CRM');
  });

  it('survives odd input', () => {
    expect(humanise('')).toBe('');
    expect(humanise('   ')).toBe('   ');
  });
});

describe('rejecting the wrong file', () => {
  it('rejects invalid YAML with a readable message', () => {
    const result = parseCopilotAgent('key: [unclosed', 'broken.yaml');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('not valid YAML');
  });

  it('rejects YAML that is not a BotDefinition', () => {
    const result = parseCopilotAgent('kind: SomethingElse\nname: nope', 'other.yaml');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('BotDefinition');
  });

  it('rejects an empty file', () => {
    expect(parseCopilotAgent('', 'empty.yaml').ok).toBe(false);
  });
});

describe('the Objektvertrieb export', () => {
  it('reads the agent identity', () => {
    const { agent, schemaName } = importFixture();
    expect(agent.name).toBe('Objektvertrieb');
    expect(schemaName).toBe('crea8_objektvertriebassistent_p3Z5Bl');
    // It runs in Copilot Studio today, so it arrives Live rather than Planned.
    expect(agent.status).toBe('live');
    expect(agent.kind).toBe('department');
    expect(agent.model?.provider).toBe('Microsoft Copilot Studio');
  });

  it('reads all seven agent skills with their instructions', () => {
    const { skills } = importFixture();
    expect(skills).toHaveLength(7);
    expect(skills.map((s) => s.name)).toEqual([
      'Produktfamilien',
      'Rechnungen und betraege',
      'Projekt dossier',
      'Projektfamilie aufloesen',
      'Aktivitaeten und kontakte',
      'Zahlen und zaehlen',
      'Leere ergebnisse',
    ]);

    const produktfamilien = skills[0];
    expect(produktfamilien?.description).toContain('Produktfamilien-Begriffe');
    // The markdown body becomes the instructions, with the front-matter stripped.
    expect(produktfamilien?.instructions).toContain('Familie zu Systemen auflösen');
    expect(produktfamilien?.instructions?.startsWith('---')).toBe(false);
    expect(produktfamilien?.instructions).not.toContain('bic:source=upload');
  });

  it('reads all eight Power Automate flows as workflow tools', () => {
    const { tools } = importFixture();
    expect(tools).toHaveLength(8);
    expect(tools.every((t) => t.type === 'workflow')).toBe(true);
    expect(tools.map((t) => t.name)).toContain('Projekte-Suchen CRM');
    expect(tools.map((t) => t.name)).toContain('Portal-Suche Objektportal');
    expect(tools.map((t) => t.name)).toContain('Dokument-Lesen');
  });

  it('keeps each flow\'s input and output signature', () => {
    const { tools } = importFixture();
    const activity = tools.find((t) => t.name === 'Aktivitaet-Lesen');
    const config = activity?.config as { inputs?: { name: string; required: boolean }[] } | undefined;

    expect(config?.inputs?.[0]).toMatchObject({ name: 'ActivityId', required: true });
    expect((activity?.config as { source?: string })?.source).toBe('copilot-studio');
  });

  it('does NOT invent workflow steps the export does not contain', () => {
    const { tools, warnings } = importFixture();
    // A Copilot Studio export has a flow's signature, never its internal steps.
    expect(tools.every((t) => t.workflow === undefined)).toBe(true);
    expect(warnings.join(' ')).toContain('not its internal steps');
  });

  it('reads the SharePoint knowledge source', () => {
    const { dataSources } = importFixture();
    expect(dataSources).toHaveLength(1);
    expect(dataSources[0]).toMatchObject({
      name: 'IhebTest / Shared Documents',
      type: 'sharepoint',
      status: 'live',
      linked: true,
    });
    expect(dataSources[0]?.ref).toContain('solarlux.sharepoint.com');
  });

  it('wires every imported item onto the agent', () => {
    const { agent, skills, tools, dataSources } = importFixture();
    expect(agent.skillIds).toEqual(skills.map((s) => s.id));
    expect(agent.toolIds).toEqual(tools.map((t) => t.id));
    expect(agent.dataSourceIds).toEqual(dataSources.map((d) => d.id));
  });

  it('produces items that pass this app\'s own schemas', () => {
    const { agent, skills, tools, dataSources } = importFixture();
    expect(AgentSchema.safeParse(agent).success).toBe(true);
    for (const skill of skills) expect(SkillSchema.safeParse(skill).success).toBe(true);
    for (const tool of tools) expect(ToolSchema.safeParse(tool).success).toBe(true);
    for (const source of dataSources) expect(DataSourceSchema.safeParse(source).success).toBe(true);
  });

  it('is deterministic for the same input', () => {
    setIdFactory(sequentialIdFactory());
    const first = importFixture();
    setIdFactory(sequentialIdFactory());
    const second = importFixture();
    expect(second).toEqual(first);
  });
});

describe('a minimal export', () => {
  const minimal = `kind: BotDefinition
components: []
flows: []
entity:
  kind: BotEntity
  displayName: Tiny Agent
`;

  it('imports an agent with nothing attached', () => {
    const result = parseCopilotAgent(minimal, 'tiny.yaml');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.agent.name).toBe('Tiny Agent');
    expect(result.value.skills).toEqual([]);
    expect(result.value.tools).toEqual([]);
    expect(result.value.warnings).toContain('No agent skills were found in this export.');
  });

  it('falls back to the file name when the export has no display name', () => {
    const result = parseCopilotAgent('kind: BotDefinition\ncomponents: []', 'my-agent.yaml');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.agent.name).toBe('My agent');
  });
});

describe('the PPT Buddy export (a skill folder with resources)', () => {
  const pptYaml = readFileSync('tests/fixtures/copilot/ppt-buddy.yaml', 'utf8');

  const importPpt = () => {
    const result = parseCopilotAgent(pptYaml, 'PPT Buddy.yaml');
    if (!result.ok) throw new Error(result.errors.join('; '));
    return result.value;
  };

  it('reads the agent and its single skill', () => {
    const { agent, skills } = importPpt();
    expect(agent.name).toBe('PPT Buddy');
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe('Solarlux praesentation erstellen');
  });

  it('takes the instructions from skill.md, not the bundle marker', () => {
    const { skills } = importPpt();
    const instructions = skills[0]?.instructions ?? '';
    // `dialog.content` here is only "<!-- bic:bundle=... -->"; the real text is in the file.
    expect(instructions).not.toContain('bic:bundle');
    expect(instructions.length).toBeGreaterThan(1000);
  });

  it('imports the Python script as a tool, with its source', () => {
    const { tools } = importPpt();
    const script = tools.find((t) => t.name === 'build_deck.py');
    expect(script).toBeDefined();
    expect(script?.type).toBe('python');

    const config = script?.config as { code?: string; path?: string; language?: string; bytes?: number };
    expect(config.language).toBe('py');
    expect(config.path).toBe('script/build_deck.py');
    expect(config.bytes).toBeGreaterThan(8000);
    expect(config.code).toContain('#!/usr/bin/env python3');
    expect(config.code).toContain('build_deck.py');
  });

  it('describes the script from its own docstring rather than a placeholder', () => {
    const { tools } = importPpt();
    expect(tools.find((t) => t.name === 'build_deck.py')?.description).toContain('Solarlux deck renderer');
  });

  it('imports every other skill resource as a data source', () => {
    const { dataSources } = importPpt();
    // 18 non-script resources + the SharePoint knowledge source.
    expect(dataSources).toHaveLength(19);
    expect(dataSources.map((d) => d.name)).toContain('Solarlux_Masterdatei_2023.pptx');
    expect(dataSources.map((d) => d.name)).toContain('logo_solarlux.png');
    expect(dataSources.map((d) => d.name)).toContain('deck_spec_schema.json');
  });

  it('types markdown as md and everything else as file', () => {
    const { dataSources } = importPpt();
    expect(dataSources.find((d) => d.name === 'client_pitch.md')?.type).toBe('md');
    expect(dataSources.find((d) => d.name === 'logo_solarlux.png')?.type).toBe('file');
    expect(dataSources.find((d) => d.name === 'example_spec.json')?.type).toBe('file');
  });

  it('keeps each resource\'s path as its reference', () => {
    const { dataSources } = importPpt();
    expect(dataSources.find((d) => d.name === 'client_pitch.md')?.ref).toBe('references/client_pitch.md');
  });

  it('has no Power Automate flows, and says so', () => {
    const { warnings } = importPpt();
    expect(warnings.join(' ')).toContain('19 skill resources');
    expect(warnings.join(' ')).toContain('1 script imported with its source');
  });
});

describe('saved tool parameters', () => {
  it('folds GlobalVariableComponent values onto the tool they belong to', () => {
    const result = parseCopilotAgent(yaml, 'o.yaml');
    if (!result.ok) throw new Error('import failed');

    const portal = result.value.tools.find((t) => t.name === 'Portal-Suche Objektportal');
    const parameters = (portal?.config as { parameters?: Record<string, unknown> }).parameters;
    expect(parameters).toBeDefined();
    // `PortalSucheObjektportal.table1` becomes `table1` on the Portal-Suche tool.
    expect(parameters?.['table1']).toBe('Bauprojektübersicht');
  });
});
