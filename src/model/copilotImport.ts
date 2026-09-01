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
 *   KnowledgeSourceComponent SharePoint...    -> DataSource (sharepoint)
 *       displayName -> name, description -> description, siteUrl -> ref
 *   GlobalVariableComponent groups            -> DataSource per table/list reached
 *       e.g. VCSucheDataverse.* names a Dataverse environment and its table;
 *       PortalSucheObjektportal.* names a SharePoint site and its lists
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

/** A file shipped inside a skill folder: script, reference doc, template, image. */
export type SkillResource = {
  path: string;
  /** File name without the folder, for display. */
  fileName: string;
  extension: string;
  /** Decoded text, for the types where text is meaningful. */
  text: string | undefined;
  /** Bytes, so a binary asset still reports its size. */
  bytes: number;
};

const TEXT_EXTENSIONS = new Set(['md', 'txt', 'json', 'yaml', 'yml', 'csv', 'xml', 'html']);
const SCRIPT_EXTENSIONS = new Set(['py', 'ps1', 'js', 'ts', 'sh', 'rb']);

function decodeBase64(value: string): { text: string | undefined; bytes: number } {
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return { text: new TextDecoder('utf-8', { fatal: false }).decode(bytes), bytes: bytes.length };
  } catch {
    return { text: undefined, bytes: 0 };
  }
}

/** `dialog.resources[]` - the files uploaded with a skill folder. */
function readResources(dialog: Dict): SkillResource[] {
  return list(dialog['resources']).flatMap((raw) => {
    if (!isDict(raw)) return [];
    const path = str(raw['path']);
    if (path === undefined) return [];

    const fileName = path.split('/').pop() ?? path;
    const extension = (fileName.split('.').pop() ?? '').toLowerCase();
    const encoded = str(raw['contentBase64']);
    const wantsText = TEXT_EXTENSIONS.has(extension) || SCRIPT_EXTENSIONS.has(extension);
    const decoded = encoded === undefined ? { text: undefined, bytes: 0 } : decodeBase64(encoded);

    return [
      {
        path,
        fileName,
        extension,
        // Only decode what is meaningful as text; a .pptx or .png stays a size.
        text: wantsText ? decoded.text : undefined,
        bytes: decoded.bytes,
      },
    ];
  });
}

/** Copilot Studio sometimes stores only a bundle marker where content should be. */
function isBundleMarker(content: string): boolean {
  return /^<!--[^>]*-->$/.test(content.trim());
}

function readSkills(
  components: unknown[],
  warnings: string[],
): { skills: Skill[]; resources: SkillResource[] } {
  const skills: Skill[] = [];
  const resources: SkillResource[] = [];

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

    const own = readResources(dialog);
    resources.push(...own);

    // A skill folder puts its real instructions in skill.md; `dialog.content` is
    // then only a bundle marker. Prefer the file, fall back to inline content.
    const inline = str(dialog['content']);
    const fromFile =
      own.find((resource) => resource.fileName.toLowerCase() === 'skill.md')?.text ??
      own.find((resource) => resource.fileName.toLowerCase() === 'agent_instructions.md')?.text;
    const chosen = fromFile ?? (inline !== undefined && !isBundleMarker(inline) ? inline : undefined);

    skills.push({
      id: newId(ID_PREFIX.skill),
      name: humanise(name),
      ...(str(component['description']) === undefined ? {} : { description: str(component['description']) }),
      ...(chosen === undefined ? {} : { instructions: stripFrontMatter(chosen) }),
    });
  }

  return { skills, resources };
}

/**
 * Scripts shipped with a skill become tools in their own right - they are code the
 * agent runs, which is exactly what a tool is. The source travels with them so the
 * script is readable in the app, not just named.
 */
function toolsFromScripts(resources: SkillResource[]): Tool[] {
  return resources
    .filter((resource) => SCRIPT_EXTENSIONS.has(resource.extension))
    .map((resource) => ({
      id: newId(ID_PREFIX.tool),
      name: resource.fileName,
      description: firstDocLine(resource.text) ?? `Script shipped with the agent (${resource.path}).`,
      type: resource.extension === 'py' ? ('python' as const) : ('python' as const),
      config: {
        source: 'copilot-studio',
        path: resource.path,
        language: resource.extension,
        bytes: resource.bytes,
        ...(resource.text === undefined ? {} : { code: resource.text }),
      },
    }));
}

