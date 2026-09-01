/**
 * Phase 3 keyboard shortcuts, and the `?` sheet that documents them.
 * Everything listed here is wired in `Shortcuts.tsx`.
 */
import { useUiStore } from '../../store/uiStore.js';

const GROUPS: { title: string; rows: { keys: string; what: string }[] }[] = [
  {
    title: 'Navigate',
    rows: [
      { keys: 'Esc', what: 'Leave focus, or close the open dialog' },
      { keys: 'F', what: 'Fit the whole fleet' },
      { keys: '2 / 3', what: 'Switch to the 2D board / 3D space' },
      { keys: 'D', what: 'Toggle skill and tool details' },
    ],
  },
  {
    title: 'Find',
    rows: [
      { keys: '/  or  Ctrl+K', what: 'Jump to search' },
      { keys: '↑ ↓', what: 'Move through results' },
      { keys: 'Enter', what: 'Focus and open the highlighted agent' },
    ],
  },
  {
    title: 'Edit',
    rows: [
      { keys: 'Double-click', what: 'Rename an agent on its card' },
      { keys: 'Ctrl+Z', what: 'Undo' },
      { keys: 'Ctrl+Y  or  Ctrl+Shift+Z', what: 'Redo' },
    ],
  },
  {
    title: 'Filter by status',
    rows: [
      { keys: 'L', what: 'Live only' },
      { keys: 'I', what: 'In progress only' },
      { keys: 'P', what: 'Planned only' },
      { keys: 'A', what: 'Show everything again' },
    ],
  },
];

export function ShortcutsHelp(): React.JSX.Element | null {
  const open = useUiStore((s) => s.shortcutsOpen);
  const close = useUiStore((s) => s.closeShortcuts);

  if (!open) return null;

  return (
    <div className="dialog-scrim" role="dialog" aria-modal="true" data-testid="shortcuts-help">
      <div className="dialog">
        <h2>Keyboard shortcuts</h2>
        <p className="dialog-lead">Press ? at any time to bring this back.</p>

        {GROUPS.map((group) => (
          <div key={group.title} className="shortcut-group">
            <h3>{group.title}</h3>
            {group.rows.map((row) => (
              <div key={row.keys} className="shortcut-row">
                <kbd>{row.keys}</kbd>
                <span>{row.what}</span>
              </div>
            ))}
          </div>
        ))}

        <div className="dialog-row">
          <button type="button" className="btn" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
