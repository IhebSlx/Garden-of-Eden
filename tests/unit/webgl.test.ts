/**
 * @vitest-environment jsdom
 *
 * WebGL availability, asked before the 3D canvas is mounted.
 *
 * When a context cannot be created three.js throws asynchronously, which React's
 * error boundary never sees and the Suspense fallback never resolves — the view sat
 * on "Loading 3D space…" for ever with no explanation. These pin the detection that
 * avoids it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectWebgl } from '../../src/views/space3d/webgl.js';

type GetContext = typeof HTMLCanvasElement.prototype.getContext;
const original: GetContext = HTMLCanvasElement.prototype.getContext.bind(HTMLCanvasElement.prototype);

/**
 * Install a stand-in for `getContext`. The cast lives here, once: a test double
 * cannot satisfy the real method's dozen overloads, and spreading the assertion
 * across every test would only repeat the same noise.
 */
function stubContext(fake: (type: string) => unknown): void {
  HTMLCanvasElement.prototype.getContext = fake as unknown as GetContext;
}

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = original;
});

describe('detectWebgl', () => {
  it('reports ok when a context comes back', () => {
    const loseContext = vi.fn();
    stubContext(() => ({ getExtension: () => ({ loseContext }) }));

    expect(detectWebgl()).toBe('ok');
    // The probe context is released, so it cannot deny the real scene a context.
    expect(loseContext).toHaveBeenCalled();
  });

  it('reports unavailable when every context request returns null', () => {
    stubContext(() => null);
    expect(detectWebgl()).toBe('unavailable');
  });

  it('reports unavailable when getContext throws instead of returning null', () => {
    stubContext(() => {
      throw new Error('GPU process is gone');
    });
    expect(detectWebgl()).toBe('unavailable');
  });

  it('falls back through webgl2, webgl and experimental-webgl', () => {
    const asked: string[] = [];
    stubContext((type) => {
      asked.push(type);
      return type === 'experimental-webgl' ? { getExtension: () => null } : null;
    });

    expect(detectWebgl()).toBe('ok');
    expect(asked).toEqual(['webgl2', 'webgl', 'experimental-webgl']);
  });

  it('survives a context with no WEBGL_lose_context extension', () => {
    stubContext(() => ({ getExtension: () => null }));
    expect(detectWebgl()).toBe('ok');
  });
});
