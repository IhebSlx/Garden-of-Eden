/** SPEC 5.2: `Fleet ▸ <focused agent>`, root clickable to leave focus. */
import { selectActiveFleet, useFleetStore } from '../../store/fleetStore.js';
import { useUiStore } from '../../store/uiStore.js';

export function Breadcrumb(): React.JSX.Element | null {
  const fleet = useFleetStore(selectActiveFleet);
  const focusId = useUiStore((s) => s.focusId);
  const clearFocus = useUiStore((s) => s.clearFocus);

  if (!fleet) return null;
  const focused = focusId === null ? undefined : fleet.agents.find((a) => a.id === focusId);

  return (
    <div
      className="fixed top-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[rgb(124_140_255/0.25)] bg-[rgb(16_21_42/0.6)] px-4 py-[7px] text-[12.5px] whitespace-nowrap backdrop-blur-xl"
      data-testid="breadcrumb"
    >
      <button
        type="button"
        className="cursor-pointer text-[#9db0e8] hover:text-white"
        onClick={clearFocus}
        data-testid="breadcrumb-root"
      >
        {fleet.name}
      </button>
      {focused && (
        <>
          <span className="text-[#4d5a8c]">▸</span>
          <span className="font-semibold text-white" data-testid="breadcrumb-here">
            {focused.name}
          </span>
        </>
      )}
    </div>
  );
}
