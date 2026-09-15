import { useEffect, useState } from "react";
import ExcelJS from "exceljs";
import { addGridSheet, triggerDownload } from "../../features/sessions/utils/export";
import { useSessions } from "../../features/sessions/hooks/useSessions";
import { sessionsApi } from "../../features/sessions/services/sessionsApi";
import { useRoster, matchStudentByName } from "../../features/roster/hooks/useRoster";
import RosterManager from "../../features/roster/components/RosterManager";
import Checkbox from "../../components/ui/Checkbox";
import { Icons } from "./icons";
import PageHeader from "./PageHeader";

const norm = (s) => String(s ?? "").trim().toLowerCase();

const average = (values) => {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
};

const percentage = (score, max) => (score != null && max ? Math.round((score / max) * 1000) / 10 : null);

// A scores[sessionId] entry existing only means "this respondent has a row for this session" —
// it doesn't mean there's a real score, e.g. a response imported from Google Forms always has
// score/maxScore stored as null (see cloud-server/google-forms/repository.js — Google gives no
// grading data). Formatting that as `null/null` was the actual bug; null here means "no score to
// show", same as no entry at all.
function formatScore(cell) {
  if (!cell || cell.score == null || cell.maxScore == null) return null;
  return `${cell.score}/${cell.maxScore}`;
}

// The same session's real scores all share one max — take the first one found rather than
// requiring the caller to have tracked it separately.
function sessionMaxScore(session, rows) {
  for (const row of rows) {
    const maxScore = row.scores[session.id]?.maxScore;
    if (maxScore != null) return maxScore;
  }
  return null;
}

// A blank cell in a spreadsheet is one bit of information ("nothing here") standing in for at
// least three different facts: this respondent never attempted this session, they did but there's
// no score to show (e.g. a Google Forms import — Google carries no grading data), or — distinct
// from both — they're a roster student who's owed a real 0 for skipping it (see the rows builder
// above). A real gradebook export needs those to read differently, not collapse into the same
// empty cell, so this writes each as its own explicit word instead of "" — and a real score stays
// a real NUMBER (not a "score/max" string) so SUM/AVERAGE/conditional formatting in Excel still
// work on the column, the same reason the Average column below is a formatted percentage, not text.
function sessionCellValue(row, sessionId) {
  const cell = row.scores[sessionId];
  if (!cell) return "Not submitted";
  if (cell.score == null || cell.maxScore == null) return "Ungraded";
  return cell.score;
}

