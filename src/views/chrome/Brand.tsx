/**
 * The app's identity, kept to one quiet lockup in the bottom-left so it never
 * competes with the fleet for attention.
 *
 * The wordmark is the supplied Solarlux asset (the white variant shipped inside
 * the PPT Buddy skill folder), used as-is and never redrawn.
 */
export function Brand(): React.JSX.Element {
  return (
    <div className="brand" data-testid="brand">
      <img src="/logo_solarlux_weiss.png" alt="Solarlux" className="brand-logo" />
      <span className="brand-divider" aria-hidden="true" />
      <span className="brand-name">Agent Visualiser</span>
    </div>
  );
}
