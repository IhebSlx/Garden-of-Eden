/**
 * Is WebGL actually usable here?
 *
 * Asked BEFORE mounting the R3F canvas. When a context cannot be created, three.js
 * throws from inside canvas creation, which surfaces as an unhandled promise
 * rejection: React's error boundary never sees it and the Suspense fallback never
 * resolves, so the view sat on "Loading 3D space…" for ever with no explanation.
 *
 * This happens on real machines, not just exotic ones - hardware acceleration
 * turned off in the browser, a remote desktop session, a GPU driver that has just
 * crashed, or a locked-down corporate image.
 *
 * Distinct from `useContextLoss`, which handles a context that existed and went
 * away. This is a context that could never be made in the first place.
 */
export type WebglStatus = 'ok' | 'unavailable';

export function detectWebgl(): WebglStatus {
  // A server render has no canvas at all; treat that as unavailable rather than throwing.
  if (typeof document === 'undefined') return 'unavailable';

  try {
    const canvas = document.createElement('canvas');
    const context =
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl');

    if (context === null) return 'unavailable';

    // Free the probe context immediately: browsers cap how many may exist at once,
    // and holding this one could deny the real scene the context it needs.
    const lose = (context as WebGLRenderingContext).getExtension('WEBGL_lose_context') as {
      loseContext?: () => void;
    } | null;
    lose?.loseContext?.();

    return 'ok';
  } catch {
    // Some builds throw rather than returning null.
    return 'unavailable';
  }
}
