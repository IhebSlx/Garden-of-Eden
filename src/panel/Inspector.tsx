/**
 * SPEC 5.7 - the inspector panel. Everything in it is clickable: instructions and
 * every skill / tool / data chip open a detail card (SPEC 5.7), and the detail
 * card's "linked to" buttons jump-focus another agent.
 *
 * SPEC 8.10 adds panel editing of name, role and instructions on top of the
 * prototype, which could only rename from the card.
 */
import { useState } from 'react';
import { selectActiveFleet, useFleetStore } from '../store/fleetStore.js';
import { useUiStore } from '../store/uiStore.js';
import { useLinkDraft } from '../store/linkDraft.js';
import {
  agentsUsing,
  childIdsOf,
  isShared,
  parentsOf,
  peerIdsOf,
  sharedCount,
} from '../model/selectors.js';
import type { Agent, AgentKind, LibraryKind } from '../model/schemas.js';
import {
  DATA_TYPE_COLOR,
  KIND_COLOR,
  KIND_LABEL,
  SHARED_COLOR,
  SHARED_KIND_LABEL,
  STATUS_COLOR,
  TOOL_TYPE_COLOR,
} from '../ui/palette.js';
import { StatusChip } from './StatusChip.js';
import { NotesField } from './NotesField.js';
import { DataSourceDetail, InstructionsDetail, SkillDetail, ToolDetail } from './ItemDetail.js';
import { Picker } from './Picker.js';
import type { PickerOption } from './Picker.js';

type PickerMode = LibraryKind | 'link' | null;

