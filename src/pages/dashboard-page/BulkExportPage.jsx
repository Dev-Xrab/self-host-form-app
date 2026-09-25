import { Fragment, useEffect, useMemo, useState } from "react";
import { useSessions } from "../../features/sessions/hooks/useSessions";
import { sessionsApi } from "../../features/sessions/services/sessionsApi";
import { useSubjects } from "../../features/subjects/hooks/useSubjects";
import { groupBySubjects } from "../../features/subjects/utils/groupBySubjects";
import { exportSessions } from "../../features/sessions/utils/exportSessions";
import ExportSessionsDialog from "../../features/sessions/components/ExportSessionsDialog";
import { buildRespondentMatrix, formatCellScore } from "../../features/sessions/utils/respondentMatrix";
import { formatDateTime } from "../../features/sessions/utils/time";
import { useRoster } from "../../features/roster/hooks/useRoster";
import RosterManager from "../../features/roster/components/RosterManager";
import RespondentDetailModal from "../../features/sessions/components/RespondentDetailModal";
import Checkbox from "../../components/ui/Checkbox";
import { Icons } from "./icons";
import PageHeader from "./PageHeader";
import "./bulk-export.css";

const shortDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function formatAnswer(value) {
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value)) return value.join(", ") || null;
  return String(value);
}

