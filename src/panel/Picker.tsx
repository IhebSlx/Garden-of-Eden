/**
 * SPEC 5.8: "Skills/tools/data attach via searchable pickers from the shared
 * libraries - never retyped." Also serves the "Link existing…" agent picker.
 */
import { useMemo, useState } from 'react';

export type PickerOption = { id: string; label: string; hint?: string; dotColor?: string };

type Props = {
  title: string;
  options: PickerOption[];
  emptyText: string;
  onPick: (id: string) => void;
  onCancel: () => void;
};

export function Picker({ title, options, emptyText, onPick, onCancel }: Props): React.JSX.Element {
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === '') return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) || (option.hint ?? '').toLowerCase().includes(needle),
    );
  }, [options, query]);

  return (
    <div className="picker" data-testid="picker">
      <div className="picker-head">
        <span>{title}</span>
        <button type="button" onClick={onCancel} aria-label="Cancel">
          ✕
        </button>
      </div>
      <input
        className="picker-input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search…"
        autoFocus
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onCancel();
          }
          if (event.key === 'Enter' && matches[0]) onPick(matches[0].id);
        }}
      />
      <div className="picker-list">
        {matches.length === 0 ? (
          <div className="picker-empty">{emptyText}</div>
        ) : (
          matches.map((option) => (
            <button key={option.id} type="button" className="picker-row" onClick={() => onPick(option.id)}>
              {option.dotColor && <span className="tdot" style={{ background: option.dotColor }} />}
              <span className="picker-label">{option.label}</span>
              {option.hint && <small>{option.hint}</small>}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
