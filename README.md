# Solarlux Agent Visualiser

A visual overview of Solarlux's agent fleet: an orchestrator, the departments under
it, and the agents that do the work — rendered as a 2D glass board and a
free-navigation 3D space over one shared store.

The board is also a roadmap. Every component carries a status (Live / In progress /
Planned), so the fleet as it will be is always drawn and the filters reveal what
exists today.

- **Copilot Studio import** — drop in a `.yaml` export and the agent arrives with its
  skills, flows, scripts and knowledge sources. The original file stays downloadable.
- **Data prep** — every data source grouped by whoever prepares it, with what
  "finished" looks like and who is blocked without it.
- **Notes** — free text about any component, for people. Never sent anywhere.

`SPEC.md` is the contract, `TRACE.md` maps every specified item to its tests, and
`PARITY.md` is the visual checklist against `reference/prototype.html`.

## Running it

```bash
pnpm install
pnpm dev
```

`pnpm verify` (typecheck + lint + unit tests) and `pnpm test:e2e` must both be green
before anything is committed.

## Running it without a terminal

`scripts/install-desktop-shortcut.ps1` puts **Solarlux Agent Visualiser** on the Desktop:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-desktop-shortcut.ps1
```

Double-clicking it runs `scripts/Start Agent Visualiser.cmd`, which builds when the
sources are newer than the last build, serves the production build, and opens the
browser. Closing the console window stops it.

The launcher and `pnpm dev` deliberately share **port 5178**. The app keeps its
fleets in the browser's IndexedDB, which is scoped to the origin — and the origin
includes the port — so a different port would present an empty app with every fleet
apparently gone. The two therefore cannot run at once; `--strictPort` makes that a
clear error rather than a silent empty start.

## Icons

`public/favicon.svg` is the source of truth for the mark and is hand-written.
`app-icon.ico` (used by the desktop shortcut) and `app-icon.png` are generated from
the same proportions:

```bash
pnpm icons
```

The Solarlux wordmark in the app's brand lockup is the supplied corporate asset,
used as-is. The mark is deliberately not a redrawn version of it.
