/**
 * "Data prep" — the fleet read backwards.
 *
 * The board answers "what does this agent need?". A planning conversation asks the
 * inverse: "what does Marketing still owe, and who is blocked until they deliver?".
 * This groups every data item in the fleet by the party that provides it, shows
 * what finished looks like, and names the agents waiting on it.
 *
 * DEVIATION: beyond SPEC §5. SPEC §1 calls the board a roadmap and §5.6 gives every
 * component a status, but nothing in the spec says who turns Planned into Live. That
 * is the question this view exists to answer.
 */
import { DATA_SOURCE_STATUS_LABELS } from '../model/schemas.js';
import type { Status } from '../model/schemas.js';
import { dataObligations } from '../model/selectors.js';
import type { OwnerWorkload } from '../model/selectors.js';
import { selectActiveFleet, useFleetStore } from '../store/fleetStore.js';
import { useUiStore } from '../store/uiStore.js';
import { DATA_TYPE_COLOR, STATUS_COLOR } from '../ui/palette.js';

/** "3 of 7 ready" reads better than a bare count on either side. */
function readiness(group: OwnerWorkload): string {
  const total = group.obligations.length;
  return `${total - group.outstanding} of ${total} ready`;
}

function StatusTag({ status }: { status: Status }): React.JSX.Element {
  return (
    <span className="stag" style={{ color: STATUS_COLOR[status], borderColor: STATUS_COLOR[status] }}>
      {DATA_SOURCE_STATUS_LABELS[status]}
    </span>
  );
}

export function DataPrep(): React.JSX.Element | null {
  const open = useUiStore((s) => s.dataPrepOpen);
  const close = useUiStore((s) => s.closeDataPrep);
  const activate = useUiStore((s) => s.activate);
  const openLibrary = useUiStore((s) => s.openLibrary);
  const fleet = useFleetStore(selectActiveFleet);

  if (!open || !fleet) return null;

  const groups = dataObligations(fleet);
  const outstanding = groups.reduce((total, group) => total + group.outstanding, 0);

  return (
    <div className="dialog-scrim" role="dialog" aria-label="Data prep" data-testid="data-prep">
      <div className="dialog dialog-wide">
        <header className="dialog-head">
          <div>
            <h2>Data prep</h2>
            <p>
              Every data item in <b>{fleet.name}</b>, grouped by whoever provides it. Set
              &ldquo;Provided by&rdquo; on an item in Libraries to move it out of Unassigned.
            </p>
          </div>
          <button type="button" className="ins-close" onClick={close} aria-label="Close data prep">
            ✕
          </button>
        </header>

        {groups.length === 0 ? (
          <p className="dialog-empty" data-testid="data-prep-empty">
            This fleet has no data yet. Add an item in Libraries and say who provides it.
          </p>
        ) : (
          <>
            <p className="prep-summary" data-testid="data-prep-summary">
              {outstanding === 0
                ? 'Everything is ready — nothing outstanding.'
                : `${outstanding} item${outstanding === 1 ? '' : 's'} still to provide across ${groups.length} ${
                    groups.length === 1 ? 'party' : 'parties'
                  }.`}
            </p>

            <div className="prep-list">
              {groups.map((group) => (
                <section
                  key={group.owner ?? '__unassigned'}
                  className={`prep-group${group.owner === null ? ' unassigned' : ''}`}
                  data-testid="prep-group"
                  data-owner={group.owner ?? ''}
                >
                  <header className="prep-head">
                    <h3>{group.owner ?? 'Unassigned'}</h3>
                    <span className="prep-count">{readiness(group)}</span>
                  </header>

                  {group.owner === null && (
                    <p className="prep-hint">Nobody has been asked for these yet.</p>
                  )}

                  <ul className="prep-items">
                    {group.obligations.map(({ source, waitingAgents }) => (
                      <li key={source.id} data-testid="prep-item">
                        <div className="prep-item-head">
                          <span className="tdot" style={{ background: DATA_TYPE_COLOR[source.type] }} />
                          <b>{source.name}</b>
                          <StatusTag status={source.status} />
                          {/* The person to ask - an obligation without a name to
                              chase is not actionable. */}
                          {source.contact !== undefined && source.contact !== '' && (
                            <span className="prep-contact" data-testid="prep-contact">
                              {source.contact}
                            </span>
                          )}
                        </div>

                        {source.requirement !== undefined && source.requirement !== '' ? (
                          <p className="prep-req">{source.requirement}</p>
                        ) : (
                          <button
                            type="button"
                            className="prep-missing"
                            onClick={() => {
                              close();
                              openLibrary();
                            }}
                          >
                            No requirement written yet — say what finished looks like
                          </button>
                        )}

                        {waitingAgents.length > 0 && (
                          <div className="ub">
                            needed by
                            {waitingAgents.map((agent) => (
                              <button
                                key={agent.id}
                                type="button"
                                className="ubn"
                                onClick={() => {
                                  close();
                                  activate(agent.id);
                                }}
                              >
                                {agent.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
