/**
 * SPEC 5.1: "Toggle 2D / 3D anywhere; focus, selection, filter and search state
 * carry across the switch. v1 switch: crossfade."
 *
 * Both views subscribe to the same stores, so nothing is handed over - the state
 * simply never belonged to either view (SPEC 2.1).
 */
import { Suspense, lazy } from 'react';
import { Board } from './board2d/Board.js';
import { useUiStore } from '../store/uiStore.js';

// The three.js bundle is large and the board is the default view, so the 3D
// scene is only fetched once someone actually switches to it.
const Scene = lazy(() => import('./space3d/Scene.js').then((m) => ({ default: m.Scene })));

export function ViewSwitch(): React.JSX.Element {
  const view = useUiStore((s) => s.view);

  return (
    <div className="viewswitch" data-testid="view-switch" data-view={view}>
      <div className={`viewlayer ${view === '2d' ? 'on' : ''}`} aria-hidden={view !== '2d'}>
        <Board />
      </div>
      <div className={`viewlayer ${view === '3d' ? 'on' : ''}`} aria-hidden={view !== '3d'}>
        {view === '3d' && (
          <Suspense fallback={<div className="scene-loading">Loading 3D space…</div>}>
            <Scene />
          </Suspense>
        )}
      </div>
    </div>
  );
}
