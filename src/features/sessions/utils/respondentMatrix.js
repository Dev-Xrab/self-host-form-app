import { matchStudentByName } from "../../roster/hooks/useRoster";

const norm = (s) => String(s ?? "").trim().toLowerCase();

// One row per distinct respondent across the selected sessions, one cell per session: the
// respondent's submitted response there, or null if they have none. A typed name is resolved
// against the roster first (exact name or alias) so "Jon" and "Jonathan D." from different
// sessions land in the same row; someone not on the roster keeps a row keyed by whatever name they
// typed. The only question this answers is "did they respond?" — there's no scoring or averaging.
//
// Every roster student gets a row even if they responded to nothing. With no roster at all,
// everyone who responded is shown (there's nothing to scope to); once there is one, non-roster
// respondents stay hidden unless `includeNonRoster` opts them back in.
export function buildRespondentMatrix({ students, sessions, respondentsBySession, includeNonRoster }) {
  const byKey = new Map();
  students.forEach((s) => {
    byKey.set(`student:${s.id}`, { key: `student:${s.id}`, name: s.name, studentId: s.studentId || "", matched: true, cells: {} });
  });

  sessions.forEach((session) => {
    (respondentsBySession[session.id] || [])
      .filter((r) => r.status === "submitted")
      .forEach((r) => {
        const match = matchStudentByName(students, r.respondentName);
        const key = match ? `student:${match.id}` : `name:${norm(r.respondentName)}`;
        if (key === "name:") return;
        if (!byKey.has(key)) {
          byKey.set(key, {
            key,
            name: r.respondentName,
            studentId: "",
            matched: false,
            cells: {},
          });
        }
        const row = byKey.get(key);
        // Respondents arrive most-recently-active first, so the first hit per session is the latest.
        if (!row.cells[session.id]) row.cells[session.id] = r;
      });
  });

  const showAll = students.length === 0 || includeNonRoster;
  return Array.from(byKey.values())
    .filter((row) => row.matched || showAll)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function formatCellScore(response) {
  if (!response || response.score == null || response.maxScore == null) return null;
  return `${response.score}/${response.maxScore}`;
}
