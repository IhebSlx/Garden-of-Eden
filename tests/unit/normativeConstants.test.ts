/**
 * SPEC §6's normative constants, pinned in both places that hold them.
 *
 * `CLAUDE.md` says these are "defined once in `src/ui/tokens.css`", and for CSS
 * that is true — but TypeScript cannot read a custom property without a live
 * document, so 2D layout, the 3D camera and the palette carry their own copies in
 * `constants.ts` and `palette.ts`. Seventeen values therefore exist twice.
 *
 * Nothing enforced that they agreed. Change a token, miss the constant, and the
 * board and the space drift apart by an amount too small to notice and too
 * specific to guess at later.
 *
 * So this asserts both copies against the SPEC value rather than against each
 * other: agreeing on the wrong number would otherwise pass. Changing a number
 * here is exactly the `DEVIATION:` the working rules ask to be surfaced.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  AUTO_ROTATE_IDLE_MS,
  EDGE_STATUS_MULTIPLIER,
  FOCUS_CASCADE_STAGGER_MS,
  FOCUSED_WIRE_BRIGHTNESS,
  GHOST_OPACITY,
  ORBIT_INERTIA_DECAY,
  ZOOM_COLLAPSE_TO_DOTS,
  ZOOM_HIDE_ROLES,
} from '../../src/ui/constants.js';
import {
  DATA_TYPE_COLOR,
  KIND_COLOR,
  SHARED_COLOR,
  STATUS_COLOR,
  TOOL_TYPE_COLOR,
} from '../../src/ui/palette.js';

const TOKENS = fileURLToPath(new URL('../../src/ui/tokens.css', import.meta.url));

/** `--name: value;` pairs from the stylesheet, as written. */
function tokens(): Map<string, string> {
  const found = new Map<string, string>();
  for (const m of readFileSync(TOKENS, 'utf8').matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) {
    found.set(m[1] ?? '', (m[2] ?? '').trim());
  }
  return found;
}

/** `110ms` / `2.4s` / `0.05` -> a number in the unit the spec states. */
function asNumber(raw: string): number {
  if (raw.endsWith('ms')) return Number(raw.slice(0, -2));
  if (raw.endsWith('s')) return Number(raw.slice(0, -1)) * 1000;
  return Number(raw);
}

const css = tokens();

describe('SPEC §6 numbers, in both homes', () => {
  const cases: { spec: number; token: string; ts: number | null; what: string }[] = [
    { what: 'ghost opacity', spec: 0.05, token: '--ghost-opacity', ts: GHOST_OPACITY },
    { what: 'focus cascade stagger (ms)', spec: 110, token: '--focus-cascade-stagger', ts: FOCUS_CASCADE_STAGGER_MS },
    { what: 'focused-wire brightness', spec: 1.7, token: '--focused-wire-brightness', ts: FOCUSED_WIRE_BRIGHTNESS },
    { what: 'planned-edge opacity', spec: 0.35, token: '--edge-opacity-planned', ts: EDGE_STATUS_MULTIPLIER.planned },
    { what: 'building-edge opacity', spec: 0.7, token: '--edge-opacity-building', ts: EDGE_STATUS_MULTIPLIER.building },
    { what: '2D zoom: hide roles', spec: 0.55, token: '--zoom-hide-roles', ts: ZOOM_HIDE_ROLES },
    { what: '2D zoom: collapse to dots', spec: 0.36, token: '--zoom-collapse-to-dots', ts: ZOOM_COLLAPSE_TO_DOTS },
    { what: '3D auto-rotate idle (ms)', spec: 6000, token: '--auto-rotate-idle-delay', ts: AUTO_ROTATE_IDLE_MS },
    { what: 'orbit inertia decay', spec: 0.92, token: '--orbit-inertia-decay', ts: ORBIT_INERTIA_DECAY },
    // No TypeScript copy: the pulse is a CSS animation and nothing else reads it.
    { what: 'selection-ring pulse (ms)', spec: 2400, token: '--selection-pulse-duration', ts: null },
  ];

  for (const { what, spec, token, ts } of cases) {
    it(`${what} is ${spec} in tokens.css${ts === null ? '' : ' and in constants.ts'}`, () => {
      const raw = css.get(token);
      expect(raw, `${token} is missing from tokens.css`).toBeDefined();
      expect(asNumber(raw ?? ''), token).toBe(spec);
      if (ts !== null) expect(ts, `${what} in constants.ts`).toBe(spec);
    });
  }
});

describe('SPEC §6 colours, in both homes', () => {
  const cases: { spec: string; token: string; ts: string; what: string }[] = [
    { what: 'orchestrator', spec: '#8b5cf6', token: '--color-orchestrator', ts: KIND_COLOR.orchestrator },
    { what: 'department', spec: '#38e1ff', token: '--color-department', ts: KIND_COLOR.department },
    { what: 'worker', spec: '#3ce8b0', token: '--color-worker', ts: KIND_COLOR.worker },
    { what: 'shared accent', spec: '#f6b954', token: '--color-shared', ts: SHARED_COLOR },
    { what: 'live', spec: '#4ade80', token: '--color-status-live', ts: STATUS_COLOR.live },
    { what: 'building', spec: '#fbbf24', token: '--color-status-building', ts: STATUS_COLOR.building },
    { what: 'planned', spec: '#6b7a9e', token: '--color-status-planned', ts: STATUS_COLOR.planned },
    { what: 'tool: workflow', spec: '#f6b954', token: '--color-tool-workflow', ts: TOOL_TYPE_COLOR.workflow },
    { what: 'tool: python', spec: '#38e1ff', token: '--color-tool-python', ts: TOOL_TYPE_COLOR.python },
    { what: 'tool: microsoft', spec: '#818cf8', token: '--color-tool-microsoft', ts: TOOL_TYPE_COLOR.microsoft },
    { what: 'data: md', spec: '#c9b6ff', token: '--color-data-md', ts: DATA_TYPE_COLOR.md },
    { what: 'data: dataverse', spec: '#3ce8b0', token: '--color-data-dataverse', ts: DATA_TYPE_COLOR.dataverse },
    { what: 'data: sharepoint', spec: '#38e1ff', token: '--color-data-sharepoint', ts: DATA_TYPE_COLOR.sharepoint },
  ];

  for (const { what, spec, token, ts } of cases) {
    it(`${what} is ${spec} in tokens.css and in palette.ts`, () => {
      expect(css.get(token)?.toLowerCase(), token).toBe(spec);
      expect(ts.toLowerCase(), `${what} in palette.ts`).toBe(spec);
    });
  }
});

describe('the background, which only CSS holds', () => {
  it('keeps SPEC §6 bg deep and bg glow', () => {
    expect(css.get('--color-bg-deep')?.toLowerCase()).toBe('#05060f');
    expect(css.get('--color-bg-glow')?.toLowerCase()).toBe('#0d1330');
  });
});
