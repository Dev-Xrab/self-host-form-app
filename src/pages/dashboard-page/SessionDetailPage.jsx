import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { sessionsApi } from "../../features/sessions/services/sessionsApi";
import { useSync } from "../../features/cloud/hooks/useSync";
import RespondentDetailModal from "../../features/sessions/components/RespondentDetailModal";
import ConfirmDialog from "../../components/Dialog/ConfirmDialog";
import Dialog from "../../components/Dialog/Dialog";
import EmptyState from "../../components/ui/EmptyState";
import { exportSessions } from "../../features/sessions/utils/exportSessions";
import ExportSessionsDialog from "../../features/sessions/components/ExportSessionsDialog";
import {
  formatClock,
  formatDateTime,
  respondentStatusInfo,
  secondsRemaining,
  STATUS_LABEL,
  secondsToDurationParts,
  durationPartsToSeconds,
  DURATION_DEFAULT_SECONDS,
} from "../../features/sessions/utils/time";
import { Icons } from "./icons";
import { initial } from "./Monogram";
import QrCodeThumb from "./QrCodeThumb";
import { useServerOrigin } from "./useServerOrigin";
import { useTunnel } from "../../features/tunnel/hooks/useTunnel";
import Toggle from "../../components/ui/Toggle";
import "../../features/sessions/components/session.css";
import "./session-detail.css";

const SESSION_CONFIRM_CONFIG = {
  end: {
    title: "End Session",
    message: "Stop accepting new joins for this session? Respondents already answering keep their own time limit.",
    confirmLabel: "End Session",
    busyLabel: "Ending…",
  },
  reopen: {
    title: "Reopen Session",
    message: "Reopen this session? It will accept new joins again, and scores/answers will be hidden until you end it again.",
    confirmLabel: "Reopen Session",
    busyLabel: "Reopening…",
  },
  delete: {
    title: "Delete Session",
    message: "Delete this session? This can't be undone.",
    confirmLabel: "Delete",
    busyLabel: "Deleting…",
  },
};

function RespondentTimeLeft({ deadlineAt }) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!deadlineAt) return;
    const interval = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [deadlineAt]);

  if (!deadlineAt) return <span className="dash-item-meta">No limit</span>;
  return <span className="dash-item-meta">{formatClock(secondsRemaining(deadlineAt))}</span>;
}

