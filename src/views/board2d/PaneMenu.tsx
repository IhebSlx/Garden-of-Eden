/**
 * The right-click menu on empty board space.
 *
 * Right-click is where "make something here" lives on every canvas people have
 * used, and until now the board had no answer to it: agents could only be created
 * under a card you had already selected.
 *
 * Closes on anything that is not a choice — a click elsewhere, Escape, a scroll —
 * because a menu that outlives its moment is worse than no menu.
 */
import { useEffect, useRef } from 'react';

export function PaneMenu({
  at,
  onNewAgent,
  onClose,
}: {
  at: { x: number; y: number };
  onNewAgent: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Capture, so the menu closes even when the press lands on something that
    // stops the event on its way up — but a press ON the menu is the menu being
    // used, and closing then would unmount the button before its click lands.
    const onPress = (event: PointerEvent): void => {
      if (box.current?.contains(event.target as Node) === true) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    // Escape is captured too: the board's own keyboard handling sits between here
    // and the window, and a menu that ignores Escape is a menu you have to fight.
    window.addEventListener('pointerdown', onPress, true);
    window.addEventListener('wheel', onClose, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onPress, true);
      window.removeEventListener('wheel', onClose, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  return (
    <div
      className="panemenu"
      role="menu"
      aria-label="Board"
      data-testid="pane-menu"
      ref={box}
      style={{ left: at.x, top: at.y }}
    >
      <button
        type="button"
        role="menuitem"
        className="panemenu-item"
        data-testid="pane-menu-new-agent"
        onClick={() => {
          onNewAgent();
          onClose();
        }}
      >
        New agent here
      </button>
    </div>
  );
}
