import Dialog from "../../../components/Dialog/Dialog";
import "./GoogleSyncDialog.css";

const SECTIONS = [
  { key: "added", label: "Added", prefix: "+" },
  { key: "modified", label: "Modified", prefix: "~" },
  { key: "removed", label: "Removed", prefix: "−" },
];

// Shown whenever a structural check (see cloudApi.checkGoogleFormChanges) finds the linked
// Google Form has changed since the last sync. Always shows the full diff inline (no separate
// "Review Changes" step) — there's nothing to hide, and a second dialog just to see what the
// first one already summarized would be one more click for no benefit.
export default function GoogleSyncDialog({ diff, busy, onKeepLocal, onSyncFromOnline, onCancel }) {
  return (
    <Dialog title="Changes detected in the online form" onClose={onCancel}>
      <div className="dash-form">
        <p className="dash-form-label">
          The linked Google Form has changed since this form was last synced. Review what's
          different, then choose how to handle it.
        </p>

        <div className="google-sync-changes">
          {SECTIONS.map(({ key, label, prefix }) =>
            diff[key].length === 0 ? null : (
              <div className="google-sync-section" key={key}>
                <span className={`google-sync-section-label google-sync-${key}`}>{label}</span>
                <ul>
                  {diff[key].map((q) => (
                    <li key={q.id}>
                      <span className="google-sync-prefix">{prefix}</span> {q.title}
                    </li>
                  ))}
                </ul>
              </div>
            )
          )}
          {diff.reordered && <p className="google-sync-note">Questions have also been reordered online.</p>}
        </div>

        {diff.skippedUnsupported?.length > 0 && (
          <p className="google-sync-note">
            {diff.skippedUnsupported.length} question{diff.skippedUnsupported.length === 1 ? "" : "s"} on the
            online form can't be imported (unsupported question type) and{" "}
            {diff.skippedUnsupported.length === 1 ? "isn't" : "aren't"} reflected above.
          </p>
        )}

        <p className="google-sync-note">
          Removing a question here never deletes its past answers — it stays visible, labeled as
          removed, in this form's response history.
        </p>

        <div className="dash-modal-footer">
          <button type="button" className="dash-ghost-btn" onClick={onKeepLocal} disabled={busy}>
            Keep Local Version
          </button>
          <button type="button" className="dash-primary-btn" onClick={onSyncFromOnline} disabled={busy}>
            {busy ? "Syncing…" : "Sync From Online"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