export default function SessionDetailPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const serverOrigin = useServerOrigin();
  const tunnel = useTunnel();
  const [publicCopied, setPublicCopied] = useState(false);
  const [session, setSession] = useState(null);
  const [respondents, setRespondents] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | not-found
  const [actionError, setActionError] = useState(null);
  const [working, setWorking] = useState(false);
  const [query, setQuery] = useState("");
  const [openResponseId, setOpenResponseId] = useState(null);
  const [openDetail, setOpenDetail] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [filter, setFilter] = useState("all"); // all | submitted | in_progress
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", durationMinutes: "" });
  const [editError, setEditError] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // null | "end" | "reopen" | "delete"
  const [togglingEditable, setTogglingEditable] = useState(false);
  const [togglingRefocusLock, setTogglingRefocusLock] = useState(false);
  const [togglingFullscreen, setTogglingFullscreen] = useState(false);
  // The duration field's own draft value+unit — kept separate from session.refocusLockSeconds so
  // typing a new value doesn't fight the input on every keystroke; committed on blur/change.
  const [refocusValueDraft, setRefocusValueDraft] = useState(String(DURATION_DEFAULT_SECONDS));
  const [refocusUnitDraft, setRefocusUnitDraft] = useState("seconds");
  const [showSyncPrompt, setShowSyncPrompt] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { status: syncStatus, sync } = useSync();

  const load = useCallback(() => {
    Promise.all([sessionsApi.get(sessionId), sessionsApi.respondents(sessionId)])
      .then(([s, r]) => {
        setSession(s);
        setRespondents(r);
        setStatus("ready");
      })
      .catch(() => setStatus("not-found"));
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  // Seeds the draft once per session (by id, not on every 5s poll refresh, so it can't clobber
  // the host mid-edit) — the toggle handler below updates it directly on its own change instead.
  useEffect(() => {
    if (!session) return;
    const { value, unit } = secondsToDurationParts(session.refocusLockSeconds);
    setRefocusValueDraft(String(value));
    setRefocusUnitDraft(unit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  useEffect(() => {
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (openResponseId == null) return;
    sessionsApi
      .respondentDetail(sessionId, openResponseId)
      .then(setOpenDetail)
      .catch(() => setOpenDetail(null));
  }, [sessionId, openResponseId]);

  if (status === "loading") return <div className="dash-content"><EmptyState description="Loading session…" /></div>;

  if (status === "not-found" || !session) {
    return (
      <>
        <header className="dash-header">
          <Link to="/dashboard/sessions" className="dash-back-link">
            <Icons.arrowLeft />
            Back to Sessions
          </Link>
        </header>
        <div className="dash-content">
          <EmptyState description="This session couldn't be found." />
        </div>
      </>
    );
  }

  const isDraft = session.status === "draft";
  const isActive = session.status === "active";
  const isEnded = session.status === "ended";

  const pendingBacklog = (syncStatus?.pendingCount || 0) + (syncStatus?.failedCount || 0);
  const canOfferSync = session.formIsCloudLinked && syncStatus?.connected && syncStatus?.reachable && pendingBacklog > 0;

  const runAction = async (fn) => {
    setWorking(true);
    setActionError(null);
    try {
      const updated = await fn();
      setSession(updated);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setWorking(false);
    }
  };

  const handleStartClick = () => {
    if (canOfferSync) setShowSyncPrompt(true);
    else runAction(() => sessionsApi.start(session.id));
  };

  const handleSyncAndStart = async () => {
    setSyncing(true);
    try {
      await sync();
    } catch {
      // Surfaced separately via the sidebar SyncStatus/SyncIssuesPanel — doesn't block starting.
    }
    setSyncing(false);
    setShowSyncPrompt(false);
    runAction(() => sessionsApi.start(session.id));
  };

  const handleStartWithoutSync = () => {
    setShowSyncPrompt(false);
    runAction(() => sessionsApi.start(session.id));
  };

  // Called by the Excel/PDF chooser; a thrown error is shown inside that dialog.
  const handleExport = async (format, { includeAnswers }) => {
    const data = await sessionsApi.exportData(session.id);
    await exportSessions(format, [data], { includeAnswers });
  };

  const handleConfirmSessionAction = async () => {
    if (confirmAction === "end") {
      setSession(await sessionsApi.end(session.id));
    } else if (confirmAction === "reopen") {
      setSession(await sessionsApi.reopen(session.id));
    } else if (confirmAction === "delete") {
      await sessionsApi.remove(session.id);
      navigate("/dashboard/sessions");
      return;
    }
    setConfirmAction(null);
  };

  const handleToggleEditable = async () => {
    setTogglingEditable(true);
    setActionError(null);
    try {
      const updated = await sessionsApi.setEditable(session.id, !session.responsesEditable);
      setSession(updated);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setTogglingEditable(false);
    }
  };

  const handleToggleRefocusLock = async () => {
    setTogglingRefocusLock(true);
    setActionError(null);
    try {
      const turningOn = !session.refocusLockSeconds;
      const seconds = turningOn ? DURATION_DEFAULT_SECONDS : null;
      const updated = await sessionsApi.setRefocusLock(session.id, seconds);
      setSession(updated);
      if (turningOn) {
        setRefocusValueDraft(String(DURATION_DEFAULT_SECONDS));
        setRefocusUnitDraft("seconds");
      }
    } catch (err) {
      setActionError(err.message);
    } finally {
      setTogglingRefocusLock(false);
    }
  };

  // Commits the duration field on blur/unit change, only while the lock is already on — a stray
  // click-away shouldn't silently turn anything on by itself.
  const commitRefocusDuration = async (nextUnit = refocusUnitDraft) => {
    const seconds = durationPartsToSeconds(refocusValueDraft, nextUnit);
    setRefocusValueDraft(String(nextUnit === "minutes" ? seconds / 60 : seconds));
    setRefocusUnitDraft(nextUnit);
    if (!session.refocusLockSeconds || seconds === session.refocusLockSeconds) return;
    setTogglingRefocusLock(true);
    setActionError(null);
    try {
      const updated = await sessionsApi.setRefocusLock(session.id, seconds);
      setSession(updated);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setTogglingRefocusLock(false);
    }
  };

  const handleToggleFullscreen = async () => {
    setTogglingFullscreen(true);
    setActionError(null);
    try {
      const updated = await sessionsApi.setFullscreenEnabled(session.id, !session.fullscreenEnabled);
      setSession(updated);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setTogglingFullscreen(false);
    }
  };

  const startEditing = () => {
    setEditForm({ name: session.name, durationMinutes: session.durationMinutes || "" });
    setEditError(null);
    setEditing(true);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    try {
      const updated = await sessionsApi.update(session.id, {
        name: editForm.name.trim(),
        durationMinutes: editForm.durationMinutes ? Number(editForm.durationMinutes) : null,
      });
      setSession(updated);
      setEditing(false);
    } catch (err) {
      setEditError(err.message);
    }
  };

  const submittedRespondents = respondents.filter((r) => r.status === "submitted");
  const inProgressRespondents = respondents.filter((r) => r.status !== "submitted");
  const filtered = respondents.filter(
    (r) =>
      (r.respondentName || "").toLowerCase().includes(query.toLowerCase()) &&
      (filter === "all" || (filter === "submitted" ? r.status === "submitted" : r.status !== "submitted"))
  );
  const scored = submittedRespondents.filter((r) => r.maxScore);
  const avgPct = scored.length
    ? Math.round((scored.reduce((sum, r) => sum + r.score / r.maxScore, 0) / scored.length) * 1000) / 10
    : null;
  const submittedShare = respondents.length ? Math.round((submittedRespondents.length / respondents.length) * 100) : 0;
  const shareUrl = `${serverOrigin}/s/${session.code}`;
  const publicShareUrl = tunnel.status === "connected" && tunnel.url ? `${tunnel.url}/s/${session.code}` : null;
  // The set the < > arrows in the detail modal step through — same rows that are clickable
  // in the table below, in the same order, so paging never lands on one that isn't viewable.
  const viewableRespondents = filtered.filter((r) => isEnded || r.status === "submitted");
  const openIndex = openResponseId ? viewableRespondents.findIndex((r) => r.id === openResponseId) : -1;

  return (
    <>
      <header className="dash-header sd-header">
        <Link to="/dashboard/sessions" className="dash-back-link">
          <Icons.arrowLeft />
          Back to Sessions
        </Link>

        <div className="sd-titlebar">
          <div className="sd-title-block">
            <div className="sd-badges">
              <span className={`sd-status sd-status-${session.status}`}>
                <span className="sd-status-dot" aria-hidden="true" />
                {STATUS_LABEL[session.status]}
              </span>
              <code className="sd-code" title="Session code">
                {session.code}
              </code>
            </div>
            <h1 className="sd-title">{session.name || "Untitled session"}</h1>
            <p className="sd-form-line">
              <Icons.fileText />
              <Link to={`/forms/${session.formId}`} className="sd-form-link">
                {session.formTitle}
              </Link>
            </p>
          </div>

          <div className="sd-actions">
            {isDraft && (
              <button type="button" className="dash-primary-btn" disabled={working} onClick={handleStartClick}>
                <Icons.play />
                Start Session
              </button>
            )}
            {isActive && (
              <button type="button" className="sd-btn sd-btn-strong" disabled={working} onClick={() => setConfirmAction("end")}>
                <Icons.square />
                End Session
              </button>
            )}
            {isEnded && (
              <button type="button" className="dash-primary-btn" disabled={working} onClick={() => setConfirmAction("reopen")}>
                <Icons.play />
                Reopen Session
              </button>
            )}
            {respondents.length > 0 && (
              <button type="button" className="sd-btn" onClick={() => setShowExport(true)}>
                <Icons.download />
                Export
              </button>
            )}
            {isDraft && (
              <button type="button" className="sd-btn" disabled={working} onClick={startEditing}>
                <Icons.pencil />
                Edit
              </button>
            )}
            <Link to={`/forms/${session.formId}`} target="_blank" rel="noreferrer" className="sd-btn">
              <Icons.fileText />
              View Form
            </Link>
            <button
              type="button"
              className="sd-btn sd-btn-icon sd-btn-danger"
              title="Delete session"
              aria-label="Delete session"
              onClick={() => setConfirmAction("delete")}
            >
              <Icons.trash />
            </button>
          </div>
        </div>

        {actionError && <p className="dash-form-error">{actionError}</p>}

        {editing && (
          <form className="dash-card session-edit-card" onSubmit={saveEdit}>
            <label className="dash-form-field">
              <span className="dash-form-label">Session name</span>
              <input
                type="text"
                className="dash-form-input"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </label>
            <label className="dash-form-field">
              <span className="dash-form-label">Time limit per respondent (minutes, optional)</span>
              <input
                type="number"
                min="1"
                className="dash-form-input"
                placeholder="No limit"
                value={editForm.durationMinutes}
                onChange={(e) => setEditForm((f) => ({ ...f, durationMinutes: e.target.value }))}
              />
            </label>
            {editError && <p className="dash-form-error">{editError}</p>}
            <div className="dash-modal-footer">
              <button type="button" className="dash-ghost-btn" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button type="submit" className="dash-primary-btn">
                Save
              </button>
            </div>
          </form>
        )}
      </header>

      <div className="dash-content sd">
        {/* ---------- Overview: numbers + how people join ---------- */}
        <div className={`sd-overview ${isEnded ? "is-ended" : ""}`}>
          <div className="sd-overview-main">
            <div className="sd-stats">
              <div className="sd-stat">
                <span className="sd-stat-label">Respondents</span>
                <strong className="sd-stat-value">{respondents.length}</strong>
                <span className="sd-stat-sub">joined this session</span>
              </div>
              <div className="sd-stat">
                <span className="sd-stat-label">Submitted</span>
                <strong className="sd-stat-value">
                  {submittedRespondents.length}
                  <small>/ {respondents.length}</small>
                </strong>
                <i className="sd-meter" aria-hidden="true">
                  <b style={{ width: `${submittedShare}%` }} />
                </i>
              </div>
              <div className="sd-stat">
                <span className="sd-stat-label">In progress</span>
                <strong className="sd-stat-value">{inProgressRespondents.length}</strong>
                <span className="sd-stat-sub">{isActive ? "answering now" : "not finished"}</span>
              </div>
              <div className="sd-stat">
                <span className="sd-stat-label">Average score</span>
                <strong className="sd-stat-value">{avgPct != null ? `${avgPct}%` : "—"}</strong>
                <span className="sd-stat-sub">{avgPct != null ? `across ${scored.length} graded` : "no graded responses"}</span>
              </div>
            </div>

            <div className="sd-card sd-details">
              <dl>
                <div>
                  <dt>Time limit</dt>
                  <dd>{session.durationMinutes ? `${session.durationMinutes} min per respondent` : "No limit"}</dd>
                </div>
                <div>
                  <dt>Started</dt>
                  <dd>{formatDateTime(session.startedAt)}</dd>
                </div>
                <div>
                  <dt>Ended</dt>
                  <dd>{formatDateTime(session.endedAt)}</dd>
                </div>
              </dl>
              <div className="sd-toggle">
                <Toggle checked={session.responsesEditable} disabled={togglingEditable} onChange={handleToggleEditable} />
                <span>
                  <strong>Allow editing after submitting</strong>
                  <em>
                    Respondents can change their answer with their edit code
                    {session.responsesEditable && !isActive ? " — only takes effect while the session is active" : ""}.
                  </em>
                </span>
              </div>

              <div className="sd-toggle">
                <Toggle
                  checked={!!session.refocusLockSeconds}
                  disabled={togglingRefocusLock}
                  onChange={handleToggleRefocusLock}
                />
                <span>
                  <strong>Lock screen when a respondent switches tabs</strong>
                  <em>Coming back to the tab holds them on a countdown before the questions reappear.</em>
                  {!!session.refocusLockSeconds && (
                    <span className="sd-toggle-duration">
                      <input
                        type="number"
                        min="1"
                        max={refocusUnitDraft === "minutes" ? 60 : 600}
                        className="sd-toggle-duration-input"
                        value={refocusValueDraft}
                        disabled={togglingRefocusLock}
                        onChange={(e) => setRefocusValueDraft(e.target.value)}
                        onBlur={() => commitRefocusDuration()}
                        aria-label="Countdown length"
                      />
                      <select
                        className="sd-toggle-duration-unit"
                        value={refocusUnitDraft}
                        disabled={togglingRefocusLock}
                        onChange={(e) => commitRefocusDuration(e.target.value)}
                        aria-label="Countdown unit"
                      >
                        <option value="seconds">seconds</option>
                        <option value="minutes">minutes</option>
                      </select>
                    </span>
                  )}
                </span>
              </div>

              <div className="sd-toggle">
                <Toggle
                  checked={!!session.fullscreenEnabled}
                  disabled={togglingFullscreen}
                  onChange={handleToggleFullscreen}
                />
                <span>
                  <strong>Fullscreen when a respondent starts answering</strong>
                  <em>
                    The respondent page tries to enter fullscreen the moment they join or resume — they can
                    still turn it on or off themselves from the toolbar either way.
                  </em>
                </span>
              </div>
            </div>
          </div>

          {!isEnded && (
            <aside className="sd-card sd-join">
              <span className="sd-join-label">Join code</span>
              <strong className="sd-join-code">{session.code}</strong>
              <div className="sd-join-link">
                <code title={shareUrl}>{shareUrl}</code>
                <button
                  type="button"
                  className="sd-btn sd-btn-sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(shareUrl).catch(() => {});
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? <Icons.check /> : <Icons.copy />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="sd-join-qr">
                <QrCodeThumb value={shareUrl} size={112} modalTitle="Scan to join session" />
                <span>Scan to join — click to enlarge</span>
              </div>

              {publicShareUrl && (
                <>
                  <span className="sd-join-label sd-join-public-label">Public link (works outside this network)</span>
                  <div className="sd-join-link">
                    <code title={publicShareUrl}>{publicShareUrl}</code>
                    <button
                      type="button"
                      className="sd-btn sd-btn-sm"
                      onClick={() => {
                        navigator.clipboard?.writeText(publicShareUrl).catch(() => {});
                        setPublicCopied(true);
                        setTimeout(() => setPublicCopied(false), 1500);
                      }}
                    >
                      {publicCopied ? <Icons.check /> : <Icons.copy />}
                      {publicCopied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="sd-join-qr">
                    <QrCodeThumb value={publicShareUrl} size={112} modalTitle="Scan to join session (public link)" />
                    <span>Scan to join from anywhere — click to enlarge</span>
                  </div>
                </>
              )}
            </aside>
          )}
        </div>

        {/* ---------- Respondents ---------- */}
        <section className="sd-card sd-respondents">
          <div className="sd-respondents-head">
            <div>
              <h2>Respondents</h2>
              {isActive && (
                <p className="sd-live">
                  <span className="sd-live-dot" aria-hidden="true" />
                  Live — refreshes every 5 seconds
                </p>
              )}
            </div>
            <div className="sd-respondents-tools">
              <div className="sd-tabs" role="tablist" aria-label="Filter respondents">
                {[
                  ["all", "All", respondents.length],
                  ["submitted", "Submitted", submittedRespondents.length],
                  ["in_progress", "In progress", inProgressRespondents.length],
                ].map(([id, label, count]) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={filter === id}
                    key={id}
                    className={`sd-tab ${filter === id ? "is-active" : ""}`}
                    onClick={() => setFilter(id)}
                  >
                    {label}
                    <span>{count}</span>
                  </button>
                ))}
              </div>
              <div className="sd-search">
                <Icons.search />
                <input
                  type="text"
                  placeholder="Search respondents"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search respondents"
                />
              </div>
            </div>
          </div>

          {!isEnded && (
            <p className="sd-note">
              A respondent's score and answers become viewable as soon as they submit. Everyone else's are
              available once this session has ended.
            </p>
          )}

          {filtered.length === 0 ? (
            <div className="sd-empty">
              <span className="sd-empty-icon">
                <Icons.users />
              </span>
              <h3>{respondents.length === 0 ? "No respondents yet" : "No respondents match"}</h3>
              <p>
                {respondents.length === 0
                  ? isDraft
                    ? "Start the session, then share the join code or link so people can join."
                    : isActive
                      ? `Share the join code ${session.code} or the link above — people show up here the moment they join.`
                      : "Nobody joined this session."
                  : "Try a different search or filter."}
              </p>
            </div>
          ) : (
            <div className="sd-table-wrap">
              <table className="sd-table">
                <thead>
                  <tr>
                    <th>Respondent</th>
                    <th>Status</th>
                    <th>Time left</th>
                    <th>Submitted</th>
                    <th>Score</th>
                    <th aria-label="Open" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const statusInfo = respondentStatusInfo(r, session);
                    const viewable = isEnded || r.status === "submitted";
                    const pct = viewable && r.maxScore ? Math.round((r.score / r.maxScore) * 1000) / 10 : null;
                    return (
                      <tr
                        key={r.id}
                        className={viewable ? "is-clickable" : ""}
                        onClick={() => viewable && setOpenResponseId(r.id)}
                      >
                        <td>
                          <span className="sd-person">
                            <span className="sd-avatar">{initial(r.respondentName || "?")}</span>
                            <span className="sd-person-name">{r.respondentName || "Anonymous"}</span>
                          </span>
                        </td>
                        <td>
                          <span className={`sd-pill sd-pill-${statusInfo.modifier}`}>{statusInfo.text}</span>
                        </td>
                        <td className="sd-muted">
                          {r.status === "in_progress" ? <RespondentTimeLeft deadlineAt={r.deadlineAt} /> : "—"}
                        </td>
                        <td className="sd-muted">{formatDateTime(r.submittedAt)}</td>
                        <td>
                          {viewable && r.score != null ? (
                            <span className="sd-score">
                              <strong>
                                {r.score}/{r.maxScore}
                              </strong>
                              {pct != null && (
                                <>
                                  <i aria-hidden="true">
                                    <b style={{ width: `${pct}%` }} />
                                  </i>
                                  <span>{pct}%</span>
                                </>
                              )}
                            </span>
                          ) : (
                            <span className="sd-muted">—</span>
                          )}
                        </td>
                        <td className="sd-open">{viewable && <>View <Icons.arrowRight /></>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {showExport && (
        <ExportSessionsDialog
          title="Export results"
          summary={`${session.name || "Untitled session"} · ${respondents.length} respondent${respondents.length === 1 ? "" : "s"}`}
          onClose={() => setShowExport(false)}
          onExport={handleExport}
        />
      )}

      {openDetail && (
        <RespondentDetailModal
          respondent={openDetail}
          onClose={() => { setOpenResponseId(null); setOpenDetail(null); }}
          onPrev={
            viewableRespondents.length > 1 && openIndex > 0
              ? () => setOpenResponseId(viewableRespondents[openIndex - 1].id)
              : null
          }
          onNext={
            viewableRespondents.length > 1 && openIndex >= 0 && openIndex < viewableRespondents.length - 1
              ? () => setOpenResponseId(viewableRespondents[openIndex + 1].id)
              : null
          }
          position={openIndex >= 0 ? { index: openIndex, total: viewableRespondents.length } : null}
        />
      )}

      {confirmAction && (
        <ConfirmDialog
          {...SESSION_CONFIRM_CONFIG[confirmAction]}
          onCancel={() => setConfirmAction(null)}
          onConfirm={handleConfirmSessionAction}
        />
      )}

      {showSyncPrompt && (
        <Dialog title="Sync before starting?" onClose={() => setShowSyncPrompt(false)}>
          <div className="dash-form">
            <p className="dash-form-label">
              This form is connected to your cloud account, and there {pendingBacklog === 1 ? "is" : "are"}{" "}
              {pendingBacklog} response{pendingBacklog === 1 ? "" : "s"} waiting to sync. Sync now, or start
              the session and sync later from the sidebar.
            </p>
            <div className="dash-modal-footer">
              <button type="button" className="dash-ghost-btn" onClick={handleStartWithoutSync} disabled={syncing}>
                Start without syncing
              </button>
              <button type="button" className="dash-primary-btn" onClick={handleSyncAndStart} disabled={syncing}>
                {syncing ? "Syncing…" : "Sync & Start"}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
