/**
 * Global keyboard shortcuts (SPEC 5.2, 8.1 and the Phase 3 shortcut pass).
 * The `?` sheet in `ShortcutsHelp.tsx` is the user-facing list; keep the two in step.
 *
 * Keys are ignored while the user is typing into a field or renaming a card, so a
 * "z" in an agent name never triggers an undo.
 */
import { useEffect } from 'react';
import { redo, undo } from '../../store/fleetStore.js';
import { useUiStore } from '../../store/uiStore.js';
import { useLinkDraft } from '../../store/linkDraft.js';
import type { Status } from '../../model/schemas.js';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

const FILTER_KEYS: Record<string, Status | null> = {
  l: 'live',
  i: 'building',
  p: 'planned',
  a: null,
};

export function Shortcuts(): null {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const ui = useUiStore.getState();

      if (event.key === 'Escape') {
        // Escape closes the topmost thing first: dialog, then focus.
        if (ui.shortcutsOpen) {
          ui.closeShortcuts();
          return;
        }
        if (ui.libraryOpen) {
          ui.closeLibrary();
          return;
        }
        const link = useLinkDraft.getState();
        if (link.pending !== null || link.picking !== null) {
          link.cancel();
          return;
        }
        if (isTyping(event.target)) return;
        ui.clearFocus();
        return;
      }

      const modifier = event.ctrlKey || event.metaKey;

      // Ctrl+K reaches search even from inside another field.
      if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        focusSearch();
        return;
      }

      if (isTyping(event.target)) return;

      if (modifier) {
        const key = event.key.toLowerCase();
        if (key === 'z' && !event.shiftKey) {
          event.preventDefault();
          undo();
        } else if ((key === 'z' && event.shiftKey) || key === 'y') {
          event.preventDefault();
          redo();
        }
        return;
      }

      if (event.altKey) return;

      if (event.key === '?') {
        event.preventDefault();
        ui.openShortcuts();
        return;
      }
      if (event.key === '/') {
        event.preventDefault();
        focusSearch();
        return;
      }

      const key = event.key.toLowerCase();

      if (key === '2') ui.setView('2d');
      else if (key === '3') ui.setView('3d');
      else if (key === 'f') ui.requestFit();
      else if (key === 'd') ui.toggleDetails();
      else if (key in FILTER_KEYS) ui.setStatusFilter(FILTER_KEYS[key] ?? null);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return null;
}

function focusSearch(): void {
  const input = document.querySelector<HTMLInputElement>('[data-testid="search"] input');
  input?.focus();
  input?.select();
}
