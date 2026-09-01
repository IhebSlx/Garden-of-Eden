/** SPEC 5.4 zoom controls: + / − / fit, with the live zoom percentage. */
type Props = {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
};

export function ZoomControls({ zoom, onZoomIn, onZoomOut, onFit }: Props): React.JSX.Element {
  return (
    <div className="glass-bar zoomctl flex items-center gap-0.5" data-testid="zoom-controls">
      <button type="button" onClick={onZoomIn} aria-label="Zoom in">
        +
      </button>
      <button type="button" onClick={onZoomOut} aria-label="Zoom out">
        −
      </button>
      <button type="button" onClick={onFit} aria-label="Fit fleet" title="Fit fleet">
        ⛶
      </button>
      <span className="min-w-[34px] px-2 text-center text-[10.5px] text-[#6f7fb4]" data-testid="zoom-pct">
        {Math.round(zoom * 100)}%
      </span>
    </div>
  );
}
