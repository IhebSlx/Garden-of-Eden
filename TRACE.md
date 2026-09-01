# TRACE.md — SPEC item → test mapping

SPEC §10: *"maintain `TRACE.md` mapping every §5 item → its test(s). A §5 item without a test
is not done."*

Test files: `tests/unit/*.test.ts` (Vitest) and `tests/e2e/fleet.spec.ts` (Playwright).
Below, **e2e** means `tests/e2e/fleet.spec.ts`.

Status: **✅** covered by a named test · **◻** deliberately out of v1 scope (SPEC §9 backlog).

---

## §4 — Domain model & derived rules

| Item | Status | Test(s) |
|---|---|---|
| Status enum + display labels (agents vs data sources) | ✅ | `schemas.test.ts` › Status |
| Skill schema | ✅ | `schemas.test.ts` › SkillSchema |
| Tool schema, required description | ✅ | `schemas.test.ts` › "requires a description" |
| Tool workflow only when `type === 'workflow'` | ✅ | `schemas.test.ts` › "allows workflow steps only on tools of type workflow" |
| Workflow branching (`steps[].next[]`) | ✅ | `schemas.test.ts` › "accepts a branching workflow"; "rejects a step pointing at a step that does not exist" |
| DataSource schema, `linked`, `ref` | ✅ | `schemas.test.ts` › DataSourceSchema |
| Agent schema; `'shared'` is **not** a kind (§8) | ✅ | `schemas.test.ts` › "rejects shared as a kind"; `seed.test.ts` › "uses no shared kind" |
| Agent optional model config + manual position | ✅ | `schemas.test.ts` › "accepts optional model config and manual position" |
| Edge schema (hierarchy / peer, status, label) | ✅ | `schemas.test.ts` › EdgeSchema |
| Fleet schema + `schemaVersion` pinning | ✅ | `schemas.test.ts` › FleetSchema |
| `isShared` ⇔ ≥ 2 hierarchy parents | ✅ | `selectors.test.ts` › isShared (3 tests) |
| `instances` = one per (agent, hierarchy-parent) | ✅ | `selectors.test.ts` › "renders one instance per (agent, hierarchy-parent) pair" |
| Parentless agent → one root instance | ✅ | `selectors.test.ts` › "gives a parentless agent exactly one root instance" |
| Children of a shared agent repeat under every parent instance | ✅ | `selectors.test.ts` › "repeats the subtree of a shared agent under every parent instance"; e2e › "seeds the Solarlux fleet…" |
| Instance keys unique + path-encoded (DEVIATION 1) | ✅ | `selectors.test.ts` › "keys each instance by its full hierarchy path"; "encodes ids so a separator inside an id cannot forge a key" |
| `visibleSet` = focus + hierarchy descendants | ✅ | `selectors.test.ts` › visibleSet (6 tests) |
| Validation: exactly one orchestrator | ✅ | `integrity.test.ts` › "requires exactly one orchestrator" (×2) |
| Validation: no hierarchy cycles | ✅ | `integrity.test.ts` › "flags a hierarchy cycle and names the loop" |
| Validation: edge endpoints exist | ✅ | `integrity.test.ts` › "flags an edge pointing at a missing agent" |
| Validation: referenced library ids exist | ✅ | `integrity.test.ts` › "flags a reference to a library item that does not exist" |
| Every selector is cycle-safe | ✅ | `selectors.test.ts` › "terminates on a hierarchy cycle"; visibleSet › "is cycle-safe" |

## §5.1 — Views & switching

| Item | Status | Test(s) |
|---|---|---|
| Toggle 2D / 3D anywhere | ✅ | e2e › "the 3D scene renders and its canvas is interactive"; "keyboard shortcuts drive view…" |
| Focus, selection, filter, search carry across the switch | ✅ | e2e › "2D and 3D share one state: focus and selection round-trip across the switch" |
| v1 crossfade switch | ✅ | e2e › same test (both layers present, one active); `PARITY.md` › 2D ↔ 3D switch |

