/**
 * One rendered copy of an agent in 3D (SPEC 2.3).
 *
 * SPEC 6 quality bar: a real lit sphere (never a full-emissive sticker), a soft
 * additive halo, and its label in a glass pill. SPEC 5.6: Planned renders as a
 * wireframe blueprint, In progress pulses, Live is solid.
 */
import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh, Sprite, MeshStandardMaterial } from 'three';
import { AdditiveBlending, Color } from 'three';
import type { Agent } from '../../model/schemas.js';
import { KIND_COLOR_HEX, SHARED_COLOR } from '../../ui/palette.js';
import {
  EASE_3D,
  FADE_3D,
  GHOST_OPACITY,
  HOVER_SCALE_3D,
  LABEL_SCALE_3D,
  NODE_SIZE_3D,
  PLANNED_OPACITY_3D,
  SELECTED_SCALE_3D,
} from '../../ui/constants.js';
import { glowTexture, labelTexture, ringTexture } from './textures.js';
import type { Point3 } from '../../layout/layout3d.js';

export type AgentSphereProps = {
  agent: Agent;
  instanceKey: string;
  depth: number;
  position: Point3;
  sharedCount: number;
  lit: boolean;
  selected: boolean;
  /** Live camera distance ref, for the SPEC 5.5 label fade. */
  cameraRadiusRef: { current: number };
  /** Random phase so In-progress halos do not pulse in lockstep. */
  phase: number;
  onActivate: (agentId: string) => void;
  reducedMotion: boolean;
};

function AgentSphereComponent({
  agent,
  depth,
  position,
  sharedCount,
  lit,
  selected,
  cameraRadiusRef,
  phase,
  onActivate,
  reducedMotion,
}: AgentSphereProps): React.JSX.Element {
  const size = NODE_SIZE_3D[agent.kind];
  const colorHex = KIND_COLOR_HEX[agent.kind];

  const mesh = useRef<Mesh>(null);
  const glow = useRef<Sprite>(null);
  const ring = useRef<Sprite>(null);
  const label = useRef<Sprite>(null);
  const hovered = useRef(false);
  const fade = useRef(1);
  const scale = useRef(1);

  const glowMap = useMemo(() => glowTexture(colorHex), [colorHex]);
  const ringMap = useMemo(() => ringTexture(), []);

  const subLine = useMemo(() => {
    const base = sharedCount > 1 ? `shared ×${sharedCount}` : kindLabel(agent.kind);
    return agent.status === 'live' ? base : `${base} · ${statusWord(agent.status)}`;
  }, [agent.kind, agent.status, sharedCount]);

  const labelMap = useMemo(
    () => labelTexture(agent.name, subLine, sharedCount > 1 ? SHARED_COLOR : '#8fa3d8'),
    [agent.name, sharedCount, subLine],
  );

  const baseColor = useMemo(() => new Color(colorHex).multiplyScalar(0.5), [colorHex]);
  const labelScale = LABEL_SCALE_3D[agent.kind];

  useFrame((_state, _delta) => {
    const node = mesh.current;
    if (!node) return;

    // SPEC 5.2: ghost to 5%, never hide.
    const target = lit ? 1 : GHOST_OPACITY;
    fade.current += (target - fade.current) * EASE_3D.fade;

    const statusDim = agent.status === 'planned' ? PLANNED_OPACITY_3D : 1;
    const pulse =
      agent.status === 'building' && !reducedMotion
        ? 0.78 + 0.22 * Math.sin(performance.now() * 0.003 + phase)
        : 1;

    const material = node.material as MeshStandardMaterial;
    material.opacity = fade.current * statusDim;
    node.visible = fade.current > 0.02;

    if (glow.current) {
      (glow.current.material).opacity = 0.7 * fade.current * statusDim * pulse;
    }

    if (label.current) {
      // SPEC 5.5: sub-agent labels fade out beyond a camera-distance threshold.
      const distanceFade =
        depth >= 2
          ? Math.min(1, Math.max(0, (FADE_3D.labelStart - cameraRadiusRef.current) / FADE_3D.labelRange))
          : 1;
      (label.current.material).opacity = fade.current * distanceFade;
    }

    const scaleTarget = hovered.current ? HOVER_SCALE_3D : selected ? SELECTED_SCALE_3D : 1;
    scale.current += (scaleTarget - scale.current) * EASE_3D.scale;
    const current = node.scale.x;
    node.scale.setScalar(current + (scale.current - current) * EASE_3D.meshScale);

    if (ring.current) {
      const on = selected && fade.current > 0.5;
      const material2 = ring.current.material;
      material2.opacity += ((on ? 0.85 : 0) - material2.opacity) * EASE_3D.ring;
      // SPEC 6: the selection ring pulses.
      const pulseScale = reducedMotion ? 3 : 3 + Math.sin(performance.now() * 0.004) * 0.14;
      ring.current.scale.setScalar(size * pulseScale);
    }
  });

  return (
    <mesh
      ref={mesh}
      position={[position.x, position.y, position.z]}
      onClick={(event) => {
        // Ghosted copies are not clickable (prototype filters hits by fade).
        if (fade.current <= 0.5) return;
        event.stopPropagation();
        onActivate(agent.id);
      }}
      onPointerOver={(event) => {
        if (fade.current <= 0.5) return;
        event.stopPropagation();
        hovered.current = true;
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        hovered.current = false;
        document.body.style.cursor = '';
      }}
    >
      <sphereGeometry args={[size, 32, 32]} />
      <meshStandardMaterial
        color={baseColor}
        emissive={colorHex}
        emissiveIntensity={0.7}
        roughness={0.35}
        metalness={0.15}
        transparent
        /* SPEC 5.6: Planned is a blueprint wireframe. */
        wireframe={agent.status === 'planned'}
      />

      <sprite ref={glow} scale={[size * 6, size * 6, 1]}>
        <spriteMaterial
          map={glowMap}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          opacity={0.7}
        />
      </sprite>

      <sprite ref={ring} scale={[size * 3, size * 3, 1]}>
        <spriteMaterial
          map={ringMap}
          color={colorHex}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          opacity={0}
        />
      </sprite>

      <sprite
        ref={label}
        position={[0, size + 9.5 * labelScale, 0]}
        scale={[30 * labelScale, 8.8 * labelScale, 1]}
      >
        <spriteMaterial map={labelMap} transparent depthWrite={false} />
      </sprite>
    </mesh>
  );
}

function kindLabel(kind: Agent['kind']): string {
  return kind === 'orchestrator' ? 'Orchestrator' : kind === 'department' ? 'Department' : 'Sub-agent';
}

function statusWord(status: Agent['status']): string {
  return status === 'building' ? 'in progress' : 'planned';
}

export const AgentSphere = memo(AgentSphereComponent);
