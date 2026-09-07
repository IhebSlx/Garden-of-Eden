/**
 * SPEC §5.8 details toggle in 3D: "satellite constellation with tiny labels".
 *
 * DEVIATION: the constellation is bundled. One satellite per kind — Skills, Tools,
 * Data — orbits the agent carrying its count; clicking a bundle blossoms it into
 * its members and clicking again folds it back. The prototype (and the first
 * version of this file) gave every item its own satellite, which is unreadable the
 * moment an agent carries real content: PPT Buddy alone has 19 data sources, and
 * data sources were not drawn at all.
 *
 * Open/closed state is the same `openSections` the 2D card uses, so expanding
 * Tools on a card and switching to 3D finds Tools already blossomed
 * (SPEC §2.1 one store many renderers, §5.1 state survives the switch).
 *
 * SPEC §5.5: satellites fade out earlier than labels, so distance reads as detail.
 */
import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Vector3 } from 'three';
import type { Group, LineBasicMaterial, MeshBasicMaterial, SpriteMaterial, Texture } from 'three';
import type { Agent, Fleet } from '../../model/schemas.js';
import { dataForAgent } from '../../model/selectors.js';
import { dataDotColor, DATA_TYPE_UNSET_COLOR, SKILL_COLOR, TOOL_TYPE_COLOR } from '../../ui/palette.js';
import { BLOSSOM, EASE_3D, FADE_3D, NODE_SIZE_3D } from '../../ui/constants.js';
import { sectionKey, useUiStore } from '../../store/uiStore.js';
import type { DetailSection } from '../../store/uiStore.js';
import { tinyLabelTexture } from './textures.js';
import type { Point3 } from '../../layout/layout3d.js';

type Props = {
  fleet: Fleet;
  agent: Agent;
  position: Point3;
  cameraRadiusRef: { current: number };
  lit: boolean;
};

export type Member = { label: string; color: string };

type Petal = {
  key: string;
  color: string;
  point: Vector3;
  texture: Texture;
};

type PlacedBundle = {
  section: DetailSection;
  color: string;
  anchor: Vector3;
  petals: Petal[];
};
type Bundle = {
  section: DetailSection;
  label: string;
  members: Member[];
  /** The bundle takes the colour of its commonest member, inventing no new token. */
  color: string;
};

const SECTION_LABEL: Record<DetailSection, string> = {
  skills: 'Skills',
  tools: 'Tools',
  data: 'Data',
};