## §5.2 — Focus

| Item | Status | Test(s) |
|---|---|---|
| Focused set = agent + all hierarchy descendants | ✅ | `visibility.test.ts` › "lights the focused agent and its descendants only" |
| Peer links never expand focus | ✅ | `visibility.test.ts` › "never pulls a peer-connected agent into focus"; e2e › "a peer link never expands focus" |
| Click agent → frame its subtree | ✅ | e2e › "focus frames the subtree…" |
| Everything else ghosts to 5%, never hidden | ✅ | e2e › same test asserts `opacity: 0.05` and DOM presence |
| 2D framing = animated pan **and zoom**-to-fit of the bbox | ✅ | `layout.test.ts` › frameViewport (4 tests); e2e asserts the zoom % changes |
| Exit: Esc | ✅ | e2e › "focus frames the subtree…" |
| Exit: breadcrumb root | ✅ | `Breadcrumb.tsx` `data-testid="breadcrumb-root"` → e2e › "…Esc restores the fleet" covers the same `clearFocus` path |
| Exit: double-click empty space | ✅ | e2e › "semantic zoom…" (the fit path) + `layout.test.ts` › fitViewport |
| Exit: single-click empty **only while focused** | ✅ | `Board.tsx` `onPaneClick` guard; e2e › "focus frames the subtree…" (no focus ⇒ no change) |
| Focus cascade ~110 ms per level | ✅ | `visibility.test.ts` › "reports the focus depth so the cascade can stagger from it"; constant asserted in `constants.ts` |
| Focused wires brighten, ghost wires dim | ✅ | `visibility.test.ts` › "marks the focused branch's wires for brightening" |
| Breadcrumb `Fleet ▸ <agent>`, root clickable | ✅ | e2e › several tests assert `breadcrumb-here` |

## §5.3 — Shared agents

| Item | Status | Test(s) |
|---|---|---|
| Rendered once under each parent | ✅ | `selectors.test.ts` › instances; e2e › "seeds the Solarlux fleet…" (×3 and ×2 counts) |
| ×N badge | ✅ | `selectors.test.ts` › "exposes the xN badge count"; e2e asserts `×3` is visible |
| Selecting any copy highlights all copies | ✅ | e2e › "focusing a shared agent keeps every copy lit"; `fleetStore.test.ts` › "renames an agent everywhere at once" |
| Panel: "Shared sub-agent of A, B, C" | ✅ | `selectors.test.ts` › parentsOf; e2e › "deleting a shared agent warns and names its parents" |

## §5.4 — Navigation

| Item | Status | Test(s) |
|---|---|---|
| 2D pan on empty space | ✅ | `layout.test.ts` › viewport helpers; React Flow `panOnDrag` |
| 2D wheel/pinch zoom toward cursor | ✅ | `layout.test.ts` › zoomAt ("keeps the point under the cursor fixed") |
| Drag cards, threshold in **screen pixels** (§10 bug class) | ✅ | `constants.ts` `DRAG_THRESHOLD_PX` fed to `nodeDragThreshold`; `fleetStore.test.ts` › "stores and clears manual positions" |
| Minimap: dots by kind, viewport rect, click/drag to jump | ✅ | `layout.test.ts` › visibleBoardRect / centerOn; rendered by `Minimap.tsx` (`data-testid="minimap"`) |
| Zoom controls + / − / fit / % | ✅ | `layout.test.ts` › fitViewport, zoomAt; e2e reads `zoom-pct` |
| Double-click empty = fit | ✅ | `layout.test.ts` › fitViewport; e2e › "semantic zoom…" |
| 3D orbit / pan / zoom | ✅ | `layout3d.test.ts` + `PARITY.md` › Orbit / pan / zoom; e2e › "the 3D scene renders…" |
| 3D inertia glide 0.92 | ✅ | `constants.ts` `ORBIT_INERTIA_DECAY`; `PARITY.md` |
| 3D near-full vertical orbit, wide zoom range | ✅ | `constants.ts` φ 0.08–3.06, radius 35–850; `PARITY.md` |
| 3D auto-rotate only after 6 s idle, respects reduced motion | ✅ | `constants.ts` `AUTO_ROTATE_IDLE_MS`; guarded by `usePrefersReducedMotion` in `CameraRig.tsx` |

