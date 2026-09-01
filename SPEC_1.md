# Agent Fleet Studio — Build Specification

> **Provenance.** Every decision in this document was validated interactively in a working HTML prototype
> (`reference/prototype.html` in this repo). The prototype is the visual and behavioral ground truth.
> Where this spec and the prototype disagree, this spec wins — disagreements are listed in §8 (App-only upgrades).
> Working name "Agent Fleet Studio" is a placeholder; renaming has no technical impact.

---

## 1. Product vision

A visual builder for **agent fleets**: hierarchies of AI agents (orchestrator → departments → sub-agents, with
shared agents serving multiple parents). The same fleet renders in **two switchable views** — a 2D glass board
and a free-navigation 3D space — over **one shared store**. The board is also a **roadmap**: every component
carries a status (Live / In progress / Planned), so the full eventual fleet is always drawn and filters reveal
what exists today.

**v1 non-goals:** no agent execution, no backend/multi-user, no workflow-document import, no authentication.
Local-first single-user app.

---

## 2. Locked architecture principles

1. **One store, many renderers.** The fleet lives in a single Zustand store as view-agnostic data. The 2D board
   and 3D scene are renderers subscribed to it. Any mutation (rename, status change, add, link) appears in both
   views instantly. No view owns data.
2. **The model is a DAG, not a tree.** Agents may have multiple hierarchy parents (shared agents). Nesting
   children inside agent objects is forbidden — structure lives only in edges.
3. **One agent = one truth, rendered as instances.** A shared agent is stored once and *rendered* once per
   (agent, parent) pair. Instances are a derived, never-persisted concept. Selecting any instance highlights
   all; editing applies everywhere.
4. **Structure vs content.** Sub-agents = edges (structure). Skills, tools, data sources, instructions,
   model config = fields on the agent (content).
5. **No purposeless motion.** Every animation must answer a user action or carry meaning (status pulse,
   click burst, focus cascade). Ambient decoration (floating particles, traveling dots) is banned until it
   represents real telemetry.
6. **Semantic zoom.** Distance controls detail. Far: structure only (big nodes, department names).
   Near: full detail. Node size scales with hierarchy level in both views.

---

## 3. Tech stack (pinned majors)

| Layer | Choice | Rationale |
|---|---|---|
| App | Vite + React 19 + TypeScript (strict) | Canvas app; SSR adds nothing |
| State | Zustand + zundo (temporal) | Single store, undo/redo for free |
| 2D view | @xyflow/react v12 (React Flow) | Drag/connect/zoom/pan/minimap native |
| 3D view | react-three-fiber v9 + drei + @react-three/postprocessing | Declarative Three.js; bloom/DoF |
| Styling | Tailwind v4 + Framer Motion | Glass design system + UI transitions |
| Layout | elkjs (layered) | DAG auto-layout, multi-parent aware |
| Validation | Zod | §4 schema is the runtime contract |
| Persistence | IndexedDB (idb) + JSON export/import | Local-first, versioned files |
| Search | Fuse.js (weighted fuzzy) + custom field index | §8.3 |
| Tests | Vitest + React Testing Library + Playwright | §10 |
| CI | GitHub Actions | typecheck + lint + tests on every push |

---

## 4. Domain model (Zod schemas, single source of truth)

```ts
// ---------- shared ----------
type Status = 'live' | 'building' | 'planned';
// Display labels — agents/edges: Live / In progress / Planned
//                  data sources: Ready / In progress / Planned

// ---------- libraries (first-class entities, referenced by id) ----------
type Skill = {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
};

type Tool = {
  id: string;
  name: string;
  description: string;                       // required — every tool explains itself
  type: 'workflow' | 'python' | 'microsoft'; // extensible enum
  workflow?: {                               // only when type === 'workflow'
    steps: {
      id: string;
      name: string;
      kind: 'trigger' | 'action' | 'condition';
      next: string[];                        // branching supported (mini-DAG)
    }[];
  };
  config?: Record<string, unknown>;
};

type DataSource = {
  id: string;
  name: string;
  type: 'md' | 'dataverse' | 'sharepoint';   // extensible enum
  status: Status;                            // Ready / In progress / Planned
  linked?: boolean;                          // only meaningful when status === 'live';
                                             // global property of the source itself, not per-agent
  ref?: string;                              // URI / path / table name
};

// ---------- graph ----------
type Agent = {
  id: string;
  kind: 'orchestrator' | 'department' | 'worker';  // NOTE: 'shared' is DERIVED, see below
  name: string;
  role: string;
  status: Status;
  instructions?: string;
  model?: { provider: string; name: string; temperature?: number };
  skillIds: string[];
  toolIds: string[];
  dataSourceIds: string[];
  position?: { x: number; y: number };       // manual 2D override; absent = auto-layout
};

type Edge = {
  id: string;
  source: string;                            // parent
  target: string;                            // child
  kind: 'hierarchy' | 'peer';
  status: Status;
  label?: string;
};

type Fleet = {
  schemaVersion: 1;
  id: string;
  name: string;
  agents: Agent[];
  edges: Edge[];
  skills: Skill[];
  tools: Tool[];
  dataSources: DataSource[];
};
```

