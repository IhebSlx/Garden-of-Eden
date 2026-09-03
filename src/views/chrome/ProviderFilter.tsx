/**
 * "Provided by" — show only what depends on data a given party still owes.
 *
 * Sits beside the status filter and composes with it and with focus by
 * intersection, all of which happens in `computeVisibility`, not here.
 *
 * The list is derived from the data itself rather than from the departments in the
 * fleet: whoever provides data is often a human team that is not an agent, and a
 * provider with nothing to give would only be noise in the menu.
 */
import { dataProviders } from '../../model/selectors.js';
import { selectActiveFleet, useFleetStore } from '../../store/fleetStore.js';
import { useUiStore } from '../../store/uiStore.js';

export function ProviderFilter(): React.JSX.Element | null {
  const fleet = useFleetStore(selectActiveFleet);
  const providerFilter = useUiStore((s) => s.providerFilter);
  const setProviderFilter = useUiStore((s) => s.setProviderFilter);

  // Nothing owes anything yet: an empty menu would be a dead control.
  if (!fleet) return null;
  const providers = dataProviders(fleet);
  if (providers.length === 0) return null;

  const outstanding = (provider: string): number =>
    fleet.dataSources.filter(
      (source) =>
        (source.owner ?? '').trim().toLowerCase() === provider.toLowerCase() &&
        source.status !== 'live',
    ).length;

  return (
    <div className="glass-bar provider-filter" data-testid="provider-filter">
      <label htmlFor="provider-filter-select">Provided by</label>
      <select
        id="provider-filter-select"
        value={providerFilter ?? ''}
        data-testid="provider-filter-select"
        onChange={(event) => setProviderFilter(event.target.value === '' ? null : event.target.value)}
      >
        <option value="">Everyone</option>
        {providers.map((provider) => {
          const open = outstanding(provider);
          return (
            <option key={provider} value={provider}>
              {provider}
              {open > 0 ? ` — ${open} outstanding` : ' — all delivered'}
            </option>
          );
        })}
      </select>

      {providerFilter !== null && (
        <button
          type="button"
          className="provider-clear"
          onClick={() => setProviderFilter(null)}
          aria-label="Show every provider again"
        >
          ✕
        </button>
      )}
    </div>
  );
}
