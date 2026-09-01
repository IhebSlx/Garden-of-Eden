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
    expect(warnings.join(' ')).toContain('do not include');
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