**Derived rules (pure selectors, unit-tested):**
- `isShared(agent)` ⇔ agent has ≥ 2 hierarchy parents.
- `instances(fleet)` = one render instance per (agent, hierarchy-parent) pair; parentless agents get one
  root instance. Instance keys: `agentId@parentId`.
- `visibleSet(focusId)` = focused agent + all hierarchy descendants (BFS over hierarchy edges).
- Children of a shared agent: attached to the agent entity; their instances appear under **every** instance
  of the parent. (Prototype disabled this; the app implements it with this rule.)
- Validation: exactly one orchestrator; no hierarchy cycles; edge endpoints exist; referenced library ids exist.

---

## 5. Interaction specification (all behaviors prototype-validated)

### 5.1 Views & switching
- Toggle 2D / 3D anywhere; **focus, selection, filter, and search state carry across the switch**.
- v1 switch: crossfade. Phase 3: animated morph (§8.2).

### 5.2 Focus (both views)
- Click an agent → frame its subtree (agent + all descendants incl. its shared-agent instances);
  everything else ghosts to **5% opacity** (never fully hidden).
- 2D framing = animated pan+zoom-to-fit of the subtree bbox (real zoom, not centering).
- Exit: Esc, breadcrumb root, double-click empty space, single-click empty space *only while focused*
  (never hijack the camera otherwise).
- Focus cascade: focused node pops first, children pop ~110 ms later per depth level.
  Focused branch wires brighten; ghost wires dim.
- Peer links never expand focus: a peer-connected agent is **not** part of the focused set
  (validated decision — it looked like a floating orphan). Peers remain visible in full view
  and listed in the panel.
- Breadcrumb (top center): `Fleet ▸ <focused agent>`, root clickable.

### 5.3 Shared agents
- Rendered once under each parent, ×N badge, "shared ×N" sub-label.
- Selecting any copy highlights all copies (selection ring on each).
- Panel: "Shared sub-agent of A, B, C".

### 5.4 Navigation
- 3D: orbit (drag), pan (right-drag / Shift-drag / two-finger), zoom (wheel/pinch), inertia glide,
  near-full vertical orbit, wide zoom range, auto-rotate only after 6 s idle (respects reduced motion).
- 2D: pan empty space, wheel/pinch zoom toward cursor, drag cards (screen-pixel drag threshold — see §10 bug note),
  minimap (dots by kind, live viewport rect, click/drag to jump), zoom controls (+ / − / fit / %),
  double-click empty = fit.

### 5.5 Semantic zoom & hierarchy scale
- Node/card size by depth: orchestrator > department > sub-agent, both views.
- 3D: depth≥2 labels fade beyond a camera-distance threshold; Details satellites fade earlier.
- 2D: <55% zoom hides sub-agent role lines; <36% collapses sub-agent cards to status dots.
- Focusing always lands past the thresholds (detail guaranteed when focused).

### 5.6 Status system (roadmap semantics)
- Agents & edges: Live (solid) / In progress (pulsing indicator) / Planned (blueprint: 3D wireframe,
  2D dashed border, dashed faint wires).
- Data sources: Ready / In progress / Planned + `linked` badge when Ready ("linked ✓" / "not linked yet").
- Filter bar: All / Live / In progress / Planned → non-matching components ghost to 5%.
  Composes with focus (intersection).
- Panel status control: shows **only the current status** as a single chip (`● In progress ▾`);
  click expands the three options; choosing collapses. App adds the same control on edges (§8.5).
- New agents and their edges default to **Planned**.

### 5.7 Inspector panel
- Sections: kind chip, name, role, status chip, relations ("Reports to…" / "Shared sub-agent of…" /
  "Linked to… (same level)"), Instructions, Skills, Tools, Data sources, actions.
- **Everything is clickable**: instructions, each skill/tool/data chip → detail card showing:
  name, type tag (colored), description, workflow step visualization (mini-DAG for branching flows),
  data status + linked badge, and **"linked to: [Agent] [Agent]…"** — clickable buttons that jump-focus
  that agent. Clicking the same item again closes the detail.
- Chip visual language: tool chips carry type dot (workflow amber / python cyan / microsoft indigo);
  data chips carry type dot (md lavender / dataverse green / sharepoint teal) + status mini-dot.

### 5.8 Creating & editing
- Creation friction rule: a new agent needs **two fields max** (name, role); everything else later.
- Primary flows: fleet template (orchestrator + departments pre-wired) → spawn child on selected node
  ("+ Add sub-agent") → configure in panel. Palette drag is secondary.
