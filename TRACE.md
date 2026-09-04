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

## Robustness & authoring (post-Phase-3 hardening)

| Item | Status | Test(s) |
|---|---|---|
| A save failure is reported, not swallowed | ✅ | `persistence.test.ts` › "calls onError and keeps the fleet queued"; "reports a failed delete" |
| A failed save is retried on the next flush | ✅ | `persistence.test.ts` › "calls onError and keeps the fleet queued" |
| A second tab editing the same fleet is announced | ✅ | `persistence.test.ts` › cross-tab awareness (5 tests) |
| A render crash offers reload + rescue export | ✅ | `ErrorBoundary.tsx` (`crash-screen`), wired in `main.tsx` |
| WebGL context loss is recovered and explained | ✅ | `useContextLoss.ts`; `Scene.tsx` (`context-lost`) |
| Tool description, type and workflow steps are editable | ✅ | `ToolEditor.tsx` (`tool-editor`, `wf-step`, `wf-new-step`); `workflowLayout.test.ts` covers the layout it feeds |
| Skill description and instructions are editable | ✅ | `LibraryManager.tsx` (`skill-editor`, `skill-instructions`) |
| Data source type, status, `linked` and `ref` are editable | ✅ | `LibraryManager.tsx` (`data-editor`, `data-linked`) |
| `Agent.model` (provider / name / temperature) is editable | ✅ | `Inspector.tsx` (`model-editor`, `model-provider`); `fleetStore.test.ts` › "edits role, status, instructions and model" |
| Board cards are keyboard reachable and labelled | ✅ | `AgentNode.tsx` `role=button` + `aria-label` + arrow-key walk; verified in-browser via the accessibility tree |

## Vision fleet (`agenten_02_vision.pdf`)

| Item | Status | Test(s) |
|---|---|---|
| Structure: orchestrator + five specialist columns | ✅ | `visionFleet.test.ts` › "has the orchestrator and the five specialist columns" |
| Statuses derived from the "heute" legend | ✅ | `visionFleet.test.ts` › "carries the roadmap statuses"; "carries the per-source statuses" |
| Sorakel modelled as the orchestrator's LLM | ✅ | `visionFleet.test.ts` › "models Sorakel as the orchestrator's LLM, not as an agent" |
| Dataverse & SharePoint modelled as shared substrate | ✅ | `visionFleet.test.ts` › "models Dataverse & SharePoint as the substrate" |
| "Kontext für alle" shared by every agent | ✅ | `visionFleet.test.ts` › "gives every agent the shared Unternehmenskontext" |
| Loadable from the fleet menu | ✅ | `FleetBar.tsx` `load-vision` |

## Catalog + Copilot Studio import (beyond SPEC v1)

| Item | Status | Test(s) |
|---|---|---|
| Create an agent with no fleet involved | ✅ | `catalog.test.ts` › "creates an agent from a name alone"; e2e › "the catalog creates an agent with no fleet involved" |
| Create skills on their own | ✅ | `catalog.test.ts` › "creates skills, tools and data sources"; e2e › "the catalog builds a skill and a branching workflow tool" |
| Create workflow tools on their own, with steps | ✅ | e2e › same test (adds two steps through the tool editor) |
| Upload a Copilot Studio `.yaml` export | ✅ | `copilotImport.test.ts` (17 tests, against a real 2298-line export); e2e › "a Copilot Studio export becomes an agent" |
| …parsed into agent + skills + flows + knowledge | ✅ | `copilotImport.test.ts` › the Objektvertrieb export (8 tests) |
| …the file is kept and downloadable, byte-for-byte | ✅ | `catalog.test.ts` › "keeps the uploaded file byte-for-byte"; e2e asserts the download |
| Re-importing the same agent replaces it | ✅ | `catalog.test.ts` › "replaces the same agent on re-import instead of duplicating it" |
| A non-Copilot file is refused readably | ✅ | `copilotImport.test.ts` › rejecting the wrong file (3 tests); e2e › "a file that is not a Copilot export" |
| Never invents workflow steps the export lacks | ✅ | `copilotImport.test.ts` › "does NOT invent workflow steps the export does not contain" |
| Add a catalog agent to a fleet with its dependencies | ✅ | `catalog.test.ts` › adding a catalog agent to a fleet (8 tests) |
| The fleet stays self-contained and valid (SPEC §7) | ✅ | `catalog.test.ts` › "leaves the fleet valid and self-contained" |
| Adding never creates a second orchestrator (SPEC §4) | ✅ | `catalog.test.ts` › "never creates a second orchestrator" |
| Adding is undoable (SPEC §8.1) | ✅ | `catalog.test.ts` › "is undoable like any other fleet mutation" |
| The catalog persists across reloads | ✅ | e2e › "the catalog survives a reload" |
| The catalog stays out of the fleet's undo history and exports | ✅ | separate store + separate IndexedDB object store (DB v2) |

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

