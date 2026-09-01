/**
 * Import a Microsoft Copilot Studio agent export (`kind: BotDefinition`, YAML)
 * into this app's model.
 *
 * What the export actually contains, and where each piece lands:
 *
 *   entity.displayName                        -> agent name
 *   entity.schemaName                         -> kept as the source reference
 *   components[].dialog.kind InlineAgentSkill -> Skill
 *       displayName -> name, description -> description, dialog.content -> instructions
 *   flows[] CloudFlowDefinition               -> Tool (type 'workflow')
 *       displayName / description, plus the input+output signature in `config`
 *   KnowledgeSourceComponent SharePoint...    -> DataSource (sharepoint, ref = siteUrl)
 *
 * Deliberately NOT invented: a Copilot Studio export carries a flow's *signature*
 * but not its internal steps, so imported workflow tools arrive with no
 * `workflow.steps`. Fabricating steps would put made-up process into a diagram
 * people read as fact; the tool editor is there to author them for real.
 *
 * The parser is defensive throughout - these files are large, versioned by
 * Microsoft, and will change shape without warning. Anything unrecognised is
 * reported as a warning rather than throwing.
 */
import { parse as parseYaml } from 'yaml';
import { ID_PREFIX, newId } from './ids.js';
import type { Agent, DataSource, Skill, Tool } from './schemas.js';

export type CopilotImport = {
  /** The agent itself, with its library references already wired up. */
  agent: Agent;
  skills: Skill[];
  tools: Tool[];
  dataSources: DataSource[];
  /** Things the file contained that we could not map, in plain words. */
  warnings: string[];
  /** `entity.schemaName`, so a re-import can recognise the same agent. */
  schemaName: string | undefined;
};

export type CopilotImportResult = { ok: true; value: CopilotImport } | { ok: false; errors: string[] };

type Dict = Record<string, unknown>;

const isDict = (value: unknown): value is Dict => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * Copilot Studio names skills in kebab case ("rechnungen-und-betraege") but gives
 * flows real display names ("Portal-Suche Objektportal"). Only the machine-looking
 * ones are rewritten: a name that already contains a capital is left exactly as
 * its author wrote it, hyphens and all.
 */
export function humanise(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') return raw;
  if (/[A-ZÄÖÜ]/.test(trimmed)) return trimmed;
  const spaced = trimmed.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Strip the YAML front-matter Copilot Studio puts at the top of skill content. */
function stripFrontMatter(content: string): string {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith('---')) return content.trim();
  const end = trimmed.indexOf('\n---', 3);
  if (end === -1) return content.trim();
  return trimmed
    .slice(end + 4)
    .replace(/^\s*<!--[^>]*-->\s*/, '')
    .trim();
}

function readSkills(components: unknown[], warnings: string[]): Skill[] {
  const skills: Skill[] = [];

  for (const component of components) {
    if (!isDict(component)) continue;
    const dialog = component['dialog'];
    if (!isDict(dialog) || dialog['kind'] !== 'InlineAgentSkill') continue;

    const name =
      str(component['displayName']) ?? str(dialog['skillFolderName']) ?? str(component['schemaName']);
    if (name === undefined) {
      warnings.push('Skipped a skill with no name.');
      continue;
    }

    const content = str(dialog['content']);
    skills.push({
      id: newId(ID_PREFIX.skill),
      name: humanise(name),
      ...(str(component['description']) === undefined ? {} : { description: str(component['description']) }),
      ...(content === undefined ? {} : { instructions: stripFrontMatter(content) }),
    });
  }

  return skills;
}

/** The input/output signature of a flow, flattened into something readable. */
function readSignature(record: unknown): { name: string; description?: string; required: boolean }[] {
  if (!isDict(record)) return [];
  const properties = record['properties'];
  if (!isDict(properties)) return [];

  return Object.entries(properties).flatMap(([key, raw]) => {
    if (!isDict(raw)) return [];
    const description = str(raw['description']);
    return [
      {
        name: str(raw['displayName']) ?? key,
        ...(description === undefined ? {} : { description }),
        required: raw['isRequired'] === true,
      },
    ];
  });
}

