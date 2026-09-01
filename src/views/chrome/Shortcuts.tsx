/**
 * Global keyboard shortcuts.
 *
 * SPEC 5.2: Esc leaves focus.
 * SPEC 8.1: Ctrl+Z / Ctrl+Y (and Ctrl+Shift+Z) undo and redo every mutation.
 *
 * Keys are ignored while the user is typing into a field or renaming a card, so a
 * "z" in an agent name never triggers an undo.
 */
import { useEffect } from 'react';
import { redo, undo } from '../../store/fleetStore.js';
import { useUiStore } from '../../store/uiStore.js';
import { useLinkDraft } from '../../store/linkDraft.js';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

export function Shortcuts(): null {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        // Escape closes the topmost thing first: dialog, then focus.
        if (useLinkDraft.getState().pending !== null || useLinkDraft.getState().picking !== null) {
          useLinkDraft.getState().cancel();
          return;
        }
        if (isTyping(event.target)) return;
        useUiStore.getState().clearFocus();
        return;
      }

      if (isTyping(event.target)) return;

      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;

      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return null;
}
