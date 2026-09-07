/**
 * Every agent against every box of data: the one screen that answers "can this
 * agent work yet?" for the whole fleet at once.
 *
 * A cell takes the WORST state of anything the agent needs from that box. An agent
 * needing five items where one is still owed cannot work, so the cell reads as
 * owed; showing the best state would paint green beside a blocked agent.
 */
import type { Fleet, Status } from '../../model/schemas.js';
import { coverageMatrix } from '../../model/selectors.js';
import { contactForProvider } from '../../model/selectors.js';
import { useUiStore } from '../../store/uiStore.js';
import { dataDotColor, KIND_COLOR, STATUS_COLOR } from '../../ui/palette.js';

/** Existing is solid; anything still owed is a ring, so a gap reads as a hole. */
function Cell({ needed, worst }: { needed: boolean; worst: Status | null }): React.JSX.Element {
  if (!needed || worst === null) return <span className="cov-none">·</span>;
  if (worst === 'live') {
    return <span className="cov-dot" style={{ background: STATUS_COLOR.live }} />;
  }
  return (
    <span className="cov-dot" style={{ boxShadow: `inset 0 0 0 1.5px ${STATUS_COLOR[worst]}` }} />
  );
}

export function DataCoverage({ fleet }: { fleet: Fleet }): React.JSX.Element {
  const { agents, boxes, cells } = coverageMatrix(fleet);
  const activate = useUiStore((s) => s.activate);
  const setView = useUiStore((s) => s.setView);
  const openDepartmentData = useUiStore((s) => s.openDepartmentData);

  if (boxes.length === 0) {
    return (
      <p className="data-empty" data-testid="data-coverage-empty">
        No data yet. Add an item in Libraries and link it to an agent.
      </p>
    );
  }

  return (
    <div className="covwrap" data-testid="data-coverage">
      <div
        className="covgrid"
        style={{ gridTemplateColumns: `minmax(0, 190px) repeat(${boxes.length}, minmax(0, 1fr))` }}
      >
        <div />
        {boxes.map((box) => (
          <div key={box.id} className="cov-h">
            <span className="tdot" style={{ background: dataDotColor(box.type) }} />
            {box.name}
          </div>
        ))}

        {agents.map((agent, row) => (
          <div key={agent.id} className="cov-row" style={{ display: 'contents' }}>
            <button
              type="button"
              className="cov-agent"
              data-testid="cov-agent"
              onClick={() => {
                activate(agent.id);
                setView('2d');
              }}
            >
              <span className="tdot" style={{ background: KIND_COLOR[agent.kind] }} />
              {agent.name}
            </button>
            {boxes.map((box, column) => (
              <div key={box.id} className="cov-c" data-testid="cov-cell">
                <Cell
                  needed={cells[row]?.[column]?.needed ?? false}
                  worst={cells[row]?.[column]?.worst ?? null}
                />
              </div>
            ))}
          </div>
        ))}

        <div className="cov-foot">Provided by</div>
        {boxes.map((box) => {
          const owner = (box.owner ?? '').trim();
          return (
            <div key={box.id} className="cov-foot cov-owner">
              {owner === '' ? (
                <span className="data-undecided">nobody yet</span>
              ) : (
                <button
                  type="button"
                  className="ubn"
                  data-testid="cov-owner"
                  onClick={() => openDepartmentData(owner)}
                >
                  {owner}
                </button>
              )}
            </div>
          );
        })}

        <div className="cov-sub">Ansprechpartner</div>
        {boxes.map((box) => {
          const contact = contactForProvider(fleet, box.owner);
          return (
            <div key={box.id} className="cov-sub cov-owner">
              {contact ?? '—'}
            </div>
          );
        })}
      </div>

      <div className="covlegend">
        <span>
          <span className="cov-dot" style={{ background: STATUS_COLOR.live }} /> Existing
        </span>
        <span>
          <span
            className="cov-dot"
            style={{ boxShadow: `inset 0 0 0 1.5px ${STATUS_COLOR.building}` }}
          />{' '}
          Being prepared
        </span>
        <span>
          <span
            className="cov-dot"
            style={{ boxShadow: `inset 0 0 0 1.5px ${STATUS_COLOR.planned}` }}
          />{' '}
          To be provided
        </span>
        <span>
          <span className="cov-none">·</span> Not needed
        </span>
      </div>
    </div>
  );
}
