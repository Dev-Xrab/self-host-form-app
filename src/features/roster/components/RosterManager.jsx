import { useState } from "react";
import { rosterApi } from "../services/rosterApi";
import { Icons } from "../../../pages/dashboard-page/icons";
import Checkbox from "../../../components/ui/Checkbox";
import ConfirmDialog from "../../../components/Dialog/ConfirmDialog";

const norm = (s) => String(s ?? "").trim().toLowerCase();
const namesInPasteText = (text) =>
  new Set(
    text
      .split("\n")
      .map((l) => norm(l.split(",")[0]))
      .filter(Boolean)
  );

// One student per line: "Name, Student ID, Email" — ID and email are both optional, and the
// pasted text is always what the table shows: a field left blank on a re-paste clears that
// student's existing value the same way removing it from the line was meant to. studentId/email
// are sent as "" rather than omitted so an update always overwrites, never merges — otherwise a
// student whose ID was removed from the pasted list would silently keep their old one. Aliases
// aren't touched by paste at all.
async function importRosterText(text, existingStudents) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let imported = 0;

  for (const line of lines) {
    const [namePart, idPart, emailPart] = line.split(",").map((p) => p.trim());
    if (!namePart) continue;

    const payload = {
      name: namePart,
      studentId: idPart || "",
      email: emailPart || "",
    };

    const existing = existingStudents.find((s) => norm(s.name) === norm(namePart));
    if (existing) {
      await rosterApi.update(existing.id, payload);
    } else {
      await rosterApi.create(payload);
    }
    imported += 1;
  }

  return imported;
}

// The roster is what lets many differently-typed respondent names (e.g. "Jon" vs
// "Jonathan D.") fold into a single real student row in the Gradebook — a student's
// canonical name plus any aliases they might type when joining a session.
export default function RosterManager({ students, onChanged }) {
  const [pasteText, setPasteText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [importedCount, setImportedCount] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [removeError, setRemoveError] = useState(null);
  // Off by default: importRosterText only ever adds/updates the names in the pasted text, so a
  // quick "add two more students" paste never touches anyone else. Turning this on makes the
  // paste the whole roster instead of an addition to it — any existing student whose name isn't
  // in the text gets removed, which is what fixes a paste that went in malformed (like IDs typed
  // on their own line with no name) without having to hunt down and trash each bad row by hand.
  const [replaceRest, setReplaceRest] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState(null); // Student[] | null

  const runImport = async (toRemove = []) => {
    setImporting(true);
    setImportError(null);
    setImportedCount(null);
    try {
      const count = await importRosterText(pasteText, students);
      for (const student of toRemove) {
        await rosterApi.remove(student.id);
      }
      setImportedCount(count);
      // Reported per removed student (not a bare refresh) for the same reason handleRemove
      // below does it one at a time — see that comment.
      if (toRemove.length > 0) toRemove.forEach((student) => onChanged(student));
      else onChanged();
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
      setPendingRemoval(null);
    }
  };

  const handleImport = () => {
    if (importing) return;
    // An empty paste is normally a no-op (nothing to import). In replace mode it's meaningful
    // instead — "the roster is this list" with an empty list means "clear the roster" — so only
    // bail out here when that mode isn't what would make an empty paste do something.
    if (!pasteText.trim() && !replaceRest) return;
    if (replaceRest) {
      const keep = namesInPasteText(pasteText);
      const toRemove = students.filter((s) => !keep.has(norm(s.name)));
      if (toRemove.length > 0) {
        setPendingRemoval(toRemove);
        return;
      }
    }
    runImport();
  };

  const handleRemove = async (student) => {
    setRemovingId(student.id);
    setRemoveError(null);
    try {
      await rosterApi.remove(student.id);
      // Passing the removed student (name + aliases) — not just "something changed" — lets a
      // caller like GradebookPage hide that identity's row even when it's showing non-roster
      // respondents too, which a plain refetch of the roster list can't do on its own (the
      // student is already gone from the response, so there's nothing left to match against).
      onChanged(student);
    } catch (err) {
      setRemoveError(err.message);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="roster-manager">
      <div className="roster-paste-block">
        <span className="dash-form-label">Paste roster</span>
        <p className="dash-item-meta roster-paste-hint">
          One student per line: name, then optionally a student ID and email, separated by commas — e.g. "Juan
          Dela Cruz, 2021-0456, juan@school.edu".
        </p>
        <textarea
          className="dash-form-input roster-paste-textarea"
          placeholder={"Juan Dela Cruz, 2021-0456, juan@school.edu\nMaria Santos, 2021-0457"}
          value={pasteText}
          onChange={(e) => {
            setPasteText(e.target.value);
            setImportedCount(null);
          }}
          rows={4}
        />
        <Checkbox
          className="roster-replace-toggle"
          checked={replaceRest}
          onChange={(checked) => setReplaceRest(checked)}
          label="Replace roster with this list (remove students not included)"
        />
        <div className="roster-paste-actions">
          <button type="button" className="dash-primary-btn" onClick={handleImport} disabled={importing}>
            {importing ? "Importing…" : "Import Roster"}
          </button>
          {importedCount !== null && (
            <span className="dash-settings-note dash-settings-note-success">
              Added/updated {importedCount} student{importedCount === 1 ? "" : "s"}.
            </span>
          )}
        </div>
        {importError && <p className="dash-form-error">{importError}</p>}
        {students.length === 0 && (
          <p className="dash-item-meta roster-empty-note">
            No students yet. Paste your roster above — only students on this list appear in the Gradebook once a
            roster is set, and their aliases (editable via the API) let different names they type when joining a
            session fold into this one row.
          </p>
        )}
      </div>

      {students.length > 0 && (
        <div className="roster-table-wrap">
          <table className="roster-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Student ID</th>
                <th>Email</th>
                <th>Aliases</th>
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.studentId || "—"}</td>
                  <td>{s.email || "—"}</td>
                  <td>{s.aliases?.length ? s.aliases.join(", ") : "—"}</td>
                  <td className="roster-row-remove">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => handleRemove(s)}
                      disabled={removingId === s.id}
                      title={`Remove ${s.name}`}
                    >
                      <Icons.trash />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {removeError && <p className="dash-form-error">{removeError}</p>}
        </div>
      )}

      {pendingRemoval && (
        <ConfirmDialog
          title="Replace roster"
          message={
            !pasteText.trim()
              ? `The pasted list is empty — this will clear your entire roster, removing all ${students.length} student${students.length === 1 ? "" : "s"}: ${pendingRemoval.map((s) => s.name || "Unnamed").join(", ")}.`
              : `This list doesn't include ${pendingRemoval.length} student${pendingRemoval.length === 1 ? "" : "s"} currently on the roster — importing will remove ${pendingRemoval.length === 1 ? "them" : "them all"}: ${pendingRemoval.map((s) => s.name || "Unnamed").join(", ")}.`
          }
          confirmLabel="Import and remove"
          busyLabel="Importing…"
          onCancel={() => setPendingRemoval(null)}
          onConfirm={() => runImport(pendingRemoval)}
        />
      )}
    </div>
  );
}
