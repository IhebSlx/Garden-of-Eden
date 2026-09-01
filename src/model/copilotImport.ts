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
  const { skills, resources } = readSkills(components, warnings);

  const flowTools = readTools(list(root['flows']), warnings);
  const scriptTools = toolsFromScripts(resources);
  const tools = [...flowTools, ...scriptTools];

  // Saved tool parameters travel with the tool they belong to.
  const variables = readGlobalVariables(components);
  for (const tool of flowTools) {
    for (const [prefix, values] of variables) {
      if (normaliseKey(prefix) !== normaliseKey(tool.name)) continue;
      tool.config = { ...tool.config, parameters: values };
    }
  }

  const dataSources = [...readKnowledge(components), ...dataFromResources(resources)];

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
