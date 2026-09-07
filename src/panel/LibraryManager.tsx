/**
 * SPEC 8.7 - "Libraries as entities ... Includes a library manager view
 * (list, edit, see usage)."
 *
 * Every field the schema carries is reachable from here: a skill's description and
 * instructions, a tool's description, type and workflow steps (SPEC §8.6), and a
 * data item's source (a system, or a department), whether it exists or is still
 * owed and by which department, what it sits inside, its `ref` and notes. The
 * Ansprechpartner shown beside the department is the department's own, edited here
 * for convenience but stored once on the department itself.
 *
 * Deleting an item that is still in use is blocked by the store, which returns the
 * usage list (SPEC §5.8); so is deleting one that still contains other items.
 */
import { useState } from 'react';
import { selectActiveFleet, useFleetStore } from '../store/fleetStore.js';
import { useUiStore } from '../store/uiStore.js';
import {
  agentsUsing,
  dataMatchesQuery,
  dataItemMatches,
  flattenData,
  providerOptions,
} from '../model/selectors.js';
import { DATA_SOURCE_LABELS, DATA_SOURCE_STATUS_LABELS } from '../model/schemas.js';
import { ANY_DATA } from '../model/selectors.js';
import type { DataQuery } from '../model/selectors.js';
import type { DataSourceType, LibraryKind, Status } from '../model/schemas.js';
import { dataDotColor, SKILL_COLOR, STATUS_COLOR, TOOL_TYPE_COLOR } from '../ui/palette.js';
import { ToolEditor } from './ToolEditor.js';
import { DataFields } from './DataFields.js';
import { NotesField } from './NotesField.js';

const TABS: { kind: LibraryKind; label: string }[] = [
  { kind: 'skill', label: 'Skills' },
  { kind: 'tool', label: 'Tools' },
  { kind: 'dataSource', label: 'Data' },
];

const DATA_TYPES: DataSourceType[] = ['dataverse', 'sharepoint', 'md', 'file', 'department'];

const STATUSES: Status[] = ['live', 'building', 'planned'];

/** How many users of an item a row names before it starts counting instead. */
const USERS_SHOWN = 3;

/** The provider axis as a <select> value, and back again. */
const providerValue = (provider: DataQuery['provider']): string =>
  provider.kind === 'all' ? '' : provider.kind === 'none' ? 'none' : `by:${provider.name}`;

// Prefixed, so a department called "none" is still just a department.
const providerFromValue = (value: string): DataQuery['provider'] =>
  value === ''
    ? { kind: 'all' }
    : value === 'none'
      ? { kind: 'none' }
      : { kind: 'provider', name: value.slice('by:'.length) };

/** The source axis as a <select> value, and back again. */
const sourceValue = (source: DataQuery['source']): string => source ?? '';
const sourceFromValue = (value: string): DataQuery['source'] =>
  value === '' ? null : value === 'unassigned' ? 'unassigned' : (value as DataSourceType);