function EditableLine({
  value,
  onCommit,
  className,
  placeholder,
  multiline = false,
  testId,
}: {
  value: string;
  onCommit: (next: string) => void;
  className: string;
  placeholder: string;
  multiline?: boolean;
  testId: string;
}): React.JSX.Element {
  const [draft, setDraft] = useState<string | null>(null);
  const showing = draft ?? value;

  const commit = (): void => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };

  const shared = {
    className,
    value: showing,
    placeholder,
    'data-testid': testId,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(event.target.value),
    onBlur: commit,
  };

  if (multiline) {
    return (
      <textarea
        {...shared}
        rows={3}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setDraft(null);
            event.currentTarget.blur();
          }
        }}
      />
    );
  }

  return (
    <input
      {...shared}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(null);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function Inspector(): React.JSX.Element | null {
  const fleet = useFleetStore(selectActiveFleet);
  const selectedId = useUiStore((s) => s.selectedId);
  const openDetail = useUiStore((s) => s.openDetail);
  const toggleDetail = useUiStore((s) => s.toggleDetail);
  const select = useUiStore((s) => s.select);
  const activate = useUiStore((s) => s.activate);
  const openCatalog = useUiStore((s) => s.openCatalog);

  const updateAgent = useFleetStore((s) => s.updateAgent);
  const renameAgent = useFleetStore((s) => s.renameAgent);
  const addAgent = useFleetStore((s) => s.addAgent);
  const deleteAgent = useFleetStore((s) => s.deleteAgent);
  const previewAgentDeletion = useFleetStore((s) => s.previewAgentDeletion);
  const attachLibraryItem = useFleetStore((s) => s.attachLibraryItem);
  const detachLibraryItem = useFleetStore((s) => s.detachLibraryItem);
  const startPicking = useLinkDraft((s) => s.startPicking);
  const openLinkDraft = useLinkDraft((s) => s.open);
  const pickingFor = useLinkDraft((s) => s.picking);

  const [picker, setPicker] = useState<PickerMode>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editingInstructions, setEditingInstructions] = useState(false);
  const [editingModel, setEditingModel] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const agent = fleet && selectedId !== null ? fleet.agents.find((a) => a.id === selectedId) : undefined;
  if (!fleet || !agent) return null;

  const shared = isShared(fleet, agent.id);
  const parents = parentsOf(fleet, agent.id);
  const peers = peerIdsOf(fleet, agent.id)
    .map((id) => fleet.agents.find((a) => a.id === id))
    .filter((a) => a !== undefined);

  const skills = agent.skillIds
    .map((id) => fleet.skills.find((s) => s.id === id))
    .filter((s) => s !== undefined);
  const tools = agent.toolIds.map((id) => fleet.tools.find((t) => t.id === id)).filter((t) => t !== undefined);
  const dataSources = agent.dataSourceIds
    .map((id) => fleet.dataSources.find((d) => d.id === id))
    .filter((d) => d !== undefined);

  const jump = (agentId: string): void => activate(agentId);
  const usedBy = (kind: LibraryKind, itemId: string) => ({
    agents: agentsUsing(fleet, kind, itemId),
    onJump: jump,
  });

  // SPEC 4 model config: provider + name are both required by the schema, so a
  // half-filled form must not be pushed into the store.
  const commitModel = (patch: Partial<NonNullable<Agent['model']>>): void => {
    const next = {
      provider: (patch.provider ?? agent.model?.provider ?? '').trim(),
      name: (patch.name ?? agent.model?.name ?? '').trim(),
      temperature: 'temperature' in patch ? patch.temperature : agent.model?.temperature,
    };
    if (next.provider === '' || next.name === '') return;
    const result = updateAgent(agent.id, {
      model: next.temperature === undefined
        ? { provider: next.provider, name: next.name }
        : { provider: next.provider, name: next.name, temperature: next.temperature },
    });
    if (!result.ok) setNotice(result.reason);
  };

  const kindColor = shared ? SHARED_COLOR : KIND_COLOR[agent.kind];
  const deletion = confirmingDelete ? previewAgentDeletion(agent.id) : null;

  const pickerOptions = (): { title: string; options: PickerOption[]; empty: string } => {
    if (picker === 'skill') {
      return {
        title: 'Add a skill',
        empty: 'Every skill in the library is already attached.',
        options: fleet.skills
          .filter((s) => !agent.skillIds.includes(s.id))
          .map((s) => ({ id: s.id, label: s.name })),
      };
    }
    if (picker === 'tool') {
      return {
        title: 'Add a tool',
        empty: 'Every tool in the library is already attached.',
        options: fleet.tools
          .filter((t) => !agent.toolIds.includes(t.id))
          .map((t) => ({ id: t.id, label: t.name, hint: t.type, dotColor: TOOL_TYPE_COLOR[t.type] })),
      };
    }
    if (picker === 'dataSource') {
      return {
        title: 'Add a data source',
        empty: 'Every data source in the library is already attached.',
        options: fleet.dataSources
          .filter((d) => !agent.dataSourceIds.includes(d.id))
          .map((d) => ({ id: d.id, label: d.name, hint: d.type, dotColor: DATA_TYPE_COLOR[d.type] })),
      };
    }
    return {
      title: 'Link an existing agent',
      empty: 'No other agent to link.',
      options: fleet.agents
        .filter((a) => a.id !== agent.id)
        .map((a) => ({ id: a.id, label: a.name, hint: KIND_LABEL[a.kind], dotColor: KIND_COLOR[a.kind] })),
    };
  };

  const handlePick = (id: string): void => {
    if (picker === 'link' || pickingFor !== null) {
      // SPEC 5.8: the link flow always asks for the edge kind next.
      openLinkDraft(agent.id, id);
    } else if (picker !== null) {
      const result = attachLibraryItem(agent.id, picker, id);
      if (!result.ok) setNotice(result.reason);
    }
    setPicker(null);
  };

  const detailFor = (): React.JSX.Element | null => {
    if (openDetail === null) return null;
    const [kind, id] = openDetail.split(':');

    if (kind === 'instr') return <InstructionsDetail agent={agent} />;
    if (kind === 'skill') {
      const skill = fleet.skills.find((s) => s.id === id);
      return skill ? <SkillDetail skill={skill} usedBy={usedBy('skill', skill.id)} /> : null;
    }
    if (kind === 'tool') {
      const tool = fleet.tools.find((t) => t.id === id);
      return tool ? <ToolDetail tool={tool} usedBy={usedBy('tool', tool.id)} /> : null;
    }
    if (kind === 'data') {
      const source = fleet.dataSources.find((d) => d.id === id);
      return source ? <DataSourceDetail source={source} usedBy={usedBy('dataSource', source.id)} /> : null;
    }
    return null;
  };

  const detail = detailFor();

  return (
    <aside
      className="inspector open"
      style={{ '--kc': kindColor } as React.CSSProperties}
      data-testid="inspector"
    >
      <button type="button" className="ins-close" onClick={() => select(null)} aria-label="Close panel">
        ✕
      </button>

      {/* Shared-ness is derived (SPEC §4) so it is a badge; the level is editable. */}
      <span className="kindrow">
        <KindChip agentId={agent.id} kind={agent.kind} onFail={(reason) => setNotice(reason)} />
        {shared && (
          <span className="kind kind-shared" data-testid="shared-badge">
            {`${SHARED_KIND_LABEL} ×${sharedCount(fleet, agent.id)}`}
          </span>
        )}
      </span>

      <EditableLine
        className="ins-name"
        value={agent.name}
        placeholder="Agent name"
        testId="panel-name"
        onCommit={(next) => {
          const result = renameAgent(agent.id, next);
          if (!result.ok) setNotice(result.reason);
        }}
      />
      <EditableLine
        className="ins-role"
        value={agent.role}
        placeholder="What does this agent do?"
        testId="panel-role"
        onCommit={(next) => updateAgent(agent.id, { role: next })}
      />

      <StatusChip status={agent.status} onChange={(status) => updateAgent(agent.id, { status })} />

      <div className="rel" data-testid="panel-relations">
        {parents.length > 1 && (
          <div>
            Shared sub-agent of <b>{parents.map((p) => p.name).join(', ')}</b>
          </div>
        )}
        {parents.length === 1 && (
          <div>
            Reports to <b>{parents[0]?.name}</b>
          </div>
        )}
        {peers.length > 0 && (
          <div>
            Linked to <b>{peers.map((p) => p.name).join(', ')}</b> (same level)
          </div>
        )}
      </div>

      <h3>
        Instructions
        <button
          type="button"
          className="addchip"
          onClick={() => setEditingInstructions((on) => !on)}
          aria-label={editingInstructions ? 'Done editing instructions' : 'Edit instructions'}
        >
          {editingInstructions ? '✓' : '✎'}
        </button>
      </h3>
      {editingInstructions ? (
        <EditableLine
          className="ins-instructions"
          value={agent.instructions ?? ''}
          placeholder="Add instructions…"
          multiline
          testId="panel-instructions"
          onCommit={(next) => updateAgent(agent.id, { instructions: next })}
        />
      ) : (
        // SPEC 5.7: instructions are clickable like every other panel item.
        <button type="button" className="instr" onClick={() => toggleDetail(`instr:${agent.id}`)}>
          {agent.instructions ?? 'none yet'}
        </button>
      )}

      <NotesField
        value={agent.notes}
        label={agent.name}
        testId="panel-notes"
        onCommit={(next) => updateAgent(agent.id, { notes: next })}
      />

      <h3>
        Model
        <button
          type="button"
          className="addchip"
          onClick={() => setEditingModel((on) => !on)}
          aria-label={editingModel ? 'Done editing model' : 'Edit model'}
        >
          {editingModel ? '✓' : '✎'}
        </button>
      </h3>
      {editingModel ? (
        <div className="model-fields" data-testid="model-editor">
          <input
            className="ins-role"
            defaultValue={agent.model?.provider ?? ''}
            placeholder="Provider (e.g. Sorakel)"
            aria-label="Model provider"
            data-testid="model-provider"
            onBlur={(event) => commitModel({ provider: event.target.value })}
          />
          <input
            className="ins-role"
            defaultValue={agent.model?.name ?? ''}
            placeholder="Model name"
            aria-label="Model name"
            data-testid="model-name"
            onBlur={(event) => commitModel({ name: event.target.value })}
          />
          <input
            className="ins-role"
            type="number"
            step="0.1"
            min="0"
            max="2"
            defaultValue={agent.model?.temperature ?? ''}
            placeholder="Temperature"
            aria-label="Model temperature"
            onBlur={(event) =>
              commitModel({
                temperature: event.target.value === '' ? undefined : Number(event.target.value),
              })
            }
          />
        </div>
      ) : (
        <p className="model-summary" data-testid="model-summary">
          {agent.model
            ? `${agent.model.provider} · ${agent.model.name}${
                agent.model.temperature === undefined ? '' : ` · temp ${agent.model.temperature}`
              }`
            : 'not set'}
        </p>
      )}

      <h3>
        Skills
        <button type="button" className="addchip" onClick={() => setPicker('skill')} aria-label="Add skill">
          +
        </button>
      </h3>
      <div className="chips">
        {skills.length === 0 && <span className="chip empty">none yet</span>}
        {skills.map((skill) => (
          <span key={skill.id} className="chip ichip">
            <button type="button" onClick={() => toggleDetail(`skill:${skill.id}`)}>
              {skill.name}
            </button>
            <button
              type="button"
              className="chip-x"
              onClick={() => detachLibraryItem(agent.id, 'skill', skill.id)}
              aria-label={`Remove ${skill.name}`}
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      <h3>
        Tools
        <button type="button" className="addchip" onClick={() => setPicker('tool')} aria-label="Add tool">
          +
        </button>
      </h3>
      <div className="chips">
        {tools.length === 0 && <span className="chip empty">none yet</span>}
        {tools.map((tool) => (
          <span key={tool.id} className="chip ichip">
            <button type="button" onClick={() => toggleDetail(`tool:${tool.id}`)}>
              <span className="tdot" style={{ background: TOOL_TYPE_COLOR[tool.type] }} />
              {tool.name}
            </button>
            <button
              type="button"
              className="chip-x"
              onClick={() => detachLibraryItem(agent.id, 'tool', tool.id)}
              aria-label={`Remove ${tool.name}`}
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      <h3>
        Data sources
        <button
          type="button"
          className="addchip"
          onClick={() => setPicker('dataSource')}
          aria-label="Add data source"
        >
          +
        </button>
      </h3>
      <div className="chips">
        {dataSources.length === 0 && <span className="chip empty">none yet</span>}
        {dataSources.map((source) => (
          <span key={source.id} className="chip ichip">
            <button type="button" onClick={() => toggleDetail(`data:${source.id}`)}>
              <span className="tdot" style={{ background: DATA_TYPE_COLOR[source.type] }} />
              {source.name}
              <span className="sdot" style={{ background: STATUS_COLOR[source.status] }} />
            </button>
            <button
              type="button"
              className="chip-x"
              onClick={() => detachLibraryItem(agent.id, 'dataSource', source.id)}
              aria-label={`Remove ${source.name}`}
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      {detail && (
        <div className="tool-detail" data-testid="item-detail">
          {detail}
        </div>
      )}

      <div className="actions">
        <button
          type="button"
          className="btn"
          data-testid="add-sub-agent"
          onClick={() => {
            const result = addAgent({ name: 'New agent', role: '', parentId: agent.id });
            if (result.ok) activate(result.id);
            else setNotice(result.reason);
          }}
        >
          + Add sub-agent
        </button>
        <button
          type="button"
          className="btn ghost"
          data-testid="add-from-catalog"
          onClick={() => openCatalog()}
        >
          Add from catalog…
        </button>
        <button
          type="button"
          className="btn ghost"
          data-testid="link-existing"
          onClick={() => {
            startPicking(agent.id);
            setPicker('link');
          }}
        >
          Link existing…
        </button>
        <button
          type="button"
          className="btn danger"
          data-testid="delete-agent"
          onClick={() => setConfirmingDelete(true)}
        >
          Delete agent
        </button>
      </div>

      {deletion && (
        <div className="confirm" data-testid="delete-confirm">
          <p>
            Delete <b>{deletion.agentName}</b>?
            {deletion.shared && (
              <>
                {' '}
                It is a shared sub-agent of <b>{deletion.parentNames.join(', ')}</b> and will disappear from
                all of them.
              </>
            )}
            {deletion.orphanedChildIds.length > 0 && (
              <>
                {' '}
                Its {deletion.orphanedChildIds.length} sub-agent
                {deletion.orphanedChildIds.length === 1 ? '' : 's'} would be left without a parent and will be
                deleted too.
              </>
            )}
          </p>
          <div className="confirm-row">
            <button
              type="button"
              className="btn danger"
              data-testid="delete-confirm-yes"
              onClick={() => {
                const result = deleteAgent(agent.id);
                setConfirmingDelete(false);
                if (result.ok) select(null);
                else setNotice(result.reason);
              }}
            >
              Delete
            </button>
            <button type="button" className="btn ghost" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {picker !== null &&
        (() => {
          const config = pickerOptions();
          return (
            <Picker
              title={config.title}
              options={config.options}
              emptyText={config.empty}
              onPick={handlePick}
              onCancel={() => setPicker(null)}
            />
          );
        })()}

      {notice && (
        <p className="notice" role="status" data-testid="panel-notice">
          {notice}
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}

      {childIdsOf(fleet, agent.id).length > 0 && (
        <p className="hintline">
          {childIdsOf(fleet, agent.id).length} sub-agent
          {childIdsOf(fleet, agent.id).length === 1 ? '' : 's'}
        </p>
      )}
    </aside>
  );
}

/**
 * The agent's level in the hierarchy, editable in place.
 *
 * Without this the kind could only be set when an agent was created: an agent
 * promoted or demoted after the fact — a department that turns out to be a
 * sub-agent of two others — had no way to say so. The orchestrator is excluded
 * because SPEC §4 allows exactly one, and the store enforces that anyway.
 */
function KindChip({
  agentId,
  kind,
  onFail,
}: {
  agentId: string;
  kind: AgentKind;
  onFail: (reason: string) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const updateAgent = useFleetStore((s) => s.updateAgent);

  // Promoting to orchestrator would need the current one demoted first (SPEC §4),
  // so the chip offers only the two levels an agent can move between freely.
  const options: AgentKind[] = ['department', 'worker'];

  if (kind === 'orchestrator' || !open) {
    return (
      <button
        type="button"
        className="kind kind-btn"
        data-testid="kind-chip"
        disabled={kind === 'orchestrator'}
        onClick={() => setOpen(true)}
        aria-label={
          kind === 'orchestrator'
            ? 'Orchestrator — a fleet has exactly one, so this cannot be changed here'
            : `Level: ${KIND_LABEL[kind]}. Change level`
        }
      >
        {KIND_LABEL[kind]}
        {kind !== 'orchestrator' && <span style={{ opacity: 0.55, marginLeft: 4 }}>▾</span>}
      </button>
    );
  }

  return (
    <span className="kindrow" data-testid="kind-chip-open">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`kind kind-btn ${kind === option ? 'on' : ''}`}
          style={{ '--kc': KIND_COLOR[option] } as React.CSSProperties}
          onClick={() => {
            const result = updateAgent(agentId, { kind: option });
            if (!result.ok) onFail(result.reason);
            setOpen(false);
          }}
        >
          {KIND_LABEL[option]}
        </button>
      ))}
    </span>
  );
}
