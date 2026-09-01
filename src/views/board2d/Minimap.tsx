/**
 * SPEC 5.4 minimap: dots by kind, a live viewport rectangle, click or drag to jump.
 * Geometry copied from the prototype's `buildMinimap` / `updateMMView` / `mmJump`.
 */
import { useCallback, useRef } from 'react';
import { useReactFlow, useViewport } from '@xyflow/react';
import type { BoardModel } from './boardModel.js';
import { MINIMAP } from '../../ui/constants.js';
import { KIND_COLOR } from '../../ui/palette.js';
import { visibleBoardRect } from '../../layout/viewport.js';

type Props = {
  model: BoardModel;
  screen: { width: number; height: number };
};

export function Minimap({ model, screen }: Props): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const { setViewport } = useReactFlow();
  const viewport = useViewport();

  const scale = Math.min(
    (MINIMAP.innerWidth - MINIMAP.inset) / Math.max(1, model.layout.width),
    (MINIMAP.innerHeight - MINIMAP.inset) / Math.max(1, model.layout.height),
  );
  const offsetX = (MINIMAP.innerWidth - model.layout.width * scale) / 2;
  const offsetY = (MINIMAP.innerHeight - model.layout.height * scale) / 2;

  const rect = visibleBoardRect(viewport, screen);

  const jump = useCallback(
    (event: React.PointerEvent) => {
      const bounds = box.current?.getBoundingClientRect();
      if (!bounds) return;
      const boardX = (event.clientX - bounds.left - offsetX) / scale;
      const boardY = (event.clientY - bounds.top - offsetY) / scale;
      void setViewport({
        zoom: viewport.zoom,
        x: screen.width / 2 - boardX * viewport.zoom,
        y: screen.height / 2 - boardY * viewport.zoom,
      });
    },
    [offsetX, offsetY, scale, screen.height, screen.width, setViewport, viewport.zoom],
  );

  return (
    <div
      ref={box}
      className="minimap"
      data-testid="minimap"
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        jump(event);
      }}
      onPointerMove={(event) => {
        if (dragging.current) jump(event);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      {model.instanceList.map((instance) => {
        const point = model.layout.positions.get(instance.key);
        const agent = model.fleet?.agents.find((a) => a.id === instance.agentId);
        if (!point || !agent) return null;
        const size = instance.depth === 0 ? 7 : instance.depth === 1 ? 5 : 3.5;
        const color = KIND_COLOR[agent.kind];
        return (
          <div
            key={instance.key}
            className="mmdot"
            style={{
              width: size,
              height: size,
              left: offsetX + point.x * scale,
              top: offsetY + point.y * scale,
              background: color,
              boxShadow: `0 0 4px ${color}`,
            }}
          />
        );
      })}
      <div
        className="mmview"
        style={{
          left: offsetX + rect.x * scale,
          top: offsetY + rect.y * scale,
          width: rect.width * scale,
          height: rect.height * scale,
        }}
      />
    </div>
  );
}
