/**
 * Viewport maths, lifted from `fit2d`, `frame2d` and `zoom2dAt` in the prototype.
 *
 * Pure functions on {x, y, zoom} - the same shape React Flow uses for its
 * transform - so focus framing and zoom-to-cursor are unit-testable without a DOM.
 */
import { FIT_PADDING, FRAME_PADDING, ZOOM } from '../ui/constants.js';

export type Viewport = { x: number; y: number; zoom: number };
export type Size = { width: number; height: number };
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

const clampZoom = (zoom: number): number => Math.min(ZOOM.max, Math.max(ZOOM.min, zoom));

/** `fit2d` - the whole board, centred, never zoomed past 110%. */
export function fitViewport(board: Size, screen: Size): Viewport {
  const zoom = Math.min(
    (screen.width - FIT_PADDING.x) / board.width,
    (screen.height - FIT_PADDING.y) / board.height,
    ZOOM.fitMax,
  );
  const safeZoom = clampZoom(zoom);
  return {
    zoom: safeZoom,
    x: (screen.width - board.width * safeZoom) / 2,
    y: (screen.height - board.height * safeZoom) / 2 + FIT_PADDING.offsetY,
  };
}

/**
 * `frame2d` - SPEC 5.2 requires real zoom-to-fit of the focused subtree's bbox,
 * not a pan that merely centres it.
 */
export function frameViewport(bounds: Bounds, screen: Size): Viewport {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const zoom = clampZoom(
    Math.min(
      (screen.width - FRAME_PADDING.x) / width,
      (screen.height - FRAME_PADDING.y) / height,
      ZOOM.frameMax,
    ),
  );
  return {
    zoom,
    x: (screen.width - (bounds.minX + bounds.maxX) * zoom) / 2,
    y: (screen.height - (bounds.minY + bounds.maxY) * zoom) / 2 + FRAME_PADDING.offsetY,
  };
}

/** `zoom2dAt` - zoom by `factor` while keeping the point under the cursor fixed. */
export function zoomAt(viewport: Viewport, clientX: number, clientY: number, factor: number): Viewport {
  const zoom = clampZoom(viewport.zoom * factor);
  const applied = zoom / viewport.zoom;
  return {
    zoom,
    x: clientX - (clientX - viewport.x) * applied,
    y: clientY - (clientY - viewport.y) * applied,
  };
}

/** Board coordinate under a screen point - used by the minimap and by hit tests. */
export function screenToBoard(viewport: Viewport, clientX: number, clientY: number): { x: number; y: number } {
  return { x: (clientX - viewport.x) / viewport.zoom, y: (clientY - viewport.y) / viewport.zoom };
}

/** Centre the viewport on a board coordinate, keeping the zoom. */
export function centerOn(viewport: Viewport, board: { x: number; y: number }, screen: Size): Viewport {
  return {
    zoom: viewport.zoom,
    x: screen.width / 2 - board.x * viewport.zoom,
    y: screen.height / 2 - board.y * viewport.zoom,
  };
}

/** The board rectangle currently on screen (the minimap's viewport box). */
export function visibleBoardRect(viewport: Viewport, screen: Size): { x: number; y: number; width: number; height: number } {
  return {
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
    width: screen.width / viewport.zoom,
    height: screen.height / viewport.zoom,
  };
}
