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
};

function Wire3dComponent({ wire, from, to, lit, focused }: Props): React.JSX.Element {
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
    material.opacity = baseOpacity * EDGE_STATUS_MULTIPLIER[wire.status] * fade.current * boost.current;
    node.visible = fade.current > 0.02;
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
