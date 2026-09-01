/**
 * SPEC 8.7 - "Libraries as entities ... Includes a library manager view
 * (list, edit, see usage)."
 *
 * Every field the schema carries is reachable from here: a skill's description and
 * instructions, a tool's description, type and workflow steps (SPEC §8.6), and a
 * data source's type, status, `linked` flag and `ref`. Deleting an item that is
 * still in use is blocked by the store, which returns the usage list (SPEC §5.8).
 */
import { useState } from 'react';
import { selectActiveFleet, useFleetStore } from '../store/fleetStore.js';
import { useUiStore } from '../store/uiStore.js';
import { agentsUsing } from '../model/selectors.js';
import { DATA_SOURCE_STATUS_LABELS } from '../model/schemas.js';
import type { DataSourceType, LibraryKind, Status } from '../model/schemas.js';
import { DATA_TYPE_COLOR, SKILL_COLOR, STATUS_COLOR, TOOL_TYPE_COLOR } from '../ui/palette.js';
import { ToolEditor } from './ToolEditor.js';

const TABS: { kind: LibraryKind; label: string }[] = [
  { kind: 'skill', label: 'Skills' },
  { kind: 'tool', label: 'Tools' },
  { kind: 'dataSource', label: 'Data sources' },
];

const DATA_TYPES: DataSourceType[] = ['md', 'dataverse', 'sharepoint', 'file'];
const STATUSES: Status[] = ['live', 'building', 'planned'];

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

  const items =
    tab === 'skill'
      ? fleet.skills.map((s) => ({ id: s.id, name: s.name, dot: SKILL_COLOR }))
      : tab === 'tool'
        ? fleet.tools.map((t) => ({ id: t.id, name: t.name, dot: TOOL_TYPE_COLOR[t.type] }))
        : fleet.dataSources.map((d) => ({ id: d.id, name: d.name, dot: DATA_TYPE_COLOR[d.type] }));

  return (
    <div className="dialog-scrim" role="dialog" aria-modal="true" data-testid="library-manager">
      <div className="dialog library-dialog">
        <h2>Libraries</h2>
        <p className="dialog-lead">
          Skills, tools and data sources are shared across the fleet and referenced by id, so
          renaming one updates every agent that uses it.
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

        <div className="lib-list">
          {items.length === 0 && <p className="dialog-lead">Nothing in this library yet.</p>}
          {items.map((item) => {
            const users = agentsUsing(fleet, tab, item.id);
            const editing = editingId === item.id;
            return (
              <div key={item.id} className={`lib-entry ${editing ? 'editing' : ''}`}>
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

                  <div className="lib-users">
                    {users.length === 0 ? (
                      <small>unused</small>
                    ) : (
                      users.map((agent) => (
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
                      ))
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
                {editing && tab === 'tool' && <ToolFields id={item.id} onClose={() => setEditingId(null)} />}
                {editing && tab === 'dataSource' && <DataFields id={item.id} />}
              </div>
            );
          })}
        </div>

        <div className="lib-add">
          <input
            value={newName}
            placeholder={`New ${tab === 'dataSource' ? 'data source' : tab} name`}
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

  function SkillFields({ id }: { id: string }): React.JSX.Element | null {
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
      </div>
    );
  }

  function ToolFields({ id, onClose }: { id: string; onClose: () => void }): React.JSX.Element | null {
    const tool = fleet?.tools.find((t) => t.id === id);
    if (!tool) return null;
    return (
      <ToolEditor
        tool={tool}
        error={error}
        onClose={onClose}
        onChange={(patch) => {
          const result = updateTool(id, patch);
          setError(result.ok ? null : result.reason);
        }}
      />
    );
  }

  function DataFields({ id }: { id: string }): React.JSX.Element | null {
    const source = fleet?.dataSources.find((d) => d.id === id);
    if (!source) return null;
    return (
      <div className="lib-fields" data-testid="data-editor">
        <div className="lib-field-row">
          <label className="dialog-field">
            <span>Type</span>
            <select
              value={source.type}
              aria-label={`Type of ${source.name}`}
              onChange={(event) => updateDataSource(id, { type: event.target.value as DataSourceType })}
            >
              {DATA_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="dialog-field">
            <span>Status</span>
            <select
              value={source.status}
              style={{ color: STATUS_COLOR[source.status] }}
              aria-label={`Status of ${source.name}`}
              onChange={(event) => updateDataSource(id, { status: event.target.value as Status })}
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {DATA_SOURCE_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* SPEC §4: `linked` is only meaningful once the source is Ready. */}
        {source.status === 'live' && (
          <label className="lib-check">
            <input
              type="checkbox"
              checked={source.linked ?? false}
              data-testid="data-linked"
              onChange={(event) => updateDataSource(id, { linked: event.target.checked })}
            />
            <span>Linked — the agent can actually read it</span>
          </label>
        )}

        <label className="dialog-field">
          <span>Reference (URI, path or table)</span>
          <input
            defaultValue={source.ref ?? ''}
            aria-label={`Reference for ${source.name}`}
            placeholder="sites/sales/prices"
            onBlur={(event) => updateDataSource(id, { ref: event.target.value })}
          />
        </label>
      </div>
    );
  }
}
