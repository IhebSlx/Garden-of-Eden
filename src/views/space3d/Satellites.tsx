/**
 * SPEC 5.8 details toggle in 3D: "satellite constellation with tiny labels".
 * Skills are octahedra, tools spheres in their type colour, each tethered to the
 * agent by a thin line. SPEC 5.5: they fade out earlier than labels do.
 */
import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Vector3 } from 'three';
import type { Group, LineBasicMaterial, MeshBasicMaterial, SpriteMaterial } from 'three';
import type { Agent, Fleet } from '../../model/schemas.js';
import { SKILL_COLOR, TOOL_TYPE_COLOR } from '../../ui/palette.js';
import { EASE_3D, FADE_3D, NODE_SIZE_3D } from '../../ui/constants.js';
import { tinyLabelTexture } from './textures.js';
import type { Point3 } from '../../layout/layout3d.js';

type Props = {
  fleet: Fleet;
  agent: Agent;
  position: Point3;
  cameraRadiusRef: { current: number };
  lit: boolean;
};

function SatellitesComponent({ fleet, agent, position, cameraRadiusRef, lit }: Props): React.JSX.Element | null {
  const group = useRef<Group>(null);
  const opacity = useRef(0);

  const items = useMemo(() => {
    const skills = agent.skillIds
      .map((id) => fleet.skills.find((s) => s.id === id))
      .filter((s) => s !== undefined)
      .map((s) => ({ label: s.name, color: SKILL_COLOR, isSkill: true }));
    const tools = agent.toolIds
      .map((id) => fleet.tools.find((t) => t.id === id))
      .filter((t) => t !== undefined)
      .map((t) => ({ label: t.name, color: TOOL_TYPE_COLOR[t.type], isSkill: false }));
    return [...skills, ...tools];
  }, [agent.skillIds, agent.toolIds, fleet.skills, fleet.tools]);

  const size = NODE_SIZE_3D[agent.kind];

  const placed = useMemo(
    () =>
      items.map((item, index) => {
        const angle = (index / items.length) * Math.PI * 2 + Math.PI / 2;
        const radius = size * 0.9 + 5.5;
        return {
          ...item,
          point: new Vector3(Math.cos(angle) * radius, -(size + 5.5), Math.sin(angle) * radius),
          texture: tinyLabelTexture(item.label, item.color),
          tether: new BufferGeometry().setFromPoints([
            new Vector3(0, -size * 0.7, 0),
            new Vector3(Math.cos(angle) * radius, -(size + 5.5), Math.sin(angle) * radius),
          ]),
        };
      }),
    [items, size],
  );

  useFrame(() => {
    const node = group.current;
    if (!node) return;

    // SPEC 5.5: satellites fade earlier than labels, so distance reads as detail.
    const distanceFade = Math.min(
      1,
      Math.max(0, (FADE_3D.satelliteStart - cameraRadiusRef.current) / FADE_3D.satelliteRange),
    );
    const target = lit ? distanceFade : 0;
    opacity.current += (target - opacity.current) * EASE_3D.detail;
    node.visible = opacity.current > 0.02;

    node.traverse((child) => {
      const material = (child as { material?: MeshBasicMaterial | LineBasicMaterial | SpriteMaterial })
        .material;
      if (!material || !('opacity' in material)) return;
      const base = (material.userData.base as number | undefined) ?? 0.95;
      material.opacity = base * opacity.current;
    });
  });

  if (placed.length === 0) return null;

  return (
    <group ref={group} position={[position.x, position.y, position.z]} visible={false}>
      {placed.map((item) => (
        <group key={item.label}>
          <mesh position={[item.point.x, item.point.y, item.point.z]}>
            {item.isSkill ? (
              <octahedronGeometry args={[1.5, 0]} />
            ) : (
              <sphereGeometry args={[1.35, 10, 10]} />
            )}
            <meshBasicMaterial color={item.color} transparent opacity={0} userData={{ base: 0.95 }} />
          </mesh>

          <lineSegments geometry={item.tether}>
            <lineBasicMaterial color={item.color} transparent opacity={0} userData={{ base: 0.35 }} />
          </lineSegments>

          <sprite
            position={[item.point.x, item.point.y - 2.6, item.point.z]}
            scale={[15, 2.35, 1]}
          >
            <spriteMaterial
              map={item.texture}
              transparent
              depthWrite={false}
              opacity={0}
              userData={{ base: 0.95 }}
            />
          </sprite>
        </group>
      ))}
    </group>
  );
}

export const Satellites = memo(SatellitesComponent);
