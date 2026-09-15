import Dialog from "../../../components/Dialog/Dialog";

// Shown instead of silently launching the OS-browser sign-in flow (or, worse, a raw API error)
// whenever a cloud/Google action is attempted while signed out — gives the host a chance to
// understand what's about to happen and back out before a new browser tab opens.
export default function GoogleAuthRequiredDialog({ onConfirm, onCancel }) {
  return (
    <Dialog title="Google account required" onClose={onCancel}>
      <div className="dash-form">
        <p className="dash-form-label">You need to sign in with Google before importing a form.</p>
        <div className="dash-modal-footer">
          <button type="button" className="dash-ghost-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="dash-primary-btn" onClick={onConfirm}>
            Sign in with Google
          </button>
        </div>
      </div>
    </Dialog>
  );
}
