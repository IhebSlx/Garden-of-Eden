/**
 * SPEC 5.8: "Skills/tools/data attach via searchable pickers from the shared
 * libraries - never retyped." Also serves the "Link existing…" agent picker.
 *
 * A picker that can only offer what already exists is a dead end the moment the
 * thing you want is not in the library yet — you close it, go to the Library, add
 * the item, come back and search for it again. So a picker may also CREATE: type a
 * name that matches nothing and the last row offers to make it, attached in one
 * step. The library still owns the item; this is a shorter road to the same place.
 *
 * What a new one needs is declared per kind rather than assumed. A skill needs a
 * name; a tool needs a type and a description too, because SPEC §4 says "every
 * tool explains itself" and the schema enforces it. Asking for exactly the
 * required fields beats inventing placeholder copy to get past the check.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

export type PickerOption = { id: string; label: string; hint?: string; dotColor?: string };

/** One field a new item needs beyond its name. */
export type PickerField =
  | { key: string; label: string; kind: 'text'; placeholder: string }
  | { key: string; label: string; kind: 'select'; options: { value: string; label: string }[] };

export type PickerCreate = {
  /** What is being made, for the row label: `+ New skill "Angebot prüfen"`. */
  noun: string;
  /** Everything the schema requires beyond the name. Empty for most kinds. */
  fields?: PickerField[];
  /** Returns a reason when it could not be made, or null on success. */
  onCreate: (name: string, values: Record<string, string>) => string | null;
};

type Props = {
  title: string;
  options: PickerOption[];
  emptyText: string;
  onPick: (id: string) => void;
  onCancel: () => void;
  /** Omitted where making a new one makes no sense, as for the agent picker. */
  create?: PickerCreate;
};

/** A select starts on its first option; a text field starts empty. */
function initialValues(fields: PickerField[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    values[field.key] = field.kind === 'select' ? (field.options[0]?.value ?? '') : '';
  }
  return values;
}

export function Picker({
  title,
  options,
  emptyText,
  onPick,
  onCancel,
  create,
}: Props): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [making, setMaking] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() =>
    initialValues(create?.fields ?? []),
  );
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // The picker opens at the bottom of a panel that is usually already scrolled,
  // and the create form makes it taller still — so it lands below the fold and
  // has to be hunted for. Bring it to where the eye is instead.
  useEffect(() => {
    box.current?.scrollIntoView({ block: 'nearest' });
  }, [making]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === '') return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) || (option.hint ?? '').toLowerCase().includes(needle),
    );
  }, [options, query]);

  const typed = query.trim();
  const fields = create?.fields ?? [];
  // Offering to create something that is already in the list is how duplicates
  // get made, so an exact name match hides the row.
  const taken = options.some((option) => option.label.toLowerCase() === typed.toLowerCase());
  const canOffer = create !== undefined && typed !== '' && !taken;
  const complete = fields.every((field) => (values[field.key] ?? '').trim() !== '');

  const submit = (): void => {
    if (create === undefined || typed === '' || !complete) return;
    const reason = create.onCreate(typed, values);
    if (reason !== null) setProblem(reason);
  };

  /** Straight to it when a name is all that is needed; a form when it is not. */
  const beginCreate = (): void => {
    setProblem(null);
    if (fields.length === 0) submit();
    else setMaking(true);
  };

  return (
    <div className="picker" data-testid="picker" ref={box}>
      <div className="picker-head">
        <span>{making ? `New ${create?.noun ?? 'item'}` : title}</span>
        <button type="button" onClick={onCancel} aria-label="Cancel">
          ✕
        </button>
      </div>

      <input
        className="picker-input"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setProblem(null);
        }}
        placeholder={making ? 'Name' : 'Search…'}
        aria-label={making ? `Name of the new ${create?.noun ?? 'item'}` : 'Search'}
        data-testid="picker-search"
        autoFocus
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            if (making) setMaking(false);
            else onCancel();
          }
          if (event.key !== 'Enter') return;
          if (making) submit();
          else if (matches[0]) onPick(matches[0].id);
          else if (canOffer) beginCreate();
        }}
      />

      {making ? (
        <div className="picker-make" data-testid="picker-form">
          {fields.map((field) => (
            <label key={field.key} className="picker-field">
              <span>{field.label}</span>
              {field.kind === 'select' ? (
                <select
                  value={values[field.key] ?? ''}
                  data-testid={`picker-field-${field.key}`}
                  onChange={(event) =>
                    setValues((previous) => ({ ...previous, [field.key]: event.target.value }))
                  }
                >
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={values[field.key] ?? ''}
                  placeholder={field.placeholder}
                  data-testid={`picker-field-${field.key}`}
                  onChange={(event) =>
                    setValues((previous) => ({ ...previous, [field.key]: event.target.value }))
                  }
                />
              )}
            </label>
          ))}
          <div className="picker-make-row">
            <button
              type="button"
              className="btn"
              disabled={typed === '' || !complete}
              data-testid="picker-create-confirm"
              onClick={submit}
            >
              Create and add
            </button>
            <button type="button" className="btn ghost" onClick={() => setMaking(false)}>
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="picker-list">
          {matches.length === 0 && (
            <div className="picker-empty">
              {typed === '' ? emptyText : `Nothing called “${typed}”.`}
            </div>
          )}
          {matches.map((option) => (
            <button key={option.id} type="button" className="picker-row" onClick={() => onPick(option.id)}>
              {option.dotColor && <span className="tdot" style={{ background: option.dotColor }} />}
              <span className="picker-label">{option.label}</span>
              {option.hint && <small>{option.hint}</small>}
            </button>
          ))}
          {canOffer && (
            <button
              type="button"
              className="picker-row picker-new"
              data-testid="picker-create"
              onClick={beginCreate}
            >
              <span className="picker-label">
                + New {create?.noun} “{typed}”
              </span>
            </button>
          )}
          {create !== undefined && typed === '' && options.length === 0 && (
            <div className="picker-empty">Type a name to make one.</div>
          )}
        </div>
      )}

      {problem !== null && (
        <p className="picker-problem" role="status" data-testid="picker-problem">
          {problem}
        </p>
      )}
    </div>
  );
}
