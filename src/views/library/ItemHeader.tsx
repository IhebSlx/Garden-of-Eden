/**
 * The head of a detail pane: the name as the field that renames it, a subtitle,
 * and the actions that apply to the whole item.
 *
 * The heading IS the name field in all three panes, so renaming never needs a
 * second place to do it. Delete takes two clicks and only the confirmed one is
 * red; the store's reason for refusing — an item in use, a box that still holds
 * items — is handed back verbatim rather than summarised.
 */
import { useState } from 'react';

export function ItemHeader({
  name,
  subtitle,
  onRename,
  onDelete,
  extra,
  right,
}: {
  name: string;
  subtitle?: React.ReactNode;
  /** Returns an error to show, or null when the rename went through. */
  onRename: (next: string) => string | null;
  /** Returns an error to show, or null when it was deleted. */
  onDelete: () => string | null;
  /** An action only one pane has, e.g. "+ Add inside" for nested data. */
  extra?: React.ReactNode;
  /** Status or type, shown before the actions. */
  right?: React.ReactNode;
}): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <header className="datadetail-head">
        <div className="datadetail-title">
          <input
            className="datadetail-name"
            defaultValue={name}
            aria-label={`Rename ${name}`}
            data-testid="item-rename"
            onBlur={(event) => {
              const next = event.target.value.trim();
              if (next === '' || next === name) {
                event.target.value = name;
                return;
              }
              const problem = onRename(next);
              if (problem !== null) {
                event.target.value = name;
                setError(problem);
              } else {
                setError(null);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
          {subtitle !== undefined && <p>{subtitle}</p>}
        </div>

        <div className="datadetail-actions">
          {right}
          {extra}
          {confirming ? (
            <>
              <button
                type="button"
                className="chrome-btn danger"
                data-testid="item-delete-confirm"
                onClick={() => {
                  const problem = onDelete();
                  if (problem === null) {
                    setError(null);
                    return;
                  }
                  setConfirming(false);
                  setError(problem);
                }}
              >
                Delete for good
              </button>
              <button type="button" className="chrome-btn" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              className="chrome-btn"
              data-testid="item-delete"
              onClick={() => setConfirming(true)}
            >
              Delete
            </button>
          )}
        </div>
      </header>

      {error !== null && (
        <p className="dialog-error" role="status" data-testid="item-problem">
          {error}
        </p>
      )}
    </>
  );
}
