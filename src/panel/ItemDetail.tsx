/**
 * SPEC 5.7 - the detail card behind every clickable panel item:
 * name, coloured type tag, description, workflow mini-DAG (SPEC 8.6), data status
 * plus linked badge, and "linked to: [Agent]…" buttons that jump-focus that agent.
 */
import { DATA_SOURCE_STATUS_LABELS } from '../model/schemas.js';
import type { Agent, DataSource, Skill, Tool } from '../model/schemas.js';
import { dataDotColor, SKILL_COLOR, STATUS_COLOR, TOOL_TYPE_COLOR, TOOL_TYPE_LABEL } from '../ui/palette.js';
import { sourceLabel } from '../model/schemas.js';
import { layoutWorkflow } from './workflowLayout.js';

type UsedBy = { agents: Agent[]; onJump: (agentId: string) => void };

function DetailHead({ name, tag, color }: { name: string; tag: string; color: string }): React.JSX.Element {
  return (
    <div className="tname">
      {name}
      <span className="ttag" style={{ color }}>
        {tag}
      </span>
    </div>
  );
}

function LinkedTo({ agents, onJump }: UsedBy): React.JSX.Element | null {
  if (agents.length === 0) return null;
  return (
    <div className="ub">
      linked to
      {agents.map((agent) => (
        <button key={agent.id} type="button" className="ubn" onClick={() => onJump(agent.id)}>
          {agent.name}
        </button>
      ))}
    </div>
  );
}

/** SPEC 8.6: rows by longest path, so both arms of a condition sit side by side. */
function WorkflowDiagram({ tool }: { tool: Tool }): React.JSX.Element | null {
  const steps = tool.workflow?.steps ?? [];
  if (steps.length === 0) return null;
  const layout = layoutWorkflow(steps);
  const rows = new Map<number, typeof layout.nodes>();
  for (const node of layout.nodes) {
    const list = rows.get(node.row);
    if (list) list.push(node);
    else rows.set(node.row, [node]);
  }

  const ordered = [...rows.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <div className="wf" data-testid="workflow-diagram">
      {ordered.map(([row, nodes], index) => (
        <div key={row}>
          {index > 0 && <div className="wfa">↓</div>}
          <div className="wfrow">
            {nodes.map((node) => (
              <div
                key={node.step.id}
                className={`wfs kind-${node.step.kind}`}
                title={`${node.step.kind}: ${node.step.name}`}
              >
                {node.step.name}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Free text about a component, shown wherever that component is inspected. */
function Notes({ notes }: { notes: string | undefined }): React.JSX.Element | null {
  if (notes === undefined || notes.trim() === '') return null;
  return (
    <div className="tnotes" data-testid="detail-notes">
      <h4>Notes</h4>
      <p>{notes}</p>
    </div>
  );
}

export function SkillDetail({ skill, usedBy }: { skill: Skill; usedBy: UsedBy }): React.JSX.Element {
  return (
    <>
      <DetailHead name={skill.name} tag="skill" color={SKILL_COLOR} />
      {skill.description && <div className="tdesc">{skill.description}</div>}
      {skill.instructions && <div className="tdesc">{skill.instructions}</div>}
      <Notes notes={skill.notes} />
      <LinkedTo {...usedBy} />
    </>
  );
}

/** Saved tool parameters are untyped JSON, so render them defensively. */
function formatParameter(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value) ?? '—';
  } catch {
    return '—';
  }
}

type ToolConfig = {
  code?: string;
  path?: string;
  language?: string;
  bytes?: number;
  inputs?: { name: string; description?: string; required?: boolean }[];
  outputs?: { name: string; description?: string }[];
  parameters?: Record<string, unknown>;
};

/** An imported script, shown as source rather than just a name. */
function ScriptBody({ config }: { config: ToolConfig }): React.JSX.Element | null {
  if (config.code === undefined) return null;
  return (
    <div className="script-body" data-testid="tool-script">
      <div className="script-head">
        <span>{config.path ?? 'script'}</span>
        {config.bytes !== undefined && <small>{config.bytes.toLocaleString()} bytes</small>}
      </div>
      <pre>
        <code>{config.code}</code>
      </pre>
    </div>
  );
}

/** A flow's inputs and outputs - what the agent has to supply and gets back. */
function Signature({ config }: { config: ToolConfig }): React.JSX.Element | null {
  const inputs = config.inputs ?? [];
  const outputs = config.outputs ?? [];
  if (inputs.length === 0 && outputs.length === 0) return null;

  return (
    <div className="signature" data-testid="tool-signature">
      {inputs.length > 0 && (
        <>
          <h4>Inputs</h4>
          {inputs.map((input) => (
            <div key={input.name} className="sig-row">
              <b>{input.name}</b>
              {input.required === true && <span className="sig-req">required</span>}
              {input.description !== undefined && <span>{input.description}</span>}
            </div>
          ))}
        </>
      )}
      {outputs.length > 0 && (
        <>
          <h4>Outputs</h4>
          {outputs.map((output) => (
            <div key={output.name} className="sig-row">
              <b>{output.name}</b>
              {output.description !== undefined && <span>{output.description}</span>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export function ToolDetail({ tool, usedBy }: { tool: Tool; usedBy: UsedBy }): React.JSX.Element {
  const config = (tool.config ?? {}) as ToolConfig;
  const parameters = Object.entries(config.parameters ?? {});

  return (
    <>
      <DetailHead name={tool.name} tag={TOOL_TYPE_LABEL[tool.type]} color={TOOL_TYPE_COLOR[tool.type]} />
      <div className="tdesc">{tool.description}</div>
      <WorkflowDiagram tool={tool} />
      <ScriptBody config={config} />
      <Signature config={config} />
      <Notes notes={tool.notes} />

      {parameters.length > 0 && (
        <div className="signature" data-testid="tool-parameters">
          <h4>Saved parameters</h4>
          {parameters.map(([key, value]) => (
            <div key={key} className="sig-row">
              <b>{key}</b>
              <span>{formatParameter(value)}</span>
            </div>
          ))}
        </div>
      )}

      <LinkedTo {...usedBy} />
    </>
  );
}

export function DataSourceDetail({
  source,
  usedBy,
}: {
  source: DataSource;
  usedBy: UsedBy;
}): React.JSX.Element {
  // SPEC 5.6: the linked badge is only meaningful once the source is Ready.
  const linkColor = source.linked ? STATUS_COLOR.live : STATUS_COLOR.building;
  return (
    <>
      <DetailHead name={source.name} tag={sourceLabel(source.type)} color={dataDotColor(source.type)} />
      <div className="tdesc">
        <span
          className="stag"
          style={{ color: STATUS_COLOR[source.status], borderColor: STATUS_COLOR[source.status] }}
        >
          {DATA_SOURCE_STATUS_LABELS[source.status]}
        </span>
        {source.status === 'live' && (
          <span className="lnk" style={{ color: linkColor, borderColor: linkColor }}>
            {source.linked ? 'linked ✓' : 'not linked yet'}
          </span>
        )}
      </div>
      {source.ref && <div className="tdesc">{source.ref}</div>}
      <Notes notes={source.notes} />
      <LinkedTo {...usedBy} />
    </>
  );
}

export function InstructionsDetail({ agent }: { agent: Agent }): React.JSX.Element {
  return (
    <>
      <DetailHead name="Instructions" tag="agent" color={SKILL_COLOR} />
      <div className="tdesc">{agent.instructions ?? 'none yet'}</div>
    </>
  );
}
