/**
 * The catalog: build agents, skills, tools and data sources on their own, with no
 * fleet involved, then draw on them when you assemble a fleet.
 *
 * Three ways in:
 *  - create an agent by hand (name + role, SPEC 5.8's two-field friction rule)
 *  - upload a Microsoft Copilot Studio export (.yaml), which is parsed into an
 *    agent + its skills, flows and knowledge, and kept verbatim for download
 *  - build skills and workflow tools directly, on their own tabs
 *
 * Adding a catalog agent to the open fleet copies it in with everything it
 * references (SPEC 7: a fleet stays self-contained and exportable).
 */
import { useRef, useState } from 'react';
import { useCatalogStore } from '../store/catalogStore.js';
import { selectActiveFleet, useFleetStore } from '../store/fleetStore.js';
import { useUiStore } from '../store/uiStore.js';
import { describeCatalogAgent } from '../model/catalog.js';
import type { CatalogAgent } from '../model/catalog.js';
import type { DataSourceType, LibraryKind, Status } from '../model/schemas.js';
import { DATA_SOURCE_STATUS_LABELS } from '../model/schemas.js';
import {
  DATA_TYPE_COLOR,
  KIND_COLOR,
  KIND_LABEL,
  SKILL_COLOR,
  STATUS_COLOR,
  TOOL_TYPE_COLOR,
} from '../ui/palette.js';
import { ToolEditor } from './ToolEditor.js';
import { Picker } from './Picker.js';

type Tab = 'agents' | 'skill' | 'tool' | 'dataSource';

const TABS: { id: Tab; label: string }[] = [
  { id: 'agents', label: 'Agents' },
  { id: 'skill', label: 'Skills' },
  { id: 'tool', label: 'Tools & workflows' },
  { id: 'dataSource', label: 'Data' },
];

const DATA_TYPES: DataSourceType[] = ['md', 'dataverse', 'sharepoint', 'file'];
const STATUSES: Status[] = ['live', 'building', 'planned'];

