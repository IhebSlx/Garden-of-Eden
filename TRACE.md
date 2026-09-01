# TRACE.md — SPEC item → test mapping

SPEC §10: *"maintain `TRACE.md` mapping every §5 item → its test(s). A §5 item without a test
is not done."*

Status legend: **✅ done** (implemented + tested) · **◻ Phase 1/2/3** (not yet implemented —
the phase that owns it). A row is only ✅ when a named test asserts the behaviour.

Test files live in `tests/unit/`; Playwright specs land in `tests/e2e/` from Phase 1.

---

## §4 — Domain model & derived rules

| Item | Status | Test(s) |
|---|---|---|
| Status enum + display labels (agents vs data sources) | ✅ | `schemas.test.ts` › Status |
| Skill schema | ✅ | `schemas.test.ts` › SkillSchema |
| Tool schema, required description | ✅ | `schemas.test.ts` › ToolSchema › "requires a description" |
| Tool workflow only when `type === 'workflow'` | ✅ | `schemas.test.ts` › "allows workflow steps only on tools of type workflow" |
| Workflow branching (`steps[].next[]`, mini-DAG) | ✅ | `schemas.test.ts` › "accepts a branching workflow"; "rejects a step pointing at a step that does not exist" |
| DataSource schema, `linked`, `ref` | ✅ | `schemas.test.ts` › DataSourceSchema |
| Agent schema; `'shared'` is **not** a kind (§8) | ✅ | `schemas.test.ts` › "rejects shared as a kind" |
| Agent optional model config + manual position | ✅ | `schemas.test.ts` › "accepts optional model config and manual position" |
| Edge schema (hierarchy / peer, status, label) | ✅ | `schemas.test.ts` › EdgeSchema |
| Fleet schema + `schemaVersion` pinning | ✅ | `schemas.test.ts` › FleetSchema |
| `isShared` ⇔ ≥ 2 hierarchy parents | ✅ | `selectors.test.ts` › isShared (3 tests) |
| `instances` = one per (agent, hierarchy-parent) | ✅ | `selectors.test.ts` › "renders one instance per (agent, hierarchy-parent) pair" |
| Parentless agent → one root instance | ✅ | `selectors.test.ts` › "gives a parentless agent exactly one root instance" |
| Children of a shared agent repeat under every parent instance | ✅ | `selectors.test.ts` › "repeats the subtree of a shared agent under every parent instance" |
| Instance keys unique + path-encoded (see DEVIATION) | ✅ | `selectors.test.ts` › "keys each instance by its full hierarchy path"; "encodes ids so a separator inside an id cannot forge a key" |
| `visibleSet` = focus + hierarchy descendants (BFS) | ✅ | `selectors.test.ts` › visibleSet (6 tests) |
| Validation: exactly one orchestrator | ✅ | `integrity.test.ts` › "requires exactly one orchestrator" (×2) |
| Validation: no hierarchy cycles | ✅ | `integrity.test.ts` › "flags a hierarchy cycle and names the loop" |
| Validation: edge endpoints exist | ✅ | `integrity.test.ts` › "flags an edge pointing at a missing agent" |
| Validation: referenced library ids exist | ✅ | `integrity.test.ts` › "flags a reference to a library item that does not exist" |
| Cycle-safety of every selector (no hang on bad data) | ✅ | `selectors.test.ts` › "terminates on a hierarchy cycle"; visibleSet › "is cycle-safe" |

## §5 — Interaction specification

### 5.1 Views & switching
| Item | Status | Test(s) |
|---|---|---|
| 2D/3D toggle anywhere | ◻ Phase 2 | — |
| Focus, selection, filter, search carry across the switch | ◻ Phase 2 | — |
| v1 crossfade switch | ◻ Phase 2 | — |

### 5.2 Focus
| Item | Status | Test(s) |
|---|---|---|
| Focused set = agent + all hierarchy descendants (data rule) | ✅ | `selectors.test.ts` › visibleSet |
| Peer links never expand focus (data rule) | ✅ | `selectors.test.ts` › "never expands focus along peer links" |
| Click agent → frame subtree | ◻ Phase 1 | — |
| Everything else ghosts to 5% (never hidden) | ◻ Phase 1 | — |
| 2D framing = animated pan + zoom-to-fit of subtree bbox | ◻ Phase 1 | — |
| Exit: Esc / breadcrumb root / dbl-click empty / single-click empty while focused | ◻ Phase 1 | — |
| Focus cascade 110 ms per depth level | ◻ Phase 1 | — |
| Focused wires brighten ×1.7, ghost wires dim | ◻ Phase 1 | — |
| Breadcrumb `Fleet ▸ <agent>`, root clickable | ◻ Phase 1 | — |

