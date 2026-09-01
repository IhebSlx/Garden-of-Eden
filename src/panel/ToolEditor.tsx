/**
 * Authoring for a tool: description, type, and - for workflow tools - the steps
 * themselves.
 *
 * SPEC 8.6 asked for a branching workflow *renderer*, which `ItemDetail` provides.
 * Without this editor the only way to author `steps[].next[]` was to hand-write
 * JSON and import it, so the renderer had nothing to render.
 */
import { useState } from 'react';
import { ID_PREFIX, newId } from '../model/ids.js';
import type { Tool, ToolType, WorkflowStep, WorkflowStepKind } from '../model/schemas.js';
import { TOOL_TYPE_COLOR, TOOL_TYPE_LABEL } from '../ui/palette.js';
import { layoutWorkflow } from './workflowLayout.js';

const TOOL_TYPES: ToolType[] = ['workflow', 'python', 'microsoft'];
const STEP_KINDS: WorkflowStepKind[] = ['trigger', 'action', 'condition'];

type Props = {
  tool: Tool;
  onChange: (patch: Partial<Omit<Tool, 'id'>>) => void;
  onClose: () => void;
  error: string | null;
};

export function ToolEditor({ tool, onChange, onClose, error }: Props): React.JSX.Element {
  const steps = tool.workflow?.steps ?? [];
  const [draftName, setDraftName] = useState('');

  const setSteps = (next: WorkflowStep[]): void => {
    onChange({ workflow: { steps: next } });
  };

  const addStep = (): void => {
    const name = draftName.trim();
    if (name === '') return;
    const step: WorkflowStep = {
      id: newId(ID_PREFIX.workflowStep),
      name,
      // The first step of a flow is its trigger; everything after is an action.
      kind: steps.length === 0 ? 'trigger' : 'action',
      next: [],
    };
    // Chain onto the last step by default, which is what a linear flow wants.
    const last = steps[steps.length - 1];
    const linked = last ? steps.map((s) => (s.id === last.id ? { ...s, next: [...s.next, step.id] } : s)) : steps;
    setSteps([...linked, step]);
    setDraftName('');
  };

  const removeStep = (stepId: string): void => {
    // Drop the step and every reference to it, or the schema rejects the tool.
    setSteps(
      steps
        .filter((s) => s.id !== stepId)
        .map((s) => ({ ...s, next: s.next.filter((id) => id !== stepId) })),
    );
  };

  const patchStep = (stepId: string, patch: Partial<WorkflowStep>): void => {
    setSteps(steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)));
  };

  const toggleNext = (stepId: string, targetId: string): void => {
    setSteps(
      steps.map((s) =>
        s.id === stepId
          ? { ...s, next: s.next.includes(targetId) ? s.next.filter((id) => id !== targetId) : [...s.next, targetId] }
          : s,
      ),
    );
  };

  const layout = layoutWorkflow(steps);
  const branching = layout.columnCount > 1;

  return (
    <div className="tool-editor" data-testid="tool-editor">
      <div className="tool-editor-head">
        <span className="tdot" style={{ background: TOOL_TYPE_COLOR[tool.type] }} />
        <strong>{tool.name}</strong>
        <button type="button" onClick={onClose} aria-label="Close tool editor">
          ✕
        </button>
      </div>

      <label className="dialog-field">
        <span>Description</span>
        <textarea
          rows={2}
          defaultValue={tool.description}
          key={`${tool.id}-desc`}
          aria-label={`Description of ${tool.name}`}
          data-testid="tool-description"
          onBlur={(event) => {
            const next = event.target.value.trim();
            if (next !== '' && next !== tool.description) onChange({ description: next });
            else event.target.value = tool.description;
          }}
        />
      </label>

      <label className="dialog-field">
        <span>Type</span>
        <select
          value={tool.type}
          aria-label={`Type of ${tool.name}`}
          data-testid="tool-type"
          onChange={(event) => {
            const type = event.target.value as ToolType;
            // Steps are only valid on a workflow tool (SPEC §4), so switching
            // away has to drop them in the same patch or the schema rejects it.
            onChange(type === 'workflow' ? { type } : { type, workflow: undefined });
          }}
        >
          {TOOL_TYPES.map((type) => (
            <option key={type} value={type}>
              {TOOL_TYPE_LABEL[type]}
            </option>
          ))}
        </select>
      </label>

      {tool.type === 'workflow' && (
        <div className="wf-editor">
          <div className="wf-editor-head">
            <span>Steps</span>
            <small>
              {steps.length === 0
                ? 'none yet'
                : branching
                  ? `${steps.length} steps · branching`
                  : `${steps.length} steps · linear`}
            </small>
          </div>

          {steps.map((step) => (
            <div key={step.id} className="wf-step" data-testid="wf-step">
              <input
                className="wf-step-name"
                defaultValue={step.name}
                aria-label={`Name of step ${step.name}`}
                onBlur={(event) => {
                  const next = event.target.value.trim();
                  if (next !== '' && next !== step.name) patchStep(step.id, { name: next });
                  else event.target.value = step.name;
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
              <select
                className="lib-select"
                value={step.kind}
                aria-label={`Kind of step ${step.name}`}
                onChange={(event) => patchStep(step.id, { kind: event.target.value as WorkflowStepKind })}
              >
                {STEP_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="lib-delete"
                onClick={() => removeStep(step.id)}
                aria-label={`Delete step ${step.name}`}
              >
                ✕
              </button>

              {steps.length > 1 && (
                <div className="wf-next">
                  <small>then</small>
                  {steps
                    .filter((other) => other.id !== step.id)
                    .map((other) => (
                      <button
                        key={other.id}
                        type="button"
                        className={`wf-next-chip ${step.next.includes(other.id) ? 'on' : ''}`}
                        aria-pressed={step.next.includes(other.id)}
                        onClick={() => toggleNext(step.id, other.id)}
                      >
                        {other.name}
                      </button>
                    ))}
                </div>
              )}
            </div>
          ))}

          <div className="lib-add">
            <input
              value={draftName}
              placeholder="New step name"
              aria-label="New workflow step name"
              data-testid="wf-new-step"
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addStep();
              }}
            />
            <button type="button" onClick={addStep} disabled={draftName.trim() === ''}>
              Add step
            </button>
          </div>

          <p className="wf-hint">
            Pick more than one “then” on a step to branch — the detail card lays the arms out side
            by side.
          </p>
        </div>
      )}

      {error && (
        <p className="dialog-error" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