**DEVIATION 6 — `DataSourceType` gains `file`, `DataSource` gains `description`.** SPEC §4 lists
three data-source types and no description. A Copilot Studio skill folder ships templates, images
and JSON schemas — genuinely data the agent reads, and none of them `md`, Dataverse or SharePoint —
and a knowledge source carries prose saying when it is the right source to consult. §4 calls the
type enum extensible; forcing a `.pptx` into `md` would misreport where the data lives, and dropping
the prose would lose the only text that explains the source.
Covered by `copilotImport.test.ts` › "types markdown as md and everything else as file";
"reads the SharePoint knowledge source under its own name".

**DEVIATION 7 — card chips are grouped into collapsible sections, and include data sources.**
`reference/prototype.html:787` prints skills and tools as one unheaded chip row and never shows
data sources on a card. An imported agent carries up to 19 data chips, which made the card
unreadable, so each kind gets a header with its count and starts collapsed — nothing is hidden,
the counts are always visible. Section state is view state: outside undo, outside the document.
Covered by `uiStore.test.ts` › "collapsible card sections" (5 tests).

**DEVIATION 8 — card size by depth is a 1.5× geometric series.** The prototype's table was
216/182/126/126 (ratios 1.19, 1.44, 1.00). Every level is now exactly 50% larger than the level
below it — box, padding and text together — so hierarchy is legible from size alone. Depth 1 is
the anchor, so the level most specialists sit at is unchanged. Row spacing scales by the same
step, otherwise the larger depth-0 card overlaps the row beneath it. The 3D spheres and their
labels follow the same rule.
Covered by `layout.test.ts` › "hierarchy sizing (1.5x per level)" (4 tests);
"rows leave room for the cards they hold" (2 tests).

---

## Copilot Studio import — what is read, and what is deliberately not

| Export element | Becomes | Test |
|---|---|---|
| `entity.displayName` / `schemaName` | Agent name, source fingerprint | `copilotImport.test.ts` › "reads the agent identity" |
| `InlineAgentSkill` × N | Skill + instructions | › "reads all seven agent skills with their instructions" |
| `skill.md` / `AGENT_INSTRUCTIONS.md` resource | Skill instructions, preferred over a bundle marker | › "takes the instructions from skill.md, not the bundle marker" |
| `CloudFlowDefinition` × N | Tool (`workflow`) + input/output signature | › "reads all eight Power Automate flows as workflow tools" |
| `dialog.resources[]` scripts | Tool (`python`) carrying its source, sized and described from its docstring | › "imports the Python script as a tool, with its source" |
| `dialog.resources[]` others | DataSource (`md` / `file`), path kept as `ref` | › "imports every other skill resource as a data source" |
| `KnowledgeSourceComponent` | DataSource (`sharepoint`) under its own display name and description | › "reads the SharePoint knowledge source under its own name" |
| `GlobalVariableComponent` groups | Saved parameters on the owning tool, **and** a DataSource per Dataverse table / SharePoint list reached | › "reads the Dataverse table the agent queries through"; "reads both SharePoint lists behind the Objektportal connection" |
| A variable group matching no tool | Kept as a data source, reported in the warnings | › "says so when saved settings belong to no tool in the export" |
| Flow *internal steps* | **Not invented** — the export does not contain them | › "does NOT invent workflow steps the export does not contain" |
| GUIDs, `managedProperties`, `auditInfo`, `solutionId`, base64 icons, `EnvironmentVariableDefinition` | Not modelled; the original file is stored verbatim and stays downloadable | `catalog.test.ts` › "keeps the uploaded file byte-for-byte so it can be downloaded back" |

**DEVIATION 9 — data sources carry an owner and a requirement, and "Data prep" reads the fleet
backwards.** SPEC §1 calls the board a roadmap and §5.6 gives every component a status, but nothing
in the spec says *who* turns Planned into Live or what finished looks like. `DataSource` gains
optional `owner` and `requirement`, and a new view groups every source by the party that prepares
it, shows the requirement, and names the agents blocked without it. `owner` is free text because
the party who prepares data is usually a human team, not an agent in any fleet.