async function exportGradebook(sessions, rows) {
  const header = ["Respondent", "Student ID", "Roster Status", ...sessions.map((s) => s.name || s.formTitle), "Average"];
  const pointsPossibleRow = [
    "Points possible",
    "",
    "",
    ...sessions.map((s) => sessionMaxScore(s, rows) ?? ""),
    "",
  ];
  const dataRows = rows.map((row) => [
    row.name,
    row.studentId || "",
    row.matched ? "Roster" : "Not on roster",
    ...sessions.map((s) => sessionCellValue(row, s.id)),
    row.averagePct != null ? row.averagePct / 100 : "No graded sessions",
  ]);
  const grid = [header, pointsPossibleRow, ...dataRows];

  const wb = new ExcelJS.Workbook();
  wb.creator = "Self Host Form";
  wb.created = new Date();
  const infoLines = [
    "Gradebook",
    `Sessions: ${sessions.length}`,
    `Respondents: ${rows.length}`,
    `Exported: ${new Date().toLocaleString()}`,
  ];
  // skipBandRows: 1 carves the "Points possible" row out of the striped respondent rows below it,
  // the same technique exportSessionsToWorkbook already uses for its "Correct Answer"/"Points"
  // answer-key rows (see features/sessions/utils/export.js buildAnswersGrid) — reused here rather
  // than reinvented.
  const sheet = addGridSheet(wb, "Gradebook", grid, { infoLines, skipBandRows: 1 });

  const headerRowIndex = sheet.rowCount - grid.length + 1;
  sheet.getRow(headerRowIndex + 1).font = { bold: true, color: { argb: "FF37352F" } };

  const averageColumn = header.length;
  for (let r = headerRowIndex + 2; r <= sheet.rowCount; r++) {
    const cell = sheet.getRow(r).getCell(averageColumn);
    if (typeof cell.value === "number") cell.numFmt = "0.0%";
  }

  const buffer = await wb.xlsx.writeBuffer();
  triggerDownload(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `gradebook-${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}

export default function GradebookPage() {
  const { sessions: allSessions, loading } = useSessions();
  const endedSessions = allSessions.filter((s) => s.status === "ended");
  const { students, refresh: refreshRoster } = useRoster();

  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [respondentsBySession, setRespondentsBySession] = useState({});
  const [fetching, setFetching] = useState(false);
  const [includeNonRoster, setIncludeNonRoster] = useState(false);
  // Names/aliases of students removed from the roster this session — a response someone already
  // submitted doesn't disappear when the roster entry does, so once "Include non-roster
  // respondents" is on it would otherwise keep showing that respondent's row, just relabeled
  // "Not on roster" instead of gone. This set is what makes removal actually mean "gone from the
  // table", not just "gone from the roster". Session-only (not persisted): a full page reload
  // has no way to tell "used to be on the roster" from "was always a guest" apart, since the
  // roster row itself is really deleted.
  const [hiddenIdentities, setHiddenIdentities] = useState(() => new Set());

  const filteredSessions = endedSessions.filter((s) =>
    `${s.name || ""} ${s.formTitle || ""}`.toLowerCase().includes(query.toLowerCase())
  );
  const selectedSessions = endedSessions.filter((s) => selectedIds.includes(s.id));

  useEffect(() => {
    if (selectedIds.length === 0) return;
    setFetching(true);
    Promise.all(selectedIds.map((id) => sessionsApi.respondents(id).then((r) => [id, r])))
      .then((pairs) => setRespondentsBySession(Object.fromEntries(pairs)))
      .finally(() => setFetching(false));
  }, [selectedIds]);

  // If a name/alias that was hidden (because its roster entry got removed) shows up on the
  // roster again — re-pasted, or a different student added under the same name — it's back to
  // being a real roster match and must stop being suppressed, or a future matched row with that
  // exact name would be wrongly hidden too.
  useEffect(() => {
    setHiddenIdentities((prev) => {
      if (prev.size === 0) return prev;
      const current = new Set();
      students.forEach((s) => {
        current.add(norm(s.name));
        (s.aliases || []).forEach((a) => current.add(norm(a)));
      });
      const next = new Set([...prev].filter((n) => !current.has(n)));
      return next.size === prev.size ? prev : next;
    });
  }, [students]);

  const toggleSession = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleRosterChanged = (removedStudent) => {
    if (removedStudent) {
      const identities = [removedStudent.name, ...(removedStudent.aliases || [])].map(norm).filter(Boolean);
      setHiddenIdentities((prev) => new Set([...prev, ...identities]));
    }
    refreshRoster();
  };

  // One row per distinct student across the selected sessions. A respondent's typed
  // name is first resolved against the roster (by exact name or alias) so that e.g.
  // "Jon" and "Jonathan D." from different sessions land in the same row; anyone not
  // on the roster still gets their own row, keyed by whatever name they typed.
  //
  // Every roster student gets a row even if they never submitted anything — a roster
  // student is a known, expected participant, so a session they skipped counts as a
  // 0 (out of that session's max), not a blank. Non-roster respondents don't get that
  // treatment since they're not a known/expected list, just whoever happened to join.
  const rows = (() => {
    const byKey = new Map();
    students.forEach((s) => {
      byKey.set(`student:${s.id}`, { name: s.name, studentId: s.studentId || "", matched: true, scores: {} });
    });

    const maxScoreBySession = {};
    selectedSessions.forEach((session) => {
      (respondentsBySession[session.id] || [])
        .filter((r) => r.status === "submitted")
        .forEach((r) => {
          const match = matchStudentByName(students, r.respondentName);
          const key = match ? `student:${match.id}` : `name:${(r.respondentName || "").trim().toLowerCase()}`;
          if (!key || key === "name:") return;
          if (!byKey.has(key)) {
            byKey.set(key, {
              name: match ? match.name : r.respondentName,
              studentId: match?.studentId || "",
              matched: !!match,
              scores: {},
            });
          }
          byKey.get(key).scores[session.id] = { score: r.score, maxScore: r.maxScore };
          if (r.maxScore != null) maxScoreBySession[session.id] = r.maxScore;
        });
    });

    byKey.forEach((row) => {
      if (!row.matched) return;
      selectedSessions.forEach((session) => {
        if (row.scores[session.id] || maxScoreBySession[session.id] == null) return;
        row.scores[session.id] = { score: 0, maxScore: maxScoreBySession[session.id] };
      });
    });

    return Array.from(byKey.values())
      .map((row) => {
        const pcts = Object.values(row.scores)
          .map((s) => percentage(s.score, s.maxScore))
          .filter((p) => p != null);
        return { ...row, averagePct: average(pcts) };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  })();

  const hasRoster = students.length > 0;
  // Scoped to the roster unless the host explicitly opts back in via the toggle — including
  // when the roster is empty (e.g. the last student was just removed), which should show an
  // empty table, not silently fall back to "show everyone" the way a `hasRoster &&` guard here
  // previously did. The hiddenIdentities filter applies either way: a respondent whose roster
  // entry was just removed shouldn't reappear just because "Include non-roster respondents" is on.
  const displayRows = (includeNonRoster ? rows : rows.filter((r) => r.matched)).filter(
    (r) => !hiddenIdentities.has(norm(r.name))
  );

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Gradebook"
        subtitle="Pick ended sessions to see and export respondent scores across them."
      />

      <div className="dash-content">
        <div className="dash-card gradebook-roster-card">
          <span className="dashboard-card-label">Roster</span>
          <div className="gradebook-roster-panel">
            <RosterManager students={students} onChanged={handleRosterChanged} />
          </div>

          <span className="dashboard-card-label">Sessions</span>
          <div className="dash-search dash-page-search gradebook-search">
            <Icons.search className="dash-search-icon" />
            <input
              type="text"
              placeholder="Search sessions..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {loading ? (
            <p className="dash-item-meta">Loading sessions…</p>
          ) : endedSessions.length === 0 ? (
            <p className="dash-empty">No ended sessions yet — scores appear here once a session ends.</p>
          ) : filteredSessions.length === 0 ? (
            <p className="dash-empty">No sessions match "{query}".</p>
          ) : (
            <div className="gradebook-session-picker">
              {filteredSessions.map((s) => (
                <div className="bulk-checkbox-row" key={s.id}>
                  <Checkbox
                    checked={selectedIds.includes(s.id)}
                    onChange={() => toggleSession(s.id)}
                    label={
                      <span className="bulk-row-text">
                        <span className="quiz-name">{s.name || "Untitled session"}</span>
                        <span className="dash-item-meta">{s.formTitle} · {s.submittedCount} submitted</span>
                      </span>
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedSessions.length > 0 && (
          <>
            <div className="dash-card bulk-export-bar">
              <span className="dash-item-meta">
                {displayRows.length} respondent{displayRows.length === 1 ? "" : "s"} across {selectedSessions.length}{" "}
                session{selectedSessions.length === 1 ? "" : "s"}
              </span>

              <div className="bulk-export-bar-actions">
                {hasRoster && (
                  <Checkbox
                    className="gradebook-roster-toggle"
                    label="Include non-roster respondents"
                    checked={includeNonRoster}
                    onChange={(checked) => setIncludeNonRoster(checked)}
                  />
                )}

                <button
                  type="button"
                  className="dash-primary-btn"
                  disabled={displayRows.length === 0}
                  onClick={() => exportGradebook(selectedSessions, displayRows)}
                >
                  <Icons.download />
                  Export
                </button>
              </div>
            </div>

            <div className="dash-card gradebook-table-wrap">
              {fetching ? (
                <p className="dash-empty">Loading scores…</p>
              ) : (
                <table className="gradebook-table">
                  <thead>
                    <tr>
                      <th>Respondent</th>
                      {selectedSessions.map((s) => (
                        <th key={s.id}>{s.name || s.formTitle}</th>
                      ))}
                      <th>Average</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.length === 0 ? (
                      <tr>
                        <td colSpan={selectedSessions.length + 2} className="dash-empty">
                          {hasRoster && !includeNonRoster
                            ? "None of the submitted respondents match a student on the roster."
                            : "No submitted responses in the selected sessions yet."}
                        </td>
                      </tr>
                    ) : (
                      displayRows.map((row) => (
                        <tr
                          key={row.matched ? `s-${row.studentId || row.name}` : row.name}
                          className={row.matched ? "" : "gradebook-row-unmatched"}
                        >
                          <td>
                            {row.name}
                            {row.matched ? (
                              <span className="gradebook-roster-badge">Roster</span>
                            ) : (
                              <span className="gradebook-roster-badge gradebook-roster-badge-muted">Not on roster</span>
                            )}
                          </td>
                          {selectedSessions.map((s) => (
                            <td key={s.id} className="gradebook-score-cell">
                              {formatScore(row.scores[s.id]) ?? "—"}
                            </td>
                          ))}
                          <td className="gradebook-score-cell gradebook-average-cell">
                            {row.averagePct != null ? `${row.averagePct}%` : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
