/**
 * Every field in the schema is either editable in the app or explicitly exempt.
 *
 * This exists because the gaps were being found one at a time by hand: `linked`
 * was hidden behind a status, `DataSource.description` had no editor at all, and
 * both were only noticed by someone staring at a screen. A list of fields is
 * knowable, so it should be checked rather than remembered.
 *
 * Adding a field to a schema now fails here until it is either given an editor or
 * listed as exempt WITH A REASON. The reason is the point: an exemption somebody
 * had to justify is very different from a field nobody thought about.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AgentSchema,
  DataSourceSchema,
  EdgeSchema,
  FleetSchema,
  ModelConfigSchema,
  SkillSchema,
  SourceKindSchema,
  ToolSchema,
  WorkflowStepSchema,
} from '../../src/model/schemas.js';

/** Every source file that can write to the document. */
const EDITORS = [
  'src/panel/DataFields.tsx',
  'src/panel/Inspector.tsx',
  'src/panel/EdgeInspector.tsx',
  'src/panel/LibraryManager.tsx',
  'src/panel/CatalogManager.tsx',
  'src/panel/ToolEditor.tsx',
  'src/panel/NotesField.tsx',
  'src/views/data/DataTree.tsx',
  'src/views/data/DataDepartments.tsx',
  'src/views/data/SourceKinds.tsx',
  'src/views/chrome/FleetBar.tsx',
  'src/views/board2d/AgentNode.tsx',
].map((path) => readFileSync(path, 'utf8'));

/**
 * Fields no editor should offer, each with the reason it is not an oversight.
 * Keyed `Schema.field`.
 */
const EXEMPT: Record<string, string> = {
  // Identity and structure, not content.
  'Agent.id': 'generated identity',
  'DataSource.id': 'generated identity',
  'Edge.id': 'generated identity',
  'Skill.id': 'generated identity',
  'Tool.id': 'generated identity',
  'WorkflowStep.id': 'generated identity',
  'SourceKind.id': 'generated identity',
  'Fleet.id': 'generated identity',
  'Fleet.schemaVersion': 'set by the app, migrated on import',
  'Edge.source': 'the link flow picks both ends; re-link rather than retype an id',
  'Edge.target': 'the link flow picks both ends; re-link rather than retype an id',

  // Collections, edited through their own items rather than as a field.
  'Fleet.agents': 'edited as agents',
  'Fleet.edges': 'edited as links',
  'Fleet.skills': 'edited in Libraries',
  'Fleet.tools': 'edited in Libraries',
  'Fleet.dataSources': 'edited in the Data view',
  'Fleet.sourceKinds': 'edited in the Sources dialog',
  'Agent.skillIds': 'edited as chips on the agent',
  'Agent.toolIds': 'edited as chips on the agent',
  'Agent.dataSourceIds': 'edited as chips on the agent',
  'Tool.workflow': 'edited step by step in the tool editor',
  'WorkflowStep.next': 'edited by wiring steps, not by typing ids',

  // Set by direct manipulation instead of a field.
  'Agent.position': 'set by dragging the card',
};

/** `Foo.bar` for every field of every schema the document is made of. */
function fieldsOf(name: string, shape: Record<string, unknown>): string[] {
  return Object.keys(shape).map((field) => `${name}.${field}`);
}

const ALL_FIELDS = [
  ...fieldsOf('Fleet', FleetSchema.shape),
  ...fieldsOf('Agent', AgentSchema.shape),
  ...fieldsOf('Edge', EdgeSchema.shape),
  ...fieldsOf('Skill', SkillSchema.shape),
  ...fieldsOf('Tool', ToolSchema.shape),
  ...fieldsOf('WorkflowStep', WorkflowStepSchema.shape),
  ...fieldsOf('DataSource', DataSourceSchema.shape),
  ...fieldsOf('ModelConfig', ModelConfigSchema.shape),
  ...fieldsOf('SourceKind', SourceKindSchema.shape),
];

/**
 * Whether any editor writes this field. A write looks like `{ field: ` or
 * `field: event.target` or a named setter - deliberately loose, because the point
 * is to catch a field NOTHING mentions, not to police how it is written.
 */
function isEdited(field: string): boolean {
  const bare = field.split('.')[1] ?? '';
  const patterns = [
    new RegExp(`\\{\\s*${bare}:`),
    new RegExp(`${bare}:\\s*event\\.target`),
    new RegExp(`${bare}:\\s*next`),
    new RegExp(`\\b${bare}:\\s*[a-z]`),
  ];
  return EDITORS.some((source) => patterns.some((pattern) => pattern.test(source)));
}

describe('every schema field is editable in the app, or exempt with a reason', () => {
  it('covers every field', () => {
    const missing = ALL_FIELDS.filter((field) => EXEMPT[field] === undefined && !isEdited(field));
    expect(missing).toEqual([]);
  });

  it('exempts nothing that no longer exists', () => {
    const stale = Object.keys(EXEMPT).filter((field) => !ALL_FIELDS.includes(field));
    expect(stale).toEqual([]);
  });

  it('gives a reason for every exemption', () => {
    const unexplained = Object.entries(EXEMPT).filter(([, reason]) => reason.trim() === '');
    expect(unexplained).toEqual([]);
  });

  it('would notice a field nobody had wired up', () => {
    // The guard has to be able to fail, or it is decoration.
    expect(isEdited('DataSource.somethingNobodyAdded')).toBe(false);
  });

  it('sees a field that is wired up', () => {
    expect(isEdited('DataSource.requirement')).toBe(true);
    expect(isEdited('DataSource.linked')).toBe(true);
    expect(isEdited('DataSource.description')).toBe(true);
  });
});
