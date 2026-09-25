import { useState } from "react";
import { Link } from "react-router-dom";
import { useSync } from "../../features/cloud/hooks/useSync";
import { Icons } from "./icons";
import SyncIssuesPanel from "./SyncIssuesPanel";

function timeAgo(iso) {
  if (!iso) return null;
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hr ago`;
  return `${Math.round(seconds / 86400)} d ago`;
}

// Deliberately five distinct phases, not one generic spinner — offline, online-idle, syncing,
// synced, and error each mean something different to a host deciding whether it's safe to
// close the laptop (see item 13 of the offline-first spec).
export default function SyncStatus() {
  const { status, phase, result, error, sync } = useSync();
  const [showIssues, setShowIssues] = useState(false);

  if (phase === "checking") return null;

  if (phase === "disconnected") {
    return (
      <Link to="/dashboard/settings" className="dash-sync dash-sync-disconnected">
        <Icons.cloud className="dash-sync-dot" />
        <span>Connect Google to enable sync</span>
      </Link>
    );
  }

  const pending = status?.pendingCount || 0;
  const failed = status?.failedCount || 0;
  const unsaved = status?.unsavedToCloudCount || 0;

  return (
    <div className="dash-sync">
      {showIssues && <SyncIssuesPanel onClose={() => setShowIssues(false)} />}
      <div className={`dash-sync-row dash-sync-${phase}`}>
        <span className="dash-sync-dot" aria-hidden="true" />
        <div className="dash-sync-text">
          {phase === "offline" && (
            <>
              <span className="dash-sync-label">Offline</span>
              <span className="dash-sync-detail">
                {pending > 0 ? `${pending} response${pending === 1 ? "" : "s"} waiting to sync` : "Responses save locally"}
              </span>
            </>
          )}
          {phase === "online" && (
            <>
              <span className="dash-sync-label">Online</span>
              <span className="dash-sync-detail">
                {status?.lastSyncedAt ? `Last synced ${timeAgo(status.lastSyncedAt)}` : "Never synced"}
                {pending > 0 ? ` · ${pending} pending` : ""}
                {unsaved > 0 ? ` · ${unsaved} from Google not saved to cloud` : ""}
              </span>
            </>
          )}
          {phase === "syncing" && (
            <>
              <span className="dash-sync-label">Syncing…</span>
              <span className="dash-sync-detail">Uploading and downloading changes</span>
            </>
          )}
          {phase === "synced" && result && (
            <>
              <span className="dash-sync-label">Synced</span>
              <span className="dash-sync-detail">
                {result.uploaded} uploaded · {result.downloaded} downloaded
                {result.incomplete ? " · more to sync" : ""}
              </span>
            </>
          )}
          {phase === "error" && (
            <>
              <span className="dash-sync-label">
                {result && (result.rejected?.length || result.downloadFailed?.length)
                  ? "Sync partially completed"
                  : "Sync failed"}
              </span>
              <span className="dash-sync-detail">
                {error ||
                  (result &&
                    `Uploaded ${result.uploaded}, downloaded ${result.downloaded}, ${
                      (result.rejected?.length || 0) + (result.downloadFailed?.length || 0)
                    } failed`)}
              </span>
            </>
          )}
        </div>
      </div>

      {failed > 0 && (
        <button type="button" className="dash-sync-issues-btn" onClick={() => setShowIssues(true)}>
          {failed} need{failed === 1 ? "s" : ""} attention
        </button>
      )}

      <button
        type="button"
        className="dash-sync-btn"
        disabled={phase === "syncing" || phase === "offline"}
        onClick={sync}
      >
        {phase === "syncing" ? "Syncing…" : phase === "error" ? "Retry" : "Sync"}
      </button>
    </div>
  );
}