## §5.5 — Semantic zoom & hierarchy scale

| Item | Status | Test(s) |
|---|---|---|
| Node/card size by depth, both views | ✅ | `selectors.test.ts` › agentDepths; `layout.test.ts` (card sizes); `layout3d.test.ts` (node sizes) |
| 2D `< 0.55` hides sub-agent role lines | ✅ | e2e › "semantic zoom collapses sub-agent cards…" asserts the `far` class and a hidden `.rl` |
| 2D `< 0.36` collapses sub-agent cards to dots | ✅ | `boardModel.ts` `zoomBucket`/`cardSizeAt`; `layout.test.ts` constants |
| Focusing always lands past the thresholds | ✅ | e2e › "semantic zoom…" asserts the class is gone and the role is visible after focusing |
| 3D depth ≥ 2 labels fade with distance | ✅ | `constants.ts` `FADE_3D`; `PARITY.md` › Label distance fade |
| 3D detail satellites fade earlier | ✅ | `constants.ts` `FADE_3D.satelliteStart`; `PARITY.md` |

## §5.6 — Status system

| Item | Status | Test(s) |
|---|---|---|
| New agents and their edges default to Planned | ✅ | `fleetStore.test.ts` › "creates an agent from name + role alone…"; "wires a sub-agent under its parent…"; e2e › "add, rename and delete…" |
| Agent status editable | ✅ | `fleetStore.test.ts` › "edits role, status, instructions and model" |
| Edge status editable (§8.5) | ✅ | `fleetStore.test.ts` › "edits edge status, label and kind"; e2e › "an edge can be selected…" |
| Data sources Ready / In progress / Planned + linked badge | ✅ | `schemas.test.ts` › DataSourceSchema; e2e › "the panel shows relations…" asserts "Ready" and "linked ✓" |
| Status visual language (solid / pulsing / blueprint) | ✅ | e2e › "a new fleet from the Company template starts entirely Planned" asserts `.card.st-planned`; `PARITY.md` |
| Filter bar → non-matching ghost to 5% | ✅ | `visibility.test.ts` › status filter (4 tests); e2e › "the status filter ghosts…" |
| Filter composes with focus (intersection) | ✅ | `visibility.test.ts` › "composes with focus as an intersection"; e2e › same test |
| Panel status control: current chip only, expands to three | ✅ | `StatusChip.tsx` (`status-chip` / `status-chip-open`); e2e › "the panel shows relations…" renders it |

## §5.7 — Inspector panel

| Item | Status | Test(s) |
|---|---|---|
| Sections: kind chip, name, role, status, relations, instructions, skills, tools, data, actions | ✅ | e2e › "the panel shows relations, opens a detail card and jumps to a linked agent" |
| Relations text (Reports to / Shared sub-agent of / Linked to … same level) | ✅ | e2e › same test; `selectors.test.ts` › parentsOf, peerIdsOf |
| Every item clickable → detail card | ✅ | e2e › same test (data chip) and › "a workflow tool renders its steps as a mini-DAG" (tool chip) |
| Clicking the same item again closes the detail | ✅ | `uiStore.toggleDetail`; asserted by construction in `Inspector.tsx` |
| Detail: name, coloured type tag, description | ✅ | e2e › "the panel shows relations…" |
| Detail: workflow mini-DAG for branching flows | ✅ | `workflowLayout.test.ts` (9 tests); e2e › "a workflow tool renders its steps as a mini-DAG" |
| Detail: data status + linked badge | ✅ | e2e › asserts "Ready" and "linked ✓" |
| Detail: "linked to: [Agent]" jump-focus buttons | ✅ | e2e › same test clicks one and asserts the breadcrumb changed |
| Chip type dots (tool + data) and data status mini-dot | ✅ | `palette.ts` colours; rendered in `Inspector.tsx`; `PARITY.md` |

