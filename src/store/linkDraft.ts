/**
 * SPEC 5.8: "The link flow always asks for the edge kind: sub-agent (hierarchy)
 * or peer." Both entry points - wire-drag in 2D (SPEC 8.4) and the panel's
 * "Link existing…" picker - funnel through this pending draft, so the question is
 * asked exactly once in one place.
 *
 * View state: not undoable, not persisted.
 */
import { create } from 'zustand';

export type LinkDraft = {
  pending: { sourceId: string; targetId: string } | null;
  /** Set while the panel picker is choosing a partner for `sourceId`. */
  picking: string | null;
  open: (sourceId: string, targetId: string) => void;
  startPicking: (sourceId: string) => void;
  cancel: () => void;
};

export const useLinkDraft = create<LinkDraft>()((set) => ({
  pending: null,
  picking: null,
  open: (sourceId, targetId) => set({ pending: { sourceId, targetId }, picking: null }),
  startPicking: (sourceId) => set({ picking: sourceId, pending: null }),
  cancel: () => set({ pending: null, picking: null }),
}));
