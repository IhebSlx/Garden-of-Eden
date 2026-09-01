/**
 * @vitest-environment jsdom
 *
 * SPEC 10: "`prefers-reduced-motion` honoured everywhere."
 *
 * The 2D board is handled by CSS, but the 3D scene, the morph and the board's
 * viewport animation all read the query in JavaScript, so the hook has to be
 * correct - including on a platform with no `matchMedia` at all.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePrefersReducedMotion } from '../../src/ui/usePrefersReducedMotion.js';

type Listener = (event: MediaQueryListEvent) => void;

function stubMatchMedia(matches: boolean): { change: (next: boolean) => void } {
  const listeners = new Set<Listener>();
  const media = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media),
  );
  return {
    change: (next: boolean) => {
      media.matches = next;
      for (const listener of listeners) listener({ matches: next } as MediaQueryListEvent);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('usePrefersReducedMotion', () => {
  it('is false when the user has not asked for reduced motion', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  it('is true when the user has', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });

  it('follows the setting changing while the app is open', () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);

    act(() => media.change(true));
    expect(result.current).toBe(true);

    act(() => media.change(false));
    expect(result.current).toBe(false);
  });

  it('stops listening when the component unmounts', () => {
    const media = stubMatchMedia(false);
    const { result, unmount } = renderHook(() => usePrefersReducedMotion());
    unmount();
    // No React warning and no crash: the listener was removed.
    expect(() => media.change(true)).not.toThrow();
    expect(result.current).toBe(false);
  });

  it('falls back to false where matchMedia does not exist', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });
});