/** "1 skill" / "7 skills" — these counts are the first thing read after an import. */
function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function downloadText(text: string, fileName: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function CatalogManager(): React.JSX.Element | null {
  const open = useUiStore((s) => s.catalogOpen);
  const close = useUiStore((s) => s.closeCatalog);
  const activate = useUiStore((s) => s.activate);

  const catalog = useCatalogStore((s) => s.catalog);
  const store = useCatalogStore();

  const fleet = useFleetStore(selectActiveFleet);
  const addToFleet = useFleetStore((s) => s.addCatalogAgent);
  const replaceInFleet = useFleetStore((s) => s.replaceWithCatalogAgent);

  const [tab, setTab] = useState<Tab>('agents');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ agentId: string; kind: LibraryKind } | null>(null);
  /** Which catalog agent is choosing a fleet agent to replace. */
  const [replacing, setReplacing] = useState<CatalogAgent | null>(null);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const say = (tone: 'ok' | 'error', text: string): void => setMessage({ tone, text });

  const handleUpload = async (file: File): Promise<void> => {
    const result = store.importCopilotYaml(await file.text(), file.name);
    if (!result.ok) {
      say('error', result.errors.join(' · '));
      return;
    }
    setTab('agents');
    setEditingId(result.agentId);
    say(
      'ok',
      `Imported "${result.agentName}": ${plural(result.counts.skills, 'skill')}, ${plural(result.counts.tools, 'tool')}, ${plural(result.counts.dataSources, 'data item')}.` +
        (result.warnings.length > 0 ? ` ${result.warnings.join(' ')}` : ''),
    );
  };

  const createAgent = (): void => {
    const result = store.addAgent({ name: newName, role: newRole });
    if (!result.ok) {
      say('error', result.reason);
      return;
    }
    setNewName('');
    setNewRole('');
    setEditingId(result.id);
    say('ok', 'Agent created. Attach skills and tools below, or add it to a fleet.');
  };

  const createLibraryItem = (): void => {
    const name = newName.trim();
    if (name === '') return;
    const result =
      tab === 'skill'
        ? store.addSkill({ name })
        : tab === 'tool'
          ? store.addTool({ name, description: name, type: 'workflow' })
          : store.addDataSource({ name, type: 'sharepoint', status: 'planned' });

    if (!result.ok) {
      say('error', result.reason);
      return;
    }
    setNewName('');
    setEditingId(result.id);
    setMessage(null);
  };

  const sendToFleet = (agent: CatalogAgent): void => {
    if (!fleet) {
      say('error', 'Open or create a fleet first, then add the agent to it.');
      return;
    }
    const result = addToFleet(agent);
    if (!result.ok) {
      say('error', result.reason);
      return;
    }
    say('ok', `"${agent.name}" added to ${fleet.name}. Link it under a parent on the board.`);
    activate(agent.id);
  };

  return (
    <div className="dialog-scrim" role="dialog" aria-modal="true" data-testid="catalog">
      <div className="dialog catalog-dialog">
        <div className="catalog-head">
          <h2>Catalog</h2>
          <p className="dialog-lead">
            Agents, skills and tools that exist on their own. Build them here once, then add them to
            any fleet.
          </p>
          <button type="button" className="ins-close" onClick={close} aria-label="Close catalog">
            ✕
          </button>
        </div>

        <div className="lib-tabs">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`chrome-btn ${tab === entry.id ? 'on' : ''}`}
              data-testid={`catalog-tab-${entry.id}`}
              onClick={() => {
                setTab(entry.id);
                setEditingId(null);
                setNewName('');
                setMessage(null);
              }}
            >
              {entry.label}
              <small className="tab-count">
                {entry.id === 'agents'
                  ? catalog.agents.length
                  : entry.id === 'skill'
                    ? catalog.skills.length
                    : entry.id === 'tool'
                      ? catalog.tools.length
                      : catalog.dataSources.length}
              </small>
            </button>
          ))}
        </div>

        {tab === 'agents' ? <AgentsTab /> : <LibraryTab />}

        {replacing && fleet && (
          <Picker
            title={`Replace which agent with "${replacing.name}"?`}
            emptyText="This fleet has no agents to replace."
            options={fleet.agents.map((candidate) => ({
              id: candidate.id,
              label: candidate.name,
              hint: candidate.role === '' ? KIND_LABEL[candidate.kind] : candidate.role,
              dotColor: KIND_COLOR[candidate.kind],
            }))}
            onPick={(targetId) => {
              const target = fleet.agents.find((a) => a.id === targetId);
              const result = replaceInFleet(targetId, replacing);
              if (result.ok) {
                say(
                  'ok',
                  `"${target?.name ?? 'That agent'}" replaced with "${replacing.name}" — it keeps the same place in the tree.`,
                );
                activate(replacing.id);
              } else {
                say('error', result.reason);
              }
              setReplacing(null);
            }}
            onCancel={() => setReplacing(null)}
          />
        )}

        {message && (
          <p
            className={message.tone === 'ok' ? 'catalog-ok' : 'dialog-error'}
            role="status"
            data-testid="catalog-message"
          >
            {message.text}
          </p>
        )}

        <div className="dialog-row">
          <button type="button" className="btn" onClick={close}>
            Done
          </button>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept=".yaml,.yml,text/yaml,application/x-yaml"
          className="hidden"
          data-testid="catalog-yaml-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void handleUpload(file);
          }}
        />
      </div>
    </div>
  );

  function AgentsTab(): React.JSX.Element {
    return (
      <>
        <div className="catalog-actions">
          <button
            type="button"
            className="btn"
            data-testid="catalog-upload"
            onClick={() => fileInput.current?.click()}
          >
            Upload Copilot Studio .yaml
          </button>
          <span className="catalog-hint">
            An exported agent brings its skills, flows and knowledge with it, and the file stays
            downloadable.
          </span>
        </div>

        <div className="lib-list">
          {catalog.agents.length === 0 && (
            <p className="dialog-lead">
              No agents yet. Create one below, or upload a Copilot Studio export.
            </p>
          )}
          {catalog.agents.map((agent) => {
            const editing = editingId === agent.id;
            const document = store.documentFor(agent.id);
            return (
              <div key={agent.id} className={`lib-entry ${editing ? 'editing' : ''}`}>
                <div className="lib-row">
                  <span className="tdot" style={{ background: KIND_COLOR[agent.kind] }} />
                  <input
                    className="lib-name"
                    defaultValue={agent.name}
                    key={`${agent.id}-${agent.name}`}
                    aria-label={`Rename ${agent.name}`}
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      if (next === '' || next === agent.name) {
                        event.target.value = agent.name;
                        return;
                      }
                      const result = store.updateAgent(agent.id, { name: next });
                      if (!result.ok) {
                        say('error', result.reason);
                        event.target.value = agent.name;
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                  />
                  <small className="lib-meta">{describeCatalogAgent(agent)}</small>
                  {agent.source && <span className="src-badge">Copilot Studio</span>}

                  {document && (
                    <button
                      type="button"
                      className="ubn"
                      data-testid="catalog-download-yaml"
                      title={`Download ${document.fileName}`}
                      onClick={() => downloadText(document.text, document.fileName, 'application/x-yaml')}
                    >
                      ⬇ .yaml
                    </button>
                  )}
                  <button
                    type="button"
                    className="ubn"
                    data-testid="catalog-add-to-fleet"
                    onClick={() => sendToFleet(agent)}
                  >
                    Add to fleet
                  </button>
                  <button
                    type="button"
                    className="ubn"
                    data-testid="catalog-replace-in-fleet"
                    onClick={() => {
                      if (!fleet) {
                        say('error', 'Open a fleet first.');
                        return;
                      }
                      setReplacing(agent);
                    }}
                  >
                    Replace…
                  </button>
                  <button
                    type="button"
                    className="lib-edit"
                    aria-expanded={editing}
                    aria-label={`${editing ? 'Close' : 'Edit'} ${agent.name}`}
                    onClick={() => setEditingId(editing ? null : agent.id)}
                  >
                    {editing ? '▴' : '▾'}
                  </button>
                  <button
                    type="button"
                    className="lib-delete"
                    aria-label={`Delete ${agent.name}`}
                    onClick={() => {
                      const result = store.deleteAgent(agent.id);
                      if (!result.ok) say('error', result.reason);
                      else if (editingId === agent.id) setEditingId(null);
                    }}
                  >
                    ✕
                  </button>
                </div>

                {editing && <AgentFields agent={agent} />}
              </div>
            );
          })}
        </div>

        <div className="catalog-new">
          <input
            value={newName}
            placeholder="Agent name"
            aria-label="New agent name"
            data-testid="catalog-new-agent-name"
            onChange={(event) => setNewName(event.target.value)}
          />
          <input
            value={newRole}
            placeholder="What does it do?"
            aria-label="New agent role"
            data-testid="catalog-new-agent-role"
            onChange={(event) => setNewRole(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') createAgent();
            }}
          />
          <button type="button" onClick={createAgent} disabled={newName.trim() === ''}>
            Create agent
          </button>
        </div>
      </>
    );
  }

  function AgentFields({ agent }: { agent: CatalogAgent }): React.JSX.Element {
    const attached = (kind: LibraryKind) => {
      if (kind === 'skill') return catalog.skills.filter((s) => agent.skillIds.includes(s.id));
      if (kind === 'tool') return catalog.tools.filter((t) => agent.toolIds.includes(t.id));
      return catalog.dataSources.filter((d) => agent.dataSourceIds.includes(d.id));
    };

    const colourOf = (kind: LibraryKind, id: string): string => {
      if (kind === 'skill') return SKILL_COLOR;
      if (kind === 'tool') return TOOL_TYPE_COLOR[catalog.tools.find((t) => t.id === id)?.type ?? 'python'];
      return DATA_TYPE_COLOR[catalog.dataSources.find((d) => d.id === id)?.type ?? 'md'];
    };

    return (
      <div className="lib-fields" data-testid="catalog-agent-editor">
        <label className="dialog-field">
          <span>Role</span>
          <input
            defaultValue={agent.role}
            aria-label={`Role of ${agent.name}`}
            onBlur={(event) => store.updateAgent(agent.id, { role: event.target.value })}
          />
        </label>
        <label className="dialog-field">
          <span>Instructions</span>
          <textarea
            rows={3}
            defaultValue={agent.instructions ?? ''}
            aria-label={`Instructions for ${agent.name}`}
            onBlur={(event) => store.updateAgent(agent.id, { instructions: event.target.value })}
          />
        </label>

        {(['skill', 'tool', 'dataSource'] as LibraryKind[]).map((kind) => (
          <div key={kind} className="catalog-attach">
            <div className="catalog-attach-head">
              <span>{kind === 'dataSource' ? 'Data' : kind === 'tool' ? 'Tools' : 'Skills'}</span>
              <button
                type="button"
                className="addchip"
                aria-label={`Attach a ${kind}`}
                onClick={() => setPicker({ agentId: agent.id, kind })}
              >
                +
              </button>
            </div>
            <div className="chips">
              {attached(kind).length === 0 && <span className="chip empty">none yet</span>}
              {attached(kind).map((item) => (
                <span key={item.id} className="chip">
                  <span className="tdot" style={{ background: colourOf(kind, item.id) }} />
                  {item.name}
                  <button
                    type="button"
                    className="chip-x"
                    aria-label={`Detach ${item.name}`}
                    onClick={() => store.detachFromAgent(agent.id, kind, item.id)}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </div>
        ))}

        {picker?.agentId === agent.id && (
          <Picker
            title={`Attach ${picker.kind === 'dataSource' ? 'data' : `a ${picker.kind}`}`}
            emptyText="Nothing left in the catalog to attach. Create one on its own tab first."
            options={(picker.kind === 'skill'
              ? catalog.skills.filter((s) => !agent.skillIds.includes(s.id))
              : picker.kind === 'tool'
                ? catalog.tools.filter((t) => !agent.toolIds.includes(t.id))
                : catalog.dataSources.filter((d) => !agent.dataSourceIds.includes(d.id))
            ).map((item) => ({
              id: item.id,
              label: item.name,
              dotColor: colourOf(picker.kind, item.id),
            }))}
            onPick={(id) => {
              const result = store.attachToAgent(agent.id, picker.kind, id);
              if (!result.ok) say('error', result.reason);
              setPicker(null);
            }}
            onCancel={() => setPicker(null)}
          />
        )}
      </div>
    );
  }

  function LibraryTab(): React.JSX.Element {
    const items =
      tab === 'skill'
        ? catalog.skills.map((s) => ({ id: s.id, name: s.name, dot: SKILL_COLOR }))
        : tab === 'tool'
          ? catalog.tools.map((t) => ({ id: t.id, name: t.name, dot: TOOL_TYPE_COLOR[t.type] }))
          : catalog.dataSources.map((d) => ({ id: d.id, name: d.name, dot: DATA_TYPE_COLOR[d.type] }));

    const usedBy = (id: string): CatalogAgent[] => {
      const field = tab === 'skill' ? 'skillIds' : tab === 'tool' ? 'toolIds' : 'dataSourceIds';
      return catalog.agents.filter((agent) => agent[field].includes(id));
    };

    const remove = (id: string): void => {
      const result =
        tab === 'skill' ? store.deleteSkill(id) : tab === 'tool' ? store.deleteTool(id) : store.deleteDataSource(id);
      if (!result.ok) say('error', result.reason);
      else if (editingId === id) setEditingId(null);
    };

    const rename = (id: string, next: string): boolean => {
      const result =
        tab === 'skill'
          ? store.updateSkill(id, { name: next })
          : tab === 'tool'
            ? store.updateTool(id, { name: next })
            : store.updateDataSource(id, { name: next });
      if (!result.ok) say('error', result.reason);
      return result.ok;
    };

    return (
      <>
        <div className="lib-list">
          {items.length === 0 && <p className="dialog-lead">Nothing here yet. Create one below.</p>}
          {items.map((item) => {
            const editing = editingId === item.id;
            const users = usedBy(item.id);
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
                      users.map((agent) => <span key={agent.id} className="ubn">{agent.name}</span>)
                    )}
                  </div>
                  <button
                    type="button"
                    className="lib-edit"
                    aria-expanded={editing}
                    aria-label={`${editing ? 'Close' : 'Edit'} ${item.name}`}
                    onClick={() => setEditingId(editing ? null : item.id)}
                  >
                    {editing ? '▴' : '▾'}
                  </button>
                  <button
                    type="button"
                    className="lib-delete"
                    aria-label={`Delete ${item.name}`}
                    onClick={() => remove(item.id)}
                  >
                    ✕
                  </button>
                </div>

                {editing && tab === 'skill' && <CatalogSkillFields id={item.id} />}
                {editing && tab === 'tool' && <CatalogToolFields id={item.id} />}
                {editing && tab === 'dataSource' && <CatalogDataFields id={item.id} />}
              </div>
            );
          })}
        </div>

        <div className="lib-add">
          <input
            value={newName}
            placeholder={`New ${tab === 'dataSource' ? 'data' : tab} name`}
            aria-label="New catalog item name"
            data-testid="catalog-new-item"
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') createLibraryItem();
            }}
          />
          <button type="button" onClick={createLibraryItem} disabled={newName.trim() === ''}>
            Add
          </button>
        </div>
      </>
    );
  }

  function CatalogSkillFields({ id }: { id: string }): React.JSX.Element | null {
    const skill = catalog.skills.find((s) => s.id === id);
    if (!skill) return null;
    return (
      <div className="lib-fields">
        <label className="dialog-field">
          <span>Description</span>
          <input
            defaultValue={skill.description ?? ''}
            aria-label={`Description of ${skill.name}`}
            onBlur={(event) => store.updateSkill(id, { description: event.target.value })}
          />
        </label>
        <label className="dialog-field">
          <span>Instructions</span>
          <textarea
            rows={5}
            defaultValue={skill.instructions ?? ''}
            aria-label={`Instructions for ${skill.name}`}
            data-testid="catalog-skill-instructions"
            onBlur={(event) => store.updateSkill(id, { instructions: event.target.value })}
          />
        </label>
      </div>
    );
  }

  function CatalogToolFields({ id }: { id: string }): React.JSX.Element | null {
    const tool = catalog.tools.find((t) => t.id === id);
    if (!tool) return null;
    return (
      <ToolEditor
        tool={tool}
        error={null}
        onClose={() => setEditingId(null)}
        onChange={(patch) => {
          const result = store.updateTool(id, patch);
          if (!result.ok) say('error', result.reason);
        }}
      />
    );
  }

  function CatalogDataFields({ id }: { id: string }): React.JSX.Element | null {
    const source = catalog.dataSources.find((d) => d.id === id);
    if (!source) return null;
    return (
      <div className="lib-fields">
        <div className="lib-field-row">
          <label className="dialog-field">
            <span>Type</span>
            <select
              value={source.type}
              aria-label={`Type of ${source.name}`}
              onChange={(event) => store.updateDataSource(id, { type: event.target.value as DataSourceType })}
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
              onChange={(event) => store.updateDataSource(id, { status: event.target.value as Status })}
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {DATA_SOURCE_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="dialog-field">
          <span>Reference (URI, path or table)</span>
          <input
            defaultValue={source.ref ?? ''}
            aria-label={`Reference for ${source.name}`}
            onBlur={(event) => store.updateDataSource(id, { ref: event.target.value })}
          />
        </label>
      </div>
    );
  }
}
