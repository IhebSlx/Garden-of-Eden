/**
 * SPEC 6 "Normative constants" - every number here was read out of
 * `reference/prototype.html`, which is the tuned ground truth. Changing any of
 * them is a DEVIATION, so they live in exactly one place and are imported,
 * never re-typed.
 *
 * The CSS-facing half of the same set lives in `tokens.css`.
 */

// ---------- focus & ghosting (SPEC 5.2) ----------

/** `.card.ghost{opacity:.05}` - never hidden, always still there. */
export const GHOST_OPACITY = 0.05;
/** `.w2.ghost{opacity:.03}` - wires ghost a touch harder than cards. */
export const GHOST_WIRE_OPACITY = 0.03;
/** `popAt = now + (depth - focusDepth) * 110` */
export const FOCUS_CASCADE_STAGGER_MS = 110;
/** `.card.pop` / `cardpop` keyframes. */
export const CARD_POP_MS = 380;
/** `w.opT = 1.7` on the focused branch. */
export const FOCUSED_WIRE_BRIGHTNESS = 1.7;

// ---------- 2D wires (prototype `.w2` rules) ----------

export const WIRE_OPACITY = {
  base: 0.55,
  building: 0.6,
  planned: 0.25,
  /** `.w2.lit` - a wire inside the focused branch. */
  lit: 0.9,
  ghost: GHOST_WIRE_OPACITY,
} as const;

/** `stroke-width`: peer 1.8, from the orchestrator 3, otherwise 2.2. */
export const WIRE_WIDTH = { peer: 1.8, fromOrchestrator: 3, hierarchy: 2.2 } as const;
export const WIRE_DASH = { peer: '5 7', planned: '4 7' } as const;
export const PEER_WIRE_COLOR = '#9bb8ff';
/** Peer wires arc this far above the two cards. */
export const PEER_WIRE_LIFT = 70;
/** Hierarchy bezier handle length: clamp(halfGap, 40, 110). */
export const WIRE_BEZIER = { min: 40, max: 110 } as const;

/** 3D tube opacity multipliers by status (SPEC 6). */
export const EDGE_STATUS_MULTIPLIER = { live: 1, building: 0.7, planned: 0.35 } as const;

// ---------- semantic zoom (SPEC 5.5) ----------

/** Below this, sub-agent role lines disappear (`#view2d.far`). */
export const ZOOM_HIDE_ROLES = 0.55;
/** Below this, sub-agent cards collapse to a status dot (`#view2d.vfar`). */
export const ZOOM_COLLAPSE_TO_DOTS = 0.36;

// ---------- 2D layout (prototype `layout2d`) ----------

export const LAYOUT = {
  /** Horizontal slot per leaf. */
  slotWidth: 170,
  /** Vertical distance between depth levels. */
  rowHeight: 185,
  /** y of the root row. */
  top: 120,
  /** Extra slots inserted between the children of the root. */
  clusterGapRoot: 0.7,
  /** Extra slots inserted between the children of any deeper node. */
  clusterGap: 0.2,
  /** Odd sub-agents drop by this much so dense rows stay readable. */
  stagger: 36,
  staggerFromDepth: 2,
  boardPaddingX: 120,
  boardMinWidth: 1200,
  boardPaddingY: 190,
} as const;

/**
 * DEVIATION from the prototype, at the user's request: card size by depth was a
 * hand-tuned table (216/182/126/126, ratios 1.19, 1.44 and 1.00). It is now one
 * geometric series - every level is exactly 50% larger than the level below it,
 * box and text alike - so hierarchy is legible from size alone at any depth.
 */
export const HIERARCHY_SCALE_STEP = 1.5;

/**
 * The depth whose size is held fixed; every other level is derived from it, so
 * depth 1 - where most specialists sit - keeps the size it has always had while
 * the orchestrator above it grows and workers below shrink.
 */
export const HIERARCHY_ANCHOR_DEPTH = 1;

/** 1.5x per level up the hierarchy, 1/1.5 per level down. */
export function hierarchyScale(depth: number): number {
  const clamped = Math.min(Math.max(depth, 0), CARD_DEPTHS - 1);
  return HIERARCHY_SCALE_STEP ** (HIERARCHY_ANCHOR_DEPTH - clamped);
}

export const CARD_DEPTHS = 4;

/** Anchor box: the depth-1 card, unchanged from the prototype's second level. */
const CARD_ANCHOR = { width: 182, height: 64 } as const;

const round = (value: number): number => Math.round(value * 10) / 10;

export const CARD_SIZE = Array.from({ length: CARD_DEPTHS }, (_, depth) => ({
  width: round(CARD_ANCHOR.width * hierarchyScale(depth)),
  height: round(CARD_ANCHOR.height * hierarchyScale(depth)),
}));

export const COLLAPSED_CARD_WIDTH = 40;

