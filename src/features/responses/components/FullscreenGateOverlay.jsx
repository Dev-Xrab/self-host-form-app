// Shown whenever the session requires fullscreen (session setting "fullscreenEnabled") but this
// tab currently isn't in it — a reload, pressing Esc, or the browser dropping fullscreen for any
// other reason all land here. The Fullscreen API only ever grants fullscreen from inside a real
// click, so this can't be skipped straight back into automatically; the button below is that click.
export default function FullscreenGateOverlay({ onEnter }) {
  return (
    <div className="fullscreen-gate-overlay" role="alertdialog" aria-live="assertive" aria-label="Fullscreen required">
      <div className="fullscreen-gate-card">
        <span className="fullscreen-gate-icon" aria-hidden="true">⛶</span>
        <h2>Fullscreen required</h2>
        <p>This session requires fullscreen while you're answering. Continue to re-enter it.</p>
        <button type="button" className="fullscreen-gate-btn" onClick={onEnter}>
          Continue in fullscreen
        </button>
      </div>
    </div>
  );
}
