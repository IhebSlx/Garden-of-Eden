/**
 * One rendered copy of an agent (SPEC 2.3). The class names and sizes come
 * straight from the prototype's `.card` rules so semantic zoom (SPEC 5.5) and the
 * status language (SPEC 5.6) are driven by CSS exactly as they were there.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import { STATUS_LABELS } from '../../model/schemas.js';
import type { Agent, Status } from '../../model/schemas.js';
import { DATA_TYPE_COLOR, KIND_COLOR, STATUS_COLOR, TOOL_TYPE_COLOR } from '../../ui/palette.js';
import { useFleetStore } from '../../store/fleetStore.js';
import { cardSectionKey, useUiStore } from '../../store/uiStore.js';
import type { CardSection } from '../../store/uiStore.js';


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
  /** Instance keys reachable with the arrow keys. */
  neighbours: {
    parent: string | null;
    child: string | null;
    previous: string | null;
    next: string | null;
  };
  skillNames: string[];
  tools: { name: string; type: keyof typeof TOOL_TYPE_COLOR }[];
  dataSources: { name: string; type: keyof typeof DATA_TYPE_COLOR; status: Status }[];
};

/**
 * One collapsible group of chips inside a card.
 *
 * DEVIATION from the prototype (line 787), which prints skills and tools as a
 * single unheaded row and never shows data sources at all. A real imported agent
 * carries dozens of chips, which made the card unreadable, so each kind gets a
 * header with its count and starts collapsed. The counts mean nothing is hidden -
 * you can see at a glance what an agent carries without expanding anything.
 */
function CardSectionGroup({
  agentId,
  section,
  label,
  count,
  children,
}: {
  agentId: string;
  section: CardSection;
  label: string;
  count: number;
  children: React.ReactNode;
}): React.JSX.Element | null {
  const open = useUiStore((s) => s.openCardSections[cardSectionKey(agentId, section)] === true);
  const toggle = useUiStore((s) => s.toggleCardSection);
  if (count === 0) return null;

  return (
    <div className="exg" data-testid={`card-section-${section}`} data-open={open}>
      <button
        type="button"
        className="exh nodrag"
        aria-expanded={open}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          // The card itself focuses its branch on click; a header must not.
          event.stopPropagation();
          toggle(agentId, section);
        }}
      >
        <span className="exchev" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        {label}
        <span className="exn">{count}</span>
      </button>
      {open && <div className="exl">{children}</div>}
    </div>
  );
}

export type AgentFlowNode = Node<AgentNodeData, 'agent'>;

function AgentNodeComponent({ data }: NodeProps<AgentFlowNode>): React.JSX.Element {
  const { agent, depth, sharedCount, ghosted, selected, popDelayMs, popToken, skillNames, tools } = data;
  const { dataSources } = data;
  const { instanceKey, neighbours } = data;
  const activate = useUiStore((s) => s.activate);
  const renameAgent = useFleetStore((s) => s.renameAgent);
  // SPEC 5.9: an expanding ring in the kind colour, fired by a click or a search pick.
  const burstAt = useUiStore((s) => (s.burst?.agentId === agent.id ? s.burst.at : null));
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

  /**
   * SPEC 5.8: double-click the name to rename; Enter commits, Esc cancels.
   *
   * The edit runs through React state rather than `contentEditable`. The preceding
   * click selects the agent, which re-renders this node - and a re-render would
   * reset a contentEditable span's text back to the stored name mid-typing.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  const startRename = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      setDraft(agent.name);
    },
    [agent.name],
  );

  const commitRename = useCallback(
    (commit: boolean) => {
      const next = draft?.trim() ?? '';
      if (commit && next !== '' && next !== agent.name) renameAgent(agent.id, next);
      setDraft(null);
    },
    [agent.id, agent.name, draft, renameAgent],
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

  /**
   * The board is a graph, so the arrow keys walk it: up to the parent, down to the
   * first child, left/right between siblings. Without this the whole board was
   * pointer-only and unreachable by keyboard or screen reader.
   */
  const onCardKeyDown = (event: React.KeyboardEvent): void => {
    if (editing) return;

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate(agent.id);
      return;
    }

    const target =
      event.key === 'ArrowUp'
        ? neighbours.parent
        : event.key === 'ArrowDown'
          ? neighbours.child
          : event.key === 'ArrowLeft'
            ? neighbours.previous
            : event.key === 'ArrowRight'
              ? neighbours.next
              : null;
    if (target === null) return;

    event.preventDefault();
    event.stopPropagation();
    document
      .querySelector<HTMLElement>(`[data-instance-key="${CSS.escape(target)}"]`)
      ?.focus({ preventScroll: false });
  };

  const relation =
    sharedCount > 1 ? `shared by ${sharedCount} parents` : depth === 0 ? 'top of the fleet' : '';
  const label = [agent.name, agent.role, STATUS_LABELS[agent.status], relation]
    .filter((part) => part !== '')
    .join(', ');

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
      data-instance-key={instanceKey}
      data-testid="agent-card"
      /* Ghosted copies are inert, so they must not be tab stops either. */
      tabIndex={ghosted ? -1 : 0}
      role="button"
      aria-label={label}
      aria-pressed={selected}
      onKeyDown={onCardKeyDown}
    >
      <Handle type="target" position={Position.Top} id="in" isConnectable />
      <Handle type="source" position={Position.Bottom} id="out" isConnectable />
      <Handle type="source" position={Position.Top} id="peer-out" isConnectable />

      {burstAt !== null && <span key={burstAt} className="burst" aria-hidden="true" />}

      <div className="nm">
        <i />
        {editing ? (
          <input
            /* `nodrag` keeps React Flow from turning a text drag into a node drag. */
            className="nmtext nmedit nodrag"
            value={draft}
            autoFocus
            aria-label={`Rename ${agent.name}`}
            data-testid="card-rename"
            onChange={(event) => setDraft(event.target.value)}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onBlur={() => commitRename(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitRename(true);
              } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setDraft(null);
              }
            }}
          />
        ) : (
          <span className="nmtext" onDoubleClick={startRename}>
            {agent.name}
          </span>
        )}
        {sharedCount > 1 && <span className="shx">×{sharedCount}</span>}
      </div>
      <div className="rl">{agent.role}</div>

      {(skillNames.length > 0 || tools.length > 0 || dataSources.length > 0) && (
        <div className="ext">
          <CardSectionGroup agentId={agent.id} section="skills" label="Skills" count={skillNames.length}>
            {skillNames.map((name) => (
              <span className="ec sk" key={`s-${name}`}>
                {name}
              </span>
            ))}
          </CardSectionGroup>

          <CardSectionGroup agentId={agent.id} section="tools" label="Tools" count={tools.length}>
            {tools.map((tool) => (
              <span className="ec" key={`t-${tool.name}`}>
                <span className="tdot" style={{ background: TOOL_TYPE_COLOR[tool.type] }} />
                {tool.name}
              </span>
            ))}
          </CardSectionGroup>

          <CardSectionGroup agentId={agent.id} section="data" label="Data" count={dataSources.length}>
            {dataSources.map((source) => (
              <span className="ec" key={`d-${source.name}`}>
                <span className="tdot" style={{ background: DATA_TYPE_COLOR[source.type] }} />
                {source.name}
                <span className="sdot" style={{ background: STATUS_COLOR[source.status] }} />
              </span>
            ))}
          </CardSectionGroup>
        </div>
      )}
    </div>
  );
}

export const AgentNode = memo(AgentNodeComponent);
