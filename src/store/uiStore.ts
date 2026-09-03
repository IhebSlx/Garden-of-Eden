/**
 * View state: focus, selection, filter, search, current view, detail toggles.
 *
 * SPEC 2 (locked architecture) requires this to stay OUT of the undo history and
 * OUT of the persisted document, so it is a separate store from `fleetStore` -
 * undoing a rename must never also undo where you were looking.
 *
 * SPEC 5.1: focus, selection, filter and search carry across a 2D/3D switch, which
 * is automatic here because the view flag lives beside them.
 */
import { create } from 'zustand';
import type { Status } from '../model/schemas.js';

export type ViewMode = '2d' | '3d';

/** The three groups of library items an agent carries, expandable in both views. */
export type DetailSection = 'skills' | 'tools' | 'data';

export const sectionKey = (agentId: string, section: DetailSection): string => `${agentId}|${section}`;

/** SPEC 8.2: an in-flight morph between the two views. */
export type Morph = { from: ViewMode; to: ViewMode; at: number };

/** Which panel item is expanded into a detail card (SPEC 5.7). */
export type DetailKey = string | null;

export type UiState = {
  view: ViewMode;
  /** Non-null while the 2D-3D morph is playing (SPEC 8.2). */
  morph: Morph | null;
  focusId: string | null;
  selectedId: string | null;
  /** SPEC 8.5: a wire can be selected instead of an agent. */
  selectedEdgeId: string | null;
  /** null = "All" (SPEC 5.6 filter bar). */
  statusFilter: Status | null;
  /**
   * Show only what depends on data this party still owes; null = every provider.
   * View state, so it never enters the undo history or the saved document.
   */
  providerFilter: string | null;
  searchQuery: string;
  /** SPEC 5.8 "Details toggle": chips inside cards / 3D satellites. */
  showDetails: boolean;
  openDetail: DetailKey;
  /** Timestamp a focus was applied, so the cascade can stagger from it. */
  focusStartedAt: number;
  /** SPEC 8.7: the library manager (list, edit, see usage). */
  libraryOpen: boolean;
  openLibrary: () => void;
  closeLibrary: () => void;
  /** The agent / skill / tool catalog, which lives outside any fleet. */
  catalogOpen: boolean;
  openCatalog: () => void;
  closeCatalog: () => void;
  /** "Data prep": every data source grouped by whoever prepares it. */
  dataPrepOpen: boolean;
  openDataPrep: () => void;
  closeDataPrep: () => void;
  /** The "?" keyboard-shortcut sheet. */
  shortcutsOpen: boolean;
  openShortcuts: () => void;
  closeShortcuts: () => void;
  /** Bumped by Auto-arrange and the fit control so the board refits. */
  fitRequest: number;
  requestFit: () => void;
  /** Bumped to replay the click burst on a node (SPEC 5.9). */
  burst: { agentId: string; at: number } | null;
  /**
   * Which detail sections are expanded, keyed by `agentId|section`. A busy agent
   * can carry dozens of chips, so the sections start collapsed and the header
   * carries the count. Keyed by agent rather than by instance so every instance of
   * a shared agent opens together (SPEC §2.3), and shared by the 2D card and the 3D
   * satellite bundles so the two views never disagree (SPEC §2.1, §5.1).
   */
  openSections: Record<string, true>;

  setView: (view: ViewMode) => void;
  toggleView: () => void;
  /** Called by the view switch when the morph animation is done. */
  endMorph: () => void;
  focus: (agentId: string | null) => void;
  select: (agentId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  /** Click on a card: focus its branch, select it and fire the burst at once. */
  activate: (agentId: string) => void;
  clearFocus: () => void;
  setStatusFilter: (status: Status | null) => void;
  setProviderFilter: (provider: string | null) => void;
  toggleStatusFilter: (status: Status | null) => void;
  setSearchQuery: (query: string) => void;
  toggleDetails: () => void;
  setOpenDetail: (key: DetailKey) => void;
  /** Clicking the same item again closes its detail card (SPEC 5.7). */
  toggleDetail: (key: string) => void;
  toggleDetailSection: (agentId: string, section: DetailSection) => void;
  fireBurst: (agentId: string) => void;
  /** Called when a fleet is swapped in: nothing selected can survive it. */
  resetForFleet: () => void;
};

const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

export const useUiStore = create<UiState>()((set, get) => ({
  view: '2d',
  morph: null,
  focusId: null,
  selectedId: null,
  selectedEdgeId: null,
  statusFilter: null,
  providerFilter: null,
  searchQuery: '',
  showDetails: false,
  openDetail: null,
  focusStartedAt: 0,
  libraryOpen: false,
  shortcutsOpen: false,
  catalogOpen: false,
  dataPrepOpen: false,
  fitRequest: 0,
  burst: null,
  openSections: {},

  openLibrary: () => set({ libraryOpen: true }),
  closeLibrary: () => set({ libraryOpen: false }),
  openCatalog: () => set({ catalogOpen: true }),
  closeCatalog: () => set({ catalogOpen: false }),
  openDataPrep: () => set({ dataPrepOpen: true }),
  closeDataPrep: () => set({ dataPrepOpen: false }),
  openShortcuts: () => set({ shortcutsOpen: true }),
  closeShortcuts: () => set({ shortcutsOpen: false }),
  requestFit: () => set((state) => ({ fitRequest: state.fitRequest + 1 })),

  setView: (view) => {
    const current = get().view;
    if (view === current) return;
    set({ view, morph: { from: current, to: view, at: now() } });
  },
  toggleView: () => get().setView(get().view === '2d' ? '3d' : '2d'),
  endMorph: () => set({ morph: null }),

  focus: (agentId) => set({ focusId: agentId, focusStartedAt: now() }),
  select: (agentId) => set({ selectedId: agentId, selectedEdgeId: null, openDetail: null }),
  // Selecting a wire closes the agent panel - only one inspector at a time.
  selectEdge: (edgeId) => set({ selectedEdgeId: edgeId, selectedId: edgeId === null ? get().selectedId : null }),

  activate: (agentId) => {
    // Re-clicking the agent that is already focused must not replay the cascade:
    // the pop would restart under the pointer and swallow a double-click to rename.
    const alreadyFocused = get().focusId === agentId;
    set({
      focusId: agentId,
      selectedId: agentId,
      selectedEdgeId: null,
      focusStartedAt: alreadyFocused ? get().focusStartedAt : now(),
      openDetail: null,
      burst: { agentId, at: now() },
    });
  },

  clearFocus: () =>
    set({ focusId: null, selectedId: null, selectedEdgeId: null, openDetail: null, focusStartedAt: now() }),

  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setProviderFilter: (providerFilter) => set({ providerFilter }),
  toggleStatusFilter: (status) =>
    // Clicking the active filter (or "All") clears it, exactly as the prototype does.
    set({ statusFilter: status === null || get().statusFilter === status ? null : status }),

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  toggleDetails: () => set((state) => ({ showDetails: !state.showDetails })),

  setOpenDetail: (openDetail) => set({ openDetail }),
  toggleDetail: (key) => set((state) => ({ openDetail: state.openDetail === key ? null : key })),

  toggleDetailSection: (agentId, section) =>
    set((state) => {
      const key = sectionKey(agentId, section);
      if (state.openSections[key] === undefined) {
        return { openSections: { ...state.openSections, [key]: true as const } };
      }
      const { [key]: _closed, ...rest } = state.openSections;
      return { openSections: rest };
    }),

  fireBurst: (agentId) => set({ burst: { agentId, at: now() } }),

  resetForFleet: () =>
    set({
      focusId: null,
      selectedId: null,
      selectedEdgeId: null,
      openDetail: null,
      searchQuery: '',
      providerFilter: null,
      focusStartedAt: 0,
      burst: null,
      openSections: {},
    }),
}));

/** SPEC 5.6: a component matches when no filter is set or its status equals it. */
export function matchesFilter(status: Status, filter: Status | null): boolean {
  return filter === null || status === filter;
}
