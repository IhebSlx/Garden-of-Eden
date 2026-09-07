/**
 * The editor for one skill: what it is, what it tells the agent to do, and the
 * notes people leave about it.
 */
import { selectActiveFleet, useFleetStore } from '../store/fleetStore.js';
import { NotesField } from './NotesField.js';

export function SkillFields({ id }: { id: string }): React.JSX.Element | null {
  const fleet = useFleetStore(selectActiveFleet);
  const updateSkill = useFleetStore((s) => s.updateSkill);
  const skill = fleet?.skills.find((s) => s.id === id);
  if (!skill) return null;
  return (
    <div className="lib-fields" data-testid="skill-editor">
      <label className="dialog-field">
        <span>Description</span>
        <input
          defaultValue={skill.description ?? ''}
          aria-label={`Description of ${skill.name}`}
          onBlur={(event) => updateSkill(id, { description: event.target.value })}
        />
      </label>
      <label className="dialog-field">
        <span>Instructions</span>
        <textarea
          rows={2}
          defaultValue={skill.instructions ?? ''}
          aria-label={`Instructions for ${skill.name}`}
          data-testid="skill-instructions"
          onBlur={(event) => updateSkill(id, { instructions: event.target.value })}
        />
      </label>
      <NotesField
        value={skill.notes}
        label={skill.name}
        testId="skill-notes"
        onCommit={(next) => updateSkill(id, { notes: next })}
      />
    </div>
  );
}