### 5.3 Shared agents
| Item | Status | Test(s) |
|---|---|---|
| Rendered once under each parent | ✅ | `selectors.test.ts` › instances |
| ×N badge count | ✅ | `selectors.test.ts` › "exposes the xN badge count and the parent list" |
| Parent list for "Shared sub-agent of A, B, C" | ✅ | same test |
| Selecting any copy highlights all copies | ◻ Phase 1 | — |
| "shared ×N" sub-label rendering | ◻ Phase 1 | — |

### 5.4 Navigation
| Item | Status | Test(s) |
|---|---|---|
| 2D pan / wheel-zoom toward cursor / drag cards | ◻ Phase 1 | — |
| Drag threshold measured in **screen pixels** (§10 bug class) | ◻ Phase 1 | — |
| Minimap (dots by kind, viewport rect, click/drag to jump) | ◻ Phase 1 | — |
| Zoom controls (+ / − / fit / %), dbl-click empty = fit | ◻ Phase 1 | — |
| 3D orbit / pan / zoom / inertia 0.92 / auto-rotate after 6 s | ◻ Phase 2 | — |

### 5.5 Semantic zoom & hierarchy scale
| Item | Status | Test(s) |
|---|---|---|
| Depth per agent (shallowest) drives node size | ✅ | `selectors.test.ts` › agentDepths |
| Node/card size by depth in both views | ◻ Phase 1 / 2 | — |
| 2D `< 0.55` hides sub-agent role lines | ◻ Phase 1 | — |
| 2D `< 0.36` collapses sub-agent cards to status dots | ◻ Phase 1 | — |
| Focusing always lands past the thresholds | ◻ Phase 1 | — |
| 3D label / satellite distance fade | ◻ Phase 2 | — |

### 5.6 Status system
| Item | Status | Test(s) |
|---|---|---|
| New agents and their edges default to Planned | ✅ | `fleetStore.test.ts` › "creates an agent from name + role alone, Planned by default"; "wires a sub-agent under its parent with a Planned edge"; `templates.test.ts` › "is entirely Planned" |
| Agent/edge status editable | ✅ | `fleetStore.test.ts` › "edits role, status, instructions and model"; "edits edge status, label and kind" |
| Data source Ready/In progress/Planned + linked badge | ✅ | `schemas.test.ts` › DataSourceSchema; Status labels |
| Status visual language (solid / pulsing / blueprint) | ◻ Phase 1 | — |
| Filter bar All/Live/In progress/Planned → 5% ghost | ◻ Phase 1 | — |
| Filter composes with focus (intersection) | ◻ Phase 1 | — |
| Panel status chip: current only, expands to three | ◻ Phase 1 | — |
| Same status control on edges (§8.5) | ◻ Phase 1 | — |

### 5.7 Inspector panel
| Item | Status | Test(s) |
|---|---|---|
| Library usage → "linked to: [Agent]…" data | ✅ | `selectors.test.ts` › library usage (2 tests) |
| Peer relations "Linked to… (same level)" data | ✅ | `selectors.test.ts` › "treats peer links as undirected" |
| Panel sections & chips rendering | ◻ Phase 1 | — |
| Every item clickable → detail card | ◻ Phase 1 | — |
| Workflow step visualisation (mini-DAG) | ◻ Phase 1 | — |
| Jump-focus from "linked to" buttons | ◻ Phase 1 | — |
| Chip type dots (tool / data colours) | ◻ Phase 1 | — |

### 5.8 Creating & editing
| Item | Status | Test(s) |
|---|---|---|
| Two-field creation (name, role) | ✅ | `fleetStore.test.ts` › "creates an agent from name + role alone" |
| Spawn child on selected node | ✅ | `fleetStore.test.ts` › "wires a sub-agent under its parent" |
| Rename propagates to all instances | ✅ | `fleetStore.test.ts` › "renames an agent everywhere at once" |
| Panel rename + role/instructions editing (§8.10) | ✅ | `fleetStore.test.ts` › "edits role, status, instructions and model" |
| Link existing agent (hierarchy or peer) | ✅ | `fleetStore.test.ts` › links (7 tests) |
| Link never creates a cycle | ✅ | `fleetStore.test.ts` › "refuses a link that would close a hierarchy cycle" |
| Delete agent removes its edges | ✅ | `fleetStore.test.ts` › "deletes an agent together with all its links" |
| Orchestrator cannot be deleted away (§4) | ✅ | `fleetStore.test.ts` › "refuses to delete the orchestrator" |
| Deleting a shared agent warns + lists parents | ✅ | `fleetStore.test.ts` › "describes a shared-agent deletion before it happens" |
| Unlink = delete edge | ✅ | `fleetStore.test.ts` › "unlinks a hierarchy edge when another parent remains" |
| Removing last hierarchy parent blocked | ✅ | `fleetStore.test.ts` › "blocks removing the last hierarchy parent" |
| Deleting a library item blocked while in use, usage listed | ✅ | `fleetStore.test.ts` › "blocks deleting a library item that is still in use" |
| All destructive actions undoable | ✅ | `fleetStore.test.ts` › undo/redo (5 tests) |
| Auto-arrange clears manual positions | ✅ | `fleetStore.test.ts` › "stores and clears manual positions" |
| Inline rename on card (dbl-click, Enter/Esc) | ◻ Phase 1 | — |
| Wire-drag linking & re-parenting in 2D (§8.4) | ◻ Phase 1 | — |
| Searchable pickers for skills/tools/data | ◻ Phase 1 | — |
| Palette drag (secondary flow) | ◻ Phase 1 | — |
| Auto-arrange layout via elkjs | ◻ Phase 1 | — |
| Details toggle (chips in cards / 3D satellites) | ◻ Phase 1 / 2 | — |

