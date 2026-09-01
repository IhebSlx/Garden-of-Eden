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

/** Which panel item is expanded into a detail card (SPEC 5.7). */
export type DetailKey = string | null;

export type UiState = {
  view: ViewMode;
  focusId: string | null;
  selectedId: string | null;
  /** SPEC 8.5: a wire can be selected instead of an agent. */
  selectedEdgeId: string | null;
  /** null = "All" (SPEC 5.6 filter bar). */
  statusFilter: Status | null;
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
  /** Bumped by Auto-arrange and the fit control so the board refits. */
  fitRequest: number;
  requestFit: () => void;
  /** Bumped to replay the click burst on a node (SPEC 5.9). */
  burst: { agentId: string; at: number } | null;

  setView: (view: ViewMode) => void;
  toggleView: () => void;
  focus: (agentId: string | null) => void;
  select: (agentId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  /** Click on a card: focus its branch, select it and fire the burst at once. */
  activate: (agentId: string) => void;
  clearFocus: () => void;
  setStatusFilter: (status: Status | null) => void;
  toggleStatusFilter: (status: Status | null) => void;
  setSearchQuery: (query: string) => void;
  toggleDetails: () => void;
  setOpenDetail: (key: DetailKey) => void;
  /** Clicking the same item again closes its detail card (SPEC 5.7). */
  toggleDetail: (key: string) => void;
  fireBurst: (agentId: string) => void;
  /** Called when a fleet is swapped in: nothing selected can survive it. */
  resetForFleet: () => void;
};

const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

export const useUiStore = create<UiState>()((set, get) => ({
  view: '2d',
  focusId: null,
  selectedId: null,
  selectedEdgeId: null,
  statusFilter: null,
  searchQuery: '',
  showDetails: false,
  openDetail: null,
  focusStartedAt: 0,
  libraryOpen: false,
  fitRequest: 0,
  burst: null,

  openLibrary: () => set({ libraryOpen: true }),
  closeLibrary: () => set({ libraryOpen: false }),
  requestFit: () => set((state) => ({ fitRequest: state.fitRequest + 1 })),

  setView: (view) => set({ view }),
  toggleView: () => set((state) => ({ view: state.view === '2d' ? '3d' : '2d' })),

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
  toggleStatusFilter: (status) =>
    // Clicking the active filter (or "All") clears it, exactly as the prototype does.
    set({ statusFilter: status === null || get().statusFilter === status ? null : status }),

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  toggleDetails: () => set((state) => ({ showDetails: !state.showDetails })),

  setOpenDetail: (openDetail) => set({ openDetail }),
  toggleDetail: (key) => set((state) => ({ openDetail: state.openDetail === key ? null : key })),

  fireBurst: (agentId) => set({ burst: { agentId, at: now() } }),

  resetForFleet: () =>
    set({
      focusId: null,
      selectedId: null,
      selectedEdgeId: null,
      openDetail: null,
      searchQuery: '',
      focusStartedAt: 0,
      burst: null,
    }),
}));

/** SPEC 5.6: a component matches when no filter is set or its status equals it. */
export function matchesFilter(status: Status, filter: Status | null): boolean {
  return filter === null || status === filter;
}