| Item | Status | Test(s) |
|---|---|---|
| Sources grouped by the party that owes them | ✅ | `selectors.test.ts` › "groups sources by the party that owes them" |
| Only non-Live counts as outstanding | ✅ | › "counts only what is not Live as outstanding" |
| Biggest backlog first | ✅ | › "puts whoever is holding up the most at the top" |
| Agents waiting on a source are named | ✅ | › "names the agents that are waiting on each source" |
| Unclaimed work gathered last | ✅ | › "collects unclaimed sources last, so they read as a prompt to assign them" |
| Casing / stray spaces do not split a team | ✅ | › "does not split one team in two over casing or stray spaces" |
| Blank owner means no owner | ✅ | › "treats a blank owner as no owner at all" |
| Known owners offered as suggestions | ✅ | › "offers every owner already in use as a suggestion, deduplicated" |
| Record a requirement, read it back as an obligation | ✅ | e2e › "data prep says who owes each source and who is blocked without it" |
| Jump from an obligation to the waiting agent | ✅ | e2e › "data prep jumps from an obligation to the agent waiting on it" |
| Outstanding count surfaced in the fleet menu | ✅ | e2e › "the fleet menu counts what is still to prepare" |

**Bug fixed alongside it:** `SkillFields` / `ToolFields` / `DataFields` were declared inside
`LibraryManager`, so every render gave them a new component identity and React remounted the
editor. Committing one field wiped whatever had just been typed into the next. They are now
top-level components reading the store directly.

**DEVIATION 10 — 3D satellites are bundled and blossom on click.** The prototype gives every
skill and tool its own satellite and draws no data sources at all. With real content that is
unreadable — PPT Buddy carries 19 data sources. One satellite per kind now orbits the agent
carrying its count; clicking it grows its members into concentric rings and clicking again folds
them back. The bundle takes the colour of its commonest member, so no new colour token is
invented. Open/closed state is the same `openSections` the 2D card uses, so the two views never
disagree (SPEC §2.1, §5.1).

| Item | Status | Test(s) |
|---|---|---|
| One point per member | ✅ | `blossom.test.ts` › "places one point per member" |
| Small bundles stay on one ring | ✅ | › "keeps a small bundle on a single ring" |
| 19 members stay compact across rings | ✅ | › "starts a wider ring once the first is full, so 19 stays compact" |
| Outer rings drop so they do not overlap | ✅ | › "drops each outer ring so rings do not overlap head-on" |
| Members never collide | ✅ | › "never puts two members in the same place" |
| Bundle colour comes from its members | ✅ | › "takes the commonest member colour…"; "invents no colour of its own" |
| Section state shared by both views | ✅ | `uiStore.test.ts` › "collapsible card sections" (5 tests) |

**DEVIATION 11 — an agent's level is editable from the panel.** SPEC §5.7 lists the panel's
fields and the kind is not among them; it was render-only, so an agent could only be a department
or a sub-agent by accident of how it was created. A department that turns out to be a sub-agent of
two others had no way to say so. The chip is disabled on the orchestrator (SPEC §4 allows exactly
one) and stays enabled on a shared agent, which is precisely when it is needed.

| Item | Status | Test(s) |
|---|---|---|
| Level changes and persists | ✅ | e2e › "an agent can be moved between levels from the panel" |
| Orchestrator cannot be demoted here | ✅ | e2e › "the orchestrator cannot be demoted from the panel (SPEC 4: exactly one)" |
| Shared badge and level shown together | ✅ | e2e › "a shared agent shows its level and its shared badge side by side" |

