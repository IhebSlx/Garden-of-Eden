/**
 * The editor for one tool, including its workflow mini-DAG (SPEC 8.6).
 */
import { selectActiveFleet, useFleetStore } from '../store/fleetStore.js';
import { ToolEditor } from './ToolEditor.js';

export function ToolFields({
  id,
  onClose,
  error,
  onError,
}: {
  id: string;
  onClose?: () => void;
  error: string | null;
  onError: (reason: string | null) => void;
}): React.JSX.Element | null {
  const fleet = useFleetStore(selectActiveFleet);
  const updateTool = useFleetStore((s) => s.updateTool);
  const tool = fleet?.tools.find((t) => t.id === id);
  if (!tool) return null;
  return (
    <ToolEditor
      tool={tool}
      error={error}
      onClose={onClose}
      onChange={(patch) => {
        const result = updateTool(id, patch);
        onError(result.ok ? null : result.reason);
      }}
    />
  );
}