export function LibraryManager(): React.JSX.Element | null {
  const open = useUiStore((s) => s.libraryOpen);
  const close = useUiStore((s) => s.closeLibrary);
  const activate = useUiStore((s) => s.activate);
  const fleet = useFleetStore(selectActiveFleet);

  const addSkill = useFleetStore((s) => s.addSkill);
  const addTool = useFleetStore((s) => s.addTool);
  const addDataSource = useFleetStore((s) => s.addDataSource);
  const updateSkill = useFleetStore((s) => s.updateSkill);
  const updateTool = useFleetStore((s) => s.updateTool);
  const updateDataSource = useFleetStore((s) => s.updateDataSource);
  const deleteSkill = useFleetStore((s) => s.deleteSkill);
  const deleteTool = useFleetStore((s) => s.deleteTool);
  const deleteDataSource = useFleetStore((s) => s.deleteDataSource);

  const [tab, setTab] = useState<LibraryKind>('skill');
  /** Data tab only: show just what one department has to provide. */
  const [query, setQuery] = useState<DataQuery>(ANY_DATA);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [blockedBy, setBlockedBy] = useState<string[] | null>(null);

  if (!open || !fleet) return null;

  const clearMessages = (): void => {
    setError(null);
    setBlockedBy(null);
  };

  const create = (): void => {
    const name = newName.trim();
    if (name === '') return;
    const result =
      tab === 'skill'
        ? addSkill({ name })
        : tab === 'tool'
          ? addTool({ name, description: `${name}`, type: 'python' })
          : addDataSource({ name, type: 'sharepoint', status: 'planned' });

    if (result.ok) {
      setNewName('');
      clearMessages();
      // Open the new item straight away: a tool created here still needs a
      // description and, if it is a flow, its steps.
      setEditingId(result.id);
    } else {
      setError(result.reason);
    }
  };

  const remove = (id: string): void => {
    const result = tab === 'skill' ? deleteSkill(id) : tab === 'tool' ? deleteTool(id) : deleteDataSource(id);
    if (result.ok) {
      clearMessages();
      if (editingId === id) setEditingId(null);
    } else {
      setError(result.reason);
      setBlockedBy(result.blockedBy ?? null);
    }
  };

  const rename = (id: string, next: string): boolean => {
    const result =
      tab === 'skill'
        ? updateSkill(id, { name: next })
        : tab === 'tool'
          ? updateTool(id, { name: next })
          : updateDataSource(id, { name: next });
    if (!result.ok) setError(result.reason);
    return result.ok;
  };

  // `noted` drives the marker on the row: a note nobody can find again is worth
  // little, so the list says which items carry one without opening them.
  const hasNote = (notes: string | undefined): boolean => (notes ?? '').trim() !== '';
  const items =
    tab === 'skill'
      ? fleet.skills.map((s) => ({
          id: s.id,
          name: s.name,
          dot: SKILL_COLOR,
          noted: hasNote(s.notes),
          depth: 0,
        }))
      : tab === 'tool'
        ? fleet.tools.map((t) => ({
            id: t.id,
            name: t.name,
            dot: TOOL_TYPE_COLOR[t.type],
            noted: hasNote(t.notes),
            depth: 0,
          }))
        : // Data nests, so it is listed as a tree: parents first, contents indented
          // under them. A flat list of leaves hides which whole they belong to.
          flattenData(fleet)
            .filter(({ source }) => dataMatchesQuery(fleet, source, query))
            .map(({ source, depth }) => ({
              id: source.id,
              name: source.name,
              dot: dataDotColor(source.type),
              noted: hasNote(source.notes),
              depth,
            }));

  return (
    <div className="dialog-scrim" role="dialog" aria-modal="true" data-testid="library-manager">
      <div className="dialog library-dialog">
        <h2>Libraries</h2>
        <p className="dialog-lead">
          Skills, tools and data are shared across the fleet and referenced by id, so renaming one
          updates every agent that uses it. Data nests: an item placed &ldquo;inside&rdquo; another
          travels with it whenever an agent is linked to the parent.
        </p>

        <div className="lib-tabs">
          {TABS.map((entry) => (
            <button
              key={entry.kind}
              type="button"
              className={`chrome-btn ${tab === entry.kind ? 'on' : ''}`}
              onClick={() => {
                setTab(entry.kind);
                setEditingId(null);
                clearMessages();
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {tab === 'dataSource' && (
          <div className="lib-filters" data-testid="data-filter">
            {/* Counts answer the question before the chip is clicked. They respect
                the other two axes, so "3" means three under what is already set. */}
            <div className="lib-chips">
              {([null, ...STATUSES] as (Status | null)[]).map((status) => {
                const count = fleet.dataSources.filter((source) =>
                  dataItemMatches(source, { ...query, status }),
                ).length;
                return (
                  <button
                    key={status ?? 'all'}
                    type="button"
                    className={`chrome-btn ${query.status === status ? 'on' : ''}`}
                    data-testid={`data-status-${status ?? 'all'}`}
                    onClick={() => setQuery({ ...query, status })}
                  >
                    {status !== null && (
                      <span className="fdot" style={{ background: STATUS_COLOR[status] }} />
                    )}
                    {status === null ? 'All' : DATA_SOURCE_STATUS_LABELS[status]} {count}
                  </button>
                );
              })}
            </div>

            <div className="lib-filter">
              <label htmlFor="data-source-filter">Source</label>
              <select
                id="data-source-filter"
                data-testid="data-source-filter"
                value={sourceValue(query.source)}
                onChange={(event) => setQuery({ ...query, source: sourceFromValue(event.target.value) })}
              >
                <option value="">Any source</option>
                {DATA_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {DATA_SOURCE_LABELS[type]}
                  </option>
                ))}
                <option value="unassigned">Not assigned yet</option>
              </select>
            </div>

            <div className="lib-filter">
            <label htmlFor="data-provider-filter">Provided by</label>
            <select
              id="data-provider-filter"
              data-testid="data-provider-filter"
              value={providerValue(query.provider)}
              onChange={(event) =>
                setQuery({ ...query, provider: providerFromValue(event.target.value) })
              }
            >
              <option value="">Every department</option>
              <option value="none">Nobody yet</option>
              {providerOptions(fleet).map((provider) => (
                <option key={provider} value={`by:${provider}`}>
                  {provider}
                </option>
              ))}
            </select>
              {query.provider.kind !== 'all' && (
                <button
                  type="button"
                  className="lib-filter-clear"
                  onClick={() => setQuery({ ...query, provider: { kind: 'all' } })}
                  aria-label="Show data from every department again"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )}

        <div className="lib-list">
          {items.length === 0 && <p className="dialog-lead">Nothing in this library yet.</p>}
          {items.map((item) => {
            const users = agentsUsing(fleet, tab, item.id);
            const editing = editingId === item.id;
            return (
              <div
                key={item.id}
                className={`lib-entry ${editing ? 'editing' : ''}`}
                data-depth={item.depth}
                // Indent by nesting depth so a whole and its parts read as one thing.
                style={item.depth > 0 ? { marginLeft: `${item.depth * 14}px` } : undefined}
              >
                <div className="lib-row">
                  <span className="tdot" style={{ background: item.dot }} />
                  <input
                    className="lib-name"
                    defaultValue={item.name}
                    key={`${item.id}-${item.name}`}
                    aria-label={`Rename ${item.name}`}
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      if (next === '' || next === item.name) {
                        event.target.value = item.name;
                        return;
                      }
                      if (!rename(item.id, next)) event.target.value = item.name;
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                  />

                  {item.noted && (
                    <span
                      className="lib-note-dot"
                      data-testid="lib-note-dot"
                      title={`${item.name} has a note`}
                    />
                  )}

                  {/* Shared context is used by every agent in the fleet, and fifteen
                      names stacked in one row bury the rest of the library. Show a
                      few and count the rest. */}
                  <div className="lib-users">
                    {users.length === 0 ? (
                      <small>unused</small>
                    ) : (
                      <>
                        {users.slice(0, USERS_SHOWN).map((agent) => (
                          <button
                            key={agent.id}
                            type="button"
                            className="ubn"
                            onClick={() => {
                              activate(agent.id);
                              close();
                            }}
                          >
                            {agent.name}
                          </button>
                        ))}
                        {users.length > USERS_SHOWN && (
                          <small title={users.map((agent) => agent.name).join(', ')}>
                            +{users.length - USERS_SHOWN} more
                          </small>
                        )}
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    className="lib-edit"
                    aria-expanded={editing}
                    aria-label={`${editing ? 'Close' : 'Edit'} ${item.name}`}
                    data-testid="lib-edit"
                    onClick={() => {
                      setEditingId(editing ? null : item.id);
                      clearMessages();
                    }}
                  >
                    {editing ? '▴' : '▾'}
                  </button>
                  <button
                    type="button"
                    className="lib-delete"
                    onClick={() => remove(item.id)}
                    aria-label={`Delete ${item.name}`}
                  >
                    ✕
                  </button>
                </div>

                {editing && tab === 'skill' && <SkillFields id={item.id} />}
                {editing && tab === 'tool' && <ToolFields id={item.id} onClose={() => setEditingId(null)} error={error} onError={setError} />}
                {editing && tab === 'dataSource' && <DataFields id={item.id} onError={setError} />}
              </div>
            );
          })}
        </div>

        <div className="lib-add">
          <input
            value={newName}
            placeholder={`New ${tab === 'dataSource' ? 'data' : tab} name`}
            aria-label="New library item name"
            data-testid="lib-new-name"
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') create();
            }}
          />
          <button type="button" onClick={create} disabled={newName.trim() === ''}>
            Add
          </button>
        </div>

        {error && (
          <p className="dialog-error" role="status" data-testid="library-error">
            {error}
            {blockedBy && blockedBy.length > 0 && <> Used by: {blockedBy.join(', ')}.</>}
          </p>
        )}

        <div className="dialog-row">
          <button type="button" className="btn" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
/**
 * The three editors are top-level components on purpose. Declared inside
 * LibraryManager they got a new component identity on every render, so React
 * remounted them after each commit and the uncontrolled fields lost whatever had
 * just been typed into the next one.
 */
function SkillFields({ id }: { id: string }): React.JSX.Element | null {
  const fleet = useFleetStore(selectActiveFleet);
  const updateSkill = useFleetStore((s) => s.updateSkill);
  const skill = fleet?.skills.find((s) => s.id === id);
  if (!skill) return null;
  return (
    <div className="lib-fields" data-testid="skill-editor">
      <label className="dialog-field">
        <span>Description</span>
        <input
          defaultValue={skill.description ?? ''}
          aria-label={`Description of ${skill.name}`}
          onBlur={(event) => updateSkill(id, { description: event.target.value })}
        />
      </label>
      <label className="dialog-field">
        <span>Instructions</span>
        <textarea
          rows={2}
          defaultValue={skill.instructions ?? ''}
          aria-label={`Instructions for ${skill.name}`}
          data-testid="skill-instructions"
          onBlur={(event) => updateSkill(id, { instructions: event.target.value })}
        />
      </label>
      <NotesField
        value={skill.notes}
        label={skill.name}
        testId="skill-notes"
        onCommit={(next) => updateSkill(id, { notes: next })}
      />
    </div>
  );
}

function ToolFields({
  id,
  onClose,
  error,
  onError,
}: {
  id: string;
  onClose: () => void;
  error: string | null;
  onError: (reason: string | null) => void;
}): React.JSX.Element | null {
  const fleet = useFleetStore(selectActiveFleet);
  const updateTool = useFleetStore((s) => s.updateTool);
  const tool = fleet?.tools.find((t) => t.id === id);
  if (!tool) return null;
  return (
    <ToolEditor
      tool={tool}
      error={error}
      onClose={onClose}
      onChange={(patch) => {
        const result = updateTool(id, patch);
        onError(result.ok ? null : result.reason);
      }}
    />
  );
}