function readTools(flows: unknown[], warnings: string[]): Tool[] {
  const tools: Tool[] = [];

  for (const flow of flows) {
    if (!isDict(flow)) continue;
    if (flow['kind'] !== 'CloudFlowDefinition') continue;

    const name = str(flow['displayName']);
    if (name === undefined) {
      warnings.push('Skipped a flow with no name.');
      continue;
    }

    const inputs = readSignature(flow['inputType']);
    const outputs = readSignature(flow['outputType']);

    tools.push({
      id: newId(ID_PREFIX.tool),
      name: humanise(name),
      // SPEC §4 requires a description on every tool.
      description: str(flow['description']) ?? `Power Automate flow "${name}".`,
      type: 'workflow',
      config: {
        source: 'copilot-studio',
        ...(str(flow['workflowId']) === undefined ? {} : { workflowId: str(flow['workflowId']) }),
        enabled: flow['isEnabled'] !== false,
        inputs,
        outputs,
      },
    });
  }

  return tools;
}

function readKnowledge(components: unknown[]): DataSource[] {
  const sources: DataSource[] = [];

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isDict(value)) return;

    if (value['kind'] === 'SharePointKnowledgeSource') {
      const url = str(value['siteUrl']);
      if (url !== undefined) {
        // The last meaningful path segment reads better than the whole URL.
        let label = 'SharePoint';
        try {
          const decoded = decodeURIComponent(new URL(url).pathname);
          const segments = decoded.split('/').filter((part) => part !== '');
          // /sites/IhebTest/Shared Documents reads best as "IhebTest / Shared Documents".
          const after = segments[0] === 'sites' ? segments.slice(1) : segments;
          if (after.length > 0) label = after.join(' / ');
        } catch {
          // A malformed URL still deserves a data source; just keep the default label.
        }
        sources.push({
          id: newId(ID_PREFIX.dataSource),
          name: humanise(label),
          type: 'sharepoint',
          // Knowledge attached in Copilot Studio is genuinely connected.
          status: 'live',
          linked: true,
          ref: url,
        });
      }
    }

    for (const nested of Object.values(value)) visit(nested);
  };

  visit(components);
  return sources;
}

/** Recognise the file before trying to read it, so the error is useful. */
function looksLikeBotDefinition(root: unknown): root is Dict {
  return isDict(root) && root['kind'] === 'BotDefinition';
}

export function parseCopilotAgent(text: string, fallbackName: string): CopilotImportResult {
  let root: unknown;
  try {
    root = parseYaml(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, errors: [`That file is not valid YAML: ${detail}`] };
  }

  if (!looksLikeBotDefinition(root)) {
    return {
      ok: false,
      errors: [
        'That does not look like a Copilot Studio agent export. Expected a YAML file starting with `kind: BotDefinition`.',
      ],
    };
  }

  const warnings: string[] = [];
  const components = list(root['components']);
  const entity = isDict(root['entity']) ? root['entity'] : {};

  const name = str(entity['displayName']) ?? humanise(fallbackName.replace(/\.ya?ml$/i, ''));
  const skills = readSkills(components, warnings);
  const tools = readTools(list(root['flows']), warnings);
  const dataSources = readKnowledge(components);

  if (skills.length === 0) warnings.push('No agent skills were found in this export.');
  if (tools.length === 0) warnings.push('No Power Automate flows were found in this export.');
  if (tools.length > 0) {
    warnings.push(
      `${tools.length} flow${tools.length === 1 ? '' : 's'} imported with their inputs and outputs. Copilot Studio exports do not include a flow's internal steps, so add those in the tool editor if you want the diagram.`,
    );
  }

  const agent: Agent = {
    id: newId(ID_PREFIX.agent),
    // An imported Copilot agent is a working specialist, not the orchestrator.
    kind: 'department',
    name,
    role: str(entity['description']) ?? 'Imported from Copilot Studio',
    // It exists and runs in Copilot Studio today.
    status: 'live',
    skillIds: skills.map((s) => s.id),
    toolIds: tools.map((t) => t.id),
    dataSourceIds: dataSources.map((d) => d.id),
    model: { provider: 'Microsoft Copilot Studio', name: 'Copilot Studio agent' },
  };

  return {
    ok: true,
    value: { agent, skills, tools, dataSources, warnings, schemaName: str(entity['schemaName']) },
  };
}
