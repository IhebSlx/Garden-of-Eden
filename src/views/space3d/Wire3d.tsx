/**
 * 3D wires: additive tubes along a quadratic bezier, exactly as the prototype
 * built them. Peer links arc much higher and stay thin so they never read as
 * hierarchy (SPEC 5.2 / 6).
 */
import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, QuadraticBezierCurve3, Vector3 } from 'three';
import type { Mesh, MeshBasicMaterial } from 'three';
import { KIND_COLOR_HEX } from '../../ui/palette.js';
import { EASE_3D, EDGE_STATUS_MULTIPLIER, FOCUSED_WIRE_BRIGHTNESS, GHOST_OPACITY } from '../../ui/constants.js';
import type { Point3 } from '../../layout/layout3d.js';
import type { Wire } from '../../model/wires.js';

const PEER_COLOR = 0x9bb8ff;

type Props = {
  wire: Wire;
  from: Point3;
  to: Point3;
  lit: boolean;
  /** Inside the focused branch: brighten by SPEC 6's ×1.7. */
  focused: boolean;
  /** Wires fade out while the fleet morphs, then redraw at the destination. */
  morphRef: { current: number };
};

function Wire3dComponent({ wire, from, to, lit, focused, morphRef }: Props): React.JSX.Element {
  const isPeer = wire.kind === 'peer';
  const mesh = useRef<Mesh>(null);
  const fade = useRef(1);
  const boost = useRef(1);

  const geometryArgs = useMemo(() => {
    const a = new Vector3(from.x, from.y, from.z);
    const b = new Vector3(to.x, to.y, to.z);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    // Peer links bow well above the fleet; hierarchy links bow gently outwards.
    const control = isPeer
      ? new Vector3(mid.x * 1.45, mid.y + 20, mid.z * 1.45)
      : new Vector3(mid.x * 1.18, mid.y + 5, mid.z * 1.18);
    return new QuadraticBezierCurve3(a, control, b);
  }, [from.x, from.y, from.z, isPeer, to.x, to.y, to.z]);

  const baseOpacity = isPeer ? 0.2 : 0.28;
  const color = isPeer ? PEER_COLOR : KIND_COLOR_HEX[wire.toKind];

  useFrame(() => {
    const node = mesh.current;
    if (!node) return;

    fade.current += ((lit ? 1 : GHOST_OPACITY) - fade.current) * EASE_3D.fade;
    boost.current += ((focused && lit ? FOCUSED_WIRE_BRIGHTNESS : 1) - boost.current) * EASE_3D.fade;

    const material = node.material as MeshBasicMaterial;
    // SPEC 8.2: the tubes are built from fixed endpoints, so rather than rebuilding
    // geometry every frame they fade out for the flight and redraw on arrival.
    const morphFade = 1 - morphRef.current;
    material.opacity =
      baseOpacity * EDGE_STATUS_MULTIPLIER[wire.status] * fade.current * boost.current * morphFade;
    node.visible = fade.current > 0.02 && morphFade > 0.02;
  });

  return (
    <mesh ref={mesh}>
      <tubeGeometry args={[geometryArgs, 24, isPeer ? 0.3 : 0.45, 8, false]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={baseOpacity}
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

export const Wire3d = memo(Wire3dComponent);
