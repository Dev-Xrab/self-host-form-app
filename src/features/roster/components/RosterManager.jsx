import { useEffect, useRef, useState } from "react";
import { rosterApi } from "../services/rosterApi";
import ConfirmDialog from "../../../components/Dialog/ConfirmDialog";

const norm = (s) => String(s ?? "").trim().toLowerCase();
const DEBOUNCE_MS = 700;

// One student per line: "Name, Student ID, Email" — ID and email are optional. Later lines win
// over earlier ones for the same name, and a line with no name is ignored.
function parseRosterText(text) {
  const byName = new Map();
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line) => {
      const [name, studentId, email] = line.split(",").map((p) => p.trim());
      if (!name) return;
      byName.set(norm(name), { name, studentId: studentId || "", email: email || "" });
    });
  return [...byName.values()];
}

function rosterToText(students) {
  return students
    .map((s) => [s.name, s.studentId || "", s.email || ""].join(", ").replace(/(,\s*)+$/, ""))
    .join("\n");
}

// The text box IS the roster: whatever is in it after an edit is what the roster becomes. Each
// run re-reads the current roster from the server so the diff is never against a stale list.
// studentId/email are sent as "" rather than omitted so a field cleared in the text clears the
// stored value instead of silently keeping the old one; aliases aren't in the text and are left
// untouched.
async function syncRoster(text) {
  const wanted = parseRosterText(text);
  const existing = await rosterApi.list();
  const existingByName = new Map(existing.map((s) => [norm(s.name), s]));
  const wantedNames = new Set(wanted.map((w) => norm(w.name)));

  for (const w of wanted) {
    const current = existingByName.get(norm(w.name));
    if (!current) {
      await rosterApi.create(w);
    } else if ((current.studentId || "") !== w.studentId || (current.email || "") !== w.email || current.name !== w.name) {
      await rosterApi.update(current.id, w);
    }
  }
  for (const s of existing) {
    if (!wantedNames.has(norm(s.name))) await rosterApi.remove(s.id);
  }
}

// The roster is what lets many differently-typed respondent names (e.g. "Jon" vs "Jonathan D.")
// fold into a single real student row in the Bulk Export table — a student's canonical name plus
// any aliases they might type when joining a session. Edits save on their own shortly after the
// last keystroke, then `onChanged` lets the parent refresh whatever is built from the roster.
export default function RosterManager({ students, onChanged }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("idle"); // idle | saving | saved | error
  const [error, setError] = useState(null);
  const [pendingClear, setPendingClear] = useState(false);
  const edited = useRef(false);
  const timer = useRef(null);
  const running = useRef(false);
  const queued = useRef(null);

  // Mirror the stored roster into the box until the user starts typing — after that the box is
  // theirs and only their own edits change it.
  useEffect(() => {
    if (!edited.current) setText(rosterToText(students));
  }, [students]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const run = async (value) => {
    if (running.current) {
      queued.current = value;
      return;
    }
    running.current = true;
    setStatus("saving");
    setError(null);
    try {
      await syncRoster(value);
      await onChanged?.();
      setStatus("saved");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    } finally {
      running.current = false;
      if (queued.current !== null) {
        const next = queued.current;
        queued.current = null;
        run(next);
      }
    }
  };

  // Wiping the whole box while students exist is far more likely a slip than an intent, and here
  // it would delete the roster live — so that one case asks first.
  const commit = (value) => {
    if (!parseRosterText(value).length && students.length > 0) {
      setPendingClear(true);
      return;
    }
    run(value);
  };

  const handleChange = (e) => {
    const value = e.target.value;
    edited.current = true;
    setText(value);
    setStatus("idle");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      commit(value);
    }, DEBOUNCE_MS);
  };

  const handleBlur = () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    commit(text);
  };

  return (
    <div className="roster-manager">
      <div className="roster-paste-block">
        <span className="dash-form-label">Roster</span>
        <p className="dash-item-meta roster-paste-hint">
          One student per line: name, then optionally a student ID and email, separated by commas — e.g. "Juan
          Dela Cruz, 2021-0456, juan@school.edu". The table below updates as you type; a student removed from
          this list is removed from the roster.
        </p>
        <textarea
          className="dash-form-input roster-paste-textarea"
          placeholder={"Juan Dela Cruz, 2021-0456, juan@school.edu\nMaria Santos, 2021-0457"}
          value={text}
          onChange={handleChange}
          onBlur={handleBlur}
          rows={5}
        />
        <div className="roster-paste-actions">
          {status === "saving" && <span className="dash-item-meta">Saving…</span>}
          {status === "saved" && (
            <span className="dash-settings-note dash-settings-note-success">
              Saved — {students.length} student{students.length === 1 ? "" : "s"} on the roster.
            </span>
          )}
        </div>
        {error && <p className="dash-form-error">{error}</p>}
      </div>

      {pendingClear && (
        <ConfirmDialog
          title="Clear roster"
          message={`The roster box is empty — this will remove all ${students.length} student${students.length === 1 ? "" : "s"} from the roster.`}
          confirmLabel="Clear roster"
          busyLabel="Clearing…"
          onCancel={() => {
            setPendingClear(false);
            edited.current = false;
            setText(rosterToText(students));
          }}
          onConfirm={async () => {
            setPendingClear(false);
            await run("");
          }}
        />
      )}
    </div>
  );
}
