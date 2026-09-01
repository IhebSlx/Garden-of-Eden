/**
 * SPEC 6 grounded scene: "light disc + faint grid directly beneath the fleet,
 * radial background depth". The starfield gives the depth cue the prototype had.
 *
 * These are scene grounding, not ambient decoration (SPEC 2.5) - nothing here
 * moves on its own.
 */
import { useMemo } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';
import { floorTexture } from './textures.js';

const STAR_COUNT = 900;

export function Ground(): React.JSX.Element {
  const map = useMemo(() => floorTexture(), []);

  const stars = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3);
    // Deterministic scatter: a fixed hash beats Math.random so the sky is stable
    // across reloads and screenshot comparisons.
    for (let i = 0; i < STAR_COUNT; i += 1) {
      const radius = 430 + fract(i * 0.618033988749895) * 620;
      const theta = fract(i * 0.7548776662466927) * Math.PI * 2;
      const phi = Math.acos(2 * fract(i * 0.9146149069229104) - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    return geometry;
  }, []);

  return (
    <>
      <points geometry={stars}>
        <pointsMaterial color={0x9db4ff} size={1.4} transparent opacity={0.5} />
      </points>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -150, 0]}>
        <circleGeometry args={[240, 64]} />
        <meshBasicMaterial map={map} transparent depthWrite={false} />
      </mesh>

      {/*
        GridHelper owns a LineBasicMaterial, so the faintness has to be set on that
        material - a nested <meshBasicMaterial> replaces it and renders at full
        strength, which drowns the scene.
      */}
      <gridHelper
        args={[800, 44, 0x4c5aa8, 0x27305e]}
        position={[0, -149, 0]}
        material-transparent
        material-opacity={0.09}
        material-depthWrite={false}
      />
    </>
  );
}

function fract(value: number): number {
  return value - Math.floor(value);
}
