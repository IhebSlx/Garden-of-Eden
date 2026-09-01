/**
 * One rendered copy of an agent (SPEC 2.3). The class names and sizes come
 * straight from the prototype's `.card` rules so semantic zoom (SPEC 5.5) and the
 * status language (SPEC 5.6) are driven by CSS exactly as they were there.
 */
import { memo, useCallback, useEffect, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import type { Agent } from '../../model/schemas.js';
import { KIND_COLOR, STATUS_COLOR, TOOL_TYPE_COLOR } from '../../ui/palette.js';
import { useFleetStore } from '../../store/fleetStore.js';


export type AgentNodeData = {
  agent: Agent;
  instanceKey: string;
  depth: number;
  /** Number of hierarchy parents; > 1 draws the ×N badge (SPEC 5.3). */
  sharedCount: number;
  ghosted: boolean;
  selected: boolean;
  /** Focus-cascade delay in ms, or null when this card should not pop. */
  popDelayMs: number | null;
  /** Changes on every new focus so the same delay still replays the pop. */
  popToken: number;
  skillNames: string[];
  tools: { name: string; type: keyof typeof TOOL_TYPE_COLOR }[];
};

export type AgentFlowNode = Node<AgentNodeData, 'agent'>;

function AgentNodeComponent({ data }: NodeProps<AgentFlowNode>): React.JSX.Element {
  const { agent, depth, sharedCount, ghosted, selected, popDelayMs, popToken, skillNames, tools } = data;
  const renameAgent = useFleetStore((s) => s.renameAgent);
  const nameRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Replay the pop animation whenever a new focus cascade reaches this card.
  useEffect(() => {
    const card = cardRef.current;
    if (!card || popDelayMs === null) return;
    card.classList.remove('pop');
    // Force a reflow so the animation restarts even at the same delay.
    void card.offsetWidth;
    card.style.animationDelay = `${popDelayMs}ms`;
    card.classList.add('pop');
    return () => {
      card.classList.remove('pop');
      card.style.animationDelay = '';
    };
  }, [popDelayMs, popToken]);

  /** SPEC 5.8: double-click the name to rename; Enter commits, Esc cancels. */
  const startRename = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      const span = nameRef.current;
      if (!span) return;

      span.contentEditable = 'true';
      span.focus();
      document.getSelection()?.selectAllChildren(span);

      const finish = (commit: boolean): void => {
        span.contentEditable = 'false';
        span.onblur = null;
        span.onkeydown = null;
        const next = span.textContent?.trim() ?? '';
        if (commit && next !== '' && next !== agent.name) {
          renameAgent(agent.id, next);
        } else {
          span.textContent = agent.name;
        }
      };

      span.onblur = () => finish(true);
      span.onkeydown = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key === 'Enter') {
          keyEvent.preventDefault();
          finish(true);
          span.blur();
        } else if (keyEvent.key === 'Escape') {
          keyEvent.preventDefault();
          finish(false);
          span.blur();
        }
      };
    },
    [agent.id, agent.name, renameAgent],
  );

  const className = [
    'card',
    `d${Math.min(depth, 3)}`,
    `st-${agent.status}`,
    ghosted ? 'ghost' : '',
    selected ? 'sel' : '',
    sharedCount > 1 ? 'pinned' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={cardRef}
      className={className}
      style={
        {
          '--ac': KIND_COLOR[agent.kind],
          '--st': STATUS_COLOR[agent.status],
        } as React.CSSProperties
      }
      data-agent-id={agent.id}
      data-testid="agent-card"
    >
      <Handle type="target" position={Position.Top} id="in" isConnectable />
      <Handle type="source" position={Position.Bottom} id="out" isConnectable />
      <Handle type="source" position={Position.Top} id="peer-out" isConnectable />

      <div className="nm">
        <i />
        <span
          className="nmtext"
          ref={nameRef}
          onDoubleClick={startRename}
          suppressContentEditableWarning
        >
          {agent.name}
        </span>
        {sharedCount > 1 && <span className="shx">×{sharedCount}</span>}
      </div>
      <div className="rl">{agent.role}</div>

      {(skillNames.length > 0 || tools.length > 0) && (
        <div className="ext">
          {skillNames.map((name) => (
            <span className="ec sk" key={`s-${name}`}>
              {name}
            </span>
          ))}
          {tools.map((tool) => (
            <span className="ec" key={`t-${tool.name}`}>
              <span className="tdot" style={{ background: TOOL_TYPE_COLOR[tool.type] }} />
              {tool.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export const AgentNode = memo(AgentNodeComponent);
