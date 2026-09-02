/**
 * Free text ABOUT a component, written for people.
 *
 * One control for all four kinds so a note looks and behaves the same wherever it
 * is written. Commits on blur like every other field in the panel, and shows a
 * word count once there is something to count — a note nobody can find again is
 * worth little, and the count is the cheapest signal that one exists.
 *
 * Deliberately NOT an agent's `instructions`: instructions are given to the agent
 * and change what it does. A note is never sent anywhere.
 */
import { useId } from 'react';

const PLACEHOLDER =
  'Open questions, decisions and why, who to ask, what has to happen before this is done…';

export function NotesField({
  value,
  label,
  onCommit,
  testId,
}: {
  value: string | undefined;
  /** Names the thing the note is about, so screen readers say which one. */
  label: string;
  onCommit: (next: string) => void;
  testId?: string;
}): React.JSX.Element {
  const id = useId();
  const text = value ?? '';
  const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;

  return (
    <label className="dialog-field notes-field" htmlFor={id}>
      <span>
        Notes
        {words > 0 && (
          <small className="notes-count" data-testid="notes-count">
            {words} {words === 1 ? 'word' : 'words'}
          </small>
        )}
      </span>
      <textarea
        /*
         * Keyed on the committed value so the field follows the store when it
         * changes underneath - an undo, or the same item edited in another tab.
         * An uncontrolled textarea keeps its DOM text otherwise, and the panel
         * would show text the fleet no longer holds. Typing does not remount it:
         * `value` is the stored text and only changes on commit.
         */
        key={text}
        id={id}
        rows={3}
        defaultValue={text}
        aria-label={`Notes on ${label}`}
        placeholder={PLACEHOLDER}
        data-testid={testId}
        onBlur={(event) => {
          // Only write when it actually changed, so opening a note is not an undo step.
          if (event.target.value !== text) onCommit(event.target.value);
        }}
      />
    </label>
  );
}
