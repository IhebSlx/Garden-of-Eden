/**
 * "Data to provide" — the fleet read as a list of obligations per department.
 *
 * The panel's box editor answers "what does THIS department owe". This answers the
 * question a planning meeting actually asks: "what does every department owe, and
 * who is furthest behind?". Read-only on purpose — one place to edit a box, one
 * place to survey them all.
 */
import { departmentObligations } from '../model/selectors.js';
import { STATUS_LABELS } from '../model/schemas.js';
import type { DataRequirement } from '../model/schemas.js';
import { STATUS_COLOR } from '../ui/palette.js';
import { selectActiveFleet, useFleetStore } from '../store/fleetStore.js';
import { useUiStore } from '../store/uiStore.js';

/** Renders one box and whatever it contains, read-only. */
function BoxRow({ box, depth }: { box: DataRequirement; depth: number }): React.JSX.Element {
  return (
    <li data-testid="overview-box" data-depth={depth}>
      <div className="ov-row">
        <span className="sd" style={{ background: STATUS_COLOR[box.status] }} />
        <b>{box.title}</b>
        <span className="ov-status" style={{ color: STATUS_COLOR[box.status] }}>
          {STATUS_LABELS[box.status]}
        </span>
      </div>
      {box.notes !== undefined && box.notes !== '' && <p className="ov-note">{box.notes}</p>}
      {box.children.length > 0 && (
        <ul className="ov-children">
          {box.children.map((child) => (
            <BoxRow key={child.id} box={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function DataToProvide(): React.JSX.Element | null {
  const open = useUiStore((s) => s.provideOpen);
  const close = useUiStore((s) => s.closeProvide);
  const activate = useUiStore((s) => s.activate);
  const fleet = useFleetStore(selectActiveFleet);

  if (!open || !fleet) return null;

  const groups = departmentObligations(fleet);
  const outstanding = groups.reduce((total, group) => total + group.progress.outstanding, 0);
  const recorded = groups.reduce((total, group) => total + group.progress.total, 0);

  return (
    <div className="dialog-scrim" role="dialog" aria-label="Data to provide" data-testid="data-to-provide">
      <div className="dialog dialog-wide">
        <header className="dialog-head">
          <div>
            <h2>Data to provide</h2>
            <p>
              What each department has to deliver for <b>{fleet.name}</b>. Boxes are edited on the
              department itself — click its name to go there.
            </p>
          </div>
          <button type="button" className="ins-close" onClick={close} aria-label="Close data to provide">
            ✕
          </button>
        </header>

        {groups.length === 0 ? (
          <p className="dialog-empty">This fleet has no departments yet.</p>
        ) : (
          <>
            <p className="prep-summary" data-testid="provide-summary">
              {recorded === 0
                ? 'Nothing recorded yet. Open a department and add the boxes it owes.'
                : outstanding === 0
                  ? `All ${recorded} recorded across ${groups.length} departments, nothing outstanding.`
                  : `${outstanding} of ${recorded} still outstanding across ${groups.length} departments.`}
            </p>

            <div className="prep-list">
              {groups.map(({ agent, requirements, progress }) => (
                <section
                  key={agent.id}
                  className={`prep-group${progress.total === 0 ? ' unassigned' : ''}`}
                  data-testid="provide-group"
                  data-department={agent.name}
                >
                  <header className="prep-head">
                    <h3>
                      <button type="button" className="ov-jump" onClick={() => { close(); activate(agent.id); }}>
                        {agent.name}
                      </button>
                    </h3>
                    <span className="prep-count">
                      {progress.total === 0
                        ? 'nothing recorded'
                        : progress.outstanding === 0
                          ? `all ${progress.total} ready`
                          : `${progress.outstanding} of ${progress.total} outstanding`}
                    </span>
                  </header>

                  {requirements.length === 0 ? (
                    <p className="prep-hint">Nobody has written down what this department owes.</p>
                  ) : (
                    <ul className="ov-list">
                      {requirements.map((box) => (
                        <BoxRow key={box.id} box={box} depth={0} />
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
