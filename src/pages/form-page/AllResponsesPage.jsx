import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { formsApi } from "../../features/forms/services/formsApi";
import { cloudApi } from "../../features/cloud/services/cloudApi";
import RespondentDetailModal from "../../features/sessions/components/RespondentDetailModal";
import SaveResponsesPrompt from "../../features/cloud/components/SaveResponsesPrompt";
import GoogleSyncDialog from "../../features/cloud/components/GoogleSyncDialog";
import { describeCloudError } from "../../features/cloud/utils/describeCloudError";
import { aggregateQuestion, percentOf } from "../../features/forms/utils/responseAnalytics";
import ExportResponsesDialog from "../../features/forms/components/ExportResponsesDialog";
import { useSubjects } from "../../features/subjects/hooks/useSubjects";
import { Icons } from "../dashboard-page/icons";
import "./all-responses.css";

// Bar length and label share one number (count / total), so a 40% option is a 40%-long bar —
// not scaled against the biggest option, which made every top bar look full regardless of share.
function BarRows({ entries, total }) {
  return entries.map((e) => {
    const pct = percentOf(e.count, total);
    return (
      <div className="all-responses-bar-row" key={e.label}>
        <span className="all-responses-bar-label" title={e.label}>
          {e.label}
        </span>
        <span className="all-responses-bar-track">
          <span className="all-responses-bar-fill" style={{ width: `${pct}%` }} />
        </span>
        <span className="all-responses-bar-count">
          {e.count} ({pct}%)
        </span>
      </div>
    );
  });
}