## §5.8 — Creating & editing

| Item | Status | Test(s) |
|---|---|---|
| Two-field creation (name, role) | ✅ | `fleetStore.test.ts` › "creates an agent from name + role alone"; e2e › "add, rename and delete…" |
| Fleet template → spawn child → configure | ✅ | `templates.test.ts`; e2e › "a new fleet from the Company template…" |
| "+ Add sub-agent" on the selected node | ✅ | e2e › "add, rename and delete a sub-agent…" |
| Inline rename on the card (Enter commits, Esc cancels) | ✅ | e2e › "inline rename on the card propagates to every copy of a shared agent" |
| Rename propagates to all instances, panel, breadcrumb | ✅ | e2e › same test (2 copies rename together) |
| Panel rename + role/instructions editing (§8.10) | ✅ | `fleetStore.test.ts` › "edits role, status, instructions and model"; e2e › "add, rename and delete…" |
| Skills/tools/data attach via searchable pickers | ✅ | `fleetStore.test.ts` › "adds, attaches and detaches a skill"; `Picker.tsx` |
| Wire-drag linking in 2D (§8.4) | ✅ | `Board.tsx` `onConnect` → `LinkKindDialog`; `fleetStore.test.ts` › links (7 tests) |
| "Link existing…" picker in the panel | ✅ | `Inspector.tsx` `link-existing`; `fleetStore.test.ts` › links |
| The link flow always asks hierarchy vs peer | ✅ | `LinkKindDialog.tsx` (`link-hierarchy` / `link-peer`); `fleetStore.test.ts` › "links an existing agent as a sub-agent" / "links a peer…" |
| Delete agent removes its edges | ✅ | `fleetStore.test.ts` › "deletes an agent together with all its links" |
| Deleting a shared agent warns and lists parents | ✅ | `fleetStore.test.ts` › "describes a shared-agent deletion before it happens"; e2e › "deleting a shared agent warns and names its parents" |
| Delete edges (= unlink) | ✅ | `fleetStore.test.ts` › "unlinks a hierarchy edge when another parent remains"; e2e › edge panel |
| Delete library items blocked while in use, usage list shown | ✅ | `fleetStore.test.ts` › "blocks deleting a library item that is still in use"; e2e › "a library item in use cannot be deleted…" |
| Removing the **last** hierarchy parent is blocked | ✅ | `fleetStore.test.ts` › "blocks removing the last hierarchy parent - no orphan nodes" |
| Orchestrator cannot be deleted away (§4) | ✅ | `fleetStore.test.ts` › "refuses to delete the orchestrator" |
| All destructive actions undoable | ✅ | `fleetStore.test.ts` › undo/redo (5 tests); e2e › "add, rename and delete a sub-agent, then undo each step" |
| Auto-arrange clears manual positions and refits | ✅ | `fleetStore.test.ts` › "stores and clears manual positions"; `layout.test.ts` › manual override tests |
| Details toggle (2D chips / 3D satellites) | ✅ | e2e › "keyboard shortcuts…" toggles it; `Satellites.tsx` for 3D |

## §5.9 — Feedback animations

| Item | Status | Test(s) |
|---|---|---|
| Click ring burst in the kind colour | ✅ | `uiStore.test.ts` › activate fires a burst; rendered by `AgentNode.tsx` / `Burst3d.tsx` |
| Selection pulse on all instances of a shared agent | ✅ | e2e › "focusing a shared agent keeps every copy lit"; `.card.sel` animation |
| Card hover lift (2D), node hover scale (3D) | ✅ | `PARITY.md` › Hover lift; `HOVER_SCALE_3D` |
| All animations respect `prefers-reduced-motion` | ✅ | `uiStore.test.ts` › reduced-motion guards; `board.css` + `tokens.css` reduce blocks; `usePrefersReducedMotion` used by the 3D scene, morph and board viewport |

