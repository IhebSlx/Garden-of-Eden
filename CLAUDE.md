# CLAUDE.md — working rules for Agent Fleet Studio

Distilled from `SPEC.md` §10 (Testing & Definition of Done) plus the permanent working rules
for this repo. **Re-read this file and the SPEC sections relevant to the current milestone at
the start of every session.**

`SPEC.md` is the contract. `reference/prototype.html` is the visual and behavioural ground truth
and its tuned constants are normative (§6) unless the spec overrides them. Where spec and
prototype disagree, the spec wins (§8 lists the intentional disagreements).

---

## 1. Plan before code

- Every phase starts with an implementation plan: milestones, files, test list, pinned
  dependency versions. **Wait for approval before writing code.**
- Phase 1 is split into **max 6 sequential milestones**, each ending in a working, testable
  state, each approved individually.
- Do not start the next phase until the milestone plan is approved.

## 2. Batch the questions

- Collect spec ambiguities during planning and ask them **together in the plan**, never
  one-by-one mid-implementation.
- If something turns ambiguous during implementation: **prefer the prototype's behaviour** and
  note the decision in the milestone report.

## 3. Test-first where cheap

- Schemas, selectors (`instances`, `visibleSet`, `isShared`) and store actions get unit tests
  **with** their implementation.
- **Nothing merges red.** Lint + typecheck + tests must be green.
- Maintain `TRACE.md` mapping every SPEC §5 item to its tests. **An item without a test is not done.**

## 4. Visual verification loop

For every feature with a visual outcome: open `reference/prototype.html` and the app with
Playwright, screenshot the same state in both, compare, and include the comparison in the
milestone report **before** marking it done. Phase 2 keeps this as a written `PARITY.md` checklist.

## 5. Never ship placeholders

No `TODO`, `FIXME`, `[ZU PRÜFEN]`, no lorem copy, no dead buttons on `main`.
CI greps for these markers and fails the build.

## 6. Deviations are surfaced, never silent

Any departure from `SPEC.md` goes under a **`DEVIATION:`** heading with rationale, **before**
implementing, and in the commit/PR message.

**Silent simplification counts as a deviation**: pan instead of zoom-to-fit framing, hiding
instead of 5% ghosting, skipping an animation — all must be flagged first.

§8 already flags two intentional model changes vs the prototype; implement the spec version:
- `kind: 'shared'` is removed — shared-ness is **derived** from hierarchy parent count.
- Skills/tools/data sources are **id-referenced libraries**, not inline per-agent objects.

## 7. Session ritual

Start each session by re-reading this file and the SPEC sections for the current milestone.
Reference SPEC section numbers in commit messages.

## 8. Commits & CI

Small conventional commits. CI stays green. Use **pnpm**.

---

## Definition of Done (SPEC §10, non-negotiable)

- Ground-truth suite green: graph selectors, schema validation, store actions (incl. undo),
  Playwright flows per phase.
- Visual verification done and reported for every visual feature.
- `TRACE.md` updated — every §5 item maps to at least one test.
- No open markers, no placeholder copy, no dead buttons.
- ESLint + typecheck clean.
- `prefers-reduced-motion` honoured everywhere.
- **Known bug class to test against:** pointer thresholds are measured in **screen pixels**,
  never zoom-scaled units. A zoom-scaled threshold broke click-to-focus at overview zoom in
  the prototype.

---

## Locked architecture (SPEC §2) — do not drift

1. **One store, many renderers.** Fleet data lives in one Zustand store, view-agnostic. 2D and
   3D are subscribers. No view owns data.
2. **The model is a DAG, not a tree.** Agents may have multiple hierarchy parents. Nesting
   children inside agent objects is **forbidden** — structure lives only in edges.
3. **One agent = one truth, rendered as instances.** Instances are derived and never persisted.
   Selecting any instance highlights all; editing applies everywhere.
4. **Structure vs content.** Sub-agents = edges. Skills/tools/data/instructions/model = fields.
5. **No purposeless motion.** Every animation answers a user action or carries meaning.
   Ambient decoration is banned until it represents real telemetry.
6. **Semantic zoom.** Distance controls detail; node size scales with hierarchy level in both views.

View state (focus, selection, filter, search) must stay **out of** the undo history and out of
the persisted document.

---

## Normative constants (SPEC §6)

Defined once in `src/ui/tokens.css`. Changing any of them is a `DEVIATION:`.

| Constant | Value |
|---|---|
| ghost opacity | **0.05** |
| focus cascade stagger | **110 ms / level** |
| 2D semantic zoom: hide roles | **< 0.55** |
| 2D semantic zoom: collapse to dots | **< 0.36** |
| 3D auto-rotate idle delay | **6 s** |
| orbit inertia decay | **0.92 / frame** |
| selection-ring pulse | **~2.4 s** |
| focused-wire brightness | **×1.7** |
| planned-edge opacity | **×0.35** |
| building-edge opacity | **×0.7** |

Colour tokens (§6): bg deep `#05060f`, bg glow `#0d1330`, orchestrator `#8b5cf6`,
department `#38e1ff`, worker `#3ce8b0`, shared accent `#f6b954`, live `#4ade80`,
building `#fbbf24`, planned `#6b7a9e`; tool dots workflow/python/microsoft
`#f6b954`/`#38e1ff`/`#818cf8`; data dots md/dataverse/sharepoint `#c9b6ff`/`#3ce8b0`/`#38e1ff`.

---

## Commands

```bash
pnpm install     # pinned versions, frozen lockfile in CI
pnpm dev         # Vite dev server
pnpm verify      # typecheck + lint + test — run before every commit
pnpm test        # Vitest unit suite
pnpm test:e2e    # Playwright flows (SPEC §10)
pnpm build       # production build
```

## Layout (SPEC §11)

```
/reference/prototype.html   the validated prototype (ground truth, read-only)
/src
  /model    schemas.ts, integrity.ts, selectors.ts, wires.ts, visibility.ts,
            migrations.ts, templates.ts, seed.ts, ids.ts
  /store    fleetStore.ts (zustand + zundo), persistence.ts, io.ts
  /views    /board2d, /space3d
  /panel    Inspector.tsx, ItemDetail.tsx, StatusChip.tsx
  /search   index.ts, synonyms.ts
  /layout   treeLayout.ts (2D), layout3d.ts, viewport.ts
  /ui       tokens.css, primitives/
/tests      unit/, e2e/
TRACE.md    every SPEC item -> its test
PARITY.md   visual checklist against the prototype
```