### 5.9 Feedback animations
| Item | Status | Test(s) |
|---|---|---|
| Click ring burst / selection pulse / hover lift | ◻ Phase 1 | — |
| `prefers-reduced-motion` honoured | ◻ Phase 1 | — |

### 5.10 Search
| Item | Status | Test(s) |
|---|---|---|
| Weighted fielded fuzzy search, typo tolerance | ◻ Phase 1 | — |
| DE↔EN synonyms, multi-token AND, match reason | ◻ Phase 1 | — |
| Keyboard navigation; result focuses + opens agent | ◻ Phase 1 | — |

### 5.11 Fleets & templates
| Item | Status | Test(s) |
|---|---|---|
| Create / rename / duplicate / delete fleets | ✅ | `fleetStore.test.ts` › fleets (8 tests) |
| Each fleet autosaves independently | ✅ | `persistence.test.ts` › "keeps multiple named fleets apart"; "only rewrites the fleets that actually changed" |
| Blank template (orchestrator only) | ✅ | `templates.test.ts` › blankFleet (4 tests) |
| Company fleet (orchestrator + 4 departments, all Planned) | ✅ | `templates.test.ts` › companyFleet (5 tests) |
| Solarlux demo fleet as loadable example | ⛔ **blocked** | needs `reference/prototype.html` (missing from repo) |
| Fleet switcher UI + delete confirm | ◻ Phase 1 | — |

## §7 — Persistence & files

| Item | Status | Test(s) |
|---|---|---|
| Autosave to IndexedDB, debounced, on every mutation | ✅ | `persistence.test.ts` › attachPersistence (5 tests) |
| Multiple named fleets | ✅ | `persistence.test.ts` › "keeps multiple named fleets apart" |
| Versioned JSON export | ✅ | `io.test.ts` › export/import round-trip (3 tests) |
| Zod-validated import with readable errors | ✅ | `io.test.ts` › parseFleetJson error reporting (7 tests) |
| Manual positions live on agents (graph is the file) | ✅ | `io.test.ts` › "preserves branching workflow steps and manual positions" |
| Corrupt stored fleet reported, not silently loaded | ✅ | `persistence.test.ts` › "reports a corrupted stored fleet instead of loading it" |

## §8 — App-only upgrades

| Item | Status | Test(s) |
|---|---|---|
| 8.1 Undo/redo covering every mutation | ✅ | `fleetStore.test.ts` › undo/redo (5 tests) |
| 8.5 Edge status editing | ✅ | `fleetStore.test.ts` › "edits edge status, label and kind" |
| 8.6 Branching workflow model | ✅ | `schemas.test.ts` › ToolSchema (renderer is Phase 1) |
| 8.7 Libraries as id-referenced entities | ✅ | `fleetStore.test.ts` › libraries (6 tests); `integrity.test.ts` › library refs |
| 8.8 Shared-agent children enabled | ✅ | `selectors.test.ts` › "repeats the subtree of a shared agent" |
| 8.10 Panel rename + role/instructions editing | ✅ | `fleetStore.test.ts` › "edits role, status, instructions and model" |
| 8.2 Animated 2D↔3D morph | ◻ Phase 3 | — |
| 8.3 Search brain (Fuse.js + synonyms) | ◻ Phase 1 | — |
| 8.4 Wire-drag linking in 2D | ◻ Phase 1 | — |
| 8.9 Bloom + depth of field | ◻ Phase 3 | — |
| Library manager view (list, edit, usage) | ◻ Phase 1 | — |

---

## Open deviations

**DEVIATION 1 — instance key form (spec-internal conflict).** §4 specifies instance keys as
`agentId@parentId`, but §4 also requires the children of a shared agent to appear under *every*
instance of the parent. Both cannot hold: a child of a shared agent needs one instance per
parent instance, which a single `child@parent` key cannot name. Instances are therefore keyed by
their full hierarchy path (`encodeURIComponent`-joined), with the §4 form retained as
`instance.pairKey`. Where no shared agent has children the two are 1:1.
Covered by `selectors.test.ts` › instances.
