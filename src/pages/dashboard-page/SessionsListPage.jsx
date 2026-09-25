import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSessions } from "../../features/sessions/hooks/useSessions";
import { sessionsApi } from "../../features/sessions/services/sessionsApi";
import { useForms } from "../../features/forms/hooks/useForms";
import FormSearchSelect from "../../features/sessions/components/FormSearchSelect";
import { STATUS_LABEL, durationPartsToSeconds, DURATION_DEFAULT_SECONDS } from "../../features/sessions/utils/time";
import { Icons } from "./icons";
import PageHeader from "./PageHeader";
import Dialog from "../../components/Dialog/Dialog";
import Checkbox from "../../components/ui/Checkbox";
import EmptyState from "../../components/ui/EmptyState";
import "./sessions-list.css";

const emptyForm = {
  name: "",
  formId: "",
  durationMinutes: "",
  responsesEditable: false,
  fullscreenEnabled: false,
  refocusLock: false,
  refocusValue: String(DURATION_DEFAULT_SECONDS),
  refocusUnit: "seconds",
};
const FILTERS = [
  ["all", "All"],
  ["draft", "Draft"],
  ["active", "Active"],
  ["ended", "Ended"],
];

export default function SessionsListPage() {
  const { sessions, loading, error, refresh } = useSessions();
  const { forms } = useForms();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  useEffect(() => {
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const searched = sessions.filter(
    (s) =>
      s.name.toLowerCase().includes(query.toLowerCase()) ||
      s.formTitle.toLowerCase().includes(query.toLowerCase())
  );
  const filtered = filter === "all" ? searched : searched.filter((s) => s.status === filter);
  const counts = {
    all: searched.length,
    draft: searched.filter((s) => s.status === "draft").length,
    active: searched.filter((s) => s.status === "active").length,
    ended: searched.filter((s) => s.status === "ended").length,
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.formId || creating) return;

    setCreating(true);
    setCreateError(null);
    try {
      await sessionsApi.create({
        name: form.name.trim(),
        formId: form.formId,
        durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : null,
        responsesEditable: form.responsesEditable,
        fullscreenEnabled: form.fullscreenEnabled,
        refocusLockSeconds: form.refocusLock ? durationPartsToSeconds(form.refocusValue, form.refocusUnit) : null,
      });
      setForm(emptyForm);
      setShowModal(false);
      refresh();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Sessions"
        subtitle="Create and run form sessions, and monitor them while they're live."
        action={
          <button type="button" className="dash-primary-btn" onClick={() => setShowModal(true)}>
            <Icons.plus />
            Create Session
          </button>
        }
      />

      <div className="dash-content">
        <div className="dash-card sl-card">
          <div className="sl-toolbar">
            <div className="sl-tabs" role="tablist" aria-label="Filter sessions">
              {FILTERS.map(([id, label]) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={filter === id}
                  key={id}
                  className={`sl-tab ${filter === id ? "is-active" : ""}`}
                  onClick={() => setFilter(id)}
                >
                  {label}
                  <span>{counts[id]}</span>
                </button>
              ))}
            </div>
            <div className="sl-search">
              <Icons.search />
              <input
                type="text"
                placeholder="Search sessions..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <EmptyState description="Loading sessions…" />
          ) : error ? (
            <EmptyState description={`Couldn't load sessions — ${error}`} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Icons.clipboard />}
              title={searched.length === 0 ? "No sessions yet" : "No sessions match"}
              description={
                searched.length === 0
                  ? "Create one from a form to start collecting responses."
                  : "Try a different search or filter."
              }
            />
          ) : (
            <div className="sl-table-wrap">
              <table className="sl-table">
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>Status</th>
                    <th>Respondents</th>
                    <th>Time limit</th>
                    <th aria-label="Open" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((session) => (
                    <tr key={session.id}>
                      <td>
                        <span className="sl-person">
                          <span className="sl-avatar">
                            {(session.name || session.formTitle || "?").trim().charAt(0).toUpperCase()}
                          </span>
                          <span className="sl-person-text">
                            <span className="sl-person-name">{session.name || "Untitled session"}</span>
                            <span className="sl-person-sub">
                              {session.formTitle} · {session.code}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className={`sl-pill sl-pill-${session.status}`}>{STATUS_LABEL[session.status]}</span>
                      </td>
                      <td className="sl-muted">
                        {session.submittedCount + session.inProgressCount} joined
                        {session.status !== "draft" && ` · ${session.submittedCount} submitted`}
                      </td>
                      <td className="sl-muted">
                        {session.durationMinutes ? `${session.durationMinutes} min` : "No limit"}
                      </td>
                      <td className="sl-row-open">
                        <Link to={`/dashboard/sessions/${session.id}`} className="sl-open-link">
                          Open
                          <Icons.arrowRight />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <Dialog title="Create Session" onClose={() => setShowModal(false)}>
          <form className="dash-form" onSubmit={handleSubmit}>
            <label className="dash-form-field">
              <span className="dash-form-label">Session name</span>
              <input
                type="text"
                className="dash-form-input"
                placeholder="e.g. Midterm Examination"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </label>

            <label className="dash-form-field">
              <span className="dash-form-label">Attach form</span>
              <FormSearchSelect
                forms={forms}
                value={form.formId}
                onChange={(formId) => setForm((f) => ({ ...f, formId }))}
              />
            </label>

            <label className="dash-form-field">
              <span className="dash-form-label">Time limit per respondent (minutes, optional)</span>
              <input
                type="number"
                min="1"
                className="dash-form-input"
                placeholder="No limit"
                value={form.durationMinutes}
                onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))}
              />
            </label>

            <div className="dash-form-field dash-form-checkbox-field">
              <Checkbox
                checked={form.responsesEditable}
                onChange={(checked) => setForm((f) => ({ ...f, responsesEditable: checked }))}
                label={<span className="dash-form-label">Allow respondents to edit their answer after submitting</span>}
              />
            </div>

            <div className="dash-form-field dash-form-checkbox-field">
              <Checkbox
                checked={form.fullscreenEnabled}
                onChange={(checked) => setForm((f) => ({ ...f, fullscreenEnabled: checked }))}
                label={<span className="dash-form-label">Fullscreen when a respondent starts answering</span>}
              />
            </div>

            <div className="dash-form-field dash-form-checkbox-field">
              <Checkbox
                checked={form.refocusLock}
                onChange={(checked) => setForm((f) => ({ ...f, refocusLock: checked }))}
                label={
                  <span className="dash-form-label">
                    Lock the screen for a countdown when a respondent switches tabs and comes back
                  </span>
                }
              />
              {form.refocusLock && (
                <div className="sl-refocus-seconds">
                  <input
                    type="number"
                    min="1"
                    max={form.refocusUnit === "minutes" ? 60 : 600}
                    className="dash-form-input"
                    value={form.refocusValue}
                    onChange={(e) => setForm((f) => ({ ...f, refocusValue: e.target.value }))}
                    aria-label="Countdown length"
                  />
                  <select
                    className="dash-form-input"
                    value={form.refocusUnit}
                    onChange={(e) => setForm((f) => ({ ...f, refocusUnit: e.target.value }))}
                    aria-label="Countdown unit"
                  >
                    <option value="seconds">seconds</option>
                    <option value="minutes">minutes</option>
                  </select>
                </div>
              )}
            </div>

            {createError && <p className="dash-form-error">{createError}</p>}

            <div className="dash-modal-footer">
              <button type="button" className="dash-ghost-btn" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button type="submit" className="dash-primary-btn" disabled={creating || !form.formId}>
                {creating ? "Creating…" : "Create Session"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