export function cardSize(depth: number): { width: number; height: number } {
  const clamped = Math.min(Math.max(depth, 0), CARD_SIZE.length - 1);
  return CARD_SIZE[clamped] ?? { width: CARD_ANCHOR.width, height: CARD_ANCHOR.height };
}

// ---------- 2D viewport (prototype `zoom2dAt`, `fit2d`, `frame2d`) ----------

export const ZOOM = {
  min: 0.2,
  max: 2.5,
  wheelIn: 1.12,
  wheelOut: 0.89,
  buttonIn: 1.25,
  buttonOut: 0.8,
  /** `fit2d` never zooms in past this. */
  fitMax: 1.1,
  /** `frame2d` (focus) may go a little closer. */
  frameMax: 1.25,
} as const;

/** `fit2d` insets. */
export const FIT_PADDING = { x: 40, y: 160, offsetY: 14 } as const;
/** `frame2d` insets, plus the per-card padding added to the subtree bbox. */
export const FRAME_PADDING = { x: 80, y: 200, offsetY: 10, card: 30 } as const;

/** Board transform animation (`#board2d.anim`). */
export const BOARD_ANIM_MS = 500;

/**
 * SPEC 10 known bug class: pointer thresholds are measured in SCREEN pixels and
 * are never divided by the zoom scale. A zoom-scaled threshold broke
 * click-to-focus at overview zoom in the prototype.
 */
export const DRAG_THRESHOLD_PX = 5;
export const PAN_THRESHOLD_PX = 6;

// ---------- minimap ----------

export const MINIMAP = { width: 168, height: 112, innerWidth: 166, innerHeight: 110, inset: 16 } as const;

// ---------- 3D (SPEC 5.4, Phase 2) ----------

/** Same 1.5x-per-level rule as the 2D cards, anchored on the department sphere. */
const SPHERE_ANCHOR = 8.5;
export const NODE_SIZE_3D = {
  orchestrator: SPHERE_ANCHOR * HIERARCHY_SCALE_STEP,
  department: SPHERE_ANCHOR,
  worker: SPHERE_ANCHOR / HIERARCHY_SCALE_STEP,
} as const;
export const LABEL_SCALE_3D = {
  orchestrator: 1.15 * HIERARCHY_SCALE_STEP,
  department: 1.15,
  worker: 1.15 / HIERARCHY_SCALE_STEP,
} as const;

export const CAMERA_3D = {
  theta: 0.55,
  phi: 1.1,
  radius: 300,
  target: [0, 5, 0],
  phiMin: 0.08,
  phiMax: 3.06,
  radiusMin: 35,
  radiusMax: 850,
  /** Wheel step: radius *= 1 ± 0.08. */
  wheelStep: 0.08,
  /** Pan sensitivity: radius * 0.0016. */
  panFactor: 0.0016,
  orbitX: 0.005,
  orbitY: 0.004,
  /** Camera easing per frame. */
  ease: 0.06,
} as const;

/** Orbit inertia decay per frame (SPEC 6). */
export const ORBIT_INERTIA_DECAY = 0.92;
/** Auto-rotate only after this much idle time (SPEC 5.4). */
export const AUTO_ROTATE_IDLE_MS = 6000;
export const AUTO_ROTATE_SPEED = 0.0009;
/** Selection-ring pulse (SPEC 6). */
export const SELECTION_PULSE_MS = 2400;

export const LAYOUT_3D = {
  rootY: 95,
  baseRadius: 95,
  radiusPerDepth: 85,
  radiusStagger: 42,
  yPerDepth: 70,
  spreadPerChild: 0.3,
  spreadMax: 1.25,
} as const;

/** Focus camera distance: clamp(subtreeRadius * 2.3 + 70, 120, 340). */
export const FOCUS_CAMERA_3D = { factor: 2.3, offset: 70, min: 120, max: 340 } as const;

/** Distance fades: labels at depth>=2, then the detail satellites. */
export const FADE_3D = {
  labelStart: 480,
  labelRange: 110,
  satelliteStart: 400,
  satelliteRange: 90,
} as const;

export const BURST_MS = 500;
export const BURST_SCALE = { from: 2.4, growth: 3.4 } as const;

/** Per-frame easing used across the 3D scene. */
export const EASE_3D = { fade: 0.08, scale: 0.12, meshScale: 0.14, ring: 0.15, detail: 0.12 } as const;

export const HOVER_SCALE_3D = 1.28;
export const SELECTED_SCALE_3D = 1.2;
/** Planned nodes render at this opacity (and as wireframe). */
export const PLANNED_OPACITY_3D = 0.55;

// ---------- 2D <-> 3D morph (SPEC 8.2) ----------

/** Length of the flatten / unflatten transition. */
export const MORPH_MS = 900;
/** Height of the plane the fleet flattens onto. */
export const MORPH_PLANE_Y = -40;
/** World units the flattened board spans, so it reads at a comfortable size. */
export const MORPH_SPAN = 520;
/** Camera distance once the fleet is flat and the view is top-down. */
export const MORPH_RADIUS = 330;