// One respondent's response to one session, laid out as question / answer pairs — the actual
// content, not just the fact that it exists.
function ResponseBlock({ session, response, detail, focused, onOpenFull }) {
  const score = formatCellScore(response);
  const pct = response.maxScore ? Math.round((response.score / response.maxScore) * 1000) / 10 : null;

  return (
    <section className={`bx-response ${focused ? "is-focused" : ""}`}>
      <header className="bx-response-head">
        <div className="bx-response-title">
          <strong>{session.name || "Untitled session"}</strong>
          <span>{session.formTitle}</span>
        </div>
        <div className="bx-response-meta">
          {response.submittedAt && <span>Submitted {formatDateTime(response.submittedAt)}</span>}
          {score && (
            <span className="bx-score">
              {score}
              {pct != null && ` · ${pct}%`}
            </span>
          )}
          <button type="button" className="bx-link-btn" onClick={onOpenFull}>
            Open full view
            <Icons.arrowRight />
          </button>
        </div>
      </header>

      {!detail ? (
        <p className="bx-response-loading">Loading answers…</p>
      ) : detail === "error" ? (
        <p className="bx-response-loading">Couldn't load these answers.</p>
      ) : (
        <ol className="bx-qa-list">
          {detail.breakdown.map((b, i) => {
            const answer = b.fileUrl ? "File attached" : formatAnswer(b.submittedAnswer);
            return (
              <li className="bx-qa" key={b.questionId}>
                <span className="bx-q">
                  <span className="bx-q-num">{i + 1}</span>
                  {b.title || "Untitled question"}
                </span>
                <span className={`bx-a ${answer ? "" : "is-empty"}`}>{answer || "No answer"}</span>
                {b.gradable && (
                  <span className={`bx-mark ${b.correct ? "is-correct" : "is-wrong"}`}>
                    {b.correct ? "✓ Correct" : "✕ Incorrect"} · {b.pointsEarned}/{b.points}
                    {!b.correct && formatAnswer(b.correctAnswer) && (
                      <em> — answer: {formatAnswer(b.correctAnswer)}</em>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export default function BulkExportPage() {
  const { sessions: allSessions, loading } = useSessions();
  const { subjects } = useSubjects();
  const { students, refresh: refreshRoster } = useRoster();
  const endedSessions = allSessions.filter((s) => s.status === "ended");
  const [selected, setSelected] = useState(() => new Set());
  const [showExport, setShowExport] = useState(false);
  const [sessionQuery, setSessionQuery] = useState("");
  const [respondentQuery, setRespondentQuery] = useState("");
  const [respondentsBySession, setRespondentsBySession] = useState({});
  const [fetching, setFetching] = useState(false);
  const [includeNonRoster, setIncludeNonRoster] = useState(false);
  // { rowKey, sessionId } — the respondent whose answers are expanded inline, and which of their
  // sessions to highlight (the one whose chip was clicked).
  const [expanded, setExpanded] = useState(null);
  // responseId -> full breakdown | "error"; filled lazily when a row is expanded.
  const [details, setDetails] = useState({});
  // { sessionId, responseId } — the full-screen detail modal, for the print/edit-code view.
  const [openFull, setOpenFull] = useState(null);
  const [openFullDetail, setOpenFullDetail] = useState(null);

  const searchedSessions = endedSessions.filter((s) =>
    `${s.name || ""} ${s.formTitle || ""}`.toLowerCase().includes(sessionQuery.toLowerCase())
  );
  const sections = groupBySubjects(searchedSessions, subjects, (s) => s.subjectId);
  const selectedSessions = endedSessions.filter((s) => selected.has(s.id));

  // Fetches respondents only for selected sessions not loaded yet, so ticking one more session
  // doesn't refetch the ones already on screen.
  useEffect(() => {
    const missing = selectedSessions.filter((s) => !respondentsBySession[s.id]);
    if (missing.length === 0) return;
    let cancelled = false;
    setFetching(true);
    Promise.all(missing.map((s) => sessionsApi.respondents(s.id).then((r) => [s.id, r])))
      .then((pairs) => {
        if (!cancelled) setRespondentsBySession((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, allSessions]);

  const rows = useMemo(
    () => buildRespondentMatrix({ students, sessions: selectedSessions, respondentsBySession, includeNonRoster }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [students, selected, allSessions, respondentsBySession, includeNonRoster]
  );
  const visibleRows = rows.filter((r) => r.name.toLowerCase().includes(respondentQuery.toLowerCase()));

  const responseCount = rows.reduce((n, r) => n + selectedSessions.filter((s) => r.cells[s.id]).length, 0);
  const possible = rows.length * selectedSessions.length;
  const responseRate = possible ? Math.round((responseCount / possible) * 100) : 0;

  const loadDetail = (sessionId, responseId) => {
    if (details[responseId]) return;
    sessionsApi
      .respondentDetail(sessionId, responseId)
      .then((d) => setDetails((prev) => ({ ...prev, [responseId]: d })))
      .catch(() => setDetails((prev) => ({ ...prev, [responseId]: "error" })));
  };

  const expandRow = (row, sessionId = null) => {
    // Clicking the open row's name again closes it; clicking one of its chips just moves the highlight.
    if (expanded?.rowKey === row.key && !sessionId) {
      setExpanded(null);
      return;
    }
    setExpanded({ rowKey: row.key, sessionId });
    selectedSessions.forEach((s) => {
      const response = row.cells[s.id];
      if (response) loadDetail(s.id, response.id);
    });
  };

  useEffect(() => {
    if (!openFull) {
      setOpenFullDetail(null);
      return;
    }
    let cancelled = false;
    sessionsApi
      .respondentDetail(openFull.sessionId, openFull.responseId)
      .then((d) => !cancelled && setOpenFullDetail(d))
      .catch(() => !cancelled && setOpenFull(null));
    return () => {
      cancelled = true;
    };
  }, [openFull]);

  const toggleSession = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSection = (sectionSessions) => {
    const ids = sectionSessions.map((s) => s.id);
    const allSelected = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(endedSessions.map((s) => s.id)));
  const clearAll = () => {
    setSelected(new Set());
    setExpanded(null);
  };

  // Fetches full data for the selected sessions and hands it to whichever format the host picked
  // in the dialog; the dialog shows any error thrown here.
  const handleExport = async (format, { includeAnswers }) => {
    const data = await Promise.all(selectedSessions.map((s) => sessionsApi.exportData(s.id)));
    await exportSessions(format, data, { matrix: { sessions: selectedSessions, rows }, includeAnswers });
  };

  const hasRoster = students.length > 0;
  const colCount = selectedSessions.length + 2;

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Bulk Export"
        subtitle="Choose ended sessions, see who responded to each, read anyone's answers, and export it all to one Excel workbook."
      />

      <div className="dash-content bx">
        {/* ---- Left: session picker ---- */}
        <aside className="bx-side">
          <div className="bx-card bx-picker">
            <div className="bx-card-head">
              <div>
                <h2>Sessions</h2>
                <p>
                  {selectedSessions.length} of {endedSessions.length} selected
                </p>
              </div>
              <div className="bx-head-actions">
                <button type="button" className="bx-link-btn" onClick={selectAll}>
                  Select all
                </button>
                <button type="button" className="bx-link-btn" onClick={clearAll} disabled={selected.size === 0}>
                  Clear
                </button>
              </div>
            </div>

            <div className="bx-search">
              <Icons.search />
              <input
                type="text"
                placeholder="Search sessions or forms"
                value={sessionQuery}
                onChange={(e) => setSessionQuery(e.target.value)}
                aria-label="Search sessions"
              />
            </div>

            <div className="bx-picker-list">
              {loading ? (
                <p className="bx-empty-note">Loading sessions…</p>
              ) : endedSessions.length === 0 ? (
                <p className="bx-empty-note">No ended sessions yet — results appear here once a session ends.</p>
              ) : sections.length === 0 ? (
                <p className="bx-empty-note">No sessions match "{sessionQuery}".</p>
              ) : (
                sections.map(({ subject, items: sectionSessions }) => {
                  const ids = sectionSessions.map((s) => s.id);
                  const selectedCount = ids.filter((id) => selected.has(id)).length;
                  return (
                    <div className="bx-group" key={subject?.id || "unsorted"}>
                      <div className="bx-group-head">
                        <Checkbox
                          checked={selectedCount === ids.length}
                          indeterminate={selectedCount > 0 && selectedCount < ids.length}
                          onChange={() => toggleSection(sectionSessions)}
                          label={<span className="bx-group-title">{subject?.name || "General"}</span>}
                        />
                        <span className="bx-count">{sectionSessions.length}</span>
                      </div>
                      {sectionSessions.map((s) => (
                        <div className={`bx-session ${selected.has(s.id) ? "is-selected" : ""}`} key={s.id}>
                          <Checkbox
                            className="bx-session-check"
                            checked={selected.has(s.id)}
                            onChange={() => toggleSession(s.id)}
                            label={
                              <span className="bx-session-text">
                                <span className="bx-session-name">{s.name || "Untitled session"}</span>
                                <span className="bx-session-sub">{s.formTitle}</span>
                                <span className="bx-session-sub">
                                  {plural(s.submittedCount, "response")}
                                  {(s.endedAt || s.createdAt) && ` · ${shortDate(s.endedAt || s.createdAt)}`}
                                </span>
                              </span>
                            }
                          />
                        </div>
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        {/* ---- Right: roster, results ---- */}
        <div className="bx-main">
          <div className="bx-card">
            <details className="bx-roster" open={!hasRoster}>
              <summary>
                <span className="bx-roster-title">
                  <Icons.users />
                  Roster
                </span>
                <span className="bx-count">{plural(students.length, "student")}</span>
              </summary>
              <div className="bx-roster-body">
                <RosterManager students={students} onChanged={refreshRoster} />
              </div>
            </details>
          </div>

          {selectedSessions.length === 0 ? (
            <div className="bx-card bx-empty">
              <span className="bx-empty-icon">
                <Icons.download />
              </span>
              <h3>Pick sessions to get started</h3>
              <p>
                Tick one or more sessions on the left. You'll see every respondent, whether they responded to each
                session, and can open anyone's answers right here.
              </p>
            </div>
          ) : (
            <>
              <div className="bx-stats">
                <div className="bx-stat">
                  <span>Respondents</span>
                  <strong>{rows.length}</strong>
                </div>
                <div className="bx-stat">
                  <span>Sessions</span>
                  <strong>{selectedSessions.length}</strong>
                </div>
                <div className="bx-stat">
                  <span>Responses</span>
                  <strong>{responseCount}</strong>
                </div>
                <div className="bx-stat">
                  <span>Response rate</span>
                  <strong>{responseRate}%</strong>
                  <i className="bx-meter" aria-hidden="true">
                    <b style={{ width: `${responseRate}%` }} />
                  </i>
                </div>
              </div>

              <div className="bx-card bx-results">
                <div className="bx-toolbar">
                  <div className="bx-search bx-search-inline">
                    <Icons.search />
                    <input
                      type="text"
                      placeholder="Search respondents"
                      value={respondentQuery}
                      onChange={(e) => setRespondentQuery(e.target.value)}
                      aria-label="Search respondents"
                    />
                  </div>
                  <div className="bx-toolbar-right">
                    {hasRoster && (
                      <Checkbox
                        className="bx-toggle"
                        label="Include non-roster respondents"
                        checked={includeNonRoster}
                        onChange={(checked) => setIncludeNonRoster(checked)}
                      />
                    )}
                    <button
                      type="button"
                      className="dash-primary-btn"
                      onClick={() => setShowExport(true)}
                    >
                      <Icons.download />
                      {`Export ${plural(selectedSessions.length, "session")}`}
                    </button>
                  </div>
                </div>

                <div className="bx-table-wrap">
                  {fetching && Object.keys(respondentsBySession).length === 0 ? (
                    <p className="bx-empty-note">Loading responses…</p>
                  ) : (
                    <table className="bx-table">
                      <thead>
                        <tr>
                          <th className="bx-col-name">Respondent</th>
                          {selectedSessions.map((s) => (
                            <th key={s.id} title={`${s.name || "Untitled session"} · ${s.formTitle}`}>
                              <span className="bx-th-name">{s.name || "Untitled session"}</span>
                              <span className="bx-th-sub">{s.formTitle}</span>
                            </th>
                          ))}
                          <th className="bx-col-done">Responded</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.length === 0 ? (
                          <tr>
                            <td colSpan={colCount} className="bx-empty-cell">
                              {respondentQuery
                                ? `No respondents match "${respondentQuery}".`
                                : hasRoster && !includeNonRoster
                                  ? "None of the submitted respondents match a student on the roster."
                                  : "No submitted responses in the selected sessions yet."}
                            </td>
                          </tr>
                        ) : (
                          visibleRows.map((row) => {
                            const isOpen = expanded?.rowKey === row.key;
                            const doneCount = selectedSessions.filter((s) => row.cells[s.id]).length;
                            return (
                              <Fragment key={row.key}>
                                <tr className={`bx-row ${isOpen ? "is-open" : ""}`}>
                                  <td className="bx-col-name">
                                    <button
                                      type="button"
                                      className="bx-name-btn"
                                      aria-expanded={isOpen}
                                      onClick={() => expandRow(row)}
                                      title={isOpen ? "Hide answers" : "Show answers"}
                                    >
                                      <Icons.chevronRight className={`bx-chevron ${isOpen ? "is-open" : ""}`} />
                                      <span className="bx-name-text">
                                        <span className="bx-name">{row.name}</span>
                                        {row.studentId && <span className="bx-name-sub">{row.studentId}</span>}
                                      </span>
                                      {hasRoster && !row.matched && <span className="bx-badge">Not on roster</span>}
                                    </button>
                                  </td>
                                  {selectedSessions.map((s) => {
                                    const response = row.cells[s.id];
                                    if (!response) {
                                      return (
                                        <td key={s.id} className="bx-cell">
                                          <span className="bx-chip is-none">No response</span>
                                        </td>
                                      );
                                    }
                                    const score = formatCellScore(response);
                                    return (
                                      <td key={s.id} className="bx-cell">
                                        <button
                                          type="button"
                                          className="bx-chip is-done"
                                          title={`Read ${row.name}'s answers`}
                                          onClick={() => expandRow(row, s.id)}
                                        >
                                          <Icons.check />
                                          {score || "Responded"}
                                        </button>
                                      </td>
                                    );
                                  })}
                                  <td className="bx-col-done">
                                    <span className="bx-progress">
                                      <i aria-hidden="true">
                                        <b style={{ width: `${(doneCount / selectedSessions.length) * 100}%` }} />
                                      </i>
                                      {doneCount}/{selectedSessions.length}
                                    </span>
                                  </td>
                                </tr>

                                {isOpen && (
                                  <tr className="bx-detail-row">
                                    <td colSpan={colCount}>
                                      <div className="bx-detail">
                                        {doneCount === 0 ? (
                                          <p className="bx-empty-note">
                                            {row.name} hasn't responded to any of the selected sessions.
                                          </p>
                                        ) : (
                                          selectedSessions
                                            .filter((s) => row.cells[s.id])
                                            .map((s) => (
                                              <ResponseBlock
                                                key={s.id}
                                                session={s}
                                                response={row.cells[s.id]}
                                                detail={details[row.cells[s.id].id]}
                                                focused={expanded.sessionId === s.id}
                                                onOpenFull={() =>
                                                  setOpenFull({ sessionId: s.id, responseId: row.cells[s.id].id })
                                                }
                                              />
                                            ))
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showExport && (
        <ExportSessionsDialog
          title="Export results"
          summary={`${plural(selectedSessions.length, "session")} · ${plural(rows.length, "respondent")}`}
          onClose={() => setShowExport(false)}
          onExport={handleExport}
        />
      )}

      {openFullDetail && <RespondentDetailModal respondent={openFullDetail} onClose={() => setOpenFull(null)} />}
    </>
  );
}
