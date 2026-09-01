/**
 * SPEC 5.6 filter bar. Non-matching components ghost to 5% rather than
 * disappearing, and the filter composes with focus by intersection - both of which
 * happen in `computeVisibility`, not here.
 */
import { STATUS_LABELS } from '../../model/schemas.js';
import type { Status } from '../../model/schemas.js';
import { useUiStore } from '../../store/uiStore.js';
import { STATUS_COLOR } from '../../ui/palette.js';

const ORDER: Status[] = ['live', 'building', 'planned'];

export function FilterBar(): React.JSX.Element {
  const statusFilter = useUiStore((s) => s.statusFilter);
  const toggleStatusFilter = useUiStore((s) => s.toggleStatusFilter);

  return (
    <div className="glass-bar fixed top-[52px] left-4 z-20 flex gap-0.5" data-testid="filter-bar">
      <button
        type="button"
        className={`fbtn ${statusFilter === null ? 'on' : ''}`}
        onClick={() => toggleStatusFilter(null)}
        data-testid="filter-all"
      >
        All
      </button>
      {ORDER.map((status) => (
        <button
          key={status}
          type="button"
          className={`fbtn ${statusFilter === status ? 'on' : ''}`}
          onClick={() => toggleStatusFilter(status)}
          data-testid={`filter-${status}`}
        >
          <span className="sd" style={{ background: STATUS_COLOR[status] }} />
          {STATUS_LABELS[status]}
        </button>
      ))}
    </div>
  );
}
