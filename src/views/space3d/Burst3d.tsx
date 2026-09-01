/**
 * SPEC 5.9: the click burst - an expanding ring in the agent's kind colour,
 * fired by a click or a search pick. Suppressed under reduced motion.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending } from 'three';
import type { Sprite } from 'three';
import type { AgentKind } from '../../model/schemas.js';
import { KIND_COLOR_HEX } from '../../ui/palette.js';
import { BURST_MS, BURST_SCALE, NODE_SIZE_3D } from '../../ui/constants.js';
import { ringTexture } from './textures.js';
import { useUiStore } from '../../store/uiStore.js';
import type { Point3 } from '../../layout/layout3d.js';

type Props = {
  position: Point3;
  kind: AgentKind;
  reducedMotion: boolean;
};

export function Burst3d({ position, kind, reducedMotion }: Props): React.JSX.Element | null {
  const startedAt = useUiStore((s) => s.burst?.at ?? null);
  const sprite = useRef<Sprite>(null);
  const map = useMemo(() => ringTexture(), []);
  const base = NODE_SIZE_3D[kind];

  useFrame(() => {
    const node = sprite.current;
    if (!node || startedAt === null) return;

    const progress = (performance.now() - startedAt) / BURST_MS;
    const material = node.material;
    if (progress >= 1 || progress < 0) {
      material.opacity = 0;
      node.visible = false;
      return;
    }
    node.visible = true;
    node.scale.setScalar(base * (BURST_SCALE.from + BURST_SCALE.growth * progress));
    material.opacity = 0.9 * (1 - progress);
  });

  if (reducedMotion || startedAt === null) return null;

  return (
    <sprite ref={sprite} position={[position.x, position.y, position.z]} visible={false}>
      <spriteMaterial
        map={map}
        color={KIND_COLOR_HEX[kind]}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        opacity={0}
      />
    </sprite>
  );
}
