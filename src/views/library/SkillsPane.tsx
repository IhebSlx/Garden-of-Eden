/**
 * Skills: the list, and the detail of whichever one is selected.
 *
 * Same shape as Data and Tools — list left, editor right, add below, rename in
 * the heading — because they are the same job on different content, and three
 * layouts for one job is three things to learn.
 */
import { useState } from 'react';
import type { Fleet } from '../../model/schemas.js';
import { SkillFields } from '../../panel/SkillFields.js';
import { useFleetStore } from '../../store/fleetStore.js';
import { SKILL_COLOR } from '../../ui/palette.js';
import { ItemHeader } from './ItemHeader.js';
import { LibraryList } from './LibraryList.js';
import { UsedBy } from './UsedBy.js';

export function SkillsPane({ fleet, search }: { fleet: Fleet; search: string }): React.JSX.Element {
  const addSkill = useFleetStore((s) => s.addSkill);
  const updateSkill = useFleetStore((s) => s.updateSkill);
  const deleteSkill = useFleetStore((s) => s.deleteSkill);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const needle = search.trim().toLowerCase();
  const matching = fleet.skills.filter(
    (skill) =>
      needle === '' ||
      skill.name.toLowerCase().includes(needle) ||
      (skill.description ?? '').toLowerCase().includes(needle),
  );
  const selected = matching.find((skill) => skill.id === selectedId) ?? matching[0] ?? null;

  const add = (): void => {
    const name = newName.trim();
    if (name === '') return;
    const result = addSkill({ name });
    if (!result.ok) {
      setProblem(result.reason);
      return;
    }
    setProblem(null);
    setNewName('');
    setSelectedId(result.id);
  };

  return (
    <div className="datapanes">
      <LibraryList
        rows={matching.map((skill) => ({
          id: skill.id,
          name: skill.name,
          dot: SKILL_COLOR,
          depth: 0,
          noted: (skill.notes ?? '').trim() !== '',
        }))}
        selectedId={selected?.id ?? null}
        onSelect={(id) => {
          setSelectedId(id);
          setProblem(null);
        }}
        newName={newName}
        onNewName={setNewName}
        onAdd={add}
        addLabel="New skill name"
        emptyText="No skill matches. Clear the search, or add one below."
      />

      <div className="datadetail" data-testid="library-detail">
        {problem !== null && (
          <p className="dialog-error" role="status" data-testid="skill-problem">
            {problem}
          </p>
        )}
        {selected === null ? (
          <p className="data-empty">Nothing selected. Add a skill, or clear the search.</p>
        ) : (
          <div key={selected.id}>
            <ItemHeader
              name={selected.name}
              subtitle={selected.description ?? 'No description yet'}
              onRename={(next) => {
                const result = updateSkill(selected.id, { name: next });
                return result.ok ? null : result.reason;
              }}
              onDelete={() => {
                const result = deleteSkill(selected.id);
                if (result.ok) {
                  setSelectedId(null);
                  return null;
                }
                return result.blockedBy === undefined
                  ? result.reason
                  : `${result.reason} ${result.blockedBy.join(', ')}.`;
              }}
            />
            <UsedBy fleet={fleet} kind="skill" itemId={selected.id} />
            <SkillFields id={selected.id} />
          </div>
        )}
      </div>
    </div>
  );
}
