# PARITY.md — app vs `reference/prototype.html`

SPEC §10: *"Visual verification loop: for every §5 feature with a visual outcome, open
`reference/prototype.html` and the app with Playwright, capture screenshots of the same state,
and compare before marking done. Phase 2 maintains this as a written checklist."*

Method: both are served from the same Vite dev server (`/` and `/reference/prototype.html`) into
the same browser pane at the same size, driven to the same state, and compared.

Legend: **=** identical · **≈** intentionally equivalent (difference explained) · **+** app adds
what the prototype deferred (SPEC §8) · **⚠** known gap.

---

## 2D board

| Item | Verdict | Notes |
|---|---|---|
| Full-fleet framing on load | **=** | Both fit the Solarlux fleet to the same zoom at the same pane size (20% at 800×392, 36% at 1280×820). Same `fit2d` formula. |
| Board extent & card positions | **=** | Same `layout2d` walk: slot width 170, row height 185, top 120, cluster gaps 0.7 / 0.2, stagger 36 from depth 2. |
| Card sizes by depth | **=** | d0 216px, d1 182px, d2/d3 126px, with the prototype's paddings and font sizes. |
| Kind colours & left accent edge | **=** | Same `CSS_COLOR` table, same 3px accent border and corner tint. |
| Glass fill, hairline border, shadow | **=** | `rgba(19,25,48,.62)` + blur(12px), same shadow stack. |
| Dot-grid background | **=** | 26px gap. Drawn by React Flow's `Background`, colour matched by eye against the prototype's `radial-gradient` dots. |
| Edge vignette | **=** | `inset 0 0 190px 40px rgba(2,4,12,.55)`. |
| Hierarchy wire shape | **=** | Same cubic bezier with `dy = clamp((y2-y1)/2, 40, 110)`. |
| Wire width by level | **=** | 3 from the orchestrator, 2.2 otherwise, 1.8 for peers. |
| Peer wire | **=** | Lifted arc, `5 7` dash, neutral `#9bb8ff`, no arrowhead. |
| Directional arrowheads | **=** | Per-colour markers, `refX 8`, 5×5. |
| Status wire opacity | **=** | live .55 / building .6 / planned .25 + `4 7` dash / lit .9 / ghost .03. |
| Shared ×N badge | **=** | Amber badge, same threshold (>1 parent). |
| Status card language | **=** | Planned dashed border + dimmed tint, In progress pulsing status dot, Live solid. |
| Semantic zoom `< 0.55` | **=** | Sub-agent role lines and chips hidden. |
| Semantic zoom `< 0.36` | **=** | Sub-agent cards collapse to a 40px status dot. |
| Focus: zoom-to-fit subtree | **=** | Same `frame2d` maths, same paddings (80/200/+10, 30 per card), same 1.25 cap. |
| Focus: 5% ghosting | **=** | `.card.ghost{opacity:.05}`, never hidden. |
| Focus: wire brightening | **=** | `.w2.lit` at .9. |
| Focus cascade 110 ms/level | **+** | The prototype staggers pops in 3D only; SPEC §5.2 asks for it in both, so the 2D board staggers `cardpop` by `(depth − focusDepth) × 110 ms`. |
| Breadcrumb | **=** | `Fleet ▸ <agent>`, root clickable. |
| Exit focus paths | **=** | Esc, breadcrumb root, double-click empty, single-click empty *while focused*. |
| Selection ring pulse | **=** | 2.4 s `selpulse` on every copy of a shared agent. |
| Hover lift | **=** | `scale(1.04)` + kind-coloured glow. |
| Click burst | **≈** | Prototype draws an additive sprite ring in 3D and none in 2D; the app draws a CSS ring in the card's kind colour so SPEC §5.9 holds in both views. |
| Minimap | **=** | 168×112, dots 7/5/3.5 by depth, live viewport rect, click and drag to jump. |
| Zoom controls | **=** | + / − / fit / live %, steps 1.25 and 0.8, range 0.2–2.5. |
| Wheel zoom toward cursor | **≈** | React Flow's continuous d3-zoom curve instead of the prototype's fixed ±12%/notch. Direction, anchor and limits identical; only the per-notch increment differs. |
| Card drag threshold | **=** | 5 screen pixels, never zoom-scaled (SPEC §10 bug class). Board pan threshold 6. |
| Filter bar | **=** | All / Live / In progress / Planned, re-click clears, intersects with focus. |
| Inline rename | **≈** | Same double-click → Enter/Esc flow; implemented as an input rather than `contentEditable` (React re-renders clobbered the editable span mid-typing). |
| Details toggle chips | **=** | Skills dashed, tools with type dot, hidden at `far`/`vfar`. |
| Auto-arrange | **=** | Clears manual positions, re-lays out, refits. |
| Hint + tagline | **=** | Same copy, plus `Ctrl+Z = undo` for the app's undo. |

## Inspector panel

