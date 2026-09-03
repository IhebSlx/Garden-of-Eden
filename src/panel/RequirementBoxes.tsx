/**
 * "Data to provide" — the nested boxes saying what this agent owes the fleet.
 *
 * A box may contain boxes, so this renders itself recursively. Every box carries a
 * status, because the question being asked is not "what data exists" but "what is
 * still outstanding" — the same roadmap language as the rest of the board (SPEC §1).
 */
import { useState } from 'react';
import { requirementProgress } from '../model/requirements.js';
import { STATUS_LABELS } from '../model/schemas.js';
import type { DataRequirement, Status } from '../model/schemas.js';
import { STATUS_COLOR } from '../ui/palette.js';
import { useFleetStore } from '../store/fleetStore.js';

const NEXT_STATUS: Record<Status, Status> = { planned: 'building', building: 'live', live: 'planned' };

/** One box, plus whatever it contains. */
function Box({
  agentId,
  box,
  depth,
  siblingCount,
  index,
}: {
  agentId: string;
  box: DataRequirement;
  depth: number;
  siblingCount: number;
  index: number;
}): React.JSX.Element {
  const update = useFleetStore((s) => s.updateRequirement);
  const remove = useFleetStore((s) => s.deleteRequirement);
  const move = useFleetStore((s) => s.moveRequirement);
  const add = useFleetStore((s) => s.addRequirement);

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const submit = (): void => {
    if (draft.trim() !== '') add(agentId, box.id, draft);
    setDraft('');
    setAdding(false);
  };

  return (
    <li className="rq-box" data-testid="requirement-box" data-depth={depth} data-status={box.status}>
      <div className="rq-head">
        <button
          type="button"
          className="rq-status"
          style={{ '--sc': STATUS_COLOR[box.status] } as React.CSSProperties}
          // One click advances the status: Planned -> In progress -> Live -> Planned.
          onClick={() => update(agentId, box.id, { status: NEXT_STATUS[box.status] })}
          aria-label={`${box.title} is ${STATUS_LABELS[box.status]}. Change status`}
        >
          <span className="sd" style={{ background: STATUS_COLOR[box.status] }} />
          {STATUS_LABELS[box.status]}
        </button>

        <input
          className="rq-title"
          defaultValue={box.title}
          key={box.title}
          aria-label={`Rename ${box.title}`}
          onBlur={(event) => {
            const next = event.target.value.trim();
            if (next === '' || next === box.title) event.target.value = box.title;
            else update(agentId, box.id, { title: next });
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />

        <span className="rq-actions">
          <button
            type="button"
            onClick={() => setAdding((on) => !on)}
            aria-label={`Add a box inside ${box.title}`}
            title="Add a box inside this one"
          >
            +
          </button>
          <button
            type="button"
            disabled={index === 0}
            onClick={() => move(agentId, box.id, -1)}
            aria-label={`Move ${box.title} up`}
          >
            ↑
          </button>
          <button
            type="button"
            disabled={index === siblingCount - 1}
            onClick={() => move(agentId, box.id, 1)}
            aria-label={`Move ${box.title} down`}
          >
            ↓
          </button>
          <button
            type="button"
            className="rq-delete"
            onClick={() => remove(agentId, box.id)}
            aria-label={`Delete ${box.title}${box.children.length > 0 ? ' and everything in it' : ''}`}
          >
            ✕
          </button>
        </span>
      </div>

      <input
        className="rq-note"
        defaultValue={box.notes ?? ''}
        key={`note-${box.notes ?? ''}`}
        placeholder="What exactly, and in what shape?"
        aria-label={`Detail for ${box.title}`}
        onBlur={(event) => {
          if (event.target.value !== (box.notes ?? '')) update(agentId, box.id, { notes: event.target.value });
        }}
      />

      {(box.children.length > 0 || adding) && (
        <ul className="rq-children">
          {box.children.map((child, childIndex) => (
            <Box
              key={child.id}
              agentId={agentId}
              box={child}
              depth={depth + 1}
              index={childIndex}
              siblingCount={box.children.length}
            />
          ))}
          {adding && (
            <li className="rq-new">
              <input
                autoFocus
                value={draft}
                placeholder="Name the box…"
                aria-label={`New box inside ${box.title}`}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={submit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submit();
                  if (event.key === 'Escape') {
                    setDraft('');
                    setAdding(false);
                  }
                }}
              />
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

export function RequirementBoxes({ agentId, name }: { agentId: string; name: string }): React.JSX.Element {
  const tree = useFleetStore(
    (s) =>
      (s.activeFleetId === null ? undefined : s.fleets[s.activeFleetId])?.agents.find((a) => a.id === agentId)
        ?.dataRequirements ?? EMPTY,
  );
  const add = useFleetStore((s) => s.addRequirement);
  const [draft, setDraft] = useState('');

  const progress = requirementProgress(tree);

  const submit = (): void => {
    if (draft.trim() !== '') add(agentId, null, draft);
    setDraft('');
  };

  return (
    <div className="rq" data-testid="requirement-boxes">
      <h3>
        Data to provide
        {progress.total > 0 && (
          <span className="rq-count" data-testid="requirement-count">
            {progress.outstanding === 0
              ? `all ${progress.total} ready`
              : `${progress.outstanding} of ${progress.total} outstanding`}
          </span>
        )}
      </h3>

      {tree.length === 0 && (
        <p className="rq-empty">
          Nothing recorded yet. Add a box for each thing {name} has to deliver — a box may hold
          further boxes.
        </p>
      )}

      {tree.length > 0 && (
        <ul className="rq-list">
          {tree.map((box, index) => (
            <Box
              key={box.id}
              agentId={agentId}
              box={box}
              depth={0}
              index={index}
              siblingCount={tree.length}
            />
          ))}
        </ul>
      )}

      <input
        className="rq-add"
        value={draft}
        placeholder="Add a box…"
        aria-label={`Add a box to ${name}`}
        data-testid="requirement-add"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={submit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit();
        }}
      />
    </div>
  );
}

/** Stable empty array: a new [] each render would break the store's snapshot check. */
const EMPTY: DataRequirement[] = [];
