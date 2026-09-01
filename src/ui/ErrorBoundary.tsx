/**
 * A crash floor for the whole app.
 *
 * Without this, one render throw white-screens the page and the user has no way
 * to get their fleet out. The fallback therefore does two things: it says what
 * happened, and it offers to download the current fleet as JSON before reloading,
 * because the store is still intact in memory even when React has given up.
 */
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { selectActiveFleet, useFleetStore } from '../store/fleetStore.js';
import { exportFleetToJson, suggestFleetFileName } from '../store/io.js';

type Props = { children: ReactNode };
type State = { error: Error | null };

function rescueFleet(): void {
  const fleet = selectActiveFleet(useFleetStore.getState());
  if (!fleet) return;
  const blob = new Blob([exportFleetToJson(fleet)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = suggestFleetFileName(fleet);
  anchor.click();
  URL.revokeObjectURL(url);
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // No telemetry backend in v1 (SPEC §1), so the console is the record.
    console.error('Agent Fleet Studio crashed:', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const hasFleet = selectActiveFleet(useFleetStore.getState()) !== undefined;

    return (
      <main className="crash" data-testid="crash-screen">
        <div className="crash-card">
          <h1>Something broke</h1>
          <p>
            The view stopped rendering. Your fleet is still in memory and still saved locally, so
            reloading should bring it back exactly as it was.
          </p>
          <pre className="crash-detail">{error.message}</pre>
          <div className="crash-actions">
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              Reload
            </button>
            {hasFleet && (
              <button type="button" className="btn ghost" onClick={rescueFleet}>
                Download this fleet first
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }
}
