/**
 * The three axes the data can be asked for, as one control group.
 *
 * Shared by the Data view and the Libraries dialog so the two can never offer
 * different filters for the same library. The counts on the state chips respect
 * the other two axes, so a chip reading "3" means three under what is already set.
 */
import { DATA_SOURCE_LABELS, DATA_SOURCE_STATUS_LABELS } from '../../model/schemas.js';
import type { DataSourceType, Fleet, Status } from '../../model/schemas.js';
import { dataItemMatches, providerOptions } from '../../model/selectors.js';
import type { DataQuery } from '../../model/selectors.js';
import { STATUS_COLOR } from '../../ui/palette.js';

const DATA_TYPES: DataSourceType[] = ['dataverse', 'sharepoint', 'md', 'file', 'department'];

/** Chips read in the app order, the same as the board's own filter bar. */
const STATUSES: Status[] = ['live', 'building', 'planned'];

/** The provider axis as a <select> value, and back again. */
const providerValue = (provider: DataQuery['provider']): string =>
  provider.kind === 'all' ? '' : provider.kind === 'none' ? 'none' : `by:${provider.name}`;

// Prefixed, so a department called "none" is still just a department.
const providerFromValue = (value: string): DataQuery['provider'] =>
  value === ''
    ? { kind: 'all' }
    : value === 'none'
      ? { kind: 'none' }
      : { kind: 'provider', name: value.slice('by:'.length) };

const sourceFromValue = (value: string): DataQuery['source'] =>
  value === '' ? null : value === 'unassigned' ? 'unassigned' : (value as DataSourceType);

export function DataFilters({
  fleet,
  query,
  onChange,
  idPrefix,
}: {
  fleet: Fleet;
  query: DataQuery;
  onChange: (next: DataQuery) => void;
  /** Two hosts can be mounted at once, so the label/control ids must differ. */
  idPrefix: string;
}): React.JSX.Element {
  return (
    <div className="datafilters" data-testid="data-filter">
      <div className="lib-chips">
        {([null, ...STATUSES] as (Status | null)[]).map((status) => {
          const count = fleet.dataSources.filter((source) =>
            dataItemMatches(source, { ...query, status }),
          ).length;
          return (
            <button
              key={status ?? 'all'}
              type="button"
              className={`chrome-btn ${query.status === status ? 'on' : ''}`}
              data-testid={`data-status-${status ?? 'all'}`}
              onClick={() => onChange({ ...query, status })}
            >
              {status !== null && (
                <span className="fdot" style={{ background: STATUS_COLOR[status] }} />
              )}
              {status === null ? 'All' : DATA_SOURCE_STATUS_LABELS[status]} {count}
            </button>
          );
        })}
      </div>

      <div className="lib-filter">
        <label htmlFor={`${idPrefix}-source-filter`}>Source</label>
        <select
          id={`${idPrefix}-source-filter`}
          data-testid="data-source-filter"
          value={query.source ?? ''}
          onChange={(event) => onChange({ ...query, source: sourceFromValue(event.target.value) })}
        >
          <option value="">Any source</option>
          {DATA_TYPES.map((type) => (
            <option key={type} value={type}>
              {DATA_SOURCE_LABELS[type]}
            </option>
          ))}
          <option value="unassigned">Not assigned yet</option>
        </select>
      </div>

      <div className="lib-filter">
        <label htmlFor={`${idPrefix}-provider-filter`}>Provided by</label>
        <select
          id={`${idPrefix}-provider-filter`}
          data-testid="data-provider-filter"
          value={providerValue(query.provider)}
          onChange={(event) =>
            onChange({ ...query, provider: providerFromValue(event.target.value) })
          }
        >
          <option value="">Every department</option>
          <option value="none">Nobody yet</option>
          {providerOptions(fleet).map((provider) => (
            <option key={provider} value={`by:${provider}`}>
              {provider}
            </option>
          ))}
        </select>
        {query.provider.kind !== 'all' && (
          <button
            type="button"
            className="lib-filter-clear"
            onClick={() => onChange({ ...query, provider: { kind: 'all' } })}
            aria-label="Show data from every department again"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
