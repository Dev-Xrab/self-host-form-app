// Shown when a respondent switches away from the tab and comes back, for a host-configured
// number of seconds (session setting "refocusLockSeconds") — a deterrent against looking
// something up elsewhere mid-quiz. Unlike ConnectionOverlay's translucent blur, this fully
// covers the questions (that's the point: "before viewing them again"), not just blocks clicks.
export default function RefocusLockOverlay({ secondsLeft }) {
  return (
    <div className="refocus-lock-overlay" role="alertdialog" aria-live="assertive" aria-label="Welcome back">
      <div className="refocus-lock-card">
        <span className="refocus-lock-count">{secondsLeft}</span>
        <h2>Welcome back</h2>
        <p>You switched away from this tab. Your questions will be back in a moment.</p>
      </div>
    </div>
  );
}
