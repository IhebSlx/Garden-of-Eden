/**
 * SPEC 8.7 - "Libraries as entities ... Includes a library manager view
 * (list, edit, see usage)."
 *
 * Deleting an item that is still in use is blocked by the store, which returns the
 * usage list; this view shows that list instead of the error (SPEC 5.8).
 */
import { useState } from 'react';
import { selectActiveFleet, useFleetStore } from '../store/fleetStore.js';
import { useUiStore } from '../store/uiStore.js';
import { agentsUsing } from '../model/selectors.js';
import { DATA_SOURCE_STATUS_LABELS } from '../model/schemas.js';
import type { DataSourceType, LibraryKind, ToolType } from '../model/schemas.js';
import { DATA_TYPE_COLOR, SKILL_COLOR, STATUS_COLOR, TOOL_TYPE_COLOR } from '../ui/palette.js';

const TABS: { kind: LibraryKind; label: string }[] = [
  { kind: 'skill', label: 'Skills' },
  { kind: 'tool', label: 'Tools' },
  { kind: 'dataSource', label: 'Data sources' },
];

const TOOL_TYPES: ToolType[] = ['workflow', 'python', 'microsoft'];
const DATA_TYPES: DataSourceType[] = ['md', 'dataverse', 'sharepoint'];

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
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [blockedBy, setBlockedBy] = useState<string[] | null>(null);

  if (!open || !fleet) return null;

  const create = (): void => {
    const name = newName.trim();
    if (name === '') return;
    const result =
      tab === 'skill'
        ? addSkill({ name })
        : tab === 'tool'
          ? addTool({ name, description: `${name} tool`, type: 'python' })
          : addDataSource({ name, type: 'sharepoint', status: 'planned' });

    if (result.ok) {
      setNewName('');
      setError(null);
    } else {
      setError(result.reason);
    }
  };

  const remove = (kind: LibraryKind, id: string): void => {
    const result =
      kind === 'skill' ? deleteSkill(id) : kind === 'tool' ? deleteTool(id) : deleteDataSource(id);
    if (result.ok) {
      setError(null);
      setBlockedBy(null);
    } else {
      setError(result.reason);
      setBlockedBy(result.blockedBy ?? null);
    }
  };

  const items =
    tab === 'skill'
      ? fleet.skills.map((s) => ({ id: s.id, name: s.name, dot: SKILL_COLOR, meta: 'skill' }))
      : tab === 'tool'
        ? fleet.tools.map((t) => ({
            id: t.id,
            name: t.name,
            dot: TOOL_TYPE_COLOR[t.type],
            meta: t.type,
          }))
        : fleet.dataSources.map((d) => ({
            id: d.id,
            name: d.name,
            dot: DATA_TYPE_COLOR[d.type],
            meta: `${d.type} · ${DATA_SOURCE_STATUS_LABELS[d.status]}`,
          }));

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
                setError(null);
                setBlockedBy(null);
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
            return (
              <div key={item.id} className="lib-row">
                <span className="tdot" style={{ background: item.dot }} />
                <input
                  className="lib-name"
                  defaultValue={item.name}
                  aria-label={`Rename ${item.name}`}
                  onBlur={(event) => {
                    const next = event.target.value.trim();
                    if (next === '' || next === item.name) {
                      event.target.value = item.name;
                      return;
                    }
                    const result =
                      tab === 'skill'
                        ? updateSkill(item.id, { name: next })
                        : tab === 'tool'
                          ? updateTool(item.id, { name: next })
                          : updateDataSource(item.id, { name: next });
                    if (!result.ok) {
                      setError(result.reason);
                      event.target.value = item.name;
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                />
                {tab === 'skill' && <small className="lib-meta">{item.meta}</small>}

                {tab === 'tool' && (
                  <select
                    className="lib-select"
                    aria-label={`Type of ${item.name}`}
                    value={fleet.tools.find((t) => t.id === item.id)?.type ?? 'python'}
                    onChange={(event) => {
                      const result = updateTool(item.id, { type: event.target.value as ToolType });
                      if (!result.ok) setError(result.reason);
                    }}
                  >
                    {TOOL_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                )}

                {tab === 'dataSource' && (
                  <>
                    <select
                      className="lib-select"
                      aria-label={`Type of ${item.name}`}
                      value={fleet.dataSources.find((d) => d.id === item.id)?.type ?? 'sharepoint'}
                      onChange={(event) => {
                        const result = updateDataSource(item.id, {
                          type: event.target.value as DataSourceType,
                        });
                        if (!result.ok) setError(result.reason);
                      }}
                    >
                      {DATA_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    <select
                      className="lib-select"
                      aria-label={`Status of ${item.name}`}
                      value={fleet.dataSources.find((d) => d.id === item.id)?.status ?? 'planned'}
                      style={{
                        color:
                          STATUS_COLOR[
                            fleet.dataSources.find((d) => d.id === item.id)?.status ?? 'planned'
                          ],
                      }}
                      onChange={(event) => {
                        const result = updateDataSource(item.id, {
                          status: event.target.value as keyof typeof DATA_SOURCE_STATUS_LABELS,
                        });
                        if (!result.ok) setError(result.reason);
                      }}
                    >
                      {(['live', 'building', 'planned'] as const).map((status) => (
                        <option key={status} value={status}>
                          {DATA_SOURCE_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </>
                )}
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
                  className="lib-delete"
                  onClick={() => remove(tab, item.id)}
                  aria-label={`Delete ${item.name}`}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>

        <div className="lib-add">
          <input
            value={newName}
            placeholder={`New ${tab === 'dataSource' ? 'data source' : tab} name`}
            aria-label="New library item name"
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
