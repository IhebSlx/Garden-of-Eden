/**
 * SPEC 8.9 - bloom + depth of field.
 *
 * Tuned against the SPEC 6 quality bar: "soft additive halos, not blown-out glow".
 * The bloom threshold sits above the lit sphere bodies so only the emissive cores
 * and halos bloom, and the DoF aperture is small enough to read as depth rather
 * than as blur.
 *
 * Skipped entirely under `prefers-reduced-motion` (SPEC 10) and when the device
 * reports few cores, since post-processing is the first thing to cost frames.
 */
import { useMemo } from 'react';
import { Bloom, DepthOfField, EffectComposer } from '@react-three/postprocessing';
import { useThree } from '@react-three/fiber';

type Props = {
  enabled: boolean;
};

export function PostEffects({ enabled }: Props): React.JSX.Element | null {
  const camera = useThree((state) => state.camera);

  // Keep the focus plane at the fleet, so the near and far edges soften.
  const focusDistance = useMemo(() => Math.max(0.01, camera.position.length() / 1000), [camera]);

  if (!enabled) return null;

  return (
    <EffectComposer enableNormalPass={false}>
      <Bloom
        // Only the emissive cores and halos cross this threshold.
        luminanceThreshold={0.62}
        luminanceSmoothing={0.32}
        intensity={0.55}
        mipmapBlur
        radius={0.65}
      />
      <DepthOfField focusDistance={focusDistance} focalLength={0.24} bokehScale={2.1} />
    </EffectComposer>
  );
}

/** Post-processing is worth it only on a machine that can spare the frames. */
export function shouldUsePostEffects(reducedMotion: boolean): boolean {
  if (reducedMotion) return false;
  const cores = typeof navigator === 'undefined' ? 8 : (navigator.hardwareConcurrency ?? 8);
  return cores >= 4;
}
