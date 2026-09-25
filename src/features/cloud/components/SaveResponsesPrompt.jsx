import { useState } from "react";
import { describeCloudError } from "../utils/describeCloudError";

// Responses fetched from Google are stored on this device first; this is the "save them to your
// cloud account too?" question. `onSave` should perform the save and resolve when done (the parent
// then clears the count); a failure is shown here and leaves the responses safely on the device.
export default function SaveResponsesPrompt({ count, onSave, onDismiss }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave();
    } catch (err) {
      setError(describeCloudError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="save-responses-prompt">
      <p className="dash-form-label">
        {count} response{count === 1 ? "" : "s"} fetched from Google {count === 1 ? "is" : "are"} saved on this
        device only. Save {count === 1 ? "it" : "them"} to your cloud account too?
      </p>
      {error && <p className="dash-form-error">{error}</p>}
      <div className="save-responses-prompt-actions">
        {onDismiss && (
          <button type="button" className="dash-ghost-btn" onClick={onDismiss} disabled={busy}>
            Not now
          </button>
        )}
        <button type="button" className="dash-primary-btn" onClick={handleSave} disabled={busy}>
          {busy ? "Saving…" : "Save to cloud"}
        </button>
      </div>
    </div>
  );
}
