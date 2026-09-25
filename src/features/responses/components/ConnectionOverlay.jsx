// Full-screen blur shown while a respondent's device can't reach the server. It covers (and, via
// the page's `inert` attribute, disables) everything underneath — answers already typed stay in
// the page's state and are right there again the moment the connection returns.
export default function ConnectionOverlay() {
  return (
    <div className="connection-overlay" role="alertdialog" aria-live="assertive" aria-label="Connection lost">
      <div className="connection-overlay-card">
        <span className="connection-overlay-spinner" aria-hidden="true" />
        <h2>Connection lost</h2>
        <p>
          Can't reach the server. Stay on this page — your answers are kept, and this screen clears on its
          own as soon as you're back online.
        </p>
      </div>
    </div>
  );
}