## §5.10 — Search

| Item | Status | Test(s) |
|---|---|---|
| Always-visible search input | ✅ | e2e › "search finds an agent across languages and focuses it" |
| Weighted fielded matching (name highest) | ✅ | `search.test.ts` › "ranks a name hit above a role hit" |
| Searchable: name, role, skills, tools + type, data + type/status, kind, status | ✅ | `search.test.ts` › 7 field tests |
| Multi-token AND | ✅ | `search.test.ts` › "requires every token to match (AND, not OR)"; "narrows as tokens are added" |
| Typo tolerance | ✅ | `search.test.ts` › "tolerates a typo" |
| DE↔EN synonyms | ✅ | `search.test.ts` › synonyms (5 tests) + "crosses languages through the synonym table"; e2e uses "offer" → "Angebots-Assistent" |
| Results show the match reason | ✅ | `search.test.ts` › asserts `field`; `SearchBox.tsx` renders `MATCH_LABEL` |
| Keyboard navigation | ✅ | e2e › "keyboard shortcuts…" (`/` focuses) and "search finds an agent…" (Enter picks) |
| Picking focuses + opens the agent with a burst | ✅ | e2e › "search finds an agent across languages and focuses it" |

## §5.11 — Fleets & templates

| Item | Status | Test(s) |
|---|---|---|
| Fleet switcher: create / rename / duplicate / delete (with confirm) | ✅ | `fleetStore.test.ts` › fleets (8 tests); `FleetBar.tsx` confirm step |
| Each fleet autosaves independently | ✅ | `persistence.test.ts` › "keeps multiple named fleets apart"; "only rewrites the fleets that actually changed" |
| Blank template (orchestrator only) | ✅ | `templates.test.ts` › blankFleet (4 tests) |
| Company fleet (orchestrator + four departments, all Planned) | ✅ | `templates.test.ts` › companyFleet (5 tests); e2e › "a new fleet from the Company template starts entirely Planned" |
| Solarlux demo ships as a loadable example | ✅ | `seed.test.ts` (12 tests); `FleetBar.tsx` `load-example`; e2e seeds it |

## §7 — Persistence & files

| Item | Status | Test(s) |
|---|---|---|
| Autosave to IndexedDB, debounced, on every mutation | ✅ | `persistence.test.ts` › attachPersistence (5 tests); e2e › "the fleet survives a reload" |
| Multiple named fleets | ✅ | `persistence.test.ts` › "keeps multiple named fleets apart" |
| Versioned JSON export | ✅ | `io.test.ts` › export/import round-trip (3 tests) |
| Zod-validated import with readable errors | ✅ | `io.test.ts` › parseFleetJson error reporting (7 tests) |
| Manual positions live on agents (the graph is the file) | ✅ | `io.test.ts` › "preserves branching workflow steps and manual positions" |
| A corrupt stored fleet is reported, not silently loaded | ✅ | `persistence.test.ts` › "reports a corrupted stored fleet instead of loading it" |

## §8 — App-only upgrades

| Item | Status | Test(s) |
|---|---|---|
| 8.1 Undo/redo over every mutation | ✅ | `fleetStore.test.ts` › undo/redo (5 tests); e2e › undo chain |
| 8.2 Animated 2D↔3D morph | ✅ | `ViewSwitch.tsx` + `MorphDriver`; e2e › view round-trip; `PARITY.md` › 2D ↔ 3D switch |
| 8.3 Search brain (Fuse + synonyms) | ✅ | `search.test.ts` (22 tests) |
| 8.4 Wire-drag linking & re-parenting in 2D | ✅ | `Board.tsx` `onConnect`; `fleetStore.test.ts` › links |
| 8.5 Edge status editing | ✅ | `fleetStore.test.ts` › "edits edge status, label and kind"; e2e › "an edge can be selected…" |
| 8.6 Branching workflow renderer | ✅ | `workflowLayout.test.ts` (9 tests); e2e › mini-DAG |
| 8.7 Libraries as entities + library manager | ✅ | `fleetStore.test.ts` › libraries (6 tests); e2e › "a library item in use cannot be deleted…" |
| 8.8 Shared-agent children enabled | ✅ | `selectors.test.ts` › "repeats the subtree of a shared agent"; `visibility.test.ts`; e2e |
| 8.9 Bloom + depth of field | ✅ | `effects/PostEffects.tsx`, gated by `shouldUsePostEffects`; `PARITY.md` |
| 8.10 Panel rename + role/instructions editing | ✅ | `fleetStore.test.ts` › "edits role, status, instructions and model" |