- Inline rename: double-click card name (2D) — Enter commits, Esc cancels; propagates to all instances,
  3D labels, panel, breadcrumb, minimap. App adds rename in panel too.
- Skills/tools/data attach via searchable pickers from the shared libraries — never retyped.
- Link existing agent as sub-agent: wire-drag in 2D (React Flow), "Link existing…" panel button in both views.
  The link flow always asks for the edge kind: **sub-agent (hierarchy)** or **peer**.
- Delete & unlink: delete agents (removes their edges; deleting a shared agent warns and lists its parents),
  delete edges (= unlink), delete library items (blocked while in use — show the usage list instead).
  Removing an agent's **last** hierarchy parent is blocked with a hint to delete the agent instead —
  no orphan nodes. All destructive actions are undoable.
- Auto-arrange button: clears manual positions, re-runs layout (same-depth alignment, cluster gaps,
  staggered sub-agent rows), refits.
- Details toggle: skills/tools as chips inside cards (2D) / satellite constellation with tiny labels (3D).

### 5.9 Feedback animations (purposeful only)
- Click: expanding ring burst at the node (kind color).
- Selection: pulsing accent ring (all instances of a shared agent).
- Card hover lift (2D), node hover scale (3D).
- All animations respect `prefers-reduced-motion`.

### 5.10 Search
- Always-visible search input. v1 brain (§8.3): weighted fielded fuzzy matching over name (highest),
  role, skills, tools (+type labels), data (+type/status), kind, status; multi-token AND;
  typo tolerance; DE↔EN synonym table (e.g., Angebot↔offer, Vertrieb↔sales); results show match reason;
  keyboard navigation; picking a result focuses + opens the agent with click burst.

### 5.11 Fleets & templates
- Fleet switcher in the top bar: create, rename, duplicate, delete (with confirm). Each fleet
  autosaves independently.
- Creation offers two starting points: **Blank** (orchestrator only) and **Company fleet**
  (orchestrator + four generic departments, everything Planned, ready to rename).
- The Solarlux demo fleet ships as a loadable example, not the default.

---

## 6. Visual design system

Dark futuristic glass. Tokens:

| Token | Value | Use |
|---|---|---|
| bg deep | `#05060f` | page base |
| bg glow | `#0d1330` | radial center |
| orchestrator | `#8b5cf6` | violet |
| department | `#38e1ff` | cyan |
| worker | `#3ce8b0` | mint |
| shared accent | `#f6b954` | amber |
| status live | `#4ade80` | green |
| status building | `#fbbf24` | amber-yellow |
| status planned | `#6b7a9e` | slate |
| tool: workflow / python / microsoft | `#f6b954` / `#38e1ff` / `#818cf8` | type dots |
| data: md / dataverse / sharepoint | `#c9b6ff` / `#3ce8b0` / `#38e1ff` | type dots |

- Cards: glass (`rgba(19,25,48,.62)` + blur), kind-colored left accent edge + corner tint,
  hairline borders, deep shadows.
- 2D board: dot-grid background, edge vignette, directional arrowheads on hierarchy wires,
  wire width by level (orchestrator links thickest), dashed peer links.
- 3D quality bar (all validated): real lighting (hemisphere + key) so spheres shade — **never**
  full-emissive sticker look; label text in glass pills; grounded scene (light disc + faint grid
  directly beneath the fleet, radial background depth); soft additive halos, not blown-out glow.
- Typography: Inter/system stack; hierarchy via size & weight, not decoration.

**Normative constants.** Tuned values in `reference/prototype.html` are the defaults — extract them
rather than re-inventing. Key ones: ghost opacity **0.05**; focus cascade stagger **110 ms/level**;
2D semantic-zoom stages **<0.55** (roles hidden) and **<0.36** (dots); 3D auto-rotate after **6 s** idle;
orbit inertia decay **0.92/frame**; selection-ring pulse **~2.4 s**; focused-wire brightness **×1.7**;
planned-edge opacity **×0.35**, building **×0.7**. Changing any of these is a `DEVIATION:`.

---

## 7. Persistence & files

- Autosave to IndexedDB on every mutation (debounced). Multiple named fleets.
- Export/import: versioned Fleet JSON (`schemaVersion`), Zod-validated on import with readable errors.
- The graph is the file — no separate layout file; manual positions live on agents.

---

## 8. App-only upgrades (explicitly deferred from the prototype — build these)

1. **Undo/redo** (zundo temporal store; Ctrl+Z/Y; covers every mutation).
2. **Animated 2D↔3D morph**: camera rises to top-down while nodes glide to 2D layout positions (and reverse).
3. **Search brain**: Fuse.js fuzzy + typo tolerance, DE↔EN synonyms, and links/statuses as searchable objects.
   (Semantic/embedding search stays backlog.)
