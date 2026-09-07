/**
 * SPEC 5.1: "Toggle 2D / 3D anywhere; focus, selection, filter and search state
 * carry across the switch."  Both views subscribe to the same stores, so nothing
 * is handed over - the state simply never belonged to either view (SPEC 2.1).
 *
 * SPEC 8.2 morph: the 3D scene stays mounted for the length of the transition and
 * flattens its nodes onto the 2D layout while the camera rises to top-down (and
 * the reverse), then the board takes over. Under `prefers-reduced-motion` the
 * morph is skipped and the views cross-fade instantly.
 */
import { Suspense, lazy, useEffect } from 'react';
import { Board } from './board2d/Board.js';
import { DataView } from './data/DataView.js';
import { useUiStore } from '../store/uiStore.js';
import { MORPH_MS } from '../ui/constants.js';
import { usePrefersReducedMotion } from '../ui/usePrefersReducedMotion.js';

// The three.js bundle is large and the board is the default view, so the 3D
// scene is only fetched once someone actually switches to it.
const Scene = lazy(() => import('./space3d/Scene.js').then((m) => ({ default: m.Scene })));

export function ViewSwitch(): React.JSX.Element {
  const view = useUiStore((s) => s.view);
  const morph = useUiStore((s) => s.morph);
  const endMorph = useUiStore((s) => s.endMorph);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (morph === null) return;
    if (reducedMotion) {
      endMorph();
      return;
    }
    const timer = setTimeout(endMorph, MORPH_MS);
    return () => clearTimeout(timer);
  }, [endMorph, morph, reducedMotion]);

  const morphing = morph !== null && !reducedMotion;
  // During a morph the outgoing view stays mounted so it can animate out.
  const show3d = view === '3d' || (morphing && morph.from === '3d');
  // The board only fades in once the flattening morph has landed.
  const board2dVisible = view === '2d' && !morphing;
  const showData = view === 'data';

  return (
    <div className="viewswitch" data-testid="view-switch" data-view={view}>
      <div
        className={`viewlayer ${board2dVisible ? 'on' : ''}`}
        aria-hidden={!board2dVisible}
        data-testid="viewlayer-2d"
        data-live={board2dVisible}
      >
        <Board />
      </div>
      <div className={`viewlayer ${show3d ? 'on' : ''}`} aria-hidden={!show3d}>
        {show3d && (
          <Suspense fallback={<div className="scene-loading">Loading 3D space…</div>}>
            <Scene />
          </Suspense>
        )}
      </div>
      <div
        className={`viewlayer ${showData ? 'on' : ''}`}
        aria-hidden={!showData}
        data-testid="viewlayer-data"
        data-live={showData}
      >
        {showData && <DataView />}
      </div>
    </div>
  );
}