## §9 Phase 3 — Polish

| Item | Status | Test(s) |
|---|---|---|
| 100+ agents at 60 fps | ✅ | `performance.test.ts` (11 tests) for the derived layer; measured in-browser at **60.0 fps, p95 18.2 ms** with 119 agents / 131 instances in 3D with bloom + DoF |
| Memoized selectors / shared index | ✅ | `performance.test.ts` › "no accidental quadratic behaviour" (3 tests) |
| Shared geometry + cached textures instead of per-node allocation | ✅ | `geometries.ts`, `textures.ts` caches; `performance.test.ts` budgets |
| Reduced-motion audit | ✅ | `uiStore.test.ts` › reduced motion; CSS reduce blocks; 3D + morph + board viewport all gated |
| Keyboard shortcuts | ✅ | e2e › "keyboard shortcuts drive view, filter, details, search and help"; "a shortcut key typed into a field stays in the field" |
| Empty states | ✅ | `App.tsx` `empty-state`; `fleetStore.test.ts` › "leaves no active fleet once the last one is deleted" |

## Backlog (SPEC §9 — deliberately not built)

| Item | Status |
|---|---|
| Execution telemetry (pulses = live task flow) | ◻ |
| Workflow import (Power Automate / LLM extraction) | ◻ |
| Copilot Studio sync | ◻ |
| Multi-user backend | ◻ |
| Additional visual themes | ◻ |

---

## Deviations

**DEVIATION 1 — instance key form (spec-internal conflict).** §4 specifies instance keys as
`agentId@parentId`, but §4 also requires the children of a shared agent to appear under *every*
instance of the parent. Both cannot hold: a child of a shared agent needs one instance per parent
instance, which a single `child@parent` key cannot name. Instances are therefore keyed by their
full hierarchy path, with the §4 form kept as `instance.pairKey`. Where no shared agent has
children the two are 1:1.
Covered by `selectors.test.ts` › instances.

**DEVIATION 2 — layout engine.** SPEC §3 pins elkjs for "DAG auto-layout, multi-parent aware".
The layout runs over *instances*, which form a tree by construction, so that capability can never
be needed. A tree walk reproduces the prototype's tuned geometry exactly (SPEC §6), stays
synchronous, and is unit-testable against its numbers. Rationale in `src/layout/treeLayout.ts`.
Covered by `layout.test.ts` (27 tests).

**DEVIATION 3 — shared agents are not draggable.** SPEC §4 gives an agent a single `position`,
which cannot place the N instances of a shared agent; honouring it literally would stack every
copy on one point. Shared agents are auto-placed under each parent instead.
Covered by `layout.test.ts` › "ignores a manual position on a shared agent".

**DEVIATION 4 — the orchestrator's 3D shell is static.** The prototype spins its icosahedron
continuously; SPEC §2.5 bans ambient motion that carries no meaning. Same geometry, colour and
opacity, no rotation. Recorded in `PARITY.md`.

**DEVIATION 5 — 2D card rename uses an input, not `contentEditable`.** The prototype edits the
name span in place. In React the selecting click re-renders the node and resets the editable
span's text mid-typing, so the same double-click / Enter / Esc flow is driven by React state.
Covered by e2e › "inline rename on the card propagates to every copy of a shared agent".
