/**
 * SPEC 5.6: "shows only the current status as a single chip (● In progress ▾);
 * click expands the three options; choosing collapses."
 *
 * Used for agents and, per SPEC 8.5, for edges too.
 */
import { useState } from 'react';
import { DATA_SOURCE_STATUS_LABELS, STATUS_LABELS } from '../model/schemas.js';
import type { Status } from '../model/schemas.js';
import { STATUS_COLOR } from '../ui/palette.js';

const ALL: Status[] = ['live', 'building', 'planned'];

type Props = {
  status: Status;
  onChange: (status: Status) => void;
  /** Data sources say "Ready" where agents say "Live" (SPEC 4). */
  variant?: 'agent' | 'dataSource';
  label?: string;
};

export function StatusChip({ status, onChange, variant = 'agent', label }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const labels = variant === 'dataSource' ? DATA_SOURCE_STATUS_LABELS : STATUS_LABELS;

  if (!open) {
    return (
      <div className="strow" data-testid="status-chip">
        <button
          type="button"
          className="stbtn on"
          style={{ '--sc': STATUS_COLOR[status] } as React.CSSProperties}
          onClick={() => setOpen(true)}
          aria-label={label ?? `Status: ${labels[status]}. Change status`}
        >
          <span className="sd" style={{ background: STATUS_COLOR[status] }} />
          {labels[status]}
          <span style={{ opacity: 0.55, marginLeft: 3 }}>▾</span>
        </button>
      </div>
    );
  }

  return (
    <div className="strow" data-testid="status-chip-open">
      {ALL.map((option) => (
        <button
          key={option}
          type="button"
          className={`stbtn ${status === option ? 'on' : ''}`}
          style={{ '--sc': STATUS_COLOR[option] } as React.CSSProperties}
          onClick={() => {
            onChange(option);
            setOpen(false);
          }}
        >
          <span className="sd" style={{ background: STATUS_COLOR[option] }} />
          {labels[option]}
        </button>
      ))}
    </div>
  );
}