| Item | Verdict | Notes |
|---|---|---|
| Kind chip, name, role | **=** | Same sizes and colours; shared agents show `Shared agent ×N` in amber. |
| Status chip (collapsed → 3) | **=** | Single chip with ▾, expands, collapses on choice. |
| Relations | **=** | "Reports to", "Shared sub-agent of A, B, C", "Linked to X (same level)". |
| Instructions clickable | **=** | Opens the detail card; the app adds a pencil to edit in place (SPEC §8.10). |
| Skill / tool / data chips | **=** | Type dots for tools and data, status mini-dot on data. |
| Detail card | **=** | Name + coloured type tag, description, data status + `linked ✓` / `not linked yet`. |
| "linked to: [Agent]" jump | **=** | Same buttons, same focus + open behaviour. |
| Workflow steps | **+** | Prototype rendered a linear list; the app lays out a real mini-DAG (SPEC §8.6) that still reads as that list for linear flows. |
| "+ Add sub-agent" | **+** | The prototype hid it on shared agents and showed a "comes later" note; SPEC §8.8 enables it, so the app allows it everywhere. |
| Panel actions | **+** | App adds "Link existing…" and "Delete agent" with confirmation (SPEC §5.8). |

## 3D space

| Item | Verdict | Notes |
|---|---|---|
| Radial layout | **=** | Root at y 95, departments on a 95 ring from π/4, deeper levels spread `min(n×0.3, 1.25)` and drop 70 per level with a 42 radius stagger. |
| Node sizes | **=** | Orchestrator 13, department 8.5, worker 5. |
| Lit spheres, not stickers | **=** | `MeshStandardMaterial`, colour ×0.5, emissive at 0.7, roughness .35, metalness .15, under ambient + hemisphere + key light. |
| Planned = wireframe blueprint | **=** | Plus 0.55 opacity. |
| In-progress halo pulse | **=** | `0.78 + 0.22·sin(t·0.003 + phase)`; the app derives `phase` from the instance key instead of `Math.random()` so the scene is reproducible. |
| Soft additive halo | **=** | Sprite at 6× node size, opacity .7. |
| Label glass pills | **=** | Same canvas pill: 512×150, radius 26, `rgba(8,12,26,.66)` fill, `rgba(124,140,255,.32)` stroke. |
| Label distance fade | **=** | Depth ≥ 2 fades over `(480 − radius)/110`. |
| Satellite constellation | **=** | Skills octahedra, tools spheres in type colour, tethers, tiny labels, fading over `(400 − radius)/90`. |
| Selection ring | **=** | Additive ring sprite, pulsing scale, opacity .85. |
| Click burst | **=** | 500 ms, scale `2.4 → 5.8`, opacity `.9 → 0`. |
| Wires as additive tubes | **=** | Radius .45 hierarchy / .3 peer, peer control point lifted 20 and pushed out 1.45. |
| Wire status multipliers | **=** | ×1 / ×0.7 / ×0.35, focused branch ×1.7. |
| Grounded scene | **=** | Light disc radius 240 at y −150, grid 800/44 at 0.09 opacity, 900 stars. The app scatters stars from a fixed hash rather than `Math.random()`, so screenshots are comparable. |
| Fog | **=** | `FogExp2(0x05060f, 0.0011)`. |
| Orbit / pan / zoom | **=** | ±0.005/0.004 per pixel, right-drag or Shift-drag pans at `radius × 0.0016`, wheel ±8%, φ 0.08–3.06, radius 35–850. |
| Inertia glide | **=** | 0.92 decay per frame. |
| Auto-rotate after 6 s idle | **=** | 0.0009 rad/frame, suppressed under `prefers-reduced-motion`. |
| Focus camera | **=** | `clamp(subtreeRadius × 2.3 + 70, 120, 340)` on the subtree centre. |
| Orchestrator shell | **≈** | **DEVIATION:** the prototype spins the icosahedron continuously. SPEC §2.5 bans ambient motion that carries no meaning, so the app renders it static. Same geometry, colour and 0.22 opacity. |
| 2D ↔ 3D switch | **=** | Crossfade; focus, selection, filter and search carry across (SPEC §5.1), verified by an e2e round-trip. |

## Known gaps

| Item | Status |
|---|---|
| Animated 2D↔3D morph (SPEC §8.2) | Phase 3 — the v1 switch is the specified crossfade. |
| Bloom + depth of field (SPEC §8.9) | Phase 3. |

## Deviations recorded elsewhere

1. **Instance keys** are the full hierarchy path, not `agentId@parentId` — SPEC §4 cannot have both
   that key form and its own shared-children rule. See `TRACE.md`.
2. **Layout engine** is a tree walk, not elkjs (SPEC §3) — instances form a tree by construction.
   See `src/layout/treeLayout.ts`.
3. **Shared agents are not draggable** — SPEC §4 gives an agent one `position`, which cannot place
   its N instances. See `src/views/board2d/boardModel.ts`.
4. **Orchestrator shell is static** — see the 3D table above.
