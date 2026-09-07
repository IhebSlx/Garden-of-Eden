/**
 * "Sources…" — the list behind the Source dropdown, editable.
 *
 * Where data comes from is the user's world: SAP-Belege, Objektportal, a Dynamics
 * CRM. Five built-in kinds could not hold those without one of them being
 * mislabelled, and a mislabelled source reads as a decision somebody took.
 *
 * The built-in five are shown but not editable — SPEC §6 fixes their dot colours,
 * and a fleet that stops using one simply stops picking it. Everything a fleet adds
 * can be renamed, recoloured and removed, and removing one that data still points
 * at is refused with the names of what is in the way.
 */
import { useState } from 'react';
import { isBuiltInSource, SOURCE_KIND_COLORS } from '../../model/schemas.js';
import type { Fleet } from '../../model/schemas.js';
import { selectActiveFleet, useFleetStore } from '../../store/fleetStore.js';
import { allSourceKinds } from '../../ui/palette.js';

export function SourceKinds(): React.JSX.Element {
  const fleet = useFleetStore(selectActiveFleet);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="chrome-btn"
        data-testid="source-kinds-open"
        onClick={() => setOpen(true)}
        title="Add, rename or remove the sources data can come from"
      >
        Sources…
      </button>
      {open && fleet !== undefined && <Dialog fleet={fleet} onClose={() => setOpen(false)} />}
    </>
  );
}

function Dialog({ fleet, onClose }: { fleet: Fleet; onClose: () => void }): React.JSX.Element {
  const addSourceKind = useFleetStore((s) => s.addSourceKind);
  const updateSourceKind = useFleetStore((s) => s.updateSourceKind);
  const deleteSourceKind = useFleetStore((s) => s.deleteSourceKind);

  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(SOURCE_KIND_COLORS[0]);
  const [problem, setProblem] = useState<string | null>(null);

  const kinds = allSourceKinds(fleet);
  const countFor = (id: string): number => fleet.dataSources.filter((d) => d.type === id).length;

  const add = (): void => {
    const result = addSourceKind(name, color);
    if (!result.ok) {
      setProblem(result.reason);
      return;
    }
    setProblem(null);
    setName('');
  };

  return (
    <div className="dialog-scrim" role="dialog" aria-label="Sources" data-testid="source-kinds">
      <div className="dialog">
        <h2>Sources</h2>
        <p className="dialog-lead">
          Where data comes from. The five the app ships with cannot be changed — their colours are
          part of the design — but you can add your own beside them, and a source in use cannot be
          removed until the data using it points somewhere else.
        </p>

        {problem !== null && (
          <p className="dialog-error" role="status" data-testid="source-kinds-error">
            {problem}
          </p>
        )}

        <ul className="kind-list">
          {kinds.map((kind) => {
            const built = isBuiltInSource(kind.id);
            const used = countFor(kind.id);
            return (
              <li key={kind.id} data-testid="source-kind" data-built-in={built ? 'true' : 'false'}>
                <span className="tdot" style={{ background: kind.color }} />

                {built ? (
                  <span className="kind-name built">{kind.name}</span>
                ) : (
                  <input
                    className="kind-name"
                    defaultValue={kind.name}
                    aria-label={`Rename ${kind.name}`}
                    data-testid="source-kind-name"
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      if (next === '' || next === kind.name) {
                        event.target.value = kind.name;
                        return;
                      }
                      const result = updateSourceKind(kind.id, { name: next });
                      if (!result.ok) {
                        event.target.value = kind.name;
                        setProblem(result.reason);
                      } else {
                        setProblem(null);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                  />
                )}

                <small className="kind-used">
                  {used === 0 ? 'unused' : `${used} ${used === 1 ? 'item' : 'items'}`}
                </small>

                {built ? (
                  <small className="kind-built">built in</small>
                ) : (
                  <>
                    <Swatches
                      current={kind.color}
                      label={kind.name}
                      onPick={(next) => {
                        const result = updateSourceKind(kind.id, { color: next });
                        setProblem(result.ok ? null : result.reason);
                      }}
                    />
                    <button
                      type="button"
                      className="lib-delete"
                      aria-label={`Remove ${kind.name}`}
                      data-testid="source-kind-delete"
                      onClick={() => {
                        const result = deleteSourceKind(kind.id);
                        setProblem(
                          result.ok
                            ? null
                            : result.blockedBy === undefined
                              ? result.reason
                              : `${result.reason} ${result.blockedBy.join(', ')}.`,
                        );
                      }}
                    >
                      ✕
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>

        <div className="kind-add">
          <span className="tdot" style={{ background: color }} />
          <input
            value={name}
            placeholder="New source, e.g. SAP or Objektportal"
            aria-label="New source name"
            data-testid="source-kind-new"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') add();
            }}
          />
          <Swatches current={color} label="the new source" onPick={setColor} />
          <button
            type="button"
            className="chrome-btn"
            data-testid="source-kind-add"
            disabled={name.trim() === ''}
            onClick={add}
          >
            Add
          </button>
        </div>

        <div className="dialog-row">
          <button type="button" className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/** The palette, as dots: a colour picker with no wrong answers in it. */
function Swatches({
  current,
  label,
  onPick,
}: {
  current: string;
  label: string;
  onPick: (color: string) => void;
}): React.JSX.Element {
  return (
    <span className="kind-swatches">
      {SOURCE_KIND_COLORS.map((option) => (
        <button
          key={option}
          type="button"
          className={`kind-swatch ${option === current ? 'on' : ''}`}
          style={{ background: option }}
          aria-label={`Colour ${label} ${option}`}
          aria-pressed={option === current}
          onClick={() => onPick(option)}
        />
      ))}
    </span>
  );
}
