/**
 * Tools: the list, and the detail of whichever one is selected — including its
 * workflow mini-DAG (SPEC §8.6).
 *
 * Same shape as Data and Skills. The type filter is here rather than in a shared
 * control because it is the only axis a tool has: a tool is not owed by anybody
 * and has no state of its own.
 */
import { useState } from 'react';
import type { Fleet, ToolType } from '../../model/schemas.js';
import { ToolFields } from '../../panel/ToolFields.js';
import { useFleetStore } from '../../store/fleetStore.js';
import { TOOL_TYPE_COLOR, TOOL_TYPE_LABEL } from '../../ui/palette.js';
import { ItemHeader } from './ItemHeader.js';
import { LibraryList } from './LibraryList.js';
import { UsedBy } from './UsedBy.js';

export const TOOL_TYPES: ToolType[] = ['workflow', 'python', 'microsoft'];

export function ToolsPane({
  fleet,
  search,
  type,
}: {
  fleet: Fleet;
  search: string;
  /** null = any type. */
  type: ToolType | null;
}): React.JSX.Element {
  const addTool = useFleetStore((s) => s.addTool);
  const updateTool = useFleetStore((s) => s.updateTool);
  const deleteTool = useFleetStore((s) => s.deleteTool);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needle = search.trim().toLowerCase();
  const matching = fleet.tools.filter(
    (tool) =>
      (type === null || tool.type === type) &&
      (needle === '' ||
        tool.name.toLowerCase().includes(needle) ||
        (tool.description ?? '').toLowerCase().includes(needle)),
  );
  const selected = matching.find((tool) => tool.id === selectedId) ?? matching[0] ?? null;

  const add = (): void => {
    const name = newName.trim();
    const description = newDescription.trim();
    // SPEC §4: "every tool explains itself". The schema enforces it, so the form
    // asks for it rather than inventing placeholder copy to get past the check.
    if (name === '' || description === '') return;
    // A new tool is a plain one until somebody says otherwise; a workflow is a
    // shape you build, not a default you inherit.
    const result = addTool({ name, description, type: type ?? 'microsoft' });
    if (!result.ok) {
      setProblem(result.reason);
      return;
    }
    setProblem(null);
    setNewName('');
    setNewDescription('');
    setSelectedId(result.id);
  };

  return (
    <div className="datapanes">
      <LibraryList
        rows={matching.map((tool) => ({
          id: tool.id,
          name: tool.name,
          dot: TOOL_TYPE_COLOR[tool.type],
          depth: 0,
          badge: TOOL_TYPE_LABEL[tool.type],
          noted: (tool.notes ?? '').trim() !== '',
        }))}
        selectedId={selected?.id ?? null}
        onSelect={(id) => {
          setSelectedId(id);
          setProblem(null);
        }}
        newName={newName}
        onNewName={setNewName}
        onAdd={add}
        addLabel="New tool name"
        emptyText="No tool matches. Clear the filter, or add one below."
        canAdd={newName.trim() !== '' && newDescription.trim() !== ''}
        addExtra={
          <input
            value={newDescription}
            placeholder="What it does"
            aria-label="New tool description"
            data-testid="library-new-description"
            onChange={(event) => setNewDescription(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') add();
            }}
          />
        }
      />

      <div className="datadetail" data-testid="library-detail">
        {problem !== null && (
          <p className="dialog-error" role="status" data-testid="tool-problem">
            {problem}
          </p>
        )}
        {selected === null ? (
          <p className="data-empty">Nothing selected. Add a tool, or clear the filter.</p>
        ) : (
          <div key={selected.id}>
            <ItemHeader
              name={selected.name}
              subtitle={selected.description ?? 'No description yet'}
              right={
                <span
                  className="stag"
                  style={{
                    color: TOOL_TYPE_COLOR[selected.type],
                    borderColor: TOOL_TYPE_COLOR[selected.type],
                  }}
                >
                  {TOOL_TYPE_LABEL[selected.type]}
                </span>
              }
              onRename={(next) => {
                const result = updateTool(selected.id, { name: next });
                return result.ok ? null : result.reason;
              }}
              onDelete={() => {
                const result = deleteTool(selected.id);
                if (result.ok) {
                  setSelectedId(null);
                  return null;
                }
                return result.blockedBy === undefined
                  ? result.reason
                  : `${result.reason} ${result.blockedBy.join(', ')}.`;
              }}
            />
            <UsedBy fleet={fleet} kind="tool" itemId={selected.id} />
            <ToolFields id={selected.id} error={error} onError={setError} />
          </div>
        )}
      </div>
    </div>
  );
}
