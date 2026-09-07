/**
 * The fleet read backwards: not "what does this agent need?" but "what does
 * Marketing still owe, and who is blocked until they deliver?".
 *
 * Two ways in. "Every department" is the planning list, grouped by provider. Pick
 * one department and it becomes that department's own page — their Ansprechpartner,
 * how many agents they are holding up, their items owed-first, and the briefing as
 * plain text to send them. An overview nobody sends is a dashboard.
 *
 * Clicking a row opens the same editor the tree uses, in place: working through a
 * department's list and having to leave it to fix a status was the wrong shape.
 * While a row is open its compact "Provided by" pair is hidden, because the editor
 * carries those two fields itself and two sets of the same control is a trap.
 *
 * DEVIATION: beyond SPEC §5. SPEC §1 calls the board a roadmap and §5.6 gives every
 * component a status, but nothing in the spec says who turns Planned into Live.
 */
import { useState } from 'react';
import { DATA_SOURCE_STATUS_LABELS } from '../../model/schemas.js';
import type { DataSource, Fleet, Status } from '../../model/schemas.js';
import {
  dataItemMatches,
  dataObligations,
  departmentBriefing,
  departmentNamed,
  departmentWorkload,
  providerOptions,
} from '../../model/selectors.js';
import type { DataQuery, OwnerWorkload } from '../../model/selectors.js';
import { DataFields } from '../../panel/DataFields.js';
import { ProviderSelect } from '../../panel/ProviderSelect.js';
import { useFleetStore } from '../../store/fleetStore.js';
import { useUiStore } from '../../store/uiStore.js';
import { dataDotColor, STATUS_COLOR } from '../../ui/palette.js';

/** Items read owed-first: nobody should scroll past done work to find the ask. */
const OWED_FIRST: Status[] = ['planned', 'building', 'live'];

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

/**
 * Assigning a department is the whole point of this pane, so it happens here
 * rather than in the tree. The options are the fleet's departments plus any
 * provider already named — a department that owes nothing yet still has to be
 * offerable, or it can never be asked for anything.
 */
function Assignment({
  fleet,
  source,
  showContact,
  onProblem,
}: {
  fleet: Fleet;
  source: DataSource;
  /** False on a department page, whose header already names the person once. */
  showContact: boolean;
  onProblem: (reason: string | null) => void;
}): React.JSX.Element {
  const updateDataSource = useFleetStore((s) => s.updateDataSource);
  const updateAgent = useFleetStore((s) => s.updateAgent);
  const department = departmentNamed(fleet, source.owner);
  return (
    <div className="prep-assign">
      <label>
        <span>Provided by</span>
        {/* Same control as the editor: a department missing from the board can be
            added from here rather than by leaving for the 2D view. */}
        <ProviderSelect
          fleet={fleet}
          value={source.owner ?? ''}
          label={source.name}
          onPick={(owner) => updateDataSource(source.id, { owner })}
          onProblem={onProblem}
          testId="prep-owner"
        />
      </label>

      {/* A department is not someone you can chase, so the name comes next - and it
          belongs to the department, so every item it provides shows the same one. */}
      {showContact && department !== null && (
        <label>
          <span>Ansprechpartner</span>
          <input
            defaultValue={department.contact ?? ''}
            key={`${department.id}-${department.contact ?? ''}`}
            placeholder={`Who to ask at ${department.name}`}
            data-testid="prep-contact"
            aria-label={`Contact at ${department.name}`}
            onBlur={(event) => {
              if (event.target.value !== (department.contact ?? '')) {
                updateAgent(department.id, { contact: event.target.value });
              }
            }}
          />
        </label>
      )}
    </div>
  );
}

