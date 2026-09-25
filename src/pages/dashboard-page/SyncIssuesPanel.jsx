import { useEffect } from "react";
import { useSyncIssues } from "../../features/cloud/hooks/useSyncIssues";
import Dialog from "../../components/Dialog/Dialog";
import EmptyState from "../../components/ui/EmptyState";

function timeAgo(iso) {
  if (!iso) return "";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hr ago`;
  return `${Math.round(seconds / 86400)} d ago`;
}

// Surfaces what SyncStatus's "N need attention" chip only ever shows as a count: which
// response failed to sync, on which form, and the actual reason — a rejected/conflicting
// response otherwise sits in 'failed' and gets silently retried forever with no way for the
// host to notice or act on it (see server/cloud/sync.js and responsesRepo.listSyncIssues).
export default function SyncIssuesPanel({ onClose }) {
  const { issues, loading, error, actingId, refresh, retry, discard } = useSyncIssues();

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Dialog title="Sync issues" onClose={onClose}>
      <div className="dash-form">
        {error && <p className="dash-form-error">{error}</p>}

        {loading ? (
          <EmptyState description="Loading…" />
        ) : issues.length === 0 ? (
          <EmptyState description="Nothing needs attention right now." />
        ) : (
          <div className="dash-sync-issues-list">
            {issues.map((issue) => (
              <div className="dash-sync-issue" key={issue.id}>
                <div className="dash-sync-issue-main">
                  <span className="dash-sync-issue-title">
                    {issue.formTitle || "Untitled form"}
                    {issue.respondentName ? ` — ${issue.respondentName}` : ""}
                  </span>
                  <span className="dash-sync-issue-meta">
                    {timeAgo(issue.submittedAt)} · retried {issue.retryCount}×
                  </span>
                  <span className="dash-sync-issue-error">{issue.syncError || "Unknown error"}</span>
                </div>
                <div className="dash-sync-issue-actions">
                  {!issue.nonRetryable && (
                    <button
                      type="button"
                      className="dash-ghost-btn"
                      disabled={actingId === issue.id}
                      onClick={() => retry(issue.id)}
                    >
                      Retry
                    </button>
                  )}
                  <button
                    type="button"
                    className="dash-ghost-btn"
                    disabled={actingId === issue.id}
                    onClick={() => discard(issue.id)}
                  >
                    Discard
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