/** Most frequent colour among the members; ties go to the first seen. */
export function dominantColor(members: Member[], fallback: string): string {
  const tally = new Map<string, number>();
  for (const member of members) tally.set(member.color, (tally.get(member.color) ?? 0) + 1);
  let best = fallback;
  let bestCount = 0;
  for (const [color, count] of tally) {
    if (count > bestCount) {
      best = color;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Members blossom into concentric rings of at most `BLOSSOM.perRing`, so a bundle
 * of 19 stays a readable flower instead of one enormous circle.
 */
export function blossomPoints(count: number): Vector3[] {
  const points: Vector3[] = [];
  for (let index = 0; index < count; index += 1) {
    const ring = Math.floor(index / BLOSSOM.perRing);
    const inRing = index % BLOSSOM.perRing;
    const ringSize = Math.min(BLOSSOM.perRing, count - ring * BLOSSOM.perRing);
    const angle = (inRing / ringSize) * Math.PI * 2 + (ring % 2) * (Math.PI / BLOSSOM.perRing);
    const radius = BLOSSOM.innerRadius + ring * BLOSSOM.ringGap;
    points.push(new Vector3(Math.cos(angle) * radius, -ring * BLOSSOM.ringDrop, Math.sin(angle) * radius));
  }
  return points;
}

function SatellitesComponent({ fleet, agent, position, cameraRadiusRef, lit }: Props): React.JSX.Element | null {
  const group = useRef<Group>(null);
  const opacity = useRef(0);
  const toggleDetailSection = useUiStore((s) => s.toggleDetailSection);

  const bundles = useMemo<Bundle[]>(() => {
    const skills: Member[] = agent.skillIds
      .map((id) => fleet.skills.find((s) => s.id === id))
      .filter((s) => s !== undefined)
      .map((s) => ({ label: s.name, color: SKILL_COLOR }));
    const tools: Member[] = agent.toolIds
      .map((id) => fleet.tools.find((t) => t.id === id))
      .filter((t) => t !== undefined)
      .map((t) => ({ label: t.name, color: TOOL_TYPE_COLOR[t.type] }));
    // Whatever a linked item contains comes with it, so the bundle count matches the
    // card's and neither view understates what the agent actually gets.
    const data: Member[] = dataForAgent(fleet, agent).map((d) => ({
      label: d.name,
      color: dataDotColor(d.type),
    }));

    return (
      [
        { section: 'skills' as const, members: skills, fallback: SKILL_COLOR },
        { section: 'tools' as const, members: tools, fallback: TOOL_TYPE_COLOR.workflow },
        { section: 'data' as const, members: data, fallback: DATA_TYPE_UNSET_COLOR },
      ] satisfies { section: DetailSection; members: Member[]; fallback: string }[]
    )
      .filter((entry) => entry.members.length > 0)
      .map((entry) => ({
        section: entry.section,
        label: `${SECTION_LABEL[entry.section]} ${entry.members.length}`,
        members: entry.members,
        color: dominantColor(entry.members, entry.fallback),
      }));
  }, [agent, fleet]);

  const size = NODE_SIZE_3D[agent.kind];

  const placed = useMemo(
    () =>
      bundles.map((bundle, index) => {
        // Bundles sit below the agent, evenly spaced on a small ring.
        const angle = (index / bundles.length) * Math.PI * 2 + Math.PI / 2;
        const radius = size * 0.9 + BLOSSOM.bundleRadius;
        const anchor = new Vector3(Math.cos(angle) * radius, -(size + BLOSSOM.bundleDrop), Math.sin(angle) * radius);

        return {
          ...bundle,
          anchor,
          texture: tinyLabelTexture(bundle.label, bundle.color),
          tether: new BufferGeometry().setFromPoints([new Vector3(0, -size * 0.7, 0), anchor]),
          petals: blossomPoints(bundle.members.length).map((offset, memberIndex) => {
            const member = bundle.members[memberIndex];
            const point = offset.clone().add(anchor);
            return {
              key: `${bundle.section}-${memberIndex}`,
              color: member?.color ?? bundle.color,
              point,
              texture: tinyLabelTexture(member?.label ?? '', member?.color ?? bundle.color),
            };
          }),
        };
      }),
    [bundles, size],
  );

  // Subscribing per agent keeps this to one store read rather than one per bundle.
  const openFlags = useUiStore((s) =>
    placed.map((bundle) => s.openSections[sectionKey(agent.id, bundle.section)] === true).join(','),
  );
  const isOpen = openFlags.split(',');

  useFrame(() => {
    const node = group.current;
    if (!node) return;

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
      // Petals are driven by their own bundle's bloom factor; leave them alone.
      if (material.userData.petalBase !== undefined) return;
      const base = (material.userData.base as number | undefined) ?? 0.95;
      material.opacity = base * opacity.current;
    });
  });

  if (placed.length === 0) return null;

  return (
    <group ref={group} position={[position.x, position.y, position.z]} visible={false}>
      {placed.map((bundle, index) => (
        <group key={bundle.section}>
          <mesh
            position={[bundle.anchor.x, bundle.anchor.y, bundle.anchor.z]}
            onClick={(event) => {
              if (opacity.current <= 0.5) return;
              // Without this the agent behind the bundle takes the click and refocuses.
              event.stopPropagation();
              toggleDetailSection(agent.id, bundle.section);
            }}
            onPointerOver={(event) => {
              if (opacity.current <= 0.5) return;
              event.stopPropagation();
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
              document.body.style.cursor = '';
            }}
          >
            <icosahedronGeometry args={[BLOSSOM.bundleSize, 0]} />
            <meshBasicMaterial color={bundle.color} transparent opacity={0} userData={{ base: 0.95 }} />
          </mesh>

          <lineSegments geometry={bundle.tether}>
            <lineBasicMaterial color={bundle.color} transparent opacity={0} userData={{ base: 0.35 }} />
          </lineSegments>

          <sprite
            position={[bundle.anchor.x, bundle.anchor.y - BLOSSOM.labelDrop, bundle.anchor.z]}
            scale={[15, 2.35, 1]}
          >
            <spriteMaterial map={bundle.texture} transparent depthWrite={false} opacity={0} userData={{ base: 0.95 }} />
          </sprite>

          <Petals bundle={bundle} open={isOpen[index] === 'true'} fadeRef={opacity} />
        </group>
      ))}
    </group>
  );
}

/**
 * The blossom itself. Kept as its own component so the open/closed easing runs on
 * one group per bundle rather than being recomputed for every petal.
 */
function Petals({
  bundle,
  open,
  fadeRef,
}: {
  bundle: PlacedBundle;
  open: boolean;
  fadeRef: { current: number };
}): React.JSX.Element | null {
  const group = useRef<Group>(null);
  const bloom = useRef(0);
  const fade = fadeRef;

  useFrame(() => {
    const node = group.current;
    if (!node) return;
    bloom.current += ((open ? 1 : 0) - bloom.current) * EASE_3D.detail;
    node.visible = bloom.current > 0.02;
    // Petals grow out of the bundle rather than appearing beside it.
    node.scale.setScalar(bloom.current);
    node.traverse((child) => {
      const material = (child as { material?: MeshBasicMaterial | LineBasicMaterial | SpriteMaterial })
        .material;
      if (!material || !('opacity' in material)) return;
      const base = (material.userData.petalBase as number | undefined) ?? 0.95;
      material.opacity = base * bloom.current * fade.current;
    });
  });

  if (bundle.petals.length === 0) return null;

  return (
    // Scaling the group scales positions too, so it must be centred on the bundle.
    <group ref={group} position={[bundle.anchor.x, bundle.anchor.y, bundle.anchor.z]} visible={false}>
      {bundle.petals.map((petal) => {
        const local = petal.point.clone().sub(bundle.anchor);
        return (
          <group key={petal.key}>
            <mesh position={[local.x, local.y, local.z]}>
              <sphereGeometry args={[BLOSSOM.petalSize, 10, 10]} />
              <meshBasicMaterial color={petal.color} transparent opacity={0} userData={{ petalBase: 0.95 }} />
            </mesh>
            <lineSegments geometry={new BufferGeometry().setFromPoints([new Vector3(0, 0, 0), local])}>
              <lineBasicMaterial color={petal.color} transparent opacity={0} userData={{ petalBase: 0.3 }} />
            </lineSegments>
            <sprite position={[local.x, local.y - 2.2, local.z]} scale={[13, 2.05, 1]}>
              <spriteMaterial
                map={petal.texture}
                transparent
                depthWrite={false}
                opacity={0}
                userData={{ petalBase: 0.95 }}
              />
            </sprite>
          </group>
        );
      })}
    </group>
  );
}


export const Satellites = memo(SatellitesComponent);