function Obligation({
  fleet,
  source,
  waitingAgents,
  showContact,
  open,
  onToggle,
  onJump,
}: {
  fleet: Fleet;
  source: DataSource;
  waitingAgents: { id: string; name: string }[];
  showContact: boolean;
  open: boolean;
  onToggle: () => void;
  onJump: (agentId: string) => void;
}): React.JSX.Element {
  const updateDataSource = useFleetStore((s) => s.updateDataSource);
  const [error, setError] = useState<string | null>(null);

  return (
    <li data-testid="prep-item" className={open ? 'editing' : undefined}>
      <div className="prep-item-head">
        <span className="tdot" style={{ background: dataDotColor(source.type) }} />
        <button
          type="button"
          className="prep-item-name"
          aria-expanded={open}
          data-testid="prep-open"
          onClick={onToggle}
        >
          {source.name}
        </button>
        <StatusTag status={source.status} />
        <span className="prep-caret" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </div>

      {/* The editor carries Provided by and Ansprechpartner itself, so the compact
          pair steps aside rather than competing with it. */}
      {!open && (
        <Assignment
          fleet={fleet}
          source={source}
          showContact={showContact}
          onProblem={setError}
        />
      )}

      {open ? (
        <div className="prep-editor">
          <label className="dialog-field">
            <span>Name</span>
            <input
              defaultValue={source.name}
              aria-label={`Rename ${source.name}`}
              data-testid="prep-rename"
              onBlur={(event) => {
                const next = event.target.value.trim();
                if (next === '' || next === source.name) {
                  event.target.value = source.name;
                  return;
                }
                const result = updateDataSource(source.id, { name: next });
                if (!result.ok) {
                  event.target.value = source.name;
                  setError(result.reason);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
          </label>

          {error !== null && (
            <p className="dialog-error" role="status" data-testid="prep-error">
              {error}
            </p>
          )}

          <DataFields id={source.id} onError={setError} />
        </div>
      ) : source.requirement !== undefined && source.requirement !== '' ? (
        <p className="prep-req">{source.requirement}</p>
      ) : (
        <button type="button" className="prep-missing" onClick={onToggle}>
          No requirement written yet — say what finished looks like
        </button>
      )}

      {waitingAgents.length > 0 && (
        <div className="ub">
          needed by
          {waitingAgents.map((agent) => (
            <button key={agent.id} type="button" className="ubn" onClick={() => onJump(agent.id)}>
              {agent.name}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

export function DataDepartments({
  fleet,
  query,
}: {
  fleet: Fleet;
  query: DataQuery;
}): React.JSX.Element {
  const only = useUiStore((s) => s.dataDepartment);
  const openDepartmentData = useUiStore((s) => s.openDepartmentData);
  const activate = useUiStore((s) => s.activate);
  const setView = useUiStore((s) => s.setView);
  const copied = useUiStore((s) => s.briefingCopied);
  const setCopied = useUiStore((s) => s.setBriefingCopied);

  const options = providerOptions(fleet);
  // The pane's own axis is the department; the rest of the query still applies.
  const keep = (source: DataSource): boolean =>
    dataItemMatches(source, { ...query, provider: { kind: 'all' } });

  const [openId, setOpenId] = useState<string | null>(null);
  const toggle = (id: string): void => setOpenId((current) => (current === id ? null : id));

  const jump = (agentId: string): void => {
    activate(agentId);
    setView('2d');
  };

  const work = only === null ? null : departmentWorkload(fleet, only);

  return (
    <div className="deptpane" data-testid="data-prep">
      <div className="prep-pick">
        <label htmlFor="prep-department">Department</label>
        <select
          id="prep-department"
          data-testid="prep-department"
          value={only ?? ''}
          onChange={(event) => openDepartmentData(event.target.value === '' ? null : event.target.value)}
        >
          <option value="">Every department</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {only !== null ? (
        work === null ? (
          <p className="data-empty" data-testid="prep-department-empty">
            Nothing has been asked of <b>{only}</b> yet. Set &ldquo;Provided by&rdquo; on an item to
            give them something.
          </p>
        ) : (
          <section className="prep-dept" data-testid="prep-department-page" data-owner={work.owner}>
            <header className="prep-dept-head">
              <div>
                <h3>{work.owner}</h3>
                <p>
                  {work.contact === null ? (
                    <span className="prep-nocontact">No Ansprechpartner named yet</span>
                  ) : (
                    <>Ansprechpartner · {work.contact}</>
                  )}
                  {work.blocking.length > 0 && (
                    <>
                      {' · '}blocks {work.blocking.length}{' '}
                      {work.blocking.length === 1 ? 'agent' : 'agents'}
                    </>
                  )}
                </p>
              </div>
              <div className="prep-dept-count" data-testid="prep-department-readiness">
                <b>
                  {work.obligations.length - work.outstanding} of {work.obligations.length}
                </b>
                ready
              </div>
            </header>

            {OWED_FIRST.map((group) => {
              const rows = work.obligations.filter(
                ({ source }) => source.status === group && keep(source),
              );
              if (rows.length === 0) return null;
              return (
                <div key={group} data-testid="prep-state-group" data-state={group}>
                  <p className="prep-grouplab">{DATA_SOURCE_STATUS_LABELS[group]}</p>
                  <ul className="prep-items">
                    {rows.map(({ source, waitingAgents }) => (
                      <Obligation
                        key={source.id}
                        fleet={fleet}
                        source={source}
                        waitingAgents={waitingAgents}
                        showContact={false}
                        open={openId === source.id}
                        onToggle={() => toggle(source.id)}
                        onJump={jump}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}

            <div className="prep-send">
              <p>
                {work.outstanding === 0
                  ? `${work.owner} has provided everything asked of them.`
                  : `Send ${work.contact ?? work.owner} the ${work.outstanding} outstanding ${
                      work.outstanding === 1 ? 'item' : 'items'
                    }, with what finished looks like for each.`}
              </p>
              <button
                type="button"
                className="chrome-btn on"
                data-testid="prep-copy"
                onClick={() => {
                  const text = departmentBriefing(fleet, work.owner);
                  // Clipboard access can be refused; the button must not lie.
                  void navigator.clipboard
                    .writeText(text)
                    .then(() => setCopied(true))
                    .catch(() => setCopied(false));
                }}
              >
                {copied ? 'Copied' : 'Copy as e-mail'}
              </button>
            </div>
          </section>
        )
      ) : (
        <EveryDepartment
          fleet={fleet}
          groups={dataObligations(fleet)}
          keep={keep}
          openId={openId}
          onToggle={toggle}
          onJump={jump}
        />
      )}
    </div>
  );
}

function EveryDepartment({
  fleet,
  groups,
  keep,
  openId,
  onToggle,
  onJump,
}: {
  fleet: Fleet;
  groups: OwnerWorkload[];
  keep: (source: DataSource) => boolean;
  openId: string | null;
  onToggle: (id: string) => void;
  onJump: (agentId: string) => void;
}): React.JSX.Element {
  const outstanding = groups.reduce((total, group) => total + group.outstanding, 0);

  if (groups.length === 0) {
    return (
      <p className="data-empty" data-testid="data-prep-empty">
        This fleet has no data yet. Add an item in Libraries and say who provides it.
      </p>
    );
  }

  return (
    <>
      <p className="prep-summary" data-testid="data-prep-summary">
        {outstanding === 0
          ? 'Everything is ready — nothing outstanding.'
          : `${outstanding} item${outstanding === 1 ? '' : 's'} still to provide across ${groups.length} ${
              groups.length === 1 ? 'party' : 'parties'
            }.`}
      </p>

      <div className="prep-list">
        {groups.map((group) => {
          const rows = group.obligations.filter(({ source }) => keep(source));
          if (rows.length === 0) return null;
          return (
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
                <p className="prep-hint">
                  Nobody has been asked for these yet — pick the department under each item.
                </p>
              )}

              <ul className="prep-items">
                {rows.map(({ source, waitingAgents }) => (
                  <Obligation
                    key={source.id}
                    fleet={fleet}
                    source={source}
                    waitingAgents={waitingAgents}
                    showContact
                    open={openId === source.id}
                    onToggle={() => onToggle(source.id)}
                    onJump={onJump}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
