/** The prototype's bottom hint line - what the current view responds to. */
import { useUiStore } from '../../store/uiStore.js';

const HINT_2D =
  'drag empty space = pan · scroll / pinch = zoom · drag card = move it · click card = focus branch · double-click empty space = fit fleet · Ctrl+Z = undo';
const HINT_3D =
  'drag = orbit · right-drag or Shift+drag = pan (two fingers on touch) · scroll / pinch = zoom · click agent = focus branch · Esc or double-click = full fleet';

export function Hint(): React.JSX.Element {
  const view = useUiStore((s) => s.view);
  return (
    <div className="hintstack">
      <div className="tagline">shared agents repeat under each parent · ×N badge = same agent</div>
      <div className="hintline-bottom">{view === '2d' ? HINT_2D : HINT_3D}</div>
    </div>
  );
}
