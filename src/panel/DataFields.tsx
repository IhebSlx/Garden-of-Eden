/**
 * The editor for one data item, shared by the Libraries dialog and the Data view.
 *
 * Every field the schema carries: the source (a system, a department, or nothing
 * decided yet), whether it exists or is still owed, which department provides it,
 * that department's Ansprechpartner, what it sits inside, what finished looks
 * like, its `ref` and its notes.
 */
import { DATA_SOURCE_STATUS_LABELS } from '../model/schemas.js';
import type { Status } from '../model/schemas.js';
import { dataDescendants, departmentNamed, flattenData } from '../model/selectors.js';
import { selectActiveFleet, useFleetStore } from '../store/fleetStore.js';
import { allSourceKinds, STATUS_COLOR } from '../ui/palette.js';
import { NotesField } from './NotesField.js';
import { ProviderSelect } from './ProviderSelect.js';

/** Whether a reference is somewhere a browser can actually go. */
function isOpenable(ref: string | undefined): ref is string {
  if (ref === undefined) return false;
  return /^https?:\/\//i.test(ref.trim());
}

const STATUSES: Status[] = ['live', 'building', 'planned'];

export function DataFields({
  id,
  onError,
}: {
  id: string;
  onError: (reason: string) => void;
}): React.JSX.Element | null {
  const fleet = useFleetStore(selectActiveFleet);
  const updateDataSource = useFleetStore((s) => s.updateDataSource);
  const updateAgent = useFleetStore((s) => s.updateAgent);
  const source = fleet?.dataSources.find((d) => d.id === id);
  if (!fleet || !source) return null;
  const department = departmentNamed(fleet, source.owner);
  return (
    <div className="lib-fields" data-testid="data-editor">
      <div className="lib-field-row">
        <label className="dialog-field">
          <span>Source</span>
          <select
            value={source.type ?? ''}
            aria-label={`Source of ${source.name}`}
            data-testid="data-source"
            onChange={(event) =>
              updateDataSource(id, {
                type: event.target.value === '' ? undefined : event.target.value,
              })
            }
          >
            {/* Where data will live is often undecided while the need is not. */}
            <option value="">Not assigned yet</option>
            {allSourceKinds(fleet).map((kind) => (
              <option key={kind.id} value={kind.id}>
                {kind.name}
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
      <label className="lib-check">
        <input
          type="checkbox"
          checked={source.linked ?? false}
          data-testid="data-linked"
          onChange={(event) => updateDataSource(id, { linked: event.target.checked })}
        />
        <span>
          Linked — the agent can actually read it
          {source.status !== 'live' && <em> (normally only once it exists)</em>}
        </span>
      </label>

      <div className="lib-field-row">
        <label className="dialog-field">
          <span>Provided by</span>
          <ProviderSelect
            fleet={fleet}
            value={source.owner ?? ''}
            label={source.name}
            onPick={(owner) => updateDataSource(id, { owner })}
            onProblem={(reason) => {
              if (reason !== null) onError(reason);
            }}
            testId="data-provider"
          />
        </label>

        {/* One person per department, not one per item it provides: this edits the
            department itself, so every item from it says the same name. */}
        {department !== null && (
          <label className="dialog-field">
            <span>Ansprechpartner</span>
            <input
              defaultValue={department.contact ?? ''}
              key={`contact-${department.id}-${department.contact ?? ''}`}
              aria-label={`Contact at ${department.name}`}
              placeholder={`Who to ask at ${department.name}`}
              data-testid="data-contact"
              onBlur={(event) => {
                if (event.target.value !== (department.contact ?? '')) {
                  updateAgent(department.id, { contact: event.target.value });
                }
              }}
            />
          </label>
        )}
      </div>

      {source.owner !== undefined && source.owner.trim() !== '' && department === null && (
        <p className="lib-hint" data-testid="data-provider-orphan">
          No department called &ldquo;{source.owner}&rdquo; in this fleet, so there is nobody to
          name as Ansprechpartner. Add the department, or pick another one.
        </p>
      )}

      <label className="dialog-field">
        <span>Inside</span>
        <select
          value={source.parentId ?? ''}
          aria-label={`What ${source.name} is part of`}
          data-testid="data-parent"
          onChange={(event) => {
            const next = event.target.value;
            const result = updateDataSource(id, next === '' ? { parentId: undefined } : { parentId: next });
            if (!result.ok) onError(result.reason);
          }}
        >
          <option value="">Nothing — this is a top-level item</option>
          {/* Itself and its own contents are excluded, or nesting could loop. */}
          {flattenData(fleet)
            .filter(
              ({ source: candidate }) =>
                candidate.id !== id && !dataDescendants(fleet, id).some((d) => d.id === candidate.id),
            )
            .map(({ source: candidate, depth }) => (
              <option key={candidate.id} value={candidate.id}>
                {`${'  '.repeat(depth)}${candidate.name}`}
              </option>
            ))}
        </select>
      </label>

      <label className="dialog-field">
        <span>What has to be prepared</span>
        <textarea
          rows={2}
          defaultValue={source.requirement ?? ''}
          aria-label={`Requirement for ${source.name}`}
          placeholder="Every product image, named produkt_variante.png, 2000px on the long edge"
          onBlur={(event) => updateDataSource(id, { requirement: event.target.value })}
        />
      </label>

      <label className="dialog-field">
        <span>Link to the document</span>
        <span className="linkrow">
          <input
            defaultValue={source.ref ?? ''}
            aria-label={`Link for ${source.name}`}
            placeholder="https://solarlux.sharepoint.com/sites/…"
            data-testid="data-link"
            onBlur={(event) => updateDataSource(id, { ref: event.target.value })}
          />
          {/* Only a real URL gets an Open button: a path or a table name is a
              reference, not somewhere a browser can go. */}
          {isOpenable(source.ref) && (
            <a
              className="chrome-btn"
              href={source.ref}
              target="_blank"
              rel="noreferrer noopener"
              data-testid="data-link-open"
            >
              Open ↗
            </a>
          )}
        </span>
      </label>

      <NotesField
        value={source.notes}
        label={source.name}
        testId="data-notes"
        onCommit={(next) => updateDataSource(id, { notes: next })}
      />
    </div>
  );
}
