/**
 * The 3D satellite bundles (SPEC §5.8 details toggle, bundled — see Satellites.tsx).
 * The maths is unit-tested here; the interaction is covered by the store tests and
 * the 3D e2e flow.
 */
import { describe, expect, it } from 'vitest';
import { blossomPoints, dominantColor } from '../../src/views/space3d/Satellites.js';
import { BLOSSOM } from '../../src/ui/constants.js';
import { DATA_TYPE_COLOR, SKILL_COLOR, TOOL_TYPE_COLOR } from '../../src/ui/palette.js';

describe('blossomPoints', () => {
  it('places one point per member', () => {
    expect(blossomPoints(0)).toHaveLength(0);
    expect(blossomPoints(1)).toHaveLength(1);
    expect(blossomPoints(19)).toHaveLength(19);
  });

  it('keeps a small bundle on a single ring', () => {
    const radii = blossomPoints(5).map((p) => Math.hypot(p.x, p.z));
    for (const radius of radii) expect(radius).toBeCloseTo(BLOSSOM.innerRadius, 5);
  });

  it('starts a wider ring once the first is full, so 19 stays compact', () => {
    // Without rings, 19 members on one circle would need a radius nobody can read.
    const points = blossomPoints(19);
    const rings = new Set(points.map((p) => Math.round(Math.hypot(p.x, p.z))));
    expect(rings.size).toBe(3);
    expect(Math.max(...rings)).toBe(BLOSSOM.innerRadius + 2 * BLOSSOM.ringGap);
  });

  it('drops each outer ring so rings do not overlap head-on', () => {
    const points = blossomPoints(19);
    expect(points[0]?.y).toBeCloseTo(0, 10);
    expect(points[BLOSSOM.perRing]?.y).toBe(-BLOSSOM.ringDrop);
  });

  it('spreads a ring evenly and offsets alternate rings', () => {
    const points = blossomPoints(BLOSSOM.perRing);
    const angles = points.map((p) => Math.atan2(p.z, p.x));
    const unique = new Set(angles.map((a) => a.toFixed(4)));
    expect(unique.size).toBe(BLOSSOM.perRing);
  });

  it('never puts two members in the same place', () => {
    const seen = new Set(blossomPoints(19).map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`));
    expect(seen.size).toBe(19);
  });
});

describe('dominantColor', () => {
  it('takes the commonest member colour, so the bundle reads as what it holds', () => {
    const members = [
      { label: 'a', color: DATA_TYPE_COLOR.md },
      { label: 'b', color: DATA_TYPE_COLOR.md },
      { label: 'c', color: DATA_TYPE_COLOR.sharepoint },
    ];
    expect(dominantColor(members, SKILL_COLOR)).toBe(DATA_TYPE_COLOR.md);
  });

  it('falls back when there is nothing to count', () => {
    expect(dominantColor([], TOOL_TYPE_COLOR.workflow)).toBe(TOOL_TYPE_COLOR.workflow);
  });

  it('invents no colour of its own — the result is always a member colour', () => {
    const members = [{ label: 'x', color: TOOL_TYPE_COLOR.python }];
    expect(dominantColor(members, SKILL_COLOR)).toBe(TOOL_TYPE_COLOR.python);
  });
});