**Vision fleet re-shaped (from the user's own architecture).** PPTX-Creator is a `worker`
commissioned by Objektvertrieb and Controlling — two parents, so two instances of one
agent (SPEC §2.2, §2.3). Objektvertrieb gains two Angebotsprozess sub-agents,
Leistungsverzeichnis-Decoder and Kalkulationsagent. Holzoffensive Buddy drops from a department
to a sub-agent of Controlling, sitting beside the deck builder rather than above it,
with a **peer** hand-off between the two (SPEC §5.2: a peer link never expands focus, so it adds
no instance).
Covered by `visionFleet.test.ts` › "has the orchestrator, nine departments and five sub-agents";
"hangs the deck builder off both departments that commission decks";
"puts the Angebotsprozess sub-agents under Objektvertrieb";
"puts the Holzoffensive answers beside the deck builder, not above it".

**The department list follows the real org chart.** Business Development is not a Solarlux
department; Controlling is. The node was renamed and — by the user's decision — kept its whole
subtree, so the market work, the Holzoffensive answers and the second claim on the deck builder
moved with it and nothing was lost. Finanzen, Forschung & Entwicklung, IT and Produktion join
Objektvertrieb, Marketing and Service at level 2, all of them bare: the house rule is that level 2
names an area of the business and the work lives one level below (as Objektvertrieb/Projektsuche
already does). The two department SharePoint sites the request named are recorded as data that
**exists but is not linked** — `status: 'live'`, `linked: false` — which is precisely the state a
site is in before an agent is pointed at it.

| Item | Status | Test(s) |
|---|---|---|
| Nine departments, in org-chart order | ✅ | `visionFleet.test.ts` › "has the orchestrator, nine departments and five sub-agents" |
| Controlling kept Business Development's subtree | ✅ | › "hangs the deck builder off both departments that commission decks"; "puts the Holzoffensive answers beside the deck builder, not above it" |
| The added departments carry no work of their own | ✅ | › "leaves the departments added for the org chart empty of work" |
| Department sites exist but are not linked | ✅ | › "records the department sites that exist but that nobody reads yet" |
| Every department still reports to the orchestrator | ✅ | › "every department reports to the orchestrator and the edge says \"delegiert\"" |

**Nearest-instance peer wiring (bug fix).** A peer edge names two *agents*, but a shared agent is
drawn once under every parent (SPEC §2.3), so the wire has to choose a copy. It took
`firstInstanceOfAgent` — whichever copy the pre-order walk reached first — which drew a link
right across the board to a copy three columns away instead of the one standing beside it. A peer
wire now reaches the copy sharing the deepest common ancestor with its source, and repeats once
per copy of the source so every drawn copy has its own nearest peer. Ties fall back to depth then
key order, so the choice is deterministic. Hierarchy wires were already exact — they are derived
per parent-instance — and are unchanged.

| Item | Status | Test(s) |
|---|---|---|
| Links to the copy under the same parent | ✅ | `wires.test.ts` › "links to the copy under the same parent, not the first one walked" |
| One wire per copy of the source | ✅ | › "still draws exactly one wire per copy of the source" |
| A shared source gets one nearest peer per copy | ✅ | › "gives every copy of a shared source its own nearest peer" |
| Deterministic on ties | ✅ | › "is deterministic when two copies are equally close" |
| Never links an instance to itself | ✅ | › "never links an instance to itself" |
| Wire ids stay unique | ✅ | › "keeps peer wire ids unique so React never sees a duplicate key" |
| Hierarchy wires still repeat per parent | ✅ | › "draws the shared agent's incoming wire once per copy" |

**Level 2 is organisational (from the user's architecture).** A department names an area of the
business; the agents that do the work sit below it. `Objektvertrieb` was both at once — a
second-level node carrying the whole Copilot Studio import — so it is split: the department keeps
the name, the orchestrator edge and no skills, and everything it used to *do* becomes a sub-agent
called `Projektsuche`. The three sub-agents already under it move up to sit beside Projektsuche,
so every worker is one level below its department rather than two.
Covered by `visionFleet.test.ts` › "leaves the Objektvertrieb department empty and gives its
content to Projektsuche"; "keeps every second-level node a department";
"has the orchestrator, three departments and five sub-agents".

**DEVIATION 12 — the 3D scene is compact, and "fit" actually fits.** Two separate faults made the
scene sprawl. The layout spaced siblings by a constant *angle*, so the same fan covered far more
ground the further out it sat — a four-child fan at depth 2 spanned 234 world units. A fan is now
measured in world units between siblings and converted to an angle by the ring's radius, so a wide
fan far from the centre stays as tight as the same fan near it; ring growth also drops from 85 to
55 per level. Separately, framing was `clamp(radius * 2.3 + 70, 120, 340)` — a rule of thumb with
a ceiling below what this fleet needs — and the full-fleet view never measured the fleet at all,
moving instead to a fixed pose. Distance is now solved from the camera's field of view, and the
full fleet is framed from its own bounding sphere like any focused subtree.

Measured on the vision fleet: overall radius 247.3 → 191.9, Objektvertrieb's four-child fan
234.5 → 135.3, Business Development's two-child fan 125.4 → 52.3. The department ring is
deliberately unchanged at 224.8 — that level never sprawled.

| Item | Status | Test(s) |
|---|---|---|
| A fan stays as wide far out as near | ✅ | `layout3d.test.ts` › "keeps the same fan roughly as wide when it sits further out" |
| Siblings sit about `siblingArc` apart | ✅ | › "spaces siblings by about siblingArc on a wide ring" |
| One fan never exceeds the cap | ✅ | › "never lets one fan exceed the hard cap" |
| A lone child sits straight out | ✅ | › "puts a lone child straight out from its parent" |
| The department ring is untouched | ✅ | › "holds the department ring where it was — that level never sprawled" |
| Fit distance solved from the lens | ✅ | › "puts the sphere edge exactly on the view edge at margin 1" |
| Fit scales with the fleet | ✅ | › "scales linearly with the sphere, so a bigger fleet is never cropped" |
| The whole vision fleet is framed | ✅ | › "frames the whole vision fleet inside the orbit limit" |

**DEVIATION 13 — one line per level, in both views.** The prototype offset every odd sibling: 36px
down in 2D (from depth 2), 26 units further out in 3D. Both read as an up-and-down jumble, which
is the opposite of what a level is. Both are gone, and the constants with them — the row spacing,
slot width and `siblingArc` already keep same-level nodes apart. In 2D a depth now has exactly one
`y`; in 3D one ring at one height.

**Two-axis camera fit.** `fitDistance` originally solved from the vertical field of view only.
A perspective camera states its FOV vertically, so in a viewport taller than it is wide the
*horizontal* view is the narrower one and the fleet spilled out of the sides. Both axes are now
checked and the narrower governs.

**Shorter links.** Link length is `hypot(radiusPerDepth, yPerDepth)`, so the wires were shortened
by shortening the level steps rather than touching the wires: `baseRadius` 95 → 78,
`radiusPerDepth` 55 → 40, `yPerDepth` 62 → 48. Measured on the vision fleet: links 64.8–91.6
(mean 77.2) against 83–113 before, and the overall radius 191.9 → 131.0.

| Item | Status | Test(s) |
|---|---|---|
| Every 2D card of a level shares one row | ✅ | `layout.test.ts` › "puts every card of a level on exactly one line" |
| Levels stay far apart, so one row per depth is unambiguous | ✅ | › "separates the levels themselves, so one line per depth is unambiguous" |
| Every 3D node of a level shares one ring and height | ✅ | `layout3d.test.ts` › "puts every node of a level on one ring, at one height" |
| A tall viewport backs the camera off further | ✅ | › "backs off further when the viewport is taller than it is wide" |
| A wide viewport is governed by the vertical FOV | ✅ | › "is governed by the vertical field of view once the viewport is wider than tall" |
| The sphere fits on whichever axis is narrower | ✅ | › "fits the sphere on the narrow axis, whichever that is" |
| A zero-height viewport does not divide by nothing | ✅ | › "survives a zero-height viewport rather than dividing by nothing" |

**DEVIATION 14 — notes on every component.** SPEC §4 gives an agent `instructions` and gives
skills/tools/data a `description`, but both are copy the agent or the reader consumes. Neither is
a place to write *about* a component: an open question, a decision and why, who to ask, what has
to happen before it can go Live. All four kinds gain an optional `notes`, written in the panel
where that kind is edited, quoted in its detail card, and marked with a dot in the library list so
a note can be found again without opening every row. Notes are document data — persisted,
exported and undoable — and are never sent anywhere.

| Item | Status | Test(s) |
|---|---|---|
| Optional on all four kinds | ✅ | `schemas.test.ts` › "is optional on all four kinds, so nothing existing breaks" |
| Round-trips on all four kinds | ✅ | › "round-trips on all four kinds" |
| Keeps line breaks | ✅ | › "keeps line breaks, because a note is prose not a label" |
| Distinct from an agent's instructions | ✅ | › "is separate from an agent's instructions" |
| Written on an agent and autosaved | ✅ | e2e › "a note can be written on an agent and survives a reload" |
| Marked in the library and shown in the detail card | ✅ | e2e › "a note on a library item is marked in the list and shown in its detail card" |
| Undoable | ✅ | e2e › "notes are undoable like any other edit" |

**3D degrades gracefully when WebGL is unavailable.** SPEC §5.4 assumes the 3D scene can be
drawn. When a WebGL context cannot be *created* — hardware acceleration off, a remote desktop
session, a GPU driver that just crashed — three.js throws from inside canvas creation, and that
surfaces as an unhandled promise rejection: React's error boundary never sees it and the Suspense
fallback never resolves. The view sat on "Loading 3D space…" for ever with no explanation.
Availability is now checked before the canvas is mounted, and the view explains what happened and
what to try, noting that the 2D board carries the same fleet. Distinct from `useContextLoss`,
which handles a context that existed and went away.

| Item | Status | Test(s) |
|---|---|---|
| Reports ok on a usable context, and frees the probe | ✅ | `webgl.test.ts` › "reports ok when a context comes back" |
| Reports unavailable when every request returns null | ✅ | › "reports unavailable when every context request returns null" |
| Reports unavailable when getContext throws | ✅ | › "reports unavailable when getContext throws instead of returning null" |
| Falls back webgl2 → webgl → experimental-webgl | ✅ | › "falls back through webgl2, webgl and experimental-webgl" |
| Survives a context with no lose-context extension | ✅ | › "survives a context with no WEBGL_lose_context extension" |

**DEVIATION 16 — Data, not "data sources": a thing that HAS a source.** The boxes of DEVIATION 15
are reverted; this replaces them, keeping data an id-referenced library so the same item can be
linked to several agents rather than being trapped in one panel.

- **The source may be a department.** `DataSourceTypeSchema` gains `'department'`: product data
  comes from Produktmanagement long before it lives in Dataverse, and without this such data has
  to be mislabelled as a file or as a SharePoint site it is not in yet.
- **Existing, or owed by someone.** `DATA_SOURCE_STATUS_LABELS` now reads Existing / Being
  prepared / To be provided. The same three-state enum underneath, so the filter bar and every
  status control keep working — only the words change, and only for data.
- **Ansprechpartner.** `contact` beside `owner`: a department is not someone you can chase.
- **Nesting.** `parentId`, not an inline `children` array, because data stays a shared library —
  one item may be attached to several agents, so it cannot be owned by one place in a tree.
- **Linking a parent brings its contents.** `dataForAgent` expands a reference to include every
  descendant, so an agent linked to "Produktdaten" gets "Bilder" without attaching it by hand.
- **A real filter.** "Provided by" sits beside the status chips and composes with it and with
  focus by intersection. It reaches through nesting: an agent linked only to the parent still
  matches the provider of a part.
- **Inheritance is visible, not just true.** The panel, the 2D card and the 3D bundle all read
  through `dataForAgent`, so a part that arrived inside a box is listed where the agent is —
  dashed and without a ✕, since detaching a part the agent never attached would only bring it
  straight back. Data prep counts the same way: an inherited part names the agents blocked by it.

| Item | Status | Test(s) |
|---|---|---|
| A department is a valid source | ✅ | `dataNesting.test.ts` › "accepts a department as the source" |
| Provider and Ansprechpartner recorded, both optional | ✅ | › "records who provides it and who to ask"; "leaves provider and contact optional…" |
| Roots, children, descendants | ✅ | › "lists only top-level data as roots"; "finds direct children and all descendants" |
| A missing parent is shown, not hidden | ✅ | › "shows an item whose parent is missing at the top rather than hiding it" |
| Descendant walk cannot hang on a cycle | ✅ | › "does not hang on a nesting cycle" |
| Integrity rejects missing parent / self / cycle | ✅ | › "integrity rejects broken nesting" (4 tests) |
| Linking a parent brings its children, without duplicates | ✅ | › "gives an agent the whole box from one reference"; "never lists the same item twice…" |
| Providers listed once, case- and space-insensitive | ✅ | › "lists every provider once, in name order"; "does not split one provider…" |
| A parent matches a part's provider | ✅ | › "matches a parent when a part of it is owed…" |
| Data labels speak of provision, agents of readiness | ✅ | `schemas.test.ts` › "labels agents by readiness and data by provision" |
| One enum underneath, so controls keep working | ✅ | › "shares one enum, so every status control keeps working" |
| Filter lights only those waiting on that provider | ✅ | `visibility.test.ts` › "lights only the agents waiting on that provider" |
| Filter reaches through nesting | ✅ | › "reaches through nesting — a parent box counts for the child's provider" |
| Filter composes with status by intersection | ✅ | › "composes with the status filter by intersection" |
| A wire goes with a hidden endpoint | ✅ | › "drops a wire when the provider filter hides an endpoint" |
| Wires still filter by their OWN status (SPEC §5.6) | ✅ | › "filters wires by their own status, not their endpoints" |
| Nesting, cycle and delete guards in the store | ✅ | `fleetStore.test.ts` › "data nesting through the store" (8 tests) |
| Source, department, nesting and the delete guard in the UI | ✅ | e2e › "data has a source, can be a department, and nests inside other data" |
| The filter, end to end | ✅ | e2e › "the provider filter shows only what a department still owes" |
| Inheritance reaches the panel, the card and the 3D bundle | ✅ | e2e › "linking a box gives the agent what is inside it" |
| An inherited part blocks whoever waits on the box | ✅ | `dataNesting.test.ts` › "names the agent under the part, not only under the box it references" |
| An item nobody reaches has nobody waiting | ✅ | › "leaves an item nobody reaches with nobody waiting" |
| The Ansprechpartner reaches Data prep | ✅ | › "carries the Ansprechpartner through to the obligation" |

**Data prep answers "prepared by whom?" where the question is asked.** Assigning a department
used to mean leaving the view and finding the item in Libraries, so in practice nothing was ever
assigned and every obligation sat under Unassigned. Each item now carries a **Provided by** select
and, once assigned, an **Ansprechpartner** field. `providerOptions` offers every department in the
fleet — not only the names somebody has already typed, because a department that owes nothing yet
still has to be askable — plus any provider already named, so nothing recorded is lost.

| Item | Status | Test(s) |
|---|---|---|
| Every department is offered, even one that owes nothing | ✅ | `dataNesting.test.ts` › "offers every department, including those that owe nothing yet" |
| Providers that are not departments survive | ✅ | › "keeps providers that are not departments, so nothing already named is lost" |
| A name appears once, whatever its casing | ✅ | › "lists a name once when a department is also a named provider" |
| Assigning from Data prep moves the item and sticks | ✅ | e2e › "a department can be assigned to a data item from Data prep" |

**A fresh install opens the architecture, not the demo.** The Vision fleet is what this app exists
to show, so a new machine — a colleague's browser, a cleared profile — lands on it. The demo fleet
stays one click away in the fleet menu and in the empty state, because it is what exercises the
app's features (shared agents ×3, a branching workflow tool, four departments of workers).

| Item | Status | Test(s) |
|---|---|---|
| First run seeds the Vision fleet | ✅ | e2e › "a fresh install opens the Solarlux Vision fleet, not the demo" |
| The demo is still reachable and complete | ✅ | e2e › every other test — `freshApp` loads it through the menu |

**DEVIATION 17 — a 3D branch owns a wedge, replacing the fixed fan cap.** `spreadMax` capped every
fan at 1.15 rad regardless of the room its parent actually had. With four departments that was
narrower than a department's share of the circle, so nothing collided; with nine it was nearly
twice as wide, and neighbouring departments' fans interleaved — spheres and labels overlapping on
screen. Each branch now owns a disjoint wedge: the root's children tile the full circle, and below
that a node's children tile their parent's wedge, each taking a share proportional to the leaves
beneath it. Compactness is preserved by drawing a fan only as wide as its members need
(`siblingArc` apart) and by growing a ring outward only when the tightest pair on it would
otherwise be closer than one node needs. A small fleet lays out exactly where it always did.

| Item | Status | Test(s) |
|---|---|---|
| A fan never leaves its parent's wedge | ✅ | `layout3d.test.ts` › "never lets one fan spill out of the wedge its parent owns"; "keeps every fan inside its own wedge, so nine departments do not collide" |
| The circle is handed out once and in full | ✅ | › "gives a branch with more under it a wider slice of the circle" |
| Nine departments stay a department apart | ✅ | › "keeps neighbouring departments at least a department apart" |
| No two sub-agents collide either | ✅ | › "keeps every pair of sub-agents apart too" |
| A small fleet is where it always was | ✅ | › "fans departments around the orchestrator at the base radius"; "holds the department ring where it was — that level never sprawled"; "puts every node of a level on one ring, at one height" |
| A fan stays as wide when it sits further out | ✅ | › "keeps the same fan roughly as wide when it sits further out"; "spaces siblings by about siblingArc on a wide ring" |
