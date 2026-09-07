/**
 * Top-left control cluster, matching the prototype's `#viewToggle`:
 * 2D / 3D switch, Auto-arrange (SPEC 5.8) and the Details toggle.
 */

import { useFleetStore } from '../../store/fleetStore.js';
import { useUiStore } from '../../store/uiStore.js';

export function TopBar(): React.JSX.Element {
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  const showDetails = useUiStore((s) => s.showDetails);
  const toggleDetails = useUiStore((s) => s.toggleDetails);
  const clearAgentPositions = useFleetStore((s) => s.clearAgentPositions);
  const requestFit = useUiStore((s) => s.requestFit);

  return (
    <div className="glass-bar fixed top-4 left-4 z-30 flex gap-0.5" data-testid="top-bar">
      <button
        type="button"
        className={`chrome-btn ${view === '2d' ? 'on' : ''}`}
        onClick={() => setView('2d')}
        data-testid="view-2d"
      >
        2D
      </button>
      <button
        type="button"
        className={`chrome-btn ${view === '3d' ? 'on' : ''}`}
        onClick={() => setView('3d')}
        data-testid="view-3d"
      >
        3D
      </button>
      {/* A peer of the two graph views, not a dialog over them: what the fleet is
          made of is its own question. */}
      <button
        type="button"
        className={`chrome-btn ${view === 'library' ? 'on' : ''}`}
        onClick={() => setView('library')}
        data-testid="view-library"
      >
        Library
      </button>

      {/* Auto-arrange and Details act on the graph, so they are hidden where
          there is no graph rather than sitting there doing nothing. */}
      {view !== 'library' && (
        <>
          <span className="chrome-div" />
          <button
            type="button"
            className="chrome-btn"
            onClick={() => {
              // SPEC 5.8: drop manual positions, re-run layout, refit.
              clearAgentPositions();
              requestFit();
            }}
            data-testid="auto-arrange"
          >
            Auto-arrange
          </button>
          <span className="chrome-div" />
          <button
            type="button"
            className={`chrome-btn ${showDetails ? 'on' : ''}`}
            onClick={toggleDetails}
            data-testid="details-toggle"
          >
            Details
          </button>
        </>
      )}
    </div>
  );
}