4. **Wire-drag linking & re-parenting** in 2D via React Flow; "Link existing…" picker in both views.
5. **Edge status editing** (click a wire → mini panel: kind, label, status).
6. **Branching workflow renderer**: mini-DAG for `steps[].next[]` (prototype rendered linear chains only).
7. **Libraries as entities**: skills/tools/data referenced by id (prototype matched by name). Includes a
   library manager view (list, edit, see usage).
8. **Shared-agent children** enabled per the §4 instance rule (prototype disabled it).
9. **Bloom + depth-of-field** post-processing in 3D (Phase 3).
10. Panel rename + role/instructions editing (prototype only renamed via card).

**Model deviations from prototype (intentional, do not "fix" back):**
- `kind: 'shared'` is removed — shared-ness is derived from parent count (§4).
- Skills/tools/data move from inline per-agent objects to id-referenced libraries (§4).

---

## 9. Roadmap

**Phase 0 — Foundation.** Vite/React/TS scaffold, Tailwind, CI, Zod schemas, Zustand store + zundo,
derived selectors (instances, visibleSet, isShared) **with full unit tests**, IndexedDB persistence,
JSON export/import, seed fleet (the Solarlux demo data from the prototype, migrated to libraries).
*DoD: all selectors and schema round-trip tests green.*

**Phase 1 — 2D board, feature-complete.** React Flow board with the full §5 interaction set (focus,
ghosting, status system + filter, panel with clickable items & cross-links, search, minimap/zoom controls,
auto-arrange via elkjs, semantic zoom, rename, add/link/delete/unlink agents, fleet switcher & templates,
undo/redo, click feedback). Executed as **max 6 sequential milestones**, each ending in a working state.
*DoD: every §5 behavior demonstrable in 2D; Playwright smoke covers focus/filter/search/add/rename/delete/undo.*

**Phase 2 — 3D view + sync.** R3F scene at prototype visual quality (§6 quality bar), shared state
(focus/selection/filter/search parity), free navigation, satellites, crossfade switch.
*DoD: state round-trips 2D↔3D with zero divergence; visual parity checklist against reference/prototype.html.*

**Phase 3 — Polish.** Morph transition, bloom/DoF, performance pass (100+ agents at 60 fps target:
instanced meshes, memoized selectors), reduced-motion audit, keyboard shortcuts, empty states.

**Backlog (post-v1, do not build now):** execution telemetry (pulses = live task flow), workflow import
(Power Automate export parsing; LLM extraction from documents), Copilot Studio sync, multi-user backend
(Supabase), additional visual themes.

---

## 10. Testing & Definition of Done (non-negotiable)

- **Ground-truth test suite**: graph selectors, schema validation, store actions (incl. undo), and
  Playwright flows per phase. **Nothing ships while the suite is red.**
- **Visual verification loop**: for every §5 feature with a visual outcome, open `reference/prototype.html`
  and the app with Playwright, capture screenshots of the same state, and compare before marking done.
  Phase 2 maintains this as a written checklist (`PARITY.md`).
- **Traceability**: maintain `TRACE.md` mapping every §5 item → its test(s). A §5 item without a test is not done.
- **Silent simplification is a deviation**: downgrading any specified behavior (e.g., pan-only instead of
  zoom-to-fit framing, hiding instead of 5% ghosting) counts as a deviation and must be flagged first.
- **No open markers**: `TODO`, `FIXME`, `[ZU PRÜFEN]`, placeholder copy, or dead buttons never reach `main`.
- **Deviation rule**: any departure from this spec must be flagged explicitly in the PR/commit message
  under a `DEVIATION:` heading with rationale — never applied silently.
- Known prototype bug class to test against: pointer thresholds must be measured in **screen pixels**,
  never zoom-scaled units (a zoom-scaled threshold broke click-to-focus at overview zoom).
- Lint (ESLint + typecheck) clean; `prefers-reduced-motion` honored everywhere.

---

## 11. Repository layout

```
/reference/prototype.html      ← the validated prototype (ground truth, read-only)
/src
  /model        schemas.ts, selectors.ts (instances, visibleSet, isShared), migrations.ts
  /store        fleetStore.ts (zustand + zundo), persistence.ts
  /views
    /board2d    Board.tsx, nodes/, wires/, Minimap*, controls/
    /space3d    Scene.tsx, AgentInstance.tsx, Wires.tsx, effects/
  /panel        Inspector.tsx, ItemDetail.tsx, StatusChip.tsx
  /search       index.ts, synonyms.ts
  /layout       elk.ts
  /ui           tokens.css, primitives/
/tests          unit/, e2e/
SPEC.md         ← this file
CLAUDE.md       ← working rules distilled from §10 (created in Phase 0)
```