/** The first meaningful line of a script, used as its description. */
function firstDocLine(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  for (const raw of text.split('\n').slice(0, 12)) {
    const line = raw.replace(/^[#\s"']+/, '').replace(/["']+$/, '').trim();
    if (line === '' || line.startsWith('!')) continue;
    if (line.length < 4) continue;
    return line.length > 160 ? `${line.slice(0, 157)}…` : line;
  }
  return undefined;
}

/** Everything that is not a script becomes a data source the agent reads. */
function dataFromResources(resources: SkillResource[]): DataSource[] {
  return resources
    .filter((resource) => !SCRIPT_EXTENSIONS.has(resource.extension))
    .map((resource) => ({
      id: newId(ID_PREFIX.dataSource),
      name: resource.fileName,
      type: resource.extension === 'md' ? ('md' as const) : ('file' as const),
      // It ships inside the agent, so it is genuinely present and connected.
      status: 'live' as const,
      linked: true,
      ref: resource.path,
    }));
}

/**
 * `GlobalVariableComponent` entries are the saved parameter values of a tool -
 * `VCSucheDataverse.organization` belongs to the VC-Suche tool. They are folded
 * into that tool's config rather than dropped.
 */
function readGlobalVariables(components: unknown[]): Map<string, Record<string, unknown>> {
  const byPrefix = new Map<string, Record<string, unknown>>();

  for (const component of components) {
    if (!isDict(component) || component['kind'] !== 'GlobalVariableComponent') continue;
    const variable = component['variable'];
    if (!isDict(variable)) continue;

    const name = str(variable['name']) ?? str(component['displayName']);
    if (name === undefined) continue;

    const [prefix, ...rest] = name.split('.');
    if (prefix === undefined || rest.length === 0) continue;

    const bucket = byPrefix.get(prefix) ?? {};
    bucket[rest.join('.')] = variable['defaultValue'] ?? null;
    byPrefix.set(prefix, bucket);
  }

  return byPrefix;
}

/** Match `VCSucheDataverse` to the tool named `VC-Suche Dataverse`. */
function normaliseKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
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

/**
 * Knowledge sources attached in Copilot Studio. The component carries its own
 * `displayName` and `description` - "Projektakte", plus prose on when to use it -
 * so those are kept rather than a label guessed from the URL.
 */
function readKnowledge(components: unknown[]): DataSource[] {
  const sources: DataSource[] = [];

  for (const component of components) {
    if (!isDict(component) || component['kind'] !== 'KnowledgeSourceComponent') continue;

    const configuration = component['configuration'];
    const source = isDict(configuration) ? configuration['source'] : undefined;
    if (!isDict(source) || source['kind'] !== 'SharePointKnowledgeSource') continue;

    const url = str(source['siteUrl']);
    if (url === undefined) continue;

    const name = str(component['displayName']) ?? humanise(sharePointLabel(url));
    const description = str(component['description']);

    sources.push({
      id: newId(ID_PREFIX.dataSource),
      name,
      type: 'sharepoint',
      // Knowledge attached in Copilot Studio is genuinely connected.
      status: 'live',
      linked: true,
      ref: url,
      ...(description !== undefined ? { description } : {}),
    });
  }

  return sources;
}

/** `/sites/IhebTest/Shared Documents` reads best as "IhebTest / Shared Documents". */
function sharePointLabel(url: string): string {
  try {
    const decoded = decodeURIComponent(new URL(url).pathname);
    const segments = decoded.split('/').filter((part) => part !== '');
    const after = segments[0] === 'sites' || segments[0] === 'teams' ? segments.slice(1) : segments;
    return after.length > 0 ? after.join(' / ') : 'SharePoint';
  } catch {
    return 'SharePoint';
  }
}

/** The environment host, `https://slxcrowd.crm4.dynamics.com` -> "slxcrowd". */
function dataverseLabel(url: string): string {
  try {
    return new URL(url).hostname.split('.')[0] ?? url;
  } catch {
    return url;
  }
}

const DATAVERSE_HOST = /\.dynamics\.com$/i;
const SHAREPOINT_HOST = /\.sharepoint\.com$/i;
/** A saved list value is sometimes the list's GUID rather than its name. */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hostMatches(value: unknown, pattern: RegExp): string | undefined {
  const text = str(value);
  if (text === undefined || !text.startsWith('http')) return undefined;
  try {
    return pattern.test(new URL(text).hostname) ? text : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The data platforms a tool actually reads through.
 *
 * A `GlobalVariableComponent` group such as `VCSucheDataverse.*` is the saved
 * configuration of one connection: which environment, which table, which columns.
 * Those values name a real Dataverse table or SharePoint list the agent queries,
 * so each becomes a data source in its own right - not only a parameter blob on a
 * tool. Without this, an export whose only knowledge source is a document library
 * looks as if the agent reads nothing from CRM, which is the opposite of the truth.
 */
function connectionSources(variables: Map<string, Record<string, unknown>>): DataSource[] {
  const sources: DataSource[] = [];

  for (const [prefix, values] of variables) {
    const entries = Object.entries(values);

    const organisation = entries.map(([, v]) => hostMatches(v, DATAVERSE_HOST)).find((v) => v !== undefined);
    const site = entries.map(([, v]) => hostMatches(v, SHAREPOINT_HOST)).find((v) => v !== undefined);

    // `entityName` for Dataverse, `table`/`table1`/… for SharePoint lists.
    const named = (test: (key: string) => boolean): string[] => {
      const found = entries
        .filter(([key]) => test(key))
        .map(([, value]) => str(value))
        .filter((value): value is string => value !== undefined && value !== '' && !GUID.test(value));
      return [...new Set(found)];
    };

    if (organisation !== undefined) {
      const environment = dataverseLabel(organisation);
      const tables = named((key) => key === 'entityName');
      const columns = str(values['$select']);
      for (const table of tables.length > 0 ? tables : [environment]) {
        sources.push({
          id: newId(ID_PREFIX.dataSource),
          name: tables.length > 0 ? `${environment} / ${table}` : environment,
          type: 'dataverse',
          status: 'live',
          linked: true,
          ref: organisation,
          description:
            `Queried by the "${humanise(prefix)}" connection` +
            (columns !== undefined ? `, reading ${columns}.` : '.'),
        });
      }
    }

    if (site !== undefined) {
      const siteLabel = sharePointLabel(site);
      const lists = named((key) => /^table\d*$/.test(key));
      for (const list of lists.length > 0 ? lists : [siteLabel]) {
        sources.push({
          id: newId(ID_PREFIX.dataSource),
          name: lists.length > 0 ? `${siteLabel} / ${list}` : siteLabel,
          type: 'sharepoint',
          status: 'live',
          linked: true,
          ref: site,
          description: `Queried by the "${humanise(prefix)}" connection.`,
        });
      }
    }
  }

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
  const { skills, resources } = readSkills(components, warnings);

  const flowTools = readTools(list(root['flows']), warnings);
  const scriptTools = toolsFromScripts(resources);
  const tools = [...flowTools, ...scriptTools];

  // Saved tool parameters travel with the tool they belong to.
  const variables = readGlobalVariables(components);
  for (const [prefix, values] of variables) {
    const owner = flowTools.find((tool) => normaliseKey(prefix) === normaliseKey(tool.name));
    if (owner) {
      owner.config = { ...owner.config, parameters: values };
      continue;
    }
    // The saved configuration of a connection whose tool is not in this export.
    // It still names a real table, so say so rather than dropping it in silence.
    warnings.push(
      `Saved settings for "${humanise(prefix)}" belong to no tool in this export; kept as a data source.`,
    );
  }

  const dataSources = [
    ...readKnowledge(components),
    ...connectionSources(variables),
    ...dataFromResources(resources),
  ];

  if (skills.length === 0) warnings.push('No agent skills were found in this export.');
  if (flowTools.length > 0) {
    warnings.push(
      `${flowTools.length} Power Automate flow${flowTools.length === 1 ? '' : 's'} imported with their inputs and outputs. Copilot Studio exports carry a flow's signature but not its internal steps, so add those in the tool editor if you want the diagram.`,
    );
  }
  if (scriptTools.length > 0) {
    warnings.push(
      `${scriptTools.length} script${scriptTools.length === 1 ? '' : 's'} imported with ${scriptTools.length === 1 ? 'its' : 'their'} source.`,
    );
  }
  if (resources.length > 0) {
    warnings.push(
      `${resources.length} skill resource${resources.length === 1 ? '' : 's'} found (scripts, references, templates and images).`,
    );
  }
  if (flowTools.length === 0 && scriptTools.length === 0) {
    warnings.push('No flows or scripts were found in this export.');
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