function QuestionBlock({ question, responses }) {
  const [search, setSearch] = useState("");
  const result = aggregateQuestion(question, responses);
  const { kind, total } = result;

  return (
    <div className="all-responses-question-block">
      <p className="all-responses-question-title">{question.title || "Untitled question"}</p>
      <p className="all-responses-question-meta">
        {total} response{total === 1 ? "" : "s"}
        {question.type === "checkboxes" && " · % of respondents, can add up to more than 100%"}
      </p>

      {kind === "matrix" ? (
        result.rows.length === 0 ? (
          <p className="all-responses-question-meta">No rows configured.</p>
        ) : (
          <div className="all-responses-matrix">
            {result.rows.map((row) => (
              <div className="all-responses-matrix-row" key={row.rowLabel}>
                <p className="all-responses-matrix-row-label">{row.rowLabel}</p>
                {row.total === 0 ? (
                  <p className="all-responses-question-meta">No answers yet.</p>
                ) : (
                  <BarRows entries={row.entries} total={row.total} />
                )}
              </div>
            ))}
          </div>
        )
      ) : result.entries.length === 0 ? (
        <p className="all-responses-question-meta">No answers yet.</p>
      ) : kind === "bar" || kind === "scale" ? (
        <>
          {kind === "scale" && result.stats && (
            <div className="all-responses-stats-row">
              <span>
                Average <strong>{result.stats.avg}</strong>
              </span>
              <span>
                Median <strong>{result.stats.median}</strong>
              </span>
              <span>
                Min <strong>{result.stats.min}</strong>
              </span>
              <span>
                Max <strong>{result.stats.max}</strong>
              </span>
            </div>
          )}
          <BarRows entries={result.entries} total={total} />
        </>
      ) : (
        <>
          {result.entries.length > 5 && (
            <div className="all-responses-search all-responses-search-inline">
              <Icons.search />
              <input
                type="text"
                placeholder="Search answers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
          <div className="all-responses-text-list">
            {result.entries
              .filter((text) => String(text).toLowerCase().includes(search.toLowerCase()))
              .map((text, i) => (
                <div className="all-responses-text-item" key={i}>
                  {text}
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function AllResponsesPage() {
  const { formId } = useParams();
  const [form, setForm] = useState(null);
  const [responses, setResponses] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);
  const [view, setView] = useState("respondent"); // respondent | question
  const [query, setQuery] = useState("");
  const [sessionFilter, setSessionFilter] = useState("all"); // "all" | a sessionId
  const [openResponseId, setOpenResponseId] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [changeDiff, setChangeDiff] = useState(null);
  const [applyingChanges, setApplyingChanges] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [dismissedSavePrompt, setDismissedSavePrompt] = useState(false);
  const { subjects } = useSubjects();

  const load = () => {
    setStatus("loading");
    setError(null);
    Promise.all([formsApi.get(formId), formsApi.responses(formId)])
      .then(([f, r]) => {
        setForm(f);
        setResponses(r);
        setStatus("ready");
      })
      .catch((err) => {
        setError(err.message);
        setStatus("error");
      });
  };

  useEffect(load, [formId]);

  // Checks for structural changes first (read-only) — only shows the sync decision dialog when
  // something actually changed; otherwise goes straight to a response-only sync.
  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);
    try {
      const diff = await cloudApi.checkGoogleFormChanges(formId);
      if (diff.hasChanges) {
        setChangeDiff(diff);
      } else {
        const result = await cloudApi.applyGoogleFormChanges(formId, "keep-local");
        setSyncResult(result);
        load();
      }
    } catch (err) {
      setSyncError(describeCloudError(err));
    } finally {
      setSyncing(false);
    }
  };

  const applyGoogleChanges = async (decision) => {
    setApplyingChanges(true);
    setSyncError(null);
    try {
      const result = await cloudApi.applyGoogleFormChanges(formId, decision);
      setSyncResult(result);
      setChangeDiff(null);
      load();
    } catch (err) {
      setSyncError(describeCloudError(err));
    } finally {
      setApplyingChanges(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="page-form-column all-responses-page">
        <p className="all-responses-empty">Loading responses…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="page-form-column all-responses-page">
        <p className="all-responses-empty">Couldn't load responses — {error}</p>
      </div>
    );
  }

  // Preserves first-seen order (most-recent session first, since responses arrive newest-first)
  // rather than alphabetical, so the dropdown roughly matches "most likely session you want."
  const sessionOptions = [
    ...responses
      .reduce((map, r) => {
        if (!map.has(r.sessionId)) {
          map.set(r.sessionId, { id: r.sessionId, name: r.sessionName || "Untitled session", count: 0 });
        }
        map.get(r.sessionId).count += 1;
        return map;
      }, new Map())
      .values(),
  ];
  const sessionFiltered =
    sessionFilter === "all" ? responses : responses.filter((r) => r.sessionId === sessionFilter);

  const filtered = sessionFiltered.filter((r) =>
    (r.respondentName || "").toLowerCase().includes(query.toLowerCase())
  );
  const openIndex = openResponseId ? filtered.findIndex((r) => r.id === openResponseId) : -1;
  const openDetail = openIndex >= 0 ? filtered[openIndex] : null;
  const allAnswerable = (form.questions || []).filter((q) => q.type !== "section");
  const answerableQuestions = allAnswerable.filter((q) => !q.removedAt);
  const removedQuestions = allAnswerable.filter((q) => q.removedAt);
  const subjectName = subjects.find((s) => s.id === form.subjectId)?.name;
  const selectedSessionName = sessionOptions.find((s) => s.id === sessionFilter)?.name;

  return (
    <div className="page-form-column all-responses-page">
      <div className="all-responses-header">
        <div>
          <h1 className="all-responses-title">All Responses</h1>
          <p className="all-responses-subtitle">
            {sessionFilter === "all" ? (
              <>
                {responses.length} response{responses.length === 1 ? "" : "s"} across every session for this form.
              </>
            ) : (
              <>
                {sessionFiltered.length} response{sessionFiltered.length === 1 ? "" : "s"} from "{selectedSessionName}".
              </>
            )}
          </p>
        </div>
        <div className="all-responses-header-actions">
          {sessionOptions.length > 0 && (
            <select
              className="all-responses-session-select"
              value={sessionFilter}
              onChange={(e) => setSessionFilter(e.target.value)}
            >
              <option value="all">All sessions ({responses.length})</option>
              {sessionOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.count})
                </option>
              ))}
            </select>
          )}
          {form.googleFormId && (
            <button type="button" className="all-responses-btn" disabled={syncing} onClick={handleSync}>
              <Icons.refresh />
              {syncing ? "Syncing…" : "Sync from Google"}
            </button>
          )}
          <button
            type="button"
            className="all-responses-btn"
            disabled={sessionFiltered.length === 0}
            onClick={() => setShowExport(true)}
          >
            <Icons.download />
            Export
          </button>
        </div>
      </div>

      {showExport && (
        <ExportResponsesDialog
          form={form}
          responses={sessionFiltered}
          subjectName={subjectName}
          onClose={() => setShowExport(false)}
        />
      )}

      {syncError && <p className="all-responses-error">{syncError}</p>}
      {syncResult && (
        <p className="all-responses-note">
          {syncResult.checkedResponseCount} response{syncResult.checkedResponseCount === 1 ? "" : "s"} checked —{" "}
          {syncResult.newResponseCount === 0
            ? "no new responses found."
            : `${syncResult.newResponseCount} new response${syncResult.newResponseCount === 1 ? "" : "s"} imported, ${syncResult.unchangedResponseCount} existing response${syncResult.unchangedResponseCount === 1 ? "" : "s"} unchanged.`}
        </p>
      )}

      {form.unsavedResponseCount > 0 && !dismissedSavePrompt && (
        <SaveResponsesPrompt
          count={form.unsavedResponseCount}
          onSave={async () => {
            await cloudApi.saveGoogleResponsesToCloud(formId);
            load();
          }}
          onDismiss={() => setDismissedSavePrompt(true)}
        />
      )}

      {changeDiff && (
        <GoogleSyncDialog
          diff={changeDiff}
          busy={applyingChanges}
          onCancel={() => setChangeDiff(null)}
          onKeepLocal={() => applyGoogleChanges("keep-local")}
          onSyncFromOnline={() => applyGoogleChanges("sync-from-online")}
        />
      )}

      <div className="all-responses-tabs">
        <button
          type="button"
          className={`all-responses-tab ${view === "respondent" ? "is-active" : ""}`}
          onClick={() => setView("respondent")}
        >
          By Respondent
        </button>
        <button
          type="button"
          className={`all-responses-tab ${view === "question" ? "is-active" : ""}`}
          onClick={() => setView("question")}
        >
          By Question
        </button>
      </div>

      {responses.length === 0 ? (
        <p className="all-responses-empty">No submitted responses yet.</p>
      ) : sessionFiltered.length === 0 ? (
        <p className="all-responses-empty">No responses in "{selectedSessionName}".</p>
      ) : view === "respondent" ? (
        <>
          <div className="all-responses-search">
            <Icons.search />
            <input
              type="text"
              placeholder="Search respondents..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="all-responses-table-wrap">
            <div className="all-responses-row all-responses-row-header">
              <span>Respondent</span>
              <span>Session</span>
              <span>Submitted</span>
              <span>Score</span>
              <span></span>
            </div>
            {filtered.length === 0 ? (
              <p className="all-responses-empty">No respondents match "{query}".</p>
            ) : (
              filtered.map((r) => (
                <div
                  className="all-responses-row all-responses-row-clickable"
                  key={r.id}
                  onClick={() => setOpenResponseId(r.id)}
                >
                  <span>{r.respondentName || "Anonymous"}</span>
                  <span>{r.sessionName || "Untitled session"}</span>
                  <span>{r.submittedAt ? new Date(r.submittedAt).toLocaleString() : "—"}</span>
                  <span>{r.maxScore != null ? `${r.score}/${r.maxScore}` : "—"}</span>
                  <span>View →</span>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <>
          {answerableQuestions.length === 0 ? (
            <p className="all-responses-empty">This form has no answerable questions.</p>
          ) : (
            answerableQuestions.map((q) => (
              <QuestionBlock key={q.id} question={q} responses={sessionFiltered} />
            ))
          )}

          {removedQuestions.length > 0 && (
            <details className="all-responses-removed">
              <summary>
                {removedQuestions.length} removed question{removedQuestions.length === 1 ? "" : "s"} — still
                shown historically
              </summary>
              {removedQuestions.map((q) => (
                <QuestionBlock key={q.id} question={q} responses={sessionFiltered} />
              ))}
            </details>
          )}
        </>
      )}

      {openDetail && (
        <RespondentDetailModal
          respondent={openDetail}
          onClose={() => setOpenResponseId(null)}
          onPrev={openIndex > 0 ? () => setOpenResponseId(filtered[openIndex - 1].id) : null}
          onNext={openIndex >= 0 && openIndex < filtered.length - 1 ? () => setOpenResponseId(filtered[openIndex + 1].id) : null}
          position={openIndex >= 0 ? { index: openIndex, total: filtered.length } : null}
        />
      )}
    </div>
  );
}
