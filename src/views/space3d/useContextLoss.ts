/**
 * WebGL contexts are lost routinely - a laptop switching GPUs, waking from
 * sleep, or the browser reclaiming memory. Without handling it the canvas goes
 * permanently black with no explanation.
 *
 * `preventDefault` on the loss event is what allows the browser to restore the
 * context at all; r3f then rebuilds the scene from the React tree on its own.
 */
import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';

export function useContextLoss(): boolean {
  const gl = useThree((state) => state.gl);
  const [lost, setLost] = useState(false);

  useEffect(() => {
    const canvas = gl.domElement;

    const onLost = (event: Event): void => {
      // Required, or the context is never restored.
      event.preventDefault();
      setLost(true);
    };
    const onRestored = (): void => setLost(false);

    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    };
  }, [gl]);

  return lost;
}
